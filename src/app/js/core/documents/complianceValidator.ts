// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost

/* ================================================================
   DOCUMENT COMPLIANCE VALIDATOR — Pure-logic shim (P1-5)

   Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md
   Status: shim esqueleto — schemas + FSM + ABNT 6023/6024 parsers
   pure-logic, sem DOM, sem IDB, sem rede. Para Phase 2 (UI highlighter,
   provenanceStore IDB, revisionStore IDB) ver spec S4/S5/S6.

   Este módulo expõe a API mínima frozen para unblock testes downstream
   e integração com `core/validation/abntChecker.js` existente. Todas
   as funções são puras: input → output, zero side effects, zero DOM.
   ================================================================ */

// ----------------------------------------------------------------
// FROZEN ENUMS
// ----------------------------------------------------------------

/**
 * Provenance source taxonomy.
 * Frozen - adicionar novos valores requer migration de schema.
 */
export const PROVENANCE_SOURCES = Object.freeze(['human', 'ai_ecbyts', 'ai_external', 'imported', 'unknown']);

/**
 * Revision FSM states.
 * Frozen - adicionar novos estados requer revisão da matriz de transições.
 */
export const REVISION_STATES = Object.freeze(['draft', 'under_review', 'approved', 'rejected', 'deprecated']);

/**
 * FSM transitions matrix (fail-closed). `from → [to,...]`.
 * Bypass de revisão é proibido: draft nunca vai direto para approved.
 */
export const REVISION_TRANSITIONS = Object.freeze({
    draft: Object.freeze(['under_review', 'deprecated']),
    under_review: Object.freeze(['approved', 'rejected', 'draft']),
    approved: Object.freeze(['draft', 'deprecated']),
    rejected: Object.freeze(['draft', 'deprecated']),
    deprecated: Object.freeze([]),
});

/**
 * Severity levels for ComplianceIssue.
 */
export const COMPLIANCE_SEVERITIES = Object.freeze(['error', 'warning', 'info']);

// ----------------------------------------------------------------
// PROVENANCE SCHEMA - pure validators
// ----------------------------------------------------------------

type ProvenanceValidationRule = (prov: Record<string, unknown>) => string | null;

const PROVENANCE_RULES: ProvenanceValidationRule[] = [
    (prov) => (typeof prov.blockId !== 'string' || prov.blockId.length === 0 ? 'blockId must be non-empty string' : null),
    (prov) =>
        !PROVENANCE_SOURCES.includes(prov.source as string)
            ? `source must be one of: ${PROVENANCE_SOURCES.join(', ')}`
            : null,
    (prov) =>
        prov.agent !== undefined && typeof prov.agent !== 'string'
            ? 'agent must be string when provided'
            : null,
    (prov) => {
        if (prov.confidence === undefined) return null;
        const c = prov.confidence;
        return typeof c !== 'number' || c < 0 || c > 1 || Number.isNaN(c)
            ? 'confidence must be number in [0,1]'
            : null;
    },
    (prov) => {
        if (prov.generationTimestamp === undefined) return null;
        const t = Date.parse(prov.generationTimestamp as string);
        return Number.isNaN(t) ? 'generationTimestamp must be ISO 8601 parseable' : null;
    },
    (prov) => {
        if (prov.promptHash === undefined) return null;
        return typeof prov.promptHash !== 'string' || !/^[a-f0-9]+$/i.test(prov.promptHash)
            ? 'promptHash must be hex string (LGPD: never store raw prompt)'
            : null;
    },
];

/**
 * Validate a DocumentProvenance object against schema (S1).
 * @param {any} prov - Provenance candidate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateProvenance(prov: any): { valid: boolean; errors: string[] } {
    if (!prov || typeof prov !== 'object') {
        return { valid: false, errors: ['provenance must be an object'] };
    }
    const record = prov as Record<string, unknown>;
    const errors: string[] = [];
    for (const rule of PROVENANCE_RULES) {
        const msg = rule(record);
        if (msg) errors.push(msg);
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Build a default-shaped Provenance entry - useful as factory.
 * @param {any} partial - Partial fields to override defaults
 * @returns {object} Frozen provenance object with defaults filled
 */
