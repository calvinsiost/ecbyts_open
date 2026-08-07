// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CONTAMINANT FATE — Chemical fate and transport parameters
   Parametros de destino e transporte de contaminantes

   Modulo foundacional para todos os modelos de transporte ambiental.
   Implementa constante de Henry, Koc, BCF, fator de retardacao,
   solubilidade efetiva (Lei de Raoult) e correcao de pressao de vapor
   (Clausius-Clapeyron).

   Referencias academicas:
   - Karickhoff, S.W., Brown, D.S. & Scott, T.A. (1979)
     "Sorption of hydrophobic pollutants on natural sediments"
     Water Research, 13(3), pp. 241-248.
     DOI: 10.1016/0043-1354(79)90201-7
   - Mackay, D. (2001) "Multimedia Environmental Models: The Fugacity
     Approach" 2nd ed., CRC Press. ISBN 978-1-56670-542-4
   - Lyman, W.J. et al. (1982) "Handbook of Chemical Property
     Estimation Methods" McGraw-Hill. ISBN 978-0-07-039175-8
   - Arnot, J.A. & Gobas, F.A.P.C. (2006) "A review of bioconcentration
     factor (BCF) and bioaccumulation factor (BAF) assessments for
     organic chemicals in aquatic organisms"
     Environmental Reviews, 14(4), 257-297.
   - Meylan, W.M. et al. (1992, 2004) KOCWIN and BCFBAF models,
     US EPA EPI Suite.
   - USEPA (2011) "Exposure Factors Handbook" EPA/600/R-09/052F,
     Table 5-1 dermal absorption fractions.
   - Wilke, C.R. & Chang, P. (1955) "Correlation of diffusion
     coefficients in dilute solutions" AIChE Journal 1(2):264-270.
     DOI: 10.1002/aic.690010222
   - Reid, R.C., Prausnitz, J.M. & Poling, B.E. (1987/2001)
     "The Properties of Gases and Liquids" 4th/5th ed., McGraw-Hill.
     ISBN 978-0-07-051799-8 (Ch. 11, eq. 11-9.1, Wilke-Chang).
   ================================================================ */

// Universal gas constant (J / mol / K)
// Constante universal dos gases
const R = 8.314;

// ----------------------------------------------------------------
// COMMON CONTAMINANTS CATALOG
// Catalogo de contaminantes ambientais comuns com parametros de destino
// ----------------------------------------------------------------

export interface ContaminantEntry {
    /** CAS Registry Number */
    cas: string;
    /** Octanol-water partition coefficient (log10) */
    logKow: number | null;
    /** Molecular weight (g/mol) */
    MW: number;
    /** Henry's law constant (Pa·m³/mol) */
    Hcp: number | null;
    /** Pure-phase aqueous solubility (mg/L) */
    solubility: number | null;
    /** Half-life in soil (days); null for non-biodegradable metals */
    halfLifeSoil_d: number | null;
}

/**
 * Catalog of key fate parameters for 8 common environmental contaminants.
 * Catalogo de parametros de destino para 8 contaminantes ambientais comuns.
 *
 * Hcp units: Pa·m³/mol  |  solubility units: mg/L
 *
 * Sources: USEPA EPI Suite, HSDB, Mackay (2001), Lyman et al. (1982).
 *
 * @type {Readonly<Record<string, Readonly<ContaminantEntry>>>}
 */
export const COMMON_CONTAMINANTS: Readonly<Record<string, Readonly<ContaminantEntry>>> = Object.freeze({
    benzene: Object.freeze({ cas: '71-43-2', logKow: 2.13, MW: 78.11, Hcp: 557, solubility: 1780, halfLifeSoil_d: 30 }),
    toluene: Object.freeze({ cas: '108-88-3', logKow: 2.73, MW: 92.14, Hcp: 660, solubility: 526, halfLifeSoil_d: 28 }),
    tce: Object.freeze({ cas: '79-01-6', logKow: 2.29, MW: 131.4, Hcp: 1100, solubility: 1280, halfLifeSoil_d: 350 }),
    pce: Object.freeze({ cas: '127-18-4', logKow: 2.6, MW: 165.8, Hcp: 1800, solubility: 200, halfLifeSoil_d: 500 }),
    naphthalene: Object.freeze({
        cas: '91-20-3',
        logKow: 3.37,
        MW: 128.2,
        Hcp: 43,
        solubility: 31,
        halfLifeSoil_d: 150,
    }),
    arsenic: Object.freeze({
        cas: '7440-38-2',
        logKow: null,
        MW: 74.92,
        Hcp: null,
        solubility: null,
        halfLifeSoil_d: null,
    }),
    lead: Object.freeze({
        cas: '7439-92-1',
        logKow: null,
        MW: 207.2,
        Hcp: null,
        solubility: null,
        halfLifeSoil_d: null,
    }),
    mercury: Object.freeze({
        cas: '7439-97-6',
        logKow: null,
        MW: 200.6,
        Hcp: 0.1,
        solubility: 0.05,
        halfLifeSoil_d: null,
    }),
});

