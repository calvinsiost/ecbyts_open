// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Calvin Stefan Iost. All rights reserved.

/**
 * Johnson & Ettinger (1991) Vapor Intrusion Model.
 *
 * Predicts the indoor air attenuation factor (α = Cindoor / Csource) for
 * volatile organic compound (VOC) vapor intrusion from subsurface contamination
 * into buildings. This is the standard USEPA screening model.
 *
 * Academic references:
 *   Johnson, P.C. & Ettinger, R.A. (1991) "Heuristic Model for Predicting the
 *   Intrusion Rate of Contaminant Vapors into Buildings", Environmental Science
 *   & Technology, 25(8), pp. 1445–1452. DOI: 10.1021/es00020a008
 *
 *   USEPA (2002) "OSWER Draft Guidance for Evaluating the Vapor Intrusion to
 *   Indoor Air Pathway from Groundwater and Soils" (November 2002).
 *
 * Implementation notes:
 *   - Simplified diffusion-only model (Qsoil ≈ 0): applies to sites where
 *     pressure-driven advective flow through foundation cracks is negligible
 *     relative to molecular diffusion.
 *   - Millington-Quirk (1961) tortuosity factor for effective diffusivity in
 *     unsaturated porous media.
 *   - Pure-logic module: no DOM, no IDB, no Three.js - importable in Node.js.
 *
 * @module vaporIntrusion
 */

// ---------------------------------------------------------------------------
// DEFAULT CHEMICAL DIFFUSIVITIES
// Atmospheric diffusion coefficients at 25°C in air (m²/s).
// Source: USEPA OSWER (2002), Table 4-1; Lyman et al. (1990).
// ---------------------------------------------------------------------------

interface ChemicalDiffusivity {
    datm: number;
    cas: string;
    name: string;
}

interface MillingtonQuirkParams {
    datm: number;
    n: number;
    theta_ws: number;
}

interface MillingtonQuirkResult {
    deff: number;
    tortuosity: number;
    theta_as: number;
}

interface AttenuationParams {
    deff: number;
    ls: number;
    er: number;
    vb: number;
    ab: number;
}

interface AttenuationResult {
    alpha: number;
    regime: string;
}

interface VaporIntrusionParams {
    csource: number;
    ls: number;
    n: number;
    theta_ws: number;
    datm: number;
    er?: number;
    vb?: number;
    ab?: number;
    lcf?: number;
}

interface VaporIntrusionResult {
    alpha: number;
    cindoorAir: number;
    cindoorAirUnit: string;
    attenuation_db: number;
    classification: string;
    params_used: Record<string, unknown>;
}

/**
 * Common VOC atmospheric diffusion coefficients at 25°C in air (m²/s).
 * Frozen - treat as read-only catalog.
 */
export const DEFAULT_CHEMICAL_DIFFUSIVITIES: Readonly<Record<string, Readonly<ChemicalDiffusivity>>> = Object.freeze({
    benzene: Object.freeze({ datm: 8.8e-6, cas: '71-43-2', name: 'Benzene' }),
    toluene: Object.freeze({ datm: 8.7e-6, cas: '108-88-3', name: 'Toluene' }),
    ethylbenzene: Object.freeze({ datm: 7.5e-6, cas: '100-41-4', name: 'Ethylbenzene' }),
    xylene: Object.freeze({ datm: 7.0e-6, cas: '1330-20-7', name: 'Xylene (mixed)' }),
    tce: Object.freeze({ datm: 7.2e-6, cas: '79-01-6', name: 'Trichloroethylene' }),
    pce: Object.freeze({ datm: 7.2e-6, cas: '127-18-4', name: 'Tetrachloroethylene' }),
    vinyl_chloride: Object.freeze({ datm: 1.06e-5, cas: '75-01-4', name: 'Vinyl Chloride' }),
});

// ---------------------------------------------------------------------------
// MILLINGTON-QUIRK EFFECTIVE DIFFUSIVITY
// ---------------------------------------------------------------------------

