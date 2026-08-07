// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Key Encode/Decode (Phase 7 partial)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S7
 *
 * Phase 7 (2026-04-30) - pure-logic helpers para serializar/deserializar
 * pipelines de transform como segmento extra em chaves ECBT.
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Estratégia:
 *   - Pipeline serializado é um JSON pequeno (`<200 bytes` típico)
 *   - Comprimido base64url (URL-safe, sem padding)
 *   - Prefixo "TLP" (Transform Library Pipeline) para detecção
 *   - Versão embutida (TLP_VERSION) para evolução compatível
 *   - Validação fail-closed em decode (estrutura, libraryIds não-vazios)
 *
 * Limitações deliberadas:
 *   - Sem compressão pesada (LZ77 etc.) - manter pure-JS, sem deps
 *   - Sem assinatura crypto aqui - chave ECBT B/C cuida disso no encoder global
 *   - Pipeline grande (>2KB serializado) é rejeitado para não inflar a chave
 *
 * Owner: Claude (orquestrador apropriador)
 */

const TLP_PREFIX = 'TLP';
const TLP_VERSION = 1;
const TLP_MAX_BYTES = 2048; // teto de payload serializado

/** Identidade do segmento. */
export const TLP_SEGMENT_META = Object.freeze({
    prefix: TLP_PREFIX,
    version: TLP_VERSION,
    maxBytes: TLP_MAX_BYTES,
});

/**
 * Codifica bytes para base64url (RFC 4648 §5, sem padding).
 */
