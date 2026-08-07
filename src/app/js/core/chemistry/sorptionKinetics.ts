// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SORPTION KINETICS — Isotherm models and kinetic rate fitting
   Cinética e isotermas de sorção ambiental

   Implementa:
   - Isoterma de Langmuir (1918): monocamada com sítios homogêneos
   - Isoterma de Freundlich (1906): superfície heterogênea empírica
   - Isoterma de Temkin (1940): calor de adsorção linear com cobertura
   - Cinética pseudo-primeira ordem: Lagergren (1898)
   - Cinética pseudo-segunda ordem: Ho & McKay (1999)
   - Difusão intrapartícula: Weber & Morris (1963)
   - Predição e comparação de modelos cinéticos

   Este módulo é puro: sem DOM, sem IDB, sem Three.js.

   Referencias academicas:
   - Langmuir, I. (1918). The adsorption of gases on plane surfaces of
     glass, mica and platinum. J. Am. Chem. Soc. 40(9):1361-1403.
     DOI: 10.1021/ja02242a004
   - Freundlich, H. (1906). Over the adsorption in solution.
     Z. Phys. Chem. 57(A):385-470.
   - Temkin, M.I. & Pyzhev, V. (1940). Kinetics of ammonia synthesis on
     promoted iron catalysts. Acta Physiochim. USSR 12:327-356.
   - Lagergren, S. (1898). About the theory of so-called adsorption of
     soluble substances. Kungliga Svenska Vetenskapsakademiens
     Handlingar 24(4):1-39.
   - Ho, Y.S. & McKay, G. (1999). Pseudo-second order model for sorption
     processes. Process Biochem. 34(5):451-465.
     DOI: 10.1016/S0032-9592(98)00112-5
   - Weber, W.J. & Morris, J.C. (1963). Kinetics of adsorption on carbon
     from solution. J. Sanit. Eng. Div. ASCE 89(SA2):31-60.
   ================================================================ */

// ----------------------------------------------------------------
// SORPTION_PARAMETERS - Typical isotherm parameters for common
// contaminants on granular activated carbon (GAC) and clay minerals.
//
// Source: USEPA (1992). Granular Activated Carbon (GAC) Systems for
// Controlling Selected Organics. EPA/625/R-93/011.
// ----------------------------------------------------------------

/**
 * Typical Langmuir isotherm parameters for environmental contaminants.
 *
 * @type {Object.<string, {qmax: number, KL: number}>}
 */
export const SORPTION_PARAMETERS: Readonly<Record<string, { qmax: number; KL: number }>> = Object.freeze({
    benzene_GAC: { qmax: 180, KL: 0.12 }, // mg/g, L/mg — USEPA 1992
    naphthalene_GAC: { qmax: 320, KL: 0.35 },
    phenol_GAC: { qmax: 210, KL: 0.08 },
    copper_kaolinite: { qmax: 15, KL: 0.045 }, // metal em argila
    lead_bentonite: { qmax: 95, KL: 0.18 },
});

// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------

/**
 * Validates that a value is a finite number (and optionally positive).
 *
 * @param {*} v - Value to check
 * @param {string} name - Parameter name for error messages
 * @param {boolean} [mustBePositive=false] - Whether to enforce v > 0
 */
function _requireFinite(v: unknown, name: string, mustBePositive = false): asserts v is number {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`sorptionKinetics: '${name}' must be a finite number, got ${String(v)}`);
    }
    if (mustBePositive && v <= 0) {
        throw new RangeError(`sorptionKinetics: '${name}' must be > 0, got ${v}`);
    }
}

/**
 * Validates an array of numeric data.
 *
 * @param {*} arr - Array to validate
 * @param {string} name - Parameter name for error messages
 * @param {number} [minLength=3] - Minimum required length
 */
function _requireArray(arr: unknown, name: string, minLength = 3): asserts arr is number[] {
    if (!Array.isArray(arr)) {
        throw new TypeError(`sorptionKinetics: '${name}' must be an array`);
    }
    if (arr.length < minLength) {
        throw new RangeError(
            `sorptionKinetics: '${name}' requires at least ${minLength} data points, got ${arr.length}`,
        );
    }
}

