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
// Application: EHS & Mining - Industrial Static Equipment RBI
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Static Equipment Risk-Based Inspection (RBI)
 *
 * Modulo puro implementando o framework de Inspecao Baseada em Risco (RBI)
 * para equipamentos estaticos industriais (vasos de pressao, tanques, tubulacoes).
 * Calcula probabilidade de falha por mecanismo de dano (corrosao, fadiga),
 * consequencia de falha (area de impacto), score de risco e prioridade de
 * inspecao. Zero dependencias de DOM, IDB, Three.js ou fetch.
 *
 * Referencias:
 *   - API RP 580 (2016). Risk-Based Inspection. 3rd ed.
 *     American Petroleum Institute. (RBI framework, risk matrix, inspection
 *     planning methodology)
 *   - API RP 581 (2016). Risk-Based Inspection Methodology. 3rd ed.
 *     American Petroleum Institute. (quantitative PoF and CoF calculations,
 *     damage factor tables, consequence area models)
 *   - DNV-RP-G101 (2010). Risk Based Inspection of Offshore Topsides Static
 *     Mechanical Equipment. Det Norske Veritas. (offshore extensions,
 *     corrosion allowance, remaining life)
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
 * Validates that a value is a finite positive number.
 * Valida que o valor e um numero finito positivo.
 * @param value - Valor a validar
 * @param name  - Nome do parametro
 * @throws {TypeError}   Se nao for numero
 * @throws {RangeError}  Se nao for finito ou positivo
 */
function requirePositiveFinite(value: number, name: string): void {
    if (typeof value !== 'number') throw new TypeError(`${name} must be a number`);
    if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got ${value}`);
    }
}

/**
 * Validates that a value is a finite non-negative number.
 * Valida que o valor e um numero finito nao-negativo.
 * @param value - Valor a validar
 * @param name  - Nome do parametro
 */
function requireNonNegativeFinite(value: number, name: string): void {
    if (typeof value !== 'number') throw new TypeError(`${name} must be a number`);
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${name} must be finite and >= 0, got ${value}`);
    }
}

// ---------------------------------------------------------------------------
// Probabilidade de Falha (Probability of Failure)
// ---------------------------------------------------------------------------

/**
 * Calculates the generic Probability of Failure (PoF) for a static equipment
 * item subject to a corrosion or fatigue damage mechanism.
 *
 * Calcula a Probabilidade de Falha generica para um mecanismo de dano de
 * corrosao ou fadiga. O modelo usa fator de dano (Df), frequencia base de
 * falha e fator de gestao do sistema de integridade (Fms).
 *
 * Modelo (API RP 581 2016, Part 2, Section 3):
 *   PoF = gff * Df * Fms
 * onde:
 *   gff = frequencia generica de falha (failures/year) - valor tabular por
 *         tipo de equipamento (API RP 581, Table 3.1)
 *   Df  = fator de dano adimensional (calculado por mecanismo)
 *   Fms = fator de gestao do sistema de integridade [0.1, 10]
 *
 * @param gff - Generic Failure Frequency (falhas/ano) - tabela API 581
 * @param Df  - Fator de dano adimensional (>= 0)
 * @param Fms - Fator de gestao do sistema de integridade [0.1, 10]
 * @returns   Probabilidade de falha (falhas/ano)
 *
 * @example
 * calcProbabilityOfFailure(1e-4, 25, 1.0) // => 0.0025 failures/year
 */
export function calcProbabilityOfFailure(gff: number, Df: number, Fms: number): number {
    requirePositiveFinite(gff, 'gff');
    requireNonNegativeFinite(Df, 'Df');
    requirePositiveFinite(Fms, 'Fms');
    if (Fms < 0.1 || Fms > 10) {
        throw new RangeError(`Fms must be in [0.1, 10], got ${Fms}`);
    }
    // PoF = gff * Df * Fms (API RP 581 2016, eq. 3-1)
    return gff * Df * Fms;
}

// ---------------------------------------------------------------------------
// Consequencia de Falha (Consequence of Failure)
// ---------------------------------------------------------------------------

