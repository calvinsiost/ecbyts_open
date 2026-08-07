// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   LOGS MODAL — user-facing viewer for captured system messages
   (errors, warnings, toasts). Opened via Mais → Logs.

   Reads from utils/helpers/messageLog (ring buffer). Filter by level,
   clear, copy to clipboard. Live-updates while open via the
   MESSAGE_LOG_EVENT CustomEvent. Uses .ecbt-* design tokens.
   ================================================================ */
import { getMessages, clearMessages, MESSAGE_LOG_EVENT } from '../helpers/messageLog.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';

const MODAL_ID = 'logs-modal';
let _filter = 'all';
/** @type {((e: any) => void) | null} */
let _liveHandler: any = null;

const DEFAULT_LEVEL_META = { cls: 'logs-lvl-info', label: 'Info' };
const LEVEL_META: Record<string, { cls: string; label: string }> = {
    error: { cls: 'logs-lvl-error', label: 'Erro' },
    warning: { cls: 'logs-lvl-warning', label: 'Aviso' },
    success: { cls: 'logs-lvl-success', label: 'OK' },
    info: DEFAULT_LEVEL_META,
};

function _fmtTime(ts: number) {
    try {
        const d = new Date(ts);
        return d.toLocaleTimeString();
    } catch (e: any) {
        console.debug('[logsModal] fmtTime:', e?.message || e);
        return String(ts);
    }
}

function _filtered() {
    const all = getMessages();
    if (_filter === 'all') return all;
    if (_filter === 'errwarn') return all.filter((e: any) => e.level === 'error' || e.level === 'warning');
    return all.filter((e: any) => e.level === _filter);
}

function _rowsHtml() {
    const rows = _filtered();
    if (!rows.length) {
        return `<div class="logs-empty">${escapeHtml(t('logs.empty') || 'Nenhuma mensagem registrada ainda.')}</div>`;
    }
    return rows
        .map((e: any) => {
            const meta = LEVEL_META[String(e.level)] ?? DEFAULT_LEVEL_META;
            return `
            <div class="logs-row">
                <span class="logs-badge ${meta.cls}">${escapeHtml(t('logs.level.' + e.level) || meta.label)}</span>
                <span class="logs-time">${escapeHtml(_fmtTime(e.ts))}</span>
                <span class="logs-src">${escapeHtml(e.source || '')}</span>
                <span class="logs-msg">${escapeHtml(e.message || '')}</span>
            </div>`;
        })
        .join('');
}

function _renderBody() {
    const body = document.getElementById('logs-modal-list');
    if (body) body.innerHTML = _rowsHtml();
    const count = document.getElementById('logs-modal-count');
    if (count) count.textContent = String(_filtered().length);
}

function _chip(value: string, labelKey: string, fallback: string) {
    const active = _filter === value ? ' logs-chip-active' : '';
    return `<button type="button" class="logs-chip${active}" data-filter="${value}">${escapeHtml(t(labelKey) || fallback)}</button>`;
}

export function openLogsModal() {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'ecbt-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
            <div class="ecbt-dialog ecbt-dialog--lg logs-dialog">
                <div class="logs-header">
                    <h2>${escapeHtml(t('logs.title') || 'Logs do sistema')}</h2>
                    <button class="logs-close ecbt-btn" type="button" aria-label="Close">&times;</button>
                </div>
                <p class="logs-hint">${escapeHtml(t('logs.hint') || 'Mensagens recentes do sistema (erros, avisos, notificações). Útil para diagnóstico.')}</p>
                <div class="logs-toolbar">
                    <div class="logs-chips" role="group">
                        ${_chip('all', 'logs.filter.all', 'Todos')}
                        ${_chip('errwarn', 'logs.filter.errwarn', 'Erros+Avisos')}
                        ${_chip('error', 'logs.filter.error', 'Erros')}
                        ${_chip('warning', 'logs.filter.warning', 'Avisos')}
                        ${_chip('info', 'logs.filter.info', 'Info')}
                    </div>
                    <span class="logs-count-wrap"><span id="logs-modal-count">0</span> ${escapeHtml(t('logs.entries') || 'entradas')}</span>
                    <button class="logs-copy ecbt-btn ecbt-btn--ghost" type="button">${escapeHtml(t('logs.copy') || 'Copiar')}</button>
                    <button class="logs-clear ecbt-btn ecbt-btn--ghost" type="button">${escapeHtml(t('logs.clear') || 'Limpar')}</button>
                </div>
                <div class="logs-list" id="logs-modal-list"></div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.logs-close')?.addEventListener('click', closeLogsModal);
        modal.addEventListener('click', (e: any) => {
            if (e.target === modal) closeLogsModal();
        });
        modal.querySelectorAll('.logs-chip').forEach((chip: any) => {
            chip.addEventListener('click', () => {
                _filter = chip.getAttribute('data-filter') || 'all';
                modal!.querySelectorAll('.logs-chip').forEach((c: any) =>
                    c.classList.toggle('logs-chip-active', c.getAttribute('data-filter') === _filter),
                );
                _renderBody();
            });
        });
        modal.querySelector('.logs-clear')?.addEventListener('click', () => {
            clearMessages();
            _renderBody();
        });
        modal.querySelector('.logs-copy')?.addEventListener('click', async () => {
            const txt = _filtered()
                .map((e: any) => `[${_fmtTime(e.ts)}] ${e.level.toUpperCase()} (${e.source}) ${e.message}`)
                .join('\n');
            try {
                await navigator.clipboard.writeText(txt);
                const { showToast } = await import('./toast.js');
                showToast(t('logs.copied') || 'Logs copiados', 'success');
            } catch (err: any) {
                console.debug('[logsModal] copy:', err?.message || err);
            }
        });
    }
    (modal as HTMLElement).style.display = 'flex';
    _renderBody();
    // Sprint 3 Tier-B (Calvin 2026-06-03): URL = estado painel aberto
    syncDeepLinkUrl('logs');

    // Live update while open.
    if (!_liveHandler) {
        _liveHandler = () => {
            if ((document.getElementById(MODAL_ID) as HTMLElement)?.style.display !== 'none') _renderBody();
        };
        window.addEventListener(MESSAGE_LOG_EVENT, _liveHandler);
    }
}

export function closeLogsModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
        (modal as HTMLElement).style.display = 'none';
        clearDeepLinkUrl();
    }
    if (_liveHandler) {
        window.removeEventListener(MESSAGE_LOG_EVENT, _liveHandler);
        _liveHandler = null;
    }
}
