// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   QUESTION ENGINE — Motor de Pergunta Genérico (peça C,
   SCENARIOS-PROCESS-IMPACT §5.3).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
   - §5.3-a — Pergunta = (A: alavanca ∈ catálogo, B: resultado ∈
     catálogo, C: tipo ∈ {whatif, sensibilidade, goalseek, incerteza}).
   - §5.3-c — os 4 tipos são combinações de 3 EIXOS ORTOGONAIS:
     (A) nº de alavancas 1|2|N · (B) sentido forward|backward ·
     (C) natureza do resultado ponto|faixa. Cada resposta carrega seus
     eixos (`eixos`) — a rastreabilidade é do próprio objeto.
   - §5.3-d — NENHUM ramo reimplementa cálculo: what-if chama o
     compute injetado; sensibilidade é um LAÇO sobre what-if; goal-seek
     é um ENVELOPE (bisseção) sobre what-if; incerteza é um AMOSTRADOR
     sobre what-if. Uma só álgebra (§5.1).
   - §5.3-e — 4 guard-rails: catálogo curado (N8); faixas validadas +
     dependências físicas via QueryValidator (CFG-40 elevado ao motor);
     ODS/ECBT como sistema de verdade (NOT N9 — nunca alavanca);
     simples+avançado (o tipo é explícito na pergunta; o modo Simples da
     UI fixa tipo='whatif').
   - §2.4.11 nota de rastreabilidade — CFG-07/08 (multi-cenário / array
     de mutações) = whatif com N alavancas; CFG-33 = uncertainty;
     CFG-34 = sensitivity; CFG-35 = a forma extrema do goalseek
     (normativo, §5.1-d). Todos casos particulares DESTE motor.

   REUSO (nada reimplementado):
   - PRNG + gaussiana: `core/ecbtScore/_monteCarloBandPure` (mulberry32 +
     Box-Muller — o motor MC canônico; "nada de PRNG novo", spec §B).
   - Dependências físicas: `validateRatesCrossRules` (CFG-40, fonte
     única das regras cruzadas — yield ≤ recoveryRate).
   - Catálogos: `_leverRegistryPure` (peça A) e `_resultRegistryPure`
     (peça B).
   - O CÁLCULO do cenário é INJETADO (deps.computeMetrics) — em produção
     é `computeRealScenarioMetrics`/`computeScenarioPair` do
     `_scenarioImpactEnginePure`; a álgebra §5.1 continua única.

   BUILD-FREE (TEST-HEALTH-001#9): módulo TS-only, sem entrada em
   scripts/ts-migration-map.json (writer-lock codex-omni) e sem
   consumidor no app browser nesta fase — o núcleo do item é o motor
   puro. Por isso os imports de irmãos usam a extensão `.ts` explícita
   e os testes rodam com `node --experimental-strip-types --test`.
   Se um dia ganhar mirror de build, os specifiers `.ts` viram `.js`.

   ZERO DOM, determinístico (seed), IO injetável.
   ================================================================ */

import {
    LEVER_REGISTRY,
    isForbiddenLeverId,
    leverToMutationFragment,
    mergeMutationFragments,
    resolveLever,
    type Lever,
    type LeverMutationFragment,
} from './_leverRegistryPure.js';
import { resolveResult, type ResultDef, type ResultMetricsLike } from './_resultRegistryPure.js';
import { validateRatesCrossRules } from './_scenarioCrossValidationPure.js';
import { mulberry32, sampleNormal } from '../ecbtScore/_monteCarloBandPure.js';

// ───────────────────────────── Tipos públicos ─────────────────────────────

/** Os 4 TIPOS de pergunta (§5.3-c). */
export type QuestionKind = 'whatif' | 'sensitivity' | 'goalseek' | 'uncertainty';

/** Distribuição de amostragem (mesmo vocabulário do motor MC canônico). */
export type UncertaintyDistribution = 'normal' | 'uniform' | 'triangular';

/**
 * Uma alavanca referenciada na pergunta. `valor` é o ALVO (whatif) ou o
 * valor CENTRAL (sensitivity/uncertainty — omitido = valor atual do
 * processo); goalseek ignora `valor` (resolve o valor).
 */
export interface LeverAssignment {
    /** Id da alavanca no catálogo (N8: nunca campo livre). */
    readonly leverId: string;
    /** Valor alvo/central (finito, dentro da faixa da alavanca). */
    readonly valor?: number;
    /** Incerteza relativa (fração do |valor|). Default 0.1 (±10%). */
    readonly uncertaintyFraction?: number;
    /** Distribuição de amostragem (uncertainty). Default 'normal'. */
    readonly distribution?: UncertaintyDistribution;
}

/** A PERGUNTA — composição das 3 peças A·B·C (§5.3-a). */
export interface Question {
    /** (C) TIPO de pergunta. */
    readonly tipo: QuestionKind;
    /** (A) ALAVANCAS — 1 (whatif/goalseek) ou N (whatif/sensitivity/uncertainty). */
    readonly alavancas: readonly LeverAssignment[];
    /** (B) RESULTADOS observados (sensitivity/goalseek: exatamente 1). */
    readonly resultadoIds: readonly string[];
    /** Alvo do resultado (só goalseek — eixo B = backward). */
    readonly alvo?: number;
    /** Parâmetros: samples/seed (uncertainty), tolerancia/maxIteracoes
     *  (goalseek), sensibilidadeFracao (sensitivity). */
    readonly params?: {
        readonly samples?: number;
        readonly seed?: number;
        readonly tolerancia?: number;
        readonly maxIteracoes?: number;
        readonly sensibilidadeFracao?: number;
    };
}

/** Forma mínima do processo produtivo (estrutural — BaseProcess do motor). */
export interface QuestionProcessLike {
    readonly subtype: string;
    readonly throughput: number;
    readonly recoveryRate: number;
    readonly yield: number;
    readonly routes: ReadonlyArray<{
        readonly id: string;
        readonly alpha: number;
        readonly capexUnit?: number;
        readonly opexUnit?: number;
        readonly [k: string]: unknown;
    }>;
    readonly [k: string]: unknown;
}

/** O modelo interrogado: processo-base + driver de atividade + opções. */
export interface QuestionModel {
    readonly process: QuestionProcessLike;
    /** Driver A(t) (§5.1-b); omitido = throughput do processo. */
    readonly activity?: { readonly value?: number };
    /** Opções do motor de impacto (CFG-24/25/26/32...), pass-through. */
    readonly options?: unknown;
}

/**
 * IO injetável: o CÁLCULO (álgebra §5.1) e, opcionalmente, a aplicação da
 * mutação. Em produção: `computeRealScenarioMetrics` + `applyProcessMutation`
 * do `_scenarioImpactEnginePure`.
 */
export interface QuestionEngineDeps {
    /**
     * Calcula as métricas REAIS de um processo.
     * @param process - processo (base ou já mutado).
     * @returns métricas nas 4+ dimensões (null por dimensão = semDado, N3).
     */
    readonly computeMetrics: (process: QuestionProcessLike) => ResultMetricsLike;
    /**
     * Aplica um fragmento de mutação ao processo (default: aplicação
     * estrutural local — taxas no topo + custo por rota). Injetar
     * `applyProcessMutation` em produção honra CFG-41 (α declarativo).
     */
    readonly applyMutation?: (
        process: QuestionProcessLike,
        fragment: LeverMutationFragment,
    ) => QuestionProcessLike;
}

/** Violação do QueryValidator (guard-rail §5.3-e-2). */
export interface QuestionViolation {
    /** Id estável da regra (i18n/telemetria). */
    readonly rule: string;
    /** Mensagem clara (pt-BR) citando o que foi rejeitado. */
    readonly message: string;
}

/** Os 3 eixos ortogonais da resposta (§5.3-c) — rastreabilidade viva. */
export interface QuestionAxes {
    /** Eixo A — nº de alavancas: '1' | 'N'. */
    readonly alavancas: '1' | 'N';
    /** Eixo B — sentido: forward (mexo→vejo) | backward (fixo→descubro). */
    readonly sentido: 'forward' | 'backward';
    /** Eixo C — natureza do resultado: ponto | faixa. */
    readonly natureza: 'ponto' | 'faixa';
}

/** Célula what-if de UM resultado (generaliza a ScenarioCell). */
export interface WhatIfCell {
    readonly resultadoId: string;
    readonly unidade: string;
    readonly base: number | null;
    readonly alt: number | null;
    readonly delta: number | null;
    readonly sinal: 'melhora' | 'piora' | 'neutro' | 'semDado';
}

/** Resposta WHAT-IF — 1|N alavancas · forward · ponto (tipo 1; CFG-07/08 quando N). */
export interface WhatIfAnswer {
    readonly ok: true;
    readonly tipo: 'whatif';
    readonly eixos: QuestionAxes;
    readonly celulas: readonly WhatIfCell[];
}

/** Linha do tornado (sensitivity) — espelha SensitivityEntry do motor S2. */
export interface SensitivityRow {
    readonly leverId: string;
    readonly paramLow: number;
    readonly paramHigh: number;
    readonly metricLow: number | null;
    readonly metricHigh: number | null;
    readonly amplitude: number | null;
    /** Extremo inviável por dependência física (CFG-40): 'low'|'high'|null. */
    readonly ladoInvalido: 'low' | 'high' | 'both' | null;
}

/** Resposta SENSIBILIDADE — N alavancas · forward · ponto ranqueado (tipo 2; CFG-34). */
export interface SensitivityAnswer {
    readonly ok: true;
    readonly tipo: 'sensitivity';
    readonly eixos: QuestionAxes;
    readonly resultadoId: string;
    readonly ranking: readonly SensitivityRow[];
}

/** Resposta GOAL-SEEK — 1 alavanca · backward · ponto (tipo 3; CFG-35 = forma extrema normativa). */
export interface GoalSeekAnswer {
    readonly ok: true;
    readonly tipo: 'goalseek';
    readonly eixos: QuestionAxes;
    readonly resultadoId: string;
    readonly alvo: number;
    readonly valorEncontrado: number | null;
    readonly resultadoAtingido: number | null;
    readonly convergiu: boolean;
    readonly iteracoes: number;
    /** Motivo honesto quando não converge (nunca valor forjado — N3). */
    readonly motivo: 'atingido' | 'alvo-fora-da-faixa' | 'semDado-no-extremo' | 'semDado-no-trajecto' | 'max-iteracoes';
    /** Cenário normativo (§5.1-d): parte da meta e busca a alavanca. */
    readonly cenarioTipo: 'normativo';
}

/** Banda P10–P50–P90 de UM resultado (uncertainty). */
export interface UncertaintyBand {
    readonly resultadoId: string;
    readonly p10: number | null;
    readonly p50: number | null;
    readonly p90: number | null;
    readonly mean: number | null;
    readonly validSamples: number;
}

/** Resposta INCERTEZA — 1|N alavancas · forward · faixa (tipo 4; CFG-33). */
export interface UncertaintyAnswer {
    readonly ok: true;
    readonly tipo: 'uncertainty';
    readonly eixos: QuestionAxes;
    readonly bandas: readonly UncertaintyBand[];
    /** Amostras DESCARTADAS (fora da faixa ou fisicamente impossíveis — nunca clampadas/forjadas). */
    readonly discardedSamples: number;
    readonly iterations: number;
    readonly seed: number;
    readonly semDado: boolean;
}

/** União das respostas; falha de validação = { ok:false, violations }. */
export type QuestionAnswer =
    | { readonly ok: false; readonly violations: readonly QuestionViolation[] }
    | WhatIfAnswer
    | SensitivityAnswer
    | GoalSeekAnswer
    | UncertaintyAnswer;

// ───────────────────────────── Constantes ─────────────────────────────

const DEFAULT_SAMPLES = 1000;
const MIN_SAMPLES = 50;
const MAX_SAMPLES = 100_000;
const DEFAULT_SEED = 42;
const DEFAULT_UNCERTAINTY_FRACTION = 0.1;
const DEFAULT_SENSITIVITY_FRACTION = 0.1;
const DEFAULT_TOLERANCE = 1e-6;
const DEFAULT_MAX_ITER = 60;
/** Fração mínima de amostras válidas para a banda ser honesta (N3). */
const MIN_VALID_FRACTION = 0.5;

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

// ───────────────────────────── QueryValidator ─────────────────────────────

/**
 * Taxas resultantes da pergunta sobre o modelo (base + alavancas de taxa
 * com valor explícito) — entrada das regras cruzadas CFG-40.
 */
function resultingRates(model: QuestionModel, q: Question): { throughput: number; recoveryRate: number; yield: number } {
    const rates = {
        throughput: model.process.throughput,
        recoveryRate: model.process.recoveryRate,
        yield: model.process.yield,
    };
    for (const a of q.alavancas) {
        if (!isFiniteNumber(a.valor)) continue;
        if (a.leverId === 'throughput') rates.throughput = a.valor;
        if (a.leverId === 'recoveryRate') rates.recoveryRate = a.valor;
        if (a.leverId === 'yield') rates.yield = a.valor;
    }
    return rates;
}

/**
 * QueryValidator (guard-rail §5.3-e-2): rejeita perguntas fora do catálogo
 * (N8), valores fora da faixa validada, dependências físicas impossíveis
 * (CFG-40 — ex.: yield > recoveryRate) e aridade errada por tipo.
 *
 * @param model - modelo interrogado (para as taxas resultantes).
 * @param q - a pergunta.
 * @param registry - catálogo efetivo de alavancas (default LEVER_REGISTRY).
 * @returns violações (vazio = pergunta válida).
 */
export function validateQuestion(
    model: QuestionModel,
    q: Question,
    registry: readonly Lever[] = LEVER_REGISTRY,
): readonly QuestionViolation[] {
    const violations: QuestionViolation[] = [];
    const push = (rule: string, message: string) => violations.push(Object.freeze({ rule, message }));

    if (q.tipo !== 'whatif' && q.tipo !== 'sensitivity' && q.tipo !== 'goalseek' && q.tipo !== 'uncertainty') {
        push('tipo-desconhecido', `tipo '${String(q.tipo)}' fora de whatif|sensitivity|goalseek|uncertainty`);
        return Object.freeze(violations);
    }
    if (!Array.isArray(q.alavancas) || q.alavancas.length === 0) {
        push('sem-alavanca', 'a pergunta precisa de ao menos 1 alavanca do catálogo');
    }
    if (!Array.isArray(q.resultadoIds) || q.resultadoIds.length === 0) {
        push('sem-resultado', 'a pergunta precisa de ao menos 1 resultado do catálogo');
    }

    const seen = new Set<string>();
    for (const a of q.alavancas ?? []) {
        if (isForbiddenLeverId(a.leverId)) {
            push('alavanca-sistema-de-verdade', `'${a.leverId}' é sistema de verdade (ECBT/ODS) — resultado, nunca alavanca (NOT N9)`);
            continue;
        }
        const lever = resolveLever(a.leverId, registry);
        if (!lever) {
            push('alavanca-desconhecida', `alavanca '${a.leverId}' fora do catálogo curado (N8)`);
            continue;
        }
        if (seen.has(a.leverId)) {
            push('alavanca-duplicada', `alavanca '${a.leverId}' repetida na mesma pergunta`);
        }
        seen.add(a.leverId);
        if (a.valor !== undefined && (!isFiniteNumber(a.valor) || a.valor < lever.min || a.valor > lever.max)) {
            push(
                'valor-fora-da-faixa',
                `valor ${String(a.valor)} fora da faixa validada [${lever.min}, ${lever.max}] da alavanca '${a.leverId}' (CFG-36)`,
            );
        }
    }
    for (const rid of q.resultadoIds ?? []) {
        if (!resolveResult(rid)) {
            push('resultado-desconhecido', `resultado '${rid}' fora do catálogo curado (N8)`);
        }
    }

    if (q.tipo === 'goalseek') {
        if ((q.alavancas ?? []).length !== 1 || (q.resultadoIds ?? []).length !== 1) {
            push('aridade-goalseek', 'goalseek exige exatamente 1 alavanca e 1 resultado (eixo backward)');
        }
        if (!isFiniteNumber(q.alvo)) {
            push('alvo-invalido', 'goalseek exige alvo numérico finito (a meta do resultado)');
        }
    }
    if (q.tipo === 'sensitivity' && (q.resultadoIds ?? []).length !== 1) {
        push('aridade-sensitivity', 'sensitivity ranqueia por UM resultado — exige exatamente 1 resultadoIds');
    }

    // Dependências físicas (CFG-40 elevado ao motor — guard-rail §5.3-e-2).
    if (q.tipo !== 'uncertainty' && q.tipo !== 'sensitivity') {
        for (const v of validateRatesCrossRules(resultingRates(model, q))) {
            push('dependencia-fisica', v.message);
        }
    }

    return Object.freeze(violations);
}

// ───────────────────────────── Núcleo compartilhado ─────────────────────────────

/** Aplicação estrutural default do fragmento (quando applyMutation não é injetado). */
function defaultApplyMutation(
    process: QuestionProcessLike,
    fragment: LeverMutationFragment,
): QuestionProcessLike {
    const next: Record<string, unknown> = { ...process };
    if (isFiniteNumber(fragment.throughput)) next.throughput = fragment.throughput;
    if (isFiniteNumber(fragment.recoveryRate)) next.recoveryRate = fragment.recoveryRate;
    if (isFiniteNumber(fragment.yield)) next.yield = fragment.yield;
    if (fragment.routeOverrides && fragment.routeOverrides.length > 0) {
        next.routes = process.routes.map((r) => {
            const ov = fragment.routeOverrides?.find((o) => o.routeId === r.id);
            if (!ov) return r;
            return {
                ...r,
                ...(isFiniteNumber(ov.capexUnit) ? { capexUnit: ov.capexUnit } : {}),
                ...(isFiniteNumber(ov.opexUnit) ? { opexUnit: ov.opexUnit } : {}),
            };
        });
    }
    return next as QuestionProcessLike;
}

/** Valor atual da alavanca no processo (centro da varredura/amostragem). */
function readLeverValue(process: QuestionProcessLike, lever: Lever): number | null {
    if (lever.kind === 'rate' && lever.mutationField) {
        return isFiniteNumber(process[lever.mutationField]) ? (process[lever.mutationField] as number) : null;
    }
    if (lever.kind === 'routeCost' && lever.routeId && lever.routeCampo) {
        const route = process.routes.find((r) => r.id === lever.routeId);
        const v = route?.[lever.routeCampo];
        return isFiniteNumber(v) ? v : null;
    }
    return null;
}

/** Fragmento combinado de N alavancas com valores dados (eixo A = N). */
function fragmentFor(
    assignments: ReadonlyArray<{ lever: Lever; valor: number }>,
): LeverMutationFragment {
    return mergeMutationFragments(assignments.map((a) => leverToMutationFragment(a.lever, a.valor)));
}

/** Resolve as alavancas da pergunta contra o catálogo (pré-validado). */
function resolveAssignments(
    q: Question,
    registry: readonly Lever[],
): ReadonlyArray<{ lever: Lever; assignment: LeverAssignment }> {
    return q.alavancas.map((a) => ({ lever: resolveLever(a.leverId, registry) as Lever, assignment: a }));
}

/** Sinal do delta conforme a direção do "bom" do resultado (N3: semDado). */
function sinalOf(delta: number | null, melhoraQuandoSobe: boolean): WhatIfCell['sinal'] {
    if (delta === null) return 'semDado';
    if (delta === 0) return 'neutro';
    const sobe = delta > 0;
    return sobe === melhoraQuandoSobe ? 'melhora' : 'piora';
}

/** Percentil por interpolação linear sobre array ordenado (0..1). */
function percentileSorted(sorted: ReadonlyArray<number>, q: number): number {
    const n = sorted.length;
    const pos = q * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo] as number;
    const w = pos - lo;
    return (sorted[lo] as number) * (1 - w) + (sorted[hi] as number) * w;
}