/**
 * Computes the effective diffusion coefficient in unsaturated soil using the
 * Millington-Quirk (1961) tortuosity model.
 *
 * Formula: Deff = Datm × (θas^(10/3) / n²)
 *   where θas = n - θws  (air-filled porosity)
 *
 * Reference: Millington, R.J. & Quirk, J.P. (1961) "Permeability of porous
 * solids", Transactions of the Faraday Society, 57, pp. 1200–1207.
 *
 * @param p.datm   - Atmospheric diffusivity (m²/s), chemical-specific.
 * @param p.n      - Total soil porosity (dimensionless, 0 < n ≤ 1).
 * @param p.theta_ws - Water-filled porosity (m³/m³, 0 ≤ θws < n).
 * @throws {RangeError} if n ≤ 0 or theta_ws >= n
 */
export function computeMillingtonQuirkDiffusivity({ datm, n, theta_ws }: MillingtonQuirkParams): Readonly<MillingtonQuirkResult> {
    if (n <= 0 || n > 1) {
        throw new RangeError(`Total porosity n must be in (0, 1], got ${n}`);
    }
    if (theta_ws < 0 || theta_ws >= n) {
        throw new RangeError(`Water-filled porosity theta_ws must be in [0, n), got theta_ws=${theta_ws}, n=${n}`);
    }
    if (datm <= 0) {
        throw new RangeError(`Atmospheric diffusivity datm must be > 0, got ${datm}`);
    }

    // Fração de poros preenchida com ar / air-filled porosity
    const theta_as = n - theta_ws;

    // Fator de tortuosidade Millington-Quirk / Millington-Quirk tortuosity factor
    const tortuosity = Math.pow(theta_as, 10 / 3) / (n * n);

    const deff = datm * tortuosity;

    return Object.freeze({ deff, tortuosity, theta_as });
}

// ---------------------------------------------------------------------------
// ATTENUATION FACTOR (simplified diffusion-only)
// ---------------------------------------------------------------------------

/**
 * Computes the vapor intrusion attenuation factor α using the simplified
 * diffusion-only J&E formula (Qsoil ≈ 0, eq. derived from J&E 1991 §3.2):
 *
 *   α = (Deff/Ls) / (Deff/Ls + er_s × VB/AB)
 *
 * where er_s = er / 3600 (building air exchange rate, converted from /hr to /s).
 *
 * Regime classification:
 *   - 'diffusion_controlled'  if Deff/Ls ≥ er_s × VB/AB
 *   - 'dilution_controlled'   otherwise (ventilation dominates)
 *
 * @param p.deff - Effective diffusivity in soil (m²/s).
 * @param p.ls   - Depth from surface to contamination source (m).
 * @param p.er   - Building air exchange rate (air changes/hour, /hr).
 * @param p.vb   - Building volume (m³).
 * @param p.ab   - Foundation area / building footprint (m²).
 * @throws {RangeError} if ls ≤ 0 or er ≤ 0
 */
export function computeAttenuationFactor({ deff, ls, er, vb, ab }: AttenuationParams): Readonly<AttenuationResult> {
    if (ls <= 0) {
        throw new RangeError(`Source depth ls must be > 0, got ${ls}`);
    }
    if (er <= 0) {
        throw new RangeError(`Air exchange rate er must be > 0, got ${er}`);
    }
    if (vb <= 0) {
        throw new RangeError(`Building volume vb must be > 0, got ${vb}`);
    }
    if (ab <= 0) {
        throw new RangeError(`Foundation area ab must be > 0, got ${ab}`);
    }

    // Taxa de difusão no solo / soil diffusion flux term (m/s)
    const diffFlux = deff / ls;

    // Taxa de diluição pelo ar interior / indoor air dilution term (m/s)
    const erPerSec = er / 3600; // /hr → /s
    const dilutionFlux = erPerSec * (vb / ab);

    // Fator de atenuação / attenuation factor (dimensionless)
    const alpha = diffFlux / (diffFlux + dilutionFlux);

    // Regime: qual mecanismo domina / which mechanism dominates
    const regime = diffFlux >= dilutionFlux ? 'diffusion_controlled' : 'dilution_controlled';

    return Object.freeze({ alpha, regime });
}

// ---------------------------------------------------------------------------
// CLASSIFICATION HELPER
// ---------------------------------------------------------------------------

/**
 * Classifies the attenuation factor into risk tiers per USEPA (2002) screening
 * guidance and common state agency thresholds.
 *
 * @param alpha - Attenuation factor (dimensionless, 0 < α < 1).
 */
