// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining / Open Environmental Data Ingestion
// Authorship: Calvin Stefan Iost

/* ================================================================
   OPEN DATA LOADER — Carregamento de dados publicos ambientais
   ================================================================

   Carrega dados de fontes abertas (CETESB QUALAR, ANA Hidroweb,
   INMET Estacoes, CSV genericos) e converte para o formato de
   observacao padrao ecbyts.

   Padrao pluggable fetcher: nenhuma chamada HTTP hardcoded.
   O fetcher e injetado, tornando o modulo 100% testavel sem browser.

   Suporta:
   - CETESB QUALAR (qualidade da agua SP)
   - ANA Hidroweb (dados hidrologicos)
   - INMET (estacoes meteorologicas automaticas)
   - CSV generico (qualquer fonte CSV publica)

   Referencias:
   - CETESB QUALAR: https://qualar.cetesb.sp.gov.br/qualar/
   - ANA Hidroweb: https://www.snirh.gov.br/hidroweb/
   - INMET: https://portal.inmet.gov.br/
   - SPEC-OPENDATALOADER-PDF-001
   ================================================================ */

// ----------------------------------------------------------------
// SUPPORTED SOURCES - Tipos de fontes suportadas
// Objeto frozen: nao pode ser mutado em runtime.
// ----------------------------------------------------------------

/**
 * Identificadores canonicos das fontes de dados publicos suportadas.
 */
export const SUPPORTED_SOURCES: Readonly<{
    CETESB_QUALAR: string;
    ANA_HIDROWEB: string;
    INMET_STATIONS: string;
    GENERIC_CSV: string;
}> = Object.freeze({
    CETESB_QUALAR: 'cetesb_qualar',
    ANA_HIDROWEB: 'ana_hidroweb',
    INMET_STATIONS: 'inmet_stations',
    GENERIC_CSV: 'generic_csv',
});

// Conjunto rapido para lookup O(1) na validacao
const VALID_SOURCE_TYPES = new Set(Object.values(SUPPORTED_SOURCES));

// ----------------------------------------------------------------
// VALIDATION - Validacao de SourceConfig
// ----------------------------------------------------------------

/**
 * Valida um objeto de configuracao de fonte de dados.
 * Retorna {valid, errors[]} sem lancar excecao.
 *
 * @param config - Configuracao da fonte
 */
export function validateSourceConfig(config: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config || typeof config !== 'object') {
        return { valid: false, errors: ['config must be a non-null object'] };
    }

    // Campos obrigatorios
    if (!config.id || typeof config.id !== 'string' || !config.id.trim()) {
        errors.push('id is required and must be a non-empty string');
    }
    if (!config.type || !VALID_SOURCE_TYPES.has(config.type)) {
        errors.push(`type is required and must be one of: ${[...VALID_SOURCE_TYPES].join(', ')}`);
    }
    if (!config.url || typeof config.url !== 'string' || !config.url.trim()) {
        errors.push('url is required and must be a non-empty string');
    }
    if (!config.elementId || typeof config.elementId !== 'string' || !config.elementId.trim()) {
        errors.push('elementId is required and must be a non-empty string');
    }

    // mapping e obrigatorio mas campos individuais sao opcionais (fallback gracioso)
    if (!config.mapping || typeof config.mapping !== 'object') {
        errors.push('mapping is required and must be an object');
    } else {
        if (!config.mapping.timestamp) {
            errors.push('mapping.timestamp is required');
        }
        if (!config.mapping.value) {
            errors.push('mapping.value is required');
        }
    }

    return { valid: errors.length === 0, errors };
}

// ----------------------------------------------------------------
// CSV PARSER - Parser CSV puro sem dependencia de browser
// Suporta delimitador configuravel e cabecalho opcional.
// ----------------------------------------------------------------

/**
 * Faz parse de uma string CSV em array de objetos (linha por objeto).
 * Sem dependencia de DOM ou browser APIs.
 *
 * @param text - Texto CSV
 * @param opts - Opcoes de parse
 */
