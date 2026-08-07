// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// GroupFormView - S3 SPEC_GROUP_VIEW_MODES
// Tabela editável por elemento: colunas = campos compartilhados.
// Mass-edit: seleciona N linhas → aplica valor a todos.

import { escapeHtml } from '../../helpers/html.js';
import { t } from '../../i18n/translations.js';

/** Colunas sempre presentes independente da família */
const BASE_COLS = ['name', 'family'];

/**
 * Detecta colunas de dados compartilhadas entre todos os elementos do grupo.
 * Retorna até 4 colunas de dados (além das base).
 * @param {any[]} elements
 * @returns {string[]}
 */
function _detectSharedDataCols(elements: any): string[] {
    if (elements.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const el of elements) {
        const data = el.data || {};
        for (const key of Object.keys(data)) {
            if (key === 'observations' || key === 'campaigns') continue;
            const val = data[key];
            if (val !== undefined && val !== null && typeof val !== 'object') {
                counts[key] = (counts[key] || 0) + 1;
            }
        }
    }
    return Object.entries(counts)
        .filter(([, n]) => n >= Math.ceil(elements.length * 0.5))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k]) => k);
}

/**
 * Render form view (table) into container.
 * @param {HTMLElement} container
 * @param {string} groupId
 * @param {any[]} elements
 */
export function renderGroupFormView(container: any, groupId: any, elements: any) {
    if (!container) return;
    container.innerHTML = '';
    container.className = 'group-view-content-host gvc-form';

    if (elements.length === 0) {
        container.innerHTML = `<div class="gvc-empty">${t('groupView.form.empty') || 'No elements in this group.'}</div>`;
        return;
    }

    const dataCols = _detectSharedDataCols(elements);
    const cols = [...BASE_COLS, ...dataCols];

    // Mass-edit bar
    const massBar = document.createElement('div');
    massBar.className = 'gvc-form-mass-bar gvc-form-mass-bar--hidden';
    massBar.innerHTML = `
        <span class="gvc-form-mass-sel"></span>
        <select data-field-meta="true" data-field-meta-key="auto-pos:GroupFormView:select:L65" class="gvc-form-mass-col">
            ${dataCols.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
        </select>
        <input data-field-meta="true" data-field-meta-key="auto-pos:GroupFormView:input:L68" type="text" class="gvc-form-mass-val" placeholder="${t('groupView.form.applyMass') || 'Value'}">
        <button class="btn btn-primary btn-xs gvc-form-mass-apply">${t('groupView.form.applyMass') || 'Apply'}</button>
        <button class="btn btn-secondary btn-xs gvc-form-mass-cancel">${t('groupView.form.saveCancel') || 'Cancel'}</button>
    `;
    container.appendChild(massBar);

    // Table
    const table = document.createElement('table');
    table.className = 'gvc-form-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th><input type="checkbox" class="gvc-form-select-all" aria-label="Select all"></th>
                ${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = (table.querySelector('tbody') as HTMLElement);
    /** @type {Set<string>} */
    const selected = new Set();

    for (const el of elements) {
        const tr = document.createElement('tr');
        tr.dataset.elId = el.id;

        const checkTd = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.addEventListener('change', () => {
            cb.checked ? selected.add(el.id) : selected.delete(el.id);
            _updateMassBar(massBar, selected.size);
        });
        checkTd.appendChild(cb);
        tr.appendChild(checkTd);

        for (const col of cols) {
            const td = document.createElement('td');
            const rawVal = col === 'family' ? el.family : col === 'name' ? el.name : el.data?.[col];
            const val = rawVal !== undefined && rawVal !== null ? String(rawVal) : '';

            if (col === 'family') {
                td.textContent = val;
            } else {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'gvc-form-cell-input';
                input.value = val;
                input.addEventListener('change', () => {
                    _applyEdit(el, col, input.value);
                    input.classList.add('gvc-form-cell--saved');
                    setTimeout(() => input.classList.remove('gvc-form-cell--saved'), 800);
                });
                td.appendChild(input);
            }
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }

    // Select-all
    /** @type {HTMLInputElement | null} */
    const selectAllEl = table.querySelector('.gvc-form-select-all');
    selectAllEl?.addEventListener('change', (e: any) => {
        const checked = !!e?.target?.checked;
        for (const cb of (tbody.querySelectorAll('input[type=checkbox]') as NodeListOf<HTMLInputElement>)) {
            cb.checked = checked;
            const id = (cb.closest('tr') as HTMLElement | null)?.dataset.elId;
            if (id) checked ? selected.add(id) : selected.delete(id);
        }
        _updateMassBar(massBar, selected.size);
    });

    // Mass apply
    massBar.querySelector('.gvc-form-mass-apply')?.addEventListener('click', () => {
        const col = (massBar.querySelector('.gvc-form-mass-col') as HTMLSelectElement).value;
        const val = (massBar.querySelector('.gvc-form-mass-val') as HTMLInputElement).value;
        const targets = elements.filter((el: any) => selected.has(el.id));
        for (const el of targets) _applyEdit(el, col, val);
        // refresh inputs
        for (const tr of (tbody.querySelectorAll('tr[data-el-id]') as NodeListOf<HTMLElement>)) {
            if (tr.dataset.elId && selected.has(tr.dataset.elId)) {
                const colIdx = cols.indexOf(col);
                if (colIdx >= 0) {
                    const inp = (
                        tr.querySelectorAll('td')[colIdx + 1]?.querySelector('input') as any);
                    if (inp) inp.value = val;
                }
            }
        }
    });
    massBar.querySelector('.gvc-form-mass-cancel')?.addEventListener('click', () => {
        selected.clear();
        for (const cb of (tbody.querySelectorAll('input[type=checkbox]') as NodeListOf<HTMLInputElement>))
            cb.checked = false;
        if (selectAllEl) (selectAllEl as any).checked = false;
        _updateMassBar(massBar, 0);
    });

    container.appendChild(table);
}

/** @param {HTMLElement} bar @param {number} count */
function _updateMassBar(bar: any, count: any) {
    const label = bar.querySelector('.gvc-form-mass-sel');
    if (label) label.textContent = `${count} ${t('selected') || 'selected'}`;
    bar.classList.toggle('gvc-form-mass-bar--hidden', count === 0);
}

/** @param {any} el @param {any} col @param {any} val */
function _applyEdit(el: any, col: any, val: any) {
    if (col === 'name') {
        (window as any).handleRenameElement?.(el.id, val);
        return;
    }
    if (!el.data) el.data = {};
    el.data[col] = val;
    (window as any).handleUpdateElement?.(el.id, { data: el.data });
}
