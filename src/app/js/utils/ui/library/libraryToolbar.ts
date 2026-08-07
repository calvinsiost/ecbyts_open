// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   LIBRARY TOOLBAR — SPEC_LIBRARY_VISUAL_INDICATORS_9_69

   Batch actions toolbar for the Library:
   - Mark as seen
   - Clear markings
   - Filter dropdown
   - Sort dropdown
   ================================================================ */
import { t } from '../../i18n/translations.js';
import { markAllAsSeen, clearAllMarks, filterItems, sortItems } from './seenIndicator.js';
import { showClearConfirmModal } from './clearConfirmModal.js';
import { showToast } from '../toast.js';

type LibraryItem = {
    id?: string;
    name?: string;
    createdAt?: string;
    updatedAt?: string;
};

type LibraryToolbarOptions = {
    listContainer: HTMLElement;
    items?: LibraryItem[];
    onFilterChange?: (filterType: string, filteredItems: LibraryItem[]) => void;
    onSortChange?: (sortedItems: LibraryItem[]) => void;
};
/**
 * Build the LibraryToolbar DOM element.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.listContainer - container whose children represent items
 * @param {Array<any>} [opts.items=[]] - full item list (for batch mark)
 * @param {Function} [opts.onFilterChange] - called with (filterType, filteredItems)
 * @param {Function} [opts.onSortChange] - called with (sortedItems)
 * @returns {HTMLElement}
 */
// eslint-disable-next-line
export function LibraryToolbar({ listContainer, items = [], onFilterChange, onSortChange }: LibraryToolbarOptions): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'library-toolbar-indicator';
    // Mark seen button
    const btnMark = document.createElement('button');
    btnMark.type = 'button';
    btnMark.className = 'btn-sm btn-primary';
    btnMark.textContent = t('library.toolbar.markSeen');
    btnMark.addEventListener('click', () => {
        const count = markAllAsSeen(/** @type {Array<{ id: string; updatedAt?: string }>} */ (items));
        showToast(t('library.toolbar.markSeenDone', { count }) || `Marked ${count} as seen`, 'success');
        if (onFilterChange) onFilterChange('all', sortItems(filterItems(items, 'all')));
    });
    // Clear markings button
    const btnClear = document.createElement('button');
    btnClear.type = 'button';
    btnClear.className = 'btn-sm btn-danger';
    btnClear.textContent = t('library.toolbar.clearMarks');
    btnClear.addEventListener('click', () => {
        showClearConfirmModal({
            affectedCount: items.length,
            onConfirm: () => {
                const count = clearAllMarks();
                showToast(t('library.toolbar.clearMarksDone', { count }) || `Cleared ${count} markings`, 'info');
                if (onFilterChange) onFilterChange('all', sortItems(filterItems(items, 'all')));
            },
        });
    });
    // Filter dropdown
    const filterWrap = document.createElement('div');
    filterWrap.className = 'library-toolbar-dropdown';
    const filterSelect = document.createElement('select');
    filterSelect.className = 'library-toolbar-select';
    filterSelect.setAttribute('aria-label', t('library.toolbar.filterLabel') || 'Filter');
    const filterOptions = [
        { value: 'all', label: t('library.toolbar.filterAll') },
        { value: 'unseen', label: t('library.toolbar.filterUnseen') },
        { value: 'seen', label: t('library.toolbar.filterSeen') },
        { value: 'updated', label: t('library.toolbar.filterUpdated') },
    ];
    for (const opt of filterOptions) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        filterSelect.appendChild(option);
    }
    filterSelect.addEventListener('change', () => {
        const filtered = filterItems(items, /** @type {"all" | "updated" | "unseen" | "seen"} */ (filterSelect.value));
        const sorted = sortItems(filtered);
        if (onFilterChange) onFilterChange(filterSelect.value, sorted);
    });
    filterWrap.appendChild(filterSelect);
    // Sort dropdown
    const sortWrap = document.createElement('div');
    sortWrap.className = 'library-toolbar-dropdown';
    const sortSelect = document.createElement('select');
    sortSelect.className = 'library-toolbar-select';
    sortSelect.setAttribute('aria-label', t('library.toolbar.sortLabel') || 'Sort');
    const sortOptions = [
        { value: 'default', label: t('library.toolbar.sortDefault') || 'Default' },
        { value: 'dateDesc', label: t('library.toolbar.sortDateDesc') || 'Newest first' },
        { value: 'dateAsc', label: t('library.toolbar.sortDateAsc') || 'Oldest first' },
        { value: 'name', label: t('library.toolbar.sortName') || 'Name' },
    ];
    for (const opt of sortOptions) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        sortSelect.appendChild(option);
    }
    sortSelect.addEventListener('change', () => {
        let sorted;
        if (sortSelect.value === 'default') {
            sorted = sortItems(items);
        } else if (sortSelect.value === 'dateDesc') {
            sorted = [...items].sort((a: LibraryItem, b: LibraryItem) => {
                const ta = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
                const tb = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
                return tb - ta;
            });
        } else if (sortSelect.value === 'dateAsc') {
            sorted = [...items].sort((a: LibraryItem, b: LibraryItem) => {
                const ta = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
                const tb = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
                return ta - tb;
            });
        } else if (sortSelect.value === 'name') {
            sorted = [...items].sort((a: LibraryItem, b: LibraryItem) => {
                const na = String(a?.name || '').toLowerCase();
                const nb = String(b?.name || '').toLowerCase();
                return na.localeCompare(nb);
            });
        } else {
            sorted = sortItems(items);
        }
        if (onSortChange) onSortChange(sorted);
    });
    sortWrap.appendChild(sortSelect);
    toolbar.appendChild(btnMark);
    toolbar.appendChild(btnClear);
    toolbar.appendChild(filterWrap);
    toolbar.appendChild(sortWrap);
    return toolbar;
}
