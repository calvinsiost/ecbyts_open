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

/**
 * Ecological Network Analysis & Trophic Dynamics (BCU)
 *
 * Pure-math module implementing 20 canonical ecological network and trophic
 * dynamics metrics. Zero DOM, IDB, Three.js, or fetch dependencies.
 *
 * Referências acadêmicas:
 *   - Pauly, D. et al. (1998). "Fishing down marine food webs." Science 279, 860–863.
 *     DOI: 10.1126/science.279.5352.860 (trophic level, omnivory index)
 *   - Pauly, D. & Watson, R. (2005). "Background and interpretation of the 'Mean Trophic Level'
 *     indicator." Philos. Trans. R. Soc. B 360, 415–423. DOI: 10.1098/rstb.2004.1597
 *   - May, R. M. (1972). "Will a large complex system be stable?" Nature 238, 413–414.
 *     DOI: 10.1038/238413a0 (connectance, community stability)
 *   - Cohen, J. E. (1978). Food Webs and Niche Space. Princeton University Press.
 *     (link density)
 *   - Dunne, J. A., Williams, R. J. & Martinez, N. D. (2002). "Network structure and biodiversity
 *     loss in food webs: robustness increases with connectance." Ecol. Lett. 5, 558–567.
 *     DOI: 10.1073/pnas.192407699 (food web robustness)
 *   - Paine, R. T. (1969). "A note on trophic complexity and community stability." Am. Nat. 103,
 *     91–93. DOI: 10.1086/282586 (keystone species)
 *   - Lindeman, R. L. (1942). "The trophic-dynamic aspect of ecology." Ecology 23, 399–417.
 *     DOI: 10.2307/1930126 (biomass pyramid)
 *   - Polovina, J. J. (1984). "Model of a coral reef ecosystem I. The ECOPATH model and its
 *     application to French Frigate Shoals." Coral Reefs 3, 1–11.
 *     DOI: 10.1007/BF00306135 (ecotrophic efficiency)
 *   - Pianka, E. R. (1973). "The structure of lizard communities." Ann. Rev. Ecol. Syst. 4,
 *     53–74. DOI: 10.1146/annurev.es.04.110173.000413 (niche overlap)
 *   - Shannon, C. E. (1948). "A mathematical theory of communication." Bell Syst. Tech. J. 27,
 *     379–423. DOI: 10.1002/j.1538-7305.1948.tb01338.x (species diversity)
 *   - Pielou, E. C. (1966). "The measurement of diversity in different types of biological
 *     collections." J. Theor. Biol. 13, 131–144. DOI: 10.1016/0022-5193(66)90013-0 (evenness)
 *   - Chao, A. (1984). "Nonparametric estimation of the number of classes in a population."
 *     Scand. J. Stat. 11, 265–270. (species richness estimation)
 *   - Baselga, A. (2010). "Partitioning the turnover and nestedness components of beta diversity."
 *     Glob. Ecol. Biogeogr. 19, 134–143. DOI: 10.1111/j.1466-8238.2009.00490.x (beta diversity)
 *   - Lotka, A. J. (1932). "The growth of mixed populations." J. Wash. Acad. Sci. 22, 461–469.
 *     DOI: 10.1126/science.79.2040.16 (Lotka-Volterra competition)
 *   - Volterra, V. (1926). "Variazioni e fluttuazioni del numero d'individui in specie animali
 *     conviventi." Mem. Acad. Lincei 2, 31–113. (Lotka-Volterra)
 *   - Holling, C. S. (1959). "Some characteristics of simple types of predation and parasitism."
 *     Can. Entomol. 91, 385–398. DOI: 10.4039/Ent91385-7 (Type II functional response)
 *   - Rosenzweig, M. L. & MacArthur, R. H. (1963). "Graphical representation and stability
 *     conditions of predator-prey interactions." Am. Nat. 97, 209–223.
 *     DOI: 10.1086/282272 (Rosenzweig-MacArthur)
 *   - Hanski, I. (1998). "Metapopulation dynamics." Nature 396, 41–49.
 *     DOI: 10.1038/31059 (metapopulation capacity)
 *   - Pimm, S. L. (1984). "The complexity and stability of ecosystems." Nature 307, 321–326.
 *     DOI: 10.1038/307321a0 (ecosystem resilience)
 *   - Froese, R. & Pauly, D. (Eds.) (2014). FishBase. www.fishbase.org (mean trophic level)
 */

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

console.debug('[BCU:load] ecologicalNetworkAnalysis module loading');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a value is a finite number.
 * @param {*} v
 * @param {string} name
 */
function assertFinite(v: unknown, name: string): asserts v is number {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`[BCU] ${name} must be a finite number, got ${v}`);
    }
}

/**
 * Validate that a value is a non-negative finite number.
 * @param {*} v
 * @param {string} name
 */
