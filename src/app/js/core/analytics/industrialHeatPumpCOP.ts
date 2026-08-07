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
// Application: EHS & Mining - Industrial Heat Pump COP
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Heat Pump COP - Thermodynamic efficiency analysis
 *
 * Módulo puro implementando cálculos de coeficiente de performance (COP) de
 * bombas de calor industriais segundo ASHRAE Fundamentals (2021), EN 14511:2018
 * e IEA HPT Annex 48 (2020). Aplicável em processos industriais, HVAC e
 * recuperação de calor residual. Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - ASHRAE (2021). "ASHRAE Fundamentals Handbook 2021." Chapter 2: Thermodynamics
 *     and Refrigeration Cycles. American Society of Heating, Refrigerating and
 *     Air-Conditioning Engineers, Atlanta, GA.
 *     (COP Carnot, ciclo de Rankine invertido)
 *   - EN 14511:2018. "Air conditioners, liquid chilling packages and heat pumps
 *     for space heating and cooling and process chillers, with electrically driven
 *     compressors." European Committee for Standardization, Brussels.
 *     (classificação de eficiência A++/A+/A/B/C)
 *   - IEA HPT (2020). "IEA Heat Pumping Technologies Annex 48: Quality and
 *     Reliability of Heat Pump Systems." International Energy Agency, Paris.
 *     (η_Carnot típicos por tecnologia, COP real, benchmarks industriais)
 *
 * @module core/analytics/industrialHeatPumpCOP
 */

'use strict';

/**
 * EN 14511:2018 efficiency classification thresholds for heat pumps.
 * Limites de classificação de eficiência (EN 14511:2018, Tabela 1).
 * Valores de COP mínimo para cada classe (heating mode).
 */
const EN14511_EFFICIENCY_THRESHOLDS: ReadonlyArray<{ label: string; minCOP: number }> = [
    { label: 'A++', minCOP: 5.1 },
    { label: 'A+', minCOP: 4.0 },
    { label: 'A', minCOP: 3.1 },
    { label: 'B', minCOP: 2.5 },
    { label: 'C', minCOP: 1.8 },
];

/**
 * Calculates the Carnot COP (theoretical maximum) for a heat pump.
 *
 * Calcula o COP de Carnot, que representa o limite termodinâmico superior
 * de eficiência para uma bomba de calor operando entre duas temperaturas.
 * COP_Carnot = T_hot / (T_hot - T_cold), com temperaturas absolutas em Kelvin.
 * (ASHRAE Fundamentals 2021, Cap. 2, Eq. 2.5)
 *
 * @param {number} tHotK  - Sink (condenser) temperature in Kelvin (> 0)
 * @param {number} tColdK - Source (evaporator) temperature in Kelvin (> 0)
 * @returns {number} Dimensionless Carnot COP (always > 1 when tHotK > tColdK)
 * @throws {TypeError}  if inputs are not finite numbers
 * @throws {RangeError} if temperatures are ≤ 0 or tHotK ≤ tColdK
 *
 * @example
 * calcCarnotCOP(333.15, 278.15); // 333.15 / (333.15 - 278.15) = 6.057
 */
export function calcCarnotCOP(tHotK: number, tColdK: number): number {
    if (!Number.isFinite(tHotK) || !Number.isFinite(tColdK)) {
        throw new TypeError('calcCarnotCOP: tHotK and tColdK must be finite numbers');
    }
    if (tHotK <= 0 || tColdK <= 0) {
        throw new RangeError('calcCarnotCOP: temperatures must be > 0 K');
    }
    if (tHotK <= tColdK) {
        throw new RangeError('calcCarnotCOP: tHotK must be greater than tColdK for heat pump operation');
    }
    // COP de Carnot para modo aquecimento (ASHRAE 2021 Cap. 2 Eq. 2.5)
    return tHotK / (tHotK - tColdK);
}

/**
 * Calculates the actual (real) COP of an industrial heat pump.
 *
 * Calcula o COP real da bomba de calor industrial como fração do COP de
 * Carnot. O fator de eficiência η_Carnot (também chamado second-law efficiency)
 * representa as irreversibilidades reais do ciclo (atrito, transferência de
 * calor com gradiente finito, perdas mecânicas). Valores típicos: 0.40–0.65.
 * (IEA HPT Annex 48, 2020, Tabela 3.2)
 *
 * Formula: COP_real = η_Carnot × COP_Carnot
 *
 * @param {number} tHotK      - Sink temperature in Kelvin (> 0)
 * @param {number} tColdK     - Source temperature in Kelvin (> 0)
 * @param {number} etaCarnot  - Carnot efficiency factor (0 < η ≤ 1)
 * @returns {number} Actual dimensionless COP
 * @throws {TypeError}  if any input is not a finite number
 * @throws {RangeError} if temperatures are invalid or etaCarnot is out of (0, 1]
 *
 * @example
 * calcActualCOP(333.15, 278.15, 0.5); // ~3.03
 */
