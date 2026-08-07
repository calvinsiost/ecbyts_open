// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   DATA STUDIO MODULE LAYOUT — Pure helpers
   Helpers puros para navegação modular (collection/processing/analytics)
   ================================================================ */

export const DS_MODULES = {
    EXTRACTION: 'extraction',
    INTAKE: 'extraction', // retrocompat alias — maps to 'extraction'
    COLLECTION: 'collection', // retrocompat alias — maps to 'extraction' via normalizeDataStudioModule
    PROCESSING: 'processing',
    ANALYTICS: 'analytics',
    RADAR: 'radar',
} as const;

export type DS_MODULE_ID = (typeof DS_MODULES)[keyof typeof DS_MODULES];

// 'collection' e 'intake' são aliases retrocompat que normalizam para 'extraction'
const _ALIASES: Record<string, string> = { collection: 'extraction', intake: 'extraction' };
const _VALID = new Set(['extraction', 'processing', 'analytics', 'radar']);

/**
 * Normalize arbitrary input into a valid Data Studio module id.
 * 'collection' and 'intake' map to 'extraction' for backward compatibility.
 * @param {string} value
 * @returns {'extraction'|'processing'|'analytics'|'radar'}
 */
export function normalizeDataStudioModule(value: string): 'extraction' | 'processing' | 'analytics' | 'radar' {
    const raw = String(value || '')
        .trim()
        .toLowerCase();
    const resolved = _ALIASES[raw] ?? raw;
    return (_VALID.has(resolved) ? resolved : DS_MODULES.PROCESSING) as 'extraction' | 'processing' | 'analytics' | 'radar';
}

/**
 * Produce simple visibility flags for module-bound UI blocks.
 * @param {string} activeModule
 * @returns {{ extraction: boolean, processing: boolean, analytics: boolean, radar: boolean }}
 */
export function getModuleVisibility(activeModule: string): {
    extraction: boolean;
    processing: boolean;
    analytics: boolean;
    radar: boolean;
} {
    const mod = normalizeDataStudioModule(activeModule);
    return {
        extraction: mod === DS_MODULES.EXTRACTION,
        processing: mod === DS_MODULES.PROCESSING,
        analytics: mod === DS_MODULES.ANALYTICS,
        radar: mod === DS_MODULES.RADAR,
    };
}