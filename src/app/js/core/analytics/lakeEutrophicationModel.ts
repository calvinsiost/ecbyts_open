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
 * @fileoverview Lake Eutrophication Model - Phosphorus Balance, Vollenweider & Carlson TSI
 *
 * Pure analytical module: no DOM, no IDB, no fetch, no Three.js dependencies.
 *
 * Academic references:
 *   - Vollenweider R.A. (1976) Advances in defining critical loading levels for phosphorus
 *     in lake eutrophication. Mem. Ist. Ital. Idrobiol. 33:53-83.
 *   - Carlson R.E. (1977) A trophic state index for lakes. Limnol. Oceanogr. 22(2):361-369.
 *     DOI:10.4319/lo.1977.22.2.0361
 *   - OECD (1982) Eutrophication of Waters: Monitoring, Assessment and Control. Paris.
 *   - CETESB (2021) Qualidade das águas interiores no estado de São Paulo.
 */

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

// ─── Phosphorus Loading (carga de fósforo) ────────────────────────────────────

/**
 * Compute annual phosphorus loading from inflow and atmospheric deposition.
 * Cálculo da carga anual de fósforo - entrada fluvial mais deposição atmosférica.
 *
 * Fórmula: L_total = Q×C_in×1e-3 + L_atm×A_m2×1e-3
 *   onde L_atm em kg/ha/yr × area em ha → kg/yr  (ha × kg/ha = kg)
 *
 * @param inflow_m3_yr       - Annual inflow volume [m³/yr]
 * @param tp_inflow_mg_L     - Total phosphorus in inflow [mg/L]
 * @param area_ha            - Lake surface area [ha]
 * @param atmospheric_dep_kg_ha_yr - Atmospheric TP deposition [kg/ha/yr]
 * @throws {RangeError} if any parameter is negative
 */
export function computePhosphorusLoading(
    inflow_m3_yr: number,
    tp_inflow_mg_L: number,
    area_ha: number,
    atmospheric_dep_kg_ha_yr: number,
): { loading_kg_yr: number; areal_loading_g_m2_yr: number } {
    if (inflow_m3_yr < 0) throw new RangeError('inflow_m3_yr must be >= 0');
    if (tp_inflow_mg_L < 0) throw new RangeError('tp_inflow_mg_L must be >= 0');
    if (area_ha <= 0) throw new RangeError('area_ha must be > 0');
    if (atmospheric_dep_kg_ha_yr < 0) throw new RangeError('atmospheric_dep_kg_ha_yr must be >= 0');

    // Carga fluvial: Q [m³/yr] × C [mg/L] × 1e-3 [L/m³ → m³/m³ × mg→g→kg] = kg/yr
    // mg/L × m³ = mg × 1000 L/m³ / 1000 = g; /1000 = kg
    const riverLoad_kg_yr = (inflow_m3_yr * tp_inflow_mg_L) / 1e3;

    // Carga atmosférica: kg/ha/yr × area_ha = kg/yr
    const atmLoad_kg_yr = atmospheric_dep_kg_ha_yr * area_ha;

    const loading_kg_yr = riverLoad_kg_yr + atmLoad_kg_yr;

    // Carga areal: kg/yr ÷ (area_ha × 10000 m²/ha) × 1000 g/kg = g/m²/yr
    const area_m2 = area_ha * 1e4;
    const areal_loading_g_m2_yr = (loading_kg_yr * 1e3) / area_m2;

    return Object.freeze({ loading_kg_yr, areal_loading_g_m2_yr });
}

// ─── Vollenweider Model (concentração de equilíbrio de TP) ───────────────────

/**
 * Predict equilibrium total phosphorus using Vollenweider (1976) model.
 * Predição da concentração de equilíbrio de fósforo - modelo de Vollenweider.
 *
 * TP_eq = L / (z/τ + σ)
 *   σ = 10 / sqrt(z)   (taxa de sedimentação empírica, Vollenweider 1976)
 *   z = profundidade média [m], τ = tempo de residência hidráulico [yr]
 *   L = carga areal [g/m²/yr]
 *
 * @param areal_loading_g_m2_yr    - Areal phosphorus load [g/m²/yr]
 * @param mean_depth_m             - Mean lake depth [m]
 * @param hydraulic_residence_time_yr - Hydraulic residence time [yr]
 * @throws {RangeError} if parameters are non-positive
 */
