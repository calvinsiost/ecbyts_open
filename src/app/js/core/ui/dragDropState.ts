// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// UX-50 - Drag-Drop Interaction State (pure-logic, zero DOM)
// Estado imutavel para sessoes drag/drop e drop targets registrados.

const VALID_SOURCE_TYPES = new Set(['element', 'file', 'panel', 'list-item']);
const VALID_MODES = new Set(['move', 'copy', 'link']);

function freezeDeep(obj: any): any {
    return Object.freeze(obj);
}

function assertFiniteXY(p: any, label = 'position'): void {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        throw new Error(`${label} must have finite x/y`);
    }
}

function assertRect(r: any): void {
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.w) || !Number.isFinite(r.h)) {
        throw new Error('position must have finite x,y,w,h');
    }
}

/**
 * @returns frozen idle state
 */
export function createDragDropState(): object {
    return freezeDeep({
        session: null,
        dropTargets: new Map(),
        targetOrder: Object.freeze([]),
    });
}

export function registerDropTarget(state: any, id: any, { accepts, position }: any): any {
    if (typeof id !== 'string' || !id) throw new Error('id required');
    if (state.dropTargets.has(id)) throw new Error(`duplicate target ${id}`);
    if (!Array.isArray(accepts)) throw new Error('accepts must be array');
    assertRect(position);
    const next = new Map(state.dropTargets);
    next.set(
        id,
        Object.freeze({
            id,
            accepts: Object.freeze([...accepts]),
            position: Object.freeze({ ...position }),
        }),
    );
    return freezeDeep({
        ...state,
        dropTargets: next,
        targetOrder: Object.freeze([...state.targetOrder, id]),
    });
}

export function unregisterDropTarget(state: any, id: any): any {
    if (!state.dropTargets.has(id)) return state;
    const next = new Map(state.dropTargets);
    next.delete(id);
    return freezeDeep({
        ...state,
        dropTargets: next,
        targetOrder: Object.freeze(state.targetOrder.filter((t: any) => t !== id)),
    });
}

export function isPointInTarget(point: any, target: any): boolean {
    assertFiniteXY(point, 'point');
    if (!target || !target.position) return false;
    const { x, y, w, h } = target.position;
    return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
}

export function findTargetAt(state: any, point: any): any {
    assertFiniteXY(point, 'point');
    // last registered wins (z-order: top of stack)
    for (let i = state.targetOrder.length - 1; i >= 0; i--) {
        const id = state.targetOrder[i];
        const t = state.dropTargets.get(id);
        if (t && isPointInTarget(point, t)) return id;
    }
    return null;
}

function computeTargetInfo(state: any, position: any): any {
    const targetId = findTargetAt(state, position);
    if (!targetId) return { dropTargetId: null, validDrop: false };
    const t = state.dropTargets.get(targetId);
    return { dropTargetId: targetId, validDrop: t.accepts.includes(state.session.sourceType) };
}

export function startDrag(state: any, { id, sourceType, sourceId, sourceData, position, mode = 'move' }: any): any {
    if (state.session) throw new Error('drag session already active');
    if (typeof id !== 'string' || !id) throw new Error('id required');
    if (!VALID_SOURCE_TYPES.has(sourceType)) throw new Error(`invalid sourceType ${sourceType}`);
    if (!VALID_MODES.has(mode)) throw new Error(`invalid mode ${mode}`);
    assertFiniteXY(position);
    const baseSession = Object.freeze({
        id,
        sourceType,
        sourceId,
        sourceData,
        startedAt: Date.now(),
        position: Object.freeze({ ...position }),
        dropTargetId: null,
        validDrop: false,
        mode,
    });
    const tmp = { ...state, session: baseSession };
    const info = computeTargetInfo(tmp, position);
    return freezeDeep({
        ...state,
        session: Object.freeze({
            ...baseSession,
            dropTargetId: info.dropTargetId,
            validDrop: info.validDrop,
        }),
    });
}

export function updateDragPosition(state: any, position: any): any {
    if (!state.session) throw new Error('no active session');
    assertFiniteXY(position);
    const tmp = {
        ...state,
        session: { ...state.session, position },
    };
    const info = computeTargetInfo(tmp, position);
    return freezeDeep({
        ...state,
        session: Object.freeze({
            ...state.session,
            position: Object.freeze({ ...position }),
            dropTargetId: info.dropTargetId,
            validDrop: info.validDrop,
        }),
    });
}

export function endDrag(state: any, { dropped }: any): any {
    if (!state.session) throw new Error('no active session');
    const s = state.session;
    const accepted = !!dropped && s.validDrop && !!s.dropTargetId;
    const result = Object.freeze({
        accepted,
        sourceId: s.sourceId,
        dropTargetId: s.dropTargetId,
        mode: s.mode,
    });
    return {
        state: freezeDeep({ ...state, session: null }),
        result,
    };
}

export function cancelDrag(state: any): any {
    if (!state.session) return state;
    return freezeDeep({ ...state, session: null });
}

export function isDragging(state: any): boolean {
    return state.session !== null;
}

export function getValidTargetsForSource(state: any, sourceType: any): any[] {
    const out = [];
    for (const id of state.targetOrder) {
        const t = state.dropTargets.get(id);
        if (t && t.accepts.includes(sourceType)) out.push(id);
    }
    return out;
}

export function summarizeDragDrop(state: any): any {
    return {
        dragging: state.session !== null,
        sourceType: state.session ? state.session.sourceType : null,
        validDrop: state.session ? state.session.validDrop : false,
        targetCount: state.dropTargets.size,
    };
}
