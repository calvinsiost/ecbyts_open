// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Details Modal — wire DOM thin.
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET §5.2 F3 — wire DOM consumidor de
 * _detailsModalContentPure (VM de conteúdo) + _detailsModalA11yPure
 * (focus trap + keyboard nav).
 * claude - novaspec, 2026-06-05.
 *
 * Responsabilidades thin (sem lógica):
 *   1. openComplianceDetailsModal(input) — monta DOM via design tokens
 *      .ecbt-overlay + .ecbt-dialog--lg + aplica AriaAttrs WCAG
 *   2. Wire keyboard handler → resolveFocusAction → aplicar action
 *   3. Click em [Trocar preset|Exportar JSON|Ver legislação|Fechar] →
 *      dispatcha CustomEvent específico (sem efeito direto — consumidor
 *      a montante decide ação)
 *   4. closeComplianceDetailsModal() — remove DOM + restaura focus prévio
 *
 * Eventos dispatched no document:
 *   - 'compliance:details-action-change-preset' {detail: {presetId}}
 *   - 'compliance:details-action-export-json' {detail: {presetId}}
 *   - 'compliance:details-action-view-legal' {detail: {presetId}}
 *   - 'compliance:details-closed' {detail: {presetId}}
 *
 * Anti-pattern pixels-over-dom: modal NÃO abre em mount/route change;
 * só abre via openComplianceDetailsModal() chamado explicitamente em
 * resposta ao CustomEvent 'compliance:open-details' do banner.
 */

import { buildDetailsModalContent, type DetailsModalInput } from '../../core/compliance/_detailsModalContentPure.js';
import {
    buildAriaAttrs,
    resolveFocusAction,
    resolveInitialFocus,
    resolveRestoreFocus,
    type FocusableId,
} from '../../core/compliance/_detailsModalA11yPure.js';

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const MODAL_ROOT_ID = 'compliance-details-modal';
const TITLE_ID = 'compliance-details-modal-title';
const SUBTITLE_ID = 'compliance-details-modal-subtitle';
const OVERLAY_CLASS = 'ecbt-overlay';
const DIALOG_CLASS = 'ecbt-dialog ecbt-dialog--lg compliance-details-dialog';
const ACTION_ID_PREFIX = 'cb-details-action-';

// ----------------------------------------------------------------
// STATE (singleton)
// ----------------------------------------------------------------

interface ModalState {
    rootEl: HTMLElement;
    input: DetailsModalInput;
    previousFocusId: string | null;
    keydownHandler: (e: KeyboardEvent) => void;
}

let currentState: ModalState | null = null;

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function isBrowser(): boolean {
    return typeof document !== 'undefined' && document !== null;
}

