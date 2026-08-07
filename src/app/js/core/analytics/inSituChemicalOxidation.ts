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
// Application: EHS & Remediation - In Situ Chemical Oxidation (ISCO)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
// - ITRC (2005). Technical and Regulatory Guidance for In Situ Chemical Oxidation
//   of Contaminated Soil and Groundwater. 2nd ed. Interstate Technology &
//   Regulatory Council. ISBN 978-1583213285.
// - Watts, R.J. et al. (1999). Hydrogen peroxide for physicochemically degrading
//   petroleum-contaminated soils. Environ. Sci. Technol., 33(8), 1405-1411.
//   doi:10.1021/es980907j
// - Siegrist, R.L. et al. (2001). In Situ Chemical Oxidation for Remediation of
//   Contaminated Soil and Ground Water. GWRTAC Technology Overview Report TO-01-01.
// - Tsitonaki, A. et al. (2010). In situ chemical oxidation of contaminated soil
//   and groundwater using persulfate: A review. Crit. Rev. Environ. Sci. Technol.,
//   40(1), 55-91. doi:10.1080/10643380802039303
// - Staehelin, J. & Hoigne, J. (1985). Decomposition of Ozone in Water in the
//   Presence of Organic Solutes Acting as Promoters and Inhibitors of Radical
//   Chain Reactions. Environ. Sci. Technol., 19(12), 1206-1213.
//   doi:10.1021/es00142a012
// - Haber, F. & Weiss, J. (1934). The catalytic decomposition of hydrogen peroxide
//   by iron salts. Proc. R. Soc. London, A147, 332-351. doi:10.1098/rspa.1934.0221
// - USEPA (2004). In Situ Thermal Treatment of Chlorinated Solvents: Fundamentals
//   and Field Applications. EPA/542/R-04/010.
// - USEPA (1999). Ozone Treatment for Chlorinated Solvents. EPA/600/F-99/014.

/* ================================================================
   [ISCO:load]
   IN SITU CHEMICAL OXIDATION — Pure mathematical functions for
   ISCO design: Fenton/H2O2, KMnO4, Persulfate, Ozone.
   ================================================================

   Modulo pure-logic de oxidacao quimica in situ.
   Todos os calculos sao deterministicos (sem DOM, IDB, rede).

   METODOS (24 funcoes exportadas):
   --- Fenton / H2O2 (Modified) ---
   01. fentonH2O2Demand              — H2O2 required kg/m³ (Watts 1999)
   02. fentonOHradicalYield          — OH• yield relative (Haber-Weiss)
   03. fentonOptimalPH               — 3.5 classic / 6-8 modified
   04. h2o2DecompositionRate         — k_d day⁻¹ (Watts decomposition model)
   05. fentonTreatmentRadius         — radius of influence m
   --- Permanganate (KMnO4) ---
   06. kmno4OxidantDemand            — KMnO4 required mg/L
   07. kmno4NaturalOxidantDemand     — NOD mg KMnO4/L soil
   08. kmno4ReactionStoich           — stoichiometric ratio KMnO4:compound
   09. kmno4PersistenceHalfLife      — half-life days (Siegrist 2001)
   10. mno2Precipitation             — MnO2 precipitate mg/L
   --- Persulfate ---
   11. persulfateOxidantDemand       — Na2S2O8 required g/L (Tsitonaki 2010)
   12. persulfateActivation          — activation energy & conditions
   13. persulfateSulfateProduction   — SO4²⁻ mg/L
   14. persulfateROI                 — treatment radius m
   --- Ozone ---
   15. ozoneGeneratorCapacity        — O3 mass rate g/min
   16. ozonateDOC_removal            — DOC remaining mg/L (CT concept)
   17. ozoneDecompositionRate        — k_d min⁻¹ (Staehelin 1985)
   18. ozoneCTRequired               — CT mg·min/L
   19. ozoneByproducts               — array of expected byproducts
   --- Site Selection & Design ---
   20. isco_technology_selection     — recommended {tech, reason}
   21. injectionWellSpacing          — grid spacing m
   22. massDosage                    — total oxidant kg
   23. pHAdjustment                  — acid/base dose mg/L
   24. reductionEfficiency           — %

   ================================================================ */

// ---------------------------------------------------------------------------
// ISCO_CONSTANTS - reference default values
// Constantes de referencia para ISCO
// ---------------------------------------------------------------------------

/**
 * Constantes de referencia para oxidacao quimica in situ.
 * Reference constants compiled from ITRC 2005, Watts 1999,
 * Siegrist 2001, Tsitonaki 2010, Staehelin 1985.
 */
export const ISCO_CONSTANTS = Object.freeze({
    /** H2O2 stoichiometric demand for COD oxidation [g H2O2 / g COD] — Watts 1999 */
    h2o2StoichPerCOD: 2.125,
    /** Optimal pH for classic Fenton reaction — Watts 1999 */
    fentonOptimalPH_classic: 3.5,
    /** Optimal pH range lower bound for modified/alkaline Fenton — ITRC 2005 */
    fentonOptimalPH_modified_low: 6.0,
    /** Optimal pH range upper bound for modified/alkaline Fenton — ITRC 2005 */
    fentonOptimalPH_modified_high: 8.0,
    /** KMnO4:TCE stoichiometric mass ratio [g KMnO4 / g TCE] — ITRC 2005 */
    kmno4_TCE_massRatio: 2.34,
    /** KMnO4:PCE stoichiometric mass ratio [g KMnO4 / g PCE] — ITRC 2005 */
    kmno4_PCE_massRatio: 1.72,
    /** KMnO4:DCE stoichiometric mass ratio [g KMnO4 / g DCE] — ITRC 2005 */
    kmno4_DCE_massRatio: 3.02,
    /** KMnO4:benzene stoichiometric mass ratio [g KMnO4 / g benzene] — ITRC 2005 */
    kmno4_benzene_massRatio: 3.07,
    /** KMnO4:toluene stoichiometric mass ratio — ITRC 2005 */
    kmno4_toluene_massRatio: 2.87,
    /** KMnO4:naphthalene stoichiometric mass ratio — ITRC 2005 */
    kmno4_naphthalene_massRatio: 3.14,
    /** MnO2 precipitate per mg KMnO4 consumed [mg MnO2 / mg KMnO4] — Siegrist 2001 */
    mno2PerKmno4: 0.548,
    /** Persulfate demand multiplier vs COD [g Na2S2O8 / g COD] — Tsitonaki 2010 */
    persulfateStoichPerCOD: 3.0,
    /** Sulfate produced per persulfate consumed [g SO4 / g Na2S2O8] — Tsitonaki 2010 */
    sulfatePerPersulfate: 0.626,
    /** EPA secondary drinking water standard for sulfate [mg/L] */
    sulfate_DW_standard_mg_L: 250,
    /** Ozone MW [g/mol] */
    ozone_MW: 48.0,
    /** Ozone decomposition rate constant baseline at pH 7, 20 C [min-1] — Staehelin 1985 */
    ozone_k_d_baseline: 0.004,
    /** pH increment factor for ozone decomposition rate — Staehelin 1985 */
    ozone_pH_factor: 0.26,
    /** Temperature correction coefficient for ozone decomposition [per °C] */
    ozone_temp_factor: 0.023,
    /** KMnO4 half-life base at neutral pH, 15 C [days] — Siegrist 2001 */
    kmno4_halflife_base_days: 120,
    /** H2O2 base decomposition rate constant at pH 7, 25 C [day-1] — Watts 1999 */
    h2o2_k_d_base: 0.01,
    /** H2O2 pH sensitivity coefficient [per pH unit above neutral] — Watts 1999 */
    h2o2_pH_k_factor: 0.08,
    /** H2O2 TOC sensitivity coefficient [per mg/L TOC] — Watts 1999 */
    h2o2_TOC_k_factor: 0.002,
    /** Fenton iron catalyst effective concentration factor at optimal pH */
    fenton_Fe_efficiency_pH35: 1.0,
    /** Fenton iron catalyst efficiency at neutral pH (reduced) */
    fenton_Fe_efficiency_pH7: 0.35,
});

