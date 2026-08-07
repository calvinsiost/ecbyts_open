// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * River Floodplain Model - bankfull discharge, floodplain width, return period (Gumbel).
 *
 * Módulo puro que implementa relações hidrogeomorfológicas para estimativa de
 * vazão de margem plena, largura da planície de inundação e período de retorno
 * de cheias. Sem dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Dunne, T. & Leopold, L.B. (1978). Water in Environmental Planning.
 *     Freeman, New York. ISBN 9780716700791.
 *     (Equação regional Q = C × A^0.7 para vazão de margem plena)
 *   - Gumbel, E.J. (1958). Statistics of Extremes.
 *     Columbia University Press, New York. ISBN 9780231021982.
 *     (Distribuição de Gumbel para análise de frequência de cheias)
 *   - Manning, R. (1891). On the flow of water in open channels and pipes.
 *     Trans. Inst. Civil Eng. Ireland, 20, 161-207.
 *     (Equação de Manning para estimativa de largura da planície)
 *
 * @module riverFloodplainModel
 */

'use strict';

/**
 * Compute bankfull discharge using the regional power-law equation Q = C × A^0.7.
 * Calcula a vazão de margem plena usando a equação regional de potência.
 *
 * Equação empírica de Dunne & Leopold (1978): Q_bf = runoff_coef × area_km2^0.7
 * Válida para bacias fluviais com escoamento superficial dominante.
 *
 * @param {number} area_km2    - Drainage basin area (km²); must be > 0
 * @param {number} runoff_coef - Regional runoff coefficient C (m³/s/km^0.7); must be > 0
 * @returns {{ Q_m3_s: number }} Bankfull discharge in m³/s
 * @throws {TypeError}  If inputs are not finite numbers
 * @throws {RangeError} If area_km2 or runoff_coef are ≤ 0
 */
export function computeBankfullDischarge(area_km2: number, runoff_coef: number): { Q_m3_s: number } {
    if (typeof area_km2 !== 'number' || !isFinite(area_km2)) {
        throw new TypeError('area_km2 must be a finite number');
    }
    if (typeof runoff_coef !== 'number' || !isFinite(runoff_coef)) {
        throw new TypeError('runoff_coef must be a finite number');
    }
    if (area_km2 <= 0) {
        throw new RangeError('area_km2 must be > 0');
    }
    if (runoff_coef <= 0) {
        throw new RangeError('runoff_coef must be > 0');
    }

    // Q_bf = C × A^0.7 - expoente 0.7 representa a relação geomorfológica de Hack
    const Q_m3_s = runoff_coef * Math.pow(area_km2, 0.7);
    return { Q_m3_s };
}

/**
 * Estimate floodplain width from bankfull discharge using Manning-based hydraulic geometry.
 * Estima a largura da planície de inundação pela geometria hidráulica de Manning.
 *
 * Relação empírica W = α × Q^β com β ≈ 0.5 (Leopold & Maddock 1953).
 * Para planícies extensas usa Manning: Q = (1/n) × A × R^(2/3) × S^(1/2)
 * Simplificação para largura dominante: W ≈ (Q / (S^0.5 / Manning_n))^(3/5)
 *
 * @param {number} Q_m3_s       - Bankfull discharge (m³/s); must be > 0
 * @param {number} channel_slope - Channel gradient S (m/m); must be > 0 and < 1
 * @param {number} Manning_n    - Manning roughness coefficient; must be > 0
 * @returns {{ width_m: number }} Estimated floodplain width in metres
 * @throws {TypeError}  If any input is not a finite number
 * @throws {RangeError} If parameters are out of physical range
 */
export function computeFloodplainWidth(Q_m3_s: number, channel_slope: number, Manning_n: number): { width_m: number } {
    if (typeof Q_m3_s !== 'number' || !isFinite(Q_m3_s)) {
        throw new TypeError('Q_m3_s must be a finite number');
    }
    if (typeof channel_slope !== 'number' || !isFinite(channel_slope)) {
        throw new TypeError('channel_slope must be a finite number');
    }
    if (typeof Manning_n !== 'number' || !isFinite(Manning_n)) {
        throw new TypeError('Manning_n must be a finite number');
    }
    if (Q_m3_s <= 0) {
        throw new RangeError('Q_m3_s must be > 0');
    }
    if (channel_slope <= 0 || channel_slope >= 1) {
        throw new RangeError('channel_slope must be in (0, 1)');
    }
    if (Manning_n <= 0) {
        throw new RangeError('Manning_n must be > 0');
    }

    // Largura estimada usando relação de Manning para canal retangular amplo:
    // Q = (1/n) × W × y^(5/3) × S^(1/2) e y ~ 0.1 × W (proporção típica)
    // W ≈ (Q × n / S^0.5)^(3/5) × fator_geométrico
    // Fator 1.5 representa a expansão da planície em relação ao canal ativo
    const hydraulicFactor = (Q_m3_s * Manning_n) / Math.sqrt(channel_slope);
    const width_m = 1.5 * Math.pow(hydraulicFactor, 3 / 5);
    return { width_m };
}

