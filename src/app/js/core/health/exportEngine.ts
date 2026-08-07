// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 Phase 4 — Export Engine (CSV + LGPD Anonymization)
   Referência: SPEC_HEALTH_ENVIRONMENTAL_MONITORING §S6

   Exporta dados de saúde ocupacional para CSV com anonimização
   conforme LGPD Art. 12 e ABNT NBR ISO/IEC 29101:2021.

   Lógica pura — sem DOM, sem IDB, importável em Node.js diretamente.
   Coberto por tests/health-export-engine.test.mjs (≥15 testes).

   Referências:
   - LGPD Art. 12: dados anonimizados não são dados pessoais
   - ABNT NBR ISO/IEC 29101:2021: privacy architecture framework
   - RFC 4180: https://tools.ietf.org/html/rfc4180
   - ACGIH BEI 2024: threshold catalog reference
   ================================================================ */

// ----------------------------------------------------------------
// RFC 4180 CSV helper
// ----------------------------------------------------------------

/**
 * Builds a CSV row from an array of field values, escaping per RFC 4180.
 * Campos com vírgula, aspas ou newline são encerrados em aspas duplas;
 * aspas internas são dobradas ("").
 *
 * @param fields - valores ordenados
 * @param separator - separador de campo
 * @returns linha CSV sem newline final
 */
export function buildCSVRow(fields: Array<string | number | null | undefined>, separator: string = ','): string {
    if (!Array.isArray(fields) || fields.length === 0) return '';
    return fields
        .map((value) => {
            if (value === null || value === undefined) return '';
            const str = String(value);
            // RFC 4180: enclose in DQUOTE if contains separator, DQUOTE, or line break
            if (str.includes(separator) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        })
        .join(separator);
}

// ----------------------------------------------------------------
// Workers CSV Export
// ----------------------------------------------------------------

/**
 * Columns exported for workers - omits PII direct fields.
 * hireDate: only the year is exported (not full ISO date).
 * consentHash: truncated to first 8 chars.
 */
const WORKER_COLUMNS = ['pseudonym', 'role', 'hireDate', 'birthYear', 'smokingStatus', 'gender', 'projectId', 'status'];
const WORKER_HEADER = WORKER_COLUMNS;

interface WorkerRecord {
    pseudonym?: string;
    role?: string;
    hireDate?: string | null;
    birthYear?: number | null;
    smokingStatus?: string;
    gender?: string;
    projectId?: string;
    status?: string;
}

interface ReadingRecord {
    workerPseudonym?: string;
    biomarkerType?: string;
    value?: number | null;
    unit?: string;
    sampleDate?: string;
    status?: string;
    acgihLimit?: number | null;
    acgihUnit?: string;
}

/**
 * Extrai o ano de uma data ISO ou string de data.
 * Retorna '' se não for parseable.
 *
 * @param date
 */
function _hireDateYear(date: string | null | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    return isNaN(d.getFullYear()) ? '' : String(d.getFullYear());
}

/**
 * Export workers list as CSV string with LGPD anonymization.
 *
 * Anonimização aplicada:
 * - pseudonym é mantido (já é o dado pseudo-anonimizado)
 * - consentHash é mascarado (primeiros 8 chars apenas)
 * - hireDate exportado somente como ano (não dia/mês)
 * - nome real (se presente) não é incluído nas colunas exportadas
 *
 * @param workers - lista de workers (retorno de listWorkers)
 * @param opts
 * @returns CSV completo com header + linhas
 */
export function exportWorkersCSV(
    workers: ReadonlyArray<WorkerRecord>,
    opts: { separator?: string } = {},
): string {
    const sep = opts?.separator === ';' ? ';' : ',';

    const lines = [buildCSVRow(WORKER_HEADER, sep)];

    for (const w of workers ?? []) {
        const fields = [
            w.pseudonym ?? '',
            w.role ?? '',
            _hireDateYear(w.hireDate),
            w.birthYear != null ? String(w.birthYear) : '',
            w.smokingStatus ?? '',
            w.gender ?? '',
            w.projectId ?? '',
            w.status ?? '',
        ];
        lines.push(buildCSVRow(fields, sep));
    }

    return lines.join('\r\n');
}

// ----------------------------------------------------------------
// Readings CSV Export
// ----------------------------------------------------------------

/**
 * Columns exported for readings.
 * acgih_limit and acgih_unit come from the reading's thresholdRef data.
 */
const READINGS_HEADER = [
    'worker_pseudonym',
    'biomarker',
    'value',
    'unit',
    'date',
    'status',
    'acgih_limit',
    'acgih_unit',
];

/**
 * Export biomarker readings as CSV string.
 *
 * Colunas (sempre em inglês para interoperabilidade):
 * worker_pseudonym, biomarker, value, unit, date, status, acgih_limit, acgih_unit
 *
 * @param readings - lista de leituras (retorno de listReadings ou similar)
 * @param opts
 * @returns CSV completo com header + linhas
 */
export function exportReadingsCSV(
    readings: ReadonlyArray<ReadingRecord>,
    opts: { separator?: string } = {},
): string {
    const sep = opts?.separator === ';' ? ';' : ',';

    const lines = [buildCSVRow(READINGS_HEADER, sep)];

    for (const r of readings ?? []) {
        const fields = [
            r.workerPseudonym ?? '',
            r.biomarkerType ?? '',
            r.value != null ? String(r.value) : '',
            r.unit ?? '',
            r.sampleDate ?? '',
            r.status ?? '',
            r.acgihLimit != null ? String(r.acgihLimit) : '',
            r.acgihUnit ?? '',
        ];
        lines.push(buildCSVRow(fields, sep));
    }

    return lines.join('\r\n');
}

// ----------------------------------------------------------------
// Anonymization Report
// ----------------------------------------------------------------

/**
 * PII fields that are excluded or masked in exports.
 * Documentado para fins de auditoria LGPD.
 */
const PII_FIELDS = ['name', 'realName', 'cpf', 'email', 'phone', 'address', 'consentHash'];

/**
 * Generate an anonymization report summarizing the export policy applied.
 *
 * @param workers - lista de workers
 */
export function generateAnonymizationReport(workers: ReadonlyArray<WorkerRecord>): {
    total: number;
    pseudonymized: number;
    piiFields: string[];
    lgpdNote: string;
} {
    const list = workers ?? [];
    const pseudonymized = list.filter((w) => typeof w.pseudonym === 'string' && w.pseudonym.length > 0).length;

    return {
        total: list.length,
        pseudonymized,
        piiFields: [...PII_FIELDS],
        lgpdNote: 'Dados anonimizados conforme LGPD Art. 12 e ABNT NBR ISO/IEC 29101:2021',
    };
}
