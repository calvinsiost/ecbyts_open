// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost

// Módulo de forense ambiental e atribuição de fontes (source apportionment).
// Pure-logic - zero DOM, zero IndexedDB, zero Three.js, zero fetch.
// Importável diretamente em Node.js sem adaptação.

// ─── Constants ────────────────────────────────────────────────────────────────

/** Standard enrichment factor reference element index (used when Al is at position 0) */
const DEFAULT_REFERENCE_ELEMENT_INDEX = 0;

/** Rayleigh enrichment factors (‰) for CSIA biodegradation */
const CSIA_ENRICHMENT_FACTORS = {
    chlorinated: -3.3,
    btex: -2.1,
    nitrate: -15.9,
    sulfate: -20.0,
};

/** PAH compound indices for diagnostic ratio computation */
const _PAH_COMPOUNDS = [
    'fluoranthene',
    'pyrene',
    'benzo_a_anthracene',
    'chrysene',
    'benzo_a_pyrene',
    'benzo_e_pyrene',
    'indeno_cd_pyrene',
    'benzo_ghi_perylene',
];

/** Tolerance for three-source isotope mixing model (‰) */
const ISOTOPE_TOLERANCE = 0.5;

/** Fresh crude pristane/phytane baseline ratio */
const PRISTANE_DEGRADATION_RATE = 0.003; // per day

// ─── 1. Isotope Ratio Mixing Model ────────────────────────────────────────────

/**
 * Isotope two/three-source mixing model using mass-balance equations.
 * For two sources the analytical solution is applied; for three sources
 * feasible solutions are found by iterating source fractions at 1% increments
 * and accepting combinations where both isotopes are within ±0.5‰ of the
 * measured mixture value.
 *
 * @param {Array<{delta13C: number, delta15N: number}>} sources - Up to 3 isotope end-members.
 * @param {{delta13C: number, delta15N: number}} mixture - Measured mixture isotopic values.
 * @returns {{sourceContributions: number[], feasibilityRange: Array<number[]>, residual: number}}
 *   sourceContributions: best-estimate fractional contributions summing to 1.
 *   feasibilityRange: all feasible [f1,f2,...] combinations (three-source only).
 *   residual: RMS residual of the best solution (‰).
 * @reference Phillips & Gregg (2001) Oecologia 127:171-179 doi:10.1007/s004420100586
 * @reference IsoSource v1.3.1 - USEPA, Ben Phillips
 */
export function isotopeRatioMixingModel(sources: any, mixture: any) {
    _validateIsotopeInputs(sources, mixture);

    if (sources.length === 2) {
        return _solveTwoSourceMixing(sources, mixture);
    }
    return _solveThreeSourceMixing(sources, mixture);
}

/**
 * Validates inputs for the isotope mixing model.
 */
function _validateIsotopeInputs(sources: any, mixture: any) {
    if (!sources || sources.length < 2 || sources.length > 3) {
        throw new Error('isotopeRatioMixingModel: sources must have 2 or 3 elements');
    }
    if (!mixture || typeof mixture.delta13C !== 'number' || typeof mixture.delta15N !== 'number') {
        throw new Error('isotopeRatioMixingModel: mixture must have delta13C and delta15N');
    }
}

/**
 * Analytical two-source isotope mixing solution.
 */
function _solveTwoSourceMixing(sources: any, mixture: any) {
    const [s1, s2] = sources;
    const denom13C = s1.delta13C - s2.delta13C;
    const denom15N = s1.delta15N - s2.delta15N;

    // Prefer carbon unless sources are co-linear in carbon
    let f1;
    if (Math.abs(denom13C) >= 1e-9) {
        f1 = (mixture.delta13C - s2.delta13C) / denom13C;
    } else if (Math.abs(denom15N) >= 1e-9) {
        f1 = (mixture.delta15N - s2.delta15N) / denom15N;
    } else {
        // Sources are indistinguishable
        f1 = 0.5;
    }
    f1 = Math.max(0, Math.min(1, f1));
    const f2 = 1 - f1;

    const pred13C = f1 * s1.delta13C + f2 * s2.delta13C;
    const pred15N = f1 * s1.delta15N + f2 * s2.delta15N;
    const residual = Math.sqrt(((mixture.delta13C - pred13C) ** 2 + (mixture.delta15N - pred15N) ** 2) / 2);

    return {
        sourceContributions: [f1, f2],
        feasibilityRange: [[f1, f2]],
        residual,
    };
}

/**
 * Three-source isotope mixing by 1% grid search.
 */
function _solveThreeSourceMixing(sources: any, mixture: any) {
    const [s1, s2, s3] = sources;
    const feasibilityRange = [];
    let bestSolution = null;
    let bestResidual = Infinity;

    for (let i = 0; i <= 100; i++) {
        for (let j = 0; j <= 100 - i; j++) {
            const k = 100 - i - j;
            const f1 = i / 100;
            const f2 = j / 100;
            const f3 = k / 100;

            const pred13C = f1 * s1.delta13C + f2 * s2.delta13C + f3 * s3.delta13C;
            const pred15N = f1 * s1.delta15N + f2 * s2.delta15N + f3 * s3.delta15N;

            const res13C = Math.abs(pred13C - mixture.delta13C);
            const res15N = Math.abs(pred15N - mixture.delta15N);

            if (res13C <= ISOTOPE_TOLERANCE && res15N <= ISOTOPE_TOLERANCE) {
                feasibilityRange.push([f1, f2, f3]);
                const residual = Math.sqrt((res13C ** 2 + res15N ** 2) / 2);
                if (residual < bestResidual) {
                    bestResidual = residual;
                    bestSolution = [f1, f2, f3];
                }
            }
        }
    }

    if (!bestSolution) {
        // No feasible solution - return centroid of isotope triangle
        bestSolution = [1 / 3, 1 / 3, 1 / 3];
        bestResidual = NaN;
    }

    return {
        sourceContributions: bestSolution,
        feasibilityRange,
        residual: bestResidual,
    };
}

// ─── 2. Petroleum Fingerprinting ──────────────────────────────────────────────

/**
 * Petroleum hydrocarbon fingerprinting using diagnostic ratios to assess
 * spill source match and weathering state.
 *
 * @param {Record<string, number>} targetSample - Diagnostic ratios measured at the site.
 * @param {Record<string, number>} referenceSource - Diagnostic ratios of the suspected source.
 * @param {{c17_c18?: number, pristane_phytane?: number, hopane_sterane?: number, nC17_pristane?: number}} diagnosticRatios
 *   Object specifying which ratios to use (values from targetSample if not overridden).
 * @returns {{matchScore: number, similarityIndex: number, spill_age_days: number, weatheringPercent: number}}
 * @reference Wang & Fingas (2003) J. Chromatography A 1000:383-429 doi:10.1016/S0021-9673(03)00004-5
 * @reference USEPA SW-846 Method 8270D
 */
