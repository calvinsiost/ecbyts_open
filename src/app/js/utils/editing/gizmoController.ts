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
   GIZMO CONTROLLER — TransformControls wrapper for element editing
   ================================================================

   Wrapper sobre THREE.TransformControls que fornece:
   - Translate (W), Rotate (E), Scale (R) com snap
   - Attach/detach ao mesh de elementos selecionados
   - Sincronizacao bidirecional: mesh <-> element.data
   - Toggle world/local space (X)

   TransformControls e um addon built-in do Three.js (MIT).
   Importado via import map em index.html: three/addons/

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
let _TransformControls: any = null;
async function _getTransformControls() {
    if (!_TransformControls) {
        const mod = await import('three/addons/controls/TransformControls.js' as string);
        _TransformControls = mod.TransformControls;
    }
    return _TransformControls;
}
import { getCamera, getControls, getRenderer, getScene, addRenderHook, wakeRenderLoop } from '../scene/setup.js';
import { getElementById } from '../../core/elements/manager.js';
import { pushSnapshot, flushSnapshot } from '../history/manager.js';
import { isSnapEnabled, getGridSize } from './snapEngine.js';
const ThreeAny: any = THREE;
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
/** @type {any|null} */
let transformControls: any = null;
/** @type {any|null} */
let attachedMesh: any = null;
/** @type {string|null} */
let attachedElementId: string | null = null;
let _gizmoActive = false;
let _dragging = false;
let _prevPosition: any = null;
let _prevRotation: any = null;
let _prevScale: any = null;
function _getPrevPosition() { if (!_prevPosition) _prevPosition = new ThreeAny.Vector3(); return _prevPosition; }
function _getPrevRotation() { if (!_prevRotation) _prevRotation = new ThreeAny.Euler(); return _prevRotation; }
function _getPrevScale() { if (!_prevScale) _prevScale = new ThreeAny.Vector3(); return _prevScale; }
// ----------------------------------------------------------------
// INICIALIZACAO
// ----------------------------------------------------------------
/**
 * Inicializa o TransformControls e adiciona a scene.
 * Deve ser chamado apos initScene().
 */
