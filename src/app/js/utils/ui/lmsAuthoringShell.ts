// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LMS AUTHORING SHELL — F3 shell minimalista (4 regiões)

   Spec: docs/specs/features/SPEC_LMS_MINIMALIST_AUTHORING_EXPERIENCE.md
   Design: docs/reports/fleet-prep/round2/LMS-MINIMALIST-2-shell-design.md

   Layout familiar (PowerPoint/Figma/Canva):
   - Topo: faixa recolhível com abas (RF2: full/tabs/hidden)
   - Esquerda: navegação de slides/lições (RF4)
   - Centro: canvas/palco da aula (RF1)
   - Direita: inspector contextual (RF3: sem seleção → próximo passo;
     com seleção → só propriedades do item)
   - Rodapé discreto: status + "Mais" (RF7)

   CSS: 100% design-tokens, ZERO hex hardcoded.
   ================================================================ */

import { escapeHtml, escapeAttr } from '../helpers/html.js';

export type TopbarCollapse = 'full' | 'tabs' | 'hidden';
export type ShellTab = 'slides' | 'palco' | 'propriedades';

export interface ShellState {
    topbarCollapse: TopbarCollapse;
    selectedTab: ShellTab;
    rightPanelOpen: boolean;
}

export interface ShellTopbarOptions {
    title: string;
    collapse: TopbarCollapse;
    selectedTab: ShellTab;
}

export interface ShellStatusbarOptions {
    statusText: string;
    statusTone: 'saved' | 'dirty' | 'error';
}

const STORAGE_KEY = 'lms-author-shell-prefs';

export function defaultShellState(): ShellState {
    return { topbarCollapse: 'full', selectedTab: 'slides', rightPanelOpen: true };
}

export function loadShellState(): ShellState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultShellState();
        const parsed = JSON.parse(raw);
        const base = defaultShellState();
        if (parsed && typeof parsed === 'object') {
            if (parsed.topbarCollapse === 'full' || parsed.topbarCollapse === 'tabs' || parsed.topbarCollapse === 'hidden') {
                base.topbarCollapse = parsed.topbarCollapse;
            }
            if (parsed.selectedTab === 'slides' || parsed.selectedTab === 'palco' || parsed.selectedTab === 'propriedades') {
                base.selectedTab = parsed.selectedTab;
            }
            if (typeof parsed.rightPanelOpen === 'boolean') {
                base.rightPanelOpen = parsed.rightPanelOpen;
            }
        }
        return base;
    } catch (e: any) {
        console.debug('[lmsAuthoringShell] loadShellState:', e?.message || e);
        return defaultShellState();
    }
}

export function persistShellState(state: ShellState): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e: any) {
        console.debug('[lmsAuthoringShell] persistShellState:', e?.message || e);
    }
}

export function nextCollapseState(current: TopbarCollapse): TopbarCollapse {
    if (current === 'full') return 'tabs';
    if (current === 'tabs') return 'hidden';
    return 'full';
}

export function renderShellTopbar(options: ShellTopbarOptions): string {
    const { title, collapse, selectedTab } = options;
    const expanded = collapse === 'full';
    const tabs: Array<{ id: ShellTab; label: string; controls: string }> = [
        { id: 'slides', label: 'Slides', controls: 'lms-shell-left' },
        { id: 'palco', label: 'Palco', controls: 'lms-shell-center' },
        { id: 'propriedades', label: 'Propriedades', controls: 'lms-shell-right' },
    ];
    const tabButtons = tabs
        .map(
            (tab) =>
                `<button role="tab" aria-selected="${tab.id === selectedTab ? 'true' : 'false'}"
                    aria-controls="${escapeAttr(tab.controls)}"
                    data-shell-tab="${escapeAttr(tab.id)}"
                    tabindex="${tab.id === selectedTab ? '0' : '-1'}">${escapeHtml(tab.label)}</button>`,
        )
        .join('');
    return `
        <header class="lms-shell__topbar" role="toolbar" aria-label="${escapeAttr('Barra da aula')}">
            <div class="lms-shell__topbar-meta">
                <button class="lms-shell__topbar-toggle" type="button"
                    data-action="topbar-collapse"
                    aria-expanded="${expanded ? 'true' : 'false'}"
                    aria-controls="lms-shell-topbar-tabs"
                    aria-label="${escapeAttr(expanded ? 'Recolher faixa superior' : 'Expandir faixa superior')}">&#8963;</button>
                <h3 class="ecbt-title lms-shell__title" id="lms-author-title">${escapeHtml(title)}</h3>
            </div>
            <div class="lms-shell__topbar-actions">
                <button class="btn btn-secondary lms-author-save" type="button">Salvar</button>
                <button class="btn btn-primary lms-author-start-class" type="button">Apresentar</button>
                <button class="lms-shell__topbar-more" type="button" data-action="open-more"
                    aria-label="${escapeAttr('Mais ações')}">&#8942;</button>
            </div>
            <nav class="lms-shell__topbar-tabs" id="lms-shell-topbar-tabs"
                role="tablist" aria-label="${escapeAttr('Regiões da aula')}">
                ${tabButtons}
            </nav>
        </header>`;
}

