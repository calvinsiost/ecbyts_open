// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Sales Wizard helpers - auto-fill of environmental key from current model.
 *
 * Implements Item 9.55 SPEC_SALES_WIZARD_AUTO_KEY core helpers as a pure
 * Node-testable module. UI integration into productWizard.js / future
 * dedicated sales wizard is a thin call to these functions:
 *
 *   import { getCurrentModelInfo, maskModelKey, canAutoFill,
 *            formatModelDisplay } from '.../salesWizardHelpers.js';
 *
 *   const info = await getCurrentModelInfo();
 *   if (canAutoFill(info)) {
 *       document.getElementById('wizard-key').value = info.key;
 *       document.getElementById('wizard-key-display').textContent =
 *           formatModelDisplay(info);
 *   }
 *
 * Why a separate pure module? Productivity gain comes from reusing the
 * same helpers across:
 *   - existing productWizard step (currently auto-generates key inside
 *     _handleGenerateDocument)
 *   - future dedicated sales wizard
 *   - checkout modal "use current model" preset
 *   - admin panel "create sale on behalf of user" workflow
 *
 * Instead of duplicating "read model id + generate key + format display"
 * in each caller, define it once here.
 *
 * Reference: docs/IMPLEMENTATION_ROADMAP.md §9.55
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Number of trailing characters to keep visible when masking a model key.
 * The first part is masked with '•'. Default: 4 chars (matches credit card
 * display convention) so users can verify the right key without leaking it
 * in screenshots.
 */
export const KEY_MASK_VISIBLE_TAIL = 4;
const KEY_MASK_CHAR = '•';

/**
 * Maximum age (ms) of model state before auto-fill is considered stale.
 * Default 5 minutes - older state means user might have switched models
 * since the wizard was opened.
 */
export const MODEL_STATE_MAX_AGE_MS = 5 * 60 * 1000;

// ============================================================================
// Pure helpers
// ============================================================================

/**
 * Mask a model key for safe display, keeping only the last `visibleTail`
 * characters visible. Used to prevent screenshot key leaks while still
 * letting the user verify the right key was selected.
 *
 * @param key - The model key
 * @param visibleTail
 * @returns Masked key, e.g. "••••••a3f2"
 */
export function maskModelKey(key: string, visibleTail = KEY_MASK_VISIBLE_TAIL): string {
    if (typeof key !== 'string' || key.length === 0) return '';
    const tail = Math.max(0, Math.min(visibleTail, key.length));
    if (tail === 0) return KEY_MASK_CHAR.repeat(key.length);
    if (tail >= key.length) return key;
    const masked = KEY_MASK_CHAR.repeat(key.length - tail);
    return masked + key.slice(-tail);
}

/**
 * Check if a given model info object is suitable for auto-fill.
 * Returns false if:
 *   - info is null/undefined or not an object
 *   - info.key is missing or empty
 *   - info.modelId is missing
 *   - info.timestamp is older than MODEL_STATE_MAX_AGE_MS (stale)
 *
 * @param info
 * @returns
 */
export function canAutoFill(info: Record<string, any> | null): boolean {
    if (!info || typeof info !== 'object') return false;
    if (typeof info.key !== 'string' || info.key.length === 0) return false;
    if (typeof info.modelId !== 'string' || info.modelId.length === 0) return false;
    if (typeof info.timestamp === 'number') {
        const age = Date.now() - info.timestamp;
        if (age < 0 || age > MODEL_STATE_MAX_AGE_MS) return false;
    }
    return true;
}

/**
 * Format a model info object for human-readable display in the wizard.
 * Shows masked key + element count + family summary, never the raw key.
 *
 * @param info - Model info from getCurrentModelInfo
 * @returns Display string, e.g. "••••a3f2 - 12 elements (3 plumes, 9 wells)"
 */
export function formatModelDisplay(info: Record<string, any>): string {
    if (!info || typeof info !== 'object') return '';
    const masked = maskModelKey(info.key);
    const elements = info.elementCount != null ? `${info.elementCount} elements` : '';
    const families = info.familySummary || '';
    const parts = [masked, elements, families].filter(Boolean);
    return parts.length > 1 ? `${parts[0]} — ${parts.slice(1).join(' (')}${families ? ')' : ''}` : parts[0] || '';
}

/**
 * Read current model state. Pure with respect to its inputs - caller must
 * pass injected dependencies. This shape allows Node tests to inject mock
 * implementations without DOM/window/global state.
 *
 * Production usage in browser:
 *   import { getCurrentModelInfo } from 'salesWizardHelpers.js';
 *   import { getModelIdSync } from 'core/io/modelLink.js';
 *   import { generateKeySimple } from 'core/io/export.js';
 *   import { getElementCount, countByFamily } from 'core/elements/manager.js';
 *
 *   const info = await getCurrentModelInfo({
 *       getModelId: getModelIdSync,
 *       generateKey: generateKeySimple,
 *       getElementCount,
 *       countByFamily,
 *   });
 *
 * @param deps - Injected dependencies
 * @param deps.getModelId
 * @param deps.generateKey
 * @param deps.getElementCount
 * @param deps.countByFamily
 * @returns
 */
export async function getCurrentModelInfo(deps: {
    getModelId: () => string | null;
    generateKey: () => Promise<string | null>;
    getElementCount?: () => number;
    countByFamily?: () => Record<string, number>;
}): Promise<object | null> {
    if (!deps || typeof deps !== 'object') return null;
    const { getModelId, generateKey, getElementCount, countByFamily } = deps;

    if (typeof getModelId !== 'function' || typeof generateKey !== 'function') {
        return null;
    }

    const modelId = getModelId();
    if (!modelId) return null;

    let key: string | null;
    try {
        key = await generateKey();
    } catch {
        return null;
    }
    if (!key || typeof key !== 'string') return null;

    const elementCount = typeof getElementCount === 'function' ? getElementCount() : 0;

    let familySummary = '';
    if (typeof countByFamily === 'function') {
        try {
            const counts = countByFamily() || {};
            familySummary =
                Object.entries(counts)
                    .filter(([, v]) => v > 0)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([k, v]) => `${v} ${k}`)
                    .join(', ') || '';
        } catch {
            familySummary = '';
        }
    }

    return {
        modelId,
        key,
        elementCount,
        familySummary,
        timestamp: Date.now(),
    };
}

/**
 * Compute SHA-256 hash of a model key (hex). Used for wizard verification
 * step and audit trail. Available in Node 20+ via globalThis.crypto and
 * in modern browsers natively.
 *
 * @param key
 * @returns 64-char hex
 */
export async function computeKeyHash(key: string): Promise<string> {
    if (typeof key !== 'string' || key.length === 0) return '';
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error('crypto.subtle not available');
    const buf = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
