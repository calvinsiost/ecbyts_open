// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SCENARIO CAPEX/OPEX — pure-logic (SCENARIOS-IMPACT-001, F4).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.1 F4).
   Recalcula CAPEX/OPEX de um cenário-clone INVOCANDO o caminho único
   já existente do ERP (NOT N4 — nada é reimplementado aqui):

     element.data.costs[] → [rollup do clone] → costRollupToJournalEntries()
     → buildLedger() → buildIncomeStatement('BR-DRE')

   Regra contábil (header de core/erp/_costEntryAdapterPure.ts + CPC 26):
     - CAPEX = débito em Imobilizado (A.3, ATIVO) — lido do LEDGER
       (não passa pela DRE: é capitalizado).
     - OPEX  = despesa (D.x) — lido das linhas da DRE ('BR-DRE').

   Nota obrigatória da spec: `costRollupToJournalEntries` consome um
   `CostRollupLike` com `byElement` (a FORMA da saída de
   `buildCostRollup()`), não o `costs[]` cru. O rollup canônico
   (`core/analytics/economics/costRollup.ts`) lê o modelo vivo global
   (`getAllElements()`) e por isso não serve para clones — este módulo
   apenas EMBALA os `costs[]` do snapshot clonado nessa forma
   (mesma ponte já usada pelo F3 em `_scenarioPropagationPure.ts`),
   e todo o cálculo contábil é delegado ao ERP.

   ZERO DOM, ZERO IO, determinístico. Não lê o modelo vivo global.

   N3 (honestidade de dado): modelo sem nenhuma linha de custo →
   { capex: null, opex: null, semDado: true } — NUNCA 0 forjado.
   Lado (capex|opex) sem NENHUM valor informado nas linhas → null
   naquele lado; valor informado (mesmo 0) → número real do ledger/DRE.
   ================================================================ */

import {
    costRollupToJournalEntries,
    DEFAULT_ACCOUNTS,
    type CostEntryAdapterOptions,
    type CostRollupLike,
} from '../erp/_costEntryAdapterPure.js';
import { defaultChartBR } from '../erp/_chartOfAccountsPure.js';
import { buildLedger, type Period } from '../erp/_ledgerPure.js';
// CFG-20 (spec §2.4) — período fiscal configurável: o exercício deixa de ser
// jan–dez cravado. Default (jan–dez) reproduz as strings de antes.
import {
    fiscalSpanCovering,
    resolveFiscalCalendar,
    resolveFallbackFiscalYear,
    type FiscalCalendarSpec,
    type FiscalPeriod,
    type ResolvedFallbackFiscalYear,
    type ResolvedFiscalCalendar,
} from '../erp/_fiscalCalendarPure.js';
import { buildIncomeStatement } from '../erp/_incomeStatementPure.js';
// CFG-19 (spec §2.4) — plano de contas selecionável (BR-DRE / IFRS / US-GAAP),
// curado e com procedência; default BR-DRE reproduz a string cravada de antes.
import { resolveAccountingPlan, type ResolvedAccountingPlan } from './_scenarioAccountingPlanPure.js';
// CFG-23 (spec §2.4) — base de custo selecionável (orçado/realizado/previsto/
// combinado). Default orçado reproduz o `basis: 'budgeted'` cravado de antes.
import {
    resolveCostBasis,
    selectCostRowsForBasis,
    sortCostBasisIds,
    type CostBasisId,
    type ResolvedCostBasis,
} from './_scenarioCostBasisPure.js';
import type { ModelState } from './_scenarioClonePure.js';

