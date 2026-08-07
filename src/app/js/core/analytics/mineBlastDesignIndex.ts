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
 * Mine Blast Design Index
 * Parâmetros de projeto de detonação em mineração a céu aberto.
 *
 * Referências:
 *   Langefors & Kihlström (1978) The Modern Technique of Rock Blasting. ISBN 978-0-470-99282-0
 *   Holmberg & Persson (1979) SEEE Proc. Vol. 1: Design of Tunnel Perimeter Blasthole Charges.
 *   DIN 4150-3 (1999) Erschütterungen im Bauwesen - Einwirkungen auf bauliche Anlagen.
 */

/**
 * Calcula o burden ótimo pela equação de Langefors-Kihlström.
 * B = (d/33) × sqrt(ρ_e × RWS / (S_f × ρ_r))  (Langefors & Kihlström 1978, eq. 3.1)
 * Simplificado: B ≈ (d_mm / 1000) × c  onde c depende da razão de densidades.
 *
 * @param {number} holeDiam_mm       - Diâmetro do furo (mm)
 * @param {number} rockDensity       - Densidade da rocha (t/m³)
 * @param {number} explosiveDensity  - Densidade do explosivo (g/cm³)
 * @param {number} RWS               - Relative Weight Strength do explosivo (ANFO=100)
 * @returns {number} Burden ótimo (m)
 */
export function calcBurden(
    holeDiam_mm: number,
    rockDensity: number,
    explosiveDensity: number,
    RWS: number,
): number {
    if (
        typeof holeDiam_mm !== 'number' ||
        typeof rockDensity !== 'number' ||
        typeof explosiveDensity !== 'number' ||
        typeof RWS !== 'number'
    ) {
        throw new TypeError('calcBurden: todos os parâmetros devem ser números.');
    }
    if (holeDiam_mm <= 0 || rockDensity <= 0 || explosiveDensity <= 0 || RWS <= 0) {
        throw new RangeError('calcBurden: todos os parâmetros devem ser positivos.');
    }

    // Constante de fixação de rocha (kg/m³·m), valor referência médio Langefors
    const Sf = 0.4; // fator de fixação (c, fixação media)

    // d em metros
    // eslint-disable-next-line
    const d_m = holeDiam_mm / 1000;

    // B = (d / 33) * sqrt( (ρ_e * RWS) / (Sf * ρ_r) )
    // ρ_e em g/cm³ = t/m³ (numericamente iguais)
    const B = (holeDiam_mm / 33) * Math.sqrt((explosiveDensity * RWS) / (Sf * 1000 * rockDensity));

    // Limitar range plausível: 0.3 m a 20 m
    return Math.min(20, Math.max(0.3, B));
}

/**
 * Calcula o espaçamento entre furos.
 *
 * @param {number} burden_m - Burden calculado (m)
 * @param {'square'|'staggered'} pattern - Padrão de perfuração
 * @returns {number} Espaçamento (m)
 */
export function calcSpacing(burden_m: number, pattern: 'square' | 'staggered' = 'square'): number {
    if (typeof burden_m !== 'number' || burden_m <= 0) {
        throw new RangeError('calcSpacing: burden_m deve ser número positivo.');
    }
    if (pattern !== 'square' && pattern !== 'staggered') {
        throw new TypeError("calcSpacing: pattern deve ser 'square' ou 'staggered'.");
    }

    // Square: S = B (razão S/B = 1.0)
    // Staggered: S = 1.15 × B (Langefors & Kihlström 1978, recomendação)
    return pattern === 'square' ? burden_m : burden_m * 1.15;
}

/**
 * Calcula o fator de pólvora (powder factor).
 *
 * @param {number} explosiveMass_kg - Massa de explosivo por furo (kg)
 * @param {number} rockVolume_m3    - Volume de rocha detonada por furo (m³)
 * @returns {number} Fator de pólvora (kg/m³)
 */
export function calcPowderFactor(explosiveMass_kg: number, rockVolume_m3: number): number {
    if (typeof explosiveMass_kg !== 'number' || typeof rockVolume_m3 !== 'number') {
        throw new TypeError('calcPowderFactor: parâmetros devem ser números.');
    }
    if (explosiveMass_kg <= 0 || rockVolume_m3 <= 0) {
        throw new RangeError('calcPowderFactor: parâmetros devem ser positivos.');
    }

    return explosiveMass_kg / rockVolume_m3;
}

/**
 * Calcula a PPV (Peak Particle Velocity) pela lei de escalonamento de Holmberg-Persson (1979).
 * PPV = K × (Q^0.5 / R)^α   onde K=700, α=1.5 (parâmetros default de rocha dura)
 * Holmberg & Persson 1979 regressão padrão.
 *
 * @param {number} explosiveMass_kg - Massa de carga explosiva (kg)
 * @param {number} distance_m       - Distância ao ponto de interesse (m)
 * @returns {number} PPV em mm/s
 */
export function calcBlastDamageZone(explosiveMass_kg: number, distance_m: number): number {
    if (typeof explosiveMass_kg !== 'number' || typeof distance_m !== 'number') {
        throw new TypeError('calcBlastDamageZone: parâmetros devem ser números.');
    }
    if (explosiveMass_kg <= 0 || distance_m <= 0) {
        throw new RangeError('calcBlastDamageZone: parâmetros devem ser positivos.');
    }

    // Parâmetros de regressão de Holmberg-Persson para rocha dura (granito)
    const K = 700; // coeficiente de atenuação
    const alpha = 1.5; // expoente de atenuação

    // Scaled Distance = R / Q^0.5
    const SD = distance_m / Math.sqrt(explosiveMass_kg);

    // PPV = K × SD^(-α)
    const PPV = K * Math.pow(SD, -alpha);

    return PPV; // mm/s
}

/**
 * Classifica o risco de dano estrutural por vibração segundo DIN 4150-3 (1999).
 * Limites para edifícios residenciais (linha 1 da norma, frequência 1-10 Hz):
 *   safe:   PPV < 5 mm/s
 *   caution: 5 ≤ PPV < 20 mm/s
 *   damage: PPV ≥ 20 mm/s
 *
 * @param {number} PPV_mm_s - Pico de velocidade de partícula (mm/s)
 * @returns {'safe'|'caution'|'damage'}
 */
export function classifyBlastRisk(PPV_mm_s: number): 'safe' | 'caution' | 'damage' {
    if (typeof PPV_mm_s !== 'number' || PPV_mm_s < 0) {
        throw new RangeError('classifyBlastRisk: PPV_mm_s deve ser número não-negativo.');
    }

    if (PPV_mm_s < 5) return 'safe';
    if (PPV_mm_s < 20) return 'caution';
    return 'damage';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineBlastDesignIndexMeta = {
    name: 'mineBlastDesignIndex',
    description: 'mineBlastDesignIndex',
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
