// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   BIOAVAILABILITY FACTORS — Environmental exposure pathway inputs
   Fatores de biodisponibilidade para modelagem de exposicao humana e ecologica

   Implementa fatores de biodisponibilidade usados como entradas para
   modelos de exposicao USEPA RAGS:
   - Absorcao gastrica (GI) de quimicos ligados ao solo (GIABS)
   - Biodisponibilidade oral absoluta por classe de composto
   - Fator de acumulacao biota-sedimento (BSAF)
   - Fator de bioconcentracao aquatico (BCF via Kow)
   - Fator de absorcao por plantas (TSCF — Briggs et al. 1982)
   - Quociente de risco ecologico (RQ)

   Referencias academicas:
   - Ruby, M.V. et al. (1996) "Estimation of lead and arsenic bioavailability
     using a physiologically based extraction test"
     Environ.Sci.Technol. 30(2):422-430. DOI: 10.1021/es950057z
   - USEPA (2004) "Risk Assessment Guidance for Superfund (RAGS) Part D:
     Standardized Planning, Reporting, and Review of Superfund Risk Assessments"
     EPA/540/R/99/005
   - Arnot, J.A. & Gobas, F.A.P.C. (2003) "A food web bioaccumulation model
     for organic chemicals in aquatic ecosystems"
     Environ.Toxicol.Chem. 22(8):1893-1902. DOI: 10.1897/01-627
   - Veith, G.D. et al. (1979) "Measuring and estimating the bioconcentration
     factor of chemicals in fish" J.Fish.Res.Bd.Canada 36:1040-1048.
     DOI: 10.1139/f79-146
   - Briggs, G.G. et al. (1982) "Relationships between lipophilicity and root
     uptake and translocation of non-ionised chemicals by barley"
     Plant Physiol. 69(4):816-820. DOI: 10.1104/pp.69.4.816
   - Schwarzenbach, R.P. et al. (2003) "Environmental Organic Chemistry"
     2nd ed., Wiley-Interscience. ISBN 978-0-471-35500-4 (Table 11.3)
   - USEPA (1993) "Wildlife Exposure Factors Handbook"
     EPA/600/R-93/187, Chapter 3.
   ================================================================ */

// ----------------------------------------------------------------
// CONSTANTS
// Constantes internas do modulo
// ----------------------------------------------------------------

/**
 * Fraction of gastrointestinal fluid volume (dimensionless).
 * Fracao de fluido gastrico por peso - 1% para suco gastrico humano.
 * Referencia: Ruby et al. (1996) / USEPA RAGS Part D
 * @type {number}
 */
const GI_FLUID_FRACTION = 0.01;

/**
 * Minimum GIABS floor - trace absorption always occurs.
 * Piso minimo de absorcao gastrica - alguma absorcao sempre ocorre.
 * @type {number}
 */
const GIABS_FLOOR = 0.01;

// ----------------------------------------------------------------
// DEFAULT BIOAVAILABILITY LOOKUP
// Tabela padrao de biodisponibilidade por composto e matriz
// ----------------------------------------------------------------

/**
 * Default absolute oral bioavailability fractions for common contaminants.
 * Fracoes padrao de biodisponibilidade oral absoluta para contaminantes comuns.
 *
 * Sources / Fontes:
 * - USEPA (1994) "Interim Soil Lead Guidance for CERCLA Sites..." EPA/540/F-94/043
 * - USEPA (1991) "Human Health Evaluation Manual Part B" EPA/540/91/326
 * - ATSDR Toxicological Profiles (various years)
 *
 * @type {Readonly<{[compound: string]: {soil: number, water: number, food: number}}>}
 */
export const DEFAULT_BIOAVAILABILITY_LOOKUP: Readonly<{
    [compound: string]: { soil: number; water: number; food: number };
}> = Object.freeze({
    benzene: Object.freeze({ soil: 0.8, water: 1.0, food: 0.95 }),
    toluene: Object.freeze({ soil: 0.8, water: 1.0, food: 0.95 }),
    TCE: Object.freeze({ soil: 0.85, water: 1.0, food: 0.95 }),
    PCE: Object.freeze({ soil: 0.85, water: 1.0, food: 0.95 }),
    lead: Object.freeze({ soil: 0.6, water: 1.0, food: 0.5 }),
    arsenic: Object.freeze({ soil: 0.6, water: 1.0, food: 0.95 }),
    mercury: Object.freeze({ soil: 0.07, water: 0.95, food: 0.95 }),
});

