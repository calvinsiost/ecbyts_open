// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Digital Twin Architecture (Blockchain + ML + LLM)
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   WHAT-IF ENGINE — Inference pipeline for NN predictions
   Motor de inferencia para simulacao What-If em tempo real

   Pipeline: Valores fisicos → Normalizar → Forward Pass → Desnormalizar
   Suporta treinamento automatico a partir de dados do modelo.
   ================================================================ */
import { normalize, normalizeInputVector, denormalizeOutputVector, clamp } from './normalization.js';
import { getNetwork, getNetworkMapping, persistNetwork } from './manager.js';
import { getAllElements } from '../elements/manager.js';
import { isGeometricVariable, isCalculatorVariable, getCalculatorItemId } from './variableCatalog.js';
import { getCalculatorItemById } from '../calculator/manager.js';
import { computeCalculatorItemForElement } from '../calculator/engine.js';
import { showToast } from '../../utils/ui/toast.js';
import { t } from '../../utils/i18n/translations.js';
import { createLogger } from '../../utils/helpers/logger.js';

const log = createLogger('WhatIf');

type NNVariableMapping = { variableId: string; min: number; max: number };
type NNMapping = { inputs: NNVariableMapping[]; outputs: NNVariableMapping[] };
type AnyRecord = Record<string, any>;
type TrainingSample = { input: Float32Array; target: Float32Array };

export interface InferenceResult {
    outputs: Record<string, number>;
    confidence: number;
    rawOutputs: Float32Array;
}

// ----------------------------------------------------------------
// INFERENCE - Single forward pass with normalization
// Inferencia unica com normalizacao e desnormalizacao
// ----------------------------------------------------------------
/**
 * Run a single What-If inference.
 * Pipeline: slider values → normalize → forward → denormalize.
 *
 * @param networkId
 * @param inputValues - { variableId: physicalValue }
 */
export function runInference(networkId: string, inputValues: Record<string, number>): InferenceResult | null {
    const nn = getNetwork(networkId);
    const mapping: NNMapping | null = getNetworkMapping(networkId);
    if (!nn || !mapping || !nn.trained) return null;

    // Normalize inputs
    const inputVec = normalizeInputVector(inputValues, mapping.inputs);

    // Forward pass
    const { output } = nn.forward(inputVec);

    // Denormalize outputs
    const outputs = denormalizeOutputVector(output, mapping.outputs);

    // Confidence: for regression, use average of sigmoid values (how decisive)
    // Values near 0.5 = uncertain, near 0 or 1 = confident
    let confidence = 0;
    for (let i = 0; i < output.length; i++) {
        const dist = Math.abs(output[i] - 0.5) * 2; // 0=uncertain, 1=confident
        confidence += dist;
    }
    confidence = output.length > 0 ? confidence / output.length : 0;

    return { outputs, confidence, rawOutputs: output };
}

/**
 * Create a debounced inference runner.
 * Wraps runInference with configurable debounce delay.
 *
 * @param networkId
 * @param onResult - Callback with inference result
 * @param delay - Debounce delay in ms
 */
export function createDebouncedInference(
    networkId: string,
    onResult: (result: InferenceResult) => void,
    delay = 50,
): (inputValues: Record<string, number>) => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return function debouncedRunner(inputValues: Record<string, number>) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            const result = runInference(networkId, inputValues);
            if (result) onResult(result);
        }, delay);
    };
}

// ----------------------------------------------------------------
// TRAINING - Build training data from model elements
// Treinamento automatico a partir de dados do modelo
// ----------------------------------------------------------------
/**
 * Build training samples from model observation data.
 * Coleta observacoes dos elementos e monta pares input/output normalizados.
 *
 * Dois modos de coleta:
 * 1. Same-element: inputs e outputs vem do mesmo elemento (caso simples)
 * 2. Cross-element: inputs de pocos linked → outputs de geometria da pluma
 *    Usa shapeTimeline para variacao temporal dos outputs geometricos.
 */
