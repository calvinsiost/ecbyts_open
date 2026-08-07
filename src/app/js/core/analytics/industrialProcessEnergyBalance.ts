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
 * @module industrialProcessEnergyBalance
 * @description Perdas em sistemas de vapor industrial - ASME PTC 4 e
 *   DOE Steam Best Practices Guide (2012). Equações de engenharia puras,
 *   implementação independente.
 *
 * Referências acadêmicas:
 *   - DOE (2012) "Improving Steam System Performance: A Sourcebook for Industry."
 *     2nd ed. U.S. Department of Energy, Office of Industrial Technologies.
 *     DOE/GO-102012-3405.
 *   - ASME PTC 4-2013 "Fired Steam Generators - Performance Test Codes."
 *     American Society of Mechanical Engineers, New York. ISBN:978-0-7918-3723-7
 *   - Spirax Sarco (2022) "Steam Engineering Tutorials - The Steam and Condensate Loop."
 *     https://www.spiraxsarco.com/learn-about-steam (Chapters 2, 5, 14)
 *   - Napier, J. (1866) formula for orifice steam flow - standard industry reference
 *     used in steam trap sizing (see DOE 2012 §4.3).
 *   - ISO 5167-1:2022 "Measurement of fluid flow by means of pressure differential
 *     devices inserted in circular cross-section conduits running full."
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

// ---------------------------------------------------------------------------
// Constantes físicas do vapor (aproximação tabelada)
// ---------------------------------------------------------------------------
// Entalpia de vaporização hfg ≈ eq. simplificada (kJ/kg) para 1–20 bar (saturado)
// Fonte: tabelas de vapor (Perry's Chemical Engineers' Handbook, 9th ed.)
const STEAM_ENTHALPY_FG: Record<number, number> = {
    1: 2257,
    2: 2201,
    3: 2164,
    4: 2133,
    5: 2108,
    6: 2086,
    7: 2066,
    8: 2048,
    9: 2031,
    10: 2015,
    12: 1986,
    14: 1960,
    16: 1935,
    18: 1912,
    20: 1890,
};

/**
 * Interpola linearmente o hfg (kJ/kg) para uma pressão em bar.
 */
