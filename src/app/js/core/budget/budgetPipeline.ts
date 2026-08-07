// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Budget pipeline — orquestra refs → builder → checks → export
 * (micro_activity:acad:orcamento-cotado-001#07, RF-6).
 *
 * Pure-logic: sem DOM, sem fs/network, sem side-effects.
 * Erros em qualquer etapa abortam o pipeline (fail-fast).
 *
 * Tests: `tests/budget-pipeline.test.mjs`.
 */

import {
    loadBudgetRefs,
    getRubric,
    type BudgetRefTable,
    type BudgetRubricCategory,
} from './budgetRefs';

import {
    runBudgetChecks,
    allChecksPass,
    type Budget as ChecksBudget,
    type BudgetRubrica as ChecksRubrica,
    type BudgetRule,
    type BudgetCheckResult,
    type RubricaCategory as ChecksCategory,
} from './budgetChecks';

import {
    exportBudgetText,
    type Budget as ExportBudget,
    type BudgetRubrica as ExportRubrica,
} from './budgetExport';

export interface ProposedItem {
    readonly rubricCode: string;
    readonly value: number;
}

export interface PipelineConfig {
    readonly refTableRaw: unknown;
    readonly proposedItems: readonly ProposedItem[];
    readonly totalEnvelope: number;
    readonly contrapartidaTotal?: number;
    readonly rules: readonly BudgetRule[];
    readonly exportMaxWords: number;
}

export interface PipelineBudget {
    readonly totalEnvelope: number;
    readonly contrapartidaTotal?: number;
    readonly items: ReadonlyArray<PipelineBudgetItem>;
}

export interface PipelineBudgetItem {
    readonly rubricCode: string;
    readonly labelPt: string;
    readonly refCategory: BudgetRubricCategory;
    readonly checkCategory: ChecksCategory;
    readonly value: number;
}

export interface PipelineResult {
    readonly refTable: BudgetRefTable;
    readonly budget: PipelineBudget;
    readonly checks: readonly BudgetCheckResult[];
    readonly checksPass: boolean;
    readonly exportText: string;
}

const REF_TO_CHECK_CATEGORY: Record<BudgetRubricCategory, ChecksCategory> = {
    custeio: 'opex',
    capital: 'capex',
    bolsa: 'outros',
    reserva: 'outros',
    pessoal: 'opex',
    outro: 'outros',
};

function fail(stage: string, reason: string): never {
    throw new Error(`[budgetPipeline:${stage}] ${reason}`);
}

function buildBudget(
    refTable: BudgetRefTable,
    proposedItems: readonly ProposedItem[],
    totalEnvelope: number,
    contrapartidaTotal?: number,
): PipelineBudget {
    if (!Array.isArray(proposedItems) || proposedItems.length === 0) {
        fail('build', 'proposedItems deve ser um array não-vazio');
    }
    if (!Number.isFinite(totalEnvelope) || totalEnvelope <= 0) {
        fail('build', 'totalEnvelope deve ser um número finito positivo');
    }
    if (contrapartidaTotal !== undefined && (!Number.isFinite(contrapartidaTotal) || contrapartidaTotal < 0)) {
        fail('build', 'contrapartidaTotal deve ser um número finito não-negativo');
    }

    const items: PipelineBudgetItem[] = [];

    for (let i = 0; i < proposedItems.length; i++) {
        const proposed = proposedItems[i];
        if (!proposed || typeof proposed.rubricCode !== 'string' || !proposed.rubricCode) {
            fail('build', `proposedItems[${i}]: rubricCode deve ser uma string não-vazia`);
        }
        if (!Number.isFinite(proposed.value) || proposed.value < 0) {
            fail('build', `proposedItems[${i}] (${proposed.rubricCode}): value deve ser um número finito não-negativo`);
        }

        const rubric = getRubric(refTable, proposed.rubricCode);
        if (!rubric) {
            fail('build', `proposedItems[${i}]: rubrica "${proposed.rubricCode}" não existe na tabela de referência "${refTable.funder}"`);
        }

        if (rubric.maxShare !== null && totalEnvelope > 0) {
            const share = proposed.value / totalEnvelope;
            if (share > rubric.maxShare + 1e-9) {
                fail('build', `rubrica "${proposed.rubricCode}" excede maxShare (${(share * 100).toFixed(1)}% > ${(rubric.maxShare * 100).toFixed(0)}%)`);
            }
        }

        items.push(Object.freeze({
            rubricCode: rubric.code,
            labelPt: rubric.labelPt,
            refCategory: rubric.category,
            checkCategory: REF_TO_CHECK_CATEGORY[rubric.category],
            value: proposed.value,
        }));
    }

    return Object.freeze({
        totalEnvelope,
        // exactOptionalPropertyTypes: omite a chave (em vez de `undefined`) quando ausente.
        ...(contrapartidaTotal !== undefined ? { contrapartidaTotal } : {}),
        items: Object.freeze(items),
    });
}

function toChecksBudget(budget: PipelineBudget): ChecksBudget {
    const rubricas: ChecksRubrica[] = budget.items.map((item) => ({
        id: item.rubricCode,
        name: item.labelPt,
        value: item.value,
        category: item.checkCategory,
    }));

    return {
        totalEnvelope: budget.totalEnvelope,
        rubricas,
        ...(budget.contrapartidaTotal !== undefined ? { contrapartidaTotal: budget.contrapartidaTotal } : {}),
    };
}

function toExportBudget(budget: PipelineBudget): ExportBudget {
    const rubricas: ExportRubrica[] = budget.items.map((item) => ({
        id: item.rubricCode,
        nome: item.labelPt,
        categoria: item.checkCategory === 'capex' ? 'capex' as const : 'opex' as const,
        valor: item.value,
    }));

    return {
        rubricas,
        ...(budget.contrapartidaTotal !== undefined ? { contrapartida: budget.contrapartidaTotal } : {}),
        envelopeTotal: budget.totalEnvelope,
    };
}

export function runBudgetPipeline(config: PipelineConfig): PipelineResult {
    const { refTableRaw, proposedItems, totalEnvelope, contrapartidaTotal, rules, exportMaxWords } = config;

    const refTable = loadBudgetRefs(refTableRaw);

    const budget = buildBudget(refTable, proposedItems, totalEnvelope, contrapartidaTotal);

    const checksBudget = toChecksBudget(budget);
    const checks = runBudgetChecks(checksBudget, rules);
    const checksPass = allChecksPass(checks);

    const exportBudget = toExportBudget(budget);
    const exportText = exportBudgetText(exportBudget, exportMaxWords);

    return Object.freeze({
        refTable,
        budget,
        checks: Object.freeze(checks),
        checksPass,
        exportText,
    });
}
