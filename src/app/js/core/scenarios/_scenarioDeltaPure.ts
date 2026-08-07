// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO DELTA — pure-logic (SCENARIOS-IMPACT-001, F7).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.1 F7, §4.2).
   `computeScenarioDelta(base, alternativo)` calcula, por dimensão
   (CAPEX, OPEX, ECBT Score, ODS), o `DimensionDelta`
   `{ base, alternativo, delta, sinal, semDado }` entre os dois
   `ScenarioImpact` produzidos pelo F3 (`propagateScenarioImpact`).

   Este módulo NÃO recalcula nenhuma dimensão (NOT N4) — ele só
   SUBTRAI os valores já propagados pelos motores F3/F4/F5/F6. Toda a
   contabilidade/ECBT/ODS vive nos módulos irmãos.

   N3 RÍGIDO (honestidade de dado): dimensão sem dado em QUALQUER lado
   (base OU alternativo `null`) → `delta: null` + `semDado: true` +
   `sinal: 'unknown'` — NUNCA 0 forjado, NUNCA média, NUNCA palpite.
   Para ODS, indicador presente em só um lado = sem dado unilateral →
   mesmo tratamento (delta null), nunca "ausência vira 0".

   Sinal/direção (§F7, §5.1): `sinal` é a DIREÇÃO aritmética do delta
   (up = alternativo > base; down = <; flat = igual; unknown = semDado).
   A leitura qualitativa (melhora/piora) depende da dimensão — em custos
   (capex/opex) down é melhora; no ECBT Score up é melhora — e é dada
   por `deltaDirecao(dimension, sinal)`. `formatDeltaSinal` entrega a
   formatação textual (seta + sinal aritmético) para a UI/testes, sem
   depender só de cor (WCAG §13 da spec).

   ZERO DOM, ZERO IO, determinístico. Todos os retornos congelados.
   ================================================================ */

import type { ScenarioImpact } from './_scenarioPropagationPure.js';
import type { OdsImpacto4D } from './_scenarioImpactEnginePure.js';
// CFG-26 (spec §2.4.8) — o conjunto de dimensões virou catálogo. As 4 canônicas
// seguem nos MESMOS campos; as registradas por dado entram no canal `extras`.
import {
    DEFAULT_ANALYSIS_DIMENSION_CATALOG,
    buildEffectiveAnalysisDimensionCatalog,
    dimensionUpIsBetter,
    type AnalysisDimensionId,
    type EffectiveAnalysisDimensionCatalog,
} from './_analysisDimensionCatalogPure.js';

/** Direção aritmética do delta de uma dimensão (§4.2 da spec). */
export type DeltaSinal = 'up' | 'down' | 'flat' | 'unknown';

/** Leitura qualitativa do delta, dependente da dimensão (§5.1). */
export type DeltaDirecao = 'melhora' | 'piora' | 'neutro' | 'semDado';

/**
 * Dimensão comparada. As 4 canônicas (capex, opex, ecbtScore, ods) continuam
 * autocompletando; o conjunto é ABERTO desde o CFG-26 para acomodar dimensões
 * registradas por dado (custo social, saúde, biodiversidade, risco…).
 */
export type DeltaDimension = AnalysisDimensionId;

/** Delta de UMA dimensão escalar — forma exata da spec (§4.2). */
export interface DimensionDelta {
    /** Valor no cenário-base — `null` = sem dado (N3). */
    readonly base: number | null;
    /** Valor no cenário alternativo — `null` = sem dado (N3). */
    readonly alternativo: number | null;
    /** alternativo − base — `null` = sem dado em algum lado (NUNCA 0 forjado — N3). */
    readonly delta: number | null;
    /** Direção aritmética do delta. */
    readonly sinal: DeltaSinal;
    /** true quando falta dado em qualquer lado. */
    readonly semDado: boolean;
}

/** Delta de UM indicador ODS oficial (goal/indicator/source citáveis — F6). */
export interface OdsIndicatorDelta extends DimensionDelta {
    /** Número do Objetivo (1–17). */
    readonly goal: number;
    /** Código oficial do indicador (ex.: '6.4.1'). */
    readonly indicator: string;
    /** Fonte oficial citável (IAEG-SDGs / Plataforma ODS Brasil). */
    readonly source: string;
}