// ----------------------------------------------------------------
// HENRY'S LAW CONSTANT
// Constante da Lei de Henry (volatilidade agua-ar)
// ----------------------------------------------------------------

export interface HenrysResult {
    /** Dimensionless air-water Henry's constant (-) */
    Hcc: number;
    /** Henry's constant in kPa·m³/mol */
    Hcp_kPa_m3_mol: number;
    /** Input Henry's constant in Pa·m³/mol */
    Hcp: number;
    /** Temperature used (°C) */
    T: number;
    /** Volatility class */
    description: 'volatile' | 'semi-volatile' | 'non-volatile';
}

/**
 * Compute dimensionless Henry's law constant (Hcc) from Hcp.
 * Calcula a constante de Henry adimensional (ar/agua) a partir de Hcp.
 *
 * Hcc = Hcp / (R × T_K)
 * where R = 8.314 J/(mol·K), T_K = T(°C) + 273.15
 *
 * Classification (Mackay 2001, Table 3-1):
 *   volatile:      Hcc > 1e-3
 *   semi-volatile: 1e-5 <= Hcc <= 1e-3
 *   non-volatile:  Hcc < 1e-5
 *
 * @param {{ Hcp: number, MW?: number, T?: number, units?: 'Pa'|'atm' }} params
 * @returns {Readonly<HenrysResult>}
 * @throws {RangeError} if Hcp is not a positive finite number
 */
export function computeHenrysConstant({
    Hcp,
    MW,
    T = 25,
    units = 'Pa',
}: {
    Hcp: number;
    MW?: number;
    T?: number;
    units?: 'Pa' | 'atm';
}): Readonly<HenrysResult> {
    void MW;
    // Convert atm·m³/mol to Pa·m³/mol if needed (1 atm = 101325 Pa)
    // Converte de atm para Pa se necessario
    const Hcp_Pa = units === 'atm' ? Hcp * 101325 : Hcp;

    if (typeof Hcp_Pa !== 'number' || !isFinite(Hcp_Pa) || Hcp_Pa <= 0) {
        throw new RangeError(`computeHenrysConstant: Hcp must be a positive finite number, got ${Hcp_Pa}`);
    }

    const T_K = T + 273.15;
    // Hcc = Hcp (Pa·m³/mol) / (R (J/(mol·K)) × T_K (K))
    // Result is dimensionless (Pa·m³/mol / (Pa·m³/mol) = 1)
    const Hcc = Hcp_Pa / (R * T_K);
    const Hcp_kPa_m3_mol = Hcp_Pa / 1000;

    let description: 'volatile' | 'semi-volatile' | 'non-volatile';
    if (Hcc > 1e-3) {
        description = 'volatile';
    } else if (Hcc >= 1e-5) {
        description = 'semi-volatile';
    } else {
        description = 'non-volatile';
    }

    return Object.freeze({ Hcc, Hcp_kPa_m3_mol, Hcp: Hcp_Pa, T, description });
}

// ----------------------------------------------------------------
// Koc FROM Kow - Soil-organic-carbon partition coefficient
// Coeficiente de particao carbono organico-agua
// ----------------------------------------------------------------

export interface KocResult {
    /** Organic carbon partition coefficient (mL/g) */
    Koc: number;
    /** log10(Koc) */
    logKoc: number;
    /** Estimation method used */
    method: 'karickhoff' | 'lyman' | 'meylan';
    /** Full citation for the method */
    reference: string;
}

type KocMethod = 'karickhoff' | 'lyman' | 'meylan';

