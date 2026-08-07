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
 * Industrial Vibration Exposure Assessment
 * Avaliação de Exposição à Vibração Industrial
 *
 * References / Referências:
 * - ISO 2631-1:1997 - Mechanical vibration and shock: Evaluation of human exposure to
 *   whole-body vibration. Part 1: General requirements.
 * - ISO 5349-1:2001 - Mechanical vibration: Measurement and evaluation of human exposure
 *   to hand-transmitted vibration. Part 1: General requirements.
 * - EU Directive 2002/44/EC - Physical Agents (Vibration) Directive.
 * - NR-9 (2021 rev.) - Programa de Gerenciamento de Riscos (PGR), SSST/MTE.
 * - Griffin, M.J. (1990). Handbook of Human Vibration. Academic Press. ISBN: 978-0123039101
 * - Maeda, S. & Griffin, M.J. (1994). A comparison of vibration-induced white finger
 *   among chain sawyers in Japan and in the United Kingdom. International Archives of
 *   Occupational and Environmental Health, 65: 337–340. DOI: 10.1007/BF00381312
 *
 * Zero DOM/IDB/Three.js/fetch dependencies.
 * Sem dependências de DOM, IDB, Three.js ou fetch.
 */

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

// EU Directive 2002/44/EC and NR-9 thresholds
// Limites da Diretiva 2002/44/CE e NR-9

/** Hand-arm vibration (HAV) thresholds — ISO 5349-1:2001 */
const HAV_EAV = 2.5; // Exposure Action Value  (m/s²)  — ação preventiva / preventive action
const HAV_ELV = 5.0; // Exposure Limit Value   (m/s²)  — limite máximo / maximum limit

/** Whole-body vibration (WBV) thresholds — ISO 2631-1:1997 */
const WBV_EAV = 0.5; // Exposure Action Value  (m/s²)
const WBV_ELV = 1.15; // Exposure Limit Value   (m/s²)

/** Reference duration for daily exposure normalization (seconds) */
const T0_SECONDS = 8 * 3600; // 8 hours / 8 horas

/**
 * Validate positive finite number.
 * Valida número positivo finito.
 * @param v
 * @param name
 * @param min
 */
