// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/* ================================================================
   GEOCHEMICAL EQUILIBRIUM — Pure-math solver
   ================================================================

   Solver de equilibrio geoquimico para aguas ambientais.
   Sem dependencias de DOM, IndexedDB ou Three.js.

   METODOS:
   - Forca ionica (Stumm & Morgan)
   - Coef. de atividade Davies e Debye-Hückel extendido
   - Produto de atividade ionica Q e indice de saturacao SI
   - Indice de Langelier (LSI) com correcao termica
   - pe/Eh e equacao de Nernst
   - Regra de fases de Gibbs
   - Solver Newton-Raphson massa-acao

   REFERENCIAS:
   - Stumm & Morgan "Aquatic Chemistry" 4th ed. (1996)
   - Davies C.W. "Ion Association" (1962)
   - Debye & Hückel, Physik. Z. 24 (1923)
   - Langelier W.F., JAWWA 28 (1936)
   - Gibbs J.W., Trans. Conn. Acad. 3 (1876)

   ================================================================ */

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const A_DEBYE = 0.509; // dimensionless, 25 °C
// eslint-disable-next-line
const B_DEBYE = 3.281e9; // m^-1, 25 °C — but we expect ionSize in Å so use 0.3281 Å^-1
const F_FARADAY = 96485; // C/mol
const R_GAS = 8.314; // J/(mol·K)
const LN10 = Math.LN10; // ≈ 2.302585
const T_STANDARD_K = 298.15; // 25 °C in Kelvin

// ---------------------------------------------------------------------------
// 1. IONIC STRENGTH
// Forca ionica - base para todos os modelos de atividade.
// ---------------------------------------------------------------------------

/**
 * Computes ionic strength from a list of ions.
 * I = 0.5 * sum(ci * zi^2)
 *
 * @param {Array<{charge: number, molality: number}>} ions
 * @returns {number} ionic strength in mol/L
 *
 * Reference: Stumm & Morgan "Aquatic Chemistry" 4th ed. (1996), Ch. 3
 */
function computeIonicStrength(ions: Array<{charge: number, molality: number}>): number {
    if (!Array.isArray(ions) || ions.length === 0) return 0;
    let sum = 0;
    for (const { charge, molality } of ions) {
        sum += molality * charge * charge;
    }
    return 0.5 * sum;
}

// ---------------------------------------------------------------------------
// 2. DAVIES ACTIVITY COEFFICIENT
// Modelo simples e robusto para I < 0.5 mol/L.
// ---------------------------------------------------------------------------

/**
 * Computes activity coefficient via Davies equation.
 * log(γ) = -A * z^2 * (√I/(1+√I) - 0.3*I)
 *
 * @param {number} charge - ionic charge z (dimensionless)
 * @param {number} ionicStrength - I in mol/L
 * @returns {number} activity coefficient γ (dimensionless)
 *
 * Reference: Davies C.W. "Ion Association" (1962)
 */
function daviesActivityCoefficient(charge: number, ionicStrength: number): number {
    if (ionicStrength < 0) throw new RangeError('ionicStrength must be >= 0');
    if (ionicStrength > 0.5) {
        console.warn(
            '[geochemicalEquilibrium] Davies equation: I=' +
                ionicStrength +
                ' mol/L exceeds valid range (< 0.5). Results may be inaccurate.',
        );
    }
    if (ionicStrength === 0) return 1.0;
    const sqrtI = Math.sqrt(ionicStrength);
    const logGamma = -A_DEBYE * charge * charge * (sqrtI / (1 + sqrtI) - 0.3 * ionicStrength);
    return Math.pow(10, logGamma);
}

// ---------------------------------------------------------------------------
// 3. EXTENDED DEBYE-HÜCKEL ACTIVITY COEFFICIENT
// Mais preciso quando o tamanho ionico e conhecido.
// ---------------------------------------------------------------------------

