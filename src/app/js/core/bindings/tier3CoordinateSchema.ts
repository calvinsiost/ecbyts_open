// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export const TIER3_COORDINATE_SCHEMA_VERSION = 'tier3-coordinate-v1';

export const TIER3_COORDINATE_SYSTEMS: ReadonlyArray<string> = Object.freeze(['local', 'utm', 'wgs84']);

const MATRIX_UI_MODES: Readonly<Record<string, string>> = Object.freeze({
    groundwater: 'hidden',
    water: 'hidden',
    soil: 'depth',
    sediment: 'depth',
    sludge: 'depth',
    air: 'height',
    vapor: 'height',
    vapour: 'height',
    gas: 'height',
    dust: 'localized',
    solid: 'localized',
    sample: 'localized',
});

function finiteNumber(value: unknown, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeIdPart(value: unknown): string {
    return String(value || 'coordinate')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

export function normalizeTier3Matrix(matrix: unknown): string {
    return String(matrix || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
}

export function getTier3CoordinateUiMode(matrix: unknown): string {
    return MATRIX_UI_MODES[normalizeTier3Matrix(matrix)] || 'localized';
}

export function shouldShowTier3CoordinateUi(matrix: unknown): boolean {
    return getTier3CoordinateUiMode(matrix) !== 'hidden';
}

export function getTier3CoordinateAxesForMatrix(matrix: unknown): string[] {
    const mode = getTier3CoordinateUiMode(matrix);
    if (mode === 'hidden') return [];
    if (mode === 'depth' || mode === 'height') return ['y'];
    return ['x', 'y', 'z'];
}

export function createTier3CoordinatePoint(
    input: Record<string, any> = {},
    options: Record<string, any> = {},
): Record<string, any> {
    const matrix = normalizeTier3Matrix(input.matrix || options.matrix);
    const offset = input.position?.offset || input.offset || {};
    const coordinateSystem = TIER3_COORDINATE_SYSTEMS.includes(input.coordinateSystem)
        ? input.coordinateSystem
        : 'local';
    const id =
        input.id ||
        `coord-${normalizeIdPart(input.elementId || options.elementId)}-${normalizeIdPart(
            input.observationId || options.observationId || input.label || matrix || 'sample',
        )}`;

    const point: Record<string, any> = {
        schemaVersion: TIER3_COORDINATE_SCHEMA_VERSION,
        id,
        elementId: input.elementId || options.elementId || null,
        observationId: input.observationId || options.observationId || null,
        label: input.label || options.label || id,
        matrix,
        coordinateSystem,
        position: {
            coordinateSystem,
            offset: {
                x: finiteNumber(offset.x),
                y: finiteNumber(offset.y),
                z: finiteNumber(offset.z),
            },
        },
    };

    point.offset = { ...point.position.offset };

    if (input.utm && typeof input.utm === 'object') {
        point.utm = {
            easting: finiteNumber(input.utm.easting),
            northing: finiteNumber(input.utm.northing),
            elevation: finiteNumber(input.utm.elevation),
            zone: input.utm.zone || null,
        };
    }

    if (input.wgs84 && typeof input.wgs84 === 'object') {
        point.wgs84 = {
            lat: finiteNumber(input.wgs84.lat),
            lon: finiteNumber(input.wgs84.lon ?? input.wgs84.lng),
            elevation: finiteNumber(input.wgs84.elevation),
        };
    }

    return point;
}

export function createTier3CoordinateBindingMap(
    coordinateId: unknown,
    matrix: unknown,
    axes: string[] = getTier3CoordinateAxesForMatrix(matrix),
): Record<string, { targetType: string; targetId: string; targetPath: string; transform: string }> {
    const id = String(coordinateId || '').trim();
    if (!id) return {};

    const initial: Record<
        string,
        { targetType: string; targetId: string; targetPath: string; transform: string }
    > = {};
    return axes.reduce((bindings, axis) => {
        if (!['x', 'y', 'z'].includes(axis)) return bindings;
        bindings[`position.offset.${axis}`] = {
            targetType: 'coordinate',
            targetId: id,
            targetPath: `position.offset.${axis}`,
            transform: 'identity',
        };
        return bindings;
    }, initial);
}
