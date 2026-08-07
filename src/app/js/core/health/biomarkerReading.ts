// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 Phase 2a — Biomarker Reading: criação, parsing CSV,
   normalização de unidades e agrupamentos.

   Referência: SPEC_HEALTH_ENVIRONMENTAL_MONITORING §S2
   Algoritmos de conversão de unidades:
     - ACGIH BEI 2024 Technical Reference (ISBN 978-1-607260-94-5)
     - NIOSH Manual of Analytical Methods (NMAM) 4th Ed.
     - MW (Molecular Weight) de NIST WebBook (https://webbook.nist.gov)

   Lógica pura — sem DOM, sem IDB, sem rede.
   Coberto por tests/health-biomarker-reading.test.mjs (~30 testes).
   ================================================================ */

import { SAMPLE_MATRIX } from './schema.js';
import { parseCsvRow as _parseCsvRow } from '../../utils/helpers/csvRowParser.js';

// ----------------------------------------------------------------
// Molecular weights (g/mol) - NIST WebBook
// Necessário para conversões umol/L → mg/L
// ----------------------------------------------------------------

/**
 * Mapeamento biomarkerType → peso molecular (g/mol).
 * Fonte: NIST WebBook (https://webbook.nist.gov)
 * Usado em normalizeToBaseUnit() para conversão umol/L → mg/L.
 */
const MOLECULAR_WEIGHT = Object.freeze({
    phenol_urine: 94.11, // Fenol (C6H5OH) — MW=94.11 g/mol
    benzene_blood: 78.11, // Benzeno (C6H6) — MW=78.11 g/mol
    toluene_blood: 92.14, // Tolueno (C7H8) — MW=92.14 g/mol
    lead_blood: 207.2, // Chumbo (Pb) — MW=207.2 g/mol
    mercury_urine: 200.59, // Mercúrio (Hg) — MW=200.59 g/mol
    xylene_urine: 106.16, // Xileno (C8H10) — MW=106.16 g/mol
    // aliases para flexibilidade
    phenol: 94.11,
    benzene: 78.11,
    toluene: 92.14,
    lead: 207.2,
    mercury: 200.59,
    xylene: 106.16,
});

// ----------------------------------------------------------------
// ID generator (sem crypto - puro math)
// ----------------------------------------------------------------

let _idSeq = 0;

/**
 * Gera um ID único estável dentro de uma sessão.
 * Formato: rr-{4 chars do biomarkerType}-{base36 timestamp}
 * @param {string} biomarkerType
 * @returns {string}
 */
function _generateReadingId(biomarkerType: string): string {
    _idSeq += 1;
    const prefix = (biomarkerType || 'unkn').slice(0, 4);
    // base36 de timestamp + sequência para unicidade dentro do mesmo ms
    const ts = Date.now().toString(36);
    return `rr-${prefix}-${ts}-${_idSeq}`;
}

// ----------------------------------------------------------------
// createBiomarkerReading
// ----------------------------------------------------------------

/**
 * Cria e valida um registro de leitura de biomarcador.
 * Retorna objeto imutável (Object.freeze).
 *
 * @param {{
 *   workerPseudonym: string,
 *   biomarkerType: string,
 *   value: number,
 *   unit: string,
 *   sampleDate: string,
 *   sampleMatrix: string,
 *   projectId?: string,
 *   labId?: string,
 *   campaignId?: string,
 *   confounders?: { smoking: boolean, hoursWorked: number, ppeUsed: string[] }
 * }} params
 * @returns {Readonly<object>} ReadingObject com todos os campos + id
 * @throws {TypeError} se campos obrigatórios ausentes ou valor inválido
 */
export function createBiomarkerReading(
    params: {
        workerPseudonym: string;
        biomarkerType: string;
        value: number;
        unit: string;
        sampleDate: string;
        sampleMatrix: string;
        projectId?: string;
        labId?: string;
        campaignId?: string;
        confounders?: { smoking: boolean; hoursWorked: number; ppeUsed: string[] };
    } = {} as any,
): Readonly<object> {
    const {
        workerPseudonym,
        biomarkerType,
        value,
        unit,
        sampleDate,
        sampleMatrix = SAMPLE_MATRIX.urine,
        projectId = null,
        labId = null,
        campaignId = null,
        confounders = null,
    } = params as any;

    // Validações obrigatórias
    if (!workerPseudonym || typeof workerPseudonym !== 'string' || !workerPseudonym.trim()) {
        throw new TypeError('createBiomarkerReading: workerPseudonym is required');
    }
    if (!biomarkerType || typeof biomarkerType !== 'string' || !biomarkerType.trim()) {
        throw new TypeError('createBiomarkerReading: biomarkerType is required');
    }
    if (typeof value !== 'number' || !isFinite(value) || isNaN(value)) {
        throw new TypeError('createBiomarkerReading: value must be a finite number');
    }
    if (!unit || typeof unit !== 'string' || !unit.trim()) {
        throw new TypeError('createBiomarkerReading: unit is required');
    }
    if (!sampleDate) {
        throw new TypeError('createBiomarkerReading: sampleDate is required');
    }

    const now = new Date().toISOString();

    return Object.freeze({
        id: _generateReadingId(biomarkerType),
        workerPseudonym: String(workerPseudonym).trim(),
        biomarkerType: String(biomarkerType).trim(),
        value: Number(value),
        unit: String(unit).trim(),
        sampleDate: String(sampleDate),
        sampleMatrix: String(sampleMatrix || SAMPLE_MATRIX.urine),
        projectId: projectId ? String(projectId) : null,
        labId: labId ? String(labId) : null,
        campaignId: campaignId ? String(campaignId) : null,
        confounders: confounders ? Object.freeze({ ...confounders }) : null,
        createdAt: now,
    });
}

// ----------------------------------------------------------------
// parseBiomarkerCSV
// ----------------------------------------------------------------

/** Colunas obrigatórias no CSV de biomarcadores. */
const REQUIRED_CSV_COLUMNS = ['pseudonym', 'biomarkerType', 'value', 'unit', 'sampleDate', 'matrix'];

/**
 * Analisa um CSV de leituras de biomarcadores.
 * Cabeçalho obrigatório. Colunas extras são silenciosamente ignoradas.
 * Linhas com campos obrigatórios ausentes/inválidos geram entradas de erro
 * (não lançam exceção).
 *
 * Colunas esperadas (case-sensitive):
 *   pseudonym, biomarkerType, value, unit, sampleDate, matrix
 *
 * @param {string} csvText
 * @param {{ projectId?: string, labId?: string }} opts
 * @returns {{ readings: object[], errors: {row: number, reason: string}[] }}
 */
export function parseBiomarkerCSV(
    csvText: string,
    opts: { projectId?: string; labId?: string } = {},
): { readings: object[]; errors: { row: number; reason: string }[] } {
    const { projectId = null, labId = null } = opts as any;
    const readings: any[] = [];
    const errors: { row: number; reason: string }[] = [];

    if (!csvText || typeof csvText !== 'string') {
        return { readings, errors };
    }

    // Separar linhas, ignorar linhas completamente em branco
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
        return { readings, errors };
    }

    // Cabeçalho
    const header = _parseCSVRow(lines[0]!);
    const colIndex: Record<string, number> = {};
    for (const col of REQUIRED_CSV_COLUMNS) {
        colIndex[col] = header.indexOf(col);
    }

    // Verificar colunas obrigatórias presentes no cabeçalho
    for (const col of REQUIRED_CSV_COLUMNS) {
        if (colIndex[col] === -1) {
            // Coluna ausente - erro para todas as linhas de dados
            for (let r = 1; r < lines.length; r++) {
                errors.push({ row: r + 1, reason: `missing required column: ${col}` });
            }
            return { readings, errors };
        }
    }

    // Processar linhas de dados (a partir da linha 1, índice base 1 no CSV = row 2 exibido ao usuário)
    for (let i = 1; i < lines.length; i++) {
        const rowNum = i + 1; // número de linha exibido ao usuário (1=cabeçalho, 2=primeira linha de dados)
        const cells = _parseCSVRow(lines[i]!);

        const get = (col: string) => {
            const idx = colIndex[col] ?? -1;
            return idx >= 0 ? (cells[idx] || '').trim() : '';
        };

        const pseudonym = get('pseudonym');
        const biomarkerType = get('biomarkerType');
        const valueStr = get('value');
        const unit = get('unit');
        const sampleDate = get('sampleDate');
        const matrix = get('matrix');

        // Validar campos obrigatórios
        if (!pseudonym) {
            errors.push({ row: rowNum, reason: 'missing required field: pseudonym' });
            continue;
        }
        if (!biomarkerType) {
            errors.push({ row: rowNum, reason: 'missing required field: biomarkerType' });
            continue;
        }
        if (!valueStr) {
            errors.push({ row: rowNum, reason: 'missing required field: value' });
            continue;
        }

        const value = Number(valueStr);
        if (isNaN(value) || !isFinite(value)) {
            errors.push({ row: rowNum, reason: `invalid value: '${valueStr}' is not a finite number` });
            continue;
        }

        if (!unit) {
            errors.push({ row: rowNum, reason: 'missing required field: unit' });
            continue;
        }
        if (!sampleDate) {
            errors.push({ row: rowNum, reason: 'missing required field: sampleDate' });
            continue;
        }

        try {
            const reading = createBiomarkerReading({
                workerPseudonym: pseudonym,
                biomarkerType,
                value,
                unit,
                sampleDate,
                sampleMatrix: matrix || SAMPLE_MATRIX.urine,
                projectId: projectId as any,
                labId: labId as any,
            });
            readings.push(reading);
        } catch (err) {
            errors.push({ row: rowNum, reason: (err as any).message });
        }
    }

    return { readings, errors };
}

