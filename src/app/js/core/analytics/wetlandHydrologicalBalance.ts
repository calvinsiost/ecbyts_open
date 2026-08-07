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
'use strict';

/**
 * Wetland Hydrological Balance
 * Balanço hidrológico de áreas úmidas (wetlands).
 *
 * Referências:
 *   Mitsch & Gosselink (2015) Wetlands, 5th ed. ISBN 978-1-118-67682-0
 *   Priestley & Taylor (1972) Mon. Weather Rev. 100:81-92. DOI:10.1175/1520-0493(1972)100<0081:OTAEOF>2.3.CO;2
 */

// Constante de Priestley-Taylor para wetlands: α = 1.26 (Mitsch & Gosselink 2015, p.72)
const PRIESTLEY_TAYLOR_ALPHA = 1.26;

// Calor latente de vaporização (MJ/kg), aproximação a 20 °C
const LAMBDA_MJ_PER_KG = 2.45;

// Constante psicrométrica γ (kPa/°C) ao nível do mar
const PSYCHROMETRIC_GAMMA = 0.066;

/**
 * Calcula o balanço hidrológico de um wetland para um período.
 * Equação: ΔS = P + Q_in - ET - Q_out - G  (Mitsch & Gosselink 2015, eq. 4-1)
 *
 * @param {number} precip       - Precipitação no período (mm)
 * @param {number} ET           - Evapotranspiração real no período (mm)
 * @param {number} inflow       - Entrada de água superficial/subsuperficial (mm)
 * @param {number} outflow      - Saída de água superficial/subsuperficial (mm)
 * @param {number} seepage      - Perda por percolação profunda / seepage (mm, positivo = saída)
 * @returns {{ deltaS: number, hydrologicalDeficit: number, surplus: number }}
 *   deltaS em mm; deficit > 0 quando ΔS < 0; surplus > 0 quando ΔS > 0
 */
export function calcHydrologicalBalance(precip: any, ET: any, inflow: any, outflow: any, seepage: any) {
    if (
        typeof precip !== 'number' ||
        typeof ET !== 'number' ||
        typeof inflow !== 'number' ||
        typeof outflow !== 'number' ||
        typeof seepage !== 'number'
    ) {
        throw new TypeError('calcHydrologicalBalance: todos os parâmetros devem ser números.');
    }
    if (precip < 0 || ET < 0 || inflow < 0 || outflow < 0 || seepage < 0) {
        throw new RangeError('calcHydrologicalBalance: valores negativos não são aceitos.');
    }

    // ΔS = P + Qin - ET - Qout - G
    const deltaS = precip + inflow - ET - outflow - seepage;

    return {
        deltaS,
        hydrologicalDeficit: deltaS < 0 ? -deltaS : 0,
        surplus: deltaS > 0 ? deltaS : 0,
    };
}

/**
 * Calcula o hidroperíodo (dias com lâmina d'água) a partir de uma série de ΔS diários.
 * Definição: fração do período em que o armazenamento acumulado supera o limiar.
 *
 * @param {number[]} deltaSeries_mm - Série temporal de ΔS diários (mm/dia); comprimento = N dias
 * @param {number}  threshold_mm   - Limiar mínimo de armazenamento positivo (mm) para considerar inundado (default 0)
 * @returns {{ hydroperiodDays: number, floodedFraction: number }}
 */
export function calcHydroperiod(deltaSeries_mm: any, threshold_mm = 0) {
    if (!Array.isArray(deltaSeries_mm) || deltaSeries_mm.length === 0) {
        throw new TypeError('calcHydroperiod: deltaSeries_mm deve ser array não-vazio.');
    }
    if (typeof threshold_mm !== 'number') {
        throw new TypeError('calcHydroperiod: threshold_mm deve ser número.');
    }

    // Integrar ΔS cumulativo; contar dias em que S_acum > threshold
    let storageAccum = 0;
    let floodedDays = 0;

    for (const delta of deltaSeries_mm) {
        if (typeof delta !== 'number') {
            throw new TypeError('calcHydroperiod: todos os valores da série devem ser números.');
        }
        storageAccum += delta;
        if (storageAccum > threshold_mm) floodedDays++;
    }

    const totalDays = deltaSeries_mm.length;
    return {
        hydroperiodDays: floodedDays,
        floodedFraction: floodedDays / totalDays,
    };
}

