// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (analytics/economics/costRollup).
//
// core/analytics/economics/costRollup.ts (587L) tem timeline + projeção de
// escalação OPEX como matemática financeira pura. Extração libera teste numérico
// isolado + reuso por dashboard/relatórios sem buildCostRollup (state-heavy).
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. 12º Module C da campanha.
//
// Spec NOT:
// - NÃO chamar buildCostRollup (caller passa byFiscalYear map)
// - NÃO ler getEscalationRate/getCostCenters (caller injeta rate)
// - NÃO emoji
//
// Extracted helpers:
//   - FiscalYearEntry / TimelineEntry / CostProjectionEntry (canonical types)
//   - roundCurrency(v)                pure 2-decimal round
//   - buildCostTimeline(byFiscalYear) pure sorted timeline + cumulative
//   - projectFutureCosts(...)         pure OPEX escalation projection

import { toFiniteNumber } from '../../../utils/helpers/toFiniteNumber.js';

export interface FiscalYearEntry {
    capex: number;
    opex: number;
    total: number;
    [key: string]: unknown;
}

export interface TimelineEntry {
    fiscalYear: number;
    capex: number;
    opex: number;
    total: number;
    cumulative: number;
}

export interface CostProjectionEntry {
    year: number;
    capex: number;
    opex: number;
    projected: boolean;
    cumulative: number;
}

/**
 * Round to 2 decimal places (currency precision).
 * Matches _round @ costRollup.ts:585-587.
 */
export function roundCurrency(v: unknown): number {
    return Math.round((Number(v) || 0) * 100) / 100;
}

/**
 * Build sorted timeline from byFiscalYear map with running cumulative totals.
 * Anos ordenados ascendente; cumulative soma total acumulado.
 *
 * Matches _buildTimeline @ costRollup.ts:429-445 (mas pure).
 */
export function buildCostTimeline(byFiscalYear: Record<string | number, FiscalYearEntry>): TimelineEntry[] {
    const years = Object.keys(byFiscalYear || {})
        .map(Number)
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
    let cumulative = 0;
    return years.map((fy) => {
        const entry = byFiscalYear[fy];
        cumulative += Number(entry?.total) || 0;
        return {
            fiscalYear: fy,
            capex: roundCurrency(entry?.capex),
            opex: roundCurrency(entry?.opex),
            total: roundCurrency(entry?.total),
            cumulative: roundCurrency(cumulative),
        };
    });
}

/**
 * Project future costs via OPEX escalation (compound rate).
 *   projectedOpex(i) = baseOpex × (1 + rate)^i
 *   cumulative acumula a partir de grandTotal histórico
 *   CAPEX = 0 (tipicamente não recorre em projeção)
 *
 * Caller passa lastYear/baseOpex/grandTotal (de buildCostRollup) + rate + horizon.
 *
 * Matches projectCosts projection loop @ costRollup.ts:405-419 (mas pure —
 * sem buildCostRollup/getEscalationRate side-effects).
 */
export function projectFutureCosts(
    lastYear: number,
    baseOpex: number,
    grandTotal: number,
    rate: number,
    horizonYears: number = 5,
): CostProjectionEntry[] {
    const safeRate = toFiniteNumber(rate, 0);
    const safeBase = toFiniteNumber(baseOpex, 0);
    const safeHorizon = Number.isFinite(horizonYears) && horizonYears > 0 ? Math.floor(horizonYears) : 0;
    const projection: CostProjectionEntry[] = [];
    let cumulative = Number(grandTotal) || 0;
    for (let i = 1; i <= safeHorizon; i++) {
        const projectedOpex = roundCurrency(safeBase * Math.pow(1 + safeRate, i));
        cumulative += projectedOpex;
        projection.push({
            year: lastYear + i,
            capex: 0,
            opex: projectedOpex,
            projected: true,
            cumulative: roundCurrency(cumulative),
        });
    }
    return projection;
}

/**
 * Resolve last fiscal year + base OPEX from a byFiscalYear map.
 * Helper para projectCosts: encontra o ano mais recente e seu OPEX.
 * Returns null se map vazio.
 */
export function resolveProjectionBase(
    byFiscalYear: Record<string | number, FiscalYearEntry>,
): { lastYear: number; baseOpex: number } | null {
    const years = Object.keys(byFiscalYear || {})
        .map(Number)
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
    if (years.length === 0) return null;
    const lastYear: number = years[years.length - 1] ?? 0;
    const baseOpex = Number(byFiscalYear[lastYear]?.opex) || 0;
    return { lastYear, baseOpex };
}
