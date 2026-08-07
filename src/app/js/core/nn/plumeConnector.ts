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
   PLUME CONNECTOR — Bridge between NN predictions and 3D plume mesh
   Conector entre predicoes da rede neural e malha 3D da pluma

   Aplica resultados do simulador What-If diretamente na geometria
   da pluma no viewport 3D. A pluma muda de tamanho/posicao em
   tempo real conforme o usuario arrasta os sliders.

   Padrao de rebuild: remove + re-add (mesmo do inspector/nn.js:303)
   Rate limiting: max 10fps (100ms) via requestAnimationFrame gating
   ================================================================ */
import { getElementById, removeElement, addElement, getMeshByElementId } from '../elements/manager.js';
import { requestRender } from '../../utils/scene/setup.js';
import { deepClone } from '../../utils/helpers/deepClone.js';
// ----------------------------------------------------------------
// MODULE STATE - Original snapshots and rate limiting
// ----------------------------------------------------------------
/** @type {Map<string, Object>} Original element data before What-If */
const _snapshots = new Map();
/** Rate limiting: prevent mesh rebuild faster than ~10fps */
let _lastRebuildTime = 0;
/** @type {number | null} */
let _pendingRebuild: any = null;
const MIN_REBUILD_INTERVAL = 100; // ms
// ----------------------------------------------------------------
// APPLY PREDICTION - Update plume mesh from What-If outputs
// Aplica predicao da rede neural na geometria da pluma
// ----------------------------------------------------------------
/**
 * Apply prediction outputs to a plume element.
 * Atualiza shape/center da pluma e reconstroi a malha 3D.
 *
 * @param {string} elementId - Target plume element ID
 * @param {Object<string, number>} outputs - { plume_radiusX, plume_radiusY, plume_radiusZ, plume_centerX, plume_centerY, plume_centerZ }
 * @param {number} confidence - 0-1 confidence score
 */
export function applyPredictionToPlume(elementId: any, outputs: any, confidence: any) {
    const element = getElementById(elementId);
    if (!element || element.family !== 'plume')
        return;
    // Snapshot original data on first update
    if (!_snapshots.has(elementId)) {
        _snapshots.set(elementId, deepClone(element.data));
    }
    // Update element data with prediction outputs
    if (!element.data.shape)
        element.data.shape = {};
    if (!element.data.center)
        element.data.center = {};
    if (outputs.plume_radiusX != null)
        element.data.shape.radiusX = outputs.plume_radiusX;
    if (outputs.plume_radiusY != null)
        element.data.shape.radiusY = outputs.plume_radiusY;
    if (outputs.plume_radiusZ != null)
        element.data.shape.radiusZ = outputs.plume_radiusZ;
    if (outputs.plume_centerX != null)
        element.data.center.x = outputs.plume_centerX;
    if (outputs.plume_centerY != null)
        element.data.center.y = outputs.plume_centerY;
    if (outputs.plume_centerZ != null)
        element.data.center.z = outputs.plume_centerZ;
    // Rate-limited mesh rebuild
    _scheduleRebuild(elementId, confidence);
}
// ----------------------------------------------------------------
// UNCERTAINTY VISUALIZATION - Modify outer shell opacity
// Visualizacao de incerteza via opacidade das cascas externas
// ----------------------------------------------------------------
/**
 * Apply uncertainty visualization to plume mesh shells.
 * Menor confianca = bordas mais translucidas (fuzzy).
 *
 * @param {string} elementId
 * @param {number} confidence - 0-1
 */
export function applyUncertaintyVisualization(elementId: any, confidence: any) {
    const mesh = getMeshByElementId(elementId);
    if (!mesh || !mesh.children)
        return;
    // Plume mesh is THREE.Group with 4 shell children
    // Shell opacities (base): [0.65, 0.40, 0.22, 0.08]
    const baseOpacities = [0.65, 0.4, 0.22, 0.08];
    for (let i = 0; i < mesh.children.length && i < baseOpacities.length; i++) {
        const shell = mesh.children[i];
        if (!shell.material)
            continue;
        // Inner shells (0,1) keep full opacity; outer shells (2,3) scale by confidence
        const confScale = i < 2 ? 1.0 : 0.3 + 0.7 * confidence;
        shell.material.opacity = baseOpacities[i]! * confScale;
        shell.material.needsUpdate = true;
    }
    requestRender();
}
// ----------------------------------------------------------------
// RESET - Restore plume to original state
// Restaura pluma ao estado original (antes do What-If)
// ----------------------------------------------------------------
/**
 * Reset plume to its original data before What-If modifications.
 * @param {string} elementId
 */
export function resetPlumeToOriginal(elementId: any) {
    const snapshot = _snapshots.get(elementId);
    if (!snapshot)
        return;
    const element = getElementById(elementId);
    if (!element) {
        _snapshots.delete(elementId);
        return;
    }
    // Restore original data
    element.data.shape = /** @type {any} */ (snapshot).shape ? { ... /** @type {any} */(snapshot).shape } : element.data.shape;
    element.data.center = /** @type {any} */ (snapshot).center ? { ... /** @type {any} */(snapshot).center } : element.data.center;
    // Rebuild mesh with original data
    _rebuildPlumeMesh(elementId);
    // Clean up snapshot
    _snapshots.delete(elementId);
}
// ----------------------------------------------------------------
// INTERNAL - Rate-limited mesh rebuild (remove + re-add pattern)
// ----------------------------------------------------------------
/**
 * @param {string} elementId
 * @param {number} confidence
 */
function _scheduleRebuild(elementId: any, confidence: any) {
    const now = performance.now();
    const elapsed = now - _lastRebuildTime;
    if (elapsed >= MIN_REBUILD_INTERVAL) {
        // Enough time passed - rebuild immediately
        _lastRebuildTime = now;
        _rebuildPlumeMesh(elementId);
        if (confidence != null) {
            // Apply uncertainty after rebuild (needs new mesh)
            requestAnimationFrame(() => {
                applyUncertaintyVisualization(elementId, confidence);
            });
        }
    }
    else {
        // Too soon - schedule for next available frame
        if (_pendingRebuild)
            cancelAnimationFrame(_pendingRebuild);
        _pendingRebuild = requestAnimationFrame(() => {
            _lastRebuildTime = performance.now();
            _pendingRebuild = null;
            _rebuildPlumeMesh(elementId);
            if (confidence != null) {
                requestAnimationFrame(() => {
                    applyUncertaintyVisualization(elementId, confidence);
                });
            }
        });
    }
}
/**
 * Rebuild plume mesh using remove + re-add pattern.
 * Reconstroi malha da pluma via remocao e re-adicao ao cenario.
 */
/** @param {string} elementId */
function _rebuildPlumeMesh(elementId: any) {
    const element = getElementById(elementId);
    if (!element)
        return;
    const { id, family, name, data, stamps, messages, color, label, iconClass } = element;
    // Remove old mesh and element
    removeElement(id);
    // Re-add with updated data
    addElement(family, id, name, data, { stamps, messages, color, label, iconClass });
}
