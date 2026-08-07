// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TAB-MODEL-SWITCH-001 F6 (claude - novaspec, 2026-05-31) — Switch Overlay.
 *
 * Loading overlay com aria-live="assertive" + role="status" + aria-busy="true"
 * mostrado durante swap entre tabs (1-3s típico). Wire ao bridge.onProgress
 * via setOnSwitchProgress callback (F3).
 *
 * Reusa CSS existente `app/css/loading-overlay.css` (classes `.ecbt-loading-overlay`).
 * NÃO duplica markup nem cria nova folha de estilo.
 *
 * Mapeamento de phase (F3) → i18n key:
 *   - 'started' / 'snapshot'  → tabSwitch.savingCurrent
 *   - 'reset'                 → tabSwitch.loading
 *   - 'load' / 'restore'      → tabSwitch.restoringTarget
 *   - 'completed'             → hide overlay
 *   - 'failed'                → tabSwitch.failed + auto-hide após 2s
 *
 * Pure-logic ish: 100% deps injetáveis (translator + document). Caller
 * (browser bootstrap) injeta `t()` e `document` reais; testes Node injetam
 * mocks.
 *
 * Refs:
 *   - SPEC `docs/specs/features/SPEC_TAB_MODEL_SWITCH_INTEGRATION.md` §5.1, §13 F6
 *   - F3 commit 2bbf851b (setOnSwitchProgress + SwitchPhase enum)
 *   - F5 commit f352512d (bridgeWire onProgress hook)
 */

import type { SwitchPhase } from './modelSwitchBridge.js';

// =============================================================================
// Tipos
// =============================================================================

export type Translator = (key: string, fallback?: string) => string;

export interface OverlayDeps {
    /** Translator function — caller passa `t` do i18n module */
    t: Translator;
    /** Document target (testes injetam jsdom-like; browser passa global) */
    doc?: Document;
    /** Auto-hide delay para phase=failed (ms). Default 2000. */
    autoHideFailedMs?: number;
    /** Container parent — default doc.body */
    parent?: HTMLElement;
}

// =============================================================================
// Constantes
// =============================================================================

export const OVERLAY_ID = 'tab-switch-overlay';
export const OVERLAY_CLASS = 'ecbt-loading-overlay';
export const OVERLAY_CONTENT_CLASS = 'ecbt-loading-content';

/**
 * Mapeamento de fase → i18n key. Caller pode override via opts mas defaults
 * cobrem 100% das fases do bridge F3.
 */
export const DEFAULT_PHASE_KEY_MAP: Readonly<Record<SwitchPhase, string>> = Object.freeze({
    started: 'tabSwitch.savingCurrent',
    snapshot: 'tabSwitch.savingCurrent',
    reset: 'tabSwitch.loading',
    load: 'tabSwitch.restoringTarget',
    restore: 'tabSwitch.restoringTarget',
    completed: '', // sentinel — caller deve esconder overlay
    failed: 'tabSwitch.failed',
});

// =============================================================================
// Resolver: phase → mensagem traduzida
// =============================================================================

/**
 * Resolve phase + translator → mensagem para mostrar no overlay.
 * Pure-logic — sem side-effects, testável trivialmente.
 *
 * @example
 *   resolvePhaseMessage('snapshot', (k) => 'Salvando...') → 'Salvando...'
 */
export function resolvePhaseMessage(phase: SwitchPhase, t: Translator): string {
    const key = DEFAULT_PHASE_KEY_MAP[phase];
    if (!key) return '';
    return t(key, key);
}

// =============================================================================
// Overlay DOM builder + show/hide
// =============================================================================

let _overlayEl: HTMLElement | null = null;
let _autoHideTimer: any = null;

/**
 * Garante que overlay existe no DOM (cria lazy). Retorna referência.
 * Aplica role="status" + aria-live="assertive" + aria-busy="true" por A11y.
 */
