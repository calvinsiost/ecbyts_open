// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Urban Metabolism & Material Flow Analysis
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
// - Eurostat (2013). Economy-wide Material Flow Accounts (EW-MFA) - Compilation Guide.
//   European Commission, Eurostat.
// - Adriaanse, A. et al. (1997). Resource Flows: The Material Basis of Industrial Economies.
//   World Resources Institute, Washington DC.
// - Kennedy, C. et al. (2007). The Changing Metabolism of Cities.
//   Journal of Industrial Ecology, 11(2), 43–59. doi:10.1162/jiec.2007.1107
//   (Note: secondary reference for density scaling; primary urban metabolism framework)
// - Kennedy, C. et al. (2007 IS&T). doi:10.1021/es070445m - scaling law derivation used
//   in computeUrbanDensityMetabolism
// - Decker, E.H. et al. (2000). Energy and Material Flow Through the Urban Ecosystem.
//   Annual Review of Energy and Environment, 25, 685–740.
// - Kenway, S.J. et al. (2019). Urban water metabolism - trends and prospects.
//   Water Research X, 3, 100026.
// - IPCC AR6 WG3 (2022). Chapter 7: Agriculture, Forestry and Other Land Use.
//   Chapter 11: Urban Systems and Other Settlements.
// - EU Circular Economy Action Plan (2020). European Commission COM(2020) 98 final.
// - Ellen MacArthur Foundation (2015). Towards a Circular Economy: Business Rationale
//   for an Accelerated Transition. Material Circularity Indicator.
//   doi:10.1007/s11367-015-0971-z (Linder et al. 2017 implementation reference)
// - Oke, T.R. (1987). Boundary Layer Climates (2nd ed.). Routledge. ISBN 9780415040199.
// - USDA SCS / NRCS (1986). Urban Hydrology for Small Watersheds. TR-55. 2nd ed.
// - Billen, G. et al. (2012). Nitrogen flows from European regional watersheds.
//   PLOS ONE. doi:10.1371/journal.pone.0047207
// - Kalmykova, Y. et al. (2012). Phosphorus source analysis and a pilot study
//   of P recovery potential in Gothenburg. doi:10.2166/wst.2012.374
// - GHG Protocol for Cities (2019). Global Protocol for Community-Scale Greenhouse Gas
//   Emission Inventories. doi:10.1016/j.rser.2019.04.002 (Peng 2020 review)
// - Tanikawa, H. et al. (2015). The weight of society over time and space:
//   4D material stock analysis. doi:10.1016/j.jcp.2015.01.043
// - Graedel, T.E. et al. (2011). What Do We Know About Metal Recycling Rates?
//   Journal of Industrial Ecology. doi:10.1021/es2008255
// - US EPA (1997). AP-42: Compilation of Air Emissions Factors, Volume I. 5th ed.
//   (Landfill gas and solid waste default values used for computeLandfillLifespan)
// - EU Waste Statistics Regulation (EC) No 2150/2002 - CDW fraction defaults.
// - Chertow, M.R. (2000). Industrial Symbiosis: Literature and Taxonomy.
//   Annual Review of Energy and the Environment. doi:10.1146/annurev.energy.25.1.313

/* ================================================================
   [BCS:load]
   URBAN METABOLISM - Pure mathematical functions for Material Flow
   Analysis and Urban Metabolism (EW-MFA, Eurostat 2013 framework).
   ================================================================

   Modulo de metabolismo urbano e analise de fluxo de materiais.
   Todos os calculos sao deterministicos (sem DOM, IDB, rede).

   METODOS (20 funcoes exportadas):
   01. computeMaterialFlowBalance        - IN-STOCK-OUT balance (EW-MFA)
   02. computeDirectMaterialInput        - DMI = domestic extraction + imports
   03. computeDomesticMaterialConsumption - DMC = DMI - exports
   04. computeTotalMaterialRequirement   - TMR = DMC + hidden flows
   05. computeUrbanDensityMetabolism     - metabolic rate per capita vs density
   06. computeEnergyFlowCity             - urban energy metabolism
   07. computeWaterMetabolism            - urban water balance
   08. computeWasteGenerationRate        - solid waste per capita
   09. computeRecyclingRate              - recycled fraction
   10. computeCircularEconomyIndex       - MCI circularity index (EMF)
   11. computeUrbanHeatIslandIntensity   - UHI = T_urban - T_rural
   12. computeImperviousSurfaceRunoff    - NRCS curve number runoff
   13. computeNitrogenCityBalance        - N budget (Billen 2012)
   14. computePhosphorusUrbanCycle       - P balance water-food-waste
   15. computeUrbanCarbonFootprint       - Scope 1+2 GHG (GHG Protocol 2019)
   16. computeBuildingMaterialStock      - in-use stock per capita (Tanikawa 2015)
   17. computeUrbanMiningPotential       - metal recovery from secondary sources
   18. computeLandfillLifespan           - remaining capacity / annual fill rate
   19. computeConstructionDemolitionWaste - CDW generation (EU Waste Stats)
   20. computeSymbiosisSavings           - eco-industrial symbiosis benefit (Chertow 2000)

   ================================================================ */

// ---------------------------------------------------------------------------
// BCS constants - reference default values
// Constantes de referencia para metabolismo urbano
// ---------------------------------------------------------------------------

/**
 * Constantes de referencia para analise de metabolismo urbano.
 * Reference constants compiled from Eurostat MFA 2013, IPCC AR6 WG3,
 * NRCS TR-55 1986, Tanikawa 2015, and GHG Protocol for Cities 2019.
 */
