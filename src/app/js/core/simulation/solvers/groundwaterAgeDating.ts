// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

console.debug('[gwage:load]', 'app/js/core/simulation/solvers/groundwaterAgeDating.ts');
// 10 functions: tritiumHeliumAge, radiocarbon14C, cfc12Age, sf6Age, helium4Accumulation,
//               mixingCorrectedAge, exponentialMixingModel, hydraulicAgeEstimate,
//               carbonIsotopesDIC, ageUncertaintyPropagation

/**
 * Groundwater Age Dating - pure-math module.
 *
 * Implements environmental isotope and chemical tracer methods for determining
 * groundwater residence time. All functions are pure (no DOM, no IDB, no fetch).
 *
 * @module groundwaterAgeDating
 * @since 2026-04-24
 *
 * References compiladas neste módulo:
 *   Schlosser et al. (1988) JGR; Fontes & Edmunds (1993) HJ; Stuiver & Polach (1977);
 *   Busenberg & Plummer (1992, 2000) WRR; Warner & Weiss (1985); Bullister et al. (2002);
 *   Andrews (1985) Chem. Geol.; Torgersen & Clarke (1985); Plummer et al. (1993) Appl. Geochem.;
 *   Maloszewski & Zuber (1982) J. Hydrol.; Freeze & Cherry (1979) Groundwater;
 *   Pearson & White (1967) WRR; JCGM 100:2008 GUM; Clark & Fritz (1997).
 */

// ---------------------------------------------------------------------------
// Constantes físicas / Physical constants
// ---------------------------------------------------------------------------

/** Constante de decaimento do trítio (yr⁻¹) — meia-vida 12,32 anos */
const LAMBDA_TRITIUM = Math.LN2 / 12.32;

/** Vida média do 14C em anos — τ = T½ / ln2 = 5730 / ln2 */
const TAU_14C = 8267; // anos / years

/** DIAS POR ANO (fator de conversão de velocidade Darcy) */
const DAYS_PER_YEAR = 365.25;

// ---------------------------------------------------------------------------
// Helpers internos / Internal helpers
// ---------------------------------------------------------------------------

/**
 * Valida que todos os argumentos são números finitos e maiores que zero.
 * Throws RangeError se qualquer valor falhar na verificação.
 * @param pairs - { nome: valor }
 */
function _requirePositive(pairs: Record<string, number>): void {
    for (const [name, val] of Object.entries(pairs)) {
        if (!Number.isFinite(val) || val <= 0) {
            throw new RangeError(`${name} must be a finite positive number, got ${val}`);
        }
    }
}

/**
 * Valida que todos os argumentos são números finitos (positivos ou negativos).
 * @param pairs - { nome: valor }
 */
function _requireFinite(pairs: Record<string, number>): void {
    for (const [name, val] of Object.entries(pairs)) {
        if (!Number.isFinite(val)) {
            throw new RangeError(`${name} must be a finite number, got ${val}`);
        }
    }
}

// ---------------------------------------------------------------------------
// 1. Tritium-Helium-3 Age  (Schlosser et al. 1988)
// ---------------------------------------------------------------------------

/**
 * Calcula a idade da água subterrânea pelo método trítio-hélio-3.
 * t = (1/lambda_T) x ln(1 + He3_exc/T)  [where He3_exc = tritiogenic excess He-3]
 *
 * @param tritium_TU - Concentração de trítio medida (TU, unidades de trítio)
 * @param helium3_excess_TU - Excesso de He-3 tritiogênico (TU)
 * @returns age result
 *
 * Reference: Schlosser, P. et al. (1988). Transient tracers in the ocean.
 *   Journal of Geophysical Research, 93(C12), 15321-15330.
 */
export function tritiumHeliumAge(tritium_TU: number, helium3_excess_TU: number): {
    age_years: number;
    lambda_yr: number;
    tritium_TU: number;
    he3_excess_TU: number;
} {
    _requirePositive({ tritium_TU, helium3_excess_TU });

    // Equação 1 de Schlosser 1988: t = ln(1 + He3*/T) / λ_T
    const age_years = Math.log(1 + helium3_excess_TU / tritium_TU) / LAMBDA_TRITIUM;

    return Object.freeze({
        age_years,
        lambda_yr: LAMBDA_TRITIUM,
        tritium_TU,
        he3_excess_TU: helium3_excess_TU,
    });
}

