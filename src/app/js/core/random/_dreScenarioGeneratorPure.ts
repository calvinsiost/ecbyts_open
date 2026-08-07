// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * DRE Scenario Generator — gera o lado da RECEITA (e tributos/financeiro/
 * depreciação) que falta para o módulo random formar uma DRE COMPLETA.
 *
 * Calvin 2026-06-21: "incluir no modulo de random informações que adicionem
 * dados para a formação de um DRE completo".
 *
 * PROBLEMA QUE RESOLVE
 * --------------------
 * Hoje o random só gera CUSTOS (despesas) — via
 * `phase-governance.createFinancialsPhase()` → `element.data.costs[]`. Quando a
 * feature ERP/DRE (ERP-DRE-001) consolida a DRE, ela passa esses custos por:
 *
 *   element.data.costs[] → buildCostRollup() → costRollupToJournalEntries()
 *   → buildLedger() → buildIncomeStatement('BR-DRE')
 *
 * Como só existem despesas, a DRE sai com Receita Bruta = 0 e Resultado
 * Líquido = prejuízo. Falta o lado da RECEITA e dos tributos.
 *
 * ESTE MÓDULO produz, em paralelo ao adaptador de custos, lançamentos de
 * partida-dobrada (mesmo formato {@link JournalEntry}) para as linhas da DRE
 * que ainda não têm dado:
 *
 *   - R.1  Receita Bruta de Vendas/Serviços  (proporcional à escala / custo base)
 *   - D.0  Deduções (ICMS/ISS/PIS/COFINS)    (~25-35% da receita bruta — BR)
 *   - D.4  Depreciação e Amortização          (coerente com o CAPEX/imobilizado)
 *   - R.9  Receitas Financeiras / D.8 Despesas Financeiras (juros)
 *   - D.9  IR + CSLL                          (~34% do lucro antes dos tributos,
 *                                              só quando há lucro)
 *
 * Esses lançamentos entram no MESMO ledger dos custos; somados, `buildLedger()`
 * + `buildIncomeStatement('BR-DRE')` fecham uma DRE completa (Receita Bruta →
 * Receita Líquida → Lucro Bruto → EBIT → LAIR → IR/CSLL → Resultado Líquido).
 *
 * COERÊNCIA POR TIER
 * ------------------
 * 4 tiers canônicos (mesmos de `_fineScenarioGeneratorPure`):
 *   - 'gigante' / 'media' / 'pme' → empreendimento dá LUCRO (margem positiva).
 *   - 'catastrofe'                → margem comprimida; pode dar PREJUÍZO.
 *
 * A receita é derivada do custo total observado (`costBase`) por uma margem
 * sobre custo (markup), de modo que tipicamente `receita > custos`. Sem
 * `costBase`, cai para faixas absolutas por tier.
 *
 * Alíquotas BR pesquisadas (regime padrão, valores plausíveis — não aconselham):
 *   - Deduções sobre vendas (ICMS/ISS médio + PIS 1,65% + COFINS 7,6%): ~26%.
 *   - IRPJ 15% + adicional 10% + CSLL 9% = ~34% sobre o lucro real (LAIR>0).
 *
 * Pure-logic: zero side-effects, seeded (createSeededRng), determinístico,
 * saída `Object.freeze`. Sem DOM, sem I/O.
 */

import { createSeededRng } from './prng.js';
import type { JournalEntry, Posting } from '../erp/_journalPure.js';

/** 4 tiers canônicos de escala (alinhados a `_fineScenarioGeneratorPure`). */
export type DreScenarioTier = 'gigante' | 'media' | 'pme' | 'catastrofe';

/** Entrada do gerador de cenário de DRE. */
export interface DreScenarioInput {
    /** Tier de escala. Default 'media'. */
    readonly tier?: DreScenarioTier;
    /** Seed determinístico do PRNG. Default 0. */
    readonly seed?: number | string;
    /** Moeda do cenário. Default 'BRL'. */
    readonly currency?: string;
    /**
     * Custo total observado do empreendimento (Σ opex+capex do random model),
     * usado como âncora para a receita: `receita ≈ costBase × markup`. Quando
     * ausente/zero, usa faixas absolutas por tier.
     */
    readonly costBase?: number;
    /**
     * CAPEX/imobilizado total observado, usado para dimensionar a depreciação
     * (D.4). Quando ausente, deriva uma fração do `costBase`.
     */
    readonly capexBase?: number;
    /** Ano fiscal dos lançamentos. Default: ano corrente (Date deve estar ok). */
    readonly fiscalYear?: number;
    /** Prefixo dos ids dos lançamentos. Default 'dre'. */
    readonly idPrefix?: string;
}

