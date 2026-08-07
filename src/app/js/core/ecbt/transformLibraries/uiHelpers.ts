// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - UI Helpers pure logic (Phase 6 partial)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S5
 *
 * Phase 6 partial (2026-04-30) - pure-logic UI helpers (zero DOM/fetch/IDB).
 * Phase 7 entrega o painel browser real (modal drag/drop + i18n).
 *
 * API:
 *   buildLibraryListItems, buildPipelineSteps, formatLibraryBadge,
 *   groupLibrariesByTag, searchLibraries, validatePipelineConfig
 *
 * Owner: Claude
 */

import { TransformTypes } from './types.js';

const isPlainObject = (v: any): boolean =>
    v !== null && typeof v === 'object' && !Array.isArray(v as any);
const safeArray = (v: any): any[] => (Array.isArray(v as any) ? v : []);
const safeString = (v: any): string => (typeof v === 'string' ? v : '');
const lower = (v: any): string => safeString(v as any).toLowerCase();

/** filters: {type?, tags?[], author?, sortBy? 'id'|'name'|'type'} */
export function buildLibraryListItems(libraries: any, filters: any = {}): any[] {
    if (!Array.isArray(libraries)) return [];
    const f: any = isPlainObject(filters) ? filters : {};
    const filtered = libraries.filter((lib: any) => {
        if (!isPlainObject(lib) || typeof lib.id !== 'string' || lib.id === '') return false;
        if (f.type && lib.type !== f.type) return false;
        if (f.author && lib.author !== f.author) return false;
        if (Array.isArray(f.tags) && f.tags.length > 0) {
            const libTags = new Set(safeArray(lib.tags));
            for (const t of f.tags) if (!libTags.has(t)) return false;
        }
        return true;
    });
    const items = filtered.map((lib: any) => ({
        id: String(lib.id),
        name: safeString(lib.name) || String(lib.id),
        type: safeString(lib.type) || 'unknown',
        tags: safeArray(lib.tags).filter((t: any) => typeof t === 'string'),
        description: safeString(lib.description),
        author: safeString(lib.author),
        version: safeString(lib.version) || '0.0.0',
    }));
    const sortBy: 'id' | 'name' | 'type' = f.sortBy === 'name' || f.sortBy === 'type' ? f.sortBy : 'id';
    items.sort((a: any, b: any) => {
        const av = lower((a as any)[sortBy]);
        const bv = lower((b as any)[sortBy]);
        return av < bv ? -1 : av > bv ? 1 : 0;
    });
    return items;
}

/** Aceita Pipeline (.getSteps + .lastRun) ou plain {steps:[], lastRun?} */
export function buildPipelineSteps(pipeline: any): any[] {
    if (pipeline == null || typeof pipeline !== 'object') return [];
    let stepConfigs: any[] = [];
    if (typeof pipeline.getSteps === 'function') {
        try {
            stepConfigs = pipeline.getSteps();
        } catch {
            stepConfigs = [];
        }
    } else if (Array.isArray(pipeline.steps)) {
        stepConfigs = pipeline.steps;
    } else if (Array.isArray(pipeline.stepConfigs)) {
        stepConfigs = pipeline.stepConfigs;
    }
    const audits =
        isPlainObject(pipeline.lastRun) && Array.isArray(pipeline.lastRun.audits) ? pipeline.lastRun.audits : [];
    return safeArray(stepConfigs).map((step: any, index: number) => {
        const config = isPlainObject(step?.config) ? step.config : {};
        const audit = audits[index];
        return {
            index,
            libraryId: safeString(step?.libraryId),
            configKeys: Object.keys(config),
            status: audit && typeof audit.outcome === 'string' ? audit.outcome : 'pending',
            durationMs: audit && typeof audit.durationMs === 'number' ? audit.durationMs : 0,
        };
    });
}

/** Badge curto: 'pure'|'async'|'unknown'. Sem emojis (regra UI ecbyts). */
export function formatLibraryBadge(library: any): string {
    if (!isPlainObject(library)) return 'unknown';
    if (library.type === TransformTypes.PURE) return 'pure';
    if (library.type === TransformTypes.ASYNC) return 'async';
    return 'unknown';
}