/**
 * Delta de UMA dimensão REGISTRADA por dado (CFG-26), carregando os metadados
 * que a coluna extra do comparador precisa exibir — incluindo a fonte citável
 * do fator, que a curadoria exige.
 */
export interface NamedDimensionDelta extends DimensionDelta {
    /** Id da dimensão no catálogo (ex.: 'health'). */
    readonly dimension: string;
    /** Chave i18n do rótulo da coluna. */
    readonly nameKey: string;
    /** Unidade do valor (ex.: 'DALY/ano'). */
    readonly unit: string;
    /** Fonte citável do fator da dimensão. */
    readonly source: string;
    /** Leitura qualitativa já resolvida pela polaridade curada da dimensão. */
    readonly direcao: DeltaDirecao;
}

/**
 * Diferença base vs. alternativo por dimensão (saída do F7). As 4 dimensões
 * canônicas ocupam os mesmos campos de sempre; `extras` só aparece quando o
 * chamador REGISTRA dimensões (CFG-26), de modo que a saída default é a mesma
 * de antes, campo a campo — a extensão é aditiva, jamais substitutiva.
 */
export interface ScenarioDelta {
    readonly capex: DimensionDelta;
    readonly opex: DimensionDelta;
    readonly ecbtScore: DimensionDelta;
    readonly ods: readonly OdsIndicatorDelta[];
    /** Dimensões registradas por dado — ausente quando nenhuma foi registrada. */
    readonly extras?: readonly NamedDimensionDelta[];
    /** true quando QUALQUER dimensão (inclusive um indicador ODS) ficou sem dado. */
    readonly semDado: boolean;
}