/** Resumo numérico (auditável) do cenário de DRE gerado. */
export interface DreScenarioSummary {
    readonly tier: DreScenarioTier;
    readonly currency: string;
    readonly fiscalYear: number;
    /** Receita Bruta (R.1). */
    readonly grossRevenue: number;
    /** Deduções de receita (D.0), valor positivo. */
    readonly deductions: number;
    /** Receita Líquida (Receita Bruta − Deduções). */
    readonly netRevenue: number;
    /** Depreciação e Amortização (D.4). */
    readonly depreciation: number;
    /** Receitas Financeiras (R.9). */
    readonly financialIncome: number;
    /** Despesas Financeiras (D.8). */
    readonly financialExpense: number;
    /** Custo base usado como âncora de receita (informativo). */
    readonly costBase: number;
    /**
     * IR+CSLL (D.9). Calculado pelo motor da DRE depois (depende do LAIR
     * consolidado com os custos), por isso aqui fica `null`: o lançamento de
     * tributo NÃO é gerado por este módulo — ver {@link buildIrCsllEntry}.
     */
    readonly irCsll: number | null;
}

/** Saída do gerador: lançamentos + resumo, ambos frozen. */
export interface DreScenarioOutput {
    readonly tier: DreScenarioTier;
    readonly seed: number | string;
    /** Lançamentos de partida-dobrada (mesmo formato do adaptador de custos). */
    readonly entries: readonly JournalEntry[];
    /** Resumo numérico para inspeção/teste. */
    readonly summary: DreScenarioSummary;
}

// ----------------------------------------------------------------
// Contas da DRE alimentadas por este módulo (ver _chartOfAccountsPure).
// ----------------------------------------------------------------

const ACCOUNTS = Object.freeze({
    /** R.1 — Receita de Vendas/Serviços (operating). */
    revenue: 'R.1',
    /** R.9 — Receitas Financeiras (financing). */
    financeIncome: 'R.9',
    /** D.0 — Deduções de Receita (ICMS/ISS/PIS/COFINS). */
    deductions: 'D.0',
    /** D.4 — Depreciação e Amortização. */
    depreciation: 'D.4',
    /** D.8 — Despesas Financeiras (financing). */
    financeExpense: 'D.8',
    /** D.9 — IR e CSLL. */
    incomeTax: 'D.9',
    /** A.1 — Caixa e Equivalentes (contrapartida da receita / financeiras). */
    cash: 'A.1',
    /** A.2 — Clientes a Receber (contrapartida da receita a prazo). */
    receivables: 'A.2',
    /** A.3 — Imobilizado (crédito na depreciação acumulada — simplificado). */
    fixedAssets: 'A.3',
    /** P.1 — Fornecedores (contrapartida de deduções a recolher — simplificado). */
    suppliers: 'P.1',
    /** P.2 — Empréstimos (contrapartida de despesa financeira). */
    loans: 'P.2',
    /** P.3 — Tributos a Recolher (contrapartida de IR/CSLL e deduções). */
    taxesPayable: 'P.3',
});

// ----------------------------------------------------------------
// Perfis por tier — markup sobre custo + faixas + alíquotas.
// ----------------------------------------------------------------

interface DreTierProfile {
    /** Faixa de markup sobre o custo base (receita = custo × markup). */
    readonly markupMin: number;
    readonly markupMax: number;
    /** Faixa de receita ABSOLUTA quando não há costBase (BRL). */
    readonly absRevenueMin: number;
    readonly absRevenueMax: number;
    /** Faixa de alíquota efetiva de deduções sobre vendas (BR ~25-35%). */
    readonly deductionRateMin: number;
    readonly deductionRateMax: number;
    /** Depreciação como fração do CAPEX/imobilizado (linha reta ~10-20%/ano). */
    readonly depreciationRateMin: number;
    readonly depreciationRateMax: number;
    /** Receita financeira como fração da receita bruta (juros sobre caixa). */
    readonly financeIncomeRateMin: number;
    readonly financeIncomeRateMax: number;
    /** Despesa financeira como fração da receita bruta (juros sobre dívida). */
    readonly financeExpenseRateMin: number;
    readonly financeExpenseRateMax: number;
}

/** Alíquota combinada IRPJ (15% + adicional 10%) + CSLL (9%) — regime padrão BR. */
export const IR_CSLL_RATE = 0.34;