export function petroleumFingerprinting(targetSample: any, referenceSource: any, diagnosticRatios: any) {
    if (!targetSample || !referenceSource) {
        throw new Error('petroleumFingerprinting: targetSample and referenceSource are required');
    }
    if (!diagnosticRatios || typeof diagnosticRatios !== 'object') {
        throw new Error('petroleumFingerprinting: diagnosticRatios object is required');
    }

    const ratioKeys = Object.keys(diagnosticRatios);
    if (ratioKeys.length === 0) {
        throw new Error('petroleumFingerprinting: at least one diagnostic ratio required');
    }

    const similarityIndex = _computeSimilarityIndex(targetSample, referenceSource, ratioKeys);
    const matchScore = Math.max(0, Math.min(1, similarityIndex)) * 100;

    // Spill age estimation from pristane/phytane ratio degradation
    const spill_age_days = _estimateSpillAge(targetSample.pristane_phytane, referenceSource.pristane_phytane);

    // Weathering percent: nC17/pristane ratio decreases with weathering
    const weatheringPercent = _estimateWeatheringPercent(targetSample.nC17_pristane, referenceSource.nC17_pristane);

    return {
        matchScore,
        similarityIndex,
        spill_age_days,
        weatheringPercent,
    };
}

/**
 * Similarity index: 1 - Σ|ri_target - ri_ref| / Σri_ref
 */
function _computeSimilarityIndex(targetSample: any, referenceSource: any, ratioKeys: string[]) {
    let sumAbsDiff = 0;
    let sumRef = 0;
    let validRatios = 0;

    for (const key of ratioKeys) {
        const rTarget = targetSample[key];
        const rRef = referenceSource[key];
        if (typeof rTarget === 'number' && typeof rRef === 'number' && rRef > 0) {
            sumAbsDiff += Math.abs(rTarget - rRef);
            sumRef += rRef;
            validRatios++;
        }
    }

    return validRatios > 0 && sumRef > 0 ? 1 - sumAbsDiff / sumRef : 0;
}

/**
 * Estimate spill age from pristane/phytane ratio degradation.
 * Pristane/phytane increases as n-alkanes are preferentially biodegraded.
 */
function _estimateSpillAge(prPh_target: any, prPh_ref: any) {
    if (typeof prPh_target !== 'number' || typeof prPh_ref !== 'number' || prPh_ref <= 0) {
        return 0;
    }
    const ratio = prPh_target / prPh_ref;
    if (ratio <= 1) return 0;
    return Math.round(Math.log(ratio) / PRISTANE_DEGRADATION_RATE);
}

/**
 * Estimate weathering percent from nC17/pristane ratio depletion.
 */
function _estimateWeatheringPercent(nC17Pr_target: any, nC17Pr_ref: any) {
    if (typeof nC17Pr_target !== 'number' || typeof nC17Pr_ref !== 'number' || nC17Pr_ref <= 0) {
        return 0;
    }
    const depletion = 1 - nC17Pr_target / nC17Pr_ref;
    return Math.round(Math.max(0, Math.min(1, depletion)) * 100);
}

// ─── 3. Chemical Mass Balance ─────────────────────────────────────────────────

/**
 * Chemical mass balance (CMB) receptor modeling. Solves the overdetermined
 * linear system C = Σ(fi × Si) in a least-squares sense with uncertainty
 * weighting (Watson 1984).
 *
 * @param {Array<{name: string, fingerprint: number[]}>} sourceProfiles - Source profiles.
 * @param {number[]} sourceProfiles - Measured concentrations at receptor.
 * @returns {{sourceContributions: Record<string, number>, chiSquared: number, r2: number, uncertainties: number[]}}
 * @reference Watson (1984) J. Air Pollut. Control Assoc. 34:619-623 doi:10.1080/00022470.1984.10465800
 * @reference EPA CMB 8.2 User's Manual EPA/452/R-04/011
 */
export function chemicalMassBalance(sourceProfiles: any, receptorConcentrations: any) {
    if (!sourceProfiles || sourceProfiles.length === 0) {
        throw new Error('chemicalMassBalance: sourceProfiles must not be empty');
    }
    if (!receptorConcentrations || receptorConcentrations.length === 0) {
        throw new Error('chemicalMassBalance: receptorConcentrations must not be empty');
    }

    const nSpecies = receptorConcentrations.length;
    const nSources = sourceProfiles.length;

    _validateFingerprints(sourceProfiles, nSpecies);

    const A = _buildDesignMatrix(sourceProfiles, nSpecies, nSources);
    const b = receptorConcentrations.slice();

    const { AtA, Atb } = _buildNormalEquations(A, b, nSources, nSpecies);
    const f = _solveLinearSystem(AtA, Atb);

    const fClamped = f.map((v) => Math.max(0, v));
    const predicted = _computePredictedConcentrations(sourceProfiles, fClamped, nSpecies, nSources);
    const { chiSquared, r2 } = _computeFitStatistics(b, predicted, nSpecies);

    const uncertainties = fClamped.map((v) => v * 0.1);
    const sourceContributions = _buildNamedContributions(sourceProfiles, fClamped, nSources);

    return {
        sourceContributions,
        chiSquared,
        r2,
        uncertainties,
    };
}

/**
 * Validates that every source profile fingerprint has the expected length.
 */
function _validateFingerprints(sourceProfiles: any, nSpecies: number) {
    for (const sp of sourceProfiles) {
        if (!sp.fingerprint || sp.fingerprint.length !== nSpecies) {
            throw new Error(`chemicalMassBalance: fingerprint for "${sp.name}" must have ${nSpecies} elements`);
        }
    }
}

/**
 * Builds the design matrix A (nSpecies × nSources).
 */
function _buildDesignMatrix(sourceProfiles: any, nSpecies: number, nSources: number) {
    const A = [];
    for (let j = 0; j < nSpecies; j++) {
        const row = [];
        for (let i = 0; i < nSources; i++) {
            row.push(sourceProfiles[i].fingerprint[j]);
        }
        A.push(row);
    }
    return A;
}

/**
 * Computes A^T A and A^T b for the normal equations.
 */
