// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// GroupCollectionView - S5 SPEC_GROUP_VIEW_MODES
// Card grid compacto por elemento: ícone família + nome + campos-chave + badge status.
// Suporte a multi-seleção (Shift+click, Ctrl+click) e ações em massa no footer.

import { escapeHtml } from '../../helpers/html.js';
import { getFamilyIcon } from '../icons.js';
import { t } from '../../i18n/translations.js';

/** @type {Map<string, Set<string>>} groupId → selected element IDs */
const _selection = new Map();

/**
 * Render collection view into container.
 * @param {HTMLElement} container
 * @param {string} groupId
 * @param {any[]} elements  - elements in this group
 */
export function renderGroupCollectionView(container: any, groupId: any, elements: any) {
    if (!container) return;
    if (!_selection.has(groupId)) _selection.set(groupId, new Set());
    const sel = (_selection.get(groupId) as Set<string>);
    /** @type {any} */ const containerAny = container;

    container.innerHTML = '';
    container.className = 'group-view-content-host gvc-collection';

    if (elements.length === 0) {
        container.innerHTML = `<div class="gvc-empty">${t('groupView.collection.empty') || 'No elements in this group.'}</div>`;
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'gvc-coll-grid';

    for (const el of elements) {
        const card = document.createElement('div');
        card.className = 'gvc-coll-card' + (sel.has(el.id) ? ' gvc-coll-card--selected' : '');
        card.dataset.elId = el.id;

        const familyKey = el.family || 'unknown';
        const icon = getFamilyIcon(familyKey) || '';
        const name = escapeHtml(el.name || el.id);
        const status = escapeHtml(el.data?.status || el.status || '');
        const obs = Array.isArray(el.data?.observations) ? el.data.observations.length : 0;

        card.innerHTML = `
            <div class="gvc-coll-icon">${icon}</div>
            <div class="gvc-coll-body">
                <div class="gvc-coll-name">${name}</div>
                <div class="gvc-coll-meta">
                    <span class="badge badge-neutral gvc-coll-family">${escapeHtml(familyKey)}</span>
                    ${obs > 0 ? `<span class="gvc-coll-obs">${obs} obs</span>` : ''}
                    ${status ? `<span class="gvc-coll-status">${status}</span>` : ''}
                </div>
            </div>
            <input data-field-meta="true" data-field-meta-key="auto-pos:GroupCollectionView:input:L59" type="checkbox" class="gvc-coll-check" aria-label="Select ${name}" ${sel.has(el.id) ? 'checked' : ''}>
        `;

        card.addEventListener('click', (e) => {
            const cb = card.querySelector('.gvc-coll-check');
            if (e.shiftKey && sel.size > 0) {
                // range select
                const ids = elements.map((x: any) => x.id);
                const last = [...sel].pop();
                const a = ids.indexOf(last);
                const b = ids.indexOf(el.id);
                const [lo, hi] = a < b ? [a, b] : [b, a];
                for (let i = lo; i <= hi; i++) sel.add(ids[i]);
            } else if (e.ctrlKey || e.metaKey) {
                sel.has(el.id) ? sel.delete(el.id) : sel.add(el.id);
            } else if (e.target !== cb) {
                (window as any).handleSelectElement?.(el.id);
                return;
            }
            renderGroupCollectionView(container, groupId, elements);
        });

        grid.appendChild(card);
    }

    container.appendChild(grid);

    // Footer actions (shown when selection > 0)
    const footer = document.createElement('div');
    footer.className = 'gvc-coll-footer' + (sel.size > 0 ? '' : ' gvc-coll-footer--hidden');
    footer.innerHTML = `
        <span class="gvc-coll-sel-count">${sel.size} ${t('selected') || 'selected'}</span>
        <button class="btn btn-secondary btn-xs" data-cc-action="cc-83e6485c">&#10005;</button>
        <button class="btn btn-danger btn-xs"
            data-cc-action="cc-cfa535f0">${t('delete') || 'Delete'}</button>
    `;
    container.appendChild(footer);

    containerAny.__clearSel = () => {
        sel.clear();
        renderGroupCollectionView(container, groupId, elements);
    };
    containerAny.__bulkDelete = () => {
        for (const id of sel) (window as any).handleRemoveElement?.(id);
        sel.clear();
    };
}
