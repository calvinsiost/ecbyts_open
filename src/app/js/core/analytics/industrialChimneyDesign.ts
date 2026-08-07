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
 * Industrial Chimney Design - dimensionamento e avaliação de chaminés industriais.
 *
 * Referências acadêmicas:
 * - Briggs, G.A. (1969). Plume Rise. ATDL-0062. USAEC, Oak Ridge TN.
 * - Pasquill, F. & Smith, F.B. (1983). Atmospheric Diffusion, 3rd ed. Ellis Horwood.
 * - CONAMA 382/2006 - Limites máximos de emissão para fontes fixas.
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

const AMBIENT_TEMP_K = 293.15; // 20°C em Kelvin — temperatura ambiente padrão
// eslint-disable-next-line
const GRAVITY = 9.81; // m/s²

/**
 * Calcula a altura efetiva da chaminé pela fórmula de Briggs (1969).
 * Fórmula mista: calcula rise por empuxo (buoyancy) e rise por momentum, usa o maior.
 * H_eff = H_physical + rise
 *
 * @param physical_height_m  Altura física da chaminé (m > 0).
 * @param exit_velocity_m_s  Velocidade de saída dos gases (m/s > 0).
 * @param flue_diameter_m    Diâmetro interno da chaminé (m > 0).
 * @param wind_speed_m_s     Velocidade do vento a 10 m (m/s > 0).
 * @param heat_flux_kW       Fluxo de calor dos gases (kW ≥ 0).
 * @returns Altura efetiva da pluma (m).
 */
export function computeEffectiveStackHeight(
    physical_height_m: number,
    exit_velocity_m_s: number,
    flue_diameter_m: number,
    wind_speed_m_s: number,
    heat_flux_kW: number,
): { H_eff_m: number } {
    const args = { physical_height_m, exit_velocity_m_s, flue_diameter_m, wind_speed_m_s, heat_flux_kW };
    for (const [name, val] of Object.entries(args)) {
        if (typeof val !== 'number') throw new TypeError(`${name} deve ser numérico`);
    }
    if (physical_height_m <= 0) throw new RangeError('physical_height_m deve ser positivo');
    if (exit_velocity_m_s <= 0) throw new RangeError('exit_velocity_m_s deve ser positivo');
    if (flue_diameter_m <= 0) throw new RangeError('flue_diameter_m deve ser positivo');
    if (wind_speed_m_s <= 0) throw new RangeError('wind_speed_m_s deve ser positivo');
    if (heat_flux_kW < 0) throw new RangeError('heat_flux_kW não pode ser negativo');

    const v = exit_velocity_m_s;
    const d = flue_diameter_m;
    const u = wind_speed_m_s;
    const H = physical_height_m;

    // Rise por momentum (Briggs 1969, eq. 1): Δh_m = 1.5 × (v × d / u)
    const momentum_rise = 1.5 * ((v * d) / u);

    // Fluxo de empuxo Fb (m⁴/s³) = g × v × (d/2)² × π × ΔT/T_amb
    // Simplificação: Fb ≈ heat_flux_kW × 1e3 / (ρ_ar × Cp_ar × T_amb) ≈ Q_kW × 10^3 / (1.2 × 1005 × T_amb)
    const Fb = (heat_flux_kW * 1e3) / (1.2 * 1005 * AMBIENT_TEMP_K);

    let buoyancy_rise = 0;
    if (Fb > 0) {
        // Briggs (1969): Δh_b = 2.6 × (Fb/u)^(1/3) × (1000/H)^(2/3) para chaminés altas
        // Para Fb < 55 m⁴/s³: distância de transição = 49 × Fb^(5/8); senão = 119 × Fb^(2/5)
        buoyancy_rise = 2.6 * Math.pow(Fb / u, 1 / 3) * Math.pow(1000 / H, 2 / 3);
    }

    const rise = Math.max(momentum_rise, buoyancy_rise);
    return { H_eff_m: H + rise };
}

/**
 * Calcula a concentração ao nível do solo pela equação Gaussiana de dispersão.
 * C = Q / (π × u × σy × σz) × exp(−H² / (2 × σz²)) × 10⁶  [μg/m³]
 * (Fórmula de concentração máxima para receptor no eixo, sem reflexão no solo)
 *
 * @param emission_rate_g_s  Taxa de emissão do poluente (g/s > 0).
 * @param H_eff_m            Altura efetiva da pluma (m > 0).
 * @param sigma_y_m          Desvio lateral da pluma σy (m > 0).
 * @param sigma_z_m          Desvio vertical da pluma σz (m > 0).
 * @param wind_m_s           Velocidade do vento (m/s > 0).
 * @param x_m                Distância axial (m > 0) - informativa apenas.
 * @returns Concentração ao nível do solo (μg/m³).
 */
