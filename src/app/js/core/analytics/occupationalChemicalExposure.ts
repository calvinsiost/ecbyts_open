// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Occupational Chemical Exposure - Pure analytical module
// Exposição química ocupacional - módulo analítico puro sem dependências de DOM/IDB/fetch
//
// References / Referências:
//   ACGIH (2024) TLVs and BEIs: Threshold Limit Values for Chemical Substances and
//     Physical Agents & Biological Exposure Indices. American Conference of Governmental
//     Industrial Hygienists. Cincinnati, OH.
//   NIOSH (2024) Pocket Guide to Chemical Hazards. DHHS (NIOSH) Publication No. 2010-168.
//   OSHA 29 CFR 1910.1000 - Air Contaminants, Table Z-1 Permissible Exposure Limits.
//   MTE Portaria 3214/1978 NR-15 Anexo 11 - Limites de Tolerância para Substâncias Químicas
//     (Brasília, atualizada 2019).
//   ABNT NBR 14725:2023 - Produtos químicos — Ficha de Informações de Segurança de
//     Produto Químico (FISPQ/SDS).

'use strict';

// Valores TLV-STEL internos para substâncias comuns (ACGIH 2024)
// Internal TLV-STEL lookup for common occupational chemicals (ACGIH 2024, ppm)
/** @type {Record<string, number>} */
const TLV_STEL_TABLE = {
    benzeno: 0.5, // ACGIH A1 carcinogen — STEL extremely low
    tolueno: 150,
    xileno: 150,
    estireno: 50,
    acetona: 750,
    hexano: 50,
    etanol: 1000,
    cloroformio: 10,
};

/**
 * Compute Time-Weighted Average (TWA) exposure over a work shift.
 * Calcula a Concentração Média Ponderada no Tempo (CMPT/TWA) para turno de 8h.
 *
 * TWA = Σ(Ci × Ti) / 480  [ppm]
 * Denominador fixo em 480 min (jornada padrão de 8h - ACGIH, OSHA, NR-15)
 *
 * @param {{ concentration_ppm: number, duration_min: number }[]} measurements
 *   Array of concentration + duration pairs measured during the shift
 * @returns {{ twa_ppm: number }}
 */
export function computeTWA(measurements: any) {
    if (!Array.isArray(measurements) || measurements.length === 0) {
        throw new TypeError('measurements must be a non-empty array');
    }

    let total_duration = 0;
    let weighted_sum = 0;

    for (let i = 0; i < measurements.length; i++) {
        const m = measurements[i];
        if (typeof m.concentration_ppm !== 'number' || typeof m.duration_min !== 'number') {
            throw new TypeError(`measurements[${i}]: concentration_ppm and duration_min must be numbers`);
        }
        if (m.concentration_ppm < 0) throw new RangeError(`measurements[${i}].concentration_ppm must be >= 0`);
        if (m.duration_min < 0) throw new RangeError(`measurements[${i}].duration_min must be >= 0`);

        total_duration += m.duration_min;
        weighted_sum += m.concentration_ppm * m.duration_min;
    }

    if (total_duration === 0) {
        throw new RangeError('Total duration of measurements must be > 0');
    }

    // TWA normalizado para 480 min (8h) - jornada padrão ACGIH/NR-15
    // TWA normalized to 480 min (8-hour standard shift)
    const twa_ppm = weighted_sum / 480;
    return { twa_ppm };
}

/**
 * Evaluate a short-term exposure measurement against TLV-STEL criteria.
 * Avalia medição de curta duração contra TLV-STEL (ACGIH 2024).
 *
 * STEL = concentração medida durante até 15 minutos consecutivos
 * Exceedance se peak_concentration > TLV-STEL do composto
 *
 * @param {number} peak_concentration_ppm - Peak concentration measured (ppm)
 * @param {number} exposure_minutes       - Duration of peak exposure (min), must be in (0, 15]
 * @param {string} chemical_name          - Chemical name (lookup key in internal table)
 * @returns {{ stel_ppm: number, exceedance: boolean, tlv_stel: number }}
 */
export function computeSTEL(peak_concentration_ppm: any, exposure_minutes: any, chemical_name: any) {
    if (typeof peak_concentration_ppm !== 'number') throw new TypeError('peak_concentration_ppm must be a number');
    if (typeof exposure_minutes !== 'number') throw new TypeError('exposure_minutes must be a number');
    if (typeof chemical_name !== 'string') throw new TypeError('chemical_name must be a string');
    if (peak_concentration_ppm < 0) throw new RangeError('peak_concentration_ppm must be >= 0');
    if (exposure_minutes <= 0 || exposure_minutes > 15) {
        throw new RangeError('exposure_minutes must be in (0, 15] — STEL is a 15-minute measurement');
    }

    const key = chemical_name.toLowerCase().replace(/\s+/g, '');
const tlv_stel = (TLV_STEL_TABLE as Record<string, number>)[key];
    if (tlv_stel === undefined) {
        throw new TypeError(
            `chemical_name '${chemical_name}' not found in internal table. Available: ${Object.keys(TLV_STEL_TABLE).join(', ')}`,
        );
    }

    // STEL = concentração de pico × (duração / 15min) - normalizado para 15 minutos
    // STEL normalized to 15-minute reference period (ACGIH definition)
    const stel_ppm = peak_concentration_ppm * (exposure_minutes / 15);
    const exceedance = stel_ppm > tlv_stel;

    return { stel_ppm, exceedance, tlv_stel };
}

