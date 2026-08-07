// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt


/**
 * Atmospheric Dispersion - pure-math module.
 * Implementa dispersão atmosférica com parametrização Pasquill-Gifford/Briggs.
 *
 * References:
 *   Briggs (1973) EPA-450/3-73-012
 *   Briggs (1975) ATDL-106
 *   Pasquill (1961) Meteorological Magazine
 *   Turner (1994) Workbook on Atmospheric Dispersion
 *   Gifford (1976) Nuclear Safety
 *   Slade (1968) Meteorology and Atomic Energy
 *   Wesely (1989) Atm. Env.
 *   Slinn (1984)
 *   EPA (1985) GEP Technical Support Document
 */

type StabilityClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

const VALID_CLASSES = new Set<StabilityClass>(['A', 'B', 'C', 'D', 'E', 'F']);
const TWO_PI = 2 * Math.PI;
const SQRT_2PI = Math.sqrt(TWO_PI);

/**
 * Pasquill-Gifford sigma dispersion coefficients - Briggs (1973) open terrain.
 * Coeficientes de dispersão atmosférica para terreno aberto.
 *
 * @param x_m - downwind distance (m), must be > 0
 * @param stability_class - Pasquill-Gifford class
 * @returns sigma dispersion coefficients
 */
function pasquillGiffordSigma(x_m: number, stability_class: StabilityClass): { sigma_y_m: number; sigma_z_m: number } {
    if (x_m <= 0) return { sigma_y_m: 0, sigma_z_m: 0 };
    if (!VALID_CLASSES.has(stability_class)) throw new Error(`Invalid stability class: ${stability_class}`);

    const x = x_m;

    // σ_y: coeficiente lateral - Briggs 1973
    const yDenom = Math.sqrt(1 + 0.0001 * x);
    const sigmayCoeffs: Record<StabilityClass, number> = { A: 0.22, B: 0.16, C: 0.11, D: 0.08, E: 0.06, F: 0.04 };
    const sigma_y_m = (sigmayCoeffs[stability_class] * x) / yDenom;

    // σ_z: coeficiente vertical - Briggs 1973 (form varia por classe)
    let sigma_z_m: number;
    switch (stability_class) {
        case 'A':
            sigma_z_m = 0.2 * x;
            break;
        case 'B':
            sigma_z_m = 0.12 * x;
            break;
        case 'C':
            sigma_z_m = (0.08 * x) / Math.sqrt(1 + 0.0002 * x);
            break;
        case 'D':
            sigma_z_m = (0.06 * x) / Math.sqrt(1 + 0.0015 * x);
            break;
        case 'E':
            sigma_z_m = (0.03 * x) / (1 + 0.0003 * x);
            break;
        case 'F':
            sigma_z_m = (0.016 * x) / (1 + 0.0003 * x);
            break;
    }

    return { sigma_y_m, sigma_z_m };
}

/**
 * Gaussian plume model with ground reflection (Pasquill 1961).
 * Modelo de pluma gaussiana com reflexão no solo.
 *
 * C = Q/(2π·σ_y·σ_z·u) · exp(-y²/(2σ_y²))
 *       · [exp(-(z-H)²/(2σ_z²)) + exp(-(z+H)²/(2σ_z²))]
 *
 * @param x - downwind distance (m)
 * @param y - crosswind distance (m)
 * @param z - height above ground (m)
 * @param Q_g_per_s - emission rate (g/s)
 * @param u_m_per_s - wind speed (m/s)
 * @param H_m - effective stack height (m)
 * @param sigma_y - lateral dispersion (m)
 * @param sigma_z - vertical dispersion (m)
 * @returns concentration (g/m³)
 */
function gaussianPlume(x: number, y: number, z: number, Q_g_per_s: number, u_m_per_s: number, H_m: number, sigma_y: number, sigma_z: number): number {
    if (x <= 0 || sigma_y <= 0 || sigma_z <= 0 || u_m_per_s <= 0) return 0;

    const crossTerm = Math.exp(-(y * y) / (2 * sigma_y * sigma_y));
    const vertUp = Math.exp(-((z - H_m) ** 2) / (2 * sigma_z * sigma_z));
    const vertDown = Math.exp(-((z + H_m) ** 2) / (2 * sigma_z * sigma_z));

    const C = (Q_g_per_s / (TWO_PI * sigma_y * sigma_z * u_m_per_s)) * crossTerm * (vertUp + vertDown);
    return Math.max(0, C);
}