/**
 * Ordinary Least Squares linear regression: y = slope*x + intercept.
 *
 * @param {number[]} x - Independent variable
 * @param {number[]} y - Dependent variable
 * @returns {{slope: number, intercept: number, r2: number, n: number}}
 */
function _linearRegression(
    x: number[],
    y: number[],
): { slope: number; intercept: number; r2: number; n: number } {
    const n = x.length;
    let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumX2 = 0;
    for (let i = 0; i < n; i++) {
        const xi = x[i] ?? 0;
        const yi = y[i] ?? 0;
        sumX += xi;
        sumY += yi;
        sumXY += xi * yi;
        sumX2 += xi * xi;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) {
        throw new RangeError('sorptionKinetics: all x values are identical — cannot perform linear regression');
    }
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // Coefficient of determination R²
    const meanY = sumY / n;
    let ssTot = 0,
        ssRes = 0;
    for (let i = 0; i < n; i++) {
        const xi = x[i] ?? 0;
        const yi = y[i] ?? 0;
        const yPred = slope * xi + intercept;
        ssTot += (yi - meanY) ** 2;
        ssRes += (yi - yPred) ** 2;
    }
    const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

    return { slope, intercept, r2, n };
}

// ----------------------------------------------------------------
// 1. fitLangmuirIsotherm
// ----------------------------------------------------------------

/**
 * Fits a Langmuir isotherm to equilibrium sorption data.
 *
 * @param {number[]} ceData - Equilibrium liquid-phase concentrations (mg/L)
 * @param {number[]} qeData - Equilibrium solid-phase loadings (mg/g)
 * @returns {{qmax: number, KL: number, r2: number, RL_min: number, RL_max: number,
 *            method: string, nPoints: number}}
 */
export function fitLangmuirIsotherm(
    ceData: number[],
    qeData: number[],
): Readonly<{
    qmax: number;
    KL: number;
    r2: number;
    RL_min: number;
    RL_max: number;
    method: string;
    nPoints: number;
}> {
    _requireArray(ceData, 'ceData', 3);
    _requireArray(qeData, 'qeData', 3);
    if (ceData.length !== qeData.length) {
        throw new RangeError('sorptionKinetics: ceData and qeData must have the same length');
    }

    const n = ceData.length;

    // Build linearized arrays: x = Ce, y = Ce/qe
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < n; i++) {
        const ce = ceData[i] ?? NaN;
        const qe = qeData[i] ?? NaN;
        _requireFinite(ce, `ceData[${i}]`);
        _requireFinite(qe, `qeData[${i}]`);
        if (ce < 0) throw new RangeError(`sorptionKinetics: ceData[${i}] must be >= 0`);
        if (qe <= 0) throw new RangeError(`sorptionKinetics: qeData[${i}] must be > 0 for linearization`);
        x.push(ce);
        y.push(ce / qe);
    }

    const reg = _linearRegression(x, y);
    // slope = 1/qmax → qmax = 1/slope
    const qmax = 1 / reg.slope;
    const KL = reg.slope / reg.intercept;

    // Separation factor RL for each Ce point
    const RLValues = ceData.map((ce) => 1 / (1 + KL * ce));
    const RL_min = Math.min(...RLValues);
    const RL_max = Math.max(...RLValues);

    return Object.freeze({
        qmax,
        KL,
        r2: reg.r2,
        RL_min,
        RL_max,
        method: 'langmuir',
        nPoints: n,
    });
}

// ----------------------------------------------------------------
// 2. fitFreundlichIsotherm
// ----------------------------------------------------------------

/**
 * Fits a Freundlich isotherm to equilibrium sorption data.
 *
 * @param {number[]} ceData - Equilibrium liquid-phase concentrations (mg/L)
 * @param {number[]} qeData - Equilibrium solid-phase loadings (mg/g)
 * @returns {{KF: number, n: number, invN: number, r2: number, method: string, nPoints: number}}
 */
