// Generated from src/app/js/core/ownership/offchainRegistry.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   OFF-CHAIN REGISTRY — Registro de ownership privado no Supabase

   Tabela: ownership_records (ver supabase-schema.sql)
   RLS: auth.uid() = user_id — apenas o dono lê/escreve seus registros.

   FLUXO:
   1. registerPrivateOwnership() → INSERT com JWT do usuário logado
   2. getPrivateOwnership()      → SELECT por eco1_hash (RLS filtra)
   ================================================================ */

import * as _session from '../../utils/auth/session.js';
import { CONFIG } from '../../config.js';

const getSupabaseClient = (/** @type {any} */ (_session).getSupabaseClient) as () => any;

const TABLE = CONFIG.OWNERSHIP.SUPABASE_TABLE;

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Registra um ownership record privado no Supabase.
 * O insert usa o JWT do usuário logado - RLS garante isolamento.
 *
 * @param {any} ownershipRecord - Registro completo com ownerSignature
 * @param {string} userId - UUID do usuário Supabase (auth.uid())
 * @returns {Promise<{id: string, createdAt: string}>}
 */
export async function registerPrivateOwnership(ownershipRecord: any,userId: any) {
    const client = getSupabaseClient();

    const row = {
        user_id: userId,
        eco1_hash: ownershipRecord.eco1Hash,
        owner_address: ownershipRecord.owner.address,
        owner_type: ownershipRecord.owner.type,
        owner_name: ownershipRecord.owner.name || null,
        document_hash: ownershipRecord.owner.documentHash || null,
        record_data: ownershipRecord,
        mode: ownershipRecord.mode || 'private',
    };

    const { data, error } = await client.from(TABLE).insert(row).select('id, created_at').single();

    if (error) throw new Error(`offchainRegistry: ${error.message}`);

    return { id: data.id, createdAt: data.created_at };
}

/**
 * Atualiza um registro existente com token_id e tx_hash após mint NFT.
 *
 * @param {string} registryId - UUID do registro em ownership_records
 * @param {string} tokenId
 * @param {string} txHash
 * @returns {Promise<void>}
 */
export async function updateWithNFT(registryId: any,tokenId: any,txHash: any) {
    const client = getSupabaseClient();

    const { error } = await client
        .from(TABLE)
        .update({ token_id: tokenId, tx_hash: txHash, mode: 'public' })
        .eq('id', registryId);

    if (error) throw new Error(`offchainRegistry updateWithNFT: ${error.message}`);
}

/**
 * Busca registro de ownership pelo eco1Hash.
 * Retorna null se não encontrado ou se o usuário não tem acesso (RLS).
 *
 * @param {string} eco1Hash
 * @returns {Promise<Object|null>}
 */
export async function getPrivateOwnership(eco1Hash: any) {
    const client = getSupabaseClient();

    // OPT-1: explicit columns matching insert shape + NFT update fields
    const { data, error } = await client
        .from(TABLE)
        .select(
            'id, user_id, eco1_hash, owner_address, owner_type, owner_name, document_hash, record_data, mode, token_id, tx_hash, created_at, updated_at',
        )
        .eq('eco1_hash', eco1Hash)
        .maybeSingle();

    if (error) {
        console.warn('[offchainRegistry] getPrivateOwnership error:', error.message);
        return null;
    }

    return data || null;
}

/**
 * Lista todos os registros do usuário logado (RLS filtra automaticamente).
 *
 * @returns {Promise<Array<any>>}
 */
export async function listOwnedModels() {
    const client = getSupabaseClient();

    const { data, error } = await client
        .from(TABLE)
        .select('id, eco1_hash, owner_address, owner_name, mode, token_id, created_at')
        .order('created_at', { ascending: false });

    if (error) throw new Error(`offchainRegistry listOwnedModels: ${error.message}`);

    return data || [];
}
