// @ts-check
// Generated from src/app/js/core/voxel/editController.ts by TS-MIGRATION-001. Do not edit manually.
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
   VOXEL EDIT CONTROLLER — Insert/delete individual voxels
   Controlador de edicao de voxels individuais (pintura/apagamento)

   MAQUINA DE ESTADOS:
   IDLE ──[enterVoxelEdit]──► EDITING
     ▲                            │
     └────[exitVoxelEdit]─────────┘

   EM MODO DE EDICAO:
   - Left-click voxel face → delete (set EMPTY)
   - Ctrl+click / Right-click voxel face → insert adjacent voxel
   - Zona auto-detectada pela posicao relativa ao lencol freatico
   - Escape sai do modo de edicao
   ================================================================ */
import { createTHREEProxy } from '../three-lazy.js';
const THREE: any = createTHREEProxy();
import { getCamera, getRenderer, getVoxelGroup } from '../../utils/scene/setup.js';
import { getVolume, setVoxelCell, rebuildVolumeMeshes } from './manager.js';
import { flatIndexToCoords, coordsToFlatIndex } from './renderer.js';
import { EMPTY, VADOSE, SATURATED } from './engine.js';
import { sampleLayerGrid, getAllLayers } from '../interpolation/manager.js';
import { showToast } from '../../utils/ui/toast.js';
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
let _editing = false;
let _volumeId: any = null;
let _raycaster: any = null;
let _mouse: any = null;
let _container: any = null;
let _indicator: any = null;
// Debounce para evitar rebuilds excessivos em clicks rapidos
let _rebuildTimer: any = null;
const REBUILD_DEBOUNCE = 80;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Enter voxel edit mode for a volume.
 * Entra no modo de edicao: cada click no voxel deleta ou insere.
 *
 * @param {string} volumeId
 * @param {HTMLElement} container - canvas container element
 * @returns {boolean} true if successfully entered edit mode
 */
export function enterVoxelEdit( volumeId: any, container: any) {
    const vol = getVolume(volumeId);
    if (!vol || !vol.grid || vol.mode !== 'voxels') {
        showToast('Switch to Voxels mode before editing.', 'warning');
        return false;
    }
    _editing = true;
    _volumeId = volumeId;
    _container = container;
    _raycaster = new /** @type {any} */ (THREE).Raycaster();
    _mouse = new /** @type {any} */ (THREE).Vector2();
    // Capture-phase listeners (prioridade sobre picker.js)
    container.addEventListener('mousedown', _onMouseDown, { capture: true });
    container.addEventListener('contextmenu', _onContextMenu, { capture: true });
    window.addEventListener('keydown', _onKeyDown);
    container.style.cursor = 'crosshair';
    // Indicador flutuante no canvas
    _showIndicator(container);
    // Evento para notificar outros modulos
    window.dispatchEvent(
        new CustomEvent('voxelEditChanged', {
            detail: { editing: true, volumeId },
        }),
    );
    return true;
}
/**
 * Exit voxel edit mode.
 * Sai do modo de edicao e restaura estado normal.
 */
export function exitVoxelEdit() {
    if (!_editing) return;
    if (_container) {
        _container.removeEventListener('mousedown', _onMouseDown, { capture: true });
        _container.removeEventListener('contextmenu', _onContextMenu, { capture: true });
        _container.style.cursor = 'default';
    }
    window.removeEventListener('keydown', _onKeyDown);
    _hideIndicator();
    if (_rebuildTimer) {
        clearTimeout(_rebuildTimer);
        _rebuildTimer = null;
    }
    const prevId = _volumeId;
    _editing = false;
    _volumeId = null;
    _container = null;
    _raycaster = null;
    window.dispatchEvent(
        new CustomEvent('voxelEditChanged', {
            detail: { editing: false, volumeId: prevId },
        }),
    );
}
/** @returns {boolean} */
export function isVoxelEditing() {
    return _editing;
}
/** @returns {string|null} */
export function getEditingVolumeId() {
    return _volumeId;
}
// ----------------------------------------------------------------
// MOUSE HANDLERS
// ----------------------------------------------------------------
function _onMouseDown(event: any) {
    // Apenas botao esquerdo (0) e direito (2)
    if (event.button !== 0 && event.button !== 2) return;
    const camera = getCamera();
    const voxelGroup = getVoxelGroup();
    if (!camera || !voxelGroup) return;
    _updateMouse(event);
    _raycaster.setFromCamera(_mouse, camera);
    // Raycast contra InstancedMeshes do voxelGroup
    const intersects = _raycaster.intersectObjects(/** @type {any} */ (voxelGroup).children, false);
    if (intersects.length === 0) return;
    const hit = intersects[0];
    const instMesh = hit.object;
    // Verificar que pertence ao volume sendo editado
    if (instMesh.userData.volumeId !== _volumeId) return;
    if (hit.instanceId === undefined || hit.instanceId === null) return;
    const vol = getVolume(_volumeId);
    if (!vol) return;
    // Resolver coordenadas do grid a partir do instanceId
    const instanceToGrid = instMesh.userData.instanceToGrid;
    if (!instanceToGrid) return;
    const flatIdx = instanceToGrid[hit.instanceId];
    const coords = flatIndexToCoords(flatIdx, vol.dims);
    // Determinar acao: delete (left-click) ou insert (ctrl+click / right-click)
    const isInsert = event.ctrlKey || event.button === 2;
    if (isInsert) {
        _insertAdjacentVoxel(vol, hit, coords.ix, coords.iy, coords.iz);
    } else {
        _deleteVoxel(vol, flatIdx);
    }
    // Bloquear picker e OrbitControls
    event.stopPropagation();
    event.preventDefault();
}
function _onContextMenu(event: any) {
    // Bloquear menu de contexto do browser em voxel edit mode
    event.preventDefault();
    event.stopPropagation();
    // Mostrar menu mínimo com Report Bug (voxel mode não tem menu próprio)
    import('../../utils/ui/globalContextMenu.js' as string)
        .then((m: any) => m.showMinimalMenu(event))
        .catch((err: any) => console.warn('[voxel/editController] import globalContextMenu failed:', err));
}
function _onKeyDown(event: any) {
    if (event.key === 'Escape') {
        exitVoxelEdit();
    }
}
// ----------------------------------------------------------------
// INSERT / DELETE LOGIC
// ----------------------------------------------------------------
/**
 * Delete a voxel (set to EMPTY).
 * Apaga um voxel - define como vazio no grid.
 */