export function buildProvenance(partial: any = {}): object {
    const base = {
        blockId: partial.blockId || '',
        source: partial.source && PROVENANCE_SOURCES.includes(partial.source) ? partial.source : 'unknown',
        agent: partial.agent || null,
        agentType: partial.agentType || null,
        modelVersion: partial.modelVersion || null,
        promptHash: partial.promptHash || null,
        generationTimestamp: partial.generationTimestamp || null,
        confidence: typeof partial.confidence === 'number' ? partial.confidence : null,
        parentBlockId: partial.parentBlockId || null,
    };
    return Object.freeze(base);
}

/**
 * Aggregate provenance entries by source - histograma {source: percentage}.
 * Soma sempre 100 (com floor); blocos sem provenance contam como 'unknown'.
 * @param {any[]} provenanceList - Array of provenance objects
 * @returns {object} { human: 0.45, ai_ecbyts: 0.30, ... }
 */
export function summarizeProvenance(provenanceList: any[]): object {
    const summary: any = Object.create(null);
    for (const src of PROVENANCE_SOURCES) summary[src] = 0;
    if (!Array.isArray(provenanceList) || provenanceList.length === 0) {
        return summary;
    }
    for (const p of provenanceList) {
        const src = p && PROVENANCE_SOURCES.includes(p.source) ? p.source : 'unknown';
        summary[src] += 1;
    }
    const total = provenanceList.length;
    for (const src of PROVENANCE_SOURCES) {
        summary[src] = total > 0 ? summary[src] / total : 0;
    }
    return summary;
}

// ----------------------------------------------------------------
// REVISION FSM
// ----------------------------------------------------------------

/**
 * Custom error for invalid FSM transitions.
 */
export class RevisionStateError extends Error {
    from: any;
    to: any;
    /**
     * @param {string} message
     * @param {{ from?: any, to?: any }} [opts]
     */
    constructor(message: string, { from, to }: { from?: any; to?: any } = {}) {
        super(message);
        this.name = 'RevisionStateError';
        this.from = from;
        this.to = to;
    }
}

/**
 * Return the list of valid next states from a given state.
 * @param {string} currentState - Current FSM state
 * @returns {string[]} Frozen array of valid next states (or [] if state unknown)
 */
export function getValidTransitions(currentState: string): string[] {
    return (REVISION_TRANSITIONS as any)[currentState] || Object.freeze([]);
}

/**
 * Check whether a transition is valid without throwing.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canTransition(from: string, to: string): boolean {
    const next = (REVISION_TRANSITIONS as any)[from];
    return Array.isArray(next) && next.includes(to);
}

/**
 * Validate a section/block transition between revision states.
 * Throws RevisionStateError on invalid transitions (fail-closed).
 *
 * @param {any} section - Section/block with `revisionStatus` field
 * @param {string} nextState - Target state
 * @returns {string[]} Valid next states from the *target* state (i.e. what's allowed AFTER the transition)
 * @throws {RevisionStateError} on invalid transition
 */
export function validateSection(section: any, nextState: string): string[] {
    if (!section || typeof section !== 'object') {
        throw new RevisionStateError('section must be an object', { from: null, to: nextState });
    }
    const from = section.revisionStatus || 'draft';
    if (!REVISION_STATES.includes(from)) {
        throw new RevisionStateError(`unknown source state: ${from}`, { from, to: nextState });
    }
    if (!REVISION_STATES.includes(nextState)) {
        throw new RevisionStateError(`unknown target state: ${nextState}`, { from, to: nextState });
    }
    if (!canTransition(from, nextState)) {
        throw new RevisionStateError(`invalid transition: ${from} -> ${nextState}`, { from, to: nextState });
    }
    return getValidTransitions(nextState);
}

// ----------------------------------------------------------------
// ABNT NBR 6023 - Reference parser
// ----------------------------------------------------------------

