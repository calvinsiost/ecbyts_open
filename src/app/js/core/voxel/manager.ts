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
   VOXEL MANAGER — Estado, CRUD e orquestracao de volumes voxel
   Gerenciador generico de volumes 3D voxelizados

   PADRAO: Identico ao interpolation/manager.js
   - Estado em closure (Map de volumes)
   - Persistencia via localStorage + model export/import
   - CustomEvent 'voxelChanged' para UI reativa
   - setVoxelGroup() para injecao do grupo Three.js

   USO INICIAL: Geologia subsuperficial (vadosa/saturada)
   Futuro: qualquer classificacao volumetrica 3D
   ================================================================ */
import { generateId } from '../../utils/helpers/id.js';
import { CONFIG } from '../../config.js';
import { voxelize, countByZone, suggestResolution, VADOSE, SATURATED } from './engine.js';
import {
    estimateMaxTerrainY as _estimateMaxTerrainY,
    computeVolumeDims as _computeVolumeDims,
} from './_voxelManagerPure.js';
import { stampAirBlocks } from './_airBlocksPure.js';
import { buildVoxelMeshes, disposeVoxelMeshes, setVoxelOpacity, setVoxelVisible } from './renderer.js';
import { applyChannelToVolume, clearChannelFromVolume, extractChannelIsosurface, clearIsosurfaces, } from './scalarRenderer.js';
import { GEOLOGY_ZONES } from './colorSchemes.js';
import { createChannel, normalizeChannel } from './channels.js';
import { sampleTerrainElevation, sampleLayerGrid, hasTerrainGrid, getAllLayers } from '../interpolation/manager.js';
import { getAllElements } from '../elements/manager.js';
import { requestRender } from '../../utils/scene/setup.js';
import { showToast } from '../../utils/ui/toast.js';
import { isEphemeral } from '../../utils/storage/storageMonitor.js';
import { idbSet, idbGetWithLegacy } from '../../utils/storage/idbStore.js';
/**
 * @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number }} VoxelBounds
 * @typedef {{ top: number, bottom: number }} VoxelYRange
 * @typedef {{ nx: number, ny: number, nz: number }} VoxelDims
 * @typedef {{
 *   id: string,
 *   name?: string,
 *   bounds?: VoxelBounds|null,
 *   yRange?: VoxelYRange|null,
 *   resolution?: number,
 *   dims?: VoxelDims|null,
 *   grid?: number[]|Uint8Array|Int8Array|Uint16Array|Float32Array|null,
 *   zones?: readonly unknown[],
 *   mode?: 'solid'|'voxels'|string,
 *   visible?: boolean,
 *   opacity?: number,
 *   channels?: Record<string, any>,
 *   channelMetas?: Array<any>
 * }} VoxelVolume
 */
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
const _volumes: any = new Map<string, any>();
/** @type {any|null} */
let _voxelGroup: any = null;
const LS_KEY = 'ecbyts-voxel';
const CHANNEL_KEY_PREFIX = 'ecbyts-voxel-channel';
const MAX_VOXELS = 1_000_000;
// ----------------------------------------------------------------
// LIFECYCLE
// ----------------------------------------------------------------
/**
 * Initialize voxel module - restore from IndexedDB (migra do localStorage se necessário).
 * Restaura volumes salvos (sem grid - recomputa após restore).
 */
export async function initVoxel() {
    // Auto-limpa os volumes da cena ao trocar de modelo (ecbt:elementsCleared é
    // disparado por clearAllElements no início de cada applyModel). Registrado no
    // TOPO (antes do early-return abaixo) → sempre liga, mesmo sem voxel no IDB.
    // initVoxel roda no boot APÓS o applyModel inicial → não afeta o restore do
    // boot, só limpa em trocas subsequentes. Sem isto, os volumes do modelo
    // anterior ficavam fantasma (auditoria Calvin 2026-06-02, igual ao terreno).
    if (!_voxelAutoClearWired && typeof window !== 'undefined') {
        _voxelAutoClearWired = true;
        window.addEventListener('ecbt:elementsCleared', () => clearAllVolumes());
    }
    // POR-MODELO 2026-06-02: o voxel agora é salvo no próprio modelo (model.voxel,
    // via exportVolumes/importVolumes em io/export+import) e restaurado por
    // applyModel — NÃO mais da chave IDB global `ecbyts-voxel`. O restore global
    // anterior sobrescrevia o model.voxel no boot e fazia os volumes "vazarem"
    // entre modelos. initVoxel agora só registra o auto-clear (acima). A chave
    // global vira legado (write-only via _persist, ignorada na leitura).
}
let _voxelAutoClearWired = false;
/**
 * Inject Three.js group for voxel meshes.
 * @param {any} group
 */
