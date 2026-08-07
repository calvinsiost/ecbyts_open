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
 * Mineral Processing Water Balance
 * Balanço hídrico em processamento mineral
 *
 * References / Referências:
 *   Wills, B.A. & Finch, J.A. (2016). Wills' Mineral Processing Technology, 8th ed.
 *     Butterworth-Heinemann. ISBN 978-0-08-097053-0
 *   ANCOLD (2012). Guidelines on Tailings Dams - Planning, Design, Construction,
 *     Operation and Closure. Australian National Committee on Large Dams.
 *   Penman, H.L. (1948). Natural evaporation from open water, bare soil and grass.
 *     Proc. Roy. Soc. London A, 193, 120–145. DOI: 10.1098/rspa.1948.0037
 *   Allen, R.G. et al. (1998). FAO Irrigation and Drainage Paper No. 56 -
 *     Crop Evapotranspiration. Rome: FAO.
 *
 * @module mineralProcessingWaterBalance
 */

// ─── Water Balance Model ─────────────────────────────────────────────────────

/**
 * Calculate recirculation rate of a closed-circuit processing plant.
 * Calcula a taxa de recirculação de água em circuito fechado.
 *
 * @param {number} freshWaterInput_m3h   Fresh water intake rate (m³/h)
 *                                       Vazão de água fresca (m³/h)
 * @param {number} totalWaterUsed_m3h    Total water used in the circuit (m³/h)
 *                                       Água total usada no circuito (m³/h)
 * @returns {number} Recirculation rate as fraction [0, 1)
 *                   Taxa de recirculação como fração
 * @throws {RangeError} If any value is not a positive finite number
 * @throws {RangeError} If freshWaterInput >= totalWaterUsed (no recirculation possible)
 */
export function recirculationRate(freshWaterInput_m3h: any, totalWaterUsed_m3h: any) {
    if (!Number.isFinite(freshWaterInput_m3h) || freshWaterInput_m3h < 0) {
        throw new RangeError('freshWaterInput_m3h must be a non-negative finite number');
    }
    if (!Number.isFinite(totalWaterUsed_m3h) || totalWaterUsed_m3h <= 0) {
        throw new RangeError('totalWaterUsed_m3h must be a positive finite number');
    }
    if (freshWaterInput_m3h >= totalWaterUsed_m3h) {
        throw new RangeError('freshWaterInput_m3h must be less than totalWaterUsed_m3h for recirculation to exist');
    }
    // Fração de água reciclada = (total usado - água fresca) / total usado
    return (totalWaterUsed_m3h - freshWaterInput_m3h) / totalWaterUsed_m3h;
}

/**
 * Calculate specific water consumption per tonne of ore processed.
 * Calcula o consumo específico de água por tonelada de minério processado.
 *
 * Based on Wills & Finch (2016) §2.4 - typical range: 0.5–5 m³/t depending
 * on ore type, grinding circuit, and flotation density requirements.
 * Baseado em Wills & Finch (2016) §2.4 - faixa típica: 0,5–5 m³/t.
 *
 * @param {number} totalFreshWater_m3h   Net fresh water consumption (m³/h)
 *                                       Consumo líquido de água fresca (m³/h)
 * @param {number} throughput_th         Ore throughput (t/h, dry basis)
 *                                       Produção de minério (t/h, base seca)
 * @returns {number} Specific water consumption (m³/t)
 *                   Consumo específico de água (m³/t)
 * @throws {RangeError} If any argument is not a positive finite number
 */
export function specificWaterConsumption(totalFreshWater_m3h: any, throughput_th: any) {
    if (!Number.isFinite(totalFreshWater_m3h) || totalFreshWater_m3h <= 0) {
        throw new RangeError('totalFreshWater_m3h must be a positive finite number');
    }
    if (!Number.isFinite(throughput_th) || throughput_th <= 0) {
        throw new RangeError('throughput_th must be a positive finite number');
    }
    return totalFreshWater_m3h / throughput_th;
}

