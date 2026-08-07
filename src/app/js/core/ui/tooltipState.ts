// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-63 - Tooltip/Popover state pure-logic
 * Pure logic, zero DOM. State machine + auto-positioning + collision avoidance.
 *
 * State machine: idle -> queued -> visible -> dismissing -> idle
 *
 * Imutabilidade total: todas as funções retornam novos objetos congelados.
 */

const VALID_PLACEMENTS = ['top', 'right', 'bottom', 'left', 'auto'];
const AUTO_ORDER = ['top', 'bottom', 'right', 'left'];

function freeze(obj: any) {
    return Object.freeze(obj);
}

function validateViewport(size: any) {
    if (!size || typeof size !== 'object') {
        throw new Error('viewportSize required {w,h}');
    }
    if (!(size.w > 0) || !(size.h > 0)) {
        throw new Error('viewportSize w/h must be > 0');
    }
}

function validateDescriptor(descriptor: any) {
    if (!descriptor || typeof descriptor !== 'object') {
        throw new Error('descriptor required');
    }
    if (!descriptor.id) throw new Error('descriptor.id required');
    if (!descriptor.anchor || typeof descriptor.anchor !== 'object') {
        throw new Error('descriptor.anchor required {x,y,w,h}');
    }
    const placement = descriptor.placement || 'auto';
    if (!VALID_PLACEMENTS.includes(placement)) {
        throw new Error(`invalid placement: ${placement}`);
    }
    const offset = descriptor.offset == null ? 8 : descriptor.offset;
    if (offset < 0) throw new Error('offset must be >= 0');
    const delayMs = descriptor.delayMs == null ? 0 : descriptor.delayMs;
    if (delayMs < 0) throw new Error('delayMs must be >= 0');
}

function normalizeDescriptor(descriptor: any) {
    return freeze({
        id: descriptor.id,
        anchor: freeze({ ...descriptor.anchor }),
        content: descriptor.content == null ? '' : descriptor.content,
        placement: descriptor.placement || 'auto',
        offset: descriptor.offset == null ? 8 : descriptor.offset,
        delayMs: descriptor.delayMs == null ? 0 : descriptor.delayMs,
        dismissOnClickOutside: descriptor.dismissOnClickOutside !== false,
    });
}

/**
 * Cria estado idle congelado.
 */
export function createTooltipState({ viewportSize }: any) {
    validateViewport(viewportSize);
    return freeze({
        state: 'idle',
        active: null,
        queueId: null,
        queuedAt: null,
        viewportSize: freeze({ ...viewportSize }),
    });
}

/**
 * Solicita exibição. Se já visível/queued, substitui (cancela atual).
 */
export function requestTooltip(state: any, descriptor: any, now: any) {
    validateDescriptor(descriptor);
    if (typeof now !== 'number') throw new Error('now (timestamp) required');
    const normalized = normalizeDescriptor(descriptor);
    return freeze({
        state: 'queued',
        active: normalized,
        queueId: normalized.id,
        queuedAt: now,
        viewportSize: state.viewportSize,
    });
}

/**
 * Avança queue → visible se delay decorrido.
 */
export function tickQueued(state: any, now: any) {
    if (state.state !== 'queued') return state;
    if (typeof now !== 'number') throw new Error('now (timestamp) required');
    const elapsed = now - state.queuedAt;
    if (elapsed >= state.active.delayMs) {
        return freeze({
            state: 'visible',
            active: state.active,
            queueId: null,
            queuedAt: state.queuedAt,
            viewportSize: state.viewportSize,
        });
    }
    return state;
}

/**
 * Marca dismissing (transição com animação opcional).
 */
export function dismissTooltip(state: any) {
    if (state.state === 'idle') return state;
    return freeze({
        state: 'dismissing',
        active: state.active,
        queueId: null,
        queuedAt: state.queuedAt,
        viewportSize: state.viewportSize,
    });
}

/**
 * Conclui dismiss → idle.
 */
export function completeDismiss(state: any) {
    return freeze({
        state: 'idle',
        active: null,
        queueId: null,
        queuedAt: null,
        viewportSize: state.viewportSize,
    });
}

/**
 * Cancela queue antes do show. No-op se não está queued.
 */
