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
 * Wetland Carbon Flux - Fluxo de carbono em zonas úmidas
 *
 * Referências acadêmicas:
 *  - Mitsch, W.J. & Gosselink, J.G. (2015). Wetlands, 5th ed. Wiley. ISBN 978-1-118-67682-0
 *  - IPCC (2014). 2013 Supplement to the 2006 IPCC Guidelines: Wetlands.
 *    https://www.ipcc-nggip.iges.or.jp/public/wetlands/
 *  - Bridgham, S.D. et al. (2013). Methane emissions from wetlands: biogeochemical,
 *    microbial, and modeling perspectives from local to global scales.
 *    Global Change Biology, 19(5), 1325-1346. DOI: 10.1111/gcb.12131
 *  - Frolking, S. & Roulet, N.T. (2007). Holocene radiative forcing impact of northern
 *    peatland carbon accumulation and methane emissions. Global Change Biology, 13, 1079-1088.
 *    DOI: 10.1111/j.1365-2486.2007.01339.x
 *
 * Zero dependências DOM/IDB/Three.js/fetch.
 * @module wetlandCarbonFlux
 */

// Global Warming Potentials (GWP-100) - IPCC AR6 Table 7.SM.7
// Potenciais de aquecimento global para horizonte de 100 anos
const GWP_CH4 = 27.9; // CH4 (biogenic, including climate-carbon feedbacks)
// eslint-disable-next-line
const GWP_N2O = 273.0; // N2O (not used here but referenced for completeness)

// Sustained Global Warming Potential para CH4 em peatlands (SGWP-500yr)
// Frolking & Roulet 2007 - horizonte de 500 anos para sistemas de turfa
const SGWP_CH4_500 = 45.0;

/**
 * Calculates CH4 ebullition flux (bubble-mediated transport).
 * Calcula fluxo de CH4 por ebulição (transporte por bolhas).
 *
 * Model: empirical relationship with temperature (Bridgham et al. 2013)
 * F_ebullition = F_base * Q10^((T - T_ref) / 10)
 *
 * @param {number} waterTempC - Water temperature (°C) / Temperatura da água
 * @param {number} baseFlux_gCH4_m2_d - Base CH4 flux at reference T (g CH4 m⁻² d⁻¹)
 * @param {number} [tRef=20] - Reference temperature (°C) / Temperatura de referência
 * @param {number} [q10=3.0] - Q10 temperature coefficient (IPCC default for wetlands)
 * @returns {number} CH4 ebullition flux (g CH4 m⁻² d⁻¹)
 */
export function calcCH4EbullitionFlux(waterTempC: any, baseFlux_gCH4_m2_d: any, tRef = 20, q10 = 3.0) {
    if (typeof waterTempC !== 'number' || !isFinite(waterTempC)) {
        throw new TypeError('waterTempC must be a finite number');
    }
    if (typeof baseFlux_gCH4_m2_d !== 'number' || baseFlux_gCH4_m2_d < 0) {
        throw new RangeError('baseFlux_gCH4_m2_d must be a non-negative number');
    }
    if (q10 <= 0) throw new RangeError('q10 must be positive');

    // Arrhenius-like Q10 scaling / escalonamento Q10 tipo Arrhenius
    return baseFlux_gCH4_m2_d * Math.pow(q10, (waterTempC - tRef) / 10);
}

/**
 * Calculates CH4 diffusive flux across water-atmosphere interface.
 * Calcula fluxo difusivo de CH4 na interface água-atmosfera.
 *
 * Fick's First Law applied to piston velocity model (Liss & Slater 1974):
 * F_diff = k_piston * (C_water - C_atm_eq)
 *
 * @param {number} k600_m_d - Piston velocity at Schmidt 600 (m d⁻¹)
 * @param {number} cWater_uM - CH4 concentration in water (µmol L⁻¹ = µM)
 * @param {number} cAtmEq_uM - Atmospheric equilibrium concentration (µmol L⁻¹)
 * @param {number} [schmidtExp=0.5] - Schmidt number exponent (0.5 for rough, 0.67 smooth)
 * @returns {{ flux_gCH4_m2_d: number, saturation_ratio: number }}
 */
