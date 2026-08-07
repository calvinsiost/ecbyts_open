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
/* ================================================================
   POINT STRATEGY — Axis handles for point-type elements
   ================================================================

   Estrategia de edicao para elementos point-type:
   - well: handle vertical para ajustar totalDepth
   - spring, marker, sample: sem handles extras (posicao via gizmo)

   Segue a interface duck-typed do editManager:
   createHandles(), onAxisMove(), onEditComplete(), dispose(),
   getVertexCount(), supportsDrawMode()

   ================================================================ */
import { createTHREEProxy } from '../../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
const _THREE: any = THREE;
import { createAxisHandle, disposeHandles } from '../handleFactory.js';
// ----------------------------------------------------------------
// CONFIGURACAO POR FAMILIA
// ----------------------------------------------------------------
const FAMILY_CONFIG: Record<string, any> = {
    well: {
        hasDepthHandle: true,
        depthField: 'construction.totalDepth',
        defaultDepth: 50,
        minDepth: 1,
    },
    spring: { hasDepthHandle: false },
    marker: { hasDepthHandle: false },
    sample: { hasDepthHandle: false },
    waste: { hasDepthHandle: false },
};
// ----------------------------------------------------------------
// CLASSE
// ----------------------------------------------------------------
export class PointStrategy {
    config;
    element;
    handleGroup;
    mesh;
    /**
     * @param {any} element - Dados do elemento
     * @param {any} handleGroup - Grupo para handles
     * @param {any} mesh - Mesh 3D do elemento
     */
    constructor(element: any, handleGroup: any, mesh: any) {
        this.element = element;
        this.handleGroup = handleGroup;
        this.mesh = mesh;
        this.config = FAMILY_CONFIG[element.family] || { hasDepthHandle: false };
    }
    // ----------------------------------------------------------------
    // HANDLES
    // ----------------------------------------------------------------
    createHandles() {
        disposeHandles(this.handleGroup);
        if (!this.config.hasDepthHandle) return;
        // Well: handle no fundo do poco (extremidade inferior)
        const depth = this._getDepth();
        const pos = this.mesh.position;
        // Handle no fundo do poco
        const _THREE = THREE;
        this.handleGroup.add(
            createAxisHandle(new _THREE.Vector3(pos.x, pos.y - depth / 2, pos.z), 'depth', 'negative', this.element.id),
        );
        // Handle no topo do poco
        this.handleGroup.add(
            createAxisHandle(new _THREE.Vector3(pos.x, pos.y + depth / 2, pos.z), 'depth', 'positive', this.element.id),
        );
    }
    // ----------------------------------------------------------------
    // EDICAO
    // ----------------------------------------------------------------
    /**
     * Move handle de eixo → atualiza profundidade.
     */
    onAxisMove(axisName: any, direction: any, newPosition: any) {
        if (axisName !== 'depth') return;
        const pos = this.mesh.position;
        // Calcula nova profundidade a partir da distancia Y do handle ao topo
        let newDepth;
        if (direction === 'negative') {
            // Handle do fundo: profundidade = distancia do topo ao handle
            newDepth = pos.y + this._getDepth() / 2 - newPosition.y;
        } else {
            // Handle do topo: profundidade = distancia do handle ao fundo
            newDepth = newPosition.y - (pos.y - this._getDepth() / 2);
        }
        if (newDepth < this.config.minDepth) return;
        this._setDepth(newDepth);
        this._updateMeshScale();
    }
    onVertexMove() {} // Nao usado
    onMidpointClick() {} // Nao usado
    onVertexDelete() {
        return false;
    }
    onDrawPoint() {} // Nao suportado
    onEditComplete() {
        this.createHandles();
    }
    // ----------------------------------------------------------------
    // INFORMACOES
    // ----------------------------------------------------------------
    getVertexCount() {
        return this.config.hasDepthHandle ? 2 : 0;
    }
    supportsDrawMode() {
        return false;
    }
    dispose() {}
    // ----------------------------------------------------------------
    // HELPERS PRIVADOS
    // ----------------------------------------------------------------
    /** @private */
    _getDepth() {
        if (this.element.family === 'well') {
            return this.element.data?.construction?.totalDepth || this.config.defaultDepth;
        }
        return this.config.defaultDepth || 0;
    }
    /** @private */
    _setDepth(depth: any) {
        if (this.element.family === 'well') {
            if (!this.element.data) this.element.data = {};
            if (!this.element.data.construction) this.element.data.construction = {};
            this.element.data.construction.totalDepth = depth;
        }
    }
    /** @private */
    _updateMeshScale() {
        const depth = this._getDepth();
        // Well usa scale.y para profundidade, position.y = -depth/2
        this.mesh.scale.y = depth;
        this.mesh.position.y = -depth / 2;
    }
}
