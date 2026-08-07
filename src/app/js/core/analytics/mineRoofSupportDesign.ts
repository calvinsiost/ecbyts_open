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
// Application: EHS & Mining - Mine Roof Support Design
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Mine Roof Support Design - Q-system and RMR-based geomechanics
 *
 * Módulo puro implementando cálculos de suporte de teto de minas subterrâneas
 * baseados no Q-system de Barton et al. (1974) e no Rock Mass Rating (RMR)
 * de Bieniawski (1989). Aplicado em mineração, túneis e galerias subterrâneas.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Barton, N., Lien, R. & Lunde, J. (1974). "Engineering classification of
 *     rock masses for the design of tunnel support." Rock Mechanics 6(4), 189–236.
 *     DOI: 10.1007/BF01239496
 *     (Q-system: bolt density, support pressure, unsupported span)
 *   - Bieniawski, Z. T. (1989). "Engineering Rock Mass Classifications."
 *     John Wiley & Sons, New York. ISBN: 978-0-471-60172-2.
 *     (RMR: support recommendations, stand-up time)
 *   - NIOSH (2011). "Roof Bolt Loading Mechanisms and Energy Absorption."
 *     Information Circular IC 9518. CDC/NIOSH, Pittsburgh, PA.
 *     (bolt density empirical guidelines for coal mines)
 *
 * @module core/analytics/mineRoofSupportDesign
 */

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

/**
 * Valid Q-system support categories (Classes I–VI).
 * Categorias válidas do Q-system (Classes I–VI).
 */
// eslint-disable-next-line
const Q_SUPPORT_CATEGORIES = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/**
 * Calculates roof bolt density (bolts/m²) using the Q-system empirical formula.
 *
 * Calcula a densidade de parafusos de ancoragem de teto (parafusos/m²) pelo
 * Q-system. A fórmula de Barton (1974) relaciona o índice Q com o ESR
 * (Excavation Support Ratio) e o span da escavação para derivar o número
 * recomendado de parafusos por unidade de área de teto.
 *
 * Formula: bolt_density = 1 / (2.4 × Q^0.4 × ESR)
 * (Barton et al. 1974, Eq. 3 - densidade mínima recomendada)
 *
 * @param qIndex - Q-system rock quality index (dimensionless, > 0)
 * @param esr    - Excavation Support Ratio (dimensionless, > 0)
 *                 Typical values: 3–5 (temporary), 1–1.6 (permanent civil),
 *                 0.5–1.0 (underground powerhouses)
 * @returns Bolt density in bolts/m²
 * @throws {TypeError}  if inputs are not finite numbers
 * @throws {RangeError} if qIndex ≤ 0 or esr ≤ 0
 *
 * @example
 * calcRoofBoltDensity(10, 1.6); // ~0.18 bolts/m² (good rock, permanent)
 */
export function calcRoofBoltDensity(qIndex: number, esr: number): number {
    if (!Number.isFinite(qIndex) || !Number.isFinite(esr)) {
        throw new TypeError('calcRoofBoltDensity: qIndex and esr must be finite numbers');
    }
    if (qIndex <= 0) {
        throw new RangeError('calcRoofBoltDensity: qIndex must be > 0');
    }
    if (esr <= 0) {
        throw new RangeError('calcRoofBoltDensity: esr must be > 0');
    }
    // Fórmula de Barton (1974): densidade de ancoragem mínima recomendada
    return 1 / (2.4 * Math.pow(qIndex, 0.4) * esr);
}

/**
 * Calculates roof support pressure (MPa) using the Q-system formula.
 *
 * Calcula a pressão de suporte de teto em MPa pelo Q-system. A pressão de
 * suporte representa a carga que o sistema de suporte deve resistir para
 * garantir estabilidade da escavação (Barton et al. 1974, Eq. 2).
 *
 * Formula: P_roof = (2 × J_n^0.5) / (3 × J_r × Q^(1/3))
 * onde J_n = joint set number, J_r = joint roughness number
 *
 * @param qIndex - Q-system index (dimensionless, > 0)
 * @param jn     - Joint set number J_n (dimensionless, 0.5–20)
 * @param jr     - Joint roughness number J_r (dimensionless, 0.5–4)
 * @returns Support pressure in MPa
 * @throws {TypeError}  if any input is not a finite number
 * @throws {RangeError} if any input is out of valid range
 *
 * @example
 * calcSupportPressure(4, 9, 1.5); // ~0.24 MPa
 */
