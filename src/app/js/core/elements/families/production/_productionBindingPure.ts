// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PRODUCTION-AREA-001 — Lógica pura da família 'production_area' (Fase 1).
   Funções determinísticas, sem DOM e sem rede — a "cola" que o
   ProductionProcessModule (UI, Fase 2) consome.

   Responsabilidades:
   - validateSubtype()    → o subtipo escolhido existe no catálogo?
   - computeOutput()      → saída = entrada × taxa (recovery/yield)
   - validateMassBalance()→ a soma das saídas excede a entrada? (RF-8)
   - sumPortValues()      → somatório mássico de portas

   Princípio físico: balanço de massa — tudo que entra é contabilizado
   no que sai (produto + rejeito + perdas).

   Spec: docs/specs/features/SPEC_PRODUCTION_AREA_FAMILY.md (§4.2, §6)
   ================================================================ */

import {
    getProductionSubtype,
    isValidSubtype,
} from './subtypes.js';
import type {
    EnergyFactorResolver,
    IoPortValue,
    MassBalanceResult,
    ProductionCategory,
    ProductionSubtype,
    StageResult,
} from './productionSchema.js';

/** Chave i18n do aviso de balanço de massa (saída > entrada). */
export const MASS_BALANCE_WARNING_KEY = 'productionProcess.warn.massBalance';

/** Tolerância default (1%) para a coerência de massa (RF-8). */
export const DEFAULT_MASS_TOLERANCE = 0.01;

/**
 * Valida o subtipo escolhido contra o catálogo. Devolve o subtipo
 * resolvido (ou null) junto de um flag — fallback seguro para a UI.
 */
export function validateSubtype(
    id: string | null | undefined,
): { valid: boolean; subtype: ProductionSubtype | null } {
    const subtype = getProductionSubtype(id);
    return { valid: subtype !== null, subtype };
}

/**
 * Calcula a saída a partir de uma entrada e uma taxa (fração 0..1).
 * É o cerne "input → output": ex. recuperação 0.88 sobre 500 t/h de
 * minério dá 440 t/h recuperados. Clampa a taxa em [0, 1] e ignora
 * entradas não-finitas (defensivo) devolvendo 0.
 *
 * @param input - quantidade de entrada (massa/vazão)
 * @param rate  - taxa de conversão (recovery/yield), fração 0..1
 * @returns saída = input × rate (nunca negativa)
 */
export function computeOutput(input: number, rate: number): number {
    if (!Number.isFinite(input) || !Number.isFinite(rate)) return 0;
    const clampedRate = Math.min(1, Math.max(0, rate));
    const out = input * clampedRate;
    return out > 0 ? out : 0;
}

/**
 * Soma os valores mássicos de uma lista de portas (ignora não-finitos).
 */
export function sumPortValues(ports: readonly IoPortValue[] | null | undefined): number {
    if (!Array.isArray(ports)) return 0;
    let total = 0;
    for (const p of ports) {
        if (p && Number.isFinite(p.value)) total += p.value;
    }
    return total;
}

/**
 * Valida a coerência de massa de uma etapa: a soma das saídas não pode
 * exceder a entrada, dentro de uma tolerância (default 1%). Violação
 * NÃO bloqueia salvar — apenas sinaliza um aviso visível (RF-8).
 *
 * Puro: recebe os valores mássicos já preenchidos (não o catálogo).
 *
 * @param inputs    - portas de entrada com valores
 * @param outputs   - portas de saída com valores
 * @param tolerance - fração extra tolerada (default 0.01 = 1%)
 */
