// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CLASSROOM ROSTER PANEL — RF8 (INVITE-BATCH-001)

   Painel do professor: modal .ecbt-overlay/.ecbt-dialog com a lista
   de quem entrou pelo SEU código de turma, consumindo a projeção
   pure buildClassroomRoster (via _classroomRosterPanelPure VM).

   - Dados via seam supabase padrão (RPC api.list_classroom_roster);
     degradação graciosa: sem client/RPC/permite → estado "indisponível"
     com os contadores que o caller já tinha (linha do invite).
   - "Só nomes" (spec §5): a projeção pure já minimiza (LGPD Art 16).
   - A11y: attachModalA11y (Esc, focus trap, retorno de foco),
     aria-live no corpo carregável.
   ================================================================ */

import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { attachModalA11y } from './modalA11y.js';
import { getSupabaseApiClient } from '../auth/session.js';
import { buildClassroomRosterVM, mapSeamRowsToRedemptions } from './_classroomRosterPanelPure.js';
import type { ClassroomRosterVM } from './_classroomRosterPanelPure.js';
import type { BatchInviteRow } from '../../core/freemium/_inviteBatchPure.js';

let _a11yCleanup: (() => void) | null = null;
let _controller: AbortController | null = null;

/** Linha do invite como o invitePanel a conhece (snake_case do seam). */
export interface ClassroomInviteRowLike {
    code?: unknown;
    use_count?: unknown;
    max_uses?: unknown;
    expires_at?: unknown;
    revoked_at?: unknown;
}

function _toBatchRow(inv: ClassroomInviteRowLike): BatchInviteRow {
    return {
        useCount: inv?.use_count,
        maxUses: inv?.max_uses,
        expiresAt: inv?.expires_at,
        revokedAt: inv?.revoked_at,
    };
}

function _getOrCreateOverlay(): HTMLElement {
    const existing = document.getElementById('classroom-roster-overlay') as HTMLElement | null;
    if (existing) return existing;
    const overlay = document.createElement('div');
    overlay.id = 'classroom-roster-overlay';
    overlay.className = 'ecbt-overlay';
    overlay.style.cssText = 'display:none;z-index:9200;';
    const modal = document.createElement('div');
    modal.id = 'classroom-roster-modal';
    modal.className = 'ecbt-dialog ecbt-dialog--sm';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'classroom-roster-title');
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) closeClassroomRosterPanel();
    });
    document.body.appendChild(overlay);
    return overlay;
}

/**
 * Abre o painel do professor para um código de turma.
 * @param invite Linha do invite (do getUserInvites) — traz code + metadados.
 */
export function openClassroomRosterPanel(invite: ClassroomInviteRowLike): void {
    const overlay = _getOrCreateOverlay();
    const modal = overlay.querySelector('#classroom-roster-modal') as HTMLElement;
    _controller?.abort();
    _controller = new AbortController();
    const { signal } = _controller;

    const code = String(invite?.code ?? '');
    const title = t('invite.rosterTitle') || 'Class roster';

    modal.innerHTML = `
        <div class="ecbt-header">
            <h3 class="ecbt-title" id="classroom-roster-title">${escapeHtml(title)}</h3>
            <button class="ecbt-close classroom-roster-close" type="button"
              aria-label="${escapeHtml(t('common.close') || 'Close')}">&times;</button>
        </div>
        <div class="classroom-roster-body" id="classroom-roster-body" aria-live="polite">
            <p role="status">${escapeHtml(t('invite.rosterLoading') || 'Loading…')}</p>
        </div>
    `;

    modal
        .querySelector('.classroom-roster-close')
        ?.addEventListener('click', closeClassroomRosterPanel, { signal });

    overlay.style.display = 'flex';
    _a11yCleanup = attachModalA11y(overlay, closeClassroomRosterPanel);

    void _loadAndRender(modal, code, _toBatchRow(invite), signal);
}

