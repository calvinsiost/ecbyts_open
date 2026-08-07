// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
'use strict';

/**
 * Industrial Safety Management Score Module
 *
 * Implements occupational safety performance metrics following:
 *   - ISO 45001:2018 - Occupational health and safety management systems
 *   - OHSAS 18001:2007 - Occupational health and safety management
 *   - BSI PD 7974-7:2019 - Human factors for fire safety engineering
 *   - Heinrich, H.W. (1941). Industrial Accident Prevention, 4th ed. McGraw-Hill.
 *     (Triangle ratio: 1 fatal : 29 serious : 300 minor)
 *   - ILO (2013). Safety and Health at Work: A Vision for Sustainable Prevention.
 *   - NR-4/NR-5 (Brazil): SESMT + CIPA accident rate norms
 *
 * Metrics:
 *   - TF (Taxa de Frequência / TRIR): accident frequency rate per 1 000 000 h worked
 *   - TG (Taxa de Gravidade / LTIR):  severity rate - lost workdays per 1 000 000 h
 *   - IGA (Índice de Gravidade Médio): mean severity index = TG / TF
 *   - SMS Maturity Score (1–5): based on leading + lagging indicators composite
 *   - Predictive Safety Index (PSI): ratio of leading to lagging score
 *
 * Reference: OSHA 300 log metrics; ABNT NBR ISO 45001; ACSNI (1993) Organising for Safety.
 *
 * Zero DOM / IDB / Three.js / fetch dependencies - pure math module.
 *
 * @module industrialSafetyManagementScore
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

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Standard exposure base for frequency and severity rates.
 * Base de exposição padrão: 1 000 000 horas-homem trabalhadas.
 * @readonly
 */
const EXPOSURE_BASE = 1_000_000;

/**
 * SMS Maturity level descriptors (ISO 45001 Annex A; Hudson 2007 Hearts & Minds model)
 * Níveis de maturidade do sistema de gestão de saúde e segurança.
 * @readonly
 */
const MATURITY_LEVELS = [
    { level: 5, label: 'generative', description: 'HSE is how we do business — proactive culture, resilient' },
    { level: 4, label: 'proactive', description: 'Working on problems before they cause incidents' },
    { level: 3, label: 'calculative', description: 'Managed by systems and procedures' },
    { level: 2, label: 'reactive', description: 'Safety managed after accidents' },
    { level: 1, label: 'pathological', description: 'Who cares as long as we are not caught' },
];

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Calculate accident frequency rate (TF / TRIR).
 * Calcula a taxa de frequência de acidentes (TF) por 1 000 000 HHT.
 *
 * Formula (NR-4; OSHA TRIR):
 *   TF = (number_of_accidents × 1 000 000) / hours_worked
 *
 * Recordable accidents = accidents with lost time + restricted work + medical treatment
 *
 * @param accidents   - number of recordable accidents in the period
 * @param hoursWorked - total man-hours worked in the period
 */
export function calcFrequencyRate(
    accidents: number,
    hoursWorked: number,
): { tf: number; exposureBase: number; unit: string } {
    if (typeof accidents !== 'number' || !isFinite(accidents) || accidents < 0) {
        throw new RangeError('accidents must be a non-negative finite number');
    }
    if (typeof hoursWorked !== 'number' || !isFinite(hoursWorked) || hoursWorked <= 0) {
        throw new RangeError('hoursWorked must be a positive finite number');
    }

    // Taxa de frequência: acidentes por milhão de horas trabalhadas
    const tf = (accidents * EXPOSURE_BASE) / hoursWorked;

    return { tf: +tf.toFixed(4), exposureBase: EXPOSURE_BASE, unit: 'accidents/1 000 000 h' };
}

/**
 * Calculate accident severity rate (TG / LTIR).
 * Calcula a taxa de gravidade de acidentes (TG) por 1 000 000 HHT.
 *
 * Formula (NR-4; OSHA LTIR):
 *   TG = (lost_workdays × 1 000 000) / hours_worked
 *
 * @param lostWorkdays - total days away from work in the period
 * @param hoursWorked  - total man-hours worked in the period
 */
export function calcSeverityRate(
    lostWorkdays: number,
    hoursWorked: number,
): { tg: number; exposureBase: number; unit: string } {
    if (typeof lostWorkdays !== 'number' || !isFinite(lostWorkdays) || lostWorkdays < 0) {
        throw new RangeError('lostWorkdays must be a non-negative finite number');
    }
    if (typeof hoursWorked !== 'number' || !isFinite(hoursWorked) || hoursWorked <= 0) {
        throw new RangeError('hoursWorked must be a positive finite number');
    }

    // Taxa de gravidade: dias perdidos por milhão de horas trabalhadas
    const tg = (lostWorkdays * EXPOSURE_BASE) / hoursWorked;

    return { tg: +tg.toFixed(4), exposureBase: EXPOSURE_BASE, unit: 'days/1 000 000 h' };
}

