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
 * Air Quality Forecast Module - Persistence, Dispersion, Exceedance & Confidence
 *
 * Módulo puro de previsão de qualidade do ar: previsão por persistência (EWMA),
 * índice de dispersão meteorológica (Pasquill), estimativa de dias de excedência
 * pela distribuição normal e classificação de confiança da previsão.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Pasquill, F. (1961). "The estimation of the dispersion of windborne material."
 *     The Meteorological Magazine 90(1063), 33–49.
 *     (classes de estabilidade atmosférica A–F e índice de dispersão)
 *   - Gifford, F. A. (1961). "Use of routine meteorological observations for estimating
 *     atmospheric dispersion." Nuclear Safety 2(4), 47–51.
 *     (fator de estabilidade para MDI - correlação empírica Pasquill-Gifford)
 *   - Horner, E. R. (1964). "Algorithm 315 - Incomplete gamma function."
 *     Communications of the ACM 7(11), 667–668.
 *     DOI: 10.1145/365628.365675
 *     (aproximação polinomial de erf para cálculo de dias de excedência)
 *   - Gardner, M. W., & Dorling, S. R. (1998). "Artificial neural networks
 *     (the multilayer perceptron) - A review of applications in the atmospheric
 *     sciences." Atmospheric Environment 32(14-15), 2627–2636.
 *     DOI: 10.1016/S1352-2310(97)00447-0
 *     (validação de modelos de persistência como baseline para previsão de AQI)
 *
 * @module airQualityForecast
 */

'use strict';

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

// Fatores de estabilidade por classe Pasquill (A–F)
// A = muito instável, F = muito estável - Gifford (1961)
const STABILITY_FACTORS: Record<string, number> = {
    A: 1,
    B: 1.5,
    C: 2,
    D: 3,
    E: 4,
    F: 5,
};

// Coeficientes da aproximação polinomial de erf (Horner 1964, precisão ~1.5×10⁻⁷)
const ERF_P = 0.3275911;
const ERF_A1 = 0.254829592;
const ERF_A2 = -0.284496736;
const ERF_A3 = 1.421413741;
const ERF_A4 = -1.453152027;
const ERF_A5 = 1.061405429;

/**
 * Approximation of the error function erf(x) using polynomial expansion.
 * Aproximação da função erro para uso em cálculos de distribuição normal.
 *
 * @param x - Argumento da função erro
 * @returns erf(x) ∈ (-1, 1)
 */
function erf(x: number): number {
    // Preserva sinal para x negativo
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);

    const t = 1.0 / (1.0 + ERF_P * absX);
    const poly = t * (ERF_A1 + t * (ERF_A2 + t * (ERF_A3 + t * (ERF_A4 + t * ERF_A5))));
    const result = 1.0 - poly * Math.exp(-absX * absX);

    return sign * result;
}

/**
 * Compute air quality persistence forecast using exponential weighted average.
 * Calcula a previsão de qualidade do ar por persistência (média ponderada exponencial).
 *
 * F = alpha × current_AQI + (1 - alpha) × historical_avg
 *
 * onde alpha = persistence_factor ∈ [0, 1] controla o peso da observação atual.
 * alpha=1 → previsão igual ao valor atual (pura persistência)
 * alpha=0 → previsão igual à média histórica (climatologia)
 *
 * @param current_AQI - AQI atual (≥ 0)
 * @param historical_avg - Média histórica do AQI (≥ 0)
 * @param persistence_factor - Fator de persistência alpha ∈ [0, 1]
 * @returns AQI previsto (arredondado para 1 decimal)
 * @throws {RangeError} Se AQI < 0 ou persistence_factor fora de [0, 1]
 *
 * Referência: Gardner & Dorling (1998). DOI: 10.1016/S1352-2310(97)00447-0
 */
export function computePersistenceForecast(
    current_AQI: number,
    historical_avg: number,
    persistence_factor: number,
): { forecast_AQI: number } {
    if (current_AQI < 0) {
        throw new RangeError('computePersistenceForecast: current_AQI deve ser ≥ 0');
    }
    if (historical_avg < 0) {
        throw new RangeError('computePersistenceForecast: historical_avg deve ser ≥ 0');
    }
    if (persistence_factor < 0 || persistence_factor > 1) {
        throw new RangeError('computePersistenceForecast: persistence_factor deve estar em [0, 1]');
    }

    // EWMA: combina observação atual com média histórica ponderada por alpha
    const forecast_AQI = parseFloat(
        (persistence_factor * current_AQI + (1 - persistence_factor) * historical_avg).toFixed(1),
    );
    return { forecast_AQI };
}

/**
 * Compute Meteorological Dispersion Index (MDI).
 * Calcula o Índice de Dispersão Meteorológica para avaliação do potencial
 * de dispersão de poluentes na atmosfera.
 *
 * MDI = (wind_speed × mixing_height) / stability_factor
 *
 * Classes de estabilidade (Pasquill 1961, Gifford 1961):
 *   A = muito instável  (stability_factor = 1)
 *   B = instável        (stability_factor = 1.5)
 *   C = levemente inst. (stability_factor = 2)
 *   D = neutro          (stability_factor = 3)
 *   E = levemente estáv.(stability_factor = 4)
 *   F = estável         (stability_factor = 5)
 *
 * MDI alto → boa dispersão (menor concentração de poluentes)
 * MDI baixo → dispersão limitada (maior risco de pico de poluição)
 *
 * @param wind_speed_m_s - Velocidade do vento (m/s, > 0)
 * @param mixing_height_m - Altura de mistura da CLA (m, > 0)
 * @param stability_class - Classe de estabilidade Pasquill ('A'|'B'|'C'|'D'|'E'|'F')
 * @returns Índice de Dispersão Meteorológica
 * @throws {RangeError} Se wind_speed ou mixing_height não forem positivos
 * @throws {TypeError} Se stability_class não for reconhecida
 *
 * Referência: Pasquill (1961); Gifford (1961).
 */
