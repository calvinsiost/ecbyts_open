// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave MMMM1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free aerial feature classification + naming + extent
// from handlers/aerial.js (#10 monolito 1776 LOC). Pure: zero document/window.

/**
 * Frozen pt-BR family labels for aerial-detected features (display names).
 * Adicionar nova family → adicionar entrada aqui + cobrir no test.
 */
export const FAMILY_LABELS_PT: Readonly<Record<string, string>> = Object.freeze({
    building: 'Edificacao',
    tank: 'Tanque',
    lake: 'Corpo Hidrico',
    river: 'Curso de Agua',
    habitat: 'Vegetacao',
    marker: 'Solo Exposto',
    well: 'Poco',
});

/**
 * Resolve display label for an aerial family with fallback to family ID.
 *
 * @param {string} family
 * @returns {string}
 */
export function resolveFamilyLabelPT(family: any): string {
    if (!family || typeof family !== 'string') return '';
    return FAMILY_LABELS_PT[family] || family;
}

/**
 * Compute bounding extent {minX, maxX, minZ, maxZ} from array of 3D vertices.
 * Pure: returns null if input empty/invalid.
 *
 * @param {Array<{x?:number, y?:number, z?:number}>|null|undefined} vertices
 * @returns {{minX:number, maxX:number, minZ:number, maxZ:number}|null}
 */
export function computeAerialExtent(
    vertices: any,
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    if (!Array.isArray(vertices) || vertices.length === 0) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let any = false;
    for (const v of vertices) {
        if (!v || typeof v !== 'object') continue;
        const x = Number(v.x);
        const z = Number(v.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
        any = true;
    }
    if (!any) return null;
    return { minX, maxX, minZ, maxZ };
}

/**
 * Compute next sequential name index per family group.
 * Pure: aggregates existing features by family, returns starting counts.
 *
 * @param {Array<{family?:string, label?:string}>} existing
 * @returns {Record<string, number>} family → current count
 */
export function countExistingFeaturesByFamily(existing: any): Record<string, number> {
    if (!Array.isArray(existing)) return {};
    const counts: Record<string, number> = {};
    for (const f of existing) {
        if (!f || !f.family) continue;
        counts[f.family] = (counts[f.family] || 0) + 1;
    }
    return counts;
}

/**
 * Assign sequential names to features grouped by family.
 * Mutates features in place. Returns features for chaining.
 *
 * Naming pattern: "{Label} {N}" where Label resolves from FAMILY_LABELS_PT
 * and N starts at startingCounts[family]+1.
 *
 * @param {Array<{family?:string, label?:string}>} features
 * @param {Record<string, number>} [startingCounts] - per-family base offset
 * @returns {Array<{family?:string, label?:string}>}
 */
export function assignSequentialFamilyNames(features: any, startingCounts: Record<string, number> = {}): any[] {
    if (!Array.isArray(features)) return [];
    const counters: Record<string, number> = { ...(startingCounts || {}) };
    for (const f of features) {
        if (!f || !f.family || typeof f !== 'object') continue;
        if (f.label && typeof f.label === 'string' && f.label.trim() !== '') continue;
        const family = f.family;
        const next = (counters[family] || 0) + 1;
        counters[family] = next;
        f.label = `${resolveFamilyLabelPT(family)} ${next}`;
    }
    return features;
}

/**
 * Check if extent is valid (positive area).
 *
 * @param {{minX?:number, maxX?:number, minZ?:number, maxZ?:number}|null|undefined} extent
 * @returns {boolean}
 */
export function isValidExtent(extent: any): boolean {
    if (!extent || typeof extent !== 'object') return false;
    return (
        Number.isFinite(extent.minX) &&
        Number.isFinite(extent.maxX) &&
        Number.isFinite(extent.minZ) &&
        Number.isFinite(extent.maxZ) &&
        extent.maxX > extent.minX &&
        extent.maxZ > extent.minZ
    );
}