/**
 * Estimate evaporation loss from a tailings storage facility (TSF) using a
 * simplified Penman-Monteith open-water evaporation model.
 * Estima perda por evaporação em barragem de rejeitos (TSF) usando o modelo
 * simplificado de Penman-Monteith para superfície livre.
 *
 * Simplified form for open water (no crop coefficient, rs=0):
 *   E = (Δ·Rn + ρa·cp·VPD/ra) / (λ·(Δ + γ))
 * where:
 *   Δ  = slope of saturation vapour pressure curve (kPa/°C)
 *   Rn = net radiation (MJ/m²/day)
 *   ρa = mean air density (~1.2 kg/m³)
 *   cp = specific heat of air (1.013 kJ/kg/°C)
 *   VPD= vapour pressure deficit (kPa)
 *   ra = aerodynamic resistance (s/m) - 208/uz for open water (Allen 1998)
 *   λ  = latent heat of vaporisation (~2.45 MJ/kg)
 *   γ  = psychrometric constant (kPa/°C)
 *
 * Reference: Allen et al. (1998) FAO-56 Eq. 6.
 *
 * @param {Object} params
 * @param {number} params.Rn_MJm2day     Net radiation (MJ/m²/day)
 * @param {number} params.Tair_C         Mean air temperature (°C)
 * @param {number} params.windSpeed_ms   Mean wind speed at 2 m height (m/s)
 * @param {number} params.RH_fraction    Relative humidity [0, 1]
 * @param {number} params.elevation_m    Elevation above sea level (m) - for γ
 * @returns {number} Open-water evaporation depth (mm/day)
 *                   Profundidade de evaporação (mm/dia)
 * @throws {RangeError} On out-of-range or non-finite inputs
 */
export function tsfEvaporationLoss(params: any) {
    const { Rn_MJm2day, Tair_C, windSpeed_ms, RH_fraction, elevation_m } = params || {};

    if (!Number.isFinite(Rn_MJm2day)) throw new RangeError('Rn_MJm2day must be finite');
    if (!Number.isFinite(Tair_C) || Tair_C < -50 || Tair_C > 60) {
        throw new RangeError('Tair_C must be between -50 and 60 °C');
    }
    if (!Number.isFinite(windSpeed_ms) || windSpeed_ms < 0) {
        throw new RangeError('windSpeed_ms must be >= 0');
    }
    if (!Number.isFinite(RH_fraction) || RH_fraction < 0 || RH_fraction > 1) {
        throw new RangeError('RH_fraction must be in [0, 1]');
    }
    if (!Number.isFinite(elevation_m) || elevation_m < -500 || elevation_m > 9000) {
        throw new RangeError('elevation_m must be between -500 and 9000 m');
    }

    // Pressão atmosférica (kPa) - Allen 1998 Eq. 7
    // Atmospheric pressure adjusted for elevation
    const P_kPa = 101.3 * Math.pow((293 - 0.0065 * elevation_m) / 293, 5.26);

    // Constante psicrométrica γ (kPa/°C) - Allen 1998 Eq. 8
    const gamma = 0.000665 * P_kPa;

    // Inclinação da curva de pressão de vapor saturado Δ (kPa/°C) - Allen 1998 Eq. 13
    const e_s = 0.6108 * Math.exp((17.27 * Tair_C) / (Tair_C + 237.3));
    const Delta = (4098 * e_s) / Math.pow(Tair_C + 237.3, 2);

    // Déficit de pressão de vapor (kPa) - VPD = es - ea
    const e_a = RH_fraction * e_s;
    const VPD = e_s - e_a;

    // Velocidade do vento - mínimo 0.1 m/s para estabilidade numérica
    const uz = Math.max(windSpeed_ms, 0.1);

    // Penman-Monteith para superfície livre (rs=0) - FAO-56 Eq. 6 forma numérica
    // Formulação numérica com unidades consistentes (Allen et al. 1998):
    //   ET₀ [mm/day] = [0.408·Δ·Rn + γ·(900/(T+273))·u2·VPD] / [Δ + γ·(1 + 0.34·u2)]
    // Para superfície livre (open water): rs=0 → fator 0.34·u2 no denominador = 0
    // (substituindo ra = 208/u2 e simplificando com λ = 2.45 MJ/kg, ρa·cp = 1.013e-3 MJ/kg/°C)
    const u2 = uz; // vento a 2 m de altura (m/s)
    const numerator = 0.408 * Delta * Rn_MJm2day + gamma * (900 / (Tair_C + 273)) * u2 * VPD;
    // Para superfície livre rs=0 → denominador sem o termo 0.34·u2
    const denominator = Delta + gamma;
    const E_mm_day = numerator / denominator;

    return Math.max(0, E_mm_day);
}