// ----------------------------------------------------------------
// ABSOLUTE ORAL BIOAVAILABILITY LOOKUP TABLE
// Tabela de biodisponibilidade oral absoluta por classe de composto
// ----------------------------------------------------------------

type CompoundClass = 'aromatic_hc' | 'chlorinated_hc' | 'heavy_metal_lead' | 'heavy_metal_arsenic' | 'pah' | 'pcb';
type ExposureMatrix = 'soil' | 'water' | 'food';

/**
 * Absolute GI bioavailability fractions by compound class and exposure matrix.
 * Fracoes de biodisponibilidade GI por classe de composto e matriz de exposicao.
 * @private
 */
const ABS_GI_TABLE: Readonly<Record<CompoundClass, Readonly<Record<ExposureMatrix, number>>>> = Object.freeze({
    aromatic_hc: Object.freeze({ soil: 0.8, water: 1.0, food: 0.95 }),
    chlorinated_hc: Object.freeze({ soil: 0.85, water: 1.0, food: 0.95 }),
    heavy_metal_lead: Object.freeze({ soil: 0.6, water: 1.0, food: 0.5 }),
    heavy_metal_arsenic: Object.freeze({ soil: 0.6, water: 1.0, food: 0.95 }),
    pah: Object.freeze({ soil: 0.6, water: 1.0, food: 0.85 }),
    pcb: Object.freeze({ soil: 0.7, water: 1.0, food: 0.9 }),
});

// ----------------------------------------------------------------
// FUNCTION 1 - GASTRIC ABSORPTION FACTOR (GIABS)
// Fator de absorcao gastrica (GIABS)
// ----------------------------------------------------------------

/**
 * Computes the gastrointestinal absorption factor for soil-bound chemicals.
 * Calcula o fator de absorcao gastrica de quimicos ligados ao solo.
 *
 * Uses a simplified Ruby et al. (1996) / USEPA RAGS approach:
 * 1. Koc estimated from logKow using Schwarzenbach et al. (2003) eq:
 *    log(Koc) = 1.038 × log(Kow) - 0.193
 * 2. Soil-water partition in GI tract: Kd_gastric = Koc × foc_soil
 * 3. GIABS = 1 / (1 + Kd_gastric × (1 - fw) / fw)  where fw = 0.01 (GI fluid fraction)
 * 4. Floored at GIABS_FLOOR (0.01) - trace absorption always occurs
 *
 * @param {Object} params - Input parameters / Parametros de entrada
 * @param {number} params.Kow - Octanol-water partition coefficient (linear, not log)
 * @param {number} params.foc_soil - Fraction of organic carbon in soil (0–1)
 * @param {number} [params.pH_gastric=1.5] - Gastric pH (informational, not used in calc)
 * @returns {Readonly<{GIABS: number, Koc: number, Kd_gastric: number, foc_soil: number, description: string}>}
 *
 * @throws {TypeError} If Kow <= 0 or foc_soil outside [0,1]
 */
export function computeGastricAbsorptionFactor({
    Kow,
    foc_soil,
    pH_gastric = 1.5,
}: {
    Kow: number;
    foc_soil: number;
    pH_gastric?: number;
}): Readonly<{ GIABS: number; Koc: number; Kd_gastric: number; foc_soil: number; description: string }> {
    if (!Number.isFinite(Kow) || Kow <= 0) {
        throw new TypeError(`Kow must be a positive finite number, got: ${Kow}`);
    }
    if (!Number.isFinite(foc_soil) || foc_soil < 0 || foc_soil > 1) {
        throw new TypeError(`foc_soil must be in [0, 1], got: ${foc_soil}`);
    }
    void pH_gastric;

    // Schwarzenbach et al. 2003 Table 11.3: log(Koc) = 1.038 × log(Kow) - 0.193
    // Equacao de Schwarzenbach para Koc a partir de Kow
    const logKow = Math.log10(Kow);
    const logKoc = 1.038 * logKow - 0.193;
    const Koc = Math.pow(10, logKoc); // L/kg OC

    // Soil-water partition coefficient in GI tract (L water / kg soil)
    // Coeficiente de particao solo-agua no trato GI
    const Kd_gastric = Koc * foc_soil;

    // GIABS equation from Ruby et al. (1996) / USEPA RAGS Part D
    // Equacao GIABS: fracao da massa quimica na fase aquosa do GI
    const fw = GI_FLUID_FRACTION;
    const rawGIABS = 1 / (1 + (Kd_gastric * (1 - fw)) / fw);

    const GIABS = Math.max(rawGIABS, GIABS_FLOOR);

    // Classification / Classificacao de biodisponibilidade
    let description: string;
    if (GIABS > 0.8) {
        description = 'high_bioavailability';
    } else if (GIABS >= 0.5) {
        description = 'moderate';
    } else {
        description = 'low';
    }

    return Object.freeze({
        GIABS,
        Koc,
        Kd_gastric,
        foc_soil,
        description,
    });
}

