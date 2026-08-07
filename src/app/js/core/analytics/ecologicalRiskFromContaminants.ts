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

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

/**
 * Ecological Risk Assessment from Contaminants
 *
 * Implements hazard quotient and probabilistic risk methods:
 * - US EPA (1998). Guidelines for Ecological Risk Assessment. EPA/630/R-95/002F.
 *   https://www.epa.gov/sites/default/files/2014-11/documents/eco_risk_assessment1998.pdf
 * - CCME (2007). A Protocol for the Derivation of Environmental Quality Guidelines.
 *   Canadian Council of Ministers of the Environment. DOI:10.5962/bhl.title.39182
 * - Posthuma, L., Suter, G.W. & Traas, T.P. (2002). Species Sensitivity Distributions
 *   in Ecotoxicology. CRC Press. ISBN:1-56670-578-9
 *
 * Zero dependencies: no DOM, IDB, Three.js, or fetch.
 *
 * @module ecologicalRiskFromContaminants
 */

/**
 * Computes the Hazard Quotient (HQ) for a single receptor-contaminant pair.
 * Quociente de Risco (HQ) para um par receptor-contaminante segundo US EPA (1998).
 *
 * HQ = exposure_concentration / effects_threshold (NOEC or HC5)
 *
 * @param exposureConc   - Measured or modeled exposure concentration [same unit as threshold]
 * @param effectsThreshold - Benchmark: NOEC, PNEC, or HC5 [same unit]
 */
export function hazardQuotient(
    exposureConc: number,
    effectsThreshold: number,
): { hq: number; riskDriver: boolean } {
    if (typeof exposureConc !== 'number' || typeof effectsThreshold !== 'number') {
        throw new TypeError('exposureConc and effectsThreshold must be numbers');
    }
    if (exposureConc < 0) throw new RangeError('exposureConc must be >= 0');
    if (effectsThreshold <= 0) throw new RangeError('effectsThreshold must be > 0');

    const hq = exposureConc / effectsThreshold;
    // Quociente >= 1 indica risco ecológico potencial (risk driver)
    const riskDriver = hq >= 1;
    return { hq, riskDriver };
}

/**
 * Computes the Hazard Index (HI) as the sum of HQs across multiple contaminants or pathways.
 * Índice de Perigo (HI) como soma dos quocientes individuais - pressupõe aditividade dose-resposta.
 *
 * @param hqList - Array of HQ results from hazardQuotient()
 */
export function hazardIndex(hqList: Array<{ hq: number }>): { hi: number; riskDriver: boolean } {
    if (!Array.isArray(hqList) || hqList.length === 0) {
        throw new TypeError('hqList must be a non-empty array');
    }
    for (const item of hqList) {
        if (typeof item.hq !== 'number' || item.hq < 0) {
            throw new TypeError('Each item in hqList must have a non-negative numeric hq property');
        }
    }
    const hi = hqList.reduce((sum, { hq }) => sum + hq, 0);
    return { hi, riskDriver: hi >= 1 };
}

/**
 * Fits a lognormal Species Sensitivity Distribution (SSD) and returns the HC5 and PAF.
 * Ajuste lognormal de Distribuição de Sensibilidade de Espécies (SSD) conforme CCME (2007).
 *
 * The SSD characterizes the fraction of species affected (PAF) at a given concentration.
 * HC5 = 5th percentile hazardous concentration (protects 95% of species).
 *
 * Inputs: array of NOEC/EC10 values (one per tested species).
 * Method: fit lognormal via log-transformed mean and standard deviation.
 *
 * @param noecValues         - Array of NOEC or EC10 values [any consistent unit]
 * @param exposureConc       - Exposure concentration for PAF calculation [same unit]
 */
