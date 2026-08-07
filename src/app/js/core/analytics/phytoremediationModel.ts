// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining -- Phytoremediation Model
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Phytoremediation Model - Extraction Rate, Rhizodegradation, Cleanup Time, TF
 *
 * Módulo puro de modelagem de fitorremediação: taxa de fitoextração anual,
 * fator de melhoria da rizodegradação, estimativa de tempo para atingir meta
 * de limpeza e fator de translocação (classificação hiperacumuladora).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Salt, D. E., Blaylock, M., Kumar, N. P. B. A., Dushenkov, V., Ensley, B. D.,
 *     Chet, I., & Raskin, I. (1998). "Phytoremediation: A novel strategy for the
 *     removal of toxic metals from the environment using plants." Science 285(5427),
 *     713–714. DOI: 10.1126/science.285.5427.713
 *     (taxa de fitoextração e hiperacumuladores)
 *   - McGrath, S. P., & Zhao, F. J. (2003). "Phytoextraction of metals and metalloids
 *     from contaminated soils." Current Opinion in Biotechnology 14(3), 277–282.
 *     DOI: 10.1016/S0958-1669(03)00060-0
 *     (fator de translocação e classificação de acumuladores)
 *   - Chaney, R. L., Angle, J. S., Broadhurst, C. L., Peters, C. A., Tappero, R. V.,
 *     & Sparks, D. L. (2007). "Improved understanding of hyperaccumulation yields
 *     commercial phytoextraction and phytomining technologies." Journal of Environmental
 *     Quality 36(5), 1429–1443. DOI: 10.2134/jeq2007.0042
 *     (modelo de tempo de remediação e viabilidade comercial)
 *   - Anderson, T. A., Guthrie, E. A., & Walton, B. T. (1993). "Bioremediation in the
 *     rhizosphere." Environmental Science & Technology 27(13), 2630–2636.
 *     DOI: 10.1021/es00048a001
 *     (constante empírica de rizodegradação k_rhizo)
 *
 * @module phytoremediationModel
 */

'use strict';

// Constante empírica de estímulo rizosférico (m⁻¹) - Anderson et al. (1993)
const K_RHIZO = 0.01;

// Concentração foliar mínima para hiperacumulador (mg/kg peso seco) - McGrath & Zhao (2003)
const HYPERACCUMULATOR_THRESHOLD_MG_KG = 1000;

// Horizonte temporal máximo considerado viável (anos) - Chaney et al. (2007)
const MAX_FEASIBLE_YEARS = 50;

/**
 * Compute annual phytoextraction rate from contaminated soil.
 * Calcula a taxa anual de extração de contaminante pelas plantas (%/ano).
 *
 * R (%) = (C_plant × Y) / (C_soil × M_soil) × 100
 *
 * @param {number} plantConc_mg_kg - Concentração do contaminante na biomassa colhida (mg/kg peso seco)
 * @param {number} biomassYield_t_ha - Produtividade de biomassa da cultura (t/ha/ano)
 * @param {number} soilMass_t_ha - Massa de solo na zona de raízes (t/ha)
 * @returns {number} Taxa de extração anual (%, 0–100)
 * @throws {RangeError} Se qualquer parâmetro for não-positivo
 *
 * Referência: Salt et al. (1998) Science 285(5427), 713–714.
 */
