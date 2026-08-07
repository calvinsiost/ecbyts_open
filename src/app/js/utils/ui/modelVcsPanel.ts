// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Model VCS Panel (F3-wiring) for SPEC_MODEL_VCS_GIT (P1).
// Modal hand-authored R1-safe consuming F3 view-model (modelVcsViewModel.js).
// Reusa createModal factory (.ecbt-overlay + .ecbt-dialog--lg + AbortController).
// Sem reimplementar git-like logic (delega 100% a modelVcs + view-model).
//
// Spec NOT respeitados:
// - NÃO reimplementar commit/branch/merge logic (delega a modelVcs.js F1)
// - NÃO ler IDB direto (delega a modelVcsPersistence.js F2)
// - NÃO emoji em strings (HTML entities + classes badge)
// - NÃO criar novo modal system (createModal)

import { createModal } from './modal.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import {
    buildCommitListVM,
    buildBranchPickerVM,
    buildMergePlanVM,
    resolveCommitBadge,
} from '../../core/models/modelVcsViewModel.js';

/**
 * Renderiza lista de commits no body do painel.
 * @param {Array<*>} commits — output de modelVcs.log(repo, branch)
 * @returns {HTMLElement}
 */
function _renderCommitList(commits: any) {
    const wrap = document.createElement('div');
    wrap.className = 'mvcs-commit-list';
    let vm: any;
    try {
        vm = buildCommitListVM(commits, { now: Date.now() });
    } catch (e: any) {
        console.debug('[modelVcsPanel:commit-list]', e?.message || e);
        wrap.innerHTML = `<div class="mvcs-empty">${escapeHtml(t('modelVcs.empty.commits') || 'No commits yet')}</div>`;
        return wrap;
    }
    if (!vm.length) {
        wrap.innerHTML = `<div class="mvcs-empty">${escapeHtml(t('modelVcs.empty.commits') || 'No commits yet')}</div>`;
        return wrap;
    }
    wrap.innerHTML = vm
        .map((c: any) => {
            const badge = resolveCommitBadge(c.official);
            const tone = badge.tone || 'neutral';
            return `<div class="mvcs-commit-row" data-tone="${tone}" data-commit-id="${escapeHtml(c.id)}">
                <span class="mvcs-commit-badge" aria-label="${escapeHtml(t(badge.labelKey) || badge.labelKey)}">${badge.icon}</span>
                <span class="mvcs-commit-msg">${escapeHtml(c.message || '')}</span>
                <span class="mvcs-commit-meta">${escapeHtml(c.relativeTime || '')}</span>
            </div>`;
        })
        .join('');
    return wrap;
}

/**
 * Renderiza picker de branches.
 * @param {*} repo
 * @param {string} currentHead
 * @returns {HTMLElement}
 */
function _renderBranchPicker(repo: any, currentHead: any) {
    const wrap = document.createElement('div');
    wrap.className = 'mvcs-branch-picker';
    let vm: any;
    try {
        vm = buildBranchPickerVM(repo, currentHead);
    } catch (e: any) {
        console.debug('[modelVcsPanel:branch-picker]', e?.message || e);
        wrap.innerHTML = `<div class="mvcs-empty">${escapeHtml(t('modelVcs.empty.branches') || 'No branches')}</div>`;
        return wrap;
    }
    if (!vm.length) {
        wrap.innerHTML = `<div class="mvcs-empty">${escapeHtml(t('modelVcs.empty.branches') || 'No branches')}</div>`;
        return wrap;
    }
    wrap.innerHTML = vm
        .map((b: any) => {
            const cur = b.isCurrent ? ' aria-current="true"' : '';
            const cls = b.isCurrent ? 'mvcs-branch-row mvcs-branch-row--current' : 'mvcs-branch-row';
            return `<button type="button" class="${cls}" data-branch-name="${escapeHtml(b.name)}"${cur}>
                <span class="mvcs-branch-name">${escapeHtml(b.name)}</span>
                ${b.isCurrent ? `<span class="mvcs-branch-tag">${escapeHtml(t('modelVcs.branch.current') || 'current')}</span>` : ''}
            </button>`;
        })
        .join('');
    return wrap;
}

