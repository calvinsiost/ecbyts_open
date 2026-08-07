// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ACTIONS V2 LAYOUT — SPEC_ACTIONS_PAGE_V2_COMPLEMENT

   Pure helpers para padrão de layout Z1/Z2/Z3/Z4:
   - Z1: Sidebar esquerda (toolbar + árvore + rail)
   - Z2: Conteúdo principal tabbed (Actions dashboard + object tabs)
   - Z3: Grafo relacional (premium/progressive)
   - Z4: Painel contextual direito

   HTML/CSS render em handler. Core só decide:
   - modo (Actions dashboard vs object detail)
   - visibility de zonas por viewport/tier
   - sync Z2 ↔ Z4
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

export const ZONES = Object.freeze({
    Z1: 'z1_sidebar',
    Z2: 'z2_main',
    Z3: 'z3_graph',
    Z4: 'z4_context',
});

export const LAYOUT_MODES = Object.freeze({
    ACTIONS_DASHBOARD: 'actions_dashboard', // estado inicial launchpad
    OBJECT_DETAIL: 'object_detail', // quando um objeto está aberto em Z2
    SPATIAL: 'spatial', // 2D/3D/Iso view
});

export const VIEWPORT_BUCKETS = Object.freeze({
    DESKTOP: 'desktop', // ≥1280px
    TABLET: 'tablet', // 768-1279
    MOBILE: 'mobile', // <768
});

export const TIERS = Object.freeze(['free', 'premium', 'enterprise']);

// Z3 é premium (§2 objetivo "camada premium/progressiva")
const Z3_PREMIUM_TIERS = new Set(['premium', 'enterprise']);

// ──────────────────────────────────────────────────────────────────────
// Viewport resolver
// ──────────────────────────────────────────────────────────────────────

/**
 * @param widthPx
 */
export function resolveViewport(widthPx: number): string {
    if (!Number.isFinite(widthPx)) return VIEWPORT_BUCKETS.DESKTOP;
    if (widthPx >= 1280) return VIEWPORT_BUCKETS.DESKTOP;
    if (widthPx >= 768) return VIEWPORT_BUCKETS.TABLET;
    return VIEWPORT_BUCKETS.MOBILE;
}

// ──────────────────────────────────────────────────────────────────────
// Zone visibility
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide quais zonas mostrar dado mode + viewport + tier + user prefs.
 *
 * Regras:
 * - Z2 sempre visível (conteúdo principal)
 * - Z1 default open em desktop, collapsed em tablet, hidden em mobile
 * - Z4 default open em desktop, collapsed em tablet, hidden em mobile
 * - Z3 só disponível para premium+ E em desktop (§3 Q3)
 */
export function computeZoneVisibility(
    params: {
        mode?: string;
        viewport?: string;
        tier?: string;
        userPrefs?: Record<string, any>;
    } = {},
): {
    z1Visible: boolean;
    z1Collapsed: boolean;
    z2Visible: boolean;
    z3Available: boolean;
    z3Visible: boolean;
    z4Visible: boolean;
    z4Collapsed: boolean;
} {
    const mode = params.mode || LAYOUT_MODES.ACTIONS_DASHBOARD;
    const viewport = params.viewport || VIEWPORT_BUCKETS.DESKTOP;
    const tier = params.tier || 'free';
    const prefs = params.userPrefs || {};

    const isMobile = viewport === VIEWPORT_BUCKETS.MOBILE;
    const isTablet = viewport === VIEWPORT_BUCKETS.TABLET;

    // Z1 - sidebar esquerda
    const z1Visible = !isMobile;
    const z1Collapsed = isTablet ? true : (prefs.z1Collapsed ?? false);

    // Z2 - sempre visível (conteúdo principal)
    const z2Visible = true;

    // Z3 - premium+ + desktop
    const z3Available = Z3_PREMIUM_TIERS.has(tier) && viewport === VIEWPORT_BUCKETS.DESKTOP;
    const z3Visible = z3Available && prefs.z3Visible === true; // opt-in explícito

    // Z4 - painel contextual direito
    const z4Visible = !isMobile && mode !== LAYOUT_MODES.ACTIONS_DASHBOARD;
    // Actions dashboard default não precisa de Z4; object detail precisa
    const z4Collapsed = isTablet ? true : (prefs.z4Collapsed ?? false);

    return {
        z1Visible,
        z1Collapsed,
        z2Visible,
        z3Available,
        z3Visible,
        z4Visible,
        z4Collapsed,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Mode resolver
// ──────────────────────────────────────────────────────────────────────

/**
 * Resolve modo baseado em state atual.
 *
 * @param state - { activeObject, spatialView, actionsOnly }
 */
export function resolveLayoutMode(state: Record<string, any>): string {
    if (!state || typeof state !== 'object') return LAYOUT_MODES.ACTIONS_DASHBOARD;
    if (state.spatialView && ['2d', '3d', 'iso', '2.5d'].includes(state.spatialView)) {
        return LAYOUT_MODES.SPATIAL;
    }
    if (state.activeObject && state.activeObject.id) return LAYOUT_MODES.OBJECT_DETAIL;
    return LAYOUT_MODES.ACTIONS_DASHBOARD;
}

// ──────────────────────────────────────────────────────────────────────
// Z2 ↔ Z4 sync (§T2/T3 "objeto aberto em Z2 sincroniza Z4 sempre")
// ──────────────────────────────────────────────────────────────────────

/**
 * Sincroniza state Z4 a partir de objeto ativo em Z2.
 *
 * @param activeObject - { id, type, metadata, related, status }
 */
export function syncZ4FromActiveObject(activeObject: Record<string, any>): {
    visible: boolean;
    object: object | null;
    panels: string[];
} {
    if (!activeObject || !activeObject.id) {
        return { visible: false, object: null, panels: [] };
    }
    // Panels canônicos em Z4 (§3 Q4 contexto lateral e metadados)
    const panels = ['metadata', 'related', 'status'];
    return {
        visible: true,
        object: activeObject,
        panels,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Tier gating (§T2 "freemium oculta premium sem quebrar")
// ──────────────────────────────────────────────────────────────────────

/**
 * Verifica se um recurso está disponível para um tier.
 *
 * @param feature - 'z3_graph' | 'advanced_filters' etc
 * @param tier
 */
export function isFeatureAvailable(feature: string, tier: string): boolean {
    if (!tier || !TIERS.includes(tier)) return false;
    if (feature === 'z3_graph') return Z3_PREMIUM_TIERS.has(tier);
    // Default: disponível para todos
    return true;
}

/**
 * Lista features premium upsell para mostrar ao usuário free.
 * @param tier
 */
export function getUpsellFeatures(tier: string): string[] {
    if (tier === 'free') return ['z3_graph'];
    return [];
}
