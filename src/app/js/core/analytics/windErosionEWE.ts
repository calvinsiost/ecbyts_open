// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

'use strict';

interface SoilErodibilityEntry {
    baseI: number;
    description: string;
}

interface WindErosionRateResult {
    erosionRate_t_ha_yr: number;
    riskClass: string;
}

interface SoilErodibilityResult {
    I: number;
    soilTexture: string;
    description: string;
}

interface VegetativeCoverResult {
    V: number;
    cropType: string;
    residueMass_kg_ha: number;
}

interface RiskClassResult {
    riskClass: string;
    description: string;
    E_t_ha_yr: number;
}

const SOIL_ERODIBILITY_I: Record<string, SoilErodibilityEntry> = {
    clay: { baseI: 25, description: 'Argila (>40% argila)' },
    silty_clay: { baseI: 45, description: 'Argila siltosa' },
    clay_loam: { baseI: 56, description: 'Franco argiloso' },
    silt_loam: { baseI: 86, description: 'Franco siltoso' },
    loam: { baseI: 104, description: 'Franco' },
    sandy_loam: { baseI: 134, description: 'Franco arenoso' },
    loamy_sand: { baseI: 160, description: 'Areia franca' },
    fine_sand: { baseI: 190, description: 'Areia fina' },
    very_fine_sand: { baseI: 210, description: 'Areia muito fina' },
    sand: { baseI: 250, description: 'Areia grossa' },
};

const CROP_V_SLOPE: Record<string, number> = {
    wheat: 0.00045,
    corn: 0.00035,
    sorghum: 0.0004,
    soybean: 0.0003,
    cotton: 0.00025,
    bare: 0.0,
};

/**
 * Calcula a taxa de erosão eólica anual E pela Wind Erosion Equation (WEQ).
 *
 * E = f(I, K, C, L, V)
 * Implementação simplificada do produto de fatores:
 *   E (t/ha/yr) = I * K * C * L_factor * (1 - V_factor)
 *
 * onde:
 *   I = fator de erodibilidade do solo [t/ha/yr]
 *   K = fator de rugosidade da superfície (ridge roughness factor, adimensional; 0–1)
 *   C = fator climático de erosão eólica (climatic erosion factor; adimensional, typical 0.5–2.5)
 *   L = comprimento de sulco ou fator de comprimento de campo [adimensional]
 *   V = fator de proteção vegetativa [adimensional, 0–1]
 *
 * @param {number} I  - Fator de erodibilidade do solo [t/ha/yr], > 0
 * @param {number} K  - Fator de rugosidade (0 = superfície lisa, 1 = máxima rugosidade) [0–1]
 * @param {number} C  - Fator climático de erosão eólica (adimensional), > 0
 * @param {number} L  - Fator de comprimento de campo (adimensional), > 0
 * @param {number} V  - Fator de cobertura vegetativa (0 = nu, 1 = proteção total) [0–1]
 * @returns {{ erosionRate_t_ha_yr: number, riskClass: string }}
 */
export function calcWindErosionRate(I: number, K: number, C: number, L: number, V: number): WindErosionRateResult {
    if (I <= 0) throw new RangeError('I deve ser positivo');
    if (K < 0 || K > 1) throw new RangeError('K deve estar em [0, 1]');
    if (C <= 0) throw new RangeError('C deve ser positivo');
    if (L <= 0) throw new RangeError('L deve ser positivo');
    if (V < 0 || V > 1) throw new RangeError('V deve estar em [0, 1]');

    // Erosão bruta sem cobertura vegetativa
    const E_raw = I * K * C * L;
    // Proteção vegetativa reduz linearmente (Lyles & Tatarko 1986)
    const erosionRate_t_ha_yr = E_raw * (1 - V);
    const { riskClass } = classifyWindErosionRisk(erosionRate_t_ha_yr);

    return { erosionRate_t_ha_yr, riskClass };
}

/**
 * Calcula o fator de erodibilidade I com correção para matéria orgânica e agregação.
 *
 * Redução por matéria orgânica: cada 1% de MO reduz I em ~8% (Chepil 1950).
 * Redução por agregação: para solos bem agregados (>50% agregados estáveis) reduz I em 20%.
 *
 * @param {string} soilTexture    - Textura do solo (ver SOIL_ERODIBILITY_I)
 * @param {number} organicMatter  - Matéria orgânica [%], 0–20
 * @param {number} aggregation    - Grau de agregação [%], 0–100
 * @returns {{ I: number, soilTexture: string, description: string }}
 */
