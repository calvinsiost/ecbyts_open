// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.2.0
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Environmental Data Governance
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   SPATIAL INDICATORS (IS1-IS7) — Indicadores espaciais por area
   Metricas de adequacao fisica do monitoramento ambiental.

   7 indicadores, cada um com score 1-5, agregados via media
   geometrica nao-compensatoria (mesma filosofia do EIS 3CTA+).

   Combinados com o EIS de qualidade de dados para formar o
   EIS Composto por Area.

   Referencias:
   - ABNT NBR 15495-1:2007 (malha de monitoramento)
   - CONAMA 420/2009 (valores orientadores para solo e agua)
   - CETESB DD-256/2016 (valores de referencia SP)
   ================================================================ */

import { polygonAreaXZ, pointInPolygonXZ } from './eisScopeResolver.js';

// ================================================================
// CONSTANTS
// ================================================================

/** Familias que contam como pontos de monitoramento para IS1/IS2 */
const MONITORING_FAMILIES = new Set(['well', 'sensor', 'spring']);

/** Familias esperadas em um GAC completo (IS3 default) */
export const DEFAULT_EXPECTED_FAMILIES = ['well', 'plume', 'boundary', 'building', 'remediation'];

/** Parametros regulatorios default (IS6 fallback) — BTEX + metais pesados */
export const DEFAULT_REQUIRED_PARAMS = [
    'benzene',
    'toluene',
    'ethylbenzene',
    'xylenes',
    'naphthalene',
    'lead',
    'chromium',
    'cadmium',
    'nickel',
    'mercury',
];

/** Raio de influencia default para cobertura espacial (IS2), em metros */
const DEFAULT_INFLUENCE_RADIUS = 50;

/** Grid resolution cap para IS2 (evita computacao excessiva) */
const MAX_GRID_SIZE = 500;

/** Pesos default para EIS composto (3CTA+ vs IS) */
export const DEFAULT_COMPOSITE_WEIGHTS = { tcccat: 2, spatial: 1 };

// ================================================================
// IS1 - DENSIDADE DE MONITORAMENTO
// ================================================================

/**
 * Compute monitoring density: monitoring points per hectare.
 * Densidade = pontos_monitoramento / area_hectares.
 *
 * Score 1-5:
 *   <0.5/ha → 1, 0.5-1 → 2, 1-2 → 3, 2-4 → 4, >4 → 5
 *
 * Ref: ABNT NBR 15495 (malha de monitoramento de aguas subterraneas)
 *
 * @param {any} elements - Elementos dentro da area
 * @param {Array<{x: number, z: number}>} boundaryVertices - Vertices do boundary
 * @returns {{ score: number, monitoringPoints: number, areaHa: number, density: number }}
 */
export function computeMonitoringDensity(elements: any, boundaryVertices: any) {
    const areaM2 = polygonAreaXZ(boundaryVertices);
    const areaHa = areaM2 / 10000;
    const monitoringPoints = elements.filter((/** @type {any} */ e: any) => MONITORING_FAMILIES.has(e.family)).length;

    if (areaHa <= 0) return { score: 1, monitoringPoints, areaHa: 0, density: 0 };

    const density = monitoringPoints / areaHa;
    let score;
    if (density >= 4) score = 5;
    else if (density >= 2) score = 4;
    else if (density >= 1) score = 3;
    else if (density >= 0.5) score = 2;
    else score = 1;

    return {
        score,
        monitoringPoints,
        areaHa: Math.round(areaHa * 100) / 100,
        density: Math.round(density * 100) / 100,
    };
}

// ================================================================
// IS2 - COBERTURA ESPACIAL
// ================================================================

/**
 * Compute spatial coverage: ratio of area covered by monitoring influence buffers.
 * Aproximacao via grid discreto: para cada celula do grid, verifica se esta
 * dentro do raio de influencia de algum ponto de monitoramento.
 *
 * Score 1-5:
 *   <20% → 1, 20-40% → 2, 40-60% → 3, 60-80% → 4, >80% → 5
 *
 * @param {any} elements - Elementos dentro da area
 * @param {Array<{x: number, z: number}>} boundaryVertices - Vertices do boundary
 * @param {number} [radius=50] - Raio de influencia em metros
 * @returns {{ score: number, coverage: number, coveredCells: number, totalCells: number }}
 */
