// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// SPEC_EIS_RADAR_10AXES_PROGRESSIVE_UI - P1-23
// Toggle de modo de visualização do EIS Radar (Core-6 / Extended-10)

import { RADAR_VIEW_MODES } from './eisRadarConfig.js';

type RadarViewMode = 'core' | 'extended';

/** Chave localStorage para persistência do modo de visualização. */
const STORAGE_KEY = 'ecbyts-eis-radar-view-mode';

/**
 * Retorna o modo de visualização atual do radar.
 * Returns the current radar view mode.
 *
 * @returns {'core'|'extended'} Modo atual
 */
export function getRadarViewMode(): RadarViewMode {
    try {
        return localStorage.getItem(STORAGE_KEY) === RADAR_VIEW_MODES.EXTENDED
            ? (RADAR_VIEW_MODES.EXTENDED as 'extended')
            : (RADAR_VIEW_MODES.CORE as 'core');
    } catch (e) {
        console.debug('[eisRadarToggle] getMode:', (e as any)?.message || e);
        return RADAR_VIEW_MODES.CORE as 'core';
    }
}

/**
 * Define o modo de visualização do radar e persiste no localStorage.
 * Sets the radar view mode and persists it in localStorage.
 *
 * @param {'core'|'extended'} mode - Novo modo
 * @returns {void}
 */
export function setRadarViewMode(mode: RadarViewMode): void {
    if (!(Object.values(RADAR_VIEW_MODES) as string[]).includes(mode as string)) return;
    try {
        localStorage.setItem(STORAGE_KEY, mode);
    } catch (e) {
        console.debug('[eisRadarToggle] setMode:', (e as any)?.message || e);
        // quota exceeded - silently ignore
    }
}

/**
 * Alterna entre os modos Core e Extended.
 * Toggles between Core and Extended modes.
 *
 * @returns {'core'|'extended'} Novo modo após alternância
 */
export function toggleRadarViewMode(): RadarViewMode {
    const next: RadarViewMode =
        getRadarViewMode() === RADAR_VIEW_MODES.CORE ? RADAR_VIEW_MODES.EXTENDED : RADAR_VIEW_MODES.CORE;
    setRadarViewMode(next);
    return next;
}
