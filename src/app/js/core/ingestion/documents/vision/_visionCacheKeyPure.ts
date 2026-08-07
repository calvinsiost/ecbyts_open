// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Vision cache key derivation — pure logic (RF-4 of SPEC_VISION_FALLBACK).
 *
 * Builds a deterministic, LGPD-safe cache key from an image:
 *
 *   key = "v1:" + hashHex(firstNBytes(imageBytes, 4096))
 *               + ":" + width + "x" + height
 *               + ":" + category
 *
 * Anti-requirements (SPEC §2.1 RF-4):
 *   - LGPD: image bytes are OPAQUE; we hash the prefix only and never log
 *     decoded pixels. The cache key DOES NOT contain caption, traceId or
 *     any other metadata that could carry PII.
 *   - Determinism: same input → byte-identical key.
 *   - Pure: no Web Crypto / no Node `crypto` — uses a small FNV-1a 32-bit
 *     hash so the module stays usable in any runtime.
 *
 * Tests live in `tests/vision-cache-key-pure.test.mjs`.
 */

import type { FigureCategory } from './_figureCategoryClassifierPure.js';

export interface CacheKeyInput {
    readonly imageBytes: Uint8Array;
    readonly width: number;
    readonly height: number;
    readonly category: FigureCategory;
    /** Number of leading bytes to hash. Default 4096. */
    readonly hashedBytes?: number;
}

export interface CacheTtlInput {
    /** Default TTL in days (overrides registry default 7). */
    readonly ttlDays?: number;
}

const VERSION_PREFIX = 'v1:';
const DEFAULT_HASHED_BYTES = 4096;
const DEFAULT_TTL_DAYS = 7;

/**
 * FNV-1a 32-bit hash. Deterministic, fast, no deps. Returns 8-char hex.
 */
export function fnv1a32(bytes: Uint8Array): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i] as number;
        // Multiply by FNV prime 0x01000193 using Math.imul for 32-bit overflow.
        h = Math.imul(h, 0x01000193);
    }
    return ((h >>> 0).toString(16).padStart(8, '0'));
}

/**
 * Derive the cache key. Pure, deterministic. Throws if image bytes are
 * missing or category is invalid (these are bugs, not runtime conditions).
 */
export function deriveVisionCacheKey(input: CacheKeyInput): string {
    if (!input || typeof input !== 'object') {
        throw new TypeError('deriveVisionCacheKey: input required');
    }
    if (!(input.imageBytes instanceof Uint8Array)) {
        throw new TypeError('deriveVisionCacheKey: imageBytes must be Uint8Array');
    }
    if (typeof input.category !== 'string' || input.category.length === 0) {
        throw new TypeError('deriveVisionCacheKey: category required');
    }
    const w = Number.isFinite(input.width) ? Math.trunc(input.width) : 0;
    const h = Number.isFinite(input.height) ? Math.trunc(input.height) : 0;
    const n =
        Number.isFinite(input.hashedBytes) && (input.hashedBytes as number) > 0
            ? Math.trunc(input.hashedBytes as number)
            : DEFAULT_HASHED_BYTES;
    const limit = Math.min(n, input.imageBytes.byteLength);
    const slice = input.imageBytes.subarray(0, limit);
    const hex = fnv1a32(slice);
    return `${VERSION_PREFIX}${hex}:${w}x${h}:${input.category}`;
}

/**
 * Compute the TTL expiry timestamp for a cache entry.
 *
 *   expiresAtMs = createdAtMs + ttlDays * 86400 * 1000
 *
 * Returns null when inputs are not finite (caller should treat as "no expiry").
 */
export function computeCacheExpiry(
    createdAtMs: number,
    input: CacheTtlInput | undefined,
): number | null {
    if (!Number.isFinite(createdAtMs) || createdAtMs < 0) return null;
    const days =
        input && Number.isFinite(input.ttlDays) && (input.ttlDays as number) > 0
            ? (input.ttlDays as number)
            : DEFAULT_TTL_DAYS;
    return Math.trunc(createdAtMs + days * 86400 * 1000);
}

/**
 * Whether the cache entry is still valid at `nowMs`.
 */
export function isCacheEntryValid(
    expiresAtMs: number | null | undefined,
    nowMs: number,
): boolean {
    if (expiresAtMs === null || expiresAtMs === undefined) return true; // no expiry → valid
    if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs)) return false;
    return nowMs < expiresAtMs;
}
