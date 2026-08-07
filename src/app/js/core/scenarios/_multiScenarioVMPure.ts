// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Multi-Scenario Comparator View-Model — pure-logic (CFG-07/08, TOP-2).
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2 F1/F7, §5.1).
 *
 * THE POINT (pergunta-mãe + comparação lado-a-lado): o comparador 1×1 só mostra
 * Base × 1 Alternativo. Esta VM generaliza para **1 coluna Base + N colunas de
 * cenário**, cada uma com CAPEX/OPEX/ECBT/ODS calculados DE VERDADE pelo motor
 * (`computeRealScenarioMetrics`) e o Δ de cada dimensão vs. a Base. Permite ao
 * usuário avaliar VÁRIAS mutações (inclusive per-rota da pergunta-mãe) de uma vez.
 *
 * Reusa o motor por cenário — NÃO reimplementa nenhuma fórmula (anti-N4). A
 * semântica de sinal por dimensão é a MESMA do comparador 1×1 (§F7: em custos e
 * nº de ODS afetados MENOS é melhora; no ECBT MAIS é melhora; Δ null ⇒ 'semDado',
 * nunca 0 forjado — N3).
 *
 * Pure — ZERO DOM, ZERO IO, determinístico. Todos os objetos retornados são
 * congelados (frozen). A ordem das colunas de cenário preserva a ordem das
 * mutações de entrada (estável).
 */

import {
    computeRealScenarioMetrics,
    type BaseProcess,
    type ProcessMutation,
    type RealScenarioMetrics,
    type ScenarioActivity,
} from './_scenarioImpactEnginePure.js';
import type { Dimension, DeltaSinal, OdsImpacto } from './_scenarioComparatorVMPure.js';

// ───────────────────────────── Tipos públicos ─────────────────────────────

/**
 * Uma célula de cenário numa dimensão: o valor do cenário, o Δ vs. base e o
 * sinal. `delta === null` (falta dado num dos lados) ⇒ 'semDado' (N3).
 */
export interface MultiScenarioCell {
    /** Valor desta dimensão neste cenário (R$/contagem), ou null (semDado). */
    readonly value: number | null;
    /** value − base, ou null quando algum lado é ausente. */
    readonly delta: number | null;
    /** Sinal qualitativo do Δ vs. base (§F7). */
    readonly sinal: DeltaSinal;
    /** Unidade curta exibida (ex.: 'R$', 'R$/ano', ''). */
    readonly unidade: string;
}

/** Uma coluna do comparador: um cenário (Base ou mutado) e suas 4 dimensões. */
export interface MultiScenarioColumn {
    /** Índice estável da coluna (0 = Base; 1..N = cenários, na ordem de entrada). */
    readonly index: number;
    /** Rótulo curto da coluna ('Base', 'Cenário 1', …) — derivado, sobrescrevível. */
    readonly label: string;
    /** True somente na coluna Base (sem mutação). */
    readonly isBase: boolean;
    /** Uma célula por dimensão (CAPEX/OPEX/ECBT/ODS). */
    readonly dims: Record<Dimension, MultiScenarioCell>;
    /** ODS afetados por ESTE cenário (indicador oficial citável). */
    readonly ods: readonly OdsImpacto[];
    /** True iff alguma dimensão deste cenário ficou sem dado (provenance). */
    readonly anySemDado: boolean;
}

/** View-model completo do comparador multi-cenário. */
export interface MultiScenarioComparatorVM {
    /** Coluna Base (índice 0) seguida das N colunas de cenário (ordem estável). */
    readonly columns: readonly MultiScenarioColumn[];
    /** Lista consolidada e ordenada de ODS afetados (união de todas as colunas). */
    readonly odsAfetados: readonly OdsImpacto[];
}

/** Rótulo opcional por cenário (na ordem das mutações). */
export interface MultiScenarioOptions {
    /** Rótulos das colunas de cenário (1..N). Faltando ⇒ 'Cenário {i}'. */
    readonly labels?: ReadonlyArray<string>;
    /** Rótulo da coluna Base. Faltando ⇒ 'Base'. */
    readonly baseLabel?: string;
}

// ───────────────────────────── Semântica (§F7) ─────────────────────────────

/** Unidades canônicas por dimensão (rótulo curto exibido). */
const DIMENSION_UNITS: Record<Dimension, string> = Object.freeze({
    capex: 'R$',
    opex: 'R$/ano',
    ecbt: 'R$',
    ods: '',
});

/**
 * Dimensões onde MENOS é melhor (Δ negativo = melhora): custos e nº de ODS.
 * ECBT é o contrário (mais resultado líquido = melhora). §F7 da spec.
 */
const LOWER_IS_BETTER: Record<Dimension, boolean> = Object.freeze({
    capex: true,
    opex: true,
    ecbt: false,
    ods: true,
});

/** Ordem canônica das dimensões (igual à tabela 1×1). */
const DIMENSIONS: readonly Dimension[] = Object.freeze(['capex', 'opex', 'ecbt', 'ods']);

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Resolve o sinal qualitativo de um Δ numa dimensão (mesma regra do 1×1).
 * `delta === null` → 'semDado'; `delta === 0` → 'neutro'; senão LOWER_IS_BETTER.
 */
function resolveSinal(dim: Dimension, delta: number | null): DeltaSinal {
    if (delta === null || !Number.isFinite(delta)) return 'semDado';
    if (delta === 0) return 'neutro';
    const isImprovement = LOWER_IS_BETTER[dim] ? delta < 0 : delta > 0;
    return isImprovement ? 'melhora' : 'piora';
}

