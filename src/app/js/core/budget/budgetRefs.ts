// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Budget reference tables — pure logic loader (micro_activity:acad:p2:orcamento-cotado:x02).
 *
 * Validates + freezes the pluggable funder rubric catalogs in
 * `data/budget-refs/*.json`. Each table describes the budget line items
 * (rubricas) accepted by a specific research funding agency or a
 * generic fallback, so the orçamento-cotado module can validate proposed
 * budgets against the correct reference without hardcoding agency rules.
 *
 * Pure-logic invariants (mirrors `core/ods/_indicatorsPure.ts`):
 *   - NO fs/network/DOM I/O in this module — callers pass in the already
 *     parsed JSON (`unknown`); this module only validates, coerces types and
 *     freezes. The wire-in that reads `data/budget-refs/<funder>.json` off
 *     disk lives in the test harness (`tests/budget-refs.test.mjs`).
 *   - Anti-falso-verde: schema inválido é REJEITADO (lança), nunca
 *     silenciosamente coagido.
 *
 * Tests live in `tests/budget-refs.test.mjs`.
 */

export type BudgetRubricCategory = 'custeio' | 'capital' | 'bolsa' | 'reserva' | 'pessoal' | 'outro';

export interface BudgetRubric {
    readonly code: string;
    readonly category: BudgetRubricCategory;
    readonly labelPt: string;
    readonly labelEn: string;
    readonly descriptionPt: string;
    readonly maxShare: number | null;
    readonly requiresJustification: boolean;
}

export interface BudgetRefTable {
    readonly funder: string;
    readonly funderName: string;
    readonly year: number;
    readonly sourceDoc: string;
    readonly sourceUrl: string;
    readonly extractedAt: string;
    readonly currency: string;
    readonly totalRubrics: number;
    readonly rubrics: ReadonlyArray<BudgetRubric>;
}

export const FUNDER_IDS = ['funder-ref-2026', 'cnpq-2026', 'generic'] as const;
export type FunderId = (typeof FUNDER_IDS)[number];

const CATEGORIES: ReadonlyArray<BudgetRubricCategory> = ['custeio', 'capital', 'bolsa', 'reserva', 'pessoal', 'outro'];

function fail(reason: string): never {
    throw new Error(`[core/budget/budgetRefs] invalid table: ${reason}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function validateRubric(raw: unknown, index: number): BudgetRubric {
    if (!isPlainObject(raw)) fail(`rubrics[${index}] is not an object`);

    const { code, category, labelPt, labelEn, descriptionPt, maxShare, requiresJustification } = raw;

    if (typeof code !== 'string' || code.length === 0) {
        fail(`rubrics[${index}]: code must be a non-empty string`);
    }
    if (typeof category !== 'string' || !CATEGORIES.includes(category as BudgetRubricCategory)) {
        fail(`${code}: category must be one of ${CATEGORIES.join('|')}`);
    }
    if (typeof labelPt !== 'string' || labelPt.length === 0) {
        fail(`${code}: labelPt must be a non-empty string`);
    }
    if (typeof labelEn !== 'string' || labelEn.length === 0) {
        fail(`${code}: labelEn must be a non-empty string`);
    }
    if (typeof descriptionPt !== 'string' || descriptionPt.length === 0) {
        fail(`${code}: descriptionPt must be a non-empty string`);
    }
    if (maxShare !== null && (!isFiniteNumber(maxShare) || maxShare < 0 || maxShare > 1)) {
        fail(`${code}: maxShare must be null or a number in [0, 1]`);
    }
    if (typeof requiresJustification !== 'boolean') {
        fail(`${code}: requiresJustification must be a boolean`);
    }

    return Object.freeze({
        code,
        category: category as BudgetRubricCategory,
        labelPt,
        labelEn,
        descriptionPt,
        maxShare: maxShare as number | null,
        requiresJustification,
    });
}

/**
 * Validates the raw parsed JSON (as loaded from `data/budget-refs/<funder>.json`)
 * and returns a deeply frozen, typed reference table. Throws on any schema
 * violation — an invalid table NEVER loads silently-degraded
 * (anti-falso-verde: fail loud, not fail quiet).
 */
export function loadBudgetRefs(raw: unknown): BudgetRefTable {
    if (!isPlainObject(raw)) fail('root must be an object');

    const { funder, funderName, year, sourceDoc, sourceUrl, extractedAt, currency, totalRubrics, rubrics } = raw;

    if (typeof funder !== 'string' || funder.length === 0) fail('funder must be a non-empty string');
    if (typeof funderName !== 'string' || funderName.length === 0) fail('funderName must be a non-empty string');
    if (!isFiniteNumber(year) || year < 2000 || year > 2100 || Math.trunc(year) !== year) {
        fail('year must be an integer 2000..2100');
    }
    if (typeof sourceDoc !== 'string' || sourceDoc.length === 0) fail('sourceDoc must be a non-empty string');
    if (typeof sourceUrl !== 'string') fail('sourceUrl must be a string');
    if (typeof extractedAt !== 'string' || extractedAt.length === 0) fail('extractedAt must be a non-empty string');
    if (typeof currency !== 'string' || currency.length === 0) fail('currency must be a non-empty string');
    if (!isFiniteNumber(totalRubrics) || totalRubrics <= 0) fail('totalRubrics must be a positive number');
    if (!Array.isArray(rubrics)) fail('rubrics must be an array');

    const parsed = rubrics.map((entry, index) => validateRubric(entry, index));

    if (parsed.length !== totalRubrics) {
        fail(`totalRubrics=${totalRubrics} but rubrics.length=${parsed.length}`);
    }

    const codes = new Set(parsed.map((r) => r.code));
    if (codes.size !== parsed.length) {
        fail('duplicate rubric codes detected');
    }

    return Object.freeze({
        funder,
        funderName,
        year,
        sourceDoc,
        sourceUrl,
        extractedAt,
        currency,
        totalRubrics,
        rubrics: Object.freeze(parsed),
    });
}

/** Lookup a single rubric by its code within a validated table. Undefined if absent. */
export function getRubric(table: BudgetRefTable, code: string): BudgetRubric | undefined {
    if (typeof code !== 'string' || !code) return undefined;
    return table.rubrics.find((r) => r.code === code);
}

/** All rubrics of a given category within a validated table. */
export function getRubricsByCategory(
    table: BudgetRefTable,
    category: BudgetRubricCategory,
): ReadonlyArray<BudgetRubric> {
    return Object.freeze(table.rubrics.filter((r) => r.category === category));
}

/** Resolve a funder ID to its data file path relative to the repo root. */
export function resolveFunderPath(funder: FunderId): string {
    return `data/budget-refs/${funder}.json`;
}
