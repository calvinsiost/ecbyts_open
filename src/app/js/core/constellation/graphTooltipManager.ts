// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Constellation Graph Tooltip Manager — Phase 1.66
 * Pure tooltip state: templates, anchor resolution, visibility queue.
 * Zero browser/DOM/Three.js/setTimeout deps.
 */

export type TooltipType = 'node' | 'edge' | 'cluster' | 'custom';
export type TooltipAnchor = 'top' | 'bottom' | 'left' | 'right' | 'auto';
export type ResolvedAnchor = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipContent {
    readonly title?: string;
    readonly body?: string;
    readonly fields?: ReadonlyArray<{ readonly label: string; readonly value: unknown }>;
    readonly [k: string]: unknown;
}

export interface TooltipPosition {
    readonly x: number;
    readonly y: number;
}

export interface TooltipOptions {
    readonly anchor?: TooltipAnchor;
    readonly offsetX?: number;
    readonly offsetY?: number;
}

export interface Tooltip {
    readonly targetId: string;
    readonly type: TooltipType;
    readonly content: TooltipContent;
    readonly anchor: TooltipAnchor;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly visible: boolean;
    readonly position: TooltipPosition;
}

export interface TooltipManager {
    readonly tooltips: Readonly<Record<string, Tooltip>>;
    readonly activeId: string | null;
}

export interface ViewportSize {
    readonly width: number;
    readonly height: number;
}

export interface TooltipManagerSummary {
    readonly total: number;
    readonly visible: number;
    readonly activeId: string | null;
}

export const TOOLTIP_MANAGER_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.66',
    deliveredAt: '2026-05-02',
} as const);

export const TOOLTIP_TYPES = Object.freeze(['node', 'edge', 'cluster', 'custom'] as const);

export const TOOLTIP_ANCHORS = Object.freeze(['top', 'bottom', 'left', 'right', 'auto'] as const);

/** Cria tooltip frozen. */
export function createTooltip(
    targetId: string,
    type: TooltipType,
    content: TooltipContent,
    options: TooltipOptions = {},
): Tooltip {
    if (typeof targetId !== 'string' || !targetId.trim()) throw new TypeError('targetId string required');
    if (!(TOOLTIP_TYPES as ReadonlyArray<string>).includes(type)) {
        throw new TypeError(`tooltip type '${type}' not recognized`);
    }
    if (!content || typeof content !== 'object') throw new TypeError('content object required');
    const anchor: TooltipAnchor = (TOOLTIP_ANCHORS as ReadonlyArray<string>).includes(options.anchor as string)
        ? (options.anchor as TooltipAnchor)
        : 'auto';
    return Object.freeze({
        targetId,
        type,
        content: Object.freeze({ ...content }),
        anchor,
        offsetX: typeof options.offsetX === 'number' ? options.offsetX : 8,
        offsetY: typeof options.offsetY === 'number' ? options.offsetY : 8,
        visible: false,
        position: Object.freeze({ x: 0, y: 0 }),
    });
}

/** Cria gerenciador de tooltips frozen. */
export function createTooltipManager(): TooltipManager {
    return Object.freeze({ tooltips: Object.freeze({}), activeId: null });
}

/** Registra tooltip no gerenciador. */
export function registerTooltip(manager: TooltipManager | null | undefined, tooltip: Tooltip | null | undefined): TooltipManager | null | undefined {
    if (!manager || !tooltip) return manager;
    return Object.freeze({
        ...manager,
        tooltips: Object.freeze({ ...manager.tooltips, [tooltip.targetId]: tooltip }),
    });
}

/** Remove tooltip do gerenciador. */
export function unregisterTooltip(manager: TooltipManager | null | undefined, targetId: string): TooltipManager | null | undefined {
    if (!manager || typeof targetId !== 'string') return manager;
    const next: Record<string, Tooltip> = { ...manager.tooltips };
    delete next[targetId];
    const activeId = manager.activeId === targetId ? null : manager.activeId;
    return Object.freeze({ ...manager, tooltips: Object.freeze(next), activeId });
}

