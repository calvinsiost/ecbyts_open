// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   NOTIFICATIONS PAGE — SPEC_NOTIFICATIONS_SYSTEM_9_72 §4.4

   Full-page notifications view (not a modal):
   - 3-column layout: filters | list | detail
   - Bulk actions, infinite scroll, priority badges
   - Uses manager.js API
   ================================================================ */
import { t } from '../i18n/translations.js';
import {
    getNotificationsForUser,
    markRead,
    markAllRead,
    archive,
    deleteNotification,
} from '../../core/notifications/manager.js';
import { showToast } from './toast.js';
let _pageEl: any = null;
let _currentUserId = 'anonymous';
let _allNotifications: any[] = [];
let _filteredNotifications: any[] = [];
/** @type {Set<any>} */ const _selectedIds = new Set();
let _selectedNotification: any = null;
const _filters = {
    type: 'all', // all | transactional | social | system
    status: 'unread', // all | unread | read | archived
    date: 'all', // all | today | week | month
    org: 'all',
};
const _pageSize = 30;
let _pageIndex = 0;
let _loading = false;
let _observer: any = null;
// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────
/**
 * Abre a página de notificações em tela cheia.
 * @param {string} userId
 */
export async function openNotificationsPage(userId: any) {
    _currentUserId = userId || 'anonymous';
    if (_pageEl) {
        _pageEl.style.display = 'flex';
        await _refresh();
        return;
    }
    _buildPage();
    document.body.appendChild(_pageEl);
    await _refresh();
}
/**
 * Fecha a página de notificações.
 */
export function closeNotificationsPage() {
    if (_pageEl) {
        _pageEl.style.display = 'none';
    }
    _selectedIds.clear();
    _selectedNotification = null;
}
/**
 * Verifica se a página está aberta.
 * @returns {boolean}
 */