/* ─── CFG-21: o ano fiscal de fallback deixou de ser cravado ───────────────

   Havia aqui `const FALLBACK_FISCAL_YEAR = 2026`. Ele produzia um BUG MEDIDO,
   não apenas um valor rígido — uma linha de custo sem `fiscalYear` mas COM
   dinheiro (capexTotal 1000, opexTotal 500) devolvia:

       { capex: 0, opex: 0, semDado: false }

   O mecanismo: o adaptador do ERP carimba a linha sem ano em `1970-12-31`,
   enquanto esta função ancorava a janela do ledger em 2026 — o lançamento caía
   fora, `buildLedger` o descartava, e `sideInformed` (que só olhava se o campo
   existia) declarava o lado "informado". Resultado: um ZERO FORJADO com
   `semDado: false`, isto é, um zero que se apresentava como medido. Em modelo
   misto era pior: as linhas datadas somavam e as sem data sumiam em silêncio,
   entregando um total incompleto com cara de completo.

   Agora o ano de fallback é DECLARADO pelo chamador. Sem declaração não há ano,
   e sem ano o lado responde `null` (N3) — a resposta honesta para dinheiro que
   existe e não pode ser situado no tempo. Com declaração, a linha é carimbada
   com aquele ano e passa a contar de verdade (a premissa é do usuário, visível
   em `fallbackFiscalYear`). Note que declarar 2026 NÃO reproduz o zero antigo:
   reproduz o valor CORRETO, porque o zero antigo era o defeito.
   ──────────────────────────────────────────────────────────────────────── */

/** Resultado do recálculo CAPEX/OPEX de UM cenário (F4). */
export interface ScenarioCapexOpex {
    /** CAPEX total (débito Imobilizado A.3 no ledger) — `null` = sem dado (N3). */
    readonly capex: number | null;
    /** OPEX total (despesas D.x projetadas na DRE) — `null` = sem dado (N3). */
    readonly opex: number | null;
    /** true quando QUALQUER lado ficou sem dado (N3). */
    readonly semDado: boolean;
    /** Anos fiscais cobertos pelas linhas de custo (proveniência). */
    readonly fiscalYears: readonly number[];
    /** Ids dos elementos do clone que contribuíram (proveniência). */
    readonly elementIds: readonly string[];
    /**
     * O plano de contas que produziu estes números (CFG-19). Sem ele, dois
     * resultados de normas diferentes seriam indistinguíveis no consumidor.
     */
    readonly plan: ResolvedAccountingPlan;
    /**
     * O calendário fiscal que definiu os baldes (CFG-20). Sem ele, um total de
     * exercício jul–jun seria indistinguível de um jan–dez no consumidor.
     */
    readonly fiscalCalendar: ResolvedFiscalCalendar;
    /** A janela de datas efetivamente aplicada ao ledger (proveniência). */
    readonly period: Period;
    /**
     * O ano fiscal de fallback em vigor (CFG-21). `year === null` significa que
     * nenhum foi declarado — e é por isso que linhas sem ano viram `semDado`.
     */
    readonly fallbackFiscalYear: ResolvedFallbackFiscalYear;
    /**
     * Quantas linhas de custo NÃO declaram ano fiscal na origem (proveniência).
     * Sem fallback declarado, é a razão do `null`; COM fallback, é o tamanho da
     * premissa que o usuário assumiu — por isso continua visível nos dois casos.
     */
    readonly undatedRows: number;
    /**
     * A base de custo em vigor (CFG-23). Sem ela, um total de custo REALIZADO
     * seria indistinguível de um ORÇADO no consumidor — que é exatamente a
     * confusão que o item fecha.
     */
    readonly costBasis: ResolvedCostBasis;
    /**
     * O que a seleção de base fez com as linhas (CFG-23): quais bases entraram,
     * quais existiam e quantas linhas ficaram de fora. `status: 'semDado'` é a
     * razão de `capex`/`opex` virem `null` quando a base pedida não tem dado.
     */
    readonly costBasisSelection: ScenarioCostBasisSelection;
}

