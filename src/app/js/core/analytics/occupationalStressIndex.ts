// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Occupational Stress Index Analytics
// Analítica de estresse ocupacional - carga de trabalho, estresse térmico e fator de risco psicossocial.
// Refs: Karasek (1979) Admin Sci Q DOI:10.2307/2392498;
//       NASA-TLX (Hart & Staveland 1988);
//       Siegrist (1996) Social Science & Medicine DOI:10.1016/0277-9536(95)00217-0;
//       MTE NR-17 Ergonomia (BR); ISO 10075-1:2017

'use strict';

/**
 * Computes workload index based on simplified NASA-TLX model.
 * Calcula o índice de carga de trabalho baseado no modelo NASA-TLX simplificado (Hart & Staveland 1988).
 *
 * @param {number} task_demand_score - Physical/task demand score [1, 5] (demanda física/de tarefa)
 * @param {number} cognitive_demand_score - Mental/cognitive demand score [1, 5] (demanda cognitiva)
 * @param {number} time_pressure_score - Time pressure score [1, 5] (pressão de tempo)
 * @param {number} control_score - Level of control/autonomy score [1, 5] (nível de controle/autonomia)
 * @returns {{ wli: number, category: string }}
 */
export function computeWorkloadIndex(task_demand_score: any, cognitive_demand_score: any, time_pressure_score: any, control_score: any) {
    const scores = { task_demand_score, cognitive_demand_score, time_pressure_score, control_score };
    for (const [name, val] of Object.entries(scores)) {
        if (typeof val !== 'number') throw new TypeError(`${name} must be a number`);
        if (val < 1 || val > 5) throw new RangeError(`${name} must be in [1, 5]`);
    }

    // WLI = (demandas - controle + constante) / fator de normalização
    // Fórmula adaptada do NASA-TLX para escala [1,5]: normaliza controle como protetor
    const wli = (task_demand_score + cognitive_demand_score + time_pressure_score - control_score + 5) / 4;

    let category;
    if (wli > 4) category = 'very_high';
    else if (wli > 3) category = 'high';
    else if (wli > 2) category = 'moderate';
    else category = 'low';

    return { wli, category };
}

/**
 * Computes thermal stress score based on WBGT limits for occupational exposure.
 * Calcula o score de estresse térmico com base nos limites de WBGT para exposição ocupacional (ACGIH TLV).
 *
 * @param {number} wbgt_c - Wet Bulb Globe Temperature in °C (IBUTG em °C), ≥ -10
 * @param {number} metabolic_rate_W - Metabolic rate in Watts (taxa metabólica em Watts), > 0
 * @param {boolean} acclimatized - Whether the worker is heat-acclimatized (se o trabalhador está aclimatizado)
 * @returns {{ tss: number, risk: string }}
 */
export function computeThermalStressScore(wbgt_c: any, metabolic_rate_W: any, acclimatized: any) {
    if (typeof wbgt_c !== 'number' || typeof metabolic_rate_W !== 'number') {
        throw new TypeError('wbgt_c and metabolic_rate_W must be numbers');
    }
    if (typeof acclimatized !== 'boolean') throw new TypeError('acclimatized must be a boolean');
    if (wbgt_c < -10) throw new RangeError('wbgt_c must be >= -10');
    if (metabolic_rate_W <= 0) throw new RangeError('metabolic_rate_W must be > 0');

    // Limite de WBGT baseado na taxa metabólica (ACGIH TLV 2024, NR-15 Anexo III)
    let wbgt_limit;
    if (metabolic_rate_W < 200)
        wbgt_limit = 31; // Leve: escritório, caminhada leve
    else if (metabolic_rate_W < 350)
        wbgt_limit = 28; // Moderada: construção leve, manufatura
    else wbgt_limit = 25; // Pesada: trabalho manual intenso

    // Aclimatização aumenta tolerância em +1°C
    if (acclimatized) wbgt_limit += 1;

    // TSS: porcentagem de excedência do limite (negativo = abaixo do limite)
    const tss = ((wbgt_c - wbgt_limit) / wbgt_limit) * 100;

    let risk;
    if (tss > 20) risk = 'hazardous';
    else if (tss > 0) risk = 'caution';
    else risk = 'safe';

    return { tss, risk };
}

/**
 * Computes psychosocial risk using Karasek's Job Demand-Control model.
 * Calcula o risco psicossocial usando o modelo Demanda-Controle de Karasek (1979) e ERI de Siegrist (1996).
 *
 * @param {number} job_demands - Job demands score [1, 5] (demandas do trabalho)
 * @param {number} job_control - Job control/autonomy score [1, 5] (controle/autonomia no trabalho)
 * @param {number} social_support - Social support from peers/supervisor [1, 5] (suporte social de colegas/chefia)
 * @param {number} effort_reward_ratio - Effort-reward imbalance ratio (razão esforço-recompensa), > 0
 * @returns {{ jdi: number, risk_level: string }}
 */