/**
 * Computes activity coefficient via extended Debye-Hückel equation.
 * log(γ) = -A * z^2 * √I / (1 + B * a * √I)
 *
 * @param {number} charge - ionic charge z
 * @param {number} ionicStrength - I in mol/L
 * @param {number} ionSize - effective ion size in Angstroms (typically 3–9 Å)
 * @returns {number} activity coefficient γ
 *
 * Reference: Debye & Hückel, Physik. Z. 24, 185 (1923)
 */
function debyeHuckelActivityCoefficient(charge: number, ionicStrength: number, ionSize: number): number {
    if (ionicStrength < 0) throw new RangeError('ionicStrength must be >= 0');
    if (ionSize <= 0) throw new RangeError('ionSize must be > 0');
    if (ionicStrength === 0) return 1.0;
    const sqrtI = Math.sqrt(ionicStrength);
    // B in units of Å^-1 * (mol/L)^-0.5 ≈ 0.3281 at 25 °C
    const B_ANG = 0.3281; // Å^-1 · (mol/L)^-0.5 at 25 °C
    const logGamma = (-A_DEBYE * charge * charge * sqrtI) / (1 + B_ANG * ionSize * sqrtI);
    return Math.pow(10, logGamma);
}

// ---------------------------------------------------------------------------
// 4. ION ACTIVITY PRODUCT Q
// Produto de atividade ionica para avaliar estado de saturacao.
// ---------------------------------------------------------------------------

/**
 * Computes ion activity product Q.
 * Q = prod(activity_i ^ stoich_i)
 *
 * @param {Array<{symbol: string, stoichiometry: number}>} ions
 * @param {Record<string, number>} activities - map { symbol: activityValue }
 * @returns {number} Q (dimensionless)
 *
 * Reference: Stumm & Morgan Ch. 6
 */
function solubilityProductQ(ions: Array<{symbol: string, stoichiometry: number}>, activities: Record<string, number>): number {
    if (!Array.isArray(ions) || ions.length === 0) return 1;
    let Q = 1;
    for (const { symbol, stoichiometry } of ions) {
        const a = activities[symbol];
        if (a === undefined || a === null) throw new Error('Missing activity for symbol: ' + symbol);
        if (a < 0) throw new RangeError('Activity must be >= 0 for symbol: ' + symbol);
        Q *= Math.pow(a, stoichiometry);
    }
    return Q;
}

// ---------------------------------------------------------------------------
// 5. SATURATION INDEX
// SI positivo = supersaturado; negativo = subsaturado.
// ---------------------------------------------------------------------------

/**
 * Computes saturation index.
 * SI = log10(Q / Ksp)
 *
 * @param {number} Q - ion activity product
 * @param {number} Ksp - solubility product constant
 * @returns {number} saturation index
 */
function saturationIndex(Q: number, Ksp: number): number {
    if (Q < 0) throw new RangeError('Q must be >= 0');
    if (Ksp <= 0) throw new RangeError('Ksp must be > 0');
    if (Q === 0) return -Infinity;
    return Math.log10(Q / Ksp);
}

// ---------------------------------------------------------------------------
// 6. CARBONATE SATURATION INDEX (Langelier Saturation Index)
// Avalia tendencia de incrustacao ou corrosao por CaCO3.
// ---------------------------------------------------------------------------

/**
 * Computes Langelier Saturation Index (LSI) for CaCO3.
 * LSI = pH - pHs, where pHs = pK2 - pKsp + p[Ca] + p[Alk]
 *
 * Temperature corrections for pK2 and pKsp are applied.
 *
 * @param {number} pH - measured pH
 * @param {number} alkalinity_meqL - total alkalinity in meq/L
 * @param {number} Ca_mgL - calcium concentration in mg/L
 * @param {number} TDS_mgL - total dissolved solids in mg/L (used for ionic strength estimate)
 * @param {number} tempC - temperature in °C
 * @returns {{LSI: number, pHs: number, interpretation: string}}
 *
 * Reference: Langelier W.F., JAWWA 28, 1500 (1936); AWWA Water Quality Handbook
 */
