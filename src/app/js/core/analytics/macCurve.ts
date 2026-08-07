// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

/* ================================================================
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
   MAC CURVE — SPEC_TIER2_FEATURES §A2

   Marginal Abatement Cost curve: priorização de ações de remediação
   por custo marginal (R$/t CO2e ou R$/kg contaminante).
   Low-hanging fruit (MC < 0) destacados.

   Pure helpers (sem gráfico/DOM).
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

export const MAC_UNITS = Object.freeze(['t_CO2e', 'kg_contaminant', 'm3_water', 'ton']);

// Low-hanging fruit: MC negativo = ganho líquido (paga-se no abate)
export const LOW_HANGING_FRUIT_MAX_MC = 0;

// ──────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {Record<string, any>} action
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAction(action: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!action || typeof action !== 'object') return { valid: false, errors: ['not object'] };
    if (!action.name) errors.push('name required');
    if (!Number.isFinite(action.cost)) errors.push('cost must be finite number');
    if (!Number.isFinite(action.abatement) || action.abatement === 0) {
        errors.push('abatement must be non-zero number');
    }
    if (action.unit && !MAC_UNITS.includes(action.unit)) {
        errors.push(`unit must be one of: ${MAC_UNITS.join(', ')}`);
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// MAC computation
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa marginal cost para cada acao e ordena crescente.
 *
 * @param {Array<{name: string, cost: number, abatement: number, unit?: string}>} actions
 * @returns {Array<Record<string, any>>} acoes enriquecidas com marginalCost + cumulativeAbatement
 */
export function calculateMACCurve(
    actions: Array<{ name: string; cost: number; abatement: number; unit?: string }>,
): Array<Record<string, any>> {
    if (!Array.isArray(actions)) return [];
    const valid = actions.filter((a) => validateAction(a).valid);

    const enriched: Array<Record<string, any>> = valid.map((a) => ({
        ...a,
        marginalCost: a.cost / a.abatement,
    }));

    enriched.sort((a, b) => a.marginalCost - b.marginalCost);

    // Cumulative abatement (para plot MAC curve - eixo X)
    let cumulative = 0;
    for (const a of enriched) {
        cumulative += Math.abs(a.abatement);
        a.cumulativeAbatement = cumulative;
    }

    return enriched;
}

/**
 * Retorna low-hanging fruit (marginal cost <= 0).
 * @param {Array<Record<string, any>>} curveData
 * @returns {Array<Record<string, any>>}
 */
export function findLowHangingFruit(curveData: Array<Record<string, any>>): Array<Record<string, any>> {
    if (!Array.isArray(curveData)) return [];
    return curveData.filter((a) => Number.isFinite(a.marginalCost) && a.marginalCost <= LOW_HANGING_FRUIT_MAX_MC);
}

/**
 * Retorna acoes cumulativas ate atingir um budget especifico.
 *
 * @param {Array<Record<string, any>>} curveData
 * @param {number} any>> - orcamento disponivel (moeda)
 * @returns {{ actions: Array<Record<string, any>>, totalCost: number, totalAbatement: number }}
 */
export function selectActionsWithinBudget(
    curveData: Array<Record<string, any>>,
    budget: number,
): { actions: Array<Record<string, any>>; totalCost: number; totalAbatement: number } {
    if (!Array.isArray(curveData) || !Number.isFinite(budget) || budget <= 0) {
        return { actions: [], totalCost: 0, totalAbatement: 0 };
    }
    const picked: Array<Record<string, any>> = [];
    let totalCost = 0;
    let totalAbatement = 0;
    for (const a of curveData) {
        const cost = Math.max(0, Number(a.cost) || 0);
        if (totalCost + cost > budget) continue; // skip se estoura
        picked.push(a);
        totalCost += cost;
        totalAbatement += Math.abs(Number(a.abatement) || 0);
    }
    return { actions: picked, totalCost, totalAbatement };
}

/**
 * Gera summary estatistico da curva.
 * @param {Array<Record<string, any>>} curveData
 * @returns {Record<string, number>}
 */
export function summarizeMACCurve(curveData: Array<Record<string, any>>): Record<string, number> {
    if (!Array.isArray(curveData) || curveData.length === 0) {
        return {
            count: 0,
            totalCost: 0,
            totalAbatement: 0,
            avgMC: 0,
            minMC: 0,
            maxMC: 0,
            lowHangingCount: 0,
        };
    }
    let totalCost = 0;
    let totalAbatement = 0;
    let sumMC = 0;
    let minMC = Infinity;
    let maxMC = -Infinity;
    for (const a of curveData) {
        totalCost += Number(a.cost) || 0;
        totalAbatement += Math.abs(Number(a.abatement) || 0);
        const mc = Number(a.marginalCost);
        if (Number.isFinite(mc)) {
            sumMC += mc;
            if (mc < minMC) minMC = mc;
            if (mc > maxMC) maxMC = mc;
        }
    }
    return {
        count: curveData.length,
        totalCost,
        totalAbatement,
        avgMC: sumMC / curveData.length,
        minMC: toFiniteNumber(minMC, 0),
        maxMC: toFiniteNumber(maxMC, 0),
        lowHangingCount: findLowHangingFruit(curveData).length,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const macCurveMeta = {
    name: 'macCurve',
    description: 'macCurve',
    category: 'analytics',
    familyTags: ['environmental'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
