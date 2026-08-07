// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/utils/handlers/launchpadDrilldowns.ts
// Drill-down handlers triggered from Launchpad hero KPI clicks.
// Each seed in core/calculator/launchpadSeeds.js declares a
// `drillDownHandler` name; hero.js reads window[name] on click.
//
// These handlers bridge KPI clicks to existing modals/panels,
// preferring the real owner when available and falling back to toast
// so clicks never silently fail.
import { t } from '../i18n/translations.js';
const win = window;
/** @param {string} msgKey @param {string} fallback */
function _toast(msgKey: any, fallback: any, variant = 'info') {
    const msg = t(msgKey) || fallback;
    if (typeof (win as any).showToast === 'function') {
        (win as any).showToast(msg, variant);
    }
    else {
        console.info('[drilldown]', msg);
    }
}
/**
 * EIS - opens the EIS dashboard modal if available.
 */
export function handleOpenEisModal() {
    if (typeof (win as any).handleOpenEisDashboard === 'function') {
        (win as any).handleOpenEisDashboard();
        return;
    }
    if (typeof (win as any).openModal === 'function' && document.getElementById('eis-modal')) {
        (win as any).openModal('eis-modal');
        return;
    }
    _toast('launchpad.drilldown.eis.unavailable', 'EIS dashboard indisponível');
}
/**
 * NPV - opens cost analysis modal if available.
 */
export function handleOpenCostAnalysis() {
    if (typeof (win as any).handleOpenCostAnalysisModal === 'function') {
        (win as any).handleOpenCostAnalysisModal();
        return;
    }
    if (typeof (win as any).openModal === 'function' && document.getElementById('cost-analysis-modal')) {
        (win as any).openModal('cost-analysis-modal');
        return;
    }
    _toast('launchpad.drilldown.vpl.unavailable', 'Análise de custo indisponível');
}
/**
 * PDPLU readings - opens Calculator where readings count is canonical.
 */
export function handleOpenCalculatorFromLaunchpad() {
    if (typeof (win as any).handleOpenCalculator === 'function') {
        (win as any).handleOpenCalculator();
        return;
    }
    if (typeof (win as any).openModal === 'function' && document.getElementById('calculator-modal')) {
        (win as any).openModal('calculator-modal');
        return;
    }
    _toast('launchpad.drilldown.calculator.unavailable', 'Calculator indisponível');
}
/**
 * Compliance - opens a modal with global compliance summary.
 * If no dedicated modal exists, dispatches an event so a listener
 * (e.g., regulatory panel) may handle it.
 */
export function handleOpenComplianceModal() {
    if (typeof (win as any).handleOpenRegulatoryModal === 'function') {
        (win as any).handleOpenRegulatoryModal();
        return;
    }
    if (typeof (win as any).openModal === 'function' && document.getElementById('regulatory-modal')) {
        (win as any).openModal('regulatory-modal');
        return;
    }
    // Let other listeners handle if present
    try {
        document.dispatchEvent(new CustomEvent('launchpad:open-compliance'));
    }
    catch (e: any) {
        console.debug('[launchpadDrilldowns] dispatch-compliance:', (e as any)?.message || e); /* original noop */
    }
    _toast('launchpad.drilldown.compliance.unavailable', 'Relatório de conformidade indisponível');
}
/**
 * Traceability / Provenance - opens provenance graph or audit trail.
 */
export function handleOpenProvenance() {
    if (typeof (win as any).handleOpenAuditTrail === 'function') {
        (win as any).handleOpenAuditTrail();
        return;
    }
    if (typeof (win as any).handleOpenProvenanceGraph === 'function') {
        (win as any).handleOpenProvenanceGraph();
        return;
    }
    try {
        document.dispatchEvent(new CustomEvent('launchpad:open-provenance'));
    }
    catch (e: any) {
        console.debug('[launchpadDrilldowns] dispatch-provenance:', (e as any)?.message || e); /* original noop */
    }
    _toast('launchpad.drilldown.provenance.unavailable', 'Trilha de procedência indisponível');
}
/**
 * Integrity aggregate report - opens a minimal breakdown dialog
 * with the 3 components (C, T, U) and the formula version. No modal
 * yet; emits event for future panel to consume and falls back to toast.
 */
export function handleOpenIntegrityReport() {
    try {
        document.dispatchEvent(new CustomEvent('launchpad:open-integrity-report'));
    }
    catch (e: any) {
        console.debug('[launchpadDrilldowns] dispatch-integrity-report:', (e as any)?.message || e); /* original noop */
    }
    _toast('launchpad.drilldown.integrity.comingSoon', 'Relatório Integridade detalhado em breve — consulte painéis Conformidade, Rastreabilidade e Incerteza.');
}
/**
 * Register all drill-down handlers on window.
 * Called once from utils/handlers/index.js during boot.
 */
export function registerLaunchpadDrilldowns() {
    (win as any).handleOpenEisModal = handleOpenEisModal;
    (win as any).handleOpenCostAnalysis = handleOpenCostAnalysis;
    (win as any).handleOpenCalculator = (win as any).handleOpenCalculator ?? handleOpenCalculatorFromLaunchpad;
    (win as any).handleOpenComplianceModal = handleOpenComplianceModal;
    (win as any).handleOpenProvenance = handleOpenProvenance;
    (win as any).handleOpenIntegrityReport = handleOpenIntegrityReport;
}
//# sourceMappingURL=launchpadDrilldowns.js.map
