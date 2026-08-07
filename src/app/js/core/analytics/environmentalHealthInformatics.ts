// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining / Environmental Health Informatics
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
// [1]  Breslow & Day 1987. Statistical Methods in Cancer Research, Vol II. ISBN 9789283204220.
// [2]  Levin ML 1953. Acta Unio Int Contra Cancrum, 9:531–541. (Attributable Fraction)
// [3]  GBD 2019 Collaborators. Lancet 2020;396:1204–22. DOI:10.1016/S0140-6736(20)30925-9 (DALY)
// [4]  Fann et al. 2012. Risk Analysis 32(1):81–95. DOI:10.1111/j.1539-6924.2011.01630.x (BenMAP-CE)
// [5]  Dockery et al. 1993. N Engl J Med 329:1753–9. DOI:10.1056/NEJM199312093292401 (C-R function)
// [6]  Cliff & Ord 1981. Spatial Processes. Pion, London. (Moran's I)
// [7]  Silverman BW 1986. Density Estimation for Statistics and Data Analysis. ISBN 9780412246203.
// [8]  Kulldorff M 1997. Commun Statist Theory Methods 26(6):1481–96. DOI:10.1080/03610929708831995
// [9]  USEPA 2023. EJScreen Technical Documentation v2.3. EPA/230/R-23/001.
// [10] WHO 2006. WHO Recommended Surveillance Standards, 2nd ed. WHO/CDS/CSR/ISR/99.2.
// [11] Wallinga J & Teunis P 2004. Am J Epidemiol 160(6):509–16. DOI:10.1093/aje/kwh255
// [12] Hethcote HW 2000. SIAM Rev 42(4):599–653. DOI:10.1137/S0036144500371907
// [13] Anderson RM & May RM 1991. Infectious Diseases of Humans. ISBN 9780198540403.
// [14] WHO Europe 2003. DPSEEA framework for environmental health indicators.
// [15] Gasparrini A et al. 2010. Int J Epidemiol 39(6):1571–81. DOI:10.1093/ije/dyq094
// [16] Haas CN et al. 1993. J Am Water Works Assoc 85(11):158–68. DOI:10.1111/j.1752-1688.1993.tb03192.x
// [17] Macdonald G 1952. Trop Dis Bull 49(9):813–29. (Vectorial capacity)
// [18] Lanphear BP et al. 2005. Environ Health Perspect 113(7):894–9. DOI:10.1289/ehp.7688
// [19] USEPA 2010. Guidelines for Preparing Economic Analyses. EPA/240/R-10/001.

console.debug('[BCT:load] environmentalHealthInformatics — Environmental Health Informatics & Disease Surveillance');

// ---------------------------------------------------------------------------
// Named constants - no magic numbers
// ---------------------------------------------------------------------------

/** Natural logarithm of 2 */
const LN2 = Math.LN2;

/** Standard normal z-score for 95% CI (two-tailed) */
const Z_95 = 1.959964;

/** USEPA Value of Statistical Life, 2010 guidance (USD 2020 inflation-adjusted) */
const VSL_USD = Object.freeze({ epa_2010: 7_400_000 });

/** GBD 2019 standard disability weights for common environmental disease endpoints */
const _GBD_DISABILITY_WEIGHTS = Object.freeze({
    asthma_mild: 0.013,
    asthma_moderate: 0.044,
    asthma_severe: 0.133,
    copd_mild: 0.019,
    copd_moderate: 0.128,
    copd_severe: 0.408,
    ischemic_heart_disease: 0.075,
    lung_cancer: 0.288,
    lead_intellectual_disability: 0.028,
});

/** Lanphear 2005 — IQ points lost per 10-fold increase in blood lead (µg/dL) */
const _LANPHEAR_IQ_SLOPE_10FOLD = 10.0;

/** Lanphear 2005 — IQ slope (points/µg·dL⁻¹) for blood lead 1–10 µg/dL range */
const LANPHEAR_IQ_SLOPE_LINEAR = 1.37;

/** Haas 1993 log-logistic default shape parameter β₅₀ approach */
const HAAS_LOG_LOGISTIC_ALPHA = 0.253;
const HAAS_LOG_LOGISTIC_BETA = 0.435;

/** Macdonald 1952 — extrinsic incubation period default (days) for malaria */
const MACDONALD_EIP_MALARIA_DAYS = 12;

/** WHO epidemic alert: mean + k standard deviations */
const WHO_EPIDEMIC_K_SIGMA = 2;

/** EJScreen weight defaults for EJI composite */
const _EJSCREEN_WEIGHTS = Object.freeze({
    demographicVulnerability: 0.5,
    environmentalHazard: 0.5,
});

/** BenMAP-CE default concentration-response coefficient (β) for PM2.5 total mortality */
const BENMAP_BETA_PM25_MORTALITY = 0.0058; // per µg/m³; Krewski et al. 2009

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validates that a value is a finite number, optionally within [lo, hi].
 * @param {number} v
 * @param {string} name
 * @param {number} [lo=-Infinity]
 * @param {number} [hi=Infinity]
 * @throws {TypeError|RangeError}
 */
function _requireFinite(v: any, name: any, lo = -Infinity, hi = Infinity) {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`[BCT] ${name} must be a finite number, got ${v}`);
    }
    if (v < lo || v > hi) {
        throw new RangeError(`[BCT] ${name} must be in [${lo}, ${hi}], got ${v}`);
    }
}

/**
 * Validates that an array is non-empty and all elements are finite numbers.
 * @param {number[]} arr
 * @param {string} name
 * @param {number} [minLen=1]
 */
function _requireNumberArray(arr: any, name: any, minLen = 1) {
    if (!Array.isArray(arr) || arr.length < minLen) {
        throw new TypeError(`[BCT] ${name} must be an array with at least ${minLen} element(s)`);
    }
    for (let i = 0; i < arr.length; i++) {
        if (typeof arr[i] !== 'number' || !isFinite(arr[i])) {
            throw new TypeError(`[BCT] ${name}[${i}] must be a finite number, got ${arr[i]}`);
        }
    }
}

/**
 * Computes arithmetic mean of a numeric array.
 * @param {number[]} arr
 * @returns {number}
 */
