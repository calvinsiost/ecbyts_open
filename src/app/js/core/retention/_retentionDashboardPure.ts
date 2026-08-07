// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RETENTION DASHBOARD — Pure view-model aggregator (F6 partial)

   Calcula estatísticas agregadas para o painel "Saúde de Retenção":
   - Total observations por categoria
   - Counts near-expiry (<30d)
   - Counts already expired
   - Counts locked (compliance)
   - Médias TTL restante

   Pure: zero state, zero DOM, zero rede. Caller injeta observations array
   (vem do Supabase OU IDB local OU fixture).
   ================================================================ */

import {
    type RetentionPolicy,
    type RetentionCategory,
    daysUntilExpiry,
    isNearExpiry,
} from './_retentionPolicyPure.js';

export interface ObservationLite {
    id: string;
    retention_policy?: RetentionPolicy | null;
}

export interface RetentionStats {
    total: number;
    withPolicy: number;
    missingPolicy: number;
    byCategory: Readonly<Record<RetentionCategory, number>>;
    nearExpiry30d: number;
    expired: number;
    locked: number;
    avgTtlRemainingDays: number | null;
    healthStatus: 'green' | 'yellow' | 'red';
}

const EMPTY_CATEGORY_COUNTS: Readonly<Record<RetentionCategory, number>> = Object.freeze({
    phase1_desk_review: 0,
    phase2_confirmatory: 0,
    phase3_monitoring: 0,
    occupational_health: 0,
    one_off_qa_qc: 0,
    other: 0,
});

interface RunningMetrics {
    counts: Record<RetentionCategory, number>;
    withPolicy: number;
    missingPolicy: number;
    nearExpiry30d: number;
    expired: number;
    locked: number;
    sumRemaining: number;
    sumRemainingCount: number;
}

function _createMetrics(): RunningMetrics {
    return {
        counts: { ...EMPTY_CATEGORY_COUNTS },
        withPolicy: 0,
        missingPolicy: 0,
        nearExpiry30d: 0,
        expired: 0,
        locked: 0,
        sumRemaining: 0,
        sumRemainingCount: 0,
    };
}

function _accumulateObservation(
    metrics: RunningMetrics,
    observation: ObservationLite,
    nowIso: string,
): void {
    const p = observation?.retention_policy;
    if (!p || typeof p !== 'object') {
        metrics.missingPolicy++;
        return;
    }

    metrics.withPolicy++;
    if (p.category in metrics.counts) {
        metrics.counts[p.category as RetentionCategory]++;
    }
    if (p.locked) {
        metrics.locked++;
    }

    const days = daysUntilExpiry(p, nowIso);
    if (days === null) return;

    metrics.sumRemaining += days;
    metrics.sumRemainingCount++;
    if (days < 0) metrics.expired++;
    if (isNearExpiry(p, nowIso, 30)) metrics.nearExpiry30d++;
}

function _computeHealthStatus(
    total: number,
    expired: number,
    missingPolicy: number,
    nearExpiry30d: number,
): 'green' | 'yellow' | 'red' {
    if (total === 0) return 'green';

    const missingRatio = missingPolicy / total;
    const nearRatio = nearExpiry30d / total;
    if (expired > 0 || missingRatio > 0.2) return 'red';
    if (nearRatio > 0.05 || missingRatio > 0.05) return 'yellow';
    return 'green';
}

/**
 * Compute aggregated retention stats from an observations array.
 *
 * @param observations - array of obs (any source: Supabase, IDB, fixture)
 * @param nowIso - ISO string of "now" (injectable for tests/deterministic)
 * @returns RetentionStats — pure data, no DOM, ready for any renderer
 */
export function computeRetentionStats(
    observations: ReadonlyArray<ObservationLite> | null | undefined,
    nowIso: string
): RetentionStats {
    const obs = Array.isArray(observations) ? observations : [];
    const total = obs.length;
    const metrics = _createMetrics();

    for (const o of obs) {
        _accumulateObservation(metrics, o, nowIso);
    }

    const avgTtlRemainingDays = metrics.sumRemainingCount > 0
        ? Math.round(metrics.sumRemaining / metrics.sumRemainingCount)
        : null;

    const healthStatus = _computeHealthStatus(total, metrics.expired, metrics.missingPolicy, metrics.nearExpiry30d);

    return {
        total,
        withPolicy: metrics.withPolicy,
        missingPolicy: metrics.missingPolicy,
        byCategory: Object.freeze({ ...metrics.counts }),
        nearExpiry30d: metrics.nearExpiry30d,
        expired: metrics.expired,
        locked: metrics.locked,
        avgTtlRemainingDays,
        healthStatus,
    };
}

/**
 * Format stats as 4 dashboard card primitives (label/value/color/hint).
 * Render-agnostic: caller decides DOM/canvas/text.
 */
export interface RetentionCard {
    id: 'total' | 'near-expiry' | 'expired' | 'locked';
    label: string;
    value: number;
    color: 'neutral' | 'warning' | 'error' | 'info';
    // `| undefined` explícito: cards setam hint condicional (exactOptional).
    hint?: string | undefined;
}

export function buildDashboardCards(stats: RetentionStats): RetentionCard[] {
    return [
        {
            id: 'total',
            label: 'Total de leituras',
            value: stats.total,
            color: 'neutral',
            hint: stats.missingPolicy > 0 ? `${stats.missingPolicy} sem política` : undefined,
        },
        {
            id: 'near-expiry',
            label: 'Expirando em 30 dias',
            value: stats.nearExpiry30d,
            color: stats.nearExpiry30d > 0 ? 'warning' : 'neutral',
        },
        {
            id: 'expired',
            label: 'Já expiradas',
            value: stats.expired,
            color: stats.expired > 0 ? 'error' : 'neutral',
            hint: stats.expired > 0 ? 'Aguardando job de arquivamento' : undefined,
        },
        {
            id: 'locked',
            label: 'Travadas (compliance)',
            value: stats.locked,
            color: 'info',
        },
    ];
}
