// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Format Versioning — pure-logic prefix detection, validation,
 * and metadata extraction.
 *
 * ECBT keys carry a hex-versioned prefix: `ECBT.<TYPE><7-hex-version>-...`.
 * Three types: A (simple, 6 segments), B (blockchain, 10 segments),
 * C (compressed, 6 segments). Bookend suffix `.TBCE` (with the type
 * letter at the end of the last segment).
 *
 * Pure module: no DOM, no IDB, no I/O — safe to import in Node tests.
 *
 * P1-80: Forward-compatible versioning. Append future versions to
 * `ECBT_VERSIONS` as they ship.
 */

export type EcbtType = 'A' | 'B' | 'C';

export interface EcbtPrefix {
    readonly type: EcbtType;
    readonly version: string;
}

export interface EcbtValidationResult {
    readonly valid: boolean;
    readonly type: EcbtType | null;
    readonly version: string | null;
    readonly segmentCount: number;
    readonly errors: readonly string[];
}

export interface EcbtMetadataA {
    readonly type: 'A';
    readonly version: string;
    readonly family: string;
    readonly salt: string;
    readonly check: string;
    readonly payload: string;
    readonly suffix: string;
}

export interface EcbtMetadataB {
    readonly type: 'B';
    readonly version: string;
    readonly family: string;
    readonly keyId: string;
    readonly prevHash: string;
    readonly merkleRoot: string;
    readonly signature: string;
    readonly salt: string;
    readonly check: string;
    readonly payload: string;
    readonly suffix: string;
}

export interface EcbtMetadataC {
    readonly type: 'C';
    readonly version: string;
    readonly family: string;
    readonly salt: string;
    readonly crc32: string;
    readonly payload: string;
    readonly suffix: string;
}

export type EcbtMetadata = EcbtMetadataA | EcbtMetadataB | EcbtMetadataC;

/** Frozen enumeration of ECBT format types (single-letter prefix). */
export const ECBT_TYPES: Readonly<Record<'SIMPLE' | 'BLOCKCHAIN' | 'COMPRESSED', EcbtType>> = Object.freeze({
    SIMPLE: 'A',
    BLOCKCHAIN: 'B',
    COMPRESSED: 'C',
});

/** Frozen array of supported hex versions. Append-only. */
export const ECBT_VERSIONS: readonly string[] = Object.freeze(['0000001']);

/** Canonical segment counts per type (excludes the leading `ECBT.` prefix segment). */
const SEGMENT_COUNTS: Readonly<Record<EcbtType, number>> = Object.freeze({ A: 6, B: 10, C: 6 });

/** Legacy ECO format prefixes (still accepted on import for backward compatibility). */
const LEGACY_ECO_PATTERN = /^ECO[1-4]\b/;

/** ECBT prefix regex: `ECBT.<TYPE><7-hex>` followed by `-` or end. */
const ECBT_PREFIX_PATTERN = /^ECBT\.([ABC])([0-9a-fA-F]{7})(?:-|$)/;

/**
 * Parse the leading ECBT prefix into its type and version components.
 * Returns `null` if the input is not a well-formed ECBT prefix.
 */
export function parseEcbtPrefix(key: string): EcbtPrefix | null {
    if (typeof key !== 'string' || key.length === 0) return null;
    const m = ECBT_PREFIX_PATTERN.exec(key);
    if (!m) return null;
    return { type: m[1] as EcbtType, version: (m[2] as string).toLowerCase() };
}

/**
 * Get the expected segment count for a given ECBT type. Returns `0` for
 * unknown types.
 */
export function getEcbtSegmentCount(type: string): number {
    if (typeof type !== 'string') return 0;
    return SEGMENT_COUNTS[type as EcbtType] ?? 0;
}

/**
 * Validate an ECBT key against format rules: prefix shape, segment
 * count, suffix bookend, supported version.
 */
