// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * notificationStore.js - In-memory store para notificações (Fase 1)
 * Sem persistência IDB nesta fase - reinicia junto com o contexto.
 *
 * Store em memória: máx 200 itens, API fluente, sem efeitos externos.
 */

import { markAsRead } from './notificationSchema.js';

const MAX_SIZE = 200;

/**
 * Cria um store de notificações em memória.
 */
export function createNotificationStore(): {
    push(notification: object): void;
    markRead(id: string): void;
    markAllRead(): void;
    getUnread(): object[];
    getAll(limit?: number): object[];
    clear(): void;
    getUnreadCount(): number;
} {
    /** itens em ordem de inserção */
    let _items: any[] = [];

    /**
     * Adiciona notificação ao store.
     * Remove as mais antigas quando ultrapassa MAX_SIZE.
     * @param notification - criada por createNotification()
     */
    function push(notification: object): void {
        _items.push(notification);
        if (_items.length > MAX_SIZE) {
            // Remove as mais antigas (início do array)
            _items = _items.slice(_items.length - MAX_SIZE);
        }
    }

    /**
     * Marca notificação específica como lida.
     * Se id não existir, não lança erro.
     */
    function markRead(id: string): void {
        const idx = _items.findIndex((n) => n.id === id);
        if (idx !== -1) {
            _items[idx] = markAsRead(_items[idx]);
        }
    }

    /**
     * Marca todas as notificações como lidas.
     */
    function markAllRead(): void {
        _items = _items.map((n) => (n.read ? n : markAsRead(n)));
    }

    /**
     * Retorna notificações não lidas em ordem decrescente de createdAt.
     */
    function getUnread(): object[] {
        return _items.filter((n) => !n.read).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    /**
     * Retorna todas as notificações em ordem decrescente de createdAt.
     * @param limit? - se fornecido, limita a N itens
     */
    function getAll(limit?: number): object[] {
        const sorted = [..._items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return limit !== undefined ? sorted.slice(0, limit) : sorted;
    }

    /**
     * Limpa o store completamente (útil para testes).
     */
    function clear(): void {
        _items = [];
    }

    /**
     * Retorna o número de notificações não lidas.
     */
    function getUnreadCount(): number {
        return _items.filter((n) => !n.read).length;
    }

    return { push, markRead, markAllRead, getUnread, getAll, clear, getUnreadCount };
}
