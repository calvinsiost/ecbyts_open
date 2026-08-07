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
// Application: EHS & Mining - Water Treatment Engineering
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
// - Amirtharajah, A. & Mills, C.M. (1982). Rapid-mix design for mechanisms of alum coagulation.
//   J. AWWA 74(4):210-216.
// - AWWA (2011). Water Quality and Treatment: A Handbook on Drinking Water, 6th ed.
//   McGraw-Hill, New York.
// - Yao, K.M. (1970). Theoretical study of high-rate sedimentation.
//   J. WPCF 42(2):218-228.
// - Rose, H.E. (1945). On the resistance coefficient-Reynolds' number relationship for
//   fluid flow through a bed of granular material. Proc. Inst. Mech. Eng. 153:141-148.
// - USEPA (1989). Surface Water Treatment Rule - Disinfection CT tables.
//   40 CFR Part 141, Fed. Reg. 54:27486.
// - MWH (2005). Water Treatment: Principles and Design, 2nd ed. Wiley, Hoboken.
// - Lawrence, A.W. & McCarty, P.L. (1970). Unified basis for biological treatment
//   design and operation. J. San. Eng. Div. ASCE 96(3):757-778.
// - Metcalf & Eddy (2003). Wastewater Engineering, 4th ed. McGraw-Hill.
// - USEPA (1999). Disinfection Profiling and Benchmarking Technical Guidance Manual.
//   EPA 816-R-99-013.
// - Bolton, J.R. & Cotton, C.A. (2011). The Ultraviolet Disinfection Handbook.
//   AWWA, Denver.
// - Stefan, M.I. (2018). Advanced Oxidation Processes for Water Treatment. IWA Publishing.
// - Crittenden, J.C. et al. (2012). MWH's Water Treatment, 3rd ed. Wiley.
// - Rittmann, B.E. & McCarty, P.L. (2001). Environmental Biotechnology: Principles and
//   Applications. McGraw-Hill.

// ---------------------------------------------------------------------------
// Constants
// Physical constants for water treatment calculations
// ---------------------------------------------------------------------------

/** Acceleration due to gravity (m/s²) */
const G = 9.81;

/** Density of particles (typical floc/suspended solids, kg/m³) */
const RHO_PARTICLE_DEFAULT = 1050;

/**
 * Dynamic viscosity of water as a function of temperature (Pa·s).
 * Sutherland approximation valid 0–60°C.
 * @param {number} t_C - Temperature in Celsius
 * @returns {number} Dynamic viscosity in Pa·s
 */
function waterViscosity(t_C: any) {
    // Cheng 2008 simplified formula (±0.5% for 0–60°C)
    return 2.414e-5 * Math.pow(10, 247.8 / (t_C + 273.15 - 140));
}

/**
 * Density of water as a function of temperature (kg/m³).
 * Kell 1975 polynomial, valid 0–100°C.
 * @param {number} t_C - Temperature in Celsius
 * @returns {number} Density in kg/m³
 */
function waterDensity(t_C: any) {
    const t = t_C;
    return (
        (999.83952 +
            16.945176 * t -
            7.9870401e-3 * t * t -
            46.170461e-6 * t * t * t +
            105.56302e-9 * t * t * t * t -
            280.54253e-12 * t * t * t * t * t) /
        (1 + 16.87985e-3 * t)
    );
}

// ---------------------------------------------------------------------------
// 1. Coagulation dose optimum
// Otimização de dose de coagulante baseada em turbidez, COT e pH
// ---------------------------------------------------------------------------

/**
 * Optimum coagulant dose estimation using empirical models
 * (Amirtharajah-Mills 1982; AWWA 2011).
 *
 * Dose model:
 *   D_alum     = 3.5 × NTU^0.4 + 1.5 × TOC
 *   D_ferric   = 0.85 × D_alum
 *   D_pac      = 0.60 × D_alum
 *
 * Predicted turbidity removal is estimated from a log-linear relationship
 * calibrated against jar-test data (AWWA 2011 Table 8-1).
 *
 * @param {number} turbidity_NTU - Raw water turbidity (NTU)
 * @param {number} toc_mg_L      - Total organic carbon (mg/L)
 * @param {number} pH            - Raw water pH
 * @param {number} temperature_C - Water temperature (°C)
 * @param {'alum'|'ferric_chloride'|'pac'} coagulantType - Coagulant type
 * @returns {{optimalDose_mg_L: number, predictedRemoval_pct: number,
 *            optimalPH: number, jar_test_recommendation: string}}
 */
export function coagulationDoseOptimum(turbidity_NTU: any, toc_mg_L: any, pH: any, temperature_C: any, coagulantType: any) {
    if (turbidity_NTU < 0 || toc_mg_L < 0) {
        throw new RangeError('turbidity_NTU and toc_mg_L must be non-negative');
    }

    const validCoagulants = ['alum', 'ferric_chloride', 'pac'];
    if (!validCoagulants.includes(coagulantType)) {
        throw new TypeError(`coagulantType must be one of: ${validCoagulants.join(', ')}`);
    }

    // Base dose for alum (mg/L)
    const doseAlum = 3.5 * Math.pow(turbidity_NTU, 0.4) + 1.5 * toc_mg_L;

    const doseFactor = { alum: 1.0, ferric_chloride: 0.85, pac: 0.6 };
    const optimalDose_mg_L = Math.max(0, doseAlum * doseFactor[coagulantType as keyof typeof doseFactor]);

    // Optimal pH range by coagulant (AWWA 2011)
    const optimalPHMap = {
        alum: 6.8,
        ferric_chloride: 6.0,
        pac: 7.0,
    };
    const optimalPH = optimalPHMap[coagulantType as keyof typeof optimalPHMap];

    // Predicted turbidity removal (empirical log-linear AWWA 2011)
    // At optimal dose, removal increases with turbidity up to ~98%
    const removalBase = Math.min(98, 30 + 18 * Math.log10(1 + turbidity_NTU));
    // pH correction: deviation from optimal reduces removal
    const deltaPH = Math.abs(pH - optimalPH);
    const phPenalty = Math.min(15, deltaPH * 5);
    // Temperature correction: cold water coagulation is less efficient
    const tempPenalty = temperature_C < 5 ? (5 - temperature_C) * 1.5 : 0;
    const predictedRemoval_pct = Math.max(0, removalBase - phPenalty - tempPenalty);

    // Jar test recommendation
    let jar_test_recommendation;
    if (turbidity_NTU < 5 && toc_mg_L > 5) {
        jar_test_recommendation = 'Enhanced coagulation required for TOC; jar test at pH 5.5–6.5 for alum';
    } else if (turbidity_NTU > 200) {
        jar_test_recommendation = 'High turbidity: consider pre-sedimentation; jar test with polymer aid';
    } else if (temperature_C < 5) {
        jar_test_recommendation = 'Cold water: increase dose 20–30%; consider PAC or cationic polymer';
    } else {
        jar_test_recommendation =
            `Standard jar test at pH ${(optimalPH - 0.5).toFixed(1)}–${(optimalPH + 0.5).toFixed(1)} ` +
            `with dose range ${(optimalDose_mg_L * 0.7).toFixed(1)}–${(optimalDose_mg_L * 1.4).toFixed(1)} mg/L`;
    }

    return {
        optimalDose_mg_L: Math.round(optimalDose_mg_L * 10) / 10,
        predictedRemoval_pct: Math.round(predictedRemoval_pct * 10) / 10,
        optimalPH,
        jar_test_recommendation,
    };
}

