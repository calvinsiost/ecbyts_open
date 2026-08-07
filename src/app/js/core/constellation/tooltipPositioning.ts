// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Tooltip Positioning - Phase 1.14 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S14
 *
 * Phase 1.14 (2026-05-01) - pure-logic helpers para posicionamento
 * de tooltips em visualizações de constelação. Calcula posição final
 * dado anchor, dimensões do tooltip e viewport, com flip automático
 * quando há colisão.
 *
 * Estratégia:
 *   - Placement: top / bottom / left / right + diagonais
 *   - Auto-flip: tenta placement primário, fallback para oposto se colidir
 *   - Offset configurável (gap entre anchor e tooltip)
 *   - Clamp: nunca extrapola viewport bounds
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface XY {
    x: number;
    y: number;
}

interface Viewport {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

interface TooltipSize {
    width: number;
    height: number;
}

/** Placements canônicos. */
export const PLACEMENTS = Object.freeze([
    'top',
    'bottom',
    'left',
    'right',
    'top-start',
    'top-end',
    'bottom-start',
    'bottom-end',
]);

/** Placement opposites para flip. */
const OPPOSITES = Object.freeze({
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
    'top-start': 'bottom-start',
    'top-end': 'bottom-end',
    'bottom-start': 'top-start',
    'bottom-end': 'top-end',
});

/** Identidade do módulo. */
export const TOOLTIP_POSITIONING_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.14',
    deliveredAt: '2026-05-01',
    placements: PLACEMENTS,
});

/**
 * Verifica se placement é canônico.
 */
export function isValidPlacement(p: any): boolean {
    return typeof p === 'string' && (PLACEMENTS as readonly string[]).includes(p);
}

/**
 * Computa posição (x, y) absoluta do tooltip dado:
 *   - anchor: ponto de referência (centro da bola/nó)
 *   - tooltipSize: largura/altura do tooltip
 *   - placement: top/bottom/left/right (ou variants -start/-end)
 *   - offset: distância em pixels do anchor
 *
 * NOTA: retorna o canto top-left do tooltip.
 *
 * @param {{x: number, y: number}} anchor
 * @param {{width: number, height: number}} tooltipSize
 * @param {string} anchor
 * @param {number} [offset=8]
 * @returns {{x: number, y: number}}
 */
export function computePlacement(
    anchor: XY,
    tooltipSize: TooltipSize,
    placement: string = 'top',
    offset: number = 8,
): Readonly<XY> {
    if (!anchor || !tooltipSize) {
        return Object.freeze({ x: 0, y: 0 });
    }
    const ax = Number.isFinite(anchor.x) ? anchor.x : 0;
    const ay = Number.isFinite(anchor.y) ? anchor.y : 0;
    const w = Number.isFinite(tooltipSize.width) ? tooltipSize.width : 0;
    const h = Number.isFinite(tooltipSize.height) ? tooltipSize.height : 0;
    const off = Number.isFinite(offset) ? offset : 8;

    let x: number;
    let y: number;

    switch (placement) {
        case 'top':
            x = ax - w / 2;
            y = ay - h - off;
            break;
        case 'bottom':
            x = ax - w / 2;
            y = ay + off;
            break;
        case 'left':
            x = ax - w - off;
            y = ay - h / 2;
            break;
        case 'right':
            x = ax + off;
            y = ay - h / 2;
            break;
        case 'top-start':
            x = ax;
            y = ay - h - off;
            break;
        case 'top-end':
            x = ax - w;
            y = ay - h - off;
            break;
        case 'bottom-start':
            x = ax;
            y = ay + off;
            break;
        case 'bottom-end':
            x = ax - w;
            y = ay + off;
            break;
        default:
            x = ax - w / 2;
            y = ay - h - off;
    }
    return Object.freeze({ x, y });
}

/**
 * Verifica se rectangle (x,y,w,h) colide com viewport bounds.
 *
 * @param {{x: number, y: number}} pos - top-left
 * @param {{width: number, height: number}} size
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} viewport
 * @returns {boolean}
 */
export function isOutOfViewport(pos: XY, size: TooltipSize, viewport: Viewport): boolean {
    if (!pos || !size || !viewport) return false;
    const x = Number.isFinite(pos.x) ? pos.x : 0;
    const y = Number.isFinite(pos.y) ? pos.y : 0;
    const w = Number.isFinite(size.width) ? size.width : 0;
    const h = Number.isFinite(size.height) ? size.height : 0;
    const minX = Number.isFinite(viewport.minX) ? viewport.minX : 0;
    const minY = Number.isFinite(viewport.minY) ? viewport.minY : 0;
    const maxX = Number.isFinite(viewport.maxX) ? viewport.maxX : Infinity;
    const maxY = Number.isFinite(viewport.maxY) ? viewport.maxY : Infinity;

    if (x < minX) return true;
    if (y < minY) return true;
    if (x + w > maxX) return true;
    if (y + h > maxY) return true;
    return false;
}

