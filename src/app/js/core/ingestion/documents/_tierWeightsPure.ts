// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CONSENSUS-MATRIX-001 F1 / RF-4 — Tier weights calibration (pure-logic).
//
// Atribui um peso ∈ [0, 1] para cada combinação (tier, fieldType).
// Defaults calibrados empiricamente:
//   - regex (T1) → 1.0 para campos determinísticos (CNPJ, datas);
//                 baixo (0.3-0.4) para free-form text.
//   - vision (T3) → alto para identidade visual (logo, document type);
//                 médio (0.5-0.6) para campos textuais (CNPJ).
//   - llm (T4) → médio (0.5-0.7) — bom contexto, alucina números.
//   - heuristic (T0) → 0.7 baseline para qualquer tipo.
//   - vision-fallback (T2) → 0.5 médio (OCR + classifier).
//
// Pure-logic: sem DOM, sem rede, determinístico, defensivo.

export type ConsensusTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

export type FieldType =
    | 'cnpj'
    | 'date'
    | 'integer'
    | 'decimal'
    | 'address'
    | 'document.type'
    | 'document.reference'
    | 'client.name'
    | 'free-text'
    | 'enum'
    | 'unknown';

const DEFAULT_WEIGHT = 0.5;

// Frozen calibration matrix — [tier][fieldType] → weight ∈ [0,1].
// Justificativa por linha em comentário inline.
const WEIGHTS: Readonly<Record<ConsensusTier, Readonly<Record<string, number>>>> = Object.freeze({
    // T0 — heurística (extractor textual via regex + keyword)
    T0: Object.freeze({
        cnpj: 0.7,
        date: 0.7,
        integer: 0.7,
        decimal: 0.65,
        address: 0.6,
        'document.type': 0.5,
        'document.reference': 0.7,
        'client.name': 0.55,
        'free-text': 0.55,
        enum: 0.6,
        unknown: 0.5,
    }),
    // T1 — regex puro (determinístico em padrões formais)
    T1: Object.freeze({
        cnpj: 1.0, // módulo 11 valida — quando casa é certo
        date: 0.95, // formato dd/mm/aaaa robusto
        integer: 0.9, // \d+ é robusto
        decimal: 0.85, // virgula PT vs ponto EN gerencia
        address: 0.4, // muito variável
        'document.type': 0.3, // não casa
        'document.reference': 0.7, // padrões "Rel. nº" comuns
        'client.name': 0.3, // não casa free-form
        'free-text': 0.2, // não casa
        enum: 0.55, // só se enum tem padrão estável
        unknown: 0.4,
    }),
    // T2 — vision-fallback (OCR + classifier leve)
    T2: Object.freeze({
        cnpj: 0.55,
        date: 0.55,
        integer: 0.5,
        decimal: 0.45,
        address: 0.5,
        'document.type': 0.7,
        'document.reference': 0.55,
        'client.name': 0.55,
        'free-text': 0.5,
        enum: 0.5,
        unknown: 0.45,
    }),
    // T3 — vision avançado (Doc-AI / SAM / YOLOS)
    T3: Object.freeze({
        cnpj: 0.6, // OCR pode confundir 0/O e 1/I
        date: 0.7,
        integer: 0.7,
        decimal: 0.6,
        address: 0.75,
        'document.type': 0.85, // visão é boa pra layout/header
        'document.reference': 0.65,
        'client.name': 0.7,
        'free-text': 0.65,
        enum: 0.7,
        unknown: 0.55,
    }),
    // T4 — LLM remoto/local (Gemma, Claude, DeepSeek)
    T4: Object.freeze({
        cnpj: 0.5, // LLM alucina dígitos
        date: 0.55,
        integer: 0.55, // alucina valores numéricos
        decimal: 0.5,
        address: 0.7,
        'document.type': 0.75,
        'document.reference': 0.6,
        'client.name': 0.75,
        'free-text': 0.7,
        enum: 0.7,
        unknown: 0.55,
    }),
});

const VALID_TIERS: ReadonlySet<ConsensusTier> = new Set<ConsensusTier>(['T0', 'T1', 'T2', 'T3', 'T4']);

/**
 * Retorna o peso ∈ [0,1] para a combinação (tier, fieldType).
 * Defensive: tier inválido ou fieldType desconhecido → DEFAULT_WEIGHT (0.5).
 */
export function getTierWeight(tier: unknown, fieldType: unknown): number {
    if (typeof tier !== 'string' || !VALID_TIERS.has(tier as ConsensusTier)) return DEFAULT_WEIGHT;
    if (typeof fieldType !== 'string' || fieldType.length === 0) return DEFAULT_WEIGHT;
    const tierMap = WEIGHTS[tier as ConsensusTier];
    const w = tierMap[fieldType];
    if (typeof w !== 'number' || !Number.isFinite(w)) return DEFAULT_WEIGHT;
    return Math.min(1, Math.max(0, w));
}

/**
 * Lista todos os field types canônicos cobertos pela calibração.
 */
export function listKnownFieldTypes(): ReadonlyArray<FieldType> {
    return Object.freeze([
        'cnpj',
        'date',
        'integer',
        'decimal',
        'address',
        'document.type',
        'document.reference',
        'client.name',
        'free-text',
        'enum',
        'unknown',
    ] as ReadonlyArray<FieldType>);
}

/**
 * Lista todos os tiers reconhecidos.
 */
export function listKnownTiers(): ReadonlyArray<ConsensusTier> {
    return Object.freeze(['T0', 'T1', 'T2', 'T3', 'T4'] as ReadonlyArray<ConsensusTier>);
}

export const TIER_WEIGHTS_META = Object.freeze({
    moduleId: 'consensus-matrix.tier-weights',
    version: 1,
    defaultWeight: DEFAULT_WEIGHT,
    tiersCount: 5,
    fieldTypesCount: 11,
});