function assertNonNeg(v: unknown, name: string): asserts v is number {
    assertFinite(v, name);
    if (v < 0) throw new RangeError(`[BCU] ${name} must be >= 0, got ${v}`);
}

/**
 * Validate that a value is a positive finite number.
 * @param {*} v
 * @param {string} name
 */
function assertPositive(v: unknown, name: string): asserts v is number {
    assertFinite(v, name);
    if (v <= 0) throw new RangeError(`[BCU] ${name} must be > 0, got ${v}`);
}

/**
 * Validate that a value is an integer >= minVal.
 * @param {*} v
 * @param {string} name
 * @param {number} minVal
 */
function assertInt(v: unknown, name: string, minVal: number = 0): asserts v is number {
    if (!Number.isInteger(v) || (v as number) < minVal) {
        throw new RangeError(`[BCU] ${name} must be an integer >= ${minVal}, got ${v}`);
    }
}

/**
 * Validate array is non-empty and all elements satisfy predicate.
 * @param {*} arr
 * @param {string} name
 * @param {((v: any) => boolean) | null} [pred]
 */
function assertArray(
    arr: unknown,
    name: string,
    pred: ((v: any) => boolean) | null = null,
): asserts arr is any[] {
    if (!Array.isArray(arr) || arr.length === 0) {
        throw new TypeError(`[BCU] ${name} must be a non-empty array`);
    }
    if (pred) {
        for (let i = 0; i < arr.length; i++) {
            if (!pred(arr[i])) {
                throw new TypeError(`[BCU] ${name}[${i}] fails validation: ${arr[i]}`);
            }
        }
    }
}

/**
 * Compute the largest real eigenvalue magnitude of a real square matrix
 * using the power iteration method (up to maxIter iterations).
 * Returns the dominant eigenvalue (signed, from Rayleigh quotient sign).
 * @param {number[][]} M  -- square matrix (n*n)
 * @param {number} [maxIter=200]
 * @returns {number}
 */
function dominantEigenvalue(M: number[][], maxIter: number = 200): number {
    const n = M.length;
    if (n === 0) return 0;
    // initialise vector
    const v = Array.from({ length: n }, () => 1 / Math.sqrt(n));
    let lambda = 0;
    for (let iter = 0; iter < maxIter; iter++) {
        // Mv
        const Mv = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) Mv[i] += (M[i] as number[])[j]! * v[j]!;
        }
        // Rayleigh quotient
        let num = 0;
        let den = 0;
        for (let i = 0; i < n; i++) {
            num += (v[i] as number) * Mv[i];
            den += (v[i] as number) * (v[i] as number);
        }
        lambda = den > 0 ? num / den : 0;
        // normalise
        let norm = 0;
        for (let i = 0; i < n; i++) norm += Mv[i] * Mv[i];
        norm = Math.sqrt(norm);
        if (norm < 1e-15) break;
        for (let i = 0; i < n; i++) v[i] = Mv[i] / norm;
    }
    return lambda;
}

// ---------------------------------------------------------------------------
// 1. computeTrophicLevel
// ---------------------------------------------------------------------------

/**
 * Compute trophic level (TL) for a consumer using the weighted mean of prey TLs.
 *
 * TL_i = 1 + Sum (DC_{ij} * TL_j) for all prey j
 * where DC_{ij} is the dietary contribution (fraction) of prey j to consumer i.
 * Primary producers/detritus have TL = 1.
 *
 * @param {number[]} preyTrophicLevels  -- TL of each prey item (>=1)
 * @param {number[]} dietComposition    -- fractional diet (must sum to 1)
 * @returns {number} trophic level >= 1
 * @throws {RangeError} if any TL < 1 or diet does not sum to ~1
 * @reference Pauly et al. 1998. DOI: 10.1126/science.279.5352.860
 */
export function computeTrophicLevel(preyTrophicLevels: number[], dietComposition: number[]): number {
    assertArray(preyTrophicLevels, 'preyTrophicLevels', (v) => typeof v === 'number' && isFinite(v) && v >= 1);
    assertArray(dietComposition, 'dietComposition', (v) => typeof v === 'number' && isFinite(v) && v >= 0);
    if (preyTrophicLevels.length !== dietComposition.length) {
        throw new RangeError('[BCU] preyTrophicLevels and dietComposition must have equal length');
    }
    const sum = dietComposition.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-6) {
        throw new RangeError(`[BCU] dietComposition must sum to 1, got ${sum}`);
    }
    let weighted = 0;
    for (let i = 0; i < preyTrophicLevels.length; i++) {
        weighted += (dietComposition[i] as number) * (preyTrophicLevels[i] as number);
    }
    return 1 + weighted;
}

// ---------------------------------------------------------------------------
// 2. computeConnectance
// ---------------------------------------------------------------------------

/**
 * Compute food web connectance C = L / S^2
 *
 * @param {number} L  -- number of trophic links (directed)
 * @param {number} S  -- number of species
 * @returns {number} connectance in [0, 1]
 * @throws {RangeError} if S <= 0 or L < 0
 * @reference May 1972. DOI: 10.1038/238413a0
 */
