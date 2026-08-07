// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/parameterGroupsHandler.js
// Wire-up of P1-45 parameter groups into UI.
// window.handleShowParameterGroups() - classifies sample observations by group.

import { PARAMETER_GROUPS, classifyParameter, groupObsByParameterGroup } from '../../core/filter/parameterGroups.js';
import { showToast } from '../ui/toast.js';

export function handleShowParameterGroups() {
    const sampleObs = [
        { parameter: 'benzeno', value: 0.05 },
        { parameter: 'chumbo', value: 0.1 },
        { parameter: 'mercúrio', value: 0.001 },
        { parameter: 'pH', value: 6.8 },
        { parameter: 'naftaleno', value: 0.02 },
        { parameter: 'tolueno', value: 0.03 },
        { parameter: 'ddt', value: 0.0001 },
        { parameter: 'condutividade', value: 350 },
    ];
    const grouped = groupObsByParameterGroup(sampleObs);
    const benzGroup = classifyParameter('benzeno');
    const summary = Array.from(grouped.entries())
        .map(([k, v]) => `${k}:${v.length}`)
        .join(' ');
    const lines = [
        `Parameter Groups demo — ${sampleObs.length} obs, ${Object.keys(PARAMETER_GROUPS).length} canonical groups`,
        `Distribution: ${summary}`,
        `classify(benzeno) → ${benzGroup}`,
    ];
    showToast(lines.join(' • '), 'info', 7000);
}

export const parameterGroupsHandlers = { handleShowParameterGroups };