// ---------------------------------------------------------------------------
// 2. Radiocarbono 14C (Fontes & Edmunds 1993; Stuiver & Polach 1977)
// ---------------------------------------------------------------------------

/**
 * Calcula a idade convencional e corrigida por carbono morto do 14C.
 * Convencional: t = -τ × ln(A/A0)
 * Correção Fontes-Edmunds: A_corr = A / (1 - f_dead)
 *
 * @param a14C_pmC - Atividade medida do 14C (pmC, percentagem do moderno)
 * @param a0_pmC - Atividade inicial do 14C (pmC), default 100
 * @param deadCarbon - Fração de carbono morto (0–1), default 0.15
 * @returns age result
 *
 * Reference: Fontes, J.-Ch. & Edmunds, W.M. (1993). The use of environmental isotope techniques
 *   in arid zone hydrology. A critical review. Hydrogeology Journal, 1(1), 25-67.
 *   Stuiver, M. & Polach, H.A. (1977). Discussion: reporting of 14C data. Radiocarbon, 19(3), 355-363.
 */
export function radiocarbon14C(a14C_pmC: number, a0_pmC = 100, deadCarbon = 0.15): {
    age_years_conventional: number;
    age_years_corrected: number;
    a14c_pmC: number;
    dead_carbon_fraction: number;
} {
    _requirePositive({ a14C_pmC, a0_pmC });
    _requireFinite({ deadCarbon });
    if (deadCarbon < 0 || deadCarbon >= 1) {
        throw new RangeError(`deadCarbon must be in [0, 1), got ${deadCarbon}`);
    }
    if (a14C_pmC >= a0_pmC) {
        throw new RangeError(`a14C_pmC (${a14C_pmC}) must be less than a0_pmC (${a0_pmC})`);
    }

    // Idade convencional sem correção
    const age_years_conventional = -TAU_14C * Math.log(a14C_pmC / a0_pmC);

    // Correção de carbono morto: aumenta a atividade corrigida, reduz a idade
    const a14C_corrected = a14C_pmC / (1 - deadCarbon);
    const age_years_corrected = -TAU_14C * Math.log(a14C_corrected / a0_pmC);

    return Object.freeze({
        age_years_conventional,
        age_years_corrected,
        a14c_pmC: a14C_pmC,
        dead_carbon_fraction: deadCarbon,
    });
}

// ---------------------------------------------------------------------------
// 3. CFC-12 Apparent Age  (Busenberg & Plummer 1992; Warner & Weiss 1985)
// ---------------------------------------------------------------------------

/**
 * Histórico atmosférico CFC-12 simplificado (ppm no ar seco, aproximação linear por partes).
 * Dados derivados de tabelas de Busenberg & Plummer (1992) WRR.
 * Unidades: pptv (partes por trilhão em volume) - aproximação para referência de equilíbrio.
 * Cada ponto: [ano, pCFC12_pptv]
 */
const CFC12_HISTORY: [number, number][] = [
    [1940, 0.5],
    [1945, 1.0],
    [1950, 2.0],
    [1955, 5.0],
    [1960, 20.0],
    [1965, 50.0],
    [1970, 100.0],
    [1975, 170.0],
    [1980, 250.0],
    [1985, 330.0],
    [1990, 395.0],
    [1995, 415.0],
    [2000, 430.0],
];

/**
 * Interpola o histórico atmosférico para obter pCFC-12 em um dado ano de recarga.
 * @param year - year
 * @returns pCFC-12 em pptv
 */
