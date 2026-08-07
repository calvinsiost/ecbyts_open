// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave GGGG1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free predicates + opacity presets + coord offsetters from
// handlers/elements.js (#11 monolito 1676 LOC). Pure: zero document/window/state.

/**
 * Frozen opacity presets per layer type, per visual mode.
 * Used by random model generation to set layer transparency.
 */
export const RANDOM_LAYER_OPACITY_PRESETS = Object.freeze({
    transparent: Object.freeze({
        terrain: 0.36,
        water_table: 0.24,
        potentiometric: 0.32,
        contamination: 0.46,
        geology: 0.34,
        custom: 0.5,
    }),
    solid: Object.freeze({
        terrain: 0.82,
        water_table: 0.58,
        potentiometric: 0.64,
        contamination: 0.74,
        geology: 0.7,
        custom: 0.78,
    }),
});

/**
 * Resolve opacity value for a given layer type + visual mode.
 *
 * @param {string} layerType - 'terrain'|'water_table'|'potentiometric'|'contamination'|'geology'|'custom'
 * @param {boolean} useTransparent
 * @returns {number|null} opacity in [0..1] or null if layerType unknown
 */
export function resolveLayerOpacity( layerType: any, useTransparent: any) {
    const preset = useTransparent ? RANDOM_LAYER_OPACITY_PRESETS.transparent : RANDOM_LAYER_OPACITY_PRESETS.solid;
    const op = (preset as any)[layerType];
    return Number.isFinite(op) ? op : null;
}

/**
 * True if element field change requires live DOM patch (live chrome update).
 *
 * @param {string} field
 * @returns {boolean}
 */
export function shouldLivePatchElementField( field: any) {
    if (typeof field !== 'string') return false;
    return field === 'name' || field === 'label' || field === 'description' || field === 'iconClass';
}

/**
 * Offset element coordinates by amount based on family conventions.
 * Mutates data object in place (returns it for chaining).
 *
 * Family conventions:
 * - well: data.coordinates {easting, northing}
 * - plume: data.center {x, z}
 * - others with data.position: data.position {x, z}
 * - others with data.vertices: each {x, z}
 * - others with data.path: each {x, z}
 *
 * @param {Record<string, any>} data
 * @param {string} family
 * @param {number} offset
 * @returns {Record<string, any>} mutated data
 */
export function offsetElementCoordinates( data: any, family: any, offset: any) {
    if (!data || typeof data !== 'object') return data;
    if (!Number.isFinite(offset)) return data;
    if (family === 'well' && data.coordinates) {
        data.coordinates.easting = (Number(data.coordinates.easting) || 0) + offset;
        data.coordinates.northing = (Number(data.coordinates.northing) || 0) + offset;
    } else if (family === 'plume' && data.center) {
        data.center.x = (Number(data.center.x) || 0) + offset;
        data.center.z = (Number(data.center.z) || 0) + offset;
    } else if (data.position) {
        data.position.x = (Number(data.position.x) || 0) + offset;
        data.position.z = (Number(data.position.z) || 0) + offset;
    } else if (Array.isArray(data.vertices) && data.vertices.length > 0) {
        for (const v of data.vertices) {
            if (v && typeof v === 'object') {
                v.x = (Number(v.x) || 0) + offset;
                v.z = (Number(v.z) || 0) + offset;
            }
        }
    } else if (Array.isArray(data.path) && data.path.length > 0) {
        for (const p of data.path) {
            if (p && typeof p === 'object') {
                p.x = (Number(p.x) || 0) + offset;
                p.z = (Number(p.z) || 0) + offset;
            }
        }
    }
    return data;
}
