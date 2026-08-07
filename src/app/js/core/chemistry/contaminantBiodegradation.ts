// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CONTAMINANT BIODEGRADATION — Pure-math biodegradation kinetics
   Cinética de biodegradação de contaminantes ambientais

   Implementa modelos matemáticos para quantificação de biodegradação
   natural e estimulada de contaminantes em subsuperfície. Todos os
   cálculos são determinísticos, sem efeitos colaterais, compatíveis
   com Node.js e browser.

   Referências:
   - Monod (1949) Annual Review of Microbiology 3:371-394
   - Newell et al. (1996) BIOSCREEN manual USEPA/600/R-96/038
   - Wiedemeier et al. (1999) Natural Attenuation of Fuels and Chlorinated Solvents
   - Meckenstock et al. (2004) Environ. Sci. Technol. 38(1):1-9
   - Chapelle (1996) Ground Water 34(4):741-748
   - Rittmann & McCarty (2001) Environmental Biotechnology
   - Haldane (1930) Enzymes, Longmans Green, London
   ================================================================ */

// ----------------------------------------------------------------
// CONSTANTS - Molecular weights for chlorinated ethenes (g/mol)
// Pesos moleculares dos etenos clorados para cálculo de balanço de massa
// ----------------------------------------------------------------

/** @type {Record<string,number>} Molecular weights of chlorinated ethene family */
const MW = {
    PCE: 165.83, // Tetrachloroethene / Tetracloroetileno
    TCE: 131.38, // Trichloroethene / Tricloroetileno
    DCE: 96.94, // Dichloroethene / Dicloroetileno (cis-1,2 dominant)
    VC: 62.5, // Vinyl chloride / Cloreto de vinila
    ETH: 28.05, // Ethene / Etileno
} as const;

// ----------------------------------------------------------------
// INTERNAL HELPER - erfc via Horner polynomial (Abramowitz & Stegun 7.1.26)
// Complemento da função erro via polinômio de Horner (precisão ±1.5e-7)
// ----------------------------------------------------------------

/**
 * Approximates erfc(x) using A&S 7.1.26 rational approximation.
 * Precisão: ±1.5×10⁻⁷ para x ≥ 0. Extendida para x < 0 via erfc(x) = 2 - erfc(-x).
 * @param {number} x
 * @returns {number} erfc(x) ∈ [0, 2]
 */
function erfc(x: number): number {
    if (x < 0) return 2 - erfc(-x);
    const t = 1 / (1 + 0.3275911 * x);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return poly * Math.exp(-x * x);
}

// ----------------------------------------------------------------
// 1. DUAL MONOD KINETICS
// Cinética de Monod dupla para degradação aeróbia/anaeróbia
// ----------------------------------------------------------------

/**
 * Dual Monod growth/degradation rate for coupled substrate + electron acceptor limitation.
 * Taxa de degradação de Monod dupla acoplando limitação de substrato e aceptor de elétrons.
 *
 * r = mu_max × X × (C_s/(Ks+C_s)) × (C_a/(Ka+C_a))
 *
 * @param {number} C_substrate    - Substrate concentration (mg/L)
 * @param {number} C_electron_acceptor - Electron acceptor concentration (mg/L)
 * @param {number} mu_max         - Maximum specific growth rate (1/day)
 * @param {number} Ks             - Half-saturation for substrate (mg/L)
 * @param {number} Ka             - Half-saturation for electron acceptor (mg/L)
 * @param {number} X_biomass      - Biomass concentration (mg/L)
 * @returns {number} Degradation rate (mg/L/day)
 * @throws {RangeError} If Ks or Ka are non-positive
 * Reference: Monod (1949) Annual Review of Microbiology 3:371-394
 */
function monodDual(
    C_substrate: number,
    C_electron_acceptor: number,
    mu_max: number,
    Ks: number,
    Ka: number,
    X_biomass: number,
): number {
    if (Ks <= 0) throw new RangeError('monodDual: Ks must be > 0');
    if (Ka <= 0) throw new RangeError('monodDual: Ka must be > 0');

    const f_substrate = C_substrate / (Ks + C_substrate);
    const f_acceptor = C_electron_acceptor / (Ka + C_electron_acceptor);
    return mu_max * X_biomass * f_substrate * f_acceptor;
}

