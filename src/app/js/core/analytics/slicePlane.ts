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
 * ecbyts Analytics - Slice Plane
 * Planos de corte ortogonais para projeções 2D
 */

import { eventBus, Events } from './eventBus.js';

/**
 * Configuração dos planos de corte
 */
type SlicePlaneName = 'XY' | 'XZ' | 'YZ';
type SliceAxis = 'x' | 'y' | 'z';
interface SlicePlaneConfig {
    name: string;
    normalAxis: SliceAxis;
    horizontalAxis: SliceAxis;
    verticalAxis: SliceAxis;
    horizontalLabel: string;
    verticalLabel: string;
    color: string;
}
interface AxisBounds {
    min: number;
    max: number;
}
type SliceBounds = Record<SliceAxis, AxisBounds>;
interface SliceDataPoint {
    position: Record<SliceAxis, number>;
    value?: number;
    elementId?: string;
    family?: string;
    parameterId?: string;
}
interface ProjectedPoint {
    x: number;
    y: number;
    value?: number;
    elementId?: string;
    family?: string;
    parameterId?: string;
    dataPoint?: SliceDataPoint;
}
interface SlicePlaneOptions {
    sliceThickness: number;
    padding: number;
    backgroundColor: string;
    gridColor: string;
    pointRadius: number;
    showGrid: boolean;
    showLabels: boolean;
}
const PLANE_CONFIG: Record<SlicePlaneName, SlicePlaneConfig> = {
    XY: {
        name: 'Planta (XY)',
        normalAxis: 'z',
        horizontalAxis: 'x',
        verticalAxis: 'y',
        horizontalLabel: 'X (Easting)',
        verticalLabel: 'Y (Northing)',
        color: '#3b82f6', // Azul
    },
    XZ: {
        name: 'Perfil Transversal (XZ)',
        normalAxis: 'y',
        horizontalAxis: 'x',
        verticalAxis: 'z',
        horizontalLabel: 'X (Easting)',
        verticalLabel: 'Z (Depth)',
        color: '#22c55e', // Verde
    },
    YZ: {
        name: 'Perfil Longitudinal (YZ)',
        normalAxis: 'x',
        horizontalAxis: 'y',
        verticalAxis: 'z',
        horizontalLabel: 'Y (Northing)',
        verticalLabel: 'Z (Depth)',
        color: '#f59e0b', // Laranja
    },
};

/**
 * Classe para plano de corte ortogonal
 */
class SlicePlane {
    resizeObserver: ResizeObserver = null as any;
    width: number = 0;
    height: number = 0;
    plane: SlicePlaneName;
    config: SlicePlaneConfig;
    container: HTMLElement;
    options: SlicePlaneOptions;
    position: number;
    bounds: SliceBounds | null;
    projectedData: ProjectedPoint[];
    selectedPoints: Set<string>;
    hoveredPoint: ProjectedPoint | null;
    scale: { x: number; y: number };
    offset: { x: number; y: number };
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;

    /**
     * @param plane
     * @param container
     * @param options
     */
    constructor(plane: SlicePlaneName, container: HTMLElement, options: Partial<SlicePlaneOptions> = {}) {
        this.plane = plane;
        this.config = PLANE_CONFIG[plane];
        this.container = container;

        // Opções
        this.options = {
            sliceThickness: options.sliceThickness || 5,
            padding: options.padding || 40,
            backgroundColor: options.backgroundColor || '#1e1e1e',
            gridColor: options.gridColor || '#333333',
            pointRadius: options.pointRadius || 4,
            showGrid: options.showGrid !== false,
            showLabels: options.showLabels !== false,
            ...options,
        };

        // Estado
        this.position = 0;
        this.bounds = null;
        this.projectedData = [];
        this.selectedPoints = new Set();
        this.hoveredPoint = null;
        this.scale = { x: 1, y: 1 };
        this.offset = { x: 0, y: 0 };

        // Canvas
        this.canvas = null as any;
        this.ctx = null as any;

        // Inicialização
        this._createCanvas();
        this._setupEventListeners();
    }

    /**
     * Cria o canvas no container
     */
    _createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'slice-plane-canvas';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';

        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;