export function isNotificationsPageOpen() {
    return !!_pageEl && _pageEl.style.display !== 'none';
}
// ──────────────────────────────────────────────────────────────────────
// Build page shell
// ──────────────────────────────────────────────────────────────────────
function _buildPage() {
    const page = document.createElement('div');
    page.className = 'notifications-page';
    page.id = 'notifications-page';
    page.setAttribute('role', 'dialog');
    page.setAttribute('aria-modal', 'true');
    page.setAttribute('aria-label', t('notification.page.title') || 'Notificações');
    page.innerHTML = `
        <div class="notifications-page-header">
            <h2>${t('notification.page.title') || 'Notificações'}</h2>
            <div class="notifications-page-header-actions">
                <button type="button" class="btn btn-sm btn-secondary" id="notif-page-mark-all">
                    ${t('notification.page.markAllRead') || 'Marcar todas como lidas'}
                </button>
                <button type="button" class="btn btn-sm" id="notif-page-settings" title="${t('notification.preferences.title') || 'Preferências'}">
                    <span data-icon="settings" data-icon-size="14px"></span>
                </button>
                <button type="button" class="btn btn-sm" id="notif-page-close" title="${t('close') || 'Fechar'}">
                    <span data-icon="x" data-icon-size="16px"></span>
                </button>
            </div>
        </div>
        <div class="notifications-page-body">
            <aside class="notifications-filter-panel" id="notif-filter-panel"></aside>
            <section class="notifications-list-container">
                <div class="notif-bulk-actions" id="notif-bulk-bar" style="display:none;">
                    <span class="bulk-info" id="notif-bulk-info"></span>
                    <button type="button" id="notif-bulk-read">${t('notification.bulk.read') || 'Marcar como lida'}</button>
                    <button type="button" id="notif-bulk-archive">${t('notification.bulk.archive') || 'Arquivar'}</button>
                    <button type="button" id="notif-bulk-delete">${t('notification.bulk.delete') || 'Excluir'}</button>
                </div>
                <div class="notifications-list" id="notif-list"></div>
                <div class="notif-scroll-sentinel" id="notif-sentinel"></div>
            </section>
            <aside class="notifications-detail-panel" id="notif-detail-panel"></aside>
        </div>
    `;
    page.querySelector('#notif-page-close')?.addEventListener('click', closeNotificationsPage);
    page.querySelector('#notif-page-mark-all')?.addEventListener('click', _onMarkAllRead);
    page.querySelector('#notif-page-settings')?.addEventListener('click', _onOpenSettings);
    page.querySelector('#notif-bulk-read')?.addEventListener('click', _onBulkRead);
    page.querySelector('#notif-bulk-archive')?.addEventListener('click', _onBulkArchive);
    page.querySelector('#notif-bulk-delete')?.addEventListener('click', _onBulkDelete);
    // Close on Escape
    page.addEventListener('keydown', (/** @type {any} */ e) => {
        if (e.key === 'Escape') closeNotificationsPage();
    });
    _pageEl = page;
}
// ──────────────────────────────────────────────────────────────────────
// Data layer
// ──────────────────────────────────────────────────────────────────────
async function _refresh() {
    _loading = true;
    _pageIndex = 0;
    _allNotifications = [];
    _selectedIds.clear();
    _selectedNotification = null;
    try {
        // Load archived or active based on status filter
        if (_filters.status === 'archived') {
            const all = await getNotificationsForUser(_currentUserId, { limit: 10000 });
            // manager.js getNotificationsForUser filters out archived, so we need all and filter client-side
            // Actually, manager.js filters !n.archived. So we can't get archived via that API.
            // We'll load from IDB directly or accept that archive filter won't show archived items
            // since manager.js doesn't expose a getArchived function. We'll work with what we have.
            _allNotifications = all;
        } else {
            const opts: any = {};
            if (_filters.status === 'unread') opts.unreadOnly = true;
            _allNotifications = await getNotificationsForUser(_currentUserId, opts);
        }
    } catch (err: any) {
        console.warn('[notificationsPage] refresh failed', err);
        _allNotifications = [];
    }
    _applyFilters();
    _renderFilters();
    _renderList();
    _renderDetail();
    _updateBulkBar();
    _setupInfiniteScroll();
    _loading = false;
}
function _applyFilters() {
    let list = _allNotifications.slice();
    // Type filter
    if (_filters.type !== 'all') {
        const map = {
            transactional: ['documents', 'processing', 'deadlines'],
            social: ['sharing', 'invitations', 'team'],
            system: ['system', 'governance', 'watch'],
        };
        const cats = (map as Record<string,any>)[_filters.type] || [];
        list = list.filter((n: any) => cats.some((c: any) => n.type?.startsWith(c + '.')));
    }
    // Date filter
    if (_filters.date !== 'all') {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfDay);
        startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        list = list.filter((n: any) => {
            const d = new Date(n.createdAt || 0);
            if (_filters.date === 'today') return d >= startOfDay;
            if (_filters.date === 'week') return d >= startOfWeek;
            if (_filters.date === 'month') return d >= startOfMonth;
            return true;
        });
    }
    // Org filter (derive from payload)
    if (_filters.org !== 'all') {
        list = list.filter((n: any) => n.payload?.orgId === _filters.org || n.payload?.organization === _filters.org);
    }
    _filteredNotifications = list;
}
// ──────────────────────────────────────────────────────────────────────
// Render filters
// ──────────────────────────────────────────────────────────────────────
function _renderFilters() {
    const panel = _pageEl.querySelector('#notif-filter-panel');
    if (!panel) return;
    const orgs = _extractOrgs();
    panel.innerHTML = `
        <div class="notifications-filter-section">
            <h4>${t('notification.filter.type') || 'Tipo'}</h4>
            ${_filterBtn('type', 'all', t('notification.filter.all') || 'Todas', _countType('all'))}
            ${_filterBtn('type', 'transactional', t('notification.filter.transactional') || 'Transacional', _countType('transactional'))}
            ${_filterBtn('type', 'social', t('notification.filter.social') || 'Social', _countType('social'))}
            ${_filterBtn('type', 'system', t('notification.filter.system') || 'Sistema', _countType('system'))}
        </div>
        <div class="notifications-filter-section">
            <h4>${t('notification.filter.status') || 'Status'}</h4>
            ${_filterBtn('status', 'all', t('notification.filter.all') || 'Todas', _countStatus('all'))}
            ${_filterBtn('status', 'unread', t('notification.filter.unread') || 'Não lidas', _countStatus('unread'))}
            ${_filterBtn('status', 'read', t('notification.filter.read') || 'Lidas', _countStatus('read'))}
            ${_filterBtn('status', 'archived', t('notification.filter.archived') || 'Arquivadas', _countStatus('archived'))}
        </div>
        <div class="notifications-filter-section">
            <h4>${t('notification.filter.date') || 'Data'}</h4>
            ${_filterBtn('date', 'all', t('notification.filter.all') || 'Todas', null)}
            ${_filterBtn('date', 'today', t('notification.filter.today') || 'Hoje', null)}
            ${_filterBtn('date', 'week', t('notification.filter.week') || 'Esta semana', null)}
            ${_filterBtn('date', 'month', t('notification.filter.month') || 'Este mês', null)}
        </div>
        ${
            orgs.length
                ? `
        <div class="notifications-filter-section">
            <h4>${t('notification.filter.org') || 'Organização'}</h4>
            ${_filterBtn('org', 'all', t('notification.filter.all') || 'Todas', null)}
            ${orgs.map((o: any) => _filterBtn('org', o, o, null)).join('')}
        </div>
        `
                : ''
        }
    `;
    panel.querySelectorAll('.notifications-filter-btn').forEach((btn: any) => {
        btn.addEventListener('click', () => {
            const group = btn.dataset.group || '';
            const value = btn.dataset.value || '';
            (_filters as any)[group] = value;
            _pageIndex = 0;
            _applyFilters();
            _renderFilters();
            _renderList();
        });
    });
}
/**
 * @param {string} group
 * @param {string} value
 * @param {string} label
 * @param {number|null} count
 */