/** Opções do F7 — hoje só a curadoria de dimensões do CFG-26. */
export interface ScenarioDeltaOptions {
    /**
     * Definições de dimensão vindas de dado/config (CFG-26 — NOT N9), validadas
     * antes de virar coluna. Omitir mantém exatamente as 4 canônicas.
     */
    readonly dimensions?: ReadonlyArray<unknown> | null;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Delta escalar de uma dimensão com N3 rígido: qualquer lado sem dado
 * (`null`/não-finito) → `{delta: null, semDado: true, sinal: 'unknown'}` —
 * nunca 0 forjado. Ambos informados → delta aritmético (0 real vira 'flat').
 */
export function computeDimensionDelta(
    base: number | null | undefined,
    alternativo: number | null | undefined,
): DimensionDelta {
    const b = isFiniteNumber(base) ? base : null;
    const a = isFiniteNumber(alternativo) ? alternativo : null;
    if (b === null || a === null) {
        return Object.freeze({
            base: b,
            alternativo: a,
            delta: null,
            sinal: 'unknown' as const,
            semDado: true,
        });
    }
    const delta = a - b;
    const sinal: DeltaSinal = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    return Object.freeze({ base: b, alternativo: a, delta, sinal, semDado: false });
}

/** Chave estável de um indicador ODS (goal + código oficial). */
function odsKey(o: { readonly goal: number; readonly indicator: string }): string {
    return `${o.goal}:${o.indicator}`;
}

/**
 * Deltas por indicador ODS oficial: união dos indicadores dos dois lados,
 * comparando o `impact` [0,1] medido. Indicador presente em só um lado, ou com
 * `impact: null` em qualquer lado → sem dado unilateral (delta null — N3).
 * Ordem: goal asc, depois indicator asc (determinismo).
 */
export function computeOdsDeltas(
    base: readonly OdsImpacto4D[],
    alternativo: readonly OdsImpacto4D[],
): readonly OdsIndicatorDelta[] {
    const baseArr = Array.isArray(base) ? base : [];
    const altArr = Array.isArray(alternativo) ? alternativo : [];
    const byKey = new Map<
        string,
        { meta: { goal: number; indicator: string; source: string }; b: number | null; a: number | null; hasB: boolean; hasA: boolean }
    >();
    const upsert = (o: OdsImpacto4D, side: 'b' | 'a'): void => {
        if (!o || typeof o.indicator !== 'string') return;
        const key = odsKey(o);
        let slot = byKey.get(key);
        if (!slot) {
            slot = {
                meta: { goal: o.goal, indicator: o.indicator, source: o.source ?? '' },
                b: null,
                a: null,
                hasB: false,
                hasA: false,
            };
            byKey.set(key, slot);
        }
        if (!slot.meta.source && o.source) slot.meta.source = o.source;
        const impact = isFiniteNumber(o.impact) ? o.impact : null;
        if (side === 'b') {
            slot.hasB = true;
            slot.b = impact;
        } else {
            slot.hasA = true;
            slot.a = impact;
        }
    };
    for (const o of baseArr) upsert(o, 'b');
    for (const o of altArr) upsert(o, 'a');

    const out: OdsIndicatorDelta[] = [];
    for (const { meta, b, a } of byKey.values()) {
        // Lado ausente OU impact null → N3: o computeDimensionDelta já devolve
        // delta null + semDado; nunca "ausência vira 0".
        const dim = computeDimensionDelta(b, a);
        out.push(Object.freeze({ ...dim, goal: meta.goal, indicator: meta.indicator, source: meta.source }));
    }
    out.sort((x, y) => x.goal - y.goal || x.indicator.localeCompare(y.indicator));
    return Object.freeze(out);
}

/**
 * F7 — Calcula o DELTA das 4 dimensões entre o impacto do cenário-base e o do
 * alternativo (saídas do F3 `propagateScenarioImpact`). Só subtrai valores já
 * propagados (NOT N4); dimensão sem dado em qualquer lado → delta `null` +
 * `semDado` (N3 — nunca 0 forjado).
 *
 * Dimensões REGISTRADAS (CFG-26) entram em `extras`, lendo seus valores de
 * `ScenarioImpact.extras`; os 4 campos canônicos ficam intocados. Sem registro,
 * `extras` nem aparece e a saída é idêntica à de antes do CFG-26.
 *
 * @param base         impacto propagado do cenário-base.
 * @param alternativo  impacto propagado do cenário alternativo.
 * @param options      curadoria de dimensões extras (CFG-26); omitir = as 4.
 * @returns `ScenarioDelta` congelado (capex, opex, ecbtScore, ods[], extras?).
 */
export function computeScenarioDelta(
    base: ScenarioImpact,
    alternativo: ScenarioImpact,
    options: ScenarioDeltaOptions = {},
): ScenarioDelta {
    if (!base || typeof base !== 'object' || !alternativo || typeof alternativo !== 'object') {
        throw new Error('computeScenarioDelta: base e alternativo (ScenarioImpact do F3) são obrigatórios');
    }
    const capex = computeDimensionDelta(base.capex, alternativo.capex);
    const opex = computeDimensionDelta(base.opex, alternativo.opex);
    const ecbtScore = computeDimensionDelta(base.ecbt, alternativo.ecbt);
    const ods = computeOdsDeltas(base.ods ?? [], alternativo.ods ?? []);
    const canonicalSemDado =
        capex.semDado || opex.semDado || ecbtScore.semDado || ods.some((o) => o.semDado);

    const catalog = options.dimensions
        ? buildEffectiveAnalysisDimensionCatalog(options.dimensions)
        : DEFAULT_ANALYSIS_DIMENSION_CATALOG;
    const extras = computeExtraDimensionDeltas(base, alternativo, catalog);
    if (extras.length === 0) {
        // Nenhuma dimensão registrada ⇒ a forma da saída é a mesma de sempre.
        return Object.freeze({ capex, opex, ecbtScore, ods, semDado: canonicalSemDado });
    }
    const semDado = canonicalSemDado || extras.some((e) => e.semDado);
    return Object.freeze({ capex, opex, ecbtScore, ods, extras, semDado });
}

/**
 * Deltas das dimensões REGISTRADAS (CFG-26), lidos de `ScenarioImpact.extras`.
 * Dimensão sem valor em qualquer lado → `delta: null` + `semDado` (N3 — o
 * mesmo rigor das canônicas: ausência nunca vira 0). Ordem = a do catálogo
 * (determinismo). Cada coluna já sai com sua fonte citável e a direção
 * resolvida pela polaridade curada.
 */
function computeExtraDimensionDeltas(
    base: ScenarioImpact,
    alternativo: ScenarioImpact,
    catalog: EffectiveAnalysisDimensionCatalog,
): readonly NamedDimensionDelta[] {
    if (catalog.registeredIds.length === 0) return Object.freeze([]);
    const baseValues = base.extras ?? null;
    const altValues = alternativo.extras ?? null;
    const out: NamedDimensionDelta[] = [];
    for (const id of catalog.registeredIds) {
        const def = catalog.byId[id];
        // `registeredIds` só contém ids presentes em `byId`; a guarda existe
        // para o caso de um catálogo forjado à mão chegar aqui.
        if (!def) continue;
        const dim = computeDimensionDelta(
            baseValues ? baseValues[id] : null,
            altValues ? altValues[id] : null,
        );
        out.push(
            Object.freeze({
                ...dim,
                dimension: id,
                nameKey: def.nameKey,
                unit: def.unit,
                source: def.source,
                direcao: deltaDirecao(id, dim.sinal, catalog),
            }),
        );
    }
    return Object.freeze(out);
}

/**
 * Leitura qualitativa do sinal por dimensão (§5.1): em custos (capex/opex)
 * e nº de ODS afetados, DOWN é melhora; no ECBT Score (resultado líquido),
 * UP é melhora. 'unknown' → 'semDado' (N3: sem veredito sem dado).
 *
 * Desde o CFG-26 a polaridade vem do CATÁLOGO em vez de um `=== 'ecbtScore'`
 * cravado, então uma dimensão registrada declara a própria leitura. Chamar sem
 * `catalog` usa as 4 canônicas — e um id fora delas continua lido como
 * "down é melhora", exatamente como antes.
 *
 * @param dimension - Id da dimensão.
 * @param sinal - Direção aritmética do delta.
 * @param catalog? - Catálogo efetivo de dimensões (CFG-26).
 */
export function deltaDirecao(
    dimension: DeltaDimension,
    sinal: DeltaSinal,
    catalog?: EffectiveAnalysisDimensionCatalog | null,
): DeltaDirecao {
    if (sinal === 'unknown') return 'semDado';
    if (sinal === 'flat') return 'neutro';
    const upIsGood = dimensionUpIsBetter(catalog ?? DEFAULT_ANALYSIS_DIMENSION_CATALOG, dimension);
    const isUp = sinal === 'up';
    return isUp === upIsGood ? 'melhora' : 'piora';
}

/** Formatação textual do sinal/direção de um delta (seta + sinal aritmético). */
export interface DeltaSinalFormat {
    /** Seta de direção: '↑' | '↓' | '→' | '—' (semDado). */
    readonly arrow: string;
    /** Sinal aritmético a prefixar no número: '+' | '−' | '' (flat/semDado). */
    readonly sign: string;
    /** Rótulo textual acessível (não depende só de cor — WCAG §13). */
    readonly label: 'up' | 'down' | 'flat' | 'sem dado';
}

/**
 * Formata o sinal/direção de um `DimensionDelta` para exibição: seta + sinal
 * aritmético + rótulo textual. semDado → '—' / 'sem dado' (nunca finge 0).
 */
export function formatDeltaSinal(delta: DimensionDelta): DeltaSinalFormat {
    switch (delta.sinal) {
        case 'up':
            return Object.freeze({ arrow: '↑', sign: '+', label: 'up' as const });
        case 'down':
            return Object.freeze({ arrow: '↓', sign: '−', label: 'down' as const });
        case 'flat':
            return Object.freeze({ arrow: '→', sign: '', label: 'flat' as const });
        default:
            return Object.freeze({ arrow: '—', sign: '', label: 'sem dado' as const });
    }
}