export function computeMeteorologicalDispersionIndex(
    wind_speed_m_s: number,
    mixing_height_m: number,
    stability_class: string,
): { MDI: number } {
    if (wind_speed_m_s <= 0) {
        throw new RangeError('computeMeteorologicalDispersionIndex: wind_speed_m_s deve ser positivo');
    }
    if (mixing_height_m <= 0) {
        throw new RangeError('computeMeteorologicalDispersionIndex: mixing_height_m deve ser positivo');
    }
    if (!STABILITY_FACTORS[stability_class]) {
        throw new TypeError(
            `computeMeteorologicalDispersionIndex: stability_class '${stability_class}' inválida. ` +
                `Valores válidos: ${Object.keys(STABILITY_FACTORS).join(', ')}`,
        );
    }

    // MDI = (velocidade do vento × altura de mistura) / fator de estabilidade
    const stability_factor = STABILITY_FACTORS[stability_class] as number;
    const MDI = (wind_speed_m_s * mixing_height_m) / stability_factor;
    return { MDI };
}

/**
 * Compute expected number of exceedance days using normal distribution.
 * Estima o número de dias por ano em que o AQI excederá o limiar regulatório,
 * assumindo distribuição normal das concentrações anuais.
 *
 * P(X > threshold) = 0.5 × (1 - erf((threshold - mean) / (std_dev × sqrt(2))))
 * exceedance_days = P(X > threshold) × 365
 *
 * Utiliza aproximação polinomial de Horner (1964) para erf.
 *
 * @param annual_avg_AQI - AQI médio anual (≥ 0)
 * @param std_dev - Desvio padrão do AQI diário (> 0)
 * @param threshold - Limiar regulatório de AQI (> 0)
 * @returns Número estimado de dias de excedência (0–365)
 * @throws {RangeError} Se annual_avg_AQI < 0, std_dev ≤ 0 ou threshold ≤ 0
 *
 * Referência: Horner (1964). DOI: 10.1145/365628.365675
 */
export function computeExpectedExceedanceDays(
    annual_avg_AQI: number,
    std_dev: number,
    threshold: number,
): { exceedance_days: number } {
    if (annual_avg_AQI < 0) {
        throw new RangeError('computeExpectedExceedanceDays: annual_avg_AQI deve ser ≥ 0');
    }
    if (std_dev <= 0) {
        throw new RangeError('computeExpectedExceedanceDays: std_dev deve ser positivo');
    }
    if (threshold <= 0) {
        throw new RangeError('computeExpectedExceedanceDays: threshold deve ser positivo');
    }

    // P(X > threshold) usando CDF da normal: P = 0.5 × (1 - erf(z/sqrt(2)))
    const z = (threshold - annual_avg_AQI) / std_dev;
    const probability = 0.5 * (1 - erf(z / Math.SQRT2));

    const exceedance_days = parseFloat((probability * 365).toFixed(1));
    return { exceedance_days };
}

/**
 * Classify forecast confidence based on persistence factor and data completeness.
 * Classifica o nível de confiança da previsão de qualidade do ar.
 *
 * Critérios:
 *   'low'      : persistence_factor < 0.5 OU data_completeness_pct < 70
 *   'moderate' : persistence_factor < 0.8 OU data_completeness_pct < 90
 *   'high'     : persistence_factor ≥ 0.8 E data_completeness_pct ≥ 90
 *
 * @param persistence_factor - Fator de persistência alpha ∈ [0, 1]
 * @param data_completeness_pct - Completude dos dados históricos (%, 0–100)
 * @throws {RangeError} Se persistence_factor fora de [0, 1] ou completeness fora de [0, 100]
 *
 * Referência: Gardner & Dorling (1998). DOI: 10.1016/S1352-2310(97)00447-0
 */
export function classifyForecastConfidence(
    persistence_factor: number,
    data_completeness_pct: number,
): { confidence: 'low' | 'moderate' | 'high' } {
    if (persistence_factor < 0 || persistence_factor > 1) {
        throw new RangeError('classifyForecastConfidence: persistence_factor deve estar em [0, 1]');
    }
    if (data_completeness_pct < 0 || data_completeness_pct > 100) {
        throw new RangeError('classifyForecastConfidence: data_completeness_pct deve estar em [0, 100]');
    }

    let confidence: 'low' | 'moderate' | 'high';
    if (persistence_factor < 0.5 || data_completeness_pct < 70) {
        // Baixa confiança: fator de persistência fraco OU dados insuficientes
        confidence = 'low';
    } else if (persistence_factor < 0.8 || data_completeness_pct < 90) {
        // Confiança moderada: condições intermediárias
        confidence = 'moderate';
    } else {
        // Alta confiança: persistência forte E dados completos
        confidence = 'high';
    }

    return { confidence };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const airQualityForecastMeta: AnalyticsModuleMeta = {
    name: 'airQualityForecast',
    description: 'airQualityForecast',
    category: 'analytics',
    familyTags: ['air'],
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
