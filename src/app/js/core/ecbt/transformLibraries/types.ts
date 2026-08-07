// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Types & Constants (Phase 1)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S1
 *
 * Phase 1 (2026-04-30) - constantes canônicas usadas por engine,
 * registry, pipeline e libraries oficiais.
 *
 * Pure-logic, zero DOM. Exports:
 *   - TransformTypes: enum 'pure' | 'async'
 *   - TransformOutcomes: enum SUCCESS | FAILED | SKIPPED
 *   - TransformErrorCodes: códigos canônicos para errors
 *
 * Owner: Claude (orquestrador)
 */

export const TransformTypes = Object.freeze({
    PURE: 'pure',
    ASYNC: 'async',
} as const);
export type TransformTypes = (typeof TransformTypes)[keyof typeof TransformTypes];

/**
 * Resultado canônico de uma execução de transform - valor do campo
 * `audit.outcome` retornado por applyTransform/Pipeline.run.
 */
export const TransformOutcomes = Object.freeze({
    SUCCESS: 'success',
    FAILED: 'failed',
    SKIPPED: 'skipped',
} as const);
export type TransformOutcomes = (typeof TransformOutcomes)[keyof typeof TransformOutcomes];

/**
 * Códigos canônicos de erro. Usados em `errors[].code` em retornos
 * de applyTransform/Pipeline.run.
 */
export const TransformErrorCodes = Object.freeze({
    INVALID_INPUT: 'INVALID_INPUT',
    INVALID_OUTPUT: 'INVALID_OUTPUT',
    INVALID_CONFIG: 'INVALID_CONFIG',
    INVALID_LIBRARY: 'INVALID_LIBRARY',
    UNKNOWN_LIBRARY: 'UNKNOWN_LIBRARY',
    TRANSFORM_FAILED: 'TRANSFORM_FAILED',
} as const);
export type TransformErrorCodes = (typeof TransformErrorCodes)[keyof typeof TransformErrorCodes];

export interface TransformLibrary {
    /** identificador unico da library (ex: 'add-provenance-defaults') */
    id: string;
    /** i18n key para display name */
    name: string;
    /** semver string */
    version: string;
    /** execution mode */
    type: 'pure' | 'async';
    /** descricao curta */
    description: string;
    /** autor (default: 'ecbyts') */
    author?: string;
    /** tags para discovery */
    tags?: string[];
    /** JSON Schema do config aceito */
    configSchema?: object;
    /** funcao transform */
    transform: (model: unknown, config: unknown) => unknown;
}

/**
 * Module identity export. Útil para tests e debug.
 */
export const ecbtTransformTypesMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES',
    phase: 1,
    deliveredAt: '2026-04-30',
    exports: ['TransformTypes', 'TransformOutcomes', 'TransformErrorCodes'],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const);