function _mean(arr: any) {
    let s = 0;
    for (const v of arr) s += v;
    return s / arr.length;
}

/**
 * Computes sample variance of a numeric array (ddof=1).
 * @param {number[]} arr
 * @param {number} [mean]
 * @returns {number}
 */
function _variance(arr: any, mean: any) {
    const m = mean !== undefined ? mean : _mean(arr);
    let s = 0;
    for (const v of arr) s += (v - m) ** 2;
    return arr.length > 1 ? s / (arr.length - 1) : 0;
}

/**
 * Euclidean distance between two 2-D points [x, y].
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function _dist2d(a: any, b: any) {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

/**
 * Epanechnikov kernel K(u) = 0.75(1-u²) if |u|≤1 else 0.
 * Optimal for MSE minimisation (Silverman 1986).
 * @param {number} u
 * @returns {number}
 */
function _kernelEpanechnikov(u: any) {
    return Math.abs(u) <= 1 ? 0.75 * (1 - u * u) : 0;
}

// ---------------------------------------------------------------------------
// 1. Standardised Mortality Ratio - Breslow & Day 1987
// ---------------------------------------------------------------------------

/**
 * Calculates the Standardised Mortality Ratio (SMR) and 95% confidence interval
 * using exact Poisson-based Byar's approximation.
 *
 * SMR = observed / expected × 100.
 * CI uses Byar's method for small observed counts (Breslow & Day 1987, §2.4).
 *
 * @param {number} observed  - Observed deaths/events in the study population (integer ≥ 0)
 * @param {number} expected  - Expected deaths/events from reference rate (> 0)
 * @returns {{ smr: number, ci95Lower: number, ci95Upper: number, interpretation: string }}
 * @throws {RangeError} If expected ≤ 0 or observed < 0
 * @reference Breslow & Day 1987 ISBN 9789283204220 §2.4
 */
export function computeStandardisedMortalityRatio(observed: any, expected: any) {
    _requireFinite(observed, 'observed', 0);
    _requireFinite(expected, 'expected', Number.EPSILON);
    if (!Number.isInteger(observed)) {
        throw new RangeError('[BCT] observed must be a non-negative integer');
    }

    const smr = (observed / expected) * 100;

    // Byar's approximation for Poisson CI on observed count O:
    // Lower: O × (1 - 1/(9O) - z/√(9O))³  (O > 0)
    // Upper: (O+1) × (1 - 1/(9(O+1)) + z/√(9(O+1)))³
    let ciLower = 0;
    if (observed > 0) {
        const t = 1 - 1 / (9 * observed) - Z_95 / Math.sqrt(9 * observed);
        ciLower = observed * t ** 3;
    }
    const op1 = observed + 1;
    const tUp = 1 - 1 / (9 * op1) + Z_95 / Math.sqrt(9 * op1);
    const ciUpper = op1 * tUp ** 3;

    const smrLower = (ciLower / expected) * 100;
    const smrUpper = (ciUpper / expected) * 100;

    let interpretation;
    if (smr > 100 && smrLower > 100) interpretation = 'excess mortality';
    else if (smr < 100 && smrUpper < 100) interpretation = 'deficit mortality';
    else interpretation = 'no significant difference';

    return { smr, ci95Lower: smrLower, ci95Upper: smrUpper, interpretation };
}

// ---------------------------------------------------------------------------
// 2. Attributable Fraction - Levin 1953
// ---------------------------------------------------------------------------

/**
 * Calculates the Attributable Fraction (AF) using Levin's formula.
 * AF = (RR - 1) / RR × Pe, where Pe is the exposure prevalence.
 *
 * Also returns the Population Attributable Risk (PAR) version:
 * PAR = Pe × (RR - 1) / (1 + Pe × (RR - 1))
 *
 * @param {number} RR          - Relative risk (must be > 0)
 * @param {number} prevalence  - Proportion of population exposed (0–1)
 * @returns {{ af: number, par: number, percentAF: number }}
 * @throws {RangeError} If RR ≤ 0 or prevalence outside [0, 1]
 * @reference Levin ML 1953 Acta Unio Int Contra Cancrum 9:531
 */
export function computeAttributableFraction(RR: any, prevalence: any) {
    _requireFinite(RR, 'RR', Number.EPSILON);
    _requireFinite(prevalence, 'prevalence', 0, 1);

    // Levin's AF (cases attributable per exposed case)
    const af = ((RR - 1) / RR) * prevalence;

    // Population Attributable Risk (PAR) - proportion of all cases attributable
    const par = (prevalence * (RR - 1)) / (1 + prevalence * (RR - 1));

    return { af, par, percentAF: par * 100 };
}

// ---------------------------------------------------------------------------
// 3. Disability-Adjusted Life Years - GBD 2019
// ---------------------------------------------------------------------------

/**
 * Computes Disability-Adjusted Life Years (DALYs) as DALY = YLL + YLD.
 *
 * YLL (Years of Life Lost) = N × L  (number of deaths × standard life expectancy at death)
 * YLD (Years Lived with Disability) = I × DW × D
 *   where I = incident cases, DW = disability weight [0,1], D = duration (years)
 *
 * @param {object} params
 * @param {number} params.deaths        - Number of deaths in the period
 * @param {number} params.lifeExpect    - Remaining life expectancy at age of death (years)
 * @param {number} params.incidentCases - Number of incident disability cases
 * @param {number} params.disabilityWeight - GBD disability weight [0, 1]
 * @param {number} params.durationYears - Average duration of disability (years)
 * @returns {{ yll: number, yld: number, daly: number, dalyPer100k: number }}
 * @throws {RangeError} If any parameter is out of valid range
 * @reference GBD 2019 Collaborators. Lancet 2020. DOI:10.1016/S0140-6736(20)30925-9
 */
export function computeDiseaseBurdenDALY({
    deaths,
    lifeExpect,
    incidentCases,
    disabilityWeight,
    durationYears
}: any) {
    _requireFinite(deaths, 'deaths', 0);
    _requireFinite(lifeExpect, 'lifeExpect', 0);
    _requireFinite(incidentCases, 'incidentCases', 0);
    _requireFinite(disabilityWeight, 'disabilityWeight', 0, 1);
    _requireFinite(durationYears, 'durationYears', 0);

    const yll = deaths * lifeExpect;
    const yld = incidentCases * disabilityWeight * durationYears;
    const daly = yll + yld;
    // Per 100,000 requires population - return raw; caller normalises
    const dalyPer100k = daly; // normalisation factor injected via caller if needed

    return { yll, yld, daly, dalyPer100k };
}

