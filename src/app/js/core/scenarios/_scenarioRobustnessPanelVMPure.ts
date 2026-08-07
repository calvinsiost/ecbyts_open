// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO ROBUSTNESS CONTROLS — VM pura do painel (CFG-33/34, TEMA H).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-33 — "Incerteza / faixa P10–P50–P90 (ligar o Monte Carlo que JÁ
       existe). Liga-se ao delta como faixa, configurável (nº de amostras, seed).
       Default = ponto único; modo avançado liga a banda (ver S2)."
     - §2.4 CFG-34 — "Análise de sensibilidade (tornado / one-way) … varredura de
       1 parâmetro por vez (faixa validada) → gráfico tornado."
     - §5.3-c tipos 2 (SENSIBILIDADE) e 4 (INCERTEZA).

   O QUE FALTAVA (verificado no código antes de escrever): o motor
   `_scenarioRobustnessPure.ts` já estava escrito e provado (15/15 em
   `tests/scenario-robustness-pure.test.mjs`), mas ÓRFÃO —
   `grep computeScenarioRobustness src/app/js --include=*.ts` só achava o próprio
   módulo. O painel (`utils/ui/scenarios/scenarioComparatorPanel.ts`) mostrava o
   veredito consolidado como PONTO ÚNICO, que é exatamente o que CFG-33 existe
   para superar. Este módulo é a ponte que faltava: estado dos widgets → motor →
   VM pronta para render (banda + tornado).

   O QUE ESTE MÓDULO FAZ (e o que NÃO faz): decide QUAIS parâmetros são incertos
   (as 3 taxas universais que os sliders editam), monta a função-métrica (o
   MESMO veredito consolidado ΔECBT − ΔCAPEX − ΔOPEX que o painel já exibe) e
   converte o resultado em geometria de barra pronta para o DOM. NENHUMA álgebra
   de custo/ECBT/ODS, NENHUM percentil e NENHUM PRNG moram aqui (anti-N4): quem
   amostra e ranqueia é `computeScenarioRobustness`, quem calcula o delta é
   `computeRealScenarioMetrics` + `buildRealScenarioComparatorVM`. Aqui só há
   mapeamento estado-de-tela ↔ parâmetro-de-motor e projeção para pixels.

   INVARIANTE CENTRAL (o que torna a banda honesta): no ponto central todos os
   parâmetros valem exatamente as taxas do cenário ativo, logo
   `vm.base === consolidado.valor` do painel — BIT A BIT, não por tolerância. A
   banda não substitui o número que o usuário já via: ela o CERCA. O teste
   `tests/scenario-robustness-panel-vm.test.mjs` prova essa igualdade exata.

   ─── Guard-rails §2.4.0 honrados aqui ───

   N3 (nunca inventar dado) + ANTI-SUBSTITUIÇÃO SILENCIOSA — o ponto delicado
   deste wiring. O motor de impacto NÃO é neutro para amostra fora do domínio
   físico, e de três maneiras diferentes:
     1. `_scenarioImpactEnginePure.ts:353` CLAMPA `recoveryRate`/`yield` em [0,1];
     2. `_scenarioImpactEnginePure.ts:352` TROCA silenciosamente um `throughput`
        negativo pelo `base.throughput`;
     3. `_scenarioImpactEnginePure.ts:358` LANÇA (CFG-40) quando `yield >
        recoveryRate`.
   Se a métrica entregasse essas amostras ao motor, os casos 1 e 2 entrariam na
   banda como se fossem o valor SORTEADO (um número ajustado exibido como se
   fosse o pedido — exatamente o que a casa proíbe) e o caso 3 derrubaria o
   painel. Por isso {@link isPhysicalSample} pré-tria cada amostra e devolve
   `null` para as impossíveis: o motor de robustez as DESCARTA (nunca vira 0),
   e o total descartado é publicado em `band.discarded` para a tela mostrar de
   quantas amostras a faixa realmente veio. Sem faixa forjada, sem crash.

   N8 (sem folha em branco): {@link DEFAULT_ROBUSTNESS_STATE} nasce nos MESMOS
   defaults do motor (1000 amostras, seed 42, ±10%), então abrir o bloco sem
   mexer em nada reproduz o comportamento canônico de `computeScenarioRobustness`.

   AUDITABILIDADE: `iterations`/`seed` efetivamente aplicados (já com os clamps
   do motor) voltam na VM, então a tela sempre mostra a configuração REAL da
   rodada — e a banda é reprodutível por seed.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

