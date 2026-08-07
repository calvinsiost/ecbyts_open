// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
/* ================================================================
   ENRICHMENT PROPOSAL MODAL — LIBRARY_COMMUNITY_ENRICHMENT_9_68

   Modal vanilla JS para o usuário propor um enriquecimento de dados
   da comunidade a partir do Inspector de um elemento. Usa os tokens
   de design .ecbt-* (design-tokens.css) — sem max-width fixo.
   ================================================================ */
import { t } from '../../i18n/translations.js';
import { escapeHtml } from '../../helpers/html.js';
import { COMMUNITY_CONTRIBUTION_TYPES } from '../../../core/catalog/enrichmentSchema.js';
/** Rótulos legíveis por tipo de contribuição (i18n com fallback). */
function typeOptionLabel(value: string) {
    const map: Record<string, any> = {
        [COMMUNITY_CONTRIBUTION_TYPES.NEW_RECORD]: t('enrichmentTypeNewRecord') || 'New record',
        [COMMUNITY_CONTRIBUTION_TYPES.EDIT]: t('enrichmentTypeEdit') || 'Edit',
        [COMMUNITY_CONTRIBUTION_TYPES.DELETE]: t('enrichmentTypeDelete') || 'Delete',
    };
    return map[value] || value;
}
/** Constrói o markup interno do diálogo (estático — sem eco de input). */
function buildDialogHTML(elementId: string) {
    const title = escapeHtml(t('enrichmentModalTitle') || 'Suggest Data Enrichment');
    const options = Object.values(COMMUNITY_CONTRIBUTION_TYPES)
        .map((v: any) => `<option value="${escapeHtml(v)}">${escapeHtml(typeOptionLabel(v))}</option>`)
        .join('');
    return `
        <div class="ecbt-header">
            <span class="ecbt-title">${title}</span>
            <button type="button" class="ecbt-close" data-enrich-action="close" aria-label="${escapeHtml(t('close') || 'Close')}">&#10005;</button>
        </div>
        <form class="ecbt-form" data-enrich-form>
            <p class="ecbt-hint">${escapeHtml(t('inspector') || 'Inspector')}: ${escapeHtml(elementId)}</p>
            <div class="ecbt-field">
                <label for="enrich-type">${escapeHtml(t('enrichmentTypeLabel') || 'Data type')}</label>
                <select id="enrich-type" name="enrich-type" required>${options}</select>
            </div>
            <div class="ecbt-field">
                <label for="enrich-desc">${escapeHtml(t('enrichmentDescLabel') || 'Description')}</label>
                <textarea id="enrich-desc" name="enrich-desc" rows="4" required
                    placeholder="${escapeHtml(t('enrichmentDescPlaceholder') || 'Describe the proposed change...')}"></textarea>
            </div>
            <div class="ecbt-field">
                <label for="enrich-evidence">${escapeHtml(t('enrichmentEvidenceLabel') || 'Evidence')}</label>
                <input type="file" id="enrich-evidence" name="enrich-evidence"
                    accept=".pdf,.png,.jpg,.jpeg,.json,.geojson,.csv,.txt">
                <span class="ecbt-hint">${escapeHtml(t('enrichmentEvidenceHint') || 'Optional supporting file')}</span>
            </div>
            <div class="ecbt-actions">
                <button type="button" class="ecbt-btn ecbt-btn--cancel" data-enrich-action="close">
                    ${escapeHtml(t('cancel') || 'Cancel')}
                </button>
                <button type="submit" class="ecbt-btn ecbt-btn--primary" data-enrich-submit>
                    ${escapeHtml(t('enrichmentSubmit') || 'Submit')}
                </button>
            </div>
        </form>
    `;
}
/**
 * Abre o modal de proposta de enriquecimento para um elemento.
 * Opens the enrichment proposal modal. Submit disables the button and
 * shows a spinner during the async submit handler.
 *
 * @param {object} params
 * @param {string} params.elementId - ID do elemento alvo
 * @param {(payload: { elementId: string, contributionType: string, description: string, evidenceName: string|null }) => Promise<any>|any} [params.onSubmit]
 * @returns {{ close: () => void, overlay: HTMLElement }}
 */
export function openEnrichmentProposalModal({ elementId, onSubmit }: any) {
    const safeId = typeof elementId === 'string' ? elementId : '';
    const overlay = document.createElement('div');
    overlay.className = 'ecbt-overlay';
    overlay.setAttribute('role', 'presentation');
    const dialog = document.createElement('div');
    dialog.className = 'ecbt-dialog ecbt-dialog--md';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', t('enrichmentModalTitle') || 'Suggest Data Enrichment');
    dialog.innerHTML = buildDialogHTML(safeId);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    /** Remove o overlay e desfaz os listeners (AbortController). */
    function close() {
        controller.abort();
        overlay.remove();
    }
    const controller = new AbortController();
    const { signal } = controller;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay)
            return close();
        if ((e.target as any)?.closest?.('[data-enrich-action="close"]'))
            close();
    }, { signal });
    overlay.addEventListener('keydown', (/** @type {any} */ e) => {
        if (e.key === 'Escape')
            close();
    }, { signal });
    const form = dialog.querySelector('[data-enrich-form]');
    form?.addEventListener('submit', async (/** @type {any} */ e) => {
        e.preventDefault();
        const submitBtn: any = dialog.querySelector("[data-enrich-submit]");
        const typeEl: any = dialog.querySelector("#enrich-type");
        const descEl: any = dialog.querySelector("#enrich-desc");
        const fileEl: any = dialog.querySelector("#enrich-evidence");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = (t('enrichmentSubmitting') || 'Submitting') + '…';
        }
        try {
            await onSubmit?.({
                elementId: safeId,
                contributionType: typeEl?.value || '',
                description: descEl?.value || '',
                evidenceName: fileEl?.files?.[0]?.name || null,
            });
            close();
        }
        catch (err: any) {
            console.debug('[enrichment:submit]', err && err.message);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = t('enrichmentSubmit') || 'Submit';
            }
        }
    }, { signal });
    return { close, overlay };
}