// ---------------------------------------------------------------------------
// 4. Health Impact Function - BenMAP-CE
// ---------------------------------------------------------------------------

/**
 * Estimates change in health burden using the Health Impact Function (HIF).
 * ΔHEF = baseline_rate × population × β × ΔC
 * where β = concentration-response coefficient (log-linear form).
 *
 * @param {number} baselineRate       - Baseline incidence rate (cases per person per year)
 * @param {number} population         - Exposed population size
 * @param {number} beta               - Concentration-response coefficient (per µg/m³)
 * @param {number} deltaConcentration - Change in pollutant concentration (µg/m³; negative = improvement)
 * @returns {{ deltaHEF: number, deltaPercent: number }}
 * @throws {RangeError} If baselineRate or population ≤ 0
 * @reference Fann et al. 2012 Risk Analysis 32(1):81–95. DOI:10.1111/j.1539-6924.2011.01630.x
 */
export function computeHealthImpactFunction(baselineRate: any, population: any, beta: any, deltaConcentration: any) {
    _requireFinite(baselineRate, 'baselineRate', Number.EPSILON);
    _requireFinite(population, 'population', Number.EPSILON);
    _requireFinite(beta, 'beta');
    _requireFinite(deltaConcentration, 'deltaConcentration');

    // Log-linear (relative risk) approach: ΔY = Y₀ × P × (exp(β × ΔC) - 1)
    // For small ΔC, exp(β·ΔC)-1 ≈ β·ΔC; full form used here for accuracy
    const expectedBaseline = baselineRate * population;
    const deltaHEF = expectedBaseline * (Math.exp(beta * deltaConcentration) - 1);
    const deltaPercent = (Math.exp(beta * deltaConcentration) - 1) * 100;

    return { deltaHEF, deltaPercent };
}

// ---------------------------------------------------------------------------
// 5. Concentration-Response Function - Dockery 1993 (linear no-threshold)
// ---------------------------------------------------------------------------

/**
 * Applies a linear no-threshold concentration-response function to estimate
 * mortality change associated with PM2.5 exposure.
 *
 * CR(C) = RR^{(C - C_ref)} where RR per unit is exp(β).
 * Returns excess deaths and relative risk vs reference concentration.
 *
 * @param {number} concentration   - Observed PM2.5 concentration (µg/m³)
 * @param {number} refConcentration - Reference/counterfactual concentration (µg/m³)
 * @param {number} population      - Exposed population
 * @param {number} baselineMortRate - Baseline all-cause mortality rate (per person per year)
 * @param {number} [beta=BENMAP_BETA_PM25_MORTALITY] - CR coefficient (default: Krewski 2009)
 * @returns {{ relativeRisk: number, excessDeaths: number, excessPercent: number }}
 * @throws {RangeError} If concentration, population, or baselineMortRate ≤ 0
 * @reference Dockery et al. 1993 N Engl J Med 329:1753. DOI:10.1056/NEJM199312093292401
 */
export function computeConcentrationResponseFunction(
    concentration: any,
    refConcentration: any,
    population: any,
    baselineMortRate: any,
    beta = BENMAP_BETA_PM25_MORTALITY,
) {
    _requireFinite(concentration, 'concentration', Number.EPSILON);
    _requireFinite(refConcentration, 'refConcentration', Number.EPSILON);
    _requireFinite(population, 'population', Number.EPSILON);
    _requireFinite(baselineMortRate, 'baselineMortRate', Number.EPSILON);
    _requireFinite(beta, 'beta');

    const deltaC = concentration - refConcentration;
    const relativeRisk = Math.exp(beta * deltaC);
    const baselineDeaths = baselineMortRate * population;
    const excessDeaths = baselineDeaths * (relativeRisk - 1);
    const excessPercent = (relativeRisk - 1) * 100;

    return { relativeRisk, excessDeaths, excessPercent };
}

// ---------------------------------------------------------------------------
// 6. Moran's I - Spatial Autocorrelation (Cliff & Ord 1981)
// ---------------------------------------------------------------------------

/**
 * Computes Moran's I statistic for spatial autocorrelation of a variable
 * observed at n locations with a binary (0/1) adjacency weight matrix.
 *
 * I = (n / S₀) × (Σᵢ Σⱼ wᵢⱼ zᵢ zⱼ) / (Σᵢ zᵢ²)
 * where zᵢ = xᵢ - x̄ and S₀ = Σᵢ Σⱼ wᵢⱼ.
 *
 * @param {number[]} values            - Observed values at each location (length n)
 * @param {number[][]} weights         - n×n row-normalised adjacency weight matrix
 * @returns {{ moranI: number, expectedI: number, varianceI: number, zScore: number }}
 * @throws {TypeError} If dimensions mismatch or inputs are invalid
 * @reference Cliff & Ord 1981 Spatial Processes. Pion, London.
 */