// ---------------------------------------------------------------------------
// 2. Sedimentation tank design
// Dimensionamento hidráulico de decantador (Yao 1970; Metcalf-Eddy 2003)
// ---------------------------------------------------------------------------

/**
 * Sedimentation tank hydraulic design using Stokes settling law and
 * overflow rate theory (Yao 1970; Metcalf-Eddy 2003).
 *
 * Stokes settling velocity: vs = (ρp − ρw) × g × d² / (18 × μ)
 * Surface overflow rate: SOR = Q / A
 * Removal efficiency: E = vs / SOR  (for vs < SOR, capped at 1)
 *
 * @param {number} flowRate_m3_day        - Design flow rate (m³/day)
 * @param {number} suspendedSolids_mg_L   - Influent SS concentration (mg/L)
 * @param {number} particleDiameter_um    - Representative particle diameter (µm)
 * @param {number} temperature_C          - Water temperature (°C)
 * @returns {{surfaceArea_m2: number, volume_m3: number,
 *            horizontalVelocity_m_s: number, settlingVelocity_m_s: number,
 *            hydraulicRetentionTime_hr: number, removalEfficiency_pct: number}}
 */
export function sedimentationTankDesign(flowRate_m3_day: any, suspendedSolids_mg_L: any, particleDiameter_um: any, temperature_C: any) {
    if (flowRate_m3_day <= 0) throw new RangeError('flowRate_m3_day must be positive');
    if (particleDiameter_um <= 0) throw new RangeError('particleDiameter_um must be positive');

    const mu = waterViscosity(temperature_C); // Pa·s
    const rhoW = waterDensity(temperature_C); // kg/m³
    const rhoP = RHO_PARTICLE_DEFAULT; // kg/m³
    const d = particleDiameter_um * 1e-6; // m

    // Stokes settling velocity (m/s)
    const settlingVelocity_m_s = ((rhoP - rhoW) * G * d * d) / (18 * mu);

    // Design surface overflow rate (SOR) = vs × safety factor 1.5
    // (typical WTP design practice: SOR = 1.0–4.0 m/h for conventional settling)
    const designSOR_m_s = settlingVelocity_m_s / 1.5;

    const flowRate_m3_s = flowRate_m3_day / 86400;

    // Required surface area from SOR = Q/A
    const surfaceArea_m2 = flowRate_m3_s / designSOR_m_s;

    // Assume length:width ratio 4:1 and depth 3 m (conventional tank proportions)
    const depth_m = 3.0;
    const volume_m3 = surfaceArea_m2 * depth_m;

    // Hydraulic retention time
    const hydraulicRetentionTime_hr = volume_m3 / flowRate_m3_s / 3600;

    // Horizontal flow velocity (tank width = sqrt(surfaceArea/4) for L:W=4:1)
    const width_m = Math.sqrt(surfaceArea_m2 / 4);
    const crossSectionArea_m2 = width_m * depth_m;
    const horizontalVelocity_m_s = flowRate_m3_s / crossSectionArea_m2;

    // Removal efficiency
    const actualSOR_m_s = flowRate_m3_s / surfaceArea_m2;
    const removalFraction = Math.min(1, settlingVelocity_m_s / actualSOR_m_s);
    const removalEfficiency_pct = removalFraction * 100;

    return {
        surfaceArea_m2: Math.round(surfaceArea_m2 * 100) / 100,
        volume_m3: Math.round(volume_m3 * 10) / 10,
        horizontalVelocity_m_s: Math.round(horizontalVelocity_m_s * 1e6) / 1e6,
        settlingVelocity_m_s: Math.round(settlingVelocity_m_s * 1e8) / 1e8,
        hydraulicRetentionTime_hr: Math.round(hydraulicRetentionTime_hr * 100) / 100,
        removalEfficiency_pct: Math.round(removalEfficiency_pct * 10) / 10,
    };
}

// ---------------------------------------------------------------------------
// 3. Filtration headloss
// Perda de carga em filtração granular (Rose 1945; Kozeny-Carman)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FilterMediaLayer
 * @property {string} material   - Media name (e.g. 'sand', 'anthracite')
 * @property {number} d10_mm     - Effective size d10 (mm)
 * @property {number} uc         - Uniformity coefficient (d60/d10)
 * @property {number} depth_m    - Layer depth (m)
 * @property {number} porosity   - Bed porosity (dimensionless, 0–1)
 */

/**
 * Granular media filtration design using the Rose (1945) headloss equation
 * and Kozeny-Carman for clean-bed estimation.
 *
 * Rose equation: hl = 1.067 × Cd × v² × L / (g × ε⁴ × d)
 * Cd (drag coefficient) ≈ 24/Re + 3/√Re + 0.34 (Schiller-Naumann)
 *
 * @param {FilterMediaLayer[]} media          - Filter media layers array
 * @param {number}             filtrationRate_m_hr - Filtration rate (m/h)
 * @param {number}             headloss_m          - Available headloss (m)
 * @returns {{cleanBedHeadloss_m: number, runTime_hr: number,
 *            backwashVelocity_m_hr: number, turbidityRemoval_pct: number}}
 */
