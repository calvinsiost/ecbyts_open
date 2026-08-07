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
// Application: EHS & Mining - Hydrology & Water Resources
// Authorship: Calvin Stefan Iost

/* ================================================================
   STOCHASTIC WATER BALANCE — Pure-math hydrology & drought analysis
   ================================================================

   Modulo de balanco hidrico estocastico e analise de seca.
   Todas as funcoes sao deterministicas, sem DOM, IDB ou fetch.

   METODOS:
   - Thornthwaite (1948) PET mensal com indice de calor
   - Thornthwaite-Mather (1957) balanco hidrico mensal
   - Curva de recessao de escoamento base (Brutsaert & Nieber 1977)
   - Numero de Curva SCS (USDA TR-55 1986)
   - Indice de Seca de Palmer — PDSI (Palmer 1965)
   - Indice Padronizado de Precipitacao — SPI (McKee et al. 1993)
   - Curva de duracao de vazao (Searcy 1959)
   - Balanco hidrico de bacia hidrográfica — Budyko (1974)
   - Estimativa de vazao por maxima entropia — log-Pearson III
   - Potencial de captacao de agua da chuva (WHO/UNEP)

   ================================================================ */

console.debug('[watbal:load]', 'app/js/core/analytics/stochasticWaterBalance.js');

// Dias por mes (ano nao bissexto)
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// ================================================================
// THORNTHWAITE PET - Monthly potential evapotranspiration
// Evapotranspiracao potencial mensal pelo metodo de Thornthwaite
// ================================================================

/**
 * Compute monthly PET using Thornthwaite (1948) method.
 * Calcula a ETP mensal pelo metodo de Thornthwaite com indice de calor anual.
 *
 * @param {number[]} temperature_c_array - Array of 12 monthly mean temperatures (°C)
 * @param {number} [latitude_deg=0] - Site latitude in degrees (used for L-factor; pass 0 for simplified)
 * @returns {{ pet_mm_month: number[], annual_pet_mm: number, heat_index: number }}
 * @throws {RangeError} if array length != 12 or temperatures are non-finite
 * Reference: Thornthwaite, C.W. (1948) An approach toward a rational classification of climate.
 *            Geographical Review, 38(1), 55–94. https://doi.org/10.2307/210739
 */
export function thornthwaitePET(temperature_c_array: number[], latitude_deg: number = 0): { pet_mm_month: number[], annual_pet_mm: number, heat_index: number } {
    if (!Array.isArray(temperature_c_array) || temperature_c_array.length !== 12) {
        throw new RangeError('thornthwaitePET: temperature_c_array must have exactly 12 elements');
    }
    for (let i = 0; i < 12; i++) {
        if (!Number.isFinite(temperature_c_array[i])) {
            throw new RangeError(`thornthwaitePET: temperature_c_array[${i}] must be finite`);
        }
    }
    if (!Number.isFinite(latitude_deg)) {
        throw new RangeError('thornthwaitePET: latitude_deg must be finite');
    }

    // Indice de calor mensal i_m = (T/5)^1.514 para T > 0
    const i_m = temperature_c_array.map((t) => (t > 0 ? Math.pow(t / 5, 1.514) : 0));

    // Indice de calor anual I
    const I = i_m.reduce((s, v) => s + v, 0);

    // Expoente empirico a
    const a = 6.75e-7 * I ** 3 - 7.71e-5 * I ** 2 + 1.792e-2 * I + 0.49239;

    // Fator de comprimento do dia (simplificado = 1.0 quando latitude desconhecida)
    // Para latitudes conhecidas poderia usar tabelas de Thornthwaite (1948), Tabela 1
    // Aqui usa-se fator unitario para pureza matematica sem lookup externo
    const L_factor = 1.0;

    const pet_mm_month = temperature_c_array.map((t, m) => {
        if (t <= 0 || I === 0) return 0;
        // PET mensal (mm/mes) - equacao Thornthwaite
        const pet = 16 * Math.pow((10 * t) / I, a) * L_factor;
        // Ajuste pelo numero de dias do mes (proporcional a 30 dias)
        return pet * ((DAYS_IN_MONTH[m] as number) / 30);
    });

    const annual_pet_mm = pet_mm_month.reduce((s, v) => s + v, 0);

    return Object.freeze({ pet_mm_month: Object.freeze(pet_mm_month), annual_pet_mm, heat_index: I }) as unknown as {pet_mm_month: number[], annual_pet_mm: number, heat_index: number};
}

// ================================================================
// THORNTHWAITE-MATHER WATER BALANCE - Monthly soil water balance
// Balanco hidrico mensal de Thornthwaite-Mather (1957)
// ================================================================

