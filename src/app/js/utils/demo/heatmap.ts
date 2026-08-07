// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// @ts-check
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
   DEMO HEATMAP — VOC exposure heatmap visualization
   Visualizacao de heatmaps de exposicao a VOCs (Saude Ocupacional)

   Cria grids coloridos e rotas de trabalhadores usando Three.js.
   Gradiente: verde (seguro) -> amarelo (alerta) -> vermelho (NR-15).
   Tudo e temporario — removido ao sair da demo.

   ================================================================ */

import { getElementsGroup, requestRender } from '../scene/setup.js';
import { createTHREEProxy } from '../../core/three-lazy.js';

/** Three runtime namespace; local typings are intentionally narrow. */
const Three: any = createTHREEProxy();

/** @typedef {{x: number, z: number}} HeatmapPoint */
/** @typedef {{points: HeatmapPoint[], color?: string, hotspots?: HeatmapPoint[]}} WorkerRoute */

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

/** @type {any|null} Group containing all demo heatmap meshes */
let heatmapGroup: any = null;

// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------

function ensureGroup() {
    if (heatmapGroup) return heatmapGroup;

    heatmapGroup = new Three.Group();
    heatmapGroup.name = 'demo-heatmap-group';

    const elementsGroup = getElementsGroup();
    if (elementsGroup && elementsGroup.parent) {
        // Adiciona ao scene (mesmo nivel do elementsGroup)
        elementsGroup.parent.add(heatmapGroup);
    }
    return heatmapGroup;
}

// ----------------------------------------------------------------
// HEATMAP GRID
// ----------------------------------------------------------------

/**
 * Create a colored heatmap grid on the terrain.
 * Gera grid de planos coloridos representando concentracao de VOCs.
 *
 * @param {Object} params
 * @param {Array<Array<number>>} params.grid - 2D array of values (0-1)
 * @param {number} [params.cellSize] - Size of each cell in meters (default 2)
 * @param {number} [params.opacity] - Grid opacity (default 0.5)
 * @param {{x: number, y: number, z: number}} [params.origin] - Grid origin
 * @param {string} [params.colorScale] - 'risk' (green-yellow-red) or 'thermal'
 */
export function createHeatmapGrid(params: any) {
    const group = ensureGroup();
    const grid = params.grid;
    if (!grid || grid.length === 0) return;

    const cellSize = params.cellSize || 2;
    const opacity = params.opacity || 0.5;
    const origin = params.origin || { x: 0, y: 0.1, z: 0 };
    const colorScale = params.colorScale || 'risk';

    const rows = grid.length;
    const cols = grid[0].length;

    // Usa InstancedMesh para performance (1 draw call)
    const geometry = new Three.PlaneGeometry(cellSize * 0.95, cellSize * 0.95);
    geometry.rotateX(-Math.PI / 2); // Plano horizontal

    const material = new Three.MeshBasicMaterial({
        transparent: true,
        opacity,
        side: Three.DoubleSide,
        depthWrite: false,
    });

    const count = rows * cols;
    const instancedMesh = new Three.InstancedMesh(geometry, material, count);
    instancedMesh.name = 'demo-heatmap';

    const dummy = new Three.Object3D();
    const color = new Three.Color();
    let idx = 0;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const value = Math.max(0, Math.min(1, grid[r][c]));

            // Posicao da celula
            dummy.position.set(
                origin.x + c * cellSize - (cols * cellSize) / 2,
                origin.y,
                origin.z + r * cellSize - (rows * cellSize) / 2,
            );
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(idx, dummy.matrix);

            // Cor baseada no valor (0=seguro, 1=perigo)
            color.copy(getHeatmapColor(value, colorScale));
            instancedMesh.setColorAt(idx, color);

            idx++;
        }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

    group.add(instancedMesh);
    requestRender();
}

/**
 * Create worker route lines on the terrain.
 * Linhas representando rotas de trabalhadores sobre o heatmap.
 *
 * @param {WorkerRoute[]} routes
 */
export function createWorkerRoutes(routes: any) {
    if (!routes || routes.length === 0) return;
    const group = ensureGroup();

    for (const route of routes) {
        if (!route.points || route.points.length < 2) continue;

        const points = route.points.map((p: any) => new Three.Vector3(p.x, 0.3, p.z));

        const geometry = new Three.BufferGeometry().setFromPoints(points);
        const material = new Three.LineBasicMaterial({
            color: route.color ? new Three.Color(route.color) : new Three.Color(0xffffff),
            linewidth: 2,
            transparent: true,
            opacity: 0.8,
        });

        const line = new Three.Line(geometry, material);
        line.name = 'demo-worker-route';
        group.add(line);

        // Adiciona marcadores nos pontos de exposicao critica
        if (route.hotspots) {
            for (const hs of route.hotspots) {
                const sphereGeo = new Three.SphereGeometry(0.5, 8, 8);
                const sphereMat = new Three.MeshBasicMaterial({
                    color: 0xff4444,
                    transparent: true,
                    opacity: 0.8,
                });
                const sphere = new Three.Mesh(sphereGeo, sphereMat);
                sphere.position.set(hs.x, 0.5, hs.z);
                sphere.name = 'demo-hotspot';
                group.add(sphere);
            }
        }
    }

    requestRender();
}

/**
 * Remove all heatmap meshes from the scene.
 * Cleanup completo de todos os visuais de heatmap da demo.
 */
export function removeAllHeatmaps() {
    if (!heatmapGroup) return;

    // Dispoe todos os filhos
    while (heatmapGroup.children.length > 0) {
        const child = heatmapGroup.children[0];
        heatmapGroup.remove(child);

        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach((/** @type {any} */ m: any) => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    }

    // Remove grupo do scene
    if (heatmapGroup.parent) {
        heatmapGroup.parent.remove(heatmapGroup);
    }

    heatmapGroup = null;
    requestRender();
}

// ----------------------------------------------------------------
// COLOR SCALES
// ----------------------------------------------------------------

/**
 * Get heatmap color for a value (0-1).
 * @param {number} value - 0 (safe) to 1 (danger)
 * @param {string} scale - 'risk' or 'thermal'
 * @returns {any}
 */
function getHeatmapColor(value: any, scale = 'risk') {
    const c = new Three.Color();

    if (scale === 'thermal') {
        // Blue -> Cyan -> Yellow -> Red
        if (value < 0.33) {
            c.setHSL(0.6 - value * 0.6, 1, 0.5);
        } else if (value < 0.66) {
            c.setHSL(0.15, 1, 0.5);
        } else {
            c.setHSL(0.0, 1, 0.4 + (1 - value) * 0.2);
        }
    } else {
        // Risk scale: Green (0) -> Yellow (0.5) -> Red (1)
        if (value < 0.5) {
            // Green to Yellow
            const t = value * 2;
            c.r = t;
            c.g = 0.8;
            c.b = 0.1 * (1 - t);
        } else {
            // Yellow to Red
            const t = (value - 0.5) * 2;
            c.r = 1;
            c.g = 0.8 * (1 - t);
            c.b = 0;
        }
    }

    return c;
}