import {
    computeScenarioRobustness,
    type RobustnessParameter,
    type ScenarioRobustnessResult,
} from './_scenarioRobustnessPure.js';
import {
    computeRealScenarioMetrics,
    type BaseProcess,
} from './_scenarioImpactEnginePure.js';
import { buildRealScenarioComparatorVM } from './_scenarioComparatorVMPure.js';
import { validateRatesCrossRules } from './_scenarioCrossValidationPure.js';
import { paramSetToMutation, type ScenarioParamSet } from './_scenarioComparatorPanelVMPure.js';

// ───────────────────────────── Estado dos widgets ─────────────────────────────

/** As 3 taxas universais que os sliders editam — e que aqui viram INCERTAS. */
export type UncertainRateId = 'throughput' | 'recoveryRate' | 'yield';

/** Ordem estável de apresentação antes do ranking (determinismo do tornado). */
export const UNCERTAIN_RATE_IDS: readonly UncertainRateId[] = Object.freeze([
    'throughput',
    'recoveryRate',
    'yield',
]);

/** Estado dos widgets de robustez (CFG-33: amostras e seed configuráveis). */
export interface RobustnessControlsState {
    /** Nº de amostras Monte Carlo pedido; `null` = não digitado (usa o default). */
    readonly iterations: number | null;
    /** Seed do PRNG pedida; `null` = não digitada (usa o default). */
    readonly seed: number | null;
    /** Incerteza relativa das taxas, em % (±). `null` = não digitada. */
    readonly uncertaintyPct: number | null;
}

/** Defaults do motor espelhados (N8 — o default reproduz o canônico). */
export const DEFAULT_ITERATIONS = 1000;
export const DEFAULT_SEED = 42;
export const DEFAULT_UNCERTAINTY_PCT = 10;
/** Faixa aceita para a incerteza na tela (±%), evitando amostragem absurda. */
export const MIN_UNCERTAINTY_PCT = 0;
export const MAX_UNCERTAINTY_PCT = 50;

/** Estado inicial: exatamente os defaults do motor (N8). */
export const DEFAULT_ROBUSTNESS_STATE: RobustnessControlsState = Object.freeze({
    iterations: DEFAULT_ITERATIONS,
    seed: DEFAULT_SEED,
    uncertaintyPct: DEFAULT_UNCERTAINTY_PCT,
});

/** Estado inicial dos widgets (cópia congelada do default). */
export function initialRobustnessState(): RobustnessControlsState {
    return DEFAULT_ROBUSTNESS_STATE;
}

// ───────────────────────────── VM de saída ─────────────────────────────

/** Por que a robustez não pôde ser calculada (sempre explicada na tela). */
export type RobustnessUnavailableReason =
    /** Ainda não há Base clonada / cenário ativo. */
    | 'no-base'
    /** O cenário ativo (ou a Base) viola as regras físicas cruzadas (CFG-40). */
    | 'incoherent'
    /** Menos de metade das amostras foi fisicamente válida (N3 do motor). */
    | 'insufficient-samples';

/** A banda P10–P50–P90 do veredito, pronta para leitura. */
export interface RobustnessBandVM {
    readonly p10: number;
    readonly p50: number;
    readonly p90: number;
    readonly mean: number;
    /** Amostras que entraram na banda (finitas E fisicamente possíveis). */
    readonly validSamples: number;
    /** Amostras DESCARTADAS (impossíveis) — honestidade sobre o tamanho real. */
    readonly discarded: number;
    /** Largura da faixa (p90 − p10): o "quanto isto pode variar". */
    readonly spread: number;
}

/**
 * QUAL extremo da varredura OAT não pôde ser avaliado. Sem isto a tela só teria
 * um "sem dado" mudo; com isto ela explica a CAUSA — que é quase sempre a mesma
 * e é informação útil: as taxas estão tão próximas que varrer ±incerteza numa
 * delas cruza o limite físico `yield ≤ recoveryRate` (CFG-40). Isso é um
 * ACHADO da análise ("suas taxas têm pouca folga"), não uma falha do cálculo.
 */