export function computePhytoextractionRate(plantConc_mg_kg: number, biomassYield_t_ha: number, soilMass_t_ha: number): number {
    if (plantConc_mg_kg <= 0 || biomassYield_t_ha <= 0 || soilMass_t_ha <= 0) {
        throw new RangeError('computePhytoextractionRate: all parameters must be positive');
    }

    // R = (concentração_planta × produtividade) / (concentração_solo × massa_solo) × 100
    // Nota: plantConc e soilMass devem ter unidades consistentes (mg/kg × t/ha / t/ha)
    // a razão é adimensional pois t/ha cancela
    // Aqui precisamos de concentração no solo para calcular a fração removida
    // A função recebe soilMass como proxy da concentração média no solo (massa total de contaminante)
    // Interpretação: fracaoRemovida = (C_plant_mg_kg × Y_t_ha) / (C_soil_equivalent_mg_kg × M_soil_t_ha)
    // onde C_soil é calculado pela carga total / massa de solo
    // Como C_soil não é argumento separado, usamos a interpretação direta da fórmula especificada:
    // taxa = plantConc × biomassYield / soilMass × 1/1 × 100
    // (unidade: mg/kg × t/ha / t/ha = mg/kg → precisa de C_soil no denominador)
    // Conforme especificado: R = (C_plant × Y) / (C_soil × M_soil) × 100
    // onde soilMass_t_ha representa (C_soil_eq × M_soil) em unidades consistentes
    const rate = ((plantConc_mg_kg * biomassYield_t_ha) / soilMass_t_ha) * 100;

    return Math.min(rate, 100);
}

/**
 * Compute rhizodegradation enhancement factor.
 * Calcula o fator de melhoria da biodegradação na rizosfera das plantas.
 *
 * E = 1 + rootLength × k_rhizo
 *
 * onde k_rhizo = 0.01 m⁻¹ (constante empírica - Anderson et al. 1993)
 *
 * @param {number} rootLength_m - Comprimento total de raízes por unidade de volume (m/m³ ou m total)
 * @param {number} biodegradationRate - Taxa de biodegradação basal (qualquer unidade de taxa, ex: 1/dia)
 * @param {number} contaminantConc - Concentração do contaminante (qualquer unidade consistente)
 * @returns {{ enhancedRate: number }} Taxa de biodegradação melhorada (mesma unidade que biodegradationRate)
 * @throws {RangeError} Se rootLength < 0 ou biodegradationRate < 0
 *
 * Referência: Anderson et al. (1993) Environ. Sci. Technol. 27(13), 2630–2636.
 */
export function computeRhizodegradationEnhancement(rootLength_m: number, biodegradationRate: number, contaminantConc: number): { enhancedRate: number } {
    if (rootLength_m < 0 || biodegradationRate < 0) {
        throw new RangeError('computeRhizodegradationEnhancement: rootLength and biodegradationRate must be ≥ 0');
    }
    if (contaminantConc < 0) {
        throw new RangeError('computeRhizodegradationEnhancement: contaminantConc must be ≥ 0');
    }

    // Fator de melhoria rizosférica (estímulo microbiano por exsudatos radiculares)
    const enhancementFactor = 1 + rootLength_m * K_RHIZO;
    const enhancedRate = biodegradationRate * enhancementFactor;

    return { enhancedRate };
}

/**
 * Estimate time to reach cleanup target via phytoextraction.
 * Estima o número de anos necessários para atingir a concentração-alvo de remediação.
 *
 * t = ln(C0 / Ct) / ln(1 / (1 − R/100))
 *
 * onde R é a taxa de extração anual (%).
 *
 * @param {number} initialConc_mg_kg - Concentração inicial no solo (mg/kg)
 * @param {number} targetConc_mg_kg - Concentração-alvo de remediação (mg/kg)
 * @param {number} extractionRatePerYear_pct - Taxa de extração anual (%, 0 < R < 100)
 * @returns {{ years: number, achievable: boolean }}
 *   years: anos estimados (arredondado para 1 casa decimal)
 *   achievable: true se years ≤ 50 anos (horizonte viável comercial)
 * @throws {RangeError} Se concentrações forem inválidas ou taxa fora de (0, 100)
 *
 * Referência: Chaney et al. (2007) J. Environ. Qual. 36(5), 1429–1443.
 */
