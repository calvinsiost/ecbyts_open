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
   TOOLBAR FLAT — SISTEMA DE GRUPOS E DROPDOWNS
   ================================================================

   Substitui o sistema de abas (ribbon) por uma toolbar única
   com grupos permanentes e dropdowns de progressive disclosure.

   COMPORTAMENTO DOS DROPDOWNS:
   - Trigger: botão com class .toolbar-dropdown-trigger e data-dropdown="<id>"
   - Target:  div.toolbar-dropdown com id="<id>"
   - Aberto:  classe .open no target + aria-expanded="true" no trigger
   - Fecha ao: clicar fora, pressionar Escape, selecionar item, Tab
   - Posição:  fixed, calculada por positionDropdown() para não sair da viewport
   - A11y:    arrow keys (↑↓) navegam entre items; focus no primeiro ao abrir
              items têm tabindex="-1" (ver HTML); role="menu"/"menuitem"

   COMPATIBILIDADE:
   - switchRibbonTab(tabId) ainda existe para uso em editToolbar.js.
     Quando tabId === 'edit', esconde #ribbon-main e mostra #ribbon-edit.
     Qualquer outro tabId restaura #ribbon-main.
   - Painel ativo rastreado via data-active="true" (robusto a variações de
     whitespace no style attribute).
   - IDs preservados: #ribbon-view-mode-btn, #ribbon-view-mode-label,
     #voxel-controls, #edit-ribbon-*, #toggle-*-btn

   ================================================================ */
// ----------------------------------------------------------------
// COMPATIBILIDADE: switchRibbonTab
// ----------------------------------------------------------------
/**
 * Troca entre toolbar principal e toolbar contextual de edição de forma.
 * Mantida para compatibilidade com editToolbar.js.
 * Usa data-active="true" para rastrear o painel ativo (não style string match).
 *
 * @param {string} tabId - 'edit' para modo de edição; qualquer outro valor
 *                         restaura a toolbar principal.
 */
export function switchRibbonTab(tabId: any) {
    const mainPanel = document.getElementById('ribbon-main');
    const editPanel = document.getElementById('ribbon-edit');
    if (tabId === 'edit') {
        if (mainPanel) {
            mainPanel.style.display = 'none';
            mainPanel.removeAttribute('data-active');
        }
        if (editPanel) {
            editPanel.style.display = 'flex';
            editPanel.dataset.active = 'true';
        }
    } else {
        if (mainPanel) {
            mainPanel.style.display = 'flex';
            mainPanel.dataset.active = 'true';
        }
        if (editPanel) {
            editPanel.style.display = 'none';
            editPanel.removeAttribute('data-active');
        }
    }
    requestAnimationFrame(updateScrollArrows);
}
// ----------------------------------------------------------------
// DROPDOWNS
// ----------------------------------------------------------------
/**
 * Fecha todos os dropdowns abertos.
 * Se returnFocus=true, devolve o foco ao trigger do dropdown fechado.
 *
 * @param {HTMLElement|null} except      - Dropdown a não fechar.
 * @param {boolean}          returnFocus - Se true, foca o trigger ao fechar.
 */
function closeAllDropdowns(except = null, returnFocus = false) {
    document.querySelectorAll('.toolbar-dropdown.open').forEach((d: any) => {
        if (d === except) return;
        d.classList.remove('open');
        const trigger = (document.querySelector(`[data-dropdown="${d.id}"]`)) as any;
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
            if (returnFocus) trigger.focus();
        }
    });
}
/**
 * Posiciona um dropdown abaixo do seu trigger, corrigindo overflow da viewport.
 * Usa position: fixed para aparecer acima de qualquer z-index de painel.
 * Dois rAF encadeados garantem que o browser finalizou o layout após
 * visibility:visible + max-height antes de medir a altura real.
 *
 * @param {HTMLElement} dropdown
 * @param {HTMLElement} trigger
 */
function positionDropdown(dropdown: any, trigger: any) {
    const rect = trigger.getBoundingClientRect();
    const ddMinWidth = 220;
    const margin = 8;
    const leftAligned = rect.left;
    const rightAligned = rect.right - ddMinWidth;
    const wouldOverflowRight = leftAligned + ddMinWidth > window.innerWidth - margin;
    dropdown.style.top = rect.bottom + 2 + 'px';
    dropdown.style.left = (wouldOverflowRight ? Math.max(margin, rightAligned) : leftAligned) + 'px';
    // Dois rAFs: 1º para .open ser aplicado; 2º para medir altura final
    requestAnimationFrame(() =>
        requestAnimationFrame(() => {
            const ddRect = dropdown.getBoundingClientRect();
            if (ddRect.bottom > window.innerHeight - margin) {
                dropdown.style.top = rect.top - ddRect.height - 2 + 'px';
            }
        }),
    );
}
/**
 * Abre um dropdown, posiciona e foca o primeiro item acessível.
 * Focus no primeiro item é requisito WCAG 2.1 SC 4.1.2 (role=menu).
 *
 * @param {HTMLElement} dropdown
 * @param {HTMLElement} trigger
 */