export type TornadoUnavailableSide = 'low' | 'high' | 'both';

/** Uma barra do tornado (CFG-34), já com a geometria resolvida. */
export interface TornadoBarVM {
    readonly id: UncertainRateId;
    /** Valores do parâmetro nos extremos avaliados (value ∓ spread). */
    readonly paramLow: number;
    readonly paramHigh: number;
    /** Veredito nos extremos; `null` = extremo fisicamente impossível (N3). */
    readonly metricLow: number | null;
    readonly metricHigh: number | null;
    /** |metricHigh − metricLow|; `null` quando algum extremo não avaliou. */
    readonly amplitude: number | null;
    /** `false` ⇒ renderizar "sem dado" em vez de barra (nunca barra de 0 forjada). */
    readonly available: boolean;
    /** Qual extremo faltou (só quando `available === false`). */
    readonly unavailableSide: TornadoUnavailableSide | null;
    /** Início da barra, em % do domínio comum a TODAS as barras. */
    readonly leftPct: number;
    /** Largura da barra, em % do mesmo domínio comum. */
    readonly widthPct: number;
}

/** A VM completa do bloco de robustez (banda + tornado + config aplicada). */
export interface ScenarioRobustnessPanelVM {
    /** `false` ⇒ a tela mostra o motivo, nunca uma faixa vazia disfarçada. */
    readonly available: boolean;
    readonly unavailableReason: RobustnessUnavailableReason | null;
    /**
     * Veredito no ponto central — IDÊNTICO ao consolidado que o painel já exibe
     * (mesma métrica, mesmos parâmetros). É a âncora da banda.
     */
    readonly base: number | null;
    readonly band: RobustnessBandVM | null;
    /** Barras já ranqueadas por amplitude (desc.), sem-dado ao fim (do motor). */
    readonly bars: readonly TornadoBarVM[];
    /** Posição do veredito central no domínio das barras (linha de referência). */
    readonly basePct: number;
    /** Configuração REALMENTE aplicada (após os clamps do motor) — auditável. */
    readonly iterations: number;
    readonly seed: number;
    /** Incerteza aplicada, como fração (0.1 = ±10%). */
    readonly uncertaintyFraction: number;
    /** Unidade do veredito (a mesma do consolidado). */
    readonly unidade: string;
}

// ───────────────────────────── Helpers puros ─────────────────────────────

/** Número finito, ou `null` (N3 — vazio/ilegível nunca vira 0). */
function finiteOrNull(v: number | null | undefined): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Aplica os limites da tela à incerteza pedida; `null` cai no default. */
export function resolveUncertaintyFraction(pct: number | null | undefined): number {
    const raw = finiteOrNull(pct);
    const eff = raw === null ? DEFAULT_UNCERTAINTY_PCT : raw;
    const clamped = Math.min(MAX_UNCERTAINTY_PCT, Math.max(MIN_UNCERTAINTY_PCT, eff));
    return clamped / 100;
}

/**
 * A amostra é fisicamente possível? Barreira contra as TRÊS reações do motor de
 * impacto a valor fora do domínio (clamp em [0,1], troca silenciosa de
 * `throughput` negativo pela Base, e throw de CFG-40). Ver o bloco N3 no topo:
 * sem esta tria, um valor AJUSTADO entraria na banda como se fosse o sorteado.
 *
 * @param rates - As 3 taxas de UMA amostra.
 * @returns `true` só quando o motor pode avaliá-las sem ajustar nem lançar.
 */
export function isPhysicalSample(rates: {
    throughput: number;
    recoveryRate: number;
    yield: number;
}): boolean {
    if (!(Number.isFinite(rates.throughput) && rates.throughput > 0)) return false;
    if (!(Number.isFinite(rates.recoveryRate) && rates.recoveryRate >= 0 && rates.recoveryRate <= 1)) return false;
    if (!(Number.isFinite(rates.yield) && rates.yield >= 0 && rates.yield <= 1)) return false;
    // CFG-40: yield ≤ recoveryRate — a única regra que o motor LANÇA.
    return validateRatesCrossRules(rates).length === 0;
}

/**
 * Monta os 3 parâmetros incertos a partir do cenário ativo. Todos com a MESMA
 * fração de incerteza (o widget é único, §2.4 CFG-33 "configurável") e a
 * distribuição normal do motor MC canônico.
 */