export function fitFreundlichIsotherm(
    ceData: number[],
    qeData: number[],
): Readonly<{ KF: number; n: number; invN: number; r2: number; method: string; nPoints: number }> {
    _requireArray(ceData, 'ceData', 3);
    _requireArray(qeData, 'qeData', 3);
    if (ceData.length !== qeData.length) {
        throw new RangeError('sorptionKinetics: ceData and qeData must have the same length');
    }

    const n = ceData.length;
    const lnCe: number[] = [];
    const lnQe: number[] = [];

    for (let i = 0; i < n; i++) {
        const ce = ceData[i] ?? NaN;
        const qe = qeData[i] ?? NaN;
        _requireFinite(ce, `ceData[${i}]`);
        _requireFinite(qe, `qeData[${i}]`);
        if (ce <= 0) {
            throw new RangeError(`sorptionKinetics: ceData[${i}]=${ce} must be > 0 for ln(Ce) transform`);
        }
        if (qe <= 0) {
            throw new RangeError(`sorptionKinetics: qeData[${i}]=${qe} must be > 0 for ln(qe) transform`);
        }
        lnCe.push(Math.log(ce));
        lnQe.push(Math.log(qe));
    }

    const reg = _linearRegression(lnCe, lnQe);
    const invN = reg.slope; // 1/n = slope
    const KF = Math.exp(reg.intercept); // KF = e^intercept
    const nVal = invN !== 0 ? 1 / invN : Infinity; // Freundlich n

    return Object.freeze({
        KF,
        n: nVal,
        invN,
        r2: reg.r2,
        method: 'freundlich',
        nPoints: n,
    });
}

// ----------------------------------------------------------------
// 3. fitTemkinIsotherm
// ----------------------------------------------------------------

/**
 * Fits a Temkin isotherm to equilibrium sorption data.
 *
 * Reference: Temkin & Pyzhev (1940). Acta Physiochim. USSR 12:327-356.
 *
 * @param {number[]} ceData - Equilibrium liquid-phase concentrations (mg/L)
 * @param {number[]} qeData - Equilibrium solid-phase loadings (mg/g)
 * @returns {{BT: number, AT: number, r2: number, method: string, nPoints: number}}
 */
export function fitTemkinIsotherm(
    ceData: number[],
    qeData: number[],
): Readonly<{ BT: number; AT: number; r2: number; method: string; nPoints: number }> {
    _requireArray(ceData, 'ceData', 3);
    _requireArray(qeData, 'qeData', 3);
    if (ceData.length !== qeData.length) {
        throw new RangeError('sorptionKinetics: ceData and qeData must have the same length');
    }

    const n = ceData.length;
    const lnCe: number[] = [];
    const qeArr: number[] = [];

    for (let i = 0; i < n; i++) {
        const ce = ceData[i] ?? NaN;
        const qe = qeData[i] ?? NaN;
        _requireFinite(ce, `ceData[${i}]`);
        _requireFinite(qe, `qeData[${i}]`);
        if (ce <= 0) {
            throw new RangeError(`sorptionKinetics: ceData[${i}]=${ce} must be > 0 for ln(Ce) transform`);
        }
        lnCe.push(Math.log(ce));
        qeArr.push(qe);
    }

    // y = qe, x = ln(Ce) → slope = B_T, intercept = B_T × ln(A_T)
    const reg = _linearRegression(lnCe, qeArr);
    const BT = reg.slope;
    // intercept = BT × ln(AT) → AT = exp(intercept / BT)
    const AT = BT !== 0 ? Math.exp(reg.intercept / BT) : NaN;

    return Object.freeze({
        BT,
        AT,
        r2: reg.r2,
        method: 'temkin',
        nPoints: n,
    });
}

// ----------------------------------------------------------------
// 4. predictIsothermQe
// ----------------------------------------------------------------

interface FittedModel {
    method: string;
    qmax?: number;
    KL?: number;
    KF?: number;
    invN?: number;
    BT?: number;
    AT?: number;
}

/**
 * Predicts equilibrium solid-phase loading q_e for given concentration(s).
 *
 * @param {any} model - Fitted model object (output of fitLangmuir/Freundlich/Temkin)
 * @param {number|number[]} Ce - Concentration(s) (mg/L)
 * @returns {{qe: number|number[], Ce: number|number[], model: string}}
 */
