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
 * Subsurface Heat Transport Module
 *
 * Transporte de calor em subsuperfície - equação de advecção-difusão térmica
 * e oscilações sazonais de temperatura segundo Domenico & Schwartz (1998) e
 * Carslaw & Jaeger (1959).
 *
 * Aplicações: avaliação de impacto térmico de aterros, tunelamentos,
 * tubulações enterradas e sistemas de troca de calor geotérmico.
 *
 * References:
 * - Domenico, P.A. & Schwartz, F.W. (1998). Physical and Chemical Hydrogeology,
 *   2nd ed. Wiley. ISBN 978-0-471-59762-9. Ch.3 §3.5.
 * - Carslaw, H.S. & Jaeger, J.C. (1959). Conduction of Heat in Solids, 2nd ed.
 *   Oxford University Press. ISBN 978-0-19-853368-9. Ch.2.
 * - Stallman, R.W. (1965). Steady one-dimensional fluid flow in a semi-infinite
 *   porous medium with sinusoidal surface temperature. JGR 70(12):2821-2827.
 *   DOI:10.1029/JZ070i012p02821
 *
 * @module soilRemediationTimeModel
 */

'use strict';

const TWO_PI = 2 * Math.PI;

/**
 * Calcula a difusividade térmica do meio poroso saturado.
 * α = λ / (ρ × c)
 *
 * @param {number} conductivity_W_mK  - Condutividade térmica (W/(m·K)), > 0
 * @param {number} density_kg_m3      - Densidade volumétrica (kg/m³), > 0
 * @param {number} specificHeat_J_kgK - Calor específico (J/(kg·K)), > 0
 * @returns {number} Difusividade térmica α (m²/s)
 * @throws {RangeError} Se qualquer parâmetro for não-positivo
 */
export function calcThermalDiffusivity(conductivity_W_mK: number, density_kg_m3: number, specificHeat_J_kgK: number): number {
    if (conductivity_W_mK <= 0) throw new RangeError('conductivity_W_mK must be > 0');
    if (density_kg_m3 <= 0) throw new RangeError('density_kg_m3 must be > 0');
    if (specificHeat_J_kgK <= 0) throw new RangeError('specificHeat_J_kgK must be > 0');

    return conductivity_W_mK / (density_kg_m3 * specificHeat_J_kgK);
}

/**
 * Estima o comprimento do plume térmico em aquífero com advecção.
 * Baseado na solução de Domenico & Schwartz (1998) para transporte 1D:
 * L = (v × L_D) / v onde L_D é escala de dispersão.
 *
 * Comprimento (m) onde o excesso de temperatura cai para targetDeltaT:
 * Usando aproximação: L ≈ (v × deltaT) / (targetDeltaT) × sqrt(4α/v)
 *
 * Solução analítica simplificada para plume steady-state 1D (Domenico & Schwartz 1998 eq.3.50):
 * C(x) = (deltaT/2) × erfc((x - v*t) / (2*sqrt(alpha*t)))
 * Para steady-state: L = (4*alpha/v) × [erfinv(1 - targetDeltaT/deltaT)]²  (approx. conservativo)
 *
 * @param {number} alpha      - Difusividade térmica (m²/s), > 0
 * @param {number} velocity_m_s - Velocidade de fluxo (m/s), > 0
 * @param {number} deltaT     - Excesso de temperatura na fonte (°C/K), > 0
 * @param {number} targetDeltaT - Excesso de temperatura alvo (°C/K), > 0 e < deltaT
 * @returns {number} Comprimento estimado do plume térmico (m)
 * @throws {RangeError} Se parâmetros forem inválidos
 */