export function setVoxelGroup(group: any) {
    _voxelGroup = group;
}
// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------
/**
 * Create a geology volume (vadose/saturated classification).
 * Cria volume geologico a partir das superficies de terreno e lencol freatico.
 *
 * @param {Object} [opts]
 * @param {number} [opts.resolution] - voxel size (auto if omitted)
 * @param {string} [opts.name] - volume name
 * @returns {Object|null} created volume or null on failure
 */
export function createGeologyVolume(opts: any = {}) {
    // Bounds from boundary element
    const bounds = _getBoundaryBounds();
    if (!bounds) {
        showToast('Nenhuma boundary encontrada. Adicione uma area de estudo.', 'warning');
        return null;
    }
    // Vertical range: terrain top → deepest stratum bottom
    const strata = CONFIG.STRATA || [];
    const deepestBottom = strata.length > 0 ? Math.min(...strata.map((s: any) => s.bottom)) : -50;
    // Estimate terrain top (max elevation across bounds)
    const maxTerrainY = hasTerrainGrid()
        ? _estimateMaxTerrainY(bounds, (x: number, z: number) => Number(sampleTerrainElevation(x, z)), 5)
        : 0;
    const yRange = { top: maxTerrainY, bottom: deepestBottom };
    // Resolution (auto or user-specified)
    const resolution = opts.resolution || suggestResolution(bounds, yRange);
    // Check cap (TRUST-011: pre-flight dims só para validar MAX_VOXELS — usar
    // nome distinto p/ não colidir com `dims` da voxelize() abaixo, que é o
    // valor real persistido no volume; renomeação evita SyntaxError "Identifier
    // 'dims' has already been declared" que quebrava boot inteiro)
    const capDims = _computeVolumeDims(bounds, yRange, resolution);
    // eslint-disable-next-line
    const { nx, ny, nz, total } = capDims;
    if (total > MAX_VOXELS) {
        const suggested = suggestResolution(bounds, yRange);
        showToast(`Volume excede ${(MAX_VOXELS / 1000).toFixed(0)}K voxels. Use resolucao >= ${suggested}m.`, 'warning');
        return null;
    }
    // Surface samplers
    const sampleTop: any = (x: any, z: any) => (hasTerrainGrid() ? Number(sampleTerrainElevation(x, z)) : 0);
    const hasWT = getAllLayers().some((l: any) => l.type === 'water_table' && l.grid);
    const sampleDivider: any = hasWT ? (x: any, z: any) => Number(sampleLayerGrid('water_table', x, z)) : (_x: any, _z: any) => -5; // Fallback: lencol a -5m
    // Voxelize
    const { grid, dims } = voxelize(bounds, yRange, resolution, sampleTop, sampleDivider);
    // RF-5: carimbo de air blocks — células acima do terreno (e abaixo da base
    // do modelo, quando houver) ficam fora de countByZone/massa por default.
    const surfaceStamps = stampAirBlocks(dims, {
        yRangeBottom: yRange.bottom,
        resolution,
        sampleSurfaceY: sampleTop,
        minX: bounds.minX,
        minZ: bounds.minZ,
    });
    const volume = {
        id: generateId('voxvol'),
        name: opts.name || 'Geologia Subsuperficial',
        bounds,
        yRange,
        resolution,
        dims,
        grid,
        surfaceStamps,
        zones: GEOLOGY_ZONES,
        mode: 'solid',
        visible: true,
        opacity: 0.6,
        channels: {},
    };
    _volumes.set(volume.id, volume);
    // Build 3D meshes
    if (_voxelGroup) {
        buildVoxelMeshes(volume, _voxelGroup);
        requestRender();
    }
    _persist();
    _notify();
    const vadoseN = countByZone(grid, VADOSE, surfaceStamps);
    const saturatedN = countByZone(grid, SATURATED, surfaceStamps);
    showToast(`Geologia: ${(vadoseN + saturatedN).toLocaleString()} voxels (${resolution}m) — ` +
        `Vadosa: ${vadoseN.toLocaleString()}, Saturada: ${saturatedN.toLocaleString()}`, 'success');
    return volume;
}
/**
 * Remove a volume and dispose its meshes.
 * Remove volume e libera memoria dos meshes.
 *
 * @param {string} [id] - volume ID (removes first if omitted)
 */
