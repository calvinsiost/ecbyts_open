// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   REMEDIATION KINETICS — Biodegradation and remediation rate models
   Cinética de remediação ambiental: biodegradação e modelos de taxa

   Implementa:
   - Decaimento de primeira ordem (USEPA MNA)
   - Modelo de Monod (crescimento microbiano acoplado à degradação)
   - Cinética de Michaelis-Menten (enzimática simplificada)
   - Correção de temperatura via Arrhenius e van't Hoff
   - Estimativa de tempo de remediação
   - Demanda teórica de oxigênio (stoichiometria)

   Este módulo é puro: sem DOM, sem IDB, sem Three.js.

   Referencias academicas:
   - Rittmann, B.E. & McCarty, P.L. (2001). Environmental Biotechnology:
     Principles and Applications. McGraw-Hill. ISBN 978-0-07-234553-8.
   - Monod, J. (1949). The growth of bacterial cultures.
     Annu. Rev. Microbiol. 3:371-394.
     DOI: 10.1146/annurev.mi.03.100149.002103
   - Arrhenius, S. (1889). Über die Reaktionsgeschwindigkeit bei der
     Inversion von Rohrzucker durch Säuren.
     Z. Phys. Chem. 4:226-248.
   - USEPA (1999). Use of Monitored Natural Attenuation at Superfund,
     RCRA Corrective Action, and Underground Storage Tank Sites.
     OSWER 9200.4-17P. Directive 9200.4-17P.
   - Johnson, R.L. & Pankow, J.F. (1992). Dissolution of dense
     chlorinated solvents into groundwater.
     Environ. Sci. Technol. 26(5):896-901.
     DOI: 10.1021/es00028a011
   ================================================================ */

// Gas constant (J/mol/K)
const R_GAS = 8.314;

// Natural log of 2, used for half-life calculations
const LN2 = Math.LN2;

// ----------------------------------------------------------------
// BIODEGRADATION_RATES - Tabela de constantes de decaimento k1 (1/d)
// Fonte: USEPA (1999) OSWER 9200.4-17P, Table 3.2
// ----------------------------------------------------------------

/**
 * First-order biodegradation rate constants (k1, 1/day) for common
 * contaminants under aerobic and anaerobic conditions.
 *
 * @type {Object.<string, {aerobic: number, anaerobic: number}>}
 */
export const BIODEGRADATION_RATES: Readonly<Record<string, { aerobic: number; anaerobic: number }>> = Object.freeze({
    benzene: { aerobic: 0.1, anaerobic: 0.005 }, // 1/day
    toluene: { aerobic: 0.15, anaerobic: 0.04 },
    TCE: { aerobic: 0.001, anaerobic: 0.03 }, // reductive dechlorination
    PCE: { aerobic: 0.0001, anaerobic: 0.02 }, // reductive dechlorination
    naphthalene: { aerobic: 0.08, anaerobic: 0.001 },
});

// ----------------------------------------------------------------
// Oxygen demand data - ThOD ratios for common contaminants
// Demanda teórica de oxigênio: stoichiometria de oxidação completa
// ----------------------------------------------------------------

interface ContaminantFormula {
    /** Molecular weight (g/mol) */
    mw: number;
    /** Carbon atoms */
    C: number;
    /** Hydrogen atoms */
    H: number;
    /** Chlorine atoms (default 0) */
    Cl: number;
    /** Oxygen atoms in molecule (default 0) */
    O: number;
    name: string;
}

// Lookup for common contaminants: molecular composition
const CONTAMINANT_FORMULAS: Readonly<Record<string, ContaminantFormula>> = Object.freeze({
    C6H6: { name: 'benzene', mw: 78.11, C: 6, H: 6, Cl: 0, O: 0 },
    C7H8: { name: 'toluene', mw: 92.14, C: 7, H: 8, Cl: 0, O: 0 },
    C8H10: { name: 'ethylbenzene', mw: 106.17, C: 8, H: 10, Cl: 0, O: 0 },
    C10H8: { name: 'naphthalene', mw: 128.17, C: 10, H: 8, Cl: 0, O: 0 },
    C8H18: { name: 'octane', mw: 114.23, C: 8, H: 18, Cl: 0, O: 0 },
    C2HCl3: { name: 'TCE', mw: 131.39, C: 2, H: 1, Cl: 3, O: 0 }, // trichloroethylene
    C2Cl4: { name: 'PCE', mw: 165.83, C: 2, H: 0, Cl: 4, O: 0 }, // tetrachloroethylene
    C6H5Cl: { name: 'chlorobenzene', mw: 112.56, C: 6, H: 5, Cl: 1, O: 0 },
});