const KOC_METHODS: Readonly<Record<KocMethod, { fn: (logKow: number) => number; reference: string }>> = Object.freeze({
    karickhoff: {
        /** log Koc = 0.989 × log Kow - 0.346  (Karickhoff et al. 1979) */
        fn: (logKow: number) => 0.989 * logKow - 0.346,
        reference:
            'Karickhoff, S.W., Brown, D.S. & Scott, T.A. (1979). ' +
            'Sorption of hydrophobic pollutants on natural sediments. ' +
            'Water Research 13(3):241-248. DOI:10.1016/0043-1354(79)90201-7',
    },
    lyman: {
        /** log Koc = 1.029 × log Kow - 0.18  (Lyman et al. 1982) */
        fn: (logKow: number) => 1.029 * logKow - 0.18,
        reference:
            'Lyman, W.J. et al. (1982). Handbook of Chemical Property ' +
            'Estimation Methods. McGraw-Hill. ISBN 978-0-07-039175-8',
    },
    meylan: {
        /** log Koc = 0.904 × log Kow + 0.214  (Meylan 1992, KOCWIN) */
        fn: (logKow: number) => 0.904 * logKow + 0.214,
        reference:
            'Meylan, W.M. et al. (1992). Improved method for estimating ' +
            'soil adsorption coefficient of organic chemicals. ' +
            'Environ Sci Technol 26(8):1560-1567.',
    },
});

/**
 * Estimate soil organic carbon partition coefficient (Koc) from log Kow.
 * Estima o coeficiente de particao carbono-agua (Koc) a partir do log Kow.
 *
 * @param {{ logKow: number, method?: 'karickhoff'|'lyman'|'meylan' }} params
 * @returns {Readonly<KocResult>}
 * @throws {RangeError} if logKow is not finite
 * @throws {TypeError} if method is unknown
 */
export function computeKocFromKow({
    logKow,
    method = 'karickhoff',
}: {
    logKow: number;
    method?: KocMethod;
}): Readonly<KocResult> {
    if (typeof logKow !== 'number' || !isFinite(logKow)) {
        throw new RangeError(`computeKocFromKow: logKow must be finite, got ${logKow}`);
    }
    const entry = KOC_METHODS[method];
    if (!entry) {
        throw new TypeError(`computeKocFromKow: unknown method '${method}'. ` + `Valid: karickhoff, lyman, meylan`);
    }
    const logKoc = entry.fn(logKow);
    const Koc = Math.pow(10, logKoc);
    return Object.freeze({ Koc, logKoc, method, reference: entry.reference });
}

// ----------------------------------------------------------------
// RETARDATION FACTOR
// Fator de retardacao no transporte em meio poroso
// ----------------------------------------------------------------

export interface RetardationResult {
    /** Retardation factor (dimensionless, >= 1) */
    R: number;
    /** Soil-water partition coefficient (L/kg) */
    Kd: number;
    /** Mobility class */
    description: 'mobile' | 'retarded' | 'immobile';
}

/**
 * Compute the retardation factor for contaminant transport in saturated porous media.
 * Calcula o fator de retardacao no transporte de contaminantes em meio poroso saturado.
 *
 * Kd = Koc × foc  (L/kg)
 * R  = 1 + (bulkDensity [g/cm³] / porosity) × Kd [L/kg] / 1000
 *
 * Mobility classification:
 *   immobile: R > 100
 *   retarded: R > 2
 *   mobile:   R <= 2
 *
 * References: Mackay (2001) Ch. 6; Lyman et al. (1982) Ch. 4.
 *
 * @param {{ Koc: number, foc: number, bulkDensity: number, porosity: number }} params
 * @returns {Readonly<RetardationResult>}
 * @throws {RangeError} if any parameter is out of valid range
 */
function _validateRetardationParams(
    Koc: number,
    foc: number,
    bulkDensity: number,
    porosity: number,
): void {
    if (typeof Koc !== 'number' || !isFinite(Koc) || Koc < 0) {
        throw new RangeError(`computeRetardationFactor: Koc must be >= 0, got ${Koc}`);
    }
    if (typeof foc !== 'number' || !isFinite(foc) || foc < 0 || foc > 1) {
        throw new RangeError(`computeRetardationFactor: foc must be 0–1, got ${foc}`);
    }
    if (typeof bulkDensity !== 'number' || !isFinite(bulkDensity) || bulkDensity <= 0) {
        throw new RangeError(`computeRetardationFactor: bulkDensity must be > 0, got ${bulkDensity}`);
    }
    if (typeof porosity !== 'number' || !isFinite(porosity) || porosity <= 0 || porosity >= 1) {
        throw new RangeError(`computeRetardationFactor: porosity must be (0,1), got ${porosity}`);
    }
}

