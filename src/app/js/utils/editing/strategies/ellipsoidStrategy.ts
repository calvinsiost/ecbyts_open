// @ts-check
// Generated from src/app/js/utils/editing/strategies/ellipsoidStrategy.ts by TS-MIGRATION-001. Do not edit manually.
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
   ELLIPSOID STRATEGY — Axis handles for plume ellipsoid editing
   ================================================================

   Estratégia de edição para elementos do tipo plume (elipsóide).
   Usa 6 handles de eixo nos endpoints do elipsóide para ajustar
   radiusX, radiusY e radiusZ.

   ================================================================ */
import { createTHREEProxy } from '../../../core/three-lazy.js';
/** @type {any} */
const THREE: any = createTHREEProxy();
import { createAxisHandle, disposeHandles } from '../handleFactory.js';
// ----------------------------------------------------------------
// CLASSE
// ----------------------------------------------------------------
export class EllipsoidStrategy {
    element: any;
    handleGroup: any;
    mesh: any;
    /**
     * @param {any} element - Dados do elemento (plume)
     * @param {any} handleGroup - Grupo para handles
     * @param {any} mesh - Mesh 3D do elemento (Group com shells)
     */
    constructor( element: any, handleGroup: any, mesh: any) {
        this.element = element;
        this.handleGroup = handleGroup;
        this.mesh = mesh;
        if (!this.element.data) this.element.data = {};
        if (!this.element.data.shape) {
            this.element.data.shape = { radiusX: 10, radiusY: 8, radiusZ: 4 };
        }
        if (!this.element.data.center) {
            this.element.data.center = { x: 0, y: -7.5, z: 0 };
        }
    }
    // ----------------------------------------------------------------
    // HANDLES
    // ----------------------------------------------------------------
    createHandles() {
        disposeHandles(this.handleGroup);
        const shape = this.element.data.shape;
        const center = this.element.data.center;
        const cx = center.x || 0;
        const cy = center.y || -7.5;
        const cz = center.z || 0;
        // X axis (radiusX) - Three.js X direction
        this.handleGroup.add(
            createAxisHandle(new THREE.Vector3(cx + shape.radiusX, cy, cz), 'radiusX', 'positive', this.element.id),
        );
        this.handleGroup.add(
            createAxisHandle(new THREE.Vector3(cx - shape.radiusX, cy, cz), 'radiusX', 'negative', this.element.id),
        );
        // Z axis (radiusY in data = Z in Three.js)
        this.handleGroup.add(
            createAxisHandle(new THREE.Vector3(cx, cy, cz + shape.radiusY), 'radiusY', 'positive', this.element.id),
        );
        this.handleGroup.add(
            createAxisHandle(new THREE.Vector3(cx, cy, cz - shape.radiusY), 'radiusY', 'negative', this.element.id),
        );
        // Y axis (radiusZ in data = Y in Three.js, vertical)
        this.handleGroup.add(
            createAxisHandle(new THREE.Vector3(cx, cy + shape.radiusZ, cz), 'radiusZ', 'positive', this.element.id),
        );
        this.handleGroup.add(
            createAxisHandle(new THREE.Vector3(cx, cy - shape.radiusZ, cz), 'radiusZ', 'negative', this.element.id),
        );
    }
    // ----------------------------------------------------------------
    // EDIÇÃO
    // ----------------------------------------------------------------
    /**
     * Move handle de eixo → atualiza raio correspondente.
     * O arrasto é projetado na direção do eixo para manter simetria.
     */
    onAxisMove(axisName: any, direction: any, newPosition: any) {
        const shape = this.element.data.shape;
        const center = this.element.data.center;
        const cx = center.x || 0;
        const cy = center.y || -7.5;
        const cz = center.z || 0;
        let newRadius;
        if (axisName === 'radiusX') {
            newRadius = Math.abs(newPosition.x - cx);
        } else if (axisName === 'radiusY') {
            newRadius = Math.abs(newPosition.z - cz);
        } else if (axisName === 'radiusZ') {
            newRadius = Math.abs(newPosition.y - cy);
        }
        if (newRadius !== undefined && newRadius > 0.5) {
            shape[axisName] = newRadius;
            this._updateMeshScale();
        }
    }
    /**
     * Atualiza escala do grupo de shells do plume.
     * Cada shell é uma esfera unitária escalada por frac * radius.
     * @private
     */
    _updateMeshScale() {
        const shape = this.element.data.shape;
        const SHELL_FRACS = [0.25, 0.5, 0.75, 1.0];
        if (this.mesh.children) {
            this.mesh.children.forEach((shell: any, i: any) => {
                const frac = SHELL_FRACS[i] || 1;
                shell.scale.set(
                    shape.radiusX * frac,
                    shape.radiusZ * frac, // Y no Three.js = radiusZ no data
                    shape.radiusY * frac,
                );
            });
        }
    }
    onVertexMove() {} // Não usado
    onMidpointClick() {} // Não usado
    onVertexDelete() {
        return false;
    }
    onDrawPoint() {} // Não suportado
    onEditComplete() {
        // Reconstrói handles nas posições atualizadas
        this.createHandles();
    }
    // ----------------------------------------------------------------
    // INFORMAÇÕES
    // ----------------------------------------------------------------
    getVertexCount() {
        return 6; // 6 handles de eixo
    }
    supportsDrawMode() {
        return false;
    }
    dispose() {}
}
