// @ts-check
// Generated from src/app/js/utils/ui/aiReportModal.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// @ts-check
/* ================================================================
   AI REPORT MODAL — C5b UI for template-based report generation
   Modal para selecao de template, tom e preview do conteudo gerado por IA

   Fluxo visual:
   1. User clica botao "AI" no toolbar do report editor
   2. handleOpenAIReportModal coleta contexto + templates + rate limit
   3. Este modulo abre modal mostrando:
      - Grid de template cards (4 built-in + custom)
      - Tone selector (Técnico / Executivo)
      - Rate limit status
      - Área de preview (vazia inicialmente)
      - Thumbs up/down após gerar
      - Botão Inserir (habilitado apos gerar)
   4. Click "Gerar" → chama onGenerate callback → mostra preview
   5. Click Inserir → adiciona HTML + watermark ao editor

   Referencia: docs/specs/features/SPEC_REPORT_SCRIPTS_LIBRARY.md (C5b)
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { showToast } from './toast.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('AiReportModal');
/** @type {HTMLElement|null} */
let _modalEl: any = null;
// UI-EVAL-COVERAGE-001 #sessao-longa (2026-08-06): o onKey abaixo entrava em
// `document` a cada abertura e so se auto-removia no caminho do Escape —
// fechar pelo "x"/backdrop deixava um keydown preso POR CICLO. Referencia de
// modulo + remocao em closeAIReportModal() = cleanup em TODO caminho de saida.
let _onKeyHandler: ((e: any) => void) | null = null;
let _state: any = {
    selectedTemplateId: null,
    selectedTone: 'technical',
    lastGenerated: null, // { content, rawContent, templateId, tone }
    onGenerate: null,
    onFeedback: null,
    reportId: null,
    templates: [],
    // User-selectable orchestration toggles (DD-38 flow). Default: gera só texto,
    // sem auto-inserir (preserva preview/revisão humana, padrão atual).
    includeFigures: false,
    autoInsert: false,
};
// ── Lifecycle ────────────────────────────────────────────────────────────────
/**
 * Open the AI report modal.
 *
 * @param {object} params
 * @param {string} params.reportId - Active report ID
 * @param {any} params.context - ReportContext from buildReportContext()
 * @param {Array<any>} params.templates - All templates (built-in + custom)
 * @param {any} params.rateLimit - { allowed, remaining, resetAt }
 * @param {any} params.feedbackStats - { total, up, down, byTemplate }
 * @param {(templateId: string, tone: string) => Promise<Object>} params.onGenerate
 * @param {(templateId: string, thumbs: 'up'|'down') => Promise<void>} params.onFeedback
 * @returns {HTMLElement}
 */