export function calcCH4DiffusiveFlux(k600_m_d: any, cWater_uM: any, cAtmEq_uM: any, schmidtExp = 0.5) {
    if (k600_m_d < 0) throw new RangeError('k600_m_d must be non-negative');
    if (cWater_uM < 0) throw new RangeError('cWater_uM must be non-negative');
    if (cAtmEq_uM < 0) throw new RangeError('cAtmEq_uM must be non-negative');
    if (schmidtExp <= 0 || schmidtExp > 1) {
        throw new RangeError('schmidtExp must be between 0 and 1 (exclusive/inclusive)');
    }

    // Concentração delta em mol/m³ (1 µM = 1e-3 mmol/L = 1e-6 mol/L = 1e-3 mol/m³)
    const deltaConcMol_m3 = (cWater_uM - cAtmEq_uM) * 1e-3;

    // Molar mass CH4 = 16.04 g/mol; convert to g CH4 m⁻² d⁻¹
    const flux_gCH4_m2_d = k600_m_d * deltaConcMol_m3 * 16.04;

    return {
        flux_gCH4_m2_d,
        saturation_ratio: cAtmEq_uM > 0 ? cWater_uM / cAtmEq_uM : Infinity,
    };
}

/**
 * Calculates net CO2 sequestration from Net Primary Production.
 * Calcula sequestro líquido de CO2 via Produção Primária Líquida.
 *
 * NECB (Net Ecosystem Carbon Balance) simplified:
 * NECB ≈ NPP_net - R_het - CH4_C_loss
 *
 * @param {number} npp_gC_m2_yr - Net Primary Production (g C m⁻² yr⁻¹)
 * @param {number} rHet_gC_m2_yr - Heterotrophic respiration (g C m⁻² yr⁻¹)
 * @param {number} ch4_gC_m2_yr - CH4 carbon loss (g C m⁻² yr⁻¹)
 * @returns {{ nec_gC_m2_yr: number, co2_seq_gCO2_m2_yr: number }}
 */
export function calcNetCO2Sequestration(npp_gC_m2_yr: any, rHet_gC_m2_yr: any, ch4_gC_m2_yr: any) {
    if (npp_gC_m2_yr < 0) throw new RangeError('npp_gC_m2_yr must be non-negative');
    if (rHet_gC_m2_yr < 0) throw new RangeError('rHet_gC_m2_yr must be non-negative');
    if (ch4_gC_m2_yr < 0) throw new RangeError('ch4_gC_m2_yr must be non-negative');

    // Balanço líquido de carbono do ecossistema (g C m⁻² yr⁻¹)
    const nec_gC_m2_yr = npp_gC_m2_yr - rHet_gC_m2_yr - ch4_gC_m2_yr;

    // Converter C para CO2: razão molar CO2/C = 44/12
    const co2_seq_gCO2_m2_yr = nec_gC_m2_yr * (44 / 12);

    return { nec_gC_m2_yr, co2_seq_gCO2_m2_yr };
}

/**
 * Computes the full carbon balance and GWP-weighted warming impact.
 * Calcula o balanço completo de carbono e impacto de aquecimento ponderado por GWP.
 *
 * CO2eq = CH4_emission * GWP_CH4 - CO2_sequestration
 * Positive = net source; Negative = net sink
 *
 * @param {object} params
 * @param {number} params.ch4Total_gCH4_m2_yr - Total CH4 emission (ebullition + diffusion), g CH4 m⁻² yr⁻¹
 * @param {number} params.co2Sequestered_gCO2_m2_yr - Gross CO2 sequestered (positive = uptake)
 * @param {number} params.co2Respired_gCO2_m2_yr - CO2 from ecosystem respiration
 * @param {boolean} [params.useSGWP=false] - Use sustained GWP-500 for peatlands instead of GWP-100
 * @returns {{ netCO2eq_gCO2eq_m2_yr: number, gwpFactor: number, classification: string }}
 */
