// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * documentAssessmentPanel.js - UI de revisão e aplicação de auto-configuração
 * de modelo a partir de documentos ambientais (ASSESS-001).
 */

import { t } from '../i18n/translations.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../helpers/html.js';

/** @type {any} */ let _panelEl: any = null;
/** @type {any} */ let _currentAssessment: any = null;
/** @type {any} */ let _onApplyCallback: any = null;

/**
 * Gera o HTML da card de assessment para inserção no ingestion review.
 * @param {any} assessment - Resultado de assessDocumentV2
 * @returns {string} HTML string
 */
export function renderAssessmentCard(assessment: any): string {
    if (!assessment?.recommendations?.length && !assessment?.gaps?.length) {
        return '';
    }

    const recs = assessment.recommendations || [];
    const gaps = assessment.gaps || [];
    const lang = assessment.language?.locale || 'en-US';

    const familiesHtml = recs
        .map((r: any) => {
            const confPct = Math.round(r.confidence * 100);
            const submoduleBadge = r.submodule
                ? `<span style="font-size:9px;padding:1px 6px;border-radius:999px;background:var(--primary-50);border:1px solid var(--primary-200);color:var(--primary-700);margin-left:6px;">${t('docAssess.submoduleSuggested')}: ${escapeHtml(r.submodule)}</span>`
                : '';
            return `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--neutral-200);">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:12px;font-weight:500;color:var(--neutral-800);">${escapeHtml(r.familyId)}</span>
                        ${submoduleBadge}
                    </div>
                    <span style="font-size:11px;color:var(--neutral-600);">${confPct}%</span>
                </div>
            `;
        })
        .join('');

    const gapsHtml = gaps.length
        ? `
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--warning-200);">
                <p style="font-size:10px;color:var(--warning-700);margin:0 0 4px;">${t('docAssess.gapsDetected')}:</p>
                ${gaps
                    .map(
                        (g: any) => `
                            <div style="font-size:10px;color:var(--neutral-700);padding:2px 0;">
                                "${escapeHtml(g.keyword)}" (${g.count}x)
                            </div>
                        `,
                    )
                    .join('')}
            </div>
        `
        : '';

    return `
        <div style="background:var(--accent-50,#eff6ff);border:1px solid var(--accent-200,#bfdbfe);border-radius:6px;padding:10px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <strong style="font-size:12px;color:var(--accent-800,#1e40af);">${t('docAssess.autoConfigTitle')}</strong>
                <span style="font-size:9px;padding:2px 6px;border-radius:999px;background:var(--neutral-100);border:1px solid var(--neutral-200);color:var(--neutral-600);">${escapeHtml(lang)}</span>
            </div>
            <p style="font-size:10px;color:var(--neutral-600);margin:0 0 6px;">${t('docAssess.detectedFamilies')}:</p>
            <div style="margin-bottom:4px;">${familiesHtml}</div>
            ${gapsHtml}
            <button class="btn btn-primary" data-cc-action="cc-e708dd26" style="margin-top:8px;font-size:11px;padding:4px 12px;width:100%;">
                ${t('docAssess.reviewAndApply')}
            </button>
        </div>
    `;
}

/**
 * Abre o painel de revisão detalhada como overlay.
 * @param {any} assessment
 * @param {Function} onApply - callback(acceptedFamilyIds, justifications)
 */
