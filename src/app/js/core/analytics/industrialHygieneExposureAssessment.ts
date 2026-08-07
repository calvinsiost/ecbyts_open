// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Industrial Hygiene Exposure Assessment
 *
 * Avaliação de exposição em higiene industrial conforme:
 * - ACGIH TLV-TWA 2024 (Threshold Limit Values - Time-Weighted Average)
 * - NIOSH REL (Recommended Exposure Limits)
 * - NR-15 Brasil (Norma Regulamentadora 15 - Atividades e Operações Insalubres)
 *
 * References:
 * - ACGIH (2024). TLVs and BEIs. Cincinnati, OH: ACGIH.
 * - OSHA 29 CFR 1910.1000 Table Z-1 (PEL)
 * - NIOSH Pocket Guide to Chemical Hazards, 2007 Edition
 * - NR-15 Anexo I (MTE, Brazil, updated 2022)
 * - Equation 1/Σ(Ci/TLVi): ACGIH Documentation of TLVs, Appendix C (Mixtures)
 *
 * Zero dependências DOM/IDB/Three.js/fetch
 * @module industrialHygieneExposureAssessment
 */

// Local interface (substitui import('../../../../types/app/analytics-library.js'))
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
        citation?: string;
    };
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    library?: { published: boolean; priceECBT?: number; licenseRef?: string };
}

interface ExposureSample {
    concentration: number;
    duration: number;
}

// ─── Risk classification thresholds ─────────────────────────────────────────
// Classificação baseada na fração ED/OEL (exposure dose / occupational exposure limit)
const RISK_THRESHOLDS = {
    ACCEPTABLE: 0.5, // < 50 % do OEL — aceitável
    ACTION_LEVEL: 1.0, // 50–100 % do OEL — nível de ação (monitorar)
    EXCEEDED: 2.0, // 100–200 % — excedido
    // > 200 % → imediatamente perigoso (IDLH zone)
};

/**
 * Classifica o risco com base na fração de dose.
 * Classify risk based on exposure dose fraction.
 *
 * @param fraction - ED / OEL (adimensional)
 */
export function classifyRisk(
    fraction: number,
): 'acceptable' | 'action_level' | 'exceeded' | 'immediately_dangerous' {
    if (typeof fraction !== 'number' || !isFinite(fraction)) {
        throw new TypeError('fraction must be a finite number');
    }
    if (fraction < 0) throw new RangeError('fraction must be >= 0');
    if (fraction < RISK_THRESHOLDS.ACCEPTABLE) return 'acceptable';
    if (fraction < RISK_THRESHOLDS.ACTION_LEVEL) return 'action_level';
    if (fraction < RISK_THRESHOLDS.EXCEEDED) return 'exceeded';
    return 'immediately_dangerous';
}

/**
 * Calcula a TWA (Time-Weighted Average) de exposição para uma jornada de trabalho.
 * Calculates time-weighted average exposure over a work shift.
 *
 * TWA = Σ(Ci × Ti) / T_total
 *
 * @param samples Cada amostra com concentração (ppm ou mg/m³) e duração (horas)
 * @param shiftHours - Duração total da jornada em horas
 */
export function calculateTWA(
    samples: ExposureSample[],
    shiftHours = 8,
): { twa: number; totalExposure: number; shiftHours: number } {
    if (!Array.isArray(samples) || samples.length === 0) {
        throw new TypeError('samples must be a non-empty array');
    }
    if (typeof shiftHours !== 'number' || shiftHours <= 0) {
        throw new RangeError('shiftHours must be a positive number');
    }
    let totalExposure = 0;
    for (const s of samples) {
        if (typeof s.concentration !== 'number' || s.concentration < 0) {
            throw new RangeError('concentration must be >= 0');
        }
        if (typeof s.duration !== 'number' || s.duration <= 0) {
            throw new RangeError('duration must be > 0');
        }
        totalExposure += s.concentration * s.duration;
    }
    const twa = totalExposure / shiftHours;
    return { twa, totalExposure, shiftHours };
}

/**
 * Calcula o STEL (Short-Term Exposure Limit) - média de 15 minutos.
 * Calculates short-term exposure limit as a 15-minute average.
 *
 * @param samples Amostras de curto prazo (duração total deve ser ≤ 15 min = 0.25 h)
 */
