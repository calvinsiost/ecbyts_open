// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO TIMELINE CONTROLS — VM pura do painel (CFG-11, TEMA D).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-11 — "Expor horizonte e crescimento na UI (o motor já suporta, a
       tela não liga). Os controles de horizonte (CFG-09) e crescimento (CFG-10)
       ganham widgets na tela (modo avançado), hoje ausentes. Testável: mudar
       horizonte/g pela UI re-renderiza a série sem editar código."

   O QUE FALTAVA (verificado no código antes de escrever): os DOIS motores já
   estavam prontos e ligados ponta-a-ponta —
     - `_scenarioHorizonPure.ts` (CFG-09) resolve o horizonte nas duas formas
       (ano-marco absoluto ou duração), com faixa validada e `adjusted` visível;
     - `_scenarioGrowthPure.ts` (CFG-10) resolve `g` por FASE;
     - `_scenarioProjectionPure.ts` já consome os dois em
       `computeScenarioPairTimeSeries`.
   O que NÃO existia era o caminho da TELA até eles: `scenarioComparatorPanel.ts`
   só chamava `computeRealScenarioMetrics` (UM ponto no tempo), sem nenhum widget
   de horizonte ou de crescimento — o horizonte só podia ser mudado editando
   código. Este módulo é a ponte que faltava.

   O QUE ESTE MÓDULO FAZ (e o que NÃO faz): traduz o ESTADO DOS WIDGETS
   (modo do horizonte, ano-marco/duração digitados, linhas do editor de fases)
   em `ProjectionParams` e em uma VM de série pronta para render. NENHUMA álgebra
   de custo/DRE/ECBT/ODS/horizonte/crescimento mora aqui (anti-N4): quem resolve
   horizonte é `resolveHorizon`, quem resolve fase é `resolveGrowthSchedule`,
   quem projeta é `computeScenarioPairTimeSeries`. Aqui só há mapeamento de
   estado de tela ↔ parâmetro de motor, e a leitura dos flags de ajuste.

   ─── Guard-rails §2.4.0 honrados aqui ───

   N8 (sem folha em branco): {@link DEFAULT_TIMELINE_STATE} já nasce no marco 2030
   (o default do motor) e sem nenhuma fase — que é exatamente o `g` escalar de
   hoje. Ou seja: **o default reproduz o comportamento atual**, o widget só
   aparece para quem quiser mudar. `addGrowthPhase` também nunca cria linha vazia.

   N3 (nunca inventar dado): campo do editor ainda não preenchido vira `null` no
   draft e é entregue ao motor como não-finito — o motor DESCARTA a fase e conta
   em `rejected`. A tela mostra esse descarte; nada vira 0 forjado. Idem para o
   ano-marco: sem âncora não há conversão (o motor devolve `adjusted`).

   AUDITABILIDADE: todo ajuste que o motor faz no pedido do usuário (clamp no
   teto, pedido abaixo do mínimo, falta de âncora, fase fora da faixa, fase
   descartada, primeira fase ancorada no ano-base) sai daqui em campo próprio
   para a tela exibir — a UI nunca mostra um número ajustado como se fosse o
   pedido original.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

import {
    CURATED_HORIZON_MILESTONES,
    DEFAULT_HORIZON_MILESTONE,
    MAX_HORIZON_YEARS,
    MIN_HORIZON_YEARS,
    horizonYearsToMilestone,
    isHorizonYearUsable,
    resolveHorizon,
    type ResolvedHorizon,
} from './_scenarioHorizonPure.js';
import {
    DEFAULT_GROWTH_RATE,
    MAX_GROWTH_RATE,
    MIN_GROWTH_RATE,
    resolveGrowthSchedule,
    type GrowthPhase,
    type ResolvedGrowthSchedule,
} from './_scenarioGrowthPure.js';
import {
    computeScenarioPairTimeSeries,
    type ProjectionParams,
} from './_scenarioProjectionPure.js';
import type { BaseProcess } from './_scenarioImpactEnginePure.js';
import { validateRatesCrossRules } from './_scenarioCrossValidationPure.js';
import { paramSetToMutation, type ScenarioParamSet } from './_scenarioComparatorPanelVMPure.js';

// ───────────────────────────── Estado dos widgets ─────────────────────────────

/** Como o usuário declara o horizonte: por ANO-MARCO absoluto ou por DURAÇÃO. */
export type HorizonMode = 'year' | 'duration';

