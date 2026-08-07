// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Biogas Production Model - LandGEM landfill emissions, biogas potential, electricity generation
// Modelo de produção de biogás - emissões LandGEM, potencial de biogás, geração de energia
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

// Poder calorífico inferior do metano: 9.97 kWh/m³ (condições normais)
const CH4_ENERGY_KWH_M3 = 9.97;

// GWP do metano (CH4) em 100 anos - AR6 IPCC 2021
const CH4_GWP100 = 28;

// Fração volumétrica de CH4 no biogás (valor típico para aterros e biodigestores)
const BIOGAS_CH4_FRACTION = 0.65;

/**
 * Computes landfill methane emissions using the LandGEM first-order decay model.
 * Calcula emissões de metano em aterros pelo modelo LandGEM de decaimento de primeira ordem.
 *
 * QCH4 = M × L0 × k × exp(−k × t)
 *
 * @param waste_mass_t - Mass of waste in landfill (metric tons)
 * @param k_yr - Methane generation rate constant (yr⁻¹; typical: 0.02–0.7)
 * @param L0_m3_t - Methane generation potential (m³/t; typical: 100–170)
 * @param time_yr - Time since waste placement (years)
 * @returns methane_m3_yr and co2eq_t_yr
 *
 * @references
 *   EPA (2005). LandGEM v3.02 Landfill Gas Emissions Model User's Guide. EPA-600/R-05/047.
 *   IPCC (2006). Guidelines for National Greenhouse Gas Inventories, Vol. 5, Ch. 3.
 *   CETESB GRS-22 (2014). Guia de orientação para aproveitamento energético do biogás em aterros sanitários.
 */
