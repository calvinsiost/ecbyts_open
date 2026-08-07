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
 * Modelos de mistura estuarina e saúde de estuários costeiros.
 *
 * Academic references:
 *   - Dyer KR (1997). Estuaries: A Physical Introduction, 2nd ed.
 *     Wiley. ISBN:9780471974703
 *   - Pritchard DW (1952). Salinity distribution and circulation in the
 *     Chesapeake Bay estuarine system. J. Mar. Res., 11, 106-123.
 *   - Nixon SW et al. (1996). The fate of nitrogen and phosphorus at the
 *     land-sea margin. Biogeochemistry, 35, 141-180.
 *     DOI:10.1007/BF02179826
 */
/**
 * Calcula a salinidade de mistura conservativa no estuário.
 * S_est = (Q_tidal × S_ocean + Q_river × S_river) / (Q_tidal + Q_river)
 * Mistura conservativa assume que sal não é criado nem destruído.
 *
 * @param {number} S_river Salinidade do rio (PSU; tipicamente ≈ 0).
 * @param {number} S_ocean Salinidade oceânica na bocaina (PSU; tipicamente 30-36).
 * @param {number} Q_river_m3_s Vazão do rio (m³/s; > 0).
 * @param {number} Q_tidal_m3_s Prisma de maré normalizado por ciclo (m³/s; > 0).
 * @returns {{ S_estuary: number }} Salinidade média do estuário em PSU.
 */
export function computeSalinityMixing(S_river: any, S_ocean: any, Q_river_m3_s: any, Q_tidal_m3_s: any) {
    if (typeof S_river !== 'number')
        throw new TypeError('S_river must be a number');
    if (typeof S_ocean !== 'number')
        throw new TypeError('S_ocean must be a number');
    if (typeof Q_river_m3_s !== 'number')
        throw new TypeError('Q_river_m3_s must be a number');
    if (typeof Q_tidal_m3_s !== 'number')
        throw new TypeError('Q_tidal_m3_s must be a number');
    if (S_river < 0 || S_river > 40)
        throw new RangeError('S_river must be 0-40 PSU');
    if (S_ocean < 0 || S_ocean > 45)
        throw new RangeError('S_ocean must be 0-45 PSU');
    if (Q_river_m3_s <= 0)
        throw new RangeError('Q_river_m3_s must be > 0');
    if (Q_tidal_m3_s <= 0)
        throw new RangeError('Q_tidal_m3_s must be > 0');
    const S_estuary = (Q_tidal_m3_s * S_ocean + Q_river_m3_s * S_river) / (Q_tidal_m3_s + Q_river_m3_s);
    return { S_estuary };
}
/**
 * Calcula o tempo de renovação (flushing time) de um estuário.
 * T = volume / (prisma_tidal × ciclos_dia + vazão_rio × 86400)
 * Maré semidiurna: 2 ciclos/dia; maré diurna: 1 ciclo/dia.
 * (Dyer 1997, ISBN:9780471974703)
 *
 * @param {number} volume_m3 Volume total do estuário (m³; > 0).
 * @param {number} tidal_prism_m3 Prisma de maré por ciclo (m³; > 0).
 * @param {number} river_flow_m3_s Vazão fluvial média (m³/s; > 0).
 * @returns {{ flushing_time_days: number }} Tempo de renovação em dias.
 */
