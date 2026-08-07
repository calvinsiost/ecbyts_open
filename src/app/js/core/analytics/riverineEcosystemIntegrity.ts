// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Riverine Ecosystem Integrity - Index of Biotic Integrity (IBI) + Rapid Bioassessment Protocol (RBP)
 *
 * Academic references:
 * - Karr, J.R. (1981). Assessment of biotic integrity using fish communities. Fisheries, 6(6), 21–27.
 *   DOI: 10.1577/1548-8446(1981)006<0021:AOBIUF>2.0.CO;2
 * - Barbour, M.T. et al. (1999). Rapid Bioassessment Protocols for Use in Streams and Wadeable Rivers.
 *   EPA 841-B-99-002. U.S. EPA. https://www.epa.gov/sites/default/files/2015-09/documents/rbpmanual.pdf
 * - IBGE/MMA (2010). Indicadores de Desenvolvimento Sustentavel - Brasil 2010. IBGE.
 *   ISBN: 978-85-240-4163-0
 *
 * @module riverineEcosystemIntegrity
 */

// ---- IBI metric weight constants (Karr 1981, Table 1) ----
// Pesos das 12 métricas do IBI para peixes de riachos temperados-tropicais adaptados

/** @type {string[]} IBI metric identifiers */
export const IBI_METRICS = [
    'species_richness', // M1: total number of fish species
    'darter_species', // M2: number of darter/benthic species
    'sunfish_species', // M3: number of sunfish/generalist species
    'intolerant_species', // M4: number of sensitive/intolerant species
    'percent_tolerant', // M5: % individuals as tolerant species (inverse)
    'percent_omnivores', // M6: % individuals as omnivores (inverse)
    'percent_insectivores', // M7: % individuals as insectivores
    'percent_top_piscivores', // M8: % individuals as top carnivores
    'total_individuals', // M9: total number of individuals sampled
    'percent_hybrids', // M10: % individuals as hybrids (inverse)
    'percent_diseased', // M11: % individuals with disease/anomalies (inverse)
    'native_species_ratio', // M12: ratio of native to total species
] as const;

export type IBIMetric = (typeof IBI_METRICS)[number];

/**
 * Score thresholds for each IBI metric (5/3/1 scoring).
 * Adapted for Brazilian neotropical streams (IBGE/MMA 2010).
 *
 * @typedef {Object} MetricThresholds
 * @property {number} excellent - score 5 threshold
 * @property {number} good      - score 3 threshold
 */

/** @type {Record<IBIMetric, MetricThresholds>} */
const IBI_THRESHOLDS: Record<IBIMetric, MetricThresholds> = {
    species_richness: { excellent: 12, good: 7 },
    darter_species: { excellent: 5, good: 3 },
    sunfish_species: { excellent: 4, good: 2 },
    intolerant_species: { excellent: 4, good: 2 },
    percent_tolerant: { excellent: 5, good: 20 }, // lower is better
    percent_omnivores: { excellent: 10, good: 25 }, // lower is better
    percent_insectivores: { excellent: 45, good: 25 },
    percent_top_piscivores: { excellent: 5, good: 2 },
    total_individuals: { excellent: 100, good: 50 },
    percent_hybrids: { excellent: 0, good: 2 }, // lower is better
    percent_diseased: { excellent: 0, good: 2 }, // lower is better
    native_species_ratio: { excellent: 0.9, good: 0.7 },
};

interface MetricThresholds {
    readonly excellent: number;
    readonly good: number;
}

// Métricas inversas: valores menores indicam melhor qualidade
const INVERSE_METRICS = new Set<IBIMetric>([
    'percent_tolerant',
    'percent_omnivores',
    'percent_hybrids',
    'percent_diseased',
]);

function assertKnownMetric(metricId: string): asserts metricId is IBIMetric {
    if (!(metricId in IBI_THRESHOLDS)) {
        throw new TypeError(`Unknown IBI metric: "${metricId}". Valid: ${IBI_METRICS.join(', ')}`);
    }
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
    if (typeof value !== 'number' || !isFinite(value)) {
        throw new TypeError(`${label} must be a finite number, got: ${value}`);
    }
}