export function removeVolume(id: any) {
    if (!id) {
        // Remove first volume
        const first = _volumes.keys().next().value;
        if (!first)
            return;
        id = first;
    }
    _volumes.delete(id);
    if (_voxelGroup) {
        // Remove meshes matching this volume
        const toRemove = _voxelGroup.children.filter((c: any) => c.userData.volumeId === id);
        for (const child of toRemove) {
            _voxelGroup.remove(child);
            if (child.geometry)
                child.geometry.dispose();
            if (Array.isArray(child.material)) {
                const materials = child.material;
                materials.forEach((m: any) => m.dispose());
            }
            else if (child.material) {
                child.material.dispose();
            }
        }
        requestRender();
    }
    _persist();
    _notify();
}
/**
 * Remove all geology volumes.
 * Limpa todos os volumes de voxel (zonas vadosa/saturada).
 */
export function clearAllVolumes() {
    const ids = [..._volumes.keys()];
    ids.forEach((id: any) => removeVolume(id));
    _selectedVolumeId = null;
}
/**
 * Get all volumes.
 * @returns {VoxelVolume[]}
 */
export function getAllVolumes() {
    return Array.from(_volumes.values());
}
/**
 * Get a specific volume by ID.
 * @param {string} id
 * @returns {VoxelVolume|null}
 */
export function getVolume(id: any) {
    return _volumes.get(id) || null;
}
// ----------------------------------------------------------------
// SELECAO
// ----------------------------------------------------------------
let _selectedVolumeId: any = null;
/** @returns {string|null} */
export function getSelectedVolume() {
    return _selectedVolumeId;
}
/** @param {string|null} id */
export function setSelectedVolume(id: any) {
    _selectedVolumeId = id;
}
// ----------------------------------------------------------------
// MUTACAO PONTUAL (para insert/delete de voxels individuais)
// ----------------------------------------------------------------
/**
 * Set a single voxel cell in the grid.
 * Modifica uma unica celula do grid (para edicao manual).
 *
 * @param {string} volumeId
 * @param {number} flatIdx - flat grid index
 * @param {number} zoneId - EMPTY (0), VADOSE (1), or SATURATED (2)
 */
export function setVoxelCell(volumeId: any, flatIdx: any, zoneId: any) {
    const vol = _volumes.get(volumeId);
    if (!vol?.grid || flatIdx < 0 || flatIdx >= vol.grid.length)
        return;
    vol.grid[flatIdx] = zoneId;
}
/**
 * Rebuild meshes for a volume after manual grid edits.
 * Reconstroi meshes apos edicoes manuais no grid.
 *
 * @param {string} volumeId
 */
export function rebuildVolumeMeshes(volumeId: any) {
    const vol = _volumes.get(volumeId);
    if (!vol || !_voxelGroup)
        return;
    buildVoxelMeshes(vol, _voxelGroup);
    requestRender();
    _persist();
    _notify();
}
// ----------------------------------------------------------------
// CONTROLES
// ----------------------------------------------------------------
/**
 * Set display mode (solid or voxels).
 * Alterna entre bloco solido e cubos individuais.
 *
 * @param {string} id - volume ID
 * @param {'solid'|'voxels'} mode
 */