// ───────────────────────────── Ramo WHAT-IF (tipo 1) ─────────────────────────────

/**
 * WHAT-IF genérico (tipo 1 — §5.3-c): 1 ou N alavancas (N = CFG-07/08,
 * multi-cenário/array de mutações) · forward · ponto. O mesmo cálculo do
 * comparador atual, agora montado pelos catálogos — a pergunta-mãe da
 * feature é o ponto (A=taxas, B=4 dimensões, C=whatif) deste espaço.
 */
function answerWhatIf(
    model: QuestionModel,
    q: Question,
    deps: QuestionEngineDeps,
    registry: readonly Lever[],
): WhatIfAnswer {
    const apply = deps.applyMutation ?? defaultApplyMutation;
    const resolved = resolveAssignments(q, registry);
    const assignments = resolved.map(({ lever, assignment }) => ({
        lever,
        valor: isFiniteNumber(assignment.valor)
            ? (assignment.valor as number)
            : (readLeverValue(model.process, lever) ?? lever.default),
    }));
    const altProcess = apply(model.process, fragmentFor(assignments));

    const baseMetrics = deps.computeMetrics(model.process);
    const altMetrics = deps.computeMetrics(altProcess);

    const celulas: WhatIfCell[] = q.resultadoIds.map((rid) => {
        const result = resolveResult(rid) as ResultDef;
        const base = result.extrair(baseMetrics);
        const alt = result.extrair(altMetrics);
        const delta = base !== null && alt !== null ? alt - base : null;
        return Object.freeze({
            resultadoId: rid,
            unidade: result.unidade,
            base,
            alt,
            delta,
            sinal: sinalOf(delta, result.melhoraQuandoSobe),
        });
    });

    return Object.freeze({
        ok: true,
        tipo: 'whatif',
        eixos: Object.freeze({
            alavancas: q.alavancas.length > 1 ? 'N' : '1',
            sentido: 'forward',
            natureza: 'ponto',
        }),
        celulas: Object.freeze(celulas),
    });
}