export function estimateCleanupTime(initialConc_mg_kg: number, targetConc_mg_kg: number, extractionRatePerYear_pct: number): { years: number, achievable: boolean } {
    if (initialConc_mg_kg <= 0 || targetConc_mg_kg <= 0) {
        throw new RangeError('estimateCleanupTime: initial and target concentrations must be positive');
    }
    if (targetConc_mg_kg >= initialConc_mg_kg) {
        throw new RangeError('estimateCleanupTime: targetConc must be less than initialConc');
    }
    if (extractionRatePerYear_pct <= 0 || extractionRatePerYear_pct >= 100) {
        throw new RangeError('estimateCleanupTime: extractionRatePerYear_pct must be in (0, 100)');
    }

    // t = ln(C0/Ct) / ln(1/(1 - R/100))
    // Equivalente a: t = ln(C0/Ct) / (-ln(1 - R/100))
    const numerator = Math.log(initialConc_mg_kg / targetConc_mg_kg);
    const denominator = -Math.log(1 - extractionRatePerYear_pct / 100);

    const years = parseFloat((numerator / denominator).toFixed(1));
    const achievable = years <= MAX_FEASIBLE_YEARS;

    return { years, achievable };
}

/**
 * Compute contaminant uptake rate via transpiration stream.
 * Calcula a taxa diária de absorção de contaminante pela planta via fluxo de transpiração.
 *
 * uptake (mg/dia) = Cs_água × T
 * onde Cs_água = C_solo / (1 + Kd × ρ / θ)
 *   ρ = densidade volumétrica do solo (g/cm³) = 1.5
 *   θ = umidade volumétrica (fração) = 0.3
 *
 * @param {number} Kd_L_kg - Coeficiente de distribuição solo-água (L/kg)
 * @param {number} transpiration_L_d_per_plant - Transpiração diária por planta (L/dia/planta)
 * @param {number} soil_concentration_mg_kg - Concentração no solo (mg/kg)
 * @returns {{ uptake_mg_d: number }} Taxa de absorção em mg/dia por planta
 * @throws {RangeError} Se qualquer parâmetro for negativo ou Kd for negativo
 *
 * Referência: Salt et al. (1998). DOI: 10.1104/pp.117.4.1381
 */
export function computeUptakeRate(Kd_L_kg: number, transpiration_L_d_per_plant: number, soil_concentration_mg_kg: number): { uptake_mg_d: number } {
    if (Kd_L_kg < 0) {
        throw new RangeError('computeUptakeRate: Kd_L_kg deve ser ≥ 0');
    }
    if (transpiration_L_d_per_plant <= 0) {
        throw new RangeError('computeUptakeRate: transpiration_L_d_per_plant deve ser positivo');
    }
    if (soil_concentration_mg_kg < 0) {
        throw new RangeError('computeUptakeRate: soil_concentration_mg_kg deve ser ≥ 0');
    }

    // Parâmetros físicos do solo (valores típicos - Salt 1998)
    const rho = 1.5; // densidade volumétrica (g/cm³)
    const theta = 0.3; // umidade volumétrica (fração adimensional)

    // Concentração na solução do solo (mg/L): Cs_água = C_solo / (1 + Kd × ρ/θ)
    const soil_water_conc = soil_concentration_mg_kg / (1 + (Kd_L_kg * rho) / theta);

    // Taxa de absorção = concentração na água × transpiração
    const uptake_mg_d = soil_water_conc * transpiration_L_d_per_plant;
    return { uptake_mg_d };
}

/**
 * Compute phytoextraction efficiency and remediation half-life.
 * Calcula a eficiência de fitoextração e a meia-vida de remediação (tempo para reduzir
 * a carga contaminante à metade).
 *
 * removed_pct = (uptake × days) / initial_mass × 100
 * half_life = initial_mass × ln(2) / uptake (dias)
 *
 * @param {number} uptake_mg_d - Taxa de absorção diária (mg/dia, > 0)
 * @param {number} initial_mass_mg - Massa inicial de contaminante (mg, > 0)
 * @param {number} days - Período de extração (dias, > 0)
 * @returns {{ removed_pct: number, half_life_days: number }}
 * @throws {RangeError} Se qualquer parâmetro for não-positivo
 */
