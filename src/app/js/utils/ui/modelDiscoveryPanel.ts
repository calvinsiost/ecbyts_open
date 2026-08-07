// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   MODEL DISCOVERY PANEL — SPEC_RADAR_GLOBAL_MODEL_DISCOVERY_9_67

   Camada de UI para descoberta global de modelos.
   Renderiza painel de busca + lista de resultados num containerEl.

   Usa delegação de eventos (sem onclick inline).
   CSS namespace: .mdisco-*
   ================================================================ */

import { t } from '../i18n/translations.js';
import { formatDate as _formatDateCanonical } from '../helpers/formatDate.js';
import { createDiscoveryRegistry } from '../../core/radar/discoveryRegistry.js';
import { attachModalA11y } from './modalA11y.js';

// ──────────────────────────────────────────────────────────────────────
// buildDiscoveryResultHTML
// ──────────────────────────────────────────────────────────────────────

/**
 * Constrói HTML de lista de entradas de descoberta.
 * Usa data-attributes para delegação de eventos (sem onclick inline).
 *
 * @param {ReadonlyArray<Object>} entries - Lista de entradas do registry
 * @returns {string} HTML string com cards de resultado
 */
export function buildDiscoveryResultHTML(entries: any): string {
    if (!Array.isArray(entries) || entries.length === 0) {
        return `<p class="mdisco-empty">${t('modelDiscovery.noResults')}</p>`;
    }

    return entries
        .map((/** @type {any} */ entry) => {
            const tagsHTML =
                Array.isArray(entry.tags) && entry.tags.length > 0
                    ? `<div class="mdisco-card__tags" aria-label="${t('modelDiscovery.tags')}">${entry.tags
                          .map((/** @type {any} */ tag: any) => `<span class="mdisco-tag">${escapeHtml(tag)}</span>`)
                          .join('')}</div>`
                    : '';

            const expiresLine = entry.expiresAt
                ? `<span class="mdisco-card__expires">${t('modelDiscovery.expiresOn')}: ${formatDate(entry.expiresAt)}</span>`
                : '';

            const elementLine = entry.modelSummary
                ? `<span class="mdisco-card__stat">${t('modelDiscovery.elementCount')}: ${entry.modelSummary.elementCount}</span>`
                : '';

            const campaignLine = entry.modelSummary
                ? `<span class="mdisco-card__stat">${t('modelDiscovery.campaignCount')}: ${entry.modelSummary.campaignCount}</span>`
                : '';

            return `
<article class="mdisco-card" data-share-code="${escapeAttr(entry.shareCode)}" role="listitem">
  <h3 class="mdisco-card__title">${escapeHtml(entry.title)}</h3>
  <p class="mdisco-card__meta">
    <span class="mdisco-card__owner">${t('modelDiscovery.publishedBy')}: ${escapeHtml(entry.ownerAlias)}</span>
    ${elementLine}
    ${campaignLine}
    ${expiresLine}
  </p>
  ${entry.description ? `<p class="mdisco-card__desc">${escapeHtml(entry.description)}</p>` : ''}
  ${tagsHTML}
  <button class="mdisco-card__load-btn"
          data-action="discoverLoadModel"
          data-share-code="${escapeAttr(entry.shareCode)}"
          type="button">
    ${t('modelDiscovery.loadModel')}
  </button>
</article>`.trim();
        })
        .join('\n');
}

// ──────────────────────────────────────────────────────────────────────
// renderDiscoveryPanel
// ──────────────────────────────────────────────────────────────────────

/**
 * Renderiza o painel de descoberta global no containerEl.
 * Insere campo de busca + lista de resultados.
 * Eventos gerenciados por delegação no containerEl.
 *
 * @param {any}      registry    - Registry criado por createDiscoveryRegistry()
 * @param {HTMLElement} containerEl - Elemento que receberá o painel
 * @returns {void}
 */
export function renderDiscoveryPanel(registry: any, containerEl: any): void {
    if (!containerEl || typeof containerEl.innerHTML === 'undefined') {
        console.error('[modelDiscoveryPanel] containerEl inválido');
        return;
    }
    if (!registry || typeof registry.search !== 'function') {
        console.error('[modelDiscoveryPanel] registry inválido — esperado objeto com .search()');
        return;
    }

    // Renderiza estrutura inicial do painel
    containerEl.innerHTML = `
<section class="mdisco-panel" role="region" aria-label="${t('modelDiscovery.searchPlaceholder')}">
  <div class="mdisco-search">
    <input
      class="mdisco-search__input"
      id="mdisco-search-input"
      type="search"
      placeholder="${t('modelDiscovery.searchPlaceholder')}"
      aria-label="${t('modelDiscovery.searchPlaceholder')}"
      autocomplete="off"
    />
  </div>
  <div class="mdisco-results" id="mdisco-results" role="list" aria-live="polite">
    ${buildDiscoveryResultHTML(registry.listAll())}
  </div>
</section>`.trim();

    const input = (containerEl.querySelector('#mdisco-search-input') as any);
    const resultsEl = (containerEl.querySelector('#mdisco-results') as any);

    // Busca com debounce ao digitar
    if (input && resultsEl) {
        /** @type {any} */ let debounceTimer: any = null;
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const query = input.value.trim();
                const results = query ? registry.search({ query, limit: 50 }) : registry.listAll();
                resultsEl.innerHTML = buildDiscoveryResultHTML(results);
            }, 220);
        });
    }

    // Delegação de eventos para ações nos cards
    containerEl.addEventListener('click', (/** @type {any} */ e: any) => {
        const btn = (e.target.closest('[data-action="discoverLoadModel"]') as any);
        if (!btn) return;
        const shareCode = btn.dataset.shareCode || '';
        const W = (window as any);
        if (shareCode && typeof W.handleDiscoverLoadModel === 'function') {
            W.handleDiscoverLoadModel(shareCode);
        } else {
            console.warn('[modelDiscoveryPanel] handleDiscoverLoadModel não registrado para shareCode:', shareCode);
        }
    });
}

