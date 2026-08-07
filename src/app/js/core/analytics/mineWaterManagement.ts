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
 * Mine Water Management - balanço hídrico e qualidade de água em minas
 *
 * Referências acadêmicas:
 * - Younger, P.L. et al. (2002) Mine Water: Hydrology, Pollution, Remediation.
 *   DOI:10.1007/978-94-010-0055-8
 * - Rapantova, N. & Hrb, P. (2008) Mine Water Management - review. DOI:10.1007/s10230-008-0039-y
 * - Wolkersdorfer, C. (2008) Water Management at Abandoned Flooded Underground Mines.
 *   DOI:10.1007/978-3-540-77331-3
 */

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

type MineWaterQuality = 'clean' | 'slightly_impacted' | 'impacted' | 'acid_mine_drainage';

/**
 * Calcula o afluxo total de água para a mina (runoff superficial + infiltração do lençol).
 * Balanço: runoff anual convertido para m³/dia + infiltração de água subterrânea.
 *
 * @param {number} catchment_area_km2 - Área de captação da bacia (km²), deve ser > 0
 * @param {number} rainfall_mm - Precipitação média anual (mm/ano), deve ser ≥ 0
 * @param {number} runoff_coef - Coeficiente de escoamento superficial (adimensional, 0–1)
 * @param {number} groundwater_seepage_L_s - Infiltração de água subterrânea (L/s), deve ser ≥ 0
 * @returns {{ total_inflow_m3_day: number }} Total de afluxo hídrico diário em m³/dia
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se área ≤ 0, chuva < 0, runoff_coef fora de [0,1] ou seepage < 0
 */
export function computeWaterInflow(
    catchment_area_km2: number,
    rainfall_mm: number,
    runoff_coef: number,
    groundwater_seepage_L_s: number,
): { total_inflow_m3_day: number } {
    assertAllFinite(
        {
            catchment_area_km2,
            rainfall_mm,
            runoff_coef,
            groundwater_seepage_L_s,
        },
        'computeWaterInflow',
    );

    if (catchment_area_km2 <= 0) throw new RangeError('catchment_area_km2 deve ser > 0');
    if (rainfall_mm < 0) throw new RangeError('rainfall_mm deve ser ≥ 0');
    if (runoff_coef < 0 || runoff_coef > 1) throw new RangeError('runoff_coef deve estar em [0, 1]');
    if (groundwater_seepage_L_s < 0) throw new RangeError('groundwater_seepage_L_s deve ser ≥ 0');

    // Converte área para m², aplica lâmina pluviométrica e coeficiente de escoamento
    // Volume anual (m³) / 365.25 dias = volume diário (m³/dia)
    const area_m2 = catchment_area_km2 * 1e6;
    const runoff_m3_day = ((rainfall_mm / 1000) * area_m2 * runoff_coef) / 365.25;

    // Converte infiltração de L/s para m³/dia: 1 L/s = 86.4 m³/dia
    const seepage_m3_day = groundwater_seepage_L_s * 86.4;

    return { total_inflow_m3_day: runoff_m3_day + seepage_m3_day };
}

/**
 * Calcula a capacidade de bombeamento necessária para rebaixamento do nível d'água.
 * Considera afluxo contínuo mais esvaziamento do poço de bombeamento no tempo de drawdown.
 *
 * @param {number} total_inflow_m3_day - Afluxo total (m³/dia), deve ser ≥ 0
 * @param {number} sump_volume_m3 - Volume do poço de acumulação (m³), deve ser > 0
 * @param {number} drawdown_hours - Tempo de rebaixamento desejado (horas), deve ser > 0
 * @returns {{ pump_capacity_m3_h: number }} Capacidade da bomba em m³/h
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se afluxo < 0, volume ≤ 0 ou tempo de drawdown ≤ 0
 */
export function computePumpingRequirement(
    total_inflow_m3_day: number,
    sump_volume_m3: number,
    drawdown_hours: number,
): { pump_capacity_m3_h: number } {
    assertAllFinite({ total_inflow_m3_day, sump_volume_m3, drawdown_hours }, 'computePumpingRequirement');

    if (total_inflow_m3_day < 0) throw new RangeError('total_inflow_m3_day deve ser ≥ 0');
    if (sump_volume_m3 <= 0) throw new RangeError('sump_volume_m3 deve ser > 0');
    if (drawdown_hours <= 0) throw new RangeError('drawdown_hours deve ser > 0');

    // Converte afluxo diário para horário, soma a parcela de esvaziamento do sump
    const inflow_m3_h = total_inflow_m3_day / 24;
    const sump_drain_m3_h = sump_volume_m3 / drawdown_hours;
    const pump_capacity_m3_h = inflow_m3_h + sump_drain_m3_h;

    return { pump_capacity_m3_h };
}

