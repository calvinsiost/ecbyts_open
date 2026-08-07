// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Modulo: Mascote SVG EC - gerencia estado emocional do bot de IA
// FEAT-MASCOT-SVG-001 / P1-22
// + SPEC_OFFLINE_BANNER_TO_MASCOT_BUBBLE_2026_05_30 (Fase 1) — bubble API
//   permite balão contextual sobre o mascote para sync/connection status,
//   substituindo o banner top-fixed laranja intrusivo.

import { escapeAttr, escapeHtml } from '../helpers/html.js';
import { installCloseListeners } from './contextMenuHelpers.js';

/**
 * Estados emocionais do mascote EC.
 * Cada estado corresponde a um SVG em app/assets/mascot/
 * e a uma classe CSS em app/css/mascot.css.
 */
export const MASCOT_STATES = {
    IDLE: 'idle',
    THINKING: 'thinking',
    SUCCESS: 'success',
    ERROR: 'error',
    SLEEPING: 'sleeping',
};

/** @type {string} Estado atual do mascote */
let _currentState: string = MASCOT_STATES.IDLE;

/** @type {HTMLElement|null} Container HTML que contém o mascote */
let _container: HTMLElement | null = null;

/**
 * Inicializa o mascote num container DOM.
 * Deve ser chamado uma vez no boot, após o DOM estar pronto.
 * @param {HTMLElement} container - Elemento HTML que contém o mascote SVG
 */
export function initMascot(container: HTMLElement): void {
    _container = container;
    _render();
}

/**
 * Define o estado emocional do mascote.
 * No-op se o estado já é o atual ou se o valor é inválido.
 * @param {string} state - Um dos valores de MASCOT_STATES
 */
export function setMascotState(state: string): void {
    if (!Object.values(MASCOT_STATES).includes(state)) return;
    if (_currentState === state) return;
    _currentState = state;
    _render();
}

/**
 * Retorna o estado emocional atual do mascote.
 * @returns {string}
 */
export function getMascotState(): string {
    return _currentState;
}

/**
 * Reseta o mascote para o estado padrão (IDLE).
 */
export function resetMascot(): void {
    setMascotState(MASCOT_STATES.IDLE);
}

/**
 * Aplica as classes CSS corretas no container e atualiza o label de acessibilidade.
 * Nunca usa innerHTML - apenas classList e textContent.
 * @private
 */
function _render(): void {
    const c = _container;
    if (!c) return;
    Object.values(MASCOT_STATES).forEach((s) => c.classList.remove('mascot--' + s));
    c.classList.add('mascot--' + _currentState);
    const label = c.querySelector('[data-mascot-label]');
    if (label) label.textContent = _currentState;
}

// ----------------------------------------------------------------
// BUBBLE API (Fase 1 SPEC_OFFLINE_BANNER_TO_MASCOT_BUBBLE)
// ----------------------------------------------------------------

export type MascotBubbleSeverity = 'ok' | 'info' | 'warning' | 'error' | 'offline';

export interface MascotBubbleAction {
    /** Identificador estável da ação (usado em data-attr). */
    id: string;
    /** Label visível no botão. */
    label: string;
    /** Se false, botão renderizado mas disabled. */
    enabled: boolean;
    /** Se true, aplica style primary (destaque). */
    primary?: boolean;
    /** Callback invocado on click (após escape de a11y). */
    onClick: () => void;
}

export interface MascotBubbleContent {
    /** Mensagem principal (será escapada). */
    message: string;
    /** Severidade — controla cor da borda esquerda do balão. */
    severity: MascotBubbleSeverity;
    /** 0-3 ações inline como botões. */
    actions: MascotBubbleAction[];
    /** aria-label do balão (default: 'Mascot notification'). */
    ariaLabel?: string;
}

const BUBBLE_ID = 'ecbyts-mascot-bubble';
const BUBBLE_STYLE_ID = 'ecbyts-mascot-bubble-styles';

/**
 * Pure-logic: dado severity, retorna a classe CSS de border-left.
 * Extraído para teste sem DOM.
 */
export function mascotBubbleSeverityClass(severity: MascotBubbleSeverity): string {
    switch (severity) {
        case 'error':
            return 'mascot-bubble--error';
        case 'offline':
            return 'mascot-bubble--offline';
        case 'warning':
            return 'mascot-bubble--warning';
        case 'info':
            return 'mascot-bubble--info';
        default:
            return 'mascot-bubble--ok';
    }
}

/**
 * Pure-logic: valida content e retorna sanitized clone com defaults.
 * Lança Error em input inválido (severity desconhecida, actions não-array).
 * Útil para testes determinísticos sem DOM.
 */
export function normalizeMascotBubbleContent(content: MascotBubbleContent): MascotBubbleContent {
    if (!content || typeof content !== 'object') {
        throw new Error('mascot-bubble: content required');
    }
    if (typeof content.message !== 'string') {
        throw new Error('mascot-bubble: message must be a string');
    }
    const validSeverity: MascotBubbleSeverity[] = ['ok', 'info', 'warning', 'error', 'offline'];
    if (!validSeverity.includes(content.severity)) {
        throw new Error(`mascot-bubble: invalid severity "${content.severity}"`);
    }
    if (!Array.isArray(content.actions)) {
        throw new Error('mascot-bubble: actions must be an array');
    }
    if (content.actions.length > 3) {
        throw new Error('mascot-bubble: max 3 actions (PatternFly threshold)');
    }
    return {
        message: content.message,
        severity: content.severity,
        actions: content.actions.map((a) => ({
            id: String(a.id),
            label: String(a.label),
            enabled: a.enabled !== false,
            primary: a.primary === true,
            onClick: typeof a.onClick === 'function' ? a.onClick : () => {},
        })),
        ariaLabel: content.ariaLabel || 'Mascot notification',
    };
}

