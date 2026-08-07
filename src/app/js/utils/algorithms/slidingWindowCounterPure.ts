// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — Sliding window counter rate limiter (item 12). Pure-logic.

   Limita N requisições por janela de tempo SEM o "efeito de borda" da janela
   fixa (que permitiria ~2N no entorno da virada). Estima a taxa ponderando a
   contagem da janela anterior pela fração que ainda "vaza" para a atual
   (técnica Cloudflare). Memória O(1): duas contagens + o início da janela.

   Complementa o token bucket já existente (_rateLimitTokenBucketPure): o
   bucket modela rajada+vazão contínua; a janela deslizante modela "no máx N
   por janela" de forma simples e auditável.

   O relógio é INJETADO (nowMs por chamada) → determinístico em teste.

   Uso no ecbyts: teto de chamadas por janela em APIs/LLM/edge — ex.: "máx 60
   requisições/min por usuário" sem permitir pico duplo na virada do minuto.

   Ref: Cloudflare 2017, "How we built rate limiting capable of scaling to
   millions of domains" (sliding window counter).
   ================================================================ */

export interface SlidingWindowState {
    readonly limit: number;
    readonly windowMs: number;
    currentWindowStart: number;
    currentCount: number;
    previousCount: number;
    started: boolean;
}

export interface AcquireResult {
    readonly allowed: boolean;
    /** Estimativa ponderada de uso na janela deslizante (após a decisão). */
    readonly estimate: number;
    /** Quanto ainda cabe agora (0 se bloqueado). */
    readonly remaining: number;
}

/** Cria o estado do limiter. */
export function createSlidingWindow(limit: number, windowMs: number): SlidingWindowState {
    if (!Number.isInteger(limit) || limit < 0) {
        throw new RangeError('createSlidingWindow: limit deve ser inteiro ≥ 0');
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
        throw new RangeError('createSlidingWindow: windowMs deve ser > 0');
    }
    return { limit, windowMs, currentWindowStart: 0, currentCount: 0, previousCount: 0, started: false };
}

interface RolledView {
    windowStart: number;
    currentCount: number;
    previousCount: number;
}

/** Visão "rolada" para nowMs SEM mutar (alinhada à grade desde a âncora). */
function rolledView(s: SlidingWindowState, nowMs: number): RolledView {
    if (!s.started || nowMs < s.currentWindowStart + s.windowMs) {
        return {
            windowStart: s.started ? s.currentWindowStart : nowMs,
            currentCount: s.started ? s.currentCount : 0,
            previousCount: s.started ? s.previousCount : 0,
        };
    }
    const windowsPassed = Math.floor((nowMs - s.currentWindowStart) / s.windowMs);
    return {
        windowStart: s.currentWindowStart + windowsPassed * s.windowMs,
        currentCount: 0,
        previousCount: windowsPassed === 1 ? s.currentCount : 0,
    };
}

function estimateFrom(view: RolledView, windowMs: number, nowMs: number): number {
    const into = nowMs - view.windowStart; // [0, windowMs)
    const overlap = 1 - into / windowMs;
    return view.previousCount * Math.max(0, overlap) + view.currentCount;
}

/** Estimativa ponderada de uso em nowMs (peek, não muta). */
export function estimateUsage(s: SlidingWindowState, nowMs: number): number {
    return estimateFrom(rolledView(s, nowMs), s.windowMs, nowMs);
}

/**
 * Tenta consumir 1 permissão em nowMs. Permite se a estimativa ponderada
 * projetada ficar ≤ limit. Muta o estado (rola janelas + incrementa se ok).
 */
export function tryAcquire(s: SlidingWindowState, nowMs: number): AcquireResult {
    if (!Number.isFinite(nowMs)) {
        throw new RangeError('tryAcquire: nowMs deve ser número finito');
    }
    const view = rolledView(s, nowMs);
    s.currentWindowStart = view.windowStart;
    s.currentCount = view.currentCount;
    s.previousCount = view.previousCount;
    s.started = true;

    const projected = estimateFrom(view, s.windowMs, nowMs) + 1;
    const allowed = projected <= s.limit;
    if (allowed) s.currentCount++;

    const estimate = estimateUsage(s, nowMs);
    return Object.freeze({
        allowed,
        estimate,
        remaining: Math.max(0, s.limit - Math.ceil(estimate)),
    });
}
