// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CONSENSUS-MATRIX-001 F5 / RF-9 — Tier metrics view model (pure-logic).
//
// Constrói view-model + HTML renderer para "Métricas dos tiers" no painel
// customize. Consome TierAccuracyTable (RF-8) e produz estrutura ready-to-render.
//
// Pure-logic 100%: sem DOM mutation. renderTierMetricsHtml retorna string.

import type { TierAccuracyTable, TierAccuracyStat } from './_tierAccuracyCalculatorPure';

export interface TierMetricsCell {
    readonly tier: string;
    readonly fieldType: string;
    readonly accuracy: number;
    readonly accuracyPct: number; // 0..100 arredondado
    readonly hits: number;
    readonly total: number;
    readonly ciLow: number;
    readonly ciHigh: number;
    readonly colorClass: 'metric-excellent' | 'metric-good' | 'metric-medium' | 'metric-poor' | 'metric-empty';
    readonly hasEnoughSamples: boolean; // true se total >= MIN_SAMPLES
}

export interface TierMetricsRow {
    readonly tier: string;
    readonly cells: ReadonlyArray<TierMetricsCell>;
    readonly avgAccuracy: number; // média ponderada por sampleSize
    readonly totalSamples: number;
}

export interface TierMetricsViewModel {
    readonly fieldTypes: ReadonlyArray<string>;
    readonly rows: ReadonlyArray<TierMetricsRow>;
    readonly grandTotal: number;
    readonly empty: boolean;
    readonly minSamplesThreshold: number;
}

const MIN_SAMPLES = 5;
const EXCELLENT_THRESHOLD = 0.9;
const GOOD_THRESHOLD = 0.75;
const MEDIUM_THRESHOLD = 0.5;

/**
 * Escapa HTML perigoso. Pure (sem DOM).
 */
