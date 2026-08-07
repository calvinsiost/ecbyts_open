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
   EXTRUDED POLYGON STRATEGY — Freeform polygon + height for buildings
   ================================================================

   Estratégia GIS-like para edição de formas sólidas (building, etc.)
   Converte footprint retangular em polígono arbitrário extrudado.

   FEEDBACK VISUAL (wireframe cage):
   - Contorno inferior (cyan) — polígono no chão com vértices editáveis
   - Contorno superior (cyan) — polígono no topo mostrando altura
   - Arestas verticais (cyan) — ligando base ao topo em cada vértice
   - Handles verdes nos vértices + azuis nos pontos médios
   - Handle de altura (cubo verde) no topo central

   O usuário vê claramente a "gaiola" editável sobre o sólido.

   ================================================================ */
import { createTHREEProxy } from '../../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { createVertexHandle, createMidpointHandle, createAxisHandle, disposeHandles } from '../handleFactory.js';
import { rebuildExtrudedGeometry } from '../../../core/elements/meshFactory.js';
// Cor do wireframe cage
const CAGE_COLOR = 0x00ddff;
const CAGE_OPACITY = 0.8;
// Pool de Vector3 para _updateCage - evita alocacao por frame
const _vecPool: any[] = [];
/** @param {*} x @param {*} y @param {*} z */
function _getPooledVec(x: any, y: any, z: any) {
    const v = _vecPool.length > 0 ? _vecPool.pop() : new THREE.Vector3();
    return v.set(x, y, z);
}
/** @param {*} arr */
function _releasePool(arr: any) {
    for (const v of arr)
        _vecPool.push(v);
    arr.length = 0;
}
// ----------------------------------------------------------------
// CLASSE
// ----------------------------------------------------------------
export class ExtrudedPolygonStrategy {
    _savedOpacity: any;
    element: any;
    handleGroup: any;
    mesh: any;
    /**
     * @param {*} element - Dados do elemento (building)
     * @param {*} handleGroup - Grupo para handles (THREE.Group)
     * @param {*} mesh - Mesh 3D do elemento (THREE.Object3D)
     */
    constructor(element: any, handleGroup: any, mesh: any) {
        this.element = element;
        this.handleGroup = handleGroup;
        this.mesh = mesh;
        this._savedOpacity = null;
        if (!this.element.data)
            this.element.data = {};
        // Converte footprint → vertices se necessário
        this._ensureVertices();
        if (!this.element.data.height) {
            this.element.data.height = 5;
        }
        if (!this.element.data.position) {
            this.element.data.position = { x: 0, y: 0, z: 0 };
        }
        // Torna o mesh mais transparente durante edição para ver a cage
        this._dimMesh();
    }
    // ----------------------------------------------------------------
    // INICIALIZAÇÃO
    // ----------------------------------------------------------------
    /**
     * Converte footprint retangular em vértices de polígono.
     * @private
     */
    _ensureVertices() {
        if (this.element.data.vertices && this.element.data.vertices.length >= 3) {
            return;
        }
        const pos = this.element.data.position || { x: 0, y: 0, z: 0 };
        const px = pos.x || 0;
        const pz = pos.z || 0;
        if (this.element.data.footprint) {
            const fp = this.element.data.footprint;
            const hw = (fp.width || 10) / 2;
            const hl = (fp.length || 10) / 2;
            this.element.data.vertices = [
                { x: px - hw, z: pz - hl },
                { x: px + hw, z: pz - hl },
                { x: px + hw, z: pz + hl },
                { x: px - hw, z: pz + hl },
            ];
        }
        else {
            this.element.data.vertices = [
                { x: px - 5, z: pz - 5 },
                { x: px + 5, z: pz - 5 },
                { x: px + 5, z: pz + 5 },
                { x: px - 5, z: pz + 5 },
            ];
        }
        delete this.element.data.footprint;
        rebuildExtrudedGeometry(this.mesh, this.element.data.vertices, this.element.data);
    }
    /**
     * Reduz opacidade do mesh sólido durante edição.
     * @private
     */
    _dimMesh() {
        const mat = this.mesh?.material;
        if (mat) {
            this._savedOpacity = mat.opacity;
            mat.transparent = true;
            mat.opacity = 0.3;
            mat.needsUpdate = true;
        }
    }
    /**
     * Restaura opacidade original do mesh.
     * @private
     */
    _restoreMesh() {
        const mat = this.mesh?.material;
        if (mat && this._savedOpacity !== null) {
            mat.opacity = this._savedOpacity;
            mat.needsUpdate = true;
            this._savedOpacity = null;
        }
    }
    // ----------------------------------------------------------------
    // HANDLES + WIREFRAME CAGE
    // ----------------------------------------------------------------
    createHandles() {
        disposeHandles(this.handleGroup);
        const verts = this.element.data.vertices;
        const h = this.element.data.height || 5;
        // 1. Wireframe cage - contorno inferior, superior e arestas verticais
        this._createCage(verts, h);
        // 2. Vertex handles no chão
        for (let i = 0; i < verts.length; i++) {
            const v = verts[i];
            const handle = createVertexHandle(new THREE.Vector3(v.x, 0.3, v.z), i, this.element.id);
            this.handleGroup.add(handle);
        }
        // 3. Midpoint handles nas arestas inferiores
        this._createMidpoints(verts);
        // 4. Handle de altura no topo central
        const c = this._getCentroid(verts);
        this.handleGroup.add(createAxisHandle(new THREE.Vector3(c.x, h, c.z), 'height', 'positive', this.element.id));
    }
    /**
     * Cria wireframe cage: contorno inferior + superior + arestas verticais.
     * Tudo adicionado ao handleGroup para limpeza automática.
     * @private
     */
    /** @param {*} verts @param {*} height */
    _createCage(verts: any, height: any) {
        const mat = new THREE.LineBasicMaterial({
            color: CAGE_COLOR,
            depthTest: false,
            transparent: true,
            opacity: CAGE_OPACITY,
        });
        // Contorno inferior (polígono fechado no chão)
        const bottomPts = verts.map((v: any) => new THREE.Vector3(v.x, 0.2, v.z));
        bottomPts.push(bottomPts[0].clone());
        const bottomLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(bottomPts), mat);
        bottomLine.renderOrder = 997;
        bottomLine.name = 'cage_bottom';
        this.handleGroup.add(bottomLine);
        // Contorno superior (polígono fechado no topo)
        const topPts = verts.map((v: any) => new THREE.Vector3(v.x, height, v.z));
        topPts.push(topPts[0].clone());
        const topLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(topPts), mat.clone());
        topLine.renderOrder = 997;
        topLine.name = 'cage_top';
        this.handleGroup.add(topLine);
        // Arestas verticais em cada vértice
        for (const v of verts) {
            const edgePts = [new THREE.Vector3(v.x, 0.2, v.z), new THREE.Vector3(v.x, height, v.z)];
            const edgeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePts), mat.clone());
            edgeLine.renderOrder = 997;
            edgeLine.name = 'cage_edge';
            this.handleGroup.add(edgeLine);
        }
    }
    /**
     * Cria midpoint handles no ponto médio de cada aresta inferior.
     * @private
     */
    /** @param {*} verts */
    _createMidpoints(verts: any) {
        for (let i = 0; i < verts.length; i++) {
            const a = verts[i];
            const b = verts[(i + 1) % verts.length];
            const handle = createMidpointHandle(new THREE.Vector3((a.x + b.x) / 2, 0.3, (a.z + b.z) / 2), i, this.element.id);
            this.handleGroup.add(handle);
        }
    }
    /**
     * Atualiza midpoints (remove e recria).
     */
    updateMidpoints() {
        /** @type {any[]} */
        const toRemove: any[] = [];
        this.handleGroup.children.forEach((h: any) => {
            if (h.userData?.handleType === 'midpoint')
                toRemove.push(h);
        });
        toRemove.forEach((h: any) => {
            if (h.material)
                h.material.dispose();
            this.handleGroup.remove(h);
        });
        this._createMidpoints(this.element.data.vertices);
    }
    /**
     * Atualiza cage + midpoints em tempo real durante arrasto.
     * Mais leve que recriar todos os handles.
     * @private
     */
    _updateCage() {
        const verts = this.element.data.vertices;
        const h = this.element.data.height || 5;
        // Atualiza contorno inferior (usa pool para evitar GC)
        const bottom = this.handleGroup.getObjectByName('cage_bottom');
        if (bottom) {
            const pts = verts.map((v: any) => _getPooledVec(v.x, 0.2, v.z));
            pts.push(_getPooledVec(pts[0].x, pts[0].y, pts[0].z));
            if (bottom.geometry)
                bottom.geometry.dispose();
            bottom.geometry = new THREE.BufferGeometry().setFromPoints(pts);
            _releasePool(pts);
        }
        // Atualiza contorno superior
        const top = this.handleGroup.getObjectByName('cage_top');
        if (top) {
            const pts = verts.map((v: any) => _getPooledVec(v.x, h, v.z));
            pts.push(_getPooledVec(pts[0].x, pts[0].y, pts[0].z));
            if (top.geometry)
                top.geometry.dispose();
            top.geometry = new THREE.BufferGeometry().setFromPoints(pts);
            _releasePool(pts);
        }
        // Atualiza arestas verticais
        const edges = this.handleGroup.children.filter((c: any) => c.name === 'cage_edge');
        edges.forEach((edge: any, i: number) => {
            if (i < verts.length) {
                const v = verts[i];
                const pts = [_getPooledVec(v.x, 0.2, v.z), _getPooledVec(v.x, h, v.z)];
                if (edge.geometry)
                    edge.geometry.dispose();
                edge.geometry = new THREE.BufferGeometry().setFromPoints(pts);
                _releasePool(pts);
            }
        });
    }
    /** @param {*} verts */
    _getCentroid(verts: any) {
        let cx = 0, cz = 0;
        for (const v of verts) {
            cx += v.x;
            cz += v.z;
        }
        return { x: cx / verts.length, z: cz / verts.length };
    }
    // ----------------------------------------------------------------
    // EDIÇÃO
    // ----------------------------------------------------------------
    /** @param {*} vertexIndex @param {*} newPosition */
    onVertexMove(vertexIndex: any, newPosition: any) {
        const verts = this.element.data.vertices;
        if (vertexIndex < 0 || vertexIndex >= verts.length)
            return;
        verts[vertexIndex].x = newPosition.x;
        verts[vertexIndex].z = newPosition.z;
        rebuildExtrudedGeometry(this.mesh, verts, this.element.data);
        this._updateCage();
    }
    /** @param {*} axisName @param {*} direction @param {*} newPosition */
    onAxisMove(axisName: any, direction: any, newPosition: any) {
        if (axisName === 'height') {
            this.element.data.height = Math.max(1, newPosition.y);
            rebuildExtrudedGeometry(this.mesh, this.element.data.vertices, this.element.data);
            this._updateCage();
        }
    }
    /** @param {*} afterIndex */
    onMidpointClick(afterIndex: any) {
        const verts = this.element.data.vertices;
        const a = verts[afterIndex];
        const b = verts[(afterIndex + 1) % verts.length];
        verts.splice(afterIndex + 1, 0, {
            x: (a.x + b.x) / 2,
            z: (a.z + b.z) / 2,
        });
        rebuildExtrudedGeometry(this.mesh, verts, this.element.data);
        this.createHandles();
    }
    /** @param {*} afterIndex @param {*} position */
    onMidpointDrag(afterIndex: any, position: any) {
        const verts = this.element.data.vertices;
        const expectedCount = this.handleGroup.children.filter((h: any) => h.userData?.handleType === 'vertex').length;
        if (verts.length === expectedCount) {
            verts.splice(afterIndex + 1, 0, { x: position.x, z: position.z });
            this.createHandles();
        }
        const idx = afterIndex + 1;
        if (idx < verts.length) {
            verts[idx].x = position.x;
            verts[idx].z = position.z;
            rebuildExtrudedGeometry(this.mesh, verts, this.element.data);
            this._updateCage();
        }
    }
    /** @param {*} vertexIndex */
    onVertexDelete(vertexIndex: any) {
        const verts = this.element.data.vertices;
        if (verts.length <= 3)
            return false;
        if (vertexIndex < 0 || vertexIndex >= verts.length)
            return false;
        verts.splice(vertexIndex, 1);
        rebuildExtrudedGeometry(this.mesh, verts, this.element.data);
        this.createHandles();
        return true;
    }
    /** @param {*} position */
    onDrawPoint(position: any) {
        this.element.data.vertices.push({ x: position.x, z: position.z });
        rebuildExtrudedGeometry(this.mesh, this.element.data.vertices, this.element.data);
        this.createHandles();
    }
    onEditComplete() {
        this.createHandles();
    }
    // ----------------------------------------------------------------
    // INFORMAÇÕES
    // ----------------------------------------------------------------
    getVertexCount() {
        return (this.element.data.vertices?.length || 0) + 1;
    }
    supportsDrawMode() {
        return true;
    }
    dispose() {
        this._restoreMesh();
    }
}
//# sourceMappingURL=extrudedPolygonStrategy.js.map