/**
 * Compute mixture hazard index for combined chemical exposures (additivity model).
 * Calcula índice de mistura para exposições combinadas - modelo aditivo ACGIH.
 *
 * IM = Σ(TWAi / TLVi)
 * IM > 1 indica superação do limite para a mistura (ACGIH aditividade)
 *
 * @param {{ twa_ppm: number, tlv_ppm: number }[]} components
 *   Array of measured TWA and corresponding TLV for each component
 * @returns {{ mixture_index: number, hazardous: boolean }}
 */
export function computeMixtureIndex(components: any) {
    if (!Array.isArray(components) || components.length === 0) {
        throw new TypeError('components must be a non-empty array');
    }

    let mixture_index = 0;

    for (let i = 0; i < components.length; i++) {
        const c = components[i];
        if (typeof c.twa_ppm !== 'number' || typeof c.tlv_ppm !== 'number') {
            throw new TypeError(`components[${i}]: twa_ppm and tlv_ppm must be numbers`);
        }
        if (c.twa_ppm < 0) throw new RangeError(`components[${i}].twa_ppm must be >= 0`);
        if (c.tlv_ppm <= 0) throw new RangeError(`components[${i}].tlv_ppm must be > 0`);

        // Parcela de cada componente no índice de mistura
        mixture_index += c.twa_ppm / c.tlv_ppm;
    }

    // Mistura perigosa se IM > 1 (ACGIH - modelo de aditividade de efeito)
    const hazardous = mixture_index > 1;
    return { mixture_index, hazardous };
}

/**
 * Classify occupational exposure risk combining airborne and biological monitoring.
 * Classifica risco de exposição ocupacional combinando monitoramento ambiental e biológico.
 *
 * Risk levels:
 *   'acceptable'  - TWA < TLV AND BM < BL (margem positiva)
 *   'caution'     - TWA ∈ [0.5, 1.0] × TLV OR BM ∈ [0.5, 1.0] × BL
 *   'overexposure'- TWA > TLV OR BM > BL
 *   'critical'    - TWA > 3 × TLV (risco imediato - zona de perigo NIOSH IDLH proxy)
 *
 * @param {number} twa_ppm                    - Measured TWA (ppm)
 * @param {number} tlv_twa_ppm                - TLV-TWA for the chemical (ppm), must be > 0
 * @param {number} biological_monitoring_result - BEI result (any consistent unit)
 * @param {number} biological_limit           - BEI limit (same unit as result), must be > 0
 * @returns {{ risk: string, action_required: boolean, margin_pct: number }}
 */
export function classifyExposureRisk(twa_ppm: any, tlv_twa_ppm: any, biological_monitoring_result: any, biological_limit: any) {
    if ([twa_ppm, tlv_twa_ppm, biological_monitoring_result, biological_limit].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (twa_ppm < 0) throw new RangeError('twa_ppm must be >= 0');
    if (tlv_twa_ppm <= 0) throw new RangeError('tlv_twa_ppm must be > 0');
    if (biological_monitoring_result < 0) throw new RangeError('biological_monitoring_result must be >= 0');
    if (biological_limit <= 0) throw new RangeError('biological_limit must be > 0');

    const air_ratio = twa_ppm / tlv_twa_ppm;
    const bio_ratio = biological_monitoring_result / biological_limit;

    // Margem de segurança em relação ao TLV-TWA (positiva = abaixo do limite)
    // Safety margin relative to TLV-TWA (positive means below limit)
    const margin_pct = (1 - air_ratio) * 100;

    let risk;
    if (air_ratio > 3) {
        risk = 'critical'; // Acima de 3× TLV — risco imediato (proxy NIOSH IDLH)
    } else if (air_ratio > 1 || bio_ratio > 1) {
        risk = 'overexposure';
    } else if (air_ratio > 0.5 || bio_ratio > 0.5) {
        risk = 'caution'; // Zona de alerta — 50-100% do limite
    } else {
        risk = 'acceptable';
    }

    const action_required = risk !== 'acceptable';
    return { risk, action_required, margin_pct };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const occupationalChemicalExposureMeta = {
    name: 'occupationalChemicalExposure',
    description: 'occupationalChemicalExposure',
    category: 'analytics',
    familyTags: ['chemical', 'occupational'],
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
