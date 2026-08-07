// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   IMPACT ESTIMATOR HANDLERS - window.* bridge para Impact Estimator
   (SPEC_IMPACT_ESTIMATOR / P1-2 Claude owner §0.4)

   Handlers:
   - handleGenerateImpactReport()        — relatório total do modelo ativo
   - handleEstimateSoilRemediation(p)    — estimativa pontual solo
   - handleEstimateGroundwaterRemediation(p) — estimativa groundwater
   - handleEstimateOccupationalImpact(p) — estimativa ocupacional
   - handleCalculateAssetValue(p)        — valor de ativo ambiental
   - handleCalculateCostBenefit(...)     — ROI/payback

   Core science: core/impact/impactEstimator.js (7 funções, 30 tests green).
   MVP Phase 1: expor core via window.* para UI futura consumir.
   Phase 2: panel UI + modal relatório.
   ================================================================ */

import {
    estimateSoilRemediation,
    estimateGroundwaterRemediation,
    estimateOccupationalImpact,
    calculateNPV,
    calculateAssetValue,
    calculateCostBenefit,
    generateModelImpactReport,
} from '../../core/impact/impactEstimator.js';
import {
    estimateSoilWithMonteCarlo,
    estimateGroundwaterWithMonteCarlo,
    estimateOccupationalWithMonteCarlo,
} from '../../core/impact/monteCarloWire.js';
import { getAllElements } from '../../core/elements/manager.js';
import { showToast } from '../ui/toast.js';

/**
 * Gera relatório completo de impactos do modelo ativo.
 * @returns {Promise<any>} { ok, report: { passivos, environmentalBreakdown, totalAreaM2, ... } }
 */
async function handleGenerateImpactReport() {
    try {
        const elements = getAllElements();
        const modelData = { elements };
        const report = generateModelImpactReport(modelData);
        // Dispatch event para UI consumir se montada
        window.dispatchEvent(new CustomEvent('impact:report', { detail: { report, elementCount: elements.length } }));
        return { ok: true, report, elementCount: elements.length };
    } catch (err: any) {
        console.error('[impact] generateReport failed:', err);
        showToast('Falha ao gerar relatório de impacto', 'error');
        return { ok: false, error: /** @type {any} */ (err)?.message };
    }
}

async function handleEstimateSoilRemediation(/** @type {any} */ params = {}) {
    try {
        return estimateSoilRemediation((params as any));
    } catch (err: any) {
        console.error('[impact] soil estimate failed:', err);
        return { ok: false, error: /** @type {any} */ (err)?.message };
    }
}

async function handleEstimateGroundwaterRemediation(/** @type {any} */ params = {}) {
    try {
        return estimateGroundwaterRemediation((params as any));
    } catch (err: any) {
        console.error('[impact] groundwater estimate failed:', err);
        return { ok: false, error: /** @type {any} */ (err)?.message };
    }
}

async function handleEstimateOccupationalImpact(/** @type {any} */ params = {}) {
    try {
        return estimateOccupationalImpact((params as any));
    } catch (err: any) {
        console.error('[impact] occupational estimate failed:', err);
        return { ok: false, error: /** @type {any} */ (err)?.message };
    }
}

async function handleCalculateAssetValue(/** @type {any} */ params = {}) {
    try {
        return calculateAssetValue((params as any));
    } catch (err: any) {
        console.error('[impact] asset value failed:', err);
        return { ok: false, error: /** @type {any} */ (err)?.message };
    }
}

async function handleCalculateCostBenefit(
    /** @type {any} */ totalCost: any,
    /** @type {any} */ totalAssetValue: any,
    paybackAnnualFlow = 0,
) {
    try {
        return calculateCostBenefit(totalCost, totalAssetValue, paybackAnnualFlow);
    } catch (err: any) {
        console.error('[impact] cost-benefit failed:', err);
        return { ok: false, error: /** @type {any} */ (err)?.message };
    }
}

async function handleCalculateNPV(/** @type {any} */ annual: any, /** @type {any} */ rate: any, /** @type {any} */ years: any) {
    try {
        return calculateNPV(annual, rate, years);
    } catch (err: any) {
        console.error('[impact] NPV failed:', err);
        return { ok: false, error: /** @type {any} */ (err)?.message };
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Phase 3 (P1-2) - Monte Carlo wire handlers
// UI probe consome via window.handleEstimate*WithUncertainty → evento
// `impact:uncertainty-result` para HUD card mostrar IC95 + probExceedance.
// ──────────────────────────────────────────────────────────────────────────

/**
 * @param {any} params - Ver core/impact/monteCarloWire.js::estimateSoilWithMonteCarlo
 * @param {any} [mcOpts] - { n=1000, seed=42, exceedanceThreshold }
 * @returns {Promise<any>} MCResult { ok, mean, sd, ic95, p50, probExceedance?, ... }
 */
async function handleEstimateSoilWithUncertainty(params = {}, mcOpts = {}) {
    try {
        const result = estimateSoilWithMonteCarlo(params, mcOpts);
        window.dispatchEvent(
            new CustomEvent('impact:uncertainty-result', {
                detail: { kind: 'soil', params, mcOpts, result },
            }),
        );
        return result;
    } catch (err: any) {
        console.error('[impact] soil MC failed:', err);
        return { ok: false, error: /** @type {any} */ (err)?.message };
    }
}

async function handleEstimateGroundwaterWithUncertainty(
    /** @type {any} */ params = {},
    /** @type {any} */ mcOpts = {},
) {
    try {
        const result = estimateGroundwaterWithMonteCarlo(params, mcOpts);
        window.dispatchEvent(
            new CustomEvent('impact:uncertainty-result', {
                detail: { kind: 'groundwater', params, mcOpts, result },
            }),
        );
        return result;
    } catch (err: any) {
        console.error('[impact] groundwater MC failed:', err);
        return { ok: false, error: /** @type {any} */ (err)?.message };
    }
}

async function handleEstimateOccupationalWithUncertainty(
    /** @type {any} */ params = {},
    /** @type {any} */ mcOpts = {},
) {
    try {
        const result = estimateOccupationalWithMonteCarlo(params, mcOpts);
        window.dispatchEvent(
            new CustomEvent('impact:uncertainty-result', {
                detail: { kind: 'occupational', params, mcOpts, result },
            }),
        );
        return result;
    } catch (err: any) {
        console.error('[impact] occupational MC failed:', err);
        return { ok: false, error: /** @type {any} */ (err)?.message };
    }
}

export const impactHandlers = {
    handleGenerateImpactReport,
    handleEstimateSoilRemediation,
    handleEstimateGroundwaterRemediation,
    handleEstimateOccupationalImpact,
    handleCalculateAssetValue,
    handleCalculateCostBenefit,
    handleCalculateNPV,
    handleEstimateSoilWithUncertainty,
    handleEstimateGroundwaterWithUncertainty,
    handleEstimateOccupationalWithUncertainty,
};