/**
 * Calcula a evapotranspiração de wetland pelo método Priestley-Taylor.
 * ET_PT = α × (Δ / (Δ + γ)) × (Rn / λ)  (Priestley & Taylor 1972)
 *
 * @param {number} Rn          - Radiação líquida (MJ/m²/dia)
 * @param {number} T_air       - Temperatura do ar (°C)
 * @param {number} windSpeed   - Velocidade do vento (m/s) - influência no Δ, não usada diretamente aqui
 * @param {number} relHumidity - Umidade relativa (0-1, fração)
 * @returns {number} ET em mm/dia
 */
export function calcWetlandEvapotranspiration(Rn: any, T_air: any, windSpeed: any, relHumidity: any) {
    if (
        typeof Rn !== 'number' ||
        typeof T_air !== 'number' ||
        typeof windSpeed !== 'number' ||
        typeof relHumidity !== 'number'
    ) {
        throw new TypeError('calcWetlandEvapotranspiration: todos os parâmetros devem ser números.');
    }
    if (Rn < 0) {
        throw new RangeError('calcWetlandEvapotranspiration: Rn deve ser >= 0.');
    }
    if (relHumidity < 0 || relHumidity > 1) {
        throw new RangeError('calcWetlandEvapotranspiration: relHumidity deve ser entre 0 e 1.');
    }
    if (windSpeed < 0) {
        throw new RangeError('calcWetlandEvapotranspiration: windSpeed deve ser >= 0.');
    }

    // Inclinação da curva de pressão de vapor saturado Δ (kPa/°C) - Allen et al. 1998 eq. 13
    const Delta = (4098 * 0.6108 * Math.exp((17.27 * T_air) / (T_air + 237.3))) / Math.pow(T_air + 237.3, 2);

    // Priestley-Taylor: ET (mm/dia) = α × (Δ/(Δ+γ)) × Rn/λ
    // Rn em MJ/m²/dia; λ = 2.45 MJ/kg; resultado em mm/dia
    const ET = PRIESTLEY_TAYLOR_ALPHA * (Delta / (Delta + PSYCHROMETRIC_GAMMA)) * (Rn / LAMBDA_MJ_PER_KG);

    return Math.max(0, ET);
}

/**
 * Classifica o tipo hidrológico do wetland com base no hidroperíodo e profundidade média.
 * Classes per Mitsch & Gosselink (2015), Tabela 4-2.
 *
 * @param {number} hydroperiodDays - Dias inundados por ano (0-365)
 * @param {number} depthAvg_m     - Profundidade média d'água quando inundado (m)
 * @returns {'ephemeral'|'seasonal'|'semi-permanent'|'permanent'}
 */
export function classifyWetlandHydrology(hydroperiodDays: any, depthAvg_m: any) {
    if (typeof hydroperiodDays !== 'number' || typeof depthAvg_m !== 'number') {
        throw new TypeError('classifyWetlandHydrology: parâmetros devem ser números.');
    }
    if (hydroperiodDays < 0 || hydroperiodDays > 365) {
        throw new RangeError('classifyWetlandHydrology: hydroperiodDays deve ser entre 0 e 365.');
    }
    if (depthAvg_m < 0) {
        throw new RangeError('classifyWetlandHydrology: depthAvg_m deve ser >= 0.');
    }

    if (hydroperiodDays < 30) return 'ephemeral';
    if (hydroperiodDays < 120) return 'seasonal';
    if (hydroperiodDays < 300 || depthAvg_m < 0.5) return 'semi-permanent';
    return 'permanent';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const wetlandHydrologicalBalanceMeta = {
    name: 'wetlandHydrologicalBalance',
    description: 'wetlandHydrologicalBalance',
    category: 'analytics',
    familyTags: ['wetland', 'hydrogeology'],
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