export function renderShellLeft(innerHtml: string): string {
    return `
        <aside class="lms-shell__left" id="lms-shell-left" role="region"
            aria-label="${escapeAttr('Slides e lições do curso')}">
            ${innerHtml}
        </aside>`;
}

export function renderShellCenter(innerHtml: string): string {
    return `
        <main class="lms-shell__center" id="lms-shell-center" role="region"
            aria-label="${escapeAttr('Palco da aula')}">
            ${innerHtml}
        </main>`;
}

export function renderShellRight(innerHtml: string, hasSelection: boolean): string {
    const label = hasSelection ? 'Propriedades do item selecionado' : 'Próximo passo';
    return `
        <aside class="lms-shell__right" id="lms-shell-right" role="region"
            aria-label="${escapeAttr(label)}"
            data-contextual="${hasSelection ? 'selection' : 'guidance'}">
            ${innerHtml}
        </aside>`;
}

export function renderShellStatusbar(options: ShellStatusbarOptions): string {
    const { statusText, statusTone } = options;
    return `
        <footer class="lms-shell__statusbar" role="status" aria-live="polite" aria-atomic="true">
            <span class="lms-shell__status-dot" data-tone="${escapeAttr(statusTone)}">&#9679;</span>
            <span class="lms-shell__status-text">${escapeHtml(statusText)}</span>
            <details class="lms-shell__statusbar-more">
                <summary>Mais</summary>
                <div class="lms-shell__statusbar-menu" data-slot="more-actions"></div>
            </details>
        </footer>`;
}

export function renderShellTopbarPin(): string {
    return `
        <button class="lms-shell__topbar-pin" type="button" data-action="topbar-pin"
            aria-label="${escapeAttr('Fixar faixa superior novamente')}" hidden>&#128204;</button>`;
}

export function renderShellContainer(options: {
    mode: 'deck' | 'form' | 'start';
    state: ShellState;
    topbarHtml: string;
    workspaceHtml: string;
    statusbarHtml: string;
}): string {
    const { mode, state, topbarHtml, workspaceHtml, statusbarHtml } = options;
    return `
        <div class="ecbt-dialog ecbt-dialog--2xl lms-author lms-shell lms-shell--${escapeAttr(mode)}"
            role="application" tabindex="-1"
            aria-label="${escapeAttr('Editor de aula')}"
            data-topbar-collapse="${escapeAttr(state.topbarCollapse)}"
            data-selected-tab="${escapeAttr(state.selectedTab)}"
            data-right-panel-open="${state.rightPanelOpen ? 'true' : 'false'}">
            ${topbarHtml}
            ${workspaceHtml}
            ${statusbarHtml}
            ${renderShellTopbarPin()}
        </div>`;
}

export function renderShellWorkspace(leftHtml: string, centerHtml: string, rightHtml: string): string {
    return `
        <div class="lms-shell__workspace">
            ${renderShellLeft(leftHtml)}
            ${renderShellCenter(centerHtml)}
            ${renderShellRight(rightHtml, false)}
        </div>`;
}

export function applyTopbarCollapse(shell: HTMLElement, next: TopbarCollapse): void {
    shell.setAttribute('data-topbar-collapse', next);
    const toggle = shell.querySelector<HTMLButtonElement>('[data-action="topbar-collapse"]');
    if (toggle) {
        toggle.setAttribute('aria-expanded', next === 'full' ? 'true' : 'false');
        toggle.setAttribute('aria-label', next === 'full' ? 'Recolher faixa superior' : 'Expandir faixa superior');
    }
    const pin = shell.querySelector<HTMLButtonElement>('[data-action="topbar-pin"]');
    if (pin) pin.hidden = next !== 'hidden';
}

