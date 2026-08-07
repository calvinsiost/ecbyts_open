// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Cenários — ΔNPV consolidado (S1).
 *
 * Módulo pure-logic que consolida os deltas da fase F7 (ΔCAPEX, ΔOPEX anual,
 * ΔECBT anual monetizado — ISO 14008) num único veredito econômico-ambiental
 * de CICLO DE VIDA: o valor presente líquido do delta ao longo do horizonte.
 *
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
 *  - §2 S1 — "Combinar ΔCAPEX + ΔOPEX (+ ΔECBT como custo ambiental
 *    monetizado) num único veredito econômico-ambiental, via valor de ciclo
 *    de vida."
 *  - §5.2(c) — dimensão econômica em valor presente com desconto; taxa
 *    CONFIGURÁVEL (default 8% projeto; opção declinante para o eixo
 *    ambiental) — NUNCA hardcoded como constante imutável.
 *  - §5.2 — série anual `A(t) = A₀ × (1+g)^(t−t₀)` entre ano-base e horizonte.
 *
 * Convenção de sinal (idêntica ao veredito ponto-único da VM): "mais = melhor".
 * Custos entram NEGATIVOS (aumento de custo piora); ΔECBT entra com o próprio
 * sinal (score monetizado, mais = melhora).
 *
 * Rigor N3: se qualquer parcela exigida não tem dado (`null`), o ΔNPV é `null`
 * (+ `semDado=true`) — nunca um 0 forjado. As parcelas presentes ainda são
 * expostas na decomposição.
 *
 * CFG-09 (horizonte configurável): o horizonte deixa de ser resolvido aqui
 * dentro e passa a vir de `_scenarioHorizonPure.ts`, o MESMO resolvedor que a
 * projeção §5.2 usa — logo o horizonte é um parâmetro do CENÁRIO (aceito em
 * ano-marco absoluto OU em duração) e não uma constante recravada por consumidor.
 *
 * CFG-10 (crescimento por fase): o `g` único vira cronograma — a série pode
 * mudar de inclinação no meio do horizonte (3%/ano até 2030, 1%/ano depois),
 * via `_scenarioGrowthPure.ts`. Cronograma de fase única = o `(1+g)^(t−1)` de
 * sempre, bit-a-bit idêntico.
 *
 * CFG-12 (curva de demanda): a FORMA da curva do driver — geométrica (default),
 * linear ou logística/S — vem de `_scenarioDemandCurvePure.ts` e vale para as
 * parcelas anuais, o mesmo A(t) que a projeção §5.2 usa. A curva geométrica
 * mantém o laço de PV EXATAMENTE como era (o branch nem é tocado): o default
 * continua bit-a-bit o de antes do CFG-12.
 *
 * CFG-14 (inflação / NPV real): o veredito era nominal e ponto. Com um índice
 * de inflação o resultado ganha `real` — as mesmas parcelas descontadas pela
 * taxa REAL de Fisher `(1+r)/(1+π)−1`, em moeda do ano-base — ALÉM do nominal,
 * que continua sendo o `valor` de topo. Sem índice (o default) nada muda: a
 * visão real é `null` e o caminho nominal roda as mesmas operações de sempre.
 *
 * CFG-16 (TMA por stakeholder): a taxa já era parâmetro, mas era um número solto
 * — não dizia de QUEM é aquela exigência de retorno. `riskProfile` deixa o
 * chamador escolher um perfil curado (`investidor`, `regulador`, `social`) e o
 * veredito registra qual foi aplicado, com fonte. Um `discountRate` explícito
 * VENCE o perfil: campo novo não pode reescrever em silêncio um número que o
 * chamador já mandava — a precedência fica visível em `riskProfile.requestedKey`
 * vs. a taxa efetiva. Ver `_scenarioRiskProfilePure.ts`.
 *
 * CFG-17 (presets por setor): `sector` PRÉ-PREENCHE a taxa a partir de um
 * catálogo curado em que cada preset carrega a própria fonte — e que um admin
 * atualiza a partir dessa fonte sem reescrever código. Pré-preencher é a forma
 * mais fraca de decidir, então na cadeia o setor fica ABAIXO do perfil (CFG-16,
 * a pergunta mais específica) e da taxa explícita, e acima só do default do
 * motor. Ver `_scenarioSectorRatePure.ts`.
 */