/**
 * Analisa uma linha CSV simples (suporte a aspas duplas para campos com vírgula).
 * @param {string} line
 * @returns {string[]}
 */
function _parseCSVRow(line: string): string[] {
    return _parseCsvRow(line, ',');
}

// ----------------------------------------------------------------
// normalizeToBaseUnit
// ----------------------------------------------------------------

/**
 * Normaliza um valor da unidade fornecida para a unidade base canônica
 * do biomarkerType. Retorna o valor inalterado se a conversão for
 * desconhecida (sem lançar exceção).
 *
 * Conversões suportadas:
 *   ug_L         → mg_L (÷ 1000)
 *   mg_dL        → mg_L (× 10)
 *   ug_dL        → mg_L (÷ 100)
 *   umol_L       → mg_L (× MW ÷ 1000) - requer MW conhecido no MOLECULAR_WEIGHT
 *   mg_g_creatinine → mg_g_creatinine (passthrough - unidade creatinina-ajustada)
 *   unidade desconhecida → passthrough (converted=false)
 *
 * Referência: ACGIH BEI 2024 Appendix A, NIOSH NMAM 4th Ed.
 *
 * @param {number} value
 * @param {string} unit
 * @param {string} biomarkerType
 * @returns {{ value: number, unit: string, converted: boolean }}
 */