export const BCS_CONSTANTS = Object.freeze({
    /** EW-MFA default hidden flow multiplier for biomass - Eurostat 2013 */
    hidden_flow_factor_biomass: 0.3,
    /** EW-MFA default hidden flow multiplier for minerals - Eurostat 2013 */
    hidden_flow_factor_minerals: 2.5,
    /** EW-MFA default hidden flow multiplier for fossil fuels - Eurostat 2013 */
    hidden_flow_factor_fossil: 1.2,
    /** Default municipal solid waste generation rate [kg/capita/day] - IPCC AR6 WG3 */
    mswDefaultKgPerCapitaDay: 0.74,
    /** Global average recycling rate fraction [0-1] - EU Circular Economy 2020 */
    recyclingRateGlobalAvg: 0.17,
    /** Default construction & demolition waste rate [kg/m²/yr] - EU Waste Stats */
    cdwDefaultKgM2Yr: 0.12,
    /** CO2 equivalent per kWh electricity global avg [tCO2e/MWh] - IEA 2023 */
    co2PerMWhElecGlobalAvg: 0.459,
    /** CO2 equivalent per GJ natural gas [tCO2e/GJ] - IPCC AR6 WG3 */
    co2PerGJNatGas: 0.0561,
    /** UHI threshold for significant heat island effect [°C] - Oke 1987 */
    uhiSignificantThreshold: 2.0,
    /** NRCS TR-55 CN for developed land (composite) */
    nrcsCnDeveloped: 86,
    /** Steel density in building stock [kg/m² floor area] - Tanikawa 2015 */
    steelKgM2Floor: 50,
    /** Concrete density in building stock [kg/m² floor area] - Tanikawa 2015 */
    concreteKgM2Floor: 850,
    /** Wood density in building stock [kg/m² floor area] - Tanikawa 2015 */
    woodKgM2Floor: 30,
    /** Metal recovery efficiency from urban mining - Graedel 2011 */
    urbanMiningEfficiency: 0.85,
    /** Landfill compaction factor [tonne/m³] - EPA AP-42 */
    landfillCompactionTonne_m3: 0.6,
    /** Eco-industrial park default energy exchange efficiency - Chertow 2000 */
    eipEnergyExchangeEfficiency: 0.75,
});

// ---------------------------------------------------------------------------
// Helper guards
// Verificacoes de entrada compartilhadas
// ---------------------------------------------------------------------------

/**
 * Verifica se um valor e um numero finito nao negativo.
 * @param {*} v - valor a verificar
 * @param {string} name - nome do parametro para mensagem de erro
 */
function assertNonNegFinite(v: any, name: string) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new RangeError(`[BCS] ${name} must be a non-negative finite number, got ${v}`);
    }
}

/**
 * Verifica se um valor e um numero finito positivo (> 0).
 * @param {*} v - valor a verificar
 * @param {string} name - nome do parametro para mensagem de erro
 */
function assertPositiveFinite(v: any, name: string) {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        throw new RangeError(`[BCS] ${name} must be a positive finite number, got ${v}`);
    }
}

/**
 * Verifica se um valor e um numero finito (pode ser negativo).
 * @param {*} v - valor a verificar
 * @param {string} name - nome do parametro para mensagem de erro
 */
function assertFiniteNumber(v: any, name: string) {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`[BCS] ${name} must be a finite number, got ${v}`);
    }
}

// ===========================================================================
// 01. computeMaterialFlowBalance
// ===========================================================================

/**
 * Computes the material flow mass balance (IN - STOCK - OUT = 0).
 * Calcula o balanco de massa segundo o framework EW-MFA da Eurostat 2013.
 *
 * Balance: imbalance = inflow - (deltaStock + outflow)
 * A perfectly balanced system has imbalance === 0.
 *
 * @param {number} inflow_t    - Total material inputs [tonnes/yr]
 * @param {number} deltaStock_t - Net addition to stock (NAS) [tonnes/yr]; can be negative
 * @param {number} outflow_t   - Total material outputs [tonnes/yr]
 * @returns {{ inflow: number, deltaStock: number, outflow: number,
 *             imbalance: number, closureError_pct: number }}
 * @throws {TypeError} if any argument is not a finite number
 * @reference Eurostat (2013). Economy-wide Material Flow Accounts - Compilation Guide.
 */
export function computeMaterialFlowBalance(inflow_t: number, deltaStock_t: number, outflow_t: number): { inflow: number, deltaStock: number, outflow: number, imbalance: number, closureError_pct: number } {
    assertFiniteNumber(inflow_t, 'inflow_t');
    assertFiniteNumber(deltaStock_t, 'deltaStock_t');
    assertFiniteNumber(outflow_t, 'outflow_t');

    const imbalance = inflow_t - deltaStock_t - outflow_t;
    const denominator = Math.max(Math.abs(inflow_t), 1e-12);
    const closureError_pct = (Math.abs(imbalance) / denominator) * 100;

    return {
        inflow: inflow_t,
        deltaStock: deltaStock_t,
        outflow: outflow_t,
        imbalance,
        closureError_pct,
    };
}

// ===========================================================================
// 02. computeDirectMaterialInput
// ===========================================================================

/**
 * Computes Direct Material Input (DMI) per EW-MFA framework.
 * DMI = domestic extraction + imports.
 *
 * Calcula a Entrada Direta de Materiais: extracao domestica + importacoes.
 *
 * @param {number} domesticExtraction_t - Domestic extraction [tonnes/yr]
 * @param {number} imports_t            - Imports [tonnes/yr]
 * @returns {{ domesticExtraction: number, imports: number, DMI: number }}
 * @throws {RangeError} if any value is negative or non-finite
 * @reference Eurostat (2013). EW-MFA Compilation Guide, Section 3.1.
 */
export function computeDirectMaterialInput(domesticExtraction_t: number, imports_t: number): { domesticExtraction: number, imports: number, DMI: number } {
    assertNonNegFinite(domesticExtraction_t, 'domesticExtraction_t');
    assertNonNegFinite(imports_t, 'imports_t');

    const DMI = domesticExtraction_t + imports_t;
    return { domesticExtraction: domesticExtraction_t, imports: imports_t, DMI };
}

// ===========================================================================
// 03. computeDomesticMaterialConsumption
// ===========================================================================

/**
 * Computes Domestic Material Consumption (DMC).
 * DMC = DMI - exports.
 *
 * Calcula o Consumo Domestico de Materiais segundo o framework EW-MFA.
 *
 * @param {number} DMI_t     - Direct Material Input [tonnes/yr] (>= exports)
 * @param {number} exports_t - Exports [tonnes/yr]
 * @returns {{ DMI: number, exports: number, DMC: number }}
 * @throws {RangeError} if DMI < exports or any value is negative
 * @reference Eurostat (2013). EW-MFA Compilation Guide, Section 3.2.
 */
