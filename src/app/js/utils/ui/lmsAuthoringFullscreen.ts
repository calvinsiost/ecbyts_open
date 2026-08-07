// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LMS AUTHORING — FULLSCREEN + ISOLAMENTO DE BACKGROUND (T3.7)

   Extraido de lmsAuthoringModal.ts (~185 LOC): tela cheia dos paineis do
   editor/apresentacao (botao .lms-author-fullscreen-toggle + Fullscreen API)
   e o isolamento de acessibilidade do fundo da pagina (inert + aria-hidden)
   enquanto o modal de autoria esta aberto. Sem dependencia de _state do
   editor — todo o estado necessario (stack de isolamento, timestamp do
   ultimo Esc) e privado a este modulo.
   ================================================================ */

import { escapeAttr, escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';

type AuthoringBackgroundIsolationEntry = {
    element: HTMLElement & { inert?: boolean };
    inert: boolean;
    inertAttr: string | null;
    ariaHidden: string | null;
};

let _authoringBackgroundIsolationStack: AuthoringBackgroundIsolationEntry[] = [];
let _lastFullscreenExitAt = 0;
const FULLSCREEN_ESCAPE_GRACE_MS = 800;

export function fullscreenLabel(active: boolean): string {
    return active ? 'Sair do painel expandido' : 'Expandir painel';
}

export function renderFullscreenButton(extraClass = ''): string {
    const label = fullscreenLabel(false);
    const classes = ['btn', 'btn-secondary', 'lms-author-fullscreen-toggle', extraClass].filter(Boolean).join(' ');
    return `<button class="${escapeAttr(classes)}" type="button"
        aria-pressed="false"
        aria-label="${escapeAttr(label)}"
        title="${escapeAttr('Expandir este painel (Esc para sair)')}">${escapeHtml(label)}</button>`;
}

function isFullscreenAvailable(target: Element | null): boolean {
    if (typeof document === 'undefined' || !target) return false;
    const request = (target as HTMLElement & { requestFullscreen?: (options?: FullscreenOptions) => Promise<void> }).requestFullscreen;
    return typeof request === 'function' && document.fullscreenEnabled !== false;
}

function fullscreenTargetForControl(button: HTMLElement, modalId: string): HTMLElement | null {
    return button.closest<HTMLElement>(`#${modalId}, #lms-author-preview-overlay`);
}

function isFullscreenTargetActive(target: HTMLElement | null): boolean {
    const fullscreenElement = typeof document === 'undefined' ? null : document.fullscreenElement;
    if (!target) return false;
    let matchesFullscreen: boolean;
    try {
        matchesFullscreen = target.matches(':fullscreen');
    } catch (error) {
        console.debug('[lmsAuthoringFullscreen] fullscreen selector check:', error);
        matchesFullscreen = false;
    }
    return matchesFullscreen || fullscreenElement === target || !!fullscreenElement?.contains(target);
}

function markFullscreenExit(): void {
    _lastFullscreenExitAt = Date.now();
}

function isRecentFullscreenExit(): boolean {
    return Date.now() - _lastFullscreenExitAt < FULLSCREEN_ESCAPE_GRACE_MS;
}

export function consumeFullscreenEscape(e: KeyboardEvent, target: HTMLElement | null): boolean {
    if (isFullscreenTargetActive(target)) {
        e.preventDefault();
        e.stopPropagation();
        markFullscreenExit();
        document.exitFullscreen?.().catch((err: any) =>
            console.debug('[lmsAuthoringFullscreen] escape-exit-fullscreen:', err?.message || err),
        );
        return true;
    }
    if (isRecentFullscreenExit()) {
        e.preventDefault();
        e.stopPropagation();
        return true;
    }
    return false;
}

export function syncFullscreenControls(modalId: string, root: ParentNode | null = document): void {
    if (!root) return;
    root.querySelectorAll<HTMLButtonElement>('.lms-author-fullscreen-toggle').forEach((button) => {
        const target = fullscreenTargetForControl(button, modalId);
        const active = isFullscreenTargetActive(target);
        const available = isFullscreenAvailable(target);
        const label = fullscreenLabel(active);
        button.textContent = label;
        button.disabled = !available;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.title = active ? 'Sair do painel expandido' : 'Expandir este painel (Esc para sair)';
        target?.classList.toggle('lms-author-fullscreen-active', active);
    });
}

async function toggleFullscreenFor(button: HTMLButtonElement, modalId: string): Promise<void> {
    const target = fullscreenTargetForControl(button, modalId);
    if (!isFullscreenAvailable(target) || !target) {
        showToast('Tela cheia indisponivel neste navegador.', 'warning');
        return;
    }
    try {
        if (isFullscreenTargetActive(target)) {
            markFullscreenExit();
            await document.exitFullscreen?.();
        } else {
            await (target as HTMLElement & { requestFullscreen?: (options?: FullscreenOptions) => Promise<void> }).requestFullscreen?.({
                navigationUI: 'hide',
            });
        }
    } catch (e: any) {
        console.debug('[lmsAuthoringFullscreen] fullscreen:', e?.message || e);
        showToast('Nao foi possivel alternar a tela cheia.', 'warning');
    } finally {
        syncFullscreenControls(modalId, target);
    }
}

export function wireFullscreenControls(root: HTMLElement, signal: AbortSignal, modalId: string): void {
    root.querySelectorAll<HTMLButtonElement>('.lms-author-fullscreen-toggle').forEach((button) => {
        button.addEventListener('click', () => void toggleFullscreenFor(button, modalId), { signal });
    });
    document.addEventListener(
        'fullscreenchange',
        () => {
            const hadActive = Array.from(root.querySelectorAll<HTMLButtonElement>('.lms-author-fullscreen-toggle')).some(
                (button) => button.getAttribute('aria-pressed') === 'true',
            );
            syncFullscreenControls(modalId, root);
            const hasActive = Array.from(root.querySelectorAll<HTMLButtonElement>('.lms-author-fullscreen-toggle')).some(
                (button) => button.getAttribute('aria-pressed') === 'true',
            );
            if (hadActive && !hasActive) markFullscreenExit();
        },
        { signal },
    );
    syncFullscreenControls(modalId, root);
}

export function exitFullscreenForOverlay(overlay: Element | null): void {
    const fullscreenElement = typeof document === 'undefined' ? null : document.fullscreenElement;
    if (!overlay || !fullscreenElement) return;
    if (fullscreenElement === overlay || overlay.contains(fullscreenElement)) {
        document.exitFullscreen?.().catch((e) => console.debug('[lmsAuthoringFullscreen] exit-fullscreen:', e?.message || e));
    }
}

export function applyAuthoringBackgroundIsolation(overlay: HTMLElement): void {
    if (typeof document === 'undefined') return;
    restoreAuthoringBackgroundIsolation();
    _authoringBackgroundIsolationStack = Array.from(document.body.children)
        .filter(
            (element): element is HTMLElement & { inert?: boolean } =>
                element instanceof HTMLElement && element !== overlay,
        )
        .map((element) => ({
            element,
            inert: Boolean(element.inert),
            inertAttr: element.getAttribute('inert'),
            ariaHidden: element.getAttribute('aria-hidden'),
        }));

    const active = document.activeElement;
    if (
        active instanceof HTMLElement &&
        _authoringBackgroundIsolationStack.some((entry) => entry.element.contains(active))
    ) {
        if (!overlay.hasAttribute('tabindex')) overlay.tabIndex = -1;
        try {
            overlay.focus({ preventScroll: true });
        } catch (e: any) {
            console.debug('[lmsAuthoringFullscreen] focus-before-isolation:', e?.message || e);
            overlay.focus?.();
        }
        if (document.activeElement === active) active.blur();
    }

    for (const entry of _authoringBackgroundIsolationStack) {
        entry.element.inert = true;
        entry.element.setAttribute('inert', '');
        entry.element.setAttribute('aria-hidden', 'true');
    }
}

export function restoreAuthoringBackgroundIsolation(): void {
    if (!_authoringBackgroundIsolationStack.length) return;
    for (const entry of _authoringBackgroundIsolationStack) {
        if (!entry?.element) continue;
        entry.element.inert = entry.inert;
        if (entry.inertAttr == null) entry.element.removeAttribute('inert');
        else entry.element.setAttribute('inert', entry.inertAttr);
        if (entry.ariaHidden == null) entry.element.removeAttribute('aria-hidden');
        else entry.element.setAttribute('aria-hidden', entry.ariaHidden);
    }
    _authoringBackgroundIsolationStack = [];
}