/** Opções do recálculo (repassadas ao adaptador ERP). */
export interface ScenarioCapexOpexOptions {
    /**
     * Lado do CRÉDITO no razão: 'budgeted' (credita Fornecedores) | 'actual'
     * (credita Caixa). É o eixo caixa × competência do ERP — NÃO é a base de
     * custo do CFG-23 (essa é `costBasis`, e decide quais LINHAS entram).
     * Quando ausente, deriva de `costBasis`; quando presente, vence.
     */
    readonly basis?: CostEntryAdapterOptions['basis'];
    /**
     * Base de custo (CFG-23): `'budgeted'` (default) | `'actual'`/`'realizado'` |
     * `'forecast'` | `'blended'`. Decide QUAIS LINHAS de custo alimentam o
     * pipeline. Base pedida sem nenhuma linha responde `null` nas dimensões
     * (N3) — nunca o número de outra base com a etiqueta da pedida. Id fora do
     * catálogo cai no default com o descarte visível em `costBasis.unknown` (N8).
     */
    readonly costBasis?: string | null;
    /** Overrides de conta (mesma forma do adaptador ERP). */
    readonly accounts?: CostEntryAdapterOptions['accounts'];
    /**
     * Plano de contas da DRE (CFG-19): id da norma ('IFRS-IAS1') ou apelido
     * curado ('IFRS'). Default BR-DRE. Fora do catálogo cai no default com o
     * descarte visível em `plan.unknown` (N8) — nunca uma norma inventada.
     */
    readonly accountingPlan?: string | null;
    /**
     * Calendário fiscal (CFG-20): mês de início do exercício e a convenção de
     * rótulo do ano. Default jan–dez, que reproduz o comportamento anterior.
     * Mês fora de 1..12 é recusado para o default, visivelmente.
     */
    readonly fiscalCalendar?: FiscalCalendarSpec | null;
    /**
     * Ano fiscal para as linhas que NÃO declaram o seu (CFG-21). Sem ele, essas
     * linhas não podem ser situadas no tempo e o lado afetado responde `null`
     * (N3) — nunca um ano inventado. Para usar o ano corrente, passe-o
     * explicitamente: `fallbackFiscalYear: new Date().getFullYear()`, e aí a
     * premissa é sua, declarada e auditável.
     */
    readonly fallbackFiscalYear?: number | null;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** Linha de custo crua de `element.data.costs[]` (forma mínima). */
interface RawCostRow {
    readonly fiscalYear?: number | string;
    readonly capexTotal?: number;
    readonly opexTotal?: number;
    readonly items?: readonly { readonly categoryId?: string; readonly amount?: number }[];
    /**
     * Base de custo declarada NA LINHA (CFG-23): orçado, realizado ou previsto.
     * Linha sem declaração é orçamento — a convenção que reproduz o que o
     * pipeline já afirmava com `basis: 'budgeted'` cravado.
     */
    readonly basis?: string;
}

function rowsOf(element: unknown): readonly RawCostRow[] {
    const costs = (element as { data?: { costs?: unknown } } | null)?.data?.costs;
    return Array.isArray(costs) ? (costs as readonly RawCostRow[]) : [];
}

/** O ano fiscal utilizável de uma linha, ou `null` quando ela não declara um. */
function rowFiscalYear(row: RawCostRow | null | undefined): number | null {
    const y = Number(row?.fiscalYear);
    return Number.isFinite(y) && y > 0 ? y : null;
}

/**
 * Embala os `costs[]` do SNAPSHOT CLONADO na forma `CostRollupLike`
 * (`byElement`) que `costRollupToJournalEntries` exige — a mesma agregação
 * L2 do rollup canônico, sobre o clone (spec F4, nota obrigatória).
 * Retorna `null` quando NENHUM elemento tem linha de custo (N3).
 *
 * `stampFiscalYear` (CFG-21) carimba as linhas SEM ano com o fallback DECLARADO
 * pelo chamador. O carimbo tem que acontecer aqui, antes do adaptador do ERP:
 * é ele que deriva a data do lançamento de `fiscalYear`, e uma linha sem ano
 * saía carimbada em `1970-12-31` — fora de qualquer janela, descartada em
 * silêncio. Sem fallback declarado nada é carimbado, e o chamador trata as
 * linhas sem ano como `semDado`.
 *
 * `costBasis` (CFG-23) filtra as linhas ANTES de tudo: com a base `actual`, só
 * as linhas realizadas seguem para o ERP. A seleção é POR ELEMENTO (ver
 * {@link scanModelCostRows}).
 *
 * @param model - Modelo do cenário (snapshot clonado) — NÃO é mutado.
 * @param stampFiscalYear - Ano a carimbar nas linhas sem ano; `null` = não carimba.
 * @param costBasis - Base de custo resolvida; ausente = o default orçado.
 * @returns O rollup congelado, ou `null` se não há nenhuma linha na base pedida.
 */
export function buildScenarioCostRollup(
    model: ModelState,
    stampFiscalYear: number | null = null,
    costBasis: ResolvedCostBasis = resolveCostBasis(),
): CostRollupLike | null {
    return rollupFromScan(scanModelCostRows(model, costBasis), stampFiscalYear);
}

/** Agregado, sobre o modelo inteiro, da seleção de base de custo (CFG-23). */
export interface ScenarioCostBasisSelection {
    /**
     * `active` = a base pedida tem linha em algum elemento · `semDado` = ela não
     * tem NENHUMA (N3).
     *
     * O corte é "a base pedida tem dado?", não "todo elemento tem dado nela".
     * Um elemento sem custo realizado genuinamente não realizou custo, e exigir
     * cobertura total tornaria a base `actual` inútil em qualquer modelo misto.
     * O que não pode acontecer — e não acontece — é o descarte ser MUDO:
     * `rejectedRows` conta cada linha deixada de fora por ser de outra base.
     */
    readonly status: 'active' | 'semDado';
    /** Bases de linha efetivamente consumidas (`blended` pode usar mais de uma). */
    readonly used: readonly CostBasisId[];
    /** Bases de linha presentes no modelo (o que EXISTE, para a tela oferecer). */
    readonly available: readonly CostBasisId[];
    /** Linhas sem base declarada, contadas pela convenção (proveniência). */
    readonly undeclaredRows: number;
    /** Linhas descartadas por pertencerem a outra base (proveniência). */
    readonly rejectedRows: number;
}

/** Um elemento do modelo com as linhas que a base pedida consome. */
interface ScannedElement {
    readonly id: string;
    readonly name: string;
    readonly rows: readonly RawCostRow[];
}

/** O modelo lido sob uma base de custo: linhas selecionadas + proveniência. */
interface ModelCostScan {
    readonly elements: readonly ScannedElement[];
    readonly selection: ScenarioCostBasisSelection;
}

function mergeIds(target: Set<CostBasisId>, source: readonly CostBasisId[]): void {
    for (const id of source) target.add(id);
}

/**
 * Lê os `costs[]` do modelo aplicando a base de custo escolhida (CFG-23).
 *
 * A seleção é POR ELEMENTO, não global: se o elemento A tem realizado de 2026 e
 * o B só tem orçado do mesmo ano, uma precedência global daria 2026 ao realizado
 * e o custo de B sumiria — um total que pareceria completo sem ser. Compondo por
 * elemento, cada um entra com a melhor base que ele próprio tem.
 *
 * @param model - Modelo do cenário — NÃO é mutado.
 * @param costBasis - Base de custo resolvida.
 * @returns Elementos com as linhas selecionadas + o agregado de proveniência.
 */
function scanModelCostRows(model: ModelState, costBasis: ResolvedCostBasis): ModelCostScan {
    const elements = Array.isArray(model?.elements) ? (model.elements as unknown[]) : [];
    const scanned: ScannedElement[] = [];
    const used = new Set<CostBasisId>();
    const available = new Set<CostBasisId>();
    let undeclaredRows = 0;
    let rejectedRows = 0;
    let anyRow = false;
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as { id?: string; name?: string } | null;
        const rows = rowsOf(el);
        if (rows.length === 0) continue;
        const picked = selectCostRowsForBasis(rows, costBasis);
        mergeIds(used, picked.used);
        mergeIds(available, picked.available);
        undeclaredRows += picked.undeclaredRows;
        rejectedRows += picked.rejectedRows;
        if (picked.rows.length === 0) continue;
        anyRow = true;
        const id = typeof el?.id === 'string' && el.id.length > 0 ? el.id : `scenario:el-${i}`;
        scanned.push({ id, name: el?.name ?? id, rows: picked.rows });
    }
    return {
        elements: scanned,
        selection: Object.freeze({
            status: anyRow ? 'active' : 'semDado',
            // Ordem canônica do catálogo: a proveniência de um modelo não pode
            // depender da ordem em que os elementos aparecem nele.
            used: sortCostBasisIds(used),
            available: sortCostBasisIds(available),
            undeclaredRows,
            rejectedRows,
        }),
    };
}

