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
 * Industrial Process Efficiency Metrics
 *
 * Implements exergy analysis and OEE (Overall Equipment Effectiveness)
 * for industrial and environmental process performance assessments.
 *
 * Academic references:
 *  - Szargut, J., Morris, D.R., Steward, F.R. (1988). Exergy Analysis of
 *    Thermal, Chemical, and Metallurgical Processes. ISBN:9780876649763
 *  - Nakajima, S. (1988). Introduction to TPM: Total Productive Maintenance.
 *    Productivity Press. ISBN:9780915299546
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

/**
 * Calcula a eficiência exergética de um processo industrial.
 * Representa a fração de exergia útil em relação à exergia total fornecida.
 *
 * @param {number} useful_exergy_kW       - Exergia útil na saída em kW (≥ 0)
 * @param {number} total_exergy_input_kW  - Exergia total de entrada em kW (> 0)
 * @returns {{ exergy_efficiency_pct: number }}
 */
export function computeExergyEfficiency(
    useful_exergy_kW: number,
    total_exergy_input_kW: number,
): { exergy_efficiency_pct: number } {
    if (typeof useful_exergy_kW !== 'number' || typeof total_exergy_input_kW !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (useful_exergy_kW < 0) {
        throw new RangeError('useful_exergy_kW must be >= 0');
    }
    if (total_exergy_input_kW <= 0) {
        throw new RangeError('total_exergy_input_kW must be > 0');
    }
    if (useful_exergy_kW > total_exergy_input_kW) {
        throw new RangeError('useful_exergy_kW cannot exceed total_exergy_input_kW');
    }

    const exergy_efficiency_pct = (useful_exergy_kW / total_exergy_input_kW) * 100;

    return { exergy_efficiency_pct };
}

/**
 * Calcula o OEE (Overall Equipment Effectiveness) - métrica padrão TPM.
 * OEE = Disponibilidade × Performance × Qualidade (Nakajima 1988).
 *
 * @param {number} availability_pct  - Disponibilidade do equipamento em % (0–100)
 * @param {number} performance_pct   - Performance operacional em % (0–100)
 * @param {number} quality_pct       - Taxa de qualidade do produto em % (0–100)
 * @returns {{ OEE_pct: number }}
 */
export function computeOEE(
    availability_pct: number,
    performance_pct: number,
    quality_pct: number,
): { OEE_pct: number } {
    if (
        typeof availability_pct !== 'number' ||
        typeof performance_pct !== 'number' ||
        typeof quality_pct !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    for (const [name, val] of [
        ['availability_pct', availability_pct],
        ['performance_pct', performance_pct],
        ['quality_pct', quality_pct],
    ] as [string, number][]) {
        if (val < 0 || val > 100) {
            throw new RangeError(`${name} must be between 0 and 100`);
        }
    }

    // OEE = A x P x Q / 10000 (normaliza dois dos tres divisores de percentual)
    const OEE_pct = (availability_pct * performance_pct * quality_pct) / 10000;

    return { OEE_pct };
}

/**
 * Calcula o Consumo Específico de Recurso (SRC - Specific Resource Consumption).
 * Mede a quantidade de recurso consumida por unidade produzida.
 *
 * @param {number} resource_consumed  - Recurso consumido (qualquer unidade) (≥ 0)
 * @param {number} product_output     - Produção resultante (mesma base) (> 0)
 * @returns {{ SRC: number }}
 */
export function computeSpecificResourceConsumption(
    resource_consumed: number,
    product_output: number,
): { SRC: number } {
    if (typeof resource_consumed !== 'number' || typeof product_output !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (resource_consumed < 0) {
        throw new RangeError('resource_consumed must be >= 0');
    }
    if (product_output <= 0) {
        throw new RangeError('product_output must be > 0 — divisão por zero não permitida');
    }

    const SRC = resource_consumed / product_output;

    return { SRC };
}

/**
 * Classifica a eficiência de processo com base no OEE e na eficiência exergética.
 * Combina métricas TPM e termodinâmicas para classificação integrada.
 *
 * @param {number} OEE_pct              - OEE em % (0–100)
 * @param {number} exergy_efficiency_pct - Eficiência exergética em % (0–100)
 * @returns {{ class: 'world_class'|'good'|'average'|'poor' }}
 */
export function classifyProcessEfficiency(
    OEE_pct: number,
    exergy_efficiency_pct: number,
): { class: 'world_class' | 'good' | 'average' | 'poor' } {
    if (typeof OEE_pct !== 'number' || typeof exergy_efficiency_pct !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    for (const [name, val] of [
        ['OEE_pct', OEE_pct],
        ['exergy_efficiency_pct', exergy_efficiency_pct],
    ] as [string, number][]) {
        if (val < 0 || val > 100) {
            throw new RangeError(`${name} must be between 0 and 100`);
        }
    }

    let cls: 'world_class' | 'good' | 'average' | 'poor';
    if (OEE_pct >= 85 && exergy_efficiency_pct >= 70) {
        cls = 'world_class';
    } else if (OEE_pct >= 75 && exergy_efficiency_pct >= 55) {
        cls = 'good';
    } else if (OEE_pct >= 65) {
        cls = 'average';
    } else {
        cls = 'poor';
    }

    return { class: cls };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialProcessEfficiencyMeta: AnalyticsModuleMeta = {
    name: 'industrialProcessEfficiency',
    description: 'industrialProcessEfficiency',
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