export function computeDomesticMaterialConsumption(DMI_t: number, exports_t: number): { DMI: number, exports: number, DMC: number } {
    assertNonNegFinite(DMI_t, 'DMI_t');
    assertNonNegFinite(exports_t, 'exports_t');
    if (exports_t > DMI_t) {
        throw new RangeError('[BCS] exports_t cannot exceed DMI_t');
    }

    const DMC = DMI_t - exports_t;
    return { DMI: DMI_t, exports: exports_t, DMC };
}

// ===========================================================================
// 04. computeTotalMaterialRequirement
// ===========================================================================

/**
 * Computes Total Material Requirement (TMR).
 * TMR = DMC + hidden flows (upstream rucksacks).
 *
 * Calcula o Requisito Total de Materiais incluindo fluxos ocultos
 * (mochilas upstream) por categoria: biomass, minerals, fossil fuels.
 *
 * @param {number} dmc_t              - DMC [tonnes/yr]
 * @param {number} hiddenFlowBiomass_t - Hidden flows from biomass [tonnes/yr]
 * @param {number} hiddenFlowMinerals_t - Hidden flows from minerals [tonnes/yr]
 * @param {number} hiddenFlowFossil_t  - Hidden flows from fossil fuels [tonnes/yr]
 * @returns {{ DMC: number, hiddenFlows: number, TMR: number }}
 * @throws {RangeError} if any value is negative or non-finite
 * @reference Adriaanse, A. et al. (1997). Resource Flows. World Resources Institute.
 */
export function computeTotalMaterialRequirement(dmc_t: number, hiddenFlowBiomass_t: number, hiddenFlowMinerals_t: number, hiddenFlowFossil_t: number): { DMC: number, hiddenFlows: number, TMR: number } {
    assertNonNegFinite(dmc_t, 'dmc_t');
    assertNonNegFinite(hiddenFlowBiomass_t, 'hiddenFlowBiomass_t');
    assertNonNegFinite(hiddenFlowMinerals_t, 'hiddenFlowMinerals_t');
    assertNonNegFinite(hiddenFlowFossil_t, 'hiddenFlowFossil_t');

    const hiddenFlows = hiddenFlowBiomass_t + hiddenFlowMinerals_t + hiddenFlowFossil_t;
    const TMR = dmc_t + hiddenFlows;
    return { DMC: dmc_t, hiddenFlows, TMR };
}

// ===========================================================================
// 05. computeUrbanDensityMetabolism
// ===========================================================================

/**
 * Computes the metabolic rate of a city as a function of population density.
 * Uses an allometric scaling law: metabolicRate = baseRate × (density / refDensity)^exponent.
 *
 * Calcula a taxa metabolica urbana em funcao da densidade populacional
 * usando lei de escala alometrica (Kennedy 2007).
 *
 * Default exponent = 0.85 (sub-linear scaling, Kennedy doi:10.1021/es070445m).
 *
 * @param {number} population        - City population [persons]
 * @param {number} area_km2          - City area [km²]
 * @param {number} baseMetabolicRate_GJ_cap_yr - Per-capita metabolic rate [GJ/capita/yr]
 * @param {number} [densityExponent=0.85] - Allometric scaling exponent
 * @param {number} [refDensity_cap_km2=5000] - Reference density [capita/km²]
 * @returns {{ density_cap_km2: number, metabolicRate_GJ_cap_yr: number,
 *             totalMetabolicRate_GJ_yr: number }}
 * @throws {RangeError} if population, area, or baseMetabolicRate are non-positive
 * @reference Kennedy, C. et al. (2007). doi:10.1021/es070445m
 */
export function computeUrbanDensityMetabolism(population: number, area_km2: number, baseMetabolicRate_GJ_cap_yr: number, densityExponent: number = 0.85, refDensity_cap_km2: number = 5000): { density_cap_km2: number, metabolicRate_GJ_cap_yr: number, totalMetabolicRate_GJ_yr: number } {
    assertPositiveFinite(population, 'population');
    assertPositiveFinite(area_km2, 'area_km2');
    assertPositiveFinite(baseMetabolicRate_GJ_cap_yr, 'baseMetabolicRate_GJ_cap_yr');
    assertFiniteNumber(densityExponent, 'densityExponent');
    assertPositiveFinite(refDensity_cap_km2, 'refDensity_cap_km2');

    const density_cap_km2 = population / area_km2;
    const scalingFactor = Math.pow(density_cap_km2 / refDensity_cap_km2, densityExponent);
    const metabolicRate_GJ_cap_yr = baseMetabolicRate_GJ_cap_yr * scalingFactor;
    const totalMetabolicRate_GJ_yr = metabolicRate_GJ_cap_yr * population;

    return { density_cap_km2, metabolicRate_GJ_cap_yr, totalMetabolicRate_GJ_yr };
}

// ===========================================================================
// 06. computeEnergyFlowCity
// ===========================================================================

/**
 * Computes the total urban energy metabolism.
 * EF = population × per-capita energy intensity.
 *
 * Calcula o metabolismo energetico urbano total (Decker 2000).
 * Desagregado por setor: residencial, industrial, transporte.
 *
 * @param {number} population             - City population [persons]
 * @param {number} residentialIntensity_GJ_cap - Residential energy [GJ/capita/yr]
 * @param {number} industrialIntensity_GJ_cap  - Industrial energy [GJ/capita/yr]
 * @param {number} transportIntensity_GJ_cap   - Transport energy [GJ/capita/yr]
 * @returns {{ totalEnergyFlow_GJ_yr: number, residential_GJ_yr: number,
 *             industrial_GJ_yr: number, transport_GJ_yr: number,
 *             perCapita_GJ_cap_yr: number }}
 * @throws {RangeError} if population is non-positive or intensities are negative
 * @reference Decker, E.H. et al. (2000). Annual Review of Energy and Environment, 25, 685-740.
 */