// Alias lookup: common names → formula key
const CONTAMINANT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
    benzene: 'C6H6',
    toluene: 'C7H8',
    ethylbenzene: 'C8H10',
    xylene: 'C8H10', // para-xileno tem a mesma fórmula
    naphthalene: 'C10H8',
    octane: 'C8H18',
    TCE: 'C2HCl3',
    trichloroethylene: 'C2HCl3',
    PCE: 'C2Cl4',
    tetrachloroethylene: 'C2Cl4',
    chlorobenzene: 'C6H5Cl',
});

// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------

/**
 * Valida que um número é finito e (opcionalmente) não-negativo.
 * @param {number} v
 * @param {string} name
 * @param {boolean} [nonNegative]
 */
function _requireFinite(v: number, name: string, nonNegative = false): void {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`remediationKinetics: '${name}' must be a finite number, got ${v}`);
    }
    if (nonNegative && v < 0) {
        throw new RangeError(`remediationKinetics: '${name}' must be >= 0, got ${v}`);
    }
}

/**
 * Computes ThOD (Theoretical Oxygen Demand) ratio for a given molecular formula.
 * @param {{C:number, H:number, Cl:number, O:number, mw:number}} formula
 * @returns {number} ThOD ratio (g O2 / g compound)
 */
function _computeThod(formula: { C: number; H: number; Cl?: number; O?: number; mw: number }): number {
    const { C, H, Cl = 0, O: Omol = 0, mw } = formula;
    const molesO2 = C + (H - Cl) / 4.0 - Omol / 2.0;
    const thod = (32.0 * molesO2) / mw;
    return thod;
}

// ----------------------------------------------------------------
// 1. computeFirstOrderDecay
// ----------------------------------------------------------------

/**
 * Computes contaminant concentration over time using first-order decay kinetics.
 * Calcula concentração ao longo do tempo via decaimento de primeira ordem.
 *
 * C(t) = C0 × exp(-k1 × t)
 *
 * @param {{ C0: number, k1: number, t: number|number[] }} params
 * @returns {Object} result with C (scalar or array), halfLife, method
 */
export function computeFirstOrderDecay(params: {
    C0: number;
    k1: number;
    t: number | number[];
}): Readonly<{ C: number | number[]; C0: number; k1: number; t: number | number[]; halfLife: number; method: string }> {
    const { C0, k1, t } = params;
    _requireFinite(C0, 'C0', true);
    _requireFinite(k1, 'k1', true);

    const halfLife = k1 > 0 ? LN2 / k1 : Infinity;
    const method = 'first-order-decay';

    if (Array.isArray(t)) {
        const C = t.map((ti) => {
            _requireFinite(ti, 't[i]', true);
            return C0 * Math.exp(-k1 * ti);
        });
        return Object.freeze({ C, C0, k1, t, halfLife, method });
    }

    _requireFinite(t, 't', true);
    const C = C0 * Math.exp(-k1 * t);
    return Object.freeze({ C, C0, k1, t, halfLife, method });
}

// ----------------------------------------------------------------
// 2. fitFirstOrderDecayRate
// ----------------------------------------------------------------

/**
 * Fits a first-order decay rate k1 from time-series data using linear
 * regression on ln(C) vs t.
 *
 * @param {number[]} timeData - Array of time values (days), length >= 2
 * @param {number[]} concData - Array of concentrations (mg/L), same length, > 0
 * @returns {{k1: number, C0_fit: number, r2: number, halfLife: number, method: string, warning?: string}}
 */