export function filtrationHeadloss(media: any, filtrationRate_m_hr: any, headloss_m: any) {
    if (!Array.isArray(media) || media.length === 0) {
        throw new TypeError('media must be a non-empty array');
    }
    if (filtrationRate_m_hr <= 0) throw new RangeError('filtrationRate_m_hr must be positive');
    if (headloss_m <= 0) throw new RangeError('headloss_m must be positive');

    const temperature_C = 20; // Standard design temperature
    const mu = waterViscosity(temperature_C);
    const rhoW = waterDensity(temperature_C);
    const v = filtrationRate_m_hr / 3600; // m/s

    let totalCleanBedHL = 0;

    for (const layer of media) {
        const d = layer.d10_mm * 1e-3; // m (use d10 as representative size)
        const eps = layer.porosity;
        const L = layer.depth_m;

        // Reynolds number
        const Re = (rhoW * v * d) / mu;

        // Drag coefficient (Schiller-Naumann composite)
        let Cd;
        if (Re < 0.5) {
            Cd = 24 / Re;
        } else if (Re < 500) {
            Cd = 24 / Re + 3 / Math.sqrt(Re) + 0.34;
        } else {
            Cd = 0.43;
        }

        // Rose (1945) headloss per layer
        const hl_layer = (1.067 * Cd * v * v * L) / (G * Math.pow(eps, 4) * d);
        totalCleanBedHL += hl_layer;
    }

    // Filter run time (hrs): ratio of available vs clean-bed HL drives clogging rate
    // Empirical relationship: run time ≈ (available HL / clean-bed HL) × 20 hr baseline
    // (design practice: 24–72 hr runs; cap at 72 hr)
    const hlRatio = headloss_m / Math.max(totalCleanBedHL, 0.001);
    const runTime_hr = Math.min(72, Math.max(8, hlRatio * 24));

    // Backwash velocity: 1.3 × settling velocity of d10 grain (Metcalf-Eddy 2003)
    // Use smallest media d10 to prevent washout of fines
    const d10_min_m = Math.min(...media.map((m) => m.d10_mm)) * 1e-3;
    // Approximate grain density: 2650 kg/m³ (quartz)
    const rhoGrain = 2650;
    const vs_grain = ((rhoGrain - rhoW) * G * d10_min_m * d10_min_m) / (18 * mu);
    const backwashVelocity_m_hr = 1.3 * vs_grain * 3600;

    // Turbidity removal: empirical correlation (10-log credit for dual media with NTF)
    // Single sand: ~95%; dual media: ~99%; multimedia: ~99.5%
    let turbidityRemoval_pct;
    if (media.length === 1) {
        turbidityRemoval_pct = 95;
    } else if (media.length === 2) {
        turbidityRemoval_pct = 99;
    } else {
        turbidityRemoval_pct = 99.5;
    }

    return {
        cleanBedHeadloss_m: Math.round(totalCleanBedHL * 1000) / 1000,
        runTime_hr: Math.round(runTime_hr * 10) / 10,
        backwashVelocity_m_hr: Math.round(backwashVelocity_m_hr * 10) / 10,
        turbidityRemoval_pct,
    };
}

// ---------------------------------------------------------------------------
// 4. Chlorination disinfection (CT concept)
// Desinfecção por cloro livre - conceito CT (USEPA SWTR 1989)
// ---------------------------------------------------------------------------

/**
 * Required CT values for disinfection by-products of concern (USEPA SWTR 1989).
 * CT in mg·min/L for free chlorine at given pH and temperature.
 * Format: { organism: { pH: { tempC: requiredCT } } }
 * @private
 */
const CT_TABLES = {
    giardia: {
        // 3-log inactivation, free Cl2, USEPA Table C-1 (simplified)
        6.0: { 0.5: 119, 5: 97, 10: 73, 15: 50, 20: 36, 25: 27 },
        6.5: { 0.5: 124, 5: 100, 10: 75, 15: 51, 20: 37, 25: 28 },
        7.0: { 0.5: 165, 5: 132, 10: 99, 15: 68, 20: 48, 25: 36 },
        7.5: { 0.5: 216, 5: 173, 10: 130, 15: 90, 20: 63, 25: 47 },
        8.0: { 0.5: 291, 5: 233, 10: 175, 15: 121, 20: 85, 25: 64 },
        8.5: { 0.5: 386, 5: 309, 10: 232, 15: 160, 20: 113, 25: 85 },
    },
    viruses: {
        // 4-log inactivation, free Cl2, USEPA (very low CT)
        6.0: { 0.5: 2, 5: 2, 10: 2, 15: 1, 20: 1, 25: 1 },
        7.0: { 0.5: 3, 5: 3, 10: 2, 15: 2, 20: 1, 25: 1 },
        8.0: { 0.5: 6, 5: 5, 10: 4, 15: 3, 20: 2, 25: 2 },
    },
    cryptosporidium: {
        // Note: free chlorine is ineffective; CT value set to Infinity as sentinel
        7.0: { 10: Infinity },
    },
};

/**
 * Interpolate CT requirement from USEPA tables.
 * @private
 * @param {string} organism
 * @param {number} pH
 * @param {number} temperature_C
 * @returns {number}
 */