/**
 * Uma linha do editor de fases. Os campos são anuláveis DE PROPÓSITO: enquanto o
 * usuário não digitou, o valor não existe — e `null` chega ao motor como
 * não-finito (fase descartada, contada em `rejected`) em vez de virar 0 (N3).
 */
export interface GrowthPhaseDraft {
    /** Ano (absoluto) a partir do qual a taxa passa a valer; `null` = não digitado. */
    readonly fromYear: number | null;
    /** Crescimento anual do driver nesta fase (fração/ano); `null` = não digitado. */
    readonly g: number | null;
}

/** O estado completo dos widgets de horizonte + crescimento (CFG-11). */
export interface TimelineControlsState {
    /** Qual das duas formas do horizonte está ativa na tela. */
    readonly horizonMode: HorizonMode;
    /** Ano-marco absoluto digitado/escolhido (usado quando `horizonMode==='year'`). */
    readonly horizonYear: number | null;
    /** Duração em anos digitada (usada quando `horizonMode==='duration'`). */
    readonly horizonYears: number | null;
    /** Linhas do editor de fases; vazio = `g` escalar (comportamento de hoje). */
    readonly phases: readonly GrowthPhaseDraft[];
}

/**
 * Estado inicial (N8 — sem folha em branco, e **default = comportamento atual**):
 * marco 2030 (o mesmo default do motor, §5.2 a) e NENHUMA fase, o que faz
 * `resolveGrowthSchedule` cair no escalar — a série constante de hoje.
 */
export const DEFAULT_TIMELINE_STATE: TimelineControlsState = Object.freeze({
    horizonMode: 'year' as HorizonMode,
    horizonYear: DEFAULT_HORIZON_MILESTONE,
    horizonYears: null,
    phases: Object.freeze([]) as readonly GrowthPhaseDraft[],
});

/**
 * Estado inicial JÁ ANCORADO no ano-base do processo clonado. É o
 * {@link DEFAULT_TIMELINE_STATE} quando o marco 2030 ainda é projetável a partir
 * do ano-base; senão, o primeiro marco curado que couber. Existe para o painel
 * nunca ABRIR mostrando um badge de "ajustado" que o usuário não causou — o
 * ajuste tem de sinalizar escolha dele, não a idade do marco default.
 *
 * Sem nenhum marco utilizável (ano-base muito à frente de 2100) o horizonte cai
 * na forma de DURAÇÃO, que independe de marco.
 *
 * @param baseYear - Ano-base t₀ do processo clonado.
 * @returns {@link TimelineControlsState} congelado.
 */
export function initialTimelineState(baseYear: number | null): TimelineControlsState {
    const anchor = finiteIntOrNull(baseYear);
    if (anchor === null || isHorizonYearUsable(anchor, DEFAULT_HORIZON_MILESTONE)) {
        return DEFAULT_TIMELINE_STATE;
    }
    const usable = CURATED_HORIZON_MILESTONES.find((y) => isHorizonYearUsable(anchor, y));
    if (usable === undefined) {
        return Object.freeze({
            horizonMode: 'duration' as HorizonMode,
            horizonYear: null,
            horizonYears: horizonYearsToMilestone(anchor),
            phases: Object.freeze([]) as readonly GrowthPhaseDraft[],
        });
    }
    return Object.freeze({ ...DEFAULT_TIMELINE_STATE, horizonYear: usable });
}

// ───────────────────────────── VM do horizonte ─────────────────────────────

/** Por que o horizonte aplicado difere do pedido (`null` = pedido honrado). */
export type HorizonAdjustReason =
    /** Pedido acima do teto de {@link MAX_HORIZON_YEARS} anos — clampado no teto. */
    | 'clamped-max'
    /** Pedido abaixo de {@link MIN_HORIZON_YEARS} ano (ex.: marco ≤ ano-base). */
    | 'below-min'
    /** Ano-marco absoluto sem ano-base: não há como converter (N3). */
    | 'no-anchor'
    | null;

/** Um marco curado (§5.2 a) oferecido como sugestão na tela. */
export interface HorizonMilestoneOption {
    readonly year: number;
    /** `true` se o marco cabe na faixa projetável a partir do ano-base. */
    readonly usable: boolean;
    /** `true` se é o ano-marco atualmente pedido. */
    readonly selected: boolean;
}

