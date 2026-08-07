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
 * mineHydrogeologicalRisk.js
 * Vulnerabilidade de aquífero à contaminação - DRASTIC (Aller et al. 1987)
 * e índice GOD (Foster 1987).
 *
 * Ambos os métodos são de domínio público e amplamente utilizados por agências
 * ambientais (EPA, CETESB, ANA) para zoneamento de proteção de aquíferos.
 *
 * References:
 *   [1] Aller, L. et al. (1987) DRASTIC: A Standardized System for Evaluating
 *       Ground Water Pollution Potential Using Hydrogeologic Settings.
 *       EPA/600/2-87-035. US EPA, Ada, Oklahoma.
 *   [2] Foster, S.S.D. (1987) Fundamental concepts in aquifer vulnerability,
 *       pollution risk and protection strategy. Hydrogeology Journal, TNO Comm.
 *       on Hydrological Research, Proc. and Info. 38, 69-86.
 *   [3] Vrba, J. & Zaporozec, A. (1994) Guidebook on Mapping Groundwater
 *       Vulnerability. IAH Int. Contrib. Hydrogeol. Vol 16.
 *
 * @module core/analytics/mineHydrogeologicalRisk
 */

'use strict';

// ---------------------------------------------------------------------------
// DRASTIC weights - Aller et al. (1987) Table 2
// ---------------------------------------------------------------------------
const DRASTIC_WEIGHTS = {
    D: 5, // Depth to water table
    R: 4, // net Recharge
    A: 3, // Aquifer media
    S: 2, // Soil media
    T: 1, // Topography (slope)
    I: 5, // Impact of vadose zone
    C: 3, // Hydraulic Conductivity
};

// DRASTIC maximum weighted score: Σ(peso × max_rating=10) = (5+4+3+2+1+5+3)×10 = 230
// Published scale: 23–226. We keep the published range for classification.

// DRASTIC vulnerability thresholds (Aller et al. 1987, widely cited in CETESB 2016)
const DRASTIC_THRESHOLDS: ReadonlyArray<{ label: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high'; max: number }> = [
    { label: 'very_low', max: 79 },
    { label: 'low', max: 119 },
    { label: 'moderate', max: 159 },
    { label: 'high', max: 199 },
    { label: 'very_high', max: Infinity },
];