/** Embala o resultado do scan na forma `CostRollupLike`, carimbando o ano (CFG-21). */
function rollupFromScan(scan: ModelCostScan, stampFiscalYear: number | null): CostRollupLike | null {
    if (scan.elements.length === 0) return null;
    const byElement: Record<string, { readonly name?: string; readonly costs: readonly RawCostRow[] }> = {};
    for (const el of scan.elements) {
        const stamped =
            stampFiscalYear === null
                ? [...el.rows]
                : el.rows.map((row) =>
                      rowFiscalYear(row) === null ? Object.freeze({ ...row, fiscalYear: stampFiscalYear }) : row,
                  );
        byElement[el.id] = Object.freeze({ name: el.name, costs: Object.freeze(stamped) });
    }
    return Object.freeze({ byElement: Object.freeze(byElement) }) as CostRollupLike;
}

/**
 * Período inclusivo dos anos fiscais das linhas (janela do ledger), sob o
 * calendário fiscal escolhido (CFG-20).
 *
 * Com o calendário default (jan–dez) a janela é `${min}-01-01` … `${max}-12-31`,
 * exatamente as strings montadas à mão antes do CFG-20 — zero regressão.
 *
 * As ÂNCORAS `${ano}-12-31` não são zelo: o adaptador do ERP carimba cada
 * lançamento nessa data, e num calendário rotulado pelo FIM (Austrália, jul–jun)
 * ela cai FORA do exercício — `buildLedger` descartaria o lançamento em silêncio
 * e o custo viraria zero. Unir as âncoras à janela é o que impede a perda muda.
 */
