// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   ECBT LEDGER — Wallet balance & transaction queries
   Consultas de saldo e historico da carteira $ECBT.

   ARQUITETURA:
   - Saldo consultado via RPC ecbt_get_balance() (read) ou cache otimista
   - Debito/credito via RPCs ecbt_debit() / ecbt_credit() (write)
   - Cache de saldo em sessionStorage para offline/rapida exibicao
   - Transacoes paginadas via query direta na tabela
   ================================================================ */

import { CONFIG } from '../../config.js';

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const BALANCE_CACHE_KEY = 'ecbt-wallet-balance';
const _MICRO = CONFIG.CURRENCY?.MICRO_UNIT || 1_000_000;

// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------

/** @type {number|null} */
let _cachedBalance: any = null;
let _balanceFetchedAt = 0;

// ----------------------------------------------------------------
// PUBLIC API - Balance
// ----------------------------------------------------------------

/**
 * Get current $ECBT balance (microtokens).
 * Busca saldo atual. Usa cache se recente (< 30s).
 *
 * @param {Object} [supabase?] - Supabase client
 * @param {string} [userId?] - User ID (uses current user if omitted)
 * @returns {Promise<number>} - Balance in microtokens
 */
export async function getBalance(supabase?: any, userId?: any) {
    // Cache de 30s para evitar queries repetidas
    if (_cachedBalance !== null && Date.now() - _balanceFetchedAt < 30_000) {
        return _cachedBalance;
    }

    const client = supabase || _getSupabase();
    const uid = userId || _getCurrentUserId();

    if (!client || !uid) {
        return _getCachedBalance();
    }

    try {
        const { data, error } = await client.rpc('ecbt_get_balance', { p_user_id: uid });
        if (error) {
            console.warn('[ecbt-ledger] Balance fetch error:', error.message);
            return _getCachedBalance();
        }

        const balance = Number(data) || 0;
        _setCachedBalance(balance);
        return balance;
    } catch (err: any) {
        console.warn('[ecbt-ledger] Balance fetch exception:', err?.message || err);
        return _getCachedBalance();
    }
}

/**
 * Check if user can afford a debit.
 * Verifica se o saldo e suficiente para o debito.
 *
 * @param {number} balance - Current balance (microtokens)
 * @param {number} amount - Amount to debit (microtokens)
 * @returns {boolean}
 */
export function canDebit(balance: any, amount: any) {
    if (amount <= 0) return true;
    return balance >= amount;
}

// ----------------------------------------------------------------
// PUBLIC API - Debit/Credit
// ----------------------------------------------------------------

/**
 * Debit $ECBT from user wallet (atomic, server-side).
 * Debita $ECBT da carteira do usuario via RPC atomica.
 *
 * @param {Object} params
 * @param {number} params.amount - Amount in microtokens
 * @param {string} params.type - Transaction type
 * @param {string} [params.referenceType] - Reference entity type
 * @param {string} [params.referenceId] - Reference entity ID
 * @param {string} [params.description] - Human-readable description
 * @param {Object} [params.metadata] - Additional metadata
 * @param {Object} [supabase] - Supabase client
 * @returns {Promise<{success: boolean, new_balance?: number, tx_id?: string, error?: string}>}
 */
export async function debit({
    amount,
    type,
    referenceType,
    referenceId,
    description,
    metadata
}: any, supabase: any) {
    const client = supabase || _getSupabase();
    const uid = _getCurrentUserId();
    if (!client || !uid) return { success: false, error: 'not_authenticated' };

    try {
        const { data, error } = await client.rpc('ecbt_debit', {
            p_user_id: uid,
            p_amount: amount,
            p_type: type,
            p_ref_type: referenceType || null,
            p_ref_id: referenceId || null,
            p_description: description || null,
            p_metadata: metadata || {},
        });

        if (error) return { success: false, error: error.message };

        const result = typeof data === 'string' ? JSON.parse(data) : data;
        if (result.success) {
            _setCachedBalance(result.new_balance);
            _dispatchBalanceChanged(result.new_balance);
        }
        return result;
    } catch (err) {
        return { success: false, error: (err as any).message };
    }
}

/**
 * Credit $ECBT to user wallet (atomic, server-side).
 * Credita $ECBT na carteira do usuario via RPC atomica.
 *
 * @param {{amount:number, type:string, referenceType?:string, referenceId?:string, description?:string, metadata?:any}} params - Same as debit()
 * @param {Object} [supabase] - Supabase client
 * @returns {Promise<{success: boolean, new_balance?: number, tx_id?: string, error?: string}>}
 */
