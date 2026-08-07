// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Completeness Panel (F3-wiring) for SPEC_EIS_COMPLETENESS_BASELINE (P1).
// Hand-authored R1-safe consumindo F3 view-model (completenessPanelViewModel.js).
// Reusa createModal factory (.ecbt-overlay + .ecbt-dialog--md + AbortController).
// Sem reimplementar baseline scoring (delega 100% a completenessBaseline F1).
//
// Spec NOT respeitados:
// - NÃO reimplementar scanModelPresence/evaluateConsistency/computeCompletenessBaseline
// - NÃO emoji em strings (HTML entities + classes badge)
// - NÃO criar novo modal system (createModal)

import { createModal } from './modal.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import {
    buildCompletenessPanelVM,
    resolveStatusBadge,
    getCriticalGapBadges,
} from '../../core/eis/completenessPanelViewModel.js';

/**
 * Renderiza summary header com completenessPct + counts.
 * @param {*} summary
 * @returns {HTMLElement}
 */
function _renderSummary(summary: any) {
    const el = document.createElement('div');
    el.className = 'cp-summary';
    const pct = (summary?.completenessPct ?? 0).toFixed(1);
    const sat = summary?.applicableSatisfied ?? 0;
    const tot = summary?.applicableTotal ?? 0;
    const naCount = summary?.naExcludedTotal ?? 0;
    const critCount = summary?.criticalGapCount ?? 0;
    el.innerHTML = `
        <div class="cp-summary-pct" data-tone="${critCount > 0 ? 'warn' : 'success'}">
            <strong>${escapeHtml(pct)}%</strong>
            <span>${escapeHtml(t('eis.completeness.summary.title') || 'Completude')}</span>
        </div>
        <div class="cp-summary-counts">
            <span class="cp-count">${escapeHtml(`${sat}/${tot}`)} ${escapeHtml(t('eis.completeness.summary.satisfied') || 'satisfeitos')}</span>
            ${naCount > 0 ? `<span class="cp-count cp-count--na">${escapeHtml(String(naCount))} ${escapeHtml(t('eis.completeness.summary.na') || 'N/A')}</span>` : ''}
            ${critCount > 0 ? `<span class="cp-count cp-count--crit">${escapeHtml(String(critCount))} ${escapeHtml(t('eis.completeness.summary.critical') || 'gaps críticos')}</span>` : ''}
        </div>
    `;
    return el;
}

/**
 * Renderiza lista de requirements com badge tone.
 * @param {Array<*>} entries
 * @returns {HTMLElement}
 */
function _renderEntries(entries: any) {
    const list = document.createElement('div');
    list.className = 'cp-entries';
    if (!entries || !entries.length) {
        list.innerHTML = `<div class="cp-empty">${escapeHtml(t('eis.completeness.empty') || 'Sem requisitos definidos')}</div>`;
        return list;
    }
    list.innerHTML = entries
        .map((e: any) => {
            const badge = e.badge || resolveStatusBadge(e.status, e.isCritical);
            const tone = badge.tone || 'neutral';
            const label = t(badge.labelKey) || e.status;
            return `<div class="cp-entry" data-tone="${tone}" data-id="${escapeHtml(e.id)}">
                <span class="cp-entry-icon" aria-label="${escapeHtml(label)}">${badge.icon}</span>
                <span class="cp-entry-id">${escapeHtml(e.id)}</span>
                <span class="cp-entry-status">${escapeHtml(label)}</span>
            </div>`;
        })
        .join('');
    return list;
}

/**
 * Renderiza critical gaps section.
 * @param {Array<*>} criticalGaps
 * @returns {HTMLElement}
 */
function _renderCriticalGaps(criticalGaps: any) {
    const el = document.createElement('div');
    el.className = 'cp-critical';
    if (!criticalGaps || !criticalGaps.length) {
        return el;
    }
    el.innerHTML = `
        <h4 class="cp-critical-title">${escapeHtml(t('eis.completeness.critical.title') || 'Gaps críticos')}</h4>
        <ul class="cp-critical-list">
            ${criticalGaps
                .map((g: any) => `<li class="cp-critical-item">
                <strong>${escapeHtml(g.requirement || '')}</strong>
                <span>${escapeHtml(g.reason || '')}</span>
            </li>`,
                )
                .join('')}
        </ul>
    `;
    return el;
}

/**
 * Builds modal body — summary + entries + critical gaps.
 * @param {*} baseline — output de computeCompletenessBaseline
 * @returns {HTMLElement}
 */
function _buildBody(baseline: any) {
    const body = document.createElement('div');
    body.className = 'cp-body';
    let vm;
    try {
        vm = buildCompletenessPanelVM(baseline);
    } catch (e: any) {
        console.debug('[completenessPanel:vm]', e?.message || e);
        body.innerHTML = `<div class="cp-empty">${escapeHtml(t('eis.completeness.error') || 'Erro ao construir painel')}</div>`;
        return body;
    }
    body.appendChild(_renderSummary(vm.summary));
    body.appendChild(_renderEntries(vm.entries));
    const critBadges = getCriticalGapBadges(baseline);
    if (critBadges && critBadges.length) {
        body.appendChild(_renderCriticalGaps(vm.criticalGaps));
    }
    return body;
}

/**
 * Abre painel Completeness Baseline para um baseline computado.
 * Caller deve passar baseline pré-computado (vinda de computeCompletenessBaseline).
 *
 * @param {{baseline:*, onClose?:Function}} opts
 * @returns {{close:Function}}
 */
export function openCompletenessPanel(opts: any) {
    const baseline = opts?.baseline || null;
    if (!baseline) {
        console.warn('[completenessPanel] no baseline provided');
        return { close: () => {} };
    }
    const body = _buildBody(baseline);
    const modal = createModal({
        title: t('eis.completeness.title') || 'EIS Completude',
        body,
        size: 'md',
        extraClass: 'cp-modal',
        closeOnEsc: true,
        closeOnBackdropClick: true,
        onClose: opts?.onClose,
    });
    return { close: modal.close };
}

/**
 * Public buildPanelBody (sem abrir modal). Para embed em outro modal.
 * @param {*} baseline
 * @returns {HTMLElement}
 */
export function buildCompletenessPanelBody(baseline: any) {
    return _buildBody(baseline);
}