export function applySelectedTab(shell: HTMLElement, tab: ShellTab): void {
    shell.setAttribute('data-selected-tab', tab);
    const tabs = shell.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs.forEach((el) => {
        const isSelected = el.getAttribute('data-shell-tab') === tab;
        el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        el.setAttribute('tabindex', isSelected ? '0' : '-1');
    });
}

export function wireShellInteractions(shell: HTMLElement, state: ShellState, signal: AbortSignal): void {
    shell.addEventListener(
        'click',
        (e: MouseEvent) => {
            const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
            if (!target) return;
            const action = target.dataset.action;
            if (action === 'topbar-collapse') {
                state.topbarCollapse = nextCollapseState(state.topbarCollapse);
                applyTopbarCollapse(shell, state.topbarCollapse);
                persistShellState(state);
            } else if (action === 'topbar-pin') {
                state.topbarCollapse = 'full';
                applyTopbarCollapse(shell, state.topbarCollapse);
                persistShellState(state);
            }
        },
        { signal },
    );

    shell.addEventListener(
        'click',
        (e: MouseEvent) => {
            const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-shell-tab]');
            if (!tab) return;
            const id = tab.dataset.shellTab as ShellTab;
            if (id) {
                state.selectedTab = id;
                applySelectedTab(shell, id);
                persistShellState(state);
            }
        },
        { signal },
    );

    shell.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                state.topbarCollapse = nextCollapseState(state.topbarCollapse);
                applyTopbarCollapse(shell, state.topbarCollapse);
                persistShellState(state);
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                state.rightPanelOpen = !state.rightPanelOpen;
                shell.setAttribute('data-right-panel-open', state.rightPanelOpen ? 'true' : 'false');
                persistShellState(state);
            }
        },
        { signal },
    );
}

let _stylesInjected = false;

export function ensureShellStyles(): void {
    if (_stylesInjected || typeof document === 'undefined') return;
    _stylesInjected = true;
    const style = document.createElement('style');
    style.setAttribute('data-lms-shell-css', 'true');
    style.textContent = SHELL_CSS;
    document.head.appendChild(style);
}

