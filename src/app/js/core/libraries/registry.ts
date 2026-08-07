// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   LIBRARY REGISTRY — CONSIST-OBS-001 S4 (4 APIs library-facing)
   Calvin 2026-06-11 "seguir" — implementa S4 sobre B1 (trust model).

   4 APIs públicas que módulos library declaram via manifest. Cada API
   consome _libraryTrustModelPure.validateLibraryManifest antes de
   registrar QUALQUER declaration. Manifesto rejeitado nunca toca o
   runtime.

   Wire em utils/libraries/loader (futuro): no boot, ler cada manifest
   da Library Marketplace, validar, e popular o registry. Subsystems
   (AI bot, reports, radar, field-meta) leem via getRegisteredActions
   etc.

   NÃO faz hot-reload; manifests adicionados em runtime se aplicam
   imediatamente (idempotent — re-registro mesmo module_id substitui).

   Pure-logic interno (validator). Side-effect minimal (in-memory maps
   + opcional CustomEvent dispatch).
   ================================================================ */

import {
    validateLibraryManifest,
    filterAllowedCapabilities,
    computeManifestFingerprint,
} from './_libraryTrustModelPure.js';
import type {
    LibraryManifest,
    Capability,
    TrustVerdict,
    ActionDeclaration,
    ReportTemplateDeclaration,
} from './_libraryTrustModelPure.js';

// ----------------------------------------------------------------
// State (in-memory; nunca persiste sozinho — orquestrador decide)
// ----------------------------------------------------------------

interface RegistryEntry<T> {
    module_id: string;
    module_name: string;
    fingerprint: string;
    items: ReadonlyArray<T>;
    capabilities: ReadonlyArray<Capability>;
}

const _actions = new Map<string, RegistryEntry<ActionDeclaration>>();
const _reportTemplates = new Map<string, RegistryEntry<ReportTemplateDeclaration>>();
const _broadcastPresets = new Map<string, RegistryEntry<Record<string, string | number | boolean>>>();
const _fieldMeta = new Map<string, RegistryEntry<Record<string, string | number | boolean>>>();

// ----------------------------------------------------------------
// Canonical handler keys — atualizadas pelo bootstrap do app
// ----------------------------------------------------------------

let _canonicalHandlerKeys: ReadonlySet<string> = new Set();

/**
 * Boot-time: atualiza o set de handler_keys aceitáveis pelo trust model.
 * Caller é initLibraries() em main.ts, que passa as keys do
 * ACTION_REGISTRY consolidado.
 */
export function setCanonicalHandlerKeys(keys: ReadonlySet<string>): void {
    _canonicalHandlerKeys = keys;
}

// ----------------------------------------------------------------
// SUPPORTED capability sets — cada API só aceita o seu próprio capability
// ----------------------------------------------------------------

const ACTION_SUPPORTED: ReadonlySet<Capability> = new Set(['register_action']);
const REPORT_TEMPLATE_SUPPORTED: ReadonlySet<Capability> = new Set(['register_report_template']);
const BROADCAST_PRESET_SUPPORTED: ReadonlySet<Capability> = new Set(['register_broadcast_preset']);
const FIELD_META_SUPPORTED: ReadonlySet<Capability> = new Set(['register_field_meta']);

// ----------------------------------------------------------------
// Registration result
// ----------------------------------------------------------------

export interface RegistrationResult {
    accepted: boolean;
    module_id: string;
    fingerprint: string;
    capabilitiesApplied: ReadonlyArray<Capability>;
    itemsRegistered: number;
    verdict: TrustVerdict;
}

function _validateAndExtract(
    manifest: LibraryManifest,
    supported: ReadonlySet<Capability>,
    section: 'actions' | 'report_templates' | 'broadcast_presets' | 'field_meta',
): {
    ok: boolean;
    verdict: TrustVerdict;
    items: ReadonlyArray<unknown>;
    capabilities: ReadonlyArray<Capability>;
} {
    const verdict = validateLibraryManifest(manifest, _canonicalHandlerKeys);
    if (!verdict.allowed) {
        return { ok: false, verdict, items: [], capabilities: [] };
    }
    const declared = manifest.capabilities || [];
    const caps = filterAllowedCapabilities(declared, supported);
    const items = (manifest.declarations?.[section] as ReadonlyArray<unknown>) || [];
    return { ok: true, verdict, items, capabilities: caps };
}

