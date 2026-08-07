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
   EDIT MANAGER — State machine for shape editing + gizmo transform
   ================================================================

   Gerencia o estado do editor de formas:
   - Qual elemento está sendo editado
   - Qual modo está ativo (idle, edit, draw, gizmo)
   - Qual estratégia (polygon, path, ellipsoid, etc.) está em uso

   MÁQUINA DE ESTADOS:
   IDLE ──[enterEditMode]──► EDITING ──[toggleDrawMode]──► DRAWING
     │         ▲                 │                             │
     │         └─────────────────┘◄────[exitEditMode]──────────┘
     │         ▲                 │
     │    [G toggle]        [G toggle]
     │         │                 │
     └──[enterGizmoMode]──► GIZMO ──[exitGizmoMode]──► IDLE

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { getEditHandlesGroup } from '../scene/setup.js';
import { getElementById, getMeshByElementId, getElementsByFamily } from '../../core/elements/manager.js';
import { disposeHandles, selectHandle, deselectHandle } from './handleFactory.js';
import { initDragController, destroyDragController } from './dragController.js';
import { showEditToolbar, hideEditToolbar, updateEditToolbar } from './editToolbar.js';
import { pushSnapshot } from '../history/manager.js';
import { attachGizmo, detachGizmo, getGizmoPosition, setGizmoPosition, } from './gizmoController.js';
import { getFamily } from '../../core/elements/families.js';
import { isContainerFamily } from '../../core/elements/_elementsHierarchyPure.js';

// Telemetry drain (claude - bug 2026-06-14): famílias sem malha 3D não suportam
// gizmo. Tentar entrar no gizmo nelas disparava o warn de mesh ausente
// (~66 hits/30d). Containers (site_*) agrupam, `post` é placa CSS2D — nenhum
// tem Three.Mesh. Guard early-return silencioso (debug, não warn).
function _familyHasNoMesh(elementFamily: any): boolean {
    if (elementFamily === 'post') return true;
    return isContainerFamily(elementFamily, getFamily);
}
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
/** @type {any} */
let editingElementId: any = null;
let editMode = 'idle'; // 'idle' | 'edit' | 'draw' | 'gizmo'
/** @type {any} */
let activeStrategy: any = null;
/** @type {any} */
let container: any = null;
// Multi-select: Set de vértices e handles selecionados
/** @type {Set<number>} */
const selectedVertexIndices = new Set();
/** @type {Set<any>} */
const selectedHandles: Set<any> = new Set();
// Posições iniciais dos vértices selecionados para multi-drag (index → {x,y,z})
/** @type {Map<number, {x: number, y: number, z: number}>} */
const _multiDragStartPositions = new Map();
// Temp vec para multi-drag - evita alocação por frame
let _tempMultiVec: any = null;
function _getTempMultiVec() { if (!_tempMultiVec) _tempMultiVec = new THREE.Vector3(); return _tempMultiVec; }
/**
 * Limpa toda a seleção de vértices.
 * @private
 */
function _clearSelection() {
    for (const h of selectedHandles)
        deselectHandle(h);
    selectedHandles.clear();
    selectedVertexIndices.clear();
    _multiDragStartPositions.clear();
}
// Estratégias registradas: familyId → StrategyConstructor
const strategyRegistry = new Map();
// Opacidade atual do elemento em edição (1.0 = sólido, 0.0 = invisível)
let _currentOpacity = 1.0;
// ----------------------------------------------------------------
// REGISTRO DE ESTRATÉGIAS
// ----------------------------------------------------------------
/**
 * Registra uma estratégia de edição para uma família.
 *
 * @param {string} familyId - ID da família (ex: 'boundary', 'river')
 * @param {Function} StrategyClass - Construtor da estratégia
 */
export function registerStrategy(familyId: any, StrategyClass: any) {
    strategyRegistry.set(familyId, StrategyClass);
}
/**
 * Verifica se uma família tem estratégia de edição.
 * @param {string} familyId
 * @returns {boolean}
 */
export function hasStrategy(familyId: any) {
    return strategyRegistry.has(familyId);
}
// ----------------------------------------------------------------
// INICIALIZAÇÃO
// ----------------------------------------------------------------
/**
 * Inicializa o editor de formas.
 * Configura o drag controller e os listeners.
 *
 * @param {HTMLElement} canvasContainer - Container do canvas
 */