// ----------------------------------------------------------------
// 2. BIOSCREEN-AT SIMPLIFIED - 1D transport + first-order decay
// Atenuação natural simplificada tipo BIOSCREEN-AT
// ----------------------------------------------------------------

/**
 * BIOSCREEN-AT simplified: 1D advection-dispersion with first-order decay.
 * Concentração após transporte 1D com dispersão e decaimento de primeira ordem.
 *
 * C = (C0/2) × erfc((x - v×t/R) / (2×sqrt(alpha_L×v×t/R))) × exp(-lambda_bio×t)
 *
 * @param {number} x          - Downgradient distance from source (m)
 * @param {number} t          - Time elapsed (days)
 * @param {number} C0         - Initial/source concentration (mg/L)
 * @param {number} v          - Groundwater seepage velocity (m/day)
 * @param {number} R          - Retardation factor (dimensionless, ≥1)
 * @param {number} alpha_L    - Longitudinal dispersivity (m)
 * @param {number} lambda_bio - First-order biodegradation rate (1/day)
 * @returns {number} Concentration at (x, t) in mg/L
 * @throws {RangeError} If R < 1, alpha_L ≤ 0, t ≤ 0
 * Reference: Newell et al. (1996) USEPA/600/R-96/038
 */
function bioscreenNaturalAttenuation(
    x: number,
    t: number,
    C0: number,
    v: number,
    R: number,
    alpha_L: number,
    lambda_bio: number,
): number {
    if (R < 1) throw new RangeError('bioscreenNaturalAttenuation: R must be ≥ 1');
    if (alpha_L <= 0) throw new RangeError('bioscreenNaturalAttenuation: alpha_L must be > 0');
    if (t <= 0) return 0;

    const vR = v / R; // retarded velocity (m/day)
    const D = alpha_L * v; // hydrodynamic dispersion coefficient (m²/day)
    const sigma = 2 * Math.sqrt((D * t) / R); // spread parameter

    if (sigma === 0) return 0;

    const arg = (x - vR * t) / sigma;
    const decay = Math.exp(-lambda_bio * t);
    return (C0 / 2) * erfc(arg) * decay;
}

// ----------------------------------------------------------------
// 3. BTEX AEROBIC STOICHIOMETRY
// Estequiometria de demanda de O₂ para biodegradação aeróbia de BTEX
// ----------------------------------------------------------------

type BtexCompound = 'benzene' | 'toluene' | 'ethylbenzene' | 'xylene';

/** @type {Record<string, number>} O2 mass ratio per unit BTEX oxidized (kg O2 / kg compound) */
const BTEX_O2_RATIO: Record<BtexCompound, number> = {
    benzene: 3.07, // C6H6 + 7.5O2 → 6CO2 + 3H2O; MW ratio = 240/78.11
    toluene: 3.13, // C7H8 + 9O2 → 7CO2 + 4H2O;  MW ratio = 288/92.14
    ethylbenzene: 3.24, // C8H10 + 10.5O2 → 8CO2 + 5H2O; MW ratio = 336/106.17
    xylene: 3.24, // C8H10 + 10.5O2 (same as ethylbenzene)
};

/**
 * Computes O2 demand for aerobic BTEX biodegradation.
 * Calcula demanda de oxigênio para biodegradação aeróbia de compostos BTEX.
 *
 * @param {'benzene'|'toluene'|'ethylbenzene'|'xylene'} compound - BTEX compound name
 * @param {number} C_mg_per_L - Compound concentration (mg/L)
 * @returns {{O2_demand_mg_per_L: number, compound: string, C_mg_per_L: number}}
 * @throws {RangeError} If compound is not in BTEX list or concentration is negative
 * Reference: Wiedemeier et al. (1999) ISBN 0-471-19748-1
 */
function btexStoichiometry(
    compound: BtexCompound,
    C_mg_per_L: number,
): { O2_demand_mg_per_L: number; compound: string; C_mg_per_L: number } {
    const key = String(compound).toLowerCase() as BtexCompound;
    const ratio = BTEX_O2_RATIO[key];
    if (ratio === undefined) {
        throw new RangeError(
            `btexStoichiometry: unknown compound "${compound}". Valid: benzene, toluene, ethylbenzene, xylene`,
        );
    }
    if (C_mg_per_L < 0) throw new RangeError('btexStoichiometry: concentration must be ≥ 0');

    return {
        O2_demand_mg_per_L: ratio * C_mg_per_L,
        compound: key,
        C_mg_per_L,
    };
}

