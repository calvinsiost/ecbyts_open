// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT
// Module: Segment Validator - pure-logic validation for ECBT key segments
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   ECBT Segment Validator
   ================================================================

   Pure-logic validator for individual segments of an ECBT key
   (family code, salt, checksum, payload, etc.). Used by encoder/
   decoder/validator to enforce structural invariants.

   No I/O, no DOM, no crypto.subtle dependencies — safe for cheap
   Node tests.

   ================================================================ */

// ----------------------------------------------------------------
// SEGMENT RULES (frozen)
// ----------------------------------------------------------------

type SegmentRule = { pattern?: RegExp; minLength?: number; maxLength?: number; exactLength?: number };

/**
 * Frozen registry of validation rules per segment name.
 * Each rule may include: pattern (RegExp), minLength, maxLength,
 * exactLength.
 */
export const SEGMENT_RULES: Readonly<Record<string, Readonly<SegmentRule>>> = Object.freeze({
    family: Object.freeze({
        pattern: /^[A-Z0-9]{1,3}$/,
        minLength: 1,
        maxLength: 3,
    }),
    salt: Object.freeze({
        pattern: /^[A-Z0-9]{8}$/,
        exactLength: 8,
    }),
    check: Object.freeze({
        pattern: /^[A-F0-9]{6}$/,
        exactLength: 6,
    }),
    crc32: Object.freeze({
        pattern: /^[A-F0-9]{8}$/,
        exactLength: 8,
    }),
    keyId: Object.freeze({
        pattern: /^[A-F0-9]{16}$/,
        exactLength: 16,
    }),
    prevHash: Object.freeze({
        pattern: /^[A-F0-9]{16}$/,
        exactLength: 16,
    }),
    merkleRoot: Object.freeze({
        pattern: /^[A-F0-9]{16}$/,
        exactLength: 16,
    }),
    signature: Object.freeze({
        pattern: /^[A-F0-9]{64}$/,
        exactLength: 64,
    }),
    payload: Object.freeze({
        pattern: /^[A-Z0-9+/=]+$/,
        minLength: 1,
    }),
});

// ----------------------------------------------------------------
// CRC-32 (IEEE 802.3) - local implementation for string input
// ----------------------------------------------------------------

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    CRC_TABLE[i] = c;
}

/**
 * Standard CRC-32 of a string (UTF-8 bytes). Returns 8 hex chars uppercase.
 * Known: '' → '00000000', 'a' → 'E8B7BE43', '123456789' → 'CBF43926'.
 *
 * @param input
 * @returns
 */
