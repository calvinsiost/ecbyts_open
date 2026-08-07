// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Air Pollution Meteorology - Pure analytical module
// Meteorologia de poluição do ar - módulo analítico puro sem dependências de DOM/IDB/fetch
//
// References / Referências:
//   Pasquill F. (1961) The estimation of the dispersion of windborne material.
//     Meteorological Magazine, 90(1063), 33-49.
//   Turner D.B. (1994) Workbook of Atmospheric Dispersion Estimates - An Introduction to
//     Dispersion Modeling, 2nd ed. EPA/625/R-94/004, U.S. EPA.
//   Slade D.H. (1968) Meteorology and Atomic Energy. U.S. AEC, USAEC Division of
//     Technical Information, TID-24190.
//   Deardorff J.W. (1972) Parameterization of the planetary boundary layer for use in
//     general circulation models. Journal of Geophysical Research, 77(15), 2818–2831.
//     DOI:10.1029/JC077i015p02818

'use strict';

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

type StabilityClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

// Tabela de classe de estabilidade de Pasquill-Gifford (Turner 1994, Table 1-1)
// Pasquill-Gifford stability class lookup table: [wind_speed_m_s, solar_rad_class, daytime] → class
// Solar radiation classes: 'strong' >600 W/m², 'moderate' 300-600, 'slight' <300, 'night' (cloud-based)

/**
 * Compute Pasquill atmospheric stability class from meteorological parameters.
 * Determina classe de estabilidade atmosférica de Pasquill-Gifford.
 *
 * @param wind_speed_m_s        - Wind speed at 10m height (m/s), must be ≥ 0
 * @param solar_radiation_W_m2  - Incoming solar radiation (W/m²), must be ≥ 0
 * @param cloud_cover_oktas     - Cloud cover in oktas [0, 8]
 * @param daytime               - true = daytime, false = night
 */
export function computePasquillStabilityClass(
    wind_speed_m_s: number,
    solar_radiation_W_m2: number,
    cloud_cover_oktas: number,
    daytime: boolean,
): { stability_class: StabilityClass; description: string } {
    if (typeof wind_speed_m_s !== 'number') throw new TypeError('wind_speed_m_s must be a number');
    if (typeof solar_radiation_W_m2 !== 'number') throw new TypeError('solar_radiation_W_m2 must be a number');
    if (typeof cloud_cover_oktas !== 'number') throw new TypeError('cloud_cover_oktas must be a number');
    if (typeof daytime !== 'boolean') throw new TypeError('daytime must be a boolean');
    if (wind_speed_m_s < 0) throw new RangeError('wind_speed_m_s must be >= 0');
    if (solar_radiation_W_m2 < 0) throw new RangeError('solar_radiation_W_m2 must be >= 0');
    if (cloud_cover_oktas < 0 || cloud_cover_oktas > 8) throw new RangeError('cloud_cover_oktas must be in [0, 8]');

    const CLASS_DESCRIPTIONS: Record<StabilityClass, string> = {
        A: 'Extremamente instável (very unstable)',
        B: 'Moderadamente instável (moderately unstable)',
        C: 'Levemente instável (slightly unstable)',
        D: 'Neutro (neutral)',
        E: 'Levemente estável (slightly stable)',
        F: 'Estável (stable/very stable)',
    };

    let stability_class: StabilityClass;

    if (daytime) {
        // Classificação diurna por velocidade do vento e radiação solar (Turner 1994, Table 1-1)
        // Daytime classification by wind speed and solar insolation
        const strong = solar_radiation_W_m2 > 600;
        const moderate = solar_radiation_W_m2 >= 300 && solar_radiation_W_m2 <= 600;

        if (wind_speed_m_s < 2) {
            stability_class = strong ? 'A' : moderate ? 'A' : 'B';
        } else if (wind_speed_m_s < 3) {
            stability_class = strong ? 'A' : moderate ? 'B' : 'C';
        } else if (wind_speed_m_s < 5) {
            stability_class = strong ? 'B' : moderate ? 'B' : 'C';
        } else if (wind_speed_m_s < 6) {
            stability_class = strong ? 'C' : moderate ? 'C' : 'D';
        } else {
            stability_class = 'D'; // Alta velocidade → sempre neutro
        }
    } else {
        // Classificação noturna por cobertura de nuvens e velocidade do vento
        // Nighttime classification by cloud cover and wind speed
        const overcast = cloud_cover_oktas >= 6;

        if (overcast || wind_speed_m_s >= 6) {
            stability_class = 'D';
        } else if (wind_speed_m_s < 3) {
            stability_class = cloud_cover_oktas <= 3 ? 'F' : 'E';
        } else if (wind_speed_m_s < 5) {
            stability_class = cloud_cover_oktas <= 3 ? 'E' : 'E';
        } else {
            stability_class = 'D';
        }
    }

    return { stability_class, description: CLASS_DESCRIPTIONS[stability_class] };
}

/**
 * Compute mixing layer height using simplified Deardorff (1972) parameterization.
 * Calcula altura de mistura da camada limite planetária (Deardorff 1972).
 *
 * Simplified: zi = max(200, 50 × H^0.4)  for convective conditions
 * Night/stable: zi = max(100, 30 × |H|^0.3)
 *
 * @param surface_heat_flux_W_m2 - Sensible heat flux at surface (W/m²); negative = stable
 * @param friction_velocity_m_s  - Friction velocity u* (m/s), must be > 0
 * @param time_after_sunrise_h   - Hours after sunrise (h), must be ≥ 0
 */
