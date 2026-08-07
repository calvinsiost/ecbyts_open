// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   DAMA DMBOK Data Quality Engine — G12
   Motor de qualidade de dados baseado nas 6 dimensoes DAMA DMBOK
   Referencia: DAMA International, "DAMA-DMBOK: Data Management Body
   of Knowledge", 2nd ed. (2017), ISBN 978-1634622349
   ================================================================ */

/**
 * Seis dimensoes canonicas de qualidade de dados conforme DAMA DMBOK Cap. 13.
 * Six canonical DAMA DMBOK data quality dimensions (Chapter 13).
 */
export const DAMA_DIMENSIONS = Object.freeze({
    COMPLETENESS: 'completeness',
    ACCURACY: 'accuracy',
    CONSISTENCY: 'consistency',
    TIMELINESS: 'timeliness',
    UNIQUENESS: 'uniqueness',
    VALIDITY: 'validity',
});

/**
 * Limiares minimos aceitaveis por dimensao (0-1).
 * Minimum acceptable scores per dimension (0 to 1 scale).
 */
export const DEFAULT_THRESHOLDS = Object.freeze({
    completeness: 0.95,
    accuracy: 0.9,
    consistency: 0.85,
    timeliness: 0.8,
    uniqueness: 0.99,
    validity: 0.9,
});

interface ScoreDimensionOptions {
    fields?: string[];
    field?: string;
    range?: [number, number];
    pattern?: RegExp | string;
    windowMs?: number;
    timestampField?: string;
    validator?: (record: Record<string, any>) => boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Verifica se um valor e considerado "nulo/vazio" para fins de completude.
 * Checks whether a value is considered null/empty for completeness purposes.
 * @param value
 * @returns
 */
import { isEmpty as _isEmpty, clamp01 as _clamp, computeQualityGrade as _computeGradePure } from './_damaPrimitivesPure.js';

// ---------------------------------------------------------------------------
// scoreDimension - pure function
// ---------------------------------------------------------------------------

/**
 * Calcula o score de uma unica dimensao DAMA para um conjunto de registros.
 * Computes the score for a single DAMA dimension over a set of records.
 *
 * @param dimension - One of DAMA_DIMENSIONS values
 * @param records - Array of data records
 * @param options - Dimension-specific configuration
 * @returns Score in [0, 1]
 */
export function scoreDimension(
    dimension: string,
    records: Array<Record<string, any>>,
    options: ScoreDimensionOptions = {},
): number {
    if (!records || records.length === 0) return 1.0;

    const n = records.length;

    switch (dimension) {
        case DAMA_DIMENSIONS.COMPLETENESS: {
            // Fracao de campos nao-nulos/nao-vazios em todos os registros.
            const fields =
                Array.isArray(options.fields) && options.fields.length > 0
                    ? options.fields
                    : Object.keys(records[0] || {});
            if (fields.length === 0) return 1.0;
            let presentCount = 0;
            const total = n * fields.length;
            for (const record of records) {
                for (const field of fields) {
                    if (!_isEmpty(record[field])) presentCount++;
                }
            }
            return _clamp(presentCount / total);
        }

        case DAMA_DIMENSIONS.ACCURACY: {
            // Fracao de valores dentro do intervalo [min, max] especificado.
            if (!options.range) return 1.0;
            const [min, max] = options.range;
            const field = options.field || 'value';
            let inRange = 0;
            for (const record of records) {
                const v = record[field];
                if (typeof v === 'number' && v >= min && v <= max) inRange++;
            }
            return _clamp(inRange / n);
        }

        case DAMA_DIMENSIONS.CONSISTENCY: {
            // Fracao de valores que correspondem ao padrao (regex) fornecido.
            if (!options.pattern) return 1.0;
            const field = options.field || 'value';
            const pattern = options.pattern instanceof RegExp ? options.pattern : new RegExp(options.pattern);
            let matching = 0;
            for (const record of records) {
                const v = record[field];
                if (v !== null && v !== undefined && pattern.test(String(v))) matching++;
            }
            return _clamp(matching / n);
        }

        case DAMA_DIMENSIONS.TIMELINESS: {
            // Fracao de registros com timestamp dentro da janela temporal.
            if (options.windowMs === undefined || options.windowMs === null) return 1.0;
            const tsField = options.timestampField || 'timestamp';
            const now = Date.now();
            const windowMs = Number(options.windowMs);
            let fresh = 0;
            for (const record of records) {
                const ts = record[tsField];
                if (ts === undefined || ts === null) continue;
                const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
                if (!isNaN(t) && now - t <= windowMs) fresh++;
            }
            return _clamp(fresh / n);
        }

        case DAMA_DIMENSIONS.UNIQUENESS: {
            // Fracao de valores unicos para o campo especificado.
            const field = options.field || 'id';
            const values = records.map((r) => r[field]);
            const uniqueCount = new Set(values).size;
            return _clamp(uniqueCount / n);
        }

        case DAMA_DIMENSIONS.VALIDITY: {
            // Fracao de registros que passam na funcao validadora fornecida.
            if (typeof options.validator !== 'function') return 1.0;
            let valid = 0;
            for (const record of records) {
                try {
                    if (options.validator(record)) valid++;
                } catch (e) {
                    console.debug('[damaQualityEngine] validator:', (e as any)?.message || e);
                    // Falha silenciosa: registro invalido conta como invalido.
                    // Silent failure: validator error counts record as invalid.
                }
            }
            return _clamp(valid / n);
        }

        default:
            throw new Error(`[damaQualityEngine] Unknown dimension: "${dimension}"`);
    }
}

// ---------------------------------------------------------------------------
// assessDataQuality - aggregate assessment
// ---------------------------------------------------------------------------

/**
 * Avalia a qualidade de dados em todas as 6 dimensoes DAMA.
 * Assesses data quality across all 6 DAMA dimensions.
 *
 * @param records - Array of data records
 * @param dimensionOptions - Map of dimension -> options (same as scoreDimension)
 * @param thresholds - Override DEFAULT_THRESHOLDS per dimension
 * @returns
 */
export function assessDataQuality(
    records: Array<Record<string, any>>,
    dimensionOptions: Record<string, Record<string, any>> = {},
    thresholds: Record<string, number> = {},
): {
    scores: Record<string, number>;
    overallScore: number;
    thresholdViolations: Array<{ dimension: string; score: number; threshold: number }>;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
} {
    const effectiveThresholds: Record<string, number> = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const scores: Record<string, number> = {};

    for (const dim of Object.values(DAMA_DIMENSIONS)) {
        scores[dim] = scoreDimension(dim, records, dimensionOptions[dim] || {});
    }

    const dimValues = Object.values(scores);
    const overallScore = _clamp(dimValues.reduce((sum, s) => sum + s, 0) / dimValues.length);

    const thresholdViolations: Array<{ dimension: string; score: number; threshold: number }> = [];
    for (const dim of Object.values(DAMA_DIMENSIONS)) {
        const threshold = effectiveThresholds[dim] as number;
        const score = scores[dim] as number;
        if (score < threshold) {
            thresholdViolations.push({ dimension: dim, score, threshold });
        }
    }

    const grade = _computeGrade(overallScore);

    return { scores, overallScore, thresholdViolations, grade };
}

/**
 * Mapeia score numerico para nota de letra A-F.
 * Maps numeric score to letter grade A-F.
 * @param score
 * @returns
 */
function _computeGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    return _computeGradePure(score);
}

