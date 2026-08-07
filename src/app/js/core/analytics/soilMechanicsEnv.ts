// @ts-check
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
// Application: EHS & Mining - Soil Mechanics (Environmental Applications)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Soil Mechanics - Environmental Applications / Mecânica dos Solos Ambiental
 *
 * Módulo puro implementando métodos clássicos de mecânica dos solos aplicados
 * ao contexto de gêmeos digitais ambientais: recalque, permeabilidade,
 * capacidade de carga e risco de liquefação.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References / Referências:
 * - Terzaghi, K. (1943) Theoretical Soil Mechanics. Wiley, New York.
 * - Hazen, A. (1911) Discussion of "Dams on Sand Foundations". ASCE Trans. 73:199–203.
 *   Water Supply Paper (USGS) - k = C × d10²
 * - Robertson, P.K. (2009) Interpretation of cone penetration tests - a unified approach.
 *   Canadian Geotechnical Journal 46(11):1337–1355.
 *
 * @module soilMechanicsEnv
 */

'use strict';

// ---------------------------------------------------------------------------
// Terzaghi bearing capacity factors (1943) - tabulated by friction angle φ (deg)
// Fatores de capacidade de carga de Terzaghi tabelados por ângulo de atrito φ
// Interpolação linear entre pontos: φ ∈ {0, 10, 20, 30, 40}
// ---------------------------------------------------------------------------
const TERZAGHI_FACTORS = [
    { phi: 0, Nc: 5.7, Nq: 1.0, Ng: 0.0 },
    { phi: 10, Nc: 9.6, Nq: 2.7, Ng: 1.2 },
    { phi: 20, Nc: 17.7, Nq: 7.4, Ng: 5.0 },
    { phi: 30, Nc: 37.2, Nq: 18.4, Ng: 15.7 },
    { phi: 40, Nc: 75.3, Nq: 64.2, Ng: 93.7 },
];

/**
 * Linear interpolation of Terzaghi bearing capacity factors for given φ.
 * Interpolação linear dos fatores de capacidade de carga de Terzaghi para φ dado.
 *
 * @param {number} phi_deg - Friction angle (degrees) 0–40
 * @returns {{ Nc: number, Nq: number, Ng: number }}
 */
