// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Integrity (Phase 9)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S9
 *
 * Phase 9 (2026-05-01) - pure-logic helpers para hashing + integridade
 * de pipelines. Complementa:
 *   - Phase 7 keyEncoding (TLP segment format)
 *   - Phase 8 pipelineCatalog (savedPipeline + library)
 *
 * Estratégia:
 *   - Hash determinístico via canonical JSON (sort keys + types preservados)
 *   - SHA-256 via Web Crypto API (browser + Node 18+ nativo)
 *   - HMAC opcional para integridade com chave compartilhada
 *   - chainHash: encadeia múltiplos pipelines (anti-tamper de catálogo)
 *
 * NÃO depende de browser DOM. Web Crypto está disponível em Node 18+ via
 * globalThis.crypto.subtle e em browsers via window.crypto.subtle.
 *
 * Owner: Claude (orquestrador apropriador)
 */

const HASH_ALGORITHM = 'SHA-256';
const HMAC_ALGORITHM = { name: 'HMAC', hash: 'SHA-256' };

/** Identidade do módulo. */
export const PIPELINE_INTEGRITY_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 9,
    deliveredAt: '2026-05-01',
    hashAlgorithm: HASH_ALGORITHM,
});

/**
 * Detecta se a Web Crypto API está disponível.
 *
 * @returns {boolean}
 */
export function isWebCryptoAvailable(): boolean {
    return Boolean(
        typeof globalThis !== 'undefined' &&
        globalThis.crypto &&
        globalThis.crypto.subtle &&
        typeof globalThis.crypto.subtle.digest === 'function',
    );
}

/**
 * Serializa um valor para JSON canônico:
 *   - chaves de objeto sortidas alfabeticamente
 *   - arrays preservados na ordem
 *   - undefined removido (JSON spec)
 *   - sem espaços
 *
 * Garantia: 2 valores estruturalmente iguais → mesmo string → mesmo hash.
 *
 * @param {*} value
 * @returns {string}
 */
export function canonicalStringify(value: any): string {
    return JSON.stringify(_canonicalize(value));
}

/**
 * @param {any} value
 * @returns {any}
 */
function _canonicalize(value: any): any {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
        return value.map(_canonicalize);
    }
    if (typeof value === 'object') {
        const sortedKeys = Object.keys(value).sort();
        const out: Record<string, any> = {};
        for (const k of sortedKeys) {
            const v = value[k];
            if (v !== undefined) {
                out[k] = _canonicalize(v);
            }
        }
        return out;
    }
    return value;
}

/**
 * Codifica buffer ArrayBuffer em hex string.
 */
function bufferToHex(buffer: any): string {
    const bytes = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i]!.toString(16).padStart(2, '0');
    }
    return hex;
}

/**
 * Computa SHA-256 hex de uma string UTF-8.
 *
 * @param {string} text
 * @returns {Promise<string>} hex digest 64 chars
 */
