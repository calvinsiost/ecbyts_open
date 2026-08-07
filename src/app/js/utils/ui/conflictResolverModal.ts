// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * conflictResolverModal.js - pure 3-way conflict UI contract.
 *
 * Consumes the result from core/recovery/conflictResolver.js and produces a
 * deterministic state model for a three-column conflict dialog.
 */

import { summarizeMerge } from '../../core/recovery/conflictResolver.js';
import { escapeAttr, escapeHtml } from '../helpers/html.js';

export const CONFLICT_ACTIONS = Object.freeze({
    USE_OURS: 'use_ours',
    USE_THEIRS: 'use_theirs',
    MERGE_FIELDS: 'merge_fields',
    SKIP: 'skip',
});

const COLUMNS = Object.freeze([
    Object.freeze({ id: 'original', label: 'Original' }),
    Object.freeze({ id: 'ours', label: 'Suas alteracoes' }),
    Object.freeze({ id: 'theirs', label: 'Outras alteracoes' }),
]);
const OVERLAY_ID = 'ecbyts-conflict-overlay';
const STYLE_ID = 'ecbyts-conflict-modal-styles';

function choiceFromStrategy(strategy: any) {
    if (strategy === 'local-wins') return 'ours';
    if (strategy === 'remote-wins') return 'theirs';
    return null;
}

function pathLabel(path: any) {
    if (!path || path === '$root') return 'Modelo completo';
    return String(path).split('.').filter(Boolean).join(' > ');
}