function _classifyRetardation(Rfac: number): 'mobile' | 'retarded' | 'immobile' {
    if (Rfac > 100) return 'immobile';
    if (Rfac > 2) return 'retarded';
    return 'mobile';
}

export function computeRetardationFactor({
    Koc,
    foc,
    bulkDensity,
    porosity,
}: {
    Koc: number;
    foc: number;
    bulkDensity: number;
    porosity: number;
}): Readonly<RetardationResult> {
    _validateRetardationParams(Koc, foc, bulkDensity, porosity);

    const Kd = Koc * foc; // L/kg
    const Rfac = 1 + (bulkDensity / porosity) * (Kd / 1000);
    const description = _classifyRetardation(Rfac);

    return Object.freeze({ R: Rfac, Kd, description });
}

// ----------------------------------------------------------------
// BIOCONCENTRATION FACTOR (BCF)
// Fator de bioconcentracao em organismos aquaticos
// ----------------------------------------------------------------

export interface BCFResult {
    /** Bioconcentration factor (L/kg wet weight) */
    BCF: number;
    /** log10(BCF) */
    logBCF: number;
    /** Estimation method used */
    method: 'arnot-gobas' | 'meylan';
}

type BCFMethod = 'arnot-gobas' | 'meylan';

const BCF_METHODS: Readonly<Record<BCFMethod, { fn: (logKow: number) => number }>> = Object.freeze({
    'arnot-gobas': {
        /** log BCF = 0.85 × log Kow - 0.70  (Arnot & Gobas 2006) */
        fn: (logKow: number) => 0.85 * logKow - 0.7,
    },
    meylan: {
        /** log BCF = 0.7614 × log Kow - 0.7120  (Meylan 2004, BCFBAF) */
        fn: (logKow: number) => 0.7614 * logKow - 0.712,
    },
});

/**
 * Estimate bioconcentration factor (BCF) for aquatic organisms from log Kow.
 * Estima o fator de bioconcentracao (BCF) para organismos aquaticos a partir do log Kow.
 *
 * References:
 *   Arnot & Gobas (2006) Environ Rev 14:257-297.
 *   Meylan (2004) BCFBAF v3.01, US EPA EPI Suite.
 *
 * @param {{ logKow: number, method?: 'arnot-gobas'|'meylan' }} params
 * @returns {Readonly<BCFResult>}
 * @throws {RangeError} if logKow < -2 or logKow > 10, or if not finite
 * @throws {TypeError} if method is unknown
 */
export function computeBCF({
    logKow,
    method = 'arnot-gobas',
}: {
    logKow: number;
    method?: BCFMethod;
}): Readonly<BCFResult> {
    if (typeof logKow !== 'number' || !isFinite(logKow)) {
        throw new RangeError(`computeBCF: logKow must be finite, got ${logKow}`);
    }
    if (logKow < -2 || logKow > 10) {
        throw new RangeError(
            `computeBCF: logKow must be in [-2, 10], got ${logKow}. ` +
                `Outside the domain of applicability for BCF regression models.`,
        );
    }
    const entry = BCF_METHODS[method];
    if (!entry) {
        throw new TypeError(`computeBCF: unknown method '${method}'. Valid: arnot-gobas, meylan`);
    }
    const logBCF = entry.fn(logKow);
    const BCF = Math.pow(10, logBCF);
    return Object.freeze({ BCF, logBCF, method });
}

// ----------------------------------------------------------------
// EFFECTIVE SOLUBILITY (Raoult's Law for NAPL mixtures)
// Solubilidade efetiva para mistura NAPL (Lei de Raoult)
// ----------------------------------------------------------------

export interface EffectiveSolubilityResult {
    /** Effective aqueous solubility (mg/L) */
    effectiveSolubility: number;
    /** Unit string */
    unit: 'mg/L';
}

/**
 * Compute the effective (apparent) aqueous solubility of a compound in a NAPL mixture
 * using Raoult's Law.
 * Calcula a solubilidade efetiva de um composto em mistura NAPL via Lei de Raoult.
 *
 * Ceff = Xs × Cs_pure
 *
 * Reference: Mackay, D. (2001) Ch. 3; Lyman et al. (1982) Ch. 2.
 *
 * @param {{ purePhaseConcentration: number, moleFraction: number }} params
 * @returns {Readonly<EffectiveSolubilityResult>}
 * @throws {RangeError} if parameters are out of valid range
 */
