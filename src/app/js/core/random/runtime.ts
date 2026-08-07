// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

interface RandomRuntime {
    getRng?: (channel: string) => () => number;
    rng?: () => number;
    now?: () => number;
    uuid?: () => string;
}

declare global {
    var __ecbytsRandomRuntime: RandomRuntime | null | undefined;

    interface Window {
        __ecbytsRandomRuntime?: RandomRuntime | null;
    }
}

type RuntimeDateArgs =
    | []
    | [value: string | number | Date]
    | [
          year: number,
          monthIndex: number,
          date?: number,
          hours?: number,
          minutes?: number,
          seconds?: number,
          milliseconds?: number,
      ];

function getRoot(): typeof globalThis {
    return typeof window !== 'undefined' ? window : globalThis;
}

export function getRandomRuntime(): RandomRuntime | null {
    return getRoot().__ecbytsRandomRuntime || null;
}

export function runtimeRandom(channel = 'default'): number {
    const runtime = getRandomRuntime();
    if (runtime && typeof runtime.getRng === 'function') {
        return runtime.getRng(channel)();
    }
    const rng = runtime?.rng;
    return typeof rng === 'function' ? rng() : Math.random();
}

export function runtimeNow(): number {
    const now = getRandomRuntime()?.now;
    return typeof now === 'function' ? now() : Date.now();
}

export function runtimeDate(...args: RuntimeDateArgs): Date {
    if (args.length === 0) return new Date(runtimeNow());
    if (args.length === 1) return new Date(args[0]);

    const [year, monthIndex, date, hours, minutes, seconds, milliseconds] = args;
    return new Date(year, monthIndex, date, hours, minutes, seconds, milliseconds);
}

export function runtimeUuid(): string {
    const uuid = getRandomRuntime()?.uuid;
    return typeof uuid === 'function' ? uuid() : crypto.randomUUID();
}

/**
 * Relógio REAL não-mockável — exclusivo para instrumentação/telemetria.
 *
 * O runtime determinístico do orchestrator substitui `root.Date` por
 * DeterministicDate (Date.now() congelado em fixedNow derivado da seed),
 * então QUALQUER medição via Date.now()/runtimeNow() dentro de um run
 * retorna sempre 0ms. performance.now() não é mockado e é monotônico;
 * somado a timeOrigin devolve epoch real mesmo sob o mock.
 *
 * Conteúdo do modelo continua usando runtimeNow() (determinismo por seed).
 */
export function realNow(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return Math.round((performance.timeOrigin || 0) + performance.now());
    }
    return Date.now();
}
