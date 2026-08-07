// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   LIBRARY TRUST MODEL — CONSIST-OBS-001 §15 B1 (pure-logic gate de S4)
   Calvin 2026-06-11 "seguir" — decisão arquitetural sandbox library.

   DECISÃO ARQUITETURAL: DECLARATIVO > EXECUTÁVEL.

   Módulos produzidos por usuários na library NUNCA contêm código
   executável (function, eval, Function, scripts inline). Em vez disso:

   1. Manifest JSON declarativo com schema versionado
   2. Capabilities = enum whitelist (sem extensão dinâmica)
   3. Cada declaration referencia handler_key CANÔNICO já registrado
      em ACTION_REGISTRY do app (mapeia para window.handle*)
   4. Validador rejeita TUDO que não seja string/number/boolean/array/
      objeto canônico

   PRECEDENTE (M2 READY): registerTaxonomy + registerFamilyModule já
   seguem este padrão — só metadados, zero executável.

   NUNCA permite:
   - typeof === 'function' em qualquer campo
   - eval(), Function(), setTimeout(string)
   - handler_key fora do registro canônico
   - capabilities fora da whitelist
   - schema_version sem suporte
   - tamanho > MAX_BYTES (anti-DoS)

   Vincula: gate de S4 (registerAction/registerReportTemplate/
   registerBroadcastPreset/registerFieldMeta) — todos consumem
   este validador antes de aceitar módulo da library.

   Bibliografia:
   - OWASP Top 10 LLM Apps (LLM02 Insecure Output Handling)
   - VS Code Extension API Manifest (contributes.* declarativo)
   - Chrome MV3 manifest.json (declarativo > MV2 background pages)
   - npm package-lock (integrity SRI hash)
   ================================================================ */

export type Capability =
    | 'register_action'
    | 'register_report_template'
    | 'register_broadcast_preset'
    | 'register_field_meta'
    | 'register_taxonomy'
    | 'register_family_module';

const CAPABILITY_WHITELIST: ReadonlySet<Capability> = new Set([
    'register_action',
    'register_report_template',
    'register_broadcast_preset',
    'register_field_meta',
    'register_taxonomy',
    'register_family_module',
]);

const SUPPORTED_SCHEMA_VERSIONS: ReadonlySet<string> = new Set(['1.0.0']);

// 100KB cap evita DoS via manifest gigante; tested via spec §15.B1.4
export const MAX_MANIFEST_BYTES = 100_000;

export type ViolationKind =
    | 'schema_version_unsupported'
    | 'missing_required_field'
    | 'invalid_field_type'
    | 'executable_code_detected'
    | 'capability_not_whitelisted'
    | 'handler_key_not_canonical'
    | 'manifest_too_large'
    | 'circular_reference'
    | 'signature_invalid';

export interface TrustViolation {
    kind: ViolationKind;
    path: string;
    message: string;
}

export interface TrustVerdict {
    allowed: boolean;
    violations: ReadonlyArray<TrustViolation>;
    summary: string;
}

export interface ActionDeclaration {
    id: string;
    label_i18n: string;
    intent: string;
    handler_key: string;
    params_schema?: Record<string, string>;
}

export interface ReportTemplateDeclaration {
    id: string;
    name: string;
    markdown: string;
    bindings?: ReadonlyArray<string>;
}

export interface LibraryManifest {
    schema_version: string;
    module_id: string;
    module_name: string;
    author: { name: string; contact?: string };
    capabilities: ReadonlyArray<Capability>;
    declarations: {
        actions?: ReadonlyArray<ActionDeclaration>;
        report_templates?: ReadonlyArray<ReportTemplateDeclaration>;
        broadcast_presets?: ReadonlyArray<Record<string, string | number | boolean>>;
        field_meta?: ReadonlyArray<Record<string, string | number | boolean>>;
    };
    signature?: string;
}

/**
 * Deep-scan recursive: rejeita typeof === 'function' OU strings que
 * tentam burlar via eval/Function/setTimeout. Pure: sem side-effects.
 */
function _hasExecutableCode(value: unknown, path: string, visited: WeakSet<object>): TrustViolation | null {
    if (value === null || value === undefined) return null;
    const t = typeof value;
    if (t === 'function') {
        return {
            kind: 'executable_code_detected',
            path,
            message: 'function values are forbidden in library manifests',
        };
    }
    if (t === 'string') {
        const s = value as string;
        const SUSPICIOUS = /\b(eval|Function|setTimeout|setInterval|require|import\s*\(|process\.|globalThis|window\.|document\.)\s*\(/;
        if (SUSPICIOUS.test(s) && s.length > 30) {
            return {
                kind: 'executable_code_detected',
                path,
                message: 'string contains suspicious executable pattern',
            };
        }
        return null;
    }
    if (t !== 'object') return null;
    if (visited.has(value as object)) {
        return { kind: 'circular_reference', path, message: 'circular reference detected' };
    }
    visited.add(value as object);
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            const v = _hasExecutableCode(value[i], `${path}[${i}]`, visited);
            if (v) return v;
        }
        return null;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const r = _hasExecutableCode(v, `${path}.${k}`, visited);
        if (r) return r;
    }
    return null;
}

/**
 * Validates a library manifest against the trust model.
 * Returns frozen verdict — NEVER mutates input.
 *
 * @param manifest raw object from library (may be untrusted JSON)
 * @param canonicalHandlerKeys set of registered window.handle* keys
 *   that declarations may reference (passed in by caller — pure-logic
 *   has no access to runtime ACTION_REGISTRY)
 */
