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
 * @module mineAirQuality
 * Avaliação da qualidade do ar em minas subterrâneas e a céu aberto.
 * Cobre DPM (diesel particulate matter), fumaça de detonação (CO),
 * poeira respirável e classificação geral de qualidade do ar.
 *
 * Referências acadêmicas:
 * - NIOSH DHHS Publication No. 2012-101 (Diesel Particulate Matter in Mines, 2012)
 * - Brnich, M.J. (2011). Evaluation of Mine Blast Fume Hazard.
 *   DOI:10.26616/NIOSHPUB2011191
 * - MSHA Final Rule on Diesel Particulate Matter (30 CFR Part 57), 2016
 * - ACGIH TLV-TWA para quartzo cristalino respirável: 0.025 mg/m³ (2024)
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

const SECONDS_PER_HOUR = 3600;
const LITERS_PER_M3 = 1000;
// eslint-disable-next-line
const MW_CO = 28; // Massa molar do CO (g/mol)
// eslint-disable-next-line
const MOLAR_VOLUME = 22.4; // Volume molar a 0°C, 1 atm (L/mol)

/**
 * Calcula a concentração de material particulado de diesel (DPM) no ar da mina.
 * DPM (mg/m³) = (potência_kW × fator_emissão_mg_kWh) / (ventilação_m3_s × 3600)
 *
 * @param diesel_kW           - Potência do motor diesel (kW), > 0
 * @param emission_factor_mg_kWh - Fator de emissão de DPM (mg/kWh), > 0; típico 450 mg/kWh
 * @param ventilation_m3_s    - Vazão de ventilação (m³/s), > 0
 * @returns Concentração de DPM (mg/m³)
 */
export function computeDieselParticulateMatter(
    diesel_kW: number,
    emission_factor_mg_kWh: number,
    ventilation_m3_s: number,
): { DPM_mg_m3: number } {
    if (
        typeof diesel_kW !== 'number' ||
        typeof emission_factor_mg_kWh !== 'number' ||
        typeof ventilation_m3_s !== 'number'
    ) {
        throw new TypeError('computeDieselParticulateMatter: todos os parâmetros devem ser números');
    }
    if (diesel_kW <= 0) throw new RangeError('computeDieselParticulateMatter: diesel_kW deve ser > 0');
    if (emission_factor_mg_kWh <= 0)
        throw new RangeError('computeDieselParticulateMatter: emission_factor_mg_kWh deve ser > 0');
    if (ventilation_m3_s <= 0) throw new RangeError('computeDieselParticulateMatter: ventilation_m3_s deve ser > 0');

    // Taxa de emissão de DPM (mg/s): potência × fator / 3600
    const emission_rate_mg_s = (diesel_kW * emission_factor_mg_kWh) / SECONDS_PER_HOUR;
    // Concentração em equilíbrio (mg/m³)
    const DPM_mg_m3 = emission_rate_mg_s / ventilation_m3_s;
    return { DPM_mg_m3 };
}

/**
 * Calcula a concentração de CO proveniente de fumaça de detonação.
 * CO_total_L = explosivo_kg × CO_factor_L_kg
 * CO_ppm = CO_total / (volume_m3 + ventilação×tempo_s) × 1e6/22.4 × 28
 *
 * @param explosive_kg      - Massa de explosivo detonado (kg), > 0
 * @param CO_factor_L_kg    - Fator de produção de CO (L/kg explosivo), > 0; típico 40 L/kg ANFO
 * @param volume_m3         - Volume da área confinada (m³), > 0
 * @param ventilation_m3_s  - Vazão de ventilação (m³/s), >= 0
 * @param exposure_time_min - Tempo de exposição (min), > 0
 * @returns Concentração de CO (ppm volumétrico)
 */
export function computeBlastingFumeConcentration(
    explosive_kg: number,
    CO_factor_L_kg: number,
    volume_m3: number,
    ventilation_m3_s: number,
    exposure_time_min: number,
): { CO_ppm: number } {
    if (
        typeof explosive_kg !== 'number' ||
        typeof CO_factor_L_kg !== 'number' ||
        typeof volume_m3 !== 'number' ||
        typeof ventilation_m3_s !== 'number' ||
        typeof exposure_time_min !== 'number'
    ) {
        throw new TypeError('computeBlastingFumeConcentration: todos os parâmetros devem ser números');
    }
    if (explosive_kg <= 0) throw new RangeError('computeBlastingFumeConcentration: explosive_kg deve ser > 0');
    if (CO_factor_L_kg <= 0) throw new RangeError('computeBlastingFumeConcentration: CO_factor_L_kg deve ser > 0');
    if (volume_m3 <= 0) throw new RangeError('computeBlastingFumeConcentration: volume_m3 deve ser > 0');
    if (ventilation_m3_s < 0) throw new RangeError('computeBlastingFumeConcentration: ventilation_m3_s deve ser >= 0');
    if (exposure_time_min <= 0)
        throw new RangeError('computeBlastingFumeConcentration: exposure_time_min deve ser > 0');

    // CO total gerado (L)
    const CO_total_L = explosive_kg * CO_factor_L_kg;
    // Volume efetivo considerando ventilação durante tempo de exposição (m³ → L)
    const exposure_time_s = exposure_time_min * 60;
    const effective_volume_L = (volume_m3 + ventilation_m3_s * exposure_time_s) * LITERS_PER_M3;
    // Fração volumétrica de CO, convertida para ppm
    // ppm = (CO_L / V_L) × 1e6; fator MW/molar_vol para converter L→mg é opcional aqui (ppm volumétrico)
    const CO_ppm = (CO_total_L / effective_volume_L) * 1e6;
    return { CO_ppm };
}

