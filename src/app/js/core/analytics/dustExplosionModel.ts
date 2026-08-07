// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Dust Explosion Modeling - Kst index, ignition energy and LEL assessment
// Modelagem de explosão de poeira industrial - índice Kst, concentração de ignição e energia mínima
//
// References / Referências:
//   NFPA 652 (2019) Standard on the Fundamentals of Combustible Dust
//   EN 14034-1:2004 - Determination of explosion characteristics of dust clouds
//   Eckhoff, R.K. (2003) Dust Explosions in the Process Industries. 3rd ed. Gulf Professional Publishing
//   ABNT NBR 17505 - Armazenagem de líquidos inflamáveis e combustíveis

'use strict';

/**
 * Compute dust explosion severity class based on Kst and maximum explosion pressure.
 * Calcula a classe de severidade da explosão de poeira com base no Kst e pressão máxima.
 *
 * St classification per NFPA 652 / EN 14034-1:
 *   St0: Kst = 0 (non-explosible)
 *   St1: Kst 1–200 bar·m/s (weak to moderate)
 *   St2: Kst 201–300 bar·m/s (strong)
 *   St3: Kst > 300 bar·m/s (very strong)
 *
 * @param kst_bar_m_s - Deflagration index Kst in bar·m/s / Índice de deflagração em bar·m/s
 * @param pmax_bar - Maximum explosion pressure in bar / Pressão máxima de explosão em bar
 */
export function computeExplosionSeverity(
    kst_bar_m_s: number,
    pmax_bar: number,
): { explosion_class: 'St0' | 'St1' | 'St2' | 'St3'; severity: string } {
    if (typeof kst_bar_m_s !== 'number' || typeof pmax_bar !== 'number') {
        throw new TypeError('kst_bar_m_s and pmax_bar must be numbers');
    }
    if (kst_bar_m_s < 0) throw new RangeError('kst_bar_m_s must be >= 0');
    if (pmax_bar < 0) throw new RangeError('pmax_bar must be >= 0');

    if (kst_bar_m_s === 0) {
        return {
            explosion_class: 'St0',
            severity: `Não explosível — pó não apresenta risco de explosão (Pmax=${pmax_bar} bar)`,
        };
    }
    if (kst_bar_m_s <= 200) {
        return {
            explosion_class: 'St1',
            severity: `Explosão fraca a moderada — Kst=${kst_bar_m_s} bar·m/s, Pmax=${pmax_bar} bar; medidas básicas de prevenção NFPA 652`,
        };
    }
    if (kst_bar_m_s <= 300) {
        return {
            explosion_class: 'St2',
            severity: `Explosão forte — Kst=${kst_bar_m_s} bar·m/s, Pmax=${pmax_bar} bar; supressão ou ventilação de explosão obrigatória`,
        };
    }
    return {
        explosion_class: 'St3',
        severity: `Explosão muito forte — Kst=${kst_bar_m_s} bar·m/s, Pmax=${pmax_bar} bar; construção anti-explosão ou supressão automática`,
    };
}

/**
 * Estimate Minimum Ignition Energy (MIE) for a dust cloud.
 * Estima a Energia Mínima de Ignição (MIE) para uma nuvem de poeira.
 *
 * Empirical estimation based on particle size, moisture and oxygen content.
 * Estimativa empírica baseada no tamanho de partícula, umidade e teor de oxigênio.
 * Ref: Eckhoff (2003), cap. 4.
 *
 * Base MIE = 30 mJ (reference for typical organic dust at 50–100 µm, ambient O2)
 * Fine particles (<50µm) reduce MIE by 70%; moisture >5% increases MIE multiplicatively.
 * O2 depletion increases MIE: ×2 at 15% O2, ×5 at 12% O2 (Eckhoff approximation)
 *
 * @param particle_size_um - Median particle diameter in µm / Diâmetro mediano de partícula em µm
 * @param moisture_pct - Moisture content in % / Teor de umidade em %
 * @param oxygen_pct - Oxygen concentration in % / Concentração de oxigênio em %
 */