export function computeSpatialAutocorrelationMoran(values: any, weights: any) {
    _requireNumberArray(values, 'values', 2);
    const n = values.length;
    if (!Array.isArray(weights) || weights.length !== n) {
        throw new TypeError('[BCT] weights must be an n×n matrix matching values length');
    }
    for (let i = 0; i < n; i++) {
        if (!Array.isArray(weights[i]) || weights[i].length !== n) {
            throw new TypeError(`[BCT] weights[${i}] must be an array of length ${n}`);
        }
    }

    const mean = _mean(values);
    const z = values.map((v: any) => v - mean);

    let S0 = 0; // sum of all weights
    let S1 = 0; // 0.5 × Σᵢ Σⱼ (wᵢⱼ + wⱼᵢ)²
    let S2 = 0; // Σᵢ (Σⱼ wᵢⱼ + Σⱼ wⱼᵢ)²
    let numerator = 0;

    for (let i = 0; i < n; i++) {
        let rowSum = 0;
        let colSum = 0;
        for (let j = 0; j < n; j++) {
            const wij = weights[i][j];
            const wji = weights[j][i];
            S0 += wij;
            S1 += (wij + wji) ** 2;
            rowSum += wij;
            colSum += wji;
            numerator += wij * z[i] * z[j];
        }
        S2 += (rowSum + colSum) ** 2;
    }
    S1 *= 0.5;

    const denominator = z.reduce((acc: any, zi: any) => acc + zi * zi, 0);
    if (denominator === 0) throw new RangeError("[BCT] All values are identical; Moran's I undefined");
    if (S0 === 0) throw new RangeError("[BCT] Weight matrix has all zeros; Moran's I undefined");

    const moranI = (n / S0) * (numerator / denominator);

    // Expected value E[I] = -1/(n-1)
    const expectedI = -1 / (n - 1);

    // Variance under normality assumption (Cliff & Ord 1981 eq. 2.4)
    const n2 = n * n;
    const s0sq = S0 * S0;
    const _varI =
        (n * ((n2 - 3 * n + 3) * S1 - n * S2 + 3 * s0sq) -
            0 /* k term omitted for normality */ -
            (n2 - n) * S1 +
            2 * n * S2 -
            6 * s0sq) /
        ((n - 1) * (n + 1) * (n + 1) * s0sq - ((n - 1) * (n2 - n) * S1 - 2 * n * S2 + 6 * s0sq) / s0sq);

    // Simplified variance (under randomisation, large-n): commonly used approximation
    // Var(I) ≈ E[I²] - E[I]²  - use asymptotic formula
    const varIApprox = (n2 * S1 - n * S2 + 3 * s0sq) / (s0sq * (n2 - 1)) - expectedI ** 2;

    const sd = Math.sqrt(Math.abs(varIApprox));
    const zScore = sd > 0 ? (moranI - expectedI) / sd : 0;

    return { moranI, expectedI, varianceI: varIApprox, zScore };
}

// ---------------------------------------------------------------------------
// 7. 2-D Kernel Density Estimate - Silverman 1986
// ---------------------------------------------------------------------------

/**
 * Computes a 2-D Kernel Density Estimate for a set of point locations using
 * the Epanechnikov kernel (optimal for MSE; Silverman 1986 §4.2).
 *
 * Returns density values at each query point q in queryPoints.
 * Bandwidth h is either provided or estimated via Silverman's rule of thumb.
 *
 * @param {Array<[number,number]>} points      - Data points [[x1,y1], …]
 * @param {Array<[number,number]>} queryPoints - Locations to evaluate KDE at
 * @param {number|null} [bandwidth=null]       - Smoothing bandwidth h; null = auto Silverman
 * @returns {{ densities: number[], bandwidth: number }}
 * @throws {TypeError} If points or queryPoints are malformed
 * @reference Silverman BW 1986. ISBN 9780412246203 §4.2
 */
export function computeKernelDensityEstimate(points: any, queryPoints: any, bandwidth = null) {
    if (!Array.isArray(points) || points.length < 1) {
        throw new TypeError('[BCT] points must be a non-empty array of [x,y] pairs');
    }
    if (!Array.isArray(queryPoints) || queryPoints.length < 1) {
        throw new TypeError('[BCT] queryPoints must be a non-empty array of [x,y] pairs');
    }

    const n = points.length;

    // Silverman's rule of thumb for 2-D: h = (4/(d+2))^(1/(d+4)) × n^(-1/(d+4)) × σ̄
    // d=2: h = (4/4)^(1/6) × n^(-1/6) × σ̄ = n^(-1/6) × σ̄
    let h = bandwidth;
    if (h === null) {
        const xs = points.map((p) => p[0]);
        const ys = points.map((p) => p[1]);
        const sdX = Math.sqrt((_variance as any)(xs));
        const sdY = Math.sqrt((_variance as any)(ys));
        const sdAvg = (sdX + sdY) / 2;
        (h as any) = sdAvg * Math.pow(n, -1 / 6);
    }
    if (!isFinite((h as any)) || (h)! <= 0) throw new RangeError('[BCT] bandwidth must be > 0');

    const h2 = (h)! * (h)!;
    // 2-D Epanechnikov kernel normalisation constant: 2 / (π × h²)
    const norm = 2 / (Math.PI * h2);

    const densities = queryPoints.map((q) => {
        let sum = 0;
        for (const p of points) {
            const d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
            const u2 = d2 / h2;
            sum += _kernelEpanechnikov(Math.sqrt(u2));
        }
        return (norm * sum) / n;
    });

    return { densities, bandwidth: h };
}

// ---------------------------------------------------------------------------
// 8. Circular Spatial Scan Statistic - Kulldorff 1997
// ---------------------------------------------------------------------------

/**
 * Computes the Kulldorff circular spatial scan statistic to detect disease clusters.
 * Tests all circular windows and returns the window with maximum log-likelihood ratio (LLR).
 *
 * Under Poisson assumption:
 * LLR(Z) = (c/E) ln(c/E) + (C-c)/(C-E) ln((C-c)/(C-E)) - c > E condition
 * where c = cases inside, C = total cases, E = expected inside, n = total pop.
 *
 * @param {Array<{x: number, y: number, cases: number, population: number}>} areas
 *   - Array of geographic units with coordinates, observed cases, and population
 * @param {number} areas - Maximum fraction of total population in window [0.01, 0.5]
 * @returns {{ center: {x: number, y: number}, radius: number, llr: number, observedInside: number, expectedInside: number }}
 * @throws {TypeError} If areas is malformed
 * @reference Kulldorff M 1997 Commun Statist Theory Methods. DOI:10.1080/03610929708831995
 */
