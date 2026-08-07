// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   WORKER BRIDGE — Communication layer for inference Web Worker
   Ponte de comunicacao com o Web Worker de inferencia

   Lazy-loads o Worker na primeira requisicao. Fallback para
   inferencia na main thread se Worker nao estiver disponivel.

   Suporta formato v3.0 (layers/biases) e v2.0 (W1/b1/W2/b2).
   ================================================================ */

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

interface PendingResolver {
    resolve: (v: { output: Float32Array; confidence: number }) => void;
    reject: (e: unknown) => void;
}

let _worker: Worker | null = null;
let _messageId = 0;
const _pending: Map<number, PendingResolver> = new Map();
let _workerFailed = false;

// ----------------------------------------------------------------
// INITIALIZATION - Lazy Worker creation
// ----------------------------------------------------------------

/**
 * Initialize the inference Web Worker.
 * Lazy-loaded: criado apenas na primeira inferencia.
 *
 * @returns true if Worker is available
 */
export function initInferenceWorker(): boolean {
    if (_worker) return true;
    if (_workerFailed) return false;

    try {
        _worker = new Worker(new URL('./inferenceWorker.js', import.meta.url), { type: 'module' });

        _worker.onmessage = (
            e: MessageEvent<{ id: number; output: ArrayLike<number>; confidence: number }>,
        ) => {
            const { id, output, confidence } = e.data;
            const resolver = _pending.get(id);
            if (resolver) {
                resolver.resolve({ output: new Float32Array(output), confidence });
                _pending.delete(id);
            }
        };

        _worker.onerror = (err: ErrorEvent) => {
            console.warn('Inference Worker error:', err.message);
            _workerFailed = true;
            _worker = null;
            // Reject all pending
            for (const [, resolver] of _pending) {
                resolver.reject(err);
            }
            _pending.clear();
        };

        return true;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('Inference Worker not supported:', message);
        _workerFailed = true;
        return false;
    }
}

// ----------------------------------------------------------------
// ASYNC INFERENCE - Promise-based Worker communication
// ----------------------------------------------------------------

type Matrix2D = ReadonlyArray<ReadonlyArray<number>>;
type Vector1D = ReadonlyArray<number>;
interface InferenceWeights {
    layers?: ReadonlyArray<Matrix2D>;
    biases?: ReadonlyArray<Vector1D>;
    W1?: Matrix2D;
    b1?: Vector1D;
    W2?: Matrix2D;
    b2?: Vector1D;
}

/**
 * Run inference in Web Worker (or fallback to main thread).
 * Aceita formato v3.0 { layers, biases } ou v2.0 { W1, b1, W2, b2 }.
 *
 * @param weights - { layers, biases } or { W1, b1, W2, b2 }
 * @param input - Normalized input vector
 * @param mode - 'classification' or 'regression'
 */
export function runInferenceAsync(
    weights: InferenceWeights,
    input: Float32Array,
    mode: string,
): Promise<{ output: Float32Array; confidence: number }> {
    // Normalize to v3.0 format for Worker communication
    const layers: ReadonlyArray<Matrix2D> =
        weights.layers || ([weights.W1, weights.W2] as ReadonlyArray<Matrix2D>);
    const biases: ReadonlyArray<Vector1D> =
        weights.biases || ([weights.b1, weights.b2] as ReadonlyArray<Vector1D>);

    // Try Worker first
    if (initInferenceWorker() && _worker) {
        const worker = _worker;
        return new Promise((resolve, reject) => {
            const id = _messageId++;
            _pending.set(id, { resolve, reject });

            worker.postMessage({
                id,
                layers,
                biases,
                input: Array.from(input),
                mode,
            });

            // Timeout: 5 seconds
            setTimeout(() => {
                if (_pending.has(id)) {
                    _pending.delete(id);
                    reject(new Error('Inference timeout'));
                }
            }, 5000);
        });
    }

    // Fallback: main-thread inference
    return _mainThreadInference(layers, biases, input, mode);
}

// ----------------------------------------------------------------
// FALLBACK - Main-thread N-layer forward pass
// Forward pass generico na main thread (mesmo algoritmo do Worker)
// ----------------------------------------------------------------

/**
 * Main-thread fallback forward pass.
 */
function _mainThreadInference(
    layers: ReadonlyArray<Matrix2D>,
    biases: ReadonlyArray<Vector1D>,
    input: ArrayLike<number>,
    mode: string,
): Promise<{ output: Float32Array; confidence: number }> {
    const numLayers = layers.length;
    let activation: ArrayLike<number> = input;

    for (let l = 0; l < numLayers; l++) {
        const W = layers[l];
        const b = biases[l];
        if (!W || !b) {
            throw new Error(`workerBridge: missing layer or bias at index ${l}`);
        }
        const size = W.length;
        const firstRow = W[0];
        if (!firstRow) {
            throw new Error(`workerBridge: empty weight matrix at layer ${l}`);
        }
        const prevSize = firstRow.length;
        const next = new Float32Array(size);

        for (let i = 0; i < size; i++) {
            const bi = b[i];
            const Wi = W[i];
            if (bi === undefined || !Wi) {
                throw new Error(`workerBridge: missing weight row at layer ${l} neuron ${i}`);
            }
            let sum = bi;
            for (let j = 0; j < prevSize; j++) {
                const wij = Wi[j];
                const aj = activation[j];
                if (wij === undefined || aj === undefined) continue;
                sum += wij * aj;
            }
            if (l < numLayers - 1) {
                next[i] = sum > 0 ? sum : 0; // ReLU
            } else {
                next[i] = sum; // Output logits
            }
        }
        activation = next;
    }

    const outputSize = activation.length;
    const output = new Float32Array(outputSize);

    if (mode === 'regression') {
        for (let i = 0; i < outputSize; i++) {
            const ai = activation[i] ?? 0;
            output[i] = 1 / (1 + Math.exp(-ai));
        }
    } else {
        let maxLogit = -Infinity;
        for (let i = 0; i < outputSize; i++) {
            const ai = activation[i];
            if (ai !== undefined && ai > maxLogit) maxLogit = ai;
        }
        let sumExp = 0;
        for (let i = 0; i < outputSize; i++) {
            const ai = activation[i] ?? 0;
            const e = Math.exp(ai - maxLogit);
            output[i] = e;
            sumExp += e;
        }
        if (sumExp > 0) {
            for (let i = 0; i < outputSize; i++) {
                const oi = output[i] ?? 0;
                output[i] = oi / sumExp;
            }
        }
    }

    let confidence = 0;
    for (let i = 0; i < outputSize; i++) {
        const oi = output[i] ?? 0;
        confidence += Math.abs(oi - 0.5) * 2;
    }
    confidence = outputSize > 0 ? confidence / outputSize : 0;

    return Promise.resolve({ output, confidence });
}

/**
 * Terminate the Worker (cleanup).
 */
export function terminateWorker(): void {
    if (_worker) {
        _worker.terminate();
        _worker = null;
    }
    _pending.clear();
}