// ----------------------------------------------------------------
// 4. REDUCTIVE DECHLORINATION
// Desclorinação redutiva sequencial PCE→TCE→DCE→VC→ETH
// ----------------------------------------------------------------

/**
 * Sequential reductive dechlorination mass balance using molar mass ratios.
 * Balanço de massa para desclorinação redutiva sequencial de solventes clorados.
 *
 * C_daughter = C_parent × f_conversion × (MW_daughter / MW_parent)
 *
 * @param {number} C_PCE         - PCE concentration (any unit, e.g. mg/L)
 * @param {number} f_PCE_to_TCE  - Fraction of PCE converted to TCE [0-1]
 * @param {number} f_TCE_to_DCE  - Fraction of TCE converted to DCE [0-1]
 * @param {number} f_DCE_to_VC   - Fraction of DCE converted to VC  [0-1]
 * @param {number} f_VC_to_ETH   - Fraction of VC  converted to ETH [0-1]
 * @returns {{C_TCE: number, C_DCE: number, C_VC: number, C_ETH: number}}
 * @throws {RangeError} If any fraction is outside [0, 1]
 * Reference: Wiedemeier et al. (1999) - Table 3.6
 */
function reductiveDechlor(
    C_PCE: number,
    f_PCE_to_TCE: number,
    f_TCE_to_DCE: number,
    f_DCE_to_VC: number,
    f_VC_to_ETH: number,
): { C_TCE: number; C_DCE: number; C_VC: number; C_ETH: number } {
    const fractions: Array<[string, number]> = [
        ['f_PCE_to_TCE', f_PCE_to_TCE],
        ['f_TCE_to_DCE', f_TCE_to_DCE],
        ['f_DCE_to_VC', f_DCE_to_VC],
        ['f_VC_to_ETH', f_VC_to_ETH],
    ];
    for (const [name, val] of fractions) {
        if (val < 0 || val > 1) throw new RangeError(`reductiveDechlor: ${name} must be in [0, 1], got ${val}`);
    }

    const C_TCE = C_PCE * f_PCE_to_TCE * (MW.TCE / MW.PCE);
    const C_DCE = C_TCE * f_TCE_to_DCE * (MW.DCE / MW.TCE);
    const C_VC = C_DCE * f_DCE_to_VC * (MW.VC / MW.DCE);
    const C_ETH = C_VC * f_VC_to_ETH * (MW.ETH / MW.VC);

    return { C_TCE, C_DCE, C_VC, C_ETH };
}

// ----------------------------------------------------------------
// 5. CSIA RAYLEIGH ISOTOPE SHIFT
// Enriquecimento isotópico CSIA via equação de Rayleigh
// ----------------------------------------------------------------

/**
 * Compound-Specific Isotope Analysis (CSIA) Rayleigh bulk enrichment equation.
 * Calcula deslocamento isotópico por enriquecimento de Rayleigh em CSIA.
 *
 * δ_current = δ_initial - ε_bulk × ln(C_remaining / C_initial)
 *
 * @param {number} C_initial   - Initial concentration (mg/L or any unit)
 * @param {number} C_remaining - Remaining (current) concentration (mg/L)
 * @param {number} epsilon_bulk - Bulk enrichment factor (‰, typically negative)
 * @returns {{delta_current: number, fractionation_factor: number}}
 * @throws {RangeError} If C_initial ≤ 0 or C_remaining ≤ 0 or C_remaining > C_initial
 * Reference: Meckenstock et al. (2004) Environ. Sci. Technol. 38(1):1-9
 */
function csiaIsotopeShift(
    C_initial: number,
    C_remaining: number,
    epsilon_bulk: number,
): { delta_current: number; fractionation_factor: number } {
    if (C_initial <= 0) throw new RangeError('csiaIsotopeShift: C_initial must be > 0');
    if (C_remaining <= 0) throw new RangeError('csiaIsotopeShift: C_remaining must be > 0');
    if (C_remaining > C_initial) throw new RangeError('csiaIsotopeShift: C_remaining must be ≤ C_initial');

    const delta_current = -epsilon_bulk * Math.log(C_remaining / C_initial);
    const fractionation_factor = 1 + epsilon_bulk / 1000;

    return { delta_current, fractionation_factor };
}