export function ensureOverlay(deps: OverlayDeps): HTMLElement | null {
    const doc = deps.doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    if (_overlayEl && doc.contains(_overlayEl)) return _overlayEl;
    let el = doc.getElementById(OVERLAY_ID);
    if (!el) {
        el = doc.createElement('div');
        el.id = OVERLAY_ID;
        el.className = OVERLAY_CLASS;
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'assertive');
        el.setAttribute('aria-busy', 'true');
        el.style.display = 'none';
        const content = doc.createElement('div');
        content.className = OVERLAY_CONTENT_CLASS;
        const spinner = doc.createElement('div');
        spinner.className = 'ecbt-loading-spinner';
        const msg = doc.createElement('div');
        msg.className = 'ecbt-loading-message';
        msg.id = OVERLAY_ID + '-message';
        const pct = doc.createElement('div');
        pct.className = 'ecbt-loading-pct';
        pct.id = OVERLAY_ID + '-pct';
        content.appendChild(spinner);
        content.appendChild(msg);
        content.appendChild(pct);
        el.appendChild(content);
        const parent = deps.parent || doc.body;
        if (parent) parent.appendChild(el);
    }
    _overlayEl = el;
    return el;
}

/**
 * Mostra overlay com mensagem e percentual.
 */
export function showOverlay(message: string, pct: number, deps: OverlayDeps): void {
    const el = ensureOverlay(deps);
    if (!el) return;
    el.style.display = 'flex';
    el.classList.add('visible');
    el.setAttribute('aria-busy', 'true');
    const msgEl = el.querySelector('.ecbt-loading-message');
    if (msgEl) msgEl.textContent = message;
    const pctEl = el.querySelector('.ecbt-loading-pct');
    if (pctEl) pctEl.textContent = `${Math.min(100, Math.max(0, Math.round(pct)))}%`;
}

/**
 * Esconde overlay (display: none + aria-busy=false).
 */
export function hideOverlay(deps: OverlayDeps): void {
    const el = _overlayEl || ensureOverlay(deps);
    if (!el) return;
    el.style.display = 'none';
    el.classList.remove('visible');
    el.setAttribute('aria-busy', 'false');
    if (_autoHideTimer) {
        clearTimeout(_autoHideTimer);
        _autoHideTimer = null;
    }
}

/**
 * Handler para passar a setOnSwitchProgress do bridge.
 * Orquestra show/hide conforme phase + atualiza mensagem.
 *
 * @example
 *   import { setOnSwitchProgress } from './modelSwitchBridge.js';
 *   setOnSwitchProgress(createProgressHandler({ t }));
 */
export function createProgressHandler(deps: OverlayDeps): (phase: SwitchPhase, pct: number) => void {
    const autoHideMs = deps.autoHideFailedMs ?? 2000;
    return function progressHandler(phase: SwitchPhase, pct: number): void {
        if (phase === 'completed') {
            hideOverlay(deps);
            return;
        }
        const msg = resolvePhaseMessage(phase, deps.t);
        showOverlay(msg, pct, deps);
        if (phase === 'failed') {
            if (_autoHideTimer) clearTimeout(_autoHideTimer);
            _autoHideTimer = setTimeout(() => {
                hideOverlay(deps);
            }, autoHideMs);
        }
    };
}

/**
 * Reset state interno (teardown de testes).
 */
export function _resetOverlayForTesting(): void {
    if (_autoHideTimer) {
        clearTimeout(_autoHideTimer);
        _autoHideTimer = null;
    }
    if (_overlayEl && _overlayEl.parentElement) {
        _overlayEl.parentElement.removeChild(_overlayEl);
    }
    _overlayEl = null;
}

/**
 * Introspecção (testes/debug).
 */
export function isOverlayVisible(deps: OverlayDeps): boolean {
    const el = _overlayEl || (deps.doc || (typeof document !== 'undefined' ? document : null))?.getElementById(OVERLAY_ID);
    if (!el) return false;
    return (el as HTMLElement).style.display !== 'none';
}