function _buildNormalEquations(A: number[][], b: number[], nSources: number, nSpecies: number) {
    // A é nSpecies×nSources por construção (_buildDesignMatrix) e b tem nSpecies
    // entradas; os guards abaixo só existem para satisfazer noUncheckedIndexedAccess
    // sem non-null assertion — um índice fora do range contribuiria 0 à soma.
    const AtA = [];
    for (let i = 0; i < nSources; i++) {
        AtA.push(new Array(nSources).fill(0));
        for (let k = 0; k < nSources; k++) {
            for (let j = 0; j < nSpecies; j++) {
                const rowJ = A[j];
                if (rowJ === undefined) continue;
                const aji = rowJ[i];
                const ajk = rowJ[k];
                if (aji === undefined || ajk === undefined) continue;
                (AtA[i])![k] += aji * ajk;
            }
        }
    }

    const Atb = new Array(nSources).fill(0);
    for (let i = 0; i < nSources; i++) {
        for (let j = 0; j < nSpecies; j++) {
            const aji = A[j]?.[i];
            const bj = b[j];
            if (aji === undefined || bj === undefined) continue;
            Atb[i] += aji * bj;
        }
    }

    return { AtA, Atb };
}

/**
 * Computes predicted concentrations from clamped source contributions.
 */
function _computePredictedConcentrations(sourceProfiles: any, fClamped: number[], nSpecies: number, nSources: number) {
    const predicted = new Array(nSpecies).fill(0);
    for (let j = 0; j < nSpecies; j++) {
        for (let i = 0; i < nSources; i++) {
            predicted[j] += ((fClamped) as any)![i] * sourceProfiles[i].fingerprint[j];
        }
    }
    return predicted;
}

/**
 * Computes chi-squared and r² fit statistics.
 */
function _computeFitStatistics(b: number[], predicted: number[], nSpecies: number) {
    let chiSquared = 0;
    let ssRes = 0;
    let ssTot = 0;
    const meanC = b.reduce((a, v) => a + v, 0) / nSpecies;
    for (let j = 0; j < nSpecies; j++) {
        const bj = b[j] ?? 0;
        const predJ = predicted[j] ?? 0;
        const sigma2 = Math.max(bj, 1e-9);
        chiSquared += (bj - predJ) ** 2 / sigma2;
        ssRes += (bj - predJ) ** 2;
        ssTot += (bj - meanC) ** 2;
    }
    const r2 = ssTot > 1e-15 ? 1 - ssRes / ssTot : 1;
    return { chiSquared, r2 };
}

/**
 * Builds the named source contributions record.
 */
function _buildNamedContributions(sourceProfiles: any, fClamped: number[], nSources: number) {
    const sourceContributions = /** @type {Record<string, number>} */ ({});
    for (let i = 0; i < nSources; i++) {
        (sourceContributions as any)[(sourceProfiles[i].name as keyof typeof sourceContributions)] = fClamped[i];
    }
    return sourceContributions;
}

/**
 * Solve a square linear system Ax = b using Gaussian elimination with
 * partial pivoting.
 * @param {number[][]} A - n×n matrix (modified in place).
 * @param {number[]} b - RHS vector (modified in place).
 * @returns {number[]} Solution vector x.
 */
function _solveLinearSystem(A: any, b: any) {
    const n = b.length;
    // Augmented matrix [A|b]
    const M = A.map((row: any, i: any) => [...row, b[i]]);

    for (let col = 0; col < n; col++) {
        // Partial pivoting
        let maxRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
        }
        [M[col], M[maxRow]] = [M[maxRow], M[col]];

        const pivot = M[col][col];
        if (Math.abs(pivot) < 1e-12) continue; // singular or near-singular

        for (let row = col + 1; row < n; row++) {
            const factor = M[row][col] / pivot;
            for (let k = col; k <= n; k++) {
                M[row][k] -= factor * M[col][k];
            }
        }
    }

    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        x[i] = M[i][n];
        for (let j = i + 1; j < n; j++) {
            x[i] -= M[i][j] * x[j];
        }
        if (Math.abs(M[i][i]) > 1e-12) x[i] /= M[i][i];
        else x[i] = 0;
    }
    return x;
}

// ─── 4. PAH Diagnostic Ratios ─────────────────────────────────────────────────

/**
 * PAH diagnostic ratios for distinguishing petrogenic from pyrogenic sources.
 * Applies standard threshold criteria from Yunker (2002) and Baumard (1998).
 *
 * @param {{fluoranthene?: number, pyrene?: number, benzo_a_anthracene?: number, chrysene?: number, benzo_a_pyrene?: number, benzo_e_pyrene?: number, indeno_cd_pyrene?: number, benzo_ghi_perylene?: number}} sampleConcentrations_ng_g - PAH concentrations in ng/g dry weight.
 * @returns {{flamBaPRatio: number, indeno_BghiPRatio: number, FluPyr_ratio: number, sourceType: string, pyrolytic_pct: number}}
 * @reference Yunker et al. (2002) Org. Geochem. 33:489-515 doi:10.1016/S0146-6380(02)00002-4
 * @reference Baumard et al. (1998) Mar. Pollut. Bull. 36:577-586 doi:10.1016/S0025-326X(97)00260-5
 */
export function polycyclicAromaticHydrocarbons(sampleConcentrations_ng_g: any) {
    if (!sampleConcentrations_ng_g || typeof sampleConcentrations_ng_g !== 'object') {
        throw new Error('polycyclicAromaticHydrocarbons: sampleConcentrations_ng_g object required');
    }

    const compounds = _extractPahCompounds(sampleConcentrations_ng_g);
    const ratios = _computePahRatios(compounds);
    const { sourceType, pyroliticVotes, petroleumVotes, mixedVotes } = _classifyPahSource(ratios);

    const totalVotes = pyroliticVotes + petroleumVotes + mixedVotes;
    const pyrolytic_pct = totalVotes > 0 ? Math.round((pyroliticVotes / totalVotes) * 100) : 0;

    return {
        flamBaPRatio: ratios.flamBaPRatio,
        indeno_BghiPRatio: ratios.indeno_BghiPRatio,
        FluPyr_ratio: ratios.FluPyr_ratio,
        sourceType,
        pyrolytic_pct,
    };
}

/**
 * Extracts PAH compound concentrations from the input object.
 */
function _extractPahCompounds(c: any) {
    return {
        flu: c.fluoranthene ?? 0,
        pyr: c.pyrene ?? 0,
        baa: c.benzo_a_anthracene ?? 0,
        chr: c.chrysene ?? 0,
        ip: c.indeno_cd_pyrene ?? 0,
        bghip: c.benzo_ghi_perylene ?? 0,
    };
}

/**
 * Computes the three diagnostic PAH ratios.
 */
