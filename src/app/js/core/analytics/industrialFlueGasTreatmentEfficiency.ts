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
// Application: EHS & Mining - Industrial Flue Gas Treatment Efficiency
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Flue Gas Treatment Efficiency
 *
 * Módulo puro para cálculo de eficiência de sistemas de tratamento de gases de
 * exaustão industrial: remoção de SO2, NOx e MP, desempenho de scrubbers wet/dry,
 * eficiência de precipitadores eletrostáticos e classificação de conformidade.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Cooper, C. D. & Alley, F. C. (2011). Air Pollution Control: A Design Approach
 *     (4th ed.). Waveland Press. ISBN: 978-1-57766-678-3. (scrubber design, ESP)
 *   - US EPA (1999). OAQPS Control Cost Manual (5th ed.). EPA/453/B-96-001.
 *     Chapter 2: ESP efficiency (Deutsch-Anderson equation). Chapter 6: wet scrubbers.
 *   - Seinfeld, J. H. & Pandis, S. N. (2016). Atmospheric Chemistry and Physics:
 *     From Air Pollution to Climate Change (3rd ed.). Wiley. ISBN: 978-1-118-94740-1.
 *     (gas-phase removal kinetics, SO2 oxidation)
 *   - ABNT NBR 13231:1994 - Qualidade do ar: padrões de emissão para fontes fixas
 *     (SO2, NOx, MP - limites de referência brasileiros)
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

interface EmissionInput {
    SO2_mg_Nm3: number;
    NOx_mg_Nm3: number;
    PM_mg_Nm3: number;
}

interface ComplianceResult {
    compliant: boolean;
    margin_pct: number;
    limit_mg_Nm3: number;
}

// Constantes físicas e limites regulatórios
// Physical constants and regulatory limits
// eslint-disable-next-line
const GRAVITY_MS2 = 9.81; // aceleração gravitacional (m/s²)
// eslint-disable-next-line
const MOLAR_MASS_SO2 = 64.066; // massa molar SO2 (g/mol)
// eslint-disable-next-line
const MOLAR_MASS_NOX = 46.006; // massa molar NO2 equivalente (g/mol)
const ABNT_SO2_LIMIT_MG_NM3 = 2000; // limite ABNT NBR 13231 para SO2 (mg/Nm³)
const ABNT_NOX_LIMIT_MG_NM3 = 630; // limite ABNT NBR 13231 para NOx (mg/Nm³)
const ABNT_PM_LIMIT_MG_NM3 = 120; // limite ABNT NBR 13231 para MP (mg/Nm³)

/**
 * Calcula a eficiência de remoção de um precipitador eletrostático (ESP)
 * usando a equação de Deutsch-Anderson.
 *
 * Calculate ESP removal efficiency using the Deutsch-Anderson equation.
 * Eta = 1 - exp(-w * A / Q)
 * Cooper & Alley (2011), cap. 6; EPA OAQPS Manual cap. 2.
 *
 * @param driftVelocity_m_s  - velocidade de deriva das partículas (m/s), >0
 * @param plateArea_m2       - área total das placas coletoras (m²), >0
 * @param gasFlowRate_m3_s   - vazão volumétrica do gás (m³/s), >0
 * @returns eficiência de remoção (fração 0–1)
 * @throws {TypeError} se parâmetros não forem números
 * @throws {RangeError} se parâmetros forem ≤ 0
 */
export function calcESPRemovalEfficiency(
    driftVelocity_m_s: number,
    plateArea_m2: number,
    gasFlowRate_m3_s: number,
): number {
    if (
        typeof driftVelocity_m_s !== 'number' ||
        typeof plateArea_m2 !== 'number' ||
        typeof gasFlowRate_m3_s !== 'number'
    ) {
        throw new TypeError('calcESPRemovalEfficiency: todos os parâmetros devem ser números');
    }
    if (driftVelocity_m_s <= 0 || plateArea_m2 <= 0 || gasFlowRate_m3_s <= 0) {
        throw new RangeError('calcESPRemovalEfficiency: parâmetros devem ser > 0');
    }

    // Equação de Deutsch-Anderson: eta = 1 - exp(-w * A / Q)
    // w = velocidade de deriva (m/s), A = área das placas (m²), Q = vazão (m³/s)
    const eta = 1 - Math.exp(-(driftVelocity_m_s * plateArea_m2) / gasFlowRate_m3_s);
    return Math.min(Math.max(eta, 0), 1);
}

/**
 * Calcula a eficiência de remoção de SO2 em scrubber úmido (Venturi/torre de recheio).
 *
 * Calculate SO2 removal efficiency in a wet scrubber using the number of transfer
 * units (NTU) model.
 * E = 1 - exp(-NTU)   onde NTU = KGa * Z / G'
 * Cooper & Alley (2011), cap. 3; Seinfeld & Pandis (2016), eq. 21.1.
 *
 * @param massTransferCoeff_mol_m2_s  - coeficiente de transferência de massa KGa (mol/m²/s/atm), >0
 * @param packingHeight_m             - altura do recheio ou zona ativa (m), >0
 * @param molarGasFlux_mol_m2_s       - fluxo molar do gás G' (mol/m²/s), >0
 * @returns eficiência de remoção de SO2 (fração 0–1)
 * @throws {TypeError} se parâmetros não forem números
 * @throws {RangeError} se parâmetros forem ≤ 0
 */