        this._updateCanvasSize();
    }

    /**
     * Atualiza tamanho do canvas
     */
    _updateCanvasSize() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        this.ctx.scale(dpr, dpr);

        this.width = rect.width;
        this.height = rect.height;
    }

    /**
     * Configura event listeners
     */
    _setupEventListeners() {
        // Resize observer
        this.resizeObserver = new ResizeObserver(() => {
            this._updateCanvasSize();
            this.render();
        });
        this.resizeObserver.observe(this.container);

        // Mouse events
        this.canvas.addEventListener('mousemove', this._onMouseMove.bind(this));
        this.canvas.addEventListener('click', this._onClick.bind(this));
        this.canvas.addEventListener('mouseleave', this._onMouseLeave.bind(this));

        // Event bus
        eventBus.on(Events.SLICE_MOVED, this._onSliceMoved.bind(this) as any);
        eventBus.on(Events.ELEMENTS_FILTERED, this._onElementsFiltered.bind(this) as any);
    }

    /**
     * Define bounds espaciais
     */
    /**
     * @param bounds
     */
    setBounds(bounds: SliceBounds) {
        this.bounds = bounds;
        this._updateScale();
    }

    /**
     * Atualiza escala baseada nos bounds
     */
    _updateScale() {
        if (!this.bounds) return;
        const bounds = this.bounds;

        const { padding } = this.options;
        const drawWidth = this.width - padding * 2;
        const drawHeight = this.height - padding * 2;

        const hAxis = this.config.horizontalAxis;
        const vAxis = this.config.verticalAxis;

        const dataWidth = bounds[hAxis].max - bounds[hAxis].min || 1;
        const dataHeight = bounds[vAxis].max - bounds[vAxis].min || 1;

        // Escala uniforme para manter proporções
        const scaleX = drawWidth / dataWidth;
        const scaleY = drawHeight / dataHeight;
        const scale = Math.min(scaleX, scaleY);

        this.scale = { x: scale, y: scale };

        // Offset para centralizar
        this.offset = {
            x: padding + (drawWidth - dataWidth * scale) / 2,
            y: padding + (drawHeight - dataHeight * scale) / 2,
        };
    }

    /**
     * Define posição do corte
     */
    /**
     * @param position
     */
    setPosition(position: number) {
        this.position = position;
        eventBus.emitDebounced(Events.SLICE_MOVED, {
            plane: this.plane,
            axis: this.config.normalAxis,
            position: this.position,
        });
    }

    /**
     * Atualiza dados projetados
     */
    /**
     * @param dataPoints
     */
    updateData(dataPoints: SliceDataPoint[]) {
        const { normalAxis, horizontalAxis, verticalAxis } = this.config;
        const { sliceThickness } = this.options;
        const halfThickness = sliceThickness / 2;

        // Filtra pontos dentro da fatia
        const filtered = dataPoints.filter((point) => {
            const pos = point.position[normalAxis];
            return pos >= this.position - halfThickness && pos <= this.position + halfThickness;
        });

        // Projeta para 2D
        this.projectedData = filtered.map((point) => ({
            x: point.position[horizontalAxis],
            y: point.position[verticalAxis],
            value: point.value,
            elementId: point.elementId,
            family: point.family,
            parameterId: point.parameterId,
            dataPoint: point,
        })) as ProjectedPoint[];

        this.render();
    }

    /**
     * Converte coordenadas de dados para canvas
     */
    /**
     * @param x
     * @param y
     */
    _dataToCanvas(x: number, y: number): { x: number; y: number } {
        const bounds = this.bounds;
        if (!bounds) return { x: 0, y: 0 };
        const { horizontalAxis, verticalAxis } = this.config;

        // Inverte Y se for profundidade (z geralmente é negativo para baixo)
        const invertY = verticalAxis === 'z';

        const canvasX = this.offset.x + (x - bounds[horizontalAxis].min) * this.scale.x;
        let canvasY;

        if (invertY) {
            canvasY = this.offset.y + (bounds[verticalAxis].max - y) * this.scale.y;
        } else {
            canvasY = this.offset.y + (y - bounds[verticalAxis].min) * this.scale.y;
        }

        return { x: canvasX, y: canvasY };
    }

    /**
     * Converte coordenadas de canvas para dados
     */
    /**
     * @param canvasX
     * @param canvasY
     */
    _canvasToData(canvasX: number, canvasY: number): { x: number; y: number } {
        const bounds = this.bounds;
        if (!bounds) return { x: 0, y: 0 };
        const { horizontalAxis, verticalAxis } = this.config;
        const invertY = verticalAxis === 'z';

        const x = (canvasX - this.offset.x) / this.scale.x + bounds[horizontalAxis].min;
        let y;

        if (invertY) {
            y = bounds[verticalAxis].max - (canvasY - this.offset.y) / this.scale.y;
        } else {
            y = (canvasY - this.offset.y) / this.scale.y + bounds[verticalAxis].min;
        }

        return { x, y };
    }

    /**
     * Renderiza o plano de corte
     */
    render() {
        if (!this.ctx || !this.bounds) return;

        const { ctx, width, height } = this;
        const { backgroundColor } = this.options;

        // Limpa canvas
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        // Desenha grid
        if (this.options.showGrid) {
            this._drawGrid();
        }

        // Desenha eixos e labels
        if (this.options.showLabels) {
            this._drawAxes();
        }

        // Desenha pontos
        this._drawPoints();

        // Desenha linha do cursor de corte (para outros planos)
        this._drawSliceCursor();

        // Desenha ponto hover
        if (this.hoveredPoint) {
            this._drawHoveredPoint();
        }
    }

    /**
     * Desenha grid de referência
     */
    _drawGrid() {
        const bounds = this.bounds;
        if (!bounds) return;
        const { ctx } = this;
        const { padding, gridColor } = this.options;
        const { horizontalAxis, verticalAxis } = this.config;

        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 0.5;

        // Calcula espaçamento do grid
        const hRange = bounds[horizontalAxis].max - bounds[horizontalAxis].min;
        const vRange = bounds[verticalAxis].max - bounds[verticalAxis].min;

        const hStep = this._calculateGridStep(hRange);
        const vStep = this._calculateGridStep(vRange);

        // Linhas verticais
        let x = Math.ceil(bounds[horizontalAxis].min / hStep) * hStep;
        while (x <= bounds[horizontalAxis].max) {
            const canvasPos = this._dataToCanvas(x, 0);
            ctx.beginPath();
            ctx.moveTo(canvasPos.x, padding);
            ctx.lineTo(canvasPos.x, this.height - padding);
            ctx.stroke();
            x += hStep;
        }

        // Linhas horizontais
        let y = Math.ceil(bounds[verticalAxis].min / vStep) * vStep;
        while (y <= bounds[verticalAxis].max) {
            const canvasPos = this._dataToCanvas(0, y);
            ctx.beginPath();
            ctx.moveTo(padding, canvasPos.y);
            ctx.lineTo(this.width - padding, canvasPos.y);
            ctx.stroke();
            y += vStep;
        }
    }

    /**
     * Calcula passo do grid
     */
    /**
     * @param range
     */
    _calculateGridStep(range: number): number {
        const targetLines = 8;
        const rawStep = range / targetLines;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const normalized = rawStep / magnitude;

        if (normalized < 1.5) return magnitude;
        if (normalized < 3) return 2 * magnitude;
        if (normalized < 7) return 5 * magnitude;
        return 10 * magnitude;
    }

    /**
     * Desenha eixos e labels
     */
    _drawAxes() {
        const { ctx, width, height } = this;
        const { padding } = this.options;
        const { horizontalLabel, verticalLabel, color } = this.config;

        ctx.fillStyle = '#888888';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';

        // Label horizontal
        ctx.fillText(horizontalLabel, width / 2, height - 8);

        // Label vertical
        ctx.save();
        ctx.translate(12, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(verticalLabel, 0, 0);
        ctx.restore();

        // Título do plano
        ctx.fillStyle = color;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(this.config.name, padding, 20);

        // Posição do corte
        ctx.fillStyle = '#666666';
        ctx.font = '10px sans-serif';
        ctx.fillText(`${this.config.normalAxis.toUpperCase()} = ${this.position.toFixed(1)}`, padding, 34);
    }

    /**
     * Desenha pontos projetados
     */
    _drawPoints() {
        const { ctx } = this;
        const { pointRadius } = this.options;

        this.projectedData.forEach((point) => {
            const canvasPos = this._dataToCanvas(point.x, point.y);
            const isSelected = this.selectedPoints.has(point.elementId || '');

            // Cor baseada na família ou valor
            const color = this._getPointColor(point);

            ctx.beginPath();
            ctx.arc(canvasPos.x, canvasPos.y, isSelected ? pointRadius + 2 : pointRadius, 0, Math.PI * 2);

            ctx.fillStyle = color;
            ctx.fill();

            if (isSelected) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        });
    }

    /**
     * Retorna cor do ponto baseada na família
     */
    /**
     * @param point
     */
    _getPointColor(point: ProjectedPoint): string {
        const familyColors: Record<string, string> = {
            plume: '#ff6b6b',
            well: '#4dabf7',
            marker: '#3b82f6',
            sample: '#22c55e',
            default: '#888888',
        };

        return familyColors[point.family || 'default'] || familyColors.default!;
    }

    /**
     * Desenha cursores de corte de outros planos
     */
    _drawSliceCursor() {
        // Implementação para mostrar onde outros planos cortam este
    }

    /**
     * Desenha ponto sob hover
     */
    _drawHoveredPoint() {
        const { ctx } = this;
        const { pointRadius } = this.options;
        const point = this.hoveredPoint;
        if (!point) return;

        const canvasPos = this._dataToCanvas(point.x, point.y);

        // Círculo de destaque
        ctx.beginPath();
        ctx.arc(canvasPos.x, canvasPos.y, pointRadius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Tooltip
        const tooltipText = `${point.parameterId}: ${point.value?.toFixed(2) || 'N/A'}`;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.font = '11px sans-serif';

        const textWidth = ctx.measureText(tooltipText).width;
        const tooltipX = canvasPos.x - textWidth / 2 - 4;
        const tooltipY = canvasPos.y - pointRadius - 20;

        ctx.fillRect(tooltipX, tooltipY, textWidth + 8, 18);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(tooltipText, canvasPos.x, tooltipY + 13);
    }

    /**
     * Handler de mouse move
     */
    /**
     * @param event
     */
    _onMouseMove(event: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Encontra ponto mais próximo
        let closest: ProjectedPoint | null = null;
        let minDist = Infinity;

        for (const point of this.projectedData) {
            const canvasPos = this._dataToCanvas(point.x, point.y);
            const dist = Math.sqrt(Math.pow(canvasPos.x - x, 2) + Math.pow(canvasPos.y - y, 2));

            if (dist < 15 && dist < minDist) {
                minDist = dist;
                closest = point;
            }
        }

        if (closest !== this.hoveredPoint) {
            this.hoveredPoint = closest;
            this.render();

            if (closest) {
                eventBus.emit(Events.ELEMENT_HIGHLIGHTED, {
                    elementId: closest.elementId || null,
                    source: this.plane,
                });
            }
        }
    }

    /**
     * Handler de click
     */
    /**
     * @param _event
     */
    _onClick(_event: MouseEvent) {
        if (this.hoveredPoint) {
            const elementId = this.hoveredPoint.elementId;
            if (!elementId) return;

            if (this.selectedPoints.has(elementId)) {
                this.selectedPoints.delete(elementId);
            } else {
                this.selectedPoints.add(elementId);
            }

            eventBus.emit(Events.ELEMENT_SELECTED, {
                elementId,
                selected: this.selectedPoints.has(elementId),
                source: this.plane,
            });

            this.render();
        }
    }

    /**
     * Handler de mouse leave
     */
    _onMouseLeave() {
        this.hoveredPoint = null;
        this.render();
    }

    /**
     * Handler de slice moved de outros planos
     */
    /**
     * @param data
     */
    _onSliceMoved(data: { plane: SlicePlaneName }) {
        if (data.plane !== this.plane) {
            // Pode desenhar linha de referência
            this.render();
        }
    }

    /**
     * Handler de elementos filtrados
     */
    /**
     * @param data
     */
    _onElementsFiltered(data: { elementIds: string[] }) {
        this.selectedPoints = new Set(data.elementIds);
        this.render();
    }

    /**
     * Define pontos selecionados
     */
    /**
     * @param elementIds
     */
    setSelectedPoints(elementIds: string[]) {
        this.selectedPoints = new Set(elementIds);
        this.render();
    }

    /**
     * Limpa seleção
     */
    clearSelection() {
        this.selectedPoints.clear();
        this.render();
    }

    /**
     * Destrói o plano
     */
    destroy() {
        this.resizeObserver.disconnect();
        this.canvas.remove();
        eventBus.off(Events.SLICE_MOVED, this._onSliceMoved as any);
        eventBus.off(Events.ELEMENTS_FILTERED, this._onElementsFiltered as any);
    }
}

export { SlicePlane, PLANE_CONFIG };
export default SlicePlane;