export function computeMixingHeight(
    surface_heat_flux_W_m2: number,
    friction_velocity_m_s: number,
    time_after_sunrise_h: number,
): { mixing_height_m: number } {
    if (typeof surface_heat_flux_W_m2 !== 'number') throw new TypeError('surface_heat_flux_W_m2 must be a number');
    if (typeof friction_velocity_m_s !== 'number') throw new TypeError('friction_velocity_m_s must be a number');
    if (typeof time_after_sunrise_h !== 'number') throw new TypeError('time_after_sunrise_h must be a number');
    if (friction_velocity_m_s <= 0) throw new RangeError('friction_velocity_m_s must be > 0');
    if (time_after_sunrise_h < 0) throw new RangeError('time_after_sunrise_h must be >= 0');

    const H = surface_heat_flux_W_m2;

    let mixing_height_m: number;
    if (H >= 0) {
        // Condições convectivas (instável/neutro): crescimento da camada limite convectiva
        // Convective: simplified power-law parameterization (Deardorff 1972 spirit)
        mixing_height_m = Math.max(200, 50 * Math.pow(Math.max(H, 1), 0.4));
    } else {
        // Condições estáveis (noturno): camada limite noturna mais rasa
        // Stable/nocturnal: shallower mixing
        mixing_height_m = Math.max(100, 30 * Math.pow(Math.abs(H), 0.3));
    }

    return { mixing_height_m };
}

// Coeficientes de dispersão de Pasquill-Gifford (Slade 1968, Table 3-2)
// σy = a × x^0.894;  σz = c × x^d  (x em km, σ em m)
// Valores para distâncias 0.1–10 km - faixa mais comum em avaliação de impacto
const PG_COEFFICIENTS: Record<StabilityClass, { a: number; c: number; d: number }> = {
    //           σy        σz (2 faixas por classe: <2km e ≥2km)
    //           a         c       d
    A: { a: 0.22, c: 0.2, d: 0.894 },
    B: { a: 0.16, c: 0.12, d: 0.894 },
    C: { a: 0.11, c: 0.08, d: 0.894 },
    D: { a: 0.08, c: 0.06, d: 0.894 },
    E: { a: 0.06, c: 0.03, d: 0.894 },
    F: { a: 0.04, c: 0.016, d: 0.894 },
};

/**
 * Compute Pasquill-Gifford dispersion coefficients σy and σz at a given downwind distance.
 * Calcula coeficientes de dispersão de Pasquill-Gifford (Slade 1968).
 *
 * σy = a × x^0.894   [m]
 * σz = c × x^d       [m]
 * (x in metres, converted internally to km for Slade equations)
 *
 * @param stability_class - Pasquill stability class
 * @param distance_m - Downwind distance (m), must be > 0
 */
export function computeSigmaDispersion(
    stability_class: StabilityClass,
    distance_m: number,
): { sigma_y_m: number; sigma_z_m: number } {
    if (!PG_COEFFICIENTS[stability_class]) {
        throw new TypeError(`stability_class must be one of: ${Object.keys(PG_COEFFICIENTS).join(', ')}`);
    }
    if (typeof distance_m !== 'number') throw new TypeError('distance_m must be a number');
    if (distance_m <= 0) throw new RangeError('distance_m must be > 0');

    const x_km = distance_m / 1000;
    const { a, c, d } = PG_COEFFICIENTS[stability_class];

    const sigma_y_m = a * Math.pow(x_km, 0.894) * 1000; // Slade usa km, converter saída para m
    const sigma_z_m = c * Math.pow(x_km, d) * 1000;

    return { sigma_y_m, sigma_z_m };
}

/**
 * Compute ground-level centerline concentration via Gaussian plume model.
 * Calcula concentração ao nível do solo via modelo de pluma Gaussiana (Turner 1994).
 *
 * C = Q / (π × u × σy × σz) × exp(−H² / (2 × σz²))
 * Resultado em µg/m³ (emissão em g/s → µg/m³ via fator 10⁶)
 *
 * @param emission_g_s    - Source emission rate (g/s), must be > 0
 * @param wind_speed_m_s  - Wind speed at stack height (m/s), must be > 0
 * @param sigma_y_m       - Lateral dispersion coefficient (m), must be > 0
 * @param sigma_z_m       - Vertical dispersion coefficient (m), must be > 0
 * @param stack_height_m  - Effective stack height (m), must be ≥ 0
 */
export function computeGaussianGroundConcentration(
    emission_g_s: number,
    wind_speed_m_s: number,
    sigma_y_m: number,
    sigma_z_m: number,
    stack_height_m: number,
): { concentration_ug_m3: number } {
    if ([emission_g_s, wind_speed_m_s, sigma_y_m, sigma_z_m, stack_height_m].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (emission_g_s <= 0) throw new RangeError('emission_g_s must be > 0');
    if (wind_speed_m_s <= 0) throw new RangeError('wind_speed_m_s must be > 0');
    if (sigma_y_m <= 0) throw new RangeError('sigma_y_m must be > 0');
    if (sigma_z_m <= 0) throw new RangeError('sigma_z_m must be > 0');
    if (stack_height_m < 0) throw new RangeError('stack_height_m must be >= 0');

    // Concentração no eixo ao nível do solo [g/m³]
    // Ground-level centerline concentration (y=0, z=0)
    const C_g_m3 =
        (emission_g_s / (Math.PI * wind_speed_m_s * sigma_y_m * sigma_z_m)) *
        Math.exp(-(stack_height_m * stack_height_m) / (2 * sigma_z_m * sigma_z_m));

    // Converter g/m³ → µg/m³
    const concentration_ug_m3 = C_g_m3 * 1e6;

    return { concentration_ug_m3 };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const airPollutionMeteorologyMeta: AnalyticsModuleMeta = {
    name: 'airPollutionMeteorology',
    description: 'airPollutionMeteorology',
    category: 'analytics',
    familyTags: ['air'],
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
