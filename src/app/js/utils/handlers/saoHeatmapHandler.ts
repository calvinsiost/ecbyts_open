// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/saoHeatmapHandler.js
// Wire-up of P1-98 SAO risk heatmap builder into UI.
// window.handleShowSaoHeatmap() - demo with 8 ESH entries, shows matrix summary + hot cells.

import {
    buildRiskMatrix,
    findHotCells,
    summarizeHeatmap,
    classifyRiskBand,
} from '../../core/sao/riskHeatmapBuilder.js';
import { showToast } from '../ui/toast.js';

function buildDemoEntries() {
    return [
        { id: 'e1', category: 'E', severity: 5, likelihood: 4, riskScore: 20 },
        { id: 'e2', category: 'E', severity: 3, likelihood: 3, riskScore: 9 },
        { id: 's1', category: 'S', severity: 4, likelihood: 5, riskScore: 20 },
        { id: 's2', category: 'S', severity: 2, likelihood: 2, riskScore: 4 },
        { id: 'h1', category: 'H', severity: 5, likelihood: 5, riskScore: 25 },
        { id: 'h2', category: 'H', severity: 3, likelihood: 4, riskScore: 12 },
        { id: 'h3', category: 'H', severity: 1, likelihood: 1, riskScore: 1 },
        { id: 'h4', category: 'H', severity: 4, likelihood: 3, riskScore: 12 },
    ];
}

export function handleShowSaoHeatmap() {
    const entries = buildDemoEntries();
    const matrix = buildRiskMatrix(entries);
    const hot = findHotCells(matrix, 12);
    const sum = summarizeHeatmap(matrix);
    const top = hot[0];
    const topBand = top ? classifyRiskBand(top.score) : 'n/a';
    const lines = [
        `SAO heatmap demo — ${sum.totalEntries} entries, max=${sum.maxScore}`,
        `Hot cells: ${hot.length} | Top: ${top ? `S${top.severity}×L${top.likelihood}=${top.score} (${topBand})` : '—'}`,
        `Distribution: low=${sum.distribution.low} med=${sum.distribution.medium} high=${sum.distribution.high} ext=${sum.distribution.extreme}`,
    ];
    showToast(lines.join(' • '), 'info', 7000);
}

export const saoHeatmapHandlers = { handleShowSaoHeatmap };