export function computeConnectance(L: number, S: number): number {
    assertNonNeg(L, 'L');
    assertPositive(S, 'S');
    return L / (S * S);
}

// ---------------------------------------------------------------------------
// 3. computeLinkDensity
// ---------------------------------------------------------------------------

/**
 * Compute link density LD = L / S
 *
 * @param {number} L  -- number of trophic links
 * @param {number} S  -- number of species
 * @returns {number} link density
 * @throws {RangeError} if S <= 0 or L < 0
 * @reference Cohen 1978. Food Webs and Niche Space. Princeton University Press.
 */
export function computeLinkDensity(L: number, S: number): number {
    assertNonNeg(L, 'L');
    assertPositive(S, 'S');
    return L / S;
}

// ---------------------------------------------------------------------------
// 4. computeOmnivoryIndex
// ---------------------------------------------------------------------------

/**
 * Compute omnivory index OI = variance of prey trophic levels weighted by diet.
 * OI = Sum DC_{ij} * (TL_j - mTL_j)^2  where mTL_j = Sum DC_{ij} * TL_j
 *
 * @param {number[]} preyTrophicLevels  -- TL of each prey item (>=1)
 * @param {number[]} dietComposition    -- fractional diet (must sum to 1)
 * @returns {number} omnivory index >= 0
 * @throws {RangeError} if inputs invalid
 * @reference Pauly et al. 1998. DOI: 10.1126/science.279.5352.860
 */
export function computeOmnivoryIndex(preyTrophicLevels: number[], dietComposition: number[]): number {
    assertArray(preyTrophicLevels, 'preyTrophicLevels', (v) => typeof v === 'number' && isFinite(v) && v >= 1);
    assertArray(dietComposition, 'dietComposition', (v) => typeof v === 'number' && isFinite(v) && v >= 0);
    if (preyTrophicLevels.length !== dietComposition.length) {
        throw new RangeError('[BCU] preyTrophicLevels and dietComposition must have equal length');
    }
    const sum = dietComposition.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-6) {
        throw new RangeError(`[BCU] dietComposition must sum to 1, got ${sum}`);
    }
    // weighted mean TL of prey
    let meanTL = 0;
    for (let i = 0; i < preyTrophicLevels.length; i++) {
        meanTL += (dietComposition[i] as number) * (preyTrophicLevels[i] as number);
    }
    // weighted variance
    let variance = 0;
    for (let i = 0; i < preyTrophicLevels.length; i++) {
        variance += (dietComposition[i] as number) * ((preyTrophicLevels[i] as number) - meanTL) ** 2;
    }
    return variance;
}

// ---------------------------------------------------------------------------
// 5. computeFoodWebRobustness
// ---------------------------------------------------------------------------

/**
 * Compute food web robustness R -- fraction of species remaining after sequential
 * deletion of the most connected species (worst-case targeted attack).
 *
 * Algorithm: iteratively remove the species with the highest number of remaining
 * links until a secondary extinction cascade reduces total species below threshold.
 * Returns R = S_final / S_initial.
 *
 * @param {number[][]} adjacencyMatrix  -- S*S boolean/0-1 matrix; [i][j]=1 → i eats j
 * @param {number}     [threshold=0.5]  -- fraction of initial species triggering "collapse"
 * @returns {number} robustness in [0, 1]
 * @throws {TypeError} if adjacencyMatrix is not a non-empty square matrix
 * @reference Dunne et al. 2002. DOI: 10.1073/pnas.192407699
 */
export function computeFoodWebRobustness(
    adjacencyMatrix: number[][],
    threshold: number = 0.5,
): number {
    if (!Array.isArray(adjacencyMatrix) || adjacencyMatrix.length === 0) {
        throw new TypeError('[BCU] adjacencyMatrix must be a non-empty array');
    }
    const S = adjacencyMatrix.length;
    for (let i = 0; i < S; i++) {
        if (!Array.isArray(adjacencyMatrix[i]) || (adjacencyMatrix[i] as number[]).length !== S) {
            throw new TypeError('[BCU] adjacencyMatrix must be square');
        }
    }
    assertFinite(threshold, 'threshold');
    if (threshold <= 0 || threshold > 1) {
        throw new RangeError('[BCU] threshold must be in (0, 1]');
    }

    // Work on a mutable copy -- adjacency as flat arrays
    const alive = new Array(S).fill(true);
    let aliveCount = S;
    const collapseAt = Math.floor(threshold * S);

    /** @param {number} abundanceRank */
    const degree = (idx: number): number => {
        let d = 0;
        for (let j = 0; j < S; j++) {
            if (alive[j] && ((adjacencyMatrix[idx] as number[])[j] || (adjacencyMatrix[j] as number[])[idx])) d++;
        }
        return d;
    };

    // Sequential targeted removal
    for (let step = 0; step < S; step++) {
        // find alive species with max degree
        let maxDeg = -1;
        let target = -1;
        for (let i = 0; i < S; i++) {
            if (!alive[i]) continue;
            const d = degree(i);
            if (d > maxDeg) {
                maxDeg = d;
                target = i;
            }
        }
        if (target === -1) break;
        alive[target] = false;
        aliveCount--;
        if (aliveCount <= collapseAt) break;
    }

    return aliveCount / S;
}

