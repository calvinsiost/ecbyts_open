// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

import { parseCSVLine } from '../io/formats/csv.js';

export const TOPOGRAPHY_INPUT_LIMITS = Object.freeze({
    maxPoints: 1500,
    complexMethodPointLimit: 300,
    dedupeTolerance: 0.01,
    /** Número de amostras LHS usadas para capturar cotas do terreno online */
    lhsOnlineSamples: 300,
});

const MANUAL_METHODS = new Set(['idw', 'rbf', 'kriging']);
const COMPLEX_METHODS = new Set(['rbf', 'kriging']);

const SCENE_ALIASES = Object.freeze({
    x: ['x', 'coord_x', 'coordenada_x', 'local_x', 'scene_x'],
    z: ['z', 'coord_z', 'coordenada_z', 'local_z', 'scene_z'],
    value: ['value', 'elevation', 'elevacao', 'elev', 'height', 'altitude', 'cota', 'y'],
});

const UTM_ALIASES = Object.freeze({
    easting: ['easting', 'utm_easting', 'utm_e', 'utm_x', 'leste', 'este', 'x'],
    northing: ['northing', 'utm_northing', 'utm_n', 'utm_y', 'norte', 'y'],
    elevation: ['elevation', 'elevacao', 'elev', 'altitude', 'cota', 'z'],
});

const DELIMITERS = [',', ';', '\t', '|'];

/** @param {*} value */
function _normalizeHeader(value: any) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/** @param {*} mode */
function _getCoordinateMode(mode: any) {
    return mode === 'utm' ? 'utm' : 'scene';
}

/** @param {*} value */
function _isFiniteNumber(value: any) {
    return typeof value === 'number' && Number.isFinite(value);
}

/** @param {*} value */
export function parseTopographyNumber(value: any) {
    if (_isFiniteNumber(value)) return value;
    if (value == null) return null;

    let text = String(value).trim();
    if (!text) return null;
    text = text.replace(/\s+/g, '');

    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(text)) {
        text = text.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(text)) {
        text = text.replace(/,/g, '');
    } else if (/^-?\d+,\d+$/.test(text)) {
        text = text.replace(',', '.');
    } else {
        text = text.replace(/,/g, '');
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
}

/** @param {*} coordinateMode */
function _getAliasByMode(coordinateMode: any) {
    return coordinateMode === 'utm' ? UTM_ALIASES : SCENE_ALIASES;
}

/** @param {*} tokens @param {*} coordinateMode */
function _looksLikeHeader(tokens: any, coordinateMode: any) {
    if (!Array.isArray(tokens) || tokens.length === 0) return false;

    const aliases = _getAliasByMode(coordinateMode);
    const aliasSet = new Set(Object.values(aliases).flat());
    const normalized = tokens.map((t) => _normalizeHeader(t));

    if (normalized.some((h) => aliasSet.has(h))) return true;

    let alphaCount = 0;
    for (const t of tokens) {
        const str = String(t || '').trim();
        if (!str) continue;
        if (/[a-zA-Z]/.test(str)) alphaCount++;
    }
    if (alphaCount > 0) return true;

    return false;
}

