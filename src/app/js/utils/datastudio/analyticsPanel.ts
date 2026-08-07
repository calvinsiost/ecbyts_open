// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   ANALYTICS PANEL — Observations-based analytics for Data Studio

   Painel simples de analytics sobre observacoes dos elementos carregados.
   Complementa o painel SQL-native (nativeChart.js + pivotTable.js).
   ================================================================ */

/**
 * Computes an aggregation over an array of numeric values.
 * Calcula uma agregacao sobre um array de valores numericos.
 *
 * @param values - Numeric values / Valores numericos
 * @param agg - Aggregation type
 * @returns Result or null if empty / Resultado ou null se vazio
 */
export function computeAggregation(
    values: number[],
    agg: 'mean' | 'median' | 'min' | 'max' | 'count',
): number | null {
    if (!Array.isArray(values) || values.length === 0) return null;
    const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (nums.length === 0) return null;

    if (agg === 'count') return nums.length;
    if (agg === 'min') return Math.min(...nums);
    if (agg === 'max') return Math.max(...nums);

    const sum = nums.reduce((acc, v) => acc + v, 0);
    if (agg === 'mean') return sum / nums.length;

    if (agg === 'median') {
        const sorted = [...nums].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 1) return sorted[mid] as number;
        return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
    }

    return null;
}

/**
 * Collects unique parameter names from all loaded elements.
 * Coleta nomes de parametros unicos de todos os elementos carregados.
 *
 * @param getAllElements - Window function to get all elements
 * @returns Sorted unique parameter names / Nomes de parametros unicos ordenados
 */
function _collectParams(getAllElements: Function | null): string[] {
    if (typeof getAllElements !== 'function') return [];
    const elements = getAllElements();
    if (!Array.isArray(elements)) return [];

    const params = new Set<string>();
    for (const el of elements) {
        for (const obs of el.observations || []) {
            if (obs.parameter && typeof obs.parameter === 'string') {
                params.add(obs.parameter);
            }
        }
    }
    return [...params].sort();
}

/**
 * Builds the Analytics panel element for Data Studio.
 * Constroi o painel de analytics para o Data Studio.
 *
 * @returns Panel element / Elemento do painel
 */
export function buildAnalyticsPanel(): HTMLElement {
    const w: any = typeof window !== 'undefined' ? window : {};
    const getAllElements = typeof w.getAllElements === 'function' ? w.getAllElements : null;

    const params = _collectParams(getAllElements);

    const panel = document.createElement('section');
    panel.className = 'ds-analytics-panel';
    panel.setAttribute('aria-labelledby', 'ds-analytics-obs-title');

    const title = document.createElement('h3');
    title.id = 'ds-analytics-obs-title';
    title.className = 'ds-module-title';
    title.textContent = 'Observations Analytics';
    panel.appendChild(title);

    if (!getAllElements || params.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'ds-analytics-empty';
        empty.textContent = 'Nenhum dado carregado. Carregue um modelo com observacoes para usar este painel.';
        panel.appendChild(empty);
        return panel;
    }

    const controls = document.createElement('div');
    controls.className = 'ds-analytics-controls';

    const paramLabel = document.createElement('label');
    paramLabel.textContent = 'Parametro: ';
    paramLabel.htmlFor = 'ds-analytics-param';
    const paramSelect = document.createElement('select');
    paramSelect.id = 'ds-analytics-param';
    paramSelect.className = 'btn-sm';
    paramSelect.setAttribute('aria-label', 'Selecionar parametro');
    for (const p of params) {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        paramSelect.appendChild(opt);
    }
    paramLabel.appendChild(paramSelect);
    controls.appendChild(paramLabel);

    const aggLabel = document.createElement('label');
    aggLabel.textContent = ' Agregacao: ';
    aggLabel.htmlFor = 'ds-analytics-agg';
    const aggSelect = document.createElement('select');
    aggSelect.id = 'ds-analytics-agg';
    aggSelect.className = 'btn-sm';
    aggSelect.setAttribute('aria-label', 'Selecionar agregacao');
    for (const agg of ['mean', 'median', 'min', 'max', 'count']) {
        const opt = document.createElement('option');
        opt.value = agg;
        opt.textContent = agg;
        aggSelect.appendChild(opt);
    }
    aggLabel.appendChild(aggSelect);
    controls.appendChild(aggLabel);

    const runBtn = document.createElement('button');
    runBtn.className = 'btn-sm ds-module-action-primary';
    runBtn.type = 'button';
    runBtn.textContent = 'Gerar';
    runBtn.setAttribute('aria-label', 'Gerar resultado da agregacao');
    runBtn.setAttribute('onclick', 'window.handleDsAnalyticsRun()');
    controls.appendChild(runBtn);

    panel.appendChild(controls);

    const result = document.createElement('div');
    result.id = 'ds-analytics-result';
    result.className = 'ds-analytics-result';
    result.setAttribute('aria-live', 'polite');
    result.textContent = 'Selecione um parametro e clique em Gerar.';
    panel.appendChild(result);

    return panel;
}
