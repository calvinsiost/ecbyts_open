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
// Application: EHS & Mining - Landfill Gas Generation Model
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Landfill Gas Generation Model - EPA LandGEM v3.02 and IPCC 2006
 *
 * Módulo puro implementando o modelo de geração de gás de aterro sanitário
 * baseado no EPA LandGEM v3.02 (First-Order Decay). Inclui cálculo do
 * potencial metanogênico L0, geração de CH4 por decaimento, recuperação
 * energética e classificação de risco de explosão.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - US EPA (2005). LandGEM: Landfill Gas Emissions Model v3.02.
 *     EPA/600/R-05/047. Washington, DC.
 *     (L0 calculation, first-order decay model k × L0 × M)
 *   - IPCC (2006). 2006 IPCC Guidelines for National Greenhouse Gas Inventories,
 *     Volume 5: Waste, Chapter 3.
 *     DOI: 10.2305/IUCN.CH.2016.EIAP.1.en. (DOC fractions, MCF, GWP100)
 *   - US EPA AP-42 (1998). Compilation of Air Pollutant Emission Factors,
 *     Vol. 1, Section 2.4: Municipal Solid Waste Landfills.
 *     US EPA Office of Air Quality Planning and Standards. (composition factors)
 *
 * @module landfillGasModel
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

/**
 * Degradable Organic Carbon fractions by waste type (kg DOC / kg wet waste).
 * Frações de carbono orgânico degradável por tipo de resíduo.
 * Source: IPCC (2006) Vol. 5, Table 2.4.
 */
const DOC_FRACTIONS = {
    food: 0.15, // Resíduos alimentares
    paper: 0.4, // Papel e papelão
    wood: 0.43, // Madeira e resíduos de jardim
    textiles: 0.24, // Têxteis
};

/** Methane correction factor for managed anaerobic landfill (IPCC 2006 Table 3.1). */
const MCF = 1.0;

/** Fraction of methane in landfill gas by volume (50% CH4 : 50% CO2). */
const F_CH4 = 0.5;

/** Molecular weight ratio CH4/C — used in LandGEM L0 formula: 16/12. */
const MW_RATIO = 16 / 12;

/** CH4 density at standard conditions (kg/m³). */
const RHO_CH4_KG_M3 = 0.717;

/** Lower Heating Value of methane (MJ/kg). */
const LHV_CH4_MJ_KG = 50;

/** GWP100 of methane (kg CO2-eq / kg CH4) — IPCC AR6. */
const GWP100_CH4 = 28;

/** Explosive limits for methane in air (% v/v). */
const CH4_LIMITS: Record<string, number> = {
    surface: 1.0, // Superfície do aterro (% v/v)
    boundary: 1.0, // Limite do terreno (% v/v)
    building: 1.25, // Interior de edificações (LFL/4 = 5%/4)
};

/**
 * Compute the methane generation potential L0 for a given waste composition.
 * Calcula o potencial de geração de metano L0 para uma composição de resíduos.
 *
 * EPA LandGEM formula: L0 = Σ(DOC_i × MCF × F_CH4 × 16/12) × 1000 m³/t
 * Simplified: L0 = (Σ DOC_i × fractions_i) × MCF × F_CH4 × MW_RATIO × conversion_factor
 *
 * Reference: US EPA LandGEM v3.02 (2005), Equation 2-1.
 *
 * @param {{ food_pct: number, paper_pct: number, wood_pct: number, textiles_pct: number }} wasteComposition
 *   Percentages of each waste type (% by wet mass); must sum to ≤ 100
 * @returns {number} L0 - methane generation potential (m³ CH4 / tonne of waste)
 * @throws {TypeError}  If wasteComposition is not a valid object
 * @throws {RangeError} If any percentage is negative or total exceeds 100
 */
