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
/**
 * Glacier Melt Model - Degree-Day, Mass Balance, Runoff & Health Classification
 *
 * Módulo puro de modelagem de degelo glacial: modelo de grau-dia para fusão,
 * balanço de massa com desvio da linha de equilíbrio, contribuição ao escoamento
 * e classificação de saúde do glaciar.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Hock, R. (2003). "Temperature index melt modelling in mountain areas."
 *     Journal of Hydrology 282(1-4), 104–115.
 *     DOI: 10.1016/S0022-1694(03)00257-9
 *     (modelo grau-dia DDF para degelo glacial)
 *   - Ohmura, A. (2001). "Physical basis for the temperature-based melt-index method."
 *     Journal of Applied Meteorology 40(4), 753–761.
 *     DOI: 10.1175/1520-0450(2001)040<0753:PBFTTB>2.0.CO;2
 *     (base física do modelo de índice térmico)
 *   - Jansson, P., Hock, R., & Schneider, T. (2003). "The concept of glacier storage:
 *     a review." Journal of Hydrology 282(1-4), 116–129.
 *     DOI: 10.1016/S0022-1694(03)00258-0
 *     (contribuição do degelo ao escoamento total)
 *   - WGMS (2021). "Global Glacier Change Bulletin No. 4 (2018-2019)." World Glacier
 *     Monitoring Service, Zurich, Switzerland. DOI: 10.5904/wgms-fog-2021-05
 *     (critérios de balanço de massa para classificação de saúde)
 *
 * @module glacierMeltModel
 */

'use strict';

// Gradiente térmico vertical padrão (°C/100m) - utilizado para deslocamento da ELA
// Valor típico de -6.5°C/km (lapse rate ambiental médio)
const TEMP_LAPSE_RATE_C_PER_M = 0.0065;

// Limites de balanço de massa para classificação de saúde (mm eq. água/ano)
// Referência: WGMS 2021 - análise de 130+ glaciares com registro de longo prazo
const MASS_BALANCE_THRESHOLDS = {
    growing: 100, // B > +100 mm: glaciar em expansão
    stable: -100, // B > -100 mm: glaciar estável (tolerância ±100 mm)
    retreating: -500, // B > -500 mm: recuo moderado
    // B ≤ -500 mm: crítico
};

/**
 * Compute glacier melt using the degree-day (temperature-index) model.
 * Calcula o degelo glacial pelo modelo de grau-dia (índice de temperatura).
 *
 * M (mm) = DDF × PDD
 *
 * onde:
 *   DDF = Degree-Day Factor (mm/°C·dia) - fator de fusão específico do tipo de superfície
 *   PDD = soma de graus-dia positivos (°C·dia)
 *
 * @param {number} positive_degree_days - Soma de graus-dia positivos (°C·dia, > 0)
 * @param {number} melt_factor_mm_C_day - Fator de grau-dia (mm/°C·dia, > 0)
 * @returns {{ melt_mm: number }} Degelo em mm equivalente de água
 * @throws {RangeError} Se qualquer parâmetro for negativo ou zero
 *
 * Referência: Hock (2003). DOI: 10.1016/S0022-1694(03)00257-9
 */
export function computeDegreeDayMelt(positive_degree_days: any, melt_factor_mm_C_day: any) {
    if (positive_degree_days < 0) {
        throw new RangeError('computeDegreeDayMelt: positive_degree_days deve ser ≥ 0');
    }
    if (melt_factor_mm_C_day <= 0) {
        throw new RangeError('computeDegreeDayMelt: melt_factor_mm_C_day deve ser positivo');
    }

    // M = DDF × PDD - modelo linear de grau-dia (Hock 2003)
    const melt_mm = melt_factor_mm_C_day * positive_degree_days;
    return { melt_mm };
}

/**
 * Compute glacier mass balance and equilibrium line altitude shift.
 * Calcula o balanço de massa do glaciar e o deslocamento estimado da linha de equilíbrio.
 *
 * B (mm) = C (acumulação) - M (fusão)
 * ELA_shift (m) = B / (lapse_rate_C_per_m × 1000) ≈ B / 6.5
 *
 * Um balanço negativo implica subida da linha de equilíbrio (ELA mais elevada).
 *
 * @param {number} accumulation_mm - Acumulação de neve/gelo (mm eq. água, ≥ 0)
 * @param {number} melt_mm - Degelo total (mm eq. água, ≥ 0)
 * @returns {{ mass_balance_mm: number, equilibrium_line_shift_m: number }}
 *   mass_balance_mm: balanço de massa (positivo = ganho, negativo = perda)
 *   equilibrium_line_shift_m: deslocamento da ELA em metros (positivo = subida)
 * @throws {RangeError} Se accumulation_mm ou melt_mm forem negativos
 *
 * Referência: Jansson et al. (2003). DOI: 10.1016/S0022-1694(03)00258-0
 */
