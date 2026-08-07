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
   SNAP ENGINE — Grid snapping + axis constraints for editing
   ================================================================

   Fornece snap-to-grid e snap-to-axis para uso no drag controller
   e no gizmo controller.

   Snap-to-grid: arredonda coordenadas XZ para multiplos do grid.
   Snap-to-axis: restringe drag ao eixo mais proximo (Shift).

   Configuracao persistida em localStorage.

   ================================================================ */
import { safeSetItem } from '../storage/storageMonitor.js';
import { getAllElements } from '../../core/elements/manager.js';
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
const GRID_SIZES = [0.1, 0.25, 0.5, 1, 2, 5, 10];
const DEFAULT_GRID = 1;
let _snapEnabled = localStorage.getItem('ecbyts-snap-enabled') === '1';
let _gridSize = parseFloat(localStorage.getItem('ecbyts-snap-grid') || '') || DEFAULT_GRID;
// Valida gridSize carregado
if (!GRID_SIZES.includes(_gridSize)) _gridSize = DEFAULT_GRID;
// ----------------------------------------------------------------
// SNAP TO GRID
// ----------------------------------------------------------------
/**
 * Arredonda posicao XZ para o grid. Y nao e alterado (terreno).
 *
 * @param {any} position - Posicao a snapear (modificada in-place)
 * @param {number} [gridSize] - Override do grid size (usa config se omitido)
 * @returns {any} A mesma referencia, modificada
 */
export function snapToGrid(position: any, gridSize: any) {
    const g = gridSize || _gridSize;
    position.x = Math.round(position.x / g) * g;
    position.z = Math.round(position.z / g) * g;
    return position;
}
// ----------------------------------------------------------------
// SNAP TO AXIS
// ----------------------------------------------------------------
/**
 * Restringe movimento ao eixo dominante (o com maior delta).
 * Usado quando Shift e pressionado durante drag.
 *
 * @param {any} position - Posicao atual do drag
 * @param {any} startPos - Posicao inicial do drag
 * @returns {{position: any, axis: 'x'|'y'|'z'|null}} Posicao restringida + eixo dominante
 */
export function snapToAxis(position: any, startPos: any) {
    const dx = Math.abs(position.x - startPos.x);
    const dy = Math.abs(position.y - startPos.y);
    const dz = Math.abs(position.z - startPos.z);
    // Determina eixo dominante
    /** @type {'x'|'y'|'z'|null} */
    let axis: 'x' | 'y' | 'z' | null;
    if (dx >= dy && dx >= dz) {
        axis = 'x';
        position.y = startPos.y;
        position.z = startPos.z;
    } else if (dy >= dx && dy >= dz) {
        axis = 'y';
        position.x = startPos.x;
        position.z = startPos.z;
    } else {
        axis = 'z';
        position.x = startPos.x;
        position.y = startPos.y;
    }
    return { position, axis };
}
// ----------------------------------------------------------------
// SNAP TO NEAREST VERTEX (outros elementos)
// ----------------------------------------------------------------
/**
 * Busca o vértice mais próximo de qualquer elemento visível.
 * Exclui vértices do próprio elemento sendo editado.
 *
 * @param {any} position - Posição atual do drag
 * @param {string} excludeElementId - ID do elemento a ignorar (self)
 * @param {number} [threshold] - Distância máxima para snap (default: 1.5× grid size)
 * @returns {{snapped: boolean, position: any, targetElementId: string|null, targetElementName: string|null}} Resultado do snap
 */
export function snapToNearestVertex(position: any, excludeElementId: any, threshold: any) {
    const maxDist = threshold || _gridSize * 1.5;
    const maxDistSq = maxDist * maxDist;
    let bestDistSq = maxDistSq;
    let bestX = position.x;
    let bestY = position.y;
    let bestZ = position.z;
    let targetId = null;
    let targetName = null;
    const elements = getAllElements();
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el)
            continue;
        if (el.id === excludeElementId) continue;
        if (!el.data) continue;
        // Coleta posições de vértice conforme a família
        const pts = _extractVertexPositions(el);
        for (let j = 0; j < pts.length; j++) {
            const p = pts[j];
            if (!p)
                continue;
            const dx = position.x - p.x;
            const dy = position.y - p.y;
            const dz = position.z - p.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestX = p.x;
                bestY = p.y;
                bestZ = p.z;
                targetId = el.id;
                targetName = el.name || el.id;
            }
        }
    }
    if (targetId) {
        position.x = bestX;
        position.y = bestY;
        position.z = bestZ;
        return { snapped: true, position, targetElementId: targetId, targetElementName: targetName };
    }
    return { snapped: false, position, targetElementId: null, targetElementName: null };
}
/**
 * Extrai posições de vértices de um elemento.
 * Suporta todas as famílias: vertices[], path[], position, center.
 * @private
 * @param {Object} el - Elemento
 * @returns {{x: number, y: number, z: number}[]}
 */
function _extractVertexPositions(el: any) {
    const d = el.data;
    /** @type {Array<{x: number, y: number, z: number}>} */
    const pts: any[] = [];
    // Polygon/boundary/building: vertices[]
    if (d.vertices && Array.isArray(d.vertices)) {
        for (const v of d.vertices) {
            pts.push({ x: v.x || 0, y: v.y || 0, z: v.z || 0 });
        }
        return pts;
    }
    // River: path[]
    if (d.path && Array.isArray(d.path)) {
        for (const v of d.path) {
            pts.push({ x: v.x || 0, y: v.y || 0, z: v.z || 0 });
        }
        return pts;
    }
    // Point elements (well, spring, waste, etc.): position or coordinates
    if (d.position) {
        pts.push({ x: d.position.x || 0, y: d.position.y || 0, z: d.position.z || 0 });
        return pts;
    }
    // Wells/springs with coordinates format (easting/northing/elevation)
    if (d.coordinates) {
        pts.push({
            x: d.coordinates.easting || d.coordinates.x || 0,
            y: d.coordinates.elevation || d.coordinates.y || 0,
            z: d.coordinates.northing || d.coordinates.z || 0,
        });
        return pts;
    }
    // Ellipsoid (plume): center
    if (d.center) {
        pts.push({ x: d.center.x || 0, y: d.center.y || 0, z: d.center.z || 0 });
        return pts;
    }
    return pts;
}
// ----------------------------------------------------------------
// CONFIGURACAO
// ----------------------------------------------------------------
/** @returns {boolean} Se snap esta habilitado */
export function isSnapEnabled() {
    return _snapEnabled;
}
/** Alterna snap on/off */
export function toggleSnap() {
    _snapEnabled = !_snapEnabled;
    safeSetItem('ecbyts-snap-enabled', _snapEnabled ? '1' : '0');
    window.dispatchEvent(
        new CustomEvent('ecbt:snapChanged', {
            detail: { enabled: _snapEnabled, gridSize: _gridSize },
        }),
    );
    return _snapEnabled;
}
/** @returns {number} Grid size atual em metros */
export function getGridSize() {
    return _gridSize;
}
/**
 * Define grid size.
 * @param {number} size - Novo grid size (deve estar em GRID_SIZES)
 */
export function setGridSize(size: any) {
    if (!GRID_SIZES.includes(size)) return;
    _gridSize = size;
    safeSetItem('ecbyts-snap-grid', String(size));
    window.dispatchEvent(
        new CustomEvent('ecbt:snapChanged', {
            detail: { enabled: _snapEnabled, gridSize: _gridSize },
        }),
    );
}
/** @returns {number[]} Lista de grid sizes disponiveis */
export function getAvailableGridSizes() {
    return [...GRID_SIZES];
}