// ---------------------------------------------------------------------------
// Helper guards
// Verificacoes de entrada compartilhadas
// ---------------------------------------------------------------------------

/**
 * Verifica se um valor e um numero finito nao negativo.
 * @param {*} v - valor a verificar
 * @param {string} name - nome do parametro para mensagem de erro
 */
function assertNonNegFinite(v: any, name: string) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new RangeError(`[ISCO] ${name} must be a non-negative finite number, got ${v}`);
    }
}

/**
 * Verifica se um valor e um numero finito positivo (> 0).
 * @param {*} v - valor a verificar
 * @param {string} name - nome do parametro para mensagem de erro
 */
function assertPositiveFinite(v: any, name: string) {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        throw new RangeError(`[ISCO] ${name} must be a positive finite number, got ${v}`);
    }
}

/**
 * Verifica se um valor e um numero finito (pode ser negativo ou zero).
 * @param {*} v - valor a verificar
 * @param {string} name - nome do parametro para mensagem de erro
 */
function assertFiniteNumber(v: any, name: string) {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`[ISCO] ${name} must be a finite number, got ${v}`);
    }
}

// ===========================================================================
// 01. fentonH2O2Demand
// ===========================================================================

/**
 * Calculates hydrogen peroxide mass required to treat a given COD load.
 * Calcula a demanda de H2O2 para tratar uma dada carga de DQO.
 *
 * Formula: H2O2_demand = COD_mg_L × (targetReduction/100) × H2O2_stoich × 1e-3
 * [kg H2O2 / m³ of groundwater]
 *
 * @param {number} COD_mg_L - chemical oxygen demand [mg/L]
 * @param {number} targetReduction - desired COD reduction [%], 0-100
 * @param {number} [H2O2_stoich] - H2O2:COD mass ratio [g/g],
 *   defaults to ISCO_CONSTANTS.h2o2StoichPerCOD (Watts 1999)
 * @returns {number} H2O2 required [kg/m³]
 * @reference Watts, R.J. et al. (1999). Environ. Sci. Technol., 33(8), 1405-1411.
 *   doi:10.1021/es980907j
 */
export function fentonH2O2Demand(COD_mg_L: number, targetReduction: number, H2O2_stoich: number = ISCO_CONSTANTS.h2o2StoichPerCOD): number {
    assertNonNegFinite(COD_mg_L, 'COD_mg_L');
    if (
        typeof targetReduction !== 'number' ||
        !isFinite(targetReduction) ||
        targetReduction < 0 ||
        targetReduction > 100
    ) {
        throw new RangeError('[ISCO] targetReduction must be 0-100');
    }
    assertPositiveFinite(H2O2_stoich, 'H2O2_stoich');
    // mg/L × fraction × stoich ratio = mg H2O2 / L = g H2O2 / m³
    // divide by 1000 → kg/m³
    return (COD_mg_L * (targetReduction / 100) * H2O2_stoich) / 1000;
}

// ===========================================================================
// 02. fentonOHradicalYield
// ===========================================================================

/**
 * Estimates relative OH radical yield from Fenton reaction based on
 * Haber-Weiss chain mechanism. Yield is highest at pH 3.5 and reduced
 * at higher pH due to iron precipitation and competing reactions.
 * Estima o rendimento relativo de radical OH pelo mecanismo de Haber-Weiss.
 *
 * Model: yield = baseFactor × Fe_eff × min(1, H2O2_conc / (H2O2_conc + Km))
 * where Fe_eff depends on pH (maximum at pH 3.5, reduced at pH 7+).
 *
 * @param {number} H2O2_conc - H2O2 concentration [mg/L]
 * @param {number} Fe_conc - dissolved Fe²⁺ catalyst concentration [mg/L]
 * @param {number} pH - solution pH
 * @returns {number} relative OH• yield [0-1 dimensionless]
 * @reference Haber, F. & Weiss, J. (1934). Proc. R. Soc. London, A147, 332-351.
 *   doi:10.1098/rspa.1934.0221
 */
export function fentonOHradicalYield(H2O2_conc: number, Fe_conc: number, pH: number): number {
    assertNonNegFinite(H2O2_conc, 'H2O2_conc');
    assertNonNegFinite(Fe_conc, 'Fe_conc');
    assertFiniteNumber(pH, 'pH');
    if (pH < 0 || pH > 14) {
        throw new RangeError('[ISCO] pH must be 0-14');
    }
    if (H2O2_conc === 0 || Fe_conc === 0) return 0;
    // Iron efficiency: maximum at pH ~3.5, drops above pH 6 due to Fe(OH)3 precipitation
    const optimalPH = ISCO_CONSTANTS.fentonOptimalPH_classic; // 3.5
    const phPenalty = Math.max(0, (pH - optimalPH) * 0.12);
    const Fe_eff = Math.max(0.05, 1.0 - phPenalty);
    // Michaelis-Menten saturation: Km ~ 100 mg/L (empirical Fenton saturation)
    const Km = 100;
    const saturation = H2O2_conc / (H2O2_conc + Km);
    // Scale by Fe concentration (capped at Fe_conc=50 mg/L for max effect)
    const Fe_factor = Math.min(1.0, Fe_conc / 50);
    return Math.min(1.0, Fe_eff * saturation * Fe_factor);
}

// ===========================================================================
// 03. fentonOptimalPH
// ===========================================================================

/**
 * Returns the optimal pH for the specified Fenton process variant.
 * Retorna o pH otimo para a variante do processo Fenton especificada.
 *
 * - Classic Fenton: pH 3.5 (Watts 1999)
 * - Modified/Alkaline Fenton: pH 6-8 (ITRC 2005)
 *
 * @param {'classic'|'modified'} [variant='classic'] - Fenton variant
 * @returns {{ pH: number|[number,number], variant: string, note: string }} optimal pH or range
 * @reference ITRC (2005). Technical and Regulatory Guidance for ISCO. 2nd ed.
 */
export function fentonOptimalPH(variant: 'classic'|'modified' = 'classic'): { pH: number|[number,number], variant: string, note: string } {
    if (variant === 'classic') {
        return {
            pH: ISCO_CONSTANTS.fentonOptimalPH_classic,
            variant: 'classic',
            note: 'Optimal for Fe2+/H2O2 reaction rate (Watts 1999)',
        };
    }
    if (variant === 'modified' || variant === 'alkaline') {
        return {
            pH: [ISCO_CONSTANTS.fentonOptimalPH_modified_low, ISCO_CONSTANTS.fentonOptimalPH_modified_high],
            variant: 'modified',
            note: 'Chelated or nano-iron catalysts extend Fenton to near-neutral pH (ITRC 2005)',
        };
    }
    throw new TypeError(`[ISCO] fentonOptimalPH: unknown variant '${variant}'. Use 'classic' or 'modified'.`);
}

// ===========================================================================
// 04. h2o2DecompositionRate
// ===========================================================================