/**
 * Compute water loss through tailings discharge.
 * Calcula perda de água pelo descarte de rejeitos.
 *
 * Based on Wills & Finch (2016) - typical tailings slurry is 25–45% solids by mass.
 * Water lost = water in slurry - water recovered from thickener/filter.
 * Baseado em Wills & Finch (2016) - polpa típica tem 25–45% de sólidos em massa.
 *
 * @param {number} tailingsRate_th       Dry tailings production (t/h)
 *                                       Taxa de produção de rejeitos secos (t/h)
 * @param {number} slurrySolidsFraction  Mass fraction of solids in slurry [0.1, 0.8]
 *                                       Fração mássica de sólidos na polpa
 * @param {number} waterRecovery_fraction Recovery of water from dewatering [0, 0.99]
 *                                        Recuperação de água no espessador/filtro
 * @returns {number} Net water discharged with tailings (m³/h)
 *                   Água líquida descartada com rejeitos (m³/h)
 * @throws {RangeError} On invalid fractions or rates
 */
export function tailingsWaterLoss(tailingsRate_th: any, slurrySolidsFraction: any, waterRecovery_fraction: any) {
    if (!Number.isFinite(tailingsRate_th) || tailingsRate_th <= 0) {
        throw new RangeError('tailingsRate_th must be a positive finite number');
    }
    if (!Number.isFinite(slurrySolidsFraction) || slurrySolidsFraction < 0.1 || slurrySolidsFraction > 0.8) {
        throw new RangeError('slurrySolidsFraction must be in [0.1, 0.8]');
    }
    if (!Number.isFinite(waterRecovery_fraction) || waterRecovery_fraction < 0 || waterRecovery_fraction >= 1) {
        throw new RangeError('waterRecovery_fraction must be in [0, 1)');
    }

    // Água total na polpa (m³/h), assumindo densidade da água = 1 t/m³
    // Total water in slurry (m³/h), assuming water density = 1 t/m³
    const waterInSlurry_m3h = (tailingsRate_th * (1 - slurrySolidsFraction)) / slurrySolidsFraction;

    // Água recuperada no espessador/filtro
    const waterRecovered_m3h = waterInSlurry_m3h * waterRecovery_fraction;

    return waterInSlurry_m3h - waterRecovered_m3h;
}

/**
 * Compute overall plant water balance: inputs vs outputs.
 * Calcula o balanço hídrico global da usina: entradas vs saídas.
 *
 * Water balance equation (ANCOLD 2012):
 *   Inputs:  freshWater + precipitation on TSF
 *   Outputs: evaporation + tailingsLoss + processLoss + productMoisture
 *   Net surplus (>0) or deficit (<0) drives make-up water requirement.
 *
 * @param {Object} params
 * @param {number} params.freshWater_m3h        Fresh water intake (m³/h)
 * @param {number} params.precipitation_m3h     Precipitation on TSF surface (m³/h)
 * @param {number} params.evaporation_m3h       Evaporation from TSF (m³/h)
 * @param {number} params.tailingsLoss_m3h      Water locked in tailings (m³/h)
 * @param {number} params.processLoss_m3h       In-process losses (m³/h): dust, steam
 * @param {number} params.productMoisture_m3h   Water in concentrate/product (m³/h)
 * @returns {{ surplus_m3h: number, balanced: boolean }}
 *   surplus_m3h: positive = excess water; negative = deficit requiring more fresh water
 *   balanced: true if |surplus| < 1% of freshWater intake (operational closure)
 * @throws {RangeError} If any input is not a non-negative finite number
 */
export function plantWaterBalance(params: any) {
    const keys = [
        'freshWater_m3h',
        'precipitation_m3h',
        'evaporation_m3h',
        'tailingsLoss_m3h',
        'processLoss_m3h',
        'productMoisture_m3h',
    ];

    const p = /** @type {Record<string, number>} */ (params);
    for (const k of keys) {
        if (!Number.isFinite(p[k]) || p[k] < 0) {
            throw new RangeError(`params.${k} must be a non-negative finite number`);
        }
    }

    const totalIn = params.freshWater_m3h + params.precipitation_m3h;
    const totalOut =
        params.evaporation_m3h + params.tailingsLoss_m3h + params.processLoss_m3h + params.productMoisture_m3h;

    const surplus_m3h = totalIn - totalOut;

    // Circuito fechado quando o surplus é < 1% da entrada de água fresca
    const threshold = params.freshWater_m3h * 0.01;
    const balanced = Math.abs(surplus_m3h) <= threshold;

    return { surplus_m3h, balanced };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineralProcessingWaterBalanceMeta = {
    name: 'mineralProcessingWaterBalance',
    description: 'mineralProcessingWaterBalance',
    category: 'analytics',
    familyTags: ['water', 'mining'],
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