export function computePsychosocialRisk(job_demands: any, job_control: any, social_support: any, effort_reward_ratio: any) {
    const scores = { job_demands, job_control, social_support };
    for (const [name, val] of Object.entries(scores)) {
        if (typeof val !== 'number') throw new TypeError(`${name} must be a number`);
        if (val < 1 || val > 5) throw new RangeError(`${name} must be in [1, 5]`);
    }
    if (typeof effort_reward_ratio !== 'number') throw new TypeError('effort_reward_ratio must be a number');
    if (effort_reward_ratio <= 0) throw new RangeError('effort_reward_ratio must be > 0');

    // JDI = (demandas / controle) × (1 / suporte social)
    // Valores altos indicam alta demanda, baixo controle e pouco suporte - quadrante de alto estresse (Karasek 1979)
    const jdi = (job_demands / job_control) * (1 / social_support);

    // ERI (Siegrist 1996): razão > 1 indica desequilíbrio esforço-recompensa prejudicial
    const eri_high = effort_reward_ratio > 1.5;
    const jdi_high = jdi > 1.5;

    let risk_level;
    if (jdi_high || eri_high) risk_level = 'high';
    else if (jdi > 1.0 || effort_reward_ratio > 1.0) risk_level = 'moderate';
    else risk_level = 'low';

    return { jdi, risk_level };
}

/**
 * Classifies composite occupational health risk and recommends interventions.
 * Classifica o risco de saúde ocupacional composto e recomenda intervenções (NR-17, ISO 10075-1).
 *
 * @param {number} workload_very_high - WLI from computeWorkloadIndex (índice de carga de trabalho)
 * @param {number} thermal_hazardous - TSS from computeThermalStressScore (score de estresse térmico)
 * @param {string} psychosocial_high - Risk level from computePsychosocialRisk ('low'|'moderate'|'high')
 * @returns {{ composite_risk: string, interventions: string[] }}
 */
function _interventionsForOccupationalRisk(
    workload_very_high: boolean,
    thermal_hazardous: boolean,
    psychosocial_high: boolean,
): string[] {
    const interventions: string[] = [];
    if (workload_very_high) {
        interventions.push(
            'Workload redistribution: task rotation, staffing review, and work pace control (NR-17 §17.1)',
        );
        interventions.push('Mandatory recovery periods: 15-min break per 90 min of high-demand activity');
    }
    if (thermal_hazardous) {
        interventions.push(
            'Immediate heat stress controls: cool rest areas, hydration stations, buddy system (ACGIH TLV)',
        );
        interventions.push('Engineering controls: shade, ventilation, or air conditioning in work zones');
        interventions.push('Administrative controls: reduce shift duration, reschedule heavy tasks to cooler hours');
    }
    if (psychosocial_high) {
        interventions.push('Psychosocial intervention: employee assistance program (EAP) and workload negotiation');
        interventions.push(
            'Management training on recognition, feedback, and autonomy-supportive supervision (ISO 10075-3)',
        );
    }
    return interventions;
}

function _compositeRiskFromFlags(
    workload_index: number,
    thermal_stress_score: number,
    psychosocial_risk: string,
    workload_very_high: boolean,
    thermal_hazardous: boolean,
    psychosocial_high: boolean,
): string {
    if (workload_very_high || thermal_hazardous || psychosocial_high) return 'unacceptable';
    if (workload_index > 3 || thermal_stress_score > 0 || psychosocial_risk === 'moderate') return 'caution';
    return 'acceptable';
}

export function classifyOccupationalHealthRisk(workload_index: any, thermal_stress_score: any, psychosocial_risk: any) {
    if (typeof workload_index !== 'number') throw new TypeError('workload_index must be a number');
    if (typeof thermal_stress_score !== 'number') throw new TypeError('thermal_stress_score must be a number');
    if (typeof psychosocial_risk !== 'string') throw new TypeError('psychosocial_risk must be a string');
    const valid_ps = ['low', 'moderate', 'high'];
    if (!valid_ps.includes(psychosocial_risk)) {
        throw new RangeError(`psychosocial_risk must be one of: ${valid_ps.join(', ')}`);
    }

    const workload_very_high = workload_index > 4;
    const thermal_hazardous = thermal_stress_score > 20;
    const psychosocial_high = psychosocial_risk === 'high';

    const interventions = _interventionsForOccupationalRisk(workload_very_high, thermal_hazardous, psychosocial_high);
    const composite_risk = _compositeRiskFromFlags(
        workload_index,
        thermal_stress_score,
        psychosocial_risk,
        workload_very_high,
        thermal_hazardous,
        psychosocial_high,
    );

    if (composite_risk === 'acceptable' && interventions.length === 0) {
        interventions.push('Continue periodic monitoring and health surveillance as per MTE NR-7 PCMSO');
    }

    return { composite_risk, interventions };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const occupationalStressIndexMeta = {
    name: 'occupationalStressIndex',
    description: 'occupationalStressIndex',
    category: 'analytics',
    familyTags: ['occupational'],
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