/**
 * Builds tab UI body — 2 tabs: Commits + Branches. Merge tab adicionado em iteração futura.
 * @param {*} repo
 * @param {string} currentHead
 * @returns {HTMLElement}
 */
function _buildBody(repo: any, currentHead: any) {
    const body = document.createElement('div');
    body.className = 'mvcs-body';
    const tabBar = document.createElement('div');
    tabBar.className = 'mvcs-tabs';
    tabBar.setAttribute('role', 'tablist');
    tabBar.innerHTML = `
        <button type="button" class="mvcs-tab mvcs-tab--active" role="tab" data-tab="commits" aria-selected="true">${escapeHtml(t('modelVcs.tab.commits') || 'Commits')}</button>
        <button type="button" class="mvcs-tab" role="tab" data-tab="branches" aria-selected="false">${escapeHtml(t('modelVcs.tab.branches') || 'Branches')}</button>
    `;
    body.appendChild(tabBar);
    const panel = document.createElement('div');
    panel.className = 'mvcs-tab-panel';
    panel.setAttribute('role', 'tabpanel');
    let commits = [];
    try {
        commits = require_log(repo, currentHead);
    } catch (e: any) {
        console.debug('[modelVcsPanel:log]', e?.message || e);
    }
    panel.appendChild(_renderCommitList(commits));
    body.appendChild(panel);
    tabBar.addEventListener('click', (e) => {
        const target = (e.target) as any;
        if (!target?.dataset?.tab) return;
        const tab = target.dataset.tab;
        tabBar.querySelectorAll('.mvcs-tab').forEach((btn: any) => {
            const isCur = (btn).dataset.tab === tab;
            btn.classList.toggle('mvcs-tab--active', isCur) as any;
            btn.setAttribute('aria-selected', String(isCur));
        });
        panel.innerHTML = '';
        if (tab === 'commits') panel.appendChild(_renderCommitList(commits));
        else if (tab === 'branches') panel.appendChild(_renderBranchPicker(repo, currentHead));
    });
    return body;
}

/**
 * Helper local — chama modelVcs.log() defensivo (não duplica logic).
 * @param {*} repo
 * @param {string} branch
 * @returns {Array<*>}
 */
function require_log(repo: any, branch: any) {
    if (!repo || typeof repo !== 'object') return [];
    // import dynamic dentro de função p/ evitar circular se VCS module em flux
     
    const mod = (globalThis as any).__ecbtModelVcsModule;
    if (mod && typeof mod.log === 'function') return mod.log(repo, branch) || [];
    return Array.isArray(repo?.commits) ? repo.commits : [];
}

/**
 * Abre painel Model VCS para um repo.
 * @param {{repo:*, currentHead?:string, onClose?:Function}} opts
 * @returns {{close:Function}}
 */
export function openModelVcsPanel(opts: any) {
    const repo = opts?.repo || null;
    const currentHead = opts?.currentHead || 'main';
    if (!repo) {
        console.warn('[modelVcsPanel] no repo provided') as any;
        return { close: () => {} };
    }
    const body = _buildBody(repo, currentHead);
    const modal = createModal({
        title: t('modelVcs.title') || 'Model Version Control',
        body,
        size: 'lg',
        extraClass: 'mvcs-modal',
        closeOnEsc: true,
        closeOnBackdropClick: true,
        onClose: opts?.onClose,
    });
    return { close: modal.close };
}

/**
 * Public buildPanelBody (sem abrir modal). Útil para embed em outros painéis.
 * @param {*} repo
 * @param {string} currentHead
 * @returns {HTMLElement}
 */
export function buildModelVcsPanelBody(repo: any, currentHead: any) {
    return _buildBody(repo, currentHead || 'main');
}

/**
 * Re-export buildMergePlanVM para teste F3-wiring (consumer pode usar diretamente).
 * Não duplica — só re-export ergonômico.
 */
export { buildMergePlanVM };