export function fitFirstOrderDecayRate(
    timeData: number[],
    concData: number[],
): Readonly<{
    k1: number;
    C0_fit: number;
    r2: number;
    halfLife: number;
    method: string;
    warning?: string;
}> {
    if (!Array.isArray(timeData) || !Array.isArray(concData)) {
        throw new TypeError('remediationKinetics: timeData and concData must be arrays');
    }
    if (timeData.length !== concData.length) {
        throw new RangeError('remediationKinetics: timeData and concData must have same length');
    }
    if (timeData.length < 2) {
        throw new RangeError('remediationKinetics: at least 2 data points required for fit');
    }

    const n = timeData.length;
    const lnC = concData.map((c, i) => {
        if (c <= 0) {
            throw new RangeError(`remediationKinetics: concData[${i}]=${c} must be > 0 for ln(C) transform`);
        }
        return Math.log(c);
    });

    // Ordinary Least Squares: y = a + b*x where y=ln(C), x=t, slope b=-k1
    let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumX2 = 0;
    for (let i = 0; i < n; i++) {
        const ti = timeData[i] ?? 0;
        const li = lnC[i] ?? 0;
        sumX += ti;
        sumY += li;
        sumXY += ti * li;
        sumX2 += ti * ti;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) {
        throw new RangeError('remediationKinetics: all time values are identical — cannot fit');
    }
    const slope = (n * sumXY - sumX * sumY) / denom; // -k1
    const intercept = (sumY - slope * sumX) / n; // ln(C0_fit)

    const k1 = -slope; // k1 = -slope
    const C0_fit = Math.exp(intercept);

    // Coefficient of determination R²
    const meanY = sumY / n;
    let ssTot = 0,
        ssRes = 0;
    for (let i = 0; i < n; i++) {
        const ti = timeData[i] ?? 0;
        const li = lnC[i] ?? 0;
        const yPred = intercept + slope * ti;
        ssTot += (li - meanY) ** 2;
        ssRes += (li - yPred) ** 2;
    }
    const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
    const halfLife = k1 > 0 ? LN2 / k1 : Infinity;

    const result: { k1: number; C0_fit: number; r2: number; halfLife: number; method: string; warning?: string } = {
        k1,
        C0_fit,
        r2,
        halfLife,
        method: 'linear-regression-lnC',
    };
    if (k1 < 0) {
        result.warning = 'Negative k1 indicates growth rather than decay';
    }
    return Object.freeze(result);
}

// ----------------------------------------------------------------
// 3. computeMonodKinetics
// ----------------------------------------------------------------

interface MonodParams {
    S0: number;
    X0: number;
    muMax: number;
    Ks: number;
    Y: number;
    b: number;
    tEnd: number;
    dt: number;
}

/**
 * Integrates Monod kinetics for substrate (S) and biomass (X) using Euler method.
 *
 * @param {MonodParams} params
 * @returns {{t: number[], S: number[], X: number[], method: string,
 *            finalS: number, finalX: number, removalEfficiency: number}}
 */
export function computeMonodKinetics(params: MonodParams): Readonly<{
    t: number[];
    S: number[];
    X: number[];
    method: string;
    finalS: number;
    finalX: number;
    removalEfficiency: number;
}> {
    const { S0, X0, muMax, Ks, Y, b, tEnd, dt } = params;
    _requireFinite(S0, 'S0', true);
    _requireFinite(X0, 'X0', true);
    _requireFinite(muMax, 'muMax', true);
    _requireFinite(Ks, 'Ks', true);
    _requireFinite(Y, 'Y', true);
    _requireFinite(b, 'b', true);
    _requireFinite(tEnd, 'tEnd', true);
    _requireFinite(dt, 'dt');

    if (dt <= 0) throw new RangeError('remediationKinetics: dt must be > 0');
    if (tEnd <= 0) throw new RangeError('remediationKinetics: tEnd must be > 0');
    if (Y <= 0) throw new RangeError('remediationKinetics: Y (yield) must be > 0');
    if (Ks < 0) throw new RangeError('remediationKinetics: Ks must be >= 0');

    // Stability check
    const charTime = X0 > 0 ? Y / (muMax * X0) : Infinity;
    if (isFinite(charTime) && dt > charTime) {
        console.warn(
            '[remediationKinetics] computeMonodKinetics: dt may be too large for stability; consider dt <',
            charTime.toFixed(4),
        );
    }

    const nSteps = Math.ceil(tEnd / dt);
    const t: number[] = new Array(nSteps + 1).fill(0);
    const S: number[] = new Array(nSteps + 1).fill(0);
    const X: number[] = new Array(nSteps + 1).fill(0);

    t[0] = 0;
    S[0] = S0;
    X[0] = X0;

    for (let i = 0; i < nSteps; i++) {
        const Si = Math.max(S[i] ?? 0, 0); // clamp to avoid negative substrate
        const Xi = Math.max(X[i] ?? 0, 0);
        const mu = (muMax * Si) / (Ks + Si);
        const dS = (-(mu * Xi) / Y) * dt;
        const dX = (mu - b) * Xi * dt;
        t[i + 1] = (i + 1) * dt;
        S[i + 1] = Si + dS;
        X[i + 1] = Xi + dX;
    }

    // Clamp negatives introduced by Euler overshoot
    for (let i = 0; i <= nSteps; i++) {
        if ((S[i] ?? 0) < 0) S[i] = 0;
        if ((X[i] ?? 0) < 0) X[i] = 0;
    }

    const finalS = S[nSteps] ?? 0;
    const finalX = X[nSteps] ?? 0;
    const removalEfficiency = S0 > 0 ? (S0 - finalS) / S0 : 0;

    return Object.freeze({ t, S, X, method: 'monod-euler', finalS, finalX, removalEfficiency });
}

