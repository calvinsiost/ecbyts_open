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
 * recoveryDialog.js - crash recovery dialog contract.
 *
 * This module turns autosave snapshots into a safe view model and recovery
 * commands. It intentionally omits DOM rendering so boot code can decide where
 * and when to mount the dialog.
 */

import { escapeAttr, escapeHtml } from '../helpers/html.js';
import { formatBytes as _formatBytesCanonical } from '../helpers/formatBytes.js';

export const RECOVERY_ACTIONS = Object.freeze({
    RESTORE: 'restore',
    DISCARD: 'discard',
    VIEW_DIFF: 'view_diff',
});

export const CORRUPTION_ACTIONS = Object.freeze({
    RESET_WORKSPACE: 'reset_workspace',
    EXPORT_RAW: 'export_raw',
    CANCEL: 'cancel',
});

const DEFAULT_MAX_SNAPSHOTS = 3;
const RECOVERY_OVERLAY_ID = 'ecbyts-recovery-overlay';
const CORRUPTION_OVERLAY_ID = 'ecbyts-storage-corruption-overlay';
const STYLE_ID = 'ecbyts-recovery-dialog-styles';

function finiteTimestamp(value: any) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function countCollection(value: any) {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return 0;
}

function estimateSizeBytes(raw: any) {
    if (Number.isInteger(raw?.sizeBytes) && raw.sizeBytes >= 0) return raw.sizeBytes;
    try {
        return JSON.stringify(raw?.payload ?? raw?.model ?? raw ?? {}).length;
    } catch {
        return 0;
    }
}

function payloadOf(raw: any) {
    return raw?.payload ?? raw?.model ?? raw?.snapshot ?? raw?.data ?? null;
}

function normalizeSnapshot(raw: any, index: any) {
    const timestamp = finiteTimestamp(raw?.timestamp ?? raw?.updatedAt ?? raw?.createdAt ?? raw?.lastSavedAt);
    if (timestamp == null) return null;
    const payload = payloadOf(raw);
    return Object.freeze({
        id: String(raw?.id || raw?.snapshotId || `autosave-${timestamp}-${index}`),
        timestamp,
        sizeBytes: estimateSizeBytes(raw),
        elementCount: Number.isInteger(raw?.elementCount) ? raw.elementCount : countCollection(payload?.elements),
        campaignCount: Number.isInteger(raw?.campaignCount) ? raw.campaignCount : countCollection(payload?.campaigns),
        sceneCount: Number.isInteger(raw?.sceneCount) ? raw.sceneCount : countCollection(payload?.scenes),
        source: String(raw?.source || 'autosave'),
    });
}

function formatAge(ageMs: any) {
    if (!Number.isFinite(ageMs) || ageMs < 0) return 'agora';
    const seconds = Math.floor(ageMs / 1000);
    if (seconds < 60) return 'agora';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min atras`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h atras`;
    const days = Math.floor(hours / 24);
    return `${days} d atras`;
}

function freezeSnapshots(snapshots: any) {
    return Object.freeze(snapshots.map((s: any) => Object.freeze({ ...s })));
}

function freezeActions(actions: any) {
    return Object.freeze(actions.map((a: any) => Object.freeze({ ...a })));
}

function freezeItems(items: any) {
    return Object.freeze(items.map((item: any) => Object.freeze({ ...item })));
}

function freezeState(state: any) {
    return Object.freeze({
        kind: 'crash-recovery-dialog',
        visible: state.visible,
        friendlyState: state.friendlyState,
        title: state.title,
        message: state.message,
        selectedSnapshotId: state.selectedSnapshotId,
        snapshots: freezeSnapshots(state.snapshots),
        actions: freezeActions(state.actions),
        aria: Object.freeze({
            role: 'dialog',
            modal: true,
            labelledBy: 'ecbyts-recovery-title',
            describedBy: 'ecbyts-recovery-description',
        }),
    });
}

function freezeCorruptionState(state: any) {
    return Object.freeze({
        kind: 'storage-corruption-dialog',
        visible: state.visible,
        friendlyState: state.friendlyState,
        title: state.title,
        message: state.message,
        selectedKey: state.selectedKey,
        corruptKeys: Object.freeze(state.corruptKeys.slice()),
        rawBytes: state.rawBytes,
        items: freezeItems(state.items),
        actions: freezeActions(state.actions),
        aria: Object.freeze({
            role: 'dialog',
            modal: true,
            labelledBy: 'ecbyts-corruption-title',
            describedBy: 'ecbyts-corruption-description',
        }),
    });
}

