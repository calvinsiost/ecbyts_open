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
// Application: EHS & Mining - Contaminant Fate and Transport
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Contaminant Fate and Transport - Multimedia Environmental Modeling
 *
 * Módulo puro implementando modelos de destino e transporte de contaminantes
 * em sistemas ambientais multimedia (solo, água, ar). Inclui degradação de
 * primeira ordem, volatilização via modelo de Liss-Slater e coeficientes
 * de partição. Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Schwarzenbach, R. P., Gschwend, P. M., & Imboden, D. M. (2003).
 *     Environmental Organic Chemistry (2nd ed.). Wiley-Interscience.
 *     ISBN: 978-0-471-35750-6. (half-life, partition coefficients, Koc)
 *   - Liss, P. S., & Slater, P. G. (1974). "Flux of gases across the
 *     air-sea interface." Nature, 247, 181–184.
 *     DOI: 10.1038/247181a0. (two-film volatilization model)
 *   - Mackay, D., & Paterson, S. (1981). "Calculating fugacity."
 *     Environmental Science & Technology, 15(9), 1006–1014.
 *     DOI: 10.1021/es00091a001. (multimedia fate modeling)
 *
 * @module contaminantFateTransport
 */

'use strict';

const LN2 = Math.LN2; // ln(2) ≈ 0.6931

/**
 * Compute half-life from first-order degradation rate constant.
 * Calcula a meia-vida a partir da constante de degradação de primeira ordem.
 *
 * Formula: t½ = ln(2) / k
 * Reference: Schwarzenbach et al. (2003), Chapter 12.
 *
 * @param degradationRate_per_day - First-order rate constant k (day⁻¹); must be > 0
 * @returns Half-life in days
 * @throws {RangeError} If degradationRate_per_day is not positive
 */
export function computeHalfLife(degradationRate_per_day: number): number {
    // Validação: taxa de degradação deve ser positiva (> 0)
    if (typeof degradationRate_per_day !== 'number' || !isFinite(degradationRate_per_day)) {
        throw new TypeError('degradationRate_per_day must be a finite number');
    }
    if (degradationRate_per_day <= 0) {
        throw new RangeError('degradationRate_per_day must be positive (> 0)');
    }
    return LN2 / degradationRate_per_day;
}

/**
 * Compute concentration at time t using first-order exponential decay.
 * Calcula a concentração em tempo t usando decaimento exponencial de primeira ordem.
 *
 * Formula: C(t) = C0 × exp(−ln(2)/t½ × t)
 * Reference: Schwarzenbach et al. (2003), Chapter 12.
 *
 * @param initialConc   - Initial concentration C0 (any consistent unit, e.g. mg/L); must be ≥ 0
 * @param halfLife_days - Half-life t½ (days); must be > 0
 * @param time_days     - Elapsed time t (days); must be ≥ 0
 * @returns Concentration at time t (same unit as initialConc)
 * @throws {RangeError} If halfLife_days ≤ 0 or time_days < 0 or initialConc < 0
 */
export function computeFirstOrderDecay(initialConc: number, halfLife_days: number, time_days: number): number {
    // Validação de entradas
    if (typeof initialConc !== 'number' || !isFinite(initialConc)) {
        throw new TypeError('initialConc must be a finite number');
    }
    if (typeof halfLife_days !== 'number' || !isFinite(halfLife_days)) {
        throw new TypeError('halfLife_days must be a finite number');
    }
    if (typeof time_days !== 'number' || !isFinite(time_days)) {
        throw new TypeError('time_days must be a finite number');
    }
    if (initialConc < 0) {
        throw new RangeError('initialConc must be ≥ 0');
    }
    if (halfLife_days <= 0) {
        throw new RangeError('halfLife_days must be positive (> 0)');
    }
    if (time_days < 0) {
        throw new RangeError('time_days must be ≥ 0');
    }
    // C(t) = C0 × exp(−k × t) onde k = ln(2)/t½
    const k = LN2 / halfLife_days;
    return initialConc * Math.exp(-k * time_days);
}

