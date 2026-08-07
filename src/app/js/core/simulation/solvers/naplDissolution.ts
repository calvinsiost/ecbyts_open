// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * NAPL Multi-Component Dissolution Solver
 *
 * Implements:
 *  - Raoult's Law effective solubility for multi-component NAPL mixtures
 *  - NAPL saturation estimation from mass
 *  - Mass transfer flux via simplified Sherwood number correlation
 *  - Euler integration for NAPL mass depletion over time
 *  - First-order exponential source decay model
 *  - NAPL lifetime estimation
 *
 * Academic references:
 *  - Mackay et al. (1991) "BTEX plumes from gasoline spills" Environ.Sci.Tech. 25(6):988-996
 *    DOI:10.1021/es00018a014
 *  - Powers et al. (1992) "Theoretical Study of the Significance of Nonequilibrium Dissolution
 *    of Nonaqueous Phase Liquids in Subsurface Systems" Water Resources Research 28(8):2233-2249
 *    DOI:10.1029/92WR00729
 *  - Saba & Illangasekare (2000) "Effect of groundwater flow dimensionality on mass transfer
 *    from entrapped nonaqueous phase liquid contaminants" J. Contam. Hydrol. 44(3-4):185-208
 *    DOI:10.1016/S0169-7722(99)00108-0
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface NAPLComponent {
    name: string;
    moleFraction: number;
    purePhaseSolubility_mg_L: number;
    Mw_g_mol: number;
}

interface NAPLMixture {
    id: string;
    name: string;
    components: ReadonlyArray<NAPLComponent>;
}

/**
 * Common NAPL mixture compositions (frozen).
 * moleFraction values represent typical field compositions.
 */
export const COMMON_NAPL_MIXTURES: ReadonlyArray<NAPLMixture> = Object.freeze([
    Object.freeze({
        id: 'gasoline',
        name: 'Gasoline (typical)',
        components: Object.freeze([
            Object.freeze({ name: 'benzene', moleFraction: 0.01, purePhaseSolubility_mg_L: 1780, Mw_g_mol: 78.11 }),
            Object.freeze({ name: 'toluene', moleFraction: 0.03, purePhaseSolubility_mg_L: 526, Mw_g_mol: 92.14 }),
            Object.freeze({ name: 'xylenes', moleFraction: 0.05, purePhaseSolubility_mg_L: 175, Mw_g_mol: 106.17 }),
            Object.freeze({
                name: 'ethylbenzene',
                moleFraction: 0.01,
                purePhaseSolubility_mg_L: 169,
                Mw_g_mol: 106.17,
            }),
            Object.freeze({ name: 'other', moleFraction: 0.9, purePhaseSolubility_mg_L: 1, Mw_g_mol: 100 }),
        ]),
    }),
    Object.freeze({
        id: 'dnapl_tce',
        name: 'DNAPL (TCE dominant)',
        components: Object.freeze([
            Object.freeze({ name: 'TCE', moleFraction: 0.85, purePhaseSolubility_mg_L: 1280, Mw_g_mol: 131.4 }),
            Object.freeze({ name: 'PCE', moleFraction: 0.1, purePhaseSolubility_mg_L: 200, Mw_g_mol: 165.83 }),
            Object.freeze({ name: 'DCE', moleFraction: 0.05, purePhaseSolubility_mg_L: 3500, Mw_g_mol: 96.94 }),
        ]),
    }),
]);

// ---------------------------------------------------------------------------
// 1. NAPL Saturation
// ---------------------------------------------------------------------------

interface ComputeNAPLSaturationParams {
    massNAPL_kg: number;
    porosity: number;
    bulkDensity_kg_m3: number;
    volume_m3: number;
    rhoNAPL_kg_m3: number;
}

interface ComputeNAPLSaturationResult {
    Sn: number;
    massNAPL_kg: number;
    poreVolume_m3: number;
    description: string;
}

/**
 * Compute NAPL saturation (Sn) from NAPL mass in a porous medium.
 *
 * Sn = massNAPL / (porosity × volume × rhoNAPL)
 *
 * @param params
 * @returns
 * @throws RangeError if any key input is zero/negative or porosity out of (0,1)
 */
