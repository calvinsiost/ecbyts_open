// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   JSON INSPECTOR — State Manager
   Gerenciador de estado do painel inspetor JSON.

   Controla visibilidade, largura, nos expandidos e busca.
   Persiste configuracao no localStorage para manter estado entre reloads.
   ================================================================ */
import { safeSetItem } from '../storage/storageMonitor.js';
const STORAGE_KEY = 'ecbyts-inspector';
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
const state: { visible: boolean; collapsed: boolean; width: number; height: number; searchQuery: string; expandedPaths: Record<string, boolean>; activeTab: string } = {
    visible: true,
    collapsed: true,
    width: 400,
    height: 200,
    searchQuery: '',
    expandedPaths: {},
    activeTab: 'json',
};
// ----------------------------------------------------------------
// PERSISTENCE
// ----------------------------------------------------------------
function persist() {
    try {
        safeSetItem(STORAGE_KEY, JSON.stringify({
            visible: state.visible,
            collapsed: state.collapsed,
            width: state.width,
            height: state.height,
        }));
    }
    catch (e: any) {
        console.debug('[inspector/manager] persist:', e?.message || e);
        // Ignore quota errors
    }
}
// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
/**
 * Initialize inspector state from localStorage.
 * Restaura estado do inspetor salvo no navegador.
 */
export function initInspector() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY) || '';
        if (saved) {
            const parsed = JSON.parse(saved);
            if (typeof parsed.visible === 'boolean')
                state.visible = parsed.visible;
            if (typeof parsed.collapsed === 'boolean')
                state.collapsed = parsed.collapsed;
            if (typeof parsed.width === 'number')
                state.width = Math.max(280, Math.min(600, parsed.width));
            if (typeof parsed.height === 'number')
                state.height = Math.max(120, Math.min(500, parsed.height));
        }
    }
    catch (e: any) {
        console.warn('[Inspector] Failed to restore state:', e?.message);
    }
}
// ----------------------------------------------------------------
// GETTERS / SETTERS
// ----------------------------------------------------------------
/**
 * Get current inspector configuration.
 * Retorna configuracao atual do inspetor (visibilidade, largura, busca, nos abertos).
 */
export function getInspectorConfig() {
    return {
        visible: state.visible,
        collapsed: state.collapsed,
        width: state.width,
        height: state.height,
        searchQuery: state.searchQuery,
        expandedPaths: state.expandedPaths,
        activeTab: state.activeTab,
    };
}
/**
 * Toggle or set inspector visibility.
 * Altera visibilidade do painel inspetor.
 */
export function setInspectorVisible(visible: any) {
    state.visible = !!visible;
    persist();
}
/**
 * Set inspector panel width.
 * Define largura do painel (min 280, max 600).
 */
export function setInspectorWidth(width: any) {
    state.width = Math.max(280, Math.min(600, width));
    persist();
}
/**
 * Set inspector panel height (expanded state).
 * Define altura do painel expandido (min 120, max 500).
 */
export function setInspectorHeight(height: any) {
    state.height = Math.max(120, Math.min(500, height));
    persist();
}
/**
 * Set inspector collapsed state.
 * Define estado colapsado do painel.
 */
export function setInspectorCollapsed(collapsed: any) {
    state.collapsed = !!collapsed;
    persist();
}
/**
 * Set search query for filtering tree nodes.
 * Define texto de busca para filtrar nos da arvore.
 */
export function setSearchQuery(query: any) {
    state.searchQuery = query || '';
}
/**
 * Set active inspector tab.
 * @param {string} tab - json | history | provenance
 */
export function setInspectorTab(tab: any) {
    state.activeTab = ['json', 'history', 'provenance'].includes(tab) ? tab : 'json';
}
/**
 * Toggle expanded state of a node path.
 * Expande ou colapsa um no da arvore pelo caminho.
 */
export function toggleNodeExpanded(path: any) {
    if (state.expandedPaths[path]) {
        delete state.expandedPaths[path];
    }
    else {
        state.expandedPaths[path] = true;
    }
}
/**
 * Set a specific node path as expanded.
 * Marca um caminho como expandido sem alternar.
 */
export function setNodeExpanded(path: any, expanded: any) {
    if (expanded) {
        state.expandedPaths[path] = true;
    }
    else {
        delete state.expandedPaths[path];
    }
}
/**
 * Expand all nodes up to a given depth.
 * Expande todos os nos ate profundidade especificada.
 *
 * @param {Object} data - The data object to expand paths for
 * @param {number} [maxDepth=3] - Maximum depth to expand
 */
export function expandAll(data: any, maxDepth = 3) {
    state.expandedPaths = {};
    if (!data || typeof data !== 'object')
        return;
    _collectPaths(data, '', 0, maxDepth);
}
function _collectPaths(obj: any, prefix: any, depth: any, maxDepth: any) {
    if (depth >= maxDepth)
        return;
    const entries = Array.isArray(obj) ? obj.map((v: any, i: any) => [String(i), v]) : Object.entries(obj);
    for (const [key, value] of entries) {
        if (value && typeof value === 'object') {
            const path = prefix ? `${prefix}.${key}` : key;
            state.expandedPaths[path] = true;
            _collectPaths(value, path, depth + 1, maxDepth);
        }
    }
}
/**
 * Collapse all nodes.
 * Fecha todos os nos da arvore.
 */
export function collapseAll() {
    state.expandedPaths = {};
}
/**
 * Expand all ancestor paths so a given node becomes visible.
 * Expande todos os ancestrais de um caminho para torna-lo visivel.
 *
 * @param {string} path - Dot-separated path (e.g., "model.elements.3")
 */
export function expandPathTo(path: any) {
    const parts = path.split('.');
    let current = '';
    for (let i = 0; i < parts.length; i++) {
        current = current ? `${current}.${parts[i]}` : parts[i];
        state.expandedPaths[current] = true;
    }
}
// ----------------------------------------------------------------
// EXPORT / IMPORT (for model persistence)
// ----------------------------------------------------------------
export function exportInspector() {
    return {
        visible: state.visible,
        collapsed: state.collapsed,
        width: state.width,
        height: state.height,
    };
}
export function importInspector(data: any) {
    if (data && typeof data === 'object') {
        if (typeof data.visible === 'boolean')
            state.visible = data.visible;
        if (typeof data.collapsed === 'boolean')
            state.collapsed = data.collapsed;
        if (typeof data.width === 'number')
            state.width = Math.max(280, Math.min(600, data.width));
        if (typeof data.height === 'number')
            state.height = Math.max(120, Math.min(500, data.height));
        persist();
    }
}
