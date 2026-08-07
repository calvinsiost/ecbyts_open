// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Painel MRV formal (Monitoramento → Reporte → Verificação) — DOM wire.
 * micro_activity:ECBYTS-ENERGY-SCENARIOS-001#7.
 *
 * LENTE sobre os cenários GHG existentes: coleta os MESMOS emission_sources
 * + observations que o ghgInventoryPanel (reuso do trilho nativo, motor
 * nenhum) e delega toda a lógica a core/reports/_mrvChainPure.ts, que
 * reconstrói a cadeia auditável dado bruto → cálculo → indicador → trilha
 * de auditoria com status por elo (monitorado/reportado/verificado).
 * Feature flag: CONFIG.FEATURES.MRV_VIEW.
 *
 * Exposed handler: window.handleOpenMrvPanel()
 */

import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { attachModalA11y } from './modalA11y.js';
import {
    buildMrvChainVM,
    type MrvChainVM,
    type MrvChainRow,
} from '../../core/reports/_mrvChainPure.js';
import type { GhgInventoryElement, GhgInventoryObservation } from '../../core/reports/ghgInventory.js';
import { getAllElements } from '../../core/elements/manager.js';

declare global {
    interface Window {
        handleOpenMrvPanel?: () => void;
        handleCloseMrvPanel?: () => void;
    }
}

const OVERLAY_ID = 'mrv-panel-overlay';
let _a11yCleanup: (() => void) | null = null;

/** i18n com fallback pt embutido (padrão do scenarioComparatorPanel). */
function tr(key: string, fallback: string): string {
    try {
        const out = t(key);
        return out && out !== key ? out : fallback;
    } catch {
        return fallback;
    }
}

interface ElementShape {
    readonly id?: string;
    readonly family?: string;
    readonly name?: string;
    readonly data?: { readonly observations?: ReadonlyArray<Record<string, unknown>>; readonly [k: string]: unknown };
    readonly [key: string]: unknown;
}

/**
 * Mesma coleta do trilho GHG (ghgInventoryPanel._collectEmissionSources +
 * _collectObservations): emission_sources + observations embarcadas.
 */
function collectGhgInputs(): {
    elements: GhgInventoryElement[];
    observations: GhgInventoryObservation[];
} {
    const all = (getAllElements() || []) as readonly ElementShape[];
    const sources = all.filter((e) => e?.family === 'emission_source');
    const elements = sources.map(
        (e) =>
            ({
                id: String(e.id ?? ''),
                family: 'emission_source',
                name: String(e.name ?? e.id ?? ''),
                data: (e.data ?? {}) as GhgInventoryElement['data'],
            }) as GhgInventoryElement,
    );
    const observations: GhgInventoryObservation[] = [];
    for (const el of sources) {
        for (const obs of el?.data?.observations ?? []) {
            observations.push({ ...(obs as unknown as GhgInventoryObservation), elementId: String(el.id ?? '') });
        }
    }
    return { elements, observations };
}

const SCOPE_LABEL: Record<string, string> = {
    '1': 'Escopo 1',
    '2-loc': 'Escopo 2 (loc)',
    '2-mb': 'Escopo 2 (mb)',
    '3': 'Escopo 3',
};

function fmtNum(v: number | null): string {
    if (v === null || !Number.isFinite(v)) return tr('scenarios.noData', 'sem dado');
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v);
}

/** Badge de status de um elo (ok/pendente) — não-só-cor (glyph textual). */
function linkBadge(status: 'ok' | 'pendente', label: string): string {
    const cls = status === 'ok' ? 'mrv-link--ok' : 'mrv-link--pending';
    const glyph = status === 'ok' ? '&#10003;' : '&#9675;'; // ✓ / ○
    const statusTxt = status === 'ok' ? tr('mrv.ok', 'ok') : tr('mrv.pending', 'pendente');
    return (
        `<span class="mrv-link ${cls}" aria-label="${escapeHtml(`${label}: ${statusTxt}`)}" title="${escapeHtml(`${label}: ${statusTxt}`)}">` +
        `<span aria-hidden="true">${glyph}</span> ${escapeHtml(label)}</span>`
    );
}

function renderRow(row: MrvChainRow): string {
    const scope = row.scope ? (SCOPE_LABEL[row.scope] ?? row.scope) : tr('scenarios.noData', 'sem dado');
    const raw = `${row.obsCount} ${tr('mrv.rawObs', 'obs.')} (${row.gases.join(', ') || '—'})`;
    const calc = `${row.withEmissionFactor}× ${tr('mrv.factor', 'fator')} · ${row.withGwp}× GWP`;
    const audit = row.lastAudit
        ? `${row.lastAudit.who ?? tr('scenarios.noData', 'sem dado')} · ${row.lastAudit.when} · ${row.lastAudit.source ?? '—'}`
        : tr('scenarios.noData', 'sem dado');
    const stageCls = `mrv-stage--${row.stage}`;
    const stageTxt =
        row.stage === 'verificado'
            ? tr('mrv.stage.verified', 'Verificado')
            : row.stage === 'reportado'
              ? tr('mrv.stage.reported', 'Reportado')
              : row.stage === 'monitorado'
                ? tr('mrv.stage.monitored', 'Monitorado')
                : tr('mrv.stage.pending', 'Pendente');
    const chain =
        linkBadge(row.links.monitorado, tr('mrv.monitored', 'monitorado')) +
        ' &rarr; ' +
        linkBadge(row.links.reportado, tr('mrv.reported', 'reportado')) +
        ' &rarr; ' +
        linkBadge(row.links.verificado, tr('mrv.verified', 'verificado'));
    return `<tr>
        <th scope="row">${escapeHtml(row.name)}<br><small class="mrv-scope">${escapeHtml(scope)}${row.category ? ` · ${escapeHtml(row.category)}` : ''}</small></th>
        <td>${escapeHtml(raw)}</td>
        <td>${escapeHtml(calc)}</td>
        <td>${fmtNum(row.tco2e)} <span class="mrv-unit">tCO2e</span></td>
        <td class="mrv-audit">${escapeHtml(audit)}<br><small>${escapeHtml(`${row.verifiedCount}/${row.obsCount} ${tr('mrv.verifiedObs', 'obs. verificadas')}`)}</small></td>
        <td><span class="mrv-stage ${stageCls}">${escapeHtml(stageTxt)}</span><div class="mrv-chain">${chain}</div></td>
    </tr>`;
}