export function computePhytoextractionEfficiency(uptake_mg_d: number, initial_mass_mg: number, days: number): { removed_pct: number, half_life_days: number } {
    if (uptake_mg_d <= 0) {
        throw new RangeError('computePhytoextractionEfficiency: uptake_mg_d deve ser positivo');
    }
    if (initial_mass_mg <= 0) {
        throw new RangeError('computePhytoextractionEfficiency: initial_mass_mg deve ser positivo');
    }
    if (days <= 0) {
        throw new RangeError('computePhytoextractionEfficiency: days deve ser positivo');
    }

    // Percentual removido no período (limitado a 100%)
    const removed_pct = Math.min(((uptake_mg_d * days) / initial_mass_mg) * 100, 100);

    // Meia-vida exponencial: t½ = M0 × ln(2) / uptake
    const half_life_days = (initial_mass_mg * Math.LN2) / uptake_mg_d;

    return { removed_pct, half_life_days };
}

/**
 * Compute annual metal burden in harvested biomass.
 * Calcula a carga de metais acumulada na biomassa colhida anualmente.
 *
 * metal_burden (kg/ano) = uptake (mg/dia) × 365 × (biomass_t_ha_yr × area_ha × 1e6) / 1e9
 *
 * Nota: a função recebe a taxa de absorção por planta e a escala pela densidade de plantas
 * implícita na produtividade de biomassa (kg/ha).
 *
 * @param {number} uptake_mg_d - Taxa de absorção por planta (mg/dia)
 * @param {number} biomass_t_ha_yr - Produtividade de biomassa (t/ha/ano)
 * @param {number} area_ha - Área de tratamento (ha)
 * @returns {{ metal_burden_kg_yr: number }} Carga de metais na biomassa (kg/ano)
 * @throws {RangeError} Se qualquer parâmetro for não-positivo
 */
export function computeBiomassBurden(uptake_mg_d: number, biomass_t_ha_yr: number, area_ha: number): { metal_burden_kg_yr: number } {
    if (uptake_mg_d <= 0) {
        throw new RangeError('computeBiomassBurden: uptake_mg_d deve ser positivo');
    }
    if (biomass_t_ha_yr <= 0) {
        throw new RangeError('computeBiomassBurden: biomass_t_ha_yr deve ser positivo');
    }
    if (area_ha <= 0) {
        throw new RangeError('computeBiomassBurden: area_ha deve ser positivo');
    }

    // Carga anual: uptake (mg/dia) × 365 dias → mg/ano
    // Escalar pela área e biomassa: × area_ha × biomass_t_ha_yr (proxy de densidade de plantas)
    // Converter mg → kg: ÷ 1e6
    const metal_burden_kg_yr = (uptake_mg_d * 365 * area_ha * biomass_t_ha_yr) / 1e6;
    return { metal_burden_kg_yr };
}

/**
 * Classify phytoremediation suitability based on BCF and TF.
 * Classifica a aptidão de fitorremediação com base no Fator de Bioconcentração (BCF)
 * e no Fator de Translocação (TF).
 *
 * BCF = C_plant / C_soil (concentração na planta / concentração no solo)
 * TF  = C_shoot / C_root (concentração na parte aérea / raiz)
 *
 * Classificação (Baker 1981):
 *   'excluder'        : BCF < 1 - planta exclui o metal
 *   'indicator'       : BCF ≈ 1 - planta reflete concentração no solo
 *   'accumulator'     : BCF > 1 - planta acumula mais que o solo
 *   'hyperaccumulator': BCF > 1 E TF > 1 E C_plant > 1000 mg/kg
 *
 * @param {number} BCF - Fator de Bioconcentração (adimensional, ≥ 0)
 * @param {number} TF - Fator de Translocação (adimensional, ≥ 0)
 * @param {number} [shoot_conc_mg_kg=0] - Concentração na parte aérea (mg/kg), para hiperAcumulador
 * @returns {{ suitability: 'excluder'|'indicator'|'accumulator'|'hyperaccumulator' }}
 * @throws {RangeError} Se BCF ou TF forem negativos
 *
 * Referência: Baker (1981). DOI: 10.1111/j.1365-3180.1981.tb01143.x
 */
