// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/eisRadarConfigHandler.js
// Wire-up of P1-23 EIS Radar 10-axes config into UI.
// (window as any).handleShowEisRadarAxes() - shows core/extended/all axes via toast.
import { CORE_AXES, EXTENDED_AXES, ALL_AXES, AXIS_LABELS, RADAR_VIEW_MODES, getAxesForMode, } from '../../core/eis/eisRadarConfig.js';
import { showToast } from '../ui/toast.js';
export function handleShowEisRadarAxes() {
    const coreAxes = getAxesForMode(RADAR_VIEW_MODES.CORE);
    // eslint-disable-next-line
    const extendedAxes = getAxesForMode(RADAR_VIEW_MODES.EXTENDED);
    const labels = (AXIS_LABELS) as Record<string, string>;
    const labelsSample = CORE_AXES.map((axis) => {
        const key = String(axis);
        return `${key}=${labels[key] || key}`;
    }).join(', ');
    const lines = [
        `EIS Radar — ${ALL_AXES.length} axes total (${CORE_AXES.length} core + ${EXTENDED_AXES.length} extended)`,
        `Core: ${coreAxes.join(', ')}`,
        `Labels: ${labelsSample}`,
    ];
    showToast(lines.join(' • '), 'info', 7000);
}
export const eisRadarConfigHandlers = { handleShowEisRadarAxes };
