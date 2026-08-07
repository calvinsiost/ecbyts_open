// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/q2qDemoHandler.js
// Wire-up of P1-52 Q2Q mapper (qualitative→quantitative uncertainty) into UI.
// window.handleShowQ2qDemo() - runs N=500 Monte Carlo on a 'high confidence' scale level.

import {
    QUALITATIVE_SCALES,
    mapToDistribution,
    monteCarloSample,
    summarizeSamples,
} from '../../core/uncertainty/q2qMapper.js';
import { showToast } from '../ui/toast.js';

export function handleShowQ2qDemo() {
    const dist = mapToDistribution(QUALITATIVE_SCALES.CONFIDENCE, 'high');
    const samples = monteCarloSample(dist, 500);
    const sum = summarizeSamples(samples);
    const lines = [
        `Q2Q "confidence: high" — N=500 MC`,
        `μ=${sum.mean.toFixed(1)} σ=${sum.stdDev.toFixed(1)}`,
        `IC[p5..p95]: ${sum.p5.toFixed(0)}..${sum.p95.toFixed(0)}`,
    ];
    showToast(lines.join(' • '), 'info', 6000);
}

export const q2qDemoHandlers = { handleShowQ2qDemo };
