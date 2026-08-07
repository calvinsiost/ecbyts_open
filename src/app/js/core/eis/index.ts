// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   EIS MODULE — Public Exports
   Módulo de Governança de Dados Ambientais (Environmental Integrity Score)
   ================================================================ */

export {
    EisCalculator,
    EIS_AXES,
    EIS_DEFAULT_WEIGHTS,
    EIS_CREDENTIAL_MULTIPLIERS,
    EIS_CREDENTIAL_LABELS,
    EIS_VERDICTS,
    EIS_CUSTOM_TEMPLATES,
    EIS_COST_BENCHMARKS,
} from './eisCalculator.js';

// Scope Resolver - resolucao de escopo para EIS subdivisivel
export {
    resolveScope,
    getElementsForCnpjNode,
    getElementsForStudyArea,
    pointInPolygonXZ,
    polygonAreaXZ,
    collectObservationsForElements,
    filterCampaignsForElements,
    resolveResponsibles,
    computeScopeHash,
    enumerateCnpjScopes,
    enumerateAreaScopes,
} from './eisScopeResolver.js';

// Spatial Indicators (IS1-IS7) - indicadores espaciais por area
export {
    computeMonitoringDensity,
    computeSpatialCoverage,
    computeFamilyDiversity,
    computeRemediationCoverage,
    computeTemporalGap,
    computeRegulatoryParameterCoverage,
    computeRegulatoryCompliance,
    computeCompositeIS,
    computeAreaEIS,
    computeAllSpatialIndicators,
    DEFAULT_EXPECTED_FAMILIES,
    DEFAULT_REQUIRED_PARAMS,
    DEFAULT_COMPOSITE_WEIGHTS,
} from './spatialIndicators.js';

// Canonical EIS formula registry + executor
export {
    EIS_FORMULA_REGISTRY,
    listEisFormulas,
    getEisFormula,
    validateFormulaRef,
    getCanonicalAxisFormulaRefs,
} from './formulaRegistry.js';
export { executeCanonicalEis } from './canonicalEngine.js';

// ODS Overlay - SDG/ISSB monitoring pack (P1-1 SPEC_EIS_ODS_MONITORING_PACK)
export {
    computeOdsOverlay,
    buildOdsSummary,
    classifyEvidenceLevel,
    clamp01,
    to5,
    ratioPos,
    ratioInv,
    trendImprove,
    ODS_KEYS,
    ODS_VERSION,
    ODS_TITLES_PT,
    ODS_TITLES_EN,
    ODS_TITLES_ES,
    ODS_COLORS,
    getOdsTitle,
} from './odsOverlay.js';

// EIS-CUSTOM-001 - Custom Score Builder: template validation, compute, diff, publish
export * from './customScoreBuilder.js';

// SPEC-REC-003 - Eixo T renovado: avaliação objetiva de proveniência com 6 checks
export * from './axes/transparencyAxis.js';

// EIS Correction Workbench P1-4 - batch correction engine (pure-logic)
export * from './correctionBatch.js';

// HEALTH-MON-001 ↔ EIS bridge - health axis score + compliance assessment
export * from './eisHealthIntegration.js';

// SPEC_EIS_RADAR_10AXES_PROGRESSIVE_UI - Fase 1: axisRegistry + eisCalculator10
export { AXIS_DEFINITIONS, getAxisById, listCoreAxes, listProgressiveAxes, getTotalWeight } from './axisRegistry.js';
export { computeEIS10, normalizeAxisScores } from './eisCalculator10.js';

// SPEC_EIS_RADAR_10AXES_PROGRESSIVE_UI - P1-23: radar config + view toggle
export { CORE_AXES, EXTENDED_AXES, ALL_AXES, AXIS_LABELS, RADAR_VIEW_MODES, getAxesForMode } from './eisRadarConfig.js';
export { getRadarViewMode, setRadarViewMode, toggleRadarViewMode } from './eisRadarToggle.js';

// P1-54 ODS Alignment Engine - TCCCA+T axes to UN SDG mapping, ranking, report
export {
    UN_SDGS,
    EIS_TO_SDG_MAPPING,
    computeSdgContributions,
    rankSdgAlignment,
    getSdgLabel,
    buildSdgReport,
} from './odsAlignmentEngine.js';
