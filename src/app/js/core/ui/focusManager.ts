// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// UX-49 Focus Manager - pure-logic focus stack and tab navigation.

export type FocusContextType = 'modal' | 'panel' | 'popup' | 'menu';
export type FocusDirection = 'next' | 'prev' | 'first' | 'last';

export interface FocusContext {
    id: string;
    type: FocusContextType;
    focusableIds: ReadonlyArray<string>;
    currentIndex: number;
    trapped: boolean;
    restoreId: string | null;
}

export interface FocusState {
    stack: ReadonlyArray<Readonly<FocusContext>>;
    rootFocusableIds: ReadonlyArray<string>;
    lastFocusedId: string | null;
}

export interface FocusSummary {
    stackDepth: number;
    hasTrap: boolean;
    currentId: string | null;
    rootCount: number;
}

interface FocusContextCandidate {
    id?: unknown;
    type?: unknown;
    focusableIds?: unknown;
    trapped?: unknown;
}

interface MutableFocusContext {
    id: string;
    type: FocusContextType;
    focusableIds: string[];
    currentIndex: number;
    trapped: boolean;
    restoreId: string | null;
}

interface MutableFocusState {
    stack: Array<Readonly<FocusContext> | MutableFocusContext>;
    rootFocusableIds: string[];
    lastFocusedId: string | null;
}

const VALID_TYPES = new Set<FocusContextType>(['modal', 'panel', 'popup', 'menu']);
const VALID_DIRECTIONS = new Set<FocusDirection>(['next', 'prev', 'first', 'last']);

function isFocusContextType(value: unknown): value is FocusContextType {
    return typeof value === 'string' && VALID_TYPES.has(value as FocusContextType);
}

function isFocusDirection(value: unknown): value is FocusDirection {
    return typeof value === 'string' && VALID_DIRECTIONS.has(value as FocusDirection);
}

function freezeContext(ctx: Readonly<FocusContext> | MutableFocusContext): Readonly<FocusContext> {
    return Object.freeze({
        id: ctx.id,
        type: ctx.type,
        focusableIds: Object.freeze([...ctx.focusableIds]),
        currentIndex: ctx.currentIndex,
        trapped: ctx.trapped,
        restoreId: ctx.restoreId ?? null,
    });
}

function freezeState(state: MutableFocusState): Readonly<FocusState> {
    return Object.freeze({
        stack: Object.freeze(state.stack.map(freezeContext)),
        rootFocusableIds: Object.freeze([...state.rootFocusableIds]),
        lastFocusedId: state.lastFocusedId,
    });
}

export function createFocusState(rootFocusableIds: unknown = []): Readonly<FocusState> {
    if (!Array.isArray(rootFocusableIds)) {
        throw new TypeError('rootFocusableIds must be an array');
    }
    return freezeState({
        stack: [],
        rootFocusableIds: [...rootFocusableIds] as string[],
        lastFocusedId: null,
    });
}

export function pushContext(state: Readonly<FocusState>, context: unknown): Readonly<FocusState> {
    if (!context || typeof context !== 'object') {
        throw new TypeError('context must be an object');
    }
    const candidate = context as FocusContextCandidate;
    if (typeof candidate.id !== 'string' || !candidate.id) {
        throw new TypeError('context.id must be a non-empty string');
    }
    if (!isFocusContextType(candidate.type)) {
        throw new TypeError(`context.type must be one of ${[...VALID_TYPES].join('|')}`);
    }
    if (!Array.isArray(candidate.focusableIds)) {
        throw new TypeError('context.focusableIds must be an array');
    }
    if (state.stack.some((entry) => entry.id === candidate.id)) {
        throw new Error(`focus context "${candidate.id}" already in stack`);
    }
    const focusableIds = [...candidate.focusableIds] as string[];
    const newContext: MutableFocusContext = {
        id: candidate.id,
        type: candidate.type,
        focusableIds,
        currentIndex: focusableIds.length > 0 ? 0 : -1,
        trapped: Boolean(candidate.trapped),
        restoreId: state.lastFocusedId,
    };
    return freezeState({
        stack: [...state.stack, newContext],
        rootFocusableIds: [...state.rootFocusableIds],
        lastFocusedId: state.lastFocusedId,
    });
}

export function popContext(
    state: Readonly<FocusState>,
    contextId: string,
): { state: Readonly<FocusState>; restoreToId: string | null } {
    if (state.stack.length === 0) {
        return { state, restoreToId: null };
    }

    let index = -1;
    for (let i = state.stack.length - 1; i >= 0; i--) {
        const candidate = state.stack[i];
        if (candidate && candidate.id === contextId) {
            index = i;
            break;
        }
    }
    if (index === -1) {
        return { state, restoreToId: null };
    }

    const removed = state.stack[index];
    if (!removed) {
        return { state, restoreToId: null };
    }
    const newStack = state.stack.slice(0, index).concat(state.stack.slice(index + 1));
    const restoreToId = removed.restoreId ?? null;
    const newState = freezeState({
        stack: [...newStack],
        rootFocusableIds: [...state.rootFocusableIds],
        lastFocusedId: restoreToId,
    });
    return { state: newState, restoreToId };
}

export function getActiveContext(state: Readonly<FocusState>): Readonly<FocusContext> | null {
    if (state.stack.length === 0) return null;
    return state.stack[state.stack.length - 1] ?? null;
}

export function getFocusableIds(state: Readonly<FocusState>): ReadonlyArray<string> {
    const top = getActiveContext(state);
    return top ? top.focusableIds : state.rootFocusableIds;
}