export function computeLandGEMEmission(
    waste_mass_t: number,
    k_yr: number,
    L0_m3_t: number,
    time_yr: number,
): { methane_m3_yr: number; co2eq_t_yr: number } {
    if (
        typeof waste_mass_t !== 'number' ||
        typeof k_yr !== 'number' ||
        typeof L0_m3_t !== 'number' ||
        typeof time_yr !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (waste_mass_t < 0) throw new RangeError('waste_mass_t must be >= 0');
    if (k_yr <= 0) throw new RangeError('k_yr must be > 0');
    if (L0_m3_t <= 0) throw new RangeError('L0_m3_t must be > 0');
    if (time_yr < 0) throw new RangeError('time_yr must be >= 0');

    // Taxa de geração de metano: Q = M × L0 × k × exp(−k × t)
    const methane_m3_yr = waste_mass_t * L0_m3_t * k_yr * Math.exp(-k_yr * time_yr);

    // Converter m³ CH4/ano para t CO₂eq/ano: densidade CH4 ≈ 0.717 kg/m³ (0 °C, 1 atm)
    const ch4_mass_t_yr = (methane_m3_yr * 0.717) / 1000;
    const co2eq_t_yr = ch4_mass_t_yr * CH4_GWP100;

    return { methane_m3_yr, co2eq_t_yr };
}

/**
 * Estimates biogas production potential from volatile solids (anaerobic digestion).
 * Estima o potencial de produção de biogás a partir de sólidos voláteis (digestão anaeróbia).
 *
 * Q_biogas = VS × By
 * Q_CH4 = Q_biogas × 0.65
 * E = Q_CH4 × 9.97 kWh/m³
 *
 * @param volatile_solids_kg_day - Volatile solids input rate (kg VS/day)
 * @param biogas_yield_m3_kg_vs - Specific biogas yield (m³ biogas / kg VS)
 * @returns biogas_m3_day, methane_m3_day, energy_kWh_day
 *
 * @references
 *   Tchobanoglous, G. et al. (2021). Integrated Solid Waste Management, 3rd ed. McGraw-Hill.
 *   CETESB GRS-22 (2014). Aproveitamento energético do biogás em aterros sanitários.
 */
export function computeBiogasPotential(
    volatile_solids_kg_day: number,
    biogas_yield_m3_kg_vs: number,
): { biogas_m3_day: number; methane_m3_day: number; energy_kWh_day: number } {
    if (typeof volatile_solids_kg_day !== 'number' || typeof biogas_yield_m3_kg_vs !== 'number') {
        throw new TypeError('All arguments must be numbers');
    }
    if (volatile_solids_kg_day < 0) throw new RangeError('volatile_solids_kg_day must be >= 0');
    if (biogas_yield_m3_kg_vs <= 0) throw new RangeError('biogas_yield_m3_kg_vs must be > 0');

    // Produção diária de biogás
    const biogas_m3_day = volatile_solids_kg_day * biogas_yield_m3_kg_vs;

    // CH4 = 65% do biogás (fração típica em aterros e biodigestores)
    const methane_m3_day = biogas_m3_day * BIOGAS_CH4_FRACTION;

    // Energia contida no metano
    const energy_kWh_day = methane_m3_day * CH4_ENERGY_KWH_M3;

    return { biogas_m3_day, methane_m3_day, energy_kWh_day };
}

/**
 * Computes electrical power output from methane in a CHP engine.
 * Calcula a geração elétrica a partir do metano em motor de cogeração (CHP).
 *
 * P = Q_CH4 × 9.97 × η / 24
 *
 * @param methane_m3_day - Methane flow rate (m³/day)
 * @param engine_efficiency - CHP conversion efficiency [0.25, 0.45]
 * @returns power_kW and annual_MWh
 *
 * @references
 *   EPA LFG Energy Project Development Handbook (2023). US EPA.
 *   CETESB GRS-22 (2014).
 */
export function computeElectricityGeneration(
    methane_m3_day: number,
    engine_efficiency: number,
): { power_kW: number; annual_MWh: number } {
    if (typeof methane_m3_day !== 'number' || typeof engine_efficiency !== 'number') {
        throw new TypeError('All arguments must be numbers');
    }
    if (methane_m3_day < 0) throw new RangeError('methane_m3_day must be >= 0');
    if (engine_efficiency < 0.25 || engine_efficiency > 0.45) {
        throw new RangeError('engine_efficiency must be in [0.25, 0.45] for CHP engines');
    }

    // Potência elétrica: P (kW) = Q_CH4 (m³/dia) × PCI (kWh/m³) × η / 24 h
    const power_kW = (methane_m3_day * CH4_ENERGY_KWH_M3 * engine_efficiency) / 24;

    // Produção anual assumindo operação contínua (8760 h/ano)
    const annual_MWh = (power_kW * 8760) / 1000;

    return { power_kW, annual_MWh };
}

/**
 * Classifies landfill gas recovery potential by annual methane production.
 * Classifica o potencial de aproveitamento do gás de aterro pela produção anual de metano.
 *
 * @param total_methane_m3_yr - Annual methane production (m³/yr)
 * @returns category, recovery_viable, description
 *
 * @references
 *   EPA (2023). LFG Energy Project Development Handbook.
 *   CETESB GRS-22 (2014). Aproveitamento energético do biogás.
 */
export function classifyLandfillGasPotential(
    total_methane_m3_yr: number,
): { category: 'small' | 'medium' | 'large' | 'major'; recovery_viable: boolean; description: string } {
    if (typeof total_methane_m3_yr !== 'number') {
        throw new TypeError('total_methane_m3_yr must be a number');
    }
    if (total_methane_m3_yr < 0) throw new RangeError('total_methane_m3_yr must be >= 0');

    let category: 'small' | 'medium' | 'large' | 'major';
    let recovery_viable: boolean;
    let description: string;

    // Classificação baseada em CETESB GRS-22 e EPA LFG Energy
    if (total_methane_m3_yr >= 3_000_000) {
        category = 'major';
        recovery_viable = true;
        description = 'Major LFG resource — viable for electricity generation (> 500 kW)';
    } else if (total_methane_m3_yr >= 500_000) {
        category = 'large';
        recovery_viable = true;
        description = 'Large LFG resource — viable for direct use or small power generation';
    } else if (total_methane_m3_yr >= 50_000) {
        category = 'medium';
        recovery_viable = false;
        description = 'Medium LFG resource — flaring required; energy recovery marginal';
    } else {
        category = 'small';
        recovery_viable = false;
        description = 'Small LFG resource — passive venting or flaring; energy recovery not viable';
    }

    return { category, recovery_viable, description };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const biogasProductionModelMeta: AnalyticsModuleMeta = {
    name: 'biogasProductionModel',
    description: 'biogasProductionModel',
    category: 'analytics',
    familyTags: ['biogas'],
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
