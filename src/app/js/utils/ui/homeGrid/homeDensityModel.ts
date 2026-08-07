// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic density controller for SPEC_HOME_REDESIGN_3COL_V3 Should item:
// "Densidade configurável (compact/comfortable) via customize".
// Hand-authored R1-safe. Sem DOM, sem localStorage (caller persiste).
//
// Spec NOT:
// - NÃO ler/escrever localStorage (caller responsável)
// - NÃO emoji em strings
// - NÃO depende Three.js/canvas

/**
 * @typedef {'compact'|'comfortable'} DensityMode
 */

const DENSITIES = Object.freeze(['compact', 'comfortable']);
const DEFAULT = 'comfortable';

const DENSITY_TOKENS = Object.freeze({
    compact: Object.freeze({
        spacing: 4,
        fontSizePx: 13,
        rowHeightPx: 28,
        paddingPx: 6,
        labelKey: 'home.density.compact',
    }),
    comfortable: Object.freeze({
        spacing: 8,
        fontSizePx: 14,
        rowHeightPx: 36,
        paddingPx: 10,
        labelKey: 'home.density.comfortable',
    }),
});

/**
 * Resolve density mode + normaliza input.
 * @param {string|null|undefined} input
 * @returns {DensityMode}
 */
export function resolveDensityMode(input: any) {
    if (DENSITIES.includes(/** @type {any} */ (input))) {
        return /** @type {DensityMode} */ (input);
    }
    return DEFAULT;
}

/**
 * Retorna tokens visuais para um modo (frozen).
 * @param {string} mode
 * @returns {object}
 */
export function getDensityTokens(mode: any) {
    const safe = resolveDensityMode(mode);
    return (DENSITY_TOKENS as Record<string, any>)[safe];
}

/**
 * Toggle entre compact e comfortable.
 * @param {string} current
 * @returns {DensityMode}
 */
export function toggleDensity(current: any) {
    return resolveDensityMode(current) === 'compact' ? 'comfortable' : 'compact';
}

/**
 * Builds VM para densidade toggle UI (button + label + tokens preview).
 * @param {string} currentMode
 * @returns {{currentMode:string, tokens:object, options:Array<{id:string, labelKey:string, active:boolean}>}}
 */
export function buildDensityToggleVM(currentMode: any) {
    const safe = resolveDensityMode(currentMode);
    return Object.freeze({
        currentMode: safe,
        tokens: (DENSITY_TOKENS as Record<string, any>)[safe],
        options: DENSITIES.map((d: any) => ({
            id: d,
            labelKey: (DENSITY_TOKENS as Record<string, any>)[d].labelKey,
            active: d === safe,
        })),
    });
}

/**
 * Builds CSS custom-property map para aplicar inline.
 * Caller: mainArea.style.setProperty('--home-spacing', `${vars.spacing}px`).
 * @param {string} mode
 * @returns {Record<string, string>}
 */
export function buildDensityCSSVars(mode: any) {
    const t = getDensityTokens(mode);
    return {
        '--home-spacing': `${t.spacing}px`,
        '--home-font-size': `${t.fontSizePx}px`,
        '--home-row-height': `${t.rowHeightPx}px`,
        '--home-padding': `${t.paddingPx}px`,
    };
}

export { DENSITIES as DENSITY_MODES };
