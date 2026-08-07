// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { toFiniteNumber } from './toFiniteNumber.js';

/**
 * Helpers for Rich Document "Decisoes Tecnicas" flow.
 * Kept pure so they can be unit-tested without DOM dependencies.
 */

const MATRIX_VALUES = Object.freeze(['soil', 'groundwater', 'surface_water', 'sediment', 'air', 'vapor', 'waste']);
const MATRIX_VALUE_SET = new Set(MATRIX_VALUES);

export function getDocMatrixValues() {
    return [...MATRIX_VALUES];
}

export function normalizeDocMatrixValue(value: any) {
    return MATRIX_VALUE_SET.has(value) ? value : null;
}

export function buildDocMatrixKey(reading: any) {
    const page = toFiniteNumber(reading?.source?.page, 0);
    const tableIndex = toFiniteNumber(reading?.source?.tableIndex, 0);
    return `p${page}:t${tableIndex}`;
}

export function isDocMatrixAmbiguous(reading: any) {
    if (!reading) return false;
    if (reading?.source?.matrixAmbiguous === true) return true;
    const warnings = Array.isArray(reading.warnings) ? reading.warnings : [];
    return warnings.some((w: any) => /matrix\s+ambiguous/i.test(String((w as any) || '')));
}

export function collectDocMatrixBuckets(readings: any) {
    const buckets = new Map();
    const list = Array.isArray(readings) ? readings : [];

    for (const reading of list) {
        if (!isDocMatrixAmbiguous(reading)) continue;

        const key = buildDocMatrixKey(reading);
        if (!buckets.has(key)) {
            buckets.set(key, {
                key,
                page: Number.isFinite(reading?.source?.page) ? reading.source.page : 0,
                tableIndex: Number.isFinite(reading?.source?.tableIndex) ? reading.source.tableIndex : 0,
                count: 0,
                sampleParams: [],
            });
        }

        const entry = buckets.get(key);
        entry.count += 1;
        const param = reading.parameterId || reading.parameterName || '';
        if (param && entry.sampleParams.length < 3 && !entry.sampleParams.includes(param)) {
            entry.sampleParams.push(param);
        }
    }

    return [...buckets.values()].sort(
        (a, b) => a.page - b.page || a.tableIndex - b.tableIndex || a.key.localeCompare(b.key),
    );
}

function toPositiveNumber(value: any) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
}

function cloneArray(list: any) {
    return Array.isArray(list) ? list.map((item) => ({ ...(item || {}) })) : [];
}

export function createEmptyWellProfile() {
    return {
        constructive: {
            totalDepth: 50,
            drillingDepth: 50,
            boreholeDiameter: 10,
            casingDiameter: 4,
            drillingMethod: 'hollow_stem_auger',
            elements: [],
        },
        lithologic: [],
        waterLevel: null,
        vocReadings: [],
    } as any;
}

function normalizeWellProfile(profile: any) {
    if (!profile || typeof profile !== 'object') return createEmptyWellProfile();

    const base = createEmptyWellProfile();
    const constructive = profile.constructive && typeof profile.constructive === 'object' ? profile.constructive : {};

    base.constructive = {
        ...base.constructive,
        ...constructive,
        elements: cloneArray(constructive.elements),
    };
    base.lithologic = cloneArray(profile.lithologic);
    base.vocReadings = cloneArray(profile.vocReadings);

    if (profile.waterLevel && typeof profile.waterLevel === 'object') {
        const depth = toPositiveNumber(profile.waterLevel.depth);
        if (depth != null) {
            base.waterLevel = {
                depth,
                date: profile.waterLevel.date || null,
            };
        }
    }

    return base;
}

function hasProfileSignal(profile: any) {
    if (!profile) return false;
    const c = profile.constructive || {};
    if (toPositiveNumber(c.totalDepth) != null) return true;
    if (toPositiveNumber(c.drillingDepth) != null) return true;
    if (toPositiveNumber(c.boreholeDiameter) != null) return true;
    if (toPositiveNumber(c.casingDiameter) != null) return true;
    if (Array.isArray(c.elements) && c.elements.length > 0) return true;
    if (Array.isArray(profile.lithologic) && profile.lithologic.length > 0) return true;
    if (profile.waterLevel?.depth != null) return true;
    return false;
}

function pushUniqueByJson(target: any, incoming: any) {
    const seen = new Set(target.map((item: any) => JSON.stringify((item as any) || {})));
    for (const item of incoming) {
        const key = JSON.stringify(item || {});
        if (seen.has(key)) continue;
        target.push(item);
        seen.add(key);
    }
}

