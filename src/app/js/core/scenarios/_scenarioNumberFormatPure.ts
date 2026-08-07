// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO NUMBER FORMAT & UNITS — pure-logic (CFG-22, TEMA F).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-22 — "Formato de número e unidades configuráveis (hoje pt-BR /
       'R$/ano' fixos). Locale de número e unidade derivam da moeda/idioma
       escolhidos (CFG-18, i18n §7), não cravados. Default = pt-BR.
       Testável: locale=en-US → '1,000.00' e unidade traduzida."
     - §2.4.0 guard-rail #1 (escolher entre opções curadas), #2 (default são),
       #5 (faixa/convenção com fonte citável).

   ─── ESTE MÓDULO ESTENDE O CFG-18, NÃO O REESCREVE ───

   `_scenarioBaseCurrencyPure.ts` (CFG-18) entregou o que a MOEDA determina —
   símbolo, código e casas decimais da ISO 4217 — e deixou escrito no próprio
   cabeçalho o que ficava para cá: "separador de milhar, posição do símbolo,
   tradução da unidade — é CFG-22 e não é decidido aqui". A fronteira continua
   valendo nos dois sentidos e é a razão de os dois módulos existirem:

     CFG-18 (moeda)   decide QUANTAS casas    — CLP tem 0, BRL tem 2.
     CFG-22 (locale)  decide COMO se escreve  — 1.234,56 · 1,234.56 · 1 234,56.

   Nada aqui redefine casas decimais por conta própria: `formatCurrencyIn`
   PEDE ao `CurrencyDef` do CFG-18 quantas usar. E `formatCurrencyAmount` (CFG-18)
   segue intacto — quem só quer o ASCII determinístico continua chamando ele.

   ─── Por que NÃO delega para `Intl` (medido, não preferência) ───

   `Intl` resolveria "o formato do locale" em uma linha — e devolveria a decisão
   para a versão do ICU que estiver embaixo. Duas medições no runtime deste repo
   (Node 22.14 / ICU 76.1) mostram o custo disso:

     1. `(1234567.89).toLocaleString('es-LA')` → "1.234.567,89"
        `(1234567.89).toLocaleString('es-419')` → "1,234,567.89"
        O MESMO espanhol latino-americano, separadores TROCADOS, porque 'es-LA'
        não é tag canônica do CLDR e o ICU cai no espanhol da Espanha. O repo
        chama o seu espanhol de `es-LA` (utils/i18n/locales/es-LA.json) — passar
        essa tag direto ao `Intl` daria a convenção errada em silêncio.
     2. fr-FR agrupa com NARROW NO-BREAK SPACE (U+202F) neste ICU; versões
        anteriores usaram NO-BREAK SPACE (U+00A0). O mesmo código, dois bytes
        diferentes, conforme o ambiente.

   Um módulo puro que promete determinismo não pode ter a saída atrelada à
   versão do ICU do navegador. Então o CLDR entra como FONTE DE CURADORIA (os
   valores abaixo foram lidos do ICU uma vez, na autoria, e ficaram FIXADOS aqui,
   auditáveis), nunca como dependência de runtime. É a mesma escolha que o CFG-18
   já havia feito ao ficar "deliberadamente sem `Intl`".

   ─── A armadilha do fator 1000 (por que unidade não se traduz palavra a palavra) ───

   "billion" em en-US é 10⁹; "Billion" em de-DE é 10¹²; "billón" em espanhol é
   10¹². Traduzir a PALAVRA erra por três ordens de grandeza — um CAPEX de
   1,2 bilhão viraria 1,2 Billion (1,2 trilhão) num relatório alemão. Por isso a
   unidade é escolhida pela MAGNITUDE e o rótulo vem da escala do locale:
   10⁹ é "bilhão" (pt-BR), "billion" (en-US), "Milliarde" (de-DE), "milliard"
   (fr-FR) e "mil millones" (es-419) — o espanhol não tem palavra curta para 10⁹.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