import {
    resolveHorizon,
    type ResolvedHorizon,
} from './_scenarioHorizonPure.js';
import {
    growthRateAt,
    resolveGrowthSchedule,
    type GrowthPhase,
    type ResolvedGrowthSchedule,
} from './_scenarioGrowthPure.js';
import {
    demandFactorAt,
    resolveDemandCurve,
    type DemandCurveKind,
    type DemandCurveSpec,
    type ResolvedDemandCurve,
} from './_scenarioDemandCurvePure.js';
import {
    fisherRealRate,
    resolveInflation,
    type ResolvedInflation,
} from './_scenarioInflationPure.js';
import {
    resolveRiskProfile,
    type ResolvedRiskProfile,
} from './_scenarioRiskProfilePure.js';
import {
    resolveSectorRate,
    type ResolvedSectorRate,
    type SectorRateRegistry,
} from './_scenarioSectorRatePure.js';

/** Sinal do veredito (mesmo vocabulário da VM do comparador). */
export type NpvSinal = 'melhora' | 'piora' | 'neutro' | 'semDado';

/** Deltas F7 de entrada (alt − base). `null` = sem dado (N3). */
export interface ScenarioNpvDeltas {
    /** ΔCAPEX no ano-base (R$, investimento único em t₀). */
    readonly capexDelta: number | null;
    /** ΔOPEX anual (R$/ano, recorrente ao longo do horizonte). */
    readonly opexDeltaAnnual: number | null;
    /** ΔECBT anual monetizado (R$/ano, ISO 14008; mais = melhora). */
    readonly ecbtDeltaAnnual: number | null;
}

/** Configuração do cálculo — taxa e horizonte SEMPRE parametrizáveis (§5.2c). */
export interface ScenarioNpvConfig {
    /** Taxa de desconto do projeto (fração/ano). Default 0.08 (8%, Tier-2 BR). */
    readonly discountRate?: number;
    /**
     * Taxa de desconto do eixo ambiental (ΔECBT). Default = `discountRate`.
     * Permite a taxa social menor do UK Green Book/CEPAL sem mudar o motor.
     */
    readonly environmentalDiscountRate?: number;
    /** Horizonte em anos após t₀ (série anual t=1..H). Default 5 (t₀→2030-ish). */
    readonly horizonYears?: number;
    /**
     * Ano-base t₀ da série (âncora, CFG-09). Só é necessário para declarar o
     * horizonte pelo ANO-MARCO (`horizonYear`); a forma relativa dispensa.
     */
    readonly baseYear?: number;
    /**
     * Ano-marco ABSOLUTO do horizonte (CFG-09) — qualquer ano da faixa, não só
     * 2030/2050/2100. Tem precedência sobre `horizonYears` e exige `baseYear`.
     */
    readonly horizonYear?: number;
    /** Crescimento anual do driver A(t) aplicado às parcelas anuais. Default 0. */
    readonly growthRate?: number;
    /**
     * Crescimento `g` POR FASE (CFG-10) — ex.: 3%/ano até 2030, 1%/ano depois.
     * Vence o escalar `growthRate`. As fases são anos ABSOLUTOS, logo exigem
     * `baseYear`; sem âncora o cronograma é descartado (visível em
     * `config.growth.unanchored`) e vale o escalar.
     */
    readonly growthSchedule?: ReadonlyArray<GrowthPhase> | undefined;
    /**
     * FORMA da curva de demanda do driver (CFG-12): `'geometric'` (default, o
     * composto de hoje), `'linear'` (§5.2 d) ou `'logistic'` — esta exige a
     * capacidade: `{kind:'logistic', saturationMultiple: 2}`. Pedido
     * inutilizável cai na geométrica com `config.curve.fallback` visível.
     */
    readonly demandCurve?: DemandCurveSpec | DemandCurveKind | string | undefined;
    /**
     * Índice de inflação π (fração/ano, ex.: 0.04 para IPCA 4%/ano) — CFG-14.
     * Ausente ou 0 mantém o veredito NOMINAL, idêntico ao de sempre; com um
     * índice ativo o resultado ganha a visão `real` (Fisher), ALÉM do nominal.
     */
    readonly inflationRate?: number | undefined;
    /**
     * Perfil de risco / TMA do stakeholder (CFG-16): `'investidor'` (12%),
     * `'regulador'` (8% financeiro + 3,5% ambiental), `'social'` (3,5%) ou
     * `'projeto'` (o default de sempre). Só preenche as taxas que o chamador
     * NÃO informou explicitamente — `discountRate` explícito vence o perfil.
     */
    readonly riskProfile?: string | undefined;
    /**
     * Setor do projeto (CFG-17): `'mineracao'` (8%), `'petroleo'` (12%) ou
     * `'utilities'` (5%). PRÉ-PREENCHE a taxa — perde para `discountRate`
     * explícito e para `riskProfile`, e só vence o default do motor.
     */
    readonly sector?: string | undefined;
    /**
     * Refresh de admin do catálogo setorial (CFG-17), derivado da fonte citada.
     * Omitido = as taxas de fábrica. Resolvido por `resolveSectorRateRegistry`.
     */
    readonly sectorRateRegistry?: SectorRateRegistry | undefined;
}