export function computeGroundLevelConcentration(
    emission_rate_g_s: number,
    H_eff_m: number,
    sigma_y_m: number,
    sigma_z_m: number,
    wind_m_s: number,
    x_m: number,
): { C_ug_m3: number } {
    const args = { emission_rate_g_s, H_eff_m, sigma_y_m, sigma_z_m, wind_m_s, x_m };
    for (const [name, val] of Object.entries(args)) {
        if (typeof val !== 'number') throw new TypeError(`${name} deve ser numérico`);
        if (val <= 0) throw new RangeError(`${name} deve ser positivo`);
    }

    const exponent = -(H_eff_m * H_eff_m) / (2 * sigma_z_m * sigma_z_m);
    const C_g_m3 = (emission_rate_g_s / (Math.PI * wind_m_s * sigma_y_m * sigma_z_m)) * Math.exp(exponent);
    return { C_ug_m3: C_g_m3 * 1e6 };
}

/**
 * Calcula a altura mínima de chaminé para atender ao AAQS usando iteração de Newton.
 * Resolve H tal que C(H) = AAQS: iteração com derivada numérica (3 passos).
 *
 * @param Q_g_s        Taxa de emissão (g/s > 0).
 * @param AAQS_ug_m3   Padrão de qualidade do ar (μg/m³ > 0).
 * @param sigma_y      Desvio lateral σy (m > 0).
 * @param sigma_z      Desvio vertical σz (m > 0).
 * @param wind_m_s     Velocidade do vento (m/s > 0).
 * @returns Altura mínima para conformidade (m).
 */
export function computeMinimumStackHeight(
    Q_g_s: number,
    AAQS_ug_m3: number,
    sigma_y: number,
    sigma_z: number,
    wind_m_s: number,
): { H_min_m: number } {
    const args = { Q_g_s, AAQS_ug_m3, sigma_y, sigma_z, wind_m_s };
    for (const [name, val] of Object.entries(args)) {
        if (typeof val !== 'number') throw new TypeError(`${name} deve ser numérico`);
        if (val <= 0) throw new RangeError(`${name} deve ser positivo`);
    }

    // C(H) = [Q / (π × u × σy × σz)] × exp(−H²/(2σz²)) × 1e6 = AAQS
    // Isola H: H = σz × sqrt(2 × ln(Q_frac / AAQS_g_m3)) sendo Q_frac = Q/(π×u×σy×σz)
    const C_target_g_m3 = AAQS_ug_m3 * 1e-6;
    const prefactor = Q_g_s / (Math.PI * wind_m_s * sigma_y * sigma_z);

    if (prefactor <= C_target_g_m3) {
        // Concentração máxima (H=0) já está abaixo do padrão
        return { H_min_m: 0 };
    }

    // H = σz × sqrt(2 × ln(prefactor / C_target))
    let H = sigma_z * Math.sqrt(2 * Math.log(prefactor / C_target_g_m3));

    // 3 passos de Newton para refinar (a equação é fechada, Newton converge rapidamente)
    for (let i = 0; i < 3; i++) {
        const expTerm = Math.exp(-(H * H) / (2 * sigma_z * sigma_z));
        const fH = prefactor * expTerm - C_target_g_m3;
        const dfH = prefactor * expTerm * (-H / (sigma_z * sigma_z));
        if (Math.abs(dfH) < 1e-30) break;
        H = H - fH / dfH;
        if (H < 0) {
            H = 0;
            break;
        }
    }

    return { H_min_m: Math.max(0, H) };
}

/**
 * Classifica a conformidade da emissão com o padrão de qualidade do ar.
 *
 * @param ground_level_conc_ug_m3  Concentração ao nível do solo (μg/m³ ≥ 0).
 * @param AAQS_ug_m3               Padrão regulatório (μg/m³ > 0).
 * @returns Conformidade e percentual de ultrapassagem.
 */
export function classifyEmissionCompliance(
    ground_level_conc_ug_m3: number,
    AAQS_ug_m3: number,
): { compliant: boolean; exceedance_pct: number } {
    if (typeof ground_level_conc_ug_m3 !== 'number' || typeof AAQS_ug_m3 !== 'number') {
        throw new TypeError('Concentrações devem ser numéricas');
    }
    if (ground_level_conc_ug_m3 < 0) throw new RangeError('Concentração não pode ser negativa');
    if (AAQS_ug_m3 <= 0) throw new RangeError('AAQS_ug_m3 deve ser positivo');

    const exceedance_pct = ((ground_level_conc_ug_m3 - AAQS_ug_m3) / AAQS_ug_m3) * 100;
    return {
        compliant: ground_level_conc_ug_m3 <= AAQS_ug_m3,
        exceedance_pct: Math.max(0, exceedance_pct),
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialChimneyDesignMeta: AnalyticsModuleMeta = {
    name: 'industrialChimneyDesign',
    description: 'industrialChimneyDesign',
    category: 'analytics',
    familyTags: ['industrial'],
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