function interpolateCT(organism: any, pH: any, temperature_C: any) {
    if (organism === 'cryptosporidium') return Infinity;

    const phTable = (CT_TABLES as Record<string, Record<number, Record<number, number>>>)[organism] as Record<number, Record<number, number>>;
    if (!phTable) return 100; // Fallback

    // Clamp pH to table range
    const pHKeys = Object.keys(phTable)
        .map(Number)
        .sort((a, b) => a - b);
    const pHClamped = Math.max(pHKeys[0]!, Math.min(pHKeys[pHKeys.length - 1]!, pH));
    const pHLow = pHKeys.reduce((p, c) => (c <= pHClamped ? c : p), pHKeys[0]!);
    const pHHigh = pHKeys.find((k) => k >= pHClamped) || pHLow;

    // Clamp temperature to table range
    const tempKeys = Object.keys(phTable[pHLow]!)
        .map(Number)
        .sort((a, b) => a - b);
    const tempClamped = Math.max(tempKeys[0]!, Math.min(tempKeys[tempKeys.length - 1]!, temperature_C));
    const tempLow = tempKeys.reduce((p, c) => (c <= tempClamped ? c : p), tempKeys[0]!);
    const tempHigh = tempKeys.find((k) => k >= tempClamped) || tempLow;

    /** @param {number} pHk @param {number} Tk @returns {number} */
    function getVal(pHk: any, Tk: any) {
        return (phTable[pHk] || {})[Tk] ?? 100;
    }

    // Bilinear interpolation
    const pHFrac = pHLow === pHHigh ? 0 : (pHClamped - pHLow) / (pHHigh - pHLow);
    const tFrac = tempLow === tempHigh ? 0 : (tempClamped - tempLow) / (tempHigh - tempLow);

    const ct00 = getVal(pHLow, tempLow);
    const ct10 = getVal(pHHigh, tempLow);
    const ct01 = getVal(pHLow, tempHigh);
    const ct11 = getVal(pHHigh, tempHigh);

    return (
        ct00 * (1 - pHFrac) * (1 - tFrac) +
        ct10 * pHFrac * (1 - tFrac) +
        ct01 * (1 - pHFrac) * tFrac +
        ct11 * pHFrac * tFrac
    );
}

/**
 * Chlorination CT-based disinfection compliance assessment
 * (USEPA SWTR 1989; 40 CFR Part 141).
 *
 * CT = residual_chlorine × contact_time
 * Log inactivation = CT_achieved / CT_required_per_log_credit
 *
 * @param {number} cl2Dose_mg_L      - Applied chlorine dose (mg/L)
 * @param {number} residual_mg_L     - Measured residual chlorine (mg/L)
 * @param {number} contactTime_min   - Contact time T10 (min)
 * @param {number} pH                - Water pH
 * @param {number} temperature_C     - Water temperature (°C)
 * @param {'giardia'|'cryptosporidium'|'viruses'} target_organism
 * @returns {{CT_mg_L_min: number, requiredCT: number, logInactivation: number,
 *            compliant: boolean, residualAfterContact: number}}
 */
export function chlorinationDisinfection(
    cl2Dose_mg_L: any,
    residual_mg_L: any,
    contactTime_min: any,
    pH: any,
    temperature_C: any,
    target_organism: any,
) {
    const validOrgs = ['giardia', 'cryptosporidium', 'viruses'];
    if (!validOrgs.includes(target_organism)) {
        throw new TypeError(`target_organism must be one of: ${validOrgs.join(', ')}`);
    }
    if (residual_mg_L < 0 || contactTime_min <= 0) {
        throw new RangeError('residual_mg_L must be non-negative and contactTime_min positive');
    }

    // Achieved CT
    const CT_mg_L_min = residual_mg_L * contactTime_min;

    // Required CT (3-log for Giardia, 4-log for viruses, Inf for Crypto)
    const requiredCT = interpolateCT(target_organism, pH, temperature_C);

    // Log inactivation achieved
    let logInactivation;
    if (target_organism === 'cryptosporidium') {
        logInactivation = 0; // Cl2 ineffective
    } else if (requiredCT === 0) {
        logInactivation = Infinity;
    } else {
        // Credit per log: requiredCT is for 3-log (Giardia) or 4-log (viruses)
        const targetLog = target_organism === 'giardia' ? 3 : 4;
        logInactivation = (CT_mg_L_min / requiredCT) * targetLog;
    }

    // Regulatory compliance check
    const requiredLog = target_organism === 'giardia' ? 3 : target_organism === 'viruses' ? 4 : 3; // Crypto needs separate treatment train
    const compliant =
        target_organism === 'cryptosporidium'
            ? false // Must use UV or O3
            : logInactivation >= requiredLog;

    // Chlorine demand and residual after contact
    const demand_mg_L = Math.max(0, cl2Dose_mg_L - residual_mg_L);
    const residualAfterContact = Math.max(0, residual_mg_L - demand_mg_L * 0.1 * (contactTime_min / 30));

    return {
        CT_mg_L_min: Math.round(CT_mg_L_min * 100) / 100,
        requiredCT: requiredCT === Infinity ? Infinity : Math.round(requiredCT * 10) / 10,
        logInactivation: logInactivation === Infinity ? Infinity : Math.round(logInactivation * 100) / 100,
        compliant,
        residualAfterContact: Math.round(residualAfterContact * 100) / 100,
    };
}

// ---------------------------------------------------------------------------
// 5. Membrane filtering flux
// Fluxo de filtração por membrana (Darcy; MWH 2005)
// ---------------------------------------------------------------------------

/**
 * Typical membrane characteristics by type.
 * @private
 */
const MEMBRANE_PARAMS = {
    mf: { permeability_base: 800, rejection_pct: 90 }, // L/m²/hr/bar
    uf: { permeability_base: 200, rejection_pct: 99 },
    nf: { permeability_base: 10, rejection_pct: 95 },
    ro: { permeability_base: 4, rejection_pct: 99.5 },
};

/**
 * Membrane filtration flux and performance using Darcy-Weisbach resistance model
 * (MWH 2005; Metcalf-Eddy 2003).
 *
 * Pure water flux: J = ΔP / (μ × Rm)
 * Fouled flux:    J = ΔP / (μ × (Rm + Rf))
 * where Rm and Rf are membrane and fouling resistance (1/m).
 *
 * @param {'mf'|'uf'|'nf'|'ro'} membrane_type  - Membrane process type
 * @param {number} pressure_kPa                  - Applied transmembrane pressure (kPa)
 * @param {number} temperature_C                 - Water temperature (°C)
 * @param {number} foulingResistance             - Relative fouling resistance (0–1 scale)
 * @returns {{flux_L_m2_hr: number, permeability_L_m2_hr_kPa: number,
 *            rejectionRate_pct: number, energyConsumption_kWh_m3: number,
 *            foulingIndex: number}}
 */