// ---------------------------------------------------------------------------
// compareQualitySnapshots - trend analysis
// ---------------------------------------------------------------------------

/**
 * Compara dois snapshots de qualidade e identifica melhorias/degradacoes.
 * Compares two quality snapshots and identifies improvements/degradations.
 *
 * @param before - Previous assessDataQuality() result (or {scores})
 * @param after  - Current assessDataQuality() result (or {scores})
 * @returns
 */
export function compareQualitySnapshots(
    before: { scores?: Record<string, number> } & Record<string, any>,
    after: { scores?: Record<string, number> } & Record<string, any>,
): {
    improved: string[];
    degraded: string[];
    unchanged: string[];
    delta: Record<string, number>;
} {
    const improved: string[] = [];
    const degraded: string[] = [];
    const unchanged: string[] = [];
    const delta: Record<string, number> = {};

    const beforeScores: Record<string, number> = before.scores || before;
    const afterScores: Record<string, number> = after.scores || after;

    for (const dim of Object.values(DAMA_DIMENSIONS)) {
        const bScore = typeof beforeScores[dim] === 'number' ? (beforeScores[dim] as number) : 0;
        const aScore = typeof afterScores[dim] === 'number' ? (afterScores[dim] as number) : 0;
        const diff = aScore - bScore;
        delta[dim] = diff;

        // Tolerancia de 0.001 para evitar falsos positivos de ponto flutuante.
        // Tolerance of 0.001 to avoid floating-point false positives.
        if (diff > 0.001) improved.push(dim);
        else if (diff < -0.001) degraded.push(dim);
        else unchanged.push(dim);
    }

    return { improved, degraded, unchanged, delta };
}