// ----------------------------------------------------------------
// 6. HALDANE INHIBITION KINETICS
// Cinética de inibição competitiva (Haldane)
// ----------------------------------------------------------------

/**
 * Competitive (Haldane) substrate inhibition kinetics.
 * Cinética de inibição competitiva onde alto substrato ou inibidor reduz taxa.
 *
 * r = mu_max × C_s / (Ks × (1 + C_i/Ki) + C_s)
 *
 * @param {number} C_substrate  - Substrate concentration (mg/L)
 * @param {number} C_inhibitor  - Inhibitor concentration (mg/L)
 * @param {number} mu_max       - Maximum rate (same units as return)
 * @param {number} Ks           - Half-saturation constant (mg/L)
 * @param {number} Ki           - Inhibition constant (mg/L)
 * @returns {number} Degradation rate (same units as mu_max)
 * @throws {RangeError} If Ks ≤ 0 or Ki ≤ 0
 * Reference: Haldane (1930) Enzymes, Longmans Green, London
 */
function inhibitionKinetics(
    C_substrate: number,
    C_inhibitor: number,
    mu_max: number,
    Ks: number,
    Ki: number,
): number {
    if (Ks <= 0) throw new RangeError('inhibitionKinetics: Ks must be > 0');
    if (Ki <= 0) throw new RangeError('inhibitionKinetics: Ki must be > 0');

    const denominator = Ks * (1 + C_inhibitor / Ki) + C_substrate;
    return (mu_max * C_substrate) / denominator;
}

// ----------------------------------------------------------------
// 7. ELECTRON ACCEPTOR BALANCE
// Balanço de aceptores de elétrons para atenuação natural
// ----------------------------------------------------------------

/** Stoichiometric usage factors (mg acceptor / mg BTEX as benzene) */
const EA_FACTORS = {
    O2: 3.1, // aerobic respiration (Wiedemeier 1999)
    NO3: 4.9, // nitrate reduction (Chapelle 1996)
    SO4: 4.7, // sulfate reduction (Wiedemeier 1999)
    Fe3: 21.8, // iron reduction as Fe3+ (benzene equivalent)
} as const;

/**
 * Estimates natural attenuation capacity from available electron acceptors.
 * Calcula capacidade assimilativa total de aceptores de elétrons disponíveis.
 *
 * @param {number} C_BTEX_mg_per_L - BTEX concentration (mg/L as benzene equivalent)
 * @param {number} C_O2            - Available O2 concentration (mg/L)
 * @param {number} C_NO3           - Available NO3 concentration (mg/L)
 * @param {number} C_SO4           - Available SO4 concentration (mg/L)
 * @param {number} C_Fe3           - Available Fe3+ concentration (mg/L)
 * @returns {{capacity_mg_per_L: number, limiting_acceptor: string, assimilative_capacity_mg_per_L: number}}
 * References: Chapelle (1996), Wiedemeier et al. (1999)
 */
function electronAcceptorBalance(
    C_BTEX_mg_per_L: number,
    C_O2: number,
    C_NO3: number,
    C_SO4: number,
    C_Fe3: number,
): { capacity_mg_per_L: number; limiting_acceptor: string; assimilative_capacity_mg_per_L: number } {
    void C_BTEX_mg_per_L;
    // BTEX mass each acceptor can degrade (mg/L BTEX degraded per mg/L acceptor available)
    const cap_O2 = C_O2 / EA_FACTORS.O2;
    const cap_NO3 = C_NO3 / EA_FACTORS.NO3;
    const cap_SO4 = C_SO4 / EA_FACTORS.SO4;
    const cap_Fe3 = C_Fe3 / EA_FACTORS.Fe3;

    const capacities: Record<string, number> = { O2: cap_O2, NO3: cap_NO3, SO4: cap_SO4, Fe3: cap_Fe3 };
    const total = cap_O2 + cap_NO3 + cap_SO4 + cap_Fe3;

    // Limiting acceptor = smallest capacity contributor relative to total
    const sorted = Object.entries(capacities).sort((a, b) => a[1] - b[1]);
    const limiting_acceptor = sorted[0]?.[0] ?? 'O2';

    return {
        capacity_mg_per_L: total,
        limiting_acceptor,
        assimilative_capacity_mg_per_L: total,
    };
}