function renderSummary(vm: MrvChainVM): string {
    const s = vm.summary;
    const parts = [
        `${s.totalSources} ${tr('mrv.sources', 'fontes')}`,
        `${s.monitorado} ${tr('mrv.monitored', 'monitorado')}`,
        `${s.reportado} ${tr('mrv.reported', 'reportado')}`,
        `${s.verificado} ${tr('mrv.verified', 'verificado')}`,
        `${tr('mrv.total', 'total')}: ${fmtNum(s.totalTCO2e)} tCO2e`,
    ];
    return `<p class="mrv-summary" role="status">${escapeHtml(parts.join(' · '))}</p>`;
}

function renderDataSourceBanner(vm: MrvChainVM): string {
    if (vm.dataSource === 'real') {
        return `<div class="scn-source scn-source--real" role="status">${escapeHtml(tr('mrv.realData', 'Dados reais do modelo (fontes de emissão + observações)'))}</div>`;
    }
    return (
        `<div class="scn-source scn-source--example" role="alert">` +
        `<strong>${escapeHtml(tr('mrv.exampleData', 'Usando dados de exemplo (cenário ilustrativo de biomassa/GHG)'))}</strong> ` +
        `${escapeHtml(tr('mrv.exampleHint', 'adicione fontes de emissão (family: emission_source) com observações para a cadeia MRV real.'))}</div>`
    );
}

function renderBody(vm: MrvChainVM): string {
    const head = `<tr>
        <th scope="col">${escapeHtml(tr('mrv.col.source', 'Fonte de emissão'))}</th>
        <th scope="col">${escapeHtml(tr('mrv.col.raw', 'Dado bruto'))}</th>
        <th scope="col">${escapeHtml(tr('mrv.col.calc', 'Cálculo'))}</th>
        <th scope="col">${escapeHtml(tr('mrv.col.indicator', 'Indicador'))}</th>
        <th scope="col">${escapeHtml(tr('mrv.col.audit', 'Trilha de auditoria'))}</th>
        <th scope="col">${escapeHtml(tr('mrv.col.status', 'Status MRV'))}</th>
    </tr>`;
    const rows = vm.rows.map(renderRow).join('');
    return `
        ${renderDataSourceBanner(vm)}
        ${renderSummary(vm)}
        <div class="mrv-table-scroll" style="overflow-x:auto;">
            <table class="ecbt-table mrv-table" aria-label="${escapeHtml(tr('mrv.tableAria', 'Cadeia MRV por fonte de emissão'))}">
                <thead>${head}</thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p class="mrv-footnote">${escapeHtml(
            tr(
                'mrv.footnote',
                'MRV formal: cálculos automatizados a partir dos dados brutos dos processos modelados em cada cenário do gêmeo — cada indicador de emissão (Escopos 1/2/3, GHG Protocol) é rastreável até a observação de origem, com trilha de quem registrou, quando e a partir de qual fonte.',
            ),
        )}</p>`;
}

export function closeMrvPanel(): void {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
    if (_a11yCleanup) {
        _a11yCleanup();
        _a11yCleanup = null;
    }
}

export function openMrvPanel(): void {
    closeMrvPanel();
    const { elements, observations } = collectGhgInputs();
    const vm = buildMrvChainVM(elements, observations);
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'ecbt-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mrv-panel-title');
    const title = tr('mrv.title', 'MRV — Monitoramento, Reporte e Verificação (GHG)');
    overlay.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--2xl mrv-dialog">
            <div class="ecbt-header">
                <h2 class="ecbt-title" id="mrv-panel-title">${escapeHtml(title)}</h2>
                <button type="button" class="ecbt-close" data-action="close" aria-label="${escapeHtml(tr('close', 'Fechar'))}">&#10005;</button>
            </div>
            <div class="ecbt-form mrv-body" style="flex:1;overflow-y:auto;">${renderBody(vm)}</div>
        </div>`;
    overlay.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target === overlay || target.closest('[data-action="close"]')) closeMrvPanel();
    });
    overlay.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeMrvPanel();
    });
    document.body.appendChild(overlay);
    try {
        _a11yCleanup = attachModalA11y(overlay, closeMrvPanel);
    } catch {
        _a11yCleanup = null;
    }
}