/** Map<tag, library[]> ordenado A-Z, '(untagged)' ao fim. N tags → N grupos. */
export function groupLibrariesByTag(libraries: any): Map<any, any> {
    const result = new Map();
    if (!Array.isArray(libraries)) return result;
    const buckets = new Map();
    for (const lib of libraries) {
        if (!isPlainObject(lib)) continue;
        const tags = safeArray(lib.tags).filter((t: any) => typeof t === 'string' && t.trim() !== '');
        if (tags.length === 0) {
            if (!buckets.has('(untagged)')) buckets.set('(untagged)', []);
            buckets.get('(untagged)').push(lib);
            continue;
        }
        for (const tag of tags) {
            if (!buckets.has(tag)) buckets.set(tag, []);
            buckets.get(tag).push(lib);
        }
    }
    const tagged = Array.from(buckets.keys())
        .filter((k) => k !== '(untagged)')
        .sort();
    for (const t of tagged) result.set(t, buckets.get(t));
    if (buckets.has('(untagged)')) result.set('(untagged)', buckets.get('(untagged)'));
    return result;
}

/** Fuzzy case-insensitive em id+name+description+tags. Empty query → slice(). */
export function searchLibraries(libraries: any, query: any): any[] {
    if (!Array.isArray(libraries)) return [];
    const q = safeString(query).trim().toLowerCase();
    if (q === '') return libraries.slice();
    return libraries.filter((lib: any) => {
        if (!isPlainObject(lib)) return false;
        if (lower(lib.id).includes(q)) return true;
        if (lower(lib.name).includes(q)) return true;
        if (lower(lib.description).includes(q)) return true;
        for (const t of safeArray(lib.tags)) if (lower(t).includes(q)) return true;
        return false;
    });
}

/** registry = {getLibrary(id)}. Retorna {valid, errors[], warnings[]}. */
export function validatePipelineConfig(
    stepConfigs: any,
    registry: any,
): { valid: boolean; errors: any[]; warnings: any[] } {
    const errors: any[] = [];
    const warnings: any[] = [];
    if (!Array.isArray(stepConfigs)) {
        errors.push({ stepIndex: -1, code: 'INVALID_INPUT', message: 'stepConfigs must be an array' });
        return { valid: false, errors, warnings };
    }
    if (!registry || typeof registry.getLibrary !== 'function') {
        errors.push({ stepIndex: -1, code: 'INVALID_REGISTRY', message: 'registry must have getLibrary()' });
        return { valid: false, errors, warnings };
    }
    if (stepConfigs.length === 0) {
        warnings.push({ stepIndex: -1, code: 'EMPTY_PIPELINE', message: 'pipeline has no steps' });
    }
    stepConfigs.forEach((step: any, index: number) => {
        if (!isPlainObject(step)) {
            errors.push({ stepIndex: index, code: 'INVALID_STEP', message: 'step must be a plain object' });
            return;
        }
        if (typeof step.libraryId !== 'string' || step.libraryId.trim() === '') {
            errors.push({ stepIndex: index, code: 'MISSING_LIBRARY_ID', message: 'libraryId is required' });
            return;
        }
        if (step.config !== undefined && !isPlainObject(step.config)) {
            errors.push({ stepIndex: index, code: 'INVALID_CONFIG', message: 'config must be an object if present' });
            return;
        }
        let library;
        try {
            library = registry.getLibrary(step.libraryId);
        } catch (e) {
            errors.push({
                stepIndex: index,
                code: 'REGISTRY_ERROR',
                message: e instanceof Error ? e.message : String(e),
            });
            return;
        }
        if (!library) {
            warnings.push({
                stepIndex: index,
                code: 'UNKNOWN_LIBRARY',
                message: `library not registered: ${step.libraryId}`,
            });
            return;
        }
        if (typeof library.transform !== 'function') {
            errors.push({
                stepIndex: index,
                code: 'INVALID_LIBRARY',
                message: `library has no transform function: ${step.libraryId}`,
            });
        }
    });
    return { valid: errors.length === 0, errors, warnings };
}

export const ecbtTransformUiHelpersMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES',
    phase: '6-partial',
    deliveredAt: '2026-04-30',
    exports: [
        'buildLibraryListItems',
        'buildPipelineSteps',
        'formatLibraryBadge',
        'groupLibrariesByTag',
        'searchLibraries',
        'validatePipelineConfig',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