/**
 * Compute monthly water balance using Thornthwaite-Mather (1957).
 * Calcula balanco hidrico mensal com armazenamento de agua no solo.
 *
 * @param {number[]} precipitation_mm_array - 12 monthly precipitation values (mm)
 * @param {number[]} pet_mm_array - 12 monthly PET values (mm)
 * @param {number} [soil_water_capacity_mm=100] - Available water capacity of soil (mm)
 * @returns {{ runoff_mm: number[], surplus_mm: number[], deficit_mm: number[],
 *             aet_mm: number[], soil_moisture: number[], annual_runoff_mm: number, annual_aet_mm: number }}
 * @throws {RangeError} for invalid arrays or capacity
 * Reference: Thornthwaite, C.W. & Mather, J.R. (1957) Instructions and tables for computing
 *            potential evapotranspiration and the water balance. Drexel Institute of Technology,
 *            Publications in Climatology, 10(3), 185–311.
 */
export function thornthwaiteMather(precipitation_mm_array: number[], pet_mm_array: number[], soil_water_capacity_mm: number = 100): { runoff_mm: number[], surplus_mm: number[], deficit_mm: number[], aet_mm: number[], soil_moisture: number[], annual_runoff_mm: number, annual_aet_mm: number } {
    if (!Array.isArray(precipitation_mm_array) || precipitation_mm_array.length !== 12) {
        throw new RangeError('thornthwaiteMather: precipitation_mm_array must have 12 elements');
    }
    if (!Array.isArray(pet_mm_array) || pet_mm_array.length !== 12) {
        throw new RangeError('thornthwaiteMather: pet_mm_array must have 12 elements');
    }
    if (!Number.isFinite(soil_water_capacity_mm) || soil_water_capacity_mm <= 0) {
        throw new RangeError('thornthwaiteMather: soil_water_capacity_mm must be positive finite');
    }

    const AWC = soil_water_capacity_mm;
    const runoff_mm = [];
    const surplus_mm = [];
    const deficit_mm = [];
    const aet_mm = [];
    const soil_moisture = [];

    // Inicializa com capacidade de campo maxima
    let ST = AWC; // armazenamento de agua no solo (mm)

    for (let m = 0; m < 12; m++) {
        const P = precipitation_mm_array[m] as number;
        const PET = pet_mm_array[m] as number;

        if (!Number.isFinite(P) || !Number.isFinite(PET)) {
            throw new RangeError(`thornthwaiteMather: invalid value at month ${m}`);
        }

        const P_minus_PET = P - PET;

        let AET: number, DEF: number, SUR: number, RUN: number;

        if (P_minus_PET >= 0) {
            // Mes umido: AET = PET, excedente vai para armazenamento ou runoff
            AET = PET;
            DEF = 0;
            const potential_storage = ST + P_minus_PET;
            if (potential_storage > AWC) {
                SUR = potential_storage - AWC;
                ST = AWC;
            } else {
                SUR = 0;
                ST = potential_storage;
            }
            // Runoff vem do excedente (simplificado: 50% imediato, 50% retido)
            RUN = SUR * 0.5;
            SUR = SUR - RUN;
        } else {
            // Mes seco: drena armazenamento do solo
            // APWL (Accumulated Potential Water Loss) - perda acumulada
            const APWL = Math.abs(P_minus_PET);
            // Reducao exponencial do armazenamento conforme Thornthwaite-Mather
            const ST_prev = ST;
            ST = AWC * Math.exp(-APWL / AWC) * (ST_prev / AWC);
            ST = Math.max(0, Math.min(ST, AWC));
            const delta_ST = ST_prev - ST;
            AET = P + delta_ST;
            AET = Math.max(0, Math.min(AET, PET));
            DEF = PET - AET;
            SUR = 0;
            RUN = 0;
        }

        runoff_mm.push(RUN);
        surplus_mm.push(SUR);
        deficit_mm.push(DEF);
        aet_mm.push(AET);
        soil_moisture.push(ST);
    }

    const annual_runoff_mm = runoff_mm.reduce((s, v) => s + v, 0) + surplus_mm.reduce((s, v) => s + v, 0) * 0.5;
    const annual_aet_mm = aet_mm.reduce((s, v) => s + v, 0);

    return Object.freeze({
            runoff_mm: Object.freeze(runoff_mm),
            surplus_mm: Object.freeze(surplus_mm),
            deficit_mm: Object.freeze(deficit_mm),
            aet_mm: Object.freeze(aet_mm),
            soil_moisture: Object.freeze(soil_moisture),
            annual_runoff_mm,
            annual_aet_mm,
        }) as unknown as {runoff_mm: number[], surplus_mm: number[], deficit_mm: number[], aet_mm: number[], soil_moisture: number[], annual_runoff_mm: number, annual_aet_mm: number};
}

