// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_SPLIT_HOMEGRID — barrel re-export (Wave PPP1 claude-adm)
// Consolidates homeGrid/* + sibling _home*Pure.ts modules under a single import path.
// Caller convenience: `import { ... } from '.../homeGrid/index.js';`
//
// ARCH-SPLIT-HOMEGRID-001 (fan-out desaturation): homeGrid.ts consumia 44 imports
// diretos de ./homeGrid/* (sinal maint.fan-out SATURADO: 66 imports > max 30,
// represando o code-score de ui/home-kpis). Este barrel re-exporta TODOS os
// sub-modules para que o monolito importe de UM caminho só. Comportamento
// IDÊNTICO: `export *` executa cada sub-module (side-effects preservados) e
// re-exporta os mesmos símbolos/types. Sem colisões de nome entre os 44 módulos
// (verificado), por isso `export *` é seguro e exaustivo.
//
// Spec NOT:
// - NÃO importar de homeGrid.ts (monolito) — só dos sub-modules
// - NÃO duplicar lógica — apenas re-export
// - NÃO emoji

// --- Pure-logic helpers (sibling, fora de ./homeGrid/) ---
export {
    ACTIONS_SHELL_LAYOUT,
    computeActionsShellConstraints,
    clampActionsShellLayout,
    computeDefaultActionsShellLayout,
    computeActionsShellKeyboardStep,
    isActionsLayoutResizable,
    getActionsLayoutBreakpoint,
} from '../_homeActionsShellLayoutPure.js';

export { filterOrderCards, computeCardListHash } from '../_homeCardsPure.js';

export {
    filterValidGaps,
    limitGapsToMax,
    resolveSuggestedVisibility,
    buildSuggestedRowVM,
    buildLaunchpadVM,
} from '../_homeLaunchpadPure.js';

// --- Sub-domain modules (./homeGrid/*) — re-export exaustivo ---
// DOM/orchestrator modules
export * from './homeConstellationHost.js';
export * from './homeRelationsPanel.js';
export * from './homeMarketplace.js';
export * from './homeIdentity.js';
export * from './homeEisDashboard.js';
export * from './homeQuickAccess.js';
export * from './homeDynamicSignature.js';
export * from './homePerformanceTelemetry.js';
export * from './homeLayoutController.js';
export * from './homeCompletenessHelpers.js';
export * from './homeCardElement.js';
export * from './homeCards.js';
export * from './homeHeader.js';
export * from './homeSuggested.js';
export * from './flowStatusSection.js';
export * from './flowStatusHelpers.js';
export * from './homeBootState.js';
export * from './homeCommunityPanels.js';
export * from './homeProfilePanels.js';
export * from './homePremiumPanels.js';
export * from './homeNavigatorData.js';
export * from './homeInspector.js';
export * from './homeSidebarFooter.js';
export * from './homeWorkspaceSection.js';
export * from './homeActionsSidePanel.js';
export * from './homeGroupedSidebar.js';
export * from './homeTreeRender.js';
export * from './homeContextRender.js';
export * from './homeActionsShellLayout.js';

// Pure modules (_*Pure)
export * from './_homeStatsPure.js';
export * from './_homeShellScaffoldPure.js';
export * from './_gridStatsPure.js';
export * from './_gridDataFreshnessPure.js';
export * from './_gridCardsPure.js';
export * from './_navigatorFilterPure.js';
export * from './_navigatorPathPure.js';
export * from './_objectActionsPure.js';
export * from './_lastSaveLabelPure.js';
export * from './_capabilityPure.js';
export * from './_featureFlagsPure.js';
export * from './_lastObjectContextPure.js';
export * from './_shellLayoutPure.js';
export * from './_homeShellHostingPure.js';
export * from './_objectTypeLabelPure.js';
export * from './_originLabelPure.js';
export * from './_navigatorLabelsPure.js';
export * from './_actionsProbe.js';
export * from './_workspaceSection.js';
export * from './_embeddedInspector.js';
export * from './_renderSections.js';
