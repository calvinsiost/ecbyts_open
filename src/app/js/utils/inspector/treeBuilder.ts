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
   JSON INSPECTOR — Tree Builder
   Constroi arvore DOM recursiva a partir de dados JSON.

   Cada no e um <div> com icone de tipo, chave, valor e controle
   de expansao. Suporta busca com highlight e lazy rendering
   para arrays grandes.
   ================================================================ */
import { getIcon } from '../ui/icons.js';
import { getInspectorConfig } from './manager.js';
import { isReadOnly } from './validator.js';
// Threshold para auto-colapsar arrays grandes
// eslint-disable-next-line
const AUTO_COLLAPSE_THRESHOLD = 20;
// ----------------------------------------------------------------
// TYPE DETECTION
// ----------------------------------------------------------------
/**
 * Detect JSON value type.
 * Detecta tipo do valor (object, array, string, number, boolean, null).
 */
function getValueType(value: any) {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value; // 'object', 'string', 'number', 'boolean'
}
// ----------------------------------------------------------------
// TYPE ICONS (small inline indicators)
// ----------------------------------------------------------------
const TYPE_ICONS: Record<string, string> = {
    object: 'layers',
    array: 'list',
    string: 'type',
    number: 'hash',
    boolean: 'toggle-right',
    null: 'minus',
};
function getTypeIcon(type: any) {
    const name = TYPE_ICONS[type] || 'info';
    return getIcon(name, { size: '12px' });
}
// ----------------------------------------------------------------
// VALUE RENDERING
// ----------------------------------------------------------------
/**
 * Render a primitive value as display text.
 * Formata valor primitivo para exibicao na arvore.
 */
function renderValue(value: any, type: any) {
    switch (type) {
        case 'string': {
            const escaped = escapeHtml(value);
            const truncated = escaped.length > 80 ? escaped.slice(0, 77) + '...' : escaped;
            return `<span class="inspector-string">"${truncated}"</span>`;
        }
        case 'number':
            return `<span class="inspector-number">${value}</span>`;
        case 'boolean':
            return `<span class="inspector-boolean">${value}</span>`;
        case 'null':
            return `<span class="inspector-null">null</span>`;
        default:
            return '';
    }
}
/**
 * Render a collapsed preview for objects/arrays.
 * Mostra resumo compacto quando no esta fechado.
 */
function renderCollapsedPreview(value: any, type: any) {
    if (type === 'array') {
        return `<span class="inspector-preview">[${value.length} item${value.length !== 1 ? 's' : ''}]</span>`;
    }
    if (type === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return '<span class="inspector-preview">{}</span>';
        const preview = keys.slice(0, 3).join(', ');
        const more = keys.length > 3 ? ', ...' : '';
        return `<span class="inspector-preview">{${preview}${more}}</span>`;
    }
    return '';
}
// ----------------------------------------------------------------
// SEARCH MATCHING
// ----------------------------------------------------------------
/**
 * Check if a key or value matches the search query.
 * Verifica se chave ou valor corresponde a busca.
 */
function matchesSearch(key: any, value: any, query: any) {
    if (!query) return true;
    const q = query.toLowerCase();
    if (String(key).toLowerCase().includes(q)) return true;
    if (value !== null && value !== undefined && typeof value !== 'object') {
        if (String(value).toLowerCase().includes(q)) return true;
    }
    return false;
}
/**
 * Check if any descendant matches the search query (for objects/arrays).
 * Verifica se algum descendente corresponde a busca.
 */
function hasDescendantMatch(value: any, query: any) {
    if (!query) return true;
    if (value === null || value === undefined) return false;
    if (typeof value !== 'object') {
        return String(value).toLowerCase().includes(query.toLowerCase());
    }
    const entries = Array.isArray(value) ? value.map((v: any, i: any) => [String(i), v]) : Object.entries(value);
    for (const [k, v] of entries) {
        if (matchesSearch(k, v, query)) return true;
        if (v && typeof v === 'object' && hasDescendantMatch(v, query)) return true;
    }
    return false;
}
/**
 * Highlight search matches in text.
 * Destaca trechos que correspondem a busca no texto.
 */
function highlightMatch(text: any, query: any) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const q = escapeHtml(query);
    const regex = new RegExp(`(${escapeRegex(q)})`, 'gi');
    return escaped.replace(regex, '<mark class="inspector-highlight">$1</mark>');
}
function escapeRegex(s: any) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// ----------------------------------------------------------------
// HTML ESCAPE
// ----------------------------------------------------------------
import { escapeHtmlFull as _escapeHtmlFull } from '../helpers/html.js';
function escapeHtml(str: any) {
    return _escapeHtmlFull(str);
}
// ----------------------------------------------------------------
// TREE BUILDER
// ----------------------------------------------------------------
/**
 * Build the inspector tree HTML from data.
 * Constroi HTML da arvore do inspetor a partir de dados JSON.
 *
 * @param {*} data - The data to render
 * @param {string} rootLabel - Label for the root node
 * @param {string|null} selectedPath - Path to highlight as selected (e.g., "model.elements.3")
 * @param {string[]} [elementIds] - Array of element IDs (index matches model.elements[N])
 * @returns {string} HTML string
 */