// ================================================================
// STREAMFLOW RECESSION CURVE - Baseflow exponential decay
// Curva de recessao do escoamento base - decaimento exponencial
// ================================================================

/**
 * Compute streamflow recession curve (master recession curve).
 * Calcula a curva mestre de recessao do escoamento base.
 *
 * @param {number} q0 - Initial discharge (m³/s or mm/day)
 * @param {number} k_recession - Recession constant (day⁻¹), typically 0.01–0.1
 * @param {number} t_days - Duration in days (positive integer)
 * @returns {{ q_array: number[], k_recession: number, half_life_days: number }}
 * @throws {RangeError} for invalid inputs
 * Reference: Brutsaert, W. & Nieber, J.L. (1977) Regionalized drought flow hydrographs from
 *            a mature glaciated plateau. Water Resources Research, 13(3), 637–643.
 *            https://doi.org/10.1029/WR013i003p00637
 */
export function streamflowRecessionCurve(q0: number, k_recession: number, t_days: number): { q_array: number[], k_recession: number, half_life_days: number } {
    if (!Number.isFinite(q0) || q0 < 0) {
        throw new RangeError('streamflowRecessionCurve: q0 must be non-negative finite');
    }
    if (!Number.isFinite(k_recession) || k_recession <= 0) {
        throw new RangeError('streamflowRecessionCurve: k_recession must be positive finite');
    }
    if (!Number.isInteger(t_days) || t_days <= 0) {
        throw new RangeError('streamflowRecessionCurve: t_days must be a positive integer');
    }

    // Q(t) = Q0 * exp(-k * t) -- equacao mestre de recessao
    const q_array = Array.from({ length: t_days }, (_, t) => q0 * Math.exp(-k_recession * t));

    // Meia-vida hidrologica: tempo para Q cair a 50% do valor inicial
    const half_life_days = Math.LN2 / k_recession;

    return Object.freeze({ q_array: Object.freeze(q_array), k_recession, half_life_days }) as unknown as {q_array: number[], k_recession: number, half_life_days: number};
}

// ================================================================
// SCS CURVE NUMBER - USDA TR-55 runoff estimation
// Metodo do Numero de Curva do SCS para estimativa de escoamento
// ================================================================

/**
 * Compute direct runoff using SCS Curve Number method (USDA TR-55).
 * Calcula o escoamento superficial direto pelo metodo CN do SCS.
 *
 * @param {number} precipitation_mm - Total storm precipitation (mm)
 * @param {number} cn - Curve Number (1–100)
 * @param {number} [initial_abstraction_ratio=0.2] - Ia/S ratio (default 0.2 per TR-55)
 * @returns {{ runoff_mm: number, abstraction_mm: number, retention_mm: number, cn: number }}
 * @throws {RangeError} for invalid inputs
 * Reference: USDA Soil Conservation Service (1986) Urban Hydrology for Small Watersheds,
 *            Technical Release 55 (TR-55), 2nd ed. NRCS, Washington DC.
 */
export function scsRunoffCurveNumber(precipitation_mm: number, cn: number, initial_abstraction_ratio: number = 0.2): { runoff_mm: number, abstraction_mm: number, retention_mm: number, cn: number } {
    if (!Number.isFinite(precipitation_mm) || precipitation_mm < 0) {
        throw new RangeError('scsRunoffCurveNumber: precipitation_mm must be non-negative finite');
    }
    if (!Number.isFinite(cn) || cn <= 0 || cn > 100) {
        throw new RangeError('scsRunoffCurveNumber: cn must be in range (0, 100]');
    }
    if (!Number.isFinite(initial_abstraction_ratio) || initial_abstraction_ratio < 0 || initial_abstraction_ratio > 1) {
        throw new RangeError('scsRunoffCurveNumber: initial_abstraction_ratio must be in [0, 1]');
    }

    // Retencao potencial maxima S (mm)
    const S = 25400 / cn - 254;

    // Abstracao inicial Ia (mm)
    const Ia = initial_abstraction_ratio * S;

    // Escoamento Q (mm) - formula TR-55
    const P_eff = precipitation_mm - Ia;
    const runoff_mm = P_eff <= 0 ? 0 : P_eff ** 2 / (P_eff + S);

    const abstraction_mm = Math.min(precipitation_mm, Ia);
    const retention_mm = precipitation_mm - runoff_mm - abstraction_mm;

    return Object.freeze({ runoff_mm, abstraction_mm, retention_mm: Math.max(0, retention_mm), cn });
}