export function closeClassroomRosterPanel(): void {
    const overlay = document.getElementById('classroom-roster-overlay') as HTMLElement | null;
    if (overlay) overlay.style.display = 'none';
    _controller?.abort();
    _controller = null;
    if (_a11yCleanup) {
        _a11yCleanup();
        _a11yCleanup = null;
    }
}

async function _loadAndRender(
    modal: HTMLElement,
    code: string,
    batch: BatchInviteRow,
    signal: AbortSignal,
): Promise<void> {
    const body = modal.querySelector('#classroom-roster-body') as HTMLElement | null;
    if (!body) return;
    try {
        const client: any = getSupabaseApiClient();
        if (!client || typeof client.rpc !== 'function') throw new Error('supabase client unavailable');
        const { data, error } = await client.rpc('list_classroom_roster', { p_code: code });
        if (signal.aborted) return;
        if (error) throw error;
        const vm = buildClassroomRosterVM(code, batch, mapSeamRowsToRedemptions(data));
        body.innerHTML = _renderRoster(vm);
    } catch (err) {
        // Degradação graciosa: RPC ausente/negada/offline → contadores que a
        // linha do invite já trazia + aviso de indisponibilidade (não tela morta).
        console.debug('[classroomRoster:load]', (err as any)?.message || err);
        if (signal.aborted) return;
        const vm = buildClassroomRosterVM(code, batch, []);
        body.innerHTML = `
            ${_renderHeaderline(vm)}
            <p class="classroom-roster-unavailable" role="status">${escapeHtml(
                t('invite.rosterUnavailable') || 'Could not load the roster right now. Try again later.',
            )}</p>
        `;
    }
}

function _renderHeaderline(vm: ClassroomRosterVM): string {
    const stateLabel = t(vm.stateLabel.i18nKey) || vm.stateLabel.fallback;
    const accepted =
        t('invite.rosterAcceptedCount', { count: vm.counters.accepted }) ||
        `${vm.counters.accepted} joined`;
    const pending =
        vm.counters.pending > 0
            ? t('invite.rosterPendingCount', { count: vm.counters.pending }) ||
              `${vm.counters.pending} seats left`
            : '';
    return `
        <div class="classroom-roster-headerline">
            <span class="classroom-roster-code">${escapeHtml(vm.codeDisplay)}</span>
            <span class="invite-panel-badge invite-badge-${vm.state === 'active' ? 'available' : vm.state === 'exhausted' ? 'used' : 'expired'}">${escapeHtml(stateLabel)}</span>
            <span class="classroom-roster-counters">${escapeHtml(accepted)}${pending ? ' · ' + escapeHtml(pending) : ''}</span>
        </div>
    `;
}

function _renderRoster(vm: ClassroomRosterVM): string {
    if (vm.empty) {
        return `
            ${_renderHeaderline(vm)}
            <p class="classroom-roster-empty" role="status">${escapeHtml(
                t('invite.rosterEmpty') || 'No one has joined yet.',
            )}</p>
        `;
    }
    const rows = vm.entries
        .map((e) => {
            const when =
                e.redeemedAtMs != null
                    ? t('invite.rosterJoinedAt', { date: new Date(e.redeemedAtMs).toLocaleDateString() }) ||
                      `joined ${new Date(e.redeemedAtMs).toLocaleDateString()}`
                    : '';
            const status = t(e.statusLabel.i18nKey) || e.statusLabel.fallback;
            return `
            <div class="invite-panel-row classroom-roster-row" role="listitem">
                <span class="classroom-roster-name">${escapeHtml(e.displayName)}</span>
                <span class="invite-panel-badge invite-badge-available">${escapeHtml(status)}</span>
                ${when ? `<span class="classroom-roster-when">${escapeHtml(when)}</span>` : ''}
            </div>`;
        })
        .join('');
    return `
        ${_renderHeaderline(vm)}
        <div class="invite-panel-list" role="list" aria-label="${escapeHtml(
            t('invite.rosterTitle') || 'Class roster',
        )}">${rows}</div>
    `;
}