/**
 * Calculate mean severity index (IGA - Índice de Gravidade Médio).
 * Calcula o índice de gravidade médio: dias perdidos por acidente com afastamento.
 *
 * Formula: IGA = TG / TF  (ratio of severity to frequency rates)
 * Interpretation: average days lost per recordable accident.
 *
 * @param tf - frequency rate (accidents/1 000 000 h)
 * @param tg - severity rate (days/1 000 000 h)
 */
export function calcMeanSeverityIndex(tf: number, tg: number): { iga: number; unit: string } {
    if (typeof tf !== 'number' || !isFinite(tf) || tf < 0) {
        throw new RangeError('tf must be a non-negative finite number');
    }
    if (typeof tg !== 'number' || !isFinite(tg) || tg < 0) {
        throw new RangeError('tg must be a non-negative finite number');
    }
    if (tf === 0) {
        // Sem acidentes no período: IGA indefinido (retorna 0 por convenção)
        return { iga: 0, unit: 'days/accident' };
    }

    const iga = tg / tf;
    return { iga: +iga.toFixed(4), unit: 'days/accident' };
}

/**
 * Calculate SMS Maturity Score (1–5) and Predictive Safety Index.
 * Calcula o Score de Maturidade do SMS e o Índice Preditivo de Segurança.
 *
 * Composite model (Hudson 2007; ISO 45001 §10):
 *   laggingScore  = normalised score from reactive indicators (accidents, near-misses)
 *   leadingScore  = normalised score from proactive indicators (audits, training, inspections)
 *   maturityScore = weighted combination: 40% lagging + 60% leading  [ISO 45001 §A.10]
 *   PSI (Predictive Safety Index) = leadingScore / laggingScore  (> 1 = proactive orientation)
 *
 * @param rates              - object whose values are rate fractions in [0,1]
 *                            (auditComplianceRate, trainingCompletionRate,
 *                             inspectionRate, nearMissReportingRate)
 * @param number> - consecutive months without LTA [0, ∞)
 * @param accidentFreeMonths   - target for full lagging score (e.g. 24 months)
 */
function _validateSMSMaturityInputs(
    rates: Record<string, number>,
    accidentFreeMonths: number,
    targetFreeMonths: number,
): void {
    for (const [k, v] of Object.entries(rates)) {
        if (typeof v !== 'number' || !isFinite(v)) throw new TypeError(`${k} must be a finite number`);
        if (v < 0 || v > 1) throw new RangeError(`${k} must be between 0 and 1`);
    }
    if (typeof accidentFreeMonths !== 'number' || !isFinite(accidentFreeMonths) || accidentFreeMonths < 0) {
        throw new RangeError('accidentFreeMonths must be a non-negative finite number');
    }
    if (typeof targetFreeMonths !== 'number' || !isFinite(targetFreeMonths) || targetFreeMonths <= 0) {
        throw new RangeError('targetFreeMonths must be a positive finite number');
    }
}

export function calcSMSMaturityScore({
    auditComplianceRate,
    trainingCompletionRate,
    inspectionRate,
    nearMissReportingRate,
    accidentFreeMonths,
    targetFreeMonths = 24,
}: {
    auditComplianceRate: number;
    trainingCompletionRate: number;
    inspectionRate: number;
    nearMissReportingRate: number;
    accidentFreeMonths: number;
    targetFreeMonths?: number;
}): {
    maturityScore: number;
    maturityLevel: { level: number; label: string; description: string };
    leadingScore: number;
    laggingScore: number;
    psi: number | null;
} {
    const rates = { auditComplianceRate, trainingCompletionRate, inspectionRate, nearMissReportingRate };
    _validateSMSMaturityInputs(rates, accidentFreeMonths, targetFreeMonths);

    // Score proativo (leading): média das taxas de conformidade e relato
    const leadingScore = (auditComplianceRate + trainingCompletionRate + inspectionRate + nearMissReportingRate) / 4;

    // Score reativo (lagging): fração de meses sem acidente com afastamento (LTA)
    const laggingScore = Math.min(accidentFreeMonths / targetFreeMonths, 1);

    // Score composto de maturidade ponderado (40% lagging + 60% leading) mapeado para escala 1–5
    const rawScore = 0.4 * laggingScore + 0.6 * leadingScore;
    const maturityScore = 1 + rawScore * 4; // mapeia [0,1] → [1,5]

    const level = MATURITY_LEVELS.find((m) => maturityScore >= m.level - 0.5) || MATURITY_LEVELS[4]!;

    // Índice preditivo de segurança: razão entre postura proativa e reativa
    const psi = laggingScore > 0 ? leadingScore / laggingScore : leadingScore > 0 ? Infinity : 1;

    return {
        maturityScore: +maturityScore.toFixed(4),
        maturityLevel: { level: level.level, label: level.label, description: level.description },
        leadingScore: +leadingScore.toFixed(4),
        laggingScore: +laggingScore.toFixed(4),
        psi: isFinite(psi) ? +psi.toFixed(4) : null,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialSafetyManagementScoreMeta: AnalyticsModuleMeta = {
    name: 'industrialSafetyManagementScore',
    description: 'industrialSafetyManagementScore',
    category: 'analytics',
    familyTags: ['industrial', 'risk'],
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
