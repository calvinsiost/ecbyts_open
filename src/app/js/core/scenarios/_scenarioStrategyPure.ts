// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO STRATEGY — pure-logic (CFG-08, TEMA C).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-08 — "Aplicar um ARRAY de mutações por cenário (não 1 só).
       A interface ProcessMutation hoje é uma só. Passa a aceitar LISTA de
       mutações por cenário (uma 'estratégia' = N alterações combinadas).
       Testável: cenário com [mut1, mut2] aplica ambas e o delta reflete as
       duas."
     - §2.4.11 (nota de rastreabilidade) — CFG-08 = pergunta com N alavancas,
       caso particular do motor de pergunta (não um motor novo).

   O QUE FALTAVA: `applyProcessMutation` (de `_scenarioImpactEnginePure.ts`)
   aplica UMA `ProcessMutation` por vez; e o comparador multi-cenário
   (`_multiScenarioVMPure.ts`) trata cada mutação como uma COLUNA/cenário
   SEPARADO. Não existia a peça que COMPÕE N mutações num ÚNICO cenário — a
   "estratégia" (ex.: trocar subtipo + baixar recoveryRate + reduzir CAPEX de
   uma rota, tudo junto num só cenário).

   COMO COMPÕE (semântica): as N mutações são MESCLADAS numa única
   `ProcessMutation` combinada — last-wins para os escalares
   (subtype/throughput/recoveryRate/yield) e route-overrides CONCATENADOS na
   ordem (o override posterior de uma mesma rota vence, coerente com o
   `applyRouteOverrides` do motor: "last override per id wins") — e só então
   aplicada UMA vez pelo motor. Isso é intencional: valida-se o ESTADO FINAL
   composto (CFG-40, yield ≤ recoveryRate), não estados intermediários que
   poderiam ser transitoriamente impossíveis (ex.: baixar recoveryRate antes
   de baixar o yield). Reduz também custo (uma passada do motor).

   Zero duplicação (N4): NÃO reimplementa a aplicação de mutação nem nenhuma
   fórmula — delega a `applyProcessMutationWithDiagnostics` /
   `computeRealScenarioMetrics` do motor existente. Esta camada só MESCLA a
   lista numa mutação e repassa.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

import {
    applyProcessMutationWithDiagnostics,
    computeRealScenarioMetrics,
    type BaseProcess,
    type ProcessMutation,
    type RouteOverride,
    type AlphaRenormalization,
    type RealScenarioMetrics,
    type ScenarioActivity,
    type ScenarioEngineOptions,
} from './_scenarioImpactEnginePure.js';

// ───────────────────────────── Merge ─────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Narrowa (sem cast direto) um valor bruto para `RouteOverride`: valida
 * `routeId` (obrigatório) e inclui os campos numéricos opcionais só quando
 * presentes e do tipo certo. `null` quando o valor não é um override válido.
 */
function toRouteOverride(ov: unknown): RouteOverride | null {
    if (!isPlainObject(ov) || typeof ov.routeId !== 'string') return null;
    const out: {
        routeId: string;
        alpha?: number;
        capexUnit?: number;
        opexUnit?: number;
        throughputShare?: number;
    } = { routeId: ov.routeId };
    if (typeof ov.alpha === 'number') out.alpha = ov.alpha;
    if (typeof ov.capexUnit === 'number') out.capexUnit = ov.capexUnit;
    if (typeof ov.opexUnit === 'number') out.opexUnit = ov.opexUnit;
    if (typeof ov.throughputShare === 'number') out.throughputShare = ov.throughputShare;
    return Object.freeze(out);
}

/**
 * Mescla um ARRAY de mutações numa ÚNICA `ProcessMutation` combinada (CFG-08).
 *
 * Regra de composição (determinística, ordem de entrada):
 *  - Escalares (`subtype`, `throughput`, `recoveryRate`, `yield`): LAST-WINS —
 *    a última mutação da lista que declara o campo prevalece. Campos ausentes
 *    numa mutação NÃO apagam o valor já acumulado (N8: sem folha em branco).
 *  - `routeOverrides`: CONCATENADOS preservando a ordem. O motor
 *    (`applyRouteOverrides`) já resolve "last override per routeId wins", então
 *    concatenar preserva exatamente a semântica de override composta.
 *
 * Entradas não-objeto na lista são ignoradas (robustez). Lista vazia ⇒ `{}`
 * (a mutação-identidade: o cenário resultante é a própria base).
 *
 * @param mutations - As N mutações da estratégia (na ordem de aplicação).
 * @returns Uma `ProcessMutation` congelada que representa a estratégia inteira.
 */