const TIER_PROFILES: Readonly<Record<DreScenarioTier, DreTierProfile>> = Object.freeze({
    gigante: Object.freeze({
        markupMin: 1.45,
        markupMax: 1.95,
        absRevenueMin: 2_000_000_000,
        absRevenueMax: 8_000_000_000,
        deductionRateMin: 0.27,
        deductionRateMax: 0.33,
        depreciationRateMin: 0.08,
        depreciationRateMax: 0.15,
        financeIncomeRateMin: 0.01,
        financeIncomeRateMax: 0.03,
        financeExpenseRateMin: 0.02,
        financeExpenseRateMax: 0.05,
    }),
    media: Object.freeze({
        markupMin: 1.35,
        markupMax: 1.85,
        absRevenueMin: 20_000_000,
        absRevenueMax: 120_000_000,
        deductionRateMin: 0.25,
        deductionRateMax: 0.32,
        depreciationRateMin: 0.1,
        depreciationRateMax: 0.18,
        financeIncomeRateMin: 0.005,
        financeIncomeRateMax: 0.025,
        financeExpenseRateMin: 0.02,
        financeExpenseRateMax: 0.06,
    }),
    pme: Object.freeze({
        markupMin: 1.3,
        markupMax: 1.7,
        absRevenueMin: 800_000,
        absRevenueMax: 12_000_000,
        deductionRateMin: 0.16,
        deductionRateMax: 0.27,
        depreciationRateMin: 0.1,
        depreciationRateMax: 0.2,
        financeIncomeRateMin: 0.003,
        financeIncomeRateMax: 0.015,
        financeExpenseRateMin: 0.03,
        financeExpenseRateMax: 0.08,
    }),
    catastrofe: Object.freeze({
        // Margem comprimida: receita pode ficar ABAIXO do custo → prejuízo.
        markupMin: 0.7,
        markupMax: 1.15,
        absRevenueMin: 1_000_000_000,
        absRevenueMax: 5_000_000_000,
        deductionRateMin: 0.27,
        deductionRateMax: 0.34,
        depreciationRateMin: 0.12,
        depreciationRateMax: 0.22,
        financeIncomeRateMin: 0.002,
        financeIncomeRateMax: 0.01,
        financeExpenseRateMin: 0.06,
        financeExpenseRateMax: 0.14,
    }),
});

const VALID_TIERS: ReadonlySet<DreScenarioTier> = new Set<DreScenarioTier>([
    'gigante',
    'media',
    'pme',
    'catastrofe',
]);

// ----------------------------------------------------------------
// Helpers puros.
// ----------------------------------------------------------------

/** Float aleatório uniforme em [min, max). */
function _randFloat(rng: () => number, min: number, max: number): number {
    return min + rng() * (max - min);
}

function _round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function _isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Constrói um lançamento balanceado de 2 postings (débito = crédito), frozen.
 * Mesmo formato que `_costEntryAdapterPure.makeEntry` para entrar no ledger.
 */
function _makeEntry(spec: {
    id: string;
    date: string;
    memo: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
    currency?: string;
}): JournalEntry {
    const amount = _round2(spec.amount);
    const postings: readonly Posting[] = Object.freeze([
        Object.freeze({ accountId: spec.debitAccount, debit: amount, credit: 0 }) as Posting,
        Object.freeze({ accountId: spec.creditAccount, debit: 0, credit: amount }) as Posting,
    ]);
    const entry: JournalEntry = {
        id: spec.id,
        date: spec.date,
        postings,
        memo: spec.memo,
        ...(spec.currency !== undefined ? { currency: spec.currency as never } : {}),
        posted: true,
    };
    return Object.freeze(entry);
}

// ----------------------------------------------------------------
// PUBLIC API.
// ----------------------------------------------------------------

/**
 * Gera o cenário financeiro (lado da RECEITA + tributos) que completa a DRE.
 *
 * Os lançamentos retornados devem ser CONCATENADOS aos lançamentos de custo
 * (`costRollupToJournalEntries`) antes de `buildLedger` — juntos fecham a DRE
 * completa.
 *
 * IR/CSLL NÃO é gerado aqui de forma cega: ele depende do LAIR consolidado (que
 * combina a receita gerada com os custos reais do modelo). Use
 * {@link buildIrCsllEntry} APÓS uma primeira passada da DRE (com LAIR>0) para
 * acrescentar o lançamento de tributo coerente. Quando não há `costBase`, o
 * resumo estima o tributo só para inspeção.
 *
 * @example
 *   generateDreScenario({ tier: 'media', seed: 7, costBase: 1_000_000, capexBase: 300_000 })
 *   → { entries: [R.1, D.0, D.4, R.9, D.8], summary: { grossRevenue, ... } }
 */
