// @ts-check
// Generated from src/app/js/utils/ui/commandPalette.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   COMMAND PALETTE — Pesquisa Global de Comandos
   ================================================================
   
   Inspirado no VS Code (Ctrl+Shift+P), permite buscar e executar
   comandos rapidamente via modal central.
   
   Uso:
   - Pressionar Ctrl+Shift+P (ou Cmd+Shift+P no Mac)
   - Ou clicar em "Mais" → "Pesquisar"
   - Digitar para filtrar comandos
   - Enter para executar
   
   ================================================================ */
import { createLogger } from '../helpers/logger.js';
import { t, getCurrentLanguage } from '../i18n/translations.js';
// TD-8 (friendliness/cognitive): organização pura da visão inicial. Sem query,
// agrupamos por categoria (N seções colapsáveis) em vez de uma lista plana de
// centenas de itens — reduzindo a carga cognitiva. Busca/ranking preservados.
import { selectInitialView, rankCommands } from './_commandPaletteOrganizePure.js';
const log = createLogger('CommandPalette');
const STORAGE_KEY = 'ecbyts-command-palette-recent';
const MAX_RECENT = 10;
const MAX_RESULTS = 10;
// Acima deste total, a visão inicial (sem query) vira AGRUPADA por categoria.
const MAX_FLAT_INITIAL = 30;
// Registro de comandos
const commands: any[] = [];
let recentCommandIds: string[] = [];
/** @type {any} */
let _customFilter: any = null;
// Estado do modal
let isOpen = false;
let selectedIndex = 0;
let filteredCommands: any[] = [];
// Seções para render (header de categoria + items). Cada item mapeia para um
// índice em `filteredCommands` (ordem de display = ordem navegável por teclado).
let renderSections: { category: string; items: any[] }[] = [];
let searchQuery = '';
// Elementos DOM
let modalEl: HTMLElement | null = null;
let inputEl: HTMLInputElement | null = null;
let listEl: HTMLElement | null = null;
let overlayEl: HTMLElement | null = null;
let initialized = false;
/**
 * Inicializa o command palette
 * Carrega histórico recente do localStorage
 */
export function initCommandPalette() {
    // IDEMPOTENTE (R-OPEN BUG 1, 2026-08-06): registerAllHandlers é re-invocado
    // a cada clique em [data-handler] sem função registrada (deferred-handler-guard
    // → ensureAllHandlersRegistered → registerAllHandlersImpl). Sem esta guarda,
    // CADA clique re-executava initCommandPalette → createModal anexava um novo
    // par overlay+modal (DOM duplicado medido: 2→3→4) e registerKeyboardShortcut
    // empilhava um listener extra de keydown (toggle duplo = paleta "morta").
    if (initialized) return;
    loadRecentCommands();
    createModal();
    registerKeyboardShortcut();
    log.debug('Command palette initialized');
}
/**
 * Registra um comando na paleta
 * @param {Object} command - Configuração do comando
 * @param {string} command.id - ID único do comando
 * @param {string} command.label - Label em inglês
 * @param {string} command.label_pt - Label em português (opcional)
 * @param {string} command.category - Categoria do comando
 * @param {string} command.icon - Nome do ícone (opcional)
 * @param {Function} command.handler - Função a ser executada
 * @param {string[]} command.keywords - Palavras-chave para busca (opcional)
 */
export function registerCommand(command: any) {
    if (!command.id || !command.label || !command.handler) {
        log.error('Command must have id, label, and handler:', command);
        return;
    }
    // Evitar duplicatas
    const existingIndex = commands.findIndex((c: any) => c.id === command.id);
    if (existingIndex >= 0) {
        commands[existingIndex] = { ...command };
    } else {
        commands.push({ ...command });
    }
}
/**
 * Registra múltiplos comandos de uma vez
 * @param {Object[]} commandsArray - Array de comandos
 */
export function registerCommands(commandsArray: any[]) {
    commandsArray.forEach((cmd: any) => registerCommand(cmd));
}
/**
 * Registers external commands from other modules.
 * Permite que modulos externos adicionem comandos a paleta.
 *
 * @param {Object[]} externalCommands - Array of command objects
 * @returns {number} Number of commands successfully registered
 */
