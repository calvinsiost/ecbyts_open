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

declare global {
    interface Window {
        toggleSection: (headerEl: HTMLElement) => void;
        sectionClass: (id: string) => 'collapsed' | '';
    }
}

/* ================================================================
   SISTEMA DE ABAS
   ================================================================

   Este modulo gerencia as abas do painel direito.

   O QUE SAO ABAS?
   Abas (tabs) permitem alternar entre diferentes conteudos
   em um mesmo espaco, economizando area na tela.

   ABAS DA APLICACAO:
   - Project: Informacoes do projeto e coordenadas
   - Elements: Lista de elementos do modelo
   - Campaigns, Scenes, Analytics, Stamps

   COMPORTAMENTO:
   - Apenas uma aba ativa por vez
   - Clicar em aba mostra seu conteudo
   - Abas inativas tem visual diferente

   ================================================================ */

// ----------------------------------------------------------------
// INICIALIZACAO
// ----------------------------------------------------------------

/**
 * Inicializa sistema de abas.
 * Deve ser chamado apos o DOM estar pronto.
 *
 * COMO FUNCIONA:
 * 1. Encontra todas as abas (elementos com classe .tab)
 * 2. Adiciona evento de clique em cada uma
 * 3. Clique ativa a aba e mostra conteudo correspondente
 */
export function initTabs(): void {
    // Seleciona todas as abas
    const tabs = document.querySelectorAll('.tab');

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            activateTab(tab as HTMLElement);
        });
    });

    // UI-EVAL-COVERAGE-001#overflow-sem-handler (Calvin, 2026-08-06):
    // `window.activateTab(id)` era um CONTRATO assumido em 4 pontos do app
    // (menu Analisar > Painéis > "Analytics" e "Governance" via
    // inline-handlers `window.activateTab && window.activateTab('analytics')`,
    // bountyHandlers, issueHandlers e o fallback do command palette) e que
    // NINGUÉM cumpria — nenhuma linha atribuía window.activateTab. Todas as
    // chamadas eram guardadas, então o clique morria em silêncio (R3-F-a).
    // As abas `analytics` e `governance` existem em app/index.html, então
    // activateTabById já resolve; faltava só publicar a função.
    // Mesma convenção de initSections(), logo abaixo, que publica
    // window.toggleSection / window.sectionClass.
    window.activateTab = activateTabById;
}

// ----------------------------------------------------------------
// FUNCOES DE NAVEGACAO
// ----------------------------------------------------------------

/**
 * Ativa uma aba especifica.
 *
 * @param {HTMLElement} tab - Elemento da aba a ativar
 *
 * PROCESSO:
 * 1. Encontra o painel pai (left-panel ou right-panel)
 * 2. Remove classe 'active' das abas do MESMO painel
 * 3. Esconde conteudos do mesmo painel
 * 4. Adiciona 'active' na aba clicada
 * 5. Mostra conteudo correspondente
 */
function activateTab(tab: HTMLElement) {
    // Obtem ID da aba (data-tab="project" -> "project")
    const tabId = tab.dataset.tab || '';
    if (!tabId) return;

    // Encontra o painel pai - escopo por painel, nao global
    const panel = tab.closest('#left-panel, #right-panel');
    if (!panel) return;

    // Remove 'active' apenas das abas do mesmo painel
    const panelTabs = panel.querySelectorAll('.tab');
    panelTabs.forEach((t) => t.classList.remove('active'));

    // Esconde conteudos apenas do mesmo painel
    const panelContents = panel.querySelectorAll('.tab-content');
    panelContents.forEach((c) => ((c as HTMLElement).style.display = 'none'));

    // Ativa aba clicada
    tab.classList.add('active');
    // Garante visibilidade da aba ativa no container com overflow vertical.
    const tabsContainer = tab.closest('.tabs');
    if (tabsContainer) {
        const ensureTabVisible = () => {
            const containerRect = tabsContainer.getBoundingClientRect();
            const tabRect = tab.getBoundingClientRect();
            if (tabRect.top < containerRect.top) {
                tabsContainer.scrollTop += tabRect.top - containerRect.top - 4;
            } else if (tabRect.bottom > containerRect.bottom) {
                tabsContainer.scrollTop += tabRect.bottom - containerRect.bottom + 4;
            }
        };
        ensureTabVisible();
        requestAnimationFrame(ensureTabVisible);
    }

    // Mostra conteudo correspondente
    const content = document.getElementById(`tab-${tabId}`);
    if (content) {
        content.style.display = 'block';
    }

    // Notifica para re-renderizar conteudo da aba recem-ativada
    window.dispatchEvent(new CustomEvent('tabChanged', { detail: { tab: tabId } }));
}

