// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// ODS impact panel/HUD — thin DOM mount (RF-4 of SPEC_ODS_IMPACT_PARAMS).
//
// Read-only card: renders `OdsImpactResult[]` (RF-2 `computeOdsImpact`) via
// the pure view-model/HTML builder in `core/ods/_odsImpactPanelPure.ts`.
// This module is the ONLY thing here that touches `document`/DOM; all
// tier/score/honesty logic lives in the pure module (tested without a DOM).
//
// NOTE on wiring (honesty about current state): the live caller that
// assembles a real `OdsImpactModel` from app state depends on RF-1's
// indicator registry loader being wired to a runtime adapter and on RF-3/RF-6
// (action-plan indicator code + ODS stamps) landing, so there is a real,
// audited provenance trail behind every reading. Those RFs are still
// in-progress in the fleet queue as of this commit, so this module exposes
// `mountOdsImpactPanel(container, results)` as a pure DOM-render entry point
// that any future bootstrap wiring can call once a real `results` array is
// available — it does NOT fabricate a live data source itself.
//
// Sem edição inline: este módulo só renderiza; qualquer alteração de
// parâmetro é curadoria admin (RF-1), fora desta UI.

import {
    buildOdsImpactPanelHtml,
    buildOdsImpactPanelVM,
} from '../../core/ods/_odsImpactPanelPure.js';

/**
 * Renders the read-only ODS impact panel into `container`.
 *
 * @param {HTMLElement | null | undefined} container
 * @param {ReadonlyArray<import('../../core/ods/_odsImpactPure.js').OdsImpactResult> | null | undefined} results
 * @returns {void}
 */
export function mountOdsImpactPanel(container: any, results: any): void {
    if (!container) return;
    const vm = buildOdsImpactPanelVM(results);
    container.innerHTML = buildOdsImpactPanelHtml(vm);
}
