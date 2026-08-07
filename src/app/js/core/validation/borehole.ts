// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   BOREHOLE VALIDATION — Validacao de dados de sondagem (AGS4-like)
   ================================================================
   Modulo puro de validacao para dados de sondagens ambientais.
   Valida JSON de boreholes (collar, intervalos litologicos, pontos).
   Padrao fail-fast: aborta no primeiro erro com mensagem descritiva.

   REGRAS DE NEGOCIO:
   1. Collar: hole_id (string), x/y/z (floats), total_depth > 0
   2. Intervals: ordenados por 'from', sem gaps, sem sobreposicoes,
      primeiro comeca em 0, ultimo termina em total_depth
   3. Points: profundidade entre 0 e total_depth, data ISO-8601

   Premissa: validar a topologia 1D rigorosamente no input evita
   corrupcao das malhas de interpolacao e modelos 3D downstream.
   ================================================================ */

/** Tolerance for floating-point boundary comparisons */
const EPSILON = 1e-6;

/** ISO-8601 date pattern (YYYY-MM-DD) */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ----------------------------------------------------------------
// INTERNAL VALIDATORS
// ----------------------------------------------------------------

/**
 * Validate collar (borehole header data).
 * Valida o cabecalho do furo - identificacao, coordenadas e profundidade.
 *
 * @param collar - Collar object
 * @returns Array of error messages (empty = valid)
 */
function _validateCollar(collar: any): string[] {
    const errors: string[] = [];
    if (!collar || typeof collar !== 'object') {
        errors.push('Borehole: collar object is missing');
        return errors;
    }

    const id = collar.hole_id;

    // hole_id: non-empty string
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
        errors.push('Borehole: Missing or empty hole_id');
        return errors;
    }

    // coordinates: x, y, z must be finite numbers
    const coords = collar.coordinates;
    if (!coords || typeof coords !== 'object') {
        errors.push(`Erro no furo ${id}: coordinates object is missing`);
        return errors;
    }
    if (!Number.isFinite(coords.x) || !Number.isFinite(coords.y) || !Number.isFinite(coords.z)) {
        errors.push(`Erro no furo ${id}: Coordenadas (x, y, z) devem ser números válidos`);
        return errors;
    }

    // total_depth: strictly positive
    if (!Number.isFinite(collar.total_depth) || collar.total_depth <= 0) {
        errors.push(
            `Erro no furo ${id}: total_depth deve ser estritamente positivo (> 0), recebido: ${collar.total_depth}`,
        );
        return errors;
    }

    return errors;
}

/**
 * Validate lithology intervals.
 * Valida intervalos litologicos - ordenacao, continuidade, limites.
 *
 * @param intervals - Array of interval objects
 * @param totalDepth - Total borehole depth from collar
 * @param holeId - Borehole identifier for error messages
 * @returns Array of error messages (empty = valid)
 */
function _validateIntervals(intervals: any[], totalDepth: number, holeId: string): string[] {
    const errors: string[] = [];

    // Must be non-empty array
    if (!Array.isArray(intervals) || intervals.length === 0) {
        errors.push(`Erro no furo ${holeId}: Pelo menos um intervalo litológico é obrigatório`);
        return errors;
    }

    // Validate each interval has numeric from/to
    for (let i = 0; i < intervals.length; i++) {
        const iv = intervals[i];
        if (!Number.isFinite(iv.from) || !Number.isFinite(iv.to)) {
            errors.push(
                `Erro no furo ${holeId}: Intervalo ${i + 1} tem profundidades inválidas (from=${iv.from}, to=${iv.to})`,
            );
            return errors;
        }
    }

    // Sort by 'from' before structural validation
    // Ordena por profundidade inicial antes das validacoes subsequentes
    const sorted = [...intervals].sort((a, b) => a.from - b.from);

    // Rule: from < to for each interval
    for (let i = 0; i < sorted.length; i++) {
        const iv = sorted[i];
        if (iv.from >= iv.to) {
            errors.push(
                `Erro no furo ${holeId}: Intervalo ${i + 1} — 'from' (${iv.from}m) deve ser menor que 'to' (${iv.to}m)`,
            );
            return errors;
        }
    }

    // Rule: first interval starts at 0
    if (Math.abs(sorted[0].from) > EPSILON) {
        errors.push(`Erro no furo ${holeId}: Primeiro intervalo deve começar em 0m (encontrado: ${sorted[0].from}m)`);
        return errors;
    }

    // Rule: no gaps, no overlaps (continuity check)
    // Verifica continuidade - o 'to' de um intervalo deve ser igual ao 'from' do proximo
    for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        const diff = curr.to - next.from;

        if (diff < -EPSILON) {
            // Gap detected
            errors.push(`Erro no furo ${holeId}: Gap detectado entre ${curr.to}m e ${next.from}m`);
            return errors;
        }
        if (diff > EPSILON) {
            // Overlap detected
            errors.push(
                `Erro no furo ${holeId}: Sobreposição detectada entre intervalos em ${curr.to}m (intervalo ${i + 1} termina em ${curr.to}m, intervalo ${i + 2} começa em ${next.from}m)`,
            );
            return errors;
        }
    }

    // Rule: no interval exceeds total_depth
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].to > totalDepth + EPSILON) {
            errors.push(
                `Erro no furo ${holeId}: Intervalo ${i + 1} — 'to' (${sorted[i].to}m) excede total_depth (${totalDepth}m)`,
            );
            return errors;
        }
    }

    // Rule: last interval ends exactly at total_depth
    const lastTo = sorted[sorted.length - 1].to;
    if (Math.abs(lastTo - totalDepth) > EPSILON) {
        errors.push(`Erro no furo ${holeId}: Último intervalo termina em ${lastTo}m, mas total_depth é ${totalDepth}m`);
        return errors;
    }

    return errors;
}