// ───────────────────────────── Ramo SENSIBILIDADE (tipo 2 / CFG-34) ─────────────────────────────

/**
 * SENSIBILIDADE (tipo 2 — tornado/OAT): LAÇO sobre o what-if — varia cada
 * alavanca ±spread (demais fixas no centro) e ranqueia por amplitude
 * (§5.3-d). Extremo fisicamente impossível (CFG-40) vira `ladoInvalido`,
 * nunca valor forjado (N3).
 */
function answerSensitivity(
    model: QuestionModel,
    q: Question,
    deps: QuestionEngineDeps,
    registry: readonly Lever[],
): SensitivityAnswer {
    const apply = deps.applyMutation ?? defaultApplyMutation;
    const result = resolveResult(q.resultadoIds[0] as string) as ResultDef;
    const frac = isFiniteNumber(q.params?.sensibilidadeFracao)
        ? Math.max(0, q.params?.sensibilidadeFracao as number)
        : DEFAULT_SENSITIVITY_FRACTION;
    const resolved = resolveAssignments(q, registry);

    /** Métrica de UM resultado com UMA alavanca no valor dado (demais no centro). */
    const metricAt = (target: Lever, valor: number): number | null => {
        const assignments = resolved.map(({ lever, assignment }) => ({
            lever,
            valor:
                lever.id === target.id
                    ? valor
                    : isFiniteNumber(assignment.valor)
                      ? (assignment.valor as number)
                      : (readLeverValue(model.process, lever) ?? lever.default),
        }));
        // Amostra impossível (CFG-40) é descartada, nunca clampada (N3).
        const rates = resultingRates(model, {
            tipo: 'whatif',
            alavancas: assignments.map((a) => ({ leverId: a.lever.id, valor: a.valor })),
            resultadoIds: q.resultadoIds,
        });
        if (validateRatesCrossRules(rates).length > 0) return null;
        return result.extrair(deps.computeMetrics(apply(model.process, fragmentFor(assignments))));
    };

    const rows: SensitivityRow[] = resolved.map(({ lever, assignment }) => {
        const center = isFiniteNumber(assignment.valor)
            ? (assignment.valor as number)
            : (readLeverValue(model.process, lever) ?? lever.default);
        const spread = Math.abs(center) * frac;
        const paramLow = Math.max(lever.min, center - spread);
        const paramHigh = Math.min(lever.max, center + spread);
        const metricLow = metricAt(lever, paramLow);
        const metricHigh = metricAt(lever, paramHigh);
        const amplitude = metricLow !== null && metricHigh !== null ? Math.abs(metricHigh - metricLow) : null;
        const ladoInvalido: SensitivityRow['ladoInvalido'] =
            metricLow === null && metricHigh === null ? 'both' : metricLow === null ? 'low' : metricHigh === null ? 'high' : null;
        return Object.freeze({
            leverId: lever.id,
            paramLow,
            paramHigh,
            metricLow,
            metricHigh,
            amplitude,
            ladoInvalido,
        });
    });
    rows.sort((a, b) => {
        if (a.amplitude === null && b.amplitude === null) return 0;
        if (a.amplitude === null) return 1;
        if (b.amplitude === null) return -1;
        return b.amplitude - a.amplitude;
    });

    return Object.freeze({
        ok: true,
        tipo: 'sensitivity',
        eixos: Object.freeze({ alavancas: 'N', sentido: 'forward', natureza: 'ponto' }),
        resultadoId: result.id,
        ranking: Object.freeze(rows),
    });
}

