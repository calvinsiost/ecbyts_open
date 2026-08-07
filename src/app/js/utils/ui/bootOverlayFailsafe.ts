// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// BOOT-RESILIENCE-001#menu-inalcancavel-offline — rede de seguranca do splash
// de boot (#loading-overlay).
//
// PROBLEMA (reproduzido, nao teorico):
//   O splash so e removido por _finishLoadingOverlay (main/random-postboot.ts),
//   no fim de runPostbootLifecycleSequence. main.ts roda essa fase sob
//   _withInitTimeout(15000, NAO-critico): se um chunk lazy aguardado ali nunca
//   settla (rede degradada / gateway morto / CDN bloqueado), a fase e "skipped",
//   _finishLoadingOverlay nunca roda, e o `finally` de init() ainda executa
//   clearTimeout(bootWatchdog) — desarmando o unico teto de 45s. O splash fica
//   no DOM para sempre e window.__ecbytsBootDone nunca vira true.
//   Repro: chunk aguardado pelo postboot pendurado ->
//     "[Init] init:postboot-lifecycle skipped: ... timed out after 15000ms"
//     e apos 111s: overlay ainda no DOM, bootDone=false, initCompleted=true,
//     sem nenhuma linha de "Boot watchdog".
//
// POR QUE AQUI (utils/ui) E NAO EM main.ts:
//   BOOT-RESILIENCE-001 ja hoisteou runUiShellInitSequence (-> initPanelManager)
//   para ANTES de todas as fases com timeout, exatamente para que a UI critica
//   sobreviva quando as fases posteriores morrem. Armar o failsafe no mesmo
//   ponto herda essa garantia: se o shell subiu, o splash TEM saida.
//
// POR QUE POLLING E NAO UM setTimeout UNICO:
//   licao do proprio boot — app/js/boot/loading-gate.js usa um setTimeout(250ms)
//   de tiro unico e faz `if (!overlay) return;`. Em boot lento/offline o <div>
//   ainda nao foi parseado nesse instante (medido: entra no DOM em ~742ms) e o
//   gate desiste PARA SEMPRE. Um guarda de resiliencia nao pode ter tiro unico.

import {
    decideBootOverlayFailsafe,
    describeBootOverlayFailsafeReason,
    type BootOverlayFailsafeInput,
} from './_bootOverlayFailsafePure.js';

/** id do splash de boot (inline em app/index.html). */
export const BOOT_OVERLAY_ID = 'loading-overlay';

/** Espelha INIT_BOOT_WATCHDOG_MS de src/app/js/main.ts (teto declarado do app). */
export const BOOT_OVERLAY_FAILSAFE_BUDGET_MS = 45000;

/** Intervalo do poll — barato e desarma sozinho no caminho feliz. */
export const BOOT_OVERLAY_FAILSAFE_POLL_MS = 1000;

/** Teto do fade de saida (mesma mecanica de _finishLoadingOverlay). */
export const BOOT_OVERLAY_FADE_FALLBACK_MS = 400;

/** Evento emitido quando o failsafe precisa agir (degradacao OBSERVAVEL). */
export const BOOT_OVERLAY_FAILSAFE_EVENT = 'ecbyts:boot-overlay-failsafe';

export interface BootOverlayFailsafeDeps {
    documentRef?: any;
    windowRef?: any;
    budgetMs?: number;
    pollMs?: number;
    now?: () => number;
    setIntervalRef?: (fn: () => void, ms: number) => any;
    clearIntervalRef?: (handle: any) => void;
    setTimeoutRef?: (fn: () => void, ms: number) => any;
}

export interface BootOverlayFailsafeHandle {
    /** Executa uma verificacao AGORA (usado pelo poll e pelos testes). */
    tick: () => BootOverlayFailsafeAction;
    /** Desarma manualmente (idempotente). */
    cancel: () => void;
}

type BootOverlayFailsafeAction = ReturnType<typeof decideBootOverlayFailsafe>;

/**
 * Arma a rede de seguranca do splash de boot. Idempotente por `windowRef`.
 *
 * @returns handle para tick/cancel, ou null quando nao ha DOM (Node/testes que
 *          nao injetam stubs) ou quando ja havia um failsafe armado.
 */
