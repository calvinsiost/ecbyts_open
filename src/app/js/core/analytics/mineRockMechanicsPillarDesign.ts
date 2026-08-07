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
// Application: EHS & Mining - Mine Rock Mechanics / Pillar Design
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Mine Rock Mechanics - Pillar Design Module
 *
 * Módulo puro implementando o dimensionamento de pilares em mineração
 * subterrânea por meio de equações clássicas de resistência (Salamon-Munro),
 * carga tributária, fator de segurança e classificação de estabilidade.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Salamon, M. D. G. & Munro, A. H. (1967). "A study of the strength of
 *     coal pillars." Journal of the South African Institute of Mining and
 *     Metallurgy, 68, 55–67.
 *     (fórmula empírica de resistência de pilares de carvão)
 *   - Lunder, P. J. & Pakalnis, R. (1997). "Determining the strength of
 *     hard rock mine pillars." CIM Bulletin, 90(1014), 51–55.
 *     (extensão da fórmula para pilares de rocha dura)
 *   - Brady, B. H. G. & Brown, E. T. (2006). "Rock Mechanics for Underground
 *     Mining." 3rd ed. Springer. ISBN 978-1-4020-2064-3.
 *     (teoria tributária de carga, FS, classificação de estabilidade)
 *
 * @module mineRockMechanicsPillarDesign
 */

'use strict';

// Local interface (substitui import('../../../../types/app/analytics-library.js'))
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
        citation?: string;
    };
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    library?: { published: boolean; priceECBT?: number; licenseRef?: string };
}

/**
 * Calcula a resistência de um pilar usando a fórmula empírica de Salamon-Munro
 * (1967) para pilares de carvão, amplamente referenciada para rocha em geral.
 *
 * Equação: sigma_p = K * (w^a / h^b)
 * Para carvão sul-africano: K = 7.176 MPa, a = 0.46, b = 0.66
 * Para rocha dura pode-se calibrar K conforme UCS (Lunder & Pakalnis, 1997)
 *
 * @param pillarWidth_m  Largura do pilar [m] (dimensão crítica)
 * @param pillarHeight_m  Altura do pilar [m]
 * @param K_MPa  Constante de resistência do material [MPa]
 * @param a  Expoente de largura (Salamon-Munro)
 * @param b  Expoente de altura (Salamon-Munro)
 * @throws {RangeError} Se dimensões do pilar forem não-positivas
 */
export function calcPillarStrength(
    pillarWidth_m: number,
    pillarHeight_m: number,
    K_MPa = 7.176,
    a = 0.46,
    b = 0.66,
): { pillarStrength_MPa: number; widthToHeightRatio: number; K_MPa: number; a: number; b: number } {
    if (typeof pillarWidth_m !== 'number' || typeof pillarHeight_m !== 'number') {
        throw new TypeError('pillarWidth_m and pillarHeight_m must be numbers');
    }
    if (pillarWidth_m <= 0) {
        throw new RangeError('pillarWidth_m must be > 0');
    }
    if (pillarHeight_m <= 0) {
        throw new RangeError('pillarHeight_m must be > 0');
    }
    if (K_MPa <= 0) {
        throw new RangeError('K_MPa must be > 0');
    }

    // Resistência do pilar (Salamon & Munro, 1967, eq. 1)
    const pillarStrength_MPa = K_MPa * (Math.pow(pillarWidth_m, a) / Math.pow(pillarHeight_m, b));
    const widthToHeightRatio = pillarWidth_m / pillarHeight_m;

    return {
        pillarStrength_MPa,
        widthToHeightRatio,
        K_MPa,
        a,
        b,
    };
}

/**
 * Calcula a tensão de carga aplicada ao pilar pela teoria tributária (tributary
 * area theory - TAT), assumindo distribuição uniforme do peso da rocha sobrejacente.
 *
 * Equação: sigma_avg = gamma * H * (A_total / A_pillar)
 * onde A_total = (w_p + w_e)^2  e  A_pillar = w_p^2  para lavra em câmaras e pilares
 * (Brady & Brown, 2006, eq. 13.1)
 *
 * @param rockDensity_kg_m3  Densidade da rocha sobrejacente [kg/m³]
 * @param miningDepth_m  Profundidade de lavra [m]
 * @param pillarWidth_m  Largura do pilar [m]
 * @param excavationWidth_m  Largura da câmara/abertura [m]
 * @param g  Aceleração gravitacional [m/s²]
 * @throws {RangeError} Se inputs forem negativos ou zero
 */