function parseCSV(
    text: string,
    opts: { delimiter?: string; headerRow?: boolean } = {},
): { headers: string[]; rows: Record<string, string>[] } {
    const delimiter = opts.delimiter || ',';
    const headerRow = opts.headerRow !== false; // default true

    if (!text || typeof text !== 'string') {
        return { headers: [], rows: [] };
    }

    // Normalizar quebras de linha (Windows \r\n, Unix \n, Mac antigo \r)
    const lines = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((line) => line.trim() !== '');

    if (lines.length === 0) {
        return { headers: [], rows: [] };
    }

    /**
     * Divide uma linha CSV respeitando campos entre aspas.
     */
    function splitLine(line: string): string[] {
        const fields: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    // Aspas escapadas dentro de campo entre aspas
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === delimiter && !inQuotes) {
                fields.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        fields.push(current.trim());
        return fields;
    }

    let headers: string[];
    let dataStart: number;

    if (headerRow) {
        headers = splitLine(lines[0] as string);
        dataStart = 1;
    } else {
        // Sem cabecalho: usar indices como nomes (col0, col1, ...)
        const sampleFields = splitLine(lines[0] as string);
        headers = sampleFields.map((_, i) => `col${i}`);
        dataStart = 0;
    }

    const rows: Record<string, string>[] = [];
    for (let i = dataStart; i < lines.length; i++) {
        const fields = splitLine(lines[i] as string);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
            row[h] = fields[idx] !== undefined ? (fields[idx] as string) : '';
        });
        rows.push(row);
    }

    return { headers, rows };
}

// ----------------------------------------------------------------
// OBSERVATION BUILDER - Transforma linhas CSV em observacoes ecbyts
// ----------------------------------------------------------------

/**
 * Constroi observacoes ecbyts a partir de um array de linhas e mapeamento.
 * Retorna apenas linhas com campos obrigatorios presentes.
 *
 * @param rows - Linhas parseadas do CSV
 * @param mapping - Mapeamento de campos
 * @param elementId - ID do elemento alvo
 * @param sourceType - Tipo da fonte (para campo source)
 * @returns Array de observacoes ecbyts
 */
function buildObservations(
    rows: any[],
    mapping: { timestamp?: string; value?: string; parameter?: string; unit?: string },
    elementId: string,
    sourceType: string,
): any[] {
    const observations: any[] = [];

    for (const row of rows) {
        const timestamp = mapping.timestamp ? row[mapping.timestamp] : undefined;
        const rawValue = mapping.value ? row[mapping.value] : undefined;

        // Campos obrigatorios: timestamp e value devem existir e nao ser vazios
        if (!timestamp || !rawValue) continue;

        const value = parseFloat(rawValue);
        if (Number.isNaN(value)) continue;

        const obs = {
            elementId,
            parameterName: mapping.parameter ? row[mapping.parameter] || '' : '',
            value,
            unit: mapping.unit ? row[mapping.unit] || '' : '',
            timestamp,
            source: sourceType,
        };

        observations.push(obs);
    }

    return observations;
}

// ----------------------------------------------------------------
// CETESB QUALAR - Transformador dedicado para formato CETESB
// ----------------------------------------------------------------

/**
 * Transforma dados brutos no formato CETESB QUALAR em observacoes ecbyts.
 * CETESB usa CSV com campos tipicos: Data, Horario, Parametro, Valor, Unidade.
 *
 * @param rawData - CSV string ou array de objetos ja parseados
 * @param opts - Opcoes
 * @returns Array de observacoes com source: 'cetesb'
 */
export function buildObservationsFromCetesb(
    rawData: string | any[],
    opts: {
        timestampField?: string;
        valueField?: string;
        parameterField?: string;
        unitField?: string;
        delimiter?: string;
    } = {},
): any[] {
    const tsField = opts.timestampField || 'Data';
    const valField = opts.valueField || 'Valor';
    const paramField = opts.parameterField || 'Parametro';
    const unitField = opts.unitField || 'Unidade';
    // CETESB tipicamente usa ponto-e-virgula como delimitador
    const delimiter = opts.delimiter || ';';

    let rows: any[];

    if (typeof rawData === 'string') {
        // Parse do CSV com delimitador CETESB
        const parsed = parseCSV(rawData, { delimiter, headerRow: true });
        rows = parsed.rows;
    } else if (Array.isArray(rawData)) {
        rows = rawData;
    } else {
        return [];
    }

    const observations: any[] = [];

    for (const row of rows) {
        const timestamp = row[tsField];
        const rawValue = row[valField];

        if (!timestamp || rawValue === undefined || rawValue === '') continue;

        // CETESB usa virgula decimal em PT-BR: "7,2" → 7.2
        const normalizedValue = typeof rawValue === 'string' ? rawValue.replace(',', '.') : String(rawValue);

        const value = parseFloat(normalizedValue);
        if (Number.isNaN(value)) continue;

        observations.push({
            parameterName: row[paramField] || '',
            value,
            unit: row[unitField] || '',
            timestamp,
            source: 'cetesb',
        });
    }

    return observations;
}

// ----------------------------------------------------------------
// LOADER FACTORY - Cria instancia do loader com fetcher injetado
// ----------------------------------------------------------------

type Fetcher = (
    url: string,
    opts?: Record<string, any>,
) => Promise<{ data: any; contentType?: string; statusCode: number }>;

