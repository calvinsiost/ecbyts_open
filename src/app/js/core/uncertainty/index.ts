// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export { createUValue, isUValue, toAbsolute, toRelative, unwrap } from './primitive.js';
export {
    propagate,
    propagateAdditive,
    propagateMultiplicative,
    expandedUncertainty,
    effectiveDOF,
    // GUM Annex G — coverage factor k = t_p(ν_eff) from effective DOF
    studentTCriticalValue,
    coverageFactorFromDOF,
    expandedUncertaintyFromDOF,
    GUM_DEFAULT_COVERAGE_PROBABILITY,
} from './propagation.js';
export { aggregateQuality, classifyBadge } from './quality.js';
export { imputeNonDetectSeries } from './imputation.js';
export { getMatrixPolicy, chooseNDMethod, normalizeMatrix } from './matrix.js';
// UNC-001 Phase-3 (2026-05-15): matrix-aware Tier1→Tier2 MC promotion decision
export { evaluateMcPromotion, MC_NONLINEAR_OPS } from './phase3MatrixAware.js';
export { resolveUncertaintyPolicy } from './policyResolver.js';
export { resolveAndTrack, registerSqlPolicies, getLastSqlHash, _resetTelemetryState } from './policyTelemetry.js';
export { convertQualitativeUncertainty, Q2Q_MAP_V1 } from './q2q.js';
// Q2Q-001 - scale-typed qualitative→quantitative mapper with Box-Muller MC
export {
    QUALITATIVE_SCALES,
    SCALE_DEFINITIONS,
    mapToDistribution,
    monteCarloSample,
    aggregateQ2QSamples,
    summarizeSamples,
    scoreQ2QUncertainty,
} from './q2qMapper.js';
export {
    evaluateUncertaintyDecisionRules,
    makeDecisionWithUncertainty,
    classifyWithInterval,
    batchDecisions,
    decisionSummary,
    // UNC-DECISION-001 deterministic rule evaluation engine
    ACTION_PRIORITY,
    validateRule,
    evaluateRule,
    evaluateRuleSet,
    traceDecision,
} from './decisionRules.js';
export { optimizeMonitoringPlan } from './monitoringOptimization.js';
export { buildUncertaintyEvidence, validateUncertaintyEvidence } from './evidence.js';
// UNC-HUB-002 Tier-2 Monte Carlo engine (2026-04-12)
export { mulberry32, invNormalCDF, sampleFromUniform, sampleN, boxMuller } from './distributions.js';
export {
    lhsMatrix,
    quantile,
    meanSd,
    histogram,
    runMonteCarlo,
    runMonteCarloFromQ2Q,
    buildMonteCarloEvidence,
} from './monteCarlo.js';
export { computeSobolIndices } from './sobol.js';
// UNC-STRUCTURAL-001 Fase 1 (2026-04-12): observation-level schema
export {
    Q2Q_LEVELS,
    Q2Q_LAYMAN_LABELS_PT,
    Q2Q_LAYMAN_LABELS_EN,
    UNCERTAINTY_SOURCES,
    PROVENANCE_METHODS,
    DOMAINS,
    QC_FLAGS,
    CENSORED_LIMIT_TYPES,
    createUncertainty,
    isUncertaintyDeclared,
    combineComponents,
    uncertaintyBadge,
    migrateLegacyObservation,
    createCensoredRecord,
    isValidDomain,
    isValidQcFlag,
} from './observationSchema.js';
export { criticalityRatio, criticalityBand, criticalityLabelPt, evaluateCriticality } from './criticality.js';
export {
    DECISION_FRAMEWORKS,
    RISK_REGIONS,
    ALARP_THRESHOLDS,
    classifyAlarpRegion,
    applyPrecautionaryPrinciple,
    computeCostBenefit,
    makeDecision,
    aggregateDecisions,
    // P1-53 ALARP / Precautionary / Cost-Benefit decision rules engine
} from './decisionRulesEngine.js';
export {
    REGULATORY_THRESHOLDS,
    resolveThreshold,
    listRegulatedParameters,
    strictestThreshold,
} from './regulatoryThresholds.js';
// REC-002 v0.5 - KM + ROS censored environmental data (Helsel 2012)
// Note: chooseNDMethod from censored.js is re-exported as chooseNDMethodCensored
// to avoid collision with chooseNDMethod from matrix.js (different signature).
export {
    kaplanMeierLeftCensored,
    regressionOnOrderStatistics,
    estimateMoments as estimateMomentsFromCensored,
    chooseNDMethod as chooseNDMethodCensored,
    ND_METHODS,
    DETECT_RATE_THRESHOLDS,
    isValidObservationSet,
    computeDetectRate,
    chooseNDMethodAdvanced,
} from './censored.js';
// REC-004 v0.4 - Pearson/Spearman estimation, PD validation/correction, Iman-Conover
export * from './correlation.js';
// REC-004 v1.0 - Anderson-Darling distribution fit (Normal/Lognormal/Exponential)
export {
    testDistributionFit,
    fitNormal,
    fitLognormal,
    fitExponential,
    selectBestDistribution,
} from './distributionFit.js';
// FC-F10 - Split Conformal Prediction (distribution-free UQ; coexists with GUM)
export {
    conformalQuantile,
    calibrateRegression,
    predictionInterval,
    empiricalCoverage,
    calibrateClassification,
    predictionSet,
} from './conformal.js';