function openDropdown(dropdown: any, trigger: any) {
    dropdown.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    positionDropdown(dropdown, trigger);
    _restoreDdSectionStates(dropdown);
    // Inicializa search inline (dd-more) se existir - uma vez por dropdown
    _initDdSearch(dropdown);
    requestAnimationFrame(() => {
        // Se tem search input, foca nele primeiro (melhor UX para busca)
        const searchInput = (dropdown.querySelector('.toolbar-dd-search-input')) as any;
        if (searchInput) {
            searchInput.focus();
            return;
        }
        const firstItem = (Array.from(dropdown.querySelectorAll('.toolbar-dropdown-item:not([disabled])')).find(
                (el: any) => el.offsetParent !== null,
            )) as any;
        firstItem?.focus();
    });
}
/**
 * Normalize text for search: lowercase + remove diacritics.
 * @param {string} s
 * @returns {string}
 */
function _normalizeSearch(s: any) {
    return (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}
/**
 * Minimum number of items before a dropdown gets an inline search bar.
 */
const DD_SEARCH_MIN_ITEMS = 5;
/**
 * Cria o search bar dinamicamente no topo do dropdown se ele tiver items suficientes.
 * @param {HTMLElement} dropdown
 * @returns {any} O input criado, ou null se não aplicável.
 */
function _ensureDdSearchBar(dropdown: any) {
    // Já existe?
    const input = (dropdown.querySelector('.toolbar-dd-search-input')) as any;
    if (input) return input;
    // Tem items suficientes para justificar a busca?
    const itemCount = dropdown.querySelectorAll('.toolbar-dropdown-item').length;
    if (itemCount < DD_SEARCH_MIN_ITEMS) return null;
    // Criar search bar
    const searchBar = document.createElement('div');
    searchBar.className = 'toolbar-dd-search';
    searchBar.innerHTML = `
        <span class="icon" data-icon="search"></span>
        <input type="text" class="toolbar-dd-search-input"
            placeholder="Localizar..." aria-label="Pesquisar no menu" autocomplete="off" />
        <button type="button" class="toolbar-dd-search-clear" tabindex="-1"
            aria-label="Limpar pesquisa" title="Limpar" style="display:none;">&times;</button>
    `;
    const noResults = document.createElement('div');
    noResults.className = 'toolbar-dd-no-results';
    noResults.style.display = 'none';
    noResults.textContent = 'Nenhum resultado encontrado';
    // Insert at top of dropdown
    dropdown.insertBefore(noResults, dropdown.firstChild);
    dropdown.insertBefore(searchBar, dropdown.firstChild);
    return /** @type {any} */ (searchBar.querySelector('.toolbar-dd-search-input'));
}
/**
 * Inicializa o search inline no dropdown (dd-more, dd-overflow, etc.).
 * Cria o search bar se não existir + filtra items + seções em tempo real.
 * @param {HTMLElement} dropdown
 */
function _initDdSearch(dropdown: any) {
    const input = _ensureDdSearchBar(dropdown);
    if (!input) return;
    if (input.dataset.initialized === '1') {
        // Reset value on re-open
        input.value = '';
        const clearBtn = (dropdown.querySelector('.toolbar-dd-search-clear')) as any;
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }
    input.dataset.initialized = '1';
    const clearBtn = (dropdown.querySelector('.toolbar-dd-search-clear')) as any;
    const noResultsEl = (dropdown.querySelector('.toolbar-dd-no-results')) as any;
    /** Apply filter based on current input value */
    const applyFilter = () => {
        const q = _normalizeSearch(input.value.trim());
        const items = dropdown.querySelectorAll('.toolbar-dropdown-item');
        const sections = dropdown.querySelectorAll('.toolbar-dd-section');
        const dividers = dropdown.querySelectorAll('.toolbar-dropdown-divider');
        // Toggle clear button
        if (clearBtn) clearBtn.style.display = q ? '' : 'none';
        if (!q) {
            // Restore visibility - keep sections EXPANDED (better UX after search)
            // User can click section headers to collapse if needed.
            items.forEach((it: any) => (it.style.display = ''));
            sections.forEach((s: any) => {
                s.style.display = '';
                // Keep expanded (remove collapsed) - more useful after clearing a search
                s.classList.remove('collapsed');
                const hdr = s.querySelector('.toolbar-dd-section-hdr');
                if (hdr) hdr.setAttribute('aria-expanded', 'true');
            });
            dividers.forEach((d: any) => (d.style.display = ''));
            if (noResultsEl) noResultsEl.style.display = 'none';
            return;
        }
        // Filter items: show items whose text or title matches
        let totalVisible = 0;
        items.forEach((item: any) => {
            const label = _normalizeSearch(item.textContent || '');
            const title = _normalizeSearch(item.getAttribute('title') || '');
            const match = label.includes(q) || title.includes(q);
            item.style.display = match ? '' : 'none';
            if (match) totalVisible++;
        });
        // For each section, expand it if it contains at least one visible item; otherwise hide
        sections.forEach((section: any) => {
            const innerItems = (Array.from(section.querySelectorAll('.toolbar-dropdown-item'))) as any[];
            const visibleInside = innerItems.filter((it: any) => it.style.display !== 'none').length;
            if (visibleInside === 0) {
                section.style.display = 'none';
            } else {
                section.style.display = '';
                // Remove .collapsed class so body is visible (CSS forces display:none on .collapsed)
                section.classList.remove('collapsed');
                const hdr = section.querySelector('.toolbar-dd-section-hdr');
                if (hdr) hdr.setAttribute('aria-expanded', 'true');
            }
        });
        // Hide dividers - noisy during search
        dividers.forEach((d: any) => (d.style.display = 'none'));
        // No-results message
        if (noResultsEl) noResultsEl.style.display = totalVisible === 0 ? '' : 'none';
    };
    // Debounced via RAF (lightweight)
    /** @type {any} */
    let frame: any = null;
    input.addEventListener('input', () => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(applyFilter);
    });
    // Clear button
    if (clearBtn) {
        clearBtn.addEventListener('click', (e: any) => {
            e.stopPropagation();
            input.value = '';
            applyFilter();
            input.focus();
        });
    }
    // Escape: clear if non-empty, otherwise close dropdown (default behavior)
    input.addEventListener('keydown', (e: any) => {
        if (e.key === 'Escape' && input.value) {
            e.stopPropagation();
            input.value = '';
            applyFilter();
        } else if (e.key === 'ArrowDown') {
            // Move focus to first visible item
            e.preventDefault();
            const first = (Array.from(dropdown.querySelectorAll('.toolbar-dropdown-item')).find(
                    (it: any) => it.offsetParent !== null,
                )) as any;
            first?.focus();
        } else if (e.key === 'Enter') {
            // Activate first visible item
            e.preventDefault();
            const first = (Array.from(dropdown.querySelectorAll('.toolbar-dropdown-item')).find(
                    (it: any) => it.offsetParent !== null,
                )) as any;
            first?.click();
        }
    });
    // Don't close dropdown when clicking the input
    input.addEventListener('click', (e: any) => e.stopPropagation());
    // Don't close dropdown when clicking clear button
    if (clearBtn) clearBtn.addEventListener('click', (e: any) => e.stopPropagation());
    // Reset on open
    input.value = '';
    applyFilter();
}
/**
 * Alterna o estado colapsado/expandido de uma seção do dropdown.
 * @param {HTMLElement} hdrEl - botão .toolbar-dd-section-hdr clicado
 */
