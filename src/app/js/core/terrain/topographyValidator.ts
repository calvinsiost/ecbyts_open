// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   TOPOGRAPHY VALIDATOR — SPEC_TERRAIN_UI_FIXES

   Pure helpers para validação de dados de terreno:
   - Validação estrutural §Q4 (schema coordenadas + elevação)
   - Validação semântica (ranges, duplicatas, densidade, outliers)
   - Stats de elevação (min/max/mean/sd)
   - Sidebar width normalizer (min 280px, max 45vw)
   - Resize state machine com persistência

   Three.js mesh generation + UI fica em handler.
   ================================================================ */


// ──────────────────────────────────────────────────────────────────────
// Constants §Q4
// ──────────────────────────────────────────────────────────────────────

export const ELEVATION_LIMITS = Object.freeze({
    MIN_PLAUSIBLE_M: -11_000, // Mariana Trench
    MAX_PLAUSIBLE_M: 8_849, // Mount Everest
});

export const VALIDATION_SEVERITIES = Object.freeze(['error', 'warning', 'info']);

// Outlier detection via IQR §Q4
export const OUTLIER_IQR_MULTIPLIER = 1.5;

// Sidebar resize bounds §Fix UI
export const SIDEBAR_BOUNDS = Object.freeze({
    MIN_PX: 280,
    MAX_VW: 45, // max 45% viewport width
    DEFAULT_PX: 320,
});

export const RESIZE_STATES = Object.freeze(['idle', 'dragging', 'persisted']);

// ──────────────────────────────────────────────────────────────────────
// Structural validation (layer 1)
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {Record<string, any>} point
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePointStructure(point: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!point || typeof point !== 'object') return { valid: false, errors: ['not object'] };
    if (!Number.isFinite(point.x)) errors.push('x must be number');
    if (!Number.isFinite(point.z) && !Number.isFinite(point.y)) errors.push('y or z required');
    if (!Number.isFinite(point.elevation)) errors.push('elevation must be number');
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Semantic validation (layer 2)
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {number} elevation
 * @returns {boolean}
 */
export function isPlausibleElevation(elevation: number): boolean {
    const e = Number(elevation);
    return Number.isFinite(e) && e >= ELEVATION_LIMITS.MIN_PLAUSIBLE_M && e <= ELEVATION_LIMITS.MAX_PLAUSIBLE_M;
}

/**
 * Detecta duplicatas exatas (mesma coord x,z).
 * @param {Array<{x: number, z?: number, y?: number}>} points
 * @returns {Array<{x: number, z: number, count: number}>}
 */
export function findDuplicateCoordinates(
    points: Array<{ x: number; z?: number; y?: number }>,
): Array<{ x: number; z: number; count: number }> {
    if (!Array.isArray(points)) return [];
    const seen = new Map<string, number>();
    for (const p of points) {
        if (!p) continue;
        const key = `${p.x},${p.z || p.y}`;
        seen.set(key, (seen.get(key) || 0) + 1);
    }
    const dupes: Array<{ x: number; z: number; count: number }> = [];
    for (const [key, count] of seen) {
        if (count > 1) {
            const parts = key.split(',').map(Number);
            const x = parts[0] as number;
            const z = parts[1] as number;
            dupes.push({ x, z, count });
        }
    }
    return dupes;
}

// ──────────────────────────────────────────────────────────────────────
// Elevation stats + outliers
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {Array<{elevation: number}>} points
 * @returns {{ min: number, max: number, mean: number, sd: number, range: number, n: number }}
 */
export function computeElevationStats(
    points: Array<{ elevation: number }>,
): { min: number; max: number; mean: number; sd: number; range: number; n: number } {
    if (!Array.isArray(points) || points.length === 0) {
        return { min: 0, max: 0, mean: 0, sd: 0, range: 0, n: 0 };
    }
    const elevations = points.map((p) => Number(p?.elevation)).filter(Number.isFinite);
    if (elevations.length === 0) return { min: 0, max: 0, mean: 0, sd: 0, range: 0, n: 0 };

    const min = Math.min(...elevations);
    const max = Math.max(...elevations);
    const mean = elevations.reduce((s, v) => s + v, 0) / elevations.length;
    const variance =
        elevations.length > 1 ? elevations.reduce((s, v) => s + (v - mean) ** 2, 0) / (elevations.length - 1) : 0;
    return {
        min,
        max,
        mean,
        sd: Math.sqrt(variance),
        range: max - min,
        n: elevations.length,
    };
}

/**
 * Detecta outliers de elevação via IQR (Tukey).
 * @param {Array<{elevation: number}>} points
 * @returns {Array<{index: number, elevation: number, zScore: number}>}
 */
