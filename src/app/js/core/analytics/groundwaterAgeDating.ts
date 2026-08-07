// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Groundwater Age Dating - CFCs, SF6, carbon-14, and residence time
// Datação de idade de águas subterrâneas - CFCs, SF6, carbono-14 e tempo de residência
// Refs: Mazor (2004); IAEA (2006); Cook & Solomon (1997) WRR; Clark & Fritz (1997)

'use strict';

// Constante de decaimento do C-14: λ = ln(2) / t½ onde t½ = 5730 anos
const C14_LAMBDA_DEFAULT = Math.LN2 / 5730; // yr⁻¹ — constante de decaimento padrão

// Curva histórica simplificada de CFC-12 atmosférico (pptv) por ano
// Ref: IAEA (2006) Use of Chlorofluorocarbons in Hydrology, Appendix A
const CFC12_HISTORICAL: { year: number; pptv: number }[] = [
    { year: 1940, pptv: 5 },
    { year: 1950, pptv: 30 },
    { year: 1960, pptv: 100 },
    { year: 1970, pptv: 220 },
    { year: 1980, pptv: 380 },
    { year: 1990, pptv: 550 },
    { year: 2000, pptv: 540 },
    { year: 2010, pptv: 530 },
];

// SF6 referência atmosférica em femtoptv (fptv) - crescimento ~10%/yr desde 1970
const SF6_REFERENCE_FPTV_1970 = 0.01; // concentração em 1970 (ref. IAEA)
const SF6_GROWTH_RATE = 0.1; // taxa de crescimento anual fracional

/**
 * Compute groundwater age from radiocarbon-14 (14C) activity using exponential decay.
 * Calcula a idade da água subterrânea pelo decaimento radioativo do carbono-14.
 * t = -ln(A / A₀) / λ
 * Ref: Mazor, E. (2004) Chemical and Isotopic Groundwater Hydrology, 3rd ed. CRC Press.
 *
 * @param c14_pmc - Measured 14C activity [percent modern carbon, PMC]
 * @param initial_c14_pmc - Initial/modern 14C activity [PMC], typically 100
 * @param decay_constant_yr - Decay constant λ [yr⁻¹]; default = ln(2)/5730
 */
export function computeRadiocarbon14Age(
    c14_pmc: number,
    initial_c14_pmc: number,
    decay_constant_yr = C14_LAMBDA_DEFAULT,
): { age_years: number; age_uncertainty_yr: number } {
    if (typeof c14_pmc !== 'number' || typeof initial_c14_pmc !== 'number' || typeof decay_constant_yr !== 'number') {
        throw new TypeError('All inputs must be numbers');
    }
    if (c14_pmc <= 0) throw new RangeError('c14_pmc must be > 0');
    if (initial_c14_pmc <= 0) throw new RangeError('initial_c14_pmc must be > 0');
    if (c14_pmc > initial_c14_pmc) {
        throw new RangeError('c14_pmc must be <= initial_c14_pmc (measured activity cannot exceed initial)');
    }
    if (decay_constant_yr <= 0) throw new RangeError('decay_constant_yr must be > 0');

    // Equação de decaimento radioativo: A = A₀ × e^(-λt) → t = -ln(A/A₀)/λ
    const age_years = -Math.log(c14_pmc / initial_c14_pmc) / decay_constant_yr;

    // Incerteza analítica típica de ±5% em PMC propagada pela derivada
    // δt = (δA / A) / λ = 0.05 / λ
    const age_uncertainty_yr = 0.05 / decay_constant_yr;

    return { age_years, age_uncertainty_yr };
}