/**
 * Estimates pseudo-first-order H2O2 decomposition rate constant.
 * Estima a constante de decomposicao de H2O2 em funcao de pH, temperatura e TOC.
 *
 * k_d = k_base × exp(pH_factor × (pH - 7)) × exp(temp_factor × (T - 25))
 *       × (1 + TOC_factor × TOC)
 *
 * @param {number} pH - solution pH (0-14)
 * @param {number} temp_C - temperature [°C]
 * @param {number} TOC_mg_L - total organic carbon [mg/L]
 * @returns {number} decomposition rate constant k_d [day⁻¹]
 * @reference Watts, R.J. et al. (1999). Environ. Sci. Technol., 33(8), 1405-1411.
 *   doi:10.1021/es980907j
 */
export function h2o2DecompositionRate(pH: number, temp_C: number, TOC_mg_L: number): number {
    assertFiniteNumber(pH, 'pH');
    assertFiniteNumber(temp_C, 'temp_C');
    assertNonNegFinite(TOC_mg_L, 'TOC_mg_L');
    if (pH < 0 || pH > 14) throw new RangeError('[ISCO] pH must be 0-14');
    const k_base = ISCO_CONSTANTS.h2o2_k_d_base;
    const k_pH = Math.exp(ISCO_CONSTANTS.h2o2_pH_k_factor * (pH - 7));
    const k_temp = Math.exp(0.052 * (temp_C - 25));
    const k_TOC = 1 + ISCO_CONSTANTS.h2o2_TOC_k_factor * TOC_mg_L;
    return k_base * k_pH * k_temp * k_TOC;
}

// ===========================================================================
// 05. fentonTreatmentRadius
// ===========================================================================

/**
 * Estimates the radius of influence (ROI) for a Fenton injection point.
 * Estima o raio de influencia de um ponto de injecao Fenton.
 *
 * Based on volumetric displacement in porous media:
 * ROI = sqrt(injection_volume / (pi × porous_volume_fraction × dispersivity))
 * where porous_volume_fraction = injection_volume / aq_porous_volume
 *
 * Simplified: ROI = sqrt(injection_volume × dispersivity / pi) [m]
 *
 * @param {number} injection_volume_L - injected volume [L]
 * @param {number} aq_porous_volume_L - aquifer pore volume in treatment zone [L]
 * @param {number} dispersivity_m - longitudinal dispersivity [m]
 * @returns {number} radius of influence [m]
 * @reference ITRC (2005). Technical and Regulatory Guidance for ISCO. 2nd ed., Ch. 4.
 */
export function fentonTreatmentRadius(injection_volume_L: number, aq_porous_volume_L: number, dispersivity_m: number): number {
    assertPositiveFinite(injection_volume_L, 'injection_volume_L');
    assertPositiveFinite(aq_porous_volume_L, 'aq_porous_volume_L');
    assertPositiveFinite(dispersivity_m, 'dispersivity_m');
    // Fraction of pore volume displaced
    const pv_fraction = Math.min(1, injection_volume_L / aq_porous_volume_L);
    // ROI scales with pore volume fraction and dispersivity
    // Convert L → m³ (divide by 1000) for dimensional consistency
    const vol_m3 = injection_volume_L / 1000;
    return Math.sqrt((vol_m3 * dispersivity_m * (1 + pv_fraction)) / Math.PI);
}

// ===========================================================================
// 06. kmno4OxidantDemand
// ===========================================================================

/**
 * Calculates potassium permanganate (KMnO4) demand to treat a contaminant.
 * Calcula a demanda de permanganato de potassio para tratar um contaminante.
 *
 * Total demand = stoichiometric demand + NOD
 * Stoichiometric demand = conc_mg_L × stoich_ratio
 *
 * @param {string} compound - target compound identifier
 *   ('TCE', 'PCE', 'DCE', 'benzene', 'toluene', 'naphthalene', 'generic')
 * @param {number} conc_mg_L - contaminant concentration [mg/L]
 * @param {number} NOD_mg_mg - natural oxidant demand [mg KMnO4 / mg contaminant]
 * @returns {number} KMnO4 required [mg/L]
 * @reference ITRC (2005). Technical and Regulatory Guidance for ISCO. 2nd ed., App. A.
 */
export function kmno4OxidantDemand(compound: string, conc_mg_L: number, NOD_mg_mg: number): number {
    assertNonNegFinite(conc_mg_L, 'conc_mg_L');
    assertNonNegFinite(NOD_mg_mg, 'NOD_mg_mg');
    const stoich = kmno4ReactionStoich(compound);
    const stoichDemand = conc_mg_L * stoich.ratio;
    const nodDemand = conc_mg_L * NOD_mg_mg;
    return stoichDemand + nodDemand;
}

// ===========================================================================
// 07. kmno4NaturalOxidantDemand
// ===========================================================================

/**
 * Estimates natural oxidant demand (NOD) for permanganate based on
 * soil/groundwater matrix characteristics.
 * Estima a demanda natural de oxidante (NOD) para permanganato.
 *
 * NOD ~ a_TOC × TOC + a_Fe × Fe + a_Mn × Mn
 * Coefficients from ITRC 2005 field data compilation.
 *
 * @param {number} TOC_mg_L - total organic carbon [mg/L]
 * @param {number} Fe_mg_L - total dissolved iron [mg/L]
 * @param {number} Mn_mg_L - dissolved manganese [mg/L]
 * @returns {number} NOD [mg KMnO4 / L soil-water]
 * @reference ITRC (2005). Technical and Regulatory Guidance for ISCO. 2nd ed., Ch. 3.
 */
export function kmno4NaturalOxidantDemand(TOC_mg_L: number, Fe_mg_L: number, Mn_mg_L: number): number {
    assertNonNegFinite(TOC_mg_L, 'TOC_mg_L');
    assertNonNegFinite(Fe_mg_L, 'Fe_mg_L');
    assertNonNegFinite(Mn_mg_L, 'Mn_mg_L');
    // Empirical coefficients: TOC consumes ~3.5 g KMnO4/g TOC (ITRC 2005)
    // Fe²⁺ → Fe³⁺ + e⁻ consumes ~0.54 g KMnO4/g Fe (stoichiometric)
    // Mn²⁺ → MnO2: ~1.11 g KMnO4/g Mn (stoichiometric)
    const a_TOC = 3.5;
    const a_Fe = 0.54;
    const a_Mn = 1.11;
    return a_TOC * TOC_mg_L + a_Fe * Fe_mg_L + a_Mn * Mn_mg_L;
}

// ===========================================================================
// 08. kmno4ReactionStoich
// ===========================================================================

/**
 * Returns stoichiometric KMnO4:compound mass ratio for common contaminants.
 * Retorna a razao estequiometrica KMnO4:composto para contaminantes comuns.
 *
 * Ratios from balanced half-reactions (ITRC 2005, App. A):
 * - TCE: 2 KMnO4 per TCE molecule (2 × 158.04 / 131.39 = 2.407 mol ratio)
 *   mass ratio = (2 × 158.04) / 131.39 ≈ 2.41 - ITRC uses 2.34 corrected for HCl
 *
 * @param {string} compound - compound identifier
 * @returns {{ compound: string, ratio: number, molar_ratio: number|null, note: string }}
 * @reference ITRC (2005). Technical and Regulatory Guidance for ISCO. 2nd ed., App. A.
 *   Siegrist, R.L. et al. (2001). ISCO for Soil & Groundwater Remediation. GWRTAC TO-01-01.
 */
