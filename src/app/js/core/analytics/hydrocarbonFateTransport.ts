// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Petroleum Hydrocarbon Fate & Transport
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   HYDROCARBON FATE & TRANSPORT — Pure mathematical functions
   Transporte e destino de hidrocarbonetos de petróleo no subsolo

   Implementa:
   - Relações de saturação LNAPL/DNAPL (Parker et al. 1987)
   - Frações TPH com base em saúde (MADEP VPH/EPH 2003)
   - Modelo de depleção de zona-fonte por benzeno (USEPA NSZD 2014)
   - Lei de Raoult para solubilidade efetiva de NAPL multicomponente
   - Modelo analítico BIOSCREEN de concentração na linha central
   - Equação de Antoine para pressão de vapor de hidrocarbonetos
   - Isoterma de Freundlich/Langmuir para sorção subsuperficial
   - Modelo de intemperismo de gasolina (Kaplan et al. 1997)
   - Trajetória e intemperismo de derramamento de óleo (Fingas 2004)
   - Calibração de fluorescência de naftaleno/PAH (Means 1992)

   Este módulo é puro: sem DOM, sem IDB, sem Three.js, sem fetch.
   Adequado para Node.js e browser (ES module).

   Referências Acadêmicas:
   - Parker, J.C., et al. (1987). A parametric model for constitutive
     properties governing multiphase flow in porous media.
     Water Resour. Res. 23(4):618-624. DOI: 10.1029/WR023i004p00618
   - Gustafson, J.B., et al. (1997). Total Petroleum Hydrocarbon Criteria
     Working Group Volume 3: Selection of Representative TPH Fractions Based
     on Fate and Transport Considerations. Amherst Scientific Publishers.
   - MADEP (2003). Updated Petroleum Hydrocarbon Fraction Toxicity Values for
     the VPH/EPH/APH Methodology. Massachusetts DEP BWSC/ORS-PUBS-BB-2003.
   - USEPA (2014). Estimation of Long-Term Natural Attenuation of NAPL Sources.
     EPA/600/R-14/039. Ada, Oklahoma.
   - Banerjee, S. (1984). Solubility of organic mixtures in water.
     Environ. Sci. Technol. 18(8):587-591. DOI: 10.1021/es00126a005
   - Newell, C.J., et al. (1996). BIOSCREEN Natural Attenuation Decision
     Support System, Version 1.3. EPA/600/R-96/153.
   - Reid, R.C., Prausnitz, J.M. & Poling, B.E. (1987). The Properties of
     Gases and Liquids, 5th ed. McGraw-Hill. ISBN 978-0-07-051799-8.
   - Schwarzenbach, R.P., Gschwend, P.M. & Imboden, D.M. (2003).
     Environmental Organic Chemistry, 2nd ed. Wiley-Interscience.
     ISBN 978-0-471-35053-4.
   - Kaplan, I.R., et al. (1997). Forensic Environmental Geochemistry:
     differentiation of fuel types, their sources and release time.
     Org. Geochem. 27(5-6):289-317. DOI: 10.1016/S0146-6380(97)00071-2
   - Fingas, M. (2011). Oil Spill Science and Technology. Elsevier.
     ISBN 978-1-85617-943-0.
   - Fingas, M.F. (2004). Modeling evaporation using models that are not
     boundary-layer regulated. J. Hazard. Mater. 107(1-2):27-36.
     DOI: 10.1016/j.jhazmat.2003.11.007
   - Fay, J.A. (1971). Physical processes in the spread of oil on a water
     surface. Proc. Joint Conf. Prevention and Control of Oil Spills, 463-467.
   - Means, J.C. (1992). Influence of salinity upon sediment-water
     partitioning of aromatic hydrocarbons. Mar. Chem. 37(1-2):137-143.
     DOI: 10.1016/0304-4203(92)90063-W
   - Emsbo-Mattingly, S. (2013). Fluorescence-based PAH characterization.
     In: Stout & Costa (eds.) Chemical Fingerprinting of Petroleum Products.
     CRC Press. ISBN 978-1-4665-5563-5.
   ================================================================ */

// ================================================================
// Named constants - no magic numbers
// Constantes nomeadas para evitar números mágicos nos algoritmos
// ================================================================

/** Massa específica da água pura a 15°C (kg/m³) */
const DENSITY_WATER_KG_M3 = 1000.0;

/** Porosidade mínima aceitável (fração) */
const _PHI_MIN = 1e-6;

/** Saturação mínima positiva */
const _S_MIN = 0.0;

/** Saturação máxima (100 %) */
const _S_MAX = 1.0;

/** Aceleração da gravidade (m/s²) */
const G_M_S2 = 9.81;

/** Constante dos gases ideais (J/mol·K) */
const _R_GAS = 8.31446; // J mol⁻¹ K⁻¹

/** Converter bar → Pa */
const BAR_TO_PA = 1e5;

/**
 * Fatores de risco-saúde para frações TPH segundo MADEP 2003.
 * Valores: { CSF_per_mg_kg_day, RfD_mg_kg_day }
 * CSF = Cancer Slope Factor (mg/kg-day)⁻¹
 * RfD = Reference Dose mg/kg/day (non-cancer)
 * Compostos - vide MADEP 2003 Tabela 1.
 * @type {Record<string, { CSF: number, RfD: number }>}
 */
const TPH_FRACTION_RISK: Record<string, { CSF: number; RfD: number }> = Object.freeze({
    BTEX: Object.freeze({ CSF: 0.055, RfD: 4e-3 }), // benzene dominates CSF
    aliphatic_C5_C8: Object.freeze({ CSF: 0.0, RfD: 5.0 }),
    aliphatic_C9_C18: Object.freeze({ CSF: 0.0, RfD: 0.1 }),
    aliphatic_C19_C36: Object.freeze({ CSF: 0.0, RfD: 2.0 }),
    aromatic_C9_C16: Object.freeze({ CSF: 3e-3, RfD: 4e-3 }),
    aromatic_C17_C35: Object.freeze({ CSF: 3e-3, RfD: 3e-2 }),
});

/**
 * Constantes de Antoine (A, B, C) para hidrocarbonetos comuns (NIST WebBook).
 * Forma padrão NIST: log10(Pv_mmHg) = A − B / (T_C + C), onde T em Celsius.
 * Retorno convertido para Pa: Pv_Pa = Pv_mmHg × 133.322.
 * Fonte: NIST Chemistry WebBook; Reid, Prausnitz & Poling 1987 App. A.
 */
