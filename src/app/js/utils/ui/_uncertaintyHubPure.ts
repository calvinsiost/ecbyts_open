// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM Tier A — uncertaintyHubPanel.ts #6 monolito.
// Pure-logic extraction from src/app/js/utils/ui/uncertaintyHubPanel.ts (canonical .ts).
// 1359L, score 1390 per MONOLITH_IMPACT_ANALYSIS_2026_05_27.
//
// Read from canonical TS per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe.
//
// Spec NOT:
// - NÃO ler DOM (caller monta innerHTML com retornos)
// - NÃO ler i18n direto (caller resolve labels via t())
// - NÃO ler escapeHtml (caller aplica em outputs)
// - NÃO emoji
//
// Extracted helpers:
//   - UNCERTAINTY_CLASS_FALLBACK         (frozen unknown class)
//   - UNCERTAINTY_PROPAGATION_KEY_LABELS (frozen Q2Q keys)
//   - HUMAN_AGE_THRESHOLDS               (frozen seconds bands)
//   - deriveUncertaintyClass             (last decision → cls/label/action)
//   - humanizePropagationKey             (raw key → pt-BR label)
//   - formatPropagationValue             (any value → display string)
//   - humanAge                           (Date|now → 'há Ns'|'há Nmin'|'há Nh'|locale)
//   - humanDate                          (ISO|null → locale string)

export type UncertaintyAction = 'block' | 'warn' | 'allow' | string;

export interface UncertaintyDecisionLike {
    decision?: { action?: UncertaintyAction };
    propagation?: { rule_action?: UncertaintyAction };
}

export interface UncertaintyClassResult {
    cls: 'red' | 'yellow' | 'green' | 'unknown';
    dot: string;
    label: string;
    action: string;
}

/** Frozen fallback class result for missing/empty input. */
export const UNCERTAINTY_CLASS_FALLBACK: Readonly<UncertaintyClassResult> = Object.freeze({
    cls: 'unknown',
    dot: '',
    label: 'SEM DADOS',
    action: 'Clique em Recalcular',
});

/** Frozen pt-BR labels for Q2Q propagation tree keys. */
export const UNCERTAINTY_PROPAGATION_KEY_LABELS: Readonly<Record<string, string>> = Object.freeze({
    policy_source: 'origem da policy',
    q2q_label: 'classe Q2Q',
    q2q_u_rel: 'U relativa',
    exceedance_input: 'prob. excedência',
    rule_action: 'ação da regra',
});

/**
 * Frozen seconds thresholds for human-readable relative time.
 *   < 60s          → "há Ns"
 *   < 3600s (1h)   → "há Nmin"
 *   < 86400s (1d)  → "há Nh"
 *   else           → date.toLocaleString()
 */
export const HUMAN_AGE_THRESHOLDS: Readonly<{ SECOND: number; MINUTE: number; HOUR: number; DAY: number }> = Object.freeze({
    SECOND: 1,
    MINUTE: 60,
    HOUR: 3600,
    DAY: 86400,
});

/**
 * Derive uncertainty visual class from the last decision/propagation result.
 *
 * Rules (preserved from _deriveClass @ uncertaintyHubPanel.ts:753):
 *   - last == null               → unknown / "SEM DADOS"
 *   - action === 'block'         → red    / "CRÍTICO"
 *   - action === 'warn'          → yellow / "ATENÇÃO"
 *   - else (allow/default)       → green  / "ACEITÁVEL"
 *
 * Caller injects the SVG dot HTML (caller-controlled markup); pure helper
 * focuses on the cls + label + action decision.
 */
export function deriveUncertaintyClass(
    last: UncertaintyDecisionLike | null | undefined,
    dotSvg: string = '',
): UncertaintyClassResult {
    if (!last || typeof last !== 'object') {
        return { ...UNCERTAINTY_CLASS_FALLBACK, dot: dotSvg };
    }
    const action: string = last.decision?.action || last.propagation?.rule_action || 'allow';
    if (action === 'block') {
        return { cls: 'red', dot: dotSvg, label: 'CRÍTICO', action: 'Ação: publicação bloqueada' };
    }
    if (action === 'warn') {
        return { cls: 'yellow', dot: dotSvg, label: 'ATENÇÃO', action: 'Ação: revisar drivers top' };
    }
    return { cls: 'green', dot: dotSvg, label: 'ACEITÁVEL', action: 'Ação: seguir com decisão' };
}

/**
 * Humanize a propagation tree key.
 * Unknown keys passthrough unchanged.
 *   'policy_source' → 'origem da policy'
 *   'q2q_label'     → 'classe Q2Q'
 *   'custom_key'    → 'custom_key'
 */
export function humanizePropagationKey(k: unknown): string {
    if (typeof k !== 'string' || !k) return '';
    return UNCERTAINTY_PROPAGATION_KEY_LABELS[k] ?? k;
}

/**
 * Format an arbitrary value as a display string for the propagation tree.
 *   null/undefined → '—'
 *   integer        → toString
 *   float          → toFixed(3)
 *   else           → String(value)
 */
export function formatPropagationValue(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') {
        if (!Number.isFinite(v)) return String(v);
        return Number.isInteger(v) ? String(v) : v.toFixed(3);
    }
    return String(v);
}

/**
 * Human-readable relative age for a Date.
 * `nowMs` is injectable for testability.
 *
 *   < 60s       → "há Ns"
 *   < 60min     → "há Nmin"
 *   < 24h       → "há Nh"
 *   else        → date.toLocaleString()
 *
 * Future timestamps (negative diff) and non-finite → ISO fallback.
 */
export function humanAge(date: Date | null | undefined, nowMs: number = Date.now()): string {
    if (!date || !(date instanceof Date)) return '';
    const t = date.getTime();
    if (!Number.isFinite(t)) return '';
    const diffMs = nowMs - t;
    if (!Number.isFinite(diffMs) || diffMs < 0) {
        try {
            return date.toISOString();
        } catch (e) {
            console.debug('[uncertaintyHubPure:humanAge]', (e as Error)?.message || e);
            return '';
        }
    }
    const s = Math.floor(diffMs / 1000);
    if (s < HUMAN_AGE_THRESHOLDS.MINUTE) return `há ${s}s`;
    const m = Math.floor(s / HUMAN_AGE_THRESHOLDS.MINUTE);
    if (m < HUMAN_AGE_THRESHOLDS.MINUTE) return `há ${m}min`;
    const h = Math.floor(m / HUMAN_AGE_THRESHOLDS.MINUTE);
    if (h < 24) return `há ${h}h`;
    return date.toLocaleString();
}

/**
 * Format an ISO date string as locale string. Empty input → ''. Invalid → original input.
 */
export function humanDate(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString();
    } catch (e) {
        console.debug('[uncertaintyHubPure:humanDate]', (e as Error)?.message || e);
        return String(iso);
    }
}
