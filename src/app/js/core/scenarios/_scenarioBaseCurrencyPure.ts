// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO BASE / PRESENTATION CURRENCY — pure-logic (CFG-18, TEMA F).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-18 — "Moeda configurável (hoje fixa BRL). Moeda ∈ {BRL
       (default), USD, EUR, …} curadas. Afeta RÓTULOS e a conversão (CFG-15).
       Testável: moeda=EUR → símbolo/format € em todo o painel."
     - §2.4.0 guard-rail #1 (escolher entre opções curadas) e #2 (default são).

   ─── O QUE ESTE MÓDULO **NÃO** É (leia antes de mexer) ───

   CFG-15 (`_scenarioCurrencyPure.ts`) já entregou a CONVERSÃO: `from → to` com
   câmbio fixo/por ano e o terceiro estado `semDado`. Este módulo NÃO converte
   nada e NÃO duplica aquele catálogo (N4) — ele IMPORTA `resolveCurrency` e
   `CURATED_CURRENCIES` de lá. A distinção é a razão de os dois existirem:

     CFG-15 (conversão)      muda o NÚMERO  — 100 BRL × 0,19 = 19 USD.
     CFG-18 (base/rótulo)    muda a ETIQUETA — "estes 100 são AUD, não BRL".

   Confundi-los é o bug caro: uma tela que troca o símbolo para € sem converter
   mostra valor de BRL com cara de EUR. Por isso {@link resolveBaseCurrency} é
   deliberadamente INCAPAZ de mexer em valor — ele resolve identidade e rótulo,
   e quem quiser mudar o número passa pelo CFG-15, que exige câmbio.

   ─── O buraco real que o item fecha ───

   Verificado no código antes de escrever: `_scenarioImpactEnginePure.ts` chamava
   `recomputeScenarioEcbtScore({ …, currency: 'BRL' })` com a string CRAVADA. Não
   havia como declarar que os custos de um processo estão em AUD — a cadeia ERP →
   ECBT rotulava tudo de BRL, inclusive uma operação australiana. CFG-15 converte
   a PARTIR de uma base, mas nada permitia DECLARAR essa base. É esse parâmetro
   que abre aqui.

   ─── Por que a moeda base NÃO altera o V_net ───

   Trocar a moeda BASE é redeclarar em que unidade os custos que ENTRARAM já
   estavam — não é reconverter. V_net = Σativos − Σpassivos sobre os MESMOS
   lançamentos, então o número é idêntico e só o rótulo muda. Se a base mudasse
   o número sozinha, o valor teria sido convertido sem câmbio — exatamente o 1:1
   mudo que o CFG-15 proíbe. A suíte crava essa igualdade com `assert.equal`.

   ─── Fronteira com CFG-22 (formato de número) ───

   Aqui mora o que a MOEDA determina: símbolo, código e casas decimais da ISO
   4217 (CLP tem 0 casas, não 2). O que o LOCALE determina — separador de milhar,
   posição do símbolo, tradução da unidade — é CFG-22 e não é decidido aqui.
   {@link formatCurrencyAmount} é, por isso, deliberadamente sem `Intl` e sem
   agrupamento: determinístico, e sem furtar a decisão do CFG-22.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

import {
    CURATED_CURRENCIES,
    CURRENCY_CATALOG_VERSION,
    DEFAULT_CURRENCY_CODE,
    resolveCurrency,
    type CurrencyDef,
} from './_scenarioCurrencyPure.js';

/**
 * Moeda BASE resolvida do cenário (CFG-18) — identidade e rótulo, nunca valor.
 */
export interface ResolvedBaseCurrency {
    /** A moeda curada em vigor. Nunca `null`: sem pedido válido, é o default. */
    readonly currency: CurrencyDef;
    /** Código pedido pelo chamador; `null` quando não pediu (auditoria). */
    readonly requested: string | null;
    /**
     * `true` quando um código FOI pedido e não está no catálogo curado (N8).
     * O default entra no lugar, mas o descarte fica VISÍVEL — trocar silenciosamente
     * 'XYZ' por BRL faria a tela jurar que o usuário escolheu BRL.
     */
    readonly unknown: boolean;
    /** `true` quando a moeda em vigor é o default (BRL) — o caminho de hoje. */
    readonly isDefault: boolean;
    /** Versão do catálogo curado que resolveu (trilha de auditoria, N9). */
    readonly catalogVersion: number;
}