import type { CurrencyDef } from './_scenarioCurrencyPure.js';
import type { ResolvedBaseCurrency } from './_scenarioBaseCurrencyPure.js';

// ───────────────────────────── Catálogo curado ─────────────────────────────

/** Um degrau da escala de grandeza do locale (10³, 10⁶, 10⁹). */
export interface ScaleStep {
    /** Magnitude que o degrau representa. Nunca traduzida — é número. */
    readonly factor: number;
    /** Rótulo no singular (usado quando o valor exibido é exatamente 1). */
    readonly one: string;
    /** Rótulo no plural. Em inglês é igual ao singular ("2 million", sem s). */
    readonly many: string;
}

/** Denominadores de unidade curados — o "/ano" de "R$/ano" (CFG-18). */
export type UnitPeriodId = 'year' | 'month';

/**
 * Convenção de escrita de número de UM locale curado (N8: lista, não campo livre).
 */
export interface NumberLocaleDef {
    /** Tag do locale, canônica do CLDR (ex.: 'pt-BR', 'es-419'). */
    readonly id: string;
    /** Nome legível, para o seletor. */
    readonly name: string;
    /** Separador de milhar. Pode ser espaço estreito (fr-FR usa U+202F). */
    readonly group: string;
    /** Separador decimal. */
    readonly decimal: string;
    /** Onde o símbolo da moeda entra em relação aos dígitos. */
    readonly currencyPosition: 'before' | 'after';
    /** Espaço entre símbolo e dígitos: `''` ou NO-BREAK SPACE (U+00A0). */
    readonly currencySpace: string;
    /** Escala de grandeza, do menor para o maior degrau. */
    readonly scale: readonly ScaleStep[];
    /** Denominadores de unidade traduzidos ('year' → 'ano'). */
    readonly periods: Readonly<Record<UnitPeriodId, string>>;
    /** Fonte citável da convenção (guard-rail §2.4.0 #5). Nunca ''. */
    readonly source: string;
}

/** NO-BREAK SPACE — o espaço que o CLDR põe entre símbolo e dígitos. */
const NBSP = ' ';
/** NARROW NO-BREAK SPACE — o agrupador do fr-FR no CLDR atual. */
const NNBSP = ' ';

const CLDR =
    'CLDR (Unicode Common Locale Data Repository) — https://cldr.unicode.org/ (valores fixados na curadoria, não lidos do Intl em runtime)';

function step(factor: number, one: string, many: string): ScaleStep {
    return Object.freeze({ factor, one, many });
}

function locale(
    id: string,
    name: string,
    group: string,
    decimalSep: string,
    currencyPosition: 'before' | 'after',
    currencySpace: string,
    scale: readonly ScaleStep[],
    periods: Record<UnitPeriodId, string>,
): NumberLocaleDef {
    return Object.freeze({
        id,
        name,
        group,
        decimal: decimalSep,
        currencyPosition,
        currencySpace,
        scale: Object.freeze(scale),
        periods: Object.freeze(periods),
        source: CLDR,
    });
}

/**
 * Locales curados. A seleção não é arbitrária: são os 3 idiomas que o produto
 * fala (pt-BR, en-US, es-LA→es-419) mais as jurisdições que a própria §2.4 cita
 * como caso de uso internacional (en-GB, de-DE, fr-FR). Ampliar = acrescentar
 * aqui, curado e versionado — nunca aceitar tag arbitrária do navegador.
 */