export function calcActualCOP(tHotK: number, tColdK: number, etaCarnot: number): number {
    if (!Number.isFinite(tHotK) || !Number.isFinite(tColdK) || !Number.isFinite(etaCarnot)) {
        throw new TypeError('calcActualCOP: all inputs must be finite numbers');
    }
    if (etaCarnot <= 0 || etaCarnot > 1) {
        throw new RangeError('calcActualCOP: etaCarnot must be in range (0, 1]');
    }
    // COP real = eficiência de segunda lei × COP de Carnot
    const copCarnot = calcCarnotCOP(tHotK, tColdK);
    return etaCarnot * copCarnot;
}

/**
 * Calculates the annual electrical energy consumption (kWh/year) of a heat pump.
 *
 * Calcula o consumo anual de energia elétrica da bomba de calor. O consumo é
 * derivado da carga térmica anual entregue (Q_annual) dividida pelo COP real.
 * A carga térmica anual é estimada pelo produto da potência térmica nominal,
 * horas de operação anuais e fator de carga médio.
 *
 * Formula: E_annual = (Q_thermal_kW × hours × loadFactor) / COP_actual
 *
 * @param {number} thermalLoadKW - Nominal thermal output (kW, > 0)
 * @param {number} annualHours   - Annual operating hours (h/year, > 0 and ≤ 8760)
 * @param {number} loadFactor    - Average load factor (0 < loadFactor ≤ 1)
 * @param {number} actualCOP     - Actual COP of the heat pump (> 1)
 * @returns {number} Annual electrical energy consumption in kWh/year
 * @throws {TypeError}  if any input is not a finite number
 * @throws {RangeError} if any input is out of valid range
 *
 * @example
 * calcAnnualEnergyConsumption(100, 4000, 0.7, 3.5); // ~8000 kWh/year
 */
export function calcAnnualEnergyConsumption(
    thermalLoadKW: number,
    annualHours: number,
    loadFactor: number,
    actualCOP: number,
): number {
    if (
        !Number.isFinite(thermalLoadKW) ||
        !Number.isFinite(annualHours) ||
        !Number.isFinite(loadFactor) ||
        !Number.isFinite(actualCOP)
    ) {
        throw new TypeError('calcAnnualEnergyConsumption: all inputs must be finite numbers');
    }
    if (thermalLoadKW <= 0) throw new RangeError('calcAnnualEnergyConsumption: thermalLoadKW must be > 0');
    if (annualHours <= 0 || annualHours > 8760)
        throw new RangeError('calcAnnualEnergyConsumption: annualHours must be in (0, 8760]');
    if (loadFactor <= 0 || loadFactor > 1)
        throw new RangeError('calcAnnualEnergyConsumption: loadFactor must be in (0, 1]');
    if (actualCOP <= 1)
        throw new RangeError('calcAnnualEnergyConsumption: actualCOP must be > 1 for heat pump operation');

    // Energia anual = carga térmica anual / COP real
    const annualThermalKWh = thermalLoadKW * annualHours * loadFactor;
    return annualThermalKWh / actualCOP;
}

/**
 * Classifies heat pump efficiency according to EN 14511:2018 (A++/A+/A/B/C).
 *
 * Classifica a eficiência da bomba de calor segundo a norma europeia EN 14511:2018.
 * A classificação é baseada no COP real medido em condições de teste padronizadas.
 * Equipamentos com COP < 1.8 ficam abaixo da classe mínima "C" e são classificados
 * como "D" (abaixo do padrão mínimo normativo).
 *
 * @param {number} actualCOP - Measured or calculated actual COP (> 0)
 * @returns {{ label: string, description: string, compliant: boolean }}
 *   label: efficiency class label (A++, A+, A, B, C, or D)
 *   description: qualitative description
 *   compliant: true if COP meets at least class C threshold
 * @throws {TypeError}  if actualCOP is not a finite number
 * @throws {RangeError} if actualCOP ≤ 0
 *
 * @example
 * classifyHeatPumpEfficiency(4.2);
 * // { label: 'A+', description: 'High efficiency', compliant: true }
 */
export function classifyHeatPumpEfficiency(
    actualCOP: number,
): { label: string; description: string; compliant: boolean } {
    if (!Number.isFinite(actualCOP)) {
        throw new TypeError('classifyHeatPumpEfficiency: actualCOP must be a finite number');
    }
    if (actualCOP <= 0) throw new RangeError('classifyHeatPumpEfficiency: actualCOP must be > 0');

    // Classificação EN 14511:2018 - do melhor para o pior
    for (const tier of EN14511_EFFICIENCY_THRESHOLDS) {
        if (actualCOP >= tier.minCOP) {
            const descriptions: Record<string, string> = {
                'A++': 'Exceptional efficiency',
                'A+': 'High efficiency',
                A: 'Good efficiency',
                B: 'Standard efficiency',
                C: 'Minimum compliant efficiency',
            };
            return { label: tier.label, description: descriptions[tier.label]!, compliant: true };
        }
    }
    // Abaixo do limiar mínimo normativo
    return { label: 'D', description: 'Below minimum standard (EN 14511)', compliant: false };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialHeatPumpCOPMeta = {
    name: 'industrialHeatPumpCOP',
    description: 'Industrial Heat Pump COP',
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