// ----------------------------------------------------------------
// 8. FIRST-ORDER HALF-LIFE
// Meia-vida para cinética de primeira ordem
// ----------------------------------------------------------------

/**
 * Computes half-life from first-order rate constant.
 * Calcula a meia-vida a partir da constante cinética de primeira ordem.
 *
 * t₁/₂ = ln(2) / λ
 *
 * @param {number} lambda_1_per_day - First-order degradation rate (1/day)
 * @returns {number} Half-life (days)
 * @throws {RangeError} If lambda ≤ 0
 */
function halfLifeFromFirstOrder(lambda_1_per_day: number): number {
    if (lambda_1_per_day <= 0) throw new RangeError('halfLifeFromFirstOrder: lambda must be > 0');
    return Math.LN2 / lambda_1_per_day;
}

// ----------------------------------------------------------------
// 9. NATURAL ATTENUATION CAPACITY (required lambda)
// Capacidade de atenuação natural - taxa cinética necessária
// ----------------------------------------------------------------

/**
 * Computes the first-order rate constant required to achieve a target concentration
 * over a given transport distance under steady-state 1D flow.
 * Calcula taxa necessária para atingir concentração alvo dado distância e velocidade.
 *
 * λ = -(v/L) × ln(C_target / C_in)
 *
 * @param {number} C_in_mg_per_L     - Inlet (source) concentration (mg/L)
 * @param {number} C_target_mg_per_L - Target (receptor) concentration (mg/L)
 * @param {number} L_m               - Transport path length (m)
 * @param {number} v_m_per_day       - Groundwater seepage velocity (m/day)
 * @returns {{lambda_per_day: number, halfLife_days: number, feasible: boolean}}
 * @throws {RangeError} If L_m ≤ 0, v_m_per_day ≤ 0, or C_in ≤ 0 or C_target ≤ 0
 * Reference: Newell et al. (1996) USEPA/600/R-96/038
 */
function naturalAttenuationCapacity(
    C_in_mg_per_L: number,
    C_target_mg_per_L: number,
    L_m: number,
    v_m_per_day: number,
): { lambda_per_day: number; halfLife_days: number; feasible: boolean } {
    if (C_in_mg_per_L <= 0) throw new RangeError('naturalAttenuationCapacity: C_in must be > 0');
    if (C_target_mg_per_L <= 0) throw new RangeError('naturalAttenuationCapacity: C_target must be > 0');
    if (L_m <= 0) throw new RangeError('naturalAttenuationCapacity: L_m must be > 0');
    if (v_m_per_day <= 0) throw new RangeError('naturalAttenuationCapacity: v_m_per_day must be > 0');

    const lambda_per_day = -(v_m_per_day / L_m) * Math.log(C_target_mg_per_L / C_in_mg_per_L);
    const feasible = lambda_per_day > 0;
    const halfLife_days = feasible ? halfLifeFromFirstOrder(lambda_per_day) : Infinity;

    return { lambda_per_day, halfLife_days, feasible };
}

// ----------------------------------------------------------------
// 10. BIOMASS YIELD
// Produção líquida de biomassa
// ----------------------------------------------------------------

/**
 * Net biomass increase from substrate consumption with endogenous decay.
 * Crescimento líquido de biomassa considerando rendimento e decaimento.
 *
 * X_net = Y × C_substrate_consumed - b × X0 × t_days
 *
 * @param {number} C_substrate_consumed - Substrate consumed (mg/L)
 * @param {number} Y                    - True yield (mg biomass / mg substrate)
 * @param {number} b                    - Endogenous decay rate (1/day)
 * @param {number} t_days               - Time elapsed (days)
 * @param {number} [X0=0]               - Initial biomass concentration (mg/L)
 * @returns {number} Net biomass increase (mg/L), may be negative if decay > growth
 * Reference: Rittmann & McCarty (2001) Environmental Biotechnology, McGraw-Hill
 */
function biomassYield(C_substrate_consumed: number, Y: number, b: number, t_days: number, X0 = 0): number {
    return Y * C_substrate_consumed - b * X0 * t_days;
}

// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------

export {
    monodDual,
    bioscreenNaturalAttenuation,
    btexStoichiometry,
    reductiveDechlor,
    csiaIsotopeShift,
    inhibitionKinetics,
    electronAcceptorBalance,
    halfLifeFromFirstOrder,
    naturalAttenuationCapacity,
    biomassYield,
};
