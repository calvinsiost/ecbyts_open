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
   DRAG CONTROLLER — Mouse interaction for vertex handle dragging
   ================================================================

   Intercepta eventos de mouse no canvas para arrastar handles.
   Usa capture-phase listeners para ter prioridade sobre o picker.

   FLUXO:
   1. mousedown: raycast contra handles → se acertou, inicia drag
   2. mousemove: projeta mouse no plano de drag → move handle
   3. mouseup: finaliza drag, reabilita OrbitControls

   O plano de drag é perpendicular à direção da câmera,
   passando pela posição original do handle. Isso permite
   arrastar em 3D de forma intuitiva.

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { getCamera, getControls, getRenderer } from '../scene/setup.js';
import { getEditHandlesGroup } from '../scene/setup.js';
import { setCursorEnabled } from '../scene/cursorProjector.js';
import { updateHandleScales } from './handleFactory.js';
import { isGizmoActive, isGizmoDragging, isPointerOverGizmo } from './gizmoController.js';
import { isSnapEnabled, snapToGrid, snapToAxis, snapToNearestVertex } from './snapEngine.js';
import { showSnapGuide, hideSnapGuide, updateSnapGuideAnimation } from './snapGuideRenderer.js';
import { showCoordTooltip, hideCoordTooltip } from './coordTooltip.js';
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
let container: any = null;
let raycaster: any = null;
let _mouse: any = null;
let _dragPlane: any = null;
let _intersection: any = null;
function _getMouse() { if (!_mouse) _mouse = new THREE.Vector2(); return _mouse; }
function _getDragPlane() { if (!_dragPlane) _dragPlane = new THREE.Plane(); return _dragPlane; }
function _getIntersection() { if (!_intersection) _intersection = new THREE.Vector3(); return _intersection; }
let isDragging = false;
let activeHandle: any = null;
let _dragStartPos: any = null;
function _getDragStartPos() { if (!_dragStartPos) _dragStartPos = new THREE.Vector3(); return _dragStartPos; }
const mouseDownScreenPos = { x: 0, y: 0 };
let _cameraDir: any = null;
function _getCameraDir() { if (!_cameraDir) _cameraDir = new THREE.Vector3(); return _cameraDir; }
let _groundPlane: any = null;
function _getGroundPlane() { if (!_groundPlane) _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); return _groundPlane; }
let _tempVec3: any = null;
function _getTempVec3() { if (!_tempVec3) _tempVec3 = new THREE.Vector3(); return _tempVec3; }
// Callbacks
let onDragStart: any = null; // (handle: any) => void
let onDragMove: any = null; // (handle, newPosition: Vector3) => void
let onDragEnd: any = null; // (handle: any) => void
let onClick: any = null; // (handle, event: MouseEvent) => void
let onCanvasClick: any = null; // (position: Vector3) => void — click on empty space (draw mode)
let getEditingId: any = null; // () => string|null — getter para evitar import circular
// Posição pré-snap para guia visual
let _presnap: any = null;
function _getPresnap() { if (!_presnap) _presnap = new THREE.Vector3(); return _presnap; }
// Throttle
let lastMoveTime = 0;
const MOVE_INTERVAL = 16; // ~60fps
const DRAG_THRESHOLD = 5; // px — distinguir clique de arrasto
// ----------------------------------------------------------------
// INICIALIZAÇÃO
// ----------------------------------------------------------------
/**
 * Inicializa o drag controller.
 * Registra listeners de capture-phase no canvas.
 *
 * @param {HTMLElement} canvasContainer - Container do canvas (#canvas-container)
 * @param {Object} callbacks
 * @param {Function} callbacks.onDragStart - Chamado ao iniciar arrasto de handle
 * @param {Function} callbacks.onDragMove - Chamado a cada mousemove durante arrasto
 * @param {Function} callbacks.onDragEnd - Chamado ao finalizar arrasto
 * @param {Function} callbacks.onClick - Chamado ao clicar (sem arrastar) em handle
 * @param {Function} callbacks.onCanvasClick - Chamado ao clicar no vazio (draw mode)
 * @param {Function} [callbacks.getEditingId] - Getter do elemento atualmente em edicao
 */