function _cfc12AtmosphericPressure(year: number): number {
    if (year <= CFC12_HISTORY[0]![0]) return CFC12_HISTORY[0]![1];
    const last = CFC12_HISTORY[CFC12_HISTORY.length - 1]!;
    if (year >= last[0]) return last[1];
    for (let i = 1; i < CFC12_HISTORY.length; i++) {
        if (year <= CFC12_HISTORY[i]![0]) {
            const [y0, c0] = CFC12_HISTORY[i - 1]!;
            const [y1, c1] = CFC12_HISTORY[i]!;
            return c0 + ((c1 - c0) * (year - y0)) / (y1 - y0);
        }
    }
    return last[1];
}

/**
 * Calcula a solubilidade do CFC-12 (Warner & Weiss 1985) em pmol/kg/pptv.
 * Usa lei de Van't Hoff com valor de referencia calibrado a 10 graus C.
 * KH(T) = KH_ref * exp(-|dH|/R * (1/T_ref - 1/T_K))
 * Referencia: KH ~ 2.6e-3 pmol/kg/pptv a 10 graus C, salinidade zero
 *   (Plummer et al. 1993, Tabela 2; Busenberg & Plummer 1992).
 * A solubilidade DIMINUI com temperatura (gases apolares, Lei de Henry).
 * @param T_K - Temperatura em Kelvin
 * @param S - Salinidade (PSU)
 * @returns Solubilidade F (pmol/kg/pptv)
 */
function _cfc12Solubility(T_K: number, S: number): number {
    // Valor de referencia a 10 graus C (283.15 K), salinidade zero
    const KH_REF = 2.6e-3; // pmol/kg/pptv
    const T_REF = 283.15; // K
    const DH_R = 2650; // |dH|/R em K (dH aprox 22 kJ/mol para CFC-12)
    // Correcao de temperatura: solubilidade menor em agua mais quente
    const F_fresh = KH_REF * Math.exp(-DH_R * (1 / T_REF - 1 / T_K));
    // Correcao de salinidade (reduz solubilidade ~2% por PSU)
    return F_fresh * Math.exp(-0.02 * S);
}

/**
 * Calcula a idade aparente por CFC-12.
 * Compara concentração medida com curva histórica atmosférica para inferir ano de recarga.
 *
 * @param cfc12_pmolkg - Concentração de CFC-12 medida (pmol/kg)
 * @param temperature_c - Temperatura de recarga (°C)
 * @param salinity - Salinidade (PSU), default 0
 * @returns age result
 *
 * Reference: Busenberg, E. & Plummer, L.N. (1992). Use of chlorofluorocarbons (CCl3F and CCl2F2)
 *   as hydrologic tracers and age-dating tools. Water Resources Research, 28(9), 2257-2283.
 *   Warner, M.J. & Weiss, R.F. (1985). Solubilities of chlorofluorocarbons 11 and 12 in water.
 *   Deep-Sea Research, 32(12), 1485-1497.
 */
export function cfc12Age(cfc12_pmolkg: number, temperature_c: number, salinity = 0): {
    apparent_age_years: number;
    recharge_year: number;
    cfc12_pmolkg: number;
    method: string;
} {
    _requirePositive({ cfc12_pmolkg });
    _requireFinite({ temperature_c, salinity });

    const T_K = temperature_c + 273.15;
    if (T_K <= 0) throw new RangeError(`temperature_c (${temperature_c}) results in non-positive Kelvin`);

    const F = _cfc12Solubility(T_K, salinity); // pmol/kg/pptv

    // Buscar o ano de recarga que produziria a concentração medida
    // C_eq = pCFC * F  →  pCFC = C_meas / F
    const pCFC_equiv = cfc12_pmolkg / F; // pptv equivalente

    // Encontrar o ano na curva histórica
    let recharge_year = CFC12_HISTORY[0]![0];
    for (let i = 1; i < CFC12_HISTORY.length; i++) {
        const [y0, c0] = CFC12_HISTORY[i - 1]!;
        const [y1, c1] = CFC12_HISTORY[i]!;
        if (pCFC_equiv >= c0 && pCFC_equiv <= c1) {
            recharge_year = y0 + ((pCFC_equiv - c0) / (c1 - c0)) * (y1 - y0);
            break;
        }
        if (pCFC_equiv > c1 && i === CFC12_HISTORY.length - 1) {
            // Acima do máximo histórico - concentração moderna, idade ~0
            recharge_year = y1;
        }
    }

    const current_year = 2000; // ano de referência da curva histórica utilizada
    const apparent_age_years = Math.max(0, current_year - recharge_year);

    return Object.freeze({
        apparent_age_years,
        recharge_year,
        cfc12_pmolkg,
        method: 'CFC-12',
    });
}

