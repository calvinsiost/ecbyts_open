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
 * Water Reuse Risk Assessment Module
 *
 * Implements QMRA (Quantitative Microbial Risk Assessment) and WHO water reuse
 * guidelines for treated wastewater applications.
 *
 * References:
 *  - WHO (2006). WHO Guidelines for the Safe Use of Wastewater, Excreta and
 *    Greywater. Vol. 2: Wastewater Use in Agriculture.
 *    DOI: 10.1016/j.watres.2006.01.048
 *  - Teunis P.F.M. et al. (1996). A review of dose-response models for
 *    infectious gastroenteritis. RIVM Report 284550002.
 *  - Haas C.N. et al. (1999). Quantitative Microbial Risk Assessment.
 *    ISBN: 9780471165552
 */

/**
 * Etapas de tratamento reconhecidas e seus log-removals padrão (WHO 2006).
 * Valores em log10 de remoção de patógenos.
 * @type {Record<string, number>}
 */
const TREATMENT_LOG_REMOVALS = {
    coagulation: 1,
    filtration: 2,
    UV_disinfection: 4,
    chlorination: 3,
    RO: 6,
};

/**
 * Calcula a remoção logarítmica cumulativa de patógenos em um trem de tratamento.
 * Remoções são somadas na escala log (multiplicativas na escala linear).
 *
 * @param {Array<{type: string, log_removal: number}>} treatment_steps
 *   Array de etapas de tratamento. Se log_removal for omitido, usa o padrão WHO.
 * @returns {{ total_log_removal: number }} Remoção total em log10.
 * @throws {TypeError} Se treatment_steps não for um array.
 * @throws {RangeError} Se uma etapa tiver log_removal negativo.
 */
export function computePathogenRemovalLog(treatment_steps: any) {
    if (!Array.isArray(treatment_steps)) {
        throw new TypeError('treatment_steps must be an array');
    }
    if (treatment_steps.length === 0) {
        return { total_log_removal: 0 };
    }

    let total = 0;
    for (const step of treatment_steps) {
const lr = step.log_removal !== undefined ? step.log_removal : (TREATMENT_LOG_REMOVALS[step.type as keyof typeof TREATMENT_LOG_REMOVALS] ?? 0);
        if (lr < 0) {
            throw new RangeError(`log_removal cannot be negative (got ${lr} for step type "${step.type}")`);
        }
        total += lr;
    }
    return { total_log_removal: total };
}

/**
 * Calcula o risco anual de infecção por via QMRA (modelo beta-Poisson simplificado).
 * Dose efetiva = concentração_após_tratamento × volume_ingerido.
 * P_infection por evento = 1 - (1 + dose/beta)^(-alpha).
 * Risco anual = 1 - (1 - P_infection)^365.
 *
 * alpha = 0.441 (Cryptosporidium, Teunis 1996).
 *
 * @param {number} pathogen_conc_per_L   Concentração de patógenos (organismos/L) na água bruta.
 * @param {number} volume_L_event        Volume ingerido por evento (L).
 * @param {number} log_removal           Remoção logarítmica do tratamento (log10).
 * @param {number} beta_dose_response    Parâmetro beta do modelo dose-resposta.
 * @returns {{ annual_risk: number }}    Risco anual de infecção [0, 1].
 * @throws {TypeError} Se qualquer argumento não for número.
 * @throws {RangeError} Se valores estiverem fora dos limites aceitáveis.
 */