export function computeEnergyFlowCity(population: number, residentialIntensity_GJ_cap: number, industrialIntensity_GJ_cap: number, transportIntensity_GJ_cap: number): { totalEnergyFlow_GJ_yr: number, residential_GJ_yr: number, industrial_GJ_yr: number, transport_GJ_yr: number, perCapita_GJ_cap_yr: number } {
    assertPositiveFinite(population, 'population');
    assertNonNegFinite(residentialIntensity_GJ_cap, 'residentialIntensity_GJ_cap');
    assertNonNegFinite(industrialIntensity_GJ_cap, 'industrialIntensity_GJ_cap');
    assertNonNegFinite(transportIntensity_GJ_cap, 'transportIntensity_GJ_cap');

    const perCapita_GJ_cap_yr = residentialIntensity_GJ_cap + industrialIntensity_GJ_cap + transportIntensity_GJ_cap;
    const residential_GJ_yr = residentialIntensity_GJ_cap * population;
    const industrial_GJ_yr = industrialIntensity_GJ_cap * population;
    const transport_GJ_yr = transportIntensity_GJ_cap * population;
    const totalEnergyFlow_GJ_yr = perCapita_GJ_cap_yr * population;

    return {
        totalEnergyFlow_GJ_yr,
        residential_GJ_yr,
        industrial_GJ_yr,
        transport_GJ_yr,
        perCapita_GJ_cap_yr,
    };
}

// ===========================================================================
// 07. computeWaterMetabolism
// ===========================================================================

/**
 * Computes the urban water balance.
 * Water balance: losses = supply - consumption - effluent_returned.
 *
 * Calcula o balanco hidrico urbano (Kenway 2019).
 *
 * @param {number} supply_m3_yr       - Total water supply [m³/yr]
 * @param {number} consumption_m3_yr  - Actual water consumption (ET + products) [m³/yr]
 * @param {number} effluentReturned_m3_yr - Effluents returned to environment [m³/yr]
 * @returns {{ supply: number, consumption: number, effluentReturned: number,
 *             losses: number, waterUseEfficiency: number }}
 * @throws {RangeError} if any value is negative or supply is zero
 * @reference Kenway, S.J. et al. (2019). Water Research X, 3, 100026.
 */
export function computeWaterMetabolism(supply_m3_yr: number, consumption_m3_yr: number, effluentReturned_m3_yr: number): { supply: number, consumption: number, effluentReturned: number, losses: number, waterUseEfficiency: number } {
    assertPositiveFinite(supply_m3_yr, 'supply_m3_yr');
    assertNonNegFinite(consumption_m3_yr, 'consumption_m3_yr');
    assertNonNegFinite(effluentReturned_m3_yr, 'effluentReturned_m3_yr');

    const losses = supply_m3_yr - consumption_m3_yr - effluentReturned_m3_yr;
    const waterUseEfficiency = (supply_m3_yr - losses) / supply_m3_yr;

    return {
        supply: supply_m3_yr,
        consumption: consumption_m3_yr,
        effluentReturned: effluentReturned_m3_yr,
        losses,
        waterUseEfficiency,
    };
}

// ===========================================================================
// 08. computeWasteGenerationRate
// ===========================================================================

/**
 * Computes solid waste generation rate for a city.
 * Uses per-capita generation rate and population.
 *
 * Calcula a taxa de geracao de residuos solidos urbanos (IPCC AR6 WG3).
 *
 * @param {number} population              - City population [persons]
 * @param {number} perCapitaRate_kg_cap_day - Per-capita waste generation [kg/capita/day]
 *                                           (default: 0.74 global avg, IPCC AR6 WG3)
 * @returns {{ population: number, perCapitaRate_kg_cap_day: number,
 *             dailyTotal_t_day: number, annualTotal_t_yr: number }}
 * @throws {RangeError} if population or rate is non-positive
 * @reference IPCC AR6 WG3 (2022). Chapter 11: Urban Systems.
 */
export function computeWasteGenerationRate(population: number, perCapitaRate_kg_cap_day: number = BCS_CONSTANTS.mswDefaultKgPerCapitaDay): { population: number, perCapitaRate_kg_cap_day: number, dailyTotal_t_day: number, annualTotal_t_yr: number } {
    assertPositiveFinite(population, 'population');
    assertPositiveFinite(perCapitaRate_kg_cap_day, 'perCapitaRate_kg_cap_day');

    const dailyTotal_kg = population * perCapitaRate_kg_cap_day;
    const dailyTotal_t_day = dailyTotal_kg / 1000;
    const annualTotal_t_yr = dailyTotal_t_day * 365;

    return {
        population,
        perCapitaRate_kg_cap_day,
        dailyTotal_t_day,
        annualTotal_t_yr,
    };
}

// ===========================================================================
// 09. computeRecyclingRate
// ===========================================================================

/**
 * Computes the recycling rate as a fraction of total waste generated.
 *
 * Calcula a taxa de reciclagem como fracao do residuo total gerado
 * (EU Circular Economy Action Plan 2020).
 *
 * @param {number} recycled_t_yr   - Mass of material recycled [tonnes/yr]
 * @param {number} totalWaste_t_yr - Total waste generated [tonnes/yr]
 * @returns {{ recycled: number, totalWaste: number, recyclingRate: number,
 *             residualWaste_t_yr: number }}
 * @throws {RangeError} if recycled > totalWaste or any value is negative
 * @reference EU Circular Economy Action Plan (2020). COM(2020) 98 final.
 */
export function computeRecyclingRate(recycled_t_yr: number, totalWaste_t_yr: number): { recycled: number, totalWaste: number, recyclingRate: number, residualWaste_t_yr: number } {
    assertNonNegFinite(recycled_t_yr, 'recycled_t_yr');
    assertPositiveFinite(totalWaste_t_yr, 'totalWaste_t_yr');
    if (recycled_t_yr > totalWaste_t_yr) {
        throw new RangeError('[BCS] recycled_t_yr cannot exceed totalWaste_t_yr');
    }

    const recyclingRate = recycled_t_yr / totalWaste_t_yr;
    const residualWaste_t_yr = totalWaste_t_yr - recycled_t_yr;

    return { recycled: recycled_t_yr, totalWaste: totalWaste_t_yr, recyclingRate, residualWaste_t_yr };
}

// ===========================================================================
// 10. computeCircularEconomyIndex
// ===========================================================================

