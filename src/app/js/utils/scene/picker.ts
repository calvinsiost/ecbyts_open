// @ts-check
// Generated from src/app/js/utils/scene/picker.ts by TS-MIGRATION-001. Do not edit manually.
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
   SELETOR 3D (SCENE PICKER)
   ================================================================

   Permite clicar em objetos 3D na cena para seleciona-los.
   Usa raycasting — um "raio" invisivel que sai da camera ate o
   ponto clicado na tela e detecta quais objetos 3D cruza.

   FUNCIONALIDADES:
   - Clicar em elemento 3D seleciona no painel lateral
   - Destaque visual (brilho azul) no elemento selecionado
   - Cursor muda para "pointer" ao passar sobre elementos
   - Clicar no vazio deseleciona o elemento atual

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import {
    getCamera,
    getElementsGroup,
    getRenderer,
    getVoxelGroup,
    getIssuesGroup,
    requestRender,
    setOutlineSelection,
    clearOutlineSelection,
} from './setup.js';
import { getInterpolationGroup } from '../../core/interpolation/manager.js';
import { hitTestLabel } from '../labels/manager.js';
import { isVoxelEditing } from '../../core/voxel/editController.js';
import { isEditing, getEditMode } from '../editing/editManager.js';
import { getMeshByElementId, getElementById } from '../../core/elements/manager.js';
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
let raycaster: any = null;
let _mouse: any = null;
function _getMouse() { if (!_mouse) _mouse = new THREE.Vector2(); return _mouse; }
let container: any = null;
let onSelectCallback: any = null;
let onDeselectCallback: any = null;
let onSelectLayerCallback: any = null;
// Highlight state
let highlightedMesh: any = null;
let originalEmissive: any = null;
let originalEmissiveIntensity = 0;
// Hover highlight (separado da selecao)
/** @type {any} */
let _hoveredElementId: any = null;
/** @type {any} */
let _selectedHighlightMesh: any = null;
// Drag detection - evita selecionar ao orbitar
const mouseDownPos = { x: 0, y: 0 };
// eslint-disable-next-line
let isDrag = false;
const DRAG_THRESHOLD = 5; // px
// Hover throttle
let lastHoverTime = 0;
const HOVER_INTERVAL = 50; // ms
// Tab-cycling - cicla entre objetos sobrepostos no mesmo ponto de click
let _cycleIndex = 0;
let _lastClickX = -1;
let _lastClickY = -1;
const CYCLE_RADIUS = 5; // px — mesmo que DRAG_THRESHOLD
// ----------------------------------------------------------------
// INICIALIZACAO
// ----------------------------------------------------------------
/**
 * Inicializa o seletor 3D.
 * Adiciona listeners de clique e movimento no container do canvas.
 *
 * @param {HTMLElement} canvasContainer - Container do canvas Three.js (#canvas-container)
 * @param {any} callbacks - Callbacks de selecao
 */
export function initPicker( canvasContainer: any, callbacks: any = /** @type {any} */ ({})) {
    if (!canvasContainer) {
        console.warn('[Picker] Canvas container not found');
        return;
    }
    container = canvasContainer;
    raycaster = new THREE.Raycaster();
    onSelectCallback = callbacks.onSelect || null;
    onDeselectCallback = callbacks.onDeselect || null;
    onSelectLayerCallback = callbacks.onSelectLayer || null;
    container.addEventListener('mousedown', onCanvasMouseDown);
    container.addEventListener('mouseup', onCanvasMouseUp);
    container.addEventListener('mousemove', onCanvasHover);
}
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * Registra posicao do mousedown para detectar drag.
 */
/** @param {any} event */
function onCanvasMouseDown( event: any) {
    if (event.button !== 0) return;
    mouseDownPos.x = event.clientX;
    mouseDownPos.y = event.clientY;
    isDrag = false;
}
/**
 * Handler de mouseup no canvas.
 * So seleciona se o mouse nao se moveu muito (nao foi drag/orbit).
 */