export function calcWetScrubberSO2Efficiency(
    massTransferCoeff_mol_m2_s: number,
    packingHeight_m: number,
    molarGasFlux_mol_m2_s: number,
): number {
    if (
        typeof massTransferCoeff_mol_m2_s !== 'number' ||
        typeof packingHeight_m !== 'number' ||
        typeof molarGasFlux_mol_m2_s !== 'number'
    ) {
        throw new TypeError('calcWetScrubberSO2Efficiency: todos os parâmetros devem ser números');
    }
    if (massTransferCoeff_mol_m2_s <= 0 || packingHeight_m <= 0 || molarGasFlux_mol_m2_s <= 0) {
        throw new RangeError('calcWetScrubberSO2Efficiency: parâmetros devem ser > 0');
    }

    // NTU = KGa * Z / G'   (número de unidades de transferência)
    const NTU = (massTransferCoeff_mol_m2_s * packingHeight_m) / molarGasFlux_mol_m2_s;
    const efficiency = 1 - Math.exp(-NTU);
    return Math.min(Math.max(efficiency, 0), 1);
}

/**
 * Calcula a concentração de poluente na saída do sistema de tratamento.
 *
 * Calculate outlet pollutant concentration given inlet concentration and
 * removal efficiency.
 * C_out = C_in * (1 - eta)
 *
 * @param inletConc_mg_Nm3   - concentração na entrada (mg/Nm³), ≥ 0
 * @param removalEfficiency  - eficiência de remoção (fração 0–1), 0 ≤ eta ≤ 1
 * @returns concentração na saída (mg/Nm³)
 * @throws {TypeError} se parâmetros não forem números
 * @throws {RangeError} se valores estiverem fora dos limites
 */
export function calcOutletConcentration(inletConc_mg_Nm3: number, removalEfficiency: number): number {
    if (typeof inletConc_mg_Nm3 !== 'number' || typeof removalEfficiency !== 'number') {
        throw new TypeError('calcOutletConcentration: parâmetros devem ser números');
    }
    if (inletConc_mg_Nm3 < 0) {
        throw new RangeError('calcOutletConcentration: concentração de entrada deve ser ≥ 0');
    }
    if (removalEfficiency < 0 || removalEfficiency > 1) {
        throw new RangeError('calcOutletConcentration: eficiência deve ser entre 0 e 1');
    }

    // Concentração de saída = entrada × (1 - eficiência)
    return inletConc_mg_Nm3 * (1 - removalEfficiency);
}

/**
 * Classifica a conformidade regulatória das emissões tratadas com base nos
 * limites da ABNT NBR 13231.
 *
 * Classify regulatory compliance of treated emissions against ABNT NBR 13231 limits.
 * Returns compliance status and margin for SO2, NOx, and PM separately.
 *
 * @param emissions  - concentrações na saída
 * @throws {TypeError} se emissions não for objeto ou campos não forem números
 * @throws {RangeError} se concentrações forem negativas
 */
export function classifyEmissionCompliance(emissions: EmissionInput): {
    SO2: ComplianceResult;
    NOx: ComplianceResult;
    PM: ComplianceResult;
    overallCompliant: boolean;
} {
    if (!emissions || typeof emissions !== 'object') {
        throw new TypeError('classifyEmissionCompliance: emissions deve ser um objeto');
    }
    const { SO2_mg_Nm3, NOx_mg_Nm3, PM_mg_Nm3 } = emissions;
    for (const [name, val] of [
        ['SO2_mg_Nm3', SO2_mg_Nm3],
        ['NOx_mg_Nm3', NOx_mg_Nm3],
        ['PM_mg_Nm3', PM_mg_Nm3],
    ] as [string, number][]) {
        if (typeof val !== 'number') {
            throw new TypeError(`classifyEmissionCompliance: ${name} deve ser número`);
        }
        if (val < 0) {
            throw new RangeError(`classifyEmissionCompliance: ${name} deve ser ≥ 0`);
        }
    }

    // Calcula margem em relação ao limite: positiva = abaixo do limite (conforme)
    // margin_pct > 0 significa espaço disponível abaixo do limite regulatório
    const makeResult = (value: number, limit: number): ComplianceResult => ({
        compliant: value <= limit,
        margin_pct: ((limit - value) / limit) * 100,
        limit_mg_Nm3: limit,
    });

    const SO2result = makeResult(SO2_mg_Nm3, ABNT_SO2_LIMIT_MG_NM3);
    const NOxResult = makeResult(NOx_mg_Nm3, ABNT_NOX_LIMIT_MG_NM3);
    const PMresult = makeResult(PM_mg_Nm3, ABNT_PM_LIMIT_MG_NM3);

    return {
        SO2: SO2result,
        NOx: NOxResult,
        PM: PMresult,
        overallCompliant: SO2result.compliant && NOxResult.compliant && PMresult.compliant,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialFlueGasTreatmentEfficiencyMeta: AnalyticsModuleMeta = {
    name: 'industrialFlueGasTreatmentEfficiency',
    description: 'Industrial Flue Gas Treatment Efficiency',
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
