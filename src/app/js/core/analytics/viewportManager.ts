// @ts-check
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
 * ecbyts Analytics - Viewport Manager
 * Gerenciador de múltiplos viewports no workspace
 */
import { t } from '../../utils/i18n/translations.js';
import { eventBus, Events } from './eventBus.js';
import { ViewportContainer } from './workspaceContainer.js';
import SlicePlane, { PLANE_CONFIG } from './slicePlane.js';
import DynamicHistogram from './histogram.js';
import { ScatterPlot } from './scatterPlot.js';
import { CrossTabTable } from './crossTab.js';
import { ViolationsTimeline } from './violationsTimeline.js';
import { CalculatorViewport } from './calculatorViewport.js';
const ViewportType = {
    SLICE_XY: 'slice_xy',
    SLICE_XZ: 'slice_xz',
    SLICE_YZ: 'slice_yz',
    HISTOGRAM: 'histogram',
    SCATTER_TIME: 'scatter_time',
    CROSSTAB: 'crosstab',
    VIOLATIONS: 'violations_timeline',
    CALCULATOR: 'calculator',
    RIDGELINE: 'ridgeline',
};
const VIEWPORT_CONFIGS = {
    [ViewportType.SLICE_XY]: { title: t('viewport.plantXY'), icon: 'cube', plane: 'XY' },
    [ViewportType.SLICE_XZ]: { title: t('viewport.transverseProfile'), icon: 'bar-chart', plane: 'XZ' },
    [ViewportType.SLICE_YZ]: { title: t('viewport.longitudinalProfile'), icon: 'bar-chart', plane: 'YZ' },
    [ViewportType.HISTOGRAM]: { title: 'Histograma', icon: 'bar-chart' },
    [ViewportType.SCATTER_TIME]: { title: t('viewport.temporalDispersion'), icon: 'bar-chart' },
    [ViewportType.CROSSTAB]: { title: 'Compliance Matrix', icon: 'shield' },
    [ViewportType.VIOLATIONS]: { title: 'Violations Timeline', icon: 'alert-triangle' },
    [ViewportType.CALCULATOR]: { title: 'Calculator', icon: 'calculator' },
    [ViewportType.RIDGELINE]: { title: t('ridgeline.title') || 'Ridgeline Plot', icon: 'activity' },
};
class ViewportManager {
    calculatorViewport: any;
    crossTab: any;
    emptyOverlay: any;
    histogram: any;
    pinnedContainer: any;
    ridgelineContainer: any;
    scatterPlot: any;
    slicePlanes;
    sliderContainer: any;
    tensor: any;
    viewports;
    violationsTimeline: any;
    workspace;
    /** @param {any} workspaceElement */
    constructor(workspaceElement: any) {
        /** @type {any} */
        this.workspace = workspaceElement;
        /** @type {Map<string, any>} */
        this.viewports = new Map();
        /** @type {Map<string, any>} */
        this.slicePlanes = new Map();
        /** @type {any} */
        this.histogram = null;
        /** @type {any} */
        this.scatterPlot = null;
        /** @type {any} */
        this.tensor = null;
        /** @type {any} */
        this.emptyOverlay = null;
        /** @type {any} */
        this.pinnedContainer = null;
        /** @type {any} */
        this.sliderContainer = null;
        /** @type {any} */
        this.crossTab = null;
        /** @type {any} */
        this.violationsTimeline = null;
        /** @type {any} */
        this.calculatorViewport = null;
        /** @type {any} */
        this.ridgelineContainer = null;
        this._setupWorkspace();
        this._setupEventListeners();
    }
    _setupWorkspace() {
        this.workspace.className = 'analytics-workspace';
        // Empty state overlay - exibido quando nao ha dados
        this.emptyOverlay = document.createElement('div');
        this.emptyOverlay.className = 'analytics-empty-state';
        this.emptyOverlay.innerHTML = `
            <div class="analytics-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 4-6"/></svg></div>
            <div class="analytics-empty-title">${t('analytics.noDataTitle')}</div>
            <div class="analytics-empty-desc">${t('analytics.noDataDesc')}</div>
        `;
        this.workspace.appendChild(this.emptyOverlay);
        this.pinnedContainer = document.createElement('div');
        this.pinnedContainer.className = 'viewport-pinned-container';
        this.workspace.appendChild(this.pinnedContainer);
        this.sliderContainer = document.createElement('div');
        this.sliderContainer.className = 'slice-sliders-container';
        this.workspace.appendChild(this.sliderContainer);
    }
    _setupEventListeners() {
        eventBus.on(Events.DATA_UPDATED, () => this._onDataUpdated());
        eventBus.on(Events.VIEWPORT_STATE_CHANGED, (/** @type {any} */ d) => this._onViewportStateChanged(d));
    }
    initializeDefaultViewports() {
        this.createViewport(ViewportType.SLICE_XY);
        this.createViewport(ViewportType.SLICE_XZ);
        this.createViewport(ViewportType.SLICE_YZ);
        this.createViewport(ViewportType.HISTOGRAM);
        this.createViewport(ViewportType.SCATTER_TIME);
        this.createViewport(ViewportType.CROSSTAB);
        this.createViewport(ViewportType.VIOLATIONS);
        this.createViewport(ViewportType.CALCULATOR);
        this.createViewport(ViewportType.RIDGELINE);
        this._createSliceSliders();
    }
    /** @param {any} type @param {any} [options] */
    createViewport(type: any, options = {}) {
        const config = VIEWPORT_CONFIGS[type];
        if (!config)
            return null;
        const id = `${type}_${Date.now()}`;
        const container = new ViewportContainer(id, { title: config.title, icon: config.icon, ...options });
        container.appendTo(this.pinnedContainer);
        if (type.startsWith('slice_')) {
            this._initSlicePlane(container, config.plane);
        }
        else if (type === ViewportType.HISTOGRAM) {
            this._initHistogram(container);
        }
        else if (type === ViewportType.SCATTER_TIME) {
            this._initScatterPlot(container);
        }
        else if (type === ViewportType.CROSSTAB) {
            this._initCrossTab(container);
        }
        else if (type === ViewportType.VIOLATIONS) {
            this._initViolationsTimeline(container);
        }
        else if (type === ViewportType.CALCULATOR) {
            this._initCalculator(container);
        }
        else if (type === ViewportType.RIDGELINE) {
            this._initRidgeline(container);
        }
        this.viewports.set(id, { type, container, config });
        return container;
    }
    /** @param {any} container @param {any} plane */
    _initSlicePlane(container: any, plane: any) {
        const contentEl = container.getContentElement();
        contentEl.style.padding = '0';
        const slicePlane = new SlicePlane(plane, contentEl);
        this.slicePlanes.set(container.id, slicePlane);
        if (this.tensor) {
            slicePlane.setBounds(this.tensor.getBounds());
            slicePlane.updateData(this.tensor.getAll());
        }
    }
    /** @param {any} container */
    _initHistogram(container: any) {
        const contentEl = container.getContentElement();
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';
        this.histogram = new DynamicHistogram(contentEl);
        if (this.tensor) {
            this.histogram.update(this.tensor.getAll());
        }
    }
    /** @param {any} container */
    _initScatterPlot(container: any) {
        const contentEl = container.getContentElement();
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';
        this.scatterPlot = new ScatterPlot(contentEl);
        if (this.tensor) {
            this.scatterPlot.setTensor(this.tensor);
        }
    }
    /** @param {any} container */
    _initCrossTab(container: any) {
        const contentEl = container.getContentElement();
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';
        this.crossTab = new CrossTabTable(contentEl);
        if (this.tensor) {
            this.crossTab.setTensor(this.tensor);
        }
    }
    /** @param {any} container */
    _initViolationsTimeline(container: any) {
        const contentEl = container.getContentElement();
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';
        this.violationsTimeline = new ViolationsTimeline(contentEl);
        if (this.tensor) {
            this.violationsTimeline.setTensor(this.tensor);
        }
    }
    /** @param {any} container */
    _initCalculator(container: any) {
        const contentEl = container.getContentElement();
        this.calculatorViewport = new CalculatorViewport(contentEl);
        if (this.tensor) {
            this.calculatorViewport.setTensor(this.tensor);
        }
    }
    /** @param {any} container */
    _initRidgeline(container: any) {
        const contentEl = container.getContentElement();
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';
        contentEl.style.alignItems = 'center';
        contentEl.style.justifyContent = 'center';
        contentEl.innerHTML = `
            <div style="padding:24px;text-align:center;color:var(--text-muted, #888);">
                <div style="font-size:32px;margin-bottom:12px;">&#8960;</div>
                <div style="font-size:14px;font-weight:500;">${t('ridgeline.title') || 'Ridgeline Plot'}</div>
                <div style="font-size:12px;margin-top:8px;opacity:.7;">KDE + distribution stats ready</div>
            </div>
        `;
        // TODO: wire ridgeline renderer when SVG/Canvas renderer lands (SPEC_RIDGELINE_PLOT_9_71)
        this.ridgelineContainer = contentEl;
    }
    _createSliceSliders() {
        const sliders = [
            { axis: 'z', label: t('viewport.depthZ'), plane: 'XY', color: PLANE_CONFIG.XY.color },
            { axis: 'y', label: t('viewport.northSouth'), plane: 'XZ', color: PLANE_CONFIG.XZ.color },
            { axis: 'x', label: t('viewport.eastWest'), plane: 'YZ', color: PLANE_CONFIG.YZ.color },
        ];
        sliders.forEach(({ axis, label, plane, color }) => {
            const div = document.createElement('div');
            div.className = 'slice-slider-group';
            div.innerHTML = `
                <label class="slice-slider-label" style="color: ${color}">
                    <span>${label}</span>
                    <span class="slice-slider-value" id="slider-value-${axis}">0</span>
                </label>
                <input data-field-meta="true" data-field-meta-key="auto-tpl:viewportManager:input:L207" type="range" class="slice-slider" id="slice-slider-${axis}"
                       data-axis="${axis}" data-plane="${plane}" min="-100" max="100" value="0" step="1">
            `;
            this.sliderContainer.appendChild(div);
            (div.querySelector(`#slice-slider-${axis}`) as any)?.addEventListener('input', (e: any) => {
                const value = parseFloat(e.target.value);
                const valueEl = div.querySelector(`#slider-value-${axis}`) as any;
                if (valueEl) valueEl.textContent = value.toFixed(1);
                this.setSlicePosition(plane, value);
            });
        });
    }
    _updateSliderBounds() {
        if (!this.tensor)
            return;
        const bounds = this.tensor.getBounds();
        ['x', 'y', 'z'].forEach((axis) => {
            const slider = /** @type {any} */ (this.sliderContainer.querySelector(`#slice-slider-${axis}`));
            if (slider && bounds[axis]) {
                slider.min = bounds[axis].min;
                slider.max = bounds[axis].max;
                slider.value = (bounds[axis].min + bounds[axis].max) / 2;
                const valueEl = /** @type {any} */ (this.sliderContainer.querySelector(`#slider-value-${axis}`));
                if (valueEl)
                    valueEl.textContent = slider.value;
            }
        });
    }
    /** @param {any} plane @param {any} position */
    setSlicePosition(plane: any, position: any) {
        this.slicePlanes.forEach((sp) => {
            if (sp.plane === plane) {
                sp.setPosition(position);
                if (this.tensor)
                    sp.updateData(this.tensor.getAll());
            }
        });
    }
    /** @param {any} tensor */
    setTensor(tensor: any) {
        this.tensor = tensor;
        const bounds = tensor.getBounds();
        const data = tensor.getAll();
        // Mostrar/esconder empty state
        const hasData = data && data.length > 0;
        if (this.emptyOverlay) {
            this.emptyOverlay.style.display = hasData ? 'none' : '';
        }
        this.slicePlanes.forEach((sp) => {
            sp.setBounds(bounds);
            sp.updateData(data);
        });
        if (this.histogram)
            this.histogram.update(data);
        if (this.scatterPlot)
            this.scatterPlot.setTensor(tensor);
        if (this.crossTab)
            this.crossTab.setTensor(tensor);
        if (this.violationsTimeline)
            this.violationsTimeline.setTensor(tensor);
        if (this.calculatorViewport)
            this.calculatorViewport.setTensor(tensor);
        this._updateSliderBounds();
    }
    _onDataUpdated() {
        if (!this.tensor)
            return;
        const data = this.tensor.getAll();
        this.slicePlanes.forEach((sp) => sp.updateData(data));
        if (this.histogram)
            this.histogram.update(data);
        if (this.scatterPlot)
            this.scatterPlot.setTensor(this.tensor);
        if (this.crossTab)
            this.crossTab.setTensor(this.tensor);
        if (this.violationsTimeline)
            this.violationsTimeline.setTensor(this.tensor);
        if (this.calculatorViewport)
            this.calculatorViewport.setTensor(this.tensor);
    }
    /** @param {any} data */
    _onViewportStateChanged(data: any) {
        if (data.action === 'closed') {
            this.viewports.delete(data.id);
            this.slicePlanes.delete(data.id);
        }
    }
    destroy() {
        this.viewports.forEach((v) => v.container.destroy());
        this.viewports.clear();
        this.slicePlanes.clear();
        if (this.histogram) {
            this.histogram.destroy();
            this.histogram = null;
        }
        if (this.scatterPlot) {
            this.scatterPlot.dispose();
            this.scatterPlot = null;
        }
        if (this.crossTab) {
            this.crossTab.destroy();
            this.crossTab = null;
        }
        if (this.violationsTimeline) {
            this.violationsTimeline.destroy();
            this.violationsTimeline = null;
        }
        this.workspace.innerHTML = '';
    }
    /**
     * Reseta o layout recriando todos os viewports padrão.
     * Chamado pelo botão "Resetar" na toolbar do analytics.
     */
    resetLayout() {
        // Limpar viewports existentes
        this.viewports.forEach((v) => v.container.destroy());
        this.viewports.clear();
        this.slicePlanes.clear();
        if (this.histogram) {
            this.histogram.destroy();
            this.histogram = null;
        }
        if (this.scatterPlot) {
            this.scatterPlot.dispose();
            this.scatterPlot = null;
        }
        // Limpar containers
        this.pinnedContainer.innerHTML = '';
        this.sliderContainer.innerHTML = '';
        // Recriar todos os viewports padrão
        this.initializeDefaultViewports();
        // Atualizar dados se tensor existir
        if (this.tensor) {
            this.setTensor(this.tensor);
        }
    }
}
export { ViewportManager, ViewportType, VIEWPORT_CONFIGS };
export default ViewportManager;
//# sourceMappingURL=viewportManager.js.map
