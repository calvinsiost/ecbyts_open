// Generated from src/app/js/utils/editing/snapGuideRenderer.ts by TS-MIGRATION-001. Do not edit manually.
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
   SNAP GUIDE RENDERER — Visual feedback for snap operations
   ================================================================

   Renderiza feedback visual quando o snap está ativo durante drag:
   - Linha tracejada (cyan) do ponto original ao ponto snapped
   - Esfera pulsante (amarela) no snap target (vertex snap)

   Geometrias persistentes — só position/visibility mudam por frame.
   Zero alocação por frame (Vector3 reutilizados).

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { getEditHandlesGroup } from '../scene/setup.js';
// ----------------------------------------------------------------
// CONSTANTES VISUAIS
// ----------------------------------------------------------------
const GUIDE_COLOR = 0x00ddff;
const TARGET_COLOR = 0xffdd00;
const DASH_SIZE = 0.5;
const GAP_SIZE = 0.3;
const TARGET_RADIUS = 0.6;
const PULSE_SPEED = 4; // ciclos por segundo
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
/** @type {any} */
let _guideLine: any = null;
/** @type {any} */
let _targetSphere: any = null;
let _visible = false;
let _startTime = 0;
// Pooled Vector3 - evita alocação por frame
let _pts: any = null;
// ----------------------------------------------------------------
// INICIALIZAÇÃO LAZY
// ----------------------------------------------------------------
/**
 * Cria geometrias persistentes na primeira chamada.
 * @private
 */
function _ensureObjects() {
    if (_guideLine) return;
    _pts = [new THREE.Vector3(), new THREE.Vector3()];
    // Linha tracejada (2 pontos - atualiza posição, não recria)
    const lineGeom = new THREE.BufferGeometry().setFromPoints(_pts);
    const lineMat = new THREE.LineDashedMaterial({
        color: GUIDE_COLOR,
        dashSize: DASH_SIZE,
        gapSize: GAP_SIZE,
        depthTest: false,
        transparent: true,
        opacity: 0.7,
    });
    _guideLine = new THREE.Line(lineGeom, lineMat);
    _guideLine.renderOrder = 1000;
    _guideLine.visible = false;
    _guideLine.name = 'snap_guide_line';
    _guideLine.frustumCulled = false;
    // Esfera wireframe pulsante no snap target
    const sphereGeom = new THREE.SphereGeometry(TARGET_RADIUS, 12, 12);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: TARGET_COLOR,
        wireframe: true,
        depthTest: false,
        transparent: true,
        opacity: 0.8,
    });
    _targetSphere = new THREE.Mesh(sphereGeom, sphereMat);
    _targetSphere.renderOrder = 1001;
    _targetSphere.visible = false;
    _targetSphere.name = 'snap_guide_target';
    const group = getEditHandlesGroup();
    if (group) {
        group.add(_guideLine);
        group.add(_targetSphere);
    }
}
// ----------------------------------------------------------------
// API PÚBLICA
// ----------------------------------------------------------------
/**
 * Mostra guia de snap (linha tracejada do ponto original ao snapped).
 *
 * @param {any} fromPos - Posição original (antes do snap)
 * @param {any} toPos - Posição snapped (depois do snap)
 * @param {boolean} [showTarget=false] - Se true, mostra esfera pulsante no target
 */
export function showSnapGuide(fromPos: any, toPos: any, showTarget: any = false) {
    _ensureObjects();
    // Atualiza pontos da linha
    _pts[0].copy(fromPos);
    _pts[1].copy(toPos);
    const posAttr = _guideLine.geometry.getAttribute('position');
    posAttr.setXYZ(0, _pts[0].x, _pts[0].y, _pts[0].z);
    posAttr.setXYZ(1, _pts[1].x, _pts[1].y, _pts[1].z);
    posAttr.needsUpdate = true;
    // LineDashedMaterial requer computeLineDistances após atualizar posições
    _guideLine.computeLineDistances();
    _guideLine.visible = true;
    // Esfera no target
    if (showTarget) {
        _targetSphere.position.copy(toPos);
        _targetSphere.visible = true;
        if (!_visible) _startTime = performance.now();
    } else {
        _targetSphere.visible = false;
    }
    _visible = true;
}
/**
 * Esconde todas as guias de snap.
 */
export function hideSnapGuide() {
    if (!_visible) return;
    if (_guideLine) _guideLine.visible = false;
    if (_targetSphere) _targetSphere.visible = false;
    _visible = false;
}
/**
 * Atualiza animação pulsante da esfera target.
 * Chamar dentro do render loop ou do drag handler.
 */
export function updateSnapGuideAnimation() {
    if (!_visible || !_targetSphere?.visible) return;
    const elapsed = (performance.now() - _startTime) / 1000;
    const scale = 0.8 + 0.4 * Math.sin(elapsed * PULSE_SPEED * Math.PI);
    _targetSphere.scale.setScalar(scale);
}
/**
 * @returns {boolean} Se a guia de snap está visível
 */
export function isSnapGuideVisible() {
    return _visible;
}
/**
 * Remove geometrias. Chamar ao destruir o editor.
 */
export function disposeSnapGuide() {
    if (_guideLine) {
        _guideLine.geometry.dispose();
        _guideLine.material.dispose();
        _guideLine.removeFromParent();
        _guideLine = null;
    }
    if (_targetSphere) {
        _targetSphere.geometry.dispose();
        _targetSphere.material.dispose();
        _targetSphere.removeFromParent();
        _targetSphere = null;
    }
    _visible = false;
}