export function computeCrc32(input: string): string {
    const str = String(input ?? '');
    // UTF-8 encode
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
        let cp = str.charCodeAt(i);
        if (cp < 0x80) {
            bytes.push(cp);
        } else if (cp < 0x800) {
            bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        } else if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < str.length) {
            const low = str.charCodeAt(i + 1);
            cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
            i++;
            bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else {
            bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ (bytes[i] as number)) & 0xff] as number);
    }
    return ((crc ^ 0xffffffff) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

// ----------------------------------------------------------------
// SIMPLE CHECKSUM (DJB2 → 6 hex)
// ----------------------------------------------------------------

/**
 * DJB2 hash truncated to first 6 hex chars uppercase.
 * Deterministic; suitable for ECBT Type A `check` segment.
 *
 * @param input
 * @returns
 */
export function computeSimpleChecksum(input: string): string {
    const str = String(input ?? '');
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
    return hex.slice(-6);
}

// ----------------------------------------------------------------
// SEGMENT VALIDATION
// ----------------------------------------------------------------

/**
 * Validate a single segment value against its rule.
 *
 * @param segmentName
 * @param value
 * @returns
 */
export function validateSegment(
    segmentName: string,
    value: string
): { valid: boolean; error: string | null } {
    const rule = SEGMENT_RULES[segmentName];
    if (!rule) {
        return { valid: false, error: `unknown_segment:${segmentName}` };
    }
    if (typeof value !== 'string') {
        return { valid: false, error: 'not_a_string' };
    }
    if (rule.exactLength != null && value.length !== rule.exactLength) {
        return {
            valid: false,
            error: `length_mismatch:expected=${rule.exactLength},got=${value.length}`,
        };
    }
    if (rule.minLength != null && value.length < rule.minLength) {
        return { valid: false, error: `too_short:min=${rule.minLength},got=${value.length}` };
    }
    if (rule.maxLength != null && value.length > rule.maxLength) {
        return { valid: false, error: `too_long:max=${rule.maxLength},got=${value.length}` };
    }
    if (rule.pattern && !rule.pattern.test(value)) {
        return { valid: false, error: `pattern_mismatch:${rule.pattern.source}` };
    }
    return { valid: true, error: null };
}

/**
 * Validate every known field in a parsed ECBT key.
 *
 * @param parsedKey
 * @returns
 */
export function validateAllSegments(
    parsedKey: Record<string, any> | any
): { valid: boolean; errors: Array<{ segment: string; error: string }> } {
    const errors: Array<{ segment: string; error: string }> = [];
    if (!parsedKey || typeof parsedKey !== 'object') {
        return { valid: false, errors: [{ segment: '_root', error: 'not_an_object' }] };
    }
    const obj: Record<string, any> = parsedKey;
    for (const segmentName of Object.keys(SEGMENT_RULES)) {
        if (!(segmentName in obj)) continue;
        const value = obj[segmentName];
        if (value == null) continue;
        const result = validateSegment(segmentName, value);
        if (!result.valid) {
            errors.push({ segment: segmentName, error: result.error as string });
        }
    }
    return { valid: errors.length === 0, errors };
}

// ----------------------------------------------------------------
// BOOKEND VALIDATION
// ----------------------------------------------------------------

const BOOKEND_SUFFIX = '.TBCE';

/**
 * Verify that the key ends with the canonical bookend suffix `.TBCE`
 * and that the provided segment matches the substring just before it.
 *
 * @param key - Full ECBT key string
 * @param segment - Last segment expected before suffix (e.g. '10000000A')
 * @returns
 */
export function validateCheckBookend(
    key: string,
    segment: string
): { valid: boolean; error: string | null } {
    if (typeof key !== 'string' || typeof segment !== 'string') {
        return { valid: false, error: 'invalid_input' };
    }
    if (!key.endsWith(BOOKEND_SUFFIX)) {
        return { valid: false, error: 'missing_bookend_suffix' };
    }
    const withoutSuffix = key.slice(0, -BOOKEND_SUFFIX.length);
    if (!withoutSuffix.endsWith(segment)) {
        return { valid: false, error: 'segment_not_at_bookend_position' };
    }
    return { valid: true, error: null };
}

// ----------------------------------------------------------------
// FAMILY CODE SYNTHESIS / EXTRACTION
// ----------------------------------------------------------------

/**
 * Synthesize a 1-3 character family code from a family name.
 * - Multi-word: first letter of each word, uppercase, max 3.
 * - Single word: first 3 chars uppercase (or fewer if name shorter).
 *
 * @param familyName
 * @returns
 */
export function synthesizeFamilyCode(familyName: string): string {
    if (typeof familyName !== 'string' || familyName.trim() === '') return '';
    const trimmed = familyName.trim();
    const words = trimmed.split(/[\s_-]+/).filter(Boolean);
    let code;
    if (words.length >= 2) {
        code = words
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 3);
    } else {
        code = (words[0] as string).slice(0, 3).toUpperCase();
    }
    // Strip non-alphanumeric to satisfy SEGMENT_RULES.family pattern
    code = code.replace(/[^A-Z0-9]/g, '');
    return code;
}

/**
 * Extract the family code from a full ECBT key string.
 * Format: 'ECBT.{TYPE}{VERSION}-{FAM}-...'
 *
 * @param key
 * @returns
 */
export function extractFamilyCodeFromKey(key: string): string | null {
    if (typeof key !== 'string') return null;
    const m = key.match(/^ECBT\.[A-C][0-9A-F]+-([A-Z0-9]{1,3})-/);
    return m ? (m[1] as string) : null;
}
