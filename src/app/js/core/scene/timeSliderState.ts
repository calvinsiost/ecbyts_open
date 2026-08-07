// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Time Slider State — pure-logic temporal navigation
 * UX-30, Phase 3 of SPEC_3D_MODEL_EXPLORATION_JOURNEY
 *
 * Estado imutável (frozen) para controle de timeline 3D.
 * Sem DOM, sem three.js — apenas lógica pura.
 */

const VALID_SPEEDS = [1, 2, 4, 8] as const;
const VALID_LOOP_MODES = ['once', 'loop', 'pingpong'] as const;

export type PlaybackSpeed = (typeof VALID_SPEEDS)[number];
export type LoopMode = (typeof VALID_LOOP_MODES)[number];

export interface TimelineBounds {
    readonly start: string;
    readonly end: string;
}

export interface TimeSliderState {
    readonly timeline: TimelineBounds;
    readonly currentTime: string;
    readonly playbackSpeed: number;
    readonly isPlaying: boolean;
    readonly loopMode: LoopMode;
    readonly _direction: 1 | -1;
}

export interface TimelineSummary {
    readonly start: string;
    readonly end: string;
    readonly currentTime: string;
    readonly durationMs: number;
    readonly elapsedMs: number;
    readonly remainingMs: number;
    readonly progress: number;
    readonly isPlaying: boolean;
    readonly playbackSpeed: number;
    readonly loopMode: LoopMode;
}

export interface TimedElement {
    readonly timestamp?: string | number | null;
    readonly [key: string]: unknown;
}

function parseISO(t: string | number): number {
    const ms = typeof t === 'number' ? t : Date.parse(t);
    if (!Number.isFinite(ms)) throw new Error(`Invalid time: ${String(t)}`);
    return ms;
}

function toISO(ms: number): string {
    return new Date(ms).toISOString();
}

function clampMs(ms: number, startMs: number, endMs: number): number {
    if (ms < startMs) return startMs;
    if (ms > endMs) return endMs;
    return ms;
}

/**
 * Create initial frozen state.
 */
export function createTimeSliderState(
    options: { start?: string | number; end?: string | number } = {},
): TimeSliderState {
    const { start, end } = options;
    if (start === undefined || end === undefined) {
        throw new Error('Invalid timeline: start and end required');
    }
    const startMs = parseISO(start);
    const endMs = parseISO(end);
    if (startMs >= endMs) {
        throw new Error('Invalid timeline: start must be before end');
    }
    return Object.freeze({
        timeline: Object.freeze({ start: toISO(startMs), end: toISO(endMs) }),
        currentTime: toISO(startMs),
        playbackSpeed: 1,
        isPlaying: false,
        loopMode: 'once' as LoopMode,
        _direction: 1 as 1 | -1,
    });
}

function bounds(state: TimeSliderState): { startMs: number; endMs: number } {
    return {
        startMs: parseISO(state.timeline.start),
        endMs: parseISO(state.timeline.end),
    };
}

export function setCurrentTime(state: TimeSliderState, t: string | number): TimeSliderState {
    const { startMs, endMs } = bounds(state);
    const ms = clampMs(parseISO(t), startMs, endMs);
    return Object.freeze({ ...state, currentTime: toISO(ms) });
}

export function play(state: TimeSliderState): TimeSliderState {
    return Object.freeze({ ...state, isPlaying: true });
}

export function pause(state: TimeSliderState): TimeSliderState {
    return Object.freeze({ ...state, isPlaying: false });
}

export function setSpeed(state: TimeSliderState, speed: number): TimeSliderState {
    if (!(VALID_SPEEDS as readonly number[]).includes(speed)) {
        throw new Error(`Invalid speed: ${speed}. Must be one of ${VALID_SPEEDS.join(', ')}`);
    }
    return Object.freeze({ ...state, playbackSpeed: speed });
}

export function setLoopMode(state: TimeSliderState, mode: LoopMode): TimeSliderState {
    if (!(VALID_LOOP_MODES as readonly string[]).includes(mode)) {
        throw new Error(`Invalid loop mode: ${mode}. Must be one of ${VALID_LOOP_MODES.join(', ')}`);
    }
    return Object.freeze({ ...state, loopMode: mode, _direction: 1 as 1 | -1 });
}

/**
 * Advance time by deltaMs respecting speed/loop/bounds.
 */
export function advanceTime(state: TimeSliderState, deltaMs: number): TimeSliderState {
    const { startMs, endMs } = bounds(state);
    const span = endMs - startMs;
    const dir: 1 | -1 = state._direction || 1;
    const effectiveDelta = deltaMs * state.playbackSpeed * dir;
    const currentMs = parseISO(state.currentTime);
    let nextMs = currentMs + effectiveDelta;
    let nextDirection: 1 | -1 = dir;
    let nextPlaying = state.isPlaying;

    if (state.loopMode === 'once') {
        if (nextMs >= endMs) {
            nextMs = endMs;
            nextPlaying = false;
        } else if (nextMs <= startMs) {
            nextMs = startMs;
            nextPlaying = false;
        }
    } else if (state.loopMode === 'loop') {
        if (span > 0) {
            let rel = (nextMs - startMs) % span;
            if (rel < 0) rel += span;
            nextMs = startMs + rel;
        }
    } else if (state.loopMode === 'pingpong') {
        if (nextMs > endMs) {
            const overflow = nextMs - endMs;
            nextMs = endMs - overflow;
            nextDirection = (-dir) as 1 | -1;
            if (nextMs < startMs) nextMs = startMs;
        } else if (nextMs < startMs) {
            const underflow = startMs - nextMs;
            nextMs = startMs + underflow;
            nextDirection = (-dir) as 1 | -1;
            if (nextMs > endMs) nextMs = endMs;
        }
    }

    return Object.freeze({
        ...state,
        currentTime: toISO(nextMs),
        isPlaying: nextPlaying,
        _direction: nextDirection,
    });
}

/**
 * Progress 0..1 along timeline.
 */
export function getProgress(state: TimeSliderState): number {
    const { startMs, endMs } = bounds(state);
    const currentMs = parseISO(state.currentTime);
    const span = endMs - startMs;
    if (span <= 0) return 0;
    const p = (currentMs - startMs) / span;
    if (p < 0) return 0;
    if (p > 1) return 1;
    return p;
}

/**
 * Filter elements whose timestamp <= currentTime.
 */
export function filterByCurrentTime<T extends TimedElement>(elements: T[], state: TimeSliderState): T[] {
    if (!Array.isArray(elements)) return [];
    const currentMs = parseISO(state.currentTime);
    return elements.filter((el) => {
        if (!el || el.timestamp === undefined || el.timestamp === null) return true;
        let tMs: number;
        try {
            tMs = parseISO(el.timestamp);
        } catch {
            return true;
        }
        return tMs <= currentMs;
    });
}

/**
 * Summarize timeline state — debugging / UI display.
 */
export function summarizeTimeline(state: TimeSliderState): TimelineSummary {
    const { startMs, endMs } = bounds(state);
    const currentMs = parseISO(state.currentTime);
    return Object.freeze({
        start: state.timeline.start,
        end: state.timeline.end,
        currentTime: state.currentTime,
        durationMs: endMs - startMs,
        elapsedMs: currentMs - startMs,
        remainingMs: endMs - currentMs,
        progress: getProgress(state),
        isPlaying: state.isPlaying,
        playbackSpeed: state.playbackSpeed,
        loopMode: state.loopMode,
    });
}
