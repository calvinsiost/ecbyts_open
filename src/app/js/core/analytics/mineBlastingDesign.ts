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
 * Mine Blasting Design Module
 *
 * Funções para projeto de desmonte a fogo em mineração a céu aberto.
 * Calcula cargas específicas, padrões de perfuração, vibração do terreno
 * e classificação de risco de danos estruturais.
 *
 * References:
 *  - Langefors U. & Kihlstrom B. (1978). The Modern Technique of Rock Blasting.
 *    ISBN: 9780470150887
 *  - Holmberg R. & Persson P.A. (1979). Design of tunnel perimeter blasthole
 *    patterns to prevent rock damage. Tunnelling '79, IMM, London.
 *    DOI: 10.1016/0148-9062(79)90013-8
 *  - DIN 4150-3 (1999). Erschütterungen im Bauwesen - Teil 3: Einwirkungen auf
 *    bauliche Anlagen. Deutsches Institut für Normung.
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
 * Limites de PPV (mm/s) por tipo de estrutura e categoria de dano.
 * Fonte: DIN 4150-3 (1999).
 * Estrutura → [seguro, limiar, dano_leve, dano_grave] em mm/s.
 */
/** @type {Record<string, number[]>} */
const PPV_LIMITS_MM_S: Record<string, number[]> = {
    residential: [2, 5, 15, 50],
    industrial: [10, 25, 50, 100],
    historic: [1, 2.5, 5, 10],
};

/**
 * Calcula a carga específica de explosivo (powder factor).
 * Carga específica = massa de explosivo / volume de rocha desmontada.
 * Valores típicos para rocha em mineração: 0.2–0.8 kg/m³.
 *
 * @param {number} explosive_kg    Massa total de explosivo utilizado (kg).
 * @param {number} rock_volume_m3  Volume de rocha a desmontar (m³).
 * @returns {{ q_kg_m3: number }} Carga específica em kg/m³.
 * @throws {TypeError} Se os argumentos não forem números.
 * @throws {RangeError} Se forem não-positivos.
 */
export function computeSpecificCharge(explosive_kg: number, rock_volume_m3: number): { q_kg_m3: number } {
    if (typeof explosive_kg !== 'number' || typeof rock_volume_m3 !== 'number') {
        throw new TypeError('explosive_kg and rock_volume_m3 must be numbers');
    }
    if (explosive_kg <= 0) throw new RangeError('explosive_kg must be > 0');
    if (rock_volume_m3 <= 0) throw new RangeError('rock_volume_m3 must be > 0');

    return { q_kg_m3: explosive_kg / rock_volume_m3 };
}

/**
 * Calcula parâmetros do padrão de perfuração e o powder factor por furo.
 * Volume por furo = burden × spacing × bench_height.
 * Massa de explosivo por furo estimada pela coluna de carga no diâmetro dado.
 *
 * @param {number} burden_m          Burden (distância à face livre) em metros.
 * @param {number} spacing_m         Espaçamento entre furos na fileira (metros).
 * @param {number} bench_height_m    Altura da bancada (metros).
 * @param {number} hole_diameter_mm  Diâmetro do furo de perfuração (mm).
 * @returns {{ volume_per_hole_m3: number, powder_factor: number }}
 * @throws {TypeError} Se qualquer argumento não for número.
 * @throws {RangeError} Se valores forem não-positivos.
 */