function _classifyAlpha(alpha: number): 'negligible' | 'low' | 'moderate' | 'high' {
    if (alpha < 1e-6) return 'negligible';
    if (alpha < 1e-4) return 'low';
    if (alpha < 1e-2) return 'moderate';
    return 'high';
}

// ---------------------------------------------------------------------------
// PRIMARY SOLVER
// ---------------------------------------------------------------------------

/**
 * Full Johnson & Ettinger (1991) vapor intrusion screening calculation.
 * Uses the simplified diffusion-only model (Qsoil ≈ 0).
 *
 * Steps:
 *   1. Compute Deff via Millington-Quirk tortuosity.
 *   2. Compute attenuation factor α via simplified J&E diffusion-only formula.
 *   3. Compute indoor air concentration = α × Csource.
 *   4. Compute log-scale attenuation in dB = 20 × log10(α).
 *   5. Classify α into risk tier.
 *
 * @param params.csource   - Source vapor concentration (μg/m³).
 * @param params.ls        - Depth to contamination source (m).
 * @param params.n         - Total soil porosity (dimensionless, 0–1).
 * @param params.theta_ws  - Water-filled porosity (m³/m³).
 * @param params.datm      - Chemical atmospheric diffusivity (m²/s).
 * @param params.er=0.5    - Building air exchange rate (/hr).
 * @param params.vb=300    - Building volume (m³).
 * @param params.ab=100    - Foundation area (m²).
 * @param params.lcf=0.1   - Foundation thickness (m) - stored in params_used, not used in diffusion-only model.
 * @throws {RangeError} on invalid parameter values
 */
export function solveVaporIntrusion(params: VaporIntrusionParams): Readonly<VaporIntrusionResult> {
    const csource = Number(params.csource);
    const ls = Number(params.ls);
    const n = Number(params.n);
    const theta_ws = Number(params.theta_ws);
    const datm = Number(params.datm);
    const er = Number(params.er ?? 0.5);
    const vb = Number(params.vb ?? 300);
    const ab = Number(params.ab ?? 100);
    const lcf = Number(params.lcf ?? 0.1);

    // Validação de entrada / input validation
    if (n <= 0 || n > 1) {
        throw new RangeError(`Total porosity n must be in (0, 1], got ${n}`);
    }
    if (theta_ws < 0 || theta_ws >= n) {
        throw new RangeError(`Water-filled porosity theta_ws must be in [0, n), got theta_ws=${theta_ws}, n=${n}`);
    }
    if (ls <= 0) {
        throw new RangeError(`Source depth ls must be > 0, got ${ls}`);
    }
    if (er <= 0) {
        throw new RangeError(`Air exchange rate er must be > 0, got ${er}`);
    }
    if (csource < 0) {
        throw new RangeError(`Source concentration csource must be >= 0, got ${csource}`);
    }
    if (datm <= 0) {
        throw new RangeError(`Atmospheric diffusivity datm must be > 0, got ${datm}`);
    }

    // Passo 1: difusividade efetiva / Step 1: effective diffusivity
    const { deff, tortuosity, theta_as } = computeMillingtonQuirkDiffusivity({ datm, n, theta_ws });

    // Passo 2: fator de atenuação / Step 2: attenuation factor
    const { alpha, regime } = computeAttenuationFactor({ deff, ls, er, vb, ab });

    // Passo 3: concentração no ar interior / Step 3: indoor air concentration (μg/m³)
    const cindoorAir = alpha * csource;

    // Passo 4: atenuação em dB (escala logarítmica) / Step 4: log-scale attenuation
    // 20 × log10(α): mais negativo = mais atenuação / more negative = more attenuation
    const attenuation_db = 20 * Math.log10(alpha);

    // Passo 5: classificação do risco / Step 5: risk classification
    const classification = _classifyAlpha(alpha);

    return Object.freeze({
        alpha,
        cindoorAir,
        cindoorAirUnit: 'ug/m3',
        attenuation_db,
        classification,
        params_used: Object.freeze({
            csource,
            ls,
            n,
            theta_ws,
            theta_as,
            datm,
            deff,
            tortuosity,
            er,
            vb,
            ab,
            lcf,
            regime,
        }),
    });
}
