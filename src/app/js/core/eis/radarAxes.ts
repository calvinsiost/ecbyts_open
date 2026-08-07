// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * @typedef {Object} RadarAxisLabels
 * @property {string} en
 * @property {string} pt
 * @property {string} es
 *
 * @typedef {Object} RadarAxis
 * @property {string} key
 * @property {string} tier
 * @property {number} order
 * @property {RadarAxisLabels} labels
 */

export interface RadarAxisLabels {
    en: string;
    pt: string;
    es: string;
}

export interface RadarAxis {
    key: string;
    tier: string;
    order: number;
    labels: RadarAxisLabels;
}

/* ================================================================
   EIS RADAR 10 AXES — SPEC_EIS_RADAR_10AXES_PROGRESSIVE_UI §3

   Define os 10 eixos canônicos (Core-6 + Extended-4) do radar EIS
   com dois modos: Core-6 (executivo) e Extended-10 (diagnóstico).

   Regra de separação (§3.3): EIS final oficial usa Core-6. As 4
   variáveis extras (V/U/Unc/Ex) são visualização + Quality Overlay
   Score separado — NUNCA misturar silenciosamente.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Axis registry (§3.1)
// ──────────────────────────────────────────────────────────────────────

export const RADAR_AXES = {
    T: { key: 'T', tier: 'core', order: 1, labels: { en: 'Transparency', pt: 'Transparência', es: 'Transparencia' } },
    A: { key: 'A', tier: 'core', order: 2, labels: { en: 'Accuracy', pt: 'Acurácia', es: 'Precisión' } },
    Cp: { key: 'Cp', tier: 'core', order: 3, labels: { en: 'Completeness', pt: 'Completude', es: 'Completitud' } },
    Ty: { key: 'Ty', tier: 'core', order: 4, labels: { en: 'Timeliness', pt: 'Temporalidade', es: 'Oportunidad' } },
    Cs: { key: 'Cs', tier: 'core', order: 5, labels: { en: 'Consistency', pt: 'Consistência', es: 'Consistencia' } },
    Cm: {
        key: 'Cm',
        tier: 'core',
        order: 6,
        labels: { en: 'Comparability', pt: 'Comparabilidade', es: 'Comparabilidad' },
    },
    V: { key: 'V', tier: 'extended', order: 7, labels: { en: 'Validity', pt: 'Validade', es: 'Validez' } },
    U: { key: 'U', tier: 'extended', order: 8, labels: { en: 'Uniqueness', pt: 'Unicidade', es: 'Unicidad' } },
    Unc: {
        key: 'Unc',
        tier: 'extended',
        order: 9,
        labels: { en: 'Uncertainty', pt: 'Incerteza', es: 'Incertidumbre' },
    },
    Ex: {
        key: 'Ex',
        tier: 'extended',
        order: 10,
        labels: { en: 'Exception Context', pt: 'Contexto de Exceção', es: 'Contexto Excepcional' },
    },
} as const;

export type RadarAxisKey = keyof typeof RADAR_AXES;

export const CORE_6_KEYS = ['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm'] as const;
export type Core6Key = (typeof CORE_6_KEYS)[number];

export const EXTENDED_4_KEYS = ['V', 'U', 'Unc', 'Ex'] as const;
export type Extended4Key = (typeof EXTENDED_4_KEYS)[number];

export const ALL_10_KEYS = [...CORE_6_KEYS, ...EXTENDED_4_KEYS] as const;
export type All10Key = (typeof ALL_10_KEYS)[number];

export const RADAR_MODES = {
    CORE_6: 'core_6',
    EXTENDED_10: 'extended_10',
} as const;

export type RadarMode = (typeof RADAR_MODES)[keyof typeof RADAR_MODES];

// ──────────────────────────────────────────────────────────────────────
// Accessors
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna keys dos eixos por modo.
 */
export function getAxisKeysForMode(mode: RadarMode): string[] {
    if (mode === RADAR_MODES.EXTENDED_10) return [...ALL_10_KEYS];
    return [...CORE_6_KEYS];
}

/**
 * Retorna axis entries ordenadas por order asc.
 */
export function getAxesOrdered(mode: RadarMode = RADAR_MODES.CORE_6): RadarAxis[] {
    const keys = getAxisKeysForMode(mode);
    return keys
        .map((k) => RADAR_AXES[k as RadarAxisKey])
        .sort((a, b) => a.order - b.order);
}

/**
 * Label de um eixo, default "KEY - Nome".
 */
