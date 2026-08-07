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
 * Storm Surge Model - estimativa de elevação de maré meteorológica e
 * classificação de perigo costeiro.
 *
 * Referências:
 * Resio, D.T. & Westerink, J.J. (2008). Modeling the physics of storm surges.
 * Physics Today 61(9):33–38.
 * DOI: 10.1063/PT.3.2425
 *
 * Gumbel, E.J. (1958). Statistics of Extremes. Columbia University Press.
 * ISBN: 978-0-486-43604-3
 *
 * NOAA Technical Report NWS 48 - Storm Surge Climatology for the U.S. Gulf Coast
 */

const G = 9.81; // aceleração da gravidade (m/s²)

/**
 * Calcula a elevação da maré meteorológica (storm surge) pelo método empírico NOAA.
 *
 * Equação: surge = 0.005 × U² × F / (g × d)
 * onde U = velocidade do vento (m/s), F = fetch (m), d = profundidade (m)
 *
 * Baseado em Resio & Westerink (2008), adaptação do modelo empírico NOAA para
 * baías e estuários rasas.
 *
 * @param {number} wind_speed_m_s - Velocidade do vento (m/s, > 0)
 * @param {number} fetch_km       - Comprimento do pichão (km, > 0)
 * @param {number} water_depth_m  - Profundidade da água (m, > 0)
 * @returns {{ surge_m: number }} Elevação do nível d'água em metros
 * @throws {TypeError} se argumentos não forem números finitos
 * @throws {RangeError} se valores forem ≤ 0
 */
export function computeSurgeHeight(wind_speed_m_s: number, fetch_km: number, water_depth_m: number): { surge_m: number } {
    if (
        typeof wind_speed_m_s !== 'number' ||
        !isFinite(wind_speed_m_s) ||
        typeof fetch_km !== 'number' ||
        !isFinite(fetch_km) ||
        typeof water_depth_m !== 'number' ||
        !isFinite(water_depth_m)
    ) {
        throw new TypeError('wind_speed_m_s, fetch_km e water_depth_m devem ser números finitos');
    }
    if (wind_speed_m_s <= 0) throw new RangeError('wind_speed_m_s deve ser positivo');
    if (fetch_km <= 0) throw new RangeError('fetch_km deve ser positivo');
    if (water_depth_m <= 0) throw new RangeError('water_depth_m deve ser positivo');

    const fetch_m = fetch_km * 1000;
    const surge_m = (0.005 * wind_speed_m_s ** 2 * fetch_m) / (G * water_depth_m);
    return { surge_m };
}

/**
 * Estima a área de inundação costeira por geometria triangular simplificada.
 *
 * Modelo: a maré meteorológica avança terra adentro até a cota de equilíbrio.
 * Supõe perfil de praia com inclinação constante (coastal_slope = rise/run).
 * Extensão horizontal: X = (surge_m - baseline_elevation_m) / coastal_slope
 * Área do triângulo: A = 0.5 × X × surge_m (seção transversal × largura unitária)
 *
 * Para simplificação 2D, retorna área da seção transversal em m² por metro de frente costeira.
 *
 * @param {number} surge_m              - Elevação da maré meteorológica (m, ≥ 0)
 * @param {number} coastal_slope        - Declividade da costa (adimensional, > 0)
 * @param {number} baseline_elevation_m - Cota de referência do terreno (m, ≥ 0)
 * @returns {{ flooded_area_m2: number }} Área inundada (m²/m de costa)
 * @throws {TypeError} se argumentos não forem números finitos
 * @throws {RangeError} se coastal_slope ≤ 0 ou surge_m < 0
 */
export function computeInundationExtent(surge_m: number, coastal_slope: number, baseline_elevation_m: number): { flooded_area_m2: number } {
    if (
        typeof surge_m !== 'number' ||
        !isFinite(surge_m) ||
        typeof coastal_slope !== 'number' ||
        !isFinite(coastal_slope) ||
        typeof baseline_elevation_m !== 'number' ||
        !isFinite(baseline_elevation_m)
    ) {
        throw new TypeError('surge_m, coastal_slope e baseline_elevation_m devem ser números finitos');
    }
    if (surge_m < 0) throw new RangeError('surge_m não pode ser negativo');
    if (coastal_slope <= 0) throw new RangeError('coastal_slope deve ser positivo');
    if (baseline_elevation_m < 0) throw new RangeError('baseline_elevation_m não pode ser negativo');

    const effective_surge = surge_m - baseline_elevation_m;
    if (effective_surge <= 0) return { flooded_area_m2: 0 };

    const horizontal_extent = effective_surge / coastal_slope;
    const flooded_area_m2 = 0.5 * horizontal_extent * effective_surge;
    return { flooded_area_m2 };
}

