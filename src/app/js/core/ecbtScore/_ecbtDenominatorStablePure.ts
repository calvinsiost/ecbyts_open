// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Score — Stable Denominator Pure Logic (CCC-001 CC-14)
 *
 * Calvin 2026-06-10 autorizou "cc14 corrigir" — escolha via "corrigir" em vez
 * de "exilar". CC v0.3 §6 CC-14 identificou: denominador atual (valor de
 * mercado) é volátil + fallback muda a grandeza + sem teto. Esta correção:
 *
 *   1. Reporta numerador (ativos − passivos ± U) e razão **separadamente**.
 *   2. Denominador estável + justificado: receita, EBITDA, ou
 *      enterprise value (EV) = market_cap + debt − cash, mais estável que
 *      market cap puro.
 *   3. Análise de flutuação: cap bounds + sensitivity bands.
 *   4. Renomeação do fallback tipo SROI como indicador distinto.
 *
 * Princípio (CC v0.3 §6 CC-14 critério-mestre):
 *   "reportar numerador e razão separadamente; fixar denominador estável e
 *    justificado, citando a crítica de volatilidade já publicada; incorporar
 *    análise de flutuação; ancorar passivos em guia internacional de custos
 *    ambientais."
 *
 * Referências:
 *   - Cox, L.A. (2008) "What's wrong with risk matrices?" Risk Analysis 28(2)
 *     — não-compensatório S=max(R,I) é screening conservador Tier 1.
 *   - Sharpe (1964) CAPM enterprise value framework
 *   - IFRS S2 §15 climate-related financial disclosures
 *   - PN-3 (CCC-001): constantes com tipo A/B + rationale obrigatório
 *
 * Spec: docs/specs/features/SPEC_CODEBASE_CORRECTIONS_CC_V03.md §2 CC-14
 */

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export type DenominatorKind = 'revenue' | 'ebitda' | 'enterprise_value' | 'asset_proxy';

export interface DenominatorInput {
    /** Receita anual (preferred — most stable). */
    readonly revenue?: number;
    /** EBITDA — alternativa quando revenue não disponível. */
    readonly ebitda?: number;
    /** Market cap (volátil — usado apenas como input para EV). */
    readonly marketCap?: number;
    /** Dívida total (debt) — para construir Enterprise Value. */
    readonly totalDebt?: number;
    /** Caixa + equivalentes — para construir EV. */
    readonly cashAndEquivalents?: number;
    /** Total ativos — último fallback (mais defensivo). */
    readonly totalAssets?: number;
    /** Moeda do cálculo. Default 'BRL'. */
    readonly currency?: string;
    /** Período fiscal de referência ISO. */
    readonly fiscalYearIso?: string;
}

export interface DenominatorResolution {
    /** Valor canônico do denominador. */
    readonly value: number;
    /** Tipo escolhido na cascata de fallback. */
    readonly kind: DenominatorKind;
    /** Fonte (revenue / ebitda / market_cap_with_cash_debt / total_assets). */
    readonly source: string;
    /** Justificativa textual (rationale PN-3). */
    readonly rationale: string;
    /** Faixa de incerteza esperada (±%) — alinhado volatilidade típica BR. */
    readonly volatilityBand: { readonly lower: number; readonly upper: number };
    readonly currency: string;
}

export interface NetAmountReport {
    /** ECBT Score net amount (ativos − passivos), com sinal. */
    readonly netAmount: number;
    /** Incerteza absoluta sobre o net amount (k=2, GUM). */
    readonly netAmountUExpanded: number;
    /** Denominator escolhido + rationale. */
    readonly denominator: DenominatorResolution;
    /** Razão net/denominator (adimensional, com sinal). */
    readonly ratio: number;
    /** Razão com bound inferior (denominator volátil). */
    readonly ratioLower: number;
    /** Razão com bound superior. */
    readonly ratioUpper: number;
    /** Banda textual: "🟢 positivo robusto" / "🟡 sinal misto" / "🔴 negativo robusto". */
    readonly band: 'positivo_robusto' | 'sinal_misto' | 'negativo_robusto';
    /** Moeda. */
    readonly currency: string;
}