function validateMIENumbers(
    particle_size_um: number,
    moisture_pct: number,
    oxygen_pct: number,
): void {
    if (typeof particle_size_um !== 'number' || typeof moisture_pct !== 'number' || typeof oxygen_pct !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (particle_size_um <= 0) throw new RangeError('particle_size_um must be > 0');
    if (moisture_pct < 0 || moisture_pct > 100) throw new RangeError('moisture_pct must be 0–100');
    if (oxygen_pct <= 0 || oxygen_pct > 100) throw new RangeError('oxygen_pct must be 0–100');
}

function applyParticleSizeFactor(particle_size_um: number, mie_mJ: number): number {
    if (particle_size_um < 10) {
        return mie_mJ * 0.05; // 95% reduction — ultrafinas são extremamente sensíveis / ultrafine extremely sensitive
    }
    if (particle_size_um < 50) {
        return mie_mJ * 0.3; // 70% reduction — muito mais sensível / much more sensitive
    }
    if (particle_size_um < 100) {
        return mie_mJ * 0.6;
    }
    return mie_mJ;
}

function applyMoistureFactor(moisture_pct: number, mie_mJ: number): number {
    // Umidade reduz sensibilidade / Moisture reduces sensitivity
    if (moisture_pct > 5) {
        return mie_mJ * (1 + 0.1 * moisture_pct);
    }
    return mie_mJ;
}

function applyOxygenFactor(oxygen_pct: number, mie_mJ: number): number {
    // Depleção de oxigênio reduz sensibilidade de ignição / O2 depletion reduces ignition sensitivity
    if (oxygen_pct < 12) {
        return mie_mJ * 5;
    }
    if (oxygen_pct < 15) {
        return mie_mJ * 2;
    }
    return mie_mJ;
}

function classifyIgnitionSensitivity(mie_mJ: number): 'low' | 'moderate' | 'high' | 'very_high' {
    if (mie_mJ < 3) return 'very_high';
    if (mie_mJ < 10) return 'high';
    if (mie_mJ < 100) return 'moderate';
    return 'low';
}

export function computeMIE(
    particle_size_um: number,
    moisture_pct: number,
    oxygen_pct: number,
): { mie_mJ: number; ignition_sensitivity: 'low' | 'moderate' | 'high' | 'very_high' } {
    validateMIENumbers(particle_size_um, moisture_pct, oxygen_pct);

    let mie_mJ = 30; // baseline para poeira orgânica típica / baseline for typical organic dust
    mie_mJ = applyParticleSizeFactor(particle_size_um, mie_mJ);
    mie_mJ = applyMoistureFactor(moisture_pct, mie_mJ);
    mie_mJ = applyOxygenFactor(oxygen_pct, mie_mJ);
    mie_mJ = Number(mie_mJ.toFixed(2));

    return { mie_mJ, ignition_sensitivity: classifyIgnitionSensitivity(mie_mJ) };
}

/**
 * Determine if a dust concentration is within the explosive range.
 * Determina se uma concentração de poeira está dentro do intervalo explosivo.
 *
 * LEL (Lower Explosive Limit) for most organic dusts: 20–60 g/m³ (EN 14034-3).
 * The explosive range is defined as LEL × (1 ± explosive_range_pct/100).
 * Intervalo explosivo: LEL × (1 ± explosive_range_pct/100).
 * Safety margin > 0 means below LEL (safe); < 0 means within or above LEL (danger).
 *
 * @param dust_concentration_g_m3 - Measured dust concentration in g/m³ / Concentração medida em g/m³
 * @param explosive_range_pct - Width of explosive range in % / Largura do intervalo explosivo em %
 */
export function computeLEL(
    dust_concentration_g_m3: number,
    explosive_range_pct: number,
): { within_explosive_range: boolean; safety_margin: number } {
    if (typeof dust_concentration_g_m3 !== 'number' || typeof explosive_range_pct !== 'number') {
        throw new TypeError('Parameters must be numbers');
    }
    if (dust_concentration_g_m3 < 0) throw new RangeError('dust_concentration_g_m3 must be >= 0');
    if (explosive_range_pct < 0 || explosive_range_pct > 100) throw new RangeError('explosive_range_pct must be 0–100');

    // LEL de referência EN 14034-3 para poeiras orgânicas típicas / Reference LEL for typical organic dusts
    const LEL_ref = 30; // g/m³

    const lower_bound = LEL_ref * (1 - explosive_range_pct / 100);
    const upper_bound = LEL_ref * (1 + explosive_range_pct / 100);
    const within_explosive_range = dust_concentration_g_m3 >= lower_bound && dust_concentration_g_m3 <= upper_bound;

    // Margem de segurança positiva = abaixo do LEL (seguro) / Positive margin = below LEL (safe)
    const safety_margin = Number((lower_bound - dust_concentration_g_m3).toFixed(3));

    return { within_explosive_range, safety_margin };
}

/**
 * Assess ventilation requirement to dilute dust concentration below target level.
 * Avalia o requisito de ventilação para diluir a concentração de poeira abaixo do nível-alvo.
 *
 * Dilution: Q = E / C_target (massa gerada / concentração alvo)
 * Diluição: Q = E / C_target (mass generated / target concentration)
 * ACH = Q × 3600 / V
 *
 * @param room_volume_m3 - Room volume in m³ / Volume do ambiente em m³
 * @param dust_generation_rate_g_s - Dust generation rate in g/s / Taxa de geração de poeira em g/s
 * @param target_concentration_g_m3 - Target dust concentration in g/m³ / Concentração alvo em g/m³
 */
export function assessVentilationRequirement(
    room_volume_m3: number,
    dust_generation_rate_g_s: number,
    target_concentration_g_m3: number,
): { required_flow_m3_s: number; air_changes_h: number } {
    if (
        typeof room_volume_m3 !== 'number' ||
        typeof dust_generation_rate_g_s !== 'number' ||
        typeof target_concentration_g_m3 !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (room_volume_m3 <= 0) throw new RangeError('room_volume_m3 must be > 0');
    if (dust_generation_rate_g_s < 0) throw new RangeError('dust_generation_rate_g_s must be >= 0');
    if (target_concentration_g_m3 <= 0) throw new RangeError('target_concentration_g_m3 must be > 0');

    // Vazão necessária para manter concentração abaixo do alvo / Required flow to keep concentration below target
    const required_flow_m3_s = dust_generation_rate_g_s / target_concentration_g_m3;
    // Renovações de ar por hora / Air changes per hour
    const air_changes_h = (required_flow_m3_s * 3600) / room_volume_m3;

    return {
        required_flow_m3_s: Number(required_flow_m3_s.toFixed(4)),
        air_changes_h: Number(air_changes_h.toFixed(2)),
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const dustExplosionModelMeta = {
    name: 'dustExplosionModel',
    description: 'dustExplosionModel',
    category: 'analytics',
    familyTags: ['fire'],
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