export function computeMethanePotential(wasteComposition: {
    food_pct: number;
    paper_pct: number;
    wood_pct: number;
    textiles_pct: number;
}): number {
    // Validação do objeto de composição
    if (!wasteComposition || typeof wasteComposition !== 'object') {
        throw new TypeError('wasteComposition must be an object with food_pct, paper_pct, wood_pct, textiles_pct');
    }

    const keys = ['food_pct', 'paper_pct', 'wood_pct', 'textiles_pct'] as const;
    const wc = wasteComposition as unknown as Record<string, number>;
    for (const key of keys) {
        if (typeof wc[key] !== 'number' || !isFinite(wc[key]!)) {
            throw new TypeError(`wasteComposition.${key} must be a finite number`);
        }
        if (wc[key]! < 0) {
            throw new RangeError(`wasteComposition.${key} must be >= 0`);
        }
    }

    const total =
        wasteComposition.food_pct +
        wasteComposition.paper_pct +
        wasteComposition.wood_pct +
        wasteComposition.textiles_pct;
    if (total > 100) {
        throw new RangeError('Sum of waste composition percentages must not exceed 100');
    }

    // Cálculo de L0: Σ(DOC_i × fraction_i/100) × MCF × F_CH4 × MW_RATIO
    // Resultado em m³ CH4 / tonelada de resíduo
    // Factor 1000: DOC em kg/kg → CH4 em m³/t (assumindo densidade CH4 = 0.717 kg/m³ a STP)
    const docWeighted =
        DOC_FRACTIONS.food * (wasteComposition.food_pct / 100) +
        DOC_FRACTIONS.paper * (wasteComposition.paper_pct / 100) +
        DOC_FRACTIONS.wood * (wasteComposition.wood_pct / 100) +
        DOC_FRACTIONS.textiles * (wasteComposition.textiles_pct / 100);

    // L0 (m³ CH4/t) = docWeighted × MCF × F_CH4 × (16/12) × (1000/RHO_CH4)
    // O fator (1000/RHO) converte kg CH4 → m³ CH4 por tonelada de resíduo
    const l0 = docWeighted * MCF * F_CH4 * MW_RATIO * (1000 / RHO_CH4_KG_M3);

    return l0;
}

/**
 * Compute annual methane and CO2 generation from a landfill cell using first-order decay.
 * Calcula a geração anual de metano e CO2 de uma célula de aterro pelo decaimento de primeira ordem.
 *
 * EPA LandGEM formula: Q_CH4 = k × L0 × M × exp(−k × t)
 * CO2 volume equals CH4 volume (1:1 ratio by volume in landfill gas).
 *
 * Reference: US EPA LandGEM v3.02 (2005), Equation 2-1.
 *
 * @param {number} wasteMass_t       - Mass of waste in cell (tonnes); must be > 0
 * @param {number} l0                - Methane generation potential L0 (m³ CH4/t); must be > 0
 * @param {number} decayRate_per_yr  - First-order decay rate constant k (yr⁻¹); must be > 0
 * @param {number} time_yr           - Years since waste placement; must be ≥ 0
 * @returns {{ ch4_m3_yr: number, co2_m3_yr: number }}
 * @throws {RangeError} If any required parameter is ≤ 0 or time < 0
 */
export function computeGasGeneration(
    wasteMass_t: number,
    l0: number,
    decayRate_per_yr: number,
    time_yr: number,
): { ch4_m3_yr: number; co2_m3_yr: number } {
    // Validação de entradas
    if (typeof wasteMass_t !== 'number' || !isFinite(wasteMass_t) || wasteMass_t <= 0) {
        throw new RangeError('wasteMass_t must be a positive finite number');
    }
    if (typeof l0 !== 'number' || !isFinite(l0) || l0 <= 0) {
        throw new RangeError('l0 must be a positive finite number');
    }
    if (typeof decayRate_per_yr !== 'number' || !isFinite(decayRate_per_yr) || decayRate_per_yr <= 0) {
        throw new RangeError('decayRate_per_yr must be a positive finite number');
    }
    if (typeof time_yr !== 'number' || !isFinite(time_yr) || time_yr < 0) {
        throw new RangeError('time_yr must be ≥ 0');
    }

    // Q_CH4 = k × L0 × M × exp(−k × t)
    // Geração instantânea de metano (m³/ano) no tempo t após a deposição
    const ch4_m3_yr = decayRate_per_yr * l0 * wasteMass_t * Math.exp(-decayRate_per_yr * time_yr);

    // CO2 gerado em proporção 1:1 por volume com o CH4 no biogás de aterro
    const co2_m3_yr = ch4_m3_yr * 1.0;

    return { ch4_m3_yr, co2_m3_yr };
}