export async function credit({
    amount,
    type,
    referenceType,
    referenceId,
    description,
    metadata
}: any, supabase: any) {
    const client = supabase || _getSupabase();
    const uid = _getCurrentUserId();
    if (!client || !uid) return { success: false, error: 'not_authenticated' };

    try {
        const { data, error } = await client.rpc('ecbt_credit', {
            p_user_id: uid,
            p_amount: amount,
            p_type: type,
            p_ref_type: referenceType || null,
            p_ref_id: referenceId || null,
            p_description: description || null,
            p_metadata: metadata || {},
        });

        if (error) return { success: false, error: error.message };

        const result = typeof data === 'string' ? JSON.parse(data) : data;
        if (result.success) {
            _setCachedBalance(result.new_balance);
            _dispatchBalanceChanged(result.new_balance);
        }
        return result;
    } catch (err) {
        return { success: false, error: (err as any).message };
    }
}

// ----------------------------------------------------------------
// PUBLIC API - Transactions
// ----------------------------------------------------------------

/**
 * Fetch transaction history for current user.
 * Busca historico de transacoes do usuario.
 *
 * @param {Object} [options]
 * @param {number} [options.limit=20] - Max transactions
 * @param {number} [options.offset=0] - Pagination offset
 * @param {Object} [supabase] - Supabase client
 * @returns {Promise<Array<any>>} - Transaction list (newest first)
 */
export async function getTransactions({ limit = 20, offset = 0 } = {}, supabase?: any) {
    const client = supabase || _getSupabase();
    const uid = _getCurrentUserId();
    if (!client || !uid) return [];

    try {
        // Fonte REAL do ledger (anti tabela-fantasma, BUG-002/LEDGER-GHOST):
        // view owner-only public.my_ledger_transactions (migration
        // 20260716170000) sobre ecbt.radar_token_transactions →
        // radar_access_grants.grantee_user_id = auth.uid(). A view já é
        // chaveada no usuário autenticado — nenhum filtro client-side de uid.
        const { data, error } = await client
            .from('my_ledger_transactions')
            .select('id, type, amount, balance_after, reference_type, description, metadata, created_at')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.warn('[ecbt-ledger] Transactions fetch error:', error.message);
            return [];
        }
        return data || [];
    } catch (err: any) {
        console.warn('[ecbt-ledger] Transactions exception:', err?.message || err);
        return [];
    }
}

/**
 * Force refresh balance from server.
 * Forca atualizacao do saldo ignorando cache.
 *
 * @param {Object} [supabase]
 * @returns {Promise<number>}
 */
export async function refreshBalance(supabase: any) {
    _cachedBalance = null;
    _balanceFetchedAt = 0;
    return getBalance(supabase);
}

/**
 * Clear all local wallet state (on logout).
 * Limpa cache local ao deslogar.
 */
export function clearWalletState() {
    _cachedBalance = null;
    _balanceFetchedAt = 0;
    try {
        sessionStorage.removeItem(BALANCE_CACHE_KEY);
    } catch (e: any) {
        console.debug('[ecbtLedger] clearCache:', e?.message || e);
        /* noop */
    }
}

// ----------------------------------------------------------------
// PRIVATE
// ----------------------------------------------------------------

function _getCachedBalance() {
    if (_cachedBalance !== null) return _cachedBalance;
    try {
        const stored = sessionStorage.getItem(BALANCE_CACHE_KEY) || '';
        return stored ? Number(stored) : 0;
    } catch (e: any) {
        console.debug('[ecbtLedger] readCache:', e?.message || e);
        return 0;
    }
}

/** @param {any} balance */
function _setCachedBalance(balance: any) {
    _cachedBalance = balance;
    _balanceFetchedAt = Date.now();
    try {
        sessionStorage.setItem(BALANCE_CACHE_KEY, String(balance));
    } catch (e: any) {
        console.debug('[ecbtLedger] writeCache:', e?.message || e);
        /* noop */
    }
}

/** @param {any} newBalance */
function _dispatchBalanceChanged(newBalance: any) {
    window.dispatchEvent(
        new CustomEvent('ecbtBalanceChanged', {
            detail: { balance: newBalance },
        }),
    );
}

function _getSupabase() {
    try {
        return (window as any).__ecbyts_supabase_client || null;
    } catch (e: any) {
        console.debug('[ecbtLedger] supabase-client-access:', e?.message || e);
        return null;
    }
}

function _getCurrentUserId() {
    try {
        return (window as any).__ecbyts_current_user_id || null;
    } catch (e: any) {
        console.debug('[ecbtLedger] userId-access:', e?.message || e);
        return null;
    }
}