export function normalizeToBaseUnit(
    value: number,
    unit: string,
    biomarkerType: string,
): { value: number; unit: string; converted: boolean } {
    if (typeof value !== 'number') {
        return { value, unit: String(unit || ''), converted: false };
    }

    const u = String(unit || '').trim();
    const bt = String(biomarkerType || '').trim();

    switch (u) {
        case 'ug_L':
            // micrograma/L → miligrama/L
            return { value: value / 1000, unit: 'mg_L', converted: true };

        case 'mg_dL':
            // miligramas/decilitro → miligramas/L (1 dL = 0,1 L)
            return { value: value * 10, unit: 'mg_L', converted: true };

        case 'ug_dL':
            // microgramas/decilitro → miligramas/L
            // ug/dL × (1 mg / 1000 ug) × (10 dL / 1 L) = value / 100
            return { value: value / 100, unit: 'mg_L', converted: true };

        case 'umol_L': {
            // micromol/L → mg/L: value_mg_L = value_umol_L × MW(g/mol) / 1000
            const mw = (MOLECULAR_WEIGHT as Record<string, number>)[bt];
            if (typeof mw === 'number') {
                return { value: (value * mw) / 1000, unit: 'mg_L', converted: true };
            }
            // MW desconhecido - passthrough
            return { value, unit: u, converted: false };
        }

        case 'mg_g_creatinine':
            // Unidade creatinina-ajustada - sem conversão definida para mg_L (tipo diferente)
            return { value, unit: u, converted: false };

        default:
            // Unidade desconhecida ou já na unidade base (ex: mg_L)
            return { value, unit: u, converted: false };
    }
}

// ----------------------------------------------------------------
// groupReadingsByWorker
// ----------------------------------------------------------------

/**
 * Agrupa leituras por workerPseudonym.
 * @param {object[]} readings
 * @returns {Map<string, object[]>}
 */
export function groupReadingsByWorker(readings: object[]): Map<string, object[]> {
    const map = new Map();
    if (!Array.isArray(readings)) return map;

    for (const rRaw of readings) {
        const r = rRaw as any;
        if (!r || typeof r.workerPseudonym !== 'string') continue;
        const key = r.workerPseudonym;
        if (!map.has(key)) {
            map.set(key, []);
        }
        map.get(key).push(r);
    }
    return map;
}

// ----------------------------------------------------------------
// groupReadingsByBiomarker
// ----------------------------------------------------------------

/**
 * Agrupa leituras por biomarkerType.
 * @param {object[]} readings
 * @returns {Map<string, object[]>}
 */
export function groupReadingsByBiomarker(readings: object[]): Map<string, object[]> {
    const map = new Map();
    if (!Array.isArray(readings)) return map;

    for (const rRaw of readings) {
        const r = rRaw as any;
        if (!r || typeof r.biomarkerType !== 'string') continue;
        const key = r.biomarkerType;
        if (!map.has(key)) {
            map.set(key, []);
        }
        map.get(key).push(r);
    }
    return map;
}