export function mergeProcessMutations(
    mutations: ReadonlyArray<ProcessMutation> = [],
): ProcessMutation {
    const list = Array.isArray(mutations) ? mutations : [];
    const merged: {
        subtype?: string;
        throughput?: number;
        recoveryRate?: number;
        yield?: number;
        routeOverrides: RouteOverride[];
    } = { routeOverrides: [] };

    for (const m of list) {
        if (!isPlainObject(m)) continue;
        if (typeof m.subtype === 'string') merged.subtype = m.subtype;
        if (typeof m.throughput === 'number') merged.throughput = m.throughput;
        if (typeof m.recoveryRate === 'number') merged.recoveryRate = m.recoveryRate;
        if (typeof m.yield === 'number') merged.yield = m.yield;
        if (Array.isArray(m.routeOverrides)) {
            for (const ov of m.routeOverrides) {
                const parsed = toRouteOverride(ov);
                if (parsed) merged.routeOverrides.push(parsed);
            }
        }
    }

    // Monta a ProcessMutation final só com os campos efetivamente declarados
    // (não injeta undefined/0 espúrios — N8).
    const out: {
        subtype?: string;
        throughput?: number;
        recoveryRate?: number;
        yield?: number;
        routeOverrides?: ReadonlyArray<RouteOverride>;
    } = {};
    if (merged.subtype !== undefined) out.subtype = merged.subtype;
    if (merged.throughput !== undefined) out.throughput = merged.throughput;
    if (merged.recoveryRate !== undefined) out.recoveryRate = merged.recoveryRate;
    if (merged.yield !== undefined) out.yield = merged.yield;
    if (merged.routeOverrides.length > 0) {
        out.routeOverrides = Object.freeze(merged.routeOverrides) as ReadonlyArray<RouteOverride>;
    }
    return Object.freeze(out) as ProcessMutation;
}

// ───────────────────────────── Apply ─────────────────────────────

/**
 * Aplica um ARRAY de mutações (uma ESTRATÉGIA) a UM processo-base e devolve o
 * processo resultante + o diagnóstico de renormalização de α (CFG-08).
 *
 * As N mutações são mescladas ({@link mergeProcessMutations}) numa única
 * mutação combinada e aplicadas UMA vez pelo motor existente
 * (`applyProcessMutationWithDiagnostics`) — a base nunca é mutada (isolamento
 * F1), a validação cruzada (CFG-40) roda sobre o ESTADO FINAL composto, e
 * nenhuma fórmula é reimplementada aqui (N4).
 *
 * @param base - Snapshot do processo-base (nunca mutado).
 * @param mutations - As N mutações combinadas da estratégia.
 * @returns `{ process, alpha }` — processo congelado + diagnóstico de α.
 * @throws quando o estado final composto viola uma regra cruzada (CFG-40).
 */
export function applyProcessMutationsWithDiagnostics(
    base: BaseProcess,
    mutations: ReadonlyArray<ProcessMutation> = [],
): { readonly process: BaseProcess; readonly alpha: AlphaRenormalization } {
    const combined = mergeProcessMutations(mutations);
    return applyProcessMutationWithDiagnostics(base, combined);
}

/**
 * Aplica um ARRAY de mutações a UM processo-base e devolve o processo
 * resultante (CFG-08). Conveniência sobre
 * {@link applyProcessMutationsWithDiagnostics} quando o diagnóstico de α não é
 * necessário.
 *
 * @param base - Snapshot do processo-base (nunca mutado).
 * @param mutations - As N mutações combinadas da estratégia.
 * @returns O processo congelado com a estratégia inteira aplicada.
 */
export function applyProcessMutations(
    base: BaseProcess,
    mutations: ReadonlyArray<ProcessMutation> = [],
): BaseProcess {
    return applyProcessMutationsWithDiagnostics(base, mutations).process;
}

/**
 * Calcula as 4 dimensões reais (CAPEX/OPEX/ECBT/ODS) de UMA estratégia = N
 * mutações combinadas sobre um cenário (CFG-08). Mescla as mutações e reusa o
 * motor real (`computeRealScenarioMetrics`) — o delta vs. base reflete TODAS
 * as mutações da estratégia, não só a última.
 *
 * @param base - Snapshot do processo-base (nunca mutado).
 * @param mutations - As N mutações combinadas da estratégia.
 * @param activity - Driver de atividade A(t) opcional (default = throughput).
 * @param options - Opções do motor (ECBT κ/mode curado CFG-24; limiares ODS
 *   curados CFG-32) — repassadas íntegras.
 * @returns Métricas reais congeladas da estratégia (dimensões sem dado = null).
 */
export function computeStrategyMetrics(
    base: BaseProcess,
    mutations: ReadonlyArray<ProcessMutation> = [],
    activity: ScenarioActivity = {},
    options: ScenarioEngineOptions = {},
): RealScenarioMetrics {
    const combined = mergeProcessMutations(mutations);
    return computeRealScenarioMetrics(base, combined, activity, options);
}