export function initEditor(canvasContainer: any) {
    container = canvasContainer;
    initDragController(canvasContainer, {
        onDragStart: handleDragStart,
        onDragMove: handleDragMove,
        onDragEnd: handleDragEnd,
        onClick: handleHandleClick,
        onCanvasClick: handleCanvasClick,
        getEditingId: () => editingElementId,
    });
    // Registra os atalhos de teclado de edição (nav [ ] 1 2 3 + nudge por setas).
    // Antes ninguém chamava enableKeyboardNav → os atalhos ficavam mortos. O handler
    // se auto-guarda com isEditing(), então é seguro ligar uma única vez no boot.
    // Import dinâmico evita fragilidade de ciclo (editNavigation importa deste módulo).
    import('./editNavigation.js')
        .then((nav: any) => nav.enableKeyboardNav?.())
        .catch((e: any) => console.debug('[editManager:initEditor] keyboardNav', e?.message || e));
}
// ----------------------------------------------------------------
// ENTRAR/SAIR DO MODO DE EDIÇÃO
// ----------------------------------------------------------------
/**
 * Entra no modo de edição para um elemento.
 * Cria handles de vértice e mostra toolbar.
 *
 * @param {string} elementId - ID do elemento a editar
 * @returns {boolean} true se entrou com sucesso
 */
export function enterEditMode(elementId: any) {
    if (!elementId) {
        console.warn('[EditManager] enterEditMode: no elementId');
        return false;
    }
    const element = getElementById(elementId);
    if (!element) {
        console.warn('[EditManager] enterEditMode: element not found:', elementId);
        return false;
    }
    // Verifica se tem estratégia para esta família
    const StrategyClass = strategyRegistry.get(element.family);
    if (!StrategyClass) {
        console.warn('[EditManager] enterEditMode: no strategy for family:', element.family, '— registered:', [
            ...strategyRegistry.keys(),
        ]);
        return false;
    }
    // Sai do modo atual.
    // FIX (2026-05-29, claude-adm, TRUST-001 #3 deep dive): se já estamos em GIZMO
    // (mesmo ID ou outro), precisamos chamar exitGizmoMode() — antes a checagem só
    // chamava exitEditMode() em IDs diferentes, deixando _gizmoActive=true mesmo
    // após trocar para shape-edit. Isso travava o dragController (linha 115:
    // `if (isGizmoActive() ...) return`), inviabilizando drag de vértice por mouse
    // e quebrando a verificação agentic do tipo "selecionou → enterEditMode no
    // mesmo id depois de uma seleção que abriu gizmo".
    if (editMode === 'gizmo') {
        exitGizmoMode();
    }
    else if (editingElementId && editingElementId !== elementId) {
        exitEditMode();
    }
    const handleGroup = getEditHandlesGroup();
    if (!handleGroup) {
        console.warn('[EditManager] enterEditMode: handleGroup is null — scene not initialized?');
        return false;
    }
    const mesh = getMeshByElementId(elementId);
    if (!mesh) {
        console.warn('[EditManager] enterEditMode: mesh not found for element:', elementId);
        return false;
    }
    // Instancia estratégia
    editingElementId = elementId;
    editMode = 'edit';
    _clearSelection();
    activeStrategy = new StrategyClass(element, handleGroup, mesh);
    activeStrategy.createHandles();
    // Coletar lista de editáveis da mesma família para carousel
    _currentOpacity = 1.0;
    const editableList = getElementsByFamily(element.family)
        .filter((el: any) => strategyRegistry.has(el.family))
        .sort((/** @type {any} */ a, b: any) => (a.name || a.id).localeCompare(b.name || b.id));
    const editableIndex = editableList.findIndex((el: any) => el.id === elementId);
    // UI - mostra aba Edit na ribbon + indicador flutuante
    showEditToolbar({
        onDone: () => exitEditMode(),
        onDraw: () => toggleDrawMode(),
        onDelete: () => deleteSelectedVertex(),
        onPrev: () => switchToNextEditable(-1),
        onNext: () => switchToNextEditable(1),
        onOpacity: (v: any) => setElementOpacity(v),
        vertexCount: activeStrategy.getVertexCount?.() || 0,
        drawSupported: activeStrategy.supportsDrawMode?.() || false,
        elementName: element.name || element.id,
        editableCount: editableList.length,
        currentEditableIndex: editableIndex,
    });
    if (container)
        container.style.cursor = 'crosshair';
    window.dispatchEvent(new CustomEvent('shapeEditChanged', {
        detail: { editing: true, elementId },
    }));
    return true;
}
/**
 * Sai do modo de edição.
 * Remove handles, esconde toolbar, restaura estado.
 */