export function calcThermalPlumeLength(alpha: number, velocity_m_s: number, deltaT: number, targetDeltaT: number): number {
    if (alpha <= 0) throw new RangeError('alpha must be > 0');
    if (velocity_m_s <= 0) throw new RangeError('velocity_m_s must be > 0');
    if (deltaT <= 0) throw new RangeError('deltaT must be > 0');
    if (targetDeltaT <= 0 || targetDeltaT >= deltaT) {
        throw new RangeError('targetDeltaT must be in (0, deltaT)');
    }

    // Escala de comprimento difusivo: L_D = alpha / velocity (m)
    const L_D = alpha / velocity_m_s;

    // Fator de redução de temperatura
    const ratio = targetDeltaT / deltaT;

    // Aproximação conservativa: L ≈ L_D × (deltaT/targetDeltaT)²
    // Derivado de inversão da solução erfc para steady-state 1D
    return L_D * Math.pow(1 / ratio, 2) * 0.25;
}

/**
 * Calcula a temperatura do solo a uma dada profundidade e tempo do ano.
 * Solução de Carslaw & Jaeger (1959) para oscilação senoidal na superfície:
 * T(z,t) = T_mean + A × exp(-z × sqrt(π/(α×P))) × cos(2π×t/P - z × sqrt(π/(α×P)))
 *
 * @param {number} depth_m           - Profundidade (m), ≥ 0
 * @param {number} surfaceTemp       - Temperatura média anual na superfície (°C)
 * @param {number} annualAmplitude   - Amplitude de oscilação anual (°C), ≥ 0
 * @param {number} period_yr         - Período (anos), tipicamente 1.0
 * @param {number} thermalDiffusivity - α (m²/s), > 0
 * @param {number} [time_yr=0]       - Tempo decorrido no ano (anos, 0–period_yr)
 * @returns {number} Temperatura estimada T(z,t) (°C)
 * @throws {RangeError} Se parâmetros forem inválidos
 */
export function calcGroundTemperature(
    depth_m: number,
    surfaceTemp: number,
    annualAmplitude: number,
    period_yr: number,
    thermalDiffusivity: number,
    time_yr: number = 0,
): number {
    if (depth_m < 0) throw new RangeError('depth_m must be >= 0');
    if (annualAmplitude < 0) throw new RangeError('annualAmplitude must be >= 0');
    if (period_yr <= 0) throw new RangeError('period_yr must be > 0');
    if (thermalDiffusivity <= 0) throw new RangeError('thermalDiffusivity must be > 0');

    // Converter período de anos para segundos
    const P_s = period_yr * 365.25 * 24 * 3600;
    const omega = TWO_PI / P_s;
    const t_s = time_yr * 365.25 * 24 * 3600;

    // Fator de atenuação e atraso de fase por profundidade
    const damping_factor = Math.sqrt(omega / (2 * thermalDiffusivity));
    const attenuation = Math.exp(-depth_m * damping_factor);
    const phase_shift = depth_m * damping_factor;

    return surfaceTemp + annualAmplitude * attenuation * Math.cos(omega * t_s - phase_shift);
}

/**
 * Calcula o gradiente geotérmico entre dois pontos de medição.
 * Gradiente = ΔT / Δz × 1000 (°C/km)
 *
 * Valor típico crosta continental: 25–30°C/km (Domenico & Schwartz 1998).
 *
 * @param {number} T1      - Temperatura no ponto 1 (°C)
 * @param {number} T2      - Temperatura no ponto 2 (°C), T2 > T1 esperado para z2 > z1
 * @param {number} depth1  - Profundidade do ponto 1 (m), ≥ 0
 * @param {number} depth2  - Profundidade do ponto 2 (m), > depth1
 * @returns {number} Gradiente geotérmico (°C/km)
 * @throws {RangeError} Se profundidades forem iguais ou inválidas
 */
export function calcGeothermalGradient(T1: number, T2: number, depth1: number, depth2: number): number {
    if (depth1 < 0) throw new RangeError('depth1 must be >= 0');
    if (depth2 <= depth1) throw new RangeError('depth2 must be > depth1');

    const deltaT = T2 - T1;
    const deltaZ_km = (depth2 - depth1) / 1000;

    return deltaT / deltaZ_km;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilRemediationTimeModelMeta = {
    name: 'soilRemediationTimeModel',
    description: 'soilRemediationTimeModel',
    category: 'analytics',
    familyTags: ['soil', 'remediation', 'hydrocarbon'],
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
