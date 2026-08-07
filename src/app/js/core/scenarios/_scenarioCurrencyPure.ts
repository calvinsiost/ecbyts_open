// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO CURRENCY CONVERSION — pure-logic (CFG-15, TEMA E).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-15 — "Conversão de moeda na série temporal (hoje moeda única).
       Permite FIXAR A MOEDA DE SAÍDA e converter fluxos por uma taxa de câmbio
       configurável (curada, não palpite). Testável: saída em USD com câmbio
       definido → valores convertidos coerentes."
     - §5.2 (b)/(c) — o que é fluxo FÍSICO e o que é fluxo ECONÔMICO.

   O QUE FALTAVA (verificado no código antes de escrever): a série temporal de
   `_scenarioProjectionPure.ts` produz CAPEX/OPEX/ECBT ano a ano e os NPVs sem
   nenhuma noção de moeda — o número é implicitamente BRL porque os custos que
   entram são BRL. Não havia como declarar "quero esta série em USD", e não havia
   onde pendurar um câmbio. Este módulo abre exatamente isso.

   ─── A REGRA QUE GOVERNA O MÓDULO (N3, sem exceção) ───

   Pedir conversão SEM informar câmbio devolve `semDado` — NUNCA um 1:1 mudo.
   Converter 1:1 por falta de taxa seria a pior fabricação possível: o número
   sairia com a etiqueta "USD" e o valor de BRL, e ninguém veria o erro. Por isso
   o estado da conversão é TRIPLO, não booleano:

     'identity' → não há o que converter (moeda de saída = moeda de entrada).
                  O valor passa pelo MESMO double, sem multiplicação.
     'active'   → há câmbio utilizável; o valor é multiplicado pelo câmbio do ano.
     'semDado'  → conversão PEDIDA e câmbio AUSENTE/inválido ⇒ valor `null`.

   O terceiro estado é o item: `null` é a resposta honesta, e ela se propaga para
   a série e para o NPV em vez de virar um número plausível e errado.

   ─── Câmbio FIXO ou POR ANO (os dois que o item pede) ───

   `rate` é o câmbio único do horizonte; `ratesByYear` é a cotação ano a ano
   (`[{ year, rate }]`, a mesma forma de `GrowthPhase[]` do CFG-10). Os dois
   convivem: o câmbio por ano vence no ano que ele cobre, e o fixo — quando
   informado — é o FALLBACK DECLARADO PELO USUÁRIO para os anos descobertos.

   NÃO há forward-fill: um ano sem cotação e sem câmbio fixo é `semDado`, não
   herda a cotação do ano anterior. Repetir a última cotação é uma PREMISSA
   ("o câmbio fica parado"), e premissa que o usuário não declarou este módulo
   não inventa (N3). O usuário que quiser esse comportamento declara o câmbio
   fixo — aí a premissa é dele, explícita e auditável.

   ─── Faixa validada: por que o câmbio é CHECADO, não CLAMPADO ───

   As outras faixas do Tema E (CFG-13 declínio, CFG-14 inflação) são parâmetros
   de POLÍTICA: têm banda defensável e valor fora dela é clampado. Câmbio não é
   política, é grandeza OBSERVADA de mercado, e cotações reais varrem ordens de
   grandeza (1 USD ≈ 150 JPY; moeda em hiperinflação vai a 1e6). Inventar um teto
   "razoável" corromperia silenciosamente uma cotação legítima — exatamente o
   dano que o item manda evitar. Então a validação aqui é de DOMÍNIO, não de
   banda: câmbio precisa ser finito e ESTRITAMENTE POSITIVO (0 zeraria a série;
   negativo inverteria o sinal de todos os fluxos). Fora do domínio é REJEITADO
   para `semDado` — nunca ajustado para dentro de um limite arbitrário.

   A metade "curada" do guard-rail §2.4.0 #1 está na MOEDA: as moedas vêm do
   catálogo ISO 4217 abaixo, e código fora dele não vira moeda (N8 — sem folha
   em branco).

   ─── O que NÃO se converte (§5.2 b) ───

   Câmbio só toca fluxo ECONÔMICO. O driver A(t) e a série ambiental/ODS são
   grandezas FÍSICAS (m³, t, kWh, tCO₂e): passam intactas. Converter uma tonelada
   de rejeito por câmbio seria erro de dimensão, não de arredondamento.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