/**
 * Cria uma instancia do OpenDataLoader com fetcher plugavel.
 *
 * O fetcher e a unica dependencia de rede - permite mock completo em testes.
 *
 * @param fetcher - async (url, opts?) => {data, contentType, statusCode}
 */
export function createOpenDataLoader(fetcher: Fetcher): {
    load: (sourceConfig: any) => Promise<{ ok: boolean; observations: any[]; errors: string[]; raw: any }>;
    loadBatch: (
        sourceConfigs: any[],
    ) => Promise<{ results: any[]; total: number; succeeded: number; failed: number }>;
} {
    if (typeof fetcher !== 'function') {
        throw new TypeError('createOpenDataLoader: fetcher must be a function');
    }

    /**
     * Carrega dados de uma unica fonte e converte para observacoes ecbyts.
     *
     * @param sourceConfig - Configuracao da fonte (ver schema no topo)
     */
    async function load(
        sourceConfig: any,
    ): Promise<{ ok: boolean; observations: any[]; errors: string[]; raw: any }> {
        // Validar config antes de qualquer operacao de rede
        const { valid, errors: configErrors } = validateSourceConfig(sourceConfig);
        if (!valid) {
            return { ok: false, observations: [], errors: configErrors, raw: null };
        }

        const { url, elementId, mapping, opts = {}, type } = sourceConfig;
        const parseAs = opts.parseAs || 'csv';
        const delimiter = opts.delimiter || ',';
        const headerRow = opts.headerRow !== false;

        let fetchResult: { data: any; contentType?: string; statusCode: number };
        try {
            fetchResult = await fetcher(url, opts);
        } catch (err: any) {
            return {
                ok: false,
                observations: [],
                errors: [`fetch failed: ${err && err.message ? err.message : String(err)}`],
                raw: null,
            };
        }

        // Verificar status HTTP
        if (!fetchResult || fetchResult.statusCode !== 200) {
            const code = fetchResult ? fetchResult.statusCode : 'unknown';
            return {
                ok: false,
                observations: [],
                errors: [`unexpected status code: ${code}`],
                raw: fetchResult ? fetchResult.data : null,
            };
        }

        const raw = fetchResult.data;
        let observations: any[];

        try {
            if (parseAs === 'json') {
                // Fonte JSON: espera array de objetos
                let parsed;
                try {
                    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                } catch (e: any) {
                    return {
                        ok: false,
                        observations: [],
                        errors: [`json parse error: ${e?.message || e}`],
                        raw,
                    };
                }

                if (!Array.isArray(parsed)) {
                    return {
                        ok: false,
                        observations: [],
                        errors: ['json source must return an array of records'],
                        raw,
                    };
                }

                observations = buildObservations(parsed, mapping, elementId, type);
            } else {
                // Fonte CSV (padrao)
                if (type === SUPPORTED_SOURCES.CETESB_QUALAR) {
                    // CETESB: usa transformador dedicado, depois adiciona elementId
                    const ceObs = buildObservationsFromCetesb(raw, {
                        timestampField: mapping.timestamp,
                        valueField: mapping.value,
                        parameterField: mapping.parameter,
                        unitField: mapping.unit,
                        delimiter,
                    });
                    observations = ceObs.map((o: any) => ({ ...o, elementId }));
                } else {
                    const { rows } = parseCSV(raw, { delimiter, headerRow });
                    observations = buildObservations(rows, mapping, elementId, type);
                }
            }
        } catch (err: any) {
            return {
                ok: false,
                observations: [],
                errors: [`parse error: ${err && err.message ? err.message : String(err)}`],
                raw,
            };
        }

        return { ok: true, observations, errors: [], raw };
    }

    /**
     * Carrega dados de multiplas fontes em paralelo.
     *
     * @param sourceConfigs - Array de configuracoes de fonte
     */
    async function loadBatch(
        sourceConfigs: any[],
    ): Promise<{ results: any[]; total: number; succeeded: number; failed: number }> {
        if (!Array.isArray(sourceConfigs) || sourceConfigs.length === 0) {
            return { results: [], total: 0, succeeded: 0, failed: 0 };
        }

        const settled = await Promise.allSettled(sourceConfigs.map((cfg: any) => load(cfg)));

        const results = settled.map((r, i) => {
            if (r.status === 'fulfilled') {
                return { sourceId: sourceConfigs[i].id, ...r.value };
            }
            return {
                sourceId: sourceConfigs[i] ? sourceConfigs[i].id : `index_${i}`,
                ok: false,
                observations: [],
                errors: [r.reason ? String(r.reason) : 'unknown error'],
                raw: null,
            };
        });

        const succeeded = results.filter((r) => r.ok).length;
        const failed = results.length - succeeded;

        return {
            results,
            total: results.length,
            succeeded,
            failed,
        };
    }

    return { load, loadBatch };
}
