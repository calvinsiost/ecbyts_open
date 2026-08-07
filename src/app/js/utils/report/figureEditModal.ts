// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Modal de edição individual de figura corporativa do relatório.
// Aberto via botão ✎ no header. Permite alterar legenda, número, escala e recorte
// (scope picker — lista candidatos do mesmo provider). Pedido Calvin 2026-06-01 (Opção A).
//
// Edita IN-PLACE o <figure> existente no editor: caption + número são reescritos
// inline; escala aplica width% na .report-fc-img; recorte regenera o dataUrl via
// figureProviderRegistry e atualiza data-attrs. Persistência via setReportContent.

import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { escapeHtml } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
import {
    parseFigureNumber,
    stripFigurePrefix,
    readScalePctFromStyle,
    normalizeScalePct,
    normalizeFigureNumber,
    buildHeaderNumberLabel,
    buildCaptionText,
} from './_figureEditModalPure.js';

const log = createLogger('FigureEditModal');

interface FigureScopeData {
    elementId?: string | null;
    groupId?: string | null;
    plumeId?: string | null;
    photoId?: string | null;
}

interface ProviderCandidate {
    candidateId: string;
    label: string;
}

let _overlay: HTMLElement | null = null;
let _figEl: HTMLElement | null = null;
let _keyHandler: ((e: KeyboardEvent) => void) | null = null;

function _close(): void {
    if (_keyHandler) {
        document.removeEventListener('keydown', _keyHandler);
        _keyHandler = null;
    }
    if (_overlay) {
        _overlay.remove();
        _overlay = null;
    }
    _figEl = null;
}

/**
 * Abre o modal para editar a figura clicada (o <figure> alvo é passado pelo handler
 * do editor). Lê estado atual dos data-attrs + DOM, mostra form, ao salvar reescreve
 * o <figure> in-place e chama setReportContent para persistir.
 */
export async function openFigureEditModal(figEl: HTMLElement): Promise<void> {
    _close();
    if (!figEl || !figEl.classList?.contains('report-figure-corporate')) {
        showToast(t('figEdit.notAFigure') || 'Selecione uma figura para editar.', 'warning');
        return;
    }
    _figEl = figEl;

    const providerId = figEl.getAttribute('data-figure-provider') || '';
    const candidateId = figEl.getAttribute('data-figure-candidate') || '';
    const captionEl = figEl.querySelector('.report-fc-caption') as HTMLElement | null;
    const numEl = figEl.querySelector('.report-fc-number') as HTMLElement | null;
    const imgWrap = figEl.querySelector('.report-fc-img') as HTMLElement | null;

    // Extrai estado atual do DOM (usa helpers puros — testáveis isoladamente)
    const currentNum = parseFigureNumber(numEl?.textContent || '');
    const currentCaption = stripFigurePrefix(captionEl?.textContent || '', currentNum);
    const currentScalePct = _readScalePct(imgWrap);

    // Lista candidatos do mesmo provider para o picker de recorte (se houver)
    let candidates: ProviderCandidate[] = [];
    try {
        const ctx = await _buildContext();
        await import('./figureProviders.js' as string);
        const reg: any = await import('../../core/report/figureProviderRegistry.js' as string);
        const all = reg.enumerateFigureCandidates(ctx) || [];
        candidates = all
            .filter((c: any) => c.providerId === providerId)
            .map((c: any) => ({ candidateId: c.candidateId || '', label: c.label }));
    } catch (e: any) {
        log.error('candidates load failed:', e?.message || e);
    }

    _overlay = document.createElement('div');
    _overlay.className = 'async-dialog-overlay report-figedit-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', t('figEdit.title') || 'Editar figura');
    _overlay.innerHTML = `
        <div class="async-dialog report-figedit-dialog">
            <div class="report-figedit-header">
                <span class="report-figedit-title">${escapeHtml(t('figEdit.title') || 'Editar figura')}</span>
                <button type="button" class="report-figedit-close" aria-label="${escapeHtml(t('close') || 'Fechar')}">&times;</button>
            </div>
            <div class="report-figedit-body">
                <label class="report-figedit-field">
                    <span class="report-figedit-label">${escapeHtml(t('figEdit.captionLabel') || 'Legenda')}</span>
                    <textarea class="report-figedit-caption" rows="3">${escapeHtml(currentCaption)}</textarea>
                </label>
                <div class="report-figedit-row">
                    <label class="report-figedit-field">
                        <span class="report-figedit-label">${escapeHtml(t('figEdit.numberLabel') || 'Número')}</span>
                        <input type="number" class="report-figedit-number" min="1" max="999" value="${currentNum || ''}" />
                    </label>
                    <label class="report-figedit-field">
                        <span class="report-figedit-label">${escapeHtml(t('figEdit.scaleLabel') || 'Escala (largura %)')}</span>
                        <input type="number" class="report-figedit-scale" min="20" max="100" step="5" value="${currentScalePct}" />
                    </label>
                </div>
                ${candidates.length > 1 ? `
                <label class="report-figedit-field">
                    <span class="report-figedit-label">${escapeHtml(t('figEdit.scopeLabel') || 'Recorte do dataset')}</span>
                    <select class="report-figedit-scope">
                        ${candidates
                            .map(
                                (c) =>
                                    `<option value="${escapeHtml(c.candidateId)}" ${c.candidateId === candidateId ? 'selected' : ''}>${escapeHtml(c.label)}</option>`,
                            )
                            .join('')}
                    </select>
                    <span class="report-figedit-hint">${escapeHtml(t('figEdit.scopeHint') || 'Trocar regenera a imagem da figura.')}</span>
                </label>` : ''}
            </div>
            <div class="report-figedit-actions">
                <button type="button" class="btn btn-sm report-figedit-cancel">${escapeHtml(t('cancel') || 'Cancelar')}</button>
                <button type="button" class="btn btn-primary btn-sm report-figedit-save">${escapeHtml(t('figEdit.save') || 'Salvar alterações')}</button>
            </div>
        </div>`;
    document.body.appendChild(_overlay);

    _overlay.querySelector('.report-figedit-close')?.addEventListener('click', _close);
    _overlay.querySelector('.report-figedit-cancel')?.addEventListener('click', _close);
    _overlay.addEventListener('click', (e: any) => {
        if (e.target === _overlay) _close();
    });
    _overlay.querySelector('.report-figedit-save')?.addEventListener('click', _onSave);

    // A11y (rating action #3): Escape fecha + focus trap simples ciclando os focáveis.
    _keyHandler = (e: KeyboardEvent) => {
        if (!_overlay) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            _close();
            return;
        }
        if (e.key === 'Tab') {
            const focusables = Array.from(
                _overlay.querySelectorAll<HTMLElement>(
                    'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
                ),
            ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
            if (focusables.length === 0) return;
            const first = focusables[0]!;
            const last = focusables[focusables.length - 1]!;
            const active = document.activeElement as HTMLElement | null;
            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };
    document.addEventListener('keydown', _keyHandler);

    // Foco inicial no primeiro input (a11y: usuário consegue editar com teclado)
    setTimeout(() => {
        const firstInput = _overlay?.querySelector<HTMLElement>('.report-figedit-caption');
        firstInput?.focus();
    }, 0);
}

