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

/**
 * semanticMatcher.js - Semantic parameter matching with progressive degradation
 * ADR-022: Neuro-Symbolic Document Ingestion - Layer 3 (Semantic Matcher)
 *
 * Ativada APENAS para nomes nao resolvidos na Camada 2 (paramAliases + regexAnchors).
 *
 * Primary: @xenova/transformers WASM com modelo all-MiniLM-L6-v2 (~22MB)
 * Fallback: Levenshtein distance (se WASM falha, user recusa, ou deviceMemory < 4GB)
 *
 * Confidence: YELLOW (match semantico - sempre requer confirmacao humana)
 *
 * LLMs generativos sao sumariamente banidos do pipeline de extracao numerica.
 *
 * @module core/ingestion/documents/semanticMatcher
 */

import { getFullLookupMap, getAliasesForParam, getKnownParameterIds } from './paramAliases.js';
import { importCDN } from '../../../utils/helpers/cdnLoader.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** CDN for @xenova/transformers (WASM-based, runs entirely in browser) */
const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

/** Model ID for sentence embedding */
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

/** Minimum cosine similarity for transformer match */
const TRANSFORMER_THRESHOLD = 0.65;

/** Minimum normalized Levenshtein score for fallback match */
const LEVENSHTEIN_THRESHOLD = 0.6;

/** High-confidence threshold (still yellow — semantic match always needs human review) */
const _HIGH_THRESHOLD = 0.8;

/** Minimum device memory (GB) to attempt transformer loading */
const MIN_DEVICE_MEMORY_GB = 4;

/** Cache name for model storage via Cache API */
const CACHE_NAME = 'ecbyts-transformer-models';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {any} */ let pipeline = null;
/** @type {any} */ let embedder: any = null;
/** @type {any} */ let catalogEmbeddings: any = null; // Map<parameterId, Float32Array>
/** @type {boolean|null} */ let transformerAvailable: any = null; // null = unknown, true/false after check
let userConsented = false;

// ---------------------------------------------------------------------------
// Levenshtein Distance (always available - no dependencies)
// ---------------------------------------------------------------------------

/**
 * Calculates normalized Levenshtein similarity between two strings.
 * Returns a score between 0.0 (completely different) and 1.0 (identical).
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score 0.0-1.0
 */
function levenshteinSimilarity(a: any, b: any) {
    if (!a || !b) return 0;
    if (a === b) return 1;

    const la = a.length,
        lb = b.length;
    const maxLen = Math.max(la, lb);
    if (maxLen === 0) return 1;

    // Standard DP matrix
    const matrix: any[] = [];
    for (let i = 0; i <= la; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= lb; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= la; i++) {
        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1, // deletion
                matrix[i][j - 1] + 1, // insertion
                matrix[i - 1][j - 1] + cost, // substitution
            );
        }
    }

    const distance: number = matrix[la][lb];
    return 1 - distance / maxLen;
}

/**
 * Normalizes a string for Levenshtein comparison:
 * lowercase, strip accents, collapse whitespace
 * @param {string} str
 * @returns {string}
 */
function normalizeForLev(str: any) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Levenshtein Matcher
// ---------------------------------------------------------------------------

/**
 * Finds the best match for a name using Levenshtein distance against all aliases.
 *
 * @param {string} name - Unknown parameter name to match
 * @returns {{ parameterId: string, score: number, matchedAlias: string }|null}
 */
function matchLevenshtein(name: any) {
    const normalized = normalizeForLev(name);
    const lookupMap = getFullLookupMap();

    let bestScore = 0;
    let bestParam = null;
    let bestAlias = null;

    for (const [alias, paramId] of lookupMap.entries()) {
        const score = levenshteinSimilarity(normalized, normalizeForLev(alias));
        if (score > bestScore) {
            bestScore = score;
            bestParam = paramId;
            bestAlias = alias;
        }
    }

    if (bestScore >= LEVENSHTEIN_THRESHOLD) {
        return { parameterId: bestParam, score: bestScore, matchedAlias: bestAlias };
    }

    return null;
}

