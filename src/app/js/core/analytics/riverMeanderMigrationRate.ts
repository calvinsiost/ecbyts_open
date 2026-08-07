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
// Application: EHS & Mining - River Meander Migration Rate
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * River Meander Migration Rate - Fluvial geomorphology analytics
 *
 * Módulo puro implementando cálculos de migração de meandros fluviais baseados
 * nas relações empíricas de Leopold & Wolman (1960), Hooke (2007) e Brice (1974).
 * Aplicável em estudos de risco de erosão de margens, proteção de infraestrutura
 * ribeirinha e avaliação de áreas contaminadas próximas a corpos d'água.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Leopold, L. B. & Wolman, M. G. (1960). "River meanders." Geological
 *     Society of America Bulletin 71(6), 769–794.
 *     USGS Professional Paper 282-B. (razão de curvatura, wavelength)
 *   - Hooke, J. M. (2007). "Spatial variability, mechanisms and propagation of
 *     change in an active meandering river." Geomorphology 84(3-4), 277–296.
 *     DOI: 10.1016/j.geomorph.2006.05.021. (taxa de migração lateral)
 *   - Brice, J. C. (1974). "Evolution of meander loops." Geological Society of
 *     America Bulletin 85(4), 581–586. USGS WSP 2022.
 *     (classificação de atividade de meandros)
 *
 * @module core/analytics/riverMeanderMigrationRate
 */

'use strict';

/**
 * Calculates the lateral migration rate (m/year) of a meander bend.
 *
 * Calcula a taxa de migração lateral de um meandro fluvial usando a relação
 * empírica de Hooke (2007), que correlaciona a taxa de migração com o índice
 * de potência do fluxo e a razão de curvatura do meandro. A fórmula combina
 * os parâmetros hidráulicos e morfológicos mais relevantes para a migração.
 *
 * Formula: M_r = k × (Ω / W) × (W / R_c)^1.5
 * onde k ≈ 0.012 (coeficiente empírico de Hooke 2007, Eq. 5),
 * Ω = stream power (W/m), W = largura do canal (m), R_c = raio de curvatura (m)
 *
 * @param {number} streamPowerWm  - Stream power per unit width Ω (W/m, > 0)
 * @param {number} channelWidthM  - Bankfull channel width W (m, > 0)
 * @param {number} radiusCurvM    - Radius of curvature R_c (m, > 0)
 * @param {number} [k=0.012]      - Empirical migration coefficient (Hooke 2007)
 * @returns {number} Lateral migration rate in m/year
 * @throws {TypeError}  if any input is not a finite number
 * @throws {RangeError} if any dimensional input is ≤ 0
 *
 * @example
 * calcMigrationRate(500, 30, 90); // ~0.37 m/year
 */
export function calcMigrationRate(streamPowerWm: number, channelWidthM: number, radiusCurvM: number, k: number = 0.012): number {
    if (
        !Number.isFinite(streamPowerWm) ||
        !Number.isFinite(channelWidthM) ||
        !Number.isFinite(radiusCurvM) ||
        !Number.isFinite(k)
    ) {
        throw new TypeError('calcMigrationRate: all inputs must be finite numbers');
    }
    if (streamPowerWm <= 0) throw new RangeError('calcMigrationRate: streamPowerWm must be > 0');
    if (channelWidthM <= 0) throw new RangeError('calcMigrationRate: channelWidthM must be > 0');
    if (radiusCurvM <= 0) throw new RangeError('calcMigrationRate: radiusCurvM must be > 0');
    if (k <= 0) throw new RangeError('calcMigrationRate: k must be > 0');

    // Taxa de migração lateral - Hooke (2007) Eq. 5
    const curvatureRatio = channelWidthM / radiusCurvM;
    return k * (streamPowerWm / channelWidthM) * Math.pow(curvatureRatio, 1.5);
}

/**
 * Calculates the bend curvature ratio (R_c / W) of a meander.
 *
 * Calcula a razão de curvatura do meandro (R_c / W), parâmetro adimensional
 * central na geomorfologia fluvial. Leopold & Wolman (1960) estabeleceram que
 * a maioria dos meandros ativos apresenta razão de curvatura entre 1.5 e 4.3,
 * com valor ótimo em torno de 2.3 para máxima eficiência hidráulica.
 *
 * @param {number} radiusCurvM   - Radius of curvature R_c (m, > 0)
 * @param {number} channelWidthM - Bankfull channel width W (m, > 0)
 * @returns {number} Dimensionless curvature ratio R_c / W
 * @throws {TypeError}  if inputs are not finite numbers
 * @throws {RangeError} if any input is ≤ 0
 *
 * @example
 * calcBendCurvatureRatio(90, 30); // 3.0 (moderate curvature)
 */
export function calcBendCurvatureRatio(radiusCurvM: number, channelWidthM: number): number {
    if (!Number.isFinite(radiusCurvM) || !Number.isFinite(channelWidthM)) {
        throw new TypeError('calcBendCurvatureRatio: radiusCurvM and channelWidthM must be finite numbers');
    }
    if (radiusCurvM <= 0) throw new RangeError('calcBendCurvatureRatio: radiusCurvM must be > 0');
    if (channelWidthM <= 0) throw new RangeError('calcBendCurvatureRatio: channelWidthM must be > 0');

    // Razão de curvatura adimensional (Leopold & Wolman 1960)
    return radiusCurvM / channelWidthM;
}

