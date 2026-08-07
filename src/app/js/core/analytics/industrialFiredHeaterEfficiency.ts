// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Industrial Fired Heater Efficiency
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Fired Heater Efficiency
 *
 * Módulo puro para análise de eficiência de fornalhas a fogo direto em refinarias
 * e plantas industriais. Implementa os métodos de eficiência por composição de gás
 * de exaustão, cálculo de duty térmico, perdas nos gases de chaminé e classificação
 * de desempenho operacional.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - API STD 560 (2016). Fired Heaters for General Refinery Service. 4th ed.
 *     American Petroleum Institute, Washington, DC. (padrão de projeto e eficiência)
 *   - Baukal, C. E. (Ed.) (2013). The John Zink Combustion Handbook. 2nd ed.
 *     CRC Press. ISBN 978-1-4398-3158-5. (combustão, eficiência, gases de exaustão)
 *   - Ganapathy, V. (2003). Industrial Boilers and Heat Recovery Steam Generators.
 *     Marcel Dekker. ISBN 978-0-8247-4713-8. (calor sensível dos gases de chaminé)
 *
 * @module industrialFiredHeaterEfficiency
 */

'use strict';

/**
 * Cp médio do gás de exaustão seco (kJ/kg·K) - estimativa padrão para
 * gases de combustão de hidrocarbonetos a temperaturas típicas de chaminé.
 * Baukal (2013), Tabela 3.2.
 */
const CP_FLUE_GAS_DRY = 1.05; // kJ/(kg·K)

/**
 * Cp do vapor d'água nos gases (kJ/kg·K) - a 200–600°C.
 * Baukal (2013), Tabela 3.3.
 */
const CP_WATER_VAPOR = 1.97; // kJ/(kg·K)

/**
 * Temperatura de referência de combustão (°C) - base do cálculo de entalpia.
 */
const T_REF_C = 15.0;

/**
 * Calcula a eficiência de combustão com base na composição do gás de exaustão.
 * Método indireto (método das perdas): η = 1 − (perdas / PCI_combustível).
 * API STD 560 §6.3; Baukal (2013) Cap. 4.
 *
 * Eficiência por calor não aproveitado no gás de chaminé:
 *   η_comb = 1 − (m_flue × Cp_flue × ΔT) / Q_fuel
 *
 * @param {number} fuelHHV_kJkg    - Poder Calorífico Superior do combustível (kJ/kg)
 * @param {number} flueTemp_C      - Temperatura dos gases de exaustão na saída (°C)
 * @param {number} airTemp_C       - Temperatura do ar de combustão (°C)
 * @param {number} excessAirFrac   - Fração de excesso de ar (0.1 = 10 %)
 * @param {number} airFuelRatio    - Razão ar/combustível mássica estequiométrica (kg_ar/kg_comb)
 * @returns {{ efficiency: number, flueHeatLoss_kJkg: number }}
 *   efficiency: fração (0–1); flueHeatLoss_kJkg: calor perdido nos gases (kJ/kg_comb)
 */
export function calcCombustionEfficiency(fuelHHV_kJkg: number, flueTemp_C: number, airTemp_C: number, excessAirFrac: number, airFuelRatio: number): { efficiency: number, flueHeatLoss_kJkg: number } {
    if (typeof fuelHHV_kJkg !== 'number' || fuelHHV_kJkg <= 0) {
        throw new RangeError('fuelHHV_kJkg deve ser número positivo (kJ/kg)');
    }
    if (typeof flueTemp_C !== 'number' || flueTemp_C <= airTemp_C) {
        throw new RangeError('flueTemp_C deve ser maior que airTemp_C');
    }
    if (typeof excessAirFrac !== 'number' || excessAirFrac < 0) {
        throw new RangeError('excessAirFrac deve ser >= 0');
    }
    if (typeof airFuelRatio !== 'number' || airFuelRatio <= 0) {
        throw new RangeError('airFuelRatio deve ser número positivo');
    }

    // Massa total de gás de exaustão por kg de combustível (kg_flue / kg_comb)
    // = (1 + excesso_ar) × razão_ar_comb + 1 (produtos de combustão)
    const massFlue_kgkg = (1 + excessAirFrac) * airFuelRatio + 1;

    // Calor perdido nos gases secos (kJ/kg_comb)
    const deltaT = flueTemp_C - airTemp_C;
    const flueHeatLoss_kJkg = massFlue_kgkg * CP_FLUE_GAS_DRY * deltaT;

    // Eficiência de combustão (fração)
    const efficiency = Math.max(0, Math.min(1, 1 - flueHeatLoss_kJkg / fuelHHV_kJkg));

    return { efficiency, flueHeatLoss_kJkg };
}

/**
 * Calcula o duty térmico (carga térmica) de uma fornalha industrial.
 * API STD 560 §5.2; Baukal (2013) Cap. 5.
 *
 * Q_duty = m_fuel × HHV × η_comb
 *
 * @param {number} fuelMassFlow_kgs  - Vazão mássica de combustível (kg/s)
 * @param {number} fuelHHV_kJkg      - Poder Calorífico Superior (kJ/kg)
 * @param {number} combustionEff     - Eficiência de combustão (fração, 0–1)
 * @returns {{ heatDuty_kW: number, heatDuty_MW: number }}
 *   heatDuty_kW: duty em kW; heatDuty_MW: duty em MW
 */