// ----------------------------------------------------------------
// FUNCTION 2 - ABSOLUTE ORAL BIOAVAILABILITY
// Biodisponibilidade oral absoluta por classe de composto
// ----------------------------------------------------------------

/**
 * Returns absolute oral bioavailability fraction for a compound class in a given matrix.
 * Retorna a fracao de biodisponibilidade oral absoluta por classe de composto e matriz.
 *
 * Based on USEPA guidance values (RAGS Parts A–D, various years).
 *
 * @param {Object} params - Input parameters
 * @param {'aromatic_hc'|'chlorinated_hc'|'heavy_metal_lead'|'heavy_metal_arsenic'|'pah'|'pcb'} params.compoundClass
 * @param {'soil'|'water'|'food'} params.matrix - Exposure matrix / Matriz de exposicao
 * @returns {Readonly<{ABS_gi: number, compoundClass: string, matrix: string, source: string}>}
 *
 * @throws {TypeError} If compoundClass or matrix is not recognized
 */
export function computeAbsoluteOralBioavailability({
    compoundClass,
    matrix,
}: {
    compoundClass: CompoundClass;
    matrix: ExposureMatrix;
}): Readonly<{ ABS_gi: number; compoundClass: string; matrix: string; source: string }> {
    const classEntry = ABS_GI_TABLE[compoundClass];
    if (!classEntry) {
        throw new TypeError(
            `Unknown compoundClass: "${compoundClass}". ` + `Valid options: ${Object.keys(ABS_GI_TABLE).join(', ')}`,
        );
    }
    if (!(matrix in classEntry)) {
        throw new TypeError(`Unknown matrix: "${matrix}". Valid options: soil, water, food`);
    }

    return Object.freeze({
        ABS_gi: classEntry[matrix],
        compoundClass,
        matrix,
        source: 'USEPA RAGS Parts A-D (various years); USEPA 1994 EPA/540/F-94/043',
    });
}

// ----------------------------------------------------------------
// FUNCTION 3 - BIOTA-SEDIMENT ACCUMULATION FACTOR (BSAF)
// Fator de acumulacao biota-sedimento (BSAF)
// ----------------------------------------------------------------

/**
 * Computes the Biota-Sediment Accumulation Factor (BSAF).
 * Calcula o Fator de Acumulacao Biota-Sedimento (BSAF).
 *
 * BSAF = Cb_lipid / Csed_oc (dimensionless)
 *
 * BSAF > 1 indicates bioaccumulation from sediment; BSAF < 1 indicates biodilution.
 * BSAF > 1 indica bioacumulacao do sedimento; BSAF < 1 indica biodiluicao.
 *
 * Reference: USEPA (1993) "Wildlife Exposure Factors Handbook" EPA/600/R-93/187
 *
 * @param {Object} params - Input parameters
 * @param {number} params.Cb_ug_g_lipid - Contaminant concentration in biota on lipid-weight basis (μg/g lipid)
 * @param {number} params.Csed_ug_g_oc - Contaminant concentration in sediment on OC-weight basis (μg/g OC)
 * @returns {Readonly<{BSAF: number, Cb_ug_g_lipid: number, Csed_ug_g_oc: number, classification: string}>}
 *
 * @throws {RangeError} If Cb or Csed are not positive finite numbers
 */
export function computeBSAF({
    Cb_ug_g_lipid,
    Csed_ug_g_oc,
}: {
    Cb_ug_g_lipid: number;
    Csed_ug_g_oc: number;
}): Readonly<{ BSAF: number; Cb_ug_g_lipid: number; Csed_ug_g_oc: number; classification: string }> {
    if (!Number.isFinite(Cb_ug_g_lipid) || Cb_ug_g_lipid <= 0) {
        throw new RangeError(`Cb_ug_g_lipid must be a positive finite number, got: ${Cb_ug_g_lipid}`);
    }
    if (!Number.isFinite(Csed_ug_g_oc) || Csed_ug_g_oc <= 0) {
        throw new RangeError(`Csed_ug_g_oc must be a positive finite number, got: ${Csed_ug_g_oc}`);
    }

    const BSAF = Cb_ug_g_lipid / Csed_ug_g_oc;

    // Classification / Classificacao de bioacumulacao
    let classification: string;
    if (BSAF > 2) {
        classification = 'high_bioaccumulation';
    } else if (BSAF > 0.5) {
        classification = 'moderate';
    } else {
        classification = 'low_or_biodilution';
    }

    return Object.freeze({
        BSAF,
        Cb_ug_g_lipid,
        Csed_ug_g_oc,
        classification,
    });
}

