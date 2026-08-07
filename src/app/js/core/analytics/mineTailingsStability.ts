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
 * Mine Tailings Dam Stability Analysis
 * Analise de estabilidade de barragens de rejeitos de mineracao.
 *
 * References:
 * [1] ANM Portaria 70.389/2017 -- Politica de seguranca de barragens de mineracao (BR).
 * [2] Bishop, A.W. (1955). The use of the slip circle in the stability analysis of
 *     earth slopes. Geotechnique 5(1):7-17. doi:10.1680/geot.1955.5.1.7
 * [3] Kramer, S.L. (1996). Geotechnical Earthquake Engineering. Prentice Hall. Ch.10.
 * [4] ICOLD Bulletin 121 (1999). Tailings dams -- Risk of dangerous occurrences.
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

/** Asserts that value is a finite number. */
function assertFiniteNumber(value: unknown, name: string): asserts value is number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
    }
}

/**
 * Computes the Factor of Safety (FS) using the Mohr-Coulomb failure criterion.
 * Calcula o Fator de Seguranca (FS) pelo criterio de Mohr-Coulomb.
 *
 * FS = (c + sigma_n * tan(phi)) / tau
 * stable if FS >= 1.5 per ANM Portaria 70.389/2017.
 *
 * @param cohesion_kPa - Effective cohesion c' (kPa). / Coesao efetiva (kPa).
 * @param friction_angle_deg - Effective friction angle phi' (degrees). / Angulo de atrito efetivo.
 * @param normal_stress_kPa - Effective normal stress on failure plane (kPa). / Tensao normal efetiva.
 * @param shear_stress_kPa - Driving shear stress (kPa). / Tensao cisalhante atuante.
 * @throws {TypeError} If any argument is not a finite number.
 * @throws {RangeError} If cohesion_kPa < 0, friction_angle_deg outside (0,90), shear_stress_kPa <= 0.
 * @reference Bishop (1955) Geotechnique 5(1):7. doi:10.1680/geot.1955.5.1.7;
 *            ANM Portaria 70.389/2017 Art. 14.
 */
export function computeFactorOfSafety(
    cohesion_kPa: number,
    friction_angle_deg: number,
    normal_stress_kPa: number,
    shear_stress_kPa: number,
): { fs: number; stable: boolean } {
    if (typeof cohesion_kPa !== 'number' || !Number.isFinite(cohesion_kPa))
        throw new TypeError('cohesion_kPa must be a finite number');
    if (typeof friction_angle_deg !== 'number' || !Number.isFinite(friction_angle_deg))
        throw new TypeError('friction_angle_deg must be a finite number');
    if (typeof normal_stress_kPa !== 'number' || !Number.isFinite(normal_stress_kPa))
        throw new TypeError('normal_stress_kPa must be a finite number');
    if (typeof shear_stress_kPa !== 'number' || !Number.isFinite(shear_stress_kPa))
        throw new TypeError('shear_stress_kPa must be a finite number');
    if (cohesion_kPa < 0) throw new RangeError('cohesion_kPa must be >= 0');
    if (friction_angle_deg <= 0 || friction_angle_deg >= 90)
        throw new RangeError('friction_angle_deg must be in (0, 90)');
    if (normal_stress_kPa < 0) throw new RangeError('normal_stress_kPa must be >= 0');
    if (shear_stress_kPa <= 0) throw new RangeError('shear_stress_kPa must be > 0');

    const phi_rad = (friction_angle_deg * Math.PI) / 180;
    const resisting = cohesion_kPa + normal_stress_kPa * Math.tan(phi_rad);
    const fs = resisting / shear_stress_kPa;
    // ANM Portaria 70.389/2017: FS >= 1.5 para operacao normal
    return { fs, stable: fs >= 1.5 };
}

/**
 * Computes the simplified seismic horizontal coefficient for pseudostatic analysis.
 * Calcula o coeficiente sismico horizontal simplificado para analise pseudoestatica.
 *
 * kh = 0.65 * (PGA/g) * (1 - damping_ratio)
 * Based on Kramer (1996) simplified pseudostatic approach.
 *
 * @param pga_g - Peak ground acceleration as fraction of g (dimensionless). / PGA/g.
 * @param damping_ratio - Damping ratio in [0, 1]. / Razao de amortecimento.
 * @throws {TypeError} If any argument is not a finite number.
 * @throws {RangeError} If pga_g < 0 or damping_ratio outside [0, 1].
 * @reference Kramer, S.L. (1996). Geotechnical Earthquake Engineering. Ch.10 Eq.10.13
 */
