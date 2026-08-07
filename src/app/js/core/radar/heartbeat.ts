// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RADAR HEARTBEAT — Manter broadcasts ativos para free tier
   Atualiza last_heartbeat a cada 60s no Supabase.
   Se heartbeat parar por >2min, broadcasts expiram (RLS policy).

   Heartbeat e por modelo, nao por broadcast (decisao D5 do ADR).
   Um modelo com 3 broadcasts recebe 1 heartbeat que atualiza todos.
   ================================================================ */

const HEARTBEAT_INTERVAL_MS = 60000; // 60 segundos

/** modelId -> intervalId */
const _intervals = new Map<string, number>();

let _unloadRegistered: boolean = false;

/** @type {any} */
let _cachedClient: any = null;

/** @type {string | null} */
let _cachedUserId: string | null = null;

/** @type {(() => string | null) | null} */
let _getAccessToken: (() => string | null) | null = null;

// ----------------------------------------------------------------
// HEARTBEAT LIFECYCLE
// ----------------------------------------------------------------

/**
 * Inicia heartbeat para um modelo (todos os broadcasts desse modelo).
 * Se ja houver um heartbeat ativo para este modelo, nao duplica.
 *
 * @param {string} modelId - UUID do modelo
 * @param {object} supabaseClient - Cliente Supabase
 * @param {string} userId - UUID do usuario
 * @param {() => (string | null)} [getAccessToken?] - Getter do JWT atual do usuario autenticado
 */
export function startHeartbeat(
    modelId: string,
    supabaseClient: object,
    userId: string,
    getAccessToken?: () => string | null,
): void {
    if (_intervals.has(modelId)) return; // Ja ativo

    _cachedClient = supabaseClient;
    _cachedUserId = userId;
    _getAccessToken = typeof getAccessToken === 'function' ? getAccessToken : null;

    const tick = async () => {
        if (!_cachedClient) return;
        try {
            await _cachedClient
                .from('model_radar')
                .update({ last_heartbeat: new Date().toISOString() })
                .eq('model_id', modelId)
                .eq('owner_id', _cachedUserId)
                .is('deactivated_at', null);
        } catch (e: any) {
            console.debug('[radar-heartbeat] update-cycle:', e?.message || e);
            // Falha silenciosa - retry no proximo ciclo
        }
    };

    // Primeira execucao imediata (timestamp ja definido no INSERT)
    const intervalId = setInterval(tick, HEARTBEAT_INTERVAL_MS) as unknown as number;
    _intervals.set(modelId, intervalId);

    // Registrar pagehide apenas uma vez; beforeunload quebra bfcache.
    if (!_unloadRegistered) {
        _unloadRegistered = true;
        window.addEventListener('pagehide', _onPageHide);
    }
}

/**
 * Para heartbeat de um modelo especifico.
 *
 * @param modelId - UUID do modelo
 */
export function stopHeartbeat(modelId: string): void {
    const intervalId = _intervals.get(modelId);
    if (intervalId) {
        clearInterval(intervalId);
        _intervals.delete(modelId);
    }
}

/**
 * Para todos os heartbeats ativos.
 * Chamado no logout ou cleanup.
 */
export function stopAllHeartbeats(): void {
    for (const [_modelId, intervalId] of _intervals) {
        clearInterval(intervalId);
    }
    _intervals.clear();
}

// ----------------------------------------------------------------
// PAGEHIDE - best-effort deactivate
// ----------------------------------------------------------------

/**
 * Handler de pagehide - tenta desativar broadcasts do free tier.
 * Usa fetch com keepalive para garantir que a requisicao sobrevive
 * ao fechamento da tab.
 * @private
 */
function _onPageHide(): void {
    if (_intervals.size === 0 || !_cachedClient || !_cachedUserId) return;

    // Best-effort: marcar todos como desativados via REST API
    // Supabase REST endpoint para UPDATE model_radar
    try {
        const url = _cachedClient.supabaseUrl || '';
        const key = _cachedClient.supabaseKey || '';
        const accessToken = _getAccessToken?.() || '';

        if (!url || !key || !accessToken) return;

        const restUrl = `${url}/rest/v1/model_radar?owner_id=eq.${_cachedUserId}&deactivated_at=is.null&is_persistent=eq.false`;

        // Fire-and-forget com keepalive
        fetch(restUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                apikey: key,
                Authorization: `Bearer ${accessToken}`,
                Prefer: 'return=minimal',
            },
            body: JSON.stringify({
                deactivated_at: new Date().toISOString(),
            }),
            keepalive: true,
        }).catch((_e: any) => console.debug('[core/radar/heartbeat:silent-catch]', _e?.message || _e));
    } catch (e: any) {
        console.debug('[radar-heartbeat] beacon-deactivate:', e?.message || e);
        // Falha silenciosa - heartbeat expira em 2min de qualquer forma
    }
}
