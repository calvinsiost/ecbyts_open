// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   DATA-HANDLER GLOBAL DELEGATION — CSP hardening (SEC, item 2)
   ================================================================
   SEC-PENTEST-001 §17.1 / auditoria 2026-06-09 item ALTA.

   Substitui os handlers inline `onclick="window.handleX()"` (que forçam
   `script-src 'unsafe-inline'` na CSP) por `data-handler="handleX"` + UMA
   delegação global. Cada `onclick` inline eliminado é um passo rumo a remover
   o `'unsafe-inline'` (gate tests/inline-event-handlers-ratchet.test.mjs).

   Convenção reutilizada de utils/ui/launchpad/hero.ts (data-handler → chama
   window[handler]()). Esta versão é GLOBAL e capture-phase:
   - capture-phase: roda antes de qualquer stopPropagation (robusto).
   - pula [data-kpi-id]: os KPI cards do hero têm seu próprio listener
     (_onKpiClick), então NÃO devem ser tratados aqui (evita duplo-disparo).

   Comentário em português: delegação única e segura — clicar em qualquer
   elemento com data-handler (fora dos KPI cards do hero) chama a função de
   mesmo nome registrada em window.
   ================================================================ */

import { ensureDeferredStylesApplied } from './deferred-styles.js';

console.debug('[mod:load]', 'app/js/main/dataHandlerDelegation.js');

let _installed = false;

/**
 * Instala a delegação global de data-handler. Idempotente.
 */
export function installDataHandlerDelegation(): void {
    if (_installed) return;
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    _installed = true;

    document.addEventListener(
        'click',
        (e: Event) => {
            const target = e.target as Element | null;
            if (!target || typeof target.closest !== 'function') return;
            const el = target.closest('[data-handler]') as HTMLElement | null;
            if (!el) return;
            // KPI cards do hero têm seu próprio listener — não duplicar.
            if (el.closest('[data-kpi-id]')) return;
            const name = el.dataset.handler;
            if (!name) return;
            const fn = (window as any)[name];
            if (typeof fn !== 'function') return;
            const run = () => {
                try {
                    fn();
                } catch (err: any) {
                    console.warn('[data-handler] erro em', name, err?.message || err);
                }
            };
            // BUG-DEFERRED-CSS-PANEL-3G: este é o caminho GENÉRICO de abertura de
            // painel (~317 botões). Em rede lenta o CSS do painel ainda está na
            // rede quando o clique chega — MEDIDO: interpolation.css leva 4645 ms
            // em Fast 3G depois do 1º gesto. Sem esta espera o painel pinta cru
            // (position:static, bloco fora da tela) — o defeito que o Calvin viu.
            // Custo zero no caso comum: ensureDeferredStylesApplied devolve null
            // quando não há folha pendente e o handler roda no MESMO tick.
            const wait = ensureDeferredStylesApplied();
            if (wait === null) run();
            else void wait.then(run);
        },
        true, // capture
    );
}

// Auto-instala no IMPORT do módulo (efeito top-level): a delegação é crítica para
// os ~317 botões data-handler e NÃO pode depender do boot completar (em ambientes
// degradados o boot pode falhar antes de setupGlobalEventListeners). Idempotente.
installDataHandlerDelegation();
