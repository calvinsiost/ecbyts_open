// @ts-check
// Generated from src/app/js/utils/editing/strategies/pathStrategy.ts by TS-MIGRATION-001. Do not edit manually.
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
   PATH STRATEGY — Point editing for path-based elements
   ================================================================

   Estratégia de edição para elementos baseados em caminho:
   river (tubo seguindo pontos de controle).

   FUNCIONALIDADES:
   - Handles de vértice em cada ponto do caminho
   - Arrastar vértice → recria TubeGeometry em tempo real
   - Draw mode: clicar no viewport adiciona waypoints
   - Delete: remove ponto (mínimo 2)

   ================================================================ */

import { createVertexHandle, disposeHandles } from '../handleFactory.js';
import { rebuildRiverGeometry } from '../../../core/elements/meshFactory.js';
// ----------------------------------------------------------------
// CLASSE
// ----------------------------------------------------------------
export class PathStrategy {
    element: any;
    handleGroup: any;
    mesh: any;
    /**
     * @param {any} element - Dados do elemento
     * @param {any} handleGroup - Grupo para handles
     * @param {any} mesh - Mesh 3D do elemento
     */
    constructor( element: any, handleGroup: any, mesh: any) {
        this.element = element;
        this.handleGroup = handleGroup;
        this.mesh = mesh;
        // Garante que path existe
        if (!this.element.data) this.element.data = {};
        if (!this.element.data.path || this.element.data.path.length < 2) {
            this.element.data.path = [
                { x: -20, y: 0, z: 0 },
                { x: 20, y: 0, z: 0 },
            ];
        }
    }
    // ----------------------------------------------------------------
    // HANDLES
    // ----------------------------------------------------------------
    createHandles() {
        disposeHandles(this.handleGroup);
        const path = this.element.data.path;
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            const pos = new (THREE as any).Vector3(p.x, p.y || 0.1, p.z);
            const handle = createVertexHandle(pos, i, this.element.id);
            this.handleGroup.add(handle);
        }
    }
    updateMidpoints() {
        // Path não usa midpoints - add via draw mode
    }
    // ----------------------------------------------------------------
    // EDIÇÃO
    // ----------------------------------------------------------------
    /**
     * Move ponto do caminho para nova posição.
     * @param {number} vertexIndex
     * @param {any} newPosition
     */
    onVertexMove( vertexIndex: any, newPosition: any) {
        const path = this.element.data.path;
        if (vertexIndex < 0 || vertexIndex >= path.length) return;
        path[vertexIndex].x = newPosition.x;
        path[vertexIndex].y = newPosition.y;
        path[vertexIndex].z = newPosition.z;
        rebuildRiverGeometry(this.mesh, path, this.element.data.width);
    }
    /**
     * Clique em midpoint (não usado - path usa draw mode).
     */
    onMidpointClick() {}
    /**
     * Deleta ponto por índice.
     * @param {number} vertexIndex
     * @returns {boolean}
     */
    onVertexDelete( vertexIndex: any) {
        const path = this.element.data.path;
        if (path.length <= 2) return false; // Mínimo 2 pontos
        if (vertexIndex < 0 || vertexIndex >= path.length) return false;
        path.splice(vertexIndex, 1);
        rebuildRiverGeometry(this.mesh, path, this.element.data.width);
        this.createHandles();
        return true;
    }
    /**
     * Draw mode: adiciona waypoint no ponto clicado.
     * Adiciona ao final do caminho.
     * @param {any} position
     */
    onDrawPoint( position: any) {
        this.element.data.path.push({
            x: position.x,
            y: position.y,
            z: position.z,
        });
        rebuildRiverGeometry(this.mesh, this.element.data.path, this.element.data.width);
        this.createHandles();
    }
    onEditComplete() {
        // Normaliza y=0 → remove para compatibilidade
        this.element.data.path.forEach((p: any) => {
            if (p.y !== undefined && Math.abs(p.y) < 0.01) delete p.y;
        });
    }
    // ----------------------------------------------------------------
    // INFORMAÇÕES
    // ----------------------------------------------------------------
    getVertexCount() {
        return this.element.data.path?.length || 0;
    }
    supportsDrawMode() {
        return true;
    }
    // ----------------------------------------------------------------
    // LIMPEZA
    // ----------------------------------------------------------------
    dispose() {}
}
