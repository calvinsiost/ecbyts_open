// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO ECBT SCORE — pure-logic (SCENARIOS-IMPACT-001, F5).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.1 F5,
   §9 tabela de reuso). Recalcula o ECBT Score de UM cenário REUSANDO o
   motor canônico `computeEcbtScore` (core/ecbtScore/_ecbtScorePure) e o
   adaptador `toFinancialEntries` (core/erp/_ecbtScoreAdapterPure) —
   nenhum motor é reimplementado (NOT N4): este módulo só liga o
   `FinancialEntry[]` derivado do clone (saída do caminho ERP do F4) ao
   `computeEcbtScore(input)` → V_net = Σativos − Σpassivos.

   Entrada aceita as duas pontas do caminho único de dados (§B):
     a) `entries`  — o par assets/liabilities já derivado do clone
        (ex.: `toFinancialEntries(statement, {ledger})` do F4); ou
     b) `statement` (+ `ledger` opcional) — a DRE do clone; o módulo
        deriva os FinancialEntry[] via `toFinancialEntries` (reuso F5).

   κ/mode vêm da config CURADA e versionada (CFG-24 — NOT N9) via
   `resolveEcbtScenarioConfig`; omitir = default (kappa=1, 'absolute'),
   o comportamento atual, zero regressão.

   N3 (honestidade de dado): sem NENHUMA entrada financeira derivada do
   clone → `vNet: null` + `semDado: true` (NUNCA um 0 forjado).

   ZERO DOM, ZERO IO, determinístico. Retornos congelados.
   ================================================================ */

import { computeEcbtScore } from '../ecbtScore/_ecbtScorePure.js';
import type { Currency, EcbtScoreVM, FinancialEntry } from '../ecbtScore/_ecbtScorePure.js';
import { toFinancialEntries } from '../erp/_ecbtScoreAdapterPure.js';
import type { ScoreEntries } from '../erp/_ecbtScoreAdapterPure.js';
import type { IncomeStatement } from '../erp/_incomeStatementPure.js';
import type { AccountBalance } from '../erp/_ledgerPure.js';
import {
    resolveEcbtScenarioConfig,
    type EcbtScenarioConfigOverride,
} from './_scenarioEcbtConfigPure.js';

/** Par assets/liabilities já derivado do clone (subset de {@link ScoreEntries}). */
export interface ScenarioFinancialEntries {
    readonly assets: ReadonlyArray<FinancialEntry>;
    readonly liabilities: ReadonlyArray<FinancialEntry>;
}

/** Entrada do recálculo F5 — uma das duas pontas do caminho único (§B). */
export interface ScenarioEcbtInput {
    /**
     * FinancialEntry[] já derivado do clone (ex.: saída de
     * `toFinancialEntries` no caminho F4). Quando presente, vence sobre
     * `statement` (é o dado mais derivado).
     */
    readonly entries?: ScenarioFinancialEntries | null;
    /** DRE do clone (caminho F4); usado quando `entries` está ausente. */
    readonly statement?: IncomeStatement | null;
    /** Ledger do clone — dá rastreabilidade ativo/passivo ao V_net. */
    readonly ledger?: ReadonlyMap<string, AccountBalance> | null;
    /** Moeda de saída (default 'BRL', o caminho ERP atual). */
    readonly currency?: Currency;
    /** Override CURADO e versionado do κ/mode (CFG-24 — NOT N9). */
    readonly config?: EcbtScenarioConfigOverride | null;
}

/** Resultado do recálculo F5 (a dimensão ECBT do comparador). */
export interface ScenarioEcbtResult {
    /** V_net = Σativos − Σpassivos (R$) — `null` = sem dado (N3). */
    readonly vNet: number | null;
    /** true quando não havia NENHUMA entrada financeira derivada do clone. */
    readonly semDado: boolean;
    /** O VM completo do motor canônico (banda, κ, sinal) — `null` se semDado. */
    readonly score: EcbtScoreVM | null;
    /** Proveniência: quantas entradas alimentaram o motor. */
    readonly entryCount: number;
}

/** Resultado "sem dado" congelado (N3 — nunca 0 forjado). */
const SEM_DADO: ScenarioEcbtResult = Object.freeze({
    vNet: null,
    semDado: true,
    score: null,
    entryCount: 0,
});

function asEntryArray(v: unknown): ReadonlyArray<FinancialEntry> {
    return Array.isArray(v) ? (v as ReadonlyArray<FinancialEntry>) : [];
}

/**
 * Resolve o par assets/liabilities derivado do clone: `entries` direto quando
 * fornecido; senão deriva da `statement` via `toFinancialEntries` (reuso F5).
 * `null` quando nenhuma das pontas foi fornecida.
 */
function resolveEntries(input: ScenarioEcbtInput): ScenarioFinancialEntries | null {
    if (input.entries && typeof input.entries === 'object') {
        return Object.freeze({
            assets: asEntryArray(input.entries.assets),
            liabilities: asEntryArray(input.entries.liabilities),
        });
    }
    if (input.statement && typeof input.statement === 'object') {
        const derived: ScoreEntries = toFinancialEntries(input.statement, {
            currency: input.currency ?? 'BRL',
            // exactOptionalPropertyTypes: só inclui `ledger` quando presente.
            ...(input.ledger ? { ledger: input.ledger } : {}),
        });
        return derived;
    }
    return null;
}

/**
 * F5 — Recalcula o ECBT Score do cenário a partir do `FinancialEntry[]`
 * derivado do clone, reusando `computeEcbtScore` (V_net = Σativos − Σpassivos).
 *
 * @param input - Uma das pontas do caminho único: `entries` OU `statement`
 *   (+`ledger`), mais a config curada opcional (CFG-24).
 * @returns Resultado congelado; sem entrada financeira → `{vNet: null,
 *   semDado: true}` (N3 — nunca 0 forjado).
 */
export function recomputeScenarioEcbtScore(input: ScenarioEcbtInput = {}): ScenarioEcbtResult {
    const safe = input && typeof input === 'object' ? input : {};
    const entries = resolveEntries(safe);
    if (!entries) return SEM_DADO;
    const entryCount = entries.assets.length + entries.liabilities.length;
    if (entryCount === 0) return SEM_DADO; // N3: sem dado ≠ V_net 0
    const cfg = resolveEcbtScenarioConfig(safe.config);
    const score = computeEcbtScore({
        assets: entries.assets,
        liabilities: entries.liabilities,
        kappa: cfg.kappa,
        mode: cfg.mode,
        currency: safe.currency ?? 'BRL',
    });
    return Object.freeze({
        vNet: score.amount,
        semDado: false,
        score,
        entryCount,
    });
}