export function membraneFilteringFlux(membrane_type: any, pressure_kPa: any, temperature_C: any, foulingResistance: any) {
    const validTypes = ['mf', 'uf', 'nf', 'ro'];
    if (!validTypes.includes(membrane_type)) {
        throw new TypeError(`membrane_type must be one of: ${validTypes.join(', ')}`);
    }
    if (pressure_kPa <= 0) throw new RangeError('pressure_kPa must be positive');
    if (foulingResistance < 0 || foulingResistance > 1) {
        throw new RangeError('foulingResistance must be in [0, 1]');
    }

    const params = MEMBRANE_PARAMS[membrane_type as keyof typeof MEMBRANE_PARAMS];

    // Viscosity correction factor relative to 20°C
    const mu20 = waterViscosity(20);
    const muT = waterViscosity(temperature_C);
    const viscCorrFactor = mu20 / muT; // >1 for T>20°C (lower viscosity = higher flux)

    // Clean permeability corrected for temperature
    const permeability_L_m2_hr_kPa = params.permeability_base * viscCorrFactor;

    // Flux accounting for fouling (resistance model)
    // Rf/Rm = foulingResistance (provided as fraction of clean membrane resistance)
    const fluxFactor = 1 / (1 + foulingResistance * 3); // Rf = 3 × fouling × Rm
    const flux_L_m2_hr = permeability_L_m2_hr_kPa * pressure_kPa * fluxFactor;

    // Energy consumption (kWh/m³)
    // E = (ΔP × Q) / (η × 1000) where η = pump efficiency 0.75
    // Simplified: E = ΔP[bar] / (η × 3.6) = pressure_kPa/100/0.75/3.6
    const pumpEfficiency = 0.75;
    const energyConsumption_kWh_m3 = pressure_kPa / 100 / (pumpEfficiency * 3.6);

    // Fouling index: 0 = clean, 1 = fully fouled
    const foulingIndex = Math.round(foulingResistance * 100) / 100;

    return {
        flux_L_m2_hr: Math.round(flux_L_m2_hr * 10) / 10,
        permeability_L_m2_hr_kPa: Math.round(permeability_L_m2_hr_kPa * 100) / 100,
        rejectionRate_pct: params.rejection_pct,
        energyConsumption_kWh_m3: Math.round(energyConsumption_kWh_m3 * 1000) / 1000,
        foulingIndex,
    };
}

// ---------------------------------------------------------------------------
// 6. Activated sludge bioreactor
// Dimensionamento de reator de lodo ativado (Lawrence-McCarty 1970)
// ---------------------------------------------------------------------------

/**
 * Activated sludge bioreactor design using Lawrence-McCarty kinetics
 * (Lawrence-McCarty 1970; Metcalf-Eddy 2003).
 *
 * Effluent BOD: S = Ks × (1 + b × SRT) / (SRT × (μmax − b) − 1)
 * MLSS: X = Y × (S0 − S) × SRT / ((1 + b × SRT) × HRT)
 * O2 demand: Do = Q × (S0 − S) − 1.42 × Px_vss
 *
 * @param {number} bod5_mg_L      - Influent BOD5 (mg/L)
 * @param {number} tn_mg_L        - Total nitrogen (mg/L) - for nutrient check
 * @param {number} tp_mg_L        - Total phosphorus (mg/L) - for nutrient check
 * @param {number} flowRate_m3_day - Design flow rate (m³/day)
 * @param {number} srt_days       - Solids retention time / sludge age (days)
 * @param {number} temperature_C  - Reactor temperature (°C)
 * @returns {{srtRequired_days: number, hrt_hr: number, mlss_mg_L: number,
 *            sludgeProduction_kg_day: number, oxygenDemand_kg_O2_day: number,
 *            effluentBOD_mg_L: number}}
 */
export function activatedSludgeBioreactor(bod5_mg_L: any, tn_mg_L: any, tp_mg_L: any, flowRate_m3_day: any, srt_days: any, temperature_C: any) {
    if (bod5_mg_L <= 0) throw new RangeError('bod5_mg_L must be positive');
    if (flowRate_m3_day <= 0) throw new RangeError('flowRate_m3_day must be positive');
    if (srt_days <= 0) throw new RangeError('srt_days must be positive');

    // Kinetic constants at 20°C (Metcalf-Eddy 2003, Table 7-14)
    const Y = 0.6; // gVSS/gBOD (yield coefficient)
    const mu_max20 = 6; // /day (maximum specific growth rate)
    const Ks20 = 60; // mg/L BOD (half-saturation constant)
    const b20 = 0.1; // /day (endogenous decay coefficient)

    // Temperature corrections (Arrhenius, θ = 1.04 for μmax, 1.03 for b)
    const thetaMu = 1.04;
    const thetaB = 1.03;
    const mu_max = mu_max20 * Math.pow(thetaMu, temperature_C - 20);
    const b = b20 * Math.pow(thetaB, temperature_C - 20);
    const Ks = Ks20; // Ks temperature dependence minor; kept at 20°C value

    // Minimum SRT (washout threshold)
    const srtMin = 1 / (mu_max - b);
    const srtRequired_days = Math.max(srtMin * 2, 2); // Safety factor 2 above washout

    // Effluent BOD (Lawrence-McCarty model)
    const effluentBOD_mg_L = Math.max(0.5, (Ks * (1 + b * srt_days)) / (srt_days * (mu_max - b) - 1));

    // HRT from mass balance: HRT = SRT × Y × (S0−S) / ((1 + b×SRT) × MLVSS_target)
    // Use target MLVSS = 2500 mg/L (typical design)
    const mlvss_target = 2500; // mg/L
    const S0 = bod5_mg_L;
    const S = effluentBOD_mg_L;
    const hrt_days = (Y * (S0 - S) * srt_days) / ((1 + b * srt_days) * mlvss_target);
    const hrt_hr = hrt_days * 24;

    // MLSS (assuming VSS/TSS = 0.80)
    const mlvss_actual = (Y * (S0 - S) * srt_days) / ((1 + b * srt_days) * hrt_days);
    const mlss_mg_L = mlvss_actual / 0.8;

    // Sludge production (net VSS)
    const Px_vss_kg_day = (Y * flowRate_m3_day * (S0 - S)) / ((1 + b * srt_days) * 1000);
    const sludgeProduction_kg_day = Px_vss_kg_day / 0.8;

    // Oxygen demand (carbonaceous BOD removal only; nitrification extra)
    const oxygenDemand_kg_O2_day = (flowRate_m3_day * (S0 - S)) / 1000 - 1.42 * Px_vss_kg_day;

    return {
        srtRequired_days: Math.round(srtRequired_days * 10) / 10,
        hrt_hr: Math.round(hrt_hr * 10) / 10,
        mlss_mg_L: Math.round(mlss_mg_L),
        sludgeProduction_kg_day: Math.round(sludgeProduction_kg_day * 10) / 10,
        oxygenDemand_kg_O2_day: Math.round(oxygenDemand_kg_O2_day * 10) / 10,
        effluentBOD_mg_L: Math.round(effluentBOD_mg_L * 100) / 100,
    };
}