async function _onSave(): Promise<void> {
    if (!_figEl || !_overlay) return;
    const captionInput = _overlay.querySelector('.report-figedit-caption') as HTMLTextAreaElement | null;
    const numInput = _overlay.querySelector('.report-figedit-number') as HTMLInputElement | null;
    const scaleInput = _overlay.querySelector('.report-figedit-scale') as HTMLInputElement | null;
    const scopeSelect = _overlay.querySelector('.report-figedit-scope') as HTMLSelectElement | null;

    const newCaption = (captionInput?.value || '').trim();
    const newNum = normalizeFigureNumber(numInput?.value || '0');
    const newScale = normalizeScalePct(scaleInput?.value || '100');
    const newCandidateId = scopeSelect?.value || '';
    const currentCandidateId = _figEl.getAttribute('data-figure-candidate') || '';

    // 1) Caption + número (inline DOM)
    _applyCaptionAndNumber(_figEl, newCaption, newNum);

    // 2) Escala (CSS inline em .report-fc-img)
    _applyScale(_figEl, newScale);

    // 3) Recorte (regenera src/scope se mudou) — confirmação destrutiva:
    //    regenerar a imagem substitui o data URL atual e não tem undo no editor.
    if (scopeSelect && newCandidateId && newCandidateId !== currentCandidateId) {
        const confirmMsg = t('figEdit.confirmRegenScope')
            || 'Trocar o recorte vai REGENERAR a imagem da figura (substitui o conteúdo visual). Confirmar?';
        const userOk = await _confirmDestructive(confirmMsg);
        if (!userOk) {
            // Usuário cancelou: ainda salvamos as outras edições (caption/número/escala),
            // só pulamos a regeneração.
            log.info('regenerate scope cancelled by user; keeping previous image');
        } else {
            const regenerated = await _regenerateWithNewScope(_figEl, newCandidateId);
            if (!regenerated) {
                showToast(t('figEdit.regenFailed') || 'Falha ao regenerar com novo recorte.', 'error');
                return;
            }
        }
    }

    // 4) Persiste no manager (debounce do editor pega via input event sintético)
    try {
        const editor: any = await import('./editor.js' as string);
        const editorDiv = document.getElementById('report-editor-content');
        if (editorDiv) {
            const mgr: any = await import('./manager.js' as string);
            mgr.setReportContent?.(editorDiv.innerHTML);
            editor.updateReportEditor?.();
        }
    } catch (e: any) {
        log.error('persist failed:', e?.message || e);
    }

    showToast(t('figEdit.saved') || 'Figura atualizada.', 'success');
    _close();
}

