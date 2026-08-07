// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (governance/contractManager).
//
// utils/governance/contractManager.ts (818L) tem disbursement summary + KPI
// bonus/malus como matemática financeira pura. Extração libera teste isolado +
// reuso por dashboard/relatórios sem getContract (state-heavy).
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. 13º Module C da campanha.
//
// Spec NOT:
// - NÃO ler module state (contract — caller passa disbursements/bonusMalus)
// - NÃO chamar getContract/getWbsItems (caller resolve)
// - NÃO emoji
//
// Extracted helpers:
//   - Disbursement / BonusMalusRule / FinancialSummary / KpiResult (types)
//   - DISBURSEMENT_STATUS (frozen)
//   - computeFinancialSummary(disbursements, totalValue, nowDate)  pure
//   - evaluateContractKpis(bonusMalus, wbsItemsById, totalValue)  pure bonus/malus
//   - computeInsurancePremium(libraryPriceCents, pctOfPrice, floorCents)  pure

export type DisbursementStatus = 'paid' | 'scheduled' | 'cancelled' | string;

export interface Disbursement {
    amount: number;
    status: DisbursementStatus;
    date?: string;
    [key: string]: unknown;
}

export interface BonusMalusRule {
    kpiId: string;
    threshold?: number;
    bonusPercent?: number;
    malusPercent?: number;
    [key: string]: unknown;
}

export interface FinancialSummary {
    totalValue: number;
    totalPaid: number;
    totalScheduled: number;
    totalOverdue: number;
    remaining: number;
}

export interface KpiResultDetail {
    kpiId: string;
    type: 'bonus' | 'malus';
    amount: number;
    actual: number;
    threshold: number;
}

export interface KpiResult {
    bonusTotal: number;
    malusTotal: number;
    details: KpiResultDetail[];
}

/**
 * Frozen disbursement status values.
 */
export const DISBURSEMENT_STATUS = Object.freeze({
    PAID: 'paid',
    SCHEDULED: 'scheduled',
    CANCELLED: 'cancelled',
});

/**
 * Compute financial summary from disbursements (pure).
 *   totalPaid     = soma dos 'paid'
 *   totalScheduled= soma dos 'scheduled'
 *   totalOverdue  = soma dos 'scheduled' com date < nowDate
 *   remaining     = totalValue − totalPaid
 *
 * Caller passa nowDate (YYYY-MM-DD) para testabilidade.
 *
 * Matches getContractFinancialSummary @ contractManager.ts:487-514 (mas pure).
 */
export function computeFinancialSummary(
    disbursements: ReadonlyArray<Disbursement>,
    totalValue: number,
    nowDate: string,
): FinancialSummary {
    let totalPaid = 0;
    let totalScheduled = 0;
    let totalOverdue = 0;
    for (const d of disbursements || []) {
        const amount = Number(d.amount) || 0;
        if (d.status === DISBURSEMENT_STATUS.PAID) {
            totalPaid += amount;
        } else if (d.status === DISBURSEMENT_STATUS.SCHEDULED) {
            totalScheduled += amount;
            if (d.date && d.date < nowDate) {
                totalOverdue += amount;
            }
        }
    }
    const tv = Number(totalValue) || 0;
    return {
        totalValue: tv,
        totalPaid,
        totalScheduled,
        totalOverdue,
        remaining: tv - totalPaid,
    };
}

/**
 * Evaluate KPI bonus/malus for a contract (pure).
 * Caller passa bonusMalus rules + map de wbsItem por kpiId + totalValue.
 *   actual ≥ threshold → bonus = totalValue × bonusPercent/100
 *   actual < threshold → malus = totalValue × malusPercent/100
 *   KPI sem wbsItem linkado → ignorado
 *
 * Matches evaluateKPIs @ contractManager.ts:524-564 (mas pure — caller resolve
 * wbsItems lookup; recebe Map<kpiId, wbsItem>).
 */
export function evaluateContractKpis(
    bonusMalus: ReadonlyArray<BonusMalusRule>,
    wbsItemsById: ReadonlyMap<string, { actual?: { percentComplete?: number } }>,
    totalValue: number,
): KpiResult {
    let bonusTotal = 0;
    let malusTotal = 0;
    const details: KpiResultDetail[] = [];
    const tv = Number(totalValue) || 0;
    for (const bm of bonusMalus || []) {
        const wbsItem = wbsItemsById.get(bm.kpiId);
        if (!wbsItem) continue;
        const actual = wbsItem.actual?.percentComplete || 0;
        const threshold = bm.threshold ?? 100;
        if (actual >= threshold) {
            const bonus = (tv * (bm.bonusPercent || 0)) / 100;
            bonusTotal += bonus;
            details.push({ kpiId: bm.kpiId, type: 'bonus', amount: bonus, actual, threshold });
        } else {
            const malus = (tv * (bm.malusPercent || 0)) / 100;
            malusTotal += malus;
            details.push({ kpiId: bm.kpiId, type: 'malus', amount: malus, actual, threshold });
        }
    }
    return { bonusTotal, malusTotal, details };
}

/**
 * Compute insurance premium in cents (pure).
 *   premium = max(floorCents, round(libraryPriceCents × pctOfPrice / 100))
 * Caller passa pctOfPrice (do catálogo) + floorCents.
 *
 * Matches calculatePremium @ contractManager.ts:622-629 (mas pure — caller
 * resolve catálogo lookup e passa pct).
 */
export function computeInsurancePremium(
    libraryPriceCents: number,
    pctOfPrice: number,
    floorCents: number,
): number {
    const price = Number(libraryPriceCents) || 0;
    const pct = Number(pctOfPrice) || 0;
    const floor = Number(floorCents) || 0;
    return Math.max(floor, Math.round((price * pct) / 100));
}

/**
 * Type-guard for Disbursement shape.
 */
export function isValidDisbursement(value: unknown): value is Disbursement {
    if (!value || typeof value !== 'object') return false;
    const d = value as Disbursement;
    return typeof d.amount === 'number' && typeof d.status === 'string';
}
