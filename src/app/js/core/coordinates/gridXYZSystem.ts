// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   GRID XYZ SYSTEM — SPEC_GRID_XYZ_HUD (Item 9.47)

   Pure helpers para conversão entre 4 modos de coordenadas:
   - absolute_wgs84: lat/lon/elev (6 decimal places lat/lon)
   - absolute_utm: easting/northing/elev (2 decimal places)
   - relative_project: X/Y/Z metros vs origem do projeto
   - relative_element: X/Y/Z metros vs elemento selecionado

   UI HUD fica em handler. Core só faz matemática pura.
   ================================================================ */


// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

export const COORDINATE_MODES = Object.freeze({
    ABSOLUTE_WGS84: 'absolute_wgs84',
    ABSOLUTE_UTM: 'absolute_utm',
    RELATIVE_PROJECT: 'relative_project',
    RELATIVE_ELEMENT: 'relative_element',
});

export const MODE_LIST = Object.freeze(Object.values(COORDINATE_MODES));

export const DEFAULT_MODE = COORDINATE_MODES.ABSOLUTE_UTM;

// Precision por modo §Q3
export const PRECISION = Object.freeze({
    absolute_wgs84: { x: 6, y: 6, z: 2 }, // lat/lon 6 decimal → ~0.1m
    absolute_utm: { x: 2, y: 2, z: 2 }, // meters, cm precision
    relative_project: { x: 2, y: 2, z: 2 },
    relative_element: { x: 2, y: 2, z: 2 },
});

// Metro por grau (aprox equatorial) - uso para WGS84 → metros grosseiro
const METERS_PER_DEG_LAT = 111_320; // ~111.32 km/deg
const METERS_PER_DEG_LON_AT_EQ = 111_320;

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} mode
 * @returns {boolean}
 */
export function isValidMode(mode: string): boolean {
    return typeof mode === 'string' && MODE_LIST.includes(mode as any);
}

/**
 * Valida shape de coordenada 3D.
 * @param {Record<string, any>} pos - { x, y, z } ou { lat, lon, elev }
 * @returns {boolean}
 */
export function isValidPosition(pos: Record<string, any>): boolean {
    if (!pos || typeof pos !== 'object') return false;
    const x = pos.x ?? pos.lat ?? pos.easting;
    const y = pos.y ?? pos.lon ?? pos.northing;
    const z = pos.z ?? pos.elev ?? pos.elevation ?? 0;
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
}