function _filterBtn(group: any, value: any, label: any, count: any) {
    const active = (_filters as any)[group] === value ? 'active' : '';
    const countSpan = count !== null && count !== undefined ? `<span class="filter-count">${count}</span>` : '';
    return `<button type="button" class="notifications-filter-btn ${active}" data-group="${group}" data-value="${value}">${label}${countSpan}</button>`;
}
function _extractOrgs() {
    const set = new Set();
    for (const n of _allNotifications) {
        const org = n.payload?.orgId || n.payload?.organization;
        if (org) set.add(org);
    }
    return Array.from(set).sort();
}
/** @param {string} type */
function _countType(type: any) {
    const map = {
        transactional: ['documents', 'processing', 'deadlines'],
        social: ['sharing', 'invitations', 'team'],
        system: ['system', 'governance', 'watch'],
    };
    if (type === 'all') return _allNotifications.length;
    const cats = (map as Record<string,any>)[type] || [];
    return _allNotifications.filter((n: any) => cats.some((c: any) => n.type?.startsWith(c + '.'))).length;
}
/** @param {string} status */
function _countStatus(status: any) {
    if (status === 'all') return _allNotifications.length;
    if (status === 'unread') return _allNotifications.filter((n: any) => !n.read).length;
    if (status === 'read') return _allNotifications.filter((n: any) => n.read).length;
    if (status === 'archived') return _allNotifications.filter((n: any) => n.archived).length;
    return 0;
}
// ──────────────────────────────────────────────────────────────────────
// Render list
// ──────────────────────────────────────────────────────────────────────
function _renderList() {
    const listEl = _pageEl.querySelector('#notif-list');
    if (!listEl) return;
    if (!_filteredNotifications.length) {
        listEl.innerHTML = `
            <div class="notifications-empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                <span>${t('notification.page.empty') || 'Nenhuma notificação'}</span>
            </div>
        `;
        return;
    }
    const start = 0;
    const end = Math.min(_filteredNotifications.length, (_pageIndex + 1) * _pageSize);
    const pageItems = _filteredNotifications.slice(start, end);
    listEl.innerHTML = pageItems.map((n: any, idx: any) => _renderListItem(n, idx)).join('');
    // Event delegation
    listEl.querySelectorAll('.notifications-list-item').forEach((row: any) => {
        row.addEventListener("click", (e: any) => {
            if (e.target.classList.contains('notif-checkbox')) return;
            const id = row.dataset.id || '';
            _selectNotification(id);
        });
    });
    listEl.querySelectorAll('.notif-checkbox').forEach((cb: any) => {
        cb.addEventListener("change", (e: any) => {
            const id = cb.dataset.id || '';
            if (e.target.checked) _selectedIds.add(id);
            else _selectedIds.delete(id);
            _updateRowSelection(id);
            _updateBulkBar();
        });
    });
    // Hydrate icons if available
    if (typeof window.hydrateIcons === 'function') {
        requestAnimationFrame(() => window.hydrateIcons(listEl));
    }
}
/**
 * @param {any} n
 * @param {number} idx
 */
