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
 * Marine Debris Fragmentation and Pollution Model
 *
 * Implements plastic fragmentation kinetics and ingestion risk estimation
 * for marine debris assessments in coastal and offshore environments.
 *
 * Academic references:
 *  - Andrady, A.L. (2011). Microplastics in the marine environment.
 *    Marine Pollution Bulletin, 62(8), 1596–1605.
 *    DOI:10.1016/j.marpolbul.2011.02.013
 *  - van Sebille, E. et al. (2015). A global inventory of small floating
 *    plastic debris. Environmental Research Letters, 10(12), 124006.
 *    DOI:10.1088/1748-9326/10/12/124006
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

/**
 * Calcula a taxa de fragmentação de plástico por exposição UV (foto-oxidação).
 * Modelo cinético de primeira ordem: tamanho reduz exponencialmente com tempo e UV.
 *
 * @param {number} initial_size_mm - Tamanho inicial do fragmento em mm (> 0)
 * @param {number} UV_index        - Índice UV ambiental (0–20)
 * @param {number} time_years      - Tempo de exposição em anos (≥ 0)
 * @returns {{ size_mm: number, fragments: number }}
 */
export function computePlasticFragmentationRate(
    initial_size_mm: number,
    UV_index: number,
    time_years: number,
): { size_mm: number; fragments: number } {
    if (typeof initial_size_mm !== 'number' || typeof UV_index !== 'number' || typeof time_years !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (initial_size_mm <= 0) {
        throw new RangeError('initial_size_mm must be > 0');
    }
    if (UV_index < 0 || UV_index > 20) {
        throw new RangeError('UV_index must be between 0 and 20');
    }
    if (time_years < 0) {
        throw new RangeError('time_years must be >= 0');
    }

    // Taxa de fragmentação: k = 0.015 × UV_index (Andrady 2011, eq. simplificada)
    const size_mm = initial_size_mm * Math.exp(-0.015 * UV_index * time_years);
    // Número de fragmentos proporcional ao cubo da relação de tamanho (conservação de volume)
    const fragments = Math.pow(initial_size_mm / Math.max(size_mm, 1e-12), 3);

    return { size_mm, fragments };
}

/**
 * Calcula a concentração de microplásticos por área marinha.
 * Converte massa de resíduos em partículas por km² com fator de fragmentação.
 *
 * @param {number} debris_mass_kg        - Massa de resíduos plásticos em kg (≥ 0)
 * @param {number} area_km2              - Área da superfície marinha em km² (> 0)
 * @param {number} fragmentation_factor  - Fator de fragmentação (partículas/g) (> 0)
 * @returns {{ concentration_particles_km2: number }}
 */
export function computeMicroplasticConcentration(
    debris_mass_kg: number,
    area_km2: number,
    fragmentation_factor: number,
): { concentration_particles_km2: number } {
    if (
        typeof debris_mass_kg !== 'number' ||
        typeof area_km2 !== 'number' ||
        typeof fragmentation_factor !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (debris_mass_kg < 0) {
        throw new RangeError('debris_mass_kg must be >= 0');
    }
    if (area_km2 <= 0) {
        throw new RangeError('area_km2 must be > 0');
    }
    if (fragmentation_factor <= 0) {
        throw new RangeError('fragmentation_factor must be > 0');
    }

    // Conversão kg → g: × 1000; concentração = massa_g × fator / área
    const concentration_particles_km2 = (debris_mass_kg * 1000 * fragmentation_factor) / area_km2;

    return { concentration_particles_km2 };
}

/**
 * Estima a ingestão diária de microplásticos por organismos filtradores.
 * Modelo de exposição baseado em volume filtrado (van Sebille 2015).
 *
 * @param {number} concentration_particles_km2  - Concentração (partículas/km²)
 * @param {number} filter_feeding_volume_m3_day  - Volume filtrado por dia em m³ (> 0)
 * @returns {{ particles_ingested_day: number }}
 */
export function computeIngestionRisk(
    concentration_particles_km2: number,
    filter_feeding_volume_m3_day: number,
): { particles_ingested_day: number } {
    if (typeof concentration_particles_km2 !== 'number' || typeof filter_feeding_volume_m3_day !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (concentration_particles_km2 < 0) {
        throw new RangeError('concentration_particles_km2 must be >= 0');
    }
    if (filter_feeding_volume_m3_day <= 0) {
        throw new RangeError('filter_feeding_volume_m3_day must be > 0');
    }

    // Conversão km² → m²: 1 km² = 1e6 m²; partículas/m² = concentration × 1e-6
    // Ingestão = (partículas/m²) × volume_m3 [profundidade de mistura normalizada = 1 m]
    const particles_ingested_day = concentration_particles_km2 * 1e-6 * filter_feeding_volume_m3_day;

    return { particles_ingested_day };
}

/**
 * Classifica o nível de poluição por detritos marinhos com base na concentração.
 * Escala de referência para gestão ambiental costeira.
 *
 * @param {number} concentration_particles_km2 - Concentração (partículas/km²) (≥ 0)
 * @returns {{ level: 'pristine'|'low'|'moderate'|'high'|'extreme' }}
 */
export function classifyMarineDebrisPollution(concentration_particles_km2: number): {
    level: 'pristine' | 'low' | 'moderate' | 'high' | 'extreme';
} {
    if (typeof concentration_particles_km2 !== 'number') {
        throw new TypeError('concentration_particles_km2 must be a number');
    }
    if (concentration_particles_km2 < 0) {
        throw new RangeError('concentration_particles_km2 must be >= 0');
    }

    let level: 'pristine' | 'low' | 'moderate' | 'high' | 'extreme';
    if (concentration_particles_km2 < 100) {
        level = 'pristine';
    } else if (concentration_particles_km2 < 10000) {
        level = 'low';
    } else if (concentration_particles_km2 < 100000) {
        level = 'moderate';
    } else if (concentration_particles_km2 < 1e6) {
        level = 'high';
    } else {
        level = 'extreme';
    }

    return { level };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const marineDebrisModelMeta: AnalyticsModuleMeta = {
    name: 'marineDebrisModel',
    description: 'marineDebrisModel',
    category: 'analytics',
    familyTags: ['coastal'],
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
