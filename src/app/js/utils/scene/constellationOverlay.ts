// @ts-check
// Generated from src/app/js/utils/scene/constellationOverlay.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   CONSTELLATION OVERLAY — Transparent graph layer on 3D viewer
   SPEC_CONSTELLATION_HUD_9_75 §Q7.3

   Renderiza o grafo de constelação como overlay semi-transparente
   sobre o canvas 3D principal. Reutiliza ConstellationWebGLRenderer
   com fundo transparente e modo de câmera screen-space.

   - Sincroniza seleção com o viewer 3D
   - Toggle visibility sem destruir a cena 3D
   - Canvas overlay com pointer-events controlados
   ================================================================ */
import { ConstellationWebGLRenderer } from './constellationWebGL.js';
import { getSelectedElement } from '../../core/elements/manager.js';
import { Z_INDEX } from '../ui/zIndex.js';
/** @type {any} */
let _overlayInstance: any = null;
/**
 * Cria overlay de constelação sobre o container do viewer 3D.
 * @param {HTMLElement} viewerContainer - ex: document.getElementById('canvas-container')
 * @param {Object} [options]
 * @returns {ConstellationOverlay}
 */
export function createConstellationOverlay(viewerContainer: any, options: any = {}) {
    if (_overlayInstance) {
        _overlayInstance.destroy();
    }
    _overlayInstance = new ConstellationOverlay(viewerContainer, options);
    return _overlayInstance;
}
/**
 * Retorna instância ativa do overlay (ou null).
 * @returns {ConstellationOverlay|null}
 */
export function getConstellationOverlay() {
    return _overlayInstance;
}
class ConstellationOverlay {
    viewerContainer: any;
    options: any;
    overlayEl: any;
    renderer: any;
    _visible: any;
    _syncListener: any;
    constructor(viewerContainer: any, options: any = {}) {
        this.viewerContainer = viewerContainer;
        this.options = {
            onNodeClick: null,
            onNodeDoubleClick: null,
            ...options,
        };
        // Cria div overlay absoluto sobre o viewer
        this.overlayEl = document.createElement('div');
        this.overlayEl.className = 'constellation-overlay';
        this.overlayEl.style.position = 'absolute';
        this.overlayEl.style.top = '0';
        this.overlayEl.style.left = '0';
        this.overlayEl.style.width = '100%';
        this.overlayEl.style.height = '100%';
        this.overlayEl.style.pointerEvents = 'none'; // viewer recebe eventos por padrão
        this.overlayEl.style.zIndex = String(Z_INDEX.OVERLAY_CONSTELLATION);
        this.viewerContainer.style.position = 'relative';
        this.viewerContainer.appendChild(this.overlayEl);
        // WebGL renderer dedicado para o overlay
        this.renderer = new ConstellationWebGLRenderer(this.overlayEl, {
            mode: '2d',
            backgroundColor: null, // transparente
            onNodeClick: (nodeId: any, node: any) => {
                this._syncSelectionToViewer(nodeId);
                if (typeof this.options.onNodeClick === 'function') {
                    /** @type {any} */ (this.options.onNodeClick)(nodeId, node);
                }
            },
            onNodeDoubleClick: (nodeId: any, node: any) => {
                this._syncSelectionToViewer(nodeId);
                if (typeof this.options.onNodeDoubleClick === 'function') {
                    /** @type {any} */ (this.options.onNodeDoubleClick)(nodeId, node);
                }
            },
        });
        // Quando overlay está ativo, habilita pointer-events no canvas
        // para interagir com o grafo; o viewer fica embaixo
        this.renderer.renderer.domElement.style.pointerEvents = 'auto';
        this._visible = true;
        this._syncListener = null;
        this._installSync();
    }
    // ----------------------------------------------------------------
    // SYNC
    // ----------------------------------------------------------------
    _installSync() {
        // Escuta mudança de seleção no viewer 3D
        const handler = () => {
            const el = getSelectedElement();
            if (el && this._visible) {
                this.renderer.focusNode(el.id);
            }
        };
        window.addEventListener('elementSelected', handler);
        this._syncListener = () => window.removeEventListener('elementSelected', handler);
    }
    _syncSelectionToViewer(nodeId: any) {
        // Dispara evento para que o viewer 3D possa reagir
        if (typeof window !== 'undefined') {
            window.dispatchEvent(
                new CustomEvent('constellationNodeSelected', {
                    detail: { nodeId },
                }),
            );
        }
        // Se o elemento existe no manager, foca nele (lazy import)
        import('../../core/elements/manager.js' as string)
            .then((m: any) => {
                if (typeof m.selectElementById === 'function') {
                    m.selectElementById(nodeId);
                }
            })
            .catch((e: any) => console.debug('[constellation:overlay]', e?.message || e));
    }
    // ----------------------------------------------------------------
    // API
    // ----------------------------------------------------------------
    /**
     * Atualiza o grafo do overlay.
     * @param {Array<Object>} nodes
     * @param {Array<Object>} lines
     */
    setGraph(nodes: any, lines: any) {
        if (!this.renderer) return;
        this.renderer.setLayout(nodes, lines);
    }
    /**
     * Mostra overlay.
     */
    show() {
        if (!this.overlayEl) return;
        this.overlayEl.style.display = 'block';
        this._visible = true;
        if (this.renderer) this.renderer.requestRender();
    }
    /**
     * Esconde overlay (não destrói).
     */
    hide() {
        if (!this.overlayEl) return;
        this.overlayEl.style.display = 'none';
        this._visible = false;
    }
    /**
     * Verifica se está visível.
     * @returns {boolean}
     */
    isVisible() {
        return this._visible;
    }
    /**
     * Toggle visibilidade.
     */
    toggle() {
        if (this._visible) this.hide();
        else this.show();
    }
    /**
     * Foca nó no overlay.
     * @param {string} nodeId
     */
    focusNode(nodeId: any) {
        if (this.renderer) this.renderer.focusNode(nodeId);
    }
    /**
     * Ajusta tamanho ao container.
     */
    resize() {
        if (!this.renderer || !this.viewerContainer) return;
        const w = this.viewerContainer.clientWidth;
        const h = this.viewerContainer.clientHeight;
        this.renderer.resize(w, h);
    }
    // ----------------------------------------------------------------
    // DESTROY
    // ----------------------------------------------------------------
    destroy() {
        if (this._syncListener) {
            this._syncListener();
            this._syncListener = null;
        }
        if (this.renderer) {
            this.renderer.destroy();
            this.renderer = null;
        }
        if (this.overlayEl) {
            this.overlayEl.remove();
            (this as any).overlayEl = null;
        }
        if (_overlayInstance === this) {
            _overlayInstance = null;
        }
    }
}
