// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE — F3 wire UI modais.
 * (claude - novaspec, 2026-06-03).
 *
 * Wire DOM dos 3 modais §5 da spec. Reusa createModal + showToast existentes
 * (M2.5 + zero deps novas). Pure-logic em _ecbtCryptoModalsPure.ts.
 *
 * Modais entregues nesta fase:
 *   - openEcbtCryptoInfoModal: card informativo no hub (UI Visibility Rule)
 *   - openExportEcbtModal: picker A/C/D + lista de recipients autorizados
 *   - openImportErrorModal: mensagem actionable quando decode falha
 *
 * Modal "Radar profile security block" virá no F3.2 (precisa wire com
 * radar_profiles Supabase para listar profiles reais — agora é spec-only).
 */

import { createModal } from './modal.js';
import { showToast } from './toast.js';
import { t } from '../i18n/translations.js';
import {
    I18N_NAMESPACE,
    buildExportModalState,
    buildImportErrorState,
    type KeyTypeOption,
    type ProfileForExport,
    type ImportErrorState,
} from './_ecbtCryptoModalsPure.js';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function i18n(key: string, fallback: string): string {
    try {
        const v = t ? t(key) : '';
        return v || fallback;
    } catch {
        return fallback;
    }
}

function mkEl(tag: string, opts?: { class?: string; text?: string; html?: string; attrs?: Record<string, string> }): HTMLElement {
    const el = document.createElement(tag);
    if (opts?.class) el.className = opts.class;
    if (opts?.text) el.textContent = opts.text;
    if (opts?.html) el.innerHTML = opts.html;
    if (opts?.attrs) {
        for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
    }
    return el;
}

// ----------------------------------------------------------------
// Modal: info (entry do hub)
// ----------------------------------------------------------------

export function openEcbtCryptoInfoModal(): void {
    const body = mkEl('div', { class: 'ecbt-crypto-info' });

    const intro = mkEl('p', {
        text: i18n(
            `${I18N_NAMESPACE}.info.intro`,
            'Chaves ECBT podem ser criptografadas por perfil de stakeholder do radar. Apenas os perfis autorizados conseguem decifrar.',
        ),
    });
    body.appendChild(intro);

    const list = mkEl('ul');
    const features: Array<[string, string]> = [
        ['info.feature.envelope', 'Envelope encryption multi-recipient (JWE RFC 7516)'],
        ['info.feature.alg', 'AES-GCM 256 + ECDH P-256 (Web Crypto nativo)'],
        ['info.feature.audit', 'Audit log no Supabase (issue/unwrap/revoke/rotate)'],
        ['info.feature.compat', 'Coexiste com Tipos A/B/C — sem quebra'],
    ];
    for (const [key, fb] of features) {
        const li = mkEl('li', { text: i18n(`${I18N_NAMESPACE}.${key}`, fb) });
        list.appendChild(li);
    }
    body.appendChild(list);

    const status = mkEl('p', {
        class: 'ecbt-crypto-status',
        text: i18n(
            `${I18N_NAMESPACE}.info.statusFeatureFlag`,
            'Status: F1+F2 entregues (51 testes verdes). UI completa em F3. Feature flag default OFF até DoD verde.',
        ),
    });
    body.appendChild(status);

    createModal({
        title: i18n(`${I18N_NAMESPACE}.info.title`, 'Criptografia ECBT — informações'),
        size: 'md',
        body,
        closeOnEsc: true,
        closeOnBackdropClick: true,
        extraClass: 'ecbt-crypto-info-dialog',
    });
}

// ----------------------------------------------------------------
// Modal: export picker (A/C/D + recipients)
// ----------------------------------------------------------------

export interface ExportModalOpts {
    readonly profiles: ReadonlyArray<ProfileForExport>;
    readonly initialType?: KeyTypeOption;
    readonly onConfirm: (type: KeyTypeOption, authorizedProfileIds: string[]) => void | Promise<void>;
}

