// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// SPEC: docs/specs/features/SPEC_FORUM_KNOWLEDGE_GROUPS.md
// Phase 4 — Libraries / Elements / SPEC link resolution + chip rendering.
/* ================================================================
   FORUM LINK RESOLVER — hydrate thread.linked_* arrays into display
   objects. Pure where possible; dynamic imports are wrapped in
   try/catch so the forum stays usable offline (id-only stub fallback).
   ================================================================ */
import { escapeHtml } from '../../utils/helpers/html.js';
import { getThread } from './forumThreadRegistry.js';
/**
 * @typedef {Object} ResolvedLibrary
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {string} version
 * @property {string} url
 *
 * @typedef {Object} ResolvedElement
 * @property {string} id
 * @property {string} family
 * @property {string} name
 * @property {{x:number,y:number,z:number}|null} position
 *
 * @typedef {Object} ResolvedSpec
 * @property {string} path
 * @property {string} title
 * @property {string} status
 */
// ----------------------------------------------------------------
// LIBRARY LINKS
// ----------------------------------------------------------------
/**
 * Resolve library ids into display objects. Falls back to an id-only
 * stub when the libraries manager is unavailable (offline/test).
 * @param {string[]} libraryIds
 * @returns {Promise<ResolvedLibrary[]>}
 */
export async function resolveLibraryLinks(libraryIds: any) {
    const ids = Array.isArray(libraryIds) ? libraryIds.filter(Boolean) : [];
    if (ids.length === 0)
        return [];
    /** @type {((id:string)=>any)|null} */
    let getLibraryById = null;
    try {
        const mod = await import('../../utils/libraries/manager.js' as string);
        if (typeof mod.getLibraryById === 'function')
            getLibraryById = mod.getLibraryById;
    }
    catch (e: any) {
        console.debug('[forum:resolveLibraryLinks:import_failed]', /** @type {any} */ (e)?.message || e);
    }
    return ids.map((id: any) => {
        let lib = null;
        try {
            lib = getLibraryById ? getLibraryById(id) : null;
        }
        catch (e: any) {
            console.debug('[forum:resolveLibraryLinks:lookup_failed]', /** @type {any} */ (e)?.message || e);
        }
        const m = lib && lib.manifest ? lib.manifest : null;
        return {
            id,
            name: m && typeof m.name === 'string' ? m.name : id,
            category: m && typeof m.category === 'string' ? m.category : 'unknown',
            version: m && typeof m.version === 'string' ? m.version : '0.0.0',
            url: `#lib:${id}`,
        };
    });
}
// ----------------------------------------------------------------
// ELEMENT LINKS
// ----------------------------------------------------------------
/**
 * Resolve element ids into display objects via elements/manager.
 * @param {string[]} elementIds
 * @returns {Promise<ResolvedElement[]>}
 */
export async function resolveElementLinks(elementIds: any) {
    const ids = Array.isArray(elementIds) ? elementIds.filter(Boolean) : [];
    if (ids.length === 0)
        return [];
    /** @type {((id:string)=>any)|null} */
    let getElementById = null;
    try {
        const mod = await import('../elements/manager.js' as string);
        if (typeof mod.getElementById === 'function')
            getElementById = mod.getElementById;
    }
    catch (e: any) {
        console.debug('[forum:resolveElementLinks:import_failed]', /** @type {any} */ (e)?.message || e);
    }
    return ids.map((id: any) => {
        let el = null;
        try {
            el = getElementById ? getElementById(id) : null;
        }
        catch (e: any) {
            console.debug('[forum:resolveElementLinks:lookup_failed]', /** @type {any} */ (e)?.message || e);
        }
        const pos = el && el.position && typeof el.position === 'object'
            ? {
                x: Number(el.position.x) || 0,
                y: Number(el.position.y) || 0,
                z: Number(el.position.z) || 0,
            }
            : null;
        return {
            id,
            family: el && typeof el.family === 'string' ? el.family : 'unknown',
            name: el && typeof el.name === 'string' ? el.name : id,
            position: pos,
        };
    });
}
// ----------------------------------------------------------------
// SPEC LINKS (pure — no fs in browser; accept pre-fetched map)
// ----------------------------------------------------------------
/**
 * Resolve SPEC paths into display objects. Pure: callers pass a
 * pre-fetched map of `{ path: rawFrontmatterOrContent }` since the
 * browser cannot read the filesystem. Parses simple YAML frontmatter
 * (id/status) and the first `# Heading` for the title.
 * @param {string[]} specPaths
 * @param {Record<string,string>} [contentMap]
 * @returns {ResolvedSpec[]}
 */
