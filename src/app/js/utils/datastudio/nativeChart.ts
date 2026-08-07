// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { Z_INDEX } from '../ui/zIndex.js';

const CHART_COLORS = ['#14b8a6', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#22c55e'];
const EMPTY_CHART_DATA = Object.freeze({ labels: [], datasets: [] });

type ChartLabel = string | number | null | undefined;
interface RawChartDataset {
    label?: string;
    values?: unknown[];
    color?: string;
}
interface RawChartData {
    labels?: unknown[];
    datasets?: RawChartDataset[];
}
interface ResultSetDataset {
    columns?: string[];
    values?: unknown[][];
}
interface NormalizedChartDataset {
    label: string;
    values: Array<number | null>;
    color: any;
}
interface NormalizedChartData {
    labels: ChartLabel[];
    datasets: NormalizedChartDataset[];
}
interface ChartHoverItem {
    datasetIndex: number;
    pointIndex?: number;
    datasetLabel: string;
    label: string;
    value: string;
    x: number;
    y: number;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function _isNumericValue(value: unknown): boolean {
    return value != null && value !== '' && !Number.isNaN(Number(value));
}

/**
 * @param {unknown[][]} values
 * @param {number} columnIndex
 * @returns {boolean}
 */
function _isNumericColumn(values: unknown[][], columnIndex: number): boolean {
    const sample = (values || []).slice(0, 20);
    if (!sample.length) return false;
    return sample.every(
        (row) => row?.[columnIndex] == null || row[columnIndex] === '' || _isNumericValue(row[columnIndex]),
    );
}

/**
 * @param {unknown[]|undefined} labels
 * @param {number} count
 * @returns {ChartLabel[]}
 */
function _normalizeLabels(labels: unknown[] | undefined, count: number): ChartLabel[] {
    if (Array.isArray(labels) && labels.length >= count) {
        return labels.slice(0, count) as ChartLabel[];
    }
    return Array.from({ length: count }, (_, index) => index + 1);
}

/**
 * @param {RawChartData|undefined|null} data
 * @returns {NormalizedChartData}
 */
function _normalizeChartData(data: RawChartData | undefined | null): NormalizedChartData {
    const datasets = Array.isArray(data?.datasets)
        ? data.datasets.map((dataset, index) => ({
              label: dataset?.label || `Series ${index + 1}`,
              values: Array.isArray(dataset?.values)
                  ? dataset.values.map((value) => (_isNumericValue(value) ? Number(value) : null))
                  : [],
              color: dataset?.color || CHART_COLORS[index % CHART_COLORS.length],
          }))
        : [];
    const pointCount = datasets.reduce((max, dataset) => Math.max(max, dataset.values.length), 0);
    return {
        labels: _normalizeLabels(data?.labels, pointCount),
        datasets,
    };
}

/**
 * @param {string[]} columns
 * @param {unknown[][]} values
 * @returns {{ numericIndexes: number[], stringIndexes: number[] }}
 */
function _resolveColumnIndexes(
    columns: string[],
    values: unknown[][],
): { numericIndexes: number[]; stringIndexes: number[] } {
    const numericIndexes = columns
        .map((_, columnIndex) => columnIndex)
        .filter((columnIndex) => _isNumericColumn(values, columnIndex));
    const stringIndexes = columns
        .map((_, columnIndex) => columnIndex)
        .filter((columnIndex) => !numericIndexes.includes(columnIndex));
    return { numericIndexes, stringIndexes };
}

/**
 * @param {ResultSetDataset|null|undefined} dataset
 * @returns {'bar'|'scatter'|'line'|null}
 */
export function detectChartType(dataset: ResultSetDataset | null | undefined): 'bar' | 'scatter' | 'line' | null {
    const columns = dataset?.columns || [];
    const values = dataset?.values || [];
    if (!columns.length || !values.length) return null;

    const { numericIndexes, stringIndexes } = _resolveColumnIndexes(columns, values);
    if (stringIndexes.length === 1 && numericIndexes.length >= 1) return 'bar';
    if (stringIndexes.length === 0 && numericIndexes.length === 2) return 'scatter';
    if (numericIndexes.length >= 1) return 'line';
    return null;
}

/**
 * @param {ResultSetDataset|null|undefined} dataset
 * @param {'bar'|'scatter'|'line'} [chartType]
 * @returns {{ labels: ChartLabel[], datasets: Array<{ label: string, values: unknown[] }> }}
 */
function _buildBarChartData(
    columns: string[],
    values: unknown[][],
    numericIndexes: number[],
    stringIndexes: number[],
): { labels: ChartLabel[]; datasets: Array<{ label: string; values: unknown[] }> } {
    const labelIndex = stringIndexes[0] ?? 0;
    const seriesIndexes = numericIndexes.filter((columnIndex) => columnIndex !== labelIndex);
    return {
        labels: values.map((row) => String(row?.[labelIndex] ?? '')),
        datasets: (seriesIndexes.length ? seriesIndexes : numericIndexes).map((columnIndex) => ({
            label: String(columns[columnIndex] ?? ''),
            values: values.map((row) => row?.[columnIndex]),
        })),
    };
}

function _buildScatterChartData(
    columns: string[],
    values: unknown[][],
    numericIndexes: number[],
): { labels: ChartLabel[]; datasets: Array<{ label: string; values: unknown[] }> } {
    const xIndex = numericIndexes[0] as number;
    const yIndexes = numericIndexes.slice(1);
    return {
        labels: values.map((row, index) => row?.[xIndex] ?? index + 1) as ChartLabel[],
        datasets: (yIndexes.length ? yIndexes : [xIndex]).map((columnIndex) => ({
            label: String(columns[columnIndex] ?? ''),
            values: values.map((row) => row?.[columnIndex]),
        })),
    };
}

function _buildLineChartData(
    columns: string[],
    values: unknown[][],
    numericIndexes: number[],
    stringIndexes: number[],
): { labels: ChartLabel[]; datasets: Array<{ label: string; values: unknown[] }> } {
    const labelIndex = stringIndexes[0];
    const labels =
        labelIndex == null ? values.map((_, index) => index + 1) : values.map((row) => String(row?.[labelIndex] ?? ''));
    const seriesIndexes = numericIndexes.filter((columnIndex) => columnIndex !== labelIndex);
    return {
        labels,
        datasets: (seriesIndexes.length ? seriesIndexes : numericIndexes).map((columnIndex) => ({
            label: String(columns[columnIndex] ?? ''),
            values: values.map((row) => row?.[columnIndex]),
        })),
    };
}

export function buildChartDataFromResultSet(
    dataset: ResultSetDataset | null | undefined,
    chartType: 'bar' | 'scatter' | 'line' = detectChartType(dataset) || 'bar',
): { labels: ChartLabel[]; datasets: Array<{ label: any; values: unknown[] }> } {
    const columns = dataset?.columns || [];
    const values = dataset?.values || [];
    if (!columns.length || !values.length) return EMPTY_CHART_DATA;

    const { numericIndexes, stringIndexes } = _resolveColumnIndexes(columns, values);
    if (!numericIndexes.length) return EMPTY_CHART_DATA;

    if (chartType === 'bar') {
        return _buildBarChartData(columns, values, numericIndexes, stringIndexes);
    }

    if (chartType === 'scatter') {
        return _buildScatterChartData(columns, values, numericIndexes);
    }

    return _buildLineChartData(columns, values, numericIndexes, stringIndexes);
}

/**
 * @returns {(callback: FrameRequestCallback) => number}
 */
function _getRequestAnimationFrame(): (callback: FrameRequestCallback) => number {
    return typeof globalThis.requestAnimationFrame === 'function'
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : (callback) => setTimeout(callback, 0) as unknown as number;
}

/**
 * @returns {(id: number) => void}
 */
function _getCancelAnimationFrame(): (id: number) => void {
    return typeof globalThis.cancelAnimationFrame === 'function'
        ? globalThis.cancelAnimationFrame.bind(globalThis)
        : (id) => clearTimeout(id);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @returns {{ width: number, height: number }}
 */
function _fitCanvas(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
): { width: number; height: number } {
    const width = Math.max(160, Number(canvas.clientWidth || canvas.width || 480));
    const height = Math.max(120, Number(canvas.clientHeight || canvas.height || 220));
    const ratio = Math.max(1, Number(globalThis.devicePixelRatio || 1));

    if (canvas.style) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
    }

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    if (typeof ctx.setTransform === 'function') {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    } else if (typeof ctx.scale === 'function') {
        ctx.scale(ratio, ratio);
    }

    return { width, height };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 */
function _clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#08111d';
    ctx.fillRect(0, 0, width, height);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @returns {number}
 */
function _measureText(ctx: CanvasRenderingContext2D, text: string): number {
    if (typeof ctx.measureText === 'function') {
        return ctx.measureText(text).width;
    }
    return String(text).length * 7;
}

/**
 * @param {number} value
 * @returns {string}
 */
function _formatNumber(value: number): string {
    return Number.isFinite(value) ? Number(value.toFixed(2)).toString() : '0';
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {HTMLDivElement|null}
 */
function _createTooltip(canvas: HTMLCanvasElement): HTMLDivElement | null {
    const parent = canvas?.parentElement;
    const doc = parent?.ownerDocument || globalThis.document;
    if (!parent || !doc?.createElement) return null;

    if (typeof parent.style?.position === 'string' && !parent.style.position) {
        parent.style.position = 'relative';
    }

    const tooltip = doc.createElement('div');
    tooltip.className = 'ds-native-chart-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = String(Z_INDEX.EXCEPTION_NATIVE_CHART_TOOLTIP);
    tooltip.style.padding = '6px 8px';
    tooltip.style.borderRadius = '6px';
    tooltip.style.background = 'rgba(8, 17, 29, 0.94)';
    tooltip.style.border = '1px solid rgba(255, 255, 255, 0.12)';
    tooltip.style.color = '#f8fafc';
    tooltip.style.fontSize = '11px';
    tooltip.style.lineHeight = '1.35';
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translate(-9999px, -9999px)';
    parent.appendChild(tooltip);
    return tooltip;
}

/**
 * @param {HTMLElement|null} tooltip
 */
function _hideTooltip(tooltip: HTMLElement | null) {
    if (!tooltip) return;
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translate(-9999px, -9999px)';
}

/**
 * @param {HTMLElement|null} tooltip
 * @param {MouseEvent} event
 * @param {ChartHoverItem|null} hoverItem
 * @param {{ left: number, top: number }} rect
 */
function _showTooltip(
    tooltip: HTMLElement | null,
    event: MouseEvent,
    hoverItem: ChartHoverItem | null,
    rect: { left: number; top: number },
) {
    if (!tooltip || !hoverItem) {
        _hideTooltip(tooltip);
        return;
    }

    tooltip.innerHTML = `<strong>${hoverItem.datasetLabel}</strong><br>${hoverItem.label}: ${hoverItem.value}`;
    tooltip.style.opacity = '1';
    tooltip.style.transform = `translate(${event.clientX - rect.left + 12}px, ${event.clientY - rect.top + 12}px)`;
}

/**
 * @param {HTMLCanvasElement} canvas
 */
function _cleanupCanvas(canvas: HTMLCanvasElement) {
    const chartCanvas = canvas as HTMLCanvasElement & { __dsNativeChartCleanup?: Function };
    if (typeof chartCanvas?.__dsNativeChartCleanup === 'function') {
        chartCanvas.__dsNativeChartCleanup();
    }
    delete chartCanvas.__dsNativeChartCleanup;
}

/**
 * @param {HTMLCanvasElement|null|undefined} canvas
 * @param {RawChartData|null|undefined} data
 * @param {'bar'|'scatter'|'line'} [type]
 * @returns {boolean}
 */
export function renderNativeChart(
    canvas: HTMLCanvasElement | null | undefined,
    data: RawChartData | null | undefined,
    type: 'bar' | 'scatter' | 'line' = 'line',
): boolean {
    if (!canvas || typeof canvas.getContext !== 'function') return false;

    _cleanupCanvas(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const chartData = _normalizeChartData(data);
    const { width, height } = _fitCanvas(canvas, ctx);
    const tooltip = _createTooltip(canvas);
    const requestFrame = _getRequestAnimationFrame();
    const cancelFrame = _getCancelAnimationFrame();
    const padding = { top: 24, right: 18, bottom: 34, left: 44 };
    const plotWidth = Math.max(1, width - padding.left - padding.right);
    const plotHeight = Math.max(1, height - padding.top - padding.bottom);

    /**
     * @param {ChartHoverItem|null} [hoverItem]
     * @returns {ChartHoverItem[]}
     */
    const drawChart = (hoverItem: ChartHoverItem | null = null): ChartHoverItem[] => {
        _clearCanvas(ctx, width, height);

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let tick = 0; tick <= 4; tick++) {
            const y = padding.top + (plotHeight / 4) * tick;
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
        }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(248, 250, 252, 0.45)';
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.lineTo(width - padding.right, height - padding.bottom);
        ctx.stroke();

        if (
            !chartData.datasets.length ||
            chartData.datasets.every((dataset) => dataset.values.every((value) => value == null))
        ) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px sans-serif';
            ctx.fillText('No chart data', padding.left, padding.top + 16);
            _hideTooltip(tooltip);
            return [];
        }

        const xValues =
            type === 'scatter'
                ? chartData.labels.map((label, index) => (_isNumericValue(label) ? Number(label) : index + 1))
                : chartData.labels.map((_, index) => index);
        const allYValues = chartData.datasets.flatMap((dataset) => dataset.values).filter((value) => value != null);
        let minY = Math.min(...allYValues as number[]);
        let maxY = Math.max(...allYValues as number[]);
        if (type === 'bar') minY = Math.min(0, minY);
        if (minY === maxY) {
            minY -= 1;
            maxY += 1;
        }

        let minX = Math.min(...xValues);
        let maxX = Math.max(...xValues);
        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || minX === maxX) {
            minX = 0;
            maxX = Math.max(1, xValues.length - 1);
        }

        /** @param {number} value */
        const toY = (value: number) => {
            const ratio = (value - minY) / (maxY - minY || 1);
            return height - padding.bottom - ratio * plotHeight;
        };
        /**
         * @param {number} value
         * @param {number} index
         * @param {number} count
         */
        const toX = (value: any, index: number, count: number) => {
            if (type === 'scatter') {
                const ratio = (value - minX) / (maxX - minX || 1);
                return padding.left + ratio * plotWidth;
            }
            if (count <= 1) return padding.left + plotWidth / 2;
            return padding.left + (plotWidth / Math.max(1, count - 1)) * index;
        };

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '11px sans-serif';
        for (let tick = 0; tick <= 4; tick++) {
            const value = maxY - ((maxY - minY) / 4) * tick;
            const y = padding.top + (plotHeight / 4) * tick;
            ctx.fillText(_formatNumber(value), 8, y + 4);
        }

        const xTickStep = chartData.labels.length > 6 ? Math.ceil(chartData.labels.length / 6) : 1;
        chartData.labels.forEach((label, index) => {
            if (index % xTickStep !== 0 && index !== chartData.labels.length - 1) return;
            const x = toX(xValues[index], index, chartData.labels.length);
            const labelText = String(label ?? '');
            ctx.fillText(labelText, x - _measureText(ctx, labelText) / 2, height - 10);
        });

        const items: ChartHoverItem[] = [];
        const step = chartData.labels.length > 1 ? plotWidth / Math.max(1, chartData.labels.length - 1) : plotWidth;

        chartData.datasets.forEach((dataset, datasetIndex) => {
            ctx.strokeStyle = dataset.color;
            ctx.fillStyle = dataset.color;
            ctx.lineWidth = hoverItem?.datasetIndex === datasetIndex ? 2.5 : 2;

            if (type === 'line') {
                ctx.beginPath();
                dataset.values.forEach((value, valueIndex) => {
                    if (value == null) return;
                    const x = toX(xValues[valueIndex], valueIndex, dataset.values.length);
                    const y = toY(value);
                    if (valueIndex === 0 || dataset.values.slice(0, valueIndex).every((entry) => entry == null)) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                    items.push({
                        datasetIndex,
                        datasetLabel: dataset.label,
                        label: String(chartData.labels[valueIndex] ?? valueIndex + 1),
                        value: _formatNumber(value),
                        x,
                        y,
                    });
                });
                ctx.stroke();
                dataset.values.forEach((value, valueIndex) => {
                    if (value == null) return;
                    const x = toX(xValues[valueIndex], valueIndex, dataset.values.length);
                    const y = toY(value);
                    ctx.beginPath();
                    ctx.arc(
                        x,
                        y,
                        hoverItem?.datasetIndex === datasetIndex && hoverItem?.pointIndex === valueIndex ? 4 : 3,
                        0,
                        Math.PI * 2,
                    );
                    ctx.fill();
                });
                return;
            }

            if (type === 'bar') {
                const groupWidth = step * 0.72;
                const barWidth = Math.max(6, groupWidth / Math.max(1, chartData.datasets.length));
                dataset.values.forEach((value, valueIndex) => {
                    if (value == null) return;
                    const groupX = toX(xValues[valueIndex], valueIndex, dataset.values.length);
                    const baseY = toY(Math.max(0, minY));
                    const topY = toY(value);
                    const x = groupX - groupWidth / 2 + datasetIndex * barWidth;
                    const barHeight = Math.max(1, baseY - topY);
                    ctx.fillRect(x, Math.min(baseY, topY), barWidth - 1, barHeight);
                    items.push({
                        datasetIndex,
                        pointIndex: valueIndex,
                        datasetLabel: dataset.label,
                        label: String(chartData.labels[valueIndex] ?? valueIndex + 1),
                        value: _formatNumber(value),
                        x: x + barWidth / 2,
                        y: topY,
                    });
                });
                return;
            }

            dataset.values.forEach((value, valueIndex) => {
                if (value == null) return;
                const x = toX(xValues[valueIndex], valueIndex, dataset.values.length);
                const y = toY(value);
                ctx.beginPath();
                ctx.arc(
                    x,
                    y,
                    hoverItem?.datasetIndex === datasetIndex && hoverItem?.pointIndex === valueIndex ? 5 : 4,
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
                items.push({
                    datasetIndex,
                    pointIndex: valueIndex,
                    datasetLabel: dataset.label,
                    label: String(chartData.labels[valueIndex] ?? valueIndex + 1),
                    value: _formatNumber(value),
                    x,
                    y,
                });
            });
        });

        ctx.font = '11px sans-serif';
        chartData.datasets.forEach((dataset, datasetIndex) => {
            const legendX = padding.left + datasetIndex * 110;
            const legendY = 14;
            ctx.fillStyle = dataset.color;
            ctx.fillRect(legendX, legendY - 8, 10, 10);
            ctx.fillStyle = '#f8fafc';
            ctx.fillText(dataset.label, legendX + 16, legendY);
        });

        if (hoverItem) {
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(hoverItem.x, hoverItem.y, 7, 0, Math.PI * 2);
            ctx.stroke();
        }

        return items;
    };

    let items: ChartHoverItem[] = drawChart(null);
    let pendingEvent: MouseEvent | null = null;
    let frameId: number | null = null;

    const flushHover = () => {
        frameId = null;
        const rect =
            typeof canvas.getBoundingClientRect === 'function'
                ? canvas.getBoundingClientRect()
                : { left: 0, top: 0, width, height };
        if (!pendingEvent) {
            items = drawChart(null);
            _hideTooltip(tooltip);
            return;
        }

        const mouseX = pendingEvent.clientX - rect.left;
        const mouseY = pendingEvent.clientY - rect.top;
        let hoverItem = null;
        let minDistance = Number.POSITIVE_INFINITY;
        items.forEach((item) => {
            const distance = Math.hypot(item.x - mouseX, item.y - mouseY);
            if (distance < minDistance && distance <= 18) {
                minDistance = distance;
                hoverItem = item;
            }
        });
        items = drawChart(hoverItem);
        _showTooltip(tooltip, pendingEvent, hoverItem, rect);
    };

    /**
     * @param {MouseEvent|null} event
     */
    const queueHover = (event: MouseEvent | null) => {
        pendingEvent = event;
        if (frameId != null) return;
        frameId = requestFrame(flushHover);
    };

    const handleMouseMove = (event: MouseEvent) => queueHover(event);
    const handleMouseLeave = () => queueHover(null);

    if (typeof canvas.addEventListener === 'function') {
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseleave', handleMouseLeave);
    }

    (canvas as HTMLCanvasElement & { __dsNativeChartCleanup?: Function }).__dsNativeChartCleanup = () => {
        if (frameId != null) cancelFrame(frameId);
        if (typeof canvas.removeEventListener === 'function') {
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseleave', handleMouseLeave);
        }
        if (tooltip?.parentNode) tooltip.parentNode.removeChild(tooltip);
    };

    return true;
}
