// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic helpers for handlers/nn.ts (neural network topology + parameter count).
// DOM-free, framework-free. Extracted Wave ZZZZ1 from src/app/js/utils/handlers/nn.ts (601L).

export const NN_DEFAULTS = Object.freeze({
    INPUT_SIZE: 6,
    OUTPUT_SIZE: 2,
    HIDDEN_SIZE: 16,
    PARAM_WARN_THRESHOLD: 500000,
}) as Readonly<{
    INPUT_SIZE: number;
    OUTPUT_SIZE: number;
    HIDDEN_SIZE: number;
    PARAM_WARN_THRESHOLD: number;
}>;

export type NetworkMeta = {
    inputSize?: unknown;
    outputSize?: unknown;
    hiddenSize?: unknown;
    hiddenLayerSizes?: unknown;
};

export function topologyString(meta: NetworkMeta | null | undefined, separator: string = ' → '): string {
    if (!meta || typeof meta !== 'object') return '';
    const input = toPositiveInt(meta.inputSize, NN_DEFAULTS.INPUT_SIZE);
    const output = toPositiveInt(meta.outputSize, NN_DEFAULTS.OUTPUT_SIZE);
    const hiddenRaw = Array.isArray(meta.hiddenLayerSizes) && meta.hiddenLayerSizes.length > 0
        ? (meta.hiddenLayerSizes as unknown[])
        : [meta.hiddenSize];
    const hidden = hiddenRaw.map((s) => toPositiveInt(s, NN_DEFAULTS.HIDDEN_SIZE));
    return [input, ...hidden, output].join(String(separator ?? ' → '));
}

export function countParams(layerSizes: ReadonlyArray<unknown>): number {
    if (!Array.isArray(layerSizes) || layerSizes.length < 2) return 0;
    const sizes = layerSizes.map((s) => toPositiveInt(s, 0));
    let total = 0;
    for (let i = 0; i < sizes.length - 1; i++) {
        const current = sizes[i] || 0;
        const next = sizes[i + 1] || 0;
        total += current * next + next;
    }
    return total;
}

export function shouldWarnParamCount(total: unknown, threshold: number = NN_DEFAULTS.PARAM_WARN_THRESHOLD): boolean {
    const n = Number(total);
    if (!Number.isFinite(n)) return false;
    const cap = Number.isFinite(threshold) && threshold > 0
        ? threshold
        : NN_DEFAULTS.PARAM_WARN_THRESHOLD;
    return n > cap;
}

export function formatParamCount(total: unknown, locale: string = 'pt-BR'): string {
    const n = Number(total);
    if (!Number.isFinite(n)) return '0';
    try {
        return Math.floor(n).toLocaleString(locale);
    } catch {
        return String(Math.floor(n));
    }
}

export function buildLayerSizes(
    inputSize: unknown,
    hiddenSizes: ReadonlyArray<unknown>,
    outputSize: unknown,
): number[] {
    const input = toPositiveInt(inputSize, NN_DEFAULTS.INPUT_SIZE);
    const output = toPositiveInt(outputSize, NN_DEFAULTS.OUTPUT_SIZE);
    const hidden = Array.isArray(hiddenSizes)
        ? hiddenSizes.map((s) => toPositiveInt(s, NN_DEFAULTS.HIDDEN_SIZE))
        : [];
    return [input, ...hidden, output];
}

export function validateTopology(layerSizes: ReadonlyArray<unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!Array.isArray(layerSizes)) {
        return { valid: false, errors: ['layerSizes deve ser array'] };
    }
    if (layerSizes.length < 2) {
        errors.push('topologia requer ao menos input + output (2 camadas)');
    }
    layerSizes.forEach((size, i) => {
        const n = Number(size);
        if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
            errors.push(`camada ${i}: tamanho inválido (${size})`);
        }
    });
    return { valid: errors.length === 0, errors };
}

function toPositiveInt(value: unknown, fallback: number): number {
    const n = parseInt(String(value), 10);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return n;
}