function escapeForHTML(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildSectionHTML(section: { id: string; title: string; rows: ReadonlyArray<{ label: string; value: string; mono?: boolean }> }): string {
    const rows = section.rows
        .map((r) => {
            const cls = r.mono ? ' class="cb-details-row-mono"' : '';
            return `<dt>${escapeForHTML(r.label)}</dt><dd${cls}>${escapeForHTML(r.value)}</dd>`;
        })
        .join('');
    return `
        <section class="cb-details-section" data-section-id="${escapeForHTML(section.id)}">
            <h3 class="cb-details-section-title">${escapeForHTML(section.title)}</h3>
            <dl class="cb-details-section-rows">${rows}</dl>
        </section>
    `;
}

function buildActionsHTML(actions: ReadonlyArray<{ id: string; label: string; variant: string; enabled: boolean }>): string {
    return actions
        .map((a) => {
            const disabled = a.enabled ? '' : ' disabled aria-disabled="true"';
            const variantCls = `cb-details-btn cb-details-btn--${a.variant}`;
            // WCAG 4.1.2 Name/Role/Value — aria-label explícito por botão de ação
            // (Trocar preset / Exportar JSON / Ver legislação / Fechar). Garante
            // nome acessível estável mesmo se o label visível mudar/for ícone.
            const label = escapeForHTML(a.label);
            return `<button type="button" id="${ACTION_ID_PREFIX}${escapeForHTML(a.id)}" class="${variantCls}" data-action="${escapeForHTML(a.id)}" aria-label="${label}"${disabled}>${label}</button>`;
        })
        .join('');
}

function dispatchAction(actionId: string, presetId: string): void {
    if (!isBrowser()) return;
    const map: Record<string, string> = {
        'change-preset': 'compliance:details-action-change-preset',
        'export-json': 'compliance:details-action-export-json',
        'view-legal': 'compliance:details-action-view-legal',
        close: 'compliance:details-closed',
    };
    const evtName = map[actionId];
    if (!evtName) return;
    document.dispatchEvent(new CustomEvent(evtName, { detail: { presetId } }));
}

function getFocusables(state: ModalState): ReadonlyArray<FocusableId> {
    return state.input.preset && Array.isArray(currentVm()?.actions)
        ? currentVm()!.actions.map((a) => ({ id: `${ACTION_ID_PREFIX}${a.id}`, enabled: a.enabled }))
        : [];
}

function currentVm() {
    if (!currentState) return null;
    return buildDetailsModalContent(currentState.input);
}

function applyFocus(id: string | null): void {
    if (!isBrowser() || id === null) return;
    const el = document.getElementById(id) as HTMLElement | null;
    if (el && typeof el.focus === 'function') el.focus();
}

// ----------------------------------------------------------------
// MAIN API
// ----------------------------------------------------------------

export function openComplianceDetailsModal(input: DetailsModalInput): void {
    if (!isBrowser()) return;
    if (currentState) closeComplianceDetailsModal();

    const vm = buildDetailsModalContent(input);
    const aria = buildAriaAttrs({ titleElementId: TITLE_ID, subtitleElementId: SUBTITLE_ID });

    const overlay = document.createElement('div');
    overlay.id = MODAL_ROOT_ID;
    overlay.className = OVERLAY_CLASS;

    const dialog = document.createElement('div');
    dialog.className = DIALOG_CLASS;
    for (const [k, v] of Object.entries(aria)) dialog.setAttribute(k, v);
    dialog.setAttribute('data-preset-id', vm.presetIdForDataAttr);

    const sectionsHTML = vm.sections.map(buildSectionHTML).join('');
    const actionsHTML = buildActionsHTML(vm.actions);

    // WCAG 4.1.2 / 1.3.1 — role + aria-label semânticos no markup gerado:
    //  · body como role="document" rotulado pelo título (região de conteúdo do modal)
    //  · footer como role="group" rotulado "Ações do preset" (barra de botões)
    // O role=dialog/aria-modal/aria-labelledby do container vêm de buildAriaAttrs()
    // aplicado acima via setAttribute (mesma semântica WCAG 2.1 AA).
    dialog.innerHTML = `
        <header class="cb-details-header">
            <h2 id="${TITLE_ID}" class="cb-details-title">${escapeForHTML(vm.title)}</h2>
            <p id="${SUBTITLE_ID}" class="cb-details-subtitle">${escapeForHTML(vm.subtitle)}</p>
        </header>
        <div class="cb-details-body" role="document" aria-labelledby="${TITLE_ID}">${sectionsHTML}</div>
        <footer class="cb-details-footer" role="group" aria-label="Ações do preset">${actionsHTML}</footer>
    `;
    overlay.appendChild(dialog);

    // Click handler — delegate
    overlay.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Click on overlay outside dialog → close
        if (target === overlay) {
            closeComplianceDetailsModal();
            return;
        }
        // Click on action button
        const btn = target.closest('[data-action]') as HTMLElement | null;
        if (!btn) return;
        const actionId = btn.getAttribute('data-action');
        if (!actionId) return;
        if ((btn as HTMLButtonElement).disabled) return;
        dispatchAction(actionId, vm.presetIdForDataAttr);
        if (actionId === 'close') closeComplianceDetailsModal();
    });

    // Keyboard handler — focus trap + escape
    const keydownHandler = (e: KeyboardEvent) => {
        if (!currentState) return;
        const focusables = getFocusables(currentState);
        const currentFocusId = document.activeElement ? (document.activeElement as HTMLElement).id || null : null;
        const action = resolveFocusAction({
            key: e.key,
            shiftKey: e.shiftKey,
            currentFocusId,
            focusables,
        });
        if (action.preventDefault) e.preventDefault();
        if (action.action === 'close_modal') {
            closeComplianceDetailsModal();
            return;
        }
        if (action.action === 'activate' && action.nextFocusId) {
            const btn = document.getElementById(action.nextFocusId) as HTMLButtonElement | null;
            if (btn && !btn.disabled) btn.click();
            return;
        }
        if (action.nextFocusId) applyFocus(action.nextFocusId);
    };

    const previousFocusId =
        isBrowser() && document.activeElement ? (document.activeElement as HTMLElement).id || null : null;

    document.body.appendChild(overlay);
    document.addEventListener('keydown', keydownHandler);

    currentState = {
        rootEl: overlay,
        input,
        previousFocusId,
        keydownHandler,
    };

    // Initial focus
    const focusables = getFocusables(currentState);
    const initialId = resolveInitialFocus(focusables);
    applyFocus(initialId);
}

export function closeComplianceDetailsModal(): void {
    if (!isBrowser() || !currentState) return;

    document.removeEventListener('keydown', currentState.keydownHandler);
    if (currentState.rootEl.parentNode) {
        currentState.rootEl.parentNode.removeChild(currentState.rootEl);
    }

    const restoreId = resolveRestoreFocus(currentState.previousFocusId, null);
    const presetId = currentState.input.preset.id;
    currentState = null;

    applyFocus(restoreId);

    document.dispatchEvent(new CustomEvent('compliance:details-closed', { detail: { presetId } }));
}

export function isComplianceDetailsModalOpen(): boolean {
    return currentState !== null;
}

// Test-only access
export function _getCurrentStateForTest(): { presetId: string; previousFocusId: string | null } | null {
    if (!currentState) return null;
    return {
        presetId: currentState.input.preset.id,
        previousFocusId: currentState.previousFocusId,
    };
}
