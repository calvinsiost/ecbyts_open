// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   NOTIFICATION INBOX UI — SPEC_NOTIFICATIONS_SYSTEM_9_72
   ================================================================

   Dropdown/panel de notificações:
   - Ícone de sino com badge de contagem
   - Painel dropdown com lista de notificações
   - Usa manager.js API (getNotificationsForUser, markRead, archive)
   - Ações inline: ver, marcar lida, snooze, arquivar
   - Filtros: Todas / Não lidas / Transacional
   - Footer com link "Ver todas"
   ================================================================ */
import { t } from '../i18n/translations.js';
import { getNotificationsForUser, getUnreadCount, markRead, archive } from '../../core/notifications/manager.js';
import { showToast } from './toast.js';
import { Z_INDEX } from './zIndex.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
let _currentUserId = 'anonymous';
let _inboxOpen = false;
/** @type {any} */
let _panelEl: any = null;
/** @type {any} */
let _bellEl: any = null;
/** @type {any} */
let _badgeEl: any = null;
let _currentFilter = 'all'; // 'all' | 'unread' | 'transactional'
const _snoozedUntil = new Map(); // id -> timestamp ms
/**
 * Configura o ID do usuário atual para filtrar notificações.
 * @param {string} userId
 */
export function setNotificationUser(userId: any) {
    _currentUserId = userId || 'anonymous';
}
/**
 * Renderiza o ícone de sino com badge no container especificado.
 * @param {string|HTMLElement} container - seletor ou elemento onde o sino será injetado
 */
