// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * _featureFlagGatePure — IP-DATA-CONSOL-001 M8
 *
 * Decisor pure: dado o estado do feature flag IP_DATA_REMOTE + contexto,
 * retorna se o cliente deve usar o fetcher remoto ou o caminho legado
 * (imports JSON locais + consts hardcoded).
 *
 * Garante:
 *  - rollback transparente: flag off → behaviour byte-identical ao pre-M3
 *  - sem dependência circular: este pure não importa o runtime fetcher,
 *    apenas decide se ele deve ser invocado
 *  - DI completa de flag source (CONFIG, query param, localStorage admin)
 */

export type FlagSource = 'config_default' | 'query_param' | 'local_storage_admin' | 'remote_admin';

export interface FlagState {
    readonly configDefault: boolean;
    readonly queryParamOverride: boolean | null;
    readonly localStorageOverride: boolean | null;
    readonly remoteAdminOverride: boolean | null;
}

export interface GateVerdict {
    readonly useRemote: boolean;
    readonly source: FlagSource;
    readonly fallbackReason?: 'flag_off' | 'override_off' | 'feature_not_ready';
}

/**
 * Precedência (research-driven, padrão Supabase remote config):
 *   remote_admin > query_param > local_storage > config_default
 *
 * Override negativo sempre vence (defense in depth — kill-switch).
 */
export function resolveFlag(state: FlagState): GateVerdict {
    // 1. Remote admin override (highest priority — Calvin kill-switch)
    if (state.remoteAdminOverride === false) {
        return Object.freeze({ useRemote: false, source: 'remote_admin', fallbackReason: 'override_off' });
    }
    if (state.remoteAdminOverride === true) {
        return Object.freeze({ useRemote: true, source: 'remote_admin' });
    }
    // 2. Query param (admin debug)
    if (state.queryParamOverride === false) {
        return Object.freeze({ useRemote: false, source: 'query_param', fallbackReason: 'override_off' });
    }
    if (state.queryParamOverride === true) {
        return Object.freeze({ useRemote: true, source: 'query_param' });
    }
    // 3. localStorage (dev/QA)
    if (state.localStorageOverride === false) {
        return Object.freeze({ useRemote: false, source: 'local_storage_admin', fallbackReason: 'override_off' });
    }
    if (state.localStorageOverride === true) {
        return Object.freeze({ useRemote: true, source: 'local_storage_admin' });
    }
    // 4. CONFIG default
    if (state.configDefault === true) {
        return Object.freeze({ useRemote: true, source: 'config_default' });
    }
    return Object.freeze({ useRemote: false, source: 'config_default', fallbackReason: 'flag_off' });
}

/**
 * Pretty-print verdict para audit log (M8 rollback validation).
 */
export function describeVerdict(v: GateVerdict): string {
    if (v.useRemote) return `remote (source=${v.source})`;
    return `legacy (source=${v.source}, reason=${v.fallbackReason ?? 'unknown'})`;
}

/**
 * Helper p/ parsear bool override de string (query param / localStorage).
 * Aceita: '1', 'true', 'on' → true / '0', 'false', 'off' → false / null em outros casos.
 */
export function parseBooleanOverride(raw: string | null | undefined): boolean | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const lower = String(raw).toLowerCase().trim();
    if (lower === '1' || lower === 'true' || lower === 'on' || lower === 'yes') return true;
    if (lower === '0' || lower === 'false' || lower === 'off' || lower === 'no') return false;
    return null;
}
