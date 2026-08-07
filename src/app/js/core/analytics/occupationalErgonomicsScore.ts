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
 * Ferramentas de avaliação ergonômica ocupacional (REBA + NIOSH Lifting Equation).
 *
 * Academic references:
 *   - Hignett S, McAtamney L (2000). Rapid Entire Body Assessment (REBA).
 *     Applied Ergonomics, 31(2), 201-205. DOI:10.1016/S0003-6870(99)00035-5
 *   - Waters TR et al. (1993). Revised NIOSH equation for the design and
 *     evaluation of manual lifting tasks. Ergonomics, 36(7), 749-776.
 *     DOI:10.1080/00140139308967698
 */

/**
 * Calcula o escore REBA (Rapid Entire Body Assessment) simplificado.
 * Score final = soma dos componentes de postura + acoplamento + atividade.
 * Risco: 1=negligível | 2-3=baixo | 4-7=médio | 8-10=alto | ≥11=muito alto.
 * Cada ângulo em graus; acoplamento 0-3; atividade 0-3.
 *
 * @param {number} trunk_angle Ângulo do tronco em graus (0=ereto; 0-90).
 * @param {number} neck_angle Ângulo do pescoço em graus (0-60).
 * @param {number} leg_load Carga nas pernas (0=bilateral; 1=unilateral; 2=desequilibrado).
 * @param {number} upper_arm_angle Ângulo do braço superior em graus (0-90).
 * @param {number} lower_arm_angle Ângulo do antebraço em graus (0-90).
 * @param {number} wrist_angle Ângulo do pulso em graus (0-90).
 * @param {number} coupling Tipo de acoplamento (0=bom; 1=regular; 2=ruim; 3=inaceitável).
 * @param {number} activity Modificador de atividade (0=estático; 1=repetitivo; 2=instável; 3=pós-op).
 * @returns {{ REBA_score: number, risk_level: string }}
 */
export function computeREBAScore(
    trunk_angle: any,
    neck_angle: any,
    leg_load: any,
    upper_arm_angle: any,
    lower_arm_angle: any,
    wrist_angle: any,
    coupling: any,
    activity: any,
) {
    const args = {
        trunk_angle,
        neck_angle,
        leg_load,
        upper_arm_angle,
        lower_arm_angle,
        wrist_angle,
        coupling,
        activity,
    };
    for (const [key, val] of Object.entries(args)) {
        if (typeof val !== 'number') throw new TypeError(`${key} must be a number`);
        if (!isFinite(val)) throw new RangeError(`${key} must be finite`);
    }
    if (trunk_angle < 0 || trunk_angle > 90) throw new RangeError('trunk_angle must be 0-90');
    if (neck_angle < 0 || neck_angle > 60) throw new RangeError('neck_angle must be 0-60');
    if (![0, 1, 2].includes(leg_load)) throw new RangeError('leg_load must be 0, 1 or 2');
    if (upper_arm_angle < 0 || upper_arm_angle > 90) throw new RangeError('upper_arm_angle must be 0-90');
    if (lower_arm_angle < 0 || lower_arm_angle > 90) throw new RangeError('lower_arm_angle must be 0-90');
    if (wrist_angle < 0 || wrist_angle > 90) throw new RangeError('wrist_angle must be 0-90');
    if (coupling < 0 || coupling > 3 || !Number.isInteger(coupling))
        throw new RangeError('coupling must be integer 0-3');
    if (activity < 0 || activity > 3 || !Number.isInteger(activity))
        throw new RangeError('activity must be integer 0-3');

    // Pontuação de postura por segmento (escalonamento linear simplificado)
    const trunk_score = Math.ceil(trunk_angle / 20); // 0→1, 20→1, 40→2, 60→3, 90→5
    const neck_score = trunk_angle > 20 ? 2 : 1;
    const leg_score = leg_load + 1;
    const upper_arm_score = Math.ceil(upper_arm_angle / 30) || 1;
    const lower_arm_score = lower_arm_angle < 60 || lower_arm_angle > 100 ? 2 : 1;
    const wrist_score = wrist_angle > 15 ? 2 : 1;

    const REBA_score =
        trunk_score + neck_score + leg_score + upper_arm_score + lower_arm_score + wrist_score + coupling + activity;

    let risk_level;
    if (REBA_score <= 1) risk_level = 'negligible';
    else if (REBA_score <= 3) risk_level = 'low';
    else if (REBA_score <= 7) risk_level = 'medium';
    else if (REBA_score <= 10) risk_level = 'high';
    else risk_level = 'very_high';

    return { REBA_score, risk_level };
}

