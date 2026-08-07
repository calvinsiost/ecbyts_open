// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   SHANNON ENTROPY (utils/helpers — cross-spec pure-logic)
   ================================================================

   Calculador Shannon entropy + detector de strings de alta entropia.
   Complementa _envSecretsAuditorPure preenchendo o kind
   'generic_high_entropy' — detecta custom tokens, randomness markers,
   compressed/encrypted blobs sem regex pattern.

   Formula classic Shannon (1948):
     H(X) = -Σ p(xi) * log2(p(xi))
     em bits per character.

   Faixas canônicas (gitleaks/trufflehog baseline):
     - low      < 2.5 bits/char  (texto comum, palavras)
     - medium   2.5-3.5          (código, mixed text)
     - high     3.5-4.5          (URLs, base64, slugs)
     - very_high > 4.5           (random, encrypted, hashed)

   Threshold canônico SECRET_THRESHOLD_BITS = 4.0
   (sintetiza Calvin Newhouse gitleaks-best-practice).

   Cross-spec consumers:
     - utils/helpers/_envSecretsAuditorPure (kind generic_high_entropy)
     - perimeter-scan.mjs P-5 (custom tokens)
     - pre-commit hook (entropy gate)
     - core/llm/* (prompt anomaly detection)
     - utils/storage/* (compressed payload detection)

   Pure-logic: caller injeta string. Sem I/O. Determinístico.
   ================================================================ */

export const MIN_LENGTH_TO_SCAN = 20;
export const SECRET_THRESHOLD_BITS = 4.0;
export const MAX_INPUT_LENGTH = 100_000;
export const LOG2_TABLE_SIZE = 256;

export type EntropyLevel = 'low' | 'medium' | 'high' | 'very_high';

export interface EntropyClassification {
    readonly entropy: number;
    readonly length: number;
    readonly distinctChars: number;
    readonly level: EntropyLevel;
    readonly isLikelySecret: boolean;
}

export interface DetectedHighEntropy {
    readonly index: number;
    readonly length: number;
    readonly entropy: number;
    readonly snippet: string;
}

export interface DetectionOptions {
    readonly minLength?: number;
    readonly thresholdBits?: number;
    readonly maxResults?: number;
}

function clampThreshold(value: unknown): number {
    if (typeof value !== 'number' || !isFinite(value)) return SECRET_THRESHOLD_BITS;
    if (value < 0) return 0;
    if (value > 8) return 8;
    return value;
}

function clampMinLength(value: unknown): number {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return MIN_LENGTH_TO_SCAN;
    if (value > MAX_INPUT_LENGTH) return MAX_INPUT_LENGTH;
    return Math.floor(value);
}

function clampMaxResults(value: unknown): number {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return 100;
    if (value > 10_000) return 10_000;
    return Math.floor(value);
}

export function computeShannonEntropy(input: unknown): number {
    if (typeof input !== 'string' || input.length === 0) return 0;
    if (input.length > MAX_INPUT_LENGTH) return 0;
    const freq = new Map<string, number>();
    for (let i = 0; i < input.length; i++) {
        const ch = input[i]!;
        freq.set(ch, (freq.get(ch) ?? 0) + 1);
    }
    const len = input.length;
    let entropy = 0;
    freq.forEach(count => {
        const p = count / len;
        entropy -= p * Math.log2(p);
    });
    return entropy;
}

export function computeMaxEntropy(alphabetSize: number): number {
    if (typeof alphabetSize !== 'number' || !isFinite(alphabetSize) || alphabetSize < 2) return 0;
    return Math.log2(alphabetSize);
}

function levelFromEntropy(entropy: number): EntropyLevel {
    if (entropy < 2.5) return 'low';
    if (entropy < 3.5) return 'medium';
    if (entropy < 4.5) return 'high';
    return 'very_high';
}

export function classifyEntropy(input: unknown, thresholdBits?: number): EntropyClassification {
    if (typeof input !== 'string' || input.length === 0) {
        return Object.freeze({
            entropy: 0,
            length: 0,
            distinctChars: 0,
            level: 'low' as EntropyLevel,
            isLikelySecret: false,
        });
    }
    const entropy = computeShannonEntropy(input);
    const threshold = clampThreshold(thresholdBits);
    const distinctChars = new Set(Array.from(input)).size;
    const level = levelFromEntropy(entropy);
    const isLikelySecret = entropy >= threshold && input.length >= MIN_LENGTH_TO_SCAN;
    return Object.freeze({
        entropy,
        length: input.length,
        distinctChars,
        level,
        isLikelySecret,
    });
}

function isCandidateChar(c: string): boolean {
    const code = c.charCodeAt(0);
    if (code >= 48 && code <= 57) return true;
    if (code >= 65 && code <= 90) return true;
    if (code >= 97 && code <= 122) return true;
    return code === 45 || code === 43 || code === 47 || code === 95 || code === 61;
}

function makeSnippet(s: string): string {
    if (s.length <= 12) return `${s.slice(0, 4)}…`;
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export function detectHighEntropyStrings(
    text: unknown,
    options?: DetectionOptions
): readonly DetectedHighEntropy[] {
    if (typeof text !== 'string' || text.length === 0) return Object.freeze([]);
    const minLength = clampMinLength(options?.minLength);
    const threshold = clampThreshold(options?.thresholdBits);
    const maxResults = clampMaxResults(options?.maxResults);
    const results: DetectedHighEntropy[] = [];
    let i = 0;
    while (i < text.length && results.length < maxResults) {
        if (!isCandidateChar(text[i]!)) {
            i++;
            continue;
        }
        let j = i;
        while (j < text.length && isCandidateChar(text[j]!)) j++;
        const segment = text.slice(i, j);
        if (segment.length >= minLength) {
            const entropy = computeShannonEntropy(segment);
            if (entropy >= threshold) {
                results.push(Object.freeze({
                    index: i,
                    length: segment.length,
                    entropy,
                    snippet: makeSnippet(segment),
                }));
            }
        }
        i = j + 1;
    }
    return Object.freeze(results);
}

export function compareToBaseline(observed: number, baseline: number, tolerance: number = 0.5): {
    readonly delta: number;
    readonly aboveBaseline: boolean;
    readonly significantlyAbove: boolean;
} {
    const safeObserved = typeof observed === 'number' && isFinite(observed) ? observed : 0;
    const safeBaseline = typeof baseline === 'number' && isFinite(baseline) ? baseline : 0;
    const safeTolerance = typeof tolerance === 'number' && isFinite(tolerance) && tolerance >= 0
        ? tolerance
        : 0.5;
    const delta = safeObserved - safeBaseline;
    return Object.freeze({
        delta,
        aboveBaseline: delta > 0,
        significantlyAbove: delta > safeTolerance,
    });
}

export function computeNormalizedEntropy(input: unknown): number {
    if (typeof input !== 'string' || input.length === 0) return 0;
    const entropy = computeShannonEntropy(input);
    const distinctChars = new Set(Array.from(input)).size;
    const max = computeMaxEntropy(distinctChars);
    if (max <= 0) return 0;
    return Math.min(1, entropy / max);
}