function _toggleDdSection(hdrEl: any) {
    const section = (hdrEl.closest('.toolbar-dd-section')) as any;
    if (!section) return;
    const isNowCollapsed = section.classList.toggle('collapsed');
    hdrEl.setAttribute('aria-expanded', String(!isNowCollapsed));
    const key = 'ecbyts-dd-more-' + (section.dataset.ddSection || '');
    const isDefaultOpen = section.dataset.ddDefaultOpen === '1';
    try {
        // Padrão = colapsado (exceto seções data-dd-default-open="1", que nascem expandidas);
        // '1' = expandido explícito pelo usuário, '0' = colapsado explícito pelo usuário.
        // Seções default-open precisam persistir '0' explícito ao colapsar, senão
        // _restoreDdSectionStates as reexpandiria na próxima abertura.
        if (isNowCollapsed) {
            if (isDefaultOpen) localStorage.setItem(key, '0');
            else localStorage.removeItem(key);
        } else {
            if (isDefaultOpen) localStorage.removeItem(key);
            else localStorage.setItem(key, '1');
        }
    } catch (e: any) {
        console.debug('[ribbon] persistCollapse:', e?.message || e);
    }
}
/**
 * Restaura estados de colapso das seções de um dropdown a partir do localStorage.
 * Padrão = colapsado, exceto seções com data-dd-default-open="1" (nascem expandidas).
 * Um valor explícito no localStorage ('1' ou '0') sempre tem precedência sobre o padrão.
 * @param {HTMLElement} dd - elemento dropdown
 */