export function toBase64Url(text: string): string {
    if (typeof text !== 'string') throw new TypeError('text must be string');
    // Browser & Node: prefer Buffer if available, fallback to btoa.
    let b64;
    const _Buffer = (globalThis as any).Buffer;
    if (typeof _Buffer !== 'undefined') {
        b64 = _Buffer.from(text, 'utf8').toString('base64');
    } else if (typeof btoa === 'function') {
        // btoa expects latin1 - encode UTF-8 first.
        const utf8 = unescape(encodeURIComponent(text));
        b64 = btoa(utf8);
    } else {
        throw new Error('No base64 encoder available');
    }
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodifica base64url para texto UTF-8.
 */
export function fromBase64Url(encoded: string): string {
    if (typeof encoded !== 'string') throw new TypeError('encoded must be string');
    const padded = encoded
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const _Buffer = (globalThis as any).Buffer;
    if (typeof _Buffer !== 'undefined') {
        return _Buffer.from(padded, 'base64').toString('utf8');
    } else if (typeof atob === 'function') {
        const latin1 = atob(padded);
        return decodeURIComponent(escape(latin1));
    }
    throw new Error('No base64 decoder available');
}

/**
 * Serializa um pipeline (lista de stepConfigs) em payload compacto.
 * @throws {Error} se inválido ou maior que TLP_MAX_BYTES
 */
export function encodePipelineToSegment(
    stepConfigs: Array<{ libraryId: string; config?: object }>,
): { encoded: string; byteLength: number } {
    if (!Array.isArray(stepConfigs)) {
        throw new TypeError('stepConfigs must be array');
    }
    const minimal = stepConfigs.map((step, i) => {
        if (!step || typeof step !== 'object') {
            throw new Error(`Step ${i} not an object`);
        }
        const libraryId = String(step.libraryId || '').trim();
        if (!libraryId) {
            throw new Error(`Step ${i} has empty libraryId`);
        }
        const out: Record<string, any> = { libraryId };
        if (step.config && typeof step.config === 'object' && Object.keys(step.config).length > 0) {
            out.config = step.config;
        }
        return out;
    });

    const payload = {
        v: TLP_VERSION,
        steps: minimal,
    };
    const json = JSON.stringify(payload);
    const byteLength = json.length;
    if (byteLength > TLP_MAX_BYTES) {
        throw new Error(`Pipeline serialized exceeds ${TLP_MAX_BYTES} bytes (got ${byteLength})`);
    }
    const b64 = toBase64Url(json);
    return {
        encoded: `${TLP_PREFIX}${TLP_VERSION}.${b64}`,
        byteLength,
    };
}

/**
 * Decodifica segmento `TLP1.<base64url>` em lista de stepConfigs.
 * @throws {Error} se prefixo, versão ou estrutura inválidos
 */
export function decodePipelineFromSegment(
    segment: string,
): { steps: Array<{ libraryId: string; config?: object }>; version: number } {
    if (typeof segment !== 'string' || !segment) {
        throw new TypeError('segment must be non-empty string');
    }
    if (!segment.startsWith(TLP_PREFIX)) {
        throw new Error(`Segment must start with "${TLP_PREFIX}"`);
    }
    // Esperado: TLP<version>.<base64url>
    const dotIdx = segment.indexOf('.');
    if (dotIdx < TLP_PREFIX.length + 1 || dotIdx === segment.length - 1) {
        throw new Error('Segment missing version-payload separator "."');
    }
    const versionPart = segment.slice(TLP_PREFIX.length, dotIdx);
    const version = Number.parseInt(versionPart, 10);
    if (!Number.isFinite(version) || version < 1) {
        throw new Error(`Invalid TLP version "${versionPart}"`);
    }
    if (version > TLP_VERSION) {
        throw new Error(`Unsupported TLP version ${version} (max known: ${TLP_VERSION})`);
    }

    const b64 = segment.slice(dotIdx + 1);
    const json = fromBase64Url(b64);
    let payload;
    try {
        payload = JSON.parse(json);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to parse TLP payload JSON: ${msg}`, { cause: err });
    }
    if (!payload || typeof payload !== 'object') {
        throw new Error('TLP payload root must be object');
    }
    if (!Array.isArray(payload.steps)) {
        throw new Error('TLP payload.steps must be array');
    }
    const steps = payload.steps.map((step: any, i: any) => {
        if (!step || typeof step !== 'object') {
            throw new Error(`Decoded step ${i} not object`);
        }
        const libraryId = String(step.libraryId || '').trim();
        if (!libraryId) {
            throw new Error(`Decoded step ${i} has empty libraryId`);
        }
        const out: Record<string, any> = { libraryId };
        if (step.config && typeof step.config === 'object') {
            out.config = step.config;
        }
        return out;
    });
    return { steps, version };
}

/**
 * Round-trip helper: encode + decode para validar pipeline.
 */
export function roundTripPipeline(
    stepConfigs: Array<{ libraryId: string; config?: object }>,
): { ok: boolean; error?: string; recovered?: any[] } {
    try {
        const { encoded } = encodePipelineToSegment(stepConfigs);
        const { steps } = decodePipelineFromSegment(encoded);
        return { ok: true, recovered: steps };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
    }
}

/**
 * Detecta se uma string é um segmento TLP válido (prefix + versão).
 * Não valida a parte base64 (delegado para `decodePipelineFromSegment`).
 */
export function isTLPSegment(candidate: string): boolean {
    if (typeof candidate !== 'string' || candidate.length < TLP_PREFIX.length + 2) return false;
    if (!candidate.startsWith(TLP_PREFIX)) return false;
    const dotIdx = candidate.indexOf('.');
    if (dotIdx < TLP_PREFIX.length + 1) return false;
    const versionPart = candidate.slice(TLP_PREFIX.length, dotIdx);
    const v = Number.parseInt(versionPart, 10);
    return Number.isFinite(v) && v >= 1 && v <= TLP_VERSION;
}

/**
 * Module identity export.
 */
export const keyEncodingMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 7,
    deliveredAt: '2026-04-30',
    prefix: TLP_PREFIX,
    version: TLP_VERSION,
    maxBytes: TLP_MAX_BYTES,
    exports: [
        'TLP_SEGMENT_META',
        'toBase64Url',
        'fromBase64Url',
        'encodePipelineToSegment',
        'decodePipelineFromSegment',
        'roundTripPipeline',
        'isTLPSegment',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
