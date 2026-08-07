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
 * Industrial Energy Audit Index
 * Índice de auditoria energética industrial - ISO 50001:2018 e IEA (2014).
 *
 * References / Referências:
 *   - ISO 50001:2018. Energy management systems - Requirements with guidance for use.
 *     International Organization for Standardization.
 *   - IEA (2014). Capturing the Multiple Benefits of Energy Efficiency.
 *     International Energy Agency. ISBN: 978-92-64-22072-0
 *   - UNIDO (2011). Energy Efficiency Benchmarking.
 *     United Nations Industrial Development Organization.
 *
 * @module industrialEnergyAuditIndex
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

// ─── Energy Intensity ────────────────────────────────────────────────────────

/**
 * Energy intensity per unit of production (Specific Energy Consumption - SEC).
 * Intensidade energética por unidade de produto (Consumo Específico de Energia).
 *
 * SEC = totalEnergy / production  (e.g., GJ/t or kWh/unit)
 *
 * @param params
 * @throws {RangeError}
 */
export function energyIntensity({
    totalEnergy,
    production,
    energyUnit = 'GJ',
    productUnit = 't',
}: {
    totalEnergy: number;
    production: number;
    energyUnit?: string;
    productUnit?: string;
}): { SEC: number; energyUnit: string; productUnit: string } {
    if (totalEnergy <= 0) throw new RangeError(`totalEnergy must be > 0, got ${totalEnergy}`);
    if (production <= 0) throw new RangeError(`production must be > 0, got ${production}`);
    const SEC = totalEnergy / production;
    return { SEC, energyUnit, productUnit };
}

// ─── Energy Efficiency Index ─────────────────────────────────────────────────

/**
 * Energy Efficiency Index (EEI) relative to sectoral benchmark.
 * Índice de Eficiência Energética (EEI) em relação ao benchmark setorial.
 *
 * EEI = (actual_SEC / benchmark_SEC) * 100
 *
 * EEI < 100: mais eficiente que o benchmark.
 * EEI = 100: alinhado ao benchmark.
 * EEI > 100: menos eficiente que o benchmark.
 *
 * @param actualSEC    - Actual SEC (same unit as benchmarkSEC)
 * @param benchmarkSEC - Sectoral best-practice benchmark SEC
 * @throws {RangeError}
 */
export function energyEfficiencyIndex(
    actualSEC: number,
    benchmarkSEC: number,
): { EEI: number; percentageAboveBenchmark: number; isMoreEfficientThanBenchmark: boolean } {
    if (actualSEC <= 0) throw new RangeError(`actualSEC must be > 0, got ${actualSEC}`);
    if (benchmarkSEC <= 0) throw new RangeError(`benchmarkSEC must be > 0, got ${benchmarkSEC}`);

    const EEI = (actualSEC / benchmarkSEC) * 100;
    const percentageAboveBenchmark = EEI - 100;
    const isMoreEfficientThanBenchmark = EEI < 100;
    return { EEI, percentageAboveBenchmark, isMoreEfficientThanBenchmark };
}

// ─── Savings Potential ────────────────────────────────────────────────────────

/**
 * Identifies energy saving potential and simple payback period for efficiency measures.
 * Identifica potencial de economia de energia e payback simples de medidas de eficiência.
 *
 * savingsPotentialPercent = (currentConsumption - targetConsumption) / currentConsumption * 100
 * paybackYears = investmentCost / annualSavingsCost
 *
 * @param params
 * @throws {RangeError}
 */
