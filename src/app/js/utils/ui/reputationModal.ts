// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under AGPL-3.0-only
//
// SPEC: docs/specs/features/SPEC_REPUTATION_ROYALTY_CASCADE_BUILD.md
// Phase 3 — thin UI: reputation dashboard + royalty cascade preview.

/* ================================================================
   REPUTATION MODAL — Earning / Reputation dashboard (thin).

   Mostra o tier de reputação derivado do karma do forum e uma
   prévia da cascata de royalties para uma transação de exemplo.
   Toda a matemática vive em royaltyEngine.js / reputationManager.js
   (pure-logic). Esta camada apenas renderiza.
   ================================================================ */

import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { reputationTier, resolveAssetRoyalties } from '../../core/forum/reputationManager.js';
import { calculateLineageCascade } from '../libraries/royaltyEngine.js';
import { CONFIG } from '../../config.js';

const MODAL_ID = 'reputation-modal';

/** @returns {{ id: string, karma: number }} */
function currentUser() {
    try {
        const w = /** @type {any} */ (window);
        const id = w?.currentSession?.user?.id || w?.currentSession?.userId || 'you';
        const karma = Number(w?.currentSession?.karmaScore) || 0;
        return { id, karma };
    } catch {
        return { id: 'you', karma: 0 };
    }
}

function renderBody() {
    const { id, karma } = currentUser();
    const { reputationTier: rep } = reputationTier(karma);
    const karmaLabel = escapeHtml(t('reputation.karma_label') || 'Karma');
    const royaltyLabel = escapeHtml(t('reputation.royalty_earned') || 'Royalties Earned');
    const contribLabel = escapeHtml(t('reputation.contributor_role') || 'Contributor');
    const tierAria = `${t('reputation.tier_aria') || 'Reputation'}: ${rep}`;
    // Sample cascade: this user as creator, no curator, $100 transaction.
    const { lines } = resolveAssetRoyalties({ creatorId: id, curatorId: null }, 100, { [id]: karma });
    const rows = lines
        .map(
            (l: any) => `<tr><td>${escapeHtml(l.role)}</td><td><code>${escapeHtml(l.userId)}</code></td>` +
            `<td style="text-align:right">$${l.amount.toFixed(2)}</td></tr>`,
        )
        .join('');
    // ORIG-ROY-001 — preview da cascata de LINHAGEM (originador por antiguidade).
    // Exemplo: este usuário é a RAIZ (originador mais antigo) de um módulo que foi
    // forkado por outro autor e revendido por $100 → a raiz recebe a maior fatia do pool.
    const lineage = [
        { creatorId: t('reputation.lineage.derivative') || 'autor-derivado', createdAt: 200 },
        { creatorId: id, createdAt: 100 },
    ];
    const linLines = calculateLineageCascade(100, { sellerId: t('reputation.lineage.seller') || 'vendedor', lineage });
    const linRows = linLines
        .map((l: any) => {
            const youMark = l.userId === id ? ' &#9733;' : '';
            return `<tr><td>${escapeHtml(l.role)}</td><td><code>${escapeHtml(l.userId)}</code>${youMark}</td>` +
                `<td style="text-align:right">$${l.amount.toFixed(2)}</td></tr>`;
        })
        .join('');
    const lineageTitle = escapeHtml(t('reputation.lineage.title') || 'Royalty de originador (linhagem) — venda derivada de $100');
    const lineageHint = escapeHtml(
        t('reputation.lineage.hint') ||
            'Mesmo conteúdo gratuito que vira base de produtos pagos retorna % à sua carteira. A comissão sai do corte da plataforma — o vendedor não é descontado. Originador mais antigo (★ você) recebe a maior fatia.',
    );
    const redeemLabel = escapeHtml(t('reputation.redeem.stripe') || 'Resgatar via Stripe (sandbox)');

    return (
        `<div class="rep-summary" role="status" aria-label="${escapeHtml(tierAria)}">` +
        `<span class="rep-tier rep-tier--${escapeHtml(rep)}">${escapeHtml(rep.toUpperCase())}</span>` +
        `<span class="rep-karma">${karmaLabel}: <strong>${karma}</strong></span>` +
        `<span class="rep-role">${contribLabel}</span></div>` +
        `<h3 class="rep-h3">${royaltyLabel} — ${escapeHtml(t('reputation.sample_tx') || 'sample $100 transaction')}</h3>` +
        '<table class="rep-table"><thead><tr>' +
        `<th>${escapeHtml(t('reputation.col_role') || 'Role')}</th>` +
        `<th>${escapeHtml(t('reputation.col_user') || 'User')}</th>` +
        `<th style="text-align:right">${escapeHtml(t('reputation.col_amount') || 'Amount')}</th>` +
        `</tr></thead><tbody>${rows}</tbody></table>` +
        `<h3 class="rep-h3">${lineageTitle}</h3>` +
        `<p class="rep-hint">${lineageHint}</p>` +
        '<table class="rep-table"><thead><tr>' +
        `<th>${escapeHtml(t('reputation.col_role') || 'Role')}</th>` +
        `<th>${escapeHtml(t('reputation.col_user') || 'User')}</th>` +
        `<th style="text-align:right">${escapeHtml(t('reputation.col_amount') || 'Amount')}</th>` +
        `</tr></thead><tbody>${linRows}</tbody></table>` +
        `<div class="rep-redeem"><button type="button" class="rep-redeem-btn ecbt-btn" ` +
        `onclick="window.handleOpenStripeConnect?.()">${redeemLabel}</button>` +
        `<span class="rep-sandbox">sandbox</span></div>`
    );
}

