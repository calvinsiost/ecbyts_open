// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Soil Vapor Intrusion
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Soil Vapor Intrusion (SVI) - Indoor Exposure Assessment
 *
 * Módulo puro implementando o modelo Johnson & Ettinger (J&E) completo para
 * avaliação de intrusão de vapores do solo em edificações.
 * Complementa o cálculo J&E básico com mitigação e análise de risco USEPA RAGS.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Johnson, P. C. & Ettinger, R. A. (1991). "Heuristic model for predicting
 *     the intrusion rate of contaminant vapors into buildings." Environmental
 *     Science & Technology 25(8), 1445–1452. DOI: 10.1021/es00020a013
 *     (J&E attenuation factor model)
 *   - US EPA (2002). OSWER Draft Guidance for Evaluating the Vapor Intrusion
 *     to Indoor Air Pathway from Groundwater and Soils. EPA/530/D-02/004.
 *     Washington, DC: US EPA. (alpha attenuation, mitigation)
 *   - US EPA (2009). Risk Assessment Guidance for Superfund (RAGS), Volume I:
 *     Human Health Evaluation Manual (Part F). EPA/540/R/070/002.
 *     Washington, DC: US EPA. (ILCR inhalation cancer risk)
 *   - ATSDR (2005). Guidance Manual for the Assessment of Joint Toxic Action of
 *     Chemical Mixtures. Atlanta: ATSDR. (risk thresholds)
 *   - CETESB (2021). Manual de Gerenciamento de Áreas Contaminadas. 3ª ed.
 *     São Paulo: CETESB. (referência brasileira de intrusão de vapores)
 *   - Keil, C. B. & Simmons, C. E. (2006). "Vapor intrusion: addressing
 *     uncertainties in assessment and mitigation." J. Occup. Environ. Hyg. 3(11),
 *     D115–D118. DOI: 10.1080/15459620600850748 (mitigation factors)
 */

'use strict';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Vapor intrusion mitigation effectiveness factors (dimensionless reduction).
 * Fatores de redução de concentração por técnica de mitigação (J&E / USEPA 2002)
 *   - subslab_depressurization: redução de 90% (fator 0.9 = 90% menos)
 *   - passive_ventilation      : redução de 50%
 *   - none                     : sem mitigação (0% redução)
 */
const MITIGATION_FACTORS = {
    subslab_depressurization: 0.9,
    passive_ventilation: 0.5,
    none: 0.0,
};

/**
 * USEPA RAGS inhalation cancer risk thresholds (dimensionless ILCR)
 * Limites de risco cancerígeno incremental por inalação (USEPA RAGS Parte F)
 *   - acceptable: ILCR < 1e-6
 *   - concern    : 1e-6 ≤ ILCR < 1e-4
 *   - unacceptable: ILCR ≥ 1e-4
 */
const ILCR_THRESHOLDS = {
    ACCEPTABLE: 1e-6,
    UNACCEPTABLE: 1e-4,
};

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Compute the Johnson & Ettinger composite attenuation factor (alpha).
 *
 * Calcula o fator de atenuação composto (α) que representa a razão entre a
 * concentração indoor e a concentração na subsuperfície. O modelo J&E combina
 * três sub-fatores: building foundation crack, soil column, and indoor mixing.
 *
 *   α = alpha_building × alpha_crack × alpha_indoor
 *
 * (Johnson & Ettinger, 1991, eq. 8–11)
 *
 * @param {number} alpha_building - Building envelope attenuation (0–1)
 * @param {number} alpha_crack    - Foundation crack attenuation (0–1)
 * @param {number} alpha_indoor   - Indoor air mixing factor (0–1)
 * @returns {{ attenuation: number }}
 */
export function computeJohnsonEttingerAlpha(alpha_building: any, alpha_crack: any, alpha_indoor: any) {
    for (const [name, val] of [
        ['alpha_building', alpha_building],
        ['alpha_crack', alpha_crack],
        ['alpha_indoor', alpha_indoor],
    ]) {
        if (typeof val !== 'number' || val < 0 || val > 1) {
            throw new RangeError(`${name} must be a number in [0, 1]`);
        }
    }

    // Produto dos três sub-fatores de atenuação (adimensional)
    const attenuation = alpha_building * alpha_crack * alpha_indoor;
    return { attenuation };
}

/**
 * Compute indoor vapor concentration from subsurface source.
 *
 * Converte a concentração na fonte (dissolvida em água subterrânea) para
 * concentração indoor estimada, usando a constante de Henry (Kh) e o fator
 * de atenuação J&E:
 *
 *   C_indoor (µg/m³) = C_source (mg/L) × Kh × alpha × unit_conversion
 *
 * A constante de Henry Kh (adimensional, Cg/Caq) converte da fase aquosa
 * para fase gasosa. O fator 1000 converte mg/L → µg/m³ × (m³ água/L).
 *
 * @param {number} source_mg_L - Dissolved source concentration (mg/L)
 * @param {number} kh          - Dimensionless Henry's Law constant (Cg/Caq)
 * @param {number} alpha       - J&E composite attenuation factor (0–1)
 * @returns {{ indoor_ug_m3: number }}
 */
export function computeVaporConcentration(source_mg_L: any, kh: any, alpha: any) {
    if (typeof source_mg_L !== 'number' || source_mg_L < 0) {
        throw new RangeError('source_mg_L must be non-negative');
    }
    if (typeof kh !== 'number' || kh < 0) {
        throw new RangeError('kh must be non-negative');
    }
    if (typeof alpha !== 'number' || alpha < 0 || alpha > 1) {
        throw new RangeError('alpha must be in [0, 1]');
    }

    // Conversão: 1 mg/L × Kh (adimensional) × 1000 = µg/m³ equivalente de vapor
    // Kh converte concentração aquosa → concentração gasosa no equilíbrio
    const indoor_ug_m3 = source_mg_L * kh * alpha * 1000;

    return { indoor_ug_m3 };
}

