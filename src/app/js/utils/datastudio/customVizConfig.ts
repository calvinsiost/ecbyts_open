// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * customVizConfig.ts — Phase 2 TS source for Data Studio Custom Visualization (P1-43).
 * Promotes @typedef CustomVizConfig to exported interface.
 */

export const VIZ_TYPES = {
    BAR: 'bar',
    LINE: 'line',
    SCATTER: 'scatter',
    BOX: 'box',
    HEATMAP: 'heatmap',
    RIDGELINE: 'ridgeline',
} as const;

export type VizType = (typeof VIZ_TYPES)[keyof typeof VIZ_TYPES];

export const DEFAULT_VIZ_OPTIONS: Record<string, Record<string, unknown>> = {
    [VIZ_TYPES.BAR]: { orientation: 'vertical', showValues: false, colorScheme: 'default' },
    [VIZ_TYPES.LINE]: { interpolation: 'linear', showPoints: true, colorScheme: 'default' },
    [VIZ_TYPES.SCATTER]: { pointSize: 4, showTrend: false, colorScheme: 'default' },
    [VIZ_TYPES.BOX]: { showOutliers: true, whiskerType: 'iqr', colorScheme: 'default' },
    [VIZ_TYPES.HEATMAP]: { colorScale: 'blues', showLabels: false, colorScheme: 'default' },
    [VIZ_TYPES.RIDGELINE]: { bandwidth: 'auto', overlap: 0.5, colorScheme: 'default' },
};

export interface CustomVizConfig {
    id: string;
    type: string;
    title: string;
    xField: string;
    yField: string;
    groupField: string | null;
    options: Record<string, unknown>;
}

export interface CreateCustomVizConfigParams {
    id?: string;
    type: string;
    title?: string;
    xField?: string;
    yField?: string;
    groupField?: string;
    options?: Record<string, unknown>;
}

export function createCustomVizConfig({
    id,
    type,
    title,
    xField,
    yField,
    groupField,
    options = {},
}: CreateCustomVizConfigParams = {} as CreateCustomVizConfigParams): CustomVizConfig {
    if (!Object.values(VIZ_TYPES).includes(type as VizType)) {
        throw new Error('Invalid viz type: ' + type);
    }
    const defaults = DEFAULT_VIZ_OPTIONS[type] ?? {};
    return {
        id: id ?? crypto.randomUUID(),
        type,
        title: String(title ?? ''),
        xField: String(xField ?? ''),
        yField: String(yField ?? ''),
        groupField: groupField ? String(groupField) : null,
        options: { ...defaults, ...options },
    };
}

export function updateVizOptions(config: CustomVizConfig, newOptions: Record<string, unknown>): CustomVizConfig {
    return { ...config, options: { ...config.options, ...newOptions } };
}

export function getVizDefaults(type: string): Record<string, unknown> {
    return { ...(DEFAULT_VIZ_OPTIONS[type] ?? {}) };
}