// ───────────────────────────── Ramo GOAL-SEEK (tipo 3 / CFG-35) ─────────────────────────────

/**
 * GOAL-SEEK (tipo 3 — caminho inverso): ENVELOPE de bisseção sobre o
 * what-if — fixa o resultado-alvo e resolve o valor da alavanca
 * (§5.3-d). É o cenário NORMATIVO da §5.1-d; CFG-35 (otimização do mix
 * α) é a forma extrema multi-alavanca deste mesmo tipo. Alvo fora da
 * faixa ou sem dado → convergiu=false com motivo honesto (N3, nunca
 * valor forjado).
 */
function answerGoalSeek(
    model: QuestionModel,
    q: Question,
    deps: QuestionEngineDeps,
    registry: readonly Lever[],
): GoalSeekAnswer {
    const apply = deps.applyMutation ?? defaultApplyMutation;
    const lever = resolveLever(q.alavancas[0]?.leverId ?? '', registry) as Lever;
    const result = resolveResult(q.resultadoIds[0] as string) as ResultDef;
    const alvo = q.alvo as number;
    const tol = isFiniteNumber(q.params?.tolerancia) && (q.params?.tolerancia as number) > 0
        ? (q.params?.tolerancia as number)
        : DEFAULT_TOLERANCE;
    const maxIter = isFiniteNumber(q.params?.maxIteracoes)
        ? Math.max(1, Math.floor(q.params?.maxIteracoes as number))
        : DEFAULT_MAX_ITER;

    const metricAt = (valor: number): number | null => {
        const rates = resultingRates(model, {
            tipo: 'whatif',
            alavancas: [{ leverId: lever.id, valor }],
            resultadoIds: q.resultadoIds,
        });
        if (validateRatesCrossRules(rates).length > 0) return null;
        return result.extrair(deps.computeMetrics(apply(model.process, fragmentFor([{ lever, valor }]))));
    };

    const done = (
        partial: Omit<GoalSeekAnswer, 'ok' | 'tipo' | 'eixos' | 'resultadoId' | 'alvo' | 'cenarioTipo'>,
    ): GoalSeekAnswer =>
        Object.freeze({
            ok: true,
            tipo: 'goalseek',
            eixos: Object.freeze({ alavancas: '1', sentido: 'backward', natureza: 'ponto' }),
            resultadoId: result.id,
            alvo,
            cenarioTipo: 'normativo',
            ...partial,
        });

    const fMin = metricAt(lever.min);
    const fMax = metricAt(lever.max);
    if (fMin === null || fMax === null) {
        return done({ valorEncontrado: null, resultadoAtingido: null, convergiu: false, iteracoes: 0, motivo: 'semDado-no-extremo' });
    }
    const gMin = fMin - alvo;
    const gMax = fMax - alvo;
    if (gMin === 0) return done({ valorEncontrado: lever.min, resultadoAtingido: fMin, convergiu: true, iteracoes: 0, motivo: 'atingido' });
    if (gMax === 0) return done({ valorEncontrado: lever.max, resultadoAtingido: fMax, convergiu: true, iteracoes: 0, motivo: 'atingido' });
    if (Math.sign(gMin) === Math.sign(gMax)) {
        return done({ valorEncontrado: null, resultadoAtingido: null, convergiu: false, iteracoes: 0, motivo: 'alvo-fora-da-faixa' });
    }

    let lo = lever.min;
    let hi = lever.max;
    let gLo = gMin;
    let mid = lo;
    let fMid: number | null = null;
    let iter = 0;
    for (iter = 1; iter <= maxIter; iter++) {
        mid = (lo + hi) / 2;
        fMid = metricAt(mid);
        if (fMid === null) {
            return done({ valorEncontrado: null, resultadoAtingido: null, convergiu: false, iteracoes: iter, motivo: 'semDado-no-trajecto' });
        }
        const gMid = fMid - alvo;
        if (Math.abs(gMid) <= tol * Math.max(1, Math.abs(alvo))) {
            return done({ valorEncontrado: mid, resultadoAtingido: fMid, convergiu: true, iteracoes: iter, motivo: 'atingido' });
        }
        if (Math.sign(gMid) === Math.sign(gLo)) {
            lo = mid;
            gLo = gMid;
        } else {
            hi = mid;
        }
    }
    return done({ valorEncontrado: mid, resultadoAtingido: fMid, convergiu: false, iteracoes: maxIter, motivo: 'max-iteracoes' });
}

