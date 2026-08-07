// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import { createModal } from './modal.js';
import { asyncConfirm } from './asyncDialogs.js';
import { escapeHtml } from '../helpers/html.js';
import {
    resolveGuardState,
    buildAvatarStateVM,
    buildGuardToggleVM,
    buildAuditPanelVM,
    validateGuardTransition,
} from '../../core/llm/contextGuardViewModel.js';

function renderState(state: any) {
    const vm = buildAvatarStateVM(state);
    const label = state === 'off' ? 'Proteção desativada' : 'Proteção ativa';
    return `<div class="pcg-avatar" data-token="${escapeHtml(vm.colorToken || 'neutral')}">
        <span class="pcg-avatar-icon" aria-hidden="true">${escapeHtml(vm.icon || '')}</span>
        <strong class="pcg-avatar-label">${label}</strong>
    </div>`;
}

function renderToggle(vm: any) {
    const isOn = vm.state === 'on';
    const disabled = vm.disabled === true;
    return `<div class="pcg-toggle-row">
        <button type="button" class="pcg-toggle${isOn ? ' pcg-toggle--on' : ''}"
                aria-pressed="${isOn}" data-action="toggle"
                ${disabled ? 'disabled aria-disabled="true"' : ''}>
            ${isOn ? 'Desativar proteção' : 'Ativar proteção'}
        </button>
        ${disabled ? '<span class="pcg-blocked-hint">Bloqueado pela política de privacidade</span>' : ''}
        ${isOn && vm.confirmRequiredOnOff ? '<span class="pcg-confirm-hint">A desativação exige confirmação</span>' : ''}
        ${!isOn ? '<p class="pcg-warning" role="alert">Atenção: dados do projeto podem ser enviados sem generalização.</p>' : ''}
    </div>`;
}

function humanizeField(field: any) {
    const value = String(field || 'campo nao identificado');
    const element = value.match(/^elements\[(\d+)\]\.(.+)$/);
    const campaign = value.match(/^campaigns\[(\d+)\]\.(.+)$/);
    const labels: Record<string, string> = {
        siteName: 'nome',
        documentNumber: 'identificador',
        date: 'data',
        email: 'contato',
        lat: 'latitude',
        lng: 'longitude',
    };
    if (element) {
        const key = element[2] || '';
        return `${labels[key] || key} do elemento ${Number(element[1]) + 1}`;
    }
    if (campaign) {
        const key = campaign[2] || '';
        return `${labels[key] || key} da campanha ${Number(campaign[1]) + 1}`;
    }
    return labels[value] || value.replaceAll('.', ' / ');
}

function humanizeType(type: any) {
    const labels: Record<string, string> = {
        identifier: 'identificador ocultado',
        coordinate: 'localização generalizada',
        date: 'data aproximada',
        numeric: 'numero generalizado',
    };
    return labels[String(type)] || 'dado protegido';
}

function renderAudit(vm: any) {
    if (!vm?.recent?.length) {
        return '<div class="pcg-audit-empty">Nenhum dado precisou ser ocultado nesta conversa.</div>';
    }
    const items = vm.recent
        .map(
            (entry: any) => `<li class="pcg-audit-item" data-type="${escapeHtml(entry.type || 'unknown')}">
                <strong class="pcg-audit-field">${escapeHtml(humanizeField(entry.field))}</strong>
                <span class="pcg-audit-type">${escapeHtml(humanizeType(entry.type))}</span>
            </li>`,
        )
        .join('');
    return `<p class="pcg-audit-summary">${vm.totalRedactions} dado(s) protegido(s). Os valores originais não ficam neste histórico.</p>
        <ul class="pcg-audit-list">${items}</ul>`;
}

function buildBody(opts: any) {
    const body = document.createElement('div');
    body.className = 'pcg-body';
    const mode = opts.mode === 'off' ? 'open' : opts.mode === 'on' ? 'strict' : opts.mode || 'strict';
    const state = resolveGuardState(mode);
    const toggle = buildGuardToggleVM({ currentMode: mode, featureFlagEnabled: !opts.flagBlocked });
    const audit = buildAuditPanelVM(opts.redactions || []);
    body.innerHTML = `${renderState(state)}
        <p class="pcg-description">Quando ativa, nomes, identificadores, contatos, datas e localizações sensíveis são ocultados ou generalizados antes do envio para a IA.</p>
        <h4 class="pcg-section-title">Proteção do contexto</h4>
        ${renderToggle(toggle)}
        <h4 class="pcg-section-title">O que foi protegido</h4>
        ${renderAudit(audit)}`;
    return body;
}

export function openPrivacyContextGuardPanel(opts: any = {}) {
    const body = buildBody(opts);
    const handle = createModal({
        title: 'Privacidade do contexto',
        body,
        size: 'md',
        extraClass: 'pcg-modal',
        closeOnEsc: true,
        closeOnBackdropClick: true,
        onClose: opts.onClose,
    });
    handle.dialog.querySelector('[data-action="toggle"]')?.addEventListener('click', async () => {
        const from = opts.mode === 'open' || opts.mode === 'off' ? 'off' : 'on';
        const to = from === 'on' ? 'off' : 'on';
        let confirmed = false;
        if (from === 'on') {
            const confirmDisable = opts.confirmDisable || asyncConfirm;
            confirmed = await confirmDisable('Desativar a proteção de dados antes do envio para a IA?', {
                confirmLabel: 'Desativar',
                cancelLabel: 'Manter ativa',
                danger: true,
            });
            if (!confirmed) return;
        }
        const transition = validateGuardTransition({
            from,
            to,
            confirmed,
            flagEnabled: !opts.flagBlocked,
        });
        if (!transition.allowed) return;
        opts.onToggleConfirmed?.(to === 'on' ? 'strict' : 'open');
        handle.close();
    });
    return { close: handle.close };
}
