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
 * Groundwater Remediation Model - pump-and-treat, air sparging, oxidação química e
 * classificação de viabilidade de remediação de águas subterrâneas.
 *
 * Referências:
 *   Javandel, I. & Tsang, C.F. (1986). Capture-zone type curves: a tool for
 *     aquifer cleanup. Ground Water, 24(5), 616–625.
 *     DOI: 10.1029/WR022i001p00058
 *   Johnson, R.L. et al. (1993). In situ sparging of trichloroethylene-contaminated
 *     groundwater. Environmental Science & Technology, 27(12).
 *     DOI: 10.1021/es00023a001
 */

/**
 * Calcula a largura da zona de captura do sistema pump-and-treat.
 * W = Q / (K × i × b) - baseado na teoria de Javandel & Tsang (1986).
 *
 * @param {number} hydraulic_conductivity_m_s - Condutividade hidráulica em m/s
 * @param {number} gradient                   - Gradiente hidráulico adimensional (m/m)
 * @param {number} aquifer_thickness_m        - Espessura do aquífero em metros
 * @param {number} pumping_rate_m3_s          - Vazão de bombeamento em m³/s
 * @returns {{ capture_zone_width_m: number }}
 * @throws {TypeError}  se qualquer argumento não for número
 * @throws {RangeError} se valores não forem positivos
 */
export function computePumpAndTreatCapture(
    hydraulic_conductivity_m_s: any,
    gradient: any,
    aquifer_thickness_m: any,
    pumping_rate_m3_s: any,
) {
    const args = { hydraulic_conductivity_m_s, gradient, aquifer_thickness_m, pumping_rate_m3_s };
    for (const [name, val] of Object.entries(args)) {
        if (typeof val !== 'number') {
            throw new TypeError(`${name} deve ser um número`);
        }
        if (val <= 0) {
            throw new RangeError(`${name} deve ser positivo`);
        }
    }

    // Largura de captura: W = Q / (K × i × b)
    const capture_zone_width_m = pumping_rate_m3_s / (hydraulic_conductivity_m_s * gradient * aquifer_thickness_m);
    return { capture_zone_width_m };
}

/**
 * Calcula o raio de influência do air sparging com base em correlação empírica.
 * R = 2.0 × sqrt(k) × P^0.5 onde k em darcy (Johnson 1993, DOI: 10.1021/es00023a001).
 *
 * @param {number} injection_pressure_kPa  - Pressão de injeção em kPa
 * @param {number} soil_permeability_darcy - Permeabilidade do solo em darcy
 * @returns {{ radius_m: number }}
 * @throws {TypeError}  se argumentos não forem números
 * @throws {RangeError} se valores não forem positivos
 */
export function computeAirSpargingRadius(injection_pressure_kPa: any, soil_permeability_darcy: any) {
    if (typeof injection_pressure_kPa !== 'number' || typeof soil_permeability_darcy !== 'number') {
        throw new TypeError('injection_pressure_kPa e soil_permeability_darcy devem ser números');
    }
    if (injection_pressure_kPa <= 0) {
        throw new RangeError('injection_pressure_kPa deve ser positivo');
    }
    if (soil_permeability_darcy <= 0) {
        throw new RangeError('soil_permeability_darcy deve ser positivo');
    }

    // Correlação empírica de Johnson (1993): R = 2.0 × sqrt(k) × P^0.5
    const radius_m = 2.0 * Math.sqrt(soil_permeability_darcy) * Math.sqrt(injection_pressure_kPa);
    return { radius_m };
}

/**
 * Calcula a dose estequiométrica de oxidante para oxidação química in situ (ISCO).
 * massa_oxidante = (massa_contaminante / MW_contaminante) × stoichiometry × MW_oxidante
 *
 * @param {number} contaminant_mass_kg - Massa de contaminante a tratar em kg
 * @param {number} contaminant_MW      - Massa molar do contaminante em g/mol
 * @param {number} oxidant_MW          - Massa molar do oxidante em g/mol
 * @param {number} stoichiometry       - Relação molar oxidante:contaminante (adimensional)
 * @returns {{ oxidant_kg: number }}
 * @throws {TypeError}  se argumentos não forem números
 * @throws {RangeError} se valores não forem positivos
 */
