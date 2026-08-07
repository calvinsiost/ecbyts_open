// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Scenarios — What-If comparator panel (DOM wire). SCENARIOS-IMPACT-001.
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2 F1/F7/F8/S3/S4, §5 UX).
 *
 * MULTI-CENÁRIO (S3/CFG-07/08): o painel compara **1 Base + N cenários** lado a
 * lado, não só 1×1 (era o método do TG do Calvin — 6 rotas RSU comparadas de uma
 * vez). O estado guarda uma LISTA de cenários; o ÚLTIMO é o ativo/editável pelos
 * sliders. Botões "Adicionar cenário" (congela o ativo e abre um novo editável) e
 * "Remover" (por coluna) gerem a lista. A tabela tem 1 coluna Base + N pares
 * (valor | Δ) com scroll-x interno; o veredito consolidado S1 continua sendo
 * calculado contra o cenário ATIVO; os ODS são a UNIÃO de todas as colunas.
 *
 * Fluxo do usuário:
 *   1. "Clonar modelo atual" → cria o cenário Base (real do modelo ou stub de
 *      exemplo rotulado) e o 1º cenário ativo.
 *   2. Mutar o cenário ativo: subtipo + 3 taxas (throughput/recovery/yield) via
 *      sliders → recalcula DE VERDADE (computeRealScenarioMetrics via a VM multi).
 *   3. "Adicionar cenário" para comparar várias mutações simultaneamente.
 *   4. "Exportar" (S4) baixa CSV longo + JSON portável (whitelist LGPD-safe).
 *
 * Anti-crash (CFG-40): combinações fisicamente impossíveis (yield > recovery) são
 * pré-filtradas por `buildPanelMultiScenarioVM` (validador não-lançador) e o
 * cenário incoerente é sinalizado na UI, sem derrubar o painel.
 *
 * HORIZONTE E CRESCIMENTO (CFG-11): um bloco AVANÇADO (recolhido por default)
 * expõe os dois parâmetros temporais que os motores já suportavam mas a tela não
 * ligava — horizonte de projeção (CFG-09: marcos curados 2030/2050/2100 como
 * SUGESTÃO + entrada livre de qualquer ano da faixa, ou duração em anos) e
 * crescimento `g` do driver por FASE (CFG-10: adicionar/remover `{fromYear, g}`).
 * Mudar qualquer um re-renderiza a SÉRIE projetada (§5.2) ali mesmo, sem editar
 * código. Todo ajuste que o motor faz no pedido (clamp no teto, pedido abaixo do
 * mínimo, fase fora da faixa, fase incompleta descartada, 1ª fase ancorada) é
 * mostrado em badge — o painel nunca exibe um valor ajustado como se fosse o
 * pedido. Estado e resolução moram na VM pura `_scenarioHorizonGrowthPanelVMPure`.
 *
 * Usa os tokens `.ecbt-overlay` + `.ecbt-dialog`; CSS em `app/css/scenarios.css`.
 * Fecha em ESC, clique fora, ou botão de fechar. Sem dialogs nativos.
 *
 * Exposed handler:
 *   - openScenarioComparatorPanel() → abre o painel
 *   - closeScenarioComparatorPanel() → fecha o painel
 */

import { escapeHtml } from '../../helpers/html.js';
import { t } from '../../i18n/translations.js';
import { attachModalA11y } from '../modalA11y.js';
import {
    buildStubScenario,
    type StubScenario,
    type Dimension,
    type DeltaSinal,
} from '../../../core/scenarios/_scenarioComparatorVMPure.js';
import { buildRealScenarioComparatorVM } from '../../../core/scenarios/_scenarioComparatorVMPure.js';
import {
    computeRealScenarioMetrics,
    type BaseProcess,
} from '../../../core/scenarios/_scenarioImpactEnginePure.js';
import {
    buildPanelMultiScenarioVM,
    type ScenarioParamSet,
    type PanelMultiScenarioVM,
} from '../../../core/scenarios/_scenarioComparatorPanelVMPure.js';
import {
    addGrowthPhase,
    buildGrowthControlVM,
    buildHorizonControlVM,
    buildTimelineSeriesVM,
    initialTimelineState,
    removeGrowthPhase,
    updateGrowthPhase,
    type GrowthControlVM,
    type HorizonControlVM,
    type TimelineControlsState,
    type TimelineSeriesVM,
} from '../../../core/scenarios/_scenarioHorizonGrowthPanelVMPure.js';
import {
    buildScenarioRobustnessVM,
    initialRobustnessState,
    MAX_UNCERTAINTY_PCT,
    MIN_UNCERTAINTY_PCT,
    type RobustnessControlsState,
    type ScenarioRobustnessPanelVM,
    type TornadoBarVM,
    type UncertainRateId,
} from '../../../core/scenarios/_scenarioRobustnessPanelVMPure.js';
import type {
    MultiScenarioComparatorVM,
    MultiScenarioColumn,
    MultiScenarioCell,
} from '../../../core/scenarios/_multiScenarioVMPure.js';
import {
    buildProcessFromElement,
    hasUsableRealData,
    type RealElementLike,
    type CostRollupForElement,
} from '../../../core/scenarios/_realProcessLoaderPure.js';
import {
    buildScenarioComparatorExportRows,
    buildScenarioComparatorExportJson,
    buildScenarioExportFilename,
} from '../../../core/scenarios/_scenarioComparatorExportPure.js';
import {
    exportScenarioComparatorXlsx,
    exportScenarioComparatorMarkdown,
} from './scenarioComparatorExportRuntime.js';
import {
    clampToRange,
    resolveSliderRanges,
} from '../../../core/scenarios/_scenarioSliderRangeConfigPure.js';
// CFG-39 (spec §2.4.10) — histórico imutável para undo da última mutação.
import {
    canUndo,
    emptyHistory,
    pushSnapshot,
    undo,
    type SessionHistory,
} from '../../../core/scenarios/_scenarioSessionHistoryPure.js';
import { toCsv, downloadCsv } from '../../helpers/csvExport.js';
import { getAllElements } from '../../../core/elements/manager.js';
import { buildCostRollup } from '../../../core/analytics/economics/costRollup.js';

declare global {
    interface Window {
        handleOpenScenarioComparatorPanel?: () => void;
        handleCloseScenarioComparatorPanel?: () => void;
    }
}

const OVERLAY_ID = 'scenario-comparator-overlay';
let _a11yCleanup: (() => void) | null = null;

interface PanelState {
    base: StubScenario | null;
    /**
     * Lista de cenários (S3/CFG-07). O ÚLTIMO é o ATIVO/editável pelos sliders;
     * os anteriores estão congelados e comparam lado a lado. Vazia até clonar.
     */
    scenarios: ScenarioParamSet[];
    /** Data source of the current Base: real model element vs. labelled example stub. */
    dataSource: 'real' | 'example';
    /** Resolved REAL BaseProcess when `dataSource === 'real'` (CFG-01..04). */
    realProcess: BaseProcess | null;
    /**
     * Horizonte (CFG-09) + crescimento por fase (CFG-10) escolhidos na tela —
     * o estado que o CFG-11 passou a expor em widgets. Começa no default do
     * motor, então abrir o painel sem mexer aqui reproduz o comportamento atual.
     */
    timeline: TimelineControlsState;
    /**
     * O bloco de horizonte/crescimento é MODO AVANÇADO (§2.4 CFG-11): fica
     * recolhido por default. Recolhido = série não projetada (nem calculada).
     */
    timelineOpen: boolean;
    /**
     * Incerteza (CFG-33) + sensibilidade (CFG-34): nº de amostras, seed e a
     * faixa de incerteza das taxas. Nasce nos defaults do motor (N8).
     */
    robustness: RobustnessControlsState;
    /**
     * O bloco de robustez também é MODO AVANÇADO (§2.4 CFG-33 "default = ponto
     * único; modo avançado liga a banda"): recolhido = Monte Carlo NEM roda.
     */
    robustnessOpen: boolean;
    /**
     * CFG-39 — histórico IMUTÁVEL de snapshots do cenário ATIVO para undo da
     * última mutação. Persiste em MEMÓRIA DA SESSÃO (NOT N7 — nunca Supabase),
     * ou seja, sobrevive à troca de aba no mesmo carregamento do app porque
     * este `_state` vive em escopo de módulo. Reseta quando o cenário ativo
     * muda de identidade (clone, adicionar/remover cenário): undo é escopado
     * à cadeia de mutações do cenário corrente, não transversal a colunas.
     */
    history: SessionHistory<ScenarioParamSet>;
}
const _state: PanelState = {
    base: null,
    scenarios: [],
    dataSource: 'example',
    realProcess: null,
    timeline: initialTimelineState(null),
    timelineOpen: false,
    robustness: initialRobustnessState(),
    robustnessOpen: false,
    history: emptyHistory(),
};

/**
 * Monta o `BaseProcess` REAL a partir dos parâmetros do cenário (subtipo + 3
 * taxas). As rotas (concentrado, rejeito, água, energia, empregos) trazem os
 * fatores unitários de custo (CAPEX/OPEX por unidade de A(t)) e as
 * características físicas que alimentam os medidores ODS oficiais. Os fatores são
 * plausíveis para a demonstração; quando o modelo real existir, virão dele —
 * mas a ÁLGEBRA (Σ α×fator×A(t) via ERP/ECBT/ODS) já é a de produção.
 */