/**
 * Build the crash recovery view model from stored autosave snapshots.
 */
export function buildRecoveryDialogState(
    input: {
        snapshots?: any[];
        currentSessionLastSavedAt?: number | string | null;
        now?: number;
        selectedSnapshotId?: string | null;
        maxSnapshots?: number;
    } = {},
) {
    const currentSessionLastSavedAt = finiteTimestamp(input.currentSessionLastSavedAt) ?? 0;
    const now = typeof input.now === 'number' && Number.isFinite(input.now) ? input.now : Date.now();
    const maxSnapshots =
        input.maxSnapshots == null ? DEFAULT_MAX_SNAPSHOTS : Math.max(1, Math.floor(Number(input.maxSnapshots)));
    const normalized = (Array.isArray(input.snapshots) ? input.snapshots : [])
        .map(normalizeSnapshot)
        .filter(Boolean)
        .filter((s: any) => s.timestamp > currentSessionLastSavedAt)
        .sort((a: any, b: any) => b.timestamp - a.timestamp)
        .slice(0, maxSnapshots);

    if (normalized.length === 0) {
        return freezeState({
            visible: false,
            friendlyState: 'clean',
            title: 'Trabalho nao salvo encontrado',
            message: '',
            selectedSnapshotId: null,
            snapshots: [],
            actions: [],
        });
    }

    const selectedSnapshotId = normalized.some((s: any) => s.id === input.selectedSnapshotId)
        ? input.selectedSnapshotId
        : (normalized[0] as any).id;
    const snapshots = normalized.map((s: any) => ({
        ...s,
        selected: s.id === selectedSnapshotId,
        ageMs: Math.max(0, now - s.timestamp),
        ageLabel: formatAge(now - s.timestamp),
    }));
    const actions = [
        { id: RECOVERY_ACTIONS.VIEW_DIFF, label: 'Ver diferencas', enabled: true, primary: false },
        { id: RECOVERY_ACTIONS.DISCARD, label: 'Descartar', enabled: true, primary: false },
        { id: RECOVERY_ACTIONS.RESTORE, label: 'Restaurar selecionado', enabled: true, primary: true },
    ];

    return freezeState({
        visible: true,
        friendlyState: 'restore_available',
        title: 'Trabalho nao salvo encontrado',
        message: 'Detectamos snapshots mais recentes que sua ultima sessao.',
        selectedSnapshotId,
        snapshots,
        actions,
    });
}

/**
 * Translate a dialog action into a command for the boot integration layer.
 */
export function planRecoveryAction(
    state: any,
    actionId: any,
    snapshotId: any = state.selectedSnapshotId,
) {
    const action = state.actions.find((a: any) => a.id === actionId);
    if (!action) throw new Error(`Unknown recovery action: ${actionId}`);
    if (!action.enabled) throw new Error(`Recovery action disabled: ${actionId}`);

    if (actionId === RECOVERY_ACTIONS.DISCARD) {
        return Object.freeze({
            type: 'discard_autosave_snapshots',
            snapshotIds: Object.freeze(state.snapshots.map((s: any) => s.id)),
            source: 'crash-recovery-dialog',
        });
    }

    const selected = state.snapshots.find((s: any) => s.id === snapshotId);
    if (!selected) throw new Error(`Snapshot not found: ${snapshotId}`);

    if (actionId === RECOVERY_ACTIONS.VIEW_DIFF) {
        return Object.freeze({
            type: 'view_snapshot_diff',
            snapshotId: selected.id,
            source: 'crash-recovery-dialog',
        });
    }

    return Object.freeze({
        type: 'restore_snapshot',
        snapshotId: selected.id,
        requiresValidation: true,
        source: 'crash-recovery-dialog',
    });
}

/**
 * Build the corrupted localStorage recovery modal contract.
 */