// ---------------------------------------------------------------------------
// 6. computeKeystoneIndex
// ---------------------------------------------------------------------------

/**
 * Compute keystone index KS = (impact_rank - abundance_rank) / S
 *
 * A keystone species has disproportionately large community impact relative
 * to its abundance. impact_rank and abundance_rank are 1-based ranks
 * (rank 1 = highest).
 *
 * @param {number} abundanceRank     -- rank by community impact (1 = highest impact)
 * @param {number} abundanceRank  -- rank by biomass/abundance (1 = most abundant)
 * @param {number} abundanceRank              -- total number of species
 * @returns {number} keystone index; > 0 means disproportionate impact
 * @throws {RangeError} if ranks < 1 or > S
 * @reference Paine 1969. DOI: 10.1086/282586
 */
export function computeKeystoneIndex(impactRank: number, abundanceRank: number, S: number): number {
    assertInt(S, 'S', 1);
    assertInt(impactRank, 'impactRank', 1);
    assertInt(abundanceRank, 'abundanceRank', 1);
    if (impactRank > S) throw new RangeError(`[BCU] impactRank (${impactRank}) > S (${S})`);
    if (abundanceRank > S) throw new RangeError(`[BCU] abundanceRank (${abundanceRank}) > S (${S})`);
    // Positive KS: species ranks higher by impact than by abundance → keystone
    return (abundanceRank - impactRank) / S;
}

// ---------------------------------------------------------------------------
// 7. computeMeanTrophicLevel
// ---------------------------------------------------------------------------

/**
 * Compute mean trophic level weighted by catch/biomass.
 * mTL = Sum(Y_i * TL_i) / Sum(Y_i)
 *
 * @param {number[]} trophicLevels  -- TL of each species/group (>=1)
 * @param {number[]} catches        -- catch or biomass for each species (>=0)
 * @returns {number} mean trophic level >= 1
 * @throws {RangeError} if arrays mismatch or all catches zero
 * @reference Froese & Pauly 2014. FishBase. www.fishbase.org
 */
export function computeMeanTrophicLevel(trophicLevels: number[], catches: number[]): number {
    assertArray(trophicLevels, 'trophicLevels', (v) => typeof v === 'number' && isFinite(v) && v >= 1);
    assertArray(catches, 'catches', (v) => typeof v === 'number' && isFinite(v) && v >= 0);
    if (trophicLevels.length !== catches.length) {
        throw new RangeError('[BCU] trophicLevels and catches must have equal length');
    }
    const totalCatch = catches.reduce((a, b) => a + b, 0);
    if (totalCatch === 0) throw new RangeError('[BCU] catches must not all be zero');
    let weighted = 0;
    for (let i = 0; i < trophicLevels.length; i++) {
        weighted += (catches[i] as number) * (trophicLevels[i] as number);
    }
    return weighted / totalCatch;
}

// ---------------------------------------------------------------------------
// 8. computeBiomassPyramid
// ---------------------------------------------------------------------------

/**
 * Compute biomass at each trophic level using Lindeman's efficiency.
 * B_i = P_i / (P/B)_i
 * where P_i = B_{i-1} * epsilon (production passed up the trophic chain),
 * and (P/B)_i is the production-to-biomass ratio.
 *
 * @param {number}   baseBiomass   -- biomass of primary producers (g/m^2 or equivalent)
 * @param {number[]} pbRatios      -- P/B ratio for each trophic level (P1, P2, …) (yr^-1)
 * @param {number}   [efficiency=0.1] -- Lindeman trophic transfer efficiency
 * @returns {number[]} biomass at each trophic level
 * @throws {RangeError} if inputs invalid
 * @reference Lindeman 1942. DOI: 10.2307/1930126
 */
export function computeBiomassPyramid(
    baseBiomass: number,
    pbRatios: number[],
    efficiency: number = 0.1,
): number[] {
    assertPositive(baseBiomass, 'baseBiomass');
    assertArray(pbRatios, 'pbRatios', (v) => typeof v === 'number' && isFinite(v) && v > 0);
    assertFinite(efficiency, 'efficiency');
    if (efficiency <= 0 || efficiency > 1) {
        throw new RangeError('[BCU] efficiency must be in (0, 1]');
    }
    const biomass: number[] = [];
    let production = baseBiomass * (pbRatios[0] as number); // production at base TL
    biomass.push(baseBiomass);
    for (let i = 1; i < pbRatios.length; i++) {
        // production available at this TL = previous production * efficiency
        production = production * efficiency;
        // biomass = production / (P/B)
        biomass.push(production / (pbRatios[i] as number));
    }
    return biomass;
}

