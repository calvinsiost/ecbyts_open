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
 * Environmental Radon Exposure Schema — avaliação de exposição a radônio-222
 * em ambientes residenciais, ocupacionais e de mineração subterrânea.
 *
 * Converte concentrações de atividade (Bq/m³ ↔ pCi/L), calcula concentração
 * equivalente de equilíbrio (EEC) a partir do fator de equilíbrio F, deriva
 * Working Level (WL) e Working Level Months (WLM) para exposição ocupacional
 * de mineiros, e estima a dose efetiva anual via fator de conversão de dose
 * ICRP. Classifica contra níveis de referência WHO (100–300 Bq/m³), US EPA
 * (4 pCi/L ≈ 148 Bq/m³) e ação ocupacional ICRP/NR.
 *
 * Aplicável a minas subterrâneas (urânio, carvão, metais), cavernas, porões,
 * estações de tratamento de água subterrânea e edificações sobre solos
 * graníticos — todos contextos de digital twin ambiental/ocupacional.
 *
 * Referências regulatórias e científicas:
 *  - WHO (2009). WHO Handbook on Indoor Radon: A Public Health Perspective.
 *    World Health Organization, Geneva. ISBN 978-92-4-154767-3. (nível de
 *    referência recomendado 100 Bq/m³; máximo 300 Bq/m³)
 *  - US EPA (2016). A Citizen's Guide to Radon. EPA 402/K-12/002. (action
 *    level 4 pCi/L = 148 Bq/m³)
 *  - ICRP Publication 65 (1993). Protection Against Radon-222 at Home and at
 *    Work. Ann. ICRP 23(2). (conversão WLM ↔ dose; fator de equilíbrio)
 *  - ICRP Publication 115 (2010). Lung Cancer Risk from Radon and Progeny.
 *    Ann. ICRP 40(1). (dose conversion convention ~ 5 mSv/WLM nominal;
 *    revisado p/ ~ ICRP 137 ~ 3 mSv/WLM em uso ocupacional padrão)
 *  - ICRP Publication 137 (2017). Occupational Intakes of Radionuclides Part 3.
 *  - UNSCEAR (2006). Effects of Ionizing Radiation, Annex E. (dose coefficient
 *    9 nSv por Bq·h·m⁻³ EEC para público; 1.4 mSv/WLM contexto residencial)
 *  - Brasil — CNEN NN 3.01 (Diretrizes Básicas de Proteção Radiológica).
 *  - Brasil — NR-15 Anexo 5 (radiações ionizantes — atividades insalubres).
 *
 * Conversões canônicas:
 *   1 pCi/L = 37 Bq/m³ (exato: 1 pCi = 0.037 Bq, 1 L = 0.001 m³)
 *   EEC = F × C        (F = fator de equilíbrio, default 0.4 indoor WHO)
 *   1 WL = 3700 Bq/m³ EEC  (definição: 1.3×10⁵ MeV de energia α potencial / L)
 *   WLM = (WL × horas_exposição) / 170   (170 h = mês de trabalho de referência)
 *
 * Zero dependências DOM/IDB/Three.js/fetch. Pure-logic.
 * @module environmentalRadonExposureSchema
 */

/** Fator de conversão pCi/L → Bq/m³ (1 pCi/L = 37 Bq/m³). */
export const PCI_L_TO_BQ_M3 = 37;

/** EEC (Bq/m³) correspondente a 1 Working Level. */
export const WL_TO_BQ_M3_EEC = 3700;

/** Horas de trabalho de referência por mês (definição WLM). */
export const WORKING_MONTH_HOURS = 170;

/** Fator de equilíbrio default indoor (WHO/UNSCEAR). */
export const DEFAULT_EQUILIBRIUM_FACTOR = 0.4;

/**
 * Níveis de referência de concentração de radônio (Bq/m³).
 * Frozen — fontes citadas no header.
 */
export const RADON_REFERENCE_LEVELS_BQ_M3 = Object.freeze({
    WHO_REFERENCE: 100, // WHO 2009 nível recomendado
    WHO_MAX: 300, // WHO 2009 máximo aceitável
    EPA_ACTION: 148, // US EPA 4 pCi/L
});

/** Dose conversion convention para WLM ocupacional (mSv por WLM, ICRP 137 nominal). */
export const MSV_PER_WLM_OCCUPATIONAL = 3;

/** Dose coefficient residencial (mSv por mWLM equivalente; UNSCEAR 1.4 mSv/WLM). */
export const MSV_PER_WLM_RESIDENTIAL = 1.4;

/**
 * Classificação de risco por concentração (escala ordinal).
 * Frozen — usada por classifyRadonLevel.
 */
export const RADON_RISK_TIER = Object.freeze({
    LOW: 'LOW', // < WHO_REFERENCE
    ELEVATED: 'ELEVATED', // WHO_REFERENCE .. EPA_ACTION
    HIGH: 'HIGH', // EPA_ACTION .. WHO_MAX
    CRITICAL: 'CRITICAL', // >= WHO_MAX
});

export interface RadonExposureInput {
    /** Concentração de atividade de radônio (Bq/m³). */
    concentrationBqM3: number;
    /** Fator de equilíbrio F (default DEFAULT_EQUILIBRIUM_FACTOR). */
    equilibriumFactor?: number;
    /** Horas de exposição (para WLM ocupacional). */
    exposureHours?: number;
    /** 'occupational' usa MSV_PER_WLM_OCCUPATIONAL; 'residential' usa residencial. */
    context?: 'occupational' | 'residential';
}

