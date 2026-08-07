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
 * Mine Explosion Risk (Risco de Explosão em Mina Subterrânea)
 *
 * References / Referências:
 *   - MSHA 30 CFR Part 57 - Safety and Health Standards: Underground Metal and
 *     Nonmetal Mines. Mine Safety and Health Administration (2024).
 *   - NIOSH (2014). "A Guide to the Control of Gases and Dust in Mines."
 *     NIOSH Publication No. 2015-145. Pittsburgh, PA.
 *   - Stull, D.R. (1977). "Fundamentals of Fire and Explosion." AIChE
 *     Monograph Series 73(10). ISBN 978-0-8169-0019-0 (LEL/UEL, Kst methodology)
 *   - NFPA 652 (2022). Standard on the Fundamentals of Combustible Dust.
 *     National Fire Protection Association.
 *
 * Pure math module - zero DOM/IDB/Three.js/fetch dependencies.
 * Módulo matemático puro - sem dependências de DOM/IDB/Three.js/fetch.
 *
 * @module mineExplosionRisk
 */

/**
 * Methane (CH₄) explosive limits in air at atmospheric pressure.
 * Limites de explosividade do metano no ar (pressão atmosférica).
 * Source: MSHA 30 CFR §57.22003; Stull (1977) Table A.1
 * @readonly
 */
export const CH4_LIMITS = Object.freeze({
    /** Lower Explosive Limit (LEL) — 5% v/v CH₄ in air */
    LEL_PCT: 5.0,
    /** Upper Explosive Limit (UEL) — 15% v/v CH₄ in air */
    UEL_PCT: 15.0,
    /** Action threshold per MSHA: 20% of LEL (1.0% v/v CH₄) */
    ACTION_THRESHOLD_PCT: 1.0,
    /** Evacuation threshold per MSHA: 40% of LEL (2.0% v/v CH₄) */
    EVACUATION_THRESHOLD_PCT: 2.0,
});

/**
 * Dust explosion class (St class) per NFPA 652 / EN 13821.
 * Classificação de explosividade de poeiras (classe St) conforme norma.
 * Kst in bar·m/s; Pmax in bar gauge.
 * @readonly
 */
export const DUST_ST_CLASS = Object.freeze({
    /** St 0: non-explosive dust (Kst = 0) */
    ST0: { label: 'St 0', kstMin: 0, kstMax: 0 },
    /** St 1: weakly explosive (Kst 1–200 bar·m/s) */
    ST1: { label: 'St 1', kstMin: 1, kstMax: 200 },
    /** St 2: strongly explosive (Kst 201–300 bar·m/s) */
    ST2: { label: 'St 2', kstMin: 201, kstMax: 300 },
    /** St 3: very strongly explosive (Kst > 300 bar·m/s) */
    ST3: { label: 'St 3', kstMin: 301, kstMax: Infinity },
});

/**
 * Classify CH₄ concentration vs explosive limits.
 * Classifica concentração de CH₄ vs limites de explosividade.
 * Implements MSHA 30 CFR §57.22003 action levels.
 *
 * @param {number} ch4ConcentrationPct - CH₄ concentration in air (% v/v), must be >= 0
 * @returns {{ pctOfLEL: number, zone: string, actionRequired: string, evacuate: boolean }}
 *   zone: 'safe' | 'caution' | 'action' | 'explosive_lower' | 'explosive_range' | 'explosive_upper' | 'above_uel'
 * @throws {RangeError} If ch4ConcentrationPct is negative
 * @throws {TypeError} If ch4ConcentrationPct is not a finite number
 */
export function classifyCH4Concentration(
    ch4ConcentrationPct: number,
): { pctOfLEL: number; zone: string; actionRequired: string; evacuate: boolean } {
    if (!Number.isFinite(ch4ConcentrationPct)) {
        throw new TypeError(`ch4ConcentrationPct must be a finite number, got: ${ch4ConcentrationPct}`);
    }
    if (ch4ConcentrationPct < 0) {
        throw new RangeError(`ch4ConcentrationPct must be >= 0, got: ${ch4ConcentrationPct}`);
    }

    const { LEL_PCT, UEL_PCT, ACTION_THRESHOLD_PCT, EVACUATION_THRESHOLD_PCT } = CH4_LIMITS;

    // Percentagem do LEL (útil para monitoramento contínuo - instrumentos leem %LEL)
    // Percentage of LEL - continuous monitoring instruments often report in %LEL
    const pctOfLEL = (ch4ConcentrationPct / LEL_PCT) * 100;

    let zone: string, actionRequired: string, evacuate: boolean;

    if (ch4ConcentrationPct < ACTION_THRESHOLD_PCT) {
        zone = 'safe';
        actionRequired = 'none';
        evacuate = false;
    } else if (ch4ConcentrationPct < EVACUATION_THRESHOLD_PCT) {
        zone = 'caution';
        actionRequired = 'increase_ventilation';
        evacuate = false;
    } else if (ch4ConcentrationPct < LEL_PCT) {
        zone = 'action';
        actionRequired = 'evacuate_and_ventilate';
        evacuate = true;
    } else if (ch4ConcentrationPct >= LEL_PCT && ch4ConcentrationPct <= UEL_PCT) {
        zone = 'explosive_range';
        actionRequired = 'immediate_evacuation_no_ignition_sources';
        evacuate = true;
    } else {
        // Acima do UEL: ainda perigoso - ao diluir, passa pela faixa explosiva
        // Above UEL: still hazardous - dilution passes through explosive range
        zone = 'above_uel';
        actionRequired = 'no_entry_extreme_hazard';
        evacuate = true;
    }

    return { pctOfLEL, zone, actionRequired, evacuate };
}

