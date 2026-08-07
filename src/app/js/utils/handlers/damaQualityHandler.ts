// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/damaQualityHandler.js
// Wire-up of P1-49 DAMA DMBOK data quality engine into UI.
// (window as any).handleShowDamaQuality() - demo over loaded model elements + observations.
import { assessDataQuality } from '../../core/governance/damaQualityEngine.js';
import { showToast } from '../ui/toast.js';
function buildDemoRecords() {
    return [
        { id: 'r1', value: 1.2, unit: 'mg/L', timestamp: Date.now() - 1 * 86400000 },
        { id: 'r2', value: 0.8, unit: 'mg/L', timestamp: Date.now() - 2 * 86400000 },
        { id: 'r3', value: null, unit: 'mg/L', timestamp: Date.now() - 3 * 86400000 },
        { id: 'r4', value: 2.5, unit: 'mg/L', timestamp: Date.now() - 5 * 86400000 },
        { id: 'r5', value: 1.0, unit: 'mg/L', timestamp: Date.now() - 7 * 86400000 },
        { id: 'r6', value: 1.0, unit: 'mg/L', timestamp: Date.now() - 7 * 86400000 },
    ];
}
export function handleShowDamaQuality() {
    const records = buildDemoRecords();
    const dimensionOptions = {
        completeness: { fields: ['value', 'unit'] },
        accuracy: { range: [0, 5] },
        timeliness: { windowMs: 30 * 86400000 },
        uniqueness: { field: 'id' },
    };
    const result = assessDataQuality(records, dimensionOptions);
    const lines = [
        `DAMA quality demo — overall: ${result.overallScore.toFixed(2)} (grade ${result.grade})`,
        `C:${result.scores.completeness!.toFixed(2)} A:${result.scores.accuracy!.toFixed(2)} T:${result.scores.timeliness!.toFixed(2)} U:${result.scores.uniqueness!.toFixed(2)}`,
        `Violations: ${result.thresholdViolations.length}`,
    ];
    showToast(lines.join(' • '), 'info', 7000);
}
export const damaQualityHandlers = { handleShowDamaQuality };
