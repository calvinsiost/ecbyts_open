// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Safe Fetch with Graceful Degradation - pure module.
 *
 * Extracted in ARCH-MONO-001 Phase 1 from inline ad-hoc fetch calls in
 * `app/js/utils/datastudio/collectionsPanel.js` and similar handlers
 * that hit `/api/*` endpoints which only exist when api-server is running
 * (NOT when serving via static `serve`).
 *
 * This helper:
 *   - Detects HTML-as-JSON responses early and treats them as "endpoint
 *     unavailable" (not as a parse error)
 *   - Provides a fallback value the caller defines explicitly
 *   - Logs once per failure mode without flooding console on retry
 *   - Never throws to the caller (degradation is the contract)
 */

export interface SafeFetchOptions<TFallback = unknown> {
    fallback?: TFallback;
    tag?: string;
    init?: RequestInit;
    timeoutMs?: number;
    silent?: boolean;
}

const warnedTags = new Set<string>();

function warnOnce(tag: string, message: string): void {
    if (warnedTags.has(tag)) return;
    warnedTags.add(tag);

    console.warn(`[ecbyts:${tag}]`, message);
}

/**
 * Reset the warned-tags cache. Useful in tests OR after a successful
 * reconnect so a future failure logs again instead of being silenced.
 */
export function clearSafeFetchWarnings(tag?: string): void {
    if (tag) warnedTags.delete(tag);
    else warnedTags.clear();
}

function describeFetchError(error: unknown): { name?: string; message: string } {
    if (error && typeof error === 'object') {
        const maybeError = error as { name?: unknown; message?: unknown; toString?: () => string };
        const described = {
            message:
                typeof maybeError.message === 'string'
                    ? maybeError.message
                    : typeof maybeError.toString === 'function'
                      ? maybeError.toString()
                      : 'unknown',
        };
        return typeof maybeError.name === 'string' ? { ...described, name: maybeError.name } : described;
    }

    if (error === null || error === undefined) return { message: 'unknown' };
    if (typeof error === 'string') return { message: error };
    if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
        return { message: String(error) };
    }
    return { message: 'unknown' };
}

/**
 * Fetch a URL expected to return JSON, with graceful degradation:
 *  - Network error -> log once + return fallback
 *  - Non-2xx response -> log once + return fallback
 *  - Non-JSON content (HTML, text, etc.) -> log once + return fallback
 *  - Timeout -> log once + return fallback
 *  - Successful JSON -> return parsed body
 */
export async function safeFetchJson<T = unknown>(url: string, opts?: SafeFetchOptions<T>): Promise<T | undefined> {
    const fallback = opts?.fallback;
    const tag = opts?.tag || 'unknown';
    const timeoutMs = opts?.timeoutMs ?? 10000;
    const silent = opts?.silent === true;
    const init = opts?.init || {};

    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    if (timeoutMs > 0) {
        timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
        const resp = await fetch(url, { ...init, signal: controller.signal });
        if (!resp.ok) {
            if (!silent) warnOnce(tag, `HTTP ${resp.status} from ${url} - using fallback`);
            return fallback;
        }

        const contentType = resp.headers.get('content-type') || '';
        if (contentType && !contentType.includes('application/json') && !contentType.includes('text/json')) {
            const text = await resp.text();
            const trimmed = text.trim();
            if (trimmed.startsWith('<') || trimmed.startsWith('!DOCTYPE')) {
                if (!silent) warnOnce(tag, `non-JSON response from ${url} (HTML?) - using fallback`);
                return fallback;
            }

            try {
                return JSON.parse(text) as T;
            } catch {
                if (!silent) warnOnce(tag, `non-JSON response from ${url} - using fallback`);
                return fallback;
            }
        }

        return (await resp.json()) as T;
    } catch (error) {
        const { name, message } = describeFetchError(error);
        if (!silent) {
            if (name === 'AbortError') {
                warnOnce(tag, `timeout fetching ${url} after ${timeoutMs}ms - using fallback`);
            } else {
                warnOnce(tag, `fetch error for ${url}: ${message} - using fallback`);
            }
        }
        return fallback;
    } finally {
        if (timer) clearTimeout(timer);
    }
}