// Escuta evento de rebuild de mesh: reatacha o gizmo no novo mesh automaticamente.
// Sem isso, TransformControls continua apontando para mesh removido do scene graph
// (disparando "The attached 3D object must be a part of the scene graph" em loop).
if (typeof window !== 'undefined' && !window.__gizmoMeshReplacedListenerAttached) {
    window.__gizmoMeshReplacedListenerAttached = true;
    window.addEventListener('meshReplaced', (e) => {
        const { elementId, newMesh } = (e as any).detail || {};
        if (!transformControls || !attachedElementId || elementId !== attachedElementId) return;
        // Se está arrastando, adia o reattach para após o fim do drag
        if (_dragging) {
            const doReattach = () => {
                transformControls.removeEventListener('mouseUp', doReattach);
                _performMeshReattach(newMesh);
            };
            transformControls.addEventListener('mouseUp', doReattach);
            return;
        }
        _performMeshReattach(newMesh);
    });
}
export async function initGizmo() {
    const camera = getCamera();
    const renderer = getRenderer();
    const scene = getScene();
    if (!camera || !renderer || !scene) {
        console.warn(
            '[GizmoController] Scene nao inicializada — camera:',
            !!camera,
            'renderer:',
            !!renderer,
            'scene:',
            !!scene,
        );
        return;
    }
    try {
        const TransformControlsCtor = await _getTransformControls();
        transformControls = new TransformControlsCtor(camera, renderer.domElement);
    } catch (err: any) {
        console.error('[GizmoController] TransformControls constructor failed:', err);
        return;
    }
    transformControls.visible = false;
    transformControls.enabled = false;
    // Canonical detection marker for E2E tests + scene introspection.
    // Three.js r160+ TransformControls reports type:"Object3D" not "TransformControls",
    // so type-string check is unreliable. Tests should use userData.isGizmo === true.
    transformControls.userData = transformControls.userData || {};
    transformControls.userData.isGizmo = true;
    // Evento nativo: controla OrbitControls e persiste ao final do drag
    transformControls.addEventListener(
        'dragging-changed',
        /** @param {any} event */
        (event: any) => {
            const dragEvent = event;
            const orbitControls = getControls();
            if (orbitControls) orbitControls.enabled = !dragEvent.value;
            if (dragEvent.value) {
                // Inicio do drag - salva estado anterior + captura BASELINE pré-move no
                // histórico (síncrono). Sem isso o undo não reverte o move: pushSnapshot é
                // debounced e, com mutação in-place, captura o estado PÓS-move → o undoStack
                // não tem snapshot pré-move limpo (bug confirmado 2026-05-29). flushSnapshot
                // congela o estado atual (pré-move) AGORA; o drag-end empilha o pós-move →
                // undo restaura o pré-move.
                _dragging = true;
                if (attachedMesh) {
                    _getPrevPosition().copy(attachedMesh.position);
                    _getPrevRotation().copy(attachedMesh.rotation);
                    _getPrevScale().copy(attachedMesh.scale);
                }
                flushSnapshot();
            } else if (_dragging) {
                // Fim do drag - persiste no element.data
                _dragging = false;
                _syncMeshToElement();
                pushSnapshot();
            }
            wakeRenderLoop();
        },
    );
    // Re-render a cada frame de drag + atualiza coords UI
    transformControls.addEventListener('change', () => {
        wakeRenderLoop();
        if (attachedMesh && _dragging) {
            _updateCoordsUI(attachedMesh.position);
        }
    });
    // Sincroniza snap do gizmo quando snap engine muda
    window.addEventListener('ecbt:snapChanged', _syncGizmoSnap);
    _syncGizmoSnap();
    // Size dinamico: gizmo ocupa fracao constante do viewport em qualquer zoom.
    // TransformControls calcula: visual = size * (top - bottom) / zoom.
    // Para constante visual: size = FRAC * zoom → visual = FRAC * frustum.
    // FRAC=0.8 com frustum=100 → setas de ~80 world units (~13% de cena 600m).
    const TARGET_FRACTION = 0.8;
    addRenderHook(
        /**
         * @param {any} _s
         * @param {any} cam
         */
        (_s: any, cam: any) => {
            if (!transformControls || !transformControls.visible) return;
            transformControls.size = TARGET_FRACTION * (cam.zoom || 1);
        },
    );
    scene.add(transformControls);
    // Sincroniza renderer + câmera no resize para evitar raycasting errado do gizmo.
    // TransformControls usa getBoundingClientRect() internamente; se clientWidth/clientHeight
    // divergirem do drawing buffer, o hit-test das setas falha silenciosamente.
    const _onResize = () => {
        const r = getRenderer();
        const cam = getCamera();
        const cont = r?.domElement?.parentElement;
        if (!r || !cam || !cont) return;
        const w = cont.clientWidth;
        const h = cont.clientHeight;
        if (w <= 0 || h <= 0) return;
        r.setSize(w, h);
        if (cam.isOrthographicCamera) {
            const aspect = w / h;
            const frustumH = cam.top - cam.bottom;
            cam.left = (-frustumH * aspect) / 2;
            cam.right = (frustumH * aspect) / 2;
            cam.updateProjectionMatrix();
        }
        transformControls.updateMatrixWorld();
    };
    window.addEventListener('resize', _onResize);
    console.debug('[GizmoController] initGizmo OK — TransformControls ready');
}
/**
 * Sincroniza snap do TransformControls com snapEngine.
 * @private
 */
function _syncGizmoSnap() {
    if (!transformControls) return;
    if (isSnapEnabled()) {
        transformControls.translationSnap = getGridSize();
        transformControls.rotationSnap = Math.PI / 12; // 15 graus
    } else {
        transformControls.translationSnap = null;
        transformControls.rotationSnap = null;
    }
}
// ----------------------------------------------------------------
// ATTACH / DETACH
// ----------------------------------------------------------------
/**
 * Liga/desliga matrixAutoUpdate recursivamente (Group + children).
 *
 * Por quê: os meshes de elementos têm matrixAutoUpdate=false (ECBT01 _freezeMatrix
 * em core/elements/manager — otimização p/ meshes estáticos). Com a matrix congelada,
 * o gizmo (TransformControls) seta `object.position` mas a matrix/matrixWorld NÃO
 * recomputam → o elemento NÃO se move visualmente (bug confirmado por Calvin 2026-05-29).
 * Ao editar, descongelamos (value=true) para o drag/setGizmoPosition surtir efeito; ao
 * desanexar, recongelamos (value=false, assando a posição final via updateMatrix()).
 *
 * @param {any} obj
 * @param {boolean} value
 */
function _setMatrixAutoUpdateRecursive(obj: any, value: boolean) {
    if (!obj) return;
    if (value) {
        obj.matrixAutoUpdate = true;
    } else {
        obj.updateMatrix();
        obj.matrixAutoUpdate = false;
    }
    if (obj.children) {
        for (const child of obj.children) _setMatrixAutoUpdateRecursive(child, value);
    }
}
/**
 * Vincula o gizmo a um mesh de elemento.
 *
 * @param {string} elementId - ID do elemento
 * @param {any} mesh - Mesh 3D do elemento
 */