/** Config efetivamente aplicada — horizonte nas DUAS formas (auditável, CFG-09). */
export interface ResolvedScenarioNpvConfig {
    readonly discountRate: number;
    readonly environmentalDiscountRate: number;
    /** Duração da série (anos após t₀), já dentro da faixa validada. */
    readonly horizonYears: number;
    /**
     * Taxa da PRIMEIRA fase (compatibilidade: era o `g` único). Com cronograma
     * por fase, a série completa está em `growth.phases` — este campo sozinho
     * não descreve mais a inclinação inteira.
     */
    readonly growthRate: number;
    /** Ano-base t₀; `null` quando o cálculo é puramente relativo. */
    readonly baseYear: number | null;
    /** Ano-marco absoluto correspondente; `null` sem âncora (N3). */
    readonly horizonYear: number | null;
    /** Horizonte resolvido completo (inclui `adjusted`/`milestone`). */
    readonly horizon: ResolvedHorizon;
    /** Cronograma de crescimento aplicado (CFG-10); 1 fase = o `g` constante. */
    readonly growth: ResolvedGrowthSchedule;
    /** Curva de demanda aplicada (CFG-12); geométrica = a série de sempre. */
    readonly curve: ResolvedDemandCurve;
    /** Inflação aplicada (CFG-14); inativa = o veredito é NOMINAL, como sempre. */
    readonly inflation: ResolvedInflation;
    /**
     * Perfil de risco resolvido (CFG-16) — de QUEM é a TMA aplicada, com fonte.
     * Sem perfil pedido é o default `projeto`, e as taxas acima seguem sendo as
     * de sempre: o perfil só preenche o que o chamador não informou.
     */
    readonly riskProfile: ResolvedRiskProfile;
    /**
     * Setor resolvido (CFG-17) — a taxa que ele sugeriu e a FONTE dela. Sem
     * setor pedido, `discountRate` é `null`: não há o que pré-preencher, e a
     * ausência não vira 8% forjado (N3).
     */
    readonly sector: ResolvedSectorRate;
}

/** Decomposição do ΔNPV em parcelas (valor presente, sinal já normalizado). */
export interface ScenarioNpvParcels {
    /** −ΔCAPEX (t₀, não descontado). `null` = sem dado. */
    readonly capex: number | null;
    /** −PV(ΔOPEX anual). `null` = sem dado. */
    readonly opex: number | null;
    /** +PV(ΔECBT anual). `null` = sem dado. */
    readonly ecbt: number | null;
}

/**
 * Visão REAL do veredito (CFG-14) — as mesmas parcelas descontadas pela taxa
 * REAL de Fisher, isto é, em reais do ano-base. Só existe quando há um índice
 * de inflação ativo; sem ele o nominal JÁ É o real (π=0) e não há segunda visão.
 */
export interface ScenarioNpvRealView {
    /** ΔNPV em moeda constante do ano-base (R$; mais = melhora). */
    readonly valor: number | null;
    readonly sinal: NpvSinal;
    readonly parcelas: ScenarioNpvParcels;
    /** Taxa real do projeto: `(1+r)/(1+π) − 1`. */
    readonly discountRate: number;
    /** Taxa real do eixo ambiental (mesma relação de Fisher). */
    readonly environmentalDiscountRate: number;
    /** O índice π efetivamente aplicado (dentro da faixa validada). */
    readonly inflationRate: number;
}

/** Veredito ΔNPV consolidado (S1). */
export interface ScenarioNpvVerdict {
    /** ΔNPV consolidado (R$; mais = melhora). `null` se alguma parcela falta. */
    readonly valor: number | null;
    readonly sinal: NpvSinal;
    readonly parcelas: ScenarioNpvParcels;
    readonly semDado: boolean;
    /** Parâmetros efetivamente usados (auditabilidade da fórmula). */
    readonly config: Readonly<ResolvedScenarioNpvConfig>;
    readonly unidade: 'R$';
    /**
     * Visão REAL, ALÉM do nominal (CFG-14). `null` sem inflação ativa — e é o
     * `null` correto: com π=0 o valor nominal já é o real (N3: nada é forjado).
     */
    readonly real: ScenarioNpvRealView | null;
}