export function computeVollenweiderModel(
    areal_loading_g_m2_yr: number,
    mean_depth_m: number,
    hydraulic_residence_time_yr: number,
): { eq_tp_mg_m3: number; trophic_state: 'oligotrophic' | 'mesotrophic' | 'eutrophic' } {
    if (areal_loading_g_m2_yr < 0) throw new RangeError('areal_loading_g_m2_yr must be >= 0');
    if (mean_depth_m <= 0) throw new RangeError('mean_depth_m must be > 0');
    if (hydraulic_residence_time_yr <= 0) throw new RangeError('hydraulic_residence_time_yr must be > 0');

    // Taxa de sedimentação empírica (Vollenweider 1976): σ = 10/√z [yr⁻¹]
    const sigma = 10 / Math.sqrt(mean_depth_m);

    // Flushing rate: z/τ [m/yr ÷ yr = m/yr... mas σ é em yr⁻¹]
    // TP_eq [g/m³] = L [g/m²/yr] / (z/τ [m/yr] + σ×z [m/yr]) ... ver Vollenweider eq. correta:
    // TP_eq = L / (z/τ + σ) onde todas as unidades em yr⁻¹ após normalizar por z
    // Forma correta: TP_eq [mg/m³] = L [g/m²/yr] × 1000 [mg/g] / (z/τ + σ) [yr⁻¹ × m]
    // Dimensionalmente: [g/m²/yr] / ([m/yr] + [m/yr]) = [g/m³] × 1000 = [mg/m³]
    const flushing_rate = mean_depth_m / hydraulic_residence_time_yr; // m/yr
    const settling_rate = sigma * mean_depth_m; // m/yr  (σ×z)
    const denominator = flushing_rate + settling_rate; // m/yr

    // L [g/m²/yr] / denominator [m/yr] = g/m³; × 1000 = mg/m³
    const eq_tp_mg_m3 = (areal_loading_g_m2_yr / denominator) * 1e3;

    // Classificacao trofica: TP > 25 ug/L (= mg/m^3) -> eutrofico
    //   oligotrofico: TP < 10; mesotrofico: 10-25; eutrofico: > 25
    let trophic_state: 'oligotrophic' | 'mesotrophic' | 'eutrophic';
    if (eq_tp_mg_m3 > 25) {
        trophic_state = 'eutrophic';
    } else if (eq_tp_mg_m3 >= 10) {
        trophic_state = 'mesotrophic';
    } else {
        trophic_state = 'oligotrophic';
    }

    return Object.freeze({ eq_tp_mg_m3, trophic_state });
}

// ─── Carlson TSI (Índice de Estado Trófico) ───────────────────────────────────

/**
 * Compute Carlson (1977) Trophic State Index from Secchi depth, chlorophyll, and TP.
 * Cálculo do Índice de Estado Trófico de Carlson a partir de três variáveis.
 *
 * TSI(SD)  = 60 - 14.41 × ln(SD)      [SD em metros]
 * TSI(Chl) = 9.81 × ln(Chl) + 30.6    [Chl em µg/L]
 * TSI(TP)  = 14.42 × ln(TP) + 4.15    [TP em µg/L]
 * composite = (TSI_SD + TSI_Chl + TSI_TP) / 3
 *
 * @param secchi_m              - Secchi disk depth [m]
 * @param chlorophyll_ug_L      - Chlorophyll-a concentration [µg/L]
 * @param total_phosphorus_ug_L - Total phosphorus [µg/L]
 * @throws {RangeError} if any value is non-positive
 */
