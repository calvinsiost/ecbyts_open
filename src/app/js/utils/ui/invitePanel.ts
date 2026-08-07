// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Invite Panel - "Meus Convites" UI
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   INVITE PANEL — Painel "Meus Convites"
   Exibe os codigos de convite do usuario com status e link copiavel.

   FUNCIONALIDADES:
   - Lista de codigos gerados pelo usuario
   - Status: disponivel (verde), usado (cinza), expirado (vermelho)
   - Botao copiar link para clipboard
   - Countdown de expiracao
   ================================================================ */

import * as _sessionMod from '../auth/session.js';
const getUserInvites = (_sessionMod as any).getUserInvites;
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { isBatchInviteCode } from '../../core/freemium/_inviteBatchPure.js';
import { openClassroomRosterPanel } from './classroomRosterPanel.js';

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Render the "My Invites" panel inside a target container or as modal.
 * Renderiza o painel de convites do usuario.
 *
 * @param {HTMLElement} [container] - Elemento alvo. Se null, cria modal.
 */
export async function renderInvitePanel(container: any) {
    const invites = await getUserInvites();
    const html = _buildPanelHTML(invites);

    let target = container;
    if (!target) {
        target = _getOrCreateModal();
        (target.querySelector('.invite-panel-body') as any).innerHTML = html;
        target.style.display = 'flex';
        // Foca o diálogo p/ que Esc (WCAG 2.1.1) funcione sem clique prévio e p/
        // mover o foco do teclado para dentro do modal recém-aberto.
        (target.querySelector('.invite-panel-modal') as any)?.focus?.();
    } else {
        target.innerHTML = html;
    }

    _bindPanelEvents(target, invites);
}

/**
 * Close the invite panel modal.
 * Fecha o modal de convites.
 */
export function closeInvitePanel() {
    const modal = (document.getElementById('invite-panel-modal') as any);
    if (modal) modal.style.display = 'none';
}

// ----------------------------------------------------------------
// BUILD
// ----------------------------------------------------------------

/**
 * Build HTML for invite list.
 * @param {Array<any>} invites - Array de convites do usuario
 * @returns {string}
 */
