// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   MERGE PANEL — UI for diff/merge conflict resolution
   Painel de interface para resolucao de conflitos diff/merge

   FUNCIONALIDADES:
   - Renderiza lista de conflitos com cards
   - Botoes Accept A / Accept B por conflito
   - Resumo de resolucao (X de Y resolvidos)
   - Secao de avisos de dependencia (edges orfaos)
   - Expansao de detalhes para diffs aninhados
   ================================================================ */
import { describePath, changeTypeLabel } from '../../core/diff/helpers.js';
import { t } from '../i18n/translations.js';
import { getIcon } from './icons.js';
import { escapeHtml, escapeJsAttr } from '../helpers/html.js';
import { isMergeFromWizard } from '../handlers/merge.js';
/**
 * Render the conflict list inside the merge modal.
 * Renderiza lista de conflitos no modal de merge.
 *
 * @param {any} diff - Structured diff from diffModels()
 * @param {any} decisions - Current decisions map (mutated by UI)
 * @param {Function} onDecisionChange - Callback when user makes a decision
 */
export function renderConflictList(diff: any, decisions: any, onDecisionChange: any) {
    const container = document.getElementById('merge-conflict-list');
    if (!container) return;
    container.innerHTML = '';
    if (diff.stats.total === 0) {
        container.innerHTML = `<div class="merge-no-conflicts">
            <span style="font-size:1.5rem">${getIcon('check', { size: '24px' })}</span>
            <p>${t('noConflicts') || 'Models are identical — no differences found.'}</p>
        </div>`;
        return;
    }
    // Summary bar
    const resolved = countResolved(diff, decisions);
    const summaryEl = document.createElement('div');
    summaryEl.className = 'merge-summary';
    summaryEl.id = 'merge-summary';
    summaryEl.innerHTML = `
        <span class="merge-stats">
            ${diff.stats.additions} ${t('additions') || 'additions'} &middot;
            ${diff.stats.removals} ${t('removals') || 'removals'} &middot;
            ${diff.stats.conflicts} ${t('conflicts') || 'conflicts'}
        </span>
        <span class="merge-progress">${resolved}/${diff.stats.total} ${t('resolved') || 'resolved'}</span>
    `;
    container.appendChild(summaryEl);
    // Dependency warnings
    if (diff.dependencies.length > 0) {
        const warningsEl = document.createElement('div');
        warningsEl.className = 'merge-warnings';
        warningsEl.innerHTML = `<div class="merge-warning-header">&#9888; ${t('orphanWarning') || 'Dependency Warnings'}</div>`;
        for (const dep of diff.dependencies) {
            const w = document.createElement('div');
            w.className = 'merge-warning-item';
            w.textContent = dep.message;
            warningsEl.appendChild(w);
        }
        container.appendChild(warningsEl);
    }
    // Render sections
    for (const [sectionName, section] of Object.entries(diff.sections)) {
        const cards = buildSectionCards(sectionName, section, decisions, onDecisionChange);
        if (cards.length === 0) continue;
        const sectionEl = document.createElement('div');
        sectionEl.className = 'merge-section';
        sectionEl.innerHTML = `<div class="merge-section-header">${sectionLabel(sectionName)} (${cards.length})</div>`;
        for (const card of cards) {
            sectionEl.appendChild(card);
        }
        container.appendChild(sectionEl);
    }
}
/**
 * Build conflict cards for a diff section.
 * Cria cards de conflito para uma secao do diff.
 */
function buildSectionCards(sectionName: any, section: any, decisions: any, onDecisionChange: any) {
    const cards: any[] = [];
    // Scalar changes (project, coordinate)
    if (section.changes) {
        for (const change of section.changes) {
            cards.push(createChangeCard(change, decisions, onDecisionChange));
        }
    }
    // Collection additions
    if (section.added) {
        for (const item of section.added) {
            const key = `${sectionName}.${item.id}._add`;
            cards.push(createCollectionCard(key, 'added', item, sectionName, decisions, onDecisionChange));
        }
    }
    // Collection removals
    if (section.removed) {
        for (const item of section.removed) {
            const key = `${sectionName}.${item.id}._remove`;
            cards.push(createCollectionCard(key, 'removed', item, sectionName, decisions, onDecisionChange));
        }
    }
    // Collection modifications
    if (section.modified) {
        for (const mod of section.modified) {
            for (const change of mod.changes || []) {
                cards.push(createChangeCard(change, decisions, onDecisionChange));
            }
        }
    }
    return cards;
}
/**
 * Create a card for a scalar value change.
 * Cria card para mudanca de valor escalar.
 */
