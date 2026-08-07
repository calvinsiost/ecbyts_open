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
 * ecbyts Analytics - Synchronization Layer
 * Lógica de sincronização entre viewports e cena 3D
 */

import { eventBus, Events } from './eventBus.js';

/**
 * Gerenciador de sincronização entre componentes
 */
class SyncManager {
    options: any;
    tensor: any;
    viewportManager: any;
    scene3D: any;
    selectedElements: Set<any>;
    filteredElements: Set<any>;
    highlightedElement: any;

    constructor(options: any = {}) {
        this.options = {
            debounceDelay: options.debounceDelay || 50,
            syncEnabled: options.syncEnabled !== false,
            ...options,
        };

        // Referências aos componentes
        this.tensor = null;
        this.viewportManager = null;
        this.scene3D = null;

        // Estado de sincronização
        this.selectedElements = new Set();
        this.filteredElements = new Set();
        this.highlightedElement = null;

        // Inicializa handlers
        this._setupEventHandlers();
    }

    /**
     * Configura handlers de eventos
     */
    _setupEventHandlers(): void {
        // Filtro do histograma → Renderização 3D seletiva
        eventBus.on(Events.HISTOGRAM_FILTER, this._onHistogramFilter.bind(this));

        // Corte no plano → Atualização do histograma e outros planos
        eventBus.on(Events.SLICE_MOVED, this._onSliceMoved.bind(this));

        // Seleção de elemento → Foco em todos os viewports
        eventBus.on(Events.ELEMENT_SELECTED, this._onElementSelected.bind(this));

        // Highlight de elemento → Feedback visual
        eventBus.on(Events.ELEMENT_HIGHLIGHTED, this._onElementHighlighted.bind(this));

        // Elementos filtrados → Sincroniza com 3D
        eventBus.on(Events.ELEMENTS_FILTERED, this._onElementsFiltered.bind(this));

        // Dados atualizados → Propaga para todos
        eventBus.on(Events.DATA_UPDATED, this._onDataUpdated.bind(this));
    }

    /**
     * Define referências aos componentes
     */
    setComponents(components: any): void {
        if (components.tensor) this.tensor = components.tensor;
        if (components.viewportManager) this.viewportManager = components.viewportManager;
        if (components.scene3D) this.scene3D = components.scene3D;
    }

    /**
     * Handler: Filtro do histograma aplicado
     */
    _onHistogramFilter(data: any): void {
        if (!this.options.syncEnabled) return;

        const { active, elementIds, _binRanges } = data;

        if (!active) {
            // Limpa filtro - mostra todos os elementos
            this.filteredElements.clear();
            this._updateScene3DVisibility(null); // null = mostrar todos
            return;
        }

        // Atualiza conjunto de elementos filtrados
        this.filteredElements = new Set(elementIds);

        // Atualiza visibilidade na cena 3D
        this._updateScene3DVisibility(elementIds);

        // Atualiza planos de corte
        if (this.viewportManager) {
            this.viewportManager.slicePlanes.forEach((sp: any) => {
                sp.setSelectedPoints(elementIds);
            });
        }
    }

    /**
     * Handler: Posição do corte alterada
     */
    _onSliceMoved(data: any): void {
        if (!this.options.syncEnabled) return;

        const { plane, axis, position } = data;

        // Atualiza cursor de corte em outros planos
        if (this.viewportManager) {
            this.viewportManager.slicePlanes.forEach((sp: any) => {
                if (sp.plane !== plane) {
                    // Poderia desenhar linha de referência
                }
            });
        }

        // Atualiza plano de corte na cena 3D (se implementado)
        this._updateScene3DSlicePlane(axis, position);
    }

    /**
     * Handler: Elemento selecionado
     */
    _onElementSelected(data: any): void {
        if (!this.options.syncEnabled) return;

        const { elementId, selected, _source } = data;

        if (selected) {
            this.selectedElements.add(elementId);
        } else {
            this.selectedElements.delete(elementId);
        }

        // Atualiza destaque na cena 3D
        this._updateScene3DSelection(elementId, selected);

        // Foca viewports no elemento
        if (selected && this.tensor) {
            const dataPoints = this.tensor.byElement(elementId);
            if (dataPoints.length > 0) {
                const position = dataPoints[0].position;

                // Atualiza posição dos cortes para focar no elemento
                if (this.viewportManager) {
                    this.viewportManager.setSlicePosition('XY', position.z);
                    this.viewportManager.setSlicePosition('XZ', position.y);
                    this.viewportManager.setSlicePosition('YZ', position.x);
                }

                // Destaca no histograma
                if (this.viewportManager?.histogram) {
                    this.viewportManager.histogram.highlight(dataPoints[0].value);
                }
            }
        }
    }