/** @param {any} event */
function onCanvasMouseUp( event: any) {
    if (event.button !== 0) return;
    // Voxel edit mode intercepta clicks via capture-phase
    if (isVoxelEditing()) return;
    // RED-C1: Shape editing (edit/draw) takes priority - but gizmo mode allows re-selection
    if (isEditing() && getEditMode() !== 'gizmo') return;
    // Detectar se foi drag
    const dx = Math.abs(event.clientX - mouseDownPos.x);
    const dy = Math.abs(event.clientY - mouseDownPos.y);
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) return;
    // Hit-test labels (screen-space) - labels ficam acima dos meshes
    const labelHit = hitTestLabel(event.clientX, event.clientY);
    if (labelHit) {
        if (event.shiftKey) {
            const mesh = getMeshByElementId(labelHit);
            if (mesh && window.handleCreateIssueAtPosition) {
                const pos = new THREE.Vector3();
                mesh.getWorldPosition(pos);
                (window.handleCreateIssueAtPosition as any)({ x: pos.x, y: pos.y, z: pos.z }, labelHit);
            }
            return;
        }
        // Delega ao callback de selecao (handleSelectElement) que faz highlight,
        // gizmo mode, painel lateral, etc. - mesmo path do raycaster.
        if (onSelectCallback) onSelectCallback(labelHit);
        _selectedHighlightMesh = highlightedMesh;
        return;
    }
    const camera = getCamera();
    const elementsGroup = getElementsGroup();
    if (!camera || !elementsGroup) return;
    updateMouseCoords(event);
    raycaster.setFromCamera(_getMouse(), camera);
    // Shift+click: issue creation gesture (ADR issues #4)
    if (event.shiftKey) {
        // eslint-disable-next-line
        const issuesGroup = getIssuesGroup();
        const targets = [...elementsGroup.children];
        // Raycast against elements + ground (y=0 plane)
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersects = raycaster.intersectObjects(targets, true);
        let point,
            elementId = null;
        if (intersects.length > 0) {
            point = intersects[0].point;
            elementId = findElementId(intersects[0].object);
        } else {
            // Fallback: intersect ground plane
            point = new THREE.Vector3();
            raycaster.ray.intersectPlane(groundPlane, point);
        }
        if (point && window.handleCreateIssueAtPosition) {
            (window.handleCreateIssueAtPosition as any)({ x: point.x, y: point.y, z: point.z }, elementId);
        }
        return; // Consume event — no element selection
    }
    const intersects = raycaster.intersectObjects(elementsGroup.children, true);
    if (intersects.length > 0) {
        // Tab-cycling: detectar click no mesmo ponto para ciclar entre sobrepostos
        const sameSpot =
            Math.abs(event.clientX - _lastClickX) <= CYCLE_RADIUS &&
            Math.abs(event.clientY - _lastClickY) <= CYCLE_RADIUS;
        // Coletar elementIds unicos + priorizar conteúdo sobre container (best-practice
        // "select most-specific": pluma dentro da geologia é selecionada antes do estrato;
        // cycling alcança os containers). Dedup: pluma com 4 shells = 1 hit.
        const uniqueHits = collectUniqueHitIds(intersects);
        if (uniqueHits.length > 0) {
            if (sameSpot && uniqueHits.length > 1) {
                _cycleIndex = (_cycleIndex + 1) % uniqueHits.length;
            } else {
                _cycleIndex = 0;
            }
            _lastClickX = event.clientX;
            _lastClickY = event.clientY;
            const elementId = uniqueHits[_cycleIndex];
            const mesh = getMeshByElementId(elementId);
            if (mesh) highlightMesh(mesh);
            _selectedHighlightMesh = highlightedMesh;
            if (onSelectCallback) {
                onSelectCallback(elementId);
            }
            return;
        }
    }
    // Tenta layers de interpolação
    const interpGroup = getInterpolationGroup();
    if (interpGroup && interpGroup.children.length > 0) {
        const layerHits = raycaster.intersectObjects(interpGroup.children, true);
        if (layerHits.length > 0) {
            const layerId = findLayerId(layerHits[0].object);
            if (layerId && onSelectLayerCallback) {
                onSelectLayerCallback(layerId);
                return;
            }
        }
    }
    // Tenta volumes voxelizados
    const voxelGroup = getVoxelGroup();
    if (voxelGroup && voxelGroup.children.length > 0) {
        const voxelHits = raycaster.intersectObjects(voxelGroup.children, false);
        if (voxelHits.length > 0) {
            const volumeId = voxelHits[0].object.userData?.volumeId;
            if (volumeId && window.handleSelectVolume) {
                window.handleSelectVolume(volumeId);
                return;
            }
        }
    }
    // Clicou no vazio - deselecionar
    if (onDeselectCallback) {
        onDeselectCallback();
    }
    _selectedHighlightMesh = null;
    _hoveredElementId = null;
    clearHighlight();
}
/**
 * Handler de hover no canvas.
 * Muda cursor para "pointer" ao passar sobre elemento.
 * Throttled para performance.
 */