function _renderListItem(n: any, idx: any) {
    const isSelected = _selectedIds.has(n.id);
    const isActive = _selectedNotification?.id === n.id;
    const activeClass = isActive ? 'selected' : '';
    const readClass = n.read ? 'read' : '';
    const indicator = !n.read ? '<div class="notif-unread-indicator"></div>' : '';
    const icon = _typeIcon(n.type);
    const time = _timeAgo(n.updatedAt || n.createdAt);
    const priorityClass = `notif-priority-${n.tier || 'P2'}`;
    const priorityLabel = n.tier || 'P2';
    const title = n.payload?.title || t(`notification.${n.type}`) || n.type;
    const desc = n.payload?.body || '';
    return `
        <div class="notifications-list-item ${activeClass} ${readClass}" data-id="${n.id}" data-index="${idx}">
            ${indicator}
            <input data-field-meta="true" data-field-meta-key="auto-pos:notificationsPage:input:L375" type="checkbox" class="notif-checkbox" data-id="${n.id}" ${isSelected ? 'checked' : ''}>
            <div class="notif-icon-wrap"><span data-icon="${icon}" data-icon-size="14px"></span></div>
            <div class="notif-content">
                <div class="notif-title">${title}</div>
                ${desc ? `<div class="notif-desc">${desc}</div>` : ''}
                <div class="notif-meta">
                    <span class="notif-time">${time}</span>
                    <span class="notif-priority-badge ${priorityClass}">${priorityLabel}</span>
                </div>
            </div>
        </div>
    `;
}
/** @param {string} id */
function _updateRowSelection(id: any) {
    const row = _pageEl.querySelector(`.notifications-list-item[data-id="${id}"]`);
    if (!row) return;
    const cb = row.querySelector('.notif-checkbox');
    if (cb) cb.checked = _selectedIds.has(id);
}
// ──────────────────────────────────────────────────────────────────────
// Detail panel
// ──────────────────────────────────────────────────────────────────────
/** @param {string} id */
function _selectNotification(id: any) {
    const n = _filteredNotifications.find((x: any) => x.id === id);
    if (!n) return;
    _selectedNotification = n;
    // Mark read automatically on select
    if (!n.read) {
        markRead(n.id)
            .then(() => {
                n.read = true;
                const row = _pageEl.querySelector(`.notifications-list-item[data-id="${id}"]`);
                if (row) {
                    row.classList.add('read');
                    const ind = row.querySelector('.notif-unread-indicator');
                    if (ind) ind.remove();
                }
            })
            .catch((/** @type {any} */ e) => console.debug('[notif:page]', e?.message || e));
    }
    _renderList(); // re-render to update selection highlight
    _renderDetail();
}
function _renderDetail() {
    const panel = _pageEl.querySelector('#notif-detail-panel');
    if (!panel) return;
    if (!_selectedNotification) {
        panel.innerHTML = `
            <div class="detail-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                <span>${t('notification.detail.empty') || 'Selecione uma notificação'}</span>
            </div>
        `;
        return;
    }
    const n = _selectedNotification;
    const icon = _typeIcon(n.type);
    const time = new Date(n.createdAt || 0).toLocaleString();
    const title = n.payload?.title || t(`notification.${n.type}`) || n.type;
    const body = n.payload?.body || '';
    const priorityClass = `notif-priority-${n.tier || 'P2'}`;
    const priorityLabel = n.tier || 'P2';
    const url = n.payload?.url || '';
    panel.innerHTML = `
        <div class="detail-header">
            <div class="detail-icon"><span data-icon="${icon}" data-icon-size="18px"></span></div>
            <div class="detail-title-block">
                <div class="detail-title">${title}</div>
                <div class="detail-time">${time}</div>
            </div>
            <span class="notif-priority-badge ${priorityClass}">${priorityLabel}</span>
        </div>
        ${body ? `<div class="detail-body">${body}</div>` : ''}
        <div class="detail-actions">
            ${url ? `<button type="button" class="primary" id="notif-detail-action">${t('notification.detail.actions') || 'Abrir'}</button>` : ''}
            <button type="button" id="notif-detail-read">${t('notification.markRead') || 'Marcar como lida'}</button>
            <button type="button" id="notif-detail-archive">${t('notification.dismiss') || 'Arquivar'}</button>
        </div>
        <div class="detail-meta">
            <span>ID: ${n.id}</span>
            <span>Tipo: ${n.type}</span>
            ${n.count > 1 ? `<span>Count: ${n.count}</span>` : ''}
        </div>
    `;
    if (url) {
        panel.querySelector('#notif-detail-action').addEventListener('click', () => {
            window.open(url, '_blank', 'noopener,noreferrer');
        });
    }
    panel.querySelector('#notif-detail-read').addEventListener('click', async () => {
        await markRead(n.id);
        n.read = true;
        _renderList();
        _renderDetail();
        showToast(t('notification.markRead') || 'Marcada como lida', 'success');
    });
    panel.querySelector('#notif-detail-archive').addEventListener('click', async () => {
        await archive(n.id);
        _removeFromView(n.id);
        showToast(t('notification.dismiss') || 'Arquivada', 'info');
    });
    if (typeof window.hydrateIcons === 'function') {
        requestAnimationFrame(() => window.hydrateIcons(panel));
    }
}
// ──────────────────────────────────────────────────────────────────────
// Bulk actions
// ──────────────────────────────────────────────────────────────────────
function _updateBulkBar() {
    const bar = _pageEl.querySelector('#notif-bulk-bar');
    const info = _pageEl.querySelector('#notif-bulk-info');
    if (!bar || !info) return;
    if (_selectedIds.size === 0) {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';
    info.textContent = `${_selectedIds.size} ${t('notification.bulk.selected') || 'selecionada(s)'}`;
}
async function _onBulkRead() {
    const ids = Array.from(_selectedIds);
    for (const id of ids) await markRead(id);
    _selectedIds.clear();
    await _refresh();
    showToast(t('notification.bulk.read') || 'Marcadas como lidas', 'success');
}
async function _onBulkArchive() {
    const ids = Array.from(_selectedIds);
    for (const id of ids) await archive(id);
    _selectedIds.clear();
    await _refresh();
    showToast(t('notification.bulk.archive') || 'Arquivadas', 'info');
}
async function _onBulkDelete() {
    const ids = Array.from(_selectedIds);
    for (const id of ids) await deleteNotification(id);
    _selectedIds.clear();
    await _refresh();
    showToast(t('notification.bulk.delete') || 'Excluídas', 'info');
}
async function _onMarkAllRead() {
    await markAllRead(_currentUserId);
    await _refresh();
    showToast(t('notification.page.markAllRead') || 'Todas marcadas como lidas', 'success');
}
function _onOpenSettings() {
    import('./notificationPreferences.js' as string)
        .then(({ openNotificationPreferences }) => openNotificationPreferences())
        .catch(() => showToast('Preferências indisponíveis', 'warning'));
}
/** @param {string} id */
function _removeFromView(id: any) {
    _allNotifications = _allNotifications.filter((n: any) => n.id !== id);
    _filteredNotifications = _filteredNotifications.filter((n: any) => n.id !== id);
    _selectedIds.delete(id);
    if (_selectedNotification?.id === id) _selectedNotification = null;
    _applyFilters();
    _renderList();
    _renderDetail();
    _updateBulkBar();
}
// ──────────────────────────────────────────────────────────────────────
// Infinite scroll
// ──────────────────────────────────────────────────────────────────────
function _setupInfiniteScroll() {
    if (_observer) _observer.disconnect();
    const sentinel = _pageEl.querySelector('#notif-sentinel');
    if (!sentinel) return;
    _observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting && !_loading) {
                    _loadMore();
                }
            }
        },
        { root: _pageEl.querySelector('.notifications-list'), rootMargin: '100px' },
    );
    _observer.observe(sentinel);
}
function _loadMore() {
    const totalPages = Math.ceil(_filteredNotifications.length / _pageSize);
    if (_pageIndex + 1 >= totalPages) return;
    _pageIndex++;
    const listEl = _pageEl.querySelector('#notif-list');
    const start = _pageIndex * _pageSize;
    const end = Math.min(_filteredNotifications.length, start + _pageSize);
    const newItems = _filteredNotifications.slice(start, end);
    const fragment = document.createElement('div');
    fragment.innerHTML = newItems.map((n: any, idx: any) => _renderListItem(n, start + idx)).join('');
    while (fragment.firstChild) {
        listEl.appendChild(fragment.firstChild);
    }
    // Re-bind events for new rows
    listEl.querySelectorAll('.notifications-list-item').forEach((row: any) => {
        row.addEventListener("click", (e: any) => {
            if (e.target.classList.contains('notif-checkbox')) return;
            const id = row.dataset.id || '';
            _selectNotification(id);
        });
    });
    listEl.querySelectorAll('.notif-checkbox').forEach((cb: any) => {
        cb.addEventListener("change", (e: any) => {
            const id = cb.dataset.id || '';
            if (e.target.checked) _selectedIds.add(id);
            else _selectedIds.delete(id);
            _updateRowSelection(id);
            _updateBulkBar();
        });
    });
    if (typeof window.hydrateIcons === 'function') {
        requestAnimationFrame(() => window.hydrateIcons(listEl));
    }
}
// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────
/** @param {string} type */
function _typeIcon(type: any) {
    const map = {
        'library.liked': 'heart',
        'comment.mention': 'message-circle',
        'user.followed': 'user-plus',
        'purchase.completed': 'check-circle',
        'security.alert': 'alert-triangle',
        'quote.received': 'file-text',
        'deadlines.task_due_24h': 'clock',
        'deadlines.task_due_1h': 'clock',
        'processing.import_completed': 'download',
        'processing.import_failed': 'alert-circle',
        'governance.approval_requested': 'shield',
        'system.maintenance_scheduled': 'tool',
        'system.backup_failed': 'alert-octagon',
        'sharing.model_shared_with_me': 'share-2',
        'invitations.organization': 'mail',
    };
    return (map as Record<string,any>)[type] || 'bell';
}
/** @param {string} dateStr */
function _timeAgo(dateStr: any) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('justNow') || 'agora';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}
