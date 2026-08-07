// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO GROWTH SCHEDULE — pure-logic (CFG-10, TEMA D).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-10 — "Crescimento `g` do driver variável por fase (não constante
       o período todo). Hoje `g` é constante. Passa a aceitar g por FAIXA
       TEMPORAL (ex.: 3%/ano até 2030, 1%/ano depois), dentro de faixa validada.
       Default = g único atual. Testável: g=[{até:2030,0.03},{depois,0.01}] →
       série muda de inclinação em 2030."
     - §5.2 — abstração temporal A(t) = A₀ × (1+g)^(t−t₀).

   O QUE FALTAVA: `g` era um ESCALAR nos dois motores temporais
   (`ProjectionParams.activityGrowth` e `ScenarioNpvConfig.growthRate`), aplicado
   com `Math.pow(1+g, k)` — uma única inclinação para o horizonte inteiro. Não
   havia como dizer "cresce 3%/ano até 2030 e 1%/ano depois", que é o formato em
   que projeção de demanda real chega (metas por período, planos plurianuais,
   trajetórias SSP por década).

   O QUE ESTE MÓDULO FAZ: generaliza `(1+g)^k` para o produto dos passos anuais
       A(t) = A₀ × Π_{y=t₀}^{t−1} (1 + g(y))
   onde `g(y)` é a taxa da FASE vigente no ano `y`. Com uma fase só o produto
   volta a ser exatamente `(1+g)^k` — e o caminho constante continua usando
   `Math.pow` (bit-a-bit idêntico ao de antes: zero regressão numérica).

   SEMÂNTICA DE FASE — `fromYear` é o ano A PARTIR do qual a taxa passa a valer,
   governando o passo que SAI daquele ano. Com
   `[{fromYear:2026,g:0.03},{fromYear:2030,g:0.01}]` e ano-base 2026:
       A(2030)/A(2029) = 1.03   (ainda na 1ª fase)
       A(2031)/A(2030) = 1.01   (a inclinação muda EM 2030)
   — exatamente o "3%/ano até 2030, 1%/ano depois" do enunciado.

   ─── N3 — a escolha para "fase ausente" (decisão documentada) ───

   Entre fases não há lacuna: uma fase VIGE até a próxima começar (carry-forward
   — é a definição de função escada). A única lacuna possível é de CABEÇA: anos
   entre o ano-base e o `fromYear` da primeira fase declarada. Para ela a escolha
   é ANCORAR a primeira fase no ano-base (usar a taxa declarada mais próxima),
   NÃO assumir g=0. Razão:

     - assumir 0 seria AFIRMAR um fato que o usuário não deu ("não cresce"),
       exatamente o zero-forjado que o N3 proíbe em toda a base;
     - devolver semDado apodreceria a projeção inteira por causa de um detalhe de
       configuração — desproporcional, e a spec nem exemplifica lacuna de cabeça;
     - ancorar só REUSA um número que o próprio usuário forneceu, sem inventar
       nenhum valor novo.

   A escolha é reversível e explícita: quem quer cabeça plana declara
   `{fromYear: anoBase, g: 0}`. E o ajuste nunca é silencioso — o resultado
   carrega `anchored`, `clamped` e `rejected` para auditoria.

   Fase com `g`/`fromYear` não-finito é DESCARTADA (contada em `rejected`), nunca
   coagida a 0. Se todas caírem, vale o escalar de fallback (= comportamento de
   hoje).

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

// ───────────────────────────── Faixa validada ─────────────────────────────

/**
 * Piso da taxa anual (−90%/ano). Abaixo disso `1+g` chegaria a zero/negativo e a
 * composição trocaria de sinal — o driver deixaria de ser fisicamente um driver.
 */
export const MIN_GROWTH_RATE = -0.9;

/** Teto da taxa anual (+100%/ano) — cobre ramp-up agressivo, barra absurdo. */
export const MAX_GROWTH_RATE = 1.0;

/** Taxa default: 0 (série constante) — o mesmo default de hoje (CFG-10). */
export const DEFAULT_GROWTH_RATE = 0;

// ───────────────────────────── Tipos ─────────────────────────────