// ---------------------------------------------------------------------------
// Transformer Embedding (consent-gated, progressive degradation)
// ---------------------------------------------------------------------------

/**
 * Checks if the device can handle the transformer model.
 * Considers navigator.deviceMemory, navigator.hardwareConcurrency.
 * @returns {boolean}
 */
function canRunTransformer() {
    // navigator.deviceMemory is only available in some browsers (Chrome, Edge)
    const mem = /** @type {any} */ (navigator as any).deviceMemory;
    if (mem !== undefined && mem < MIN_DEVICE_MEMORY_GB) return false;

    // Check for WebAssembly support
    if (typeof WebAssembly === 'undefined') return false;

    return true;
}

/**
 * Checks if the transformer model is already cached (Cache API).
 * @returns {Promise<boolean>}
 */
async function isModelCached() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        return keys.length > 0;
    } catch {
        return false;
    }
}

/**
 * Loads the transformer pipeline from CDN.
 * Requires prior user consent (consent gate).
 * @returns {Promise<boolean>} true if loaded successfully
 */
async function loadTransformer() {
    if (embedder) return true;

    try {
        /** @type {any} */
        const module = await importCDN(TRANSFORMERS_CDN, { name: 'Transformers.js' });
        pipeline = module.pipeline;

        embedder = await pipeline('feature-extraction', MODEL_ID, {
            quantized: true, // 4-bit quantized for smaller download
            cache_dir: CACHE_NAME,
        });

        return true;
    } catch (/** @type {any} */ e) {
        console.warn('[semanticMatcher] Transformer load failed:', (e as any)?.message);
        transformerAvailable = false;
        return false;
    }
}

/**
 * Computes embeddings for all known parameter aliases.
 * Called once after transformer loads - results are cached in memory.
 * @returns {Promise<Map<string, Float32Array>>}
 */
async function buildCatalogEmbeddings() {
    if (catalogEmbeddings) return catalogEmbeddings;
    if (!embedder) throw new Error('Transformer not loaded');

    catalogEmbeddings = new Map();
    const paramIds = getKnownParameterIds();

    for (const paramId of paramIds) {
        const aliases = getAliasesForParam(paramId);
        if (aliases.length === 0) continue;

        // Use the first 3 aliases as representative texts
        const texts = aliases.slice(0, 3);
        const embeddings = await embedder(texts, { pooling: 'mean', normalize: true });

        // Average the embeddings
        const dim = embeddings.data.length / texts.length;
        const avg = new Float32Array(dim);
        for (let t = 0; t < texts.length; t++) {
            for (let d = 0; d < dim; d++) {
                avg[d]! += embeddings.data[t * dim + d]!;
            }
        }
        for (let d = 0; d < dim; d++) avg[d]! /= texts.length;

        // Normalize
        let norm = 0;
        for (let d = 0; d < dim; d++) norm += avg[d]! * avg[d]!;
        norm = Math.sqrt(norm);
        if (norm > 0) for (let d = 0; d < dim; d++) avg[d]! /= norm;

        catalogEmbeddings.set(paramId, avg);
    }

    return catalogEmbeddings;
}

/**
 * Computes cosine similarity between two vectors
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number}
 */
function cosineSimilarity(a: any, b: any) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot; // Vectors are already normalized
}

/**
 * Finds the best match for a name using transformer embeddings.
 *
 * @param {string} name - Unknown parameter name
 * @returns {Promise<{ parameterId: string, score: number }|null>}
 */