export function armBootOverlayFailsafe(deps: BootOverlayFailsafeDeps = {}): BootOverlayFailsafeHandle | null {
    const documentRef = deps.documentRef ?? (typeof document !== 'undefined' ? document : null);
    const windowRef = deps.windowRef ?? (typeof window !== 'undefined' ? window : null);
    if (!documentRef || !windowRef) return null;
    if (windowRef.__ecbytsBootOverlayFailsafeArmed) return null;
    windowRef.__ecbytsBootOverlayFailsafeArmed = true;

    const budgetMs = deps.budgetMs ?? BOOT_OVERLAY_FAILSAFE_BUDGET_MS;
    const pollMs = deps.pollMs ?? BOOT_OVERLAY_FAILSAFE_POLL_MS;
    const now = deps.now ?? (() => Date.now());
    const setIntervalRef = deps.setIntervalRef ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
    const clearIntervalRef = deps.clearIntervalRef ?? ((h: any) => clearInterval(h));
    const setTimeoutRef = deps.setTimeoutRef ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));

    const startedAt = now();
    let timer: any = null;
    let stopped = false;

    const cancel = () => {
        if (stopped) return;
        stopped = true;
        if (timer !== null) {
            clearIntervalRef(timer);
            timer = null;
        }
        windowRef.__ecbytsBootOverlayFailsafeArmed = false;
    };

    const tick = (): BootOverlayFailsafeAction => {
        if (stopped) return 'disarm';
        const overlay = documentRef.getElementById(BOOT_OVERLAY_ID);
        const input: BootOverlayFailsafeInput = {
            overlayPresent: !!overlay,
            bootDone: !!windowRef.__ecbytsBootDone,
            initCompleted: !!windowRef.__ecbytsInitState?.completed,
            elapsedMs: now() - startedAt,
            budgetMs,
        };
        const action = decideBootOverlayFailsafe(input);
        if (action === 'wait') return action;
        cancel();
        if (action === 'force-remove' && overlay) {
            _forceRemove({ overlay, windowRef, setTimeoutRef, input });
        }
        return action;
    };

    timer = setIntervalRef(tick, pollMs);
    return { tick, cancel };
}

/**
 * Derruba o splash preso. Mantem o contrato RF-E1 (saida por fade, nunca corte),
 * mas libera o clique IMEDIATAMENTE (pointer-events:none antes do fade) para que
 * a UI abaixo — ribbon, chip "Menu", menu "Mais" — volte a ser alcancavel ja no
 * primeiro frame, sem esperar a transicao.
 */
function _forceRemove({ overlay, windowRef, setTimeoutRef, input }: any): void {
    try {
        overlay.style.pointerEvents = 'none';
    } catch (e: any) {
        console.debug('[bootOverlayFailsafe] pointerEvents:', e?.message || e);
    }
    // Estado terminal coerente: loading-gate.js e qualquer outro consumidor de
    // __ecbytsBootDone precisam ver "boot acabou" — senao o gate pode reexibir.
    windowRef.__ecbytsBootDone = true;

    const reason = describeBootOverlayFailsafeReason(input);
    console.warn(
        `[bootOverlayFailsafe] #${BOOT_OVERLAY_ID} preso apos ${input.elapsedMs}ms ` +
            `(reason=${reason}) — removendo. Alguma fase de boot morreu sem chamar ` +
            '_finishLoadingOverlay (main/random-postboot.ts).',
    );

    let removed = false;
    const remove = () => {
        if (removed) return;
        removed = true;
        try {
            overlay.remove();
        } catch (e: any) {
            console.debug('[bootOverlayFailsafe] remove:', e?.message || e);
        }
    };
    try {
        overlay.addEventListener('transitionend', remove, { once: true });
        overlay.classList.add('fade-out');
    } catch (e: any) {
        console.debug('[bootOverlayFailsafe] fade:', e?.message || e);
    }
    setTimeoutRef(remove, BOOT_OVERLAY_FADE_FALLBACK_MS);

    try {
        windowRef.dispatchEvent(
            new CustomEvent(BOOT_OVERLAY_FAILSAFE_EVENT, {
                detail: { elapsedMs: input.elapsedMs, budgetMs: input.budgetMs, reason },
            }),
        );
    } catch (e: any) {
        console.debug('[bootOverlayFailsafe] dispatch:', e?.message || e);
    }
}
