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
 * Industrial Stack Emission Factor - Flare Combustion Efficiency Module
 *
 * Calculations for industrial flare performance assessment per API 521 §6.3
 * and EPA Method 22 (40 CFR Part 60, Appendix A).
 *
 * References:
 * - API Standard 521, 6th ed. (2014), §6.3 - Flare Systems
 * - EPA Method 22 (40 CFR Part 60, Appendix A-7) - Visual Determination of Fugitive Emissions
 * - Leahey & Davies (1984), JAPCA 34(8):860-865, flare combustion efficiency
 *
 * @module industrialStackEmissionFactor
 */

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
 * Calcula a taxa de liberação de calor (Heat Release Rate) de um flare industrial.
 * HRR = flow_rate × LHV / 3.6 (conversão Nm³/h × MJ/Nm³ → MW)
 *
 * @param {number} flow_Nm3_h - Vazão volumétrica do gás (Nm³/h), > 0
 * @param {number} LHV_MJ_Nm3 - Poder Calorífico Inferior do gás (MJ/Nm³), > 0
 * @returns {number} HRR em MW
 * @throws {RangeError} Se parâmetros forem não-positivos
 */
export function calcFlareHeatReleaseRate(flow_Nm3_h: number, LHV_MJ_Nm3: number): number {
    if (flow_Nm3_h <= 0) throw new RangeError('flow_Nm3_h must be > 0');
    if (LHV_MJ_Nm3 <= 0) throw new RangeError('LHV_MJ_Nm3 must be > 0');
    // MW = (Nm³/h × MJ/Nm³) / (MJ/h per MW = 3600 MJ/h)
    return (flow_Nm3_h * LHV_MJ_Nm3) / 3600;
}

/**
 * Calcula a Eficiência de Destruição (Destruction Efficiency) do flare.
 * DE = CO2 / (CO2 + CO + THC) × 100, com CO e THC convertidos para base carbono.
 *
 * Equação baseada em balanço de carbono - EPA Method 18 / API 521 §6.3.
 * Unidades consistentes: todos os termos em % vol equivalente carbono.
 *
 * @param {number} CO2_pct  - Concentração de CO2 no efluente (% vol), ≥ 0
 * @param {number} CO_ppm   - Concentração de CO (ppm vol), ≥ 0
 * @param {number} THC_ppm  - Concentração de hidrocarbonetos totais como CH4 (ppm vol), ≥ 0
 * @returns {number} Eficiência de Destruição (%), 0–100
 * @throws {RangeError} Se todos os termos forem zero (divisão por zero)
 */
export function calcDestructionEfficiency(CO2_pct: number, CO_ppm: number, THC_ppm: number): number {
    if (CO2_pct < 0) throw new RangeError('CO2_pct must be >= 0');
    if (CO_ppm < 0) throw new RangeError('CO_ppm must be >= 0');
    if (THC_ppm < 0) throw new RangeError('THC_ppm must be >= 0');

    // Converter ppm para % vol (÷ 10000) para mesma base do CO2
    const CO2 = CO2_pct;
    const CO = CO_ppm / 10000;
    const THC = THC_ppm / 10000;
    const total = CO2 + CO + THC;

    if (total <= 0) throw new RangeError('Sum of CO2 + CO + THC must be > 0');

    return (CO2 / total) * 100;
}

/**
 * Calcula as emissões atmosféricas de um flare industrial.
 * Baseado em balanço de massa carbono - IPCC 2006 Vol.2 Ch.4, API 521 §6.3.
 *
 * @param {number} flow_kg_h      - Vazão mássica do gás para o flare (kg/h), > 0
 * @param {number} DE             - Eficiência de Destruição (fração 0–1), ex: 0.98
 * @param {number} carbonContent_pct - Teor de carbono do gás (% mássico), > 0
 * @returns {{ CO2_kg_h: number, CH4_kg_h: number, CO_kg_h: number }}
 * @throws {RangeError} Se parâmetros estiverem fora dos limites válidos
 */
export function calcFlareEmissions(
    flow_kg_h: number,
    DE: number,
    carbonContent_pct: number,
): { CO2_kg_h: number; CH4_kg_h: number; CO_kg_h: number } {
    if (flow_kg_h <= 0) throw new RangeError('flow_kg_h must be > 0');
    if (DE < 0 || DE > 1) throw new RangeError('DE must be between 0 and 1');
    if (carbonContent_pct <= 0 || carbonContent_pct > 100) {
        throw new RangeError('carbonContent_pct must be in (0, 100]');
    }

    const carbonFraction = carbonContent_pct / 100;
    const carbonFlow_kg_h = flow_kg_h * carbonFraction;

    // Carbono destruído → CO2 (MW_CO2/MW_C = 44/12)
    const carbonDestroyed_kg_h = carbonFlow_kg_h * DE;
    const CO2_kg_h = carbonDestroyed_kg_h * (44 / 12);

    // Carbono não destruído → particionado 90% CH4, 10% CO (estimativa EPA AP-42 §13.5)
    const carbonUnburnt_kg_h = carbonFlow_kg_h * (1 - DE);
    const CH4_kg_h = carbonUnburnt_kg_h * 0.9 * (16 / 12);
    const CO_kg_h = carbonUnburnt_kg_h * 0.1 * (28 / 12);

    return { CO2_kg_h, CH4_kg_h, CO_kg_h };
}

/**
 * Classifica o desempenho do flare com base na Eficiência de Destruição.
 * Critérios per API Standard 521 §6.3 e EPA 40 CFR Part 60 Subpart A.
 *
 * @param {number} DE_pct - Eficiência de Destruição (%), 0–100
 * @returns {'poor'|'acceptable'|'good'|'excellent'}
 * @throws {RangeError} Se DE_pct estiver fora de [0, 100]
 */
export function classifyFlarePerformance(DE_pct: number): 'poor' | 'acceptable' | 'good' | 'excellent' {
    if (DE_pct < 0 || DE_pct > 100) {
        throw new RangeError('DE_pct must be between 0 and 100');
    }
    if (DE_pct >= 99.0) return 'excellent'; // API 521 §6.3: meta de projeto
    if (DE_pct >= 96.5) return 'good'; // EPA 40 CFR 60.18(f)(1): mínimo legal EUA
    if (DE_pct >= 90.0) return 'acceptable'; // limiar operacional prático
    return 'poor';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialStackEmissionFactorMeta: AnalyticsModuleMeta = {
    name: 'industrialStackEmissionFactor',
    description: 'industrialStackEmissionFactor',
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
