// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SUPABASE HEALTH PROBE — Emergency Auth Phase 2
   Monitor de saude do Supabase Auth para deteccao automatica de outage.

   Polls /auth/v1/settings (endpoint barato, ~200ms) e classifica
   estado em online / degraded / offline com base em latencia + status.

   API publica:
     - checkHealth(fetchImpl=fetch)      — probe unico, retorna snapshot
     - getStatus()                       — estado em cache atual
     - startMonitoring({intervalMs, fetchImpl}) -> stop()
     - onStatusChange(cb)                -> unsubscribe()
     - markOffline(reason)               — override manual (fluxo auth)

   Transicoes de estado:
     timeout (>5s)          -> offline
     HTTP 5xx               -> offline
     HTTP 200 + lat > 2s    -> degraded
     HTTP 200 + lat <= 2s   -> online
     network error          -> offline

   Modulo nunca lanca excecao — todo async eh try/catch.
   Estado eh module-level (singleton).
   ================================================================ */

// Config Supabase eh gitignored e deployed via SSH.
// Importamos dinamicamente para que o modulo carregue em ambientes
// de teste onde supabase-config.js pode nao existir.
type HealthStatus = 'unknown' | 'online' | 'degraded' | 'offline';
export type HealthSnapshot = { status: HealthStatus; latencyMs: number; ts: number; reason?: string };
type StatusListener = (snapshot: HealthSnapshot) => void;
type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<unknown>;
type SafeFetchResult = {
    ok: boolean;
    response?: unknown;
    error?: unknown;
    timeout?: boolean;
    elapsedMs: number;
};

let _supabaseUrl: string | null = null;
let _supabaseKey: string | null = null;
let _configPromise: Promise<void> | null = null;

function _loadConfig(): Promise<void> {
    if (_configPromise) return _configPromise;
    _configPromise = (async () => {
        try {
            const mod = await import('../../supabase-config.js');
            _supabaseUrl = mod.SUPABASE_URL || null;
            _supabaseKey = mod.SUPABASE_KEY || null;
        } catch (_e) {
            // supabase-config.js ausente (teste / dev sem deploy).
            // Probe ainda funciona se fetchImpl mockar a resposta.
            _supabaseUrl = null;
            _supabaseKey = null;
        }
    })();
    return _configPromise;
}

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const PROBE_TIMEOUT_MS = 5000;
const DEGRADED_LATENCY_MS = 2000;
const DEFAULT_INTERVAL_MS = 30_000;
const HEALTH_PATH = '/auth/v1/settings';

/**
 * @typedef {'unknown'|'online'|'degraded'|'offline'} HealthStatus
 * @typedef {{ status: HealthStatus, latencyMs: number, ts: number, reason?: string }} HealthSnapshot
 * @typedef {(snapshot: HealthSnapshot) => void} StatusListener
 */

// ----------------------------------------------------------------
// MODULE STATE (singleton)
// ----------------------------------------------------------------

let _status: HealthStatus = 'unknown';
let _lastLatencyMs = 0;
let _lastTs = 0;
let _lastReason: string | undefined;
const _listeners = new Set<StatusListener>();
let _intervalHandle: ReturnType<typeof setInterval> | null = null;

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

/**
 * Snapshot atual do estado (clone defensivo).
 * @returns {HealthSnapshot}
 */
function _snapshot(): HealthSnapshot {
    return _lastReason !== undefined
        ? { status: _status, latencyMs: _lastLatencyMs, ts: _lastTs, reason: _lastReason }
        : { status: _status, latencyMs: _lastLatencyMs, ts: _lastTs };
}

/**
 * Aplica novo estado e dispara listeners se houve transicao.
 * @param {HealthStatus} next
 * @param {number} latencyMs
 * @param {string} [reason?]
 */
function _applyStatus(next: HealthStatus, latencyMs: number, reason?: string): void {
    const transitioned = next !== _status;
    _status = next;
    _lastLatencyMs = latencyMs;
    _lastTs = Date.now();
    _lastReason = reason;
    if (transitioned) {
        const snap = _snapshot();
        for (const listener of _listeners) {
            try {
                listener(snap);
            } catch (_e) {
                // Listener com erro nao deve afetar outros — silencia.
                console.debug('[supabaseHealth] listener error', _e);
            }
        }
    }
}

/**
 * Promise que resolve com { __timeout: true } apos ms.
 * @param {number} ms
 */
function _timeoutPromise(ms: number): Promise<{ __timeout: true }> {
    return new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), ms));
}

/**
 * Executa fetch com timeout. Nunca lanca — retorna error wrapper.
 * @param {(input: any, init?: any) => Promise<any>} fetchImpl
 * @param {string} url
 * @param {Record<string, string>} headers
 * @returns {Promise<{ ok: boolean, response?: any, error?: any, timeout?: boolean, elapsedMs: number }>}
 */
