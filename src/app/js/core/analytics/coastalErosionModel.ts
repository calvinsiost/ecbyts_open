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
// Application: EHS & Mining - Coastal Erosion Modeling
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Coastal Erosion Model - Shoreline Change Assessment
 *
 * Módulo puro implementando modelos clássicos de erosão costeira:
 * transporte longitudinal (CERC), regra de Bruun, impacto de elevação do nível
 * do mar e Índice de Vulnerabilidade Costeira (CVI).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - USACE (1984). Shore Protection Manual, 4th ed. Vol. 1.
 *     U.S. Army Corps of Engineers, Coastal Engineering Research Center,
 *     Vicksburg, MS. (CERC longshore sediment transport formula)
 *   - Bruun, P. (1962). "Sea-level rise as a cause of shore erosion."
 *     ASCE Journal of Waterways and Harbors Division, 88(1), 117–130.
 *     (Bruun Rule for shoreline retreat under sea-level rise)
 *   - Thieler, E. R., & Hammar-Klose, E. S. (2000). National Assessment of
 *     Coastal Vulnerability to Sea-Level Rise: Preliminary Results for the
 *     U.S. Atlantic Coast. USGS Open-File Report 99-593.
 *     (Coastal Vulnerability Index - CVI methodology)
 *
 * @module coastalErosionModel
 */

'use strict';

// CERC empirical coefficient (dimensionless) - USACE (1984) Table 4-35
const CERC_K = 0.39;

// Breaking wave index (ratio of breaking height to deep-water height)
const BREAKING_INDEX = 0.85;

/**
 * Compute Longshore Sediment Transport - CERC Formula
 * Calcula o transporte longitudinal de sedimentos pela fórmula do CERC.
 *
 * Formula: Q_ls = K × H_b^2.5 × sin(2α_b) / 16
 * where H_b = waveHeight × 0.85 (breaker height)
 *       α_b = wave breaking angle (degrees)
 *
 * @param waveHeight_m   - Significant wave height in deep water (m); >0
 * @param wavePeriod_s   - Wave period (s); >0; used for completeness / future extensions
 * @param waveAngle_deg  - Angle of wave approach to shoreline normal (degrees); [-90, 90]
 */
export function computeLongshoreTransport(
    waveHeight_m: number,
    wavePeriod_s: number,
    waveAngle_deg: number,
): { transport_m3_yr: number; direction: 'north' | 'south' } {
    if (typeof waveHeight_m !== 'number' || waveHeight_m <= 0) {
        throw new RangeError('waveHeight_m must be a positive number');
    }
    if (typeof wavePeriod_s !== 'number' || wavePeriod_s <= 0) {
        throw new RangeError('wavePeriod_s must be a positive number');
    }
    if (typeof waveAngle_deg !== 'number' || waveAngle_deg < -90 || waveAngle_deg > 90) {
        throw new RangeError('waveAngle_deg must be in range [-90, 90]');
    }

    // Altura de arrebentação estimada pelo índice de Miche
    const H_b = waveHeight_m * BREAKING_INDEX;

    // Ângulo em radianos para cálculo trigonométrico
    const alpha_rad = (waveAngle_deg * Math.PI) / 180;

    // Fórmula CERC: Q = K × H_b^2.5 × sin(2α) / 16
    const transport_m3_yr = (CERC_K * Math.pow(H_b, 2.5) * Math.sin(2 * alpha_rad)) / 16;

    return {
        transport_m3_yr,
        direction: waveAngle_deg >= 0 ? 'north' : 'south',
    };
}

/**
 * Compute Beach Erosion Rate - Bruun Rule (Sediment Budget)
 * Calcula a taxa de erosão pela regra de Bruun com balanço sedimentar.
 *
 * Formula: E = S / (L + h*)
 * where S = sediment budget (m³/yr/m of shoreline, negative = deficit)
 *       L = active profile width (m)
 *       h* = closure depth (m)
 * Negative result → erosion; positive → accretion.
 *
 * @param sedimentBudget_m3_yr_m - Net sediment budget per unit shoreline (m³/yr/m); any sign
 * @param profileWidth_m         - Active profile width from shoreline to closure depth (m); >0
 * @param closureDepth_m         - Closure depth (depth of no significant change) (m); >0
 */
export function computeBeachErosionRate(
    sedimentBudget_m3_yr_m: number,
    profileWidth_m: number,
    closureDepth_m: number,
): { erosionRate_m_yr: number; accretion: boolean } {
    if (typeof sedimentBudget_m3_yr_m !== 'number') {
        throw new TypeError('sedimentBudget_m3_yr_m must be a number');
    }
    if (typeof profileWidth_m !== 'number' || profileWidth_m <= 0) {
        throw new RangeError('profileWidth_m must be a positive number');
    }
    if (typeof closureDepth_m !== 'number' || closureDepth_m <= 0) {
        throw new RangeError('closureDepth_m must be a positive number');
    }

    // Regra de Bruun: taxa de erosão = balanço / (largura + profundidade de fechamento)
    const erosionRate_m_yr = sedimentBudget_m3_yr_m / (profileWidth_m + closureDepth_m);

    return {
        erosionRate_m_yr,
        accretion: erosionRate_m_yr > 0,
    };
}