function _applyCaptionAndNumber(figEl: HTMLElement, caption: string, num: number): void {
    const numEl = figEl.querySelector('.report-fc-number') as HTMLElement | null;
    if (numEl) numEl.textContent = buildHeaderNumberLabel(num);
    let captionEl = figEl.querySelector('.report-fc-caption') as HTMLElement | null;
    const captionText = buildCaptionText(caption, num);
    if (caption) {
        if (!captionEl) {
            captionEl = document.createElement('figcaption');
            captionEl.className = 'report-fc-caption';
            const stamp = figEl.querySelector('.report-fc-stamp');
            if (stamp) figEl.insertBefore(captionEl, stamp);
            else figEl.appendChild(captionEl);
        }
        captionEl.textContent = captionText;
    } else if (captionEl) {
        captionEl.remove();
    }
}

function _applyScale(figEl: HTMLElement, scalePct: number): void {
    const img = figEl.querySelector('.report-fc-img img') as HTMLImageElement | null;
    if (!img) return;
    if (scalePct >= 100) {
        img.style.removeProperty('width');
    } else {
        img.style.width = `${scalePct}%`;
    }
}

async function _regenerateWithNewScope(figEl: HTMLElement, candidateId: string): Promise<boolean> {
    const providerId = figEl.getAttribute('data-figure-provider') || '';
    if (!providerId) return false;
    try {
        const ctx = await _buildContext();
        await import('./figureProviders.js' as string);
        const reg: any = await import('../../core/report/figureProviderRegistry.js' as string);
        const figs = await reg.generateSelectedFigures(ctx, [{ providerId, candidateId }]);
        const fig = figs && figs[0];
        if (!fig || !fig.dataUrl) return false;
        const img = figEl.querySelector('.report-fc-img img') as HTMLImageElement | null;
        if (img) img.src = fig.dataUrl;
        figEl.setAttribute('data-figure-candidate', candidateId);
        // Atualiza scope data-attrs (limpa antigos e seta novos)
        ['data-figure-element-id', 'data-figure-group-id', 'data-figure-plume-id', 'data-figure-photo-id'].forEach((a) =>
            figEl.removeAttribute(a),
        );
        const scope: FigureScopeData = fig.scope || {};
        if (scope.elementId) figEl.setAttribute('data-figure-element-id', String(scope.elementId));
        if (scope.groupId) figEl.setAttribute('data-figure-group-id', String(scope.groupId));
        if (scope.plumeId) figEl.setAttribute('data-figure-plume-id', String(scope.plumeId));
        if (scope.photoId) figEl.setAttribute('data-figure-photo-id', String(scope.photoId));
        return true;
    } catch (e: any) {
        log.error('regen scope failed:', e?.message || e);
        return false;
    }
}

async function _buildContext(): Promise<any> {
    const ctx: any = { elements: [], photos: [] };
    try {
        const { getAllElements }: any = await import('../../core/elements/manager.js' as string);
        ctx.elements = getAllElements?.() || [];
    } catch (e: any) {
        console.debug('[figEdit:ctx:elements]', e?.message || e);
    }
    try {
        const pl: any = await import('../../core/photolog/manager.js' as string);
        ctx.photos = pl.getAllPhotos?.() || [];
    } catch (e: any) {
        console.debug('[figEdit:ctx:photos]', e?.message || e);
    }
    return ctx;
}

function _readScalePct(imgWrap: HTMLElement | null): number {
    if (!imgWrap) return 100;
    const img = imgWrap.querySelector('img') as HTMLImageElement | null;
    if (!img) return 100;
    return readScalePctFromStyle(img.style.width || '');
}

/**
 * Confirmação destrutiva via asyncConfirm do projeto. Se o modal assíncrono não
 * carregar, cancela por segurança em vez de usar confirm() nativo.
 */
async function _confirmDestructive(message: string): Promise<boolean> {
    try {
        const mod: any = await import('../ui/asyncDialogs.js' as string);
        if (typeof mod.asyncConfirm === 'function') {
            const ok = await mod.asyncConfirm(message, {
                confirmLabel: t('figEdit.confirmYes') || 'Confirmar',
                cancelLabel: t('cancel') || 'Cancelar',
                danger: true,
            });
            return !!ok;
        }
    } catch (e: any) {
        console.debug('[figEdit:asyncConfirm-fallback]', e?.message || e);
    }
    showToast(t('figEdit.confirmUnavailable') || 'Confirmação indisponível; recorte mantido.', 'warning');
    return false;
}