function createChangeCard(change: any, decisions: any, _onDecisionChange: any) {
    const key = change.path.join('.');
    const currentDecision = decisions[key] || null;
    const typeClass = _resolveChangeTypeClass(change.type);
    const { aLabel, bLabel } = _resolveAcceptButtonLabels();
    const encodedKey = encodeURIComponent(`${escapeJsAttr(key)}`);
    const card = document.createElement('div');
    card.className = 'merge-card';
    card.dataset.key = key;
    if (currentDecision) {
        card.classList.add('merge-card-resolved');
    }
    card.innerHTML = `
        <div class="merge-card-header">
            <span class="merge-type-badge ${typeClass}">${changeTypeLabel(change.type)}</span>
            <span class="merge-card-path">${describePath(change.path)}</span>
        </div>
        <div class="merge-card-values">
            <div class="merge-value-a ${currentDecision === 'A' ? 'merge-value-selected' : ''}">
                <span class="merge-value-label">${t('inputA') || 'Input A'}:</span>
                <span class="merge-value-data">${formatValue(change.valueA)}</span>
            </div>
            <div class="merge-value-b ${currentDecision === 'B' ? 'merge-value-selected' : ''}">
                <span class="merge-value-label">${t('inputB') || 'Input B'}:</span>
                <span class="merge-value-data">${formatValue(change.valueB)}</span>
            </div>
        </div>
        <div class="merge-card-actions">
            <button class="btn btn-sm ${currentDecision === 'A' ? 'btn-primary' : 'btn-secondary'}"
                    data-cc-call-click="handleMergeAcceptA|s:${encodedKey}">
                ${aLabel}
            </button>
            <button class="btn btn-sm ${currentDecision === 'B' ? 'btn-primary' : 'btn-secondary'}"
                    data-cc-call-click="handleMergeAcceptB|s:${encodedKey}">
                ${bLabel}
            </button>
        </div>
    `;
    return card;
}

function _resolveChangeTypeClass(type: string): string {
    if (type === 'added') return 'merge-type-add';
    if (type === 'removed') return 'merge-type-remove';
    return 'merge-type-modify';
}

function _resolveAcceptButtonLabels(): { aLabel: string; bLabel: string } {
    if (isMergeFromWizard()) {
        return {
            aLabel: t('keepCurrent') || 'Keep Current',
            bLabel: t('acceptImported') || 'Accept Imported',
        };
    }
    return {
        aLabel: t('acceptA') || 'Accept A',
        bLabel: t('acceptB') || 'Accept B',
    };
}

/**
 * Create a card for a collection addition/removal.
 * Cria card para adicao/remocao em colecao.
 */
function createCollectionCard(key: any, type: any, item: any, sectionName: any, decisions: any, _onDecisionChange: any) {
    const currentDecision = decisions[key] || null;
    const { typeClass, label } = _resolveCollectionTypeInfo(type);
    const { aLabel, bLabel } = _resolveCollectionButtonLabels(type);
    const itemName = item.item?.name || item.item?.id || item.id;
    const encodedKey = encodeURIComponent(`${escapeJsAttr(key)}`);
    const card = document.createElement('div');
    card.className = 'merge-card';
    card.dataset.key = key;
    if (currentDecision) card.classList.add('merge-card-resolved');
    card.innerHTML = `
        <div class="merge-card-header">
            <span class="merge-type-badge ${typeClass}">${label}</span>
            <span class="merge-card-path">${sectionLabel(sectionName)} &gt; ${escapeHtml(itemName)}</span>
        </div>
        <div class="merge-card-values">
            <div class="merge-value-preview">
                <details>
                    <summary>${t('details') || 'Details'}</summary>
                    <pre>${escapeHtml(JSON.stringify(item.item, null, 2).substring(0, 500))}</pre>
                </details>
            </div>
        </div>
        <div class="merge-card-actions">
            <button class="btn btn-sm ${currentDecision === 'A' ? 'btn-primary' : 'btn-secondary'}"
                    data-cc-call-click="handleMergeAcceptA|s:${encodedKey}">
                ${aLabel}
            </button>
            <button class="btn btn-sm ${currentDecision === 'B' ? 'btn-primary' : 'btn-secondary'}"
                    data-cc-call-click="handleMergeAcceptB|s:${encodedKey}">
                ${bLabel}
            </button>
        </div>
    `;
    return card;
}