export function buildTrainingData(networkId: string): TrainingSample[] {
    const mapping: NNMapping | null = getNetworkMapping(networkId);
    if (!mapping) return [];

    const elements = getAllElements();
    const samples: TrainingSample[] = [];

    // Detectar se outputs incluem variaveis geometricas de pluma
    const hasGeoOutputs = mapping.outputs.some((m) => isGeometricVariable(m.variableId));

    if (hasGeoOutputs) {
        // Cross-element mode: inputs de pocos → outputs de geometria de pluma
        _buildCrossElementSamples(elements, mapping, samples);
    }

    // Same-element mode: inputs e outputs do mesmo elemento (sempre tenta)
    _buildSameElementSamples(elements, mapping, samples);

    return samples;
}

/**
 * Resolve a calculator variable value for a given element.
 * Avalia item do Calculator restrito ao elemento fornecido.
 */
function _resolveCalculatorValue(variableId: string, element: AnyRecord): number | null {
    const calcId = getCalculatorItemId(variableId);
    const item = getCalculatorItemById(calcId);
    if (!item) return null;
    return computeCalculatorItemForElement(item, element);
}

/**
 * Cross-element collection: well observations → plume geometry per campaign.
 * Para cada poco linked a uma pluma, cruza observacoes do poco com o
 * snapshot geometrico da pluma na mesma campanha.
 */
function _buildCrossElementSamples(elements: AnyRecord[], mapping: NNMapping, samples: TrainingSample[]) {
    // Indexar plumas por ID com seus timelines
    const plumeMap = new Map<string, { element: AnyRecord; snapByCampaign: Map<string, AnyRecord> }>();
    for (const el of elements) {
        if (el.family === 'plume' && el.data?.shapeTimeline) {
            // Indexar snapshots por campaignId
            const snapByCampaign = new Map<string, AnyRecord>();
            for (const snap of el.data.shapeTimeline) {
                snapByCampaign.set(snap.campaignId, snap);
            }
            plumeMap.set(el.id, { element: el, snapByCampaign });
        }
    }
    if (plumeMap.size === 0) return;

    // Para cada poco linked a uma pluma
    for (const el of elements) {
        if (el.family !== 'well' || !el.data?.observations) continue;
        const linkedPlumeId = el.data?.linkedPlumeId;
        if (!linkedPlumeId) continue;
        const plumeEntry = plumeMap.get(linkedPlumeId);
        if (!plumeEntry) continue;

        // Agrupar observacoes do poco por campaignId
        const obsByCampaign = new Map<string, AnyRecord[]>();
        for (const obs of el.data.observations) {
            const key = obs.campaignId;
            if (!obsByCampaign.has(key)) obsByCampaign.set(key, []);
            obsByCampaign.get(key)!.push(obs);
        }

        // Para cada campanha, montar sample input (poco) → output (pluma)
        for (const [campaignId, obsGroup] of obsByCampaign) {
            const snap = plumeEntry.snapByCampaign.get(campaignId);
            if (!snap) continue;

            // Montar inputs das observacoes do poco
            const inputValues: Record<string, number> = {};
            let hasAllInputs = true;
            for (const m of mapping.inputs) {
                if (isGeometricVariable(m.variableId)) {
                    hasAllInputs = false;
                    break;
                }
                if (isCalculatorVariable(m.variableId)) {
                    const val = _resolveCalculatorValue(m.variableId, el);
                    if (val != null) {
                        inputValues[m.variableId] = val;
                    } else {
                        hasAllInputs = false;
                        break;
                    }
                    continue;
                }
                const param = obsGroup.find((p: any) => p.parameterId === m.variableId);
                if (param && param.value != null) {
                    inputValues[m.variableId] = parseFloat(param.value);
                } else {
                    hasAllInputs = false;
                    break;
                }
            }
            if (!hasAllInputs) continue;

            // Montar outputs da geometria da pluma no snapshot da campanha
            const outputValues: Record<string, number> = {};
            let hasAllOutputs = true;
            for (const m of mapping.outputs) {
                if (isGeometricVariable(m.variableId)) {
                    const val = _getGeometricValueFromSnapshot(snap, m.variableId);
                    if (val != null) {
                        outputValues[m.variableId] = val;
                    } else {
                        hasAllOutputs = false;
                        break;
                    }
                } else if (isCalculatorVariable(m.variableId)) {
                    const val = _resolveCalculatorValue(m.variableId, el);
                    if (val != null) {
                        outputValues[m.variableId] = val;
                    } else {
                        hasAllOutputs = false;
                        break;
                    }
                } else {
                    // Output nao-geometrico: buscar nas obs do poco
                    const param = obsGroup.find((p: any) => p.parameterId === m.variableId);
                    if (param && param.value != null) {
                        outputValues[m.variableId] = parseFloat(param.value);
                    } else {
                        hasAllOutputs = false;
                        break;
                    }
                }
            }
            if (!hasAllOutputs) continue;

            const input = normalizeInputVector(inputValues, mapping.inputs);
            const target = new Float32Array(mapping.outputs.length);
            for (let i = 0; i < mapping.outputs.length; i++) {
                const m = mapping.outputs[i];
                if (!m) continue;
                target[i] = clamp(normalize(outputValues[m.variableId], m.min, m.max), 0, 1);
            }
            samples.push({ input, target });
        }
    }
}