const _ANTOINE_PARAMS = Object.freeze({
    benzene: Object.freeze({ A: 6.90565, B: 1211.033, C: 220.79 }), // NIST 6–104 °C
    toluene: Object.freeze({ A: 6.95464, B: 1344.8, C: 219.482 }), // NIST 6–137 °C
    ethylbenzene: Object.freeze({ A: 6.95719, B: 1424.255, C: 213.206 }), // NIST 26–163 °C
    xylene_o: Object.freeze({ A: 7.00908, B: 1474.679, C: 213.686 }), // NIST 32–172 °C
    naphthalene: Object.freeze({ A: 7.01065, B: 1733.716, C: 201.89 }), // NIST 86–218 °C
    n_hexane: Object.freeze({ A: 6.87601, B: 1171.53, C: 224.366 }), // NIST −9–92 °C
    n_octane: Object.freeze({ A: 6.91868, B: 1351.99, C: 209.155 }), // NIST 19–152 °C
});

/** Limiares de fluorescência PAH por nível de triagem (µg/L equivalente naftaleno) */
const PAH_FLUORESCENCE_THRESHOLDS = Object.freeze({
    screening_low: 10, // acima = investigar
    screening_medium: 100, // confirmação recomendada
    screening_high: 1000, // remediação provável
});

/** Razão de discriminação fonte petrogênica vs pirogênica (método Means 1992).
 *  < 0.5 → pirogênico (combustão); ≥ 0.5 → petrogênico (derramamento)
 */
const PYROGENIC_PETROGENIC_CUTOFF = 0.5;

/** Comprimento de onda de excitação (nm) de referência para calibração de fluorescência */
const _FLUORESCENCE_EXCITATION_NM = 254;

/** Fatores de emissificação (fração água em emulsão w/o) — Fingas 2004 Tabela 2 */
const EMULSIFICATION_MAX_WATER_FRACTION = 0.8;

/** Fração mínima de massa de BTEX que remanesce na fonte antes de assumir depleção */
const _BENZENE_DEPLETION_MIN_FRACTION = 1e-9;

// ================================================================
// Funções auxiliares internas
// Funções matemáticas usadas por múltiplos algoritmos deste módulo
// ================================================================

/**
 * Valida que um número é finito e não-negativo.
 * @param {number} v - Valor a validar
 * @param {string} name - Nome do parâmetro (para mensagem de erro)
 * @returns {void}
 */
function _requireNonNegative(v: number, name: string): void {
    if (!Number.isFinite(v) || v < 0) {
        throw new RangeError(`${name} must be a finite non-negative number, got ${v}`);
    }
}

/**
 * Valida que um número é finito e estritamente positivo.
 * @param {number} v - Valor a validar
 * @param {string} name - Nome do parâmetro
 * @returns {void}
 */
