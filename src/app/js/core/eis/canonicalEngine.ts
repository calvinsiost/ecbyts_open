// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// @ts-check

import { EisCalculator, EIS_DEFAULT_WEIGHTS } from './eisCalculator.js';
import { EIS_FORMULA_AXIS_KEYS, getCanonicalAxisFormulaRefs } from './formulaRegistry.js';
import { UNITS } from '../units/catalog.js';
import { computeOdsOverlay } from './odsOverlay.js';
import {
    applyAxisLToEis,
    buildAxisLViewModel,
    type FineImpactAxisInput,
} from './_fineImpactEisAxisPure.js';
import { computeExtendedAxes, type ObservationRecord, type DomainRule } from './_extendedAxesPure.js';

/**
 * @param {any} axisResult
 * @param {any} fallbackScore
 * @returns {number}
 */
function scoreOrFallback(axisResult: any, fallbackScore: any) {
    return Number(axisResult?.score || fallbackScore || 0);
}

/**
 * @param {any} elements
 * @param {any} campaigns
 * @param {Record<string, any>} [options]
 * @returns {Record<string, any>}
 */
export function executeCanonicalEis(elements: any, campaigns: any, options: Record<string, any> = {}) {
    const safeElements = Array.isArray(elements) ? elements : [];
    const safeCampaigns = Array.isArray(campaigns) ? campaigns : [];
    const paramsCatalog = Array.isArray(options.paramsCatalog) ? options.paramsCatalog : [];

    const observations = safeElements.flatMap(/** @param {any} e */ (e) =>
        Array.isArray(e?.data?.observations)
            ? e.data.observations.map(/** @param {any} obs */ (obs: any) => ({
            ...obs,
            _elementId: e.id,
            _elementName: e?.data?.name || e.id
        }))
            : [],
    );

    const hasCoordinates = safeElements.some((e) => {
        const c = e?.data?.coordinates;
        const p = e?.data?.position;
        return (c && (c.easting || c.northing)) || (p && (p.x || p.z));
    });
    const hasBoundary = safeElements.some((e) => e.family === 'boundary');
    const hasCampaigns = safeCampaigns.length > 0;
    const hasMultipleCampaigns = safeCampaigns.length >= 2;
    const hasMetadata = safeElements.some((e) => e?.data?.name && e?.data?.description);

    const heuristicFallback = {
        T: hasMetadata ? 4 : 3,
        A: hasCoordinates ? 5 : 2,
        Cp: hasBoundary ? 4 : 3,
        Ty: hasMultipleCampaigns ? 5 : hasCampaigns ? 3 : 2,
        Cs: observations.length > 0 ? 4 : 2,
        Cm: hasMultipleCampaigns ? 4 : 2,
    };

    const campaignStats = safeCampaigns.map((c) => ({
        planned: Number(c?.plannedReadings || c?.planned || 0),
        executed: Number(c?.executedReadings || c?.executed || 0),
    }));

    const axisResults = {
        T: EisCalculator.computeTFromObservations(observations),
        A: EisCalculator.computeAFromModel(safeElements, observations),
        Cp: EisCalculator.computeCpFromCampaigns(campaignStats),
        Ty: EisCalculator.computeTyFromObservations(observations),
        Cs: EisCalculator.computeCsFromObservations(observations, UNITS),
        Cm: EisCalculator.computeCmFromObservations(observations, paramsCatalog),
    };

    const axes = {
        T: scoreOrFallback(axisResults.T, heuristicFallback.T),
        A: scoreOrFallback(axisResults.A, heuristicFallback.A),
        Cp: scoreOrFallback(axisResults.Cp, heuristicFallback.Cp),
        Ty: scoreOrFallback(axisResults.Ty, heuristicFallback.Ty),
        Cs: scoreOrFallback(axisResults.Cs, heuristicFallback.Cs),
        Cm: scoreOrFallback(axisResults.Cm, heuristicFallback.Cm),
    };

    const calc = new EisCalculator(options.weights || EIS_DEFAULT_WEIGHTS);
    const aggregate = calc.calculate(
        axes,
        options.mode || 'geometric',
        options.credentialLevel || 'common',
        options.credentialMultiplier ?? null,
    );

    const axisFormulaRefs = (getCanonicalAxisFormulaRefs() as Record<string, any>);
    /** @type {Record<string, any>} */
    const axisTrace: Record<string, any> = {};
    for (const axis of EIS_FORMULA_AXIS_KEYS) {
        const k = axis as string;
        axisTrace[k] = {
            score: (axes as Record<string, number>)[k],
            formula_ref: axisFormulaRefs[k],
            calculator_fn: `EisCalculator.${
                ({
                    T: 'computeTFromObservations',
                    A: 'computeAFromModel',
                    Cp: 'computeCpFromCampaigns',
                    Ty: 'computeTyFromObservations',
                    Cs: 'computeCsFromObservations',
                    Cm: 'computeCmFromObservations',
                } as Record<string, string>)[k]
            }`,
        };
    }

    // P1-1: ODS Overlay inline no resultado canônico quando opt-in.
    // Default false para manter back-compat com callers existentes.
    let odsOverlay = null;
    if (options.withOdsOverlay) {
        try {
            odsOverlay = computeOdsOverlay(
                { elements: safeElements, readings: observations, campaigns: safeCampaigns, quality: options.quality || {} },
                { weights: options.odsWeights || {} },
            );
        } catch (err: any) {
            console.warn('[canonicalEngine] ODS overlay skipped:', err?.message);
        }
    }

    // CCC-001 CC-15b (Calvin 2026-06-10): 4 eixos extended (V, U, Un, Ex)
    // computados a partir das observações + regras de domínio. Sempre exposto
    // em `progressiveAxes.{V,U,Un,Ex}`. Default sem efeito no EIS Core (back-compat).
    let extendedAxesVm: any = null;
    try {
        const rules: ReadonlyArray<DomainRule> = Array.isArray(options.domainRules) ? options.domainRules : [];
        extendedAxesVm = computeExtendedAxes({
            observations: observations as ReadonlyArray<ObservationRecord>,
            rules,
        });
    } catch (err: any) {
        console.debug('[canonicalEngine] extended-axes skipped:', err?.message || err);
    }

    // FIS-001 Fase 3 (Calvin 2026-06-09): eixo L (Legal Standing).
    // Sempre exposto em `progressiveAxes.L` (back-compat: sem multas → L=5 no-op).
    // Aplicação como redutor no EIS final é opt-in via `options.includeFineImpactInEis`.
    const progressiveAxes: Record<string, any> = {};
    let fineImpactAdjustment: any = null;
    if (extendedAxesVm?.axes) {
        progressiveAxes.V = extendedAxesVm.axes.V;
        progressiveAxes.U = extendedAxesVm.axes.U;
        progressiveAxes.Un = extendedAxesVm.axes.Un;
        progressiveAxes.Ex = extendedAxesVm.axes.Ex;
    }
    try {
        const fineInput: FineImpactAxisInput = {
            fines: options.fines,
            ebitda: options.ebitda,
            ebitdaBrl: options.ebitdaBrl,
            revenue: options.revenue,
            revenueBrl: options.revenueBrl,
            marketValue: options.marketValue,
            marketValueBrl: options.marketValueBrl,
            currency: options.currency,
            absoluteRefAmount: options.absoluteRefAmount,
            windowYears: options.windowYears,
            sectorWeight: options.sectorWeight,
            nowIso: options.nowIso,
        };
        const axisLVm = buildAxisLViewModel(fineInput);
        progressiveAxes.L = axisLVm;
        if (options.includeFineImpactInEis === true) {
            fineImpactAdjustment = applyAxisLToEis(
                Number(aggregate?.eis || 0),
                fineInput,
                { includeFineImpactInEis: true, weight: axisLVm.weight },
            );
        }
    } catch (err: any) {
        console.debug('[canonicalEngine] axis-L skipped:', err?.message || err);
    }

    const eisFinal = fineImpactAdjustment?.applied
        ? Number(fineImpactAdjustment.eis || 0)
        : Number(aggregate?.eis || 0);

    const result = {
        eis: eisFinal,
        eisCore: Number(aggregate?.eis || 0),
        verdict: aggregate?.verdict || 'Critical Data',
        axes,
        adjustedScores: aggregate?.adjustedScores || axes,
        weights: aggregate?.weights || EIS_DEFAULT_WEIGHTS,
        credentialMultiplier: Number(aggregate?.credentialMultiplier || 1),
        formulaModel: 'calculator-canonical-v1',
        aggregateFormulaRef: options.mode === 'veto' ? 'eis.veto.default.v1' : 'eis.aggregate.geometric_weighted.v1',
        axisFormulaRefs,
        axisTrace,
        axisEvidence: axisResults,
        odsOverlay,
        progressiveAxes,
        fineImpactAdjustment,
    };

    // UNC-STRUCTURAL-001 gap #6 - expose last EIS run for exec cards.
    // uExpanded: proxy GUM §5.2 - combina desvio dos axis scores vs. média.
    // Se todos os eixos são próximos da média, incerteza baixa; dispersos = alta.
    try {
        const axisVals = Object.values(axes).map(Number).filter(Number.isFinite);
        const mean = axisVals.reduce((s, v) => s + v, 0) / Math.max(axisVals.length, 1);
        const variance = axisVals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / Math.max(axisVals.length - 1, 1);
        const std = Math.sqrt(variance);
        const uExpanded = Number.isFinite(std) ? (std / 5) * result.eis * 2 : null; // k=2 IC 95%
        if (typeof globalThis !== 'undefined') {
            (globalThis as any).__ecbytsLastEIS = {
                score: result.eis,
                verdict: result.verdict,
                uExpanded,
                ts: Date.now(),
            };
        }
    } catch (e: any) {
        console.debug('[canonicalEngine] uncertaintyExpand:', e?.message || e);
    }

    return result;
}