/**
 * Compute Sea-Level Rise Impact on Shoreline - Bruun Rule
 * Calcula o recuo da linha de costa pelo aumento do nível do mar (Bruun Rule).
 *
 * Formula: R = (SLR/1000) / (tan β × m_s)
 * where SLR  = sea-level rise (mm/yr → converted to m/yr)
 *       tan β = beach face slope (dimensionless)
 *       m_s   = sediment mobility factor (dimensionless, default 1.0)
 *
 * @param slr_mm_yr          - Sea-level rise rate (mm/yr); >0
 * @param beachSlope         - Beach face slope (tan β, dimensionless, e.g. 0.02); >0
 * @param sedimentMobility - Sediment mobility factor (default 1.0); >0
 */
export function computeSeaLevelRiseImpact(
    slr_mm_yr: number,
    beachSlope: number,
    sedimentMobility = 1.0,
): { retreatRate_m_yr: number; '2050projection_m': number; '2100projection_m': number } {
    if (typeof slr_mm_yr !== 'number' || slr_mm_yr <= 0) {
        throw new RangeError('slr_mm_yr must be a positive number');
    }
    if (typeof beachSlope !== 'number' || beachSlope <= 0) {
        throw new RangeError('beachSlope must be a positive number');
    }
    if (typeof sedimentMobility !== 'number' || sedimentMobility <= 0) {
        throw new RangeError('sedimentMobility must be a positive number');
    }

    // Conversão de mm/yr para m/yr e aplicação da regra de Bruun
    const slr_m_yr = slr_mm_yr / 1000;
    const retreatRate_m_yr = slr_m_yr / (beachSlope * sedimentMobility);

    return {
        retreatRate_m_yr,
        // Projeções para 2050 (24 anos) e 2100 (74 anos) a partir de 2026
        '2050projection_m': retreatRate_m_yr * 24,
        '2100projection_m': retreatRate_m_yr * 74,
    };
}

/**
 * Compute Longshore Transport using H_b (breaking wave height) signature variant.
 * Calcula o transporte longitudinal usando altura de onda de arrebentação direta.
 *
 * Variante da assinatura canônica: recebe H_b diretamente (sem índice de arrebentação interno).
 * Formula: Q = K × H_b^(5/2) × sin(2α) onde K=0.39 (CERC 1984).
 *
 * @param H_b_m     - Breaking wave height (m); > 0
 * @param T_s       - Wave period (s); > 0
 * @param angle_deg - Angle of incidence at breaking (degrees); [-90, 90]
 * @throws {RangeError} se parâmetros fora do intervalo válido
 */
export function computeLongshoreTransportCERC(
    H_b_m: number,
    T_s: number,
    angle_deg: number,
): { Q_m3_yr: number } {
    if (typeof H_b_m !== 'number' || H_b_m <= 0) {
        throw new RangeError('H_b_m must be a positive number');
    }
    if (typeof T_s !== 'number' || T_s <= 0) {
        throw new RangeError('T_s must be a positive number');
    }
    if (typeof angle_deg !== 'number' || angle_deg < -90 || angle_deg > 90) {
        throw new RangeError('angle_deg must be in [-90, 90]');
    }

    // Ângulo em radianos para cálculo trigonométrico
    const alpha_rad = (angle_deg * Math.PI) / 180;

    // Fórmula CERC: Q = K × H_b^(5/2) × sin(2α)
    const Q_m3_yr = CERC_K * Math.pow(H_b_m, 2.5) * Math.sin(2 * alpha_rad);

    return { Q_m3_yr };
}

/**
 * Compute shoreline recession rate from sediment budget.
 * Calcula a taxa de recuo da linha de costa a partir do balanço sedimentar.
 *
 * Balanço: dV/dt = Q_in - Q_out (m³/yr)
 * Recuo: R = dV/dt / (height × length) [m/yr, negativo = erosão]
 *
 * @param Q_in_m3_yr            - Incoming sediment transport (m³/yr); >= 0
 * @param Q_out_m3_yr           - Outgoing sediment transport (m³/yr); >= 0
 * @param active_profile_height_m - Active profile height (m); > 0
 * @param shoreline_length_m    - Shoreline segment length (m); > 0
 * @throws {RangeError} se parâmetros fora do intervalo válido
 */