// ---------------------------------------------------------------------------
// 9. computeEcotrophicEfficiency
// ---------------------------------------------------------------------------

/**
 * Compute ecotrophic efficiency (EE) for a functional group (ECOPATH model).
 * EE = (Production - export - biomass_accumulation) / Production
 *
 * EE in [0, 1] represents the fraction of production used within the system.
 * EE > 1 indicates inconsistent parameterisation.
 *
 * @param {number} production          -- annual production (t/km^2/yr)
 * @param {number} export_             -- emigration + fishing yield (t/km^2/yr)
 * @param {number} biomassAccumulation -- change in biomass over period (t/km^2/yr)
 * @returns {number} ecotrophic efficiency
 * @throws {RangeError} if production <= 0
 * @reference Polovina 1984. DOI: 10.1007/BF00306135
 */
export function computeEcotrophicEfficiency(
    production: number,
    export_: number,
    biomassAccumulation: number,
): number {
    assertPositive(production, 'production');
    assertFinite(export_, 'export_');
    assertFinite(biomassAccumulation, 'biomassAccumulation');
    return (production - export_ - biomassAccumulation) / production;
}

// ---------------------------------------------------------------------------
// 10. computeNicheOverlap
// ---------------------------------------------------------------------------

/**
 * Compute Pianka's niche overlap index between two species.
 * O_{jk} = Sum(p_{ij} * p_{ik}) / sqrt(Sum p_{ij}^2 * Sum p_{ik}^2)
 *
 * @param {number[]} resourceUseJ  -- proportional resource use of species j (sum = 1)
 * @param {number[]} resourceUseK  -- proportional resource use of species k (sum = 1)
 * @returns {number} overlap in [0, 1]; 0 = no overlap, 1 = identical niche
 * @throws {RangeError} if arrays have different lengths or contain negatives
 * @reference Pianka 1973. DOI: 10.1146/annurev.es.04.110173.000413
 */
export function computeNicheOverlap(resourceUseJ: number[], resourceUseK: number[]): number {
    assertArray(resourceUseJ, 'resourceUseJ', (v) => typeof v === 'number' && isFinite(v) && v >= 0);
    assertArray(resourceUseK, 'resourceUseK', (v) => typeof v === 'number' && isFinite(v) && v >= 0);
    if (resourceUseJ.length !== resourceUseK.length) {
        throw new RangeError('[BCU] resourceUseJ and resourceUseK must have equal length');
    }
    let numerator = 0;
    let sumSqJ = 0;
    let sumSqK = 0;
    for (let i = 0; i < resourceUseJ.length; i++) {
        numerator += (resourceUseJ[i] as number) * (resourceUseK[i] as number);
        sumSqJ += (resourceUseJ[i] as number) ** 2;
        sumSqK += (resourceUseK[i] as number) ** 2;
    }
    const denom = Math.sqrt(sumSqJ * sumSqK);
    if (denom === 0) return 0;
    return numerator / denom;
}

// ---------------------------------------------------------------------------
// 11. computeSpeciesDiversityShannon
// ---------------------------------------------------------------------------

/**
 * Compute Shannon diversity index H = -Sum p_i * ln(p_i)
 *
 * @param {number[]} abundances  -- raw counts or proportions (all >= 0, not all zero)
 * @returns {number} Shannon entropy H >= 0 (nats)
 * @throws {RangeError} if all abundances are zero
 * @reference Shannon 1948. DOI: 10.1002/j.1538-7305.1948.tb01338.x
 */
export function computeSpeciesDiversityShannon(abundances: number[]): number {
    assertArray(abundances, 'abundances', (v) => typeof v === 'number' && isFinite(v) && v >= 0);
    const total = abundances.reduce((a, b) => a + b, 0);
    if (total === 0) throw new RangeError('[BCU] abundances must not all be zero');
    let H = 0;
    for (let i = 0; i < abundances.length; i++) {
        if (abundances[i] === 0) continue;
        const p = (abundances[i] as number) / total;
        H -= p * Math.log(p);
    }
    return H;
}

// ---------------------------------------------------------------------------
// 12. computeEvennessPielou
// ---------------------------------------------------------------------------

/**
 * Compute Pielou's evenness J = H / ln(S)
 *
 * @param {number[]} abundances  -- raw counts or proportions (all >= 0)
 * @returns {number} evenness in [0, 1]
 * @throws {RangeError} if fewer than 2 species with non-zero abundance
 * @reference Pielou 1966. DOI: 10.1016/0022-5193(66)90013-0
 */