export function calculateSTEL(samples: ExposureSample[]): { stel: number; windowMinutes: number } {
    if (!Array.isArray(samples) || samples.length === 0) {
        throw new TypeError('samples must be a non-empty array');
    }
    const STEL_WINDOW_HOURS = 0.25; // 15 minutos
    let totalExposure = 0;
    let totalDuration = 0;
    for (const s of samples) {
        if (typeof s.concentration !== 'number' || s.concentration < 0) {
            throw new RangeError('concentration must be >= 0');
        }
        if (typeof s.duration !== 'number' || s.duration <= 0) {
            throw new RangeError('duration must be > 0');
        }
        totalExposure += s.concentration * s.duration;
        totalDuration += s.duration;
    }
    if (totalDuration > STEL_WINDOW_HOURS + 1e-9) {
        throw new RangeError('Total sample duration exceeds STEL 15-minute window');
    }
    const stel = totalExposure / STEL_WINDOW_HOURS;
    return { stel, windowMinutes: 15 };
}

/**
 * Calcula a fração de dose de exposição ED/OEL.
 * Calculates exposure dose fraction relative to occupational exposure limit.
 *
 * @param twa - Concentração TWA medida (ppm ou mg/m³)
 * @param oel - Occupational Exposure Limit (TLV-TWA, REL ou NR-15)
 */
export function calculateExposureDoseFraction(
    twa: number,
    oel: number,
): { fraction: number; risk: string; percentOEL: number } {
    if (typeof twa !== 'number' || twa < 0) throw new RangeError('twa must be >= 0');
    if (typeof oel !== 'number' || oel <= 0) throw new RangeError('oel must be > 0');
    const fraction = twa / oel;
    const risk = classifyRisk(fraction);
    return { fraction, risk, percentOEL: fraction * 100 };
}

/**
 * Avalia o limite de mistura de vapores conforme ACGIH Appendix C.
 * Evaluates mixture exposure limit for vapor blends (additive effects assumed).
 *
 * Fórmula: EM = 1 / Σ(fi / OELi)
 * onde fi = fração molar/volumétrica do componente i, OELi = TLV-TWA do componente i.
 *
 * @param components Componentes da mistura com fração molar e respectivo OEL
 */
export function calculateMixtureLimit(
    components: Array<{ fraction: number; oel: number; name?: string }>,
): { mixtureOEL: number; hazardIndex: number; risk: string } {
    if (!Array.isArray(components) || components.length < 2) {
        throw new TypeError('components must be an array with at least 2 elements');
    }
    let sumFractions = 0;
    let sumHazard = 0;
    for (const c of components) {
        if (typeof c.fraction !== 'number' || c.fraction <= 0) {
            throw new RangeError('component fraction must be > 0');
        }
        if (typeof c.oel !== 'number' || c.oel <= 0) {
            throw new RangeError('component oel must be > 0');
        }
        sumFractions += c.fraction;
        sumHazard += c.fraction / c.oel;
    }
    if (Math.abs(sumFractions - 1.0) > 0.01) {
        throw new RangeError('component fractions must sum to 1.0 (±0.01)');
    }
    const mixtureOEL = sumFractions / sumHazard;
    const hazardIndex = sumHazard;
    const risk = hazardIndex > 1 ? 'exceeded' : hazardIndex > 0.5 ? 'action_level' : 'acceptable';
    return { mixtureOEL, hazardIndex, risk };
}

/**
 * Avaliação completa de exposição para um trabalhador durante uma jornada.
 * Full exposure assessment for a worker over a work shift.
 *
 * @param samples
 * @param oel - OEL de referência (TLV-TWA, REL ou NR-15 limite)
 * @param shiftHours - Duração da jornada
 */
export function assessExposure(
    samples: ExposureSample[],
    oel: number,
    shiftHours = 8,
): { twa: number; fraction: number; percentOEL: number; risk: string; compliant: boolean } {
    const { twa } = calculateTWA(samples, shiftHours);
    const { fraction, risk, percentOEL } = calculateExposureDoseFraction(twa, oel);
    return {
        twa,
        fraction,
        percentOEL,
        risk,
        compliant: fraction < RISK_THRESHOLDS.ACTION_LEVEL,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialHygieneExposureAssessmentMeta: AnalyticsModuleMeta = {
    name: 'industrialHygieneExposureAssessment',
    description: 'industrialHygieneExposureAssessment',
    category: 'analytics',
    familyTags: ['industrial', 'occupational'],
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
