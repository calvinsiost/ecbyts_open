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
 * Soil Carbon Sequestration Rate - RothC simplified model (Coleman & Jenkinson 1996)
 * + IPCC Tier 1 look-up factors.
 *
 * Referências:
 *   Coleman, K. & Jenkinson, D.S. (1996). RothC-26.3 - A model for the turnover of carbon in soil.
 *     In: Powlson et al. (eds) Evaluation of Soil Organic Matter Models. NATO ASI Series I 38, 237–246.
 *     DOI:10.1007/978-3-642-61094-3_17
 *   Jenkinson, D.S. et al. (1990). Model estimates of CO2 emissions from soil in response to global warming.
 *     Nature 351, 304–306. DOI:10.1038/351304a0
 *   IPCC (2006). Guidelines for National GHG Inventories, Vol. 4 Agriculture, Forestry & Other Land Use.
 *     Chapter 5: Cropland. Table 5.5 (Reference SOC stocks) + Table 5.6 (land-use factors).
 */

'use strict';

/**
 * IPCC Tier 1 reference SOC stocks (tC/ha to 30 cm depth) by climate zone.
 * Source: IPCC (2006) Vol.4, Table 5.2.
 * @private
 */
const IPCC_REFERENCE_SOC: Record<string, number> = {
    tropical_moist: 60,
    tropical_dry: 38,
    tropical_montane: 88,
    warm_temperate: 50,
    cool_temperate: 95,
    boreal: 115,
    arctic_tundra: 130,
};

/**
 * IPCC Tier 1 land-use change factors (F_LU) relative to native vegetation.
 * Source: IPCC (2006) Vol.4, Table 5.6.
 * @private
 */
const IPCC_LU_FACTORS: Record<string, number> = {
    native_vegetation: 1.0,
    long_term_cultivated: 0.58,
    degraded: 0.48,
    improved_grassland: 0.97,
    agroforestry: 0.82,
    restored_native: 0.87,
    wetland_restored: 1.08,
};

/**
 * Simplified soil texture decomposition modifier (k multiplier).
 * Fine soils protect organic matter more (slower decomposition).
 * @private
 */
const TEXTURE_K_MODIFIER: Record<string, number> = {
    sandy: 1.2,
    loamy: 1.0,
    clayey: 0.75,
};

interface SOCChangeResult {
    delta_C_tC_ha_yr: number;
    isSequestering: boolean;
    C_next_tC_ha: number;
}

/**
 * Calculates annual change in soil organic carbon (ΔC) using
 * the simplified RothC first-order decay equation.
 *
 * dC/dt = C_input - k × C(t)
 * where k is the net decomposition rate constant (yr⁻¹).
 *
 * For a single annual time-step:
 * C(t+1) = C(t) + C_input - k × C(t)  →  ΔC = C_input - k × C_initial
 *
 * @param {number} C_input_tC_ha_yr - annual carbon input from plant residues (tC/ha/yr), ≥ 0
 * @param {number} k_decomp          - first-order decomposition rate constant (yr⁻¹), 0 < k < 1
 * @param {number} C_initial_tC_ha   - current SOC stock (tC/ha), ≥ 0
 * @returns {{ delta_C_tC_ha_yr: number, isSequestering: boolean, C_next_tC_ha: number }}
 *
 * @see Coleman & Jenkinson (1996) DOI:10.1007/978-3-642-61094-3_17
 */
export function calcSoilOrganicCarbonChange(C_input_tC_ha_yr: number, k_decomp: number, C_initial_tC_ha: number): SOCChangeResult {
    if (C_input_tC_ha_yr < 0) throw new RangeError('calcSoilOrganicCarbonChange: C_input must be >= 0');
    if (k_decomp <= 0 || k_decomp >= 1) throw new RangeError('calcSoilOrganicCarbonChange: k_decomp must be in (0, 1)');
    if (C_initial_tC_ha < 0) throw new RangeError('calcSoilOrganicCarbonChange: C_initial must be >= 0');

    const delta_C_tC_ha_yr = C_input_tC_ha_yr - k_decomp * C_initial_tC_ha;
    const C_next_tC_ha = Math.max(0, C_initial_tC_ha + delta_C_tC_ha_yr);

    return {
        delta_C_tC_ha_yr,
        isSequestering: delta_C_tC_ha_yr > 0,
        C_next_tC_ha,
    };
}

interface PotentialResult {
    potential_tC_ha_yr: number;
    target_SOC_tC_ha: number;
    F_LU: number;
    SOC_ref_tC_ha: number;
}

