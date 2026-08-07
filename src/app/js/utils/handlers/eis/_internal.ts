// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Extracted from app/js/utils/handlers/eis.js in ARCH-MONO-001 Phase P0-1.
//
// _internal.js - Pure constants and helpers for EIS handlers.
// No module state, no window access, no external imports.

/** Chave localStorage para perfis custom */
export const CUSTOM_PROFILES_KEY = 'ecbyts-eis-custom-profiles';

export const EIS_TEMPLATES_API = '/api/eis-templates';

/** Modo de visualização do painel EIS: 'core_6' | 'extended_10' */
export const EIS_VIEW_MODE_KEY = 'ecbyts-eis-view-mode';

export const AXIS_META = {
    T: { key: 'eis.axis_T', fallback: 'Transparency' },
    A: { key: 'eis.axis_A', fallback: 'Accuracy' },
    Cp: { key: 'eis.axis_Cp', fallback: 'Completeness' },
    Ty: { key: 'eis.axis_Ty', fallback: 'Timeliness' },
    Cs: { key: 'eis.axis_Cs', fallback: 'Consistency' },
    Cm: { key: 'eis.axis_Cm', fallback: 'Comparability' },
} as const;

export const EIS_EXTENDED_AXES = ['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm', 'V', 'U', 'Unc', 'Ex'] as const;
export type EISExtendedAxis = (typeof EIS_EXTENDED_AXES)[number];

export const EIS_EXTENDED_DEFAULT_WEIGHTS = { V: 1, U: 1, Unc: 1, Ex: 1 } as const;

export function _canonicalFormulaRefForAxis(axisId: unknown): string {
    return `eis.axis.${axisId}.v1`;
}

/**
 * Converte score EIS (0-5) em cor CSS via gradiente contínuo de 5 stops.
 * Diferente de getVerdictColor() que retorna 3 cores categóricas (verdict).
 * @param {number} score - 0.0 a 5.0
 * @returns {string} CSS rgb() color
 */
export function scoreToColor(score: number): string {
    if (!Number.isFinite(score)) return 'rgb(239,68,68)';
    const s = Math.max(0, Math.min(5, score));
    const stops: Array<[number, number[]]> = [
        [0, [239, 68, 68]], // red
        [1.5, [249, 115, 22]], // orange
        [2.5, [234, 179, 8]], // yellow
        [3.5, [34, 197, 94]], // green
        [5, [5, 150, 105]], // teal
    ];
    let lo: [number, number[]] | undefined = stops[0];
    let hi: [number, number[]] | undefined = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
        const cur = stops[i];
        const nxt = stops[i + 1];
        if (cur && nxt && s >= cur[0] && s <= nxt[0]) {
            lo = cur;
            hi = nxt;
            break;
        }
    }
    if (!lo || !hi) return 'rgb(239,68,68)';
    const loRgb = lo[1];
    const hiRgb = hi[1];
    const t = lo[0] === hi[0] ? 0 : (s - lo[0]) / (hi[0] - lo[0]);
    const r = Math.round((loRgb[0] ?? 0) + ((hiRgb[0] ?? 0) - (loRgb[0] ?? 0)) * t);
    const g = Math.round((loRgb[1] ?? 0) + ((hiRgb[1] ?? 0) - (loRgb[1] ?? 0)) * t);
    const b = Math.round((loRgb[2] ?? 0) + ((hiRgb[2] ?? 0) - (loRgb[2] ?? 0)) * t);
    return `rgb(${r},${g},${b})`;
}

/** Nomes dos indicadores espaciais IS1-IS7 */
export const IS_NAMES = ['is1', 'is2', 'is3', 'is4', 'is5', 'is6', 'is7'] as const;
export type ISName = (typeof IS_NAMES)[number];