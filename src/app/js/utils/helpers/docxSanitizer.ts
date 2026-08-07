// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export interface DocxSanitizeResult {
    text: string;
    removedInvalidChars: number;
    hadInvalidChars: boolean;
}

export interface DocxSanitizeListResult {
    values: string[];
    removedInvalidChars: number;
    hadInvalidChars: boolean;
}

export interface DocxSanitizeDataResult {
    value: unknown;
    removedInvalidChars: number;
    hadInvalidChars: boolean;
}

function stringifyXmlText(input: unknown): string {
    if (input == null) return '';
    if (
        typeof input === 'string' ||
        typeof input === 'number' ||
        typeof input === 'boolean' ||
        typeof input === 'bigint' ||
        typeof input === 'symbol'
    ) {
        return String(input);
    }
    return Object.prototype.toString.call(input);
}

function isValidXml10CodePoint(codePoint: number): boolean {
    return (
        codePoint === 0x9 ||
        codePoint === 0xa ||
        codePoint === 0xd ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff)
    );
}

export function sanitizeDocxXmlText(input: unknown): DocxSanitizeResult {
    const source = stringifyXmlText(input);
    let removedInvalidChars = 0;
    let result = '';

    for (const ch of source) {
        const codePoint = ch.codePointAt(0);
        if (codePoint != null && isValidXml10CodePoint(codePoint)) {
            result += ch;
        } else {
            removedInvalidChars++;
        }
    }

    return {
        text: result,
        removedInvalidChars,
        hadInvalidChars: removedInvalidChars > 0,
    };
}

export function sanitizeDocxXmlTextList(inputs: unknown): DocxSanitizeListResult {
    const safeInputs = Array.isArray(inputs) ? inputs : [];
    const values: string[] = [];
    let removedInvalidChars = 0;

    for (const item of safeInputs) {
        const sanitized = sanitizeDocxXmlText(item);
        values.push(sanitized.text);
        removedInvalidChars += sanitized.removedInvalidChars;
    }

    return {
        values,
        removedInvalidChars,
        hadInvalidChars: removedInvalidChars > 0,
    };
}

export function sanitizeDocxXmlData(input: unknown): DocxSanitizeDataResult {
    const seen = new WeakMap<object, unknown>();
    let removedInvalidChars = 0;

    function visit(node: unknown): unknown {
        if (node == null) return node;

        if (typeof node === 'string') {
            const sanitized = sanitizeDocxXmlText(node);
            removedInvalidChars += sanitized.removedInvalidChars;
            return sanitized.text;
        }

        if (Array.isArray(node)) {
            if (seen.has(node)) return seen.get(node);
            const clone: unknown[] = [];
            seen.set(node, clone);
            for (const item of node) clone.push(visit(item));
            return clone;
        }

        if (typeof node === 'object') {
            if (seen.has(node)) return seen.get(node);
            const clone: Record<string, unknown> = {};
            seen.set(node, clone);
            for (const [key, value] of Object.entries(node)) {
                clone[key] = visit(value);
            }
            return clone;
        }

        return node;
    }

    const value = visit(input);
    return {
        value,
        removedInvalidChars,
        hadInvalidChars: removedInvalidChars > 0,
    };
}