function buildParameters(active: ScenarioParamSet, fraction: number): RobustnessParameter[] {
    return UNCERTAIN_RATE_IDS.map((id) =>
        Object.freeze({ id, value: active[id], uncertaintyFraction: fraction }),
    );
}

/** VM de indisponibilidade (a tela explica o motivo em vez de faixa vazia). */
function unavailableVM(
    reason: RobustnessUnavailableReason,
    iterations: number,
    seed: number,
    uncertaintyFraction: number,
    base: number | null,
): ScenarioRobustnessPanelVM {
    return Object.freeze({
        available: false,
        unavailableReason: reason,
        base,
        band: null,
        bars: Object.freeze([]) as readonly TornadoBarVM[],
        basePct: 50,
        iterations,
        seed,
        uncertaintyFraction,
        unidade: '',
    });
}

/**
 * Projeta o ranking do motor em barras com domínio COMUM (é o que faz um
 * tornado ser comparável: todas as barras na mesma régua). Domínio = mínimo e
 * máximo de todos os extremos avaliados, mais o ponto central.
 *
 * Degenerado (incerteza 0 ⇒ todos os extremos iguais): `span === 0` ⇒ barras de
 * largura 0 centradas — nunca uma divisão por zero virando NaN no `style`.
 */
function buildTornadoBars(
    result: ScenarioRobustnessResult,
): { bars: TornadoBarVM[]; basePct: number } {
    /** Qual lado da varredura ficou sem avaliação (para a tela explicar). */
    const sideOf = (lo: number | null, hi: number | null): TornadoUnavailableSide | null => {
        if (lo === null && hi === null) return 'both';
        if (lo === null) return 'low';
        if (hi === null) return 'high';
        return null;
    };

    const values: number[] = [];
    for (const e of result.sensitivity) {
        if (e.metricLow !== null) values.push(e.metricLow);
        if (e.metricHigh !== null) values.push(e.metricHigh);
    }
    if (result.baseMetric !== null) values.push(result.baseMetric);

    if (values.length === 0) {
        const bars = result.sensitivity.map((e) =>
            Object.freeze({
                id: e.id as UncertainRateId,
                paramLow: e.paramLow,
                paramHigh: e.paramHigh,
                metricLow: e.metricLow,
                metricHigh: e.metricHigh,
                amplitude: e.amplitude,
                available: false,
                unavailableSide: sideOf(e.metricLow, e.metricHigh) ?? 'both',
                leftPct: 50,
                widthPct: 0,
            }),
        );
        return { bars, basePct: 50 };
    }

    const domainMin = Math.min(...values);
    const domainMax = Math.max(...values);
    const span = domainMax - domainMin;
    const toPct = (v: number): number => (span > 0 ? ((v - domainMin) / span) * 100 : 50);

    const bars = result.sensitivity.map((e) => {
        const usable = e.metricLow !== null && e.metricHigh !== null && e.amplitude !== null;
        if (!usable) {
            return Object.freeze({
                id: e.id as UncertainRateId,
                paramLow: e.paramLow,
                paramHigh: e.paramHigh,
                metricLow: e.metricLow,
                metricHigh: e.metricHigh,
                amplitude: e.amplitude,
                available: false,
                unavailableSide: sideOf(e.metricLow, e.metricHigh) ?? 'both',
                leftPct: 50,
                widthPct: 0,
            });
        }
        const lo = Math.min(e.metricLow as number, e.metricHigh as number);
        const hi = Math.max(e.metricLow as number, e.metricHigh as number);
        const leftPct = toPct(lo);
        return Object.freeze({
            id: e.id as UncertainRateId,
            paramLow: e.paramLow,
            paramHigh: e.paramHigh,
            metricLow: e.metricLow,
            metricHigh: e.metricHigh,
            amplitude: e.amplitude,
            available: true,
            unavailableSide: null,
            leftPct,
            widthPct: span > 0 ? ((hi - lo) / span) * 100 : 0,
        });
    });

    const basePct = result.baseMetric !== null ? toPct(result.baseMetric) : 50;
    return { bars, basePct };
}

// ───────────────────────────── Entrada pública ─────────────────────────────