/** Uma FASE de crescimento: a taxa `g` vale a partir de `fromYear` (inclusive). */
export interface GrowthPhase {
    /** Ano (ABSOLUTO) a partir do qual a taxa passa a governar os passos anuais. */
    readonly fromYear: number;
    /** Crescimento anual do driver nesta fase (fração/ano). */
    readonly g: number;
}

/** Cronograma resolvido — o que de fato governa a série (auditável). */
export interface ResolvedGrowthSchedule {
    /** Fases normalizadas: `fromYear` crescente, sem duplicata, ancoradas. */
    readonly phases: ReadonlyArray<GrowthPhase>;
    /** `true` com mais de uma fase — a série MUDA de inclinação no horizonte. */
    readonly phased: boolean;
    /** `true` quando a 1ª fase foi ancorada no ano-base (havia lacuna de cabeça). */
    readonly anchored: boolean;
    /** Nº de fases com `g` fora da faixa validada, trazidas para dentro dela. */
    readonly clamped: number;
    /** Nº de fases descartadas por dado não-finito (N3 — nunca coagidas a 0). */
    readonly rejected: number;
    /**
     * `true` quando um cronograma por fase foi DESCARTADO por falta de ano-base
     * (as fases são anos ABSOLUTOS; sem âncora não há onde encaixá-las) — nesse
     * caso vale o escalar de fallback, e o descarte fica visível aqui.
     */
    readonly unanchored: boolean;
}

// ───────────────────────────── Helpers ─────────────────────────────