import { declineDiscountFactor } from './_scenarioDiscountDeclinePure.js';
import type { ResolvedDiscountDecline } from './_scenarioDiscountDeclinePure.js';
import type {
    ScenarioPairTimeSeries,
    ScenarioTimeSeries,
    YearDelta,
    YearValue,
} from './_scenarioProjectionPure.js';

// ───────────────────────────── Catálogo curado ─────────────────────────────

/** Uma moeda do catálogo curado, citável (N8: o usuário escolhe, não digita). */
export interface CurrencyDef {
    /** Código ISO 4217 alfabético (ex.: 'BRL'). */
    readonly code: string;
    /** Nome da moeda, para rótulo. */
    readonly name: string;
    /**
     * Símbolo de exibição. CONVENÇÃO de uso, não parte da ISO 4217 — a norma
     * define código e unidade menor; o símbolo é prática de mercado.
     */
    readonly symbol: string;
    /** Casas decimais (unidade menor) da ISO 4217 — CLP tem 0, não 2. */
    readonly decimals: number;
    /** Fonte citável do código e das casas decimais. Nunca ''. */
    readonly source: string;
}

const ISO_4217 = 'ISO 4217 (códigos de moeda e unidades menores) — https://www.iso.org/iso-4217-currency-codes.html';

function currency(code: string, name: string, symbol: string, decimals: number): CurrencyDef {
    return Object.freeze({ code, name, symbol, decimals, source: ISO_4217 });
}

/**
 * Moedas curadas. A seleção segue o DOMÍNIO da feature (mineração e ambiental
 * com operação internacional), não uma lista arbitrária: BRL é a moeda de
 * origem dos custos; USD/EUR/GBP são as de reporte; AUD/CAD/CLP/ZAR são as
 * jurisdições mineradoras que a própria spec cita (a §2.4 CFG-20 usa "mineradora
 * australiana" como caso). Ampliar = acrescentar aqui, curado e versionado.
 * Congelado.
 */
export const CURATED_CURRENCIES: Readonly<Record<string, CurrencyDef>> = Object.freeze({
    BRL: currency('BRL', 'Real brasileiro', 'R$', 2),
    USD: currency('USD', 'Dólar dos Estados Unidos', 'US$', 2),
    EUR: currency('EUR', 'Euro', '€', 2),
    GBP: currency('GBP', 'Libra esterlina', '£', 2),
    AUD: currency('AUD', 'Dólar australiano', 'A$', 2),
    CAD: currency('CAD', 'Dólar canadense', 'C$', 2),
    CLP: currency('CLP', 'Peso chileno', '$', 0),
    ZAR: currency('ZAR', 'Rand sul-africano', 'R', 2),
});

/** Versão do catálogo curado — trilha de auditoria de qualquer curadoria (N9). */
export const CURRENCY_CATALOG_VERSION = 1;

/** Moeda default: BRL — a moeda em que os custos do processo já estão hoje. */
export const DEFAULT_CURRENCY_CODE = 'BRL';

/**
 * Resolve um código para a moeda curada correspondente.
 *
 * Aceita o código em qualquer caixa ('usd' → USD) porque isso é normalização de
 * escrita, não invenção de dado. Código desconhecido devolve `null` — o módulo
 * jamais fabrica uma moeda que não está no catálogo (N8).
 *
 * @param code - Código ISO 4217 alfabético pedido pelo chamador.
 * @returns A {@link CurrencyDef} curada, ou `null` se o código não é do catálogo.
 */
export function resolveCurrency(code?: string | null): CurrencyDef | null {
    if (typeof code !== 'string') return null;
    const key = code.trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(CURATED_CURRENCIES, key)
        ? (CURATED_CURRENCIES[key] as CurrencyDef)
        : null;
}

// ───────────────────────────── Tipos da conversão ─────────────────────────────

/**
 * Estado da conversão. Triplo de propósito: `identity` e `semDado` são coisas
 * DIFERENTES, e confundi-las é justamente o bug que o item proíbe.
 */
export type CurrencyConversionStatus = 'identity' | 'active' | 'semDado';

/** Cotação de UM ano (mesma forma de `GrowthPhase` do CFG-10). */
export interface CurrencyRatePoint {
    /** Ano da cotação (inteiro). */
    readonly year: number;
    /** Câmbio daquele ano: quantas unidades de `to` valem 1 de `from`. */
    readonly rate: number;
}

