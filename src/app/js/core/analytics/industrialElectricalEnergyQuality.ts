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
 * Industrial Electrical Energy Quality Analytics
 *
 * Implements power quality indices as per:
 *   IEC 61000-4-30:2015 - Testing and measurement techniques: Power quality measurement methods
 *   ABNT NBR 16528:2016 - Disturbios na energia electrica - Definicoes e indicadores
 *   ANEEL REN 956/2021 - Regulamento de qualidade do fornecimento de energia electrica (Brasil)
 *
 * Indicadores calculados: THD, FP, desequilíbrio de tensão, DIC, FIC, DRC, PQI
 *
 * Zero external dependencies. All math is pure JS.
 *
 * @module industrialElectricalEnergyQuality
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

// ---------------------------------------------------------------------------
// Total Harmonic Distortion (THD)
// THD% = (sqrt(sum(Vh^2, h=2..N)) / V1) * 100
// ---------------------------------------------------------------------------

/**
 * Compute Total Harmonic Distortion (THD) for voltage or current.
 * THD(%) = sqrt(sum(Vh^2, h>=2)) / V1 * 100 — IEC 61000-4-30 eq. 20.
 *
 * @param {number} fundamental     - RMS value of fundamental component (V or A)
 * @param {number[]} harmonics     - Array of RMS values for harmonics h=2,3,... (V or A)
 * @returns {number} THD in percent
 * @throws {TypeError} If arguments have wrong types
 * @throws {RangeError} If fundamental is zero or negative, or harmonics contains negative
 */
export function totalHarmonicDistortion(fundamental: number, harmonics: number[]): number {
    if (typeof fundamental !== 'number') {
        throw new TypeError('totalHarmonicDistortion: fundamental must be a number');
    }
    if (!Array.isArray(harmonics)) {
        throw new TypeError('totalHarmonicDistortion: harmonics must be an array');
    }
    if (fundamental <= 0) {
        throw new RangeError('totalHarmonicDistortion: fundamental must be > 0');
    }
    for (const h of harmonics) {
        if (typeof h !== 'number' || h < 0) {
            throw new RangeError('totalHarmonicDistortion: all harmonic values must be >= 0 numbers');
        }
    }

    // Soma dos quadrados dos harmonicos (h >= 2)
    const sumSq = harmonics.reduce((acc, h) => acc + h * h, 0);
    return (Math.sqrt(sumSq) / fundamental) * 100;
}

// ---------------------------------------------------------------------------
// Power Factor (cos phi) - Fator de Potência
// PF = P / S  (potência ativa / aparente)
// ---------------------------------------------------------------------------

/**
 * Compute power factor (cos phi) from active and apparent power.
 * FP = P / S - ABNT NBR 16528:2016 seção 5.2.
 *
 * @param {number} activePower   - Active (real) power P in kW
 * @param {number} apparentPower - Apparent power S in kVA
 * @returns {number} Power factor (0 to 1)
 * @throws {RangeError} If activePower > apparentPower or either is negative
 */
export function powerFactor(activePower: number, apparentPower: number): number {
    if (typeof activePower !== 'number' || typeof apparentPower !== 'number') {
        throw new TypeError('powerFactor: activePower and apparentPower must be numbers');
    }
    if (apparentPower <= 0) {
        throw new RangeError('powerFactor: apparentPower must be > 0');
    }
    if (activePower < 0) {
        throw new RangeError('powerFactor: activePower must be >= 0');
    }
    if (activePower > apparentPower + 1e-9) {
        throw new RangeError('powerFactor: activePower cannot exceed apparentPower');
    }

    return Math.min(1, activePower / apparentPower);
}

// ---------------------------------------------------------------------------
// Voltage Unbalance (Desequilíbrio de Tensão)
// ABNT NBR 16528: VU% = (Vmax_desvio / V_media) * 100
// IEC 61000-4-30: VU = Vnegative / Vpositive * 100 (method of symmetrical components)
// ---------------------------------------------------------------------------

/**
 * Compute voltage unbalance percentage using the ABNT simplified method.
 * Desequilíbrio de tensão pela ABNT: max desvio da média / média * 100.
 *
 * @param {number[]} phaseVoltages - Array of 3 phase voltage RMS values [Va, Vb, Vc] (V)
 * @returns {{unbalance: number, severity: string}} Unbalance percent and severity classification
 * @throws {TypeError} If phaseVoltages is not a 3-element numeric array
 * @throws {RangeError} If any voltage is non-positive
 */
