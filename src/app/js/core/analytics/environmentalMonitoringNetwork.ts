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
// Application: EHS & Mining - Environmental Monitoring Network Design
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Environmental Monitoring Network Design
 *
 * Módulo puro para design e avaliação de redes de monitoramento ambiental:
 * espaçamento ótimo de estações (kriging variance), limite mínimo de detecção
 * (MDL/EPA DQO), frequência de amostragem estatística e classificação de
 * qualidade de dados (USEPA DQO framework).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - US EPA (2006). Guidance on Systematic Planning Using the Data Quality
 *     Objectives Process. EPA/240/B-06/001. Washington, DC: US EPA.
 *     (DQO process for monitoring network design and data quality classification)
 *   - Webster, R., & Oliver, M. A. (2007). Geostatistics for Environmental
 *     Scientists, 2nd ed. John Wiley & Sons, Chichester.
 *     (Kriging variance-based optimal station spacing methodology)
 *   - ABNT NBR 15469 (2007). Proteção Ambiental - Amostragem de Resíduos -
 *     Procedimentos para coleta, manuseio e preservação de amostras de solos.
 *     Associação Brasileira de Normas Técnicas, São Paulo.
 *     (Brazilian standard for environmental sampling network design)
 *
 * @module environmentalMonitoringNetwork
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

/**
 * Compute Optimal Station Spacing - Kriging Variance Criterion
 * Calcula o espaçamento ótimo entre estações de monitoramento via variância de krigagem.
 *
 * Approximation: spacing = range × sqrt(targetVariance / existingVariance)
 * where existingVariance ≈ 1 / existingStations (proxy for sampling density)
 *
 * Se area_m2 for fornecida, calcula estações adicionais necessárias.
 *
 * @param variogram_range_m  - Variogram range (spatial correlation length) (m); >0
 * @param targetVariance     - Desired kriging variance (dimensionless); >0
 * @param existingStations   - Number of existing monitoring stations; ≥1
 * @param area_m2?            - Optional total study area (m²); >0
 */
export function computeOptimalStationSpacing(
    variogram_range_m: number,
    targetVariance: number,
    existingStations: number,
    area_m2?: number,
): { spacing_m: number; additionalStations?: number } {
    if (typeof variogram_range_m !== 'number' || variogram_range_m <= 0) {
        throw new RangeError('variogram_range_m must be a positive number');
    }
    if (typeof targetVariance !== 'number' || targetVariance <= 0) {
        throw new RangeError('targetVariance must be a positive number');
    }
    if (typeof existingStations !== 'number' || existingStations < 1 || !Number.isInteger(existingStations)) {
        throw new RangeError('existingStations must be an integer ≥ 1');
    }

    // Variância existente estimada como proxy da densidade de amostragem
    const existingVariance = 1 / existingStations;
    const spacing_m = variogram_range_m * Math.sqrt(targetVariance / existingVariance);

    const result: { spacing_m: number; additionalStations?: number } = { spacing_m };

    if (area_m2 !== undefined) {
        if (typeof area_m2 !== 'number' || area_m2 <= 0) {
            throw new RangeError('area_m2 must be a positive number if provided');
        }
        // Número de estações adicionais para cobrir a área com o espaçamento ótimo
        const stationsNeeded = Math.ceil(area_m2 / (spacing_m * spacing_m));
        result.additionalStations = Math.max(0, stationsNeeded - existingStations);
    }

    return result;
}

/**
 * Compute Detection Limit - EPA MDL Method
 * Calcula o limite mínimo de detecção de tendência (Method Detection Limit).
 *
 * Formula: MDL = background + detectionFactor × backgroundSD
 * Default detectionFactor = 3.3 (99% confidence, one-sided, EPA/600/4-85/056)
 *
 * @param backgroundConc   - Background concentration (any unit); ≥0
 * @param backgroundSD     - Standard deviation of background measurements; ≥0
 * @param detectionFactor  - Statistical detection factor (default 3.3 for 99% CI)
 */
