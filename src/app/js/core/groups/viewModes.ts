// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   GROUP VIEW MODES — SPEC_GROUP_VIEW_MODES (GRP-VIEW-001)

   Pure helpers para modos de visualização de grupo (§Q1 mutuamente
   exclusivos):
   - form: tabela editável inline
   - dashboard: 3-4 widgets pré-configurados
   - collection: card grid com preview
   - data: SQL-like query view
   - visibility_only: só ligar/desligar render (§título spec)

   UI + Three.js visibility em handler. Core só decide mode + options.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

export const VIEW_MODES = Object.freeze(['visibility_only', 'form', 'dashboard', 'collection', 'data']);

export const DEFAULT_VIEW_MODE = 'visibility_only';

// Capabilities por mode (§3 Design Lock - o que cada modo suporta)
export const MODE_CAPABILITIES = Object.freeze({
    visibility_only: {
        inlineEdit: false,
        showCharts: false,
        showCards: false,
        showQuery: false,
        togglesVisibility: true,
    },
    form: {
        inlineEdit: true,
        showCharts: false,
        showCards: false,
        showQuery: false,
        togglesVisibility: false,
    },
    dashboard: {
        inlineEdit: false,
        showCharts: true,
        showCards: false,
        showQuery: false,
        togglesVisibility: false,
    },
    collection: {
        inlineEdit: false,
        showCharts: false,
        showCards: true,
        showQuery: false,
        togglesVisibility: false,
    },
    data: {
        inlineEdit: true, // edição inline em célula de tabela
        showCharts: false,
        showCards: false,
        showQuery: true,
        togglesVisibility: false,
    },
});

export const DASHBOARD_WIDGETS = Object.freeze(['count', 'distribution', 'metrics', 'alerts']);

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

/**
 * @param mode
 */
export function isValidViewMode(mode: string): boolean {
    return typeof mode === 'string' && VIEW_MODES.includes(mode);
}

/**
 * Resolve mode (fallback default se inválido).
 * @param mode
 */
export function resolveViewMode(mode: string): string {
    return isValidViewMode(mode) ? mode : DEFAULT_VIEW_MODE;
}

/**
 * Retorna capabilities de um mode.
 * @param mode
 */
export function getModeCapabilities(mode: string): Record<string, any> {
    const caps = MODE_CAPABILITIES as Record<string, any>;
    return (caps[mode] || caps[DEFAULT_VIEW_MODE]) as Record<string, any>;
}

// ──────────────────────────────────────────────────────────────────────
// Transitions (switch mode = reset state? §Q1 "toggle rápido")
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide se troca de mode preserva ou reset state.
 * visibility_only → data: preserva (ambos modos read-only)
 * form → data: preserva (ambos têm edit)
 * dashboard → form: reset (charts não têm sentido em form)
 *
 * @param fromMode
 * @param toMode
 */
export function transitionPolicy(
    fromMode: string,
    toMode: string,
): { preserveState: boolean; resetReason: string | null } {
    if (!isValidViewMode(fromMode) || !isValidViewMode(toMode)) {
        return { preserveState: false, resetReason: 'invalid_mode' };
    }
    if (fromMode === toMode) return { preserveState: true, resetReason: null };

    const fromCaps = getModeCapabilities(fromMode);
    const toCaps = getModeCapabilities(toMode);

    // Preserva se capabilities de edit forem compatíveis
    if (fromCaps.inlineEdit && !toCaps.inlineEdit) {
        return { preserveState: false, resetReason: 'edit_capability_lost' };
    }
    if (fromCaps.showCharts && !toCaps.showCharts) {
        return { preserveState: false, resetReason: 'chart_state_invalidated' };
    }
    return { preserveState: true, resetReason: null };
}

// ──────────────────────────────────────────────────────────────────────
// Visibility toggle (§ligar/desligar elementos do grupo)
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa estado de visibilidade para elementos de um grupo.
 *
 * @param elements
 * @param state - { hiddenIds: Set, opacity: number 0..1 }
 */
export function computeElementVisibility(
    elements: Array<object>,
    state: Record<string, any> = {},
): Array<{ id: any; visible: any; opacity: any }> {
    if (!Array.isArray(elements)) return [];
    const hidden =
        state.hiddenIds instanceof Set
            ? state.hiddenIds
            : new Set(Array.isArray(state.hiddenIds) ? state.hiddenIds : []);
    const opacity = Number.isFinite(state.opacity) ? Math.max(0, Math.min(1, state.opacity)) : 1;

    return elements.map(
        (el: any) =>
            ({
                id: el?.id,
                visible: el?.id ? !hidden.has(el.id) : true,
                opacity,
            }) as any,
    );
}

// ──────────────────────────────────────────────────────────────────────
// Dashboard widgets (§Q3 "3-4 widgets inteligentes")
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa widgets do dashboard mode para um grupo.
 *
 * @param elements - com { id, type, observations?, alerts? }
 */
export function computeDashboardWidgets(elements: Array<object>): {
    count: { total: number; byType: object };
    distribution: Array<{ type: string; count: number; pct: number }>;
    metrics: { totalObservations: number; avgObservationsPerElement: number | null };
    alerts: number;
} {
    const safe = Array.isArray(elements) ? elements.filter((e) => e && typeof e === 'object') : [];

    const byType: Record<string, number> = {};
    let totalObservations = 0;
    let alerts = 0;
    for (const _el of safe) {
        const el = _el as any;
        const type = el.type || el.family || 'unknown';
        byType[type] = (byType[type] || 0) + 1;
        const obs = Array.isArray(el.observations) ? el.observations.length : 0;
        totalObservations += obs;
        if (Array.isArray(el.alerts)) alerts += el.alerts.length;
    }

    const total = safe.length;
    const distribution = Object.entries(byType)
        .map(([type, count]) => ({ type, count, pct: total > 0 ? count / total : 0 }))
        .sort((a, b) => b.count - a.count);

    return {
        count: { total, byType },
        distribution,
        metrics: {
            totalObservations,
            avgObservationsPerElement: total > 0 ? totalObservations / total : null,
        },
        alerts,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Collection mode - card grid
// ──────────────────────────────────────────────────────────────────────

/**
 * Constrói cards do collection mode. Cada card resume um elemento.
 *
 * @param elements
 * @param opts
 */
export function buildCollectionCards(elements: Array<object>, opts: { limit?: number } = {}): Array<any> {
    if (!Array.isArray(elements)) return [];
    const limit =
        Number.isFinite(opts.limit) && (opts.limit as number) > 0 ? (opts.limit as number) : elements.length;
    return elements
        .filter((e: any) => e && e.id)
        .slice(0, limit)
        .map(
            (el: any) =>
                ({
                    id: el.id,
                    title: el.name || el.id,
                    subtitle: el.type || el.family || '',
                    stats: {
                        observations: Array.isArray(el.observations) ? el.observations.length : 0,
                        alerts: Array.isArray(el.alerts) ? el.alerts.length : 0,
                    },
                }) as any,
        );
}