function formatValue(value: any, maxLength: any = 180) {
    if (value === undefined) return '(ausente)';
    if (value === null) return 'null';
    let text: string;
    if (typeof value === 'string') {
        text = value;
    } else {
        try {
            text = JSON.stringify(value);
        } catch {
            text = String(value);
        }
    }
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1)}...`;
}

function freezeFields(fields: any) {
    return Object.freeze(
        fields.map((field: any) =>
            Object.freeze({
                ...field,
                values: Object.freeze({ ...field.values }),
                actions: Object.freeze(field.actions.map((a: any) => Object.freeze({ ...a }))),
            }),
        ),
    );
}

function freezeActions(actions: any) {
    return Object.freeze(actions.map((a: any) => Object.freeze({ ...a })));
}

function freezeState(state: any) {
    return Object.freeze({
        kind: 'conflict-resolver-modal',
        visible: state.visible,
        friendlyState: state.friendlyState,
        title: state.title,
        message: state.message,
        resourceLabel: state.resourceLabel,
        columns: COLUMNS,
        fields: freezeFields(state.fields),
        summary: Object.freeze({ ...state.summary }),
        actions: freezeActions(state.actions),
        aria: Object.freeze({
            role: 'dialog',
            modal: true,
            labelledBy: 'ecbyts-conflict-title',
            describedBy: 'ecbyts-conflict-description',
        }),
    });
}

/**
 * Build the three-column conflict dialog state.
 */
export function buildConflictModalState(
    input: { mergeResult?: object; resourceLabel?: string; choices?: object; maxValueLength?: number } = {},
) {
    const mergeResult = (input.mergeResult || { merged: {}, conflicts: [] }) as Record<string, any>;
    const conflicts = Array.isArray(mergeResult.conflicts) ? mergeResult.conflicts : [];
    const unresolved = conflicts.filter((c: any) => c?.resolved !== true);
    const resourceLabel = String(input.resourceLabel || 'registro');
    const choices = (
        input.choices && typeof input.choices === 'object' ? input.choices : {}
    ) as Record<string, any>;
    const maxValueLength =
        input.maxValueLength == null ? 180 : Math.max(24, Math.floor(Number(input.maxValueLength)) || 180);

    const fields = conflicts.map((conflict: any) => {
        const selected = choices[conflict.path] || choiceFromStrategy(conflict.strategy);
        return {
            path: conflict.path || '$root',
            label: pathLabel(conflict.path),
            reason: conflict.reason || 'value-divergence',
            resolved: conflict.resolved === true,
            selectedChoice: selected,
            values: {
                original: formatValue(conflict.base, maxValueLength),
                ours: formatValue(conflict.local, maxValueLength),
                theirs: formatValue(conflict.remote, maxValueLength),
            },
            actions: [
                { id: 'ours', label: 'Usar sua alteracao', enabled: true, primary: selected === 'ours' },
                { id: 'theirs', label: 'Usar outra alteracao', enabled: true, primary: selected === 'theirs' },
                { id: 'custom', label: 'Valor manual', enabled: true, primary: selected === 'custom' },
            ],
        };
    });

    const summary = summarizeMerge(mergeResult);
    const friendlyState =
        conflicts.length === 0 ? 'clean' : unresolved.length === 0 ? 'auto_resolved' : 'needs_decision';
    const visible = friendlyState === 'needs_decision';
    const actions = [
        { id: CONFLICT_ACTIONS.USE_OURS, label: 'Usar tudo das suas', enabled: conflicts.length > 0, primary: false },
        {
            id: CONFLICT_ACTIONS.USE_THEIRS,
            label: 'Usar tudo das outras',
            enabled: conflicts.length > 0,
            primary: false,
        },
        {
            id: CONFLICT_ACTIONS.MERGE_FIELDS,
            label: 'Mesclar por campo',
            enabled: conflicts.length > 0,
            primary: true,
        },
        { id: CONFLICT_ACTIONS.SKIP, label: 'Pular', enabled: conflicts.length > 0, primary: false },
    ];

    return freezeState({
        visible,
        friendlyState,
        title: `Conflito detectado - ${resourceLabel}`,
        message: visible
            ? 'Escolha qual versao manter antes de continuar a sincronizacao.'
            : 'Nenhum conflito manual pendente.',
        resourceLabel,
        fields,
        summary,
        actions,
    });
}

/**
 * Translate a modal action into a command for sync/drain integration.
 */
export function planConflictAction(state: any, actionId: any, fieldChoices: Record<string, any> = {}) {
    const action = state.actions.find((a: any) => a.id === actionId);
    if (!action) throw new Error(`Unknown conflict action: ${actionId}`);
    if (!action.enabled) throw new Error(`Conflict action disabled: ${actionId}`);

    if (actionId === CONFLICT_ACTIONS.USE_OURS) {
        return Object.freeze({
            type: 'resolve_all_conflicts',
            strategy: 'local-wins',
            source: 'conflict-resolver-modal',
        });
    }
    if (actionId === CONFLICT_ACTIONS.USE_THEIRS) {
        return Object.freeze({
            type: 'resolve_all_conflicts',
            strategy: 'remote-wins',
            source: 'conflict-resolver-modal',
        });
    }
    if (actionId === CONFLICT_ACTIONS.SKIP) {
        return Object.freeze({
            type: 'skip_conflict',
            conflictPaths: Object.freeze(state.fields.map((f: any) => f.path)),
            retryLater: true,
            source: 'conflict-resolver-modal',
        });
    }
    return Object.freeze({
        type: 'resolve_field_conflicts',
        fieldChoices: Object.freeze({ ...fieldChoices }),
        conflictPaths: Object.freeze(state.fields.map((f: any) => f.path)),
        source: 'conflict-resolver-modal',
    });
}

function ensureConflictStyles(documentRef: any) {
    if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
    const style = documentRef.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .ecbyts-conflict-overlay {
            position: fixed;
            inset: 0;
            z-index: 3250;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: rgba(9, 14, 23, 0.58);
        }
        .ecbyts-conflict-modal {
            width: min(920px, 100%);
            max-height: min(820px, calc(100vh - 48px));
            overflow: auto;
            border: 1px solid rgba(148, 163, 184, 0.34);
            border-radius: 8px;
            background: #ffffff;
            color: #172033;
            box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
        }
        .ecbyts-conflict-modal header {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            padding: 18px 20px 12px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.26);
        }
        .ecbyts-conflict-title {
            margin: 0;
            font-size: 18px;
            line-height: 1.25;
            font-weight: 700;
            letter-spacing: 0;
        }
        .ecbyts-conflict-description {
            margin: 6px 0 0;
            color: #475569;
            font-size: 13px;
            line-height: 1.45;
        }
        .ecbyts-conflict-body {
            display: grid;
            gap: 12px;
            padding: 16px 20px;
        }
        .ecbyts-conflict-field {
            border: 1px solid rgba(148, 163, 184, 0.34);
            border-radius: 8px;
            background: #f8fafc;
            overflow: hidden;
        }
        .ecbyts-conflict-field-title {
            padding: 10px 12px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.26);
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
        }
        .ecbyts-conflict-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .ecbyts-conflict-cell {
            display: grid;
            gap: 8px;
            align-content: start;
            min-height: 96px;
            padding: 10px 12px;
            border-right: 1px solid rgba(148, 163, 184, 0.2);
        }
        .ecbyts-conflict-cell:last-child {
            border-right: 0;
        }
        .ecbyts-conflict-cell label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            font-weight: 700;
            color: #334155;
        }
        .ecbyts-conflict-value {
            overflow-wrap: anywhere;
            color: #172033;
            font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
            font-size: 12px;
            line-height: 1.45;
            white-space: pre-wrap;
        }
        .ecbyts-conflict-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            justify-content: flex-end;
            padding: 14px 20px 20px;
            border-top: 1px solid rgba(148, 163, 184, 0.26);
        }
        .ecbyts-conflict-button {
            min-height: 34px;
            border: 1px solid rgba(100, 116, 139, 0.42);
            border-radius: 6px;
            padding: 7px 12px;
            background: #ffffff;
            color: #172033;
            font: inherit;
            font-size: 13px;
            cursor: pointer;
        }
        .ecbyts-conflict-button.primary {
            border-color: #0f766e;
            background: #0f766e;
            color: #ffffff;
        }
        .ecbyts-conflict-close {
            width: 32px;
            height: 32px;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: #475569;
            font-size: 20px;
            line-height: 1;
            cursor: pointer;
        }
        @media (max-width: 720px) {
            .ecbyts-conflict-overlay {
                align-items: flex-start;
                padding: 12px;
            }
            .ecbyts-conflict-grid {
                grid-template-columns: 1fr;
            }
            .ecbyts-conflict-cell {
                border-right: 0;
                border-bottom: 1px solid rgba(148, 163, 184, 0.2);
            }
            .ecbyts-conflict-cell:last-child {
                border-bottom: 0;
            }
            .ecbyts-conflict-button {
                flex: 1 1 100%;
            }
        }
    `;
    documentRef.head.appendChild(style);
}

