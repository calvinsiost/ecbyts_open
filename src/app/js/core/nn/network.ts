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
   SIMPLE NEURAL NETWORK — Generic N-layer feedforward network
   ================================================================

   Rede neural feedforward generica de N camadas, parametrizavel
   para qualquer combinacao de inputs/hidden layers/outputs. Pode
   ser usada por qualquer modulo do sistema para classificacao
   supervisionada ou regressao.

   Arquitetura: N inputs → H1 hidden → H2 hidden → ... → M outputs
   Ativacao: ReLU nas hidden layers, softmax/sigmoid na saida
   Treinamento: SGD com mini-batch, cross-entropy/MSE loss, LR decay
   Persistencia: toJSON()/fromJSON() para serializar pesos (v3.0)

   ================================================================ */

// ----------------------------------------------------------------
// CONSTANTS - Topology limits
// Limites para proteger memoria do navegador (~4MB max em Float32)
// ----------------------------------------------------------------

const MAX_HIDDEN_LAYERS = 5;
const MAX_NEURONS_PER_LAYER = 512;
const _MAX_PARAMETERS = 500000;

type NetworkMode = 'classification' | 'regression';
type TrainingSample = { input: Float32Array; target: number | Float32Array };
interface SimpleNNConfig {
    inputSize: number;
    hiddenSize?: number;
    hiddenLayerSizes?: number[];
    outputSize: number;
    classNames?: string[] | null;
    mode?: NetworkMode;
}
interface SimpleNNState {
    version?: string;
    inputSize?: number;
    hiddenSize?: number;
    hiddenLayerSizes?: number[];
    outputSize?: number;
    classNames?: string[] | null;
    mode?: NetworkMode;
    trained?: boolean;
    weights?: any;
}

// ----------------------------------------------------------------
// WEIGHT INITIALIZATION - He normal distribution
// Inicializacao He para convergencia rapida com ReLU
// ----------------------------------------------------------------

/**
 * Initialize weight matrix with He initialization.
 * @param rows
 * @param cols
 * @param scale - He scale factor sqrt(2/fanIn)
 * @returns Array of Float32Array rows
 */
function _initWeights(rows: number, cols: number, scale: number): Float32Array[] {
    const mat: Float32Array[] = [];
    for (let i = 0; i < rows; i++) {
        const row = new Float32Array(cols);
        for (let j = 0; j < cols; j++) {
            // Box-Muller for normal distribution
            const u1 = Math.random() || 1e-10;
            const u2 = Math.random();
            row[j] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * scale;
        }
        mat.push(row);
    }
    return mat;
}

// ----------------------------------------------------------------
// SimpleNN CLASS - Configurable N-layer feedforward neural network
// Classe principal: aceita qualquer profundidade e dimensao
// ----------------------------------------------------------------

/**
 * Generic N-layer feedforward neural network.
 * Rede neural generica parametrizavel para classificacao/regressao.
 *
 * @example
 * // Single hidden layer (backward-compatible)
 * const nn = new SimpleNN({ inputSize: 6, hiddenSize: 16, outputSize: 7 });
 *
 * @example
 * // Multiple hidden layers
 * const nn = new SimpleNN({ inputSize: 6, hiddenLayerSizes: [32, 16, 8], outputSize: 3 });
 */
export class SimpleNN {
    inputSize: number;
    outputSize: number;
    classNames: string[] | null;
    mode: NetworkMode;
    hiddenLayerSizes: number[];
    hiddenSize: number;
    layerSizes: number[];
    _weights: Float32Array[][];
    _biases: Float32Array[];
    _trained: boolean;