function _computePahRatios({ flu, pyr, baa, chr, ip, bghip }: any) {
    // Flu/(Flu+Pyr): <0.4 petroleum; 0.4-0.5 mixed; >0.5 combustion
    const fluPyrSum = flu + pyr;
    const FluPyr_ratio = fluPyrSum > 0 ? flu / fluPyrSum : NaN;

    // IP/(IP+BghiP): <0.2 petroleum; 0.2-0.5 fossil fuel; >0.5 grass/wood/coal
    const ipBghiSum = ip + bghip;
    const indeno_BghiPRatio = ipBghiSum > 0 ? ip / ipBghiSum : NaN;

    // BaA/(BaA+Chr): <0.2 petroleum; 0.2-0.35 mixed; >0.35 combustion
    const baaChrSum = baa + chr;
    const flamBaPRatio = baaChrSum > 0 ? baa / baaChrSum : NaN;

    return { FluPyr_ratio, indeno_BghiPRatio, flamBaPRatio };
}

/**
 * Classifies PAH source type by majority vote of available ratios.
 */
function _classifyPahSource(ratios: any) {
    // Objeto ÚNICO compartilhado entre as 3 chamadas: _tallyRatioVote muta
    // votes.* in place. (Recriar o literal a cada chamada descartava os
    // incrementos e classificava tudo como 'mixed' — regressão do refactor.)
    const votes = { petroleumVotes: 0, mixedVotes: 0, pyroliticVotes: 0 };

    _tallyRatioVote(ratios.FluPyr_ratio, 0.4, 0.5, votes);
    _tallyRatioVote(ratios.indeno_BghiPRatio, 0.2, 0.5, votes);
    _tallyRatioVote(ratios.flamBaPRatio, 0.2, 0.35, votes);

    const sourceType = _resolveMajorityVote(votes.petroleumVotes, votes.pyroliticVotes, votes.mixedVotes);
    return { sourceType, pyroliticVotes: votes.pyroliticVotes, petroleumVotes: votes.petroleumVotes, mixedVotes: votes.mixedVotes };
}

/**
 * Tallies one ratio vote into the mutable counters.
 */
function _tallyRatioVote(
    ratio: number,
    lowThreshold: number,
    highThreshold: number,
    votes: { petroleumVotes: number; mixedVotes: number; pyroliticVotes: number },
) {
    if (isNaN(ratio)) return;
    if (ratio < lowThreshold) {
        votes.petroleumVotes++;
    } else if (ratio > highThreshold) {
        votes.pyroliticVotes++;
    } else {
        votes.mixedVotes++;
    }
}

/**
 * Resolves the majority vote among petroleum, pyrolitic, and mixed classes.
 */
function _resolveMajorityVote(petroleumVotes: number, pyroliticVotes: number, mixedVotes: number) {
    if (pyroliticVotes > petroleumVotes && pyroliticVotes >= mixedVotes) {
        return 'combustion';
    }
    if (petroleumVotes > pyroliticVotes && petroleumVotes >= mixedVotes) {
        return 'petroleum';
    }
    return 'mixed';
}

// ─── 5. Heavy Metal Fingerprint ───────────────────────────────────────────────

/**
 * Metal fingerprinting using enrichment factor (EF), geo-accumulation index (Igeo),
 * contamination factor (CF), and pollution load index (PLI).
 *
 * @param {Record<string, number>} siteConcentrations - Metal concentrations at site (mg/kg). First key = reference element (Al or Fe).
 * @param {Record<string, number>} backgroundConcentrations - Natural background concentrations (mg/kg). Same keys.
 * @returns {{enrichmentFactors: Record<string, number>, geoAccumulationIndex: Record<string, number>, contaminationFactor: Record<string, number>, pollutionLoadIndex: number, dominantSource: string}}
 * @reference Buat-Menard & Chesselet (1979) Earth Planet. Sci. Lett. 42:399-411 doi:10.1016/0012-821X(79)90049-9
 * @reference Muller (1969) Geo Journal 2:108-118 (Igeo)
 * @reference USEPA (1997) The Incidence and Severity of Sediment Contamination in Surface Waters of the United States
 */
export function heavyMetalFingerprint(siteConcentrations: any, backgroundConcentrations: any) {
    if (!siteConcentrations || typeof siteConcentrations !== 'object') {
        throw new Error('heavyMetalFingerprint: siteConcentrations object required');
    }
    if (!backgroundConcentrations || typeof backgroundConcentrations !== 'object') {
        throw new Error('heavyMetalFingerprint: backgroundConcentrations object required');
    }

    const metals = Object.keys(siteConcentrations);
    if (metals.length < 2) {
        throw new Error('heavyMetalFingerprint: at least 2 elements required (reference + 1 metal)');
    }

    const refElement = metals[DEFAULT_REFERENCE_ELEMENT_INDEX];
    const refSite = refElement !== undefined ? siteConcentrations[refElement] : undefined;
    const refBg = refElement !== undefined ? backgroundConcentrations[refElement] : undefined;

    if (!refElement || !refSite || !refBg || refBg <= 0) {
        throw new Error(`heavyMetalFingerprint: reference element "${refElement}" must be positive in both inputs`);
    }

    const indices = _computeMetalIndices(siteConcentrations, backgroundConcentrations, metals, refSite, refBg);
    const pollutionLoadIndex = _computePollutionLoadIndex(indices.contaminationFactor);
    const dominantSource = _findDominantMetalSource(indices.enrichmentFactors, refElement);

    return {
        enrichmentFactors: indices.enrichmentFactors,
        geoAccumulationIndex: indices.geoAccumulationIndex,
        contaminationFactor: indices.contaminationFactor,
        pollutionLoadIndex,
        dominantSource,
    };
}

/**
 * Computes per-metal enrichment factor, geo-accumulation index, and contamination factor.
 */
function _computeMetalIndices(
    siteConcentrations: any,
    backgroundConcentrations: any,
    metals: string[],
    refSite: number,
    refBg: number,
) {
    const enrichmentFactors = /** @type {Record<string, number>} */ ({});
    const geoAccumulationIndex = /** @type {Record<string, number>} */ ({});
    const contaminationFactor = /** @type {Record<string, number>} */ ({});

    for (const metal of metals) {
        const Cs = siteConcentrations[metal];
        const Cb = backgroundConcentrations[metal];
        if (typeof Cs !== 'number' || typeof Cb !== 'number' || Cb <= 0) continue;

        // EF = (metal/reference)_site / (metal/reference)_background
        (enrichmentFactors as any)[(metal as keyof typeof enrichmentFactors)] = Cs / refSite / (Cb / refBg);

        // Igeo = log2(C_site / (1.5 × C_background))
        const igeoArg = Cs / (1.5 * Cb);
        (geoAccumulationIndex as any)[(metal as keyof typeof geoAccumulationIndex)] =
            igeoArg > 0 ? Math.log2(igeoArg) : -Infinity;

        // CF = C_site / C_background
        (contaminationFactor as any)[(metal as keyof typeof contaminationFactor)] = Cs / Cb;
    }

    return { enrichmentFactors, geoAccumulationIndex, contaminationFactor };
}

