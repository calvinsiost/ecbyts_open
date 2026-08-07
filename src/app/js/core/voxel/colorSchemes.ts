// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * VOXEL COLOR SCHEMES — Zone definitions and color palettes.
 *
 * Pure-logic registry of voxelization zones (no DOM, no I/O). Each zone
 * carries a numeric id, a textual tag, an optional UI label, a CSS/THREE
 * color expression and an opacity used by the renderer. ID 0 is reserved
 * for "empty" voxels (above the terrain surface).
 *
 * Reference: docs/specs/features/SPEC_VOXEL_PIPELINE.md
 */

export type ZoneColor = string | number | null;

export interface ZoneConfig {
    readonly id: number;
    readonly tag: string;
    readonly label: string | null;
    readonly color: ZoneColor;
    readonly opacity: number;
}

export interface ZoneDescriptor {
    readonly id: number;
    readonly tag: string;
    readonly label: string | null;
    readonly color: ZoneColor;
}

// ----------------------------------------------------------------
// GEOLOGY SCHEME — Zone registry
// ----------------------------------------------------------------

const _zoneRegistry = new Map<number, ZoneConfig>([
    [0, { id: 0, tag: 'empty', label: null, color: null, opacity: 0 }],
    [1, { id: 1, tag: 'vadose', label: 'Zona Vadosa', color: '#D2691E', opacity: 0.55 }],
    [2, { id: 2, tag: 'saturated', label: 'Zona Saturada', color: '#1E90FF', opacity: 0.65 }],
    [3, { id: 3, tag: 'confining', label: 'Camada Confinante', color: '#7C5D3B', opacity: 0.6 }],
    [4, { id: 4, tag: 'bedrock', label: 'Rocha', color: '#6B7280', opacity: 0.7 }],
    [5, { id: 5, tag: 'contaminated', label: 'Contaminado', color: '#DC2626', opacity: 0.7 }],
    [6, { id: 6, tag: 'remediation', label: 'Remediacao', color: '#10B981', opacity: 0.65 }],
    [7, { id: 7, tag: 'lake_epi', label: 'Epilimnio', color: '#60A5FA', opacity: 0.6 }],
    [8, { id: 8, tag: 'lake_meta', label: 'Metalimnio', color: '#2563EB', opacity: 0.65 }],
    [9, { id: 9, tag: 'lake_hypo', label: 'Hipolimnio', color: '#1E3A8A', opacity: 0.7 }],
]);

/**
 * Zone definitions for subsurface geology, keyed by id, exposed as a
 * read-only ordered list (excludes opacity for legacy compatibility).
 */
export const GEOLOGY_ZONES: ReadonlyArray<ZoneDescriptor> = Array.from(_zoneRegistry.values()).map((z) => ({
    id: z.id,
    tag: z.tag,
    label: z.label,
    color: z.color,
}));

/**
 * Hex color values for Three.js materials (legacy compatibility).
 */
export const ZONE_COLORS: Readonly<Record<string, number>> = {
    vadose: 0xd2691e,
    saturated: 0x1e90ff,
};

/**
 * Default opacity per zone (legacy compatibility).
 */
export const ZONE_OPACITY: Readonly<Record<string, number>> = {
    vadose: 0.55,
    saturated: 0.65,
};

/**
 * Register or update a zone in the runtime registry. Idempotent.
 */
export function registerZone(
    id: number,
    tag: string,
    label: string | null,
    color: ZoneColor,
    opacity: number = 0.65,
): void {
    const numericId = Number(id);
    _zoneRegistry.set(numericId, { id: numericId, tag, label, color, opacity });
}

/**
 * Get a zone config by numeric id, or `null` if no such zone is registered.
 */
export function getZoneConfig(id: number): ZoneConfig | null {
    return _zoneRegistry.get(Number(id)) ?? null;
}

/**
 * List all registered zone configs in insertion order.
 */
export function getAllZoneConfigs(): ReadonlyArray<ZoneConfig> {
    return Array.from(_zoneRegistry.values());
}
