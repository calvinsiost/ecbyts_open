// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave SSSS1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free identity validation + step navigation math from
// utils/ui/productWizard.js (#22 monolito 1207 LOC). Pure: zero document refs.

/**
 * Validate product identity fields (name + category).
 * Returns {valid, errors} — errors keyed by field for caller to render.
 *
 * @param {{name?:string, category?:string}|null|undefined} identity
 * @returns {{valid:boolean, errors:Record<string, string>}}
 */
export function validateProductIdentity(identity: any): { valid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};
    const name = (identity && typeof identity.name === 'string' ? identity.name : '').trim();
    const category = identity && typeof identity.category === 'string' ? identity.category : '';
    if (name.length < 3) {
        errors.name = 'Nome deve ter ao menos 3 caracteres';
    }
    if (!category) {
        errors.category = 'Selecione uma categoria';
    }
    return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Compute next step considering AI-conditional skip.
 * Step 4 is AI-only; if ai_enabled=false, jump directly to 5.
 *
 * @param {number} currentStep - 1..5
 * @param {{ai_enabled?:boolean}|null|undefined} product
 * @returns {number} next step (1..5), capped at 5 if at end
 */
export function computeNextStep(currentStep: any, product: any): number {
    const cs = Number.isFinite(currentStep) ? currentStep : 1;
    let next = cs + 1;
    if (next === 4 && !(product && product.ai_enabled)) next = 5;
    if (next > 5) return cs;
    if (next < 1) return 1;
    return next;
}

/**
 * Compute previous step considering AI-conditional skip.
 * Step 4 is AI-only; if ai_enabled=false going back from 5, jump to 3.
 *
 * @param {number} currentStep
 * @param {{ai_enabled?:boolean}|null|undefined} product
 * @returns {number} previous step (1..5), capped at 1
 */
export function computePrevStep(currentStep: any, product: any): number {
    const cs = Number.isFinite(currentStep) ? currentStep : 1;
    let prev = cs - 1;
    if (prev === 4 && !(product && product.ai_enabled)) prev = 3;
    if (prev < 1) return cs;
    return prev;
}

/**
 * Check if a step number is valid within wizard range [1..5].
 *
 * @param {number} step
 * @returns {boolean}
 */
export function isValidStep(step: any): boolean {
    if (!Number.isFinite(step)) return false;
    const n = Math.floor(step);
    return n >= 1 && n <= 5;
}

/**
 * Filter steps that are reachable given product config.
 * Step 4 (AI configuration) skipped if ai_enabled=false.
 *
 * @param {{ai_enabled?:boolean}|null|undefined} product
 * @returns {number[]} sorted array of reachable step numbers
 */
export function getReachableSteps(product: any): number[] {
    const aiEnabled = product && product.ai_enabled;
    const all = [1, 2, 3, 4, 5];
    return aiEnabled ? all : all.filter((s) => s !== 4);
}

/**
 * Compute progress percent based on current step / total reachable.
 *
 * @param {number} currentStep
 * @param {{ai_enabled?:boolean}|null|undefined} product
 * @returns {number} percent in [0..100]
 */
export function computeProgressPercent(currentStep: any, product: any): number {
    if (!isValidStep(currentStep)) return 0;
    const reachable = getReachableSteps(product);
    const idx = reachable.indexOf(Math.floor(currentStep));
    if (idx < 0) return 0;
    return Math.round(((idx + 1) / reachable.length) * 100);
}