export function setVolumeMode(id: any, mode: any) {
    const vol = _volumes.get(id);
    if (!vol || !vol.grid)
        return;
    vol.mode = mode;
    if (_voxelGroup) {
        buildVoxelMeshes(vol, _voxelGroup);
        requestRender();
    }
    _persist();
    _notify();
}
/**
 * Change voxel resolution and recompute.
 * Muda resolucao e reconstroi o grid + meshes.
 *
 * @param {string} id - volume ID
 * @param {number} resolution - new resolution in meters
 */
export function setVolumeResolution(id: any, resolution: any) {
    const vol = _volumes.get(id);
    if (!vol)
        return;
    vol.resolution = resolution;
    _recompute(id);
    _persist();
    _notify();
}
/**
 * Toggle volume visibility.
 * @param {string} id
 * @param {boolean} visible
 */
export function setVolumeVisible(id: any, visible: any) {
    const vol = _volumes.get(id);
    if (!vol)
        return;
    vol.visible = visible;
    if (_voxelGroup) {
        setVoxelVisible(id, visible, _voxelGroup);
        requestRender();
    }
    _persist();
    _notify();
}
/**
 * Set volume opacity.
 * @param {string} id
 * @param {number} opacity - 0.0–1.0
 */
export function setVolumeOpacity(id: any, opacity: any) {
    const vol = _volumes.get(id);
    if (!vol)
        return;
    vol.opacity = opacity;
    if (_voxelGroup) {
        setVoxelOpacity(id, opacity, _voxelGroup);
        requestRender();
    }
    _persist();
}
/**
 * Recompute a volume (when surfaces change).
 * Reclassifica e reconstroi meshes.
 *
 * @param {string} id - volume ID
 */
export function recomputeVolume(id: any) {
    _recompute(id);
    _persist();
    _notify();
}
// ----------------------------------------------------------------
// PERSISTENCE
// ----------------------------------------------------------------
/**
 * Export volumes for model save (without grid data).
 * Exporta configs sem grid - sera recomputado no import.
 * @returns {Array<Record<string, any>>}
 */
export function exportVolumes() {
    return Array.from(_volumes.values()).map((v: any) => ({
        id: v.id,
        name: v.name,
        resolution: v.resolution,
        mode: v.mode,
        visible: v.visible,
        opacity: v.opacity,
    }));
}
/**
 * Import volumes from model data.
 * Restaura e recomputa cada volume.
 * @param {Array<Record<string, any>>} configs
 */
export function importVolumes(configs: any) {
    // Clear existing
    if (_voxelGroup)
        disposeVoxelMeshes(_voxelGroup);
    _volumes.clear();
    for (const cfg of configs) {
        const vol = {
            ...cfg,
            grid: null,
            dims: null,
            zones: GEOLOGY_ZONES,
            bounds: null,
            yRange: null,
            channels: {},
        };
        _volumes.set(vol.id, vol);
        _recompute(vol.id, true);
    }
    _notify();
}
// ----------------------------------------------------------------
// CHANNELS
// ----------------------------------------------------------------
/**
 * Get channel map from a volume.
 * @param {string} volumeId
 * @returns {Object<string, any>}
 */
export function getVolumeChannels(volumeId: any) {
    const vol = _volumes.get(volumeId);
    return vol?.channels || {};
}
/**
 * Get a specific channel from a volume.
 * @param {string} volumeId
 * @param {string} channelName
 * @returns {any|null}
 */
export function getVolumeChannel(volumeId: any, channelName: any) {
    const vol = _volumes.get(volumeId);
    if (!vol?.channels)
        return null;
    return vol.channels[channelName] || null;
}
/**
 * Add or replace a scalar channel in a volume.
 * @param {string} volumeId
 * @param {{name:string,label?:string,unit?:string,ramp?:string,data:Float32Array,min?:number,max?:number,timestamp?:number}} channel
 * @returns {boolean}
 */
