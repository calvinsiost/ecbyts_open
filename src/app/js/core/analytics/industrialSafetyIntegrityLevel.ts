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
 * @module industrialSafetyIntegrityLevel
 * @description Safety Integrity Level (SIL) calculations per IEC 61508:2010 and IEC 61511:2016.
 * Provides Probability of Failure on Demand (PFD), Risk Reduction Factor (RRF), SIL
 * classification, independent protection layer combination, and diagnostic coverage.
 *
 * Academic references:
 *   IEC 61508:2010 - Functional Safety of E/E/PE Safety-related Systems, Table 2 (SIL PFD ranges)
 *   IEC 61511:2016 - Functional Safety: Safety Instrumented Systems for the Process Industry Sector
 *   Smith & Simpson (2004) Functional Safety. ISBN 0-7506-5556-5. Elsevier Butterworth-Heinemann.
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
 * SIL PFD boundary table per IEC 61508:2010 Table 2 (low-demand mode).
 * Key: lower bound (inclusive) of PFD range; value: SIL label.
 * @private
 */
const SIL_TABLE: ReadonlyArray<{ pfdMin: number; pfdMax: number; label: 'SIL1' | 'SIL2' | 'SIL3' | 'SIL4' }> = [
    { pfdMin: 1e-5, pfdMax: 1e-4, label: 'SIL4' },
    { pfdMin: 1e-4, pfdMax: 1e-3, label: 'SIL3' },
    { pfdMin: 1e-3, pfdMax: 1e-2, label: 'SIL2' },
    { pfdMin: 1e-2, pfdMax: 0.1, label: 'SIL1' },
];

/**
 * Calcula a Probabilidade de Falha por Demanda (PFD_avg) para um sistema de segurança
 * em modo de baixa demanda, usando a aproximação linear de primeira ordem.
 *
 * Formula: PFD_avg = λ × TI / 2
 *   onde λ é a taxa de falha perigosa não detectada e TI é o intervalo de teste em horas.
 *
 * @param {number} lambda - Dangerous undetected failure rate (failures/hr), must be > 0
 * @param {number} testInterval_hr - Proof-test interval in hours, must be > 0
 * @returns {{ PFD: number, lambda: number, testInterval_hr: number }}
 *
 * @example
 * calcPFD(1e-5, 8760) // annual test
 * // => { PFD: 0.0438, lambda: 1e-5, testInterval_hr: 8760 }
 */
export function calcPFD(
    lambda: number,
    testInterval_hr: number,
): { PFD: number; lambda: number; testInterval_hr: number } {
    if (typeof lambda !== 'number' || !isFinite(lambda) || lambda <= 0) {
        throw new RangeError(`lambda must be a positive finite number, got: ${lambda}`);
    }
    if (typeof testInterval_hr !== 'number' || !isFinite(testInterval_hr) || testInterval_hr <= 0) {
        throw new RangeError(`testInterval_hr must be a positive finite number, got: ${testInterval_hr}`);
    }
    const PFD = (lambda * testInterval_hr) / 2;
    return { PFD, lambda, testInterval_hr };
}

/**
 * Calcula o Fator de Reducao de Risco (RRF) a partir do PFD.
 * RRF = 1 / PFD
 *
 * @param {number} PFD - Probability of Failure on Demand, must be > 0 and <= 1
 * @returns {{ RRF: number, PFD: number }}
 */
export function calcRiskReductionFactor(PFD: number): { RRF: number; PFD: number } {
    if (typeof PFD !== 'number' || !isFinite(PFD) || PFD <= 0 || PFD > 1) {
        throw new RangeError(`PFD must be in (0, 1], got: ${PFD}`);
    }
    return { RRF: 1 / PFD, PFD };
}

/**
 * Classifica o nivel SIL com base no PFD, conforme IEC 61508:2010 Tabela 2 (modo baixa demanda).
 *
 * | SIL | PFD range           |
 * |-----|---------------------|
 * |  4  | 1e-5 <= PFD < 1e-4  |
 * |  3  | 1e-4 <= PFD < 1e-3  |
 * |  2  | 1e-3 <= PFD < 1e-2  |
 * |  1  | 1e-2 <= PFD < 0.1   |
 *
 * @param {number} PFD - Probability of Failure on Demand
 * @returns {'SIL1'|'SIL2'|'SIL3'|'SIL4'|'below_SIL1'|'above_SIL4'}
 */
export function classifySIL(
    PFD: number,
): 'SIL1' | 'SIL2' | 'SIL3' | 'SIL4' | 'below_SIL1' | 'above_SIL4' {
    if (typeof PFD !== 'number' || !isFinite(PFD) || PFD <= 0) {
        throw new RangeError(`PFD must be a positive finite number, got: ${PFD}`);
    }
    for (const band of SIL_TABLE) {
        if (PFD >= band.pfdMin && PFD < band.pfdMax) {
            return band.label;
        }
    }
    if (PFD >= 0.1) return 'below_SIL1';
    return 'above_SIL4';
}

/**
 * Calcula o PFD total de um sistema com N camadas de protecao independentes (IPL).
 * Para sistemas em serie (independentes): PFD_sistema = produto de todos os PFD_i.
 *
 * @param {number[]} layers - Array de valores PFD de cada camada, todos em (0, 1]
 * @returns {{ systemPFD: number, layers: number[], count: number }}
 */
export function calcSystemPFD(layers: number[]): { systemPFD: number; layers: number[]; count: number } {
    if (!Array.isArray(layers) || layers.length === 0) {
        throw new TypeError('layers must be a non-empty array');
    }
    let product = 1;
    for (let i = 0; i < layers.length; i++) {
        const pfd = layers[i];
        if (typeof pfd !== 'number' || !isFinite(pfd) || pfd <= 0 || pfd > 1) {
            throw new RangeError(`layers[${i}] must be in (0, 1], got: ${pfd}`);
        }
        product *= pfd;
    }
    return { systemPFD: product, layers, count: layers.length };
}

/**
 * Calcula a Cobertura de Diagnostico (DC) de um sistema de seguranca.
 * DC (%) = safe_failures / total_failures × 100
 *
 * @param {number} safe_failures - Numero de falhas seguras detectadas/diagnosticaveis
 * @param {number} total_failures - Numero total de falhas (safe + dangerous)
 * @returns {{ DC_pct: number, safe_failures: number, total_failures: number }}
 */
export function calcDiagnosticCoverage(
    safe_failures: number,
    total_failures: number,
): { DC_pct: number; safe_failures: number; total_failures: number } {
    if (typeof safe_failures !== 'number' || !isFinite(safe_failures) || safe_failures < 0) {
        throw new RangeError(`safe_failures must be >= 0, got: ${safe_failures}`);
    }
    if (typeof total_failures !== 'number' || !isFinite(total_failures) || total_failures <= 0) {
        throw new RangeError(`total_failures must be > 0, got: ${total_failures}`);
    }
    if (safe_failures > total_failures) {
        throw new RangeError('safe_failures cannot exceed total_failures');
    }
    const DC_pct = (safe_failures / total_failures) * 100;
    return { DC_pct, safe_failures, total_failures };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialSafetyIntegrityLevelMeta: AnalyticsModuleMeta = {
    name: 'industrialSafetyIntegrityLevel',
    description: 'industrialSafetyIntegrityLevel',
    category: 'analytics',
    familyTags: ['industrial', 'risk'],
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