    /**
     * @param config
     */
    constructor({
        inputSize,
        hiddenSize,
        hiddenLayerSizes,
        outputSize,
        classNames = null,
        mode = 'classification',
    }: SimpleNNConfig) {
        this.inputSize = inputSize;
        this.outputSize = outputSize;
        this.classNames = classNames || null;
        this.mode = mode; // 'classification' or 'regression'

        // Resolve hidden topology: hiddenLayerSizes array takes priority
        // Se hiddenLayerSizes nao fornecido, usa hiddenSize (backward compat)
        if (Array.isArray(hiddenLayerSizes) && hiddenLayerSizes.length > 0) {
            this.hiddenLayerSizes = hiddenLayerSizes.slice();
        } else {
            this.hiddenLayerSizes = [hiddenSize || 16];
        }

        // Validate and clamp topology
        // Garante limites seguros de memoria
        this._validateTopology();

        // Backward-compat: hiddenSize = first hidden layer size
        this.hiddenSize = this.hiddenLayerSizes[0] as number;

        // Full topology array: [input, h1, h2, ..., hN, output]
        this.layerSizes = [inputSize, ...this.hiddenLayerSizes, outputSize];

        // Weight arrays (initialized on reset)
        // _weights[l]: matrix layerSizes[l+1] × layerSizes[l]
        // _biases[l]: vector layerSizes[l+1]
        this._weights = [];
        this._biases = [];
        this._trained = false;

        this.reset();
    }

    // ----------------------------------------------------------------
    // BACKWARD-COMPAT GETTERS - _W1, _b1, _W2, _b2
    // Codigo externo (networkDiagram, workerBridge) usa estes nomes
    // ----------------------------------------------------------------

    /** First layer weights (input→hidden1) */
    get _W1(): Float32Array[] | null {
        return this._weights?.[0] ?? null;
    }
    /** First layer bias */
    get _b1(): Float32Array | null {
        return this._biases?.[0] ?? null;
    }
    /** Last layer weights (hiddenN→output) */
    get _W2(): Float32Array[] | null {
        return this._weights?.[this._weights.length - 1] ?? null;
    }
    /** Last layer bias */
    get _b2(): Float32Array | null {
        return this._biases?.[this._biases.length - 1] ?? null;
    }

    /**
     * Check if network has been trained.
     * @returns
     */
    get trained(): boolean {
        return this._trained;
    }

    /**
     * Total parameter count (weights + biases).
     * @returns
     */
    get totalParams(): number {
        let total = 0;
        for (let l = 0; l < this.layerSizes.length - 1; l++) {
            total +=
                (this.layerSizes[l] as number) * (this.layerSizes[l + 1] as number) +
                (this.layerSizes[l + 1] as number);
        }
        return total;
    }

    // ----------------------------------------------------------------
    // TOPOLOGY VALIDATION
    // Clampa valores e avisa se exceder limite de parametros
    // ----------------------------------------------------------------

    _validateTopology(): void {
        if (this.hiddenLayerSizes.length > MAX_HIDDEN_LAYERS) {
            console.warn(
                `SimpleNN: clamping hidden layers from ${this.hiddenLayerSizes.length} to ${MAX_HIDDEN_LAYERS}`,
            );
            this.hiddenLayerSizes = this.hiddenLayerSizes.slice(0, MAX_HIDDEN_LAYERS);
        }
        for (let i = 0; i < this.hiddenLayerSizes.length; i++) {
            this.hiddenLayerSizes[i] = Math.min(
                Math.max(1, Math.round(this.hiddenLayerSizes[i] as number) || 16),
                MAX_NEURONS_PER_LAYER,
            );
        }
    }

    /**
     * Reset/initialize weights with He initialization.
     * Reinicializa pesos - necessario antes de novo treino.
     */
    reset(): void {
        const L = this.layerSizes.length;
        this._weights = [];
        this._biases = [];

        for (let l = 0; l < L - 1; l++) {
            const fanIn = this.layerSizes[l] as number;
            const fanOut = this.layerSizes[l + 1] as number;
            const scale = Math.sqrt(2 / fanIn); // He initialization (better for ReLU)
            this._weights.push(_initWeights(fanOut, fanIn, scale));
            this._biases.push(new Float32Array(fanOut));
        }
        this._trained = false;
    }

