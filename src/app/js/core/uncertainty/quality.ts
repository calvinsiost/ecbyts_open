// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import { isUValue, toRelative, type UValue } from './primitive.js';
import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

export type UncertaintyBadgeClass = 'green' | 'yellow' | 'red' | 'grey';

export interface QualityMetrics {
    value: number;
    u: number | null;
    k: number;
    ci95: [number | null, number | null];
    detectRate: number;
    outlierCount: number;
    mixedSources: boolean;
    method: 'gum' | 'partial';
    provenance: string[];
}

interface BadgeQualityInput {
    value?: unknown;
    u?: unknown;
    method?: unknown;
    mixedSources?: unknown;
}

function isRecord(input: unknown): input is Record<string, unknown> {
    return input != null && typeof input === 'object';
}

function toBadgeQualityInput(input: unknown): BadgeQualityInput | null {
    if (!isRecord(input)) return null;
    return input;
}

export function aggregateQuality(
    inputs: ReadonlyArray<unknown> | null | undefined,
    value: number,
    uAbs: number | null,
): QualityMetrics {
    const rows = (inputs || []).filter(isUValue);
    const withUnc = rows.filter((r: UValue) => r.u != null && Number.isFinite(r.u) && r.u >= 0);
    const detectRate = rows.length > 0 ? withUnc.length / rows.length : 0;
    const mixedSources = withUnc.length !== rows.length;
    const method = mixedSources ? 'partial' : 'gum';
    const u = Number.isFinite(uAbs) ? Number(uAbs) : null;
    const ci95: [number | null, number | null] = u == null ? [null, null] : [value - 2 * u, value + 2 * u];

    return {
        value: toFiniteNumber(value, 0),
        u,
        k: 2,
        ci95,
        detectRate,
        outlierCount: 0,
        mixedSources,
        method,
        provenance: ['eis-calculator'],
    };
}

export function classifyBadge(qm: unknown): UncertaintyBadgeClass {
    const metrics = toBadgeQualityInput(qm);
    if (!metrics || metrics.u == null) return 'grey';
    if (metrics.method === 'partial' || metrics.mixedSources === true) return 'grey';

    const rel = toRelative({ value: metrics.value, u: metrics.u, k: 2, type: 'absolute' });
    if (rel == null || !Number.isFinite(rel)) return 'grey';
    if (rel <= 10) return 'green';
    if (rel <= 25) return 'yellow';
    return 'red';
}