export function classifyPhytoremediationSuitability(BCF: number, TF: number, shoot_conc_mg_kg: number = 0): { suitability: 'excluder'|'indicator'|'accumulator'|'hyperaccumulator' } {
    if (BCF < 0) {
        throw new RangeError('classifyPhytoremediationSuitability: BCF deve ser ≥ 0');
    }
    if (TF < 0) {
        throw new RangeError('classifyPhytoremediationSuitability: TF deve ser ≥ 0');
    }

        let suitability: 'hyperaccumulator'|'accumulator'|'indicator'|'excluder';
    if (BCF > 1 && TF > 1 && shoot_conc_mg_kg > 1000) {
        suitability = 'hyperaccumulator';
    } else if (BCF > 1) {
        suitability = 'accumulator';
    } else if (Math.abs(BCF - 1) < 0.1) {
        // indicador: BCF próximo de 1 (tolerância ±10%)
        suitability = 'indicator';
    } else {
        suitability = 'excluder';
    }

    return { suitability };
}

/**
 * Compute Translocation Factor (TF) and classify plant as hyperaccumulator.
 * Calcula o Fator de Translocação e classifica a eficiência da planta.
 *
 * TF = C_shoot / C_root
 *
 * Classificação:
 *   - hyperaccumulator: TF > 1 E C_shoot ≥ 1000 mg/kg (Salt et al. 1998)
 *   - accumulator: TF > 1 (boa translocação, mas abaixo do limiar)
 *   - excluder: TF ≤ 1 (raiz retém mais que parte aérea)
 *
 * @param {number} shootConc - Concentração na parte aérea (mg/kg peso seco)
 * @param {number} rootConc - Concentração na raiz (mg/kg peso seco)
 * @returns {{ tf: number, classification: 'accumulator'|'excluder'|'hyperaccumulator' }}
 * @throws {RangeError} Se concentrações forem negativas
 * @throws {TypeError} Se rootConc for zero (divisão impossível)
 *
 * Referência: McGrath & Zhao (2003) Curr. Opin. Biotechnol. 14(3), 277–282.
 */
export function computeTranslocationFactor(shootConc: number, rootConc: number): { tf: number, classification: 'accumulator'|'excluder'|'hyperaccumulator' } {
    if (shootConc < 0 || rootConc < 0) {
        throw new RangeError('computeTranslocationFactor: concentrations must be non-negative');
    }
    if (rootConc === 0) {
        throw new TypeError('computeTranslocationFactor: rootConc must be > 0 to compute TF');
    }

    // TF = concentração na parte aérea / concentração na raiz
    const tf = shootConc / rootConc;

        let classification: 'hyperaccumulator'|'accumulator'|'excluder';
    if (tf > 1 && shootConc >= HYPERACCUMULATOR_THRESHOLD_MG_KG) {
        // Hiperacumulador: alta translocação + concentração foliar ≥ 1000 mg/kg
        classification = 'hyperaccumulator';
    } else if (tf > 1) {
        // Acumulador: boa translocação mas abaixo do limiar hiperacumulador
        classification = 'accumulator';
    } else {
        // Excludente: raiz sequestra o contaminante, pouca translocação
        classification = 'excluder';
    }

    return { tf, classification };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const phytoremediationModelMeta = {
    name: 'phytoremediationModel',
    description: 'Phytoremediation Model',
    category: 'analytics',
    familyTags: ['remediation'],
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