/**
 * Compute electrical energy recovery and avoided CO2 emissions from landfill gas.
 * Calcula a recuperação de energia elétrica e as emissões de CO2 evitadas pelo biogás.
 *
 * E = Q × ρ_CH4 × LHV × η / 3600
 *   Q = CH4 flow (m³/yr), ρ = 0.717 kg/m³, LHV = 50 MJ/kg, η = efficiency (0–1)
 *   3600 MJ → MWh conversion
 *
 * CO2 avoided: burning CH4 in engine avoids fugitive release; GWP100 = 28 (IPCC AR6).
 *
 * @param {number} ch4_m3_yr  - Annual methane generation (m³/yr); must be > 0
 * @param {number} efficiency - Electrical conversion efficiency η (0–1); typical 0.3–0.4
 * @returns {{ energy_MWh_yr: number, co2_avoided_t: number }}
 * @throws {RangeError} If ch4_m3_yr ≤ 0 or efficiency outside (0,1]
 */
export function computeEnergyRecovery(
    ch4_m3_yr: number,
    efficiency: number,
): { energy_MWh_yr: number; co2_avoided_t: number } {
    // Validação de entradas
    if (typeof ch4_m3_yr !== 'number' || !isFinite(ch4_m3_yr) || ch4_m3_yr <= 0) {
        throw new RangeError('ch4_m3_yr must be a positive finite number');
    }
    if (typeof efficiency !== 'number' || !isFinite(efficiency) || efficiency <= 0 || efficiency > 1) {
        throw new RangeError('efficiency must be in (0, 1]');
    }

    // Energia elétrica (MWh/yr) = Q × ρ_CH4 × LHV × η / 3600
    const energy_MWh_yr = (ch4_m3_yr * RHO_CH4_KG_M3 * LHV_CH4_MJ_KG * efficiency) / 3600;

    // CO2 evitado: metano capturado e queimado evita emissão fugitiva como CH4
    // Massa CH4 (t) × GWP100 → toneladas CO2-eq evitadas
    const ch4_mass_t = (ch4_m3_yr * RHO_CH4_KG_M3) / 1000;
    const co2_avoided_t = ch4_mass_t * GWP100_CH4;

    return { energy_MWh_yr, co2_avoided_t };
}

/**
 * Compute annual methane generation from a landfill using LandGEM first-order decay model.
 * Calcula a geração anual de metano de um aterro pelo modelo LandGEM de decaimento de primeira ordem.
 *
 * Modelo EPA LandGEM v3.02: Q_CH4 = Σ_i [ k × L0 × (M_i/10) × e^(−k(t − t_i)) ]
 * Simplificação para massa total depositada de uma vez no tempo 0:
 *   Q_CH4 = k × L0 × waste_mass_t × e^(−k × t_years)
 *
 * Reference: US EPA (2005). LandGEM v3.02. EPA/600/R-05/047.
 *
 * @param {number} waste_mass_t  - Total waste mass in landfill (tonnes); must be > 0
 * @param {number} DOC_fraction  - Degradable Organic Carbon fraction (kg DOC/kg waste, 0–1)
 * @param {number} k_yr          - First-order decay rate constant (yr⁻¹); must be > 0
 * @param {number} t_years       - Time since waste placement (years); must be ≥ 0
 * @returns {{ CH4_m3_yr: number }} Annual methane generation (m³/yr)
 * @throws {TypeError}  If any input is not a finite number
 * @throws {RangeError} If values are out of physical range
 */
export function computeLFGGeneration(
    waste_mass_t: number,
    DOC_fraction: number,
    k_yr: number,
    t_years: number,
): { CH4_m3_yr: number } {
    if (typeof waste_mass_t !== 'number' || !isFinite(waste_mass_t)) {
        throw new TypeError('waste_mass_t must be a finite number');
    }
    if (typeof DOC_fraction !== 'number' || !isFinite(DOC_fraction)) {
        throw new TypeError('DOC_fraction must be a finite number');
    }
    if (typeof k_yr !== 'number' || !isFinite(k_yr)) {
        throw new TypeError('k_yr must be a finite number');
    }
    if (typeof t_years !== 'number' || !isFinite(t_years)) {
        throw new TypeError('t_years must be a finite number');
    }
    if (waste_mass_t <= 0) throw new RangeError('waste_mass_t must be > 0');
    if (DOC_fraction < 0 || DOC_fraction > 1) throw new RangeError('DOC_fraction must be in [0, 1]');
    if (k_yr <= 0) throw new RangeError('k_yr must be > 0');
    if (t_years < 0) throw new RangeError('t_years must be ≥ 0');

    // L0 = DOC_fraction × MCF × F_CH4 × (MW_RATIO) × (1000 / RHO_CH4) - mesmo cálculo de computeMethanePotential
    const l0 = DOC_fraction * MCF * F_CH4 * MW_RATIO * (1000 / RHO_CH4_KG_M3);
    // Q_CH4 = k × L0 × M × e^(−k × t) (m³/yr)
    const CH4_m3_yr = k_yr * l0 * waste_mass_t * Math.exp(-k_yr * t_years);
    return { CH4_m3_yr };
}