export function computeNAPLSaturation(
    { massNAPL_kg, porosity, bulkDensity_kg_m3, volume_m3, rhoNAPL_kg_m3 }: ComputeNAPLSaturationParams,
): ComputeNAPLSaturationResult {
    if (porosity <= 0 || porosity >= 1) {
        throw new RangeError(`porosity must be strictly between 0 and 1, got ${porosity}`);
    }
    if (massNAPL_kg <= 0) throw new RangeError(`massNAPL_kg must be > 0, got ${massNAPL_kg}`);
    if (volume_m3 <= 0) throw new RangeError(`volume_m3 must be > 0, got ${volume_m3}`);
    if (rhoNAPL_kg_m3 <= 0) throw new RangeError(`rhoNAPL_kg_m3 must be > 0, got ${rhoNAPL_kg_m3}`);
    if (bulkDensity_kg_m3 <= 0) throw new RangeError(`bulkDensity_kg_m3 must be > 0, got ${bulkDensity_kg_m3}`);

    const poreVolume_m3 = porosity * volume_m3;
    const Sn = massNAPL_kg / (poreVolume_m3 * rhoNAPL_kg_m3);

    // Categoria de saturação conforme literatura de remediação
    let description: string;
    if (Sn > 0.1) {
        description = 'residual_saturation'; // acima da saturação residual típica
    } else if (Sn > 0.01) {
        description = 'above_residual'; // ainda presente mas abaixo de Snr típico
    } else {
        description = 'trace'; // traço — pouca massa, alta mobilidade
    }

    return Object.freeze({ Sn, massNAPL_kg, poreVolume_m3, description });
}

// ---------------------------------------------------------------------------
// 2. Multi-Component NAPL Effective Solubility (Raoult's Law)
// ---------------------------------------------------------------------------

interface MultiComponentNAPLComponent {
    name: string;
    moleFraction: number;
    purePhaseSolubility_mg_L: number;
    Mw_g_mol: number;
}

interface EnrichedComponent {
    name: string;
    moleFraction: number;
    effectiveSolubility_mg_L: number;
    purePhaseSolubility_mg_L: number;
}

interface ComputeMultiComponentNAPLResult {
    components: ReadonlyArray<EnrichedComponent>;
    totalMoles: number;
    dominantComponent: string;
    totalEffectiveSolubility: number;
}

/**
 * Compute effective solubility for a multi-component NAPL using Raoult's Law.
 *
 * Effective solubility of component i:
 *   Ce_i = xi × Cs_i
 * where xi = mole fraction, Cs_i = pure-phase solubility (mg/L).
 *
 * Reference: Mackay et al. (1991) Environ.Sci.Tech. 25(6):988-996
 *
 * @param components
 * @returns
 * @throws RangeError if mole fractions do not sum to ~1.0 (±1%)
 */
export function computeMultiComponentNAPL(components: MultiComponentNAPLComponent[]): ComputeMultiComponentNAPLResult {
    if (!Array.isArray(components) || components.length === 0) {
        throw new RangeError('components must be a non-empty array');
    }

    const sumMoleFractions = components.reduce((s, c) => s + c.moleFraction, 0);
    if (Math.abs(sumMoleFractions - 1.0) > 0.01) {
        throw new RangeError(`Mole fractions must sum to 1.0 (±1%), got ${sumMoleFractions.toFixed(4)}`);
    }

    let totalMoles = 0;
    let dominantFraction = -Infinity;
    let dominantComponent = '';

    const enriched = components.map((c) => {
        const effectiveSolubility_mg_L = c.moleFraction * c.purePhaseSolubility_mg_L;
        // Approxima moles relativos (sem unidade absoluta, apenas proporcional)
        totalMoles += c.moleFraction;
        if (c.moleFraction > dominantFraction) {
            dominantFraction = c.moleFraction;
            dominantComponent = c.name;
        }
        return Object.freeze({
            name: c.name,
            moleFraction: c.moleFraction,
            effectiveSolubility_mg_L,
            purePhaseSolubility_mg_L: c.purePhaseSolubility_mg_L,
        });
    });

    const totalEffectiveSolubility = enriched.reduce((s, c) => s + c.effectiveSolubility_mg_L, 0);

    return Object.freeze({
        components: Object.freeze(enriched),
        totalMoles,
        dominantComponent,
        totalEffectiveSolubility,
    }) as ComputeMultiComponentNAPLResult;
}