function _requireFinite(v: number, name: string, min = 0): void {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, got: ${v}`);
    }
    if (v < min) {
        throw new RangeError(`${name} must be >= ${min}, got: ${v}`);
    }
}

/**
 * Frequency-weighted RMS acceleration for hand-arm vibration (ISO 5349-1:2001).
 * Aceleração RMS ponderada em frequência para vibração mãos-braços (ISO 5349-1:2001).
 *
 * ahw = sqrt(Σ(Wi² * ai²))  where Wi is the frequency weighting factor.
 * ahw = sqrt(Σ(Wi² * ai²))  onde Wi é o fator de ponderação por frequência.
 *
 * For simplified input (single-axis RMS), returns the value directly.
 * Para entrada simplificada (RMS eixo único), retorna o valor diretamente.
 *
 * @param rmsValues_ms2       - Per-axis RMS acceleration values (m/s²), length 1 or 3
 * @param weights             - ISO 5349-1 weighting factors per axis, length same as rmsValues
 *                              Default: [1, 1, 1] (unweighted - user must supply real Wh values)
 * @returns Frequency-weighted RMS acceleration ahw (m/s²)
 */
export function handArmWeightedRMS(rmsValues_ms2: number[], weights?: number[]): number {
    if (!Array.isArray(rmsValues_ms2) || rmsValues_ms2.length < 1 || rmsValues_ms2.length > 3) {
        throw new TypeError('rmsValues_ms2 must be an array of 1 to 3 values');
    }
    rmsValues_ms2.forEach((v, i) => _requireFinite(v, `rmsValues_ms2[${i}]`, 0));

    const w = weights ?? rmsValues_ms2.map(() => 1);
    if (w.length !== rmsValues_ms2.length) {
        throw new RangeError('weights length must match rmsValues_ms2 length');
    }
    w.forEach((wi, i) => _requireFinite(wi, `weights[${i}]`, 0));

    const sumSq = rmsValues_ms2.reduce((s, ai, i) => s + (w[i]! * ai) ** 2, 0);
    return Math.sqrt(sumSq);
}

/**
 * Frequency-weighted RMS acceleration for whole-body vibration (ISO 2631-1:1997).
 * Aceleração RMS ponderada em frequência para vibração de corpo inteiro (ISO 2631-1:1997).
 *
 * aw = sqrt((k_x*awx)² + (k_y*awy)² + (k_z*awz)²)
 * Multiplying factors: k_x = k_y = 1.4, k_z = 1.0 (ISO 2631-1 Table 1 for seat position)
 * Fatores multiplicadores: k_x = k_y = 1.4, k_z = 1.0 (posição sentado)
 *
 * @param awx_ms2 - Frequency-weighted RMS in x-direction (m/s²)
 * @param awy_ms2 - Frequency-weighted RMS in y-direction (m/s²)
 * @param awz_ms2 - Frequency-weighted RMS in z-direction (m/s²)
 * @param posture - Body posture
 * @returns Combined weighted RMS aw (m/s²)
 */
export function wholeBodyWeightedRMS(
    awx_ms2: number,
    awy_ms2: number,
    awz_ms2: number,
    posture: 'seat' | 'standing' | 'recumbent' = 'seat',
): number {
    _requireFinite(awx_ms2, 'awx_ms2', 0);
    _requireFinite(awy_ms2, 'awy_ms2', 0);
    _requireFinite(awz_ms2, 'awz_ms2', 0);

    const validPostures = ['seat', 'standing', 'recumbent'];
    if (!validPostures.includes(posture)) {
        throw new TypeError(`posture must be one of: ${validPostures.join(', ')}`);
    }

    // ISO 2631-1 Table 1 - multiplying factors by posture
    // Fatores multiplicadores por postura (ISO 2631-1 Tabela 1)
    const kFactors = posture === 'recumbent' ? { kx: 1.0, ky: 1.0, kz: 1.0 } : { kx: 1.4, ky: 1.4, kz: 1.0 };

    return Math.sqrt((kFactors.kx * awx_ms2) ** 2 + (kFactors.ky * awy_ms2) ** 2 + (kFactors.kz * awz_ms2) ** 2);
}

/**
 * Vibration Dose Value (VDV) - ISO 2631-1:1997, section 7.
 * Valor de Dose de Vibração (VDV) - ISO 2631-1:1997, seção 7.
 *
 * VDV = [∫₀ᵀ a_w⁴(t) dt]^(1/4)
 *
 * Simplified for constant RMS over exposure duration:
 * Simplificado para RMS constante durante a duração de exposição:
 * VDV ≈ aw * T^(1/4)   (ISO 2631-1 eq. C.3)
 *
 * Units: m/s^1.75
 *
 * @param aw_ms2         - Frequency-weighted RMS acceleration (m/s²)
 * @param duration_hours - Total exposure duration (hours, > 0)
 * @returns VDV (m/s^1.75)
 */
export function vibrationDoseValue(aw_ms2: number, duration_hours: number): number {
    _requireFinite(aw_ms2, 'aw_ms2', 0);
    _requireFinite(duration_hours, 'duration_hours', 1e-6);
    const T_seconds = duration_hours * 3600;
    return aw_ms2 * Math.pow(T_seconds, 0.25);
}

/**
 * Daily equivalent acceleration A(8) - ISO 5349-1 and ISO 2631-1.
 * Aceleração equivalente diária A(8) - ISO 5349-1 e ISO 2631-1.
 *
 * A(8) = aw * sqrt(T / T0)   where T0 = 8 h = 28800 s
 * A(8) = aw * sqrt(T / T0)   onde T0 = 8 h = 28800 s
 *
 * @param aw_ms2         - Frequency-weighted RMS acceleration (m/s²)
 * @param duration_hours - Actual exposure duration in one workday (hours)
 * @returns A(8) daily equivalent acceleration (m/s²)
 */
export function dailyEquivalentAcceleration(aw_ms2: number, duration_hours: number): number {
    _requireFinite(aw_ms2, 'aw_ms2', 0);
    _requireFinite(duration_hours, 'duration_hours', 1e-6);
    const T_seconds = duration_hours * 3600;
    return aw_ms2 * Math.sqrt(T_seconds / T0_SECONDS);
}

/**
 * Classify vibration health risk by type (HAV or WBV) and A(8).
 * Classifica o risco à saúde pela vibração por tipo (mãos-braços ou corpo inteiro) e A(8).
 *
 * Three levels: acceptable / action_value / limit_value
 *   acceptable   - A(8) < EAV
 *   action_value - EAV <= A(8) < ELV  → preventive measures required
 *   limit_value  - A(8) >= ELV         → immediate action; legal limit exceeded
 *
 * @param a8_ms2              - Daily equivalent acceleration A(8) (m/s²)
 * @param vibrationType - 'hav' = hand-arm, 'wbv' = whole-body
 */
export function classifyVibrationRisk(
    a8_ms2: number,
    vibrationType: 'hav' | 'wbv',
): { risk: string; riskPT: string; eav: number; elv: number; a8: number } {
    _requireFinite(a8_ms2, 'a8_ms2', 0);
    if (vibrationType !== 'hav' && vibrationType !== 'wbv') {
        throw new TypeError("vibrationType must be 'hav' or 'wbv'");
    }

    const eav = vibrationType === 'hav' ? HAV_EAV : WBV_EAV;
    const elv = vibrationType === 'hav' ? HAV_ELV : WBV_ELV;

    let risk, riskPT;
    if (a8_ms2 < eav) {
        risk = 'acceptable';
        riskPT = 'aceitável';
    } else if (a8_ms2 < elv) {
        risk = 'action_value';
        riskPT = 'valor de ação';
    } else {
        risk = 'limit_value';
        riskPT = 'valor limite';
    }

    return { risk, riskPT, eav, elv, a8: a8_ms2 };
}

/**
 * Full vibration exposure assessment for a worker shift.
 * Avaliação completa de exposição à vibração para um turno de trabalho.
 *
 * @param params
 */
export function assessVibrationExposure({
    aw_ms2,
    duration_hours,
    type,
}: {
    aw_ms2: number;
    duration_hours: number;
    type: 'hav' | 'wbv';
}): { a8: number; vdv: number; risk: object } {
    const a8 = dailyEquivalentAcceleration(aw_ms2, duration_hours);
    const vdv = vibrationDoseValue(aw_ms2, duration_hours);
    const risk = classifyVibrationRisk(a8, type);
    return { a8, vdv, risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialVibrationExposureMeta: AnalyticsModuleMeta = {
    name: 'industrialVibrationExposure',
    description: 'industrialVibrationExposure',
    category: 'analytics',
    familyTags: ['industrial'],
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