function scoreFromThresholds(value: number, thresholds: MetricThresholds, inverse: boolean): 1 | 3 | 5 {
    if (inverse) {
        if (value <= thresholds.excellent) return 5;
        if (value <= thresholds.good) return 3;
        return 1;
    }
    if (value >= thresholds.excellent) return 5;
    if (value >= thresholds.good) return 3;
    return 1;
}

/**
 * Score a single IBI metric on a 1/3/5 scale.
 * Pontua uma métrica IBI individual (escala 1/3/5 de Karr 1981).
 *
 * @param {string} metricId - metric identifier from IBI_METRICS
 * @param {number} value    - observed value
 * @returns {1|3|5} score
 */
export function scoreIBIMetric(metricId: string, value: number): 1 | 3 | 5 {
    assertKnownMetric(metricId);
    assertFiniteNumber(value, 'IBI metric value');
    const thresholds = IBI_THRESHOLDS[metricId];
    return scoreFromThresholds(value, thresholds, INVERSE_METRICS.has(metricId));
}

function assertFiniteNumberInRange(value: number, label: string, min: number, max: number): void {
    if (value < min || value > max) {
        throw new RangeError(`${label} must be in [${min}, ${max}], got: ${value}`);
    }
}

function assertNonNegativeFinite(value: number, label: string): void {
    if (typeof value !== 'number' || !isFinite(value) || value < 0) {
        throw new RangeError(`${label} must be a finite non-negative number, got: ${value}`);
    }
}

function assertPercent(value: number, label: string): void {
    assertNonNegativeFinite(value, label);
    if (value > 100) {
        throw new RangeError(`${label} must be in [0, 100], got: ${value}`);
    }
}

/**
 * Calculate the full Index of Biotic Integrity (IBI) from 12 fish community metrics.
 * Calcula o IBI completo (Karr 1981) a partir de métricas da comunidade de peixes.
 *
 * @param {Record<string, number>} metrics - key-value pairs of metric id → observed value
 * @returns {{ ibi: number, scores: Record<string, number>, classification: string }}
 */
export function calculateIBI(metrics: Record<string, number>): { ibi: number; scores: Record<string, number>; classification: string } {
    if (typeof metrics !== 'object' || metrics === null || Array.isArray(metrics)) {
        throw new TypeError('metrics must be a non-null object');
    }
    const missing = IBI_METRICS.filter((m) => !(m in metrics));
    if (missing.length > 0) {
        throw new RangeError(`Missing IBI metrics: ${missing.join(', ')}`);
    }

    const scores: Record<string, number> = {};
    let total = 0;
    for (const metricId of IBI_METRICS) {
        const raw = metrics[metricId];
        if (typeof raw !== 'number' || !isFinite(raw)) {
            throw new TypeError(`IBI metric "${metricId}" must be a finite number, got: ${raw}`);
        }
        const s = scoreIBIMetric(metricId, raw);
        scores[metricId] = s;
        total += s;
    }

    // IBI = soma dos scores das 12 métricas (máximo 60)
    const ibi = total;
    return { ibi, scores, classification: classifyIBI(ibi) };
}

/**
 * Classify IBI score into integrity class.
 * Classifica o score IBI em classe de integridade (Karr 1981, Table 3).
 *
 * @param {number} ibi - IBI score (0–60)
 * @returns {string} classification label
 */
export function classifyIBI(ibi: number): string {
    assertFiniteNumber(ibi, 'IBI');
    assertFiniteNumberInRange(ibi, 'IBI score', 0, 60);
    if (ibi >= 58) return 'pristine';
    if (ibi >= 48) return 'good';
    if (ibi >= 36) return 'fair';
    if (ibi >= 24) return 'poor';
    return 'very_poor';
}

// ---- Rapid Bioassessment Protocol (RBP) - Habitat Quality ----
// Protocolo de Avaliação Rápida de Habitat (Barbour et al. 1999, Table 5.1)

/** @type {string[]} RBP habitat parameter identifiers */
export const RBP_PARAMETERS = [
    'epifaunal_substrate', // H1: epifaunal substrate/available cover
    'pool_substrate', // H2: pool substrate characterization
    'pool_variability', // H3: pool variability
    'sediment_deposition', // H4: sediment deposition (inverse)
    'channel_flow_status', // H5: channel flow status
    'channel_alteration', // H6: channel alteration (inverse)
    'channel_sinuosity', // H7: channel sinuosity
    'bank_stability', // H8: bank stability
    'vegetative_protection', // H9: vegetative protection
    'riparian_zone_width', // H10: riparian zone width
] as const;

