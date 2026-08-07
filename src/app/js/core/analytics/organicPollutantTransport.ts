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
 * Organic Pollutant Transport - Subsurface Fate & Transport Module
 *
 * Módulo puro para modelagem de transporte de poluentes orgânicos em solo/aquífero.
 * Implementa retardação por sorção (Koc × foc), velocidade advectiva do contaminante,
 * dispersão longitudinal e classificação de risco de transporte.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Brusseau, M. L. (1994). "Transport of reactive contaminants in heterogeneous
 *     porous media." Reviews of Geophysics, 32(3), 285–313.
 *     DOI: 10.1029/94WR00693
 *   - Ogata, A. & Banks, R. B. (1961). A solution of the differential equation of
 *     longitudinal dispersion in porous media. USGS Professional Paper 411-A.
 *     DOI: 10.3133/pp411A
 *   - Fetter, C. W. (1999). Contaminant Hydrogeology. 2nd ed. Prentice Hall.
 *     ISBN: 9780137512690
 *   - Karickhoff, S. W. (1981). "Semi-empirical estimation of sorption of hydrophobic
 *     pollutants on natural sediments and soils." Chemosphere, 10(8), 833–846.
 *     DOI: 10.1016/0045-6535(81)90083-7
 */

/**
 * Compute retardation factor R for an organic compound in saturated porous media.
 * Calcula o fator de retardação R de um composto orgânico em meio poroso saturado.
 *
 * R = 1 + (ρ_b / n) × Koc × foc
 *
 * Onde ρ_b = bulk density [g/cm³], n = porosity [-], Koc = organic carbon partition
 * coefficient [mL/g], foc = fraction organic carbon [-]
 *
 * @param {number} rho_b - Bulk density in g/cm³ / Densidade aparente em g/cm³
 * @param {number} Koc - Organic carbon partition coefficient in mL/g / Coeficiente de partição Koc em mL/g
 * @param {number} foc - Fraction of organic carbon (0–1) / Fração de carbono orgânico (0–1)
 * @param {number} porosity - Soil porosity (0–1) / Porosidade do solo (0–1)
 * @returns {{ R: number }} Retardation factor (R >= 1)
 * @throws {TypeError} If any parameter is not a number
 * @throws {RangeError} If porosity or foc out of (0,1], or rho_b/Koc <= 0
 */
export function computeRetardationFactor(rho_b: any, Koc: any, foc: any, porosity: any) {
    if (typeof rho_b !== 'number') throw new TypeError('rho_b must be a number');
    if (typeof Koc !== 'number') throw new TypeError('Koc must be a number');
    if (typeof foc !== 'number') throw new TypeError('foc must be a number');
    if (typeof porosity !== 'number') throw new TypeError('porosity must be a number');
    if (rho_b <= 0) throw new RangeError('rho_b must be > 0');
    if (Koc <= 0) throw new RangeError('Koc must be > 0');
    if (foc < 0 || foc > 1) throw new RangeError('foc must be in [0, 1]');
    if (porosity <= 0 || porosity > 1) throw new RangeError('porosity must be in (0, 1]');

    // Fator de retardação / Retardation factor (Brusseau 1994, eq. 2)
    const R = 1 + (rho_b / porosity) * Koc * foc;

    return { R };
}

/**
 * Compute effective contaminant velocity accounting for retardation.
 * Calcula a velocidade efetiva do contaminante considerando a retardação por sorção.
 *
 * v_contaminant = v_seepage / R
 *
 * @param {number} seepage_velocity_m_d - Seepage (pore-water) velocity in m/day / Velocidade de percolação em m/dia
 * @param {number} R - Retardation factor (>= 1) / Fator de retardação
 * @returns {{ v_contaminant_m_d: number }} Contaminant velocity in m/day
 * @throws {TypeError} If any parameter is not a number
 * @throws {RangeError} If seepage_velocity_m_d <= 0 or R < 1
 */
export function computeAdvectiveVelocity(seepage_velocity_m_d: any, R: any) {
    if (typeof seepage_velocity_m_d !== 'number') throw new TypeError('seepage_velocity_m_d must be a number');
    if (typeof R !== 'number') throw new TypeError('R must be a number');
    if (seepage_velocity_m_d <= 0) throw new RangeError('seepage_velocity_m_d must be > 0');
    if (R < 1) throw new RangeError('R must be >= 1 (retardation cannot accelerate contaminant)');

    const v_contaminant_m_d = seepage_velocity_m_d / R;

    return { v_contaminant_m_d };
}

