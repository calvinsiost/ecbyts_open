// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Segment Composition (Phase 7.5)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S7.5
 *
 * Phase 7.5 (2026-05-01) - pure-logic helpers para compor TLP segments
 * com outras camadas de uma chave ECBT (signature, metadata) sem precisar
 * do encoder global.
 *
 * Estratégia:
 *   - TLP segments são extras anexados a chaves ECBT B/C
 *   - Composição via separator '~' (não usado em base64url nem ECBT format)
 *   - Detecção robusta: pode haver 0, 1 ou N TLP segments numa chave
 *   - Extração preserva ordem; primeiro TLP é canônico
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

import { encodePipelineToSegment, decodePipelineFromSegment, isTLPSegment } from './keyEncoding.js';

/** Separador entre TLP segment e payload da chave ECBT. */
const TLP_SEPARATOR = '~';

/** Identidade do composer. */
export const TLP_COMPOSITION_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: '7.5',
    deliveredAt: '2026-05-01',
    separator: TLP_SEPARATOR,
});

/**
 * Anexa um TLP segment a uma chave/payload existente.
 *
 * @param {string} basePayload - chave ECBT ou string base
 * @param {Array<{libraryId: string, config?: Object}>} stepConfigs
 * @returns {string} payload composto
 */
export function appendPipelineToPayload(
    basePayload: string,
    stepConfigs: Array<{ libraryId: string; config?: object }>,
): string {
    if (typeof basePayload !== 'string') {
        throw new TypeError('basePayload must be string');
    }
    const { encoded } = encodePipelineToSegment(stepConfigs);
    if (basePayload === '') {
        return encoded;
    }
    return `${basePayload}${TLP_SEPARATOR}${encoded}`;
}

/**
 * Extrai todos os TLP segments de um payload composto.
 *
 * @param {string} composedPayload
 * @returns {{base: string, segments: Array<string>}}
 */
export function extractTLPSegments(composedPayload: string): { base: string; segments: Array<string> } {
    if (typeof composedPayload !== 'string' || !composedPayload) {
        return { base: '', segments: [] };
    }
    const parts = composedPayload.split(TLP_SEPARATOR);
    const segments = [];
    const baseParts = [];
    for (const part of parts) {
        if (isTLPSegment(part)) {
            segments.push(part);
        } else {
            baseParts.push(part);
        }
    }
    return {
        base: baseParts.join(TLP_SEPARATOR),
        segments,
    };
}

/**
 * Decodifica todos os TLP segments de uma chave composta.
 * Retorna lista paralela com results decodificados ou erros.
 *
 * @param {string} composedPayload
 * @returns {{base: string, pipelines: Array<{ok: boolean, steps?: any[], error?: string}>}}
 */
export function decodeAllPipelinesFromPayload(composedPayload: string): {
    base: string;
    pipelines: Array<{ ok: boolean; steps?: any[]; version?: any; error?: string }>;
} {
    const { base, segments } = extractTLPSegments(composedPayload);
    const pipelines = segments.map((seg) => {
        try {
            const { steps, version } = decodePipelineFromSegment(seg);
            return { ok: true, steps, version };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    return { base, pipelines };
}

/**
 * Conta quantos TLP segments existem numa string sem decodificar.
 *
 * @param {string} composedPayload
 * @returns {number}
 */
export function countTLPSegments(composedPayload: string): number {
    if (typeof composedPayload !== 'string' || !composedPayload) return 0;
    return composedPayload.split(TLP_SEPARATOR).filter(isTLPSegment).length;
}

/**
 * Remove todos os TLP segments de um payload, retornando apenas a base.
 *
 * @param {string} composedPayload
 * @returns {string}
 */
export function stripTLPSegments(composedPayload: string): string {
    return extractTLPSegments(composedPayload).base;
}

/**
 * Substitui o primeiro TLP segment de um payload por um novo pipeline.
 * Se não houver TLP, anexa.
 *
 * @param {string} composedPayload
 * @param {Array<{libraryId: string, config?: Object}>} newStepConfigs
 * @returns {string}
 */
export function replaceFirstPipeline(
    composedPayload: string,
    newStepConfigs: Array<{ libraryId: string; config?: object }>,
): string {
    if (typeof composedPayload !== 'string') {
        throw new TypeError('composedPayload must be string');
    }
    const { encoded: newSegment } = encodePipelineToSegment(newStepConfigs);
    if (composedPayload === '') return newSegment;

    const parts = composedPayload.split(TLP_SEPARATOR);
    let replaced = false;
    const out = parts.map((part) => {
        if (!replaced && isTLPSegment(part)) {
            replaced = true;
            return newSegment;
        }
        return part;
    });
    if (!replaced) out.push(newSegment);
    return out.join(TLP_SEPARATOR);
}

/**
 * Composer fluent API.
 */
export class TLPComposer {
    _payload: string;

    constructor(basePayload = '') {
        if (typeof basePayload !== 'string') {
            throw new TypeError('basePayload must be string');
        }
        this._payload = basePayload;
    }

    append(stepConfigs: any): this {
        this._payload = appendPipelineToPayload(this._payload, stepConfigs);
        return this;
    }

    replaceFirst(stepConfigs: any): this {
        this._payload = replaceFirstPipeline(this._payload, stepConfigs);
        return this;
    }

    strip(): this {
        this._payload = stripTLPSegments(this._payload);
        return this;
    }

    count(): number {
        return countTLPSegments(this._payload);
    }

    extract(): { base: string; segments: Array<string> } {
        return extractTLPSegments(this._payload);
    }

    decodeAll(): { base: string; pipelines: Array<{ ok: boolean; steps?: any[]; version?: any; error?: string }> } {
        return decodeAllPipelinesFromPayload(this._payload);
    }

    toString(): string {
        return this._payload;
    }
}

/**
 * Cria composer factory.
 */
export function createTLPComposer(basePayload = ''): TLPComposer {
    return new TLPComposer(basePayload);
}

/**
 * Module identity export.
 */
export const segmentCompositionMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: '7.5',
    deliveredAt: '2026-05-01',
    separator: TLP_SEPARATOR,
    exports: [
        'TLP_COMPOSITION_META',
        'appendPipelineToPayload',
        'extractTLPSegments',
        'decodeAllPipelinesFromPayload',
        'countTLPSegments',
        'stripTLPSegments',
        'replaceFirstPipeline',
        'TLPComposer',
        'createTLPComposer',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
