// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// CONTEXT MENU HELPERS — Primitivas compartilhadas entre os 6 sistemas de
// context menu (D2 do problema UI Architecture Program §5b).
//
// Antes desta extração, viewport-clamp era reimplementado 3× (globalContextMenu
// usava pre-render com offsetWidth, ui/contextMenu usava requestAnimationFrame
// pós-render, canvasContextMenu + editing/contextMenu usavam getBoundingClientRect
// pós-render direto). Outside-click+Escape também variava em ciclo de vida.
//
// Esta API mantém a semântica de cada menu (cada um decide o que renderizar e
// quando fechar), só consolida os primitivos visuais e de cleanup.

// ----------------------------------------------------------------
// VIEWPORT CLAMP
// ----------------------------------------------------------------

export interface ClampInput {
    x: number;
    y: number;
    width: number;
    height: number;
    viewportW: number;
    viewportH: number;
    pad?: number;
}

export interface ClampResult {
    left: number;
    top: number;
}

/**
 * Pure-logic clamp: dada posição desejada + dimensões do menu + viewport,
 * retorna {left, top} dentro dos limites. Implementação isolada para
 * testes determinísticos sem precisar de DOM.
 *
 * Algoritmo (consistente com canvasContextMenu pré-D2):
 *  1. Se menu extrapola direita → flip para a esquerda do cursor (x - width).
 *  2. Se menu extrapola baixo → flip para cima do cursor (y - height).
 *  3. Final clamp ≥ pad nas duas direções (evita encostar na borda).
 */
export function clampToViewport(input: ClampInput): ClampResult {
    const pad = input.pad ?? 4;
    let left = input.x;
    let top = input.y;
    if (left + input.width > input.viewportW) {
        left = input.x - input.width;
    }
    if (top + input.height > input.viewportH) {
        top = input.y - input.height;
    }
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    return { left, top };
}

/**
 * DOM wrapper: clampa um menu já anexado ao body. Mede dimensões reais via
 * getBoundingClientRect e aplica style.left/top. Use APÓS appendChild +
 * setting visibility (classList.add('visible')) para medidas corretas.
 */
export function clampMenuToViewport(menuEl: HTMLElement, x: number, y: number, pad = 4): ClampResult {
    const rect = menuEl.getBoundingClientRect();
    const result = clampToViewport({
        x,
        y,
        width: rect.width,
        height: rect.height,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        pad,
    });
    menuEl.style.left = `${result.left}px`;
    menuEl.style.top = `${result.top}px`;
    return result;
}

// ----------------------------------------------------------------
// CLOSE LISTENERS (outside-click + Escape + scroll)
// ----------------------------------------------------------------

export interface CloseListenerOptions {
    /** Fecha ao clicar fora do menuEl (default: true). */
    outsideClick?: boolean;
    /** Fecha ao pressionar Escape (default: true). */
    escapeKey?: boolean;
    /** Fecha ao scroll de qualquer ancestral (default: false, útil só p/ menus position:fixed). */
    scroll?: boolean;
    /** AbortController externo — se omitido, cria um novo. */
    signal?: AbortSignal;
}

/**
 * Registra os listeners de fechamento de um context menu de forma idempotente
 * e auto-cleanup. Retorna um AbortController — chame `.abort()` quando o menu
 * fechar (ou descartar) para remover TODOS os listeners de uma vez.
 *
 * Substitui o padrão `document.addEventListener('mousedown', onOutside, { once: true })`
 * (que vazava listeners quando o menu reabrisse sem o outside-click disparar)
 * e o duplo `addEventListener('keydown', ...) + remove no destroy` (que era
 * fácil de esquecer).
 *
 * Para usar com signal externo:
 *   const ctrl = new AbortController();
 *   installCloseListeners(menu, close, { signal: ctrl.signal });
 *   // ... mais tarde:
 *   ctrl.abort(); // remove TODOS os listeners
 */
export function installCloseListeners(
    menuEl: HTMLElement,
    onClose: () => void,
    options: CloseListenerOptions = {},
): AbortController {
    const ctrl = new AbortController();
    const signal = options.signal ?? ctrl.signal;
    const outsideClick = options.outsideClick !== false;
    const escapeKey = options.escapeKey !== false;
    const scroll = options.scroll === true;

    if (outsideClick) {
        document.addEventListener(
            'mousedown',
            (e: MouseEvent) => {
                if (!menuEl.contains(e.target as Node | null)) {
                    onClose();
                }
            },
            { signal },
        );
    }
    if (escapeKey) {
        document.addEventListener(
            'keydown',
            (e: KeyboardEvent) => {
                if (e.key === 'Escape') onClose();
            },
            { signal },
        );
    }
    if (scroll) {
        document.addEventListener('scroll', onClose, { capture: true, passive: true, signal });
    }

    return ctrl;
}

// ----------------------------------------------------------------
// WAI-ARIA 1.3 MENU PATTERN (D2b)
// ----------------------------------------------------------------

export interface MenuA11yOptions {
    /** Accessible name (aria-label). Use quando não há trigger visível com label. */
    label?: string;
    /** Auto-focus no primeiro item após apply (default: true). */
    autoFocus?: boolean;
}

/**
 * Aplica padrão WAI-ARIA 1.3 menu a um container de context menu:
 *   - container ganha role="menu" + aria-label (se fornecido)
 *   - todo <button> descendente vira role="menuitem" + tabindex=-1
 *   - foco vai pro primeiro <button> não-disabled (autoFocus=true por default)
 *
 * Chame APÓS preencher innerHTML (a varredura precisa dos buttons existirem).
 * Idempotente: pode ser chamado várias vezes — só seta atributos que faltam.
 *
 * Spec: W3C WAI-ARIA APG Menu pattern + ARIA 1.3 draft 2026-05.
 */
export function applyMenuA11y(menuEl: HTMLElement, options: MenuA11yOptions = {}): void {
    const autoFocus = options.autoFocus !== false;

    if (!menuEl.hasAttribute('role')) {
        menuEl.setAttribute('role', 'menu');
    }
    if (options.label && !menuEl.hasAttribute('aria-label')) {
        menuEl.setAttribute('aria-label', options.label);
    }

    const buttons = menuEl.querySelectorAll('button');
    buttons.forEach((btn) => {
        if (!btn.hasAttribute('role')) btn.setAttribute('role', 'menuitem');
        if (!btn.hasAttribute('tabindex')) btn.setAttribute('tabindex', '-1');
    });

    if (autoFocus) {
        const firstEnabled = menuEl.querySelector<HTMLButtonElement>(
            'button:not([disabled]):not([aria-disabled="true"])',
        );
        firstEnabled?.focus();
    }
}