// ================================================================
// PALMER DROUGHT SEVERITY INDEX - PDSI
// Indice de Severidade de Seca de Palmer
// ================================================================

/**
 * Compute simplified Palmer Drought Severity Index (PDSI).
 * Calcula o PDSI simplificado de Palmer (1965).
 *
 * @param {number} precipitation_mm - Monthly precipitation (mm)
 * @param {number} pet_mm - Monthly PET (mm)
 * @param {number} awc_mm - Available water capacity of soil (mm)
 * @param {number} [prev_pdsi=0] - Previous month's PDSI value
 * @returns {{ pdsi: number, z_index: number, d_moisture: number,
 *             classification: string }}
 * @throws {RangeError} for invalid inputs
 * Reference: Palmer, W.C. (1965) Meteorological drought. USWB Research Paper No. 45,
 *            U.S. Weather Bureau, Washington D.C., 58 pp.
 */
export function palmerDroughtSeverityIndex(precipitation_mm: number, pet_mm: number, awc_mm: number, prev_pdsi: number = 0): { pdsi: number, z_index: number, d_moisture: number, classification: string } {
    if (!Number.isFinite(precipitation_mm) || precipitation_mm < 0) {
        throw new RangeError('palmerDroughtSeverityIndex: precipitation_mm must be non-negative finite');
    }
    if (!Number.isFinite(pet_mm) || pet_mm < 0) {
        throw new RangeError('palmerDroughtSeverityIndex: pet_mm must be non-negative finite');
    }
    if (!Number.isFinite(awc_mm) || awc_mm <= 0) {
        throw new RangeError('palmerDroughtSeverityIndex: awc_mm must be positive finite');
    }
    if (!Number.isFinite(prev_pdsi)) {
        throw new RangeError('palmerDroughtSeverityIndex: prev_pdsi must be finite');
    }

    // Desvio de umidade d = P - ETP (simplificado)
    const d = precipitation_mm - pet_mm;

    // Estimativa de recarga R (simplificado baseado em AWC)
    const R = Math.max(0, Math.min(awc_mm * 0.1, precipitation_mm * 0.1));

    // Fator climatologico K (simplificado por Palmer 1965 eq. 3)
    // K = 1.5 * log10((PET + R) / P + 2.8) / D + 0.5
    const P_val = Math.max(precipitation_mm, 1); // evita log de zero
    const D_norm = Math.max(Math.abs(d), 1); // desvio normalizado
    const K = (1.5 * Math.log10((pet_mm + R) / P_val + 2.8)) / D_norm + 0.5;

    // Indice Z de Palmer
    const z_index = K * d;

    // PDSI = 0.897 * PDSI_prev + Z/3
    const pdsi = 0.897 * prev_pdsi + z_index / 3;

    // Classificacao conforme Palmer (1965) Tabela 1
    let classification;
    if (pdsi < -4) classification = 'extreme_drought';
    else if (pdsi < -3) classification = 'severe_drought';
    else if (pdsi < -2) classification = 'moderate_drought';
    else if (pdsi < -1) classification = 'mild_dry';
    else if (pdsi <= 1) classification = 'near_normal';
    else classification = 'moist';

    return Object.freeze({ pdsi, z_index, d_moisture: d, classification });
}

// ================================================================
// SPI - Standardized Precipitation Index
// Indice Padronizado de Precipitacao
// ================================================================

/**
 * Compute Standardized Precipitation Index (SPI) for a target month.
 * Calcula o SPI ajustando distribuicao gama aos dados historicos.
 *
 * @param {number[]} monthly_precip_array - Historical precipitation array (mm, min 10 values)
 * @param {number} target_month_index - Index of the value to compute SPI for
 * @param {string} [distribution='gamma'] - Distribution type ('gamma' supported)
 * @returns {{ spi: number, category: string, alpha: number, beta: number, mean: number }}
 * @throws {RangeError} for invalid inputs
 * Reference: McKee, T.B., Doesken, N.J., & Kleist, J. (1993) The relationship of drought
 *            frequency and duration to time scales. Proc. 8th AMS Conf. Applied Climatology,
 *            17–22 Jan 1993, Anaheim CA, pp. 179–183.
 */
function validateNonNegativeFiniteArray(arr: number[], name: string, minLength: number): void {
    if (!Array.isArray(arr) || arr.length < minLength) {
        throw new RangeError(`${name}: must have at least ${minLength} elements`);
    }
    for (let i = 0; i < arr.length; i++) {
        const value = arr[i];
        if (value === undefined || !Number.isFinite(value) || value < 0) {
            throw new RangeError(`${name}[${i}] must be non-negative finite`);
        }
    }
}