export function computeShorelineRecession(
    Q_in_m3_yr: number,
    Q_out_m3_yr: number,
    active_profile_height_m: number,
    shoreline_length_m: number,
): { recession_m_yr: number } {
    if (typeof Q_in_m3_yr !== 'number' || Q_in_m3_yr < 0) {
        throw new RangeError('Q_in_m3_yr must be >= 0');
    }
    if (typeof Q_out_m3_yr !== 'number' || Q_out_m3_yr < 0) {
        throw new RangeError('Q_out_m3_yr must be >= 0');
    }
    if (typeof active_profile_height_m !== 'number' || active_profile_height_m <= 0) {
        throw new RangeError('active_profile_height_m must be a positive number');
    }
    if (typeof shoreline_length_m !== 'number' || shoreline_length_m <= 0) {
        throw new RangeError('shoreline_length_m must be a positive number');
    }

    // Balanço volumétrico: excesso positivo = acreção; negativo = erosão
    const dV_dt = Q_in_m3_yr - Q_out_m3_yr;

    // Recuo por unidade de comprimento: R = dV/dt / (h × L)
    const recession_m_yr = dV_dt / (active_profile_height_m * shoreline_length_m);

    return { recession_m_yr };
}

/**
 * Classify coastal erosion risk based on recession rate.
 * Classifica o risco de erosão costeira pela taxa de recuo da linha de costa.
 *
 * Thresholds (m/yr):
 *   stable   : recession <= 0 (acreção)
 *   low      : < 0.5 m/yr
 *   moderate : < 2.0 m/yr
 *   high     : < 5.0 m/yr
 *   critical : >= 5.0 m/yr
 *
 * @param recession_m_yr - Shoreline recession rate (m/yr); any sign
 * @throws {TypeError} se tipo incorreto
 */
export function classifyCoastalErosionRisk(
    recession_m_yr: number,
): { risk: 'stable' | 'low' | 'moderate' | 'high' | 'critical' } {
    if (typeof recession_m_yr !== 'number') {
        throw new TypeError('recession_m_yr must be a number');
    }

    // Negativo ou zero = linha estável ou em acreção
    let risk: 'stable' | 'low' | 'moderate' | 'high' | 'critical';
    if (recession_m_yr <= 0) risk = 'stable';
    else if (recession_m_yr < 0.5) risk = 'low';
    else if (recession_m_yr < 2.0) risk = 'moderate';
    else if (recession_m_yr < 5.0) risk = 'high';
    else risk = 'critical';

    return { risk };
}

/**
 * Morphology type to CVI score mapping
 * Pontuação por tipo de morfologia costeira (Thieler & Hammar-Klose 2000)
 */
const MORPHOLOGY_SCORES: Record<string, number> = {
    rocky: 1,
    cliffs: 2,
    sandy: 3,
    mudflat: 4,
    coral: 5,
};

/**
 * Classify Coastal Vulnerability - Simplified CVI
 * Classifica a vulnerabilidade costeira usando o Índice CVI simplificado.
 *
 * Método: cada variável recebe score 1–5; CVI = média dos scores.
 * Categorias: very_low ≤1.5, low ≤2.5, moderate ≤3.5, high ≤4.0, very_high >4.0
 *
 * @param erosionRate      - Erosion rate score (1=very low … 5=very high)
 * @param seaLevelRise     - Sea-level rise score (1=very low … 5=very high)
 * @param stormFrequency   - Storm frequency score (1=very low … 5=very high)
 * @param morphologyType   - Coastal morphology: 'rocky'|'cliffs'|'sandy'|'mudflat'|'coral'
 */
export function classifyCoastalVulnerability(
    erosionRate: number,
    seaLevelRise: number,
    stormFrequency: number,
    morphologyType: string,
): { cvi: number; vulnerability: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high' } {
    const validScores = [erosionRate, seaLevelRise, stormFrequency];
    for (const score of validScores) {
        if (typeof score !== 'number' || score < 1 || score > 5) {
            throw new RangeError('erosionRate, seaLevelRise, and stormFrequency must be numbers in [1, 5]');
        }
    }
    if (!Object.prototype.hasOwnProperty.call(MORPHOLOGY_SCORES, morphologyType)) {
        throw new TypeError(`morphologyType must be one of: ${Object.keys(MORPHOLOGY_SCORES).join(', ')}`);
    }

    const morphScore = (MORPHOLOGY_SCORES as Record<string, number>)[morphologyType]!;
    const cvi = (erosionRate + seaLevelRise + stormFrequency + morphScore) / 4;

    let vulnerability: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
    if (cvi > 4.0) vulnerability = 'very_high';
    else if (cvi > 3.5) vulnerability = 'high';
    else if (cvi > 2.5) vulnerability = 'moderate';
    else if (cvi > 1.5) vulnerability = 'low';
    else vulnerability = 'very_low';

    return { cvi, vulnerability };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const coastalErosionModelMeta = {
    name: 'coastalErosionModel',
    description: 'Coastal Erosion Modeling',
    category: 'analytics',
    familyTags: ['coastal', 'erosion'],
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
