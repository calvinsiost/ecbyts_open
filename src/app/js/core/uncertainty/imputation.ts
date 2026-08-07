// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import { chooseNDMethod } from './matrix.js';

function _toNumber(v: any): number | null {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function _extractDetectionLimit(obs: any): number | null {
    return (
        _toNumber(obs?.detection_limit) ??
        _toNumber(obs?.detectionLimit) ??
        _toNumber(obs?.dl) ??
        _toNumber(obs?.limit) ??
        null
    );
}

function _extractValue(obs: any): number | null {
    return _toNumber(obs?.value);
}

function _median(nums: any): number | null {
    if (!nums.length) return null;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function _geometricMean(nums: any): number | null {
    const valid = nums.filter((n: any) => Number.isFinite(n as any) && n > 0);
    if (!valid.length) return null;
    const logMean =
        valid.reduce((s: any, n: any) => s + Math.log(n as any), 0) / valid.length;
    return Math.exp(logMean);
}

function _imputeSingle(dl: any, method: any, detected: any): number | null {
    const safeDl = Number.isFinite(dl) && dl > 0 ? dl : null;
    if (!safeDl) return null;

    if (method === 'ros') {
        const g = _geometricMean(detected) as number;
        if (Number.isFinite(g) && g > 0) return Math.max(0, Math.min(safeDl * 0.95, g * 0.5));
        return safeDl * 0.7;
    }
    if (method === 'km') {
        const med = _median(detected);
        if (Number.isFinite(med) && (med as number) > 0)
            return Math.max(0, Math.min(safeDl * 0.9, (med as number) * 0.5));
        return safeDl * 0.6;
    }
    return safeDl * 0.5;
}

/**
 * Impute non-detect series with matrix-aware policy.
 * @param observations
 * @param opts
 */
export function imputeNonDetectSeries(
    observations: Array<object>,
    opts: { method?: 'auto' | 'half-dl' | 'km' | 'ros'; matrix?: string } = {},
) {
    const rows = Array.isArray(observations) ? observations : [];
    const detected: any[] = [];
    let nonDetects = 0;

    for (const obs of rows) {
        const v = _extractValue(obs);
        const dl = _extractDetectionLimit(obs) as number;
        if (Number.isFinite(v)) {
            detected.push(v);
        } else if (Number.isFinite(dl) && dl > 0) {
            nonDetects += 1;
        }
    }

    const total = rows.length;
    const detects = detected.length;
    const detectRate = total > 0 ? detects / total : 0;
    const method = chooseNDMethod({
        matrix: opts.matrix,
        detectRate,
        preferredMethod: opts.method || 'auto',
    });

    const values = rows.map((obs) => {
        const rawValue = _extractValue(obs);
        const dl = _extractDetectionLimit(obs);

        if (Number.isFinite(rawValue)) {
            return {
                value: rawValue,
                imputed: false,
                method: 'observed',
                detectionLimit: Number.isFinite(dl) ? dl : null,
            };
        }

        const imputedValue = _imputeSingle(dl, method, detected);
        if (Number.isFinite(imputedValue)) {
            return {
                value: imputedValue,
                imputed: true,
                method,
                detectionLimit: dl,
            };
        }

        return {
            value: 0,
            imputed: false,
            method: 'missing',
            detectionLimit: Number.isFinite(dl) ? dl : null,
        };
    });

    return {
        values,
        stats: {
            total,
            detects,
            nonDetects,
            detectRate,
            methodUsed: method,
            matrix: opts.matrix || 'default',
        },
    };
}
