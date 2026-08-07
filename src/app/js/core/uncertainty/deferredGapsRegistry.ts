// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   DEFERRED GAPS REGISTRY — SPEC_UNC_STRUCTURAL_001_DEFERRED_GAPS

   Pure helpers para registry de gaps adiados da auditoria 2026-04-13:
   - 4 tiers (A explicit trigger / B no-trigger / C rejected / D delivered)
   - Classification by trigger_type + status
   - Promotion logic: Tier B aging >3 months → archive
   - Re-evaluation cadence tracking (monthly/quarterly/annual)
   - Delivered registry com commit hash

   Sem dependência de Supabase/IDB — registry em memória.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Tier classification
// ──────────────────────────────────────────────────────────────────────

interface Gap {
    id?: string;
    tier?: string;
    title?: string;
    status?: string;
    trigger?: string;
    commit?: string;
    createdAt?: string | number;
    deliveredAt?: string;
}

export const GAP_TIERS = Object.freeze(['A', 'B', 'C', 'D']);

export const TIER_DESCRIPTIONS = Object.freeze({
    A: 'deferred with explicit trigger',
    B: 'deferred with no trigger (long-term)',
    C: 'explicitly REJECTED (not doing)',
    D: 'delivered in recent ciclo',
});

export const GAP_STATUSES = Object.freeze([
    'seeded',
    'deferred',
    'written_not_coded',
    'pending_trigger',
    'aged_out',
    'delivered',
    'rejected',
]);

export const REVIEW_CADENCES = Object.freeze({
    monthly: 30 * 24 * 60 * 60 * 1000,
    quarterly: 90 * 24 * 60 * 60 * 1000,
    annually: 365 * 24 * 60 * 60 * 1000,
});

export const TIER_B_AGING_LIMIT_MS = 180 * 24 * 60 * 60 * 1000; // 6 months

// ──────────────────────────────────────────────────────────────────────
// Seed registry (snapshot from SPEC)
// ──────────────────────────────────────────────────────────────────────

export const CANONICAL_GAPS = Object.freeze([
    // Tier A
    {
        id: 'gap-2a',
        tier: 'A',
        title: 'CETESB DD-256 full param table',
        status: 'seeded',
        trigger: 'user_report_missing_param',
    },
    {
        id: 'gap-5',
        tier: 'A',
        title: 'Wizard Q2Q UI completo',
        status: 'written_not_coded',
        trigger: '3plus_users_request',
    },
    {
        id: 'gap-9',
        tier: 'A',
        title: 'UNC-HUB-002 Phase 2-4 (Confiança mode UI)',
        status: 'deferred',
        trigger: 'policy_requires_IC95',
    },
    { id: 'gap-10', tier: 'A', title: 'Evidence export Tier-2', status: 'deferred', trigger: 'after_gap_9' },
    // Tier B
    { id: 'gap-15', tier: 'B', title: 'i18n completo en-US + es-LA', status: 'deferred' },
    { id: 'gap-16', tier: 'B', title: 'Tour guiado primeiro-uso', status: 'deferred' },
    { id: 'gap-17', tier: 'B', title: 'Mobile responsive Hub modal', status: 'deferred' },
    { id: 'gap-18', tier: 'B', title: 'Dependents automático via graph', status: 'deferred' },
    // Tier C
    { id: 'gap-19', tier: 'C', title: 'Log-normal uncertainty factor', status: 'rejected' },
    { id: 'gap-20', tier: 'C', title: 'Correlações entre fontes', status: 'rejected' },
    { id: 'gap-21', tier: 'C', title: 'Telas ocupacionais 2F/2G', status: 'rejected' },
    { id: 'gap-22', tier: 'C', title: 'Bayesian update', status: 'rejected' },
    { id: 'gap-23', tier: 'C', title: 'NIST Uncertainty Machine validation', status: 'rejected' },
    { id: 'gap-24', tier: 'C', title: 'Kaplan-Meier/ROS for censored', status: 'rejected' },
    // Tier D (delivered)
    { id: 'gap-1a', tier: 'D', title: 'Dados censored UI (<LD/<LQ)', status: 'delivered', commit: 'pending' },
    { id: 'gap-2', tier: 'D', title: 'CETESB/CONAMA 420 regulatory seed', status: 'delivered', commit: 'pending' },
    { id: 'gap-3', tier: 'D', title: 'Badge Q2Q visible + painted attrs', status: 'delivered', commit: 'pending' },
    { id: 'gap-4', tier: 'D', title: 'ECBT v3 uncertainty envelope helper', status: 'delivered', commit: 'pending' },
    { id: 'gap-6', tier: 'D', title: 'Cards R$ passivo/ativo/EIS skeleton', status: 'delivered', commit: 'pending' },
    { id: 'gap-7', tier: 'D', title: 'combineComponents auto on save', status: 'delivered', commit: 'pending' },
    { id: 'gap-11', tier: 'D', title: 'QC flags UI inline', status: 'delivered', commit: 'pending' },
    { id: 'gap-12', tier: 'D', title: 'Validity gate warning', status: 'delivered', commit: 'pending' },
    { id: 'gap-13', tier: 'D', title: 'Error bars Chart.js helper', status: 'delivered', commit: 'pending' },
]);

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

