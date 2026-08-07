// @ts-check
// Generated from src/app/js/utils/editing/strategies/ellipseStrategy.ts by TS-MIGRATION-001. Do not edit manually.
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
   ELLIPSE STRATEGY — Axis handles for lake ellipse editing
   ================================================================

   Estratégia de edição para elementos do tipo lake (elipse).
   Usa 4 handles de eixo para ajustar radiusX e radiusY.

   ================================================================ */
import { createTHREEProxy } from '../../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { createAxisHandle, disposeHandles } from '../handleFactory.js';
// ----------------------------------------------------------------
// CLASSE
// ----------------------------------------------------------------
export class EllipseStrategy {
    element: any;
    handleGroup: any;
    mesh: any;
    /**
     * @param {any} element - Dados do elemento (lake)
     * @param {any} handleGroup - Grupo para handles
     * @param {any} mesh - Mesh 3D do elemento
     */
    constructor( element: any, handleGroup: any, mesh: any) {
        this.element = element;
        this.handleGroup = handleGroup;
        this.mesh = mesh;
        if (!this.element.data) this.element.data = {};
        if (!this.element.data.shape) {
            this.element.data.shape = { radiusX: 10, radiusY: 8 };
        }
        if (!this.element.data.position) {
            this.element.data.position = { x: 0, y: 0, z: 0 };
        }
    }
    // ----------------------------------------------------------------
    // HANDLES
    // ----------------------------------------------------------------
    createHandles() {
        disposeHandles(this.handleGroup);
        const shape = this.element.data.shape;
        const pos = this.element.data.position;
        const px = pos.x || 0;
        const pz = pos.z || 0;
        const py = 0.5; // Ligeiramente acima do plano
        // X axis (radiusX)
        this.handleGroup.add(
            createAxisHandle(new THREE.Vector3(px + shape.radiusX, py, pz), 'radiusX', 'positive', this.element.id),
        );
        this.handleGroup.add(
            createAxisHandle(new THREE.Vector3(px - shape.radiusX, py, pz), 'radiusX', 'negative', this.element.id),
        );
        // Z axis (radiusY)
        this.handleGroup.add(
            createAxisHandle(new THREE.Vector3(px, py, pz + shape.radiusY), 'radiusY', 'positive', this.element.id),
        );
        this.handleGroup.add(
            createAxisHandle(new THREE.Vector3(px, py, pz - shape.radiusY), 'radiusY', 'negative', this.element.id),
        );
    }
    // ----------------------------------------------------------------
    // EDIÇÃO
    // ----------------------------------------------------------------
    /**
     * @param {string} axisName
     * @param {string} direction
     * @param {{x:number, y:number, z:number}} newPosition
     */
    onAxisMove( axisName: any, direction: any, newPosition: any) {
        const shape = this.element.data.shape;
        const pos = this.element.data.position;
        const px = pos.x || 0;
        const pz = pos.z || 0;
        let newRadius;
        if (axisName === 'radiusX') {
            newRadius = Math.abs(newPosition.x - px);
        } else if (axisName === 'radiusY') {
            newRadius = Math.abs(newPosition.z - pz);
        }
        if (newRadius !== undefined && newRadius > 0.5) {
            shape[axisName] = newRadius;
            // Lake usa mesh.scale para dimensionar
            this.mesh.scale.set(shape.radiusX, 1, shape.radiusY);
        }
    }
    onVertexMove() {}
    onMidpointClick() {}
    onVertexDelete() {
        return false;
    }
    onDrawPoint() {}
    onEditComplete() {
        this.createHandles();
    }
    getVertexCount() {
        return 4;
    }
    supportsDrawMode() {
        return false;
    }
    dispose() {}
}
