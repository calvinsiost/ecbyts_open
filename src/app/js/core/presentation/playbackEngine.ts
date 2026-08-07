// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Playback Engine - pure-logic timeline player for Presentation Mode storyboards.
// UX-34 Phase 2 of SPEC_PRESENTATION_MODE_JOURNEY.
// Zero DOM, zero three.js. Immutable: every operation returns a new frozen state.
// Avança currentTimeMs respeitando playbackSpeed e loopMode; calcula slide ativo
// e fase de transição entre slides via janela configurável.

import { getSlideAt, getTotalDuration } from './storyboardState.js';

const VALID_SPEEDS = [0.5, 1, 2, 4];
const VALID_LOOP_MODES = ['none', 'loop'];

function freezeState(s: any): any {
    return Object.freeze({
        storyboard: s.storyboard,
        currentTimeMs: s.currentTimeMs,
        isPlaying: s.isPlaying,
        playbackSpeed: s.playbackSpeed,
        loopMode: s.loopMode,
    });
}

import { clamp } from '../../utils/helpers/math.js';

/**
 * Cria estado de playback frozen. Storyboard deve ter ≥1 slide.
 * @param storyboard - frozen storyboard de storyboardState.createStoryboard
 */
export function createPlaybackState(
    storyboard: Record<string, any>,
    opts: {
        currentTimeMs?: number;
        isPlaying?: boolean;
        playbackSpeed?: number;
        loopMode?: 'none' | 'loop';
    } = {},
): any {
    if (!storyboard || !Array.isArray(storyboard.slides)) {
        throw new TypeError('storyboard must be a frozen storyboard state');
    }
    if (storyboard.slides.length === 0) {
        throw new Error('storyboard must have at least 1 slide');
    }
    const speed = opts.playbackSpeed ?? 1;
    if (!VALID_SPEEDS.includes(speed)) {
        throw new RangeError(`invalid playbackSpeed: ${speed}`);
    }
    const loopMode = opts.loopMode ?? 'none';
    if (!VALID_LOOP_MODES.includes(loopMode)) {
        throw new RangeError(`invalid loopMode: ${loopMode}`);
    }
    const total = getTotalDuration(storyboard as any);
    const t = clamp(Number(opts.currentTimeMs) || 0, 0, total);
    return freezeState({
        storyboard,
        currentTimeMs: t,
        isPlaying: Boolean(opts.isPlaying),
        playbackSpeed: speed,
        loopMode,
    });
}

export function play(state: any): any {
    if (state.isPlaying) return state;
    return freezeState({ ...state, isPlaying: true });
}

export function pause(state: any): any {
    if (!state.isPlaying) return state;
    return freezeState({ ...state, isPlaying: false });
}

export function stop(state: any): any {
    return freezeState({ ...state, isPlaying: false, currentTimeMs: 0 });
}

export function setSpeed(state: any, speed: any): any {
    if (!VALID_SPEEDS.includes(speed)) {
        throw new RangeError(`invalid playbackSpeed: ${speed}`);
    }
    if (state.playbackSpeed === speed) return state;
    return freezeState({ ...state, playbackSpeed: speed });
}

export function setLoopMode(state: any, mode: any): any {
    if (!VALID_LOOP_MODES.includes(mode)) {
        throw new RangeError(`invalid loopMode: ${mode}`);
    }
    if (state.loopMode === mode) return state;
    return freezeState({ ...state, loopMode: mode });
}

export function seekTo(state: any, timeMs: any): any {
    if (typeof timeMs !== 'number' || Number.isNaN(timeMs)) {
        throw new TypeError('timeMs must be a finite number');
    }
    const total = getTotalDuration(state.storyboard);
    const t = clamp(timeMs, 0, total);
    if (t === state.currentTimeMs) return state;
    return freezeState({ ...state, currentTimeMs: t });
}

export function seekToSlide(state: any, slideId: any): any {
    let acc = 0;
    for (const s of state.storyboard.slides) {
        if (s.id === slideId) {
            return freezeState({ ...state, currentTimeMs: acc });
        }
        acc += Number(s.durationMs) || 0;
    }
    throw new Error(`slide not found: ${slideId}`);
}

/**
 * Avança currentTimeMs por deltaMs * playbackSpeed.
 * Em loopMode 'none' clamp no fim e seta isPlaying=false.
 * Em loopMode 'loop' wrap modulo total.
 * Se !isPlaying retorna o mesmo state.
 */
export function tick(state: any, deltaMs: any): any {
    if (typeof deltaMs !== 'number' || !Number.isFinite(deltaMs) || deltaMs < 0) {
        throw new TypeError('deltaMs must be a finite non-negative number');
    }
    if (!state.isPlaying || deltaMs === 0) return state;
    const total = getTotalDuration(state.storyboard);
    if (total <= 0) return state;
    const advanced = state.currentTimeMs + deltaMs * state.playbackSpeed;
    if (advanced >= total) {
        if (state.loopMode === 'loop') {
            const wrapped = ((advanced % total) + total) % total;
            return freezeState({ ...state, currentTimeMs: wrapped });
        }
        return freezeState({ ...state, currentTimeMs: total, isPlaying: false });
    }
    return freezeState({ ...state, currentTimeMs: advanced });
}

export function getCurrentSlide(state: any): any {
    return getSlideAt(state.storyboard, state.currentTimeMs);
}

/**
 * Progresso 0..1 dentro do slide ativo. Retorna 0 se vazio.
 */
export function getSlideProgress(state: any): number {
    const slides = state.storyboard.slides;
    if (slides.length === 0) return 0;
    let acc = 0;
    for (const s of slides) {
        const d = Number(s.durationMs) || 0;
        if (state.currentTimeMs < acc + d) {
            if (d <= 0) return 0;
            return clamp((state.currentTimeMs - acc) / d, 0, 1);
        }
        acc += d;
    }
    return 1;
}

/**
 * Retorna fase de transição se currentTimeMs estiver dentro de transitionWindowMs
 * antes do fim de um slide (e existir slide seguinte).
 */
export function getTransitionPhase(
    state: any,
    transitionWindowMs = 500,
): null | { fromSlide: any; toSlide: any; t: number } {
    if (typeof transitionWindowMs !== 'number' || transitionWindowMs <= 0) return null;
    const slides = state.storyboard.slides;
    if (slides.length < 2) return null;
    let acc = 0;
    for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        const d = Number(s.durationMs) || 0;
        const slideEnd = acc + d;
        if (state.currentTimeMs >= acc && state.currentTimeMs < slideEnd) {
            const next = slides[i + 1];
            if (!next) return null;
            const distFromEnd = slideEnd - state.currentTimeMs;
            if (distFromEnd <= transitionWindowMs) {
                const t = clamp(1 - distFromEnd / transitionWindowMs, 0, 1);
                return Object.freeze({ fromSlide: s, toSlide: next, t });
            }
            return null;
        }
        acc += d;
    }
    return null;
}

export const __VALID_SPEEDS__ = VALID_SPEEDS;
export const __VALID_LOOP_MODES__ = VALID_LOOP_MODES;