/**
 * Calcula o Índice de Levantamento NIOSH (Lifting Index).
 * LI = peso_real / RWL
 * LI > 1 indica risco de lesão musculoesquelética.
 *
 * @param {number} actual_weight_kg Peso real levantado em kg.
 * @param {number} RWL_kg Limite de peso recomendado (Recommended Weight Limit) em kg.
 * @returns {{ LI: number }} Índice de levantamento (adimensional).
 */
export function computeNIOSHLiftingIndex(actual_weight_kg: any, RWL_kg: any) {
    if (typeof actual_weight_kg !== 'number') throw new TypeError('actual_weight_kg must be a number');
    if (typeof RWL_kg !== 'number') throw new TypeError('RWL_kg must be a number');
    if (actual_weight_kg <= 0) throw new RangeError('actual_weight_kg must be > 0');
    if (RWL_kg <= 0) throw new RangeError('RWL_kg must be > 0');
    return { LI: actual_weight_kg / RWL_kg };
}

/**
 * Calcula o Limite de Peso Recomendado (RWL) pela equação revisada do NIOSH.
 * RWL = 23 × HM × VM × DM × AM × FM × CM (kg)
 * Todos os multiplicadores devem estar no intervalo [0, 1].
 * HM: horizontal; VM: vertical; DM: distância; AM: assimetria; FM: frequência; CM: acoplamento.
 *
 * @param {number} HM Multiplicador horizontal (0-1).
 * @param {number} VM Multiplicador vertical (0-1).
 * @param {number} DM Multiplicador de distância (0-1).
 * @param {number} AM Multiplicador de assimetria (0-1).
 * @param {number} FM Multiplicador de frequência (0-1).
 * @param {number} CM Multiplicador de acoplamento (0-1).
 * @returns {{ RWL_kg: number }} Limite de peso recomendado em kg.
 */
export function computeRecommendedWeightLimit(HM: any, VM: any, DM: any, AM: any, FM: any, CM: any) {
    const mults = { HM, VM, DM, AM, FM, CM };
    for (const [key, val] of Object.entries(mults)) {
        if (typeof val !== 'number') throw new TypeError(`${key} must be a number`);
        if (val < 0 || val > 1) throw new RangeError(`${key} must be between 0 and 1`);
    }
    return { RWL_kg: 23 * HM * VM * DM * AM * FM * CM };
}

/**
 * Classifica o risco ergonômico global combinando REBA e índice NIOSH.
 * acceptable: REBA≤3 E LI≤1
 * investigate: REBA≤7 E LI≤2
 * change_required: REBA≤10 E LI≤3
 * urgent: caso contrário
 *
 * @param {number} REBA_score Escore REBA calculado.
 * @param {number} LI Índice de levantamento NIOSH.
 * @returns {{ overall_risk: 'acceptable'|'investigate'|'change_required'|'urgent' }}
 */
export function classifyErgonomicRisk(REBA_score: any, LI: any) {
    if (typeof REBA_score !== 'number') throw new TypeError('REBA_score must be a number');
    if (typeof LI !== 'number') throw new TypeError('LI must be a number');
    if (REBA_score < 0) throw new RangeError('REBA_score must be >= 0');
    if (LI < 0) throw new RangeError('LI must be >= 0');

    /** @type {'acceptable'|'investigate'|'change_required'|'urgent'} */
    let overall_risk;
    if (REBA_score <= 3 && LI <= 1) overall_risk = 'acceptable';
    else if (REBA_score <= 7 && LI <= 2) overall_risk = 'investigate';
    else if (REBA_score <= 10 && LI <= 3) overall_risk = 'change_required';
    else overall_risk = 'urgent';

    return { overall_risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const occupationalErgonomicsScoreMeta = {
    name: 'occupationalErgonomicsScore',
    description: 'occupationalErgonomicsScore',
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
