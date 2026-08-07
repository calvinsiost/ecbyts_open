// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance by Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

'use strict';

interface PGCoeff {
    ay: number;
    by: number;
    az: number;
    bz: number;
}

interface GaussianResult {
    concentration_mg_m3: number;
}

interface HazardZoneResult {
    hazardRadius_m: number;
    stabilityClass: string;
}

interface ToxicDoseResult {
    toxicDose: number;
    unit: string;
}

interface RiskLevelResult {
    riskLevel: 'safe' | 'concern' | 'danger' | 'immediately_dangerous';
    description: string;
}

interface DispersionResult {
    sigmaY_m: number;
    sigmaZ_m: number;
}

/**
 * Coeficientes de dispersão de Pasquill-Gifford por classe de estabilidade.
 * sigma_y = ay * x^by, sigma_z = az * x^bz (x em metros, sigma em metros).
 * Válidos para x ∈ [100, 10000] m - zona rural/suburbana.
 *
 * @see Turner (1994) Table 3-2
 */
const PG_COEFFICIENTS: Record<string, PGCoeff> = {
    A: { ay: 0.22, by: 0.896, az: 0.2, bz: 0.89 },
    B: { ay: 0.16, by: 0.896, az: 0.12, bz: 0.89 },
    C: { ay: 0.11, by: 0.896, az: 0.08, bz: 0.89 },
    D: { ay: 0.08, by: 0.896, az: 0.06, bz: 0.89 },
    E: { ay: 0.06, by: 0.896, az: 0.03, bz: 0.89 },
    F: { ay: 0.04, by: 0.896, az: 0.016, bz: 0.89 },
};

/**
 * Calcula concentração em nível do solo no eixo central do plume Gaussiano
 * para fonte elevada estacionária.
 *
 * Equação: C = (Q / (pi * sigma_y * sigma_z * u)) *
 *              exp(-y² / (2*sigma_y²)) *
 *              exp(-H² / (2*sigma_z²))
 *
 * @param {number} Q_kg_s   - Taxa de emissão [kg/s], > 0
 * @param {number} u_m_s    - Velocidade do vento na altura da fonte [m/s], > 0
 * @param {number} sigmaY   - Dispersão lateral [m], > 0
 * @param {number} sigmaZ   - Dispersão vertical [m], > 0
 * @param {number} y        - Distância lateral do eixo central [m]
 * @param {number} H        - Altura efetiva da fonte [m], >= 0
 * @returns {{ concentration_mg_m3: number }} Concentração em mg/m³
 *
 * @example
 * calcGaussianGroundConcentration(0.1, 3, 50, 20, 0, 10)
 * // => { concentration_mg_m3: ... }
 */
export function calcGaussianGroundConcentration(Q_kg_s: number, u_m_s: number, sigmaY: number, sigmaZ: number, y: number, H: number): GaussianResult {
    if (Q_kg_s <= 0) throw new RangeError('Q_kg_s deve ser positivo');
    if (u_m_s <= 0) throw new RangeError('u_m_s deve ser positivo');
    if (sigmaY <= 0) throw new RangeError('sigmaY deve ser positivo');
    if (sigmaZ <= 0) throw new RangeError('sigmaZ deve ser positivo');
    if (H < 0) throw new RangeError('H deve ser >= 0');

    const lateralTerm = Math.exp(-(y * y) / (2 * sigmaY * sigmaY));
    const verticalTerm = Math.exp(-(H * H) / (2 * sigmaZ * sigmaZ));
    const C_kg_m3 = (Q_kg_s / (Math.PI * sigmaY * sigmaZ * u_m_s)) * lateralTerm * verticalTerm;
    const concentration_mg_m3 = C_kg_m3 * 1e6;

    return { concentration_mg_m3 };
}

/**
 * Estima raio da zona de perigo para concentração >= IDLH no nível do solo
 * em y=0 usando aproximação iterativa para distância downwind x.
 *
 * @param {number} Q_kg_s       - Taxa de emissão [kg/s], > 0
 * @param {number} u_m_s        - Velocidade do vento [m/s], > 0
 * @param {string} stability    - Classe de estabilidade Pasquill-Gifford ('A'–'F')
 * @param {number} IDLH_mg_m3   - Imediatamente Perigoso à Vida e Saúde [mg/m³], > 0
 * @returns {{ hazardRadius_m: number, stabilityClass: string }} Raio da zona de perigo
 */
export function calcHazardZoneRadius(Q_kg_s: number, u_m_s: number, stability: string, IDLH_mg_m3: number): HazardZoneResult {
    if (Q_kg_s <= 0) throw new RangeError('Q_kg_s deve ser positivo');
    if (u_m_s <= 0) throw new RangeError('u_m_s deve ser positivo');
    if (IDLH_mg_m3 <= 0) throw new RangeError('IDLH_mg_m3 deve ser positivo');

    const coef = (PG_COEFFICIENTS as Record<string, PGCoeff>)[
        stability
    ];
    if (!coef) {
        throw new TypeError(`Classe de estabilidade inválida: ${stability}. Use A-F`);
    }

    const IDLH_kg_m3 = IDLH_mg_m3 / 1e6;
    const xSteps = [100, 200, 500, 1000, 2000, 3000, 5000, 7000, 10000];
    let hazardRadius_m = 0;

    for (const x of xSteps) {
        const sy = coef.ay * Math.pow(x, coef.by);
        const sz = coef.az * Math.pow(x, coef.bz);
        const C = Q_kg_s / (Math.PI * sy * sz * u_m_s);
        if (C >= IDLH_kg_m3) {
            hazardRadius_m = x;
        }
    }

    return { hazardRadius_m, stabilityClass: stability };
}