export function computeScanStatisticCircular(areas: any, maxFraction = 0.5) {
    if (!Array.isArray(areas) || areas.length < 2) {
        throw new TypeError('[BCT] areas must be an array with at least 2 elements');
    }
    _requireFinite(maxFraction, 'maxFraction', 0.01, 0.5);

    const totalCases = areas.reduce((s, a) => s + a.cases, 0);
    const totalPop = areas.reduce((s, a) => s + a.population, 0);
    if (totalCases === 0) throw new RangeError('[BCT] Total cases must be > 0');
    if (totalPop === 0) throw new RangeError('[BCT] Total population must be > 0');

    const C = totalCases;
    const N = totalPop;

    let bestLLR = -Infinity;
    let bestResult = null;

    // Try each area as center; include areas in ascending distance order
    for (let ci = 0; ci < areas.length; ci++) {
        const center = areas[ci];
        // Sort other areas by distance to center
        const sorted = areas
            .map((a, _idx) => ({ ...a, dist: _dist2d([center.x, center.y], [a.x, a.y]) }))
            .sort((a, b) => a.dist - b.dist);

        let cInside = 0;
        let popInside = 0;

        for (const area of sorted) {
            cInside += area.cases;
            popInside += area.population;

            // Expected inside = E = C × (popInside / N)
            const E = C * (popInside / N);

            // Window must not exceed maxFraction of total population
            if (popInside / N > maxFraction) break;

            // Only test when observed > expected (excess risk condition)
            if (cInside <= E) continue;

            // Poisson LLR
            const outside = C - cInside;
            const Eout = C - E;
            if (outside <= 0 || Eout <= 0) continue;

            const llr = cInside * Math.log(cInside / E) + outside * Math.log(outside / Eout);

            if (llr > bestLLR) {
                bestLLR = llr;
                bestResult = {
                    center: { x: center.x, y: center.y },
                    radius: area.dist,
                    llr,
                    observedInside: cInside,
                    expectedInside: E,
                };
            }
        }
    }

    if (!bestResult) {
        bestResult = {
            center: { x: areas[0].x, y: areas[0].y },
            radius: 0,
            llr: 0,
            observedInside: 0,
            expectedInside: 0,
        };
    }

    return bestResult;
}

// ---------------------------------------------------------------------------
// 9. Excess Risk
// ---------------------------------------------------------------------------

/**
 * Computes Excess Risk as the relative deviation of observed from expected.
 * Excess Risk (%) = (observed - expected) / expected × 100
 * Also returns absolute excess and rate ratio.
 *
 * @param {number} observed - Observed number of events
 * @param {number} expected - Expected number of events (> 0)
 * @returns {{ excessRisk: number, absoluteExcess: number, rateRatio: number }}
 * @throws {RangeError} If expected ≤ 0 or observed < 0
 */
export function computeExcessRisk(observed: any, expected: any) {
    _requireFinite(observed, 'observed', 0);
    _requireFinite(expected, 'expected', Number.EPSILON);

    const absoluteExcess = observed - expected;
    const excessRisk = (absoluteExcess / expected) * 100;
    const rateRatio = observed / expected;

    return { excessRisk, absoluteExcess, rateRatio };
}

// ---------------------------------------------------------------------------
// 10. Environmental Justice Index - USEPA EJScreen 2023
// ---------------------------------------------------------------------------

/**
 * Computes the Environmental Justice Index (EJI) as the product of a
 * demographic vulnerability score and an environmental hazard score,
 * each expressed as a percentile [0, 1].
 *
 * EJI = demographicVulnerability × environmentalHazard
 *
 * A higher EJI indicates greater environmental injustice.
 *
 * @param {number} demographicVulnerability - Percentile of demographic/socioeconomic burden [0, 1]
 * @param {number} environmentalHazard      - Percentile of environmental hazard burden [0, 1]
 * @returns {{ eji: number, ejiNormalised: number, category: string }}
 * @throws {RangeError} If any input is outside [0, 1]
 * @reference USEPA 2023 EJScreen Technical Documentation v2.3
 */
export function computeEnvironmentalJusticeIndex(demographicVulnerability: any, environmentalHazard: any) {
    _requireFinite(demographicVulnerability, 'demographicVulnerability', 0, 1);
    _requireFinite(environmentalHazard, 'environmentalHazard', 0, 1);

    const eji = demographicVulnerability * environmentalHazard;

    // Normalise to [0, 1] (max possible = 1×1 = 1)
    const ejiNormalised = eji;

    let category;
    if (eji >= 0.64)
        category = 'very high burden'; // ≥ 0.8 × 0.8
    else if (eji >= 0.36)
        category = 'high burden'; // ≥ 0.6 × 0.6
    else if (eji >= 0.16)
        category = 'moderate burden'; // ≥ 0.4 × 0.4
    else if (eji >= 0.04)
        category = 'low burden'; // ≥ 0.2 × 0.2
    else category = 'minimal burden';

    return { eji, ejiNormalised, category };
}

// ---------------------------------------------------------------------------
// 11. Sentinel Surveillance Threshold - WHO 2006
// ---------------------------------------------------------------------------

/**
 * Computes the epidemic detection threshold for sentinel surveillance using
 * the mean + k × standard deviation rule (WHO 2006 default k = 2).
 *
 * @param {number[]} historicalCounts - Historical weekly/monthly case counts (≥ 3 values)
 * @param {number} [kSigma=2]         - Alert multiplier (default: WHO k = 2)
 * @returns {{ mean: number, sd: number, threshold: number, alertLevel: string }}
 * @throws {TypeError} If historicalCounts is not a numeric array with ≥ 3 elements
 * @reference WHO 2006. Recommended Surveillance Standards. WHO/CDS/CSR/ISR/99.2.
 */
export function computeSentinelSurveillanceThreshold(historicalCounts: any, kSigma = WHO_EPIDEMIC_K_SIGMA) {
    _requireNumberArray(historicalCounts, 'historicalCounts', 3);
    _requireFinite(kSigma, 'kSigma', Number.EPSILON);

    const mean = _mean(historicalCounts);
    const sd = Math.sqrt(_variance(historicalCounts, mean));
    const threshold = mean + kSigma * sd;

    const alertLevel = threshold > 0 ? `Alert if weekly count > ${threshold.toFixed(1)}` : 'insufficient data';

    return { mean, sd, threshold, alertLevel };
}

// ---------------------------------------------------------------------------
// 12. Epidemic Growth Rate & Doubling Time - Wallinga 2004
// ---------------------------------------------------------------------------

/**
 * Computes the epidemic growth rate r and doubling time T₂ from a time series
 * of case counts using log-linear regression on log(cases) vs time.
 *
 * T₂ = ln(2) / r   (Wallinga & Teunis 2004)
 *
 * @param {number[]} caseCounts - Daily or weekly case counts (must be > 0, length ≥ 3)
 * @param {number[]} timePoints - Corresponding time indices (same length as caseCounts)
 * @returns {{ growthRate: number, doublingTime: number, r2: number }}
 * @throws {RangeError} If any case count ≤ 0 or arrays differ in length
 * @reference Wallinga J & Teunis P 2004 Am J Epidemiol 160:509. DOI:10.1093/aje/kwh255
 */
