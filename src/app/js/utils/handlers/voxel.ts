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
   VOXEL HANDLERS — UI action handlers for voxel geology
   Handlers de acoes do usuario para o modulo de voxelizacao

   Todas as funcoes sao expostas via window.* pelo handlers/index.js.
   Chamadas pelos botoes na ribbon e painel de controles.
   ================================================================ */

import {
    createGeologyVolume,
    removeVolume,
    getAllVolumes,
    getVolume,
    setVolumeMode,
    setVolumeResolution,
    setVolumeVisible,
    setVolumeOpacity,
    recomputeVolume,
    getSelectedVolume,
    setSelectedVolume,
    applyVolumeChannelColors,
    clearVolumeChannelColors,
    addVolumeIsosurface,
    removeVolumeIsosurfaces,
    getVolumeChannels,
} from '../../core/voxel/manager.js';

import { setSelectedElement } from '../../core/elements/manager.js';
import { setSelectedLayer } from '../../core/interpolation/manager.js';
import { enterVoxelEdit, exitVoxelEdit } from '../../core/voxel/editController.js';
import { showToast as _showToastImpl } from '../ui/toast.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const showToast: (...a: any[]) => any = _showToastImpl as any;

/** @type {Function | null} */
let _requestUIRefresh: any = null;

/**
 * Inject UI refresh dependency.
 * @param {Function} fn
 */
export function setVoxelUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestVoxelUIRefresh(reason = 'voxel.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.VOXEL,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
    ];
    for (const domain of domains)
        _requestUIRefresh(domain, reason);
}

// ----------------------------------------------------------------
// HANDLER FUNCTIONS
// ----------------------------------------------------------------

/**
 * Generate geology volume from terrain + water table surfaces.
 * Gera volume geologico (zona vadosa/saturada).
 * @param {any} [opts] - { resolution?: number }
 */
function handleGenerateGeology(opts: any) {
    const vol = createGeologyVolume(opts);
    if (vol) requestVoxelUIRefresh();
    _renderVoxelPanel();
}

/**
 * Remove voxel volume.
 * Remove o volume voxelizado.
 * @param {string} [id] - volume ID (first if omitted)
 */
function handleRemoveVoxelVolume(id: any) {
    removeVolume(id);
    requestVoxelUIRefresh();
    _renderVoxelPanel();
}

/**
 * Toggle between solid and voxel display mode.
 * Alterna entre bloco solido e cubos individuais (Minecraft).
 * @param {string} [id] - volume ID (first if omitted)
 */
function handleToggleVoxelMode(/** @type {string} */ id: any) {
    const vols = (getAllVolumes() as any[]);
    const vol = id ? vols.find((/** @type {any} */ v: any) => v.id === id) : vols[0];
    if (!vol) return;
    const newMode = vol.mode === 'solid' ? 'voxels' : 'solid';
    setVolumeMode(vol.id, newMode);
    requestVoxelUIRefresh();
    _renderVoxelPanel();
}

/**
 * Set voxel resolution.
 * Muda resolucao dos voxels (1, 2, 5, 10 metros).
 * @param {number|any} id - resolution number or {resolution, id?}
 */
/**
 * CC-S1 B3 artesanal (CCC-001 Fase 11) — wrapper p/ select do card de volume
 * (era objeto inline {id, resolution: Number(this.value)}).
 */
function handleSetVoxelResolutionForVolume(id: any, value: any) {
    handleSetVoxelResolution({ id, resolution: Number(value) });
}

function handleSetVoxelResolution(/** @type {any} */ resOrOpts: any) {
    const vols = (getAllVolumes() as any[]);
    let resolution, id: any;
    if (typeof resOrOpts === 'object') {
        resolution = resOrOpts.resolution;
        id = resOrOpts.id;
    } else {
        resolution = resOrOpts;
    }
    const vol = id ? vols.find((/** @type {any} */ v: any) => v.id === id) : vols[0];
    if (!vol || !resolution) return;
    setVolumeResolution(vol.id, Number(resolution));
    requestVoxelUIRefresh();
    _renderVoxelPanel();
}