export function registerExternalCommands(externalCommands: any[]) {
    if (!Array.isArray(externalCommands)) {
        log.error('registerExternalCommands expects an array');
        return 0;
    }
    let count = 0;
    for (const cmd of externalCommands) {
        if (cmd && cmd.id && cmd.label && typeof cmd.handler === 'function') {
            registerCommand(cmd);
            count++;
        } else {
            log.warn('Skipping invalid external command:', cmd?.id);
        }
    }
    log.debug(`Registered ${count} external commands`);
    return count;
}
/**
 * Sets a custom filter function for context-sensitive commands.
 * O filtro e aplicado apos a busca por texto.
 *
 * @param {Function|null} filterFn - Filter function (cmd: any) => boolean, or null to clear
 */
export function setCommandFilter(filterFn: any) {
    if (filterFn !== null && typeof filterFn !== 'function') {
        log.error('setCommandFilter expects a function or null');
        return;
    }
    _customFilter = filterFn;
    log.debug('Command filter', filterFn ? 'set' : 'cleared');
}
/**
 * Returns the current custom filter function (for testing).
 * @returns {Function|null}
 */
export function getCommandFilter() {
    return _customFilter;
}
/**
 * Busca comandos por termo de pesquisa
 * @param {string} query - Termo de busca
 * @returns {Object[]} Comandos filtrados e ordenados
 */
export function searchCommands(query: string) {
    if (!query || query.trim() === '') {
        // Retorna comandos recentes quando nao ha busca
        const recent = getRecentCommands().slice(0, MAX_RESULTS);
        return _customFilter ? recent.filter(_customFilter) : recent;
    }
    const normalizedQuery = normalizeText(query);
    const pool = _customFilter ? commands.filter(_customFilter) : commands;
    const results = pool
        .map((cmd: any) => {
            const label = getCommandLabel(cmd);
            const normalizedLabel = normalizeText(label);
            const keywords = cmd.keywords || [];
            // Calcular score de relevância
            let score = 0;
            // Match exato no label
            if (normalizedLabel === normalizedQuery) {
                score += 100;
            }
            // Match no início do label
            else if (normalizedLabel.startsWith(normalizedQuery)) {
                score += 50;
            }
            // Match no meio do label
            else if (normalizedLabel.includes(normalizedQuery)) {
                score += 30;
            }
            // Match em keywords
            const keywordMatch = keywords.some((kw: any) => normalizeText(kw).includes(normalizedQuery));
            if (keywordMatch) {
                score += 20;
            }
            // Boost para comandos recentes
            if (recentCommandIds.includes(cmd.id)) {
                score += 10;
            }
            return { cmd, score };
        })
        .filter(({ score }: any) => score > 0)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, MAX_RESULTS)
        .map(({ cmd }: any) => cmd);
    return results;
}
/**
 * Abre o modal do command palette
 */
export function openCommandPalette() {
    if (isOpen) return;
    // Verificar se o modal foi inicializado, caso contrário criar lazy
    if (!initialized) {
        createModal();
    }
    isOpen = true;
    searchQuery = '';
    selectedIndex = 0;
    if (modalEl && overlayEl) {
        const modal = modalEl;
        const overlay = overlayEl;
        // Reset input
        if (inputEl) {
            inputEl.value = '';
            inputEl.setAttribute('aria-expanded', 'true');
            inputEl.focus();
        }
        // Mostrar comandos recentes inicialmente
        updateResults();
        // BOOT-RESILIENCE: adicionar .open SÍNCRONO — o rAF (frame callback) não
        // dispara em abas throttled/background, o que deixava a paleta "morta"
        // (overlay no DOM mas sem a classe .open que o CSS usa p/ exibir).
        modal.classList.add('open');
        overlay.classList.add('open');
    } else {
        log.error('Modal elements not found');
        // Tentar criar novamente
        createModal();
        if (modalEl && overlayEl) {
            /** @type {HTMLElement} */ (modalEl).classList.add('open');
            /** @type {HTMLElement} */ (overlayEl).classList.add('open');
        }
    }
    log.debug('Command palette opened');
}
/**
 * Fecha o modal do command palette
 */