/**
 * Calcula o nível de maré meteorológica para um dado período de retorno
 * usando a distribuição de Gumbel (Extreme Value Type I, ξ = 0).
 *
 * Método dos momentos:
 *   σ = std(annual_max_surges) × π / √6
 *   μ = mean - 0.5772 × σ   (constante de Euler–Mascheroni)
 *   z_T = μ + σ × (-ln(-ln(1 - 1/T)))
 *
 * Requer pelo menos 5 anos de observações para estimativa confiável.
 *
 * @param {number[]} annual_max_surges - Array de máximas anuais observadas (m)
 * @param {number}   return_period_yr  - Período de retorno (anos, > 1)
 * @returns {{ surge_m: number, mu: number, sigma: number }} Nível estimado e parâmetros Gumbel
 * @throws {TypeError} se annual_max_surges não for array de números ou return_period não for número
 * @throws {RangeError} se array tiver menos de 2 elementos ou return_period ≤ 1
 */
export function computeStormSurgeReturnLevel(annual_max_surges: number[], return_period_yr: number): { surge_m: number, mu: number, sigma: number } {
    if (!Array.isArray(annual_max_surges) || annual_max_surges.length < 2) {
        throw new RangeError('annual_max_surges deve ser um array com pelo menos 2 valores');
    }
    for (const v of annual_max_surges) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError('Todos os valores em annual_max_surges devem ser números finitos');
        }
    }
    if (typeof return_period_yr !== 'number' || !isFinite(return_period_yr))
        throw new TypeError('return_period_yr deve ser número finito');
    if (return_period_yr <= 1) throw new RangeError('return_period_yr deve ser maior que 1');

    const n = annual_max_surges.length;
    const mean = annual_max_surges.reduce((s, v) => s + v, 0) / n;
    const variance = annual_max_surges.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
    const std = Math.sqrt(variance);

    // Parâmetros Gumbel pelo método dos momentos
    const sigma = (std * Math.PI) / Math.sqrt(6);
    const EULER_MASCHERONI = 0.5772156649;
    const mu = mean - EULER_MASCHERONI * sigma;

    // Quantil Gumbel para período de retorno T
    const p = 1 - 1 / return_period_yr;
    const surge_m = mu + sigma * -Math.log(-Math.log(p));

    return { surge_m, mu, sigma };
}

/**
 * Classifica o perigo de maré meteorológica com base na elevação esperada.
 *
 * Classes baseadas em NOAA Storm Surge Hazard Maps:
 *   low      : surge < 0.5 m - inundação mínima de baixadas costeiras
 *   moderate : surge < 1.5 m - risco a habitações próximas à costa
 *   high     : surge < 3.0 m - destruição de infraestrutura leve, evacuação recomendada
 *   extreme  : surge ≥ 3.0 m - destruição generalizada, evacuação obrigatória
 *
 * @param {number} surge_m - Elevação da maré meteorológica (m, ≥ 0)
 * @returns {{ hazard: string }} Classe de perigo
 * @throws {TypeError} se surge_m não for número finito
 * @throws {RangeError} se surge_m < 0
 */
export function classifyStormSurgeHazard(surge_m: number): { hazard: string } {
    if (typeof surge_m !== 'number' || !isFinite(surge_m)) throw new TypeError('surge_m deve ser número finito');
    if (surge_m < 0) throw new RangeError('surge_m não pode ser negativo');

    let hazard: string;
    if (surge_m < 0.5) hazard = 'low';
    else if (surge_m < 1.5) hazard = 'moderate';
    else if (surge_m < 3.0) hazard = 'high';
    else hazard = 'extreme';

    return { hazard };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const stormSurgeModelMeta = {
    name: 'stormSurgeModel',
    description: 'stormSurgeModel',
    category: 'analytics',
    familyTags: ['environmental'],
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
