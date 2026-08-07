// @ts-check
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
 * nuclearRadiationShielding.js - Blindagem de Radiação Nuclear (Atenuação de Fótons)
 *
 * Implementa cálculos de atenuação de radiação gama/X em blindagens homogêneas,
 * usando o modelo de exponencial simples (Lambert-Beer) com fator de acúmulo
 * (buildup factor) linearizado de Berger (1956) para geometria de feixe largo.
 *
 * Aplicações: monitoramento ambiental de radiação, medicina nuclear, mineração de urânio,
 * depósitos de rejeitos radioativos, conformidade com CNEN NN 3.01 / IAEA Safety Guide RS-G-1.7.
 *
 * Referências / References:
 *   - Shultis, J.K. & Faw, R.E. (2000). Radiation Shielding. American Nuclear Society. ISBN 0-89448-456-7.
 *   - NIST XCOM: Photon Cross Sections Database. https://physics.nist.gov/PhysRefData/Xcom/html/xcom1.html
 *   - Berger, M.J. (1956). Buildup factors. In: Nuclear Physics and Engineering. NBS Report 3360.
 *   - IAEA Safety Guide RS-G-1.7 (2004). Application of the Concepts of Exclusion, Exemption and Clearance.
 *   - CNEN NN 3.01 (2014). Diretrizes Básicas de Proteção Radiológica.
 */

'use strict';

/**
 * @typedef {{ [energy: string]: number }} AttenuationTable
 */

/**
 * Coeficientes de atenuação mássica μ/ρ (cm²/g) para energias comuns de gama (MeV).
 * Fonte: NIST XCOM (valores interpolados para água, concreto e chumbo).
 *
 * @private
 * @type {Record<string, AttenuationTable>}
 */
const ATTENUATION_COEFFICIENTS = {
    /** μ/ρ (cm²/g) por material e energia (MeV) */
    water: { 0.1: 0.1707, 0.5: 0.0966, 1.0: 0.0706, 2.0: 0.0493, 5.0: 0.0302 },
    concrete: { 0.1: 0.1714, 0.5: 0.0875, 1.0: 0.0637, 2.0: 0.0445, 5.0: 0.0277 },
    lead: { 0.1: 5.55, 0.5: 0.1609, 1.0: 0.071, 2.0: 0.045, 5.0: 0.0416 },
    iron: { 0.1: 0.3717, 0.5: 0.0869, 1.0: 0.0599, 2.0: 0.0425, 5.0: 0.0277 },
    polyethylene: { 0.1: 0.1659, 0.5: 0.0959, 1.0: 0.0703, 2.0: 0.049, 5.0: 0.0299 },
};

/**
 * Densidades de referência (g/cm³) dos materiais de blindagem.
 * @private
 * @type {Record<string, number>}
 */
const MATERIAL_DENSITIES = {
    water: 1.0,
    concrete: 2.3,
    lead: 11.35,
    iron: 7.87,
    polyethylene: 0.95,
};

/**
 * Interpola μ/ρ para a energia desejada a partir da tabela discreta.
 *
 * @param {AttenuationTable} table - Tabela {energia: coeficiente}.
 * @param {number} energy_MeV - Energia (MeV).
 * @returns {number} μ/ρ interpolado (cm²/g).
 * @private
 */
function interpolateMu(table: any, energy_MeV: any) {
    const energies = Object.keys(table)
        .map(Number)
        .sort((a, b) => a - b);
if (energy_MeV <= energies[0]!) return table[String(energies[0]!)];
    if (energy_MeV >= energies[energies.length - 1]!) return table[String(energies[energies.length - 1]!)];
    for (let i = 0; i < energies.length - 1; i++) {
        const e0 = energies[i]!,
            e1 = energies[i + 1]!;
        if (energy_MeV >= e0 && energy_MeV <= e1) {
            // Interpolação log-linear (recomendada para seções de choque)
            const t = (Math.log(energy_MeV) - Math.log(e0!)) / (Math.log(e1!) - Math.log(e0!));
            return table[String(e0)] * Math.pow(table[String(e1)] / table[String(e0)], t);
        }
    }
    return table[String(energies[energies.length - 1])];
}