// GOD vulnerability thresholds (Foster 1987, Table 1)
const GOD_THRESHOLDS: ReadonlyArray<{ label: 'negligible' | 'low' | 'medium' | 'high' | 'extreme'; max: number }> = [
    { label: 'negligible', max: 0.1 },
    { label: 'low', max: 0.3 },
    { label: 'medium', max: 0.5 },
    { label: 'high', max: 0.7 },
    { label: 'extreme', max: Infinity },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calcula o índice DRASTIC de vulnerabilidade de aquífero.
 *
 * Cada parâmetro deve ser fornecido como rating (1–10) conforme tabelas
 * de Aller et al. (1987). O índice é calculado como:
 *   DRASTIC = D×5 + R×4 + A×3 + S×2 + T×1 + I×5 + C×3
 *
 * @param {number} D - profundidade até o nível d'água (rating 1-10)
 * @param {number} R - recarga líquida (rating 1-10)
 * @param {number} A - meio aquífero (rating 1-10)
 * @param {number} S - meio do solo (rating 1-10)
 * @param {number} T - topografia / declividade (rating 1-10)
 * @param {number} I - influência da zona vadosa (rating 1-10)
 * @param {number} C - condutividade hidráulica (rating 1-10)
 * @returns {{ drasticIndex: number, weighted: Object }}
 */
export function calcDRASTIC(
    D: number,
    R: number,
    A: number,
    S: number,
    T: number,
    I: number,
    C: number,
): { drasticIndex: number; weighted: Record<string, number> } {
    const params: Record<string, number> = { D, R, A, S, T, I, C };
    for (const [name, val] of Object.entries(params)) {
        if (typeof val !== 'number' || val < 1 || val > 10) {
            throw new RangeError(`DRASTIC parameter "${name}" must be a number between 1 and 10`);
        }
    }
    const weighted = {
        D: D * DRASTIC_WEIGHTS.D,
        R: R * DRASTIC_WEIGHTS.R,
        A: A * DRASTIC_WEIGHTS.A,
        S: S * DRASTIC_WEIGHTS.S,
        T: T * DRASTIC_WEIGHTS.T,
        I: I * DRASTIC_WEIGHTS.I,
        C: C * DRASTIC_WEIGHTS.C,
    };
    const drasticIndex = Object.values(weighted).reduce((s, v) => s + v, 0);
    return { drasticIndex, weighted };
}

/**
 * Calcula o índice GOD de vulnerabilidade de aquífero.
 * GOD = G × O × D   (produto dos três fatores adimensionalizados)
 * Resultado em 0–1, onde 1 = máxima vulnerabilidade.
 *
 * G - ocorrência do aquífero (groundwater occurrence): 0–1
 *   Ex: 0.0 (não-saturado), 0.4 (semi-confinado), 1.0 (livre)
 * O - grau de confinamento do aquífero (overall aquifer class): 0–1
 *   Ex: 0.1 (muito confinado), 0.5 (semi-confinado), 0.9 (livre)
 * D - distância até o nível piezométrico (depth): 0.4–1.0
 *   Normalizado: d_m → escala inversa; ver Foster (1987) Figura 1.
 *   Para simplificar sem look-up completo, aceitar valor normalizado (0.4–1.0).
 *
 * @param {number} groundwaterOccurrence  - fator G (0–1)
 * @param {number} overallAquifer         - fator O (0–1)
 * @param {number} depthToWaterTable      - fator D normalizado (0.4–1.0)
 * @returns {{ godIndex: number }}
 */
export function calcGODIndex(
    groundwaterOccurrence: number,
    overallAquifer: number,
    depthToWaterTable: number,
): { godIndex: number } {
    const checks: Array<[string, number, number, number]> = [
        ['groundwaterOccurrence', groundwaterOccurrence, 0, 1],
        ['overallAquifer', overallAquifer, 0, 1],
        ['depthToWaterTable', depthToWaterTable, 0.4, 1.0],
    ];
    for (const [name, val, lo, hi] of checks) {
        if (typeof val !== 'number' || val < lo || val > hi) {
            throw new RangeError(`"${name}" must be a number between ${lo} and ${hi}`);
        }
    }
    const godIndex = groundwaterOccurrence * overallAquifer * depthToWaterTable;
    return { godIndex };
}

/**
 * Classifica a vulnerabilidade DRASTIC em cinco classes.
 * Limiares de Aller et al. (1987) conforme citado em CETESB (2016).
 *
 * @param {number} score - índice DRASTIC (23–226)
 * @returns {'very_low'|'low'|'moderate'|'high'|'very_high'}
 */
export function classifyDRASTICVulnerability(
    score: number,
): 'very_low' | 'low' | 'moderate' | 'high' | 'very_high' {
    if (typeof score !== 'number' || score < 0) {
        throw new RangeError('DRASTIC score must be a non-negative number');
    }
    for (const { label, max } of DRASTIC_THRESHOLDS) {
        if (score <= max) return label;
    }
    return 'very_high';
}

/**
 * Classifica a vulnerabilidade GOD em cinco classes.
 * Classes de Foster (1987), Tabela 1.
 *
 * @param {number} GOD - índice GOD (0–1)
 * @returns {'negligible'|'low'|'medium'|'high'|'extreme'}
 */
export function classifyGODVulnerability(GOD: number): 'negligible' | 'low' | 'medium' | 'high' | 'extreme' {
    if (typeof GOD !== 'number' || GOD < 0 || GOD > 1) {
        throw new RangeError('GOD index must be a number between 0 and 1');
    }
    for (const { label, max } of GOD_THRESHOLDS) {
        if (GOD <= max) return label;
    }
    return 'extreme';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineHydrogeologicalRiskMeta = {
    name: 'mineHydrogeologicalRisk',
    description: 'mineHydrogeologicalRisk',
    category: 'analytics',
    familyTags: ['mining', 'risk', 'hydrogeology'],
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
