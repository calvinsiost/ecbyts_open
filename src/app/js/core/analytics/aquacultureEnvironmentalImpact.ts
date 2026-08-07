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
 * Aquaculture Environmental Impact Module
 *
 * Avalia os impactos ambientais de sistemas aquícolas através do cálculo de
 * cargas de nutrientes (N, P), demanda de oxigênio e capacidade de suporte
 * do corpo hídrico receptor.
 *
 * References:
 *  - Naylor R.L. et al. (2000). Effect of aquaculture on world fish supplies.
 *    Nature, 405, 1017–1024.
 *    DOI: 10.1126/science.282.5390.883
 *  - Beveridge M.C.M. (1996). Cage Aquaculture (2nd ed.). Fishing News Books.
 *    ISBN: 9780852382462
 *  - Thorpe J.E. & Cho C.Y. (1995). Minimising waste through bioenergetically
 *    and behaviourally based feeding strategies. Water Sci. Technol. 31, 29–40.
 *    DOI: 10.2166/wst.1995.0025
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

/**
 * Retenção de nitrogênio e fósforo por peixes (valores médios da literatura).
 * Valores conservadores; espécies carnívoras retêm menos N e P.
 */
const N_RETENTION_FRACTION = 0.3; // 30% do N do alimento retido na biomassa
const P_RETENTION_FRACTION = 0.25; // 25% do P do alimento retido na biomassa

/**
 * Calcula a carga diária de nutrientes (N e P) de um sistema aquícola.
 * N_excretado = ração × %N_alimento × (1 - retenção_N).
 * P_excretado = ração × %P_alimento × (1 - retenção_P).
 *
 * @param feed_kg_day   Consumo diário de ração (kg/dia).
 * @param FCR           Razão de conversão alimentar (kg ração / kg peixe produzido).
 * @param N_pct_feed    Percentual de nitrogênio na ração (% em peso, ex: 7.5).
 * @param P_pct_feed    Percentual de fósforo na ração (% em peso, ex: 1.2).
 * @returns Carga diária de N e P em kg/dia.
 * @throws {TypeError} Se algum argumento não for número.
 * @throws {RangeError} Se valores estiverem fora dos limites aceitáveis.
 */