export const CURATED_NUMBER_LOCALES: Readonly<Record<string, NumberLocaleDef>> = Object.freeze({
    'pt-BR': locale(
        'pt-BR',
        'Português (Brasil)',
        '.',
        ',',
        'before',
        NBSP,
        [step(1e3, 'mil', 'mil'), step(1e6, 'milhão', 'milhões'), step(1e9, 'bilhão', 'bilhões')],
        { year: 'ano', month: 'mês' },
    ),
    'en-US': locale(
        'en-US',
        'English (United States)',
        ',',
        '.',
        'before',
        '',
        [step(1e3, 'thousand', 'thousand'), step(1e6, 'million', 'million'), step(1e9, 'billion', 'billion')],
        { year: 'year', month: 'month' },
    ),
    'en-GB': locale(
        'en-GB',
        'English (United Kingdom)',
        ',',
        '.',
        'before',
        '',
        [step(1e3, 'thousand', 'thousand'), step(1e6, 'million', 'million'), step(1e9, 'billion', 'billion')],
        { year: 'year', month: 'month' },
    ),
    // O espanhol NÃO tem palavra curta para 10⁹: "billón" é 10¹². Daí "mil millones".
    'es-419': locale(
        'es-419',
        'Español (América Latina)',
        ',',
        '.',
        'before',
        NBSP,
        [step(1e3, 'mil', 'mil'), step(1e6, 'millón', 'millones'), step(1e9, 'mil millones', 'mil millones')],
        { year: 'año', month: 'mes' },
    ),
    // 10⁹ é "Milliarde". "Billion", em alemão, é 10¹² — traduzir a palavra erraria 1000×.
    'de-DE': locale(
        'de-DE',
        'Deutsch (Deutschland)',
        '.',
        ',',
        'after',
        NBSP,
        [step(1e3, 'Tausend', 'Tausend'), step(1e6, 'Million', 'Millionen'), step(1e9, 'Milliarde', 'Milliarden')],
        { year: 'Jahr', month: 'Monat' },
    ),
    // Agrupador U+202F (CLDR atual). Fixado aqui: é justamente o byte que muda
    // entre versões do ICU e que um módulo determinístico não pode herdar.
    'fr-FR': locale(
        'fr-FR',
        'Français (France)',
        NNBSP,
        ',',
        'after',
        NBSP,
        [step(1e3, 'mille', 'mille'), step(1e6, 'million', 'millions'), step(1e9, 'milliard', 'milliards')],
        { year: 'an', month: 'mois' },
    ),
});

/**
 * Apelidos aceitos → tag canônica do catálogo.
 *
 * `es-LA` é o nome que o REPO dá ao seu espanhol (utils/i18n/locales/es-LA.json)
 * e não é tag do CLDR. Mapeá-lo explicitamente para `es-419` é o que impede o
 * silêncio medido no cabeçalho — passar 'es-LA' ao `Intl` devolve a convenção da
 * ESPANHA (1.234.567,89), o oposto da que o CLDR define para a América Latina.
 */
const LOCALE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
    'ES-LA': 'es-419',
    'ES-419': 'es-419',
    'PT-BR': 'pt-BR',
    'EN-US': 'en-US',
    'EN-GB': 'en-GB',
    'DE-DE': 'de-DE',
    'FR-FR': 'fr-FR',
});

/** Versão do catálogo curado — trilha de auditoria da curadoria (N9). */
export const NUMBER_LOCALE_CATALOG_VERSION = 1;

/** Locale default: pt-BR — o formato que a tela já usa hoje (zero regressão). */
export const DEFAULT_NUMBER_LOCALE_ID = 'pt-BR';

/** Locale de número resolvido (CFG-22) — mesma forma do CFG-18/19/20. */
export interface ResolvedNumberLocale {
    /** O locale curado em vigor. Nunca `null`: sem pedido válido, é o default. */
    readonly locale: NumberLocaleDef;
    /** Tag pedida pelo chamador; `null` quando não pediu (auditoria). */
    readonly requested: string | null;
    /**
     * `true` quando uma tag FOI pedida e não está no catálogo curado (N8).
     * O default entra no lugar, mas o descarte fica VISÍVEL — trocar 'ja-JP'
     * por pt-BR calado faria a tela jurar que o usuário escolheu pt-BR.
     */
    readonly unknown: boolean;
    /** `true` quando o locale em vigor é o default (pt-BR) — o caminho de hoje. */
    readonly isDefault: boolean;
    /** Versão do catálogo curado que resolveu (trilha de auditoria, N9). */
    readonly catalogVersion: number;
}