export function attachGizmo(elementId: string, mesh: any) {
    if (!transformControls) {
        console.error('[GizmoController] attachGizmo: transformControls not initialized — initGizmo() failed?');
        return false;
    }
    if (!mesh) {
        console.warn('[GizmoController] attachGizmo: mesh is null for element:', elementId);
        return false;
    }
    // Detach anterior se diferente
    if (attachedMesh && attachedMesh !== mesh) {
        detachGizmo();
    }
    attachedElementId = elementId;
    attachedMesh = mesh;
    try {
        transformControls.attach(mesh);
        // Descongela matrixAutoUpdate do mesh editado: sem isso a matrix fica congelada
        // (ECBT01) e o drag do gizmo / setGizmoPosition não surtem efeito visual.
        _setMatrixAutoUpdateRecursive(mesh, true);
        transformControls.visible = true;
        transformControls.enabled = true;
        _gizmoActive = true;
        _syncGizmoSnap();
        _updateCoordsUI(mesh.position);
        wakeRenderLoop();
        console.debug('[GizmoController] Gizmo attached to:', elementId);
        return true;
    } catch (err: any) {
        console.error('[GizmoController] Error attaching gizmo:', err);
        _gizmoActive = false;
        return false;
    }
}
/**
 * Remove o gizmo do mesh atual.
 */
export function detachGizmo() {
    if (!transformControls) return;
    // Recongela matrixAutoUpdate (assa a posição final na matrix) — restaura a
    // otimização de mesh estático após terminar a edição.
    if (attachedMesh) _setMatrixAutoUpdateRecursive(attachedMesh, false);
    transformControls.detach();
    transformControls.visible = false;
    transformControls.enabled = false;
    attachedMesh = null;
    attachedElementId = null;
    _gizmoActive = false;
    _dragging = false;
    wakeRenderLoop();
}
// ----------------------------------------------------------------
// MODOS
// ----------------------------------------------------------------
/**
 * Define o modo do gizmo.
 * @param {'translate'|'rotate'|'scale'} mode
 */
export function setGizmoMode(mode: 'translate' | 'rotate' | 'scale') {
    if (!transformControls) return;
    if (['translate', 'rotate', 'scale'].includes(mode)) {
        transformControls.setMode(mode);
        wakeRenderLoop();
    }
}
/**
 * Retorna o modo atual do gizmo.
 * @returns {'translate'|'rotate'|'scale'}
 */
export function getGizmoMode() {
    return transformControls?.mode || 'translate';
}
/**
 * Alterna entre world e local space.
 */
export function toggleGizmoSpace() {
    if (!transformControls) return;
    transformControls.setSpace(transformControls.space === 'world' ? 'local' : 'world');
    wakeRenderLoop();
}
/**
 * Retorna o space atual.
 * @returns {'world'|'local'}
 */
export function getGizmoSpace() {
    return transformControls?.space || 'world';
}
// ----------------------------------------------------------------
// SNAP
// ----------------------------------------------------------------
/**
 * Configura snap de translacao no gizmo.
 * @param {number|null} gridSize - Tamanho do grid (null = desabilita snap)
 */
export function setGizmoTranslationSnap(gridSize: number | null) {
    if (!transformControls) return;
    transformControls.translationSnap = gridSize;
}
/**
 * Configura snap de rotacao no gizmo.
 * @param {number|null} degrees - Graus (null = desabilita)
 */
export function setGizmoRotationSnap(degrees: number | null) {
    if (!transformControls) return;
    transformControls.rotationSnap = degrees ? ThreeAny.MathUtils.degToRad(degrees) : null;
}
// ----------------------------------------------------------------
// POSITION PROGRAMATICA
// ----------------------------------------------------------------
/**
 * Define posicao do mesh via gizmo (para input numerico).
 * @param {any} position
 */
export function setGizmoPosition(position: any) {
    if (!attachedMesh) return;
    // Captura o BASELINE pré-move (síncrono) ANTES de mutar — senão o undo não reverte
    // (pushSnapshot debounced captura o estado pós-mutação). Ver dragging-changed.
    flushSnapshot();
    attachedMesh.position.copy(position);
    _syncMeshToElement();
    pushSnapshot();
    wakeRenderLoop();
}
/**
 * Retorna posicao atual do mesh vinculado.
 * @returns {any|null}
 */
export function getGizmoPosition() {
    return attachedMesh ? attachedMesh.position.clone() : null;
}
// ----------------------------------------------------------------
// QUERIES
// ----------------------------------------------------------------
/**
 * Retorna true se o gizmo esta ativo (attached a um mesh).
 * Usado pelo dragController para evitar race condition com OrbitControls.
 */
export function isGizmoActive() {
    return _gizmoActive;
}
/**
 * Retorna true se o gizmo esta sendo arrastado.
 */
export function isGizmoDragging() {
    return _dragging;
}
/**
 * Retorna true se o pointer esta sobre um eixo/plano do gizmo.
 * TransformControls seta `axis` (ex: 'X','Y','Z','XY') ao detectar hover.
 * Usado pelo dragController para evitar interceptar eventos do gizmo.
 */