export function predictIsothermQe(
    model: FittedModel,
    Ce: number | number[],
): Readonly<{ qe: number | number[]; Ce: number | number[]; model: string }> {
    if (!model || !model.method) {
        throw new TypeError("sorptionKinetics: model must be a fitted isotherm object with 'method' property");
    }

    const predict = (ce: number): number => {
        _requireFinite(ce, 'Ce');
        if (ce < 0) throw new RangeError(`sorptionKinetics: Ce must be >= 0, got ${ce}`);

        switch (model.method) {
            case 'langmuir': {
                const qmax = model.qmax ?? 0;
                const KL = model.KL ?? 0;
                // Langmuir: qe = qmax × KL × Ce / (1 + KL × Ce)
                return (qmax * KL * ce) / (1 + KL * ce);
            }
            case 'freundlich': {
                const KF = model.KF ?? 0;
                const invN = model.invN ?? 0;
                // Freundlich: qe = KF × Ce^(1/n)
                if (ce === 0) return 0;
                return KF * Math.pow(ce, invN);
            }
            case 'temkin': {
                const BT = model.BT ?? 0;
                const AT = model.AT ?? 0;
                // Temkin: qe = BT × ln(AT × Ce)
                if (ce <= 0) return 0;
                const val = BT * Math.log(AT * ce);
                return Math.max(0, val); // physical constraint: qe >= 0
            }
            default:
                throw new TypeError(`sorptionKinetics: unknown model method '${model.method}'`);
        }
    };

    if (Array.isArray(Ce)) {
        const qe = Ce.map(predict);
        return Object.freeze({ qe, Ce, model: model.method });
    }

    const qe = predict(Ce);
    return Object.freeze({ qe, Ce, model: model.method });
}

// ----------------------------------------------------------------
// 5. fitPseudoFirstOrder
// ----------------------------------------------------------------

/**
 * Fits pseudo-first order kinetics (Lagergren 1898) to sorption time data.
 *
 * @param {number[]} timeData - Time points (min)
 * @param {number[]} qtData   - Solid-phase loading at time t (mg/g)
 * @param {{qe_experimental?: number}} [opts] - Optional experimental qe
 * @returns {{k1: number, qe_fit: number, r2: number, halfLife: number,
 *            method: string, nPoints: number, warning?: string}}
 */
export function fitPseudoFirstOrder(
    timeData: number[],
    qtData: number[],
    opts: { qe_experimental?: number } = {},
): Readonly<{
    k1: number;
    qe_fit: number;
    r2: number;
    halfLife: number;
    method: string;
    nPoints: number;
    warning?: string;
}> {
    _requireArray(timeData, 'timeData', 3);
    _requireArray(qtData, 'qtData', 3);
    if (timeData.length !== qtData.length) {
        throw new RangeError('sorptionKinetics: timeData and qtData must have the same length');
    }

    const n = timeData.length;

    // Estimate qe: use provided experimental value or max(qt) × 1.05
    const qe_exp = opts.qe_experimental !== undefined ? opts.qe_experimental : Math.max(...qtData) * 1.05;

    _requireFinite(qe_exp, 'qe_experimental', true);

    // Filter valid points: qe - qt must be > 0 for ln transform
    const xFit: number[] = [];
    const yFit: number[] = [];
    let warningMsg: string | null = null;
    let skipped = 0;

    for (let i = 0; i < n; i++) {
        const ti = timeData[i] ?? NaN;
        const qt = qtData[i] ?? NaN;
        _requireFinite(ti, `timeData[${i}]`);
        _requireFinite(qt, `qtData[${i}]`);
        const diff = qe_exp - qt;
        if (diff <= 0) {
            skipped++;
            continue; // skip point where qe - qt <= 0
        }
        xFit.push(ti);
        yFit.push(Math.log(diff));
    }

    if (skipped > 0) {
        warningMsg = `${skipped} point(s) skipped: qe - qt <= 0 (check qe_experimental value)`;
        console.warn('[sorptionKinetics] fitPseudoFirstOrder:', warningMsg);
    }

    if (xFit.length < 3) {
        throw new RangeError(
            'sorptionKinetics: fewer than 3 valid points remain after filtering qe-qt <= 0; adjust qe_experimental',
        );
    }

    const reg = _linearRegression(xFit, yFit);
    const k1 = -reg.slope; // k1 = -slope
    const qe_fit = Math.exp(reg.intercept); // qe_fit = e^intercept
    const halfLife = k1 > 0 ? Math.LN2 / k1 : Infinity;

    const result: {
        k1: number;
        qe_fit: number;
        r2: number;
        halfLife: number;
        method: string;
        nPoints: number;
        warning?: string;
    } = {
        k1,
        qe_fit,
        r2: reg.r2,
        halfLife,
        method: 'pseudo-first-order',
        nPoints: xFit.length,
    };
    if (warningMsg) result.warning = warningMsg;

    return Object.freeze(result);
}

