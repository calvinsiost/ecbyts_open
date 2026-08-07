// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO DEMAND CURVE — pure-logic (CFG-12, TEMA D).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-12 — "Curva de demanda do driver selecionável (geométrica
       simples vs. cenários SSP/IPCC). Hoje a projeção é geométrica simples.
       Vira opção curada: {geométrica (default), linear, SSP1..SSP5}. SSP é
       opcional/avançado (ver §5.2-d)."
     - §5.2 (d) — "Na Fase 1 o A(t) é projetado por uma taxa simples (constante
       ou LINEAR); a Fase 2 pode acoplar os SSP."
     - §5.2 (abstração temporal) — A(t) = A₀ × (1+g)^(t−t₀).

   O QUE FALTAVA (verificado no código antes de escrever): a FORMA da curva era
   a única coisa não-parametrizável do eixo temporal. O CFG-09 abriu o horizonte
   e o CFG-10 abriu o `g` (por fase), mas os dois motores continuavam compondo o
   crescimento de UM jeito só — `cumulativeGrowthFactor` multiplica `(1+g)` ano a
   ano, ou seja, juros compostos. Demanda que cresce por incremento FIXO (uma
   meta plurianual de "+50 kt/ano") ou que SATURA numa capacidade instalada
   (curva-S, o comportamento normal de adoção/expansão industrial) era
   inexprimível: o usuário só podia escolher QUANTO cresce, nunca COMO.

   O QUE ESTE MÓDULO FAZ: transforma o fator acumulado A(t)/A₀ numa FAMÍLIA
   selecionável, alimentada pelo MESMO cronograma por fase do CFG-10 (nenhuma
   duplicação: a taxa continua vindo de `_scenarioGrowthPure`). Com `k` = anos
   desde t₀ e `G = Σ g(y)` a soma das taxas do período:

     • geométrica (DEFAULT) — A(t)/A₀ = Π(1 + g(y))   [= (1+g)^k com 1 fase]
       composto; é literalmente a chamada delegada a `cumulativeGrowthFactor`,
       logo o default é BIT-A-BIT o comportamento de hoje (zero regressão).
     • linear — A(t)/A₀ = 1 + G                        [= 1 + g·k com 1 fase]
       incremento constante sobre a BASE (juros simples). É a "taxa simples
       linear" que a §5.2-d nomeia como opção de Fase 1.
     • logística (curva-S) — A(t)/A₀ = S / (1 + (S−1)·e^(−G))
       crescimento que desacelera ao se aproximar de uma capacidade `S` (múltiplo
       de A₀). Em k=0 vale 1 por construção; com G→∞ tende a `S`; com uma fase
       só, G = g·k e a expressão é a logística clássica.

   ─── SSP1..SSP5: por que NÃO vêm neste commit (decisão explícita) ───

   A spec lista SSP1..SSP5 no MESMO bullet, marcados "opcional/avançado" e
   "Fase futura" (§5.2-d: Fase 1 = taxa simples; Fase 2 = acopla SSP). Uma
   trajetória SSP não é uma forma funcional — é uma SÉRIE DE DADOS publicada
   (IIASA SSP Database / IPCC AR6). Cravar aqui números "de SSP2" sem essa fonte
   seria exatamente o dado forjado que o N3 proíbe em toda a base, e ficaria
   pior que a ausência: um número inventado com aparência de citação.

   O acoplamento fica PRONTO e sem código novo: uma trajetória SSP entra como o
   cronograma por fase do CFG-10 (taxas por década vindas da fonte) combinado com
   a curva escolhida — `{curve:'geometric', growthSchedule:[{fromYear:2030,g:…}]}`.
   Quando a série curada existir no repo, o SSP vira um PRESET de cronograma, não
   uma quarta fórmula.

   ─── N3 — as duas escolhas documentadas ───

   1. Logística SEM capacidade declarada: a curva-S é indefinida sem `S` (é o
      parâmetro que a define). Inventar um `S` seria afirmar uma capacidade que
      o usuário nunca deu. Então o pedido é REJEITADO e cai na geométrica, com
      `fallback:true` visível no resultado — nunca em silêncio.
   2. Curva desconhecida (string fora do catálogo curado): mesmo tratamento —
      geométrica + `fallback:true`, jamais uma série vazia ou um erro mudo.

   Faixa de `S` (guard-rail ESTRUTURAL, não citação): `S > 1` é exigido porque
   com `S ≤ 1` o denominador `1 + (S−1)·e^(−G)` pode zerar para `G < 0` e a curva
   explode/troca de sinal — o motor deixaria de ser um motor. Piso 1.01 (abaixo
   disso a curva-S é indistinguível de uma reta plana e o parâmetro não descreve
   mais nada) e teto 100× (acima disso a logística é numericamente uma
   exponencial dentro do horizonte máximo de 100 anos do CFG-09).

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

