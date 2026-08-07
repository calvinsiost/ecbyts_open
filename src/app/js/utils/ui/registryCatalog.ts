// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_REGISTRY_CATALOG (claude - novaspec, 2026-06-02) — componente UI Fase 2.
 *
 * Componente único `openRegistryCatalog` que renderiza modal com lista
 * filtrada + busca + chips de group + export CSV. Reusa M2.5:
 * createModal, showToast, Z_INDEX, t, escapeHtml, downloadCsv.
 *
 * 100% genérico — não importa core/* nem conhece registry específico.
 * Caller passa `RegistryEntry[]` já mapeado via adaptador
 * (analyticsAdapter/solverAdapter/recognitionAdapter).
 *
 * Pure-logic em `_registryCatalogPure.ts` (Fase 1): indexação + busca
 * + CSV serialization.
 *
 * Refs:
 *   - SPEC `docs/specs/frontier/SPEC_REGISTRY_CATALOG.md` §4 Arquitetura
 *   - Codebase-map M2.5 (reuse catalog)
 *   - FORCE11 Nine Best Practices (arXiv 2012.13117)
 */

import { createModal } from './modal.js';
import { showToast } from './toast.js';
import { downloadCsv } from '../helpers/csvExport.js';
import { t } from '../i18n/translations.js';
import {
    buildCatalog,
    searchCatalog,
    buildCsvRows,
    type RegistryEntry,
    type CatalogIndex,
} from './_registryCatalogPure.js';

// =============================================================================
// Opções públicas
// =============================================================================

export interface RegistryCatalogOptions {
    /** Entries já mapeadas pelo adaptador (RF4) */
    entries: ReadonlyArray<RegistryEntry>;
    /** Título do modal (i18n key ou literal) */
    title?: string;
    titleKey?: string;
    /** Ação opcional ao clicar numa entrada (RF5) */
    onOpen?: (entry: RegistryEntry) => void;
    /** Nome do arquivo CSV (sem extensão) */
    csvFilename?: string;
    /** Mostrar botão CSV (default true) */
    enableCsvExport?: boolean;
    /** Placeholder do campo de busca (default "Buscar...") */
    searchPlaceholder?: string;
}

export interface RegistryCatalogHandle {
    close: () => void;
    refresh: (entries: ReadonlyArray<RegistryEntry>) => void;
}

// =============================================================================
// Renderização
// =============================================================================

/**
 * Abre modal de catálogo. Pure-DOM (sem fetch). Retorna handle com
 * close() e refresh(entries) para atualização externa.
 *
 * Layout:
 *   - Header: título + busca + chips group + botão CSV
 *   - Body: lista de cards [label | group badge | ref link | onOpen?]
 *   - Footer: contador "N de M"
 *
 * @example
 *   import { openRegistryCatalog } from './registryCatalog.js';
 *   const entries = analyticsAdapter(getAllAnalyticsModules());
 *   openRegistryCatalog({
 *       entries,
 *       titleKey: 'registryCatalog.analytics.title',
 *       csvFilename: 'analytics-modules',
 *       onOpen: (entry) => navigateToModule(entry.id),
 *   });
 */
