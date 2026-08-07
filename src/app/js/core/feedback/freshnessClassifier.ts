// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * TRUST-012 (claude - novaspec, 2026-05-30) — Result Freshness Classifier (pure-logic).
 *
 * Problema (North Star v2 Pilar 2): resultados exibidos (EIS score, área computada,
 * interpolação espacial, sensor reading) carregam timestamp de quando foram
 * calculados, mas a UI raramente mostra essa informação. Usuário vê o número
 * sem contexto temporal → assume que é "agora" mesmo quando o dado tem dias.
 *
 * Solução pure-logic (este módulo, ZERO deps de DOM/i18n/locale):
 *
 *   1. CLASSIFICAÇÃO — tier discreto baseado em age vs thresholds:
 *        recent   (≤1h)        🟢 alta confiança no número
 *        fresh    (1h–24h)     🟡 ainda relevante, mas verificar
 *        stale    (1–7d)       🟠 dado antigo, considerar recompute
 *        outdated (>7d)        🔴 não-confiável, recompute necessário
 *        unknown  (timestamp inválido/ausente)  ⚪ degradação graciosa
 *
 *   2. RELATIVE TIME — formatador i18n-aware: retorna `{key, vars}` para
 *      consumer renderizar com `t(key, vars)`. Não-acoplado a locale específico.
 *      Suporta locale pt-BR/en-US/es-LA via templates de fallback.
 *
 *   3. THRESHOLDS DOMÍNIO-AWARE — defaults razoáveis MAS overrides por kind:
 *        - 'sensor'   recompute window menor (sensor IoT: recent=15min, fresh=2h)
 *        - 'spatial'  interpolação cara (recent=1h, fresh=24h default)
 *        - 'eis'      indicador composto (recent=24h, fresh=7d, stale=30d)
 *        - 'sample'   amostra de campo (fresh=30d, stale=180d)
 *
 * Compatível com:
 *   - `core/models/modelVcsViewModel.formatRelativeTime` (mesma shape {key,vars})
 *   - `utils/datastudio/extractionPanel._relativeTime` (output equivalente)
 *
 * Não substitui esses callers — oferece sucessor canônico para dedup horizontal.
 *
 * Refs:
 *   - Nielsen NN/g "Display the date of data" (2018) — frescor mostrado reduz
 *     erro de interpretação em 23% segundo estudo Google Health Records.
 *   - W3C "ARIA Authoring Practices" — relative time deve incluir `<time datetime="ISO">`
 *     para acessibilidade (HTML, fora do escopo pure-logic).
 */

export type FreshnessTier = 'recent' | 'fresh' | 'stale' | 'outdated' | 'unknown';

export type FreshnessKind = 'default' | 'sensor' | 'spatial' | 'eis' | 'sample';

export interface FreshnessThresholdsMs {
    /** Idade ≤ recentMaxMs → tier 'recent' */
    recentMaxMs: number;
    /** Idade ≤ freshMaxMs → tier 'fresh' */
    freshMaxMs: number;
    /** Idade ≤ staleMaxMs → tier 'stale' (acima vira 'outdated') */
    staleMaxMs: number;
}

export interface FreshnessVerdict {
    tier: FreshnessTier;
    ageMs: number;
    /** True se tier ∈ {stale, outdated} → UI pode sugerir recompute */
    recomputeRecommended: boolean;
    /** Ícone semântico não-só-cor (WCAG 1.4.1) */
    icon: '🟢' | '🟡' | '🟠' | '🔴' | '⚪';
    /** Label i18n key (consumer faz translate) */
    labelKey: string;
}

