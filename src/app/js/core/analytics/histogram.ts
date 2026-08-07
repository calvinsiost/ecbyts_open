// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * ecbyts Analytics - Dynamic Histogram
 * Histogramas dinâmicos para análise de distribuição estatística
 * Usa Chart.js para renderização
 */

import { eventBus, Events } from './eventBus.js';

interface HistogramStats {
    count: number;
    min: number | null;
    max: number | null;
    mean: number | null;
    std: number | null;
    sum?: number;
}

/**
 * Configurações padrão do histograma
 */
const DEFAULT_CONFIG = {
    binCount: 20,
    minBinCount: 5,
    maxBinCount: 50,
    colors: {
        default: 'rgba(59, 130, 246, 0.6)',
        selected: 'rgba(34, 197, 94, 0.8)',
        hover: 'rgba(251, 191, 36, 0.8)',
        border: 'rgba(59, 130, 246, 1)',
    },
    animation: {
        duration: 300,
    },
};

/**
 * Classe para histograma dinâmico
 */
class DynamicHistogram {
    container: any;
    options: any;
    data: any[];
    bins: any[];
    selectedBins: Set<any>;
    hoveredBin: any;
    parameterId: any;
    chart: any;
    stats: HistogramStats;
    header!: HTMLDivElement;
    canvasContainer!: HTMLDivElement;
    canvas!: HTMLCanvasElement;
    controls!: HTMLDivElement;

    constructor(container: any, options: any = {}) {
        this.container = container;
        this.options = { ...DEFAULT_CONFIG, ...options };

        // Estado
        this.data = [];
        this.bins = [];
        this.selectedBins = new Set();
        this.hoveredBin = null;
        this.parameterId = null;
        this.chart = null;

        // Estatísticas
        this.stats = {
            count: 0,
            min: null,
            max: null,
            mean: null,
            std: null,
        };

        // Inicialização
        this._createContainer();
        this._setupEventListeners();
    }

    /**
     * Cria estrutura do container
     */
    _createContainer(): void {
        // Header com estatísticas
        this.header = document.createElement('div');
        this.header.className = 'histogram-header';
        this.header.innerHTML = `
            <div class="histogram-title">Distribuição de Frequência</div>
            <div class="histogram-stats">
                <span class="stat-item">n: <span id="stat-count">0</span></span>
                <span class="stat-item">μ: <span id="stat-mean">-</span></span>
                <span class="stat-item">σ: <span id="stat-std">-</span></span>
            </div>
        `;
        this.container.appendChild(this.header);

        // Canvas para Chart.js
        this.canvasContainer = document.createElement('div');
        this.canvasContainer.className = 'histogram-canvas-container';
        this.canvasContainer.style.flex = '1';
        this.canvasContainer.style.position = 'relative';

        this.canvas = document.createElement('canvas');
        this.canvasContainer.appendChild(this.canvas);
        this.container.appendChild(this.canvasContainer);

        // Controles
        this.controls = document.createElement('div');
        this.controls.className = 'histogram-controls';
        this.controls.innerHTML = `
            <label class="histogram-control">
                <span>Bins:</span>
                <input data-field-meta="true" data-field-meta-key="auto:bin-slider" type="range" id="bin-slider" min="${this.options.minBinCount}" max="${this.options.maxBinCount}" value="${this.options.binCount}">
                <span id="bin-count">${this.options.binCount}</span>
            </label>
            <button id="clear-selection" class="histogram-btn">Limpar Seleção</button>
        `;
        this.container.appendChild(this.controls);

        // Event listeners para controles
        const controls = this.controls as any;
        const binSlider = controls.querySelector('#bin-slider') as HTMLInputElement;
        binSlider?.addEventListener('input', (e: any) => {
            this.options.binCount = parseInt(e.target.value);
            const countEl = controls.querySelector('#bin-count');
            if (countEl) countEl.textContent = String(this.options.binCount);
            this._recalculateBins();
            this._updateChart();
        });

        const clearBtn = controls.querySelector('#clear-selection');
        clearBtn?.addEventListener('click', () => this.clearSelection());
    }

    /**
     * Configura event listeners
     */
    _setupEventListeners(): void {
        eventBus.on(Events.DATA_UPDATED, () => {
            this._recalculateBins();
            this._updateChart();
        });

        eventBus.on(Events.ELEMENT_SELECTED, (data: any) => {
            // Destacar bin do elemento selecionado
            this._highlightElementBin(data.elementId);
        });
    }

