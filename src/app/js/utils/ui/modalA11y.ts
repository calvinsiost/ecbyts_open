// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   MODAL A11Y — shared keyboard accessibility helper for dynamically
   built overlays (.ecbt-overlay + .ecbt-dialog).

   Implements WCAG 2.1 AA modal requirements that the dynamic
   claude-adm modals were missing:
     - Escape-to-close
     - Focus trap (Tab / Shift+Tab cycle stays inside the dialog)
     - Initial focus moves into the dialog
     - Return focus to the trigger element when the modal closes

   Design rationale: modals.js already has an internal _trapFocus but
   it is not exported and owns a different lifecycle. This helper is a
   self-contained, dependency-free attach/detach pair so any modal in
   utils/ui/ can opt in without coupling to modals.js.

   Reference: WCAG 2.1.2 (No Keyboard Trap) + ARIA APG dialog pattern.
   ================================================================ */

const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Attach Escape-to-close + focus trap + return-focus to a modal overlay.
 * Idempotent: re-attaching first detaches any previous binding.
 *
 * @param overlay The .ecbt-overlay root element.
 * @param onClose Callback invoked on Escape (should hide/remove the modal).
 * @param opts
 * @returns cleanup function (call when the modal closes)
 */
export function attachModalA11y(overlay: HTMLElement, onClose: () => void, opts: { initialFocus?: HTMLElement | null } = {}): () => void {
    if (!overlay || typeof onClose !== 'function') return () => {};

    // Idempotent: tear down a prior binding before re-wiring.
    const prev = (overlay as any)._a11yCleanup;
    if (typeof prev === 'function') {
        try {
            prev();
        } catch (err) {
            console.debug('[modalA11y:prevCleanup]', (err as any)?.message || err);
        }
    }

    const _activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const triggerEl =
        _activeEl && typeof (_activeEl as any).focus === 'function'
            ? (_activeEl as HTMLElement)
            : null;

    function onKeydown(ev: KeyboardEvent) {
        if (ev.key === 'Escape') {
            ev.preventDefault();
            onClose();
            return;
        }
        if (ev.key !== 'Tab') return;
        const focusable = (
            Array.from(overlay.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
                (el) => (el as HTMLElement).offsetParent !== null,
            )
        ) as HTMLElement[];
        if (focusable.length === 0) {
            ev.preventDefault();
            return;
        }
        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;
        const active = document.activeElement;
        if (ev.shiftKey && active === first) {
            ev.preventDefault();
            last.focus();
        } else if (!ev.shiftKey && active === last) {
            ev.preventDefault();
            first.focus();
        }
    }

    overlay.addEventListener('keydown', onKeydown);

    // Move focus into the dialog (initialFocus or first focusable).
    try {
        const target =
            opts.initialFocus || (overlay.querySelector(FOCUSABLE_SELECTOR) as HTMLElement | null);
        if (target && typeof target.focus === 'function') target.focus();
    } catch (err) {
        console.debug('[modalA11y:initialFocus]', (err as any)?.message || err);
    }

    const cleanup = () => {
        overlay.removeEventListener('keydown', onKeydown);
        (overlay as any)._a11yCleanup = null;
        // Return focus to the element that opened the modal.
        try {
            if (triggerEl && document.body.contains(triggerEl) && typeof triggerEl.focus === 'function') {
                triggerEl.focus();
            }
        } catch (err) {
            console.debug('[modalA11y:returnFocus]', (err as any)?.message || err);
        }
    };

    (overlay as any)._a11yCleanup = cleanup;
    return cleanup;
}