// ----------------------------------------------------------------
// 4. computeMichaelisMenten
// ----------------------------------------------------------------

/**
 * Integrates simplified Michaelis-Menten kinetics (no biomass growth).
 *
 * @param {{ S0: number, Vmax: number, Km: number, tEnd: number, dt: number }} params
 * @returns {{t: number[], S: number[], method: string, t50: number|null, t90: number|null, finalS: number}}
 */
export function computeMichaelisMenten(params: {
    S0: number;
    Vmax: number;
    Km: number;
    tEnd: number;
    dt: number;
}): Readonly<{
    t: number[];
    S: number[];
    method: string;
    t50: number | null;
    t90: number | null;
    finalS: number;
}> {
    const { S0, Vmax, Km, tEnd, dt } = params;
    _requireFinite(S0, 'S0', true);
    _requireFinite(Vmax, 'Vmax', true);
    _requireFinite(Km, 'Km', true);
    _requireFinite(tEnd, 'tEnd', true);
    _requireFinite(dt, 'dt');

    if (dt <= 0) throw new RangeError('remediationKinetics: dt must be > 0');
    if (tEnd <= 0) throw new RangeError('remediationKinetics: tEnd must be > 0');
    if (Vmax <= 0) throw new RangeError('remediationKinetics: Vmax must be > 0');
    if (Km < 0) throw new RangeError('remediationKinetics: Km must be >= 0');

    const nSteps = Math.ceil(tEnd / dt);
    const t: number[] = new Array(nSteps + 1).fill(0);
    const S: number[] = new Array(nSteps + 1).fill(0);

    t[0] = 0;
    S[0] = S0;

    let t50: number | null = null;
    let t90: number | null = null;
    const target50 = S0 * 0.5;
    const target90 = S0 * 0.1;

    for (let i = 0; i < nSteps; i++) {
        const Si = Math.max(S[i] ?? 0, 0);
        const v = Km + Si > 0 ? (Vmax * Si) / (Km + Si) : 0;
        const dS = -v * dt;
        t[i + 1] = (i + 1) * dt;
        const sNext = Math.max(Si + dS, 0);
        S[i + 1] = sNext;

        // Detect crossing of 50% and 90% removal milestones
        if (t50 === null && sNext <= target50) {
            const frac = Si > target50 ? (Si - target50) / (Si - sNext) : 1;
            t50 = (t[i] ?? 0) + frac * dt;
        }
        if (t90 === null && sNext <= target90) {
            const frac = Si > target90 ? (Si - target90) / (Si - sNext) : 1;
            t90 = (t[i] ?? 0) + frac * dt;
        }
    }

    return Object.freeze({ t, S, method: 'michaelis-menten', t50, t90, finalS: S[nSteps] ?? 0 });
}

// ----------------------------------------------------------------
// 5. computeArrheniusCorrection
// ----------------------------------------------------------------