    /**
     * Inicializa Chart.js
     */
    async _initChart(): Promise<void> {
        // Verifica se Chart.js está disponível
        const ChartCtor = ((globalThis as any).Chart) as any;
        if (typeof ChartCtor === 'undefined' || ChartCtor === null) {
            console.warn('Chart.js not loaded. Histogram will not render.');
            return;
        }

        const ctx = ((this.canvas as any)?.getContext('2d')) as any;

        this.chart = new ChartCtor(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Frequência',
                        data: [],
                        backgroundColor: [],
                        borderColor: this.options.colors.border,
                        borderWidth: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: this.options.animation.duration,
                },
                plugins: {
                    legend: {
                        display: false,
                    },
                    tooltip: {
                        callbacks: {
                            title: (items: any) => {
                                if (items.length === 0) return '';
                                const bin = this.bins[items[0].dataIndex];
                                return `${bin.min.toFixed(2)} - ${bin.max.toFixed(2)}`;
                            },
                            label: (item: any) => {
                                const count = item.raw;
                                const percentage = ((count / (this.stats.count as number)) * 100).toFixed(1);
                                return `Frequência: ${count} (${percentage}%)`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Valor',
                            color: '#888888',
                        },
                        ticks: {
                            color: '#888888',
                            maxRotation: 45,
                            minRotation: 45,
                        },
                        grid: {
                            color: '#333333',
                        },
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Frequência',
                            color: '#888888',
                        },
                        ticks: {
                            color: '#888888',
                            // FIX 2026-04-10: stepSize:1 hardcoded caused Chart.js
                            // to try to generate up to 6000+ ticks on Y axis when
                            // a bin had high frequency count, emitting warnings
                            // and wasting render time. Let Chart.js auto-compute
                            // the step, but cap max ticks for readability.
                            maxTicksLimit: 10,
                            precision: 0, // frequencies are integers
                        },
                        grid: {
                            color: '#333333',
                        },
                        beginAtZero: true,
                    },
                },
                onClick: (event: any, elements: any) => {
                    if (elements.length > 0) {
                        const binIndex = elements[0].index;
                        this._onBinClick(binIndex);
                    }
                },
                onHover: (event: any, elements: any) => {
                    if (elements.length > 0) {
                        this.hoveredBin = elements[0].index;
                        (this.canvas as any).style.cursor = 'pointer';
                    } else {
                        this.hoveredBin = null;
                        (this.canvas as any).style.cursor = 'default';
                    }
                },
            },
        });
    }

    /**
     * Atualiza dados do histograma
     * @param dataPoints - Array de DataPoints
     * @param parameterId - ID do parâmetro (opcional)
     */
    update(dataPoints: any[], parameterId: any = null): void {
        this.data = dataPoints;
        this.parameterId = parameterId;

        // Extrai valores numéricos
        const values = dataPoints
            .map((p: any) => p.value)
            .filter((v: any) => typeof v === 'number' && !isNaN(v));

        if (values.length === 0) {
            this._clearChart();
            return;
        }

        // Calcula estatísticas
        this._calculateStats(values);

        // Recalcula bins
        this._recalculateBins();

        // Atualiza chart
        if (!this.chart) {
            this._initChart()
                .then(() => this._updateChart())
                .catch((err) => console.warn('[histogram] init failed:', err));
        } else {
            this._updateChart();
        }

        // Atualiza UI de estatísticas
        this._updateStatsUI();
    }

    /**
     * Calcula estatísticas descritivas
     */
    _calculateStats(values: number[]): void {
        const n = values.length;
        const sum = values.reduce((a: number, b: number) => a + b, 0);
        const mean = sum / n;
        const squaredDiffs = values.map((v: number) => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((a: number, b: number) => a + b, 0) / n;

        this.stats = {
            count: n,
            min: Math.min(...values),
            max: Math.max(...values),
            mean: mean,
            std: Math.sqrt(variance),
            sum: sum,
        };
    }

    /**
     * Recalcula bins do histograma
     */
    _recalculateBins(): void {
        const values = this.data
            .map((p: any) => p.value)
            .filter((v: any) => typeof v === 'number' && !isNaN(v));

        if (values.length === 0) {
            this.bins = [];
            return;
        }

        const { min, max } = this.stats;
        const binCount = this.options.binCount;
        const binWidth = ((max as number) - (min as number)) / binCount || 1;

        this.bins = [];
        for (let i = 0; i < binCount; i++) {
            this.bins.push({
                index: i,
                min: (min as number) + i * binWidth,
                max: (min as number) + (i + 1) * binWidth,
                count: 0,
                dataPoints: [],
            });
        }

        // Distribui valores nos bins
        this.data.forEach((point: any) => {
            const value = point.value;
            if (typeof value !== 'number' || isNaN(value)) return;

            let binIndex = Math.floor((value - (min as number)) / binWidth);
            if (binIndex >= binCount) binIndex = binCount - 1;
            if (binIndex < 0) binIndex = 0;

            this.bins[binIndex].count++;
            this.bins[binIndex].dataPoints.push(point);
        });
    }

    /**
     * Atualiza o gráfico Chart.js
     */
    _updateChart(): void {
        if (!this.chart) return;

        const labels = this.bins.map((bin: any) => `${bin.min.toFixed(1)}`);

        const counts = this.bins.map((bin: any) => bin.count);

        const colors = this.bins.map((bin: any, index: number) => {
            if (this.selectedBins.has(index)) {
                return this.options.colors.selected;
            }
            return this.options.colors.default;
        });

        this.chart.data.labels = labels;
        this.chart.data.datasets[0].data = counts;
        this.chart.data.datasets[0].backgroundColor = colors;

        this.chart.update('none');
    }

    /**
     * Atualiza UI de estatísticas
     */
    _updateStatsUI(): void {
        const header = this.header as any;
        const countEl = header?.querySelector('#stat-count');
        const meanEl = header?.querySelector('#stat-mean');
        const stdEl = header?.querySelector('#stat-std');

        if (countEl) countEl.textContent = String(this.stats.count);
        if (meanEl) meanEl.textContent = this.stats.mean?.toFixed(2) || '-';
        if (stdEl) stdEl.textContent = this.stats.std?.toFixed(2) || '-';
    }

    /**
     * Limpa o gráfico
     */
    _clearChart(): void {
        if (this.chart) {
            this.chart.data.labels = [];
            this.chart.data.datasets[0].data = [];
            this.chart.update();
        }

        this.stats = { count: 0, min: null, max: null, mean: null, std: null };
        this._updateStatsUI();
    }

    /**
     * Handler de click em bin
     */
    _onBinClick(binIndex: number): void {
        // Toggle seleção
        if (this.selectedBins.has(binIndex)) {
            this.selectedBins.delete(binIndex);
        } else {
            this.selectedBins.add(binIndex);
        }

        // Atualiza cores
        this._updateChart();

        // Emite evento de filtro
        this._emitFilterEvent();
    }

    /**
     * Emite evento de filtro baseado em bins selecionados
     */
    _emitFilterEvent(): void {
        if (this.selectedBins.size === 0) {
            eventBus.emit(Events.HISTOGRAM_FILTER, {
                active: false,
                elementIds: [],
                binRanges: [],
            });
            return;
        }

        // Coleta elementos dos bins selecionados
        const elementIds = new Set<any>();
        const binRanges: any[] = [];

        this.selectedBins.forEach((binIndex: number) => {
            const bin = this.bins[binIndex];
            if (bin) {
                binRanges.push({ min: bin.min, max: bin.max });
                bin.dataPoints.forEach((point: any) => {
                    elementIds.add(point.elementId);
                });
            }
        });

        eventBus.emit(Events.HISTOGRAM_FILTER, {
            active: true,
            elementIds: Array.from(elementIds),
            binRanges,
            parameterId: this.parameterId,
        });

        // Também emite elementos filtrados
        eventBus.emit(Events.ELEMENTS_FILTERED, {
            elementIds: Array.from(elementIds),
            source: 'histogram',
        });
    }

    /**
     * Destaca bin que contém um elemento específico
     */
    _highlightElementBin(elementId: any): void {
        // Encontra bin do elemento
        for (let i = 0; i < this.bins.length; i++) {
            const bin = this.bins[i];
            const found = bin.dataPoints.some((p: any) => p.elementId === elementId);
            if (found) {
                // Não seleciona, apenas destaca temporariamente
                // Poderia usar tooltip ou animação
                break;
            }
        }
    }

    /**
     * Destaca um valor específico
     */
    highlight(value: any): void {
        if (typeof value !== 'number' || isNaN(value)) return;

        // Encontra bin do valor
        const binWidth = ((this.stats.max as number) - (this.stats.min as number)) / this.options.binCount;
        let binIndex = Math.floor((value - (this.stats.min as number)) / binWidth);
        if (binIndex >= this.options.binCount) binIndex = this.options.binCount - 1;
        if (binIndex < 0) binIndex = 0;

        // Destaca temporariamente (poderia animar)
        this.hoveredBin = binIndex;
    }

    /**
     * Limpa seleção de bins
     */
    clearSelection(): void {
        this.selectedBins.clear();
        this._updateChart();

        eventBus.emit(Events.HISTOGRAM_FILTER, {
            active: false,
            elementIds: [],
            binRanges: [],
        });
    }

    /**
     * Define bins selecionados
     */
    setSelectedBins(binIndices: Iterable<number>): void {
        this.selectedBins = new Set(binIndices);
        this._updateChart();
    }

    /**
     * Retorna bins selecionados
     */
    getSelectedBins(): number[] {
        return Array.from(this.selectedBins);
    }

    /**
     * Retorna elementos nos bins selecionados
     */
    getSelectedElements(): any[] {
        const elements: any[] = [];
        this.selectedBins.forEach((binIndex: number) => {
            const bin = this.bins[binIndex];
            if (bin) {
                elements.push(...bin.dataPoints);
            }
        });
        return elements;
    }

    /**
     * Retorna estatísticas
     */
    getStats(): HistogramStats {
        return { ...this.stats };
    }

    /**
     * Destrói o histograma
     */
    destroy(): void {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }

        this.container.innerHTML = '';
        eventBus.offAll(Events.DATA_UPDATED);
        eventBus.offAll(Events.ELEMENT_SELECTED);
    }
}

export { DynamicHistogram, DEFAULT_CONFIG as HISTOGRAM_CONFIG };
export default DynamicHistogram;