/**
 * Effective stack height - Briggs (1975) plume rise formula.
 * Altura efetiva da chaminé com ascensão de pluma.
 *
 * @param H_physical - physical stack height (m)
 * @param V_s - exit velocity (m/s)
 * @param d - stack diameter (m)
 * @param u - wind speed at stack top (m/s)
 * @param Q_heat_cal_per_s - heat release rate (cal/s)
 * @param _stability_class - Pasquill-Gifford class
 * @returns effective stack height data
 */
function effectiveStackHeight(H_physical: number, V_s: number, d: number, u: number, Q_heat_cal_per_s: number, _stability_class: StabilityClass): { H_eff: number; deltaH: number; Fb: number; Fm: number } {
    const g = 9.81; // m/s²
    const u_safe = Math.max(0.1, u);

    // Momentum flux (m⁴/s²)
    const Fm = (V_s * V_s * d * d) / 4;

    // Buoyancy flux - usando calor como proxy de (T_s - T_a)
    // Q_heat [cal/s] → [W] = Q * 4.184 → Fb = g * Q / (π * rho * Cp * T_a)
    // Simplified Briggs 1975: Fb ≈ g * Q_heat * 4.184 / (3530 * π) m⁴/s³
    const Fb = (g * Q_heat_cal_per_s * 4.184) / (3530 * Math.PI);

    let deltaH: number;
    if (Fb > 0) {
        // Buoyant plume rise (neutral approximation - Briggs 1975 eq.1)
        deltaH = (1.6 * Math.cbrt(Fb)) / u_safe;
    } else {
        // Momentum-dominated rise
        deltaH = (3 * Fm) / (Math.PI * u_safe * V_s * d);
    }

    return {
        H_eff: H_physical + deltaH,
        deltaH,
        Fb,
        Fm,
    };
}

/**
 * Building downwash assessment - EPA GEP (1985).
 * Verificação de altura de chaminé para evitar downwash predial.
 *
 * H_GEP = H_building + 1.5 * L   where L = min(H_building, W_building)
 *
 * @param H_building - building height (m)
 * @param H_stack - actual stack height (m)
 * @param W_building - projected width of building (m)
 * @param _u_ref - reference wind speed (m/s, for future ext.)
 * @returns downwash assessment
 */
function buildingDownwash(H_building: number, H_stack: number, W_building: number, _u_ref: number): { H_GEP: number; at_risk: boolean; L_m: number } {
    const L_m = Math.min(H_building, W_building);
    const H_GEP = H_building + 1.5 * L_m;
    return {
        H_GEP,
        at_risk: H_stack < H_GEP,
        L_m,
    };
}

/**
 * Fumigation - worst-case ground-level concentration (Slade 1968).
 * Concentração máxima ao nível do solo durante fumigação (inversão térmica).
 *
 * C_fum = Q / (√(2π) · σ_y · u · H)
 *
 * @param Q - emission rate (g/s)
 * @param u - wind speed (m/s)
 * @param sigma_y - lateral dispersion (m)
 * @param H - mixing height (m)
 * @param _sigma_z_fumig - vertical sigma (irrelevant in fumigation, kept for API)
 * @returns ground-level concentration (g/m³)
 */
function fumigation(Q: number, u: number, sigma_y: number, H: number, _sigma_z_fumig: number): number {
    if (u <= 0 || sigma_y <= 0 || H <= 0) return 0;
    return Q / (SQRT_2PI * sigma_y * u * H);
}

/**
 * Maximum ground-level concentration and distance (Turner 1994).
 * Concentração máxima ao nível do solo e distância correspondente.
 *
 * Iterates x = 100–50000 m, finds maximum C(x, 0, 0) using Briggs sigmas.
 *
 * @param Q - emission rate (g/s)
 * @param u - wind speed (m/s)
 * @param H - effective stack height (m)
 * @param stability_class - Pasquill-Gifford class
 * @returns maximum concentration and distance
 */
function maximumGroundLevelConc(Q: number, u: number, H: number, stability_class: StabilityClass): { C_max_g_per_m3: number; x_max_m: number } {
    let C_max = 0;
    let x_max = 100;

    for (let x = 100; x <= 50000; x += 50) {
        const { sigma_y_m, sigma_z_m } = pasquillGiffordSigma(x, stability_class);
        if (sigma_y_m <= 0 || sigma_z_m <= 0) continue;
        const C = gaussianPlume(x, 0, 0, Q, u, H, sigma_y_m, sigma_z_m);
        if (C > C_max) {
            C_max = C;
            x_max = x;
        }
    }

    return { C_max_g_per_m3: C_max, x_max_m: x_max };
}

