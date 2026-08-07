// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.2

/**
 * ocrPostProcess.js - Domain-specific post-processing for OCR output
 * from environmental documents.
 *
 * Corrects common Tesseract misreads of units, symbols, and technical terms.
 * Well ID normalization is NOT done here - handled by wellIdCanon.js
 * in the staging pipeline (different abstraction level).
 *
 * @module core/ingestion/documents/ocrPostProcess
 */

// ---------------------------------------------------------------------------
// Correction Rules
// ---------------------------------------------------------------------------

export interface CorrectionRule {
    readonly pattern: RegExp;
    readonly replacement: string;
}

/**
 * Unit and symbol corrections.
 * Order matters: more specific patterns first.
 *
 * NOTE: pg/L (picogram/liter) is a valid unit used in dioxin/furan analysis.
 *       Only 'u' prefix is corrected to μ, NOT 'p'.
 */
const UNIT_CORRECTIONS: readonly CorrectionRule[] = [
    // μ (micro) - only 'u' misread, not 'p' (picogram is valid)
    { pattern: /\b[u]g\s*\/\s*[Ll]\b/g, replacement: 'μg/L' },
    { pattern: /\b[u]g\s*\/\s*[Kk][gq]\b/g, replacement: 'μg/kg' },
    // normalize μ character variants
    { pattern: /[µ]g\s*\/\s*[Ll]\b/g, replacement: 'μg/L' },
    { pattern: /[µ]g\s*\/\s*[Kk][gq]\b/g, replacement: 'μg/kg' },
    // mg misreads (r→m, q→g common OCR confusions)
    { pattern: /\b[rm]q\s*\/\s*[Ll]\b/g, replacement: 'mg/L' },
    { pattern: /\b[rm]q\s*\/\s*[Kk][gq]\b/g, replacement: 'mg/kg' },
    // Temperature
    { pattern: /\b(\d+)\s*['°0][Cc]\b/g, replacement: '$1 °C' },
    // Superscripts / exponents
    { pattern: /\bm[³3]\b/g, replacement: 'm³' },
    { pattern: /\bm[²2]\s*\b/g, replacement: 'm²' },
    { pattern: /\bcm[²2]\b/g, replacement: 'cm²' },
    { pattern: /\bkm[²2]\b/g, replacement: 'km²' },
    // Scientific notation
    { pattern: /\b10\s*[-–]\s*(\d)\b/g, replacement: '10⁻$1' },
    // Common Brazilian environmental abbreviations
    { pattern: /\bBTEX\b/gi, replacement: 'BTEX' },
    { pattern: /\bNAPL\b/gi, replacement: 'NAPL' },
    { pattern: /\bLNAPL\b/gi, replacement: 'LNAPL' },
    { pattern: /\bDNAPL\b/gi, replacement: 'DNAPL' },
] as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply domain-specific corrections to OCR text.
 *
 * @param {string} text - raw OCR output
 * @returns {string} - corrected text
 */
export function postProcessOCR(text: string): string {
    if (!text) return '';
    let corrected = text;
    for (const { pattern, replacement } of UNIT_CORRECTIONS) {
        pattern.lastIndex = 0; // defensive: prevent stale state on /g regex
        corrected = corrected.replace(pattern, replacement);
    }
    return corrected;
}

/**
 * Get the correction rules (for testing/debugging).
 * @returns {Array<{pattern: RegExp, replacement: string}>}
 */
export function getCorrectionRules(): CorrectionRule[] {
    return [...UNIT_CORRECTIONS];
}