export function computeChemicalOxidationDose(contaminant_mass_kg: any, contaminant_MW: any, oxidant_MW: any, stoichiometry: any) {
    const args = { contaminant_mass_kg, contaminant_MW, oxidant_MW, stoichiometry };
    for (const [name, val] of Object.entries(args)) {
        if (typeof val !== 'number') {
            throw new TypeError(`${name} deve ser um número`);
        }
        if (val <= 0) {
            throw new RangeError(`${name} deve ser positivo`);
        }
    }

    // Conversão: mol_contaminante = massa/MW; mol_oxidante = mol_cont × stoich
    const moles_contaminant = (contaminant_mass_kg * 1000) / contaminant_MW; // mol
    const oxidant_kg = (moles_contaminant * stoichiometry * oxidant_MW) / 1000; // kg
    return { oxidant_kg };
}

/**
 * Classifica a viabilidade de remediação baseada em parâmetros de campo.
 * Lógica baseada em protocolos EPA/ITRC para seleção de tecnologia.
 *
 * @param {number} FS_pump_treat   - Fator de scala/viabilidade pump-and-treat (0-1)
 * @param {number} FS_air_sparging - Fator de scala/viabilidade air sparging (0-1)
 * @param {string} contaminant_type - Tipo de contaminante: 'DNAPL'|'LNAPL'|'VOC'|'metals'
 * @returns {{ primary_method: string, feasibility: 'feasible'|'challenging'|'difficult' }}
 * @throws {TypeError}  se argumentos tiverem tipos inválidos
 * @throws {RangeError} se fatores estiverem fora do intervalo [0, 1]
 */
export function classifyRemediationFeasibility(FS_pump_treat: any, FS_air_sparging: any, contaminant_type: any) {
    if (typeof FS_pump_treat !== 'number' || typeof FS_air_sparging !== 'number') {
        throw new TypeError('FS_pump_treat e FS_air_sparging devem ser números');
    }
    if (typeof contaminant_type !== 'string') {
        throw new TypeError('contaminant_type deve ser string');
    }
    if (FS_pump_treat < 0 || FS_pump_treat > 1) {
        throw new RangeError('FS_pump_treat deve estar em [0, 1]');
    }
    if (FS_air_sparging < 0 || FS_air_sparging > 1) {
        throw new RangeError('FS_air_sparging deve estar em [0, 1]');
    }

    const VALID_TYPES = ['DNAPL', 'LNAPL', 'VOC', 'metals'];
    if (!VALID_TYPES.includes(contaminant_type)) {
        throw new RangeError(`contaminant_type inválido — use: ${VALID_TYPES.join(', ')}`);
    }

    // Seleção de método primário por tipo de contaminante (EPA 2004, EPA/600/R-04/031)
    /** @type {'pump_and_treat'|'air_sparging'} */
    let primary_method;
    if (contaminant_type === 'DNAPL') {
        primary_method = 'pump_and_treat';
    } else if (contaminant_type === 'VOC') {
        primary_method = 'air_sparging';
    } else if (contaminant_type === 'LNAPL') {
        primary_method = 'pump_and_treat';
    } else {
        primary_method = 'pump_and_treat'; // metals: remoção física preferida
    }

    const fs = primary_method === 'air_sparging' ? FS_air_sparging : FS_pump_treat;
    /** @type {'feasible'|'challenging'|'difficult'} */
    let feasibility;
    if (fs >= 0.7) {
        feasibility = 'feasible';
    } else if (fs >= 0.4) {
        feasibility = 'challenging';
    } else {
        feasibility = 'difficult';
    }

    return { primary_method, feasibility };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const groundwaterRemediationModelMeta = {
    name: 'groundwaterRemediationModel',
    description: 'groundwaterRemediationModel',
    category: 'analytics',
    familyTags: ['groundwater', 'water', 'remediation'],
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