export type RBPParameter = (typeof RBP_PARAMETERS)[number];

function assertRBPParameterValue(param: RBPParameter, value: unknown): asserts value is number {
    if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 20) {
        throw new RangeError(`RBP parameter "${param}" must be a number in [0, 20], got: ${value}`);
    }
}

/**
 * Calculate RBP Habitat Quality Score (0–200 scale, Barbour et al. 1999).
 * Calcula o score de qualidade de habitat RBP a partir de 10 parâmetros visuais.
 *
 * @param {Record<string, number>} params - each parameter scored 0–20
 * @returns {{ rbpScore: number, totalPossible: number, percent: number, rating: string }}
 */
export function calculateRBP(params: Record<string, number>): { rbpScore: number; totalPossible: number; percent: number; rating: string } {
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
        throw new TypeError('params must be a non-null object');
    }
    const missing = RBP_PARAMETERS.filter((p) => !(p in params));
    if (missing.length > 0) {
        throw new RangeError(`Missing RBP parameters: ${missing.join(', ')}`);
    }

    let total = 0;
    for (const param of RBP_PARAMETERS) {
        const v = params[param];
        assertRBPParameterValue(param, v);
        total += v;
    }

    const percent = (total / 200) * 100;
    return {
        rbpScore: total,
        totalPossible: 200,
        percent,
        rating: classifyRBP(percent),
    };
}

function classifyByRanges(value: number, ranges: readonly { min: number; label: string }[]): string {
    for (const range of ranges) {
        if (value >= range.min) return range.label;
    }
    return ranges[ranges.length - 1]?.label ?? 'unknown';
}

/**
 * Classify RBP percent score.
 * Classifica percentual do RBP em categoria de qualidade de habitat.
 *
 * @param {number} percent - 0–100
 * @returns {string} rating
 */
function classifyRBP(percent: number): string {
    return classifyByRanges(percent, [
        { min: 75, label: 'pristine' },
        { min: 60, label: 'good' },
        { min: 40, label: 'fair' },
        { min: 25, label: 'poor' },
        { min: -Infinity, label: 'very_poor' },
    ]);
}

// ---- Riparian Quality Index (RQI) ----
// Índice de Qualidade do Ripário (adaptado de González del Tánago & García de Jalón 2006)

interface RQIOptions {
    readonly canopyCover: number;
    readonly nativeSpecies: number;
    readonly bufferWidth: number;
    readonly connectedness: number;
    readonly humanImpact: number;
}

const RQI_FIELDS: readonly (keyof RQIOptions)[] = ['canopyCover', 'nativeSpecies', 'bufferWidth', 'connectedness', 'humanImpact'];

function assertRQIOptions(opts: unknown): asserts opts is RQIOptions {
    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
        throw new TypeError('RQI options must be a non-null object');
    }
    const record = opts as Record<string, unknown>;
    for (const name of RQI_FIELDS) {
        const val = record[name];
        assertNonNegativeFinite(val as number, `RQI parameter "${name}"`);
    }

    assertPercent(record.canopyCover as number, 'canopyCover');
    assertPercent(record.nativeSpecies as number, 'nativeSpecies');
    if ((record.connectedness as number) > 10) throw new RangeError(`connectedness must be in [0, 10], got: ${record.connectedness}`);
    if ((record.humanImpact as number) > 10) throw new RangeError(`humanImpact must be in [0, 10], got: ${record.humanImpact}`);
}

function classifyRQI(rqi: number): string {
    return classifyByRanges(rqi, [
        { min: 80, label: 'pristine' },
        { min: 60, label: 'good' },
        { min: 40, label: 'fair' },
        { min: 20, label: 'poor' },
        { min: -Infinity, label: 'very_poor' },
    ]);
}

/**
 * Calculate Riparian Quality Index (RQI) score.
 * Calcula o Índice de Qualidade do Ripário a partir de 5 atributos.
 *
 * @param {Object} opts
 * @param {number} opts.canopyCover     - % tree canopy cover (0–100)
 * @param {number} opts.nativeSpecies   - % native plant species (0–100)
 * @param {number} opts.bufferWidth     - riparian buffer width in meters (0–∞)
 * @param {number} opts.connectedness   - lateral connectivity score (0–10)
 * @param {number} opts.humanImpact     - human impact index (0–10, lower is better)
 * @returns {{ rqi: number, classification: string }}
 */
