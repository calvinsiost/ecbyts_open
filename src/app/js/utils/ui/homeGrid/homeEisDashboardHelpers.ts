// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * homeEisDashboardHelpers.js - pure helpers for the Home EIS/Purpose dashboard.
 * Extracted per SPLIT-HOMEGRID-001 S4.
 */

import { resolveEisVerdict as _gridResolveEisVerdict } from './_gridStatsPure.js';

export const EIS_AXIS_NAMES = Object.freeze({
    T: 'Transparency',
    A: 'Accuracy',
    Cp: 'Completeness',
    Ty: 'Timeliness',
    Cs: 'Consistency',
    Cm: 'Comparability',
});

export function resolveEisVerdict(score: any, labels: any = {}) {
    // Single source of truth: a lógica pura _gridStatsPure (ARCH-SPLIT-HOMEGRID-001
    // S4). Mantém a forma pública legada `{ color, label }` que os renderers
    // consomem — comportamento idêntico aos thresholds 0-5 originais.
    const v = _gridResolveEisVerdict(score, labels);
    return { color: v.eisColor, label: v.eisLabel };
}

export function buildEisAxes(eisRaw: any, axisNames: any = EIS_AXIS_NAMES) {
    const axes = eisRaw?.axes && typeof eisRaw.axes === 'object' ? eisRaw.axes : {};
    return Object.entries(axes).map(([key, score]: [string, any]) => ({
        key,
        name: (axisNames as Record<string, string>)[key] || key,
        score: Number.isFinite(score) ? score : 0,
        percent: Math.max(0, Math.min(100, ((Number.isFinite(score) ? score : 0) / 5) * 100)),
    }));
}

export function buildScopeAttentionItems(scopeResults: any) {
    if (!scopeResults || typeof scopeResults[Symbol.iterator] !== 'function') return [];

    let lowestCnpj = null;
    let lowestArea = null;
    for (const [, result] of scopeResults) {
        if (!result?.scope) continue;
        const score = result.scope.type === 'area' && result.areaEIS != null ? result.areaEIS : result.eis;
        if (!Number.isFinite(score)) continue;
        if (result.scope.type === 'cnpj' && (!lowestCnpj || score < lowestCnpj.score)) {
            lowestCnpj = {
                type: 'cnpj',
                score,
                name: result.scope.name || result.scope.cnpj || '-',
                verdict: result.verdict,
            };
        }
        if (result.scope.type === 'area' && (!lowestArea || score < lowestArea.score)) {
            lowestArea = {
                type: 'area',
                score,
                name: result.scope.name || '-',
                verdict: result.verdict,
            };
        }
    }

    return [lowestCnpj, lowestArea].filter((item: any) => item && item.score < 4.5);
}

/**
 * @param {{ snapshots?: any[], current?: any, delta?: any }} [opts]
 */
export function buildPurposeViewModel({ snapshots = [], current = {}, delta = {} }: any = {}) {
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
        return { state: 'empty' };
    }

    const deltaEis = Number.isFinite(delta.deltaEis) ? delta.deltaEis : 0;
    const finalScore = Number.isFinite(current.finalScore) ? current.finalScore : current.eis || 0;
    const baseScore = Number.isFinite(current.baseScore) ? current.baseScore : current.eis || 0;
    const governanceAdjustment = Number.isFinite(current.governanceAdjustment) ? current.governanceAdjustment : 0;
    const confidence = current.confidence || null;
    const verdict = resolveEisVerdict(finalScore);
    const changedAxes = Object.entries(delta.deltaAxes || {})
        .filter(([, value]: [string, any]) => value !== 0)
        .map(([key, value]: [string, any]) => ({
            key,
            value,
            label: `${key} ${value > 0 ? '+' : ''}${Number(value).toFixed(1)}`,
        }));

    return {
        state: 'trending',
        finalScore,
        baseScore,
        governanceAdjustment,
        adjustmentLabel: `${governanceAdjustment >= 0 ? '+' : ''}${governanceAdjustment.toFixed(2)}`,
        confidenceLabel: confidence ? `${Math.round(confidence.score * 100)}% ${confidence.level}` : 'n/a',
        verdictColor: verdict.color,
        deltaEis,
        arrow: deltaEis > 0 ? '&#9650;' : deltaEis < 0 ? '&#9660;' : '=',
        sign: deltaEis > 0 ? '+' : '',
        deltaClass:
            deltaEis > 0
                ? 'purpose-status-delta-positive'
                : deltaEis < 0
                  ? 'purpose-status-delta-negative'
                  : 'purpose-status-delta-neutral',
        sparkData: snapshots
            .slice(-30)
            .map((snapshot: any) => (Number.isFinite(snapshot.finalEis) ? snapshot.finalEis : snapshot.eis)),
        changedAxes,
    };
}

export function getSparklinePoints(data: any, width: any, height: any) {
    if (!Array.isArray(data) || data.length < 2 || width <= 0 || height <= 0) return [];
    const min = 0;
    const max = 5;
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    return data.map((value: any, index: any) => ({
        x: index * stepX,
        y: height - ((value - min) / range) * (height - 4) - 2,
    }));
}