/**
 * Classify dust by Kst value and assign St class (explosividade de poeiras).
 * Per NFPA 652 Table 5.1 and Stull (1977) Appendix A.
 *
 * @param {number} kst - Deflagration index Kst (bar·m/s), must be >= 0
 * @returns {{ kst: number, stClass: string, explosivityLabel: string }}
 * @throws {RangeError} If kst is negative
 * @throws {TypeError} If kst is not a finite number
 */
export function classifyDustExplosivity(
    kst: number,
): { kst: number; stClass: string; explosivityLabel: string } {
    if (!Number.isFinite(kst)) {
        throw new TypeError(`kst must be a finite number, got: ${kst}`);
    }
    if (kst < 0) {
        throw new RangeError(`kst must be >= 0, got: ${kst}`);
    }

    let stClass: string, explosivityLabel: string;

    if (kst === 0) {
        stClass = 'St 0';
        explosivityLabel = 'non_explosive';
    } else if (kst <= 200) {
        stClass = 'St 1';
        explosivityLabel = 'weakly_explosive';
    } else if (kst <= 300) {
        stClass = 'St 2';
        explosivityLabel = 'strongly_explosive';
    } else {
        stClass = 'St 3';
        explosivityLabel = 'very_strongly_explosive';
    }

    return { kst, stClass, explosivityLabel };
}

/**
 * Ventilation time to dilute CH₄ to safe level (tempo de ventilação para diluição).
 * Uses ideal dilution model: C(t) = C₀ × exp(−Q × t / V)
 * Solved for t: t = (V / Q) × ln(C₀ / C_target)
 * Per NIOSH (2014) §3.4 and MSHA ventilation standards.
 *
 * @param {number} volumeM3 - Zone volume V (m³), must be > 0
 * @param {number} ventilationFlowM3s - Ventilation flow rate Q (m³/s), must be > 0
 * @param {number} initialCH4Pct - Initial CH₄ concentration C₀ (% v/v), must be > 0
 * @param {number} [targetCH4Pct=1.0] - Target CH₄ concentration C_target (% v/v); default = MSHA action threshold
 * @returns {{ ventilationTimeS: number, ventilationTimeMin: number, airChanges: number }}
 * @throws {RangeError} If initialCH4Pct <= targetCH4Pct, or volume/flow <= 0
 * @throws {TypeError} If arguments are not finite numbers
 */
export function ventilationDilutionTime(
    volumeM3: number,
    ventilationFlowM3s: number,
    initialCH4Pct: number,
    targetCH4Pct: number = CH4_LIMITS.ACTION_THRESHOLD_PCT,
): { ventilationTimeS: number; ventilationTimeMin: number; airChanges: number } {
    if (
        !Number.isFinite(volumeM3) ||
        !Number.isFinite(ventilationFlowM3s) ||
        !Number.isFinite(initialCH4Pct) ||
        !Number.isFinite(targetCH4Pct)
    ) {
        throw new TypeError('All arguments must be finite numbers');
    }
    if (volumeM3 <= 0) throw new RangeError(`volumeM3 must be > 0, got: ${volumeM3}`);
    if (ventilationFlowM3s <= 0) throw new RangeError(`ventilationFlowM3s must be > 0, got: ${ventilationFlowM3s}`);
    if (initialCH4Pct <= 0) throw new RangeError(`initialCH4Pct must be > 0, got: ${initialCH4Pct}`);
    if (targetCH4Pct <= 0) throw new RangeError(`targetCH4Pct must be > 0, got: ${targetCH4Pct}`);
    if (initialCH4Pct <= targetCH4Pct) {
        throw new RangeError(`initialCH4Pct (${initialCH4Pct}) must be > targetCH4Pct (${targetCH4Pct})`);
    }

    // t = (V / Q) × ln(C₀ / C_target)
    const timeConstant = volumeM3 / ventilationFlowM3s; // s (tempo de residência)
    const ventilationTimeS = timeConstant * Math.log(initialCH4Pct / targetCH4Pct);
    const ventilationTimeMin = ventilationTimeS / 60;

    // Número de trocas de ar necessárias
    // Number of air changes required
    const airChanges = (ventilationFlowM3s * ventilationTimeS) / volumeM3;

    return { ventilationTimeS, ventilationTimeMin, airChanges };
}