/**
 * Computes the Material Circularity Indicator (MCI) for a city.
 * MCI = recycledFlow / (DMI - exports - netAdditionToStock).
 *
 * Calcula o Indicador de Circularidade de Materiais (Ellen MacArthur Foundation).
 * Valores proximo de 1.0 indicam economia quase totalmente circular.
 *
 * @param {number} recycledFlow_t_yr      - Mass recycled and re-entering economy [t/yr]
 * @param {number} DMI_t_yr               - Direct Material Input [t/yr]
 * @param {number} exports_t_yr           - Exports [t/yr]
 * @param {number} netAdditionToStock_t_yr - Net addition to stock [t/yr]
 * @returns {{ MCI: number, linearFlow_t_yr: number, recycledFlow: number }}
 * @throws {RangeError} on invalid inputs or if linear flow <= 0
 * @reference Ellen MacArthur Foundation (2015). MCI framework;
 *            Linder et al. (2017). doi:10.1007/s11367-015-0971-z
 */
export function computeCircularEconomyIndex(recycledFlow_t_yr: number, DMI_t_yr: number, exports_t_yr: number, netAdditionToStock_t_yr: number): { MCI: number, linearFlow_t_yr: number, recycledFlow: number } {
    assertNonNegFinite(recycledFlow_t_yr, 'recycledFlow_t_yr');
    assertNonNegFinite(DMI_t_yr, 'DMI_t_yr');
    assertNonNegFinite(exports_t_yr, 'exports_t_yr');
    assertNonNegFinite(netAdditionToStock_t_yr, 'netAdditionToStock_t_yr');

    const linearFlow_t_yr = DMI_t_yr - exports_t_yr - netAdditionToStock_t_yr;
    if (linearFlow_t_yr <= 0) {
        throw new RangeError('[BCS] linearFlow_t_yr must be > 0 (DMI - exports - NAS <= 0)');
    }
    if (recycledFlow_t_yr > linearFlow_t_yr) {
        throw new RangeError('[BCS] recycledFlow_t_yr cannot exceed linearFlow_t_yr');
    }

    const MCI = recycledFlow_t_yr / linearFlow_t_yr;
    return { MCI, linearFlow_t_yr, recycledFlow: recycledFlow_t_yr };
}

// ===========================================================================
// 11. computeUrbanHeatIslandIntensity
// ===========================================================================

/**
 * Computes the Urban Heat Island (UHI) intensity.
 * UHI = T_urban - T_rural (K or °C, same unit difference).
 *
 * Calcula a intensidade da Ilha de Calor Urbana (Oke 1987).
 *
 * @param {number} T_urban_C - Mean urban surface/air temperature [°C]
 * @param {number} T_rural_C - Mean rural reference temperature [°C]
 * @returns {{ T_urban: number, T_rural: number, UHI_delta_C: number,
 *             classification: string }}
 * @throws {TypeError} if T values are not finite numbers
 * @reference Oke, T.R. (1987). Boundary Layer Climates (2nd ed.).
 *            Routledge. ISBN 9780415040199.
 */
export function computeUrbanHeatIslandIntensity(T_urban_C: number, T_rural_C: number): { T_urban: number, T_rural: number, UHI_delta_C: number, classification: string } {
    assertFiniteNumber(T_urban_C, 'T_urban_C');
    assertFiniteNumber(T_rural_C, 'T_rural_C');

    const UHI_delta_C = T_urban_C - T_rural_C;
    let classification;
    if (UHI_delta_C < 1) classification = 'negligible';
    else if (UHI_delta_C < 2) classification = 'weak';
    else if (UHI_delta_C < 4) classification = 'moderate';
    else if (UHI_delta_C < 8) classification = 'strong';
    else classification = 'extreme';

    return { T_urban: T_urban_C, T_rural: T_rural_C, UHI_delta_C, classification };
}

// ===========================================================================
// 12. computeImperviousSurfaceRunoff
// ===========================================================================

/**
 * Computes surface runoff using the NRCS Curve Number method (TR-55 1986).
 * Q = (P - Ia)² / (P - Ia + S) where Ia = 0.2*S and S = (1000/CN) - 10.
 *
 * Calcula o escoamento superficial pelo metodo da curva numero NRCS (TR-55 1986).
 * Retorna zero quando precipitacao <= abstraccao inicial (P <= 0.2*S).
 *
 * @param {number} precipitation_mm - Design storm total rainfall [mm]
 * @param {number} curveNumber      - NRCS Curve Number [1–100]
 * @returns {{ Q_mm: number, S_mm: number, Ia_mm: number, runoffCoeff: number }}
 * @throws {RangeError} if precipitation < 0 or CN outside [1, 100]
 * @reference USDA SCS / NRCS (1986). Urban Hydrology for Small Watersheds. TR-55.
 */
export function computeImperviousSurfaceRunoff(precipitation_mm: number, curveNumber: number): { Q_mm: number, S_mm: number, Ia_mm: number, runoffCoeff: number } {
    assertNonNegFinite(precipitation_mm, 'precipitation_mm');
    if (typeof curveNumber !== 'number' || !isFinite(curveNumber) || curveNumber < 1 || curveNumber > 100) {
        throw new RangeError('[BCS] curveNumber must be between 1 and 100');
    }

    // Potential maximum soil retention S [mm]
    const S_mm = 25400 / curveNumber - 254; // TR-55 metric conversion
    const Ia_mm = 0.2 * S_mm; // Initial abstraction

    let Q_mm = 0;
    if (precipitation_mm > Ia_mm) {
        const numerator = (precipitation_mm - Ia_mm) ** 2;
        const denominator = precipitation_mm - Ia_mm + S_mm;
        Q_mm = numerator / denominator;
    }

    const runoffCoeff = precipitation_mm > 0 ? Q_mm / precipitation_mm : 0;
    return { Q_mm, S_mm, Ia_mm, runoffCoeff };
}

// ===========================================================================
// 13. computeNitrogenCityBalance
// ===========================================================================