export function savingsPotential({
    currentConsumption,
    targetConsumption,
    energyPrice,
    investmentCost,
}: {
    currentConsumption: number;
    targetConsumption: number;
    energyPrice: number;
    investmentCost: number;
}): {
    savingsPotentialPercent: number;
    annualSavingsEnergy: number;
    annualSavingsCost: number;
    paybackYears: number;
} {
    if (currentConsumption <= 0) throw new RangeError(`currentConsumption must be > 0, got ${currentConsumption}`);
    if (targetConsumption < 0) throw new RangeError(`targetConsumption must be >= 0, got ${targetConsumption}`);
    if (targetConsumption >= currentConsumption) {
        throw new RangeError('targetConsumption must be < currentConsumption for a saving to exist');
    }
    if (energyPrice <= 0) throw new RangeError(`energyPrice must be > 0, got ${energyPrice}`);
    if (investmentCost < 0) throw new RangeError(`investmentCost must be >= 0, got ${investmentCost}`);

    const annualSavingsEnergy = currentConsumption - targetConsumption;
    const savingsPotentialPercent = (annualSavingsEnergy / currentConsumption) * 100;
    const annualSavingsCost = annualSavingsEnergy * energyPrice;
    const paybackYears = investmentCost > 0 ? investmentCost / annualSavingsCost : 0;

    return { savingsPotentialPercent, annualSavingsEnergy, annualSavingsCost, paybackYears };
}

// ─── Energy Management Maturity ───────────────────────────────────────────────

/**
 * Energy management maturity classification (1–5) based on ISO 50001 criteria.
 * Classificação de maturidade energética (1–5) com base nos critérios da ISO 50001.
 *
 * Score é calculado como média ponderada dos 5 critérios de maturidade:
 *   - metering:       sistemas de medição e monitoramento
 *   - targeting:      metas e indicadores de desempenho energético
 *   - reporting:      relatórios e comunicação de dados
 *   - procedures:     procedimentos documentados ISO 50001
 *   - culture:        cultura organizacional e treinamento
 *
 * @param criteria - Scores 1-5 for each criterion (metering/targeting/reporting/procedures/culture)
 * @param number>  - Optional custom weights (must sum to 1)
 * @throws {RangeError}
 */
export function energyMaturity(
    criteria: Record<string, number>,
    weights: Record<string, number> | null = null,
): { maturityScore: number; maturityLevel: number; maturityLabel: string; details: Record<string, number> } {
    const keys = ['metering', 'targeting', 'reporting', 'procedures', 'culture'];
    for (const k of keys) {
        const v = criteria[k];
        if (v === undefined || v === null) throw new RangeError(`criteria.${k} is required`);
        if (v < 1 || v > 5) throw new RangeError(`criteria.${k} must be [1,5], got ${v}`);
    }

    // Pesos padrão ISO 50001 - medição tem maior peso
    const defaultWeights: Record<string, number> = {
        metering: 0.25,
        targeting: 0.2,
        reporting: 0.2,
        procedures: 0.2,
        culture: 0.15,
    };
    const w: Record<string, number> = weights || defaultWeights;

    const weightSum = Object.values(w).reduce((a, b) => a + b, 0);
    if (Math.abs(weightSum - 1) > 1e-9) throw new RangeError(`weights must sum to 1, got ${weightSum}`);

    const maturityScore = keys.reduce((sum, k) => sum + criteria[k]! * w[k]!, 0);
    const maturityLevel = Math.round(maturityScore);

    const LABELS: Record<number, string> = {
        1: 'Initial - ad hoc energy awareness',
        2: 'Managed - basic metering and reporting',
        3: 'Defined - systematic ISO 50001 approach',
        4: 'Quantitatively Managed - data-driven optimization',
        5: 'Optimizing - continuous improvement and innovation',
    };

    const maturityLabel = (LABELS[maturityLevel] || LABELS[Math.min(5, Math.max(1, maturityLevel))]) as string;
    const details: Record<string, number> = keys.reduce(
        (obj, k) => {
            obj[k] = criteria[k]!;
            return obj;
        },
        {} as Record<string, number>,
    );

    return { maturityScore, maturityLevel, maturityLabel, details };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialEnergyAuditIndexMeta: AnalyticsModuleMeta = {
    name: 'industrialEnergyAuditIndex',
    description: 'industrialEnergyAuditIndex',
    category: 'analytics',
    familyTags: ['industrial', 'energy'],
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
