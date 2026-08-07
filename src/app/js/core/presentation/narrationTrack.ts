// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Narration Track - pure-logic captions/narration cues
 * UX-35 Phase 3 of SPEC_PRESENTATION_MODE_JOURNEY.
 *
 * Pista de narração com legendas sincronizadas (cues) para o modo apresentação.
 * Estrutura imutável: state e cues são frozen, todas as operações retornam novo state.
 *
 * Cue shape: { id, slideId, startMs, endMs, text, voice? }
 */

interface NarrationCue {
    id: string;
    slideId: string;
    startMs: number;
    endMs: number;
    text: string;
    voice?: string;
}

interface NarrationState {
    cues: ReadonlyArray<NarrationCue>;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validateCueTimeRange(startMs: number, endMs: number): string | null {
    if (!isNonNegativeFinite(startMs)) return 'cue.startMs must be non-negative number';
    if (!isNonNegativeFinite(endMs)) return 'cue.endMs must be non-negative number';
    if (startMs >= endMs) return 'cue.startMs must be < cue.endMs';
    return null;
}

/**
 * Validate a single cue object.
 * @returns error message or null
 */
function validateCueShape(cue: any): string | null {
    if (!cue || typeof cue !== 'object') return 'cue must be object';
    if (!isNonEmptyString(cue.id)) return 'cue.id must be non-empty string';
    if (!isNonEmptyString(cue.slideId)) return 'cue.slideId must be non-empty string';

    const timeError = validateCueTimeRange(cue.startMs, cue.endMs);
    if (timeError) return timeError;

    if (typeof cue.text !== 'string') return 'cue.text must be string';
    if (cue.voice !== undefined && typeof cue.voice !== 'string') return 'cue.voice must be string or undefined';
    return null;
}

/**
 * Freeze a cue object (shallow - primitives only).
 */
function freezeCue(cue: any): Readonly<NarrationCue> {
    const frozen: NarrationCue = {
        id: cue.id,
        slideId: cue.slideId,
        startMs: cue.startMs,
        endMs: cue.endMs,
        text: cue.text,
    };
    if (cue.voice !== undefined) frozen.voice = cue.voice;
    return Object.freeze(frozen);
}

/**
 * Create a new narration track state.
 * @returns frozen state { cues: frozen array }
 */
export function createNarrationTrack({ cues = [] }: { cues?: Array<any> } = {}): NarrationState {
    if (!Array.isArray(cues)) throw new Error('cues must be array');
    const seenIds = new Set();
    const frozenCues = cues.map((c) => {
        const err = validateCueShape(c);
        if (err) throw new Error(`invalid cue: ${err}`);
        if (seenIds.has(c.id)) throw new Error(`duplicate cue id: ${c.id}`);
        seenIds.add(c.id);
        return freezeCue(c);
    });
    return Object.freeze({ cues: Object.freeze(frozenCues) });
}

/**
 * Add a cue to the track (immutable).
 */
export function addCue(state: NarrationState, cue: any): NarrationState {
    const err = validateCueShape(cue);
    if (err) throw new Error(`invalid cue: ${err}`);
    if (state.cues.some((c) => c.id === cue.id)) throw new Error(`duplicate cue id: ${cue.id}`);
    const next = state.cues.concat([freezeCue(cue)]);
    return Object.freeze({ cues: Object.freeze(next) });
}

/**
 * Remove a cue by id (immutable). No-op if not found.
 */
export function removeCue(state: NarrationState, cueId: string): NarrationState {
    const next = state.cues.filter((c) => c.id !== cueId);
    return Object.freeze({ cues: Object.freeze(next) });
}

/**
 * Update a cue by id with partial changes (immutable).
 * Throws if cueId not found.
 */
export function updateCue(state: NarrationState, cueId: string, partial: Partial<NarrationCue>): NarrationState {
    if (!partial || typeof partial !== 'object') throw new Error('partial must be object');
    const idx = state.cues.findIndex((c) => c.id === cueId);
    if (idx === -1) throw new Error(`cue not found: ${cueId}`);
    const current = state.cues[idx] as NarrationCue;
    const merged = { ...current, ...partial, id: current.id };
    const err = validateCueShape(merged);
    if (err) throw new Error(`invalid cue update: ${err}`);
    const next = state.cues.slice();
    next[idx] = freezeCue(merged);
    return Object.freeze({ cues: Object.freeze(next) });
}

/**
 * Get the active cue at given timeMs (startMs ≤ t < endMs).
 * If multiple overlap, returns the one with smallest startMs.
 */
export function getCueAt(state: NarrationState, timeMs: number): NarrationCue | null {
    if (typeof timeMs !== 'number' || !Number.isFinite(timeMs)) return null;
    let best: NarrationCue | null = null;
    for (const c of state.cues) {
        if (timeMs >= c.startMs && timeMs < c.endMs) {
            if (best === null || c.startMs < best.startMs) best = c;
        }
    }
    return best;
}

/**
 * Get all cues that intersect [fromMs, toMs).
 * Intersection: cue.startMs < toMs AND cue.endMs > fromMs.
 */
export function getCuesInRange(state: NarrationState, fromMs: number, toMs: number): NarrationCue[] {
    if (typeof fromMs !== 'number' || typeof toMs !== 'number') return [];
    if (fromMs >= toMs) return [];
    return state.cues.filter((c) => c.startMs < toMs && c.endMs > fromMs);
}

/**
 * Validate the full narration state.
 */
export function validateNarration(state: NarrationState): {
    valid: boolean;
    errors: string[];
    warnings: string[];
} {
    const errors: string[] = [];
    const warnings: string[] = [];
    const seen = new Set();
    for (const c of state.cues) {
        const err = validateCueShape(c);
        if (err) errors.push(`cue ${c && c.id}: ${err}`);
        if (c && c.id) {
            if (seen.has(c.id)) errors.push(`duplicate cue id: ${c.id}`);
            seen.add(c.id);
        }
    }
    // Detect overlaps (warning).
    const sorted = state.cues.slice().sort((a, b) => a.startMs - b.startMs);
    for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i] as NarrationCue;
        const b = sorted[i + 1] as NarrationCue;
        if (a.endMs > b.startMs) {
            warnings.push(`overlap: ${a.id} and ${b.id}`);
        }
    }
    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Format milliseconds as SRT timestamp HH:MM:SS,mmm (comma, not dot).
 */
