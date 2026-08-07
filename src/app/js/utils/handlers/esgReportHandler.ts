// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/esgReportHandler.js
// Wire-up of P1-48 CVM 193/2023 ESG engine into UI.
// (window as any).handleShowEsgReport() - demo CVM 193 disclosure summary via toast.
import { CVM193_PILLARS, CVM193_DIMENSIONS, MATERIALITY_LEVELS, createDisclosureItem, computeEsgScore, identifyGaps, buildDisclosureReport, } from '../../core/governance/cvm193Engine.js';
import { showToast } from '../ui/toast.js';
function buildDemoItems() {
    const items = [];
    items.push(createDisclosureItem(CVM193_DIMENSIONS.E.CLIMATE, CVM193_PILLARS.E, {
        description: 'GHG emissions inventory',
        materialityLevel: MATERIALITY_LEVELS.HIGH,
        dataAvailable: true,
        quantitative: { co2eq: 1500 },
    }));
    items.push(createDisclosureItem(CVM193_DIMENSIONS.E.WATER, CVM193_PILLARS.E, {
        description: 'Water use',
        materialityLevel: MATERIALITY_LEVELS.MEDIUM,
        dataAvailable: false,
    }));
    items.push(createDisclosureItem(CVM193_DIMENSIONS.S.HEALTH_SAFETY, CVM193_PILLARS.S, {
        description: 'Worker safety',
        materialityLevel: MATERIALITY_LEVELS.HIGH,
        dataAvailable: true,
        qualitative: 'TFR < 1',
    }));
    items.push(createDisclosureItem(CVM193_DIMENSIONS.G.COMPLIANCE, CVM193_PILLARS.G, {
        description: 'Compliance program',
        materialityLevel: MATERIALITY_LEVELS.HIGH,
        dataAvailable: true,
    }));
    return items;
}
export function handleShowEsgReport() {
    const items = buildDemoItems();
    const score = computeEsgScore(items);
    const gaps = identifyGaps(items);
    const report = buildDisclosureReport(items, 'ecbyts demo') as any;
    const lines = [
        `CVM 193 ESG demo — overall: ${score.overall.toFixed(2)}`,
        `E:${score.E.toFixed(2)} S:${score.S.toFixed(2)} G:${score.G.toFixed(2)}`,
        `Items: ${report.totalItems} | Gaps: ${gaps.length}`,
    ];
    showToast(lines.join(' • '), 'info', 6000);
}
export const esgReportHandlers = { handleShowEsgReport };
