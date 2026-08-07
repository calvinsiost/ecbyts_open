// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (core/io/export).
//
// Aplicação direta da recomendação #6 do scripts/refactor-opportunities.mjs:
// core/io/export.ts (584L) tem fan-in 18 no maior SCC. Esta extração foca em
// PERSONAL DATA SANITIZATION pure logic — LGPD compliance crítico (mascaramento
// de CPF) deve ser testável isoladamente sem importar AES vault.
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Segue padrão dos 6 Modules C anteriores.

import { deepClone as _deepCloneCanonical } from '../../utils/helpers/deepClone.js';
//
// Spec NOT:
// - NÃO ler DOM (document.getElementById/querySelectorAll — caller passa values)
// - NÃO chamar AES vault (encryptField — caller injeta encryptFn opcional)
// - NÃO importar core managers (caller orquestra via buildModel)
// - NÃO emoji
//
// Extracted helpers:
//   - PersonalDataType / SanitizedRegistry (canonical types)
//   - PERSONAL_REGISTRY_TYPES               (frozen LGPD-aware list)
//   - MODEL_SCHEMA_VERSION                  (frozen = 2)
//   - DEFAULT_COORDINATE_CONFIG             (frozen UTM zone 23 SAD69 default)
//   - maskCpfRegistry(rawCpf)               pure LGPD mask formatter
//   - parseIntWithDefault(raw, defaultValue)  pure parse helper
//   - parseFloatWithDefault(raw, defaultValue) pure parse helper
//   - normalizeProjectArea(area, subarea)   pure object factory
//   - sanitizeRegistryNode(node, encryptFn?) pure async LGPD sanitizer
//   - deepCloneTree(tree)                   pure structuredClone wrapper
//   - filterEmptyAreas(areas)               pure filter

export type PersonalDataType = 'cpf';

export interface ProjectArea {
    area: string;
    subarea: string;
}

export interface RegistryNodeLike {
    registryType?: string;
    registryNumber?: string;
    registryNumberEncrypted?: string;
    children?: ReadonlyArray<RegistryNodeLike>;
    [key: string]: unknown;
}

export interface CoordinateConfigDefaults {
    system: string;
    zone: number;
    hemisphere: 'N' | 'S';
    origin: { easting: number; northing: number; elevation: number };
}

/**
 * Frozen list de tipos de registro pessoais (LGPD/GDPR).
 * Matches PERSONAL_TYPES @ export.ts:348.
 *
 * Tipos não-pessoais (CNPJ, EIN, etc.) passam em plaintext.
 */
export const PERSONAL_REGISTRY_TYPES: ReadonlyArray<PersonalDataType> = Object.freeze(['cpf']);

/**
 * Frozen ECBT model schema version.
 * Matches schemaVersion @ export.ts:139.
 */
export const MODEL_SCHEMA_VERSION = 2;

/**
 * Frozen defaults para coordinate system (UTM SAD69 SP — referência ecbyts).
 * Matches buildModel coordinate defaults @ export.ts:157-165.
 */
export const DEFAULT_COORDINATE_CONFIG: Readonly<CoordinateConfigDefaults> = Object.freeze({
    system: 'UTM',
    zone: 23,
    hemisphere: 'S',
    origin: Object.freeze({ easting: 0, northing: 0, elevation: 0 }),
}) as CoordinateConfigDefaults;

/**
 * LGPD-compliant CPF mask formatter.
 *   < 2 dígitos → '***'
 *   ≥ 2 dígitos → '***.***. ***-{last2}'  (preserva 2 últimos para identificação)
 *
 * Matches mask logic @ export.ts:359-362.
 *
 * @example
 *   maskCpfRegistry('12345678901') → '***.***. ***-01'
 *   maskCpfRegistry('1')           → '***'
 *   maskCpfRegistry('')            → '***'
 */
export function maskCpfRegistry(rawCpf: string): string {
    if (typeof rawCpf !== 'string') return '***';
    const digits = rawCpf.replace(/\D/g, '');
    return digits.length >= 2 ? `***.***. ***-${digits.slice(-2)}` : '***';
}

