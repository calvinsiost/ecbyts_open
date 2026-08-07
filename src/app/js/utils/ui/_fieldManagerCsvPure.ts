// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure CSV serialization for fieldManager Parameters + Units export.
// DOM-free, framework-free. Caller hooks into Blob/anchor download.
// Extracted Wave WWWW1 for Manage Fields CSV export feature.

export const PARAMETER_CSV_HEADERS: readonly string[] = Object.freeze([
    'id',
    'displayName',
    'category',
    'defaultUnitId',
    'defaultUnitSymbol',
    'type',
    'source',
]);

export const UNIT_CSV_HEADERS: readonly string[] = Object.freeze([
    'id',
    'symbol',
    'name',
    'dimension',
    'factor',
    'siBase',
    'source',
]);

export function escapeCsvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (s === '') return '';
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

export function buildCsvRow(cells: ReadonlyArray<unknown>): string {
    return cells.map(escapeCsvCell).join(',');
}

export type ParameterCsvRow = {
    id: string;
    displayName: string;
    category: string;
    defaultUnitId: string;
    defaultUnitSymbol: string;
    type: string;
    source: 'system' | 'user';
};

function _resolveParameterDisplayName(
    param: unknown,
    id: string,
    displayNameResolver?: (p: unknown) => string,
): string {
    if (displayNameResolver) {
        const resolved = displayNameResolver(param);
        if (resolved != null && resolved !== '') return String(resolved);
    }
    const p = param as Record<string, unknown> | null | undefined;
    const name = p?.name ?? p?.displayName;
    if (name != null && name !== '') return String(name);
    return id;
}

function _findUnitSymbol(units: ReadonlyArray<unknown>, defaultUnitId: string): string {
    if (!defaultUnitId) return '';
    const unit = units.find((u) => {
        const candidate = u as Record<string, unknown> | null | undefined;
        return candidate?.id === defaultUnitId;
    });
    if (!unit) return '';
    return String((unit as Record<string, unknown>).symbol ?? '');
}

export function parameterToCsvRow(
    param: unknown,
    units: ReadonlyArray<unknown>,
    userParamIds: ReadonlySet<string>,
    displayNameResolver?: (p: unknown) => string,
): ParameterCsvRow {
    const p = param as Record<string, unknown> | null | undefined;
    const id = String(p?.id ?? '');
    const displayName = _resolveParameterDisplayName(param, id, displayNameResolver);
    const category = String(p?.category ?? 'custom');
    const defaultUnitId = String(p?.defaultUnitId ?? '');
    const defaultUnitSymbol = _findUnitSymbol(units, defaultUnitId);
    const type = String(p?.type ?? 'system');
    const source: 'system' | 'user' = userParamIds.has(id) ? 'user' : 'system';
    return { id, displayName, category, defaultUnitId, defaultUnitSymbol, type, source };
}

export function parametersToCsv(
    parameters: ReadonlyArray<unknown>,
    units: ReadonlyArray<unknown>,
    userParamIds: ReadonlySet<string>,
    displayNameResolver?: (p: unknown) => string,
): string {
    const rows: string[] = [buildCsvRow(PARAMETER_CSV_HEADERS)];
    for (const p of parameters) {
        if (!p || typeof p !== 'object') continue;
        const r = parameterToCsvRow(p, units, userParamIds, displayNameResolver);
        rows.push(
            buildCsvRow([
                r.id,
                r.displayName,
                r.category,
                r.defaultUnitId,
                r.defaultUnitSymbol,
                r.type,
                r.source,
            ]),
        );
    }
    return rows.join('\r\n') + '\r\n';
}

export type UnitCsvRow = {
    id: string;
    symbol: string;
    name: string;
    dimension: string;
    factor: string;
    siBase: string;
    source: 'system' | 'user';
};

function _formatUnitFactor(unit: Record<string, unknown>): string {
    const factorRaw = unit.factor;
    return typeof factorRaw === 'number' && Number.isFinite(factorRaw) ? String(factorRaw) : '';
}

function _resolveSiBase(unit: Record<string, unknown>): string {
    return String(unit.siBase ?? unit.si ?? '');
}

export function unitToCsvRow(unit: unknown, userUnitIds: ReadonlySet<string>): UnitCsvRow {
    const u = unit as Record<string, unknown> | null | undefined;
    const id = String(u?.id ?? '');
    const symbol = String(u?.symbol ?? '');
    const name = String(u?.name ?? '');
    const dimension = String(u?.dimension ?? 'other');
    const factor = u ? _formatUnitFactor(u) : '';
    const siBase = u ? _resolveSiBase(u) : '';
    const source: 'system' | 'user' = userUnitIds.has(id) ? 'user' : 'system';
    return { id, symbol, name, dimension, factor, siBase, source };
}

export function unitsToCsv(units: ReadonlyArray<unknown>, userUnitIds: ReadonlySet<string>): string {
    const rows: string[] = [buildCsvRow(UNIT_CSV_HEADERS)];
    for (const u of units) {
        if (!u || typeof u !== 'object') continue;
        const r = unitToCsvRow(u, userUnitIds);
        rows.push(buildCsvRow([r.id, r.symbol, r.name, r.dimension, r.factor, r.siBase, r.source]));
    }
    return rows.join('\r\n') + '\r\n';
}

export function buildCsvFilename(kind: 'parameters' | 'units', date: Date = new Date()): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `ecbyts-${kind}-${yyyy}${mm}${dd}-${hh}${mi}.csv`;
}

export function csvWithBom(csv: string): string {
    if (csv.startsWith('﻿')) return csv;
    return '﻿' + csv;
}