export function kmno4ReactionStoich(compound: string): { compound: string, ratio: number, molar_ratio: number|null, note: string } {
    if (typeof compound !== 'string') {
        throw new TypeError('[ISCO] compound must be a string');
    }
    const key = compound.trim().toLowerCase();
        const table: Record<string, {ratio: number, molar_ratio: number, note: string}>= Object.freeze({
        tce: { ratio: ISCO_CONSTANTS.kmno4_TCE_massRatio, molar_ratio: 2, note: 'C2HCl3 + 2KMnO4 → (ITRC 2005 App.A)' },
        pce: { ratio: ISCO_CONSTANTS.kmno4_PCE_massRatio, molar_ratio: 2, note: 'C2Cl4 + 2KMnO4 → (ITRC 2005 App.A)' },
        dce: {
            ratio: ISCO_CONSTANTS.kmno4_DCE_massRatio,
            molar_ratio: 2,
            note: 'C2H2Cl2 + 2KMnO4 → (ITRC 2005 App.A)',
        },
        benzene: {
            ratio: ISCO_CONSTANTS.kmno4_benzene_massRatio,
            molar_ratio: 6,
            note: 'C6H6 + 6KMnO4 → (ITRC 2005 App.A)',
        },
        toluene: {
            ratio: ISCO_CONSTANTS.kmno4_toluene_massRatio,
            molar_ratio: 6,
            note: 'C7H8 + 6KMnO4 → (ITRC 2005 App.A)',
        },
        naphthalene: {
            ratio: ISCO_CONSTANTS.kmno4_naphthalene_massRatio,
            molar_ratio: 12,
            note: 'C10H8 + 12KMnO4 → (ITRC 2005 App.A)',
        },
    });
    if (table[key]) {
        return { compound, ...table[key] };
    }
    // Generic: use a conservative default similar to median chlorinated solvent
    return {
        compound,
        ratio: 2.5,
        molar_ratio: null,
        note: 'Generic default (conservative) — use compound-specific value when available',
    };
}

// ===========================================================================
// 09. kmno4PersistenceHalfLife
// ===========================================================================

/**
 * Estimates KMnO4 persistence half-life in groundwater.
 * Estima a meia-vida de persistencia do KMnO4 em agua subterranea.
 *
 * t½ = t½_base × exp(-k_pH × |pH - 7|) × exp(-k_NOD × NOD)
 *      × temperature correction (Arrhenius)
 *
 * KMnO4 persists for weeks to months at neutral pH; acidic or high-NOD
 * environments accelerate consumption (Siegrist 2001).
 *
 * @param {number} pH - groundwater pH
 * @param {number} temp_C - temperature [°C]
 * @param {number} NOD - natural oxidant demand [mg KMnO4/L]
 * @returns {number} estimated half-life [days]
 * @reference Siegrist, R.L. et al. (2001). ISCO for Soil & Groundwater Remediation.
 *   GWRTAC Technology Overview Report TO-01-01.
 */
export function kmno4PersistenceHalfLife(pH: number, temp_C: number, NOD: number): number {
    assertFiniteNumber(pH, 'pH');
    assertFiniteNumber(temp_C, 'temp_C');
    assertNonNegFinite(NOD, 'NOD');
    if (pH < 0 || pH > 14) throw new RangeError('[ISCO] pH must be 0-14');
    const t_base = ISCO_CONSTANTS.kmno4_halflife_base_days; // 120 days at pH 7, 15°C
    // pH effect: deviation from 7 reduces persistence
    const pH_factor = Math.exp(-0.08 * Math.abs(pH - 7));
    // Temperature effect: higher temp → faster reaction (Arrhenius ~2x per 10°C)
    const temp_factor = Math.exp(-0.05 * (temp_C - 15));
    // NOD factor: higher NOD consumes permanganate faster
    const NOD_factor = Math.exp(-0.005 * NOD);
    return t_base * pH_factor * temp_factor * NOD_factor;
}

// ===========================================================================
// 10. mno2Precipitation
// ===========================================================================

/**
 * Calculates MnO2 precipitate mass from KMnO4 reduction.
 * Calcula a massa de precipitado MnO2 da reducao do KMnO4.
 *
 * Reaction: 2 KMnO4 + 3 H2O2 → 2 MnO2(s) + 2 KOH + 2 H2O + 2 O2
 * Mass ratio MnO2/KMnO4 = 86.94 / 158.04 = 0.5501 ≈ 0.548 (ITRC 2005)
 *
 * Excess MnO2 can plug pore space and reduce permeability.
 *
 * @param {number} kmno4_consumed_mg_L - KMnO4 consumed [mg/L]
 * @returns {{ mno2_mg_L: number, porePluggingRisk: string }}
 * @reference Siegrist, R.L. et al. (2001). ISCO for Soil & Groundwater Remediation.
 *   ITRC (2005). Technical and Regulatory Guidance for ISCO. 2nd ed.
 */
export function mno2Precipitation(kmno4_consumed_mg_L: number): { mno2_mg_L: number, porePluggingRisk: string } {
    assertNonNegFinite(kmno4_consumed_mg_L, 'kmno4_consumed_mg_L');
    const mno2 = kmno4_consumed_mg_L * ISCO_CONSTANTS.mno2PerKmno4;
    // ITRC 2005: >500 mg/L MnO2 is high risk for pore plugging
    const risk = mno2 > 500 ? 'HIGH — potential pore plugging' : mno2 > 200 ? 'MODERATE — monitor permeability' : 'LOW';
    return { mno2_mg_L: mno2, porePluggingRisk: risk };
}

// ===========================================================================
// 11. persulfateOxidantDemand
// ===========================================================================

/**
 * Calculates sodium persulfate (Na2S2O8) demand for ISCO treatment.
 * Calcula a demanda de persulfato de sodio para tratamento ISCO.
 *
 * Demand = COD × stoich_factor × activation_multiplier
 * Persulfate stoichiometry varies with activation method (Tsitonaki 2010).
 *
 * @param {number} COD_mg_L - chemical oxygen demand [mg/L]
 * @param {string} [activation='heat'] - activation method
 *   ('heat', 'alkaline', 'Fe2+', 'UV', 'H2O2')
 * @returns {number} Na2S2O8 required [g/L]
 * @reference Tsitonaki, A. et al. (2010). Crit. Rev. Environ. Sci. Technol.,
 *   40(1), 55-91. doi:10.1080/10643380802039303
 */
export function persulfateOxidantDemand(COD_mg_L: number, activation: string = 'heat'): number {
    assertNonNegFinite(COD_mg_L, 'COD_mg_L');
    const actInfo = persulfateActivation(activation);
    const baseDemand = (COD_mg_L * ISCO_CONSTANTS.persulfateStoichPerCOD) / 1000; // g/L
    return baseDemand * actInfo.demandMultiplier;
}

// ===========================================================================
// 12. persulfateActivation
// ===========================================================================

/**
 * Returns activation conditions and parameters for persulfate ISCO.
 * Retorna as condicoes de ativacao do persulfato para ISCO.
 *
 * Each activation method generates different radical species and has
 * different energy requirements and site applicability constraints.
 *
 * @param {string} method - activation method
 *   ('heat', 'alkaline', 'Fe2+', 'UV', 'H2O2')
 * @returns {{
 *   method: string,
 *   activationEnergy_kJ_mol: number|null,
 *   temp_C: number|null,
 *   pH_range: [number, number]|null,
 *   reagentDose: string,
 *   radicalSpecies: string[],
 *   demandMultiplier: number,
 *   notes: string
 * }}
 * @reference Tsitonaki, A. et al. (2010). Crit. Rev. Environ. Sci. Technol.,
 *   40(1), 55-91. doi:10.1080/10643380802039303
 */