export function ssdLognormal(
    noecValues: number[],
    exposureConc: number,
): { hc5: number; paf: number; mu: number; sigma: number } {
    if (!Array.isArray(noecValues) || noecValues.length < 3) {
        throw new TypeError('noecValues must be an array of at least 3 values');
    }
    if (noecValues.some((v) => typeof v !== 'number' || v <= 0)) {
        throw new RangeError('All noecValues must be positive numbers');
    }
    if (typeof exposureConc !== 'number' || exposureConc < 0) {
        throw new RangeError('exposureConc must be a non-negative number');
    }

    // Transformação logarítmica (base e) - ajuste por máxima verossimilhança simplificado
    const logValues = noecValues.map((v) => Math.log(v));
    const n = logValues.length;

    // Média e desvio padrão na escala logarítmica
    const mu = logValues.reduce((s, v) => s + v, 0) / n;
    const variance = logValues.reduce((s, v) => s + (v - mu) ** 2, 0) / (n - 1);
    const sigma = Math.sqrt(variance);

    if (sigma === 0) throw new RangeError('All noecValues are identical — cannot fit SSD (sigma = 0)');

    // HC5 = exp(mu + z_0.05 * sigma)  onde z_0.05 ≈ -1.6449 (percentil 5 da normal padrão)
    const z05 = -1.6449;
    const hc5 = Math.exp(mu + z05 * sigma);

    // PAF (fração de espécies afetadas) na concentração de exposição:
    // PAF = Φ((ln(C) - mu) / sigma)  - CDF da normal padrão
    const zExposure = (Math.log(Math.max(exposureConc, 1e-300)) - mu) / sigma;
    const paf = standardNormalCDF(zExposure);

    return { hc5, paf, mu, sigma };
}

/**
 * Standard normal CDF via Abramowitz & Stegun approximation (1964), §26.2.17.
 * CDF normal padrão por aproximação polinomial - erro máximo < 7.5e-8.
 *
 * @param z - Standard normal variate
 */
function standardNormalCDF(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const phi = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
    return z >= 0 ? phi : 1 - phi;
}

/**
 * Classifies ecological risk level based on Hazard Index or PAF.
 * Classifica o nível de risco ecológico com base no HI ou PAF conforme US EPA (1998).
 *
 * Uses PAF when provided (probabilistic); falls back to HI (deterministic).
 *
 * @param hi           - Hazard Index (sum of HQs) [-]
 * @param paf          - Fraction of species affected [0–1] from SSD (optional)
 */
export function classifyEcologicalRisk(
    hi: number,
    paf: number | null = null,
): { level: string; description: string; hi: number; paf: number | null } {
    if (typeof hi !== 'number') throw new TypeError('hi must be a number');
    if (hi < 0) throw new RangeError('hi must be >= 0');
    if (paf !== null && (typeof paf !== 'number' || paf < 0 || paf > 1)) {
        throw new RangeError('paf must be a number between 0 and 1, or null');
    }

    // Classificação baseada em PAF quando disponível (mais rigorosa)
    if (paf !== null) {
        if (paf < 0.05) return { level: 'negligible', description: 'Negligible ecological risk — PAF < 5%', hi, paf };
        if (paf < 0.2) return { level: 'low', description: 'Low ecological risk — PAF 5–20%', hi, paf };
        if (paf < 0.5) return { level: 'moderate', description: 'Moderate ecological risk — PAF 20–50%', hi, paf };
        return { level: 'high', description: 'High ecological risk — PAF >= 50%', hi, paf };
    }

    // Classificação pelo HI (determinística) conforme US EPA (1998)
    if (hi < 0.1) return { level: 'negligible', description: 'Negligible ecological risk — HI < 0.1', hi, paf };
    if (hi < 1.0) return { level: 'low', description: 'Low ecological risk — HI < 1', hi, paf };
    if (hi < 10) return { level: 'moderate', description: 'Moderate ecological risk — HI 1–10', hi, paf };
    return { level: 'high', description: 'High ecological risk — HI >= 10', hi, paf };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const ecologicalRiskFromContaminantsMeta: AnalyticsModuleMeta = {
    name: 'ecologicalRiskFromContaminants',
    description: 'ecologicalRiskFromContaminants',
    category: 'analytics',
    familyTags: ['contamination', 'ecosystem', 'risk'],
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