export function voltageUnbalance(phaseVoltages: number[]): { unbalance: number; severity: string } {
    if (!Array.isArray(phaseVoltages) || phaseVoltages.length !== 3) {
        throw new TypeError('voltageUnbalance: phaseVoltages must be an array of 3 numbers');
    }
    for (const v of phaseVoltages) {
        if (typeof v !== 'number' || v <= 0) {
            throw new RangeError('voltageUnbalance: all phase voltages must be positive numbers');
        }
    }

    const avg = phaseVoltages.reduce((a, b) => a + b, 0) / 3;
    const maxDeviation = Math.max(...phaseVoltages.map((v) => Math.abs(v - avg)));
    const unbalance = (maxDeviation / avg) * 100;

    // Classificação conforme ANEEL REN 956/2021: limite padrão 3%, crítico 5%
    let severity: string;
    if (unbalance <= 1) severity = 'negligible';
    else if (unbalance <= 2) severity = 'acceptable';
    else if (unbalance <= 3) severity = 'warning';
    else if (unbalance <= 5) severity = 'critical';
    else severity = 'severe';

    return { unbalance, severity };
}

// ---------------------------------------------------------------------------
// DIC / FIC / DRC - ANEEL REN 956/2021
// Duração / Frequência de Interrupções por Consumidor
// DRC: Duração de Interrupção por Unidade Consumidora (horas/mês)
// ---------------------------------------------------------------------------

/**
 * Compute DIC, FIC, and DRC power quality indicators.
 * Indicadores ANEEL:
 *   DIC (Duração de Interrupção Individual por Consumidor) - horas/período
 *   FIC (Frequência de Interrupção Individual por Consumidor) - interrupcoes/período
 *   DRC (Duração de Interrupção em Conjunto de Consumidores por Componente de Rede)
 *
 * @param {Array<{duration: number}>} interruptions - Array of interruption events with
 *   duration in hours
 * @param {number} [periodHours=720] - Assessment period in hours (default 30 days)
 * @returns {{DIC: number, FIC: number, DRC: number, complianceNote: string}}
 * @throws {TypeError} If interruptions is not an array of objects with numeric duration
 */
export function dicFicDrcIndicators(
    interruptions: Array<{ duration: number }>,
    periodHours: number = 720,
): { DIC: number; FIC: number; DRC: number; complianceNote: string } {
    if (!Array.isArray(interruptions)) {
        throw new TypeError('dicFicDrcIndicators: interruptions must be an array');
    }
    if (typeof periodHours !== 'number' || periodHours <= 0) {
        throw new RangeError('dicFicDrcIndicators: periodHours must be > 0');
    }

    for (const ev of interruptions) {
        if (!ev || typeof ev.duration !== 'number' || ev.duration < 0) {
            throw new TypeError('dicFicDrcIndicators: each interruption must have a numeric duration >= 0');
        }
    }

    // DIC: soma das durações (horas)
    const DIC = interruptions.reduce((acc, ev) => acc + ev.duration, 0);

    // FIC: número de interrupções
    const FIC = interruptions.length;

    // DRC: DIC / horas no período (disponibilidade relativa de interrupção)
    const DRC = (DIC / periodHours) * 100;

    // Referência de conformidade - valores limites ANEEL REN 956/2021 típicos (distribuição urbana MT)
    const complianceNote = DIC <= 12 && FIC <= 12 ? 'within_limits' : 'exceeds_aneel_956_2021';

    return { DIC, FIC, DRC, complianceNote };
}

// ---------------------------------------------------------------------------
// Power Quality Index (PQI) - Índice Composto de Qualidade de Energia
// PQI = w1*(1 - THD/THDmax) + w2*PF + w3*(1 - VU/VUmax) + w4*(1 - DRC/100)
// ---------------------------------------------------------------------------

/**
 * Compute the composite Power Quality Index (PQI) from individual indicators.
 * Índice composto ponderado, normalizado para [0, 1]:
 *   - THD: peso 0.30 (limite IEEE 519: 5% para sistemas >= 1 kV)
 *   - FP:  peso 0.25 (fator de potência)
 *   - VU:  peso 0.25 (limite: 3%)
 *   - DRC: peso 0.20 (porcentagem de interrupção)
 *
 * @param {object} indicators - Input indicators
 * @param {number} indicators.THD  - Total harmonic distortion (%)
 * @param {number} indicators.PF   - Power factor (0 to 1)
 * @param {number} indicators.VU   - Voltage unbalance (%)
 * @param {number} indicators.DRC  - Duration of interruption relative (%)
 * @returns {{PQI: number, classification: string}} Index and classification
 * @throws {TypeError} If indicators is not an object with required numeric fields
 * @throws {RangeError} If any field value is outside expected bounds
 */