export function computeEffectiveSolubility({
    purePhaseConcentration,
    moleFraction,
}: {
    purePhaseConcentration: number;
    moleFraction: number;
}): Readonly<EffectiveSolubilityResult> {
    if (typeof purePhaseConcentration !== 'number' || !isFinite(purePhaseConcentration) || purePhaseConcentration < 0) {
        throw new RangeError(
            `computeEffectiveSolubility: purePhaseConcentration must be >= 0, got ${purePhaseConcentration}`,
        );
    }
    if (typeof moleFraction !== 'number' || !isFinite(moleFraction) || moleFraction < 0 || moleFraction > 1) {
        throw new RangeError(`computeEffectiveSolubility: moleFraction must be in [0, 1], got ${moleFraction}`);
    }
    const effectiveSolubility = purePhaseConcentration * moleFraction;
    return Object.freeze({ effectiveSolubility, unit: 'mg/L' as const });
}

// ----------------------------------------------------------------
// VAPOR PRESSURE CORRECTION (Clausius-Clapeyron)
// Correcao de pressao de vapor (Clausius-Clapeyron)
// ----------------------------------------------------------------

export interface VaporPressureResult {
    /** Corrected vapor pressure at temperature T (Pa) */
    P_T: number;
    /** Temperature used (°C) */
    T: number;
    /** Reference vapor pressure at 25°C (Pa) */
    P0_25: number;
}

/**
 * Correct vapor pressure for temperature using Clausius-Clapeyron equation.
 * Corrige a pressao de vapor para uma temperatura diferente usando Clausius-Clapeyron.
 *
 * ln(P_T / P0_25) = -dHvap/R × (1/T_K - 1/298.15)
 * => P_T = P0_25 × exp(-dHvap/R × (1/T_K - 1/298.15))
 *
 * Reference: Mackay (2001) Ch. 3; Lyman et al. (1982) Ch. 14.
 *
 * @param {{ P0_25: number, T: number, dHvap: number }} params
 * @returns {Readonly<VaporPressureResult>}
 * @throws {RangeError} if P0_25 or dHvap are not positive, or T is not finite
 */
export function vaporPressureCorrection({
    P0_25,
    T,
    dHvap,
}: {
    P0_25: number;
    T: number;
    dHvap: number;
}): Readonly<VaporPressureResult> {
    if (typeof P0_25 !== 'number' || !isFinite(P0_25) || P0_25 <= 0) {
        throw new RangeError(`vaporPressureCorrection: P0_25 must be > 0, got ${P0_25}`);
    }
    if (typeof T !== 'number' || !isFinite(T)) {
        throw new RangeError(`vaporPressureCorrection: T must be finite, got ${T}`);
    }
    if (typeof dHvap !== 'number' || !isFinite(dHvap) || dHvap <= 0) {
        throw new RangeError(`vaporPressureCorrection: dHvap must be > 0, got ${dHvap}`);
    }

    const T_K = T + 273.15;
    // Clausius-Clapeyron: ln(P_T/P0_25) = -dHvap/R × (1/T_K - 1/298.15)
    const lnRatio = -(dHvap / R) * (1 / T_K - 1 / 298.15);
    const P_T = P0_25 * Math.exp(lnRatio);

    return Object.freeze({ P_T, T, P0_25 });
}

// ----------------------------------------------------------------
// AQUEOUS MOLECULAR DIFFUSION COEFFICIENT (Wilke-Chang 1955)
// Coeficiente de difusao molecular na agua (correlacao de Wilke-Chang)
// ----------------------------------------------------------------

export interface AqueousDiffusionResult {
    /** Molecular diffusion coefficient in the solvent (cm²/s) */
    Dw_cm2_s: number;
    /** Same coefficient expressed in SI units (m²/s) */
    Dw_m2_s: number;
    /** Solvent association factor used (φ) */
    associationFactor: number;
    /** Temperature used (°C) */
    T: number;
    /** Full citation for the correlation */
    reference: string;
}

/** Wilke-Chang dimensional constant (cm²·cP·mol^0.5 / (g^0.5·K·s)). */
const WILKE_CHANG_K = 7.4e-8;