// Author surname uppercase (e.g. "SILVA", "DA SILVA", "VAN DER WAALS")
// Allows compound surnames; firstName terminator can be `.`, `(` (year),
// or end-of-line.
const REFERENCE_AUTHOR_RE = /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]*?),\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^.(\n]*?)\s*[.(]/;

// Year between parentheses or after period
const REFERENCE_YEAR_RE = /\((\d{4})\)|\b(\d{4})\b\.?/;

/**
 * Parse a single ABNT NBR 6023 reference line.
 * Returns null if line cannot be parsed as a valid reference.
 *
 * Format expected (simplified):
 *   "SOBRENOME, Nome. Título da obra. Editora, YYYY."
 *
 * @param {string} line - Single reference text
 * @returns {{ author: string, firstName: string, year: number, title: string, raw: string } | null}
 */
export function parseAbntReference(
    line: string,
): { author: string; firstName: string; year: number; title: string; raw: string } | null {
    if (typeof line !== 'string' || line.trim().length === 0) return null;
    const trimmed = line.trim();
    const authorMatch = trimmed.match(REFERENCE_AUTHOR_RE);
    if (!authorMatch) return null;
    const author = authorMatch[1]!.trim();
    const firstName = authorMatch[2]!.trim();
    // The matched terminator (. or () belongs to the rest, not the firstName.
    // Back off by 1 so "(" or "." remains for year/title parsing downstream.
    const rest = trimmed.slice(authorMatch[0].length - 1);

    const yearMatch = rest.match(REFERENCE_YEAR_RE);
    const year = yearMatch ? parseInt((yearMatch[1] || yearMatch[2]) as string, 10) : null;
    if (year === null || year < 1800 || year > 2200) return null;

    // Title = everything between author and year (best-effort heuristic).
    const yearIdx = rest.search(REFERENCE_YEAR_RE);
    const titlePart = yearIdx > 0 ? rest.slice(0, yearIdx).trim() : rest.trim();
    const title = titlePart.replace(/[.,;]+$/, '').trim();

    return Object.freeze({
        author,
        firstName,
        year,
        title,
        raw: trimmed,
    });
}

/**
 * Detect duplicate references by canonical key (author+year+title-prefix).
 * @param {any[]} parsedRefs - Array of parsed references from parseAbntReference
 * @returns {Array<{ key: string, indexes: number[] }>} Duplicate clusters
 */
export function detectReferenceDuplicates(parsedRefs: any[]): Array<{ key: string; indexes: number[] }> {
    if (!Array.isArray(parsedRefs)) return [];
    const groups = new Map();
    parsedRefs.forEach((ref, idx) => {
        if (!ref) return;
        const key = `${ref.author.toUpperCase()}|${ref.year}|${(ref.title || '').slice(0, 32).toLowerCase()}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(idx);
    });
    const dupes = [];
    for (const [key, indexes] of groups.entries()) {
        if (indexes.length > 1) dupes.push({ key, indexes });
    }
    return dupes;
}

/**
 * Check alphabetical ordering of references.
 * @param {any[]} parsedRefs - Array of parsed references
 * @returns {Array<{ index: number, author: string, previousAuthor: string }>} Ordering violations
 */
export function detectReferenceOrderViolations(
    parsedRefs: any[],
): Array<{ index: number; author: string; previousAuthor: string }> {
    if (!Array.isArray(parsedRefs) || parsedRefs.length < 2) return [];
    const violations = [];
    for (let i = 1; i < parsedRefs.length; i++) {
        const prev = parsedRefs[i - 1];
        const curr = parsedRefs[i];
        if (!prev || !curr) continue;
        if (curr.author.localeCompare(prev.author, 'pt-BR') < 0) {
            violations.push({
                index: i,
                author: curr.author,
                previousAuthor: prev.author,
            });
        }
    }
    return violations;
}

// ----------------------------------------------------------------
// ABNT NBR 6024 - Section numbering
// ----------------------------------------------------------------

const SECTION_NUMBER_RE = /^\s*(\d+(?:\.\d+)*)\s+/;

/**
 * Parse hierarchical section numbers from an array of section titles.
 * @param {string[]} sectionTitles - Array of section heading strings
 * @returns {Array<{ raw: string, parts: number[], depth: number }>} Parsed section entries
 */
export function parseSectionNumbers(
    sectionTitles: string[],
): Array<{ raw: string; parts: number[]; depth: number }> {
    if (!Array.isArray(sectionTitles)) return [];
    const out = [];
    for (const title of sectionTitles) {
        if (typeof title !== 'string') continue;
        const m = title.match(SECTION_NUMBER_RE);
        if (!m) continue;
        const parts = m[1]!.split('.').map((n) => parseInt(n, 10));
        if (parts.some((n) => Number.isNaN(n))) continue;
        out.push(Object.freeze({ raw: m[1]!, parts, depth: parts.length }));
    }
    return out;
}

/**
 * Detect ABNT NBR 6024 violations:
 * - R2.1 Sequence gaps (1.1.1 -> 1.1.3 skipping 1.1.2)
 * - R2.2 Excessive depth (>5 levels)
 *
 * @param {string[]} sectionTitles - Array of section heading strings
 * @returns {{ gaps: any[], depthViolations: any[] }}
 */
export function checkSectionNumbering(sectionTitles: string[]): { gaps: any[]; depthViolations: any[] } {
    const parsed = parseSectionNumbers(sectionTitles);
    const gaps = [];
    const depthViolations = [];

    for (let i = 0; i < parsed.length; i++) {
        const curr = parsed[i]!;

        // R2.2 - depth check (max 5 levels per ABNT 6024)
        if (curr.depth > 5) {
            depthViolations.push({ raw: curr.raw, depth: curr.depth, max: 5 });
        }

        // R2.1 - sequence check vs previous sibling at same depth
        if (i === 0) continue;
        const prev = parsed[i - 1]!;
        // Same parent, same depth -> last part should be prev.last + 1
        if (curr.depth === prev.depth) {
            const sameParent = curr.parts.slice(0, -1).every((p, idx) => p === prev.parts[idx]);
            if (sameParent) {
                const expected = prev.parts[prev.parts.length - 1]! + 1;
                const actual = curr.parts[curr.parts.length - 1];
                if (actual !== expected) {
                    gaps.push({
                        raw: curr.raw,
                        previous: prev.raw,
                        expected: [...prev.parts.slice(0, -1), expected].join('.'),
                    });
                }
            }
        }
        // Going deeper - first child must be 1
        if (curr.depth > prev.depth) {
            const startsWithParent = prev.parts.every((p, idx) => p === curr.parts[idx]);
            if (startsWithParent && curr.parts[curr.depth - 1] !== 1) {
                gaps.push({
                    raw: curr.raw,
                    previous: prev.raw,
                    expected: [...prev.parts, 1].join('.'),
                });
            }
        }
    }
    return { gaps, depthViolations };
}

// ----------------------------------------------------------------
// COMPLIANCE CHECK - Top-level orchestrator
// ----------------------------------------------------------------

/**
 * Build a single ComplianceIssue object.
 * @param {{severity:any, ruleId:any, ruleName:any, message:any, location:any, suggestion?:any}} opts
 */
function buildIssue({
    severity,
    ruleId,
    ruleName,
    message,
    location,
    suggestion = null,
}: {
    severity: any;
    ruleId: any;
    ruleName: any;
    message: any;
    location: any;
    suggestion?: any;
}) {
    return Object.freeze({
        severity,
        ruleId,
        ruleName,
        message,
        location: Object.freeze(location || {}),
        suggestion,
        autoFixable: false,
    });
}

function invalidInputResult() {
    return Object.freeze({
        status: 'fail',
        summary: Object.freeze({ errors: 1, warnings: 0, passes: 0 }),
        violations: Object.freeze([
            buildIssue({
                severity: 'error',
                ruleId: 'INPUT',
                ruleName: 'Invalid input',
                message: 'document descriptor is required',
                location: {},
            }),
        ]),
    });
}

function buildReferenceIssues(parsed: (ReturnType<typeof parseAbntReference>)[]): any[] {
    const issues: any[] = [];
    parsed.forEach((p, i) => {
        if (p) return;
        issues.push(
            buildIssue({
                severity: 'error',
                ruleId: 'R1.1',
                ruleName: 'ABNT NBR 6023 — Author format',
                message: `Reference at index ${i} not parseable (expected "SOBRENOME, Nome. ... YYYY.")`,
                location: { referenceIndex: i },
                suggestion: 'Verifique formato: SOBRENOME, Nome. Título. Editora, YYYY.',
            }),
        );
    });
    const validParsed = parsed.filter(Boolean) as NonNullable<ReturnType<typeof parseAbntReference>>[];
    const dupes = detectReferenceDuplicates(validParsed);
    for (const dup of dupes) {
        issues.push(
            buildIssue({
                severity: 'warning',
                ruleId: 'R1.5',
                ruleName: 'ABNT NBR 6023 — Duplicate references',
                message: `Duplicate reference cluster: ${dup.indexes.join(', ')}`,
                location: { referenceIndexes: dup.indexes },
            }),
        );
    }
    const orderIssues = detectReferenceOrderViolations(validParsed);
    for (const o of orderIssues) {
        issues.push(
            buildIssue({
                severity: 'error',
                ruleId: 'R1.4',
                ruleName: 'ABNT NBR 6023 — Alphabetical order',
                message: `"${o.author}" appears after "${o.previousAuthor}" — out of alphabetical order`,
                location: { referenceIndex: o.index },
            }),
        );
    }
    return issues;
}

function buildSectionNumberingIssues(sectionTitles: string[]): any[] {
    const issues: any[] = [];
    const { gaps, depthViolations } = checkSectionNumbering(sectionTitles);
    for (const g of gaps) {
        issues.push(
            buildIssue({
                severity: 'error',
                ruleId: 'R2.1',
                ruleName: 'ABNT NBR 6024 — Sequence gap',
                message: `Section "${g.raw}" follows "${g.previous}" — expected "${g.expected}"`,
                location: { section: g.raw },
                suggestion: `Renumber to ${g.expected} or add missing intermediate sections`,
            }),
        );
    }
    for (const d of depthViolations) {
        issues.push(
            buildIssue({
                severity: 'warning',
                ruleId: 'R2.2',
                ruleName: 'ABNT NBR 6024 — Depth limit',
                message: `Section "${d.raw}" has depth ${d.depth} (max ${d.max})`,
                location: { section: d.raw },
            }),
        );
    }
    return issues;
}

function buildRequiredSectionIssues(requiredSections: unknown[], sectionTitles: string[]): any[] {
    const issues: any[] = [];
    const titlesText = sectionTitles.join('\n').toLowerCase();
    for (const required of requiredSections) {
        if (typeof required !== 'string') continue;
        if (!titlesText.includes(required.toLowerCase())) {
            issues.push(
                buildIssue({
                    severity: 'error',
                    ruleId: 'R3.1',
                    ruleName: 'Template — Required section missing',
                    message: `Required section "${required}" not found in document`,
                    location: { requiredSection: required },
                }),
            );
        }
    }
    return issues;
}

function buildMergeFieldIssues(sectionTitles: unknown[]): any[] {
    const issues: any[] = [];
    const mergePattern = /\[\[([A-Z_][A-Z0-9_]*)\]\]/g;
    sectionTitles.forEach((title, idx) => {
        const matches = String(title).match(mergePattern);
        if (!matches) return;
        for (const m of matches) {
            issues.push(
                buildIssue({
                    severity: 'warning',
                    ruleId: 'R3.3',
                    ruleName: 'Template — Unfilled merge field',
                    message: `Merge field ${m} not replaced`,
                    location: { sectionIndex: idx, field: m },
                }),
            );
        }
    });
    return issues;
}

function finalizeCheck(violations: any[]): any {
    const errors = violations.filter((v) => v.severity === 'error').length;
    const warnings = violations.filter((v) => v.severity === 'warning').length;
    const passes = violations.length === 0 ? 1 : 0;
    const status = errors > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass';

    return Object.freeze({
        status,
        summary: Object.freeze({ errors, warnings, passes }),
        violations: Object.freeze(violations),
    });
}

/**
 * Run a full compliance check on a document descriptor (pure-logic).
 * The descriptor is engine-agnostic - não depende de DOM ou editor específico.
 *
 * @param {any} doc - Document descriptor: { sectionTitles?, references?, provenance?, sections?, requiredSections? }
 * @returns {any}
 */
export function createComplianceCheck(doc: any): any {
    if (!doc || typeof doc !== 'object') {
        return invalidInputResult();
    }

    const violations: any[] = [];

    // R1 - ABNT NBR 6023 Reference rules
    if (Array.isArray(doc.references) && doc.references.length > 0) {
        const parsed = doc.references.map((line: any) => parseAbntReference(line));
        violations.push(...buildReferenceIssues(parsed));
    }

    // R2 - ABNT NBR 6024 Numbering rules
    if (Array.isArray(doc.sectionTitles) && doc.sectionTitles.length > 0) {
        violations.push(...buildSectionNumberingIssues(doc.sectionTitles));
    }

    // R3.1 - Required sections present
    if (Array.isArray(doc.requiredSections) && Array.isArray(doc.sectionTitles)) {
        violations.push(...buildRequiredSectionIssues(doc.requiredSections, doc.sectionTitles));
    }

    // R3.3 - Unfilled merge fields (e.g. [[CLIENTE]])
    if (Array.isArray(doc.sectionTitles)) {
        violations.push(...buildMergeFieldIssues(doc.sectionTitles));
    }

    return finalizeCheck(violations);
}
