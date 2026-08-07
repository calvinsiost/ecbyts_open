// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TRL / Maturidade tecnológica por cenário — pure logic.
 * micro_activity:ECBYTS-ENERGY-SCENARIOS-001#6.
 *
 * Um cenário ilustrativo de valorização de biomassa lignocelulósica (rota
 * energética) busca "levar a rota a TRL 6 avaliada no gêmeo digital"; este
 * módulo materializa a trilha de maturação: cada
 * ELEMENTO/ROTA do modelo pode declarar `data.trl` (nível atual 1..9),
 * `data.trlTarget` (nível-alvo) e `data.trlTargetMonths` (prazo). O VM monta
 * a timeline TRL atual→alvo por rota + os critérios de passagem (editáveis
 * na tela via overrides — a fonte default é o catálogo NASA/EU curado aqui).
 *
 * Honestidade de dados (mesmo padrão do comparador de cenários CFG-01): se o
 * modelo NÃO tem nenhum elemento com TRL declarado, o VM cai no dataset de
 * EXEMPLO rotulado (rotas ilustrativas de biomassa) — nunca apresenta exemplo
 * como se fosse real.
 *
 * NOT: nenhum cálculo de emissão/custo aqui; nada de DOM; nada de Supabase.
 */

export const TRL_MIN = 1;
export const TRL_MAX = 9;

/** Rótulos curtos (pt-BR) dos 9 níveis TRL — escala NASA/EU (Horizon 2020). */
export const TRL_LEVEL_LABELS: Readonly<Record<number, string>> = Object.freeze({
    1: 'Princípios básicos observados',
    2: 'Conceito tecnológico formulado',
    3: 'Prova de conceito experimental',
    4: 'Validação em laboratório',
    5: 'Validação em ambiente relevante',
    6: 'Demonstração em ambiente relevante',
    7: 'Demonstração em ambiente operacional',
    8: 'Sistema completo e qualificado',
    9: 'Sistema provado em operação',
});

/**
 * Critérios de passagem DEFAULT (transição n → n+1). Editáveis na tela: o
 * painel passa `criteriaOverrides` e o VM devolve o texto efetivo + flag
 * `isCustom` (o default nunca é destruído — princípio preservar-não-destruir).
 */
export const DEFAULT_PASSAGE_CRITERIA: Readonly<Record<number, string>> = Object.freeze({
    1: 'Revisão de literatura e princípios físicos documentados.',
    2: 'Conceito e aplicação prática formulados, sem prova experimental.',
    3: 'Prova de conceito em bancada com métricas registradas.',
    4: 'Componentes integrados validados em laboratório (baixa fidelidade).',
    5: 'Protótipo validado em ambiente relevante (condições reais simuladas).',
    6: 'Piloto demonstrado em ambiente relevante, dados monitorados no gêmeo digital.',
    7: 'Demonstração de sistema em ambiente operacional real (escala pré-comercial).',
    8: 'Sistema completo qualificado por teste e certificação.',
    9: 'Operação comercial contínua comprovada.',
});

/** Estado de uma célula da timeline TRL de uma rota. */
export type TrlCellState = 'done' | 'current' | 'gap' | 'target' | 'future';

export interface TrlCriterionVM {
    /** Transição fromLevel → fromLevel+1. */
    readonly fromLevel: number;
    readonly toLevel: number;
    readonly text: string;
    /** true quando o texto veio de override do usuário (editável na tela). */
    readonly isCustom: boolean;
}

export interface TrlRouteVM {
    readonly id: string;
    readonly name: string;
    readonly current: number;
    readonly target: number;
    /** Prazo (meses) para atingir o alvo; null quando não declarado. */
    readonly months: number | null;
    /** Frase-resumo ex.: "TRL 5 → alvo 6 em 36 meses". */
    readonly summary: string;
    readonly cells: readonly { readonly level: number; readonly state: TrlCellState }[];
    /** Critérios de passagem cobrindo o trecho current → target. */
    readonly criteria: readonly TrlCriterionVM[];
}

export interface TrlMaturityVM {
    readonly dataSource: 'real' | 'example';
    readonly routes: readonly TrlRouteVM[];
}

/** Forma mínima de elemento aceita (defensiva — qualquer shape do manager). */
export interface TrlElementLike {
    readonly id?: unknown;
    readonly name?: unknown;
    readonly data?: { readonly [key: string]: unknown } | null;
    readonly [key: string]: unknown;
}

export interface TrlRouteInput {
    readonly id: string;
    readonly name: string;
    readonly trl: number;
    readonly trlTarget: number;
    readonly trlTargetMonths: number | null;
}

/**
 * Dataset de EXEMPLO rotulado — rotas de valorização de resíduo de biomassa
 * lignocelulósica (cenário ilustrativo de maturação tecnológica). Números
 * plausíveis de literatura; usados APENAS quando o modelo não declara TRL em
 * nenhum elemento, sempre com badge "exemplo" na tela.
 */