export function openRegistryCatalog(opts: RegistryCatalogOptions): RegistryCatalogHandle {
    let _index: CatalogIndex = buildCatalog(opts.entries);
    let _activeGroup: string | null = null;
    let _searchQuery = '';

    // Body container (vamos preencher dinamicamente)
    const bodyRoot = document.createElement('div');
    bodyRoot.className = 'registry-catalog-root';

    // Search input
    const searchWrap = document.createElement('div');
    searchWrap.className = 'registry-catalog-search';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'form-input';
    searchInput.placeholder = opts.searchPlaceholder
        || (t ? t('registryCatalog.searchPlaceholder') : '')
        || 'Buscar...';
    searchInput.setAttribute('aria-label', searchInput.placeholder);
    searchWrap.appendChild(searchInput);
    bodyRoot.appendChild(searchWrap);

    // Chips de group
    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'registry-catalog-chips';
    bodyRoot.appendChild(chipsWrap);

    // List
    const listWrap = document.createElement('div');
    listWrap.className = 'registry-catalog-list';
    listWrap.setAttribute('role', 'list');
    bodyRoot.appendChild(listWrap);

    // Counter
    const counter = document.createElement('div');
    counter.className = 'registry-catalog-counter';
    counter.setAttribute('aria-live', 'polite');
    bodyRoot.appendChild(counter);

    // Build chips para grupos
    function _renderChips() {
        chipsWrap.replaceChildren();
        const allChip = _makeChip(
            (t ? t('registryCatalog.allGroups') : '') || 'Todos',
            null,
            _activeGroup === null,
        );
        chipsWrap.appendChild(allChip);
        for (const g of _index.groups) {
            const chip = _makeChip(g || '(sem grupo)', g, _activeGroup === g);
            chipsWrap.appendChild(chip);
        }
    }

    function _makeChip(label: string, groupValue: string | null, active: boolean): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'registry-catalog-chip' + (active ? ' is-active' : '');
        btn.textContent = label;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.addEventListener('click', () => {
            _activeGroup = groupValue;
            _renderChips();
            _renderList();
        });
        return btn;
    }

    // Build list
    function _renderList() {
        const searchOpts: { group?: string } = {};
        if (_activeGroup !== null) searchOpts.group = _activeGroup;
        const results = searchCatalog(_index, _searchQuery, searchOpts);
        listWrap.replaceChildren();
        if (results.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'registry-catalog-empty';
            empty.textContent = (t ? t('registryCatalog.empty') : '') || 'Nenhum resultado.';
            listWrap.appendChild(empty);
        }
        else {
            for (const entry of results) {
                listWrap.appendChild(_makeCard(entry));
            }
        }
        const totalAll = _index.all.length;
        counter.textContent = `${results.length} / ${totalAll}`;
    }

    function _makeCard(entry: RegistryEntry): HTMLElement {
        const card = document.createElement('div');
        card.className = 'registry-catalog-card';
        card.setAttribute('role', 'listitem');
        card.setAttribute('data-entry-id', entry.id);

        const labelEl = document.createElement('div');
        labelEl.className = 'registry-catalog-card-label';
        labelEl.textContent = entry.label;
        card.appendChild(labelEl);

        const meta = document.createElement('div');
        meta.className = 'registry-catalog-card-meta';
        if (entry.group) {
            const groupBadge = document.createElement('span');
            groupBadge.className = 'registry-catalog-group-badge';
            groupBadge.textContent = entry.group;
            meta.appendChild(groupBadge);
        }
        const idBadge = document.createElement('span');
        idBadge.className = 'registry-catalog-id-badge';
        idBadge.textContent = entry.id;
        meta.appendChild(idBadge);
        card.appendChild(meta);

        // Description (se houver em meta)
        const desc = (entry.meta as any)?.description;
        if (typeof desc === 'string' && desc.length > 0) {
            const descEl = document.createElement('div');
            descEl.className = 'registry-catalog-card-desc';
            descEl.textContent = desc;
            card.appendChild(descEl);
        }

        // Ref (procedência citável FORCE11)
        if (typeof entry.ref === 'string' && entry.ref.length > 0) {
            const refEl = document.createElement('div');
            refEl.className = 'registry-catalog-card-ref';
            // Se ref começa com http(s) e tem schema válido → link, caso contrário texto
            if (/^https?:\/\//i.test(entry.ref)) {
                const a = document.createElement('a');
                a.href = entry.ref;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = entry.ref;
                refEl.appendChild(a);
            }
            else {
                refEl.textContent = entry.ref;
            }
            card.appendChild(refEl);
        }

        // Action (RF5)
        if (typeof opts.onOpen === 'function') {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'btn btn-secondary registry-catalog-card-action';
            action.textContent = (t ? t('registryCatalog.open') : '') || 'Abrir';
            action.addEventListener('click', (ev) => {
                ev.stopPropagation();
                try {
                    opts.onOpen!(entry);
                }
                catch (e: any) {
                    console.debug('[registryCatalog] onOpen handler error', e?.message || e);
                    if (showToast) {
                        showToast(
                            (t ? t('registryCatalog.openError') : '') || 'Erro ao abrir',
                            'error',
                        );
                    }
                }
            });
            card.appendChild(action);
        }

        return card;
    }

    // CSV export button (footer)
    const footer = document.createElement('div');
    footer.className = 'registry-catalog-footer';
    if (opts.enableCsvExport !== false) {
        const csvBtn = document.createElement('button');
        csvBtn.type = 'button';
        csvBtn.className = 'btn btn-secondary';
        csvBtn.textContent = (t ? t('registryCatalog.exportCsv') : '') || 'Exportar CSV';
        csvBtn.addEventListener('click', () => {
            try {
                const expOpts: { group?: string } = {};
                if (_activeGroup !== null) expOpts.group = _activeGroup;
                const filtered = searchCatalog(_index, _searchQuery, expOpts);
                const rows = buildCsvRows(filtered);
                const csv = rows.join('\r\n');
                const filename = (opts.csvFilename || 'registry-catalog') + '.csv';
                downloadCsv(csv, filename);
                if (showToast) {
                    showToast(
                        (t ? t('registryCatalog.exportSuccess') : '') || 'CSV exportado',
                        'success',
                    );
                }
            }
            catch (e: any) {
                console.debug('[registryCatalog] csv export error', e?.message || e);
                if (showToast) {
                    showToast(
                        (t ? t('registryCatalog.exportError') : '') || 'Erro ao exportar CSV',
                        'error',
                    );
                }
            }
        });
        footer.appendChild(csvBtn);
    }

    // Search input handler
    searchInput.addEventListener('input', () => {
        _searchQuery = searchInput.value;
        _renderList();
    });

    // Initial render
    _renderChips();
    _renderList();

    // Open modal — montar opts com property assignment para evitar
    // exactOptionalPropertyTypes warnings em title/titleKey opcionais.
    const modalOpts: any = {
        size: 'lg',
        body: bodyRoot,
        footer,
        closeOnEsc: true,
        closeOnBackdropClick: true,
        extraClass: 'registry-catalog-dialog',
    };
    if (typeof opts.title === 'string') modalOpts.title = opts.title;
    if (typeof opts.titleKey === 'string') modalOpts.titleKey = opts.titleKey;
    const modal = createModal(modalOpts);

    return {
        close: () => modal.close(),
        refresh: (newEntries: ReadonlyArray<RegistryEntry>) => {
            _index = buildCatalog(newEntries);
            _activeGroup = null;
            _searchQuery = '';
            searchInput.value = '';
            _renderChips();
            _renderList();
        },
    };
}

// Re-export contract para conveniência consumer
export type { RegistryEntry, RegistryAdapter, CatalogIndex } from './_registryCatalogPure.js';