/**
 * Resolve a moeda BASE/de apresentação do cenário (CFG-18).
 *
 * Reusa o catálogo curado do CFG-15 (N4 — não há segunda lista de moedas no
 * repositório). Código ausente, vazio ou fora do catálogo cai no default BRL,
 * que reproduz exatamente o comportamento pré-CFG-18 (guard-rail §2.4.0 #2,
 * zero regressão) — e, quando o código FOI pedido e não existe, `unknown` marca
 * o descarte em vez de fingir que o usuário pediu BRL.
 *
 * @param code - Código ISO 4217 alfabético pedido (qualquer caixa: 'eur' → EUR).
 * @returns {@link ResolvedBaseCurrency} congelada; nunca lança.
 */
export function resolveBaseCurrency(code?: string | null): ResolvedBaseCurrency {
    const requested = typeof code === 'string' && code.trim().length > 0 ? code : null;
    const resolved = resolveCurrency(code);
    const currency = resolved ?? (CURATED_CURRENCIES[DEFAULT_CURRENCY_CODE] as CurrencyDef);
    return Object.freeze({
        currency,
        requested,
        unknown: requested !== null && resolved === null,
        isDefault: currency.code === DEFAULT_CURRENCY_CODE,
        catalogVersion: CURRENCY_CATALOG_VERSION,
    });
}

/**
 * Os códigos das moedas base oferecíveis, em ordem estável (para um seletor).
 *
 * É a metade "escolher entre opções curadas" do guard-rail §2.4.0 #1: a tela
 * oferece ESTA lista e não um campo de texto livre.
 *
 * @returns Códigos ISO 4217 curados, ordenados alfabeticamente, congelados.
 */
export function listBaseCurrencyCodes(): readonly string[] {
    return Object.freeze([...Object.keys(CURATED_CURRENCIES)].sort());
}

/**
 * Rótulo de UNIDADE da moeda — o "R$/ano" que hoje está cravado na tela.
 *
 * @param currency - Moeda base já resolvida (ou a `CurrencyDef` curada).
 * @param per - Denominador da unidade, sem barra (ex.: `'ano'`); omitido = só a moeda.
 * @returns Ex.: `'R$'`, `'R$/ano'`, `'€/ano'`.
 */
export function currencyUnitLabel(
    currency: ResolvedBaseCurrency | CurrencyDef,
    per?: string | null,
): string {
    const def = 'currency' in currency ? currency.currency : currency;
    const suffix = typeof per === 'string' && per.trim().length > 0 ? `/${per.trim()}` : '';
    return `${def.symbol}${suffix}`;
}

/**
 * Renderiza um valor monetário com o símbolo e as casas decimais da ISO 4217.
 *
 * Determinístico e SEM `Intl`: não agrupa milhar nem reposiciona o símbolo —
 * isso é locale, e locale é CFG-22 (ver cabeçalho). O que a MOEDA manda, e que
 * uma renderização ingênua erra, está aqui: CLP tem 0 casas decimais na norma,
 * então `$1000` — nunca `$1000,00`.
 *
 * N3: `null`/não-finito devolve `null`, jamais a string de um zero forjado.
 *
 * @param value - Valor na moeda base; `null` = sem dado, segue `null`.
 * @param currency - Moeda base já resolvida (ou a `CurrencyDef` curada).
 * @returns A string com símbolo, ou `null` quando não há valor honesto a mostrar.
 */
export function formatCurrencyAmount(
    value: number | null | undefined,
    currency: ResolvedBaseCurrency | CurrencyDef,
): string | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const def = 'currency' in currency ? currency.currency : currency;
    return `${def.symbol}${value.toFixed(def.decimals)}`;
}
