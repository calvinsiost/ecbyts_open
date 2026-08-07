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
   REPORT TOC — Table of Contents auto-gerada
   Parseia headings (h1-h3) do editor e monta sidebar navegavel

   MutationObserver detecta alteracoes no conteudo e atualiza TOC.
   IntersectionObserver destaca secao ativa ao scrollar.
   ================================================================ */

import { t } from '../i18n/translations.js';
import { getIcon } from '../ui/icons.js';

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

/** @type {MutationObserver|null} */ let mutationObs: any = null;
/** @type {IntersectionObserver|null} */ let sectionObs: any = null;
/** @type {any} */ let currentEditor: any = null;
/** @type {any} */ let updateTimer: any = null;

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Update the TOC sidebar from the editor headings.
 * Parseia h1-h3 do editor e renderiza lista navegavel.
 *
 * @param {HTMLElement} tocContainer - .report-toc element
 * @param {HTMLElement} editorEl - .report-editor-content element
 */
export function updateToc(tocContainer: any, editorEl: any) {
    if (!tocContainer || !editorEl) return;
    currentEditor = editorEl;

    const headings = _parseHeadings(editorEl);
    _renderToc(tocContainer, headings, editorEl);
    _observeMutations(editorEl, tocContainer);
    _observeSections(headings, editorEl, tocContainer);
}

/**
 * Get headings list for PDF TOC generation.
 * @param {HTMLElement} editorEl
 * @returns {Array<{text: string, level: number}>}
 */
export function getHeadings(editorEl: any): Array<{text: string, level: number}> {
    return _parseHeadings(editorEl || currentEditor);
}

/**
 * Cleanup observers.
 */
export function destroyToc() {
    if (mutationObs) {
        mutationObs.disconnect();
        mutationObs = null;
    }
    if (sectionObs) {
        sectionObs.disconnect();
        sectionObs = null;
    }
    clearTimeout(updateTimer);
}

// ----------------------------------------------------------------
// HEADING PARSER
// ----------------------------------------------------------------

/**
 * @private
 * @param {any} editorEl
 */
function _parseHeadings(editorEl: any) {
    if (!editorEl) return [];
    const nodes = editorEl.querySelectorAll('h1, h2, h3');
    /** @type {any[]} */
    const headings: any = [];
    nodes.forEach((/** @type {any} */ node: any, /** @type {number} */ i: any) => {
        const level = parseInt(node.tagName[1]);
        const text = node.textContent.trim();
        if (text) {
            // Garante id unico para scroll-to
            if (!node.id) node.id = `report-heading-${i}`;
            headings.push({ text, level, id: node.id, el: node });
        }
    });
    return headings;
}

// ----------------------------------------------------------------
// TOC RENDERER
// ----------------------------------------------------------------

/**
 * @private
 * @param {any} container
 * @param {any[]} headings
 * @param {any} editorEl
 */
function _renderToc(container: any, headings: any, editorEl: any) {
    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'report-toc-header';

    const title = document.createElement('span');
    title.className = 'report-toc-title';
    title.textContent = t('reportTOC') || 'Sumario';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'report-toc-toggle';
    toggleBtn.innerHTML = getIcon('chevron-left', { size: '12px' });
    toggleBtn.title = t('reportClose') || 'Fechar';
    toggleBtn.addEventListener('click', () => {
        container.classList.add('collapsed');
        // Sync button in overlay header
        const tocBtn = document.getElementById('report-toc-btn');
        if (tocBtn) tocBtn.classList.remove('active');
    });

    header.appendChild(title);
    header.appendChild(toggleBtn);
    container.appendChild(header);

    // Items
    if (headings.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:12px;color:var(--bottom-text-faint);font-size:11px;font-style:italic;';
        empty.textContent = t('reportTOCEmpty') || 'Nenhum titulo encontrado';
        container.appendChild(empty);
        return;
    }

    headings.forEach((/** @type {any} */ h: any) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'report-toc-item';
        item.setAttribute('data-level', h.level);
        item.setAttribute('data-heading-id', h.id);
        item.textContent = h.text;
        item.addEventListener('click', () => {
            const target = editorEl.querySelector(`#${h.id}`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
        container.appendChild(item);
    });
}

// ----------------------------------------------------------------
// MUTATION OBSERVER - Auto-update ao editar conteudo
// ----------------------------------------------------------------

/**
 * @private
 * @param {any} editorEl
 * @param {any} tocContainer
 */
function _observeMutations(editorEl: any, tocContainer: any) {
    if (mutationObs) mutationObs.disconnect();

    mutationObs = new MutationObserver(() => {
        // Debounce 800ms - nao reparseiar a cada tecla
        clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
            const headings = _parseHeadings(editorEl);
            _renderToc(tocContainer, headings, editorEl);
            _observeSections(headings, editorEl, tocContainer);
        }, 800);
    });

    mutationObs.observe(editorEl, {
        childList: true,
        subtree: true,
        characterData: false, // Nao observar cada char, apenas mudancas de DOM
    });
}

// ----------------------------------------------------------------
// SECTION OBSERVER - Highlight secao ativa ao scrollar
// ----------------------------------------------------------------

/**
 * @private
 * @param {any[]} headings
 * @param {any} editorEl
 * @param {any} tocContainer
 */
function _observeSections(headings: any, editorEl: any, tocContainer: any) {
    if (sectionObs) sectionObs.disconnect();
    if (headings.length === 0) return;

    sectionObs = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    const id = entry.target.id;
                    // Destaca item correspondente no TOC
                    tocContainer.querySelectorAll('.report-toc-item').forEach((/** @type {any} */ item: any) => {
                        item.classList.toggle('active', item.getAttribute('data-heading-id') === id);
                    });
                    break;
                }
            }
        },
        {
            root: editorEl,
            threshold: 0.5,
            rootMargin: '0px 0px -60% 0px',
        },
    );

    headings.forEach((/** @type {any} */ h: any) => {
        if (h.el) sectionObs?.observe(h.el);
    });
}