export function openDocAssessmentReview(assessment: any, onApply: any) {
    _currentAssessment = assessment;
    _onApplyCallback = onApply;
    _ensurePanelDOM();

    const recs = assessment?.recommendations || [];
    const gaps = assessment?.gaps || [];

    let recsHtml = recs
        .map((r: any, idx: any) => {
            const confPct = Math.round(r.confidence * 100);
            const submoduleBadge = r.submodule
                ? `<span style="font-size:9px;padding:1px 6px;border-radius:999px;background:var(--primary-50);border:1px solid var(--primary-200);color:var(--primary-700);margin-left:6px;">${t('docAssess.submoduleSuggested')}: ${escapeHtml(r.submodule)}</span>`
                : '';
            const justifyId = `assess-justify-${idx}`;
            return `
                <div style="padding:8px;border:1px solid var(--neutral-200);border-radius:6px;margin-bottom:6px;background:var(--neutral-50);"
                     data-family="${escapeHtml(r.familyId)}">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input data-field-meta="true" data-field-meta-key="auto-pos:documentAssessmentPanel:input:L108" type="checkbox" class="assess-family-cb" data-family="${escapeHtml(r.familyId)}" checked>
                        <span style="font-size:12px;font-weight:500;color:var(--neutral-800);">${escapeHtml(r.familyId)}</span>
                        <span style="font-size:11px;color:var(--neutral-600);margin-left:auto;">${confPct}%</span>
                    </label>
                    ${submoduleBadge}
                    <div class="assess-justify-box" style="display:none;margin-top:6px;"
                         data-justify-for="${escapeHtml(r.familyId)}">
                        <textarea data-field-meta="true" data-field-meta-key="auto-pos:documentAssessmentPanel:textarea:L115" id="${justifyId}" placeholder="${t('docAssess.justifyExclusion')}" rows="2"
                                  style="width:100%;font-size:11px;padding:4px;border:1px solid var(--neutral-300);border-radius:4px;resize:vertical;"></textarea>
                    </div>
                </div>
            `;
        })
        .join('');

    if (!recsHtml) {
        recsHtml = `<p style="font-size:11px;color:var(--neutral-500);">Nenhuma família detectada.</p>`;
    }

    const gapsHtml = gaps.length
        ? `
            <div style="margin-top:10px;">
                <p style="font-size:11px;color:var(--warning-700);margin:0 0 6px;">${t('docAssess.gapsDetected')}:</p>
                ${gaps
                    .map(
                        (g: any) => `
                            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px;border:1px solid var(--warning-200);border-radius:4px;background:var(--warning-50);margin-bottom:4px;">
                                <span style="font-size:11px;color:var(--neutral-800);">"${escapeHtml(g.keyword)}" (${g.count}x)</span>
                                <button class="btn btn-outline" style="font-size:10px;padding:2px 8px;"
                                        data-doc-add-family="${escapeHtml(g.keyword)}">
                                    ${t('docAssess.createCustomFamily')}
                                </button>
                            </div>
                        `,
                    )
                    .join('')}
            </div>
        `
        : '';

    (_panelEl.querySelector('.assess-panel__body') as any).innerHTML = `
        <div style="margin-bottom:10px;">
            <p style="font-size:11px;color:var(--neutral-600);margin:0 0 8px;">${t('docAssess.detectedFamilies')}:</p>
            ${recsHtml}
        </div>
        ${gapsHtml}
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;border-top:1px solid var(--neutral-200);padding-top:10px;">
            <button class="btn btn-secondary" data-doc-cancel>${t('cancel')}</button>
            <button class="btn btn-primary" data-doc-apply>${t('docAssess.applyConfig')}</button>
        </div>
    `;

    _panelEl.style.display = 'flex';

    // Wire checkbox → mostrar/esconder justificativa para high-confidence
    (_panelEl.querySelectorAll('.assess-family-cb') as any).forEach((cb: any) => {
        const family = cb.dataset.family || '';
        const rec = recs.find((r: any) => r.familyId === family);
        const justifyBox = (_panelEl.querySelector(`[data-justify-for="${family}"]`) as any);
        if (!justifyBox) return;

        const update = () => {
            const unchecked = !cb.checked;
            const highConf = rec && rec.confidence > 0.8;
            justifyBox.style.display = unchecked && highConf ? 'block' : 'none';
        };
        cb.addEventListener('change', update);
        update();
    });
}

/**
 * Fecha o painel de revisão.
 */
export function closeDocAssessmentReview() {
    if (_panelEl) _panelEl.style.display = 'none';
}

/**
 * Aplica a configuração aceita pelo usuário.
 * Coleta checkboxes, valida justificativas, chama callback.
 */