export function detectElevationOutliers(
    points: Array<{ elevation: number }>,
): Array<{ index: number; elevation: number; zScore: number }> {
    if (!Array.isArray(points) || points.length < 4) return [];
    const sorted = points
        .map((p, i) => ({ i, e: Number(p?.elevation) }))
        .filter((x) => Number.isFinite(x.e))
        .sort((a, b) => a.e - b.e);
    const n = sorted.length;
    if (n < 4) return [];
    const q1 = sorted[Math.floor(n * 0.25)]!.e;
    const q3 = sorted[Math.floor(n * 0.75)]!.e;
    const iqr = q3 - q1;
    const lo = q1 - OUTLIER_IQR_MULTIPLIER * iqr;
    const hi = q3 + OUTLIER_IQR_MULTIPLIER * iqr;
    const stats = computeElevationStats(points);
    const outliers: Array<{ index: number; elevation: number; zScore: number }> = [];
    for (const { i, e } of sorted) {
        if (e < lo || e > hi) {
            const zScore = stats.sd > 0 ? (e - stats.mean) / stats.sd : 0;
            outliers.push({ index: i, elevation: e, zScore });
        }
    }
    return outliers;
}

// ──────────────────────────────────────────────────────────────────────
// Aggregate validator §Q4 two-layer
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida topografia completa: estrutural + semântica.
 *
 * @param {Array<any>} points
 * @returns {{ valid: boolean, issues: Array<{severity: string, code: string, message: string, index?: number}>, stats: any }}
 */
export function validateTopographyPoints(
    points: Array<any>,
): {
    valid: boolean;
    issues: Array<{ severity: string; code: string; message: string; index?: number }>;
    stats: any;
} {
    const issues: Array<{ severity: string; code: string; message: string; index?: number }> = [];
    if (!Array.isArray(points) || points.length === 0) {
        return {
            valid: false,
            issues: [{ severity: 'error', code: 'empty', message: 'No topography points provided' }],
            stats: computeElevationStats([]),
        };
    }

    // Structural
    for (let i = 0; i < points.length; i++) {
        const check = validatePointStructure(points[i]);
        if (!check.valid) {
            issues.push({
                severity: 'error',
                code: 'structural',
                message: `Point ${i}: ${check.errors.join(', ')}`,
                index: i,
            });
        }
    }

    // Semantic - elevations fora de range físico
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p && Number.isFinite(p.elevation) && !isPlausibleElevation(p.elevation)) {
            issues.push({
                severity: 'warning',
                code: 'implausible_elevation',
                message: `Point ${i}: elevation ${p.elevation}m fora de range físico`,
                index: i,
            });
        }
    }

    // Duplicates
    const dupes = findDuplicateCoordinates(points);
    if (dupes.length > 0) {
        issues.push({
            severity: 'info',
            code: 'duplicates',
            message: `${dupes.length} coordenadas duplicadas`,
        });
    }

    // Outliers
    const outliers = detectElevationOutliers(points);
    if (outliers.length > 0) {
        issues.push({
            severity: 'info',
            code: 'outliers',
            message: `${outliers.length} possíveis outliers de elevação (IQR)`,
        });
    }

    const stats = computeElevationStats(points);
    const hasErrors = issues.some((i) => i.severity === 'error');
    return { valid: !hasErrors, issues, stats };
}

// ──────────────────────────────────────────────────────────────────────
// Sidebar width normalizer §Fix UI
// ──────────────────────────────────────────────────────────────────────

/**
 * Normaliza width de sidebar respeitando bounds.
 * @param {number} requestedPx
 * @param {number} viewportWidthPx
 * @returns {number}
 */
export function normalizeSidebarWidth(requestedPx: number, viewportWidthPx: number): number {
    const req = Number(requestedPx);
    const vw = Number(viewportWidthPx);
    if (!Number.isFinite(req) || req <= 0) return SIDEBAR_BOUNDS.DEFAULT_PX;
    if (!Number.isFinite(vw) || vw <= 0) return Math.max(SIDEBAR_BOUNDS.MIN_PX, req);
    const maxPx = (SIDEBAR_BOUNDS.MAX_VW / 100) * vw;
    return Math.max(SIDEBAR_BOUNDS.MIN_PX, Math.min(maxPx, req));
}

// ──────────────────────────────────────────────────────────────────────
// Resize state machine §Fix UI
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} current
 * @param {string} event
 * @returns {string}
 */
export function transitionResizeState(current: string, event: string): string {
    if (!RESIZE_STATES.includes(current)) current = 'idle';
    if (current === 'idle' && event === 'dragstart') return 'dragging';
    if (current === 'dragging' && event === 'dragend') return 'persisted';
    if (current === 'persisted' && event === 'reset') return 'idle';
    return current;
}
