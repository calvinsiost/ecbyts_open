// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * notificationBell.js - Componente de sino de notificações in-app
 * Cria elemento HTMLElement com badge, dropdown e interação.
 *
 * UI do sino: badge numérico, dropdown com lista e botão "Marcar todas lidas".
 */

/**
 * Formata timestamp ISO para texto relativo ("há 2 min", "há 1 hora").
 * @param {string} isoStr
 * @returns {string}
 */
function relativeTime(isoStr: string): string {
    const diff = Date.now() - new Date(isoStr).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} hora${h > 1 ? 's' : ''}`;
    const d = Math.floor(h / 24);
    return `há ${d} dia${d > 1 ? 's' : ''}`;
}

/**
 * Inicializa o componente de sino de notificações.
 *
 * @param {any} store - retorno de createNotificationStore()
 * @returns {HTMLElement} elemento `.notif-bell` pronto para inserção no DOM
 */
export function initNotificationBell(store: any): HTMLElement {
    // --- Estrutura raiz ---
    const bell = document.createElement('div');
    bell.className = 'notif-bell';
    bell.setAttribute('role', 'button');
    bell.setAttribute('aria-label', 'Notificações');
    bell.setAttribute('tabindex', '0');

    // Ícone de sino (HTML entity, sem emoji conforme padrão do projeto)
    const icon = document.createElement('span');
    icon.className = 'notif-bell-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '&#9993;'; // envelope / sino alternativo sem emoji

    // Badge numérico
    const badge = document.createElement('span');
    badge.className = 'notif-badge';
    badge.setAttribute('aria-live', 'polite');
    badge.hidden = true;

    bell.appendChild(icon);
    bell.appendChild(badge);

    // --- Dropdown ---
    const dropdown = document.createElement('div');
    dropdown.className = 'notif-dropdown';
    dropdown.hidden = true;
    dropdown.setAttribute('role', 'dialog');
    dropdown.setAttribute('aria-label', 'Lista de notificações');
    bell.appendChild(dropdown);

    // --- Estado de visibilidade ---
    let open = false;

    function renderDropdown() {
        dropdown.innerHTML = '';

        const items = store.getAll(10);

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'notif-item';
            empty.style.textAlign = 'center';
            empty.style.color = 'var(--text-secondary, #666)';
            empty.textContent = 'Nenhuma notificação';
            dropdown.appendChild(empty);
        } else {
            items.forEach((notif: any) => {
                const item = document.createElement('div');
                item.className = 'notif-item' + (notif.read ? '' : ' notif-item--unread');
                item.setAttribute('data-notif-id', notif.id);
                item.setAttribute('role', 'button');
                item.setAttribute('tabindex', '0');

                const titleEl = document.createElement('div');
                titleEl.className = 'notif-item-title';
                titleEl.textContent = notif.title;

                const bodyEl = document.createElement('div');
                bodyEl.className = 'notif-item-body';
                bodyEl.textContent = notif.body;

                const timeEl = document.createElement('div');
                timeEl.className = 'notif-item-time';
                timeEl.textContent = relativeTime(notif.createdAt);

                item.appendChild(titleEl);
                if (notif.body) item.appendChild(bodyEl);
                item.appendChild(timeEl);

                item.addEventListener('click', () => {
                    store.markRead(notif.id);
                    updateBellBadge(store, bell);
                    renderDropdown();
                });

                dropdown.appendChild(item);
            });
        }

        // Botão "Marcar todas lidas"
        const markAll = document.createElement('div');
        markAll.className = 'notif-mark-all';
        markAll.setAttribute('role', 'button');
        markAll.setAttribute('tabindex', '0');
        markAll.textContent = 'Marcar todas como lidas';
        markAll.addEventListener('click', (e) => {
            e.stopPropagation();
            store.markAllRead();
            updateBellBadge(store, bell);
            renderDropdown();
        });
        dropdown.appendChild(markAll);
    }

    function toggleDropdown() {
        open = !open;
        dropdown.hidden = !open;
        if (open) renderDropdown();
    }

    bell.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown();
    });

    bell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleDropdown();
        }
    });

    // Fecha dropdown ao clicar fora
    document.addEventListener('click', () => {
        if (open) {
            open = false;
            dropdown.hidden = true;
        }
    });

    // Inicializa badge
    updateBellBadge(store, bell);

    return bell;
}

/**
 * Atualiza o badge numérico no elemento sino.
 *
 * @param {any} store       - retorno de createNotificationStore()
 * @param {HTMLElement} bellEl - elemento retornado por initNotificationBell()
 */
export function updateBellBadge(store: any, bellEl: HTMLElement): void {
    const badge = bellEl.querySelector('.notif-badge') as HTMLElement | null;
    if (!badge) return;
    const count = store.getUnreadCount();
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.hidden = false;
    } else {
        badge.textContent = '';
        badge.hidden = true;
    }
}