export function calcPillarStressLoad(
    rockDensity_kg_m3: number,
    miningDepth_m: number,
    pillarWidth_m: number,
    excavationWidth_m: number,
    g = 9.81,
): { pillarStress_MPa: number; tributaryAreaRatio: number; verticalFieldStress_MPa: number } {
    if (
        typeof rockDensity_kg_m3 !== 'number' ||
        typeof miningDepth_m !== 'number' ||
        typeof pillarWidth_m !== 'number' ||
        typeof excavationWidth_m !== 'number'
    ) {
        throw new TypeError('All geometry and density arguments must be numbers');
    }
    if (rockDensity_kg_m3 <= 0) throw new RangeError('rockDensity_kg_m3 must be > 0');
    if (miningDepth_m <= 0) throw new RangeError('miningDepth_m must be > 0');
    if (pillarWidth_m <= 0) throw new RangeError('pillarWidth_m must be > 0');
    if (excavationWidth_m <= 0) throw new RangeError('excavationWidth_m must be > 0');

    // Tensão de campo vertical virgem [MPa]
    const verticalFieldStress_MPa = (rockDensity_kg_m3 * g * miningDepth_m) / 1e6;

    // Razão de área tributária (superfície total / área do pilar)
    const totalSpan = pillarWidth_m + excavationWidth_m;
    const tributaryAreaRatio = (totalSpan * totalSpan) / (pillarWidth_m * pillarWidth_m);

    // Tensão média no pilar pela teoria tributária (Brady & Brown, 2006)
    const pillarStress_MPa = verticalFieldStress_MPa * tributaryAreaRatio;

    return {
        pillarStress_MPa,
        tributaryAreaRatio,
        verticalFieldStress_MPa,
    };
}

/**
 * Calcula o fator de segurança (FS) de um pilar.
 *
 * FS = sigma_p / sigma_avg  (Brady & Brown, 2006, eq. 13.3)
 * FS < 1.0 : pilar em colapso
 * FS 1.0-1.5: instável (zona de risco)
 * FS 1.5-2.0: marginal
 * FS > 2.0  : estável
 *
 * @param pillarStrength_MPa  Resistência calculada do pilar [MPa]
 * @param appliedStress_MPa  Tensão aplicada ao pilar [MPa]
 * @throws {RangeError} Se tensão aplicada for zero ou negativa
 */
export function calcSafetyFactorPillar(
    pillarStrength_MPa: number,
    appliedStress_MPa: number,
): { safetyFactor: number; pillarStrength_MPa: number; appliedStress_MPa: number } {
    if (typeof pillarStrength_MPa !== 'number' || typeof appliedStress_MPa !== 'number') {
        throw new TypeError('pillarStrength_MPa and appliedStress_MPa must be numbers');
    }
    if (pillarStrength_MPa <= 0) {
        throw new RangeError('pillarStrength_MPa must be > 0');
    }
    if (appliedStress_MPa <= 0) {
        throw new RangeError('appliedStress_MPa must be > 0');
    }

    // Fator de segurança clássico resistência/carga
    const safetyFactor = pillarStrength_MPa / appliedStress_MPa;

    return { safetyFactor, pillarStrength_MPa, appliedStress_MPa };
}

/**
 * Classifica a estabilidade de um pilar subterrâneo com base no fator de
 * segurança calculado.
 *
 * Critérios (Brady & Brown, 2006; Lunder & Pakalnis, 1997):
 *   FS < 1.0  : COLLAPSE - pilar falhou ou iminente colapso
 *   FS 1.0-1.4: UNSTABLE - risco de falha progressiva, intervenção urgente
 *   FS 1.4-1.8: MARGINAL - monitoramento contínuo obrigatório
 *   FS 1.8-2.5: STABLE - operação segura com monitoramento periódico
 *   FS > 2.5  : VERY_STABLE - ampla margem de segurança
 *
 * @param safetyFactor  Fator de segurança FS [-]
 * @throws {TypeError} Se safetyFactor não for número
 */
export function classifyPillarStability(safetyFactor: number): {
    stabilityClass: string;
    stabilityDescription: string;
    safetyFactor: number;
    requiresImmediate: boolean;
} {
    if (typeof safetyFactor !== 'number') {
        throw new TypeError('safetyFactor must be a number');
    }
    if (safetyFactor <= 0) {
        throw new RangeError('safetyFactor must be > 0');
    }

    let stabilityClass;
    let stabilityDescription;
    let requiresImmediate;

    if (safetyFactor < 1.0) {
        stabilityClass = 'COLLAPSE';
        stabilityDescription = 'Pillar has failed or imminent collapse — evacuate immediately';
        requiresImmediate = true;
    } else if (safetyFactor < 1.4) {
        stabilityClass = 'UNSTABLE';
        stabilityDescription = 'Unstable — risk of progressive failure, urgent intervention required';
        requiresImmediate = true;
    } else if (safetyFactor < 1.8) {
        stabilityClass = 'MARGINAL';
        stabilityDescription = 'Marginal stability — continuous monitoring mandatory';
        requiresImmediate = false;
    } else if (safetyFactor <= 2.5) {
        stabilityClass = 'STABLE';
        stabilityDescription = 'Stable — safe operation with periodic monitoring';
        requiresImmediate = false;
    } else {
        stabilityClass = 'VERY_STABLE';
        stabilityDescription = 'Very stable — wide safety margin, standard monitoring sufficient';
        requiresImmediate = false;
    }

    return { stabilityClass, stabilityDescription, safetyFactor, requiresImmediate };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineRockMechanicsPillarDesignMeta: AnalyticsModuleMeta = {
    name: 'mineRockMechanicsPillarDesign',
    description: 'Mine Rock Mechanics / Pillar Design',
    category: 'analytics',
    familyTags: ['mining'],
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
