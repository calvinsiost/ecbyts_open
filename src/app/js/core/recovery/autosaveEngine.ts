// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Autosave Engine - pure-logic state machine for autosave lanes.
 * Phase 1 of SPEC_ERROR_RECOVERY_JOURNEY (UX-41).
 *
 * Pura: zero DOM, zero IDB, zero side effects. Imutável: cada operação
 * retorna um novo state frozen. Lanes representam contextos independentes
 * de autosave (ex: por aba/projeto).
 */

const DEFAULT_INTERVAL_MS = 30000;

interface LaneState {
    laneId: string;
    lastSavedAt: number | null;
    lastSavedHash: string | null;
    dirty: boolean;
    savesCount: number;
}

interface AutosaveState {
    lanes: Map<string, LaneState>;
    currentLaneId: string | null;
    intervalMs: number;
    pendingSaves: Array<any>;
}

function freezeState(state: any): AutosaveState {
    // Map é mutável por natureza, mas freezamos o objeto wrapper.
    // Convenção: nunca mutar a Map externamente; sempre criar new Map.
    return Object.freeze({
        lanes: state.lanes,
        currentLaneId: state.currentLaneId,
        intervalMs: state.intervalMs,
        pendingSaves: Object.freeze(state.pendingSaves.slice()),
    });
}

function cloneLanes(lanes: any): Map<string, any> {
    const next = new Map();
    for (const [k, v] of lanes) {
        next.set(k, Object.freeze({ ...v }));
    }
    return next;
}

/**
 * Cria estado inicial.
 */
export function createAutosaveState(
    opts: { intervalMs?: number; currentLaneId?: string | null } = {},
): AutosaveState {
    const intervalMs = opts.intervalMs == null ? DEFAULT_INTERVAL_MS : opts.intervalMs;
    if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new Error('createAutosaveState: intervalMs must be a positive finite number');
    }
    const currentLaneId = opts.currentLaneId == null ? null : String(opts.currentLaneId);
    return freezeState({
        lanes: new Map(),
        currentLaneId,
        intervalMs,
        pendingSaves: [],
    });
}

export function registerLane(state: any, laneId: any): AutosaveState {
    if (!laneId || typeof laneId !== 'string') {
        throw new Error('registerLane: laneId must be a non-empty string');
    }
    if (state.lanes.has(laneId)) {
        throw new Error(`registerLane: lane '${laneId}' already registered`);
    }
    const lanes = cloneLanes(state.lanes);
    lanes.set(
        laneId,
        Object.freeze({
            laneId,
            lastSavedAt: null,
            lastSavedHash: null,
            dirty: false,
            savesCount: 0,
        }),
    );
    return freezeState({
        lanes,
        currentLaneId: state.currentLaneId,
        intervalMs: state.intervalMs,
        pendingSaves: state.pendingSaves,
    });
}

export function markDirty(state: any, laneId: any, contentHash: any, now: any): AutosaveState {
    if (!state.lanes.has(laneId)) {
        throw new Error(`markDirty: lane '${laneId}' not registered`);
    }
    if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new Error('markDirty: now must be a finite number');
    }
    const lanes = cloneLanes(state.lanes);
    const prev = lanes.get(laneId);
    lanes.set(
        laneId,
        Object.freeze({
            ...prev,
            dirty: true,
            // Armazena o hash candidato em lastSavedHash? Não - esse é o último salvo.
            // Hash atual fica implícito: dirty=true significa "há algo novo"; o hash
            // será comparado no recordSave. Guardamos em pendingHash informalmente
            // via convenção: usamos lastSavedHash apenas pós-save.
            _pendingHash: contentHash == null ? null : String(contentHash),
            _dirtyAt: now,
        }),
    );
    return freezeState({
        lanes,
        currentLaneId: state.currentLaneId,
        intervalMs: state.intervalMs,
        pendingSaves: state.pendingSaves,
    });
}

export function recordSave(state: any, laneId: any, contentHash: any, now: any): AutosaveState {
    if (!state.lanes.has(laneId)) {
        throw new Error(`recordSave: lane '${laneId}' not registered`);
    }
    if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new Error('recordSave: now must be a finite number');
    }
    const lanes = cloneLanes(state.lanes);
    const prev = lanes.get(laneId);
    lanes.set(
        laneId,
        Object.freeze({
            laneId: prev.laneId,
            lastSavedAt: now,
            lastSavedHash: contentHash == null ? null : String(contentHash),
            dirty: false,
            savesCount: prev.savesCount + 1,
        }),
    );
    return freezeState({
        lanes,
        currentLaneId: state.currentLaneId,
        intervalMs: state.intervalMs,
        pendingSaves: state.pendingSaves,
    });
}

export function shouldAutosave(state: any, laneId: any, now: any): boolean {
    const lane = state.lanes.get(laneId);
    if (!lane) return false;
    if (!lane.dirty) return false;
    if (typeof now !== 'number' || !Number.isFinite(now)) return false;
    if (lane.lastSavedAt == null) return true;
    return now - lane.lastSavedAt >= state.intervalMs;
}

export function getLanesNeedingSave(state: any, now: any): string[] {
    const out = [];
    for (const [laneId] of state.lanes) {
        if (shouldAutosave(state, laneId, now)) out.push(laneId);
    }
    return out;
}

export function getLaneStatus(state: any, laneId: any): Readonly<any> | null {
    const lane = state.lanes.get(laneId);
    if (!lane) return null;
    return Object.freeze({
        dirty: lane.dirty,
        lastSavedAt: lane.lastSavedAt,
        savesCount: lane.savesCount,
        msSinceLastSave: lane.lastSavedAt == null ? null : undefined,
    });
}

/**
 * Variante que aceita `now` para computar msSinceLastSave.
 */
export function getLaneStatusAt(state: any, laneId: any, now: any): Readonly<any> | null {
    const lane = state.lanes.get(laneId);
    if (!lane) return null;
    const msSinceLastSave = lane.lastSavedAt == null ? null : Math.max(0, now - lane.lastSavedAt);
    return Object.freeze({
        dirty: lane.dirty,
        lastSavedAt: lane.lastSavedAt,
        savesCount: lane.savesCount,
        msSinceLastSave,
    });
}

export function setIntervalMs(state: any, ms: any): AutosaveState {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) {
        throw new Error('setIntervalMs: ms must be a positive finite number');
    }
    return freezeState({
        lanes: state.lanes,
        currentLaneId: state.currentLaneId,
        intervalMs: ms,
        pendingSaves: state.pendingSaves,
    });
}

export function switchLane(state: any, laneId: any): AutosaveState {
    if (!state.lanes.has(laneId)) {
        throw new Error(`switchLane: lane '${laneId}' not registered`);
    }
    return freezeState({
        lanes: state.lanes,
        currentLaneId: laneId,
        intervalMs: state.intervalMs,
        pendingSaves: state.pendingSaves,
    });
}

export function summarizeAutosave(state: any, now: any): Readonly<any> {
    let dirtyCount = 0;
    let oldestDirtyAt = null;
    for (const [, lane] of state.lanes) {
        if (lane.dirty) {
            dirtyCount += 1;
            const ref = lane._dirtyAt != null ? lane._dirtyAt : lane.lastSavedAt;
            if (ref != null && (oldestDirtyAt == null || ref < oldestDirtyAt)) {
                oldestDirtyAt = ref;
            }
        }
    }
    const oldestPendingMs = oldestDirtyAt == null || typeof now !== 'number' ? null : Math.max(0, now - oldestDirtyAt);
    return Object.freeze({
        laneCount: state.lanes.size,
        dirtyCount,
        oldestPendingMs,
    });
}