/**
 * Calcula a concentração de poeira respirável a partir da poeira total.
 * RD = total_dust × respirable_fraction
 *
 * @param total_dust_mg_m3    - Concentração de poeira total (mg/m³), >= 0
 * @param respirable_fraction - Fração respirável (0–1); típico 0.25 para quartzo
 * @returns Poeira respirável (mg/m³)
 */
export function computeRespirableDust(
    total_dust_mg_m3: number,
    respirable_fraction: number,
): { respirable_mg_m3: number } {
    if (typeof total_dust_mg_m3 !== 'number' || typeof respirable_fraction !== 'number') {
        throw new TypeError('computeRespirableDust: parâmetros devem ser números');
    }
    if (total_dust_mg_m3 < 0) throw new RangeError('computeRespirableDust: total_dust_mg_m3 deve ser >= 0');
    if (respirable_fraction < 0 || respirable_fraction > 1) {
        throw new RangeError('computeRespirableDust: respirable_fraction deve estar em [0, 1]');
    }
    const respirable_mg_m3 = total_dust_mg_m3 * respirable_fraction;
    return { respirable_mg_m3 };
}

/**
 * Classifica a qualidade do ar da mina segundo limites MSHA/NIOSH.
 * DPM (mg/m³): <0.02=aceitável, <0.10=nível de ação, <0.16=limite de exposição, ≥0.16=emergência
 * CO (ppm): <25=aceitável, <50=nível de ação, <200=limite de exposição, ≥200=emergência (ACGIH TLV-TWA=25 ppm)
 * Poeira respirável (mg/m³): <0.025=aceitável, <0.05=ação, <0.1=limite, ≥0.1=emergência (ACGIH TLV-TWA=0.025)
 *
 * @param DPM_mg_m3          - Concentração DPM (mg/m³), >= 0
 * @param CO_ppm             - Concentração CO (ppm), >= 0
 * @param respirable_dust_mg_m3 - Poeira respirável (mg/m³), >= 0
 */
export function classifyMineAirQuality(
    DPM_mg_m3: number,
    CO_ppm: number,
    respirable_dust_mg_m3: number,
): { quality: 'acceptable' | 'action_level' | 'exposure_limit' | 'emergency' } {
    if (typeof DPM_mg_m3 !== 'number' || typeof CO_ppm !== 'number' || typeof respirable_dust_mg_m3 !== 'number') {
        throw new TypeError('classifyMineAirQuality: todos os parâmetros devem ser números');
    }
    if (DPM_mg_m3 < 0) throw new RangeError('classifyMineAirQuality: DPM_mg_m3 deve ser >= 0');
    if (CO_ppm < 0) throw new RangeError('classifyMineAirQuality: CO_ppm deve ser >= 0');
    if (respirable_dust_mg_m3 < 0) throw new RangeError('classifyMineAirQuality: respirable_dust_mg_m3 deve ser >= 0');

    // Classificação é o pior entre os três poluentes (abordagem conservadora)
    function _classify(value: number, thresholds: number[]): number {
        if (value >= thresholds[2]!) return 3; // emergency
        if (value >= thresholds[1]!) return 2; // exposure_limit
        if (value >= thresholds[0]!) return 1; // action_level
        return 0; // acceptable
    }

    const LABELS = ['acceptable', 'action_level', 'exposure_limit', 'emergency'] as const;
    const dpm_level = _classify(DPM_mg_m3, [0.02, 0.1, 0.16]);
    const co_level = _classify(CO_ppm, [25, 50, 200]);
    const dust_level = _classify(respirable_dust_mg_m3, [0.025, 0.05, 0.1]);

    const worst = Math.max(dpm_level, co_level, dust_level) as 0 | 1 | 2 | 3;
    return { quality: LABELS[worst] };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineAirQualityMeta: AnalyticsModuleMeta = {
    name: 'mineAirQuality',
    description: 'mineAirQuality',
    category: 'analytics',
    familyTags: ['air', 'mining'],
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
