// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   Monte Carlo — convergence diagnostics (REC-004)

   MC standard error = sd / sqrt(n)
   Warning when MC_SE / |mean| > 5 %.
   ================================================================ */
import {
    computeMCStandardError as _computeMCSE,
    mcConvergenceWarning as _mcWarning,
} from '../uncertainty/correlation.js';

export { _computeMCSE as computeMCStandardError, _mcWarning as mcConvergenceWarning };

/**
 * Full convergence report for a sample array.
 */
export function checkConvergence(
    samples: number[],
    threshold = 0.05,
): { mean: number; sd: number; se: number; n: number; relative: number; warning: boolean } {
    const stats = _computeMCSE(samples);
    const relative = stats.mean !== 0 ? Math.abs(stats.se / stats.mean) : stats.se > 0 ? Infinity : 0;
    return {
        mean: stats.mean,
        sd: stats.sd,
        se: stats.se,
        n: stats.n,
        relative,
        warning: _mcWarning(stats, threshold),
    };
}