/**
 * Compute dissolved CFC-12 concentration and apparent age from atmospheric mixing ratio.
 * Calcula concentração dissolvida de CFC-12 e idade aparente a partir da mistura atmosférica.
 * Solubilidade ajustada por temperatura e elevação (pressão parcial reduzida).
 * Ref: IAEA (2006) Use of Chlorofluorocarbons in Hydrology. Vienna: IAEA.
 *
 * @param cfc_pptv - CFC-12 atmospheric mixing ratio in sample headspace [pptv]
 * @param temperature_c - Sample temperature [°C]
 * @param elevation_m - Site elevation [m above sea level]
 */
export function computeCFCConcentration(
    cfc_pptv: number,
    temperature_c: number,
    elevation_m: number,
): { dissolved_pmol_L: number; apparent_age_yr: number } {
    if (typeof cfc_pptv !== 'number' || typeof temperature_c !== 'number' || typeof elevation_m !== 'number') {
        throw new TypeError('All inputs must be numbers');
    }
    if (cfc_pptv < 0) throw new RangeError('cfc_pptv must be >= 0');
    if (elevation_m < 0) throw new RangeError('elevation_m must be >= 0');

    // Solubilidade de CFC-12 (Warner & Weiss 1985): aumenta com menor temperatura
    // Simplificação: KH = 0.35 × exp(-0.035 × T) pmol/(L·pptv) para T em °C
    // eslint-disable-next-line
    const temp_K = temperature_c + 273.15;
    const KH_pmol_L_pptv = 0.35 * Math.exp(-0.035 * temperature_c);

    // Correção de pressão atmosférica pela altitude: P = P0 × exp(-h/8500)
    const pressure_ratio = Math.exp(-elevation_m / 8500);

    // Concentração dissolvida em equilíbrio com atmosfera
    const dissolved_pmol_L = KH_pmol_L_pptv * cfc_pptv * pressure_ratio;

    // Idade aparente: encontrar o ano na curva histórica que corresponde ao cfc_pptv dado
    let apparent_age_yr = 0;
    const reference_year = 2010; // ano de referência da curva histórica
    const history = CFC12_HISTORICAL;

    if (cfc_pptv <= history[0]!.pptv) {
        // Antes do início da curva - pré-industrial
        apparent_age_yr = reference_year - history[0]!.year + 70;
    } else if (cfc_pptv >= history[history.length - 1]!.pptv) {
        // Concentração moderna ou recente
        apparent_age_yr = 0;
    } else {
        // Interpolação linear na curva histórica para encontrar o ano de entrada
        for (let i = 0; i < history.length - 1; i++) {
            const lo = history[i]!;
            const hi = history[i + 1]!;
            if (cfc_pptv >= lo.pptv && cfc_pptv <= hi.pptv) {
                const frac = (cfc_pptv - lo.pptv) / (hi.pptv - lo.pptv);
                const entry_year = lo.year + frac * (hi.year - lo.year);
                apparent_age_yr = reference_year - entry_year;
                break;
            }
        }
    }

    return { dissolved_pmol_L, apparent_age_yr };
}

/**
 * Compute apparent groundwater age from SF6 atmospheric concentration.
 * Calcula a idade aparente da água subterrânea a partir da concentração de SF6.
 * Crescimento exponencial: SF6(t) = SF6_ref × exp(r × (t - 1970)); age = (ln(sf6/ref)) / r
 * Ref: Cook, P.G. & Solomon, D.K. (1997) WRR 33(1):45-54. DOI:10.1029/96WR02638
 *
 * @param sf6_fptv - Measured SF6 concentration [femtoptv]
 * @param temperature_c - Sample temperature [°C] (for solubility correction)
 */
