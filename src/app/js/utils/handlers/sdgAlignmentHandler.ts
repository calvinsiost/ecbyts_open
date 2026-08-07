// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/sdgAlignmentHandler.js
// Wire-up of P1-54 ODS/SDG alignment engine into UI.
// window.handleShowSdgAlignment() - demo SDG report from sample EIS axes.

import { buildSdgReport } from '../../core/eis/odsAlignmentEngine.js';
import { showToast } from '../ui/toast.js';

export function handleShowSdgAlignment() {
    const eisAxes = { T: 4.2, A: 4.5, Cp: 3.8, Ty: 3.5, Cs: 4.0, Cm: 3.7 };
    const report = buildSdgReport(eisAxes, 'ecbyts demo');
    const top = report.ranking[0];
    const lines = [
        `SDG alignment demo — ${report.projectName}, overall ${report.overallAlignment.toFixed(2)}`,
        `Top SDG: ${top ? `${top.sdg} (${top.level}, ${top.score.toFixed(2)})` : '—'}`,
        `Coverage: ${report.ranking.length} SDGs`,
    ];
    showToast(lines.join(' • '), 'info', 7000);
}

export const sdgAlignmentHandlers = { handleShowSdgAlignment };
