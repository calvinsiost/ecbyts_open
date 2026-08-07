// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * reportSchema.js - Typed report sections, validation, and auto-outline builder
 * HEALTH-MON-001 Phase 1 / P1-59
 *
 * Provides the canonical schema for environmental report documents:
 * - Section type constants
 * - Section factory with validation
 * - Schema validation (duplicates, missing required sections)
 * - Auto-outline builder from ECBT model
 * - Serialize / deserialize helpers
 * - Merge utility for overlay sections
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REPORT_SECTION_TYPES = Object.freeze({
    EXECUTIVE_SUMMARY: 'executive_summary',
    METHODOLOGY: 'methodology',
    RESULTS: 'results',
    ANALYSIS: 'analysis',
    CONCLUSIONS: 'conclusions',
    APPENDIX: 'appendix',
});

export const REPORT_FORMATS = Object.freeze({
    PDF: 'pdf',
    DOCX: 'docx',
    HTML: 'html',
});

// Internal set for O(1) membership checks
const _VALID_TYPES = new Set<string>(Object.values(REPORT_SECTION_TYPES));

// ---------------------------------------------------------------------------
// Section factory
// ---------------------------------------------------------------------------

/**
 * Creates a frozen report section object.
 *
 * @param type    - One of REPORT_SECTION_TYPES values
 * @param title   - Non-empty display title
 * @param content - Section body (may be empty string)
 * @param options
 * @returns Frozen section
 * @throws {Error} If type is invalid or title is empty
 */
export function createReportSection(
    type: string,
    title: string,
    content: string = '',
    options: { order?: number; required?: boolean; metadata?: object } = {},
): Readonly<object> {
    // Validação de tipo
    if (!_VALID_TYPES.has(type)) {
        throw new Error(
            `createReportSection: invalid type "${type}". ` + `Valid types: ${[..._VALID_TYPES].join(', ')}`,
        );
    }
    // Validação de título
    if (!title || typeof title !== 'string' || title.trim() === '') {
        throw new Error('createReportSection: title must be a non-empty string');
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return Object.freeze({
        id,
        type,
        title: title.trim(),
        content: typeof content === 'string' ? content : '',
        order: typeof options.order === 'number' ? options.order : 0,
        required: options.required === true,
        subsections: [],
        metadata: options.metadata && typeof options.metadata === 'object' ? { ...options.metadata } : {},
    });
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

/**
 * Validates an array of report sections against structural rules.
 *
 * Errors (blocking):
 *  - Duplicate section IDs
 *  - Sections with invalid type
 *
 * Warnings (non-blocking):
 *  - Missing EXECUTIVE_SUMMARY
 *  - Missing CONCLUSIONS
 *  - Sections with empty content
 *
 * @param sections
 */
export function validateReportSchema(sections: Array<any>): {
    valid: boolean;
    errors: string[];
    warnings: string[];
} {
    const errors: string[] = [];
    const warnings: any[] = [];

    if (!Array.isArray(sections)) {
        errors.push('validateReportSchema: sections must be an array');
        return { valid: false, errors, warnings };
    }

    // Duplicate ID check
    const seenIds = new Set();
    for (const sec of sections) {
        if (!sec || typeof sec !== 'object') continue;
        if (seenIds.has(sec.id)) {
            errors.push(`Duplicate section id: "${sec.id}"`);
        } else {
            seenIds.add(sec.id);
        }

        // Invalid type check
        if (!_VALID_TYPES.has(sec.type)) {
            errors.push(`Section "${sec.id}" has invalid type: "${sec.type}"`);
        }
    }

    // Missing required section types
    const presentTypes = new Set(sections.map((s) => s && s.type));
    if (!presentTypes.has(REPORT_SECTION_TYPES.EXECUTIVE_SUMMARY)) {
        warnings.push('Missing section: executive_summary');
    }
    if (!presentTypes.has(REPORT_SECTION_TYPES.CONCLUSIONS)) {
        warnings.push('Missing section: conclusions');
    }

    // Empty content warnings
    for (const sec of sections) {
        if (!sec || typeof sec !== 'object') continue;
        const content = sec.content;
        if (typeof content !== 'string' || content.trim() === '') {
            warnings.push(`Section "${sec.id}" (${sec.type}) has empty content`);
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Auto-outline builder
// ---------------------------------------------------------------------------

/**
 * Builds a skeleton outline from an ECBT model object.
 * Always generates executive_summary, analysis, conclusions.
 * Conditionally adds methodology (if campaigns present) and results (if elements present).
 *
 * @param model
 * @returns Ordered sections (frozen)
 */
export function buildOutlineFromModel(
    model: { elements?: any[]; campaigns?: any[]; scenes?: any[] } = {},
): Array<Readonly<any>> {
    const elements = Array.isArray(model.elements) ? model.elements : [];
    const campaigns = Array.isArray(model.campaigns) ? model.campaigns : [];

    const sections: Array<Readonly<any>> = [];

    sections.push(
        createReportSection(REPORT_SECTION_TYPES.EXECUTIVE_SUMMARY, 'Executive Summary', '', {
            order: sections.length,
            required: true,
        }),
    );

    if (campaigns.length > 0) {
        sections.push(
            createReportSection(REPORT_SECTION_TYPES.METHODOLOGY, 'Methodology', '', {
                order: sections.length,
                required: false,
            }),
        );
    }

    if (elements.length > 0) {
        sections.push(
            createReportSection(REPORT_SECTION_TYPES.RESULTS, 'Results', '', { order: sections.length, required: false }),
        );
    }

    sections.push(
        createReportSection(REPORT_SECTION_TYPES.ANALYSIS, 'Analysis', '', { order: sections.length, required: false }),
    );

    sections.push(
        createReportSection(REPORT_SECTION_TYPES.CONCLUSIONS, 'Conclusions', '', { order: sections.length, required: true }),
    );

    return sections;
}

// ---------------------------------------------------------------------------
// Serialize / Deserialize
// ---------------------------------------------------------------------------

/**
 * Serializes sections to a JSON string, sorted by order ascending.
 *
 * @param sections
 * @returns JSON string
 */
export function serializeReport(sections: Array<any>): string {
    if (!Array.isArray(sections)) return '[]';
    const sorted = [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return JSON.stringify(sorted);
}

/**
 * Deserializes a JSON string back to an array of sections.
 * Returns empty array on any parse error.
 *
 * @param str
 */
export function deserializeReport(str: string): Array<any> {
    try {
        const parsed = JSON.parse(str);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Merge utility
// ---------------------------------------------------------------------------

/**
 * Merges an overlay section array into a base array.
 * Overlay sections with matching ID replace base sections;
 * overlay sections with new IDs are appended.
 *
 * @param base
 * @param overlay
 * @returns New merged array (does not mutate inputs)
 */
export function mergeSectionArrays(base: Array<any>, overlay: Array<any>): Array<any> {
    if (!Array.isArray(base)) base = [];
    if (!Array.isArray(overlay)) overlay = [];

    const overlayById = new Map(overlay.map((s) => [s.id, s]));

    // Replace matching base sections
    const merged = base.map((s) => (overlayById.has(s.id) ? overlayById.get(s.id) : s));

    // Append new overlay sections not present in base
    const baseIds = new Set(base.map((s) => s.id));
    for (const s of overlay) {
        if (!baseIds.has(s.id)) merged.push(s);
    }

    return merged;
}