export function initDragController(canvasContainer: any, callbacks: any = {}) {
    const _cb = callbacks;
    container = canvasContainer;
    raycaster = new THREE.Raycaster();
    onDragStart = _cb.onDragStart || null;
    onDragMove = _cb.onDragMove || null;
    onDragEnd = _cb.onDragEnd || null;
    onClick = _cb.onClick || null;
    onCanvasClick = _cb.onCanvasClick || null;
    getEditingId = _cb.getEditingId || null;
    // Capture phase: executa ANTES dos listeners normais (picker.js)
    container.addEventListener('mousedown', handleMouseDown, { capture: true });
    container.addEventListener('mousemove', handleMouseMove, { capture: true });
    container.addEventListener('mouseup', handleMouseUp, { capture: true });
}
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * mousedown: testa se clicou em handle.
 * Se sim, inicia drag e bloqueia OrbitControls.
 */
/** @param {any} event */
function handleMouseDown(event: any) {
    // Só botão esquerdo (0) inicia arrasto - ignora direito (2) e meio (1)
    if (event.button !== 0)
        return;
    // Gizmo ativo ou pointer sobre eixo do gizmo: TransformControls gerencia seus proprios eventos.
    // isGizmoDragging() cobre race condition onde _gizmoActive foi resetado antes do mouseup.
    // isPointerOverGizmo() cobre hover sobre eixo antes do drag começar.
    if (isGizmoActive() || isGizmoDragging() || isPointerOverGizmo())
        return;
    const handleGroup = getEditHandlesGroup();
    if (!handleGroup || handleGroup.children.length === 0)
        return;
    updateMouseCoords(event);
    mouseDownScreenPos.x = event.clientX;
    mouseDownScreenPos.y = event.clientY;
    const camera = getCamera();
    if (!camera)
        return;
    raycaster.setFromCamera(_getMouse(), camera);
    // Atualiza escala dos handles antes do raycast
    updateHandleScales(handleGroup);
    const intersects = raycaster.intersectObjects(handleGroup.children, false);
    if (intersects.length > 0) {
        activeHandle = intersects[0].object;
        _getDragStartPos().copy(activeHandle.position);
        // Cria plano de drag perpendicular à câmera, na posição do handle
        camera.getWorldDirection(_getCameraDir());
        _getDragPlane().setFromNormalAndCoplanarPoint(_getCameraDir().negate(), activeHandle.position);
        isDragging = false; // Será true no primeiro mousemove com threshold
        // Bloqueia OrbitControls e propagação
        const controls = getControls();
        if (controls)
            controls.enabled = false;
        event.stopPropagation();
        event.preventDefault();
    }
}
/**
 * mousemove: se arrastando handle, projeta nova posição.
 */
/** @param {any} event */
function handleMouseMove(event: any) {
    if (isGizmoActive() || isGizmoDragging())
        return;
    if (!activeHandle)
        return;
    // Throttle para 60fps
    const now = Date.now();
    if (now - lastMoveTime < MOVE_INTERVAL)
        return;
    lastMoveTime = now;
    // Verifica threshold para distinguir clique de arrasto
    const dx = Math.abs(event.clientX - mouseDownScreenPos.x);
    const dy = Math.abs(event.clientY - mouseDownScreenPos.y);
    if (!isDragging && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        isDragging = true;
        setCursorEnabled(false);
        if (onDragStart)
            onDragStart(activeHandle);
    }
    if (!isDragging)
        return;
    updateMouseCoords(event);
    const camera = getCamera();
    if (!camera)
        return;
    raycaster.setFromCamera(_getMouse(), camera);
    // Projeta raio no plano de drag
    if (raycaster.ray.intersectPlane(_getDragPlane(), _getIntersection())) {
        // Salva posição pré-snap para guia visual
        _getPresnap().copy(_getIntersection());
        // Snap-to-axis (Shift) e snap-to-grid
        if (event.shiftKey) {
            snapToAxis(_getIntersection(), _getDragStartPos());
        }
        let vertexSnapped = false;
        if (isSnapEnabled()) {
            // Vertex snap tem prioridade sobre grid snap
            const editingId = getEditingId ? getEditingId() : null;
            const result = (snapToNearestVertex as any)(_getIntersection(), editingId);
            if (result.snapped) {
                vertexSnapped = true;
                showSnapGuide(_getPresnap(), _getIntersection(), true);
            }
            else {
                (snapToGrid as any)(_getIntersection());
                // Grid snap: mostra guia se posição mudou
                if (_getPresnap().distanceToSquared(_getIntersection()) > 0.001) {
                    showSnapGuide(_getPresnap(), _getIntersection(), false);
                }
                else {
                    hideSnapGuide();
                }
            }
        }
        else {
            hideSnapGuide();
        }
        // Atualiza animação pulsante do snap target
        if (vertexSnapped)
            updateSnapGuideAnimation();
        // Mostra tooltip de coordenadas
        showCoordTooltip(event.clientX, event.clientY, _getIntersection());
        if (onDragMove)
            onDragMove(activeHandle, _getIntersection());
    }
    event.stopPropagation();
    event.preventDefault();
}
/**
 * mouseup: finaliza drag ou processa clique.
 */