/**
 * Computes the city-scale nitrogen budget.
 * N_balance = (foodImport + feedImport + atmDeposition) - (sewage + wasteDisposal + export).
 * A positive balance indicates net N accumulation in the urban system.
 *
 * Calcula o balanco de nitrogenio em escala urbana (Billen 2012).
 *
 * @param {number} foodImport_tN_yr    - N in food imports [tN/yr]
 * @param {number} feedImport_tN_yr    - N in animal feed imports [tN/yr]
 * @param {number} atmDeposition_tN_yr - Atmospheric N deposition [tN/yr]
 * @param {number} sewageN_tN_yr       - N removed via sewage/wastewater [tN/yr]
 * @param {number} wasteDisposalN_tN_yr - N in solid waste disposal [tN/yr]
 * @param {number} exportN_tN_yr       - N in exports (compost, products) [tN/yr]
 * @returns {{ inputs_tN_yr: number, outputs_tN_yr: number,
 *             N_balance_tN_yr: number, surplusOrDeficit: string }}
 * @throws {RangeError} if any value is negative or non-finite
 * @reference Billen, G. et al. (2012). PLOS ONE. doi:10.1371/journal.pone.0047207
 */
export function computeNitrogenCityBalance(foodImport_tN_yr: number, feedImport_tN_yr: number, atmDeposition_tN_yr: number, sewageN_tN_yr: number, wasteDisposalN_tN_yr: number, exportN_tN_yr: number): { inputs_tN_yr: number, outputs_tN_yr: number, N_balance_tN_yr: number, surplusOrDeficit: string } {
    assertNonNegFinite(foodImport_tN_yr, 'foodImport_tN_yr');
    assertNonNegFinite(feedImport_tN_yr, 'feedImport_tN_yr');
    assertNonNegFinite(atmDeposition_tN_yr, 'atmDeposition_tN_yr');
    assertNonNegFinite(sewageN_tN_yr, 'sewageN_tN_yr');
    assertNonNegFinite(wasteDisposalN_tN_yr, 'wasteDisposalN_tN_yr');
    assertNonNegFinite(exportN_tN_yr, 'exportN_tN_yr');

    const inputs_tN_yr = foodImport_tN_yr + feedImport_tN_yr + atmDeposition_tN_yr;
    const outputs_tN_yr = sewageN_tN_yr + wasteDisposalN_tN_yr + exportN_tN_yr;
    const N_balance_tN_yr = inputs_tN_yr - outputs_tN_yr;
    const surplusOrDeficit = N_balance_tN_yr >= 0 ? 'surplus' : 'deficit';

    return { inputs_tN_yr, outputs_tN_yr, N_balance_tN_yr, surplusOrDeficit };
}

// ===========================================================================
// 14. computePhosphorusUrbanCycle
// ===========================================================================

/**
 * Computes the urban phosphorus cycle balance.
 * P_balance = (waterInflow + foodInflow) - (wastewaterP + solidWasteP + recoveredP).
 *
 * Calcula o ciclo de fosforo urbano (Kalmykova 2012).
 *
 * @param {number} waterInflowP_tP_yr     - P in water supply [tP/yr]
 * @param {number} foodInflowP_tP_yr      - P in food imports [tP/yr]
 * @param {number} wastewaterP_tP_yr      - P discharged via wastewater [tP/yr]
 * @param {number} solidWasteP_tP_yr      - P in solid waste stream [tP/yr]
 * @param {number} recoveredP_tP_yr       - P recovered (struvite, etc.) [tP/yr]
 * @returns {{ inputs_tP_yr: number, outputs_tP_yr: number,
 *             P_balance_tP_yr: number, recoveryRate: number }}
 * @throws {RangeError} if any value is negative or non-finite
 * @reference Kalmykova, Y. et al. (2012). doi:10.2166/wst.2012.374
 */
export function computePhosphorusUrbanCycle(waterInflowP_tP_yr: number, foodInflowP_tP_yr: number, wastewaterP_tP_yr: number, solidWasteP_tP_yr: number, recoveredP_tP_yr: number): { inputs_tP_yr: number, outputs_tP_yr: number, P_balance_tP_yr: number, recoveryRate: number } {
    assertNonNegFinite(waterInflowP_tP_yr, 'waterInflowP_tP_yr');
    assertNonNegFinite(foodInflowP_tP_yr, 'foodInflowP_tP_yr');
    assertNonNegFinite(wastewaterP_tP_yr, 'wastewaterP_tP_yr');
    assertNonNegFinite(solidWasteP_tP_yr, 'solidWasteP_tP_yr');
    assertNonNegFinite(recoveredP_tP_yr, 'recoveredP_tP_yr');

    const inputs_tP_yr = waterInflowP_tP_yr + foodInflowP_tP_yr;
    const outputs_tP_yr = wastewaterP_tP_yr + solidWasteP_tP_yr + recoveredP_tP_yr;
    const P_balance_tP_yr = inputs_tP_yr - outputs_tP_yr;
    const recoveryRate = inputs_tP_yr > 0 ? recoveredP_tP_yr / inputs_tP_yr : 0;

    return { inputs_tP_yr, outputs_tP_yr, P_balance_tP_yr, recoveryRate };
}

// ===========================================================================
// 15. computeUrbanCarbonFootprint
// ===========================================================================

/**
 * Computes the city-scale GHG carbon footprint (Scope 1 + Scope 2).
 * Scope 1: direct combustion emissions.
 * Scope 2: electricity consumption × grid emission factor.
 *
 * Calcula a pegada de carbono urbana escopos 1+2 (GHG Protocol for Cities 2019).
 *
 * @param {number} directCombustion_tCO2e_yr - Scope 1 direct combustion [tCO2e/yr]
 * @param {number} electricityConsumption_MWh_yr - Electricity use [MWh/yr]
 * @param {number} gridEmissionFactor_tCO2e_MWh - Grid emission factor [tCO2e/MWh]
 * @param {number} [population=1]             - Population for per-capita calculation
 * @returns {{ scope1_tCO2e_yr: number, scope2_tCO2e_yr: number,
 *             total_tCO2e_yr: number, perCapita_tCO2e_cap_yr: number }}
 * @throws {RangeError} if any value is negative or non-positive population
 * @reference GHG Protocol for Cities (2019); Peng (2020). doi:10.1016/j.rser.2019.04.002
 */