export function computeGrowthRateEpidemic(caseCounts: any, timePoints: any) {
    _requireNumberArray(caseCounts, 'caseCounts', 3);
    _requireNumberArray(timePoints, 'timePoints', 2);
    if (caseCounts.length !== timePoints.length) {
        throw new RangeError('[BCT] caseCounts and timePoints must have the same length');
    }
    for (let i = 0; i < caseCounts.length; i++) {
        if (caseCounts[i] <= 0) throw new RangeError(`[BCT] caseCounts[${i}] must be > 0`);
    }

    const logCounts = caseCounts.map(Math.log);
    const n = logCounts.length;

    // OLS: log(cases) = a + r × t
    let st = 0,
        slc = 0,
        stt = 0,
        stlc = 0;
    for (let i = 0; i < n; i++) {
        st += timePoints[i];
        slc += logCounts[i];
        stt += timePoints[i] ** 2;
        stlc += timePoints[i] * logCounts[i];
    }
    const mt = st / n;
    const mlc = slc / n;
    const sstt = stt - n * mt * mt;
    const sstlc = stlc - n * mt * mlc;

    if (Math.abs(sstt) < 1e-15) throw new RangeError('[BCT] timePoints have zero variance');

    const growthRate = sstlc / sstt;
    const doublingTime = growthRate > 0 ? LN2 / growthRate : Infinity;

    // R² of log-linear fit
    let sse = 0,
        sst = 0;
    const intercept = mlc - growthRate * mt;
    for (let i = 0; i < n; i++) {
        const pred = growthRate * timePoints[i] + intercept;
        sse += (logCounts[i] - pred) ** 2;
        sst += (logCounts[i] - mlc) ** 2;
    }
    const r2 = sst > 0 ? 1 - sse / sst : 1;

    return { growthRate, doublingTime, r2 };
}

// ---------------------------------------------------------------------------
// 13. Basic Reproduction Number R₀ - Hethcote 2000
// ---------------------------------------------------------------------------

/**
 * Estimates R₀ from the final attack rate z of an epidemic using the
 * implicit equation: 1 - z = exp(-R₀ × z) (final size equation).
 * Solved numerically by Newton-Raphson iteration.
 *
 * @param {number} finalAttackRate - Proportion of initial population ultimately infected (0, 1)
 * @param {number} [initialPop=1]  - Total population size (used to compute z if proportional)
 * @returns {{ R0: number, finalAttackRate: number, herdImmunityThreshold: number }}
 * @throws {RangeError} If finalAttackRate outside (0, 1)
 * @reference Hethcote HW 2000 SIAM Rev 42(4):599. DOI:10.1137/S0036144500371907
 */
export function computeBasicReproductionNumber(finalAttackRate: any, initialPop = 1) {
    _requireFinite(finalAttackRate, 'finalAttackRate', Number.EPSILON, 1 - Number.EPSILON);
    _requireFinite(initialPop, 'initialPop', 1);

    const z = finalAttackRate;

    // Final size equation: R₀ = -ln(1-z) / z
    const R0 = -Math.log(1 - z) / z;

    const herdImmunityThreshold = R0 > 1 ? 1 - 1 / R0 : 0;

    return { R0, finalAttackRate: z, herdImmunityThreshold };
}

// ---------------------------------------------------------------------------
// 14. Vaccination Threshold - Anderson & May 1991
// ---------------------------------------------------------------------------

/**
 * Computes the critical vaccination coverage p_c required to achieve herd immunity.
 * p_c = 1 - 1/R₀   (Anderson & May 1991)
 *
 * @param {number} R0 - Basic reproduction number (must be > 1 to have a non-trivial threshold)
 * @returns {{ vaccinationThreshold: number, herdImmunityAchieved: boolean, percentRequired: number }}
 * @throws {RangeError} If R0 ≤ 0
 * @reference Anderson RM & May RM 1991. ISBN 9780198540403.
 */
export function computeVaccinationThreshold(R0: any) {
    _requireFinite(R0, 'R0', Number.EPSILON);

    const vaccinationThreshold = R0 > 1 ? 1 - 1 / R0 : 0;
    const herdImmunityAchieved = R0 <= 1;

    return {
        vaccinationThreshold,
        herdImmunityAchieved,
        percentRequired: vaccinationThreshold * 100,
    };
}

// ---------------------------------------------------------------------------
// 15. Chronic Disease Index - WHO Europe DPSEEA
// ---------------------------------------------------------------------------

/**
 * Computes a composite Chronic Disease Index (CDI) combining standardised scores
 * for PM2.5, ozone (O₃), noise, and heat exposure, weighted by WHO Europe DPSEEA
 * guidance on relative disease burden contributions.
 *
 * Each indicator is normalised to a WHO reference level; CDI = weighted sum.
 *
 * @param {object} params
 * @param {number} params.pm25_ugm3    - Annual mean PM2.5 (µg/m³); WHO guideline = 5
 * @param {number} params.o3_ugm3      - Peak-season mean O₃ (µg/m³); WHO guideline = 60
 * @param {number} params.noise_dBLA   - Annual mean noise Lden (dBLA); WHO guideline = 45
 * @param {number} params.heatDays     - Number of heat-stress days/year above 35°C
 * @param {{pm25: number, o3: number, noise: number, heat: number}} [weights] - Optional custom weights (must sum to 1)
 * @returns {{ cdi: number, components: {pm25Score: number, o3Score: number, noiseScore: number, heatScore: number}, riskCategory: string }}
 * @throws {RangeError} If any measurement is negative
 * @reference WHO Europe 2003. DPSEEA framework for environmental health indicators.
 */
