// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * bottomPanelSchema.js - UI-BOTTOM-001
 * Bottom Panel standardization: tab registry, config model, serialize/deserialize.
 *
 * Modulo puro (sem dependencias de browser/DOM). Pode ser importado em Node
 * para testes cheap sem nenhum stub.
 */

// ---------------------------------------------------------------------------
// Tab registry
// ---------------------------------------------------------------------------

/**
 * Canonical tab identifiers for the bottom panel (#constellation-hud).
 */
export const BOTTOM_PANEL_TABS = Object.freeze({
    CONSTELLATION: 'constellation',
    TIMELINE: 'timeline',
    ANALYTICS: 'analytics',
    LOGS: 'logs',
} as const);

export type BottomPanelTab = (typeof BOTTOM_PANEL_TABS)[keyof typeof BOTTOM_PANEL_TABS];

const VALID_TABS = new Set<string>(Object.values(BOTTOM_PANEL_TABS));

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

export interface PanelConfig {
    activeTab: BottomPanelTab;
    height: number;
    minHeight: number;
    maxHeight: number;
    collapsed: boolean;
}

/**
 * Default bottom panel configuration.
 * Height values are in pixels; align with constellation.css custom properties.
 */
export const DEFAULT_PANEL_CONFIG = Object.freeze({
    activeTab: BOTTOM_PANEL_TABS.CONSTELLATION,
    height: 120,
    minHeight: 80,
    maxHeight: 500,
    collapsed: false,
}) satisfies Readonly<PanelConfig>;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

// ---------------------------------------------------------------------------
// createPanelConfig
// ---------------------------------------------------------------------------

/**
 * Cria um PanelConfig fazendo merge com DEFAULT_PANEL_CONFIG.
 * Apos merge, o height e clamped ao intervalo [minHeight, maxHeight].
 */
export function createPanelConfig(overrides: Partial<PanelConfig> = {}): PanelConfig {
    const merged: PanelConfig = { ...DEFAULT_PANEL_CONFIG, ...overrides };

    // Resolve min/max first (overrides may change them)
    const minH = typeof merged.minHeight === 'number' ? merged.minHeight : DEFAULT_PANEL_CONFIG.minHeight;
    const maxH = typeof merged.maxHeight === 'number' ? merged.maxHeight : DEFAULT_PANEL_CONFIG.maxHeight;

    // Clamp height to [minHeight, maxHeight]
    const clampedMin = Math.min(minH, maxH); // guard against inverted range
    const clampedMax = Math.max(minH, maxH);
    merged.height = Math.max(clampedMin, Math.min(clampedMax, merged.height));
    merged.minHeight = clampedMin;
    merged.maxHeight = clampedMax;

    return merged;
}

// ---------------------------------------------------------------------------
// validatePanelConfig
// ---------------------------------------------------------------------------

/**
 * Valida um PanelConfig e retorna erros descritivos.
 */
export function validatePanelConfig(config: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!isObjectRecord(config)) {
        return { valid: false, errors: ['config must be a non-null object'] };
    }

    // activeTab
    if (!VALID_TABS.has(String(config.activeTab))) {
        errors.push(`activeTab "${String(config.activeTab)}" is not a valid BOTTOM_PANEL_TABS value`);
    }

    // height
    if (typeof config.height !== 'number' || !Number.isFinite(config.height)) {
        errors.push('height must be a finite number');
    } else {
        const min = typeof config.minHeight === 'number' ? config.minHeight : DEFAULT_PANEL_CONFIG.minHeight;
        const max = typeof config.maxHeight === 'number' ? config.maxHeight : DEFAULT_PANEL_CONFIG.maxHeight;
        if (config.height < min) {
            errors.push(`height ${config.height} is below minHeight ${min}`);
        }
        if (config.height > max) {
            errors.push(`height ${config.height} exceeds maxHeight ${max}`);
        }
    }

    // minHeight / maxHeight
    if (typeof config.minHeight !== 'number' || !Number.isFinite(config.minHeight) || config.minHeight < 0) {
        errors.push('minHeight must be a non-negative finite number');
    }
    if (typeof config.maxHeight !== 'number' || !Number.isFinite(config.maxHeight) || config.maxHeight < 0) {
        errors.push('maxHeight must be a non-negative finite number');
    }
    if (
        typeof config.minHeight === 'number' &&
        typeof config.maxHeight === 'number' &&
        config.minHeight > config.maxHeight
    ) {
        errors.push(`minHeight ${config.minHeight} must not exceed maxHeight ${config.maxHeight}`);
    }

    // collapsed
    if (typeof config.collapsed !== 'boolean') {
        errors.push('collapsed must be a boolean');
    }

    return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// serializePanelConfig / deserializePanelConfig
// ---------------------------------------------------------------------------

/**
 * Serializa um PanelConfig para string JSON.
 */
export function serializePanelConfig(config: PanelConfig): string {
    return JSON.stringify(config);
}

/**
 * Desserializa uma string JSON para PanelConfig.
 * Retorna DEFAULT_PANEL_CONFIG em caso de erro de parsing ou dado invalido.
 */
export function deserializePanelConfig(str: string): PanelConfig {
    try {
        const parsed = JSON.parse(str) as unknown;
        const { valid } = validatePanelConfig(parsed);
        if (!valid) {
            return { ...DEFAULT_PANEL_CONFIG };
        }
        return parsed as PanelConfig;
    } catch {
        return { ...DEFAULT_PANEL_CONFIG };
    }
}