export function computeSpatialCoverage(elements: any, boundaryVertices: any, radius = DEFAULT_INFLUENCE_RADIUS) {
    const monitoringEls = elements.filter((/** @type {any} */ e: any) => MONITORING_FAMILIES.has(e.family));
    const positions = _extractPositions(monitoringEls);

    if (positions.length === 0 || !boundaryVertices || boundaryVertices.length < 3) {
        return { score: 1, coverage: 0, coveredCells: 0, totalCells: 0 };
    }

    // Bounding box do boundary
    let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
    for (const v of boundaryVertices) {
        minX = Math.min(minX, v.x || 0);
        maxX = Math.max(maxX, v.x || 0);
        minZ = Math.min(minZ, v.z || 0);
        maxZ = Math.max(maxZ, v.z || 0);
    }

    const width = maxX - minX;
    const height = maxZ - minZ;
    if (width <= 0 || height <= 0) return { score: 1, coverage: 0, coveredCells: 0, totalCells: 0 };

    // Resolucao do grid (capped em MAX_GRID_SIZE)
    const step = Math.max(width / MAX_GRID_SIZE, height / MAX_GRID_SIZE, 1);
    const r2 = radius * radius;
    let totalCells = 0;
    let coveredCells = 0;

    for (let x = minX; x <= maxX; x += step) {
        for (let z = minZ; z <= maxZ; z += step) {
            if (!pointInPolygonXZ(x, z, boundaryVertices)) continue;
            totalCells++;
            for (const pos of positions) {
                const dx = x - pos.x,
                    dz = z - pos.z;
                if (dx * dx + dz * dz <= r2) {
                    coveredCells++;
                    break;
                }
            }
        }
    }

    const coverage = totalCells > 0 ? coveredCells / totalCells : 0;
    let score;
    if (coverage >= 0.8) score = 5;
    else if (coverage >= 0.6) score = 4;
    else if (coverage >= 0.4) score = 3;
    else if (coverage >= 0.2) score = 2;
    else score = 1;

    return { score, coverage: Math.round(coverage * 1000) / 10, coveredCells, totalCells };
}

// ================================================================
// IS3 - DIVERSIDADE DE FAMILIAS
// ================================================================

/**
 * Compute family diversity: distinct families present vs expected.
 * Mede completude da investigacao - quantas familias de elementos distintas.
 *
 * Score 1-5:
 *   1 familia → 1, 2 → 2, 3 → 3, 4 → 4, 5+ → 5
 *
 * @param {any} elements - Elementos dentro da area
 * @param {Array<string>} [expectedFamilies] - Familias esperadas (default GAC)
 * @returns {{ score: number, distinctFamilies: string[], expected: number, ratio: number }}
 */
export function computeFamilyDiversity(elements: any, expectedFamilies = DEFAULT_EXPECTED_FAMILIES) {
    const distinct = [...new Set(elements.map((/** @type {any} */ e: any) => e.family).filter(Boolean))];
    const expected = expectedFamilies.length || 5;
    const count = distinct.length;

    let score;
    if (count >= 5) score = 5;
    else if (count >= 4) score = 4;
    else if (count >= 3) score = 3;
    else if (count >= 2) score = 2;
    else score = 1;

    return {
        score,
        distinctFamilies: distinct,
        expected,
        ratio: Math.round((count / expected) * 100) / 100,
    };
}

// ================================================================
// IS4 - COBERTURA DE REMEDIACAO
// ================================================================

/**
 * Compute remediation coverage: remediation area vs plume area.
 * Se nao ha plumas, retorna score 5 (area limpa).
 *
 * Score 1-5:
 *   0% → 1, <25% → 2, 25-50% → 3, 50-75% → 4, >75% → 5
 *
 * @param {any} elements - Elementos dentro da area
 * @param {any} _boundaryVertices - Vertices do boundary
 * @returns {{ score: number, remediationArea: number, plumeArea: number, ratio: number }}
 */