export function openExportEcbtModal(opts: ExportModalOpts): void {
    if (!opts || !Array.isArray(opts.profiles)) {
        console.error('[ecbtCryptoModals] profiles[] required');
        return;
    }
    let selectedType: KeyTypeOption = opts.initialType || 'D';

    const body = mkEl('div', { class: 'ecbt-crypto-export' });
    const intro = mkEl('p', {
        text: i18n(`${I18N_NAMESPACE}.export.intro`, 'Escolha como sua chave ECBT será gerada:'),
    });
    body.appendChild(intro);

    // Radio picker A/C/D
    const picker = mkEl('div', { class: 'ecbt-crypto-export-picker', attrs: { role: 'radiogroup' } });
    const types: Array<{ value: KeyTypeOption; labelKey: string; fb: string }> = [
        { value: 'A', labelKey: 'export.option.A', fb: 'Tipo A — simples (apenas ofuscação)' },
        { value: 'C', labelKey: 'export.option.C', fb: 'Tipo C — comprimida (sem criptografia)' },
        { value: 'D', labelKey: 'export.option.D', fb: 'Tipo D — criptografada por perfil (RECOMENDADO)' },
    ];
    for (const opt of types) {
        const label = mkEl('label', { class: 'ecbt-crypto-export-option' });
        const radio = mkEl('input', {
            attrs: {
                type: 'radio',
                name: 'ecbt-key-type',
                value: opt.value,
                ...(opt.value === selectedType ? { checked: 'checked' } : {}),
            },
        }) as HTMLInputElement;
        radio.addEventListener('change', () => {
            if ((radio as any).checked) {
                selectedType = opt.value;
                _renderSummary(body, selectedType, opts.profiles);
            }
        });
        label.appendChild(radio);
        label.appendChild(mkEl('span', { text: ' ' + i18n(`${I18N_NAMESPACE}.${opt.labelKey}`, opt.fb) }));
        picker.appendChild(label);
    }
    body.appendChild(picker);

    // Summary + warnings (re-render on type change)
    _renderSummary(body, selectedType, opts.profiles);

    // Actions
    const actions = mkEl('div', { class: 'ecbt-crypto-export-actions' });
    const cancelBtn = mkEl('button', {
        class: 'btn btn-secondary',
        text: i18n(`${I18N_NAMESPACE}.export.cancel`, 'Cancelar'),
        attrs: { type: 'button' },
    });
    const confirmBtn = mkEl('button', {
        class: 'btn btn-primary',
        text: i18n(`${I18N_NAMESPACE}.export.confirm`, 'Exportar'),
        attrs: { type: 'button' },
    });

    const handle = createModal({
        title: i18n(`${I18N_NAMESPACE}.export.modalTitle`, 'Exportar chave ECBT'),
        size: 'md',
        body,
        closeOnEsc: true,
        extraClass: 'ecbt-crypto-export-dialog',
    });

    cancelBtn.addEventListener('click', () => handle.close());
    confirmBtn.addEventListener('click', async () => {
        const state = buildExportModalState(selectedType, opts.profiles);
        if (state.selectedType === 'D' && !state.canExportTypeD) {
            showToast(
                i18n(
                    `${I18N_NAMESPACE}.export.toast.cannotExportD`,
                    'Nenhum perfil tem chave registrada. Convide pelo menos um antes de exportar como Tipo D.',
                ),
                'error',
            );
            return;
        }
        const authorizedIds = state.recipients
            .filter((p) => p.hasEcdhKey)
            .map((p) => p.profileId);
        handle.close();
        try {
            await opts.onConfirm(state.selectedType, authorizedIds);
            showToast(
                i18n(`${I18N_NAMESPACE}.export.toast.success`, 'Chave ECBT exportada com sucesso.'),
                'success',
            );
        } catch (e: any) {
            showToast(
                (e?.message || i18n(`${I18N_NAMESPACE}.export.toast.failed`, 'Falha ao exportar chave.')),
                'error',
            );
        }
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    body.appendChild(actions);
}

function _renderSummary(
    body: HTMLElement,
    selectedType: KeyTypeOption,
    profiles: ReadonlyArray<ProfileForExport>,
): void {
    // Remove summary anterior
    const old = body.querySelector('.ecbt-crypto-export-summary');
    if (old) old.remove();

    const state = buildExportModalState(selectedType, profiles);
    const summary = mkEl('div', { class: 'ecbt-crypto-export-summary' });

    if (selectedType === 'D') {
        const counts = mkEl('p', {
            text:
                i18n(
                    `${I18N_NAMESPACE}.export.recipientCounts`,
                    'Perfis autorizados (com chave registrada): {n} · Sem chave: {m}',
                )
                    .replace('{n}', String(state.authorizedCount))
                    .replace('{m}', String(state.missingCount)),
        });
        summary.appendChild(counts);
    }

    for (const wkey of state.warningKeys) {
        const w = mkEl('p', {
            class: 'ecbt-crypto-warning',
            text: i18n(wkey, '⚠ ' + wkey),
        });
        summary.appendChild(w);
    }

    // Insert before actions if exists, else append
    const actionsEl = body.querySelector('.ecbt-crypto-export-actions');
    if (actionsEl) {
        body.insertBefore(summary, actionsEl);
    } else {
        body.appendChild(summary);
    }
}

// ----------------------------------------------------------------
// Modal: import error (não autorizado / corrompido / etc.)
// ----------------------------------------------------------------

export interface ImportErrorModalOpts {
    readonly errorKind: ImportErrorState['errorKind'];
    readonly myProfileId: string;
    readonly authorizedCountInKey?: number;
    readonly onAskAccess?: () => void;
}

export function openImportErrorModal(opts: ImportErrorModalOpts): void {
    const state = buildImportErrorState(opts.errorKind, opts.myProfileId, opts.authorizedCountInKey ?? 0);

    const body = mkEl('div', { class: 'ecbt-crypto-import-error', attrs: { role: 'alert' } });

    const headlineKey = `${I18N_NAMESPACE}.import.headline.${state.errorKind}`;
    const headline = mkEl('p', {
        class: 'ecbt-crypto-import-error-headline',
        text: i18n(headlineKey, _defaultHeadline(state.errorKind)),
    });
    body.appendChild(headline);

    if (state.errorKind === 'not_authorized') {
        const detail = mkEl('p', {
            text:
                i18n(
                    `${I18N_NAMESPACE}.import.detailNotAuthorized`,
                    'Seu perfil ({pid}) não está na lista de destinatários autorizados desta chave ({n} perfis autorizados).',
                )
                    .replace('{pid}', state.myProfileIdMasked)
                    .replace('{n}', String(state.authorizedCountInKey)),
        });
        body.appendChild(detail);
    }

    if (state.actionKeys.length > 0) {
        const actionsTitle = mkEl('p', {
            class: 'ecbt-crypto-import-actions-title',
            text: i18n(`${I18N_NAMESPACE}.import.actionsTitle`, 'O que você pode fazer:'),
        });
        body.appendChild(actionsTitle);
        const list = mkEl('ul');
        for (const akey of state.actionKeys) {
            const li = mkEl('li', { text: i18n(akey, akey.split('.').pop() || akey) });
            list.appendChild(li);
        }
        body.appendChild(list);
    }

    const actions = mkEl('div', { class: 'ecbt-crypto-import-error-actions' });
    const closeBtn = mkEl('button', {
        class: 'btn btn-secondary',
        text: i18n(`${I18N_NAMESPACE}.import.close`, 'Fechar'),
        attrs: { type: 'button' },
    });
    if (state.errorKind === 'not_authorized' && opts.onAskAccess) {
        const askBtn = mkEl('button', {
            class: 'btn btn-primary',
            text: i18n(`${I18N_NAMESPACE}.import.askAccess`, 'Pedir acesso ao dono'),
            attrs: { type: 'button' },
        });
        actions.appendChild(askBtn);
        const handle = createModal({
            title: i18n(`${I18N_NAMESPACE}.import.title`, 'Não é possível abrir esta chave'),
            size: 'md',
            body,
            closeOnEsc: true,
            extraClass: 'ecbt-crypto-import-error-dialog',
        });
        askBtn.addEventListener('click', () => {
            handle.close();
            opts.onAskAccess?.();
        });
        closeBtn.addEventListener('click', () => handle.close());
        actions.appendChild(closeBtn);
        body.appendChild(actions);
        return;
    }

    const handle = createModal({
        title: i18n(`${I18N_NAMESPACE}.import.title`, 'Não é possível abrir esta chave'),
        size: 'md',
        body,
        closeOnEsc: true,
        extraClass: 'ecbt-crypto-import-error-dialog',
    });
    closeBtn.addEventListener('click', () => handle.close());
    actions.appendChild(closeBtn);
    body.appendChild(actions);
}

function _defaultHeadline(kind: ImportErrorState['errorKind']): string {
    if (kind === 'not_authorized') return 'Você não está autorizado a abrir esta chave.';
    if (kind === 'corrupted') return 'Esta chave parece estar corrompida ou modificada.';
    if (kind === 'no_private_key') return 'Você ainda não tem keyring registrado.';
    if (kind === 'unsupported_browser') return 'Seu navegador não suporta a criptografia necessária.';
    return 'Erro ao abrir chave ECBT.';
}
