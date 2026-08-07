// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CONSTELLATION NODE CONTEXT HUD — pure-logic model
   SPEC_CONSTELLATION_HUD_9_75 — gap: contextual node-anchored
   health/uncertainty HUD overlay + guided onboarding controller.

   Modelo puro (sem DOM, sem THREE) que deriva um payload de HUD
   contextual ancorado a um nó: combina severidade de saúde
   (HEALTH_STATUS) e classe de qualidade/incerteza (badge) numa
   única classificação ordenável, mais um state-machine de
   onboarding de 3 passos. A camada de UI apenas renderiza este
   payload — toda a regra de negócio vive aqui (IP em core/).
   ================================================================ */

/**
 * Canonical health severities accepted (matches core/health/schema.js
 * HEALTH_STATUS) plus the uncertainty badge vocabulary (grey).
 * Rank: higher = more attention. Drives anchor color + sort order.
 */
export const NODE_HUD_SEVERITY = Object.freeze({
    critical: 4,
    red: 3,
    yellow: 2,
    green: 1,
    grey: 0,
    unknown: 0,
});

/** Onboarding step ids — guided 3-step tour over the Constellation HUD. */
export const ONBOARDING_STEPS = Object.freeze(['open', 'select', 'impact']);

/**
 * Normalize an arbitrary status token to a known severity key.
 * Unknown / falsy tokens collapse to 'unknown'.
 * @param {any} token
 * @returns {string}
 */
export function normalizeSeverity(token: any) {
    const key = typeof token === 'string' ? token.trim().toLowerCase() : '';
    return Object.prototype.hasOwnProperty.call(NODE_HUD_SEVERITY, key) ? key : 'unknown';
}

/**
 * Pick the more severe of two status tokens (higher rank wins;
 * ties keep the first argument).
 * @param {any} a
 * @param {any} b
 * @returns {string}
 */
export function maxSeverity(a: any, b: any) {
    const sa = normalizeSeverity(a);
    const sb = normalizeSeverity(b);
    return NODE_HUD_SEVERITY[sb as keyof typeof NODE_HUD_SEVERITY] > NODE_HUD_SEVERITY[sa as keyof typeof NODE_HUD_SEVERITY] ? sb : sa;
}

/**
 * Build a contextual HUD payload anchored to a single node, fusing
 * its health alert severity with its uncertainty/quality badge.
 *
 * @param {{ id?: string, label?: string, familyId?: string } | null} node
 * @param {{
 *   health?: { status?: string, label?: string } | null,
 *   uncertainty?: { badge?: string, relativePct?: number } | null
 * }} [context]
 * @returns {{
 *   nodeId: string, label: string, familyId: string,
 *   healthSeverity: string, qualityBadge: string,
 *   overallSeverity: string, severityRank: number,
 *   hasAlert: boolean, anchorColor: string,
 *   lines: Array<{ kind: string, severity: string, textKey: string, raw: string }>
 * } | null}
 */
export function buildNodeContextHud(node: any, context: { health?: any; uncertainty?: any } = {}) {
    if (!node || typeof node !== 'object' || !node.id) return null;
    const health = context.health || null;
    const unc = context.uncertainty || null;

    const healthSeverity = normalizeSeverity(health?.status);
    const qualityBadge = normalizeSeverity(unc?.badge);
    const overallSeverity = maxSeverity(healthSeverity, qualityBadge);
    const severityRank = NODE_HUD_SEVERITY[overallSeverity as keyof typeof NODE_HUD_SEVERITY];

    /** @type {Array<{kind:string,severity:string,textKey:string,raw:string}>} */
    const lines = [];
    if (health && healthSeverity !== 'unknown') {
        lines.push({
            kind: 'health',
            severity: healthSeverity,
            textKey: `constellation.hud.health.${healthSeverity}`,
            raw: typeof health.label === 'string' ? health.label : healthSeverity,
        });
    }
    if (unc && qualityBadge !== 'unknown') {
        const pct = Number.isFinite(unc?.relativePct) ? `${unc.relativePct}%` : qualityBadge;
        lines.push({
            kind: 'uncertainty',
            severity: qualityBadge,
            textKey: `constellation.hud.quality.${qualityBadge}`,
            raw: String(pct),
        });
    }

    return {
        nodeId: String(node.id),
        label: typeof node.label === 'string' && node.label ? node.label : String(node.id),
        familyId: typeof node.familyId === 'string' ? node.familyId : '',
        healthSeverity,
        qualityBadge,
        overallSeverity,
        severityRank,
        hasAlert: severityRank >= NODE_HUD_SEVERITY.yellow,
        anchorColor: anchorColorFor(overallSeverity),
        lines,
    };
}