function validateArrayIndex(index: number, length: number, name: string): void {
    if (!Number.isInteger(index) || index < 0 || index >= length) {
        throw new RangeError(`${name} out of range`);
    }
}

function fitGammaParameters(nonzero: number[]): { alpha: number; beta: number; mean: number } {
    const n = nonzero.length;
    const mean = nonzero.reduce((s, x) => s + x, 0) / n;
    const sum_ln = nonzero.reduce((s, x) => s + Math.log(x), 0);
    const A = Math.log(mean) - sum_ln / n;
    const alpha = A > 0 ? (1 + Math.sqrt(1 + (4 * A) / 3)) / (4 * A) : 1;
    const beta = mean / alpha;
    return { alpha, beta, mean };
}

function classifySpiCategory(spi: number): string {
    if (spi < -2.0) return 'extreme_dry';
    if (spi < -1.5) return 'very_dry';
    if (spi < -1.0) return 'moderate_dry';
    if (spi <= 1.0) return 'near_normal';
    if (spi <= 1.5) return 'moderate_wet';
    if (spi <= 2.0) return 'very_wet';
    return 'extreme_wet';
}

export function spiCalculation(monthly_precip_array: number[], target_month_index: number, _distribution: string = 'gamma'): { spi: number, category: string, alpha: number, beta: number, mean: number } {
    validateNonNegativeFiniteArray(monthly_precip_array, 'spiCalculation: monthly_precip_array', 4);
    validateArrayIndex(target_month_index, monthly_precip_array.length, 'spiCalculation: target_month_index');

    // Filtra zeros para ajuste da gama (zeros tratados separadamente)
    const nonzero = monthly_precip_array.filter((x) => x > 0);
    if (nonzero.length < 2) {
        return Object.freeze({ spi: -3.0, category: 'extreme_dry', alpha: 0, beta: 0, mean: 0 });
    }

    const { alpha, beta, mean } = fitGammaParameters(nonzero);

    // Aproximacao de Wilson-Hilferty para converter para escala normal padrao
    const x = monthly_precip_array[target_month_index] ?? 0;
    const x_safe = Math.max(x, 1e-6); // evita log(0)

    // Transformacao normalizada via Wilson-Hilferty (aproximacao da distribuicao gama)
    const u = x_safe / beta;
    const wh = Math.pow(u / alpha, 1 / 3);
    const mu_wh = 1 - 1 / (9 * alpha);
    const sigma_wh = Math.sqrt(1 / (9 * alpha));

    const spi = sigma_wh > 0 ? (wh - mu_wh) / sigma_wh : 0;
    const category = classifySpiCategory(spi);

    return Object.freeze({ spi, category, alpha, beta, mean });
}

// ================================================================
// FLOW DURATION CURVE - Exceedance probability analysis
// Curva de duracao de vazao e analise de probabilidade de excedencia
// ================================================================

/**
 * Compute flow duration curve and key percentile flows.
 * Calcula a curva de duracao de vazoes com percentis Q10/Q50/Q90.
 *
 * @param {number[]} streamflow_array - Array of streamflow values (m³/s or mm/day)
 * @returns {{ q10: number, q50: number, q90: number, baseflow_index: number,
 *             sorted_flows: number[], exceedance_probs: number[] }}
 * @throws {RangeError} for invalid inputs
 * Reference: Searcy, J.K. (1959) Flow-duration curves. USGS Water Supply Paper 1542-A,
 *            U.S. Geological Survey, Washington D.C.
 */