/**
 * Constrói a VM de robustez do painel: banda P10–P50–P90 do veredito
 * consolidado (CFG-33) + tornado de sensibilidade OAT ranqueado (CFG-34).
 *
 * A métrica amostrada é o MESMO veredito econômico-ambiental de ciclo de vida
 * (ΔECBT − ΔCAPEX − ΔOPEX) que o painel já mostra como ponto único — por isso o
 * `base` desta VM é bit-a-bit igual ao `consolidado.valor` de lá. Só as taxas do
 * cenário ATIVO são sorteadas; a Base é a referência e fica fixa.
 *
 * @param base - O `BaseProcess` em vigor (real do modelo ou stub); `null` antes de clonar.
 * @param active - O cenário ATIVO (o que os sliders editam); `null` antes de clonar.
 * @param state - Estado dos widgets (amostras, seed, incerteza).
 * @returns VM congelada — com `available:false` + motivo quando não há faixa honesta.
 */
export function buildScenarioRobustnessVM(
    base: BaseProcess | null,
    active: ScenarioParamSet | null,
    state: RobustnessControlsState,
): ScenarioRobustnessPanelVM {
    const fraction = resolveUncertaintyFraction(state?.uncertaintyPct);
    const reqIterations = finiteOrNull(state?.iterations) ?? DEFAULT_ITERATIONS;
    const reqSeed = finiteOrNull(state?.seed) ?? DEFAULT_SEED;

    if (!base || !active) {
        return unavailableVM('no-base', reqIterations, reqSeed, fraction, null);
    }
    // O cenário ativo (e a própria Base) precisam ser coerentes antes de sortear:
    // sortear em torno de um centro impossível não produziria faixa honesta.
    const centre = { throughput: active.throughput, recoveryRate: active.recoveryRate, yield: active.yield };
    const baseRates = { throughput: base.throughput, recoveryRate: base.recoveryRate, yield: base.yield };
    if (!isPhysicalSample(centre) || validateRatesCrossRules(baseRates).length > 0) {
        return unavailableVM('incoherent', reqIterations, reqSeed, fraction, null);
    }

    // A Base é a referência FIXA da comparação: calcula-se uma vez só, fora do
    // laço de amostragem (o motor roda 1× por iteração no lado do cenário).
    const baseReal = computeRealScenarioMetrics(base, {});
    let unidade = '';

    const metric = (values: Readonly<Record<string, number>>): number | null => {
        const rates = {
            throughput: values.throughput as number,
            recoveryRate: values.recoveryRate as number,
            yield: values.yield as number,
        };
        // N3 + anti-substituição silenciosa: amostra impossível é DESCARTADA
        // (ver o bloco no topo), nunca clampada nem trocada pela Base.
        if (!isPhysicalSample(rates)) return null;
        const altReal = computeRealScenarioMetrics(base, paramSetToMutation({ subtype: active.subtype, ...rates }));
        const consolidado = buildRealScenarioComparatorVM(baseReal, altReal).consolidado;
        if (unidade === '') unidade = consolidado.unidade;
        return consolidado.valor;
    };

    const result = computeScenarioRobustness(buildParameters(active, fraction), metric, {
        iterations: reqIterations,
        seed: reqSeed,
    });
    const { bars, basePct } = buildTornadoBars(result);

    const band: RobustnessBandVM | null = result.band
        ? Object.freeze({
              p10: result.band.p10,
              p50: result.band.p50,
              p90: result.band.p90,
              mean: result.band.mean,
              validSamples: result.band.validSamples,
              // Descartadas = pedidas − válidas. Exato (o motor devolve as duas
              // pontas), sem contador paralelo que confundiria as avaliações OAT.
              discarded: Math.max(0, result.iterations - result.band.validSamples),
              spread: result.band.p90 - result.band.p10,
          })
        : null;

    return Object.freeze({
        // Sem banda honesta o bloco NÃO se declara disponível: mostra o motivo.
        available: band !== null,
        unavailableReason: band === null ? 'insufficient-samples' : null,
        base: result.baseMetric,
        band,
        bars: Object.freeze(bars) as readonly TornadoBarVM[],
        basePct,
        iterations: result.iterations,
        seed: result.seed,
        uncertaintyFraction: fraction,
        unidade,
    });
}
