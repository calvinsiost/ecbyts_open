// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0-only.
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SCENARIO SESSION HISTORY — pure-logic (SCENARIOS-IMPACT-001, CFG-39).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.4.10 CFG-39,
   Tema I — Usabilidade). Histórico IMUTÁVEL born-cap para UNDO da última
   mutação do cenário ativo, retido EM MEMÓRIA DA SESSÃO (NOT N7 — nunca
   Supabase). A persistência entre abas da mesma sessão é garantida pelo
   painel hospedeiro (`scenarioComparatorPanel.ts`), que mantém o estado em
   escopo de módulo; este módulo só cuida da LÓGICA do stack (push/undo/cap).

   ZERO DOM, ZERO IO, determinístico — testável isoladamente.

   Decisões:
   - Stack IMUTÁVEL: toda operação devolve um novo `SessionHistory<T>`.
     O painel nunca muta a referência anterior — útil para auditar e para
     evitar efeitos colaterais em closures de render.
   - `maxDepth` limita o tamanho (FIFO): quando atinge o teto, a entrada
     MAIS ANTIGA é descartada. Default 20 — cobre dezenas de undos sem
     crescer sem limite numa sessão longa.
   - `undo` devolve `{ history, snapshot }` ou `null` (stack vazio) —
     padrão "option" explícito, sem lançar.
   - Tipagem genérica `<T>`: o caller decide o nível de granularidade do
     snapshot (cenário ativo inteiro, lista completa, etc.). Para CFG-39 o
     painel usa `T = ScenarioParamSet` (snapshot do cenário ativo).
   - Não há `redo` (fora do escopo do CFG-39 — spec pede só "desfazer a
     última mutação"). Quando priorizado, vira CFG novo.
   ================================================================ */

/**
 * Histórico imutável de snapshots para undo (CFG-39).
 *
 * `past` guarda os estados anteriores do objeto snapshotted, do MAIS RECENTE
 * (topo, índice 0) ao MAIS ANTIGO. `maxDepth` é o teto fixo no qual o FIFO
 * descarta o mais antigo.
 */
export interface SessionHistory<T> {
    /** Pilha de snapshots anteriores (topo = mais recente). */
    readonly past: ReadonlyArray<T>;
    /** Teto máximo de entradas (FIFO). */
    readonly maxDepth: number;
}

/** Teto padrão do stack — cobre sessões longas sem crescer indefinidamente. */
export const DEFAULT_HISTORY_MAX_DEPTH = 20;

/** Teto mínimo aceito (abaixo disso é elevado a 1 — undo precisa de ≥1 slot). */
export const MIN_HISTORY_MAX_DEPTH = 1;

/**
 * Cria um histórico vazio. `maxDepth` opcional valida o teto (mínimo 1).
 */
export function emptyHistory<T>(maxDepth: number = DEFAULT_HISTORY_MAX_DEPTH): SessionHistory<T> {
    const cap = Number.isFinite(maxDepth) && maxDepth >= MIN_HISTORY_MAX_DEPTH
        ? Math.floor(maxDepth)
        : DEFAULT_HISTORY_MAX_DEPTH;
    return Object.freeze({ past: Object.freeze([]) as ReadonlyArray<T>, maxDepth: cap });
}

/**
 * Empurra um snapshot no topo do stack. Respeita `maxDepth` via FIFO:
 * ao atingir o teto, a entrada MAIS ANTIGA (final do array) é descartada.
 *
 * Não deduplica — o caller decide se um snapshot idêntico ao corrente
 * merece ser empurrado (em geral não; o painel só empurra ANTES de uma
 * mudança real). Imutável: devolve NOVO history.
 */
export function pushSnapshot<T>(history: SessionHistory<T>, snapshot: T): SessionHistory<T> {
    if (!history || !Object.isFrozen(history)) {
        // Defensive: callers sempre recebem frozen, mas se uma referência
        // externa mutável vier, criamos do zero em vez de mutar.
        history = emptyHistory<T>(history?.maxDepth);
    }
    const next: T[] = [snapshot, ...history.past];
    while (next.length > history.maxDepth) next.pop();
    return Object.freeze({
        past: Object.freeze(next) as ReadonlyArray<T>,
        maxDepth: history.maxDepth,
    });
}

/**
 * Desempilha o snapshot mais recente (topo) e devolve o NOVO history +
 * o snapshot desempilhado. Retorna `null` se o stack estiver vazio —
 * padrão option explícito (sem lançar, sem undefined ambíguo).
 *
 * @returns `{ history: SessionHistory<T>, snapshot: T }` ou `null`.
 */
export function undo<T>(
    history: SessionHistory<T>,
): { history: SessionHistory<T>; snapshot: T } | null {
    if (!history || history.past.length === 0) return null;
    const [snapshot, ...rest] = history.past;
    return {
        history: Object.freeze({
            past: Object.freeze(rest) as ReadonlyArray<T>,
            maxDepth: history.maxDepth,
        }),
        snapshot: snapshot as T,
    };
}

/** `true` se existe ao menos um snapshot para desfazer. */
export function canUndo<T>(history: SessionHistory<T>): boolean {
    return !!history && history.past.length > 0;
}

/** Número de snapshots atualmente no stack (0 = nada a desfazer). */
export function historyDepth<T>(history: SessionHistory<T>): number {
    return history ? history.past.length : 0;
}