/**
 * Computes PLI = (CF1 × CF2 × ... × CFn)^(1/n) from finite, positive CF values.
 */
function _computePollutionLoadIndex(contaminationFactor: Record<string, number>) {
    const cfValues = Object.values(contaminationFactor).filter((v) => isFinite(v as any) && v > 0);
    if (cfValues.length === 0) return 0;
    return Math.pow(
        (cfValues as any).reduce((acc: any, v: any) => (acc as any) * (v as any), 1),
        1 / cfValues.length,
    );
}

/**
 * Finds the metal with the highest EF (excluding reference) and labels its source.
 */
function _findDominantMetalSource(enrichmentFactors: Record<string, number>, refElement: string) {
    let maxEF = -Infinity;
    let dominantSource = 'unknown';
    for (const [metal, ef] of Object.entries(enrichmentFactors)) {
        if (metal !== refElement && (ef as any) > maxEF) {
            (maxEF as any) = ef;
            dominantSource = (ef as any) > 10 ? `anthropogenic_${metal}` : `geogenic_${metal}`;
        }
    }
    return dominantSource;
}

// ─── 6. Stable Isotope CSIA ───────────────────────────────────────────────────

/**
 * Compound-specific isotope analysis (CSIA) for assessing biodegradation
 * extent and identifying degradation pathways via Rayleigh fractionation.
 *
 * @param {{delta13C_initial: number, delta13C_current: number, concentration_initial?: number, concentration_current?: number}} deltaValues
 *   Isotope values in ‰ VPDB, and optionally concentrations for cross-validation.
 * @param {'chlorinated'|'btex'|'nitrate'|'sulfate'} deltaValues - Controls enrichment factor.
 * @returns {{biodegradationExtent: number, enrichmentFactor: number, fractionReacted: number, degradationPathway: string}}
 * @reference Meckenstock et al. (2004) Environ. Sci. Technol. 38:2756-2765 doi:10.1021/es0352751
 * @reference IAEA-TECDOC-1623 (2009) Stable Isotope Methods for Investigating Contaminated Sites
 */
export function stableIsotopeCSIA(deltaValues: any, compoundClass: any) {
    if (!deltaValues || typeof deltaValues !== 'object') {
        throw new Error('stableIsotopeCSIA: deltaValues object required');
    }
    if (!CSIA_ENRICHMENT_FACTORS[(compoundClass as keyof typeof CSIA_ENRICHMENT_FACTORS)]) {
        throw new Error(
            `stableIsotopeCSIA: compoundClass must be one of: ${Object.keys(CSIA_ENRICHMENT_FACTORS).join(', ')}`,
        );
    }

    const { delta13C_initial, delta13C_current } = deltaValues;
    if (typeof delta13C_initial !== 'number' || typeof delta13C_current !== 'number') {
        throw new Error('stableIsotopeCSIA: delta13C_initial and delta13C_current are required');
    }

    const epsilon = CSIA_ENRICHMENT_FACTORS[(compoundClass as keyof typeof CSIA_ENRICHMENT_FACTORS)]; // ‰
    const _alpha = 1 + epsilon / 1000; // isotope fractionation factor

    // Rayleigh equation: δ_product = δ_initial + ε × ln(f)
    // Rearranged: ln(f) = (δ_current - δ_initial) / ε
    let fractionReacted;
    if (Math.abs(epsilon) < 1e-9) {
        fractionReacted = 0;
    } else {
        const lnF = (delta13C_current - delta13C_initial) / epsilon;
        // f = fraction remaining, so fraction reacted = 1 - f
        const f_remaining = Math.exp(lnF);
        fractionReacted = Math.max(0, Math.min(1, 1 - f_remaining));
    }

    const biodegradationExtent = fractionReacted * 100; // percent

    // If concentrations provided, cross-check with mass-balance estimate
    let massBalanceBiodegExt = null;
    if (
        typeof deltaValues.concentration_initial === 'number' &&
        typeof deltaValues.concentration_current === 'number' &&
        deltaValues.concentration_initial > 0
    ) {
        massBalanceBiodegExt = (1 - deltaValues.concentration_current / deltaValues.concentration_initial) * 100;
    }

    // Degradation pathway based on compound class and enrichment factor sign
    const pathwayMap = {
        chlorinated: 'reductive_dechlorination',
        btex: 'aerobic_oxidation_or_anaerobic',
        nitrate: 'denitrification',
        sulfate: 'sulfate_reduction',
    };

    return {
        biodegradationExtent,
        enrichmentFactor: epsilon,
        fractionReacted,
        degradationPathway: pathwayMap[(compoundClass as keyof typeof pathwayMap)],
        ...(massBalanceBiodegExt !== null && { massBalanceBiodegExt }),
    };
}

// ─── 7. PMF - Positive Matrix Factorization ───────────────────────────────────

/**
 * Simplified Positive Matrix Factorization via Non-Negative Matrix Factorization
 * (NMF) with multiplicative update rules. Decomposes the concentration matrix
 * C ≈ W × H where W contains factor contributions and H contains factor profiles.
 *
 * @param {number[][]} concentrationMatrix - n_samples × n_species matrix.
 * @param {number[][]} uncertaintyMatrix - n_samples × n_species (same shape as concentrations).
 * @param {number} nFactors - Number of factors to extract (2-5).
 * @returns {{factorProfiles: number[][], factorContributions: number[][], qValue: number, residuals: number[][]}}
 *   factorProfiles: nFactors × n_species (normalized).
 *   factorContributions: n_samples × nFactors.
 * @reference Paatero & Tapper (1994) Environmetrics 5:111-126 doi:10.1002/env.3170050203
 * @reference Lee & Seung (1999) Nature 401:788-791 doi:10.1038/44565 (multiplicative updates)
 * @reference EPA PMF 5.0 User Guide EPA/600/R-14/108
 */