export function powerQualityIndex(indicators: {
    THD: number;
    PF: number;
    VU: number;
    DRC: number;
}): { PQI: number; classification: string } {
    if (!indicators || typeof indicators !== 'object') {
        throw new TypeError('powerQualityIndex: indicators must be an object');
    }
    const { THD, PF, VU, DRC } = indicators;

    if ([THD, PF, VU, DRC].some((v) => typeof v !== 'number')) {
        throw new TypeError('powerQualityIndex: THD, PF, VU, DRC must be numbers');
    }
    if (THD < 0) throw new RangeError('powerQualityIndex: THD must be >= 0');
    if (PF < 0 || PF > 1) throw new RangeError('powerQualityIndex: PF must be in [0, 1]');
    if (VU < 0) throw new RangeError('powerQualityIndex: VU must be >= 0');
    if (DRC < 0) throw new RangeError('powerQualityIndex: DRC must be >= 0');

    // Limites de referência para normalização
    const THD_MAX = 5; // % — IEEE 519 limite para sistemas industriais >= 1 kV
    const VU_MAX = 3; // % — ANEEL REN 956 limite padrão
    const DRC_MAX = 100; // %

    // Normalização: quanto maior o indicador, pior (exceto PF)
    const normTHD = Math.max(0, 1 - THD / THD_MAX);
    const normPF = PF;
    const normVU = Math.max(0, 1 - VU / VU_MAX);
    const normDRC = Math.max(0, 1 - DRC / DRC_MAX);

    // Índice ponderado
    const PQI = 0.3 * normTHD + 0.25 * normPF + 0.25 * normVU + 0.2 * normDRC;

    let classification: string;
    if (PQI >= 0.85) classification = 'excellent';
    else if (PQI >= 0.7) classification = 'good';
    else if (PQI >= 0.5) classification = 'acceptable';
    else if (PQI >= 0.3) classification = 'poor';
    else classification = 'critical';

    return { PQI, classification };
}

// ---------------------------------------------------------------------------
// Power Factor Penalty - Penalidade de Fator de Potência (ANEEL)
// Consumidores com FP < 0.92 pagam sobretaxa; FP >= 0.92 recebem bônus (até 1%)
// ---------------------------------------------------------------------------

/**
 * Compute power factor penalty or bonus per ANEEL resolution (simplified model).
 * Penalidade ou bônus sobre a tarifa de energia ativa conforme REN 956/2021.
 *
 * @param {number} measuredPF       - Measured power factor (0 to 1)
 * @param {number} energyBillAmount - Monthly energy bill amount in BRL
 * @returns {{adjustment: number, adjustmentPercent: number, type: string}}
 * @throws {RangeError} If measuredPF or energyBillAmount are out of range
 */
export function powerFactorPenalty(
    measuredPF: number,
    energyBillAmount: number,
): { adjustment: number; adjustmentPercent: number; type: string } {
    if (typeof measuredPF !== 'number' || measuredPF < 0 || measuredPF > 1) {
        throw new RangeError('powerFactorPenalty: measuredPF must be in [0, 1]');
    }
    if (typeof energyBillAmount !== 'number' || energyBillAmount < 0) {
        throw new RangeError('powerFactorPenalty: energyBillAmount must be >= 0');
    }

    const REFERENCE_PF = 0.92;

    if (measuredPF < REFERENCE_PF) {
        // Penalidade: proporcional ao desvio abaixo de 0.92
        // Fórmula simplificada ANEEL: (FP_ref / FP_med - 1) * 3% por 0.01 de desvio
        const deficiency = REFERENCE_PF - measuredPF;
        const adjustmentPercent = Math.min((deficiency / 0.01) * 3, 30); // cap 30%
        const adjustment = -energyBillAmount * (adjustmentPercent / 100);
        return { adjustment, adjustmentPercent: -adjustmentPercent, type: 'penalty' };
    } else if (measuredPF > 0.99) {
        // Bônus de 1% para FP muito alto (geração de reativo)
        const adjustmentPercent = 1;
        const adjustment = energyBillAmount * 0.01;
        return { adjustment, adjustmentPercent, type: 'bonus' };
    }

    return { adjustment: 0, adjustmentPercent: 0, type: 'neutral' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialElectricalEnergyQualityMeta: AnalyticsModuleMeta = {
    name: 'industrialElectricalEnergyQuality',
    description: 'industrialElectricalEnergyQuality',
    category: 'analytics',
    familyTags: ['industrial', 'energy'],
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