function _dispatchEvent(eventName: string, detail: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    const CE: any = (window as any).CustomEvent || globalThis.CustomEvent;
    if (typeof CE !== 'function') return;
    try {
        window.dispatchEvent(new CE(eventName, { detail }));
    } catch (e: any) {
        console.debug('[libraries:dispatch-event]', e?.message || e);
    }
}

// ----------------------------------------------------------------
// API #1 — registerAction (AI bot ação custom)
// ----------------------------------------------------------------

/**
 * Register custom actions declared by a library module.
 * Each action references a canonical handler_key + intent + params_schema.
 * Validator (B1) garante zero código executável + handler_key whitelist.
 */
export function registerAction(manifest: LibraryManifest): RegistrationResult {
    const r = _validateAndExtract(manifest, ACTION_SUPPORTED, 'actions');
    if (!r.ok) {
        return Object.freeze({
            accepted: false,
            module_id: manifest?.module_id || '<unknown>',
            fingerprint: '',
            capabilitiesApplied: [],
            itemsRegistered: 0,
            verdict: r.verdict,
        });
    }
    const fp = computeManifestFingerprint(manifest);
    const items = (r.items as ReadonlyArray<ActionDeclaration>) || [];
    _actions.set(manifest.module_id, {
        module_id: manifest.module_id,
        module_name: manifest.module_name,
        fingerprint: fp,
        items,
        capabilities: r.capabilities,
    });
    _dispatchEvent('ecbyts:library-action-registered', { module_id: manifest.module_id, count: items.length });
    return Object.freeze({
        accepted: true,
        module_id: manifest.module_id,
        fingerprint: fp,
        capabilitiesApplied: r.capabilities,
        itemsRegistered: items.length,
        verdict: r.verdict,
    });
}

// ----------------------------------------------------------------
// API #2 — registerReportTemplate
// ----------------------------------------------------------------

export function registerReportTemplate(manifest: LibraryManifest): RegistrationResult {
    const r = _validateAndExtract(manifest, REPORT_TEMPLATE_SUPPORTED, 'report_templates');
    if (!r.ok) {
        return Object.freeze({
            accepted: false,
            module_id: manifest?.module_id || '<unknown>',
            fingerprint: '',
            capabilitiesApplied: [],
            itemsRegistered: 0,
            verdict: r.verdict,
        });
    }
    const fp = computeManifestFingerprint(manifest);
    const items = (r.items as ReadonlyArray<ReportTemplateDeclaration>) || [];
    _reportTemplates.set(manifest.module_id, {
        module_id: manifest.module_id,
        module_name: manifest.module_name,
        fingerprint: fp,
        items,
        capabilities: r.capabilities,
    });
    _dispatchEvent('ecbyts:library-report-template-registered', {
        module_id: manifest.module_id,
        count: items.length,
    });
    return Object.freeze({
        accepted: true,
        module_id: manifest.module_id,
        fingerprint: fp,
        capabilitiesApplied: r.capabilities,
        itemsRegistered: items.length,
        verdict: r.verdict,
    });
}

// ----------------------------------------------------------------
// API #3 — registerBroadcastPreset (Model Radar)
// ----------------------------------------------------------------

export function registerBroadcastPreset(manifest: LibraryManifest): RegistrationResult {
    const r = _validateAndExtract(manifest, BROADCAST_PRESET_SUPPORTED, 'broadcast_presets');
    if (!r.ok) {
        return Object.freeze({
            accepted: false,
            module_id: manifest?.module_id || '<unknown>',
            fingerprint: '',
            capabilitiesApplied: [],
            itemsRegistered: 0,
            verdict: r.verdict,
        });
    }
    const fp = computeManifestFingerprint(manifest);
    const items = (r.items as ReadonlyArray<Record<string, string | number | boolean>>) || [];
    _broadcastPresets.set(manifest.module_id, {
        module_id: manifest.module_id,
        module_name: manifest.module_name,
        fingerprint: fp,
        items,
        capabilities: r.capabilities,
    });
    _dispatchEvent('ecbyts:library-broadcast-preset-registered', {
        module_id: manifest.module_id,
        count: items.length,
    });
    return Object.freeze({
        accepted: true,
        module_id: manifest.module_id,
        fingerprint: fp,
        capabilitiesApplied: r.capabilities,
        itemsRegistered: items.length,
        verdict: r.verdict,
    });
}

// ----------------------------------------------------------------
// API #4 — registerFieldMeta (taxonomy dinâmica)
// ----------------------------------------------------------------