function _buildPanelHTML(invites: any): string {
    if (!invites || invites.length === 0) {
        return `<div class="invite-panel-empty" role="status">${t('invite.noInvites') || 'No invites yet'}</div>`;
    }

    const copyLabelBase = t('invite.copyLink') || 'Copy link';

    const rows = invites
        .map((/** @type {any} */ inv: any) => {
            const status = _getInviteStatus(inv);
            const daysLeft = _getDaysLeft(inv.expires_at);
            const link = `${location.origin}/?invite=${inv.code}`;
            const formattedCode = `${inv.code.slice(0, 4)}-${inv.code.slice(4)}`;
            // aria-label específico por código p/ botão só-ícone (☍): inclui o
            // código do convite p/ leitores de tela distinguirem qual link copiar.
            const copyAriaLabel = `${copyLabelBase}: ${formattedCode}`;
            // RF8 (INVITE-BATCH-001): código de turma (TURM…) ganha botão que
            // abre o painel do professor (roster de quem entrou pelo código).
            const isClassroom = isBatchInviteCode(inv.code);
            const rosterLabel = t('invite.rosterOpen') || 'View roster';
            const rosterAriaLabel = `${rosterLabel}: ${formattedCode}`;

            return `
            <div class="invite-panel-row invite-status-${status.key}" role="listitem">
                <div class="invite-panel-code">${escapeHtml(inv.code.slice(0, 4))}-${escapeHtml(inv.code.slice(4))}</div>
                <span class="invite-panel-badge invite-badge-${status.key}">${status.label}</span>
                ${status.key === 'available' ? `<span class="invite-panel-expires">${t('invite.expiresIn', { days: daysLeft }) || daysLeft + 'd'}</span>` : ''}
                ${status.key === 'available' ? `<button class="invite-panel-copy" type="button" data-link="${escapeHtml(link)}" title="${escapeHtml(copyLabelBase)}" aria-label="${escapeHtml(copyAriaLabel)}"><span aria-hidden="true">&#9741;</span></button>` : ''}
                ${isClassroom ? `<button class="invite-panel-roster" type="button" data-code="${escapeHtml(inv.code)}" title="${escapeHtml(rosterLabel)}" aria-label="${escapeHtml(rosterAriaLabel)}"><span aria-hidden="true">&#128101;</span></button>` : ''}
            </div>
        `;
        })
        .join('');

    return `<div class="invite-panel-list" role="list" aria-label="${escapeHtml(t('invite.myInvites') || 'My Invites')}">${rows}</div>`;
}

/**
 * Get invite status based on use_count and expiry.
 * @param {any} invite
 * @returns {{key: string, label: string}}
 */
function _getInviteStatus(invite: any): {key: string, label: string} {
    if (invite.use_count >= invite.max_uses) {
        return { key: 'used', label: t('invite.codeUsed') || 'Used' };
    }
    if (new Date(invite.expires_at) < new Date()) {
        return { key: 'expired', label: t('invite.codeExpired') || 'Expired' };
    }
    return { key: 'available', label: t('invite.codeAvailable') || 'Available' };
}

/**
 * Calculate days remaining until expiry.
 * @param {string} expiresAt - ISO timestamp
 * @returns {number}
 */
function _getDaysLeft(expiresAt: any): number {
    const ms = new Date(expiresAt).getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(ms / 86400000));
}

// ----------------------------------------------------------------
// MODAL
// ----------------------------------------------------------------

/**
 * Get or create the invite panel modal container.
 * @returns {HTMLElement}
 */
function _getOrCreateModal(): HTMLElement {
    let modal = (document.getElementById('invite-panel-modal') as any);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'invite-panel-modal';
    modal.className = 'invite-panel-modal-overlay';
    const _closeLabel = t('invite.close') || t('common.close') || 'Close';
    modal.innerHTML = `
        <div class="invite-panel-modal" role="dialog" aria-modal="true" aria-labelledby="invite-panel-title" tabindex="-1">
            <div class="invite-panel-header">
                <span class="invite-panel-title" id="invite-panel-title">${t('invite.myInvites') || 'My Invites'}</span>
                <button class="invite-panel-close" id="invite-panel-close-btn" type="button" aria-label="${escapeHtml(_closeLabel)}"><span aria-hidden="true">&times;</span></button>
            </div>
            <div class="invite-panel-body"></div>
        </div>
    `;
    document.body.appendChild(modal);

    (modal.querySelector('#invite-panel-close-btn') as any).addEventListener('click', closeInvitePanel);
    modal.addEventListener('click', (e: any) => {
        if (e.target === modal) closeInvitePanel();
    });
    // WCAG 2.1.1 (teclado): permite fechar o diálogo com Esc quando ele tem foco,
    // sem depender só do clique no overlay/X. Listener no próprio modal (não em
    // document) — é um widget focável, então conta como acesso por teclado real.
    modal.addEventListener('keydown', (e: any) => {
        if (e.key === 'Escape' || e.key === 'Esc') closeInvitePanel();
    });

    return modal;
}

// ----------------------------------------------------------------
// EVENTS
// ----------------------------------------------------------------

/**
 * Bind copy-link buttons inside the panel.
 * @param {HTMLElement} container
 */
function _bindPanelEvents(container: any, invites?: any[]) {
    // RF8: botão "ver turma" nos códigos classroom abre o painel do professor.
    (container.querySelectorAll('.invite-panel-roster') as any).forEach((/** @type {any} */ btn: any) => {
        btn.addEventListener('click', () => {
            const code = btn.getAttribute('data-code');
            const inv = (invites || []).find((i: any) => i?.code === code) || { code };
            openClassroomRosterPanel(inv);
        });
    });
    (container.querySelectorAll('.invite-panel-copy') as any).forEach((/** @type {any} */ btn: any) => {
        btn.addEventListener('click', async () => {
            const link = btn.getAttribute('data-link');
            try {
                await navigator.clipboard.writeText(link);
                showToast(t('invite.linkCopied') || 'Invite link copied!', 'success');
            } catch {
                // Fallback para browsers sem clipboard API
                const ta = document.createElement('textarea');
                ta.value = link;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                showToast(t('invite.linkCopied') || 'Invite link copied!', 'success');
            }
        });
    });
}
