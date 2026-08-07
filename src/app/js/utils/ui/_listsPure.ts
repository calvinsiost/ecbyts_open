// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave JJJJ1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free predicates + sort + counting from utils/ui/lists.js
// (#6 monolito 2621 LOC). Pure: zero document/window/state refs.

/**
 * Natural sort comparator for strings with numeric segments (e.g. "Well 2" < "Well 10").
 * Pure: deterministic via Intl.Collator numeric mode.
 *
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
export function naturalCompare( a: any, b: any) {
    return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), undefined, {
        numeric: true,
        sensitivity: 'base',
    });
}

/**
 * Check if any element belongs to a container family.
 *
 * @param {Array<{family?:string}>} elements
 * @param {Record<string, {isContainer?:boolean}>} families
 * @returns {boolean}
 */
export function hasAnyContainer( elements: any, families: any) {
    if (!Array.isArray(elements) || !families || typeof families !== 'object') return false;
    return elements.some((el: any) => el && families[el.family]?.isContainer === true);
}

/**
 * Compute sorted set of non-container family IDs from elements.
 * Pure: input arrays → sorted array (no DOM access).
 *
 * @param {Array<{family?:string}>} elements
 * @param {Record<string, {isContainer?:boolean}>} families
 * @returns {string[]} sorted unique family IDs (containers excluded)
 */
export function collectNonContainerFamilyIds( elements: any, families: any) {
    if (!Array.isArray(elements) || !families || typeof families !== 'object') return [];
    const seen = new Set();
    for (const el of elements) {
        if (!el || !el.family) continue;
        if (!families[el.family]?.isContainer) seen.add(el.family);
    }
    return [...seen].sort();
}

/**
 * Resolve human label for a family ID with fallback chain.
 * Pure: label || name || id fallback.
 *
 * @param {Record<string, {label?:string, name?:string}>} families
 * @param {string} families
 * @returns {string}
 */
export function resolveFamilyLabel( families: any, familyId: any) {
    if (!familyId || typeof familyId !== 'string') return '';
    const fam = families && typeof families === 'object' ? families[familyId] : null;
    if (!fam) return familyId;
    return fam.label || fam.name || familyId;
}

/**
 * Count elements per family (excluding containers).
 *
 * @param {Array<{family?:string}>} elements
 * @param {Record<string, {isContainer?:boolean}>} families
 * @returns {Record<string, number>} family ID → count
 */
export function countElementsPerFamily( elements: any, families: any) {
    if (!Array.isArray(elements)) return {};
    const counts: any = {};
    for (const el of elements) {
        if (!el || !el.family) continue;
        if (families && families[el.family]?.isContainer) continue;
        counts[el.family] = (counts[el.family] || 0) + 1;
    }
    return counts;
}

/** Sentinel key used for observations without a campaign. */
export const NO_CAMPAIGN_KEY = '__none__';

/**
 * lists.ts-local natural comparator (preserves the exact `String(a || '')`
 * coercion of the inline `_naturalCompare` in lists.ts — which treats `0`,
 * `''`, `false`, `NaN` as the empty string). Do NOT replace with the
 * `naturalCompare` above, which uses a `== null` coercion and would diverge
 * for falsy non-null values.
 *
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
function _localNaturalCompare( a: any, b: any) {
    return String(a || '').localeCompare(String(b || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
    });
}

/**
 * Group observations by campaign and produce the ordered list of campaign keys
 * for the element-details observations panel.
 *
 * Pure view-model: identical grouping + ordering to the inline block previously
 * in `updateElementDetails` (lists.ts). The caller still renders the HTML — this
 * only computes WHICH groups exist and in WHAT order:
 *   1. group by `obs.campaignId || NO_CAMPAIGN_KEY`, preserving the original
 *      array index of each observation (`originalIndex`);
 *   2. order keys so real campaigns come first (sorted by resolved name via the
 *      natural comparator) and the no-campaign sentinel always comes last.
 *
 * The campaign name is resolved through the injected `getCampaignName(key)` so
 * this function stays DOM/state-free. Sort fallback matches the original:
 * `campaignMap.get(key)?.name || key`.
 *
 * @param {Array<any>} observations - element.data.observations (any order)
 * @param {(key:string)=>(string|null|undefined)} getCampaignName - resolves a
 *   campaign display name for a key; return falsy to fall back to the key itself
 * @returns {{ grouped: Record<string, Array<{obs:any, originalIndex:number}>>, keys: string[] }}
 */
export function groupObservationsByCampaign( observations: any, getCampaignName: any) {
    const grouped: any = {};
    if (Array.isArray(observations)) {
        observations.forEach((obs: any, i: any) => {
            const key = (obs && obs.campaignId) || NO_CAMPAIGN_KEY;
            (grouped[key] = grouped[key] || []).push({ obs, originalIndex: i });
        });
    }
    const resolveName =
        typeof getCampaignName === 'function' ? getCampaignName : /** @param {any} exceedance? */ (k: any) => k;
    const keys = Object.keys(grouped).sort((a: any, b: any) => {
        if (a === NO_CAMPAIGN_KEY) return 1;
        if (b === NO_CAMPAIGN_KEY) return -1;
        const na = resolveName(a) || a;
        const nb = resolveName(b) || b;
        return _localNaturalCompare(na, nb);
    });
    return { grouped, keys };
}

