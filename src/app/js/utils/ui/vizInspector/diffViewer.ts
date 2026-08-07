// Generated from src/app/js/utils/ui/vizInspector/diffViewer.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   DIFF VIEWER — Viz Inspector Git Tracking MVP
   Shell de diff viewer: modo Unified com indicadores de alteração.
   Comparação 3D real fora de escopo (SPEC_VIZ_INSPECTOR_GIT_TRACKING_9_70).
   ================================================================ */
import { t } from '../../i18n/translations.js';
import { escapeHtml } from '../../helpers/html.js';
// ── Constants ─────────────────────────────────────────────────────────────────
const CHANGE_ICONS = Object.freeze({
    added: '+',
    removed: '-',
    modified: '~',
    unchanged: '=',
});
const CHANGE_CLASSES = Object.freeze({
    added: 'vi-diff-added',
    removed: 'vi-diff-removed',
    modified: 'vi-diff-modified',
    unchanged: 'vi-diff-unchanged',
});
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Render a diff viewer into a container.
 * @param {HTMLElement} container
 * @param {Array<Object>} before - array de elementos do estado anterior
 * @param {Array<Object>} after - array de elementos do estado posterior
 * @param {Object} [options]
 * @param {string} [options.mode='unified'] - 'unified' | 'split' | 'overlay'
 * @returns {HTMLElement} The diff viewer root element
 */
export function renderDiffViewer(container: any, before: any, after: any, options: any = {}) {
    if (!container) {
        throw new TypeError('renderDiffViewer requires a container element');
    }
    const mode = options.mode || 'unified';
    const root = document.createElement('div');
    root.className = `vi-diff-viewer vi-diff-mode-${mode}`;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', t('diffViewer.mode.unified') || 'Diff viewer');
    const changes = _computeChanges(before || [], after || []);
    if (mode === 'unified') {
        root.appendChild(_renderUnifiedList(changes));
    } else {
        // Split / Overlay são shells (fora de escopo do MVP)
        root.appendChild(_renderUnifiedList(changes));
    }
    container.appendChild(root);
    return root;
}
// ── Internal renderers ────────────────────────────────────────────────────────
function _renderUnifiedList(changes: any[]) {
    const ul = document.createElement('ul');
    ul.className = 'vi-diff-list';
    if (changes.length === 0) {
        const li = document.createElement('li');
        li.className = 'vi-diff-empty';
        li.textContent = t('diffViewer.noChanges') || 'No changes';
        ul.appendChild(li);
        return ul;
    }
    for (const change of changes) {
        const li = document.createElement('li');
        li.className = `vi-diff-item ${(CHANGE_CLASSES as any)[change.type] || ''}`;
        const icon = (CHANGE_ICONS as any)[change.type] || '?';
        const label = t(`diffViewer.${change.type}`) || change.type;
        li.innerHTML = `
            <span class="vi-diff-icon" aria-hidden="true">${icon}</span>
            <span class="vi-diff-label">${escapeHtml(label)}</span>
            <span class="vi-diff-id">${escapeHtml(change.element_id || change.id || '')}</span>
        `;
        ul.appendChild(li);
    }
    return ul;
}
// ── Change computation (naive shell) ──────────────────────────────────────────
function _computeChanges(before: any[], after: any[]) {
    const changes = [];
    const beforeMap = new Map();
    for (const item of before) {
        const id = item.id || item.element_id;
        if (id) beforeMap.set(id, item);
    }
    const seen = new Set();
    for (const item of after) {
        const id = item.id || item.element_id;
        if (!id) continue;
        seen.add(id);
        const oldItem = beforeMap.get(id);
        if (!oldItem) {
            changes.push({ type: 'added', element_id: id, before: null, after: item });
        } else if (!_shallowEqual(oldItem, item)) {
            changes.push({ type: 'modified', element_id: id, before: oldItem, after: item });
        } else {
            changes.push({ type: 'unchanged', element_id: id, before: oldItem, after: item });
        }
    }
    for (const item of before) {
        const id = item.id || item.element_id;
        if (!id || seen.has(id)) continue;
        changes.push({ type: 'removed', element_id: id, before: item, after: null });
    }
    return changes;
}
function _shallowEqual(a: any, b: any) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
        if (a[key] !== b[key]) return false;
    }
    return true;
}
