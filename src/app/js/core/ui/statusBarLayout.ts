// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   STATUS BAR LAYOUT — SPEC_BOTTOM_PANEL_STANDARDIZATION (UI-BOTTOM-001)

   Pure helpers para layout zoneado do bottom panel em 3 zonas:
   - left: contexto do modelo (counters, save state, UTM zone)
   - center: progresso/purpose (EIS, credits, bounties)
   - right: sistema/diagnóstico (FPS, SAO, feedback) — collapsed by default

   HTML/CSS render fica em utils/handlers; core só classifica.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Zone definitions §Q3
// ──────────────────────────────────────────────────────────────────────

export const STATUS_ZONES = Object.freeze(['left', 'center', 'right']);

export const ITEM_ZONE_MAP = Object.freeze({
    // Model context - LEFT
    'status-elements': 'left',
    'status-families': 'left',
    'status-save-state': 'left',
    'status-zone': 'left',
    'status-model-id': 'left',
    // Progress/purpose - CENTER
    'status-eis': 'center',
    'status-credits': 'center',
    'status-bounties': 'center',
    // System/diagnostic - RIGHT (collapsed by default)
    'status-perf': 'right',
    'sao-status-badge': 'right',
    'feedback-mount-statusbar': 'right',
});

export const RIGHT_ZONE_COLLAPSED_DEFAULT = true;

export const SAVE_STATES = Object.freeze(['idle', 'saving', 'saved', 'error', 'offline']);
export const SAVE_STATE_COLORS = Object.freeze({
    idle: null,
    saving: '#eab308',
    saved: '#22c55e',
    error: '#ef4444',
    offline: '#64748b',
});

// Items que NÃO devem estar na status bar (§Q2)
export const EXILED_ITEMS = Object.freeze([
    'tabs-navigation', // → ribbon secundário
    'legal-terms', // → menu Ajuda
    'legal-privacy', // → menu Ajuda
    'disclaimer-footer', // → tooltip no header
]);

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida shape de status item.
 * @param {Record<string, any>} item
 * @returns {boolean}
 */
export function isValidStatusItem(item: Record<string, any>): boolean {
    return !!(item && typeof item === 'object' && typeof item.id === 'string' && item.id.length > 0);
}

/**
 * Verifica se um item deve ser excluído (exiled) da status bar.
 * @param {string} itemId
 * @returns {boolean}
 */
export function isExiledItem(itemId: string): boolean {
    return EXILED_ITEMS.includes(itemId);
}

// ──────────────────────────────────────────────────────────────────────
// Zone resolution
// ──────────────────────────────────────────────────────────────────────

/**
 * Resolve zona de um item por id. Items desconhecidos → null (não renderizar).
 * @param {string} itemId
 * @returns {string|null} 'left'|'center'|'right'|null
 */
export function getItemZone(itemId: string): string | null {
    if (typeof itemId !== 'string') return null;
    return (ITEM_ZONE_MAP as Record<string, any>)[itemId] || null;
}

// ──────────────────────────────────────────────────────────────────────
// Layout computation
// ──────────────────────────────────────────────────────────────────────

/**
 * Distribui items em zonas + overflow para itens desconhecidos/exiled.
 *
 * @param {Array<any>} items - com { id, ... }
 * @param {object} [opts]
 * @param {boolean} [opts.showRightZone]
 * @returns {{
 *   left: Array<any>,
 *   center: Array<any>,
 *   right: Array<any>,
 *   rightCollapsed: boolean,
 *   overflow: Array<any>,
 *   exiled: Array<any>
 * }}
 */
export function computeStatusBarLayout(
    items: Array<any>,
    opts: { showRightZone?: boolean } = {},
): {
    left: Array<any>;
    center: Array<any>;
    right: Array<any>;
    rightCollapsed: boolean;
    overflow: Array<any>;
    exiled: Array<any>;
} {
    const out: {
        left: any[];
        center: any[];
        right: any[];
        rightCollapsed: boolean;
        overflow: any[];
        exiled: any[];
    } = {
        left: [],
        center: [],
        right: [],
        rightCollapsed: !opts.showRightZone,
        overflow: [],
        exiled: [],
    };
    if (!Array.isArray(items)) return out;

    for (const item of items) {
        if (!isValidStatusItem(item)) continue;
        const it = item as any;
        if (isExiledItem(it.id)) {
            out.exiled.push(it);
            continue;
        }
        const zone = getItemZone(it.id);
        if (zone === 'left') out.left.push(it);
        else if (zone === 'center') out.center.push(it);
        else if (zone === 'right') out.right.push(it);
        else out.overflow.push(it);
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// Save state (§S3 indicador pill)
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida save state.
 * @param {string} state
 * @returns {boolean}
 */
export function isValidSaveState(state: string): boolean {
    return SAVE_STATES.includes(state);
}

/**
 * Resolve cor do save state indicator.
 * @param {string} state
 * @returns {string|null}
 */
export function resolveSaveStateColor(state: string): string | null {
    return (SAVE_STATE_COLORS as Record<string, any>)[state] || null;
}

// ──────────────────────────────────────────────────────────────────────
// Accessibility - zone labels §S1
// ──────────────────────────────────────────────────────────────────────

export const ZONE_ARIA_LABELS = Object.freeze({
    left: { pt: 'Modelo', en: 'Model', es: 'Modelo' },
    center: { pt: 'Progresso', en: 'Progress', es: 'Progreso' },
    right: { pt: 'Sistema', en: 'System', es: 'Sistema' },
});

/**
 * Aria-label para zona.
 * @param {string} zone
 * @param {string} [lang='pt']
 * @returns {string}
 */
export function getZoneAriaLabel(zone: string, lang = 'pt'): string {
    const labels = (ZONE_ARIA_LABELS as Record<string, Record<string, string>>)[zone];
    if (!labels) return '';
    return (labels[lang] || labels.pt) as string;
}
