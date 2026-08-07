// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-52 - Modal Stack Manager (pure-logic, zero DOM).
 *
 * Gerencia pilha de modais com alocacao automatica de z-index, suporte
 * a escape handling, prevent close (non-dismissable) e cascata de
 * fechamento de modais filhos via parentModalId.
 *
 * Estado e modais sao frozen objects - toda mutacao retorna novo state.
 */

interface ModalEntry {
    id: string;
    type: string;
    title: string;
    dismissable: boolean;
    blocking: boolean;
    openedAt: number;
    parentModalId: string | null;
    zIndex: number;
    ariaLabelledby: string | null;
}

interface ModalStackState {
    stack: readonly ModalEntry[];
    baseZIndex: number;
    zIndexStep: number;
}

const VALID_TYPES = new Set(['dialog', 'sheet', 'fullscreen', 'popover']);

/**
 * Cria stack vazia.
 */
export function createModalStack(opts: { baseZIndex?: number; zIndexStep?: number } = {}): ModalStackState {
    const baseZIndex = Number.isFinite(opts.baseZIndex) ? (opts.baseZIndex as number) : 9000;
    const zIndexStep = Number.isFinite(opts.zIndexStep) ? (opts.zIndexStep as number) : 10;
    return Object.freeze({
        stack: Object.freeze([]),
        baseZIndex,
        zIndexStep,
    });
}

function freezeModal(m: ModalEntry) {
    return Object.freeze({ ...m });
}

function reframe(state: ModalStackState, stack: ModalEntry[]): ModalStackState {
    return Object.freeze({
        stack: Object.freeze(stack.map(freezeModal)),
        baseZIndex: state.baseZIndex,
        zIndexStep: state.zIndexStep,
    });
}

/**
 * Empilha modal novo.
 * @throws se id duplicado, type invalido, parentModalId inexistente.
 */
export function openModal(state: ModalStackState, modal: Partial<ModalEntry> & { id: string; type: string }): ModalStackState {
    if (!modal || typeof modal !== 'object') {
        throw new Error('openModal: modal must be an object');
    }
    const { id, type, title, dismissable, blocking, ariaLabelledby, parentModalId } = modal;
    if (!id || typeof id !== 'string') {
        throw new Error('openModal: id is required');
    }
    if (!VALID_TYPES.has(type)) {
        throw new Error(`openModal: invalid type "${type}"`);
    }
    if (state.stack.some((m) => m.id === id)) {
        throw new Error(`openModal: duplicate id "${id}"`);
    }
    if (parentModalId != null) {
        if (!state.stack.some((m) => m.id === parentModalId)) {
            throw new Error(`openModal: parentModalId "${parentModalId}" not in stack`);
        }
    }
    const depth = state.stack.length;
    const zIndex = state.baseZIndex + state.zIndexStep * depth;
    const next: ModalEntry = {
        id,
        type,
        title: title || '',
        dismissable: dismissable !== false,
        blocking: blocking === true,
        openedAt: Number.isFinite(modal.openedAt) ? (modal.openedAt as number) : Date.now(),
        parentModalId: parentModalId || null,
        zIndex,
        ariaLabelledby: ariaLabelledby || null,
    };
    return reframe(state, [...state.stack, next]);
}

/**
 * Remove modal por id + cascata de filhos (parentModalId === modalId, recursivo).
 * @throws se id inexistente.
 */
export function closeModal(state: ModalStackState, modalId: string): ModalStackState {
    if (!state.stack.some((m) => m.id === modalId)) {
        throw new Error(`closeModal: id "${modalId}" not in stack`);
    }
    // BFS para coletar todos descendentes
    const toRemove = new Set([modalId]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const m of state.stack) {
            if (!toRemove.has(m.id) && m.parentModalId && toRemove.has(m.parentModalId)) {
                toRemove.add(m.id);
                changed = true;
            }
        }
    }
    const remaining = state.stack.filter((m) => !toRemove.has(m.id));
    // Reatribui z-index conforme nova profundidade
    const reZ = remaining.map((m, i) => ({ ...m, zIndex: state.baseZIndex + state.zIndexStep * i }));
    return reframe(state, reZ);
}

/**
 * Fecha topo se dismissable.
 * @throws se vazio ou topo nao-dismissable.
 */
export function closeTop(state: ModalStackState): ModalStackState {
    if (state.stack.length === 0) {
        throw new Error('closeTop: stack is empty');
    }
    const top = state.stack[state.stack.length - 1] as ModalEntry;
    if (!top.dismissable) {
        throw new Error(`closeTop: top modal "${top.id}" is not dismissable`);
    }
    return closeModal(state, top.id);
}

/**
 * Fecha tudo, incluindo non-dismissable.
 */
export function closeAll(state: ModalStackState): ModalStackState {
    return reframe(state, []);
}

/**
 * Escape: fecha topo dismissable; senao no-op.
 */
export function handleEscape(state: ModalStackState): ModalStackState {
    if (state.stack.length === 0) return state;
    const top = state.stack[state.stack.length - 1];
    if (!top || !top.dismissable) return state;
    return closeModal(state, top.id);
}

export function getTopModal(state: ModalStackState): ModalEntry | null {
    if (state.stack.length === 0) return null;
    return state.stack[state.stack.length - 1] || null;
}

export function getZIndexFor(state: ModalStackState, modalId: string): number | null {
    const m = state.stack.find((x) => x.id === modalId);
    return m ? m.zIndex : null;
}

export function isBlocking(state: ModalStackState): boolean {
    return state.stack.some((m) => m.blocking === true);
}

export function getStackDepth(state: ModalStackState): number {
    return state.stack.length;
}

export function summarizeModalStack(state: ModalStackState) {
    const types: Record<string, number> = {};
    for (const m of state.stack) {
        types[m.type] = (types[m.type] || 0) + 1;
    }
    const top = getTopModal(state);
    return {
        depth: state.stack.length,
        blocking: isBlocking(state),
        dismissableTop: top ? top.dismissable === true : false,
        types,
    };
}