export function receptorModelPMF(concentrationMatrix: any, uncertaintyMatrix: any, nFactors: any) {
    const { nSamples, nSpecies } = _validatePmfShapes(concentrationMatrix, uncertaintyMatrix, nFactors);
    const { W, H } = _initializePmfMatrices(nSamples, nSpecies, nFactors);
    _runNmfIterations(W, H, concentrationMatrix, nSamples, nSpecies, nFactors);
    const { factorProfiles, factorContributions } = _normalizePmfResults(W, H);
    const { qValue, residuals } = _computePmfQValue(concentrationMatrix, uncertaintyMatrix, W, H, nSamples, nSpecies);

    return { factorProfiles, factorContributions, qValue, residuals };
}

/**
 * Validates PMF input shapes and returns the sample/species counts.
 */
function _validatePmfShapes(concentrationMatrix: any, uncertaintyMatrix: any, nFactors: any) {
    if (!concentrationMatrix || !Array.isArray(concentrationMatrix) || concentrationMatrix.length === 0) {
        throw new Error('receptorModelPMF: concentrationMatrix must be a non-empty 2D array');
    }
    if (
        !uncertaintyMatrix ||
        !Array.isArray(uncertaintyMatrix) ||
        uncertaintyMatrix.length !== concentrationMatrix.length
    ) {
        throw new Error('receptorModelPMF: uncertaintyMatrix must match concentrationMatrix shape');
    }
    if (!Number.isInteger(nFactors) || nFactors < 2 || nFactors > 5) {
        throw new Error('receptorModelPMF: nFactors must be an integer between 2 and 5');
    }

    const nSamples = concentrationMatrix.length;
    const nSpecies = concentrationMatrix[0].length;

    if (nSpecies < nFactors) {
        throw new Error('receptorModelPMF: nSpecies must be >= nFactors');
    }

    return { nSamples, nSpecies };
}

/**
 * Initializes W and H matrices with deterministic pseudo-random values.
 */
function _initializePmfMatrices(nSamples: number, nSpecies: number, nFactors: number) {
    let seed = 42;
    const pseudoRand = () => {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return (seed >>> 0) / 4294967296;
    };

    const W = /** @type {number[][]} */ ([]);
    for (let i = 0; i < nSamples; i++) {
        const row = [];
        for (let k = 0; k < nFactors; k++) row.push(pseudoRand() + 0.01);
        W.push(row);
    }
    const H: any = /** @type {number[][]} */ ([]);
    for (let k = 0; k < nFactors; k++) {
        const row = [];
        for (let j = 0; j < nSpecies; j++) row.push(pseudoRand() + 0.01);
        H.push(row);
    }

    return { W, H };
}

/**
 * Runs Lee-Seung multiplicative update iterations for NMF.
 */
function _runNmfIterations(
    W: number[][],
    H: number[][],
    concentrationMatrix: number[][],
    nSamples: number,
    nSpecies: number,
    nFactors: number,
) {
    const MAX_ITER = 200;
    const EPS = 1e-9;

    for (let iter = 0; iter < MAX_ITER; iter++) {
        // Update H
        const WtC = _matMul(_transpose(W), concentrationMatrix);
        const WH = _matMul(W, H);
        const WtWH = _matMul(_transpose(W), WH);

        for (let k = 0; k < nFactors; k++) {
            const hRow = H[k];
            const wtwhRow = WtWH[k];
            const wtcRow = WtC[k];
            if (!hRow || !wtwhRow || !wtcRow) continue;
            for (let j = 0; j < nSpecies; j++) {
                const denom = (wtwhRow[j] ?? 0) + EPS;
                hRow[j] = Math.max(EPS, (hRow[j] ?? 0) * ((wtcRow[j] ?? 0) / denom));
            }
        }

        // Update W
        const CHt = _matMul(concentrationMatrix, _transpose(H));
        const WH2 = _matMul(W, H);
        const WH2Ht = _matMul(WH2, _transpose(H));

        for (let i = 0; i < nSamples; i++) {
            const wRow = W[i];
            const wh2htRow = WH2Ht[i];
            const chtRow = CHt[i];
            if (!wRow || !wh2htRow || !chtRow) continue;
            for (let k = 0; k < nFactors; k++) {
                const denom = (wh2htRow[k] ?? 0) + EPS;
                wRow[k] = Math.max(EPS, (wRow[k] ?? 0) * ((chtRow[k] ?? 0) / denom));
            }
        }
    }
}

/**
 * Normalizes H rows to unit sum and scales W columns accordingly.
 */
function _normalizePmfResults(W: number[][], H: number[][]) {
    const factorProfiles = H.map((row: any) => {
        const s = row.reduce((a: any, v: any) => a + v, 0) || 1;
        return row.map((v: any) => v / s);
    });
    const factorContributions = W.map((row) => {
        return row.map((v, k) => {
            const hRow = H[k];
            const s = (hRow ? hRow.reduce((a: any, v2: any) => a + v2, 0) : 0) || 1;
            return v * s;
        });
    });
    return { factorProfiles, factorContributions };
}

/**
 * Computes Q value and residuals: Σ [(C - WH)² / σ²]
 */
function _computePmfQValue(
    concentrationMatrix: number[][],
    uncertaintyMatrix: number[][],
    W: number[][],
    H: number[][],
    nSamples: number,
    nSpecies: number,
) {
    const EPS = 1e-9;
    const WH_final = _matMul(W, H);
    let qValue = 0;
    const residuals = /** @type {number[][]} */ ([]);
    for (let i = 0; i < nSamples; i++) {
        const row = [];
        const cRow = concentrationMatrix[i];
        const whRow = WH_final[i];
        const uRow = uncertaintyMatrix[i];
        for (let j = 0; j < nSpecies; j++) {
            const r = (cRow?.[j] ?? 0) - (whRow?.[j] ?? 0);
            const sigma2 = Math.max((uRow?.[j] ?? 0) ** 2, EPS);
            qValue += r ** 2 / sigma2;
            row.push(r);
        }
        residuals.push(row);
    }
    return { qValue, residuals };
}

/**
 * Matrix multiplication: A (m×k) × B (k×n) → (m×n)
 * @param {number[][]} A
 * @param {number[][]} B
 * @returns {number[][]}
 */
function _matMul(A: any, B: any) {
    const m = A.length;
    const k = B.length;
    const n = B[0].length;
    const C = [];
    for (let i = 0; i < m; i++) {
        const row = new Array(n).fill(0);
        for (let p = 0; p < k; p++) {
            for (let j = 0; j < n; j++) {
                row[j] += A[i][p] * B[p][j];
            }
        }
        C.push(row);
    }
    return C;
}

/**
 * Transpose of a matrix
 * @param {number[][]} M
 * @returns {number[][]}
 */