/**
 * Toggle voxel volume visibility.
 * @param {string} [id]
 */
function handleToggleVoxelVisible(/** @type {string} */ id: any) {
    const vols = (getAllVolumes() as any[]);
    const vol = id ? vols.find((/** @type {any} */ v: any) => v.id === id) : vols[0];
    if (!vol) return;
    setVolumeVisible(vol.id, !vol.visible);
    _renderVoxelPanel();
}

/**
 * Set voxel opacity from slider.
 * @param {number|string} value - 0–100
 */
function handleSetVoxelOpacity(value: any) {
    const vols = (getAllVolumes() as any[]);
    const vol = vols[0];
    if (!vol) return;
    setVolumeOpacity(vol.id, Number(value) / 100);
}

/**
 * Recompute voxels after surface changes.
 * Recomputa apos mudancas nas superficies de interpolacao.
 */
function handleRecomputeVoxels() {
    const vols = (getAllVolumes() as any[]);
    for (const vol of vols) {
        recomputeVolume(vol.id);
    }
    requestVoxelUIRefresh();
    _renderVoxelPanel();
}

// ----------------------------------------------------------------
// VOXEL CONTROL PANEL - Injected into ribbon area
// ----------------------------------------------------------------

/**
 * Render the voxel control panel (inline in ribbon or floating).
 * Atualiza o painel de controles do voxel.
 */
function _renderVoxelPanel() {
    const panel = document.getElementById('voxel-controls');
    if (!panel) return;

    const vols = (getAllVolumes() as any[]);
    if (vols.length === 0) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = '';
    const vol = vols[0];

    // Mode buttons
    const solidBtn = panel.querySelector('[data-voxel-mode="solid"]');
    const voxelBtn = panel.querySelector('[data-voxel-mode="voxels"]');
    if (solidBtn) solidBtn.classList.toggle('active', vol.mode === 'solid');
    if (voxelBtn) voxelBtn.classList.toggle('active', vol.mode === 'voxels');

    // Resolution display
    const resLabel = panel.querySelector('.voxel-res-label');
    if (resLabel) resLabel.textContent = `${vol.resolution}m`;

    // Opacity slider
    const opSlider = panel.querySelector('.voxel-opacity-slider');
    if (opSlider) (opSlider as any).value = Math.round((vol.opacity || 0.6) * 100);

    // Visibility toggle
    const visBtn = panel.querySelector('.voxel-vis-btn');
    if (visBtn) visBtn.classList.toggle('active', vol.visible !== false);

    // Stats
    const stats = panel.querySelector('.voxel-stats');
    if (stats && vol.dims) {
        const total = vol.dims.nx * vol.dims.ny * vol.dims.nz;
        stats.textContent = `${vol.dims.nx}×${vol.dims.ny}×${vol.dims.nz} = ${total.toLocaleString()} voxels`;
    }
}

// ----------------------------------------------------------------
// SELECAO DE VOLUME (side panel)
// ----------------------------------------------------------------

/**
 * Select a voxel volume (mutual exclusion with element/layer).
 * Seleciona volume no painel lateral - limpa outras selecoes.
 * @param {string} volumeId
 */
function handleSelectVolume(volumeId: any) {
    // Limpa selecoes de element e layer
    setSelectedElement(null);
    setSelectedLayer(null);

    const prev = getSelectedVolume();
    setSelectedVolume(prev === volumeId ? null : volumeId);
    requestVoxelUIRefresh();
}

/**
 * Set volume display mode with explicit ID.
 * Alterna modo de visualizacao (solid/voxels) com ID explicito.
 * @param {string} id
 * @param {'solid'|'voxels'} mode
 */
function handleSetVolumeMode(id: any, mode: any) {
    setVolumeMode(id, mode);
    requestVoxelUIRefresh();
    _renderVoxelPanel();
}

/**
 * Set volume opacity with explicit ID.
 * Define opacidade de um volume especifico.
 * @param {string} id
 * @param {number|string} value - 0–100
 */