export function computeNutrientLoading(
    feed_kg_day: number,
    FCR: number,
    N_pct_feed: number,
    P_pct_feed: number,
): { N_kg_day: number; P_kg_day: number } {
    if (
        typeof feed_kg_day !== 'number' ||
        typeof FCR !== 'number' ||
        typeof N_pct_feed !== 'number' ||
        typeof P_pct_feed !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (feed_kg_day <= 0) throw new RangeError('feed_kg_day must be > 0');
    if (FCR <= 0) throw new RangeError('FCR must be > 0');
    if (N_pct_feed < 0 || N_pct_feed > 100) throw new RangeError('N_pct_feed must be in [0, 100]');
    if (P_pct_feed < 0 || P_pct_feed > 100) throw new RangeError('P_pct_feed must be in [0, 100]');

    // Carga excretada = ração × fração do nutriente × (1 - retenção)
    const N_kg_day = feed_kg_day * (N_pct_feed / 100) * (1 - N_RETENTION_FRACTION);
    const P_kg_day = feed_kg_day * (P_pct_feed / 100) * (1 - P_RETENTION_FRACTION);

    return { N_kg_day, P_kg_day };
}

/**
 * Calcula a demanda diária de oxigênio dissolvido de um sistema aquícola.
 * Inclui respiração dos peixes e oxidação de detritos orgânicos.
 * DO_total = (biomassa × taxa_respiração × 24h / 1e6) + (detritos × 0.02 kg O₂/kg detritos).
 *
 * @param biomass_kg               Biomassa total de peixes no sistema (kg).
 * @param respiration_rate_mg_O2_kg_h  Taxa de respiração (mg O₂/kg peixe/h).
 * @param detritus_kg              Massa de detritos orgânicos acumulados (kg).
 * @returns Demanda total de oxigênio em kg/dia.
 * @throws {TypeError} Se algum argumento não for número.
 * @throws {RangeError} Se valores forem negativos.
 */
export function computeOxygenDemand(
    biomass_kg: number,
    respiration_rate_mg_O2_kg_h: number,
    detritus_kg: number,
): { DO_demand_kg_day: number } {
    if (
        typeof biomass_kg !== 'number' ||
        typeof respiration_rate_mg_O2_kg_h !== 'number' ||
        typeof detritus_kg !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (biomass_kg < 0) throw new RangeError('biomass_kg must be >= 0');
    if (respiration_rate_mg_O2_kg_h < 0) throw new RangeError('respiration_rate must be >= 0');
    if (detritus_kg < 0) throw new RangeError('detritus_kg must be >= 0');

    // Respiração dos peixes: mg O₂/kg/h × kg × 24h → mg → kg (÷1e6)
    const fish_demand_kg_day = (biomass_kg * respiration_rate_mg_O2_kg_h * 24) / 1e6;

    // Demanda de oxidação dos detritos: ~2% da massa de detritos por dia em O₂
    const detritus_demand_kg_day = detritus_kg * 0.02;

    const DO_demand_kg_day = fish_demand_kg_day + detritus_demand_kg_day;
    return { DO_demand_kg_day };
}

/**
 * Estima a capacidade de suporte máxima do sistema aquícola baseada em oxigênio.
 * Biomassa máxima = (OD_disponível × volume) / demanda_OD_por_kg_peixe.
 *
 * @param water_volume_m3          Volume do corpo hídrico receptor (m³).
 * @param DO_available_mg_L        Concentração de OD disponível (mg/L).
 * @param DO_demand_per_kg_fish    Demanda de OD por kg de biomassa (kg O₂/kg peixe/dia).
 * @returns Biomassa máxima sustentável (kg).
 * @throws {TypeError} Se algum argumento não for número.
 * @throws {RangeError} Se valores forem não-positivos.
 */
export function computeCarryingCapacity(
    water_volume_m3: number,
    DO_available_mg_L: number,
    DO_demand_per_kg_fish: number,
): { max_biomass_kg: number } {
    if (
        typeof water_volume_m3 !== 'number' ||
        typeof DO_available_mg_L !== 'number' ||
        typeof DO_demand_per_kg_fish !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (water_volume_m3 <= 0) throw new RangeError('water_volume_m3 must be > 0');
    if (DO_available_mg_L <= 0) throw new RangeError('DO_available_mg_L must be > 0');
    if (DO_demand_per_kg_fish <= 0) throw new RangeError('DO_demand_per_kg_fish must be > 0');

    // DO disponível em volume: mg/L × m³ × 1000 L/m³ → mg → kg (÷1e6)
    const DO_total_kg = (DO_available_mg_L * water_volume_m3 * 1000) / 1e6;

    const max_biomass_kg = DO_total_kg / DO_demand_per_kg_fish;
    return { max_biomass_kg };
}

/**
 * Classifica o impacto ambiental de um sistema aquícola com base na carga de nutrientes
 * normalizada pelo volume do corpo hídrico receptor.
 * Critério primário: razão N (kg/dia) por megametro cúbico de água (Mm³).
 *
 * @param N_kg_day      Carga diária de nitrogênio (kg/dia).
 * @param P_kg_day      Carga diária de fósforo (kg/dia).
 * @param water_volume_m3  Volume do corpo hídrico receptor (m³).
 * @returns Nível de impacto: 'negligible', 'low', 'moderate', 'high'.
 * @throws {TypeError} Se algum argumento não for número.
 * @throws {RangeError} Se valores forem negativos ou volume for zero.
 */
export function classifyAquacultureImpact(
    N_kg_day: number,
    P_kg_day: number,
    water_volume_m3: number,
): { impact: string } {
    if (typeof N_kg_day !== 'number' || typeof P_kg_day !== 'number' || typeof water_volume_m3 !== 'number') {
        throw new TypeError('All arguments must be numbers');
    }
    if (N_kg_day < 0) throw new RangeError('N_kg_day must be >= 0');
    if (P_kg_day < 0) throw new RangeError('P_kg_day must be >= 0');
    if (water_volume_m3 <= 0) throw new RangeError('water_volume_m3 must be > 0');

    // Razão N em kg por Mm³ de água (megametro cúbico = 1e6 m³)
    const volume_Mm3 = water_volume_m3 / 1e6;
    const N_ratio = N_kg_day / volume_Mm3;

    if (N_ratio < 0.5) return { impact: 'negligible' };
    if (N_ratio < 2) return { impact: 'low' };
    if (N_ratio < 10) return { impact: 'moderate' };
    return { impact: 'high' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const aquacultureEnvironmentalImpactMeta: AnalyticsModuleMeta = {
    name: 'aquacultureEnvironmentalImpact',
    description: 'aquacultureEnvironmentalImpact',
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
