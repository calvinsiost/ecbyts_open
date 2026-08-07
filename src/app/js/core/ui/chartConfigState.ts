// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Chart Config State - UX-62
 * Pure-logic chart configuration model. Chart.js / DOM agnóstico.
 * Imutável (frozen). Maps clonados em cada mutação.
 */

const VALID_CHART_TYPES = new Set(['line', 'bar', 'scatter', 'mixed']);
const VALID_SERIES_TYPES = new Set(['line', 'bar', 'scatter', 'area']);
const VALID_SCALES = new Set(['linear', 'log', 'time']);
const VALID_POSITIONS = new Set(['left', 'right', 'top', 'bottom']);
const VALID_TOOLTIP_MODES = new Set(['single', 'multi', 'nearest']);

function freezeAxis(axis: any) {
    return Object.freeze({ ...axis });
}

function freezeSeries(series: any) {
    return Object.freeze({ ...series });
}

function cloneSeries(seriesMap: any) {
    const next = new Map();
    for (const [k, v] of seriesMap) next.set(k, freezeSeries(v));
    return next;
}

function cloneAxes(axesMap: any) {
    const next = new Map();
    for (const [k, v] of axesMap) next.set(k, freezeAxis(v));
    return next;
}

function freezeState(state: any) {
    Object.freeze(state);
    return state;
}

function validateAxis(axis: any) {
    if (!axis || typeof axis !== 'object') throw new Error('axis must be an object');
    if (!axis.id || typeof axis.id !== 'string') throw new Error('axis.id required');
    if (!VALID_SCALES.has(axis.scale)) throw new Error(`invalid scale: ${axis.scale}`);
    if (!VALID_POSITIONS.has(axis.position)) throw new Error(`invalid position: ${axis.position}`);
    if (axis.min != null && axis.max != null && axis.min >= axis.max) {
        throw new Error('axis.min must be < axis.max');
    }
}

function validateSeries(series: any, yAxesMap: any) {
    if (!series || typeof series !== 'object') throw new Error('series must be an object');
    if (!series.id || typeof series.id !== 'string') throw new Error('series.id required');
    if (!VALID_SERIES_TYPES.has(series.type)) throw new Error(`invalid series type: ${series.type}`);
    if (!series.yAxisId || !yAxesMap.has(series.yAxisId)) {
        throw new Error(`series.yAxisId not found: ${series.yAxisId}`);
    }
    if (!series.dataKey || typeof series.dataKey !== 'string') {
        throw new Error('series.dataKey required');
    }
}

/**
 * Cria configuração de chart frozen.
 */
export function createChartConfig({
    chartType,
    xAxis,
    yAxes = [],
    series = [],
    options = {},
}: {
    chartType?: string;
    xAxis?: Record<string, any>;
    yAxes?: any[];
    series?: any[];
    options?: Record<string, any>;
} = {}) {
    if (!chartType || !VALID_CHART_TYPES.has(chartType)) {
        throw new Error(`invalid chartType: ${chartType}`);
    }
    if (!xAxis) throw new Error('xAxis required');
    validateAxis(xAxis);

    const yAxesMap = new Map();
    for (const ax of yAxes) {
        validateAxis(ax);
        if (yAxesMap.has(ax.id)) throw new Error(`duplicate yAxis id: ${ax.id}`);
        yAxesMap.set(
            ax.id,
            freezeAxis({
                autoRange: ax.min == null && ax.max == null,
                ...ax,
            }),
        );
    }

    const seriesMap = new Map();
    for (const s of series) {
        validateSeries(s, yAxesMap);
        if (seriesMap.has(s.id)) throw new Error(`duplicate series id: ${s.id}`);
        seriesMap.set(
            s.id,
            freezeSeries({
                visible: true,
                color: '#888',
                label: s.id,
                ...s,
            }),
        );
    }

    const tooltipMode = options.tooltipMode ?? 'single';
    if (!VALID_TOOLTIP_MODES.has(tooltipMode)) {
        throw new Error(`invalid tooltipMode: ${tooltipMode}`);
    }

    return freezeState({
        chartType,
        xAxis: freezeAxis({ autoRange: xAxis.min == null && xAxis.max == null, ...xAxis }),
        yAxes: yAxesMap,
        series: seriesMap,
        legendVisible: options.legendVisible !== false,
        gridVisible: options.gridVisible !== false,
        tooltipMode,
    });
}

function rebuild(state: any, patch: any) {
    return freezeState({
        chartType: patch.chartType ?? state.chartType,
        xAxis: patch.xAxis ?? state.xAxis,
        yAxes: patch.yAxes ?? state.yAxes,
        series: patch.series ?? state.series,
        legendVisible: patch.legendVisible ?? state.legendVisible,
        gridVisible: patch.gridVisible ?? state.gridVisible,
        tooltipMode: patch.tooltipMode ?? state.tooltipMode,
    });
}