/**
 * Validate point depth.
 * @returns Error message or null if valid.
 */
function _validatePointDepth(pt: any, index: number, totalDepth: number, holeId: string): string | null {
    if (!Number.isFinite(pt.depth)) {
        return `Erro no furo ${holeId}: Ponto ${index + 1} — profundidade inválida (${pt.depth})`;
    }
    if (pt.depth < -EPSILON || pt.depth > totalDepth + EPSILON) {
        return `Erro no furo ${holeId}: Ponto de água (${pt.depth}m) excede total_depth (${totalDepth}m)`;
    }
    return null;
}

/**
 * Validate point date format and actual calendar value.
 * @returns Error message or null if valid.
 */
function _validatePointDate(pt: any, index: number, holeId: string): string | null {
    if (pt.date === undefined || pt.date === null) return null;

    if (typeof pt.date !== 'string' || !ISO_DATE_RE.test(pt.date)) {
        return `Erro no furo ${holeId}: Ponto ${index + 1} — data '${pt.date}' não segue formato ISO-8601 (YYYY-MM-DD)`;
    }

    // Validate actual date value (catches 2026-02-30, etc.)
    // JS Date is lenient - Feb 30 becomes Mar 2. Verify round-trip.
    const [yr, mo, dy] = pt.date.split('-').map(Number);
    const parsed = new Date(Date.UTC(yr, mo - 1, dy));
    if (
        isNaN(parsed.getTime()) ||
        parsed.getUTCFullYear() !== yr ||
        parsed.getUTCMonth() !== mo - 1 ||
        parsed.getUTCDate() !== dy
    ) {
        return `Erro no furo ${holeId}: Ponto ${index + 1} — data '${pt.date}' é inválida`;
    }

    return null;
}

/**
 * Validate water level and other point measurements.
 * Valida pontos de medicao (nivel d'agua, etc) - profundidade e data.
 *
 * @param points - Array of point objects (optional)
 * @param totalDepth - Total borehole depth from collar
 * @param holeId - Borehole identifier for error messages
 * @returns Array of error messages (empty = valid)
 */