// ───────────────────────────── Ramo INCERTEZA (tipo 4 / CFG-33) ─────────────────────────────

/** Amostra uma alavanca segundo a distribuição declarada (convenções do motor MC canônico). */
function sampleLever(rng: () => number, center: number, spread: number, distribution: UncertaintyDistribution): number {
    if (!Number.isFinite(spread) || spread <= 0) return center;
    switch (distribution) {
        case 'uniform':
            return center + (rng() * 2 - 1) * spread;
        case 'triangular':
            return center + (rng() + rng() - 1) * spread;
        default:
            return sampleNormal(rng, center, spread);
    }
}

/**
 * INCERTEZA (tipo 4 — Monte Carlo): AMOSTRADOR sobre o what-if — as
 * alavancas são incertas, o resultado vira FAIXA P10/P50/P90 (§5.3-d).
 * PRNG canônico (mulberry32 + Box-Muller), reprodutível por seed. Amostra
 * fora da faixa da alavanca ou fisicamente impossível (CFG-40) é
 * DESCARTADA e contada — nunca clampada nem forjada (N3).
 */
function answerUncertainty(
    model: QuestionModel,
    q: Question,
    deps: QuestionEngineDeps,
    registry: readonly Lever[],
): UncertaintyAnswer {
    const apply = deps.applyMutation ?? defaultApplyMutation;
    const results = q.resultadoIds.map((rid) => resolveResult(rid) as ResultDef);
    const itRaw = q.params?.samples;
    const iterations = isFiniteNumber(itRaw)
        ? Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, Math.floor(itRaw)))
        : DEFAULT_SAMPLES;
    const seed = isFiniteNumber(q.params?.seed) ? Math.floor(q.params?.seed as number) : DEFAULT_SEED;
    const resolved = resolveAssignments(q, registry);
    const centers = resolved.map(({ lever, assignment }) => ({
        lever,
        center: isFiniteNumber(assignment.valor)
            ? (assignment.valor as number)
            : (readLeverValue(model.process, lever) ?? lever.default),
        spread:
            Math.abs(
                isFiniteNumber(assignment.valor)
                    ? (assignment.valor as number)
                    : (readLeverValue(model.process, lever) ?? lever.default),
            ) *
            (isFiniteNumber(assignment.uncertaintyFraction) && (assignment.uncertaintyFraction as number) >= 0
                ? (assignment.uncertaintyFraction as number)
                : DEFAULT_UNCERTAINTY_FRACTION),
        distribution: assignment.distribution ?? ('normal' as UncertaintyDistribution),
    }));

    const rng = mulberry32(seed);
    const valid: number[][] = results.map(() => []);
    let discardedSamples = 0;

    for (let i = 0; i < iterations; i++) {
        const sampled = centers.map((c) => ({
            lever: c.lever,
            valor: sampleLever(rng, c.center, c.spread, c.distribution),
        }));
        const inRange = sampled.every((s) => s.valor >= s.lever.min && s.valor <= s.lever.max);
        const rates = resultingRates(model, {
            tipo: 'whatif',
            alavancas: sampled.map((s) => ({ leverId: s.lever.id, valor: s.valor })),
            resultadoIds: q.resultadoIds,
        });
        if (!inRange || validateRatesCrossRules(rates).length > 0) {
            discardedSamples++;
            continue;
        }
        const metrics = deps.computeMetrics(apply(model.process, fragmentFor(sampled)));
        results.forEach((r, idx) => {
            const v = r.extrair(metrics);
            if (v !== null) (valid[idx] as number[]).push(v);
        });
    }

    const bandas: UncertaintyBand[] = results.map((r, idx) => {
        const samples = valid[idx] as number[];
        if (samples.length < Math.ceil(iterations * MIN_VALID_FRACTION)) {
            return Object.freeze({
                resultadoId: r.id,
                p10: null,
                p50: null,
                p90: null,
                mean: null,
                validSamples: samples.length,
            });
        }
        const sorted = [...samples].sort((a, b) => a - b);
        let sum = 0;
        for (const s of sorted) sum += s;
        return Object.freeze({
            resultadoId: r.id,
            p10: percentileSorted(sorted, 0.1),
            p50: percentileSorted(sorted, 0.5),
            p90: percentileSorted(sorted, 0.9),
            mean: sum / sorted.length,
            validSamples: sorted.length,
        });
    });

    return Object.freeze({
        ok: true,
        tipo: 'uncertainty',
        eixos: Object.freeze({
            alavancas: q.alavancas.length > 1 ? 'N' : '1',
            sentido: 'forward',
            natureza: 'faixa',
        }),
        bandas: Object.freeze(bandas),
        discardedSamples,
        iterations,
        seed,
        semDado: bandas.some((b) => b.p50 === null),
    });
}

