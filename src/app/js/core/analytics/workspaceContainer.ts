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
 * ecbyts Analytics - Workspace Container
 * Sistema de containers modulares com estados pin/unpin
 */
import { getIcon } from '../../utils/ui/icons.js';

import { eventBus, Events } from './eventBus.js';

/**
 * Estados possíveis do container
 */
const ContainerState = {
    PINNED: 'pinned',
    FLOATING: 'floating',
    MINIMIZED: 'minimized',
};

/**
 * Classe para container de viewport modular
 */
class ViewportContainer {
    _dragOffset: any;
    _isDragging: any;
    _isResizing: any;
    _resizeStartPos: any;
    _resizeStartSize: any;
    config: any;
    contentElement: any;
    element: any;
    headerElement: any;
    id: any;
    position: any;
    resizeHandle: any;
    size: any;
    state: any;
    zIndex: any;
    /**
     * @param {string} id
     * @param {any} [config]
     */
    constructor(id: any, config = {}) {
        this.id = id;

        // Configuração
        /** @type {any} */
        this.config = {
title: (config as any).title || 'Viewport',
icon: (config as any).icon || '',
minWidth: (config as any).minWidth || 200,
minHeight: (config as any).minHeight || 150,
initialWidth: (config as any).initialWidth || 300,
initialHeight: (config as any).initialHeight || 250,
resizable: (config as any).resizable !== false,
closable: (config as any).closable !== false,
            ...config,
        };

        // Estado
        this.state = ContainerState.PINNED;
        this.position = { x: 100, y: 100 };
        this.size = {
            width: this.config.initialWidth,
            height: this.config.initialHeight,
        };
        this.zIndex = 1;

        // DOM elements
        /** @type {any} */
        this.element = null;
        /** @type {any} */
        this.headerElement = null;
        /** @type {any} */
        this.contentElement = null;

        // Drag state
        this._isDragging = false;
        this._dragOffset = { x: 0, y: 0 };

        // Resize state
        this._isResizing = false;
        this._resizeStartSize = { width: 0, height: 0 };
        this._resizeStartPos = { x: 0, y: 0 };

        // Inicialização
        this._createElement();
    }

    /**
     * Cria elemento DOM do container
     */
    _createElement() {
        this.element = document.createElement('div');
        this.element.className = 'viewport-container';
        this.element.id = `viewport-${this.id}`;
        this.element.setAttribute('data-state', this.state);

        // Header
        this.headerElement = document.createElement('div');
        this.headerElement.className = 'viewport-header';
        this.headerElement.innerHTML = `
            <div class="viewport-title">
                ${this.config.icon ? `<span class="viewport-icon">${getIcon(this.config.icon, { size: '14px' })}</span>` : ''}
                <span class="viewport-title-text">${this.config.title}</span>
            </div>
            <div class="viewport-controls">
                <button class="viewport-btn viewport-pin" title="Pin/Unpin">${getIcon('map-pin', { size: '12px' })}</button>
                <button class="viewport-btn viewport-minimize" title="Minimizar">${getIcon('minus', { size: '12px' })}</button>
                ${this.config.closable ? `<button class="viewport-btn viewport-close" title="Fechar">${getIcon('x', { size: '12px' })}</button>` : ''}
            </div>
        `;
        this.element.appendChild(this.headerElement);

        // Content
        this.contentElement = document.createElement('div');
        this.contentElement.className = 'viewport-content';
        this.element.appendChild(this.contentElement);

        // Resize handle (para estado floating)
        if (this.config.resizable) {
            this.resizeHandle = document.createElement('div');
            this.resizeHandle.className = 'viewport-resize-handle';
            this.element.appendChild(this.resizeHandle);
        }

        // Setup event listeners
        this._setupEventListeners();
    }

    /**
     * Configura event listeners
     */
    _setupEventListeners() {
        // Botões de controle
        const pinBtn = /** @type {any} */ (this.headerElement.querySelector('.viewport-pin'));
        const minBtn = /** @type {any} */ (this.headerElement.querySelector('.viewport-minimize'));
        const closeBtn = /** @type {any} */ (this.headerElement.querySelector('.viewport-close'));

        if (pinBtn) pinBtn.addEventListener('click', () => this.togglePin());
        if (minBtn) minBtn.addEventListener('click', () => this.toggleMinimize());

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Drag (apenas no modo floating)
        this.headerElement.addEventListener('mousedown', this._onDragStart.bind(this));

        // Resize
        if (this.resizeHandle) {
            this.resizeHandle.addEventListener('mousedown', this._onResizeStart.bind(this));
        }

        // Focus ao clicar
        this.element.addEventListener('mousedown', () => this.bringToFront());
    }