/** Tudo que a tela precisa para desenhar o controle de horizonte (CFG-09→CFG-11). */
export interface HorizonControlVM {
    readonly mode: HorizonMode;
    /** Sugestões curadas 2030/2050/2100 — NÃO a lista fechada de aceitos (CFG-09). */
    readonly milestones: readonly HorizonMilestoneOption[];
    /** Ano-marco que o usuário pediu (`null` quando está no modo duração). */
    readonly requestedYear: number | null;
    /** Duração que o usuário pediu (`null` quando está no modo ano-marco). */
    readonly requestedYears: number | null;
    /** O horizonte de fato aplicado pelo motor (as duas representações). */
    readonly resolved: ResolvedHorizon;
    /** `true` quando o pedido NÃO foi honrado — a tela deve mostrar isso. */
    readonly adjusted: boolean;
    /** Por que foi ajustado (para a mensagem honesta na tela). */
    readonly adjustReason: HorizonAdjustReason;
    /** Menor ano-marco aceito pela entrada livre (ano-base + 1). */
    readonly minYear: number;
    /** Maior ano-marco aceito pela entrada livre (ano-base + teto). */
    readonly maxYear: number;
    /** Faixa aceita no modo duração. */
    readonly minYears: number;
    readonly maxYears: number;
}

/** Inteiro finito, ou `null` (mesma disciplina N3 dos motores). */
function finiteIntOrNull(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
}

/**
 * Monta a VM do controle de horizonte a partir do estado do widget (CFG-11).
 * A resolução em si é DELEGADA a `resolveHorizon` (CFG-09) — aqui só se decide
 * qual das duas formas o modo ativo envia, e se traduz o `adjusted` do motor em
 * um motivo legível para a tela.
 *
 * @param state - Estado dos widgets de horizonte.
 * @param baseYear - Ano-base t₀ da série (âncora); `null` = sem âncora.
 * @returns {@link HorizonControlVM} congelado.
 */
export function buildHorizonControlVM(
    state: TimelineControlsState,
    baseYear: number | null,
): HorizonControlVM {
    const anchor = finiteIntOrNull(baseYear);
    const mode: HorizonMode = state.horizonMode === 'duration' ? 'duration' : 'year';
    const requestedYear = mode === 'year' ? finiteIntOrNull(state.horizonYear) : null;
    const requestedYears = mode === 'duration' ? finiteIntOrNull(state.horizonYears) : null;

    const resolved = resolveHorizon(
        {
            baseYear: anchor ?? undefined,
            horizonYear: requestedYear ?? undefined,
            horizonYears: requestedYears ?? undefined,
        },
        { horizonYears: anchor === null ? undefined : horizonYearsToMilestone(anchor) },
    );

    // Motivo do ajuste: derivado do pedido + do que o motor devolveu, nunca de
    // uma reimplementação da faixa (a faixa é do motor).
    let adjustReason: HorizonAdjustReason = null;
    if (resolved.adjusted) {
        const span =
            requestedYear !== null ? (anchor === null ? null : requestedYear - anchor) : requestedYears;
        if (requestedYear !== null && anchor === null) adjustReason = 'no-anchor';
        else if (span !== null && span > MAX_HORIZON_YEARS) adjustReason = 'clamped-max';
        else adjustReason = 'below-min';
    }

    const milestones = CURATED_HORIZON_MILESTONES.map((year) =>
        Object.freeze({
            year,
            usable: anchor !== null && isHorizonYearUsable(anchor, year),
            selected: requestedYear === year,
        }),
    );

    return Object.freeze({
        mode,
        milestones: Object.freeze(milestones) as readonly HorizonMilestoneOption[],
        requestedYear,
        requestedYears,
        resolved,
        adjusted: resolved.adjusted,
        adjustReason,
        minYear: (anchor ?? 0) + MIN_HORIZON_YEARS,
        maxYear: (anchor ?? 0) + MAX_HORIZON_YEARS,
        minYears: MIN_HORIZON_YEARS,
        maxYears: MAX_HORIZON_YEARS,
    });
}

// ───────────────────────────── VM do crescimento ─────────────────────────────

/** Tudo que a tela precisa para desenhar o editor de fases (CFG-10→CFG-11). */
export interface GrowthControlVM {
    /** As linhas como o usuário digitou (podem estar incompletas). */
    readonly drafts: readonly GrowthPhaseDraft[];
    /** O cronograma de fato aplicado pelo motor (fases normalizadas). */
    readonly resolved: ResolvedGrowthSchedule;
    /** `true` quando o motor mexeu no que foi pedido — a tela deve mostrar. */
    readonly adjusted: boolean;
    /** Faixa validada da taxa (§ MIN/MAX_GROWTH_RATE) para os inputs. */
    readonly minRate: number;
    readonly maxRate: number;
}