/** @param {any} event */
function handleMouseUp(event: any) {
    if (event.button !== 0)
        return;
    if (isGizmoActive() || isGizmoDragging())
        return;
    if (!activeHandle) {
        // Verifica se foi clique no vazio (para draw mode)
        if (onCanvasClick) {
            const dx = Math.abs(event.clientX - mouseDownScreenPos.x);
            const dy = Math.abs(event.clientY - mouseDownScreenPos.y);
            if (dx <= DRAG_THRESHOLD && dy <= DRAG_THRESHOLD) {
                const camera = getCamera();
                if (camera) {
                    updateMouseCoords(event);
                    raycaster.setFromCamera(_getMouse(), camera);
                    // Projeta no plano XZ (y=0) por padrão
                    _getGroundPlane().set(_getGroundPlane().normal.set(0, 1, 0), 0);
                    if (raycaster.ray.intersectPlane(_getGroundPlane(), _getTempVec3())) {
                        onCanvasClick(_getTempVec3().clone());
                    }
                }
            }
        }
        return;
    }
    // Reabilita OrbitControls
    const controls = getControls();
    if (controls)
        controls.enabled = true;
    if (isDragging) {
        // Fim de arrasto - esconde guias visuais
        hideSnapGuide();
        hideCoordTooltip();
        if (onDragEnd)
            onDragEnd(activeHandle);
        event.stopPropagation();
        event.preventDefault();
    }
    else {
        // Foi clique (sem arrastar) - seleciona/deseleciona handle
        if (onClick)
            onClick(activeHandle, event);
        event.stopPropagation();
        event.preventDefault();
    }
    if (isDragging)
        setCursorEnabled(true);
    isDragging = false;
    activeHandle = null;
}
// ----------------------------------------------------------------
// COORDENADAS
// ----------------------------------------------------------------
/**
 * Converte posição do mouse para coordenadas NDC (-1 a 1).
 */
/** @param {any} event */
function updateMouseCoords(event: any) {
    const renderer = getRenderer();
    if (!renderer)
        return;
    const rect = renderer.domElement.getBoundingClientRect();
    _getMouse().x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _getMouse().y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}
// ----------------------------------------------------------------
// ESTADO PÚBLICO
// ----------------------------------------------------------------
/**
 * @returns {boolean} Se está arrastando um handle
 */
export function isDragActive() {
    return isDragging;
}
// ----------------------------------------------------------------
// LIMPEZA
// ----------------------------------------------------------------
/**
 * Remove listeners e limpa estado.
 */
export function destroyDragController() {
    if (container) {
        container.removeEventListener('mousedown', handleMouseDown, { capture: true });
        container.removeEventListener('mousemove', handleMouseMove, { capture: true });
        container.removeEventListener('mouseup', handleMouseUp, { capture: true });
    }
    isDragging = false;
    activeHandle = null;
    container = null;
    raycaster = null;
    onDragStart = null;
    onDragMove = null;
    onDragEnd = null;
    onClick = null;
    onCanvasClick = null;
    getEditingId = null;
}
//# sourceMappingURL=dragController.js.map