function periodFromRollup(
    rollup: CostRollupLike,
    calendar: ResolvedFiscalCalendar,
): { period: Period | null; years: number[] } {
    const years = new Set<number>();
    const byElement = rollup.byElement ?? {};
    for (const id of Object.keys(byElement)) {
        for (const row of byElement[id]?.costs ?? []) {
            // CFG-21: uma linha sem ano NÃO contribui mais um ano inventado. Se o
            // chamador declarou um fallback, ela já chegou aqui carimbada com ele.
            const y = rowFiscalYear(row);
            if (y !== null) years.add(y);
        }
    }
    const sorted = [...years].sort((a, b) => a - b);
    // Sem NENHUM ano utilizável não há janela: `null`, não uma janela plausível.
    if (sorted.length === 0) return { period: null, years: sorted };
    const anchors = sorted.map((y) => `${y}-12-31`);
    const span = fiscalSpanCovering(sorted, calendar, anchors);
    return {
        period: Object.freeze({
            start: (span as FiscalPeriod).start,
            end: (span as FiscalPeriod).end,
        }),
        years: sorted,
    };
}

/** Como um lado (capex|opex) está informado, e se o dado é SITUÁVEL no tempo. */
interface SideEvidence {
    /** Alguma linha COM ano informa o lado (o dado utilizável de sempre). */
    readonly dated: boolean;
    /** Alguma linha SEM ano informa o lado (CFG-21 — dinheiro sem tempo). */
    readonly undated: boolean;
}