/** Converte um draft em fase para o motor: campo não digitado vira NaN (N3). */
function draftToPhase(draft: GrowthPhaseDraft): GrowthPhase {
    return Object.freeze({
        fromYear: draft.fromYear === null ? Number.NaN : draft.fromYear,
        g: draft.g === null ? Number.NaN : draft.g,
    });
}

/**
 * Converte as linhas do editor no array de fases que o motor consome. Linhas
 * incompletas NÃO são filtradas aqui: seguem com `NaN` para que o próprio
 * `resolveGrowthSchedule` as descarte e as CONTE em `rejected` — assim existe uma
 * única autoridade sobre o que é uma fase válida (anti-N4).
 *
 * @param drafts - As linhas do editor.
 * @returns O array de fases, ou `undefined` quando não há nenhuma linha (o que
 *          faz o motor usar o `g` escalar — o comportamento de hoje).
 */
export function draftsToGrowthSchedule(
    drafts: readonly GrowthPhaseDraft[],
): readonly GrowthPhase[] | undefined {
    if (!Array.isArray(drafts) || drafts.length === 0) return undefined;
    return Object.freeze(drafts.map(draftToPhase)) as readonly GrowthPhase[];
}

/**
 * Monta a VM do editor de fases (CFG-11). A normalização (ordenar, deduplicar,
 * clampar, ancorar, descartar) é toda do motor `resolveGrowthSchedule` (CFG-10);
 * aqui só se lê o resultado e se decide se a tela precisa avisar o usuário.
 *
 * @param drafts - As linhas do editor de fases.
 * @param baseYear - Ano-base t₀ (âncora das fases, que são anos ABSOLUTOS).
 * @param fallbackRate - Taxa escalar quando não há cronograma utilizável.
 * @returns {@link GrowthControlVM} congelado.
 */
export function buildGrowthControlVM(
    drafts: readonly GrowthPhaseDraft[],
    baseYear: number | null,
    fallbackRate: number = DEFAULT_GROWTH_RATE,
): GrowthControlVM {
    const list = Array.isArray(drafts) ? drafts : [];
    const resolved = resolveGrowthSchedule(
        draftsToGrowthSchedule(list),
        finiteIntOrNull(baseYear),
        fallbackRate,
    );
    return Object.freeze({
        drafts: Object.freeze([...list]) as readonly GrowthPhaseDraft[],
        resolved,
        adjusted:
            resolved.anchored ||
            resolved.unanchored ||
            resolved.clamped > 0 ||
            resolved.rejected > 0,
        minRate: MIN_GROWTH_RATE,
        maxRate: MAX_GROWTH_RATE,
    });
}

// ─────────────────────── Mutações do editor (puras) ───────────────────────

/** Passo default entre fases sugeridas ao adicionar (anos). */
const PHASE_STEP_YEARS = 5;

/**
 * Adiciona uma fase ao editor (CFG-11). N8 — a linha nova NUNCA nasce em branco:
 * a primeira ancora no ano-base com a taxa default; as seguintes partem do ano da
 * última + {@link PHASE_STEP_YEARS} (sempre estritamente maior, para não colidir
 * com a fase anterior) e REUSAM a taxa da última — a mesma escolha N3 do motor
 * (reusar um número que o usuário deu, em vez de forjar um novo).
 *
 * @param drafts - Linhas atuais do editor.
 * @param bounds - Ano-base (âncora) e maior ano projetável, para clampar a sugestão.
 * @returns Nova lista congelada (a original nunca é mutada).
 */
export function addGrowthPhase(
    drafts: readonly GrowthPhaseDraft[],
    bounds: { readonly baseYear: number | null; readonly maxYear?: number | undefined },
): readonly GrowthPhaseDraft[] {
    const list = Array.isArray(drafts) ? [...drafts] : [];
    const anchor = finiteIntOrNull(bounds?.baseYear) ?? 0;
    const ceiling = finiteIntOrNull(bounds?.maxYear) ?? anchor + MAX_HORIZON_YEARS;
    const last = list.length > 0 ? list[list.length - 1] : undefined;
    if (!last) {
        return Object.freeze([
            Object.freeze({ fromYear: anchor, g: DEFAULT_GROWTH_RATE }),
        ]) as readonly GrowthPhaseDraft[];
    }
    const lastYear = last.fromYear === null ? anchor : last.fromYear;
    const suggested = Math.max(lastYear + 1, Math.min(ceiling, lastYear + PHASE_STEP_YEARS));
    list.push(Object.freeze({ fromYear: suggested, g: last.g === null ? DEFAULT_GROWTH_RATE : last.g }));
    return Object.freeze(list) as readonly GrowthPhaseDraft[];
}

