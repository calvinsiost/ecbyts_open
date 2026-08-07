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
// @ts-check
/**
 * ecbyts Analytics Module
 * Entry point e inicialização do módulo de analytics
 */
// Core exports
export { eventBus, Events, AnalyticsEventBus } from './eventBus.js';
export { DataTensor, DataPoint } from './dataTensor.js';
export { Aggregators, Groupers, query, QueryBuilder, BIUtils } from './biLayer.js';
export { SlicePlane, PLANE_CONFIG } from './slicePlane.js';
export { DynamicHistogram, HISTOGRAM_CONFIG } from './histogram.js';
export { ViewportContainer, ContainerState } from './workspaceContainer.js';
export { ViewportManager, ViewportType, VIEWPORT_CONFIGS } from './viewportManager.js';
export { SyncManager, getSyncManager } from './sync.js';
export { initLifecycleMetrics, getLifecycleMetrics } from './lifecycleMetrics.js';
export { statsDistribution, silvermanBandwidth, kde, findModes, modalityClass, normalize, orderSeries, getColorByMedian, } from './ridgeline.js';
export * from './spatialAutocorrelation.js';
export * from './temporalTrends.js';
export * from './ucl95.js';
export * from './waterQualityIndex.js';
export * from './variogramFitting.js';
export * from './extremeValueAnalysis.js';
export * from './probabilityDistributions.js';
export * from './massBalance.js';
export * from './hydrogeochemistry.js';
// Imports internos para inicialização
import { eventBus, Events } from './eventBus.js';
import { DataTensor } from './dataTensor.js';
import { ViewportManager } from './viewportManager.js';
import { getSyncManager } from './sync.js';
import { initLifecycleMetrics } from './lifecycleMetrics.js';
/**
 * Classe principal do módulo ecbyts Analytics
 */
class ecbytsAnalytics {
    tensor: any;
    viewportManager: any;
    syncManager: any;
    container: any;
    initialized: boolean;
    constructor() {
        this.tensor = null;
        this.viewportManager = null;
        this.syncManager = null;
        this.container = null;
        this.initialized = false;
    }
    /**
     * Inicializa o módulo de analytics
     * @param {HTMLElement} container - Container para o workspace
     * @param {Object} options - Opções de configuração
     */
    initialize(container: any, options: any = {}) {
        const _opts: any = options;
        if (this.initialized) {
            console.warn('ecbyts Analytics already initialized');
            return;
        }
        this.container = container;
        // Inicializa tensor vazio
        this.tensor = new DataTensor();
        // Subscribers de telemetria operacional (workflow/pipeline)
        initLifecycleMetrics();
        // Inicializa viewport manager
        this.viewportManager = new ViewportManager(container);
        this.viewportManager.initializeDefaultViewports();
        // Inicializa sync manager
        this.syncManager = getSyncManager(_opts.sync);
        this.syncManager.setComponents({
            tensor: this.tensor,
            viewportManager: this.viewportManager,
            scene3D: _opts.scene3D || null,
        });
        this.initialized = true;
        return this;
    }
    /**
     * Carrega dados de elementos
     * @param {Array<any>} elements - Array de elementos do manager
     */
    loadData(elements: any) {
        if (!this.initialized) {
            console.error('ecbyts Analytics not initialized');
            return;
        }
        // Atualiza tensor
        this.tensor = DataTensor.fromElements(elements);
        // Atualiza componentes
        if (!this.viewportManager || !this.syncManager) {
            console.error('ecbyts Analytics components not initialized');
            return;
        }
        this.viewportManager.setTensor(this.tensor);
        this.syncManager.setComponents({ tensor: this.tensor });
        // Emite evento de dados atualizados
        eventBus.emit(Events.DATA_UPDATED, {
            size: this.tensor.size(),
            bounds: this.tensor.getBounds(),
        });
    }
    /**
     * Conecta com a cena 3D
     * @param {Object} scene3D - Objeto da cena 3D
     */
    connectScene3D(scene3D: any) {
        if (this.syncManager) {
            this.syncManager.setComponents({ scene3D });
        }
    }
    /**
     * Retorna o tensor de dados
     */
    getTensor() {
        return this.tensor;
    }
    /**
     * Retorna o viewport manager
     */
    getViewportManager() {
        return this.viewportManager;
    }
    /**
     * Retorna o sync manager
     */
    getSyncManager() {
        return this.syncManager;
    }
    /**
     * Retorna o event bus
     */
    getEventBus() {
        return eventBus;
    }
    /**
     * Ativa/desativa modo debug
     * @param {any} enabled
     */
    setDebugMode(enabled: any) {
        eventBus.setDebugMode(enabled);
    }
    /**
     * Limpa seleções e filtros
     */
    clearSelection() {
        if (this.syncManager) {
            this.syncManager.clearSelection();
        }
    }
    /**
     * Destrói o módulo
     */
    destroy() {
        if (this.viewportManager) {
            this.viewportManager.destroy();
            this.viewportManager = null;
        }
        if (this.syncManager) {
            this.syncManager.destroy();
            this.syncManager = null;
        }
        this.tensor = null;
        this.container = null;
        this.initialized = false;
    }
}
// Instância singleton
/** @type {any} */
let analyticsInstance: any = null;
/**
 * Retorna instância do ecbyts Analytics
 */
export function getAnalytics() {
    if (!analyticsInstance) {
        analyticsInstance = new ecbytsAnalytics();
    }
    return analyticsInstance;
}
/**
 * Inicializa o módulo de analytics (atalho)
 * @param {any} container
 * @param {any} options
 */
export function initAnalytics(container: any, options: any) {
    return getAnalytics().initialize(container, options);
}
export { ecbytsAnalytics };
export default ecbytsAnalytics;
//# sourceMappingURL=index.js.map