export function computeAnnualInfectionRisk(pathogen_conc_per_L: any, volume_L_event: any, log_removal: any, beta_dose_response: any) {
    if (
        typeof pathogen_conc_per_L !== 'number' ||
        typeof volume_L_event !== 'number' ||
        typeof log_removal !== 'number' ||
        typeof beta_dose_response !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (pathogen_conc_per_L < 0) throw new RangeError('pathogen_conc_per_L must be >= 0');
    if (volume_L_event <= 0) throw new RangeError('volume_L_event must be > 0');
    if (log_removal < 0) throw new RangeError('log_removal must be >= 0');
    if (beta_dose_response <= 0) throw new RangeError('beta_dose_response must be > 0');

    const ALPHA = 0.441; // parâmetro alpha para Cryptosporidium (Teunis 1996)
    const conc_treated = pathogen_conc_per_L / Math.pow(10, log_removal);
    const dose = conc_treated * volume_L_event;

    // Modelo beta-Poisson: P = 1 - (1 + dose/beta)^(-alpha)
    const p_infection = 1 - Math.pow(1 + dose / beta_dose_response, -ALPHA);

    // Risco anual com 365 exposições independentes
    const annual_risk = 1 - Math.pow(1 - p_infection, 365);

    return { annual_risk: Math.min(1, Math.max(0, annual_risk)) };
}

/**
 * Calcula um índice de qualidade da água de reuso [0, 1].
 * Score ponderado normalizado pelos limites WHO para reuso irrestrito.
 * Score mais próximo de 1 indica qualidade superior.
 *
 * @param {{ turbidity_NTU: number, TDS_mg_L: number, BOD_mg_L: number, coliform_CFU_100mL: number }} parameters
 * @returns {{ WQS: number }} Water Quality Score normalizado.
 * @throws {TypeError} Se parameters não for um objeto válido.
 * @throws {RangeError} Se valores forem negativos.
 */
export function computeReuseWaterQualityScore(parameters: any) {
    if (typeof parameters !== 'object' || parameters === null) {
        throw new TypeError('parameters must be a non-null object');
    }
    const { turbidity_NTU, TDS_mg_L, BOD_mg_L, coliform_CFU_100mL } = parameters;
    for (const [k, v] of Object.entries({ turbidity_NTU, TDS_mg_L, BOD_mg_L, coliform_CFU_100mL })) {
        if (typeof v !== 'number') throw new TypeError(`${k} must be a number`);
        if (v < 0) throw new RangeError(`${k} must be >= 0`);
    }

    // Limites de referência WHO para reuso irrestrito (pior caso aceitável)
    /** @type {Record<string, number>} */
    const LIMITS = {
        turbidity_NTU: 2,
        TDS_mg_L: 500,
        BOD_mg_L: 10,
        coliform_CFU_100mL: 10,
    };
    /** @type {Record<string, number>} */
    const WEIGHTS = { turbidity_NTU: 0.2, TDS_mg_L: 0.2, BOD_mg_L: 0.3, coliform_CFU_100mL: 0.3 };

    /** @type {Record<string, number>} */
    const params = parameters;
    let WQS = 0;
    for (const key of Object.keys(LIMITS)) {
        // Razão invertida: valor/limite → quanto maior o parâmetro, menor o score
const ratio = (params as any)[key] / (LIMITS as any)[key];
        const sub_score = Math.max(0, 1 - ratio); // score 0 quando igual ou acima do limite
        WQS += (WEIGHTS as any)[key] * sub_score;
    }
    return { WQS: Math.min(1, Math.max(0, WQS)) };
}

/**
 * Classifica a aplicação de reuso com base no WQS e risco anual de infecção.
 * Baseado nas diretrizes WHO Guidelines for Safe Use of Wastewater (2006).
 *
 * @param {number} WQS          Water Quality Score [0, 1] (saída de computeReuseWaterQualityScore).
 * @param {number} annual_risk  Risco anual de infecção [0, 1] (saída de computeAnnualInfectionRisk).
 * @returns {{ application: string }} Aplicação recomendada.
 * @throws {TypeError} Se WQS ou annual_risk não forem números.
 * @throws {RangeError} Se valores estiverem fora de [0, 1].
 */
export function classifyReuseApplication(WQS: any, annual_risk: any) {
    if (typeof WQS !== 'number' || typeof annual_risk !== 'number') {
        throw new TypeError('WQS and annual_risk must be numbers');
    }
    if (WQS < 0 || WQS > 1) throw new RangeError('WQS must be in [0, 1]');
    if (annual_risk < 0 || annual_risk > 1) throw new RangeError('annual_risk must be in [0, 1]');

    // Classificação hierárquica: risco microbiológico é critério primário
    if (annual_risk <= 1e-4 && WQS >= 0.7) {
        return { application: 'unrestricted_irrigation' };
    }
    if (annual_risk <= 1e-3 && WQS >= 0.4) {
        return { application: 'restricted_irrigation' };
    }
    if (annual_risk <= 1e-3 && WQS >= 0.2) {
        return { application: 'industrial_cooling' };
    }
    if (annual_risk <= 1e-2 && WQS >= 0.1) {
        return { application: 'toilet_flushing' };
    }
    return { application: 'not_suitable' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterReuseRiskAssessmentMeta = {
    name: 'waterReuseRiskAssessment',
    description: 'waterReuseRiskAssessment',
    category: 'analytics',
    familyTags: ['water', 'risk'],
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
