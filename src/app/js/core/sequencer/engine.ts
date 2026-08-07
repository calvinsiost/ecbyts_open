// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   SEQUENCER ENGINE — Playback motor for timeline animation
   Motor de playback que anima a camera entre keyframes usando
   requestAnimationFrame. Suporta play/pause/seek/speed.

   Interpola camera states entre keyframes com easing configuravel.
   Aplica campanhas e visibilidade por keyframe.

   REFATORACAO (pattern §4.1): le o estado de ./state.js (folha) em
   vez de ./manager.js — quebra a feedback-edge engine→manager. As
   funcoes de camera de utils/scene/controls.js sao carregadas via
   `await import()` dinamico (cache de modulo) — quebra
   engine→utils/scene/controls. Registra suas acoes publicas em
   state.js para que renderer/videoBot as acionem sem importar
   engine.js estaticamente (quebra renderer→engine / videoBot→engine).
   ================================================================ */
import {
    getKeyframes,
    getKeyframesAtPosition,
    getItemById,
    getPlayback,
    setPlaybackPosition,
    setPlaying,
    getTotalDuration,
    registerEngineActions,
} from './state.js';
import { advancePlaybackPosition } from './_enginePlaybackPure.js';
// ----------------------------------------------------------------
// LAZY CONTROLS MODULE — dynamic import (quebra edge → controls.js)
// ----------------------------------------------------------------
/** @type {Promise<any>|null} */
let _controlsPromise: any = null;
/** @type {any} */
let _controls: any = null;
/** @returns {Promise<any>} */
function _loadControls() {
    if (!_controlsPromise) {
        _controlsPromise = import('../../utils/scene/controls.js' as string).then((m) => {
            _controls = m;
            return m;
        });
    }
    return _controlsPromise;
}
// Pre-aquece o modulo de controls no load (sincrono dispara, resolve
// antes de qualquer playback iniciar — runtime byte-identico).
_loadControls().catch((e: any) => console.debug('[sequencer:engine:prewarm-controls:silent-catch]', e?.message || e));
// ----------------------------------------------------------------
// EASING FUNCTIONS
// ----------------------------------------------------------------
/** @type {Record<string, (t: number) => number>} */
const EASINGS = {
    linear: (t: any) => t,
    'ease-in': (t: any) => t * t * t,
    'ease-out': (t: any) => 1 - Math.pow(1 - t, 3),
    'ease-in-out': (t: any) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
// ----------------------------------------------------------------
// ENGINE STATE
// ----------------------------------------------------------------
/** @type {any} */
let _rafId: any = null;
let _lastTime = 0;
/** @type {Function[]} */
let _onTickCallbacks: any[] = [];
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Inicia o playback da timeline.
 */
export async function play() {
    const playback = getPlayback();
    if (playback.playing) return;
    if (getKeyframes().length === 0) return;
    await _loadControls();
    // Se no fim, reinicia
    if (playback.position >= 1.0) {
        setPlaybackPosition(0);
    }
    setPlaying(true);
    _lastTime = performance.now();
    _tick();
}
/**
 * Pausa o playback.
 */
export function pause() {
    setPlaying(false);
    if (_rafId) {
        cancelAnimationFrame(_rafId);
        _rafId = null;
    }
}
/**
 * Para o playback e volta para o inicio.
 *
 * IMPORTANTE: setPlaybackPosition usa notify=false para evitar que
 * _notifyChange seja disparado DUAS VEZES (uma via pause()→setPlaying,
 * outra aqui). Cada _notifyChange reescreve innerHTML do sequencer UI
 * via render(). Medido em 2026-04-15: stop gerava 3004 DOM mutations +
 * vazava +128MB em heap por causa do double-notify. Ver BLACKLIST-DEBT-001.
 */
export async function stop() {
    pause();
    setPlaybackPosition(0, false); // silent — pause() ja disparou _notifyChange
    await _applyStateAtPosition(0);
}
/**
 * Seek para posicao especifica (0-1).
 * @param {number} position - 0.0 a 1.0
 */
export async function seek(position: any) {
    setPlaybackPosition(position);
    await _applyStateAtPosition(position);
}
/**
 * Navega para um item especifico (anima camera).
 * @param {string} itemId - ID do StoryboardItem
 * @param {number} [durationMs=600] - Duracao da animacao
 * @returns {Promise<void>}
 */
export async function flyToItem(itemId: any, durationMs: any = 600) {
    const item = getItemById(itemId);
    if (!item || !item.cameraState) return Promise.resolve();
    const ctrl = await _loadControls();
    /** @type {any} */
    const r = ctrl.animateCameraState(item.cameraState, durationMs);
    return r;
}
/**
 * Navega para um keyframe especifico.
 * @param {string} keyframeId
 * @param {number} [durationMs=600]
 * @returns {Promise<void>}
 */
export async function flyToKeyframe(keyframeId: any, durationMs: any = 600) {
    const kf = getKeyframes().find((k: any) => k.id === keyframeId);
    if (!kf) return Promise.resolve();
    const item = getItemById(kf.itemId);
    const cameraState = kf.cameraOverride || (item ? item.cameraState : null);
    if (!cameraState) return Promise.resolve();
    setPlaybackPosition(kf.position);
    const ctrl = await _loadControls();
    /** @type {any} */
    const r = ctrl.animateCameraState(cameraState, durationMs);
    return r;
}
/**
 * Registra callback chamado a cada tick (para atualizar UI).
 * @param {Function} callback - Recebe { position, activeKeyframe, playing }
 * @returns {Function} unsubscribe
 */
export function onTick(callback: any) {
    _onTickCallbacks.push(callback);
    return () => {
        _onTickCallbacks = _onTickCallbacks.filter((cb: any) => cb !== callback);
    };
}
// ----------------------------------------------------------------
// INTERPOLATION
// ----------------------------------------------------------------
/**
 * Interpola entre dois camera states.
 * @param {Object} stateA - { camera: {x,y,z,zoom}, target: {x,y,z} }
 * @param {Object} stateB
 * @param {number} t - 0.0 (A) a 1.0 (B)
 * @param {string} [easing='ease-out']
 * @returns {Object} - Camera state interpolado
 */
export function interpolateCamera(stateA: any, stateB: any, t: any, easing: any = "ease-out") {
    const easeFn = (EASINGS as Record<string,any>)[easing] || EASINGS['ease-out'];
    const e = easeFn(Math.max(0, Math.min(1, t)));
    const a = stateA;
    const b = stateB;
    return {
        camera: {
            x: _lerp(a.camera.x, b.camera.x, e),
            y: _lerp(a.camera.y, b.camera.y, e),
            z: _lerp(a.camera.z, b.camera.z, e),
            zoom: _lerp(a.camera.zoom, b.camera.zoom, e),
        },
        target: {
            x: _lerp(a.target.x, b.target.x, e),
            y: _lerp(a.target.y, b.target.y, e),
            z: _lerp(a.target.z, b.target.z, e),
        },
    };
}
// ----------------------------------------------------------------
// INTERNAL - RAF LOOP
// ----------------------------------------------------------------
function _tick() {
    const playback = getPlayback();
    if (!playback.playing) return;
    const now = performance.now();
    const deltaMs = now - _lastTime;
    _lastTime = now;
    const totalDuration = getTotalDuration();
    if (totalDuration <= 0) {
        pause();
        return;
    }
    // Avanca posicao (math pura — ver _enginePlaybackPure.advancePlaybackPosition)
    const { nextPosition, ended } = advancePlaybackPosition(
        playback.position,
        deltaMs,
        playback.speed,
        totalDuration,
        playback.loop,
    );
    if (ended) {
        setPlaybackPosition(1.0, false);
        _applyStateAtPosition(1.0);
        pause(); // pause() triggers full render via setPlaying
        _notifyTick(1.0);
        return;
    }
    const newPosition = nextPosition;
    setPlaybackPosition(newPosition, false); // silent — tick handles UI
    _applyStateAtPosition(newPosition);
    _notifyTick(newPosition);
    _rafId = requestAnimationFrame(_tick);
}
/** @param {any} position */
function _applyStateAtPosition(position: any) {
    const { prev, next, t } = getKeyframesAtPosition(position);
    if (!prev) return;
    // _controls e populado no load (pre-aquecido) e garantidamente
    // resolvido apos play()/seek()/stop() (que dao await em _loadControls).
    const ctrl = _controls;
    if (!ctrl) return _loadControls().then(() => _applyStateAtPosition(position));
    const prevItem = getItemById(prev.itemId);
    const nextItem = next ? getItemById(next.itemId) : prevItem;
    const prevCamera = prev.cameraOverride || (prevItem ? prevItem.cameraState : null);
    const nextCamera = (next ? next.cameraOverride : null) || (nextItem ? nextItem.cameraState : null);
    if (!prevCamera) return;
    if (!nextCamera || prev === next) {
        // Single keyframe - set diretamente
        ctrl.setCameraState(prevCamera);
    } else {
        // Interpolar entre dois keyframes
        const easing = next ? next.easing : 'ease-out';
        const interpolated = interpolateCamera(prevCamera, nextCamera, t, easing);
        ctrl.setCameraState(interpolated);
    }
}
/** @param {any} position */
function _notifyTick(position: any) {
    const activeKf = getKeyframes().length > 0 ? getKeyframesAtPosition(position).prev : null;
    const info = {
        position,
        activeKeyframe: activeKf,
        playing: getPlayback().playing,
    };
    for (const cb of _onTickCallbacks) {
        try {
            cb(info);
        } catch (e: any) {
            console.debug('[sequencer/engine] tickCb:', e?.message || e);
            /* ignore */
        }
    }
}
// ----------------------------------------------------------------
// ENGINE ACTION REGISTRY — quebra renderer→engine / videoBot→engine
// (registro sincrono no load do modulo, antes de qualquer interacao)
// ----------------------------------------------------------------
registerEngineActions({ play, pause, stop, seek, flyToItem, flyToKeyframe, onTick });
// ----------------------------------------------------------------
// VISIBILITY HANDLER - Page hidden = auto-pause
// ----------------------------------------------------------------
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && getPlayback().playing) {
            pause();
        }
    });
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/** @param {any} a @param {any} b @param {any} t */
function _lerp(a: any, b: any, t: any) {
    return a + (b - a) * t;
}
