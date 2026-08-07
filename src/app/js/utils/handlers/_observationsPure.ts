// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave AAAA1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1 strategy).
//
// Strategy: extract DOM-free observation rerender predicates + unit validation
// from utils/handlers/observations.js (1612 LOC, no TS twin, safe target).
// Pure: zero document/window/state refs. Deterministic given inputs.

/**
 * Fields that trigger full observation rerender when changed.
 * Frozen set, deterministic membership check.
 */
export const OBSERVATION_RERENDER_FIELDS = Object.freeze(
    new Set([
        'campaignId',
        'parameterId',
        'plannedParameterId',
        'plannedUnitId',
        'detect_flag',
        'uncertaintyType',
        'sample_type',
        'qa_pair_id',
        'event_type',
    ])
);

/**
 * True if changing this observation field requires full rerender.
 *
 * @param {string} field
 * @returns {boolean}
 */
export function shouldRerenderObservationField(field: any) {
    if (typeof field !== 'string') return false;
    return OBSERVATION_RERENDER_FIELDS.has(field);
}

/**
 * True if changing this reading field requires rerender.
 * Heuristic: certain fields always rerender; uncertainty rerenders only
 * if its visibility changed (empty → filled or vice-versa).
 *
 * @param {string} field
 * @param {any} prevValue
 * @param {any} nextValue
 * @returns {boolean}
 */
export function shouldRerenderReadingField(field: any, prevValue: any, nextValue: any) {
    if (typeof field !== 'string') return false;
    if (field === 'parameterId' || field === 'uncertaintyType' || field === 'autoConvert') {
        return true;
    }
    if (field === 'uncertainty') {
        const prevWasVisible = prevValue != null && prevValue !== '';
        const nextWillBeVisible = nextValue != null && nextValue !== '';
        return prevWasVisible !== nextWillBeVisible;
    }
    return false;
}

/**
 * Check if a unit is considered standard (within allowed list).
 * Empty allowedUnits means only empty/null/undefined unit is standard.
 *
 * @param {string|null|undefined} unit
 * @param {string[]|null|undefined} allowedUnits
 * @returns {boolean}
 */
export function isUnitStandard(unit: any, allowedUnits: any) {
    if (!Array.isArray(allowedUnits) || allowedUnits.length === 0) {
        return unit === '' || unit === null || unit === undefined;
    }
    return allowedUnits.includes(unit);
}

/**
 * Safe copy of observations array from element (zero mutation risk).
 * Returns empty array if element has no observations.
 *
 * @param {{data?:{observations?:any[]}}|null|undefined} element
 * @returns {any[]}
 */
export function getObservationsSafe(element: any) {
    return Array.isArray(element?.data?.observations) ? [...element.data.observations] : [];
}
