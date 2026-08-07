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
   POLYGON STRATEGY — Vertex editing for polygon-based elements
   ================================================================

   Estratégia de edição GIS-like para elementos baseados em polígono:
   boundary, area, habitat (futuro).

   FEEDBACK VISUAL:
   - Contorno editável (cyan) — polígono fechado com vértices arrastáveis
   - Handles verdes nos vértices + azuis nos pontos médios das arestas
   - Ao clicar no midpoint, insere novo vértice
   - Draw mode: clicar no viewport adiciona novos vértices
   - Delete: remove vértice selecionado (mínimo 3)

   ================================================================ */
import { createTHREEProxy } from '../../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { createVertexHandle, createMidpointHandle, disposeHandles } from '../handleFactory.js';
import {
    rebuildBoundaryGeometry,
    rebuildDamGeometry,
    rebuildPitGeometry,
    rebuildAreaMesh,
    rebuildHabitatMesh,
    rebuildBlueprintMesh,
} from '../../../core/elements/meshFactory.js';
const OUTLINE_COLOR = 0x00ddff;
// Pool de Vector3 para _updateOutline - evita alocacao por frame
const _vecPool: any[] = [];
function _getPooledVec(x: any, y: any, z: any) {
    const v = _vecPool.length > 0 ? _vecPool.pop() : new THREE.Vector3();
    return v.set(x, y, z);
}
function _releasePool(arr: any[]) {
    for (const v of arr)
        _vecPool.push(v);
    arr.length = 0;
}
// ----------------------------------------------------------------
// CLASSE
// ----------------------------------------------------------------
export class PolygonStrategy {
    element: any;
    handleGroup: any;
    mesh: any;
    /**
     * @param {any} element - Dados do elemento
     * @param {any} handleGroup - Grupo para handles (editHandlesGroup)
     * @param {any} mesh - Mesh 3D do elemento
     */
    constructor(element: any, handleGroup: any, mesh: any) {
        this.element = element;
        this.handleGroup = handleGroup;
        this.mesh = mesh;
        // Garante que vertices existe
        if (!this.element.data)
            this.element.data = {};
        if (!this.element.data.vertices || this.element.data.vertices.length < 3) {
            this.element.data.vertices = [
                { x: -30, z: -30 },
                { x: 30, z: -30 },
                { x: 30, z: 30 },
                { x: -30, z: 30 },
            ];
        }
    }
    // ----------------------------------------------------------------
    // HANDLES + OUTLINE
    // ----------------------------------------------------------------
    /**
     * Cria todos os handles (outline + vértices + pontos médios).
     */
    createHandles() {
        disposeHandles(this.handleGroup);
        const verts = this.element.data.vertices;
        // Outline editável (contorno cyan sobre o polígono)
        this._createOutline(verts);
        // Handles de vértice
        for (let i = 0; i < verts.length; i++) {
            const v = verts[i];
            const pos = new THREE.Vector3(v.x, v.y || 0.5, v.z);
            const handle = createVertexHandle(pos, i, this.element.id);
            this.handleGroup.add(handle);
        }
        // Handles de ponto médio
        this._createMidpoints(verts);
    }
    /**
     * Cria contorno editável (linha fechada sobre o polígono).
     * @private
     */
    _createOutline(verts: any[]) {
        const mat = new THREE.LineBasicMaterial({
            color: OUTLINE_COLOR,
            depthTest: false,
            transparent: true,
            opacity: 0.8,
        });
        const pts = verts.map((v: any) => new THREE.Vector3(v.x, (v.y || 0) + 0.4, v.z));
        pts.push(pts[0].clone());
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
        line.renderOrder = 997;
        line.name = 'edit_outline';
        this.handleGroup.add(line);
    }
    /**
     * Cria handles de ponto médio entre vértices consecutivos.
     * @private
     */
    _createMidpoints(verts: any[]) {
        for (let i = 0; i < verts.length; i++) {
            const a = verts[i];
            const b = verts[(i + 1) % verts.length];
            const mid = new THREE.Vector3((a.x + b.x) / 2, ((a.y || 0) + (b.y || 0)) / 2 + 0.5, (a.z + b.z) / 2);
            const handle = createMidpointHandle(mid, i, this.element.id);
            this.handleGroup.add(handle);
        }
    }
    /**
     * Atualiza outline + midpoints em tempo real durante arrasto.
     */
    updateMidpoints() {
        const verts = this.element.data.vertices;
        // Atualiza outline
        this._updateOutline(verts);
        // Remove e recria midpoints
        const toRemove: any[] = [];
        this.handleGroup.children.forEach((h: any) => {
            if (h.userData?.handleType === 'midpoint')
                toRemove.push(h);
        });
        toRemove.forEach((h) => {
            if (h.material)
                h.material.dispose();
            this.handleGroup.remove(h);
        });
        this._createMidpoints(verts);
    }
    /**
     * Atualiza geometria do outline sem recriar.
     * @private
     */
    _updateOutline(verts: any[]) {
        const outline = this.handleGroup.getObjectByName('edit_outline');
        if (outline) {
            const pts = verts.map((v: any) => _getPooledVec(v.x, (v.y || 0) + 0.4, v.z));
            pts.push(_getPooledVec(pts[0].x, pts[0].y, pts[0].z));
            if (outline.geometry)
                outline.geometry.dispose();
            outline.geometry = new THREE.BufferGeometry().setFromPoints(pts);
            _releasePool(pts);
        }
    }
    // ----------------------------------------------------------------
    // EDIÇÃO
    // ----------------------------------------------------------------
    /**
     * Dispatch por family: chama o rebuilder de geometria correto. Adicionado
     * 2026-05-29 (TRUST-001 #3 dam promotion) — antes rebuildBoundaryGeometry
     * era chamado para tudo, mas só funcionava para boundary (Group com outline+
     * overlay). Para dam (Mesh com ExtrudeGeometry) precisa rebuildDamGeometry.
     */
    _rebuildMeshGeometry(verts: any) {
        const fam = this.element?.family;
        if (fam === 'dam') {
            rebuildDamGeometry(this.mesh, verts, this.element.data);
            return;
        }
        if (fam === 'pit') {
            rebuildPitGeometry(this.mesh, verts, this.element.data);
            return;
        }
        if (fam === 'area') {
            rebuildAreaMesh(this.mesh, verts, this.element.data);
            return;
        }
        if (fam === 'habitat') {
            rebuildHabitatMesh(this.mesh, verts, this.element.data);
            return;
        }
        if (fam === 'blueprint') {
            rebuildBlueprintMesh(this.mesh, verts, this.element.data);
            return;
        }
        // Default — boundary path (Group com outline+overlay).
        rebuildBoundaryGeometry(this.mesh, verts, this.element.data);
    }
    /**
     * Move um vértice para nova posição 3D.
     * Atualiza dados do elemento e reconstrói geometria do mesh.
     *
     * @param {number} vertexIndex - Índice do vértice
     * @param {any} newPosition - Nova posição 3D
     */
    onVertexMove(vertexIndex: number, newPosition: any) {
        const verts = this.element.data.vertices;
        if (vertexIndex < 0 || vertexIndex >= verts.length)
            return;
        // Atualiza dados
        verts[vertexIndex].x = newPosition.x;
        verts[vertexIndex].y = newPosition.y;
        verts[vertexIndex].z = newPosition.z;
        // Reconstrói geometria in-place
        this._rebuildMeshGeometry(verts);
        // Atualiza outline
        this._updateOutline(verts);
    }
    /**
     * Clique em midpoint: insere novo vértice.
     * @param {number} afterIndex - Inserir depois deste índice
     */
    onMidpointClick(afterIndex: number) {
        const verts = this.element.data.vertices;
        const a = verts[afterIndex];
        const b = verts[(afterIndex + 1) % verts.length];
        // Novo vértice no ponto médio
        const newVert = {
            x: (a.x + b.x) / 2,
            y: ((a.y || 0) + (b.y || 0)) / 2,
            z: (a.z + b.z) / 2,
        };
        verts.splice(afterIndex + 1, 0, newVert);
        // Reconstrói tudo
        this._rebuildMeshGeometry(verts);
        this.createHandles();
    }
    /**
     * Midpoint arrastado: insere vértice e move na mesma operação.
     * @param {number} afterIndex
     * @param {any} position
     */
    onMidpointDrag(afterIndex: number, position: any) {
        const verts = this.element.data.vertices;
        // Se ainda não inseriu, insere o vértice
        const expectedCount = this.handleGroup.children.filter((h: any) => h.userData?.handleType === 'vertex').length;
        if (verts.length === expectedCount) {
            // Primeiro drag do midpoint: insere vértice
            const newVert = { x: position.x, y: position.y, z: position.z };
            verts.splice(afterIndex + 1, 0, newVert);
            this.createHandles();
        }
        // Move o vértice recém-inserido
        const idx = afterIndex + 1;
        if (idx < verts.length) {
            verts[idx].x = position.x;
            verts[idx].y = position.y;
            verts[idx].z = position.z;
            this._rebuildMeshGeometry(verts);
            this._updateOutline(verts);
        }
    }
    /**
     * Deleta vértice por índice.
     * @param {number} vertexIndex
     * @returns {boolean} true se deletou
     */
    onVertexDelete(vertexIndex: number) {
        const verts = this.element.data.vertices;
        if (verts.length <= 3)
            return false; // Mínimo 3 para polígono
        if (vertexIndex < 0 || vertexIndex >= verts.length)
            return false;
        verts.splice(vertexIndex, 1);
        this._rebuildMeshGeometry(verts);
        this.createHandles();
        return true;
    }
    /**
     * Draw mode: adiciona vértice no ponto clicado.
     * @param {any} position
     */
    onDrawPoint(position: any) {
        const verts = this.element.data.vertices;
        verts.push({ x: position.x, y: position.y, z: position.z });
        this._rebuildMeshGeometry(verts);
        this.createHandles();
    }
    /**
     * Chamado ao final de cada operação de edição.
     * Oportunidade para normalizar dados.
     */
    onEditComplete() {
        // Normaliza: remove y se for ~0 para manter compatibilidade
        this.element.data.vertices.forEach((v: any) => {
            if (v.y !== undefined && Math.abs(v.y) < 0.01)
                delete v.y;
        });
    }
    // ----------------------------------------------------------------
    // INFORMAÇÕES
    // ----------------------------------------------------------------
    getVertexCount() {
        return this.element.data.vertices?.length || 0;
    }
    supportsDrawMode() {
        return true;
    }
    // ----------------------------------------------------------------
    // LIMPEZA
    // ----------------------------------------------------------------
    dispose() {
        // Handles + outline são limpos pelo editManager via disposeHandles
    }
}
//# sourceMappingURL=polygonStrategy.js.map
