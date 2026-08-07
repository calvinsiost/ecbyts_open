// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Details Modal — A11y pure-logic.
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET F3 + WCAG 2.1 AA (2.1.2, 2.4.3, 4.1.2).
 * claude - novaspec, 2026-06-05.
 *
 * Pure-logic do focus trap + keyboard navigation do modal. Sem DOM —
 * consome lista nomeada de focusable IDs + tecla pressionada, devolve
 * a próxima ação canônica para o wire DOM aplicar.
 *
 * Coberturas WCAG:
 *   - 2.1.2 No keyboard trap — escape fecha modal sempre
 *   - 2.4.3 Focus order — Tab/Shift+Tab navegam em ordem declarada
 *   - 4.1.2 Name/Role/Value — buildAriaAttrs com role=dialog + labelledby
 *
 * Out of scope:
 *   - DOM (wire DOM consome FocusActionVM)
 *   - Animation (CSS transitions)
 *   - ARIA live regions (modal já é region por aria-modal=true)
 *
 * Tests: tests/compliance-details-modal-a11y-pure.test.mjs
 */

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export type KeyAction = 'focus_next' | 'focus_prev' | 'focus_first' | 'focus_last' | 'close_modal' | 'activate' | 'noop';

export interface FocusableId {
    readonly id: string;
    readonly enabled: boolean;
}

export interface FocusActionInput {
    readonly key: string;
    readonly shiftKey: boolean;
    readonly currentFocusId: string | null;
    readonly focusables: ReadonlyArray<FocusableId>;
}

export interface FocusActionResult {
    readonly action: KeyAction;
    readonly nextFocusId: string | null;
    readonly preventDefault: boolean;
}

export interface AriaAttrs {
    readonly role: 'dialog';
    readonly 'aria-modal': 'true';
    readonly 'aria-labelledby': string;
    readonly 'aria-describedby'?: string;
    readonly tabindex: '-1';
}

export interface AriaAttrsInput {
    readonly titleElementId: string;
    readonly subtitleElementId?: string;
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function enabledOnly(items: ReadonlyArray<FocusableId>): ReadonlyArray<FocusableId> {
    return items.filter((f) => f.enabled === true);
}

function findIndex(items: ReadonlyArray<FocusableId>, id: string | null): number {
    if (id === null) return -1;
    for (let i = 0; i < items.length; i++) {
        if (items[i]!.id === id) return i;
    }
    return -1;
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

// ----------------------------------------------------------------
// KEY ACTION RESOLVER
// ----------------------------------------------------------------

export function resolveFocusAction(input: FocusActionInput): FocusActionResult {
    const noop: FocusActionResult = Object.freeze({
        action: 'noop' as const,
        nextFocusId: null,
        preventDefault: false,
    });

    if (!input || typeof input !== 'object') return noop;
    if (!isNonEmptyString(input.key)) return noop;
    if (!Array.isArray(input.focusables)) return noop;

    const enabled = enabledOnly(input.focusables);

    // ESC sempre fecha — WCAG 2.1.2
    if (input.key === 'Escape') {
        return Object.freeze({
            action: 'close_modal' as const,
            nextFocusId: null,
            preventDefault: true,
        });
    }

    // Enter/Space ativa elemento focado (se houver)
    if ((input.key === 'Enter' || input.key === ' ' || input.key === 'Spacebar') && isNonEmptyString(input.currentFocusId)) {
        const idx = findIndex(enabled, input.currentFocusId);
        if (idx >= 0) {
            return Object.freeze({
                action: 'activate' as const,
                nextFocusId: input.currentFocusId,
                preventDefault: input.key !== 'Enter',
            });
        }
        return noop;
    }

    // Sem focusables enabled → noop
    if (enabled.length === 0) return noop;

    // Home → primeiro / End → último
    if (input.key === 'Home') {
        return Object.freeze({
            action: 'focus_first' as const,
            nextFocusId: enabled[0]!.id,
            preventDefault: true,
        });
    }
    if (input.key === 'End') {
        return Object.freeze({
            action: 'focus_last' as const,
            nextFocusId: enabled[enabled.length - 1]!.id,
            preventDefault: true,
        });
    }

    // Tab navigation — WCAG 2.4.3
    if (input.key === 'Tab') {
        const currentIdx = findIndex(enabled, input.currentFocusId);

        // Sem foco prévio → primeiro (Tab) ou último (Shift+Tab)
        if (currentIdx === -1) {
            return Object.freeze({
                action: input.shiftKey ? ('focus_last' as const) : ('focus_first' as const),
                nextFocusId: input.shiftKey ? enabled[enabled.length - 1]!.id : enabled[0]!.id,
                preventDefault: true,
            });
        }

        // Shift+Tab — anterior com wrap (último → primeiro reverso)
        if (input.shiftKey) {
            const prevIdx = currentIdx === 0 ? enabled.length - 1 : currentIdx - 1;
            return Object.freeze({
                action: 'focus_prev' as const,
                nextFocusId: enabled[prevIdx]!.id,
                preventDefault: true,
            });
        }

        // Tab — próximo com wrap
        const nextIdx = currentIdx === enabled.length - 1 ? 0 : currentIdx + 1;
        return Object.freeze({
            action: 'focus_next' as const,
            nextFocusId: enabled[nextIdx]!.id,
            preventDefault: true,
        });
    }

    return noop;
}

// ----------------------------------------------------------------
// ARIA ATTRS
// ----------------------------------------------------------------

export function buildAriaAttrs(input: AriaAttrsInput): AriaAttrs {
    if (!input || typeof input !== 'object' || !isNonEmptyString(input.titleElementId)) {
        throw new TypeError('buildAriaAttrs: titleElementId é obrigatório');
    }
    const base: Record<string, string> = {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': input.titleElementId,
        tabindex: '-1',
    };
    if (isNonEmptyString(input.subtitleElementId)) {
        base['aria-describedby'] = input.subtitleElementId;
    }
    return Object.freeze(base) as unknown as AriaAttrs;
}

// ----------------------------------------------------------------
// INITIAL FOCUS RESOLVER
// ----------------------------------------------------------------

export function resolveInitialFocus(focusables: ReadonlyArray<FocusableId>): string | null {
    if (!Array.isArray(focusables)) return null;
    const enabled = enabledOnly(focusables);
    if (enabled.length === 0) return null;
    return enabled[0]!.id;
}

// ----------------------------------------------------------------
// RESTORE FOCUS RESOLVER
// ----------------------------------------------------------------

export function resolveRestoreFocus(previousFocusId: string | null, fallbackId: string | null): string | null {
    if (isNonEmptyString(previousFocusId)) return previousFocusId;
    if (isNonEmptyString(fallbackId)) return fallbackId;
    return null;
}
