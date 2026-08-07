// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HUD BADGE FORMATTER — SPEC_UNCERTAINTY_PROPAGATION (UNC-001)

   Pure helpers para badges de uncertainty em HUDs:
   - Coverage factor k=2 (95% CI) §1.2 GUM standard
   - Badge classification color + icon §1.8 WCAG 2.1 AA
   - CI notation (inline, popover, aria-label)
   - Chain quality classifier (all-green/mixed/all-red)
   - Default cost uncertainty por categoria §1.7

   UI rendering fica em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §1.2 / §1.8
// ──────────────────────────────────────────────────────────────────────

export const COVERAGE_FACTOR_K = 2; // §1.2 GUM/IPCC 2006/EPA 2009 = 95% CI

interface BadgeDefinition {
    color: string;
    icon: string;
    aria: string;
}

// Badge definitions §1.8 - cor + icon + aria-text (WCAG 2.1 AA)
export const BADGE_LEVELS: Readonly<Record<'green' | 'yellow' | 'red' | 'grey', BadgeDefinition>> = Object.freeze({
    green: { color: '#2ecc71', icon: '●', aria: 'Baixa incerteza (OK)' },
    yellow: { color: '#f1c40f', icon: '▲', aria: 'Incerteza moderada (atenção)' },
    red: { color: '#e74c3c', icon: '■', aria: 'Alta incerteza (alerta)' },
    grey: { color: '#95a5a6', icon: '?', aria: 'Incerteza desconhecida' },
});

// Thresholds u_rel para badges (0..1)
export const U_REL_BADGE_THRESHOLDS = Object.freeze({
    GREEN_MAX: 0.1, // ≤10% → green
    YELLOW_MAX: 0.3, // ≤30% → yellow
    // >30% → red
});

// Default cost uncertainty por categoria §1.7 (C fallback)
export const DEFAULT_COST_UNCERTAINTY: Readonly<Record<string, number>> = Object.freeze({
    capex_construction: 0.15, // ±15%
    capex_equipment: 0.1,
    capex_land: 0.05,
    opex_analytical: 0.05, // ±5% lab
    opex_labor: 0.1,
    opex_transport: 0.15,
    opex_energy: 0.1,
    intangible: 0.25, // ±25% default alto
});

// ──────────────────────────────────────────────────────────────────────
// Badge classification §1.8
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {number} uRel - 0..1 (u_rel = U / value)
 * @returns {'green'|'yellow'|'red'|'grey'}
 */
export function classifyBadgeByURel(uRel: number): 'green' | 'yellow' | 'red' | 'grey' {
    const u = Number(uRel);
    if (!Number.isFinite(u) || u < 0) return 'grey';
    if (u <= U_REL_BADGE_THRESHOLDS.GREEN_MAX) return 'green';
    if (u <= U_REL_BADGE_THRESHOLDS.YELLOW_MAX) return 'yellow';
    return 'red';
}

/**
 * @param {string} level
 * @returns {BadgeDefinition}
 */
export function getBadgeDefinition(level: string): BadgeDefinition {
    return (
        (BADGE_LEVELS as Record<string, BadgeDefinition>)[level] || BADGE_LEVELS.grey
    );
}

// ──────────────────────────────────────────────────────────────────────
// Chain quality classifier (propagation trace)
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide cor do badge quando há múltiplas contribuições.
 * Regra: se qualquer ND não imputado → grey. Senão pior de todos.
 *
 * @param {ReadonlyArray<{level: string, imputed?: boolean}>} chainBadges
 * @returns {'green'|'yellow'|'red'|'grey'}
 */
export function classifyChainQuality(
    chainBadges: ReadonlyArray<{ level: string; imputed?: boolean }>,
): 'green' | 'yellow' | 'red' | 'grey' {
    if (!Array.isArray(chainBadges) || chainBadges.length === 0) return 'grey';
    // Qualquer grey ou ND não imputado → grey (honest UX §1.5)
    if (chainBadges.some((b) => b && (b.level === 'grey' || b.imputed === false))) {
        return 'grey';
    }
    // Pior cor prevalece
    if (chainBadges.some((b) => b && b.level === 'red')) return 'red';
    if (chainBadges.some((b) => b && b.level === 'yellow')) return 'yellow';
    return 'green';
}

// ──────────────────────────────────────────────────────────────────────
// Coverage factor (GUM §1.2)
// ──────────────────────────────────────────────────────────────────────

/**
 * Expande u padrão para U expandido.
 * U = k × u_std (k=2 default)
 * @param {number} uStd
 * @param {number} [k]
 * @returns {number}
 */