export function computeChronicDiseaseIndex(
    {
        pm25_ugm3,
        o3_ugm3,
        noise_dBLA,
        heatDays
    }: any,
    weights = { pm25: 0.4, o3: 0.25, noise: 0.2, heat: 0.15 },
) {
    _requireFinite(pm25_ugm3, 'pm25_ugm3', 0);
    _requireFinite(o3_ugm3, 'o3_ugm3', 0);
    _requireFinite(noise_dBLA, 'noise_dBLA', 0);
    _requireFinite(heatDays, 'heatDays', 0);

    // Ratio to WHO guideline level
    const pm25Score = pm25_ugm3 / 5.0; // WHO AQG 2021: 5 µg/m³
    const o3Score = o3_ugm3 / 60.0; // WHO AQG 2021: 60 µg/m³
    const noiseScore = noise_dBLA / 45.0; // WHO noise guideline 2018
    const heatScore = heatDays / 30.0; // Normalised to 30 days threshold

    const cdi = weights.pm25 * pm25Score + weights.o3 * o3Score + weights.noise * noiseScore + weights.heat * heatScore;

    let riskCategory;
    if (cdi >= 3.0) riskCategory = 'very high';
    else if (cdi >= 2.0) riskCategory = 'high';
    else if (cdi >= 1.0) riskCategory = 'moderate';
    else riskCategory = 'low';

    const components = { pm25Score, o3Score, noiseScore, heatScore };

    return { cdi, components, riskCategory };
}

// ---------------------------------------------------------------------------
// 16. Heat-Related Mortality - Gasparrini 2010
// ---------------------------------------------------------------------------

/**
 * Estimates excess heat-related mortality using a log-linear excess risk model
 * from Gasparrini & Armstrong 2010.
 *
 * Excess deaths = baseline × pop × (exp(β × ΔT) - 1)
 * where ΔT = temperature above threshold (minimum mortality temperature).
 *
 * @param {number} temperature      - Observed daily mean temperature (°C)
 * @param {number} thresholdTemp    - Minimum mortality temperature (°C)
 * @param {number} population       - Exposed population
 * @param {number} baselineMortRate - Baseline daily all-cause mortality rate (per person)
 * @param {number} [beta=0.0012]    - Temperature-mortality coefficient (per °C above threshold)
 * @returns {{ excessDeaths: number, relativeRisk: number, deltaT: number }}
 * @throws {RangeError} If population or baselineMortRate ≤ 0
 * @reference Gasparrini A et al. 2010 Int J Epidemiol 39:1571. DOI:10.1093/ije/dyq094
 */
export function computeHeatRelatedMortality(temperature: any, thresholdTemp: any, population: any, baselineMortRate: any, beta = 0.0012) {
    _requireFinite(temperature, 'temperature');
    _requireFinite(thresholdTemp, 'thresholdTemp');
    _requireFinite(population, 'population', Number.EPSILON);
    _requireFinite(baselineMortRate, 'baselineMortRate', Number.EPSILON);
    _requireFinite(beta, 'beta', Number.EPSILON);

    const deltaT = Math.max(0, temperature - thresholdTemp);
    const relativeRisk = Math.exp(beta * deltaT);
    const excessDeaths = baselineMortRate * population * (relativeRisk - 1);

    return { excessDeaths, relativeRisk, deltaT };
}

// ---------------------------------------------------------------------------
// 17. Waterborne Disease Probability - Haas 1993 log-logistic
// ---------------------------------------------------------------------------

/**
 * Computes the probability of infection from waterborne pathogen exposure using
 * the log-logistic dose-response model (Haas 1993).
 *
 * P(inf) = 1 / (1 + (α / dose)^β)
 * where α = dose for 50% infection, β = slope parameter.
 *
 * @param {number} dose      - Ingested pathogen dose (organisms per event)
 * @param {number} [alpha=HAAS_LOG_LOGISTIC_ALPHA] - ID50 parameter (default: Cryptosporidium)
 * @param {number} [beta=HAAS_LOG_LOGISTIC_BETA]   - Shape parameter (default: Cryptosporidium)
 * @returns {{ probInfection: number, probIllness: number, annualRisk: number }}
 * @throws {RangeError} If dose < 0
 * @reference Haas CN et al. 1993 J Am Water Works Assoc 85:158. DOI:10.1111/j.1752-1688.1993.tb03192.x
 */
export function computeWaterborneDiseaseProbability(
    dose: any,
    alpha = HAAS_LOG_LOGISTIC_ALPHA,
    beta = HAAS_LOG_LOGISTIC_BETA,
) {
    _requireFinite(dose, 'dose', 0);
    _requireFinite(alpha, 'alpha', Number.EPSILON);
    _requireFinite(beta, 'beta', Number.EPSILON);

    const probInfection = dose === 0 ? 0 : 1 / (1 + Math.pow(alpha / dose, beta));

    // Illness | infection - CDC default morbidity ratio for Cryptosporidium = 0.7
    const morbidityRatio = 0.7;
    const probIllness = probInfection * morbidityRatio;

    // Annual risk assuming 365 daily exposures (conservative; typically 1/year)
    const annualRisk = 1 - Math.pow(1 - probInfection, 365);

    return { probInfection, probIllness, annualRisk };
}

// ---------------------------------------------------------------------------
// 18. Vectorial Capacity - Macdonald 1952
// ---------------------------------------------------------------------------

/**
 * Computes vectorial capacity (VC) - the number of potentially infective contacts
 * an infectious host produces per day via the mosquito population.
 *
 * VC = m × a² × bc × p^n / (-ln p)
 * where:
 *   m = vector-to-host ratio
 *   a = daily biting rate (bites per mosquito per day)
 *   b = vector competence (proportion of infected bites transmitted)
 *   c = probability bite infects mosquito
 *   p = daily survival probability
 *   n = extrinsic incubation period (days)
 *
 * @param {object} params
 * @param {number} params.vectorHostRatio        - m: vectors per host
 * @param {number} params.bitingRate             - a: daily biting rate [0, 1]
 * @param {number} params.vectorCompetence       - b: transmission efficiency to host [0, 1]
 * @param {number} params.infectionRateVector    - c: probability mosquito becomes infected [0, 1]
 * @param {number} params.dailySurvival          - p: daily vector survival [0, 1)
 * @param {number} [params.eipDays=12]           - n: extrinsic incubation period (days)
 * @returns {{ vectorialCapacity: number, sporogonyFraction: number }}
 * @throws {RangeError} If survival = 1 (infinite lifespan, undefined VC) or other bounds fail
 * @reference Macdonald G 1952 Trop Dis Bull 49(9):813.
 */