/**
 * Compliance-badge descriptor for one observation severity verdict.
 *
 * Pure view-model: maps a validation `severity` (produced by
 * `validateObservationFull`) to the THREE display tokens the observation row
 * needs to build its compliance chip — the CSS class, the icon name, and the
 * short label. The caller (lists.ts) still renders the HTML and injects
 * `escapeHtml(message)` + `getIcon(iconName, …)`; this only decides WHICH
 * tokens apply so the decision is testable without DOM/icon/i18n deps.
 *
 * @typedef {{ cssClass: string, iconName: string, label: string }} ComplianceBadgeDescriptor
 */
export interface ComplianceBadgeDescriptor {
    readonly cssClass: string;
    readonly iconName: string;
    readonly label: string;
}

/**
 * Resolve the badge descriptor for a severity, or `null` when the severity is
 * not one of the six canonical compliance verdicts (no chip rendered).
 *
 * Identical mapping to the inline `if/else` chain previously in
 * `observationRow` (lists.ts):
 *   - `intervention`            → compliance-intervention / alert-circle   / exceedance || 'VI'
 *   - `prevention`             → compliance-prevention   / alert-triangle / 'VP'
 *   - `reference`              → compliance-reference    / info           / 'VR'
 *   - `intervention_uncertain` → compliance-uncertain    / alert-triangle / 'VI?'
 *   - `prevention_uncertain`   → compliance-uncertain    / alert-triangle / 'VP?'
 *   - `reference_uncertain`    → compliance-uncertain    / info           / 'VR?'
 *   - anything else            → null
 *
 * The `intervention` label honours the dynamic `exceedance` (e.g. a specific
 * threshold code) exactly like the original `r.exceedance || 'VI'`.
 *
 * @param {any} exceedance? - validation result severity string
 * @param {any} [severity] - optional exceedance code (only used by `intervention`)
 * @returns {ComplianceBadgeDescriptor|null}
 */
export function resolveComplianceBadge(
    severity: any,
    exceedance?: any,
): ComplianceBadgeDescriptor | null {
    switch (severity) {
        case 'intervention':
            return { cssClass: 'compliance-intervention', iconName: 'alert-circle', label: exceedance || 'VI' };
        case 'prevention':
            return { cssClass: 'compliance-prevention', iconName: 'alert-triangle', label: 'VP' };
        case 'reference':
            return { cssClass: 'compliance-reference', iconName: 'info', label: 'VR' };
        case 'intervention_uncertain':
            return { cssClass: 'compliance-uncertain', iconName: 'alert-triangle', label: 'VI?' };
        case 'prevention_uncertain':
            return { cssClass: 'compliance-uncertain', iconName: 'alert-triangle', label: 'VP?' };
        case 'reference_uncertain':
            return { cssClass: 'compliance-uncertain', iconName: 'info', label: 'VR?' };
        default:
            return null;
    }
}

/** Sentinel element key used for planned readings without an `elementId`. */
export const UNSET_ELEMENT_KEY = '__unset__';

/**
 * One element-group of planned readings, ready for the campaign card renderer.
 *
 * @typedef {{
 *   elId: string,
 *   items: Array<{ reading: any, idx: number, detail: any }>,
 *   groupDone: number,
 * }} PlannedReadingGroup
 */
export interface PlannedReadingGroup {
    readonly elId: string;
    readonly items: ReadonlyArray<{ reading: any; idx: number; detail: any }>;
    readonly groupDone: number;
}

/**
 * Group a campaign's planned readings by their `elementId` for the
 * campaigns-list card body.
 *
 * Pure view-model: identical grouping + ordering + counting to the inline IIFE
 * previously in `updateCampaignsList` (lists.ts). The caller still renders the
 * HTML and resolves element/parameter display names — this only computes WHICH
 * groups exist, in WHAT order, with WHICH items, and the executed count
 * (`groupDone`) per group:
 *   1. group by `reading.elementId || UNSET_ELEMENT_KEY`, preserving the
 *      original array index (`idx`) and pairing each reading with its
 *      completeness detail (`details[idx]`);
 *   2. keep first-seen group order (Map insertion order, like
 *      `[...groups.entries()]`);
 *   3. `groupDone` counts items whose `detail.executed` is truthy — matching the
 *      original `items.filter((i) => i.detail?.executed).length`.
 *
 * @param {Array<any>} readings - campaign.plannedReadings (any order)
 * @param {Array<any>} details - completeness.details, index-aligned with readings
 * @returns {PlannedReadingGroup[]} groups in first-seen element order
 */
export function groupPlannedReadingsByElement(readings: any, details: any): PlannedReadingGroup[] {
    const groups = new Map<string, Array<{ reading: any; idx: number; detail: any }>>();
    if (Array.isArray(readings)) {
        const detailArr = Array.isArray(details) ? details : [];
        readings.forEach((reading: any, idx: number) => {
            const key = (reading && reading.elementId) || UNSET_ELEMENT_KEY;
            if (!groups.has(key)) groups.set(key, []);
            (groups.get(key) as Array<any>).push({ reading, idx, detail: detailArr[idx] });
        });
    }
    return [...groups.entries()].map(([elId, items]) => ({
        elId,
        items,
        groupDone: items.filter((i) => i.detail?.executed).length,
    }));
}
