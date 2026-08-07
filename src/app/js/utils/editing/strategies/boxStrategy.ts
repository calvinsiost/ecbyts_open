// @ts-check
// Generated from src/app/js/utils/editing/strategies/boxStrategy.ts by TS-MIGRATION-001. Do not edit manually.
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
   BOX STRATEGY — Corner + height handles for building/tank editing
   ================================================================

   Estratégia de edição para elementos do tipo building e tank.
   Usa 4 handles de canto para footprint + 1 handle de topo para altura.

   ================================================================ */
import { createTHREEProxy } from '../../../core/three-lazy.js';
const Three: any = createTHREEProxy();
import { createAxisHandle, disposeHandles } from '../handleFactory.js';
// ----------------------------------------------------------------
// CLASSE
// ----------------------------------------------------------------
export class BoxStrategy {
    element: any;
    handleGroup: any;
    mesh: any;
    /**
     * @param {any} element - Dados do elemento (building/tank)
     * @param {any} handleGroup - Grupo para handles
     * @param {any} mesh - Mesh 3D do elemento
     */
    constructor( element: any, handleGroup: any, mesh: any) {
        this.element = element;
        this.handleGroup = handleGroup;
        this.mesh = mesh;
        if (!this.element.data) this.element.data = {};
        // Building usa footprint, tank usa dimensions
        if (element.family === 'tank') {
            if (!this.element.data.dimensions) {
                this.element.data.dimensions = { diameter: 3, length: 6 };
            }
        } else {
            if (!this.element.data.footprint) {
                this.element.data.footprint = { width: 10, length: 10 };
            }
            if (!this.element.data.height) {
                this.element.data.height = 5;
            }
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
        const pos = this.element.data.position;
        const px = pos.x || 0;
        const pz = pos.z || 0;
        if (this.element.family === 'tank') {
            this._createTankHandles(px, pz);
        } else {
            this._createBuildingHandles(px, pz);
        }
    }
    /**
     * @param {number} px
     * @param {number} pz
     */
    _createBuildingHandles( px: any, pz: any) {
        const fp = this.element.data.footprint;
        const h = this.element.data.height || 5;
        const hw = fp.width / 2;
        const hl = fp.length / 2;
        // 4 corner handles no plano XZ (no nível do chão)
        const corners = [
            { x: px + hw, z: pz + hl, label: 'corner_pp' },
            { x: px + hw, z: pz - hl, label: 'corner_pn' },
            { x: px - hw, z: pz + hl, label: 'corner_np' },
            { x: px - hw, z: pz - hl, label: 'corner_nn' },
        ];
        corners.forEach((c: any) => {
            this.handleGroup.add(
                createAxisHandle(new Three.Vector3(c.x, 0.5, c.z), c.label, 'positive', this.element.id),
            );
        });
        // Handle de topo (altura)
        this.handleGroup.add(createAxisHandle(new Three.Vector3(px, h, pz), 'height', 'positive', this.element.id));
    }
    /**
     * @param {number} px
     * @param {number} pz
     */
    _createTankHandles( px: any, pz: any) {
        const dims = this.element.data.dimensions;
        const radius = dims.diameter / 2;
        const halfLen = dims.length / 2;
        const py = this.element.data.position.y || 0;
        // Handles de diâmetro (eixo Z no Three.js)
        this.handleGroup.add(
            createAxisHandle(new Three.Vector3(px, py + radius, pz), 'diameter', 'positive', this.element.id),
        );
        this.handleGroup.add(
            createAxisHandle(new Three.Vector3(px, py - radius, pz), 'diameter', 'negative', this.element.id),
        );
        // Handles de comprimento (eixo X no Three.js)
        this.handleGroup.add(
            createAxisHandle(new Three.Vector3(px + halfLen, py, pz), 'length', 'positive', this.element.id),
        );
        this.handleGroup.add(
            createAxisHandle(new Three.Vector3(px - halfLen, py, pz), 'length', 'negative', this.element.id),
        );
    }
    // ----------------------------------------------------------------
    // EDIÇÃO
    // ----------------------------------------------------------------
    /**
     * @param {string} axisName
     * @param {string} direction
     * @param {{x:number,y:number,z:number}} newPosition
     */
    onAxisMove( axisName: any, direction: any, newPosition: any) {
        if (this.element.family === 'tank') {
            this._onTankAxisMove(axisName, direction, newPosition);
        } else {
            this._onBuildingAxisMove(axisName, direction, newPosition);
        }
    }
    /**
     * @param {string} axisName
     * @param {string} direction
     * @param {{x:number,y:number,z:number}} newPosition
     */
    _onBuildingAxisMove( axisName: any, direction: any, newPosition: any) {
        const pos = this.element.data.position;
        const fp = this.element.data.footprint;
        const px = pos.x || 0;
        const pz = pos.z || 0;
        if (axisName === 'height') {
            const newHeight = Math.max(1, newPosition.y);
            this.element.data.height = newHeight;
            // Rebuild BoxGeometry
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            this.mesh.geometry = new Three.BoxGeometry(fp.width, newHeight, fp.length);
            this.mesh.position.y = newHeight / 2;
            return;
        }
        // Corner handles - recalcula width e length
        if (axisName.startsWith('corner_')) {
            // eslint-disable-next-line
            const isPositiveX = axisName[7] === 'p';
            // eslint-disable-next-line
            const isPositiveZ = axisName[8] === 'p';
            const dx = Math.abs(newPosition.x - px);
            const dz = Math.abs(newPosition.z - pz);
            fp.width = Math.max(1, dx * 2);
            fp.length = Math.max(1, dz * 2);
            // Rebuild BoxGeometry
            const h = this.element.data.height || 5;
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            this.mesh.geometry = new Three.BoxGeometry(fp.width, h, fp.length);
        }
    }
    /**
     * @param {string} axisName
     * @param {string} direction
     * @param {{x:number,y:number,z:number}} newPosition
     */
    _onTankAxisMove( axisName: any, direction: any, newPosition: any) {
        const pos = this.element.data.position;
        const dims = this.element.data.dimensions;
        const px = pos.x || 0;
        const py = pos.y || 0;
        if (axisName === 'diameter') {
            const newRadius = Math.max(0.5, Math.abs(newPosition.y - py));
            dims.diameter = newRadius * 2;
        } else if (axisName === 'length') {
            const newHalfLen = Math.max(0.5, Math.abs(newPosition.x - px));
            dims.length = newHalfLen * 2;
        }
        // Rebuild CylinderGeometry (horizontal)
        const radius = dims.diameter / 2;
        if (this.mesh.geometry) this.mesh.geometry.dispose();
        const geom = new Three.CylinderGeometry(radius, radius, dims.length, 16);
        geom.rotateZ(Math.PI / 2);
        this.mesh.geometry = geom;
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
        return this.element.family === 'tank' ? 4 : 5;
    }
    supportsDrawMode() {
        return false;
    }
    dispose() {}
}