import {
    cumulativeGrowthFactor,
    growthRateAt,
    type ResolvedGrowthSchedule,
} from './_scenarioGrowthPure.js';

// ───────────────────────────── Catálogo curado ─────────────────────────────

/** Formas de curva do driver A(t) oferecidas (catálogo CURADO — guard-rail §2.4.0). */
export type DemandCurveKind = 'geometric' | 'linear' | 'logistic';

/** As curvas aceitas, para a tela (CFG-11) montar o seletor sem duplicar a lista. */
export const CURATED_DEMAND_CURVES: readonly DemandCurveKind[] = Object.freeze([
    'geometric',
    'linear',
    'logistic',
]);

/** Curva default: geométrica — o composto `(1+g)^k` de hoje (zero regressão). */
export const DEFAULT_DEMAND_CURVE: DemandCurveKind = 'geometric';

/** Piso da capacidade da logística (múltiplo de A₀); ver guard-rail estrutural. */
export const MIN_SATURATION_MULTIPLE = 1.01;

/** Teto da capacidade da logística (múltiplo de A₀); ver guard-rail estrutural. */
export const MAX_SATURATION_MULTIPLE = 100;

// ───────────────────────────── Tipos ─────────────────────────────

/** Pedido de curva. A forma curta (só o nome) cobre geométrica e linear. */
export interface DemandCurveSpec {
    /** Nome da curva desejada; fora do catálogo curado → geométrica + `fallback`. */
    readonly kind?: string | undefined;
    /**
     * Capacidade da logística como MÚLTIPLO de A₀ (ex.: 2 = satura no dobro).
     * Obrigatório para `logistic`; ignorado nas demais. Sem ele o pedido de
     * logística é rejeitado (N3 — não se inventa capacidade).
     */
    readonly saturationMultiple?: number | undefined;
}

/** Curva resolvida — o que de fato governa A(t) (auditável). */
export interface ResolvedDemandCurve {
    /** A curva efetivamente aplicada (nunca `null`: há sempre um default). */
    readonly kind: DemandCurveKind;
    /** Capacidade da logística já dentro da faixa; `null` nas outras curvas (N3). */
    readonly saturationMultiple: number | null;
    /** O nome pedido pelo chamador; `null` quando nada foi pedido (auditoria). */
    readonly requested: string | null;
    /** `true` quando o pedido não pôde ser honrado e valeu a geométrica. */
    readonly fallback: boolean;
    /** `true` quando a capacidade pedida foi trazida para dentro da faixa. */
    readonly clamped: boolean;
}

// ───────────────────────────── Helpers ─────────────────────────────