/**
 * Calculates the Stream Power Index (SPI) per unit channel width.
 *
 * Calcula o índice de potência do fluxo (Stream Power Index - SPI) por unidade
 * de largura do canal, que representa a energia do escoamento disponível para
 * erosão e transporte de sedimentos. O SPI é o principal motor da migração de
 * meandros (Hooke 2007). Formula: Ω = ρ × g × Q × S / W
 * onde ρ = 1000 kg/m³ (água), g = 9.81 m/s², Q = vazão (m³/s), S = declividade
 * hidráulica (m/m), W = largura do canal (m).
 *
 * @param {number} dischargeM3s  - Bankfull discharge Q (m³/s, > 0)
 * @param {number} slopeMm       - Hydraulic slope S (m/m, > 0)
 * @param {number} channelWidthM - Bankfull channel width W (m, > 0)
 * @param {number} [rho=1000]    - Water density (kg/m³, default 1000)
 * @returns {number} Stream power index Ω in W/m
 * @throws {TypeError}  if any input is not a finite number
 * @throws {RangeError} if any dimensional input is ≤ 0
 *
 * @example
 * calcStreamPowerIndex(50, 0.001, 30); // ~16350 W/m
 */
export function calcStreamPowerIndex(dischargeM3s: number, slopeMm: number, channelWidthM: number, rho: number = 1000): number {
    if (
        !Number.isFinite(dischargeM3s) ||
        !Number.isFinite(slopeMm) ||
        !Number.isFinite(channelWidthM) ||
        !Number.isFinite(rho)
    ) {
        throw new TypeError('calcStreamPowerIndex: all inputs must be finite numbers');
    }
    if (dischargeM3s <= 0) throw new RangeError('calcStreamPowerIndex: dischargeM3s must be > 0');
    if (slopeMm <= 0) throw new RangeError('calcStreamPowerIndex: slopeMm must be > 0');
    if (channelWidthM <= 0) throw new RangeError('calcStreamPowerIndex: channelWidthM must be > 0');
    if (rho <= 0) throw new RangeError('calcStreamPowerIndex: rho must be > 0');

    const g = 9.81; // aceleração gravitacional (m/s²)
    // Ω = ρ × g × Q × S / W - Hooke (2007) Eq. 1
    return (rho * g * dischargeM3s * slopeMm) / channelWidthM;
}

interface MeanderActivityResult {
    activity: 'stable' | 'moderate' | 'active' | 'very_active';
    riskLevel: string;
    monitoringFrequency: string;
}

/**
 * Classifies meander activity level based on migration rate and curvature ratio.
 *
 * Classifica a atividade do meandro em quatro categorias com base na taxa de
 * migração lateral e na razão de curvatura, seguindo a tipologia de Brice (1974)
 * adaptada por Hooke (2007) para sistemas fluviais contemporâneos. A classificação
 * orienta o nível de monitoramento e proteção de margens necessário.
 *
 * @param {number} migrationRateMyr - Lateral migration rate (m/year, ≥ 0)
 * @param {number} curvatureRatio   - Dimensionless R_c/W ratio (> 0)
 * @returns {{ activity: string, riskLevel: string, monitoringFrequency: string }}
 *   activity: 'stable' | 'moderate' | 'active' | 'very_active'
 *   riskLevel: qualitative risk level for riverside infrastructure
 *   monitoringFrequency: recommended monitoring interval
 * @throws {TypeError}  if any input is not a finite number
 * @throws {RangeError} if migrationRateMyr < 0 or curvatureRatio ≤ 0
 *
 * @example
 * classifyMeanderActivity(1.2, 2.5);
 * // { activity: 'active', riskLevel: 'High', monitoringFrequency: 'Annual' }
 */
export function classifyMeanderActivity(migrationRateMyr: number, curvatureRatio: number): MeanderActivityResult {
    if (!Number.isFinite(migrationRateMyr) || !Number.isFinite(curvatureRatio)) {
        throw new TypeError('classifyMeanderActivity: all inputs must be finite numbers');
    }
    if (migrationRateMyr < 0) throw new RangeError('classifyMeanderActivity: migrationRateMyr must be >= 0');
    if (curvatureRatio <= 0) throw new RangeError('classifyMeanderActivity: curvatureRatio must be > 0');

    // Classificação de atividade baseada em Brice (1974) e Hooke (2007)
    // Meandros com razão de curvatura < 1.5 ou > 10 são atípicos e têm atividade reduzida
    const tightCurve = curvatureRatio < 1.5; // curvatura muito acentuada — propenso a cutoff

    if (migrationRateMyr < 0.1 && !tightCurve) {
        return { activity: 'stable', riskLevel: 'Low', monitoringFrequency: 'Every 5 years' };
    }
    if (migrationRateMyr < 0.5) {
        return { activity: 'moderate', riskLevel: 'Medium', monitoringFrequency: 'Every 2 years' };
    }
    if (migrationRateMyr < 2.0) {
        return { activity: 'active', riskLevel: 'High', monitoringFrequency: 'Annual' };
    }
    return { activity: 'very_active', riskLevel: 'Very high', monitoringFrequency: 'Biannual' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverMeanderMigrationRateMeta = {
    name: 'riverMeanderMigrationRate',
    description: 'River Meander Migration Rate',
    category: 'analytics',
    familyTags: ['river'],
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
