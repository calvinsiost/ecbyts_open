// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Monte Carlo — empirical correlation estimation (REC-004)

   Returns both Pearson and Spearman matrices from observation data.
   Input convention: matrix[i] = observations of variable i.
   ================================================================ */

import { estimateCorrelationFromData } from '../uncertainty/correlation.js';
export { estimateCorrelationFromData };
