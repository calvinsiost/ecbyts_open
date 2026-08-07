// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   DATA STUDIO SCHEMA PANEL — Table/column browser sidebar
   Painel lateral com arvore de tabelas e colunas

   Click em coluna insere no editor. Atualiza apos loadModelData.
   ================================================================ */

import { getSchema } from './sqlEngine.js';
import { t } from '../i18n/translations.js';

/** @type {HTMLElement | null} */
let _container: any = null;

/**
 * Initialize schema panel in the given container.
 * @param {HTMLElement} container
 */
export function initSchemaPanel(container: any) {
    _container = container || /** @type {HTMLElement | null} */ (document.querySelector('.ds-schema'));
}

/**
 * Refresh schema display from current SQLite state.
 */
export function refreshSchema() {
    if (!_container) _container = /** @type {HTMLElement | null} */ (document.querySelector('.ds-schema'));
    if (!_container) return;

    const schema = getSchema();
    _container.textContent = '';

    if (!schema.length) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'ds-schema-empty';
        emptyEl.textContent = t('dsNoTables') || 'No tables';
        _container.appendChild(emptyEl);
        return;
    }

    const header = document.createElement('div');
    header.className = 'ds-schema-header';
    header.textContent = t('dsTables') || 'Tables';
    _container.appendChild(header);

    for (const table of schema) {
        const details = document.createElement('details');
        details.className = 'ds-schema-table';
        details.open = true;

        const summary = document.createElement('summary');
        summary.textContent = table.name;
        details.appendChild(summary);

        const colsDiv = document.createElement('div');
        colsDiv.className = 'ds-schema-cols';
        for (const col of table.columns) {
            const colEl = document.createElement('div');
            colEl.className = 'ds-schema-col';
            colEl.dataset.col = col;
            colEl.title = `${table.name}.${col}`;
            colEl.textContent = col;
            colsDiv.appendChild(colEl);
        }
        details.appendChild(colsDiv);
        _container.appendChild(details);
    }

    // Click column → insert into editor
    _container.querySelectorAll('.ds-schema-col').forEach((/** @type {any} */ el: any) => {
        el.addEventListener('click', () => {
            const colName = el.dataset.col || '';
            const tableName = el.closest('.ds-schema-table')?.querySelector('summary')?.textContent;
            const insert = tableName ? `${tableName}.${colName}` : colName;

            import('./editor.js').then(({ insertAtCursor }) => {
                insertAtCursor(insert);
            }).catch((e: any) => console.debug('[datastudio:schemaPanel:lazy-editor:silent-catch]', e?.message || e));
        });
    });
}