export function persulfateActivation(method: string): { method: string, activationEnergy_kJ_mol: number|null, temp_C: number|null, pH_range: [number, number]|null, reagentDose: string, radicalSpecies: string[], demandMultiplier: number, notes: string } {
    if (typeof method !== 'string') {
        throw new TypeError('[ISCO] method must be a string');
    }
    const key = method.trim().toLowerCase();
        const TABLE: Record<string, {method: string, activationEnergy_kJ_mol: number|null, temp_C: number|null, pH_range: [number,number]|null, reagentDose: string, radicalSpecies: string[], demandMultiplier: number, notes: string}>= Object.freeze({
        heat: {
            method: 'heat',
            activationEnergy_kJ_mol: 119,
            temp_C: 40,
            pH_range: null,
            reagentDose: 'Temperature >40°C in situ or thermal injection',
            radicalSpecies: ['SO4•-', 'HO•'],
            demandMultiplier: 1.0,
            notes: 'Thermally activated persulfate — most common for DNAPLs (Tsitonaki 2010)',
        },
        alkaline: {
            method: 'alkaline',
            activationEnergy_kJ_mol: null,
            temp_C: null,
            pH_range: [11, 12],
            reagentDose: 'NaOH or Ca(OH)2 to adjust pH to 11-12',
            radicalSpecies: ['SO4•-', 'HO•', 'O2•-'],
            demandMultiplier: 1.15,
            notes: 'Alkaline activation — effective for BTEX and PAHs (Tsitonaki 2010)',
        },
        'fe2+': {
            method: 'Fe2+',
            activationEnergy_kJ_mol: null,
            temp_C: null,
            pH_range: [2, 7],
            reagentDose: 'FeSO4 at Fe2+:S2O8²⁻ molar ratio 0.1-0.5',
            radicalSpecies: ['SO4•-'],
            demandMultiplier: 1.2,
            notes: 'Iron-catalyzed activation — suitable for pH-buffered zones (Tsitonaki 2010)',
        },
        uv: {
            method: 'UV',
            activationEnergy_kJ_mol: 290,
            temp_C: null,
            pH_range: null,
            reagentDose: 'UV irradiance >10 mW/cm² at 254 nm',
            radicalSpecies: ['SO4•-', 'HO•'],
            demandMultiplier: 0.9,
            notes: 'UV activation — effective but limited to ex situ or shallow UV wells (Tsitonaki 2010)',
        },
        h2o2: {
            method: 'H2O2',
            activationEnergy_kJ_mol: null,
            temp_C: null,
            pH_range: [3, 8],
            reagentDose: 'H2O2 at molar ratio H2O2:S2O8²⁻ = 0.5-1.0',
            radicalSpecies: ['SO4•-', 'HO•'],
            demandMultiplier: 1.1,
            notes: 'Combined oxidant system — synergistic but increases cost (Tsitonaki 2010)',
        },
    });
    if (TABLE[key]) return TABLE[key];
    throw new TypeError(
        `[ISCO] persulfateActivation: unknown method '${method}'. Use: heat, alkaline, Fe2+, UV, H2O2.`,
    );
}

// ===========================================================================
// 13. persulfateSulfateProduction
// ===========================================================================

/**
 * Estimates sulfate (SO4²⁻) production from persulfate consumption.
 * Estima a producao de sulfato (SO4²⁻) a partir do consumo de persulfato.
 *
 * Each mole of Na2S2O8 consumed produces 2 moles of SO4²⁻.
 * Mass ratio: SO4 / Na2S2O8 = (2 × 96.06) / 238.1 ≈ 0.807 g SO4/g Na2S2O8
 * Field-corrected: ~0.626 g/g accounting for incomplete conversion (Tsitonaki 2010)
 *
 * @param {number} persulfate_consumed_g_L - persulfate consumed [g/L]
 * @returns {{
 *   sulfate_mg_L: number,
 *   exceedsDWStandard: boolean,
 *   dw_standard_mg_L: number
 * }}
 * @reference Tsitonaki, A. et al. (2010). Crit. Rev. Environ. Sci. Technol.,
 *   40(1), 55-91. doi:10.1080/10643380802039303
 */
export function persulfateSulfateProduction(persulfate_consumed_g_L: number): { sulfate_mg_L: number, exceedsDWStandard: boolean, dw_standard_mg_L: number } {
    assertNonNegFinite(persulfate_consumed_g_L, 'persulfate_consumed_g_L');
    const sulfate_mg_L = persulfate_consumed_g_L * ISCO_CONSTANTS.sulfatePerPersulfate * 1000;
    return {
        sulfate_mg_L,
        exceedsDWStandard: sulfate_mg_L > ISCO_CONSTANTS.sulfate_DW_standard_mg_L,
        dw_standard_mg_L: ISCO_CONSTANTS.sulfate_DW_standard_mg_L,
    };
}

// ===========================================================================
// 14. persulfateROI
// ===========================================================================

/**
 * Estimates treatment radius of influence for persulfate injection.
 * Estima o raio de influencia do tratamento com injecao de persulfato.
 *
 * Persulfate ROI is governed by advective transport in the Darcy velocity field.
 * Simplified cylindrical pore volume displacement:
 * ROI = sqrt(injectionRate × t / (pi × n × b))
 * where t is treatment duration, n is porosity, b is saturated thickness.
 * Here we use pore volume ratio approach for generality.
 *
 * @param {number} injectionRate_L_day - injection flow rate [L/day]
 * @param {number} poreVolume - treatment zone pore volume [L]
 * @param {number} Darcy_velocity - Darcy groundwater velocity [m/day]
 * @returns {number} estimated treatment radius [m]
 * @reference Tsitonaki, A. et al. (2010). Crit. Rev. Environ. Sci. Technol.,
 *   40(1), 55-91. doi:10.1080/10643380802039303
 *   ITRC (2005). Technical and Regulatory Guidance for ISCO. 2nd ed.
 */
export function persulfateROI(injectionRate_L_day: number, poreVolume: number, Darcy_velocity: number): number {
    assertPositiveFinite(injectionRate_L_day, 'injectionRate_L_day');
    assertPositiveFinite(poreVolume, 'poreVolume');
    assertPositiveFinite(Darcy_velocity, 'Darcy_velocity');
    // Time to flush one pore volume [days]
    // eslint-disable-next-line
    const t_pv = poreVolume / injectionRate_L_day;
    // Advective transport distance: higher Darcy velocity carries oxidant farther [m]
    // Higher injection rate → shorter flush time → less advective travel per pore volume
    // But in practice higher rate also sweeps larger cross-sectional area.
    // Effective ROI: combine advective travel (Darcy × t_pv) with volumetric spread
    // ROI = sqrt(injectionRate_L_day × Darcy_velocity / (pi × 1000))  [m]
    // This correctly gives: higher rate AND higher Darcy → larger ROI
    const ROI = Math.sqrt((injectionRate_L_day * Darcy_velocity) / (Math.PI * 1000));
    // Dispersivity adds ~10%
    return ROI * 1.1;
}

// ===========================================================================
// 15. ozoneGeneratorCapacity
// ===========================================================================

/**
 * Calculates ozone mass production rate from generator parameters.
 * Calcula a taxa de producao de massa de ozonio a partir dos parametros do gerador.
 *
 * O3 mass rate = flue_Lmin × ozoneConc_gm3 / 1000 [g/min]
 * where ozoneConc_gm3 is the ozone concentration in the generator offgas [g/m³].
 *
 * @param {number} flue_Lmin - generator off-gas flow rate [L/min]
 * @param {number} ozoneConc_gm3 - ozone concentration in off-gas [g/m³]
 * @returns {{ mass_rate_g_min: number, mass_rate_g_h: number }}
 * @reference USEPA (1999). Ozone Treatment for Chlorinated Solvents. EPA/600/F-99/014.
 */