/**
 * Clampa posição ao viewport (nunca extrapola).
 *
 * @param {{x: number, y: number}} pos
 * @param {{width: number, height: number}} size
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} viewport
 * @returns {{x: number, y: number}}
 */
export function clampToViewport(pos: XY, size: TooltipSize, viewport: Viewport): Readonly<XY> {
    if (!pos) return Object.freeze({ x: 0, y: 0 });
    if (!size || !viewport) return Object.freeze({ x: pos.x || 0, y: pos.y || 0 });
    const w = Number.isFinite(size.width) ? size.width : 0;
    const h = Number.isFinite(size.height) ? size.height : 0;
    const minX = Number.isFinite(viewport.minX) ? viewport.minX : 0;
    const minY = Number.isFinite(viewport.minY) ? viewport.minY : 0;
    const maxX = Number.isFinite(viewport.maxX) ? viewport.maxX : Infinity;
    const maxY = Number.isFinite(viewport.maxY) ? viewport.maxY : Infinity;

    let x = Number.isFinite(pos.x) ? pos.x : 0;
    let y = Number.isFinite(pos.y) ? pos.y : 0;

    x = Math.max(minX, Math.min(maxX - w, x));
    y = Math.max(minY, Math.min(maxY - h, y));

    return Object.freeze({ x, y });
}

/**
 * Resolve placement com auto-flip se colidir.
 *
 * Order:
 *   1. tenta placement primário
 *   2. se colide, tenta opposite
 *   3. se ainda colide, faz clamp
 *
 * @param {{x: number, y: number}} anchor
 * @param {{width: number, height: number}} tooltipSize
 * @param {Object} options
 * @param {string} [options.placement='top']
 * @param {number} [options.offset=8]
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} [options.viewport]
 * @param {boolean} [options.autoFlip=true]
 * @returns {{x: number, y: number, placement: string, flipped: boolean}}
 */
export function resolveTooltipPosition(
    anchor: XY,
    tooltipSize: TooltipSize,
    options: {
        placement?: string;
        offset?: number;
        viewport?: Viewport;
        autoFlip?: boolean;
    } = {},
): Readonly<{ x: number; y: number; placement: string; flipped: boolean }> {
    const placement: string = isValidPlacement(options.placement) ? (options.placement as string) : 'top';
    const offset = Number.isFinite(options.offset) ? (options.offset as number) : 8;
    const viewport = options.viewport || null;
    const autoFlip = options.autoFlip !== false;

    let pos = computePlacement(anchor, tooltipSize, placement, offset);
    let actualPlacement = placement;
    let flipped = false;

    if (autoFlip && viewport && isOutOfViewport(pos, tooltipSize, viewport)) {
        const opposite = (OPPOSITES as Record<string, string>)[placement];
        if (opposite) {
            const flippedPos = computePlacement(anchor, tooltipSize, opposite, offset);
            if (!isOutOfViewport(flippedPos, tooltipSize, viewport)) {
                pos = flippedPos;
                actualPlacement = opposite;
                flipped = true;
            }
        }
    }

    if (viewport) {
        pos = clampToViewport(pos, tooltipSize, viewport);
    }

    return Object.freeze({
        x: pos.x,
        y: pos.y,
        placement: actualPlacement,
        flipped,
    });
}

/**
 * Computa anchor point relativo a um nó (de visualização constelação).
 *
 * @param {{x: number, y: number, radius: number}} node
 * @param {string} [side='top'] - top/bottom/center
 * @returns {{x: number, y: number}}
 */
export function nodeAnchor(node: { x: number; y: number; radius: number }, side: string = 'top'): Readonly<XY> {
    if (!node || typeof node !== 'object') return Object.freeze({ x: 0, y: 0 });
    const x = Number.isFinite(node.x) ? node.x : 0;
    const y = Number.isFinite(node.y) ? node.y : 0;
    const r = Number.isFinite(node.radius) ? node.radius : 0;
    if (side === 'top') return Object.freeze({ x, y: y - r });
    if (side === 'bottom') return Object.freeze({ x, y: y + r });
    if (side === 'left') return Object.freeze({ x: x - r, y });
    if (side === 'right') return Object.freeze({ x: x + r, y });
    return Object.freeze({ x, y }); // center
}

/**
 * Module identity export.
 */
export const tooltipPositioningMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.14',
    deliveredAt: '2026-05-01',
    placements: PLACEMENTS,
    exports: [
        'PLACEMENTS',
        'TOOLTIP_POSITIONING_META',
        'isValidPlacement',
        'computePlacement',
        'isOutOfViewport',
        'clampToViewport',
        'resolveTooltipPosition',
        'nodeAnchor',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
