// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// UX-51 Clipboard Manager - pure-logic in-app clipboard with history
// Gerenciador de clipboard interno (não usa navigator.clipboard nem DOM):
// suporta copy/cut/paste de elementos, observações, propriedades e campanhas
// com histórico imutável FIFO.

const VALID_CONTENT_TYPES = Object.freeze(['element', 'observation', 'property', 'campaign', 'multi']);

const VALID_OPERATIONS = Object.freeze(['copy', 'cut']);

/**
 * Cria um ClipboardEntry congelado.
 * @param {any} input
 * @returns {object} frozen entry
 */
function freezeEntry(input: any): object {
    if (!input || typeof input !== 'object') {
        throw new Error('clipboard: entry must be an object');
    }
    if (!input.id || typeof input.id !== 'string') {
        throw new Error('clipboard: entry.id is required (non-empty string)');
    }
    if (!VALID_CONTENT_TYPES.includes(input.contentType)) {
        throw new Error(
            `clipboard: invalid contentType "${input.contentType}" (allowed: ${VALID_CONTENT_TYPES.join(',')})`,
        );
    }
    if (input.operation && !VALID_OPERATIONS.includes(input.operation)) {
        throw new Error(`clipboard: invalid operation "${input.operation}"`);
    }
    const entry = {
        id: input.id,
        timestamp: typeof input.timestamp === 'number' ? input.timestamp : Date.now(),
        operation: input.operation || 'copy',
        contentType: input.contentType,
        payload: input.payload !== undefined ? input.payload : null,
        sourceId: input.sourceId || null,
        sourceContext: input.sourceContext || null,
    };
    return Object.freeze(entry);
}

/**
 * Cria estado inicial de clipboard.
 * @param {{maxHistory?: number}} opts
 */
export function createClipboardState(opts: { maxHistory?: number } = {}) {
    const maxHistory =
        Number.isInteger(opts.maxHistory) && (opts.maxHistory as number) > 0
            ? (opts.maxHistory as number)
            : 20;
    return Object.freeze({
        current: null,
        history: Object.freeze([]),
        maxHistory,
    });
}

function pushHistory(history: any, entry: any, maxHistory: any) {
    // Most recent first; FIFO drop oldest
    const next = [entry, ...history];
    const trimmed = next.length > maxHistory ? next.slice(0, maxHistory) : next;
    return Object.freeze(trimmed);
}

/**
 * Copia entry para o clipboard (operation='copy').
 */
export function copy(state: any, input: any) {
    const entry = freezeEntry({ ...input, operation: 'copy' });
    return Object.freeze({
        current: entry,
        history: pushHistory(state.history, entry, state.maxHistory),
        maxHistory: state.maxHistory,
    });
}

/**
 * Recorta entry (operation='cut'). One-shot: zerada após paste.
 */
export function cut(state: any, input: any) {
    const entry = freezeEntry({ ...input, operation: 'cut' });
    return Object.freeze({
        current: entry,
        history: pushHistory(state.history, entry, state.maxHistory),
        maxHistory: state.maxHistory,
    });
}

/**
 * Cola entry corrente. Se 'cut', zera após retornar; se 'copy', preserva.
 * @returns {{entry: object|null, state: object}}
 */
export function paste(state: any): { entry: object | null; state: object } {
    if (!state.current) {
        return { entry: null, state };
    }
    const entry = state.current;
    if (entry.operation === 'cut') {
        const next = Object.freeze({
            current: null,
            history: state.history,
            maxHistory: state.maxHistory,
        });
        return { entry, state: next };
    }
    return { entry, state };
}

/**
 * Limpa current; mantém history.
 */
export function clear(state: any) {
    return Object.freeze({
        current: null,
        history: state.history,
        maxHistory: state.maxHistory,
    });
}

/**
 * Limpa history; mantém current.
 */
export function clearHistory(state: any) {
    return Object.freeze({
        current: state.current,
        history: Object.freeze([]),
        maxHistory: state.maxHistory,
    });
}

/**
 * Retorna últimas N entries (most recent first).
 */
export function getHistory(state: any, limit: any) {
    if (typeof limit !== 'number' || limit <= 0) return state.history;
    return Object.freeze(state.history.slice(0, limit));
}

/**
 * Busca entry por id em history (e current).
 */
export function getEntryById(state: any, id: any) {
    if (!id) return null;
    if (state.current && state.current.id === id) return state.current;
    return state.history.find((e: any) => e.id === id) || null;
}

/**
 * Restaura uma entry da history para current.
 */
export function restoreFromHistory(state: any, entryId: any) {
    const found = state.history.find((e: any) => e.id === entryId);
    if (!found) {
        throw new Error(`clipboard: entry "${entryId}" not found in history`);
    }
    return Object.freeze({
        current: found,
        history: state.history,
        maxHistory: state.maxHistory,
    });
}

/**
 * @returns {boolean}
 */
export function hasContent(state: any): boolean {
    return state.current !== null;
}

/**
 * Sumariza estado para inspeção/UI.
 */
export function summarizeClipboard(state: any) {
    const byContentType: Record<string, number> = {};
    for (const e of state.history) {
        byContentType[e.contentType] = (byContentType[e.contentType] || 0) + 1;
    }
    return Object.freeze({
        hasContent: state.current !== null,
        currentType: state.current ? state.current.contentType : null,
        currentOperation: state.current ? state.current.operation : null,
        historyCount: state.history.length,
        maxHistory: state.maxHistory,
        byContentType: Object.freeze(byContentType),
    });
}

export const __internals = Object.freeze({
    VALID_CONTENT_TYPES,
    VALID_OPERATIONS,
    freezeEntry,
});