    /**
     * Handler: Elemento destacado (hover)
     */
    _onElementHighlighted(data: any): void {
        if (!this.options.syncEnabled) return;

        const { elementId, _source } = data;
        this.highlightedElement = elementId;

        // Destaca temporariamente na cena 3D
        this._updateScene3DHighlight(elementId);
    }

    /**
     * Handler: Conjunto de elementos filtrados
     */
    _onElementsFiltered(data: any): void {
        if (!this.options.syncEnabled) return;

        const { elementIds, _source } = data;

        this.filteredElements = new Set(elementIds);

        // Propaga para cena 3D
        this._updateScene3DVisibility(elementIds);

        // Propaga para planos de corte (exceto a origem)
        if (this.viewportManager) {
            this.viewportManager.slicePlanes.forEach((sp: any) => {
                sp.setSelectedPoints(elementIds);
            });
        }
    }

    /**
     * Handler: Dados do tensor atualizados
     */
    _onDataUpdated(_data: any): void {
        // Limpa estados de seleção
        this.selectedElements.clear();
        this.filteredElements.clear();
        this.highlightedElement = null;

        // Reseta cena 3D
        this._updateScene3DVisibility(null);
    }

    /**
     * Atualiza visibilidade de elementos na cena 3D
     */
    _updateScene3DVisibility(elementIds: any): void {
        if (!this.scene3D) return;

        // Se scene3D tem método de highlight/visibility
        if (typeof this.scene3D.setElementsVisibility === 'function') {
            this.scene3D.setElementsVisibility(elementIds);
        }

        // Ou se usa opacity
        if (typeof this.scene3D.setElementsOpacity === 'function') {
            if (elementIds === null) {
                this.scene3D.setElementsOpacity(null, 1.0); // Todos visíveis
            } else {
                this.scene3D.setElementsOpacity(elementIds, 1.0, 0.1); // Selecionados vs outros
            }
        }
    }

    /**
     * Atualiza seleção na cena 3D
     */
    _updateScene3DSelection(elementId: any, selected: any): void {
        if (!this.scene3D) return;

        if (typeof this.scene3D.selectElement === 'function') {
            this.scene3D.selectElement(elementId, selected);
        }
    }

    /**
     * Atualiza highlight temporário na cena 3D
     */
    _updateScene3DHighlight(elementId: any): void {
        if (!this.scene3D) return;

        if (typeof this.scene3D.highlightElement === 'function') {
            this.scene3D.highlightElement(elementId);
        }
    }

    /**
     * Atualiza plano de corte visual na cena 3D
     */
    _updateScene3DSlicePlane(axis: any, position: any): void {
        if (!this.scene3D) return;

        if (typeof this.scene3D.setSlicePlane === 'function') {
            this.scene3D.setSlicePlane(axis, position);
        }
    }

    /**
     * Ativa/desativa sincronização
     */
    setSyncEnabled(enabled: any): void {
        this.options.syncEnabled = enabled;
    }

    /**
     * Retorna estado de sincronização
     */
    isSyncEnabled(): any {
        return this.options.syncEnabled;
    }

    /**
     * Retorna elementos selecionados
     */
    getSelectedElements(): any[] {
        return Array.from(this.selectedElements);
    }

    /**
     * Retorna elementos filtrados
     */
    getFilteredElements(): any[] {
        return Array.from(this.filteredElements);
    }

    /**
     * Limpa todas as seleções
     */
    clearSelection(): void {
        this.selectedElements.clear();
        this.filteredElements.clear();
        this.highlightedElement = null;

        eventBus.emit(Events.ELEMENTS_FILTERED, {
            elementIds: [],
            source: 'sync',
        });

        this._updateScene3DVisibility(null);
    }

    /**
     * Seleciona elementos programaticamente
     */
    selectElements(elementIds: any): void {
        this.selectedElements = new Set(elementIds);

        eventBus.emit(Events.ELEMENTS_FILTERED, {
            elementIds,
            source: 'sync',
        });
    }

    /**
     * Destrói o sync manager
     */
    destroy(): void {
        eventBus.offAll(Events.HISTOGRAM_FILTER);
        eventBus.offAll(Events.SLICE_MOVED);
        eventBus.offAll(Events.ELEMENT_SELECTED);
        eventBus.offAll(Events.ELEMENT_HIGHLIGHTED);
        eventBus.offAll(Events.ELEMENTS_FILTERED);
        eventBus.offAll(Events.DATA_UPDATED);

        this.tensor = null;
        this.viewportManager = null;
        this.scene3D = null;
    }
}

// Instância singleton
let syncManagerInstance: any = null;

/**
 * Retorna instância do SyncManager
 */
export function getSyncManager(options: any): any {
    if (!syncManagerInstance) {
        syncManagerInstance = new SyncManager(options);
    }
    return syncManagerInstance;
}

export { SyncManager };
export default SyncManager;