function buildBaseProcess(params: {
    subtype: 'mining' | 'petroleum';
    throughput: number;
    recoveryRate: number;
    yield: number;
}): BaseProcess {
    return {
        subtype: params.subtype,
        throughput: params.throughput,
        recoveryRate: params.recoveryRate,
        yield: params.yield,
        elementId: 'scenario:demo-process',
        fiscalYear: 2026,
        routes: [
            {
                id: 'concentrate',
                alpha: params.yield,
                // CFG-41: DECLARA que este α segue o rendimento. A Base já usava
                // essa convenção (α = yield), mas o cenário mutado não — o slider
                // "Rendimento" não movia nada. Declarando, os dois falam a mesma
                // língua e a taxa vira alavanca de verdade.
                alphaFrom: 'yield',
                capexUnit: 9.5e3,
                opexUnit: 7.2e3,
                characteristic: { kind: 'energy', factor: 0.045, reference: 100 },
            },
            {
                id: 'tailings',
                alpha: Math.max(0, 1 - params.yield),
                // O complemento: o que não vira produto vira rejeito.
                alphaFrom: 'yieldComplement',
                capexUnit: 1.2e3,
                opexUnit: 3.4e3,
                characteristic: { kind: 'tailings', factor: 0.6, reference: 5000 },
            },
            {
                id: 'water',
                alpha: 0.5,
                opexUnit: 1.1e3,
                characteristic: { kind: 'waterStress', factor: 2.0, reference: 1.0e6 },
            },
            {
                id: 'jobs',
                alpha: 0.2,
                characteristic: { kind: 'jobs', factor: 0.01, reference: 50 },
            },
        ],
    };
}

/**
 * CFG-01..04 — resolve a fonte de dados do cenário Base: procura no modelo um
 * elemento REAL da família `production_area` com dados utilizáveis (custos reais
 * via `buildCostRollup`). Se houver, devolve o `BaseProcess` montado a partir do
 * DADO REAL (`buildProcessFromElement`). Senão, devolve `null` → a UI cai no stub
 * de exemplo (rotulado), NUNCA apresentando número de demo como se fosse real.
 *
 * Tudo é defensivo: qualquer falha de leitura do modelo degrada para o exemplo.
 *
 * @returns o `BaseProcess` real, ou `null` quando não há dado real utilizável.
 */
function resolveRealBaseProcess(): BaseProcess | null {
    try {
        const elements = (getAllElements() || []) as RealElementLike[];
        const production = elements.filter(
            (el) => el?.family === 'production_area' || el?.familyId === 'production_area',
        );
        if (production.length === 0) return null;
        // Rollup real de custos por elemento (fonte REAL de CAPEX/OPEX).
        const rollup = buildCostRollup() as { byElement?: Record<string, CostRollupForElement> };
        const byElement = rollup?.byElement ?? {};
        for (const el of production) {
            const id = typeof el.id === 'string' ? el.id : '';
            const forEl = id ? byElement[id] : undefined;
            if (hasUsableRealData(el, forEl)) {
                return buildProcessFromElement(el, forEl);
            }
        }
        return null;
    } catch {
        // Degradação graciosa: qualquer erro de leitura → cair no exemplo.
        return null;
    }
}

/** i18n com fallback: se a chave não resolver, usa o texto pt fornecido. */
function tr(key: string, fallback: string): string {
    try {
        const out = t(key);
        return out && out !== key ? out : fallback;
    } catch {
        return fallback;
    }
}

/**
 * i18n com parâmetros `{{nome}}`. Interpola DEPOIS do fallback para que o texto
 * pt embutido aceite os mesmos marcadores da chave traduzida — do contrário uma
 * chave ainda não traduzida mostraria `{{max}}` cru na tela.
 */
function trp(key: string, fallback: string, params: Record<string, string | number>): string {
    let out = tr(key, fallback);
    for (const [k, v] of Object.entries(params)) out = out.split(`{{${k}}}`).join(String(v));
    return out;
}

const DIM_LABEL_KEYS: Record<Dimension, readonly [string, string]> = Object.freeze({
    capex: ['scenarios.dim.capex', 'Investimento (CAPEX)'],
    opex: ['scenarios.dim.opex', 'Custo operacional (OPEX)'],
    ecbt: ['scenarios.dim.ecbt', 'ECBT Score (líquido)'],
    ods: ['scenarios.dim.ods', 'ODS afetados (por indicador)'],
});

const DIM_ORDER: readonly Dimension[] = Object.freeze(['capex', 'opex', 'ecbt', 'ods']);

/** Parâmetros default de um cenário quando não há dado real nem base clonada. */
const DEFAULT_PARAMS: ScenarioParamSet = Object.freeze({
    subtype: 'mining',
    throughput: 1000,
    recoveryRate: 0.8,
    yield: 0.7,
});

/**
 * Parâmetros-base (semente do 1º cenário e default dos novos): quando há DADO
 * REAL, as 3 taxas iniciais vêm do processo real (honesto — o slider reflete o
 * modelo); senão, do stub de exemplo. É o ponto de partida "= Base".
 */
function baseSliderParams(): ScenarioParamSet {
    const rp = _state.realProcess;
    if (_state.dataSource === 'real' && rp) {
        const subtype = rp.subtype === 'petroleum' ? 'petroleum' : 'mining';
        return Object.freeze({ subtype, throughput: rp.throughput, recoveryRate: rp.recoveryRate, yield: rp.yield });
    }
    if (_state.base) return Object.freeze({ ..._state.base.params });
    return DEFAULT_PARAMS;
}

/** O cenário ATIVO (último da lista) — o que os sliders editam. */
function activeScenario(): ScenarioParamSet | null {
    return _state.scenarios.length > 0 ? _state.scenarios[_state.scenarios.length - 1]! : null;
}

/** O `BaseProcess` em vigor (real do modelo ou stub de exemplo); `null` antes de clonar. */
function currentBaseProcess(): BaseProcess | null {
    if (_state.realProcess) return _state.realProcess;
    return _state.base ? buildBaseProcess(_state.base.params) : null;
}

/**
 * Ano-base t₀ da série (âncora do horizonte e das fases). Vem do `fiscalYear` do
 * processo — o MESMO ano que o motor de impacto usa no período do razão — e cai
 * no default 2026 do motor quando o processo não declara.
 */
function currentBaseYear(): number {
    const fy = currentBaseProcess()?.fiscalYear;
    return typeof fy === 'number' && Number.isFinite(fy) ? Math.floor(fy) : 2026;
}

/** Formata um número da célula com a unidade, ou o rótulo "sem dado". */
function fmtValue(v: number | null, unidade: string): string {
    if (v === null) return `<span class="scn-nodata">${escapeHtml(tr('scenarios.noData', 'sem dado'))}</span>`;
    const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v);
    return unidade ? `${escapeHtml(num)} <span class="scn-unit">${escapeHtml(unidade)}</span>` : escapeHtml(num);
}

/** Classe CSS + glyph textual (não-só-cor — A11y) para o sinal do delta. */
function deltaPresentation(cell: { sinal: DeltaSinal }): { cls: string; glyph: string } {
    switch (cell.sinal) {
        case 'melhora':
            return { cls: 'scn-delta--good', glyph: '&#9650;' }; // ▲
        case 'piora':
            return { cls: 'scn-delta--bad', glyph: '&#9660;' }; // ▼
        case 'neutro':
            return { cls: 'scn-delta--flat', glyph: '&#9644;' }; // ▬
        default:
            return { cls: 'scn-delta--nodata', glyph: '&#8211;' }; // –
    }
}

/** Renderiza a célula Δ (valor + glyph direcional + aria-label legível) de UMA coluna de cenário. */
function fmtDeltaCell(cell: MultiScenarioCell): string {
    const { cls, glyph } = deltaPresentation(cell);
    if (cell.delta === null) {
        return (
            `<td class="scn-delta ${cls}" aria-label="${escapeHtml(tr('scenarios.noData', 'sem dado'))}">` +
            `<span aria-hidden="true">${glyph}</span> ${escapeHtml(tr('scenarios.noData', 'sem dado'))}</td>`
        );
    }
    const signTxt = cell.delta > 0 ? '+' : '';
    const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(cell.delta);
    const sinalWord =
        cell.sinal === 'melhora'
            ? tr('scenarios.improve', 'melhora')
            : cell.sinal === 'piora'
              ? tr('scenarios.worsen', 'piora')
              : tr('scenarios.flat', 'neutro');
    const aria = `${signTxt}${num} ${cell.unidade} (${sinalWord})`;
    return (
        `<td class="scn-delta ${cls}" aria-label="${escapeHtml(aria)}">` +
        `<span aria-hidden="true">${glyph}</span> ${escapeHtml(signTxt + num)}` +
        (cell.unidade ? ` <span class="scn-unit">${escapeHtml(cell.unidade)}</span>` : '') +
        `</td>`
    );
}

/** Cabeçalho da tabela multi-cenário: Dimensão + Base + (valor|Δ) por cenário. */
function renderMultiHead(vm: MultiScenarioComparatorVM): string {
    const activeIdx = vm.columns.length - 1; // último = ativo/editável
    const headCells = vm.columns
        .map((col) => {
            if (col.isBase) {
                return `<th scope="col" class="scn-col-base">${escapeHtml(col.label)}</th>`;
            }
            const activeCls = col.index === activeIdx ? ' scn-col--active' : '';
            const removeBtn =
                `<button type="button" class="scn-scenario-remove" data-remove-scenario="${col.index}" ` +
                `aria-label="${escapeHtml(tr('scenarios.removeScenario', 'Remover cenário') + ' — ' + col.label)}" ` +
                `title="${escapeHtml(tr('scenarios.removeScenario', 'Remover cenário'))}">&times;</button>`;
            return (
                `<th scope="colgroup" colspan="2" class="scn-col-scenario${activeCls}">` +
                `<span class="scn-col-label">${escapeHtml(col.label)}</span>${removeBtn}</th>`
            );
        })
        .join('');
    // Sub-cabeçalho: cada cenário ocupa 2 colunas (valor | Δ).
    const subCells = vm.columns
        .map((col) => {
            if (col.isBase) return '';
            return (
                `<th scope="col" class="scn-sub scn-sub-val">${escapeHtml(tr('scenarios.subValue', 'Valor'))}</th>` +
                `<th scope="col" class="scn-sub scn-sub-delta">${escapeHtml(tr('scenarios.columnDelta', 'Diferença'))}</th>`
            );
        })
        .join('');
    return (
        `<tr><th scope="col" class="scn-col-dim">${escapeHtml(tr('scenarios.dimension', 'Dimensão'))}</th>${headCells}</tr>` +
        `<tr><th scope="col" class="scn-col-dim scn-sub"></th>${subCells}</tr>`
    );
}