/**
 * Compute longitudinal hydrodynamic dispersion coefficient.
 * Calcula o coeficiente de dispersão longitudinal hidrodinâmico.
 *
 * D_L = α_L × v   (mechanical dispersion, Ogata & Banks 1961)
 *
 * Onde α_L = longitudinal dispersivity [m], v = seepage velocity [m/d]
 *
 * @param {number} seepage_velocity - Seepage velocity in m/day / Velocidade de percolação em m/dia
 * @param {number} dispersivity_m - Longitudinal dispersivity in metres / Dispersividade longitudinal em metros
 * @returns {{ D_L_m2_d: number }} Longitudinal dispersion coefficient in m²/day
 * @throws {TypeError} If any parameter is not a number
 * @throws {RangeError} If either parameter <= 0
 */
export function computeLongitudinalDispersion(seepage_velocity: any, dispersivity_m: any) {
    if (typeof seepage_velocity !== 'number') throw new TypeError('seepage_velocity must be a number');
    if (typeof dispersivity_m !== 'number') throw new TypeError('dispersivity_m must be a number');
    if (seepage_velocity <= 0) throw new RangeError('seepage_velocity must be > 0');
    if (dispersivity_m <= 0) throw new RangeError('dispersivity_m must be > 0');

    // D_L = alpha_L × v (coeficiente de dispersão mecânica longitudinal)
    const D_L_m2_d = dispersivity_m * seepage_velocity;

    return { D_L_m2_d };
}

/**
 * Classify organic pollutant transport risk based on retardation, half-life and travel distance.
 * Classifica risco de transporte do poluente considerando retardação, meia-vida e distância.
 *
 * Lógica de classificação (Fetter 1999):
 *   - Se o contaminante se degrada antes de atingir o receptor: low
 *   - Se R×half_life_d × v_c >= travel_distance: contaminante pode chegar intacto
 *     - R >= 10: moderate (muito retardado)
 *     - R < 10:  high (mobilidade elevada)
 *
 * @param {number} R - Retardation factor / Fator de retardação
 * @param {number} half_life_d - First-order half-life in days / Meia-vida de primeira ordem em dias
 * @param {number} travel_distance_m - Distance to receptor in metres / Distância até o receptor em metros
 * @returns {{ risk: string }} Risk classification: 'low' | 'moderate' | 'high'
 * @throws {TypeError} If any parameter is not a number
 * @throws {RangeError} If any parameter <= 0
 */
export function classifyTransportRisk(R: any, half_life_d: any, travel_distance_m: any) {
    if (typeof R !== 'number') throw new TypeError('R must be a number');
    if (typeof half_life_d !== 'number') throw new TypeError('half_life_d must be a number');
    if (typeof travel_distance_m !== 'number') throw new TypeError('travel_distance_m must be a number');
    if (R < 1) throw new RangeError('R must be >= 1');
    if (half_life_d <= 0) throw new RangeError('half_life_d must be > 0');
    if (travel_distance_m <= 0) throw new RangeError('travel_distance_m must be > 0');

    // Tempo de trânsito = travel_distance / v_contaminant; assume v_seepage unitária para ranking relativo
    // Lógica baseada em comprimento de degradação: L_deg = v_c × (half_life / ln(2)) × R
    // Usando v_seepage = 1 m/d como referência relativa adimensional
    const v_c_relative = 1.0 / R; // velocidade relativa do contaminante
    const degradation_length_m = v_c_relative * (half_life_d / Math.LN2);

    let risk;
    if (degradation_length_m < travel_distance_m) {
        // Poluente se degrada antes de atingir o receptor / Degrades before reaching receptor
        risk = 'low';
    } else if (R >= 10) {
        // Poluente chega mas é muito retardado / Reaches but highly retarded
        risk = 'moderate';
    } else {
        // Poluente chega com alta mobilidade / High mobility contaminant reaches receptor
        risk = 'high';
    }

    return { risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const organicPollutantTransportMeta = {
    name: 'organicPollutantTransport',
    description: 'organicPollutantTransport',
    category: 'analytics',
    familyTags: ['contamination', 'transport', 'fate_transport'],
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