/**
 * Dry deposition flux (Wesely 1989).
 * Deposição seca: fluxo = concentração × velocidade de deposição.
 *
 * @param C_ground - ground-level concentration (g/m³)
 * @param v_d - deposition velocity (m/s, typically 0.001–0.05)
 * @returns dry deposition fluxes
 */
function dryDeposition(C_ground: number, v_d: number): { flux_g_per_m2_per_s: number; annual_g_per_m2: number } {
    const flux = C_ground * v_d;
    const annual = flux * 3600 * 8760; // g/m²/year
    return {
        flux_g_per_m2_per_s: flux,
        annual_g_per_m2: annual,
    };
}

/**
 * Wet deposition flux (Slinn 1984).
 * Deposição úmida: remoção por precipitação.
 *
 * F = Lambda · C_air · rainfall / 3.6e6
 *
 * @param C_air - air concentration (g/m³)
 * @param Lambda - scavenging coefficient (1/s, typical 1e-4 to 1e-5)
 * @param rainfall_mm_per_hr - rainfall intensity (mm/hr)
 * @returns wet deposition flux (g/m²/s)
 */
function wetDeposition(C_air: number, Lambda: number, rainfall_mm_per_hr: number): number {
    return (Lambda * C_air * rainfall_mm_per_hr) / 3.6e6;
}

/**
 * Pasquill stability class from meteorological data (Pasquill 1961, Gifford 1976).
 * Classificação de estabilidade atmosférica a partir de dados meteorológicos.
 *
 * @param u - 10 m wind speed (m/s)
 * @param insolation_class - daytime: 1=strong, 2=moderate, 3=slight; -1=night
 * @param night_cloud_cover - night oktas (0–8); ignored if insolation_class != -1
 * @returns stability class
 */
function _daytimeStability(u: number, insolation_class: number): StabilityClass {
    if (u < 2) {
        if (insolation_class === 1) return 'A';
        if (insolation_class === 2) return 'A';
        return 'B';
    }
    if (u < 3) {
        if (insolation_class === 1) return 'A';
        if (insolation_class === 2) return 'B';
        return 'C';
    }
    if (u < 5) {
        if (insolation_class === 1) return 'B';
        if (insolation_class === 2) return 'B';
        return 'C';
    }
    if (u < 6) {
        if (insolation_class === 1) return 'C';
        if (insolation_class === 2) return 'C';
        return 'D';
    }
    return 'D';
}

function _nighttimeStability(u: number, night_cloud_cover: number): StabilityClass {
    if (night_cloud_cover <= 4) {
        return u < 3 ? 'F' : 'E';
    }
    return 'D';
}

function stabilityClassFromMeteo(wind_speed_m_per_s: number, insolation_class: number, night_cloud_cover: number): StabilityClass {
    const u = wind_speed_m_per_s;

    if (insolation_class !== -1) {
        return _daytimeStability(u, insolation_class);
    }
    return _nighttimeStability(u, night_cloud_cover);
}

/**
 * Annual average concentration - sector-averaged Gifford (1976).
 * Concentração média anual por setor (dispersão lateral integrada).
 *
 * C_avg = Q / (√(2π) · σ_θ · u · r)
 *
 * @param Q - emission rate (g/s)
 * @param u_mean - mean wind speed (m/s)
 * @param sigma_theta - wind direction std dev (radians, typically 0.1–0.4)
 * @param H - effective stack height (m, reserved for future ext.)
 * @param r_m - radial distance from source (m)
 * @returns annual average concentrations
 */
function annualAverageConcentration(Q: number, u_mean: number, sigma_theta: number, H: number, r_m: number): { C_avg_g_per_m3: number; C_avg_ug_per_m3: number } {
    if (u_mean <= 0 || sigma_theta <= 0 || r_m <= 0) {
        return { C_avg_g_per_m3: 0, C_avg_ug_per_m3: 0 };
    }
    const C_avg_g_per_m3 = Q / (SQRT_2PI * sigma_theta * u_mean * r_m);
    return {
        C_avg_g_per_m3,
        C_avg_ug_per_m3: C_avg_g_per_m3 * 1e6,
    };
}

export {
    pasquillGiffordSigma,
    gaussianPlume,
    effectiveStackHeight,
    buildingDownwash,
    fumigation,
    maximumGroundLevelConc,
    dryDeposition,
    wetDeposition,
    stabilityClassFromMeteo,
    annualAverageConcentration,
};