/**
 * Same-element collection: inputs and outputs from the same element.
 */
function _buildSameElementSamples(elements: AnyRecord[], mapping: NNMapping, samples: TrainingSample[]) {
    for (const el of elements) {
        if (!el.data || !el.data.observations) continue;

        // Agrupar observacoes por campaignId para pegar todos params de uma campanha
        const obsByCampaign = new Map<string, AnyRecord[]>();
        for (const obs of el.data.observations) {
            const key = obs.campaignId;
            if (!obsByCampaign.has(key)) obsByCampaign.set(key, []);
            obsByCampaign.get(key)!.push(obs);
        }

        for (const [, obsGroup] of obsByCampaign) {
            // Try to build input vector from observation parameters
            const inputValues: Record<string, number> = {};
            let hasAllInputs = true;
            for (const m of mapping.inputs) {
                if (isCalculatorVariable(m.variableId)) {
                    const val = _resolveCalculatorValue(m.variableId, el);
                    if (val != null) {
                        inputValues[m.variableId] = val;
                    } else {
                        hasAllInputs = false;
                        break;
                    }
                    continue;
                }
                const param = obsGroup.find((p: any) => p.parameterId === m.variableId);
                if (param && param.value != null) {
                    inputValues[m.variableId] = parseFloat(param.value);
                } else {
                    hasAllInputs = false;
                    break;
                }
            }
            if (!hasAllInputs) continue;

            // Build output vector from geometric properties, calculator or observation parameters
            const outputValues: Record<string, number> = {};
            let hasAllOutputs = true;
            for (const m of mapping.outputs) {
                if (isGeometricVariable(m.variableId)) {
                    const val = _getGeometricValue(el, m.variableId);
                    if (val != null) {
                        outputValues[m.variableId] = val;
                    } else {
                        hasAllOutputs = false;
                        break;
                    }
                } else if (isCalculatorVariable(m.variableId)) {
                    const val = _resolveCalculatorValue(m.variableId, el);
                    if (val != null) {
                        outputValues[m.variableId] = val;
                    } else {
                        hasAllOutputs = false;
                        break;
                    }
                } else {
                    const param = obsGroup.find((p: any) => p.parameterId === m.variableId);
                    if (param && param.value != null) {
                        outputValues[m.variableId] = parseFloat(param.value);
                    } else {
                        hasAllOutputs = false;
                        break;
                    }
                }
            }
            if (!hasAllOutputs) continue;

            // Normalize and create sample
            const input = normalizeInputVector(inputValues, mapping.inputs);
            const target = new Float32Array(mapping.outputs.length);
            for (let i = 0; i < mapping.outputs.length; i++) {
                const m = mapping.outputs[i];
                if (!m) continue;
                target[i] = clamp(normalize(outputValues[m.variableId], m.min, m.max), 0, 1);
            }
            samples.push({ input, target });
        }
    }
}

/**
 * Extract geometric value from element data for plume pseudo-variables.
 */
function _getGeometricValue(element: AnyRecord, variableId: string): number | null {
    if (element.family !== 'plume') return null;
    const shape = element.data?.shape;
    const center = element.data?.center;
    switch (variableId) {
        case 'plume_radiusX':
            return shape?.radiusX ?? null;
        case 'plume_radiusY':
            return shape?.radiusY ?? null;
        case 'plume_radiusZ':
            return shape?.radiusZ ?? null;
        case 'plume_centerX':
            return center?.x ?? null;
        case 'plume_centerY':
            return center?.y ?? null;
        case 'plume_centerZ':
            return center?.z ?? null;
        default:
            return null;
    }
}