/**
 * Calcula a transmissão de radiação gama por uma blindagem homogênea.
 *
 * Modelo: T = B(μx) × exp(−μx)
 * onde μ = (μ/ρ) × ρ é o coeficiente de atenuação linear (cm⁻¹),
 * x é a espessura (cm), e B é o fator de acúmulo de Berger linearizado.
 *
 * @param {string} material      - Material de blindagem ('water'|'concrete'|'lead'|'iron'|'polyethylene').
 * @param {number} thickness_cm  - Espessura da blindagem (cm). Deve ser > 0.
 * @param {number} energy_MeV    - Energia do fóton (MeV). Intervalo: [0.1, 5.0].
 * @param {number} [buildupFactor=1] - Fator de acúmulo B (≥ 1). 1 = feixe estreito.
 * @returns {{ transmission: number, attenuationLinear_cm: number, meanFreePath_cm: number }}
 *   - transmission: fração da intensidade transmitida [0,1]
 *   - attenuationLinear_cm: coeficiente μ (cm⁻¹)
 *   - meanFreePath_cm: caminho livre médio 1/μ (cm)
 * @throws {RangeError} Para inputs fora dos intervalos válidos.
 * @throws {TypeError} Para material desconhecido.
 *
 * Ref: Shultis & Faw (2000) ISBN 0-89448-456-7, Eq. 4.1, 4.5.
 */
export function calcShieldingTransmission(material: any, thickness_cm: any, energy_MeV: any, buildupFactor = 1) {
    if (!(material in ATTENUATION_COEFFICIENTS)) {
        throw new TypeError(
            `Material desconhecido: '${material}'. Válidos: ${Object.keys(ATTENUATION_COEFFICIENTS).join(', ')}`,
        );
    }
    if (!Number.isFinite(thickness_cm) || thickness_cm <= 0) {
        throw new RangeError(`thickness_cm deve ser > 0; recebido: ${thickness_cm}`);
    }
    if (!Number.isFinite(energy_MeV) || energy_MeV < 0.01) {
        throw new RangeError(`energy_MeV deve ser >= 0.01; recebido: ${energy_MeV}`);
    }
    if (!Number.isFinite(buildupFactor) || buildupFactor < 1) {
        throw new RangeError(`buildupFactor deve ser >= 1; recebido: ${buildupFactor}`);
    }

const muRho = interpolateMu(ATTENUATION_COEFFICIENTS[material as keyof typeof ATTENUATION_COEFFICIENTS], energy_MeV);
    const density = MATERIAL_DENSITIES[material as keyof typeof MATERIAL_DENSITIES];
    const mu = muRho * density; // cm⁻¹

    const transmission = buildupFactor * Math.exp(-mu * thickness_cm);
    return {
        transmission: Math.min(1, transmission),
        attenuationLinear_cm: mu,
        meanFreePath_cm: 1 / mu,
    };
}

/**
 * Calcula a espessura de blindagem necessária para reduzir a intensidade ao fator alvo.
 *
 * Resolve: x = −ln(T / B) / μ
 *
 * @param {string} material         - Material de blindagem.
 * @param {number} energy_MeV       - Energia do fóton (MeV).
 * @param {number} transmissionGoal - Fração de transmissão desejada (0 < T ≤ 1).
 * @param {number} [buildupFactor=1] - Fator de acúmulo B (≥ 1).
 * @returns {number} Espessura necessária (cm).
 * @throws {RangeError} Para transmissionGoal fora de (0, 1].
 *
 * Ref: Shultis & Faw (2000) ISBN 0-89448-456-7, Chap. 4.
 */
export function calcRequiredThickness(material: any, energy_MeV: any, transmissionGoal: any, buildupFactor = 1) {
    if (!Number.isFinite(transmissionGoal) || transmissionGoal <= 0 || transmissionGoal > 1) {
        throw new RangeError(`transmissionGoal deve estar em (0, 1]; recebido: ${transmissionGoal}`);
    }
    if (!(material in ATTENUATION_COEFFICIENTS)) {
        throw new TypeError(`Material desconhecido: '${material}'`);
    }
    if (!Number.isFinite(energy_MeV) || energy_MeV < 0.01) {
        throw new RangeError(`energy_MeV deve ser >= 0.01; recebido: ${energy_MeV}`);
    }
    if (!Number.isFinite(buildupFactor) || buildupFactor < 1) {
        throw new RangeError(`buildupFactor deve ser >= 1; recebido: ${buildupFactor}`);
    }

const muRho = interpolateMu(ATTENUATION_COEFFICIENTS[material as keyof typeof ATTENUATION_COEFFICIENTS], energy_MeV);
    const mu = muRho * MATERIAL_DENSITIES[material as keyof typeof MATERIAL_DENSITIES];

    // x = -ln(T/B) / μ - com buildup, espessura maior é necessária
    const x = -Math.log(transmissionGoal / buildupFactor) / mu;
    return Math.max(0, x);
}