export function computeCarlsonTSI(
    secchi_m: number,
    chlorophyll_ug_L: number,
    total_phosphorus_ug_L: number,
): { tsi_secchi: number; tsi_chl: number; tsi_tp: number; composite_tsi: number; trophic_class: string } {
    if (secchi_m <= 0) throw new RangeError('secchi_m must be > 0');
    if (chlorophyll_ug_L <= 0) throw new RangeError('chlorophyll_ug_L must be > 0');
    if (total_phosphorus_ug_L <= 0) throw new RangeError('total_phosphorus_ug_L must be > 0');

    const tsi_secchi = 60 - 14.41 * Math.log(secchi_m);
    const tsi_chl = 9.81 * Math.log(chlorophyll_ug_L) + 30.6;
    const tsi_tp = 14.42 * Math.log(total_phosphorus_ug_L) + 4.15;
    const composite_tsi = (tsi_secchi + tsi_chl + tsi_tp) / 3;

    // Classificação trófica baseada no TSI composto
    let trophic_class;
    if (composite_tsi < 40) {
        trophic_class = 'oligotrophic';
    } else if (composite_tsi < 50) {
        trophic_class = 'mesotrophic';
    } else if (composite_tsi < 70) {
        trophic_class = 'eutrophic';
    } else {
        trophic_class = 'hypereutrophic';
    }

    return Object.freeze({ tsi_secchi, tsi_chl, tsi_tp, composite_tsi, trophic_class });
}

// ─── Algal Bloom Risk Assessment (risco de floração algal) ───────────────────

/**
 * Assess algal bloom probability from TSI and hydraulic/thermal conditions.
 * Avaliação do risco de floração algal a partir do TSI e condições hidrodinâmicas.
 *
 * P_bloom = 1 / (1 + exp(-(TSI - 60) / 5))   [regressão logística empírica]
 * Estratificação no verão aumenta o risco em 20%.
 * Frequência de monitoramento baseada no nível de risco.
 *
 * @param composite_tsi             - Carlson composite TSI
 * @param hydraulic_retention_days  - Hydraulic retention time [days]
 * @param summer_stratification - Lake thermally stratified in summer?
 * @throws {RangeError} if numeric parameters are invalid
 */
export function assessAlgalBloomRisk(
    composite_tsi: number,
    hydraulic_retention_days: number,
    summer_stratification: boolean = false,
): { bloom_probability: number; risk: 'low' | 'moderate' | 'high' | 'very_high'; monitoring_frequency_days: number } {
    if (!Number.isFinite(composite_tsi)) throw new RangeError('composite_tsi must be a finite number');
    if (hydraulic_retention_days <= 0) throw new RangeError('hydraulic_retention_days must be > 0');

    // Probabilidade logística base de floração (ajustado empiricamente para TSI=60 → P=0.5)
    let bloom_probability = 1 / (1 + Math.exp(-(composite_tsi - 60) / 5));

    // Estratificação térmica de verão aumenta risco em 20% (capeado em 1.0)
    if (summer_stratification) {
        bloom_probability = Math.min(1, bloom_probability * 1.2);
    }

    // Classificacao de risco
    let risk: 'low' | 'moderate' | 'high' | 'very_high';
    if (bloom_probability >= 0.75) {
        risk = 'very_high';
    } else if (bloom_probability >= 0.5) {
        risk = 'high';
    } else if (bloom_probability >= 0.25) {
        risk = 'moderate';
    } else {
        risk = 'low';
    }

    // Frequencia de monitoramento recomendada [dias]
    const monitoringMap: Record<'low' | 'moderate' | 'high' | 'very_high', number> = {
        very_high: 7,
        high: 14,
        moderate: 30,
        low: 60,
    };
    const monitoring_frequency_days = monitoringMap[risk];

    return Object.freeze({ bloom_probability, risk, monitoring_frequency_days });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const lakeEutrophicationModelMeta: AnalyticsModuleMeta = {
    name: 'lakeEutrophicationModel',
    description: 'lakeEutrophicationModel',
    category: 'analytics',
    familyTags: ['lake', 'eutrophication', 'ecological_network'],
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