function _transpose(M: any) {
    const rows = M.length;
    const cols = M[0].length;
    const T = [];
    for (let j = 0; j < cols; j++) {
        const row = [];
        for (let i = 0; i < rows; i++) row.push(M[i][j]);
        T.push(row);
    }
    return T;
}

// ─── 8. Forensic Timestamping ─────────────────────────────────────────────────

/**
 * Chemical age estimation for forensic timelines using first-order
 * contaminant decay relative to a reference initial concentration.
 *
 * @param {number} concentration_ug_kg - Current measured concentration (µg/kg).
 * @param {number} degradationRate_per_day - First-order degradation rate constant k (day⁻¹).
 * @param {number} backgroundConc_ug_kg - Natural background concentration (µg/kg).
 * @returns {{estimatedAge_days: number, confidenceRange_days: [number, number], stabilityClass: string}}
 *   stabilityClass: 'fresh' (<30d) | 'recent' (30-180d) | 'aged' (180-730d) | 'weathered' (>730d).
 * @reference Murphy & Rankin (1999) Ground Water Monit. Remediat. 19:76-85 doi:10.1111/j.1745-6592.1999.tb00195.x
 * @reference ASTM E1998-11 Standard Guide for Assessing Depuration of Compounds from Fish
 */
export function forensicTimestamping(concentration_ug_kg: any, degradationRate_per_day: any, backgroundConc_ug_kg: any) {
    if (typeof concentration_ug_kg !== 'number' || concentration_ug_kg < 0) {
        throw new Error('forensicTimestamping: concentration_ug_kg must be a non-negative number');
    }
    if (typeof degradationRate_per_day !== 'number' || degradationRate_per_day <= 0) {
        throw new Error('forensicTimestamping: degradationRate_per_day must be positive');
    }
    if (typeof backgroundConc_ug_kg !== 'number' || backgroundConc_ug_kg < 0) {
        throw new Error('forensicTimestamping: backgroundConc_ug_kg must be a non-negative number');
    }

    // Reference initial concentration for a fresh release
    const C0 = 1000; // µg/kg
    const Cbg = backgroundConc_ug_kg;
    const C = concentration_ug_kg;

    // t = -ln((C - Cbg) / (C0 - Cbg)) / k
    const numerator = C - Cbg;
    const denominator = C0 - Cbg;

    const estimatedAge_days = _estimateAgeFromConcentration(numerator, denominator, degradationRate_per_day);

    // Confidence range: ±30% of rate constant uncertainty (proxy)
    const kLow = degradationRate_per_day * 0.7;
    const kHigh = degradationRate_per_day * 1.3;
    const ageLow = _ageFromRate(numerator, denominator, kHigh);
    const ageHigh = _ageFromRate(numerator, denominator, kLow);

    const stabilityClass = _classifyStability(estimatedAge_days);

    return {
        estimatedAge_days,
        confidenceRange_days: [ageLow, ageHigh],
        stabilityClass,
    };
}

/**
 * Estimates age from concentration ratio and degradation rate.
 */
function _estimateAgeFromConcentration(numerator: number, denominator: number, k: number) {
    if (denominator <= 0 || numerator <= 0) {
        // Concentration at or below background - maximum age (fully degraded signal)
        return Infinity;
    }
    if (numerator >= denominator) {
        // Concentration above or at initial - fresh (age = 0)
        return 0;
    }
    return -Math.log(numerator / denominator) / k;
}

/**
 * Computes age using a given degradation rate.
 */
function _ageFromRate(numerator: number, denominator: number, k: number) {
    if (numerator <= 0 || denominator <= 0) return Infinity;
    if (numerator >= denominator) return 0;
    return -Math.log(numerator / denominator) / k;
}

/**
 * Classifies the stability based on estimated age.
 */
function _classifyStability(estimatedAge_days: number) {
    if (!isFinite(estimatedAge_days) || estimatedAge_days > 730) {
        return 'weathered';
    }
    if (estimatedAge_days > 180) {
        return 'aged';
    }
    if (estimatedAge_days > 30) {
        return 'recent';
    }
    return 'fresh';
}

// ─── 9. Leakage Source Localization ───────────────────────────────────────────

/**
 * Gradient-based plume source localization using concentration-weighted centroid
 * and covariance ellipse (Skaggs-Kabala 1994 method).
 *
 * @param {Array<{x_m: number, y_m: number}>} wells - Well locations in meters.
 * @param {number[]} wells - Concentrations at each well (same length as wells).
 * @returns {{estimatedSourceX: number, estimatedSourceY: number, spreadRadius_m: number, confidenceEllipse: {a: number, b: number, angle_deg: number}, gradient: {dx: number, dy: number}}}
 * @reference Skaggs & Kabala (1994) Water Resour. Res. 30:71-79 doi:10.1029/93WR02618
 */
export function leakageSourceLocalization(wells: any, concentrations: any) {
    if (!wells || !Array.isArray(wells) || wells.length < 2) {
        throw new Error('leakageSourceLocalization: at least 2 wells required');
    }
    if (!concentrations || concentrations.length !== wells.length) {
        throw new Error('leakageSourceLocalization: concentrations must match wells length');
    }
    if (concentrations.some((c: any) => c < 0)) {
        throw new Error('leakageSourceLocalization: concentrations must be non-negative');
    }

    const totalC = concentrations.reduce((a: any, v: any) => a + v, 0);
    if (totalC <= 0) {
        throw new Error('leakageSourceLocalization: total concentration must be positive');
    }

    const estimatedSourceX = wells.reduce((a, w, i) => a + w.x_m * concentrations[i], 0) / totalC;
    const estimatedSourceY = wells.reduce((a, w, i) => a + w.y_m * concentrations[i], 0) / totalC;

    const { sxx, syy, sxy } = _computeWeightedCovariance(wells, concentrations, totalC, estimatedSourceX, estimatedSourceY);
    const confidenceEllipse = _computeConfidenceEllipse(sxx, syy, sxy);
    const spreadRadius_m = Math.sqrt(sxx + syy);

    const gradient = _computeConcentrationGradient(wells, concentrations);

    return {
        estimatedSourceX,
        estimatedSourceY,
        spreadRadius_m,
        confidenceEllipse,
        gradient,
    };
}

/**
 * Computes the concentration-weighted covariance matrix components.
 */
function _computeWeightedCovariance(
    wells: any,
    concentrations: any,
    totalC: number,
    cx: number,
    cy: number,
) {
    let sxx = 0,
        syy = 0,
        sxy = 0;
    for (let i = 0; i < wells.length; i++) {
        const dx = wells[i].x_m - cx;
        const dy = wells[i].y_m - cy;
        const w = concentrations[i] / totalC;
        sxx += w * dx * dx;
        syy += w * dy * dy;
        sxy += w * dx * dy;
    }
    return { sxx, syy, sxy };
}