export function openAIReportModal( params: any) {
    closeAIReportModal();
    _state = {
        selectedTemplateId: params.templates[0]?.id || null,
        selectedTone: 'technical',
        lastGenerated: null,
        onGenerate: params.onGenerate || null,
        onFeedback: params.onFeedback || null,
        reportId: params.reportId,
        templates: params.templates || [],
        context: params.context,
        rateLimit: params.rateLimit,
        feedbackStats: params.feedbackStats,
        includeFigures: false,
        autoInsert: false,
    };
    _modalEl = document.createElement('div');
    _modalEl.id = 'ai-report-modal';
    _modalEl.className = 'ai-report-modal-overlay';
    _modalEl.setAttribute('role', 'dialog');
    _modalEl.setAttribute('aria-modal', 'true');
    _modalEl.setAttribute('aria-label', t('aiReport.title') || 'AI Report Generator');
    _modalEl.innerHTML = _render();
    document.body.appendChild(_modalEl);
    _attachListeners();
    log.info('AI report modal opened');
    return _modalEl;
}
export function closeAIReportModal() {
    // cleanup do keydown global ANTES do DOM — vale mesmo se _modalEl ja sumiu
    if (_onKeyHandler) {
        document.removeEventListener('keydown', _onKeyHandler);
        _onKeyHandler = null;
    }
    if (_modalEl) {
        _modalEl.remove();
        _modalEl = null;
    }
}
export function isAIReportModalOpen() {
    return _modalEl !== null && document.body.contains(_modalEl);
}
// ── Rendering ────────────────────────────────────────────────────────────────
function _render() {
    const ctx = _state.context || {};
    const rl = _state.rateLimit || { allowed: true, remaining: 10, resetAt: 0 };
    const templates = _state.templates || [];
    const contextSummary = `${ctx.elementCount || 0} ${t('aiReport.elements') || 'elementos'} · ${ctx.campaignCount || 0} ${t('aiReport.campaigns') || 'campanhas'} · EIS ${ctx.eisScore !== null && ctx.eisScore !== undefined ? ctx.eisScore.toFixed(2) : 'N/A'}`;
    const templateCards = templates
        .map(
            (tpl: any) => `
            <div class="ai-report-template-card-wrap">
                <button type="button" class="ai-report-template-card ${tpl.id === _state.selectedTemplateId ? 'active' : ''}"
                        data-template-id="${escapeAttr(tpl.id)}"
                        aria-pressed="${tpl.id === _state.selectedTemplateId}">
                    <div class="ai-report-template-name">${escapeHtml(tpl.name)}</div>
                    <div class="ai-report-template-desc">${escapeHtml(tpl.description || '')}</div>
                    ${tpl.isCustom ? `<span class="ai-report-custom-badge">${escapeHtml(t('aiReport.custom') || 'Custom')}</span>` : ''}
                </button>
                ${
                    tpl.isCustom
                        ? `<span class="ai-report-card-actions">
                        <button type="button" class="ai-report-card-edit" data-edit-id="${escapeAttr(tpl.id)}" title="${escapeAttr(t('aiReport.editTemplate') || 'Editar')}" aria-label="${escapeAttr(t('aiReport.editTemplate') || 'Editar')}">&#9998;</button>
                        <button type="button" class="ai-report-card-del" data-del-id="${escapeAttr(tpl.id)}" title="${escapeAttr(t('aiReport.deleteTemplate') || 'Excluir')}" aria-label="${escapeAttr(t('aiReport.deleteTemplate') || 'Excluir')}">&#10005;</button>
                    </span>`
                        : ''
                }
            </div>`,
        )
        .join('');
    return `
        <div class="ai-report-modal">
            <div class="ai-report-modal-header">
                <span class="ai-report-modal-title">${escapeHtml(t('aiReport.title') || 'Gerador de Relatório IA')}</span>
                <button type="button" class="ai-report-modal-close" aria-label="${escapeAttr(t('close') || 'Close')}">&times;</button>
            </div>

            <div class="ai-report-modal-body">
                <div class="ai-report-context">
                    <span class="ai-report-context-label">${escapeHtml(t('aiReport.contextLabel') || 'Contexto do modelo')}:</span>
                    <span class="ai-report-context-value">${escapeHtml(contextSummary)}</span>
                </div>

                <div class="ai-report-section-label">
                    ${escapeHtml(t('aiReport.selectTemplate') || 'Selecione um template')}
                    <button type="button" class="ai-report-new-template" title="${escapeAttr(t('aiReport.newTemplate') || 'Novo Template')}">+ ${escapeHtml(t('aiReport.newTemplate') || 'Novo Template')}</button>
                </div>
                <div class="ai-report-template-grid">
                    ${templateCards}
                </div>

                <div class="ai-report-section-label">${escapeHtml(t('aiReport.selectTone') || 'Tom')}</div>
                <div class="ai-report-tone-selector">
                    <button type="button" class="ai-report-tone-btn active" data-tone="technical" aria-pressed="true">
                        ${escapeHtml(t('aiReport.toneTechnical') || 'Técnico')}
                    </button>
                    <button type="button" class="ai-report-tone-btn" data-tone="executive" aria-pressed="false">
                        ${escapeHtml(t('aiReport.toneExecutive') || 'Executivo')}
                    </button>
                </div>

                <div class="ai-report-rate-limit">
                    <span class="ai-report-rate-limit-icon">&#9201;</span>
                    ${
                        rl.allowed
                            ? `${escapeHtml(t('aiReport.rateLimitAllowed') || 'Gerações restantes nesta hora')}: <strong>${rl.remaining}</strong>/10`
                            : `<span class="ai-report-rate-limit-blocked">${escapeHtml(t('aiReport.rateLimitBlocked') || 'Limite horário atingido')}</span>`
                    }
                </div>

                <div class="ai-report-section-label">${escapeHtml(t('aiReport.optionsLabel') || 'Incluir na geração')}</div>
                <div class="ai-report-options">
                    <label class="ai-report-option">
                        <input type="checkbox" class="ai-report-opt-figures" ${_state.includeFigures ? 'checked' : ''} />
                        <span>${escapeHtml(t('aiReport.optFigures') || 'Inserir figuras (raio 500 m, plumas 3D, mapas geo/pedo, fotos)')}</span>
                    </label>
                    <label class="ai-report-option">
                        <input type="checkbox" class="ai-report-opt-autoinsert" ${_state.autoInsert ? 'checked' : ''} />
                        <span>${escapeHtml(t('aiReport.optAutoInsert') || 'Inserir automaticamente no relatório (sem preview)')}</span>
                    </label>
                </div>

                <div class="ai-report-preview-label">${escapeHtml(t('aiReport.preview') || 'Preview')}</div>
                <div id="ai-report-preview" class="ai-report-preview ai-report-preview-empty">
                    ${escapeHtml(t('aiReport.previewEmpty') || 'Clique em "Gerar" para criar a seção')}
                </div>

                <div id="ai-report-feedback" class="ai-report-feedback" style="display:none">
                    <span class="ai-report-feedback-label">${escapeHtml(t('aiReport.feedbackPrompt') || 'Útil?')}</span>
                    <button type="button" class="ai-report-thumbs-btn" data-thumbs="up" aria-label="${escapeAttr(t('aiReport.thumbsUp') || 'Thumbs up')}">&#9650;</button>
                    <button type="button" class="ai-report-thumbs-btn" data-thumbs="down" aria-label="${escapeAttr(t('aiReport.thumbsDown') || 'Thumbs down')}">&#9660;</button>
                </div>
            </div>

            <div class="ai-report-modal-footer">
                <button type="button" class="btn btn-secondary ai-report-cancel">${escapeHtml(t('cancel') || 'Cancelar')}</button>
                <button type="button" class="btn btn-primary ai-report-generate" ${rl.allowed ? '' : 'disabled'}>${escapeHtml(t('aiReport.generateButton') || 'Gerar')}</button>
                <button type="button" class="btn btn-success ai-report-insert" disabled>${escapeHtml(t('aiReport.insertButton') || 'Inserir no relatório')}</button>
                <button type="button" class="btn btn-secondary ai-report-export-ecbt" title="${escapeAttr(t('aiReport.exportEcbtTitle') || 'Exporta o relatório atual como chave portátil .ecbt (escolhe entre publicar na Library ecbyts ou baixar local)')}">${escapeHtml(t('aiReport.exportEcbtButton') || 'Salvar como .ecbt')}</button>
            </div>
        </div>
    `;
}
// ── Event listeners ──────────────────────────────────────────────────────────
function _attachListeners() {
    if (!_modalEl) return;
    // Close buttons
    _modalEl.querySelector('.ai-report-modal-close')?.addEventListener('click', closeAIReportModal);
    _modalEl.querySelector('.ai-report-cancel')?.addEventListener('click', closeAIReportModal);
    // Click outside overlay
    _modalEl.addEventListener('click', (e: any) => {
        if (e.target === _modalEl) closeAIReportModal();
    });
    // Template card selection
    /** @type {any} */ (_modalEl.querySelectorAll('.ai-report-template-card')).forEach((card: any) => {
        card.addEventListener('click', () => {
            _state.selectedTemplateId = card.getAttribute('data-template-id');
            _modalEl?.querySelectorAll('.ai-report-template-card').forEach((c: any) => {
                c.classList.remove('active');
                c.setAttribute('aria-pressed', 'false');
            });
            card.classList.add('active');
            card.setAttribute('aria-pressed', 'true');
        });
    });
    // Tone selector
    /** @type {any} */ (_modalEl.querySelectorAll('.ai-report-tone-btn')).forEach((btn: any) => {
        btn.addEventListener('click', () => {
            _state.selectedTone = btn.getAttribute('data-tone') || 'technical';
            _modalEl?.querySelectorAll('.ai-report-tone-btn').forEach((b: any) => {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
        });
    });
    // New template button → opens editor sub-modal (SPEC_AI_REPORT_TEMPLATE_MARKETPLACE Fase 1)
    _modalEl.querySelector('.ai-report-new-template')?.addEventListener('click', async () => {
        const { openTemplateEditor } = await import('./_aiReportTemplateEditor.js' as string);
        openTemplateEditor({ onSaved: () => _refreshTemplateGrid() });
    });
    // Edit/Delete custom template cards
    /** @type {any} */ (_modalEl.querySelectorAll('.ai-report-card-edit')).forEach((btn: any) => {
        btn.addEventListener('click', async (ev: any) => {
            ev.stopPropagation();
            const id = btn.getAttribute('data-edit-id');
            const existing = (_state.templates || []).find((tt: any) => tt.id === id);
            if (!existing) return;
            const { openTemplateEditor } = await import('./_aiReportTemplateEditor.js' as string);
            openTemplateEditor({ existing, onSaved: () => _refreshTemplateGrid() });
        });
    });
    /** @type {any} */ (_modalEl.querySelectorAll('.ai-report-card-del')).forEach((btn: any) => {
        btn.addEventListener('click', async (ev: any) => {
            ev.stopPropagation();
            ev.preventDefault();
            const id = btn.getAttribute('data-del-id');
            if (!id) return;
            const { deleteTemplate } = await import('./_aiReportTemplateEditor.js' as string);
            const ok = await deleteTemplate(id);
            if (ok) {
                // Remoção cirúrgica: remove só o card, sem re-render do modal inteiro
                // (full re-render fechava o modal — ver AR-11). Atualiza estado local.
                _state.templates = (_state.templates || []).filter((tt: any) => tt.id !== id);
                const wrap = btn.closest('.ai-report-template-card-wrap');
                if (wrap) wrap.remove();
                if (_state.selectedTemplateId === id) {
                    _state.selectedTemplateId = _state.templates[0]?.id || null;
                }
            }
        });
    });
    // Option toggles — usuário escolhe o que entra na geração (DD-38 flow).
    _modalEl.querySelector('.ai-report-opt-figures')?.addEventListener('change', (e: any) => {
        _state.includeFigures = !!e?.target?.checked;
    });
    _modalEl.querySelector('.ai-report-opt-autoinsert')?.addEventListener('change', (e: any) => {
        _state.autoInsert = !!e?.target?.checked;
    });
    // Generate button
    _modalEl.querySelector('.ai-report-generate')?.addEventListener('click', _onGenerateClick);
    // Insert button
    _modalEl.querySelector('.ai-report-insert')?.addEventListener('click', _onInsertClick);
    // Export as .ecbt — exporta o relatório atual como chave portátil
    _modalEl.querySelector('.ai-report-export-ecbt')?.addEventListener('click', _onExportEcbtClick);
    // Feedback buttons (attached after generation, here we use delegation)
    _modalEl.querySelector('#ai-report-feedback')?.addEventListener('click', (e: any) => {
        const btn = e.target && e.target.closest ? e.target.closest('.ai-report-thumbs-btn') : null;
        if (!btn) return;
        const thumbs = btn.getAttribute('data-thumbs');
        if (!thumbs || !_state.lastGenerated || typeof _state.onFeedback !== 'function') return;
        _state.onFeedback(_state.lastGenerated.templateId, thumbs);
        // Visual feedback
        _modalEl
            ?.querySelectorAll('.ai-report-thumbs-btn')
            .forEach((b: any) => b.classList.remove('active'));
        btn.classList.add('active');
    });
    // Escape key
    /**
     * @param {any} e
     */
    if (_onKeyHandler) document.removeEventListener('keydown', _onKeyHandler);
    _onKeyHandler = (e: any) => {
        if (e.key === 'Escape') closeAIReportModal();
    };
    document.addEventListener('keydown', _onKeyHandler);
}
/**
 * Re-fetch templates (built-in + custom) and re-render the grid in place,
 * preserving the rest of the modal state. Called after create/edit/delete.
 */
async function _refreshTemplateGrid() {
    if (!_modalEl) return;
    try {
        const bot: any = await import('../../core/report/aiReportBot.js' as string);
        _state.templates = await bot.getAllTemplates();
        // selectedTemplateId may have been deleted — fallback to first
        const stillExists = (_state.templates || []).some((tt: any) => tt.id === _state.selectedTemplateId);
        if (!stillExists) _state.selectedTemplateId = _state.templates[0]?.id || null;
        // Re-render whole modal body to keep markup + listeners consistent
        _modalEl.innerHTML = _render();
        _attachListeners();
    } catch (err: any) {
        log.error('refresh template grid failed:', err?.message || err);
    }
}
async function _onGenerateClick() {
    if (!_state.selectedTemplateId || typeof _state.onGenerate !== 'function') return;
    const previewEl = _modalEl?.querySelector('#ai-report-preview');
    const generateBtn = _modalEl?.querySelector('.ai-report-generate');
    const insertBtn = _modalEl?.querySelector('.ai-report-insert');
    const feedbackEl = _modalEl?.querySelector('#ai-report-feedback');
    if (previewEl) {
        previewEl.innerHTML = `<div class="ai-report-loading">${escapeHtml(t('aiReport.generating') || 'Gerando…')}</div>`;
        previewEl.classList.remove('ai-report-preview-empty');
    }
    if (generateBtn instanceof HTMLButtonElement) generateBtn.disabled = true;
    try {
        const result = await _state.onGenerate(_state.selectedTemplateId, _state.selectedTone);
        if (!result || !result.content) {
            if (previewEl) {
                previewEl.innerHTML = `<div class="ai-report-error">${escapeHtml(t('aiReport.error') || 'Erro ao gerar')}</div>`;
            }
            return;
        }
        _state.lastGenerated = result;
        if (previewEl) previewEl.innerHTML = result.content;
        if (insertBtn instanceof HTMLButtonElement) insertBtn.disabled = false;
        if (feedbackEl instanceof HTMLElement) feedbackEl.style.display = 'flex';

        // Orquestração opcional escolhida pelo usuário (DD-38 flow):
        //   - includeFigures → dispara bot de figuras (raio/plumas/mapas/photolog)
        //   - autoInsert     → empurra a seção pro relatório sem aguardar clique
        if (_state.includeFigures) {
            try {
                const auto: any = await import('../handlers/automation.js' as string);
                // Filtra por providers declarados no template selecionado: figuras só
                // aparecem em relatórios que as incluem (DD-38 declara raio/plumas/mapas/fotos;
                // Introdução/Conclusão/Resumo Executivo não declaram → nenhuma figura).
                // Template custom sem figureProviders = comportamento atual (todas applicable).
                const tpl = (_state.templates || []).find(
                    (t: any) => t && t.id === _state.selectedTemplateId,
                );
                const providers = Array.isArray(tpl?.figureProviders) ? tpl.figureProviders : undefined;
                if (providers && providers.length === 0) {
                    log.info('template declares no figures; skipping figures dispatch');
                } else {
                    await auto.handleAutoInsertReportFigures?.(providers ? { providers } : {});
                }
            } catch (e: any) {
                log.error('figures bot dispatch failed:', e?.message || e);
            }
        }
        if (_state.autoInsert) {
            await _onInsertClick();
        }
    } finally {
        if (generateBtn instanceof HTMLButtonElement) generateBtn.disabled = false;
    }
}

async function _onExportEcbtClick() {
    try {
        const mod: any = await import('../report/_reportShareEcbt.js' as string);
        const ok = await mod.exportActiveReportEcbt?.();
        if (ok) closeAIReportModal();
    } catch (err: any) {
        log.error('export .ecbt failed:', err?.message || err);
        showToast(t('aiReport.exportEcbtError') || 'Erro ao exportar .ecbt', 'error');
    }
}
async function _onInsertClick() {
    if (!_state.lastGenerated) return;
    try {
        // Use the manager + editor refresh APIs so autosave + export + visible DOM
        // all stay in sync. The previous approach wrote directly to innerHTML
        // which bypassed the report manager state (same bug class as C5a had
        // with updateReport → setReportContent fix, commit 12a0547).
        const mgr = /** @type {{ getReport?: () => any, setReportContent?: (html: string) => void }} */ (
            await import('../report/manager.js' as string)
        );
        const editorModulePath = '../report/editor.js';
        const ed = /** @type {{ updateReportEditor?: () => void }} */ (await import(editorModulePath));
        const current = mgr.getReport?.();
        if (!current) {
            showToast(t('aiReport.editorNotFound') || 'Editor não encontrado', 'warning');
            return;
        }
        const appended = (current.content || '') + _state.lastGenerated.content;
        mgr.setReportContent?.(appended);
        ed.updateReportEditor?.();
        showToast(t('aiReport.inserted') || 'Seção inserida no relatório', 'success');
        closeAIReportModal();
    } catch (err: any) {
        log.error('insert failed:', /** @type {any} */ (err).message);
        showToast(t('aiReport.error') || 'Erro ao inserir', 'error');
    }
}
