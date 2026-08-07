// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Preset Components Hash — pure logic (RF15 / B12 of
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET).
 *
 * Computes a deterministic canonical JSON string from the set of
 * components referenced by a preset (validation profile id + GWP factors
 * + emission registry id + taxonomy id + report templates + EIS weights +
 * spatial CRS + unit system + etc.). The caller is responsible for
 * passing the string to SHA-256 (SubtleCrypto in browser, crypto.createHash
 * in Node) — this module stays pure (no async, no platform deps).
 *
 * Why "cascade": componentsHash detects tampering of dependencies
 * separately from contentHash (which covers the preset body itself).
 * Forensics can compare componentsHash before/after a registry sync to
 * tell whether referenced components mutated.
 *
 * Determinism rules (CRITICAL — must round-trip identical across runs/JS engines):
 *   - Object keys sorted lexicographically (Array.sort default)
 *   - Arrays preserve order (semantically meaningful in preset components)
 *   - `undefined` values OMITTED from output (do not affect hash)
 *   - `null` values KEPT (distinct from undefined: null is "explicitly empty")
 *   - Number `NaN`/`±Infinity` → serialised as the string "NaN"/"Infinity"
 *     since JSON.stringify drops them silently (would break determinism)
 *   - String escaping uses standard JSON.stringify rules
 *
 * Tests live in `tests/compliance-components-hash-pure.test.mjs`.
 */

import type { CompliancePreset } from './_presetPure';

export interface ComponentsHashInput {
    readonly validationProfileId?: string;
    readonly ghgFactors?: {
        readonly gwpVersion?: string;
        readonly timeHorizon?: number;
    };
    readonly emissionFactorsRegistry?: string;
    readonly taxonomyId?: string;
    readonly reportTemplateIds?: ReadonlyArray<string>;
    readonly eisWeights?: Readonly<Record<string, number>>;
    readonly spatialCrs?: string;
    readonly unitSystem?: string;
    readonly auditRetentionDays?: number;
    readonly currencyCode?: string;
    readonly languagePrimary?: string;
}

/**
 * Canonical JSON stringify — deterministic ordering + safe number handling.
 *
 * Recursive: objects → sorted keys, arrays → preserved order, primitives
 * via JSON.stringify (except NaN/Infinity which become string sentinels).
 */
export function canonicalStringify(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return ''; // sentinel — caller filters
    const t = typeof value;
    if (t === 'string') return JSON.stringify(value);
    if (t === 'boolean') return value ? 'true' : 'false';
    if (t === 'number') {
        if (Number.isNaN(value as number)) return '"NaN"';
        if (!Number.isFinite(value as number)) return (value as number) > 0 ? '"Infinity"' : '"-Infinity"';
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return '[' + value.map((v) => (v === undefined ? 'null' : canonicalStringify(v))).join(',') + ']';
    }
    if (t === 'object') {
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj)
            .filter((k) => obj[k] !== undefined)
            .sort();
        const parts: string[] = [];
        for (const k of keys) {
            const inner = canonicalStringify(obj[k]);
            if (inner === '') continue; // undefined sentinel
            parts.push(JSON.stringify(k) + ':' + inner);
        }
        return '{' + parts.join(',') + '}';
    }
    // bigint / symbol / function — not expected in preset components; coerce
    return JSON.stringify(String(value));
}

/**
 * Extract the components subset from a preset (drops UX/forensic fields)
 * and return as a frozen plain object ready for canonicalStringify.
 */
export function extractComponentsInput(preset: CompliancePreset | null | undefined): ComponentsHashInput {
    if (!preset || typeof preset !== 'object') return Object.freeze({});
    const p = preset;
    const out: Record<string, unknown> = {};
    if (p.validationProfileId !== undefined) out.validationProfileId = p.validationProfileId;
    if (p.ghgFactors !== undefined) {
        out.ghgFactors = {
            gwpVersion: p.ghgFactors.gwpVersion,
            timeHorizon: p.ghgFactors.timeHorizon,
        };
    }
    if (p.emissionFactorsRegistry !== undefined) out.emissionFactorsRegistry = p.emissionFactorsRegistry;
    if (p.taxonomyId !== undefined) out.taxonomyId = p.taxonomyId;
    if (p.reportTemplateIds !== undefined) out.reportTemplateIds = [...p.reportTemplateIds];
    if (p.eisWeights !== undefined) out.eisWeights = { ...p.eisWeights };
    if (p.spatialCrs !== undefined) out.spatialCrs = p.spatialCrs;
    if (p.unitSystem !== undefined) out.unitSystem = p.unitSystem;
    if (p.auditRetentionDays !== undefined) out.auditRetentionDays = p.auditRetentionDays;
    if (p.currencyCode !== undefined) out.currencyCode = p.currencyCode;
    if (p.languagePrimary !== undefined) out.languagePrimary = p.languagePrimary;
    return Object.freeze(out) as ComponentsHashInput;
}

/**
 * Convenience — extract + canonicalStringify in one call. The returned
 * string is the EXACT input to feed to SHA-256.
 *
 * Caller pattern (browser):
 *   const input = buildComponentsHashInput(preset);
 *   const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
 *   const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
 *
 * Caller pattern (Node):
 *   import { createHash } from 'node:crypto';
 *   const hex = createHash('sha256').update(buildComponentsHashInput(preset)).digest('hex');
 */
export function buildComponentsHashInput(preset: CompliancePreset | null | undefined): string {
    return canonicalStringify(extractComponentsInput(preset));
}

/**
 * Compare two preset components — TRUE if their canonical forms match.
 * Useful for cheap equality check before computing the SHA.
 */
export function componentsEqual(
    a: CompliancePreset | null | undefined,
    b: CompliancePreset | null | undefined,
): boolean {
    return buildComponentsHashInput(a) === buildComponentsHashInput(b);
}
