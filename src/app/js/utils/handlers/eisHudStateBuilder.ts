// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export interface CollectHudScoresOpts {
    axes?: unknown[];
    isDashboardOpen?: boolean;
    cachedAutoResults?: Record<string, unknown>;
    autoEnabled?: Record<string, unknown>;
    fallbackHudScores?: Record<string, unknown>;
    getStandardSliderValue?: (axis: string, fallback: number) => number;
    computeClosedDashboardScores?: (fallbackHudScores: Record<string, unknown>) => Record<string, unknown>;
}

export interface ComputeHudVisualizationStateOpts {
    currentMode?: string;
    isDashboardOpen?: boolean;
    activeCustomProfile?: {
        axes?: Array<{
            id: string;
            enabled?: boolean;
            weight: number;
        }>;
    } | null;
    axes?: string[];
    scores?: Record<string, unknown>;
    multiplier?: number;
    calculator: {
        calculate: (
            scores: Record<string, unknown>,
            mode: string,
            type: string,
            multiplier: number,
        ) => { eis: number; adjustedScores: Record<string, unknown> };
        calculateCustom: (
            axisScores: Record<string, number>,
            axisWeights: Record<string, number>,
        ) => { eis: number };
    };
    getCustomSliderValue?: (axisId: string, fallback: number) => number;
    logDebug?: (message: string, errorMsg?: unknown) => void;
}

export interface HudVisualizationState {
    eisScore: number;
    adjustedScores: Record<string, unknown>;
}

export function collectHudScores(opts: CollectHudScoresOpts): Record<string, unknown> {
    const {
        axes = [],
        isDashboardOpen = false,
        cachedAutoResults = {},
        autoEnabled = {},
        fallbackHudScores = {},
        getStandardSliderValue,
        computeClosedDashboardScores,
    } = opts;

    if (isDashboardOpen) {
        const scores: Record<string, unknown> = {};
        for (const axis of axes) {
            const axisKey = String(axis);
            const autoResult = (cachedAutoResults as Record<string, unknown>)[axisKey];
            if (autoEnabled[axisKey] && autoResult && typeof autoResult === 'object' && autoResult !== null && 'score' in autoResult) {
                scores[axisKey] = (autoResult as { score: unknown }).score;
            } else {
                const fallbackValue = (fallbackHudScores as Record<string, unknown>)[axisKey] ?? 3;
                scores[axisKey] = getStandardSliderValue?.(axisKey, Number(fallbackValue)) ?? 3;
            }
        }
        return scores;
    }

    return computeClosedDashboardScores?.(fallbackHudScores) || { ...fallbackHudScores };
}

export function computeHudVisualizationState(opts: ComputeHudVisualizationStateOpts): HudVisualizationState {
    const {
        currentMode = 'geometric',
        isDashboardOpen = false,
        activeCustomProfile = null,
        axes = [],
        scores = {},
        multiplier = 1,
        calculator,
        getCustomSliderValue,
        logDebug,
    } = opts;

    let eisScore = 3.0;
    let adjustedScores: Record<string, unknown> = { ...scores };
    const effectiveMode = currentMode === 'custom' ? 'geometric' : currentMode;

    try {
        if (
            currentMode === 'custom' &&
            isDashboardOpen &&
            activeCustomProfile &&
            (activeCustomProfile.axes?.length ?? 0) >= 2
        ) {
            const axisScores: Record<string, number> = {};
            const axisWeights: Record<string, number> = {};
            const enabledAxes = activeCustomProfile.axes!.filter(
                (axis) => axis?.enabled !== false,
            );

            for (const axis of enabledAxes) {
                axisScores[axis.id] = getCustomSliderValue?.(axis.id, 3) ?? 3;
                axisWeights[axis.id] = axis.weight;
            }

            if (enabledAxes.length >= 2) {
                const result = calculator.calculateCustom(axisScores, axisWeights);
                eisScore = result.eis;
                adjustedScores = { ...adjustedScores };
                for (const axis of axes) {
                    adjustedScores[axis] = eisScore;
                }
                return { eisScore, adjustedScores };
            }
        }

        const result = calculator.calculate(scores, effectiveMode, 'common', multiplier);
        eisScore = result.eis;
        adjustedScores = result.adjustedScores;
    } catch (error) {
        logDebug?.('EIS validation error ignored', (error as Error)?.message);
    }

    return { eisScore, adjustedScores };
}