function _restoreDdSectionStates(dd: any) {
    dd.querySelectorAll('.toolbar-dd-section').forEach((sec: any) => {
        const key = 'ecbyts-dd-more-' + (sec.dataset.ddSection || '');
        const stored = localStorage.getItem(key);
        const defaultOpen = sec.dataset.ddDefaultOpen === '1';
        const expanded = stored === null ? defaultOpen : stored === '1';
        const hdr = sec.querySelector('.toolbar-dd-section-hdr');
        sec.classList.toggle('collapsed', !expanded);
        if (hdr) hdr.setAttribute('aria-expanded', String(expanded));
    });
}
/**
 * Cria um elemento .toolbar-dd-section recolhível para uso no overflow dropdown.
 * @param {string} label - texto do cabeçalho
 * @param {string} sectionId - sufixo para data-dd-section
 * @returns {{ section: HTMLElement, body: HTMLElement }}
 */
function _makeOverflowSection(label: any, sectionId: any) {
    const section = document.createElement('div');
    section.className = 'toolbar-dd-section collapsed';
    section.dataset.ddSection = sectionId;
    const hdr = document.createElement('button');
    hdr.className = 'toolbar-dd-section-hdr';
    hdr.tabIndex = -1;
    hdr.setAttribute('aria-expanded', 'false');
    // data-icon é renderizado automaticamente pelo MutationObserver de ícones
    hdr.innerHTML =
        `<span>${label}</span>` + `<span class="toolbar-dd-section-chevron icon" data-icon="chevron-down"></span>`;
    const body = document.createElement('div');
    body.className = 'toolbar-dd-section-body';
    section.appendChild(hdr);
    section.appendChild(body);
    return { section, body };
}
/**
 * Converte um controle da toolbar num item do #dd-overflow PRESERVANDO A AÇÃO.
 *
 * UI-EVAL-COVERAGE-001#overflow-sem-handler (Calvin, 2026-08-06): buscar "int"
 * em "Mais → Localizar..." e clicar em "Interpolação" não fazia NADA. A causa
 * era este ponto: o overflow montava um <button> NOVO e copiava só `onclick` +
 * `innerHTML`. Os ~317 botões do app não usam `onclick` — usam
 * `data-handler` (delegação em main/dataHandlerDelegation.ts) ou
 * `data-cc-action` (delegação em app/js/boot/inline-handlers.js). Ambos são
 * ATRIBUTOS, e nenhum deles era copiado: o clone nascia com rótulo e ícone,
 * mas sem porta nenhuma para a ação.
 *
 * Clonar o elemento ORIGINAL (em vez de recopiar atributo a atributo) é o que
 * torna isto à prova de futuro: qualquer rota de ação nova que seja um
 * atributo passa a sobreviver ao overflow de graça.
 *
 * Só o `id` é removido — id duplicado quebraria `getElementById` do original
 * (ex.: `dd-more-panel-timekeeper`, do auto-register de painéis).
 *
 * @param {HTMLElement} source - botão/item original
 * @returns {any} clone pronto para o dropdown
 */
function _asOverflowItem(source: any) {
    const item = (source.cloneNode(true)) as any;
    if (item.id) {
        item.dataset.overflowCloneOf = item.id;
        item.removeAttribute('id');
    }
    item.querySelectorAll?.('[id]').forEach((el: any) => el.removeAttribute('id'));
    item.classList?.remove('toolbar-btn', 'toolbar-split-btn', 'primary', 'active');
    item.classList?.add('toolbar-dropdown-item');
    // tabindex -1: itens do dropdown fechado não podem roubar foco do teclado.
    item.tabIndex = -1;
    if (!item.getAttribute('role')) item.setAttribute('role', 'menuitem');
    return item;
}
/**
 * Registra os listeners de dropdown na toolbar.
 * Um único listener de click delegado - evita múltiplos handlers no document.
 * Keyboard: ↑↓ navega, Escape fecha+retorna foco, Tab fecha, Home/End.
 * Chamada uma única vez em initRibbon().
 */
