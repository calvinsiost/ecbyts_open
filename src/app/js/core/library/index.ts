// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   LIBRARY MODULE — Public API re-export
   ================================================================ */

export { routeLibraryRequest, estimateAiCost } from './serviceRouter.js';
export { executeAiService } from './aiService.js';
export { getConsultingAvailability, buildConsultingProposal } from './consultingService.js';
export {
    ECO_POINTS_POLICY,
    ECO_POINTS_POLICY_VERSION,
    applyEcoPointDecay,
    calculateEcoDiscount,
    calculateEcoPoints,
    calculateEcoReputationScore,
} from './ecoPoints.js';
