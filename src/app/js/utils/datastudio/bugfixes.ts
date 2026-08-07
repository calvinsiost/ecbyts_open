// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   DATA STUDIO BUGFIXES — Utilitarios de robustez
   Correcoes P1-P6: timeout, debounce, memory, XSS, timezone, reconnect.
   ================================================================ */
import { createLogger } from '../helpers/logger.js';
import { escapeHtml } from '../helpers/html.js';
const log = createLogger('DataStudioBugfixes');
/**
 * P1 - Wraps a SQL query function with a timeout guard.
 * Evita queries travadas que bloqueiam a UI indefinidamente.
 *
 * @param queryFn - Async function that executes the query
 * @param timeoutMs - Max wait time in ms (default 5000)
 * @returns Query result or rejection on timeout
 */
export function withQueryTimeout(queryFn: any, timeoutMs = 5000) {
    if (typeof queryFn !== 'function') {
        return Promise.reject(new Error('queryFn must be a function'));
    }
    if (timeoutMs <= 0)
        timeoutMs = 5000;
    return Promise.race([
        Promise.resolve().then(() => queryFn()),
        new Promise((_: any, reject: any) => {
            setTimeout(() => reject(new Error('Query timeout exceeded')), timeoutMs);
        }),
    ]);
}
/**
 * P2 - Creates a debounced version of a chart refresh function.
 * Impede atualizacoes redundantes quando o usuario digita rapido.
 *
 * @param refreshFn - The function to debounce
 * @param delayMs - Debounce window in ms (default 300)
 * @returns Debounced function
 */
export function debounceChartRefresh(refreshFn: any, delayMs = 300) {
    if (typeof refreshFn !== 'function') {
        throw new Error('refreshFn must be a function');
    }
    if (delayMs < 0)
        delayMs = 300;
    let timerId: any = null;
    const debounced: any = (...args: any[]) => {
        if (timerId !== null)
            clearTimeout(timerId);
        timerId = setTimeout(() => {
            timerId = null;
            refreshFn(...args);
        }, delayMs);
    };
    debounced.cancel = () => {
        if (timerId !== null)
            clearTimeout(timerId);
        timerId = null;
    };
    return debounced;
}
/**
 * P3 - Tracks query result references for memory management.
 * Permite descartar resultados antigos e evitar memory leaks.
 *
 * @param queryId - Unique identifier for the query
 * @returns Tracker API
 */
export function trackQueryMemory(queryId: any) {
    const _tracked = new Map();
    return {
        /** Store a query result reference */
        store(id: any, data: any) {
            const key = id || queryId;
            _tracked.set(key, { data, ts: Date.now() });
            log.debug('Tracked query result:', key);
        },
        /** Dispose a specific query result */
        dispose(id: any) {
            const key = id || queryId;
            const deleted = _tracked.delete(key);
            if (deleted)
                log.debug('Disposed query result:', key);
            return deleted;
        },
        /** Check if a query result is tracked */
        isTracked(id: any) {
            return _tracked.has(id || queryId);
        },
        /** Get all tracked query IDs */
        getAll() {
            return Array.from(_tracked.keys());
        },
        /** Dispose all tracked results */
        disposeAll() {
            const count = _tracked.size;
            _tracked.clear();
            log.debug('Disposed all query results:', count);
            return count;
        },
    };
}
/**
 * P4 - Sanitizes all cell values in export data to prevent XSS.
 * Escapa HTML em todas as celulas antes de gerar CSV/JSON.
 *
 * @param data - Rows of data (arrays or objects)
 * @returns Sanitized copy of the data
 */
export function sanitizeExportData(data: any) {
    if (!Array.isArray(data))
        return [];
    return data.map((row: any) => {
        if (Array.isArray(row)) {
            return row.map((cell: any) => (typeof cell === 'string' ? escapeHtml(cell) : cell));
        }
        if (row && typeof row === 'object') {
            const sanitized: Record<string, any> = {};
            for (const [key, value] of Object.entries(row)) {
                sanitized[key] = typeof value === 'string' ? escapeHtml(value) : value;
            }
            return sanitized;
        }
        return row;
    });
}
/**
 * P5 - Normalizes timezone in date strings from query results.
 * Converte datas para o timezone alvo, padronizando exibicao.
 *
 * @param dateStr - ISO date string or parseable date
 * @param targetTZ - IANA timezone (e.g. 'America/Sao_Paulo')
 * @returns Normalized ISO string, or original if unparseable
 */
export function normalizeTimezone(dateStr: any, targetTZ: any) {
    if (!dateStr || typeof dateStr !== 'string')
        return dateStr || '';
    if (!targetTZ || typeof targetTZ !== 'string')
        return dateStr;
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime()))
            return dateStr;
        // Intl.DateTimeFormat para converter ao timezone alvo
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: targetTZ,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
        return formatter.format(date);
    }
    catch (err: any) {
        log.warn('Timezone normalization failed:', err?.message);
        return dateStr;
    }
}
/**
 * P6 - Reconnects with exponential backoff on connection failure.
 * Tenta reconectar com atraso exponencial (1s, 2s, 4s...).
 *
 * @param connectFn - Async function that attempts connection
 * @param maxRetries - Maximum number of retry attempts (default 3)
 * @returns Connection result or final rejection
 */
export async function reconnectWithBackoff(connectFn: any, maxRetries = 3) {
    if (typeof connectFn !== 'function') {
        throw new Error('connectFn must be a function');
    }
    if (maxRetries < 0)
        maxRetries = 3;
    let lastError: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await connectFn(attempt);
            if (attempt > 0)
                log.info('Reconnected on attempt', attempt);
            return result;
        }
        catch (err: any) {
            lastError = err;
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                log.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms`);
                await new Promise((r: any) => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}
