// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Mine Dewatering Model - pumping flow, drawdown, and risk classification
// Modelo de Drenagem de Minas - vazão de bombeamento, rebaixamento e classificação de risco

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

/**
 * Computes groundwater drawdown using Theis equation with numerical W(u) approximation.
 * Calcula o rebaixamento do nível d'água pela equação de Theis com aproximação numérica de W(u).
 *
 * s = Q/(4πT) × W(u)
 * W(u) ≈ −ln(u) − 0.5772 + u − u²/4 + u³/18 (series expansion, u < 0.01 → 2-term)
 * Assumes r = 1 m (unit radial distance).
 *
 * @param pumping_rate_m3_s - Pumping rate Q in m³/s (> 0)
 * @param time_s - Pumping time t in seconds (> 0)
 * @param transmissivity_m2_s - Aquifer transmissivity T in m²/s (> 0)
 * @param storativity - Aquifer storativity S (dimensionless, 0 < S ≤ 1)
 * @throws {RangeError} If transmissivity ≤ 0 or storativity out of range
 * @see Theis (1935) Trans. AGU 16(2):519–524
 * @see Powers et al. (2007) Construction Dewatering and Groundwater Control
 */
export function computeThiesEquation(
    pumping_rate_m3_s: number,
    time_s: number,
    transmissivity_m2_s: number,
    storativity: number,
): { drawdown_m: number; well_function_W: number } {
    for (const [name, val] of [
        ['pumping_rate_m3_s', pumping_rate_m3_s],
        ['time_s', time_s],
        ['transmissivity_m2_s', transmissivity_m2_s],
        ['storativity', storativity],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    }
    if (pumping_rate_m3_s <= 0) throw new RangeError('pumping_rate_m3_s must be > 0');
    if (time_s <= 0) throw new RangeError('time_s must be > 0');
    if (transmissivity_m2_s <= 0) throw new RangeError('transmissivity_m2_s must be > 0');
    if (storativity <= 0 || storativity > 1) throw new RangeError('storativity must be in (0, 1]');

    // u = r²S/(4Tt) com r=1m implícito
    const r = 1.0;
    const u = (r * r * storativity) / (4 * transmissivity_m2_s * time_s);

    // Função de poço W(u): expansão em série (Abramowitz & Stegun 5.1.56)
    // W(u) = -γ - ln(u) + u - u²/(2×2!) + u³/(3×3!) - u⁴/(4×4!)
    // γ = 0.5772156649 (constante de Euler-Mascheroni)
    let well_function_W;
    if (u < 1e-10) {
        // Para u muito pequeno, apenas primeiros dois termos são numericamente estáveis
        well_function_W = -Math.log(u) - 0.5772156649;
    } else if (u <= 0.01) {
        // Série com 4 termos para u pequeno
        well_function_W = -Math.log(u) - 0.5772156649 + u - (u * u) / 4 + (u * u * u) / 18 - (u * u * u * u) / 96;
    } else {
        // Série completa com 8 termos para maior precisão
        let sum = 0;
        let term = -u;
        for (let n = 1; n <= 8; n++) {
            sum += term / n;
            term *= -u / (n + 1);
        }
        well_function_W = Math.max(0, -0.5772156649 - Math.log(u) + sum);
    }

    // Rebaixamento s = Q/(4πT) × W(u)
    const drawdown_m = (pumping_rate_m3_s / (4 * Math.PI * transmissivity_m2_s)) * well_function_W;

    return { drawdown_m: Math.max(0, drawdown_m), well_function_W };
}

/**
 * Computes total inflow rate for an open-pit mine.
 * Calcula a vazão total de infiltração para uma mina a céu aberto.
 *
 * surface_runoff = C × i × A / 3.6e6 (converting mm/h × m² → m³/s)
 * total_inflow = surface_runoff + groundwater_flux
 * peak_inflow = total × 1.5 (peak factor, SME Mining Engineering Handbook)
 *
 * @param catchment_area_m2 - Catchment area in m² (> 0)
 * @param rainfall_intensity_mm_h - Rainfall intensity in mm/h (≥ 0)
 * @param runoff_coefficient - Rational method coefficient C [0, 1]
 * @param groundwater_flux_m3_s - Steady-state groundwater inflow in m³/s (≥ 0)
 * @throws {RangeError} If runoff_coefficient ∉ [0, 1]
 * @see SME Mining Engineering Handbook (2011), Chapter 14.3
 * @see DNPM Portaria 237/2001 - Normas Regulamentadoras de Mineração
 */
export function computeOpenPitInflow(
    catchment_area_m2: number,
    rainfall_intensity_mm_h: number,
    runoff_coefficient: number,
    groundwater_flux_m3_s: number,
): { total_inflow_m3_s: number; peak_inflow_m3_s: number } {
    for (const [name, val] of [
        ['catchment_area_m2', catchment_area_m2],
        ['rainfall_intensity_mm_h', rainfall_intensity_mm_h],
        ['runoff_coefficient', runoff_coefficient],
        ['groundwater_flux_m3_s', groundwater_flux_m3_s],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    }
    if (catchment_area_m2 <= 0) throw new RangeError('catchment_area_m2 must be > 0');
    if (rainfall_intensity_mm_h < 0) throw new RangeError('rainfall_intensity_mm_h must be >= 0');
    if (runoff_coefficient < 0 || runoff_coefficient > 1) throw new RangeError('runoff_coefficient must be in [0, 1]');
    if (groundwater_flux_m3_s < 0) throw new RangeError('groundwater_flux_m3_s must be >= 0');

    // Conversão: mm/h × m² → m³/s; 1 mm/h = 1e-3 m / 3600 s
    const surface_runoff_m3_s = (runoff_coefficient * rainfall_intensity_mm_h * catchment_area_m2) / 3.6e6;
    const total_inflow_m3_s = surface_runoff_m3_s + groundwater_flux_m3_s;
    // Fator de pico 1.5 para projeto de bombeamento (SME Engineering Handbook)
    const peak_inflow_m3_s = total_inflow_m3_s * 1.5;

    return { total_inflow_m3_s, peak_inflow_m3_s };
}

/**
 * Computes pump power requirements and annual energy consumption.
 * Calcula a potência necessária para bombeamento e consumo anual de energia.
 *
 * P_shaft = ρ × g × Q × H / η_pump  (W)
 * P_input = P_shaft / η_motor  (W)
 * annual_energy = P_input × 8760 / 1000  (MWh/yr)
 *
 * @param flow_rate_m3_s - Volumetric flow rate Q in m³/s (> 0)
 * @param total_dynamic_head_m - Total dynamic head H in m (> 0)
 * @param pump_efficiency - Pump hydraulic efficiency η_pump ∈ (0, 1]
 * @param motor_efficiency - Motor efficiency η_motor ∈ (0, 1]
 * @throws {RangeError} If TDH ≤ 0 or efficiencies out of (0, 1]
 * @see Powers et al. (2007) Construction Dewatering, Ch. 6
 */
export function computePumpingPowerRequirement(
    flow_rate_m3_s: number,
    total_dynamic_head_m: number,
    pump_efficiency: number,
    motor_efficiency: number,
): { shaft_power_kW: number; input_power_kW: number; annual_energy_MWh: number } {
    for (const [name, val] of [
        ['flow_rate_m3_s', flow_rate_m3_s],
        ['total_dynamic_head_m', total_dynamic_head_m],
        ['pump_efficiency', pump_efficiency],
        ['motor_efficiency', motor_efficiency],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    }
    if (flow_rate_m3_s <= 0) throw new RangeError('flow_rate_m3_s must be > 0');
    if (total_dynamic_head_m <= 0) throw new RangeError('total_dynamic_head_m must be > 0');
    if (pump_efficiency <= 0 || pump_efficiency > 1) throw new RangeError('pump_efficiency must be in (0, 1]');
    if (motor_efficiency <= 0 || motor_efficiency > 1) throw new RangeError('motor_efficiency must be in (0, 1]');

    const rho = 1000; // densidade da água (kg/m³)
    const g = 9.81; // aceleração gravitacional (m/s²)

    // Potência hidráulica no eixo (kW)
    const shaft_power_kW = (rho * g * flow_rate_m3_s * total_dynamic_head_m) / (pump_efficiency * 1000);
    // Potência de entrada no motor (kW)
    const input_power_kW = shaft_power_kW / motor_efficiency;
    // Consumo anual considerando operação contínua (8760 h/ano)
    const annual_energy_MWh = (input_power_kW * 8760) / 1000;

    return { shaft_power_kW, input_power_kW, annual_energy_MWh };
}

/**
 * Classifies mine dewatering risk and determines redundancy requirements.
 * Classifica o risco de drenagem de mina e determina requisitos de redundância.
 *
 * critical: inflow > 0.8 × pump_capacity OR groundwater_level > 0.7 × mine_depth
 * high: inflow > 0.6 × pump_capacity OR groundwater_level > 0.5 × mine_depth
 * Redundancy required when risk >= high.
 *
 * @param inflow_m3_s - Actual or projected inflow in m³/s (≥ 0)
 * @param pump_capacity_m3_s - Installed pump capacity in m³/s (> 0)
 * @param groundwater_level_m - Groundwater level depth from surface in m (≥ 0)
 * @param mine_depth_m - Current mine depth in m (> 0)
 * @throws {RangeError} If pump_capacity ≤ 0 or mine_depth ≤ 0
 * @see SME Mining Engineering Handbook (2011), Section 14.6
 */
export function classifyDewateringRisk(
    inflow_m3_s: number,
    pump_capacity_m3_s: number,
    groundwater_level_m: number,
    mine_depth_m: number,
): { risk: 'low' | 'moderate' | 'high' | 'critical'; redundancy_required: boolean } {
    for (const [name, val] of [
        ['inflow_m3_s', inflow_m3_s],
        ['pump_capacity_m3_s', pump_capacity_m3_s],
        ['groundwater_level_m', groundwater_level_m],
        ['mine_depth_m', mine_depth_m],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    }
    if (inflow_m3_s < 0) throw new RangeError('inflow_m3_s must be >= 0');
    if (pump_capacity_m3_s <= 0) throw new RangeError('pump_capacity_m3_s must be > 0');
    if (groundwater_level_m < 0) throw new RangeError('groundwater_level_m must be >= 0');
    if (mine_depth_m <= 0) throw new RangeError('mine_depth_m must be > 0');

    const inflow_ratio = inflow_m3_s / pump_capacity_m3_s;
    const gw_ratio = groundwater_level_m / mine_depth_m;

    let risk: 'low' | 'moderate' | 'high' | 'critical';
    if (inflow_ratio > 0.8 || gw_ratio > 0.7) {
        risk = 'critical';
    } else if (inflow_ratio > 0.6 || gw_ratio > 0.5) {
        risk = 'high';
    } else if (inflow_ratio > 0.4 || gw_ratio > 0.3) {
        risk = 'moderate';
    } else {
        risk = 'low';
    }

    const redundancy_required = risk === 'high' || risk === 'critical';

    return { risk, redundancy_required };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineDewateringModelMeta: AnalyticsModuleMeta = {
    name: 'mineDewateringModel',
    description: 'mineDewateringModel',
    category: 'analytics',
    familyTags: ['water', 'mining'],
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