function initDropdowns() {
    // Único listener de click delegado
    document.addEventListener('click', (e: any) => {
        const ddSectionHdr = e.target?.closest?.('.toolbar-dd-section-hdr');
        if (ddSectionHdr) {
            e.stopPropagation();
            _toggleDdSection(ddSectionHdr);
            return;
        }
        const trigger = (e.target?.closest?.('.toolbar-dropdown-trigger')) as any;
        const item = (e.target?.closest?.('.toolbar-dropdown-item')) as any;
        if (trigger) {
            e.stopPropagation();
            const ddId = trigger.dataset.dropdown || '';
            const dropdown = ddId ? document.getElementById(ddId) : null;
            if (!dropdown) return;
            const isOpen = dropdown.classList.contains('open');
            closeAllDropdowns();
            if (!isOpen) openDropdown(dropdown, trigger);
            return;
        }
        if (item) {
            // Item clicado: onclick já executou antes de chegar aqui (bubbling)
            setTimeout(() => closeAllDropdowns(), 0);
            return;
        }
        closeAllDropdowns();
    });
    // Keyboard navigation - WCAG 2.1 role=menu pattern
    document.addEventListener('keydown', (e: any) => {
        const openDd = document.querySelector('.toolbar-dropdown.open');
        if (e.key === 'Escape') {
            if (openDd) closeAllDropdowns(null, true /* returnFocus */);
            return;
        }
        if (!openDd) return;
        const items = (Array.from(openDd.querySelectorAll('.toolbar-dropdown-item:not([disabled])')).filter(
                (el: any) => el.offsetParent !== null,
            )) as any[];
        const focused = (document.activeElement) as any;
        const idx = items.indexOf(focused);
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                (items[idx + 1] ?? items[0])?.focus();
                break;
            case 'ArrowUp':
                e.preventDefault();
                (items[idx - 1] ?? items[items.length - 1])?.focus();
                break;
            case 'Home':
                e.preventDefault();
                items[0]?.focus();
                break;
            case 'End':
                e.preventDefault();
                items[items.length - 1]?.focus();
                break;
            case 'Tab':
                closeAllDropdowns();
                break;
        }
    });
}
// ----------------------------------------------------------------
// SCROLL ARROWS (mantidas para overflow horizontal)
// ----------------------------------------------------------------
/** @type {any} */
let _scrollArrowLeft: any = null;
/** @type {any} */
let _scrollArrowRight: any = null;
const SCROLL_STEP = 200;
/**
 * Injeta setas de navegação lateral no #toolbar quando o conteúdo transborda.
 */
function injectScrollArrows() {
    const toolbar = document.getElementById('toolbar');
    if (!toolbar || toolbar.querySelector('.ribbon-scroll-arrow')) return;
    _scrollArrowLeft = document.createElement('button');
    _scrollArrowLeft.type = 'button';
    _scrollArrowLeft.className = 'ribbon-scroll-arrow scroll-left';
    _scrollArrowLeft.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    _scrollArrowLeft.addEventListener('click', () => scrollActivePanel(-SCROLL_STEP));
    _scrollArrowRight = document.createElement('button');
    _scrollArrowRight.type = 'button';
    _scrollArrowRight.className = 'ribbon-scroll-arrow scroll-right';
    _scrollArrowRight.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    _scrollArrowRight.addEventListener('click', () => scrollActivePanel(SCROLL_STEP));
    toolbar.appendChild(_scrollArrowLeft);
    toolbar.appendChild(_scrollArrowRight);
}
/**
 * Retorna o painel do ribbon ativo via data-active="true".
 * Robusto a variações de whitespace no style attribute (fix selector frágil).
 * @returns {HTMLElement|null}
 */
function getActivePanel() {
    return /** @type {any} */ (document.querySelector('.ribbon-panel[data-active="true"]'));
}
/** @param {number} delta */
function scrollActivePanel(delta: any) {
    const panel = getActivePanel();
    if (panel) panel.scrollBy({ left: delta, behavior: 'smooth' });
}
function updateScrollArrows() {
    const panel = getActivePanel();
    if (!_scrollArrowLeft || !_scrollArrowRight) return;
    if (!panel || panel.scrollWidth <= panel.clientWidth + 2) {
        _scrollArrowLeft.classList.remove('visible');
        _scrollArrowRight.classList.remove('visible');
        return;
    }
    const atStart = panel.scrollLeft <= 2;
    const atEnd = panel.scrollLeft + panel.clientWidth >= panel.scrollWidth - 2;
    _scrollArrowLeft.classList.toggle('visible', !atStart);
    _scrollArrowRight.classList.toggle('visible', !atEnd);
}
// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
/**
 * Inicializa a toolbar flat: mostra #ribbon-main com data-active, injeta
 * setas de scroll, registra listeners de dropdown e scroll/resize.
 */
