// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export type RedactionLevel = 'none' | 'mask' | 'remove';

export const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
export const PHONE_BR_RE = /\(?[1-9]{2}\)?\s?9?\d{4}-?\d{4}/g;
export const CPF_RE = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g;

const MASK_TOKEN = '***';
const PII_MATCHERS = Object.freeze([EMAIL_RE, CPF_RE, PHONE_BR_RE]);
const GEOMETRY_TYPES = new Set([
    'Point',
    'LineString',
    'Polygon',
    'MultiPoint',
    'MultiLineString',
    'MultiPolygon',
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isPurePII(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    for (const re of PII_MATCHERS) {
        const anchored = new RegExp(`^(?:${re.source})$`);
        if (anchored.test(trimmed)) return true;
    }
    return false;
}

function maskPIIString(value: string): string {
    if (!value) return value;
    let out = value;
    for (const re of PII_MATCHERS) {
        re.lastIndex = 0;
        out = out.replace(re, MASK_TOKEN);
    }
    return out;
}

export function redactPII(data: unknown, level: RedactionLevel): unknown {
    if (level === 'none' || !level) {
        return data;
    }
    if (level !== 'mask' && level !== 'remove') {
        throw new Error(`[radar:redactionEngine] Invalid level: ${level}`);
    }
    return walk(data, level, null, new WeakSet<object>());
}

function truncDecimal(value: number, precision: number): number {
    if (!Number.isFinite(value)) return value;
    const factor = Math.pow(10, Math.max(0, Math.floor(precision)));
    return Math.round(value * factor) / factor;
}

function truncCoordTree(coords: unknown, precision: number): unknown {
    if (typeof coords === 'number') return truncDecimal(coords, precision);
    if (Array.isArray(coords)) {
        return coords.map((coord) => truncCoordTree(coord, precision));
    }
    return coords;
}

export function redactCoordinates(geometry: unknown, precision: number): unknown {
    if (!isObjectRecord(geometry)) return geometry;
    if (!Number.isFinite(precision) || precision < 0) {
        return geometry;
    }

    if (Array.isArray(geometry.geometries)) {
        const out: Record<string, unknown> = { ...geometry };
        out.geometries = geometry.geometries.map((geom) => redactCoordinates(geom, precision));
        return out;
    }

    if (!('coordinates' in geometry)) return geometry;

    const out: Record<string, unknown> = { ...geometry };
    out.coordinates = truncCoordTree(geometry.coordinates, precision);
    return out;
}

export function walkAndRedact(obj: unknown, level: RedactionLevel, precision?: number | null): unknown {
    const prec = typeof precision === 'number' && Number.isFinite(precision) ? precision : null;
    return walk(obj, level || 'none', prec, new WeakSet<object>());
}

function looksLikeGeometry(node: unknown): node is Record<string, unknown> {
    if (!isObjectRecord(node) || typeof node.type !== 'string') return false;
    return (
        (GEOMETRY_TYPES.has(node.type) && 'coordinates' in node) ||
        (node.type === 'GeometryCollection' && Array.isArray(node.geometries))
    );
}

function walk(node: unknown, level: RedactionLevel, precision: number | null, seen: WeakSet<object>): unknown {
    if (node === null || node === undefined) return node;
    if (typeof node === 'string') {
        if (level === 'mask' || level === 'remove') return maskPIIString(node);
        return node;
    }
    if (typeof node !== 'object') return node;

    if (seen.has(node)) return null;
    seen.add(node);

    if (precision !== null && looksLikeGeometry(node)) {
        const geom = redactCoordinates(node, precision);
        return walkObject(geom as Record<string, unknown>, level, precision, seen, true);
    }

    if (Array.isArray(node)) {
        return node.map((item) => walk(item, level, precision, seen));
    }

    return walkObject(node as Record<string, unknown>, level, precision, seen, false);
}

function walkObject(
    obj: Record<string, unknown>,
    level: RedactionLevel,
    precision: number | null,
    seen: WeakSet<object>,
    skipGeometry: boolean,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const value = obj[key];

        if (level === 'remove' && typeof value === 'string' && isPurePII(value)) {
            continue;
        }

        if (skipGeometry && key === 'coordinates') {
            out[key] = value;
            continue;
        }

        out[key] = walk(value, level, precision, seen);
    }
    return out;
}