export function computeEvennessPielou(abundances: number[]): number {
    assertArray(abundances, 'abundances', (v) => typeof v === 'number' && isFinite(v) && v >= 0);
    const nonZero = abundances.filter((a) => a > 0).length;
    if (nonZero < 2) throw new RangeError('[BCU] at least 2 species with positive abundance required for evenness');
    const H = computeSpeciesDiversityShannon(abundances);
    return H / Math.log(nonZero);
}

// ---------------------------------------------------------------------------
// 13. computeSpeciesRichnessEstimation
// ---------------------------------------------------------------------------

/**
 * Estimate true species richness via Chao1 estimator.
 * Chao1 = S_obs + n1^2 / (2 * n2)
 * where n1 = singletons (species observed exactly once),
 *       n2 = doubletons (species observed exactly twice).
 * If n2 = 0, Chao1 = S_obs + n1*(n1-1)/2 (bias-corrected formula).
 *
 * @param {number[]} speciesCounts  -- observed counts per species (positive integers)
 * @returns {{ sObs: number, n1: number, n2: number, chao1: number }}
 * @throws {TypeError} if speciesCounts is not a valid array
 * @reference Chao 1984. Scand. J. Stat. 11, 265–270.
 */
export function computeSpeciesRichnessEstimation(
    speciesCounts: number[],
): Readonly<{ sObs: number; n1: number; n2: number; chao1: number }> {
    assertArray(speciesCounts, 'speciesCounts', (v) => Number.isInteger(v) && v >= 0);
    const sObs = speciesCounts.filter((c) => c > 0).length;
    const n1 = speciesCounts.filter((c) => c === 1).length;
    const n2 = speciesCounts.filter((c) => c === 2).length;
    let chao1;
    if (n2 > 0) {
        chao1 = sObs + (n1 * n1) / (2 * n2);
    } else {
        chao1 = sObs + (n1 * (n1 - 1)) / 2;
    }
    return Object.freeze({ sObs, n1, n2, chao1 });
}

// ---------------------------------------------------------------------------
// 14. computeBiodiversityBetaTurnover
// ---------------------------------------------------------------------------

/**
 * Compute Baselga's beta diversity and its turnover (Simpson) component.
 *
 * beta_total = (b + c) / (a + b + c)   [Sørensen]
 * beta_sim   = min(b,c) / (a + min(b,c)) [Simpson -- pure turnover]
 * beta_nest  = beta_total - beta_sim           [nestedness residual]
 *
 * where a = shared species, b = unique to community 1, c = unique to community 2.
 *
 * @param {Set<*>|Array<*>} community1  -- species set 1
 * @param {Set<*>|Array<*>} community2  -- species set 2
 * @returns {{ a: number, b: number, c: number, betaTotal: number, betaSim: number, betaNest: number }}
 * @throws {RangeError} if both communities are empty
 * @reference Baselga 2010. DOI: 10.1111/j.1466-8238.2009.00490.x
 */
export function computeBiodiversityBetaTurnover(
    community1: Set<unknown> | Array<unknown>,
    community2: Set<unknown> | Array<unknown>,
): Readonly<{ a: number; b: number; c: number; betaTotal: number; betaSim: number; betaNest: number }> {
    const s1 = new Set(Array.isArray(community1) ? community1 : [...community1]);
    const s2 = new Set(Array.isArray(community2) ? community2 : [...community2]);
    if (s1.size === 0 && s2.size === 0) {
        throw new RangeError('[BCU] both communities are empty');
    }
    let a = 0;
    for (const sp of s1) {
        if (s2.has(sp)) a++;
    }
    const b = s1.size - a; // unique to community1
    const c = s2.size - a; // unique to community2
    const denom = a + b + c;
    const betaTotal = denom > 0 ? (b + c) / denom : 0;
    const minBC = Math.min(b, c);
    const betaSim = a + minBC > 0 ? minBC / (a + minBC) : 0;
    const betaNest = betaTotal - betaSim;
    return Object.freeze({ a, b, c, betaTotal, betaSim, betaNest });
}

// ---------------------------------------------------------------------------
// 15. computeCommunityStabilityMay
// ---------------------------------------------------------------------------

/**
 * Evaluate May's complexity-stability criterion.
 * A random community is expected to be stable when S * C * sigma^2 < 1.
 *
 * @param {number} S     -- species richness
 * @param {number} C     -- connectance (0 < C <= 1)
 * @param {number} sigma -- standard deviation of interaction strengths
 * @returns {{ criterion: number, isStable: boolean }}
 *   criterion = S * C * sigma^2; isStable = criterion < 1
 * @throws {RangeError} if S <= 0, C <= 0, sigma < 0
 * @reference May 1972. DOI: 10.1038/238413a0
 */
export function computeCommunityStabilityMay(
    S: number,
    C: number,
    sigma: number,
): Readonly<{ criterion: number; isStable: boolean }> {
    assertPositive(S, 'S');
    assertPositive(C, 'C');
    assertNonNeg(sigma, 'sigma');
    if (C > 1) throw new RangeError('[BCU] C must be <= 1');
    const criterion = S * C * sigma ** 2;
    return Object.freeze({ criterion, isStable: criterion < 1 });
}

