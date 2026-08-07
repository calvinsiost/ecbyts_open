// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic debounce — sem DOM, sem timers globais.
//
// Por que canonico: 12+ paineis ecbyts reinventam setTimeout+clear pattern
// (cost-rollup, datastudio, filter-panel, etc). Helper deduplica + facilita
// testes pure-logic injetando clock customizado.
//
// SPEC: CETESB-RISK-001 Sub-4.1.3 (resultados live com debounce 250ms)
//       + UI_REUSE_PLAYBOOK_2026_05_22 (P2 baixo risco — pure-logic dedup)
//
// API:
//   createDebouncer(fn, delayMs, scheduler?) → { trigger, cancel, pending }
//
// scheduler default usa setTimeout/clearTimeout do globalThis; tests passam
// scheduler fake para verificar comportamento sem real-clock waits.

export interface DebounceScheduler {
    setTimeout(cb: () => void, delayMs: number): number;
    clearTimeout(handle: number): void;
}

export interface DebouncedHandle {
    /** Dispara a funcao apos `delayMs` ms; chamadas adicionais cancelam o pendente e re-agendam. */
    trigger(): void;
    /** Cancela qualquer disparo pendente; idempotente. */
    cancel(): void;
    /** True se ha disparo pendente nao cancelado. */
    pending(): boolean;
}

const DEFAULT_SCHEDULER: DebounceScheduler = {
    setTimeout: (cb, delayMs) => globalThis.setTimeout(cb, delayMs) as unknown as number,
    clearTimeout: (h) => globalThis.clearTimeout(h as unknown as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * Cria um debouncer reutilizavel.
 *
 * @param fn Funcao a executar apos delayMs de inatividade
 * @param delayMs Delay em ms (default 250 — UX padrao painel live)
 * @param scheduler Scheduler customizado (default usa setTimeout do globalThis)
 */
export function createDebouncer(
    fn: () => void,
    delayMs: number = 250,
    scheduler: DebounceScheduler = DEFAULT_SCHEDULER,
): DebouncedHandle {
    if (typeof fn !== 'function') {
        throw new TypeError('createDebouncer: fn must be a function');
    }
    if (!Number.isFinite(delayMs) || delayMs < 0) {
        throw new RangeError('createDebouncer: delayMs must be non-negative finite');
    }

    let handle: number | null = null;

    const cancel = (): void => {
        if (handle !== null) {
            scheduler.clearTimeout(handle);
            handle = null;
        }
    };

    const trigger = (): void => {
        cancel();
        handle = scheduler.setTimeout(() => {
            handle = null;
            try {
                fn();
            } catch (e) {
                // Pure-logic: log + swallow (UI exception nao deve quebrar debouncer state)
                console.error('[debouncer] fn threw:', (e as Error)?.message || e);
            }
        }, delayMs);
    };

    const pending = (): boolean => handle !== null;

    return Object.freeze({ trigger, cancel, pending });
}
