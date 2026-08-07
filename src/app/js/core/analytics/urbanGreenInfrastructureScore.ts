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
 * Urban Green Infrastructure Score Analytics
 *
 * Implements scoring and assessment of urban green infrastructure quality
 * following established frameworks:
 *   TEEB (2011). TEEB Manual for Cities: Ecosystem Services in Urban Management.
 *     TEEB/UNEP. https://www.teebweb.org/
 *   WHO (2016). Urban green spaces and health - A review of evidence.
 *     World Health Organization, Copenhagen. ISBN 978-92-890-5161-5.
 *   Benedict, M.A. & McMahon, E.T. (2006). Green Infrastructure: Linking Landscapes
 *     and Communities. Island Press, Washington DC. ISBN 978-1-55963-558-6.
 *
 * Zero external dependencies. All math is pure JS.
 *
 * @module urbanGreenInfrastructureScore
 */

// ---------------------------------------------------------------------------
// Tree Canopy Coverage (Cobertura Arbórea)
// Proporção da área urbana coberta por dossel arbóreo
// ---------------------------------------------------------------------------

/**
 * Compute tree canopy coverage percentage for an urban area.
 * Cobertura arbórea: percentual da área total coberta por dossel.
 * WHO (2016) meta recomendada: >= 30% de cobertura arbórea.
 *
 * @param {number} canopyAreaHa  - Area covered by tree canopy (hectares)
 * @param {number} totalAreaHa   - Total area of the urban unit (hectares)
 * @returns {{coveragePercent: number, meetsWhoTarget: boolean, gap: number}}
 * @throws {RangeError} If canopyAreaHa > totalAreaHa or values are negative
 */
export function treeCanopyCoverage(canopyAreaHa: any, totalAreaHa: any) {
    if (typeof canopyAreaHa !== 'number' || canopyAreaHa < 0) {
        throw new RangeError('treeCanopyCoverage: canopyAreaHa must be >= 0');
    }
    if (typeof totalAreaHa !== 'number' || totalAreaHa <= 0) {
        throw new RangeError('treeCanopyCoverage: totalAreaHa must be > 0');
    }
    if (canopyAreaHa > totalAreaHa + 1e-9) {
        throw new RangeError('treeCanopyCoverage: canopyAreaHa cannot exceed totalAreaHa');
    }

    const WHO_CANOPY_TARGET = 30; // % — WHO 2016

    const coveragePercent = (canopyAreaHa / totalAreaHa) * 100;
    const meetsWhoTarget = coveragePercent >= WHO_CANOPY_TARGET;
    const gap = Math.max(0, WHO_CANOPY_TARGET - coveragePercent);

    return { coveragePercent, meetsWhoTarget, gap };
}

// ---------------------------------------------------------------------------
// Urban Green Index (IVU - Índice Verde Urbano)
// IVU = area_verde_publica_m2 / populacao (m²/habitante)
// ---------------------------------------------------------------------------

/**
 * Compute the Urban Green Index (IVU / Verde Urbano).
 * IVU = area verde publica per capita (m²/habitante).
 *
 * WHO (2016) recommendation: >= 9 m²/habitante.
 * Ideal for quality of life: >= 15 m²/habitante (Benedict & McMahon 2006).
 *
 * @param {number} greenAreaM2   - Total public green area (m²)
 * @param {number} population    - Urban population (number of inhabitants)
 * @returns {{IVU: number, classification: string, whoCompliant: boolean}}
 * @throws {RangeError} If greenAreaM2 is negative or population <= 0
 */
export function urbanGreenIndex(greenAreaM2: any, population: any) {
    if (typeof greenAreaM2 !== 'number' || greenAreaM2 < 0) {
        throw new RangeError('urbanGreenIndex: greenAreaM2 must be >= 0');
    }
    if (typeof population !== 'number' || population <= 0 || !Number.isFinite(population)) {
        throw new RangeError('urbanGreenIndex: population must be a positive finite number');
    }

    const IVU = greenAreaM2 / population;
    const whoCompliant = IVU >= 9;

    let classification;
    if (IVU < 3) classification = 'critical';
    else if (IVU < 9) classification = 'deficient';
    else if (IVU < 15) classification = 'adequate';
    else if (IVU < 30) classification = 'good';
    else classification = 'excellent';

    return { IVU, classification, whoCompliant };
}

// ---------------------------------------------------------------------------
// Ecological Connectivity Index for Green Corridors
// Conectividade ecológica: baseada em tamanho e distância dos fragmentos (IIC simplificado)
// Benedict & McMahon 2006 - conectividade como pedra angular da infraestrutura verde
// ---------------------------------------------------------------------------