export function computeDetectionLimit(
    backgroundConc: number,
    backgroundSD: number,
    detectionFactor: number = 3.3,
): { mdl: number; detectable: (conc: number) => boolean } {
    if (typeof backgroundConc !== 'number' || backgroundConc < 0) {
        throw new RangeError('backgroundConc must be a non-negative number');
    }
    if (typeof backgroundSD !== 'number' || backgroundSD < 0) {
        throw new RangeError('backgroundSD must be a non-negative number');
    }
    if (typeof detectionFactor !== 'number' || detectionFactor <= 0) {
        throw new RangeError('detectionFactor must be a positive number');
    }

    // MDL = concentração de fundo + fator de confiança × desvio padrão
    const mdl = backgroundConc + detectionFactor * backgroundSD;

    return {
        mdl,
        /**
         * Verifica se uma concentração está acima do limite de detecção.
         */
        detectable: (conc: number) => conc > mdl,
    };
}

/**
 * Z-scores for common confidence levels
 * Valores z para níveis de confiança (distribuição normal padrão bilateral)
 */
const Z_SCORES: Record<number, number> = { 0.95: 1.96, 0.99: 2.576 };

/**
 * Compute Required Monitoring Frequency - Statistical Sampling Theory
 * Calcula o número de amostras necessárias por período para atingir a precisão alvo.
 *
 * Formula: n = (z × cv / accuracy)²
 * where z   = z-score for confidence level (1.96 for 95%, 2.576 for 99%)
 *       cv  = coefficient of variation (decimal)
 *       acc = target accuracy as decimal (e.g. 0.10 for ±10%)
 *
 * Frequency classification: daily (n>30), weekly (n>12), monthly (n>4), quarterly (n≤4)
 *
 * @param variabilityCoeff  - Coefficient of variation (CV, decimal, e.g. 0.30 for 30%)
 * @param targetAccuracy_pct - Desired accuracy (%, e.g. 10 for ±10%)
 * @param confidenceLevel  - Statistical confidence level (0.95 or 0.99; default 0.95)
 */
export function computeMonitoringFrequency(
    variabilityCoeff: number,
    targetAccuracy_pct: number,
    confidenceLevel: number = 0.95,
): { samplesRequired: number; frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' } {
    if (typeof variabilityCoeff !== 'number' || variabilityCoeff <= 0) {
        throw new RangeError('variabilityCoeff must be a positive number');
    }
    if (typeof targetAccuracy_pct !== 'number' || targetAccuracy_pct <= 0 || targetAccuracy_pct >= 100) {
        throw new RangeError('targetAccuracy_pct must be in range (0, 100)');
    }
    if (!Object.prototype.hasOwnProperty.call(Z_SCORES, confidenceLevel)) {
        throw new RangeError('confidenceLevel must be 0.95 or 0.99');
    }

    const z = Z_SCORES[confidenceLevel]!;
    const accuracy = targetAccuracy_pct / 100;
    const samplesRequired = Math.ceil(Math.pow((z * variabilityCoeff) / accuracy, 2));

    let frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
    if (samplesRequired > 30) frequency = 'daily';
    else if (samplesRequired > 12) frequency = 'weekly';
    else if (samplesRequired > 4) frequency = 'monthly';
    else frequency = 'quarterly';

    return { samplesRequired, frequency };
}

/**
 * Classify Data Quality - USEPA DQO Framework
 * Classifica a qualidade dos dados monitorados conforme o processo DQO da EPA.
 *
 * Tiers:
 *   A: todas as métricas ≥95% (dados de alta qualidade, decisões críticas)
 *   B: todas as métricas ≥80% (dados adequados, decisões regulatórias)
 *   C: completeness ≥70% (dados parciais, uso com cautela)
 *   D: abaixo dos mínimos (dados insuficientes, não recomendados)
 *
 * @param completeness_pct      - Data completeness (%); [0, 100]
 * @param accuracy_pct          - Measurement accuracy (%); [0, 100]
 * @param precision_pct         - Measurement precision (%); [0, 100]
 * @param representativeness    - Spatial/temporal representativeness score [0, 1]
 */
