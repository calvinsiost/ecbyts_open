// Generated from src/app/js/utils/ui/ActionFeedbackUI.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   ACTION FEEDBACK UI — vanilla feedback for dispatched actions

   Mostra o estado de uma action (pending / success / error) via o
   sistema de toast existente e atualiza uma regiao aria-live para
   leitores de tela. Sem CSS novo: reusa tokens .ecbt-* e o toast.
   ================================================================ */
import { showToast } from './toast.js';
import { escapeHtml } from '../helpers/html.js';
const STATUS_ID = 'action-feedback-status';
/**
 * Lazily create (or reuse) the visually-hidden aria-live status node.
 * @returns {HTMLElement|null}
 */
function ensureStatusNode() {
    if (typeof document === 'undefined') return null;
    let node = document.getElementById(STATUS_ID);
    if (node) return node;
    node = document.createElement('div');
    node.id = STATUS_ID;
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.className = 'ecbt-visually-hidden';
    // Screen-reader-only positioning (no new CSS file needed).
    node.style.cssText =
        'position:absolute;width:1px;height:1px;margin:-1px;padding:0;' +
        'overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
    document.body.appendChild(node);
    return node;
}
const TOAST_TYPE = { pending: 'info', success: 'success', error: 'error' };
/**
 * Show feedback for an action lifecycle state.
 *
 * @param {{ state: 'pending'|'success'|'error', message?: string }} input
 * @returns {void}
 */
export function showActionFeedback({ state, message = '' }: any) {
    if (!(TOAST_TYPE as any)[state]) {
        throw new TypeError(`showActionFeedback: invalid state "${state}"`);
    }
    const safe = escapeHtml(message);
    try {
        showToast(safe, (TOAST_TYPE as any)[state]);
    } catch (e: any) {
        console.debug('[action-feedback:toast]', e?.message || e);
    }
    const node = ensureStatusNode();
    if (node) node.textContent = safe;
}