/** @param {any} event */
function onCanvasHover( event: any) {
    if (isVoxelEditing()) return;
    // INP fix (2026-04-12): skip hover raycasting + highlight DOM writes
    // while the user is actively dragging the camera (OrbitControls owns
    // the interaction). Cursor can't hover anything meaningful while
    // panning/rotating, and the DOM mutations from highlight updates
    // were keeping the mutation-observer busy during Shift+drag pan,
    // inflating reported INP duration from ~1s to ~2.8s.
    if (event.buttons !== 0) return;
    const now = Date.now();
    if (now - lastHoverTime < HOVER_INTERVAL) return;
    lastHoverTime = now;
    const camera = getCamera();
    const elementsGroup = getElementsGroup();
    if (!camera || !elementsGroup || !container) return;
    updateMouseCoords(event);
    raycaster.setFromCamera(_getMouse(), camera);
    const intersects = raycaster.intersectObjects(elementsGroup.children, true);
    if (intersects.length > 0) {
        // Hover prioriza conteúdo sobre container (mesma regra do clique) — assim o
        // elemento DENTRO da geologia recebe o destaque/cursor, dando feedback de que
        // é selecionável (antes o hover só marcava o oclusor mais próximo).
        const elementId = collectUniqueHitIds(intersects)[0] || null;
        container.style.cursor = elementId ? 'pointer' : 'default';
        // Hover highlight - evidencia o elemento sob o cursor
        if (elementId && elementId !== _hoveredElementId) {
            // Limpa hover anterior (preserva selecao)
            if (_hoveredElementId && highlightedMesh && highlightedMesh !== _selectedHighlightMesh) {
                clearHighlight();
            }
            _hoveredElementId = elementId;
            if (!_selectedHighlightMesh || highlightedMesh !== _selectedHighlightMesh) {
                const mesh = getMeshByElementId(elementId);
                if (mesh) highlightMesh(mesh);
            }
        }
    } else {
        // Mouse saiu de elemento - limpa hover (preserva selecao)
        if (_hoveredElementId) {
            _hoveredElementId = null;
            if (highlightedMesh && highlightedMesh !== _selectedHighlightMesh) {
                clearHighlight();
            }
        }
        // Verifica layers de interpolação
        const interpGroup = getInterpolationGroup();
        if (interpGroup && interpGroup.children.length > 0) {
            const layerHits = raycaster.intersectObjects(interpGroup.children, true);
            container.style.cursor = layerHits.length > 0 && findLayerId(layerHits[0].object) ? 'pointer' : 'default';
        } else {
            // Hit-test labels para cursor pointer (labels sao pointer-events:none)
            const labelHover = hitTestLabel(event.clientX, event.clientY);
            container.style.cursor = labelHover ? 'pointer' : 'default';
        }
    }
}
// ----------------------------------------------------------------
// COORDENADAS
// ----------------------------------------------------------------
/**
 * Converte posicao do mouse para coordenadas normalizadas (-1 a 1).
 * Three.js usa sistema de coordenadas normalizado (NDC).
 *
 * @param {MouseEvent} event - Evento do mouse
 */
function updateMouseCoords( event: any) {
    const renderer = getRenderer();
    if (!renderer) return;
    const rect = renderer.domElement.getBoundingClientRect();
    _getMouse().x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _getMouse().y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}
// ----------------------------------------------------------------
// BUSCA DE ELEMENTO
// ----------------------------------------------------------------
/**
 * Busca o elementId subindo na hierarquia do objeto 3D.
 * Meshes podem ser filhos de grupos, entao subimos ate encontrar userData.elementId.
 *
 * @param {any} object - Objeto 3D interseccionado
 * @returns {string|null} - ID do elemento ou null
 */
function findElementId( object: any) {
    let current = object;
    while (current) {
        if (current.userData && current.userData.elementId) {
            return current.userData.elementId;
        }
        current = current.parent;
        // Parar no grupo de elementos (nao subir alem)
        const elementsGroup = getElementsGroup();
        if (current === elementsGroup) break;
    }
    return null;
}
// ----------------------------------------------------------------
// PRIORIDADE DE SELEÇÃO (conteúdo dentro de container)
// ----------------------------------------------------------------
/**
 * Famílias "container/enclosing" — grandes volumes/superfícies que ENVOLVEM outros
 * elementos (geologia, áreas, limites). Ao apontar/clicar num ponto onde um elemento
 * de conteúdo (pluma, poço, tanque…) está DENTRO de um container, o container ocluía
 * a seleção (era o hit mais próximo). Best-practice "select most-specific": o elemento
 * contido tem prioridade; o container cede e só é selecionado via cycling (clique
 * repetido no mesmo ponto) ou quando nada de conteúdo está sob o cursor.
 */
const CONTAINER_PICK_FAMILIES = new Set([
    'site_project',
    'site_area',
    'site_zone', // container (envolve todo o site)
    'stratum',
    'fault', // geological (estratos que envolvem plumas/poços) — caso do Calvin
    'boundary',
    'area',
    'atmosphere', // polígonos/volumes que envolvem a área de estudo
]);
/**
 * Rank de prioridade de seleção: 0 = conteúdo (preferido), 1 = container/enclosing.
 * @param {any} elementId
 * @returns {number}
 */
