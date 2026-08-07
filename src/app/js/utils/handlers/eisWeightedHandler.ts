// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/eisWeightedHandler.js
// Wire-up of P1-50 EIS weighted config into UI.
// (window as any).handleCompareEisPresets() - runs all 4 presets on demo axis scores, shows ranked.
import { WEIGHT_PRESETS, compareWeightedScenarios } from '../../core/eis/eisWeightedConfig.js';
import { showToast } from '../ui/toast.js';
export function handleCompareEisPresets() {
    const axisScores = { T: 4.2, A: 4.5, Cp: 3.8, Ty: 3.5, Cs: 4.0, Cm: 3.7 };
    const presets = [WEIGHT_PRESETS.DEFAULT, WEIGHT_PRESETS.MINING, WEIGHT_PRESETS.REMEDIATION, WEIGHT_PRESETS.WATER] as string[];
    const results = compareWeightedScenarios(axisScores, presets);
    const top = results[0]!;
    const bottom = results[results.length - 1]!;
    const lines = [
        `EIS preset comparison — demo scores T:4.2 A:4.5 Cp:3.8 Ty:3.5 Cs:4.0 Cm:3.7`,
        `Best preset: ${top.preset} → EIS=${top.eis.toFixed(2)}`,
        `Lowest: ${bottom.preset} → EIS=${bottom.eis.toFixed(2)}`,
    ];
    showToast(lines.join(' • '), 'info', 7000);
}
export const eisWeightedHandlers = { handleCompareEisPresets };