export function computeSeismicCoefficient(pga_g: number, damping_ratio: number): { kh: number } {
    if (typeof pga_g !== 'number' || !Number.isFinite(pga_g)) throw new TypeError('pga_g must be a finite number');
    if (typeof damping_ratio !== 'number' || !Number.isFinite(damping_ratio))
        throw new TypeError('damping_ratio must be a finite number');
    if (pga_g < 0) throw new RangeError('pga_g must be >= 0');
    if (damping_ratio < 0 || damping_ratio > 1) throw new RangeError('damping_ratio must be in [0, 1]');
    const kh = 0.65 * pga_g * (1 - damping_ratio);
    return { kh };
}

/**
 * Estimates the phreatic line ratio within a tailings dam body.
 * Estima a razao da linha freatica no corpo da barragem de rejeitos.
 *
 * phreatic_ratio = f(tailings_height_m, beach_length_m, permeability_ratio)
 * Simplified model: ratio = (tailings_height_m / (beach_length_m * permeability_ratio + tailings_height_m))
 * risk: low < 0.3, moderate [0.3, 0.5), high >= 0.5.
 *
 * @param tailings_height_m - Height of tailings in dam (m). / Altura dos rejeitos (m).
 * @param beach_length_m - Beach length from crest to water (m). / Comprimento da praia (m).
 * @param permeability_ratio - Ratio of drain permeability to tailings (dimensionless, >0). / Razao de permeabilidade.
 * @throws {TypeError} If any argument is not a finite number.
 * @throws {RangeError} If any argument is <= 0.
 * @reference ICOLD Bulletin 121 (1999) Ch.4; ANM Portaria 70.389/2017
 */
export function computePhreaticLine(
    tailings_height_m: number,
    beach_length_m: number,
    permeability_ratio: number,
): { phreatic_ratio: number; risk: 'low' | 'moderate' | 'high' } {
    if (typeof tailings_height_m !== 'number' || !Number.isFinite(tailings_height_m))
        throw new TypeError('tailings_height_m must be a finite number');
    if (typeof beach_length_m !== 'number' || !Number.isFinite(beach_length_m))
        throw new TypeError('beach_length_m must be a finite number');
    if (typeof permeability_ratio !== 'number' || !Number.isFinite(permeability_ratio))
        throw new TypeError('permeability_ratio must be a finite number');
    if (tailings_height_m <= 0) throw new RangeError('tailings_height_m must be > 0');
    if (beach_length_m <= 0) throw new RangeError('beach_length_m must be > 0');
    if (permeability_ratio <= 0) throw new RangeError('permeability_ratio must be > 0');

    // Modelo simplificado: razao de saturacao do aterro
    // Quanto maior a praia e a permeabilidade da drenagem, menor a linha freatica
    const phreatic_ratio = tailings_height_m / (beach_length_m * permeability_ratio + tailings_height_m);
    const risk = phreatic_ratio >= 0.5 ? 'high' : phreatic_ratio >= 0.3 ? 'moderate' : 'low';
    return { phreatic_ratio, risk };
}

/**
 * Classifies dam risk level based on FS, phreatic ratio, and seismic coefficient.
 * Classifica o nivel de risco da barragem baseado em FS, razao freatica e coeficiente sismico.
 *
 * Risk levels per ANM/DNPM Portaria 70.389/2017:
 *   A (very high): FS < 1.0 OR phreatic_ratio > 0.7 -- imminent failure risk
 *   B (high):      FS < 1.2 OR phreatic_ratio > 0.5 OR kh > 0.3
 *   C (medium):    FS < 1.5 OR phreatic_ratio > 0.3 OR kh > 0.15
 *   D (low):       FS >= 1.5 AND phreatic_ratio <= 0.3 AND kh <= 0.15
 *
 * @param fs - Factor of Safety (dimensionless). / Fator de Seguranca.
 * @param phreatic_ratio - Phreatic line ratio (0-1). / Razao da linha freatica.
 * @param seismic_kh - Seismic horizontal coefficient (dimensionless). / Coeficiente sismico.
 * @throws {TypeError} If any argument is not a finite number.
 * @throws {RangeError} If fs < 0, phreatic_ratio outside [0,1], or seismic_kh < 0.
 * @reference ANM Portaria 70.389/2017; ICOLD Bulletin 121 (1999); Bishop (1955)
 */