export function applyDocAssessmentConfig() {
    if (!_panelEl || !_currentAssessment) return;

    const recs = _currentAssessment.recommendations || [];
    /** @type {string[]} */
    const accepted: any = [];
    const justifications: Record<string, any> = {};
    let blocked = false;

    (_panelEl.querySelectorAll('.assess-family-cb') as any).forEach((cb: any) => {
        const family = cb.dataset.family || '';
        if (cb.checked) {
            accepted.push(family);
            return;
        }
        const rec = recs.find((r: any) => r.familyId === family);
        const textarea = (_panelEl.querySelector(`[data-justify-for="${family}"] textarea`) as any);
        if (rec && rec.confidence > 0.8) {
            const reason = textarea ? textarea.value.trim() : '';
            if (!reason) {
                if (textarea) textarea.style.borderColor = 'var(--error-400)';
                blocked = true;
            } else {
                justifications[family] = reason;
                if (textarea) textarea.style.borderColor = '';
            }
        }
    });

    if (blocked) {
        showToast(t('docAssess.justifyExclusion'), 'warning');
        return;
    }

    closeDocAssessmentReview();
    if (typeof _onApplyCallback === 'function') {
        _onApplyCallback(accepted, justifications);
    }
}

/**
 * Cria elementos no modelo a partir das famílias aceitas.
 * @param {string[]} acceptedFamilyIds
 * @param {any} assessment
 * @returns {Promise<{created: string[], submodules: string[]}>}
 */
export async function createElementsFromAssessment(acceptedFamilyIds: any, assessment: any): Promise<{created: string[], submodules: string[]}> {
    const { addNewElement } = await import('../../core/elements/manager.js');
    const created = [];
    const submodules = [];

    for (const familyId of acceptedFamilyIds) {
        const rec = assessment?.recommendations?.find((r: any) => r.familyId === familyId);
        const count = rec?.instances || 1;
        for (let i = 0; i < count; i++) {
            try {
                const el = (addNewElement(familyId) as { id?: string });
                if (el?.id) created.push(el.id);
            } catch (err: any) {
                console.warn('[DocumentAssessmentPanel] Failed to create element', familyId, err);
            }
        }
        if (rec?.submodule) {
            submodules.push(`${familyId} → ${rec.submodule}`);
        }
    }

    return { created, submodules };
}

function _ensurePanelDOM() {
    if (_panelEl) return;

    // B2 migração 2026-05-29: .modal-overlay → .ecbt-overlay + .ecbt-dialog--sm canônicos.
    // Persist-toggle via style.display (era classList.active → trocado p/ inline).
    // Drena #3: width:min(420px,92vw) + padding/border-radius/box-shadow inline → tokens.
    // 4 XSS inline onclick removidos (close estático + 3 ações dinâmicas via delegation
    // na assess-panel__body que re-renderiza).
    _panelEl = document.createElement('div');
    _panelEl.className = 'ecbt-overlay';
    _panelEl.id = 'doc-assessment-review-panel';
    _panelEl.style.display = 'none';
    _panelEl.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--sm doc-assessment-dialog">
            <div class="ecbt-dialog-header">
                <strong class="ecbt-dialog-title">${t('docAssess.autoConfigTitle')}</strong>
                <button class="ecbt-dialog-close" data-doc-close title="Close">
                    <span style="font-size:18px;line-height:1;">&times;</span>
                </button>
            </div>
            <div class="ecbt-dialog-body assess-panel__body"></div>
        </div>
    `;
    document.body.appendChild(_panelEl);

    _panelEl.addEventListener('click', (e: any) => {
        if (e.target === _panelEl) closeDocAssessmentReview();
    });
    // Event delegation cobre estático (close X) + dinâmico (re-render body):
    // data-doc-close / data-doc-cancel / data-doc-apply / data-doc-add-family.
    _panelEl.addEventListener('click', (ev: any) => {
        const target = ev.target?.closest?.('[data-doc-close],[data-doc-cancel],[data-doc-apply],[data-doc-add-family]');
        if (!target) return;
        const w = window as any;
        if (target.hasAttribute('data-doc-close') || target.hasAttribute('data-doc-cancel')) w.handleCloseDocAssessmentReview?.();
        else if (target.hasAttribute('data-doc-apply')) w.handleApplyDocAssessmentConfig?.();
        else if (target.hasAttribute('data-doc-add-family')) w.handleDocAssessmentAddCustomFamily?.(target.getAttribute('data-doc-add-family') || '');
    });
}
