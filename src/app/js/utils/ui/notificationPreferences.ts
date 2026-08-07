// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   NOTIFICATION PREFERENCES UI — SPEC_EXTENDED_NOTIFICATIONS_9_74
   ================================================================

   Modal de preferências de notificação:
   - Lista todos os tipos agrupados por categoria
   - Toggle enabled/disabled por tipo
   - Seleção de canais (in_app, email) por tipo
   - Persiste em localStorage (ecbyts-notification-prefs)
   - Usa resolveNotificationPreference() do extendedTypes.js
   ================================================================ */
import { t } from '../i18n/translations.js';
import {
    NOTIFICATION_CATEGORIES,
    EXTENDED_TYPE_MAP,
    resolveNotificationPreference,
} from '../../core/notifications/extendedTypes.js';
import { buildModalShell } from './modals.js';
import { showToast } from './toast.js';
const PREFS_LS_KEY = 'ecbyts-notification-prefs';
const ROOT_ID = 'notification-preferences-root';
/**
 * Abre modal de preferências de notificação.
 */
export function openNotificationPreferences() {
    const root = _ensureRoot();
    root.innerHTML = '';
    root.appendChild(_buildModal());
}
/**
 * Fecha modal de preferências.
 */
export function closeNotificationPreferences() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.innerHTML = '';
}
function _ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
        root = document.createElement('div');
        root.id = ROOT_ID;
        document.body.appendChild(root);
    }
    return root;
}
/**
 * Carrega preferências do localStorage.
 * @returns {Object}
 */
export function loadNotificationPrefs() {
    try {
        const raw = localStorage.getItem(PREFS_LS_KEY) || '';
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}
/**
 * Salva preferências no localStorage.
 * @param {Object} prefs
 */
export function saveNotificationPrefs(prefs: any) {
    try {
        localStorage.setItem(PREFS_LS_KEY, JSON.stringify(prefs));
    } catch (e: any) {
        console.debug('[notificationPrefs] save:', e?.message || e);
    }
}
function _buildModal() {
    const userPrefs = loadNotificationPrefs();
    const { overlay, body, footer, close } =
        /*as:{ overlay: HTMLElement, body: HTMLElement, footer: HTMLElement, close: () => void }*/ buildModalShell({
            title: t('notification.preferences.title'),
            width: '720px',
            onClose: closeNotificationPreferences,
        });
    const description = document.createElement('p');
    description.style.margin = '0 0 12px';
    description.style.color = 'var(--text-muted, #8b949e)';
    description.textContent = t('notification.preferences.description');
    body.appendChild(description);
    const scrollWrap = document.createElement('div');
    scrollWrap.style.overflowY = 'auto';
    scrollWrap.style.flex = '1';
    scrollWrap.style.paddingRight = '4px';
    for (const category of NOTIFICATION_CATEGORIES) {
        const types = Object.entries(EXTENDED_TYPE_MAP).filter(([, cfg]) => cfg.category === category);
        if (!types.length) continue;
        const catHeader = document.createElement('h3');
        catHeader.style.fontSize = '14px';
        catHeader.style.fontWeight = '600';
        catHeader.style.margin = '16px 0 8px';
        catHeader.style.paddingBottom = '4px';
        catHeader.style.borderBottom = '1px solid var(--border-color, #2d3144)';
        catHeader.textContent = t(`notification.category.${category}`);
        scrollWrap.appendChild(catHeader);
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr auto auto';
        grid.style.gap = '8px 16px';
        grid.style.alignItems = 'center';
        const hLabel = document.createElement('div');
        hLabel.style.color = 'var(--text-muted, #8b949e)';
        hLabel.style.fontSize = '12px';
        hLabel.textContent = t('notification.preferences.title');
        const hEnabled = document.createElement('div');
        hEnabled.style.color = 'var(--text-muted, #8b949e)';
        hEnabled.style.fontSize = '12px';
        hEnabled.textContent = t('notification.preferences.enabled');
        const hChannels = document.createElement('div');
        hChannels.style.color = 'var(--text-muted, #8b949e)';
        hChannels.style.fontSize = '12px';
        hChannels.textContent = t('notification.preferences.channels');
        grid.appendChild(hLabel);
        grid.appendChild(hEnabled);
        grid.appendChild(hChannels);
        // eslint-disable-next-line
        for (const [type, config] of types) {
            const resolved = resolveNotificationPreference(type, userPrefs);
            const label = document.createElement('div');
            label.style.fontSize = '13px';
            label.textContent = t(`notification.${type}`);
            const toggleWrap = document.createElement('div');
            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.checked = resolved!.enabled;
            toggle.dataset.type = type;
            toggle.dataset.field = 'enabled';
            toggleWrap.appendChild(toggle);
            const channelsWrap = document.createElement('div');
            channelsWrap.style.display = 'flex';
            channelsWrap.style.gap = '10px';
            for (const ch of ['in_app', 'email']) {
                const chLabel = document.createElement('label');
                chLabel.style.display = 'flex';
                chLabel.style.alignItems = 'center';
                chLabel.style.gap = '4px';
                chLabel.style.fontSize = '12px';
                chLabel.style.cursor = 'pointer';
                const chBox = document.createElement('input');
                chBox.type = 'checkbox';
                chBox.checked = resolved!.channels.includes(ch);
                chBox.dataset.type = type;
                chBox.dataset.field = 'channel';
                chBox.dataset.channel = ch;
                const chText = document.createElement('span');
                chText.textContent = t(`notification.preferences.channel.${ch}`);
                chLabel.appendChild(chBox);
                chLabel.appendChild(chText);
                channelsWrap.appendChild(chLabel);
            }
            grid.appendChild(label);
            grid.appendChild(toggleWrap);
            grid.appendChild(channelsWrap);
        }
        scrollWrap.appendChild(grid);
    }
    body.appendChild(scrollWrap);
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = t('notification.preferences.save');
    saveBtn.onclick = () => {
        const newPrefs: any = {};
        body.querySelectorAll('input[data-type]').forEach((el: any) => {
            const type = el.dataset.type || '';
            if (!newPrefs[type]) newPrefs[type] = {};
            if (el.dataset.field === 'enabled') {
                newPrefs[type].enabled = el.checked;
            } else if (el.dataset.field === 'channel') {
                if (!newPrefs[type].channels) newPrefs[type].channels = [];
                if (el.checked) newPrefs[type].channels.push(el.dataset.channel);
            }
        });
        saveNotificationPrefs(newPrefs);
        showToast(t('notification.preferences.saved'), 'success');
        close();
    };
    footer.appendChild(saveBtn);
    return overlay;
}
