// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   SEQUENCER STATE — Leaf shared-state module (pattern §4.1)
   Folha pura de estado compartilhado do sequencer. Contem o objeto
   _state (items/keyframes/lanes/playback), os callbacks de mudanca,
   o CRUD de keyframes/lanes e a persistencia.

   ZERO import de manager/engine/renderer/videoBot/controls — esta
   folha quebra as feedback-edges pai→filho: manager/engine/renderer/
   videoBot leem o estado AQUI em vez de uns aos outros.

   Tambem expoe um pequeno registry de acoes do engine
   (registerEngineActions/getEngineActions) para que renderer/videoBot
   acionem play/seek/etc. sem importar engine.js estaticamente. O
   registro acontece em tempo de carga do modulo engine.js (sincrono,
   antes de qualquer interacao de UI) — runtime byte-identico.
   ================================================================ */
import { isEphemeral } from '../../utils/storage/storageMonitor.js';
import { idbSet, idbGetWithLegacy } from '../../utils/storage/idbStore.js';
import { showToast } from '../../utils/ui/toast.js';
import {
    createDeferredIdlePersistence,
    type DeferredIdlePersistenceController,
} from '../../utils/performance/deferredIdlePersistence.js';
import {
    VALID_STORYBOARD_SPEEDS,
    DEFAULT_LANE,
    computeStoryboardTotalDuration,
    normalizeStoryboardRestore,
    serializeStoryboardState,
} from './storyboardState.js';
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-storyboard';
const STORYBOARD_PERSIST_DEBOUNCE_MS = 1500;
const STORYBOARD_PERSIST_AFTER_BOOT_DELAY_MS = 30000;
const STORYBOARD_PERSIST_IDLE_TIMEOUT_MS = 3000;
const LANE_COLORS = ['#4f8ef7', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
const _state: { items: any[]; keyframes: any[]; lanes: any[]; playback: any } = {
    items: [],
    keyframes: [],
    lanes: [{ ...DEFAULT_LANE }],
    playback: {
        playing: false,
        position: 0.0,
        speed: 1.0,
        loop: false,
        totalDuration: 10000,
    },
};
/** @type {Array<(...args:any[])=>void>} */
let _onChangeCallbacks: any[] = [];
/** @type {Map<string, string>} */
let _clusterLegacyIdMap = new Map();
let _persistScheduler: DeferredIdlePersistenceController | null = null;
let _lastPersistSignature = '';
// ----------------------------------------------------------------
// RAW STATE ACCESS — para manager.js (mantem refreshItems/restore la,
// pois precisam de detectClusters/scenes que NAO sao folhas).
// ----------------------------------------------------------------
/** @returns {typeof _state} */
export function _getRawState() {
    return _state;
}
/** @param {Map<string,string>} map */
export function _setClusterLegacyIdMap(map: any) {
    _clusterLegacyIdMap = map;
}
/** @returns {Map<string,string>} */
export function _getClusterLegacyIdMap() {
    return _clusterLegacyIdMap;
}
// ----------------------------------------------------------------
// ENGINE ACTION REGISTRY — quebra renderer→engine / videoBot→engine
// ----------------------------------------------------------------
/** @type {Record<string, Function>} */
let _engineActions = {};
/** @param {Record<string, Function>} actions */
export function registerEngineActions(actions: any) {
    _engineActions = { ...actions };
}
/** @returns {Record<string, Function>} */
export function getEngineActions() {
    return _engineActions;
}
// ----------------------------------------------------------------
// ITEMS - Getters
// ----------------------------------------------------------------
export function getItems() {
    return _state.items;
}
/** @param {string} id */
export function getItemById(id: any) {
    return _state.items.find((it: any) => it.id === id) || null;
}
export function getItemCount() {
    return _state.items.length;
}
// ----------------------------------------------------------------
// KEYFRAMES - CRUD
// ----------------------------------------------------------------
export function getKeyframes() {
    return _state.keyframes;
}
// ----------------------------------------------------------------
// LANES - CRUD
// ----------------------------------------------------------------
export function getLanes() {
    return _state.lanes;
}
/**
 * Cria uma nova raia no storyboard.
 * @param {string} [name] - Nome da raia (default: "Raia N")
 * @returns {Object} A raia criada
 */
export function createLane(name = '') {
    const order = _state.lanes.length;
    const id = `lane-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const color = LANE_COLORS[order % LANE_COLORS.length];
    const lane = { id, name: name || `Raia ${order + 1}`, order, color };
    _state.lanes.push(lane);
    _persist();
    _notifyChange();
    return lane;
}
/**
 * Remove uma raia. Keyframes orfaos migram para lane-default.
 * Bloqueado se for a unica raia.
 * @param {string} laneId
 */
/** @param {string} laneId */
export function deleteLane(laneId: any) {
    if (laneId === 'lane-default') return; // raia padrao e permanente
    if (_state.lanes.length <= 1) return;
    // Migrar keyframes para lane-default
    _state.keyframes = _state.keyframes.map((kf: any) => (kf.laneId === laneId ? { ...kf, laneId: 'lane-default' } : kf));
    _state.lanes = _state.lanes.filter((l: any) => l.id !== laneId);
    // Reordenar
    _state.lanes.forEach((l: any, i: any) => {
        l.order = i;
    });
    _persist();
    _notifyChange();
}
/**
 * Renomeia uma raia.
 * @param {string} laneId
 * @param {string} name
 */
/** @param {string} laneId @param {string} name */
export function renameLane(laneId: any, name: any) {
    const lane = _state.lanes.find((l: any) => l.id === laneId);
    if (!lane || !name?.trim()) return;
    lane.name = name.trim().slice(0, 40);
    _persist();
    _notifyChange();
}
/**
 * Move um keyframe para outra raia.
 * @param {string} keyframeId
 * @param {string} laneId
 */
/** @param {string} keyframeId @param {string} laneId */
export function moveKeyframeToLane(keyframeId: any, laneId: any) {
    const kf = _state.keyframes.find((k: any) => k.id === keyframeId);
    if (!kf) return null;
    const lane = _state.lanes.find((l: any) => l.id === laneId);
    if (!lane) return null;
    kf.laneId = laneId;
    _persist();
    _notifyChange();
    return kf;
}
/**
 * Adiciona um keyframe na timeline.
 * @param {string} itemId - ID do StoryboardItem
 * @param {any} [options]
 * @returns {any}
 */
export function addKeyframe(itemId: any, options: any = {}) {
    const item = getItemById(itemId);
    if (!item) return null;
    const laneId =
        options.laneId && _state.lanes.find((l: any) => l.id === options.laneId)
            ? options.laneId
            : _state.lanes[_state.lanes.length - 1]?.id || 'lane-default';
    const kf = {
        id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        itemId,
        position: options.position ?? _nextKeyframePosition(),
        duration: options.duration ?? 3000,
        transition: options.transition ?? 1000,
        easing: options.easing ?? 'ease-out',
        cameraOverride: options.cameraOverride || null,
        campaignIds: options.campaignIds || null,
        elementVisibility: options.elementVisibility || null,
        annotation: options.annotation || null,
        laneId,
    };
    _state.keyframes.push(kf);
    _sortKeyframes();
    _recomputeTotalDuration();
    _persist();
    _notifyChange();
    return kf;
}
/**
 * Remove um keyframe por ID.
 */
/** @param {string} keyframeId */
export function removeKeyframe(keyframeId: any) {
    _state.keyframes = _state.keyframes.filter((kf: any) => kf.id !== keyframeId);
    _recomputeTotalDuration();
    _persist();
    _notifyChange();
}
/**
 * Atualiza propriedades de um keyframe.
 */
/** @param {string} keyframeId @param {any} updates */
export function updateKeyframe(keyframeId: any, updates: any) {
    const kf = _state.keyframes.find((k: any) => k.id === keyframeId);
    if (!kf) return null;
    Object.assign(kf, updates);
    if ('position' in updates) _sortKeyframes();
    if ('duration' in updates || 'transition' in updates) _recomputeTotalDuration();
    _persist();
    _notifyChange();
    return kf;
}
/**
 * Move um keyframe para nova posicao (0-1).
 */
/** @param {string} keyframeId @param {number} newPosition */
export function moveKeyframe(keyframeId: any, newPosition: any) {
    return updateKeyframe(keyframeId, { position: Math.max(0, Math.min(1, newPosition)) });
}
// ----------------------------------------------------------------
// PLAYBACK STATE
// ----------------------------------------------------------------
export function getPlayback() {
    return { ..._state.playback };
}
/** @param {number} pos @param {boolean} [notify=true] */
export function setPlaybackPosition(pos: any, notify: any = true) {
    _state.playback.position = Math.max(0, Math.min(1, pos));
    if (notify) _notifyChange();
}
/** @param {number} speed */
export function setPlaybackSpeed(speed: any) {
    _state.playback.speed = speed;
    _persist();
}
/** @param {boolean} loop */
export function setPlaybackLoop(loop: any) {
    _state.playback.loop = !!loop;
    _persist();
}
/** @param {boolean} playing */
export function setPlaying(playing: any) {
    _state.playback.playing = !!playing;
    _notifyChange();
}
export function getTotalDuration() {
    return _state.playback.totalDuration;
}
// ----------------------------------------------------------------
// KEYFRAME LOOKUP - Para o engine
// ----------------------------------------------------------------
/**
 * Encontra os keyframes antes e depois de uma posicao na timeline.
 * Retorna { prev, next, t } onde t é a interpolacao 0-1 entre eles.
 *
 * @param {number} position - 0.0 a 1.0
 * @returns {{ prev: Keyframe|null, next: Keyframe|null, t: number }}
 */
/** @param {number} position */
export function getKeyframesAtPosition(position: any) {
    const kfs = _state.keyframes;
    if (kfs.length === 0) return { prev: null, next: null, t: 0 };
    if (kfs.length === 1) return { prev: kfs[0], next: kfs[0], t: 0 };
    // Encontrar par que enquadra a posicao
    let prev = kfs[0];
    let next = kfs[kfs.length - 1];
    for (let i = 0; i < kfs.length - 1; i++) {
        if (position >= kfs[i].position && position <= kfs[i + 1].position) {
            prev = kfs[i];
            next = kfs[i + 1];
            break;
        }
    }
    // Se antes do primeiro keyframe
    if (position <= kfs[0].position) {
        return { prev: kfs[0], next: kfs[0], t: 0 };
    }
    // Se depois do ultimo keyframe
    if (position >= kfs[kfs.length - 1].position) {
        return { prev: kfs[kfs.length - 1], next: kfs[kfs.length - 1], t: 0 };
    }
    // Interpolar t entre prev e next
    const range = next.position - prev.position;
    const t = range > 0 ? (position - prev.position) / range : 0;
    return { prev, next, t };
}
/**
 * Encontra o keyframe ativo (mais proximo) para uma posicao.
 */
/** @param {number} position */
export function getActiveKeyframe(position: any) {
    const { prev, next, t } = getKeyframesAtPosition(position);
    return t <= 0.5 ? prev : next;
}
// ----------------------------------------------------------------
// CHANGE LISTENER
// ----------------------------------------------------------------
/** @param {(...args:any[])=>void} callback */
export function onChange(callback: any) {
    _onChangeCallbacks.push(callback);
    return () => {
        _onChangeCallbacks = _onChangeCallbacks.filter((cb: any) => cb !== callback);
    };
}
// ----------------------------------------------------------------
// SERIALIZATION - Para ECO1 round-trip
// ----------------------------------------------------------------
export function getSerializableState() {
    return serializeStoryboardState(_state.keyframes, _state.playback, _state.lanes);
}
/** @param {any} data @param {any} [options] @param {() => void} [doRefreshItems] */
export function restoreFromSerialized(data: any, options: any = {}, doRefreshItems?: any) {
    if (options.refreshItems !== false) {
        if (typeof doRefreshItems === 'function') doRefreshItems();
    }
    // null/undefined em import = limpar estado do storyboard.
    if (!data || typeof data !== 'object') {
        _state.keyframes = [];
        _state.playback.speed = 1.0;
        _state.playback.loop = false;
        _recomputeTotalDuration();
        _persist();
        _notifyChange();
        return;
    }
    const restored = normalizeStoryboardRestore(data, {
        validItemIds: new Set(_state.items.map((it: any) => it.id)),
        legacyIdMap: _clusterLegacyIdMap,
        currentSpeed: _state.playback.speed,
        currentLoop: _state.playback.loop,
    });
    _state.keyframes = [...restored.keyframes];
    _state.lanes = restored.lanes || [{ ...DEFAULT_LANE }];
    _state.playback.speed = restored.playback.speed;
    _state.playback.loop = restored.playback.loop;
    _state.playback.totalDuration = restored.playback.totalDuration;
    _persist();
    _notifyChange();
}
// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------
function _nextKeyframePosition() {
    const kfs = _state.keyframes;
    if (kfs.length === 0) return 0;
    // Posiciona apos o ultimo, distribuindo uniformemente
    const last = kfs[kfs.length - 1].position;
    return Math.min(1, last + 1 / (kfs.length + 1));
}
export function _sortKeyframes() {
    _state.keyframes.sort((a: any, b: any) => a.position - b.position);
}
export function _recomputeTotalDuration() {
    _state.playback.totalDuration = computeStoryboardTotalDuration(_state.keyframes);
}
export async function _persist() {
    if (isEphemeral()) return;
    _scheduleStoryboardPersist();
}

function _buildStoryboardPersistPayload() {
    return {
        keyframes: _state.keyframes,
        lanes: _state.lanes,
        speed: _state.playback.speed,
        loop: _state.playback.loop,
    };
}

function _getStoryboardPersistSignature(payload = _buildStoryboardPersistPayload()) {
    try {
        return JSON.stringify(payload);
    } catch {
        return `storyboard:${_state.keyframes.length}:${_state.lanes.length}`;
    }
}

function _getStoryboardPersistScheduler() {
    if (!_persistScheduler) {
        _persistScheduler = createDeferredIdlePersistence({
            debounceMs: STORYBOARD_PERSIST_DEBOUNCE_MS,
            bootDelayMs: STORYBOARD_PERSIST_AFTER_BOOT_DELAY_MS,
            idleTimeoutMs: STORYBOARD_PERSIST_IDLE_TIMEOUT_MS,
            flush: _flushStoryboardPersist,
            onError: (error) => {
                console.debug('[core/sequencer/state:persist-idle]', (error as any)?.message || error);
            },
        });
    }
    return _persistScheduler;
}

function _scheduleStoryboardPersist() {
    _getStoryboardPersistScheduler().schedule();
}

async function _flushStoryboardPersist() {
    _persistScheduler?.clear();
    const payload = _buildStoryboardPersistPayload();
    const signature = _getStoryboardPersistSignature(payload);
    if (signature === _lastPersistSignature) return true;
    const ok = await idbSet(STORAGE_KEY, payload);
    if (ok) _lastPersistSignature = signature;
    if (!ok) showToast('Storage full. Storyboard data may not persist.', 'warning');
    return ok;
}
export async function _restore() {
    try {
        const data = await idbGetWithLegacy(STORAGE_KEY);
        if (!data) return;
        if (Array.isArray(data.keyframes)) _state.keyframes = data.keyframes;
        if (Array.isArray(data.lanes) && data.lanes.length > 0) _state.lanes = data.lanes;
        if (VALID_STORYBOARD_SPEEDS.has(data.speed)) _state.playback.speed = data.speed;
        if (data.loop != null) _state.playback.loop = data.loop;
        _recomputeTotalDuration();
        _lastPersistSignature = _getStoryboardPersistSignature();
    } catch (e: any) {
        console.debug('[sequencer] applyStoryboard:', e?.message || e);
        /* corrupted — ignore */
    }
}
export function _notifyChange() {
    for (const cb of _onChangeCallbacks) {
        try {
            cb(_state);
        } catch (e: any) {
            console.debug('[sequencer] callback-error:', e?.message || e);
            /* ignore */
        }
    }
}

// Public aliases without underscore prefix (ecbyts-local/no-underscore-prefixed-imports)
export {
    _getRawState as getRawState,
    _setClusterLegacyIdMap as setClusterLegacyIdMap,
    _getClusterLegacyIdMap as getClusterLegacyIdMap,
    _persist as persist,
    _notifyChange as notifyChange,
    _restore as restore,
};