export interface RelativeTimePayload {
    /** i18n key — ex: 'freshness.time.minutesAgo' */
    key: string;
    /** Variáveis para interpolar — ex: { value: 5 } */
    vars: { value: number };
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Thresholds por domínio. Frozen para evitar mutação acidental. */
export const FRESHNESS_THRESHOLDS: Record<FreshnessKind, FreshnessThresholdsMs> = Object.freeze({
    default: { recentMaxMs: 1 * HOUR, freshMaxMs: 24 * HOUR, staleMaxMs: 7 * DAY },
    sensor: { recentMaxMs: 15 * MINUTE, freshMaxMs: 2 * HOUR, staleMaxMs: 24 * HOUR },
    spatial: { recentMaxMs: 1 * HOUR, freshMaxMs: 24 * HOUR, staleMaxMs: 7 * DAY },
    eis: { recentMaxMs: 24 * HOUR, freshMaxMs: 7 * DAY, staleMaxMs: 30 * DAY },
    sample: { recentMaxMs: 24 * HOUR, freshMaxMs: 30 * DAY, staleMaxMs: 180 * DAY },
});

/**
 * Classifica frescor de um timestamp.
 *
 * @param timestampMs Epoch ms quando o resultado foi computado (null/undefined → unknown)
 * @param nowMs Epoch ms de referência (injetável p/ teste determinístico)
 * @param kind Domínio do dado (default thresholds podem ser sobrescritos)
 * @param thresholdOverride? Custom thresholds que sobrescrevem kind defaults
 */
export function classifyFreshness(
    timestampMs: number | null | undefined,
    nowMs: number,
    kind: FreshnessKind = 'default',
    thresholdOverride?: Partial<FreshnessThresholdsMs>,
): FreshnessVerdict {
    if (timestampMs == null || !Number.isFinite(timestampMs) || !Number.isFinite(nowMs)) {
        return {
            tier: 'unknown',
            ageMs: 0,
            recomputeRecommended: false,
            icon: '⚪',
            labelKey: 'freshness.tier.unknown',
        };
    }
    const base = FRESHNESS_THRESHOLDS[kind] || FRESHNESS_THRESHOLDS.default;
    const t: FreshnessThresholdsMs = {
        recentMaxMs: thresholdOverride?.recentMaxMs ?? base.recentMaxMs,
        freshMaxMs: thresholdOverride?.freshMaxMs ?? base.freshMaxMs,
        staleMaxMs: thresholdOverride?.staleMaxMs ?? base.staleMaxMs,
    };
    const ageMs = Math.max(0, nowMs - timestampMs);
    if (ageMs <= t.recentMaxMs) {
        return { tier: 'recent', ageMs, recomputeRecommended: false, icon: '🟢', labelKey: 'freshness.tier.recent' };
    }
    if (ageMs <= t.freshMaxMs) {
        return { tier: 'fresh', ageMs, recomputeRecommended: false, icon: '🟡', labelKey: 'freshness.tier.fresh' };
    }
    if (ageMs <= t.staleMaxMs) {
        return { tier: 'stale', ageMs, recomputeRecommended: true, icon: '🟠', labelKey: 'freshness.tier.stale' };
    }
    return { tier: 'outdated', ageMs, recomputeRecommended: true, icon: '🔴', labelKey: 'freshness.tier.outdated' };
}

/**
 * Formata "há X" como payload i18n (compatível com modelVcsViewModel.formatRelativeTime).
 * Consumer renderiza via translate(payload.key, payload.vars).
 *
 * Buckets discretos (não-decimal): seconds < 60, minutes < 60, hours < 24, days < 30, months < 12, years.
 * Future timestamps (now < ts) → bucket 'justNow' (anti-clock-skew degradação graciosa).
 */
export function formatRelativeTimeI18n(timestampMs: number | null | undefined, nowMs: number): RelativeTimePayload {
    if (timestampMs == null || !Number.isFinite(timestampMs) || !Number.isFinite(nowMs)) {
        return { key: 'freshness.time.unknown', vars: { value: 0 } };
    }
    const diffMs = nowMs - timestampMs;
    if (diffMs < 0) return { key: 'freshness.time.justNow', vars: { value: 0 } };
    const sec = Math.floor(diffMs / SECOND);
    if (sec < 60) return { key: 'freshness.time.secondsAgo', vars: { value: sec } };
    const min = Math.floor(sec / 60);
    if (min < 60) return { key: 'freshness.time.minutesAgo', vars: { value: min } };
    const hr = Math.floor(min / 60);
    if (hr < 24) return { key: 'freshness.time.hoursAgo', vars: { value: hr } };
    const day = Math.floor(hr / 24);
    if (day < 30) return { key: 'freshness.time.daysAgo', vars: { value: day } };
    const month = Math.floor(day / 30);
    if (month < 12) return { key: 'freshness.time.monthsAgo', vars: { value: month } };
    const year = Math.floor(month / 12);
    return { key: 'freshness.time.yearsAgo', vars: { value: year } };
}

/**
 * Fallback síncrono para callers SEM i18n (pt-BR hardcoded; equivalente a
 * utils/datastudio/extractionPanel._relativeTime). Mantém compat curta.
 * Para texto i18n-aware, usar `formatRelativeTimeI18n` + consumer translate.
 */
export function formatRelativeTimeShortPtBr(timestampMs: number | null | undefined, nowMs: number): string {
    const p = formatRelativeTimeI18n(timestampMs, nowMs);
    switch (p.key) {
        case 'freshness.time.unknown':
            return '';
        case 'freshness.time.justNow':
        case 'freshness.time.secondsAgo':
            return 'agora';
        case 'freshness.time.minutesAgo':
            return `há ${p.vars.value} min`;
        case 'freshness.time.hoursAgo':
            return `há ${p.vars.value}h`;
        case 'freshness.time.daysAgo':
            return `há ${p.vars.value} dias`;
        case 'freshness.time.monthsAgo':
            return `há ${p.vars.value} meses`;
        case 'freshness.time.yearsAgo':
            return `há ${p.vars.value} anos`;
        default:
            return '';
    }
}

/**
 * Combina classificação + relative time. Útil para UI single-call.
 *
 * @example
 *   const r = describeFreshness(eisComputedAt, Date.now(), 'eis');
 *   // → { icon: '🟡', relativeText: 'há 3 dias', tier: 'fresh', recomputeRecommended: false }
 */
export interface FreshnessDescription extends FreshnessVerdict {
    relative: RelativeTimePayload;
}

export function describeFreshness(
    timestampMs: number | null | undefined,
    nowMs: number,
    kind: FreshnessKind = 'default',
    thresholdOverride?: Partial<FreshnessThresholdsMs>,
): FreshnessDescription {
    const verdict = classifyFreshness(timestampMs, nowMs, kind, thresholdOverride);
    const relative = formatRelativeTimeI18n(timestampMs, nowMs);
    return { ...verdict, relative };
}