export function computeRemediationCoverage(elements: any, _boundaryVertices: any) {
    const plumes = elements.filter((/** @type {any} */ e: any) => e.family === 'plume');
    const remediations = elements.filter((/** @type {any} */ e: any) => e.family === 'remediation');

    // Se nao ha plumas, area esta limpa
    if (plumes.length === 0) {
        return { score: 5, remediationArea: 0, plumeArea: 0, ratio: 1 };
    }

    const plumeArea = _sumVertexAreas(plumes);
    const remediationArea = _sumVertexAreas(remediations);

    if (plumeArea <= 0) return { score: 5, remediationArea, plumeArea: 0, ratio: 1 };

    const ratio = remediationArea / plumeArea;
    let score;
    if (ratio >= 0.75) score = 5;
    else if (ratio >= 0.5) score = 4;
    else if (ratio >= 0.25) score = 3;
    else if (ratio > 0) score = 2;
    else score = 1;

    return {
        score,
        remediationArea: Math.round(remediationArea),
        plumeArea: Math.round(plumeArea),
        ratio: Math.round(ratio * 100) / 100,
    };
}

// ================================================================
// IS5 - LACUNA TEMPORAL ESPACIAL
// ================================================================

/**
 * Compute temporal gap: median days since last observation per monitoring point.
 * Complementa Ty (3CTA+) com dimensao espacial - identifica pontos estagnados.
 *
 * Score 1-5:
 *   >365d → 1, 180-365d → 2, 90-180d → 3, 30-90d → 4, <30d → 5
 *
 * @param {any} elements - Elementos dentro da area
 * @param {Date} [referenceDate] - Data de referencia (default: now)
 * @returns {{ score: number, medianAgeDays: number, monitoringPoints: number, freshCount: number, staleCount: number }}
 */
export function computeTemporalGap(elements: any, referenceDate = new Date()) {
    const refMs = referenceDate.getTime();
    const ages = [];
    let freshCount = 0,
        staleCount = 0;

    for (const el of elements) {
        if (!MONITORING_FAMILIES.has(el.family)) continue;
        const obs = el.data?.observations;
        if (!Array.isArray(obs) || obs.length === 0) {
            ages.push(Infinity);
            staleCount++;
            continue;
        }

        // Data mais recente
        let newest = 0;
        for (const o of obs) {
            const d = o.date ? new Date(o.date).getTime() : 0;
            if (d > newest) newest = d;
        }

        const ageDays = newest > 0 ? (refMs - newest) / 86_400_000 : Infinity;
        ages.push(ageDays);
        if (ageDays <= 30) freshCount++;
        else if (ageDays > 365) staleCount++;
    }

    if (ages.length === 0)
        return { score: 1, medianAgeDays: Infinity, monitoringPoints: 0, freshCount: 0, staleCount: 0 };

    // Mediana (robust vs media - outliers nao distorcem)
    ages.sort((a, b) => a - b);
    const mid = Math.floor(ages.length / 2);
    const medianAgeDays: number = ages.length % 2 === 0 ? (ages[mid - 1]! + ages[mid]!) / 2 : ages[mid]!;

    let score;
    if (medianAgeDays <= 30) score = 5;
    else if (medianAgeDays <= 90) score = 4;
    else if (medianAgeDays <= 180) score = 3;
    else if (medianAgeDays <= 365) score = 2;
    else score = 1;

    return {
        score,
        medianAgeDays: medianAgeDays === Infinity ? 999 : Math.round(medianAgeDays),
        monitoringPoints: ages.length,
        freshCount,
        staleCount,
    };
}

// ================================================================
// IS6 - COBERTURA DE PARAMETROS REGULATORIOS
// ================================================================

/**
 * Compute regulatory parameter coverage: monitored vs required parameters.
 * Mede se os parametros exigidos pela regulamentacao estao sendo monitorados.
 *
 * Score 1-5:
 *   <20% → 1, 20-40% → 2, 40-60% → 3, 60-80% → 4, >80% → 5
 *
 * Ref: CONAMA 420 Anexo II (lista de substancias com VI)
 *
 * @param {any} elements - Elementos dentro da area
 * @param {Array<string>} [requiredParams] - Parametros requeridos (default: BTEX + metais)
 * @returns {{ score: number, monitoredParams: string[], requiredCount: number, ratio: number }}
 */