export function addVolumeChannel(volumeId: any, channel: any) {
    const vol = _volumes.get(volumeId);
    if (!vol || !vol.dims)
        return false;
    if (!channel?.name || !channel?.data)
        return false;
    if (!vol.channels)
        vol.channels = {};
    vol.channels[channel.name] = {
        name: channel.name,
        label: channel.label || channel.name,
        unit: channel.unit || '',
        ramp: channel.ramp || 'generic',
        data: channel.data,
        min: channel.min ?? 0,
        max: channel.max ?? 0,
        timestamp: channel.timestamp || Date.now(),
    };
    normalizeChannel(vol.channels[channel.name]);
    _persist();
    _notify();
    return true;
}
/**
 * Create and add an empty channel for a volume.
 * @param {string} volumeId
 * @param {string} channelName
 * @param {string} [unit='']
 * @param {string} [ramp='generic']
 * @param {string} [label='']
 * @returns {any|null}
 */
export function createVolumeChannel(volumeId: any, channelName: any, unit: any = '', ramp: any = 'generic', label: any = '') {
    const vol = _volumes.get(volumeId);
    if (!vol?.dims)
        return null;
    const channel = createChannel(vol.dims, channelName, unit, ramp, label);
    addVolumeChannel(volumeId, channel);
    return channel;
}
/**
 * Remove a scalar channel from a volume.
 * @param {string} volumeId
 * @param {string} channelName
 */
export function removeVolumeChannel(volumeId: any, channelName: any) {
    const vol = _volumes.get(volumeId);
    if (!vol?.channels?.[channelName])
        return;
    delete vol.channels[channelName];
    _persist();
    _notify();
}
// ----------------------------------------------------------------
// SCALAR RENDERING
// ----------------------------------------------------------------
/**
 * Apply a channel's color gradient to all voxel meshes of a volume.
 * Aplica gradiente de cor continuo dos voxels baseado no canal escalar.
 *
 * @param {string} volumeId
 * @param {string} channelName
 * @param {Object} [opts] - { threshold:0..1, invert:bool }
 * @returns {boolean}
 */
export function applyVolumeChannelColors(volumeId: any, channelName: any, opts = {}) {
    const vol = _volumes.get(volumeId);
    if (!vol || !_voxelGroup)
        return false;
    const channel = vol.channels?.[channelName];
    if (!channel)
        return false;
    applyChannelToVolume(_voxelGroup, volumeId, channel, opts);
    requestRender();
    return true;
}
/**
 * Clear scalar overlay and restore zone colors.
 * Limpa sobreposicao escalar e restaura cores de zona.
 *
 * @param {string} volumeId
 */
export function clearVolumeChannelColors(volumeId: any) {
    if (!_voxelGroup)
        return;
    clearChannelFromVolume(_voxelGroup, volumeId);
    requestRender();
}
/**
 * Add an isosurface mesh at a given channel value to the scene.
 * Adiciona isosuperfície ao volume no valor especificado do canal.
 *
 * @param {string} volumeId
 * @param {string} channelName
 * @param {number} isoValue - absolute value (same units as channel)
 * @param {Object} [opts] - { opacity, ramp }
 * @returns {boolean}
 */
export function addVolumeIsosurface(volumeId: any, channelName: any, isoValue: any, opts = {}) {
    const vol = _volumes.get(volumeId);
    if (!vol?.dims || !vol.bounds || !vol.yRange || !vol.resolution || !_voxelGroup)
        return false;
    const channel = vol.channels?.[channelName];
    if (!channel)
        return false;
    // Remove existing isosurfaces for this channel
    clearIsosurfaces(_voxelGroup, volumeId);
    const mesh = extractChannelIsosurface(channel, vol.dims, vol.bounds, vol.yRange, vol.resolution, isoValue, opts);
    if (!mesh)
        return false;
    mesh.userData.volumeId = volumeId;
    _voxelGroup.add(mesh);
    requestRender();
    return true;
}
/**
 * Remove isosurfaces from a volume.
 * @param {string} volumeId
 */