    /**
     * Forward pass through the network.
     * Passagem direta: input → H1 (ReLU) → H2 (ReLU) → ... → output.
     * Modo classification: softmax (soma=1, distribuicao de probabilidades)
     * Modo regression: sigmoid individual (cada saida [0,1] independente)
     *
     * @param input - Input feature vector
     * @returns
     */
    forward(input: Float32Array): {
        activations: Float32Array[];
        output: Float32Array;
        hidden: Float32Array;
    } {
        const L = this.layerSizes.length;
        const activations: Float32Array[] = [input]; // activations[0] = input

        // Propagate through all layers
        // Propaga sinal camada por camada
        for (let l = 0; l < L - 1; l++) {
            const prevAct = activations[l] as Float32Array;
            const W = this._weights[l] as Float32Array[];
            const b = this._biases[l] as Float32Array;
            const size = this.layerSizes[l + 1] as number;
            const prevSize = this.layerSizes[l] as number;
            const act = new Float32Array(size);

            for (let i = 0; i < size; i++) {
                let sum = b[i] as number;
                const Wi = W[i] as Float32Array;
                for (let j = 0; j < prevSize; j++) {
                    sum += (Wi[j] as number) * (prevAct[j] as number);
                }
                // ReLU for hidden layers, raw logits for output layer
                if (l < L - 2) {
                    act[i] = sum > 0 ? sum : 0; // ReLU
                } else {
                    act[i] = sum; // Output logits
                }
            }
            activations.push(act);
        }

        // Apply output activation
        // Aplica ativacao final: softmax ou sigmoid
        const logits = activations[L - 1] as Float32Array;
        const output = new Float32Array(this.outputSize);

        if (this.mode === 'regression') {
            // Regression: sigmoid individual por saida (cada uma [0,1] independente)
            for (let i = 0; i < this.outputSize; i++) {
                output[i] = 1 / (1 + Math.exp(-(logits[i] as number)));
            }
        } else {
            // Classification: stable softmax (subtract max for numerical stability)
            let maxLogit = -Infinity;
            for (let i = 0; i < this.outputSize; i++) {
                if ((logits[i] as number) > maxLogit) maxLogit = logits[i] as number;
            }
            let sumExp = 0;
            for (let i = 0; i < this.outputSize; i++) {
                output[i] = Math.exp((logits[i] as number) - maxLogit);
                sumExp += output[i] as number;
            }
            for (let i = 0; i < this.outputSize; i++) {
                output[i] = (output[i] as number) / sumExp;
            }
        }

        // Return activations + output, with backward-compat 'hidden' getter
        return { activations, output, hidden: activations[1] as Float32Array };
    }

    /**
     * Predict class for a single input vector.
     * Retorna indice da classe, confianca, probabilidades e nome.
     *
     * @param input - Input feature vector
     * @returns
     */
    predict(input: Float32Array): {
        classIndex: number;
        confidence: number;
        probabilities: Float32Array;
        className: string | null;
    } {
        const { output } = this.forward(input);
        let maxIdx = 0,
            maxVal = output[0] as number;
        for (let i = 1; i < this.outputSize; i++) {
            if ((output[i] as number) > maxVal) {
                maxVal = output[i] as number;
                maxIdx = i;
            }
        }
        return {
            classIndex: maxIdx,
            confidence: maxVal,
            probabilities: output,
            className: this.classNames ? (this.classNames[maxIdx] as string) : null,
        };
    }

