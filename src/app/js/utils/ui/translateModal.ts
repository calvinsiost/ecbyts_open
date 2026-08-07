// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   TRANSLATE MODAL — C5a UI for report translation
   Modal de confirmacao com estimativa de traducao

   Fluxo:
   1. User clica botao 🌐 na toolbar do report editor
   2. handleOpenTranslateModal computa estimativa (chunks, tokens, cache)
   3. Este modulo abre modal mostrando preview + botoes de idioma
   4. User seleciona target language e confirma
   5. handleTranslateReport executa LLM + atualiza report

   Referencia: docs/specs/features/SPEC_REPORT_SCRIPTS_LIBRARY.md (C5a)
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('TranslateModal');
/** @type {HTMLElement|null} */
let _modalEl: any = null;
const LANGUAGES = Object.freeze([
    { code: 'pt-BR', label: 'Português (BR)', flag: '🇧🇷' },
    { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
    { code: 'es-LA', label: 'Español (LA)', flag: '🇲🇽' },
]);
/**
 * Open the translate modal with the given estimate.
 *
 * @param {object} params
 * @param {string} params.sourceLang - Source language code
 * @param {string} params.targetLang - Initial target language code
 * @param {any} params.estimate - From estimateTranslation()
 * @param {string} params.reportId - Active report ID
 * @param {(targetLang: string) => Promise<void>} params.onConfirm - Called when user confirms
 * @returns {HTMLElement} The modal element
 */
export function openTranslateModal(params: any) {
    const { sourceLang, targetLang, estimate, onConfirm } = params || {};
    closeTranslateModal();
    _modalEl = document.createElement('div');
    _modalEl.id = 'translate-modal';
    _modalEl.className = 'translate-modal-overlay';
    _modalEl.setAttribute('role', 'dialog');
    _modalEl.setAttribute('aria-modal', 'true');
    _modalEl.setAttribute('aria-label', t('report.translate.title') || 'Translate Report');
    _modalEl.innerHTML = _render(sourceLang, targetLang, estimate);
    document.body.appendChild(_modalEl);
    _attachListeners(onConfirm);
    log.info('Translate modal opened: %s -> %s', sourceLang, targetLang);
    return _modalEl;
}
export function closeTranslateModal() {
    if (_modalEl) {
        _modalEl.remove();
        _modalEl = null;
    }
}
export function isTranslateModalOpen() {
    return _modalEl !== null && document.body.contains(_modalEl);
}
// ── Rendering ────────────────────────────────────────────────────────────────
/**
 * @param {any} sourceLang
 * @param {any} initialTargetLang
 * @param {any} estimate
 */
function _render(sourceLang: any, initialTargetLang: any, estimate: any) {
    const sourceLabel = LANGUAGES.find((/** @type {any} */ l) => l.code === sourceLang)?.label || sourceLang;
    const cacheHit = Boolean(estimate?.cacheHit);
    const chars = estimate?.chars || 0;
    const tokens = estimate?.tokens || 0;
    const chunks = estimate?.chunks || 0;
    const glossaryHits = estimate?.glossaryHits || 0;
    // Rough cost estimate - GPT-4o-mini input is ~$0.00015/1K tokens
    const costUsd = (tokens / 1000) * 0.00015;
    const costStr = costUsd < 0.001 ? '< $0.001' : `~$${costUsd.toFixed(4)}`;
    const targetButtons = LANGUAGES.filter((/** @type {any} */ l) => l.code !== sourceLang)
        .map(
            (/** @type {any} */ l) => `
            <button type="button" class="translate-lang-btn ${l.code === initialTargetLang ? 'active' : ''}"
                    data-lang="${escapeAttr(l.code)}" aria-pressed="${l.code === initialTargetLang}">
                <span class="translate-lang-flag">${l.flag}</span>
                <span class="translate-lang-label">${escapeHtml(l.label)}</span>
            </button>`,
        )
        .join('');
    return `
        <div class="translate-modal">
            <div class="translate-modal-header">
                <span class="translate-modal-title">${escapeHtml(t('report.translate.title') || 'Traduzir Relatório')}</span>
                <button type="button" class="translate-modal-close" aria-label="${escapeAttr(t('close') || 'Close')}">&times;</button>
            </div>

            <div class="translate-modal-body">
                <div class="translate-source">
                    <span class="translate-source-label">${escapeHtml(t('report.translate.sourceLanguage') || 'Idioma de origem')}:</span>
                    <span class="translate-source-value">${escapeHtml(sourceLabel)}</span>
                </div>

                <div class="translate-target-label">${escapeHtml(t('report.translate.targetLanguage') || 'Traduzir para')}:</div>
                <div class="translate-lang-grid">
                    ${targetButtons}
                </div>

                <div class="translate-estimate">
                    <div class="translate-estimate-title">${escapeHtml(t('report.translate.estimate') || 'Estimativa')}</div>
                    ${
                        cacheHit
                            ? `<div class="translate-cache-hit">${escapeHtml(t('report.translate.cacheHit') || 'Tradução em cache — retorno instantâneo, custo zero')}</div>`
                            : `<div class="translate-estimate-grid">
                        <div class="translate-estimate-item">
                            <span class="translate-estimate-value">${chars.toLocaleString()}</span>
                            <span class="translate-estimate-label">${escapeHtml(t('report.translate.chars') || 'caracteres')}</span>
                        </div>
                        <div class="translate-estimate-item">
                            <span class="translate-estimate-value">${tokens.toLocaleString()}</span>
                            <span class="translate-estimate-label">${escapeHtml(t('report.translate.tokens') || 'tokens estimados')}</span>
                        </div>
                        <div class="translate-estimate-item">
                            <span class="translate-estimate-value">${chunks}</span>
                            <span class="translate-estimate-label">${escapeHtml(t('report.translate.chunks') || 'chunks')}</span>
                        </div>
                        <div class="translate-estimate-item">
                            <span class="translate-estimate-value">${glossaryHits}</span>
                            <span class="translate-estimate-label">${escapeHtml(t('report.translate.glossary') || 'termos protegidos')}</span>
                        </div>
                    </div>
                    <div class="translate-cost">${escapeHtml(t('report.translate.costEstimate') || 'Custo estimado')}: <strong>${costStr}</strong></div>`
                    }
                </div>

                <div class="translate-notice">
                    ${escapeHtml(t('report.translate.notice') || 'Tags HTML, links e termos técnicos do glossário são preservados.')}
                </div>
            </div>

            <div class="translate-modal-footer">
                <button type="button" class="btn btn-secondary translate-cancel">${escapeHtml(t('cancel') || 'Cancelar')}</button>
                <button type="button" class="btn btn-primary translate-confirm">${escapeHtml(t('report.translate.confirmButton') || 'Traduzir')}</button>
            </div>
        </div>
    `;
}
/**
 * @param {any} onConfirm
 */
function _attachListeners(onConfirm: any) {
    if (!_modalEl) return;
    const closeBtn = (_modalEl.querySelector('.translate-modal-close')) as any;
    const cancelBtn = (_modalEl.querySelector('.translate-cancel')) as any;
    const confirmBtn = (_modalEl.querySelector('.translate-confirm')) as any;
    closeBtn?.addEventListener('click', closeTranslateModal);
    cancelBtn?.addEventListener('click', closeTranslateModal);
    // Language selector - mutual exclusion
    (_modalEl.querySelectorAll('.translate-lang-btn')).forEach((btn: any) => {
        btn.addEventListener('click', () => {
            _modalEl?.querySelectorAll('.translate-lang-btn').forEach((b: any) => {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
        });
    });
    // Confirm → get selected language and call back
    confirmBtn?.addEventListener('click', async () => {
        const selected = _modalEl?.querySelector('.translate-lang-btn.active');
        const targetLang = selected?.getAttribute('data-lang');
        if (!targetLang) {
            log.warn('No target language selected');
            return;
        }
        closeTranslateModal();
        if (typeof onConfirm === 'function') {
            await onConfirm(targetLang);
        }
    });
    // Click outside modal (on overlay) → close
    _modalEl.addEventListener("click", (e: any) => {
        if (e.target === _modalEl) closeTranslateModal();
    });
    // Escape key
    /**
     * @param {any} e
     */
    const onKey = (e: any) => {
        if (e.key === 'Escape') {
            closeTranslateModal();
            document.removeEventListener('keydown', onKey);
        }
    };
    document.addEventListener('keydown', onKey);
}