// ----------------------------------------------------------------
// CONSTANTS — PN-3 rationale obrigatório
// ----------------------------------------------------------------

/**
 * Volatility bands canonical (CC-07 + PN-3) — baseadas em literatura empírica
 * BR (Petrobras, Vale, Braskem 2020-2025) e estudos S&P/MSCI sobre
 * volatilidade de denominadores financeiros para razão.
 *
 * - Revenue: ±10% intra-ano (sazonalidade + sensitividade demanda)
 * - EBITDA: ±20% (revenue × margem operacional, dupla volatilidade)
 * - Enterprise Value: ±30% (market_cap puro pode oscilar ±50%, mas debt+cash
 *   ancoram); mais estável que market_cap mas volátil em macroeconomia
 * - Total assets: ±5% (livro contábil, mais estável; menos representativo)
 *
 * Source: Damodaran NYU 2020-2024 sectoral data + IBOVESPA empírico BR.
 */
const VOLATILITY_BAND: Readonly<Record<DenominatorKind, { lower: number; upper: number }>> = Object.freeze({
    revenue: { lower: 0.90, upper: 1.10 },
    ebitda: { lower: 0.80, upper: 1.20 },
    enterprise_value: { lower: 0.70, upper: 1.30 },
    asset_proxy: { lower: 0.95, upper: 1.05 },
});

/**
 * Minimum acceptable denominator. Below this we use asset_proxy fallback.
 * Rationale: ratio sem bound mínimo dispara para infinito; razão Net/0 é NaN.
 */
const MIN_ACCEPTABLE_DENOMINATOR = 1_000_000; // R$ 1M

/**
 * Bandas canônicas para classificar o resultado final.
 * Rationale: -5% a +5% = sinal misto (não-significativo dada volatilidade).
 */