/**
 * Onde o lado está informado — distinguindo "0 real" de "sem dado" e, agora,
 * dado DATADO de dado SEM DATA.
 *
 * A distinção é o item: antes bastava o campo existir para o lado ser dado por
 * informado, e o total saía do ledger — que já havia descartado a linha sem
 * data. Daí o zero forjado.
 */
function sideEvidence(rollup: CostRollupLike, side: 'capexTotal' | 'opexTotal'): SideEvidence {
    const byElement = rollup.byElement ?? {};
    let dated = false;
    let undated = false;
    for (const id of Object.keys(byElement)) {
        for (const row of byElement[id]?.costs ?? []) {
            if (!isFiniteNumber(row?.[side])) continue;
            if (rowFiscalYear(row) === null) undated = true;
            else dated = true;
        }
    }
    return { dated, undated };
}

/**
 * Quantas linhas de custo não declaram ano fiscal NA ORIGEM (proveniência).
 *
 * Conta sobre as linhas SELECIONADAS, não sobre o rollup: o rollup já pode ter
 * sido carimbado com o fallback, e contar ali devolveria 0 — escondendo
 * justamente que a premissa declarada pelo usuário foi aplicada a N linhas. Sem
 * fallback este número é a razão do `null`; com fallback, é o tamanho da
 * premissa em vigor.
 *
 * CFG-23: as linhas são as da base ESCOLHIDA. Contar as de outra base diria que
 * há dinheiro sem data no cálculo quando aquelas linhas nem entraram nele.
 */
function countUndatedRows(scan: ModelCostScan): number {
    let n = 0;
    for (const el of scan.elements) {
        for (const row of el.rows) {
            if (rowFiscalYear(row) === null) n += 1;
        }
    }
    return n;
}

/** Resultado congelado "sem dado" (N3) — nunca 0 forjado. */
function emptyResult(
    plan: ResolvedAccountingPlan,
    fiscalCalendar: ResolvedFiscalCalendar,
    fallbackFiscalYear: ResolvedFallbackFiscalYear,
    costBasis: ResolvedCostBasis,
    costBasisSelection: ScenarioCostBasisSelection,
    elementIds: readonly string[] = Object.freeze([]) as readonly string[],
    undatedRows = 0,
): ScenarioCapexOpex {
    return Object.freeze({
        capex: null,
        opex: null,
        semDado: true,
        fiscalYears: Object.freeze([]) as readonly number[],
        elementIds,
        plan,
        fiscalCalendar,
        // Sem exercício delimitável não há janela: vazia, não uma janela
        // plausível inventada (N3).
        period: Object.freeze({ start: '', end: '' }) as Period,
        fallbackFiscalYear,
        undatedRows,
        costBasis,
        costBasisSelection,
    });
}

/**
 * Recalcula CAPEX/OPEX de um modelo clonado (F4): embala os custos do clone
 * e INVOCA o caminho único do ERP — `costRollupToJournalEntries()` →
 * `buildLedger()` → `buildIncomeStatement('BR-DRE')`. CAPEX é lido do débito
 * em Imobilizado (A.3) no ledger; OPEX é lido das linhas de despesa (D.x)
 * projetadas na DRE. Nenhuma regra contábil vive aqui (NOT N4).
 *
 * `costBasis` (CFG-23) escolhe QUAIS LINHAS alimentam esse caminho. Pedir uma
 * base que o modelo não tem devolve as dimensões em `null` (N3) — nunca o número
 * de outra base usando a etiqueta da pedida.
 *
 * @param model    modelo do cenário (snapshot clonado de F1/F2) — NÃO é mutado.
 * @param options  base de custo, lado do crédito e overrides de conta.
 * @returns resultado congelado; sem linha de custo → dimensões null (N3).
 */