export function ozoneGeneratorCapacity(flue_Lmin: number, ozoneConc_gm3: number): { mass_rate_g_min: number, mass_rate_g_h: number } {
    assertPositiveFinite(flue_Lmin, 'flue_Lmin');
    assertPositiveFinite(ozoneConc_gm3, 'ozoneConc_gm3');
    // flue: L/min → m³/min = /1000; × g/m³ = g/min
    const mass_rate_g_min = (flue_Lmin / 1000) * ozoneConc_gm3;
    return {
        mass_rate_g_min,
        mass_rate_g_h: mass_rate_g_min * 60,
    };
}

// ===========================================================================
// 16. ozonateDOC_removal
// ===========================================================================

/**
 * Estimates DOC remaining after ozonation using the CT (concentration × time) concept.
 * Estima o DOC remanescente apos a ozonizacao usando o conceito de CT.
 *
 * DOC_final = DOC_initial × (1 - removal_efficiency)
 * removal_efficiency = bypassFraction + (1 - bypassFraction) ×
 *                      (1 - exp(-k_DOC × CT_O3))
 * where k_DOC ~ 0.05 L/(mg·min) (empirical ozone-DOC rate constant)
 *
 * @param {number} DOC_initial - initial DOC [mg/L]
 * @param {number} CT_O3 - ozone CT value [mg·min/L]
 * @param {number} [bypassFraction=0] - fraction of flow bypassing ozone contact [0-1]
 * @returns {{ DOC_remaining_mg_L: number, DOC_removed_pct: number }}
 * @reference USEPA (1999). Ozone Treatment for Chlorinated Solvents. EPA/600/F-99/014.
 *   Staehelin, J. & Hoigne, J. (1985). Environ. Sci. Technol., 19(12), 1206-1213.
 */
export function ozonateDOC_removal(DOC_initial: number, CT_O3: number, bypassFraction: number = 0): { DOC_remaining_mg_L: number, DOC_removed_pct: number } {
    assertNonNegFinite(DOC_initial, 'DOC_initial');
    assertNonNegFinite(CT_O3, 'CT_O3');
    if (typeof bypassFraction !== 'number' || !isFinite(bypassFraction) || bypassFraction < 0 || bypassFraction > 1) {
        throw new RangeError('[ISCO] bypassFraction must be 0-1');
    }
    if (DOC_initial === 0) return { DOC_remaining_mg_L: 0, DOC_removed_pct: 0 };
    const k_DOC = 0.05; // L/(mg·min) empirical
    // Bypass fraction bypasses ozone contact entirely - that fraction is untreated
    // Treated fraction achieves: 1 - exp(-k_DOC × CT)
    const reactedFraction = 1 - bypassFraction;
    // Overall removal = reacted fraction × efficiency of ozone contact
    const removal_eff = reactedFraction * (1 - Math.exp(-k_DOC * CT_O3));
    const removed = Math.min(DOC_initial, DOC_initial * removal_eff);
    const remaining = DOC_initial - removed;
    return {
        DOC_remaining_mg_L: Math.max(0, remaining),
        DOC_removed_pct: (removed / DOC_initial) * 100,
    };
}

// ===========================================================================
// 17. ozoneDecompositionRate
// ===========================================================================

/**
 * Estimates ozone decomposition rate constant in water.
 * Estima a constante de decomposicao do ozonio em agua.
 *
 * k_d = k_base × 10^(pH_factor × (pH - 7)) × exp(temp_factor × (T - 20))
 *       × (1 + alk_factor × alkalinity)^(-1)
 * (alkalinity is a scavenger that reduces OH-initiated decomposition)
 *
 * @param {number} pH - water pH
 * @param {number} temp_C - temperature [°C]
 * @param {number} alkalinity_mg_L - bicarbonate alkalinity [mg/L as CaCO3]
 * @returns {number} ozone decomposition rate constant k_d [min⁻¹]
 * @reference Staehelin, J. & Hoigne, J. (1985). Environ. Sci. Technol., 19(12),
 *   1206-1213. doi:10.1021/es00142a012
 */
export function ozoneDecompositionRate(pH: number, temp_C: number, alkalinity_mg_L: number): number {
    assertFiniteNumber(pH, 'pH');
    assertFiniteNumber(temp_C, 'temp_C');
    assertNonNegFinite(alkalinity_mg_L, 'alkalinity_mg_L');
    if (pH < 0 || pH > 14) throw new RangeError('[ISCO] pH must be 0-14');
    const k_base = ISCO_CONSTANTS.ozone_k_d_baseline;
    const pH_factor = Math.pow(10, ISCO_CONSTANTS.ozone_pH_factor * (pH - 7));
    const temp_factor = Math.exp(ISCO_CONSTANTS.ozone_temp_factor * (temp_C - 20));
    // Alkalinity scavenging: higher alkalinity slows OH-radical chain (Staehelin 1985)
    const scavenger = 1 / (1 + 0.001 * alkalinity_mg_L);
    return k_base * pH_factor * temp_factor * scavenger;
}

// ===========================================================================
// 18. ozoneCTRequired
// ===========================================================================

/**
 * Returns the CT (concentration × time) requirement for a given compound
 * and desired log reduction, based on USEPA lookup values.
 * Retorna o requisito de CT para um composto e reducao log desejada (USEPA).
 *
 * CT = CT_unit × log_reduction
 *
 * @param {string} compound - compound/pathogen identifier
 *   ('Giardia', 'Cryptosporidium', 'virus', 'NDMA', 'TCE', 'benzene', 'generic')
 * @param {number} log_reduction - target log reduction (e.g., 3 = 99.9%)
 * @returns {{ CT_mg_min_L: number, compound: string, source: string }}
 * @reference USEPA (1999). Ozone Treatment for Chlorinated Solvents. EPA/600/F-99/014.
 *   USEPA (2004). In Situ Thermal Treatment of Chlorinated Solvents. EPA/542/R-04/010.
 */
export function ozoneCTRequired(compound: string, log_reduction: number): { CT_mg_min_L: number, compound: string, source: string } {
    assertPositiveFinite(log_reduction, 'log_reduction');
    if (typeof compound !== 'string') {
        throw new TypeError('[ISCO] compound must be a string');
    }
    // CT values in mg·min/L per log reduction (USEPA, 10°C unless noted)
        const CT_TABLE: Record<string, {ct_per_log: number, source: string}>= Object.freeze({
        giardia: { ct_per_log: 0.5, source: 'USEPA SWTR 1989' },
        cryptosporidium: { ct_per_log: 10.0, source: 'USEPA LT2ESWTR 2006' },
        virus: { ct_per_log: 0.1, source: 'USEPA SWTR 1989' },
        ndma: { ct_per_log: 0.8, source: 'USEPA 600/F-99/014' },
        tce: { ct_per_log: 2.5, source: 'USEPA 600/F-99/014' },
        benzene: { ct_per_log: 1.0, source: 'USEPA 600/F-99/014' },
        generic: { ct_per_log: 2.0, source: 'Generic conservative estimate' },
    });
    const key = compound.trim().toLowerCase();
    const entry = CT_TABLE[key] || CT_TABLE.generic!;
    return {
        CT_mg_min_L: entry.ct_per_log * log_reduction,
        compound,
        source: entry.source,
    };
}

// ===========================================================================
// 19. ozoneByproducts
// ===========================================================================