function _pickRank(elementId: any) {
    const el = elementId ? getElementById(elementId) : null;
    const fam = el?.familyId || el?.family;
    return fam && CONTAINER_PICK_FAMILIES.has(fam) ? 1 : 0;
}
/**
 * Coleta elementIds únicos dos hits do raycaster (ordem de distância, dedup por id —
 * pluma com 4 shells = 1 hit) e reordena por prioridade: conteúdo antes de container.
 * Sort estável (V8) → preserva a ordem de distância dentro de cada tier.
 *
 * @param {any[]} intersects - Resultado de raycaster.intersectObjects (ordenado por distância)
 * @returns {string[]} - elementIds únicos, conteúdo primeiro
 */
export function collectUniqueHitIds(intersects: any) {
    const ids: any[] = [];
    const seen = new Set();
    for (const hit of intersects) {
        const id = findElementId(hit.object);
        if (id && !seen.has(id)) {
            seen.add(id);
            ids.push(id);
        }
    }
    ids.sort((a, b) => _pickRank(a) - _pickRank(b));
    return ids;
}
/**
 * Busca o layerId subindo na hierarquia do objeto 3D.
 * @param {any} object
 * @returns {string|null}
 */
function findLayerId( object: any) {
    let current = object;
    const interpGroup = getInterpolationGroup();
    while (current) {
        if (current.userData && current.userData.layerId) {
            return current.userData.layerId;
        }
        current = current.parent;
        if (current === interpGroup) break;
    }
    return null;
}
// ----------------------------------------------------------------
// HIGHLIGHT (DESTAQUE VISUAL)
// ----------------------------------------------------------------
/**
 * Aplica destaque visual (brilho azul) em um mesh.
 * Armazena emissive original para restaurar depois.
 *
 * @param {any} mesh - Mesh a destacar
 */
export function highlightMesh( mesh: any) {
    clearHighlight();
    if (!mesh) return;
    // Sprite billboard: mudar cor do material diretamente (sem emissive)
    if (mesh.isSprite) {
        highlightedMesh = mesh;
        originalEmissive = mesh.material.color.clone();
        originalEmissiveIntensity = -1; // sentinel para identificar Sprite no restore
        mesh.material.color.set(0x88bbff);
        requestRender();
        return;
    }
    // Buscar material - pode ser mesh direto ou grupo
    const targetMesh = findMeshWithMaterial(mesh);
    if (!targetMesh?.material) return;
    const mat = targetMesh.material;
    if (mat.emissive) {
        originalEmissive = mat.emissive.clone();
        originalEmissiveIntensity = mat.emissiveIntensity || 0;
        mat.emissive.set(0x4488ff);
        mat.emissiveIntensity = 0.3;
    }
    highlightedMesh = targetMesh;
    // OutlinePass: contorno azul (visivel) + laranja (oculto)
    setOutlineSelection([mesh]);
    requestRender();
}
/**
 * Remove destaque visual do mesh atual.
 * Restaura emissive original.
 */
export function clearHighlight() {
    clearOutlineSelection();
    if (highlightedMesh?.material && originalEmissive) {
        // Sprite restore: cor direta (sentinel = -1)
        if (originalEmissiveIntensity === -1 && highlightedMesh.isSprite) {
            highlightedMesh.material.color.copy(originalEmissive);
        }
        // Regular mesh restore: emissive
        else if (highlightedMesh.material.emissive) {
            highlightedMesh.material.emissive.copy(originalEmissive);
            highlightedMesh.material.emissiveIntensity = originalEmissiveIntensity;
        }
    }
    highlightedMesh = null;
    originalEmissive = null;
    originalEmissiveIntensity = 0;
    requestRender();
}
/**
 * Busca primeiro filho que tem material (para grupos).
 *
 * @param {any} object - Objeto 3D
 * @returns {any}
 */
function findMeshWithMaterial(object: any): any {
    if (object.material) return object;
    // Buscar nos filhos
    for (const child of object.children) {
        const found: any = findMeshWithMaterial(child);
        if (found) return found;
    }
    return null;
}
/**
 * Retorna o mesh atualmente destacado.
 * @returns {any}
 */
export function getHighlightedMesh() {
    return highlightedMesh;
}
// ----------------------------------------------------------------
// CLEANUP
// ----------------------------------------------------------------
/**
 * Remove listeners e limpa estado.
 */
export function destroyPicker() {
    if (container) {
        container.removeEventListener('mousedown', onCanvasMouseDown);
        container.removeEventListener('mouseup', onCanvasMouseUp);
        container.removeEventListener('mousemove', onCanvasHover);
    }
    clearHighlight();
    container = null;
    raycaster = null;
    onSelectCallback = null;
    onDeselectCallback = null;
}