export function isPointerOverGizmo() {
    return !!(transformControls && transformControls.axis !== null);
}
/**
 * Retorna o ID do elemento atualmente vinculado ao gizmo.
 * @returns {string|null}
 */
export function getGizmoElementId() {
    return attachedElementId;
}
// ----------------------------------------------------------------
// HELPERS INTERNOS
// ----------------------------------------------------------------
/**
 * Realiza o reattach do gizmo num novo mesh. Chamada direta ou adiada (pós-drag).
 * @param {any} newMesh
 * @private
 */
function _performMeshReattach(newMesh: any) {
    try {
        transformControls.detach();
        if (newMesh) {
            attachedMesh = newMesh;
            transformControls.attach(newMesh);
            transformControls.visible = true;
        } else {
            attachedMesh = null;
            attachedElementId = null;
            _gizmoActive = false;
        }
    } catch (err: any) {
        console.warn('[GizmoController] mesh rebind failed:', err?.message);
    }
}
// ----------------------------------------------------------------
// SYNC MESH → ELEMENT DATA
// ----------------------------------------------------------------
/**
 * Persiste a posicao/rotacao/escala do mesh de volta no element.data.
 * Trata as diferentes convencoes de armazenamento por familia:
 * - plume: data.center
 * - well, spring, marker, lake, tank, building, waste, boundary, river: data.position
 * @private
 */
function _syncMeshToElement() {
    if (!attachedElementId || !attachedMesh) return;
    const element = getElementById(attachedElementId);
    if (!element) return;
    const pos = attachedMesh.position;
    const rot = attachedMesh.rotation;
    const scl = attachedMesh.scale;
    if (!element.data) element.data = {};
    // Posicao - campo depende da familia
    if (element.family === 'plume') {
        if (!element.data.center) element.data.center = {};
        element.data.center.x = pos.x;
        element.data.center.y = pos.y;
        element.data.center.z = pos.z;
    } else if (element.family === 'well') {
        // O mesh do poço deriva de data.coordinates (não data.position) — ver
        // meshFactory.createWellMesh: group.position = (easting, elevation - depth/2, northing).
        // Sem escrever de volta em coordinates, o move do gizmo se PERDE no rebuild/reload/
        // export ECBT (Pilar 2: confiança no resultado). Inverso exato do forward transform:
        if (!element.data.coordinates) element.data.coordinates = {};
        const depth = element.data.construction?.totalDepth || 50;
        element.data.coordinates.easting = pos.x;
        element.data.coordinates.northing = pos.z;
        element.data.coordinates.elevation = pos.y + depth / 2;
        // Mantém data.position espelhado (compat de leitura/UI que ainda use position)
        if (!element.data.position) element.data.position = {};
        element.data.position.x = pos.x;
        element.data.position.y = pos.y;
        element.data.position.z = pos.z;
    } else {
        if (!element.data.position) element.data.position = {};
        element.data.position.x = pos.x;
        element.data.position.y = pos.y;
        element.data.position.z = pos.z;
    }
    // Rotacao - armazena em euler (radianos)
    if (rot.x !== 0 || rot.y !== 0 || rot.z !== 0) {
        element.data.rotation = { x: rot.x, y: rot.y, z: rot.z };
    }
    // Escala - so armazena se diferente de 1
    if (scl.x !== 1 || scl.y !== 1 || scl.z !== 1) {
        element.data.scale = { x: scl.x, y: scl.y, z: scl.z };
    }
}
// ----------------------------------------------------------------
// COORDS UI - atualiza inputs X/Y/Z na ribbon
// ----------------------------------------------------------------
/**
 * Atualiza os inputs de coordenadas na ribbon Edit.
 * @param {any} position
 * @private
 */
function _updateCoordsUI(position: any) {
    const xInput = document.getElementById('edit-ribbon-coord-x') as HTMLInputElement | null;
    const yInput = document.getElementById('edit-ribbon-coord-y') as HTMLInputElement | null;
    const zInput = document.getElementById('edit-ribbon-coord-z') as HTMLInputElement | null;
    if (xInput && document.activeElement !== xInput) xInput.value = position.x.toFixed(2);
    if (yInput && document.activeElement !== yInput) yInput.value = position.y.toFixed(2);
    if (zInput && document.activeElement !== zInput) zInput.value = position.z.toFixed(2);
}
// ----------------------------------------------------------------
// CLEANUP
// ----------------------------------------------------------------
/**
 * Remove TransformControls da scene e libera recursos.
 */
export function disposeGizmo() {
    if (transformControls) {
        detachGizmo();
        const scene = getScene();
        if (scene) scene.remove(transformControls);
        transformControls.dispose();
        transformControls = null;
    }
}