export function calcSoilErodibilityI(soilTexture: string, organicMatter: number, aggregation: number): SoilErodibilityResult {
    const entry = SOIL_ERODIBILITY_I[soilTexture];
    if (!entry) {
        throw new TypeError(
            `Textura de solo inválida: '${soilTexture}'. Válidas: ${Object.keys(SOIL_ERODIBILITY_I).join(', ')}`,
        );
    }
    if (organicMatter < 0 || organicMatter > 20) {
        throw new RangeError('organicMatter deve estar em [0, 20]%');
    }
    if (aggregation < 0 || aggregation > 100) {
        throw new RangeError('aggregation deve estar em [0, 100]%');
    }

    let I = entry.baseI;
    // Redução por matéria orgânica: 8% por ponto percentual de MO
    I *= Math.max(0, 1 - organicMatter * 0.08);
    // Redução por agregação (linear: 0% em bare, 20% redução em 100% agregação)
    I *= Math.max(0, 1 - aggregation * 0.002);

    return { I: Math.max(0, I), soilTexture, description: entry.description };
}

/**
 * Calcula o fator de cobertura vegetativa V com base na massa de resíduo.
 *
 * Equação de Lyles & Tatarko (1986):
 *   V = min(1, slope_por_cultura * residueMass_kg_ha)
 *
 * @param {number} residueMass_kg_ha - Massa de resíduo seco na superfície [kg/ha], >= 0
 * @param {string} cropType          - Tipo de cultura (wheat|corn|sorghum|soybean|cotton|bare)
 * @returns {{ V: number, cropType: string, residueMass_kg_ha: number }}
 */
export function calcVegetativeCover(residueMass_kg_ha: number, cropType: string): VegetativeCoverResult {
    if (residueMass_kg_ha < 0) throw new RangeError('residueMass_kg_ha deve ser >= 0');
    const slope = CROP_V_SLOPE[cropType];
    if (slope === undefined) {
        throw new TypeError(`Cultura inválida: '${cropType}'. Válidas: ${Object.keys(CROP_V_SLOPE).join(', ')}`);
    }

    const V = Math.min(1, slope * residueMass_kg_ha);
    return { V, cropType, residueMass_kg_ha };
}

/**
 * Classifica o risco de erosão eólica por taxa anual.
 *
 * Classes baseadas em Fryrear et al. (1998) RWEQ:
 *   very_low : E < 5 t/ha/yr
 *   low      : 5 <= E < 25 t/ha/yr
 *   moderate : 25 <= E < 80 t/ha/yr
 *   high     : 80 <= E < 200 t/ha/yr
 *   severe   : E >= 200 t/ha/yr
 *
 * @param {number} E_t_ha_yr - Taxa de erosão eólica [t/ha/yr], >= 0
 * @returns {{ riskClass: string, description: string, E_t_ha_yr: number }}
 */
export function classifyWindErosionRisk(E_t_ha_yr: number): RiskClassResult {
    if (E_t_ha_yr < 0) throw new RangeError('E_t_ha_yr deve ser >= 0');

    if (E_t_ha_yr < 5) {
        return {
            riskClass: 'very_low',
            description: 'Erosão muito baixa — sem ação necessária',
            E_t_ha_yr,
        };
    }
    if (E_t_ha_yr < 25) {
        return {
            riskClass: 'low',
            description: 'Erosão baixa — monitoramento periódico',
            E_t_ha_yr,
        };
    }
    if (E_t_ha_yr < 80) {
        return {
            riskClass: 'moderate',
            description: 'Erosão moderada — práticas conservacionistas recomendadas',
            E_t_ha_yr,
        };
    }
    if (E_t_ha_yr < 200) {
        return {
            riskClass: 'high',
            description: 'Erosão alta — quebra-ventos e cobertura vegetal obrigatórios',
            E_t_ha_yr,
        };
    }
    return {
        riskClass: 'severe',
        description: 'Erosão severa — intervenção urgente de controle de erosão',
        E_t_ha_yr,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const windErosionEWEMeta = {
    name: 'windErosionEWE',
    description: 'windErosionEWE',
    category: 'analytics',
    familyTags: ['energy', 'erosion'],
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