// ----------------------------------------------------------------
// LIBRARY GALLERY
// ----------------------------------------------------------------
/**
 * Popula o #lib-gallery com ícones das bibliotecas instaladas.
 * Cada item é um botão 30×20px com o ícone da biblioteca.
 * Ícones que não cabem nos 12 slots visíveis ficam acessíveis via seta (dd-libs).
 *
 * Chamada uma vez em initRibbon() e novamente após instalar/remover bibliotecas.
 * Exposta como window.refreshLibGallery() para handlers de biblioteca.
 */
export function refreshLibGallery() {
    const gallery = document.getElementById('lib-gallery');
    if (!gallery) return;
    gallery.innerHTML = '';
    const STANDARD_LIBRARY_ICON = 'book-open';
    const allowedGalleryIcons = new Set([
        'book-open',
        'package',
        'box',
        'database',
        'folder',
        'file-text',
        'layers',
        'globe',
    ]);
    // Importação dinâmica para não criar dependência circular
    import('../libraries/manager.js' as string)
        .then(({ getInstalledLibraries }) => {
            const libs = getInstalledLibraries();
            if (libs.length === 0) {
                // Nenhuma biblioteca: ícone padrão da seção que abre marketplace
                const placeholder = document.createElement('button');
                placeholder.className = 'lib-gallery-item lib-gallery-placeholder';
                placeholder.tabIndex = -1;
                placeholder.title = 'Explorar bibliotecas';
                placeholder.setAttribute('role', 'option');
                placeholder.onclick = () => window.handleOpenMarketplace?.();
                placeholder.innerHTML = `<span class="icon lib-gallery-item-icon" data-icon="${STANDARD_LIBRARY_ICON}" data-icon-size="14px"></span>`;
                gallery.appendChild(placeholder);
                if (typeof window.hydrateIcons === 'function') window.hydrateIcons(gallery);
                return;
            }
            libs.forEach((lib: any) => {
                const btn = document.createElement('button');
                btn.className = 'lib-gallery-item';
                btn.tabIndex = -1;
                btn.title = lib.manifest.name;
                btn.setAttribute('role', 'option');
                btn.onclick = () => window.handleActivateLibrary?.(lib.manifest.id);
                if (lib.manifest.thumbnail) {
                    // Thumbnail base64 ou URL
                    const img = document.createElement('img');
                    img.src = lib.manifest.thumbnail;
                    img.alt = lib.manifest.name;
                    btn.appendChild(img);
                } else {
                    // Fallback: ícone padronizado para manter consistência visual da toolbar
                    const iconEl = document.createElement('span');
                    iconEl.className = 'icon lib-gallery-item-icon';
                    const iconId = String(lib.manifest.icon || '').trim();
                    iconEl.dataset.icon = allowedGalleryIcons.has(iconId) ? iconId : STANDARD_LIBRARY_ICON;
                    iconEl.dataset.iconSize = '14px';
                    btn.appendChild(iconEl);
                }
                gallery.appendChild(btn);
            });
            // Re-hidratar ícones Lucide dos itens recém-criados
            if (typeof window.hydrateIcons === 'function') window.hydrateIcons(gallery);
        })
        .catch((_e) => console.debug('[utils/ui/ribbon:silent-catch]', _e?.message || _e));
}
// ----------------------------------------------------------------
// OVERFLOW - Priority+ pattern
// ----------------------------------------------------------------
/**
 * Avalia quais grupos do ribbon cabem na largura disponível.
 * Grupos que transbordam são ocultados da toolbar e seus itens
 * são clonados no dropdown #dd-overflow do botão "Mais".
 *
 * Estratégia:
 *  1. Medir largura disponível no #ribbon-main (excluindo spacer e collapse-btn)
 *  2. Iterar grupos da direita para a esquerda (menos prioritários primeiro)
 *  3. Ocultar grupos que não cabem; mostrar botão #tg-more sempre que houver overflow
 *  4. Reconstruir #dd-overflow com clones profundos dos itens dos grupos ocultos
 *
 * Grupos nunca ocultados: tg-file, tg-history (IDs na lista PINNED_GROUPS).
 */