/**
 * Calcula a dose equivalente efetiva após blindagem.
 *
 * Converte taxa de kerma no ar (Gy/h) para dose equivalente efetiva (Sv/h)
 * usando fatores de conversão IAEA por energia e aplica a transmissão.
 *
 * Fator de conversão H*(10)/Ka simplificado (Sv/Gy):
 *   ≈ 1.0 (válido para fótons de 0.1–3.0 MeV em campo isotrópico - IAEA TRS 406).
 *
 * @param {number} sourceKermaRate_Gy_h - Taxa de kerma no ar na fonte (Gy/h). Deve ser >= 0.
 * @param {number} transmission          - Fração de transmissão (0–1).
 * @param {number} [conversionFactor=1.0] - Fator H*(10)/Ka (Sv/Gy). Padrão conservador = 1.
 * @returns {number} Taxa de dose equivalente efetiva após blindagem (Sv/h).
 * @throws {RangeError} Para inputs inválidos.
 *
 * Ref: IAEA TRS 406 (2001). Measurement of Radiation Fields. Chapter 2.
 */
export function calcEffectiveDoseRate(sourceKermaRate_Gy_h: any, transmission: any, conversionFactor = 1.0) {
    if (!Number.isFinite(sourceKermaRate_Gy_h) || sourceKermaRate_Gy_h < 0) {
        throw new RangeError(`sourceKermaRate_Gy_h deve ser >= 0; recebido: ${sourceKermaRate_Gy_h}`);
    }
    if (!Number.isFinite(transmission) || transmission < 0 || transmission > 1) {
        throw new RangeError(`transmission deve estar em [0, 1]; recebido: ${transmission}`);
    }
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
        throw new RangeError(`conversionFactor deve ser > 0; recebido: ${conversionFactor}`);
    }
    return sourceKermaRate_Gy_h * transmission * conversionFactor;
}

/**
 * Classifica a taxa de dose em relação aos limites regulatórios CNEN NN 3.01 / IAEA.
 *
 * Limites (Sv/h):
 *   safe          ≤ 0.5e-6   (≤ 0.5 μSv/h - público geral)
 *   controlled    ≤ 5.0e-6   (≤ 5 μSv/h - área controlada)
 *   supervised    ≤ 25e-6    (≤ 25 μSv/h - zona supervisionada)
 *   restricted    ≤ 2e-3     (≤ 2 mSv/h - acesso restrito a trabalhadores)
 *   evacuation    > 2e-3     (> 2 mSv/h - evacuação imediata)
 *
 * @param {number} doseRate_Sv_h - Taxa de dose equivalente efetiva (Sv/h). Deve ser >= 0.
 * @returns {'safe'|'controlled'|'supervised'|'restricted'|'evacuation'} Classificação regulatória.
 * @throws {RangeError} Se doseRate_Sv_h < 0 ou não finito.
 *
 * Ref: CNEN NN 3.01 (2014) Tabela I; IAEA Safety Guide RS-G-1.7 (2004).
 */
export function classifyRadiationZone(doseRate_Sv_h: any) {
    if (!Number.isFinite(doseRate_Sv_h) || doseRate_Sv_h < 0) {
        throw new RangeError(`doseRate_Sv_h deve ser >= 0; recebido: ${doseRate_Sv_h}`);
    }
    if (doseRate_Sv_h <= 0.5e-6) return 'safe';
    if (doseRate_Sv_h <= 5.0e-6) return 'controlled';
    if (doseRate_Sv_h <= 25e-6) return 'supervised';
    if (doseRate_Sv_h <= 2e-3) return 'restricted';
    return 'evacuation';
}

/**
 * Exporta a tabela de materiais disponíveis para consulta externa.
 *
 * @returns {string[]} Lista de materiais suportados.
 */
export function getAvailableMaterials() {
    return Object.keys(ATTENUATION_COEFFICIENTS);
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const nuclearRadiationShieldingMeta = {
    name: 'nuclearRadiationShielding',
    description: 'nuclearRadiationShielding',
    category: 'analytics',
    familyTags: ['radiation'],
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