// ---------------------------------------------------------------------------
// 7. Ozone disinfection
// Tratamento com ozônio (USEPA 1999; MWH 2012)
// ---------------------------------------------------------------------------

/**
 * Ozone treatment design including CT concept, bromate formation proxy,
 * and biologically degradable organic carbon (BDOC) estimation
 * (USEPA 1999; MWH 2012).
 *
 * Ozone demand ≈ 1.5 × TOC + 0.5 × UV254[1/cm] × 1000
 * CT for 3-log Giardia at 10°C, pH 7 = 0.48 mg·min/L
 * Bromate proxy: [BrO3⁻] ≈ k_br × dose × [Br⁻]_est (simplified model)
 *
 * @param {number} dose_mg_L          - Applied ozone dose (mg/L)
 * @param {number} ct_value           - CT value achieved (mg·min/L)
 * @param {number} target_log_removal - Target pathogen log removal
 * @param {{temperature_C: number, pH: number, toc_mg_L: number, uv254_per_cm: number}} waterQuality
 * @returns {{contactTime_min: number, generatorCapacity_g_hr: number,
 *            bromate_ug_L: number, biodegradableOC_pct: number,
 *            energyCost_kWh_m3: number}}
 */
export function ozoneDisinfection(dose_mg_L: any, ct_value: any, target_log_removal: any, waterQuality: any) {
    if (dose_mg_L <= 0) throw new RangeError('dose_mg_L must be positive');
    if (ct_value < 0) throw new RangeError('ct_value must be non-negative');
    if (!waterQuality || typeof waterQuality !== 'object') {
        throw new TypeError('waterQuality must be an object');
    }

    const { temperature_C, pH, toc_mg_L, uv254_per_cm } = waterQuality;

    // Ozone demand (mg/L) consumed before residual
    const demand_mg_L = 1.5 * (toc_mg_L || 2) + 0.5 * (uv254_per_cm || 0.02) * 1000;

    // Residual ozone after demand is met
    const residual_mg_L = Math.max(0, dose_mg_L - demand_mg_L);

    // Contact time from CT definition: T = CT / residual
    const contactTime_min = residual_mg_L > 0 ? ct_value / residual_mg_L : ct_value * 5;

    // Generator capacity (g/hr) for 1000 m³/day design flow
    // Capacity = dose × flow / contact_efficiency (0.90 transfer efficiency)
    const designFlow_m3_hr = 1000 / 24; // default design basis
    const transferEfficiency = 0.9;
    const generatorCapacity_g_hr = (dose_mg_L * designFlow_m3_hr * 1000) / transferEfficiency / 1000;

    // Bromate formation (µg/L) - simplified proxy model
    // BrO3⁻ formation increases with dose, pH, and temperature (Richardson 2003)
    // Assume background bromide ~50 µg/L (typical groundwater)
    const bromide_ug_L = 50;
    const kBromate = 0.006 * Math.pow(1.05, temperature_C - 10) * Math.pow(1.2, pH - 7);
    const bromate_ug_L = Math.min(100, (kBromate * dose_mg_L * bromide_ug_L) / 10);

    // Biodegradable DOC increase (% of TOC converted to BDOC by ozone)
    // Typical ozone/TOC ratio 0.5–2.0: BDOC = 15–40% of TOC (MWH 2012)
    const ozoneTOCRatio = toc_mg_L > 0 ? dose_mg_L / toc_mg_L : 1;
    const biodegradableOC_pct = Math.min(40, Math.max(5, ozoneTOCRatio * 15));

    // Energy cost: ozone generation ≈ 8–12 kWh/kg O3; 10 kWh/kg typical
    const energyCost_kWh_m3 = ((dose_mg_L * 10) / 1e6) * 1000; // (mg/L × 10 kWh/kg) / 1e6 g/kg × 1000 L/m³

    return {
        contactTime_min: Math.round(contactTime_min * 100) / 100,
        generatorCapacity_g_hr: Math.round(generatorCapacity_g_hr * 10) / 10,
        bromate_ug_L: Math.round(bromate_ug_L * 10) / 10,
        biodegradableOC_pct: Math.round(biodegradableOC_pct * 10) / 10,
        energyCost_kWh_m3: Math.round(energyCost_kWh_m3 * 10000) / 10000,
    };
}

// ---------------------------------------------------------------------------
// 8. Advanced oxidation process (UV/H2O2 AOP)
// Processos de oxidação avançada (Bolton-Cotton 2011; Stefan 2018)
// ---------------------------------------------------------------------------

/**
 * kOH rate constants for selected contaminants (M⁻¹s⁻¹).
 * Source: Stefan (2018) Table 2.1; Buxton et al. (1988) compilation.
 * @private
 */
const KOH_CONTAMINANTS = {
    atrazine: 3.0e9,
    micropollutant: 3.0e9, // Generic micropollutant
    tce: 4.0e9, // Trichloroethylene
    benzene: 7.8e9,
    toluene: 5.1e9,
    pharmaceutical: 5.0e9, // Generic pharmaceutical
    ndma: 3.3e8,
    default: 3.0e9,
};