/** Mostra tooltip para alvo em posição de tela. */
export function showTooltip(
    manager: TooltipManager | null | undefined,
    targetId: string,
    screenPos: { x?: number; y?: number } | null | undefined,
): TooltipManager | null | undefined {
    if (!manager) return manager;
    const tooltip = manager.tooltips[targetId];
    if (!tooltip) return manager;
    const pos: TooltipPosition =
        screenPos && typeof screenPos.x === 'number' && typeof screenPos.y === 'number'
            ? Object.freeze({ x: screenPos.x + tooltip.offsetX, y: screenPos.y + tooltip.offsetY })
            : tooltip.position;
    const updated: Tooltip = Object.freeze({ ...tooltip, visible: true, position: pos });
    return Object.freeze({
        ...manager,
        tooltips: Object.freeze({ ...manager.tooltips, [targetId]: updated }),
        activeId: targetId,
    });
}

/** Esconde tooltip ativo. */
export function hideTooltip(manager: TooltipManager | null | undefined, targetId?: string): TooltipManager | null | undefined {
    if (!manager) return manager;
    const id = targetId || manager.activeId;
    if (!id || !manager.tooltips[id]) return manager;
    const target = manager.tooltips[id];
    const updated: Tooltip = Object.freeze({ ...target, visible: false });
    return Object.freeze({
        ...manager,
        tooltips: Object.freeze({ ...manager.tooltips, [id]: updated }),
        activeId: manager.activeId === id ? null : manager.activeId,
    });
}

/** Esconde todos os tooltips. */
export function hideAllTooltips(manager: TooltipManager | null | undefined): TooltipManager | null | undefined {
    if (!manager) return manager;
    const tooltips: Record<string, Tooltip> = {};
    for (const [k, v] of Object.entries(manager.tooltips)) {
        tooltips[k] = Object.freeze({ ...v, visible: false });
    }
    return Object.freeze({ ...manager, tooltips: Object.freeze(tooltips), activeId: null });
}

/** Atualiza conteúdo de tooltip existente. */
export function updateTooltipContent(
    manager: TooltipManager | null | undefined,
    targetId: string,
    content: TooltipContent | null | undefined,
): TooltipManager | null | undefined {
    if (!manager || !content) return manager;
    const tooltip = manager.tooltips[targetId];
    if (!tooltip) return manager;
    const updated: Tooltip = Object.freeze({ ...tooltip, content: Object.freeze({ ...content }) });
    return Object.freeze({
        ...manager,
        tooltips: Object.freeze({ ...manager.tooltips, [targetId]: updated }),
    });
}

/** Obtém tooltip ativo. */
export function getActiveTooltip(manager: TooltipManager | null | undefined): Tooltip | null {
    if (!manager || !manager.activeId) return null;
    return manager.tooltips[manager.activeId] || null;
}

/** Resolve posição de anchor para tooltip relativo a viewportSize. */
export function resolveAnchor(tooltip: Tooltip | null | undefined, viewportSize: ViewportSize | null | undefined): ResolvedAnchor {
    if (!tooltip) return 'top';
    if (tooltip.anchor !== 'auto') return tooltip.anchor;
    if (!viewportSize) return 'top';
    const { x, y } = tooltip.position;
    const cx = viewportSize.width / 2;
    const cy = viewportSize.height / 2;
    if (y > cy) return 'top';
    if (x > cx) return 'left';
    return 'bottom';
}

/** Sumariza gerenciador de tooltips. */
export function summarizeTooltipManager(manager: TooltipManager | null | undefined): TooltipManagerSummary {
    if (!manager) return Object.freeze({ total: 0, visible: 0, activeId: null });
    const tooltips = Object.values(manager.tooltips);
    return Object.freeze({
        total: tooltips.length,
        visible: tooltips.filter((t) => t.visible).length,
        activeId: manager.activeId,
    });
}

export const graphTooltipManagerMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.66',
    deliveredAt: '2026-05-02',
    exports: [
        'TOOLTIP_MANAGER_META',
        'TOOLTIP_TYPES',
        'TOOLTIP_ANCHORS',
        'createTooltip',
        'createTooltipManager',
        'registerTooltip',
        'unregisterTooltip',
        'showTooltip',
        'hideTooltip',
        'hideAllTooltips',
        'updateTooltipContent',
        'getActiveTooltip',
        'resolveAnchor',
        'summarizeTooltipManager',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const);