/**
 * Calcula dose tóxica acumulada pela Lei de Haber generalizada (Lei de ten Berge).
 *
 * Dose = C^n * t
 * Para n=1: Lei de Haber clássica (dose = concentração × tempo).
 * Para n>1: modelos para gases com efeitos cumulativos não-lineares.
 *
 * @param {number} concentration_mg_m3 - Concentração ambiental [mg/m³], > 0
 * @param {number} duration_min        - Duração da exposição [min], > 0
 * @param {number} [n=1]               - Expoente de Haber (tipicamente 1.0–3.0)
 * @returns {{ toxicDose: number, unit: string }} Dose tóxica (mg/m³)^n · min
 */
export function calcToxicDose(concentration_mg_m3: number, duration_min: number, n: number = 1): ToxicDoseResult {
    if (concentration_mg_m3 <= 0) throw new RangeError('concentration_mg_m3 deve ser positivo');
    if (duration_min <= 0) throw new RangeError('duration_min deve ser positivo');
    if (n <= 0) throw new RangeError('n deve ser positivo');

    const toxicDose = Math.pow(concentration_mg_m3, n) * duration_min;
    return { toxicDose, unit: `(mg/m3)^${n}·min` };
}

/**
 * Classifica risco tóxico com base nos limites ERPG-2 e ERPG-3.
 *
 * ERPG-1: efeito leve (não implementado - requer dados adicionais)
 * ERPG-2: efeitos irreversíveis ou incapacitantes; limiar para evacuação
 * ERPG-3: ameaça à vida
 *
 * @param {number} concentration_mg_m3 - Concentração estimada [mg/m³]
 * @param {number} ERPG2_mg_m3         - Limite ERPG-2 para o composto [mg/m³]
 * @param {number} ERPG3_mg_m3         - Limite ERPG-3 para o composto [mg/m³]
 * @returns {{ riskLevel: string, description: string }}
 *   'safe' | 'concern' | 'danger' | 'immediately_dangerous'
 */
export function classifyToxicRisk(concentration_mg_m3: number, ERPG2_mg_m3: number, ERPG3_mg_m3: number): RiskLevelResult {
    if (ERPG2_mg_m3 <= 0) throw new RangeError('ERPG2_mg_m3 deve ser positivo');
    if (ERPG3_mg_m3 <= ERPG2_mg_m3) {
        throw new RangeError('ERPG3_mg_m3 deve ser maior que ERPG2_mg_m3');
    }
    if (concentration_mg_m3 < 0) throw new RangeError('concentration_mg_m3 não pode ser negativo');

    if (concentration_mg_m3 >= ERPG3_mg_m3) {
        return {
            riskLevel: 'immediately_dangerous',
            description: 'Acima de ERPG-3 — risco de morte. Evacuação imediata.',
        };
    }
    if (concentration_mg_m3 >= ERPG2_mg_m3) {
        return {
            riskLevel: 'danger',
            description: 'Acima de ERPG-2 — efeitos irreversíveis possíveis. Evacuação recomendada.',
        };
    }
    if (concentration_mg_m3 >= ERPG2_mg_m3 * 0.1) {
        return {
            riskLevel: 'concern',
            description: 'Abaixo de ERPG-2 mas detectable — monitoramento contínuo necessário.',
        };
    }
    return {
        riskLevel: 'safe',
        description: 'Concentração abaixo do nível de preocupação operacional.',
    };
}

/**
 * Calcula sigma_y e sigma_z para distância x usando coeficientes de Pasquill-Gifford.
 *
 * @param {number} x            - Distância downwind [m], > 0
 * @param {string} stability    - Classe 'A'–'F'
 * @returns {{ sigmaY_m: number, sigmaZ_m: number }}
 */
export function calcDispersionCoefficients(x: number, stability: string): DispersionResult {
    if (x <= 0) throw new RangeError('x deve ser positivo');
    const coef = (PG_COEFFICIENTS as Record<string, PGCoeff>)[
        stability
    ];
    if (!coef) throw new TypeError(`Classe de estabilidade inválida: ${stability}`);

    return {
        sigmaY_m: coef.ay * Math.pow(x, coef.by),
        sigmaZ_m: coef.az * Math.pow(x, coef.bz),
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const toxicGasDispersionModelMeta = {
    name: 'toxicGasDispersionModel',
    description: 'toxicGasDispersionModel',
    category: 'analytics',
    familyTags: ['chemical', 'fate_transport'],
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
