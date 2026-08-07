// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Technical References Schema - ECBT
 * Schema definitions and utilities for technical/normative references.
 */

export const REFERENCE_TYPES = {
    STANDARD: 'standard',
    REGULATION: 'regulation',
    ACADEMIC: 'academic',
    GUIDELINE: 'guideline',
} as const;

export type ReferenceType = (typeof REFERENCE_TYPES)[keyof typeof REFERENCE_TYPES];

export interface TechnicalReference {
    id: string;
    type: ReferenceType;
    title: string;
    code: string;
    doi: string | null;
    url: string | null;
    moduleTags: string[];
}

export interface CreateReferenceParams {
    id?: string;
    type?: unknown;
    title?: unknown;
    code?: unknown;
    doi?: unknown;
    url?: unknown;
    moduleTags?: string[];
}

function isReferenceType(type: unknown): type is ReferenceType {
    return (Object.values(REFERENCE_TYPES) as readonly unknown[]).includes(type);
}

function stringifyValue(value: unknown): string {
    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint' ||
        typeof value === 'symbol'
    ) {
        return String(value);
    }
    return Object.prototype.toString.call(value);
}

export function createReference({
    id,
    type,
    title,
    code,
    doi,
    url,
    moduleTags = [],
}: CreateReferenceParams): TechnicalReference {
    if (!isReferenceType(type)) {
        throw new Error('Invalid reference type: ' + String(type));
    }
    if (!title || !code) {
        throw new Error('Reference requires title and code');
    }

    return {
        id: id ?? crypto.randomUUID(),
        type,
        title: stringifyValue(title),
        code: stringifyValue(code),
        doi: doi ? stringifyValue(doi) : null,
        url: url ? stringifyValue(url) : null,
        moduleTags: [...moduleTags],
    };
}

export function filterByType(references: TechnicalReference[], type: unknown): TechnicalReference[] {
    return references.filter((reference) => reference.type === type);
}

export function filterByModule(references: TechnicalReference[], moduleTag: string): TechnicalReference[] {
    return references.filter((reference) => reference.moduleTags.includes(moduleTag));
}

export function searchReferences(references: TechnicalReference[], query: unknown): TechnicalReference[] {
    if (!query) return references;
    const q = stringifyValue(query).toLowerCase();
    return references.filter(
        (reference) =>
            reference.title.toLowerCase().includes(q) ||
            reference.code.toLowerCase().includes(q) ||
            reference.moduleTags.some((tag) => tag.toLowerCase().includes(q)),
    );
}