function _validatePoints(points: any[] | undefined | null, totalDepth: number, holeId: string): string[] {
    // Points are optional - undefined or empty array is valid
    if (points === undefined || points === null) return [];
    if (!Array.isArray(points)) {
        return [`Erro no furo ${holeId}: 'points' deve ser um array`];
    }
    if (points.length === 0) return [];

    for (let i = 0; i < points.length; i++) {
        const pt = points[i];

        const depthError = _validatePointDepth(pt, i, totalDepth, holeId);
        if (depthError) return [depthError];

        const dateError = _validatePointDate(pt, i, holeId);
        if (dateError) return [dateError];
    }

    return [];
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Validate a single borehole JSON object.
 * Valida um JSON de sondagem completo (collar + intervalos + pontos).
 * Fail-fast: retorna no primeiro erro encontrado.
 *
 * @param json - Borehole JSON (must have a `borehole` root key)
 *
 * @example
 * const result = validateBorehole({
 *   borehole: {
 *     collar: { hole_id: "BH-01", coordinates: {x:100,y:200,z:50}, total_depth: 15 },
 *     intervals: [
 *       { from: 0, to: 2.5, desc: "Aterro", class: "SUCS-SM" },
 *       { from: 2.5, to: 15, desc: "Argila siltosa", class: "SUCS-CL" }
 *     ],
 *     points: [{ type: "water_level", depth: 4.2, date: "2026-02-18" }]
 *   }
 * });
 * // result.valid === true, result.data contains normalized borehole
 */
export function validateBorehole(json: any): { valid: boolean; data?: any; errors?: string[] } {
    // Root structure check
    if (!json || typeof json !== 'object') {
        return { valid: false, errors: ['Input deve ser um objeto JSON válido'] };
    }
    if (!json.borehole || typeof json.borehole !== 'object') {
        return { valid: false, errors: ['Input JSON deve conter propriedade "borehole"'] };
    }

    const { collar, intervals, points } = json.borehole;
    const holeId = collar?.hole_id || 'UNKNOWN';

    // 1. Validate collar (fail-fast)
    const collarErrors = _validateCollar(collar);
    if (collarErrors.length > 0) {
        return { valid: false, errors: collarErrors };
    }

    // 2. Validate intervals (fail-fast)
    const intervalErrors = _validateIntervals(intervals, collar.total_depth, holeId);
    if (intervalErrors.length > 0) {
        return { valid: false, errors: intervalErrors };
    }

    // 3. Validate points - optional (fail-fast)
    const pointErrors = _validatePoints(points, collar.total_depth, holeId);
    if (pointErrors.length > 0) {
        return { valid: false, errors: pointErrors };
    }

    // All valid - return sorted intervals and normalized data
    const sortedIntervals = [...intervals].sort((a, b) => a.from - b.from);

    return {
        valid: true,
        data: {
            collar: {
                hole_id: collar.hole_id,
                coordinates: { ...collar.coordinates },
                total_depth: collar.total_depth,
            },
            intervals: sortedIntervals.map((iv) => ({
                from: iv.from,
                to: iv.to,
                description: iv.desc || iv.description || '',
                classification: iv.class || iv.classification || '',
            })),
            points: (points || []).map((pt: any) => ({
                type: pt.type || 'water_level',
                depth: pt.depth,
                date: pt.date || null,
            })),
        },
    };
}

/**
 * Validate a batch of boreholes.
 * Valida multiplos furos de uma vez, com deteccao de IDs duplicados.
 *
 * @param boreholes - Array of borehole JSON objects (each with `borehole` key)
 */
export function validateBoreholes(boreholes: any[]): {
    valid: boolean;
    results: any[];
    duplicates?: string[];
    errors?: string[];
} {
    if (!Array.isArray(boreholes) || boreholes.length === 0) {
        return {
            valid: false,
            results: [{ valid: false, errors: ['Input deve ser um array não-vazio de boreholes'] }],
        };
    }

    const results: { valid: boolean; data?: any; errors?: string[] }[] = [];
    const seenIds: Set<string> = new Set();
    const duplicates: string[] = [];

    for (const bh of boreholes) {
        const result = validateBorehole(bh);
        results.push(result);

        // Check for duplicate hole_id
        if (result.valid) {
            const id = result.data.collar.hole_id;
            if (seenIds.has(id)) {
                duplicates.push(id);
            }
            seenIds.add(id);
        }
    }

    const allValid = results.every((r) => r.valid) && duplicates.length === 0;

    const output: { valid: boolean; results: any[]; duplicates?: string[]; errors?: string[] } = {
        valid: allValid,
        results,
    };
    if (duplicates.length > 0) {
        output.valid = false;
        output.duplicates = duplicates;
        output.errors = duplicates.map((id) => `Erro: hole_id duplicado — "${id}"`);
    }

    return output;
}

/**
 * Normalize validated borehole data into well element structure.
 * Converte dados validados de sondagem para o formato de elemento 'well'.
 *
 * Mapeamento de coordenadas:
 *   collar.coordinates.x → easting
 *   collar.coordinates.y → northing
 *   collar.coordinates.z → elevation
 *
 * @param validatedData - Output from validateBorehole().data
 * @returns Well-compatible data object for addElement('well', ...)
 */
export function normalizeBoreholeToWell(validatedData: { collar: any; intervals: any[]; points: any[] }): object {
    const { collar, intervals, points } = validatedData;

    return {
        coordinates: {
            easting: collar.coordinates.x,
            northing: collar.coordinates.y,
            elevation: collar.coordinates.z,
        },
        construction: {
            totalDepth: collar.total_depth,
            diameter: 4, // default diameter (inches) — sondagens tipicamente nao especificam
        },
        lithology: intervals.map((iv) => ({
            from: iv.from,
            to: iv.to,
            description: iv.description,
            classification: iv.classification,
            unit: null,
            aquifer: null,
            formation: null,
        })),
        waterLevels: points.map((pt) => ({
            depth: pt.depth,
            date: pt.date,
            type: pt.type,
        })),
    };
}