    /**
     * Retorna elemento de conteúdo
     */
    getContentElement() {
        return this.contentElement;
    }

    /**
     * Define conteúdo do container
     */
    setContent(/** @type {any} */ element: any) {
        this.contentElement.innerHTML = '';
        if (typeof element === 'string') {
            this.contentElement.innerHTML = element;
        } else {
            this.contentElement.appendChild(element);
        }
    }

    /**
     * Fixa o container no grid
     */
    pin() {
        this.state = ContainerState.PINNED;
        this.element.setAttribute('data-state', this.state);
        this.element.classList.remove('floating');
        this.element.style.position = '';
        this.element.style.left = '';
        this.element.style.top = '';
        this.element.style.width = '';
        this.element.style.height = '';
        this.element.style.zIndex = '';

        this._emitStateChange();
    }

    /**
     * Libera o container para flutuação
     */
    unpin() {
        this.state = ContainerState.FLOATING;
        this.element.setAttribute('data-state', this.state);
        this.element.classList.add('floating');

        // Posição inicial
        const rect = this.element.getBoundingClientRect();
        this.position = { x: rect.left, y: rect.top };
        this.size = { width: rect.width, height: rect.height };

        this.element.style.position = 'fixed';
        this.element.style.left = `${this.position.x}px`;
        this.element.style.top = `${this.position.y}px`;
        this.element.style.width = `${this.size.width}px`;
        this.element.style.height = `${this.size.height}px`;

        this.bringToFront();
        this._emitStateChange();
    }

    /**
     * Toggle entre pin/unpin
     */
    togglePin() {
        if (this.state === ContainerState.PINNED) {
            this.unpin();
        } else {
            this.pin();
        }
    }

    /**
     * Minimiza o container
     */
    minimize() {
        this.state = ContainerState.MINIMIZED;
        this.element.setAttribute('data-state', this.state);
        this.element.classList.add('minimized');
        this.contentElement.style.display = 'none';

        this._emitStateChange();
    }

    /**
     * Restaura de minimizado
     */
    restore() {
        if (this.state === ContainerState.MINIMIZED) {
            this.state = ContainerState.FLOATING;
            this.element.setAttribute('data-state', this.state);
            this.element.classList.remove('minimized');
            this.contentElement.style.display = '';

            this._emitStateChange();
        }
    }

    /**
     * Toggle minimizar
     */
    toggleMinimize() {
        if (this.state === ContainerState.MINIMIZED) {
            this.restore();
        } else if (this.state === ContainerState.FLOATING) {
            this.minimize();
        }
    }

    /**
     * Traz para frente (aumenta z-index)
     */
    bringToFront() {
        if (this.state === ContainerState.FLOATING) {
(ViewportContainer as any)._maxZIndex++;
this.zIndex = (ViewportContainer as any)._maxZIndex;
            this.element.style.zIndex = String(this.zIndex);
        }
    }

    /**
     * Fecha o container
     */
    close() {
        this.element.remove();
        eventBus.emit(Events.VIEWPORT_STATE_CHANGED, {
            id: this.id,
            action: 'closed',
        });
    }

    /**
     * Handler de início de drag
     */
    _onDragStart(/** @type {any} */ event: any) {
        // Só permite drag no modo floating
        if (this.state !== ContainerState.FLOATING) return;
        if (event.target.closest('.viewport-controls')) return;

        event.preventDefault();
        this._isDragging = true;

        const rect = this.element.getBoundingClientRect();
        this._dragOffset = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };

        this.element.classList.add('dragging');
        this.bringToFront();