/**
 * Explosion exclusion zone by explosive mass (zona de exclusão por massa explosiva).
 * Uses TNT equivalence and scaled distance from Stull (1977) §6.3:
 * R = K × (W_TNT)^(1/3), where K is the Hopkinson-Cranz constant.
 * Also applies MSHA 30 CFR §57.22205 blast criteria.
 *
 * @param {number} explosiveMassKg - Mass of explosive equivalent (kg TNT), must be > 0
 * @param {number} [kFactor=2.5] - Hopkinson-Cranz K factor (m/kg^(1/3));
 *   typical: 2.5 (injury threshold), 6.0 (minor damage), 20.0 (nuisance)
 * @returns {{ exclusionRadiusM: number, exclusionAreaM2: number, scaledDistance: number }}
 * @throws {RangeError} If explosiveMassKg or kFactor <= 0
 * @throws {TypeError} If arguments are not finite numbers
 */
export function explosionExclusionZone(
    explosiveMassKg: number,
    kFactor: number = 2.5,
): { exclusionRadiusM: number; exclusionAreaM2: number; scaledDistance: number } {
    if (!Number.isFinite(explosiveMassKg) || !Number.isFinite(kFactor)) {
        throw new TypeError('All arguments must be finite numbers');
    }
    if (explosiveMassKg <= 0) throw new RangeError(`explosiveMassKg must be > 0, got: ${explosiveMassKg}`);
    if (kFactor <= 0) throw new RangeError(`kFactor must be > 0, got: ${kFactor}`);

    // R = K × W^(1/3)  [m]
    const exclusionRadiusM = kFactor * Math.pow(explosiveMassKg, 1 / 3);
    const exclusionAreaM2 = Math.PI * exclusionRadiusM * exclusionRadiusM;

    // Distância escalonada (referência para tabelas de dano)
    // Scaled distance for damage table lookup
    const scaledDistance = exclusionRadiusM / Math.pow(explosiveMassKg, 1 / 3);

    return { exclusionRadiusM, exclusionAreaM2, scaledDistance };
}

/**
 * Composite mine explosion risk classification (classificação composta de risco de explosão).
 * Combines CH₄ concentration, dust explosivity, and ventilation status into a final risk level.
 *
 * @param {object} params
 * @param {number} params.ch4Pct - Current CH₄ concentration (% v/v)
 * @param {number} params.kst - Dust Kst value (bar·m/s)
 * @param {number} params.ventilationFlowM3s - Current ventilation flow (m³/s), 0 if failed
 * @param {number} params.zoneVolumeM3 - Zone volume (m³)
 * @returns {{ ch4Result: object, dustResult: object, ventilationOK: boolean, riskScore: number, riskLevel: string }}
 *   riskLevel: 'acceptable' | 'elevated' | 'critical' | 'imminent'
 * @throws {TypeError|RangeError} Propagated from sub-functions
 */
export function compositeExplosionRisk({
    ch4Pct,
    kst,
    ventilationFlowM3s,
    zoneVolumeM3,
}: {
    ch4Pct: number;
    kst: number;
    ventilationFlowM3s: number;
    zoneVolumeM3: number;
}): {
    ch4Result: object;
    dustResult: object;
    ventilationOK: boolean;
    riskScore: number;
    riskLevel: string;
} {
    if (!Number.isFinite(zoneVolumeM3) || zoneVolumeM3 <= 0) {
        throw new RangeError(`zoneVolumeM3 must be > 0, got: ${zoneVolumeM3}`);
    }

    const ch4Result = classifyCH4Concentration(ch4Pct);
    const dustResult = classifyDustExplosivity(kst);

    // Ventilação OK se fluxo mínimo de 0.25 m³/s por 100 m³ de zona (MSHA diretriz)
    // Ventilation OK if minimum flow is 0.25 m³/s per 100 m³ of zone (MSHA guideline)
    const minRequiredFlow = 0.0025 * zoneVolumeM3; // m³/s
    const ventilationOK = ventilationFlowM3s >= minRequiredFlow;

    // Score de risco CH₄ (0–4): mapeia zona para pontos
    const ch4ZoneScore =
        (({ safe: 0, caution: 1, action: 2, explosive_range: 4, above_uel: 3 } as Record<string, number>)[
            ch4Result.zone
        ]) ?? 2;

    // Score de explosividade de pó (0–3): St class
    const dustScoreMap: Record<string, number> = { non_explosive: 0, weakly_explosive: 1, strongly_explosive: 2, very_strongly_explosive: 3 };
    const dustScore = dustScoreMap[dustResult.explosivityLabel] ?? 1;

    // Penalidade de ventilação
    const ventPenalty = ventilationOK ? 0 : 2;

    // Score composto (0–9)
    const riskScore = ch4ZoneScore + dustScore + ventPenalty;

    let riskLevel: string;
    if (riskScore <= 1) riskLevel = 'acceptable';
    else if (riskScore <= 3) riskLevel = 'elevated';
    else if (riskScore <= 6) riskLevel = 'critical';
    else riskLevel = 'imminent';

    return { ch4Result, dustResult, ventilationOK, riskScore, riskLevel };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineExplosionRiskMeta = {
    name: 'mineExplosionRisk',
    description: 'mineExplosionRisk',
    category: 'analytics',
    familyTags: ['mining', 'risk', 'fire'],
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
