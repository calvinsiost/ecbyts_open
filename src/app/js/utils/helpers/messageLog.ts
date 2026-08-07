// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   MESSAGE LOG — user-facing capture of system messages (toasts,
   warnings, errors). Backs the "Mais → Logs" viewer (logsModal).

   In-memory ring buffer (cap 300) + lightweight localStorage persist
   (last 100) so the user can inspect recent error/warning/toast
   activity even after a soft reload. Hooks: showToast (toast.ts),
   console.warn/error wrap, window error + unhandledrejection.
   ================================================================ */

import { safeJsonParse } from './safeJsonParse.js';

const MAX_ENTRIES = 300;
const PERSIST_CAP = 100;
const STORE_KEY = 'ecbyts-message-log';
const EVENT_NAME = 'ecbyts:message-log';

/** @typedef {{ ts:number, level:string, message:string, source:string }} LogEntry */

/** @type {LogEntry[]} */
let _buffer: any[] = [];
let _initialized = false;

/** @param {unknown} a */
function _stringify(a: any) {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return a.message || String(a);
    try {
        return JSON.stringify(a);
    } catch (e: any) {
        console.debug('[messageLog] stringify:', e?.message || e);
        return String(a);
    }
}

function _persist() {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORE_KEY, JSON.stringify(_buffer.slice(-PERSIST_CAP)));
        }
    } catch (e: any) {
        console.debug('[messageLog] persist:', e?.message || e);
    }
}

/**
 * Record a user-facing system message.
 * @param {string} level - 'error' | 'warning' | 'success' | 'info'
 * @param {string} message
 * @param {string} [source] - 'toast' | 'console' | 'window' | 'promise' | 'system'
 */
export function recordMessage(level: any, message: any, source = 'system') {
    try {
        const entry = {
            ts: Date.now(),
            level: String(level || 'info'),
            message: _stringify(message).slice(0, 1000),
            source: String(source || 'system'),
        };
        _buffer.push(entry);
        if (_buffer.length > MAX_ENTRIES) _buffer = _buffer.slice(-MAX_ENTRIES);
        _persist();
        try {
            if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: entry }));
            }
        } catch (e: any) {
            console.debug('[messageLog] dispatch:', e?.message || e);
        }
    } catch (e: any) {
        console.debug('[messageLog] record:', e?.message || e);
    }
}

/** @returns {LogEntry[]} newest-first copy */
export function getMessages() {
    return _buffer.slice().reverse();
}

export function clearMessages() {
    _buffer = [];
    _persist();
    try {
        if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: null }));
        }
    } catch (e: any) {
        console.debug('[messageLog] clear-dispatch:', e?.message || e);
    }
}

export const MESSAGE_LOG_EVENT = EVENT_NAME;

/**
 * Install capture hooks once. Wraps console.warn/error (calls original) and
 * listens for window error + unhandledrejection. Safe to call multiple times.
 */
export function initMessageLog() {
    if (_initialized) return;
    _initialized = true;

    // Restore persisted tail.
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
    const parsed = safeJsonParse<unknown[]>(raw, [], 'messageLog-restore');
    if (Array.isArray(parsed)) _buffer = parsed;

    // Wrap console.warn / console.error (preserve original behaviour). recordMessage
    // only ever uses console.debug internally, so no recursion through warn/error.
    try {
        const c: any = console;
        const origWarn = c.warn.bind(c);
        const origError = c.error.bind(c);
        c.warn = (...args: any[]) => {
            recordMessage('warning', args.map(_stringify).join(' '), 'console');
            origWarn(...args);
        };
        c.error = (...args: any[]) => {
            recordMessage('error', args.map(_stringify).join(' '), 'console');
            origError(...args);
        };
    } catch (e: any) {
        console.debug('[messageLog] console-wrap:', e?.message || e);
    }

    // Window-level errors (additive — does not replace existing handlers).
    try {
        if (typeof window !== 'undefined') {
            window.addEventListener('error', (ev: any) => {
                recordMessage('error', ev?.message || ev?.error?.message || 'Erro de runtime', 'window');
            });
            window.addEventListener('unhandledrejection', (ev: any) => {
                recordMessage('error', ev?.reason?.message || _stringify(ev?.reason) || 'Promise rejeitada', 'promise');
            });
        }
    } catch (e: any) {
        console.debug('[messageLog] window-hooks:', e?.message || e);
    }
}