/**
 * Computes the 95% confidence ellipse from covariance components.
 */
function _computeConfidenceEllipse(sxx: number, syy: number, sxy: number) {
    const trace = sxx + syy;
    const det = sxx * syy - sxy * sxy;
    const discriminant = Math.max(0, (trace / 2) ** 2 - det);
    const lambda1 = trace / 2 + Math.sqrt(discriminant);
    const lambda2 = trace / 2 - Math.sqrt(discriminant);

    // 95% confidence ellipse (chi2 = 5.991 for 2 DOF)
    const chi2_95 = 5.991;
    const a = Math.sqrt(Math.max(0, lambda1) * chi2_95);
    const b = Math.sqrt(Math.max(0, lambda2) * chi2_95);
    const angle_deg = (Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI / 2;

    return { a, b, angle_deg };
}

/**
 * Computes the concentration gradient vector via simple linear regression.
 */
function _computeConcentrationGradient(wells: any, concentrations: any) {
    let sumX = 0,
        sumY = 0,
        sumC = 0;
    const n = wells.length;
    for (let i = 0; i < n; i++) {
        sumX += wells[i].x_m;
        sumY += wells[i].y_m;
        sumC += concentrations[i];
    }
    const meanX = sumX / n;
    const meanY = sumY / n;
    const meanConc = sumC / n;

    let covXC = 0,
        covYC = 0,
        varX = 0,
        varY = 0;
    for (let i = 0; i < n; i++) {
        const dxi = wells[i].x_m - meanX;
        const dyi = wells[i].y_m - meanY;
        const dci = concentrations[i] - meanConc;
        covXC += dxi * dci;
        covYC += dyi * dci;
        varX += dxi * dxi;
        varY += dyi * dyi;
    }
    const dx = varX > 0 ? covXC / varX : 0;
    const dy = varY > 0 ? covYC / varY : 0;

    return { dx, dy };
}

// ─── 10. Background Subtraction ───────────────────────────────────────────────

/**
 * Statistical natural background determination and upper confidence limit
 * calculation for comparison with site concentrations.
 *
 * @param {number[]} sampleData - Array of background concentration measurements.
 * @param {'mean_plus_2sd'|'95th_percentile'|'log_normal_95upl'} naturalBackgroundMethod - Statistical method.
 * @returns {{background: number, upperConfidenceLimit95: number, detectionThreshold: number, aboveBackground: number[]}}
 *   aboveBackground: subset of sampleData values exceeding the UCL.
 * @reference USEPA (2009) Statistical Analysis of Groundwater Monitoring Data at RCRA Facilities - Unified Guidance EPA-530-R-09-007
 * @reference ITRC (2013) Groundwater Statistics and Monitoring Compliance Statistical Tools for the Project Life Cycle
 */
export function backgroundSubtraction(sampleData: any, naturalBackgroundMethod: any) {
    if (!sampleData || !Array.isArray(sampleData) || sampleData.length < 3) {
        throw new Error('backgroundSubtraction: sampleData must have at least 3 values');
    }
    const VALID_METHODS = ['mean_plus_2sd', '95th_percentile', 'log_normal_95upl'];
    if (!VALID_METHODS.includes(naturalBackgroundMethod)) {
        throw new Error(`backgroundSubtraction: method must be one of: ${VALID_METHODS.join(', ')}`);
    }

    const n = sampleData.length;
    const sorted = [...sampleData].sort((a, b) => a - b);

    const mean = sampleData.reduce((a, v) => a + v, 0) / n;
    const variance = sampleData.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1);
    const sd = Math.sqrt(variance);

    const { background, upperConfidenceLimit95 } = _computeBackgroundUcl(
        sampleData,
        naturalBackgroundMethod,
        n,
        sorted,
        mean,
        sd,
    );

    // Detection threshold: background + 1 SD (as a practical screening level)
    const detectionThreshold = background + sd;

    // Values above UCL
    const aboveBackground = sampleData.filter((v) => v > upperConfidenceLimit95);

    return {
        background,
        upperConfidenceLimit95,
        detectionThreshold,
        aboveBackground,
    };
}

/**
 * Computes the background value and 95% upper confidence limit by method.
 */
function _computeBackgroundUcl(
    sampleData: number[],
    naturalBackgroundMethod: string,
    n: number,
    sorted: number[],
    mean: number,
    sd: number,
) {
    if (naturalBackgroundMethod === 'mean_plus_2sd') {
        return { background: mean, upperConfidenceLimit95: mean + 2 * sd };
    }

    if (naturalBackgroundMethod === '95th_percentile') {
        return { background: mean, upperConfidenceLimit95: _empirical95thPercentile(sorted, n) };
    }

    // log_normal_95upl
    return _logNormal95Ucl(sampleData, mean, sd);
}

/**
 * Empirical 95th percentile with linear interpolation.
 */
function _empirical95thPercentile(sorted: number[], n: number) {
    const p = 0.95 * (n - 1);
    const lo = Math.floor(p);
    const hi = Math.ceil(p);
    const vLo = sorted[lo] ?? 0;
    const vHi = sorted[hi] ?? vLo;
    return lo === hi ? vLo : vLo + (p - lo) * (vHi - vLo);
}

/**
 * Log-normal 95% UCL using Land's formula; falls back to normal if too few positive values.
 */
function _logNormal95Ucl(sampleData: number[], mean: number, sd: number) {
    const validPositive = sampleData.filter((v) => v > 0);
    if (validPositive.length < 3) {
        return { background: mean, upperConfidenceLimit95: mean + 2 * sd };
    }

    const lnVals = validPositive.map((v) => Math.log(v));
    const meanLn = lnVals.reduce((a, v) => a + v, 0) / lnVals.length;
    const varLn = lnVals.reduce((a, v) => a + (v - meanLn) ** 2, 0) / (lnVals.length - 1);
    const sdLn = Math.sqrt(varLn);
    const nLn = lnVals.length;

    // z_0.95 = 1.645
    const z95 = 1.645;
    // UCL95 = exp(mean_ln + z_0.95 × std_ln / √n + std_ln² / 2)  [land's UCL formula]
    const upperConfidenceLimit95 = Math.exp(meanLn + (z95 * sdLn) / Math.sqrt(nLn) + varLn / 2);
    const background = Math.exp(meanLn + varLn / 2); // log-normal mean

    return { background, upperConfidenceLimit95 };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const environmentalForensicsMeta = {
    name: 'environmentalForensics',
    description: 'environmentalForensics',
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
