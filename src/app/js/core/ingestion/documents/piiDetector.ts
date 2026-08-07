// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.2

/**
 * piiDetector.js - PII detection and redaction for LGPD compliance.
 *
 * Environmental reports contain personal data (RT names, CPF, CREA numbers).
 * This module detects PII in OCR/extracted text and provides redacted versions.
 *
 * CRITICAL: The `findings` array deliberately does NOT store the raw match.
 * Only `masked` + `matchLength` + `charOffset` are stored. This prevents
 * accidental PII leaks via debug logging, error reporting, or state serialization.
 *
 * @module core/ingestion/documents/piiDetector
 */

// ---------------------------------------------------------------------------
// PII Rules
// ---------------------------------------------------------------------------

export interface PIIRule {
    type: PIIType;
    re: RegExp;
    mask: (m: RegExpExecArray) => string;
    validate: (m: RegExpExecArray) => boolean;
}

export type PIIType = 'cpf' | 'crea' | 'phone' | 'email' | 'person_name';

const PII_RULES: PIIRule[] = [
    {
        type: 'cpf',
        re: /\b(\d{3})\.?(\d{3})\.?(\d{3})[-.]?(\d{2})\b/g,
        mask: (m) => `${m[1]}.***.***-**`,
        validate: (m) => {
            const digits = `${m[1] || ''}${m[2] || ''}${m[3] || ''}${m[4] || ''}`;
            if (digits.length !== 11) return false;
            // Reject all-same-digit CPFs (e.g., 111.111.111-11)
            if (/^(\d)\1{10}$/.test(digits)) return false;
            // Check digit 1
            let sum = 0;
            for (let i = 0; i < 9; i++) sum += parseInt(digits[i] || '0', 10) * (10 - i);
            let d1 = 11 - (sum % 11);
            if (d1 >= 10) d1 = 0;
            if (parseInt(digits[9] || '0', 10) !== d1) return false;
            // Check digit 2
            sum = 0;
            for (let i = 0; i < 10; i++) sum += parseInt(digits[i] || '0', 10) * (11 - i);
            let d2 = 11 - (sum % 11);
            if (d2 >= 10) d2 = 0;
            return parseInt(digits[10] || '0', 10) === d2;
        },
    },
    {
        type: 'crea',
        re: /\bCREA\s*[-/:]?\s*([A-Z]{2})\s*[-:]?\s*(\d{4,10})\b/gi,
        mask: () => 'CREA-**-****',
        validate: () => true,
    },
    {
        type: 'phone',
        re: /\(\d{2}\)\s*\d{4,5}[-.]?\d{4}/g,
        mask: () => '(**) *****-****',
        validate: () => true,
    },
    {
        type: 'email',
        re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        mask: (m) => {
            const parts = m[0].split('@');
            const domainParts = (parts[1] || '').split('.');
            const domainName = domainParts[0] || '';
            const tld = domainParts.slice(1);
            const maskedDomain = (domainName[0] || '') + '***.' + tld.join('.');
            return `${(parts[0] || '')[0] || ''}***@${maskedDomain}`;
        },
        validate: () => true,
    },
    {
        type: 'person_name',
        // Contextual: only after known role keywords
        re: /(?:respons[áa]vel\s*t[eé]cnico|engenheiro|ge[oó]logo|elaborado\s*por)\s*:?\s*([A-ZÁÀÂÃÉÈÊÍÓÔÕÚÇ][a-záàâãéèêíóôõúç]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÓÔÕÚÇ][a-záàâãéèêíóôõúç]+){1,5})/gi,
        mask: (m) => {
            const parts = (m[1] || '').trim().split(/\s+/);
            if (parts.length <= 1) return '***';
            return `${parts[0]} ${'*** '.repeat(parts.length - 1).trim()}`;
        },
        validate: (m) => {
            const name = (m[1] || '').trim();
            // Must be at least 2 words, and name part >= 10 chars total
            return name.split(/\s+/).length >= 2 && name.length >= 10;
        },
    },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PIIFinding {
    type: PIIType;
    masked: string;
    charOffset: number;
    matchLength: number;
}

export interface PIIDetection {
    detected: boolean;
    types: PIIType[];
    findings: PIIFinding[];
}

/**
 * Detect PII in text.
 *
 * @param {string} text - OCR or rawText
 * @returns {PIIDetection}
 */
export function detectPII(text: string): PIIDetection {
    if (!text) return { detected: false, types: [], findings: [] };

    const findings: PIIFinding[] = [];
    const types = new Set<PIIType>();

    for (const rule of PII_RULES) {
        rule.re.lastIndex = 0; // MANDATORY: prevent stale state on repeated calls
        let match: RegExpExecArray | null;
        while ((match = rule.re.exec(text)) !== null) {
            if (rule.validate && !rule.validate(match)) continue;
            types.add(rule.type);
            findings.push({
                type: rule.type,
                masked: rule.mask(match),
                charOffset: match.index,
                matchLength: match[0].length,
                // NOTE: raw match deliberately NOT stored (LGPD compliance)
            });
        }
    }

    return {
        detected: findings.length > 0,
        types: Array.from(types),
        findings,
    };
}

/**
 * Redact PII from text, replacing matches with masked versions.
 * Processes findings from end to start to preserve character offsets.
 *
 * @param {string} text - original text
 * @param {PIIDetection} detection - from detectPII()
 * @returns {string} - redacted text
 */
export function redactPII(text: string, detection: PIIDetection): string {
    if (!detection.detected || !text) return text;

    let result = text;
    // Sort by offset descending to preserve positions during replacement
    const sorted = [...detection.findings].sort((a, b) => b.charOffset - a.charOffset);

    for (const f of sorted) {
        result = result.slice(0, f.charOffset) + f.masked + result.slice(f.charOffset + f.matchLength);
    }
    return result;
}