// ---------------------------------------------------------------------------
// 4. SF6 Apparent Age  (Busenberg & Plummer 2000)
// ---------------------------------------------------------------------------

/**
 * Histórico atmosférico SF6 simplificado (pptv no ar, aproximação linear por partes).
 * Baseado em Busenberg & Plummer (2000) WRR Tabela 1.
 */
const SF6_HISTORY: [number, number][] = [
    [1970, 0.01],
    [1975, 0.05],
    [1980, 0.15],
    [1985, 0.4],
    [1990, 0.8],
    [1995, 1.5],
    [2000, 3.0],
    [2005, 4.5],
    [2010, 6.5],
];

/**
 * Calcula a solubilidade do SF6 (Bullister et al. 2002) em fmol/kg/pptv.
 * Usa lei de Van't Hoff com valor de referência calibrado a 10°C.
 * KH(T) = KH_ref × exp(-|ΔH|/R × (1/T_ref - 1/T_K))
 * Referência: KH ≈ 2.0×10⁻⁴ fmol/kg/pptv a 10°C freshwater (Bullister et al. 2002)
 * @param T_K - Temperatura em Kelvin
 * @returns Solubilidade (fmol/kg/pptv)
 */
function _sf6Solubility(T_K: number): number {
    // Valor de referência a 10°C, salinidade zero (Bullister et al. 2002)
    const KH_REF = 2.0e-4; // fmol/kg/pptv
    const T_REF = 283.15; // K
    const DH_R = 3200; // |ΔH|/R em K (ΔH ≈ 26.6 kJ/mol para SF6)
    // Solubilidade diminui com temperatura
    return KH_REF * Math.exp(-DH_R * (1 / T_REF - 1 / T_K));
}

/**
 * Calcula a idade aparente por SF6.
 *
 * @param sf6_fmolkg - Concentração de SF6 medida (fmol/kg)
 * @param temperature_c - Temperatura de recarga (°C)
 * @returns age result
 *
 * Reference: Busenberg, E. & Plummer, L.N. (2000). Dating young groundwater with sulfur hexafluoride:
 *   natural and anthropogenic sources of sulfur hexafluoride. Water Resources Research, 36(10), 3011-3030.
 *   Bullister, J.L. et al. (2002). The solubility of sulfur hexafluoride in water and seawater.
 *   Deep-Sea Research I, 49(1), 175-187.
 */
export function sf6Age(sf6_fmolkg: number, temperature_c: number): {
    apparent_age_years: number;
    recharge_year: number;
    sf6_fmolkg: number;
    method: string;
} {
    _requirePositive({ sf6_fmolkg });
    _requireFinite({ temperature_c });

    const T_K = temperature_c + 273.15;
    if (T_K <= 0) throw new RangeError(`temperature_c (${temperature_c}) results in non-positive Kelvin`);

    const F = _sf6Solubility(T_K); // fmol/kg/pptv
    const pSF6_equiv = sf6_fmolkg / F; // pptv equivalente

    let recharge_year = SF6_HISTORY[0]![0];
    for (let i = 1; i < SF6_HISTORY.length; i++) {
        const [y0, c0] = SF6_HISTORY[i - 1]!;
        const [y1, c1] = SF6_HISTORY[i]!;
        if (pSF6_equiv >= c0 && pSF6_equiv <= c1) {
            recharge_year = y0 + ((pSF6_equiv - c0) / (c1 - c0)) * (y1 - y0);
            break;
        }
        if (i === SF6_HISTORY.length - 1 && pSF6_equiv > c1) {
            recharge_year = y1;
        }
    }

    const current_year = 2010;
    const apparent_age_years = Math.max(0, current_year - recharge_year);

    return Object.freeze({
        apparent_age_years,
        recharge_year,
        sf6_fmolkg,
        method: 'SF6',
    });
}

