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
 * Soil Biological Activity Index (SBAI)
 *
 * Implements soil health assessment via microbial activity indicators.
 *
 * References:
 * - Anderson, T.H. & Domsch, K.H. (1989). Ratios of microbial biomass carbon to total
 *   organic carbon in arable soils. Soil Biology and Biochemistry, 21(4), 471-479.
 *   https://doi.org/10.1016/0038-0717(89)90117-X
 * - Doran, J.W. & Parkin, T.B. (1994). Defining and Assessing Soil Quality. In
 *   Defining Soil Quality for a Sustainable Environment. SSSA Special Publication 35.
 *   https://doi.org/10.2136/sssaspecpub35.c1
 * - EMBRAPA (2010). Manual de Métodos de Análise de Solo. 2a ed. Rio de Janeiro: EMBRAPA.
 *   ISBN: 9788585347611
 *
 * Zero dependencies on DOM, IndexedDB, Three.js, or fetch.
 * All inputs in SI units unless noted.
 *
 * @module soilBiologicalActivityIndex
 */

// ---- Constants / Limites de referência ----

/** Classificação de saúde do solo por SQBI (adimensional, 0-1) */
const SOIL_HEALTH_CLASSES = [
    { label: 'degraded', min: 0, max: 0.2 },
    { label: 'poor', min: 0.2, max: 0.4 },
    { label: 'moderate', min: 0.4, max: 0.6 },
    { label: 'good', min: 0.6, max: 0.8 },
    { label: 'excellent', min: 0.8, max: 1.01 },
];

/** Faixas de qCO₂ (µg CO₂-C / mg CBM / h) — Anderson & Domsch 1989 */
const QCO2_REFERENCE = { low: 1.5, high: 5.0 };

// ---- Soil Basal Respiration (SBR) ----

/**
 * Calculates Soil Basal Respiration (SBR).
 * Respiração basal: CO₂ liberado pela atividade microbiana em condições de laboratório.
 *
 * @param {number} co2Released_mg - CO₂ released (mg CO₂) over incubation period
 * @param {number} soilMass_g     - Dry soil mass (g)
 * @param {number} incubationHours - Incubation time (hours)
 * @returns {number} SBR in µg CO₂-C g⁻¹ soil h⁻¹
 */
export function calculateSBR(co2Released_mg: any, soilMass_g: any, incubationHours: any) {
    if (typeof co2Released_mg !== 'number' || typeof soilMass_g !== 'number' || typeof incubationHours !== 'number') {
        throw new TypeError('All arguments must be numbers');
    }
    if (co2Released_mg < 0) throw new RangeError('co2Released_mg must be >= 0');
    if (soilMass_g <= 0) throw new RangeError('soilMass_g must be > 0');
    if (incubationHours <= 0) throw new RangeError('incubationHours must be > 0');

    // CO₂ para C: fator 12/44 (razão molar C/CO₂)
    // µg = mg × 1000; dividir por g de solo e horas
    const sbr = (co2Released_mg * (12 / 44) * 1000) / (soilMass_g * incubationHours);
    return sbr;
}

// ---- Microbial Biomass Carbon (CBM) - fumigation-extraction ----

/**
 * Calculates Microbial Biomass Carbon (CBM) via fumigation-extraction (Vance et al. 1987).
 * Carbono da biomassa microbiana pelo método de fumigação-extração.
 *
 * @param {number} cFumigated_µg   - Extractable C in fumigated soil (µg C g⁻¹)
 * @param {number} cUnfumigated_µg - Extractable C in unfumigated control (µg C g⁻¹)
 * @param {number} kEC             - Extraction efficiency coefficient (default 0.45, Jenkinson 1988)
 * @returns {number} CBM in µg C g⁻¹ soil
 */
export function calculateCBM(cFumigated_µg: any, cUnfumigated_µg: any, kEC = 0.45) {
    if (typeof cFumigated_µg !== 'number' || typeof cUnfumigated_µg !== 'number' || typeof kEC !== 'number') {
        throw new TypeError('All arguments must be numbers');
    }
    if (cFumigated_µg < 0 || cUnfumigated_µg < 0) throw new RangeError('C values must be >= 0');
    if (kEC <= 0 || kEC > 1) throw new RangeError('kEC must be in (0, 1]');

    const ec = cFumigated_µg - cUnfumigated_µg;
    if (ec < 0) return 0; // controle maior que fumigado: biomassa nula
    return ec / kEC;
}

// ---- Metabolic Quotient (qCO₂) ----

/**
 * Calculates Metabolic Quotient (qCO₂).
 * Quociente metabólico: eficiência do uso de carbono pela biomassa microbiana.
 * Valores altos indicam estresse ambiental (poluição, compactação, baixo pH).
 *
 * @param {number} sbr  - Soil Basal Respiration (µg CO₂-C g⁻¹ soil h⁻¹)
 * @param {number} cbm  - Microbial Biomass Carbon (µg C g⁻¹ soil)
 * @returns {{ qCO2: number, stressLevel: string }} qCO₂ in µg CO₂-C / mg CBM / h + interpretation
 */
export function calculateQCO2(sbr: any, cbm: any) {
    if (typeof sbr !== 'number' || typeof cbm !== 'number') {
        throw new TypeError('sbr and cbm must be numbers');
    }
    if (sbr < 0) throw new RangeError('sbr must be >= 0');
    if (cbm <= 0) throw new RangeError('cbm must be > 0');

    // CBM em µg → mg: dividir por 1000
    const qCO2 = sbr / (cbm / 1000);

    let stressLevel;
    if (qCO2 < QCO2_REFERENCE.low) stressLevel = 'low';
    else if (qCO2 <= QCO2_REFERENCE.high) stressLevel = 'moderate';
    else stressLevel = 'high';

    return { qCO2, stressLevel };
}

