// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * boundaryPolygonValidator.js
 * Boundary Draw Save UX polish - P1-37
 *
 * Polygon validation: minimum vertices, degenerate area, auto-close normalization.
 * Area calculation via Shoelace (Gauss) formula.
 * Reference: Gauss, C.F. (1827) "Disquisitiones generales circa superficies curvas"
 */

interface PolygonVertex {
    x: number;
    y: number;
}

/**
 * Valida polígono de boundary antes de salvar.
 * Verifica vértices mínimos, coordenadas válidas, área mínima e advertências.
 *
 * @param polygon - array de vértices (sem repetição do ponto inicial)
 */
export function validateBoundaryPolygon(polygon: PolygonVertex[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
} {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(polygon) || polygon.length < 3) {
        errors.push('Polygon must have at least 3 vertices');
        return { valid: false, errors, warnings };
    }

    // Verificar que todos os pontos têm x, y numéricos válidos
    for (let i = 0; i < polygon.length; i++) {
        const pt = polygon[i];
        if (
            pt === null ||
            typeof pt !== 'object' ||
            typeof pt.x !== 'number' ||
            typeof pt.y !== 'number' ||
            isNaN(pt.x) ||
            isNaN(pt.y)
        ) {
            errors.push(`Vertex ${i} has invalid coordinates`);
        }
    }

    if (errors.length) return { valid: false, errors, warnings };

    const area = computePolygonArea(polygon);
    if (area < 1e-10) {
        errors.push('Polygon area is too small (degenerate)');
    } else if (area < 1) {
        warnings.push('Polygon area is very small — verify scale');
    }

    if (polygon.length > 1000) {
        warnings.push('Polygon has many vertices — consider simplifying');
    }

    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Calcula área do polígono usando fórmula de Shoelace (Gauss).
 * Funciona para polígonos convexos e côncavos sem auto-interseção.
 *
 * @returns área absoluta (sem sinal)
 */
export function computePolygonArea(polygon: PolygonVertex[]): number {
    const n = polygon.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const pi = polygon[i];
        const pj = polygon[j];
        if (!pi || !pj) continue;
        area += pi.x * pj.y;
        area -= pj.x * pi.y;
    }
    return Math.abs(area / 2);
}

/**
 * Normaliza polígono removendo duplicata do vértice final se idêntico ao inicial.
 * Garante representação aberta (n vértices distintos, sem repetição de fechamento).
 *
 * @returns polígono normalizado
 */
export function normalizePolygon(polygon: PolygonVertex[]): PolygonVertex[] {
    if (!Array.isArray(polygon) || polygon.length < 2) return polygon;
    const first = polygon[0];
    const last = polygon[polygon.length - 1];
    if (!first || !last) return polygon;
    if (first.x === last.x && first.y === last.y) {
        return polygon.slice(0, -1);
    }
    return polygon;
}
