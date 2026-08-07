// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// SPEC_EIS_RADAR_10AXES_PROGRESSIVE_UI - P1-23
// Configuração dos eixos do EIS Radar: Core-6 e Extended-10

/**
 * Os 6 eixos core sempre visíveis no radar.
 * Core axes always visible in the radar chart.
 */
export const CORE_AXES = ['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm'] as const;
export type CoreAxis = (typeof CORE_AXES)[number];

/**
 * Os 5 eixos estendidos, visíveis apenas no modo Extended.
 * Extended axes visible only in Extended mode.
 * L = FIS-001 Conformidade Legal (multas) — Fase 3 (Calvin 2026-06-09).
 */
export const EXTENDED_AXES = ['Tr', 'Sv', 'Dp', 'Cc', 'L'] as const;
export type ExtendedAxis = (typeof EXTENDED_AXES)[number];

/**
 * Todos os 10 eixos do EIS Radar.
 * All 10 EIS Radar axes.
 */
export const ALL_AXES = [...CORE_AXES, ...EXTENDED_AXES] as const;
export type AllAxis = (typeof ALL_AXES)[number];

/**
 * Rótulos canônicos dos eixos (internos, sem i18n).
 * Canonical axis labels (internal, without i18n).
 */
export const AXIS_LABELS = {
    T: 'Temporal',
    A: 'Acurácia',
    Cp: 'Completude',
    Ty: 'Tipologia',
    Cs: 'Consistência',
    Cm: 'Compliance',
    Tr: 'Transparência',
    Sv: 'Severidade',
    Dp: 'Dependência',
    Cc: 'Confiança',
    L: 'Legal (FIS)',
} as const;

/**
 * Modos de visualização do radar.
 * Radar view modes.
 */
export const RADAR_VIEW_MODES = {
    CORE: 'core',
    EXTENDED: 'extended',
} as const;
export type RadarViewMode = (typeof RADAR_VIEW_MODES)[keyof typeof RADAR_VIEW_MODES];

/**
 * Retorna os eixos para o modo especificado.
 * Returns the axes for the specified mode.
 *
 * @param {string} mode - 'core' | 'extended'
 * @returns {string[]} Array de IDs de eixos
 */
export function getAxesForMode(mode: string): string[] {
    return mode === RADAR_VIEW_MODES.EXTENDED ? [...ALL_AXES] : [...CORE_AXES];
}