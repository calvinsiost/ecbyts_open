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
   INFERENCE WORKER — Web Worker for offloading NN forward pass
   Worker para executar forward pass em thread separada

   Recebe pesos serializados e vetor de entrada via postMessage.
   Retorna vetor de saida calculado. Nao importa modulos — e
   totalmente standalone para funcionar como Web Worker.

   Suporta formato v2.0 (W1/b1/W2/b2) e v3.0 (layers/biases).
   ================================================================ */

// Web Worker global. The DOM lib types `self` as Window; in a worker context
// it is the DedicatedWorkerGlobalScope. Cast to `any` so the worker-specific
// onmessage/postMessage assignments type-check without changing runtime.
const _worker: any = self;

/**
 * Message handler.
 * v2.0: { W1: number[][], b1: number[], W2: number[][], b2: number[], input: number[], mode: string }
 * v3.0: { layers: number[][][], biases: number[][], input: number[], mode: string }
 * Returns:  { output: number[], confidence: number }
 */
_worker.onmessage = function (e: MessageEvent) {
    const { id, input, mode } = e.data;

    // Resolve weight format: v3.0 (layers/biases) or v2.0 (W1/b1/W2/b2)
    // Detecta formato automaticamente para backward compat
    let weights: number[][][], biases: number[][];
    if (e.data.layers && e.data.biases) {
        weights = e.data.layers;
        biases = e.data.biases;
    } else {
        weights = [e.data.W1, e.data.W2];
        biases = [e.data.b1, e.data.b2];
    }

    const numLayers = weights.length;

    // Generic N-layer forward pass
    // Forward pass generico para N camadas
    let activation: ArrayLike<number> = input;

    for (let l = 0; l < numLayers; l++) {
        const W = weights[l]!;
        const b = biases[l]!;
        const size = W.length;
        const prevSize = W[0]!.length;
        const next = new Float32Array(size);

        for (let i = 0; i < size; i++) {
            let sum = b[i]!;
            for (let j = 0; j < prevSize; j++) {
                sum += W[i]![j]! * activation[j]!;
            }
            // ReLU for hidden layers, raw logits for output layer
            if (l < numLayers - 1) {
                next[i] = sum > 0 ? sum : 0; // ReLU
            } else {
                next[i] = sum; // Output logits
            }
        }
        activation = next;
    }

    // Output activation
    const outputSize = activation.length;
    const output = new Float32Array(outputSize);

    if (mode === 'regression') {
        // Sigmoid individual per output
        for (let i = 0; i < outputSize; i++) {
            const x = Math.max(-500, Math.min(500, activation[i]!));
            output[i] = 1 / (1 + Math.exp(-x));
        }
    } else {
        // Stable softmax
        let maxLogit = -Infinity;
        for (let i = 0; i < outputSize; i++) {
            if (activation[i]! > maxLogit) maxLogit = activation[i]!;
        }
        let sumExp = 0;
        for (let i = 0; i < outputSize; i++) {
            output[i] = Math.exp(activation[i]! - maxLogit);
            sumExp += output[i]!;
        }
        for (let i = 0; i < outputSize; i++) {
            output[i]! /= sumExp;
        }
    }

    // Confidence for regression: average distance from 0.5
    let confidence = 0;
    for (let i = 0; i < outputSize; i++) {
        confidence += Math.abs(output[i]! - 0.5) * 2;
    }
    confidence = outputSize > 0 ? confidence / outputSize : 0;

    self.postMessage({
        id,
        output: Array.from(output),
        confidence,
    });
};
