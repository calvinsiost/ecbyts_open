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
 * Stream Power Erosion Index - Bagnold (1966) + Lotspeich (1980)
 *
 * Quantifica o potencial erosivo de canais fluviais por meio da potência de
 * fluxo (stream power), usada em modelos de transporte de sedimentos e
 * avaliações de erosão de margens em estudos ambientais.
 *
 * Referências:
 *   Bagnold, R.A. (1966). An approach to the sediment transport problem from
 *     general physics. USGS Professional Paper 422-I.
 *   Lotspeich, F.B. (1980). Watersheds as the basic ecosystem.
 *     J. Soil Water Conserv. 35(3): 108-111.
 *   Bull, W.B. (1979). Threshold of critical power in streams.
 *     Progress in Physical Geography 3(4): 462-487.
 *     DOI:10.1177/030913337900300401
 *
 * @module streamPowerErosionIndex
 */

'use strict';

interface StreamPowerResult { streamPower_W_per_m: number }
interface UnitStreamPowerResult { unitStreamPower_W_per_m2: number }
interface BagnoldResult { bedloadTransport_kg_per_s_per_m: number }

/** Peso específico da água pura a 20°C [N/m³] */
const GAMMA_WATER_DEFAULT = 9810;

/**
 * Calcula Stream Power total (Ω) - potência por unidade de comprimento do canal.
 * Ω = γ × Q × S   [W/m]
 *
 * @param {number} discharge_m3_s - Vazão (m³/s)
 * @param {number} slope          - Declividade do canal (m/m, adimensional)
 * @param {number} [gamma_water]  - Peso específico da água (N/m³); padrão 9810
 * @returns {{ streamPower_W_per_m: number }}
 */
export function calcStreamPower(discharge_m3_s: number, slope: number, gamma_water: number = GAMMA_WATER_DEFAULT): StreamPowerResult {
    if (!Number.isFinite(discharge_m3_s) || discharge_m3_s < 0) {
        throw new RangeError(`discharge_m3_s deve ser >= 0, recebido: ${discharge_m3_s}`);
    }
    if (!Number.isFinite(slope) || slope < 0) {
        throw new RangeError(`slope deve ser >= 0, recebido: ${slope}`);
    }
    if (!Number.isFinite(gamma_water) || gamma_water <= 0) {
        throw new RangeError(`gamma_water deve ser > 0, recebido: ${gamma_water}`);
    }
    const streamPower_W_per_m = gamma_water * discharge_m3_s * slope;
    return { streamPower_W_per_m };
}

/**
 * Calcula Unit Stream Power (ω) - potência por unidade de área do leito.
 * ω = Ω / w   [W/m²]
 *
 * @param {number} streamPower_W_per_m - Stream power total (W/m)
 * @param {number} width_m             - Largura do canal (m)
 * @returns {{ unitStreamPower_W_per_m2: number }}
 */
export function calcUnitStreamPower(streamPower_W_per_m: number, width_m: number): UnitStreamPowerResult {
    if (!Number.isFinite(streamPower_W_per_m) || streamPower_W_per_m < 0) {
        throw new RangeError(`streamPower_W_per_m deve ser >= 0, recebido: ${streamPower_W_per_m}`);
    }
    if (!Number.isFinite(width_m) || width_m <= 0) {
        throw new RangeError(`width_m deve ser > 0, recebido: ${width_m}`);
    }
    const unitStreamPower_W_per_m2 = streamPower_W_per_m / width_m;
    return { unitStreamPower_W_per_m2 };
}

/**
 * Calcula taxa de transporte de sedimento de fundo pelo modelo de Bagnold (1966).
 * qs = (Ω - Ωc) / (g × (ρs - ρ) / ρ)   - forma simplificada por potência excedente
 *
 * qs = (streamPower - criticalPower) / (sedimentDensity × 9.81)   [kg/s/m]
 *
 * @param {number} streamPower_W_per_m   - Stream power total (W/m)
 * @param {number} criticalPower_W_per_m - Potência crítica de limiar de transporte (W/m)
 * @param {number} sedimentDensity_kg_m3 - Densidade do sedimento (kg/m³); areia ~2650
 * @returns {{ bedloadTransport_kg_per_s_per_m: number }}
 */
export function calcBagnoldBedloadTransport(streamPower_W_per_m: number, criticalPower_W_per_m: number, sedimentDensity_kg_m3: number): BagnoldResult {
    if (!Number.isFinite(streamPower_W_per_m) || streamPower_W_per_m < 0) {
        throw new RangeError(`streamPower_W_per_m deve ser >= 0, recebido: ${streamPower_W_per_m}`);
    }
    if (!Number.isFinite(criticalPower_W_per_m) || criticalPower_W_per_m < 0) {
        throw new RangeError(`criticalPower_W_per_m deve ser >= 0, recebido: ${criticalPower_W_per_m}`);
    }
    if (!Number.isFinite(sedimentDensity_kg_m3) || sedimentDensity_kg_m3 <= 0) {
        throw new RangeError(`sedimentDensity_kg_m3 deve ser > 0, recebido: ${sedimentDensity_kg_m3}`);
    }

    const excessPower = Math.max(0, streamPower_W_per_m - criticalPower_W_per_m);
    const bedloadTransport_kg_per_s_per_m = excessPower / (sedimentDensity_kg_m3 * 9.81);
    return { bedloadTransport_kg_per_s_per_m };
}

/**
 * Classifica potencial erosivo do canal com base na potência unitária de fluxo.
 * Faixas derivadas de Bull (1979) e revisão de literatura para canais tropicais:
 *
 *   low       : ω < 10   W/m²
 *   moderate  : ω < 50   W/m²
 *   high      : ω < 200  W/m²
 *   very_high : ω < 1000 W/m²
 *   extreme   : ω ≥ 1000 W/m²
 *
 * @param {number} unitStreamPower_W_m2 - Potência unitária do fluxo (W/m²)
 * @returns {'low'|'moderate'|'high'|'very_high'|'extreme'}
 */
export function classifyErosionPotential(unitStreamPower_W_m2: number): 'low' | 'moderate' | 'high' | 'very_high' | 'extreme' {
    if (!Number.isFinite(unitStreamPower_W_m2) || unitStreamPower_W_m2 < 0) {
        throw new RangeError(`unitStreamPower_W_m2 deve ser >= 0, recebido: ${unitStreamPower_W_m2}`);
    }
    if (unitStreamPower_W_m2 < 10) return 'low';
    if (unitStreamPower_W_m2 < 50) return 'moderate';
    if (unitStreamPower_W_m2 < 200) return 'high';
    if (unitStreamPower_W_m2 < 1000) return 'very_high';
    return 'extreme';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const streamPowerErosionIndexMeta = {
    name: 'streamPowerErosionIndex',
    description: 'streamPowerErosionIndex',
    category: 'analytics',
    familyTags: ['river', 'erosion'],
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