export function validateMassBalance(
    inputs: readonly IoPortValue[],
    outputs: readonly IoPortValue[],
    tolerance: number = DEFAULT_MASS_TOLERANCE,
): MassBalanceResult {
    const totalIn = sumPortValues(inputs);
    const totalOut = sumPortValues(outputs);
    const tol = Number.isFinite(tolerance) ? Math.max(0, tolerance) : DEFAULT_MASS_TOLERANCE;

    // Sem entrada declarada: nada a violar (razão 0, ok).
    if (totalIn <= 0) {
        return { ok: true, ratio: 0 };
    }

    const ratio = totalOut / totalIn;
    const exceeds = totalOut > totalIn * (1 + tol);
    return exceeds
        ? { ok: false, warningKey: MASS_BALANCE_WARNING_KEY, ratio }
        : { ok: true, ratio };
}

/**
 * Versão de conveniência que valida a coerência de massa de uma etapa
 * inteira a partir do catálogo + valores preenchidos por porta-id.
 * Cruza os ids das portas declaradas (`category`) com os valores em
 * `values` (vindos de element.data).
 *
 * @param category - definição da etapa (catálogo)
 * @param values   - mapa portId → valor numérico (element.data)
 * @param tolerance- fração extra tolerada (default 1%)
 */
export function validateCategoryMassBalance(
    category: ProductionCategory,
    values: Readonly<Record<string, number>>,
    tolerance: number = DEFAULT_MASS_TOLERANCE,
): MassBalanceResult {
    const toValues = (ports: ProductionCategory['inputs']): IoPortValue[] =>
        ports.map((p) => ({ id: p.id, value: values?.[p.id] ?? 0, unit: p.unit }));
    return validateMassBalance(toValues(category.inputs), toValues(category.outputs), tolerance);
}

/**
 * Calcula os RESULTADOS de uma etapa (ENERGY-SCENARIOS #2): a partir dos
 * valores de entrada preenchidos, deriva a massa de cada saída e — quando a
 * porta declara `energyFactorId` — a energia associada em GJ (massa × PCS).
 *
 * Convenção de unidade: se a massa está em t/d (toneladas) e o PCS em MJ/kg,
 * então energia (GJ/d) = massa_t × PCS_MJ/kg (1 t × 1 MJ/kg = 1 GJ). Portas
 * cuja unidade já é energética (MWh/GJ/MJ) não recebem conversão adicional.
 *
 * Regra de saída:
 *   - porta com `yieldFraction`: massa = Σentradas × yieldFraction (co-produto)
 *   - porta sem `yieldFraction`: massa = valor preenchido pelo usuário (bruto)
 *
 * Puro, sem DOM: recebe os valores por porta-id e um resolvedor de fatores.
 *
 * @param category - definição da etapa (catálogo)
 * @param values   - mapa portId → valor numérico (element.data.portValues)
 * @param getFactor - resolvedor de fator energético (injeção; null se ausente)
 * @param tolerance - fração extra tolerada no balanço (default 1%)
 */
export function computeStageResults(
    category: ProductionCategory,
    values: Readonly<Record<string, number>>,
    getFactor: EnergyFactorResolver | null = null,
    tolerance: number = DEFAULT_MASS_TOLERANCE,
): StageResult {
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const inputTotal = category.inputs.reduce((acc, p) => acc + num(values?.[p.id]), 0);

    const ENERGY_UNITS = new Set(['GJ', 'GJ/d', 'MJ', 'MJ/d', 'MWh', 'MWh/d', 'kWh', 'MW']);
    let energyTotalGJ = 0;
    const outputs = category.outputs.map((port) => {
        const mass =
            typeof port.yieldFraction === 'number' && Number.isFinite(port.yieldFraction)
                ? computeOutput(inputTotal, port.yieldFraction)
                : num(values?.[port.id]);

        let energyGJ: number | undefined;
        if (port.energyFactorId && getFactor && !ENERGY_UNITS.has(port.unit)) {
            const factor = getFactor(port.energyFactorId);
            if (factor && Number.isFinite(factor.hhvMJkg)) {
                // massa em t × PCS em MJ/kg = GJ (1 t × 1 MJ/kg = 1 GJ).
                energyGJ = mass * factor.hhvMJkg;
                if (Number.isFinite(energyGJ)) energyTotalGJ += energyGJ;
                else energyGJ = undefined;
            }
        }
        // exactOptionalPropertyTypes: omite energyGJ/energyFactorId (em vez de
        // `undefined`) quando não há fator energético aplicável à porta.
        return {
            id: port.id,
            nameKey: port.nameKey,
            unit: port.unit,
            mass,
            ...(energyGJ !== undefined ? { energyGJ } : {}),
            ...(port.energyFactorId !== undefined ? { energyFactorId: port.energyFactorId } : {}),
        };
    });

    const outputTotal = outputs.reduce((acc, o) => acc + o.mass, 0);
    const massBalance = validateMassBalance(
        category.inputs.map((p) => ({ id: p.id, value: num(values?.[p.id]) })),
        outputs.map((o) => ({ id: o.id, value: o.mass })),
        tolerance,
    );
    void outputTotal;

    return { categoryId: category.id, inputTotal, outputs, energyTotalGJ, massBalance };
}