    /**
     * Train the neural network on labeled data.
     * SGD com mini-batch, learning rate decay, N-layer backpropagation.
     * Classification: cross-entropy loss, target = class index (number)
     * Regression: MSE loss, target = Float32Array of output values [0,1]
     *
     * @param data
     * @param options
     * @param options.epochs - Number of training epochs
     * @param options.lr - Initial learning rate
     * @param options.batchSize - Mini-batch size
     * @param options.onProgress - Callback: { epoch, loss, accuracy, total }
     * @returns
     */
    train(
        data: TrainingSample[],
        options: {
            epochs?: number;
            lr?: number;
            batchSize?: number;
            onProgress?: Function;
        } = {},
    ): { finalLoss: number; accuracy: number } {
        const epochs = options.epochs || 80;
        const lr = options.lr || 0.02;
        const batchSize = options.batchSize || 32;
        const onProgress = options.onProgress || null;
        const isRegression = this.mode === 'regression';
        const L = this.layerSizes.length; // total layers incl input

        if (data.length < 5) return { finalLoss: 999, accuracy: 0 };

        let currentLr: number;
        let finalLoss = 0;
        let accuracy = 0;

        for (let epoch = 0; epoch < epochs; epoch++) {
            // Learning rate decay
            currentLr = lr * (1 - (epoch / epochs) * 0.7);

            // Shuffle training data
            const shuffled = [...data];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j] as TrainingSample, shuffled[i] as TrainingSample];
            }

            let totalLoss = 0;
            let correct = 0;

            // Mini-batch SGD
            for (let bStart = 0; bStart < shuffled.length; bStart += batchSize) {
                const batch = shuffled.slice(bStart, bStart + batchSize);

                for (const sample of batch) {
                    // Forward pass - retorna todas as ativacoes para backprop
                    const { activations, output } = this.forward(sample.input);

                    // Compute output error
                    const dOutput = new Float32Array(this.outputSize);

                    if (isRegression) {
                        if (!(sample.target instanceof Float32Array)) continue;
                        const targetArr = sample.target;
                        // MSE loss + sigmoid derivative backprop
                        let sampleLoss = 0;
                        for (let i = 0; i < this.outputSize; i++) {
                            const t = targetArr[i] as number;
                            const oi = output[i] as number;
                            const diff = oi - t;
                            sampleLoss += diff * diff;
                            // dL/dLogits = (output - target) * sigmoid'(logit) = diff * output * (1 - output)
                            dOutput[i] = diff * oi * (1 - oi);
                        }
                        totalLoss += sampleLoss / this.outputSize;

                        // "Accuracy" for regression: fraction of outputs within 10% tolerance
                        let closeCount = 0;
                        for (let i = 0; i < this.outputSize; i++) {
                            if (Math.abs((output[i] as number) - (targetArr[i] as number)) < 0.1) closeCount++;
                        }
                        if (closeCount === this.outputSize) correct++;
                    } else {
                        if (typeof sample.target !== 'number') continue;
                        const targetIdx = sample.target;
                        // Cross-entropy loss (classification)
                        totalLoss -= Math.log(Math.max(1e-7, output[targetIdx] as number));

                        // Check accuracy
                        let maxIdx = 0;
                        for (let i = 1; i < this.outputSize; i++) {
                            if ((output[i] as number) > (output[maxIdx] as number)) maxIdx = i;
                        }
                        if (maxIdx === targetIdx) correct++;

                        // dL/dLogits = output - oneHot(target)
                        for (let i = 0; i < this.outputSize; i++) {
                            dOutput[i] = (output[i] as number) - (i === targetIdx ? 1 : 0);
                        }
                    }

                    // ---- N-LAYER BACKPROPAGATION ----
                    // Propaga gradiente da saida ate a entrada, camada por camada
                    let dCurrent: Float32Array = dOutput;

                    for (let l = L - 2; l >= 0; l--) {
                        const prevAct = activations[l] as Float32Array;
                        const currentSize = this.layerSizes[l + 1] as number;
                        const prevSize = this.layerSizes[l] as number;

                        // Apply ReLU derivative for hidden layers (not output)
                        if (l < L - 2) {
                            const hiddenAct = activations[l + 1] as Float32Array;
                            for (let i = 0; i < currentSize; i++) {
                                if ((hiddenAct[i] as number) <= 0) dCurrent[i] = 0; // ReLU gradient gate
                            }
                        }

                        // Compute gradient for previous layer (skip for input layer)
                        let dPrev: Float32Array | null = null;
                        const Wl = this._weights[l] as Float32Array[];
                        if (l > 0) {
                            dPrev = new Float32Array(prevSize);
                            for (let i = 0; i < currentSize; i++) {
                                if ((dCurrent[i] as number) === 0) continue; // Skip zero gradients
                                const Wli = Wl[i] as Float32Array;
                                for (let j = 0; j < prevSize; j++) {
                                    dPrev[j] = (dPrev[j] as number) + (Wli[j] as number) * (dCurrent[i] as number);
                                }
                            }
                        }

                        // Update weights and biases for this layer
                        const bl = this._biases[l] as Float32Array;
                        for (let i = 0; i < currentSize; i++) {
                            if ((dCurrent[i] as number) === 0) continue; // Skip zero gradients
                            const grad = currentLr * (dCurrent[i] as number);
                            const Wli = Wl[i] as Float32Array;
                            for (let j = 0; j < prevSize; j++) {
                                Wli[j] = (Wli[j] as number) - grad * (prevAct[j] as number);
                            }
                            bl[i] = (bl[i] as number) - grad;
                        }

                        if (dPrev) dCurrent = dPrev;
                    }
                }
            }

            finalLoss = totalLoss / data.length;
            accuracy = correct / data.length;

            if (onProgress && (epoch % 5 === 0 || epoch === epochs - 1)) {
                onProgress({ epoch, loss: finalLoss, accuracy, total: epochs });
            }
        }

        this._trained = true;
        return { finalLoss, accuracy };
    }

    // ----------------------------------------------------------------
    // SERIALIZATION - JSON export/import of network state
    // Serializa/restaura pesos para persistencia no modelo
    // ----------------------------------------------------------------

    /**
     * Serialize network state to a plain JSON object.
     * Formato v3.0 com topologia variavel e array de pesos.
     *
     * @returns Serializable network state
     */
    toJSON(): object {
        return {
            version: '3.0',
            inputSize: this.inputSize,
            hiddenLayerSizes: this.hiddenLayerSizes,
            hiddenSize: this.hiddenLayerSizes[0], // backward compat
            outputSize: this.outputSize,
            classNames: this.classNames,
            mode: this.mode,
            trained: this._trained,
            weights: this._trained
                ? {
                      layers: this._weights.map((W) => W.map((row) => Array.from(row))),
                      biases: this._biases.map((b) => Array.from(b)),
                  }
                : null,
        };
    }

    /**
     * Restore network state from a JSON object.
     * Suporta formato v1.0 (legado), v2.0 (single hidden) e v3.0 (N hidden).
     *
     * @param data - Serialized network state
     * @returns this (for chaining)
     */
    fromJSON(data: SimpleNNState): SimpleNN {
        if (!data) return this;

        // v1.0 format (legacy from userClassifier.js)
        if (data.version === '1.0') {
            if (data.weights && data.trained) {
                const weights = data.weights as {
                    W1: number[][];
                    W2: number[][];
                    b1: number[];
                    b2: number[];
                };
                this._weights = [
                    weights.W1.map((row) => new Float32Array(row)),
                    weights.W2.map((row) => new Float32Array(row)),
                ];
                this._biases = [new Float32Array(weights.b1), new Float32Array(weights.b2)];
                this._trained = true;
            }
            return this;
        }

        // v3.0 format (N hidden layers)
        if (data.version === '3.0') {
            if (data.weights && data.trained) {
                const weights = data.weights as { layers: number[][][]; biases: number[][] };
                // Validate topology matches
                const dataSizes = [
                    data.inputSize,
                    ...(data.hiddenLayerSizes || [data.hiddenSize || 16]),
                    data.outputSize,
                ];
                if (JSON.stringify(dataSizes) !== JSON.stringify(this.layerSizes)) {
                    console.warn('SimpleNN.fromJSON: v3.0 topology mismatch, resetting');
                    this.reset();
                    return this;
                }
                this._weights = weights.layers.map((W) => W.map((row) => new Float32Array(row)));
                this._biases = weights.biases.map((b) => new Float32Array(b));
                this._trained = true;
            }
            if (data.classNames) this.classNames = data.classNames;
            if (data.mode) this.mode = data.mode;
            return this;
        }

        // v2.0 format (single hidden layer, W1/b1/W2/b2)
        if (data.weights && data.trained) {
            const weights = data.weights as {
                W1: number[][];
                W2: number[][];
                b1: number[];
                b2: number[];
            };
            // Validate dimensions match for single hidden layer
            if (
                data.inputSize !== this.inputSize ||
                data.hiddenSize !== this.hiddenLayerSizes[0] ||
                data.outputSize !== this.outputSize
            ) {
                console.warn('SimpleNN.fromJSON: v2.0 dimension mismatch, resetting weights');
                this.reset();
                return this;
            }
            this._weights = [
                weights.W1.map((row) => new Float32Array(row)),
                weights.W2.map((row) => new Float32Array(row)),
            ];
            this._biases = [new Float32Array(weights.b1), new Float32Array(weights.b2)];
            this._trained = true;
        }

        if (data.classNames) {
            this.classNames = data.classNames;
        }

        // Restore mode (default 'classification' for backward compat)
        if (data.mode) {
            this.mode = data.mode;
        }

        return this;
    }
}