export function buildCorruptionDialogState(
    input: { report?: any; corruptKeys?: string[]; rawBytes?: number; selectedKey?: string | null } = {},
) {
    const report = input.report && typeof input.report === 'object' ? input.report : null;
    const keys = Array.isArray(input.corruptKeys)
        ? input.corruptKeys
        : Array.isArray(report?.corruptKeys)
          ? report.corruptKeys
          : [];
    const corruptKeys = keys.map((key: any) => String(key)).filter(Boolean);
    const rawBytes = Number.isFinite(input.rawBytes)
        ? input.rawBytes
        : Number.isFinite(report?.rawBytes)
          ? report.rawBytes
          : 0;

    if (corruptKeys.length === 0) {
        return freezeCorruptionState({
            visible: false,
            friendlyState: 'clean',
            title: 'Workspace corrompido',
            message: '',
            selectedKey: null,
            corruptKeys: [],
            rawBytes: 0,
            items: [],
            actions: [],
        });
    }

    const selectedKey = corruptKeys.includes(input.selectedKey as any)
        ? input.selectedKey
        : corruptKeys[0];
    const items = corruptKeys.map((key: any) => ({
        key,
        selected: key === selectedKey,
        issue: 'JSON invalido',
    }));
    const actions = [
        {
            id: CORRUPTION_ACTIONS.EXPORT_RAW,
            label: 'Exportar dados brutos',
            enabled: true,
            primary: false,
        },
        {
            id: CORRUPTION_ACTIONS.CANCEL,
            label: 'Cancelar',
            enabled: true,
            primary: false,
        },
        {
            id: CORRUPTION_ACTIONS.RESET_WORKSPACE,
            label: 'Resetar workspace',
            enabled: true,
            primary: true,
            destructive: true,
        },
    ];

    return freezeCorruptionState({
        visible: true,
        friendlyState: 'workspace_corrupt',
        title: 'Workspace corrompido',
        message: 'Encontramos dados locais invalidos. Exporte os dados brutos ou resete o workspace.',
        selectedKey,
        corruptKeys,
        rawBytes: Math.max(0, rawBytes),
        items,
        actions,
    });
}

/**
 * Translate a corrupted-storage dialog action into a boot command.
 */
export function planCorruptionAction(
    state: any,
    actionId: any,
    key: any = state.selectedKey,
) {
    const action = state.actions.find((a: any) => a.id === actionId);
    if (!action) throw new Error(`Unknown corruption recovery action: ${actionId}`);
    if (!action.enabled) throw new Error(`Corruption recovery action disabled: ${actionId}`);

    if (actionId === CORRUPTION_ACTIONS.RESET_WORKSPACE) {
        return Object.freeze({
            type: 'reset_corrupted_workspace',
            keys: Object.freeze(state.corruptKeys.slice()),
            destructive: true,
            source: 'storage-corruption-dialog',
        });
    }

    if (actionId === CORRUPTION_ACTIONS.EXPORT_RAW) {
        if (!state.corruptKeys.includes(key)) throw new Error(`Corrupt storage key not found: ${key}`);
        return Object.freeze({
            type: 'export_raw_storage_entry',
            key,
            includeRaw: false,
            source: 'storage-corruption-dialog',
        });
    }

    return Object.freeze({
        type: 'cancel_storage_recovery',
        source: 'storage-corruption-dialog',
    });
}