/**
 * Resolve a tag de locale para a convenção curada correspondente.
 *
 * Aceita qualquer caixa e `_` no lugar de `-` ('pt_br' → pt-BR): isso é
 * normalização de ESCRITA, não invenção de dado. Tag fora do catálogo devolve
 * `null` — o módulo jamais fabrica uma convenção que não foi curada (N8).
 *
 * @param id - Tag do locale pedida (ex.: 'en-US', 'es-LA', 'pt_BR').
 * @returns O {@link NumberLocaleDef} curado, ou `null` se a tag não é do catálogo.
 */
export function resolveNumberLocaleDef(id?: string | null): NumberLocaleDef | null {
    if (typeof id !== 'string') return null;
    const key = id.trim().replace(/_/g, '-').toUpperCase();
    const canonical = LOCALE_ALIASES[key];
    return canonical ? (CURATED_NUMBER_LOCALES[canonical] as NumberLocaleDef) : null;
}

/**
 * Resolve o locale de número do cenário (CFG-22).
 *
 * Tag ausente, vazia ou fora do catálogo cai no default pt-BR, que reproduz
 * exatamente o formato que a tela já escreve hoje (guard-rail §2.4.0 #2, zero
 * regressão) — e, quando a tag FOI pedida e não existe, `unknown` marca o
 * descarte em vez de fingir que o usuário pediu pt-BR.
 *
 * @param id - Tag do locale pedida pelo chamador.
 * @returns {@link ResolvedNumberLocale} congelada; nunca lança.
 */
export function resolveNumberLocale(id?: string | null): ResolvedNumberLocale {
    const requested = typeof id === 'string' && id.trim().length > 0 ? id : null;
    const resolved = resolveNumberLocaleDef(id);
    const def = resolved ?? (CURATED_NUMBER_LOCALES[DEFAULT_NUMBER_LOCALE_ID] as NumberLocaleDef);
    return Object.freeze({
        locale: def,
        requested,
        unknown: requested !== null && resolved === null,
        isDefault: def.id === DEFAULT_NUMBER_LOCALE_ID,
        catalogVersion: NUMBER_LOCALE_CATALOG_VERSION,
    });
}

/**
 * As tags de locale oferecíveis, em ordem estável (para um seletor).
 *
 * É a metade "escolher entre opções curadas" do guard-rail §2.4.0 #1: a tela
 * oferece ESTA lista e não um campo de texto livre.
 *
 * @returns Tags canônicas curadas, ordenadas alfabeticamente, congeladas.
 */
export function listNumberLocaleIds(): readonly string[] {
    return Object.freeze([...Object.keys(CURATED_NUMBER_LOCALES)].sort());
}

// ───────────────────────────── Formatação ─────────────────────────────

/** Aceita tanto a resolvida quanto o def cru (ergonomia do chamador). */
export type NumberLocaleLike = ResolvedNumberLocale | NumberLocaleDef;

function localeOf(input: NumberLocaleLike): NumberLocaleDef {
    return 'locale' in input ? input.locale : input;
}

