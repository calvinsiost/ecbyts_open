// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_SPLIT_HOMEGRID — launchpad pure-logic extraction (Wave OOO1 claude-adm).
// Filter + limit + VM build for "Suggested Actions" launchpad section.
// Pure functions: no DOM, no IO, deterministic. Consumed by homeGrid._renderSuggested.
//
// Spec NOT:
// - NÃO acessar DOM
// - NÃO chamar window.hydrateIcons
// - NÃO emoji

import { validateSuggestedAction } from './homeGridActions.js';

/**
 * Filter gaps to valid SuggestedAction shape.
 * Pure: returns subset; logs ignored via injected logger (default: silent).
 *
 * @param {Array<any>} gaps
 * @param {(msg: string, id: string, errors: any) => void} [onInvalid]
 * @returns {Array<any>}
 */
export function filterValidGaps(gaps: any, onInvalid: any = null): any[] {
    if (!Array.isArray(gaps)) return [];
    return gaps.filter((g: any) => {
        const result = validateSuggestedAction(g);
        if (!result.valid) {
            if (typeof onInvalid === 'function') {
                onInvalid('invalid SuggestedAction skipped', g?.id || '(no id)', result.errors);
            }
            return false;
        }
        return true;
    });
}

/**
 * Limit gaps to top-N (default 3) preserving order.
 *
 * @param {Array<any>} gaps
 * @param {number} [maxGaps=3]
 * @returns {Array<any>}
 */
export function limitGapsToMax(gaps: any, maxGaps: any = 3): any[] {
    if (!Array.isArray(gaps)) return [];
    const max = Number.isFinite(maxGaps) && maxGaps >= 0 ? Math.floor(maxGaps) : 3;
    return gaps.slice(0, max);
}

/**
 * Decide visibility state for suggested section.
 * Returns 'hidden' | 'success' | 'gaps'.
 *
 * @param {boolean} bootPreparing - bootstrap-preparing-random flag
 * @param {any} completenessCheck - { gaps?: Array<any> } from computeCompleteness
 * @param {number} elementCount - safe count of elements
 * @returns {'hidden' | 'success' | 'gaps'}
 */
export function resolveSuggestedVisibility(bootPreparing: any, completenessCheck: any, elementCount: any): string {
    if (bootPreparing) return 'hidden';
    if (!completenessCheck || !Array.isArray(completenessCheck.gaps) || completenessCheck.gaps.length === 0) {
        const n = Number.isFinite(elementCount) ? elementCount : 0;
        return n > 0 ? 'success' : 'hidden';
    }
    return 'gaps';
}

/**
 * Build VM row for a suggested action (icon class, message, handler ref).
 * Pure: no DOM mutation, only data transformation.
 *
 * @param {any} gap - validated SuggestedAction
 * @param {(key: string) => string} [translate] - i18n fn (default identity fallback)
 * @returns {{ iconName: string, severity: string, message: string, handler: string, btnTitle: string }}
 */
export function buildSuggestedRowVM(gap: any, translate: any = null): any {
    const t = typeof translate === 'function' ? translate : (k: any) => k;
    const severity = typeof gap?.severity === 'string' ? gap.severity : 'info';
    const message = typeof gap?.msg === 'string' ? gap.msg : '';
    const handler = typeof gap?.handler === 'string' ? gap.handler : '';
    return {
        iconName: gap?.icon || 'lightbulb',
        severity,
        message,
        handler,
        btnTitle: t('homeSuggestedGo') || 'Go',
    };
}

/**
 * Full launchpad VM: combines visibility + filter + limit + per-row VMs.
 *
 * @param {{ bootPreparing: any, completenessCheck: any, elementCount: any, translate?: any, maxGaps?: number }} input
 * @returns {{ visibility: string, headerTitle: string | null, rows: Array<any> }}
 */
export function buildLaunchpadVM(input: any): any {
    if (!input || typeof input !== 'object') {
        return { visibility: 'hidden', headerTitle: null, rows: [] };
    }
    const visibility = resolveSuggestedVisibility(input.bootPreparing, input.completenessCheck, input.elementCount);
    const t = typeof input.translate === 'function' ? input.translate : (k: any) => k;
    if (visibility !== 'gaps') {
        return { visibility, headerTitle: null, rows: [] };
    }
    const gaps = input.completenessCheck?.gaps || [];
    const valid = filterValidGaps(gaps);
    const limited = limitGapsToMax(valid, input.maxGaps);
    const rows = limited.map((g: any) => buildSuggestedRowVM(g, t));
    return {
        visibility,
        headerTitle: t('homeSuggestedTitle') || 'Suggested Actions',
        rows,
    };
}
