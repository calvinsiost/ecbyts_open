// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   LEVER REGISTRY — catálogo curado de ALAVANCAS (peça A do Motor de
   Pergunta Genérico, SCENARIOS-PROCESS-IMPACT §5.3-a/§5.3-d).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
   - §5.3-a (A) — ALAVANCA = "o que eu mexo": qualquer coordenada de α
     ou dos fator_d,rota que o usuário pode alterar (as 3 taxas
     universais + custo unitário por rota).
   - §5.3-e guard-rail 1 — catálogo CURADO, nunca campo livre (NOT N8):
     o usuário escolhe de uma lista, jamais digita parâmetro arbitrário.
   - §5.3-e guard-rail 3 — ODS e a fórmula do ECBT são "sistema de
     verdade", NUNCA alavancas (NOT N9): este módulo RECUSA registrar
     ids do sistema de verdade (ver SYSTEM_OF_TRUTH_PREFIXES).
   - §5.3-e guard-rail 2 — faixas validadas: min/max/default vêm do
     catálogo de faixas por subtipo (CFG-36), nunca soltos em código.

   BUILD-FREE (TEST-HEALTH-001#9): módulo TS-only, sem entrada em
   scripts/ts-migration-map.json (writer-lock codex-omni) e sem
   consumidor no app browser nesta fase — o núcleo do item é o motor
   puro. Por isso os imports de irmãos usam a extensão `.ts` explícita
   e os testes rodam com `node --experimental-strip-types --test`.
   Se um dia ganhar mirror de build, os specifiers `.ts` devem virar
   `.js` (padrão do codemod).

   ZERO DOM, ZERO IO, determinístico.
   ================================================================ */

// CFG-36 — faixas validadas por subtipo (fonte única; standalone, sem imports).
import {
    DEFAULT_SLIDER_RANGES,
    resolveSliderRanges,
    type SliderLever,
    type SliderRange,
} from './_scenarioSliderRangeConfigPure.js';

/** Campo da mutação de processo que uma alavanca de taxa controla. */
export type LeverMutationField = 'throughput' | 'recoveryRate' | 'yield';

/** Campo de custo unitário por rota que uma alavanca de custo controla. */
export type RouteCostField = 'capexUnit' | 'opexUnit';

/**
 * Uma ALAVANCA do catálogo (peça A, §5.3-a). Imutável, com faixa validada
 * e default são (guard-rail §2.4.0-2: o default reproduz o comportamento
 * atual — nunca folha em branco, N8).
 */
export interface Lever {
    /** Id estável (ex.: 'recoveryRate', 'route:concentrate:capexUnit'). */
    readonly id: string;
    /** Chave i18n do nome leigo (nunca texto solto). */
    readonly nomeKey: string;
    /** Unidade curta (ex.: 't/h', '%', 'R$/t'). */
    readonly unidade: string;
    /** Faixa validada (vem do subtipo — CFG-36, guard-rail §5.3-e-2). */
    readonly min: number;
    readonly max: number;
    /** Default são que reproduz o comportamento atual (guard-rail §2.4.0-2). */
    readonly default: number;
    /** Família: taxa universal do processo ou custo unitário de rota. */
    readonly kind: 'rate' | 'routeCost';
    /** Campo da ProcessMutation (só kind 'rate'). */
    readonly mutationField?: LeverMutationField;
    /** Rota alvo (só kind 'routeCost'). */
    readonly routeId?: string;
    /** Campo de custo da rota (só kind 'routeCost'). */
    readonly routeCampo?: RouteCostField;
}

/**
 * Fragmento de mutação de processo que uma alavanca produz — estruturalmente
 * o `ProcessMutation` do motor de impacto (sem importá-lo: este módulo é
 * build-free e orquestra, não reimplementa).
 */
export interface LeverMutationFragment {
    readonly throughput?: number;
    readonly recoveryRate?: number;
    readonly yield?: number;
    readonly routeOverrides?: ReadonlyArray<{
        readonly routeId: string;
        readonly capexUnit?: number;
        readonly opexUnit?: number;
    }>;
}

/**
 * SISTEMA DE VERDADE (guard-rail §5.3-e-3 / NOT N9): prefixos de id que
 * NUNCA podem ser alavanca — a fórmula/pesos do ECBT Score e o mapa
 * característica→indicador ODS são curados/versionados por admin; o usuário
 * os interroga como RESULTADO (peça B), jamais os reescreve como alavanca.
 */
export const SYSTEM_OF_TRUTH_PREFIXES: readonly string[] = Object.freeze([
    'ecbt',
    'kappa',
    'ods',
    'peso',
    'weight',
]);

const SLIDER_TO_FIELD: Readonly<Record<SliderLever, LeverMutationField>> = Object.freeze({
    throughput: 'throughput',
    recoveryRate: 'recoveryRate',
    yield: 'yield',
});

const LEVER_META: Readonly<Record<SliderLever, { nomeKey: string; unidade: string }>> = Object.freeze({
    throughput: Object.freeze({ nomeKey: 'scenarios.lever.throughput', unidade: 't/h' }),
    recoveryRate: Object.freeze({ nomeKey: 'scenarios.lever.recoveryRate', unidade: '%' }),
    yield: Object.freeze({ nomeKey: 'scenarios.lever.yield', unidade: '%' }),
});

/**
 * Defaults sãos por alavanca (guard-rail §2.4.0-2): reproduzem o ponto de
 * partida "= Base" que a tela já usa (`DEFAULT_PARAMS` do
 * scenarioComparatorPanel: 1000 t/h · 0.8 · 0.7) — zero regressão.
 */
export const DEFAULT_LEVER_VALUES: Readonly<Record<SliderLever, number>> = Object.freeze({
    throughput: 1000,
    recoveryRate: 0.8,
    yield: 0.7,
});

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** Monta a alavanca de taxa a partir da faixa validada (CFG-36). */
function rateLever(field: SliderLever, range: SliderRange): Lever {
    const meta = LEVER_META[field];
    return Object.freeze({
        id: field,
        nomeKey: meta.nomeKey,
        unidade: meta.unidade,
        min: range.min,
        max: range.max,
        default: DEFAULT_LEVER_VALUES[field],
        kind: 'rate',
        mutationField: SLIDER_TO_FIELD[field],
    });
}

/**
 * CATÁLOGO CURADO de alavancas (guard-rail §5.3-e-1): as 3 taxas
 * universais com as faixas DEFAULT do CFG-36 — byte-a-byte o hardcode
 * pré-existente (zero regressão). Congelado: ninguém adiciona alavanca
 * fora da curadoria.
 */
export const LEVER_REGISTRY: readonly Lever[] = Object.freeze([
    rateLever('throughput', DEFAULT_SLIDER_RANGES.throughput),
    rateLever('recoveryRate', DEFAULT_SLIDER_RANGES.recoveryRate),
    rateLever('yield', DEFAULT_SLIDER_RANGES.yield),
]);

/**
 * True se o id pertence ao sistema de verdade (NOT N9) e jamais pode ser
 * alavanca — só resultado.
 *
 * @param id - id candidato a alavanca.
 * @returns true quando o id é proibido como alavanca.
 */
export function isForbiddenLeverId(id: string): boolean {
    const lower = String(id).toLowerCase();
    return SYSTEM_OF_TRUTH_PREFIXES.some((p) => lower.startsWith(p));
}

/**
 * Busca uma alavanca no catálogo (ou num catálogo estendido curado pelo
 * caller — ex.: alavancas de custo por rota construídas via
 * {@link buildRouteCostLever}).
 *
 * @param id - id da alavanca.
 * @param registry - catálogo efetivo (default {@link LEVER_REGISTRY}).
 * @returns a alavanca, ou null quando fora do catálogo (N8: nunca inventa).
 */
export function resolveLever(id: string, registry: readonly Lever[] = LEVER_REGISTRY): Lever | null {
    if (typeof id !== 'string' || isForbiddenLeverId(id)) return null;
    return registry.find((l) => l.id === id) ?? null;
}

/**
 * Alavancas com as faixas DO SUBTIPO (CFG-36): cada subtipo tem sua faixa
 * validada (RSU ≠ mineração); subtipo fora do catálogo cai no default por
 * alavanca (N8).
 *
 * @param subtype - subtipo de produção ('mining', 'petroleum', ...).
 * @returns as 3 alavancas de taxa com as faixas resolvidas do subtipo.
 */
export function resolveLeversForSubtype(subtype: string): readonly Lever[] {
    const ranges = resolveSliderRanges(subtype);
    return Object.freeze([
        rateLever('throughput', ranges.throughput),
        rateLever('recoveryRate', ranges.recoveryRate),
        rateLever('yield', ranges.yield),
    ]);
}

/**
 * Fábrica validada de alavanca de CUSTO POR ROTA (§5.3-d: "custo unitário
 * per-route — capexUnit/opexUnit do ERP"). A faixa é OBRIGATÓRIA e validada
 * (N8: sem folha em branco); id no namespace `route:<routeId>:<campo>`.
 *
 * @param routeId - id da rota alvo (não pode ser sistema de verdade).
 * @param campo - 'capexUnit' | 'opexUnit'.
 * @param faixa - { min, max, default } finitos, 0 ≤ min ≤ default ≤ max.
 * @returns a alavanca curada.
 * @throws Error quando a faixa é inválida ou o id é proibido (NOT N9).
 */
export function buildRouteCostLever(
    routeId: string,
    campo: RouteCostField,
    faixa: { min: number; max: number; default: number },
): Lever {
    if (typeof routeId !== 'string' || routeId.length === 0 || isForbiddenLeverId(routeId)) {
        throw new Error(`buildRouteCostLever: routeId '${String(routeId)}' inválido ou sistema de verdade (NOT N9)`);
    }
    if (campo !== 'capexUnit' && campo !== 'opexUnit') {
        throw new Error(`buildRouteCostLever: campo '${String(campo)}' fora de capexUnit|opexUnit`);
    }
    const { min, max } = faixa ?? { min: NaN, max: NaN };
    const def = faixa?.default;
    if (!isFiniteNumber(min) || !isFiniteNumber(max) || !isFiniteNumber(def) || min < 0 || min > def || def > max) {
        throw new Error(
            `buildRouteCostLever: faixa inválida para '${routeId}.${campo}' — exige 0 ≤ min ≤ default ≤ max finitos (N8)`,
        );
    }
    return Object.freeze({
        id: `route:${routeId}:${campo}`,
        nomeKey: `scenarios.lever.routeCost.${campo}`,
        unidade: 'R$/t',
        min,
        max,
        default: def,
        kind: 'routeCost',
        routeId,
        routeCampo: campo,
    });
}

/**
 * Converte (alavanca, valor) no fragmento de mutação de processo —
 * a ponte da peça A para a álgebra única da §5.1 (α / fator_d,rota).
 *
 * @param lever - alavanca do catálogo.
 * @param valor - valor a aplicar (já validado na faixa pelo motor).
 * @returns fragmento de ProcessMutation.
 */
export function leverToMutationFragment(lever: Lever, valor: number): LeverMutationFragment {
    if (lever.kind === 'rate' && lever.mutationField) {
        return Object.freeze({ [lever.mutationField]: valor } as LeverMutationFragment);
    }
    if (lever.kind === 'routeCost' && lever.routeId && lever.routeCampo) {
        return Object.freeze({
            routeOverrides: Object.freeze([
                Object.freeze({ routeId: lever.routeId, [lever.routeCampo]: valor } as {
                    routeId: string;
                    capexUnit?: number;
                    opexUnit?: number;
                }),
            ]),
        });
    }
    return Object.freeze({});
}

/**
 * Mescla fragmentos de N alavancas num único fragmento (eixo A = N —
 * CFG-07/08: array de mutações é UMA pergunta com N alavancas). Route
 * overrides são concatenados; campos de taxa: o último vence (o validador
 * do motor impede a mesma taxa duplicada).
 *
 * @param fragments - fragmentos por alavanca.
 * @returns fragmento único mesclado.
 */
export function mergeMutationFragments(
    fragments: ReadonlyArray<LeverMutationFragment>,
): LeverMutationFragment {
    const merged: {
        throughput?: number;
        recoveryRate?: number;
        yield?: number;
        routeOverrides: Array<{ routeId: string; capexUnit?: number; opexUnit?: number }>;
    } = { routeOverrides: [] };
    for (const f of fragments) {
        if (isFiniteNumber(f.throughput)) merged.throughput = f.throughput;
        if (isFiniteNumber(f.recoveryRate)) merged.recoveryRate = f.recoveryRate;
        if (isFiniteNumber(f.yield)) merged.yield = f.yield;
        if (f.routeOverrides) merged.routeOverrides.push(...f.routeOverrides);
    }
    return Object.freeze({
        ...(merged.throughput !== undefined ? { throughput: merged.throughput } : {}),
        ...(merged.recoveryRate !== undefined ? { recoveryRate: merged.recoveryRate } : {}),
        ...(merged.yield !== undefined ? { yield: merged.yield } : {}),
        ...(merged.routeOverrides.length > 0 ? { routeOverrides: Object.freeze(merged.routeOverrides) } : {}),
    });
}
