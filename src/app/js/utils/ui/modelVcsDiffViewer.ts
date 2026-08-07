// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Model VCS Diff Viewer (F3-wiring slice 3) for SPEC_MODEL_VCS_GIT.
// Hand-authored R1-safe consumindo diffCommits (F1-helper modelVcs.js).
// Modal UI showing changed/added/removed properties between 2 commits.
//
// Spec NOT:
// - NÃO reimplementar diff logic (delega diffCommits)
// - NÃO emoji em strings
// - NÃO criar novo modal system (createModal)

import { createModal } from './modal.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { diffCommits } from '../../core/models/modelVcs.js';

type DiffLike = { added?: any[]; removed?: any[]; changed?: any[] };
type DiffViewerInput = { repo?: any; commitIdA?: string; commitIdB?: string; onClose?: (() => void) | undefined };

/**
 * Classifica change type para CSS data-tone.
 * @param {string} kind
 * @returns {string}
 */
function _toneOf(kind: any) {
    if (kind === 'added') return 'success';
    if (kind === 'removed') return 'danger';
    if (kind === 'changed') return 'warn';
    return 'neutral';
}

/**
 * Renderiza header com commit refs + summary counts.
 * @param {string} idA
 * @param {string} idB
 * @param {object} diff
 * @returns {string} HTML
 */
function _renderHeader(idA: any, idB: any, diff: DiffLike) {
    const added = (diff?.added || []).length;
    const removed = (diff?.removed || []).length;
    const changed = (diff?.changed || []).length;
    return `<div class="mvd-header">
        <div class="mvd-commits">
            <span class="mvd-commit mvd-commit--a" data-id="${escapeHtml(idA)}">${escapeHtml(idA.slice(0, 8))}</span>
            <span class="mvd-arrow" aria-hidden="true">&rarr;</span>
            <span class="mvd-commit mvd-commit--b" data-id="${escapeHtml(idB)}">${escapeHtml(idB.slice(0, 8))}</span>
        </div>
        <div class="mvd-counts">
            <span class="mvd-count" data-tone="success">+${escapeHtml(String(added))}</span>
            <span class="mvd-count" data-tone="danger">-${escapeHtml(String(removed))}</span>
            <span class="mvd-count" data-tone="warn">~${escapeHtml(String(changed))}</span>
        </div>
    </div>`;
}

/**
 * Renderiza lista de mudanças por category (added/removed/changed).
 * @param {string} category
 * @param {Array<*>} entries
 * @param {string} kind
 * @returns {string} HTML
 */
function _renderCategory(category: any, entries: any[], kind: any) {
    if (!entries || !entries.length) return '';
    const tone = _toneOf(kind);
    const titleKey = `modelVcs.diff.${kind}`;
    const title = t(titleKey) || category;
    return `<details class="mvd-category" data-tone="${tone}" open>
        <summary class="mvd-category-title">${escapeHtml(title)} (${entries.length})</summary>
        <ul class="mvd-entries">
            ${entries
                .map((e: any) => {
                    const pathStr =
                        typeof e?.path === 'string' ? e.path : Array.isArray(e?.path) ? e.path.join('.') : '';
                    const valueA = e?.before !== undefined ? JSON.stringify(e.before) : '';
                    const valueB = e?.after !== undefined ? JSON.stringify(e.after) : '';
                    const meta =
                        kind === 'changed'
                            ? `<span class="mvd-meta">${escapeHtml(valueA)} → ${escapeHtml(valueB)}</span>`
                            : '';
                    return `<li class="mvd-entry">
                <code class="mvd-path">${escapeHtml(pathStr || JSON.stringify(e))}</code>
                ${meta}
            </li>`;
                })
                .join('')}
        </ul>
    </details>`;
}

/**
 * Builds modal body — header + 3 categories (added/removed/changed).
 * @param {object} input
 * @returns {HTMLElement}
 */
function _buildBody(input: DiffViewerInput) {
    const body = document.createElement('div');
    body.className = 'mvd-body';
    const idA = input?.commitIdA || '';
    const idB = input?.commitIdB || '';
    let diff: DiffLike;
    try {
        diff = (diffCommits(input.repo, idA, idB) as any) || { added: [], removed: [], changed: [] };
    } catch (e: any) {
        console.debug('[modelVcsDiffViewer:diff]', e?.message || e);
        body.innerHTML = `<div class="mvd-error">${escapeHtml(t('modelVcs.diff.error') || 'Falha ao calcular diff')}</div>`;
        return body;
    }
    body.innerHTML = `
        ${_renderHeader(idA, idB, diff)}
        ${_renderCategory('added', diff.added || [], 'added')}
        ${_renderCategory('removed', diff.removed || [], 'removed')}
        ${_renderCategory('changed', diff.changed || [], 'changed')}
        ${
            (diff.added?.length || 0) + (diff.removed?.length || 0) + (diff.changed?.length || 0) === 0
                ? `<div class="mvd-empty">${escapeHtml(t('modelVcs.diff.empty') || 'Sem diferenças')}</div>`
                : ''
        }
    `;
    return body;
}

/**
 * Abre painel Diff entre 2 commits.
 * @param {{repo:*, commitIdA:string, commitIdB:string, onClose?:Function}} opts
 * @returns {{close:Function}}
 */
export function openModelVcsDiffViewer(opts: DiffViewerInput) {
    if (!opts?.repo || !opts?.commitIdA || !opts?.commitIdB) {
        console.warn('[modelVcsDiffViewer] missing repo/commitIdA/commitIdB');
        return { close: () => {} };
    }
    const body = _buildBody(opts);
    const modalOptions: any = {
        title: t('modelVcs.diff.title') || 'Model Diff',
        body,
        size: 'lg',
        extraClass: 'mvd-modal',
        closeOnEsc: true,
        closeOnBackdropClick: true,
    };
    if (opts.onClose) {
        modalOptions.onClose = opts.onClose;
    }
    const handle = createModal(modalOptions);
    return { close: handle.close };
}

/**
 * Public buildDiffViewerBody (sem abrir modal).
 * @param {object} input
 * @returns {HTMLElement}
 */
export function buildModelVcsDiffViewerBody(input: DiffViewerInput) {
    return _buildBody(input || {});
}
