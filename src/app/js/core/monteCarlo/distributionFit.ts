// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Monte Carlo — distribution fit + silent warning (REC-004)

   Anderson-Darling goodness-of-fit test.
   Automatic silent test; warning when reject=true (p<0.05).
   ================================================================ */

import {
    testDistributionFit,
    fitNormal,
    fitLognormal,
    fitExponential,
    selectBestDistribution,
} from '../uncertainty/distributionFit.js';

export { testDistributionFit, fitNormal, fitLognormal, fitExponential, selectBestDistribution };

interface FitParams {
    mean?: number;
    sd?: number;
    meanLog?: number;
    sdLog?: number;
    rate?: number;
}

interface FitResult {
    statistic: number;
    criticalValues: Readonly<object>;
    pValue: string;
    reject: boolean;
    distribution: string;
    n: number;
    params: Readonly<object>;
    warning: string | null;
}

/**
 * Fit a distribution and return a warning flag if the fit is poor.
 *
 * @param {number[]} data
 * @param {'normal'|'lognormal'|'exponential'} distributionName
 * @param {FitParams} [params]
 * @param {number} [alpha=0.05]
 * @returns {Readonly<FitResult>}
 */
export function fitWithWarning(
    data: number[],
    distributionName: 'normal' | 'lognormal' | 'exponential',
    params: FitParams,
    alpha: number = 0.05
): Readonly<FitResult> {
    const result = testDistributionFit(data, distributionName, params);
    const warning =
        result.reject && result.statistic > (result.criticalValues[alpha] ?? Infinity)
            ? `Poor fit (${distributionName}): ${result.pValue}. Consider empirical or alternative distribution.`
            : null;
    return Object.freeze({
        statistic: result.statistic,
        criticalValues: result.criticalValues,
        pValue: result.pValue,
        reject: result.reject,
        distribution: result.distribution,
        n: result.n,
        params: result.params,
        warning,
    });
}
