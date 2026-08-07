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
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Aquatic Toxicology Assessment - Pure-logic scientific module
 *
 * Provides functions for:
 *   - LC50 estimation via probit analysis
 *   - Species Sensitivity Distribution (SSD) and HC5 derivation
 *   - Bioconcentration (BCF) and bioaccumulation (BAF) factors
 *   - Acute-to-Chronic Ratio (ACR) interspecies extrapolation
 *   - USEPA ambient water quality criteria for hardness-dependent metals
 *   - Mixture toxicity via Concentration Addition (Toxic Units)
 *   - Sediment porewater equilibrium partitioning
 *   - Predicted Environmental Concentration (PEC)
 *   - Risk Quotient (RQ) for aquatic Ecological Risk Assessment (ERA)
 *
 * Referências acadêmicas:
 *   - Finney, D.J. (1971). Probit Analysis (3rd ed.). Cambridge University Press.
 *   - Posthuma, L., Suter, G.W., Traas, T.P. (2002). Species Sensitivity Distributions
 *     in Ecotoxicology. SETAC Press. ISBN: 1-880611-35-1
 *   - Veith, G.D., DeFoe, D.L., Bergstedt, B.V. (1979). "Measuring and estimating
 *     the bioconcentration factor of chemicals in fish". J. Fish. Res. Board Can.,
 *     36, pp. 1040–1048. DOI: 10.1139/f79-146
 *   - USEPA (2003). Technical Support Document for the 2003 Effluent Guidelines Program
 *     Plan (Great Lakes Initiative). EPA-821-R-03-005.
 *   - Kenaga, E.E. (1982). "Predictability of chronic toxicity from acute toxicity of
 *     chemicals in fish and aquatic invertebrates". Environ. Toxicol. Chem., 1(4),
 *     pp. 347–358. DOI: 10.1002/etc.5620010407
 *   - USEPA (1986). Quality Criteria for Water 1986 (Gold Book). EPA 440/5-86-001.
 *   - USEPA (1996). 1996 Updates: Ambient Water Quality Criteria Documents.
 *   - Könemann, H. (1981). "Quantitative structure-activity relationships in fish toxicity
 *     studies. Part 1: Relationship for 50 industrial pollutants". Toxicology, 19(3),
 *     pp. 209–221. DOI: 10.1016/0300-483X(81)90130-X
 *   - Di Toro, D.M., Zarba, C.S., Hansen, D.J. et al. (1991). "Technical basis for
 *     establishing sediment quality criteria for nonionic organic chemicals using
 *     equilibrium partitioning". Environ. Toxicol. Chem., 10(12), pp. 1541–1583.
 *     DOI: 10.1002/etc.5620101203
 *   - ECHA (2008). Guidance on information requirements and chemical safety assessment,
 *     Chapter R.10: Characterisation of dose [concentration]-response for environment.
 *     European Chemicals Agency.
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

// ---------------------------------------------------------------------------
// Internal statistical helpers (not exported)
// ---------------------------------------------------------------------------

/**
 * Rational approximation of the inverse normal CDF (probit function).
 * Accuracy: |error| < 4.5e-4 for 0 < p < 1.
 * @param {number} p - Probability (0, 1)
 * @returns {number} Standard normal deviate
 * @reference Abramowitz & Stegun (1964), formula 26.2.17
 */
function probitFromProbability(p: number): number {
    if (p <= 0) return -8.0;
    if (p >= 1) return 8.0;
    const a0 = 2.515517,
        a1 = 0.802853,
        a2 = 0.010328;
    const b1 = 1.432788,
        b2 = 0.189269,
        b3 = 0.001308;
    const sign = p < 0.5 ? -1 : 1;
    const q = p < 0.5 ? p : 1 - p;
    const t = Math.sqrt(-2.0 * Math.log(q));
    const num = a0 + a1 * t + a2 * t * t;
    const den = 1.0 + b1 * t + b2 * t * t + b3 * t * t * t;
    return sign * (t - num / den);
}

/**
 * Simple linear regression: y = a + b*x
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {{slope:number, intercept:number, r2:number}}
 */