export function removeVolumeIsosurfaces(volumeId: any) {
    if (!_voxelGroup)
        return;
    clearIsosurfaces(_voxelGroup, volumeId);
    requestRender();
}
// ----------------------------------------------------------------
// INTERNALS
// ----------------------------------------------------------------
/**
 * Recompute a volume's grid and rebuild meshes.
 * @param {string} id
 * @param {boolean} [silent=false] suppress toasts
 */
function _recompute(id: any, silent: any = false) {
    const vol = _volumes.get(id);
    if (!vol)
        return;
    const bounds = _getBoundaryBounds();
    if (!bounds) {
        if (!silent)
            showToast('Nenhuma boundary encontrada.', 'warning');
        return;
    }
    const strata = CONFIG.STRATA || [];
    const deepestBottom = strata.length > 0 ? Math.min(...strata.map((s: any) => s.bottom)) : -50;
    let maxTerrainY = 0;
    if (hasTerrainGrid()) {
        const pts = [
            [bounds.minX, bounds.minZ],
            [bounds.maxX, bounds.minZ],
            [bounds.minX, bounds.maxZ],
            [bounds.maxX, bounds.maxZ],
            [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2],
        ];
        for (const [sx, sz] of pts) {
            const y = Number(sampleTerrainElevation(sx, sz));
            if (y > maxTerrainY)
                maxTerrainY = y;
        }
        maxTerrainY += 5;
    }
    vol.bounds = bounds;
    vol.yRange = { top: maxTerrainY, bottom: deepestBottom };
    const res = vol.resolution || suggestResolution(bounds, vol.yRange);
    vol.resolution = res;
    // Check cap
    const nx = Math.ceil((bounds.maxX - bounds.minX) / res);
    const ny = Math.ceil((vol.yRange.top - vol.yRange.bottom) / res);
    const nz = Math.ceil((bounds.maxZ - bounds.minZ) / res);
    if (nx * ny * nz > MAX_VOXELS) {
        vol.resolution = suggestResolution(bounds, vol.yRange);
    }
    const sampleTop: any = (x: any, z: any) => (hasTerrainGrid() ? Number(sampleTerrainElevation(x, z)) : 0);
    const hasWT = getAllLayers().some((l: any) => l.type === 'water_table' && l.grid);
    const sampleDivider: any = hasWT ? (x: any, z: any) => Number(sampleLayerGrid('water_table', x, z)) : (_x: any, _z: any) => -5;
    const { grid, dims } = voxelize(vol.bounds, vol.yRange, vol.resolution, sampleTop, sampleDivider);
    vol.grid = grid;
    vol.dims = dims;
    // RF-5: recarimba air blocks junto do grid (mesma superfície do voxelize).
    vol.surfaceStamps = stampAirBlocks(dims, {
        yRangeBottom: vol.yRange.bottom,
        resolution: vol.resolution,
        sampleSurfaceY: sampleTop,
        minX: vol.bounds.minX,
        minZ: vol.bounds.minZ,
    });
    vol.zones = GEOLOGY_ZONES;
    vol.channels = vol.channels || {};
    if (_voxelGroup) {
        buildVoxelMeshes(vol, _voxelGroup);
        requestRender();
    }
}
/**
 * Get boundary bounds from model elements.
 * Busca bounds da boundary - replicado de interpolation/manager.
 * @returns {VoxelBounds|null}
 */
