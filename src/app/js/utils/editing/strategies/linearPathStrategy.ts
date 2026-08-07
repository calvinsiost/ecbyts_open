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
   LINEAR PATH STRATEGY — Vertex editing para famílias lineares
   ================================================================

   TRUST-001 #3 promotion (6/7 + 7/7): infra_linear + route_flow.

   Estratégia de edição irmã da PathStrategy (que é codemod-governed e
   hardcoda rebuildRiverGeometry). Esta versão dispatchea o rebuilder
   por element.family — permite que diferentes famílias lineares (rio,
   estrada, duto, rota de amostragem) tenham renderers distintos sem
   conflitar com a estratégia legada do river.

   Por que NÃO ampliar PathStrategy:
     pathStrategy.ts tem header "Generated from src/... by TS-MIGRATION-001.
     Do not edit manually" — codemod-governed; rota R1 = claude-executor.
     Esta strategy paralela mora em arquivo hand-authored, claude-adm pode
     manter sem conflito com codemod.

   Compatibilidade com editManager:
     Implementa o mesmo contrato que PathStrategy: createHandles,
     updateMidpoints, onVertexMove, onMidpointClick, onVertexDelete,
     onDrawPoint, onEditComplete, getVertexCount, supportsDrawMode, dispose.
   ================================================================ */

import { createTHREEProxy } from '../../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { createVertexHandle, disposeHandles } from '../handleFactory.js';
import {
    rebuildRiverGeometry,
    rebuildInfraLinearGeometry,
    rebuildRouteFlowGeometry,
} from '../../../core/elements/meshFactory.js';

export class LinearPathStrategy {
    element: any;
    handleGroup: any;
    mesh: any;

    constructor(element: any, handleGroup: any, mesh: any) {
        this.element = element;
        this.handleGroup = handleGroup;
        this.mesh = mesh;
        if (!this.element.data) this.element.data = {};
        if (!this.element.data.path || this.element.data.path.length < 2) {
            this.element.data.path = [
                { x: -20, y: 0, z: 0 },
                { x: 20, y: 0, z: 0 },
            ];
        }
    }

    createHandles() {
        disposeHandles(this.handleGroup);
        const path = this.element.data.path;
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            const pos = new THREE.Vector3(p.x, p.y || 0.1, p.z);
            const handle = createVertexHandle(pos, i, this.element.id);
            this.handleGroup.add(handle);
        }
    }

    updateMidpoints() {
        // Path-based — sem midpoints; novos pontos via draw mode.
    }

    /**
     * Dispatch por family — escolhe o rebuilder de geometria correto.
     */
    _rebuildMeshGeometry(path: any) {
        const fam = this.element?.family;
        const width = this.element?.data?.width;
        if (fam === 'infra_linear') {
            rebuildInfraLinearGeometry(this.mesh, path, this.element.data);
            return;
        }
        if (fam === 'route_flow') {
            rebuildRouteFlowGeometry(this.mesh, path, this.element.data);
            return;
        }
        // Fallback — pattern legado de river (preserva comportamento se outras
        // famílias lineares forem registradas no futuro).
        rebuildRiverGeometry(this.mesh, path, width);
    }

    onVertexMove(vertexIndex: number, newPosition: any) {
        const path = this.element.data.path;
        if (vertexIndex < 0 || vertexIndex >= path.length) return;
        path[vertexIndex].x = newPosition.x;
        path[vertexIndex].y = newPosition.y;
        path[vertexIndex].z = newPosition.z;
        this._rebuildMeshGeometry(path);
    }

    onMidpointClick() {}

    onVertexDelete(vertexIndex: number) {
        const path = this.element.data.path;
        if (path.length <= 2) return false;
        if (vertexIndex < 0 || vertexIndex >= path.length) return false;
        path.splice(vertexIndex, 1);
        this._rebuildMeshGeometry(path);
        this.createHandles();
        return true;
    }

    onDrawPoint(position: any) {
        this.element.data.path.push({
            x: position.x,
            y: position.y,
            z: position.z,
        });
        this._rebuildMeshGeometry(this.element.data.path);
        this.createHandles();
    }

    onEditComplete() {
        this.element.data.path.forEach((p: any) => {
            if (p.y !== undefined && Math.abs(p.y) < 0.01) delete p.y;
        });
    }

    getVertexCount() {
        return this.element.data.path?.length || 0;
    }

    supportsDrawMode() {
        return true;
    }

    dispose() {}
}