export function closeCommandPalette() {
    if (!isOpen) return;
    isOpen = false;
    if (inputEl) {
        inputEl.setAttribute('aria-expanded', 'false');
        inputEl.setAttribute('aria-activedescendant', '');
    }
    if (modalEl && overlayEl) {
        const modal = modalEl;
        const overlay = overlayEl;
        modal.classList.remove('open');
        overlay.classList.remove('open');
        // Não usar inline styles - deixar o CSS controlar o display
        // O CSS já define display: none quando a classe .open é removida
        // Apenas aguardar a transição antes de esconder completamente
        setTimeout(() => {
            // Verificar se ainda está fechado (pode ter sido reaberto durante a transição)
            if (!isOpen) {
                // Garantir que as classes .open foram removidas
                modal.classList.remove('open');
                overlay.classList.remove('open');
            }
        }, 200);
    }
    log.debug('Command palette closed');
}
/**
 * Alterna visibilidade do command palette
 */
export function toggleCommandPalette() {
    if (isOpen) {
        closeCommandPalette();
    } else {
        openCommandPalette();
    }
}
/**
 * Executa um comando pelo ID
 * @param {string} commandId - ID do comando
 */
export function executeCommand( commandId: any) {
    const command = commands.find((c: any) => c.id === commandId);
    if (!command) {
        log.error('Command not found:', commandId);
        return;
    }
    try {
        // Fechar modal antes de executar
        closeCommandPalette();
        // Executar handler
        command.handler();
        // Adicionar ao histórico
        addToRecent(commandId);
        log.debug('Command executed:', commandId);
    } catch (error: any) {
        log.error('Error executing command:', commandId, error);
        // Mostrar toast de erro se disponível
        const w = (window) as any;
        if (w.showToast) {
            w.showToast('Erro ao executar comando', 'error');
        }
    }
}
/**
 * Retorna comandos recentes
 * @returns {Object[]} Lista de comandos recentes
 */
