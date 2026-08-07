// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SCENARIO PROPAGATION — pure-logic (SCENARIOS-IMPACT-001, F3).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.1 F3,
   §4.2). `propagateScenarioImpact(base, alternativo)` ORQUESTRA os
   recálculos sobre os cenários-clone do F1/F2: extrai o processo
   produtivo de cada modelo clonado (reusando
   `buildProcessFromElement`/`hasUsableRealData` de
   `_realProcessLoaderPure.ts`) e dispara o motor de métricas reais
   (`computeRealScenarioMetrics` de `_scenarioImpactEnginePure.ts` —
   que por sua vez orquestra o pipeline de custo ERP, o ECBT Score e
   os ODS). **Nenhum motor é reimplementado aqui** (NOT N4): este
   módulo só faz a ponte Scenario(modelo clonado) → processo → motor
   existente.

   ZERO DOM, ZERO IO, determinístico. Não lê o modelo vivo global —
   opera exclusivamente sobre o snapshot clonado (é o que permite
   comparar "e se?" sem tocar o modelo do usuário).

   N3 (honestidade de dado): cenário sem `production_area` com dados
   utilizáveis → impacto com dimensões `null` + `semDado: true`
   (NUNCA zero forjado).
   ================================================================ */

import { buildProcessFromElement, hasUsableRealData } from './_realProcessLoaderPure.js';
import { computeRealScenarioMetrics } from './_scenarioImpactEnginePure.js';
import type { OdsImpacto4D, ScenarioEngineOptions } from './_scenarioImpactEnginePure.js';
import type { ModelState, Scenario } from './_scenarioClonePure.js';

/**
 * Impacto propagado de UM cenário: as 4 dimensões reais + proveniência.
 * Espelha o `RealScenarioMetrics` do motor, rotulado com o cenário.
 */
export interface ScenarioImpact {
    /** Id do cenário de origem (rastreabilidade). */
    readonly scenarioId: string;
    /** CAPEX total (R$) — `null` = sem dado (N3). */
    readonly capex: number | null;
    /** OPEX total (R$/ano) — `null` = sem dado. */
    readonly opex: number | null;
    /** ECBT Score líquido (R$) — `null` = sem dado. */
    readonly ecbt: number | null;
    /** ODS afetados por indicador oficial citável. */
    readonly ods: readonly OdsImpacto4D[];
    /**
     * Valores das dimensões REGISTRADAS por dado (CFG-26): id → valor, com
     * `null` = sem dado (N3). Ausente quando nenhuma dimensão extra foi
     * curada — as 4 canônicas continuam nos campos acima.
     */
    readonly extras?: Readonly<Record<string, number | null>>;
    /** true quando QUALQUER dimensão ficou sem dado (N3). */
    readonly semDado: boolean;
}

/** Par base × alternativo de impactos (entrada do F7/comparador). */
export interface ScenarioPropagationResult {
    readonly base: ScenarioImpact;
    readonly alternativo: ScenarioImpact;
}

/**
 * Fatia de custo por elemento NO MESMO FORMATO do `byElement[id]` de
 * `buildCostRollup()` ({capex, opex}), computada sobre os elementos do
 * SNAPSHOT CLONADO. O rollup canônico (`core/analytics/economics/costRollup.ts`)
 * lê o modelo vivo global (`getAllElements()`) e por isso não pode ser
 * chamado aqui — a agregação L2 (soma de capexTotal/opexTotal por entrada
 * de `data.costs`) é replicada 1:1 sobre o clone. É a ÚNICA aritmética
 * local deste módulo; todo o resto delega aos motores existentes.
 */
function costSliceFromClonedElement(element: any): { capex: number; opex: number } {
    let capex = 0;
    let opex = 0;
    const costs = element?.data?.costs;
    if (Array.isArray(costs)) {
        for (const entry of costs) {
            capex += entry?.capexTotal || 0;
            opex += entry?.opexTotal || 0;
        }
    }
    return { capex, opex };
}

/**
 * Extrai o processo produtivo de um modelo clonado: primeiro elemento
 * `production_area` com dados utilizáveis (subtipo válido + custo real),
 * convertido pelo loader canônico (zero duplicação). `null` quando não há.
 */
function extractProcessFromScenarioModel(model: ModelState): ReturnType<typeof buildProcessFromElement> | null {
    const elements = Array.isArray(model?.elements) ? (model.elements as any[]) : [];
    for (const el of elements) {
        if (el?.family !== 'production_area' && el?.familyId !== 'production_area') continue;
        const slice = costSliceFromClonedElement(el);
        if (!hasUsableRealData(el, slice)) continue;
        return buildProcessFromElement(el, slice);
    }
    return null;
}

/** Impacto "sem dado" (N3) para cenário sem processo utilizável. */
function emptyImpact(scenarioId: string): ScenarioImpact {
    return Object.freeze({
        scenarioId,
        capex: null,
        opex: null,
        ecbt: null,
        ods: Object.freeze([]) as readonly OdsImpacto4D[],
        semDado: true,
    });
}

/**
 * Propaga o impacto (F3): orquestra os recálculos do par base × alternativo
 * sobre os modelos clonados, SEM mutar nenhum dos cenários de entrada.
 *
 * @param base         cenário-base (produto de cloneModelToScenario).
 * @param alternativo  cenário alternativo (produto de mutateProcess/clone).
 * @param options      opções do motor (activity driver, ECBT κ/mode curado
 *                     CFG-24, limiares ODS curados CFG-32) — repassadas
 *                     íntegras a `computeRealScenarioMetrics`.
 * @returns par de impactos congelado; cenário sem dado → dimensões null (N3).
 */
export function propagateScenarioImpact(
    base: Scenario,
    alternativo: Scenario,
    options: ScenarioEngineOptions & { activity?: { value?: number } } = {},
): ScenarioPropagationResult {
    if (!base?.model || !alternativo?.model) {
        throw new Error('propagateScenarioImpact: base e alternativo (Scenarios do F1) são obrigatórios');
    }
    const { activity, ...engineOptions } = options;
    const compute = (scenario: Scenario): ScenarioImpact => {
        const process = extractProcessFromScenarioModel(scenario.model);
        if (!process) return emptyImpact(scenario.id);
        const metrics = computeRealScenarioMetrics(process, {}, activity ?? {}, engineOptions);
        return Object.freeze({
            scenarioId: scenario.id,
            capex: metrics.capex,
            opex: metrics.opex,
            ecbt: metrics.ecbt,
            ods: metrics.ods,
            semDado: metrics.anySemDado,
        });
    };
    return Object.freeze({ base: compute(base), alternativo: compute(alternativo) });
}