// ---------------------------------------------------------------------------
// 5. Acumulação de He-4  (Andrews 1985; Torgersen & Clarke 1985)
// ---------------------------------------------------------------------------

/**
 * Estima a idade por acumulação de He-4 radiogênico da crosta continental.
 * t = [He-4] / J_He4
 *
 * @param he4_ccSTP_g - Concentração de He-4 terrigênico (cm³ STP/g)
 * @param production_rate - Taxa de produção crustal (cm³ STP/g/yr), default 3×10⁻⁸
 * @returns age result
 *
 * Nota: incerteza ±50% devido à variabilidade da produção crustal.
 *
 * Reference: Andrews, J.N. (1985). The isotopic composition of radiogenic helium and its use
 *   to study groundwater movement in confined aquifers. Chemical Geology, 49(1-3), 339-351.
 *   Torgersen, T. & Clarke, W.B. (1985). Helium accumulation in groundwater. Geochimica et
 *   Cosmochimica Acta, 49(9), 2331-2338.
 */
export function helium4Accumulation(he4_ccSTP_g: number, production_rate = 3e-8): {
    age_years: number;
    he4_ccSTPg: number;
    production_rate: number;
} {
    _requirePositive({ he4_ccSTP_g, production_rate });

    const age_years = he4_ccSTP_g / production_rate;

    return Object.freeze({
        age_years,
        he4_ccSTPg: he4_ccSTP_g,
        production_rate,
    });
}

// ---------------------------------------------------------------------------
// 6. Correção de Mistura de Dois Membros-Extremo  (Plummer et al. 1993)
// ---------------------------------------------------------------------------

/**
 * Correção de mistura de dois membros-extremo para concentrações de traçador.
 * f_young = (C_meas - C_old) / (C_young - C_old)
 *
 * @param tracer_concentrations - Concentração medida do traçador
 * @param endmember_concentrations - Concentrações dos membros extremos
 * @returns mixing correction result
 *
 * Reference: Plummer, L.N. et al. (1993). Environmental tracers for age dating young ground water.
 *   Applied Geochemistry, 8(3), 245-271. (Chapter in Regional Groundwater Quality, ed. Alley)
 */
export function mixingCorrectedAge(
    tracer_concentrations: number,
    endmember_concentrations: { young: number; old: number } | null | undefined,
): {
    fraction_young: number;
    fraction_old: number;
    c_corrected: number;
    mixing_ratio: number;
} {
    _requireFinite({ tracer_concentrations });
    const { young, old } = endmember_concentrations ?? {};
    _requireFinite({ young: young!, old: old! });

    if (Math.abs(young! - old!) < Number.EPSILON * 100) {
        throw new RangeError(`endmember concentrations must differ (young=${young}, old=${old})`);
    }

    const fraction_young = (tracer_concentrations - old!) / (young! - old!);
    const fraction_old = 1 - fraction_young;

    // Concentração corrigida para componente jovem
    const c_corrected = fraction_young > 0 ? tracer_concentrations / fraction_young : 0;

    return Object.freeze({
        fraction_young,
        fraction_old,
        c_corrected,
        mixing_ratio: fraction_young / Math.max(fraction_old, Number.EPSILON),
    });
}

// ---------------------------------------------------------------------------
// 7. Modelo de Mistura Exponencial  (Maloszewski & Zuber 1982)
// ---------------------------------------------------------------------------

/**
 * Calcula a idade média de misturas com modelo piston-flow vs exponencial.
 * mean_age = Σ(t_i × f_i); dispersion_index = variância/média
 *
 * @param ages - Idades de cada componente (anos)
 * @param fractions - Frações de cada componente (somam 1)
 * @returns mixing model result
 *
 * Reference: Maloszewski, P. & Zuber, A. (1982). Determining the turnover time of groundwater
 *   systems with the aid of environmental tracers. Journal of Hydrology, 57(3-4), 207-231.
 */
