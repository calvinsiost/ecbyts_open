// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   SEQUENCER MANAGER — State management for Storyboard + Timeline
   Gerencia items (clusters + scenes), keyframes e playback state.
   Persistencia via localStorage. Round-trip via ECO1.

   Modelo de dados:
   - items[]: StoryboardItem (cluster ou scene)
   - keyframes[]: Keyframe (pontos na timeline)
   - playback: { playing, position, speed, loop, totalDuration }

   REFATORACAO (pattern §4.1): o estado compartilhado + CRUD + persist
   foi extraido para a folha pura ./state.js (quebra feedback-edges
   engine/renderer/videoBot → manager). Este modulo mantem apenas a
   logica que precisa de detectClusters/scenes (NAO-folhas) e RE-EXPORTA
   a API publica original de ./state.js — TODOS os named exports
   originais permanecem identicos para os consumidores externos.
   ================================================================ */
import { detectClusters } from './clusters.js';
import { getAllScenes, initScenes } from '../../utils/scenes/manager.js';
import {
    mapLegacyClusterKeyframes as _mapLegacyClusterKeyframesPure,
    buildClusterCarryOverMap as _buildClusterCarryOverMapPure,
} from './_sequencerClusterPure.js';
import {
    getRawState,
    setClusterLegacyIdMap,
    getClusterLegacyIdMap,
    persist,
    notifyChange,
    restoreFromSerialized as _stateRestoreFromSerialized,
    getSerializableState as _stateGetSerializableState,
    restore,
} from './state.js';
// Re-export da API publica de estado/CRUD (preserva named exports).
export {
    getItems,
    getItemById,
    getItemCount,
    getKeyframes,
    getLanes,
    createLane,
    deleteLane,
    renameLane,
    moveKeyframeToLane,
    addKeyframe,
    removeKeyframe,
    updateKeyframe,
    moveKeyframe,
    getPlayback,
    setPlaybackPosition,
    setPlaybackSpeed,
    setPlaybackLoop,
    setPlaying,
    getTotalDuration,
    getKeyframesAtPosition,
    getActiveKeyframe,
    onChange,
} from './state.js';
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const PENDING_RESTORE_KEY = '__ecbyts_pending_storyboard';
const CLUSTER_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const SCENE_COLOR = '#6366f1';
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Inicializa o sequencer: restaura do localStorage e detecta clusters.
 * Chamado no init da aplicacao.
 */
export async function initSequencer() {
    // Restaura cenas do IDB antes de restaurar keyframes e chamar refreshItems().
    // Sem isso, scenes ficam vazias no boot e todos os keyframes sao descartados
    // como orfaos em refreshItems() (STATE_CONTINUITY_BREAK_AFTER_RELOAD).
    await initScenes();
    await restore();
    refreshItems();
    // Import pode ocorrer antes do sequencer existir (boot via URL/cloud).
    // Nesse caso, o import deixa o storyboard pendente no window.
    const { hasPending, data } = _consumePendingRestore();
    if (hasPending) {
        restoreFromSerialized(data, { refreshItems: false });
    }
    // Expoe referencia lazy para export.js (evita import circular)
    if (typeof window !== 'undefined') {
        window.__ecbyts_sequencer = { getSerializableState, restoreFromSerialized };
    }
}
/**
 * Re-detecta clusters e sincroniza com scenes existentes.
 * Chamado apos ingestao de dados ou mudanca de elementos.
 */
export function refreshItems() {
    const _state = getRawState();
    const clusters = detectClusters();
    const scenes = getAllScenes();
    const previousClusters = _state.items.filter((it) => it.type === 'cluster');
    /** @type {any[]} */
    const newItems: any[] = [];
    const clusterLegacyIdMap = new Map();
    // 1. Adicionar clusters (se mais de 1)
    if (clusters.length > 1) {
        clusters.forEach((cluster: any, i: number) => {
            const stableId = `sb-${cluster.id}`;
            clusterLegacyIdMap.set(`sb-cluster-${i}`, stableId);
            newItems.push({
                id: stableId,
                type: 'cluster',
                name: cluster.name,
                icon: cluster.dominantFamily || 'map-pin',
                color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
                bounds: cluster.bounds,
                centroid: cluster.centroid,
                elementIds: cluster.elementIds,
                sceneId: null,
                cameraState: cluster.cameraState,
            });
        });
    }
    // 2. Adicionar scenes como items
    scenes.forEach((scene: any, i: number) => {
        if (!scene.viewStart) return; // Scene sem camera = nao util
        newItems.push({
            id: `sb-scene-${scene.id}`,
            type: 'scene',
            name: scene.name || `Cena ${i + 1}`,
            icon: 'camera',
            color: SCENE_COLOR,
            bounds: null,
            centroid: null,
            elementIds: null,
            sceneId: scene.id,
            cameraState: scene.viewStart,
        });
    });
    const nextClusters = newItems.filter((it) => it.type === 'cluster');
    const carryOverClusterIdMap = _buildClusterCarryOverMap(previousClusters, nextClusters);
    _state.items = newItems;
    setClusterLegacyIdMap(new Map([...carryOverClusterIdMap, ...clusterLegacyIdMap]));
    // Migra keyframes para aliases atuais:
    // - legado: sb-cluster-<index> -> sb-cluster-hash
    // - carry-over: cluster antigo -> cluster novo mais proximo por overlap de elementos.
    _state.keyframes = _mapLegacyClusterKeyframes(_state.keyframes);
    // Limpar keyframes orfaos (referenciando items que nao existem mais)
    const validIds = new Set(newItems.map((it) => it.id));
    _state.keyframes = _state.keyframes.filter((kf) => validIds.has(kf.itemId));
    persist();
    notifyChange();
}
// ----------------------------------------------------------------
// SERIALIZATION - Para ECO1 round-trip
// ----------------------------------------------------------------
export function getSerializableState() {
    return _stateGetSerializableState();
}
/** @param {any} data @param {any} [options] */
export function restoreFromSerialized(data: any, options: any = {}) {
    return _stateRestoreFromSerialized(data, options, refreshItems);
}
// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------
/** @param {any[]} keyframes */
function _mapLegacyClusterKeyframes(keyframes: any[]) {
    return _mapLegacyClusterKeyframesPure(keyframes, getClusterLegacyIdMap());
}
/** @param {any[]} previousClusters @param {any[]} nextClusters */
function _buildClusterCarryOverMap(previousClusters: any[], nextClusters: any[]) {
    return _buildClusterCarryOverMapPure(previousClusters, nextClusters);
}
function _consumePendingRestore() {
    if (typeof window === 'undefined') return { hasPending: false, data: null };
    const hasPending = Object.prototype.hasOwnProperty.call(window, PENDING_RESTORE_KEY);
    if (!hasPending) return { hasPending: false, data: null };
    const data = window[PENDING_RESTORE_KEY];
    try {
        delete window[PENDING_RESTORE_KEY];
    } catch (e: any) {
        console.debug('[sequencer] deletePendingRestore:', e?.message || e);
        window[PENDING_RESTORE_KEY] = undefined;
    }
    return { hasPending: true, data };
}
//# sourceMappingURL=manager.js.map