/**
 * UV/H2O2 Advanced Oxidation Process (AOP) design
 * (Bolton-Cotton 2011; Stefan 2018; USEPA UV Manual 2006).
 *
 * Log removal = kOH × [·OH]ss × exposure_time × 2.303
 * EEO = P_kW / (flow_m3_hr × log_removal) [kWh/m³/log]
 *
 * @param {string} contaminant          - Contaminant name (see KOH_CONTAMINANTS)
 * @param {number} concentration_ug_L   - Initial concentration (µg/L)
 * @param {number} uv_intensity_mW_cm2  - UV irradiance at 254 nm (mW/cm²)
 * @param {number} h2o2_dose_mg_L       - Hydrogen peroxide dose (mg/L)
 * @param {number} contactTime_min      - UV exposure / contact time (min)
 * @returns {{degradationRate_per_min: number, removalEfficiency_pct: number,
 *            h2o2Residual_mg_L: number, electricalEnergy_kWh_m3: number,
 *            eeo_kWh_m3_log: number}}
 */
export function advancedOxidationProcess(
    contaminant: any,
    concentration_ug_L: any,
    uv_intensity_mW_cm2: any,
    h2o2_dose_mg_L: any,
    contactTime_min: any,
) {
    if (concentration_ug_L < 0) throw new RangeError('concentration_ug_L must be non-negative');
    if (uv_intensity_mW_cm2 <= 0) throw new RangeError('uv_intensity_mW_cm2 must be positive');
    if (h2o2_dose_mg_L < 0) throw new RangeError('h2o2_dose_mg_L must be non-negative');
    if (contactTime_min <= 0) throw new RangeError('contactTime_min must be positive');

    const kOH =
        (KOH_CONTAMINANTS as Record<string, number>)[contaminant.toLowerCase()] || KOH_CONTAMINANTS.default;

    // UV fluence (mJ/cm²) = irradiance × time
    const fluence_mJ_cm2 = uv_intensity_mW_cm2 * contactTime_min * 60; // 60 s/min

    // Steady-state OH radical concentration [·OH]ss (M)
    // [·OH]ss ≈ k_H2O2_OH × [H2O2] / (kOH_scav × [scavengers])
    // Simplified: [·OH]ss ≈ 1.5e-12 × (H2O2_mM)^0.5 × fluence_factor
    const h2o2_mM = h2o2_dose_mg_L / 34.015; // MW H2O2 = 34.015 g/mol
    const oh_ss = 1.5e-12 * Math.sqrt(Math.max(h2o2_mM, 0.01)) * (fluence_mJ_cm2 / 1000);

    // Pseudo-first-order degradation rate constant (1/min)
    const k_obs_s = kOH * oh_ss; // 1/s
    const degradationRate_per_min = k_obs_s * 60;

    // Removal efficiency
    const contactTime_s = contactTime_min * 60;
    const logRemoval = (kOH * oh_ss * contactTime_s) / Math.LN10;
    const removalEfficiency_pct = Math.min(99.99, (1 - Math.pow(10, -logRemoval)) * 100);

    // H2O2 consumption: ~2.5 mg H2O2 per mg·min/L UV exposure; simplified
    const h2o2Consumed = Math.min(h2o2_dose_mg_L, 0.003 * fluence_mJ_cm2);
    const h2o2Residual_mg_L = Math.max(0, h2o2_dose_mg_L - h2o2Consumed);

    // Electrical energy per order (EEO): kWh/m³ per log removal
    // EEO = (UV irradiance × area / flow) / log_removal
    // Typical UV reactor: 1 kW per 30 m³/hr at 40 mJ/cm²
    const uvEnergyDensity_kWh_m3 = (uv_intensity_mW_cm2 * contactTime_min * 60) / 3.6e6; // J/cm² → kWh/L → per m³
    const electricalEnergy_kWh_m3 = uvEnergyDensity_kWh_m3 * 1000; // per m³

    const eeo_kWh_m3_log = logRemoval > 0.001 ? electricalEnergy_kWh_m3 / logRemoval : 999;

    return {
        degradationRate_per_min: Math.round(degradationRate_per_min * 1e10) / 1e10,
        removalEfficiency_pct: Math.round(removalEfficiency_pct * 100) / 100,
        h2o2Residual_mg_L: Math.round(h2o2Residual_mg_L * 100) / 100,
        electricalEnergy_kWh_m3: Math.round(electricalEnergy_kWh_m3 * 1000) / 1000,
        eeo_kWh_m3_log: Math.round(eeo_kWh_m3_log * 100) / 100,
    };
}

// ---------------------------------------------------------------------------
// 9. Ion exchange softening
// Amaciamento por troca iônica (MWH 2012; Crittenden 2012)
// ---------------------------------------------------------------------------

/**
 * Ion exchange water softening design
 * (MWH 2012; Crittenden et al. 2012).
 *
 * Hardness in meq/L: [Ca²⁺] × 2/40.08 + [Mg²⁺] × 2/24.31
 * CaCO3 equivalents: 1 meq/L = 50 mg/L as CaCO3
 * Run length (BV) = resin_capacity / influent_equivalents_per_BV
 * NaCl requirement: 0.15 kg/kg CaCO3 removed
 *
 * @param {number} hardness_mg_L_CaCO3    - Influent total hardness (mg/L as CaCO3)
 * @param {number} alkalinity_mg_L        - Total alkalinity (mg/L as CaCO3)
 * @param {number} resinCapacity_meq_L    - Resin exchange capacity (meq/L resin)
 * @param {number} serviceFlow_BV_hr      - Service flow rate (bed volumes per hour)
 * @returns {{resinVolume_L: number, runLength_BV: number,
 *            regenerantDose_kg_NaCl: number, effluentHardness_mg_L: number,
 *            recoveryRate_pct: number}}
 */
