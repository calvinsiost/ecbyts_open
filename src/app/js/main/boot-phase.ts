// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// T10.1 (SPEC_TRAINING_LMS_OPEN_POINTS): markPhase era uma closure LOCAL de
// boot-preflight.ts cuja última marca era 'preflight:done' — nada depois do
// preflight marcava fase, por isso o watchdog de main.ts sempre reportava
// STUCK AT phase="preflight:done" independente de onde o boot realmente
// travasse. Este helper compartilhado escreve no MESMO contrato que o
// watchdog (main.ts ~562-586) já consome — window.__ecbytsBootPhase +
// window.__ecbytsBootPhaseLog — para que boot-preflight.ts E main.ts possam
// marcar fases granulares pós-preflight sem duplicar a lógica.
export function markBootPhase(windowRef: any, phase: any) {
    try {
        windowRef.__ecbytsBootPhase = phase;
        (windowRef.__ecbytsBootPhaseLog = windowRef.__ecbytsBootPhaseLog || []).push({
            phase,
            t: Math.round(windowRef.performance?.now?.() ?? Date.now()),
        });
    }
    catch (err: any) {
        console.debug('[boot-phase] markPhase skipped:', /** @type {any} */ (err)?.message || err);
    }
}
