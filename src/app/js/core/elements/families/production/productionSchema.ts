// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PRODUCTION-AREA-001 — Schema da família 'production_area' (Fase 1).
   Tipos puros (sem DOM, sem `any`) que descrevem o "motor produtivo":
   uma planta de beneficiamento que recebe matéria-prima, processa e
   devolve produto + rejeito, registrando o que entra, o que sai e a
   que ritmo (as três taxas universais de processo).

   Estrutura data-driven: subtipo (mineracao|petroleo, ampliável) →
   categorias (etapas) → portas de entrada/saída + taxas. Adicionar
   um subtipo novo é só acrescentar dados (ver subtypes.ts), sem mexer
   nestes tipos nem na lógica pura.

   Spec: docs/specs/features/SPEC_PRODUCTION_AREA_FAMILY.md (§4.2)
   ================================================================ */

/**
 * Uma "porta" de material: entrada ou saída de uma etapa do processo.
 * É a definição estática (catálogo) — sem valor numérico (esse vive
 * em element.data quando o usuário preenche).
 */
export interface IoPort {
    /** Identificador estável da porta (ex: 'ore', 'water', 'concentrate', 'tailings'). */
    id: string;
    /** Chave i18n da label visível (nunca texto literal). */
    nameKey: string;
    /** Unidade física padrão (ex: 't', 't/h', 'm3', 'bbl'). */
    unit: string;
    /**
     * Valor-semente opcional (ENERGY-SCENARIOS #2). Só faz sentido em portas
     * de ENTRADA: preenche o campo editável do painel na primeira montagem,
     * para dar um resultado real "de fábrica" (ex.: caso biomassa lignocelulósica). Data-driven,
     * sem lógica — a UI usa `element.data.portValues[id]` quando o usuário edita.
     */
    defaultValue?: number;
    /**
     * Rendimento mássico opcional POR PRODUTO (fração 0..1), só em portas de
     * SAÍDA (ENERGY-SCENARIOS #2). Permite modelar processos com múltiplos
     * co-produtos (pirólise: sólido/líquido/gás/cinza) sem estender a lógica
     * de etapa — a UI calcula `saída = Σentrada × yieldFraction`. A soma dos
     * yieldFraction de uma etapa deve ficar ≤ 1 (balanço fecha).
     */
    yieldFraction?: number;
    /**
     * Id de fator energético opcional (ENERGY-SCENARIOS #2/#3): liga a porta a
     * uma biomassa/combustível em `analytics/energyFactors.ts` para converter
     * massa→energia (GJ) no painel. Data-driven; a UI resolve por injeção.
     */
    energyFactorId?: string;
}

/**
 * As três taxas universais que descrevem qualquer processo produtivo
 * (mineração ou petróleo): vazão, recuperação e teor/rendimento.
 * Todas opcionais — uma etapa pode declarar só as que fazem sentido.
 */
export interface ProcessRates {
    /** Vazão de processamento (t/h, bbl/d): geralmente o gargalo. */
    throughput?: { value: number; unit: string };
    /** Recuperação do material valioso, fração 0..1 (eficiência). */
    recoveryRate?: number;
    /** Teor / rendimento do produto comercial (qualidade). */
    yield?: { value: number; unit: string };
}

/**
 * Uma etapa (categoria) do processo, com suas portas e taxas.
 * A ordem de exibição é dada por `order` (menor = primeiro).
 */
export interface ProductionCategory {
    /** Identificador da etapa (ex: 'extraction', 'beneficiation'). */
    id: string;
    /** Chave i18n da label da etapa. */
    nameKey: string;
    /** Ordem de exibição (menor = primeiro). */
    order: number;
    /** Portas de entrada (matéria-prima, insumos). */
    inputs: IoPort[];
    /** Portas de saída (produto, rejeito, subprodutos). */
    outputs: IoPort[];
    /** Taxas universais declaradas para a etapa. */
    rates: ProcessRates;
}

/**
 * Um subtipo de planta produtiva. `id` é uma string aberta para
 * permitir subtipos futuros (cimento, papel/celulose, siderurgia…)
 * sem mudar os tipos.
 */
export interface ProductionSubtype {
    /** Identificador do subtipo: 'mining' | 'petroleum' | futuros. */
    id: string;
    /** Chave i18n do nome do subtipo. */
    nameKey: string;
    /** Ícone Lucide do subtipo (para o seletor de UI, Fase 2). */
    icon: string;
    /** Etapas (categorias) ordenadas que compõem o processo. */
    categories: ProductionCategory[];
}

/**
 * Valor numérico preenchido pelo usuário para uma porta (vive em
 * element.data, não no catálogo). Usado pela validação de massa.
 */
export interface IoPortValue {
    id: string;
    value: number;
    unit?: string;
}

/**
 * Resultado da validação de coerência de massa de uma etapa.
 * Puro, sem DOM — fácil de testar.
 */
export interface MassBalanceResult {
    /** true quando saída ≤ entrada (+tolerância). */
    ok: boolean;
    /** Chave i18n do aviso quando `ok === false`. */
    warningKey?: string;
    /** Razão saída/entrada (1.0 = balanço perfeito). */
    ratio: number;
}

/**
 * Resultado calculado de uma porta de saída de uma etapa (ENERGY-SCENARIOS #2).
 * Massa e (quando há fator energético) energia por produto.
 */
export interface PortResult {
    /** Id da porta de saída. */
    id: string;
    /** Chave i18n da label. */
    nameKey: string;
    /** Unidade mássica da porta (ex.: 't/d'). */
    unit: string;
    /** Massa/vazão calculada da saída (entrada × yieldFraction, ou valor bruto). */
    mass: number;
    /** Energia associada em GJ (massa × PCS), quando a porta tem `energyFactorId`. */
    energyGJ?: number;
    /** Id do fator energético usado (para exibir a fonte). */
    energyFactorId?: string;
}

/**
 * Resultado calculado de uma etapa inteira (ENERGY-SCENARIOS #2): total de
 * entrada, saídas com massa+energia, e o veredito de balanço de massa.
 */
export interface StageResult {
    /** Id da etapa (categoria). */
    categoryId: string;
    /** Soma das entradas declaradas (massa/vazão). */
    inputTotal: number;
    /** Saídas calculadas com massa e (opcional) energia. */
    outputs: PortResult[];
    /** Energia total das saídas em GJ (soma das que têm fator). */
    energyTotalGJ: number;
    /** Veredito de balanço de massa da etapa. */
    massBalance: MassBalanceResult;
}

/**
 * Fator energético mínimo que `computeStageResults` precisa (subconjunto de
 * `analytics/energyFactors.ts`). Injeção de dependência: mantém a lógica pura
 * da família livre de import do módulo de analytics.
 */
export interface EnergyFactorLike {
    /** Poder calorífico superior (PCS/HHV) em MJ/kg. */
    hhvMJkg: number;
}

/** Resolve um fator energético por id (ou null se desconhecido). */
export type EnergyFactorResolver = (id: string) => EnergyFactorLike | null;