function _deleteVoxel(vol: any, flatIdx: any) {
    setVoxelCell(vol.id, flatIdx, EMPTY);
    _debouncedRebuild(vol.id);
}
/**
 * Insert a voxel on the adjacent face of the hit voxel.
 * Insere voxel na celula adjacente a face clicada.
 * Usa a normal da face para determinar direcao.
 */
function _insertAdjacentVoxel( /** @type {any} */ vol: any,
    hit: any,
    ix: any,
    iy: any,
    iz: any,
) {
    const normal = hit.face?.normal;
    if (!normal) return;
    const { dx, dy, dz } = _snapNormalToAxis(normal);
    const nix = ix + dx;
    const niy = iy + dy;
    const niz = iz + dz;
    if (!_isInsideGrid(nix, niy, niz, vol.dims)) return;
    const newFlatIdx = coordsToFlatIndex(nix, niy, niz, vol.dims);
    // Apenas inserir em celulas vazias
    if (vol.grid[newFlatIdx] !== EMPTY) return;
    // Determinar zona natural pela posicao relativa ao water table
    const zone = _determineZone(vol, nix, niy, niz);
    setVoxelCell(vol.id, newFlatIdx, zone);
    _debouncedRebuild(vol.id);
}

/**
 * Snap a face normal to the dominant axis (+/-X, +/-Y, +/-Z).
 * (InstancedMesh usa apenas translacao, sem rotacao - normal local = world)
 */
function _snapNormalToAxis(normal: { x: number; y: number; z: number }): { dx: number; dy: number; dz: number } {
    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);
    if (absX >= absY && absX >= absZ) {
        return { dx: normal.x > 0 ? 1 : -1, dy: 0, dz: 0 };
    }
    if (absY >= absX && absY >= absZ) {
        return { dx: 0, dy: normal.y > 0 ? 1 : -1, dz: 0 };
    }
    return { dx: 0, dy: 0, dz: normal.z > 0 ? 1 : -1 };
}

function _isInsideGrid(ix: any, iy: any, iz: any, dims: { nx: any; ny: any; nz: any }): boolean {
    return ix >= 0 && ix < dims.nx && iy >= 0 && iy < dims.ny && iz >= 0 && iz < dims.nz;
}
/**
 * Determine the natural zone for a grid cell.
 * Zona vadosa acima do lencol, saturada abaixo.
 */
function _determineZone(vol: any, ix: any, iy: any, _iz: any) {
    const halfRes = vol.resolution / 2;
    const worldY = vol.yRange.bottom + iy * vol.resolution + halfRes;
    const worldX = vol.bounds.minX + ix * vol.resolution + halfRes;
    const worldZ = vol.bounds.minZ + _iz * vol.resolution + halfRes;
    // Verifica water table layer
    const hasWT = getAllLayers().some((l: any) => l.type === 'water_table' && l.grid);
    if (hasWT) {
        const wtY = Number(sampleLayerGrid('water_table', worldX, worldZ));
        return worldY > wtY ? VADOSE : SATURATED;
    }
    // Fallback: abaixo de -5m e saturada
    return worldY > -5 ? VADOSE : SATURATED;
}
// ----------------------------------------------------------------
// DEBOUNCED REBUILD
// ----------------------------------------------------------------
/**
 * Debounce mesh rebuild to handle rapid clicks.
 * Evita rebuilds excessivos em clicks rapidos.
 */
function _debouncedRebuild(volumeId: any) {
    if (_rebuildTimer) clearTimeout(_rebuildTimer);
    _rebuildTimer = setTimeout(() => {
        rebuildVolumeMeshes(volumeId);
        _rebuildTimer = null;
    }, REBUILD_DEBOUNCE);
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function _updateMouse(event: any) {
    const renderer = getRenderer();
    if (!renderer) return;
    const rect = (renderer).domElement.getBoundingClientRect() as any;
    _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}
// ----------------------------------------------------------------
// INDICATOR UI
// ----------------------------------------------------------------
function _showIndicator(container: any) {
    _indicator = document.createElement('div');
    _indicator.className = 'voxel-edit-indicator';
    _indicator.innerHTML = `
        <span class="voxel-edit-label">Voxel Edit Mode</span>
        <span class="voxel-edit-hint">Click=Delete | Ctrl+Click=Insert | Esc=Exit</span>
    `;
    container.appendChild(_indicator);
}
function _hideIndicator() {
    if (_indicator) {
        _indicator.remove();
        _indicator = null;
    }
}