export function exitEditMode() {
    if (editMode === 'idle')
        return;
    const handleGroup = getEditHandlesGroup();
    if (handleGroup)
        disposeHandles(handleGroup);
    if (activeStrategy) {
        activeStrategy.dispose?.();
        activeStrategy = null;
    }
    // Restaurar opacity antes de sair
    if (editingElementId) {
        const mesh = getMeshByElementId(editingElementId);
        if (mesh)
            _applyOpacityToMesh(mesh, 1.0);
    }
    _currentOpacity = 1.0;
    const prevId = editingElementId;
    editingElementId = null;
    editMode = 'idle';
    _clearSelection();
    hideEditToolbar();
    if (container)
        container.style.cursor = 'default';
    window.dispatchEvent(new CustomEvent('shapeEditChanged', {
        detail: { editing: false, elementId: prevId },
    }));
}
/**
 * Alterna modo de desenho (draw mode).
 * No draw mode, clicar no viewport adiciona vértices.
 */
export function toggleDrawMode() {
    if (editMode === 'idle')
        return;
    if (editMode === 'draw') {
        editMode = 'edit';
    }
    else {
        editMode = 'draw';
        // Deseleciona vértices ao entrar em draw mode
        _clearSelection();
    }
    updateEditToolbar({
        drawActive: editMode === 'draw',
        vertexCount: activeStrategy?.getVertexCount?.() || 0,
    });
}
// ----------------------------------------------------------------
// CALLBACKS DO DRAG CONTROLLER
// ----------------------------------------------------------------
function handleDragStart(handle: any) {
    // Se o handle arrastado está na multi-seleção, salva posições de todos para delta calc
    if (handle.userData.handleType === 'vertex' && selectedHandles.has(handle)) {
        _multiDragStartPositions.clear();
        for (const h of selectedHandles) {
            _multiDragStartPositions.set(h.userData.vertexIndex, {
                x: h.position.x,
                y: h.position.y,
                z: h.position.z,
            });
        }
    }
    else {
        // Handle não está na seleção → limpa multi-select
        _clearSelection();
        _multiDragStartPositions.clear();
    }
}
function handleDragMove(handle: any, newPosition: any) {
    if (!activeStrategy)
        return;
    const type = handle.userData.handleType;
    if (type === 'vertex') {
        // Multi-select: mover todos os vértices selecionados pelo mesmo delta
        if (_multiDragStartPositions.size > 1) {
            const dragIdx = handle.userData.vertexIndex;
            const startPos = _multiDragStartPositions.get(dragIdx);
            if (startPos) {
                const dx = newPosition.x - startPos.x;
                const dy = newPosition.y - startPos.y;
                const dz = newPosition.z - startPos.z;
                for (const h of selectedHandles) {
                    const idx = h.userData.vertexIndex;
                    const sp = _multiDragStartPositions.get(idx);
                    if (!sp)
                        continue;
                    const pos = _getTempMultiVec().set(sp.x + dx, sp.y + dy, sp.z + dz);
                    activeStrategy.onVertexMove(idx, pos);
                    h.position.copy(pos);
                }
                activeStrategy.updateMidpoints?.();
            }
        }
        else {
            activeStrategy.onVertexMove(handle.userData.vertexIndex, newPosition);
            handle.position.copy(newPosition);
            activeStrategy.updateMidpoints?.();
        }
    }
    else if (type === 'axis') {
        activeStrategy.onAxisMove?.(handle.userData.axisName, handle.userData.direction, newPosition);
        handle.position.copy(newPosition);
    }
    else if (type === 'midpoint') {
        // Midpoints podem ser arrastados para adicionar vértice e mover imediatamente
        const afterIndex = handle.userData.afterIndex;
        activeStrategy.onMidpointDrag?.(afterIndex, newPosition);
    }
}
function handleDragEnd(_handle: any) {
    if (!activeStrategy)
        return;
    activeStrategy.onEditComplete?.();
    pushSnapshot();
    _multiDragStartPositions.clear();
    // Atualiza toolbar com contagem de vértices
    updateEditToolbar({
        vertexCount: activeStrategy.getVertexCount?.() || 0,
        selectedCount: selectedVertexIndices.size,
        drawActive: editMode === 'draw',
    });
}
function handleHandleClick(handle: any, event: any) {
    if (!activeStrategy)
        return;
    const type = handle.userData.handleType;
    if (type === 'midpoint') {
        // Clique em midpoint → limpa seleção e insere vértice
        _clearSelection();
        const afterIndex = handle.userData.afterIndex;
        activeStrategy.onMidpointClick(afterIndex);
        pushSnapshot();
        updateEditToolbar({
            vertexCount: activeStrategy.getVertexCount?.() || 0,
            selectedCount: 0,
            drawActive: editMode === 'draw',
        });
    }
    else if (type === 'vertex') {
        const idx = handle.userData.vertexIndex;
        const isShift = event?.shiftKey || false;
        if (isShift) {
            // Shift+click: toggle na multi-seleção
            if (selectedVertexIndices.has(idx)) {
                selectedVertexIndices.delete(idx);
                selectedHandles.delete(handle);
                deselectHandle(handle);
            }
            else {
                selectedVertexIndices.add(idx);
                selectedHandles.add(handle);
                selectHandle(handle);
            }
        }
        else {
            // Click sem Shift: single-select (limpa anterior)
            if (selectedVertexIndices.size === 1 && selectedVertexIndices.has(idx)) {
                // Toggle off
                _clearSelection();
            }
            else {
                _clearSelection();
                selectedVertexIndices.add(idx);
                selectedHandles.add(handle);
                selectHandle(handle);
            }
        }
        updateEditToolbar({
            vertexCount: activeStrategy.getVertexCount?.() || 0,
            selectedCount: selectedVertexIndices.size,
            drawActive: editMode === 'draw',
        });
    }
}
function handleCanvasClick(position: any) {
    if (editMode !== 'draw' || !activeStrategy)
        return;
    activeStrategy.onDrawPoint(position);
    pushSnapshot();
    updateEditToolbar({
        vertexCount: activeStrategy.getVertexCount?.() || 0,
        drawActive: true,
    });
}
// ----------------------------------------------------------------
// OPERAÇÕES PÚBLICAS
// ----------------------------------------------------------------
/**
 * Deleta o vértice atualmente selecionado.
 * Chamado pela ribbon Edit e pelo atalho Delete.
 */
