// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * actionCatalog.ts — Phase 2 TS source for action catalog (P1-39).
 *
 * Schema, search, filter, and sort helpers for the action-first launchpad
 * catalog. Pure logic — no DOM, no browser APIs. Drop-in replacement when
 * build:app:ts copies to app/js/.
 */

export const ACTION_CATEGORIES = Object.freeze({
    IMPORT: 'import',
    EXPORT: 'export',
    ANALYZE: 'analyze',
    VISUALIZE: 'visualize',
    CONFIGURE: 'configure',
    COLLABORATE: 'collaborate',
} as const);

export type ActionCategory = (typeof ACTION_CATEGORIES)[keyof typeof ACTION_CATEGORIES];

/** @type {Set<string>} */
const VALID_CATEGORIES: Set<string> = new Set(Object.values(ACTION_CATEGORIES));

export interface CatalogAction {
    readonly id: string;
    readonly category: string;
    readonly labelKey: string;
    readonly handler: string;
    readonly tags: readonly string[];
    readonly requiresPremium: boolean;
    readonly priority: number;
}

export interface CatalogActionInput {
    id: string;
    category: string;
    labelKey: string;
    handler: string;
    tags?: string[];
    requiresPremium?: boolean;
    priority?: number;
}

/**
 * @typedef {object} CatalogAction
 * @property {string} id
 * @property {string} category
 * @property {string} labelKey
 * @property {string} handler
 * @property {readonly string[]} tags
 * @property {boolean} requiresPremium
 * @property {number} priority
 */

/**
 * @typedef {object} CatalogActionInput
 * @property {string} id
 * @property {string} category
 * @property {string} labelKey
 * @property {string} handler
 * @property {string[]} [tags]
 * @property {boolean} [requiresPremium]
 * @property {number} [priority]
 */

/**
 * @param {CatalogActionInput} input
 * @returns {CatalogAction}
 */
export function createCatalogAction(input: CatalogActionInput): CatalogAction {
    const {
        id,
        category,
        labelKey,
        handler,
        tags = [],
        requiresPremium = false,
        priority = 100,
    } = input;
    if (!VALID_CATEGORIES.has(category)) {
        throw new Error(`Invalid category: "${category}". Must be one of: ${[...VALID_CATEGORIES].join(', ')}`);
    }
    if (!id || typeof id !== 'string') throw new Error('id must be a non-empty string');
    if (!labelKey || typeof labelKey !== 'string') throw new Error('labelKey must be a non-empty string');
    if (!handler || typeof handler !== 'string') throw new Error('handler must be a non-empty string');

    return Object.freeze({
        id: String(id),
        category,
        labelKey: String(labelKey),
        handler: String(handler),
        tags: Object.freeze([...tags].map(String)),
        requiresPremium: Boolean(requiresPremium),
        priority: Number(priority),
    });
}

/**
 * @param {Array<CatalogAction>} actions
 * @param {string} query
 * @returns {CatalogAction[]}
 */
export function searchCatalog(actions: readonly CatalogAction[], query: string): CatalogAction[] {
    if (!query?.trim()) return [...actions];
    const q = query.toLowerCase();
    return actions.filter(
        (a) =>
            a.id.toLowerCase().includes(q) ||
            a.handler.toLowerCase().includes(q) ||
            a.tags.some((t) => t.toLowerCase().includes(q)),
    );
}

/**
 * @param {Array<CatalogAction>} actions
 * @param {string} category
 * @returns {CatalogAction[]}
 */
export function filterByCategory(actions: readonly CatalogAction[], category: string): CatalogAction[] {
    return actions.filter((a) => a.category === category);
}

/**
 * @param {Array<CatalogAction>} actions
 * @returns {CatalogAction[]}
 */
export function sortByPriority(actions: readonly CatalogAction[]): CatalogAction[] {
    return [...actions].sort((a, b) => a.priority - b.priority);
}