/** Uma linha-dimensão: rótulo + valor Base + (valor|Δ) por cenário. */
function renderMultiRow(vm: MultiScenarioComparatorVM, dim: Dimension): string {
    const [key, fb] = DIM_LABEL_KEYS[dim];
    const cells = vm.columns
        .map((col: MultiScenarioColumn) => {
            const cell = col.dims[dim];
            if (col.isBase) {
                return `<td class="scn-base">${fmtValue(cell.value, cell.unidade)}</td>`;
            }
            return `<td class="scn-alt">${fmtValue(cell.value, cell.unidade)}</td>${fmtDeltaCell(cell)}`;
        })
        .join('');
    return `<tr><th scope="row">${escapeHtml(tr(key, fb))}</th>${cells}</tr>`;
}

/** Tabela multi-cenário completa (com scroll-x interno para N colunas). */
function renderMultiTable(vm: MultiScenarioComparatorVM): string {
    const rows = DIM_ORDER.map((dim) => renderMultiRow(vm, dim)).join('');
    return `<div class="scn-table-scroll">
        <table class="scn-table scn-table--multi" role="table" aria-label="${escapeHtml(tr('scenarios.tableAriaMulti', 'Comparador multi-cenário: base vs. N cenários'))}">
            <thead>${renderMultiHead(vm)}</thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

/** Formata uma parcela monetizada (R$) para o tooltip, ou "sem dado". */
function fmtParcel(v: number | null): string {
    if (v === null || !Number.isFinite(v)) return tr('scenarios.noData', 'sem dado');
    const sign = v > 0 ? '+' : '';
    return `${sign}${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v)} R$`;
}

/**
 * Veredito ÚNICO consolidado (S1): valor econômico-ambiental de ciclo de vida
 * (ΔECBT − ΔCAPEX − ΔOPEX) do cenário ATIVO vs. a Base, com decomposição das 3
 * parcelas no tooltip — decisão Calvin 2026-07-08. Sem dado numa parcela →
 * veredito "sem dado" (N3). Continua sendo 1×1 (Base vs. ativo) mesmo com N
 * cenários na tabela, para preservar a leitura de decisão.
 */
function renderConsolidatedVerdict(baseProcess: BaseProcess, active: ScenarioParamSet): string {
    const baseReal = computeRealScenarioMetrics(baseProcess, {});
    const altReal = computeRealScenarioMetrics(baseProcess, {
        subtype: active.subtype,
        throughput: active.throughput,
        recoveryRate: active.recoveryRate,
        yield: active.yield,
    });
    const c = buildRealScenarioComparatorVM(baseReal, altReal).consolidado;
    const { cls, glyph } = deltaPresentation({ sinal: c.sinal });
    const label = tr('scenarios.consolidated.label', 'Veredito econômico-ambiental (ciclo de vida)');
    const tip =
        `${tr('scenarios.dim.ecbt', 'ECBT Score (líquido)')}: ${fmtParcel(c.parcelas.ecbt)} · ` +
        `${tr('scenarios.dim.capex', 'Investimento (CAPEX)')}: ${fmtParcel(c.parcelas.capex)} · ` +
        `${tr('scenarios.dim.opex', 'Custo operacional (OPEX)')}: ${fmtParcel(c.parcelas.opex)}`;
    let valueHtml: string;
    if (c.valor === null || !Number.isFinite(c.valor)) {
        valueHtml = escapeHtml(tr('scenarios.noData', 'sem dado'));
    } else {
        const sign = c.valor > 0 ? '+' : '';
        const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(c.valor);
        valueHtml = `<span aria-hidden="true">${glyph}</span> ${escapeHtml(sign + num)} <span class="scn-unit">${escapeHtml(c.unidade)}</span>`;
    }
    const activeNote = tr('scenarios.consolidated.activeNote', 'vs. cenário ativo');
    return `<section class="scn-consolidated ${cls}" aria-label="${escapeHtml(label)}">
        <h3>${escapeHtml(label)} <span class="scn-consolidated-scope">(${escapeHtml(activeNote)})</span></h3>
        <p class="scn-consolidated-value" title="${escapeHtml(tip)}" aria-label="${escapeHtml(`${label}: ${tip}`)}">${valueHtml}</p>
        <p class="scn-consolidated-decomp" aria-hidden="true">${escapeHtml(tip)}</p>
    </section>`;
}

/** HTML da lista de ODS afetados (UNIÃO de todas as colunas) por indicador. */
function renderOdsList(vm: MultiScenarioComparatorVM): string {
    if (vm.odsAfetados.length === 0) {
        return `<p class="scn-ods-empty">${escapeHtml(tr('scenarios.noData', 'sem dado'))}</p>`;
    }
    const items = vm.odsAfetados
        .map((o) => {
            const { cls, glyph } = deltaPresentation({ sinal: o.sinal });
            return `<li class="scn-ods-item ${cls}">
            <span class="scn-ods-badge" aria-hidden="true">ODS ${escapeHtml(String(o.goal))}</span>
            <span class="scn-ods-indicator">${escapeHtml(o.indicator)}</span>
            <span class="scn-ods-sinal"><span aria-hidden="true">${glyph}</span></span>
            <a class="scn-ods-source" href="${escapeHtml(o.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tr('scenarios.odsSource', 'fonte'))}</a>
        </li>`;
        })
        .join('');
    return `<ul class="scn-ods-list">${items}</ul>`;
}

/** Aviso honesto de cenários incoerentes (CFG-40) — pré-filtrados da tabela. */
function renderRejectedNotice(panelVm: PanelMultiScenarioVM): string {
    if (panelVm.rejected.length === 0) return '';
    const items = panelVm.rejected
        .map((r) => `<li>${escapeHtml(`${r.label}: ${r.message}`)}</li>`)
        .join('');
    const title = tr('scenarios.rejected.title', 'Cenário fisicamente impossível (não comparado)');
    return `<div class="scn-rejected" role="alert">
        <strong>${escapeHtml(title)}</strong>
        <ul>${items}</ul>
    </div>`;
}

/**
 * Banner honesto da fonte de dados (CFG-01 + guard-rail §2.4.0): o usuário SEMPRE
 * sabe se vê dado REAL do modelo ou dado de EXEMPLO. Em modo exemplo, instrui a
 * adicionar uma Área Produtiva para obter cenários reais.
 */
function renderDataSourceBanner(): string {
    if (_state.dataSource === 'real') {
        return `<div class="scn-source scn-source--real" role="status">` +
            `${escapeHtml(tr('scenarios.realData.badge', 'Dados reais do modelo'))}</div>`;
    }
    return `<div class="scn-source scn-source--example" role="alert">` +
        `<strong>${escapeHtml(tr('scenarios.exampleWarning.badge', 'Usando dados de exemplo'))}</strong> ` +
        `${escapeHtml(tr('scenarios.exampleWarning.hint', 'adicione uma Área Produtiva ao modelo para cenários reais.'))}</div>`;
}

/** Barra de ações do comparador: Adicionar cenário + Exportar. */
function renderComparatorActions(): string {
    const add =
        `<button type="button" class="scn-add-scenario" data-action="add-scenario" ` +
        `aria-label="${escapeHtml(tr('scenarios.addScenario', 'Adicionar cenário'))}">` +
        `+ ${escapeHtml(tr('scenarios.addScenario', 'Adicionar cenário'))}</button>`;
    const exportCsvBtn =
        `<button type="button" class="scn-export" data-action="export-csv" ` +
        `aria-label="${escapeHtml(tr('scenarios.exportCsv', 'Exportar CSV'))}">${escapeHtml(tr('scenarios.exportCsv', 'Exportar CSV'))}</button>`;
    const exportJsonBtn =
        `<button type="button" class="scn-export" data-action="export-json" ` +
        `aria-label="${escapeHtml(tr('scenarios.exportJson', 'Exportar JSON'))}">${escapeHtml(tr('scenarios.exportJson', 'Exportar JSON'))}</button>`;
    const exportXlsxBtn =
        `<button type="button" class="scn-export" data-action="export-xlsx" ` +
        `aria-label="${escapeHtml(tr('scenarios.exportXlsx', 'Exportar XLSX'))}">${escapeHtml(tr('scenarios.exportXlsx', 'Exportar XLSX'))}</button>`;
    const exportMdBtn =
        `<button type="button" class="scn-export" data-action="export-md" ` +
        `aria-label="${escapeHtml(tr('scenarios.exportMd', 'Exportar Markdown'))}">${escapeHtml(tr('scenarios.exportMd', 'Exportar Markdown'))}</button>`;
    return (
        `<div class="scn-actions">${add}<span class="scn-actions-spacer"></span>` +
        `${exportCsvBtn}${exportJsonBtn}${exportXlsxBtn}${exportMdBtn}</div>`
    );
}

/** Guarda o VM multi-cenário mais recente para o export (evita recomputar). */
let _lastPanelVm: PanelMultiScenarioVM | null = null;

/** HTML completo do bloco comparador (banner + ações + tabela multi + veredito + ODS). */
function renderComparator(): string {
    if (!_state.base || _state.scenarios.length === 0) {
        _lastPanelVm = null;
        return `<div class="scn-empty" role="status">${escapeHtml(tr('scenarios.emptyHint', 'Clone o modelo atual para começar a comparar cenários.'))}</div>`;
    }
    const baseProcess = _state.realProcess ?? buildBaseProcess(_state.base.params);
    const panelVm = buildPanelMultiScenarioVM(baseProcess, _state.scenarios);
    _lastPanelVm = panelVm;
    const active = activeScenario();
    // Veredito consolidado só quando o cenário ativo é coerente (senão sem dado honesto).
    const verdict =
        active && !panelVm.activeRejected ? renderConsolidatedVerdict(baseProcess, active) : '';
    return `
    ${renderDataSourceBanner()}
    ${renderComparatorActions()}
    ${renderRejectedNotice(panelVm)}
    ${renderMultiTable(panelVm.vm)}
    ${verdict}
    <section class="scn-ods" aria-label="${escapeHtml(tr('scenarios.dim.ods', 'ODS afetados (por indicador)'))}">
        <h3>${escapeHtml(tr('scenarios.dim.ods', 'ODS afetados (por indicador)'))}</h3>
        ${renderOdsList(panelVm.vm)}
    </section>`;
}

// CFG-37: tooltip leigo para jargão — cada controle ganha explicação em linguagem simples.
// A chave de descrição segue o padrão scenarios.rate.<id>.tip e tem fallback pt-BR embutido.
const RATE_TIP_KEYS: Record<string, readonly [string, string]> = Object.freeze({
    throughput: ['scenarios.rate.throughput.tip', 'Quantas toneladas por hora a operação consegue processar'],
    recoveryRate: ['scenarios.rate.recoveryRate.tip', 'Percentual do material que é recuperado (não perdido)'],
    yield: ['scenarios.rate.yield.tip', 'Quanto do insumo vira produto final (eficiência)'],
});
/** Slider de uma taxa universal com label, valor atual e faixa. */
function renderRate(
    id: string,
    labelKey: string,
    labelFb: string,
    min: number,
    max: number,
    step: number,
    value: number,
): string {
    const tip = RATE_TIP_KEYS[id] ? tr(RATE_TIP_KEYS[id][0], RATE_TIP_KEYS[id][1]) : '';
    const tipAttr = tip ? ` title="${escapeHtml(tip)}"` : '';
    return `<label class="scn-rate">
        <span class="scn-rate-label"${tipAttr}>${escapeHtml(tr(labelKey, labelFb))}</span>
        <input type="range" class="scn-rate-input" data-rate="${escapeHtml(id)}"
               min="${min}" max="${max}" step="${step}" value="${value}"
               aria-label="${escapeHtml(tr(labelKey, labelFb))}"${tipAttr}>
        <output class="scn-rate-value" data-rate-out="${escapeHtml(id)}">${escapeHtml(String(value))}</output>
    </label>`;
}

/**
 * HTML dos controles de mutação (subtipo + 3 sliders) do cenário ATIVO.
 * CFG-36: as faixas dos sliders vêm do catálogo CURADO por subtipo
 * (`_scenarioSliderRangeConfigPure`) — não mais uma faixa fixa universal.
 * O valor exibido é clampado à faixa do subtipo (slider e número concordam;
 * o parâmetro do cenário não é reescrito aqui — render honesto, N3).
 */
function renderMutationControls(): string {
    const active = activeScenario();
    const params = active ?? DEFAULT_PARAMS;
    const ranges = resolveSliderRanges(params.subtype);
    const disabled = _state.base && active ? '' : 'disabled';
    const activeLabel = _state.scenarios.length > 0 ? `Cenário ${_state.scenarios.length}` : '';
    const legend = activeLabel
        ? `${tr('scenarios.mutateTitle', 'Mutar um processo')} — ${activeLabel}`
        : tr('scenarios.mutateTitle', 'Mutar um processo');
    // CFG-39: botão Desfazer fica desabilitado quando não há histórico p/ ativo.
    const undoDisabled = disabled || !canUndo(_state.history) ? 'disabled' : '';
    const undoTitle = tr('scenarios.undoHint', 'Desfaz a última mutação do cenário ativo');
    return `
    <fieldset class="scn-mutate" ${disabled}>
        <legend>${escapeHtml(legend)}</legend>
        <label class="scn-subtype">
            <span>${escapeHtml(tr('scenarios.subtype', 'Subtipo'))}</span>
            <select class="scn-subtype-input" data-subtype aria-label="${escapeHtml(tr('scenarios.subtype', 'Subtipo'))}">
                <option value="mining"${params.subtype === 'mining' ? ' selected' : ''}>${escapeHtml(tr('productionSubtype.mining', 'Mineração'))}</option>
                <option value="petroleum"${params.subtype === 'petroleum' ? ' selected' : ''}>${escapeHtml(tr('productionSubtype.petroleum', 'Petróleo'))}</option>
            </select>
        </label>
        ${renderRate('throughput', 'scenarios.rate.throughput', 'Vazão (t/h)', ranges.throughput.min, ranges.throughput.max, ranges.throughput.step, Math.round(clampToRange(ranges.throughput, params.throughput)))}
        ${renderRate('recoveryRate', 'scenarios.rate.recoveryRate', 'Recuperação', ranges.recoveryRate.min, ranges.recoveryRate.max, ranges.recoveryRate.step, clampToRange(ranges.recoveryRate, params.recoveryRate))}
        ${renderRate('yield', 'scenarios.rate.yield', 'Rendimento', ranges.yield.min, ranges.yield.max, ranges.yield.step, clampToRange(ranges.yield, params.yield))}
        <button type="button" class="scn-undo-btn" data-action="undo" ${undoDisabled} title="${escapeHtml(undoTitle)}" aria-label="${escapeHtml(undoTitle)}">${escapeHtml(tr('scenarios.undoButton', 'Desfazer'))}</button>
    </fieldset>`;
}

// ═════════════════ Horizonte + crescimento na tela (CFG-11) ═════════════════
//
// Os motores CFG-09 (`_scenarioHorizonPure`) e CFG-10 (`_scenarioGrowthPure`) já
// existiam e já estavam ligados na projeção §5.2 — o que faltava era a TELA.
// Este bloco é só render + eventos: toda a resolução (faixa, clamp, ordenação de
// fases, descarte de fase incompleta, projeção) é da VM pura
// `_scenarioHorizonGrowthPanelVMPure`, e nenhum número é recalculado aqui.

/** Número pt-BR com no máximo `digits` casas. */
function fmtNum(v: number, digits = 0): string {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(v);
}

/** Δ com sinal explícito, ou o rótulo "sem dado" (N3 — nunca um 0 forjado). */
function fmtDeltaNum(v: number | null): string {
    if (v === null || !Number.isFinite(v)) return tr('scenarios.noData', 'sem dado');
    return `${v > 0 ? '+' : ''}${fmtNum(v)}`;
}

/** `g` fração → %/ano legível (0.03 → 3), sem lixo de ponto flutuante. */
function gToPercent(g: number): number {
    return Math.round(g * 1e6) / 1e4;
}

/** Badge honesto do ajuste de HORIZONTE — só aparece quando o motor mexeu (CFG-09). */
function renderHorizonAdjusted(vm: HorizonControlVM): string {
    if (!vm.adjusted) return '';
    let why: string;
    if (vm.adjustReason === 'clamped-max') {
        why = trp(
            'scenarios.horizon.adjusted.clampedMax',
            'acima do teto de {{max}} anos — aplicado o teto',
            { max: vm.maxYears },
        );
    } else if (vm.adjustReason === 'no-anchor') {
        why = tr(
            'scenarios.horizon.adjusted.noAnchor',
            'sem ano-base para converter o ano-marco — nada foi presumido',
        );
    } else {
        why = trp(
            'scenarios.horizon.adjusted.belowMin',
            'abaixo do mínimo de {{min}} ano — aplicado o horizonte padrão',
            { min: vm.minYears },
        );
    }
    const label = tr('scenarios.horizon.adjusted.label', 'Horizonte ajustado');
    return `<p class="scn-adjusted" role="status"><span class="scn-adjusted-badge">${escapeHtml(label)}</span> ${escapeHtml(why)}</p>`;
}

/** Leitura do horizonte de fato aplicado (as duas representações, auditável). */
function renderHorizonReadout(vm: HorizonControlVM): string {
    const h = vm.resolved;
    const span = trp('scenarios.horizon.readoutYears', '{{n}} anos', { n: h.horizonYears });
    // Ano é IDENTIFICADOR, não quantidade: nada de separador de milhar (2.030).
    const range =
        h.baseYear === null || h.horizonYear === null
            ? tr('scenarios.noData', 'sem dado')
            : `${h.baseYear} → ${h.horizonYear}`;
    const milestone = h.milestone
        ? ` <span class="scn-milestone-tag">${escapeHtml(tr('scenarios.horizon.milestoneTag', 'marco institucional'))}</span>`
        : '';
    return (
        `<p class="scn-readout">${escapeHtml(tr('scenarios.horizon.applied', 'Série aplicada'))}: ` +
        `<strong>${escapeHtml(range)}</strong> <span class="scn-unit">${escapeHtml(span)}</span>${milestone}</p>`
    );
}

/** Controle de horizonte: modo + marcos curados (sugestão) + entrada livre (CFG-09). */
function renderHorizonControl(vm: HorizonControlVM): string {
    const isYear = vm.mode === 'year';
    const modeLabel = tr('scenarios.horizon.mode', 'Forma do horizonte');
    const chips = vm.milestones
        .map((m) => {
            const cls = `scn-chip${m.selected ? ' scn-chip--on' : ''}`;
            const dis = m.usable ? '' : ' disabled';
            const hint = m.usable
                ? ''
                : ` title="${escapeHtml(tr('scenarios.horizon.milestoneUnusable', 'fora da faixa projetável a partir do ano-base'))}"`;
            return (
                `<button type="button" class="${cls}" data-milestone="${m.year}"${dis}${hint} ` +
                `aria-pressed="${m.selected ? 'true' : 'false'}">${escapeHtml(String(m.year))}</button>`
            );
        })
        .join('');
    const freeYear = `<label class="scn-field">
        <span class="scn-field-label">${escapeHtml(tr('scenarios.horizon.year', 'Ano-marco'))}</span>
        <input type="number" class="scn-num" data-horizon-year step="1"
               min="${vm.minYear}" max="${vm.maxYear}" value="${vm.requestedYear ?? ''}"
               aria-label="${escapeHtml(tr('scenarios.horizon.year', 'Ano-marco'))}">
    </label>`;
    const freeYears = `<label class="scn-field">
        <span class="scn-field-label">${escapeHtml(tr('scenarios.horizon.years', 'Duração (anos)'))}</span>
        <input type="number" class="scn-num" data-horizon-years step="1"
               min="${vm.minYears}" max="${vm.maxYears}" value="${vm.requestedYears ?? ''}"
               aria-label="${escapeHtml(tr('scenarios.horizon.years', 'Duração (anos)'))}">
    </label>`;
    return `<fieldset class="scn-horizon">
        <legend>${escapeHtml(tr('scenarios.horizon.title', 'Horizonte de projeção'))}</legend>
        <p class="scn-hint">${escapeHtml(tr('scenarios.horizon.hint', 'Escolha um marco institucional ou digite qualquer ano da faixa.'))}</p>
        <div class="scn-row">
            <label class="scn-field">
                <span class="scn-field-label">${escapeHtml(modeLabel)}</span>
                <select class="scn-select" data-horizon-mode aria-label="${escapeHtml(modeLabel)}">
                    <option value="year"${isYear ? ' selected' : ''}>${escapeHtml(tr('scenarios.horizon.modeYear', 'Ano-marco'))}</option>
                    <option value="duration"${isYear ? '' : ' selected'}>${escapeHtml(tr('scenarios.horizon.modeDuration', 'Duração'))}</option>
                </select>
            </label>
            ${isYear ? freeYear : freeYears}
        </div>
        ${isYear ? `<div class="scn-chips" role="group" aria-label="${escapeHtml(tr('scenarios.horizon.milestones', 'Marcos sugeridos'))}">${chips}</div>` : ''}
        ${renderHorizonReadout(vm)}
        ${renderHorizonAdjusted(vm)}
    </fieldset>`;
}

/** Badges honestos do que o motor mexeu no cronograma de fases (CFG-10). */
function renderGrowthAdjusted(vm: GrowthControlVM): string {
    if (!vm.adjusted) return '';
    const r = vm.resolved;
    const notes: string[] = [];
    if (r.rejected > 0) {
        notes.push(
            trp('scenarios.growth.adjusted.rejected', '{{n}} fase(s) ignorada(s) por dado incompleto', {
                n: r.rejected,
            }),
        );
    }
    if (r.clamped > 0) {
        notes.push(
            trp(
                'scenarios.growth.adjusted.clamped',
                '{{n}} fase(s) com taxa fora da faixa — trazida(s) para dentro',
                { n: r.clamped },
            ),
        );
    }
    if (r.anchored) {
        const first = r.phases[0];
        notes.push(
            trp(
                'scenarios.growth.adjusted.anchored',
                'a 1ª fase começava depois do ano-base — ancorada em {{year}}',
                { year: first ? first.fromYear : '' },
            ),
        );
    }
    if (r.unanchored) {
        notes.push(
            tr(
                'scenarios.growth.adjusted.unanchored',
                'sem ano-base: o cronograma por fase foi descartado e vale a taxa única',
            ),
        );
    }
    const label = tr('scenarios.growth.adjusted.label', 'Fases ajustadas');
    return (
        `<p class="scn-adjusted" role="status"><span class="scn-adjusted-badge">${escapeHtml(label)}</span> ` +
        `${escapeHtml(notes.join(' · '))}</p>`
    );
}

/** Editor de fases {fromYear, g}: adicionar, editar e remover (CFG-10 na tela). */
function renderGrowthControl(vm: GrowthControlVM): string {
    const fromLabel = tr('scenarios.growth.fromYear', 'A partir de');
    const gLabel = tr('scenarios.growth.rate', 'Crescimento (%/ano)');
    const rows = vm.drafts
        .map((d, i) => {
            const n = String(i + 1);
            return `<li class="scn-phase-row">
            <span class="scn-phase-index" aria-hidden="true">${escapeHtml(n)}</span>
            <label class="scn-field">
                <span class="scn-field-label">${escapeHtml(fromLabel)}</span>
                <input type="number" class="scn-num" data-phase-year="${i}" step="1" value="${d.fromYear ?? ''}"
                       aria-label="${escapeHtml(`${fromLabel} — ${tr('scenarios.growth.phase', 'Fase')} ${n}`)}">
            </label>
            <label class="scn-field">
                <span class="scn-field-label">${escapeHtml(gLabel)}</span>
                <input type="number" class="scn-num" data-phase-g="${i}" step="0.1"
                       min="${gToPercent(vm.minRate)}" max="${gToPercent(vm.maxRate)}"
                       value="${d.g === null ? '' : gToPercent(d.g)}"
                       aria-label="${escapeHtml(`${gLabel} — ${tr('scenarios.growth.phase', 'Fase')} ${n}`)}">
            </label>
            <button type="button" class="scn-phase-remove" data-phase-remove="${i}"
                    aria-label="${escapeHtml(`${tr('scenarios.growth.removePhase', 'Remover fase')} ${n}`)}"
                    title="${escapeHtml(tr('scenarios.growth.removePhase', 'Remover fase'))}">&times;</button>
        </li>`;
        })
        .join('');
    const empty =
        vm.drafts.length === 0
            ? `<p class="scn-hint scn-hint--empty">${escapeHtml(tr('scenarios.growth.emptyHint', 'Sem fases: o driver cresce a uma taxa única (comportamento padrão).'))}</p>`
            : '';
    return `<fieldset class="scn-growth">
        <legend>${escapeHtml(tr('scenarios.growth.title', 'Crescimento do driver por fase'))}</legend>
        <p class="scn-hint">${escapeHtml(tr('scenarios.growth.hint', 'Ex.: 3%/ano até 2030, 1%/ano depois. Cada fase vale do ano indicado até a próxima.'))}</p>
        ${empty}
        <ul class="scn-phase-list">${rows}</ul>
        <button type="button" class="scn-add-phase" data-action="add-phase"
                aria-label="${escapeHtml(tr('scenarios.growth.addPhase', 'Adicionar fase'))}">+ ${escapeHtml(tr('scenarios.growth.addPhase', 'Adicionar fase'))}</button>
        ${renderGrowthAdjusted(vm)}
    </fieldset>`;
}

/**
 * A SÉRIE projetada (§5.2) do cenário ativo contra a Base — é ela que muda ao
 * mexer nos widgets, que é o critério testável do CFG-11. Δ por ano + ΔNPV do
 * horizonte inteiro; "sem dado" honesto quando não há série.
 */
function renderTimelineSeries(s: TimelineSeriesVM): string {
    const title = tr('scenarios.series.title', 'Série projetada (vs. Base)');
    if (!s.available) {
        const why =
            s.unavailableReason === 'incoherent'
                ? tr('scenarios.series.incoherent', 'cenário ativo fisicamente impossível — série não projetada.')
                : tr('scenarios.series.noBase', 'clone o modelo atual para projetar a série.');
        return `<section class="scn-series" aria-label="${escapeHtml(title)}">
            <h4>${escapeHtml(title)}</h4>
            <p class="scn-series-empty" role="status">${escapeHtml(why)}</p>
        </section>`;
    }
    const head =
        `<tr><th scope="col">${escapeHtml(tr('scenarios.series.year', 'Ano'))}</th>` +
        `<th scope="col">${escapeHtml(tr('scenarios.series.activity', 'Driver A(t)'))}</th>` +
        `<th scope="col">${escapeHtml(tr('scenarios.series.capex', 'ΔCAPEX'))}</th>` +
        `<th scope="col">${escapeHtml(tr('scenarios.series.opex', 'ΔOPEX'))}</th>` +
        `<th scope="col">${escapeHtml(tr('scenarios.series.ecbt', 'ΔECBT'))}</th>` +
        `<th scope="col">${escapeHtml(tr('scenarios.series.environmental', 'Δ ambiental'))}</th></tr>`;
    const body = s.rows
        .map(
            (r) =>
                `<tr><th scope="row">${escapeHtml(String(r.year))}</th>` +
                `<td>${escapeHtml(fmtNum(r.activity))}</td>` +
                `<td>${escapeHtml(fmtDeltaNum(r.capexDelta))}</td>` +
                `<td>${escapeHtml(fmtDeltaNum(r.opexDelta))}</td>` +
                `<td>${escapeHtml(fmtDeltaNum(r.ecbtDelta))}</td>` +
                `<td>${escapeHtml(fmtDeltaNum(r.environmentalDelta))}</td></tr>`,
        )
        .join('');
    const npv =
        `<p class="scn-readout">${escapeHtml(tr('scenarios.series.npv', 'Valor presente no horizonte'))}: ` +
        `<strong>${escapeHtml(tr('scenarios.series.capex', 'ΔCAPEX'))} ${escapeHtml(fmtDeltaNum(s.capexNPVDelta))}</strong> · ` +
        `<strong>${escapeHtml(tr('scenarios.series.opex', 'ΔOPEX'))} ${escapeHtml(fmtDeltaNum(s.opexNPVDelta))}</strong></p>`;
    return `<section class="scn-series" aria-label="${escapeHtml(title)}">
        <h4>${escapeHtml(title)}</h4>
        ${npv}
        <div class="scn-series-scroll">
            <table class="scn-table scn-table--series" role="table" aria-label="${escapeHtml(title)}">
                <thead>${head}</thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    </section>`;
}

/** O bloco avançado inteiro (recolhido por default — §2.4 CFG-11 "modo avançado"). */
function renderTimelineControls(): string {
    const summary = tr('scenarios.timeline.title', 'Horizonte e crescimento (avançado)');
    if (!_state.timelineOpen) {
        return `<details class="scn-timeline"><summary>${escapeHtml(summary)}</summary></details>`;
    }
    const baseYear = currentBaseYear();
    const horizonVM = buildHorizonControlVM(_state.timeline, baseYear);
    const growthVM = buildGrowthControlVM(_state.timeline.phases, baseYear);
    const series = buildTimelineSeriesVM(currentBaseProcess(), activeScenario(), _state.timeline, baseYear);
    return `<details class="scn-timeline" open>
        <summary>${escapeHtml(summary)}</summary>
        <div class="scn-timeline-body">
            <p class="scn-hint">${escapeHtml(trp('scenarios.timeline.baseYear', 'Ano-base da série: {{year}}', { year: baseYear }))}</p>
            <div class="scn-timeline-controls">
                ${renderHorizonControl(horizonVM)}
                ${renderGrowthControl(growthVM)}
            </div>
            ${renderTimelineSeries(series)}
        </div>
    </details>`;
}

// ═════════ Incerteza P10–P90 + tornado de sensibilidade (CFG-33/34) ═════════
//
// O motor `_scenarioRobustnessPure` (banda MC + varredura OAT ranqueada) já
// existia e estava PROVADO, mas órfão: nenhum consumidor fora do próprio módulo,
// então o painel só sabia mostrar o veredito como PONTO ÚNICO — exatamente o que
// o CFG-33 existe para superar. Este bloco é a ligação que faltava. Como no
// CFG-11, é só render + eventos: toda a amostragem, o ranking e a geometria das
// barras vêm da VM pura `_scenarioRobustnessPanelVMPure`; nenhum número (nem um
// percentil, nem um pixel de barra) é calculado aqui.

/** Rótulos das 3 alavancas incertas — reusa as chaves dos próprios sliders. */
const RATE_LABEL_KEYS: Record<UncertainRateId, readonly [string, string]> = Object.freeze({
    throughput: ['scenarios.rate.throughput', 'Vazão (t/h)'],
    recoveryRate: ['scenarios.rate.recoveryRate', 'Recuperação'],
    yield: ['scenarios.rate.yield', 'Rendimento'],
});

/** Valor monetário com sinal explícito (ou "sem dado") — leitura do veredito. */
function fmtSigned(v: number | null, unidade: string): string {
    if (v === null || !Number.isFinite(v)) return tr('scenarios.noData', 'sem dado');
    const sign = v > 0 ? '+' : '';
    return `${sign}${fmtNum(v)}${unidade ? ` ${unidade}` : ''}`;
}

/** Taxa (0..1) ou vazão como o usuário a lê nos sliders. */
function fmtParam(id: UncertainRateId, v: number): string {
    return id === 'throughput' ? fmtNum(v) : fmtNum(v, 3);
}

/** Config da rodada (CFG-33: amostras e seed configuráveis, reprodutível por seed). */
function renderRobustnessConfig(vm: ScenarioRobustnessPanelVM): string {
    const itLabel = tr('scenarios.robustness.iterations', 'Amostras');
    const seedLabel = tr('scenarios.robustness.seed', 'Semente');
    const uncLabel = tr('scenarios.robustness.uncertainty', 'Incerteza das taxas (±%)');
    return `<fieldset class="scn-robustness-config">
        <legend>${escapeHtml(tr('scenarios.robustness.configTitle', 'Configuração da simulação'))}</legend>
        <p class="scn-hint">${escapeHtml(tr('scenarios.robustness.configHint', 'Mesma semente reproduz exatamente a mesma faixa.'))}</p>
        <div class="scn-row">
            <label class="scn-field">
                <span class="scn-field-label">${escapeHtml(uncLabel)}</span>
                <input type="number" class="scn-num" data-robustness-uncertainty step="1"
                       min="${MIN_UNCERTAINTY_PCT}" max="${MAX_UNCERTAINTY_PCT}"
                       value="${Math.round(vm.uncertaintyFraction * 1000) / 10}"
                       aria-label="${escapeHtml(uncLabel)}">
            </label>
            <label class="scn-field">
                <span class="scn-field-label">${escapeHtml(itLabel)}</span>
                <input type="number" class="scn-num" data-robustness-iterations step="50"
                       min="50" max="100000" value="${vm.iterations}"
                       aria-label="${escapeHtml(itLabel)}">
            </label>
            <label class="scn-field">
                <span class="scn-field-label">${escapeHtml(seedLabel)}</span>
                <input type="number" class="scn-num" data-robustness-seed step="1" value="${vm.seed}"
                       aria-label="${escapeHtml(seedLabel)}">
            </label>
        </div>
    </fieldset>`;
}

/**
 * A BANDA P10–P50–P90 (CFG-33): o veredito deixa de ser um ponto e passa a ser
 * uma faixa. O ponto central continua visível e é o MESMO número do veredito
 * consolidado — a banda o cerca, não o substitui.
 */
function renderRobustnessBand(vm: ScenarioRobustnessPanelVM): string {
    const title = tr('scenarios.robustness.bandTitle', 'Faixa do veredito (P10–P90)');
    const band = vm.band;
    if (!band) return '';
    const row = (labelKey: string, labelFb: string, v: number, cls: string): string =>
        `<div class="scn-band-item ${cls}">
            <span class="scn-band-label">${escapeHtml(tr(labelKey, labelFb))}</span>
            <strong class="scn-band-value">${escapeHtml(fmtSigned(v, vm.unidade))}</strong>
        </div>`;
    // Honestidade sobre o tamanho REAL da amostra: quantas das pedidas sobreviveram.
    const provenance = trp(
        'scenarios.robustness.samples',
        '{{valid}} de {{total}} amostras válidas ({{discarded}} descartadas por serem fisicamente impossíveis) · semente {{seed}}',
        { valid: fmtNum(band.validSamples), total: fmtNum(vm.iterations), discarded: fmtNum(band.discarded), seed: vm.seed },
    );
    return `<section class="scn-band" aria-label="${escapeHtml(title)}">
        <h4>${escapeHtml(title)}</h4>
        <div class="scn-band-grid">
            ${row('scenarios.robustness.p10', 'P10 (pessimista)', band.p10, 'scn-band-item--p10')}
            ${row('scenarios.robustness.p50', 'P50 (mediana)', band.p50, 'scn-band-item--p50')}
            ${row('scenarios.robustness.p90', 'P90 (otimista)', band.p90, 'scn-band-item--p90')}
        </div>
        <p class="scn-readout">${escapeHtml(tr('scenarios.robustness.spread', 'Largura da faixa'))}:
            <strong>${escapeHtml(fmtNum(band.spread))} ${escapeHtml(vm.unidade)}</strong>
            <span class="scn-unit">${escapeHtml(trp('scenarios.robustness.centre', 'centro determinístico {{v}}', { v: fmtSigned(vm.base, vm.unidade) }))}</span>
        </p>
        <p class="scn-provenance">${escapeHtml(provenance)}</p>
    </section>`;
}

/** Uma barra do tornado: rótulo + faixa do efeito + amplitude legível. */
function renderTornadoBar(bar: TornadoBarVM, unidade: string): string {
    const [key, fb] = RATE_LABEL_KEYS[bar.id];
    const label = tr(key, fb);
    if (!bar.available) {
        // "sem dado" mudo esconderia a informação mais útil: a varredura cruzou o
        // limite físico yield ≤ recuperação. Dizer QUAL extremo caiu transforma um
        // vazio confuso num achado ("as taxas têm pouca folga entre si").
        const which =
            bar.unavailableSide === 'low'
                ? trp('scenarios.robustness.sideLow', 'extremo inferior ({{v}}) fisicamente impossível', {
                      v: fmtParam(bar.id, bar.paramLow),
                  })
                : bar.unavailableSide === 'high'
                  ? trp('scenarios.robustness.sideHigh', 'extremo superior ({{v}}) fisicamente impossível', {
                        v: fmtParam(bar.id, bar.paramHigh),
                    })
                  : tr('scenarios.robustness.sideBoth', 'os dois extremos são fisicamente impossíveis');
        const why = `${which} — ${tr('scenarios.robustness.sideWhy', 'o rendimento não pode superar a recuperação (CFG-40)')}`;
        return `<li class="scn-tornado-row scn-tornado-row--nodata">
            <span class="scn-tornado-label">${escapeHtml(label)}</span>
            <span class="scn-tornado-track"><span class="scn-tornado-nodata" title="${escapeHtml(why)}">${escapeHtml(which)}</span></span>
            <span class="scn-tornado-amp">${escapeHtml(tr('scenarios.noData', 'sem dado'))}</span>
        </li>`;
    }
    const range = `${fmtParam(bar.id, bar.paramLow)} → ${fmtParam(bar.id, bar.paramHigh)}`;
    const aria = `${label}: ${range} · ${tr('scenarios.robustness.amplitude', 'amplitude')} ${fmtNum(bar.amplitude ?? 0)} ${unidade}`;
    return `<li class="scn-tornado-row">
        <span class="scn-tornado-label" title="${escapeHtml(range)}">${escapeHtml(label)}</span>
        <span class="scn-tornado-track" role="img" aria-label="${escapeHtml(aria)}">
            <span class="scn-tornado-bar" style="left:${bar.leftPct.toFixed(2)}%;width:${bar.widthPct.toFixed(2)}%"></span>
        </span>
        <span class="scn-tornado-amp">${escapeHtml(fmtNum(bar.amplitude ?? 0))}</span>
    </li>`;
}

/**
 * O TORNADO (CFG-34): uma barra por alavanca, já ranqueada desc. por amplitude
 * pelo motor. Todas as barras dividem a MESMA régua, então o comprimento é
 * comparável — é isso que responde "qual alavanca pesa mais".
 */
function renderTornado(vm: ScenarioRobustnessPanelVM): string {
    const title = tr('scenarios.robustness.tornadoTitle', 'Sensibilidade por alavanca (tornado)');
    if (vm.bars.length === 0) return '';
    const rows = vm.bars.map((b) => renderTornadoBar(b, vm.unidade)).join('');
    return `<section class="scn-tornado" aria-label="${escapeHtml(title)}">
        <h4>${escapeHtml(title)}</h4>
        <p class="scn-hint">${escapeHtml(tr('scenarios.robustness.tornadoHint', 'Cada alavanca varia sozinha na sua faixa de incerteza, com as demais no centro. Barra mais longa = alavanca que mais move o veredito.'))}</p>
        <ul class="scn-tornado-list" style="--scn-tornado-base:${vm.basePct.toFixed(2)}%">${rows}</ul>
        <p class="scn-tornado-legend">
            <span class="scn-tornado-legend-tick" aria-hidden="true"></span>
            ${escapeHtml(trp('scenarios.robustness.baseline', 'linha = veredito central ({{v}})', { v: fmtSigned(vm.base, vm.unidade) }))}
            · <span class="scn-unit">${escapeHtml(trp('scenarios.robustness.amplitudeUnit', 'amplitude em {{u}}', { u: vm.unidade || '—' }))}</span>
        </p>
    </section>`;
}

/** O bloco avançado inteiro de robustez (recolhido por default — CFG-33). */
function renderRobustnessControls(): string {
    const summary = tr('scenarios.robustness.title', 'Incerteza e sensibilidade (avançado)');
    if (!_state.robustnessOpen) {
        return `<details class="scn-robustness"><summary>${escapeHtml(summary)}</summary></details>`;
    }
    const vm = buildScenarioRobustnessVM(currentBaseProcess(), activeScenario(), _state.robustness);
    let body: string;
    if (!vm.available) {
        // Nunca uma faixa vazia disfarçada: a tela diz POR QUE não há faixa.
        const why =
            vm.unavailableReason === 'incoherent'
                ? tr('scenarios.robustness.incoherent', 'cenário ativo fisicamente impossível — faixa não simulada.')
                : vm.unavailableReason === 'insufficient-samples'
                  ? tr(
                        'scenarios.robustness.insufficient',
                        'a maioria das amostras caiu fora do domínio físico — faixa não calculada (aumente as amostras ou reduza a incerteza).',
                    )
                  : tr('scenarios.robustness.noBase', 'clone o modelo atual para simular a faixa.');
        body = `<p class="scn-series-empty" role="status">${escapeHtml(why)}</p>
            ${renderRobustnessConfig(vm)}`;
    } else {
        body = `${renderRobustnessConfig(vm)}${renderRobustnessBand(vm)}${renderTornado(vm)}`;
    }
    return `<details class="scn-robustness" open>
        <summary>${escapeHtml(summary)}</summary>
        <div class="scn-robustness-body">
            <p class="scn-hint">${escapeHtml(tr('scenarios.robustness.hint', 'As 3 taxas do cenário ativo passam a ser incertas: o veredito vira uma FAIXA, e o tornado mostra qual delas pesa mais.'))}</p>
            ${body}
        </div>
    </details>`;
}

/** Lê um input numérico: vazio/ilegível vira `null` (N3 — nunca 0 forjado). */
function readNumberInput(input: HTMLInputElement): number | null {
    const raw = input.value.trim();
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

/** Liga os widgets de horizonte/crescimento → estado + re-render só deste bloco. */
function _wireTimelineControls(overlay: HTMLElement): void {
    const rerender = (): void => _renderTimeline(overlay);
    const details = overlay.querySelector<HTMLDetailsElement>('.scn-timeline');
    details?.addEventListener('toggle', () => {
        // Recolhido = série nem calculada (o motor roda 1× por ano do horizonte).
        if (_state.timelineOpen === details.open) return;
        _state.timelineOpen = details.open;
        rerender();
    });

    const mode = overlay.querySelector<HTMLSelectElement>('[data-horizon-mode]');
    mode?.addEventListener('change', () => {
        const next = mode.value === 'duration' ? 'duration' : 'year';
        // Ao trocar de forma, semeia a outra com o horizonte VIGENTE (N8: sem
        // folha em branco, e sem trocar o horizonte só por mudar de unidade).
        const vm = buildHorizonControlVM(_state.timeline, currentBaseYear());
        _state.timeline =
            next === 'duration'
                ? { ..._state.timeline, horizonMode: next, horizonYears: vm.resolved.horizonYears }
                : { ..._state.timeline, horizonMode: next, horizonYear: vm.resolved.horizonYear };
        rerender();
    });

    const yearInput = overlay.querySelector<HTMLInputElement>('[data-horizon-year]');
    yearInput?.addEventListener('change', () => {
        _state.timeline = { ..._state.timeline, horizonYear: readNumberInput(yearInput) };
        rerender();
    });
    const yearsInput = overlay.querySelector<HTMLInputElement>('[data-horizon-years]');
    yearsInput?.addEventListener('change', () => {
        _state.timeline = { ..._state.timeline, horizonYears: readNumberInput(yearsInput) };
        rerender();
    });

    overlay.querySelectorAll<HTMLButtonElement>('[data-milestone]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const year = Number(btn.getAttribute('data-milestone'));
            if (!Number.isFinite(year)) return;
            _state.timeline = { ..._state.timeline, horizonMode: 'year', horizonYear: year };
            rerender();
        });
    });

    overlay.querySelector<HTMLButtonElement>('[data-action="add-phase"]')?.addEventListener('click', () => {
        const baseYear = currentBaseYear();
        const vm = buildHorizonControlVM(_state.timeline, baseYear);
        _state.timeline = {
            ..._state.timeline,
            phases: addGrowthPhase(_state.timeline.phases, {
                baseYear,
                maxYear: vm.resolved.horizonYear ?? undefined,
            }),
        };
        rerender();
    });
    overlay.querySelectorAll<HTMLButtonElement>('[data-phase-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const i = Number(btn.getAttribute('data-phase-remove'));
            _state.timeline = { ..._state.timeline, phases: removeGrowthPhase(_state.timeline.phases, i) };
            rerender();
        });
    });
    overlay.querySelectorAll<HTMLInputElement>('[data-phase-year]').forEach((input) => {
        input.addEventListener('change', () => {
            const i = Number(input.getAttribute('data-phase-year'));
            _state.timeline = {
                ..._state.timeline,
                phases: updateGrowthPhase(_state.timeline.phases, i, { fromYear: readNumberInput(input) }),
            };
            rerender();
        });
    });
    overlay.querySelectorAll<HTMLInputElement>('[data-phase-g]').forEach((input) => {
        input.addEventListener('change', () => {
            const i = Number(input.getAttribute('data-phase-g'));
            const pct = readNumberInput(input);
            _state.timeline = {
                ..._state.timeline,
                // %/ano na tela → fração no motor. Vazio continua null (N3).
                phases: updateGrowthPhase(_state.timeline.phases, i, { g: pct === null ? null : pct / 100 }),
            };
            rerender();
        });
    });
}

/** Re-render só do bloco avançado (mantém foco/scroll do resto do painel). */
function _renderTimeline(overlay: HTMLElement): void {
    const area = overlay.querySelector<HTMLElement>('.scn-timeline-area');
    if (!area) return;
    area.innerHTML = renderTimelineControls();
    _wireTimelineControls(overlay);
}

/** Liga os widgets de incerteza/sensibilidade → estado + re-render só deste bloco. */
function _wireRobustnessControls(overlay: HTMLElement): void {
    const rerender = (): void => _renderRobustness(overlay);
    const details = overlay.querySelector<HTMLDetailsElement>('.scn-robustness');
    details?.addEventListener('toggle', () => {
        // Recolhido = Monte Carlo nem roda (o motor avalia 1× por amostra).
        if (_state.robustnessOpen === details.open) return;
        _state.robustnessOpen = details.open;
        rerender();
    });

    const patch = (p: Partial<RobustnessControlsState>): void => {
        _state.robustness = { ..._state.robustness, ...p };
        rerender();
    };
    const unc = overlay.querySelector<HTMLInputElement>('[data-robustness-uncertainty]');
    unc?.addEventListener('change', () => patch({ uncertaintyPct: readNumberInput(unc) }));
    const iters = overlay.querySelector<HTMLInputElement>('[data-robustness-iterations]');
    iters?.addEventListener('change', () => patch({ iterations: readNumberInput(iters) }));
    const seed = overlay.querySelector<HTMLInputElement>('[data-robustness-seed]');
    seed?.addEventListener('change', () => patch({ seed: readNumberInput(seed) }));
}

/** Re-render só do bloco de robustez (mantém foco/scroll do resto do painel). */
function _renderRobustness(overlay: HTMLElement): void {
    const area = overlay.querySelector<HTMLElement>('.scn-robustness-area');
    if (!area) return;
    area.innerHTML = renderRobustnessControls();
    _wireRobustnessControls(overlay);
}

/** Aplica um patch parcial ao cenário ATIVO (imutável — cria nova lista). */
function updateActiveScenario(patch: Partial<ScenarioParamSet>): void {
    const n = _state.scenarios.length;
    if (n === 0) return;
    const current = _state.scenarios[n - 1]!;
    // CFG-39: empurra o estado PRÉ-mutation para o histórico antes de patchear,
    // para que undo restaurE exatamente o ponto anterior. Snapshots são do
    // cenário ATIVO (não da lista inteira) — undo é escopado à coluna corrente.
    _state.history = pushSnapshot(_state.history, current);
    const next: ScenarioParamSet = Object.freeze({ ...current, ...patch });
    _state.scenarios = [..._state.scenarios.slice(0, n - 1), next];
}

/**
 * CFG-39 — desfaz a última mutação do cenário ATIVO: restaura o snapshot
 * anterior do histórico imutável. Devolve `true` se havia algo a desfazer
 * (para o caller decidir re-renderizar); `false` se o stack estava vazio.
 * Não lança — undo em stack vazio é no-op silencioso na UI (botão disabled).
 */
function undoActiveScenario(): boolean {
    const popped = undo(_state.history);
    if (!popped) return false;
    _state.history = popped.history;
    const n = _state.scenarios.length;
    if (n === 0) return false;
    // Substitui o ativo pelo snapshot restaurado (nova lista imutável).
    _state.scenarios = [..._state.scenarios.slice(0, n - 1), popped.snapshot];
    return true;
}

/** Re-render apenas do corpo (mutation controls + comparator). */
function _renderBody(overlay: HTMLElement): void {
    const cloneArea = overlay.querySelector<HTMLElement>('.scn-clone-area');
    const mutateArea = overlay.querySelector<HTMLElement>('.scn-mutate-area');
    const comparatorArea = overlay.querySelector<HTMLElement>('.scn-comparator-area');
    if (cloneArea) {
        const cloned = !!_state.base;
        cloneArea.innerHTML = `<button type="button" class="scn-clone-btn" data-action="clone"
            aria-label="${escapeHtml(tr('scenarios.createButton', 'Clonar modelo atual'))}">${escapeHtml(cloned ? tr('scenarios.recloneButton', 'Reclonar modelo atual') : tr('scenarios.createButton', 'Clonar modelo atual'))}</button>`;
        const btn = cloneArea.querySelector<HTMLButtonElement>('[data-action="clone"]');
        btn?.addEventListener('click', () => {
            // CFG-01..04: tenta o DADO REAL primeiro; cai no exemplo (rotulado) só
            // quando o modelo não tem Área Produtiva com custos reais.
            const realProcess = resolveRealBaseProcess();
            _state.realProcess = realProcess;
            _state.dataSource = realProcess ? 'real' : 'example';
            _state.base = buildStubScenario('base-default');
            // 1º cenário = "= Base" (o usuário muta a partir daí).
            _state.scenarios = [baseSliderParams()];
            // CFG-39: nova sessão base = histórico zerado (não há nada a desfazer).
            _state.history = emptyHistory();
            // CFG-11: o horizonte reancora no ano-base do processo recém-clonado,
            // para o bloco avançado nunca abrir acusando um ajuste que o usuário
            // não pediu (só o ano-base mudou).
            _state.timeline = initialTimelineState(currentBaseYear());
            _renderBody(overlay);
        });
    }
    if (mutateArea) {
        mutateArea.innerHTML = renderMutationControls();
        _wireMutationInputs(overlay);
    }
    // CFG-11: a série depende do cenário ativo, então re-renderiza junto com os
    // sliders (mexer no rendimento tem de mover a série, não só a tabela).
    _renderTimeline(overlay);
    // CFG-33/34: a faixa e o tornado também são do cenário ativo — mexer num
    // slider tem de mover a banda, não só a tabela.
    _renderRobustness(overlay);
    if (comparatorArea) {
        comparatorArea.innerHTML = renderComparator();
        _wireComparatorActions(overlay);
    }
}

/** Liga os listeners dos controles de mutação → atualiza o cenário ativo + re-render. */
function _wireMutationInputs(overlay: HTMLElement): void {
    const subtype = overlay.querySelector<HTMLSelectElement>('[data-subtype]');
    subtype?.addEventListener('change', () => {
        updateActiveScenario({ subtype: subtype.value as 'mining' | 'petroleum' });
        _renderBody(overlay);
    });
    overlay.querySelectorAll<HTMLInputElement>('[data-rate]').forEach((input) => {
        const rate = input.getAttribute('data-rate');
        input.addEventListener('input', () => {
            const out = overlay.querySelector<HTMLOutputElement>(`[data-rate-out="${rate}"]`);
            if (out) out.textContent = input.value;
        });
        input.addEventListener('change', () => {
            if (!rate) return;
            updateActiveScenario({ [rate]: Number(input.value) } as Partial<ScenarioParamSet>);
            _renderBody(overlay);
        });
    });
    // CFG-39: undo da última mutação do cenário ativo.
    const undoBtn = overlay.querySelector<HTMLButtonElement>('[data-action="undo"]');
    undoBtn?.addEventListener('click', () => {
        if (undoActiveScenario()) _renderBody(overlay);
    });
}

/** Liga os listeners das ações do comparador (adicionar/remover cenário, exportar). */
function _wireComparatorActions(overlay: HTMLElement): void {
    const addBtn = overlay.querySelector<HTMLButtonElement>('[data-action="add-scenario"]');
    addBtn?.addEventListener('click', () => {
        if (!_state.base) return;
        // Novo cenário editável parte do cenário ativo atual (ou da Base).
        const seed = activeScenario() ?? baseSliderParams();
        _state.scenarios = [..._state.scenarios, Object.freeze({ ...seed })];
        // CFG-39: novo cenário ativo = histórico zerado (undo é escopado à coluna).
        _state.history = emptyHistory();
        _renderBody(overlay);
    });
    overlay.querySelectorAll<HTMLButtonElement>('[data-remove-scenario]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const colIndex = Number(btn.getAttribute('data-remove-scenario'));
            // colIndex é o índice na VM (0 = Base; 1..N = cenários) → índice na lista = colIndex-1.
            const listIdx = colIndex - 1;
            if (listIdx < 0 || listIdx >= _state.scenarios.length) return;
            // Nunca remove o último cenário restante (mantém ao menos 1 editável).
            if (_state.scenarios.length <= 1) return;
            _state.scenarios = _state.scenarios.filter((_, i) => i !== listIdx);
            // CFG-39: remoção muda quem é o ativo — zera o histórico de undo.
            _state.history = emptyHistory();
            _renderBody(overlay);
        });
    });
    overlay.querySelector<HTMLButtonElement>('[data-action="export-csv"]')?.addEventListener('click', () => {
        if (!_lastPanelVm) return;
        const { headers, rows } = buildScenarioComparatorExportRows(_lastPanelVm.vm);
        const csv = toCsv([...headers], rows);
        downloadCsv(csv, buildScenarioExportFilename('csv', Date.now()));
    });
    overlay.querySelector<HTMLButtonElement>('[data-action="export-json"]')?.addEventListener('click', () => {
        if (!_lastPanelVm) return;
        const json = buildScenarioComparatorExportJson(_lastPanelVm.vm, _state.dataSource, Date.now());
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = buildScenarioExportFilename('json', Date.now());
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
    // XLSX/MD (S4/CFG-38) delegam ao runtime de export: é lá que ficam o guard do
    // vendor SheetJS e os toasts de sucesso/erro.
    overlay.querySelector<HTMLButtonElement>('[data-action="export-xlsx"]')?.addEventListener('click', () => {
        if (!_lastPanelVm) return;
        // async: o SheetJS é carregado sob demanda. O runtime já trata os erros
        // (toast); o catch aqui só evita unhandled rejection.
        void exportScenarioComparatorXlsx(_lastPanelVm.vm, Date.now()).catch((err) => {
            console.debug('[scenarioComparatorPanel:export-xlsx]', (err as Error)?.message || err);
        });
    });
    overlay.querySelector<HTMLButtonElement>('[data-action="export-md"]')?.addEventListener('click', () => {
        if (!_lastPanelVm) return;
        exportScenarioComparatorMarkdown(_lastPanelVm.vm, _state.dataSource, Date.now());
    });
}

export function openScenarioComparatorPanel(): void {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
        overlay.classList.remove('scn-hidden');
        _renderBody(overlay);
        return;
    }
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'ecbt-overlay scn-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', tr('scenarios.title', 'Cenários — Comparador de Impacto'));
    overlay.innerHTML = `