export function deleteSelectedVertex() {
    if (selectedVertexIndices.size === 0 || !activeStrategy)
        return;
    // Deleta em ordem reversa para não deslocar índices
    const indices = [...selectedVertexIndices].sort((a: any, b: any) => b - a);
    let anyDeleted = false;
    for (const idx of indices) {
        const deleted = activeStrategy.onVertexDelete(idx);
        if (deleted)
            anyDeleted = true;
    }
    if (anyDeleted) {
        _clearSelection();
        pushSnapshot();
        updateEditToolbar({
            vertexCount: activeStrategy.getVertexCount?.() || 0,
            selectedCount: 0,
            drawActive: editMode === 'draw',
        });
    }
}
/**
 * Reseta a forma do elemento para o padrão da família.
 * Sai do edit mode e recria o mesh do zero.
 */
export function resetShape() {
    if (!editingElementId || !activeStrategy)
        return;
    const element = getElementById(editingElementId);
    if (!element)
        return;
    // Restaura dados padrão baseado na família
    if (element.family === 'boundary') {
        element.data.vertices = [
            { x: -30, z: -30 },
            { x: 30, z: -30 },
            { x: 30, z: 30 },
            { x: -30, z: 30 },
        ];
    }
    else if (element.family === 'river') {
        element.data.path = [
            { x: -20, y: 0, z: 0 },
            { x: 20, y: 0, z: 0 },
        ];
    }
    else if (element.family === 'plume') {
        element.data.shape = { radiusX: 10, radiusY: 8, radiusZ: 4 };
    }
    else if (element.family === 'lake') {
        element.data.shape = { radiusX: 10, radiusY: 8 };
    }
    else if (element.family === 'building') {
        const pos = element.data.position || { x: 0, y: 0, z: 0 };
        const px = pos.x || 0;
        const pz = pos.z || 0;
        delete element.data.footprint;
        element.data.vertices = [
            { x: px - 5, z: pz - 5 },
            { x: px + 5, z: pz - 5 },
            { x: px + 5, z: pz + 5 },
            { x: px - 5, z: pz + 5 },
        ];
        element.data.height = 5;
    }
    else if (element.family === 'tank') {
        element.data.dimensions = { diameter: 3, length: 6 };
    }
    // Re-entra no edit mode para recriar handles e mesh
    const id = element.id;
    exitEditMode();
    pushSnapshot();
    enterEditMode(id);
}
// ----------------------------------------------------------------
// GIZMO MODE - translate/rotate/scale do elemento inteiro
// ----------------------------------------------------------------
/**
 * Entra no modo gizmo para um elemento.
 * Vincula TransformControls ao mesh selecionado.
 *
 * @param {string} elementId - ID do elemento
 * @returns {boolean} true se entrou com sucesso
 */
