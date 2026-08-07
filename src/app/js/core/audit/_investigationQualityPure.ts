// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   INVESTIGATION QUALITY PURE (Module C extraction)
   ================================================================

   Helpers pure-logic extraídos de core/audit/investigationQuality.ts:
     - detectContaminationTypes: matching de parameter sets para tipos
       (btex, metals_heavy, pah, chlorinated).
     - matchOutdatedMethods: regex de texto contra catálogo OUTDATED_METHODS
       (injetável) com finding shape preservado.

   Testáveis sem state. Reusáveis por outros validators ambientais.
   ================================================================ */

export interface OutdatedMethodPattern {
    pattern: RegExp;
    severity: string;
    finding: string;
    recommendation: string;
}

export interface InvestigationFinding {
    severity: string;
    category: string;
    finding: string;
    recommendation: string;
    match: string;
    count: number;
}

export interface InvestigationElementLike {
    family?: string;
    data?: Record<string, any>;
}

interface ScenePosition {
    x: number;
    z: number;
}

function getElementPosition(element: InvestigationElementLike): ScenePosition | null {
    const data = element?.data;
    if (!data) return null;
    if (data.coordinates) {
        return { x: Number(data.coordinates.easting) || 0, z: Number(data.coordinates.northing) || 0 };
    }
    if (data.center) {
        return { x: Number(data.center.x) || 0, z: Number(data.center.z) || 0 };
    }
    if (data.position) {
        return { x: Number(data.position.x) || 0, z: Number(data.position.z) || 0 };
    }
    if (Array.isArray(data.vertices) && data.vertices.length > 0) {
        const cx = data.vertices.reduce((sum: number, vertex: any) => sum + (Number(vertex.x) || 0), 0) / data.vertices.length;
        const cz = data.vertices.reduce((sum: number, vertex: any) => sum + (Number(vertex.z) || 0), 0) / data.vertices.length;
        return { x: cx, z: cz };
    }
    return null;
}

function getMonitoringPoints(elements: ReadonlyArray<InvestigationElementLike>): ScenePosition[] {
    const monitoringFamilies = new Set(['well', 'spring', 'marker', 'sample']);
    return elements
        .filter((element) => monitoringFamilies.has(String(element.family || '')))
        .map((element) => getElementPosition(element))
        .filter((position): position is ScenePosition => Boolean(position));
}

export function computeMonitoringCoverage(elements: ReadonlyArray<InvestigationElementLike>, bufferRadius = 50) {
    const points = getMonitoringPoints(elements);
    if (points.length < 2) {
        return { coverage: 0, boundingBox: null, pointCount: points.length, totalArea: 0, coveredArea: 0 };
    }
    const minX = Math.min(...points.map((point) => point.x)) - bufferRadius;
    const maxX = Math.max(...points.map((point) => point.x)) + bufferRadius;
    const minZ = Math.min(...points.map((point) => point.z)) - bufferRadius;
    const maxZ = Math.max(...points.map((point) => point.z)) + bufferRadius;
    const totalArea = (maxX - minX) * (maxZ - minZ);
    if (totalArea <= 0) {
        return { coverage: 0, boundingBox: null, pointCount: points.length, totalArea: 0, coveredArea: 0 };
    }
    const gridSize = bufferRadius / 2;
    const cols = Math.ceil((maxX - minX) / gridSize);
    const rows = Math.ceil((maxZ - minZ) / gridSize);
    let coveredCells = 0;
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const cellX = minX + col * gridSize + gridSize / 2;
            const cellZ = minZ + row * gridSize + gridSize / 2;
            if (points.some((point) => Math.hypot(point.x - cellX, point.z - cellZ) <= bufferRadius)) coveredCells += 1;
        }
    }
    const totalCells = cols * rows;
    const coverage = totalCells > 0 ? coveredCells / totalCells : 0;
    return { coverage, boundingBox: { minX, maxX, minZ, maxZ }, pointCount: points.length, totalArea, coveredArea: coverage * totalArea };
}

export function findMonitoringCoverageGaps(elements: ReadonlyArray<InvestigationElementLike>, gridSize = 20, minDistance = 80) {
    const points = getMonitoringPoints(elements);
    if (points.length < 2) return [];
    const minX = Math.min(...points.map((point) => point.x)) - minDistance;
    const maxX = Math.max(...points.map((point) => point.x)) + minDistance;
    const minZ = Math.min(...points.map((point) => point.z)) - minDistance;
    const maxZ = Math.max(...points.map((point) => point.z)) + minDistance;
    const gaps = [];
    const cols = Math.ceil((maxX - minX) / gridSize);
    const rows = Math.ceil((maxZ - minZ) / gridSize);
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const x = minX + col * gridSize + gridSize / 2;
            const z = minZ + row * gridSize + gridSize / 2;
            const nearestDistance = Math.min(...points.map((point) => Math.hypot(point.x - x, point.z - z)));
            if (nearestDistance > minDistance) gaps.push({ x, z, nearestDistance });
        }
    }
    return gaps;
}

/**
 * Detecta tipos de contaminação a partir de parameter ids observados.
 * Returns array com tipos disparados (btex, metals_heavy, pah, chlorinated).
 *
 * Matching keys (catálogo CONAMA-aligned):
 *   - btex: benzene OR toluene
 *   - metals_heavy: lead OR cadmium OR arsenic
 *   - pah: naphthalene OR benzo_a_pyrene
 *   - chlorinated: tce OR pce OR vinyl_chloride
 *
 * Aceita Set<string> OR ReadonlySet<string>.
 */
export function detectContaminationTypes(observedParams: ReadonlySet<string> | Set<string>): string[] {
    const types: string[] = [];
    if (!observedParams || typeof observedParams.has !== 'function') return types;
    if (observedParams.has('benzene') || observedParams.has('toluene')) {
        types.push('btex');
    }
    if (observedParams.has('lead') || observedParams.has('cadmium') || observedParams.has('arsenic')) {
        types.push('metals_heavy');
    }
    if (observedParams.has('naphthalene') || observedParams.has('benzo_a_pyrene')) {
        types.push('pah');
    }
    if (observedParams.has('tce') || observedParams.has('pce') || observedParams.has('vinyl_chloride')) {
        types.push('chlorinated');
    }
    return types;
}

/**
 * Match regex de texto contra catálogo de outdated methods. Cada match
 * vira finding com count + severity + recomendação herdadas do catalog.
 *
 * Categoria fixa: 'OUTDATED_METHODS'.
 *
 * @param reportText — texto do relatório a analisar
 * @param methods — catálogo de OutdatedMethodPattern (injetável; default vazio)
 */
export function matchOutdatedMethods(
    reportText: any,
    methods: ReadonlyArray<OutdatedMethodPattern> = [],
): InvestigationFinding[] {
    if (!reportText || typeof reportText !== 'string') return [];
    const findings: InvestigationFinding[] = [];
    for (const method of methods) {
        const matches = reportText.match(method.pattern);
        if (matches) {
            findings.push({
                severity: method.severity,
                category: 'OUTDATED_METHODS',
                finding: method.finding,
                recommendation: method.recommendation,
                match: matches[0],
                count: matches.length,
            });
        }
    }
    return findings;
}