function handleSetVolumeOpacityById(id: any, value: any) {
    setVolumeOpacity(id, Number(value) / 100);
}

// ----------------------------------------------------------------
// VOXEL EDIT MODE
// ----------------------------------------------------------------

/**
 * Enter voxel edit mode for a volume.
 * Entra no modo de edicao de voxels individuais.
 * @param {string} [volumeId]
 */
function handleEnterVoxelEdit(volumeId: any) {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    const vol = (volumeId ? getVolume(volumeId) : getAllVolumes()[0] as any);
    if (!vol) {
        showToast('No voxel volume to edit.', 'warning');
        return;
    }

    // Deve estar em modo voxels para editar
    if (vol.mode !== 'voxels') {
        setVolumeMode(vol.id, 'voxels');
    }

    const success = enterVoxelEdit(vol.id, container);
    if (success) {
        showToast('Voxel Edit: Click=Delete | Ctrl+Click=Insert | Esc=Exit', 'info');
        requestVoxelUIRefresh();
    }
}

/**
 * Exit voxel edit mode.
 * Sai do modo de edicao de voxels.
 */
function handleExitVoxelEdit() {
    exitVoxelEdit();
    requestVoxelUIRefresh();
}

// ----------------------------------------------------------------
// SCALAR CHANNEL OVERLAY
// ----------------------------------------------------------------

/**
 * Apply a scalar channel's color gradient to a volume's voxels.
 * Aplica gradiente de cor do canal escalar nos voxels do volume.
 *
 * @param {string} [volumeId] - defaults to selected volume
 * @param {string} [channelName] - defaults to first available channel
 */
function handleApplyVoxelChannel(volumeId: any, channelName: any) {
    const id = volumeId || getSelectedVolume();
    if (!id) {
        showToast('No voxel volume selected.', 'warning');
        return;
    }
    const channels = getVolumeChannels(id);
    const name = channelName || Object.keys(channels)[0];
    if (!name) {
        showToast('No channel available on this volume.', 'warning');
        return;
    }
    const ok = applyVolumeChannelColors(id, name);
    if (ok) {
        showToast(`Channel "${name}" applied to voxels.`, 'success');
        requestVoxelUIRefresh();
    }
}

/**
 * Clear scalar channel overlay from a volume.
 * @param {string} [volumeId]
 */
function handleClearVoxelChannel(volumeId: any) {
    const id = volumeId || getSelectedVolume();
    if (!id) return;
    clearVolumeChannelColors(id);
    requestVoxelUIRefresh();
}

/**
 * Add isosurface to a volume at the given channel value.
 * @param {string} volumeId
 * @param {string} channelName
 * @param {number} isoValue
 */
function handleAddVoxelIsosurface(volumeId: any, channelName: any, isoValue: any) {
    const id = volumeId || getSelectedVolume();
    if (!id) return;
    const ok = addVolumeIsosurface(id, channelName, Number(isoValue));
    if (ok) showToast(`Isosurface at ${isoValue} added.`, 'success');
}

/**
 * Remove all isosurfaces from a volume.
 * @param {string} [volumeId]
 */
function handleRemoveVoxelIsosurfaces(volumeId: any) {
    const id = volumeId || getSelectedVolume();
    if (!id) return;
    removeVolumeIsosurfaces(id);
}

// ----------------------------------------------------------------
// EXPORT
// ----------------------------------------------------------------

export const voxelHandlers = {
    handleGenerateGeology,
    handleRemoveVoxelVolume,
    handleToggleVoxelMode,
    handleSetVoxelResolution,
    handleSetVoxelResolutionForVolume,
    handleToggleVoxelVisible,
    handleSetVoxelOpacity,
    handleRecomputeVoxels,
    handleSelectVolume,
    handleSetVolumeMode,
    handleSetVolumeOpacityById,
    handleEnterVoxelEdit,
    handleExitVoxelEdit,
    handleApplyVoxelChannel,
    handleClearVoxelChannel,
    handleAddVoxelIsosurface,
    handleRemoveVoxelIsosurfaces,
};