const SHELL_CSS = `
.lms-shell {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: var(--space-2, 8px);
    width: var(--ecbt-modal-2xl, clamp(720px, 95vw, 1200px));
    max-height: var(--ecbt-modal-max-h, min(92vh, 920px));
    min-height: var(--ecbt-modal-min-h, clamp(280px, 40vh, 480px));
    background: var(--ecbt-surface-overlay, var(--window-dark-3));
    color: var(--text-primary);
    border-radius: var(--radius-xl, 8px);
    border: 1px solid var(--border-color);
    overflow: hidden;
}

.lms-shell__topbar {
    display: grid;
    grid-template-rows: auto auto;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px) var(--space-4, 16px);
    background: var(--ecbt-surface-base, var(--chrome-bg));
    border-bottom: 1px solid var(--border-color);
    min-height: clamp(48px, 6vh, 64px);
}

.lms-shell[data-topbar-collapse="tabs"] .lms-shell__topbar {
    min-height: auto;
    padding: var(--space-1, 4px) var(--space-4, 16px);
}
.lms-shell[data-topbar-collapse="tabs"] .lms-shell__topbar-meta { display: none; }

.lms-shell[data-topbar-collapse="hidden"] .lms-shell__topbar { display: none; }
.lms-shell[data-topbar-collapse="hidden"] .lms-shell__topbar-pin { display: block; }
.lms-shell__topbar-pin {
    display: none;
    position: absolute;
    top: var(--space-2, 8px);
    right: var(--space-2, 8px);
    z-index: 5;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md, 4px);
    border: 1px solid var(--border-color);
    background: var(--ecbt-surface-raised, var(--window-dark-2));
    color: var(--text-primary);
    cursor: pointer;
    font-size: var(--text-sm, 11px);
}

.lms-shell__topbar-meta,
.lms-shell__topbar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    min-width: 0;
}
.lms-shell__topbar-meta { justify-content: flex-start; }
.lms-shell__topbar-actions { justify-content: flex-end; }
.lms-shell__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
}

.lms-shell__topbar-toggle {
    width: 28px;
    height: 28px;
    min-width: 24px;
    min-height: 24px;
    border-radius: var(--radius-sm, 2px);
    border: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-sm, 11px);
    line-height: 1;
}
.lms-shell__topbar-toggle:hover {
    background: var(--ecbt-surface-sunken, var(--overlay-subtle));
}

.lms-shell__topbar-more {
    width: 28px;
    height: 28px;
    min-width: 24px;
    min-height: 24px;
    border-radius: var(--radius-sm, 2px);
    border: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-sm, 11px);
}
.lms-shell__topbar-more:hover {
    background: var(--ecbt-surface-sunken, var(--overlay-subtle));
}

.lms-shell__topbar-tabs {
    display: flex;
    gap: var(--space-1, 4px);
    border-top: 1px solid var(--border-color);
    padding-top: var(--space-1, 4px);
}
.lms-shell__topbar-tabs [role="tab"] {
    padding: var(--space-1, 4px) var(--space-3, 12px);
    border-radius: var(--radius-sm, 2px);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-xs, 10px);
    border: none;
    cursor: pointer;
    min-height: 28px;
}
.lms-shell__topbar-tabs [role="tab"]:hover {
    background: var(--ecbt-surface-sunken, var(--overlay-subtle));
}
.lms-shell__topbar-tabs [role="tab"][aria-selected="true"] {
    background: color-mix(in srgb, var(--accent-bright) 18%, transparent);
    color: var(--text-primary);
}

.lms-shell__workspace {
    display: grid;
    grid-template-columns: clamp(140px, 16vw, 220px) minmax(0, 1fr) clamp(240px, 24vw, 360px);
    gap: var(--space-2, 8px);
    min-height: 0;
    padding: 0 var(--space-3, 12px);
}

.lms-shell__left,
.lms-shell__right {
    background: var(--ecbt-surface-body, var(--window-dark));
    border-radius: var(--radius-lg, 6px);
    border: 1px solid var(--border-color);
    padding: var(--space-2, 8px);
    overflow-y: auto;
    min-width: 0;
}

.lms-shell__center {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px);
    min-width: 0;
    min-height: 0;
}

.lms-shell__statusbar {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-1, 4px) var(--space-4, 16px);
    background: var(--ecbt-surface-sunken, var(--overlay-subtle));
    border-top: 1px solid var(--border-color);
    min-height: clamp(32px, 4vh, 44px);
    font-size: var(--text-xs, 10px);
    color: var(--text-secondary);
}
.lms-shell__status-dot[data-tone="saved"] { color: var(--success); }
.lms-shell__status-dot[data-tone="dirty"] { color: var(--warning); }
.lms-shell__status-dot[data-tone="error"] { color: var(--error); }
.lms-shell__statusbar-more { margin-left: auto; }
.lms-shell__statusbar-more summary {
    cursor: pointer;
    color: var(--text-secondary);
    font-size: var(--text-xs, 10px);
}
.lms-shell__statusbar-menu {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
    padding: var(--space-2, 8px);
}

.lms-shell--start .lms-shell__workspace {
    grid-template-columns: 1fr;
}
.lms-shell--start .lms-shell__left,
.lms-shell--start .lms-shell__right {
    display: none;
}

@media (max-width: 1099px) {
    .lms-shell__workspace {
        grid-template-columns: clamp(140px, 16vw, 220px) minmax(0, 1fr);
    }
    .lms-shell__right {
        position: absolute;
        right: var(--space-2, 8px);
        top: clamp(48px, 6vh, 64px);
        bottom: clamp(32px, 4vh, 44px);
        width: min(360px, 80vw);
        transform: translateX(110%);
        transition: transform 0.2s ease;
        z-index: 5;
        box-shadow: -8px 0 24px var(--ecbt-surface-sunken, var(--overlay-subtle));
    }
    .lms-shell[data-right-panel-open="true"] .lms-shell__right {
        transform: translateX(0);
    }
}

@media (max-width: 767px) {
    .lms-shell__workspace { grid-template-columns: 1fr; }
    .lms-shell__left,
    .lms-shell__right { display: none; }
    .lms-shell[data-selected-tab="slides"] .lms-shell__left { display: block; }
    .lms-shell[data-selected-tab="propriedades"] .lms-shell__right { display: block; }
}
`;