export function computeRegulatoryParameterCoverage(elements: any, requiredParams = DEFAULT_REQUIRED_PARAMS) {
    const monitored = new Set();
    for (const el of elements) {
        const obs = el.data?.observations;
        if (!Array.isArray(obs)) continue;
        for (const o of obs) {
            if (o.parameterId) monitored.add(o.parameterId.toLowerCase());
        }
    }

    const required = requiredParams.map((p) => p.toLowerCase());
    const covered = required.filter((p) => monitored.has(p));
    const ratio = required.length > 0 ? covered.length / required.length : 0;

    let score;
    if (ratio >= 0.8) score = 5;
    else if (ratio >= 0.6) score = 4;
    else if (ratio >= 0.4) score = 3;
    else if (ratio >= 0.2) score = 2;
    else score = 1;

    return /** @type {any} */ ({
        score,
        monitoredParams: [...monitored],
        requiredCount: required.length,
        coveredCount: covered.length,
        ratio: Math.round(ratio * 100) / 100,
    });
}

// ================================================================
// IS7 - TAXA DE CONFORMIDADE REGULATORIA
// ================================================================

/**
 * Compute regulatory compliance rate: observations within limits vs total.
 * Usa limites VP/VI da CONAMA 420 e CETESB DD-256.
 *
 * Score 1-5:
 *   <20% conforme → 1, 20-40% → 2, 40-60% → 3, 60-80% → 4, >80% → 5
 *
 * @param {any} elements - Elementos dentro da area
 * @param {Function} [getThresholdsFn] - Funcao para obter limites (default: import lazy)
 * @returns {{ score: number, compliantCount: number, totalWithLimits: number, ratio: number }}
 */
export function computeRegulatoryCompliance(elements: any, getThresholdsFn: any = null) {
    let compliantCount = 0;
    let totalWithLimits = 0;

    for (const el of elements) {
        const obs = el.data?.observations;
        if (!Array.isArray(obs)) continue;
        const matrix = el.data?.matrix || 'groundwater';

        for (const o of obs) {
            if (!o.parameterId || typeof o.value !== 'number') continue;

            let thresholds;
            try {
                thresholds = getThresholdsFn
                    ? getThresholdsFn(o.parameterId, matrix)
                    : _getDefaultThreshold(o.parameterId);
            } catch {
                continue;
            }

            if (!thresholds || !thresholds.vi) continue;
            totalWithLimits++;
            if (o.value <= thresholds.vi) compliantCount++;
        }
    }

    if (totalWithLimits === 0) return { score: 3, compliantCount: 0, totalWithLimits: 0, ratio: 1 };

    const ratio = compliantCount / totalWithLimits;
    let score;
    if (ratio >= 0.8) score = 5;
    else if (ratio >= 0.6) score = 4;
    else if (ratio >= 0.4) score = 3;
    else if (ratio >= 0.2) score = 2;
    else score = 1;

    return { score, compliantCount, totalWithLimits, ratio: Math.round(ratio * 100) / 100 };
}

/**
 * Default threshold stub (used when validation engine is not available).
 * Retorna null - IS7 reporta score neutro (3) sem limites disponiveis.
 * @param {string} _parameterId
 * @returns {null}
 */
function _getDefaultThreshold(_parameterId: any) {
    return null;
}

// ================================================================
// COMPOSITE SCORE - Agregacao dos 7 indicadores
// ================================================================

/**
 * Compute composite spatial indicator score (IS1-IS7).
 * Media geometrica nao-compensatoria - mesma filosofia do EIS 3CTA+.
 * Pesos iguais (1 cada) no v1.
 *
 * @param {{ IS1: number, IS2: number, IS3: number, IS4: number, IS5: number, IS6: number, IS7: number }} indicators
 * @returns {number} Score composto (0-5, 2 casas decimais)
 */
export function computeCompositeIS(indicators: any) {
    const values = [
        indicators.IS1 || 1,
        indicators.IS2 || 1,
        indicators.IS3 || 1,
        indicators.IS4 || 1,
        indicators.IS5 || 1,
        indicators.IS6 || 1,
        indicators.IS7 || 1,
    ];

    // Media geometrica: (v1 * v2 * ... * v7) ^ (1/7)
    let product = 1;
    for (const v of values) product *= Math.max(v, 0.01);
    const composite = Math.pow(product, 1 / values.length);

    return Math.round(composite * 100) / 100;
}