export function calcHeatDuty(fuelMassFlow_kgs: number, fuelHHV_kJkg: number, combustionEff: number): { heatDuty_kW: number, heatDuty_MW: number } {
    if (typeof fuelMassFlow_kgs !== 'number' || fuelMassFlow_kgs <= 0) {
        throw new RangeError('fuelMassFlow_kgs deve ser número positivo (kg/s)');
    }
    if (typeof fuelHHV_kJkg !== 'number' || fuelHHV_kJkg <= 0) {
        throw new RangeError('fuelHHV_kJkg deve ser número positivo (kJ/kg)');
    }
    if (typeof combustionEff !== 'number' || combustionEff <= 0 || combustionEff > 1) {
        throw new RangeError('combustionEff deve estar entre 0 (exclusivo) e 1 (inclusivo)');
    }

    // Duty térmico líquido aproveitado (kW)
    const heatDuty_kW = fuelMassFlow_kgs * fuelHHV_kJkg * combustionEff;

    return { heatDuty_kW, heatDuty_MW: heatDuty_kW / 1000 };
}

/**
 * Calcula o calor perdido nos gases de exaustão da chaminé.
 * Considera fração de vapor d'água nos gases. API STD 560 §6.4;
 * Ganapathy (2003) Cap. 2.
 *
 * Q_loss = m_dry × Cp_dry × ΔT + m_steam × Cp_steam × ΔT + m_steam × h_vap_ref
 *
 * @param {number} massFlowDry_kgs   - Vazão de gás seco (kg/s)
 * @param {number} massFlowSteam_kgs - Vazão de vapor d'água nos gases (kg/s)
 * @param {number} flueTemp_C        - Temperatura dos gases de exaustão (°C)
 * @param {number} refTemp_C         - Temperatura de referência (°C; padrão 15)
 * @returns {{ heatLoss_kW: number, heatLossDry_kW: number, heatLossSteam_kW: number }}
 */
export function calcFlueGasHeatLoss(massFlowDry_kgs: number, massFlowSteam_kgs: number, flueTemp_C: number, refTemp_C: number = T_REF_C): { heatLoss_kW: number, heatLossDry_kW: number, heatLossSteam_kW: number } {
    if (typeof massFlowDry_kgs !== 'number' || massFlowDry_kgs < 0) {
        throw new RangeError('massFlowDry_kgs deve ser >= 0');
    }
    if (typeof massFlowSteam_kgs !== 'number' || massFlowSteam_kgs < 0) {
        throw new RangeError('massFlowSteam_kgs deve ser >= 0');
    }
    if (typeof flueTemp_C !== 'number' || flueTemp_C <= refTemp_C) {
        throw new RangeError('flueTemp_C deve ser maior que refTemp_C');
    }

    const deltaT = flueTemp_C - refTemp_C;

    // Calor sensível do gás seco (kW)
    const heatLossDry_kW = massFlowDry_kgs * CP_FLUE_GAS_DRY * deltaT;

    // Calor sensível + latente do vapor d'água nos gases (kW)
    // Entalpia de vaporização a T_ref ≈ 2442 kJ/kg (água a 15°C)
    const H_VAP_REF = 2442; // kJ/kg
    const heatLossSteam_kW = massFlowSteam_kgs * (CP_WATER_VAPOR * deltaT + H_VAP_REF);

    const heatLoss_kW = heatLossDry_kW + heatLossSteam_kW;

    return { heatLoss_kW, heatLossDry_kW, heatLossSteam_kW };
}

/**
 * Classifica o desempenho de uma fornalha com base na eficiência de combustão.
 * Limites baseados em API STD 560 (2016) §7 e prática industrial típica de
 * refinaria (Baukal 2013, Cap. 5, Tabela 5.1).
 *
 * @param {number} efficiency - Eficiência de combustão (fração, 0–1)
 * @returns {{ classification: string, description: string, minEfficiency: number }}
 *   classification: 'below_spec' | 'standard' | 'good' | 'excellent'
 */
export function classifyHeaterPerformance(efficiency: number): { classification: string, description: string, minEfficiency: number } {
    if (typeof efficiency !== 'number' || efficiency < 0 || efficiency > 1) {
        throw new RangeError('efficiency deve ser fração entre 0 e 1');
    }

    // Limites típicos de desempenho para fornalhas de refinaria (API STD 560)
    if (efficiency >= 0.92) {
        return {
            classification: 'excellent',
            description: 'Excelente — acima do padrão de projeto (≥92 %)',
            minEfficiency: 0.92,
        };
    }
    if (efficiency >= 0.85) {
        return {
            classification: 'good',
            description: 'Bom — dentro do envelope operacional otimizado (85–92 %)',
            minEfficiency: 0.85,
        };
    }
    if (efficiency >= 0.75) {
        return {
            classification: 'standard',
            description: 'Padrão — operação aceitável mas com margem de melhoria (75–85 %)',
            minEfficiency: 0.75,
        };
    }
    return {
        classification: 'below_spec',
        description: 'Abaixo da especificação — intervenção necessária (<75 %)',
        minEfficiency: 0,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}
interface AnalyticsModuleProvenance {
    generatedBy: string;
    version: string;
    validatedByHuman: boolean;
    disclaimerAcknowledged: boolean;
    specRef: string;
    citation?: string;
}
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: AnalyticsModuleProvenance;
    inputSchema: AnalyticsJsonSchema;
    outputSchema: AnalyticsJsonSchema;
}

export const industrialFiredHeaterEfficiencyMeta: AnalyticsModuleMeta = {
    name: 'industrialFiredHeaterEfficiency',
    description: 'Industrial Fired Heater Efficiency',
    category: 'analytics',
    familyTags: ['industrial', 'fire'],
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