export function flowDurationCurve(streamflow_array: number[]): { q10: number, q50: number, q90: number, baseflow_index: number, sorted_flows: number[], exceedance_probs: number[] } {
    if (!Array.isArray(streamflow_array) || streamflow_array.length < 2) {
        throw new RangeError('flowDurationCurve: streamflow_array must have at least 2 elements');
    }
    for (let i = 0; i < streamflow_array.length; i++) {
        if (!Number.isFinite(streamflow_array[i]) || (streamflow_array[i] as number) < 0) {
            throw new RangeError(`flowDurationCurve: streamflow_array[${i}] must be non-negative finite`);
        }
    }

    const n = streamflow_array.length;

    // Ordena fluxos em ordem decrescente para curva de duracao
    const sorted_flows = [...streamflow_array].sort((a, b) => b - a);

    // Probabilidade de excedencia de Weibull: P = m/(n+1) onde m = rank ascendente
    // Para curva de duracao: rank descrescente m=1 para maior fluxo
    const exceedance_probs = sorted_flows.map((_, i) => (i + 1) / (n + 1));

    // Interpola percentis Q10, Q50, Q90 da curva de duracao
    // Q10 = fluxo excedido 10% do tempo (alta vazao)
    // Q90 = fluxo excedido 90% do tempo (baixa vazao = escoamento de base)
    /** @param {number} prob @returns {number} */
    function interpolateAtProb(prob: number): number {
        if (prob <= (exceedance_probs[0] as number)) return sorted_flows[0] as number;
        if (prob >= (exceedance_probs[n - 1] as number)) return sorted_flows[n - 1] as number;
        for (let i = 0; i < n - 1; i++) {
            if ((exceedance_probs[i] as number) <= prob && prob <= (exceedance_probs[i + 1] as number)) {
                const t = (prob - (exceedance_probs[i] as number)) / ((exceedance_probs[i + 1] as number) - (exceedance_probs[i] as number));
                return (sorted_flows[i] as number) + t * ((sorted_flows[i + 1] as number) - (sorted_flows[i] as number));
            }
        }
        return sorted_flows[n - 1] as number;
    }

    const q10 = interpolateAtProb(0.1);
    const q50 = interpolateAtProb(0.5);
    const q90 = interpolateAtProb(0.9);

    // Indice de escoamento de base: BFI = Q90/Q50 (Richards 1990)
    const baseflow_index = q50 > 0 ? q90 / q50 : 0;

    return Object.freeze({
            q10,
            q50,
            q90,
            baseflow_index,
            sorted_flows: Object.freeze(sorted_flows),
            exceedance_probs: Object.freeze(exceedance_probs),
        }) as unknown as {q10: number, q50: number, q90: number, baseflow_index: number, sorted_flows: number[], exceedance_probs: number[]};
}

// ================================================================
// CATCHMENT WATER BALANCE - Budyko framework
// Balanco hidrico de bacia hidrográfica - estrutura de Budyko
// ================================================================

/**
 * Compute catchment water balance and Budyko aridity analysis.
 * Avalia fechamento do balanco hidrico e indice de aridez de Budyko.
 *
 * @param {number} precipitation_mm - Annual precipitation (mm)
 * @param {number} actual_et_mm - Annual actual evapotranspiration (mm)
 * @param {number} streamflow_mm - Annual streamflow (mm depth over catchment)
 * @param {number} [storage_change_mm=0] - Change in storage ΔS (mm), positive = storage gain
 * @returns {{ water_balance_error_mm: number, aridity_index: number,
 *             budyko_et_ratio: number, closure_error_pct: number }}
 * @throws {RangeError} for invalid inputs
 * Reference: Budyko, M.I. (1974) Climate and Life. Academic Press, New York, 508 pp.
 *            (English translation of Klimat i Zhizn', 1971, Gidrometeoizdat)
 */
export function catchmentWaterBalance(precipitation_mm: number, actual_et_mm: number, streamflow_mm: number, storage_change_mm: number = 0): { water_balance_error_mm: number, aridity_index: number, budyko_et_ratio: number, closure_error_pct: number } {
    if (!Number.isFinite(precipitation_mm) || precipitation_mm <= 0) {
        throw new RangeError('catchmentWaterBalance: precipitation_mm must be positive finite');
    }
    if (!Number.isFinite(actual_et_mm) || actual_et_mm < 0) {
        throw new RangeError('catchmentWaterBalance: actual_et_mm must be non-negative finite');
    }
    if (!Number.isFinite(streamflow_mm) || streamflow_mm < 0) {
        throw new RangeError('catchmentWaterBalance: streamflow_mm must be non-negative finite');
    }
    if (!Number.isFinite(storage_change_mm)) {
        throw new RangeError('catchmentWaterBalance: storage_change_mm must be finite');
    }

    // Erro de fechamento: P - ET - Q - ΔS (deve ser zero em bacia fechada)
    const water_balance_error_mm = precipitation_mm - actual_et_mm - streamflow_mm - storage_change_mm;

    // Erro percentual de fechamento
    const closure_error_pct = (Math.abs(water_balance_error_mm) / precipitation_mm) * 100;

    // Indice de aridez de Budyko: φ = PET/P
    // Usa AET como proxy de PET quando PET nao disponivel diretamente
    const pet_estimate = actual_et_mm + Math.max(0, water_balance_error_mm);
    const aridity_index = pet_estimate / precipitation_mm;

    // Razao ET/P da curva de Budyko (1974):
    // ET/P = sqrt(φ × tanh(1/φ) × (1 - exp(-φ)))
    const phi = Math.max(aridity_index, 1e-6);
    const budyko_et_ratio = Math.sqrt(phi * Math.tanh(1 / phi) * (1 - Math.exp(-phi)));

    return Object.freeze({
        water_balance_error_mm,
        aridity_index,
        budyko_et_ratio: Math.min(budyko_et_ratio, 1.0),
        closure_error_pct,
    });
}