// ---------------------------------------------------------------------------
// 3. NAPL Dissolution Flux
// ---------------------------------------------------------------------------

interface ComputeNAPLDissolutionFluxParams {
    Sn: number;
    Kd: number;
    qw_m_s: number;
    alpha_L: number;
    dx: number;
    Cs_mg_L: number;
}

interface ComputeNAPLDissolutionFluxResult {
    Fd_mg_m2_s: number;
    ksm: number;
    Sn: number;
    Cs_mg_L: number;
}

/**
 * Compute NAPL dissolution mass transfer flux using a simplified Sherwood
 * number correlation (Saba & Illangasekare 2000).
 *
 * Mass transfer coefficient (simplified):
 *   ksm ≈ 0.01 × qw^0.75 / dx^0.25
 *
 * Dissolution flux:
 *   Fd = ksm × Sn × Cs_mg_L   [mg/(m²·s)]
 *
 * Reference: Saba & Illangasekare (2000) J. Contam. Hydrol. 44(3-4):185-208
 *
 * @param params
 * @returns
 */
export function computeNAPLDissolutionFlux(
    // eslint-disable-next-line
    { Sn, Kd, qw_m_s, alpha_L, dx, Cs_mg_L }: ComputeNAPLDissolutionFluxParams,
): ComputeNAPLDissolutionFluxResult {
    if (Sn < 0 || Sn > 1) throw new RangeError(`Sn must be in [0,1], got ${Sn}`);
    if (qw_m_s <= 0) throw new RangeError(`qw_m_s must be > 0, got ${qw_m_s}`);
    if (dx <= 0) throw new RangeError(`dx must be > 0, got ${dx}`);
    if (Cs_mg_L <= 0) throw new RangeError(`Cs_mg_L must be > 0, got ${Cs_mg_L}`);

    // Simplified Sherwood correlation (Saba & Illangasekare 2000, eq. 5)
    const ksm = (0.01 * Math.pow(qw_m_s, 0.75)) / Math.pow(dx, 0.25);
    const Fd_mg_m2_s = ksm * Sn * Cs_mg_L;

    return Object.freeze({ Fd_mg_m2_s, ksm, Sn, Cs_mg_L });
}

// ---------------------------------------------------------------------------
// 4. NAPL Depletion Simulation (Euler integration)
// ---------------------------------------------------------------------------

interface SimulateNAPLDepletionParams {
    massNAPL0_kg: number;
    dissolutionRate_kg_s: number;
    timeSteps_s: number[];
}

interface SimulateNAPLDepletionResult {
    timeSteps_s: ReadonlyArray<number>;
    mass_kg: ReadonlyArray<number>;
    fractionsRemaining: ReadonlyArray<number>;
    depletionIndex: number;
    depletionTime_s: number;
    unit: string;
}

/**
 * Simulate NAPL mass depletion over time using forward Euler integration.
 *
 * M[i] = max(0, M[i-1] - dissolutionRate_kg_s × dt[i])
 *
 * @param params
 * @returns
 */
export function simulateNAPLDepletion(
    { massNAPL0_kg, dissolutionRate_kg_s, timeSteps_s }: SimulateNAPLDepletionParams,
): SimulateNAPLDepletionResult {
    if (massNAPL0_kg <= 0) throw new RangeError(`massNAPL0_kg must be > 0, got ${massNAPL0_kg}`);
    if (dissolutionRate_kg_s < 0) throw new RangeError(`dissolutionRate_kg_s must be >= 0`);
    if (!Array.isArray(timeSteps_s) || timeSteps_s.length < 2) {
        throw new RangeError('timeSteps_s must be an array with at least 2 elements');
    }

    const n = timeSteps_s.length;
    const mass_kg: number[] = new Array(n);
    const fractionsRemaining: number[] = new Array(n);

    mass_kg[0] = massNAPL0_kg;
    fractionsRemaining[0] = 1.0;

    for (let i = 1; i < n; i++) {
        const dt = timeSteps_s[i]! - timeSteps_s[i - 1]!;
        mass_kg[i] = Math.max(0, mass_kg[i - 1]! - dissolutionRate_kg_s * dt);
        fractionsRemaining[i] = mass_kg[i]! / massNAPL0_kg;
    }

    // Índice de depleção: primeira vez que massa <= 1% da massa inicial
    const threshold = 0.01 * massNAPL0_kg;
    let depletionIndex = n - 1; // padrão: não esgotou
    let depletionTime_s = Infinity;

    for (let i = 0; i < n; i++) {
        if (mass_kg[i]! <= threshold) {
            depletionIndex = i;
            depletionTime_s = timeSteps_s[i]!;
            break;
        }
    }

    return Object.freeze({
        timeSteps_s: Object.freeze([...timeSteps_s]),
        mass_kg: Object.freeze(mass_kg),
        fractionsRemaining: Object.freeze(fractionsRemaining),
        depletionIndex,
        depletionTime_s,
        unit: 'kg',
    }) as SimulateNAPLDepletionResult;
}

