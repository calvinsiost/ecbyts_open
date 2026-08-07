// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave QQQQ1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free Supabase token validation + formatters from
// handlers/cloud.js (#21 monolito 1223 LOC). Pure: zero document/window/localStorage.

/**
 * Check if a localStorage-like store has any Supabase auth token (sb-*-auth-token key).
 * Caller injects keyValueStore (localStorage or test mock) — pure logic.
 *
 * @param {{getItem:(k:string)=>string|null}|null|undefined} store
 * @param {string[]|null|undefined} store - All keys to scan (caller does Object.keys)
 * @returns {boolean}
 */
export function hasPersistedSupabaseToken(store: any, keys: any): boolean {
    if (!store || typeof store.getItem !== 'function') return false;
    if (!Array.isArray(keys)) return false;
    for (const key of keys) {
        if (typeof key !== 'string') continue;
        if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
        try {
            const raw = store.getItem(key) || '';
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed && parsed.access_token) return true;
        } catch {
            continue;
        }
    }
    return false;
}

/**
 * Detect if storage key matches Supabase auth token pattern (sb-*-auth-token).
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isSupabaseAuthTokenKey(key: any): boolean {
    if (!key || typeof key !== 'string') return false;
    return key.startsWith('sb-') && key.endsWith('-auth-token');
}

/**
 * Format model age relative to now (e.g. "3 dias atrás", "agora").
 * Pure: caller provides nowMs reference (testable).
 *
 * @param {number|string|Date|null|undefined} updatedAt
 * @param {number} nowMs - Date.now() reference (injected for tests)
 * @returns {string}
 */
export function formatModelAge(updatedAt: any, nowMs: any): string {
    if (updatedAt === null || updatedAt === undefined || updatedAt === '') return '—';
    const ts = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
    if (!Number.isFinite(ts)) return '—';
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const diffMs = Math.max(0, now - ts);
    const SEC = 1000;
    const MIN = 60 * SEC;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;
    if (diffMs < MIN) return 'agora';
    if (diffMs < HOUR) return `${Math.floor(diffMs / MIN)} min atrás`;
    if (diffMs < DAY) return `${Math.floor(diffMs / HOUR)} h atrás`;
    return `${Math.floor(diffMs / DAY)} dias atrás`;
}

/**
 * Validate cloud model summary shape (id + name + counts presentes).
 *
 * @param {any} model
 * @returns {boolean}
 */
export function isValidCloudModelSummary(model: any): boolean {
    if (!model || typeof model !== 'object') return false;
    if (typeof model.id !== 'string' || !model.id.trim()) return false;
    if (typeof model.name !== 'string') return false;
    if (model.element_count != null && !Number.isFinite(Number(model.element_count))) return false;
    if (model.campaign_count != null && !Number.isFinite(Number(model.campaign_count))) return false;
    return true;
}

/**
 * Count professional-validated models from a list.
 *
 * @param {Array<{professional_validation?:any}>|null|undefined} models
 * @returns {number}
 */
export function countProfessionalModels(models: any): number {
    if (!Array.isArray(models)) return 0;
    return models.filter((m: any) => m && m.professional_validation).length;
}