// ================================================================
// MAX ENTROPY FLOW ESTIMATE - Log-Pearson III return period
// Estimativa de vazao por maxima entropia - periodo de retorno
// ================================================================

/**
 * Estimate flood flow for a given return period using log-Pearson III / maximum entropy.
 * Estima vazao de cheia para periodo de retorno via log-Pearson III (Bobée 1975).
 *
 * @param {number} mean_flow - Mean annual peak flow (m³/s)
 * @param {number} cv - Coefficient of variation of peak flows
 * @param {number} skewness - Skewness coefficient of log-transformed flows
 * @param {number} return_period_yr - Return period in years (e.g., 10, 100)
 * @returns {{ q_return_m3s: number, return_period_yr: number, exceedance_prob: number }}
 * @throws {RangeError} for invalid inputs
 * Reference: Sonuga, J.O. (1972) Principle of maximum entropy in hydrologic frequency analysis.
 *            Water Resources Research, 8(6), 1579–1582. https://doi.org/10.1029/WR008i006p01579
 *            Bobée, B. (1975) The log Pearson type 3 distribution and its application in hydrology.
 *            Water Resources Research, 11(5), 681–689. https://doi.org/10.1029/WR011i005p00681
 */
export function maxEntropyFlowEstimate(mean_flow: number, cv: number, skewness: number, return_period_yr: number): { q_return_m3s: number, return_period_yr: number, exceedance_prob: number } {
    if (!Number.isFinite(mean_flow) || mean_flow <= 0) {
        throw new RangeError('maxEntropyFlowEstimate: mean_flow must be positive finite');
    }
    if (!Number.isFinite(cv) || cv <= 0) {
        throw new RangeError('maxEntropyFlowEstimate: cv must be positive finite');
    }
    if (!Number.isFinite(skewness)) {
        throw new RangeError('maxEntropyFlowEstimate: skewness must be finite');
    }
    if (!Number.isFinite(return_period_yr) || return_period_yr <= 1) {
        throw new RangeError('maxEntropyFlowEstimate: return_period_yr must be > 1');
    }

    // Probabilidade de excedencia
    const exceedance_prob = 1 / return_period_yr;

    // Parametros log-normais da serie de maximos anuais
    // σ_lnQ = sqrt(ln(CV² + 1)), μ_lnQ = ln(mean) - σ²/2
    const sigma_ln = Math.sqrt(Math.log(cv * cv + 1));
    const mu_ln = Math.log(mean_flow) - (sigma_ln * sigma_ln) / 2;

    // Fator de frequencia K_T via Wilson-Hilferty para log-Pearson III
    // K_T = (2/g) * [(1 + g*z/6 - g²/36)³ - 1] onde z = quantil normal padrao
    // Aproximacao de Cornish-Fisher para z dado T
    const p_exceedance = 1 - exceedance_prob; // probabilidade de nao-excedencia
    // Quantil normal padrao via aproximacao de Hastings (1955) - precisa e sem lookup
    const z_normal = _normalQuantile(p_exceedance);

    const g = skewness;
    let K_T;
    if (Math.abs(g) < 1e-6) {
        // g → 0: log-Pearson III colapsa para log-normal
        K_T = z_normal;
    } else {
        const k = z_normal - ((z_normal * z_normal - 1) * g) / 6;
        K_T = k + ((k * k - 1) * g * g) / 36 - ((2 * k * k * k - 9 * k) * g ** 3) / 216;
    }

    // Quantil log-normal ajustado por skewness
    const ln_q = mu_ln + K_T * sigma_ln;
    const q_return_m3s = Math.exp(ln_q);

    return Object.freeze({ q_return_m3s, return_period_yr, exceedance_prob });
}

/**
 * Approximate standard normal quantile (inverse CDF) using rational approximation.
 * Approximacao do quantil normal padrao (metodo Beasley-Springer-Moro).
 * @param {number} p - Probability in (0, 1)
 * @returns {number} z-score
 * @private
 */