/**
 * Extract geometric value from a plume timeline snapshot.
 * Usado no modo cross-element (poco → pluma) para obter geometria
 * variante por campanha em vez de geometria estatica.
 *
 * @param snapshot - { shape: {radiusX, radiusY, radiusZ}, center: {x, y, z} }
 */
function _getGeometricValueFromSnapshot(snapshot: AnyRecord, variableId: string): number | null {
    const shape = snapshot?.shape;
    const center = snapshot?.center;
    switch (variableId) {
        case 'plume_radiusX':
            return shape?.radiusX ?? null;
        case 'plume_radiusY':
            return shape?.radiusY ?? null;
        case 'plume_radiusZ':
            return shape?.radiusZ ?? null;
        case 'plume_centerX':
            return center?.x ?? null;
        case 'plume_centerY':
            return center?.y ?? null;
        case 'plume_centerZ':
            return center?.z ?? null;
        default:
            return null;
    }
}

/**
 * Train a network from model data.
 * Coleta dados, treina a rede e persiste resultado.
 *
 * @param networkId
 * @param opts - quiet: sem toasts (treino em background,
 *   ex: demo NN do random build 2026-06-11 — toasts de fundo confundem o usuário)
 */
export function trainNetworkFromModel(networkId: string, opts: { quiet?: boolean } = {}) {
    const _quiet = opts.quiet === true;
    const _notify = (msg: string, type: string) => {
        if (_quiet) {
            log.debug('[quiet-toast]', type, msg);
            return;
        }
        showToast(msg, type);
    };

    log.debug('trainNetworkFromModel:', networkId);
    const nn = getNetwork(networkId);
    const mapping: NNMapping | null = getNetworkMapping(networkId);
    log.debug('network:', !!nn, 'mapping:', mapping);
    if (!nn || !mapping) {
        _notify(t('nnBuilderHint'), 'error');
        log.warn('No network or mapping found');
        return;
    }
    if (!mapping.inputs?.length || !mapping.outputs?.length) {
        _notify('No variables mapped. Open Builder first.', 'error');
        log.warn('Empty mapping inputs/outputs');
        return;
    }

    // Ensure regression mode for mapped networks
    if (nn.mode !== 'regression') {
        nn.mode = 'regression';
    }

    const samples = buildTrainingData(networkId);
    log.debug('Training samples collected:', samples.length);

    if (samples.length < 5) {
        _notify(
            `Training: only ${samples.length} samples found (need ≥ 5). Generate a Random Model first (File > Random Model).`,
            'error',
        );
        return;
    }

    _notify(`${t('nnTrainNetwork')}: ${samples.length} samples...`, 'info');

    // Train with progress reporting
    const _result = nn.train(samples, {
        epochs: 100,
        lr: 0.01,
        batchSize: Math.min(32, Math.floor(samples.length / 2)),
        onProgress: (progress: { epoch: number; loss: number; accuracy: number; total: number }) => {
            const { epoch, loss, accuracy, total } = progress;
            if (epoch === total - 1) {
                _notify(
                    `${t('nnTrained')} — Loss: ${loss.toFixed(4)}, Accuracy: ${(accuracy * 100).toFixed(1)}%`,
                    'success',
                );
            }
        },
    });

    persistNetwork(networkId);

    // Re-render panel/modal if already visible (don't open if closed)
    import('./panelRenderer.js')
        .then((mod) => {
            mod.refreshPanel();
        })
        .catch((_e: any) => console.debug('[core/nn/whatIfEngine:silent-catch]', _e?.message || _e));
}

// ----------------------------------------------------------------
// UTILITIES
// ----------------------------------------------------------------
/**
 * Get default slider values (midpoint of each input range).
 * Valores padrao dos sliders (ponto medio de cada input).
 */
export function getDefaultInputValues(networkId: string): Record<string, number> {
    const mapping: NNMapping | null = getNetworkMapping(networkId);
    if (!mapping) return {};
    const values: Record<string, number> = {};
    for (const m of mapping.inputs) {
        values[m.variableId] = (m.min + m.max) / 2;
    }
    return values;
}