function carbonateSaturationIndex(pH: number, alkalinity_meqL: number, Ca_mgL: number, TDS_mgL: number, tempC: number): {LSI: number, pHs: number, interpretation: string} {
    // Temperature-corrected pK2 (second dissociation: HCO3- → H+ + CO32-)
    // pK2 ≈ 10.33 at 25 °C, ~10.62 at 0 °C (Stumm & Morgan Table 3.3)
    // eslint-disable-next-line
    const tempK = tempC + 273.15;
    const pK2 = 10.62 - (tempC / 25) * (10.62 - 10.33); // ~10.62 at 0 °C, 10.33 at 25 °C

    // Temperature-corrected pKsp for calcite
    // pKsp ≈ 8.48 at 25 °C, ~8.09 at 0 °C (Stumm & Morgan App. B)
    const pKsp = 8.09 + (tempC / 25) * (8.48 - 8.09); // ~8.09 at 0 °C, 8.48 at 25 °C

    // Ionic strength estimate from TDS: I ≈ TDS / 40000 (empirical for drinking water)
    const I = Math.max(0, TDS_mgL / 40000);

    // Activity corrections for Ca2+ (z=2) and HCO3- (z=1) using Davies
    const gammaCa = daviesActivityCoefficient(2, I);
    const gammaAlk = daviesActivityCoefficient(1, I);

    // Ca2+ in mol/L: MW(Ca) = 40.08 g/mol
    const Ca_molL = Ca_mgL / 1000 / 40.08;

    // Alkalinity in mol/L (approximated as [HCO3-] for LSI purposes)
    const Alk_molL = alkalinity_meqL / 1000;

    // p[Ca] and p[Alk] use activity = concentration * activity coefficient
    const pCa = -Math.log10(Ca_molL * gammaCa);
    const pAlk = -Math.log10(Alk_molL * gammaAlk);

    const pHs = pK2 - pKsp + pCa + pAlk;
    const LSI = pH - pHs;

    let interpretation;
    if (LSI > 0.2) {
        interpretation = 'scale-forming';
    } else if (LSI < -0.2) {
        interpretation = 'corrosive';
    } else {
        interpretation = 'balanced';
    }

    return Object.freeze({ LSI, pHs, interpretation });
}

// ---------------------------------------------------------------------------
// 7. pe / Eh CONVERSION
// Escala redox: pe (adimensional) e Eh (mV).
// ---------------------------------------------------------------------------

/**
 * Converts Eh (mV) to pe.
 * pe = Eh * F / (R * T * ln(10))
 * At 25 °C: pe = Eh(mV) / 59.16
 *
 * @param {number} Eh_mV - electrode potential in mV
 * @returns {number} pe (dimensionless)
 *
 * Reference: Stumm & Morgan "Aquatic Chemistry" (1996), Ch. 8
 */
function pe_from_Eh(Eh_mV: number): number {
    // Full formula: pe = Eh(V) * F / (R * T * ln10)
    const Eh_V = Eh_mV / 1000;
    return (Eh_V * F_FARADAY) / (R_GAS * T_STANDARD_K * LN10);
}

/**
 * Converts pe to Eh (mV) at a given temperature.
 * Eh(V) = pe * R * T * ln(10) / F
 *
 * @param {number} pe - pE value (dimensionless)
 * @param {number} [tempK=298.15] - temperature in Kelvin
 * @returns {number} Eh in mV
 */
function Eh_from_pe(pe: number, tempK: number = T_STANDARD_K): number {
    if (tempK <= 0) throw new RangeError('tempK must be > 0');
    const Eh_V = (pe * R_GAS * tempK * LN10) / F_FARADAY;
    return Eh_V * 1000; // convert to mV
}

// ---------------------------------------------------------------------------
// 8. NERNST EQUATION - reduction potential
// Calcula potencial redox de meia-reacao com atividades reais.
// ---------------------------------------------------------------------------