function _getBoundaryBounds() {
    const elements = getAllElements();
    const boundary = elements.find((e: any) => e.family === 'boundary');
    if (!boundary || !boundary.data?.vertices?.length)
        return null;
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const v of boundary.data.vertices) {
        if (v.x < minX)
            minX = v.x;
        if (v.x > maxX)
            maxX = v.x;
        if (v.z < minZ)
            minZ = v.z;
        if (v.z > maxZ)
            maxZ = v.z;
    }
    const padX = (maxX - minX) * 0.1;
    const padZ = (maxZ - minZ) * 0.1;
    return {
        minX: minX - padX,
        maxX: maxX + padX,
        minZ: minZ - padZ,
        maxZ: maxZ + padZ,
    };
}
/** Persist to IndexedDB (without grid — fire-and-forget). */
async function _persist() {
    if (isEphemeral())
        return;
    const data = Array.from(_volumes.values()).map((v: any) => ({
        id: v.id,
        name: v.name,
        resolution: v.resolution,
        mode: v.mode,
        visible: v.visible,
        opacity: v.opacity,
        channelMetas: Object.values(v.channels || {}).map((ch: any) => ({
            name: ch.name,
            label: ch.label,
            unit: ch.unit,
            ramp: ch.ramp,
            min: ch.min,
            max: ch.max,
            timestamp: ch.timestamp,
        })),
    }));
    const ok = await idbSet(LS_KEY, data);
    if (!ok)
        showToast('Storage full. Voxel data may not persist.', 'warning');
    for (const vol of _volumes.values()) {
        const channels = Object.values(vol.channels || {}) as any[];
        for (const ch of channels) {
            await idbSet(_channelDataKey(vol.id, ch.name), {
                name: ch.name,
                unit: ch.unit || '',
                ramp: ch.ramp || 'generic',
                label: ch.label || ch.name,
                min: ch.min ?? 0,
                max: ch.max ?? 0,
                timestamp: ch.timestamp || Date.now(),
                data: ch.data.buffer,
            });
        }
    }
}
/** Dispatch change event. */
function _notify() {
    window.dispatchEvent(new CustomEvent('voxelChanged'));
}
/**
 * @param {string} volumeId
 * @param {string} channelName
 */
function _channelDataKey(volumeId: any, channelName: any) {
    return `${CHANNEL_KEY_PREFIX}-${volumeId}-${channelName}`;
}
/** @param {VoxelVolume} volume */
async function _restoreChannels(volume: any) {
    const metas = Array.isArray(volume.channelMetas) ? volume.channelMetas : [];
    if (!metas.length || !volume.dims)
        return;
    volume.channels = volume.channels || {};
    const expectedLength = volume.dims.nx * volume.dims.ny * volume.dims.nz;
    for (const meta of metas) {
        const payload = await idbGetWithLegacy(_channelDataKey(volume.id, meta.name));
        if (!payload?.data)
            continue;
        const raw = payload.data instanceof ArrayBuffer ? payload.data : payload.data.buffer;
        const typed = new Float32Array(raw);
        if (typed.length !== expectedLength)
            continue;
        volume.channels[meta.name] = {
            name: meta.name,
            label: payload.label || meta.label || meta.name,
            unit: payload.unit || meta.unit || '',
            ramp: payload.ramp || meta.ramp || 'generic',
            min: payload.min ?? meta.min ?? 0,
            max: payload.max ?? meta.max ?? 0,
            timestamp: payload.timestamp || meta.timestamp || Date.now(),
            data: typed,
        };
    }
}
// ----------------------------------------------------------------
// TAB-MODEL-SWITCH-001 — Manager Signature (snapshot/restore per tab)
// ----------------------------------------------------------------
/**
 * Exporta estado completo para snapshot de tab.
 * Wraps exportVolumes() existente + selectedVolumeId.
 * NÃO inclui _voxelGroup (objeto Three.js — re-criado via setVoxelGroup).
 */
export function exportState(): { volumes: any; selectedVolumeId: any } {
    return {
        volumes: exportVolumes(),
        selectedVolumeId: _selectedVolumeId,
    };
}
/**
 * Restaura estado a partir de snapshot.
 * Tolerante a state null/malformed (degrada para clearAllVolumes).
 * Caller deve chamar setVoxelGroup() ANTES (Three.js group precisa existir).
 */
export function importState(state: { volumes?: any; selectedVolumeId?: any } | null | undefined): void {
    clearAllVolumes();
    if (!state || typeof state !== 'object') return;
    if (state.volumes) {
        importVolumes(state.volumes);
    }
    if (state.selectedVolumeId !== undefined) {
        _selectedVolumeId = state.selectedVolumeId;
    }
}
/** Alias canônico para Manager Registry. */
export function resetState(): void {
    clearAllVolumes();
    _selectedVolumeId = null;
}
//# sourceMappingURL=manager.js.map
//# sourceMappingURL=manager.js.map