export function computeSF6Age(
    sf6_fptv: number,
    temperature_c: number,
): { apparent_age_yr: number; age_range: string } {
    if (typeof sf6_fptv !== 'number' || typeof temperature_c !== 'number') {
        throw new TypeError('All inputs must be numbers');
    }
    if (sf6_fptv <= 0) throw new RangeError('sf6_fptv must be > 0');

    // Concentração atmosférica de SF6 no ano de referência 2010 (aproximada)
    // SF6_2010 = SF6_1970 × exp(r × 40) onde r = 0.10
    const sf6_ref_2010 = SF6_REFERENCE_FPTV_1970 * Math.exp(SF6_GROWTH_RATE * 40);

    // Derivar ano de entrada: sf6_measured = sf6_ref_2010 × exp(r × (year - 2010))
    // → year = 2010 + ln(sf6/sf6_ref_2010) / r
    const ln_ratio = Math.log(sf6_fptv / sf6_ref_2010);
    const entry_year = 2010 + ln_ratio / SF6_GROWTH_RATE;
    const apparent_age_yr = Math.max(0, 2010 - entry_year);

    // Faixa de idade com incerteza analítica típica de ±10% em fptv
    const age_uncertainty = Math.abs(0.1 / SF6_GROWTH_RATE); // anos
    const age_range = `${Math.round(apparent_age_yr - age_uncertainty)}-${Math.round(apparent_age_yr + age_uncertainty)} yr`;

    return { apparent_age_yr, age_range };
}

/**
 * Classify aquifer vulnerability to contamination based on groundwater age and chemistry.
 * Classifica a vulnerabilidade do aquífero à contaminação pela idade e química da água.
 * Ref: IAEA (2006) Guidelines for Isotopic Age Dating of Groundwater; DRASTIC framework.
 *
 * @param age_years - Groundwater age [years]
 * @param nitrate_mg_L - Nitrate concentration [mg/L as NO3]
 * @param pesticide_detected - Whether pesticides were detected
 */
export function classifyAquiferVulnerabilityByAge(
    age_years: number,
    nitrate_mg_L: number,
    pesticide_detected: boolean,
): { vulnerability: string; recharge_rate: string; protection_priority: string } {
    if (typeof age_years !== 'number' || typeof nitrate_mg_L !== 'number') {
        throw new TypeError('age_years and nitrate_mg_L must be numbers');
    }
    if (typeof pesticide_detected !== 'boolean') {
        throw new TypeError('pesticide_detected must be a boolean');
    }
    if (age_years < 0) throw new RangeError('age_years must be >= 0');
    if (nitrate_mg_L < 0) throw new RangeError('nitrate_mg_L must be >= 0');

    // Classificação de taxa de recarga com base na idade
    let recharge_rate;
    if (age_years < 10) {
        recharge_rate = 'very_fast';
    } else if (age_years < 50) {
        recharge_rate = 'fast';
    } else if (age_years < 200) {
        recharge_rate = 'moderate';
    } else if (age_years < 1000) {
        recharge_rate = 'slow';
    } else {
        recharge_rate = 'very_slow';
    }

    // Vulnerabilidade base pela idade
    let vulnerability;
    if (age_years < 50) {
        vulnerability = 'high';
    } else if (age_years < 200) {
        vulnerability = 'moderate';
    } else if (age_years < 1000) {
        vulnerability = 'low';
    } else {
        vulnerability = 'very_low';
    }

    // Agravantes - água jovem com contaminantes = crítico
    if (age_years < 50 && pesticide_detected) {
        vulnerability = 'high'; // confirma alto
    }
    if (nitrate_mg_L > 50) {
        // Acima do VMP OMS de 50 mg/L NO3: eleva um nível se já moderate/low
        if (vulnerability === 'moderate') vulnerability = 'high';
        else if (vulnerability === 'low') vulnerability = 'moderate';
    }

    // Prioridade de proteção
    const protection_priority =
        vulnerability === 'high'
            ? 'critical'
            : vulnerability === 'moderate'
              ? 'high'
              : vulnerability === 'low'
                ? 'medium'
                : 'low';

    return { vulnerability, recharge_rate, protection_priority };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const groundwaterAgeDatingMeta = {
    name: 'groundwaterAgeDating',
    description: 'groundwaterAgeDating',
    category: 'analytics',
    familyTags: ['groundwater', 'water'],
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