/**
 * Compute the Integral Index of Connectivity (IIC) simplified for urban green corridors.
 * IIC simplificado: soma da contribuição de cada par de fragmentos dividida por
 * (1 + numero_de_links_no_caminho_minimo). Benedict & McMahon (2006) cap. 4.
 *
 * @param {Array<{areaHa: number}>} fragments - Array of green fragments with area in hectares
 * @param {number[][]} fragments        - N×N binary matrix: 1 if fragments are connected
 * @param {number} adjacencyMatrix           - Total landscape area (hectares)
 * @returns {{IIC: number, connectivityClass: string}}
 * @throws {TypeError} If fragments or adjacencyMatrix are not properly typed arrays
 * @throws {RangeError} If matrix dimensions do not match fragments count
 */
export function ecologicalConnectivityIndex(fragments: any, adjacencyMatrix: any, totalLandscapeHa: any) {
    if (!Array.isArray(fragments) || fragments.length === 0) {
        throw new TypeError('ecologicalConnectivityIndex: fragments must be a non-empty array');
    }
    if (!Array.isArray(adjacencyMatrix)) {
        throw new TypeError('ecologicalConnectivityIndex: adjacencyMatrix must be a 2D array');
    }
    if (typeof totalLandscapeHa !== 'number' || totalLandscapeHa <= 0) {
        throw new RangeError('ecologicalConnectivityIndex: totalLandscapeHa must be > 0');
    }

    const N = fragments.length;
    if (adjacencyMatrix.length !== N || adjacencyMatrix.some((row) => !Array.isArray(row) || row.length !== N)) {
        throw new RangeError('ecologicalConnectivityIndex: adjacencyMatrix must be N×N');
    }

    for (const f of fragments) {
        if (!f || typeof f.areaHa !== 'number' || f.areaHa < 0) {
            throw new TypeError('ecologicalConnectivityIndex: each fragment must have areaHa >= 0');
        }
    }

    // BFS para encontrar distância (número de links) entre fragmentos
    /**
     * @param {number} start
     * @param {number} end
     * @returns {number}
     */
    function bfsDistance(start: any, end: any) {
        if (start === end) return 0;
        const visited = new Array(N).fill(false);
        /** @type {Array<[number, number]>} */
        const queue = [[start, 0]];
        visited[start] = true;
        while (queue.length) {
            const head = /** @type {[number, number]} */ (queue.shift());
const cur = head![0];
            const dist = head![1];
            for (let j = 0; j < N; j++) {
                if (adjacencyMatrix[cur][j] && !visited[j]) {
                    if (j === end) return dist + 1;
                    visited[j] = true;
                    queue.push([j, dist + 1]);
                }
            }
        }
        return Infinity; // não conectado
    }

    // IIC = sum(ai * aj / (1 + nlk_ij)) / AL^2
    let sum = 0;
    const AL = totalLandscapeHa;
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const dist = bfsDistance(i, j);
            if (Number.isFinite(dist)) {
                sum += (fragments[i].areaHa * fragments[j].areaHa) / (1 + dist);
            }
        }
    }

    const IIC = sum / (AL * AL);

    let connectivityClass;
    if (IIC < 0.01) connectivityClass = 'isolated';
    else if (IIC < 0.05) connectivityClass = 'low';
    else if (IIC < 0.15) connectivityClass = 'moderate';
    else if (IIC < 0.3) connectivityClass = 'high';
    else connectivityClass = 'very_high';

    return { IIC, connectivityClass };
}

// ---------------------------------------------------------------------------
// Urban Ecosystem Services Score
// Serviços ecossistêmicos urbanos: resfriamento, infiltração, recreação
// TEEB 2011 - valuation framework for urban ecosystem services
// ---------------------------------------------------------------------------

/**
 * Score urban ecosystem services (cooling, infiltration, recreation) for a green area.
 * Pontuação de serviços ecossistêmicos: metodologia adaptada do TEEB (2011).
 *
 * Each service scored 0-10 based on provided indicators.
 * Composite score = weighted average.
 *
 * @param {object} weights - Service indicators
 * @param {number} indicators.coolingIndex       - Temperature reduction potential (0-10 scale)
 * @param {number} indicators.infiltrationIndex  - Stormwater infiltration capacity (0-10 scale)
 * @param {number} indicators.recreationIndex    - Recreational access and quality (0-10 scale)
 * @param {{cooling?: number, infiltration?: number, recreation?: number}} [weights]  - Optional weights (sum to 1)
 * @returns {{compositeScore: number, adequacyClass: string, serviceScores: object}}
 * @throws {TypeError} If indicators is not a valid object
 * @throws {RangeError} If any index is outside [0, 10] or weights don't sum to 1
 */