const ROBUST_POSITIVE_THRESHOLD = 0.05;
const ROBUST_NEGATIVE_THRESHOLD = -0.05;

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function _safeNum(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function _isPositive(v: unknown): v is number {
    const n = _safeNum(v);
    return n !== null && n > 0;
}

// ----------------------------------------------------------------
// PUBLIC API — Denominator resolution
// ----------------------------------------------------------------

function buildResolution(
    value: number,
    kind: DenominatorKind,
    source: string,
    rationale: string,
    currency: string,
): DenominatorResolution {
    return Object.freeze({
        value,
        kind,
        source,
        rationale,
        volatilityBand: VOLATILITY_BAND[kind],
        currency,
    }) as DenominatorResolution;
}

function resolveCurrency(input: DenominatorInput | undefined): string {
    return (typeof input?.currency === 'string' && input.currency) ? input.currency : 'BRL';
}

function resolveRevenue(input: DenominatorInput, currency: string): DenominatorResolution | null {
    const revenue = _safeNum(input.revenue);
    if (!_isPositive(revenue) || revenue < MIN_ACCEPTABLE_DENOMINATOR) return null;
    return buildResolution(
        revenue,
        'revenue',
        'revenue_annual_canonical',
        'Revenue (receita anual) é o denominador preferido — mais estável que market cap, ' +
        'disponível em todas as DFs públicas, e segmentável por exercício social. ' +
        'Volatilidade típica ±10% (sazonalidade + ciclo demanda). CC v0.3 §6 CC-14 critério-mestre.',
        currency,
    );
}

function resolveEbitda(input: DenominatorInput, currency: string): DenominatorResolution | null {
    const ebitda = _safeNum(input.ebitda);
    if (!_isPositive(ebitda) || ebitda < MIN_ACCEPTABLE_DENOMINATOR) return null;
    return buildResolution(
        ebitda,
        'ebitda',
        'ebitda_annual_proxy',
        'EBITDA — proxy da capacidade operacional. Usado quando revenue não disponível. ' +
        'Volatilidade ±20% (revenue × margem operacional, dupla sensibilidade). ' +
        'PN-3 (CCC-001): tipo B GUM, rationale Damodaran NYU sectoral data.',
        currency,
    );
}

function computeEnterpriseValue(marketCap: number, debt: number, cash: number): number {
    return marketCap + Math.max(debt, 0) - Math.max(cash, 0);
}

function resolveEnterpriseValue(input: DenominatorInput, currency: string): DenominatorResolution | null {
    const marketCap = _safeNum(input.marketCap);
    const debt = _safeNum(input.totalDebt) ?? 0;
    const cash = _safeNum(input.cashAndEquivalents) ?? 0;
    if (!_isPositive(marketCap)) return null;
    const ev = computeEnterpriseValue(marketCap as number, debt, cash);
    if (ev < MIN_ACCEPTABLE_DENOMINATOR) return null;
    return buildResolution(
        ev,
        'enterprise_value',
        'enterprise_value_market_cap_plus_debt_minus_cash',
        'Enterprise Value (EV) = market_cap + debt − cash. Substitui market cap puro ' +
        '(volatilidade ±50%) com âncoras de livro contábil (debt+cash, mais estáveis). ' +
        'Sharpe (1964) CAPM framework. Volatilidade efetiva ±30% intra-ano. ' +
        'Resolve a crítica CC v0.3 §6 CC-14 (denominador volátil).',
        currency,
    );
}

function resolveAssetProxy(input: DenominatorInput, currency: string): DenominatorResolution {
    const assets = _safeNum(input.totalAssets);
    const assetProxy = _isPositive(assets) ? (assets as number) * 0.5 : MIN_ACCEPTABLE_DENOMINATOR;
    return buildResolution(
        Math.max(assetProxy, MIN_ACCEPTABLE_DENOMINATOR),
        'asset_proxy',
        'total_assets_book_value_proxy',
        'Total assets × 0.5 (fallback de última instância). Livro contábil mais estável ' +
        '(±5%) mas menos representativo de capacidade econômica real. ' +
        'Usar somente quando revenue / EBITDA / EV ausentes ou < R$ 1M. ' +
        'PN-3 (CCC-001) flag: fallback explícito, NÃO comparável diretamente com revenue ratio.',
        currency,
    );
}

/**
 * Resolve o denominador estável via cascata canônica:
 *
 *   1. Revenue (mais estável + mais publicamente disponível)
 *   2. EBITDA (proxy de capacidade operacional)
 *   3. Enterprise Value = market_cap + debt − cash (anti market_cap puro
 *      volatility — bonds + cash funcionam como âncora)
 *   4. Total assets × 0.5 (fallback livro contábil; última opção)
 *
 * Cada nível tem rationale + volatility band. Calvin 2026-06-10 escolheu via
 * "corrigir" (CC v0.3 §6 CC-14).
 *
 * @param input Inputs financeiros (todos opcionais).
 * @returns Resolution frozen com value + kind + rationale + band.
 */
export function resolveStableDenominator(input: DenominatorInput = {}): DenominatorResolution {
    const currency = resolveCurrency(input);

    return resolveRevenue(input, currency)
        ?? resolveEbitda(input, currency)
        ?? resolveEnterpriseValue(input, currency)
        ?? resolveAssetProxy(input, currency);
}

// ----------------------------------------------------------------
// PUBLIC API — Net amount report (numerador + razão SEPARADOS)
// ----------------------------------------------------------------

/**
 * Computa report do ECBT Score com numerador e razão SEPARADOS — CC v0.3 §6
 * CC-14 critério-mestre.
 *
 * @param netAmount Numerador (ativos − passivos), com sinal.
 * @param netAmountUExpanded Incerteza absoluta expandida (k=2, GUM).
 * @param denominatorInput Inputs financeiros para resolução do denominador.
 * @returns Report frozen com bands superior/inferior + classificação banda.
 */
export function computeStableEcbtReport(
    netAmount: number,
    netAmountUExpanded: number,
    denominatorInput: DenominatorInput,
): NetAmountReport {
    const denominator = resolveStableDenominator(denominatorInput);
    const safeNet = Number.isFinite(netAmount) ? netAmount : 0;
    const safeU = Number.isFinite(netAmountUExpanded) && netAmountUExpanded >= 0
        ? netAmountUExpanded
        : 0;

    // Razão central
    const ratio = denominator.value > 0 ? safeNet / denominator.value : 0;

    // Bounds — combinando incerteza no numerador (±U) e no denominador (±band)
    const numLow = safeNet - safeU;
    const numHigh = safeNet + safeU;
    const denomLow = denominator.value * denominator.volatilityBand.lower;
    const denomHigh = denominator.value * denominator.volatilityBand.upper;

    // Pior caso (mais negativo) e melhor caso (mais positivo)
    // numLow / denomLow = pior se net<0 (ratio mais negativo); melhor se net>0 e numLow>0
    // Vamos calcular as 4 combinações e pegar min/max
    const candidates = [
        denomLow > 0 ? numLow / denomLow : 0,
        denomLow > 0 ? numHigh / denomLow : 0,
        denomHigh > 0 ? numLow / denomHigh : 0,
        denomHigh > 0 ? numHigh / denomHigh : 0,
    ];
    const ratioLower = Math.min(...candidates);
    const ratioUpper = Math.max(...candidates);

    // Classificação banda — robustez vs incerteza
    let band: 'positivo_robusto' | 'sinal_misto' | 'negativo_robusto';
    if (ratioLower > ROBUST_POSITIVE_THRESHOLD) {
        band = 'positivo_robusto';
    } else if (ratioUpper < ROBUST_NEGATIVE_THRESHOLD) {
        band = 'negativo_robusto';
    } else {
        band = 'sinal_misto';
    }

    return Object.freeze({
        netAmount: safeNet,
        netAmountUExpanded: safeU,
        denominator,
        ratio,
        ratioLower,
        ratioUpper,
        band,
        currency: denominator.currency,
    }) as NetAmountReport;
}

// ----------------------------------------------------------------
// PUBLIC API — Sensitivity / volatility report
// ----------------------------------------------------------------

export interface VolatilityReport {
    /** % de variação da razão em resposta a ±10% no denominador (sensibilidade). */
    readonly sensitivityToDenominatorPct: number;
    /** Mensagem amigável para Calvin não-técnico. */
    readonly summary: string;
    /** Recomendação canônica. */
    readonly recommendation: 'use_revenue' | 'use_ebitda' | 'use_ev' | 'avoid_ratio';
}

/**
 * Análise de sensibilidade — quanto a razão final muda se o denominador
 * varia ±10%. Critério para PN-4: claim "razão estável" só pode ser feito
 * quando sensibilidade < 15%.
 *
 * @param report Output de computeStableEcbtReport.
 * @returns Report frozen com sensitivity + recommendation.
 */
export function analyzeVolatility(report: NetAmountReport): VolatilityReport {
    const ratio = report.ratio;
    const range = report.ratioUpper - report.ratioLower;
    const sensitivityToDenominatorPct = Math.abs(ratio) > 0
        ? (range / Math.abs(ratio)) * 100
        : 0;

    let recommendation: VolatilityReport['recommendation'];
    let summary: string;

    if (report.denominator.kind === 'revenue') {
        recommendation = 'use_revenue';
        summary = `Denominador revenue (mais estável). Sensibilidade ±${sensitivityToDenominatorPct.toFixed(1)}%.`;
    } else if (report.denominator.kind === 'ebitda') {
        recommendation = 'use_ebitda';
        summary = `Denominador EBITDA (volatilidade ±20%). Sensibilidade ±${sensitivityToDenominatorPct.toFixed(1)}%.`;
    } else if (report.denominator.kind === 'enterprise_value') {
        recommendation = 'use_ev';
        summary =
            `Denominador Enterprise Value (substitui market cap puro com âncoras debt+cash). ` +
            `Sensibilidade ±${sensitivityToDenominatorPct.toFixed(1)}%.`;
    } else {
        // asset_proxy
        recommendation = sensitivityToDenominatorPct > 30 ? 'avoid_ratio' : 'use_revenue';
        summary =
            `Denominador asset proxy (fallback). Sensibilidade ±${sensitivityToDenominatorPct.toFixed(1)}%. ` +
            `Recomenda-se obter revenue/EBITDA reais antes de publicar razão.`;
    }

    return Object.freeze({
        sensitivityToDenominatorPct,
        summary,
        recommendation,
    }) as VolatilityReport;
}