/**
 * Compute flood return period using Gumbel extreme value distribution.
 * Calcula o período de retorno de cheias pela distribuição de Gumbel (Tipo I).
 *
 * Distribuição de Gumbel: F(x) = exp(−exp(−(x − u)/α))
 * Período de retorno: T = 1 / (1 − F(x))
 * Parâmetros estimados pelo método dos momentos: α = s × √6/π, u = x̄ − 0.5772α
 *
 * @param {number[]} annual_max_flows - Array of annual maximum flows (m³/s); length ≥ 5
 * @param {number}   target_flow      - Flow value for which T is computed (m³/s)
 * @returns {{ T_years: number }} Return period in years
 * @throws {TypeError}  If annual_max_flows is not an array or target_flow is not a number
 * @throws {RangeError} If array length < 5 or target_flow ≤ 0
 */
export function computeFloodReturnPeriod(annual_max_flows: number[], target_flow: number): { T_years: number } {
    if (!Array.isArray(annual_max_flows)) {
        throw new TypeError('annual_max_flows must be an array of numbers');
    }
    if (annual_max_flows.length < 5) {
        throw new RangeError('annual_max_flows must have at least 5 values for reliable estimation');
    }
    for (const v of annual_max_flows) {
        if (typeof v !== 'number' || !isFinite(v) || v < 0) {
            throw new RangeError('All values in annual_max_flows must be finite non-negative numbers');
        }
    }
    if (typeof target_flow !== 'number' || !isFinite(target_flow)) {
        throw new TypeError('target_flow must be a finite number');
    }
    if (target_flow <= 0) {
        throw new RangeError('target_flow must be > 0');
    }

    const n = annual_max_flows.length;
    // Média amostral
    const mean = annual_max_flows.reduce((s, v) => s + v, 0) / n;
    // Desvio padrão amostral (Bessel corrected)
    const variance = annual_max_flows.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
    const std = Math.sqrt(variance);

    if (std < 1e-12) {
        // Série constante: período de retorno infinito para valores iguais à série
        return { T_years: target_flow <= mean ? Infinity : Infinity };
    }

    // Estimação por momentos: parâmetro de escala α e de localização u
    const alpha = (std * Math.sqrt(6)) / Math.PI;
    const u = mean - 0.5772 * alpha; // constante de Euler-Mascheroni ≈ 0.5772

    // CDF de Gumbel: F(x) = exp(−exp(−(x − u)/α))
    const y = (target_flow - u) / alpha; // variável reduzida
    const F = Math.exp(-Math.exp(-y));

    // Período de retorno T = 1/(1−F), limitado a evitar divisão por zero
    const exceedanceProb = Math.max(1 - F, 1e-12);
    const T_years = 1 / exceedanceProb;
    return { T_years };
}

/**
 * Classify flood hazard based on return period.
 * Classifica o nível de risco de inundação com base no período de retorno.
 *
 * Classificação baseada em critérios de zoneamento de planície (FEMA, CONAMA):
 *   T > 100 anos → baixo risco
 *   50 < T ≤ 100 → moderado
 *   10 < T ≤ 50  → alto
 *   T ≤ 10       → extremo
 *
 * @param {number} T_years - Flood return period (years); must be > 0
 * @returns {{ hazard: 'low'|'moderate'|'high'|'extreme' }} Hazard classification
 * @throws {TypeError}  If T_years is not a finite number
 * @throws {RangeError} If T_years ≤ 0
 */
export function classifyFloodHazard(T_years: number): { hazard: 'low' | 'moderate' | 'high' | 'extreme' } {
    if (typeof T_years !== 'number' || !isFinite(T_years)) {
        throw new TypeError('T_years must be a finite positive number');
    }
    if (T_years <= 0) {
        throw new RangeError('T_years must be > 0');
    }

    // Classificação baseada em limites de período de retorno usuais em engenharia hidráulica
    if (T_years > 100) return { hazard: 'low' };
    if (T_years > 50) return { hazard: 'moderate' };
    if (T_years > 10) return { hazard: 'high' };
    return { hazard: 'extreme' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverFloodplainModelMeta = {
    name: 'riverFloodplainModel',
    description: 'riverFloodplainModel',
    category: 'analytics',
    familyTags: ['river', 'flood'],
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
} as const;
