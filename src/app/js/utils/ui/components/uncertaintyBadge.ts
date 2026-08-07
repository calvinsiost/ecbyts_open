// @ts-check
// Generated from src/app/js/utils/ui/components/uncertaintyBadge.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
import { escapeHtml } from '../../helpers/html.js';
import { t } from '../../i18n/translations.js';
// HTML entity &#9679; = U+25CF BLACK CIRCLE. Color comes from CSS class
// (.uncertainty-badge-{green|yellow|red|grey}). Per CLAUDE.md hard rule:
// no emoji in UI - use HTML entities + CSS color instead.
const BADGE_SYMBOL = '&#9679;';
/**
 * Render uncertainty badge + popover trigger markup.
 *
 * @param {{className:'green'|'yellow'|'red'|'grey', metrics?: any}} model
 * @param {{ id?: string }} [opts]
 * @returns {string}
 */
export function renderUncertaintyBadge( model: any, opts: any = {}) {
    const id = opts.id || 'eis-uncertainty';
    const c = model?.className || 'grey';
    const m = (model?.metrics) || {};
    const u = Number.isFinite(m.u) ? Number(m.u).toFixed(2) : 'n/a';
    const detect = Number.isFinite(m.detectRate) ? `${Math.round(Number(m.detectRate) * 100)}%` : '0%';
    return `
        <button
            id="${escapeHtml(id)}-btn"
            class="uncertainty-badge uncertainty-badge-${escapeHtml(c)}"
            type="button"
            aria-label="${t('uncertainty.qualityAria', { quality: escapeHtml(c) })}"
            title="${t('uncertainty.qualityTooltip', { quality: escapeHtml(c) })}"
            aria-expanded="false"
        >
            <span class="uncertainty-badge-dot" aria-hidden="true">${BADGE_SYMBOL}</span>
            <span class="uncertainty-badge-label">UQ</span>
        </button>
        <div id="${escapeHtml(id)}-popover" class="uncertainty-popover" hidden>
            <div><strong>Uncertainty quality:</strong> ${escapeHtml(c)}</div>
            <div>u: ${escapeHtml(u)}</div>
            <div>detect rate: ${escapeHtml(detect)}</div>
        </div>
    `;
}
/**
 * Wire click/esc toggle behavior for badge+popover.
 *
 * @param {string} idBase
 */
export function wireUncertaintyBadge( idBase: any = 'eis-uncertainty') {
    const btn = document.getElementById(`${idBase}-btn`) as any;
    const pop = document.getElementById(`${idBase}-popover`);
    if (!btn || !pop) return;
    const close = () => {
        pop.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
        pop.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
    };
    btn.onclick = () => {
        if (pop.hidden) open();
        else close();
    };
    btn.onkeydown = (e: any) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (pop.hidden) open();
            else close();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    };
    pop.onkeydown = (e: any) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    };
    const w = (window) as any;
    w.__uncertaintyBadgeEscHandlers = w.__uncertaintyBadgeEscHandlers || {};
    if (w.__uncertaintyBadgeEscHandlers[idBase]) {
        document.removeEventListener('keydown', w.__uncertaintyBadgeEscHandlers[idBase], true);
    }
    const escHandler = (e: any) => {
        if (e.key === 'Escape') close();
    };
    w.__uncertaintyBadgeEscHandlers[idBase] = escHandler;
    document.addEventListener('keydown', escHandler, true);
}