const PINNED_GROUPS = new Set(['tg-file', 'tg-history']);
function updateOverflow() {
    const panel = document.getElementById('ribbon-main');
    if (!panel) return;
    const moreTrigger = document.querySelector('#tg-more > .toolbar-dropdown-trigger');
    const moreGroup = document.getElementById('tg-more');
    const overflowDd = document.getElementById('dd-overflow');
    if (!moreGroup || !overflowDd) return;
    // Grupos candidatos ao overflow (da direita para esquerda, exceto "Mais" e pinned)
    const groups = Array.from(panel.querySelectorAll('.toolbar-group:not(#tg-more):not(#voxel-controls)')).reverse(); // da direita (menos prioritário) para esquerda
    // Restaurar todos os grupos antes de medir
    groups.forEach((g: any) => (g.style.display = ''));
    overflowDd.innerHTML = '';
    // Medir: largura dos grupos permanentes + dividers + spacer + collapse-btn
    const _spacer = panel.querySelector('.toolbar-spacer');
    const collapseBtn = (panel.querySelector('.toolbar-collapse-btn')) as any;
    const panelWidth = panel.clientWidth;
    // Disponível = largura do panel menos spacer (min 8px) e collapse-btn
    const _reservedWidth = (collapseBtn?.offsetWidth ?? 34) + 24; // 24px = margin spacer
    /** @type {string[]} */
    const overflow = [];
    // Força layout para medir scrollWidth real após restaurar todos os grupos
    requestAnimationFrame(() => {
        const overflowing = panel.scrollWidth > panelWidth + 2;
        if (!overflowing) {
            // Tudo cabe - mostrar apenas o trigger original do "Mais" (sem overflow indicator)
            if (moreTrigger) (moreTrigger as any).dataset.overflow = 'false';
            return;
        }
        // Seções permanentes + itens SOLTOS do dd-more no TOPO do overflow.
        // REF-SWEEPS-001#overflow-perde-item-solto: antes clonávamos só
        // .toolbar-dd-section e .toolbar-dropdown-divider, mas itens soltos
        // (filhos diretos do #dd-more antes do primeiro <hr>, fora de qualquer
        // seção — ex: handleOpenPaletteAccess) ficavam de fora e sumiam do
        // menu "Mais" em larguras estreitas. Agora clonamos os 3 tipos em
        // ordem DOM-preservativa para manter a hierarquia visual.
        const sourceDdMore = document.getElementById('dd-more');
        if (sourceDdMore) {
            // `:scope >` = filhos DIRETOS. Sem ele, querySelectorAll devolvia a
            // seção E, de novo, cada item de dentro dela — cada item dentro de
            // seção aparecia DUAS vezes no overflow (uma na seção clonada, outra
            // solta no topo) e com o mesmo id. A hierarquia continua preservada:
            // os itens de uma seção vêm dentro do clone profundo da seção.
            sourceDdMore
                .querySelectorAll(
                    ':scope > .toolbar-dd-section, :scope > .toolbar-dropdown-divider, :scope > .toolbar-dropdown-item',
                )
                .forEach((/** @type {any} */ el) => {
                    const isItem = el.classList?.contains('toolbar-dropdown-item');
                    const clone = isItem ? _asOverflowItem(el) : ((el.cloneNode(true)) as any);
                    if (!isItem) {
                        // Seção clonada: ids internos precisam sumir (duplicariam
                        // os do #dd-more) e os itens ficam fora da ordem de tabulação.
                        clone.querySelectorAll?.('[id]').forEach((n: any) => n.removeAttribute('id'));
                        clone.querySelectorAll?.('.toolbar-dropdown-item').forEach((n: any) => {
                            n.tabIndex = -1;
                        });
                    }
                    overflowDd.appendChild(clone);
                });
            const sep = document.createElement('hr');
            sep.className = 'toolbar-dropdown-divider';
            overflowDd.appendChild(sep);
        }
        // Colapsar grupos da direita até caber
        for (const _g of groups) {
            const g = (_g) as any;
            if (PINNED_GROUPS.has(g.id)) continue;
            if (panel.scrollWidth <= panelWidth + 2) break;
            const groupLabel = g.querySelector('.toolbar-group-label')?.textContent?.trim() || '';
            const { section: groupSection, body: groupBody } = _makeOverflowSection(groupLabel, 'overflow-' + g.id);
            // Clonar botões diretos do grupo (não os dropdowns internos)
            g.querySelectorAll(
                ':scope > .toolbar-btn:not(.toolbar-dropdown-trigger), :scope > .toolbar-split-btn',
            ).forEach((btn: any) => {
                const origBtn = (btn.classList.contains('toolbar-split-btn')
                        ? btn.querySelector('.toolbar-btn:not(.toolbar-dropdown-trigger)')
                        : btn) as any;
                const source = origBtn || btn;
                const item = _asOverflowItem(source);
                // `onclick` atribuído por PROPRIEDADE (não atributo) não vem no
                // clone — os poucos casos que ainda usam essa forma continuam vivos.
                if (origBtn?.onclick) item.onclick = origBtn.onclick;
                groupBody.appendChild(item);
            });
            // Clonar botões dropdown-trigger do grupo como sub-seções
            g.querySelectorAll(':scope > .toolbar-dropdown-trigger').forEach((trigger: any) => {
                const ddId = trigger.dataset.dropdown || '';
                const sourceDd = ddId ? document.getElementById(ddId) : null;
                if (!sourceDd) return;
                // :scope > span:not(.icon) - pega apenas filho direto do trigger.
                // Sem :scope, querySelector varre descendentes e encontra o .eco-icon
                // que hydrateIcons injeta dentro do .icon (wrapper do SVG).
                // Fallback: aria-label ou title (triggers com só ícones não têm label span).
                const subLabel =
                    trigger.querySelector(':scope > span:not(.icon)')?.textContent?.trim() ||
                    trigger.getAttribute('aria-label')?.trim() ||
                    trigger.getAttribute('title')?.trim() ||
                    '';
                // Sem rótulo: flatten - adiciona itens direto no body do grupo pai, sem sub-seção
                if (!subLabel) {
                    sourceDd.querySelectorAll('.toolbar-dropdown-item').forEach((item: any) => {
                        groupBody.appendChild(_asOverflowItem(item));
                    });
                    return;
                }
                const { section: subSection, body: subBody } = _makeOverflowSection(
                    subLabel,
                    'overflow-' + g.id + '-' + ddId,
                );
                sourceDd.querySelectorAll('.toolbar-dropdown-item').forEach((item: any) => {
                    subBody.appendChild(_asOverflowItem(item));
                });
                groupBody.appendChild(subSection);
            });
            overflowDd.appendChild(groupSection);
            g.style.display = 'none';
            overflow.push(g.id);
        }
        // Mostrar indicador no botão "Mais" quando há overflow
        if (overflow.length > 0) {
            // Trigger aponta para overflow dropdown
            if (moreTrigger) (moreTrigger as any).dataset.dropdown = 'dd-overflow';
            if (moreTrigger) (moreTrigger as any).dataset.overflow = 'true';
        } else {
            // Sem overflow - trigger aponta para dd-more normal
            if (moreTrigger) (moreTrigger as any).dataset.dropdown = 'dd-more';
            if (moreTrigger) (moreTrigger as any).dataset.overflow = 'false';
        }
        // Garantir que os ícones data-icon nos novos elementos sejam renderizados
        if (typeof window.hydrateIcons === 'function') window.hydrateIcons(overflowDd);
    });
}
/**
 * Recalcula layout visual da ribbon (setas + overflow/"Mais").
 * Deve ser chamado sempre que a ribbon volta a ficar visivel apos estar oculta.
 */