/** Número finito ou `null` (N3: NaN/Infinity nunca viram valor). */
function finiteOrNull(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** A curva pedida está no catálogo curado? */
function isCuratedCurve(kind: string): kind is DemandCurveKind {
    return (CURATED_DEMAND_CURVES as readonly string[]).includes(kind);
}

/** Resultado congelado padrão (evita repetir o `Object.freeze` em 4 saídas). */
function freezeCurve(
    kind: DemandCurveKind,
    saturationMultiple: number | null,
    requested: string | null,
    fallback: boolean,
    clamped: boolean,
): ResolvedDemandCurve {
    return Object.freeze({ kind, saturationMultiple, requested, fallback, clamped });
}

// ───────────────────────────── Resolução ─────────────────────────────

/**
 * Resolve o pedido de curva do driver (CFG-12) no descritor que os motores
 * consomem — o mesmo papel que `resolveHorizon` (CFG-09) e
 * `resolveGrowthSchedule` (CFG-10) cumprem para os outros dois parâmetros do
 * eixo temporal.
 *
 * Aceita a forma curta (`'linear'`) e a completa (`{kind, saturationMultiple}`).
 * Pedido fora do catálogo curado, ou logística sem capacidade utilizável, cai na
 * GEOMÉTRICA com `fallback:true` — o ajuste fica visível, nunca silencioso (N3).
 *
 * @param spec - Nome da curva, descritor completo, ou `undefined` (= default).
 * @returns {@link ResolvedDemandCurve} congelado, com os ajustes auditáveis.
 */
export function resolveDemandCurve(
    spec?: DemandCurveSpec | DemandCurveKind | string | undefined,
): ResolvedDemandCurve {
    if (spec === undefined || spec === null) {
        return freezeCurve(DEFAULT_DEMAND_CURVE, null, null, false, false);
    }

    const asObject = typeof spec === 'object' ? spec : null;
    const rawKind = typeof spec === 'string' ? spec : typeof asObject?.kind === 'string' ? asObject.kind : null;
    const requested = rawKind;

    if (rawKind === null || !isCuratedCurve(rawKind)) {
        // Fora do catálogo curado → geométrica, com o descarte visível.
        return freezeCurve(DEFAULT_DEMAND_CURVE, null, requested, requested !== null, false);
    }

    if (rawKind !== 'logistic') {
        return freezeCurve(rawKind, null, requested, false, false);
    }

    // Logística: a capacidade É a curva. Sem ela não há o que projetar (N3).
    const sRaw = finiteOrNull(asObject?.saturationMultiple);
    if (sRaw === null) {
        return freezeCurve(DEFAULT_DEMAND_CURVE, null, requested, true, false);
    }
    const s = Math.min(MAX_SATURATION_MULTIPLE, Math.max(MIN_SATURATION_MULTIPLE, sRaw));
    return freezeCurve('logistic', s, requested, false, s !== sRaw);
}

// ───────────────────────────── Aplicação ─────────────────────────────

/**
 * Soma das taxas anuais do ano-base até `year` — `G = Σ_{y=t₀}^{year−1} g(y)`,
 * a generalização por fase de `g·k`. É o argumento comum das curvas NÃO
 * compostas (linear e logística), que somam a taxa em vez de multiplicá-la.
 *
 * @param schedule - Cronograma de crescimento já resolvido (CFG-10).
 * @param baseYear - Ano-base t₀ (início da acumulação).
 * @param year - Ano (absoluto) alvo; `≤ baseYear` devolve 0.
 * @returns A soma acumulada das taxas (adimensional).
 */
export function cumulativeGrowthSum(
    schedule: ResolvedGrowthSchedule,
    baseYear: number,
    year: number,
): number {
    const steps = year - baseYear;
    if (!Number.isFinite(steps) || steps <= 0) return 0;
    // Fase única: a forma fechada `g·k` (a fórmula que o cabeçalho documenta).
    if (!schedule.phased) return growthRateAt(schedule, baseYear) * steps;
    let sum = 0;
    for (let y = baseYear; y < year; y += 1) sum += growthRateAt(schedule, y);
    return sum;
}

/**
 * Fator acumulado A(t)/A₀ segundo a curva escolhida (CFG-12) — o ponto único
 * onde a FORMA da projeção é decidida. Substitui a chamada direta a
 * `cumulativeGrowthFactor` nos motores.
 *
 * A curva geométrica (default) DELEGA a `cumulativeGrowthFactor`: é a mesma
 * função de antes do CFG-12, então o caminho default é bit-a-bit idêntico por
 * construção, não por coincidência numérica.
 *
 * O piso 0 da linear é modelagem declarada, não zero forjado: o driver é uma
 * grandeza física (t/ano, m³/ano) e a reta pode cruzar o zero aritmeticamente —
 * o fluxo se extingue, não passa a ser negativo.
 *
 * @param curve - Curva já resolvida por {@link resolveDemandCurve}.
 * @param schedule - Cronograma de crescimento (CFG-10) que alimenta a curva.
 * @param baseYear - Ano-base t₀ da série.
 * @param year - Ano (absoluto) cujo fator se quer; `≤ baseYear` devolve 1.
 * @returns O fator multiplicativo acumulado (adimensional, ≥ 0).
 */
export function demandFactorAt(
    curve: ResolvedDemandCurve,
    schedule: ResolvedGrowthSchedule,
    baseYear: number,
    year: number,
): number {
    if (curve.kind === 'geometric') {
        return cumulativeGrowthFactor(schedule, baseYear, year);
    }
    const sum = cumulativeGrowthSum(schedule, baseYear, year);
    if (curve.kind === 'linear') {
        // Incremento constante sobre a BASE; piso físico em 0 (ver JSDoc).
        return Math.max(0, 1 + sum);
    }
    // Logística: S > 1 garantido na resolução ⇒ denominador sempre > 0.
    const s = curve.saturationMultiple as number;
    return s / (1 + (s - 1) * Math.exp(-sum));
}
