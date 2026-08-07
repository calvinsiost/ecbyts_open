// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Completeness Applicability Toggle (F3-wiring slice 2) for
// SPEC_EIS_COMPLETENESS_BASELINE. Modal UI permitindo usuário marcar
// requirements como N/A (não-aplicável) para contexto específico.
//
// Spec NOT:
// - NÃO reimplementar applicability logic (delega toggleRequirementApplicability)
// - NÃO emoji em strings
// - NÃO criar novo modal system (createModal)

import { createModal } from './modal.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import {
    toggleRequirementApplicability,
    buildApplicabilitySummary,
} from '../../core/eis/completenessPanelViewModel.js';

/**
 * Renderiza summary header (counts applicable/na).
 * @param {object} summary
 * @returns {string} HTML
 */
function _renderSummary(summary: any) {
    const applicable = summary?.applicableCount ?? 0;
    const na = summary?.naCount ?? 0;
    return `<div class="cat-summary">
        <span class="cat-count" data-tone="success">${escapeHtml(String(applicable))} ${escapeHtml(t('eis.applicability.applicable') || 'aplicáveis')}</span>
        ${na > 0 ? `<span class="cat-count" data-tone="muted">${escapeHtml(String(na))} ${escapeHtml(t('eis.applicability.na') || 'N/A')}</span>` : ''}
    </div>`;
}

/**
 * Renderiza lista de requirements com toggle button.
 * @param {Array<*>} requirements
 * @param {object} config
 * @returns {string} HTML
 */
function _renderRequirementsList(requirements: any[], config: Record<string, any>) {
    if (!Array.isArray(requirements) || !requirements.length) {
        return `<div class="cat-empty">${escapeHtml(t('eis.applicability.empty') || 'Sem requirements definidos')}</div>`;
    }
    return `<ul class="cat-list">${requirements
        .map((req) => {
            const reqId = req?.id || '';
            const isApplicable = config?.[reqId]?.applicable !== false;
            const cls = isApplicable
                ? 'cat-item cat-item--applicable'
                : 'cat-item cat-item--na';
            const toggleLabel = isApplicable
                ? (t('eis.applicability.markNa') || 'Marcar N/A')
                : (t('eis.applicability.markApplicable') || 'Marcar aplicável');
            return `<li class="${cls}" data-req-id="${escapeHtml(reqId)}">
                <span class="cat-req-id">${escapeHtml(reqId)}</span>
                <button type="button" class="cat-toggle-btn" data-action="toggle-applicability" data-req-id="${escapeHtml(reqId)}" aria-pressed="${!isApplicable}">
                    ${escapeHtml(toggleLabel)}
                </button>
            </li>`;
        })
        .join('')}</ul>`;
}

/**
 * Builds body — summary + list.
 * @param {{requirements:Array<*>, applicabilityConfig:object}} input
 * @returns {HTMLElement}
 */
function _buildBody(input: any) {
    const body = document.createElement('div');
    body.className = 'cat-body';
    const requirements = Array.isArray(input?.requirements) ? input.requirements : [];
    let config = input?.applicabilityConfig || {};
    const renderAll = () => {
        let summary;
        try {
            summary = buildApplicabilitySummary(config) || {};
        } catch (e: any) {
            console.debug('[completenessApplicabilityToggle:summary]', e?.message || e);
            summary = {};
        }
        body.innerHTML = `
            ${_renderSummary(summary)}
            ${_renderRequirementsList(requirements, config)}
        `;
        body.querySelectorAll('[data-action="toggle-applicability"]').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                const target = (ev.target as Element | null)?.closest('[data-req-id]') as HTMLElement | null;
                const reqId = target?.dataset?.reqId;
                if (!reqId) return;
                const current = config?.[reqId]?.applicable !== false;
                try {
                    config = toggleRequirementApplicability(config, reqId, !current);
                } catch (e: any) {
                    console.debug('[completenessApplicabilityToggle:toggle]', e?.message || e);
                    return;
                }
                input.onChange?.(config);
                renderAll();
            });
        });
    };
    renderAll();
    return body;
}

/**
 * Abre painel applicability toggle.
 * @param {{requirements:Array<*>, applicabilityConfig:object, onChange?:Function, onClose?:Function}} opts
 * @returns {{close:Function}}
 */
export function openCompletenessApplicabilityToggle(opts: any) {
    if (!opts?.requirements?.length) {
        console.warn('[completenessApplicabilityToggle] no requirements');
        return { close: () => {} };
    }
    const body = _buildBody(opts);
    const handle = createModal({
        title: t('eis.applicability.title') || 'Configurar Aplicabilidade',
        body,
        size: 'md',
        extraClass: 'cat-modal',
        closeOnEsc: true,
        closeOnBackdropClick: true,
        onClose: opts.onClose,
    });
    return { close: handle.close };
}

/**
 * Public buildBody (sem abrir modal).
 * @param {object} input
 * @returns {HTMLElement}
 */
export function buildCompletenessApplicabilityToggleBody(input: any) {
    return _buildBody(input || { requirements: [], applicabilityConfig: {} });
}