export function computeBlastingPattern(
    burden_m: number,
    spacing_m: number,
    bench_height_m: number,
    hole_diameter_mm: number,
): { volume_per_hole_m3: number; powder_factor: number } {
    if (
        typeof burden_m !== 'number' ||
        typeof spacing_m !== 'number' ||
        typeof bench_height_m !== 'number' ||
        typeof hole_diameter_mm !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (burden_m <= 0) throw new RangeError('burden_m must be > 0');
    if (spacing_m <= 0) throw new RangeError('spacing_m must be > 0');
    if (bench_height_m <= 0) throw new RangeError('bench_height_m must be > 0');
    if (hole_diameter_mm <= 0) throw new RangeError('hole_diameter_mm must be > 0');

    const volume_per_hole_m3 = burden_m * spacing_m * bench_height_m;

    // Massa estimada de explosivo por metro de coluna: densidade ANFO ~850 kg/m³
    const hole_radius_m = hole_diameter_mm / 1000 / 2;
    const explosive_density_kg_m3 = 850; // ANFO típico
    const charge_length_m = bench_height_m * 0.7; // coluna = 70% da altura (subdrilling + stemming)
    const explosive_per_hole_kg = Math.PI * hole_radius_m * hole_radius_m * charge_length_m * explosive_density_kg_m3;

    const powder_factor = explosive_per_hole_kg / volume_per_hole_m3;

    return { volume_per_hole_m3, powder_factor };
}

/**
 * Calcula a Velocidade de Pico de Partícula (PPV) usando a lei da Distância Escalada.
 * PPV = K × (D / sqrt(W))^(-n)
 * onde D = distância (m), W = carga por intervalo de retardo (kg), K e n = constantes do sítio.
 *
 * @param {number} charge_kg        Carga máxima por intervalo de retardo (kg).
 * @param {number} distance_m       Distância do ponto de detonação ao receptor (m).
 * @param {number} site_constant_K  Constante K do sítio (site-specific, típico 100–1000).
 * @param {number} attenuation_n    Expoente de atenuação n (típico 1.5–2.5).
 * @returns {{ PPV_mm_s: number }} Velocidade de pico de partícula em mm/s.
 * @throws {TypeError} Se qualquer argumento não for número.
 * @throws {RangeError} Se valores forem não-positivos.
 */
export function computeGroundVibration(
    charge_kg: number,
    distance_m: number,
    site_constant_K: number,
    attenuation_n: number,
): { PPV_mm_s: number } {
    if (
        typeof charge_kg !== 'number' ||
        typeof distance_m !== 'number' ||
        typeof site_constant_K !== 'number' ||
        typeof attenuation_n !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (charge_kg <= 0) throw new RangeError('charge_kg must be > 0');
    if (distance_m <= 0) throw new RangeError('distance_m must be > 0');
    if (site_constant_K <= 0) throw new RangeError('site_constant_K must be > 0');
    if (attenuation_n <= 0) throw new RangeError('attenuation_n must be > 0');

    const scaled_distance = distance_m / Math.sqrt(charge_kg);
    const PPV_mm_s = site_constant_K * Math.pow(scaled_distance, -attenuation_n);

    return { PPV_mm_s };
}

/**
 * Classifica o risco de dano estrutural por vibração de desmonte.
 * Baseado nos limites de PPV da norma DIN 4150-3 (1999).
 *
 * @param {number} PPV_mm_s      Velocidade de pico de partícula em mm/s.
 * @param {string} structure_type  Tipo de estrutura: 'residential', 'industrial' ou 'historic'.
 * @returns {{ risk: string }} Nível de risco: 'safe', 'threshold', 'minor_damage' ou 'major_damage'.
 * @throws {TypeError} Se PPV_mm_s não for número ou structure_type não for string.
 * @throws {RangeError} Se PPV_mm_s for negativo ou structure_type for inválido.
 */
export function classifyVibrationDamage(PPV_mm_s: number, structure_type: string): { risk: string } {
    if (typeof PPV_mm_s !== 'number') throw new TypeError('PPV_mm_s must be a number');
    if (typeof structure_type !== 'string') throw new TypeError('structure_type must be a string');
    if (PPV_mm_s < 0) throw new RangeError('PPV_mm_s must be >= 0');
    if (!PPV_LIMITS_MM_S[structure_type]) {
        throw new RangeError(
            `Invalid structure_type "${structure_type}". Valid: ${Object.keys(PPV_LIMITS_MM_S).join(', ')}`,
        );
    }

    const [safe, threshold, minor, major] = PPV_LIMITS_MM_S[structure_type] as [number, number, number, number];

    if (PPV_mm_s < safe) return { risk: 'safe' };
    if (PPV_mm_s < threshold) return { risk: 'threshold' };
    if (PPV_mm_s < minor) return { risk: 'minor_damage' };
    if (PPV_mm_s < major) return { risk: 'major_damage' };
    return { risk: 'major_damage' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineBlastingDesignMeta: AnalyticsModuleMeta = {
    name: 'mineBlastingDesign',
    description: 'mineBlastingDesign',
    category: 'analytics',
    familyTags: ['mining', 'blasting'],
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