/**
 * Compute volatilization flux from water surface using the Liss-Slater two-film model.
 * Calcula o fluxo de volatilização da superfície d'água pelo modelo de dois filmes de Liss-Slater.
 *
 * Model: F = KL × C
 *   KL (liquid-phase mass transfer coefficient, m/day) = 0.0144 × v^0.5 × H
 *   F (flux, mg/m²/day) = KL × C
 *
 * Reference: Liss & Slater (1974), Nature 247:181–184.
 *
 * @param concentration_mg_L - Dissolved concentration in water (mg/L)
 * @param henryConst         - Dimensionless Henry's Law constant H (Cair/Cwater, unitless)
 * @param windSpeed_m_s      - Wind speed at 10 m height (m/s); must be ≥ 0
 * @param depth_m            - Water body mixing depth (m); must be > 0 (unused in KL but validates context)
 * @returns Volatilization flux F (mg/m²/day)
 * @throws {RangeError} If any parameter is out of valid range
 */
export function computeVolatilizationFlux(
    concentration_mg_L: number,
    henryConst: number,
    windSpeed_m_s: number,
    depth_m: number,
): number {
    // Validação de entradas
    if (typeof concentration_mg_L !== 'number' || !isFinite(concentration_mg_L)) {
        throw new TypeError('concentration_mg_L must be a finite number');
    }
    if (typeof henryConst !== 'number' || !isFinite(henryConst)) {
        throw new TypeError('henryConst must be a finite number');
    }
    if (typeof windSpeed_m_s !== 'number' || !isFinite(windSpeed_m_s)) {
        throw new TypeError('windSpeed_m_s must be a finite number');
    }
    if (typeof depth_m !== 'number' || !isFinite(depth_m)) {
        throw new TypeError('depth_m must be a finite number');
    }
    if (concentration_mg_L < 0) {
        throw new RangeError('concentration_mg_L must be ≥ 0');
    }
    if (henryConst < 0) {
        throw new RangeError('henryConst must be ≥ 0');
    }
    if (windSpeed_m_s < 0) {
        throw new RangeError('windSpeed_m_s must be ≥ 0');
    }
    if (depth_m <= 0) {
        throw new RangeError('depth_m must be > 0');
    }

    // KL = 0.0144 × v^0.5 × H (m/day)
    // Coeficiente de transferência de massa na fase líquida
    const kl_m_day = 0.0144 * Math.sqrt(windSpeed_m_s) * henryConst;

    // F = KL × C (mg/m²/day); concentração convertida de mg/L → mg/m³ (×1000)
    const concentration_mg_m3 = concentration_mg_L * 1000;
    return kl_m_day * concentration_mg_m3;
}

/**
 * Compute soil-water partition coefficient (Kd), retains Kow, and estimates bioavailable fraction.
 * Calcula o coeficiente de partição solo-água (Kd), retém Kow e estima a fração biodisponível.
 *
 * Kd = Koc × foc
 * Bioavailable fraction = 1 / (1 + Kd)
 *
 * Reference: Schwarzenbach et al. (2003), Chapters 9–11.
 *
 * @param kow - Octanol-water partition coefficient (dimensionless, log Kow is NOT accepted - pass linear)
 * @param koc - Organic carbon partition coefficient (L/kg)
 * @param foc - Fraction of organic carbon in soil (dimensionless, 0–1)
 * @param ph  - Soil/water pH (validated range 3–10, does not affect Kd calculation)
 * @returns Partition results
 * @throws {RangeError} If foc is outside [0,1] or pH outside [3,10]
 */
export function computePartitionCoefficients(
    kow: number,
    koc: number,
    foc: number,
    ph: number,
): { kd: number; kow: number; bioavailableFraction: number } {
    // Validação de entradas
    if (typeof kow !== 'number' || !isFinite(kow) || kow <= 0) {
        throw new RangeError('kow must be a positive finite number');
    }
    if (typeof koc !== 'number' || !isFinite(koc) || koc <= 0) {
        throw new RangeError('koc must be a positive finite number');
    }
    if (typeof foc !== 'number' || !isFinite(foc) || foc < 0 || foc > 1) {
        throw new RangeError('foc must be between 0 and 1 (inclusive)');
    }
    if (typeof ph !== 'number' || !isFinite(ph) || ph < 3 || ph > 10) {
        throw new RangeError('ph must be between 3 and 10 (inclusive)');
    }

    // Kd = Koc × foc (L/kg) - coeficiente de distribuição solo-água
    const kd = koc * foc;

    // Fração biodisponível = 1 / (1 + Kd)
    // Quanto menor o Kd, maior a fração disponível para organismos e processos de degradação
    const bioavailableFraction = 1 / (1 + kd);

    return { kd, kow, bioavailableFraction };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const contaminantFateTransportMeta = {
    name: 'contaminantFateTransport',
    description: 'Contaminant Fate and Transport',
    category: 'analytics',
    familyTags: ['contamination', 'transport', 'fate_transport'],
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
