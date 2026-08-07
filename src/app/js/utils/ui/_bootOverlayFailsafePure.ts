// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// BOOT-RESILIENCE-001#menu-inalcancavel-offline — decisao PURA do failsafe do
// splash de boot (#loading-overlay). Sem DOM, sem timers: so a regra.
//
// CONTRATO (Camada 3 da taxonomia REF-SWEEPS — degradacao sob falha):
// "dependencia caiu -> comportamento DEFINIDO". Hoje o unico dono da remocao do
// splash e _finishLoadingOverlay (src/app/js/main/random-postboot.ts), chamado
// no fim de runPostbootLifecycleSequence. Essa fase roda sob
// _withInitTimeout(15s, NAO-critico) em src/app/js/main.ts: se ela estoura, o
// erro e engolido, _finishLoadingOverlay NUNCA roda — e o `finally` de init()
// ainda executa clearTimeout(bootWatchdog), desarmando o unico failsafe de 45s.
// Resultado provado em repro: splash preso no DOM indefinidamente, com
// window.__ecbytsBootDone = false e __ecbytsInitState.completed = true.

/** Acao que o failsafe deve tomar neste tick. */
export type BootOverlayFailsafeAction = 'wait' | 'disarm' | 'force-remove';

export interface BootOverlayFailsafeInput {
    /** #loading-overlay ainda esta no DOM? */
    overlayPresent: boolean;
    /** window.__ecbytsBootDone — setado por _finishLoadingOverlay ANTES do fade. */
    bootDone: boolean;
    /** window.__ecbytsInitState.completed — o `finally` de init() ja rodou. */
    initCompleted: boolean;
    /** ms desde que o failsafe foi armado (shell de UI pronto). */
    elapsedMs: number;
    /** teto duro, espelha INIT_BOOT_WATCHDOG_MS de main.ts. */
    budgetMs: number;
}

/**
 * Decide o que fazer com o splash de boot neste tick.
 *
 * Ordem das guardas (a ordem importa e esta travada por teste):
 *  1. overlay ausente  -> 'disarm'      : nao ha o que guardar.
 *  2. bootDone         -> 'disarm'      : _finishLoadingOverlay assumiu o fade;
 *                                         NUNCA competir com o dono legitimo.
 *  3. initCompleted    -> 'force-remove': init() terminou sem passar pelo dono.
 *                                         Nao sobrou ninguem para remover o
 *                                         splash — esta preso por definicao.
 *  4. estourou budget  -> 'force-remove': teto duro para o caso de init() nunca
 *                                         retornar (promise que nunca settla).
 *  5. caso contrario   -> 'wait'.
 */
export function decideBootOverlayFailsafe(input: BootOverlayFailsafeInput): BootOverlayFailsafeAction {
    if (!input.overlayPresent) return 'disarm';
    if (input.bootDone) return 'disarm';
    if (input.initCompleted) return 'force-remove';
    if (input.elapsedMs >= input.budgetMs) return 'force-remove';
    return 'wait';
}

/**
 * Motivo legivel do force-remove — vai para o console.warn e para o `detail` do
 * evento, para que a degradacao seja OBSERVAVEL (nao silenciosa).
 */
export function describeBootOverlayFailsafeReason(input: BootOverlayFailsafeInput): string {
    if (input.initCompleted) return 'init-completed-without-postboot';
    if (input.elapsedMs >= input.budgetMs) return 'budget-exceeded';
    return 'unknown';
}