function linearRegression(
    xs: number[],
    ys: number[],
): { slope: number; intercept: number; r2: number } {
    const n = xs.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
    let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumX2 = 0;
    for (let i = 0; i < n; i++) {
        const xi = xs[i] ?? 0;
        const yi = ys[i] ?? 0;
        sumX += xi;
        sumY += yi;
        sumXY += xi * yi;
        sumX2 += xi * xi;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    // Pearson R²
    const meanY = sumY / n;
    let ssTot = 0,
        ssRes = 0;
    for (let i = 0; i < n; i++) {
        const yi = ys[i] ?? 0;
        const xi = xs[i] ?? 0;
        ssTot += (yi - meanY) ** 2;
        ssRes += (yi - (intercept + slope * xi)) ** 2;
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    return { slope, intercept, r2 };
}

/**
 * Inverse normal CDF (percent-point function).
 * Same as probitFromProbability but named for SSD context.
 * @param {number} p
 * @returns {number}
 */
function normalPPF(p: number): number {
    return probitFromProbability(p);
}

// ---------------------------------------------------------------------------
// Exported scientific functions
// ---------------------------------------------------------------------------

/**
 * LC50 estimation via probit analysis.
 *
 * Fits a probit regression line to log10(concentration) vs probit(mortality),
 * then back-calculates the concentration yielding 50% mortality (probit = 5
 * in classic Finney notation, but standard normal deviate = 0 for p=0.5).
 *
 * Mortalities of exactly 0 or 1 are clamped to avoid ±Inf probit values
 * (standard practice per Finney 1971, §2.3).
 *
 * @param {number[]} concentrations - Tested concentrations (same unit, > 0)
 * @param {number[]} mortalities    - Observed fractional mortalities [0, 1]
 * @returns {{lc50: number, slope: number, r2: number}}
 *   lc50 - estimated LC50 in the same concentration unit as input
 *   slope - slope of probit vs log10(conc) regression
 *   r2    - coefficient of determination of the probit regression
 * @reference Finney, D.J. (1971). Probit Analysis (3rd ed.). Cambridge Univ. Press.
 */
export function lcMedianEstimate(
    concentrations: number[],
    mortalities: number[],
): { lc50: number; slope: number; r2: number } {
    if (!Array.isArray(concentrations) || !Array.isArray(mortalities)) {
        throw new TypeError('concentrations and mortalities must be arrays');
    }
    if (concentrations.length !== mortalities.length) {
        throw new RangeError('concentrations and mortalities must have equal length');
    }
    if (concentrations.length < 2) {
        throw new RangeError('At least 2 data points required for probit regression');
    }

    const CLAMP = 0.001; // clamp extreme mortalities to avoid ±Inf probit
    const logConc: number[] = [];
    const probits: number[] = [];
    for (let i = 0; i < concentrations.length; i++) {
        const c = concentrations[i] ?? 0;
        const m = mortalities[i] ?? 0;
        if (c <= 0) throw new RangeError(`Concentration at index ${i} must be > 0`);
        if (m < 0 || m > 1) throw new RangeError(`Mortality at index ${i} must be in [0, 1]`);
        const mClamped = Math.max(CLAMP, Math.min(1 - CLAMP, m));
        logConc.push(Math.log10(c));
        probits.push(probitFromProbability(mClamped));
    }

    const reg = linearRegression(logConc, probits);
    // At LC50: probit = 0 (p=0.5) => log10(LC50) = (0 - intercept) / slope
    let lc50 = NaN;
    if (reg.slope !== 0) {
        const logLC50 = (0 - reg.intercept) / reg.slope;
        lc50 = Math.pow(10, logLC50);
    }

    return {
        lc50,
        slope: reg.slope,
        r2: Math.max(0, reg.r2),
    };
}

/**
 * Species Sensitivity Distribution (SSD) fitting and HC5 derivation.
 *
 * Fits a log-normal distribution to species NOEC values and derives
 * hazardous concentrations (HC5, HC10, HC50). The log-normal parameters
 * are estimated by fitting a normal distribution to log10-transformed NOECs.
 * HC5 protects 95% of species (only 5% are exposed above this concentration).
 *
 * @param {Array<{species: string, noec: number}>} speciesData
 *   Array of species-NOEC pairs (noec > 0, same concentration unit)
 * @returns {{hc5: number, hc10: number, hc50: number, geometricMean: number, geoSD: number}}
 * @reference Posthuma, L., Suter, G.W., Traas, T.P. (2002). Species Sensitivity
 *   Distributions in Ecotoxicology. SETAC Press. ISBN: 1-880611-35-1
 */
export function speciesSensitivityDistribution(
    speciesData: Array<{ species: string; noec: number }>,
): { hc5: number; hc10: number; hc50: number; geometricMean: number; geoSD: number } {
    if (!Array.isArray(speciesData) || speciesData.length < 3) {
        throw new RangeError('At least 3 species data points required for SSD');
    }

    const logValues = speciesData.map(({ noec }, i) => {
        if (noec <= 0) throw new RangeError(`NOEC at index ${i} must be > 0`);
        return Math.log10(noec);
    });

    const n = logValues.length;
    const meanLog = logValues.reduce((s, v) => s + v, 0) / n;
    const sdLog = Math.sqrt(logValues.reduce((s, v) => s + (v - meanLog) ** 2, 0) / (n - 1));

    // HC_p = 10^(meanLog + z_p * sdLog), z_p = inverse normal CDF at p
    const hc5 = Math.pow(10, meanLog + normalPPF(0.05) * sdLog);
    const hc10 = Math.pow(10, meanLog + normalPPF(0.1) * sdLog);
    const hc50 = Math.pow(10, meanLog + normalPPF(0.5) * sdLog); // = geometric mean

    const geometricMean = Math.pow(10, meanLog);
    const geoSD = Math.pow(10, sdLog); // geometric standard deviation

    return { hc5, hc10, hc50, geometricMean, geoSD };
}

/**
 * Bioconcentration factor (BCF) estimation from octanol-water partition coefficient.
 *
 * Uses the Veith et al. (1979) regression equation for fish:
 *   log10(BCF) = 0.85 × log10(Kow) − 0.70
 *
 * When lipid fraction differs from the standard 5% (foc = 0.05), the BCF is
 * adjusted linearly: BCF_adj = BCF_std × (lipidFraction / 0.05).
 *
 * @param {number} kow          - Octanol-water partition coefficient (dimensionless, > 0)
 * @param {number} [lipidFraction=0.05] - Fish lipid content fraction (0–1)
 * @returns {number} BCF - dimensionless bioconcentration factor
 * @reference Veith, G.D., DeFoe, D.L., Bergstedt, B.V. (1979). J. Fish. Res. Board Can.,
 *   36, pp. 1040–1048. DOI: 10.1139/f79-146
 */
export function bioconcentrationFactor(kow: number, lipidFraction: number = 0.05): number {
    if (kow <= 0) throw new RangeError('Kow must be > 0');
    if (lipidFraction <= 0 || lipidFraction > 1) {
        throw new RangeError('lipidFraction must be in (0, 1]');
    }

    const logBcfStd = 0.85 * Math.log10(kow) - 0.7;
    const bcfStd = Math.pow(10, logBcfStd);
    // Adjust for non-standard lipid content relative to 5%
    const bcf = bcfStd * (lipidFraction / 0.05);
    return bcf;
}

/**
 * Bioaccumulation factor (BAF) and biomagnification factor (BMF).
 *
 * Uses the USEPA Great Lakes Initiative approach (USEPA 2003) where BAF
 * at a given trophic level can be provided directly, and the Trophic
 * Magnification Factor (TMF) represents the ratio of BAF between adjacent
 * trophic levels. When only BCF is available, BAF is estimated from BCF
 * adjusted for dietary uptake via trophic amplification:
 *   BAF(TL) = BCF × TMF^(TL − 2)    (trophic level 2 = primary consumer)
 *
 * @param {number} bcf         - Bioconcentration factor (dimensionless)
 * @param {number} baf         - Measured BAF at the given trophic level; if NaN or 0,
 *                               will be estimated from BCF
 * @param {number} trophicLevel - Integer trophic level (2 = zooplankton, 3 = forage fish,
 *                               4 = piscivore)
 * @returns {{baf: number, bmf: number, trophicMagnificationFactor: number}}
 * @reference USEPA (2003). Great Lakes Water Quality Initiative Technical Support Document.
 *   EPA-821-R-03-005.
 */
export function bioaccumulationFactor(
    bcf: number,
    baf: number,
    trophicLevel: number,
): { baf: number; bmf: number; trophicMagnificationFactor: number } {
    if (bcf <= 0) throw new RangeError('BCF must be > 0');
    if (trophicLevel < 2 || trophicLevel > 4 || !Number.isInteger(trophicLevel)) {
        throw new RangeError('trophicLevel must be integer 2, 3, or 4');
    }

    // Standard TMF = 4 based on USEPA 2003 Great Lakes Initiative default
    const TMF_DEFAULT = 4.0;

    // Compute BAF from BCF if not measured
    const bafValue = !baf || baf <= 0 ? bcf * Math.pow(TMF_DEFAULT, trophicLevel - 2) : baf;

    // BMF = BAF(TL) / BAF(TL-1); for TL=2, BAF(TL-1) = BCF (water-only)
    const bafPrev = trophicLevel === 2 ? bcf : bcf * Math.pow(TMF_DEFAULT, trophicLevel - 3);
    const bmf = bafPrev > 0 ? bafValue / bafPrev : NaN;

    return {
        baf: bafValue,
        bmf,
        trophicMagnificationFactor: TMF_DEFAULT,
    };
}

/**
 * Acute-to-Chronic Ratio (ACR) for interspecies extrapolation.
 *
 * The ACR converts acute LC50 values to predicted chronic No-Observed-Effect
 * Concentrations (NOEC) and to Criterion Continuous Concentration (CCC).
 * When a measured NOEC is supplied, the actual ACR is calculated; otherwise
 * the default regulatory ACR of 18 is applied (Kenaga 1982).
 *
 * Predicted NOEC = LC50 / ACR
 * Predicted CCC  = LC50 / ACR  (equivalent for regulatory water quality criteria)
 *
 * @param {number} lc50  - Acute LC50 (any concentration unit, > 0)
 * @param {number} [noec?] - Measured chronic NOEC (same unit). Omit to use default ACR = 18.
 * @returns {{acr: number, predictedNoec: number, predictedCcc: number}}
 * @reference Kenaga, E.E. (1982). Environ. Toxicol. Chem., 1(4), pp. 347–358.
 *   DOI: 10.1002/etc.5620010407
 */
export function acuteChronicRatio(
    lc50: number,
    noec?: number | null,
): { acr: number; predictedNoec: number; predictedCcc: number } {
    if (lc50 <= 0) throw new RangeError('LC50 must be > 0');
    if (noec !== undefined && noec !== null && noec <= 0) {
        throw new RangeError('NOEC must be > 0 when provided');
    }

    const ACR_DEFAULT = 18;
    const acr = noec != null && !isNaN(noec) && noec > 0 ? lc50 / noec : ACR_DEFAULT;

    const predictedNoec = lc50 / acr;
    const predictedCcc = lc50 / acr;

    return { acr, predictedNoec, predictedCcc };
}

/**
 * USEPA ambient water quality criteria for hardness-dependent metals.
 *
 * Applies the hardness-regression equations from the USEPA 1986 Gold Book
 * and 1996 updates. Criterion Maximum Concentration (CMC, acute) and
 * Criterion Continuous Concentration (CCC, chronic) are calculated as:
 *   CMC = exp(mA × ln(hardness) + bA)
 *   CCC = exp(mC × ln(hardness) + bC)
 *
 * Note: pH and temperature parameters are accepted for API completeness and
 * future extension (e.g., pH-dependent speciation corrections for lead);
 * current implementation uses only hardness for the published regressions.
 *
 * @param {'copper'|'zinc'|'lead'|'cadmium'|'nickel'} substance
 * @param {number} hardness    - Total hardness as CaCO3 (mg/L), typically 25–400
 * @param {number} [_pH=7.8]   - Water pH (dimensionless) - reserved for future use
 * @param {number} [_temperature=20] - Water temperature (°C) - reserved for future use
 * @returns {{cmcAcute_ug_L: number, cccChronic_ug_L: number, hardnessAdjusted: number}}
 * @reference USEPA (1986). Quality Criteria for Water 1986. EPA 440/5-86-001. (Gold Book)
 *   USEPA (1996). 1996 Updates: Ambient Water Quality Criteria Documents.
 */
export function waterQualityCriteria(
    substance: 'copper' | 'zinc' | 'lead' | 'cadmium' | 'nickel',
    hardness: number,
    _pH: number = 7.8,
    _temperature: number = 20,
): { cmcAcute_ug_L: number; cccChronic_ug_L: number; hardnessAdjusted: number } {
    if (hardness <= 0) throw new RangeError('Hardness must be > 0');

    // Regression coefficients (USEPA 1986/1996)
    // mA, bA = acute (CMC); mC, bC = chronic (CCC)
    const COEFFICIENTS: Record<
        'copper' | 'zinc' | 'lead' | 'cadmium' | 'nickel',
        { mA: number; bA: number; mC: number; bC: number }
    > = {
        copper: { mA: 0.9422, bA: -1.7, mC: 0.8545, bC: -1.702 },
        zinc: { mA: 0.8473, bA: 0.884, mC: 0.8473, bC: 0.884 },
        lead: { mA: 1.273, bA: -1.46, mC: 1.273, bC: -4.705 },
        cadmium: { mA: 0.9789, bA: -3.866, mC: 0.7977, bC: -3.909 },
        nickel: { mA: 0.846, bA: 3.3612, mC: 0.846, bC: 1.1645 },
    };

    const coeff = COEFFICIENTS[substance];
    if (!coeff) {
        throw new TypeError(`Unknown substance "${substance}". Supported: ${Object.keys(COEFFICIENTS).join(', ')}`);
    }

    const lnH = Math.log(hardness);
    const cmcAcute_ug_L = Math.exp(coeff.mA * lnH + coeff.bA);
    const cccChronic_ug_L = Math.exp(coeff.mC * lnH + coeff.bC);

    return {
        cmcAcute_ug_L,
        cccChronic_ug_L,
        hardnessAdjusted: hardness,
    };
}

/**
 * Mixture toxicity via Concentration Addition (Toxic Unit model).
 *
 * Total Toxic Units (TU) = Σ (ci / LC50i) for all i substances.
 * A TU = 1 indicates a mixture producing exactly 50% mortality if the
 * substances act by the same mechanism (independent action assumed).
 *
 * Mixture class thresholds follow Könemann (1981) and EC/ECHA guidance:
 *   TU < 0.1  → not_toxic
 *   TU 0.1–1  → slightly_toxic
 *   TU 1–10   → toxic
 *   TU > 10   → very_toxic
 *
 * @param {Array<{concentration: number, lc50: number}>} substances
 *   Each entry: measured environmental concentration and its LC50 (same unit)
 * @returns {{tu_total: number, toxicityRatio: number, mixtureClass: string}}
 * @reference Könemann, H. (1981). Toxicology, 19(3), pp. 209–221.
 *   DOI: 10.1016/0300-483X(81)90130-X
 */
export function toxicityUnitMixture(
    substances: Array<{ concentration: number; lc50: number }>,
): { tu_total: number; toxicityRatio: number; mixtureClass: string } {
    if (!Array.isArray(substances) || substances.length === 0) {
        throw new TypeError('substances must be a non-empty array');
    }

    let tuTotal = 0;
    for (let i = 0; i < substances.length; i++) {
        const entry = substances[i];
        if (!entry) continue;
        const { concentration, lc50 } = entry;
        if (concentration < 0) throw new RangeError(`concentration at index ${i} must be >= 0`);
        if (lc50 <= 0) throw new RangeError(`lc50 at index ${i} must be > 0`);
        tuTotal += concentration / lc50;
    }

    // toxicityRatio: fraction relative to acutely toxic threshold (TU = 1)
    const toxicityRatio = tuTotal;

    let mixtureClass: string;
    if (tuTotal < 0.1) mixtureClass = 'not_toxic';
    else if (tuTotal < 1.0) mixtureClass = 'slightly_toxic';
    else if (tuTotal < 10) mixtureClass = 'toxic';
    else mixtureClass = 'very_toxic';

    return { tu_total: tuTotal, toxicityRatio, mixtureClass };
}

/**
 * Sediment-to-porewater equilibrium partitioning toxicity.
 *
 * Calculates the freely dissolved porewater concentration of a hydrophobic
 * organic compound using the Di Toro et al. (1991) equilibrium partitioning
 * approach. The organic carbon-water partition coefficient (Koc) scaled by
 * the sediment organic carbon fraction (foc) gives the sediment-water
 * distribution coefficient (Kd).
 *
 * Cpw (mg/L) = Ctotal / (ρ_sediment × Kd + θ_water)
 * Expressed in µg/L by multiplying by 1000.
 *
 * Default physical constants for fine-grained sediments (Di Toro et al. 1991):
 *   ρ_sediment = 2.5 g/cm³  (particle density)
 *   θ_water    = 0.8         (volumetric porosity, dimensionless)
 *
 * @param {number} koc                    - Organic carbon-water partition coefficient (L/kg_OC)
 * @param {number} foc                    - Sediment organic carbon fraction (0–1)
 * @param {number} totalConcentration_mg_kg - Bulk sediment concentration (mg chemical/kg dry sediment)
 * @returns {{porewaterConcentration_ug_L: number, fractionSorbed: number, bioavailableFraction: number}}
 * @reference Di Toro, D.M. et al. (1991). Environ. Toxicol. Chem., 10(12), pp. 1541–1583.
 *   DOI: 10.1002/etc.5620101203
 */
export function sedimentPoreWaterToxicity(
    koc: number,
    foc: number,
    totalConcentration_mg_kg: number,
): { porewaterConcentration_ug_L: number; fractionSorbed: number; bioavailableFraction: number } {
    if (koc <= 0) throw new RangeError('Koc must be > 0');
    if (foc <= 0 || foc > 1) throw new RangeError('foc must be in (0, 1]');
    if (totalConcentration_mg_kg < 0) {
        throw new RangeError('totalConcentration_mg_kg must be >= 0');
    }

    const RHO_SEDIMENT = 2.5; // g/cm³ — particle density
    const THETA_WATER = 0.8; // dimensionless — volumetric porosity

    // Kd = Koc × foc  (L/kg_sediment)
    const kd = koc * foc;

    // Cpw in mg/L: numerator = Ctotal (mg/kg), denominator = (ρ × Kd + θ)
    // Units: mg_chemical/kg_dry × kg_dry/(ρ g/cm³ × Kd L/kg + θ L/L) → mg/L
    // ρ in g/cm³ = kg/L → ρ × Kd has units (kg/L)(L/kg) = dimensionless → sum with θ OK
    const denominator = RHO_SEDIMENT * kd + THETA_WATER;
    const porewaterConc_mg_L = totalConcentration_mg_kg / denominator;
    const porewaterConcentration_ug_L = porewaterConc_mg_L * 1000;

    // Fraction sorbed to sediment organic carbon vs total
    const sortedMass = RHO_SEDIMENT * kd * porewaterConc_mg_L;
    const fractionSorbed = totalConcentration_mg_kg > 0 ? sortedMass / totalConcentration_mg_kg : 0;

    // Bioavailable fraction = dissolved porewater / total sediment mass
    // expressed as fraction of total concentration available in water phase
    const waterMass = THETA_WATER * porewaterConc_mg_L;
    const bioavailableFraction = totalConcentration_mg_kg > 0 ? waterMass / totalConcentration_mg_kg : 0;

    return {
        porewaterConcentration_ug_L,
        fractionSorbed: Math.min(1, Math.max(0, fractionSorbed)),
        bioavailableFraction: Math.min(1, Math.max(0, bioavailableFraction)),
    };
}

/**
 * Predicted Environmental Concentration (PEC) for aquatic environment.
 *
 * Computes the steady-state PEC using a simple dilution model:
 *   PEC_dilution = emissionRate_kg_yr / (Q_m3_s × 86400 × 365) × 1e9  (µg/L)
 *
 * When a first-order degradation rate is provided, the steady-state
 * concentration is calculated accounting for chemical removal:
 *   C_ss = PEC_dilution / (1 + k_deg × τ)
 * where τ (residence time) = V_mix / Q (simplified as 1 day for rivers).
 *
 * @param {number} emissionRate_kg_yr      - Annual emission to the aquatic compartment (kg/yr)
 * @param {number} streamflow_m3_s         - Receiving water volumetric flow rate (m³/s)
 * @param {number} [degradationRate_per_day=0] - First-order degradation rate constant (1/day)
 * @returns {{pec_ug_L: number, halfLife_days: number, steadyStateConcentration_ug_L: number}}
 * @reference ECHA (2008). Guidance on information requirements and chemical safety assessment,
 *   Chapter R.10. European Chemicals Agency. ISBN 978-92-9173-681-4.
 */
export function predictedEnvironmentalConcentration(
    emissionRate_kg_yr: number,
    streamflow_m3_s: number,
    degradationRate_per_day: number = 0,
): { pec_ug_L: number; halfLife_days: number; steadyStateConcentration_ug_L: number } {
    if (emissionRate_kg_yr < 0) throw new RangeError('emissionRate_kg_yr must be >= 0');
    if (streamflow_m3_s <= 0) throw new RangeError('streamflow_m3_s must be > 0');
    if (degradationRate_per_day < 0) throw new RangeError('degradationRate_per_day must be >= 0');

    const SECONDS_PER_YEAR = 86400 * 365;
    const KG_TO_UG = 1e9; // kg → µg

    // Flow-dilution PEC in µg/L
    const flowRate_kg_s = emissionRate_kg_yr / SECONDS_PER_YEAR;
    const pec_ug_L = (flowRate_kg_s / streamflow_m3_s) * KG_TO_UG;

    // Half-life from first-order degradation
    const halfLife_days = degradationRate_per_day > 0 ? Math.LN2 / degradationRate_per_day : Infinity;

    // Steady-state: in a well-mixed reach with residence time τ ≈ 1 day (ECHA default)
    // C_ss = emission_flux / (Q + k_deg × V_mix)
    // Simplified: C_ss = pec_undegraded / (1 + k_deg × 1 day)
    const RESIDENCE_TIME_DAYS = 1.0;
    const steadyStateConcentration_ug_L =
        degradationRate_per_day > 0 ? pec_ug_L / (1 + degradationRate_per_day * RESIDENCE_TIME_DAYS) : pec_ug_L;

    return {
        pec_ug_L,
        halfLife_days,
        steadyStateConcentration_ug_L,
    };
}

/**
 * Risk Quotient (RQ) for aquatic ecological risk assessment.
 *
 * The risk quotient is the standard ERA endpoint under REACH and ECHA guidance:
 *   RQ = PEC / PNEC
 *
 * The PNEC is derived from the lowest chronic NOEC divided by an assessment
 * factor (AF) reflecting data quality:
 *   AF = 10   - when full chronic dataset available (≥3 trophic levels)
 *   AF = 50   - when acute data only (or limited chronic data)
 *   AF = 1000 - when only a single acute species test is available
 *
 * Risk levels:
 *   RQ < 1  → acceptable
 *   1 ≤ RQ ≤ 10 → concern (further assessment required)
 *   RQ > 10 → unacceptable (risk management measures required)
 *
 * @param {number} pec              - Predicted environmental concentration (µg/L or any unit)
 * @param {number} pnec             - Predicted no-effect concentration (same unit as pec)
 * @param {number} [assessmentFactor=10] - Assessment factor applied to NOEC (10|50|1000)
 * @returns {{rq: number, riskLevel: string, exceedanceFactor: number}}
 * @reference ECHA (2008). Guidance on information requirements and chemical safety assessment,
 *   Chapter R.10. European Chemicals Agency. ISBN 978-92-9173-681-4.
 */
export function riskQuotientAquatic(
    pec: number,
    pnec: number,
    assessmentFactor: number = 10,
): { rq: number; riskLevel: string; exceedanceFactor: number } {
    if (pec < 0) throw new RangeError('PEC must be >= 0');
    if (pnec <= 0) throw new RangeError('PNEC must be > 0');
    if (assessmentFactor <= 0) throw new RangeError('assessmentFactor must be > 0');

    const adjustedPnec = pnec / assessmentFactor;
    const rq = pec / adjustedPnec;

    let riskLevel: string;
    if (rq < 1) riskLevel = 'acceptable';
    else if (rq <= 10) riskLevel = 'concern';
    else riskLevel = 'unacceptable';

    // exceedanceFactor: how many times the PNEC is exceeded (1 if RQ = 1)
    const exceedanceFactor = rq;

    return { rq, riskLevel, exceedanceFactor };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const aquaticToxicologyMeta: AnalyticsModuleMeta = {
    name: 'aquaticToxicology',
    description: 'aquaticToxicology',
    category: 'analytics',
    familyTags: ['chemical'],
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