export function buildInspectorTree(data: any, rootLabel: any = "element", selectedPath: any = null, elementIds: any[] = []) {
    const { expandedPaths, searchQuery } = getInspectorConfig();
    if (data === null || data === undefined) {
        return '<div class="inspector-empty">No data</div>';
    }
    return buildNode(rootLabel, data, '', 0, expandedPaths, searchQuery, selectedPath, elementIds);
}
/**
 * Build a single node and its children recursively.
 * Constroi um no e seus filhos recursivamente.
 */
function buildNode(
    key: any,
    value: any,
    parentPath: any,
    level: any,
    expandedPaths: any,
    query: any,
    selectedPath: any,
    elementIds: any,
) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    const type = getValueType(value);
    const isExpandable = type === 'object' || type === 'array';
    const isExpanded = expandedPaths[path] === true;
    const indent = level * 16;
    // Search filtering: skip non-matching leaf nodes
    if (query && !isExpandable && !matchesSearch(key, value, query)) {
        return '';
    }
    // Skip non-matching expandable nodes (no descendant matches)
    if (query && isExpandable && !matchesSearch(key, value, query) && !hasDescendantMatch(value, query)) {
        return '';
    }
    const isMatch = query && matchesSearch(key, value, query);
    const matchClass = isMatch ? ' inspector-match' : '';
    // Selection: highlight the selected element node and link descendants
    const isSelected = selectedPath && path === selectedPath;
    const selectedClass = isSelected ? ' inspector-node-selected' : '';
    // Detect if this node belongs to an element (model.elements.N or descendant)
    const elemIdAttr = resolveElementIdAttr(path, elementIds);
    // Read-only indicator (uses validator to check full path)
    const isRO = isReadOnly(path);
    const roAttr = isRO ? ' data-readonly="true"' : '';
    const editableAttr = !isExpandable && !isRO ? ' data-editable="true"' : '';
    // Toggle arrow for expandable nodes
    const toggleIcon = isExpandable
        ? `<span class="inspector-toggle" data-path="${escapeHtml(path)}">${getIcon(isExpanded ? 'chevron-down' : 'chevron-right', { size: '12px' })}</span>`
        : '<span class="inspector-toggle-spacer"></span>';
    // Key display (with search highlight)
    const keyDisplay = query ? highlightMatch(String(key), query) : escapeHtml(String(key));
    // Value display
    let valueHtml;
    if (isExpandable) {
        valueHtml = isExpanded ? '' : renderCollapsedPreview(value, type);
    } else {
        valueHtml = renderValue(value, type);
    }
    let html = `<div class="inspector-node${matchClass}${selectedClass}" data-path="${escapeHtml(path)}" data-type="${type}" data-level="${level}" style="padding-left:${indent}px"${roAttr}${elemIdAttr}>`;
    html += toggleIcon;
    html += `<span class="inspector-type-icon" data-type="${type}">${getTypeIcon(type)}</span>`;
    html += `<span class="inspector-key">${keyDisplay}<span class="inspector-colon">:</span></span>`;
    html += `<span class="inspector-value" data-path="${escapeHtml(path)}" data-type="${type}"${editableAttr}>${valueHtml}</span>`;
    html += '</div>';
    // Render children if expanded
    if (isExpandable && isExpanded) {
        html += renderChildren(value, type, path, level + 1, expandedPaths, query, selectedPath, elementIds);
    }
    return html;
}
/**
 * Render children of an object or array node.
 * Renderiza filhos de um no objeto ou array.
 */
function renderChildren(
    value: any,
    type: any,
    parentPath: any,
    level: any,
    expandedPaths: any,
    query: any,
    selectedPath: any,
    elementIds: any,
) {
    const entries =
        type === 'array'
            ? value.map((v: any, i: any) => [String(i), v])
            : Object.entries(value);
    if (entries.length === 0) {
        const indent = level * 16;
        return `<div class="inspector-node inspector-empty-node" style="padding-left:${indent}px"><span class="inspector-muted">${type === 'array' ? '(empty array)' : '(empty object)'}</span></div>`;
    }
    let html = '';
    for (const [k, v] of entries) {
        html += buildNode(k, v, parentPath, level, expandedPaths, query, selectedPath, elementIds);
    }
    return html;
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
// Regex: matches "model.elements.N" or "model.elements.N.anything"
const ELEMENT_PATH_RE = /^model\.elements\.(\d+)/;
/**
 * If path belongs to model.elements.N, return data-element-id attribute.
 * Retorna atributo data-element-id se o caminho pertence a um elemento.
 */
function resolveElementIdAttr(path: any, elementIds: any) {
    const m = ELEMENT_PATH_RE.exec(path);
    if (!m) return '';
    const idx = parseInt(m[1]!, 10);
    const id = elementIds[idx];
    return id ? ` data-element-id="${escapeHtml(id)}"` : '';
}