// ---------------------------------------------------------------------------
// 16. computeLotkaVolterraCompetition
// ---------------------------------------------------------------------------

/**
 * Compute instantaneous population growth rates for two competing species
 * (Lotka-Volterra competition model).
 *
 * dx/dt = r1 * x * (1 - (x + alpha12 * y) / K1)
 * dy/dt = r2 * y * (1 - (y + alpha21 * x) / K2)
 *
 * @param {number} x     -- population size of species 1
 * @param {number} y     -- population size of species 2
 * @param {number} r1    -- intrinsic growth rate of species 1 (yr^-1)
 * @param {number} r2    -- intrinsic growth rate of species 2 (yr^-1)
 * @param {number} K1    -- carrying capacity of species 1
 * @param {number} K2    -- carrying capacity of species 2
 * @param {number} alpha12 -- competition coefficient (effect of sp2 on sp1)
 * @param {number} alpha21 -- competition coefficient (effect of sp1 on sp2)
 * @returns {{ dxdt: number, dydt: number }}
 * @throws {RangeError} if K <= 0 or populations negative
 * @reference Lotka 1932. DOI: 10.1126/science.79.2040.16; Volterra 1926.
 */
export function computeLotkaVolterraCompetition(
    x: number,
    y: number,
    r1: number,
    r2: number,
    K1: number,
    K2: number,
    alpha12: number,
    alpha21: number,
): Readonly<{ dxdt: number; dydt: number }> {
    assertNonNeg(x, 'x');
    assertNonNeg(y, 'y');
    assertFinite(r1, 'r1');
    assertFinite(r2, 'r2');
    assertPositive(K1, 'K1');
    assertPositive(K2, 'K2');
    assertFinite(alpha12, 'alpha12');
    assertFinite(alpha21, 'alpha21');
    const dxdt = r1 * x * (1 - (x + alpha12 * y) / K1);
    const dydt = r2 * y * (1 - (y + alpha21 * x) / K2);
    return Object.freeze({ dxdt, dydt });
}

// ---------------------------------------------------------------------------
// 17. computeHollingTypeII
// ---------------------------------------------------------------------------

/**
 * Compute Holling Type II (disc equation) predation rate.
 * f(N) = a * N / (1 + a * h * N)
 *
 * @param {number} N  -- prey density (individuals / area)
 * @param {number} a  -- attack rate (area per time)
 * @param {number} h  -- handling time (time per prey item)
 * @returns {number} predation rate (prey consumed per predator per time)
 * @throws {RangeError} if N < 0, a <= 0, or h < 0
 * @reference Holling 1959. DOI: 10.4039/Ent91385-7
 */
export function computeHollingTypeII(N: number, a: number, h: number): number {
    assertNonNeg(N, 'N');
    assertPositive(a, 'a');
    assertNonNeg(h, 'h');
    return (a * N) / (1 + a * h * N);
}

// ---------------------------------------------------------------------------
// 18. computeRosenzweigMacArthur
// ---------------------------------------------------------------------------

/**
 * Compute equilibrium prey (N*) and predator (P*) densities for the
 * Rosenzweig-MacArthur predator-prey model with Holling Type II response.
 *
 * Prey isocline (dN/dt = 0):
 *   N* = d / (e * a - d * a * h)  = d / (a(e - d*h))
 *
 * Predator equilibrium (dP/dt = 0 on prey isocline):
 *   Pstar = r/a * (1 - Nstar/K) * (1 + a*h*Nstar) / 1
 *   Simplified: Pstar = (r/a) * (1 - Nstar/K) * (1 + a*h*Nstar)
 *
 * @param {number} r   -- prey intrinsic growth rate (yr^-1)
 * @param {number} K   -- prey carrying capacity
 * @param {number} a   -- predator attack rate
 * @param {number} h   -- handling time
 * @param {number} e   -- conversion efficiency of prey to predator biomass
 * @param {number} d   -- predator mortality rate (yr^-1)
 * @returns {{ Nstar: number, Pstar: number, coexists: boolean }}
 * @throws {RangeError} if parameters invalid or coexistence impossible
 * @reference Rosenzweig & MacArthur 1963. DOI: 10.1086/282272
 */