export function expandUncertainty(uStd: number, k: number = COVERAGE_FACTOR_K): number {
    const n = Number(uStd);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n * (Number(k) || COVERAGE_FACTOR_K);
}

/**
 * @param {number} value
 * @param {number} uExpanded
 * @returns {{ low: number, high: number }}
 */
export function ciBounds(value: number, uExpanded: number): { low: number; high: number } {
    const v = Number(value);
    const u = Number(uExpanded);
    if (!Number.isFinite(v) || !Number.isFinite(u) || u < 0) {
        return { low: v, high: v };
    }
    return { low: v - u, high: v + u };
}

// ──────────────────────────────────────────────────────────────────────
// CI notation formatters
// ──────────────────────────────────────────────────────────────────────

/**
 * Notação inline: "4.2 ± 0.3" §1.4 (B)
 * @param {number} value
 * @param {number} uExpanded
 * @param {number} [decimals]
 * @returns {string}
 */
export function formatInlineCI(value: number, uExpanded: number, decimals: number = 2): string {
    const v = Number(value);
    const u = Number(uExpanded);
    if (!Number.isFinite(v)) return '—';
    if (!Number.isFinite(u) || u <= 0) return v.toFixed(decimals);
    return `${v.toFixed(decimals)} ± ${u.toFixed(decimals)}`;
}

/**
 * Notação range: "3.9-4.5" (95% CI) §1.4 (B alt)
 * @param {number} value
 * @param {number} uExpanded
 * @param {number} [decimals]
 * @returns {string}
 */
export function formatRangeCI(value: number, uExpanded: number, decimals: number = 2): string {
    const { low, high } = ciBounds(value, uExpanded);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return '—';
    return `${low.toFixed(decimals)}–${high.toFixed(decimals)}`;
}

/**
 * Plain language para tooltip acessibilidade §1.4.
 * @param {number} uRel
 * @returns {string}
 */
export function formatPlainLanguageUncertainty(uRel: number): string {
    const u = Number(uRel);
    if (!Number.isFinite(u) || u <= 0) return 'sem incerteza declarada';
    const pct = (u * 100).toFixed(1);
    return `±${pct}%`;
}

// ──────────────────────────────────────────────────────────────────────
// Default cost uncertainty §1.7
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} costCategory
 * @returns {number} u_rel default
 */
export function getDefaultCostURel(costCategory: string): number {
    if (typeof costCategory !== 'string') return DEFAULT_COST_UNCERTAINTY.intangible as number;
    return (DEFAULT_COST_UNCERTAINTY[costCategory] ?? DEFAULT_COST_UNCERTAINTY.intangible) as number;
}

/**
 * Aplica uncertainty a uma cost line: retorna u_rel efetivo (declared > default).
 * @param {{ cost?: number, uncertainty?: { value?: number }, category?: string }|null|undefined} costLine
 * @returns {{ uRel: number, source: 'declared'|'default'|'category' }}
 */
export function resolveCostURel(
    costLine: { cost?: number; uncertainty?: { value?: number }; category?: string } | null | undefined,
): { uRel: number; source: 'declared' | 'default' | 'category' } {
    if (!costLine || typeof costLine !== 'object') {
        return { uRel: 0, source: 'default' };
    }
    if (
        costLine.uncertainty &&
        Number.isFinite(costLine.uncertainty.value) &&
        (costLine.uncertainty.value as number) > 0
    ) {
        return { uRel: costLine.uncertainty.value as number, source: 'declared' };
    }
    const def = getDefaultCostURel(costLine.category as string);
    return { uRel: def, source: 'category' };
}

// ──────────────────────────────────────────────────────────────────────
// Aria-label builder (WCAG 2.1 AA §1.8)
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {{ level: string, value?: number, uExpanded?: number, count?: number }|null|undefined} badge
 * @returns {string}
 */
export function buildAriaLabel(
    badge: { level: string; value?: number; uExpanded?: number; count?: number } | null | undefined,
): string {
    if (!badge) return '';
    const def = getBadgeDefinition(badge.level);
    let label = def.aria;
    const value = badge.value;
    const uExpanded = badge.uExpanded;
    if (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        typeof uExpanded === 'number' &&
        Number.isFinite(uExpanded) &&
        uExpanded > 0
    ) {
        label += `. Valor ${value.toFixed(2)} com incerteza expandida ±${uExpanded.toFixed(2)}`;
    }
    const count = badge.count;
    if (typeof count === 'number' && Number.isFinite(count)) {
        label += `. Baseado em ${count} ${count === 1 ? 'amostra' : 'amostras'}`;
    }
    return label;
}