export function refreshRibbonLayout() {
    updateScrollArrows();
    updateOverflow();
}
export function initRibbon() {
    const mainPanel = document.getElementById('ribbon-main');
    const editPanel = document.getElementById('ribbon-edit');
    if (mainPanel) {
        mainPanel.style.display = 'flex';
        mainPanel.dataset.active = 'true';
    }
    if (editPanel) {
        editPanel.style.display = 'none';
        editPanel.removeAttribute('data-active');
    }
    injectScrollArrows();
    // BUG-RIBBON-OVERFLOW-INVISIVEL (Calvin, 2026-08-06): "a opção de rolar
    // para chegar em Mais nem aparece na UI". O ribbon inicializa enquanto o
    // #toolbar está OCULTO (a landing é `#app.view-group-actions`, que o
    // esconde), então o layout inicial mede scrollWidth=0/clientWidth=0,
    // updateScrollArrows conclui "não transborda" e some com as setas. Ao
    // trocar para a view Model o toolbar aparece — mas NADA remede: não há
    // resize e o rAF do init já passou. Resultado: ribbon cortado à direita,
    // sem seta e sem rota até o "Mais". ResizeObserver cobre a transição
    // 0→N (e qualquer mudança futura de largura, inclusive colapso de seção).
    if (typeof ResizeObserver === 'function') {
        const alvo = document.getElementById('toolbar');
        if (alvo) new ResizeObserver(() => refreshRibbonLayout()).observe(alvo);
    }
    initDropdowns();
    refreshLibGallery();
    window.refreshLibGallery = refreshLibGallery;
    window.addEventListener('librariesChanged', refreshLibGallery);
    document.querySelectorAll('.ribbon-panel').forEach((panel: any) => {
        panel.addEventListener('scroll', updateScrollArrows, { passive: true });
    });
    // Overflow inicial + ao redimensionar
    requestAnimationFrame(refreshRibbonLayout);
    window.addEventListener('resize', () => {
        refreshRibbonLayout();
        const openDd = (document.querySelector('.toolbar-dropdown.open')) as any;
        if (openDd) {
            const trigger = (document.querySelector(`[data-dropdown="${openDd.id}"]`)) as any;
            if (trigger) positionDropdown(openDd, trigger);
        }
    });
}