export function urbanEcosystemServicesScore(indicators: any, weights = undefined) {
    if (!indicators || typeof indicators !== 'object') {
        throw new TypeError('urbanEcosystemServicesScore: indicators must be an object');
    }
    const { coolingIndex, infiltrationIndex, recreationIndex } = indicators;

    for (const [name, val] of [
        ['coolingIndex', coolingIndex],
        ['infiltrationIndex', infiltrationIndex],
        ['recreationIndex', recreationIndex],
    ]) {
        if (typeof val !== 'number') {
            throw new TypeError(`urbanEcosystemServicesScore: ${name} must be a number`);
        }
        if (val < 0 || val > 10) {
            throw new RangeError(`urbanEcosystemServicesScore: ${name} must be in [0, 10]`);
        }
    }

    // Pesos padrão TEEB 2011 (regulacao climatica, provisao hidrica, cultural)
    const w = weights || { cooling: 0.35, infiltration: 0.35, recreation: 0.3 };
    const wCooling = w.cooling ?? 0;
    const wInfiltration = w.infiltration ?? 0;
    const wRecreation = w.recreation ?? 0;

    if (weights) {
        const sum = wCooling + wInfiltration + wRecreation;
        if (Math.abs(sum - 1) > 1e-6) {
            throw new RangeError('urbanEcosystemServicesScore: weights must sum to 1');
        }
    }

    const compositeScore = wCooling * coolingIndex + wInfiltration * infiltrationIndex + wRecreation * recreationIndex;

    let adequacyClass;
    if (compositeScore < 2.5) adequacyClass = 'deficient';
    else if (compositeScore < 5.0) adequacyClass = 'basic';
    else if (compositeScore < 7.5) adequacyClass = 'adequate';
    else adequacyClass = 'excellent';

    return {
        compositeScore,
        adequacyClass,
        serviceScores: { coolingIndex, infiltrationIndex, recreationIndex },
    };
}

// ---------------------------------------------------------------------------
// Green Infrastructure Adequacy Classification
// Classificação integrada de adequação da infraestrutura verde
// Combina: IVU, cobertura arbórea, conectividade, serviços ecossistêmicos
// ---------------------------------------------------------------------------

/**
 * Classify overall urban green infrastructure adequacy from component indicators.
 * Classificacao integrada: combina 4 indicadores em uma nota final (0-100).
 *
 * @param {object} components - Component scores
 * @param {number} components.canopyCoveragePercent   - Tree canopy coverage (%)
 * @param {number} components.IVU                     - Urban Green Index (m²/hab)
 * @param {number} components.connectivityIIC         - Ecological connectivity (0-1)
 * @param {number} components.ecosystemServicesScore  - Ecosystem services (0-10)
 * @returns {{score: number, classification: 'deficient'|'basic'|'adequate'|'excellent',
 *            breakdown: object}}
 * @throws {TypeError} If components is not an object with numeric fields
 */
export function greenInfrastructureAdequacy(components: any) {
    if (!components || typeof components !== 'object') {
        throw new TypeError('greenInfrastructureAdequacy: components must be an object');
    }
    const { canopyCoveragePercent, IVU, connectivityIIC, ecosystemServicesScore } = components;

    if ([canopyCoveragePercent, IVU, connectivityIIC, ecosystemServicesScore].some((v) => typeof v !== 'number')) {
        throw new TypeError('greenInfrastructureAdequacy: all component values must be numbers');
    }
    if (canopyCoveragePercent < 0 || canopyCoveragePercent > 100) {
        throw new RangeError('greenInfrastructureAdequacy: canopyCoveragePercent must be in [0, 100]');
    }
    if (IVU < 0) throw new RangeError('greenInfrastructureAdequacy: IVU must be >= 0');
    if (connectivityIIC < 0 || connectivityIIC > 1) {
        throw new RangeError('greenInfrastructureAdequacy: connectivityIIC must be in [0, 1]');
    }
    if (ecosystemServicesScore < 0 || ecosystemServicesScore > 10) {
        throw new RangeError('greenInfrastructureAdequacy: ecosystemServicesScore must be in [0, 10]');
    }

    // Normalização para escala 0-100
    // Cobertura arbórea: 0-100% → WHO alvo 30% = 100 pts, proporcional
    const normCanopy = Math.min(100, (canopyCoveragePercent / 30) * 100);

    // IVU: WHO alvo 9 m²/hab = 70 pts; 15 m²/hab (Benedict) = 100 pts
    const normIVU = IVU <= 15 ? Math.min(100, (IVU / 15) * 100) : 100;

    // Conectividade: IIC 0-1 → 0-100
    const normConn = Math.min(100, connectivityIIC * 100 * 3); // IIC > 0.33 = excelente

    // Serviços ecossistêmicos: 0-10 → 0-100
    const normEco = ecosystemServicesScore * 10;

    // Pesos iguais (25% cada) - todas dimensões equiponderadas
    const score = (normCanopy + normIVU + normConn + normEco) / 4;

    /** @type {'deficient'|'basic'|'adequate'|'excellent'} */
    let classification;
    if (score < 25) classification = 'deficient';
    else if (score < 50) classification = 'basic';
    else if (score < 75) classification = 'adequate';
    else classification = 'excellent';

    return {
        score,
        classification,
        breakdown: { normCanopy, normIVU, normConn, normEco },
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const urbanGreenInfrastructureScoreMeta = {
    name: 'urbanGreenInfrastructureScore',
    description: 'urbanGreenInfrastructureScore',
    category: 'analytics',
    familyTags: ['environmental'],
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
