// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   BASEMAP REGISTRY — SPEC_TIER2_FEATURES §M1

   Registry pure de basemap providers (XYZ/WMS) organizados em grupos.
   Persistência + switching de layer Leaflet ficam no handler.

   Grupos §M1:
   - cartographic (OpenStreetMap, CartoDB)
   - satellite (ESRI, Bing)
   - orthophoto (IBGE, custom WMS)
   - custom (user-added)
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §M1
// ──────────────────────────────────────────────────────────────────────

export const BASEMAP_GROUPS = Object.freeze([
    'cartographic',
    'satellite',
    'orthophoto',
    'custom',
] as const);

export const BASEMAP_TYPES = Object.freeze(['xyz', 'wms'] as const);

export type BasemapGroup = (typeof BASEMAP_GROUPS)[number];
export type BasemapType = (typeof BASEMAP_TYPES)[number];

export interface BasemapProvider {
    readonly id: string;
    readonly label: string;
    readonly group: BasemapGroup;
    readonly type: BasemapType;
    readonly url: string;
    readonly attribution?: string;
    readonly maxZoom?: number;
}

export interface ValidationResult {
    readonly valid: boolean;
    readonly errors: string[];
}

export interface RegisterResult {
    readonly ok: boolean;
    readonly reason?: string;
}

export type BasemapRegistry = Map<string, BasemapProvider>;

// Default providers shipping com o app (CC BY atribuídos; ver LICENSE)
export const DEFAULT_PROVIDERS: readonly BasemapProvider[] = Object.freeze([
    Object.freeze({
        id: 'osm',
        label: 'OpenStreetMap',
        group: 'cartographic' as BasemapGroup,
        type: 'xyz' as BasemapType,
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
    }),
    Object.freeze({
        id: 'carto-light',
        label: 'Carto Positron (light)',
        group: 'cartographic' as BasemapGroup,
        type: 'xyz' as BasemapType,
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attribution: '© CARTO © OpenStreetMap',
        maxZoom: 19,
    }),
    Object.freeze({
        id: 'esri-satellite',
        label: 'ESRI World Imagery',
        group: 'satellite' as BasemapGroup,
        type: 'xyz' as BasemapType,
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '© ESRI',
        maxZoom: 19,
    }),
]);

// ──────────────────────────────────────────────────────────────────────
// Provider validation helpers
// ──────────────────────────────────────────────────────────────────────

function isValidBasemapGroup(group: string | undefined): group is BasemapGroup {
    return typeof group === 'string' && (BASEMAP_GROUPS as readonly string[]).includes(group);
}

function isValidBasemapType(type: string | undefined): type is BasemapType {
    return typeof type === 'string' && (BASEMAP_TYPES as readonly string[]).includes(type);
}

function validateProviderUrl(url: unknown, errors: string[]): void {
    if (!url || typeof url !== 'string') {
        errors.push('url required');
    } else if (!/^https?:\/\//.test(url)) {
        errors.push('url must be http(s)://');
    }
}

function validateProviderMaxZoom(maxZoom: number | undefined, errors: string[]): void {
    if (
        maxZoom != null &&
        (!Number.isFinite(maxZoom) || maxZoom < 0 || maxZoom > 22)
    ) {
        errors.push('maxZoom must be 0..22');
    }
}

// ──────────────────────────────────────────────────────────────────────
// Provider validation
// ──────────────────────────────────────────────────────────────────────

export function validateProvider(provider: unknown): ValidationResult {
    if (!provider || typeof provider !== 'object') {
        return { valid: false, errors: ['not object'] };
    }
    const errors: string[] = [];
    const p = provider as Partial<BasemapProvider>;
    if (!p.id || typeof p.id !== 'string') errors.push('id required');
    if (!p.label) errors.push('label required');
    if (!isValidBasemapGroup(p.group)) {
        errors.push(`group must be one of: ${BASEMAP_GROUPS.join(', ')}`);
    }
    if (!isValidBasemapType(p.type)) {
        errors.push(`type must be one of: ${BASEMAP_TYPES.join(', ')}`);
    }
    validateProviderUrl(p.url, errors);
    validateProviderMaxZoom(p.maxZoom, errors);
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Registry factory (pure — não mantém state global)
// ──────────────────────────────────────────────────────────────────────

/**
 * Cria novo registry com providers default.
 */
export function createRegistry(): BasemapRegistry {
    const reg: BasemapRegistry = new Map();
    for (const p of DEFAULT_PROVIDERS) reg.set(p.id, p);
    return reg;
}

/**
 * Registra provider customizado.
 */
export function registerProvider(registry: BasemapRegistry, provider: BasemapProvider): RegisterResult {
    if (!(registry instanceof Map)) return { ok: false, reason: 'invalid_registry' };
    const check = validateProvider(provider);
    if (!check.valid) return { ok: false, reason: check.errors.join('; ') };
    if (registry.has(provider.id)) return { ok: false, reason: 'id_exists' };
    registry.set(provider.id, Object.freeze({ ...provider }));
    return { ok: true };
}

export function listProvidersByGroup(registry: BasemapRegistry, groupId: string): BasemapProvider[] {
    if (!(registry instanceof Map)) return [];
    if (!(BASEMAP_GROUPS as readonly string[]).includes(groupId)) return [];
    return [...registry.values()].filter((p) => p.group === groupId);
}

export function groupedProviders(registry: BasemapRegistry): Record<string, BasemapProvider[]> {
    const out: Record<string, BasemapProvider[]> = {};
    for (const g of BASEMAP_GROUPS) out[g] = [];
    if (!(registry instanceof Map)) return out;
    for (const p of registry.values()) {
        const bucket = out[p.group];
        if (bucket) bucket.push(p);
    }
    return out;
}

/**
 * Remove provider (apenas custom — defaults são protegidos).
 */
export function unregisterProvider(registry: BasemapRegistry, id: string): boolean {
    if (!(registry instanceof Map)) return false;
    const p = registry.get(id);
    if (!p) return false;
    if (p.group !== 'custom') return false; // defaults protegidos
    return registry.delete(id);
}