export function addSeries(state: any, series: any) {
    if (state.series.has(series.id)) throw new Error(`duplicate series id: ${series.id}`);
    validateSeries(series, state.yAxes);
    const next = cloneSeries(state.series);
    next.set(
        series.id,
        freezeSeries({
            visible: true,
            color: '#888',
            label: series.id,
            ...series,
        }),
    );
    return rebuild(state, { series: next });
}

export function removeSeries(state: any, seriesId: any) {
    if (!state.series.has(seriesId)) throw new Error(`series not found: ${seriesId}`);
    const next = cloneSeries(state.series);
    next.delete(seriesId);
    return rebuild(state, { series: next });
}

export function toggleSeries(state: any, seriesId: any) {
    const cur = state.series.get(seriesId);
    if (!cur) throw new Error(`series not found: ${seriesId}`);
    const next = cloneSeries(state.series);
    next.set(seriesId, freezeSeries({ ...cur, visible: !cur.visible }));
    return rebuild(state, { series: next });
}

export function updateSeries(state: any, seriesId: any, partial: any) {
    const cur = state.series.get(seriesId);
    if (!cur) throw new Error(`series not found: ${seriesId}`);
    const merged = { ...cur, ...partial, id: cur.id };
    if (partial.type != null && !VALID_SERIES_TYPES.has(merged.type)) {
        throw new Error(`invalid series type: ${merged.type}`);
    }
    if (partial.yAxisId != null && !state.yAxes.has(merged.yAxisId)) {
        throw new Error(`series.yAxisId not found: ${merged.yAxisId}`);
    }
    const next = cloneSeries(state.series);
    next.set(seriesId, freezeSeries(merged));
    return rebuild(state, { series: next });
}

function findAxis(state: any, axisId: any) {
    if (state.xAxis.id === axisId) return { kind: 'x', axis: state.xAxis };
    if (state.yAxes.has(axisId)) return { kind: 'y', axis: state.yAxes.get(axisId) };
    return null;
}

export function setAxisRange(state: any, axisId: any, { min, max }: { min: any; max: any }) {
    if (min == null || max == null) throw new Error('min and max required');
    if (min >= max) throw new Error('min must be < max');
    const found = findAxis(state, axisId);
    if (!found) throw new Error(`axis not found: ${axisId}`);
    const updated = freezeAxis({ ...found.axis, min, max, autoRange: false });
    if (found.kind === 'x') return rebuild(state, { xAxis: updated });
    const next = cloneAxes(state.yAxes);
    next.set(axisId, updated);
    return rebuild(state, { yAxes: next });
}

export function enableAutoRange(state: any, axisId: any) {
    const found = findAxis(state, axisId);
    if (!found) throw new Error(`axis not found: ${axisId}`);
    // eslint-disable-next-line
    const { min, max, ...rest } = found.axis;
    const updated = freezeAxis({ ...rest, autoRange: true });
    if (found.kind === 'x') return rebuild(state, { xAxis: updated });
    const next = cloneAxes(state.yAxes);
    next.set(axisId, updated);
    return rebuild(state, { yAxes: next });
}

export function addYAxis(state: any, axis: any) {
    validateAxis(axis);
    if (state.yAxes.has(axis.id)) throw new Error(`duplicate yAxis id: ${axis.id}`);
    const next = cloneAxes(state.yAxes);
    next.set(
        axis.id,
        freezeAxis({
            autoRange: axis.min == null && axis.max == null,
            ...axis,
        }),
    );
    return rebuild(state, { yAxes: next });
}

export function removeYAxis(state: any, axisId: any) {
    if (!state.yAxes.has(axisId)) throw new Error(`yAxis not found: ${axisId}`);
    for (const s of state.series.values()) {
        if (s.yAxisId === axisId) {
            throw new Error(`yAxis ${axisId} has series: ${s.id}`);
        }
    }
    const next = cloneAxes(state.yAxes);
    next.delete(axisId);
    return rebuild(state, { yAxes: next });
}

export function toggleLegend(state: any) {
    return rebuild(state, { legendVisible: !state.legendVisible });
}

export function toggleGrid(state: any) {
    return rebuild(state, { gridVisible: !state.gridVisible });
}

export function setTooltipMode(state: any, mode: any) {
    if (!VALID_TOOLTIP_MODES.has(mode)) throw new Error(`invalid tooltipMode: ${mode}`);
    return rebuild(state, { tooltipMode: mode });
}

export function getVisibleSeries(state: any) {
    const out = [];
    for (const s of state.series.values()) if (s.visible) out.push(s);
    return out;
}

export function getSeriesByAxis(state: any, yAxisId: any) {
    const out = [];
    for (const s of state.series.values()) if (s.yAxisId === yAxisId) out.push(s);
    return out;
}

export function summarizeChart(state: any) {
    let visibleCount = 0;
    for (const s of state.series.values()) if (s.visible) visibleCount++;
    return {
        seriesCount: state.series.size,
        visibleCount,
        axisCount: state.yAxes.size + 1,
        type: state.chartType,
    };
}
