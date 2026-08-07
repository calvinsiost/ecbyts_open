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
 * Atmospheric Deposition Model
 *
 * Modela deposição seca e úmida de poluentes atmosféricos sobre superfícies.
 * Referências acadêmicas:
 *   - Sehmel, G.A. (1980). Particle and gas dry deposition: A review.
 *     Atmospheric Environment, 14(9), 983–1011.
 *     DOI: 10.1016/0004-6981(80)90051-7
 *   - Wesely, M.L. & Hicks, B.B. (2000). A review of the current status
 *     of knowledge on dry deposition. Atmospheric Environment, 34(12-14), 2261–2282.
 *     DOI: 10.1016/S1352-2310(99)00467-7
 *
 * @module atmosphericDepositionModel
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
 * Computes dry deposition flux of a pollutant.
 *
 * Calcula o fluxo de deposição seca usando a velocidade de deposição (Vd).
 * Fórmula: F = Vd × C  (Sehmel 1980, eq. 1)
 *
 * @param Vd_m_s - Velocidade de deposição [m/s]; deve ser > 0
 * @param C_ug_m3 - Concentração do poluente no ar [µg/m³]; deve ser ≥ 0
 * @returns Fluxo de deposição seca [µg/m²/s]
 * @throws {TypeError} Se os parâmetros não forem números
 * @throws {RangeError} Se Vd_m_s ≤ 0 ou C_ug_m3 < 0
 */
export function computeDryDeposition(Vd_m_s: number, C_ug_m3: number): { flux_ug_m2_s: number } {
    if (typeof Vd_m_s !== 'number' || typeof C_ug_m3 !== 'number') {
        throw new TypeError('computeDryDeposition: Vd_m_s e C_ug_m3 devem ser números');
    }
    if (Vd_m_s <= 0) {
        throw new RangeError(`computeDryDeposition: Vd_m_s deve ser > 0, recebido ${Vd_m_s}`);
    }
    if (C_ug_m3 < 0) {
        throw new RangeError(`computeDryDeposition: C_ug_m3 deve ser ≥ 0, recebido ${C_ug_m3}`);
    }
    return { flux_ug_m2_s: Vd_m_s * C_ug_m3 };
}

/**
 * Computes wet deposition flux from precipitation scavenging.
 *
 * Calcula a deposição úmida integrando a concentração do poluente na chuva
 * pela altura da precipitação.
 * Fórmula: F = rainfall_mm × C  (convertendo mm → m: ×10⁻³; mantendo µg/L → µg/m³: ×10³)
 * Os fatores se cancelam → F [µg/m²] = rainfall_mm × C_ug_L
 *
 * @param rainfall_mm - Altura de precipitação [mm]; deve ser ≥ 0
 * @param C_ug_L - Concentração do poluente na chuva [µg/L]; deve ser ≥ 0
 * @returns Fluxo de deposição úmida [µg/m²]
 * @throws {TypeError} Se os parâmetros não forem números
 * @throws {RangeError} Se algum valor for negativo
 */
export function computeWetDeposition(rainfall_mm: number, C_ug_L: number): { flux_ug_m2: number } {
    if (typeof rainfall_mm !== 'number' || typeof C_ug_L !== 'number') {
        throw new TypeError('computeWetDeposition: rainfall_mm e C_ug_L devem ser números');
    }
    if (rainfall_mm < 0) {
        throw new RangeError(`computeWetDeposition: rainfall_mm deve ser ≥ 0, recebido ${rainfall_mm}`);
    }
    if (C_ug_L < 0) {
        throw new RangeError(`computeWetDeposition: C_ug_L deve ser ≥ 0, recebido ${C_ug_L}`);
    }
    // 1 mm de chuva = 1 L/m² → fator de conversão unitária é 1:1 para µg/m²
    return { flux_ug_m2: rainfall_mm * C_ug_L };
}

/**
 * Computes combined annual total deposition.
 *
 * Combina deposição seca (contínua) e úmida (episódica) para obter
 * a deposição total anual.
 *
 * @param dry_flux - Fluxo de deposição seca [µg/m²/s]
 * @param wet_flux - Fluxo de deposição úmida por evento [µg/m²]
 * @param rain_days_per_year - Número de dias de chuva por ano; deve ser 0–365
 * @returns Deposição anual total [µg/m²/ano]
 * @throws {TypeError} Se os parâmetros não forem números
 * @throws {RangeError} Se rain_days_per_year estiver fora de [0, 365]
 */
export function computeAnnualTotalDeposition(
    dry_flux: number,
    wet_flux: number,
    rain_days_per_year: number,
): { annual_ug_m2: number } {
    if (typeof dry_flux !== 'number' || typeof wet_flux !== 'number' || typeof rain_days_per_year !== 'number') {
        throw new TypeError('computeAnnualTotalDeposition: todos os parâmetros devem ser números');
    }
    if (rain_days_per_year < 0 || rain_days_per_year > 365) {
        throw new RangeError(
            `computeAnnualTotalDeposition: rain_days_per_year deve estar em [0, 365], recebido ${rain_days_per_year}`,
        );
    }
    // Deposição seca anual: fluxo [µg/m²/s] × 3600 s/h × 24 h/dia × 365 dias/ano
    const dry_annual = dry_flux * 3600 * 24 * 365;
    // Deposição úmida anual: fluxo por evento × número de eventos anuais
    const wet_annual = wet_flux * rain_days_per_year;
    return { annual_ug_m2: dry_annual + wet_annual };
}

/**
 * Classifies the deposition load level for a given pollutant.
 *
 * Classifica a carga de deposição anual em categorias de risco ambiental.
 * Limites baseados em padrões críticos de cargas da UNECE (Convention on
 * Long-range Transboundary Air Pollution - Mapping Manual 2004).
 *
 * Thresholds para enxofre (S) e outros poluentes genéricos [µg/m²/ano]:
 *   low < 200 | moderate < 1000 | high < 5000 | critical ≥ 5000
 *
 * @param annual_ug_m2 - Deposição anual total [µg/m²/ano]; deve ser ≥ 0
 * @param pollutant - Identificador do poluente (ex: 'S', 'N', 'Pb')
 * @returns Nível de carga
 * @throws {TypeError} Se annual_ug_m2 não for número ou pollutant não for string
 * @throws {RangeError} Se annual_ug_m2 for negativo
 */
export function classifyDepositionLoad(
    annual_ug_m2: number,
    pollutant: string,
): { level: 'low' | 'moderate' | 'high' | 'critical'; pollutant: string } {
    if (typeof annual_ug_m2 !== 'number') {
        throw new TypeError('classifyDepositionLoad: annual_ug_m2 deve ser um número');
    }
    if (typeof pollutant !== 'string' || pollutant.trim() === '') {
        throw new TypeError('classifyDepositionLoad: pollutant deve ser uma string não vazia');
    }
    if (annual_ug_m2 < 0) {
        throw new RangeError(`classifyDepositionLoad: annual_ug_m2 deve ser ≥ 0, recebido ${annual_ug_m2}`);
    }
    let level: 'low' | 'moderate' | 'high' | 'critical';
    if (annual_ug_m2 < 200) {
        level = 'low';
    } else if (annual_ug_m2 < 1000) {
        level = 'moderate';
    } else if (annual_ug_m2 < 5000) {
        level = 'high';
    } else {
        level = 'critical';
    }
    return { level, pollutant };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const atmosphericDepositionModelMeta: AnalyticsModuleMeta = {
    name: 'atmosphericDepositionModel',
    description: 'atmosphericDepositionModel',
    category: 'analytics',
    familyTags: ['atmosphere'],
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