export function recomputeScenarioCapexOpex(
    model: ModelState,
    options: ScenarioCapexOpexOptions = {},
): ScenarioCapexOpex {
    const plan = resolveAccountingPlan(options.accountingPlan);
    const fiscalCalendar = resolveFiscalCalendar(options.fiscalCalendar);
    const fallbackFiscalYear = resolveFallbackFiscalYear(options.fallbackFiscalYear);
    // CFG-23: a base escolhida define as linhas ANTES de qualquer contabilidade.
    const costBasis = resolveCostBasis(options.costBasis);
    const scan = scanModelCostRows(model, costBasis);
    const selection = scan.selection;
    // CFG-21: com fallback DECLARADO, as linhas sem ano são carimbadas com ele
    // antes do ERP — e passam a contar. Sem declaração nada é carimbado.
    const rollup = rollupFromScan(scan, fallbackFiscalYear.year);
    // Sem nenhuma linha NA BASE PEDIDA não há o que apurar: `null` nas duas
    // dimensões, com `costBasisSelection.status` dizendo que a razão foi a base.
    if (!rollup) return emptyResult(plan, fiscalCalendar, fallbackFiscalYear, costBasis, selection);

    const elementIds = Object.freeze(Object.keys(rollup.byElement ?? {})) as readonly string[];
    const undatedRows = countUndatedRows(scan);
    const { period, years } = periodFromRollup(rollup, fiscalCalendar);
    // Nenhum ano utilizável em nenhuma linha: não há exercício onde apurar. N3.
    if (period === null) {
        return emptyResult(plan, fiscalCalendar, fallbackFiscalYear, costBasis, selection, elementIds, undatedRows);
    }
    const adapterOptions: CostEntryAdapterOptions = {
        // O lado do CRÉDITO deriva da base escolhida (custo realizado já saiu do
        // caixa; orçado e previsto ficam em Fornecedores) e o pedido explícito
        // vence. CAPEX e OPEX saem do DÉBITO, então isto não move os totais — a
        // suíte crava a invariância com `assert.equal`.
        basis: options.basis ?? costBasis.basis.ledgerBasis,
        ...(options.accounts ? { accounts: options.accounts } : {}),
    };
    const journal = costRollupToJournalEntries(rollup, adapterOptions);
    const chart = defaultChartBR();
    const ledger = buildLedger(journal, chart, period);

    /**
     * CFG-21 — o lado só entrega número quando o dado que o informa é SITUÁVEL
     * no tempo. Havendo linha sem ano (e sem fallback declarado), o total sairia
     * do ledger que já a descartou: seria um número incompleto com cara de
     * completo. `null` é a resposta honesta.
     */
    const valueOf = (side: 'capexTotal' | 'opexTotal', sum: number): number | null => {
        const ev = sideEvidence(rollup, side);
        if (!ev.dated && !ev.undated) return null; // lado não informado (como sempre)
        if (ev.undated) return null; // há dinheiro que não se situa no tempo (N3)
        return sum;
    };

    // CAPEX — débito em Imobilizado (A.3) no ledger (capitalizado, fora da DRE).
    const fixedAssetsId = options.accounts?.fixedAssets ?? DEFAULT_ACCOUNTS.fixedAssets;
    const capex = valueOf('capexTotal', ledger.get(fixedAssetsId)?.totalDebit ?? 0);

    // OPEX — despesas (D.x) projetadas pela DRE do plano ESCOLHIDO (CFG-19).
    const statement = buildIncomeStatement(ledger, chart, plan.id);
    const despesaIds = new Set(chart.filter((account) => account.rootType === 'despesa').map((account) => account.id));
    const seen = new Set<string>();
    let opexSum = 0;
    for (const line of statement.lines) {
        for (const accountId of line.accountIds) {
            if (!despesaIds.has(accountId) || seen.has(accountId)) continue;
            seen.add(accountId);
            const balance = ledger.get(accountId);
            if (balance) opexSum += balance.balance;
        }
    }
    const opex = valueOf('opexTotal', opexSum);

    return Object.freeze({
        capex,
        opex,
        semDado: capex === null || opex === null,
        fiscalYears: Object.freeze(years) as readonly number[],
        elementIds,
        plan,
        fiscalCalendar,
        period,
        fallbackFiscalYear,
        undatedRows,
        costBasis,
        costBasisSelection: selection,
    });
}