/** Número finito ou `null` (N3: NaN/Infinity nunca viram valor). */
function finiteOrNull(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Ano como inteiro finito, ou `null`. */
function finiteIntOrNull(v: unknown): number | null {
    const n = finiteOrNull(v);
    return n === null ? null : Math.floor(n);
}

/** Traz `g` para a faixa validada (§ MIN/MAX_GROWTH_RATE). */
function clampGrowth(g: number): number {
    return Math.min(MAX_GROWTH_RATE, Math.max(MIN_GROWTH_RATE, g));
}

/** Cronograma de uma fase só (o caso constante — comportamento de hoje). */
function constantSchedule(
    g: number,
    baseYear: number | null,
    extra: { readonly unanchored?: boolean; readonly rejected?: number } = {},
): ResolvedGrowthSchedule {
    const raw = finiteOrNull(g) ?? DEFAULT_GROWTH_RATE;
    const value = clampGrowth(raw);
    return Object.freeze({
        phases: Object.freeze([Object.freeze({ fromYear: baseYear ?? 0, g: value })]) as ReadonlyArray<GrowthPhase>,
        phased: false,
        anchored: false,
        clamped: value !== raw ? 1 : 0,
        rejected: extra.rejected ?? 0,
        unanchored: extra.unanchored === true,
    });
}

// ───────────────────────────── Resolução ─────────────────────────────

/**
 * Resolve o crescimento do driver num cronograma normalizado (CFG-10). Aceita as
 * duas formas: o ESCALAR de hoje (uma fase, série de inclinação única) ou um
 * ARRAY de fases `{fromYear, g}` (a série muda de inclinação nos anos de virada).
 *
 * Normalização: fases com dado não-finito são descartadas (`rejected`, nunca
 * viram 0); `g` fora da faixa validada é trazido para dentro (`clamped`); as
 * fases são ordenadas por `fromYear` e, havendo repetição do mesmo ano, a
 * ÚLTIMA declarada vence (mesma regra last-wins da estratégia CFG-08); e a
 * primeira fase é ANCORADA no ano-base se começar depois dele — a escolha N3
 * documentada no cabeçalho (usar a taxa declarada mais próxima em vez de forjar
 * um g=0 que o usuário nunca deu).
 *
 * Sem ano-base um cronograma por fase é descartado (`unanchored`), porque
 * `fromYear` é ano ABSOLUTO e não há onde encaixá-lo; vale então o escalar.
 *
 * @param schedule - Array de fases, ou `undefined` para usar só o escalar.
 * @param baseYear - Ano-base t₀ da série (âncora); `null` = série sem âncora.
 * @param fallbackRate - Taxa escalar usada quando não há cronograma utilizável.
 * @returns {@link ResolvedGrowthSchedule} congelado, com os ajustes visíveis.
 */
export function resolveGrowthSchedule(
    schedule: ReadonlyArray<GrowthPhase> | undefined,
    baseYear: number | null,
    fallbackRate: number = DEFAULT_GROWTH_RATE,
): ResolvedGrowthSchedule {
    if (!Array.isArray(schedule) || schedule.length === 0) {
        return constantSchedule(fallbackRate, baseYear);
    }
    // Fases são anos ABSOLUTOS: sem âncora não há onde encaixá-las (visível).
    if (baseYear === null) {
        return constantSchedule(fallbackRate, baseYear, { unanchored: true });
    }

    let rejected = 0;
    let clamped = 0;
    const byYear = new Map<number, number>();
    for (const phase of schedule) {
        const year = phase && typeof phase === 'object' ? finiteIntOrNull(phase.fromYear) : null;
        const gRaw = phase && typeof phase === 'object' ? finiteOrNull(phase.g) : null;
        // N3: fase sem dado utilizável sai fora — não vira 0 nem ano forjado.
        if (year === null || gRaw === null) {
            rejected += 1;
            continue;
        }
        const g = clampGrowth(gRaw);
        if (g !== gRaw) clamped += 1;
        byYear.set(year, g); // mesmo ano declarado 2×: a última vence (CFG-08).
    }

    if (byYear.size === 0) return constantSchedule(fallbackRate, baseYear, { rejected });

    const sorted = [...byYear.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([fromYear, g]) => ({ fromYear, g }));

    // Lacuna de CABEÇA → ancora a 1ª fase no ano-base (escolha N3 documentada).
    const first = sorted[0] as { fromYear: number; g: number };
    const anchored = first.fromYear > baseYear;
    if (anchored) first.fromYear = baseYear;

    return Object.freeze({
        phases: Object.freeze(sorted.map((p) => Object.freeze(p))) as ReadonlyArray<GrowthPhase>,
        phased: sorted.length > 1,
        anchored,
        clamped,
        rejected,
        unanchored: false,
    });
}

// ───────────────────────────── Consulta ─────────────────────────────

/**
 * Taxa vigente no ano `year` — a que governa o passo que SAI dele (`year` →
 * `year+1`). É a última fase cujo `fromYear ≤ year`; antes da primeira fase vale
 * a própria primeira (carry-backward, a mesma escolha N3 do ancoramento).
 *
 * @param schedule - Cronograma já resolvido.
 * @param year - Ano (absoluto) de onde o passo anual parte.
 * @returns A taxa `g` daquele passo (0 se o cronograma estiver vazio).
 */
export function growthRateAt(schedule: ResolvedGrowthSchedule, year: number): number {
    const phases = schedule.phases;
    if (phases.length === 0) return DEFAULT_GROWTH_RATE;
    let current = (phases[0] as GrowthPhase).g;
    for (const phase of phases) {
        if (phase.fromYear > year) break;
        current = phase.g;
    }
    return current;
}

/**
 * Fator de crescimento acumulado do ano-base até `year`:
 * `Π_{y=baseYear}^{year−1} (1 + g(y))` — a generalização por fase de `(1+g)^k`.
 *
 * Caminho constante (uma fase) usa `Math.pow`, devolvendo exatamente o mesmo
 * número do motor anterior ao CFG-10 — a garantia de zero regressão numérica.
 *
 * @param schedule - Cronograma já resolvido.
 * @param baseYear - Ano-base t₀ (início da acumulação).
 * @param year - Ano (absoluto) cujo fator se quer; `≤ baseYear` devolve 1.
 * @returns O fator multiplicativo acumulado (adimensional, > 0).
 */
export function cumulativeGrowthFactor(
    schedule: ResolvedGrowthSchedule,
    baseYear: number,
    year: number,
): number {
    const steps = year - baseYear;
    if (!Number.isFinite(steps) || steps <= 0) return 1;
    if (!schedule.phased) {
        return Math.pow(1 + growthRateAt(schedule, baseYear), steps);
    }
    let factor = 1;
    for (let y = baseYear; y < year; y += 1) factor *= 1 + growthRateAt(schedule, y);
    return factor;
}