async function _safeFetch(fetchImpl: FetchLike, url: string, headers: Record<string, string>): Promise<SafeFetchResult> {
    const start = Date.now();
    try {
        const racing = Promise.resolve(fetchImpl(url, { method: 'GET', headers }));
        const result = await Promise.race([racing, _timeoutPromise(PROBE_TIMEOUT_MS)]);
        const elapsedMs = Date.now() - start;
        if (result && typeof result === 'object' && '__timeout' in result) {
            return { ok: false, timeout: true, elapsedMs };
        }
        return { ok: true, response: result, elapsedMs };
    } catch (e) {
        return { ok: false, error: e, elapsedMs: Date.now() - start };
    }
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Probe unico de saude. Atualiza estado cacheado e dispara listeners
 * se status mudou. Nunca lanca.
 *
 * @param {(input: any, init?: any) => Promise<any>} [fetchImpl?]
 * @returns {Promise<HealthSnapshot>}
 */
export async function checkHealth(fetchImpl?: FetchLike): Promise<HealthSnapshot> {
    const impl: FetchLike | null = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!impl) {
        _applyStatus('offline', 0, 'no_fetch_impl');
        return _snapshot();
    }

    await _loadConfig();
    const base = _supabaseUrl || '';
    const url = base ? `${base.replace(/\/$/, '')}${HEALTH_PATH}` : HEALTH_PATH;
    const headers: Record<string, string> = {};
    if (_supabaseKey) {
        headers['apikey'] = _supabaseKey;
    }

    // 1 retry em erros transient (timeout / network)
    let attempt = 0;
    let result: SafeFetchResult;
    do {
        result = await _safeFetch(impl, url, headers);
        attempt += 1;
        if (result.ok || attempt >= 2) break;
    } while (attempt < 2);

    // Timeout — offline
    if (result.timeout) {
        _applyStatus('offline', result.elapsedMs, 'timeout');
        return _snapshot();
    }
    // Network / fetch reject — offline
    if (!result.ok) {
        _applyStatus('offline', result.elapsedMs, 'network_error');
        return _snapshot();
    }

    const response = result.response as { status?: unknown } | undefined;
    const statusCode = typeof response?.status === 'number' ? response.status : 0;

    // 5xx — offline
    if (statusCode >= 500 && statusCode <= 599) {
        _applyStatus('offline', result.elapsedMs, `http_${statusCode}`);
        return _snapshot();
    }
    // Outros nao-200 (4xx) — degraded (autenticacao pode estar parcialmente OK)
    if (statusCode !== 200 && statusCode !== 0) {
        _applyStatus('degraded', result.elapsedMs, `http_${statusCode}`);
        return _snapshot();
    }
    // Resposta sem .status (mock simples) — assumir 200 OK
    // 200 + latencia alta — degraded
    if (result.elapsedMs > DEGRADED_LATENCY_MS) {
        _applyStatus('degraded', result.elapsedMs, 'slow');
        return _snapshot();
    }
    // 200 + rapida — online
    _applyStatus('online', result.elapsedMs);
    return _snapshot();
}

/**
 * Status atual em cache (sem disparar probe).
 * @returns {HealthStatus}
 */
export function getStatus(): HealthStatus {
    return _status;
}

/**
 * Snapshot completo atual (status + latency + ts + reason).
 * @returns {HealthSnapshot}
 */
export function getSnapshot(): HealthSnapshot {
    return _snapshot();
}

/**
 * Inicia poll periodico. Retorna funcao stop().
 *
 * @param {{ intervalMs?: number, fetchImpl?: (input: any, init?: any) => Promise<any> }} [opts]
 * @returns {() => void} stop function
 */
export function startMonitoring(opts?: { intervalMs?: number; fetchImpl?: FetchLike }): () => void {
    const intervalMs = opts?.intervalMs ?? DEFAULT_INTERVAL_MS;
    const fetchImpl = opts?.fetchImpl;

    // Para qualquer monitor previo
    if (_intervalHandle) {
        clearInterval(_intervalHandle);
        _intervalHandle = null;
    }

    // Primeiro probe imediato (fire-and-forget)
    checkHealth(fetchImpl).catch((e) => console.debug('[supabaseHealth] initial probe error', e));

    _intervalHandle = setInterval(() => {
        checkHealth(fetchImpl).catch((e) => console.debug('[supabaseHealth] periodic probe error', e));
    }, intervalMs);

    return function stop() {
        if (_intervalHandle) {
            clearInterval(_intervalHandle);
            _intervalHandle = null;
        }
    };
}

/**
 * Registra listener de transicoes de status.
 * Listener so e invocado quando status MUDA (nao em probes que confirmam estado).
 *
 * @param {StatusListener} callback
 * @returns {() => void} unsubscribe
 */
export function onStatusChange(callback: StatusListener): () => void {
    if (typeof callback !== 'function') {
        return () => {};
    }
    _listeners.add(callback);
    return function unsubscribe() {
        _listeners.delete(callback);
    };
}

/**
 * Forca estado offline manualmente. Util quando o fluxo de auth ja detectou
 * falha de fetch antes do probe automatico rodar.
 *
 * Dispara listeners se status mudou.
 *
 * @param {string} [reason?]
 */
export function markOffline(reason?: string): void {
    _applyStatus('offline', 0, reason || 'manual_override');
}

/**
 * TEST-ONLY: reseta estado interno para isolamento entre testes.
 * Producao nao deve chamar — sem efeito colateral observavel exceto reset.
 */
export function _resetForTesting(): void {
    _status = 'unknown';
    _lastLatencyMs = 0;
    _lastTs = 0;
    _lastReason = undefined;
    _listeners.clear();
    if (_intervalHandle) {
        clearInterval(_intervalHandle);
        _intervalHandle = null;
    }
    _supabaseUrl = null;
    _supabaseKey = null;
    _configPromise = null;
}