/**
 * Corrects a kinetic rate constant for temperature using either the
 * Arrhenius equation or the van't Hoff (theta) approximation.
 *
 * @param {{ kRef: number, Tref: number, T: number, Ea?: number, theta?: number,
 *   method?: 'arrhenius'|'vant-hoff' }} params
 * @returns {{kCorrected: number, Tref: number, T: number, correctionFactor: number, method: string}}
 */
export function computeArrheniusCorrection(params: {
    kRef: number;
    Tref: number;
    T: number;
    Ea?: number;
    theta?: number;
    method?: 'arrhenius' | 'vant-hoff';
}): Readonly<{ kCorrected: number; Tref: number; T: number; correctionFactor: number; method: string }> {
    const { kRef, Tref, T, Ea, theta, method: methodIn } = params;
    _requireFinite(kRef, 'kRef');
    _requireFinite(Tref, 'Tref');
    _requireFinite(T, 'T');

    // Auto-detect method if not specified
    const method = methodIn || (Ea !== undefined ? 'arrhenius' : 'vant-hoff');

    let correctionFactor: number;

    if (method === 'arrhenius') {
        if (Ea === undefined || Ea === null) {
            throw new TypeError('remediationKinetics: Ea (activation energy) is required for Arrhenius method');
        }
        _requireFinite(Ea, 'Ea', true);

        // Tref and T must be in Kelvin for Arrhenius
        if (Tref <= 0 || T <= 0) {
            throw new RangeError('remediationKinetics: Arrhenius requires absolute temperature (K > 0)');
        }
        // k(T) = k(Tref) * exp(-Ea/R * (1/T - 1/Tref))
        correctionFactor = Math.exp((-Ea / R_GAS) * (1.0 / T - 1.0 / Tref));
    } else if (method === 'vant-hoff') {
        if (theta === undefined || theta === null) {
            throw new TypeError("remediationKinetics: theta is required for van't Hoff method");
        }
        _requireFinite(theta, 'theta', true);
        if (theta <= 0) {
            throw new RangeError('remediationKinetics: theta must be > 0');
        }
        // k(T) = k(Tref) * theta^(T - Tref) - T in °C
        correctionFactor = Math.pow(theta, T - Tref);
    } else {
        throw new TypeError(`remediationKinetics: unknown method '${method}', use 'arrhenius' or 'vant-hoff'`);
    }

    const kCorrected = kRef * correctionFactor;
    return Object.freeze({ kCorrected, Tref, T, correctionFactor, method });
}

// ----------------------------------------------------------------
// 6. estimateRemediationTime
// ----------------------------------------------------------------

/**
 * Estimates the time required to reach a target concentration.
 *
 * @param {{ model: 'first-order'|'monod', C0: number, Ctarget: number,
 *   k1?: number, monodParams?: object }} params
 * @returns {{tEstimate: number|null, method: string, confidence: string, achievable: boolean}}
 */