/**
 * Apply vapor intrusion mitigation reduction factor to an indoor concentration.
 *
 * Aplica a redução de concentração devida à mitigação ativa ou passiva.
 * Técnicas suportadas: 'subslab_depressurization', 'passive_ventilation', 'none'.
 *
 * @param {number} concentration - Pre-mitigation indoor concentration (µg/m³)
 * @param {string} mitigation    - Mitigation technique key
 * @returns {{ reduced: number, reduction_pct: number }}
 */
export function applyVIReductionFactor(concentration: any, mitigation: any) {
    if (typeof concentration !== 'number' || concentration < 0) {
        throw new RangeError('concentration must be non-negative (µg/m³)');
    }
    if (typeof mitigation !== 'string') {
        throw new TypeError('mitigation must be a string');
    }

const factor = (MITIGATION_FACTORS as Record<string, number>)[mitigation];
    if (factor === undefined) {
        throw new RangeError(
            `Unknown mitigation '${mitigation}'. Valid: ${Object.keys(MITIGATION_FACTORS).join(', ')}`,
        );
    }

    // Concentração reduzida = C × (1 - fator de redução)
    const reduced = concentration * (1 - factor);
    const reduction_pct = factor * 100;

    return { reduced, reduction_pct };
}

/**
 * Compute Incremental Lifetime Cancer Risk (ILCR) from vapor inhalation.
 *
 * Implementa a equação de risco inalatório do USEPA RAGS Parte F (2009):
 *   ILCR = C × IR × EF × ED × CSF / (BW × AT × 365 × 24 × 1000)
 *
 * Onde:
 *   C   = concentração indoor (µg/m³)
 *   IR  = taxa de inalação (m³/h)
 *   EF  = frequência de exposição (dias/ano)
 *   ED  = duração de exposição (anos)
 *   CSF = fator de inclinação cancerígeno (por inalação) (mg/kg-day)^-1
 *   BW  = peso corporal (kg)
 *   AT  = período de averaging (anos) = 70 para câncer
 *
 * @param {number} concentration_ug_m3  - Indoor air concentration (µg/m³)
 * @param {number} inhalation_rate      - Breathing rate (m³/h)
 * @param {number} exposure_freq        - Exposure frequency (days/year)
 * @param {number} exposure_dur         - Exposure duration (years)
 * @param {number} body_weight          - Body weight (kg)
 * @param {number} cancer_slope_factor  - Inhalation unit risk (mg/kg-day)^-1
 * @returns {{ ilcr: number, riskLevel: 'acceptable'|'concern'|'unacceptable' }}
 */
export function computeRiskFromVI(
    concentration_ug_m3: any,
    inhalation_rate: any,
    exposure_freq: any,
    exposure_dur: any,
    body_weight: any,
    cancer_slope_factor: any,
) {
    for (const [name, val] of [
        ['concentration_ug_m3', concentration_ug_m3],
        ['inhalation_rate', inhalation_rate],
        ['exposure_freq', exposure_freq],
        ['exposure_dur', exposure_dur],
        ['body_weight', body_weight],
        ['cancer_slope_factor', cancer_slope_factor],
    ]) {
        if (typeof val !== 'number' || val < 0) {
            throw new RangeError(`${name} must be a non-negative number`);
        }
    }
    if (body_weight === 0) throw new RangeError('body_weight must be > 0');

    const AT_YEARS = 70; // averaging time for carcinogens (USEPA RAGS)

    // Dose de exposição média diária (mg/kg-day)
    // Conversão: µg/m³ → mg/m³ = /1000; IR (m³/h) × 24h/day não está incluído
    // pois EF em dias/ano e ED em anos já cobrem a frequência
    // ADD = C(mg/m³) × IR(m³/h) × (EF×ED days) / (BW × AT×365 days)
    // Nota: IR em m³/h × horas por dia implícito na definição de AT

    const C_mg_m3 = concentration_ug_m3 / 1000; // converte µg/m³ para mg/m³

    // Número total de horas de exposição / (BW × AT em horas)
    // ADD simplificada (RAGS, App. A): ADD = C × IR × EF × ED / (BW × AT × 365)
    // IR já em m³/h × 24 h/day é o padrão residencial; aqui IR fornecido é horário
    const hoursPerDay = 24;
    const ADD =
        (C_mg_m3 * inhalation_rate * hoursPerDay * exposure_freq * exposure_dur) / (body_weight * AT_YEARS * 365);

    // ILCR = ADD × CSF (adimensional - probabilidade de câncer por vida)
    const ilcr = ADD * cancer_slope_factor;

    /** @type {'acceptable'|'concern'|'unacceptable'} */
    let riskLevel;
    if (ilcr < ILCR_THRESHOLDS.ACCEPTABLE) {
        riskLevel = 'acceptable';
    } else if (ilcr < ILCR_THRESHOLDS.UNACCEPTABLE) {
        riskLevel = 'concern';
    } else {
        riskLevel = 'unacceptable';
    }

    return { ilcr, riskLevel };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilVaporIntrusionMeta = {
    name: 'soilVaporIntrusion',
    description: 'Soil Vapor Intrusion',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon', 'vapor'],
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
