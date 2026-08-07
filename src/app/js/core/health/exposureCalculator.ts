// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 Phase 2b — Calculadora de Exposição Ocupacional
   Referências:
     - ACGIH TLV/BEI 2024 — Time-Weighted Average, STEL, Hazard Index
     - ACGIH Documentation of the TLVs and BEIs 2024, Appendix C (mixture)
     - Brief & Scala (1975) — TWA correction para turnos longos (ar; BEI sem ajuste)
     - NIOSH Manual of Analytical Methods — TWA cálculo

   Lógica pura — sem DOM, sem rede, sem Three.js.
   Todos os retornos são Object.freeze().
   ================================================================ */


import { HEALTH_STATUS } from './schema.js';

// ----------------------------------------------------------------
// Constantes de referência
// ----------------------------------------------------------------

/** Duração padrão do turno em horas (ACGIH TLV base de cálculo) */
const DEFAULT_SHIFT_HOURS = 8;

/** Janela padrão STEL em minutos (ACGIH: 15 min) */
const DEFAULT_STEL_WINDOW_MINUTES = 15;

// ----------------------------------------------------------------
// Limites do Hazard Index para classificação de status
// ACGIH: HI ≥ 1 = excede limite; usamos HI ≥ 0.5 como alerta amarelo (50% BEI)
// ----------------------------------------------------------------
const HI_THRESHOLD_YELLOW = 0.5; // ≥ 50 % do BEI: atenção
const HI_THRESHOLD_RED = 1.0; // ≥ 100 % do BEI: excedido
const HI_THRESHOLD_CRITICAL = 2.0; // ≥ 200 % do BEI: crítico

// ----------------------------------------------------------------
// Biomarkers com interferência conhecida pelo tabagismo (ACGIH BEI 2024)
// ----------------------------------------------------------------
const SMOKING_FACTORS = Object.freeze({
    // Fenol urinário: tabaco eleva baseline ~2–3×; ACGIH usa ponto médio 2.5
    phenol_urine: 2.5,
    // Benzeno no sangue e ar exalado: tabaco contribui ~2× (ACGIH 2024 p.50)
    benzene_blood: 2.0,
    benzene_exhaled: 2.0,
});

// ----------------------------------------------------------------
// TWA - Time-Weighted Average (8 horas)
// ----------------------------------------------------------------

/**
 * Compute 8-hour time-weighted average from a set of readings for one biomarker type.
 * TWA = Σ(Cᵢ × tᵢ) / totalShiftHours
 * Se readings não possuírem durationHours, assume peso igual (tᵢ = shiftHours / n).
 *
 * @throws {RangeError} se o array de readings estiver vazio
 */
export function computeTWA(
    readings: Array<{ value: number; unit: string; durationHours?: number }>,
    opts: { shiftHours?: number } = {},
): Readonly<{ twa: number; unit: string; n: number; shiftHours: number }> {
    if (!Array.isArray(readings) || readings.length === 0) {
        throw new RangeError('computeTWA: readings array must have at least one element');
    }

    const shiftHours =
        opts.shiftHours != null && Number(opts.shiftHours) > 0 ? Number(opts.shiftHours) : DEFAULT_SHIFT_HOURS;

    // Detecta se todas as leituras possuem durationHours explícito
    const hasExplicitDuration = readings.every((r) => r.durationHours != null && Number(r.durationHours) > 0);

    let twa;
    if (hasExplicitDuration) {
        // Weighted sum: Σ(Cᵢ × tᵢ) / T_shift
        const weightedSum = readings.reduce((acc, r) => acc + Number(r.value) * Number(r.durationHours), 0);
        twa = weightedSum / shiftHours;
    } else {
        // Equal time weighting: simple arithmetic mean
        const sum = readings.reduce((acc, r) => acc + Number(r.value), 0);
        twa = sum / readings.length;
    }

    const unit = readings[0]!.unit || '';

    return Object.freeze({
        twa: Number(twa.toFixed(6)),
        unit: String(unit),
        n: readings.length,
        shiftHours,
    });
}