/**
 * Calcula a carga de poluentes (sólidos em suspensão e metais pesados) para dimensionamento
 * de sistemas de tratamento de água de mina.
 *
 * @param {number} flow_m3_day - Vazão de água tratada (m³/dia), deve ser > 0
 * @param {number} TSS_mg_L - Concentração de sólidos em suspensão totais (mg/L), deve ser ≥ 0
 * @param {number} heavy_metals_mg_L - Concentração total de metais pesados (mg/L), deve ser ≥ 0
 * @returns {{ TSS_kg_day: number, metals_kg_day: number }} Cargas em kg/dia
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se vazão ≤ 0, TSS < 0 ou metais < 0
 */
export function computeWaterTreatmentLoad(
    flow_m3_day: number,
    TSS_mg_L: number,
    heavy_metals_mg_L: number,
): { TSS_kg_day: number; metals_kg_day: number } {
    assertAllFinite({ flow_m3_day, TSS_mg_L, heavy_metals_mg_L }, 'computeWaterTreatmentLoad');

    if (flow_m3_day <= 0) throw new RangeError('flow_m3_day deve ser > 0');
    if (TSS_mg_L < 0) throw new RangeError('TSS_mg_L deve ser ≥ 0');
    if (heavy_metals_mg_L < 0) throw new RangeError('heavy_metals_mg_L deve ser ≥ 0');

    // Carga (kg/dia) = concentração (mg/L) × vazão (m³/dia) × 1000 L/m³ / 1e6 mg/kg
    // Simplifica para: concentração × vazão × 1e-3
    const TSS_kg_day = TSS_mg_L * flow_m3_day * 1e-3;
    const metals_kg_day = heavy_metals_mg_L * flow_m3_day * 1e-3;

    return { TSS_kg_day, metals_kg_day };
}

/**
 * Classifica a qualidade da água de mina segundo parâmetros físico-químicos.
 * AMD (Drenagem Ácida de Mina) é o caso mais crítico, definido por pH muito baixo ou Fe elevado.
 *
 * @param {number} pH - pH da água (adimensional, 0–14)
 * @param {number} TSS_mg_L - Sólidos em suspensão totais (mg/L), deve ser ≥ 0
 * @param {number} conductivity_uS_cm - Condutividade elétrica (µS/cm), deve ser ≥ 0
 * @param {number} Fe_mg_L - Concentração de ferro total (mg/L), deve ser ≥ 0
 * @returns {{ quality: 'clean'|'slightly_impacted'|'impacted'|'acid_mine_drainage' }}
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se pH fora de [0,14], TSS/condutividade/Fe < 0
 */
export function classifyMineWaterQuality(
    pH: number,
    TSS_mg_L: number,
    conductivity_uS_cm: number,
    Fe_mg_L: number,
): { quality: MineWaterQuality } {
    assertAllFinite({ pH, TSS_mg_L, conductivity_uS_cm, Fe_mg_L }, 'classifyMineWaterQuality');
    assertMineWaterQualityRanges(pH, TSS_mg_L, conductivity_uS_cm, Fe_mg_L);

    return { quality: determineMineWaterQuality(pH, TSS_mg_L, conductivity_uS_cm, Fe_mg_L) };
}

function assertAllFinite(values: Record<string, number>, context: string): void {
    for (const [key, value] of Object.entries(values)) {
        if (typeof value !== 'number' || !isFinite(value)) {
            throw new TypeError(`${context}: todos os parâmetros devem ser números finitos (${key})`);
        }
    }
}

function assertMineWaterQualityRanges(
    pH: number,
    TSS_mg_L: number,
    conductivity_uS_cm: number,
    Fe_mg_L: number,
): void {
    if (pH < 0 || pH > 14) throw new RangeError('pH deve estar em [0, 14]');
    if (TSS_mg_L < 0) throw new RangeError('TSS_mg_L deve ser ≥ 0');
    if (conductivity_uS_cm < 0) throw new RangeError('conductivity_uS_cm deve ser ≥ 0');
    if (Fe_mg_L < 0) throw new RangeError('Fe_mg_L deve ser ≥ 0');
}

function determineMineWaterQuality(
    pH: number,
    TSS_mg_L: number,
    conductivity_uS_cm: number,
    Fe_mg_L: number,
): MineWaterQuality {
    // Drenagem Ácida de Mina: pH muito ácido ou ferro muito elevado
    if (pH < 4 || Fe_mg_L > 50) return 'acid_mine_drainage';

    // Impactada: pH ácido ou TSS muito elevado
    if (pH < 6 || TSS_mg_L > 500) return 'impacted';

    // Ligeiramente impactada: pH levemente ácido ou condutividade alta
    if (pH < 6.5 || conductivity_uS_cm > 2000) return 'slightly_impacted';

    return 'clean';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineWaterManagementMeta: AnalyticsModuleMeta = {
    name: 'mineWaterManagement',
    description: 'mineWaterManagement',
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