export function openReputationModal() {
    const flags = /** @type {any} */ (CONFIG)?.FEATURES || {};
    if (flags.enable_reputation_engine !== true) {
        showToast(t('reputation.disabled') || 'Reputation engine is disabled (feature flag off).', 'info');
        return;
    }
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'ecbt-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        const title = escapeHtml(t('reputation.title') || 'Reputation & Royalties');
        modal.innerHTML =
            '<div class="ecbt-dialog ecbt-dialog--md" style="max-width:560px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
            `<h2 style="margin:0;font-size:18px;font-weight:600;color:#e0e0e0">${title}</h2>` +
            '<button class="rep-close ecbt-btn" style="padding:4px 10px">&times;</button></div>' +
            `<div class="rep-content"></div>` +
            '<style>' +
            '#reputation-modal .ecbt-dialog{color:#e0e0e0}' +
            '#reputation-modal .rep-summary{display:flex;gap:12px;align-items:center;margin:8px 0 14px}' +
            '#reputation-modal .rep-tier{padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:.5px}' +
            '#reputation-modal .rep-tier--expert{background:rgba(251,191,36,.2);color:#fbbf24}' +
            '#reputation-modal .rep-tier--specialist{background:rgba(96,165,250,.2);color:#60a5fa}' +
            '#reputation-modal .rep-tier--junior{background:rgba(156,163,175,.2);color:#9ca3af}' +
            '#reputation-modal .rep-karma{font-size:13px;color:#aaa}' +
            '#reputation-modal .rep-role{font-size:11px;color:#888;border:1px solid #444;border-radius:3px;padding:2px 6px}' +
            '#reputation-modal .rep-h3{font-size:13px;color:#aaa;margin:14px 0 6px;font-weight:600}' +
            '#reputation-modal .rep-table{width:100%;border-collapse:collapse;font-size:12px}' +
            '#reputation-modal .rep-table th{text-align:left;color:#888;padding:6px 8px;font-size:11px;text-transform:uppercase}' +
            '#reputation-modal .rep-table td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.06)}' +
            '#reputation-modal .rep-table code{color:#9ca3af;background:rgba(255,255,255,.05);padding:1px 4px;border-radius:3px}' +
            '#reputation-modal .rep-hint{font-size:11px;color:#888;margin:4px 0 8px;line-height:1.4}' +
            '#reputation-modal .rep-redeem{display:flex;align-items:center;gap:8px;margin-top:14px}' +
            '#reputation-modal .rep-redeem-btn{padding:7px 14px;background:rgba(99,91,255,.2);border:1px solid rgba(120,110,255,.5);color:#cfc8ff;border-radius:6px;cursor:pointer}' +
            '#reputation-modal .rep-sandbox{font-size:10px;font-weight:600;color:#fcd34d;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.4);border-radius:999px;padding:2px 8px}' +
            '</style></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeReputationModal();
        });
        const closeBtn = modal.querySelector('.rep-close');
        if (closeBtn) closeBtn.addEventListener('click', closeReputationModal);
    }
    const content = modal.querySelector('.rep-content');
    if (content) content.innerHTML = renderBody();
    /** @type {HTMLElement} */ (modal).style.display = 'flex';
}

export function closeReputationModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) /** @type {HTMLElement} */ (modal).style.display = 'none';
}
