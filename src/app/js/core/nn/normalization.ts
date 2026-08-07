// @ts-check
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
   NORMALIZATION ENGINE — Min-Max scaling for NN inputs/outputs
   Motor de normalizacao para escalar valores fisicos para [0,1]

   Implementa a formula classica de calibracao:
     normalizado = (valor - min) / (max - min)
     fisico      = normalizado * (max - min) + min

   Os limites MIN_MODEL e MAX_MODEL sao configurados pelo usuario
   no construtor de variaveis (builderRenderer.js).
   ================================================================ */
import { PARAMETER_RANGES } from '../elements/randomModel.js';
import { getCalculatorItemById } from '../calculator/manager.js';
import { computeCalculatorItemForElement } from '../calculator/engine.js';
import { getAllElements } from '../elements/manager.js';
type AnyRecord = Record<string, any>;
// ----------------------------------------------------------------
// CORE FUNCTIONS - Normalize, denormalize, clamp
// Funcoes principais de conversao escalar
// ----------------------------------------------------------------
/**
 * Normalize a physical value to [0, 1].
 * Converte grandeza fisica para escala normalizada.
 *
 * @param {number} value - Physical value
 * @param {number} min - MIN_MODEL
 * @param {number} max - MAX_MODEL
 * @returns {number} Normalized value [0, 1]
 */
export function normalize(value: any, min: any, max: any) {
    if (max === min)
        return 0.5;
    return (value - min) / (max - min);
}
/**
 * Denormalize a [0, 1] value back to physical units.
 * Converte valor normalizado de volta para grandeza fisica.
 *
 * @param {number} normalized - Value in [0, 1]
 * @param {number} min - MIN_MODEL
 * @param {number} max - MAX_MODEL
 * @returns {number} Physical value
 */
export function denormalize(normalized: any, min: any, max: any) {
    return normalized * (max - min) + min;
}
/**
 * Clamp a value between min and max.
 * Limita um valor ao intervalo especificado.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value: any, min: any, max: any) {
    return Math.max(min, Math.min(max, value));
}
/**
 * Get default normalization bounds for a variable from PARAMETER_RANGES.
 * Retorna limites padrao do catalogo de faixas de parametros.
 *
 * @param {string} variableId - Parameter or geometric variable ID
 * @returns {{ min: number, max: number, unitId: string } | null}
 */
export function getDefaultBounds(variableId: any) {
    // Check environmental parameters
    const range = (PARAMETER_RANGES as AnyRecord)[variableId] as { min: number, max: number, unitId: string } | undefined;
    if (range) {
        return { min: range.min, max: range.max, unitId: range.unitId };
    }
    // Geometric pseudo-variables (plume shape/position)
    const geometricDefaults: AnyRecord = {
        plume_radiusX: { min: 1, max: 50, unitId: 'm' },
        plume_radiusY: { min: 1, max: 50, unitId: 'm' },
        plume_radiusZ: { min: 1, max: 30, unitId: 'm' },
        plume_centerX: { min: -100, max: 100, unitId: 'm' },
        plume_centerY: { min: -80, max: 0, unitId: 'm' },
        plume_centerZ: { min: -100, max: 100, unitId: 'm' },
    };
    const _gd = (geometricDefaults);
    if (_gd[variableId])
        return _gd[variableId];
    // Calculator-derived variables: auto-compute bounds from all elements
    // Variaveis calculadas: estima min/max avaliando todos os elementos
    if (variableId.startsWith('calc:')) {
        const calcId = variableId.replace(/^calc:/, '');
        try {
            const item = getCalculatorItemById(calcId) as any;
            if (!item)
                return { min: 0, max: 1, unitId: '' };
            const elements = getAllElements();
            const values: any[] = [];
            for (const el of elements) {
                const v = computeCalculatorItemForElement(item, el);
                if (v != null)
                    values.push(v);
            }
            if (values.length === 0)
                return { min: 0, max: 1, unitId: item.unitId || '' };
            const lo = Math.min(...values);
            const hi = Math.max(...values);
            const pad = (hi - lo) * 0.1 || 1;
            return { min: lo - pad, max: hi + pad, unitId: item.unitId || '' };
        }
        catch {
            return { min: 0, max: 1, unitId: '' };
        }
    }
    return null;
}
/**
 * Normalize an entire input vector using mapping bounds.
 * Normaliza vetor de entrada completo para alimentar a rede.
 *
 * @param {Object<string, number>} inputValues - { variableId: physicalValue }
 * @param {Array<{ variableId: string, min: number, max: number }>} mappingInputs
 * @returns {Float32Array}
 */
export function normalizeInputVector(inputValues: any, mappingInputs: any) {
    const vec = new Float32Array(mappingInputs.length);
    for (let i = 0; i < mappingInputs.length; i++) {
        const m = mappingInputs[i];
        const raw = inputValues[m.variableId] ?? (m.min + m.max) / 2;
        vec[i] = clamp(normalize(raw, m.min, m.max), 0, 1);
    }
    return vec;
}
/**
 * Denormalize an output vector using mapping bounds.
 * Converte saida da rede de volta para grandezas fisicas.
 *
 * @param {Float32Array} outputVector - Raw NN output [0,1]
 * @param {Array<{ variableId: string, min: number, max: number }>} mappingOutputs
 * @returns {Object<string, number>} { variableId: physicalValue }
 */
export function denormalizeOutputVector(outputVector: any, mappingOutputs: any) {
    const result: any = {};
    for (let i = 0; i < mappingOutputs.length; i++) {
        const m = mappingOutputs[i];
        result[m.variableId] = denormalize(outputVector[i], m.min, m.max);
    }
    return result;
}
//# sourceMappingURL=normalization.js.map