/**
 * Returns the IPCC Tier 1 maximum sequestration potential for a land-use × climate combination.
 *
 * Rate estimated as 20-year accumulation to reach target SOC:
 * potential = (F_LU × SOC_ref - C_current) / 20  [tC/ha/yr]
 * Capped at 0 if already above target.
 *
 * @param {string} landUse   - key from IPCC_LU_FACTORS
 * @param {string} climate   - key from IPCC_REFERENCE_SOC
 * @param {string} texture   - key from TEXTURE_K_MODIFIER ('sandy'|'loamy'|'clayey')
 * @param {number} [C_current_tC_ha=0] - current SOC stock for relative potential calc
 * @returns {{ potential_tC_ha_yr: number, target_SOC_tC_ha: number, F_LU: number, SOC_ref_tC_ha: number }}
 *
 * @see IPCC (2006) Vol.4 Table 5.2 + 5.6
 */
export function calcCarbonSequestrationPotential(landUse: string, climate: string, texture: string, C_current_tC_ha: number = 0): PotentialResult {
    const F_LU = IPCC_LU_FACTORS[landUse];
    if (F_LU === undefined) {
        throw new TypeError(
            `calcCarbonSequestrationPotential: unknown landUse '${landUse}'. ` +
                `Valid: ${Object.keys(IPCC_LU_FACTORS).join(', ')}`,
        );
    }
    const SOC_ref = IPCC_REFERENCE_SOC[climate];
    if (SOC_ref === undefined) {
        throw new TypeError(
            `calcCarbonSequestrationPotential: unknown climate '${climate}'. ` +
                `Valid: ${Object.keys(IPCC_REFERENCE_SOC).join(', ')}`,
        );
    }
    const k_mod = TEXTURE_K_MODIFIER[texture];
    if (k_mod === undefined) {
        throw new TypeError(
            `calcCarbonSequestrationPotential: unknown texture '${texture}'. ` +
                `Valid: ${Object.keys(TEXTURE_K_MODIFIER).join(', ')}`,
        );
    }

    const target_SOC_tC_ha = F_LU * SOC_ref * (1 / k_mod); // texture modifies effective capacity
    const gap = Math.max(0, target_SOC_tC_ha - C_current_tC_ha);
    const potential_tC_ha_yr = gap / 20; // 20-year accumulation horizon (IPCC default)

    return { potential_tC_ha_yr, target_SOC_tC_ha, F_LU, SOC_ref_tC_ha: SOC_ref };
}

interface EquilibriumResult {
    C_eq_tC_ha: number;
}

/**
 * Calculates the equilibrium SOC stock for a given input rate and decomposition constant.
 *
 * At equilibrium: dC/dt = 0 → C_eq = C_input / k
 *
 * @param {number} C_input - annual carbon input (tC/ha/yr), ≥ 0
 * @param {number} k       - decomposition rate constant (yr⁻¹), 0 < k < 1
 * @returns {{ C_eq_tC_ha: number }}
 *
 * @see Jenkinson et al. (1990) DOI:10.1038/351304a0
 */
export function calcEquilibriumSOC(C_input: number, k: number): EquilibriumResult {
    if (C_input < 0) throw new RangeError('calcEquilibriumSOC: C_input must be >= 0');
    if (k <= 0 || k >= 1) throw new RangeError('calcEquilibriumSOC: k must be in (0, 1)');
    return { C_eq_tC_ha: C_input / k };
}

/**
 * Classifies carbon sequestration rate.
 *
 * @param {number} rate_tC_ha_yr - annual carbon sequestration rate (tC/ha/yr)
 * @returns {'negative'|'low'|'moderate'|'high'|'very_high'}
 *
 * Thresholds from IPCC (2006) expert ranges for managed terrestrial ecosystems.
 */
export function classifySequestrationRate(rate_tC_ha_yr: number): 'negative' | 'low' | 'moderate' | 'high' | 'very_high' {
    if (typeof rate_tC_ha_yr !== 'number' || isNaN(rate_tC_ha_yr)) {
        throw new TypeError('classifySequestrationRate: rate_tC_ha_yr must be a number');
    }
    if (rate_tC_ha_yr < 0) return 'negative';
    if (rate_tC_ha_yr < 0.3) return 'low';
    if (rate_tC_ha_yr < 1.0) return 'moderate';
    if (rate_tC_ha_yr < 2.5) return 'high';
    return 'very_high';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilCarbonSequestrationRateMeta = {
    name: 'soilCarbonSequestrationRate',
    description: 'soilCarbonSequestrationRate',
    category: 'analytics',
    familyTags: ['soil', 'climate', 'hydrocarbon', 'lca'],
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