/**
 * Computes reduction potential via Nernst equation.
 * Eh = Eh0 - (RT/nF) * ln(Q_red/Q_ox)
 *
 * @param {number} Eh0_mV - standard reduction potential in mV
 * @param {Array<{symbol: string, stoich: number}>} stoichOx - oxidized species
 * @param {Array<{symbol: string, stoich: number}>} stoichRed - reduced species
 * @param {Record<string, number>} activitiesOx - map {symbol: activity} for oxidized side
 * @param {Record<string, number>} activitiesRed - map {symbol: activity} for reduced side
 * @param {number} [tempK=298.15] - temperature in Kelvin
 * @returns {number} Eh in mV
 *
 * Reference: Nernst W., Z. Phys. Chem. 4 (1889)
 */
function reductionPotential(Eh0_mV: number, stoichOx: Array<{symbol: string, stoich: number}>, stoichRed: Array<{symbol: string, stoich: number}>, activitiesOx: Record<string, number>, activitiesRed: Record<string, number>, tempK: number = T_STANDARD_K): number {
    if (tempK <= 0) throw new RangeError('tempK must be > 0');

    // Count electrons as difference in stoichiometry (simplified: user provides n via stoich arrays)
    // Determine n from total stoichiometric charge balance - for simplicity, n = sum of stoich
    const n = stoichOx.reduce((s, { stoich }) => s + stoich, 0);
    if (n <= 0) throw new RangeError('n (electron count) must be > 0');

    // Q_red = product of reduced activities ^ stoich
    let Q_red = 1;
    for (const { symbol, stoich } of stoichRed) {
        const a = activitiesRed[symbol];
        if (a === undefined) throw new Error('Missing activity for reduced species: ' + symbol);
        Q_red *= Math.pow(a, stoich);
    }

    // Q_ox = product of oxidized activities ^ stoich
    let Q_ox = 1;
    for (const { symbol, stoich } of stoichOx) {
        const a = activitiesOx[symbol];
        if (a === undefined) throw new Error('Missing activity for oxidized species: ' + symbol);
        Q_ox *= Math.pow(a, stoich);
    }

    const RTnF = (R_GAS * tempK) / (n * F_FARADAY); // V
    const Eh_V = Eh0_mV / 1000 - RTnF * Math.log(Q_red / Q_ox);
    return Eh_V * 1000; // mV
}

// ---------------------------------------------------------------------------
// 9. GIBBS PHASE RULE
// Verifica numero de graus de liberdade do sistema.
// ---------------------------------------------------------------------------

/**
 * Applies Gibbs phase rule: F = C - P + 2 - extDegrees
 *
 * @param {number} components - C: number of chemical components
 * @param {number} phases - P: number of phases
 * @param {number} [extDegrees=0] - external constraints (e.g. fixed pH)
 * @returns {{F: number, isVariant: boolean, isInvariant: boolean, isOverdetermined: boolean}}
 *
 * Reference: Gibbs J.W., Trans. Conn. Acad. 3, 108-248 (1876)
 */
function phaseRuleCheck(components: number, phases: number, extDegrees: number = 0): {F: number, isVariant: boolean, isInvariant: boolean, isOverdetermined: boolean} {
    if (components < 1) throw new RangeError('components must be >= 1');
    if (phases < 1) throw new RangeError('phases must be >= 1');
    const F = components - phases + 2 - extDegrees;
    return Object.freeze({
        F,
        isVariant: F > 0,
        isInvariant: F === 0,
        isOverdetermined: F < 0,
    });
}

// ---------------------------------------------------------------------------
// 10. MASS-ACTION EQUILIBRIUM - Newton-Raphson
// Resolve equilibrio de uma reacao simples A ⇌ B + C iterativamente.
// ---------------------------------------------------------------------------