async function matchTransformer(name: any) {
    if (!embedder || !catalogEmbeddings) return null;

    const embedding = await embedder([name], { pooling: 'mean', normalize: true });
    const queryVec = new Float32Array(embedding.data);

    let bestScore = 0;
    let bestParam = null;

    for (const [paramId, catVec] of catalogEmbeddings.entries()) {
        const score = cosineSimilarity(queryVec, catVec);
        if (score > bestScore) {
            bestScore = score;
            bestParam = paramId;
        }
    }

    if (bestScore >= TRANSFORMER_THRESHOLD) {
        return { parameterId: bestParam, score: bestScore };
    }

    return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sets user consent for transformer model download.
 * Must be called from UI after user confirms the ~22MB download.
 * @param {boolean} consented
 */
export function setTransformerConsent(consented: any) {
    userConsented = !!consented;
}

/**
 * Returns transformer availability status.
 * @returns {{ available: boolean, cached: Promise<boolean>, deviceCapable: boolean, consented: boolean }}
 */
export function getTransformerStatus() {
    return {
        available: transformerAvailable !== false,
        cached: isModelCached(),
        deviceCapable: canRunTransformer(),
        consented: userConsented,
    };
}

/**
 * Initializes the transformer (if consented and capable).
 * Should be called once, after user consent.
 * Returns true if transformer is ready, false if fell back to Levenshtein.
 *
 * @param {function} [onProgress] - Progress callback (percent, message)
 * @returns {Promise<boolean>}
 */
export async function initTransformer(onProgress: any) {
    if (!userConsented) {
        transformerAvailable = false;
        return false;
    }

    if (!canRunTransformer()) {
        transformerAvailable = false;
        if (onProgress) onProgress(100, 'Device memory insufficient — using text matching');
        return false;
    }

    try {
        if (onProgress) onProgress(10, 'Loading transformer model...');
        const loaded = await loadTransformer();
        if (!loaded) return false;

        if (onProgress) onProgress(50, 'Building parameter embeddings...');
        await buildCatalogEmbeddings();

        transformerAvailable = true;
        if (onProgress) onProgress(100, 'Transformer ready');
        return true;
    } catch (/** @type {any} */ e) {
        console.warn('[semanticMatcher] Init failed:', (e as any)?.message);
        transformerAvailable = false;
        return false;
    }
}

/**
 * Matches an unknown parameter name using the best available method.
 * Progressive degradation: Transformer → Levenshtein → null.
 *
 * Confidence is ALWAYS 'yellow' for semantic matches (requires human review).
 *
 * @param {string} name - Parameter name to resolve
 * @returns {Promise<{ parameterId: string, confidence: 'yellow', score: number, method: 'transformer'|'levenshtein', matchedAlias?: string }|null>}
 */
export async function matchSemantic(name: any) {
    if (!name || typeof name !== 'string') return null;

    // Try transformer first (if available)
    if (transformerAvailable && embedder && catalogEmbeddings) {
        const result = await matchTransformer(name);
        if (result) {
            return {
                parameterId: result.parameterId,
                confidence: 'yellow',
                score: result.score,
                method: 'transformer',
            };
        }
    }

    // Fallback: Levenshtein
    const levResult = matchLevenshtein(name);
    if (levResult) {
        return {
            parameterId: levResult.parameterId,
            confidence: 'yellow',
            score: levResult.score,
            method: 'levenshtein',
            matchedAlias: levResult.matchedAlias,
        };
    }

    return null;
}

/**
 * Batch-matches multiple names. More efficient for transformer (batched embedding).
 *
 * @param {string[]} names - Array of parameter names to resolve
 * @returns {Promise<Array<{ name: string, result: Object|null }>>}
 */
export async function matchSemanticBatch(names: any) {
    const results = [];
    for (const name of names) {
        const result = await matchSemantic(name);
        results.push({ name, result });
    }
    return results;
}

/**
 * Returns the Levenshtein similarity between two strings (exposed for testing).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function getLevenshteinSimilarity(a: any, b: any) {
    return levenshteinSimilarity(normalizeForLev(a), normalizeForLev(b));
}
