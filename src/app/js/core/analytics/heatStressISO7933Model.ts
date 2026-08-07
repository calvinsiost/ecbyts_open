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
/**
 * Heat Stress ISO 7933 Model - Predicted Heat Strain (PHS)
 *
 * Implementa as equações centrais do método PHS da norma ISO 7933:2004 para
 * estimar taxa de suor requerida, taxa máxima de suor, elevação de temperatura
 * central e tempo limite de exposição em ambientes quentes.
 *
 * Referências:
 *   ISO 7933:2004. Ergonomics of the thermal environment - Analytical
 *     determination and interpretation of heat stress using calculation of the
 *     predicted heat strain. International Organization for Standardization.
 *   Malchaire, J. et al. (2001). Development and validation of the predicted
 *     heat strain model. Ann. Occup. Hyg. 45(2), 123-135.
 *     DOI:10.1016/S0003-4878(00)00030-6
 *
 * @module heatStressISO7933Model
 */

'use strict';

/**
 * Calcula taxa de suor requerida (SWreq) conforme ISO 7933:2004 §6.3.
 * O balanço térmico exige que a evaporação necessária (Ereq) seja provida
 * pela sudorese; SWreq converte Ereq em fluxo de massa de suor.
 *
 * SWreq = Ereq / L_evap   [g/h]
 * onde L_evap = 2430 J/g (calor latente de vaporização da água a 35°C)
 *
 * Ereq = M - W - Cres - Eres - Rreq
 *   M     = taxa metabólica (W)
 *   W     = potência mecânica (W) [atividade de trabalho]
 *   Cres  = troca de calor convectiva respiratória (W)
 *   Eres  = troca de calor evaporativa respiratória (W)
 *   Rreq  = troca de calor radiante requerida (W)
 *   Ereq  = evaporação requerida (W)
 *
 * @param {number} M    - Taxa metabólica (W)
 * @param {number} W    - Potência mecânica útil (W)
 * @param {number} Cres - Troca convectiva respiratória (W)
 * @param {number} Eres - Troca evaporativa respiratória (W)
 * @param {number} Rreq - Troca radiante requerida (W)
 * @param {number} Ereq - Evaporação requerida (W); usado diretamente se fornecido
 * @returns {{ SWreq_g_per_h: number, Ereq_W: number }}
 */
export function calcRequiredSweatRate(M: any, W: any, Cres: any, Eres: any, Rreq: any, Ereq: any) {
    for (const [name, val] of [
        ['M', M],
        ['W', W],
        ['Cres', Cres],
        ['Eres', Eres],
        ['Rreq', Rreq],
        ['Ereq', Ereq],
    ]) {
        if (!Number.isFinite(val)) {
            throw new TypeError(`Parâmetro ${name} deve ser um número finito, recebido: ${val}`);
        }
    }
    if (M < 0) throw new RangeError(`M (metabolismo) deve ser >= 0, recebido: ${M}`);

    // Se Ereq não é usado como free arg, pode ser calculado internamente:
    // Ereq = M - W - Cres - Eres - Rreq  (ISO 7933 eq. 1)
    // Aqui aceitamos Ereq como parâmetro para manter a interface explícita.
    const L_evap_J_per_g = 2430;
    const SWreq_g_per_h = Math.max(0, (Ereq / L_evap_J_per_g) * 3600);
    return { SWreq_g_per_h, Ereq_W: Ereq };
}

/**
 * Calcula taxa máxima de suor (SWmax) conforme ISO 7933:2004 §6.4.
 * Trabalhadores aclimatizados ao calor toleram sudorese maior.
 *
 *   SWmax = 400 g/h  → não aclimatizado
 *   SWmax = 500 g/h  → aclimatizado (padrão ISO)
 *
 * Opcionalmente ajustado pelo peso corporal:
 *   SWmax = 500 × (bodyWeight_kg / 75) g/h   [se useWeightScaling = true]
 *
 * @param {boolean} acclimatized     - true se trabalhador aclimatizado
 * @param {number}  bodyWeight_kg    - Peso corporal (kg); padrão 75 kg
 * @param {boolean} [useWeightScaling] - Ajuste proporcional ao peso (padrão false)
 * @returns {{ SWmax_g_per_h: number }}
 */
export function calcMaximumSweatRate(acclimatized: any, bodyWeight_kg: any, useWeightScaling = false) {
    if (typeof acclimatized !== 'boolean') {
        throw new TypeError(`acclimatized deve ser boolean, recebido: ${typeof acclimatized}`);
    }
    if (!Number.isFinite(bodyWeight_kg) || bodyWeight_kg <= 0) {
        throw new RangeError(`bodyWeight_kg deve ser > 0, recebido: ${bodyWeight_kg}`);
    }
    const baseRate = acclimatized ? 500 : 400;
    const SWmax_g_per_h = useWeightScaling ? baseRate * (bodyWeight_kg / 75) : baseRate;
    return { SWmax_g_per_h };
}