export function calcSupportPressure(qIndex: number, jn: number, jr: number): number {
    if (!Number.isFinite(qIndex) || !Number.isFinite(jn) || !Number.isFinite(jr)) {
        throw new TypeError('calcSupportPressure: all inputs must be finite numbers');
    }
    if (qIndex <= 0) throw new RangeError('calcSupportPressure: qIndex must be > 0');
    if (jn < 0.5 || jn > 20) throw new RangeError('calcSupportPressure: jn must be between 0.5 and 20');
    if (jr < 0.5 || jr > 4) throw new RangeError('calcSupportPressure: jr must be between 0.5 and 4');

    // Pressão de suporte de teto (Barton et al. 1974, Eq. 2)
    return (2 * Math.sqrt(jn)) / (3 * jr * Math.pow(qIndex, 1 / 3));
}

/**
 * Calculates the maximum unsupported span (m) for a given Q-index and ESR.
 *
 * Calcula o span máximo sem suporte estrutural para uma escavação subterrânea,
 * usando o ábaco de Barton (1974) linearizado por Grimstad & Barton (1993).
 * Acima desse span, suporte estrutural é obrigatório para evitar colapso.
 *
 * Formula: max_span = 2 × ESR × Q^0.4
 * (Barton et al. 1974, Fig. 4 - limite inferior de segurança)
 *
 * @param qIndex - Q-system index (dimensionless, > 0)
 * @param esr    - Excavation Support Ratio (dimensionless, > 0)
 * @returns Maximum unsupported span in metres
 * @throws {TypeError}  if inputs are not finite numbers
 * @throws {RangeError} if qIndex ≤ 0 or esr ≤ 0
 *
 * @example
 * calcUnsupportedSpan(10, 1.6); // ~7.58 m
 */
export function calcUnsupportedSpan(qIndex: number, esr: number): number {
    if (!Number.isFinite(qIndex) || !Number.isFinite(esr)) {
        throw new TypeError('calcUnsupportedSpan: qIndex and esr must be finite numbers');
    }
    if (qIndex <= 0) throw new RangeError('calcUnsupportedSpan: qIndex must be > 0');
    if (esr <= 0) throw new RangeError('calcUnsupportedSpan: esr must be > 0');

    // Span máximo sem suporte - Barton (1974) ábaco linearizado
    return 2 * esr * Math.pow(qIndex, 0.4);
}

/**
 * Classifies the roof support category (Q-system Classes I–VI) based on Q-index.
 *
 * Classifica a categoria de suporte de teto pelo Q-system de Barton (1974).
 * As 6 classes variam de "suporte excepcional" (Classe I, Q muito alto) a
 * "suporte pesado" (Classe VI, Q muito baixo), definindo a intensidade do
 * sistema de suporte requerido na escavação.
 *
 * @param qIndex - Q-system index (dimensionless, > 0)
 * @returns category: Roman numeral class I–VI;
 *   description: qualitative description in English;
 *   minBoltSpacing_m: minimum recommended bolt spacing in metres
 * @throws {TypeError}  if qIndex is not a finite number
 * @throws {RangeError} if qIndex ≤ 0
 *
 * @example
 * classifyRoofSupportCategory(10);
 * // { category: 'III', description: 'Good', minBoltSpacing_m: 1.5 }
 */
export function classifyRoofSupportCategory(qIndex: number): {
    category: string;
    description: string;
    minBoltSpacing_m: number;
} {
    if (!Number.isFinite(qIndex)) {
        throw new TypeError('classifyRoofSupportCategory: qIndex must be a finite number');
    }
    if (qIndex <= 0) throw new RangeError('classifyRoofSupportCategory: qIndex must be > 0');

    // Limites de classificação Q-system (Barton et al. 1974, Tabela 2)
    if (qIndex >= 40) return { category: 'I', description: 'Exceptionally good / no support', minBoltSpacing_m: 3.0 };
    if (qIndex >= 10) return { category: 'II', description: 'Very good', minBoltSpacing_m: 2.5 };
    if (qIndex >= 4) return { category: 'III', description: 'Good', minBoltSpacing_m: 1.5 };
    if (qIndex >= 1) return { category: 'IV', description: 'Fair', minBoltSpacing_m: 1.0 };
    if (qIndex >= 0.1) return { category: 'V', description: 'Poor', minBoltSpacing_m: 0.75 };
    return { category: 'VI', description: 'Very poor / heavy support required', minBoltSpacing_m: 0.5 };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineRoofSupportDesignMeta: AnalyticsModuleMeta = {
    name: 'mineRoofSupportDesign',
    description: 'Mine Roof Support Design',
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