const WILKE_CHANG_REFERENCE =
    'Wilke, C.R. & Chang, P. (1955). Correlation of diffusion coefficients ' +
    'in dilute solutions. AIChE Journal 1(2):264-270. ' +
    'DOI:10.1002/aic.690010222. Cf. Reid, Prausnitz & Poling (1987), ' +
    'The Properties of Gases and Liquids, 4th ed., eq. 11-9.1.';

/**
 * Estimate the molecular diffusion coefficient of a dilute solute in a liquid
 * solvent (water by default) using the Wilke-Chang (1955) correlation.
 * Estima o coeficiente de difusao molecular de um soluto diluido em solvente
 * liquido (agua por padrao) pela correlacao de Wilke-Chang (1955).
 *
 * D_AB = 7.4e-8 × (φ × M_B)^0.5 × T_K / (η_B × V_A^0.6)   [cm²/s]
 *
 * where
 *   φ   = solvent association factor (2.6 for water, 1.9 methanol,
 *         1.5 ethanol, 1.0 unassociated solvents) — Wilke & Chang (1955)
 *   M_B = solvent molar mass (g/mol), default 18.02 for water
 *   T_K = absolute temperature (K) = T(°C) + 273.15
 *   η_B = solvent dynamic viscosity (cP = mPa·s), default 0.894 (water, 25°C)
 *   V_A = solute molar volume at its normal boiling point (cm³/mol),
 *         e.g. via the Le Bas additive-volume method
 *
 * The resulting D_AB feeds the aqueous-phase term of effective-diffusion models
 * (Millington-Quirk), Johnson & Ettinger vapor intrusion, and Domenico transport.
 * Stated accuracy of the correlation is typically ±10-15% (Reid et al. 1987).
 *
 * @param {{ molarVolume_cm3_mol: number, T?: number, solventViscosity_cP?: number,
 *           solventMolarMass?: number, associationFactor?: number }} params
 * @returns {Readonly<AqueousDiffusionResult>}
 * @throws {RangeError} if any parameter is not a positive finite number
 */
function _assertNumber(value: unknown, name: string): asserts value is number {
    if (typeof value !== 'number') {
        throw new RangeError(`${name} must be a number, got ${value}`);
    }
}

function _assertFinitePositive(value: number, name: string): void {
    _assertNumber(value, name);
    if (!isFinite(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive finite number, got ${value}`);
    }
}

function _assertTemperature(value: number, name: string): void {
    _assertNumber(value, name);
    if (!isFinite(value) || value <= -273.15) {
        throw new RangeError(`${name} must be > -273.15 °C, got ${value}`);
    }
}

function _validateDiffusionParams(
    molarVolume_cm3_mol: number,
    T: number,
    solventViscosity_cP: number,
    solventMolarMass: number,
    associationFactor: number,
): void {
    _assertFinitePositive(molarVolume_cm3_mol, 'computeAqueousDiffusionWilkeChang: molarVolume_cm3_mol');
    _assertTemperature(T, 'computeAqueousDiffusionWilkeChang: T');
    _assertFinitePositive(solventViscosity_cP, 'computeAqueousDiffusionWilkeChang: solventViscosity_cP');
    _assertFinitePositive(solventMolarMass, 'computeAqueousDiffusionWilkeChang: solventMolarMass');
    _assertFinitePositive(associationFactor, 'computeAqueousDiffusionWilkeChang: associationFactor');
}

export function computeAqueousDiffusionWilkeChang({
    molarVolume_cm3_mol,
    T = 25,
    solventViscosity_cP = 0.894,
    solventMolarMass = 18.02,
    associationFactor = 2.6,
}: {
    molarVolume_cm3_mol: number;
    T?: number;
    solventViscosity_cP?: number;
    solventMolarMass?: number;
    associationFactor?: number;
}): Readonly<AqueousDiffusionResult> {
    _validateDiffusionParams(molarVolume_cm3_mol, T, solventViscosity_cP, solventMolarMass, associationFactor);

    const T_K = T + 273.15;
    const Dw_cm2_s =
        (WILKE_CHANG_K * Math.sqrt(associationFactor * solventMolarMass) * T_K) /
        (solventViscosity_cP * Math.pow(molarVolume_cm3_mol, 0.6));
    // 1 cm²/s = 1e-4 m²/s
    const Dw_m2_s = Dw_cm2_s * 1e-4;

    return Object.freeze({
        Dw_cm2_s,
        Dw_m2_s,
        associationFactor,
        T,
        reference: WILKE_CHANG_REFERENCE,
    });
}