export function getRecentCommands() {
    if (recentCommandIds.length === 0) {
        return commands.slice(0, MAX_RESULTS);
    }
    const recent = recentCommandIds.map((id: any) => commands.find((c: any) => c.id === id)).filter(Boolean);
    // Completar com comandos populares se necessário
    const remaining = MAX_RESULTS - recent.length;
    if (remaining > 0) {
        const usedIds = new Set(recentCommandIds);
        const popular = commands.filter((c: any) => !usedIds.has(c.id)).slice(0, remaining);
        return [...recent, ...popular];
    }
    return recent;
}
// ============================================
// Funções internas
// ============================================
function normalizeText(text: any) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .trim();
}
function getCommandLabel(command: any) {
    const lang = getCurrentLanguage ? getCurrentLanguage() : 'pt';
    if (lang === 'pt' && command.label_pt) {
        return command.label_pt;
    }
    return command.label;
}
function addToRecent(commandId: any) {
    // Remover se já existe
    recentCommandIds = recentCommandIds.filter((id: any) => id !== commandId);
    // Adicionar no início
    recentCommandIds.unshift(commandId);
    // Limitar tamanho
    recentCommandIds = recentCommandIds.slice(0, MAX_RECENT);
    // Salvar
    saveRecentCommands();
}
function loadRecentCommands() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY) || '';
        if (stored) {
            recentCommandIds = JSON.parse(stored);
        }
    } catch (error: any) {
        log.error('Failed to load recent commands:', error);
        recentCommandIds = [];
    }
}
function saveRecentCommands() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(recentCommandIds));
    } catch (error: any) {
        log.error('Failed to save recent commands:', error);
    }
}
function createModal() {
    // IDEMPOTENTE + auto-cura (R-OPEN BUG 1): se um par overlay+modal já existe
    // no DOM (desta ou de outra invocação), reutiliza/remove antes de criar —
    // nunca acumula instâncias duplicadas de #command-palette-modal.
    const staleOverlay = document.getElementById('command-palette-overlay');
    const staleModal = document.getElementById('command-palette-modal');
    if (initialized && modalEl && staleModal === modalEl && staleOverlay === overlayEl) return;
    if (staleOverlay && staleOverlay.parentNode) staleOverlay.parentNode.removeChild(staleOverlay);
    if (staleModal && staleModal.parentNode) staleModal.parentNode.removeChild(staleModal);
    // Criar overlay
    overlayEl = document.createElement('div');
    overlayEl.id = 'command-palette-overlay';
    overlayEl.className = 'command-palette-overlay';
    overlayEl.style.display = 'none';
    overlayEl.addEventListener('click', closeCommandPalette);
    document.body.appendChild(overlayEl);
    // Criar modal
    modalEl = document.createElement('div');
    modalEl.id = 'command-palette-modal';
    modalEl.className = 'command-palette-modal';
    modalEl.style.display = 'none';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.setAttribute('aria-label', 'Pesquisar comandos');
    // HTML interno
    modalEl.innerHTML = `
        <div class="command-palette-header">
            <span class="command-palette-search-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
            </span>
            <input type="text"
                   class="command-palette-input"
                   id="command-palette-input"
                   name="command-palette-input"
                   role="combobox"
                   aria-expanded="false"
                   aria-controls="command-palette-list"
                   aria-autocomplete="list"
                   aria-haspopup="listbox"
                   aria-activedescendant=""
                   aria-label="${t('commandPalettePlaceholder') || 'Digite um comando...'}"
                   placeholder="${t('commandPalettePlaceholder') || 'Digite um comando...'}"
                   autocomplete="off"
                   spellcheck="false">
            <span class="command-palette-shortcut-hint" aria-hidden="true">${getShortcutHint()}</span>
        </div>
        <div class="command-palette-list" id="command-palette-list" role="listbox" aria-label="${t('commandPalettePlaceholder') || 'Digite um comando...'}"></div>
        <div class="command-palette-footer">
            <span>${t('commandPaletteFooter') || '↑↓ navegar • Enter executar • Esc fechar'}</span>
        </div>
    `;
    document.body.appendChild(modalEl);
    // Referências
    inputEl = modalEl.querySelector('.command-palette-input');
    listEl = modalEl.querySelector('.command-palette-list');
    if (!inputEl || !listEl) return;
    // Event listeners
    inputEl.addEventListener('input', handleInput);
    inputEl.addEventListener('keydown', handleKeyDown);
    initialized = true;
    log.debug('Modal created');
}
function getShortcutHint() {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    return isMac ? '⌘⇧P' : 'Ctrl+Shift+P';
}
function registerKeyboardShortcut() {
    document.addEventListener('keydown', (e: any) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modifier = isMac ? e.metaKey : e.ctrlKey;
        // e.key.toLowerCase() porque Shift modifica casing: Ctrl+Shift+P emite e.key='P'
        // (uppercase). Bug identificado no v14ui capture 2026-04-19.
        const keyLower = (e.key || '').toLowerCase();
        if (modifier && e.shiftKey && keyLower === 'p') {
            e.preventDefault();
            toggleCommandPalette();
        }
        // Ctrl+K / Cmd+K - global search (SPEC_HOME_REDESIGN_3COL §2 Should Have)
        if (modifier && !e.shiftKey && keyLower === 'k') {
            e.preventDefault();
            toggleCommandPalette();
        }
        // Escape para fechar
        if (e.key === 'Escape' && isOpen) {
            e.preventDefault();
            closeCommandPalette();
        }
    });
}
function handleInput(e: any) {
    searchQuery = e.target.value;
    selectedIndex = 0;
    updateResults();
}
function handleKeyDown(e: any) {
    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
            updateSelection();
            break;
        case 'ArrowUp':
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelection();
            break;
        case 'Enter':
            e.preventDefault();
            if (filteredCommands[selectedIndex]) {
                executeCommand(filteredCommands[selectedIndex].id);
            }
            break;
        case 'Escape':
            e.preventDefault();
            closeCommandPalette();
            break;
    }
}
/**
 * Recalcula `renderSections` (visão a renderizar) e `filteredCommands` (lista
 * plana navegável por teclado, na MESMA ordem do display).
 *
 * TD-8: sem query e com muitos comandos, a visão é AGRUPADA por categoria
 * (reduz carga cognitiva); senão é plana. Com query, lista plana ranqueada por
 * relevância (comportamento de busca preservado). `filteredCommands` é sempre a
 * concatenação dos items das seções, então setas/Enter e data-index continuam
 * apontando para o item certo.
 */
