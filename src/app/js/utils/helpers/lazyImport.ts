// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under AGPL-3.0-only
/* ================================================================
   LAZY IMPORT CANONICO — SPEC_REFERENCE_RESILIENCE_SWEEPS RF-2
   ================================================================

   Wrapper canonico para import() dinamico. Motivacao: rodada de bugs
   2026-07-17 — com o server local morto, import() sem catch vira
   `Uncaught (in promise)` + spam de erro (reportList, systemCatalogModal).

   Contrato (fail-soft):
   - NUNCA rejeita: retorna o modulo ou `null` (caller decide o fallback).
   - UM toast por dependencia caida por sessao (dedupe por origem —
     falhas de rede colapsam em "servidor local fora"). N imports falhos
     = 1 toast, nao N.
   - Toast nao se PERDE: `showToast` devolve null (sem lancar) quando o
     container ainda nao existe — boot muito cedo. Nesse caso o aviso fica
     PENDENTE (no maximo um) e sai na proxima oportunidade, em vez de
     queimar o slot de dedupe e o usuario nunca ver nada.
   - Retry: quando a conectividade volta, re-tenta os imports de rede que
     falharam e avisa os interessados via callback `onRetry`. Gatilhos:
       * evento `online` do browser (a maquina reconectou),
       * evento `ecbyts:server-reconnected` — o SERVIDOR LOCAL voltou
         (ws da bridge reabriu / heartbeat /api/health voltou a passar).
         Este e o gatilho que importa no caso `localhost`: o browser
         NUNCA fica "offline" quando so o server local morre, entao o
         evento `online` sozinho nao cobre o cenario da rodada.
       * chamada explicita a `retryFailedImports()`.

   Logica de decisao PURA (classificacao/dedupe) em _lazyImportPure.ts.

   USO:
     const m = await lazyImport('../report/reportList.js');
     if (m) m.openReportList();

     // com retry automatico quando o server voltar:
     const m = await lazyImport('../report/reportList.js', {
       importer: () => import('../report/reportList.js'),
       onRetry: (mod) => mod.openReportList(),
     });

   NOTA sobre bundlers: import(path) com string dinamica nao e analisavel
   estaticamente. Para builds com code-splitting, passe `opts.importer`
   com o import() literal — o wrapper usa ele e o path vira so rotulo.
   ================================================================ */

import { showToast } from '../ui/toast.js';
import {
    classifyImportError,
    dedupeKeyFor,
    toastPayloadFor,
    createDedupeTracker,
    SERVER_RECONNECTED_EVENT,
} from './_lazyImportPure.js';

export { SERVER_RECONNECTED_EVENT };

/**
 * @typedef {Object} LazyImportOptions
 * @property {() => Promise<any>} [importer] - import() literal (preferido p/ bundlers)
 * @property {(mod: any) => void} [onRetry] - chamado se um retry posterior tiver sucesso
 * @property {boolean} [silent] - suprime o toast (so console.debug)
 */

const _tracker = createDedupeTracker();

/** Imports de REDE que falharam e aguardam reconexao. */
const _failed = new Map<string, { importer: () => Promise<any>, onRetry?: (mod: any) => void }>();

let _listenersBound = false;
/** Quantos toasts a dedupe DEIXOU passar (nao quantas falhas houve). */
let _notified = 0;
/** Quantos desses realmente renderizaram (sink confirmou). */
let _emitted = 0;
/** Aviso que a dedupe liberou mas o sink nao conseguiu mostrar (no maximo UM). */
let _pendingToast: { message: string, type: 'warning' | 'error' } | null = null;

/**
 * Entrega o toast ao sink canonico. Retorna `true` so quando ele CONFIRMA
 * que renderizou.
 *
 * `showToast` tem dois modos de "nao mostrou": lanca (modulo indisponivel,
 * boot muito cedo) ou devolve `null` (container #toast-container ainda nao
 * existe no DOM). Os dois contam como nao-emitido — e por isso que o slot
 * de dedupe nao pode ser consumido pelo simples fato de termos CHAMADO.
 */
function _deliverToast(message: string, type: 'warning' | 'error'): boolean {
    try {
        return showToast(message, type) != null;
    } catch (toastErr) {
        console.debug('[lazyImport] toast indisponivel', (toastErr as any)?.message || toastErr);
        return false;
    }
}

/**
 * Tenta escoar o aviso pendente (o que a dedupe liberou mas o sink nao
 * conseguiu mostrar). Idempotente e barato: no-op quando nao ha pendencia.
 *
 * @returns {boolean} true se o aviso pendente foi finalmente mostrado
 */
export function flushPendingImportToast(): boolean {
    if (!_pendingToast) return false;
    const { message, type } = _pendingToast;
    if (!_deliverToast(message, type)) return false;
    _pendingToast = null;
    _emitted++;
    return true;
}

/**
 * Estado observavel da degradacao (diagnostico + testes). Somente leitura.
 *
 * @returns {{ notified: number, emitted: number, pending: number, pendingToast: ({message:string,type:string}|null), seen: string[] }}
 *   notified — toasts que a dedupe autorizou (o "1" de "1 toast so")
 *   emitted  — quantos desses o sink confirmou ter renderizado
 *   pending  — imports de rede na fila aguardando reconexao
 */