function removeExisting(documentRef: any) {
    const existing = documentRef?.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
}

function actionButtonHtml(action: any) {
    return `<button type="button" class="ecbyts-conflict-button ${action.primary ? 'primary' : ''}" data-conflict-action="${escapeAttr(
        action.id,
    )}" ${action.enabled ? '' : 'disabled'}>${escapeHtml(action.label)}</button>`;
}

function selectedFieldChoices(overlay: any) {
    const choices: Record<string, any> = {};
    (overlay.querySelectorAll('[data-conflict-field]') as any).forEach((fieldEl: any) => {
        const path = fieldEl.getAttribute('data-conflict-field');
        const checked = fieldEl.querySelector('input[type="radio"]:checked') as any;
        if (path && checked?.value) choices[path] = checked.value;
    });
    return choices;
}

function wireModalKeyboard(overlay: any, close: any) {
    overlay.addEventListener('keydown', (event: any) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(
            overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        ).filter((el: any) => !el.disabled && el.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0] as any;
        const last = focusable[focusable.length - 1] as any;
        if (event.shiftKey && overlay.ownerDocument.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && overlay.ownerDocument.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
}

/**
 * Mount or update the three-way conflict modal in the browser DOM.
 */
export function mountConflictResolverModal(
    state: ReturnType<typeof buildConflictModalState>,
    options: { documentRef?: Document; onAction?: Function; onClose?: Function } = {},
) {
    const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
    if (!documentRef) return null;
    removeExisting(documentRef);
    if (!(state as any)?.visible) return null;

    ensureConflictStyles(documentRef);
    const previousFocus = documentRef.activeElement as any;
    const overlay = documentRef.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'ecbyts-conflict-overlay modal-overlay active';
    const s = state as any;
    overlay.innerHTML = `
        <section class="ecbyts-conflict-modal" role="${escapeAttr(s.aria.role)}" aria-modal="${
            s.aria.modal ? 'true' : 'false'
        }" aria-labelledby="${escapeAttr(s.aria.labelledBy)}" aria-describedby="${escapeAttr(
            s.aria.describedBy,
        )}" tabindex="-1">
            <header>
                <div>
                    <h2 class="ecbyts-conflict-title" id="${escapeAttr(s.aria.labelledBy)}">${escapeHtml(
                        s.title,
                    )}</h2>
                    <p class="ecbyts-conflict-description" id="${escapeAttr(s.aria.describedBy)}">${escapeHtml(
                        s.message,
                    )}</p>
                </div>
                <button type="button" class="ecbyts-conflict-close" aria-label="Fechar">x</button>
            </header>
            <div class="ecbyts-conflict-body">
                ${s.fields
                    .map(
                        (field: any) => `
                    <section class="ecbyts-conflict-field" data-conflict-field="${escapeAttr(field.path)}">
                        <div class="ecbyts-conflict-field-title">${escapeHtml(field.label)}</div>
                        <div class="ecbyts-conflict-grid" role="radiogroup" aria-label="${escapeAttr(field.label)}">
                            ${s.columns
                                .map(
                                    (column: any) => `
                                <div class="ecbyts-conflict-cell">
                                    <label>
                                        <input type="radio" name="conflict-${escapeAttr(field.path)}" value="${escapeAttr(
                                            column.id === 'original' ? 'custom' : column.id,
                                        )}" ${field.selectedChoice === column.id ? 'checked' : ''}>
                                        ${escapeHtml(column.label)}
                                    </label>
                                    <div class="ecbyts-conflict-value">${escapeHtml(field.values[column.id])}</div>
                                </div>
                            `,
                                )
                                .join('')}
                        </div>
                    </section>
                `,
                    )
                    .join('')}
            </div>
            <div class="ecbyts-conflict-actions">${s.actions.map(actionButtonHtml).join('')}</div>
        </section>
    `;
    const close = () => {
        overlay.remove();
        options.onClose?.(state);
        if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    };
    overlay.querySelector('.ecbyts-conflict-close')?.addEventListener('click', close);
    wireModalKeyboard(overlay, close);
    (overlay.querySelectorAll('[data-conflict-action]') as any).forEach((button: any) => {
        button.addEventListener('click', () => {
            const actionId = button.getAttribute('data-conflict-action');
            let command: any;
            try {
                command = planConflictAction(state, actionId, selectedFieldChoices(overlay));
            } catch (error) {
                console.warn('[ecbyts:conflict] action failed:', (error as any)?.message || error);
                return;
            }
            Promise.resolve(options.onAction?.(command, state)).then((result: any) => {
                if (result !== false) close();
            });
        });
    });
    documentRef.body.appendChild(overlay);
    const first = overlay.querySelector('button, input') as any;
    if (first && typeof first.focus === 'function') first.focus();
    return overlay;
}

export default { CONFLICT_ACTIONS, buildConflictModalState, planConflictAction, mountConflictResolverModal };