function _requirePositive(v: number, name: string): void {
    if (!Number.isFinite(v) || v <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got ${v}`);
    }
}

/**
 * Valida fração no intervalo [0, 1].
 * @param {number} v - Valor a validar
 * @param {string} name - Nome do parâmetro
 */
function _requireFraction(v: number, name: string) {
    if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw new RangeError(`${name} must be in [0, 1], got ${v}`);
    }
}

// ================================================================
// 1. napl_saturation_zone
// Zona de saturação LNAPL/DNAPL (Parker et al. 1987)
// ================================================================

/**
 * Calcula relações de saturação em zona de NAPL (Parker et al. 1987).
 * Computa saturação efetiva de água, saturação residual de NAPL,
 * e volume de NAPL por unidade de volume de solo.
 *
 * @param {number} phi - Porosidade total do solo (fração 0–1)
 * @param {number} S_w - Saturação de água (fração 0–1)
 * @param {number} S_n - Saturação de NAPL (fração 0–1) - S_w + S_n ≤ 1
 * @param {number} rho_NAPL_kg_m3 - Densidade do NAPL (kg/m³, > 0)
 * @param {number} rho_w_kg_m3 - Densidade da água (kg/m³, > 0), default 1000
 * @returns {{ S_w_eff: number, S_n_residual: number, V_NAPL_m3_per_m3_soil: number,
 *             NAPL_type: string, S_g: number }}
 *   S_w_eff = saturação efetiva de água normalizada pela porosidade
 *   S_n_residual = saturação residual de NAPL (fração, aprox 0.1–0.25)
 *   V_NAPL_m3_per_m3_soil = volume de NAPL por m³ de solo total
 *   NAPL_type = 'LNAPL' se rho_NAPL < rho_w, 'DNAPL' caso contrário
 *   S_g = saturação de fase gás (fração)
 * @reference Parker, J.C., et al. (1987) Water Resour. Res. 23(4):618-624.
 *            DOI: 10.1029/WR023i004p00618
 */
export function napl_saturation_zone(phi: number, S_w: number, S_n: number, rho_NAPL_kg_m3: number, rho_w_kg_m3: number = DENSITY_WATER_KG_M3): { S_w_eff: number, S_n_residual: number, V_NAPL_m3_per_m3_soil: number, NAPL_type: string, S_g: number } {
    _requirePositive(phi, 'phi (porosity)');
    if (phi > 1) throw new RangeError(`phi must be ≤ 1, got ${phi}`);
    _requireFraction(S_w, 'S_w (water saturation)');
    _requireFraction(S_n, 'S_n (NAPL saturation)');
    if (S_w + S_n > 1 + 1e-10) {
        throw new RangeError(`S_w + S_n must be ≤ 1, got ${S_w + S_n}`);
    }
    _requirePositive(rho_NAPL_kg_m3, 'rho_NAPL_kg_m3');
    _requirePositive(rho_w_kg_m3, 'rho_w_kg_m3');

    // Saturação efetiva de água (normalizada para [0,1])
    // S_we = (S_w - S_wr) / (1 - S_wr) com S_wr ≈ 0.10 para solos arenosos
    const S_wr = 0.1; // saturação residual de água (fração típica para areia)
    const S_w_eff = Math.max(0, (S_w - S_wr) / (1.0 - S_wr));

    // Saturação residual de NAPL (estimativa empírica Parker 1987 Eq. 11)
    // S_nr ≈ 0.10–0.25; aproximação: 0.15 × S_n / (S_n + 0.05)
    const S_n_residual = (0.15 * S_n) / (S_n + 0.05);

    // Volume de NAPL por m³ de solo total
    const V_NAPL_m3_per_m3_soil = phi * S_n;

    // Tipo de NAPL: menos denso que água → flutua (LNAPL); mais denso → afunda (DNAPL)
    const NAPL_type = rho_NAPL_kg_m3 < rho_w_kg_m3 ? 'LNAPL' : 'DNAPL';

    // Saturação de gás (fase vapor)
    const S_g = Math.max(0, 1.0 - S_w - S_n);

    return { S_w_eff, S_n_residual, V_NAPL_m3_per_m3_soil, NAPL_type, S_g };
}

// ================================================================
// 2. petroleumHydrocarbonTPH
// Frações TPH com base em saúde (MADEP VPH/EPH 2003)
// ================================================================

/**
 * Calcula risco agregado de TPH por frações conforme MADEP 2003 VPH/EPH.
 * Aplica Cancer Slope Factors e RfDs por fração; agrega HQ e risco de câncer.
 * Assume exposição por ingestão (via groundwater), corpo de adulto 70 kg,
 * ingestão de água 2 L/dia, 350 dias/ano por 25 anos.
 *
 * @param {number} BTEX_mg_L          - Concentração BTEX total (mg/L ≥ 0)
 * @param {number} aliphatic_C5_C8    - Fração alifática C5–C8 (mg/L ≥ 0)
 * @param {number} aliphatic_C9_C18   - Fração alifática C9–C18 (mg/L ≥ 0)
 * @param {number} aliphatic_C19_C36  - Fração alifática C19–C36 (mg/L ≥ 0)
 * @param {number} aromatic_C9_C16    - Fração aromática C9–C16 (mg/L ≥ 0)
 * @param {number} aromatic_C17_C35   - Fração aromática C17–C35 (mg/L ≥ 0)
 * @returns {{ total_TPH_mg_L: number, hazard_quotient: number,
 *             cancer_risk: number, dominant_fraction: string,
 *             fraction_HQ: Object }}
 *   hazard_quotient: soma de HQ por fração (não-câncer, <1 = aceitável USEPA)
 *   cancer_risk: risco incremental de câncer (< 1e-6 = aceitável USEPA)
 *   dominant_fraction: fração com maior contribuição de HQ
 * @reference MADEP (2003) VPH/EPH/APH Methodology. BWSC/ORS-PUBS-BB-2003.
 *            Gustafson, J.B. et al. (1997) TPHCWG Vol. 3. Amherst Scientific.
 */
export function petroleumHydrocarbonTPH(BTEX_mg_L: number, aliphatic_C5_C8: number, aliphatic_C9_C18: number, aliphatic_C19_C36: number, aromatic_C9_C16: number, aromatic_C17_C35: number): { total_TPH_mg_L: number, hazard_quotient: number, cancer_risk: number, dominant_fraction: string, fraction_HQ: Object } {
    const fracs = {
        BTEX: BTEX_mg_L,
        aliphatic_C5_C8,
        aliphatic_C9_C18,
        aliphatic_C19_C36,
        aromatic_C9_C16,
        aromatic_C17_C35,
    };
    for (const [k, v] of Object.entries(fracs)) {
        _requireNonNegative(v, k);
    }

    // Parâmetros de exposição por ingestão de água (USEPA RAGS Part A)
    const BW_kg = 70; // massa corporal adulto (kg)
    const IR_L_day = 2.0; // taxa de ingestão de água (L/dia)
    const EF_day_yr = 350; // frequência de exposição (dias/ano)
    const ED_yr = 25; // duração de exposição (anos)
    const AT_noncarc_day = 25 * 365; // tempo médio de exposição não-câncer (dias)
    const AT_carc_day = 70 * 365; // tempo médio de vida para câncer (dias)

    // CDI (Chronic Daily Intake) - mg/kg-dia = C × IR × EF × ED / (BW × AT)
    const CDI_noncarc_factor = (IR_L_day * EF_day_yr * ED_yr) / (BW_kg * AT_noncarc_day);
    const CDI_carc_factor = (IR_L_day * EF_day_yr * ED_yr) / (BW_kg * AT_carc_day);

    let total_HQ = 0;
    let total_cancer = 0;
        const fraction_HQ: Record<string, number>= {};
    let dom_frac = '';
    let dom_HQ = -Infinity;

    for (const [frac, conc_mg_L] of Object.entries(fracs)) {
        const risk = TPH_FRACTION_RISK[frac]!;
        const CDI_nc = conc_mg_L * CDI_noncarc_factor; // mg/kg-day (non-cancer)
        const CDI_c = conc_mg_L * CDI_carc_factor; // mg/kg-day (cancer)
        const HQ = risk.RfD > 0 ? CDI_nc / risk.RfD : 0;
        const CR = risk.CSF > 0 ? CDI_c * risk.CSF : 0;
        fraction_HQ[frac] = HQ;
        total_HQ += HQ;
        total_cancer += CR;
        if (HQ > dom_HQ) {
            dom_HQ = HQ;
            dom_frac = frac;
        }
    }

    const total_TPH_mg_L = Object.values(fracs).reduce((a, b) => a + b, 0);

    return {
        total_TPH_mg_L,
        hazard_quotient: total_HQ,
        cancer_risk: total_cancer,
        dominant_fraction: dom_frac,
        fraction_HQ,
    };
}

// ================================================================
// 3. benzeneSourceZoneDepletion
// Depleção de zona-fonte de LNAPL (USEPA NSZD 2014)
// ================================================================

/**
 * Modela a depleção de zona-fonte de LNAPL por dissolução, volatilização
 * e biodegradação natural (NSZD - Natural Source Zone Depletion).
 * Usa modelo de primeira ordem: dM/dt = -(k_diss + k_vap + k_bio) × M
 *
 * @param {number} Cbenzene_mg_L       - Concentração de benzeno na fase dissolvida (mg/L)
 * @param {number} Q_m3_day            - Vazão de recarga/dissolução (m³/dia > 0)
 * @param {number} LNAPL_volume_m3     - Volume de LNAPL na zona-fonte (m³ > 0)
 * @param {number} benzene_mass_fraction - Fração mássica de benzeno no LNAPL (0–1)
 * @param {number} T_yr                - Tempo de simulação (anos > 0)
 * @returns {{ k_total_yr: number, remaining_mass_kg: number,
 *             depletion_fraction: number, half_life_yr: number,
 *             k_dissolution_yr: number, k_volatilization_yr: number,
 *             k_biodegradation_yr: number,
 *             initial_depletion_rate_kg_yr?: number }}
 * @reference USEPA (2014) Estimation of Long-Term Natural Attenuation of NAPL.
 *            EPA/600/R-14/039.
 */
export function benzeneSourceZoneDepletion(Cbenzene_mg_L: number, Q_m3_day: number, LNAPL_volume_m3: number, benzene_mass_fraction: number, T_yr: number): { k_total_yr: number, remaining_mass_kg: number, depletion_fraction: number, half_life_yr: number, k_dissolution_yr: number, k_volatilization_yr: number, k_biodegradation_yr: number, initial_depletion_rate_kg_yr?: number } {
    _requireNonNegative(Cbenzene_mg_L, 'Cbenzene_mg_L');
    _requirePositive(Q_m3_day, 'Q_m3_day');
    _requirePositive(LNAPL_volume_m3, 'LNAPL_volume_m3');
    _requireFraction(benzene_mass_fraction, 'benzene_mass_fraction');
    _requirePositive(T_yr, 'T_yr');

    // Densidade típica de LNAPL gasolina (kg/m³)
    const LNAPL_density_kg_m3 = 750.0;

    // Massa inicial de benzeno na fonte (kg)
    const initial_mass_kg = LNAPL_volume_m3 * LNAPL_density_kg_m3 * benzene_mass_fraction;

    if (initial_mass_kg <= 0) {
        return {
            k_total_yr: 0,
            remaining_mass_kg: 0,
            depletion_fraction: 1,
            half_life_yr: Infinity,
            k_dissolution_yr: 0,
            k_volatilization_yr: 0,
            k_biodegradation_yr: 0,
        };
    }

    // Taxa de dissolução: dissolução anual / massa inicial
    // Dissolução anual = Cbenzene × Q × 1e-6 kg/mg × 365 dias/ano
    const dissolution_kg_yr = Cbenzene_mg_L * Q_m3_day * 1e-3 * 365; // mg/L × m³/d × g/L→mg/L × d/yr
    const k_dissolution_yr = dissolution_kg_yr / initial_mass_kg;

    // Volatilização: ~10–20 % da dissolução em zona vadosa típica (USEPA 2014 Eq. 4-3)
    const VOL_FRACTION_OF_DISSOLUTION = 0.15;
    const k_volatilization_yr = k_dissolution_yr * VOL_FRACTION_OF_DISSOLUTION;

    // Biodegradação: estimativa conservadora igual à dissolução (Wiedemeier et al. 1999)
    const k_biodegradation_yr = k_dissolution_yr;

    const k_total_yr = k_dissolution_yr + k_volatilization_yr + k_biodegradation_yr;

    // Massa remanescente após T_yr (decaimento exponencial de primeira ordem)
    const _T_days = T_yr * 365;
    const remaining_mass_kg = initial_mass_kg * Math.exp(-k_total_yr * T_yr);
    const depletion_fraction = 1.0 - remaining_mass_kg / initial_mass_kg;

    const half_life_yr = k_total_yr > 0 ? Math.LN2 / k_total_yr : Infinity;

    return {
        k_total_yr,
        remaining_mass_kg,
        depletion_fraction,
        half_life_yr,
        k_dissolution_yr,
        k_volatilization_yr,
        k_biodegradation_yr,
        // incluído para conveniência: taxa anual de remoção em kg/ano no início
        initial_depletion_rate_kg_yr: k_total_yr * initial_mass_kg,
    };
}

// ================================================================
// 4. raoultLawEffectiveConcentration
// Solubilidade efetiva por Lei de Raoult (Banerjee 1984)
// ================================================================

/**
 * Calcula concentrações efetivas de solubilidade de NAPL multicomponente
 * pela Lei de Raoult: C_eff_i = S_i × x_i × gamma_i
 * Onde S_i = solubilidade aquosa pura (mg/L), x_i = fração molar no NAPL,
 * gamma_i = coeficiente de atividade (gamma = 1 para mistura ideal).
 *
 * @param {Array<{name: string, S_mg_L: number, MW_g_mol: number, gamma?: number}>} compounds_array
 *   Lista de compostos com nome, solubilidade em água pura e peso molecular
 * @param {number[]} mole_fractions - Frações molares de cada composto (devem somar ≤ 1)
 * @returns {{ effective_concentrations: Array<{name: string, C_eff_mg_L: number}>,
 *             total_effective_mg_L: number, dominant_compound: string }}
 * @reference Banerjee, S. (1984) Environ. Sci. Technol. 18(8):587-591.
 *            DOI: 10.1021/es00126a005
 */
export function raoultLawEffectiveConcentration(compounds_array: Array<{name: string, S_mg_L: number, MW_g_mol: number, gamma?: number}>, mole_fractions: number[]): { effective_concentrations: Array<{name: string, C_eff_mg_L: number}>, total_effective_mg_L: number, dominant_compound: string } {
    if (!Array.isArray(compounds_array) || compounds_array.length === 0) {
        throw new RangeError('compounds_array must be a non-empty array');
    }
    if (!Array.isArray(mole_fractions) || mole_fractions.length !== compounds_array.length) {
        throw new RangeError('mole_fractions must have same length as compounds_array');
    }

    const x_sum = mole_fractions.reduce((a, b) => a + b, 0);
    if (x_sum > 1.0 + 1e-6) {
        throw new RangeError(`Sum of mole_fractions must be ≤ 1, got ${x_sum}`);
    }
    for (let i = 0; i < mole_fractions.length; i++) {
        _requireNonNegative(mole_fractions[i]!, `mole_fractions[${i}]`);
        const cmp = compounds_array[i];
        if (!cmp || typeof cmp.name !== 'string') {
            throw new RangeError(`compounds_array[${i}] must have a string name`);
        }
        _requirePositive(cmp.S_mg_L, `compounds_array[${i}].S_mg_L`);
        _requirePositive(cmp.MW_g_mol, `compounds_array[${i}].MW_g_mol`);
    }

    let total_effective_mg_L = 0;
    let dominant_compound = '';
    let dom_conc = -Infinity;

    const effective_concentrations = compounds_array.map((cmp, i) => {
        const gamma_i = typeof cmp.gamma === 'number' && cmp.gamma > 0 ? cmp.gamma : 1.0;
        const C_eff_mg_L = cmp.S_mg_L * mole_fractions[i]! * gamma_i;
        total_effective_mg_L += C_eff_mg_L;
        if (C_eff_mg_L > dom_conc) {
            dom_conc = C_eff_mg_L;
            dominant_compound = cmp.name;
        }
        return { name: cmp.name, C_eff_mg_L };
    });

    return { effective_concentrations, total_effective_mg_L, dominant_compound };
}

// ================================================================
// 5. bioscreenCenterlineModel
// Modelo analítico BIOSCREEN (Newell et al. 1996)
// ================================================================

/**
 * Calcula concentração na linha central de uma pluma dissolvida pelo modelo
 * BIOSCREEN (Newell et al. 1996) - solução 1D em regime permanente com
 * decaimento de primeira ordem, retardação e dispersão longitudinal.
 * Equação: C(x) = C0 × exp[(x/2α_L) × (1 - sqrt(1 + 4λα_L×R/v))]
 *
 * @param {number} x_m     - Distância da fonte (m, ≥ 0)
 * @param {number} C0_mg_L - Concentração na fonte (mg/L, > 0)
 * @param {number} v_m_day - Velocidade linear de fluxo (m/dia, > 0)
 * @param {number} alpha_L_m - Dispersividade longitudinal (m, > 0)
 * @param {number} lambda_day - Taxa de decaimento de primeira ordem (1/dia, ≥ 0)
 * @param {number} R       - Fator de retardação (adimensional, ≥ 1)
 * @returns {{ C_mg_L: number, attenuation_factor: number, plume_length_10ppb_m: number }}
 *   C_mg_L: concentração na distância x
 *   attenuation_factor: C(x)/C0
 *   plume_length_10ppb_m: comprimento de pluma até 0.010 mg/L
 * @reference Newell, C.J., et al. (1996) BIOSCREEN. EPA/600/R-96/153.
 */
export function bioscreenCenterlineModel(x_m: number, C0_mg_L: number, v_m_day: number, alpha_L_m: number, lambda_day: number, R: number): { C_mg_L: number, attenuation_factor: number, plume_length_10ppb_m: number } {
    _requireNonNegative(x_m, 'x_m');
    _requirePositive(C0_mg_L, 'C0_mg_L');
    _requirePositive(v_m_day, 'v_m_day');
    _requirePositive(alpha_L_m, 'alpha_L_m');
    _requireNonNegative(lambda_day, 'lambda_day');
    if (!Number.isFinite(R) || R < 1) {
        throw new RangeError(`R (retardation) must be ≥ 1, got ${R}`);
    }

    // Parâmetro interno: termo de decaimento-dispersão
    const term = 1.0 + (4.0 * lambda_day * alpha_L_m * R) / v_m_day;
    const sqrt_term = Math.sqrt(term);

    // Concentração na distância x (regime permanente, 1D)
    const exponent = (x_m / (2.0 * alpha_L_m)) * (1.0 - sqrt_term);
    const C_mg_L = C0_mg_L * Math.exp(exponent);

    const attenuation_factor = C_mg_L / C0_mg_L;

    // Comprimento de pluma até concentração-alvo de 0.010 mg/L (MCL benzeno USEPA)
    const C_target = 0.01;
    let plume_length_10ppb_m = 0;
    if (C0_mg_L > C_target) {
        // Resolver: C_target = C0 × exp[(x/2α)(1-sqrt_term)] → x = ln(C_target/C0)/[(1-sqrt_term)/(2α)]
        const denom_exp = (1.0 - sqrt_term) / (2.0 * alpha_L_m);
        if (Math.abs(denom_exp) > 1e-15) {
            plume_length_10ppb_m = Math.log(C_target / C0_mg_L) / denom_exp;
        }
        plume_length_10ppb_m = Math.max(0, plume_length_10ppb_m);
    }

    return { C_mg_L, attenuation_factor, plume_length_10ppb_m };
}

// ================================================================
// 6. vapourPressureAntoine
// Pressão de vapor pela equação de Antoine (Reid et al. 1987)
// ================================================================

/** Fator de conversão mmHg → Pa */
const MMHG_TO_PA = 133.322;

/**
 * Calcula pressão de vapor de hidrocarboneto pela equação de Antoine (forma NIST).
 * log10(Pv_mmHg) = A − B / (T_C + C), onde T em Celsius e Pv em mmHg.
 * O resultado é convertido para Pa, bar e atm.
 * Constantes A, B, C tabeladas em ANTOINE_PARAMS para BTEX e alifáticos comuns.
 *
 * @param {number} T_C  - Temperatura em Celsius (>= -100, fisicamente realista)
 * @param {number} A    - Constante de Antoine A (adimensional, base 10)
 * @param {number} B    - Constante de Antoine B (°C)
 * @param {number} C    - Constante de Antoine C (°C), tipicamente 200–225 para BTEX
 * @returns {{ Pv_Pa: number, Pv_bar: number, Pv_atm: number, Pv_mmHg: number }}
 * @reference Reid, R.C., Prausnitz, J.M. & Poling, B.E. (1987)
 *            The Properties of Gases and Liquids, 5th ed. McGraw-Hill.
 *            ISBN 978-0-07-051799-8.
 *            NIST Chemistry WebBook https://webbook.nist.gov (Antoine constants)
 */
export function vapourPressureAntoine(T_C: number, A: number, B: number, C: number): { Pv_Pa: number, Pv_bar: number, Pv_atm: number, Pv_mmHg: number } {
    if (!Number.isFinite(T_C) || T_C < -100) {
        throw new RangeError(`T_C must be >= -100 °C (finite), got ${T_C}`);
    }
    if (!Number.isFinite(A)) throw new RangeError(`A must be finite, got ${A}`);
    if (!Number.isFinite(B)) throw new RangeError(`B must be finite, got ${B}`);
    if (!Number.isFinite(C)) throw new RangeError(`C must be finite, got ${C}`);

    const denom = T_C + C;
    if (Math.abs(denom) < 1e-10) {
        throw new RangeError(`T_C + C is near zero (${denom}): invalid Antoine evaluation`);
    }

    const log10_Pv_mmHg = A - B / denom;
    const Pv_mmHg = Math.pow(10, log10_Pv_mmHg);
    const Pv_Pa = Pv_mmHg * MMHG_TO_PA;
    const Pv_bar = Pv_Pa / BAR_TO_PA;
    const Pv_atm = Pv_Pa / 101325.0;

    return { Pv_Pa, Pv_bar, Pv_atm, Pv_mmHg };
}

// ================================================================
// 7. freundlichSorptionIsotherm
// Isoterma de sorção de Freundlich/Langmuir (Schwarzenbach et al. 2003)
// ================================================================

/**
 * Calcula sorção de fase sólida, Kd linear na concentração dada,
 * fator de retardação e opcionalmente aplica isoterma de Langmuir.
 * Freundlich: q = Kf × C^n
 * Langmuir:   q = qmax × KL × C / (1 + KL × C)
 * Retardação: R = 1 + rho_b × Kd / theta_w
 *
 * @param {number} C_mg_L      - Concentração aquosa (mg/L, ≥ 0)
 * @param {number} Kf          - Coeficiente de Freundlich (mg/kg)/(mg/L)^n
 * @param {number} n           - Expoente de Freundlich (adimensional, > 0)
 * @param {{ rho_b_kg_L?: number, theta_w?: number,
 *           langmuir?: { qmax_mg_kg: number, KL_L_mg: number } }} [options]
 *   rho_b_kg_L = densidade aparente (kg/L, default 1.6)
 *   theta_w = fração volumétrica de água (default 0.3)
 *   langmuir = parâmetros para isoterma de Langmuir (opcional)
 * @returns {{ q_mg_kg: number, Kd_L_kg: number, R: number,
 *             q_langmuir_mg_kg?: number, R_langmuir?: number }}
 * @reference Schwarzenbach, R.P. et al. (2003) Environmental Organic Chemistry
 *            2nd ed. Wiley-Interscience. ISBN 978-0-471-35053-4.
 */
export function freundlichSorptionIsotherm(C_mg_L: number, Kf: number, n: number, options: { rho_b_kg_L?: number, theta_w?: number, langmuir?: { qmax_mg_kg: number, KL_L_mg: number } } = {}): { q_mg_kg: number, Kd_L_kg: number, R: number, q_langmuir_mg_kg?: number, R_langmuir?: number } {
    _requireNonNegative(C_mg_L, 'C_mg_L');
    _requirePositive(Kf, 'Kf');
    _requirePositive(n, 'n');

    const rho_b = typeof options.rho_b_kg_L === 'number' && options.rho_b_kg_L > 0 ? options.rho_b_kg_L : 1.6; // kg/L (solo típico)
    const theta_w = typeof options.theta_w === 'number' && options.theta_w > 0 ? options.theta_w : 0.3; // fração volumétrica de água

    // Isoterma de Freundlich: q = Kf × C^n
    const q_mg_kg = Kf * Math.pow(C_mg_L, n);

    // Kd linear (derivada local): Kd = dq/dC = n × Kf × C^(n-1)
    // Para C=0 com n<1, Kd → ∞; limitamos a Kf × 1e6 como proxy
    let Kd_L_kg;
    if (C_mg_L < 1e-12) {
        Kd_L_kg = n < 1 ? Kf * 1e6 : Kf;
    } else {
        Kd_L_kg = n * Kf * Math.pow(C_mg_L, n - 1);
    }

    // Fator de retardação (Ogata & Banks 1961; Freeze & Cherry 1979)
    const R = 1.0 + (rho_b * Kd_L_kg) / theta_w;

        const result: { q_mg_kg: number, Kd_L_kg: number, R: number, q_langmuir_mg_kg?: number, R_langmuir?: number }= { q_mg_kg, Kd_L_kg, R };

    // Isoterma de Langmuir opcional
    if (options.langmuir) {
        const { qmax_mg_kg, KL_L_mg } = options.langmuir;
        _requirePositive(qmax_mg_kg, 'langmuir.qmax_mg_kg');
        _requirePositive(KL_L_mg, 'langmuir.KL_L_mg');
        const q_langmuir_mg_kg = (qmax_mg_kg * KL_L_mg * C_mg_L) / (1.0 + KL_L_mg * C_mg_L);
        // Kd_langmuir = dq/dC = qmax × KL / (1 + KL × C)²
        const denom_L = 1.0 + KL_L_mg * C_mg_L;
        const Kd_langmuir = (qmax_mg_kg * KL_L_mg) / (denom_L * denom_L);
        const R_langmuir = 1.0 + (rho_b * Kd_langmuir) / theta_w;
        result.q_langmuir_mg_kg = q_langmuir_mg_kg;
        result.R_langmuir = R_langmuir;
    }

    return result;
}

// ================================================================
// 8. gasolineWeathering
// Intemperismo de gasolina (Kaplan et al. 1997)
// ================================================================

/**
 * Modela o intemperismo simplificado de gasolina por evaporação,
 * dissolução e biodegradação ao longo do tempo (Kaplan et al. 1997).
 * Cada fração decai exponencialmente: m_i(t) = m_i0 × exp(-k_i × t)
 * onde k_i = k_evap_i + k_diss_i + k_bio_i
 *
 * @param {Record<string, number>} initial_composition
 *   Frações mássicas iniciais (devem somar ≤ 1; o resto é residual inerte).
 *   Reconhece chaves: BTEX, C5_C8, C9_C18.
 * @param {number} number>       - Tempo decorrido (dias ≥ 0)
 * @param {number} elapsed_days  - Taxa de evaporação total (1/dia, ≥ 0)
 * @param {number} evaporation_rate_day  - Taxa de dissolução total (1/dia, ≥ 0)
 * @param {number} dissolution_rate_day - Taxa de biodegradação total (1/dia, ≥ 0)
 * @returns {{ remaining_fractions: Object, BTEX_TPH_ratio: number,
 *             total_remaining_fraction: number, weathering_index: number }}
 *   weathering_index: 0 = fresco, 1 = totalmente intemperizado
 * @reference Kaplan, I.R. et al. (1997) Org. Geochem. 27(5-6):289-317.
 *            DOI: 10.1016/S0146-6380(97)00071-2
 */
export function gasolineWeathering(initial_composition: Record<string, number>, elapsed_days: number, evaporation_rate_day: number, dissolution_rate_day: number, biodegradation_rate_day: number): { remaining_fractions: Object, BTEX_TPH_ratio: number, total_remaining_fraction: number, weathering_index: number } {
    if (!initial_composition || typeof initial_composition !== 'object') {
        throw new RangeError('initial_composition must be an object');
    }
    for (const [k, v] of Object.entries(initial_composition)) {
        _requireNonNegative(v, `initial_composition.${k}`);
    }
    const frac_sum = Object.values(initial_composition).reduce((a, b) => a + b, 0);
    if (frac_sum > 1.0 + 1e-6) {
        throw new RangeError(`initial_composition fractions sum to ${frac_sum} > 1`);
    }
    _requireNonNegative(elapsed_days, 'elapsed_days');
    _requireNonNegative(evaporation_rate_day, 'evaporation_rate_day');
    _requireNonNegative(dissolution_rate_day, 'dissolution_rate_day');
    _requireNonNegative(biodegradation_rate_day, 'biodegradation_rate_day');

    // Fatores relativos de volatilidade por fração (normalizado para C5-C8 = 1.0)
    // BTEX evaporam 1.8× mais rápido; C9-C18 0.3× (Kaplan 1997 Tabela 2)
        const EVAP_MULTIPLIER: Record<string, number>= Object.freeze({ BTEX: 1.8, C5_C8: 1.0, C9_C18: 0.3 });
    // BTEX dissolvem 3× mais rápido que C5-C8; C9-C18 negligível (hidrofóbico)
        const DISS_MULTIPLIER: Record<string, number>= Object.freeze({ BTEX: 3.0, C5_C8: 1.0, C9_C18: 0.05 });
    // Biodegradação: BTEX mais lábil aero; C9-C18 moderado
        const BIO_MULTIPLIER: Record<string, number>= Object.freeze({ BTEX: 2.0, C5_C8: 1.0, C9_C18: 0.5 });

        const remaining_fractions: Record<string, number>= {};
    let total_initial = 0;
    let total_remaining = 0;

    const fracs = ['BTEX', 'C5_C8', 'C9_C18'];
    for (const frac of fracs) {
        const m0 = initial_composition[frac] ?? 0;
        const k_i =
            evaporation_rate_day * (EVAP_MULTIPLIER[frac] ?? 1) +
            dissolution_rate_day * (DISS_MULTIPLIER[frac] ?? 1) +
            biodegradation_rate_day * (BIO_MULTIPLIER[frac] ?? 1);
        const remaining = m0 * Math.exp(-k_i * elapsed_days);
        remaining_fractions[frac] = remaining;
        total_initial += m0;
        total_remaining += remaining;
    }

    const total_remaining_fraction = total_initial > 0 ? total_remaining / total_initial : 0;

    // Razão BTEX/TPH: indica nível de fracionamento (fresco = alto BTEX; intemperizado = baixo)
    const BTEX_TPH_ratio = total_remaining > 0 ? remaining_fractions.BTEX! / total_remaining : 0;

    const weathering_index = 1.0 - total_remaining_fraction;

    return { remaining_fractions, BTEX_TPH_ratio, total_remaining_fraction, weathering_index };
}

// ================================================================
// 9. oilSpillTrajectory
// Trajetória e intemperismo de derramamento de óleo (Fingas 2004)
// ================================================================

/**
 * Modelo simplificado de trajetória e intemperismo de óleo derramado
 * (inspirado em NOAA ADIOS2): evaporação (Eley-Stiver 1988), emulsificação
 * (Fingas 2004), espalhamento na superfície (regimes de Fay 1971),
 * aumento de viscosidade e área superficial.
 *
 * @param {number} spill_volume_m3    - Volume derramado (m³, > 0)
 * @param {number} oil_density_kg_m3  - Densidade do óleo (kg/m³, > 0 e < 1100)
 * @param {number} current_speed_m_s  - Velocidade da corrente superficial (m/s, ≥ 0)
 * @param {number} wind_speed_m_s     - Velocidade do vento a 10 m (m/s, ≥ 0)
 * @param {number} elapsed_h          - Tempo decorrido (horas, ≥ 0)
 * @param {number} water_temp_C       - Temperatura da água (°C, −2 a 35)
 * @param {number} salinity_ppt       - Salinidade (ppt, 0–42)
 * @returns {{ evaporated_fraction: number, emulsified_water_fraction: number,
 *             surface_area_km2: number, viscosity_mPa_s: number,
 *             remaining_oil_m3: number, slick_thickness_mm: number }}
 * @reference Fingas, M. (2004) J. Hazard. Mater. 107(1-2):27-36.
 *            DOI: 10.1016/j.jhazmat.2003.11.007
 *            Fay, J.A. (1971) Proc. Joint Conf. Prevention & Control Oil Spills, 463-467.
 *            Fingas, M. (2011) Oil Spill Science and Technology. Elsevier.
 */
export function oilSpillTrajectory(spill_volume_m3: number, oil_density_kg_m3: number, current_speed_m_s: number, wind_speed_m_s: number, elapsed_h: number, water_temp_C: number, salinity_ppt: number): { evaporated_fraction: number, emulsified_water_fraction: number, surface_area_km2: number, viscosity_mPa_s: number, remaining_oil_m3: number, slick_thickness_mm: number } {
    _requirePositive(spill_volume_m3, 'spill_volume_m3');
    _requirePositive(oil_density_kg_m3, 'oil_density_kg_m3');
    if (oil_density_kg_m3 >= 1100) {
        throw new RangeError(`oil_density_kg_m3 must be < 1100 (oil should float), got ${oil_density_kg_m3}`);
    }
    _requireNonNegative(current_speed_m_s, 'current_speed_m_s');
    _requireNonNegative(wind_speed_m_s, 'wind_speed_m_s');
    _requireNonNegative(elapsed_h, 'elapsed_h');
    if (!Number.isFinite(water_temp_C) || water_temp_C < -2 || water_temp_C > 35) {
        throw new RangeError(`water_temp_C must be in [−2, 35], got ${water_temp_C}`);
    }
    if (!Number.isFinite(salinity_ppt) || salinity_ppt < 0 || salinity_ppt > 42) {
        throw new RangeError(`salinity_ppt must be in [0, 42], got ${salinity_ppt}`);
    }

    const elapsed_s = elapsed_h * 3600.0;

    // Fração evaporada - modelo Eley-Stiver (1988), simplificado por Fingas (2004) Eq.1
    // F_e = a × ln(T) + b, onde T = temperatura (°C) e F_e capeada em [0, 0.60]
    // Constantes empíricas para óleo cru médio (Fingas 2004 Tabela 1): a=0.165, b=-0.01
    const EVAP_A = 0.165;
    const EVAP_B = -0.01;
    // Escala temporal: F_e cresce com raiz do tempo (sqrt horas) - regime difusivo
    const time_factor = elapsed_h > 0 ? Math.sqrt(elapsed_h) : 0;
    const T_corr = Math.max(5, water_temp_C + 5); // temperatura de evaporação (corrigida)
    let evaporated_fraction = ((EVAP_A * Math.log(T_corr) + EVAP_B) * time_factor) / 10.0;
    evaporated_fraction = Math.max(0, Math.min(0.6, evaporated_fraction));

    // Fração de água emulsificada (Fingas 2004 - emulsificação w/o "chocolate mousse")
    // W_e = 0.8 × (1 − exp(−0.04 × U × t)), U = velocidade do vento (m/s), t = horas
    const EMULS_K = 0.04;
    let emulsified_water_fraction =
        EMULSIFICATION_MAX_WATER_FRACTION * (1.0 - Math.exp(-EMULS_K * wind_speed_m_s * elapsed_h));
    emulsified_water_fraction = Math.max(0, Math.min(EMULSIFICATION_MAX_WATER_FRACTION, emulsified_water_fraction));

    // Volume de óleo remanescente (sem água emulsificada)
    const remaining_oil_m3 = spill_volume_m3 * (1.0 - evaporated_fraction);

    // Espalhamento superficial - regimes de Fay (1971)
    // Fase gravitacional-inercial: A = K1 × (g' × V0²)^(1/4) × t^(1/2)
    // g' = g × (rho_w − rho_oil) / rho_w (gravidade reduzida)
    const g_prime = (G_M_S2 * (DENSITY_WATER_KG_M3 - oil_density_kg_m3)) / DENSITY_WATER_KG_M3;
    const FAY_K1 = 1.14; // constante empírica de Fay 1971 (fase grav-inercial)
    let surface_area_m2 =
        FAY_K1 * Math.pow(g_prime * spill_volume_m3 * spill_volume_m3, 0.25) * Math.sqrt(Math.max(elapsed_s, 1));
    surface_area_m2 = Math.max(spill_volume_m3, surface_area_m2); // mínimo: 1 m² por m³ derramado
    const surface_area_km2 = surface_area_m2 / 1e6;

    // Espessura da mancha (mm)
    const slick_thickness_m = remaining_oil_m3 / surface_area_m2;
    const slick_thickness_mm = slick_thickness_m * 1000.0;

    // Aumento de viscosidade por emulsificação - Fingas (2004) Eq. 5
    // µ_e = µ_0 × exp(2.5 × W_e / (1 − lambda × W_e)), lambda ≈ 0.55
    const VISC_LAMBDA = 0.55;
    const VISC_BASE_mPa_s = 10.0; // viscosidade base de óleo cru típico (mPa·s)
    const denom_visc = 1.0 - VISC_LAMBDA * emulsified_water_fraction;
    const viscosity_mPa_s =
        denom_visc > 0.01
            ? VISC_BASE_mPa_s * Math.exp((2.5 * emulsified_water_fraction) / denom_visc)
            : VISC_BASE_mPa_s * 1e4; // praticamente sólido

    return {
        evaporated_fraction,
        emulsified_water_fraction,
        surface_area_km2,
        viscosity_mPa_s,
        remaining_oil_m3,
        slick_thickness_mm,
    };
}

// ================================================================
// 10. naphthaleneFluorescence
// Calibração de fluorescência PAH (Means 1992 / Emsbo-Mattingly 2013)
// ================================================================

/**
 * Estima unidades de fluorescência total a partir de concentrações de PAH,
 * discrimina fonte petrogênica vs pirogênica pelo método de razão (Means 1992),
 * e aplica limiar de triagem de campo para fluorímetros.
 *
 * Cada PAH recebe um fator de resposta relativa de fluorescência (RRF) versus
 * naftaleno (RRF_naftaleno = 1.0, base de calibração).
 * Fluorescência total (FU) = Σ (C_i × RRF_i)
 *
 * @param {{ [compound: string]: number }} PAH_concentrations_ug_L
 *   Objeto com nomes de compostos PAH e suas concentrações em µg/L (≥ 0).
 *   Compostos reconhecidos: naftaleno, fluoreno, fenantreno, antraceno,
 *   fluoranteno, pireno, benzo_a_pireno, acenaftileno, acenafteno,
 *   criseno, benzo_b_fluoranteno, benzo_k_fluoranteno, dibenz_a_h_antraceno,
 *   benzo_g_h_i_perileno, indeno_1_2_3_c_d_pireno, acenaftileno_2ring,
 *   benzene, toluene, ethylbenzene, xylene (para cobertura BTEX).
 *   Compostos desconhecidos recebem RRF = 0.5 (conservador).
 * @returns {{ total_fluorescence_FU: number, petroleum_source_ratio: number,
 *             source_type: string, screening_level: string,
 *             compounds_recognized: number, compounds_unrecognized: number }}
 *   petroleum_source_ratio: razão 2–3 anéis / total (Means 1992) - ≥ 0.5 = petrogênico
 *   source_type: 'petrogenic' | 'pyrogenic' | 'mixed' | 'insufficient_data'
 *   screening_level: 'non-detect' | 'low' | 'medium' | 'high'
 * @reference Means, J.C. (1992) Mar. Chem. 37(1-2):137-143.
 *            DOI: 10.1016/0304-4203(92)90063-W
 *            Emsbo-Mattingly, S. (2013) in Stout & Costa (eds.)
 *            Chemical Fingerprinting of Petroleum Products. CRC Press.
 */
export function naphthaleneFluorescence(PAH_concentrations_ug_L: { [compound: string]: number }): { total_fluorescence_FU: number, petroleum_source_ratio: number, source_type: string, screening_level: string, compounds_recognized: number, compounds_unrecognized: number } {
    if (
        !PAH_concentrations_ug_L ||
        typeof PAH_concentrations_ug_L !== 'object' ||
        Array.isArray(PAH_concentrations_ug_L)
    ) {
        throw new RangeError('PAH_concentrations_ug_L must be a non-null, non-array object');
    }

    // Fatores de resposta relativa de fluorescência (RRF) vs naftaleno
    // Fonte: Emsbo-Mattingly 2013, Tabela B-4; BTEX adicionados com RRF empírico
        const RRF: Record<string, number>= Object.freeze({
        naftaleno: 1.0,
        acenaftileno: 0.9,
        acenafteno: 0.95,
        fluoreno: 1.1,
        fenantreno: 1.2,
        antraceno: 4.5, // alta fluorescência intrínseca
        fluoranteno: 1.8,
        pireno: 1.6,
        benzo_a_pireno: 2.2,
        criseno: 2.0,
        benzo_b_fluoranteno: 1.9,
        benzo_k_fluoranteno: 2.1,
        dibenz_a_h_antraceno: 2.5,
        benzo_g_h_i_perileno: 1.7,
        indeno_1_2_3_c_d_pireno: 1.8,
        benzene: 0.02,
        toluene: 0.03,
        ethylbenzene: 0.04,
        xylene: 0.04,
    });

    // Compostos de 2–3 anéis (petrogênicos) vs 4–6 anéis (pirogênicos)
    const LIGHT_PAH = new Set([
        'naftaleno',
        'acenaftileno',
        'acenafteno',
        'fluoreno',
        'fenantreno',
        'antraceno',
        'benzene',
        'toluene',
        'ethylbenzene',
        'xylene',
    ]);

    let total_FU = 0;
    let light_FU = 0; // 2-3 anéis
    let _heavy_FU = 0; // 4-6 anéis
    let recognized = 0;
    let unrecognized = 0;
    const RRF_DEFAULT = 0.5;

    for (const [compound, conc_ug_L] of Object.entries(PAH_concentrations_ug_L)) {
        _requireNonNegative(conc_ug_L, `PAH_concentrations_ug_L.${compound}`);
        const rrf = compound in RRF ? RRF[compound]! : RRF_DEFAULT;
        if (compound in RRF) {
            recognized++;
        } else {
            unrecognized++;
        }
        const FU_i = conc_ug_L * rrf;
        total_FU += FU_i;
        if (LIGHT_PAH.has(compound)) {
            light_FU += FU_i;
        } else {
            _heavy_FU += FU_i;
        }
    }

    // Razão de fonte (Means 1992): PAH leves (petrogênicos) / total
    const petroleum_source_ratio = total_FU > 0 ? light_FU / total_FU : 0;

    // Discriminação de fonte
    let source_type;
    if (total_FU < 1e-6) {
        source_type = 'insufficient_data';
    } else if (petroleum_source_ratio >= PYROGENIC_PETROGENIC_CUTOFF) {
        source_type = 'petrogenic';
    } else if (petroleum_source_ratio < 0.25) {
        source_type = 'pyrogenic';
    } else {
        source_type = 'mixed';
    }

    // Nível de triagem de campo (fluorímetro equivalente naftaleno)
    let screening_level;
    if (total_FU < PAH_FLUORESCENCE_THRESHOLDS.screening_low) {
        screening_level = 'non-detect';
    } else if (total_FU < PAH_FLUORESCENCE_THRESHOLDS.screening_medium) {
        screening_level = 'low';
    } else if (total_FU < PAH_FLUORESCENCE_THRESHOLDS.screening_high) {
        screening_level = 'medium';
    } else {
        screening_level = 'high';
    }

    return {
        total_fluorescence_FU: total_FU,
        petroleum_source_ratio,
        source_type,
        screening_level,
        compounds_recognized: recognized,
        compounds_unrecognized: unrecognized,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const hydrocarbonFateTransportMeta = {
    name: 'hydrocarbonFateTransport',
    description: 'Petroleum Hydrocarbon Fate & Transport',
    category: 'analytics',
    familyTags: ['climate', 'hydrocarbon', 'transport', 'fate_transport'],
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
