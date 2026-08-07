// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   TAXONOMY PICKER — Modal for selecting active data dictionaries
   Modal de selecao de taxonomias (dicionarios de dados) ativas

   Lista taxonomias registradas via bibliotecas instaladas.
   O usuario pode ativar/desativar por taxonomia.
   Taxonomias ativas adicionam campos auxiliares no inspector.
   ================================================================ */
import { getAllRegistered, isTaxonomyActive } from '../../core/taxonomy/manager.js';
// Side-effect: registra o kind portável `taxonomy` + expõe window.exportTaxonomyEcbt/
// importTaxonomyEcbt (P1-10) usados pelos botões inline do picker.
import '../handlers/taxonomyPortable.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
// ----------------------------------------------------------------
// MODAL LIFECYCLE
// ----------------------------------------------------------------
/** @type {HTMLElement|null} */
let _overlay: any = null;
/**
 * Open the taxonomy picker modal.
 * Lista todas as taxonomias registradas com toggle on/off.
 */
export function openTaxonomyPicker() {
    if (_overlay)
        closeTaxonomyPicker();
    /** @type {Array<{definition: any}>} */
    const registered = (getAllRegistered()) as any;
    // B2-W1 migração 2026-05-29: .modal-overlay → .ecbt-overlay + .ecbt-dialog--md
    // (canônico, design-tokens.css fornece layout/bg/blur). Drena #3 hard-numbers
    // (max-width: 560px inline → clamp() via --ecbt-modal-md). Listeners via
    // addEventListener em vez de inline onclick (XSS → SAFE).
    _overlay = document.createElement('div');
    _overlay.className = 'ecbt-overlay';
    _overlay.addEventListener('click', (e: any) => {
        if (e.target === _overlay)
            closeTaxonomyPicker();
    });
    const modal = document.createElement('div');
    modal.className = 'ecbt-dialog ecbt-dialog--md taxonomy-picker';
    const title = t('taxonomyPicker.title') || 'Data Dictionaries (Taxonomies)';
    const subtitle = t('taxonomyPicker.subtitle') ||
        'Activate taxonomies to add regulatory fields to elements. Data is preserved when deactivated.';
    let html = `
        <div class="ecbt-dialog-header">
            <h3 class="ecbt-dialog-title">${escapeHtml(title)}</h3>
            <button class="ecbt-dialog-close" data-tax-close aria-label="${escapeHtml(t('close') || 'Close')}">&#10005;</button>
        </div>
        <div class="ecbt-dialog-body">
        <p style="font-size:12px;color:var(--neutral-400);margin:0 0 16px;">${escapeHtml(subtitle)}</p>
    `;
    if (registered.length === 0) {
        html += `<p style="font-size:12px;color:var(--neutral-500);text-align:center;padding:20px 0;">${escapeHtml(t('taxonomyPicker.noTaxonomies') || 'No taxonomies available. Install a library with taxonomy content from the marketplace.')}</p>`;
    }
    else {
        for (const entry of registered) {
            const def = entry.definition;
            const active = isTaxonomyActive(def.id);
            const families = (def.families || []).join(', ');
            const fieldCount = (def.fieldSections || []).reduce((sum: any, s: any) => sum + (s.fields?.length || 0), 0);
            const obsCount = (def.observationFields || []).length;
            const badge = def.license || '';
            const version = def.version || '';
            html += `
            <div style="border:1px solid var(--neutral-700);border-radius:6px;padding:12px;margin-bottom:8px;${active ? 'border-color:var(--primary-600);background:var(--neutral-850,var(--neutral-800));' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div style="flex:1;">
                        <div style="font-size:13px;font-weight:600;">${escapeHtml(def.name)}</div>
                        <div style="font-size:11px;color:var(--neutral-400);margin-top:2px;">
                            ${escapeHtml(def.standard || '')} ${version ? `v${escapeHtml(version)}` : ''}
                            ${badge ? `<span style="margin-left:6px;font-size:10px;padding:1px 4px;background:var(--neutral-700);border-radius:2px;">${escapeHtml(badge)}</span>` : ''}
                        </div>
                        <div style="font-size:11px;color:var(--neutral-500);margin-top:4px;">
                            ${escapeHtml(t('taxonomyPicker.families') || 'Families')}: ${escapeHtml(families)}
                        </div>
                        <div style="font-size:10px;color:var(--neutral-500);margin-top:2px;">
                            ${fieldCount} ${escapeHtml(t('taxonomyPicker.fields') || 'fields')}${obsCount > 0 ? ` + ${obsCount} ${escapeHtml(t('taxonomyPicker.obsFields') || 'observation fields')}` : ''}
                        </div>
                    </div>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;">
                        <input data-field-meta="true" data-field-meta-key="auto-pos:taxonomyPicker:input:L90" type="checkbox" ${active ? 'checked' : ''} data-tax-toggle="${escapeHtml(def.id)}">
                        <span style="font-size:11px;">${active ? escapeHtml(t('taxonomyPicker.active') || 'Active') : escapeHtml(t('taxonomyPicker.inactive') || 'Inactive')}</span>
                    </label>
                </div>
                <div style="margin-top:8px;text-align:right;">
                    <button class="btn btn-secondary" style="font-size:11px;padding:2px 8px;" data-tax-export="${escapeHtml(def.id)}" title="${escapeHtml(t('taxPortable.exportTitle') || 'Exportar como chave .ecbt (Library ecbyts ou dispositivo local)')}">${escapeHtml(t('taxPortable.export') || 'Export .ecbt')}</button>
                </div>
            </div>`;
        }
    }
    html += `
        </div>
        <div class="ecbt-dialog-footer" style="display:flex;justify-content:space-between;align-items:center;">
            <button class="btn btn-secondary" data-tax-import style="font-size:12px;" title="${escapeHtml(t('taxPortable.importTitle') || 'Importar taxonomia de uma chave .ecbt (Library ecbyts ou dispositivo local)')}">
                ${escapeHtml(t('taxPortable.import') || 'Import .ecbt')}
            </button>
            <button class="btn btn-secondary" data-tax-close style="font-size:12px;">
                ${escapeHtml(t('close') || 'Close')}
            </button>
        </div>
    `;
    modal.innerHTML = html;
    _overlay.appendChild(modal);
    document.body.appendChild(_overlay);
    // Wire listeners (substitui inline onclick/onchange XSS por addEventListener).
    // AbortController atrelado ao overlay → cleanup automático no close().
    const controller = new AbortController();
    const { signal } = controller;
    (_overlay as any)._taxonomyAbort = controller;
    _overlay.querySelectorAll('[data-tax-close]').forEach((btn: any) =>
        btn.addEventListener('click', () => closeTaxonomyPicker(), { signal }),
    );
    _overlay.querySelectorAll('[data-tax-toggle]').forEach((cb: any) =>
        cb.addEventListener(
            'change',
            () => {
                const fn = (window as any).handleTaxonomyToggle;
                if (typeof fn === 'function') fn(cb.getAttribute('data-tax-toggle'), cb.checked);
            },
            { signal },
        ),
    );
    _overlay.querySelectorAll('[data-tax-export]').forEach((btn: any) =>
        btn.addEventListener(
            'click',
            () => {
                const fn = (window as any).exportTaxonomyEcbt;
                if (typeof fn === 'function') fn(btn.getAttribute('data-tax-export'));
            },
            { signal },
        ),
    );
    const importBtn = _overlay.querySelector('[data-tax-import]');
    importBtn?.addEventListener(
        'click',
        () => {
            const fn = (window as any).importTaxonomyEcbt;
            if (typeof fn === 'function') fn();
        },
        { signal },
    );
}
/**
 * Close the taxonomy picker modal.
 */
export function closeTaxonomyPicker() {
    if (_overlay) {
        // Cancela todos os listeners registrados em openTaxonomyPicker (PERF-MASTER S3.3).
        try {
            (_overlay as any)._taxonomyAbort?.abort();
        } catch (e) {
            console.debug('[taxonomyPicker:abort:silent-catch]', (e as any)?.message || e);
        }
        _overlay.remove();
        _overlay = null;
    }
}