export function computeGlacierMassBalance(accumulation_mm: any, melt_mm: any) {
    if (accumulation_mm < 0) {
        throw new RangeError('computeGlacierMassBalance: accumulation_mm deve ser ≥ 0');
    }
    if (melt_mm < 0) {
        throw new RangeError('computeGlacierMassBalance: melt_mm deve ser ≥ 0');
    }

    // B = acumulação - fusão (balanço de massa em mm eq. água)
    const mass_balance_mm = accumulation_mm - melt_mm;

    // Deslocamento da ELA: B negativo → ELA sobe; B positivo → ELA desce
    // ELA_shift = -B / (lapse_rate × 1000) onde lapse_rate = 6.5°C/km → /6.5
    const equilibrium_line_shift_m = -mass_balance_mm / (TEMP_LAPSE_RATE_C_PER_M * 1000);

    return { mass_balance_mm, equilibrium_line_shift_m };
}

/**
 * Compute glacier runoff contribution to basin total discharge.
 * Calcula a contribuição do degelo glacial ao escoamento total da bacia hidrográfica.
 *
 * Q_total (m³) = (melt_mm + rain_mm - ET_mm) × area_km² × 1000
 *
 * Conversão: 1 mm sobre 1 km² = 1000 m³
 *
 * @param {number} glacier_area_km2 - Área do glaciar (km²)
 * @param {number} melt_mm - Degelo (mm eq. água, ≥ 0)
 * @param {number} rain_mm - Precipitação de chuva na área glacial (mm, ≥ 0)
 * @param {number} evapotranspiration_mm - Evapotranspiração total (mm, ≥ 0)
 * @returns {{ total_runoff_m3: number }} Escoamento total em m³
 * @throws {RangeError} Se glacier_area_km2 ≤ 0 ou qualquer componente hídrico < 0
 *
 * Referência: Jansson et al. (2003). DOI: 10.1016/S0022-1694(03)00258-0
 */
export function computeRunoffContribution(glacier_area_km2: any, melt_mm: any, rain_mm: any, evapotranspiration_mm: any) {
    if (glacier_area_km2 <= 0) {
        throw new RangeError('computeRunoffContribution: glacier_area_km2 deve ser positivo');
    }
    if (melt_mm < 0 || rain_mm < 0 || evapotranspiration_mm < 0) {
        throw new RangeError('computeRunoffContribution: componentes hídricos devem ser ≥ 0');
    }

    // Balanço hídrico: entrada (degelo + chuva) - saída (ET)
    const net_water_mm = melt_mm + rain_mm - evapotranspiration_mm;

    // Conversão mm × km² → m³: 1 mm = 0.001 m; 1 km² = 1e6 m² → fator = 1000
    const total_runoff_m3 = Math.max(0, net_water_mm) * glacier_area_km2 * 1000;
    return { total_runoff_m3 };
}

/**
 * Classify glacier health status based on annual mass balance.
 * Classifica a saúde do glaciar com base no balanço de massa anual.
 *
 * Critérios (mm eq. água/ano - WGMS 2021):
 *   'growing'   : B > +100 mm/ano
 *   'stable'    : -100 < B ≤ +100 mm/ano
 *   'retreating': -500 < B ≤ -100 mm/ano
 *   'critical'  : B ≤ -500 mm/ano
 *
 * @param {number} mass_balance_mm - Balanço de massa anual (mm eq. água)
 * @returns {{ status: 'growing'|'stable'|'retreating'|'critical' }}
 * @throws {TypeError} Se mass_balance_mm não for número
 *
 * Referência: WGMS (2021). DOI: 10.5904/wgms-fog-2021-05
 */
export function classifyGlacierHealthStatus(mass_balance_mm: any) {
    if (typeof mass_balance_mm !== 'number' || Number.isNaN(mass_balance_mm)) {
        throw new TypeError('classifyGlacierHealthStatus: mass_balance_mm deve ser um número válido');
    }

    /** @type {'growing'|'stable'|'retreating'|'critical'} */
    let status;
    if (mass_balance_mm > MASS_BALANCE_THRESHOLDS.growing) {
        status = 'growing';
    } else if (mass_balance_mm > MASS_BALANCE_THRESHOLDS.stable) {
        status = 'stable';
    } else if (mass_balance_mm > MASS_BALANCE_THRESHOLDS.retreating) {
        status = 'retreating';
    } else {
        status = 'critical';
    }

    return { status };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const glacierMeltModelMeta = {
    name: 'glacierMeltModel',
    description: 'glacierMeltModel',
    category: 'analytics',
    familyTags: ['glacier'],
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