function mergeWellProfileAppend(existingProfile: any, patch: any) {
    const base = normalizeWellProfile(existingProfile);
    const incoming = normalizeWellProfile(patch);

    const bc = base.constructive || {};
    const ic = incoming.constructive || {};

    for (const key of ['totalDepth', 'drillingDepth', 'boreholeDiameter', 'casingDiameter']) {
        if (toPositiveNumber(bc[key]) == null && toPositiveNumber(ic[key]) != null) {
            bc[key] = ic[key];
        }
    }
    if (!bc.drillingMethod && ic.drillingMethod) bc.drillingMethod = ic.drillingMethod;

    const baseElements: any[] = Array.isArray(bc.elements) ? bc.elements : [];
    const incomingElements: any[] = Array.isArray(ic.elements) ? ic.elements : [];
    pushUniqueByJson(baseElements, incomingElements);
    bc.elements = baseElements;
    base.constructive = bc;

    const baseLithologic: any[] = Array.isArray(base.lithologic) ? base.lithologic : [];
    pushUniqueByJson(baseLithologic, Array.isArray(incoming.lithologic) ? incoming.lithologic : []);
    base.lithologic = baseLithologic;

    if ((!base.waterLevel || toPositiveNumber(base.waterLevel.depth) == null) && incoming.waterLevel?.depth != null) {
        base.waterLevel = { ...incoming.waterLevel };
    }

    const baseVoc: any[] = Array.isArray(base.vocReadings) ? base.vocReadings : [];
    pushUniqueByJson(baseVoc, Array.isArray(incoming.vocReadings) ? incoming.vocReadings : []);
    base.vocReadings = baseVoc;

    return hasProfileSignal(base) ? base : null;
}

/**
 * Build profile patch from extracted fields.
 * @param fields
 * @param fallbackDate
 */
export function buildWellProfilePatch(
    fields: Array<{ field: string; value: any; _import?: boolean; type?: string }>,
    fallbackDate: string | null = null,
): Object | null {
    const patch = createEmptyWellProfile();
    let changed = false;

    for (const row of Array.isArray(fields) ? fields : []) {
        if (row?._import === false) continue;
        const field = String(row?.field || '');
        const value = row?.value;
        if (!field.startsWith('well.profile.')) continue;

        if (field === 'well.profile.constructive.totalDepth') {
            const depth = toPositiveNumber(value);
            if (depth != null) {
                patch.constructive.totalDepth = depth;
                patch.constructive.drillingDepth = depth;
                changed = true;
            }
            continue;
        }

        if (field === 'well.profile.waterLevel.depth') {
            const depth = toPositiveNumber(value);
            if (depth != null) {
                patch.waterLevel = { depth, date: fallbackDate || null };
                changed = true;
            }
            continue;
        }

        if (field.startsWith('well.profile.constructive.')) {
            const key = field.replace('well.profile.constructive.', '');
            if (!key) continue;
            const numeric = toPositiveNumber(value);
            patch.constructive[key] = numeric != null ? numeric : value;
            changed = true;
            continue;
        }

        if (field.startsWith('well.profile.lithologic')) {
            if (Array.isArray(value)) {
                pushUniqueByJson(
                    patch.lithologic,
                    value.map((v) => ({ ...(v || {}) })),
                );
                changed = true;
                continue;
            }
            if (typeof value === 'string' && value.trim()) {
                patch.lithologic.push({
                    from: null,
                    to: null,
                    description: value.trim(),
                    classification: '',
                    soilType: null,
                    color: '',
                    moisture: '',
                    observations: '',
                });
                changed = true;
            }
            continue;
        }
    }

    if (patch.waterLevel && !patch.waterLevel.date) {
        patch.waterLevel.date = fallbackDate || null;
    }

    return changed && hasProfileSignal(patch) ? normalizeWellProfile(patch) : null;
}

/**
 * Merge profile according to strategy.
 * @param existingProfile
 * @param patch
 * @param strategy
 */
export function mergeWellProfileByStrategy(
    existingProfile: Object | null,
    patch: Object | null,
    strategy: 'replace' | 'append' | 'skip',
): Object | null {
    if (strategy === 'skip') return existingProfile ? normalizeWellProfile(existingProfile) : null;
    if (!patch) return existingProfile ? normalizeWellProfile(existingProfile) : null;
    if (strategy === 'replace') return normalizeWellProfile(patch);
    return mergeWellProfileAppend(existingProfile, patch);
}