function _resolveCollectionTypeInfo(type: string): { typeClass: string; label: string } {
    if (type === 'added') {
        return { typeClass: 'merge-type-add', label: t('additions') || 'Added' };
    }
    return { typeClass: 'merge-type-remove', label: t('removals') || 'Removed' };
}

function _resolveCollectionButtonLabels(type: string): { aLabel: string; bLabel: string } {
    if (type === 'added') {
        return { aLabel: t('reject') || 'Reject', bLabel: t('accept') || 'Accept' };
    }
    return { aLabel: t('keep') || 'Keep', bLabel: t('remove') || 'Remove' };
}

/**
 * Update the summary bar after a decision.
 * Atualiza barra de resumo apos uma decisao.
 */
export function updateMergeSummary(diff: any, decisions: any) {
    const summaryEl = document.getElementById('merge-summary');
    if (!summaryEl) return;
    const resolved = countResolved(diff, decisions);
    const progressEl = summaryEl.querySelector('.merge-progress');
    if (progressEl) {
        progressEl.textContent = `${resolved}/${diff.stats.total} ${t('resolved') || 'resolved'}`;
    }
}
/**
 * Highlight a resolved card.
 * Destaca card resolvido.
 */
export function updateCardState(key: any, decision: any) {
    const card = document.querySelector(`.merge-card[data-key="${CSS.escape(key)}"]`);
    if (!card) return;
    card.classList.add('merge-card-resolved');
    const valueA = card.querySelector('.merge-value-a');
    const valueB = card.querySelector('.merge-value-b');
    if (valueA) valueA.classList.toggle('merge-value-selected', decision === 'A');
    if (valueB) valueB.classList.toggle('merge-value-selected', decision === 'B');
    const buttons = card.querySelectorAll('.merge-card-actions .btn');
    const first = buttons.item(0);
    const second = buttons.item(1);
    if (first) {
        first.className = `btn btn-sm ${decision === 'A' ? 'btn-primary' : 'btn-secondary'}`;
    }
    if (second) {
        second.className = `btn btn-sm ${decision === 'B' ? 'btn-primary' : 'btn-secondary'}`;
    }
}
// ----------------------------------------------------------------
// STYLES
// ----------------------------------------------------------------
/**
 * Inject merge panel CSS.
 * Injeta CSS do painel de merge.
 */