/**
 * Calculates the Consequence of Failure (CoF) impact area for a pressurized
 * equipment leak scenario using a simplified release-rate model.
 *
 * Calcula a area de impacto da Consequencia de Falha (CoF) para um cenario
 * de vazamento em equipamento pressurizado. Modelo simplificado para triagem
 * de equipamentos (API RP 581 2016, Part 3).
 *
 * Modelo de area de impacto:
 *   CoF_area = C_fact * (W_rate)^0.6536
 * onde:
 *   C_fact  = fator de consequencia por fluido/fase (m²·(kg/s)^-0.6536)
 *   W_rate  = taxa de liberacao de massa (kg/s)
 *   Expoente 0.6536 - de API RP 581 (2016), Table 4.2 correlacao de area
 *
 * @param cFact   - Fator de consequencia pelo tipo de fluido (API RP 581)
 * @param wRate   - Taxa de liberacao de massa (kg/s)
 * @returns       Area de impacto da consequencia de falha (m²)
 *
 * @example
 * calcConsequenceOfFailure(100, 0.5) // => ~63.1 m²
 */
export function calcConsequenceOfFailure(cFact: number, wRate: number): number {
    requirePositiveFinite(cFact, 'cFact');
    requirePositiveFinite(wRate, 'wRate');
    // Correlacao de area de impacto (API RP 581 2016, Part 3, Section 4)
    return cFact * Math.pow(wRate, 0.6536);
}

// ---------------------------------------------------------------------------
// Score de Risco (Risk Score)
// ---------------------------------------------------------------------------

/**
 * Calculates the Risk Score for a static equipment item as the product of
 * Probability of Failure and Consequence of Failure.
 *
 * Calcula o Score de Risco como produto PoF × CoF, base da matriz de risco RBI.
 * O score de risco direciona a priorizacao de inspecao (API RP 580 2016, cap. 5).
 *
 * Risk = PoF (falhas/ano) × CoF_area (m²) => unidade: m²/ano
 *
 * @param pof  - Probabilidade de Falha (falhas/ano)
 * @param cof  - Consequencia de Falha - area de impacto (m²)
 * @returns    Score de risco (m²/ano)
 *
 * @example
 * calcRiskScore(0.0025, 63.1) // => 0.15775 m²/ano
 */
export function calcRiskScore(pof: number, cof: number): number {
    requirePositiveFinite(pof, 'pof');
    requirePositiveFinite(cof, 'cof');
    // Risco = PoF × CoF (API RP 580 2016, eq. 5-1; API RP 581 2016, Section 1.4)
    return pof * cof;
}

// ---------------------------------------------------------------------------
// Classificacao de Prioridade de Inspecao
// ---------------------------------------------------------------------------

/**
 * Classifies inspection priority (A/B/C/D) based on the risk score and
 * consequence area, following the API RP 580 risk matrix categories.
 *
 * Classifica a prioridade de inspecao (A/B/C/D) com base no score de risco
 * e area de consequencia, segundo a matriz de risco API RP 580.
 *
 * Limiares (API RP 580 2016, Figure 5-1 risk matrix):
 *   A (Highest): riskScore >= 1000 OU cof >= 10000 m²
 *   B (High)   : riskScore >= 100  OU cof >= 1000  m²
 *   C (Medium) : riskScore >= 10   OU cof >= 100   m²
 *   D (Low)    : demais casos
 *
 * @param riskScore   - Score de risco (m²/ano)
 * @param cofArea     - Area de consequencia de falha (m²)
 * @returns
 *
 * @example
 * classifyInspectionPriority(500, 5000)
 * // => { priority: 'B', label: 'High', inspectionInterval: '1-2 years' }
 */
export function classifyInspectionPriority(
    riskScore: number,
    cofArea: number,
): { priority: string; label: string; inspectionInterval: string } {
    requirePositiveFinite(riskScore, 'riskScore');
    requirePositiveFinite(cofArea, 'cofArea');

    // Matriz de risco conforme API RP 580 (2016), Figure 5-1
    if (riskScore >= 1000 || cofArea >= 10000) {
        return {
            priority: 'A',
            label: 'Highest',
            inspectionInterval: '< 1 year — immediate action required',
        };
    }
    if (riskScore >= 100 || cofArea >= 1000) {
        return {
            priority: 'B',
            label: 'High',
            inspectionInterval: '1-2 years',
        };
    }
    if (riskScore >= 10 || cofArea >= 100) {
        return {
            priority: 'C',
            label: 'Medium',
            inspectionInterval: '3-5 years',
        };
    }
    return {
        priority: 'D',
        label: 'Low',
        inspectionInterval: '> 5 years — risk-based extension possible',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialStaticEquipmentRBIMeta: AnalyticsModuleMeta = {
    name: 'industrialStaticEquipmentRBI',
    description: 'Industrial Static Equipment RBI',
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