/**
 * Compute energy potential from annual landfill gas methane volume.
 * Calcula o potencial energético do metano de aterro sanitário.
 *
 * E (MWh/yr) = Q_CH4 × ρ_CH4 × LHV_CH4 × efficiency / 3600
 *
 * @param {number} CH4_m3_yr - Annual methane generation (m³/yr); must be > 0
 * @param {number} efficiency - Electrical conversion efficiency (0–1); must be in (0, 1]
 * @returns {{ energy_MWh_yr: number }} Annual electrical energy potential (MWh/yr)
 * @throws {TypeError}  If inputs are not finite numbers
 * @throws {RangeError} If CH4_m3_yr ≤ 0 or efficiency outside (0, 1]
 */
export function computeLFGEnergyPotential(CH4_m3_yr: number, efficiency: number): { energy_MWh_yr: number } {
    if (typeof CH4_m3_yr !== 'number' || !isFinite(CH4_m3_yr)) {
        throw new TypeError('CH4_m3_yr must be a finite number');
    }
    if (typeof efficiency !== 'number' || !isFinite(efficiency)) {
        throw new TypeError('efficiency must be a finite number');
    }
    if (CH4_m3_yr <= 0) throw new RangeError('CH4_m3_yr must be > 0');
    if (efficiency <= 0 || efficiency > 1) throw new RangeError('efficiency must be in (0, 1]');

    // Energia (MWh/yr) = Q × ρ_CH4 (kg/m³) × LHV (MJ/kg) × η / 3600 (MJ→MWh)
    const energy_MWh_yr = (CH4_m3_yr * RHO_CH4_KG_M3 * LHV_CH4_MJ_KG * efficiency) / 3600;
    return { energy_MWh_yr };
}

/**
 * Compute leachate generation from a landfill cell using water balance.
 * Calcula a geração de chorume por balanço hídrico simplificado.
 *
 * Leachate (m³/yr) = rainfall_mm × area_m2/1000 × runoff_coef × (1 − recirculation_pct/100)
 * Baseado em balanço hídrico de Thornthwaite (1948) simplificado para aterros.
 *
 * @param {number} rainfall_mm       - Annual rainfall (mm/yr); must be ≥ 0
 * @param {number} area_m2           - Landfill cell area (m²); must be > 0
 * @param {number} runoff_coef       - Surface runoff coefficient (0–1)
 * @param {number} recirculation_pct - Percentage of leachate recirculated back (0–100)
 * @returns {{ leachate_m3_yr: number }} Annual leachate generation (m³/yr)
 * @throws {TypeError}  If any input is not a finite number
 * @throws {RangeError} If parameters are out of physical range
 */
export function computeLeachateGeneration(
    rainfall_mm: number,
    area_m2: number,
    runoff_coef: number,
    recirculation_pct: number,
): { leachate_m3_yr: number } {
    if (typeof rainfall_mm !== 'number' || !isFinite(rainfall_mm)) {
        throw new TypeError('rainfall_mm must be a finite number');
    }
    if (typeof area_m2 !== 'number' || !isFinite(area_m2)) {
        throw new TypeError('area_m2 must be a finite number');
    }
    if (typeof runoff_coef !== 'number' || !isFinite(runoff_coef)) {
        throw new TypeError('runoff_coef must be a finite number');
    }
    if (typeof recirculation_pct !== 'number' || !isFinite(recirculation_pct)) {
        throw new TypeError('recirculation_pct must be a finite number');
    }
    if (rainfall_mm < 0) throw new RangeError('rainfall_mm must be ≥ 0');
    if (area_m2 <= 0) throw new RangeError('area_m2 must be > 0');
    if (runoff_coef < 0 || runoff_coef > 1) throw new RangeError('runoff_coef must be in [0, 1]');
    if (recirculation_pct < 0 || recirculation_pct > 100) {
        throw new RangeError('recirculation_pct must be in [0, 100]');
    }

    // Precipitação efetiva convertida de mm → m³: rainfall(mm)/1000 × área(m²)
    const grossLeachate_m3_yr = (rainfall_mm / 1000) * area_m2 * runoff_coef;
    // Desconta a fração recirculada para dentro da célula
    const leachate_m3_yr = grossLeachate_m3_yr * (1 - recirculation_pct / 100);
    return { leachate_m3_yr };
}