export function computeEstuaryFlushingTime(volume_m3: any, tidal_prism_m3: any, river_flow_m3_s: any) {
    if (typeof volume_m3 !== 'number')
        throw new TypeError('volume_m3 must be a number');
    if (typeof tidal_prism_m3 !== 'number')
        throw new TypeError('tidal_prism_m3 must be a number');
    if (typeof river_flow_m3_s !== 'number')
        throw new TypeError('river_flow_m3_s must be a number');
    if (volume_m3 <= 0)
        throw new RangeError('volume_m3 must be > 0');
    if (tidal_prism_m3 <= 0)
        throw new RangeError('tidal_prism_m3 must be > 0');
    if (river_flow_m3_s <= 0)
        throw new RangeError('river_flow_m3_s must be > 0');
    // 2 ciclos de maré por dia (maré semidiurna, padrão atlântico)
    const tidal_cycles_per_day = 2;
    const daily_exchange_m3 = tidal_prism_m3 * tidal_cycles_per_day + river_flow_m3_s * 86400;
    const flushing_time_days = volume_m3 / daily_exchange_m3;
    return { flushing_time_days };
}
/**
 * Calcula a retenção de nutrientes no estuário.
 * retained = input × (1 - exp(-uptake × flushing_time))
 * Modelo cinético de primeira ordem (Nixon et al. 1996).
 *
 * @param {number} input_load_kg_day Carga de entrada de nutrientes (kg/dia; > 0).
 * @param {number} flushing_time_days Tempo de renovação em dias (> 0).
 * @param {number} uptake_rate_per_day Taxa de assimilação biótica por dia (> 0).
 * @returns {{ retained_kg_day: number, retention_pct: number }}
 */
export function computeNutrientRetention(input_load_kg_day: any, flushing_time_days: any, uptake_rate_per_day: any) {
    if (typeof input_load_kg_day !== 'number')
        throw new TypeError('input_load_kg_day must be a number');
    if (typeof flushing_time_days !== 'number')
        throw new TypeError('flushing_time_days must be a number');
    if (typeof uptake_rate_per_day !== 'number')
        throw new TypeError('uptake_rate_per_day must be a number');
    if (input_load_kg_day <= 0)
        throw new RangeError('input_load_kg_day must be > 0');
    if (flushing_time_days <= 0)
        throw new RangeError('flushing_time_days must be > 0');
    if (uptake_rate_per_day <= 0)
        throw new RangeError('uptake_rate_per_day must be > 0');
    const retained_kg_day = input_load_kg_day * (1 - Math.exp(-uptake_rate_per_day * flushing_time_days));
    const retention_pct = (retained_kg_day / input_load_kg_day) * 100;
    return { retained_kg_day, retention_pct };
}
/**
 * Classifica a saúde ecológica do estuário com base em gradiente de salinidade,
 * oxigênio dissolvido e turbidez.
 *
 * Critérios:
 *   excellent → OD≥7 E turbidez<20 NTU
 *   good      → OD≥5 E turbidez<50 NTU
 *   fair      → OD≥3
 *   poor      → demais casos
 *
 * @param {number} salinity_gradient Gradiente de salinidade (PSU/km; ≥ 0).
 * @param {number} DO_mg_L Oxigênio dissolvido (mg/L; ≥ 0).
 * @param {number} turbidity_NTU Turbidez em NTU (≥ 0).
 * @returns {{ health: 'excellent'|'good'|'fair'|'poor' }}
 */
export function classifyEstuarineHealth(salinity_gradient: any, DO_mg_L: any, turbidity_NTU: any) {
    if (typeof salinity_gradient !== 'number')
        throw new TypeError('salinity_gradient must be a number');
    if (typeof DO_mg_L !== 'number')
        throw new TypeError('DO_mg_L must be a number');
    if (typeof turbidity_NTU !== 'number')
        throw new TypeError('turbidity_NTU must be a number');
    if (salinity_gradient < 0)
        throw new RangeError('salinity_gradient must be >= 0');
    if (DO_mg_L < 0)
        throw new RangeError('DO_mg_L must be >= 0');
    if (turbidity_NTU < 0)
        throw new RangeError('turbidity_NTU must be >= 0');
    /** @type {'excellent'|'good'|'fair'|'poor'} */
    let health;
    if (DO_mg_L >= 7 && turbidity_NTU < 20)
        health = 'excellent';
    else if (DO_mg_L >= 5 && turbidity_NTU < 50)
        health = 'good';
    else if (DO_mg_L >= 3)
        health = 'fair';
    else
        health = 'poor';
    return { health };
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const estuaryMixingModelMeta = {
    name: 'estuaryMixingModel',
    description: 'estuaryMixingModel',
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
//# sourceMappingURL=estuaryMixingModel.js.map