export function exponentialMixingModel(ages: number[], fractions: number[]): {
    mean_age_years: number;
    apparent_piston_age: number;
    dispersion_index: number;
} {
    if (!Array.isArray(ages) || !Array.isArray(fractions)) {
        throw new RangeError('ages and fractions must be arrays');
    }
    if (ages.length !== fractions.length || ages.length === 0) {
        throw new RangeError('ages and fractions must be non-empty arrays of equal length');
    }
    for (let i = 0; i < ages.length; i++) {
        if (!Number.isFinite(ages[i]!) || ages[i]! < 0)
            throw new RangeError(`ages[${i}] must be finite and non-negative`);
        if (!Number.isFinite(fractions[i]!) || fractions[i]! < 0)
            throw new RangeError(`fractions[${i}] must be finite and non-negative`);
    }

    const sumF = fractions.reduce((a, b) => a + b, 0);
    if (Math.abs(sumF - 1) > 0.01) {
        throw new RangeError(`fractions must sum to 1 (got ${sumF.toFixed(4)})`);
    }

    // Idade média ponderada pelas frações (modelo exponencial)
    const mean_age_years = ages.reduce((sum, t, i) => sum + t * fractions[i]!, 0);

    // Idade piston aparente: moda da distribuição (componente de maior fração)
    const maxIdx = fractions.indexOf(Math.max(...fractions));
    const apparent_piston_age = ages[maxIdx]!;

    // Índice de dispersão: variância / média
    const variance = ages.reduce((sum, t, i) => sum + fractions[i]! * (t - mean_age_years) ** 2, 0);
    const dispersion_index = mean_age_years > 0 ? variance / mean_age_years : 0;

    return Object.freeze({
        mean_age_years,
        apparent_piston_age,
        dispersion_index,
    });
}

// ---------------------------------------------------------------------------
// 8. Estimativa de Idade Hidráulica  (Freeze & Cherry 1979)
// ---------------------------------------------------------------------------

/**
 * Estima o tempo de viagem hidráulica usando a Lei de Darcy.
 * t = L × n / (K × i)  |  velocidade Darcy: v = K × i / n
 *
 * @param distance_m - Distância de fluxo (m)
 * @param porosity - Porosidade efetiva (adimensional, 0–1)
 * @param hydraulicGradient - Gradiente hidráulico (m/m)
 * @param conductivity_m_day - Condutividade hidráulica (m/dia)
 * @returns hydraulic age estimate
 *
 * Reference: Freeze, R.A. & Cherry, J.A. (1979). Groundwater. Prentice-Hall.
 *   Chapter 2: Physical Properties and Principles, p. 45-47.
 */
export function hydraulicAgeEstimate(distance_m: number, porosity: number, hydraulicGradient: number, conductivity_m_day: number): {
    age_years: number;
    darcy_velocity_m_day: number;
    distance_m: number;
} {
    _requirePositive({ distance_m, porosity, hydraulicGradient, conductivity_m_day });
    if (porosity >= 1) throw new RangeError(`porosity must be < 1, got ${porosity}`);

    // Velocidade de Darcy: q = K × i  (m/dia)
    const darcy_velocity_m_day = conductivity_m_day * hydraulicGradient;

    // Velocidade de poros: v = q / n  (m/dia)
    const pore_velocity_m_day = darcy_velocity_m_day / porosity;

    // Tempo de viagem: t = L / v  (dias → anos)
    const age_years = distance_m / pore_velocity_m_day / DAYS_PER_YEAR;

    return Object.freeze({
        age_years,
        darcy_velocity_m_day,
        distance_m,
    });
}

// ---------------------------------------------------------------------------
// 9. Isótopos de Carbono DIC (delta-13C)  (Pearson & White 1967)
// ---------------------------------------------------------------------------

/**
 * Balanço isotópico de massa do DIC (carbono inorgânico dissolvido) para
 * correção de carbono morto no 14C.
 * q = (δ13C_DIC - δ13C_solo) / (δ13C_carbonato - δ13C_solo)
 *
 * @param delta13C_sample - δ13C do DIC da amostra (‰ VPDB)
 * @param delta13C_soil - δ13C do CO2 do solo (‰ VPDB), padrão C3 plants, default -23
 * @param delta13C_carbonate - δ13C do carbonato (‰ VPDB), padrão marinho, default 0
 * @returns isotope correction result
 *
 * Reference: Pearson, F.J. & White, D.E. (1967). Carbon 14 ages and flow rates of water
 *   in Carrizo Sand, Atascosa County, Texas. Water Resources Research, 3(1), 251-261.
 */
