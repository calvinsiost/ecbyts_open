// @ts-check
// Generated from src/app/js/utils/handlers/simulation.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   SIMULATION HANDLERS — Window.* handlers for simulation lab modal
   ================================================================ */
import './simulationScenarioPortable.js'; // side-effect: registra kind 'simulation_scenario' (P1-10 Fase B)
import { openSimulationPanel, closeSimulationPanel } from '../ui/simulationPanel.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
let _requestUIRefresh: any = null;
export function setSimulationUpdateAllUI( fn: any) {
    _requestUIRefresh = fn;
}
function requestSimulationUIRefresh(reason = 'simulation.changed') {
    if (typeof _requestUIRefresh !== 'function')
        return;
    for (const domain of [UI_INVALIDATION_DOMAINS.STATUS, UI_INVALIDATION_DOMAINS.ANALYTICS]) {
        _requestUIRefresh(domain, reason);
    }
}
function handleOpenSimulationPanel() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled
    // (zero mudança de comportamento); só gateia se desativado explicitamente.
    if (!isCapabilityEnabled('simulation')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    openSimulationPanel();
    requestSimulationUIRefresh('simulation.panel-opened');
}
function handleCloseSimulationPanel() {
    closeSimulationPanel();
}
export const simulationHandlers = {
    handleOpenSimulationPanel,
    handleCloseSimulationPanel,
};