/**
 * Remove a fase de índice `index` (CFG-11). Índice fora da lista não muda nada.
 *
 * @param drafts - Linhas atuais do editor.
 * @param index - Índice (0-based) da linha a remover.
 * @returns Nova lista congelada (a original nunca é mutada).
 */
export function removeGrowthPhase(
    drafts: readonly GrowthPhaseDraft[],
    index: number,
): readonly GrowthPhaseDraft[] {
    const list = Array.isArray(drafts) ? drafts : [];
    if (!Number.isInteger(index) || index < 0 || index >= list.length) {
        return Object.freeze([...list]) as readonly GrowthPhaseDraft[];
    }
    return Object.freeze(list.filter((_, i) => i !== index)) as readonly GrowthPhaseDraft[];
}

/**
 * Aplica um patch a UMA fase do editor (CFG-11). Campo apagado pelo usuário vira
 * `null` — que o motor descarta (N3), em vez de virar 0.
 *
 * @param drafts - Linhas atuais do editor.
 * @param index - Índice (0-based) da linha a editar.
 * @param patch - Campos a sobrescrever.
 * @returns Nova lista congelada (a original nunca é mutada).
 */
export function updateGrowthPhase(
    drafts: readonly GrowthPhaseDraft[],
    index: number,
    patch: Partial<GrowthPhaseDraft>,
): readonly GrowthPhaseDraft[] {
    const list = Array.isArray(drafts) ? drafts : [];
    if (!Number.isInteger(index) || index < 0 || index >= list.length) {
        return Object.freeze([...list]) as readonly GrowthPhaseDraft[];
    }
    const next = list.map((d, i) => (i === index ? Object.freeze({ ...d, ...patch }) : d));
    return Object.freeze(next) as readonly GrowthPhaseDraft[];
}

// ───────────────────────── Parâmetros para o motor ─────────────────────────

/**
 * Traduz o estado dos widgets nos {@link ProjectionParams} do motor de projeção
 * (§5.2). O modo do horizonte decide QUAL das duas formas é enviada — mandar as
 * duas faria o ano-marco vencer sempre (precedência do CFG-09) e o modo duração
 * viraria decorativo.
 *
 * @param state - Estado dos widgets.
 * @param baseYear - Ano-base t₀ da série.
 * @returns {@link ProjectionParams} congelado, pronto para o motor.
 */
export function toProjectionParams(
    state: TimelineControlsState,
    baseYear: number,
): ProjectionParams {
    const mode: HorizonMode = state.horizonMode === 'duration' ? 'duration' : 'year';
    const schedule = draftsToGrowthSchedule(state.phases);
    const params: {
        baseYear: number;
        horizon?: number;
        horizonYears?: number;
        growthSchedule?: readonly GrowthPhase[];
    } = { baseYear };
    if (mode === 'year') {
        const y = finiteIntOrNull(state.horizonYear);
        if (y !== null) params.horizon = y;
    } else {
        const n = finiteIntOrNull(state.horizonYears);
        if (n !== null) params.horizonYears = n;
    }
    if (schedule !== undefined) params.growthSchedule = schedule;
    return Object.freeze(params) as ProjectionParams;
}

// ───────────────────────────── VM da série ─────────────────────────────

/** Uma linha (ano) da série projetada exibida na tela. */
export interface TimelineYearRow {
    readonly year: number;
    /** Driver A(t) daquele ano (o que o crescimento por fase muda). */
    readonly activity: number;
    /** Δ nominal do ano (alt − base); `null` = sem dado em algum lado (N3). */
    readonly capexDelta: number | null;
    readonly opexDelta: number | null;
    readonly ecbtDelta: number | null;
    readonly environmentalDelta: number | null;
}