export function getLazyImportState(): { notified: number, emitted: number, pending: number, pendingToast: { message: string, type: string } | null, seen: string[] } {
    return {
        notified: _notified,
        emitted: _emitted,
        pending: _failed.size,
        pendingToast: _pendingToast ? { ..._pendingToast } : null,
        seen: _tracker.seen(),
    };
}

/**
 * Importa um modulo dinamicamente com degradacao suave.
 *
 * @param {string} path - caminho do modulo (relativo a ESTE arquivo se `importer` ausente)
 * @param {LazyImportOptions} [opts]
 * @returns {Promise<any|null>} modulo, ou null em falha (caller decide)
 */
export async function lazyImport(path: string, opts: { importer?: () => Promise<any>, onRetry?: (mod: any) => void, silent?: boolean } = {}): Promise<any | null> {
    const importer = opts.importer || (() => import(path as string));
    try {
        return await importer();
    } catch (err) {
        const kind = classifyImportError(err);
        const key = dedupeKeyFor(path, kind);
        console.debug('[lazyImport]', kind, path, (err as any)?.message || err);
        if (!opts.silent) {
            // Uma falha nova nao pode reabrir o slot de dedupe, mas E uma boa
            // hora para escoar um aviso anterior que ficou preso (o DOM pode
            // ter subido nesse meio tempo).
            flushPendingImportToast();
            if (_tracker.shouldNotify(key)) {
                const { message, type } = toastPayloadFor(kind, path);
                _notified++;
                if (_deliverToast(message, type)) {
                    _emitted++;
                } else if (!_pendingToast) {
                    // Segura UM aviso — o proximo flush o mostra. Nao vira fila:
                    // o ponto do dedupe e nao empilhar avisos da mesma origem.
                    _pendingToast = { message, type };
                }
            }
        }
        if (kind === 'network') {
            // exactOptionalPropertyTypes: onRetry ausente != onRetry undefined.
            const entry: { importer: () => Promise<any>, onRetry?: (mod: any) => void } = { importer };
            if (typeof opts.onRetry === 'function') entry.onRetry = opts.onRetry;
            _failed.set(path, entry);
            _bindReconnectListeners();
        }
        return null;
    }
}

/** Retry em andamento — os dois gatilhos podem disparar juntos. */
let _retryInFlight: Promise<number> | null = null;

/**
 * Re-tenta todos os imports de rede que falharam nesta sessao.
 * Chamado automaticamente nos eventos `online` e `ecbyts:server-reconnected`;
 * exposto para qualquer outro detector de reconexao invocar diretamente.
 *
 * Reentrante-safe: os dois gatilhos frequentemente chegam juntos (a maquina
 * reconecta E o server volta). Sem esse guard, duas passadas concorrentes
 * chamariam `onRetry` duas vezes para o mesmo modulo — e onRetry tem efeito
 * visivel (reabrir modal/lista). Chamadas simultaneas compartilham a passada
 * em voo; uma chamada NOVA depois dela roda normalmente.
 *
 * @returns {Promise<number>} quantos retries tiveram sucesso
 */
export function retryFailedImports(): Promise<number> {
    if (_retryInFlight) return _retryInFlight;
    const run = _retryFailedImportsOnce().finally(() => {
        _retryInFlight = null;
    });
    _retryInFlight = run;
    return run;
}

async function _retryFailedImportsOnce(): Promise<number> {
    if (_failed.size === 0) return 0;
    const entries = [..._failed.entries()];
    let ok = 0;
    for (const [path, { importer, onRetry }] of entries) {
        try {
            const mod = await importer();
            _failed.delete(path);
            ok++;
            try { onRetry?.(mod); } catch (e) {
                console.debug('[lazyImport] onRetry falhou', path, (e as any)?.message || e);
            }
        } catch (retryErr) {
            // Ainda fora — mantem na fila p/ proxima reconexao
            console.debug('[lazyImport] retry ainda falhando', path, (retryErr as any)?.message || retryErr);
        }
    }
    if (ok > 0) {
        // Nova "sessao" logica de conectividade: se cair de novo, avisa de novo.
        _tracker.reset();
        // O aviso "servidor local indisponivel" virou mentira — descarta em vez
        // de mostrar um alerta obsoleto no proximo flush.
        _pendingToast = null;
    }
    return ok;
}

/**
 * Liga o retry automatico (uma vez por sessao) nos dois gatilhos de
 * reconexao: `online` (maquina) e `ecbyts:server-reconnected` (servidor
 * local — ws da bridge / heartbeat). Este segundo e o que cobre o caso
 * real: com o server de :4000 morto o browser continua "online".
 */
function _bindReconnectListeners() {
    if (_listenersBound || typeof window === 'undefined') return;
    _listenersBound = true;
    const onReconnect = () => {
        retryFailedImports().catch((e) => console.debug('[lazyImport] retry', (e as any)?.message || e));
    };
    window.addEventListener('online', onReconnect);
    window.addEventListener(SERVER_RECONNECTED_EVENT, onReconnect);
}