export function mountNotificationBell(container: any) {
    const parent = typeof container === 'string' ? document.querySelector(container) : container;
    if (!parent) {
        console.warn('[notificationInbox] container not found');
        return;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'notif-bell-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-flex';
    const bell = document.createElement('button');
    bell.type = 'button';
    bell.className = 'notif-bell-btn';
    bell.setAttribute('aria-label', t('notification.title'));
    bell.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
    `;
    bell.onclick = (e) => {
        e.stopPropagation();
        toggleNotificationInbox();
    };
    const badge = document.createElement('span');
    badge.className = 'notif-badge';
    badge.style.position = 'absolute';
    badge.style.top = '-4px';
    badge.style.right = '-4px';
    badge.style.minWidth = '16px';
    badge.style.height = '16px';
    badge.style.padding = '0 4px';
    badge.style.borderRadius = '8px';
    badge.style.background = 'var(--danger, #e5534b)';
    badge.style.color = '#fff';
    badge.style.fontSize = '10px';
    badge.style.fontWeight = '600';
    badge.style.display = 'flex';
    badge.style.alignItems = 'center';
    badge.style.justifyContent = 'center';
    badge.style.pointerEvents = 'none';
    badge.style.display = 'none';
    wrapper.appendChild(bell);
    wrapper.appendChild(badge);
    parent.appendChild(wrapper);
    _bellEl = bell;
    _badgeEl = badge;
    // Click-outside fecha o painel
    document.addEventListener('click', (e) => {
        if (_inboxOpen && _panelEl && !_panelEl.contains(e.target) && !_bellEl.contains(e.target)) {
            closeNotificationInbox();
        }
    });
    refreshNotificationBadge();
}
/**
 * Abre/fecha o painel de notificações.
 */
export async function toggleNotificationInbox() {
    if (_inboxOpen) {
        closeNotificationInbox();
    } else {
        await openNotificationInbox();
    }
}
/**
 * Abre o painel de notificações.
 */
export async function openNotificationInbox() {
    if (_inboxOpen) return;
    _inboxOpen = true;
    let panel = document.getElementById('notification-inbox-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'notification-inbox-panel';
        panel.className = 'notif-inbox-panel';
        panel.style.position = 'absolute';
        panel.style.top = 'calc(100% + 8px)';
        panel.style.right = '0';
        panel.style.width = '360px';
        panel.style.maxHeight = '480px';
        panel.style.background = 'var(--panel-bg, #1a1d24)';
        panel.style.border = '1px solid var(--border-color, #2d3144)';
        panel.style.borderRadius = 'var(--radius-xl, 12px)';
        panel.style.boxShadow = '0 8px 24px rgba(0,0,0,0.35)';
        panel.style.zIndex = String(Z_INDEX.EXCEPTION_NOTIFICATION_PANEL);
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.overflow = 'hidden';
        panel.style.fontSize = '13px';
        if (_bellEl) {
            _bellEl.closest('.notif-bell-wrapper')?.appendChild(panel);
        } else {
            document.body.appendChild(panel);
        }
    }
    _panelEl = panel;
    panel.innerHTML = '';
    panel.style.display = 'flex';
    // Header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '12px 16px';
    header.style.borderBottom = '1px solid var(--border-color, #2d3144)';
    header.style.flexShrink = '0';
    const title = document.createElement('span');
    title.style.fontWeight = '600';
    title.textContent = t('notification.title');
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    const markAllBtn = document.createElement('button');
    markAllBtn.type = 'button';
    markAllBtn.className = 'btn btn-sm btn-secondary';
    markAllBtn.textContent = t('notification.markRead');
    markAllBtn.onclick = async () => {
        const { markAllRead } = await import('../../core/notifications/manager.js' as string);
        await markAllRead(_currentUserId);
        await _renderList(listWrap);
        await refreshNotificationBadge();
    };
    actions.appendChild(markAllBtn);
    header.appendChild(title);
    header.appendChild(actions);
    panel.appendChild(header);
    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'notif-inbox-tabs';
    tabs.innerHTML = `
        <button type="button" class="notif-inbox-tab ${_currentFilter === 'all' ? 'active' : ''}" data-filter="all">${t('notification.filter.all') || 'Todas'}</button>
        <button type="button" class="notif-inbox-tab ${_currentFilter === 'unread' ? 'active' : ''}" data-filter="unread">${t('notification.filter.unread') || 'Não lidas'}</button>
        <button type="button" class="notif-inbox-tab ${_currentFilter === 'transactional' ? 'active' : ''}" data-filter="transactional">${t('notification.filter.transactional') || 'Transacional'}</button>
    `;
    tabs.querySelectorAll('.notif-inbox-tab').forEach((tab: any) => {
        tab.addEventListener('click', () => {
            _currentFilter = tab.dataset.filter;
            tabs.querySelectorAll('.notif-inbox-tab').forEach((t: any) => t.classList.remove('active'));
            tab.classList.add('active');
            _renderList(listWrap);
        });
    });
    panel.appendChild(tabs);
    // List container
    const listWrap = document.createElement('div');
    listWrap.style.overflowY = 'auto';
    listWrap.style.flex = '1';
    listWrap.style.padding = '8px 0';
    panel.appendChild(listWrap);
    // Footer
    const footer = document.createElement('div');
    footer.className = 'notif-inbox-footer';
    const viewAllBtn = document.createElement('button');
    viewAllBtn.type = 'button';
    viewAllBtn.textContent = t('notification.viewAll') || 'Ver todas';
    viewAllBtn.onclick = async () => {
        closeNotificationInbox();
        try {
            const { openNotificationsPage } = await import('./notificationsPage.js' as string);
            await openNotificationsPage(_currentUserId);
        } catch (err: any) {
            console.warn('[notificationInbox] failed to open notifications page', err);
        }
    };
    footer.appendChild(viewAllBtn);
    panel.appendChild(footer);
    await _renderList(listWrap);
    await refreshNotificationBadge();
    // Sprint 3 Tier-B (Calvin 2026-06-03): URL = estado painel aberto
    syncDeepLinkUrl('notifications');
}
/**
 * Fecha o painel de notificações.
 */
export function closeNotificationInbox() {
    _inboxOpen = false;
    if (_panelEl) {
        _panelEl.style.display = 'none';
        clearDeepLinkUrl();
    }
}
async function _renderList(container: any) {
    container.innerHTML = '';
    // Clean expired snoozes
    const now = Date.now();
    for (const [id, until] of _snoozedUntil) {
        if (until <= now) _snoozedUntil.delete(id);
    }
    let list = await getNotificationsForUser(_currentUserId, { limit: 50 });
    // Apply tab filter
    if (_currentFilter === 'unread') {
        list = list.filter((/** @type {any} */ n) => !n.read);
    } else if (_currentFilter === 'transactional') {
        const txTypes = ['documents.', 'processing.', 'deadlines.'];
        list = list.filter((/** @type {any} */ n) => txTypes.some((p: any) => n.type?.startsWith(p)));
    }
    // Apply snooze filter
    list = list.filter((/** @type {any} */ n) => !_snoozedUntil.has(n.id));
    if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'notif-inbox-empty';
        empty.innerHTML = `
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span>${t('notification.empty') || 'Nenhuma notificação'}</span>
        `;
        container.appendChild(empty);
        return;
    }
    for (const n of list.slice(0, 20)) {
        const row = document.createElement('div');
        row.className = 'notif-inbox-row';
        row.style.display = 'flex';
        row.style.alignItems = 'flex-start';
        row.style.gap = '8px';
        row.style.padding = '8px 16px';
        row.style.borderBottom = '1px solid var(--border-color, #2d3144)';
        row.style.cursor = 'pointer';
        row.style.position = 'relative';
        // Priority dot
        const dot = document.createElement('span');
        dot.className = `notif-priority-dot ${n.tier || 'P2'}`;
        dot.style.marginTop = '6px';
        row.appendChild(dot);
        const content = document.createElement('div');
        content.style.flex = '1';
        content.style.minWidth = '0';
        const typeLabel = document.createElement('div');
        typeLabel.style.fontWeight = '500';
        typeLabel.style.fontSize = '13px';
        typeLabel.style.overflow = 'hidden';
        typeLabel.style.textOverflow = 'ellipsis';
        typeLabel.style.whiteSpace = 'nowrap';
        typeLabel.textContent = n.payload?.title || t(`notification.${n.type}`) || n.type;
        const meta = document.createElement('div');
        meta.style.fontSize = '11px';
        meta.style.color = 'var(--text-muted, #8b949e)';
        meta.style.marginTop = '2px';
        const time = n.createdAt ? new Date(n.createdAt).toLocaleString() : '';
        meta.textContent = time;
        content.appendChild(typeLabel);
        content.appendChild(meta);
        row.appendChild(content);
        // Rich actions (visible on hover)
        const actions = document.createElement('div');
        actions.className = 'notif-inbox-item-actions';
        const viewBtn = document.createElement('button');
        viewBtn.type = 'button';
        viewBtn.textContent = t('common.show') || 'Ver';
        viewBtn.title = t('common.show') || 'Ver';
        viewBtn.onclick = (/** @type {any} */ e) => {
            e.stopPropagation();
            if (n.payload?.url) {
                window.open(n.payload.url, '_blank', 'noopener,noreferrer');
            }
            markRead(n.id).catch((/** @type {any} */ e) => console.debug('[notif:inbox]', e?.message || e));
            refreshNotificationBadge();
        };
        const readBtn = document.createElement('button');
        readBtn.type = 'button';
        readBtn.textContent = '✓';
        readBtn.title = t('notification.markRead') || 'Marcar como lida';
        readBtn.onclick = async (e) => {
            e.stopPropagation();
            await markRead(n.id);
            await _renderList(container);
            await refreshNotificationBadge();
        };
        const snoozeBtn = document.createElement('button');
        snoozeBtn.type = 'button';
        snoozeBtn.textContent = '⏰';
        snoozeBtn.title = `${t('notification.snooze.1h') || 'Adiar 1h'} / ${t('notification.snooze.1d') || '1d'}`;
        snoozeBtn.onclick = (e) => {
            e.stopPropagation();
            _showSnoozeMenu(snoozeBtn, n.id, container);
        };
        actions.appendChild(viewBtn);
        actions.appendChild(readBtn);
        actions.appendChild(snoozeBtn);
        row.appendChild(actions);
        // Dismiss (archive)
        const dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'btn btn-sm';
        dismissBtn.style.padding = '2px 6px';
        dismissBtn.style.fontSize = '11px';
        dismissBtn.textContent = t('notification.dismiss');
        dismissBtn.onclick = async (e) => {
            e.stopPropagation();
            await archive(n.id);
            await _renderList(container);
            await refreshNotificationBadge();
        };
        row.appendChild(dismissBtn);
        row.onclick = async () => {
            await markRead(n.id);
            await _renderList(container);
            await refreshNotificationBadge();
        };
        container.appendChild(row);
    }
}
function _showSnoozeMenu(anchor: any, id: any, container: any) {
    const existing = document.getElementById('notif-snooze-menu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.id = 'notif-snooze-menu';
    menu.style.position = 'fixed';
    menu.style.zIndex = String(Z_INDEX.EXCEPTION_NOTIFICATION_MENU);
    menu.style.background = 'var(--panel-bg, #1a1d24)';
    menu.style.border = '1px solid var(--border-color, #2d3144)';
    menu.style.borderRadius = 'var(--radius-md, 4px)';
    menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
    menu.style.padding = '4px 0';
    menu.style.minWidth = '120px';
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;
    const items = [
        { label: t('notification.snooze.1h') || '1 hora', ms: 60 * 60 * 1000 },
        { label: t('notification.snooze.1d') || '1 dia', ms: 24 * 60 * 60 * 1000 },
    ];
    for (const item of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.display = 'block';
        btn.style.width = '100%';
        btn.style.padding = '6px 12px';
        btn.style.border = 'none';
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-primary, #c5cdd5)';
        btn.style.fontSize = '12px';
        btn.style.textAlign = 'left';
        btn.style.cursor = 'pointer';
        btn.textContent = item.label;
        btn.onmouseenter = () => {
            btn.style.background = 'var(--overlay-light, rgba(255,255,255,0.08))';
        };
        btn.onmouseleave = () => {
            btn.style.background = 'transparent';
        };
        btn.onclick = () => {
            _snoozedUntil.set(id, Date.now() + item.ms);
            menu.remove();
            _renderList(container);
            showToast(t('notification.snooze.1h') ? 'Notificação adiada' : 'Snoozed', 'info');
        };
        menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    const closeMenu = (e: any) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}
/**
 * Atualiza o badge do sino com a contagem de não lidas.
 */
export async function refreshNotificationBadge() {
    if (!_badgeEl) return;
    try {
        const count = await getUnreadCount(_currentUserId);
        if (count.total > 0) {
            _badgeEl.textContent = count.total > 99 ? '99+' : String(count.total);
            _badgeEl.style.display = 'flex';
            // P0 urgency: badge vermelho pulsante
            if (count.byTier.P0 > 0) {
                _badgeEl.style.background = 'var(--danger, #e5534b)';
            } else {
                _badgeEl.style.background = 'var(--warning, #d29922)';
            }
        } else {
            _badgeEl.style.display = 'none';
        }
    } catch {
        _badgeEl.style.display = 'none';
    }
}