<div class="ecbt-dialog ecbt-dialog--xl scn-dialog" role="document">
    <header class="scn-header">
        <h2>${escapeHtml(tr('scenarios.title', 'Cenários — Comparador de Impacto'))}</h2>
        <span class="scn-subtitle">${escapeHtml(tr('scenarios.subtitle', 'E se eu mudar um processo produtivo? Compare Base, Alternativo e a diferença.'))}</span>
        <button type="button" class="scn-close" aria-label="${escapeHtml(tr('scenarios.close', 'Fechar'))}" data-action="close">&times;</button>
    </header>
    <div class="scn-body">
        <div class="scn-clone-area"></div>
        <div class="scn-mutate-area"></div>
        <div class="scn-timeline-area"></div>
        <div class="scn-robustness-area"></div>
        <div class="scn-comparator-area"></div>
    </div>
</div>`;
    document.body.appendChild(overlay);
    _renderBody(overlay);
    const closeBtn = overlay.querySelector<HTMLButtonElement>('[data-action="close"]');
    closeBtn?.addEventListener('click', closeScenarioComparatorPanel);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeScenarioComparatorPanel();
    });
    // Padrão da casa (WCAG 2.1 AA): Escape-to-close + focus trap + return-focus
    // ao trigger — mesmo helper dos demais overlays .ecbt-overlay.
    _a11yCleanup = attachModalA11y(overlay, closeScenarioComparatorPanel, {
        initialFocus: closeBtn ?? null,
    });
}

export function closeScenarioComparatorPanel(): void {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.remove();
    if (_a11yCleanup) {
        try {
            _a11yCleanup();
        } catch (err) {
            console.debug('[scenarioComparatorPanel:a11yCleanup]', (err as Error)?.message || err);
        }
        _a11yCleanup = null;
    }
}

// Window handlers (UI Visibility Rule: panel reachable via clickable trigger).
if (typeof window !== 'undefined') {
    window.handleOpenScenarioComparatorPanel = openScenarioComparatorPanel;
    window.handleCloseScenarioComparatorPanel = closeScenarioComparatorPanel;
}