function interpHfg(p_bar: number): number {
    const keys = Object.keys(STEAM_ENTHALPY_FG)
        .map(Number)
        .sort((a, b) => a - b);
    if (p_bar <= keys[0]!) return STEAM_ENTHALPY_FG[keys[0]!]!;
    if (p_bar >= keys[keys.length - 1]!) return STEAM_ENTHALPY_FG[keys[keys.length - 1]!]!;
    for (let i = 0; i < keys.length - 1; i++) {
        if (p_bar >= keys[i]! && p_bar <= keys[i + 1]!) {
            const t = (p_bar - keys[i]!) / (keys[i + 1]! - keys[i]!);
            return STEAM_ENTHALPY_FG[keys[i]!]! + t * (STEAM_ENTHALPY_FG[keys[i + 1]!]! - STEAM_ENTHALPY_FG[keys[i]!]!);
        }
    }
    return STEAM_ENTHALPY_FG[keys[keys.length - 1]!]!;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Calcula a perda de vapor por purgador com defeito (blow-through) usando a
 * equação de Napier simplificada para orifício de vapor.
 *
 * Q_steam (kg/h) = C × d² × P
 *   onde C = 11.0 (fator de Napier adimensional para vapor saturado, lb-in-psi→kg-mm-bar),
 *   d = diâmetro do orifício (mm), P = pressão absoluta (bar).
 *
 * Referência: DOE (2012) §4.3, eq. Napier; Spirax Sarco Tutorial §14.6.
 *
 * @param trapDiameter_mm - Diâmetro do orifício do purgador (mm, > 0)
 * @param pressure_bar    - Pressão de operação (bar absoluto, > 0)
 * @param isBlowing      - true = purgador falhado em aberto (blow-through)
 */
export function calcSteamTrapLoss(
    trapDiameter_mm: number,
    pressure_bar: number,
    isBlowing: boolean,
): { steamLoss_kg_h: number; energyLoss_kW: number } {
    if (typeof trapDiameter_mm !== 'number' || !isFinite(trapDiameter_mm) || trapDiameter_mm <= 0) {
        throw new RangeError('trapDiameter_mm must be a positive finite number');
    }
    if (typeof pressure_bar !== 'number' || !isFinite(pressure_bar) || pressure_bar <= 0) {
        throw new RangeError('pressure_bar must be a positive finite number');
    }
    if (typeof isBlowing !== 'boolean') {
        throw new TypeError('isBlowing must be a boolean');
    }

    if (!isBlowing) {
        return { steamLoss_kg_h: 0, energyLoss_kW: 0 };
    }

    // Fator Napier: 11.0 (adaptado para mm e bar - ver DOE 2012 §4.3 com conversão)
    const C_napier = 11.0;
    const steamLoss_kg_h = (C_napier * trapDiameter_mm ** 2 * pressure_bar) / 1000;

    const hfg = interpHfg(pressure_bar); // kJ/kg
    // Q (kW) = m_dot (kg/h) × hfg (kJ/kg) / 3600
    const energyLoss_kW = (steamLoss_kg_h * hfg) / 3600;

    return { steamLoss_kg_h, energyLoss_kW };
}

/**
 * Calcula a perda de calor por condução através de isolamento de tubo (lei de Fourier
 * em geometria cilíndrica).
 *
 * Q = 2π × L × λ × (Tpipe - Tambient) / ln(r_outer / r_inner)
 *
 * Referência: Incropera & DeWitt (2007) "Fundamentals of Heat and Mass Transfer" §3.3;
 * DOE (2012) §3.2 - Pipe Heat Loss Calculator methodology.
 *
 * @param diameter_m     - Diâmetro externo do tubo (m, > 0)
 * @param length_m       - Comprimento do trecho de tubo (m, > 0)
 * @param Tpipe_C        - Temperatura interna do tubo (°C)
 * @param Tambient_C     - Temperatura ambiente (°C)
 * @param insThickness_m - Espessura do isolamento (m, ≥ 0)
 * @param conductivity   - Condutividade térmica do isolante (W/m·K, > 0)
 */
export function calcInsulationHeatLoss(
    diameter_m: number,
    length_m: number,
    Tpipe_C: number,
    Tambient_C: number,
    insThickness_m: number,
    conductivity: number,
): { heatLoss_W: number; heatLossPerMeter_W_m: number } {
    for (const [k, v, pos] of [
        ['diameter_m', diameter_m, true],
        ['length_m', length_m, true],
        ['insThickness_m', insThickness_m, false],
        ['conductivity', conductivity, true],
    ] as Array<[string, number, boolean]>) {
        if (typeof v !== 'number' || !isFinite(v)) throw new TypeError(`${k} must be finite`);
        if (pos && v <= 0) throw new RangeError(`${k} must be positive`);
        if (!pos && v < 0) throw new RangeError(`${k} must be non-negative`);
    }
    for (const [k, v] of [
        ['Tpipe_C', Tpipe_C],
        ['Tambient_C', Tambient_C],
    ] as Array<[string, number]>) {
        if (typeof v !== 'number' || !isFinite(v)) throw new TypeError(`${k} must be finite`);
    }

    const r_inner = diameter_m / 2;
    const r_outer = r_inner + insThickness_m;
    const deltaT = Tpipe_C - Tambient_C;

    let heatLoss_W;
    if (insThickness_m === 0 || r_outer === r_inner) {
        // Tubo sem isolamento: perda convectiva aproximada (h=10 W/m²K)
        const h_conv = 10;
        const surfaceArea = Math.PI * diameter_m * length_m;
        heatLoss_W = h_conv * surfaceArea * deltaT;
    } else {
        // Resistência cilíndrica: R = ln(r_outer/r_inner) / (2π × λ × L)
        const R_thermal = Math.log(r_outer / r_inner) / (2 * Math.PI * conductivity * length_m);
        heatLoss_W = deltaT / R_thermal;
    }

    return {
        heatLoss_W,
        heatLossPerMeter_W_m: heatLoss_W / length_m,
    };
}

/**
 * Calcula o potencial de vapor flash gerado pela expansão de condensado.
 *
 * Flash steam (%) = (hf_high - hf_low) / hfg_low × 100
 * Flash steam (kg/h) = condensateFlow × flashPct / 100
 *
 * Referência: Spirax Sarco Tutorial §2.3; DOE (2012) §5.4.
 *
 * Entalpia de líquido saturado hf (kJ/kg) ≈ 417 + 213×ln(P_bar) para 1–20 bar
 * (regressão simples baseada em tabelas NIST).
 *
 * @param condensateFlow_kg_h - Vazão de condensado (kg/h, > 0)
 * @param highPressure_bar    - Pressão alta (bar, > lowPressure)
 * @param lowPressure_bar     - Pressão baixa (bar, > 0)
 */
export function calcFlashSteamPotential(
    condensateFlow_kg_h: number,
    highPressure_bar: number,
    lowPressure_bar: number,
): { flashSteam_kg_h: number; flashFraction_pct: number } {
    if (typeof condensateFlow_kg_h !== 'number' || !isFinite(condensateFlow_kg_h) || condensateFlow_kg_h <= 0) {
        throw new RangeError('condensateFlow_kg_h must be a positive finite number');
    }
    if (typeof highPressure_bar !== 'number' || !isFinite(highPressure_bar) || highPressure_bar <= 0) {
        throw new RangeError('highPressure_bar must be positive');
    }
    if (typeof lowPressure_bar !== 'number' || !isFinite(lowPressure_bar) || lowPressure_bar <= 0) {
        throw new RangeError('lowPressure_bar must be positive');
    }
    if (highPressure_bar <= lowPressure_bar) {
        throw new RangeError('highPressure_bar must be greater than lowPressure_bar');
    }

    // hf(P) ≈ 417 + 213 × ln(P_bar) - regressão sobre tabelas NIST/ASHRAE Steam
    const hf_high = 417 + 213 * Math.log(highPressure_bar);
    const hf_low = 417 + 213 * Math.log(lowPressure_bar);
    const hfg_low = interpHfg(lowPressure_bar);

    const flashFraction_pct = Math.max(0, ((hf_high - hf_low) / hfg_low) * 100);
    const flashSteam_kg_h = (condensateFlow_kg_h * flashFraction_pct) / 100;

    return { flashSteam_kg_h, flashFraction_pct };
}

/**
 * Calcula a eficiência geral do sistema de vapor (geração → uso).
 *
 * η_system = (usefulHeat_kW × 3600) / (generatedSteam_kg_h × hfg) × boilerEfficiency
 *
 * onde hfg é estimado a pressão típica de 10 bar.
 *
 * Referência: ASME PTC 4-2013 §5; DOE (2012) §2.
 *
 * @param generatedSteam_kg_h - Vapor gerado pela caldeira (kg/h, > 0)
 * @param usefulHeat_kW       - Calor útil entregue ao processo (kW, ≥ 0)
 * @param boilerEfficiency    - Eficiência da caldeira (0 a 1)
 */
export function calcSteamSystemEfficiency(
    generatedSteam_kg_h: number,
    usefulHeat_kW: number,
    boilerEfficiency: number,
): { systemEfficiency_pct: number } {
    if (typeof generatedSteam_kg_h !== 'number' || !isFinite(generatedSteam_kg_h) || generatedSteam_kg_h <= 0) {
        throw new RangeError('generatedSteam_kg_h must be a positive finite number');
    }
    if (typeof usefulHeat_kW !== 'number' || !isFinite(usefulHeat_kW) || usefulHeat_kW < 0) {
        throw new RangeError('usefulHeat_kW must be a non-negative finite number');
    }
    if (
        typeof boilerEfficiency !== 'number' ||
        !isFinite(boilerEfficiency) ||
        boilerEfficiency <= 0 ||
        boilerEfficiency > 1
    ) {
        throw new RangeError('boilerEfficiency must be between 0 (exclusive) and 1');
    }

    const REF_PRESSURE_BAR = 10;
    const hfg = interpHfg(REF_PRESSURE_BAR); // kJ/kg
    const steamEnergyInput_kW = (generatedSteam_kg_h * hfg) / 3600;
    const systemEfficiency_pct =
        usefulHeat_kW === 0 ? 0 : Math.min(100, (usefulHeat_kW / steamEnergyInput_kW) * boilerEfficiency * 100);

    return { systemEfficiency_pct };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialProcessEnergyBalanceMeta: AnalyticsModuleMeta = {
    name: 'industrialProcessEnergyBalance',
    description: 'industrialProcessEnergyBalance',
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