export function generateDreScenario(input: DreScenarioInput = {}): DreScenarioOutput {
    const tier: DreScenarioTier =
        input?.tier && VALID_TIERS.has(input.tier) ? input.tier : 'media';
    const currency =
        typeof input?.currency === 'string' && input.currency.length > 0 ? input.currency : 'BRL';
    const seed = input?.seed ?? 0;
    const idPrefix =
        typeof input?.idPrefix === 'string' && input.idPrefix.length > 0 ? input.idPrefix : 'dre';
    const profile = TIER_PROFILES[tier];

    const fiscalYear = _isFiniteNumber(input?.fiscalYear)
        ? Math.trunc(input.fiscalYear as number)
        : new Date().getFullYear();
    const date = `${fiscalYear}-12-31`;

    const costBase =
        _isFiniteNumber(input?.costBase) && (input.costBase as number) > 0
            ? (input.costBase as number)
            : 0;
    const capexBase =
        _isFiniteNumber(input?.capexBase) && (input.capexBase as number) >= 0
            ? (input.capexBase as number)
            : costBase * 0.4;

    // Stream determinístico dedicado (não colide com outros canais do random).
    const rng = createSeededRng(`${String(seed)}::dre::${tier}`);

    // --- Receita Bruta (R.1) -------------------------------------------------
    // Âncora preferencial: custo base × markup (mantém receita > custos típico).
    let grossRevenue: number;
    if (costBase > 0) {
        const markup = _randFloat(rng, profile.markupMin, profile.markupMax);
        grossRevenue = costBase * markup;
    } else {
        grossRevenue = _randFloat(rng, profile.absRevenueMin, profile.absRevenueMax);
    }
    grossRevenue = _round2(grossRevenue);

    // --- Deduções (D.0) — % realista da receita bruta (BR) -------------------
    const deductionRate = _randFloat(rng, profile.deductionRateMin, profile.deductionRateMax);
    const deductions = _round2(grossRevenue * deductionRate);

    // --- Depreciação / Amortização (D.4) — coerente com o imobilizado --------
    const depreciationRate = _randFloat(
        rng,
        profile.depreciationRateMin,
        profile.depreciationRateMax,
    );
    const depreciation = _round2(Math.max(0, capexBase) * depreciationRate);

    // --- Resultado financeiro (R.9 receita / D.8 despesa) — juros ------------
    const financeIncome = _round2(
        grossRevenue * _randFloat(rng, profile.financeIncomeRateMin, profile.financeIncomeRateMax),
    );
    const financeExpense = _round2(
        grossRevenue *
            _randFloat(rng, profile.financeExpenseRateMin, profile.financeExpenseRateMax),
    );

    const netRevenue = _round2(grossRevenue - deductions);

    const entries: JournalEntry[] = [];

    // R.1 — Receita Bruta: débito Clientes a Receber (A.2), crédito Receita (R.1).
    if (grossRevenue > 0) {
        entries.push(
            _makeEntry({
                id: `${idPrefix}:revenue:${fiscalYear}`,
                date,
                memo: 'Receita bruta de vendas/serviços (cenário random)',
                debitAccount: ACCOUNTS.receivables,
                creditAccount: ACCOUNTS.revenue,
                amount: grossRevenue,
                currency,
            }),
        );
    }

    // D.0 — Deduções: débito Deduções (D.0), crédito Tributos a Recolher (P.3).
    if (deductions > 0) {
        entries.push(
            _makeEntry({
                id: `${idPrefix}:deductions:${fiscalYear}`,
                date,
                memo: 'Deduções de receita (ICMS/ISS/PIS/COFINS)',
                debitAccount: ACCOUNTS.deductions,
                creditAccount: ACCOUNTS.taxesPayable,
                amount: deductions,
                currency,
            }),
        );
    }

    // D.4 — Depreciação: débito Depreciação (D.4), crédito Imobilizado (A.3).
    if (depreciation > 0) {
        entries.push(
            _makeEntry({
                id: `${idPrefix}:depreciation:${fiscalYear}`,
                date,
                memo: 'Depreciação e amortização do período',
                debitAccount: ACCOUNTS.depreciation,
                creditAccount: ACCOUNTS.fixedAssets,
                amount: depreciation,
                currency,
            }),
        );
    }

    // R.9 — Receitas financeiras: débito Caixa (A.1), crédito Receitas Fin. (R.9).
    if (financeIncome > 0) {
        entries.push(
            _makeEntry({
                id: `${idPrefix}:finance-income:${fiscalYear}`,
                date,
                memo: 'Receitas financeiras (juros sobre aplicações)',
                debitAccount: ACCOUNTS.cash,
                creditAccount: ACCOUNTS.financeIncome,
                amount: financeIncome,
                currency,
            }),
        );
    }

    // D.8 — Despesas financeiras: débito Despesas Fin. (D.8), crédito Empréstimos (P.2).
    if (financeExpense > 0) {
        entries.push(
            _makeEntry({
                id: `${idPrefix}:finance-expense:${fiscalYear}`,
                date,
                memo: 'Despesas financeiras (juros sobre dívida)',
                debitAccount: ACCOUNTS.financeExpense,
                creditAccount: ACCOUNTS.loans,
                amount: financeExpense,
                currency,
            }),
        );
    }

    // Estimativa de IR/CSLL só para o resumo (lançamento real vem de
    // buildIrCsllEntry após a 1ª passada da DRE com o LAIR consolidado).
    let irCsllEstimate: number | null = null;
    if (costBase > 0) {
        // LAIR aproximado = ReceitaLíquida − custos − depreciação + resultado fin.
        const approxLair =
            netRevenue - costBase - depreciation + (financeIncome - financeExpense);
        irCsllEstimate = approxLair > 0 ? _round2(approxLair * IR_CSLL_RATE) : 0;
    }

    const summary: DreScenarioSummary = Object.freeze({
        tier,
        currency,
        fiscalYear,
        grossRevenue,
        deductions,
        netRevenue,
        depreciation,
        financialIncome: financeIncome,
        financialExpense: financeExpense,
        costBase,
        irCsll: irCsllEstimate,
    });

    return Object.freeze({
        tier,
        seed,
        entries: Object.freeze(entries),
        summary,
    });
}

