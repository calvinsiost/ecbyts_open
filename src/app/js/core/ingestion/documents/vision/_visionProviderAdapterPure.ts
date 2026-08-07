// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Vision provider adapter — pure logic (RF-3 of SPEC_VISION_FALLBACK).
 *
 * Defines the stable contract that vision providers (Gemma4 via OpenRouter
 * swarm, local YOLO DocLayout, future Gemini Vision) must implement, plus
 * pure-logic validators for input/output shape, rate limiting and request
 * queuing. The actual provider implementations live in separate files
 * (NOT pure — they touch the network) and import only this interface.
 *
 * Per SPEC §2.1 RF-3: "Pure-logic apenas: validação de shape de input/output,
 * rate limiting, cache key derivation" — this module covers all three.
 *
 * Anti-requirements honoured:
 *   - "imagem é FALLBACK" (Calvin diretiva 2026-06-02): never bypass the
 *     gate — caller MUST call `shouldActivateVisionFallback()` first.
 *   - Defensive: invalid request → `{ valid: false, errors: [...] }`,
 *     never propagated to provider.
 *   - LGPD: payload validators reject obvious PII strings (CPF, RG, emails)
 *     in metadata (image bytes are opaque).
 *
 * Tests live in `tests/vision-provider-adapter-pure.test.mjs`.
 */

import type { FigureCategory } from './_figureCategoryClassifierPure.js';

export interface VisionRequest {
    /** Opaque image bytes (caller resolves PDF page → JPEG/PNG). */
    readonly imageBytes: Uint8Array;
    /** Image dimensions (px). */
    readonly width: number;
    readonly height: number;
    /** Category from classifyFigureCategory (RF-2). */
    readonly category: FigureCategory;
    /** Caption text (already used in classifier; carried for prompt). */
    readonly caption?: string;
    /** Optional caller-supplied identifier for tracing. */
    readonly traceId?: string;
}

export interface VisionResult {
    readonly category: FigureCategory;
    /** Provider-extracted structured fields (shape depends on category). */
    readonly extracted: Readonly<Record<string, unknown>>;
    /** Confidence in [0,1]. */
    readonly confidence: number;
    /** Provider id ('gemma4' | 'doclayout-yolo' | ...). */
    readonly provider: string;
    /** Wall-clock ms spent on the request. */
    readonly elapsedMs: number;
}

export interface ValidationResult {
    readonly valid: boolean;
    readonly errors: ReadonlyArray<string>;
}

/** Maximum dimensions accepted (defensive — providers usually cap at this). */
const MAX_DIMENSION = 8192;
/** Minimum reasonable dimensions (smaller → likely not a real figure). */
const MIN_DIMENSION = 32;
/** Minimum image bytes (avoid sending empty / corrupted samples). */
const MIN_BYTES = 64;
/** Maximum payload (8 MB — keeps within most provider limits). */
const MAX_BYTES = 8 * 1024 * 1024;

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

const ALLOWED_CATEGORIES = new Set([
    'perfil_sondagem',
    'cross_section',
    'pluma',
    'potenciometrico',
    'mapa_localizacao',
    'generic',
]);

function validateImageBytes(imageBytes: unknown): string | null {
    if (!(imageBytes instanceof Uint8Array)) return 'imageBytes_not_uint8array';
    if (imageBytes.byteLength < MIN_BYTES) return 'imageBytes_too_small';
    if (imageBytes.byteLength > MAX_BYTES) return 'imageBytes_too_large';
    return null;
}

function validateDimension(value: unknown, name: string): string | null {
    if (!isFiniteNumber(value) || value < MIN_DIMENSION || value > MAX_DIMENSION) {
        return `${name}_out_of_range`;
    }
    return null;
}

function validateCategory(category: unknown): string | null {
    if (typeof category !== 'string' || !ALLOWED_CATEGORIES.has(category)) {
        return 'category_invalid';
    }
    return null;
}

const PII_PATTERNS: RegExp[] = [
    /\d{3}\.\d{3}\.\d{3}-\d{2}/, // CPF
    /\d{2}\.\d{3}\.\d{3}-\d/, // RG
    /[\w.+-]+@[\w-]+\.[\w.-]+/, // email
];

