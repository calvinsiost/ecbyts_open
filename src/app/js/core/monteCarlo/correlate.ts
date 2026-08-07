// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Monte Carlo — Iman-Conover rank correlation induction (REC-004)

   Reorders already-sampled columns so that Spearman rank correlation
   approximates the target Pearson correlation matrix, preserving
   marginal distributions exactly.

   Reference: Iman & Conover (1982), Commun. Stat. Simul. Comp. 11(3).
   ================================================================ */

import { imanConoverRankCorrelation } from '../uncertainty/correlation.js';
export { imanConoverRankCorrelation };