export function computeUrbanCarbonFootprint(directCombustion_tCO2e_yr: number, electricityConsumption_MWh_yr: number, gridEmissionFactor_tCO2e_MWh: number, population: number = 1): { scope1_tCO2e_yr: number, scope2_tCO2e_yr: number, total_tCO2e_yr: number, perCapita_tCO2e_cap_yr: number } {
    assertNonNegFinite(directCombustion_tCO2e_yr, 'directCombustion_tCO2e_yr');
    assertNonNegFinite(electricityConsumption_MWh_yr, 'electricityConsumption_MWh_yr');
    assertNonNegFinite(gridEmissionFactor_tCO2e_MWh, 'gridEmissionFactor_tCO2e_MWh');
    assertPositiveFinite(population, 'population');

    const scope1_tCO2e_yr = directCombustion_tCO2e_yr;
    const scope2_tCO2e_yr = electricityConsumption_MWh_yr * gridEmissionFactor_tCO2e_MWh;
    const total_tCO2e_yr = scope1_tCO2e_yr + scope2_tCO2e_yr;
    const perCapita_tCO2e_cap_yr = total_tCO2e_yr / population;

    return { scope1_tCO2e_yr, scope2_tCO2e_yr, total_tCO2e_yr, perCapita_tCO2e_cap_yr };
}

// ===========================================================================
// 16. computeBuildingMaterialStock
// ===========================================================================

/**
 * Computes the in-use building material stock (steel, concrete, wood).
 * Uses per-floor-area density coefficients from Tanikawa 2015.
 *
 * Calcula o estoque de materiais de construcao em uso na cidade (Tanikawa 2015).
 *
 * @param {number} totalFloorArea_m2  - Total built floor area [m²]
 * @param {number} [steelKgM2=50]     - Steel intensity [kg/m²]
 * @param {number} [concreteKgM2=850] - Concrete intensity [kg/m²]
 * @param {number} [woodKgM2=30]      - Wood intensity [kg/m²]
 * @returns {{ totalFloorArea_m2: number, steel_t: number, concrete_t: number,
 *             wood_t: number, totalStock_t: number }}
 * @throws {RangeError} if totalFloorArea is non-positive or intensities are negative
 * @reference Tanikawa, H. et al. (2015). doi:10.1016/j.jcp.2015.01.043
 */
export function computeBuildingMaterialStock(totalFloorArea_m2: number, steelKgM2: number = BCS_CONSTANTS.steelKgM2Floor, concreteKgM2: number = BCS_CONSTANTS.concreteKgM2Floor, woodKgM2: number = BCS_CONSTANTS.woodKgM2Floor): { totalFloorArea_m2: number, steel_t: number, concrete_t: number, wood_t: number, totalStock_t: number } {
    assertPositiveFinite(totalFloorArea_m2, 'totalFloorArea_m2');
    assertNonNegFinite(steelKgM2, 'steelKgM2');
    assertNonNegFinite(concreteKgM2, 'concreteKgM2');
    assertNonNegFinite(woodKgM2, 'woodKgM2');

    const steel_t = (totalFloorArea_m2 * steelKgM2) / 1000;
    const concrete_t = (totalFloorArea_m2 * concreteKgM2) / 1000;
    const wood_t = (totalFloorArea_m2 * woodKgM2) / 1000;
    const totalStock_t = steel_t + concrete_t + wood_t;

    return { totalFloorArea_m2, steel_t, concrete_t, wood_t, totalStock_t };
}

// ===========================================================================
// 17. computeUrbanMiningPotential
// ===========================================================================

/**
 * Computes the metal recovery potential from urban mining (secondary sources).
 * Uses end-of-life (EoL) material flow and recovery efficiency.
 *
 * Calcula o potencial de mineracao urbana a partir de fontes secundarias (Graedel 2011).
 *
 * @param {number} eolMaterialFlow_t_yr - End-of-life material flow [t/yr]
 * @param {number} metalContentFraction  - Metal content fraction in EoL material [0–1]
 * @param {number} [recoveryEfficiency=0.85] - Recovery efficiency [0–1]
 * @returns {{ eolMaterialFlow: number, metalContent_t_yr: number,
 *             recoverable_t_yr: number, recoveryEfficiency: number }}
 * @throws {RangeError} if fractions are outside [0,1] or eolMaterialFlow <= 0
 * @reference Graedel, T.E. et al. (2011). doi:10.1021/es2008255
 */
export function computeUrbanMiningPotential(eolMaterialFlow_t_yr: number, metalContentFraction: number, recoveryEfficiency: number = BCS_CONSTANTS.urbanMiningEfficiency): { eolMaterialFlow: number, metalContent_t_yr: number, recoverable_t_yr: number, recoveryEfficiency: number } {
    assertPositiveFinite(eolMaterialFlow_t_yr, 'eolMaterialFlow_t_yr');
    if (
        typeof metalContentFraction !== 'number' ||
        !isFinite(metalContentFraction) ||
        metalContentFraction < 0 ||
        metalContentFraction > 1
    ) {
        throw new RangeError('[BCS] metalContentFraction must be between 0 and 1');
    }
    if (
        typeof recoveryEfficiency !== 'number' ||
        !isFinite(recoveryEfficiency) ||
        recoveryEfficiency < 0 ||
        recoveryEfficiency > 1
    ) {
        throw new RangeError('[BCS] recoveryEfficiency must be between 0 and 1');
    }

    const metalContent_t_yr = eolMaterialFlow_t_yr * metalContentFraction;
    const recoverable_t_yr = metalContent_t_yr * recoveryEfficiency;

    return { eolMaterialFlow: eolMaterialFlow_t_yr, metalContent_t_yr, recoverable_t_yr, recoveryEfficiency };
}

// ===========================================================================
// 18. computeLandfillLifespan
// ===========================================================================

