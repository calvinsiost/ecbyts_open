// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// _offlineAwareLogPure — decide o NÍVEL de log de uma falha de rede conforme o
// estado de conectividade. Pure-logic, sem DOM/navigator (injetados).
//
// Motivação (BUG-019 telemetry drain, claude - bug 2026-06-15): falhas de rede
// (`Failed to fetch`) em autosave/atividade/lanes floodavam telemetry_errors
// quando o app estava OFFLINE — mas offline já é surfaceado ao usuário pelo
// banner/bolha do mascote (offlineBannerMascotAdapter). Logar como warn/error
// nesse caso é ruído duplicado. Online + falha de rede = inesperado (warn).
//
// O reporter de erros ingere console.warn + console.error, NUNCA console.debug.
// Então rebaixar para 'debug' tira da telemetria sem sumir do console verbose.

export type LogLevel = 'debug' | 'warn' | 'error';

const NETWORK_HINTS = [
    'failed to fetch',
    'networkerror',
    'network error',
    'econnrefused',
    'econnreset',
    'load failed', // Safari fetch abort/offline
    'fetch',
];

/**
 * Heurística: a mensagem/erro indica falha de rede (transporte), não erro lógico?
 * @param err Error, string, ou objeto com .message
 */
export function isNetworkError(err: unknown): boolean {
    let msg = '';
    if (typeof err === 'string') msg = err;
    else if (err && typeof err === 'object') {
        const o = err as Record<string, unknown>;
        msg = String(o.message ?? o.error ?? o.name ?? '');
    }
    msg = msg.toLowerCase();
    return NETWORK_HINTS.some((h) => msg.includes(h));
}

/**
 * Decide o nível de log para uma falha, dado o estado online.
 *
 * - Falha de rede + OFFLINE → 'debug' (esperado; banner já informa; fora da telemetria)
 * - Falha de rede + ONLINE → mantém o nível pedido (inesperado, investigar)
 * - Não-rede → mantém o nível pedido (erro lógico real)
 *
 * @param err erro capturado
 * @param isOnline navigator.onLine (true se desconhecido — fail-safe: não esconde)
 * @param intended nível que o call site usaria normalmente ('warn' | 'error')
 */
export function decideNetworkLogLevel(
    err: unknown,
    isOnline: boolean,
    intended: LogLevel = 'warn',
): LogLevel {
    if (isNetworkError(err) && isOnline === false) return 'debug';
    return intended;
}

/**
 * Lê navigator.onLine de forma defensiva. Default true (fail-safe: na dúvida,
 * NÃO esconde o erro — só rebaixa quando temos certeza de que está offline).
 */
export function readIsOnline(nav?: { onLine?: boolean }): boolean {
    const n = nav ?? (typeof navigator !== 'undefined' ? navigator : undefined);
    if (!n || typeof n.onLine !== 'boolean') return true;
    return n.onLine;
}

/**
 * Helper de conveniência: emite o log no nível decidido usando o console injetado.
 * Mantém a mensagem; só muda o canal (debug não vai p/ telemetry_errors).
 */
export function logNetworkAware(
    consoleRef: { debug?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void; error?: (...a: unknown[]) => void },
    err: unknown,
    args: unknown[],
    opts: { isOnline?: boolean; intended?: LogLevel } = {},
): LogLevel {
    const isOnline = typeof opts.isOnline === 'boolean' ? opts.isOnline : readIsOnline();
    const level = decideNetworkLogLevel(err, isOnline, opts.intended ?? 'warn');
    const fn = consoleRef[level] || consoleRef.warn;
    if (typeof fn === 'function') fn(...args);
    return level;
}
