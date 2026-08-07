// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   RIGHT-CLICK INTENTION HELPERS
   ================================================================

   Pure helpers used to distinguish:
   - static right-click (open context menu)
   - right-click drag (camera pan/orbit)
   - native browser context menu fallback (Ctrl/Cmd + right-click)

   This module has no DOM side-effects and is cheap-test friendly.
   ================================================================ */

export interface PointerSample {
    x?: number;
    y?: number;
}

export interface RightDragPanOptions {
    start?: PointerSample;
    current?: PointerSample;
    thresholdPx?: number;
}

export interface ContextMenuModifierEvent {
    ctrlKey?: boolean;
    metaKey?: boolean;
}

/**
 * Euclidean distance in screen pixels between two pointer samples.
 */
export function pointerDistancePx(start: PointerSample, current: PointerSample): number {
    const dx = Number(current?.x || 0) - Number(start?.x || 0);
    const dy = Number(current?.y || 0) - Number(start?.y || 0);
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Returns true when right-click movement exceeds the configured threshold.
 */
export function shouldStartRightDragPan(opts: RightDragPanOptions = {}): boolean {
    const thresholdPx = Math.max(1, Number(opts.thresholdPx ?? 5));
    const start = opts.start || { x: 0, y: 0 };
    const current = opts.current || { x: 0, y: 0 };
    return pointerDistancePx(start, current) >= thresholdPx;
}

/**
 * Browser-native menu fallback: Ctrl/Cmd + right-click.
 */
export function shouldAllowNativeContextMenu(eventLike: ContextMenuModifierEvent = {}): boolean {
    return Boolean(eventLike.ctrlKey || eventLike.metaKey);
}

/**
 * Normalize right-click interaction mode.
 */
export function normalizeRightClickBehavior(behavior: string): 'pan' | 'menu' {
    return behavior === 'menu' ? 'menu' : 'pan';
}