/**
 * Computes remaining landfill lifespan based on capacity and fill rate.
 * remainingLifespan_yr = (totalCapacity - currentFill) / annualFillRate.
 *
 * Calcula a vida util restante de aterro sanitario (EPA AP-42).
 *
 * @param {number} totalCapacity_t     - Total landfill design capacity [tonnes]
 * @param {number} currentFill_t       - Volume already filled [tonnes]
 * @param {number} annualFillRate_t_yr - Annual fill rate [tonnes/yr]
 * @returns {{ remainingCapacity_t: number, annualFillRate: number,
 *             remainingLifespan_yr: number }}
 * @throws {RangeError} if currentFill > totalCapacity, or annualFillRate <= 0
 * @reference US EPA (1997). AP-42: Compilation of Air Emissions Factors.
 */
export function computeLandfillLifespan(totalCapacity_t: number, currentFill_t: number, annualFillRate_t_yr: number): { remainingCapacity_t: number, annualFillRate: number, remainingLifespan_yr: number } {
    assertPositiveFinite(totalCapacity_t, 'totalCapacity_t');
    assertNonNegFinite(currentFill_t, 'currentFill_t');
    assertPositiveFinite(annualFillRate_t_yr, 'annualFillRate_t_yr');
    if (currentFill_t > totalCapacity_t) {
        throw new RangeError('[BCS] currentFill_t cannot exceed totalCapacity_t');
    }

    const remainingCapacity_t = totalCapacity_t - currentFill_t;
    const remainingLifespan_yr = remainingCapacity_t / annualFillRate_t_yr;

    return { remainingCapacity_t, annualFillRate: annualFillRate_t_yr, remainingLifespan_yr };
}

// ===========================================================================
// 19. computeConstructionDemolitionWaste
// ===========================================================================

/**
 * Computes construction and demolition waste (CDW) generation.
 * CDW = builtArea × cdwRate × years.
 *
 * Calcula a geracao de residuos de construcao e demolicao (EU Waste Stats).
 * Usa fracao padrao de 0.12 kg/m²/yr se nao fornecida.
 *
 * @param {number} builtArea_m2          - Total built floor area subject to turnover [m²]
 * @param {number} years                  - Time period [yr]
 * @param {number} [cdwRate_kg_m2_yr=0.12] - CDW generation rate [kg/m²/yr]
 * @returns {{ builtArea_m2: number, years: number, cdwRate_kg_m2_yr: number,
 *             CDW_t: number, CDW_t_yr: number }}
 * @throws {RangeError} if builtArea or years are non-positive or cdwRate is negative
 * @reference EU Waste Statistics Regulation (EC) No 2150/2002.
 */
export function computeConstructionDemolitionWaste(builtArea_m2: number, years: number, cdwRate_kg_m2_yr: number = BCS_CONSTANTS.cdwDefaultKgM2Yr): { builtArea_m2: number, years: number, cdwRate_kg_m2_yr: number, CDW_t: number, CDW_t_yr: number } {
    assertPositiveFinite(builtArea_m2, 'builtArea_m2');
    assertPositiveFinite(years, 'years');
    assertNonNegFinite(cdwRate_kg_m2_yr, 'cdwRate_kg_m2_yr');

    const CDW_t_yr = (builtArea_m2 * cdwRate_kg_m2_yr) / 1000;
    const CDW_t = CDW_t_yr * years;

    return { builtArea_m2, years, cdwRate_kg_m2_yr, CDW_t, CDW_t_yr };
}

// ===========================================================================
// 20. computeSymbiosisSavings
// ===========================================================================

/**
 * Computes eco-industrial symbiosis resource exchange savings.
 * Quantifies energy/material savings when waste from one company
 * becomes input for another (Chertow 2000).
 *
 * Calcula os beneficios de simbiose industrial em parques eco-industriais
 * (Chertow 2000 doi:10.1162/108819800569952).
 *
 * @param {number} wasteExchanged_t_yr    - Mass of waste exchanged [t/yr]
 * @param {number} primaryProductionEnergy_GJ_t - Energy for primary production [GJ/t]
 * @param {number} [exchangeEfficiency=0.75] - Energy recovery efficiency [0–1]
 * @returns {{ wasteExchanged: number, primaryEnergySaved_GJ_yr: number,
 *             actualEnergySaved_GJ_yr: number, exchangeEfficiency: number,
 *             co2Avoided_tCO2e_yr: number }}
 * @throws {RangeError} on invalid inputs
 * @reference Chertow, M.R. (2000). doi:10.1146/annurev.energy.25.1.313
 */
export function computeSymbiosisSavings(wasteExchanged_t_yr: number, primaryProductionEnergy_GJ_t: number, exchangeEfficiency: number = BCS_CONSTANTS.eipEnergyExchangeEfficiency): { wasteExchanged: number, primaryEnergySaved_GJ_yr: number, actualEnergySaved_GJ_yr: number, exchangeEfficiency: number, co2Avoided_tCO2e_yr: number } {
    assertNonNegFinite(wasteExchanged_t_yr, 'wasteExchanged_t_yr');
    assertNonNegFinite(primaryProductionEnergy_GJ_t, 'primaryProductionEnergy_GJ_t');
    if (
        typeof exchangeEfficiency !== 'number' ||
        !isFinite(exchangeEfficiency) ||
        exchangeEfficiency < 0 ||
        exchangeEfficiency > 1
    ) {
        throw new RangeError('[BCS] exchangeEfficiency must be between 0 and 1');
    }

    const primaryEnergySaved_GJ_yr = wasteExchanged_t_yr * primaryProductionEnergy_GJ_t;
    const actualEnergySaved_GJ_yr = primaryEnergySaved_GJ_yr * exchangeEfficiency;
    // CO2 avoided using natural gas default factor (0.0561 tCO2e/GJ, IPCC AR6 WG3)
    const co2Avoided_tCO2e_yr = actualEnergySaved_GJ_yr * BCS_CONSTANTS.co2PerGJNatGas;

    return {
        wasteExchanged: wasteExchanged_t_yr,
        primaryEnergySaved_GJ_yr,
        actualEnergySaved_GJ_yr,
        exchangeEfficiency,
        co2Avoided_tCO2e_yr,
    };
}

console.debug('[BCS:end] urbanMetabolism module loaded - 20 functions, Eurostat MFA 2013 + EW-MFA framework');

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const urbanMetabolismMeta = {
    name: 'urbanMetabolism',
    description: 'Urban Metabolism & Material Flow Analysis',
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
