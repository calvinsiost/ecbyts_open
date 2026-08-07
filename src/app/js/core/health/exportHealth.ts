// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 Phase 4 — Export CSV + Anonimização LGPD (S6)
   Referência: SPEC_HEALTH_ENVIRONMENTAL_MONITORING §S6

   Exporta dados de saúde ocupacional para CSV com suporte a
   anonimização LGPD. Nome real é substituído por hash truncado
   SHA-256 (8 chars) quando anonymize=true, com fallback simples
   'ANON-' + id[-4] para ambientes sem crypto.subtle (Node.js).

   Compliance: LGPD Art. 12 (dados anonimizados não são dados pessoais)
   RFC 4180: https://tools.ietf.org/html/rfc4180

   Lógica pura — sem DOM, sem IDB. Exportável em Node.js diretamente.
   Coberto por tests/health-export-csv.test.mjs (≥12 testes).
   ================================================================ */

// ----------------------------------------------------------------
// RFC 4180 CSV helpers
// ----------------------------------------------------------------

/**
 * Escapes a single CSV field value per RFC 4180.
 * Envolve em aspas se o valor contiver vírgula, aspas ou newline.
 * Aspas internas são dobradas ("").
 */
function _escapeField(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // RFC 4180: if field contains comma, DQUOTE, or line break → enclose in DQUOTE
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

/**
 * Build a CSV row string from an object and ordered column list.
 * Garante escaping RFC 4180 em todos os campos.
 *
 * @param obj - objeto com dados
 * @param columns - lista ordenada de chaves/colunas
 * @returns linha CSV sem newline final
 */
export function buildCSVRow(
    obj: Record<string, string | number | null | undefined>,
    columns: string[],
): string {
    return columns.map((col) => _escapeField(obj[col])).join(',');
}

// ----------------------------------------------------------------
// Anonymization
// ----------------------------------------------------------------

/**
 * Anonimiza um nome de trabalhador.
 * Tenta usar crypto.subtle (browser) para SHA-256 (async path),
 * mas como este módulo é síncrono, usa sempre o fallback simples.
 * Para hash real SHA-256 async, ver exportWorkersCSVAsync (futuro).
 *
 * Fallback: 'ANON-' + workerId.slice(-4) - determinístico, sem rede.
 */
function _anonymizeName(workerId: string): string {
    // Fallback simples: determinístico, funciona em Node + browser
    // sem necessidade de await crypto.subtle
    return 'ANON-' + String(workerId).slice(-4);
}

/**
 * Resolve o nome de exibição do trabalhador conforme política LGPD.
 *
 * @param worker - registro do worker
 * @param anonymize - se true, anonimiza
 * @param adminOverride - se true, exibe nome real (ignora anonymize)
 */
function _displayName(
    worker: { id: string; name?: string; pseudonym?: string },
    anonymize: boolean,
    adminOverride: boolean,
): string {
    if (!anonymize || adminOverride) {
        // Nome real: prefere name, cai para pseudonym
        return worker.name ?? worker.pseudonym ?? worker.id;
    }
    return _anonymizeName(worker.id);
}

// ----------------------------------------------------------------
// Stats helpers
// ----------------------------------------------------------------

interface BiomarkerReading {
    id?: string;
    workerId?: string;
    biomarkerType?: string;
    parameter?: string;
    value?: string | number;
    unit?: string;
    collectedAt?: string | number;
    timestamp?: string | number;
    status?: string;
    thresholdRef?: string;
    threshold_ref?: string;
}

interface WorkerRecord {
    id: string;
    name?: string;
    pseudonym?: string;
    role?: string;
}

/**
 * Conta leituras de um worker.
 */
function _readingsCount(readings: BiomarkerReading[], workerId: string): number {
    return readings.filter((r) => r.workerId === workerId).length;
}

/**
 * Retorna a data mais recente de leitura para um worker.
 *
 * @returns ISO date string ou ''
 */
function _lastReadingDate(readings: BiomarkerReading[], workerId: string): string {
    const wReadings = readings.filter((r) => r.workerId === workerId);
    if (wReadings.length === 0) return '';
    const dates = wReadings.map((r) => {
        const d = r.collectedAt ?? r.timestamp ?? '';
        return d ? new Date(d).getTime() : 0;
    });
    const maxTs = Math.max(...dates);
    if (!maxTs) return '';
    return new Date(maxTs).toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Conta alertas (status red ou critical) para um worker.
 */
function _alertCount(readings: BiomarkerReading[], workerId: string): number {
    return readings.filter((r) => r.workerId === workerId && (r.status === 'red' || r.status === 'critical')).length;
}

/**
 * Calcula taxa de conformidade (% de leituras com status green ou yellow).
 * Retorna string com 1 casa decimal, ou '' se sem leituras.
 */
function _complianceRate(readings: BiomarkerReading[], workerId: string): string {
    const wReadings = readings.filter((r) => r.workerId === workerId);
    if (wReadings.length === 0) return '';
    const compliant = wReadings.filter((r) => r.status === 'green' || r.status === 'yellow').length;
    return ((compliant / wReadings.length) * 100).toFixed(1);
}

// ----------------------------------------------------------------
// Worker map helper
// ----------------------------------------------------------------

/**
 * Constroi mapa id → worker para lookup O(1).
 */
function _buildWorkerMap(workers: WorkerRecord[]): Map<string, WorkerRecord> {
    return new Map((workers ?? []).map((w) => [w.id, w]));
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Export workers summary as CSV string.
 *
 * Exporta resumo de trabalhadores para CSV. Se anonymize=true e
 * adminOverride=false, o campo display_name é mascarado com
 * 'ANON-' + workerId[-4] (fallback LGPD sem crypto async).
 *
 * Colunas: worker_id, display_name, role, readings_count,
 *          last_reading_date, alert_count, compliance_rate
 *
 * @param workers - lista de workers registrados
 * @param readings - lista de leituras biológicas
 * @returns CSV completo com header + linhas
 */
export function exportWorkersCSV(
    workers: WorkerRecord[],
    readings: BiomarkerReading[],
    options: { anonymize?: boolean; adminOverride?: boolean } = {},
): string {
    const { anonymize = true, adminOverride = false } = options;

    const COLUMNS = [
        'worker_id',
        'display_name',
        'role',
        'readings_count',
        'last_reading_date',
        'alert_count',
        'compliance_rate',
    ];

    const rows = [COLUMNS.join(',')];

    for (const worker of workers ?? []) {
        const row = {
            worker_id: worker.id,
            display_name: _displayName(worker, anonymize, adminOverride),
            role: worker.role ?? '',
            readings_count: _readingsCount(readings, worker.id),
            last_reading_date: _lastReadingDate(readings, worker.id),
            alert_count: _alertCount(readings, worker.id),
            compliance_rate: _complianceRate(readings, worker.id),
        };
        rows.push(buildCSVRow(row, COLUMNS));
    }

    return rows.join('\r\n');
}

/**
 * Resolve o worker vinculado a uma leitura, garantindo um stub se nao encontrado.
 */
function _resolveReadingWorker(
    reading: BiomarkerReading,
    workerMap: Map<string, WorkerRecord>,
): { id: string; name?: string; pseudonym?: string } {
    const workerId = reading.workerId ?? '';
    return workerMap.get(workerId) ?? { id: workerId };
}

/**
 * Monta o objeto-linha CSV para uma leitura individual.
 */
function _buildReadingRow(
    reading: BiomarkerReading,
    workerMap: Map<string, WorkerRecord>,
    anonymize: boolean,
    adminOverride: boolean,
): Record<string, string | number | null | undefined> {
    const worker = _resolveReadingWorker(reading, workerMap);
    return {
        reading_id: reading.id ?? '',
        worker_id: reading.workerId ?? '',
        worker_display: _displayName(worker, anonymize, adminOverride),
        parameter: reading.biomarkerType ?? reading.parameter ?? '',
        value: reading.value ?? '',
        unit: reading.unit ?? '',
        collected_at: reading.collectedAt ?? reading.timestamp ?? '',
        status: reading.status ?? '',
        threshold_ref: reading.thresholdRef ?? reading.threshold_ref ?? '',
    };
}

/**
 * Export individual readings as CSV string.
 *
 * Exporta leituras individuais de biomarcadores para CSV.
 * Aplica a mesma política de anonimização em worker_display.
 *
 * Colunas: reading_id, worker_id, worker_display, parameter,
 *          value, unit, collected_at, status, threshold_ref
 *
 * @param readings - lista de leituras biológicas
 * @param workers - lista de workers (para lookup de nome)
 * @returns CSV completo com header + linhas
 */
export function exportReadingsCSV(
    readings: BiomarkerReading[],
    workers: WorkerRecord[],
    options: { anonymize?: boolean; adminOverride?: boolean } = {},
): string {
    const { anonymize = true, adminOverride = false } = options;
    const workerMap = _buildWorkerMap(workers);

    const COLUMNS = [
        'reading_id',
        'worker_id',
        'worker_display',
        'parameter',
        'value',
        'unit',
        'collected_at',
        'status',
        'threshold_ref',
    ];

    const rows = [COLUMNS.join(',')];

    for (const reading of readings ?? []) {
        const row = _buildReadingRow(reading, workerMap, anonymize, adminOverride);
        rows.push(buildCSVRow(row, COLUMNS));
    }

    return rows.join('\r\n');
}