export function calculateRQI(opts: unknown): { rqi: number; classification: string } {
    assertRQIOptions(opts);

    const { canopyCover, nativeSpecies, bufferWidth, connectedness, humanImpact } = opts;

    // Normalizar bufferWidth: 0m=0, >=30m=10
    const bufferScore = Math.min(bufferWidth / 3, 10);

    // Soma ponderada (todos pesos iguais = 1) e normalização para 0–100
    const rawScore = canopyCover / 10 + nativeSpecies / 10 + bufferScore + connectedness + (10 - humanImpact);
    const rqi = Math.min((rawScore / 50) * 100, 100);

    return { rqi: Math.round(rqi * 100) / 100, classification: classifyRQI(rqi) };
}

interface CompositeOptions {
    readonly ibi: number;
    readonly rbpPercent: number;
    readonly rqi: number;
    readonly wIBI?: number;
    readonly wRBP?: number;
    readonly wRQI?: number;
}

function normalizeWeights(wIBI: number, wRBP: number, wRQI: number): void {
    assertFiniteNumber(wIBI, 'wIBI');
    assertFiniteNumber(wRBP, 'wRBP');
    assertFiniteNumber(wRQI, 'wRQI');

    const wSum = wIBI + wRBP + wRQI;
    if (Math.abs(wSum - 1.0) > 1e-9) throw new RangeError(`Weights must sum to 1.0, got: ${wSum}`);
}

function assertCompositeOptions(opts: unknown): asserts opts is CompositeOptions {
    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
        throw new TypeError('composite options must be a non-null object');
    }
    const record = opts as Record<string, unknown>;
    assertFiniteNumber(record.ibi, 'ibi');
    assertFiniteNumber(record.rbpPercent, 'rbpPercent');
    assertFiniteNumber(record.rqi, 'rqi');

    assertFiniteNumberInRange(record.ibi as number, 'ibi', 0, 60);
    assertFiniteNumberInRange(record.rbpPercent as number, 'rbpPercent', 0, 100);
    assertFiniteNumberInRange(record.rqi as number, 'rqi', 0, 100);
}

/**
 * Composite Riverine Integrity Score from IBI + RBP + RQI.
 * Score composto de integridade fluvial integrando IBI, RBP e RQI.
 *
 * @param {Object} opts
 * @param {number} opts.ibi        - IBI score (0–60)
 * @param {number} opts.rbpPercent - RBP percent (0–100)
 * @param {number} opts.rqi        - RQI score (0–100)
 * @param {number} [opts.wIBI=0.5]    - weight for IBI (default 0.5)
 * @param {number} [opts.wRBP=0.3]    - weight for RBP (default 0.3)
 * @param {number} [opts.wRQI=0.2]    - weight for RQI (default 0.2)
 * @returns {{ compositeScore: number, classification: string, components: Object }}
 */
export function compositeRiverineIntegrity(opts: unknown): { compositeScore: number; classification: string; components: { ibiNorm: number; rbpPercent: number; rqi: number } } {
    assertCompositeOptions(opts);
    const { ibi, rbpPercent, rqi, wIBI = 0.5, wRBP = 0.3, wRQI = 0.2 } = opts;
    normalizeWeights(wIBI, wRBP, wRQI);

    // Normalizar IBI para 0–100
    const ibiNorm = (ibi / 60) * 100;

    const compositeScore = wIBI * ibiNorm + wRBP * rbpPercent + wRQI * rqi;
    const classification = classifyByRanges(compositeScore, [
        { min: 80, label: 'pristine' },
        { min: 60, label: 'good' },
        { min: 40, label: 'fair' },
        { min: 25, label: 'poor' },
        { min: -Infinity, label: 'very_poor' },
    ]);

    return {
        compositeScore: Math.round(compositeScore * 100) / 100,
        classification,
        components: { ibiNorm: Math.round(ibiNorm * 100) / 100, rbpPercent, rqi },
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverineEcosystemIntegrityMeta = {
    name: 'riverineEcosystemIntegrity',
    description: 'riverineEcosystemIntegrity',
    category: 'analytics',
    familyTags: ['ecosystem', 'river'],
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