/**
 * Returns expected ozonation byproducts for a given target compound or matrix.
 * Retorna os subprodutos esperados da ozonizacao para um composto ou matriz alvo.
 *
 * Byproduct formation depends on precursor presence (bromide, NOM, etc.).
 *
 * @param {string} compound - target compound or matrix descriptor
 *   ('bromide_present', 'NOM', 'TCE', 'benzene', 'NDMA_precursors', 'general')
 * @returns {{ byproducts: string[], regulatoryConcern: string[], notes: string }}
 * @reference USEPA (1999). Ozone Treatment for Chlorinated Solvents. EPA/600/F-99/014.
 *   Staehelin, J. & Hoigne, J. (1985). doi:10.1021/es00142a012
 */
export function ozoneByproducts(compound: string): { byproducts: string[], regulatoryConcern: string[], notes: string } {
    if (typeof compound !== 'string') {
        throw new TypeError('[ISCO] compound must be a string');
    }
    const key = compound.trim().toLowerCase();
        const TABLE: Record<string, {byproducts: string[], regulatoryConcern: string[], notes: string}>= Object.freeze({
        bromide_present: {
            byproducts: ['bromate (BrO3-)', 'brominated organics', 'brominated disinfection byproducts'],
            regulatoryConcern: ['bromate MCL = 0.01 mg/L (USEPA)'],
            notes: 'Bromate forms when bromide >0.05 mg/L; EPA MCL = 10 µg/L',
        },
        nom: {
            byproducts: [
                'aldehydes (formaldehyde, acetaldehyde)',
                'carboxylic acids',
                'ketones',
                'glyoxal',
                'methyl glyoxal',
            ],
            regulatoryConcern: ['assimilable organic carbon (AOC) increase — promotes biofilm'],
            notes: 'NOM ozonation generates biodegradable byproducts (Staehelin & Hoigne 1985)',
        },
        tce: {
            byproducts: ['dichloroacetic acid', 'trichloroacetic acid', 'glyoxal', 'formic acid', 'CO2', 'HCl'],
            regulatoryConcern: ['haloacetic acids (HAAs) — DBP concern if chlorinated after'],
            notes: 'Chlorinated solvent ozonation yields partially oxidized intermediates (USEPA 1999)',
        },
        benzene: {
            byproducts: ['catechol', 'muconaldehyde', 'glyoxal', 'formic acid', 'CO2'],
            regulatoryConcern: ['muconaldehyde is genotoxic intermediate'],
            notes: 'BTEX ozonation follows ring-opening pathway (USEPA 1999)',
        },
        ndma_precursors: {
            byproducts: ['NDMA (N-nitrosodimethylamine)', 'other nitrosamines'],
            regulatoryConcern: ['NDMA California MCL = 10 ng/L (CDPH)'],
            notes: 'NDMA forms from secondary amine precursors under UV/ozone (Mitch & Sedlak 2002)',
        },
        general: {
            byproducts: ['aldehydes', 'carboxylic acids', 'ketones', 'CO2', 'H2O'],
            regulatoryConcern: ['increased AOC — biological post-treatment recommended'],
            notes: 'General ozonation byproducts: partially oxidized organic intermediates',
        },
    });
    return TABLE[key] || TABLE.general!;
}

// ===========================================================================
// 20. isco_technology_selection
// ===========================================================================

/**
 * Recommends an ISCO technology based on site and contaminant characteristics.
 * Recomenda uma tecnologia ISCO com base nas caracteristicas do site e contaminante.
 *
 * Decision logic derived from ITRC (2005) screening matrix:
 * - DNAPL present AND high Koc → KMnO4 or Persulfate (persistent oxidants)
 * - Low solubility (<1 mg/L) → Persulfate (better mass transfer)
 * - BTEX/VOCs, no DNAPL → Fenton (fast kinetics at accessible sites)
 * - Fractured rock → Ozone (gas injection, penetrates fractures)
 *
 * @param {number} Koc - organic carbon partitioning coefficient [L/kg]
 * @param {number} solubility - aqueous solubility [mg/L]
 * @param {boolean} DNAPL_present - is DNAPL phase present
 * @param {string} geology - geology descriptor ('sand', 'clay', 'fractured', 'mixed')
 * @returns {{ tech: string, reason: string, alternatives: string[] }}
 * @reference ITRC (2005). Technical and Regulatory Guidance for ISCO. 2nd ed., Ch. 2.
 */
export function isco_technology_selection(Koc: number, solubility: number, DNAPL_present: boolean, geology: string): { tech: string, reason: string, alternatives: string[] } {
    assertNonNegFinite(Koc, 'Koc');
    assertNonNegFinite(solubility, 'solubility');
    if (typeof DNAPL_present !== 'boolean') {
        throw new TypeError('[ISCO] DNAPL_present must be a boolean');
    }
    if (typeof geology !== 'string') {
        throw new TypeError('[ISCO] geology must be a string');
    }
    const geo = geology.trim().toLowerCase();

    if (geo === 'fractured') {
        return {
            tech: 'ozone',
            reason: 'Gas-phase O3 penetrates fractures and preferential flow paths (ITRC 2005)',
            alternatives: ['persulfate'],
        };
    }
    if (DNAPL_present && Koc > 500) {
        return {
            tech: 'persulfate',
            reason: 'Persistent oxidant with high Koc sorption affinity; better for DNAPL mass transfer (Tsitonaki 2010)',
            alternatives: ['KMnO4'],
        };
    }
    if (DNAPL_present && Koc <= 500) {
        return {
            tech: 'KMnO4',
            reason: 'Persistent oxidant; stable in groundwater; effective for chlorinated solvents DNAPL (ITRC 2005)',
            alternatives: ['persulfate'],
        };
    }
    if (solubility < 1.0) {
        return {
            tech: 'persulfate',
            reason: 'Low solubility contaminant — persulfate better mass transfer to sorbed phase (Tsitonaki 2010)',
            alternatives: ['ozone'],
        };
    }
    if (geo === 'clay') {
        return {
            tech: 'persulfate',
            reason: 'Persulfate diffuses into clay pores; alkaline activation compatible with buffered systems (Tsitonaki 2010)',
            alternatives: ['KMnO4'],
        };
    }
    // Default: Fenton for accessible dissolved-phase contamination in sandy aquifers
    return {
        tech: 'fenton',
        reason: 'Fast reaction kinetics for dissolved-phase BTEX/VOC in permeable formations (Watts 1999)',
        alternatives: ['ozone', 'persulfate'],
    };
}

// ===========================================================================
// 21. injectionWellSpacing
// ===========================================================================

/**
 * Calculates injection well spacing for a grid layout based on ROI overlap.
 * Calcula o espacamento de pocos de injecao para uma grade com sobreposicao de ROI.
 *
 * Grid spacing = ROI × 2 × (1 - overlap_fraction / 2)
 * Typical overlap: 0.1-0.3 (ITRC 2005) to ensure treatment continuity.
 *
 * @param {number} ROI_m - radius of influence per injection well [m]
 * @param {number} [overlap_fraction=0.2] - fractional overlap between adjacent ROIs [0-0.9]
 * @returns {{ spacing_m: number, area_per_well_m2: number }}
 * @reference ITRC (2005). Technical and Regulatory Guidance for ISCO. 2nd ed., Ch. 4.
 */