function currencyOf(input: ResolvedBaseCurrency | CurrencyDef): CurrencyDef {
    return 'currency' in input ? input.currency : input;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Casas decimais utilizáveis, ou o fallback.
 *
 * Faixa validada (guard-rail §2.4.0 #1), não campo livre: inteiro em 0..10.
 * Fora disso NÃO é clampado para um limite arbitrário — cai no default da
 * moeda/do chamador, que é a convenção que já tinha lastro (a ISO 4217, no caso
 * de dinheiro). Clampar 99 para 10 inventaria uma precisão que ninguém pediu.
 */
function resolveDecimals(requested: unknown, fallback: number): number {
    return typeof requested === 'number' && Number.isInteger(requested) && requested >= 0 && requested <= 10
        ? requested
        : fallback;
}

/** Insere o separador de milhar a cada 3 dígitos, da direita para a esquerda. */
function groupInteger(digits: string, group: string): string {
    if (group === '' || digits.length <= 3) return digits;
    let out = '';
    for (let i = 0; i < digits.length; i++) {
        if (i > 0 && (digits.length - i) % 3 === 0) out += group;
        out += digits[i];
    }
    return out;
}

/** Opções de formatação numérica. */
export interface NumberFormatOptions {
    /**
     * Casas decimais (0..10). Fora da faixa ou ausente: 2 em número puro, e as
     * da ISO 4217 da moeda em {@link formatCurrencyIn} — a MOEDA decide isso
     * (fronteira do CFG-18), o locale só decide como se escreve.
     */
    readonly decimals?: number | null;
}

/**
 * Escreve um número na convenção do locale (agrupamento + separador decimal).
 *
 * N3: `null`/não-finito devolve `null`, jamais a string de um zero forjado.
 * `-0,004` com 2 casas sai `0,00` e NÃO `-0,00`: o sinal só aparece quando
 * sobrou magnitude depois do arredondamento — um "menos zero" sugeriria uma
 * perda que o número exibido não tem.
 *
 * @param value - Valor a escrever; `null`/NaN/Infinity = sem dado, segue `null`.
 * @param loc - Locale resolvido (ou o `NumberLocaleDef` curado).
 * @param options - Casas decimais (default 2).
 * @returns A string na convenção do locale, ou `null` quando não há valor honesto.
 */
export function formatNumberIn(
    value: number | null | undefined,
    loc: NumberLocaleLike,
    options: NumberFormatOptions = {},
): string | null {
    if (!isFiniteNumber(value)) return null;
    const def = localeOf(loc);
    const decimals = resolveDecimals(options.decimals, 2);
    const fixed = Math.abs(value).toFixed(decimals);
    const dot = fixed.indexOf('.');
    const intPart = dot === -1 ? fixed : fixed.slice(0, dot);
    const fracPart = dot === -1 ? '' : fixed.slice(dot + 1);
    const body = groupInteger(intPart, def.group) + (fracPart ? def.decimal + fracPart : '');
    // Sinal só quando o arredondamento não zerou a magnitude (evita "-0,00").
    return (value < 0 && Number(fixed) !== 0 ? '-' : '') + body;
}

/**
 * Escreve um valor monetário com o símbolo NA POSIÇÃO do locale.
 *
 * As casas decimais vêm da moeda (ISO 4217, CFG-18) — CLP tem 0, BRL tem 2 —
 * e podem ser sobrepostas por `options.decimals` dentro da faixa validada. A
 * posição e o espaçamento do símbolo vêm do locale: pt-BR escreve `R$ 1.234,56`
 * e de-DE escreve `1.234,56 €`. O sinal negativo precede tudo nos dois casos,
 * como no CLDR.
 *
 * N3: sem valor não há string — `null`, nunca o texto de um zero forjado.
 *
 * @param value - Valor na moeda base; `null`/não-finito segue `null`.
 * @param currency - Moeda base do CFG-18 (resolvida ou `CurrencyDef`).
 * @param loc - Locale resolvido (ou o `NumberLocaleDef` curado).
 * @param options - Casas decimais; default = as da ISO 4217 da moeda.
 * @returns A string formatada, ou `null` quando não há valor honesto a mostrar.
 */
export function formatCurrencyIn(
    value: number | null | undefined,
    currency: ResolvedBaseCurrency | CurrencyDef,
    loc: NumberLocaleLike,
    options: NumberFormatOptions = {},
): string | null {
    const cur = currencyOf(currency);
    const def = localeOf(loc);
    const digits = formatNumberIn(value, def, {
        decimals: resolveDecimals(options.decimals, cur.decimals),
    });
    if (digits === null) return null;
    return wrapWithSymbol(digits, cur, def);
}

/**
 * Envolve um número JÁ ESCRITO com o símbolo, na posição do locale.
 *
 * O corpo pode trazer a unidade de grandeza junto ("1,23 Milliarden"): a unidade
 * pertence ao NÚMERO, não à moeda. Anexá-la depois do conjunto produziria
 * `1,23 € Milliarden` em de-DE — ordem que nenhum leitor alemão escreve.
 */
function wrapWithSymbol(body: string, cur: CurrencyDef, def: NumberLocaleDef): string {
    const negative = body.charCodeAt(0) === 45; /* '-' */
    const magnitude = negative ? body.slice(1) : body;
    const sign = negative ? '-' : '';
    return def.currencyPosition === 'before'
        ? `${sign}${cur.symbol}${def.currencySpace}${magnitude}`
        : `${sign}${magnitude}${def.currencySpace}${cur.symbol}`;
}

/**
 * Rótulo de UNIDADE com o denominador TRADUZIDO — o "R$/ano" cravado na tela.
 *
 * Estende `currencyUnitLabel` (CFG-18, que recebe o denominador já escrito) com
 * a metade que é do locale: `'year'` vira `ano` · `year` · `año` · `Jahr` · `an`.
 * Com pt-BR e `'year'` a saída é IDÊNTICA à do CFG-18 com `'ano'` — zero regressão.
 *
 * Denominador não curado devolve `null` em vez do símbolo sozinho: entregar
 * `R$` no lugar de `R$/trimestre` transformaria uma TAXA (dinheiro por período)
 * num ESTOQUE (dinheiro), e o leitor não teria como perceber a troca.
 *
 * @param currency - Moeda base do CFG-18 (resolvida ou `CurrencyDef`).
 * @param period - Denominador curado; `null`/ausente = só o símbolo (paridade CFG-18).
 * @param loc - Locale resolvido (ou o `NumberLocaleDef` curado).
 * @returns `'R$/ano'`, `'R$'`, ou `null` se pediram um denominador não curado.
 */
export function unitLabelIn(
    currency: ResolvedBaseCurrency | CurrencyDef,
    period: UnitPeriodId | string | null | undefined,
    loc: NumberLocaleLike,
): string | null {
    const cur = currencyOf(currency);
    const def = localeOf(loc);
    if (period === null || period === undefined || period === '') return cur.symbol;
    const translated = Object.prototype.hasOwnProperty.call(def.periods, period)
        ? def.periods[period as UnitPeriodId]
        : null;
    return translated === null ? null : `${cur.symbol}/${translated}`;
}

/** Os denominadores de unidade curados, em ordem estável (para um seletor). */
export function listUnitPeriodIds(): readonly string[] {
    return Object.freeze(['month', 'year']);
}

// ───────────────────────────── Unidades de grandeza ─────────────────────────────

/** Um valor reescrito na unidade de grandeza do locale (mil/milhão/bilhão). */
export interface ScaledAmount {
    /** O valor JÁ dividido pelo fator (1234567 → 1.234567 com fator 10⁶). */
    readonly value: number;
    /** A magnitude aplicada: 1 (nenhuma), 10³, 10⁶ ou 10⁹. */
    readonly factor: number;
    /** O rótulo da unidade no locale; `''` quando não houve escala (fator 1). */
    readonly unit: string;
}

/** Opções da escala de grandeza. */
export interface ScaleOptions extends NumberFormatOptions {
    /**
     * Maior magnitude permitida (ex.: `1e6` para nunca passar de "milhões").
     * Ausente = o catálogo inteiro do locale.
     */
    readonly maxFactor?: number | null;
}

/**
 * Escolhe a unidade de grandeza pela MAGNITUDE e devolve o valor reescrito.
 *
 * O degrau é o maior cujo fator cabe em `|value|`; abaixo de 10³ não há escala
 * (fator 1, unidade `''`) — "0,5 mil" seria pior que "500". O rótulo sai do
 * catálogo do locale, jamais de tradução da palavra: 10⁹ é `Milliarde` em de-DE,
 * nunca `Billion` (que lá é 10¹²).
 *
 * Singular/plural seguem o valor COMO SERÁ EXIBIDO (já arredondado nas casas
 * pedidas), porque é isso que o leitor vê: 1,00 → "milhão", 1,50 → "milhões".
 *
 * N3: `null`/não-finito devolve `null` — sem valor não há unidade.
 *
 * @param value - Valor na escala natural (ex.: 1_234_567_890).
 * @param loc - Locale resolvido (ou o `NumberLocaleDef` curado).
 * @param options - Casas decimais (default 2) e teto de magnitude.
 * @returns {@link ScaledAmount} congelado, ou `null` quando não há valor.
 */
export function scaleAmountIn(
    value: number | null | undefined,
    loc: NumberLocaleLike,
    options: ScaleOptions = {},
): ScaledAmount | null {
    if (!isFiniteNumber(value)) return null;
    const def = localeOf(loc);
    const decimals = resolveDecimals(options.decimals, 2);
    const ceiling = isFiniteNumber(options.maxFactor) ? options.maxFactor : Number.POSITIVE_INFINITY;
    const magnitude = Math.abs(value);
    let chosen: ScaleStep | null = null;
    for (const candidate of def.scale) {
        if (candidate.factor <= ceiling && magnitude >= candidate.factor) chosen = candidate;
    }
    if (chosen === null) return Object.freeze({ value, factor: 1, unit: '' });
    const scaled = value / chosen.factor;
    // O plural segue o número EXIBIDO, não o interno: 1,004 mostra "1,00" e lê-se singular.
    const shown = Math.abs(Number(scaled.toFixed(decimals)));
    return Object.freeze({
        value: scaled,
        factor: chosen.factor,
        unit: shown === 1 ? chosen.one : chosen.many,
    });
}

/**
 * Escreve um valor monetário grande na unidade de grandeza do locale.
 *
 * Junta {@link scaleAmountIn} e {@link formatCurrencyIn}: `1_234_567_890` em
 * pt-BR/BRL vira `R$ 1,23 bilhões`; em de-DE/EUR, `1,23 Milliarden €` — a
 * unidade fica colada ao NÚMERO e o símbolo continua na posição do locale.
 * Abaixo de 10³ não há sufixo e a saída é a de {@link formatCurrencyIn}.
 *
 * N3: sem valor não há string — `null`.
 *
 * @param value - Valor na moeda base, na escala natural.
 * @param currency - Moeda base do CFG-18 (resolvida ou `CurrencyDef`).
 * @param loc - Locale resolvido (ou o `NumberLocaleDef` curado).
 * @param options - Casas decimais (default 2 — a escala já reduziu a magnitude).
 * @returns A string com símbolo, número e unidade, ou `null` sem valor.
 */
export function formatScaledCurrencyIn(
    value: number | null | undefined,
    currency: ResolvedBaseCurrency | CurrencyDef,
    loc: NumberLocaleLike,
    options: ScaleOptions = {},
): string | null {
    const scaled = scaleAmountIn(value, loc, options);
    if (scaled === null) return null;
    const def = localeOf(loc);
    const digits = formatNumberIn(scaled.value, def, {
        decimals: resolveDecimals(options.decimals, 2),
    });
    if (digits === null) return null;
    const body = scaled.unit === '' ? digits : `${digits} ${scaled.unit}`;
    return wrapWithSymbol(body, currencyOf(currency), def);
}