export function enterGizmoMode(elementId: any) {
    if (!elementId) {
        console.warn('[EditManager] enterGizmoMode: no elementId');
        return false;
    }
    const element = getElementById(elementId);
    if (!element) {
        console.warn('[EditManager] enterGizmoMode: element not found:', elementId);
        return false;
    }
    // Famílias sem malha (containers, post) não têm gizmo — early-return quieto.
    if (_familyHasNoMesh(element.family)) {
        console.debug('[EditManager] enterGizmoMode: família sem malha 3D (container/post), gizmo indisponível:', element.family);
        return false;
    }
    // Sai do modo atual se ativo
    if (editMode !== 'idle') {
        if (editMode === 'gizmo')
            exitGizmoMode();
        else
            exitEditMode();
    }
    const mesh = getMeshByElementId(elementId);
    if (!mesh) {
        console.warn('[EditManager] enterGizmoMode: mesh not found for element:', elementId);
        return false;
    }
    editingElementId = elementId;
    editMode = 'gizmo';
    const attached = attachGizmo(elementId, mesh);
    if (attached === false) {
        console.warn('[EditManager] enterGizmoMode: attachGizmo failed');
        editingElementId = null;
        editMode = 'idle';
        return false;
    }
    // UI - mostra toolbar de gizmo
    const hasStrategy = strategyRegistry.has(element.family);
    showEditToolbar({
        onDone: () => exitGizmoMode(),
        vertexCount: 0,
        drawSupported: false,
        elementName: element.name || element.id,
        gizmoMode: true,
        canToggleShapeEdit: hasStrategy,
    });
    if (container)
        container.style.cursor = 'move';
    window.dispatchEvent(new CustomEvent('shapeEditChanged', {
        detail: { editing: true, gizmo: true, elementId },
    }));
    return true;
}
/**
 * Sai do modo gizmo.
 */
export function exitGizmoMode() {
    if (editMode !== 'gizmo')
        return;
    detachGizmo();
    const prevId = editingElementId;
    editingElementId = null;
    editMode = 'idle';
    hideEditToolbar();
    if (container)
        container.style.cursor = 'default';
    window.dispatchEvent(new CustomEvent('shapeEditChanged', {
        detail: { editing: false, gizmo: false, elementId: prevId },
    }));
}
/**
 * Alterna entre gizmo mode e shape edit mode.
 * So funciona se o elemento tem strategy registrada.
 */
export function toggleGizmoShapeEdit() {
    if (!editingElementId)
        return;
    const element = getElementById(editingElementId);
    if (!element)
        return;
    if (editMode === 'gizmo') {
        // Gizmo → Shape edit (se tem strategy)
        if (strategyRegistry.has(element.family)) {
            const id = editingElementId;
            exitGizmoMode();
            enterEditMode(id);
        }
    }
    else if (editMode === 'edit' || editMode === 'draw') {
        // Shape edit → Gizmo
        const id = editingElementId;
        exitEditMode();
        enterGizmoMode(id);
    }
}
// ----------------------------------------------------------------
// GETTERS PÚBLICOS
// ----------------------------------------------------------------
/** @returns {boolean} Se está em modo de edição (qualquer modo) */
export function isEditing() {
    return editMode !== 'idle';
}
/** @returns {string|null} ID do elemento sendo editado */
export function getEditingElementId() {
    return editingElementId;
}
/** @returns {string} Modo atual: 'idle' | 'edit' | 'draw' | 'gizmo' */
export function getEditMode() {
    return editMode;
}
/** @returns {number} Índice do primeiro vértice selecionado (-1 se nenhum) */
export function getSelectedVertexIndex() {
    if (selectedVertexIndices.size === 0)
        return -1;
    return selectedVertexIndices.values().next().value ?? -1;
}
/** @returns {Set<number>} Todos os índices de vértices selecionados */
export function getSelectedVertexIndices() {
    return selectedVertexIndices;
}
/** @returns {number} Quantidade de vértices selecionados */
export function getSelectedCount() {
    return selectedVertexIndices.size;
}
/**
 * Retorna posição do handle/vértice selecionado (primeiro da seleção).
 * @returns {{x: number, y: number, z: number}|null}
 */
