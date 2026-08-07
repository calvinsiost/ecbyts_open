// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Library Visual Indicators - P1-27
 * Status dots for library cards: active, stale, archived, new.
 *
 * Sem dependência de DOM para computeIndicatorStatus - testável em Node.
 * renderStatusDot manipula DOM via createElement/setAttribute (sem innerHTML).
 */

// Status constants / Constantes de status
export const INDICATOR_STATUS = {
    ACTIVE: 'active', // verde — ativo
    STALE: 'stale', // amarelo — sem atualização >30 dias
    ARCHIVED: 'archived', // cinza — arquivado
    NEW: 'new', // azul — adicionado <7 dias
};

/** 30 days in ms */
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
/** 7 days in ms */
const NEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Determina status visual de um item de library.
 * Prioridade: archived > new > stale > active
 *
 * @param {{ updatedAt: number, createdAt: number, archived?: boolean }} item
 * @param {number} [now] - timestamp injetavel para testes
 * @returns {string} - INDICATOR_STATUS value
 */
export function computeIndicatorStatus(
    item: { updatedAt: number; createdAt: number; archived?: boolean },
    now: number = Date.now(),
): string {
    if (item.archived) return INDICATOR_STATUS.ARCHIVED;
    if (now - item.createdAt < NEW_THRESHOLD_MS) return INDICATOR_STATUS.NEW;
    if (now - item.updatedAt > STALE_THRESHOLD_MS) return INDICATOR_STATUS.STALE;
    return INDICATOR_STATUS.ACTIVE;
}

/**
 * Renderiza badge de status num container.
 * Remove dot anterior antes de inserir o novo.
 * Usa apenas textContent/classList/setAttribute - nunca innerHTML.
 *
 * @param {HTMLElement} container
 * @param {string} status - INDICATOR_STATUS value
 */
export function renderStatusDot(container: HTMLElement, status: string): void {
    if (!container) return;

    // Remove dot anterior / Remove previous dot
    removeStatusDot(container);

    const dot = document.createElement('span');
    dot.setAttribute('data-status-dot', status);
    dot.className = 'lib-indicator lib-indicator--' + status;
    dot.setAttribute('aria-label', status);
    dot.setAttribute('role', 'img');
    container.appendChild(dot);
}

/**
 * Remove badge de status do container, se existir.
 * @param {HTMLElement} container
 */
export function removeStatusDot(container: HTMLElement): void {
    const existing = container?.querySelector('[data-status-dot]');
    if (existing) existing.remove();
}