export function resolveSpecLinks(specPaths: any, contentMap: any = {}) {
    const paths = Array.isArray(specPaths) ? specPaths.filter(Boolean) : [];
    if (paths.length === 0)
        return [];
    return paths.map((path: any) => {
        const raw = contentMap && typeof (contentMap as any)[path] === 'string' ? (contentMap as any)[path] : '';
        let status = 'unknown';
        let title = path.split('/').pop() || path;
        if (raw) {
            const fm = raw.match(/^---\s*\n([\s\S]*?)\n---/);
            if (fm) {
                const sm = fm[1]!.match(/^status:\s*(.+)$/m);
                if (sm)
                    status = sm[1]!.trim();
            }
            const hm = raw.match(/^#\s+(.+)$/m);
            if (hm)
                title = hm[1]!.trim();
        }
        return { path, title, status };
    });
}
// ----------------------------------------------------------------
// CHIP RENDERING (pure, escaped)
// ----------------------------------------------------------------
/**
 * Build escaped HTML chips for a set of resolved links.
 * @param {{ libraries?: ResolvedLibrary[], elements?: ResolvedElement[], specs?: ResolvedSpec[] }} resolved
 * @returns {string}
 */
export function buildLinkChips(resolved: any) {
    if (!resolved || typeof resolved !== 'object')
        return '';
    /** @type {string[]} */
    const chips = [];
    for (const lib of resolved.libraries || []) {
        chips.push(`<span class="forum-chip forum-chip--lib" data-link-type="library" data-link-id="${escapeHtml(lib.id)}" title="${escapeHtml(lib.category)} v${escapeHtml(lib.version)}">&#128218; ${escapeHtml(lib.name)}</span>`);
    }
    for (const el of resolved.elements || []) {
        chips.push(`<span class="forum-chip forum-chip--el" data-link-type="element" data-link-id="${escapeHtml(el.id)}" title="${escapeHtml(el.family)}">&#9679; ${escapeHtml(el.name)}</span>`);
    }
    for (const sp of resolved.specs || []) {
        chips.push(`<span class="forum-chip forum-chip--spec" data-link-type="spec" data-link-id="${escapeHtml(sp.path)}" title="${escapeHtml(sp.status)}">&#167; ${escapeHtml(sp.title)}</span>`);
    }
    return chips.join('');
}
// ----------------------------------------------------------------
// ATTACH LINK (idempotent mutation of thread.linked_* arrays)
// ----------------------------------------------------------------
/** @type {Record<string, 'linkedLibraries'|'linkedElements'|'linkedSpecs'>} */
const LINK_FIELDS = {
    library: 'linkedLibraries',
    element: 'linkedElements',
    spec: 'linkedSpecs',
};
/**
 * Attach a link to a thread, mutating the thread's linked_* array.
 * Idempotent: re-attaching the same id is a no-op (no duplicates).
 * @param {string} threadId
 * @param {'library'|'element'|'spec'} linkType
 * @param {string} linkId
 * @returns {{ attached: boolean, reason?: string }}
 */
export function attachLinkToThread(threadId: any, linkType: any, linkId: any) {
    if (!threadId || !linkId)
        return { attached: false, reason: 'invalid_input' };
    const field = (LINK_FIELDS as Record<string,any>)[linkType];
    if (!field)
        return { attached: false, reason: 'invalid_link_type' };
    const thread = getThread(threadId);
    if (!thread)
        return { attached: false, reason: 'thread_not_found' };
    const arr = ((thread as any)[field]) as string[];
    if (!Array.isArray(arr))
        return { attached: false, reason: 'field_not_array' };
    if (arr.includes(linkId))
        return { attached: false, reason: 'duplicate' };
    arr.push(linkId);
    return { attached: true };
}