export function getSelectedHandlePosition() {
    if (editMode === 'gizmo') {
        const pos = getGizmoPosition();
        return pos ? { x: pos.x, y: pos.y, z: pos.z } : null;
    }
    if (selectedHandles.size > 0) {
        const handle = selectedHandles.values().next().value;
        return {
            x: handle.position.x,
            y: handle.position.y,
            z: handle.position.z,
        };
    }
    return null;
}
/**
 * Nudge da seleção atual por um delta em UM eixo (acessibilidade/teclado — WCAG).
 * Reaproveita o mesmo caminho de aplicação do drag por mouse (gizmo →
 * setGizmoPosition; shape-edit → onVertexMove/onAxisMove da estratégia), então o
 * resultado é idêntico ao arrasto e o snapshot de history faz Ctrl+Z reverter
 * igual (TRUST-005). Não-mouse: única forma de mover geometria por teclado.
 *
 * @param {'x'|'y'|'z'} axis  Eixo de mundo (x=easting, y=elevação, z=northing)
 * @param {number} resolver      Deslocamento em unidades de mundo (pode ser negativo)
 * @returns {boolean} true se algo se moveu
 */
/**
 * Núcleo compartilhado de movimento de seleção em UM eixo. `resolver(atual)` devolve
 * o novo valor (delta para nudge, absoluto para input de coordenada). Funciona em
 * gizmo (setGizmoPosition) E shape-edit (onVertexMove/onAxisMove da estratégia, mesmo
 * apply do drag) + pushSnapshot (Ctrl+Z reverte). Lê/escreve no MESMO frame que a
 * ribbon exibe (handle.position no shape-edit; gizmo world no gizmo) → auto-consistente.
 * @param {'x'|'y'|'z'} axis
 * @param {(current: number) => number} resolver
 * @returns {boolean}
 */
function _moveSelectionAxis(axis: 'x' | 'y' | 'z', resolver: (current: number) => number) {
    if (editMode === 'idle' || (axis !== 'x' && axis !== 'y' && axis !== 'z'))
        return false;
    if (editMode === 'gizmo') {
        const pos = getGizmoPosition();
        if (!pos)
            return false;
        const nv = resolver(pos[axis]);
        if (!Number.isFinite(nv))
            return false;
        const next = { x: pos.x, y: pos.y, z: pos.z };
        next[axis] = nv;
        setGizmoPosition(next);
        pushSnapshot();
        return true;
    }
    // shape-edit / edit: move os handles selecionados pelo mesmo apply do drag.
    if (!activeStrategy || selectedHandles.size === 0)
        return false;
    let moved = false;
    for (const handle of selectedHandles) {
        if (!handle?.position)
            continue;
        const nv = resolver(handle.position[axis]);
        if (!Number.isFinite(nv))
            continue;
        const newPos = handle.position.clone();
        newPos[axis] = nv;
        const type = handle.userData?.handleType;
        if (type === 'vertex') {
            activeStrategy.onVertexMove?.(handle.userData.vertexIndex, newPos);
            handle.position.copy(newPos);
            moved = true;
        }
        else if (type === 'axis') {
            activeStrategy.onAxisMove?.(handle.userData.axisName, handle.userData.direction, newPos);
            handle.position.copy(newPos);
            moved = true;
        }
    }
    if (!moved)
        return false;
    activeStrategy.updateMidpoints?.();
    activeStrategy.onEditComplete?.();
    pushSnapshot();
    updateEditToolbar({
        vertexCount: activeStrategy.getVertexCount?.() || 0,
        selectedCount: selectedVertexIndices.size,
        drawActive: editMode === 'draw',
    });
    return true;
}
/**
 * Nudge da seleção por um delta em UM eixo (acessibilidade/teclado — WCAG).
 * @param {'x'|'y'|'z'} axis
 * @param {number} delta  Deslocamento em unidades de mundo (pode ser negativo)
 * @returns {boolean} true se algo se moveu
 */