/** Valor numérico de uma dimensão a partir das métricas reais (ODS = contagem). */
function dimValue(metrics: RealScenarioMetrics, dim: Dimension): number | null {
    if (dim === 'ods') return metrics.ods.length > 0 ? metrics.ods.length : null;
    const v = metrics[dim];
    return isFiniteNumber(v) ? v : null;
}

/** Monta UMA célula (valor + Δ vs. base) de uma dimensão de um cenário. */
function buildCell(dim: Dimension, value: number | null, baseValue: number | null): MultiScenarioCell {
    const hasBoth = isFiniteNumber(value) && isFiniteNumber(baseValue);
    const delta = hasBoth ? (value as number) - (baseValue as number) : null;
    return Object.freeze({
        value: isFiniteNumber(value) ? value : null,
        delta,
        sinal: resolveSinal(dim, delta),
        unidade: DIMENSION_UNITS[dim],
    });
}

/** Extrai os ODS (indicador citável) de um cenário no formato {@link OdsImpacto}. */
function toOdsImpacto(metrics: RealScenarioMetrics): OdsImpacto[] {
    return metrics.ods.map((o) =>
        Object.freeze({
            goal: o.goal,
            indicator: o.indicator,
            source: o.source,
            sinal: o.sinal,
        }),
    );
}

/** Monta as 4 células de dimensão de um cenário, deltadas contra a Base. */
function buildDims(
    metrics: RealScenarioMetrics,
    base: RealScenarioMetrics,
): Record<Dimension, MultiScenarioCell> {
    const dims = {} as Record<Dimension, MultiScenarioCell>;
    for (const dim of DIMENSIONS) {
        dims[dim] = buildCell(dim, dimValue(metrics, dim), dimValue(base, dim));
    }
    return Object.freeze(dims);
}

/**
 * Consolida os ODS de TODAS as colunas (união por goal:indicator, ordenado por
 * goal). O sinal vem do último cenário que afeta o ODS (a Base entra primeiro,
 * então um cenário mutado prevalece — coerente com o comparador 1×1).
 */
function consolidateOds(columns: readonly MultiScenarioColumn[]): OdsImpacto[] {
    const byKey = new Map<string, OdsImpacto>();
    for (const col of columns) {
        for (const o of col.ods) byKey.set(`${o.goal}:${o.indicator}`, o);
    }
    return Object.freeze(
        Array.from(byKey.values())
            .map((o) => Object.freeze({ ...o }))
            .sort((a, b) => a.goal - b.goal || a.indicator.localeCompare(b.indicator)),
    ) as OdsImpacto[];
}

// ───────────────────────────── API pública ─────────────────────────────

/**
 * Constrói o view-model do comparador MULTI-cenário: 1 coluna Base + N colunas,
 * uma por mutação (na ordem de entrada). Cada coluna traz CAPEX/OPEX/ECBT/ODS
 * reais (via {@link computeRealScenarioMetrics}) e o Δ de cada dimensão vs. Base.
 *
 * - Determinístico e puro: mesma entrada → mesma saída; tudo congelado.
 * - Ordenação estável: a coluna `i` corresponde a `mutations[i-1]` (a coluna 0 é
 *   sempre a Base, sem mutação).
 * - Lista de mutações vazia ⇒ VM com SÓ a coluna Base (todos os Δ = 0).
 * - Reusa o motor por cenário (anti-N4) — não recalcula nenhuma fórmula aqui.
 *
 * @param base - O processo-base (nunca mutado).
 * @param mutations - Lista de mutações; cada uma vira uma coluna de cenário.
 * @param activity - Driver de atividade A(t) opcional (default = throughput).
 * @param options - Rótulos opcionais das colunas.
 * @returns VM congelado com `columns` (Base + N) e `odsAfetados` consolidados.
 */
export function buildMultiScenarioComparatorVM(
    base: BaseProcess,
    mutations: ReadonlyArray<ProcessMutation> = [],
    activity: ScenarioActivity = {},
    options: MultiScenarioOptions = {},
): MultiScenarioComparatorVM {
    const safeMutations = Array.isArray(mutations) ? mutations : [];
    const baseMetrics = computeRealScenarioMetrics(base, {}, activity);

    const baseColumn: MultiScenarioColumn = Object.freeze({
        index: 0,
        label: typeof options.baseLabel === 'string' && options.baseLabel.length > 0 ? options.baseLabel : 'Base',
        isBase: true,
        dims: buildDims(baseMetrics, baseMetrics), // Δ da Base contra si mesma = 0
        ods: Object.freeze(toOdsImpacto(baseMetrics)) as readonly OdsImpacto[],
        anySemDado: baseMetrics.anySemDado,
    });

    const columns: MultiScenarioColumn[] = [baseColumn];
    safeMutations.forEach((mutation, i) => {
        const metrics = computeRealScenarioMetrics(base, mutation || {}, activity);
        const label =
            options.labels && typeof options.labels[i] === 'string' && options.labels[i].length > 0
                ? options.labels[i]
                : `Cenário ${i + 1}`;
        columns.push(
            Object.freeze({
                index: i + 1,
                label,
                isBase: false,
                dims: buildDims(metrics, baseMetrics),
                ods: Object.freeze(toOdsImpacto(metrics)) as readonly OdsImpacto[],
                anySemDado: metrics.anySemDado,
            }),
        );
    });

    const frozenColumns = Object.freeze(columns) as readonly MultiScenarioColumn[];
    return Object.freeze({
        columns: frozenColumns,
        odsAfetados: consolidateOds(frozenColumns),
    });
}