export interface RadonExposureResult {
    concentrationBqM3: number;
    concentrationPciL: number;
    equilibriumFactor: number;
    eecBqM3: number; // Equilibrium Equivalent Concentration
    workingLevel: number; // WL
    workingLevelMonths: number | null; // WLM (null se exposureHours ausente)
    annualEffectiveDoseMsv: number | null; // mSv (null se WLM ausente)
    tier: string;
    exceedsWhoReference: boolean;
    exceedsEpaAction: boolean;
    exceedsWhoMax: boolean;
}

/** Converte pCi/L → Bq/m³. */
export function pciLToBqM3(pciL: number): number {
    return (Number(pciL) || 0) * PCI_L_TO_BQ_M3;
}

/** Converte Bq/m³ → pCi/L. */
export function bqM3ToPciL(bqM3: number): number {
    const v = Number(bqM3) || 0;
    return v / PCI_L_TO_BQ_M3;
}

/**
 * Equilibrium Equivalent Concentration (Bq/m³) = F × C.
 * F clamped a [0, 1]; C não-negativo.
 */
export function equilibriumEquivalentConcentration(
    concentrationBqM3: number,
    equilibriumFactor: number = DEFAULT_EQUILIBRIUM_FACTOR,
): number {
    const c = Math.max(0, Number(concentrationBqM3) || 0);
    let f = Number(equilibriumFactor);
    if (!Number.isFinite(f)) f = DEFAULT_EQUILIBRIUM_FACTOR;
    f = Math.max(0, Math.min(1, f));
    return c * f;
}

/** Working Level a partir de EEC (Bq/m³). 1 WL = 3700 Bq/m³ EEC. */
export function workingLevelFromEec(eecBqM3: number): number {
    return (Math.max(0, Number(eecBqM3) || 0)) / WL_TO_BQ_M3_EEC;
}

/**
 * Working Level Months: WLM = (WL × horas) / 170.
 * Retorna 0 se horas ≤ 0.
 */
export function workingLevelMonths(workingLevel: number, exposureHours: number): number {
    const wl = Math.max(0, Number(workingLevel) || 0);
    const h = Math.max(0, Number(exposureHours) || 0);
    if (h === 0) return 0;
    return (wl * h) / WORKING_MONTH_HOURS;
}

/**
 * Dose efetiva (mSv) = WLM × fator de conversão (contexto).
 */
export function effectiveDoseFromWlm(
    wlm: number,
    context: 'occupational' | 'residential' = 'occupational',
): number {
    const w = Math.max(0, Number(wlm) || 0);
    const factor = context === 'residential' ? MSV_PER_WLM_RESIDENTIAL : MSV_PER_WLM_OCCUPATIONAL;
    return w * factor;
}

/**
 * Classifica concentração (Bq/m³) em RADON_RISK_TIER.
 */
export function classifyRadonLevel(concentrationBqM3: number): string {
    const c = Math.max(0, Number(concentrationBqM3) || 0);
    const L = RADON_REFERENCE_LEVELS_BQ_M3;
    if (c >= L.WHO_MAX) return RADON_RISK_TIER.CRITICAL;
    if (c >= L.EPA_ACTION) return RADON_RISK_TIER.HIGH;
    if (c >= L.WHO_REFERENCE) return RADON_RISK_TIER.ELEVATED;
    return RADON_RISK_TIER.LOW;
}

/**
 * Avaliação completa de exposição a radônio (frozen result).
 * Combina conversões + EEC + WL + WLM + dose + classificação.
 */
export function assessRadonExposure(input: RadonExposureInput): Readonly<RadonExposureResult> {
    const concentrationBqM3 = Math.max(0, Number(input?.concentrationBqM3) || 0);
    const equilibriumFactor =
        input?.equilibriumFactor != null && Number.isFinite(Number(input.equilibriumFactor))
            ? Math.max(0, Math.min(1, Number(input.equilibriumFactor)))
            : DEFAULT_EQUILIBRIUM_FACTOR;
    const context = input?.context === 'residential' ? 'residential' : 'occupational';

    const eecBqM3 = equilibriumEquivalentConcentration(concentrationBqM3, equilibriumFactor);
    const workingLevel = workingLevelFromEec(eecBqM3);

    let wlm: number | null = null;
    let dose: number | null = null;
    if (input?.exposureHours != null && Number.isFinite(Number(input.exposureHours))) {
        wlm = workingLevelMonths(workingLevel, Number(input.exposureHours));
        dose = effectiveDoseFromWlm(wlm, context);
    }

    const L = RADON_REFERENCE_LEVELS_BQ_M3;
    return Object.freeze({
        concentrationBqM3,
        concentrationPciL: bqM3ToPciL(concentrationBqM3),
        equilibriumFactor,
        eecBqM3,
        workingLevel,
        workingLevelMonths: wlm,
        annualEffectiveDoseMsv: dose,
        tier: classifyRadonLevel(concentrationBqM3),
        exceedsWhoReference: concentrationBqM3 >= L.WHO_REFERENCE,
        exceedsEpaAction: concentrationBqM3 >= L.EPA_ACTION,
        exceedsWhoMax: concentrationBqM3 >= L.WHO_MAX,
    });
}

/**
 * Type-guard for RadonExposureInput.
 */
export function isValidRadonInput(value: unknown): value is RadonExposureInput {
    if (!value || typeof value !== 'object') return false;
    const v = value as RadonExposureInput;
    return Number.isFinite(Number(v.concentrationBqM3));
}