/**
 * Map a severity key to a CSS color token name (consumed by the UI
 * layer; keeps the palette decision in core for auditability).
 * @param {string} severity
 * @returns {string}
 */
export function anchorColorFor(severity: any) {
    switch (normalizeSeverity(severity)) {
        case 'critical':
            return 'var(--color-danger, #b00020)';
        case 'red':
            return 'var(--color-danger, #d32f2f)';
        case 'yellow':
            return 'var(--color-warning, #f9a825)';
        case 'green':
            return 'var(--color-success, #2e7d32)';
        default:
            return 'var(--color-muted, #9e9e9e)';
    }
}

/**
 * Rank a list of node HUD payloads by severity (descending), so the
 * UI can surface the most critical anchors first / limit overlay count.
 * Stable: equal-severity entries keep input order.
 * @param {Array<any>} payloads
 * @param {number} [limit]
 * @returns {Array<any>}
 */
export function rankNodeHudPayloads(payloads: any, limit = Infinity) {
    const list = Array.isArray(payloads) ? payloads.filter(Boolean) : [];
    const indexed = list.map((p, i) => ({ p, i }));
    indexed.sort((a, b) => b.p.severityRank - a.p.severityRank || a.i - b.i);
    const sorted = indexed.map((e) => e.p);
    return Number.isFinite(limit) && limit >= 0 ? sorted.slice(0, limit) : sorted;
}

// ──────────────────────────────────────────────────────────────────────
// Onboarding controller — pure 3-step state machine
// ──────────────────────────────────────────────────────────────────────

/**
 * Create the initial onboarding state.
 * @returns {{ index: number, completed: boolean, dismissed: boolean }}
 */
export function createOnboardingState() {
    return { index: 0, completed: false, dismissed: false };
}

/**
 * Advance / rewind / dismiss the onboarding tour.
 * @param {{ index: number, completed: boolean, dismissed: boolean }} state
 * @param {'next'|'prev'|'dismiss'|'restart'} state
 * @returns {{ index: number, completed: boolean, dismissed: boolean }}
 */
export function onboardingTransition(state: any, action: any) {
    const s = state && typeof state === 'object' ? state : createOnboardingState();
    const last = ONBOARDING_STEPS.length - 1;
    if (action === 'dismiss') return { index: s.index, completed: s.completed, dismissed: true };
    if (action === 'restart') return createOnboardingState();
    if (action === 'prev') {
        return { index: Math.max(0, s.index - 1), completed: false, dismissed: false };
    }
    if (action === 'next') {
        if (s.index >= last) return { index: last, completed: true, dismissed: false };
        return { index: s.index + 1, completed: false, dismissed: false };
    }
    return { index: s.index, completed: s.completed, dismissed: s.dismissed };
}

/**
 * Describe the current onboarding step for the UI layer.
 * @param {{ index: number, completed: boolean, dismissed: boolean }} state
 * @returns {{ stepId: string, index: number, total: number,
 *   titleKey: string, bodyKey: string, isFirst: boolean, isLast: boolean,
 *   visible: boolean }}
 */
export function describeOnboardingStep(state: any) {
    const s = state && typeof state === 'object' ? state : createOnboardingState();
    const total = ONBOARDING_STEPS.length;
    const idx = Math.min(Math.max(0, s.index | 0), total - 1);
    const stepId = ONBOARDING_STEPS[idx];
    return {
        stepId,
        index: idx,
        total,
        titleKey: `constellation.tour.${stepId}.title`,
        bodyKey: `constellation.tour.${stepId}.body`,
        isFirst: idx === 0,
        isLast: idx === total - 1,
        visible: !s.dismissed && !s.completed,
    };
}

export const nodeContextHudMeta = Object.freeze({
    spec: 'SPEC_CONSTELLATION_HUD_9_75',
    exports: [
        'buildNodeContextHud',
        'rankNodeHudPayloads',
        'normalizeSeverity',
        'maxSeverity',
        'anchorColorFor',
        'createOnboardingState',
        'onboardingTransition',
        'describeOnboardingStep',
    ],
});