// ----------------------------------------------------------------
// STEL - Short-Term Exposure Limit value (janela de 15 min)
// ----------------------------------------------------------------

/**
 * Compute STEL from readings within a 15-minute window (or windowMinutes override).
 * STEL = média simples das leituras na janela (definição regulatória ACGIH).
 *
 * @throws {RangeError} se readings estiver vazio
 */
export function computeSTEL(
    readings: Array<{ value: number; unit: string }>,
    opts: { windowMinutes?: number } = {},
): Readonly<{ stel: number; unit: string; n: number; windowMinutes: number }> {
    if (!Array.isArray(readings) || readings.length === 0) {
        throw new RangeError('computeSTEL: readings array must have at least one element');
    }

    const windowMinutes =
        opts.windowMinutes != null && Number(opts.windowMinutes) > 0
            ? Number(opts.windowMinutes)
            : DEFAULT_STEL_WINDOW_MINUTES;

    const sum = readings.reduce((acc, r) => acc + Number(r.value), 0);
    const stel = sum / readings.length;
    const unit = readings[0]!.unit || '';

    return Object.freeze({
        stel: Number(stel.toFixed(6)),
        unit: String(unit),
        n: readings.length,
        windowMinutes,
    });
}

// ----------------------------------------------------------------
// Hazard Index - TWA / BEI
// ----------------------------------------------------------------

/**
 * Hazard Index = TWA / BEI (ou OEL).
 * HI < 0.5   = 'green'    (< 50% do limite)
 * HI ≥ 0.5   = 'yellow'   (alerta preventivo - 50–100% do BEI)
 * HI ≥ 1.0   = 'red'      (excede BEI)
 * HI ≥ 2.0   = 'critical' (> 200% do BEI - ação imediata)
 *
 * @throws {RangeError} se bei <= 0
 */
export function computeHI(twa: number, bei: number): Readonly<{ hi: number; status: string }> {
    if (typeof bei !== 'number' || bei <= 0) {
        throw new RangeError('computeHI: bei must be a positive number');
    }

    const hi = Number(twa) / bei;

    let status;
    if (hi >= HI_THRESHOLD_CRITICAL) {
        status = HEALTH_STATUS.critical;
    } else if (hi >= HI_THRESHOLD_RED) {
        status = HEALTH_STATUS.red;
    } else if (hi >= HI_THRESHOLD_YELLOW) {
        status = HEALTH_STATUS.yellow;
    } else {
        status = HEALTH_STATUS.green;
    }

    return Object.freeze({
        hi: Number(hi.toFixed(6)),
        status,
    });
}

// ----------------------------------------------------------------
// Aggregate HI - modelo aditivo (ACGIH Appendix C)
// ----------------------------------------------------------------

/**
 * Aggregate hazard indices across multiple biomarkers targeting the same organ.
 * Additive model: HI_total = Σ(TWAᵢ / BEIᵢ)  (ACGIH Appendix C mixture formula)
 */
export function computeHIAggregated(
    exposures: Array<{ biomarkerType: string; twa: number; bei: number }>,
): Readonly<{ hiTotal: number; status: string; breakdown: object }> {
    if (!Array.isArray(exposures) || exposures.length === 0) {
        return Object.freeze({
            hiTotal: 0,
            status: HEALTH_STATUS.green,
            breakdown: Object.freeze({}),
        });
    }

    const breakdown: Record<string, any> = {};
    let hiTotal = 0;

    for (const exp of exposures) {
        const individual = computeHI(exp.twa, exp.bei);
        hiTotal += individual.hi;
        breakdown[exp.biomarkerType] = {
            twa: exp.twa,
            bei: exp.bei,
            hi: individual.hi,
            status: individual.status,
        };
    }

    // Determinar status agregado com base no HI total
    let status;
    if (hiTotal >= HI_THRESHOLD_CRITICAL) {
        status = HEALTH_STATUS.critical;
    } else if (hiTotal >= HI_THRESHOLD_RED) {
        status = HEALTH_STATUS.red;
    } else if (hiTotal >= HI_THRESHOLD_YELLOW) {
        status = HEALTH_STATUS.yellow;
    } else {
        status = HEALTH_STATUS.green;
    }

    return Object.freeze({
        hiTotal: Number(hiTotal.toFixed(6)),
        status,
        breakdown: Object.freeze(breakdown),
    });
}