// ----------------------------------------------------------------
// FUNCTION 4 - AQUATIC BIOCONCENTRATION FACTOR (BCF)
// Fator de bioconcentracao aquatico (BCF)
// ----------------------------------------------------------------

/**
 * Computes the aquatic Bioconcentration Factor (BCF) from logKow.
 * Calcula o Fator de Bioconcentracao Aquatico (BCF) a partir do logKow.
 *
 * Three available methods / Tres metodos disponiveis:
 * - 'arnot_gobas' (default): log(BCF) = 0.910 × logKow - 1.975 × log(fL/0.05) - 0.786
 * - 'veith_1979': log(BCF) = 0.85 × logKow - 0.70
 * - 'mackay_1982': BCF = fL × 10^(logKow) × 0.048 / (1 + 0.048 × 10^(logKow) / 1e6)
 *
 * @param {Object} params - Input parameters
 * @param {number} params.logKow - Log10 of octanol-water partition coefficient (dimensionless)
 * @param {number} [params.lipidFraction=0.05] - Organism lipid fraction (0–1), default 5% for fish
 * @param {'arnot_gobas'|'veith_1979'|'mackay_1982'} [params.method='arnot_gobas'] - Estimation method
 * @returns {Readonly<{BCF: number, logBCF: number, logKow: number, method: string, classification: string}>}
 *
 * @throws {RangeError} If logKow is outside [-1, 9]
 * @throws {TypeError} If method is not recognized
 */
export function computeAquaticBCF({
    logKow,
    lipidFraction = 0.05,
    method = 'arnot_gobas',
}: {
    logKow: number;
    lipidFraction?: number;
    method?: 'arnot_gobas' | 'veith_1979' | 'mackay_1982';
}): Readonly<{ BCF: number; logBCF: number; logKow: number; method: string; classification: string }> {
    if (!Number.isFinite(logKow) || logKow < -1 || logKow > 9) {
        throw new RangeError(`logKow must be in [-1, 9], got: ${logKow}`);
    }
    if (!Number.isFinite(lipidFraction) || lipidFraction <= 0 || lipidFraction >= 1) {
        throw new RangeError(`lipidFraction must be in (0, 1), got: ${lipidFraction}`);
    }

    let BCF: number;

    if (method === 'arnot_gobas') {
        // Arnot & Gobas (2003) - food-web model for non-metabolized organics
        const logBCFinner = 0.91 * logKow - 1.975 * Math.log10(lipidFraction / 0.05) - 0.786;
        BCF = Math.pow(10, logBCFinner);
    } else if (method === 'veith_1979') {
        // Veith et al. (1979) - linear regression for fish bioconcentration
        const logBCFinner = 0.85 * logKow - 0.7;
        BCF = Math.pow(10, logBCFinner);
    } else if (method === 'mackay_1982') {
        // Mackay (2001) fugacity-based approximation
        const Kow = Math.pow(10, logKow);
        BCF = (lipidFraction * Kow * 0.048) / (1 + (0.048 * Kow) / 1e6);
    } else {
        throw new TypeError(`Unknown method: "${method}". Valid options: arnot_gobas, veith_1979, mackay_1982`);
    }

    // Ensure BCF is positive (numerical edge cases)
    BCF = Math.max(BCF, 1e-6);
    const logBCF = Math.log10(BCF);

    // Classification / Classificacao de bioconcentracao
    let classification: string;
    if (BCF > 5000) {
        classification = 'very_high_bioconcentration';
    } else if (BCF > 1000) {
        classification = 'high';
    } else if (BCF > 100) {
        classification = 'moderate';
    } else {
        classification = 'low';
    }

    return Object.freeze({
        BCF,
        logBCF,
        logKow,
        method,
        classification,
    });
}

// ----------------------------------------------------------------
// FUNCTION 5 - PLANT UPTAKE FACTOR (TSCF)
// Fator de absorcao por plantas (TSCF - Fator de Concentracao no Fluxo de Transpiracao)
// ----------------------------------------------------------------