// ---------------------------------------------------------------------------
// 5. First-order Source Decay
// ---------------------------------------------------------------------------

interface ComputeSourceDecayParams {
    C0_mg_L: number;
    k1_per_s: number;
    t_s: number;
}

interface ComputeSourceDecayResult {
    C_mg_L: number;
    C0_mg_L: number;
    k1_per_s: number;
    t_s: number;
    halfLife_s: number;
}

/**
 * First-order exponential decay of source concentration.
 *
 * C(t) = C0 × exp(-k1 × t)
 *
 * k1 can be estimated from: k1 = Fd / (massNAPL × Cs)
 * or from field measurements.
 *
 * @param params
 * @returns
 * @throws RangeError if C0 <= 0, k1 <= 0, or t < 0
 */
export function computeSourceDecay({ C0_mg_L, k1_per_s, t_s }: ComputeSourceDecayParams): ComputeSourceDecayResult {
    if (C0_mg_L <= 0) throw new RangeError(`C0_mg_L must be > 0, got ${C0_mg_L}`);
    if (k1_per_s <= 0) throw new RangeError(`k1_per_s must be > 0, got ${k1_per_s}`);
    if (t_s < 0) throw new RangeError(`t_s must be >= 0, got ${t_s}`);

    const C_mg_L = C0_mg_L * Math.exp(-k1_per_s * t_s);
    const halfLife_s = Math.log(2) / k1_per_s;

    return Object.freeze({ C_mg_L, C0_mg_L, k1_per_s, t_s, halfLife_s });
}

// ---------------------------------------------------------------------------
// 6. NAPL Lifetime Estimation
// ---------------------------------------------------------------------------

interface EstimateNAPLLifetimeParams {
    massNAPL_kg: number;
    Cs_mg_L: number;
    qw_m_s: number;
    Azone_m2: number;
}

interface EstimateNAPLLifetimeResult {
    lifetimeSeconds: number;
    lifetimeYears: number;
    massNAPL_kg: number;
    fluxRate_kg_s: number;
    unit: string;
}

/**
 * Estimate NAPL source lifetime from mass and groundwater flux.
 *
 * Mass flux through source zone:
 *   flux_kg_s = Cs (kg/m³) × qw (m/s) × Azone (m²)
 *
 * Unit conversion: 1 mg/L = 1e-3 kg/m³
 *
 * Lifetime = massNAPL_kg / flux_kg_s
 *
 * @param params
 * @returns
 */
export function estimateNAPLLifetime(
    { massNAPL_kg, Cs_mg_L, qw_m_s, Azone_m2 }: EstimateNAPLLifetimeParams,
): EstimateNAPLLifetimeResult {
    if (massNAPL_kg <= 0) throw new RangeError(`massNAPL_kg must be > 0`);
    if (Cs_mg_L <= 0) throw new RangeError(`Cs_mg_L must be > 0`);
    if (qw_m_s <= 0) throw new RangeError(`qw_m_s must be > 0`);
    if (Azone_m2 <= 0) throw new RangeError(`Azone_m2 must be > 0`);

    // 1 mg/L = 1e-3 kg/m³
    const Cs_kg_m3 = Cs_mg_L * 1e-3;
    const fluxRate_kg_s = Cs_kg_m3 * qw_m_s * Azone_m2;

    const lifetimeSeconds = massNAPL_kg / fluxRate_kg_s;
    const lifetimeYears = lifetimeSeconds / (365.25 * 24 * 3600);

    return Object.freeze({ lifetimeSeconds, lifetimeYears, massNAPL_kg, fluxRate_kg_s, unit: 'years' });
}
