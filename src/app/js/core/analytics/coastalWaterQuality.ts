// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Coastal Water Quality - bathing quality index, fecal contamination, harmful algal blooms
// Qualidade da água costeira - índice de balneabilidade, contaminação fecal e toxinas de maré vermelha

'use strict';

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

type BqiCategory = 'excellent' | 'good' | 'sufficient' | 'poor';
type HabRisk = 'low' | 'moderate' | 'high' | 'bloom';

/**
 * Compute the Bathing Quality Index (BQI) based on EU Bathing Water Directive 2006/7/CE.
 * Calcula o Índice de Qualidade de Banho baseado na Diretiva Europeia de Águas de Banho.
 *
 * @param ecoli_CFU_100mL - E. coli concentration in CFU/100mL
 * @param enterococcus_CFU_100mL - Intestinal enterococci in CFU/100mL
 * @param visual_inspection_score - Visual score 0–10 (litter, foam, oil sheen)
 *
 * Refs: EU Directive 2006/7/CE Annex I; CONAMA 274/2000; CETESB (2021) Qualidade das praias
 */
export function computeBathingQualityIndex(
    ecoli_CFU_100mL: number,
    enterococcus_CFU_100mL: number,
    visual_inspection_score: number,
): { bqi: number; category: BqiCategory } {
    if (
        typeof ecoli_CFU_100mL !== 'number' ||
        typeof enterococcus_CFU_100mL !== 'number' ||
        typeof visual_inspection_score !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (ecoli_CFU_100mL < 0 || enterococcus_CFU_100mL < 0) {
        throw new RangeError('CFU counts cannot be negative');
    }
    if (visual_inspection_score < 0 || visual_inspection_score > 10) {
        throw new RangeError('visual_inspection_score must be in [0, 10]');
    }

    // EU 2006/7/CE: categorias baseadas no pior dos dois parâmetros
    // Excelente: E.coli ≤ 250 (95°P) → usamos valor de referência simplificado ≤ 100 (Excelente), ≤ 500 (Bom), ≤ 900 (Suficiente)
    const ecoli_cat: BqiCategory =
        ecoli_CFU_100mL <= 100
            ? 'excellent'
            : ecoli_CFU_100mL <= 500
              ? 'good'
              : ecoli_CFU_100mL <= 900
                ? 'sufficient'
                : 'poor';
    // Enterococcus thresholds: ≤ 40 Excellent, ≤ 200 Good, ≤ 185 Sufficient (inland); coastal: ≤ 100, ≤ 200, ≤ 185
    const entero_cat: BqiCategory =
        enterococcus_CFU_100mL <= 100
            ? 'excellent'
            : enterococcus_CFU_100mL <= 200
              ? 'good'
              : enterococcus_CFU_100mL <= 185
                ? 'sufficient'
                : 'poor';

    const CAT_RANK: Record<BqiCategory, number> = { excellent: 3, good: 2, sufficient: 1, poor: 0 };
    // Pior dos dois parâmetros define a categoria
    const base_category = CAT_RANK[ecoli_cat] <= CAT_RANK[entero_cat] ? ecoli_cat : entero_cat;

    // BQI score numérico: excellent=100, good=75, sufficient=50, poor=25
    const BASE_SCORE: Record<BqiCategory, number> = { excellent: 100, good: 75, sufficient: 50, poor: 25 };
    // Inspeção visual ajusta ±5%: score 5 = neutro, >5 melhora, <5 piora
    const visual_adjustment = (visual_inspection_score - 5) * 1.0; // ±5% máximo
    const bqi = Math.min(100, Math.max(0, BASE_SCORE[base_category] + visual_adjustment));

    return { bqi: Math.round(bqi * 100) / 100, category: base_category };
}

/**
 * Compute tidal flushing time and residence time for a coastal lagoon.
 * Calcula o tempo de renovação por maré e o tempo de residência de uma laguna costeira.
 *
 * Tn = V / (P × E)  where V = lagoon volume, P = tidal prism, E = mixing efficiency
 *
 * @param lagoon_volume_m3 - Lagoon volume in m³
 * @param tidal_prism_m3 - Tidal prism volume (water exchanged per tidal cycle) in m³
 * @param mixing_efficiency - Mixing efficiency ∈ [0.1, 1.0]
 *
 * Refs: Dyer (1997) Estuaries: A Physical Introduction; Kjerfve (1994) Coastal Lagoon Processes
 */
export function computeTidalFlushingTime(
    lagoon_volume_m3: number,
    tidal_prism_m3: number,
    mixing_efficiency: number,
): { flushing_time_days: number; residence_time_days: number } {
    if (
        typeof lagoon_volume_m3 !== 'number' ||
        typeof tidal_prism_m3 !== 'number' ||
        typeof mixing_efficiency !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (lagoon_volume_m3 <= 0) throw new RangeError('lagoon_volume_m3 must be > 0');
    if (tidal_prism_m3 <= 0) throw new RangeError('tidal_prism_m3 must be > 0');
    if (mixing_efficiency < 0.1 || mixing_efficiency > 1.0) {
        throw new RangeError('mixing_efficiency must be in [0.1, 1.0]');
    }

    // Ciclo de maré = ~12.4 horas (0.517 dias) para maré semidiurna
    const tidal_cycles_per_day = 2.0; // semidiurna padrão
    // Tn em número de ciclos de maré = V / (P × E)
    const flushing_cycles = lagoon_volume_m3 / (tidal_prism_m3 * mixing_efficiency);
    const flushing_time_days = flushing_cycles / tidal_cycles_per_day;
    // Tempo de residência: inclui dispersão adicional (fator 1.44 - Monsen et al. 2002)
    const residence_time_days = flushing_time_days * 1.44;

    return {
        flushing_time_days: Math.round(flushing_time_days * 1000) / 1000,
        residence_time_days: Math.round(residence_time_days * 1000) / 1000,
    };
}

/**
 * Compute Harmful Algal Bloom (HAB) risk from phytoplankton indicators.
 * Calcula o risco de Floração de Algas Nocivas (FAN) a partir de indicadores de fitoplâncton.
 *
 * @param chlorophyll_a_ug_L - Chlorophyll-a in µg/L
 * @param dinoflagellate_cells_L - Dinoflagellate cell count per liter
 * @param temperature_c - Water temperature in °C
 * @param phosphorus_ug_L - Total phosphorus in µg/L
 *
 * Refs: Anderson et al. (1994) Annu Rev Ecol Syst; CETESB (2021); CONAMA 357/2005
 */
export function computeHABRisk(
    chlorophyll_a_ug_L: number,
    dinoflagellate_cells_L: number,
    temperature_c: number,
    phosphorus_ug_L: number,
): { risk: HabRisk; shellfish_closure: boolean } {
    if (
        [chlorophyll_a_ug_L, dinoflagellate_cells_L, temperature_c, phosphorus_ug_L].some((v) => typeof v !== 'number')
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (chlorophyll_a_ug_L < 0 || dinoflagellate_cells_L < 0 || phosphorus_ug_L < 0) {
        throw new RangeError('Concentrations cannot be negative');
    }

    // Bloom: clorofila > 30 µg/L OU dinoflagelados > 1×10⁵ células/L (Anderson 1994)
    const is_bloom = chlorophyll_a_ug_L > 30 || dinoflagellate_cells_L > 1e5;
    const is_high = chlorophyll_a_ug_L > 15 || dinoflagellate_cells_L > 1e4 || phosphorus_ug_L > 100;
    const is_moderate = chlorophyll_a_ug_L > 5 || dinoflagellate_cells_L > 1e3 || phosphorus_ug_L > 50;

    let risk: HabRisk;
    if (is_bloom) risk = 'bloom';
    else if (is_high) risk = 'high';
    else if (is_moderate) risk = 'moderate';
    else risk = 'low';

    // Fechamento para moluscos: bloom + temperatura favorável (> 20°C)
    const shellfish_closure = risk === 'bloom' && temperature_c > 20;

    return { risk, shellfish_closure };
}

/**
 * Classify coastal ecosystem health using EU WFD (Water Framework Directive) criteria.
 * Classifica a saúde do ecossistema costeiro pelos critérios da Diretiva Quadro da Água da UE.
 *
 * @param bqi_category - Output from computeBathingQualityIndex
 * @param hab_risk - Output from computeHABRisk
 * @param dissolved_oxygen_mg_L - Dissolved oxygen in mg/L
 * @param seagrass_coverage_pct - Seagrass coverage 0–100%
 *
 * Refs: EU WFD 2000/60/CE Annex V; CONAMA 357/2005
 */
export function classifyCoastalEcosystemHealth(
    bqi_category: BqiCategory,
    hab_risk: HabRisk,
    dissolved_oxygen_mg_L: number,
    seagrass_coverage_pct: number,
): { ecosystem_status: 'high' | 'good' | 'moderate' | 'poor' | 'bad'; wfd_status: string } {
    const valid_bqi = ['excellent', 'good', 'sufficient', 'poor'];
    const valid_hab = ['low', 'moderate', 'high', 'bloom'];
    if (!valid_bqi.includes(bqi_category)) throw new TypeError('Invalid bqi_category');
    if (!valid_hab.includes(hab_risk)) throw new TypeError('Invalid hab_risk');
    if (typeof dissolved_oxygen_mg_L !== 'number' || typeof seagrass_coverage_pct !== 'number') {
        throw new TypeError('DO and seagrass coverage must be numbers');
    }
    if (dissolved_oxygen_mg_L < 0) throw new RangeError('dissolved_oxygen_mg_L cannot be negative');
    if (seagrass_coverage_pct < 0 || seagrass_coverage_pct > 100)
        throw new RangeError('seagrass_coverage_pct must be in [0, 100]');

    // Critérios críticos: BAD se qualquer indicador crítico
    if (bqi_category === 'poor' || hab_risk === 'bloom' || dissolved_oxygen_mg_L < 4) {
        return {
            ecosystem_status: 'bad',
            wfd_status: 'Ecological status: BAD — critical indicator threshold exceeded',
        };
    }
    // HIGH: todos os indicadores ótimos
    if (
        bqi_category === 'excellent' &&
        hab_risk === 'low' &&
        dissolved_oxygen_mg_L >= 8 &&
        seagrass_coverage_pct >= 50
    ) {
        return { ecosystem_status: 'high', wfd_status: 'Ecological status: HIGH — reference conditions' };
    }
    // POOR: múltiplos indicadores degradados
    if (
        (bqi_category === 'sufficient' && hab_risk === 'high') ||
        dissolved_oxygen_mg_L < 6 ||
        seagrass_coverage_pct < 10
    ) {
        return { ecosystem_status: 'poor', wfd_status: 'Ecological status: POOR — significant degradation' };
    }
    // MODERATE
    if (
        bqi_category === 'sufficient' ||
        hab_risk === 'high' ||
        dissolved_oxygen_mg_L < 7 ||
        seagrass_coverage_pct < 25
    ) {
        return {
            ecosystem_status: 'moderate',
            wfd_status: 'Ecological status: MODERATE — moderate anthropogenic pressure',
        };
    }
    // GOOD por exclusão
    return { ecosystem_status: 'good', wfd_status: 'Ecological status: GOOD — minor anthropogenic pressure' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const coastalWaterQualityMeta: AnalyticsModuleMeta = {
    name: 'coastalWaterQuality',
    description: 'coastalWaterQuality',
    category: 'analytics',
    familyTags: ['water', 'coastal'],
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