export function cancelQueue(state: any) {
    if (state.state !== 'queued') return state;
    return freeze({
        state: 'idle',
        active: null,
        queueId: null,
        queuedAt: null,
        viewportSize: state.viewportSize,
    });
}

/**
 * Atualiza viewport size (resize event).
 */
export function setViewportSize(state: any, size: any) {
    validateViewport(size);
    return freeze({
        ...state,
        viewportSize: freeze({ ...size }),
    });
}

export function getActiveTooltip(state: any) {
    return state.state === 'visible' || state.state === 'queued' || state.state === 'dismissing' ? state.active : null;
}

export function isVisible(state: any) {
    return state.state === 'visible';
}

export function summarizeTooltip(state: any, now: any) {
    const age = state.queuedAt != null && typeof now === 'number' ? now - state.queuedAt : null;
    return freeze({
        state: state.state,
        hasActive: state.active != null,
        viewportSize: state.viewportSize,
        queuedAtAge: age,
    });
}

// ---------------------------------------------------------------------------
// computePosition - collision avoidance
// ---------------------------------------------------------------------------

function tryPlacement(anchor: any, placement: any, offset: any, contentSize: any) {
    let x;
    let y;
    switch (placement) {
        case 'top':
            x = anchor.x + anchor.w / 2 - contentSize.w / 2;
            y = anchor.y - contentSize.h - offset;
            break;
        case 'bottom':
            x = anchor.x + anchor.w / 2 - contentSize.w / 2;
            y = anchor.y + anchor.h + offset;
            break;
        case 'left':
            x = anchor.x - contentSize.w - offset;
            y = anchor.y + anchor.h / 2 - contentSize.h / 2;
            break;
        case 'right':
            x = anchor.x + anchor.w + offset;
            y = anchor.y + anchor.h / 2 - contentSize.h / 2;
            break;
        default:
            throw new Error(`unknown placement: ${placement}`);
    }
    return { x, y };
}

function fitsInViewport(pos: any, contentSize: any, viewportSize: any) {
    return (
        pos.x >= 0 && pos.y >= 0 && pos.x + contentSize.w <= viewportSize.w && pos.y + contentSize.h <= viewportSize.h
    );
}

function clampToViewport(pos: any, contentSize: any, viewportSize: any) {
    const x = Math.max(0, Math.min(pos.x, viewportSize.w - contentSize.w));
    const y = Math.max(0, Math.min(pos.y, viewportSize.h - contentSize.h));
    return { x, y };
}

/**
 * Calcula {x, y, finalPlacement}. Para 'auto', tenta top→bottom→right→left.
 * Para placement explícito, tenta primeiro requerido, depois opposite, depois perpendiculares.
 * Fallback: clamp dentro do viewport mantendo finalPlacement original.
 */
export function computePosition(
    anchor: any,
    viewportSize: any,
    placement = 'auto',
    offset = 8,
    contentSize = { w: 0, h: 0 },
) {
    if (!anchor || typeof anchor !== 'object') throw new Error('anchor required');
    validateViewport(viewportSize);
    if (!VALID_PLACEMENTS.includes(placement)) {
        throw new Error(`invalid placement: ${placement}`);
    }
    if (offset < 0) throw new Error('offset must be >= 0');
    if (!contentSize || contentSize.w < 0 || contentSize.h < 0) {
        throw new Error('contentSize must be {w>=0,h>=0}');
    }

    const order = placement === 'auto' ? AUTO_ORDER : [placement, ...AUTO_ORDER.filter((p) => p !== placement)];

    for (const candidate of order) {
        const pos = tryPlacement(anchor, candidate, offset, contentSize);
        if (fitsInViewport(pos, contentSize, viewportSize)) {
            return freeze({ x: pos.x, y: pos.y, finalPlacement: candidate });
        }
    }

    // Fallback: usa primeira tentativa e clamp
    const fallbackPlacement = order[0];
    const raw = tryPlacement(anchor, fallbackPlacement, offset, contentSize);
    const clamped = clampToViewport(raw, contentSize, viewportSize);
    return freeze({ x: clamped.x, y: clamped.y, finalPlacement: fallbackPlacement });
}
