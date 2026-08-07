// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SCENARIO MUTATION — pure-logic (SCENARIOS-IMPACT-001, F2).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.1 F2,
   §4.2 assinaturas). Aplica UMA mutação de processo produtivo a um
   elemento `production_area` DENTRO do cenário (clone imutável do F1)
   e devolve um NOVO cenário — o cenário de origem nunca é alterado
   (ele está congelado; a mutação produz outro clone congelado com
   `baseScenarioId` apontando para o cenário de origem).

   ZERO DOM, ZERO IO, determinístico.

   Validação com ZERO duplicação (exigência da spec): subtipo e
   categoria são validados contra o catálogo canônico
   (`isValidSubtype()` / `getCategoriesForSubtype()` de
   `core/elements/families/production/subtypes.ts`) — este módulo não
   reconhece nenhum subtipo/categoria por conta própria.

   Faixas validadas (guard-rail §2.4.0, sem folha em branco — N8):
   - `throughput`: número finito > 0 (taxa de produção);
   - `recoveryRate` / `yield`: frações — número finito em [0, 1]
     (>1 seria fisicamente impossível para uma fração de recuperação/
     rendimento; a validação cruzada yield ≤ recoveryRate é CFG-40,
     item separado da fila).
   ================================================================ */

import { isValidSubtype, getCategoriesForSubtype } from '../elements/families/production/subtypes.js';
import { cloneModelToScenario } from './_scenarioClonePure.js';
// CFG-40 (spec §2.4) — validação cruzada física das taxas resultantes.
import { assertRatesCrossRules } from './_scenarioCrossValidationPure.js';
import type { ModelState, Scenario } from './_scenarioClonePure.js';

/**
 * Uma mutação de processo sobre um elemento do cenário (spec §4.2).
 */
export interface ScenarioProcessMutation {
    /** Id do elemento `production_area` a mutar. */
    readonly elementId: string;
    /** Tipo da mutação: troca de subtipo, de categoria/etapa ou de taxa. */
    readonly kind: 'subtype' | 'category' | 'rate';
    /** Caminho alvo: 'subtype' | 'category' | 'rates.throughput' | 'rates.recoveryRate' | 'rates.yield'. */
    readonly path: string;
    /** Novo valor (validado contra o catálogo/faixa). */
    readonly value: unknown;
}

/** Opções do cenário resultante. */
export interface MutateProcessOptions {
    /** Id explícito do novo cenário (default: `<id-origem>-mut`). */
    readonly id?: string;
    /** Nome do novo cenário (default: nome do cenário de origem). */
    readonly name?: string;
}

/** As 3 taxas universais mutáveis (spec §2.1 F2). */
const RATE_PATHS: Readonly<Record<string, { min: number; max: number }>> = Object.freeze({
    'rates.throughput': Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }), // > 0 (checado abaixo)
    'rates.recoveryRate': Object.freeze({ min: 0, max: 1 }),
    'rates.yield': Object.freeze({ min: 0, max: 1 }),
});

function fail(message: string): never {
    throw new Error(`mutateProcess: ${message}`);
}

/** Valida a mutação contra o catálogo canônico/faixas — zero duplicação (F2). */
function validateMutation(element: any, mutation: ScenarioProcessMutation): void {
    const data = element?.data ?? {};
    if (mutation.kind === 'subtype') {
        if (mutation.path !== 'subtype') fail(`kind 'subtype' exige path 'subtype' (recebido '${mutation.path}')`);
        if (!isValidSubtype(mutation.value as string)) {
            fail(`subtipo '${String(mutation.value)}' fora do catálogo canônico (subtypes.ts)`);
        }
        return;
    }
    if (mutation.kind === 'category') {
        if (mutation.path !== 'category') fail(`kind 'category' exige path 'category' (recebido '${mutation.path}')`);
        const currentSubtype = typeof data.subtype === 'string' ? data.subtype : null;
        const valid = getCategoriesForSubtype(currentSubtype).some((c: any) => c?.id === mutation.value);
        if (!valid) {
            fail(
                `categoria '${String(mutation.value)}' não pertence ao subtipo '${String(currentSubtype)}' ` +
                    `(catálogo getCategoriesForSubtype)`,
            );
        }
        return;
    }
    if (mutation.kind === 'rate') {
        const range = RATE_PATHS[mutation.path];
        if (!range) {
            fail(`path de taxa '${mutation.path}' inválido — permitidos: ${Object.keys(RATE_PATHS).join(', ')}`);
        }
        const v = mutation.value;
        if (typeof v !== 'number' || !Number.isFinite(v)) fail(`taxa '${mutation.path}' exige número finito`);
        if (mutation.path === 'rates.throughput' && (v as number) <= 0) {
            fail(`throughput deve ser > 0 (recebido ${v})`);
        }
        if ((v as number) < range.min || (v as number) > range.max) {
            fail(`taxa '${mutation.path}' fora da faixa [${range.min}, ${range.max}] (recebido ${v})`);
        }
        return;
    }
    fail(`kind '${String(mutation.kind)}' desconhecido — permitidos: subtype | category | rate`);
}

/**
 * Aplica UMA mutação de processo ao clone (F2) e devolve um NOVO cenário.
 *
 * O cenário de origem permanece intacto (está congelado e não é tocado);
 * o resultado é um novo clone congelado cujo `baseScenarioId` aponta para
 * o cenário de origem — a cadeia de derivação fica rastreável.
 *
 * @param scenario  cenário-base (produto de cloneModelToScenario).
 * @param mutation  a mutação única (elementId + kind + path + value).
 * @param opts      id/nome do cenário resultante.
 * @returns novo Scenario imutável com a mutação aplicada.
 */
export function mutateProcess(
    scenario: Scenario,
    mutation: ScenarioProcessMutation,
    opts: MutateProcessOptions = {},
): Scenario {
    if (!scenario || typeof scenario !== 'object' || !scenario.model) {
        fail('scenario inválido (esperado produto de cloneModelToScenario)');
    }
    if (!mutation || typeof mutation.elementId !== 'string' || mutation.elementId.trim() === '') {
        fail('mutation.elementId obrigatório');
    }
    // structuredClone sobre o modelo CONGELADO produz cópia editável e
    // independente — o cenário de origem sai intocado por construção.
    const draft: ModelState = structuredClone({
        elements: scenario.model.elements,
        campaigns: scenario.model.campaigns,
        erpFinancial: scenario.model.erpFinancial,
    });
    const element = (draft.elements as any[]).find((el) => el?.id === mutation.elementId);
    if (!element) fail(`elemento '${mutation.elementId}' não existe no cenário`);
    if (element.family !== 'production_area' && element.familyId !== 'production_area') {
        fail(`elemento '${mutation.elementId}' não é production_area (family='${String(element.family)}')`);
    }
    validateMutation(element, mutation);
    element.data = element.data ?? {};
    if (mutation.kind === 'subtype') {
        element.data.subtype = mutation.value;
    } else if (mutation.kind === 'category') {
        element.data.category = mutation.value;
    } else {
        const rateKey = mutation.path.slice('rates.'.length);
        element.data.rates = element.data.rates ?? {};
        element.data.rates[rateKey] = mutation.value;
    }
    // CFG-40: o ESTADO RESULTANTE precisa ser fisicamente coerente
    // (ex.: mutar recoveryRate para baixo do yield existente é rejeitado).
    assertRatesCrossRules(element.data.rates ?? {}, 'mutateProcess');
    return cloneModelToScenario(draft, opts.name ?? scenario.name, {
        id: opts.id ?? `${scenario.id}-mut`,
        baseScenarioId: scenario.id,
    });
}