export function axisLabel(
    axisKey: string,
    lang: 'en' | 'pt' | 'es' = 'pt',
    opts: { withKey?: boolean } = {},
): string | null {
    const axis = RADAR_AXES[axisKey as RadarAxisKey];
    if (!axis) return null;
    const langKey = (['en', 'pt', 'es'].includes(lang) ? lang : 'pt') as 'en' | 'pt' | 'es';
    const name = axis.labels[langKey] || axis.labels.en;
    return opts.withKey === false ? name : `${axisKey} — ${name}`;
}

// ──────────────────────────────────────────────────────────────────────
// Radar data builder (Chart.js compatible)
// ──────────────────────────────────────────────────────────────────────

export interface RadarDataResult {
    labels: string[];
    values: number[];
    keys: string[];
    mode: string;
    coverage: number;
}

/**
 * Constrói dataset para Chart.js radar (labels + values).
 */
export function buildRadarData(
    axisScores: Record<string, unknown>,
    mode: RadarMode = RADAR_MODES.CORE_6,
    opts: { lang?: 'en' | 'pt' | 'es' } = {},
): RadarDataResult {
    const lang = (opts.lang || 'pt') as 'en' | 'pt' | 'es';
    const axes = getAxesOrdered(mode);
    const labels = axes.map((a) => axisLabel(a.key, lang) || a.key);
    const keys = axes.map((a) => a.key);
    let covered = 0;
    const values = axes.map((a) => {
        const v = Number((axisScores as Record<string, unknown>)?.[a.key]);
        if (Number.isFinite(v)) {
            covered++;
            return Math.max(0, Math.min(5, v));
        }
        return 0;
    });
    const coverage = axes.length > 0 ? covered / axes.length : 0;
    return { labels, values, keys, mode, coverage };
}

// ──────────────────────────────────────────────────────────────────────
// Quality Overlay Score (§3.3 componente secundário)
// ──────────────────────────────────────────────────────────────────────

const DEFAULT_OVERLAY_WEIGHTS = {
    V: 1.0,
    U: 1.0,
    Unc: 1.0,
    Ex: 0.5,
} as const;

export interface QualityBreakdown {
    key: string;
    value: number | null;
    weight: number;
    contribution: number;
}

export interface QualityOverlayScoreResult {
    score: number | null;
    breakdown: QualityBreakdown[];
    coverage: number;
}

/**
 * Computa Quality Overlay Score (0..5) a partir das 4 variáveis extended.
 * Score SEPARADO do EIS Core - nunca misturar em UI (§3.3).
 */
export function computeQualityOverlayScore(
    extendedScores: Record<string, unknown>,
    opts: { weights?: Record<string, number> } = {},
): QualityOverlayScoreResult {
    const weights = opts.weights || (DEFAULT_OVERLAY_WEIGHTS as unknown as Record<string, number>);
    const breakdown: QualityBreakdown[] = [];
    let sumWeighted = 0;
    let totalWeight = 0;
    let covered = 0;
    for (const key of EXTENDED_4_KEYS) {
        const raw = Number((extendedScores as Record<string, unknown>)?.[key]);
        const w = Number(weights[key]) || 0;
        if (!Number.isFinite(raw)) {
            breakdown.push({ key, value: null, weight: w, contribution: 0 });
            continue;
        }
        covered++;
        const clamped = Math.max(0, Math.min(5, raw));
        const contribution = clamped * w;
        sumWeighted += contribution;
        totalWeight += w;
        breakdown.push({ key, value: clamped, weight: w, contribution });
    }
    const score = totalWeight > 0 ? sumWeighted / totalWeight : null;
    const coverage = covered / EXTENDED_4_KEYS.length;
    return { score, breakdown, coverage };
}

// ──────────────────────────────────────────────────────────────────────
// UI density helper (§4.2 Compact/Detailed)
// ──────────────────────────────────────────────────────────────────────

export interface ResolveLayerAxesResult {
    layer1: string[];
    layer2: string[];
    density: 'compact' | 'detailed';
    collapseLayer2: boolean;
}

/**
 * Resolve quais axes mostrar em uma camada visual dado mode + density.
 * Camada 1 (sempre): Core-6.
 * Camada 2 (collapsible): Extended-4 se mode=extended_10.
 */
export function resolveLayerAxes(
    mode: string,
    density: 'compact' | 'detailed' = 'detailed',
): ResolveLayerAxesResult {
    const l1 = [...CORE_6_KEYS];
    const l2 = mode === RADAR_MODES.EXTENDED_10 ? [...EXTENDED_4_KEYS] : [];
    return { layer1: l1, layer2: l2, density, collapseLayer2: density === 'compact' };
}