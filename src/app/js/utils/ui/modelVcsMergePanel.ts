// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Model VCS Merge Panel (F3-wiring slice 2) for SPEC_MODEL_VCS_GIT.
// Hand-authored R1-safe consumindo buildMergePlanVM (F3-helper existente).
// NEW separate file — modelVcsPanel.js virou R1-blocked (twin TS), então
// merge tab vai como módulo paralelo que claude-executor pode wire depois.
//
// Spec NOT respeitados:
// - NÃO reimplementar merge logic (delega buildMergePlanVM)
// - NÃO emoji em strings
// - NÃO criar novo modal system (createModal)

import { createModal } from './modal.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { buildMergePlanVM } from '../../core/models/modelVcsViewModel.js';

/**
 * Renderiza merge plan: source → target + requiresReview hint.
 * @param {*} mergePlan
 * @returns {string} HTML
 */
function _renderMergePlan(mergePlan: any): string {
    if (!mergePlan) {
        return `<div class="mvm-empty">${escapeHtml(t('modelVcs.merge.empty') || 'Selecione branches para merge')}</div>`;
    }
    const source = escapeHtml(mergePlan.sourceBranch || '');
    const target = escapeHtml(mergePlan.targetBranch || '');
    const reqReview = mergePlan.requiresReview === true;
    const reviewHint = reqReview
        ? `<div class="mvm-review-required" role="alert">${escapeHtml(t('modelVcs.merge.reviewRequired') || 'Review obrigatório (merge em main)')}</div>`
        : '';
    return `<div class="mvm-plan">
        <div class="mvm-branches">
            <span class="mvm-branch mvm-branch--source">${source}</span>
            <span class="mvm-arrow" aria-hidden="true">&rarr;</span>
            <span class="mvm-branch mvm-branch--target">${target}</span>
        </div>
        ${reviewHint}
    </div>`;
}

/**
 * Renderiza branch picker para source + target (2 selects).
 * @param {Array<*>} branchVm
 * @param {string} sourceSelected
 * @param {string} targetSelected
 * @returns {string} HTML
 */
function _renderBranchSelectors(branchVm: any[], sourceSelected: string, targetSelected: string): string {
    const options = (selected: string): string =>
        (branchVm || [])
            .map((b: any) => {
                const sel = b.name === selected ? ' selected' : '';
                return `<option value="${escapeHtml(b.name)}"${sel}>${escapeHtml(b.name)}</option>`;
            })
            .join('');
    return `<div class="mvm-selectors">
        <label class="mvm-label">${escapeHtml(t('modelVcs.merge.from') || 'De:')}
            <select class="mvm-select" data-role="source">${options(sourceSelected)}</select>
        </label>
        <label class="mvm-label">${escapeHtml(t('modelVcs.merge.into') || 'Para:')}
            <select class="mvm-select" data-role="target">${options(targetSelected)}</select>
        </label>
    </div>`;
}

/**
 * Builds body do merge panel.
 * @param {{branches:Array<*>, defaultSource?:string, defaultTarget?:string}} input
 * @returns {HTMLElement}
 */
function _buildBody(input: { branches: any[]; defaultSource?: string; defaultTarget?: string }): HTMLElement {
    const body = document.createElement('div');
    body.className = 'mvm-body';
    const branches = Array.isArray(input?.branches) ? input.branches : [];
    let sourceBranch = input?.defaultSource || (branches[0]?.name || '');
    let targetBranch = input?.defaultTarget || 'main';
    let mergePlan;
    try {
        mergePlan = buildMergePlanVM({ sourceBranch, targetBranch });
    } catch (e: any) {
        console.debug('[modelVcsMergePanel:plan]', e?.message || e);
        mergePlan = null;
    }
    body.innerHTML = `
        ${_renderBranchSelectors(branches, sourceBranch, targetBranch)}
        ${_renderMergePlan(mergePlan)}
    `;
    const rerender = () => {
        try {
            mergePlan = buildMergePlanVM({ sourceBranch, targetBranch });
        } catch (e: any) {
            console.debug('[modelVcsMergePanel:rebuild]', e?.message || e);
            mergePlan = null;
        }
        const planEl = body.querySelector('.mvm-plan, .mvm-empty');
        if (planEl) planEl.outerHTML = _renderMergePlan(mergePlan);
    };
    body.querySelectorAll('.mvm-select').forEach((sel: any) => {
        sel.addEventListener('change', (ev: Event) => {
            const target = (ev.target) as any;
            if (target.dataset?.role === 'source') sourceBranch = target.value;
            else if (target.dataset?.role === 'target') targetBranch = target.value;
            rerender();
        });
    });
    return body;
}

/**
 * Abre painel Merge Plan para um repo.
 * @param {{branches:Array<*>, defaultSource?:string, defaultTarget?:string, onClose?:Function}} opts
 * @returns {{close:Function}}
 */
export function openModelVcsMergePanel(opts: {
    branches: any[];
    defaultSource?: string;
    defaultTarget?: string;
    onClose?: () => void;
}): { close: () => void } {
    const branches = opts?.branches || [];
    if (!branches.length) {
        console.warn('[modelVcsMergePanel] no branches provided');
        return { close: () => {} };
    }
    const bodyInput: any = { branches };
    if (opts.defaultSource !== undefined) bodyInput.defaultSource = opts.defaultSource;
    if (opts.defaultTarget !== undefined) bodyInput.defaultTarget = opts.defaultTarget;
    const body = _buildBody(bodyInput);
    const modalOptions: any = {
        title: t('modelVcs.merge.title') || 'Model Merge Plan',
        body,
        size: 'sm',
        extraClass: 'mvm-modal',
        closeOnEsc: true,
        closeOnBackdropClick: true,
    };
    if (opts.onClose !== undefined) modalOptions.onClose = opts.onClose;
    const handle = createModal(modalOptions);
    return { close: handle.close };
}

/**
 * Public buildMergePanelBody (sem abrir modal). Útil para embed em tab existente.
 * @param {{branches:Array<*>, defaultSource?:string, defaultTarget?:string}} input
 * @returns {HTMLElement}
 */
export function buildModelVcsMergePanelBody(input: {
    branches: any[];
    defaultSource?: string;
    defaultTarget?: string;
}): HTMLElement {
    return _buildBody(input || { branches: [] });
}