// ----------------------------------------------------------------
// 6. fitPseudoSecondOrder
// ----------------------------------------------------------------

/**
 * Fits pseudo-second order kinetics (Ho & McKay 1999) to sorption time data.
 *
 * Reference: Ho & McKay (1999). Process Biochem. 34(5):451-465.
 *            DOI: 10.1016/S0032-9592(98)00112-5
 *
 * @param {number[]} timeData - Time points (min), must not include t=0 with qt=0
 * @param {number[]} qtData   - Solid-phase loading at time t (mg/g)
 * @returns {{k2: number, qe_fit: number, h0: number, r2: number,
 *            method: string, nPoints: number}}
 */
export function fitPseudoSecondOrder(
    timeData: number[],
    qtData: number[],
): Readonly<{ k2: number; qe_fit: number; h0: number; r2: number; method: string; nPoints: number }> {
    _requireArray(timeData, 'timeData', 3);
    _requireArray(qtData, 'qtData', 3);
    if (timeData.length !== qtData.length) {
        throw new RangeError('sorptionKinetics: timeData and qtData must have the same length');
    }

    const n = timeData.length;
    const x: number[] = []; // t
    const y: number[] = []; // t/qt

    for (let i = 0; i < n; i++) {
        const ti = timeData[i] ?? NaN;
        const qt = qtData[i] ?? NaN;
        _requireFinite(ti, `timeData[${i}]`);
        _requireFinite(qt, `qtData[${i}]`);
        if (qt <= 0) {
            // Skip zero/negative loadings (often the t=0 point)
            continue;
        }
        x.push(ti);
        y.push(ti / qt);
    }

    if (x.length < 3) {
        throw new RangeError('sorptionKinetics: fewer than 3 valid points (qt > 0) for pseudo-second-order fit');
    }

    // t/qt vs t: slope = 1/qe, intercept = 1/(k2 × qe^2)
    const reg = _linearRegression(x, y);
    const qe_fit = 1 / reg.slope; // qe = 1/slope
    const k2 = reg.slope ** 2 / reg.intercept; // k2 = slope^2 / intercept
    const h0 = k2 * qe_fit ** 2; // initial adsorption rate

    return Object.freeze({
        k2,
        qe_fit,
        h0,
        r2: reg.r2,
        method: 'pseudo-second-order',
        nPoints: x.length,
    });
}

// ----------------------------------------------------------------
// 7. fitIntraparticleDiffusion
// ----------------------------------------------------------------

/**
 * Fits Weber & Morris intraparticle diffusion model to sorption time data.
 *
 * Reference: Weber & Morris (1963). J. Sanit. Eng. Div. ASCE 89(SA2):31-60.
 *
 * @param {number[]} timeData - Time points (min)
 * @param {number[]} qtData   - Solid-phase loading at time t (mg/g)
 * @returns {{ki: number, C: number, r2: number, isRateLimiting: boolean,
 *            method: string, nPoints: number}}
 */
