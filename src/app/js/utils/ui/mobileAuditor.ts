// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Mobile UI Auditor - pure-logic helpers for responsive validation.
 * UX-12 (2026-04-25) - viewport categorization, WCAG touch target audit,
 * overflow detection. No DOM side-effects: pure functions to enable cheap
 * unit testing without a browser.
 *
 * Auditor mobile - funções puras para classificar viewport, validar
 * tamanho mínimo de alvo de toque (WCAG 2.1 AA = 44×44 CSS px) e
 * detectar overflow horizontal. Sem efeitos no DOM, testável em Node.
 */

/** Frozen breakpoints (CSS px). Aligned with responsive.css. */
export const MOBILE_BREAKPOINTS = Object.freeze({
    SMALL: 600,
    MEDIUM: 800,
    LARGE: 1024,
});

/** Minimum touch target per WCAG 2.1 AA (Success Criterion 2.5.5). */
export const MIN_TOUCH_TARGET_PX = 44;

/**
 * Classify viewport width into a category.
 * @param {number} width - viewport width in CSS px
 * @returns {'small'|'medium'|'large'|'desktop'}
 */
export function getViewportCategory(width: number): 'small' | 'medium' | 'large' | 'desktop' {
    if (typeof width !== 'number' || !Number.isFinite(width) || width < 0) {
        return 'desktop';
    }
    if (width <= MOBILE_BREAKPOINTS.SMALL) return 'small';
    if (width <= MOBILE_BREAKPOINTS.MEDIUM) return 'medium';
    if (width <= MOBILE_BREAKPOINTS.LARGE) return 'large';
    return 'desktop';
}

/**
 * Check if an element meets WCAG 2.1 AA touch target size (44×44 px).
 * Accepts either a DOM element (uses getBoundingClientRect) or a plain
 * `{width, height}` shape - second form keeps the function pure for tests.
 * @param {Element|{width:number,height:number}} element
 * @returns {{valid:boolean, sizeXY:[number,number], recommended:[number,number]}}
 */
export function checkTouchTargetSize(
    element: Element | { width: number; height: number },
): { valid: boolean; sizeXY: [number, number]; recommended: [number, number] } {
    let width = 0;
    let height = 0;
    const el = element as any;
    if (el && typeof el.getBoundingClientRect === 'function') {
        const r = el.getBoundingClientRect();
        width = r.width;
        height = r.height;
    } else if (el && typeof el === 'object') {
        width = Number(el.width) || 0;
        height = Number(el.height) || 0;
    }
    const valid = width >= MIN_TOUCH_TARGET_PX && height >= MIN_TOUCH_TARGET_PX;
    return {
        valid,
        sizeXY: [width, height],
        recommended: [MIN_TOUCH_TARGET_PX, MIN_TOUCH_TARGET_PX],
    };
}

/**
 * Audit a list of touch targets. Each entry must expose `id` and either
 * a `getBoundingClientRect` method or `{width, height}` properties.
 * @param {Array<{id:string,width?:number,height?:number,getBoundingClientRect?:Function}>} buttons
 * @returns {Object<string,{valid:boolean,size:[number,number],recommended:[number,number]}>}
 */
export function auditTouchTargets(
    buttons: Array<{ id: string; width?: number; height?: number; getBoundingClientRect?: Function }>,
): Record<string, { valid: boolean; size: [number, number]; recommended: [number, number] }> {
    const result: Record<string, { valid: boolean; size: [number, number]; recommended: [number, number] }> = {};
    if (!Array.isArray(buttons)) return result;
    for (const btn of buttons) {
        if (!btn || typeof btn.id !== 'string' || !btn.id) continue;
        const r = checkTouchTargetSize(btn as any);
        result[btn.id] = {
            valid: r.valid,
            size: r.sizeXY,
            recommended: r.recommended,
        };
    }
    return result;
}

/**
 * Detect if an element overflows its viewport horizontally or vertically.
 * @param {{left:number,top:number,right:number,bottom:number}} element
 * @param {{width:number,height:number}} viewport
 * @returns {boolean}
 */
export function isElementOverflowing(
    element: { left: number; top: number; right: number; bottom: number },
    viewport: { width: number; height: number },
): boolean {
    if (!element || !viewport) return false;
    const vw = Number(viewport.width) || 0;
    const vh = Number(viewport.height) || 0;
    if (vw <= 0 || vh <= 0) return false;
    const left = Number(element.left) || 0;
    const top = Number(element.top) || 0;
    const right = Number(element.right) || 0;
    const bottom = Number(element.bottom) || 0;
    return left < 0 || top < 0 || right > vw || bottom > vh;
}
