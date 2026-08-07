// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   Monte Carlo — advanced module barrel (REC-004)

   Facade over uncertainty/ sub-modules to provide a curated,
   self-contained export surface for MC-specific consumers.
   ================================================================ */
export { imanConoverRankCorrelation } from './correlate.js';
export { estimateCorrelationFromData } from './estimateCorrelationFromData.js';
export { computeMCStandardError, mcConvergenceWarning, checkConvergence } from './convergence.js';
export { MONTE_CARLO_DEFAULTS, resolveIterations } from './defaults.js';
export {
    testDistributionFit,
    fitNormal,
    fitLognormal,
    fitExponential,
    selectBestDistribution,
    fitWithWarning,
} from './distributionFit.js';
export { computeMorrisEffects } from './morris.js';
//# sourceMappingURL=index.js.map