export const EXAMPLE_ROUTES: readonly TrlRouteInput[] = Object.freeze([
    { id: 'example:biochar', name: 'Rota biocarvão (pirólise lenta do caroço)', trl: 5, trlTarget: 6, trlTargetMonths: 36 },
    { id: 'example:briquette', name: 'Rota briquete/pellet (densificação)', trl: 6, trlTarget: 7, trlTargetMonths: 24 },
    { id: 'example:biogas', name: 'Rota biogás (digestão anaeróbia da borra)', trl: 4, trlTarget: 6, trlTargetMonths: 48 },
    { id: 'example:cofiring', name: 'Rota co-queima em caldeira industrial', trl: 7, trlTarget: 8, trlTargetMonths: 18 },
]);

function _toLevel(v: unknown): number | null {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (!Number.isFinite(n)) return null;
    const i = Math.round(n);
    return i >= TRL_MIN && i <= TRL_MAX ? i : null;
}

/**
 * Extrai as rotas com TRL declarado do modelo. Só entra quem tem `data.trl`
 * válido (1..9). `trlTarget` inválido/ausente vira = trl (sem trilha).
 */
export function extractTrlRoutes(elements: readonly TrlElementLike[] | null | undefined): readonly TrlRouteInput[] {
    if (!Array.isArray(elements)) return [];
    const out: TrlRouteInput[] = [];
    for (const el of elements) {
        const data = el?.data ?? null;
        const trl = _toLevel(data?.['trl']);
        if (trl === null) continue;
        const target = _toLevel(data?.['trlTarget']) ?? trl;
        const monthsRaw = data?.['trlTargetMonths'];
        const months =
            typeof monthsRaw === 'number' && Number.isFinite(monthsRaw) && monthsRaw > 0
                ? Math.round(monthsRaw)
                : null;
        const id = typeof el.id === 'string' && el.id ? el.id : `trl:${out.length}`;
        const name = typeof el.name === 'string' && el.name ? el.name : id;
        out.push({
            id,
            name,
            trl,
            // alvo nunca abaixo do atual — a trilha é de maturação, não regressão
            trlTarget: Math.max(target, trl),
            trlTargetMonths: months,
        });
    }
    return out;
}

/** Estado de cada nível 1..9 da timeline de uma rota. */
export function buildTimelineCells(
    current: number,
    target: number,
): readonly { readonly level: number; readonly state: TrlCellState }[] {
    const cells: { level: number; state: TrlCellState }[] = [];
    for (let level = TRL_MIN; level <= TRL_MAX; level++) {
        let state: TrlCellState;
        if (level < current) state = 'done';
        else if (level === current) state = 'current';
        else if (level < target) state = 'gap';
        else if (level === target && target > current) state = 'target';
        else state = 'future';
        cells.push({ level, state });
    }
    return cells;
}

/** Critérios de passagem efetivos para o trecho current→target (com overrides). */
export function resolveCriteria(
    current: number,
    target: number,
    overrides?: Readonly<Record<number, string>> | null,
): readonly TrlCriterionVM[] {
    const out: TrlCriterionVM[] = [];
    for (let from = current; from < target; from++) {
        const custom = overrides?.[from];
        const hasCustom = typeof custom === 'string' && custom.trim().length > 0;
        out.push({
            fromLevel: from,
            toLevel: from + 1,
            text: hasCustom ? custom.trim() : (DEFAULT_PASSAGE_CRITERIA[from] ?? ''),
            isCustom: hasCustom,
        });
    }
    return out;
}

function _summary(r: TrlRouteInput): string {
    if (r.trlTarget <= r.trl) return `TRL ${r.trl} (alvo atingido)`;
    const prazo = r.trlTargetMonths !== null ? ` em ${r.trlTargetMonths} meses` : '';
    return `TRL ${r.trl} → alvo ${r.trlTarget}${prazo}`;
}

/**
 * VM completo do painel de maturidade TRL. `criteriaOverrides` é um mapa
 * routeId → (fromLevel → texto) com os critérios editados na tela.
 */
export function buildTrlMaturityVM(
    elements: readonly TrlElementLike[] | null | undefined,
    criteriaOverrides?: Readonly<Record<string, Readonly<Record<number, string>>>> | null,
): TrlMaturityVM {
    const real = extractTrlRoutes(elements);
    const dataSource: 'real' | 'example' = real.length > 0 ? 'real' : 'example';
    const inputs = real.length > 0 ? real : EXAMPLE_ROUTES;
    const routes = inputs.map((r) => ({
        id: r.id,
        name: r.name,
        current: r.trl,
        target: r.trlTarget,
        months: r.trlTargetMonths,
        summary: _summary(r),
        cells: buildTimelineCells(r.trl, r.trlTarget),
        criteria: resolveCriteria(r.trl, r.trlTarget, criteriaOverrides?.[r.id] ?? null),
    }));
    return { dataSource, routes };
}