const DEFAULT_DISCOUNT_RATE = 0.08;

/** Número finito ou null (N3: NaN/Infinity nunca viram valor). */
function finiteOrNull(v: number | null | undefined): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Primeira taxa presente da cadeia de precedência (CFG-16 > CFG-17), com o
 * default do motor no fim. Nenhum candidato presente devolve o MESMO double
 * `DEFAULT_DISCOUNT_RATE` — é o que mantém o caminho sem preset bit-a-bit igual
 * ao de antes dos presets existirem.
 *
 * @param candidates - Taxas candidatas em ordem de precedência (`null` = ausente).
 * @returns A primeira taxa presente, ou o default do motor.
 */
function firstRate(...candidates: ReadonlyArray<number | null>): number {
    for (const c of candidates) {
        if (c !== null) return c;
    }
    return DEFAULT_DISCOUNT_RATE;
}

/**
 * Valor presente de uma série anual `x·(1+g)^(t−1)` para t=1..H, descontada
 * a `r`: Σ x·(1+g)^(t−1)/(1+r)^t. Loop explícito (fórmula auditável, H pequeno).
 *
 * @param annual - Valor anual em t=1 (R$/ano).
 * @param rate - Taxa de desconto (fração/ano, > −1).
 * @param growth - Crescimento anual do driver (fração/ano).
 * @param horizonYears - Nº de anos da série (inteiro ≥ 1).
 * @returns Valor presente da série (R$).
 */
export function presentValueOfAnnualSeries(
    annual: number,
    rate: number,
    growth: number,
    horizonYears: number,
): number {
    let pv = 0;
    for (let t = 1; t <= horizonYears; t++) {
        pv += (annual * Math.pow(1 + growth, t - 1)) / Math.pow(1 + rate, t);
    }
    return pv;
}

/**
 * Valor presente da série anual quando o crescimento varia POR FASE (CFG-10):
 * `Σₜ x·Π(1+g(y))/(1+r)^t`, com o passo do ano relativo t governado pela fase
 * vigente no ano ABSOLUTO `baseYear + t`.
 *
 * Cronograma de fase única cai em {@link presentValueOfAnnualSeries} — o mesmo
 * laço de sempre, resultado bit-a-bit idêntico ao anterior ao CFG-10.
 *
 * CFG-12: com uma curva NÃO geométrica o fator anual passa a vir de
 * `demandFactorAt`, ancorado no PRIMEIRO ano da série (a parcela de t=1 é a não
 * crescida, como sempre foi). A curva geométrica — e a ausência de curva — não
 * entram nesse branch: seguem no laço original, sem uma multiplicação a mais.
 *
 * @param annual - Valor anual em t=1 (R$/ano).
 * @param rate - Taxa de desconto (fração/ano, > −1).
 * @param growth - Cronograma de crescimento já resolvido.
 * @param baseYear - Ano-base t₀ que ancora as fases (anos absolutos).
 * @param horizonYears - Nº de anos da série (inteiro ≥ 1).
 * @param curve - Curva de demanda resolvida (CFG-12); omitida = geométrica.
 * @returns Valor presente da série (R$).
 */
export function presentValueOfPhasedSeries(
    annual: number,
    rate: number,
    growth: ResolvedGrowthSchedule,
    baseYear: number,
    horizonYears: number,
    curve?: ResolvedDemandCurve,
): number {
    if (curve !== undefined && curve.kind !== 'geometric') {
        let pvCurve = 0;
        // Âncora = 1º ano da série (baseYear+1): F(1)=1, como no laço original.
        for (let t = 1; t <= horizonYears; t++) {
            const factor = demandFactorAt(curve, growth, baseYear + 1, baseYear + t);
            pvCurve += (annual * factor) / Math.pow(1 + rate, t);
        }
        return pvCurve;
    }
    if (!growth.phased) {
        return presentValueOfAnnualSeries(annual, rate, growthRateAt(growth, baseYear), horizonYears);
    }
    let pv = 0;
    let factor = 1;
    for (let t = 1; t <= horizonYears; t++) {
        pv += (annual * factor) / Math.pow(1 + rate, t);
        // Fator do PRÓXIMO ano: passo que sai do ano absoluto (baseYear + t).
        factor *= 1 + growthRateAt(growth, baseYear + t);
    }
    return pv;
}