function updateResults() {
    const query = (searchQuery || '').trim();
    // Aplica o filtro contextual (setCommandFilter) antes de organizar.
    const pool = _customFilter ? commands.filter(_customFilter) : commands;
    const getLabel = (cmd: any) => getCommandLabel(cmd);
    if (query) {
        // COM query: lista plana ranqueada (exact-id > startsWith > includes).
        const sections = rankCommands(pool, { query, recentIds: recentCommandIds, getLabel });
        renderSections = sections.map((s) => ({ category: s.category, items: [...s.items] }));
    } else {
        // SEM query: visão inicial (flat se poucos, agrupada se muitos).
        const view = selectInitialView(pool, {
            recentIds: recentCommandIds,
            maxFlat: MAX_FLAT_INITIAL,
            getLabel,
        });
        renderSections = view.sections.map((s) => ({ category: s.category, items: [...s.items] }));
    }
    // Lista plana navegável = concat dos items na ordem de display.
    filteredCommands = renderSections.reduce((acc: any[], s) => acc.concat(s.items), []);
    renderList();
}
/**
 * A11y: mantém o `aria-activedescendant` do input (role=combobox) apontando para
 * o id do option atualmente selecionado, permitindo a leitores de tela anunciar
 * a opção ativa sem mover o foco do DOM. Vazio quando não há opção selecionada.
 */
function updateActiveDescendant() {
    if (!inputEl) return;
    if (filteredCommands.length > 0 && selectedIndex >= 0 && selectedIndex < filteredCommands.length) {
        inputEl.setAttribute('aria-activedescendant', `command-palette-option-${selectedIndex}`);
    } else {
        inputEl.setAttribute('aria-activedescendant', '');
    }
}
/**
 * HTML de UM item. `index` é o índice GLOBAL na lista plana navegável
 * (`filteredCommands`) — mantém data-index/option-id alinhados com a navegação
 * por teclado, mesmo quando os itens estão distribuídos em seções.
 */