function interpolateTerzaghi(phi_deg: any) {
    if (phi_deg <= 0) return { ...TERZAGHI_FACTORS[0] };
    if (phi_deg >= 40) return { ...TERZAGHI_FACTORS[4] };

    let lower = TERZAGHI_FACTORS[0];
    let upper = TERZAGHI_FACTORS[1];
    for (let i = 0; i < TERZAGHI_FACTORS.length - 1; i++) {
if (phi_deg >= TERZAGHI_FACTORS[i]!.phi && phi_deg <= TERZAGHI_FACTORS[i + 1]!.phi) {
            lower = TERZAGHI_FACTORS[i];
            upper = TERZAGHI_FACTORS[i + 1];
            break;
        }
    }
const t = (phi_deg - lower!.phi) / (upper!.phi - lower!.phi);
    return {
        Nc: lower!.Nc + t * (upper!.Nc - lower!.Nc),
        Nq: lower!.Nq + t * (upper!.Nq - lower!.Nq),
        Ng: lower!.Ng + t * (upper!.Ng - lower!.Ng),
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute soil compressibility index (Cc) and consolidation settlement.
 * Calcula índice de compressão (Cc) e recalque de consolidação.
 *
 * Cc = Δe / log10(σ2 / σ1)
 * Settlement = [Cc / (1 + e0)] × H × log10(σ2 / σ1) × 1000  (mm)
 *
 * @param {number} voidRatio_initial - Initial void ratio e0 (dimensionless) - índice de vazios inicial
 * @param {number} voidRatio_final   - Final void ratio e1 (dimensionless) - índice de vazios final
 * @param {number} stress_initial_kPa - Initial effective stress σ1 (kPa) - tensão efetiva inicial
 * @param {number} stress_final_kPa   - Final effective stress σ2 (kPa) - tensão efetiva final
 * @param {number} [H_m=1]            - Layer thickness (m) - espessura da camada (padrão 1 m)
 * @returns {{ cc: number, consolidationSettlement_mm: number }}
 * @throws {RangeError} If stresses are non-positive or void ratios are negative
 */
export function computeCompressibility(
    voidRatio_initial: any,
    voidRatio_final: any,
    stress_initial_kPa: any,
    stress_final_kPa: any,
    H_m = 1,
) {
    if (
        [voidRatio_initial, voidRatio_final, stress_initial_kPa, stress_final_kPa, H_m].some(
            (v) => typeof v !== 'number',
        )
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (voidRatio_initial < 0 || voidRatio_final < 0) {
        throw new RangeError('Void ratios must be >= 0');
    }
    if (stress_initial_kPa <= 0 || stress_final_kPa <= 0) {
        throw new RangeError('Effective stresses must be > 0 kPa');
    }
    if (H_m <= 0) {
        throw new RangeError('Layer thickness H_m must be > 0');
    }

    const delta_e = voidRatio_initial - voidRatio_final;
    const log_ratio = Math.log10(stress_final_kPa / stress_initial_kPa);

    // Cc definido positivo para compressão (delta_e > 0 quando σ2 > σ1)
    const cc = log_ratio !== 0 ? Math.abs(delta_e / log_ratio) : 0;
    const consolidationSettlement_mm = (cc / (1 + voidRatio_initial)) * H_m * Math.abs(log_ratio) * 1000;

    return { cc, consolidationSettlement_mm };
}

/**
 * Estimate hydraulic conductivity using Hazen (1911) empirical formula.
 * Estima condutividade hidráulica pelo método empírico de Hazen (1911).
 *
 * k = C × d10²  onde C = 0.01 cm/s por mm² (areias uniformes d10 em mm)
 * Válido para areias com Cu < 5 e 0.1 mm < d10 < 3 mm.
 *
 * @param {number} grain_size_d10_mm - Effective grain size d10 (mm) - granulometria d10
 * @returns {{ k_cm_s: number, k_m_s: number }}
 * @throws {RangeError} If d10 is not positive
 */
export function computePermeabilityCoeff(grain_size_d10_mm: any) {
    if (typeof grain_size_d10_mm !== 'number') {
        throw new TypeError('grain_size_d10_mm must be a number');
    }
    if (grain_size_d10_mm <= 0) {
        throw new RangeError('grain_size_d10_mm must be > 0');
    }

    // Constante de Hazen C = 0.01 (cm/s)/(mm²) - referência USGS Water Supply Paper 1911
    const C = 0.01;
    const k_cm_s = C * grain_size_d10_mm * grain_size_d10_mm;
    const k_m_s = k_cm_s / 100;

    return { k_cm_s, k_m_s };
}

/**
 * Compute ultimate bearing capacity using Terzaghi (1943) general equation.
 * Calcula capacidade de carga última pela equação geral de Terzaghi (1943).
 *
 * qu = c×Nc + γ×D×Nq + 0.5×γ×B×Nγ
 * Nc, Nq, Nγ interpolados linearmente entre φ ∈ {0, 10, 20, 30, 40}°.
 *
 * @param {number} cohesion_kPa       - Soil cohesion c (kPa) - coesão do solo
 * @param {number} frictionAngle_deg  - Internal friction angle φ (degrees, 0–40) - ângulo de atrito
 * @param {number} depth_m            - Foundation depth D (m) - profundidade da fundação
 * @param {number} width_m            - Foundation width B (m) - largura da fundação
 * @param {number} density_kN_m3      - Unit weight γ (kN/m³) - peso unitário do solo
 * @returns {{ qu_kPa: number, Nc: number, Nq: number, Ng: number }}
 * @throws {RangeError} If any parameter is out of valid range
 */
export function computeBearingCapacity(cohesion_kPa: any, frictionAngle_deg: any, depth_m: any, width_m: any, density_kN_m3: any) {
    if ([cohesion_kPa, frictionAngle_deg, depth_m, width_m, density_kN_m3].some((v) => typeof v !== 'number')) {
        throw new TypeError('All arguments must be numbers');
    }
    if (cohesion_kPa < 0) throw new RangeError('cohesion_kPa must be >= 0');
    if (frictionAngle_deg < 0 || frictionAngle_deg > 40) {
        throw new RangeError('frictionAngle_deg must be in [0, 40]');
    }
    if (depth_m < 0) throw new RangeError('depth_m must be >= 0');
    if (width_m <= 0) throw new RangeError('width_m must be > 0');
    if (density_kN_m3 <= 0) throw new RangeError('density_kN_m3 must be > 0');

    const { Nc, Nq, Ng } = interpolateTerzaghi(frictionAngle_deg);
const qu_kPa = cohesion_kPa * (Nc as number) + density_kN_m3 * depth_m * (Nq as number) + 0.5 * density_kN_m3 * width_m * (Ng as number);

    return { qu_kPa, Nc, Nq, Ng };
}

/**
 * Classify soil liquefaction risk using simplified CPT-based method (Robertson 2009).
 * Classifica risco de liquefação pelo método CPT simplificado (Robertson 2009).
 *
 * qc1n = (qc/Pa) × (Pa/σv)^0.5  - resistência de ponta normalizada
 * FSL simplificado: função de qc1n e percentual de finos.
 *
 * @param {number} cpt_qc_MPa    - CPT tip resistance qc (MPa) - resistência de ponta CPT
 * @param {number} fines_pct     - Fines content (%) - teor de finos
 * @param {number} gwLevel_m     - Groundwater level depth (m) - nível d'água (profundidade)
 * @param {number} depth_m       - Evaluation depth (m) - profundidade de avaliação
 * @returns {{ fsl: number, riskLevel: 'low'|'moderate'|'high' }}
 * @throws {RangeError} If parameters are out of valid range
 */
export function classifySoilLiquefactionRisk(cpt_qc_MPa: any, fines_pct: any, gwLevel_m: any, depth_m: any) {
    if ([cpt_qc_MPa, fines_pct, gwLevel_m, depth_m].some((v) => typeof v !== 'number')) {
        throw new TypeError('All arguments must be numbers');
    }
    if (cpt_qc_MPa <= 0) throw new RangeError('cpt_qc_MPa must be > 0');
    if (fines_pct < 0 || fines_pct > 100) throw new RangeError('fines_pct must be in [0, 100]');
    if (gwLevel_m < 0) throw new RangeError('gwLevel_m must be >= 0');
    if (depth_m <= 0) throw new RangeError('depth_m must be > 0');

    // Pressão atmosférica de referência Pa = 101.3 kPa
    const Pa = 101.3; // kPa
    const qc_kPa = cpt_qc_MPa * 1000;

    // Tensão vertical total σv estimada (solo saturado acima do NA = 20 kN/m³, seco = 16 kN/m³)
    const dryThickness = Math.min(gwLevel_m, depth_m);
    const satThickness = Math.max(0, depth_m - gwLevel_m);
    const sigma_v = dryThickness * 16 + satThickness * 20; // kPa

    // Normalização conforme Robertson (2009) eq. 1
    const qc1n = (qc_kPa / Pa) * Math.pow(Pa / Math.max(sigma_v, 1), 0.5);

    // Ajuste para finos (FC > 35%: soma 30 ao qc1n para CRR mais conservador)
    const qc1n_cs = qc1n + (fines_pct > 35 ? 30 : fines_pct > 5 ? fines_pct * 0.5 : 0);

    // CRR por Robertson (2009): qc1n_cs >= 160 => não liquefaz; < 50 => altamente liquefeito
    // Fórmula simplificada linear-normalizada para intervalo [50, 160]:
    // CRR = 0.833 × (qc1n_cs / 1000) + 0.05  (para 50 ≤ qc1n_cs < 160)
    // Fonte: Robertson (2009) Fig. 4 aproximação linear
    let crr;
    if (qc1n_cs >= 160) {
        crr = 10; // Solo denso, não liquefeito — grande resistência
    } else if (qc1n_cs < 50) {
        crr = 0.05; // Solo muito frouxo — altamente vulnerável
    } else {
        // Interpolação linear Robertson (2009): CRR ≈ 0.833*(qc1n_cs/1000) + 0.05
        crr = 0.833 * (qc1n_cs / 1000) + 0.05;
    }

    // CSR simplificado: 0.65 × (σv / Pa) × amax_g (amax assumido = 0.15g)
    const amax_g = 0.15;
    const csr = 0.65 * (sigma_v / Pa) * amax_g;

    const fsl = csr > 0 ? crr / csr : Infinity;

    /** @type {'low'|'moderate'|'high'} */
    let riskLevel;
    if (fsl > 1.4) riskLevel = 'low';
    else if (fsl >= 1.0) riskLevel = 'moderate';
    else riskLevel = 'high';

    return { fsl: Number(fsl.toFixed(3)), riskLevel };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilMechanicsEnvMeta = {
    name: 'soilMechanicsEnv',
    description: 'Soil Mechanics (Environmental Applications)',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
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