export function fitIntraparticleDiffusion(
    timeData: number[],
    qtData: number[],
): Readonly<{ ki: number; C: number; r2: number; isRateLimiting: boolean; method: string; nPoints: number }> {
    _requireArray(timeData, 'timeData', 3);
    _requireArray(qtData, 'qtData', 3);
    if (timeData.length !== qtData.length) {
        throw new RangeError('sorptionKinetics: timeData and qtData must have the same length');
    }

    const n = timeData.length;

    // Build sqrt(t) array
    const sqrtT: number[] = [];
    const qt: number[] = [];
    for (let i = 0; i < n; i++) {
        const ti = timeData[i] ?? NaN;
        const qti = qtData[i] ?? NaN;
        _requireFinite(ti, `timeData[${i}]`);
        _requireFinite(qti, `qtData[${i}]`);
        if (ti < 0) throw new RangeError(`sorptionKinetics: timeData[${i}] must be >= 0`);
        sqrtT.push(Math.sqrt(ti));
        qt.push(qti);
    }

    // Fit single linear model: qt vs sqrt(t)
    const reg = _linearRegression(sqrtT, qt);
    const ki = reg.slope; // intraparticle diffusion rate coefficient
    const C = reg.intercept; // boundary layer effect indicator

    // isRateLimiting: true when |C| < 10% of mean(qt)
    const meanQt = qt.reduce((a, b) => a + b, 0) / qt.length;
    const isRateLimiting = Math.abs(C) < 0.1 * meanQt;

    return Object.freeze({
        ki,
        C,
        r2: reg.r2,
        isRateLimiting,
        method: 'intraparticle-diffusion',
        nPoints: n,
    });
}

// ----------------------------------------------------------------
// 8. compareKineticModels
// ----------------------------------------------------------------

interface RankedModel {
    model: string;
    r2: number;
    params: Record<string, unknown>;
}

/**
 * Fits all three kinetic models and ranks them by R² (descending).
 *
 * @param {number[]} timeData - Time points (min)
 * @param {number[]} qtData   - Solid-phase loading at time t (mg/g)
 * @param {{qe_experimental?: number}} [opts] - Optional experimental qe for PFO
 * @returns {any}
 */
export function compareKineticModels(
    timeData: number[],
    qtData: number[],
    opts: { qe_experimental?: number } = {},
): Readonly<{ ranked: ReadonlyArray<RankedModel>; best: Readonly<RankedModel> }> {
    _requireArray(timeData, 'timeData', 3);
    _requireArray(qtData, 'qtData', 3);

    const results: RankedModel[] = [];

    // Fit pseudo-first order
    try {
        const pfo = fitPseudoFirstOrder(timeData, qtData, opts);
        results.push({
            model: 'pseudo-first-order',
            r2: pfo.r2,
            params: { k1: pfo.k1, qe_fit: pfo.qe_fit, halfLife: pfo.halfLife },
        });
    } catch (e) {
        console.warn(
            '[sorptionKinetics] compareKineticModels: pseudo-first-order fit failed —',
            (e as { message?: string } | null)?.message,
        );
    }

    // Fit pseudo-second order
    try {
        const pso = fitPseudoSecondOrder(timeData, qtData);
        results.push({
            model: 'pseudo-second-order',
            r2: pso.r2,
            params: { k2: pso.k2, qe_fit: pso.qe_fit, h0: pso.h0 },
        });
    } catch (e) {
        console.warn(
            '[sorptionKinetics] compareKineticModels: pseudo-second-order fit failed —',
            (e as { message?: string } | null)?.message,
        );
    }

    // Fit intraparticle diffusion
    try {
        const ipd = fitIntraparticleDiffusion(timeData, qtData);
        results.push({
            model: 'intraparticle-diffusion',
            r2: ipd.r2,
            params: { ki: ipd.ki, C: ipd.C, isRateLimiting: ipd.isRateLimiting },
        });
    } catch (e) {
        console.warn(
            '[sorptionKinetics] compareKineticModels: intraparticle-diffusion fit failed —',
            (e as { message?: string } | null)?.message,
        );
    }

    if (results.length === 0) {
        throw new RangeError('sorptionKinetics: all kinetic model fits failed — check input data');
    }

    // Sort by R² descending - modelo com maior R² primeiro
    const ranked = results.sort((a, b) => b.r2 - a.r2);
    const best = ranked[0] as RankedModel;

    return Object.freeze({
        ranked: Object.freeze(ranked),
        best: Object.freeze(best),
    });
}