export function ionExchangeSoftening(hardness_mg_L_CaCO3: any, alkalinity_mg_L: any, resinCapacity_meq_L: any, serviceFlow_BV_hr: any) {
    if (hardness_mg_L_CaCO3 <= 0) throw new RangeError('hardness_mg_L_CaCO3 must be positive');
    if (resinCapacity_meq_L <= 0) throw new RangeError('resinCapacity_meq_L must be positive');
    if (serviceFlow_BV_hr <= 0) throw new RangeError('serviceFlow_BV_hr must be positive');

    // Convert hardness to meq/L (50 mg/L CaCO3 = 1 meq/L)
    const hardness_meq_L = hardness_mg_L_CaCO3 / 50;

    // Run length (bed volumes) before breakthrough
    // Run length BV = capacity [meq/L resin] / concentration [meq/L water]
    const runLength_BV = Math.floor(resinCapacity_meq_L / hardness_meq_L);

    // Resin volume for 1000 L/day design flow (normalize to BV basis)
    // For 1 m³/hr design: V_resin = Q / serviceFlow_BV_hr
    const designFlow_L_hr = 1000;
    const resinVolume_L = designFlow_L_hr / serviceFlow_BV_hr;

    // Regenerant dose (kg NaCl per regeneration cycle)
    // Removed CaCO3 per cycle = hardness × flow × run time
    const runTime_hr = runLength_BV / serviceFlow_BV_hr;
    const removedCaCO3_kg = (hardness_mg_L_CaCO3 / 1e6) * designFlow_L_hr * runTime_hr;
    const regenerantDose_kg_NaCl = removedCaCO3_kg * 0.15 * (58.44 / 50); // NaCl/CaCO3 equiv.

    // Effluent hardness: IX removes all hardness to near-zero when in cycle
    // Blend model: some systems blend to achieve target (e.g. 80–120 mg/L CaCO3)
    const effluentHardness_mg_L = Math.max(0, hardness_mg_L_CaCO3 * 0.02); // <2% leakage

    // Recovery rate (product water as % of feed)
    // Backwash + rinse consume ~5–10 BV per cycle; typical recovery 92–96%
    const regenerationVolume_BV = 8; // rinse + backwash + slow rinse
    const recoveryRate_pct = Math.min(99, (runLength_BV / (runLength_BV + regenerationVolume_BV)) * 100);

    return {
        resinVolume_L: Math.round(resinVolume_L * 10) / 10,
        runLength_BV,
        regenerantDose_kg_NaCl: Math.round(regenerantDose_kg_NaCl * 1000) / 1000,
        effluentHardness_mg_L: Math.round(effluentHardness_mg_L * 10) / 10,
        recoveryRate_pct: Math.round(recoveryRate_pct * 10) / 10,
    };
}

// ---------------------------------------------------------------------------
// 10. Sludge digestion methane production
// Produção de metano em digestão anaeróbia de lodo (Metcalf-Eddy 2003)
// ---------------------------------------------------------------------------

/**
 * Anaerobic sludge digestion design and methane production estimation
 * (Metcalf-Eddy 2003; Rittmann-McCarty 2001).
 *
 * VSS destruction: 59% mesophilic, 65% thermophilic
 * Methane yield: 0.35 m³ CH4/kgVSS destroyed (at STP)
 * Biogas composition: ~65% CH4 by volume
 * Power via CHP: 9.94 kWh/m³ CH4 at 35% electrical efficiency
 *
 * @param {number} vss_input_kg_day         - VSS input to digester (kg/day)
 * @param {number} srt_days                 - Sludge retention time (days)
 * @param {number} temperature_C            - Digester temperature (°C)
 * @param {'mesophilic'|'thermophilic'} digestor_type - Digestion mode
 * @returns {{vssDestruction_pct: number, methaneProduction_m3_day: number,
 *            biogasCH4_pct: number, heatGenerated_kW: number,
 *            powerGeneration_kW: number}}
 */
export function sludgeDigestionMethane(vss_input_kg_day: any, srt_days: any, temperature_C: any, digestor_type: any) {
    if (vss_input_kg_day <= 0) throw new RangeError('vss_input_kg_day must be positive');
    if (srt_days <= 0) throw new RangeError('srt_days must be positive');

    const validTypes = ['mesophilic', 'thermophilic'];
    if (!validTypes.includes(digestor_type)) {
        throw new TypeError(`digestor_type must be one of: ${validTypes.join(', ')}`);
    }

    // VSS destruction factor by process type
    const baseDestruction = digestor_type === 'thermophilic' ? 0.65 : 0.59;

    // SRT correction: longer SRT increases destruction asymptotically
    // At SRT = 20d (mesophilic standard): use base; correction for deviation
    const srtRef = digestor_type === 'thermophilic' ? 15 : 20;
    const srtFactor = 1 - 0.1 * Math.exp(-srt_days / srtRef);
    const vssDestruction_pct = Math.min(85, baseDestruction * srtFactor * 100);

    // Methane production (m³/day at STP)
    const vssDestroyed_kg_day = vss_input_kg_day * (vssDestruction_pct / 100);
    const methaneYield = 0.35; // m³ CH4 / kg VSS destroyed
    const methaneProduction_m3_day = vssDestroyed_kg_day * methaneYield;

    // Biogas composition
    const biogasCH4_pct = 65; // % CH4 by volume (typical range 60–70%)

    // Heat content: 9.94 kWh/m³ CH4 (lower heating value)
    const thermalEnergy_kWh_day = methaneProduction_m3_day * 9.94;

    // CHP electrical efficiency 35%; combined heat: 50% recovered as heat
    const electricalEfficiency = 0.35;
    const heatRecoveryFactor = 0.5;
    const powerGeneration_kW = (thermalEnergy_kWh_day * electricalEfficiency) / 24;
    const heatGenerated_kW = (thermalEnergy_kWh_day * heatRecoveryFactor) / 24;

    return {
        vssDestruction_pct: Math.round(vssDestruction_pct * 10) / 10,
        methaneProduction_m3_day: Math.round(methaneProduction_m3_day * 100) / 100,
        biogasCH4_pct,
        heatGenerated_kW: Math.round(heatGenerated_kW * 10) / 10,
        powerGeneration_kW: Math.round(powerGeneration_kW * 10) / 10,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterTreatmentEngineeringMeta = {
    name: 'waterTreatmentEngineering',
    description: 'Water Treatment Engineering',
    category: 'analytics',
    familyTags: ['water'],
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
