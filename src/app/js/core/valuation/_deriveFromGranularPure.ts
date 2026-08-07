// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// SPEC_COST_VALUATION_PROVENANCE_CONSOLIDATION — Fase 1 RF4 (claude - executor)
// deriveCostFromGranular — pure-logic com binding obrigatório de proveniência TUPLAx.
//
// Princípio §4.1 do plano doutorado: "integridade ascendente" — todo número
// econômico DEVE ser auditável até o registro granular que o sustenta.
//
// Anti-requisito: rejeita entrada sem trilha TUPLAx (RF4 Won't Have).

import type { TuplaRef, ValuationMethod, ValuationResult } from './_types.js';
import { isKnownValuationMethod } from './_types.js';

/**
 * Registro granular TUPLAx com leitura numérica + unidade.
 * Aceita Number(value) para tolerância a strings (decimal BR/EN coerced).
 */
export interface TuplaRecord {
    recordId: string;
    ponto: string;
    timestamp: string;
    atributo: string;
    value: number | string;
    unit: string;
    /** Custo unitário (BRL por unidade de leitura) — caller fornece se aplicável. */
    unitCostBRL?: number;
}

/** Resultado bruto antes de envelopar como ValuationResult. */
interface RawAggregate {
    total: number;
    refs: TuplaRef[];
    skippedCount: number;
}

/** Erro de input inválido — caller deve tratar. */
export class ValuationProvenanceError extends Error {
    public readonly code: 'EMPTY_RECORDS' | 'INVALID_METHOD' | 'NO_VALID_RECORDS';
    constructor(message: string, code: 'EMPTY_RECORDS' | 'INVALID_METHOD' | 'NO_VALID_RECORDS') {
        super(message);
        this.name = 'ValuationProvenanceError';
        this.code = code;
    }
}

/**
 * Deriva custo total a partir de registros TUPLAx granulares,
 * com binding obrigatório de proveniência.
 *
 * Algoritmo:
 * 1. Filtra registros válidos (numéricos + unitCostBRL finito ≥0).
 * 2. Soma `value * unitCostBRL` por registro válido.
 * 3. Constrói TuplaRef[] preservando ordem de entrada.
 * 4. Envelopa em ValuationResult com method/source.
 *
 * Rejeita:
 * - Array vazio → ValuationProvenanceError('EMPTY_RECORDS').
 * - Método não-string → ValuationProvenanceError('INVALID_METHOD').
 * - Nenhum registro válido (todos skip) → ValuationProvenanceError('NO_VALID_RECORDS').
 *
 * @param records — array de TuplaRecord (≥1 elemento exigido)
 * @param method — método de valoração (ValuationMethod ou string custom)
 * @param source — referência normativa (DOI/ISBN/lei) — default 'unspecified'
 * @returns ValuationResult com value=totalBRL, unit='BRL', provenance=refs
 */
export function deriveCostFromGranular(
    records: ReadonlyArray<TuplaRecord>,
    method: ValuationMethod | string,
    source: string = 'unspecified',
): ValuationResult<number> {
    if (!Array.isArray(records) || records.length === 0) {
        throw new ValuationProvenanceError(
            'deriveCostFromGranular requires ≥1 TuplaRecord (provenance is mandatory)',
            'EMPTY_RECORDS',
        );
    }
    if (typeof method !== 'string' || method.length === 0) {
        throw new ValuationProvenanceError(
            'deriveCostFromGranular requires method:string (got: ' + typeof method + ')',
            'INVALID_METHOD',
        );
    }

    const aggregate = _aggregateRecords(records);
    if (aggregate.refs.length === 0) {
        throw new ValuationProvenanceError(
            'deriveCostFromGranular found no valid TUPLAx records (all ' + records.length + ' rejected)',
            'NO_VALID_RECORDS',
        );
    }

    return {
        value: aggregate.total,
        unit: 'BRL',
        provenance: Object.freeze(aggregate.refs),
        method,
        source: typeof source === 'string' && source.length > 0 ? source : 'unspecified',
    };
}

/**
 * Variante segura — retorna `null` ao invés de throw quando inválido.
 * Útil em pipelines defensivos (UI / batch processing).
 */
export function tryDeriveCostFromGranular(
    records: ReadonlyArray<TuplaRecord>,
    method: ValuationMethod | string,
    source: string = 'unspecified',
): ValuationResult<number> | null {
    try {
        return deriveCostFromGranular(records, method, source);
    } catch (e: any) {
        if (e instanceof ValuationProvenanceError) return null;
        throw e;
    }
}

/**
 * Conta registros válidos sem realizar agregação — útil para preflight UI.
 */
export function countValidRecords(records: ReadonlyArray<TuplaRecord>): number {
    if (!Array.isArray(records)) return 0;
    let n = 0;
    for (const r of records) if (_isValidRecord(r)) n++;
    return n;
}

// ----------------------------------------------------------------------
// Internal helpers (pure)
// ----------------------------------------------------------------------

function _aggregateRecords(records: ReadonlyArray<TuplaRecord>): RawAggregate {
    let total = 0;
    const refs: TuplaRef[] = [];
    let skippedCount = 0;
    for (const r of records) {
        if (!_isValidRecord(r)) {
            skippedCount++;
            continue;
        }
        const v = typeof r.value === 'number' ? r.value : Number(r.value);
        const cost = typeof r.unitCostBRL === 'number' ? r.unitCostBRL : 0;
        total += v * cost;
        refs.push(Object.freeze({
            recordId: String(r.recordId),
            ponto: String(r.ponto),
            timestamp: String(r.timestamp),
            atributo: String(r.atributo),
        }));
    }
    return { total, refs, skippedCount };
}

function _isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function _isFiniteNumeric(value: number | string): boolean {
    return Number.isFinite(typeof value === 'number' ? value : Number(value));
}

function _isValidUnitCost(cost: number | undefined | null): boolean {
    if (cost == null) return true;
    return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0;
}

function _isValidRecord(r: TuplaRecord | undefined | null): r is TuplaRecord {
    if (r == null || typeof r !== 'object') return false;
    return (
        _isNonEmptyString(r.recordId) &&
        _isNonEmptyString(r.ponto) &&
        _isNonEmptyString(r.timestamp) &&
        _isNonEmptyString(r.atributo) &&
        _isFiniteNumeric(r.value) &&
        _isValidUnitCost(r.unitCostBRL)
    );
}

/**
 * Exporta nome do método (string original) para casos onde precise discriminar
 * conhecido vs custom — wrapper sobre isKnownValuationMethod do _types.
 */
export function isStandardMethod(method: string): boolean {
    return isKnownValuationMethod(method);
}
