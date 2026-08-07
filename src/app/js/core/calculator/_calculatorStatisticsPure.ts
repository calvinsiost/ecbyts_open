// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

type CalculatorTrend = 'insufficient_data' | 'stable' | 'increasing' | 'decreasing';

export type CalculatorMannKendallResult = Readonly<{
    S: number;
    variance: number;
    Z: number;
    pValue: number;
    tau: number;
    trend: CalculatorTrend;
    significant: boolean;
}>;

/**
 * Guarda de entrada: rejeita NaN/Infinity ANTES de propagar para os cálculos.
 * Auditoria 2026-06-26 (achado real R3): sem esta checagem, um único NaN/Infinity
 * no array silenciava o teste de tendência — `calculateS` ignora a diferença
 * (toda comparação com NaN é false) e `calculatorMean` devolvia NaN sem sinal.
 * Para um módulo puro de cálculo, isso era fail-silent: número errado tratado
 * como verdade. Agora a entrada inválida é detectada explicitamente.
 */
function allFinite(values: readonly number[]): boolean {
    for (const v of values) {
        if (!Number.isFinite(v)) return false;
    }
    return true;
}

/**
 * Small synchronous statistic subset used by calculator/engine.
 * Mantem o calculator fora do cluster pesado core/analytics.
 */
export function calculatorMean(values: readonly number[]): number {
    if (values.length === 0) return 0;
    if (!allFinite(values)) return NaN; // entrada inválida → NaN explícito, não 0 mascarado
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Mann-Kendall trend test subset for calculator trend labels.
 * Replica o contrato de analytics/statistics sem importar o modulo pesado.
 */
export function calculatorMannKendall(values: readonly number[]): CalculatorMannKendallResult {
    const n = values.length;
    if (n < 4) {
        return freezeTrend({ S: 0, variance: 0, Z: 0, pValue: 1, tau: 0, trend: 'insufficient_data' });
    }
    // Achado real R3 (auditoria 2026-06-26): NaN/Infinity nas amostras corrompia
    // silenciosamente S/variância/Z (comparações com NaN são sempre false, então
    // o S vinha enviesado e a tendência saía errada sem nenhum sinal). Falha alto:
    // entrada não-finita → 'insufficient_data', nunca um veredito de tendência falso.
    if (!allFinite(values)) {
        return freezeTrend({ S: 0, variance: 0, Z: 0, pValue: 1, tau: 0, trend: 'insufficient_data' });
    }

    const S = calculateS(values);
    const variance = calculateVariance(values, n);
    const Z = calculateZ(S, variance);
    const nPairs = (n * (n - 1)) / 2;
    const tau = nPairs > 0 ? S / nPairs : 0;
    const pValue = 2 * (1 - normalCDF(Math.abs(Z)));
    const significant = pValue < 0.05;
    const trend = significant ? (S > 0 ? 'increasing' : 'decreasing') : 'stable';

    return Object.freeze({ S, variance, Z, pValue, tau, trend, significant });
}

function calculateS(values: readonly number[]): number {
    let S = 0;
    for (let k = 0; k < values.length - 1; k++) {
        for (let j = k + 1; j < values.length; j++) {
            const diff = (values[j] as number) - (values[k] as number);
            if (diff > 0) S++;
            else if (diff < 0) S--;
        }
    }
    return S;
}

function calculateVariance(values: readonly number[], n: number): number {
    let variance = n * (n - 1) * (2 * n + 5);
    for (const groupSize of countTieGroups(values)) {
        variance -= groupSize * (groupSize - 1) * (2 * groupSize + 5);
    }
    return variance / 18;
}

function calculateZ(S: number, variance: number): number {
    if (variance <= 0) return 0;
    if (S > 0) return (S - 1) / Math.sqrt(variance);
    if (S < 0) return (S + 1) / Math.sqrt(variance);
    return 0;
}

function countTieGroups(values: readonly number[]): number[] {
    const sorted = [...values].sort((a, b) => a - b);
    const groups: number[] = [];
    let index = 0;

    while (index < sorted.length) {
        const count = countEqualRun(sorted, index);
        if (count > 1) groups.push(count);
        index += count;
    }

    return groups;
}

function countEqualRun(sorted: readonly number[], startIndex: number): number {
    let count = 1;
    while (startIndex + count < sorted.length && sorted[startIndex + count] === sorted[startIndex]) {
        count++;
    }
    return count;
}

function normalCDF(x: number): number {
    if (x < -8) return 0;
    if (x > 8) return 1;

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const normalized = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * normalized);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-normalized * normalized);

    return 0.5 * (1 + sign * y);
}

function freezeTrend(result: Omit<CalculatorMannKendallResult, 'significant'>): CalculatorMannKendallResult {
    return Object.freeze({ ...result, significant: false });
}