/** A série projetada + os flags de ajuste, prontos para render (CFG-11). */
export interface TimelineSeriesVM {
    /** `false` quando não há série a mostrar (sem base, ou cenário incoerente). */
    readonly available: boolean;
    /** Motivo de não haver série — a tela é honesta sobre isso. */
    readonly unavailableReason: 'no-base' | 'incoherent' | null;
    readonly rows: readonly TimelineYearRow[];
    /** Horizonte aplicado (CFG-09) — carrega o `adjusted`. */
    readonly horizon: ResolvedHorizon;
    /** Cronograma aplicado (CFG-10) — carrega `anchored`/`clamped`/`rejected`. */
    readonly growth: ResolvedGrowthSchedule;
    /** ΔCAPEX trazido a valor presente sobre o horizonte (§5.2 c). */
    readonly capexNPVDelta: number | null;
    /** ΔOPEX trazido a valor presente sobre o horizonte (§5.2 c). */
    readonly opexNPVDelta: number | null;
}

/** Casa as listas de delta por ano num índice `year → delta` (N3-safe). */
function deltaIndex(list: ReadonlyArray<{ year: number; delta: number | null }>): Map<number, number | null> {
    const m = new Map<number, number | null>();
    for (const d of list) m.set(d.year, d.delta);
    return m;
}

/**
 * Projeta o cenário ATIVO contra a Base ao longo do horizonte e do crescimento
 * escolhidos na tela (CFG-11) — é esta a série que muda quando o usuário mexe nos
 * widgets, provando o critério testável da spec sem editar código.
 *
 * ANTI-CRASH (CFG-40): `computeScenarioPairTimeSeries` chama o motor de impacto,
 * que LANÇA quando as taxas do cenário são fisicamente incoerentes (yield >
 * recuperação) — combinação que os sliders do painel permitem alcançar. Por isso
 * as taxas são pré-checadas com o validador NÃO-lançador e, se incoerentes, a
 * série sai `available:false` (com o motivo) em vez de derrubar o painel. Os
 * flags de horizonte/crescimento continuam sendo devolvidos mesmo assim, para a
 * tela poder auditar o ajuste sem depender da série.
 *
 * @param base - Processo-base (nunca mutado); `null` quando ainda não há clone.
 * @param active - Parâmetros do cenário ativo; `null` quando não há cenário.
 * @param state - Estado dos widgets de horizonte/crescimento.
 * @param baseYear - Ano-base t₀ da série.
 * @returns {@link TimelineSeriesVM} congelado.
 */
export function buildTimelineSeriesVM(
    base: BaseProcess | null,
    active: ScenarioParamSet | null,
    state: TimelineControlsState,
    baseYear: number,
): TimelineSeriesVM {
    const horizonVM = buildHorizonControlVM(state, baseYear);
    const growthVM = buildGrowthControlVM(state.phases, baseYear);

    const empty = (reason: 'no-base' | 'incoherent'): TimelineSeriesVM =>
        Object.freeze({
            available: false,
            unavailableReason: reason,
            rows: Object.freeze([]) as readonly TimelineYearRow[],
            horizon: horizonVM.resolved,
            growth: growthVM.resolved,
            capexNPVDelta: null,
            opexNPVDelta: null,
        });

    if (!base || !active) return empty('no-base');
    // CFG-40: nunca alimentar o motor com taxa incoerente (ele lança).
    if (
        validateRatesCrossRules({
            throughput: active.throughput,
            recoveryRate: active.recoveryRate,
            yield: active.yield,
        }).length > 0
    ) {
        return empty('incoherent');
    }

    const pair = computeScenarioPairTimeSeries(
        base,
        paramSetToMutation(active),
        toProjectionParams(state, baseYear),
    );

    const capex = deltaIndex(pair.capexDelta);
    const opex = deltaIndex(pair.opexDelta);
    const ecbt = deltaIndex(pair.ecbtDelta);
    const env = deltaIndex(pair.environmentalDelta);

    const rows = pair.alt.activitySeries.map((point) =>
        Object.freeze({
            year: point.year,
            activity: point.activity,
            capexDelta: capex.has(point.year) ? (capex.get(point.year) as number | null) : null,
            opexDelta: opex.has(point.year) ? (opex.get(point.year) as number | null) : null,
            ecbtDelta: ecbt.has(point.year) ? (ecbt.get(point.year) as number | null) : null,
            environmentalDelta: env.has(point.year) ? (env.get(point.year) as number | null) : null,
        }),
    );

    return Object.freeze({
        available: true,
        unavailableReason: null,
        rows: Object.freeze(rows) as readonly TimelineYearRow[],
        horizon: pair.horizon,
        growth: pair.growth,
        capexNPVDelta: pair.capexNPVDelta,
        opexNPVDelta: pair.opexNPVDelta,
    });
}