/**
 * Normaliza a config com defaults e sanitiza valores absurdos. O horizonte é
 * delegado a `resolveHorizon` (CFG-09) — o MESMO resolvedor da projeção §5.2,
 * então "horizonte 2045" e "horizonte 19 anos" são o mesmo parâmetro escrito de
 * dois jeitos, e a faixa (mín. 1 ano, teto de 100) vale para os dois motores.
 */
function resolveConfig(config?: ScenarioNpvConfig): ResolvedScenarioNpvConfig {
    // CFG-16: o perfil só ENTRA na cadeia de fallback quando foi PEDIDO. Sem
    // pedido, `profileRate` é null e a cadeia abaixo é literalmente a de antes
    // do CFG-16 — cai no MESMO double `DEFAULT_DISCOUNT_RATE`, não num 0.08 que
    // veio de outro lugar e por acaso coincide.
    const riskProfile = resolveRiskProfile({ profile: config?.riskProfile });
    const profileAsked = riskProfile.requestedKey !== null;
    const profileRate = profileAsked ? riskProfile.discountRate : null;
    const profileEnvRate = profileAsked ? riskProfile.environmentalDiscountRate : null;
    // CFG-17: o setor PRÉ-PREENCHE, então entra na cadeia ABAIXO do perfil.
    const sector = resolveSectorRate({ sector: config?.sector }, config?.sectorRateRegistry);

    const rRaw = finiteOrNull(config?.discountRate);
    // Taxa explícita VENCE perfil e setor: um campo novo não reescreve em
    // silêncio o número que o chamador já mandava (precedência visível na
    // config). Nenhum dos dois pedido ⇒ o MESMO `DEFAULT_DISCOUNT_RATE` de
    // sempre, não um 0.08 vindo de catálogo que por acaso coincide.
    const rFallback = firstRate(profileRate, sector.discountRate);
    const r = rRaw !== null && rRaw > -1 ? rRaw : rFallback;
    const rEnvRaw = finiteOrNull(config?.environmentalDiscountRate);
    // Perfil sem taxa ambiental própria mantém a regra de sempre: rEnv = r.
    const rEnvFallback = profileEnvRate !== null ? profileEnvRate : r;
    const rEnv = rEnvRaw !== null && rEnvRaw > -1 ? rEnvRaw : rEnvFallback;
    const horizon = resolveHorizon({
        baseYear: config?.baseYear,
        horizonYear: config?.horizonYear,
        horizonYears: config?.horizonYears,
    });
    const gRaw = finiteOrNull(config?.growthRate);
    const growth = resolveGrowthSchedule(config?.growthSchedule, horizon.baseYear, gRaw !== null ? gRaw : 0);
    return Object.freeze({
        discountRate: r,
        environmentalDiscountRate: rEnv,
        horizonYears: horizon.horizonYears,
        growthRate: growthRateAt(growth, horizon.baseYear ?? 0),
        baseYear: horizon.baseYear,
        horizonYear: horizon.horizonYear,
        horizon,
        growth,
        curve: resolveDemandCurve(config?.demandCurve),
        inflation: resolveInflation(config?.inflationRate),
        riskProfile,
        sector,
    });
}

/** Deltas já sanitizados (N3: não-finito virou `null` antes de entrar aqui). */
interface FiniteDeltas {
    readonly capex: number | null;
    readonly opex: number | null;
    readonly ecbt: number | null;
}

/** Consolidação de UM par de taxas — a base do nominal e da visão real (CFG-14). */
interface NpvAtRates {
    readonly parcelas: ScenarioNpvParcels;
    readonly valor: number | null;
    readonly sinal: NpvSinal;
    readonly allPresent: boolean;
}

/**
 * Consolida as parcelas para UM par de taxas (projeto + ambiental). O caminho
 * NOMINAL chama isto com as taxas da config — as mesmas operações, na mesma
 * ordem, de antes do CFG-14; a visão REAL chama de novo com as taxas de Fisher.
 *
 * @param deltas - Deltas F7 já sanitizados (`null` = sem dado).
 * @param rate - Taxa de desconto do projeto aplicada às parcelas de OPEX.
 * @param envRate - Taxa de desconto do eixo ambiental (ΔECBT).
 * @param cfg - Config resolvida (horizonte, crescimento, curva).
 * @param anchor - Ano-base que ancora as fases (0 quando o cálculo é relativo).
 * @returns Parcelas, valor consolidado e sinal para aquele par de taxas.
 */