/**
 * Constrói o lançamento de IR+CSLL (D.9) a partir do LAIR já consolidado
 * (Resultado antes dos Tributos da DRE, combinando receita gerada + custos
 * reais). Só gera lançamento quando há LUCRO (`lair > 0`); prejuízo → `null`
 * (não há tributo a recolher no regime simplificado deste cenário).
 *
 * Débito IR e CSLL (D.9), crédito Tributos a Recolher (P.3).
 *
 * @param lair - Resultado antes dos tributos (linha 'lair' da DRE BR).
 * @param opts - Ano fiscal, alíquota (default {@link IR_CSLL_RATE}), prefixo, moeda.
 * @returns Um {@link JournalEntry} frozen, ou `null` se `lair <= 0`.
 */
export function buildIrCsllEntry(
    lair: number,
    opts: {
        readonly fiscalYear?: number;
        readonly rate?: number;
        readonly idPrefix?: string;
        readonly currency?: string;
    } = {},
): JournalEntry | null {
    if (!_isFiniteNumber(lair) || lair <= 0) return null;
    const rate = _isFiniteNumber(opts.rate) && (opts.rate as number) >= 0 ? (opts.rate as number) : IR_CSLL_RATE;
    const amount = _round2(lair * rate);
    if (amount <= 0) return null;
    const fiscalYear = _isFiniteNumber(opts.fiscalYear)
        ? Math.trunc(opts.fiscalYear as number)
        : new Date().getFullYear();
    const idPrefix =
        typeof opts.idPrefix === 'string' && opts.idPrefix.length > 0 ? opts.idPrefix : 'dre';
    const currency =
        typeof opts.currency === 'string' && opts.currency.length > 0 ? opts.currency : 'BRL';
    return _makeEntry({
        id: `${idPrefix}:ir-csll:${fiscalYear}`,
        date: `${fiscalYear}-12-31`,
        memo: 'IR e CSLL sobre o lucro do período',
        debitAccount: ACCOUNTS.incomeTax,
        creditAccount: ACCOUNTS.taxesPayable,
        amount,
        currency,
    });
}

/** Lista os 4 tiers canônicos (útil para UI/menu). */
export function listDreScenarioTiers(): readonly DreScenarioTier[] {
    return Object.freeze<DreScenarioTier[]>(['gigante', 'media', 'pme', 'catastrofe']);
}