// ──────────────────────────────────────────────────────────────────────
// openModelDiscoveryPanel — entry point do menu "Mais → Descobrir Modelos"
// ──────────────────────────────────────────────────────────────────────

const DISCOVERY_OVERLAY_ID = 'mdisco-panel-overlay';
let _globalRegistry: any = null;
let _a11yCleanup: (() => void) | null = null;

/**
 * Registry singleton do painel (in-memory). Exposto para que publicações de
 * modelos (deep-link/sharing) alimentem a mesma instância que a UI lê.
 * @returns {any} DiscoveryRegistry
 */
export function getGlobalDiscoveryRegistry(): any {
    if (!_globalRegistry) _globalRegistry = createDiscoveryRegistry();
    return _globalRegistry;
}

/**
 * Fecha o overlay do painel de descoberta (idempotente).
 */
export function closeModelDiscoveryPanel(): void {
    const overlay = document.getElementById(DISCOVERY_OVERLAY_ID);
    if (overlay) overlay.remove();
    if (_a11yCleanup) {
        _a11yCleanup();
        _a11yCleanup = null;
    }
}

/**
 * Abre o painel de descoberta global num overlay (R-OPEN BUG 2, 2026-08-06).
 *
 * CAUSA RAIZ do bug: o registry de painéis órfãos (_panelDiscoveryRegistry)
 * invocava `renderDiscoveryPanel()` com 0 argumentos, mas a função EXIGE
 * (registry, containerEl) → early-return silencioso, nenhum feedback. Este
 * wrapper monta o container (overlay .ecbt-overlay, mesmo trilho do
 * budgetPanel) e passa os 2 argumentos. Registry vazio renderiza o empty
 * state `mdisco-empty` — feedback SEMPRE visível (§R3-F-a).
 */
export function openModelDiscoveryPanel(): void {
    closeModelDiscoveryPanel();
    const overlay = document.createElement('div');
    overlay.id = DISCOVERY_OVERLAY_ID;
    overlay.className = 'ecbt-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mdisco-panel-title');

    // t() devolve a própria CHAVE quando não traduzida — fallback explícito.
    const rawTitle = t('panel.modelDiscovery.title');
    const title = rawTitle && rawTitle !== 'panel.modelDiscovery.title' ? rawTitle : 'Descobrir Modelos';
    overlay.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--xl">
            <div class="ecbt-header">
                <h2 class="ecbt-title" id="mdisco-panel-title">${escapeHtml(title)}</h2>
                <button type="button" class="ecbt-close" data-action="close" aria-label="Fechar">&#10005;</button>
            </div>
            <div class="ecbt-form mdisco-body" style="flex:1;overflow-y:auto;"></div>
        </div>`;

    overlay.addEventListener('click', (e: any) => {
        const target = e.target as HTMLElement;
        if (target === overlay || target.closest('[data-action="close"]')) closeModelDiscoveryPanel();
    });
    overlay.addEventListener('keydown', (e: any) => {
        if (e.key === 'Escape') closeModelDiscoveryPanel();
    });

    document.body.appendChild(overlay);

    const body = overlay.querySelector('.mdisco-body') as HTMLElement | null;
    if (body) renderDiscoveryPanel(getGlobalDiscoveryRegistry(), body);

    try {
        _a11yCleanup = attachModalA11y(overlay, closeModelDiscoveryPanel);
    } catch {
        _a11yCleanup = null;
    }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers internos
// ──────────────────────────────────────────────────────────────────────

/**
 * Escapa HTML para prevenir XSS em conteúdo de usuário.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str: any): string {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escapa valor para uso em atributos HTML.
 * @param {string} str
 * @returns {string}
 */
function escapeAttr(str: any): string {
    return escapeHtml(String(str));
}

/**
 * Formata ISO date string para exibição legível.
 * @param {string} iso
 * @returns {string}
 */
function formatDate(iso: any): string {
    return _formatDateCanonical(iso, { locale: undefined, dateStyle: 'medium', errorFallback: 'original' });
}