/**
 * Pure parseInt with default fallback. Returns defaultValue se NaN.
 * Substitui pattern `parseInt(getInputValue('x', '0')) || 0` em buildModel.
 *
 * Matches buildModel coordinate parsing @ export.ts:158, 161, 162, 163.
 */
export function parseIntWithDefault(raw: unknown, defaultValue: number): number {
    if (typeof raw === 'number') return Number.isFinite(raw) ? Math.floor(raw) : defaultValue;
    const parsed = parseInt(String(raw ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * Pure parseFloat with default fallback. Returns defaultValue se NaN.
 */
export function parseFloatWithDefault(raw: unknown, defaultValue: number): number {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : defaultValue;
    const parsed = parseFloat(String(raw ?? ''));
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * Pure factory para ProjectArea entry.
 * Empty area+subarea → null (caller filtra via filterEmptyAreas).
 */
export function normalizeProjectArea(area: unknown, subarea: unknown): ProjectArea {
    const a = typeof area === 'string' ? area.trim() : '';
    const s = typeof subarea === 'string' ? subarea.trim() : '';
    return { area: a, subarea: s };
}

/**
 * Pure filter: remove entries com area="" E subarea="".
 * Matches buildModel.project.areas filter @ export.ts:327.
 */
export function filterEmptyAreas(areas: ReadonlyArray<ProjectArea>): ProjectArea[] {
    return areas.filter((entry) => entry.area || entry.subarea);
}

/**
 * Pure-ish LGPD sanitization para 1 nó (caller propaga recursivamente).
 * Caller injeta encryptFn (opcional) para AES vault.
 *
 * Matches sanitizeNode body @ export.ts:358-369.
 *   Se node.registryType ∈ PERSONAL_REGISTRY_TYPES + tem registryNumber:
 *     - registryNumber → mask
 *     - registryNumberEncrypted ← encryptFn(originalNumber) (se encryptFn presente)
 *   Children NÃO recursionados aqui — caller decide order.
 */
export async function sanitizeRegistryNode(
    node: RegistryNodeLike,
    encryptFn?: (raw: string) => Promise<string>,
): Promise<RegistryNodeLike> {
    if (!node || typeof node !== 'object') return node;
    const personalSet = new Set<string>(PERSONAL_REGISTRY_TYPES);
    const registryType = node.registryType;
    const registryNumber = node.registryNumber;
    if (
        typeof registryType === 'string' &&
        personalSet.has(registryType) &&
        typeof registryNumber === 'string' &&
        registryNumber.trim().length > 0
    ) {
        const full = registryNumber;
        node.registryNumber = maskCpfRegistry(full);
        if (encryptFn) {
            try {
                node.registryNumberEncrypted = await encryptFn(full);
            } catch (e: any) {
                console.debug('[export-pure] encryptFn failed:', e?.message || e);
            }
        }
    }
    return node;
}

/**
 * Pure deep clone of registry tree via structuredClone.
 * Returns new tree (caller can sanitize in-place sem afetar original).
 */
export function deepCloneRegistryTree<T>(tree: ReadonlyArray<T>): T[] {
    if (!Array.isArray(tree)) return [];
    try {
        return structuredClone(tree as T[]);
    } catch (e: any) {
        console.debug('[export-pure] structuredClone failed, fallback JSON:', e?.message || e);
        return _deepCloneCanonical(tree as T[]);
    }
}

/**
 * Type-guard for RegistryNodeLike shape (boundary validation).
 */
export function isValidRegistryNode(value: unknown): value is RegistryNodeLike {
    return !!value && typeof value === 'object';
}

/**
 * Verifica se registryType é pessoal (LGPD-protected).
 */
export function isPersonalRegistryType(registryType: unknown): registryType is PersonalDataType {
    return typeof registryType === 'string' && (PERSONAL_REGISTRY_TYPES as ReadonlyArray<string>).includes(registryType);
}