// ----------------------------------------------------------------
// Correction factor - confounders (tabagismo, EPI)
// ----------------------------------------------------------------

/**
 * Compute correction factor for biological exposure index interpretation.
 * Adjusts for: smoking (multiplies apparent biomarker by factor), PPE efficiency.
 *
 * Regras aplicadas:
 * - smoker + phenol_urine          → factor = 2.5 (tabaco eleva fenol ~2–3×, midpoint ACGIH 2024)
 * - smoker + benzene_blood|exhaled → factor = 2.0 (benzeno tabaco, ACGIH 2024 p.50)
 * - half_face_respirator           → factor *= 0.5  (redução 50%)
 * - full_face_respirator           → factor *= 0.1  (redução 90%)
 * - hoursWorked > 8                → sem ajuste de fator BEI (apenas no TWA de ar);
 *                                    registrado em adjustedFrom para rastreabilidade
 *
 *   factor: multiplicar o valor observado por 1/factor para obter apenas exposição ocupacional
 *   adjustedFrom: lista de ajustes aplicados
 */
export function computeCorrectionFactor(params: {
    smokingStatus: 'smoker' | 'non_smoker' | 'unknown';
    ppeUsed: string[];
    hoursWorked: number;
    biomarkerType: string;
}): Readonly<{ factor: number; adjustedFrom: string[] }> {
    const { smokingStatus, ppeUsed = [], hoursWorked = 8, biomarkerType = '' } = (params || {}) as any;
    let factor = 1.0;
    const adjustedFrom: string[] = [];

    // Ajuste por tabagismo
    if (smokingStatus === 'smoker' && biomarkerType && (SMOKING_FACTORS as any)[biomarkerType] != null) {
        factor *= (SMOKING_FACTORS as any)[biomarkerType];
        adjustedFrom.push(`smoking:${biomarkerType}`);
    }

    // Ajuste por EPI - aplica redução na fração que chega ao trabalhador
    const ppeList = Array.isArray(ppeUsed) ? ppeUsed : [];

    if (ppeList.includes('full_face_respirator')) {
        factor *= 0.1;
        adjustedFrom.push('ppe:full_face_respirator');
    } else if (ppeList.includes('half_face_respirator')) {
        factor *= 0.5;
        adjustedFrom.push('ppe:half_face_respirator');
    }

    // Turno prolongado - sem ajuste de fator de BEI biológico (apenas TWA de ar)
    if (Number(hoursWorked) > 8) {
        adjustedFrom.push('overtime:no_bei_adjustment');
    }

    return Object.freeze({
        factor: Number(factor.toFixed(6)),
        adjustedFrom: Object.freeze([...adjustedFrom]) as unknown as string[],
    });
}

// ----------------------------------------------------------------
// Apply confounders - corrige valor observado
// ----------------------------------------------------------------

/**
 * Apply correction factor to an observed biomarker value.
 * correctedValue = observedValue / factor
 * Retorna a leitura corrigida para comparação com o BEI.
 */
export function applyConfounders(
    observedValue: number,
    correctionResult: Readonly<{ factor: number; adjustedFrom: string[] }>,
): Readonly<{ correctedValue: number; factor: number; adjustedFrom: string[] }> {
    if (correctionResult == null || typeof correctionResult.factor !== 'number') {
        throw new TypeError('applyConfounders: correctionResult must have a numeric factor');
    }
    if (correctionResult.factor <= 0) {
        throw new RangeError('applyConfounders: correctionResult.factor must be > 0');
    }

    const correctedValue = Number(observedValue) / correctionResult.factor;

    return Object.freeze({
        correctedValue: Number(correctedValue.toFixed(6)),
        factor: correctionResult.factor,
        adjustedFrom: correctionResult.adjustedFrom || Object.freeze([]),
    });
}