export function validateLibraryManifest(
    manifest: unknown,
    canonicalHandlerKeys: ReadonlySet<string>,
): TrustVerdict {
    const violations: TrustViolation[] = [];

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return Object.freeze({
            allowed: false,
            violations: Object.freeze([
                { kind: 'invalid_field_type' as const, path: '$', message: 'manifest must be an object' },
            ]),
            summary: 'rejected: manifest is not an object',
        });
    }

    const m = manifest as Record<string, unknown>;

    // Size check
    let size: number;
    try { size = JSON.stringify(m).length; } catch { size = MAX_MANIFEST_BYTES + 1; }
    if (size > MAX_MANIFEST_BYTES) {
        violations.push({
            kind: 'manifest_too_large',
            path: '$',
            message: `manifest size ${size} bytes exceeds ${MAX_MANIFEST_BYTES}`,
        });
    }

    // Schema version
    if (typeof m.schema_version !== 'string') {
        violations.push({ kind: 'missing_required_field', path: '$.schema_version', message: 'required string' });
    } else if (!SUPPORTED_SCHEMA_VERSIONS.has(m.schema_version)) {
        violations.push({
            kind: 'schema_version_unsupported',
            path: '$.schema_version',
            message: `version "${m.schema_version}" not in supported set`,
        });
    }

    // Required string fields
    for (const f of ['module_id', 'module_name'] as const) {
        const v = m[f];
        if (typeof v !== 'string' || v.trim().length === 0 || v.length > 200) {
            violations.push({
                kind: typeof v === 'string' ? 'invalid_field_type' : 'missing_required_field',
                path: `$.${f}`,
                message: `required non-empty string (≤200 chars)`,
            });
        }
    }

    // Author
    if (!m.author || typeof m.author !== 'object' || Array.isArray(m.author)) {
        violations.push({ kind: 'missing_required_field', path: '$.author', message: 'required object' });
    } else {
        const a = m.author as Record<string, unknown>;
        if (typeof a.name !== 'string' || a.name.trim().length === 0) {
            violations.push({ kind: 'missing_required_field', path: '$.author.name', message: 'required string' });
        }
    }

    // Capabilities whitelist check
    if (!Array.isArray(m.capabilities)) {
        violations.push({ kind: 'missing_required_field', path: '$.capabilities', message: 'required array' });
    } else {
        m.capabilities.forEach((c: unknown, i: number) => {
            if (typeof c !== 'string' || !CAPABILITY_WHITELIST.has(c as Capability)) {
                violations.push({
                    kind: 'capability_not_whitelisted',
                    path: `$.capabilities[${i}]`,
                    message: `capability "${String(c)}" is not in the whitelist`,
                });
            }
        });
    }

    // Declarations must be object
    if (!m.declarations || typeof m.declarations !== 'object' || Array.isArray(m.declarations)) {
        violations.push({ kind: 'missing_required_field', path: '$.declarations', message: 'required object' });
    } else {
        const d = m.declarations as Record<string, unknown>;

        // Actions: each action's handler_key must be in canonical set
        if (Array.isArray(d.actions)) {
            d.actions.forEach((a: unknown, i: number) => {
                if (!a || typeof a !== 'object') {
                    violations.push({
                        kind: 'invalid_field_type',
                        path: `$.declarations.actions[${i}]`,
                        message: 'action must be an object',
                    });
                    return;
                }
                const action = a as Record<string, unknown>;
                if (typeof action.handler_key !== 'string') {
                    violations.push({
                        kind: 'missing_required_field',
                        path: `$.declarations.actions[${i}].handler_key`,
                        message: 'required string',
                    });
                } else if (!canonicalHandlerKeys.has(action.handler_key)) {
                    violations.push({
                        kind: 'handler_key_not_canonical',
                        path: `$.declarations.actions[${i}].handler_key`,
                        message: `handler "${action.handler_key}" is not in canonical registry`,
                    });
                }
            });
        }
    }

    // Deep scan for executable code (any depth, any field)
    const execViolation = _hasExecutableCode(m, '$', new WeakSet<object>());
    if (execViolation) violations.push(execViolation);

    const allowed = violations.length === 0;
    return Object.freeze({
        allowed,
        violations: Object.freeze(violations),
        summary: allowed
            ? `accepted: module "${m.module_name}" passes all checks`
            : `rejected: ${violations.length} violation(s)`,
    });
}

/**
 * Helper: given a manifest's declared capabilities, return only those
 * the consumer subsystem actually supports. Used by S4 wire to subset
 * the declarations a given registry will accept.
 */
export function filterAllowedCapabilities(
    declared: ReadonlyArray<Capability>,
    supported: ReadonlySet<Capability>,
): ReadonlyArray<Capability> {
    return Object.freeze(declared.filter((c) => supported.has(c)));
}

/**
 * Pure idempotent: compute integrity hash of canonical manifest
 * (sorted keys). FNV-1a 32-bit hex — non-cryptographic, used only as
 * change-detection / fingerprint. Real signature uses crypto module
 * downstream (separate concern).
 */
export function computeManifestFingerprint(manifest: LibraryManifest): string {
    const canonical = _canonicalStringify(manifest);
    let h = 2166136261;
    for (let i = 0; i < canonical.length; i++) {
        h ^= canonical.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

function _canonicalStringify(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(_canonicalStringify).join(',') + ']';
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + _canonicalStringify((value as Record<string, unknown>)[k])).join(',') + '}';
}

/**
 * Helper for S4 wires: returns the set of canonical capabilities for
 * the trust model. Subsystems use this to validate they're requesting
 * only declared capabilities.
 */
export function getCanonicalCapabilities(): ReadonlySet<Capability> {
    return CAPABILITY_WHITELIST;
}
