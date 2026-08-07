// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline DSL Parser (Phase 27)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S27
 *
 * Phase 27 (2026-05-01) - pure-logic mini DSL parser para declarações
 * de pipeline. Sintaxe simples: `lib1(arg=val) | lib2(arg=val) | lib3`.
 *
 * Estratégia:
 *   - Tokenizer: split por '|', detect lib(args) format
 *   - Parser: extract libraryId + key=value args
 *   - Errors collected (não throws)
 *   - Stringify: pipeline → DSL string
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const DSL_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 27,
    deliveredAt: '2026-05-01',
});

/**
 * Tokeniza DSL string em segments (separados por |).
 *
 * @param {string} dsl
 * @returns {Array<string>}
 */
export function tokenize(dsl: string): string[] {
    if (typeof dsl !== 'string') return [];
    return dsl
        .split('|')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/**
 * Parse args string "key1=val1, key2=val2" → object.
 *
 * @param {string} argsStr
 * @returns {Object}
 */
export function parseArgs(argsStr: string): object {
    if (typeof argsStr !== 'string' || !argsStr.trim()) return {};
    const out: Record<string, any> = {};
    const pairs = argsStr.split(',');
    for (const pair of pairs) {
        const eq = pair.indexOf('=');
        if (eq === -1) continue;
        const key = pair.slice(0, eq).trim();
        const valueStr = pair.slice(eq + 1).trim();
        if (!key) continue;
        // Try to parse as number, boolean, or string
        if (/^-?\d+(\.\d+)?$/.test(valueStr)) {
            out[key] = parseFloat(valueStr);
        } else if (valueStr === 'true') {
            out[key] = true;
        } else if (valueStr === 'false') {
            out[key] = false;
        } else if (
            (valueStr.startsWith('"') && valueStr.endsWith('"')) ||
            (valueStr.startsWith("'") && valueStr.endsWith("'"))
        ) {
            out[key] = valueStr.slice(1, -1);
        } else {
            out[key] = valueStr;
        }
    }
    return out;
}

/**
 * Parse single segment "lib(arg=val)" → { libraryId, args }.
 *
 * @param {string} segment
 * @returns {{libraryId: string|null, args: Record<string, any>, error?: string}}
 */
export function parseSegment(
    segment: string,
): Readonly<{ libraryId: string | null; args: Record<string, any>; error?: string }> {
    if (typeof segment !== 'string' || !segment.trim()) {
        return Object.freeze({
            libraryId: null,
            args: {},
            error: 'empty_segment',
        });
    }
    const trimmed = segment.trim();
    // Match lib_name or lib_name(args)
    const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*(?:\((.*)\))?\s*$/);
    if (!match) {
        return Object.freeze({
            libraryId: null,
            args: {},
            error: 'invalid_syntax',
        });
    }
    const libraryId = match[1] as string;
    const argsStr = match[2] || '';
    return Object.freeze({
        libraryId,
        args: Object.freeze(parseArgs(argsStr)) as Record<string, any>,
    });
}

/**
 * Parse DSL string completo em pipeline.
 *
 * @param {string} dsl
 * @returns {{ok: boolean, pipeline: ReadonlyArray<{libraryId: string|null, config: Record<string, any>}>, errors: ReadonlyArray<string>}}
 */
export function parsePipeline(
    dsl: string,
): Readonly<{
    ok: boolean;
    pipeline: ReadonlyArray<{ libraryId: string | null; config: Record<string, any> }>;
    errors: ReadonlyArray<string>;
}> {
    const empty = { ok: false, pipeline: [], errors: ['not_string'] };
    if (typeof dsl !== 'string') return Object.freeze(empty);
    const segments = tokenize(dsl);
    if (segments.length === 0) {
        return Object.freeze({ ok: false, pipeline: [], errors: ['empty'] });
    }
    const pipeline = [];
    const errors = [];
    for (let i = 0; i < segments.length; i++) {
        const result = parseSegment(segments[i] as string);
        if (result.error) {
            errors.push(`segment_${i}: ${result.error}`);
        } else {
            pipeline.push(
                Object.freeze({
                    libraryId: result.libraryId,
                    config: result.args,
                }),
            );
        }
    }
    return Object.freeze({
        ok: errors.length === 0,
        pipeline: Object.freeze(pipeline),
        errors: Object.freeze(errors),
    });
}

/**
 * Stringify args object → "key1=val1, key2=val2".
 *
 * @param {Object} args
 * @returns {string}
 */
export function stringifyArgs(args: object): string {
    if (!args || typeof args !== 'object') return '';
    const pairs = [];
    for (const [key, value] of Object.entries(args)) {
        if (value === undefined || value === null) continue;
        let v;
        if (typeof value === 'string') {
            // Quote if contains special chars
            v = /[\s,()]/.test(value) ? `"${value}"` : value;
        } else if (typeof value === 'boolean' || typeof value === 'number') {
            v = String(value);
        } else {
            v = JSON.stringify(value);
        }
        pairs.push(`${key}=${v}`);
    }
    return pairs.join(', ');
}

/**
 * Stringify pipeline → DSL string.
 *
 * @param {ReadonlyArray<{libraryId: string|null, config: Record<string, any>}>} pipeline
 * @returns {string}
 */
export function stringifyPipeline(
    pipeline: ReadonlyArray<{ libraryId: string | null; config: Record<string, any> }>,
): string {
    if (!Array.isArray(pipeline)) return '';
    const parts = [];
    for (const step of pipeline) {
        if (!step || !step.libraryId) continue;
        const argsStr = stringifyArgs(step.config);
        parts.push(argsStr ? `${step.libraryId}(${argsStr})` : step.libraryId);
    }
    return parts.join(' | ');
}

/**
 * Round-trip validation.
 */
export function roundTripDsl(
    dsl: any,
): Readonly<{ ok: boolean; errors?: ReadonlyArray<string>; original?: any; restringified?: string; equal?: boolean }> {
    const parsed = parsePipeline(dsl);
    if (!parsed.ok) return Object.freeze({ ok: false, errors: parsed.errors });
    const restringified = stringifyPipeline(parsed.pipeline);
    const reparsed = parsePipeline(restringified);
    return Object.freeze({
        ok: reparsed.ok,
        original: dsl,
        restringified,
        equal: parsed.pipeline.length === reparsed.pipeline.length,
    });
}

/**
 * Sumariza parsed pipeline.
 */
export function summarizeDsl(
    parsed: any,
): Readonly<{ stepCount: number; libraryIds: any[]; hasErrors: boolean; errorCount?: number }> {
    const empty = { stepCount: 0, libraryIds: [], hasErrors: true };
    if (!parsed || !Array.isArray(parsed.pipeline)) return empty;
    const libraryIds = [...new Set(parsed.pipeline.map((s: any) => s && s.libraryId).filter(Boolean))];
    return Object.freeze({
        stepCount: parsed.pipeline.length,
        libraryIds,
        hasErrors: !parsed.ok || (parsed.errors && parsed.errors.length > 0),
        errorCount: parsed.errors ? parsed.errors.length : 0,
    });
}

/**
 * Module identity export.
 */
export const pipelineDslMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 27,
    deliveredAt: '2026-05-01',
    exports: [
        'DSL_META',
        'tokenize',
        'parseArgs',
        'parseSegment',
        'parsePipeline',
        'stringifyArgs',
        'stringifyPipeline',
        'roundTripDsl',
        'summarizeDsl',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