/**
 * Classify landfill gas potential by specific CH4 yield per unit area.
 * Classifica o potencial de biogás do aterro pela geração específica por hectare.
 *
 * Classes de potencial de aproveitamento energético:
 *   negligible: < 100 m³ CH4/(yr·ha)
 *   small:      100–1 000 m³ CH4/(yr·ha)
 *   medium:     1 000–10 000 m³ CH4/(yr·ha)
 *   large:      ≥ 10 000 m³ CH4/(yr·ha)
 *
 * @param {number} CH4_m3_yr - Annual methane generation (m³/yr); must be > 0
 * @param {number} area_ha   - Landfill area (ha); must be > 0
 * @returns {{ potential: 'negligible'|'small'|'medium'|'large' }} LFG potential class
 * @throws {TypeError}  If inputs are not finite numbers
 * @throws {RangeError} If CH4_m3_yr ≤ 0 or area_ha ≤ 0
 */
export function classifyLFGPotential(
    CH4_m3_yr: number,
    area_ha: number,
): { potential: 'negligible' | 'small' | 'medium' | 'large' } {
    if (typeof CH4_m3_yr !== 'number' || !isFinite(CH4_m3_yr)) {
        throw new TypeError('CH4_m3_yr must be a finite number');
    }
    if (typeof area_ha !== 'number' || !isFinite(area_ha)) {
        throw new TypeError('area_ha must be a finite number');
    }
    if (CH4_m3_yr <= 0) throw new RangeError('CH4_m3_yr must be > 0');
    if (area_ha <= 0) throw new RangeError('area_ha must be > 0');

    // Geração específica = CH4 total / área do aterro
    const specific = CH4_m3_yr / area_ha;
    if (specific < 100) return { potential: 'negligible' };
    if (specific < 1000) return { potential: 'small' };
    if (specific < 10000) return { potential: 'medium' };
    return { potential: 'large' };
}

/**
 * Classify explosion risk of landfill gas based on methane concentration and location.
 * Classifica o risco de explosão do biogás baseado na concentração de CH4 e localização.
 *
 * Limits (LFL/4 methodology, NFPA 652; US EPA AP-42 §2.4):
 *   surface:  1.0% v/v (1% of LFL = 5%)
 *   boundary: 1.0% v/v
 *   building: 1.25% v/v (LFL/4 for enclosed spaces)
 *
 * @param {number} concentration_pct      - Methane concentration (% v/v); must be ≥ 0
 * @param {'surface'|'boundary'|'building'} location - Measurement location type
 * @returns {{ explosionRisk: boolean, limit_pct: number, exceedance: boolean }}
 * @throws {TypeError}  If location is not a valid string
 * @throws {RangeError} If concentration_pct < 0
 */
export function classifyLandfillGasRisk(
    concentration_pct: number,
    location: 'surface' | 'boundary' | 'building',
): { explosionRisk: boolean; limit_pct: number; exceedance: boolean } {
    // Validação de entradas
    if (typeof concentration_pct !== 'number' || !isFinite(concentration_pct)) {
        throw new TypeError('concentration_pct must be a finite number');
    }
    if (concentration_pct < 0) {
        throw new RangeError('concentration_pct must be ≥ 0');
    }
    if (!Object.prototype.hasOwnProperty.call(CH4_LIMITS, location)) {
        throw new TypeError(`location must be one of: ${Object.keys(CH4_LIMITS).join(', ')}`);
    }

    const limit_pct = CH4_LIMITS[location]!;
    const exceedance = concentration_pct > limit_pct;

    // Risco de explosão: concentração acima do limite regulatório E dentro da faixa explosiva (LFL=5%)
    const explosionRisk = exceedance && concentration_pct <= 5.0;

    return { explosionRisk, limit_pct, exceedance };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const landfillGasModelMeta: AnalyticsModuleMeta = {
    name: 'landfillGasModel',
    description: 'Landfill Gas Generation Model',
    category: 'analytics',
    familyTags: ['landfill'],
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