export function calcCarbonBalance(params: any) {
    const { ch4Total_gCH4_m2_yr, co2Sequestered_gCO2_m2_yr, co2Respired_gCO2_m2_yr, useSGWP = false } = params;

    if (ch4Total_gCH4_m2_yr < 0) throw new RangeError('ch4Total_gCH4_m2_yr must be non-negative');
    if (co2Sequestered_gCO2_m2_yr < 0) throw new RangeError('co2Sequestered must be non-negative');
    if (co2Respired_gCO2_m2_yr < 0) throw new RangeError('co2Respired must be non-negative');

    const gwpFactor = useSGWP ? SGWP_CH4_500 : GWP_CH4;

    // Converter CH4 para CO2eq / convert CH4 to CO2 equivalents
    const ch4AsCO2eq = ch4Total_gCH4_m2_yr * gwpFactor;

    // Balanço: emissões - sequestro + respiração
    const netCO2eq_gCO2eq_m2_yr = ch4AsCO2eq + co2Respired_gCO2_m2_yr - co2Sequestered_gCO2_m2_yr;

    // Classificação como fonte ou sumidouro de carbono
    let classification;
    if (netCO2eq_gCO2eq_m2_yr < -50) {
        classification = 'strong_sink';
    } else if (netCO2eq_gCO2eq_m2_yr < 0) {
        classification = 'weak_sink';
    } else if (netCO2eq_gCO2eq_m2_yr < 50) {
        classification = 'neutral';
    } else {
        classification = 'source';
    }

    return { netCO2eq_gCO2eq_m2_yr, gwpFactor, classification };
}

/**
 * Estimates the Sustained Global Warming Potential of a wetland ecosystem.
 * Estima o Potencial de Aquecimento Global Sustentado do ecossistema de zona úmida.
 *
 * SGWP accounts for the long-term radiative forcing tradeoff between CH4 and CO2
 * sequestration (Frolking & Roulet 2007). Metric: g CO2eq m⁻² yr⁻¹.
 *
 * @param {number} ch4_gCH4_m2_yr - Annual CH4 emission (g CH4 m⁻² yr⁻¹)
 * @param {number} nec_gC_m2_yr - Net Ecosystem Carbon balance (g C m⁻² yr⁻¹, negative = sink)
 * @param {number} [timeHorizonYr=100] - GWP time horizon (100 or 500 yr)
 * @returns {{ sgwp_gCO2eq_m2_yr: number, ch4Forcing: number, co2Forcing: number }}
 */
export function calcEcosystemSGWP(ch4_gCH4_m2_yr: any, nec_gC_m2_yr: any, timeHorizonYr = 100) {
    if (ch4_gCH4_m2_yr < 0) throw new RangeError('ch4_gCH4_m2_yr must be non-negative');
    if (![100, 500].includes(timeHorizonYr)) {
        throw new RangeError('timeHorizonYr must be 100 or 500');
    }

    const gwp = timeHorizonYr === 500 ? SGWP_CH4_500 : GWP_CH4;

    // Forçamento CH4 em CO2eq
    const ch4Forcing = ch4_gCH4_m2_yr * gwp;

    // Forçamento CO2 do NEC (g C → g CO2eq, negativo = sumidouro)
    const co2Forcing = nec_gC_m2_yr * (44 / 12);

    // SGWP total: positivo = fonte líquida de forçamento
    const sgwp_gCO2eq_m2_yr = ch4Forcing + co2Forcing;

    return { sgwp_gCO2eq_m2_yr, ch4Forcing, co2Forcing };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const wetlandCarbonFluxMeta = {
    name: 'wetlandCarbonFlux',
    description: 'wetlandCarbonFlux',
    category: 'analytics',
    familyTags: ['climate', 'wetland'],
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