/** Pedido de conversão do cenário (CFG-15). */
export interface CurrencyConversionSpec {
    /** Moeda de ENTRADA dos fluxos. Default BRL (a moeda dos custos de hoje). */
    readonly from?: string | undefined;
    /** Moeda de SAÍDA desejada. Ausente ou igual a `from` ⇒ nada a converter. */
    readonly to?: string | undefined;
    /**
     * Câmbio FIXO do horizonte: quantas unidades de `to` valem 1 de `from`.
     * Também é o fallback DECLARADO para anos sem cotação própria.
     */
    readonly rate?: number | undefined;
    /**
     * Câmbio POR ANO. Vence o fixo no ano que cobre. Anos descobertos NÃO
     * herdam a cotação anterior (ver cabeçalho): caem no fixo, ou em `semDado`.
     */
    readonly ratesByYear?: ReadonlyArray<CurrencyRatePoint> | undefined;
}

/** Conversão resolvida — tudo o que foi aplicado, e tudo o que foi recusado. */
export interface ResolvedCurrencyConversion {
    /** `identity` (nada a converter) · `active` (converte) · `semDado` (N3). */
    readonly status: CurrencyConversionStatus;
    /** Moeda de entrada resolvida (o default quando o pedido não era do catálogo). */
    readonly from: CurrencyDef;
    /** Moeda de saída resolvida; igual a `from` quando não há conversão. */
    readonly to: CurrencyDef;
    /** Câmbio fixo válido, ou `null` quando não houve um utilizável. */
    readonly rate: number | null;
    /** Cotações por ano já validadas e ordenadas por ano (pode ser vazia). */
    readonly byYear: readonly CurrencyRatePoint[];
    /** `true` quando há ao menos uma cotação anual utilizável. */
    readonly perYear: boolean;
    /** Código de entrada pedido; `null` quando não pediu (auditoria). */
    readonly requestedFrom: string | null;
    /** Código de saída pedido; `null` quando não pediu (auditoria). */
    readonly requestedTo: string | null;
    /** Câmbio fixo pedido; `null` quando não pediu (auditoria). */
    readonly requestedRate: number | null;
    /** `true` quando um código pedido não está no catálogo curado (N8 visível). */
    readonly unknownCurrency: boolean;
    /** Quantas cotações anuais foram RECUSADAS por sair do domínio (auditoria). */
    readonly rejectedRates: number;
}

// ───────────────────────────── Resolução ─────────────────────────────