/** @param {*} text */
export function detectTopographyDelimiter(text: any) {
    const firstLine = String(text || '')
        .split(/\r?\n/)
        .find((line) => line.trim().length > 0);

    if (!firstLine) return null;

    let best = null;
    let bestCount = 0;
    for (const delimiter of DELIMITERS) {
        const count = (firstLine.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
        if (count > bestCount) {
            best = delimiter;
            bestCount = count;
        }
    }
    return bestCount > 0 ? best : null;
}

/** @param {*} rowMap @param {*} aliases @param {*} fallbackIndex @param {*} fallbackValues */
function _pickValue(rowMap: any, aliases: any, fallbackIndex: any, fallbackValues: any) {
    for (const key of aliases) {
        if (Object.hasOwn(rowMap, key)) return rowMap[key];
    }
    if (Array.isArray(fallbackValues)) return fallbackValues[fallbackIndex];
    return null;
}

/** @param {*} row @param {*} coordinateMode */
function _extractRawPoint(row: any, coordinateMode: any) {
    const aliases = /** @type {*} */ (_getAliasByMode(coordinateMode)) as any;
    const isArrayRow = Array.isArray(row);

    /** @type {Record<string, any>} */
    const rowMap: Record<string, any> = {};
    if (!isArrayRow && row && typeof row === 'object') {
        for (const [key, value] of Object.entries(row)) {
            rowMap[_normalizeHeader(key)] = value;
        }
    }

    if (coordinateMode === 'utm') {
        const easting = parseTopographyNumber(_pickValue(rowMap, aliases.easting, 0, row));
        const northing = parseTopographyNumber(_pickValue(rowMap, aliases.northing, 1, row));
        const elevation = parseTopographyNumber(_pickValue(rowMap, aliases.elevation, 2, row));
        if (!_isFiniteNumber(easting) || !_isFiniteNumber(northing) || !_isFiniteNumber(elevation)) return null;
        return { easting, northing, elevation };
    }

    const x = parseTopographyNumber(_pickValue(rowMap, aliases.x, 0, row));
    const z = parseTopographyNumber(_pickValue(rowMap, aliases.z, 1, row));
    const value = parseTopographyNumber(_pickValue(rowMap, aliases.value, 2, row));
    if (!_isFiniteNumber(x) || !_isFiniteNumber(z) || !_isFiniteNumber(value)) return null;
    return { x, z, value };
}

/** @param {*} text @param {*} coordinateMode */
function _parseTextInput(text: any, coordinateMode: any) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map((/** @type {string} */ line) => line.trim())
        .filter((/** @type {string} */ line) => line.length > 0);

    if (lines.length === 0) {
        return { rows: [], delimiter: null, hasHeader: false };
    }

    const delimiter = detectTopographyDelimiter(text);
    const tokenized = lines.map((/** @type {string} */ line) =>
        delimiter ? parseCSVLine(line, delimiter) : line.split(/\s+/),
    );
    const hasHeader = _looksLikeHeader(tokenized[0], coordinateMode);

    if (!hasHeader) {
        return {
            rows: tokenized,
            delimiter,
            hasHeader,
        };
    }

    const headers = tokenized[0]!.map(
        (/** @type {*} */ h: any, /** @type {number} */ i: any) => _normalizeHeader(h) || `col_${i}`,
    );
    /** @type {any[]} */
    const rows = [];
    for (let i = 1; i < tokenized.length; i++) {
        const rowValues = tokenized[i]!;
        /** @type {Record<string, any>} */
        const row: Record<string, any> = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j]!] = rowValues[j] ?? null;
        }
        rows.push(row);
    }

    return { rows, delimiter, hasHeader };
}

/** @param {*} origin */
function _normalizeOrigin(origin: any) {
    if (!origin || typeof origin !== 'object') return null;
    const easting = parseTopographyNumber(origin.easting);
    const northing = parseTopographyNumber(origin.northing);
    const elevation = parseTopographyNumber(origin.elevation);
    if (!_isFiniteNumber(easting) || !_isFiniteNumber(northing) || !_isFiniteNumber(elevation)) return null;
    return { easting, northing, elevation };
}

/** @param {*} points @param {number} tolerance */
function _dedupePoints(points: any, tolerance: any) {
    const dedup = new Map();
    for (const point of points) {
        const kx = Math.round(point.scene.x / tolerance);
        const kz = Math.round(point.scene.z / tolerance);
        dedup.set(`${kx}_${kz}`, point);
    }
    return Array.from(dedup.values()).sort((/** @type {*} */ a, /** @type {*} */ b) => a.index - b.index);
}

/** @param {*} input @param {*} [opts] */
export function normalizeTopographyPoints(input: any, opts: any = {}) {
    const coordinateMode = _getCoordinateMode(opts.coordinateMode);
    const tolerance =
        _isFiniteNumber(opts.tolerance) && opts.tolerance > 0
            ? opts.tolerance
            : TOPOGRAPHY_INPUT_LIMITS.dedupeTolerance;
    const maxPoints = Number.isFinite(opts.maxPoints) && opts.maxPoints > 0 ? Math.floor(opts.maxPoints) : Infinity;
    const origin = _normalizeOrigin(opts.origin);

    /** @type {*} */
    let parsedTextMeta: any = { delimiter: null, hasHeader: null };
    /** @type {any[]} */
    let rows = [];
    if (typeof input === 'string') {
        const parsed = _parseTextInput(input, coordinateMode);
        rows = parsed.rows;
        parsedTextMeta = { delimiter: parsed.delimiter, hasHeader: parsed.hasHeader };
    } else if (Array.isArray(input)) {
        rows = input;
    }

    /** @type {any[]} */
    const accepted = [];
    let invalidCount = 0;

    for (let i = 0; i < rows.length; i++) {
        const raw = _extractRawPoint(rows[i], coordinateMode);
        if (!raw) {
            invalidCount++;
            continue;
        }

        /** @type {*} */
        let scene;
        if (coordinateMode === 'utm') {
            if (!origin) {
                throw new Error('UTM origin is required to convert manual topography points.');
            }
            scene = {
                x: raw.easting - origin.easting,
                z: -(raw.northing - origin.northing),
                value: raw.elevation - origin.elevation,
            };
        } else {
            scene = { x: raw.x, z: raw.z, value: raw.value };
        }

        accepted.push({ raw, scene, index: i });
    }

    const deduped = _dedupePoints(accepted, tolerance);
    const duplicateCount = Math.max(0, accepted.length - deduped.length);
    const truncatedCount = Math.max(0, deduped.length - maxPoints);
    const limited = deduped.slice(0, maxPoints);

    return {
        coordinateMode,
        points: limited.map((/** @type {*} */ p) => ({ ...p.scene })),
        rawPoints: limited.map((/** @type {*} */ p) => ({ ...p.raw })),
        validCount: limited.length,
        invalidCount,
        duplicateCount,
        truncatedCount,
        ignoredCount: invalidCount + duplicateCount + truncatedCount,
        totalRows: rows.length,
        delimiter: parsedTextMeta.delimiter,
        hasHeader: parsedTextMeta.hasHeader,
    };
}

