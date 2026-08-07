// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   POLL BACKOFF — BOOT-RESILIENCE-001 (#toast-offline-e-retry-ws)
   ================================================================

   Estado de backoff para LOOPS DE POLLING (heartbeat, badge de
   consistencia, qualquer re-fetch periodico). Enquanto o endpoint
   responde, o loop mantem a cadencia base; quando falha, o intervalo
   cresce exponencialmente ate um TETO — deixa de martelar um servidor
   que caiu (o caso "server local morto" da rodada 2026-07-17).

   Nao e um retry de requisicao unica (isso e `_lazyImportRetryPolicyPure`
   / `_retryAfterPolicyPure`): aqui NUNCA se desiste, so se espaca. Um
   poll periodico que "esgota tentativas" nunca mais se recupera sozinho.

   A matematica (exponencial + jitter anti-thundering-herd) e reusada de
   `_backoffJitterPure`; este modulo so carrega a contagem de falhas e a
   borda de recuperacao.

   Pure-logic: `random` e injetavel — com seed fixo os atrasos sao
   deterministicos (testavel com igualdade exata).
   ================================================================ */

import { computeBackoffMs, type JitterStrategy } from './_backoffJitterPure.js';

/** Cadencia saudavel default (30s) — igual ao heartbeat de onlineState. */
export const DEFAULT_POLL_BASE_MS = 30_000;
/** Teto default (5min) — servidor morto vira 1 probe a cada ~5min. */
export const DEFAULT_POLL_CAP_MS = 300_000;

export interface PollBackoffOptions {
    /** Intervalo com o endpoint saudavel. Default 30s. */
    readonly baseMs?: number;
    /** Teto do intervalo degradado. Default 5min. Nunca menor que baseMs. */
    readonly capMs?: number;
    /** Estrategia de jitter (default 'equal': metade fixa + metade aleatoria). */
    readonly strategy?: JitterStrategy;
    /** Fonte de aleatoriedade [0..1). Injetavel para teste deterministico. */
    readonly random?: () => number;
}

export interface PollBackoff {
    /** Quanto esperar ANTES do proximo poll, dado o estado atual. */
    nextDelayMs(): number;
    /** Marca sucesso. Retorna `true` se ESTE sucesso encerrou uma sequencia de falhas (borda de recuperacao). */
    recordSuccess(): boolean;
    /** Marca falha. Retorna a nova contagem de falhas consecutivas. */
    recordFailure(): number;
    /** Falhas consecutivas acumuladas. */
    failures(): number;
    /** `true` quando o loop esta espacado (ha pelo menos uma falha). */
    isBackedOff(): boolean;
    /** Volta ao estado saudavel sem sinalizar borda de recuperacao. */
    reset(): void;
}

function positiveInt(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return fallback;
    return Math.floor(value);
}

function clampSeed(seed: unknown): number {
    if (typeof seed !== 'number' || !Number.isFinite(seed) || seed < 0) return 0;
    return seed >= 1 ? 0.999_999_999 : seed;
}

/**
 * Cria o estado de backoff de um loop de polling.
 *
 * Invariantes (garantidos por clamp, nao por convencao do caller):
 *   - `nextDelayMs()` sem falhas === `baseMs` exatamente (cadencia estavel,
 *     sem jitter — o jitter so importa quando TODOS os clientes estao
 *     re-tentando o mesmo servidor caido).
 *   - `baseMs <= nextDelayMs() <= capMs` sempre, com qualquer seed.
 *   - o atraso cresce monotonicamente com as falhas ate o teto (seed fixo).
 */
export function createPollBackoff(options: PollBackoffOptions = {}): PollBackoff {
    const baseMs = positiveInt(options?.baseMs, DEFAULT_POLL_BASE_MS);
    const capMs = Math.max(baseMs, positiveInt(options?.capMs, Math.max(DEFAULT_POLL_CAP_MS, baseMs)));
    const strategy: JitterStrategy = options?.strategy ?? 'equal';
    const random = typeof options?.random === 'function' ? options.random : Math.random;
    let failures = 0;

    return {
        nextDelayMs(): number {
            if (failures <= 0) return baseMs;
            let seed: number;
            try {
                seed = clampSeed(random());
            } catch {
                // Fonte de aleatoriedade quebrada nao pode derrubar o loop de
                // polling: seed 0 degrada para o piso da estrategia.
                seed = 0;
            }
            const delay = computeBackoffMs(failures, seed, { baseMs, capMs, strategy });
            if (!Number.isFinite(delay) || delay < baseMs) return baseMs;
            return delay > capMs ? capMs : delay;
        },
        recordSuccess(): boolean {
            const recovered = failures > 0;
            failures = 0;
            return recovered;
        },
        recordFailure(): number {
            failures += 1;
            return failures;
        },
        failures(): number {
            return failures;
        },
        isBackedOff(): boolean {
            return failures > 0;
        },
        reset(): void {
            failures = 0;
        },
    };
}