function setIndexInActive(state: Readonly<FocusState>, newIndex: number): Readonly<FocusState> {
    if (state.stack.length === 0) {
        const ids = state.rootFocusableIds;
        const id = newIndex >= 0 && newIndex < ids.length ? (ids[newIndex] ?? null) : null;
        return freezeState({
            stack: [...state.stack],
            rootFocusableIds: [...state.rootFocusableIds],
            lastFocusedId: id,
        });
    }

    const top = state.stack[state.stack.length - 1];
    if (!top) return state;
    const newTop: MutableFocusContext = {
        ...top,
        focusableIds: [...top.focusableIds],
        currentIndex: newIndex,
    };
    const newStack = state.stack.slice(0, -1).concat([newTop]);
    const id = newIndex >= 0 && newIndex < top.focusableIds.length ? (top.focusableIds[newIndex] ?? null) : null;
    return freezeState({
        stack: newStack,
        rootFocusableIds: [...state.rootFocusableIds],
        lastFocusedId: id,
    });
}

function getCurrentIndex(state: Readonly<FocusState>): number {
    const top = getActiveContext(state);
    if (top) return top.currentIndex;
    const ids = state.rootFocusableIds;
    if (state.lastFocusedId == null) return ids.length > 0 ? 0 : -1;
    const index = ids.indexOf(state.lastFocusedId);
    return index === -1 ? (ids.length > 0 ? 0 : -1) : index;
}

function isTrapped(state: Readonly<FocusState>): boolean {
    const top = getActiveContext(state);
    return top ? top.trapped : false;
}

export function moveFocus(state: Readonly<FocusState>, direction: unknown): Readonly<FocusState> {
    if (!isFocusDirection(direction)) {
        throw new TypeError(`direction must be one of ${[...VALID_DIRECTIONS].join('|')}`);
    }
    const ids = getFocusableIds(state);
    if (ids.length === 0) return state;
    const trapped = isTrapped(state);
    const current = getCurrentIndex(state);
    const length = ids.length;

    let next: number;
    if (direction === 'first') {
        next = 0;
    } else if (direction === 'last') {
        next = length - 1;
    } else if (direction === 'next') {
        next = current >= length - 1 ? (trapped ? 0 : length - 1) : current + 1;
    } else {
        next = current <= 0 ? (trapped ? length - 1 : 0) : current - 1;
    }
    return setIndexInActive(state, next);
}

export function setFocus(state: Readonly<FocusState>, id: string): Readonly<FocusState> {
    const ids = getFocusableIds(state);
    const index = ids.indexOf(id);
    if (index === -1) {
        throw new Error(`id "${id}" is not in active focusable list`);
    }
    return setIndexInActive(state, index);
}

export function getCurrentFocusedId(state: Readonly<FocusState>): string | null {
    const top = getActiveContext(state);
    if (top) {
        if (top.currentIndex < 0 || top.currentIndex >= top.focusableIds.length) return null;
        return top.focusableIds[top.currentIndex] ?? null;
    }
    return state.lastFocusedId;
}

export function updateFocusableIds(
    state: Readonly<FocusState>,
    contextId: string,
    newIds: unknown,
): Readonly<FocusState> {
    if (!Array.isArray(newIds)) {
        throw new TypeError('newIds must be an array');
    }
    const normalizedNewIds = [...newIds] as string[];
    if (contextId === 'root') {
        const current = state.lastFocusedId;
        const stillValid = current != null && normalizedNewIds.includes(current);
        return freezeState({
            stack: [...state.stack],
            rootFocusableIds: normalizedNewIds,
            lastFocusedId: stillValid ? current : null,
        });
    }

    const index = state.stack.findIndex((entry) => entry.id === contextId);
    if (index === -1) {
        throw new Error(`focus context "${contextId}" not found`);
    }
    const oldContext = state.stack[index];
    if (!oldContext) {
        throw new Error(`focus context "${contextId}" not found`);
    }
    const oldId =
        oldContext.currentIndex >= 0 && oldContext.currentIndex < oldContext.focusableIds.length
            ? (oldContext.focusableIds[oldContext.currentIndex] ?? null)
            : null;
    const reIndex = oldId != null ? normalizedNewIds.indexOf(oldId) : -1;
    const newCurrent = reIndex !== -1 ? reIndex : normalizedNewIds.length > 0 ? 0 : -1;
    const updated: MutableFocusContext = {
        ...oldContext,
        focusableIds: normalizedNewIds,
        currentIndex: newCurrent,
    };
    const newStack = state.stack
        .slice(0, index)
        .concat([updated])
        .concat(state.stack.slice(index + 1));
    return freezeState({
        stack: newStack,
        rootFocusableIds: [...state.rootFocusableIds],
        lastFocusedId: state.lastFocusedId,
    });
}

export function clearStack(state: Readonly<FocusState>): Readonly<FocusState> {
    if (state.stack.length === 0) return state;
    const root = state.stack[0];
    const restoreToId = root?.restoreId ?? null;
    return freezeState({
        stack: [],
        rootFocusableIds: [...state.rootFocusableIds],
        lastFocusedId: restoreToId,
    });
}

export function summarizeFocus(state: Readonly<FocusState>): FocusSummary {
    return {
        stackDepth: state.stack.length,
        hasTrap: state.stack.some((entry) => entry.trapped),
        currentId: getCurrentFocusedId(state),
        rootCount: state.rootFocusableIds.length,
    };
}