export function classifyDataQuality(
    completeness_pct: number,
    accuracy_pct: number,
    precision_pct: number,
    representativeness: number,
): { dqo: 'A' | 'B' | 'C' | 'D'; usability: string } {
    const pctFields = { completeness_pct, accuracy_pct, precision_pct };
    for (const [key, val] of Object.entries(pctFields)) {
        if (typeof val !== 'number' || val < 0 || val > 100) {
            throw new RangeError(`${key} must be a number in range [0, 100]`);
        }
    }
    if (typeof representativeness !== 'number' || representativeness < 0 || representativeness > 1) {
        throw new RangeError('representativeness must be a number in range [0, 1]');
    }

    // Converte representatividade para % para comparação uniforme
    const repr_pct = representativeness * 100;
    const allMetrics = [completeness_pct, accuracy_pct, precision_pct, repr_pct];
    const minMetric = Math.min(...allMetrics);

    let dqo: 'A' | 'B' | 'C' | 'D';
    let usability: string;

    if (minMetric >= 95) {
        dqo = 'A';
        usability = 'Suitable for critical regulatory decisions and enforcement actions';
    } else if (minMetric >= 80) {
        dqo = 'B';
        usability = 'Suitable for regulatory compliance monitoring and trend analysis';
    } else if (completeness_pct >= 70) {
        dqo = 'C';
        usability = 'Suitable for screening-level assessments only; use with caution';
    } else {
        dqo = 'D';
        usability = 'Insufficient data quality; additional sampling required before use';
    }

    return { dqo, usability };
}

/**
 * Compute Kriging Variance - Spherical Semivariogram
 * Calcula a semivariância para um dado espaçamento, usando o modelo esférico.
 *
 * gamma(d) = nugget + (sill - nugget) × [1.5×(d/range) - 0.5×(d/range)³]  para d ≤ range
 * gamma(d) = sill                                                             para d > range
 *
 * Referência: Matheron, G. (1963). Principles of geostatistics.
 * Economic Geology, 58(8), 1246–1266. DOI: 10.2113/gsecongeo.58.8.1246
 * (Modelo esférico de semivariograma - base da geoestatística)
 *
 * @param distance_m - Distância de separação entre pontos (m); ≥0
 * @param nugget     - Efeito pepita (variância a distância zero); ≥0
 * @param sill       - Patamar do semivariograma; ≥ nugget
 * @param range_m    - Alcance do semivariograma (m); >0
 */
export function computeKrigingVariance(
    distance_m: number,
    nugget: number,
    sill: number,
    range_m: number,
): { variance: number } {
    if (typeof distance_m !== 'number' || distance_m < 0) {
        throw new RangeError('distance_m must be a non-negative number');
    }
    if (typeof nugget !== 'number' || nugget < 0) {
        throw new RangeError('nugget must be a non-negative number');
    }
    if (typeof sill !== 'number' || sill < nugget) {
        throw new RangeError('sill must be >= nugget');
    }
    if (typeof range_m !== 'number' || range_m <= 0) {
        throw new RangeError('range_m must be a positive number');
    }

    let variance: number;
    if (distance_m === 0) {
        // Distância zero: semivariância é o nugget (descontinuidade na origem)
        variance = nugget;
    } else if (distance_m <= range_m) {
        // Modelo esférico dentro do alcance (Matheron 1963)
        const h = distance_m / range_m;
        variance = nugget + (sill - nugget) * (1.5 * h - 0.5 * h * h * h);
    } else {
        // Além do alcance: semivariância igual ao patamar (independência espacial)
        variance = sill;
    }
    return { variance };
}

/**
 * Compute Network Redundancy Index
 * Calcula o índice de redundância da rede de monitoramento.
 *
 * RI = (station_count - critical_station_count) / station_count
 * Resultado ∈ [0, 1]; 0 = sem redundância, 1 = totalmente redundante.
 *
 * @param station_count          - Total de estações na rede; inteiro ≥1
 * @param critical_station_count - Estações indispensáveis (sem backup); inteiro ∈ [0, station_count]
 */