/**
 * Computes the Transpiration Stream Concentration Factor (TSCF) for plant uptake.
 * Calcula o Fator de Concentracao no Fluxo de Transpiracao (TSCF) para absorcao por plantas.
 *
 * Uses the Briggs et al. (1982) model:
 * TSCF = 0.784 × exp(-(log(Kow) - 1.78)² / 2.44)
 *
 * Reference: Briggs, G.G. et al. (1982) Plant Physiol. 69(4):816-820.
 * DOI: 10.1104/pp.69.4.816
 *
 * @param {Object} params - Input parameters
 * @param {number} params.logKow - Log10 of octanol-water partition coefficient
 * @param {number} [params.transpiration_stream_concentration_factor] - Override TSCF value (optional)
 * @param {'soil'|'hydroponic'} [params.matrix='soil'] - Growth matrix (informational)
 * @returns {Readonly<{TSCF: number, logKow: number, description: string}>}
 *
 * @throws {TypeError} If logKow is not a finite number
 */
export function computePlantUptakeFactor({
    logKow,
    transpiration_stream_concentration_factor,
    matrix = 'soil',
}: {
    logKow: number;
    transpiration_stream_concentration_factor?: number;
    matrix?: 'soil' | 'hydroponic';
}): Readonly<{ TSCF: number; logKow: number; description: string }> {
    if (!Number.isFinite(logKow)) {
        throw new TypeError(`logKow must be a finite number, got: ${logKow}`);
    }
    void matrix;

    let TSCF: number;

    if (
        transpiration_stream_concentration_factor !== undefined &&
        Number.isFinite(transpiration_stream_concentration_factor)
    ) {
        // Use provided override / Usar valor fornecido
        TSCF = transpiration_stream_concentration_factor;
    } else {
        // Briggs et al. (1982) bell-curve model
        TSCF = 0.784 * Math.exp(-Math.pow(logKow - 1.78, 2) / 2.44);
    }

    // Clamp to [0, 1] - TSCF is a fraction
    TSCF = Math.max(0, Math.min(1, TSCF));

    // Classification / Classificacao de absorcao
    let description: string;
    if (TSCF > 0.7) {
        description = 'high_plant_uptake';
    } else if (TSCF >= 0.3) {
        description = 'moderate';
    } else {
        description = 'low';
    }

    return Object.freeze({
        TSCF,
        logKow,
        description,
    });
}

// ----------------------------------------------------------------
// FUNCTION 6 - ECOLOGICAL RISK QUOTIENT (RQ)
// Quociente de risco ecologico (RQ)
// ----------------------------------------------------------------

/**
 * Computes the Ecological Risk Quotient (RQ).
 * Calcula o Quociente de Risco Ecologico (RQ).
 *
 * RQ = exposureConcentration / NOEC
 *
 * @param {Object} params - Input parameters
 * @param {number} params.exposureConcentration - Environmental exposure concentration (mg/L or mg/kg)
 * @param {number} params.NOEC - No-Observed-Effect Concentration (same units as exposure)
 * @param {string} [params.NOEC_source=''] - Source/reference for the NOEC value
 * @returns {Readonly<{RQ: number, classification: string, exposureConcentration: number, NOEC: number, NOEC_source: string}>}
 *
 * @throws {RangeError} If NOEC <= 0
 * @throws {TypeError} If exposureConcentration is not a finite non-negative number
 */
export function computeEcologicalRiskQuotient({
    exposureConcentration,
    NOEC,
    NOEC_source = '',
}: {
    exposureConcentration: number;
    NOEC: number;
    NOEC_source?: string;
}): Readonly<{
    RQ: number;
    classification: string;
    exposureConcentration: number;
    NOEC: number;
    NOEC_source: string;
}> {
    if (!Number.isFinite(NOEC) || NOEC <= 0) {
        throw new RangeError(`NOEC must be a positive finite number, got: ${NOEC}`);
    }
    if (!Number.isFinite(exposureConcentration) || exposureConcentration < 0) {
        throw new TypeError(
            `exposureConcentration must be a non-negative finite number, got: ${exposureConcentration}`,
        );
    }

    const RQ = exposureConcentration / NOEC;

    // Classification / Classificacao de risco ecologico
    let classification: string;
    if (RQ > 10) {
        classification = 'high_concern';
    } else if (RQ > 1) {
        classification = 'medium_concern';
    } else if (RQ > 0.1) {
        classification = 'low_concern';
    } else {
        classification = 'negligible';
    }

    return Object.freeze({
        RQ,
        classification,
        exposureConcentration,
        NOEC,
        NOEC_source,
    });
}