// ───────────────────────────── Despacho ─────────────────────────────

/**
 * Responde UMA pergunta genérica (§5.3). Valida primeiro (QueryValidator);
 * pergunta inválida NÃO calcula — retorna `{ ok:false, violations }`.
 * Nenhum ramo reimplementa a álgebra §5.1: todos embrulham o cálculo
 * injetado (deps.computeMetrics).
 *
 * @param model - processo-base + atividade + opções.
 * @param q - a pergunta (A·B·C).
 * @param deps - IO injetável (cálculo do cenário; mutação opcional).
 * @param registry - catálogo efetivo de alavancas (default curado).
 * @returns a resposta no tipo da pergunta, ou as violações.
 */
export function answerQuestion(
    model: QuestionModel,
    q: Question,
    deps: QuestionEngineDeps,
    registry: readonly Lever[] = LEVER_REGISTRY,
): QuestionAnswer {
    const violations = validateQuestion(model, q, registry);
    if (violations.length > 0) {
        return Object.freeze({ ok: false as const, violations });
    }
    switch (q.tipo) {
        case 'whatif':
            return answerWhatIf(model, q, deps, registry);
        case 'sensitivity':
            return answerSensitivity(model, q, deps, registry);
        case 'goalseek':
            return answerGoalSeek(model, q, deps, registry);
        case 'uncertainty':
            return answerUncertainty(model, q, deps, registry);
    }
}