/**
 * Estima elevação de temperatura central (ΔTcore) como função do déficit de
 * sudorese ao longo do tempo de exposição. Modelo simplificado ISO 7933 §6.6:
 *
 *   ΔTcore = (SWreq - SWmax) × exposureTime_h × HeatCapacity_factor
 *
 * onde HeatCapacity_factor = 1 / (bodyHeatCapacity × bodyMass)
 *   bodyHeatCapacity ≈ 3480 J/(kg·°C) (ISO 7933)
 *   bodyMass default = 75 kg → HC = 3480 × 75 = 261000 J/°C
 *   Factor = 1/261000 °C·h/g (convertendo g/h × h → g)
 *   Para evitar unidades complexas, usamos fórmula normalizada ISO:
 *     ΔTcore ≈ (SWdef_g_total) / (261000 / 2430) = SWdef × 2430 / 261000
 *
 * @param {number} SWreq_g_per_h   - Taxa requerida de suor (g/h)
 * @param {number} SWmax_g_per_h   - Taxa máxima de suor (g/h)
 * @param {number} exposureTime_min - Tempo de exposição (min)
 * @returns {{ deltaTcore_degC: number, sweatDeficit_g: number }}
 */
export function calcCoreTemperatureRise(SWreq_g_per_h: any, SWmax_g_per_h: any, exposureTime_min: any) {
    if (!Number.isFinite(SWreq_g_per_h) || SWreq_g_per_h < 0) {
        throw new RangeError(`SWreq_g_per_h deve ser >= 0, recebido: ${SWreq_g_per_h}`);
    }
    if (!Number.isFinite(SWmax_g_per_h) || SWmax_g_per_h < 0) {
        throw new RangeError(`SWmax_g_per_h deve ser >= 0, recebido: ${SWmax_g_per_h}`);
    }
    if (!Number.isFinite(exposureTime_min) || exposureTime_min < 0) {
        throw new RangeError(`exposureTime_min deve ser >= 0, recebido: ${exposureTime_min}`);
    }
    const deficitRate_g_per_h = Math.max(0, SWreq_g_per_h - SWmax_g_per_h);
    const exposureTime_h = exposureTime_min / 60;
    const sweatDeficit_g = deficitRate_g_per_h * exposureTime_h;
    // Calor acumulado = sweatDeficit_g × L_evap [J] dividido pela capacidade corporal
    const L_evap = 2430; // J/g
    const bodyHeatCapacity_J_per_degC = 3480 * 75; // 261 000 J/°C (ISO 7933)
    const deltaTcore_degC = (sweatDeficit_g * L_evap) / bodyHeatCapacity_J_per_degC;
    return { deltaTcore_degC, sweatDeficit_g };
}

/**
 * Calcula Duration Limited Exposure (DLE) - tempo máximo antes de a
 * temperatura central exceder o limiar de 38.5°C (ISO 7933 §6.7).
 *
 * Derivado de calcCoreTemperatureRise invertido:
 *   maxSWDef_g = (38.5 - Tre_initial) × bodyHeatCap / L_evap
 *   DLE = maxSWDef_g / deficitRate_g_per_h × 60  [min]
 *
 * @param {number} SWreq_g_per_h  - Taxa requerida de suor (g/h)
 * @param {number} SWmax_g_per_h  - Taxa máxima de suor (g/h)
 * @param {number} Tre_initial     - Temperatura retal inicial (°C); fisiológica ~37.5°C
 * @returns {{ DLE_min: number | null }}  null se SWreq <= SWmax (sem limite)
 */
export function calcExposureLimitTime(SWreq_g_per_h: any, SWmax_g_per_h: any, Tre_initial: any) {
    if (!Number.isFinite(SWreq_g_per_h) || SWreq_g_per_h < 0) {
        throw new RangeError(`SWreq_g_per_h deve ser >= 0, recebido: ${SWreq_g_per_h}`);
    }
    if (!Number.isFinite(SWmax_g_per_h) || SWmax_g_per_h < 0) {
        throw new RangeError(`SWmax_g_per_h deve ser >= 0, recebido: ${SWmax_g_per_h}`);
    }
    if (!Number.isFinite(Tre_initial) || Tre_initial < 30 || Tre_initial > 42) {
        throw new RangeError(`Tre_initial deve estar em [30, 42]°C, recebido: ${Tre_initial}`);
    }
    const LIMIT_TRE = 38.5; // °C — limiar ISO 7933
    if (Tre_initial >= LIMIT_TRE) {
        return { DLE_min: 0 }; // já em limite — exposição zero
    }
    const deficitRate_g_per_h = SWreq_g_per_h - SWmax_g_per_h;
    if (deficitRate_g_per_h <= 0) {
        return { DLE_min: null }; // sem déficit — sem limite de tempo
    }
    const L_evap = 2430;
    const bodyHeatCap_J_per_degC = 3480 * 75;
    const allowableTrise = LIMIT_TRE - Tre_initial;
    const maxSweatDef_g = (allowableTrise * bodyHeatCap_J_per_degC) / L_evap;
    const DLE_min = (maxSweatDef_g / deficitRate_g_per_h) * 60;
    return { DLE_min };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const heatStressISO7933ModelMeta = {
    name: 'heatStressISO7933Model',
    description: 'heatStressISO7933Model',
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