export function computeRosenzweigMacArthur(
    r: number,
    K: number,
    a: number,
    h: number,
    e: number,
    d: number,
): Readonly<{ Nstar: number; Pstar: number; coexists: boolean }> {
    assertPositive(r, 'r');
    assertPositive(K, 'K');
    assertPositive(a, 'a');
    assertNonNeg(h, 'h');
    assertPositive(e, 'e');
    assertPositive(d, 'd');
    // Predator zero-growth isocline: N* = d / (a * (e - d*h))
    const denom = a * (e - d * h);
    if (denom <= 0) {
        // Predator cannot persist -- mortality exceeds maximum conversion
        return Object.freeze({ Nstar: K, Pstar: 0, coexists: false });
    }
    const Nstar = d / denom;
    if (Nstar >= K) {
        // Equilibrium prey density exceeds carrying capacity → predator excluded
        return Object.freeze({ Nstar: K, Pstar: 0, coexists: false });
    }
    // Prey isocline at N*: P* = (r/a) * (1 - N*/K) * (1 + a*h*N*)
    const Pstar = (r / a) * (1 - Nstar / K) * (1 + a * h * Nstar);
    return Object.freeze({ Nstar, Pstar, coexists: Pstar > 0 });
}

// ---------------------------------------------------------------------------
// 19. computeMetapopulationCapacity
// ---------------------------------------------------------------------------

/**
 * Estimate metapopulation capacity lambda_M from the landscape incidence function.
 * lambda_M is the dominant eigenvalue of the landscape matrix M, where:
 *   M_{ij} = A_i * A_j * exp(-alpha * d_{ij}) for i ≠ j, M_{ii} = 0
 *
 * Metapopulation persists when lambda_M > delta/beta (ratio of local extinction to
 * colonisation rate).
 *
 * @param {number[]}   patchAreas     -- area of each habitat patch (km^2)
 * @param {number[][]} distances      -- pairwise distance matrix between patches (km)
 * @param {number}     alpha          -- dispersal kernel parameter (1/mean dispersal dist)
 * @returns {{ lambdaM: number, matrix: number[][] }}
 * @throws {RangeError} if arrays are inconsistent or alpha <= 0
 * @reference Hanski 1998. DOI: 10.1038/31059
 */
export function computeMetapopulationCapacity(
    patchAreas: number[],
    distances: number[][],
    alpha: number,
): Readonly<{ lambdaM: number; matrix: number[][] }> {
    assertArray(patchAreas, 'patchAreas', (v) => typeof v === 'number' && isFinite(v) && v > 0);
    assertPositive(alpha, 'alpha');
    const n = patchAreas.length;
    if (!Array.isArray(distances) || distances.length !== n) {
        throw new RangeError('[BCU] distances must be an n*n matrix matching patchAreas length');
    }
    for (let i = 0; i < n; i++) {
        if (!Array.isArray(distances[i]) || (distances[i] as number[]).length !== n) {
            throw new RangeError('[BCU] distances must be a square n*n matrix');
        }
    }
    // Build landscape matrix M
    const M = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (__, j) => {
            if (i === j) return 0;
            return (
                (patchAreas[i] as number) *
                (patchAreas[j] as number) *
                Math.exp(-alpha * (distances[i] as number[])[j]!)
            );
        }),
    );
    const lambdaM = dominantEigenvalue(M);
    return Object.freeze({ lambdaM, matrix: M });
}

// ---------------------------------------------------------------------------
// 20. computeEcosystemResilience
// ---------------------------------------------------------------------------

/**
 * Compute ecosystem resilience as the return time to equilibrium after a small
 * perturbation. Based on the dominant eigenvalue of the community matrix.
 *
 * resilience = 1 / |lambda_dominant|
 *
 * A community matrix is the Jacobian evaluated at equilibrium; negative
 * dominant eigenvalue → stable equilibrium.
 *
 * @param {number[][]} communityMatrix  -- Jacobian / interaction matrix at equilibrium
 * @returns {{ dominantEigenvalue: number, returnTime: number, isStable: boolean }}
 * @throws {TypeError} if communityMatrix is not a non-empty square matrix
 * @reference Pimm 1984. DOI: 10.1038/307321a0
 */
export function computeEcosystemResilience(
    communityMatrix: number[][],
): Readonly<{ dominantEigenvalue: number; returnTime: number; isStable: boolean }> {
    if (!Array.isArray(communityMatrix) || communityMatrix.length === 0) {
        throw new TypeError('[BCU] communityMatrix must be a non-empty array');
    }
    const n = communityMatrix.length;
    for (let i = 0; i < n; i++) {
        if (!Array.isArray(communityMatrix[i]) || (communityMatrix[i] as number[]).length !== n) {
            throw new TypeError('[BCU] communityMatrix must be square');
        }
    }
    const lambda = dominantEigenvalue(communityMatrix);
    const absLambda = Math.abs(lambda);
    const returnTime = absLambda > 1e-12 ? 1 / absLambda : Infinity;
    return Object.freeze({ dominantEigenvalue: lambda, returnTime, isStable: lambda < 0 });
}

console.debug('[BCU:end] ecologicalNetworkAnalysis module loaded');

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const ecologicalNetworkAnalysisMeta: AnalyticsModuleMeta = {
    name: 'ecologicalNetworkAnalysis',
    description: 'ecologicalNetworkAnalysis',
    category: 'analytics',
    familyTags: ['ecosystem'],
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