export async function sha256Hex(text: string): Promise<string> {
    if (typeof text !== 'string') {
        throw new TypeError('text must be string');
    }
    if (!isWebCryptoAvailable()) {
        throw new Error('Web Crypto API not available');
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const digest = await globalThis.crypto.subtle.digest(HASH_ALGORITHM, data);
    return bufferToHex(digest);
}

/**
 * Computa hash determinístico de um pipeline (lista de stepConfigs).
 *
 * @param {Array<{libraryId: string, config?: Object}>} stepConfigs
 * @returns {Promise<string>} hex 64 chars
 */
export async function hashPipeline(stepConfigs: Array<{ libraryId: string; config?: object }>): Promise<string> {
    if (!Array.isArray(stepConfigs)) {
        throw new TypeError('stepConfigs must be array');
    }
    const minimal = stepConfigs.map((step) => {
        if (!step || typeof step !== 'object') {
            throw new Error('step must be object');
        }
        const out: Record<string, any> = { libraryId: String(step.libraryId || '').trim() };
        if (!out.libraryId) {
            throw new Error('libraryId required');
        }
        if (step.config && typeof step.config === 'object') {
            out.config = step.config;
        }
        return out;
    });
    const json = canonicalStringify({ steps: minimal });
    return sha256Hex(json);
}

/**
 * Computa hash de um savedPipeline (do Phase 8 catalog).
 * Inclui name + description + tags + stepConfigs (timestamps excluídos
 * para evitar churn de hash em renames sem mudança lógica).
 *
 * @param {Record<string, any>} savedPipeline
 * @returns {Promise<string>}
 */
export async function hashSavedPipeline(savedPipeline: Record<string, any>): Promise<string> {
    if (!savedPipeline || typeof savedPipeline !== 'object') {
        throw new TypeError('savedPipeline must be object');
    }
    const payload = {
        id: String(savedPipeline.id || ''),
        name: String(savedPipeline.name || ''),
        description: String(savedPipeline.description || ''),
        stepConfigs: Array.isArray(savedPipeline.stepConfigs) ? savedPipeline.stepConfigs : [],
        tags: Array.isArray(savedPipeline.tags) ? [...savedPipeline.tags].sort() : [],
    };
    return sha256Hex(canonicalStringify(payload));
}

/**
 * Encadeia hashes de múltiplos pipelines (chainHash anti-tamper).
 * Cada pipeline contribui com seu hash; resultado depende da ordem.
 *
 * Algoritmo: H_i = SHA256(H_{i-1} || hash(p_i))
 * H_0 = hash do primeiro pipeline diretamente.
 *
 * @param {Array<Object>} savedPipelines
 * @returns {Promise<string>} hash final hex
 */
export async function chainHash(savedPipelines: Array<object>): Promise<string> {
    if (!Array.isArray(savedPipelines)) {
        throw new TypeError('savedPipelines must be array');
    }
    if (savedPipelines.length === 0) {
        return await sha256Hex(''); // hash de string vazia
    }
    let acc = await hashSavedPipeline(savedPipelines[0]!);
    for (let i = 1; i < savedPipelines.length; i++) {
        const h = await hashSavedPipeline(savedPipelines[i]!);
        acc = await sha256Hex(acc + h);
    }
    return acc;
}

/**
 * Verifica se um pipeline corresponde a um hash esperado.
 *
 * @param {any[]} stepConfigs
 * @param {string} expectedHash hex
 * @returns {Promise<boolean>}
 */
export async function verifyPipelineHash(stepConfigs: any[], expectedHash: string): Promise<boolean> {
    if (typeof expectedHash !== 'string' || expectedHash.length !== 64) {
        return false;
    }
    try {
        const actual = await hashPipeline(stepConfigs);
        return actual === expectedHash;
    } catch {
        return false;
    }
}

/**
 * Computa HMAC-SHA256 de um pipeline com chave compartilhada.
 * Útil para integridade com identidade do owner (sem revelar chave).
 *
 * @param {any[]} stepConfigs
 * @param {string} secretKey
 * @returns {Promise<string>} HMAC hex
 */
export async function hmacPipeline(stepConfigs: any[], secretKey: string): Promise<string> {
    if (!isWebCryptoAvailable()) {
        throw new Error('Web Crypto API not available');
    }
    if (typeof secretKey !== 'string' || !secretKey) {
        throw new TypeError('secretKey must be non-empty string');
    }
    if (!Array.isArray(stepConfigs)) {
        throw new TypeError('stepConfigs must be array');
    }
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(secretKey);
    const cryptoKey = await globalThis.crypto.subtle.importKey('raw', keyBytes, HMAC_ALGORITHM, false, ['sign']);
    const minimal = stepConfigs.map((step) => {
        const out: Record<string, any> = { libraryId: String(step?.libraryId || '').trim() };
        if (!out.libraryId) throw new Error('libraryId required');
        if (step.config && typeof step.config === 'object') out.config = step.config;
        return out;
    });
    const data = encoder.encode(canonicalStringify({ steps: minimal }));
    const signature = await globalThis.crypto.subtle.sign(HMAC_ALGORITHM.name, cryptoKey, data);
    return bufferToHex(signature);
}

/**
 * Verifica HMAC com constant-time comparison.
 *
 * @param {any[]} stepConfigs
 * @param {string} secretKey
 * @param {string} expectedHmac
 * @returns {Promise<boolean>}
 */
export async function verifyHmac(
    stepConfigs: any[],
    secretKey: string,
    expectedHmac: string,
): Promise<boolean> {
    if (typeof expectedHmac !== 'string' || expectedHmac.length !== 64) return false;
    try {
        const actual = await hmacPipeline(stepConfigs, secretKey);
        return constantTimeEqual(actual, expectedHmac);
    } catch {
        return false;
    }
}

/**
 * Constant-time string comparison para evitar timing attacks.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function constantTimeEqual(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

/**
 * Module identity export.
 */
export const pipelineIntegrityMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 9,
    deliveredAt: '2026-05-01',
    hashAlgorithm: HASH_ALGORITHM,
    exports: [
        'PIPELINE_INTEGRITY_META',
        'isWebCryptoAvailable',
        'canonicalStringify',
        'sha256Hex',
        'hashPipeline',
        'hashSavedPipeline',
        'chainHash',
        'verifyPipelineHash',
        'hmacPipeline',
        'verifyHmac',
        'constantTimeEqual',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