function consolidateAtRates(
    deltas: FiniteDeltas,
    rate: number,
    envRate: number,
    cfg: ResolvedScenarioNpvConfig,
    anchor: number,
): NpvAtRates {
    // Parcelas em valor presente, sinal normalizado "mais = melhor".
    // ΔCAPEX é fluxo de t₀: já está em moeda do ano-base, inflação não o toca.
    const pCapex = deltas.capex === null ? null : -deltas.capex;
    const pOpex =
        deltas.opex === null
            ? null
            : -presentValueOfPhasedSeries(deltas.opex, rate, cfg.growth, anchor, cfg.horizonYears, cfg.curve);
    const pEcbt =
        deltas.ecbt === null
            ? null
            : presentValueOfPhasedSeries(deltas.ecbt, envRate, cfg.growth, anchor, cfg.horizonYears, cfg.curve);

    const parcelas: ScenarioNpvParcels = Object.freeze({ capex: pCapex, opex: pOpex, ecbt: pEcbt });

    // N3: sem TODAS as parcelas não há veredito consolidado honesto.
    const allPresent = pCapex !== null && pOpex !== null && pEcbt !== null;
    const raw = allPresent ? (pCapex as number) + (pOpex as number) + (pEcbt as number) : null;

    let sinal: NpvSinal;
    if (raw === null || !Number.isFinite(raw)) sinal = 'semDado';
    else if (raw === 0) sinal = 'neutro';
    else sinal = raw > 0 ? 'melhora' : 'piora';

    return {
        parcelas,
        valor: raw !== null && Number.isFinite(raw) ? raw : null,
        sinal,
        allPresent,
    };
}

/**
 * Consolida os deltas F7 num ΔNPV único de ciclo de vida (S1).
 *
 * Fórmula (mais = melhor):
 *   ΔNPV = −ΔCAPEX + Σₜ [−ΔOPEX·(1+g)^(t−1)]/(1+r)^t + Σₜ [ΔECBT·(1+g)^(t−1)]/(1+r_env)^t
 *
 * CFG-14: informando `inflationRate`, o veredito ganha `real` — as MESMAS
 * parcelas descontadas pelas taxas reais de Fisher `(1+r)/(1+π)−1`, ou seja em
 * moeda do ano-base. O `valor` de topo continua NOMINAL sempre (a spec pede o
 * real "ALÉM do nominal atual"), então nenhum consumidor muda de significado.
 *
 * @param deltas - Deltas F7 (alt − base); `null` = sem dado.
 * @param config - Taxa(s), horizonte, crescimento, curva e inflação.
 * @returns Veredito congelado com valor, sinal, decomposição e config usada.
 */
export function computeScenarioNpvVerdict(
    deltas: ScenarioNpvDeltas,
    config?: ScenarioNpvConfig,
): ScenarioNpvVerdict {
    const cfg = resolveConfig(config);
    const finite: FiniteDeltas = {
        capex: finiteOrNull(deltas.capexDelta),
        opex: finiteOrNull(deltas.opexDeltaAnnual),
        ecbt: finiteOrNull(deltas.ecbtDeltaAnnual),
    };
    const anchor = cfg.baseYear ?? 0;

    const nominal = consolidateAtRates(finite, cfg.discountRate, cfg.environmentalDiscountRate, cfg, anchor);

    // CFG-14: a visão real só existe com índice ativo. Com π=0 o nominal JÁ é o
    // real — devolver uma cópia seria ruído, e passar 0 pela fórmula de Fisher
    // moveria o 16º dígito da taxa (ver `_scenarioInflationPure.ts`).
    let real: ScenarioNpvRealView | null = null;
    if (cfg.inflation.active) {
        const rReal = fisherRealRate(cfg.discountRate, cfg.inflation);
        const rEnvReal = fisherRealRate(cfg.environmentalDiscountRate, cfg.inflation);
        const consolidated = consolidateAtRates(finite, rReal, rEnvReal, cfg, anchor);
        real = Object.freeze({
            valor: consolidated.valor,
            sinal: consolidated.sinal,
            parcelas: consolidated.parcelas,
            discountRate: rReal,
            environmentalDiscountRate: rEnvReal,
            inflationRate: cfg.inflation.rate,
        });
    }

    return Object.freeze({
        valor: nominal.valor,
        sinal: nominal.sinal,
        parcelas: nominal.parcelas,
        semDado: !nominal.allPresent,
        config: cfg,
        unidade: 'R$',
        real,
    });
}