export function isValidTier(tier: string): boolean {
    return typeof tier === 'string' && GAP_TIERS.includes(tier);
}

export function isValidStatus(status: string): boolean {
    return typeof status === 'string' && GAP_STATUSES.includes(status);
}

export function isValidGap(gap: Gap | any): boolean {
    if (!gap || typeof gap !== 'object') return false;
    const g: Gap = gap;
    if (!g.id || typeof g.id !== 'string') return false;
    if (!isValidTier(g.tier as string)) return false;
    if (!g.title) return false;
    return true;
}

// ──────────────────────────────────────────────────────────────────────
// Tier filtering
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna gaps de um tier específico.
 * @param gaps
 * @param tier
 */
export function filterByTier(gaps: Array<Gap>, tier: string): Array<Gap> {
    if (!Array.isArray(gaps)) return [];
    if (!isValidTier(tier)) return [];
    return gaps.filter((g) => g?.tier === tier);
}

/**
 * Agrupa gaps por tier.
 * @param gaps
 */
export function groupByTier(gaps: Array<Gap>): {
    A: Array<Gap>;
    B: Array<Gap>;
    C: Array<Gap>;
    D: Array<Gap>;
} {
    const out: { A: Array<Gap>; B: Array<Gap>; C: Array<Gap>; D: Array<Gap> } = {
        A: [],
        B: [],
        C: [],
        D: [],
    };
    if (!Array.isArray(gaps)) return out;
    for (const g of gaps) {
        if (isValidGap(g)) {
            const tier = (g as Gap).tier as 'A' | 'B' | 'C' | 'D';
            out[tier].push(g);
        }
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// Aging policy §Tier B quarterly
// ──────────────────────────────────────────────────────────────────────

/**
 * Detecta gaps Tier B que excederam 6 meses sem trigger.
 * Estes devem migrar para docs/archive/ (decisão explícita).
 *
 * @param gaps
 * @param nowMs?
 * @returns gaps que precisam archive
 */
export function detectAgedTierB(gaps: Array<Gap>, nowMs?: number): Array<Gap> {
    if (!Array.isArray(gaps)) return [];
    const now = Number(nowMs) || Date.now();
    return gaps.filter((g) => {
        if (!isValidGap(g) || g.tier !== 'B') return false;
        const createdMs = g.createdAt ? new Date(g.createdAt).getTime() : 0;
        if (!Number.isFinite(createdMs) || createdMs === 0) return false;
        return now - createdMs > TIER_B_AGING_LIMIT_MS;
    });
}

// ──────────────────────────────────────────────────────────────────────
// Trigger evaluation §Tier A promotion
// ──────────────────────────────────────────────────────────────────────

/**
 * Dado um evento externo, retorna gaps Tier A que devem ser promovidos
 * a SPEC ativa.
 *
 * @param gaps
 * @param event
 */
export function evaluateTriggerMatch(
    gaps: Array<Gap>,
    event: { type: string; meta?: any },
): Array<Gap> {
    if (!Array.isArray(gaps) || !event?.type) return [];
    return gaps.filter((g) => isValidGap(g) && g.tier === 'A' && g.trigger === event.type);
}

/**
 * Propõe transição de gap para SPEC ativa (Tier A → removed from registry).
 *
 * @param gap
 * @param input
 */
export function proposePromotion(
    gap: Gap,
    input: { commit?: string; specPath?: string },
): { gap_id: string; new_state: string; promoted_at: string; spec_path: string | null; commit: string | null } | null {
    if (!isValidGap(gap) || gap.tier !== 'A') return null;
    return {
        gap_id: gap.id as string,
        new_state: 'active_spec',
        promoted_at: new Date().toISOString(),
        spec_path: input?.specPath || null,
        commit: input?.commit || null,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Review cadence §Re-evaluation
// ──────────────────────────────────────────────────────────────────────

/**
 * @param cadence - 'monthly' | 'quarterly' | 'annually'
 * @param lastReviewMs
 * @param nowMs?
 */
export function isReviewDue(cadence: string, lastReviewMs: number, nowMs?: number): boolean {
    const interval = REVIEW_CADENCES[cadence as 'monthly' | 'quarterly' | 'annually'];
    if (!interval) return false;
    const last = Number(lastReviewMs) || 0;
    const now = Number(nowMs) || Date.now();
    return now - last >= interval;
}

/**
 * Produz relatório de review com stats.
 *
 * @param gaps
 * @param opts
 */
export function buildReviewReport(
    gaps: Array<Gap>,
    opts: { cadence?: string; nowMs?: number } = {},
): {
    cadence: string;
    generated_at: string;
    total_gaps: number;
    by_tier: { A: number; B: number; C: number; D: number };
    aged_b_requiring_archive: Array<string | undefined>;
    active_triggers: Array<string>;
    recently_delivered: Array<{ id: string | undefined; commit: string | undefined }>;
} {
    const nowMs = opts?.nowMs || Date.now();
    const grouped = groupByTier(gaps);
    const agedB = detectAgedTierB(gaps, nowMs);

    return {
        cadence: opts?.cadence || 'monthly',
        generated_at: new Date(nowMs).toISOString(),
        total_gaps: Array.isArray(gaps) ? gaps.length : 0,
        by_tier: {
            A: grouped.A.length,
            B: grouped.B.length,
            C: grouped.C.length,
            D: grouped.D.length,
        },
        aged_b_requiring_archive: agedB.map((g) => g.id),
        active_triggers: grouped.A.map((g) => g.trigger).filter(Boolean) as Array<string>,
        recently_delivered: grouped.D.map((g) => ({ id: g.id, commit: g.commit })),
    };
}

// ──────────────────────────────────────────────────────────────────────
// Delivery recording §Tier D audit trail
// ──────────────────────────────────────────────────────────────────────

/**
 * Registra gap como delivered (Tier D) com commit hash.
 *
 * @param gap
 * @param input
 */
export function recordDelivery(
    gap: Gap,
    input: { commit: string; deliveredAt?: number },
): Gap | null {
    if (!isValidGap(gap)) return null;
    if (!input?.commit) return null;
    return {
        ...gap,
        tier: 'D',
        status: 'delivered',
        commit: String(input.commit),
        deliveredAt: input.deliveredAt ? new Date(input.deliveredAt).toISOString() : new Date().toISOString(),
    };
}