export function registerFieldMeta(manifest: LibraryManifest): RegistrationResult {
    const r = _validateAndExtract(manifest, FIELD_META_SUPPORTED, 'field_meta');
    if (!r.ok) {
        return Object.freeze({
            accepted: false,
            module_id: manifest?.module_id || '<unknown>',
            fingerprint: '',
            capabilitiesApplied: [],
            itemsRegistered: 0,
            verdict: r.verdict,
        });
    }
    const fp = computeManifestFingerprint(manifest);
    const items = (r.items as ReadonlyArray<Record<string, string | number | boolean>>) || [];
    _fieldMeta.set(manifest.module_id, {
        module_id: manifest.module_id,
        module_name: manifest.module_name,
        fingerprint: fp,
        items,
        capabilities: r.capabilities,
    });
    _dispatchEvent('ecbyts:library-field-meta-registered', {
        module_id: manifest.module_id,
        count: items.length,
    });
    return Object.freeze({
        accepted: true,
        module_id: manifest.module_id,
        fingerprint: fp,
        capabilitiesApplied: r.capabilities,
        itemsRegistered: items.length,
        verdict: r.verdict,
    });
}

// ----------------------------------------------------------------
// READ APIs — consumers leem via estes
// ----------------------------------------------------------------

export function getRegisteredActions(): ReadonlyArray<ActionDeclaration> {
    const all: ActionDeclaration[] = [];
    for (const entry of _actions.values()) for (const it of entry.items) all.push(it);
    return Object.freeze(all);
}

export function getRegisteredReportTemplates(): ReadonlyArray<ReportTemplateDeclaration> {
    const all: ReportTemplateDeclaration[] = [];
    for (const entry of _reportTemplates.values()) for (const it of entry.items) all.push(it);
    return Object.freeze(all);
}

export function getRegisteredBroadcastPresets(): ReadonlyArray<Record<string, string | number | boolean>> {
    const all: Record<string, string | number | boolean>[] = [];
    for (const entry of _broadcastPresets.values()) for (const it of entry.items) all.push(it);
    return Object.freeze(all);
}

export function getRegisteredFieldMeta(): ReadonlyArray<Record<string, string | number | boolean>> {
    const all: Record<string, string | number | boolean>[] = [];
    for (const entry of _fieldMeta.values()) for (const it of entry.items) all.push(it);
    return Object.freeze(all);
}

/**
 * Field meta agrupado por módulo de origem — consumido pelo taxonomy
 * bridge (uma taxonomy por módulo, com module_name como display name).
 */
export function getRegisteredFieldMetaByModule(): ReadonlyArray<{
    module_id: string;
    module_name: string;
    items: ReadonlyArray<Record<string, string | number | boolean>>;
}> {
    const out: { module_id: string; module_name: string; items: ReadonlyArray<Record<string, string | number | boolean>> }[] = [];
    for (const entry of _fieldMeta.values()) {
        out.push({ module_id: entry.module_id, module_name: entry.module_name, items: entry.items });
    }
    return Object.freeze(out);
}

// ----------------------------------------------------------------
// UTILITY — unregister + reset (úteis para hot-reload + testes)
// ----------------------------------------------------------------

export function unregisterModule(module_id: string): { removed: boolean } {
    const a = _actions.delete(module_id);
    const r = _reportTemplates.delete(module_id);
    const b = _broadcastPresets.delete(module_id);
    const f = _fieldMeta.delete(module_id);
    return { removed: a || r || b || f };
}

export function clearAllRegistry(): void {
    _actions.clear();
    _reportTemplates.clear();
    _broadcastPresets.clear();
    _fieldMeta.clear();
}

export function listRegisteredModules(): ReadonlyArray<{
    module_id: string;
    module_name: string;
    fingerprint: string;
    capabilities: ReadonlyArray<Capability>;
}> {
    const seen = new Map<string, { module_id: string; module_name: string; fingerprint: string; capabilities: ReadonlyArray<Capability> }>();
    for (const m of [_actions, _reportTemplates, _broadcastPresets, _fieldMeta]) {
        for (const entry of m.values()) {
            if (!seen.has(entry.module_id)) {
                seen.set(entry.module_id, {
                    module_id: entry.module_id,
                    module_name: entry.module_name,
                    fingerprint: entry.fingerprint,
                    capabilities: entry.capabilities,
                });
            }
        }
    }
    return Object.freeze([...seen.values()]);
}