/** Resultado de etapa acrescido das entradas efetivas resolvidas pelo encadeamento. */
export interface ChainedStageResult extends StageResult {
    /** portId → valor efetivo usado no cálculo (user > etapa anterior > default). */
    effectiveInputs: Record<string, number>;
    /** portIds de entrada cujo valor veio do encadeamento (saída da etapa anterior). */
    chainedPortIds: string[];
}

/**
 * Calcula os resultados de TODAS as etapas em cascata (auto-encadeamento):
 * quando uma porta de ENTRADA de uma etapa tem o mesmo id de uma porta de
 * SAÍDA de etapa anterior (ex. biomassDry, thermalEnergy), o valor calculado
 * a montante vira o default efetivo da etapa a jusante. Precedência por porta:
 *
 *   1. valor digitado pelo usuário (userValues / element.data.portValues)
 *   2. massa calculada da saída homônima da etapa anterior (encadeamento)
 *   3. `defaultValue` do catálogo
 *   4. 0
 *
 * Puro e determinístico: editar uma etapa a montante propaga automaticamente
 * para as etapas seguintes ao re-invocar esta função (cascata).
 *
 * @param categories - etapas JÁ ORDENADAS por `order` (getCategoriesForSubtype)
 * @param userValues - mapa portId → valor digitado (element.data.portValues)
 * @param getFactor  - resolvedor de fator energético (injeção; null se ausente)
 * @param tolerance  - fração extra tolerada no balanço (default 1%)
 */
export function computeChainedStageResults(
    categories: readonly ProductionCategory[],
    userValues: Readonly<Record<string, number>>,
    getFactor: EnergyFactorResolver | null = null,
    tolerance: number = DEFAULT_MASS_TOLERANCE,
): ChainedStageResult[] {
    const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    // Massas de saída acumuladas das etapas já calculadas (portId → massa).
    const upstream: Record<string, number> = {};
    const results: ChainedStageResult[] = [];

    for (const category of categories ?? []) {
        const effectiveInputs: Record<string, number> = {};
        const chainedPortIds: string[] = [];
        for (const port of category.inputs) {
            const userVal = userValues?.[port.id];
            const upstreamVal = upstream[port.id];
            if (isNum(userVal)) {
                effectiveInputs[port.id] = userVal;
            } else if (isNum(upstreamVal)) {
                effectiveInputs[port.id] = upstreamVal;
                chainedPortIds.push(port.id);
            } else {
                effectiveInputs[port.id] = isNum(port.defaultValue) ? port.defaultValue : 0;
            }
        }

        const stage = computeStageResults(category, effectiveInputs, getFactor, tolerance);
        for (const out of stage.outputs) {
            if (Number.isFinite(out.mass)) upstream[out.id] = out.mass;
        }
        results.push({ ...stage, effectiveInputs, chainedPortIds });
    }
    return results;
}

/**
 * Re-exporta o guard de subtipo válido (conveniência para a UI/binding).
 */
export { isValidSubtype };
