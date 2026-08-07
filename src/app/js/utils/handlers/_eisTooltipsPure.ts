// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave ZZZ1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P2 strategy).
//
// Strategy: extract pure tooltip formatters from utils/handlers/eis.js (2815 LOC).
// Caller provides translator `t()` + axis + result; pure module returns string.
//
// Spec NOT:
// - NÃO referenciar document/window/localStorage
// - NÃO importar translations directly (caller injects t())
// - NÃO emoji

/**
 * Format eis auto-tooltip per axis from result object.
 * Pure: deterministic given inputs. Caller injects translator `t`.
 *
 * @param {string} axis - One of 'T'|'A'|'Cp'|'Ty'|'Cs'|'Cm' or other
 * @param {Object} result - axis-specific result object
 * @param {(key:string)=>string} t - translator (returns string or empty)
 * @returns {string}
 */
export function buildAutoTooltipPure(axis: any, result: any, t: any) {
    const auto = t('eis.auto') || 'Auto';
    const r = result || {};
    switch (axis) {
        case 'T': {
            const mult = r.aggregateMultiplier?.toFixed(2) || '1.00';
            const traced = Math.round((r.tracedRatio || 0) * 100);
            const tracedLabel = t('eis.traced') || 'traced';
            return `${auto}: ${mult}x | ${traced}% ${tracedLabel}`;
        }
        case 'A': {
            if (r.method === 'sensor') {
                const opLabel = t('eis.sensors_operational') || 'operational';
                return `${auto}: ${r.sensorsOperational || 0}/${r.sensorsTotal || 0} ${opLabel}`;
            }
            const validPct = Math.round((r.validationRatio || 0) * 100);
            const limLabel = t('eis.within_limits') || 'within limits';
            return `${auto}: ${validPct}% ${limLabel}`;
        }
        case 'Cp': {
            const exec = r.totalExecuted || 0;
            const plan = r.totalPlanned || 0;
            const pct = Math.round((r.ratio || 0) * 100);
            return `${auto}: ${exec}/${plan} (${pct}%)`;
        }
        case 'Ty': {
            const medLabel = t('eis.median_age') || 'median';
            const days = r.medianAgeDays?.toFixed(0) || '?';
            return `${auto}: ${medLabel} ${days}d`;
        }
        case 'Cs': {
            const std = r.standardCount || 0;
            const total = r.totalCount || 0;
            const pct = Math.round((r.ratio || 0) * 100);
            return `${auto}: ${std}/${total} (${pct}%)`;
        }
        case 'Cm': {
            const mapped = r.mappedCount || 0;
            const total = r.totalCount || 0;
            const mapLabel = t('eis.mapped') || 'mapped';
            return `${auto}: ${mapped}/${total} ${mapLabel}`;
        }
        default:
            return auto;
    }
}

/**
 * Default fallback translator for tests / standalone usage.
 *
 * @param {string} _key
 * @returns {string}
 */
export function fallbackTranslator(_key: any) {
    return '';
}