/** Domínio do câmbio: finito e estritamente positivo (ver cabeçalho). */
function usableRate(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

function usableYear(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
}

/**
 * Valida as cotações anuais: ano finito + câmbio no domínio. Entradas fora do
 * domínio são CONTADAS (`rejectedRates`), nunca corrigidas para um valor
 * plausível. Ano repetido: a ÚLTIMA ocorrência vence, e a ordenação de saída é
 * por ano — determinismo independente da ordem em que o chamador escreveu.
 */
function resolveRatesByYear(
    points: ReadonlyArray<CurrencyRatePoint> | undefined,
): { readonly byYear: readonly CurrencyRatePoint[]; readonly rejected: number } {
    if (!Array.isArray(points) || points.length === 0) {
        return { byYear: Object.freeze([]) as readonly CurrencyRatePoint[], rejected: 0 };
    }
    const map = new Map<number, number>();
    let rejected = 0;
    for (const p of points) {
        const year = p === null || typeof p !== 'object' ? null : usableYear(p.year);
        const rate = p === null || typeof p !== 'object' ? null : usableRate(p.rate);
        if (year === null || rate === null) {
            rejected += 1;
            continue;
        }
        map.set(year, rate);
    }
    const byYear = [...map.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([year, rate]) => Object.freeze({ year, rate }));
    return { byYear: Object.freeze(byYear) as readonly CurrencyRatePoint[], rejected };
}

/**
 * Resolve o pedido de conversão de moeda do cenário (CFG-15).
 *
 * Regras, na ordem:
 *  1. moeda de saída ausente, desconhecida ou IGUAL à de entrada ⇒ `identity`
 *     (nada a converter; os valores passam pelo mesmo double);
 *  2. conversão pedida COM câmbio utilizável (fixo e/ou por ano) ⇒ `active`;
 *  3. conversão pedida SEM nenhum câmbio utilizável ⇒ `semDado` — o item, e a
 *     razão de o retorno de {@link convertAmount} ser `null` e não o original.
 *
 * @param spec - Moedas e câmbio (fixo e/ou por ano) pedidos pelo chamador.
 * @returns {@link ResolvedCurrencyConversion} congelada, com o recusado visível.
 */
export function resolveCurrencyConversion(
    spec?: CurrencyConversionSpec | undefined,
): ResolvedCurrencyConversion {
    const requestedFrom = typeof spec?.from === 'string' ? spec.from : null;
    const requestedTo = typeof spec?.to === 'string' ? spec.to : null;
    const fromDef = resolveCurrency(spec?.from) ?? (CURATED_CURRENCIES[DEFAULT_CURRENCY_CODE] as CurrencyDef);
    const toDef = resolveCurrency(spec?.to);
    const unknownCurrency =
        (requestedFrom !== null && resolveCurrency(requestedFrom) === null) ||
        (requestedTo !== null && toDef === null);

    const requestedRate = typeof spec?.rate === 'number' ? spec.rate : null;
    const fixed = usableRate(spec?.rate);
    const { byYear, rejected } = resolveRatesByYear(spec?.ratesByYear);

    // (1) Nada a converter: sem destino, destino fora do catálogo, ou o mesmo
    //     código. O câmbio informado fica REGISTRADO, mas não é aplicado — não
    //     há conversão a fazer entre uma moeda e ela mesma.
    if (toDef === null || toDef.code === fromDef.code) {
        return Object.freeze({
            status: 'identity' as const,
            from: fromDef,
            to: fromDef,
            rate: null,
            byYear: Object.freeze([]) as readonly CurrencyRatePoint[],
            perYear: false,
            requestedFrom,
            requestedTo,
            requestedRate,
            unknownCurrency,
            rejectedRates: rejected,
        });
    }

    // (2)/(3) Conversão pedida: só é `active` com câmbio utilizável.
    const hasRate = fixed !== null || byYear.length > 0;
    return Object.freeze({
        status: (hasRate ? 'active' : 'semDado') as CurrencyConversionStatus,
        from: fromDef,
        to: toDef,
        rate: fixed,
        byYear,
        perYear: byYear.length > 0,
        requestedFrom,
        requestedTo,
        requestedRate,
        unknownCurrency,
        rejectedRates: rejected,
    });
}

// ───────────────────────────── Aplicação ─────────────────────────────

/**
 * Câmbio aplicável a um ano: cotação do ano, senão o câmbio fixo declarado,
 * senão `null`. Sem ano informado só o fixo serve — escolher uma cotação
 * qualquer da lista seria adivinhar.
 *
 * `identity` devolve 1 (é o câmbio de uma moeda para ela mesma, e serve para a
 * tela exibir); `semDado` devolve `null`.
 *
 * @param conversion - Conversão já resolvida por {@link resolveCurrencyConversion}.
 * @param year - Ano do fluxo; omitido = só o câmbio fixo se aplica.
 * @returns O câmbio daquele ano, ou `null` quando não há um honesto.
 */
export function exchangeRateAt(
    conversion: ResolvedCurrencyConversion,
    year?: number | undefined,
): number | null {
    if (conversion.status === 'identity') return 1;
    if (conversion.status === 'semDado') return null;
    const y = usableYear(year);
    if (y !== null) {
        for (const p of conversion.byYear) {
            if (p.year === y) return p.rate;
        }
    }
    return conversion.rate;
}

/**
 * Converte UM valor monetário para a moeda de saída.
 *
 * `identity` devolve o MESMO double (sem multiplicar por 1 — a igualdade é
 * estrutural, como o curto-circuito de Fisher do CFG-14). `semDado`, ou ano sem
 * câmbio, devolve `null`: a conversão que não pode ser feita não é feita, e não
 * vira 1:1 (N3, o item).
 *
 * @param value - Valor na moeda de entrada; `null` = sem dado, segue `null`.
 * @param conversion - Conversão já resolvida.
 * @param year - Ano do fluxo (para o câmbio por ano).
 * @returns O valor na moeda de saída, ou `null` (nunca um 1:1 mudo).
 */
export function convertAmount(
    value: number | null,
    conversion: ResolvedCurrencyConversion,
    year?: number | undefined,
): number | null {
    if (value === null || !Number.isFinite(value)) return null;
    if (conversion.status === 'identity') return value;
    const rate = exchangeRateAt(conversion, year);
    if (rate === null) return null;
    return value * rate;
}

/** Converte uma série anual `{year, value}` respeitando o câmbio de cada ano. */
function convertYearValues(
    series: readonly YearValue[],
    conversion: ResolvedCurrencyConversion,
): readonly YearValue[] {
    if (conversion.status === 'identity') return series;
    return Object.freeze(
        series.map((p) => Object.freeze({ year: p.year, value: convertAmount(p.value, conversion, p.year) })),
    ) as readonly YearValue[];
}

/** Converte uma série de deltas anuais (mesma regra: Δ em moeda é monetário). */
function convertYearDeltas(
    series: readonly YearDelta[],
    conversion: ResolvedCurrencyConversion,
): readonly YearDelta[] {
    if (conversion.status === 'identity') return series;
    return Object.freeze(
        series.map((p) => Object.freeze({ year: p.year, delta: convertAmount(p.delta, conversion, p.year) })),
    ) as readonly YearDelta[];
}

/**
 * NPV na moeda de saída: `Σ (valor_k × câmbio_k) / (1 + r_k)^k`.
 *
 * Com câmbio FIXO a conversão é linear e sairia do somatório (`NPV × câmbio`);
 * com câmbio POR ANO não sai — cada parcela tem o SEU câmbio ANTES de ser
 * descontada. Para que o resultado não dependa de qual das duas formas o usuário
 * escolheu, o NPV convertido é SEMPRE reconstruído da série anual, com o MESMO
 * fator de desconto que a projeção usou (`declineDiscountFactor`, CFG-13 — nada
 * de desconto reimplementado aqui, N4).
 *
 * N3 no agregado: se um ano TINHA valor e não pôde ser convertido (sem cotação),
 * o NPV convertido é `null`. Somar os anos cobertos e chamar aquilo de "o NPV do
 * horizonte" seria um total honesto ano a ano e mentiroso no rótulo. A série
 * anual continua mostrando quais anos vieram e quais faltaram.
 *
 * @param series - Série anual nominal (pré-desconto) da dimensão.
 * @param npv - O NPV que a projeção calculou na moeda de entrada.
 * @param conversion - Conversão já resolvida.
 * @param rate - Taxa de desconto r que a projeção aplicou.
 * @param decline - Declínio da taxa resolvido (CFG-13) que a projeção aplicou.
 * @param baseYear - Ano-base t₀ da série (k = ano − baseYear).
 * @returns O NPV na moeda de saída, ou `null` (N3).
 */
function convertNpv(
    series: readonly YearValue[],
    npv: number | null,
    conversion: ResolvedCurrencyConversion,
    rate: number,
    decline: ResolvedDiscountDecline,
    baseYear: number | null,
): number | null {
    if (conversion.status === 'identity') return npv;
    if (npv === null || baseYear === null) return null;
    let acc = 0;
    let any = false;
    for (const p of series) {
        if (p.value === null || !Number.isFinite(p.value)) continue;
        const converted = convertAmount(p.value, conversion, p.year);
        // Ano com valor e sem câmbio: o agregado do horizonte deixa de existir.
        if (converted === null) return null;
        acc += converted / declineDiscountFactor(rate, p.year - baseYear, decline);
        any = true;
    }
    return any ? acc : null;
}

/** Série de UM cenário na moeda de saída (CFG-15). */
export interface ConvertedScenarioTimeSeries {
    /** A conversão aplicada — moedas, câmbio e o que foi recusado (auditoria). */
    readonly currency: ResolvedCurrencyConversion;
    /** Os mesmos anos da série original. */
    readonly years: readonly number[];
    /** CAPEX a valor presente na moeda de saída (`null` = N3). */
    readonly capexNPV: number | null;
    /** OPEX a valor presente na moeda de saída (`null` = N3). */
    readonly opexNPV: number | null;
    /** CAPEX nominal por ano, convertido. */
    readonly capexSeries: readonly YearValue[];
    /** OPEX nominal por ano, convertido. */
    readonly opexSeries: readonly YearValue[];
    /** ECBT V_net por ano, convertido (é valor monetizado, ISO 14008). */
    readonly ecbtSeries: readonly YearValue[];
    /**
     * Série ambiental INTACTA — fluxo FÍSICO (§5.2 b). Câmbio não se aplica a
     * m³/t/kWh; convertê-la seria erro de dimensão. Exposta aqui para a tela
     * poder mostrar as duas ao lado sem ir buscar na série original.
     */
    readonly environmentalSeries: readonly YearValue[];
}

/**
 * Converte a série temporal projetada (§5.2) para a moeda de saída (CFG-15).
 *
 * Só as dimensões ECONÔMICAS convertem; a ambiental/ODS passa intacta (§5.2 b).
 * Sem conversão a converter (`identity`) as MESMAS referências são devolvidas —
 * nenhum número passa por operação alguma, então a igualdade com a série
 * original é estrutural, não uma coincidência de arredondamento.
 *
 * @param series - Série projetada por `computeScenarioTimeSeries`.
 * @param conversion - Conversão já resolvida por {@link resolveCurrencyConversion}.
 * @returns {@link ConvertedScenarioTimeSeries} congelada.
 */
export function convertScenarioTimeSeries(
    series: ScenarioTimeSeries,
    conversion: ResolvedCurrencyConversion,
): ConvertedScenarioTimeSeries {
    const baseYear = series.horizon.baseYear;
    return Object.freeze({
        currency: conversion,
        years: series.years,
        capexNPV: convertNpv(
            series.capexSeries,
            series.capexNPV,
            conversion,
            series.discountRate,
            series.decline,
            baseYear,
        ),
        opexNPV: convertNpv(
            series.opexSeries,
            series.opexNPV,
            conversion,
            series.discountRate,
            series.decline,
            baseYear,
        ),
        capexSeries: convertYearValues(series.capexSeries, conversion),
        opexSeries: convertYearValues(series.opexSeries, conversion),
        ecbtSeries: convertYearValues(series.ecbtSeries, conversion),
        environmentalSeries: series.environmentalSeries,
    });
}

/** Série do PAR (alt − base) na moeda de saída (CFG-15). */
export interface ConvertedScenarioPairTimeSeries {
    readonly currency: ResolvedCurrencyConversion;
    readonly years: readonly number[];
    /** Série do cenário-base convertida. */
    readonly base: ConvertedScenarioTimeSeries;
    /** Série do cenário alternativo convertida. */
    readonly alt: ConvertedScenarioTimeSeries;
    /** ΔCAPEX NPV na moeda de saída (`null` = N3). */
    readonly capexNPVDelta: number | null;
    /** ΔOPEX NPV na moeda de saída (`null` = N3). */
    readonly opexNPVDelta: number | null;
    /** ΔCAPEX nominal por ano, convertido. */
    readonly capexDelta: readonly YearDelta[];
    /** ΔOPEX nominal por ano, convertido. */
    readonly opexDelta: readonly YearDelta[];
    /** ΔECBT por ano, convertido. */
    readonly ecbtDelta: readonly YearDelta[];
    /** Δ ambiental INTACTO — fluxo físico, sem câmbio (§5.2 b). */
    readonly environmentalDelta: readonly YearDelta[];
}

/**
 * Converte o par base×alternativo (§5.2) para a moeda de saída (CFG-15).
 *
 * Os ΔNPV são recompostos das séries JÁ convertidas (alt − base na moeda de
 * saída), não convertidos a partir do Δ em moeda de entrada: com câmbio por ano
 * as duas contas divergem, e a primeira é a que corresponde ao que o usuário vê
 * ano a ano. Um lado sem NPV convertido mantém o Δ `null` (N3).
 *
 * @param pair - Par projetado por `computeScenarioPairTimeSeries`.
 * @param conversion - Conversão já resolvida.
 * @returns {@link ConvertedScenarioPairTimeSeries} congelada.
 */
export function convertScenarioPairTimeSeries(
    pair: ScenarioPairTimeSeries,
    conversion: ResolvedCurrencyConversion,
): ConvertedScenarioPairTimeSeries {
    const base = convertScenarioTimeSeries(pair.base, conversion);
    const alt = convertScenarioTimeSeries(pair.alt, conversion);
    const npvDelta = (a: number | null, b: number | null): number | null =>
        a === null || b === null ? null : a - b;
    return Object.freeze({
        currency: conversion,
        years: pair.years,
        base,
        alt,
        capexNPVDelta:
            conversion.status === 'identity' ? pair.capexNPVDelta : npvDelta(alt.capexNPV, base.capexNPV),
        opexNPVDelta:
            conversion.status === 'identity' ? pair.opexNPVDelta : npvDelta(alt.opexNPV, base.opexNPV),
        capexDelta: convertYearDeltas(pair.capexDelta, conversion),
        opexDelta: convertYearDeltas(pair.opexDelta, conversion),
        ecbtDelta: convertYearDeltas(pair.ecbtDelta, conversion),
        environmentalDelta: pair.environmentalDelta,
    });
}
