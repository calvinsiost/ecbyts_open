// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { parseCsvRow as _parseCsvRow } from '../../utils/helpers/csvRowParser.js';

/* ================================================================
   HEALTH-MON-001 Phase 4 — CSV Export/Import para Saúde Ocupacional

   Exporta e importa leituras de biomarcadores e registros de
   trabalhadores no formato CSV compatível com planilhas comuns.

   Colunas de readings:  workerId, biomarker, value, unit, timestamp, sampleMatrix
   Colunas de workers:   id, name, role, exposureGroup, createdAt

   Lógica pura — sem DOM, sem IDB, sem rede.
   Coberto por tests/health-idb-csv-export.test.mjs.
   ================================================================ */

// ----------------------------------------------------------------
// CSV helpers
// ----------------------------------------------------------------

/**
 * Escapa um valor para uso seguro em CSV.
 * Envolve em aspas duplas se contiver vírgula, aspas ou nova linha.
 * Aspas internas são duplicadas conforme RFC 4180.
 */
function _escapeCSV(value: unknown): string {
    const str = value == null ? '' : String(value);
    // Necessita aspas se contiver vírgula, aspas ou quebra de linha
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

/**
 * Monta uma linha CSV a partir de um array de valores.
 */
function _csvRow(fields: unknown[]): string {
    return fields.map(_escapeCSV).join(',');
}

/**
 * Analisa uma linha CSV simples com suporte a aspas duplas (RFC 4180).
 */
function _parseCSVLine(line: string): string[] {
    return _parseCsvRow(line, ',');
}

// ----------------------------------------------------------------
// exportReadingsCSV
// ----------------------------------------------------------------

/** Cabeçalho canônico das colunas de readings. */
const READINGS_HEADER = ['workerId', 'biomarker', 'value', 'unit', 'timestamp', 'sampleMatrix'];

/**
 * Exporta array de leituras de biomarcadores para string CSV.
 * Inclui cabeçalho na primeira linha.
 *
 * Mapeamento de campos:
 *   workerId    ← reading.workerPseudonym (campo de privacidade LGPD)
 *   biomarker   ← reading.biomarkerType
 *   value       ← reading.value
 *   unit        ← reading.unit
 *   timestamp   ← reading.sampleDate ou reading.createdAt
 *   sampleMatrix← reading.sampleMatrix
 *
 * @param readings - array de ReadingObjects
 * @returns CSV completo com cabeçalho + linhas
 */
export function exportReadingsCSV(readings: Array<Record<string, unknown>>): string {
    if (!Array.isArray(readings)) {
        return READINGS_HEADER.join(',') + '\n';
    }

    const lines = [READINGS_HEADER.join(',')];

    for (const r of readings) {
        if (!r || typeof r !== 'object') continue;
        const rec = r as Record<string, unknown>;
        lines.push(
            _csvRow([
                rec.workerPseudonym ?? rec.workerId ?? '',
                rec.biomarkerType ?? rec.biomarker ?? '',
                rec.value ?? '',
                rec.unit ?? '',
                rec.sampleDate ?? rec.timestamp ?? rec.createdAt ?? '',
                rec.sampleMatrix ?? '',
            ]),
        );
    }

    return lines.join('\n') + '\n';
}

// ----------------------------------------------------------------
// exportWorkersCSV
// ----------------------------------------------------------------

/** Cabeçalho canônico das colunas de workers. */
const WORKERS_HEADER = ['id', 'name', 'role', 'exposureGroup', 'createdAt'];

/**
 * Exporta array de trabalhadores para string CSV.
 * Inclui cabeçalho na primeira linha.
 *
 * @param workers - array de WorkerRecord objects
 * @returns CSV completo com cabeçalho + linhas
 */
export function exportWorkersCSV(workers: Array<Record<string, unknown>>): string {
    if (!Array.isArray(workers)) {
        return WORKERS_HEADER.join(',') + '\n';
    }

    const lines = [WORKERS_HEADER.join(',')];

    for (const w of workers) {
        if (!w || typeof w !== 'object') continue;
        const wr = w as Record<string, unknown>;
        lines.push(_csvRow([wr.id ?? '', wr.name ?? '', wr.role ?? '', wr.exposureGroup ?? '', wr.createdAt ?? '']));
    }

    return lines.join('\n') + '\n';
}

// ----------------------------------------------------------------
// parseReadingsCSV
// ----------------------------------------------------------------

/**
 * Analisa uma string CSV de leituras de biomarcadores.
 * Inverso de exportReadingsCSV.
 *
 * Colunas esperadas (primeira linha como cabeçalho):
 *   workerId, biomarker, value, unit, timestamp, sampleMatrix
 *
 * Linhas com campos obrigatórios ausentes são ignoradas silenciosamente.
 * value é convertido para Number; NaN produz NaN no campo (caller decide).
 *
 * @returns array de objetos com campos mapeados
 */
export function parseReadingsCSV(csvString: string): Array<{
    workerId: string;
    biomarker: string;
    value: number;
    unit: string;
    timestamp: string;
    sampleMatrix: string;
}> {
    if (!csvString || typeof csvString !== 'string') return [];

    const lines = csvString.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return []; // só cabeçalho ou vazio

    const header = _parseCSVLine(lines[0] as string);
    const idxWorkerId = header.indexOf('workerId');
    const idxBiomarker = header.indexOf('biomarker');
    const idxValue = header.indexOf('value');
    const idxUnit = header.indexOf('unit');
    const idxTimestamp = header.indexOf('timestamp');
    const idxMatrix = header.indexOf('sampleMatrix');

    const results: Array<{
        workerId: string;
        biomarker: string;
        value: number;
        unit: string;
        timestamp: string;
        sampleMatrix: string;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
        const cells = _parseCSVLine(lines[i] as string);
        const get = (idx: number): string => (idx >= 0 ? (cells[idx] ?? '').trim() : '');

        const workerId = get(idxWorkerId);
        const biomarker = get(idxBiomarker);
        const valueStr = get(idxValue);
        const unit = get(idxUnit);
        const timestamp = get(idxTimestamp);
        const sampleMatrix = get(idxMatrix);

        // Ignorar linhas completamente vazias
        if (!workerId && !biomarker && !valueStr) continue;

        results.push({
            workerId,
            biomarker,
            value: Number(valueStr),
            unit,
            timestamp,
            sampleMatrix,
        });
    }

    return results;
}
