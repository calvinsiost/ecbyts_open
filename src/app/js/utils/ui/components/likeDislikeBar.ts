// @ts-check
// Generated from src/app/js/utils/ui/components/likeDislikeBar.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost · AGPL-3.0-only
//
// Universal Like/Dislike Widget - inner component.
// See docs/specs/_archived/SPEC_UNIVERSAL_FEEDBACK_WIDGET.md
//
// Phase 1 MVP: render + wire + update counter from localStorage aggregate.
// Zero Supabase (Phase 2). Integrates with core/feedback/manager.js.
import { escapeHtml } from '../../helpers/html.js';
import { recordFeedback, getScreenAggregate } from '../../../core/feedback/manager.js';
import { t } from '../../i18n/translations.js';
/**
 * Render the bar markup as an HTML string. Caller injects into the DOM
 * and calls wireFeedbackBar() after insertion to attach listeners.
 * @param {string} screenId - stable identifier for this mount point
 * @param {{variant?: 'compact'|'default'}} [opts]
 * @returns {string}
 */
export function renderFeedbackBar( screenId: any, opts: any = {}) {
    const variant = opts.variant || 'default';
    const agg = getScreenAggregate(screenId);
    const counterText = agg.likes + agg.dislikes > 0 ? `+${agg.likes} / -${agg.dislikes}` : '';
    const safeId = escapeHtml(screenId);
    return `
        <div class="feedback-widget feedback-variant-${escapeHtml(variant)}" data-feedback-screen="${safeId}">
            <button
                class="feedback-btn feedback-up"
                type="button"
                data-vote="1"
                data-screen="${safeId}"
                aria-label="Model looks good"
                title="${t('feedback.useful')}"
            >Útil</button>
            <span class="feedback-count" id="feedback-count-${safeId}">${escapeHtml(counterText)}</span>
            <button
                class="feedback-btn feedback-down"
                type="button"
                data-vote="-1"
                data-screen="${safeId}"
                aria-label="Model needs improvement"
                title="${t('feedback.notUseful')}"
            >Não útil</button>
        </div>
    `;
}
/**
 * Attach click handlers to all currently-unwired .feedback-btn instances.
 * Idempotent: sets a __feedbackWired flag on each button so repeated calls
 * don't stack listeners.
 */
export function wireFeedbackBar() {
    const buttons = document.querySelectorAll('.feedback-btn');
    for (const btn of buttons as any) {
        if (btn.__feedbackWired) continue;
        btn.__feedbackWired = true;
        btn.addEventListener('click', async (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            const vote = Number(btn.dataset.vote);
            const screenId = btn.dataset.screen || 'unknown';
            const result =
                vote === 1 || vote === -1
                    ? await recordFeedback(vote, { screenId })
                    : { ok: false, reason: 'invalid_vote' };
            _renderFeedbackResult(btn, screenId, result);
        });
    }
}
/**
 * Update the UI after a vote attempt - flash color, update counter,
 * show rate-limit tooltip, or silent on success.
 */
/**
 * @param {any} btn
 * @param {string} screenId
 * @param {any} result
 */
function _renderFeedbackResult( btn: any, screenId: any, result: any) {
    const counterEl = document.getElementById('feedback-count-' + screenId);
    if (result.ok) {
        // Flash color
        btn.classList.add('feedback-btn-voted');
        setTimeout(() => btn.classList.remove('feedback-btn-voted'), 500);
        // Update counter from fresh aggregate
        if (counterEl) {
            const agg = getScreenAggregate(screenId);
            counterEl.textContent = agg.likes + agg.dislikes > 0 ? `+${agg.likes} / -${agg.dislikes}` : '';
        }
        // Minimal toast via window.showToast if available
        try {
            const w = (window) as any;
            if (typeof w.showToast === 'function') {
                w.showToast(t('feedback.thanks'), 'success');
            }
        } catch (e: any) {
            console.debug('[likeDislike] toast-thanks:', /** @type {Error} */ (e)?.message || e);
            /* noop */
        }
    } else if (result.reason === 'rate_limited') {
        btn.setAttribute('title', 'Aguarde 60s para votar de novo');
        btn.classList.add('feedback-btn-disabled');
        setTimeout(() => btn.classList.remove('feedback-btn-disabled'), 1500);
        try {
            const w = (window) as any;
            if (typeof w.showToast === 'function') {
                w.showToast(t('feedback.waitBeforeVoting'), 'warn');
            }
        } catch (e: any) {
            console.debug('[likeDislike] toast-rate-limit:', /** @type {Error} */ (e)?.message || e);
            /* noop */
        }
    } else if (result.reason === 'storage_full') {
        try {
            const w = (window) as any;
            if (typeof w.showToast === 'function') {
                w.showToast(t('feedback.storageFull'), 'error');
            }
        } catch (e: any) {
            console.debug('[likeDislike] toast-storage-full:', /** @type {Error} */ (e)?.message || e);
            /* noop */
        }
    }
}
/**
 * Convenience: render + insert into a container + wire. Replaces any
 * existing widget in the same container. Used by callers that want a
 * one-shot mount.
 * @param {HTMLElement|string} containerOrId
 * @param {string} screenId
 * @param {{variant?: 'compact'|'default'}} [opts]
 */
export function mountFeedbackBar( containerOrId: any, screenId: any, opts: any = {}) {
    const container = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
    if (!container) return false;
    container.innerHTML = renderFeedbackBar(screenId, opts);
    wireFeedbackBar();
    return true;
}
/**
 * Register global keyboard shortcuts for like/dislike.
 * Ctrl+ArrowUp = like (+1), Ctrl+ArrowDown = dislike (-1).
 * Operates on the last visible feedback widget (by DOM order).
 * Idempotent - safe to call multiple times.
 */
let _shortcutsWired = false;
export function wireKeyboardShortcuts() {
    if (_shortcutsWired) return;
    _shortcutsWired = true;
    document.addEventListener('keydown', async (e: any) => {
        if (!e.ctrlKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        e.preventDefault();
        const vote = e.key === 'ArrowUp' ? 1 : -1;
        // Find last visible widget
        const widgets = (document.querySelectorAll('.feedback-widget')) as NodeListOf<HTMLElement>;
        let targetScreen = 'global';
        for (const w of widgets) {
            if (w.offsetParent) {
                targetScreen = w.dataset.feedbackScreen || 'global';
            }
        }
        const result = await recordFeedback(vote, { screenId: targetScreen });
        // Visual feedback via toast
        try {
            const w = (window) as any;
            if (typeof w.showToast === 'function') {
                w.showToast(
                    vote === 1 ? 'Like registrado (Ctrl+Up)' : 'Dislike registrado (Ctrl+Down)',
                    result.ok ? 'success' : 'warn',
                );
            }
        } catch (e: any) {
            console.debug('[likeDislike] toast-shortcut:', /** @type {Error} */ (e)?.message || e);
            /* noop */
        }
        // Update counter on matching widget
        const counterEl = document.getElementById('feedback-count-' + targetScreen);
        if (counterEl && result.ok) {
            const agg = getScreenAggregate(targetScreen);
            counterEl.textContent = agg.likes + agg.dislikes > 0 ? `+${agg.likes} / -${agg.dislikes}` : '';
        }
    });
}
/**
 * Programmatic API for external callers (API bridge, LLM, scripts).
 * @param {number} vote - +1 (like) or -1 (dislike)
 * @param {string} [screenId='global'] - feedback target screen
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function apiFeedback( vote: any, screenId: any = 'global') {
    return vote === 1 || vote === -1 ? recordFeedback(vote, { screenId }) : { ok: false, reason: 'invalid_vote' };
}
