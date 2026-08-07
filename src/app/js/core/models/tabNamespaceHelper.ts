// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * tabNamespaceHelper.js - Phase 2 Foundation Stub for Project Tabs.
 *
 * Provides the minimum per-tab namespace API for Project Tabs without
 * integrating with the existing managers yet. State stays in module-level
 * closures: no IDB, localStorage, DOM, or browser APIs.
 */

export interface TabNamespace {
    tabId: string;
    createdAt: string;
    state: Record<string, unknown>;
}

const namespaces = new Map<string, TabNamespace>();
let activeTabId: string | null = null;

function isValidNs(ns: unknown): ns is string {
    return typeof ns === 'string' && ns.trim().length > 0;
}

/**
 * Creates a new tab namespace. Existing `tabId` values are overwritten so
 * rehydration stays idempotent.
 */
export function createTabNamespace(tabId: unknown): TabNamespace {
    if (!isValidNs(tabId)) {
        throw new TypeError(
            `[tabNamespaceHelper] createTabNamespace: tabId deve ser string nao-vazia, recebeu: ${JSON.stringify(tabId)}`,
        );
    }

    const namespace: TabNamespace = {
        tabId,
        createdAt: new Date().toISOString(),
        state: {},
    };

    namespaces.set(tabId, namespace);
    return namespace;
}

/**
 * Returns the active tab id, or null when no tab is active.
 */
export function getActiveTabId(): string | null {
    return activeTabId;
}

/**
 * Sets the active tab id. The namespace must already exist.
 */
export function setActiveTabId(tabId: unknown): void {
    if (!isValidNs(tabId)) {
        throw new TypeError(
            `[tabNamespaceHelper] setActiveTabId: tabId deve ser string nao-vazia, recebeu: ${JSON.stringify(tabId)}`,
        );
    }
    if (!namespaces.has(tabId)) {
        throw new RangeError(
            `[tabNamespaceHelper] setActiveTabId: namespace '${tabId}' nao existe. Chamar createTabNamespace primeiro.`,
        );
    }
    activeTabId = tabId;
}

/**
 * Lists all open tab namespace ids in insertion order.
 */
export function listOpenTabs(): string[] {
    return Array.from(namespaces.keys());
}

/**
 * Checks whether a value is a non-empty string and an existing namespace id.
 */
export function validateNamespace(ns: unknown): boolean {
    if (!isValidNs(ns)) return false;
    return namespaces.has(ns);
}

/**
 * Returns a namespace object by id, or undefined when it does not exist.
 */
export function getNamespace(tabId: unknown): TabNamespace | undefined {
    if (typeof tabId !== 'string') return undefined;
    return namespaces.get(tabId);
}

/**
 * Removes a namespace. The active tab id is intentionally left untouched;
 * callers decide how to pick a replacement.
 */
export function removeTabNamespace(tabId: unknown): boolean {
    if (typeof tabId !== 'string') return false;
    return namespaces.delete(tabId);
}

/**
 * Clears all namespaces and resets the active tab id.
 */
export function _resetForTesting(): void {
    namespaces.clear();
    activeTabId = null;
}
