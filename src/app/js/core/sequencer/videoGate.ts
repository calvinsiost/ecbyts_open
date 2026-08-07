// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

export interface VideoGenerationGateState {
    keyframeCount?: number;
    hasPrimaryKey?: boolean;
    hasRunwayKey?: boolean;
    generating?: boolean;
}

export interface VideoGenerationGateResult {
    canGenerate: boolean;
    reason: string | null;
}

/**
 * Pure readiness gate for timeline video generation.
 */
export function assessVideoGenerationGate(state: VideoGenerationGateState = {}): VideoGenerationGateResult {
    const keyframeCount =
        typeof state.keyframeCount === 'number' && Number.isFinite(state.keyframeCount) ? state.keyframeCount : 0;
    const hasPrimaryKey = state.hasPrimaryKey === true;
    const hasRunwayKey = state.hasRunwayKey === true;
    const generating = state.generating === true;

    if (keyframeCount < 2) {
        return { canGenerate: false, reason: 'Minimo 2 keyframes necessarios na timeline' };
    }

    if (!hasPrimaryKey && !hasRunwayKey) {
        return {
            canGenerate: false,
            reason: 'Configure Google (Veo 3) em AI Assistant, ou insira uma Runway key no painel',
        };
    }

    if (generating) {
        return { canGenerate: false, reason: 'Geracao em andamento' };
    }

    return { canGenerate: true, reason: null };
}