export function injectMergeStyles() {
    if (document.getElementById('merge-styles')) return;
    const style = document.createElement('style');
    style.id = 'merge-styles';
    style.textContent = `
        .merge-no-conflicts { text-align: center; padding: 2rem; color: var(--text-secondary); }
        .merge-summary {
            display: flex; justify-content: space-between; align-items: center;
            padding: 0.5rem 0.75rem; background: var(--bg-tertiary, #f0f0f0);
            border-radius: 4px; margin-bottom: 0.75rem; font-size: 0.85rem;
        }
        .merge-progress { font-weight: 600; color: var(--accent, #3b6bff); }
        .merge-warnings {
            border: 1px solid var(--warning-300, #f0ad4e); border-radius: 4px;
            margin-bottom: 0.75rem; overflow: hidden;
        }
        .merge-warning-header {
            background: var(--merge-warning-bg, #fcf8e3); padding: 0.4rem 0.75rem;
            font-weight: 600; font-size: 0.85rem; color: var(--merge-warning-fg, #8a6d3b);
        }
        .merge-warning-item { padding: 0.3rem 0.75rem; font-size: 0.8rem; color: var(--merge-warning-fg, #8a6d3b); }
        .merge-section { margin-bottom: 1rem; }
        .merge-section-header {
            font-weight: 600; font-size: 0.9rem; margin-bottom: 0.4rem;
            padding-bottom: 0.2rem; border-bottom: 1px solid var(--border-color, #ddd);
        }
        .merge-card {
            border: 1px solid var(--border-color, #ddd); border-radius: 4px;
            margin-bottom: 0.5rem; overflow: hidden; transition: border-color 0.2s;
        }
        .merge-card-resolved { border-color: var(--accent, #3b6bff); }
        .merge-card-header {
            display: flex; align-items: center; gap: 0.5rem;
            padding: 0.4rem 0.75rem; background: var(--bg-secondary, #f8f8f8);
        }
        .merge-card-path { font-size: 0.8rem; color: var(--text-secondary); }
        .merge-type-badge {
            font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 3px;
            font-weight: 600; text-transform: uppercase;
        }
        .merge-type-add { background: var(--merge-add-bg, #dff0d8); color: var(--merge-add-fg, #3c763d); }
        .merge-type-remove { background: var(--merge-remove-bg, #f2dede); color: var(--merge-remove-fg, #a94442); }
        .merge-type-modify { background: var(--merge-modify-bg, #d9edf7); color: var(--merge-modify-fg, #31708f); }
        .merge-card-values { padding: 0.4rem 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .merge-value-a, .merge-value-b {
            flex: 1; min-width: 120px; padding: 0.3rem 0.5rem;
            border-radius: 3px; font-size: 0.8rem; border: 2px solid transparent;
        }
        .merge-value-a { background: var(--merge-value-a-bg, #eef3ff); }
        .merge-value-b { background: var(--merge-value-b-bg, #fff5ee); }
        .merge-value-selected { border-color: var(--accent, #3b6bff); font-weight: 600; }
        .merge-value-label { font-weight: 600; margin-right: 0.3rem; }
        .merge-value-data { word-break: break-all; }
        .merge-value-preview { width: 100%; }
        .merge-value-preview details { font-size: 0.8rem; }
        .merge-value-preview pre {
            max-height: 150px; overflow: auto; font-size: 0.75rem;
            background: var(--bg-tertiary, #f5f5f5); padding: 0.5rem; border-radius: 3px;
        }
        .merge-card-actions {
            display: flex; gap: 0.3rem; padding: 0.3rem 0.75rem 0.4rem;
            justify-content: flex-end;
        }
        .btn-sm { padding: 0.2rem 0.6rem; font-size: 0.75rem; }
        .merge-status { font-size: 0.8rem; margin-top: 0.3rem; display: flex; align-items: center; gap: 0.3rem; }
        .merge-status-ok { color: var(--success-600, #3c763d); }
        .merge-status-error { color: var(--error-600, #a94442); }
    `;
    document.head.appendChild(style);
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * @param {any} diff
 * @param {any} decisions
 */
function countResolved(diff: any, decisions: any) {
    let count = 0;
    for (const key of Object.keys(decisions)) {
        if (decisions[key] != null) count++;
    }
    return Math.min(count, diff.stats.total);
}
/**
 * @param {any} value
 */
function formatValue(value: any) {
    if (value === undefined) return '<em>undefined</em>';
    if (value === null) return '<em>null</em>';
    if (typeof value === 'object') {
        const json = JSON.stringify(value);
        return escapeHtml(json.length > 80 ? json.substring(0, 77) + '...' : json);
    }
    return escapeHtml(String(value));
}
/**
 * @param {any} name
 */
function sectionLabel(name: any) {
    const labels: Record<string, string> = {
        project: 'Project',
        coordinate: 'Coordinates',
        families: 'Families',
        elements: 'Elements',
        edges: 'Edges',
        campaigns: 'Campaigns',
        scenes: 'Scenes',
        contracts: 'Contracts',
        wbs: 'WBS',
    };
    return labels[name] || name;
}