// ---- Soil Quality Biological Index (SQBI) ----

/**
 * Calculates Soil Quality Biological Index (SQBI).
 * Índice composto de qualidade biológica do solo - média ponderada de indicadores normalizados.
 * Adaptado de Doran & Parkin (1994) e EMBRAPA (2010).
 *
 * @param {object} indicators - Object with indicator values
 * @param {number} indicators.sbr       - Soil Basal Respiration (µg CO₂-C g⁻¹ h⁻¹)
 * @param {number} indicators.cbm       - Microbial Biomass Carbon (µg C g⁻¹)
 * @param {number} indicators.qCO2      - Metabolic Quotient (µg CO₂-C / mg CBM / h)
 * @param {number} indicators.totalC_pct - Total organic carbon (%)
 * @param {object} [references]         - Optional reference maxima for normalization
 * @returns {{ sqbi: number, classification: string, scores: object }} SQBI score 0-1
 */
export function calculateSQBI(indicators: any, references = {}) {
    if (typeof indicators !== 'object' || indicators === null) {
        throw new TypeError('indicators must be a non-null object');
    }
    const ind = /** @type {Record<string, number>} */ (indicators);
    const refs = /** @type {Record<string, number>} */ (references);
    const required = ['sbr', 'cbm', 'qCO2', 'totalC_pct'];
    for (const k of required) {
        if (typeof ind[k] !== 'number') throw new TypeError(`indicators.${k} must be a number`);
        if (ind[k] < 0) throw new RangeError(`indicators.${k} must be >= 0`);
    }

    // Referências padrão (solos tropicais brasileiros, EMBRAPA 2010)
    const ref = {
sbr_max: (refs as any).sbr_max ?? 10, // µg CO₂-C g⁻¹ h⁻¹
        cbm_max: (refs as any).cbm_max ?? 600, // µg C g⁻¹
        qCO2_max: (refs as any).qCO2_max ?? 10, // µg CO₂-C / mg CBM / h (invertido: menor = melhor)
        totalC_max: (refs as any).totalC_max ?? 4, // %
    };

    // Normalização 0-1 (higher is better, exceto qCO₂ que é invertido)
    const sbrScore = Math.min(indicators.sbr / ref.sbr_max, 1);
    const cbmScore = Math.min(indicators.cbm / ref.cbm_max, 1);
    const qCO2Score = Math.max(0, 1 - indicators.qCO2 / ref.qCO2_max); // invertido
    const totalCScore = Math.min(indicators.totalC_pct / ref.totalC_max, 1);

    // Pesos baseados em Doran & Parkin 1994
    const weights = { sbr: 0.25, cbm: 0.35, qCO2: 0.2, totalC: 0.2 };
    const sqbi =
        sbrScore * weights.sbr + cbmScore * weights.cbm + qCO2Score * weights.qCO2 + totalCScore * weights.totalC;

    // Classificação por faixa
    const cls = SOIL_HEALTH_CLASSES.find((c) => sqbi >= c.min && sqbi < c.max) ?? SOIL_HEALTH_CLASSES[0];

    return {
        sqbi,
classification: (cls as any).label,
        scores: { sbr: sbrScore, cbm: cbmScore, qCO2: qCO2Score, totalC: totalCScore },
    };
}

// ---- Soil Health Report ----

/**
 * Generates a complete soil biological health report from raw measurements.
 * Gera relatório completo de saúde biológica do solo a partir de dados brutos.
 *
 * @param {object} raw - Raw measurements
 * @param {number} raw.co2Released_mg  - CO₂ released during incubation (mg)
 * @param {number} raw.soilMass_g      - Dry soil mass (g)
 * @param {number} raw.incubationHours - Incubation hours
 * @param {number} raw.cFumigated_µg   - Extractable C fumigated (µg C g⁻¹)
 * @param {number} raw.cUnfumigated_µg - Extractable C control (µg C g⁻¹)
 * @param {number} raw.totalC_pct      - Total organic carbon (%)
 * @param {number} [raw.kEC]           - Extraction efficiency coefficient
 * @returns {object} Full report with SBR, CBM, qCO₂, SQBI, classification
 */
export function generateSoilHealthReport(raw: any) {
    if (typeof raw !== 'object' || raw === null) throw new TypeError('raw must be an object');

    const sbr = calculateSBR(raw.co2Released_mg, raw.soilMass_g, raw.incubationHours);
    const cbm = calculateCBM(raw.cFumigated_µg, raw.cUnfumigated_µg, raw.kEC ?? 0.45);
    const { qCO2, stressLevel } = calculateQCO2(sbr, cbm > 0 ? cbm : 1e-6);
    const { sqbi, classification, scores } = calculateSQBI({
        sbr,
        cbm,
        qCO2,
        totalC_pct: raw.totalC_pct,
    });

    return {
        sbr,
        cbm,
        qCO2,
        stressLevel,
        sqbi,
        classification,
        scores,
        units: {
            sbr: 'µg CO₂-C g⁻¹ soil h⁻¹',
            cbm: 'µg C g⁻¹ soil',
            qCO2: 'µg CO₂-C / mg CBM / h',
            sqbi: 'dimensionless (0–1)',
        },
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilBiologicalActivityIndexMeta = {
    name: 'soilBiologicalActivityIndex',
    description: 'soilBiologicalActivityIndex',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
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