/**
 * Gera n amostras 2D via Latin Hypercube Sampling.
 * Cada dimensão é estratificada em n intervalos iguais com perturbação aleatória,
 * depois as duas dimensões são permutadas independentemente para garantir
 * cobertura uniforme sem correlação entre eixos.
 * @param {number} n
 * @returns {Array<[number, number]>} pares [u, v] em [0, 1)
 */
function _lhsSample2D(n: any) {
    const u = new Array(n);
    const v = new Array(n);
    for (let i = 0; i < n; i++) {
        u[i] = (i + Math.random()) / n;
        v[i] = (i + Math.random()) / n;
    }
    // Fisher-Yates shuffle independente por dimensão
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [u[i], u[j]] = [u[j], u[i]];
    }
    return u.map((ui, i) => [ui, v[i]]);
}

/**
 * Amostra N pontos de um grid de elevação usando Latin Hypercube Sampling 2D.
 * Usado para capturar cotas do terreno obtido da web, permitindo persistência
 * e restauração local sem re-fetch de tiles.
 * @param {Float32Array} grid - elevações relativas já em coordenadas de cena (cols × rows)
 * @param {number} cols
 * @param {number} rows
 * @param {number} n - número de amostras LHS
 * @param {{ min: {x: number, z: number}, max: {x: number, z: number} }} bounds
 * @returns {Array<{x: number, z: number, value: number}>}
 */
export function sampleElevationGridLHS(grid: any, cols: any, rows: any, n: any, bounds: any) {
    const samples = _lhsSample2D(Math.max(3, n));
    const result = [];
    for (const [u, v] of samples) {
        const col = Math.min(Math.floor(u * cols), cols - 1);
        const row = Math.min(Math.floor(v * rows), rows - 1);
        const value = grid[row * cols + col];
        if (!Number.isFinite(value)) continue;
        result.push({
            x: bounds.min.x + u * (bounds.max.x - bounds.min.x),
            z: bounds.min.z + v * (bounds.max.z - bounds.min.z),
            value,
        });
    }
    return result;
}

/** @param {*} method @param {*} pointCount @param {*} [opts] */
export function resolveManualTerrainMethod(method: any, pointCount: any, opts: any = {}) {
    const normalized = MANUAL_METHODS.has(method) ? method : 'idw';
    const limit =
        Number.isFinite(opts.complexMethodPointLimit) && opts.complexMethodPointLimit > 0
            ? Math.floor(opts.complexMethodPointLimit)
            : TOPOGRAPHY_INPUT_LIMITS.complexMethodPointLimit;

    if (COMPLEX_METHODS.has(normalized) && Number(pointCount) > limit) {
        return {
            method: 'idw',
            downgraded: true,
            reason: 'point_limit',
            requestedMethod: normalized,
            limit,
        };
    }

    return {
        method: normalized,
        downgraded: false,
        reason: null,
        requestedMethod: normalized,
        limit,
    };
}

/** @param {*} layer */
export function serializeManualTerrainPayload(layer: any) {
    if (!layer || layer.type !== 'terrain' || layer.dataSource !== 'manual') {
        return { points: null, coordinateMode: null };
    }

    const coordinateMode = _getCoordinateMode(layer.coordinateMode);
    const source = coordinateMode === 'utm' ? layer.sourcePoints : layer.sourcePoints || layer.points;
    const rows = Array.isArray(source) ? source : [];
    /** @type {any[]} */
    const rawPoints = [];

    for (const row of rows) {
        const raw = _extractRawPoint(row, coordinateMode);
        if (raw) rawPoints.push(raw);
    }

    return {
        coordinateMode,
        points: rawPoints,
    };
}