/**
 * Ativa aba pelo ID (programaticamente).
 *
 * @param {string} tabId - ID da aba ('project', 'elements', 'layers')
 *
 * EXEMPLO:
 *   activateTabById('elements'); // Abre aba de elementos
 */
export function activateTabById(tabId: string): void {
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (tab) {
        activateTab(tab as HTMLElement);
    }
}

/**
 * Retorna ID da aba atualmente ativa.
 *
 * @returns {string|null} - ID da aba ativa ou null
 */
export function getActiveTab(): string | null {
    const activeTab = document.querySelector('.tab.active') as HTMLElement | null;
    return activeTab?.dataset?.tab || null;
}

// ----------------------------------------------------------------
// FUNCOES DE SECOES EXPANSIVEIS
// ----------------------------------------------------------------

// Prefixo da key de persistencia de secoes no localStorage.
// '1' = expandido (excecao ao default); ausencia = colapsado (default).
const _SECTION_KEY = 'ecbyts-section-';

/**
 * Retorna a classe CSS inicial de uma secao com base no estado salvo.
 * Padrao: 'collapsed' quando nao ha estado salvo.
 *
 * @param {string} id - ID da secao (data-section-id)
 * @returns {'collapsed'|''}
 */
function sectionClass(id: string): 'collapsed' | '' {
    return localStorage.getItem(_SECTION_KEY + id) === '1' ? '' : 'collapsed';
}

/**
 * Inicializa secoes expansiveis (acordeoes).
 * Secoes podem ser expandidas ou colapsadas clicando no cabecalho.
 * Registra window.toggleSection e window.sectionClass para uso em templates.
 */
export function initSections(): void {
    window.toggleSection = toggleSection;
    window.sectionClass = sectionClass;

    const headers = document.querySelectorAll('.section-header');
    headers.forEach((header) => {
        header.addEventListener('click', () => {
            toggleSection(header as HTMLElement);
        });
    });

    // Colapsar todas as secoes estaticas na primeira abertura.
    // Secoes com data-section-id usam sectionClass() no render (ja colapsadas).
    // Secoes sem data-section-id (HTML estatico) precisam ser colapsadas aqui.
    document.querySelectorAll('.section:not(.collapsed)').forEach((section) => {
        const sec = section as HTMLElement;
        const id = sec.dataset.sectionId || '';
        if (!id || localStorage.getItem(_SECTION_KEY + id) !== '1') {
            sec.classList.add('collapsed');
        }
    });
}

/**
 * Alterna estado de uma secao (expandida/colapsada) e persiste no localStorage.
 * Aceita o header ou o elemento section diretamente.
 *
 * @param {HTMLElement} headerEl - Header ou secao a alternar
 */
function toggleSection(headerEl: HTMLElement) {
    if (!headerEl) return;
    const section =
        headerEl.classList.contains('section-header') || headerEl.classList.contains('campaign-section-title')
            ? headerEl.parentElement
            : headerEl;
    if (!section) return;
    const isNowCollapsed = section.classList.toggle('collapsed');
    const id = section.dataset.sectionId || '';
    if (id) {
        if (isNowCollapsed) {
            localStorage.removeItem(_SECTION_KEY + id);
        } else {
            localStorage.setItem(_SECTION_KEY + id, '1');
        }
    }
}

/**
 * Expande uma secao.
 *
 * @param {HTMLElement} section - Elemento da secao
 */
export function expandSection(section: HTMLElement): void {
    if (section) {
        section.classList.remove('collapsed');
    }
}

/**
 * Colapsa uma secao.
 *
 * @param {HTMLElement} section - Elemento da secao
 */
export function collapseSection(section: HTMLElement): void {
    if (section) {
        section.classList.add('collapsed');
    }
}

/**
 * Expande todas as secoes.
 */
export function expandAllSections(): void {
    document.querySelectorAll('.section').forEach((section) => {
        section.classList.remove('collapsed');
    });
}

/**
 * Colapsa todas as secoes.
 */
export function collapseAllSections(): void {
    document.querySelectorAll('.section').forEach((section) => {
        section.classList.add('collapsed');
    });
}
