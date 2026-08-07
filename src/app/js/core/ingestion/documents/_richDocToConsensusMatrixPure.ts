// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CONSENSUS-MATRIX-001 F6 — adapter RICH-DOC-FULL → Consensus Matrix (pure-logic).
//
// Converte autoExtractedMetadata (RICH-DOC-FULL output) em
// Record<fieldId, TierOutput[]> e roda buildConsensusMatrix.
//
// Hoje: apenas T0 (heurística baseline) por campo. Quando F7+ adicionar
// T1 regex paralelo / T3 visão / T4 LLM, esta função aceita outputs
// adicionais via `additionalTierOutputs` opcional.
//
// Pure-logic 100%: sem rede, determinístico.

import { buildConsensusMatrix } from './_consensusMatrixBuilderPure.js';
import type {
    ConsensusMatrixResult,
    TierOutput,
} from './_consensusMatrixBuilderPure';

export interface RichDocAutoMetadata {
    readonly autoFilledFieldCount?: number;
    readonly client?: { readonly name?: string | null; readonly cnpj?: string | null };
    readonly area?: { readonly city?: string | null; readonly state?: string | null };
    readonly document?: { readonly reference?: string | null };
    readonly status?: {
        readonly classification?: string | null;
        readonly confidence?: number | null;
    };
    readonly wellsLithology?: ReadonlyArray<unknown>;
    readonly campaigns?: ReadonlyArray<unknown>;
    readonly warnings?: ReadonlyArray<unknown>;
    readonly [key: string]: unknown;
}

export interface FieldTierOutput {
    readonly fieldId: string;
    readonly fieldType: string;
    readonly outputs: ReadonlyArray<TierOutput>;
}

const DEFAULT_T0_CONFIDENCE = 0.7; // heurística baseline

function _isUsableValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim().length === 0) return false;
    return true;
}

function _createTierOutput(
    fieldId: string,
    fieldType: string,
    value: unknown,
    confidence: number,
): FieldTierOutput {
    return Object.freeze({
        fieldId,
        fieldType,
        outputs: Object.freeze([
            Object.freeze({
                tier: 'T0' as const,
                value,
                confidence,
                sourceToken: 'extract:richdoc.heuristic',
            }),
        ]),
    });
}

function _extractStatusTierOutput(
    meta: RichDocAutoMetadata,
): FieldTierOutput | null {
    const classification = meta.status?.classification;
    if (!_isUsableValue(classification) || classification === 'undetermined') return null;

    const rawConf = meta.status?.confidence;
    const confidence =
        typeof rawConf === 'number' && Number.isFinite(rawConf)
            ? Math.min(1, Math.max(0, rawConf))
            : DEFAULT_T0_CONFIDENCE;

    return _createTierOutput('status.classification', 'document.type', classification, confidence);
}

/**
 * Extrai TierOutputs T0 do autoExtractedMetadata.
 * Campos null/vazios → omitidos (não viram TierOutput).
 */
export function richDocToTierOutputs(
    meta: unknown,
): ReadonlyArray<FieldTierOutput> {
    if (!meta || typeof meta !== 'object') return Object.freeze([]);
    const m = meta as RichDocAutoMetadata;
    const out: FieldTierOutput[] = [];

    // Identidade
    if (_isUsableValue(m.client?.name)) {
        out.push(_createTierOutput('client.name', 'client.name', m.client!.name, DEFAULT_T0_CONFIDENCE));
    }
    if (_isUsableValue(m.client?.cnpj)) {
        out.push(_createTierOutput('client.cnpj', 'cnpj', m.client!.cnpj, 0.85));
    }
    // Localização
    if (_isUsableValue(m.area?.city)) {
        out.push(_createTierOutput('area.city', 'address', m.area!.city, DEFAULT_T0_CONFIDENCE));
    }
    if (_isUsableValue(m.area?.state)) {
        out.push(_createTierOutput('area.state', 'address', m.area!.state, 0.8));
    }
    // Documento
    if (_isUsableValue(m.document?.reference)) {
        out.push(_createTierOutput('document.reference', 'document.reference', m.document!.reference, DEFAULT_T0_CONFIDENCE));
    }
    // Status regulatório CETESB
    const statusOutput = _extractStatusTierOutput(m);
    if (statusOutput) out.push(statusOutput);

    return Object.freeze(out);
}

export interface AdapterOptions {
    /** TierOutputs extras (de outras tiers como T1 regex, T3 visão, T4 LLM) merged por fieldId. */
    readonly additionalTierOutputs?: Readonly<Record<string, ReadonlyArray<TierOutput>>>;
    /** Type hints opcionais para fields não cobertos pelo RICH-DOC base. */
    readonly fieldTypeHints?: Readonly<Record<string, string>>;
}

/**
 * Constrói ConsensusMatrixResult a partir do RICH-DOC + outputs adicionais.
 * Defensive: meta inválida → result vazio bem formado.
 */
export function buildConsensusFromRichDoc(
    meta: unknown,
    options?: AdapterOptions,
): ConsensusMatrixResult {
    const base = richDocToTierOutputs(meta);
    const fieldOutputs: Record<string, TierOutput[]> = {};
    const fieldTypes: Record<string, string> = {};

    for (const f of base) {
        fieldOutputs[f.fieldId] = [...f.outputs];
        fieldTypes[f.fieldId] = f.fieldType;
    }

    // Merge outputs adicionais (futuros tiers)
    if (options?.additionalTierOutputs && typeof options.additionalTierOutputs === 'object') {
        for (const fieldId of Object.keys(options.additionalTierOutputs)) {
            const extra = options.additionalTierOutputs[fieldId];
            if (!Array.isArray(extra)) continue;
            if (!fieldOutputs[fieldId]) fieldOutputs[fieldId] = [];
            fieldOutputs[fieldId].push(...extra);
        }
    }

    // Aplica hints opcionais para fields que não vieram do base
    if (options?.fieldTypeHints && typeof options.fieldTypeHints === 'object') {
        for (const fieldId of Object.keys(options.fieldTypeHints)) {
            if (!fieldTypes[fieldId]) {
                fieldTypes[fieldId] = String(options.fieldTypeHints[fieldId] || 'unknown');
            }
        }
    }

    return buildConsensusMatrix(fieldOutputs, fieldTypes);
}

export const RICH_DOC_TO_CONSENSUS_META = Object.freeze({
    moduleId: 'consensus-matrix.richdoc-adapter',
    version: 1,
    defaultT0Confidence: DEFAULT_T0_CONFIDENCE,
    coveredFields: Object.freeze([
        'client.name',
        'client.cnpj',
        'area.city',
        'area.state',
        'document.reference',
        'status.classification',
    ]),
});