function validateClassifyInputs(
    fs: unknown,
    phreatic_ratio: unknown,
    seismic_kh: unknown,
): void {
    assertFiniteNumber(fs, 'fs');
    assertFiniteNumber(phreatic_ratio, 'phreatic_ratio');
    assertFiniteNumber(seismic_kh, 'seismic_kh');
    if (fs < 0) throw new RangeError('fs must be >= 0');
    if (phreatic_ratio < 0 || phreatic_ratio > 1) throw new RangeError('phreatic_ratio must be in [0, 1]');
    if (seismic_kh < 0) throw new RangeError('seismic_kh must be >= 0');
}

function decideDamRiskLevel(
    fs: number,
    phreatic_ratio: number,
    seismic_kh: number,
): { risk_level: 'A' | 'B' | 'C' | 'D'; action: string } {
    if (fs < 1.0 || phreatic_ratio > 0.7) {
        return {
            risk_level: 'A',
            action: 'Risco muito alto -- emergencia imediata, notificar ANM/defesa civil. / Very high risk -- immediate emergency.',
        };
    }
    if (fs < 1.2 || phreatic_ratio > 0.5 || seismic_kh > 0.3) {
        return {
            risk_level: 'B',
            action: 'Risco alto -- revisao urgente do plano de seguranca. / High risk -- urgent safety plan review.',
        };
    }
    if (fs < 1.5 || phreatic_ratio > 0.3 || seismic_kh > 0.15) {
        return {
            risk_level: 'C',
            action: 'Risco medio -- monitoramento intensificado e revisao de projeto. / Medium risk -- enhanced monitoring.',
        };
    }
    return {
        risk_level: 'D',
        action: 'Risco baixo -- monitoramento de rotina conforme PAE. / Low risk -- routine monitoring per emergency plan.',
    };
}

/**
 * Classifies dam risk level based on FS, phreatic ratio, and seismic coefficient.
 * Classifica o nivel de risco da barragem baseado em FS, razao freatica e coeficiente sismico.
 *
 * Risk levels per ANM/DNPM Portaria 70.389/2017:
 *   A (very high): FS < 1.0 OR phreatic_ratio > 0.7 -- imminent failure risk
 *   B (high):      FS < 1.2 OR phreatic_ratio > 0.5 OR kh > 0.3
 *   C (medium):    FS < 1.5 OR phreatic_ratio > 0.3 OR kh > 0.15
 *   D (low):       FS >= 1.5 AND phreatic_ratio <= 0.3 AND kh <= 0.15
 *
 * @param fs - Factor of Safety (dimensionless). / Fator de Seguranca.
 * @param phreatic_ratio - Phreatic line ratio (0-1). / Razao da linha freatica.
 * @param seismic_kh - Seismic horizontal coefficient (dimensionless). / Coeficiente sismico.
 * @throws {TypeError} If any argument is not a finite number.
 * @throws {RangeError} If fs < 0, phreatic_ratio outside [0,1], or seismic_kh < 0.
 * @reference ANM Portaria 70.389/2017; ICOLD Bulletin 121 (1999); Bishop (1955)
 */
export function classifyDamRisk(
    fs: number,
    phreatic_ratio: number,
    seismic_kh: number,
): { risk_level: 'A' | 'B' | 'C' | 'D'; action: string } {
    validateClassifyInputs(fs, phreatic_ratio, seismic_kh);
    return decideDamRiskLevel(fs, phreatic_ratio, seismic_kh);
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineTailingsStabilityMeta: AnalyticsModuleMeta = {
    name: 'mineTailingsStability',
    description: 'mineTailingsStability',
    category: 'analytics',
    familyTags: ['mining'],
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