function escapeHtml(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function classifyAccuracy(stat: TierAccuracyStat | null): TierMetricsCell['colorClass'] {
    if (!stat || stat.total === 0) return 'metric-empty';
    if (stat.total < MIN_SAMPLES) return 'metric-medium'; // amostra insuficiente
    if (stat.accuracy >= EXCELLENT_THRESHOLD) return 'metric-excellent';
    if (stat.accuracy >= GOOD_THRESHOLD) return 'metric-good';
    if (stat.accuracy >= MEDIUM_THRESHOLD) return 'metric-medium';
    return 'metric-poor';
}

function buildCell(tier: string, fieldType: string, stat: TierAccuracyStat | null): TierMetricsCell {
    if (!stat) {
        return Object.freeze({
            tier,
            fieldType,
            accuracy: 0,
            accuracyPct: 0,
            hits: 0,
            total: 0,
            ciLow: 0,
            ciHigh: 0,
            colorClass: 'metric-empty' as const,
            hasEnoughSamples: false,
        });
    }
    return Object.freeze({
        tier,
        fieldType,
        accuracy: stat.accuracy,
        accuracyPct: Math.round(stat.accuracy * 100),
        hits: stat.hits,
        total: stat.total,
        ciLow: stat.confidenceInterval.low,
        ciHigh: stat.confidenceInterval.high,
        colorClass: classifyAccuracy(stat),
        hasEnoughSamples: stat.total >= MIN_SAMPLES,
    });
}

/**
 * Constrói view-model a partir do TierAccuracyTable.
 * Defensive: table inválida → empty=true.
 */
export function buildTierMetricsViewModel(table: unknown): TierMetricsViewModel {
    const emptyVm: TierMetricsViewModel = Object.freeze({
        fieldTypes: Object.freeze([]),
        rows: Object.freeze([]),
        grandTotal: 0,
        empty: true,
        minSamplesThreshold: MIN_SAMPLES,
    });
    if (!table || typeof table !== 'object') return emptyVm;
    const t = table as TierAccuracyTable;
    if (!Array.isArray(t.distinctTiers) || !Array.isArray(t.distinctFieldTypes)) return emptyVm;
    if (t.distinctTiers.length === 0) return emptyVm;

    const fieldTypes = [...t.distinctFieldTypes];
    const rows: TierMetricsRow[] = [];
    let grandTotal = 0;

    for (const tier of t.distinctTiers) {
        const cells: TierMetricsCell[] = [];
        let weighted = 0;
        let totalSamples = 0;

        for (const ft of fieldTypes) {
            const stat = t.byTier?.[tier]?.[ft] || null;
            const cell = buildCell(tier, ft, stat);
            cells.push(cell);
            if (cell.total > 0) {
                weighted += cell.accuracy * cell.total;
                totalSamples += cell.total;
            }
        }

        grandTotal += totalSamples;
        rows.push(
            Object.freeze({
                tier,
                cells: Object.freeze(cells),
                avgAccuracy: totalSamples > 0 ? weighted / totalSamples : 0,
                totalSamples,
            }),
        );
    }

    return Object.freeze({
        fieldTypes: Object.freeze(fieldTypes),
        rows: Object.freeze(rows),
        grandTotal,
        empty: grandTotal === 0,
        minSamplesThreshold: MIN_SAMPLES,
    });
}

/**
 * Renderiza HTML pronto pra innerHTML do painel customize.
 * Tabela compacta + tooltips com CI + legend.
 */
export function renderTierMetricsHtml(vm: unknown): string {
    if (!vm || typeof vm !== 'object') return '';
    const v = vm as TierMetricsViewModel;
    if (v.empty || v.rows.length === 0) {
        return `
            <div class="tier-metrics-empty" role="status">
                <p style="font-size:11px;color:var(--neutral-600);font-style:italic;padding:12px;">
                    Sem correções humanas registradas ainda. Aceite ou corrija sugestões
                    no modal "Revisão final" para alimentar este painel.
                </p>
            </div>
        `;
    }

    const headerCells = v.fieldTypes
        .map((ft) => `<th class="tier-metrics-fth">${escapeHtml(ft)}</th>`)
        .join('');

    const bodyRows = v.rows
        .map((row) => {
            const cells = row.cells
                .map((c) => {
                    if (c.total === 0) {
                        return `<td class="tier-metrics-cell ${c.colorClass}" title="Sem amostras"><span style="opacity:0.4;">—</span></td>`;
                    }
                    const tooltip = `${c.accuracyPct}% (${c.hits}/${c.total}) · CI95%: ${Math.round(c.ciLow * 100)}–${Math.round(c.ciHigh * 100)}%${c.hasEnoughSamples ? '' : ' · amostra insuficiente'}`;
                    return `<td class="tier-metrics-cell ${c.colorClass}" title="${escapeHtml(tooltip)}">${c.accuracyPct}%<br><span class="tier-metrics-n">n=${c.total}</span></td>`;
                })
                .join('');
            const avgPct = Math.round(row.avgAccuracy * 100);
            return `
                <tr>
                    <th class="tier-metrics-tier" scope="row">${escapeHtml(row.tier)}</th>
                    ${cells}
                    <td class="tier-metrics-avg" title="Média ponderada por amostra">${avgPct}%<br><span class="tier-metrics-n">N=${row.totalSamples}</span></td>
                </tr>
            `;
        })
        .join('');

    const legend = `
        <div class="tier-metrics-legend" style="display:flex;gap:8px;font-size:9px;color:var(--neutral-700);margin-top:6px;flex-wrap:wrap;">
            <span class="metric-excellent">&#9632; ≥90%</span>
            <span class="metric-good">&#9632; 75-89%</span>
            <span class="metric-medium">&#9632; 50-74%</span>
            <span class="metric-poor">&#9632; &lt;50%</span>
            <span class="metric-empty">&#9633; sem amostra</span>
        </div>
    `;

    return `
        <div class="tier-metrics-table-wrapper" role="region" aria-label="Métricas de acurácia por tier">
            <table class="tier-metrics-table" style="border-collapse:collapse;width:100%;font-size:10px;">
                <thead>
                    <tr>
                        <th class="tier-metrics-tier-head">Tier</th>
                        ${headerCells}
                        <th class="tier-metrics-avg-head">Média</th>
                    </tr>
                </thead>
                <tbody>
                    ${bodyRows}
                </tbody>
            </table>
            <p style="font-size:9px;color:var(--neutral-500);margin:6px 0 0;">
                Total de correções registradas: ${v.grandTotal} · Amostra mínima para confiança: ${v.minSamplesThreshold}
            </p>
            ${legend}
        </div>
    `;
}

export const TIER_METRICS_VIEW_MODEL_META = Object.freeze({
    moduleId: 'consensus-matrix.tier-metrics-view-model',
    version: 1,
    minSamples: MIN_SAMPLES,
    thresholds: Object.freeze({
        excellent: EXCELLENT_THRESHOLD,
        good: GOOD_THRESHOLD,
        medium: MEDIUM_THRESHOLD,
    }),
});