function _ensureBubbleStyles(doc: Document): void {
    if (doc.getElementById(BUBBLE_STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = BUBBLE_STYLE_ID;
    style.textContent = `
        .mascot-bubble {
            position: absolute;
            bottom: calc(100% + 12px);
            right: 0;
            width: var(--ecbt-content-narrow, clamp(280px, 40vw, 340px));
            background: var(--ecbt-surface-overlay, #1e293b);
            color: var(--ecbt-dialog-fg, #e8ecf2);
            border: 1px solid var(--border-color, rgba(255,255,255,0.1));
            border-left-width: 4px;
            border-radius: 10px;
            padding: 12px 14px;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.32);
            font-size: 13px;
            line-height: 1.4;
            z-index: 260;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .mascot-bubble::after {
            content: '';
            position: absolute;
            top: 100%;
            right: 18px;
            border: 6px solid transparent;
            border-top-color: var(--ecbt-surface-overlay, #1e293b);
        }
        .mascot-bubble--error    { border-left-color: var(--color-error,   #ef4444); }
        .mascot-bubble--offline  { border-left-color: var(--color-warning, #f59e0b); }
        .mascot-bubble--warning  { border-left-color: var(--color-warning, #f59e0b); }
        .mascot-bubble--info     { border-left-color: var(--color-info,    #3b82f6); }
        .mascot-bubble--ok       { border-left-color: var(--color-success, #10b981); }
        .mascot-bubble-message   { font-weight: 600; overflow-wrap: anywhere; }
        .mascot-bubble-actions   { display: flex; flex-wrap: wrap; gap: 6px; }
        .mascot-bubble button {
            min-height: 26px;
            border: 1px solid rgba(255,255,255,0.18);
            border-radius: 6px;
            padding: 3px 9px;
            background: rgba(255,255,255,0.06);
            color: inherit;
            font: inherit;
            font-size: 12px;
            cursor: pointer;
        }
        .mascot-bubble button.primary {
            background: var(--accent-500, #10b981);
            color: #fff;
            border-color: transparent;
        }
        .mascot-bubble button:disabled { cursor: not-allowed; opacity: 0.5; }
        @media (prefers-reduced-motion: reduce) {
            .mascot-bubble { transition: none; }
        }
    `;
    doc.head.appendChild(style);
}

let _bubbleEl: HTMLElement | null = null;
let _bubbleCloseCtrl: AbortController | null = null;

/**
 * Mostra balão sobre o mascote. Idempotente — substitui balão prévio.
 * Anexa como filho de _container para herdar posicionamento relativo.
 */
export function showMascotBubble(content: MascotBubbleContent): void {
    if (typeof document === 'undefined' || !_container) return;
    const normalized = normalizeMascotBubbleContent(content);
    _ensureBubbleStyles(document);
    hideMascotBubble();

    const bubble = document.createElement('div');
    bubble.id = BUBBLE_ID;
    bubble.className = `mascot-bubble ${mascotBubbleSeverityClass(normalized.severity)}`;
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');
    bubble.setAttribute('aria-label', normalized.ariaLabel || 'Mascot notification');

    const actionsHtml = normalized.actions
        .map(
            (a) =>
                `<button type="button" data-bubble-action="${escapeAttr(a.id)}" class="${a.primary ? 'primary' : ''}"${a.enabled ? '' : ' disabled'}>${escapeHtml(a.label)}</button>`,
        )
        .join('');

    bubble.innerHTML = `
        <div class="mascot-bubble-message">${escapeHtml(normalized.message)}</div>
        ${normalized.actions.length > 0 ? `<div class="mascot-bubble-actions">${actionsHtml}</div>` : ''}
    `;

    // Container precisa ser position:relative (assumido em mascot.css FAB)
    const cs = window.getComputedStyle(_container);
    if (cs.position === 'static') _container.style.position = 'relative';
    _container.appendChild(bubble);
    _bubbleEl = bubble;

    bubble.querySelectorAll<HTMLButtonElement>('[data-bubble-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-bubble-action');
            const action = normalized.actions.find((a) => a.id === id);
            if (action?.enabled) action.onClick();
        });
    });

    // Auto-foco no primary (a11y) sem requirir foco mandatório
    const primary = bubble.querySelector<HTMLButtonElement>('button.primary:not([disabled])');
    primary?.focus();

    // Outside-click + Escape (D2 helper) — auto-cleanup via AbortController
    _bubbleCloseCtrl = installCloseListeners(bubble, hideMascotBubble);
}

/** Esconde balão. No-op se nenhum visível. */
export function hideMascotBubble(): void {
    if (_bubbleCloseCtrl) {
        _bubbleCloseCtrl.abort();
        _bubbleCloseCtrl = null;
    }
    if (_bubbleEl) {
        _bubbleEl.remove();
        _bubbleEl = null;
    }
}

/** True se balão visível. */
export function isMascotBubbleVisible(): boolean {
    return _bubbleEl !== null;
}