function validateMetadataPii(caption: unknown, traceId: unknown): string | null {
    for (const txt of [caption, traceId]) {
        if (typeof txt === 'string') {
            for (const p of PII_PATTERNS) {
                if (p.test(txt)) return 'pii_detected_in_metadata';
            }
        }
    }
    return null;
}

/**
 * Validate a vision request before dispatch. Returns `{valid, errors[]}`.
 * Pure — never throws, never side-effects.
 */
export function validateVisionRequest(request: unknown): ValidationResult {
    const errors: string[] = [];
    if (!request || typeof request !== 'object') {
        return Object.freeze({ valid: false, errors: Object.freeze(['request_not_object']) });
    }
    const r = request as Partial<VisionRequest>;

    const checks: Array<string | null> = [
        validateImageBytes(r.imageBytes),
        validateDimension(r.width, 'width'),
        validateDimension(r.height, 'height'),
        validateCategory(r.category),
        validateMetadataPii(r.caption, r.traceId),
    ];
    for (const error of checks) {
        if (error) errors.push(error);
    }

    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

/**
 * Validate a vision response before merging into the patch. Pure.
 */
export function validateVisionResult(result: unknown): ValidationResult {
    const errors: string[] = [];
    if (!result || typeof result !== 'object') {
        return Object.freeze({ valid: false, errors: Object.freeze(['result_not_object']) });
    }
    const r = result as Partial<VisionResult>;

    if (typeof r.category !== 'string') errors.push('category_missing');
    if (!r.extracted || typeof r.extracted !== 'object') errors.push('extracted_not_object');
    if (!isFiniteNumber(r.confidence) || (r.confidence as number) < 0 || (r.confidence as number) > 1) {
        errors.push('confidence_out_of_range');
    }
    if (typeof r.provider !== 'string' || r.provider.length === 0) errors.push('provider_missing');
    if (!isFiniteNumber(r.elapsedMs) || (r.elapsedMs as number) < 0) errors.push('elapsedMs_invalid');

    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

/**
 * Rate-limit decision. Tokens-bucket style: caller maintains the bucket;
 * this function decides if the next request can fit.
 *
 *   allowed = tokensAvailable >= 1
 *   nextTokensAvailable = max(0, min(maxTokens,
 *                                    tokensAvailable - 1 + elapsedSinceRefill * refillRate))
 *
 * Pure — caller passes current state, gets next state.
 */
export interface RateLimitState {
    readonly tokensAvailable: number;
    readonly maxTokens: number;
    readonly refillPerSecond: number;
    readonly lastRefillMs: number;
}

export interface RateLimitDecision {
    readonly allowed: boolean;
    readonly nextState: RateLimitState;
    readonly waitMs: number;
}

export function decideRateLimit(
    state: RateLimitState,
    nowMs: number,
): RateLimitDecision {
    if (!state || !isFiniteNumber(nowMs)) {
        const fallback: RateLimitState = {
            tokensAvailable: 0,
            maxTokens: 1,
            refillPerSecond: 1,
            lastRefillMs: isFiniteNumber(nowMs) ? nowMs : 0,
        };
        return Object.freeze({ allowed: false, nextState: fallback, waitMs: 0 });
    }
    const elapsedSec = Math.max(0, (nowMs - state.lastRefillMs) / 1000);
    const refill = elapsedSec * state.refillPerSecond;
    const replenished = Math.min(state.maxTokens, state.tokensAvailable + refill);
    if (replenished >= 1) {
        return Object.freeze({
            allowed: true,
            nextState: Object.freeze({
                tokensAvailable: replenished - 1,
                maxTokens: state.maxTokens,
                refillPerSecond: state.refillPerSecond,
                lastRefillMs: nowMs,
            }),
            waitMs: 0,
        });
    }
    const tokensShortfall = 1 - replenished;
    const waitMs = Math.ceil((tokensShortfall / state.refillPerSecond) * 1000);
    return Object.freeze({
        allowed: false,
        nextState: Object.freeze({
            tokensAvailable: replenished,
            maxTokens: state.maxTokens,
            refillPerSecond: state.refillPerSecond,
            lastRefillMs: nowMs,
        }),
        waitMs,
    });
}