export function carbonIsotopesDIC(delta13C_sample: number, delta13C_soil = -23, delta13C_carbonate = 0): {
    dead_carbon_fraction: number;
    delta13C_DIC: number;
    corrected_factor: number;
} {
    _requireFinite({ delta13C_sample, delta13C_soil, delta13C_carbonate });

    if (Math.abs(delta13C_carbonate - delta13C_soil) < Number.EPSILON * 100) {
        throw new RangeError('delta13C_soil and delta13C_carbonate must differ');
    }

    // Fração q: proporção de carbono derivado do carbonato (carbono morto em 14C)
    const q = (delta13C_sample - delta13C_soil) / (delta13C_carbonate - delta13C_soil);

    // Fator de correção: A_corrected = A_measured / (1 - q)
    const corrected_factor = 1 / (1 - q);

    return Object.freeze({
        dead_carbon_fraction: q,
        delta13C_DIC: delta13C_sample,
        corrected_factor,
    });
}

// ---------------------------------------------------------------------------
// 10. Propagação de Incerteza da Idade  (GUM 2008; Clark & Fritz 1997)
// ---------------------------------------------------------------------------

/**
 * Propaga a incerteza de medição do traçador para a incerteza da idade (GUM Tier 1).
 *
 * Para radiocarbono: σ_idade = τ × σ_A / A  (derivada de t = -τ × ln(A/A0))
 * Para trítio-He: σ_idade ≈ idade × sqrt((σ_T/T)² + (σ_He/He)²) / ln(1 + He/T)
 *
 * @param age_years - Idade estimada (anos)
 * @param tracer_uncertainty_pct - Incerteza relativa do traçador (%, 1σ)
 * @param method - Método: 'radiocarbon' | 'tritium-he'
 * @returns uncertainty propagation result
 *
 * Reference: JCGM 100:2008. Evaluation of measurement data - Guide to the Expression
 *   of Uncertainty in Measurement (GUM). BIPM.
 *   Clark, I. & Fritz, P. (1997). Environmental Isotopes in Hydrogeology. CRC Press/Lewis.
 */
export function ageUncertaintyPropagation(
    age_years: number,
    tracer_uncertainty_pct: number,
    method = 'radiocarbon',
): {
    age_years: number;
    sigma_age_years: number;
    relative_uncertainty_pct: number;
    method: string;
} {
    _requirePositive({ age_years, tracer_uncertainty_pct });

    const sigma_rel = tracer_uncertainty_pct / 100; // fração relativa 1σ

    let sigma_age_years: number;

    if (method === 'radiocarbon') {
        // Derivada: dage/dA = -τ/A  →  σ_age = τ × (σ_A/A)
        // Para atividade A, σ_A/A = sigma_rel (incerteza relativa da atividade)
        sigma_age_years = TAU_14C * sigma_rel;
    } else if (method === 'tritium-he') {
        // Propagação quadrática para razão He*/T: ambos com mesma incerteza relativa
        // σ_razão/razão ≈ sqrt(σ_T² + σ_He²) / (He* + T)  →  simplificado:
        // σ_age = age × sqrt(2) × sigma_rel (caso σ_T = σ_He = sigma_rel)
        sigma_age_years = age_years * Math.SQRT2 * sigma_rel;
    } else {
        // Estimativa genérica: GUM linear propagation
        sigma_age_years = age_years * sigma_rel;
    }

    const relative_uncertainty_pct = (sigma_age_years / age_years) * 100;

    return Object.freeze({
        age_years,
        sigma_age_years,
        relative_uncertainty_pct,
        method,
    });
}

console.debug('[gwage:end]', 'app/js/core/simulation/solvers/groundwaterAgeDating.ts');
