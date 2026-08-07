// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pure helpers for the HomeGrid Constellation host.
 * Extracted per SPLIT-HOMEGRID-001 S5.
 */

/**
 * @param {{ innerHeight?: number, clientHeight?: number, savedHeight?: number | string | null }} [opts]
 */
export function computeDockedConstellationHeightPx({ innerHeight = 0, clientHeight = 0, savedHeight = null } = {}) {
    const viewportHeight = Math.max(Number(innerHeight) || 0, Number(clientHeight) || 0);
    const minHeight = Math.max(84, Math.round(viewportHeight * 0.12));
    const maxHeight = Math.max(minHeight, Math.round(viewportHeight * 0.32));
    let preferred = Math.round(viewportHeight * 0.18);
    const parsedSavedHeight = Number.parseInt(String(savedHeight ?? ''), 10);
    if (Number.isFinite(parsedSavedHeight)) {
        preferred = parsedSavedHeight;
    }
    return Math.max(minHeight, Math.min(maxHeight, preferred));
}

/**
 * @param {{ parentId?: string, previousTab?: string }} [opts]
 */
export function buildRedockTelemetryDetail({ parentId = '', previousTab = 'graph' } = {}) {
    return {
        tabId: 'model',
        parentId: parentId || '',
        restoredTab: previousTab || 'graph',
    };
}

/**
 * @param {{ hosted?: boolean, elapsedMs?: number | null, canvasWidth?: number, canvasHeight?: number, forceRebuild?: boolean }} [opts]
 */
export function buildFirstGraphPaintDetail({
    hosted = false,
    elapsedMs = null,
    canvasWidth = 0,
    canvasHeight = 0,
    forceRebuild = false,
} = {}) {
    return {
        forceRebuild: forceRebuild === true,
        hosted: hosted === true,
        elapsedFromActionsOpenMs: Number.isFinite(elapsedMs) ? Math.round(Number(elapsedMs)) : null,
        canvasWidth: Number.isFinite(canvasWidth) ? Math.round(Number(canvasWidth)) : 0,
        canvasHeight: Number.isFinite(canvasHeight) ? Math.round(Number(canvasHeight)) : 0,
    };
}