function formatSRTTimestamp(ms: number): string {
    const total = Math.max(0, Math.floor(ms));
    const millis = total % 1000;
    const totalSec = Math.floor(total / 1000);
    const sec = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const min = totalMin % 60;
    const hr = Math.floor(totalMin / 60);
    const pad = (n: number, w: number) => String(n).padStart(w, '0');
    return `${pad(hr, 2)}:${pad(min, 2)}:${pad(sec, 2)},${pad(millis, 3)}`;
}

/**
 * Format a cue as a single SRT entry (with trailing newline).
 * @param cue 1-based
 */
export function formatCueAsSRT(cue: any, index: number): string {
    const err = validateCueShape(cue);
    if (err) throw new Error(`invalid cue: ${err}`);
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 1) {
        throw new Error('index must be positive integer');
    }
    const start = formatSRTTimestamp(cue.startMs);
    const end = formatSRTTimestamp(cue.endMs);
    return `${index}\n${start} --> ${end}\n${cue.text}\n`;
}

/**
 * Export full track as SRT string (cues sorted by startMs).
 */
export function exportSRT(state: NarrationState): string {
    const sorted = state.cues.slice().sort((a, b) => a.startMs - b.startMs);
    return sorted.map((c, i) => formatCueAsSRT(c, i + 1)).join('\n');
}

/**
 * Summarize narration state.
 */
export function summarizeNarration(state: NarrationState): {
    cueCount: number;
    totalDurationMs: number;
    overlapCount: number;
} {
    const cueCount = state.cues.length;
    let totalDurationMs = 0;
    for (const c of state.cues) totalDurationMs += c.endMs - c.startMs;
    const sorted = state.cues.slice().sort((a, b) => a.startMs - b.startMs);
    let overlapCount = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
        const cur = sorted[i] as NarrationCue;
        const nxt = sorted[i + 1] as NarrationCue;
        if (cur.endMs > nxt.startMs) overlapCount++;
    }
    return { cueCount, totalDurationMs, overlapCount };
}