function ensureRecoveryDialogStyles(documentRef: any) {
    if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
    const style = documentRef.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .ecbyts-recovery-overlay {
            position: fixed;
            inset: 0;
            z-index: 3200;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: rgba(9, 14, 23, 0.58);
        }
        .ecbyts-recovery-modal {
            width: min(640px, 100%);
            max-height: min(780px, calc(100vh - 48px));
            overflow: auto;
            border: 1px solid rgba(148, 163, 184, 0.34);
            border-radius: 8px;
            background: #ffffff;
            color: #172033;
            box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
        }
        .ecbyts-recovery-modal header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            padding: 18px 20px 12px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.26);
        }
        .ecbyts-recovery-title {
            margin: 0;
            font-size: 18px;
            line-height: 1.25;
            font-weight: 700;
            letter-spacing: 0;
        }
        .ecbyts-recovery-description {
            margin: 6px 0 0;
            color: #475569;
            font-size: 13px;
            line-height: 1.45;
        }
        .ecbyts-recovery-body {
            padding: 16px 20px;
        }
        .ecbyts-recovery-list {
            display: grid;
            gap: 10px;
            margin: 0;
            padding: 0;
            list-style: none;
        }
        .ecbyts-recovery-item {
            display: grid;
            grid-template-columns: 22px 1fr;
            gap: 10px;
            align-items: start;
            padding: 12px;
            border: 1px solid rgba(148, 163, 184, 0.34);
            border-radius: 8px;
            background: #f8fafc;
        }
        .ecbyts-recovery-item input {
            margin-top: 2px;
        }
        .ecbyts-recovery-item strong {
            display: block;
            font-size: 14px;
            line-height: 1.3;
            color: #0f172a;
        }
        .ecbyts-recovery-meta {
            margin-top: 4px;
            color: #64748b;
            font-size: 12px;
            line-height: 1.35;
        }
        .ecbyts-recovery-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            justify-content: flex-end;
            padding: 14px 20px 20px;
            border-top: 1px solid rgba(148, 163, 184, 0.26);
        }
        .ecbyts-recovery-button {
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
        .ecbyts-recovery-button:hover {
            background: #f1f5f9;
        }
        .ecbyts-recovery-button.primary {
            border-color: #0f766e;
            background: #0f766e;
            color: #ffffff;
        }
        .ecbyts-recovery-button.destructive {
            border-color: #b91c1c;
            background: #b91c1c;
            color: #ffffff;
        }
        .ecbyts-recovery-close {
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
        .ecbyts-recovery-close:hover {
            background: #f1f5f9;
        }
        @media (max-width: 520px) {
            .ecbyts-recovery-overlay {
                align-items: flex-start;
                padding: 12px;
            }
            .ecbyts-recovery-actions {
                justify-content: stretch;
            }
            .ecbyts-recovery-button {
                flex: 1 1 100%;
            }
        }
    `;
    documentRef.head.appendChild(style);
}

function removeExisting(documentRef: any, id: any) {
    const existing = documentRef?.getElementById(id);
    if (existing) existing.remove();
}

function formatBytes(bytes: any) {
    return _formatBytesCanonical(bytes, { unknownLabel: '0 B', maxUnit: 'MB', kbDecimals: 1 });
}

function focusFirstControl(overlay: any) {
    const focusable = overlay.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable && typeof focusable.focus === 'function') focusable.focus();
}

function wireModalKeyboard(overlay: any, close: any) {
    overlay.addEventListener('keydown', (event: any) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = (
            Array.from(
                overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
            )
        ).filter((el: any) => !el.disabled && el.offsetParent !== null) as any[];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
}

function bindActionButtons({ overlay, state, planAction, selectedSelector, onAction, close }: any) {
    overlay.querySelectorAll('[data-recovery-action]').forEach((button: any) => {
        button.addEventListener('click', () => {
            const actionId = button.getAttribute('data-recovery-action');
            const selected = overlay.querySelector(selectedSelector);
            const selectedValue = selected?.value || undefined;
            let command;
            try {
                command = planAction(state, actionId, selectedValue);
            } catch (error: any) {
                console.warn('[ecbyts:recovery] action failed:', error?.message || error);
                return;
            }
            Promise.resolve(onAction?.(command, state)).then((result: any) => {
                if (result !== false) close();
            });
        });
    });
}

function actionButtonHtml(action: any) {
    const classes = ['ecbyts-recovery-button'];
    if (action.primary) classes.push('primary');
    if (action.destructive) classes.push('destructive');
    return `<button type="button" class="${classes.join(' ')}" data-recovery-action="${escapeAttr(action.id)}" ${
        action.enabled ? '' : 'disabled'
    }>${escapeHtml(action.label)}</button>`;
}

/**
 * Mount or update the crash recovery dialog in the browser DOM.
 */
export function mountRecoveryDialog(state: any, options: any = {}) {
    const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
    if (!documentRef) return null;
    removeExisting(documentRef, RECOVERY_OVERLAY_ID);
    if (!state?.visible) return null;

    ensureRecoveryDialogStyles(documentRef);
    const previousFocus = documentRef.activeElement;
    const overlay = documentRef.createElement('div');
    overlay.id = RECOVERY_OVERLAY_ID;
    overlay.className = 'ecbyts-recovery-overlay modal-overlay active';
    overlay.innerHTML = `
        <section class="ecbyts-recovery-modal" role="${escapeAttr(state.aria.role)}" aria-modal="${
            state.aria.modal ? 'true' : 'false'
        }" aria-labelledby="${escapeAttr(state.aria.labelledBy)}" aria-describedby="${escapeAttr(
            state.aria.describedBy,
        )}" tabindex="-1">
            <header>
                <div>
                    <h2 class="ecbyts-recovery-title" id="${escapeAttr(state.aria.labelledBy)}">${escapeHtml(
                        state.title,
                    )}</h2>
                    <p class="ecbyts-recovery-description" id="${escapeAttr(state.aria.describedBy)}">${escapeHtml(
                        state.message,
                    )}</p>
                </div>
                <button type="button" class="ecbyts-recovery-close" aria-label="Fechar">x</button>
            </header>
            <div class="ecbyts-recovery-body">
                <ul class="ecbyts-recovery-list">
                    ${state.snapshots
                        .map(
                            (snapshot: any) => `
                        <li class="ecbyts-recovery-item">
                            <input type="radio" name="ecbyts-recovery-snapshot" value="${escapeAttr(snapshot.id)}" ${
                                snapshot.selected ? 'checked' : ''
                            } aria-label="Selecionar snapshot ${escapeAttr(snapshot.id)}">
                            <div>
                                <strong>${escapeHtml(snapshot.ageLabel)} - ${escapeHtml(snapshot.source)}</strong>
                                <div class="ecbyts-recovery-meta">
                                    ${escapeHtml(new Date(snapshot.timestamp).toLocaleString())} - ${formatBytes(
                                        snapshot.sizeBytes,
                                    )} - ${snapshot.elementCount} elemento(s)
                                </div>
                            </div>
                        </li>
                    `,
                        )
                        .join('')}
                </ul>
            </div>
            <div class="ecbyts-recovery-actions">
                ${state.actions.map(actionButtonHtml).join('')}
            </div>
        </section>
    `;
    const close = () => {
        overlay.remove();
        options.onClose?.(state);
        if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    };
    overlay.querySelector('.ecbyts-recovery-close')?.addEventListener('click', close);
    wireModalKeyboard(overlay, close);
    bindActionButtons({
        overlay,
        state,
        planAction: planRecoveryAction,
        selectedSelector: 'input[name="ecbyts-recovery-snapshot"]:checked',
        onAction: options.onAction,
        close,
    });
    documentRef.body.appendChild(overlay);
    focusFirstControl(overlay);
    return overlay;
}

/**
 * Mount or update the corrupted-storage recovery dialog in the browser DOM.
 */
export function mountCorruptionDialog(state: any, options: any = {}) {
    const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
    if (!documentRef) return null;
    removeExisting(documentRef, CORRUPTION_OVERLAY_ID);
    if (!state?.visible) return null;

    ensureRecoveryDialogStyles(documentRef);
    const previousFocus = documentRef.activeElement;
    const overlay = documentRef.createElement('div');
    overlay.id = CORRUPTION_OVERLAY_ID;
    overlay.className = 'ecbyts-recovery-overlay modal-overlay active';
    overlay.innerHTML = `
        <section class="ecbyts-recovery-modal" role="${escapeAttr(state.aria.role)}" aria-modal="${
            state.aria.modal ? 'true' : 'false'
        }" aria-labelledby="${escapeAttr(state.aria.labelledBy)}" aria-describedby="${escapeAttr(
            state.aria.describedBy,
        )}" tabindex="-1">
            <header>
                <div>
                    <h2 class="ecbyts-recovery-title" id="${escapeAttr(state.aria.labelledBy)}">${escapeHtml(
                        state.title,
                    )}</h2>
                    <p class="ecbyts-recovery-description" id="${escapeAttr(state.aria.describedBy)}">${escapeHtml(
                        state.message,
                    )}</p>
                </div>
                <button type="button" class="ecbyts-recovery-close" aria-label="Fechar">x</button>
            </header>
            <div class="ecbyts-recovery-body">
                <ul class="ecbyts-recovery-list">
                    ${state.items
                        .map(
                            (item: any) => `
                        <li class="ecbyts-recovery-item">
                            <input type="radio" name="ecbyts-corrupt-key" value="${escapeAttr(item.key)}" ${
                                item.selected ? 'checked' : ''
                            } aria-label="Selecionar chave ${escapeAttr(item.key)}">
                            <div>
                                <strong>${escapeHtml(item.key)}</strong>
                                <div class="ecbyts-recovery-meta">${escapeHtml(item.issue)} - ${formatBytes(
                                    state.rawBytes,
                                )} brutos afetados</div>
                            </div>
                        </li>
                    `,
                        )
                        .join('')}
                </ul>
            </div>
            <div class="ecbyts-recovery-actions">
                ${state.actions.map(actionButtonHtml).join('')}
            </div>
        </section>
    `;
    const close = () => {
        overlay.remove();
        options.onClose?.(state);
        if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    };
    overlay.querySelector('.ecbyts-recovery-close')?.addEventListener('click', close);
    wireModalKeyboard(overlay, close);
    bindActionButtons({
        overlay,
        state,
        planAction: planCorruptionAction,
        selectedSelector: 'input[name="ecbyts-corrupt-key"]:checked',
        onAction: options.onAction,
        close,
    });
    documentRef.body.appendChild(overlay);
    focusFirstControl(overlay);
    return overlay;
}

export default {
    RECOVERY_ACTIONS,
    CORRUPTION_ACTIONS,
    buildRecoveryDialogState,
    planRecoveryAction,
    buildCorruptionDialogState,
    planCorruptionAction,
    mountRecoveryDialog,
    mountCorruptionDialog,
};
