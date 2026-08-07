// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Module Provenance handler registrations (F3-wiring slice 2).
// Hand-authored R1-safe — fecha gap identificado em Wave Y1 batch audit:
// "F3: handler registrations window.handleOpenLibrariesForModule +
//  window.handleShowModuleProvenance (registration code falta)".
//
// SPEC_MODULE_PROVENANCE_LIBRARIES_NAV §F3 caller integration.
//
// Spec NOT respeitados:
// - NÃO reimplementar provenance logic (delega moduleProvenance F1)
// - NÃO duplicar buildProvenancePanelModel (delega moduleContextMenu F2)
// - NÃO emoji em strings
// - NÃO criar novo registry handlers (apenas window.* registration)

import { createModal } from '../ui/modal.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { getModuleProvenance } from './moduleProvenance.js';
import { buildProvenancePanelModel, resolveAuthorshipBadge, formatAttribution } from './moduleContextMenu.js';

/**
 * Renderiza painel de proveniência para um módulo.
 * @param {string} moduleId
 * @param {*} store — provenanceStore injetado pelo caller
 * @returns {HTMLElement}
 */
function _buildProvenanceBody(moduleId: string, store: any): HTMLElement {
    const body = document.createElement('div');
    body.className = 'mpv-body';
    let moduleProv;
    try {
        moduleProv = getModuleProvenance(store, moduleId);
    } catch (e: any) {
        console.debug('[moduleProvenanceHandlers:get]', e?.message || e);
        body.innerHTML = `<div class="mpv-empty">${escapeHtml(t('module.provenance.error') || 'Erro ao carregar proveniência')}</div>`;
        return body;
    }
    let panelModel: any;
    try {
        panelModel = buildProvenancePanelModel(moduleProv);
    } catch (e: any) {
        console.debug('[moduleProvenanceHandlers:vm]', e?.message || e);
        body.innerHTML = `<div class="mpv-empty">${escapeHtml(t('module.provenance.empty') || 'Sem proveniência registrada')}</div>`;
        return body;
    }
    const devBadge = resolveAuthorshipBadge(panelModel.developed?.authorship);
    const valBadge = resolveAuthorshipBadge(panelModel.validated?.authorship);
    const devAttr = panelModel.developed ? formatAttribution({ role: 'developed', ...panelModel.developed }) : null;
    const valAttr = panelModel.validated ? formatAttribution({ role: 'validated', ...panelModel.validated }) : null;
    const renderAttr = (attr: any): string => {
        if (!attr) return `<span class="mpv-attr-empty">${escapeHtml(t('module.provenance.none') || '—')}</span>`;
        const label = t(attr.templateKey) || attr.templateKey;
        return `<span class="mpv-attr">${escapeHtml(label)}</span>`;
    };
    body.innerHTML = `
        <div class="mpv-section">
            <h4 class="mpv-section-title">${escapeHtml(t('module.provenance.developed.title') || 'Desenvolvido por')}</h4>
            <div class="mpv-row" data-tone="${escapeHtml(devBadge.tone)}">
                <span class="mpv-icon" aria-label="${escapeHtml(t(devBadge.labelKey) || devBadge.labelKey)}">${devBadge.icon}</span>
                ${renderAttr(devAttr)}
            </div>
        </div>
        <div class="mpv-section">
            <h4 class="mpv-section-title">${escapeHtml(t('module.provenance.validated.title') || 'Validado por')}</h4>
            <div class="mpv-row" data-tone="${escapeHtml(valBadge.tone)}">
                <span class="mpv-icon" aria-label="${escapeHtml(t(valBadge.labelKey) || valBadge.labelKey)}">${valBadge.icon}</span>
                ${renderAttr(valAttr)}
            </div>
        </div>
        ${
            panelModel.summary
                ? `<div class="mpv-summary">${escapeHtml(t('module.provenance.summary.label') || 'Autoria:')}
                    <strong>${escapeHtml(panelModel.summary.authorship || 'human')}</strong>
                    (${escapeHtml(panelModel.summary.materiality || 'low')})
                </div>`
                : ''
        }
    `;
    return body;
}

/**
 * Abre painel de proveniência do módulo. Registrável como window.*.
 * @param {string} moduleId
 * @param {*} [store?] — opcional; caller pode injetar provenanceStore
 * @returns {{close:Function}|null}
 */
export function handleShowModuleProvenance(moduleId: string, store?: any): { close: () => void } | null {
    if (typeof moduleId !== 'string' || !moduleId) {
        console.debug('[moduleProvenanceHandlers:showProvenance] missing moduleId');
        return null;
    }
    const resolvedStore = store || (globalThis as any).__ecbtProvenanceStore || null;
    if (!resolvedStore) {
        console.debug('[moduleProvenanceHandlers:showProvenance] no store');
        return null;
    }
    const body = _buildProvenanceBody(moduleId, resolvedStore);
    const handle = createModal({
        title: t('module.provenance.title') || 'Proveniência do Módulo',
        body,
        size: 'md',
        extraClass: 'mpv-modal',
        closeOnEsc: true,
        closeOnBackdropClick: true,
    });
    return { close: handle.close };
}

/**
 * Abre o controle de bibliotecas focando no módulo.
 * Registrável como window.handleOpenLibrariesForModule.
 * @param {string} moduleId
 * @returns {boolean}
 */
export function handleOpenLibrariesForModule(moduleId: string): boolean {
    if (typeof moduleId !== 'string' || !moduleId) {
        console.debug('[moduleProvenanceHandlers:openLibraries] missing moduleId');
        return false;
    }
    const w = (globalThis as any).window;
    if (!w) return false;
    try {
        // Reusa handler existente do libraries module
        if (typeof w.handleOpenLibrariesModal === 'function') {
            w.handleOpenLibrariesModal({ focusModuleId: moduleId }) as any;
            return true;
        }
        if (typeof w.handleOpenLibraries === 'function') {
            w.handleOpenLibraries(moduleId);
            return true;
        }
        console.debug('[moduleProvenanceHandlers:openLibraries] no libraries handler');
        return false;
    } catch (e: any) {
        console.debug('[moduleProvenanceHandlers:openLibraries]', e?.message || e);
        return false;
    }
}

/**
 * Registration helper — caller chama uma vez em main.js boot.
 * Idempotente.
 */
export function registerModuleProvenanceHandlers(): void {
    if (typeof window === 'undefined') return;
    const w = (window) as any;
    if (w.__ecbtModuleProvenanceHandlersRegistered) return;
    w.handleShowModuleProvenance = handleShowModuleProvenance;
    w.handleOpenLibrariesForModule = handleOpenLibrariesForModule;
    w.__ecbtModuleProvenanceHandlersRegistered = true;
}
