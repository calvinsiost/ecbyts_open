// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.2

/**
 * wellIdCanon.js - Canonical well ID normalization and matching.
 *
 * Used for MATCHING (not display). Display preserves the user's original form.
 * Pipeline: OCR text → canonicalize → match against workspace → use workspace name.
 *
 * @module core/ingestion/documents/wellIdCanon
 */

import { WELL_PREFIXES } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANON_RE = new RegExp(`^(${WELL_PREFIXES})\\s*[-._ ]*\\s*(\\d{1,4}[A-Z]?)$`, 'i');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Canonicalize a well ID for matching purposes.
 *
 * Rules:
 * 1. Uppercase prefix
 * 2. Strip all whitespace/dots/underscores between prefix and number
 * 3. Insert single hyphen between prefix and number
 * 4. Preserve suffix letter (A, B, etc.)
 *
 * @example canonicalizeWellId("PM 01")   → "PM-01"
 * @example canonicalizeWellId("pm-01")   → "PM-01"
 * @example canonicalizeWellId("PM.01")   → "PM-01"
 * @example canonicalizeWellId("PM01A")   → "PM-01A"
 * @example canonicalizeWellId("PMA-003") → "PMA-003"
 * @example canonicalizeWellId("Rio")     → null
 *
 * @param raw - raw well ID from any source
 * @returns canonical form, or null if not a well ID
 */
export function canonicalizeWellId(raw: string): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (trimmed.length < 3 || trimmed.length > 20) return null;

    const m = trimmed.match(CANON_RE);
    if (!m) return null;

    return `${m[1]!.toUpperCase()}-${m[2]!.toUpperCase()}`;
}

/**
 * Match a well ID against a list of existing element names.
 * Returns the EXISTING element name if canonical forms match,
 * preserving the existing name (not imposing normalization).
 *
 * @param newWellId - well ID from document ingestion
 * @param existingNames - element names in workspace
 * @returns matching existing name, or null
 */
export function matchExistingWell(newWellId: string, existingNames: string[]): string | null {
    const newCanon = canonicalizeWellId(newWellId);
    if (!newCanon) return null;

    for (const name of existingNames) {
        const existCanon = canonicalizeWellId(name);
        if (existCanon === newCanon) return name; // return EXISTING form
    }
    return null;
}

/**
 * Extract all well IDs from a text string.
 * Returns deduplicated array of canonical well IDs.
 */
export function extractWellIds(text: string): string[] {
    if (!text) return [];
    const re = new RegExp(`\\b(${WELL_PREFIXES})\\s*[-.]?\\s*\\d{1,4}[A-Z]?\\b`, 'gi');
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const canon = canonicalizeWellId(m[0]);
        if (canon) found.add(canon);
    }
    return [...found];
}