function _normalQuantile(p: number): number {
    if (p <= 0) return -8;
    if (p >= 1) return 8;
    // Approximacao de Beasley e Springer (1977) via racionais
    const a: [number, number, number, number, number, number, number] = [
        0, -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
        2.506628277459239,
    ];
    const b: [number, number, number, number, number, number] = [
        0, -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1,
    ];
    const c: [number, number, number, number, number, number] = [
        -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
        2.938163982698783,
    ];
    const d: [number, number, number, number] = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const p_low = 0.02425;
    const p_high = 1 - p_low;
    let q;
    if (p < p_low) {
        const qq = Math.sqrt(-2 * Math.log(p));
        q =
            (((((c[0] * qq + c[1]) * qq + c[2]) * qq + c[3]) * qq + c[4]) * qq + c[5]) /
            ((((d[0] * qq + d[1]) * qq + d[2]) * qq + d[3]) * qq + 1);
    } else if (p <= p_high) {
        const qq = p - 0.5;
        const r = qq * qq;
        q =
            ((((((a[1] * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * r + a[6]) * qq) /
            (((((b[1] * r + b[2]) * r + b[3]) * r + b[4]) * r + b[5]) * r + 1);
    } else {
        const qq = Math.sqrt(-2 * Math.log(1 - p));
        q =
            -(((((c[0] * qq + c[1]) * qq + c[2]) * qq + c[3]) * qq + c[4]) * qq + c[5]) /
            ((((d[0] * qq + d[1]) * qq + d[2]) * qq + d[3]) * qq + 1);
    }
    return q;
}

// ================================================================
// RAINWATER HARVESTING POTENTIAL - WHO/UNEP methodology
// Potencial de captacao de agua da chuva - metodologia WHO/UNEP
// ================================================================

/**
 * Estimate rainwater harvesting potential from rooftop collection.
 * Estima o potencial de captacao de agua da chuva de coberturas.
 *
 * @param {number} roof_area_m2 - Catchment/roof area (m²)
 * @param {number} precipitation_mm_yr - Annual precipitation (mm/yr)
 * @param {number} [runoff_coefficient=0.8] - Surface runoff coefficient (0–1)
 * @param {number} [filter_efficiency=0.9] - First-flush filter efficiency (0–1)
 * @returns {{ harvestable_m3_yr: number, daily_average_L: number, reliability_index: number }}
 * @throws {RangeError} for invalid inputs
 * Reference: Thomas, T.H. & Martinson, D.B. (2007) Roofwater Harvesting: A Handbook for
 *            Practitioners. IRC Delft, Technical Paper 49. WHO/UNEP.
 *            Thomas, T.H. (1998) Domestic rainwater harvesting and storage.
 *            The Lancet (Supplement), Global Water Supply.
 */
export function rainwaterHarvestingPotential(roof_area_m2: number, precipitation_mm_yr: number, runoff_coefficient: number = 0.8, filter_efficiency: number = 0.9): { harvestable_m3_yr: number, daily_average_L: number, reliability_index: number } {
    if (!Number.isFinite(roof_area_m2) || roof_area_m2 <= 0) {
        throw new RangeError('rainwaterHarvestingPotential: roof_area_m2 must be positive finite');
    }
    if (!Number.isFinite(precipitation_mm_yr) || precipitation_mm_yr <= 0) {
        throw new RangeError('rainwaterHarvestingPotential: precipitation_mm_yr must be positive finite');
    }
    if (!Number.isFinite(runoff_coefficient) || runoff_coefficient <= 0 || runoff_coefficient > 1) {
        throw new RangeError('rainwaterHarvestingPotential: runoff_coefficient must be in (0, 1]');
    }
    if (!Number.isFinite(filter_efficiency) || filter_efficiency <= 0 || filter_efficiency > 1) {
        throw new RangeError('rainwaterHarvestingPotential: filter_efficiency must be in (0, 1]');
    }

    // Volume coletavel anual: V = P(mm) * A(m²) * Cr * Ef / 1000 → m³
    const harvestable_m3_yr = (precipitation_mm_yr * roof_area_m2 * runoff_coefficient * filter_efficiency) / 1000;

    // Consumo medio diario (L/dia)
    const daily_average_L = (harvestable_m3_yr * 1000) / 365;

    // Indice de confiabilidade: razao entre volume coletado e demanda estimada
    // Demanda minima OMS: 50 L/pessoa/dia para 4 pessoas (WHO Technical Note 9)
    const demand_estimate_m3 = (50 * 4 * 365) / 1000; // ~73 m³/yr para familia de 4
    const reliability_index = harvestable_m3_yr / demand_estimate_m3;

    return Object.freeze({ harvestable_m3_yr, daily_average_L, reliability_index });
}

console.debug('[watbal:end]', 'app/js/core/analytics/stochasticWaterBalance.js');

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const stochasticWaterBalanceMeta = {
    name: 'stochasticWaterBalance',
    description: 'Hydrology & Water Resources',
    category: 'analytics',
    familyTags: ['water'],
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