/**
 * Compute the combined Area EIS from 3CTA+ EIS and spatial composite.
 * Combina qualidade de dados (3CTA+) e adequacao espacial (IS composto)
 * via media geometrica ponderada.
 *
 * Default: w_tcccat=2, w_spatial=1 (qualidade dos dados pesa mais).
 *
 * @param {number} eisTcccat - Score EIS 3CTA+ (0-5)
 * @param {number} isComposite - Score IS composto (0-5)
 * @param {{ tcccat: number, spatial: number }} [weights] - Pesos
 * @returns {number} EIS composto da area (0-5, 2 casas decimais)
 */
export function computeAreaEIS(eisTcccat: any, isComposite: any, weights = DEFAULT_COMPOSITE_WEIGHTS) {
    const wT = weights.tcccat || 2;
    const wS = weights.spatial || 1;
    const totalW = wT + wS;

    if (totalW <= 0) return 0;

    // Media geometrica ponderada: (eisTcccat^wT * isComposite^wS) ^ (1/totalW)
    const v1 = Math.max(eisTcccat || 0.01, 0.01);
    const v2 = Math.max(isComposite || 0.01, 0.01);
    const result = Math.pow(Math.pow(v1, wT) * Math.pow(v2, wS), 1 / totalW);

    return Math.round(result * 100) / 100;
}

/**
 * Compute all 7 spatial indicators for an area in one call.
 * Funcao de conveniencia que roda IS1-IS7 e retorna tudo.
 *
 * @param {any} elements - Elementos dentro da area
 * @param {Array<{x: number, z: number}>} boundaryVertices - Vertices do boundary
 * @param {Object} [options] - Opcoes opcionais
 * @param {number} [options.influenceRadius=50] - Raio para IS2
 * @param {Array<string>} [options.expectedFamilies] - Para IS3
 * @param {Array<string>} [options.requiredParams] - Para IS6
 * @param {Function} [options.getThresholdsFn] - Para IS7
 * @param {Date} [options.referenceDate] - Para IS5
 * @returns {{ IS1: Object, IS2: Object, IS3: Object, IS4: Object, IS5: Object, IS6: Object, IS7: Object, composite: number }}
 */
export function computeAllSpatialIndicators(
    elements: any,
    boundaryVertices: any,
    options: {
        influenceRadius?: number;
        expectedFamilies?: any;
        requiredParams?: any;
        getThresholdsFn?: any;
        referenceDate?: any;
    } = {}
) {
    const IS1 = computeMonitoringDensity(elements, boundaryVertices);
    const IS2 = computeSpatialCoverage(elements, boundaryVertices, options.influenceRadius);
    const IS3 = computeFamilyDiversity(elements, options.expectedFamilies);
    const IS4 = computeRemediationCoverage(elements, boundaryVertices);
    const IS5 = computeTemporalGap(elements, options.referenceDate);
    const IS6 = computeRegulatoryParameterCoverage(elements, options.requiredParams);
    const IS7 = computeRegulatoryCompliance(elements, options.getThresholdsFn);

    const composite = computeCompositeIS({
        IS1: IS1.score,
        IS2: IS2.score,
        IS3: IS3.score,
        IS4: IS4.score,
        IS5: IS5.score,
        IS6: IS6.score,
        IS7: IS7.score,
    });

    return { IS1, IS2, IS3, IS4, IS5, IS6, IS7, composite };
}

// ================================================================
// INTERNAL HELPERS
// ================================================================

/**
 * Extract XZ positions from monitoring elements.
 * @param {any} elements
 * @returns {Array<{x: number, z: number}>}
 */
function _extractPositions(elements: any) {
    const positions = [];
    for (const el of elements) {
        const p = el.data?.position;
        if (p && (typeof p.x === 'number' || typeof p.z === 'number')) {
            positions.push({ x: p.x || 0, z: p.z || 0 });
            continue;
        }
        const v = el.data?.vertices;
        if (Array.isArray(v) && v.length > 0) {
            let sx = 0,
                sz = 0;
            for (const pt of v) {
                sx += pt.x || 0;
                sz += pt.z || 0;
            }
            positions.push({ x: sx / v.length, z: sz / v.length });
        }
    }
    return positions;
}

/**
 * Sum the polygon areas of elements that have vertices.
 * @param {any} elements
 * @returns {number} Total area in m²
 */
function _sumVertexAreas(elements: any) {
    let total = 0;
    for (const el of elements) {
        const v = el.data?.vertices;
        if (Array.isArray(v) && v.length >= 3) {
            total += polygonAreaXZ(v);
        }
    }
    return total;
}
