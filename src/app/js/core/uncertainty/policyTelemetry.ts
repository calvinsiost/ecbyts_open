// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   UNC-001 Phase 2 — policy telemetry emitter + drift detector

   Wrapper sobre resolveUncertaintyPolicy que:
   1. Emite evento via trackEvent (se telemetria habilitada)
   2. Detecta drift runtime vs definição canônica em SQL
      — guarda hash do último set de policies vistas do servidor
      — compara com o set usado em runtime
      — emite 'policy_drift_detected' + log quando hash diverge

   Callers devem usar resolveAndTrack() em vez de resolveUncertaintyPolicy
   direto, para garantir telemetria.
   ================================================================ */

import { resolveUncertaintyPolicy } from './policyResolver.js';

let _lastSqlHash: any = null;
let _driftNotified = false;

/**
 * Hash estável de um array de policies (SHA não necessário - fnv32 basta
 * para invalidar cache local quando SQL muda).
 */
function _hashPolicies(policies: any): string {
    const canonical = (policies || [])
        .map((p: any) => ({
            id: p.policy_id,
            coverage: p.coverage,
            k: p.k_default,
            mc: p.monte_carlo_samples,
            scope: p.scope,
        }))
        .sort((a: any, b: any) => String((a as any).id).localeCompare(String((b as any).id)));
    const str = JSON.stringify(canonical);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

/**
 * Registra o hash canônico das policies vindas do SQL (chamada após fetch).
 * @param {Array<any>} sqlPolicies conjunto canônico servido pelo backend
 */
export function registerSqlPolicies(sqlPolicies: Array<any>): void {
    _lastSqlHash = _hashPolicies(sqlPolicies);
    _driftNotified = false;
}

/**
 * Getter utilitário para testes / debug.
 */
export function getLastSqlHash(): any {
    return _lastSqlHash;
}

/**
 * Reset (usado em testes para isolar estado).
 */
export function _resetTelemetryState(): void {
    _lastSqlHash = null;
    _driftNotified = false;
}

/**
 * Resolve policy + emite evento de telemetria (policy_applied / policy_fallback_used)
 * + detecta drift se o runtime policies difere do último SQL registrado.
 *
 * @param {Array<any>} policies runtime policies (podem vir de cache local)
 * @param {Record<string, any>} ctx { workspace_id, matrix, project_id }
 * @param {{ tracker?: (event: any, target: any, meta: any)=>void, logger?: Console }} [deps]
 * @returns {ReturnType<resolveUncertaintyPolicy> & { drift: boolean }}
 */
export function resolveAndTrack(
    policies: Array<any>,
    ctx: Record<string, any> = {},
    deps: { tracker?: (event: any, target: any, meta: any) => void; logger?: Console } = {},
): ReturnType<typeof resolveUncertaintyPolicy> & { drift: boolean } {
    const result = resolveUncertaintyPolicy(policies, ctx);
    const tracker = deps.tracker || _defaultTracker;
    const logger = deps.logger || console;

    // Drift detection - só dispara uma vez por sessão por registro SQL
    const runtimeHash = _hashPolicies(policies);
    let drift = false;
    if (_lastSqlHash && runtimeHash !== _lastSqlHash && !_driftNotified) {
        drift = true;
        _driftNotified = true;
        logger.warn?.(
            `[uncertainty] Policy drift detected: runtime hash ${runtimeHash} != SQL hash ${_lastSqlHash}. ` +
                `Runtime policies may be stale; consider forcing a refresh.`,
        );
        try {
            tracker('telemetry', 'policy_drift_detected', {
                runtime_hash: runtimeHash,
                sql_hash: _lastSqlHash,
                policy_count: (policies || []).length,
            });
        } catch (e) {
            console.debug('[policyTelemetry] drift-event:', (e as any)?.message || e);
        }
    }

    // Evento canônico de telemetria
    try {
        tracker('telemetry', result.telemetryEvent, {
            policy_id: result.policy?.policy_id || null,
            source: result.source,
            matrix: ctx.matrix || null,
            project_id: ctx.project_id || null,
            workspace_id: ctx.workspace_id || null,
            coverage: result.policy?.coverage ?? null,
        });
    } catch (e) {
        console.debug('[policyTelemetry] tracker-event:', (e as any)?.message || e);
    }

    return { ...result, drift };
}

async function _defaultTracker(eventType: any, target: any, metadata: any): Promise<void> {
    try {
        const { trackEvent, isTelemetryEnabled } = await import('../../utils/telemetry/tracker.js');
        if (!isTelemetryEnabled?.()) return;
        trackEvent(eventType, target, metadata);
    } catch (err) {
        console.debug('[uncertainty] tracker unavailable:', (err as any)?.message);
    }
}