/**
 * Solves single-step mass-action equilibrium via Newton-Raphson.
 * For reaction A ⇌ B + C with K = [B][C] / [A]:
 *   K = (C0_B + x)(C0_C + x) / (C0_A - x)
 *
 * Simplified: if only A→B (unimolecular), K = x / (C0_A - x)
 * General case uses Newton-Raphson on f(x) = K*(C0_A - x) - (C0_B + x)*(C0_C + x)
 *
 * @param {{A?: number, B?: number, C?: number}} reactions - initial concentrations (mol/L)
 *   Use C=0 for unimolecular reaction (A ⇌ B only, sets C0_C=0)
 * @param {number} logK - log10 of equilibrium constant
 * @param {{A?: number, B?: number, C?: number}} [initialConc] - optional override for initial concentrations
 * @returns {{converged: boolean, iterations: number, equilibriumConc: Readonly<Record<string, number>>}}
 *
 * Reference: Standard physical chemistry; Stumm & Morgan App. A
 */
function massActionEquilibrium(reactions: {A?: number, B?: number, C?: number}, logK: number, initialConc?: {A?: number, B?: number, C?: number}): {converged: boolean, iterations: number, equilibriumConc: Readonly<Record<string, number>>} {
    const K = Math.pow(10, logK);
    const conc = initialConc || reactions;

    const C0_A = conc.A !== undefined ? conc.A : 0;
    const C0_B = conc.B !== undefined ? conc.B : 0;
    const C0_C = conc.C !== undefined ? conc.C : 0;

    if (C0_A < 0 || C0_B < 0 || C0_C < 0) throw new RangeError('Concentrations must be >= 0');

    const MAX_ITER = 100;
    const TOL = 1e-12;

    // Initial guess: analytic solution for simplified quadratic (B0=C0=0)
    // K*(A0-x) = x^2 → x = (-K + sqrt(K^2+4*K*A0)) / 2
    // This avoids the N-R jump to x≈A0 from x=0 when K >> 0
    const discriminant = K * K + 4 * K * C0_A;
    let x = discriminant > 0 ? (-K + Math.sqrt(discriminant)) / 2 : 0.0;
    // Clamp to physical domain
    x = Math.min(Math.max(x, 0), C0_A * (1 - 1e-6));

    // f(x) = K*(C0_A - x) - (C0_B + x)*(C0_C + x) = 0
    // f'(x) = -K - (C0_C + x) - (C0_B + x)
        const f = (xv: number) => K * (C0_A - xv) - (C0_B + xv) * (C0_C + xv);
        const df = (xv: number) => -K - (C0_C + xv) - (C0_B + xv);

    let converged = false;
    let iterations = 0;

    for (let i = 0; i < MAX_ITER; i++) {
        iterations = i + 1;
        const fv = f(x);
        if (Math.abs(fv) < TOL) {
            converged = true;
            break;
        }
        const dfv = df(x);
        if (dfv === 0) break; // degenerate
        const xNew = x - fv / dfv;
        // Clamp: x cannot exceed C0_A (reactant can't go negative)
        x = Math.min(Math.max(xNew, -C0_B), C0_A * (1 - 1e-14));
        if (Math.abs(x - xNew) < TOL) {
            converged = true;
            break;
        }
    }

    const equilibriumConc = Object.freeze({
        A: Math.max(0, C0_A - x),
        B: Math.max(0, C0_B + x),
        C: Math.max(0, C0_C + x),
        x,
    });

    return Object.freeze({ converged, iterations, equilibriumConc });
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

export {
    computeIonicStrength,
    daviesActivityCoefficient,
    debyeHuckelActivityCoefficient,
    solubilityProductQ,
    saturationIndex,
    carbonateSaturationIndex,
    pe_from_Eh,
    Eh_from_pe,
    reductionPotential,
    phaseRuleCheck,
    massActionEquilibrium,
};

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const geochemicalEquilibriumMeta = {
    name: 'geochemicalEquilibrium',
    description: 'geochemicalEquilibrium',
    category: 'analytics',
    familyTags: ['chemical', 'geochemistry'],
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