function renderItem(cmd: any, index: number) {
    const label = getCommandLabel(cmd);
    const isSelected = index === selectedIndex;
    const icon = cmd.icon || 'command';
    return `
            <div class="command-palette-item ${isSelected ? 'selected' : ''}"
                 id="command-palette-option-${index}"
                 role="option"
                 aria-selected="${isSelected}"
                 data-index="${index}"
                 data-cc-call-click="executePaletteCommand|s:${encodeURIComponent(`${cmd.id}`)}">
                <span class="command-palette-item-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${getIconSvg(icon)}
                    </svg>
                </span>
                <span class="command-palette-item-label">${escapeHtml(label)}</span>
                <span class="command-palette-item-category">${escapeHtml(cmd.category || '')}</span>
            </div>
        `;
}
function renderList() {
    if (!listEl) return;
    if (filteredCommands.length === 0) {
        listEl.innerHTML = `
            <div class="command-palette-empty">
                ${t('commandPaletteNoResults') || 'Nenhum comando encontrado'}
            </div>
        `;
        updateActiveDescendant();
        return;
    }
    // Mostra headers de categoria quando há agrupamento (mais de uma seção, ou
    // uma seção com categoria nomeada). Visão plana (1 seção sem categoria) =
    // render headerless idêntico ao comportamento anterior.
    const showHeaders = renderSections.length > 1 || (renderSections[0] && !!renderSections[0].category);
    let runningIndex = 0;
    const html = renderSections
        .map((section) => {
            const itemsHtml = section.items.map((cmd) => renderItem(cmd, runningIndex++)).join('');
            if (showHeaders && section.category) {
                const headerId = `command-palette-group-${encodeURIComponent(section.category)}`;
                return `
            <div class="command-palette-group" role="group" aria-labelledby="${headerId}">
                <div class="command-palette-group-header" id="${headerId}" role="presentation">${escapeHtml(section.category)}</div>
                ${itemsHtml}
            </div>`;
            }
            return itemsHtml;
        })
        .join('');
    listEl.innerHTML = html;
    updateActiveDescendant();
}
function updateSelection() {
    if (!listEl) return;
    const items = listEl.querySelectorAll('.command-palette-item');
    items.forEach((item: any, index: number) => {
        item.classList.toggle('selected', index === selectedIndex);
        item.setAttribute('aria-selected', index === selectedIndex);
    });
    updateActiveDescendant();
    // Scroll into view se necessário
    const selectedItem = items[selectedIndex];
    if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
    }
}
function getIconSvg(iconName: any) {
    // Mapeamento simples de ícones
    const icons: Record<string, string> = {
        command:
            '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>',
        wind: '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>',
        circle: '<circle cx="12" cy="12" r="10"/>',
        droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
        activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
        flask: '<path d="M10 2v7.31"/><path d="M14 2v7.31"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/>',
        home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
        box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
        square: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>',
        'map-pin': '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
        layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
        'alert-triangle':
            '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
        cube: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
        camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
        clipboard:
            '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
        database:
            '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
        grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
        upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
        map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
        radio: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>',
        folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
        'maximize-2':
            '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
        'bar-chart':
            '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
        'bar-chart-2':
            '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
        'refresh-cw':
            '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
        'trending-down': '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        compass:
            '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
        cpu: '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
        info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
        'book-open':
            '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
        bug: '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="m2 8 2 2 2-2"/><path d="m18 8 2 2 2-2"/><path d="m2 16 2-2 2 2"/><path d="m18 16 2-2 2 2"/>',
        layout: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
        sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
        moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
        monitor:
            '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
        printer:
            '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
        'git-merge': '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
        store: '<path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M9 21V9"/>',
        package:
            '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
        download:
            '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
        sliders:
            '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
        tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
        settings:
            '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        braces: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
        palette:
            '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.01 17.461 2 12 2z"/>',
        tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
        target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
        triangle:
            '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
        'file-text':
            '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
        'dollar-sign':
            '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
        calculator:
            '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="16" y1="18" x2="16" y2="18"/><line x1="12" y1="18" x2="12" y2="18"/><line x1="8" y1="18" x2="8" y2="18"/>',
        hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
        'check-square':
            '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
        'edit-3': '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
        trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
        shuffle:
            '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
    };
    return icons[String(iconName)] || icons['command'];
}
function escapeHtml(text: any) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
// Expor função global para onclick
/** @type {any} */ (window).executePaletteCommand = executeCommand;
/** @type {any} */ (window).openCommandPalette = openCommandPalette;
/** @type {any} */ (window).toggleCommandPalette = toggleCommandPalette;
// FIAÇÃO DO MENU (R-OPEN BUG 1, 2026-08-06): o botão "Mais → Paleta de Comandos"
// e o #palette-toggle-btn do HUD usam data-handler="handleOpenPaletteAccess".
// Até aqui esse handler só nascia em commandPaletteAccess.ts — um bootstrap
// OPCIONAL/lazy (scheduleOptionalUiBootstrapsLazy) que em boot degradado (modo
// convidado/watchdog) NUNCA carrega → clique morto sem feedback. O dono da
// paleta registra o fallback determinístico AQUI, no load do módulo (estático
// via handlers/index.ts em ambos os builds). commandPaletteAccess respeita este
// registro (só assina se ainda não houver função) e o comportamento é o mesmo:
// ABRIR (não toggle).
if (typeof (window as any).handleOpenPaletteAccess !== 'function') {
    (window as any).handleOpenPaletteAccess = openCommandPalette;
}