export function nudgeSelection(axis: 'x' | 'y' | 'z', delta: number) {
    if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0)
        return false;
    return _moveSelectionAxis(axis, (cur) => cur + delta);
}
/**
 * Move a seleção para uma coordenada ABSOLUTA em um eixo (campos X/Y/Z da ribbon).
 * Resolve o TODO de shapeEdit.ts: agora funciona em gizmo E shape-edit (antes só gizmo;
 * em shape-edit os campos eram inputs mortos — TRUST-001 #5). Mesmo apply do drag.
 * @param {'x'|'y'|'z'} axis
 * @param {number} value  Coordenada absoluta no frame exibido pela ribbon
 * @returns {boolean} true se algo se moveu
 */
export function setSelectionCoordinate(axis: 'x' | 'y' | 'z', value: number) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return false;
    return _moveSelectionAxis(axis, () => value);
}
// ----------------------------------------------------------------
// AÇÕES PARA MENU DE CONTEXTO
// ----------------------------------------------------------------
/**
 * Insere vértice na posição do ponto médio (midpoint).
 * Chamado pelo menu de contexto ao clicar com botão direito num midpoint.
 *
 * @param {number} afterIndex - Índice do vértice anterior
 */
export function insertVertexAtMidpoint(afterIndex: any) {
    if (!activeStrategy)
        return;
    activeStrategy.onMidpointClick(afterIndex);
    pushSnapshot();
    updateEditToolbar({
        vertexCount: activeStrategy?.getVertexCount?.() || 0,
        drawActive: editMode === 'draw',
    });
}
/**
 * Adiciona vértice em posição específica no viewport.
 * Chamado pelo menu de contexto no modo draw.
 *
 * @param {any} position - Posição 3D no mundo
 */
export function addVertexAtPosition(position: any) {
    if (!activeStrategy)
        return;
    activeStrategy.onDrawPoint(position);
    pushSnapshot();
    updateEditToolbar({
        vertexCount: activeStrategy?.getVertexCount?.() || 0,
        drawActive: editMode === 'draw',
    });
}
/**
 * Seleciona um vértice por índice e destaca o handle.
 * Chamado pelo menu de contexto ao clicar com botão direito num vértice.
 *
 * @param {number} index - Índice do vértice
 * @param {any} handle - Mesh do handle a destacar
 */
export function selectVertexByIndex(index: any, handle: any) {
    _clearSelection();
    selectedVertexIndices.add(index);
    selectedHandles.add(handle);
    selectHandle(handle);
}
// ----------------------------------------------------------------
// QUICK SWITCH - carousel entre elementos editáveis da mesma família
// ----------------------------------------------------------------
/**
 * Retorna lista de elementos da mesma família que têm estratégia registrada,
 * ordenados pelo nome (para ordem estável no carousel).
 *
 * @returns {Array<any>} Array de objetos element
 */
export function getEditablesByFamily() {
    if (!editingElementId)
        return [];
    const current = getElementById(editingElementId);
    if (!current)
        return [];
    const siblings = getElementsByFamily(current.family);
    return siblings
        .filter((el: any) => strategyRegistry.has(el.family))
        .sort((/** @type {any} */ a, b: any) => (a.name || a.id).localeCompare(b.name || b.id));
}
/**
 * Retorna o índice do elemento atual no array de getEditablesByFamily().
 * @returns {number} -1 se não estiver editando
 */
export function getCurrentEditableIndex() {
    if (!editingElementId)
        return -1;
    const list = getEditablesByFamily();
    return list.findIndex((el: any) => el.id === editingElementId);
}
/**
 * Troca para elemento adjacente da mesma família, preservando estado do editor.
 *
 * @param {number} [direction=1] - +1 próximo, -1 anterior (wrap circular)
 */