        document.addEventListener('mousemove', this._onDragMove);
        document.addEventListener('mouseup', this._onDragEnd);
    }

    /**
     * Handler de movimento durante drag
     */
    _onDragMove = (/** @type {any} */ event: any) => {
        if (!this._isDragging) return;

        this.position = {
            x: event.clientX - this._dragOffset.x,
            y: event.clientY - this._dragOffset.y,
        };

        // Limita aos bounds da janela
        const maxX = window.innerWidth - 50;
        const maxY = window.innerHeight - 50;
        this.position.x = Math.max(0, Math.min(this.position.x, maxX));
        this.position.y = Math.max(0, Math.min(this.position.y, maxY));

        this.element.style.left = `${this.position.x}px`;
        this.element.style.top = `${this.position.y}px`;
    };

    /**
     * Handler de fim de drag
     */
    _onDragEnd = () => {
        this._isDragging = false;
        this.element.classList.remove('dragging');

        document.removeEventListener('mousemove', this._onDragMove);
        document.removeEventListener('mouseup', this._onDragEnd);

        this._emitStateChange();
    };

    /**
     * Handler de início de resize
     */
    _onResizeStart(/** @type {any} */ event: any) {
        if (this.state !== ContainerState.FLOATING) return;

        event.preventDefault();
        event.stopPropagation();

        this._isResizing = true;
        this._resizeStartSize = { ...this.size };
        this._resizeStartPos = { x: event.clientX, y: event.clientY };

        this.element.classList.add('resizing');

        document.addEventListener('mousemove', this._onResizeMove);
        document.addEventListener('mouseup', this._onResizeEnd);
    }

    /**
     * Handler de movimento durante resize
     */
    _onResizeMove = (/** @type {any} */ event: any) => {
        if (!this._isResizing) return;

        const deltaX = event.clientX - this._resizeStartPos.x;
        const deltaY = event.clientY - this._resizeStartPos.y;

        this.size = {
            width: Math.max(this.config.minWidth, this._resizeStartSize.width + deltaX),
            height: Math.max(this.config.minHeight, this._resizeStartSize.height + deltaY),
        };

        this.element.style.width = `${this.size.width}px`;
        this.element.style.height = `${this.size.height}px`;

        eventBus.emitDebounced(Events.VIEWPORT_RESIZE, {
            id: this.id,
            size: this.size,
        });
    };

    /**
     * Handler de fim de resize
     */
    _onResizeEnd = () => {
        this._isResizing = false;
        this.element.classList.remove('resizing');

        document.removeEventListener('mousemove', this._onResizeMove);
        document.removeEventListener('mouseup', this._onResizeEnd);

        this._emitStateChange();
    };

    /**
     * Emite evento de mudança de estado
     */
    _emitStateChange() {
        eventBus.emit(Events.VIEWPORT_STATE_CHANGED, {
            id: this.id,
            state: this.state,
            position: this.position,
            size: this.size,
        });
    }

    /**
     * Retorna estado atual
     */
    getState() {
        return {
            id: this.id,
            state: this.state,
            position: { ...this.position },
            size: { ...this.size },
        };
    }

    /**
     * Restaura estado salvo
     */
    restoreState(/** @type {any} */ savedState: any) {
        if (savedState.state === ContainerState.FLOATING) {
            this.unpin();
            this.position = savedState.position;
            this.size = savedState.size;

            this.element.style.left = `${this.position.x}px`;
            this.element.style.top = `${this.position.y}px`;
            this.element.style.width = `${this.size.width}px`;
            this.element.style.height = `${this.size.height}px`;
        } else if (savedState.state === ContainerState.MINIMIZED) {
            this.minimize();
        } else {
            this.pin();
        }
    }

    /**
     * Define título
     */
    setTitle(/** @type {any} */ title: any) {
        this.config.title = title;
        const titleEl = this.headerElement.querySelector('.viewport-title-text');
        if (titleEl) {
            titleEl.textContent = title;
        }
    }

    /**
     * Verifica se está fixado
     */
    isPinned() {
        return this.state === ContainerState.PINNED;
    }

    /**
     * Verifica se está flutuando
     */
    isFloating() {
        return this.state === ContainerState.FLOATING;
    }

    /**
     * Verifica se está minimizado
     */
    isMinimized() {
        return this.state === ContainerState.MINIMIZED;
    }

    /**
     * Anexa ao DOM
     */
    appendTo(/** @type {any} */ parent: any) {
        parent.appendChild(this.element);
    }

    /**
     * Remove do DOM
     */
    remove() {
        this.element.remove();
    }

    /**
     * Destrói o container
     */
    destroy() {
        document.removeEventListener('mousemove', this._onDragMove);
        document.removeEventListener('mouseup', this._onDragEnd);
        document.removeEventListener('mousemove', this._onResizeMove);
        document.removeEventListener('mouseup', this._onResizeEnd);

        this.element.remove();
    }
}

// Z-index máximo global
(ViewportContainer as any)._maxZIndex = 1000;

export { ViewportContainer, ContainerState };
export default ViewportContainer;