export function injectionWellSpacing(ROI_m: number, overlap_fraction: number = 0.2): { spacing_m: number, area_per_well_m2: number } {
    assertPositiveFinite(ROI_m, 'ROI_m');
    if (
        typeof overlap_fraction !== 'number' ||
        !isFinite(overlap_fraction) ||
        overlap_fraction < 0 ||
        overlap_fraction >= 1
    ) {
        throw new RangeError('[ISCO] overlap_fraction must be 0-0.99');
    }
    const spacing_m = 2 * ROI_m * (1 - overlap_fraction / 2);
    const area_per_well_m2 = spacing_m * spacing_m;
    return { spacing_m, area_per_well_m2 };
}

// ===========================================================================
// 22. massDosage
// ===========================================================================

/**
 * Calculates total oxidant mass required for a treatment zone.
 * Calcula a massa total de oxidante necessaria para uma zona de tratamento.
 *
 * Total mass = zone_volume × porosity × Sw × contaminant_conc × oxidant_demand
 *              (converted from mg/L to kg)
 *
 * @param {number} zone_volume_m3 - treatment zone volume [m³]
 * @param {number} porosity - effective porosity [0-1]
 * @param {number} Sw - water saturation [0-1]
 * @param {number} contaminant_conc - dissolved contaminant concentration [mg/L]
 * @param {number} oxidant_demand - oxidant:contaminant mass ratio [g oxidant / g contaminant]
 * @returns {{ total_oxidant_kg: number, pore_volume_L: number }}
 * @reference ITRC (2005). Technical and Regulatory Guidance for ISCO. 2nd ed., Ch. 4.
 */
export function massDosage(zone_volume_m3: number, porosity: number, Sw: number, contaminant_conc: number, oxidant_demand: number): { total_oxidant_kg: number, pore_volume_L: number } {
    assertPositiveFinite(zone_volume_m3, 'zone_volume_m3');
    if (typeof porosity !== 'number' || !isFinite(porosity) || porosity <= 0 || porosity > 1) {
        throw new RangeError('[ISCO] porosity must be (0, 1]');
    }
    if (typeof Sw !== 'number' || !isFinite(Sw) || Sw < 0 || Sw > 1) {
        throw new RangeError('[ISCO] Sw (water saturation) must be 0-1');
    }
    assertNonNegFinite(contaminant_conc, 'contaminant_conc');
    assertPositiveFinite(oxidant_demand, 'oxidant_demand');
    // Pore volume [L] = volume × porosity × Sw × 1000 (m³ → L)
    const pore_volume_L = zone_volume_m3 * porosity * Sw * 1000;
    // Contaminant mass [g] = pore_volume_L × conc [mg/L] / 1000
    const contaminant_g = (pore_volume_L * contaminant_conc) / 1000;
    // Oxidant mass [g] = contaminant mass [g] × oxidant demand [g/g]
    const total_oxidant_kg = (contaminant_g * oxidant_demand) / 1000;
    return { total_oxidant_kg, pore_volume_L };
}

// ===========================================================================
// 23. pHAdjustment
// ===========================================================================

/**
 * Calculates acid or base dose required to adjust pH in groundwater.
 * Calcula a dose de acido ou base necessaria para ajustar o pH em agua subterranea.
 *
 * Based on buffer capacity model:
 * dose = alkalinity × |pH_change| × correction_factor / buffer_efficiency
 *
 * Buffer systems: carbonate (most common), phosphate, NaOH/HCl for extreme correction.
 *
 * @param {number} initial_pH - current groundwater pH
 * @param {number} target_pH - desired pH after adjustment
 * @param {number} alkalinity - total alkalinity [mg/L as CaCO3]
 * @param {string} [buffer_system='carbonate'] - buffer system ('carbonate', 'NaOH', 'HCl', 'H2SO4')
 * @returns {{
 *   dose_mg_L: number,
 *   reagent: string,
 *   direction: 'acid'|'base'|'none',
 *   pH_change: number
 * }}
 * @reference ITRC (2005). Technical and Regulatory Guidance for ISCO. 2nd ed., Ch. 4.
 *   Sawyer, C.N. et al. (2003). Chemistry for Environmental Engineering and Science, 5th ed.
 */
export function pHAdjustment(initial_pH: number, target_pH: number, alkalinity: number, buffer_system: string = 'carbonate'): { dose_mg_L: number, reagent: string, direction: 'acid'|'base'|'none', pH_change: number } {
    assertFiniteNumber(initial_pH, 'initial_pH');
    assertFiniteNumber(target_pH, 'target_pH');
    assertNonNegFinite(alkalinity, 'alkalinity');
    if (initial_pH < 0 || initial_pH > 14) throw new RangeError('[ISCO] initial_pH must be 0-14');
    if (target_pH < 0 || target_pH > 14) throw new RangeError('[ISCO] target_pH must be 0-14');
    if (typeof buffer_system !== 'string') {
        throw new TypeError('[ISCO] buffer_system must be a string');
    }
    const pH_change = target_pH - initial_pH;
    if (Math.abs(pH_change) < 0.01) {
        return { dose_mg_L: 0, reagent: 'none', direction: 'none', pH_change: 0 };
    }
    const direction = pH_change > 0 ? 'base' : 'acid';
    // Empirical dose factor: mg reagent / (L × pH unit) - depends on alkalinity and buffer
    // Base: ~50 mg NaOH/L per pH unit at 200 mg/L alkalinity
    // Acid: ~36 mg HCl/L per pH unit at 200 mg/L alkalinity
    const alk_factor = Math.max(0.5, alkalinity / 200);
    const buf = buffer_system.trim().toLowerCase();
    let dose_mg_L_per_pH;
    let reagent;
    if (direction === 'base') {
        if (buf === 'naoh' || buf === 'carbonate') {
            dose_mg_L_per_pH = 50 * alk_factor;
            reagent = buf === 'naoh' ? 'NaOH' : 'Na2CO3';
        } else {
            dose_mg_L_per_pH = 40 * alk_factor;
            reagent = 'Ca(OH)2';
        }
    } else {
        if (buf === 'hcl' || buf === 'carbonate') {
            dose_mg_L_per_pH = 36 * alk_factor;
            reagent = 'HCl';
        } else {
            dose_mg_L_per_pH = 49 * alk_factor;
            reagent = 'H2SO4';
        }
    }
    return {
        dose_mg_L: dose_mg_L_per_pH * Math.abs(pH_change),
        reagent,
        direction,
        pH_change,
    };
}

// ===========================================================================
// 24. reductionEfficiency
// ===========================================================================

/**
 * Calculates contaminant concentration reduction efficiency.
 * Calcula a eficiencia de reducao da concentracao de contaminante.
 *
 * RE = (C_before - C_after) / C_before × 100 [%]
 *
 * @param {number} C_before - pre-treatment concentration [mg/L or any consistent unit]
 * @param {number} C_after - post-treatment concentration [same unit as C_before]
 * @returns {{ efficiency_pct: number, log_reduction: number }}
 * @reference ITRC (2005). Technical and Regulatory Guidance for ISCO. 2nd ed.
 */
export function reductionEfficiency(C_before: number, C_after: number): { efficiency_pct: number, log_reduction: number } {
    assertPositiveFinite(C_before, 'C_before');
    assertNonNegFinite(C_after, 'C_after');
    if (C_after > C_before) {
        throw new RangeError('[ISCO] C_after cannot exceed C_before');
    }
    const efficiency_pct = ((C_before - C_after) / C_before) * 100;
    const log_reduction = C_after > 0 ? Math.log10(C_before / C_after) : Infinity;
    return { efficiency_pct, log_reduction };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const inSituChemicalOxidationMeta = {
    name: 'inSituChemicalOxidation',
    description: 'inSituChemicalOxidation',
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