export function switchToNextEditable(direction = 1) {
    const list = getEditablesByFamily();
    if (list.length < 2)
        return;
    const idx = getCurrentEditableIndex();
    if (idx === -1)
        return;
    const next = (((idx + direction) % list.length) + list.length) % list.length;
    const nextItem = list[next];
    if (nextItem)
        switchToElement(nextItem.id);
}
/**
 * Troca para um elemento específico, preservando modo draw/gizmo, opacity e snap.
 *
 * @param {string} targetId - ID do elemento destino
 */
export function switchToElement(targetId: any) {
    if (!editingElementId || targetId === editingElementId)
        return;
    // Preservar estado atual antes de sair
    const preservedMode = editMode; // 'edit' | 'draw' | 'gizmo'
    const preservedOpacity = _currentOpacity;
    // Sair do modo atual sem tocar na toolbar (re-enter irá reconstituir)
    _performSwitch(targetId, { preservedMode, preservedOpacity });
}
/**
 * @private
 * Executa a troca para targetId com estado preservado.
 */
function _performSwitch(
targetId: any,
{ preservedMode, preservedOpacity }: any) {
    const element = getElementById(targetId);
    if (!element)
        return;
    const StrategyClass = strategyRegistry.get(element.family);
    if (!StrategyClass)
        return;
    const handleGroup = getEditHandlesGroup();
    if (!handleGroup)
        return;
    const mesh = getMeshByElementId(targetId);
    if (!mesh)
        return;
    // Restaurar opacity do elemento anterior antes de trocar
    const prevMesh = getMeshByElementId(editingElementId);
    if (prevMesh)
        _applyOpacityToMesh(prevMesh, 1.0);
    // Dispor handles atuais
    disposeHandles(handleGroup);
    if (activeStrategy) {
        activeStrategy.dispose?.();
        activeStrategy = null;
    }
    // Iniciar novo elemento
    editingElementId = targetId;
    _clearSelection();
    activeStrategy = new StrategyClass(element, handleGroup, mesh);
    activeStrategy.createHandles();
    // Aplicar opacity preservada
    _currentOpacity = preservedOpacity;
    _applyOpacityToMesh(mesh, _currentOpacity);
    // Re-entrar no modo draw se estava activo
    if (preservedMode === 'draw' && activeStrategy.supportsDrawMode?.()) {
        editMode = 'draw';
        activeStrategy.enterDrawMode?.();
    }
    else {
        editMode = 'edit';
    }
    // Atualizar toolbar com novo contexto
    const list = getEditablesByFamily();
    const idx = list.findIndex((el: any) => el.id === targetId);
    updateEditToolbar({
        vertexCount: activeStrategy.getVertexCount?.() || 0,
        drawActive: editMode === 'draw',
        elementName: element.name || element.id,
        editableCount: list.length,
        currentEditableIndex: idx,
    });
    window.dispatchEvent(new CustomEvent('shapeEditChanged', { detail: { editing: true, elementId: targetId } }));
}
// ----------------------------------------------------------------
// OPACITY - controle de transparência do elemento em edição
// ----------------------------------------------------------------
/**
 * Define a opacidade do mesh do elemento em edição.
 * Valores aceitos: 0.2, 0.6, 1.0 (presets) ou qualquer float em [0, 1].
 *
 * @param {number} value - Opacidade (0.0–1.0)
 */
export function setElementOpacity(value: any) {
    if (value == null)
        value = 1;
    const num = Number(value);
    const clamped = Math.max(0, Math.min(1, Number.isNaN(num) ? 1 : num));
    _currentOpacity = clamped;
    if (!editingElementId)
        return;
    const mesh = getMeshByElementId(editingElementId);
    if (mesh)
        _applyOpacityToMesh(mesh, clamped);
}
/**
 * Retorna a opacidade atual do elemento em edição.
 * @returns {number}
 */
export function getElementOpacity() {
    return _currentOpacity;
}
/**
 * @private
 * Aplica opacidade a um mesh (suporta Group e Mesh).
 */
function _applyOpacityToMesh(mesh: any, opacity: any) {
    mesh.traverse((obj: any) => {
        if (obj.isMesh && obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m: any) => {
                m.transparent = opacity < 1.0;
                m.opacity = opacity;
                m.needsUpdate = true;
            });
        }
    });
}
// ----------------------------------------------------------------
// LIMPEZA
// ----------------------------------------------------------------
/**
 * Destrói o editor completamente.
 */
export function destroyEditor() {
    exitEditMode();
    destroyDragController();
    container = null;
    strategyRegistry.clear();
}