export function computeNetworkRedundancy(
    station_count: number,
    critical_station_count: number,
): { redundancy_index: number } {
    if (typeof station_count !== 'number' || !Number.isInteger(station_count) || station_count < 1) {
        throw new RangeError('station_count must be an integer ≥ 1');
    }
    if (
        typeof critical_station_count !== 'number' ||
        !Number.isInteger(critical_station_count) ||
        critical_station_count < 0 ||
        critical_station_count > station_count
    ) {
        throw new RangeError('critical_station_count must be an integer in [0, station_count]');
    }

    // Proporção de estações com cobertura redundante
    const redundancy_index = (station_count - critical_station_count) / station_count;
    return { redundancy_index };
}

/**
 * Compute Data Completeness
 * Calcula a completude dos dados de monitoramento em percentual.
 *
 * completeness_pct = (valid_readings / total_expected) × 100
 *
 * @param valid_readings  - Leituras válidas recebidas no período; inteiro ≥0
 * @param total_expected  - Leituras esperadas no período; inteiro ≥1
 */
export function computeDataCompleteness(
    valid_readings: number,
    total_expected: number,
): { completeness_pct: number } {
    if (typeof valid_readings !== 'number' || !Number.isInteger(valid_readings) || valid_readings < 0) {
        throw new RangeError('valid_readings must be a non-negative integer');
    }
    if (typeof total_expected !== 'number' || !Number.isInteger(total_expected) || total_expected < 1) {
        throw new RangeError('total_expected must be an integer ≥ 1');
    }
    if (valid_readings > total_expected) {
        throw new RangeError('valid_readings cannot exceed total_expected');
    }

    // Percentual de completude: razão de dados recebidos vs esperados
    const completeness_pct = (valid_readings / total_expected) * 100;
    return { completeness_pct };
}

/**
 * Classify Network Adequacy
 * Classifica a adequação da rede de monitoramento ambiental.
 *
 * 'excellent'  : density > 0.01 E completeness > 95 E redundancy > 0.3
 * 'adequate'   : density > 0.005 E completeness > 85
 * 'minimum'    : density > 0.001
 * 'inadequate' : caso contrário
 *
 * @param station_density_per_km2 - Densidade de estações (est/km²); ≥0
 * @param completeness_pct        - Completude dos dados (%); [0, 100]
 * @param redundancy_index        - Índice de redundância ∈ [0, 1]
 */
export function classifyNetworkAdequacy(
    station_density_per_km2: number,
    completeness_pct: number,
    redundancy_index: number,
): { adequacy: 'inadequate' | 'minimum' | 'adequate' | 'excellent' } {
    if (typeof station_density_per_km2 !== 'number' || station_density_per_km2 < 0) {
        throw new RangeError('station_density_per_km2 must be a non-negative number');
    }
    if (typeof completeness_pct !== 'number' || completeness_pct < 0 || completeness_pct > 100) {
        throw new RangeError('completeness_pct must be in range [0, 100]');
    }
    if (typeof redundancy_index !== 'number' || redundancy_index < 0 || redundancy_index > 1) {
        throw new RangeError('redundancy_index must be in range [0, 1]');
    }

    let adequacy: 'inadequate' | 'minimum' | 'adequate' | 'excellent';
    if (station_density_per_km2 > 0.01 && completeness_pct > 95 && redundancy_index > 0.3) {
        adequacy = 'excellent';
    } else if (station_density_per_km2 > 0.005 && completeness_pct > 85) {
        adequacy = 'adequate';
    } else if (station_density_per_km2 > 0.001) {
        adequacy = 'minimum';
    } else {
        adequacy = 'inadequate';
    }
    return { adequacy };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalMonitoringNetworkMeta: AnalyticsModuleMeta = {
    name: 'environmentalMonitoringNetwork',
    description: 'Environmental Monitoring Network Design',
    category: 'analytics',
    familyTags: ['environmental'],
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