function _normalizePos(pos: any): { x: any; y: any; z: any } | null {
    if (!isValidPosition(pos)) return null;
    return {
        x: pos.x ?? pos.lat ?? pos.easting ?? 0,
        y: pos.y ?? pos.lon ?? pos.northing ?? 0,
        z: pos.z ?? pos.elev ?? pos.elevation ?? 0,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Distance
// ──────────────────────────────────────────────────────────────────────

/**
 * Distância 3D euclidiana entre dois pontos (mesma unidade).
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
export function distance3D(a: object, b: object): number {
    const A = _normalizePos(a);
    const B = _normalizePos(b);
    if (!A || !B) return 0;
    const dx = A.x - B.x;
    const dy = A.y - B.y;
    const dz = A.z - B.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Distância horizontal (2D) ignorando Z.
 */
export function distance2D(a: any, b: any): number {
    const A = _normalizePos(a);
    const B = _normalizePos(b);
    if (!A || !B) return 0;
    return Math.sqrt((A.x - B.x) ** 2 + (A.y - B.y) ** 2);
}

// ──────────────────────────────────────────────────────────────────────
// Conversão absolute → relative
// ──────────────────────────────────────────────────────────────────────

/**
 * Converte posição absoluta para relativa à origem.
 * Ambos no mesmo sistema (UTM ou WGS84 convertido).
 *
 * @param {Object} absolutePos
 * @param {Object} origin
 * @returns {{x: number, y: number, z: number}|null}
 */
export function absoluteToRelative(absolutePos: object, origin: object): { x: number; y: number; z: number } | null {
    const A = _normalizePos(absolutePos);
    const O = _normalizePos(origin);
    if (!A || !O) return null;
    return {
        x: A.x - O.x,
        y: A.y - O.y,
        z: A.z - O.z,
    };
}

/**
 * Converte posição relativa de volta para absoluta.
 */
export function relativeToAbsolute(relativePos: any, origin: any): { x: number; y: number; z: number } | null {
    const R = _normalizePos(relativePos);
    const O = _normalizePos(origin);
    if (!R || !O) return null;
    return {
        x: R.x + O.x,
        y: R.y + O.y,
        z: R.z + O.z,
    };
}

// ──────────────────────────────────────────────────────────────────────
// WGS84 ↔ metros (aproximação simples - grande precisão para UTM é via
// proj4 no handler; core faz aproximação para display rápido)
// ──────────────────────────────────────────────────────────────────────

/**
 * Aproxima deltas em metros entre dois pontos WGS84.
 * Adequado para HUD display em distâncias curtas (<100km).
 *
 * @param {{lat: any, lon: any}} refPoint
 * @param {{lat: any, lon: any}} targetPoint
 * @returns {{dx: number, dy: number}} deltas em metros (dx=East, dy=North)
 */
export function wgs84DeltaMeters(
    refPoint: { lat: any; lon: any },
    targetPoint: { lat: any; lon: any },
): { dx: number; dy: number } {
    if (!refPoint || !targetPoint) return { dx: 0, dy: 0 };
    const refLat = Number(refPoint.lat);
    const refLon = Number(refPoint.lon);
    const tgtLat = Number(targetPoint.lat);
    const tgtLon = Number(targetPoint.lon);
    if (![refLat, refLon, tgtLat, tgtLon].every(Number.isFinite)) return { dx: 0, dy: 0 };

    const latRad = (refLat * Math.PI) / 180;
    const dy = (tgtLat - refLat) * METERS_PER_DEG_LAT;
    const dx = (tgtLon - refLon) * METERS_PER_DEG_LON_AT_EQ * Math.cos(latRad);
    return { dx, dy };
}

// ──────────────────────────────────────────────────────────────────────
// Format display
// ──────────────────────────────────────────────────────────────────────

/**
 * Formata coordenada de acordo com mode + precision.
 *
 * @param {Object} pos
 * @param {string} mode
 * @returns {{x: string, y: string, z: string, labels: {x: any, y: any, z: any}, units: string}}
 */
export function formatCoordinate(
    pos: object,
    mode: string = DEFAULT_MODE,
): { x: string; y: string; z: string; labels: { x: any; y: any; z: any }; units: string } {
    const p = _normalizePos(pos) || { x: 0, y: 0, z: 0 };
    const prec = (PRECISION as any)[mode] || PRECISION[DEFAULT_MODE as keyof typeof PRECISION];

    const labels =
        mode === COORDINATE_MODES.ABSOLUTE_WGS84
            ? { x: 'Lat', y: 'Lon', z: 'Alt' }
            : mode === COORDINATE_MODES.ABSOLUTE_UTM
              ? { x: 'E', y: 'N', z: 'Elev' }
              : { x: 'X', y: 'Y', z: 'Z' };

    const units = mode === COORDINATE_MODES.ABSOLUTE_WGS84 ? '°' : 'm';

    return {
        x: p.x.toFixed(prec.x),
        y: p.y.toFixed(prec.y),
        z: p.z.toFixed(prec.z),
        labels,
        units,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Mode switching with context
// ──────────────────────────────────────────────────────────────────────

/**
 * Converte pos de um modo para outro dado origens configuradas.
 *
 * @param {Record<string, any>} pos
 * @param {string} fromMode
 * @param {string} toMode
 * @param {Record<string, any>} context - { projectOrigin, elementOrigin }
 * @returns {Object|null}
 */
export function switchMode(
    pos: Record<string, any>,
    fromMode: string,
    toMode: string,
    context: Record<string, any> = {},
): object | null {
    if (!isValidMode(fromMode) || !isValidMode(toMode)) return null;
    if (fromMode === toMode) return _normalizePos(pos);

    const p = _normalizePos(pos);
    if (!p) return null;

    // Relative → Absolute (UTM)
    if (
        toMode === COORDINATE_MODES.ABSOLUTE_UTM &&
        (fromMode === COORDINATE_MODES.RELATIVE_PROJECT || fromMode === COORDINATE_MODES.RELATIVE_ELEMENT)
    ) {
        const origin = fromMode === COORDINATE_MODES.RELATIVE_PROJECT ? context.projectOrigin : context.elementOrigin;
        return relativeToAbsolute(p, origin);
    }

    // Absolute → Relative
    if (
        fromMode === COORDINATE_MODES.ABSOLUTE_UTM &&
        (toMode === COORDINATE_MODES.RELATIVE_PROJECT || toMode === COORDINATE_MODES.RELATIVE_ELEMENT)
    ) {
        const origin = toMode === COORDINATE_MODES.RELATIVE_PROJECT ? context.projectOrigin : context.elementOrigin;
        return absoluteToRelative(p, origin);
    }

    // WGS84 ↔ UTM cases requerem proj4 (fora do core)
    return null;
}