export function estimateRemediationTime(params: {
    model?: 'first-order' | 'monod';
    C0: number;
    Ctarget: number;
    k1?: number;
    monodParams?: {
        X0: number;
        muMax: number;
        Ks: number;
        Y: number;
        b: number;
        dt?: number;
        [key: string]: unknown;
    };
}): Readonly<{ tEstimate: number | null; method: string; confidence: string; achievable: boolean }> {
    const { model, C0, Ctarget } = params;
    _requireFinite(C0, 'C0', true);
    _requireFinite(Ctarget, 'Ctarget', true);

    if (Ctarget < 0) throw new RangeError('remediationKinetics: Ctarget must be >= 0');
    if (C0 === 0) {
        return Object.freeze({
            tEstimate: 0,
            method: model || 'first-order',
            confidence: 'analytical',
            achievable: true,
        });
    }
    if (Ctarget >= C0) {
        return Object.freeze({
            tEstimate: 0,
            method: model || 'first-order',
            confidence: 'analytical',
            achievable: true,
        });
    }

    if (model === 'first-order' || model === undefined) {
        const { k1 } = params;
        if (k1 === undefined || k1 === null) {
            throw new TypeError('remediationKinetics: k1 is required for first-order model');
        }
        _requireFinite(k1, 'k1', true);

        if (k1 === 0) {
            return Object.freeze({
                tEstimate: null,
                method: 'first-order',
                confidence: 'analytical',
                achievable: false,
            });
        }

        // t = -ln(Ctarget / C0) / k1
        const tEstimate = -Math.log(Ctarget / C0) / k1;
        return Object.freeze({ tEstimate, method: 'first-order', confidence: 'analytical', achievable: true });
    } else if (model === 'monod') {
        const { monodParams } = params;
        if (!monodParams) {
            throw new TypeError('remediationKinetics: monodParams required for monod model');
        }

        const achievable = Ctarget > 0 || monodParams.b === 0;

        const maxT = 10000;
        const dt = monodParams.dt || 0.1;
        let tEnd = Math.min(maxT, 1000);

        const run = (te: number) =>
            computeMonodKinetics({
                ...(monodParams as unknown as MonodParams),
                S0: C0,
                tEnd: te,
                dt,
            });

        // Run first pass
        let result = run(tEnd);

        // If target not reached, try extending (up to maxT)
        if (result.finalS > Ctarget && tEnd < maxT) {
            tEnd = maxT;
            result = run(tEnd);
        }

        // Find crossing index
        let tEstimate: number | null = null;
        const { t, S } = result;
        for (let i = 1; i < S.length; i++) {
            const si = S[i] ?? 0;
            if (si <= Ctarget) {
                // Linear interpolation
                const sPrev = S[i - 1] ?? 0;
                const tPrev = t[i - 1] ?? 0;
                const tCur = t[i] ?? 0;
                const frac = sPrev > Ctarget ? (sPrev - Ctarget) / (sPrev - si) : 1;
                tEstimate = tPrev + frac * (tCur - tPrev);
                break;
            }
        }

        return Object.freeze({
            tEstimate,
            method: 'monod',
            confidence: 'numerical',
            achievable: tEstimate !== null || achievable,
        });
    } else {
        throw new TypeError(`remediationKinetics: unknown model '${model}', use 'first-order' or 'monod'`);
    }
}

// ----------------------------------------------------------------
// 7. computeOxygenDemand
// ----------------------------------------------------------------

/**
 * Computes the theoretical oxygen demand (ThOD) for aerobic biodegradation.
 *
 * @param {{ contaminantFormula: string, concentration_mgL: number, volume_m3: number }} params
 * @returns {{ thod_ratio: number, O2_demand_kg: number, contaminant_kg: number, method: string }}
 */
export function computeOxygenDemand(params: {
    contaminantFormula: string;
    concentration_mgL: number;
    volume_m3: number;
}): Readonly<{ thod_ratio: number; O2_demand_kg: number; contaminant_kg: number; method: string }> {
    const { contaminantFormula, concentration_mgL, volume_m3 } = params;
    _requireFinite(concentration_mgL, 'concentration_mgL', true);
    _requireFinite(volume_m3, 'volume_m3', true);

    if (!contaminantFormula || typeof contaminantFormula !== 'string') {
        throw new TypeError('remediationKinetics: contaminantFormula must be a non-empty string');
    }

    // Resolve formula: try direct key, then alias
    const direct = CONTAMINANT_FORMULAS[contaminantFormula];
    const aliasKey = CONTAMINANT_ALIASES[contaminantFormula];
    const key = direct ? contaminantFormula : aliasKey || null;
    const formula = key ? CONTAMINANT_FORMULAS[key] : undefined;

    if (!key || !formula) {
        throw new RangeError(
            `remediationKinetics: unknown contaminant formula/alias '${contaminantFormula}'. Supported: ${Object.keys(
                CONTAMINANT_FORMULAS,
            )
                .concat(Object.keys(CONTAMINANT_ALIASES))
                .join(', ')}`,
        );
    }

    const thod_ratio = _computeThod(formula);

    // Mass of contaminant: concentration [mg/L] × volume [m³] × 1000 [L/m³] → mg
    const contaminant_kg = concentration_mgL * volume_m3 * 1000 * 1e-6; // kg
    const O2_demand_kg = contaminant_kg * thod_ratio;

    return Object.freeze({
        thod_ratio,
        O2_demand_kg,
        contaminant_kg,
        method: 'stoichiometric',
    });
}