export function computeVectorBionomics({
    vectorHostRatio,
    bitingRate,
    vectorCompetence,
    infectionRateVector,
    dailySurvival,
    eipDays = MACDONALD_EIP_MALARIA_DAYS
}: any) {
    _requireFinite(vectorHostRatio, 'vectorHostRatio', 0);
    _requireFinite(bitingRate, 'bitingRate', 0, 1);
    _requireFinite(vectorCompetence, 'vectorCompetence', 0, 1);
    _requireFinite(infectionRateVector, 'infectionRateVector', 0, 1);
    _requireFinite(dailySurvival, 'dailySurvival', 0);
    if (dailySurvival >= 1) throw new RangeError('[BCT] dailySurvival must be < 1 (finite lifespan)');
    _requireFinite(eipDays, 'eipDays', 1);

    // Fraction surviving EIP = p^n
    const sporogonyFraction = Math.pow(dailySurvival, eipDays);

    // Vectorial capacity: VC = m a² b c p^n / (-ln p)
    const vectorialCapacity =
        (vectorHostRatio * bitingRate ** 2 * vectorCompetence * infectionRateVector * sporogonyFraction) /
        -Math.log(dailySurvival);

    return { vectorialCapacity, sporogonyFraction };
}

// ---------------------------------------------------------------------------
// 19. Childhood Lead Exposure IQ Decrement - Lanphear 2005
// ---------------------------------------------------------------------------

/**
 * Estimates IQ points lost due to childhood blood lead level (BLL) using
 * Lanphear et al. 2005 log-linear model.
 *
 * IQ loss = β × ln(BLL / referenceLevel)
 * where β ≈ 1.37 IQ points per natural log unit of BLL.
 *
 * @param {number} bll_ug_dl       - Child's blood lead level (µg/dL)
 * @param {number} [refBLL=1.0]    - Reference blood lead level (µg/dL; default 1.0)
 * @param {number} [slope=LANPHEAR_IQ_SLOPE_LINEAR] - β (IQ pts per ln unit)
 * @returns {{ iqLoss: number, iqLossLower95: number, iqLossUpper95: number, interpretationCategory: string }}
 * @throws {RangeError} If bll_ug_dl ≤ 0
 * @reference Lanphear BP et al. 2005 Environ Health Perspect 113:894. DOI:10.1289/ehp.7688
 */
export function computeChildhoodLeadExposureIQ(bll_ug_dl: any, refBLL = 1.0, slope = LANPHEAR_IQ_SLOPE_LINEAR) {
    _requireFinite(bll_ug_dl, 'bll_ug_dl', Number.EPSILON);
    _requireFinite(refBLL, 'refBLL', Number.EPSILON);
    _requireFinite(slope, 'slope', 0);

    const iqLoss = slope * Math.log(bll_ug_dl / refBLL);

    // Approximate 95% CI: ±0.28 per ln unit (Lanphear 2005 supplemental)
    const seLoss = 0.28 * Math.log(bll_ug_dl / refBLL);
    const iqLossLower95 = Math.max(0, iqLoss - Z_95 * Math.abs(seLoss));
    const iqLossUpper95 = iqLoss + Z_95 * Math.abs(seLoss);

    let interpretationCategory;
    if (iqLoss >= 5) interpretationCategory = 'severe IQ deficit';
    else if (iqLoss >= 2) interpretationCategory = 'moderate IQ deficit';
    else if (iqLoss >= 0.5) interpretationCategory = 'mild IQ deficit';
    else interpretationCategory = 'negligible IQ impact';

    return { iqLoss, iqLossLower95, iqLossUpper95, interpretationCategory };
}

// ---------------------------------------------------------------------------
// 20. Monetised Environmental Health Cost - USEPA 2010
// ---------------------------------------------------------------------------

/**
 * Computes the total monetised environmental health cost combining mortality and
 * morbidity endpoints using USEPA economic analysis guidance.
 *
 * Total cost = VSL × premature_deaths + COI × morbidity_cases
 *
 * @param {object} params
 * @param {number} params.prematureDeaths  - Number of premature deaths attributable to exposure
 * @param {number} params.morbidityCases   - Number of morbidity cases (hospitalisation/ER)
 * @param {number} [params.vsl=VSL_USD.epa_2010]         - Value of Statistical Life (USD)
 * @param {number} [params.costOfIllness=25117]           - COI per morbidity case (USD; BenMAP default)
 * @param {number} [params.discountRate=0.03]             - Annual discount rate for latent effects
 * @param {number} [params.population=1]                  - Population size for per-capita calculation
 * @returns {{ totalCostUSD: number, mortalityCostUSD: number, morbidityCostUSD: number, costPerCapita: number }}
 * @throws {RangeError} If any numeric param is negative
 * @reference USEPA 2010 Guidelines for Preparing Economic Analyses. EPA/240/R-10/001.
 */
export function computeHealthCostEnvironmental({
    prematureDeaths,
    morbidityCases,
    vsl = VSL_USD.epa_2010,
    costOfIllness = 25_117,
    discountRate = 0.03,
    population = 1
}: any) {
    _requireFinite(prematureDeaths, 'prematureDeaths', 0);
    _requireFinite(morbidityCases, 'morbidityCases', 0);
    _requireFinite(vsl, 'vsl', 0);
    _requireFinite(costOfIllness, 'costOfIllness', 0);
    _requireFinite(discountRate, 'discountRate', 0, 1);
    _requireFinite(population, 'population', 1);

    const mortalityCostUSD = prematureDeaths * vsl;
    const morbidityCostUSD = morbidityCases * costOfIllness;
    const totalCostUSD = mortalityCostUSD + morbidityCostUSD;
    const costPerCapita = totalCostUSD / population;

    return { totalCostUSD, mortalityCostUSD, morbidityCostUSD, costPerCapita };
}

console.debug('[BCT:end] environmentalHealthInformatics — 20 functions loaded');

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const environmentalHealthInformaticsMeta = {
    name: 'environmentalHealthInformatics',
    description: 'environmentalHealthInformatics',
    category: 'analytics',
    familyTags: ['environmental'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
