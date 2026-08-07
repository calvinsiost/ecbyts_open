// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_HOME_REDESIGN_3COL_V3 P1-8 — Tier A drenagem (lists.ts #5 monolito).
// Pure-logic extraction from src/app/js/utils/ui/lists.ts presentational helpers.
//
// Read from canonical .ts source (not derived .js) per
// memory/feedback_read_ts_canonical_not_js_derived.md (2026-05-27).
//
// Hand-authored R1-safe. Complementa _listsPure.ts (não modifica para evitar
// contenção multi-LLM com Codex/claude-executor).
//
// Spec NOT:
// - NÃO ler DOM (caller injeta valores)
// - NÃO ler purpose module (caller resolve EIS via callback)
// - NÃO ler i18n (caller resolve labels)
// - NÃO emoji
//
// Extracted helpers:
//   - completenessToPct       (ratio + planned → 0-100)
//   - pctToBarColor           (0-100 → 'green' | 'yellow' | 'red')
//   - eisToVerdictClass       (EIS score → 'high' | 'medium' | 'low')
//   - deltaToArrow            (delta → arrow HTML entity)
//   - deltaToSign             (delta → '+' | '')
//   - deltaToStatusClass      (delta → status class name)
//   - formatAdjustmentLabel   (number → '+0.12' / '-0.03')
//   - formatConfidenceLabel   (confidence → ' | conf 85% (high)' | '')

import { toFiniteNumber } from '../helpers/toFiniteNumber.js';

export type BarColor = 'green' | 'yellow' | 'red';
export type EisVerdictClass = 'high' | 'medium' | 'low';
export type DeltaStatusClass =
    | 'purpose-status-delta-positive'
    | 'purpose-status-delta-negative'
    | 'purpose-status-delta-neutral';

export interface ConfidenceLike {
    score?: number;
    level?: string;
}

/**
 * Convert campaign completeness ratio to integer percent (0-100).
 * Guard: planned ≤ 0 → 0 (no readings planned, no progress).
 */
export function completenessToPct(planned: number, ratio: number): number {
    if (!Number.isFinite(planned) || planned <= 0) return 0;
    if (!Number.isFinite(ratio)) return 0;
    const pct = Math.round(ratio * 100);
    if (pct < 0) return 0;
    if (pct > 100) return 100;
    return pct;
}

/**
 * Map a percentage (0-100) to a 3-tier bar color.
 *   pct >= 80  → green
 *   pct >= 50  → yellow
 *   else       → red
 */
export function pctToBarColor(pct: number): BarColor {
    const safe = toFiniteNumber(pct, 0);
    if (safe >= 80) return 'green';
    if (safe >= 50) return 'yellow';
    return 'red';
}

/**
 * Map an EIS finalScore to a verdict class.
 *   score >= 4.5  → high   (green verdict, "robust")
 *   score >= 3.5  → medium (yellow verdict, "acceptable")
 *   else          → low    (red verdict, "risk")
 *
 * Aligned with `docs/specs/features/SPEC_EIS_DASHBOARD.md` 3-tier thresholds.
 */
export function eisToVerdictClass(finalScore: number): EisVerdictClass {
    const safe = toFiniteNumber(finalScore, 0);
    if (safe >= 4.5) return 'high';
    if (safe >= 3.5) return 'medium';
    return 'low';
}

/**
 * Convert delta sign to an HTML arrow entity for status display.
 *   delta > 0  → &#9650; (up triangle)
 *   delta < 0  → &#9660; (down triangle)
 *   delta = 0  → ''
 */
export function deltaToArrow(delta: number): string {
    if (!Number.isFinite(delta)) return '';
    if (delta > 0) return '&#9650;';
    if (delta < 0) return '&#9660;';
    return '';
}

/**
 * Convert delta sign to a '+'/'' prefix (used together with toFixed).
 * Negative numbers carry their own '-' sign so we only prepend on positive.
 */
export function deltaToSign(delta: number): '+' | '' {
    return Number.isFinite(delta) && delta > 0 ? '+' : '';
}

/**
 * Map a delta sign to a status-delta CSS class.
 */
export function deltaToStatusClass(delta: number): DeltaStatusClass {
    if (Number.isFinite(delta)) {
        if (delta > 0) return 'purpose-status-delta-positive';
        if (delta < 0) return 'purpose-status-delta-negative';
    }
    return 'purpose-status-delta-neutral';
}

/**
 * Format a governance adjustment as a signed 2-decimal label.
 *   +0.12 / -0.03 / +0.00
 * Non-finite → "+0.00".
 */
export function formatAdjustmentLabel(adjustment: number): string {
    if (!Number.isFinite(adjustment)) return '+0.00';
    const sign = adjustment >= 0 ? '+' : '';
    return `${sign}${adjustment.toFixed(2)}`;
}

/**
 * Format a confidence object as a status suffix.
 *   { score: 0.85, level: 'high' } → ' | conf 85% (high)'
 *   null / missing score           → ''
 * Score is clamped to [0, 1] before percentage conversion.
 */
export function formatConfidenceLabel(confidence: ConfidenceLike | null | undefined): string {
    if (!confidence || typeof confidence !== 'object') return '';
    const score = confidence.score;
    if (!Number.isFinite(score) || score == null) return '';
    const clamped = Math.max(0, Math.min(1, score));
    const pct = Math.round(clamped * 100);
    const level = typeof confidence.level === 'string' && confidence.level ? confidence.level : '';
    return level ? ` | conf ${pct}% (${level})` : ` | conf ${pct}%`;
}