export function validateEcbtFormat(key: string): EcbtValidationResult {
    const errors: string[] = [];
    if (typeof key !== 'string' || key.length === 0) {
        return { valid: false, type: null, version: null, segmentCount: 0, errors: ['empty_key'] };
    }
    const parsed = parseEcbtPrefix(key);
    if (!parsed) {
        errors.push('invalid_prefix');
        return { valid: false, type: null, version: null, segmentCount: 0, errors };
    }
    const { type, version } = parsed;
    const segments = key.split('-');
    const expected = getEcbtSegmentCount(type);
    if (segments.length !== expected) {
        errors.push(`segment_count_mismatch:expected=${expected},actual=${segments.length}`);
    }
    // Last segment must end with `.TBCE` and contain the type letter as bookend.
    const last = segments[segments.length - 1] || '';
    if (!last.endsWith('.TBCE')) {
        errors.push('missing_suffix_bookend');
    } else {
        // The character immediately before `.TBCE` must equal the type letter.
        const bookendChar = last.charAt(last.length - '.TBCE'.length - 1);
        if (bookendChar !== type) {
            errors.push(`bookend_type_mismatch:expected=${type},actual=${bookendChar}`);
        }
    }
    if (!ECBT_VERSIONS.includes(version)) {
        errors.push(`unsupported_version:${version}`);
    }
    return {
        valid: errors.length === 0,
        type,
        version,
        segmentCount: segments.length,
        errors,
    };
}

/**
 * Extract per-type metadata fields from an ECBT key.
 *
 * Field order:
 * - A: prefix - family - salt - check - payload - suffix
 * - B: prefix - family - keyId - prevHash - merkleRoot - signature - salt - check - payload - suffix
 * - C: prefix - family - salt - crc32 - payload - suffix
 *
 * Returns `null` if the key is malformed.
 */
export function extractEcbtMetadata(key: string): EcbtMetadata | null {
    const v = validateEcbtFormat(key);
    if (!v.type) return null;
    const segments = key.split('-');
    const expected = getEcbtSegmentCount(v.type);
    if (segments.length !== expected) return null;
    const suffix = segments[segments.length - 1] as string;
    const version = v.version as string;
    if (v.type === 'A') {
        return {
            type: 'A',
            version,
            family: segments[1] as string,
            salt: segments[2] as string,
            check: segments[3] as string,
            payload: segments[4] as string,
            suffix,
        };
    }
    if (v.type === 'C') {
        return {
            type: 'C',
            version,
            family: segments[1] as string,
            salt: segments[2] as string,
            crc32: segments[3] as string,
            payload: segments[4] as string,
            suffix,
        };
    }
    // B
    return {
        type: 'B',
        version,
        family: segments[1] as string,
        keyId: segments[2] as string,
        prevHash: segments[3] as string,
        merkleRoot: segments[4] as string,
        signature: segments[5] as string,
        salt: segments[6] as string,
        check: segments[7] as string,
        payload: segments[8] as string,
        suffix,
    };
}

/**
 * Detect whether a key is a legacy ECO1/ECO2/ECO3/ECO4 import
 * (pre-ECBT unification).
 */
export function isLegacyEcoFormat(key: string): boolean {
    if (typeof key !== 'string' || key.length === 0) return false;
    return LEGACY_ECO_PATTERN.test(key);
}

/**
 * Compare two hex-encoded ECBT versions numerically.
 *
 * @throws {Error} if either argument is not a valid hex string.
 */
export function compareEcbtVersions(a: string, b: string): -1 | 0 | 1 {
    const na = parseInt(String(a), 16);
    const nb = parseInt(String(b), 16);
    if (Number.isNaN(na) || Number.isNaN(nb)) {
        throw new Error(`invalid hex version: a=${a}, b=${b}`);
    }
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
}

/**
 * Assemble a well-formed ECBT key from its parts. The caller is
 * responsible for the suffix bookend already containing the type letter
 * (e.g. `10000000A.TBCE`).
 *
 * @param type One of `'A' | 'B' | 'C'`.
 * @param version Seven hex digits (e.g. `'0000001'`).
 * @param segments Inner segments excluding the leading `ECBT.<TYPE><VERSION>` prefix.
 */
export function formatEcbtKey(type: string, version: string, segments: readonly string[]): string {
    if (!Object.values(ECBT_TYPES).includes(type as EcbtType)) {
        throw new Error(`invalid type: ${type}`);
    }
    if (typeof version !== 'string' || !/^[0-9a-fA-F]{7}$/.test(version)) {
        throw new Error(`invalid version (must be 7 hex chars): ${version}`);
    }
    if (!Array.isArray(segments) || segments.length === 0) {
        throw new Error('segments must be a non-empty array');
    }
    const prefix = `ECBT.${type}${version.toLowerCase()}`;
    return `${prefix}-${segments.join('-')}`;
}
