// @ts-check
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
/**
 * staging.js - Staging object builder + confidence classifier
 * ADR-022: Neuro-Symbolic Document Ingestion - Layer 4 (Staging + Cost)
 *
 * Constroi staging objects para cada leitura extraida de um documento.
 * Orquestra as camadas 2 (deterministic) e 3 (semantic) para resolver parametros,
 * classifica confianca por cor, e preenche custos automaticamente.
 *
 * Classificacao:
 * - GREEN: match exato (alias table ou CAS) - auto-ingestivel, mas revisavel
 * - YELLOW: match semantico (transformer ou Levenshtein) - bloqueado para revisao
 * - RED: sem match, valor invalido, unidade desconhecida, ou confidence < 0.6
 *
 * @module core/ingestion/documents/staging
 */
import { resolveAlias } from './paramAliases.js';
import { extractCASNumbers, extractValue, extractUnit, resolveDocUnit } from './regexAnchors.js';
import { matchSemantic } from './semanticMatcher.js';
import { buildObservationCost } from './costCatalog.js';
import { canonicalizeWellId } from './wellIdCanon.js';
import { WELL_ID_RE as WELL_ID_RE_CANONICAL } from './types.js';
type AnyRecord = Record<string, any>;
/** @typedef {Record<string, any>} AnyRecord */
// ---------------------------------------------------------------------------
// Staging Object Builder
// ---------------------------------------------------------------------------
/**
 * Creates a staging object for a single reading.
 *
 * @param {{ parameterName: string, valueText: string, unitText?: string, source?: AnyRecord, tableConfidence?: number }} params
 * @returns {Promise<AnyRecord>} Staging object
 */
/**
 * Create the initial staging skeleton.
 * @param {string} parameterName
 * @param {string} valueText
 * @param {AnyRecord} source
 * @returns {AnyRecord}
 */
function _createStagingSkeleton(parameterName: string, valueText: string, source: AnyRecord): AnyRecord {
    return {
        parameterId: null,
        parameterName: parameterName || '',
        value: null,
        unit: null,
        unitId: null,
        operator: '=',
        confidence: 'red',
        matchMethod: null,
        matchScore: null,
        family: 'generic',
        elementName: null,
        matrix: null,
        source: {
            page: source.page || null,
            x: source.x || null,
            y: source.y || null,
            text: source.text || `${parameterName || ''} ${valueText || ''}`.trim(),
        },
        cost: null,
        warnings: [],
        catalogVersionHash: 'v1.0',
    };
}

/**
 * Resolve parameter name through alias, CAS, and semantic matching.
 * @param {AnyRecord} staging
 * @param {string} parameterName
 */
async function _resolveStagingParameter(staging: AnyRecord, parameterName: string) {
    // Layer 2: Deterministic - alias table
    const aliasResult = resolveAlias(parameterName);
    if (aliasResult) {
        staging.parameterId = aliasResult.parameterId;
        staging.confidence = 'green';
        staging.matchMethod = 'alias';
        staging.matchScore = 1.0;
        return;
    }
    // Layer 2: Deterministic - CAS number
    const casNumbers = extractCASNumbers(parameterName);
    if (casNumbers.length > 0) {
        staging.warnings.push(`CAS found: ${casNumbers[0]?.cas || ''} — needs CAS_TO_PARAM resolution`);
    }
    // Layer 3: Semantic - transformer or Levenshtein
    try {
        const semanticResult = await matchSemantic(parameterName);
        if (semanticResult) {
            staging.parameterId = semanticResult.parameterId;
            staging.confidence = 'yellow';
            staging.matchMethod = semanticResult.method;
            staging.matchScore = semanticResult.score;
            if (semanticResult.matchedAlias) {
                staging.warnings.push(`Matched via ${semanticResult.method}: "${semanticResult.matchedAlias}" (score: ${semanticResult.score.toFixed(2)})`);
            }
            return;
        }
    }
    catch (e: any) {
        staging.warnings.push(`Semantic match failed: ${e.message}`);
    }
    // No match at all
    staging.confidence = 'red';
    staging.warnings.push(`No match found for: "${parameterName}"`);
}

/**
 * Extract value and operator from the raw value text.
 * @param {AnyRecord} staging
 * @param {string} valueText
 */
function _extractStagingValue(staging: AnyRecord, valueText: string) {
    const valueResult = extractValue(valueText);
    if (valueResult) {
        staging.value = valueResult.value;
        staging.operator = valueResult.operator;
    }
    else {
        staging.confidence = 'red';
        staging.warnings.push(`Could not parse value: "${valueText}"`);
    }
}

/**
 * Resolve unit text and detect matrix from the resolved unit.
 * @param {AnyRecord} staging
 * @param {string} unitText
 */
function _resolveStagingUnit(staging: AnyRecord, unitText: string) {
    const unitResult = extractUnit(unitText);
    if (unitResult) {
        staging.unit = unitResult.unit;
        staging.unitId = unitResult.unitId;
    }
    else {
        staging.unitId = resolveDocUnit(unitText);
        staging.unit = unitText;
        if (!staging.unitId) {
            staging.warnings.push(`Unknown unit: "${unitText}"`);
        }
    }
    _detectStagingMatrix(staging);
}

/**
 * Detect matrix (soil/groundwater/air) from the staging unit.
 * @param {AnyRecord} staging
 */
function _detectStagingMatrix(staging: AnyRecord) {
    const unitLower = (staging.unitId || staging.unit || '').toLowerCase();
    if (/mg\/kg|mg\/kg\s*ps|ppm\s*solo|mg\/kg\s*ms/i.test(unitLower)) {
        staging.matrix = 'soil';
    }
    else if (/[uμµ]g\/l|mg\/l|ppb/i.test(unitLower)) {
        staging.matrix = 'groundwater';
    }
    else if (/[uμµ]g\/m|mg\/m|ppm\s*ar/i.test(unitLower)) {
        staging.matrix = 'air';
    }
}

/**
 * Apply table confidence thresholds to the staging object.
 * @param {AnyRecord} staging
 * @param {number} tableConfidence
 * @param {AnyRecord} source
 */
function _applyTableConfidence(staging: AnyRecord, tableConfidence: number, source: AnyRecord) {
    if (tableConfidence >= 0.6) return;
    if (source._fallback) {
        if (staging.confidence === 'red' && staging.parameterId) {
            staging.confidence = 'yellow';
        }
        staging.warnings.push(`Tabela com confianca baixa (${tableConfidence}) — revisao recomendada`);
    }
    else {
        staging.confidence = 'red';
        staging.warnings.push(`Table confidence too low: ${tableConfidence}`);
    }
}

/**
 * Auto-fill cost from the observation catalog.
 * @param {AnyRecord} staging
 */
function _fillStagingCost(staging: AnyRecord) {
    if (!staging.parameterId) return;
    try {
        staging.cost = buildObservationCost(staging.parameterId, 'catalog');
    }
    catch (_e: any) {
        staging.cost = null;
    }
}

export async function buildStagingObject(params: any) {
    const { parameterName, valueText, unitText, source = {}, tableConfidence = 1.0 } = params || {};
    const staging = _createStagingSkeleton(parameterName, valueText, source);
    if (parameterName) {
        await _resolveStagingParameter(staging, parameterName);
    }
    else {
        staging.warnings.push('Missing parameter name');
    }
    if (valueText) {
        _extractStagingValue(staging, valueText);
    }
    if (unitText) {
        _resolveStagingUnit(staging, unitText);
    }
    _applyTableConfidence(staging, tableConfidence, source);
    _fillStagingCost(staging);
    return staging;
}
/**
 * Processes an entire table into staging objects.
 * Assumes row 0 is the header row.
 *
 * @param {Object} table
 * @param {string[][]} params.table - 2D table data
 * @param {number} params.confidence - Table reconstruction confidence
 * @param {number} [params.page] - Source page number
 * @returns {Promise<Object[]>} Array of staging objects
 */
/**
 * F3: Gate - rejeita tabelas que nao sao analiticas (prosa, metadata, administrativa).
 * Chamada antes de iterar rows para evitar gerar readings de texto corrido.
 */
/** @param {any} table @param {any} header */
const ANALYTICAL_KEYWORDS = /composto|par[aâ]metro|analito|resultado|concentra[cç][aã]o|valor|v\.?i\.?|l\.?q\.?|substancia|substância|cas\b/i;

/**
 * Compute the average length of non-empty values in column 0.
 * @param {any[]} dataRows
 * @returns {number}
 */
function _avgCol0Length(dataRows: any[]): number {
    const col0Values = dataRows.map((r: any) => (r[0] || '').trim()).filter(Boolean);
    if (col0Values.length === 0) return 0;
    return col0Values.reduce((s: any, v: any) => s + v.length, 0) / col0Values.length;
}

/**
 * Compute the ratio of rows containing at least one numeric-like cell.
 * @param {any[]} dataRows
 * @returns {number}
 */
function _numericRowRatio(dataRows: any[]): number {
    const numericRe = /\d+[.,]?\d*/;
    let numericRows = 0;
    for (const row of dataRows) {
        if (row.some((c: any) => numericRe.test(c || ''))) numericRows++;
    }
    return numericRows / (dataRows.length || 1);
}

/**
 * Compute the ratio of rows with data in only one column.
 * @param {any[]} dataRows
 * @returns {number}
 */
function _singleColumnRowRatio(dataRows: any[]): number {
    let singleCol = 0;
    for (const row of dataRows) {
        if (row.filter((c: any) => (c || '').trim()).length <= 1) singleCol++;
    }
    return singleCol / (dataRows.length || 1);
}

/**
 * Check whether the first header cell looks like prose/metadata rather than a table header.
 * @param {any} header
 * @returns {boolean}
 */
function _isMetadataHeader(header: any): boolean {
    const h0 = (header[0] || '').trim().toLowerCase();
    if (/^[a-z]\d*\.\d*\.?\s/.test(h0)) return true;
    if (/^dados\s|^resumo\s|^sumario|^indice|^confidencial/i.test(h0)) return true;
    return false;
}

function isAnalyticalTable(table: any, header: any) {
    if (!table || table.length < 3 || !header) return false;
    const headerCells = header;
    if (headerCells.some((h: any) => ANALYTICAL_KEYWORDS.test(h || ''))) return true;
    const dataRows = table.slice(1);
    const col0Chars = dataRows.map((r: any) => (r[0] || '').trim().length);
    const avgCol0 = col0Chars.reduce((s: any, l: any) => s + l, 0) / (col0Chars.length || 1);
    if (avgCol0 > 60) return false;
    if (_numericRowRatio(dataRows) < 0.2) return false;
    if (_singleColumnRowRatio(dataRows) > 0.8) return false;
    if (_avgCol0Length(dataRows) <= 3) return false;
    if (header.length > 8) return false;
    if (_isMetadataHeader(header)) return false;
    return true;
}
/** @param {any} text */
function _isValueLikeText(text: any) {
    if (!text)
        return false;
    const trimmed = String(text).trim();
    if (!trimmed)
        return false;
    if (/^[\u2014-]+$/.test(trimmed))
        return false;
    return !!extractValue(trimmed);
}
/** @param {any} raw */
function _normalizeText(raw: any) {
    return String(raw || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}
/** @param {any} table */
function _extractYearSequenceFromTable(table: any): number[] {
    const years = new Set<number>();
    for (const row of table || []) {
        for (const cell of row || []) {
            const txt = String(cell || '');
            const matches = txt.match(/\b(19|20)\d{2}\b/g) || [];
            for (const y of matches)
                years.add(parseInt(y, 10));
        }
    }
    return [...years]
        .filter((y: any) => y >= 1900 && y <= 2099)
        .sort((a: any, b: any) => a - b);
}
/** @param {any} text */
function _extractCollapsedNumberChunks(text: any) {
    const cleaned = String(text || '').replace(/\s+/g, '');
    if (!cleaned)
        return [];
    const tokens: any[] = [];
    const grouped = cleaned.match(/\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?/g) || [];
    tokens.push(...grouped);
    // "310135" style fallback: split only when no separators and exactly 2+ 3-digit chunks.
    if (tokens.length === 0 && /^\d{6,}$/.test(cleaned) && cleaned.length % 3 === 0) {
        for (let i = 0; i < cleaned.length; i += 3) {
            tokens.push(cleaned.slice(i, i + 3));
        }
    }
    return tokens;
}
/** @param {any} descriptorTail @param {any} latestRaw @param {any} years */
function _buildHistoricalTimeSeries(descriptorTail: any, latestRaw: any, years: any) {
    const series: any[] = [];
    const histTokens = _extractCollapsedNumberChunks(descriptorTail);
    for (const token of histTokens) {
        const parsed = extractValue(token);
        if (!parsed)
            continue;
        series.push({
            period: null,
            year: null,
            value: parsed.value ?? null,
            operator: parsed.operator || '=',
            raw: token,
        });
    }
    const latestParsed = extractValue(latestRaw);
    if (latestParsed) {
        series.push({
            period: 'latest',
            year: null,
            value: latestParsed.value ?? null,
            operator: latestParsed.operator || '=',
            raw: String(latestRaw || ''),
        });
    }
    if (series.length === 0)
        return [];
    // Use explicit years when we can infer enough labels.
    if (Array.isArray(years) && years.length >= series.length) {
        const mappedYears = years.slice(years.length - series.length);
        for (let i = 0; i < series.length; i++) {
            series[i].year = mappedYears[i];
            series[i].period = String(mappedYears[i]);
        }
        return series;
    }
    // Keep deterministic period labels when year cannot be inferred.
    for (let i = 0; i < series.length; i++) {
        if (i === series.length - 1) {
            series[i].period = 'latest';
        }
        else {
            series[i].period = `historical_${i + 1}`;
        }
    }
    return series;
}
const MATRIX_EVIDENCE_RULES = Object.freeze({
    soil: {
        header: /\bsolo\b|\bsoil\b/,
        unit: /\bmg\/kg\b|\bug\/kg\b|\bppm\s*solo\b|\bmg\/kg\s*ps\b|\bmg\/kg\s*ms\b/,
    },
    groundwater: {
        header: /\bagua\s*subterr\b|\bgroundwater\b|\bsubterranea\b|\bfreatic\b|\baquifero\b/,
        unit: /\bmg\/l\b|\bug\/l\b|\bppb\b/,
    },
    surface_water: {
        header: /\bagua\s*superfic\b|\bsurface\s*water\b|\brio\b|\blago\b|\brepresa\b/,
    },
    sediment: {
        header: /\bsediment[oe]?\b|\bsediment\b|\bseabed\b|\bfundo\s*mar\b|\bmarine\s*sediment\b|\bsedimento\s*marin\b/,
        unit: /\bmg\/kg\b|\bug\/kg\b|\bBq\/kg\b|\bng\/g\b/,
    },
    air: {
        header: /\bmatriz\s*ar\b|\bqualidade\s+do\s+ar\b|\bair\b|\batmosfer\b/,
        unit: /\bmg\/m3\b|\bug\/m3\b|\bppm\s*ar\b|\bmg\/m\^?3\b|\bug\/m\^?3\b/,
    },
    vapor: {
        header: /\bvapor\b|\bsoil\s*gas\b|\bgas\s*solo\b|\bsoil\s*vapor\b/,
        unit: /\bppmv\b|\bug\/m3\b/,
    },
    waste: {
        header: /\bresiduo\b|\bwaste\b|\blixiviado\b|\bleachate\b|\bsolubilizado\b/,
        unit: /\bmg\/l\b|\bmg\/kg\b/,
    },
});
/** @param {any} header @param {any} dataRows @param {any} colRoles */
/**
 * Normalize and append a unit hint string.
 * @param {string[]} hints
 * @param {any} txt
 */
function _pushUnitHint(hints: string[], txt: any) {
    const normalized = _normalizeText(txt).replace(/\s+/g, '');
    if (normalized) hints.push(normalized);
}

/**
 * Extract inline unit-like tokens from value-column cells.
 * @param {any[]} dataRows
 * @param {number} valueCol
 * @param {string[]} hints
 */
function _collectValueColumnUnitHints(dataRows: any[], valueCol: number, hints: string[]) {
    for (const row of dataRows || []) {
        const txt = String(row[valueCol] || '');
        const unitLike = txt.match(/[a-zu]+\/[a-z0-9^]+/gi) || [];
        for (const u of unitLike) _pushUnitHint(hints, u);
    }
}

function _collectMatrixUnitHints(header: any, dataRows: any, colRoles: any) {
    const hints: string[] = [];
    const headerText = header.join(' | ');
    const inParens = [...headerText.matchAll(/\(([^)]+)\)/g)];
    for (const m of inParens) _pushUnitHint(hints, m[1]);
    if (colRoles?.headerUnit) _pushUnitHint(hints, colRoles.headerUnit);
    if (Number.isInteger(colRoles?.unit) && colRoles.unit >= 0) {
        for (const row of dataRows || []) _pushUnitHint(hints, row[colRoles.unit] || '');
    }
    if (Number.isInteger(colRoles?.value) && colRoles.value >= 0) {
        _collectValueColumnUnitHints(dataRows || [], colRoles.value, hints);
    }
    return [...new Set(hints)];
}

/**
 * Score each matrix based on header text and unit hints.
 * @param {string} headerText
 * @param {string[]} unitHints
 * @returns {AnyRecord}
 */
function _scoreMatrixEvidence(headerText: string, unitHints: string[]): AnyRecord {
    const score: any = { soil: 0, groundwater: 0, surface_water: 0, air: 0 };
    for (const [matrix, rule] of Object.entries(MATRIX_EVIDENCE_RULES as AnyRecord)) {
        if (rule.header && rule.header.test(headerText)) score[matrix] += 3;
        if (rule.unit && unitHints.some((u: any) => rule.unit.test(u))) score[matrix] += 2;
    }
    return score;
}

/**
 * Decide the matrix from scored evidence.
 * @param {AnyRecord} score
 * @returns {AnyRecord}
 */
function _decideMatrixFromScore(score: AnyRecord): AnyRecord {
    const ranked: any[] = Object.entries(score).sort((a: any, b: any) => b[1] - a[1]);
    const [topMatrix, topScore] = ranked[0] || [null, 0];
    const secondScore: any = ranked[1]?.[1] || 0;
    if (topScore > 0 && topScore - secondScore < 2) return { matrix: null, ambiguous: true, score };
    if (topScore <= 0) return { matrix: null, ambiguous: false, score };
    if (topScore >= 3) return { matrix: topMatrix, ambiguous: false, score };
    return { matrix: null, ambiguous: false, score };
}

function _detectTableMatrixEvidence(input: any) {
    const { header, dataRows, colRoles } = input || {};
    const headerText = _normalizeText((header || []).join(' '));
    const unitHints = _collectMatrixUnitHints(header || [], dataRows || [], colRoles || {});
    const score = _scoreMatrixEvidence(headerText, unitHints);
    return _decideMatrixFromScore(score);
}
/**
 * Normalizes collapsed historical trend tables into simple [Parametro, Valor, Unidade, Elemento].
 * Example row: ["MW-01", "PCE 310135", "ND", "Decrescente"] -> ["PCE", "ND", "", "MW-01"]
 *
 * Keeps only the latest value column when yearly columns were collapsed by PDF extraction.
 * Returns original table when pattern is not confidently detected.
 *
 * @param {string[][]} descriptor
 * @returns {string[][]}
 */
const TREND_KEYWORDS = /decrescente|crescente|estavel|estável|novo\s+poco|novo\s+poço|tendencia|tendência/i;

/**
 * Extract parameter token and descriptor tail from a collapsed cell.
 * @param {string} descriptor
 * @returns {{ paramName: string, tail: string }}
 */
function _splitTrendDescriptor(descriptor: string): { paramName: string; tail: string } {
    const m = descriptor.match(/^([A-Za-z0-9,.\-/]+)\s+(.+)$/);
    return { paramName: (m?.[1] || descriptor).trim(), tail: m?.[2] || '' };
}

/**
 * Detect whether the table matches the historical-trend pattern.
 * @param {any[]} sample
 * @param {number[]} inferredYears
 * @returns {{ matches: boolean, inferredYears: number[] }}
 */
/**
 * Score a single row for historical-trend pattern heuristics.
 * @param {any[]} row
 * @returns {{ well: number, alias: number, value: number, trend: number }}
 */
function _scoreTrendRow(row: any[]): { well: number; alias: number; value: number; trend: number } {
    if (!Array.isArray(row) || row.length < 3) return { well: 0, alias: 0, value: 0, trend: 0 };
    const c0 = (row[0] || '').trim();
    const c1 = (row[1] || '').trim();
    const c2 = (row[2] || '').trim();
    const c3 = (row[3] || '').trim();
    const { paramName } = _splitTrendDescriptor(c1);
    return {
        well: WELL_ID_RE_CANONICAL.test(c0) ? 1 : 0,
        alias: paramName && resolveAlias(paramName)?.parameterId ? 1 : 0,
        value: _isValueLikeText(c2) ? 1 : 0,
        trend: TREND_KEYWORDS.test(c3) ? 1 : 0,
    };
}

function _detectTrendPattern(sample: any[], inferredYears: number[]): { matches: boolean; inferredYears: number[] } {
    let wellRows = 0;
    let aliasRows = 0;
    let latestValueRows = 0;
    let trendRows = 0;
    for (const row of sample) {
        const score = _scoreTrendRow(row);
        wellRows += score.well;
        aliasRows += score.alias;
        latestValueRows += score.value;
        trendRows += score.trend;
    }
    const minRows = Math.max(2, Math.floor(sample.length * 0.35));
    return { matches: wellRows >= minRows && aliasRows >= minRows && latestValueRows >= minRows && trendRows >= 1, inferredYears };
}

/**
 * Normalize a single historical-trend row, if it matches the pattern.
 * @param {any[]} row
 * @param {number[]} inferredYears
 * @returns {string[] | null}
 */
function _normalizeTrendRow(row: any[], inferredYears: number[]): string[] | null {
    if (!Array.isArray(row) || row.length < 3) return null;
    const well = (row[0] || '').trim();
    const descriptor = (row[1] || '').trim();
    const latest = (row[2] || '').trim();
    if (!WELL_ID_RE_CANONICAL.test(well) || !descriptor) return null;
    const { paramName, tail } = _splitTrendDescriptor(descriptor);
    if (!resolveAlias(paramName)?.parameterId) return null;
    let valueText = latest;
    if (!_isValueLikeText(valueText) && tail && _isValueLikeText(tail)) {
        valueText = tail.trim();
    }
    if (!_isValueLikeText(valueText)) return null;
    const series = _buildHistoricalTimeSeries(tail, latest, inferredYears);
    return [paramName, valueText, '', well, JSON.stringify(series)];
}

function normalizeHistoricalTrendTable(table: any) {
    if (!Array.isArray(table) || table.length < 3) return table;
    const inferredYears = _extractYearSequenceFromTable(table);
    const sample = table.slice(0, Math.min(table.length, 12));
    const { matches } = _detectTrendPattern(sample, inferredYears);
    if (!matches) return table;
    const normalized = [['Parametro', 'Valor', 'Unidade', 'Elemento', 'TemporalSeries']];
    for (const row of table) {
        const norm = _normalizeTrendRow(row, inferredYears);
        if (norm) normalized.push(norm);
    }
    return normalized.length >= 3 ? normalized : table;
}
/** @param {AnyRecord} params */
/**
 * Prepare table header, handling the case where row 0 itself contains parameter names.
 * @param {any[]} table
 * @returns {{ header: any[], originalHeader: any[], dataStartRow: number }}
 */
function _prepareTableHeader(table: any[]): { header: any[]; originalHeader: any[]; dataStartRow: number } {
    let header = table[0];
    let dataStartRow = 1;
    const originalHeader = [...header];
    const headerHasParam = header.some((h: any) => {
        const resolved = resolveAlias((h || '').trim());
        return resolved && resolved.parameterId;
    });
    if (headerHasParam) {
        const cols = header.length;
        header = ['Parametro', 'Valor', ...Array(Math.max(0, cols - 2)).fill('')].slice(0, cols);
        dataStartRow = 0;
    }
    return { header, originalHeader, dataStartRow };
}

/**
 * Resolve the element name from the encoded element column or well-ID heuristic.
 * @param {string} elementCol
 * @param {AnyRecord} staging
 */
function _resolveElementName(elementCol: string, staging: AnyRecord) {
    if (!elementCol) return;
    if (elementCol.includes('||{')) {
        const parts = elementCol.split('||');
        staging.elementName = (parts[0] || '').trim();
        try {
            if (parts[1]) staging.source.bbox = JSON.parse(parts[1]);
        }
        catch (e: any) {
            console.debug('[staging] bbox-parse:', e?.message || e);
        }
        return;
    }
    if (!staging.elementName && elementCol.length >= 2) {
        const trimmed = elementCol.trim();
        if (WELL_ID_RE_CANONICAL.test(trimmed)) {
            staging.elementName = canonicalizeWellId(trimmed) || trimmed;
        }
    }
}

/**
 * Attach parsed temporal series metadata to a staging object.
 * @param {string} temporalSeriesCol
 * @param {AnyRecord} staging
 */
function _attachTemporalSeries(temporalSeriesCol: string, staging: AnyRecord) {
    if (!temporalSeriesCol) return;
    try {
        const parsedSeries = JSON.parse(temporalSeriesCol);
        if (Array.isArray(parsedSeries) && parsedSeries.length > 0) {
            staging.source.timeSeries = parsedSeries;
            const latestWithYear = [...parsedSeries].reverse().find((s: any) => Number.isFinite(s?.year));
            if (latestWithYear && !staging.dateLabel) staging.dateLabel = String(latestWithYear.year);
        }
    }
    catch (e: any) {
        console.debug('[staging] temporal-series-parse:', e?.message || e);
    }
}

/**
 * Apply matrix evidence to a staging object.
 * @param {AnyRecord} staging
 * @param {AnyRecord} matrixEvidence
 */
function _applyMatrixEvidence(staging: AnyRecord, matrixEvidence: AnyRecord) {
    if (matrixEvidence.ambiguous) {
        staging.matrix = null;
        staging.source.matrixAmbiguous = true;
        staging.warnings.push('Matrix ambiguous: header/unit evidence conflict');
    }
    else if (matrixEvidence.matrix) {
        staging.matrix = matrixEvidence.matrix;
    }
}

/**
 * Process a single data row into a staging object.
 * @param {any[]} row
 * @param {number} r
 * @param {AnyRecord} ctx
 * @returns {Promise<AnyRecord | null>}
 */
/**
 * Extract parameter/value/unit text from a row given detected column roles.
 * @param {any[]} row
 * @param {AnyRecord} colRoles
 * @returns {{ paramName: string, valueText: string, unitText: string }}
 */
function _extractRowReadings(row: any[], colRoles: AnyRecord): { paramName: string; valueText: string; unitText: string } {
    const paramCol = colRoles.parameter;
    const valueCol = colRoles.value;
    const unitCol = colRoles.unit;
    return {
        paramName: paramCol !== -1 ? (row[paramCol] || '').trim() : '',
        valueText: valueCol !== -1 ? (row[valueCol] || '').trim() : '',
        unitText: unitCol !== -1 ? (row[unitCol] || '').trim() : '',
    };
}

/**
 * Enrich a staging object with family/element/matrix metadata from the row context.
 * @param {AnyRecord} staging
 * @param {any[]} row
 * @param {AnyRecord} ctx
 * @param {number} r
 */
function _enrichStagingFromRow(staging: AnyRecord, row: any[], ctx: AnyRecord, r: number) {
    const { header, colRoles, matrixEvidence } = ctx;
    const paramName = (staging.parameterName || '').trim();
    const familyInfo = detectFamilyFromContext(paramName, header, row.join(' '));
    staging.family = familyInfo.family;
    if (familyInfo.elementName) staging.elementName = familyInfo.elementName;
    const elementCol = row[3] || row[colRoles.parameter === 0 ? 3 : -1] || '';
    _resolveElementName(elementCol, staging);
    _attachTemporalSeries(row[4] || '', staging);
    _applyMatrixEvidence(staging, matrixEvidence);
    staging.rowIndex = r;
}

async function _processTableRow(row: any[], r: number, ctx: AnyRecord): Promise<AnyRecord | null> {
    if (row.every((c: any) => !c || !c.trim())) return null;
    if (isMetadataRow(row)) return null;
    const { colRoles, page, tableIndex, _fallback, _bboxes, confidence } = ctx;
    const { paramName, valueText, unitText } = _extractRowReadings(row, colRoles);
    if (!paramName && !valueText) return null;
    const staging: any = await buildStagingObject({
        parameterName: paramName,
        valueText: valueText,
        unitText: unitText || colRoles.headerUnit,
        source: { page, tableIndex, text: row.join(' | '), _fallback, bbox: _bboxes?.[r] || null },
        tableConfidence: confidence,
    });
    _enrichStagingFromRow(staging, row, ctx, r);
    return staging;
}

export async function processTable(params: any) {
    let { table } = params;
    const { confidence, page, tableIndex = null, _fallback = false, _bboxes = null } = params;
    if (!table || table.length < 2) return [];
    table = normalizeHistoricalTrendTable(table);
    const { header, originalHeader, dataStartRow } = _prepareTableHeader(table);
    if (!isAnalyticalTable(table, header)) return [];
    const dataRows = table.slice(dataStartRow, Math.min(table.length, dataStartRow + 5));
    const colRoles = detectColumnRoles(header, dataRows, originalHeader);
    const matrixEvidence = _detectTableMatrixEvidence({ header, dataRows, colRoles });
    const ctx = { header, colRoles, page, tableIndex, _fallback, _bboxes, confidence, matrixEvidence };
    const readings: any = [];
    for (let r = dataStartRow; r < table.length; r++) {
        const staging = await _processTableRow(table[r], r, ctx);
        if (staging) readings.push(staging);
    }
    return readings;
}
// ---------------------------------------------------------------------------
// Cross-Reference Table Detection (Melhoria 1)
// ---------------------------------------------------------------------------
/** Date pattern for header cells — matches temporal labels in cross-ref Format B/C */
const DATE_HEADER_RE = /(?:\d{4}[_\-/]\d{1,2}|\d{1,2}[_\-/]\d{4}|\d{1,2}\s*(?:SEM|sem)|(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|jan|feb|apr|may|aug|sep|oct|dec)[a-z]*[/\-.]?\s*\d{2,4})/i;
/** Keywords for metadata columns between parameter and value columns (Melhoria 7) */
const META_COL_KEYWORDS = [
    'unidade',
    'unit',
    'un.',
    'unid',
    'referencia',
    'reference',
    'ref',
    'vi',
    'vr',
    'vp',
    'cma',
    'vmp',
    'legislacao',
    'legislation',
    'legis',
    'norma',
    'lei',
    'metodo',
    'method',
    'lq',
    'ld',
    'limite',
    'cas',
    'cas no',
    'n cas',
    'numero cas',
    'valor orientador',
    'valor de referencia',
    'padrao',
    'intervencao',
    'prevencao',
];
/** Reference value column keywords (Melhoria 7) */
const REF_COL_KEYWORDS = [
    'vi',
    'vr',
    'vp',
    'cma',
    'vmp',
    'referencia',
    'reference',
    'limite',
    'padrao',
    'conama',
    'cetesb',
    'intervencao',
    'prevencao',
    'orientador',
    'valor orientador',
    'valor de referencia',
];
/**
 * Classifies a table as simple or cross-reference layout.
 *
 * @param {string[][]} row - Full table (header + data rows)
 * @returns {{
 *   type: 'simple'|'crossref-a'|'crossref-b'|'crossref-c',
 *   wellAxis: 'column'|'row'|null,
 *   paramAxis: 'row'|'column'|null,
 *   wellCols: number[],
 *   metaCols: {index: number, role: string}[],
 *   refCols: {index: number, label: string}[],
 *   dateCols: Map<string, {colIndex: number, date: string}[]>|null,
 *   headerRows: number,
 *   paramCol: number
 * }}
 */
/** Non-anchored well ID regex — finds IDs anywhere in text (for concatenated cells) */
const WELL_ID_GLOBAL_RE = /\b(PM|MW|PZ|PP|PB|PT|PA|RB|SB|PMA|PMR|PMC|PMG|PI|PC|PE|SS|PF)\s*[-.]?\s*\d+[A-Z]?\b/gi;
/**
 * Counts well IDs found in a row's cells. Handles concatenated IDs ("PM-38A PM-39A PM-40A").
 * Returns { count, colIndices[] } where colIndices are columns containing well IDs.
 */
/** @param {any} row */
function _countWellsInRow(row: any) {
    let count = 0;
    const colIndices: any[] = [];
    for (let i = 0; i < (row || []).length; i++) {
        const cell = (row[i] || '').trim();
        const matches = cell.match(WELL_ID_GLOBAL_RE);
        if (matches && matches.length > 0) {
            count += matches.length;
            colIndices.push(i);
        }
    }
    return { count, colIndices };
}
/** @param {any} table */
const SIMPLE_CROSSREF_RESULT = Object.freeze({
    type: 'simple',
    wellAxis: null,
    paramAxis: null,
    wellCols: [],
    metaCols: [],
    refCols: [],
    dateCols: null,
    headerRows: 1,
    paramCol: 0,
});

/**
 * Find the header row with the most well IDs and collect its well columns.
 * @param {any[]} table
 * @returns {{ bestHeaderRow: number, bestWellCount: number, bestWellCols: number[] }}
 */
function _findBestHeaderRow(table: any[]): { bestHeaderRow: number; bestWellCount: number; bestWellCols: number[] } {
    const scanRows = Math.min(table.length, 6);
    let bestHeaderRow = 0;
    let bestWellCount = 0;
    let bestWellCols: number[] = [];
    for (let r = 0; r < scanRows; r++) {
        const { count, colIndices } = _countWellsInRow(table[r]);
        if (count > bestWellCount) {
            bestWellCount = count;
            bestHeaderRow = r;
            bestWellCols = colIndices;
        }
    }
    return { bestHeaderRow, bestWellCount, bestWellCols };
}

/**
 * Count cells matching the date header regex in a row.
 * @param {any[]} row
 * @returns {number}
 */
function _countDateCells(row: any[]): number {
    let count = 0;
    for (const cell of row || []) {
        if (DATE_HEADER_RE.test((cell || '').trim())) count++;
    }
    return count;
}

/**
 * Count well IDs in column 0 of the given data rows.
 * @param {any[]} dataRows
 * @returns {number}
 */
function _countWellsInCol0(dataRows: any[]): number {
    let count = 0;
    for (const row of dataRows) {
        if (row[0] && WELL_ID_RE.test(row[0].trim())) count++;
    }
    return count;
}

/**
 * Determine the metadata role for a normalized header cell.
 * @param {string} cell
 * @returns {string}
 */
function _detectMetaColumnRole(cell: string): string {
    if (['unidade', 'unit', 'un.', 'unid'].some((u: any) => cell.includes(u))) return 'unit';
    if (['metodo', 'method'].some((m: any) => cell.includes(m))) return 'method';
    if (['lq', 'ld', 'limite'].some((l: any) => cell.includes(l))) return 'detection_limit';
    if (['cas', 'n cas', 'numero cas'].some((c: any) => cell.includes(c))) return 'cas';
    if (REF_COL_KEYWORDS.some((r: any) => cell.includes(r))) return 'reference';
    return 'metadata';
}

/**
 * Detect metadata and reference columns from the header row.
 * @param {any[]} headerRow
 * @returns {{ metaCols: any[], refCols: any[], metaColIndices: Set<number> }}
 */
function _detectMetaAndRefColumns(headerRow: any[]): { metaCols: any[]; refCols: any[]; metaColIndices: Set<number> } {
    const metaCols: any = [];
    const refCols: any = [];
    for (let i = 0; i < headerRow.length; i++) {
        const cell = (headerRow[i] || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
        for (const kw of META_COL_KEYWORDS) {
            if (!cell.includes(kw)) continue;
            const role = _detectMetaColumnRole(cell);
            metaCols.push({ index: i, role });
            if (role === 'reference') refCols.push({ index: i, label: (headerRow[i] || '').trim() });
            break;
        }
    }
    const metaColIndices = new Set<number>(metaCols.map((m: any) => m.index));
    return { metaCols, refCols, metaColIndices };
}

/**
 * Build the layout result when wells are arranged in columns (Formats A and B).
 * @param {any[]} headerRow
 * @param {any[]} nextRow
 * @param {AnyRecord} ctx
 * @returns {AnyRecord}
 */
function _buildColumnWellResult(headerRow: any[], nextRow: any[], ctx: AnyRecord): AnyRecord {
    const { bestWellCols, metaCols, refCols, metaColIndices, bestHeaderRow } = ctx;
    const datesInNextRow = _countDateCells(nextRow);
    if (datesInNextRow >= 2) {
        return {
            type: 'crossref-b',
            wellAxis: 'column',
            paramAxis: 'row',
            wellCols: bestWellCols,
            metaCols,
            refCols,
            dateCols: _buildDoubleHeaderMap(headerRow, nextRow),
            headerRows: bestHeaderRow + 2,
            paramCol: _findParamCol(headerRow, nextRow, metaColIndices, bestWellCols),
        };
    }
    return {
        type: 'crossref-a',
        wellAxis: 'column',
        paramAxis: 'row',
        wellCols: bestWellCols,
        metaCols,
        refCols,
        dateCols: null,
        headerRows: bestHeaderRow + 1,
        paramCol: _findParamCol(headerRow, null, metaColIndices, bestWellCols),
    };
}

/**
 * Build the layout result when wells are arranged in rows (Format C).
 * @param {AnyRecord} ctx
 * @returns {AnyRecord}
 */
function _buildRowWellResult(ctx: AnyRecord): AnyRecord {
    const { metaCols, refCols } = ctx;
    return {
        type: 'crossref-c',
        wellAxis: 'row',
        paramAxis: 'column',
        wellCols: [],
        metaCols,
        refCols,
        dateCols: null,
        headerRows: 1,
        paramCol: 0,
    };
}

export function classifyCrossRefLayout(table: any) {
    if (!table || table.length < 3) return { ...SIMPLE_CROSSREF_RESULT };
    const { bestHeaderRow, bestWellCount, bestWellCols } = _findBestHeaderRow(table);
    const headerRow = table[bestHeaderRow];
    const nextRow = table[bestHeaderRow + 1] || [];
    const dataRows = table.slice(bestHeaderRow + 1, Math.min(table.length, bestHeaderRow + 8));
    const wellsInCol0 = _countWellsInCol0(dataRows);
    const { metaCols, refCols, metaColIndices } = _detectMetaAndRefColumns(headerRow);
    const ctx = { bestHeaderRow, bestWellCols, metaCols, refCols, metaColIndices };
    if (bestWellCount >= 2) return _buildColumnWellResult(headerRow, nextRow, ctx);
    const datesInRow0 = _countDateCells(table[0]);
    const datesInNextRow = _countDateCells(nextRow);
    if (wellsInCol0 >= 2 && (datesInRow0 >= 2 || datesInNextRow >= 1)) return _buildRowWellResult(ctx);
    return { ...SIMPLE_CROSSREF_RESULT, metaCols, refCols };
}
/**
 * Finds the parameter column index (first non-well, non-meta column, usually col 0).
 */
/** @param {any} row0 @param {any} row1 @param {any} metaColIndices @param {any} wellColIndices */
function _findParamCol(row0: any, row1: any, metaColIndices: any, wellColIndices: any) {
    const wellSet = new Set(wellColIndices);
    for (let i = 0; i < row0.length; i++) {
        if (!wellSet.has(i) && !metaColIndices.has(i))
            return i;
    }
    return 0;
}
/**
 * Builds a map of wellId → [{colIndex, date}] from double headers (Format B).
 * Propagates well ID from left for merged/empty cells.
 */
/** @param {any} row0 @param {any} row1 */
function _buildDoubleHeaderMap(row0: any, row1: any) {
    const map = new Map();
    let lastWell = null;
    for (let i = 0; i < Math.max(row0.length, row1.length); i++) {
        const cell0 = (row0[i] || '').trim();
        const cell1 = (row1[i] || '').trim();
        if (WELL_ID_RE.test(cell0)) {
            lastWell = canonicalizeWellId(cell0) || cell0;
        }
        if (lastWell && DATE_HEADER_RE.test(cell1)) {
            if (!map.has(lastWell))
                map.set(lastWell, []);
            map.get(lastWell).push({ colIndex: i, date: cell1 });
        }
    }
    return map;
}
/**
 * Processes a cross-reference table into staging objects.
 * Each cell at the intersection of (parameter row × well column) becomes one reading.
 *
 * @param {Object} params
 * @param {string[][]} params.table - Full table data
 * @param {Object} params.layout - Result from classifyCrossRefLayout()
 * @param {number} params.confidence - Table confidence
 * @param {number} [params.page] - Page number
 * @returns {Promise<Object[]>} Array of staging objects
 */
/**
 * Extract per-row metadata and reference values for cross-ref formats A/B.
 * @param {any[]} row
 * @param {AnyRecord} layout
 * @returns {{ rowUnit: string | null, rowMethod: string | null, rowDL: string | null, refValues: any[] }}
 */
function _extractCrossRefRowMeta(row: any[], layout: AnyRecord): { rowUnit: string | null; rowMethod: string | null; rowDL: string | null; refValues: any[] } {
    const unitCol = layout.metaCols.find((m: any) => m.role === 'unit');
    const methodCol = layout.metaCols.find((m: any) => m.role === 'method');
    const dlCol = layout.metaCols.find((m: any) => m.role === 'detection_limit');
    const rowUnit = unitCol ? (row[unitCol.index] || '').trim() : null;
    const rowMethod = methodCol ? (row[methodCol.index] || '').trim() : null;
    const rowDL = dlCol ? (row[dlCol.index] || '').trim() : null;
    const refValues: any = [];
    for (const rc of layout.refCols) {
        const rv = (row[rc.index] || '').trim();
        if (rv) refValues.push({ value: rv, label: rc.label, source: 'document' });
    }
    return { rowUnit, rowMethod, rowDL, refValues };
}

/**
 * Build a staging object for a single cross-ref A/B cell.
 * @param {string} paramName
 * @param {string} valueText
 * @param {string} wellId
 * @param {AnyRecord} meta
 * @param {AnyRecord} ctx
 * @returns {Promise<AnyRecord>}
 */
async function _buildCrossRefABStaging(
    paramName: string,
    valueText: string,
    wellId: string,
    meta: AnyRecord,
    ctx: AnyRecord,
): Promise<AnyRecord> {
    const { page, confidence, dateLabel } = ctx;
    const staging: any = await buildStagingObject({
        parameterName: paramName,
        valueText,
        unitText: meta.rowUnit,
        source: { page, text: `${paramName} | ${wellId} | ${valueText}` },
        tableConfidence: confidence,
    });
    staging.elementName = wellId;
    staging.family = 'well';
    staging.crossRef = true;
    if (dateLabel) staging.dateLabel = dateLabel;
    if (meta.rowMethod) staging.analyticalMethod = meta.rowMethod;
    if (meta.rowDL) staging.detectionLimit = meta.rowDL;
    if (meta.refValues.length > 0) staging.referenceValues = meta.refValues;
    return staging;
}

/**
 * Determine the well ID for a column header, canonicalizing if possible.
 * @param {string} headerCell
 * @returns {string}
 */
function _canonicalizeColumnWell(headerCell: string): string {
    const wellId = headerCell.trim();
    if (WELL_ID_RE.test(wellId)) {
        return canonicalizeWellId(wellId.match(WELL_ID_RE)?.[0] || wellId) || wellId;
    }
    return wellId;
}

/**
 * Process one parameter row for cross-ref formats A/B.
 * @param {any[]} c
 * @param {number} metaColSet
 * @param {AnyRecord} metaColSet
 * @param {any[]} wellColSet
 * @param {AnyRecord} ctx
 * @returns {Promise<AnyRecord[]>}
 */
/**
 * Determine whether a column should be skipped when iterating cross-ref A/B cells.
 * @param {number} c
 * @param {AnyRecord} metaColSet
 * @param {Set<number>} metaColSet
 * @param {Set<number>} wellColSet
 * @returns {boolean}
 */
function _shouldSkipCrossRefColumn(c: number, layout: AnyRecord, metaColSet: Set<number>, wellColSet: Set<number>): boolean {
    if (c === layout.paramCol) return true;
    if (metaColSet.has(c)) return true;
    if (!wellColSet.has(c) && layout.wellCols.length > 0) return true;
    return false;
}

/**
 * Resolve the date label for a cross-ref B column.
 * @param {AnyRecord} layout
 * @param {any[]} table
 * @param {number} c
 * @returns {string | null}
 */
function _resolveCrossRefBDateLabel(layout: AnyRecord, table: any[], c: number): string | null {
    if (layout.type !== 'crossref-b' || !layout.dateCols) return null;
    return (table[1]?.[c] || '').trim() || null;
}

/**
 * Process one parameter row for cross-ref formats A/B.
 * @param {any[]} row
 * @param {number} r
 * @param {AnyRecord} layout
 * @param {any[]} table
 * @param {AnyRecord} ctx
 * @returns {Promise<AnyRecord[]>}
 */
async function _processCrossRefRowAB(row: any[], r: number, layout: AnyRecord, table: any[], ctx: AnyRecord): Promise<AnyRecord[]> {
    if (row.every((c: any) => !c || !c.trim())) return [];
    if (isMetadataRow(row)) return [];
    const paramName = (row[layout.paramCol] || '').trim();
    if (!paramName) return [];
    const { metaColSet, wellColSet } = ctx;
    const meta = _extractCrossRefRowMeta(row, layout);
    const result: any = [];
    const header = table[0];
    for (let c = 0; c < row.length; c++) {
        if (_shouldSkipCrossRefColumn(c, layout, metaColSet, wellColSet)) continue;
        const valueText = (row[c] || '').trim();
        if (!valueText) continue;
        const wellId = _canonicalizeColumnWell(header[c] || '');
        const dateLabel = _resolveCrossRefBDateLabel(layout, table, c);
        const staging = await _buildCrossRefABStaging(paramName, valueText, wellId, meta, { ...ctx, dateLabel });
        staging.rowIndex = r;
        result.push(staging);
    }
    return result;
}

/**
 * Process one well row for cross-ref format C.
 * @param {any[]} row
 * @param {number} r
 * @param {any[]} header
 * @param {AnyRecord} ctx
 * @returns {Promise<AnyRecord[]>}
 */
async function _processCrossRefRowC(row: any[], r: number, header: any[], ctx: AnyRecord): Promise<AnyRecord[]> {
    if (row.every((c: any) => !c || !c.trim())) return [];
    let wellId = (row[0] || '').trim();
    if (!WELL_ID_RE.test(wellId)) return [];
    wellId = canonicalizeWellId(wellId.match(WELL_ID_RE)[0]) || wellId;
    const result: any = [];
    for (let c = 1; c < row.length; c++) {
        const valueText = (row[c] || '').trim();
        if (!valueText) continue;
        const colHeader = (header[c] || '').trim();
        const staging: any = await buildStagingObject({
            parameterName: colHeader || 'unknown',
            valueText,
            source: { page: ctx.page, text: `${wellId} | ${colHeader} | ${valueText}` },
            tableConfidence: ctx.confidence,
        });
        staging.elementName = wellId;
        staging.family = 'well';
        staging.rowIndex = r;
        staging.crossRef = true;
        if (DATE_HEADER_RE.test(colHeader)) staging.dateLabel = colHeader;
        result.push(staging);
    }
    return result;
}

export async function processCrossRefTable(params: any) {
    const { table, layout, confidence, page } = params || {};
    if (!table || table.length < 3) return [];
    const readings: any = [];
    const dataStartRow = layout.headerRows;
    const metaColSet = new Set(layout.metaCols.map((m: any) => m.index));
    const wellColSet = new Set(layout.wellCols);
    const ctx = { page, confidence, metaColSet, wellColSet };
    if (layout.type === 'crossref-a' || layout.type === 'crossref-b') {
        for (let r = dataStartRow; r < table.length; r++) {
            const rowReadings = await _processCrossRefRowAB(table[r], r, layout, table, ctx);
            readings.push(...rowReadings);
        }
    }
    else if (layout.type === 'crossref-c') {
        const header = table[0];
        for (let r = dataStartRow; r < table.length; r++) {
            const rowReadings = await _processCrossRefRowC(table[r], r, header, ctx);
            readings.push(...rowReadings);
        }
    }
    return readings;
}
// ---------------------------------------------------------------------------
// Column Role Detection
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Metadata / Non-Analytical Row Filter (Melhoria 3)
// ---------------------------------------------------------------------------
/**
 * Words that indicate a metadata/administrative row (not analytical data).
 * Matched against the FIRST cell of each row (column 0) after normalization.
 * Applied AFTER cross-ref detection to avoid filtering data rows.
 */
const METADATA_SKIP_WORDS = [
    // Administrative
    'referencia',
    'contratante',
    'endereco',
    'objeto',
    'responsavel',
    'coordenacao',
    'aprovacao',
    'classificacao',
    'laboratorio',
    'revisao',
    'pagina',
    'assinatura',
    'carimbo',
    'cnpj',
    'telefone',
    'email',
    'cep',
    'municipio',
    'estado',
    'documento',
    'protocolo',
    'versao',
    'data do relatorio',
    'numero do relatorio',
    // Subtotals / aggregates
    'total btex',
    'soma xilenos',
    'total voc',
    'subtotal',
    'total geral',
    'soma',
    'total',
    // Method / footnote
    'metodo',
    'method',
    'usepa',
    'observacao',
    'nota',
    'legenda',
    'fonte',
    'referencia bibliografica',
    // Report structure
    'cliente',
    'contrato',
    'projeto',
    'emissao',
    'validade',
    'analista',
    'gerente',
    'diretor',
    'crea',
    'crq',
];
/** Pre-built set for O(1) lookup after normalization */
const _METADATA_SKIP_SET = new Set(METADATA_SKIP_WORDS.map((w: any) => w
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()));
/**
 * Checks whether a row should be skipped as non-analytical metadata.
 * Only checks the first cell (column 0) to avoid false positives in data columns.
 *
 * @param {string[]} row - Table row cells
 * @returns {boolean} true if the row is metadata and should be skipped
 */
function isMetadataRow(row: any) {
    if (!row || row.length === 0)
        return true;
    // F4: Normalize all cells for substring search across all columns
    const normalized = row.map((c: any) => (c || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase());
    const cell0 = normalized[0];
    if (!cell0)
        return false;
    // Exact match or prefix match on col0
    if (_METADATA_SKIP_SET.has(cell0))
        return true;
    for (const skip of _METADATA_SKIP_SET) {
        if (cell0.startsWith(skip + ':') || cell0.startsWith(skip + ' :'))
            return true;
    }
    // F4: Substring match across ALL columns for strong admin indicators
    const allText = normalized.join(' ');
    const ADMIN_SUBS = [
        'resp. tecnico',
        'resp tecnico',
        'responsavel tecnico',
        'crea-',
        'crea ',
        'crq-',
        'art n',
        'cpf ',
        'cnpj ',
        'assinatura',
        'confidencial',
        'pagina ',
        'quadro ',
        'uadro ',
        'tabela ',
        'figura ',
        'nota:',
        'obs:',
        'fonte:',
        'quadro e',
    ];
    for (const sub of ADMIN_SUBS) {
        if (allText.includes(sub))
            return true;
    }
    return false;
}
// ---------------------------------------------------------------------------
// Column Role Detection (Melhoria 4 - expanded keywords + numeric heuristic)
// ---------------------------------------------------------------------------
/** Keywords that indicate a parameter name column */
const PARAM_KEYWORDS = [
    'parametro',
    'parameter',
    'analito',
    'analyte',
    'substancia',
    'substance',
    'composto',
    'compound',
    'ensaio',
    'teste',
    'test',
    'determinacao',
    'analise',
    'analysis',
    'nome',
    'name',
    'quimico',
    'chemical',
    // Melhoria 4: expanded
    'elemento',
    'ion',
    'metal',
    'organico',
    'inorganico',
    'indicador',
    'variavel',
    'especie',
];
/** Keywords that indicate a value/result column */
const VALUE_KEYWORDS = [
    'resultado',
    'result',
    'valor',
    'value',
    'concentracao',
    'concentration',
    'leitura',
    'reading',
    'medida',
    'measurement',
    'amostra',
    'sample',
    'quantificacao',
    'quantification',
    // Melhoria 4: expanded
    'teor',
    'teores',
    'detectado',
    'encontrado',
    'resultado final',
    'resultado analitico',
    'quantificado',
    'medido',
    'determinado',
];
/** Keywords that indicate a unit column */
const UNIT_KEYWORDS = ['unidade', 'unit', 'unid', 'un.', 'medida'];
/**
 * Detects column roles (parameter, value, unit) from header row.
 * Melhoria 4: Falls back to numeric density heuristic when keywords fail.
 *
 * @param {string[]} cell - Header row cells
 * @param {string[][]} [dataRows] - First few data rows for numeric density fallback
 * @param {string[]|null} [originalHeader] - Original header before synthetic header fallback
 * @returns {{ parameter: number, value: number, unit: number, headerUnit: string|null }}
 */
/**
 * Normalize a header cell for keyword matching.
 * @param {any} cell
 * @returns {string}
 */
function _normalizeHeaderCell(cell: any): string {
    return String(cell || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Detect column roles by matching header keywords.
 * @param {any[]} header
 * @returns {{ parameter: number, value: number, unit: number, headerUnit: string|null }}
 */
function _detectRolesByHeaderKeywords(header: any[]): { parameter: number; value: number; unit: number; headerUnit: string | null } {
    const roles = { parameter: -1, value: -1, unit: -1, headerUnit: null as string | null };
    for (let i = 0; i < header.length; i++) {
        const cell = _normalizeHeaderCell(header[i]);
        const unitMatch = cell.match(/\(([^)]+)\)/);
        if (roles.parameter === -1 && PARAM_KEYWORDS.some((k: any) => cell.includes(k))) {
            roles.parameter = i;
        }
        else if (roles.value === -1 && VALUE_KEYWORDS.some((k: any) => cell.includes(k))) {
            roles.value = i;
            if (unitMatch && unitMatch[1] !== undefined) roles.headerUnit = unitMatch[1].trim();
        }
        else if (roles.unit === -1 && UNIT_KEYWORDS.some((k: any) => cell.includes(k))) {
            roles.unit = i;
        }
    }
    return roles;
}

/**
 * Identify reference/threshold columns to exclude from value detection.
 * @param {any[]} header
 * @param {any[]|null} originalHeader
 * @returns {Set<number>}
 */
function _collectReferenceExcludedColumns(header: any[], originalHeader: any): Set<number> {
    const excludeCols = new Set<number>();
    const headersToCheck = [header];
    if (originalHeader && originalHeader !== header) headersToCheck.push(originalHeader);
    const refRe = /^v\.?i\.?\b|valor de intervencao|valor de referencia|^v\.?r\.?\b|^v\.?p\.?\b|^l\.?q\.?\b|limite de quantificacao/i;
    for (const hdr of headersToCheck) {
        for (let c = 0; c < hdr.length; c++) {
            if (refRe.test(_normalizeHeaderCell(hdr[c]))) excludeCols.add(c);
        }
    }
    return excludeCols;
}

/**
 * Find the value column by numeric density when keyword detection fails.
 * @param {any[]} header
 * @param {any[]} dataRows
 * @param {AnyRecord} roles
 * @param {any[]|null} originalHeader
 * @returns {number}
 */
function _detectValueColumnByDensity(header: any[], dataRows: any[], roles: AnyRecord, originalHeader: any): number {
    if (dataRows.length === 0 || header.length < 2) return -1;
    const numericRE = /[<>=≤≥]?\s*\d+[.,]?\d*/;
    const scores = Array(header.length).fill(0);
    const excludeCols = _collectReferenceExcludedColumns(header, originalHeader);
    if (roles.parameter !== -1) excludeCols.add(roles.parameter);
    if (roles.unit !== -1) excludeCols.add(roles.unit);
    for (const row of dataRows) {
        for (let c = 0; c < (row || []).length; c++) {
            if (excludeCols.has(c)) continue;
            if (numericRE.test((row[c] || '').trim())) scores[c]++;
        }
    }
    const maxScore = Math.max(...scores);
    return maxScore >= 2 ? scores.indexOf(maxScore) : -1;
}

/**
 * Apply fallback role assumptions when detection is incomplete.
 * @param {AnyRecord} roles
 * @param {any[]} header
 */
function _applyColumnRoleFallbacks(roles: AnyRecord, header: any[]) {
    if (roles.parameter === -1 && roles.value === -1 && header.length >= 2) {
        roles.parameter = 0;
        roles.value = 1;
        if (header.length >= 3 && roles.unit === -1) roles.unit = 2;
    }
    if (roles.parameter === -1 && roles.value !== -1) {
        roles.parameter = 0;
    }
}

function detectColumnRoles(header: any, dataRows: any, originalHeader: any = null) {
    const roles = _detectRolesByHeaderKeywords(header);
    if (roles.value === -1) {
        roles.value = _detectValueColumnByDensity(header, dataRows || [], roles, originalHeader);
    }
    _applyColumnRoleFallbacks(roles, header);
    return roles;
}
// ---------------------------------------------------------------------------
// Family Detection (heuristic - no LLM)
// ---------------------------------------------------------------------------
/** Well ID regex — canonical definition from types.js (BS-4: removed local duplicate) */
const WELL_ID_RE = WELL_ID_RE_CANONICAL;
/**
 * Keyword map: family → [keywords PT/EN]
 * All keywords are matched with word boundaries (regex \b) to avoid
 * false positives like "rio" inside "relatório" or "solo" inside "absoluto".
 */
const FAMILY_KEYWORDS = {
    well: ['poco', 'well', 'piezometro', 'piezometer', 'monitoring well', 'poco de monitoramento'],
    plume: ['pluma', 'plume', 'isoconcentracao', 'contaminacao', 'fase livre', 'napl', 'dnapl', 'lnapl'],
    lake: ['lago', 'lagoa', 'lake', 'represa', 'reservatorio hidrico', 'acude'],
    river: ['rio', 'corrego', 'arroio', 'river', 'stream', 'creek', 'drenagem', 'ribeiro'],
    spring: ['nascente', 'spring', 'surgencia', 'olho dagua', 'mina dagua'],
    building: ['edificacao', 'building', 'predio', 'galpao'],
    tank: ['tanque', 'tank', 'sasc', 'reservatorio subterraneo'],
    boundary: ['limite', 'boundary', 'perimetro', 'area de estudo', 'poligonal'],
    stratum: ['camada', 'stratum', 'litologia', 'estratigrafia', 'perfil geologico', 'sondagem'],
    sample: ['amostra solo', 'amostra sedimento', 'sample point', 'ponto coleta', 'coleta superficial'],
    area: ['setor', 'departamento', 'unidade operacional', 'area operacional'],
    individual: ['colaborador', 'funcionario', 'trabalhador', 'operador', 'empregado'],
    incident: ['acidente', 'incidente', 'quase-acidente', 'near miss', 'first aid', 'primeiros socorros'],
    emission_source: ['chamine', 'emissao fugitiva', 'emissao atmosferica', 'stack', 'exaustao'],
    waste_stream: ['residuo', 'waste', 'aterro', 'bota-fora', 'pgrs', 'classe i', 'classe ii'],
    effluent_point: ['efluente', 'effluent', 'descarga', 'tratamento efluente'],
    habitat: ['habitat', 'biodiversidade', 'ecossistema', 'reserva legal', 'fauna', 'flora'],
    sensor: ['sensor', 'estacao meteorologica', 'telemetria', 'datalogger'],
    intangible: ['licenca ambiental', 'credito carbono', 'certificado ambiental', 'alvara'],
    blueprint: ['planta baixa', 'dxf', 'cad', 'projeto executivo'],
};
/** Pre-compiled regex for each keyword — uses \b word boundary to avoid substring matches */
const _FAMILY_REGEX_CACHE = new Map();
/** @param {any} keyword */
function _getFamilyRegex(keyword: any) {
    if (!_FAMILY_REGEX_CACHE.has(keyword)) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        _FAMILY_REGEX_CACHE.set(keyword, new RegExp('\\b' + escaped + '\\b'));
    }
    return _FAMILY_REGEX_CACHE.get(keyword);
}
/**
 * Detects the most likely element family from contextual text.
 * Uses regex for well IDs and keyword matching for other families.
 *
 * @param {string} parameterName - Parameter name from the table
 * @param {string[]} [tableHeaders] - Header row of the table
 * @param {string} [fullText] - Additional context text
 * @returns {{ family: string, elementName: string|null }}
 */
export function detectFamilyFromContext(parameterName: any, tableHeaders: any, fullText: any) {
    const allText = [parameterName || '', ...(tableHeaders || []), fullText || '']
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    // Check for well ID pattern first (most specific)
    const wellMatch = (parameterName || '').match(WELL_ID_RE);
    if (wellMatch) {
        return { family: 'well', elementName: canonicalizeWellId(wellMatch[0]) || wellMatch[0] };
    }
    // Also check headers for well IDs
    for (const h of tableHeaders || []) {
        const hMatch = (h || '').match(WELL_ID_RE);
        if (hMatch) {
            return { family: 'well', elementName: null };
        }
    }
    // Keyword matching - uses \b word boundary to avoid false positives
    // (e.g., "rio" inside "relatório", "solo" inside "absoluto")
    for (const [family, keywords] of Object.entries(FAMILY_KEYWORDS)) {
        for (const kw of keywords) {
            const normalized = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const regex = _getFamilyRegex(normalized);
            if (regex.test(allText)) {
                return { family, elementName: null };
            }
        }
    }
    return { family: 'generic', elementName: null };
}
/**
 * Classifies an array of staging objects by confidence color.
 *
 * @param {AnyRecord[]} stagings - Array of staging objects
 * @returns {{ green: AnyRecord[], yellow: AnyRecord[], red: AnyRecord[] }}
 */
export function classifyByConfidence(stagings: any) {
    /** @type {{ green: AnyRecord[], yellow: AnyRecord[], red: AnyRecord[] }} */
    const classified: { green: any[]; yellow: any[]; red: any[] } = { green: [], yellow: [], red: [] };
    for (const s of stagings) {
        if (s.confidence === 'green')
            classified.green.push(s);
        else if (s.confidence === 'yellow')
            classified.yellow.push(s);
        else
            classified.red.push(s);
    }
    return classified;
}
/**
 * Returns a summary of staging results for display.
 *
 * @param {Object[]} stagings
 * @returns {{ total: number, green: number, yellow: number, red: number, autoIngestible: number }}
 */
export function getStagingSummary(stagings: any) {
    const classified = classifyByConfidence(stagings);
    return {
        total: stagings.length,
        green: classified.green.length,
        yellow: classified.yellow.length,
        red: classified.red.length,
        autoIngestible: classified.green.length,
    };
}
// ── Coordinate Table Detection + CRS ────────────────────────
const COORD_KEYWORDS = {
    wellId: ['ponto', 'point', 'poco', 'well', 'station', 'estacion', 'id', 'nome'],
    easting: ['easting', 'este', 'coord_x', 'x_utm', 'x', 'longitude', 'lon', 'lng', 'long'],
    northing: ['northing', 'norte', 'coord_y', 'y_utm', 'y', 'latitude', 'lat'],
    elevation: ['cota', 'elevacao', 'altitude', 'elevation', 'z', 'depth', 'profundidade', 'cota do terreno'],
};
/**
 * CRS patterns - universal, not just Brazilian.
 * Each pattern resolves to an EPSG code.
 */
/** @type {Array<{ re: RegExp, crs?: string, resolve?: (m: RegExpExecArray) => string }>} */
const CRS_PATTERNS = [
    { re: /EPSG\s*:?\s*(\d{4,5})/i, resolve: (m: any) => `EPSG:${m[1]}` },
    { re: /WGS\s*[-]?\s*84/i, crs: 'EPSG:4326' },
    { re: /NAD\s*[-]?\s*83/i, crs: 'EPSG:4269' },
    { re: /NAD\s*[-]?\s*27/i, crs: 'EPSG:4267' },
    { re: /ETRS\s*[-]?\s*89/i, crs: 'EPSG:4258' },
    { re: /GDA\s*[-]?\s*2020/i, crs: 'EPSG:7844' },
    { re: /GDA\s*[-]?\s*94/i, crs: 'EPSG:4283' },
    { re: /JGD\s*[-]?\s*2011/i, crs: 'EPSG:6668' },
    { re: /NZGD\s*[-]?\s*2000/i, crs: 'EPSG:4167' },
    { re: /SWEREF\s*[-]?\s*99/i, crs: 'EPSG:3006' },
    { re: /OSGB\s*[-]?\s*36/i, crs: 'EPSG:27700' },
    {
        re: /SIRGAS\s*2000\s*(?:\/\s*)?UTM\s*(?:zona?|zone)?\s*(\d{1,2})\s*([NS])/i,
        resolve: (m: any) => `EPSG:${31960 + parseInt(m[1])}`,
    },
    { re: /SIRGAS\s*2000/i, crs: 'EPSG:4674' },
    { re: /SAD\s*[-]?\s*69/i, crs: 'EPSG:4618' },
    {
        re: /UTM\s*(?:zona?|zone)?\s*(\d{1,2})\s*([NS])/i,
        resolve: (m: any) => `EPSG:${m[2].toUpperCase() === 'N' ? 32600 + parseInt(m[1]) : 32700 + parseInt(m[1])}`,
    },
    { re: /fuso\s*(\d{1,2})/i, resolve: (m: any) => `EPSG:${32700 + parseInt(m[1])}` },
];
/**
 * Parse coordinate value handling both BR (333.456,78) and US (333,456.78) formats.
 * @param {string} text
 * @returns {number|null}
 */
export function parseCoordinate(text: any) {
    const t = (text || '').trim();
    if (!t)
        return null;
    // BR: "333.456,78" or "7.394.123,45"
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t))
        return parseFloat(t.replace(/\./g, '').replace(',', '.'));
    // US: "333,456.78"
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t))
        return parseFloat(t.replace(/,/g, ''));
    // Simple: "333456.78" or "333456,78"
    return parseFloat(t.replace(/,/g, '.')) || null;
}
/**
 * Detect CRS from free text (document body, headers, metadata).
 * Returns first match or null.
 * @param {string} text - Full document text
 * @returns {{ epsg: string, raw: string }|null}
 */
export function detectCRS(text: any) {
    if (!text)
        return null;
    for (const p of CRS_PATTERNS) {
        const m = p.re.exec(text);
        if (m) {
            const epsg = p.resolve ? p.resolve(m) : p.crs || '';
            return { epsg, raw: m[0] };
        }
    }
    return null;
}
/**
 * Detect if a table contains coordinate data.
 * @param {string[][]} table - 2D array (header + data rows)
 * @returns {{ wellCol: number, eastingCol: number, northingCol: number, elevationCol: number, coordinates: Array<any> }|null}
 */
export function detectCoordinateTable(table: any) {
    if (!table || table.length < 2)
        return null;
    const header = table[0].map((h: any) => (h || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim());
    // Find columns by keyword match
    /** @param {string[]} text */
    const findCol = (keywords: any) => {
        for (let c = 0; c < header.length; c++) {
            if (keywords.some((kw: any) => header[c].includes(kw)))
                return c;
        }
        return -1;
    };
    const eastingCol = findCol(COORD_KEYWORDS.easting);
    const northingCol = findCol(COORD_KEYWORDS.northing);
    // Must have at least easting + northing
    if (eastingCol === -1 || northingCol === -1)
        return null;
    const wellCol = findCol(COORD_KEYWORDS.wellId);
    const elevationCol = findCol(COORD_KEYWORDS.elevation);
    // Extract coordinates from data rows
    const coordinates: any = [];
    for (let r = 1; r < table.length; r++) {
        const row = table[r];
        const easting = parseCoordinate(row[eastingCol]);
        const northing = parseCoordinate(row[northingCol]);
        if (easting == null || northing == null)
            continue;
        const wellId = wellCol >= 0 ? (row[wellCol] || '').trim() : null;
        const elevation = elevationCol >= 0 ? parseCoordinate(row[elevationCol]) : null;
        coordinates.push({ wellId, easting, northing, elevation });
    }
    if (coordinates.length === 0)
        return null;
    return { wellCol, eastingCol, northingCol, elevationCol, coordinates };
}
// ── Field Extractors ────────────────────────────────────────
const FIELD_EXTRACTORS = [
    {
        field: 'project.responsibleTechnical',
        patterns: [
            /respons[aá]vel\s*t[eé]cnico\s*:?\s*([^\n;]{3,80}?)(?:\.|$|\n|laborat|metodo|data|custo)/i,
            /technical\s*responsible\s*:?\s*([^\n;]{3,80}?)(?:\.|$|\n)/i,
        ],
        type: 'text',
        scope: 'project',
    },
    {
        field: 'observation.lab_name',
        patterns: [
            /laborat[oó]rio\s*:?\s*([^\n;]{3,80}?)(?:\.|$|\n|metodo|data|custo)/i,
            /laboratory\s*:?\s*([^\n;]{3,80}?)(?:\.|$|\n)/i,
        ],
        type: 'text',
        scope: 'observation',
    },
    {
        field: 'observation.analytical_method',
        patterns: [/m[eé]todo\s*(?:anal[ií]tico)?\s*:?\s*((?:EPA|USEPA|SMEWW|ASTM|ISO|ABNT|NBR)\s*\S+)/i],
        type: 'text',
        scope: 'observation',
    },
    {
        field: 'observation.date',
        patterns: [
            /data\s*(?:da\s*)?coleta\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
            /sampling\s*date\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
        ],
        type: 'date',
        scope: 'observation',
    },
    {
        field: 'well.profile.constructive.totalDepth',
        patterns: [/prof(?:undidade)?\s*(?:total)?\s*:?\s*(\d+[.,]?\d*)\s*m/i],
        type: 'number',
        scope: 'element',
    },
    {
        field: 'well.profile.waterLevel.depth',
        patterns: [
            /n[ií]vel\s*(?:d['´]?\s*[aá]gua|est[aá]tico)\s*:?\s*(\d+[.,]?\d*)/i,
            /(?:N\.?\s*A\.?|SWL|water\s*level)\s*:?\s*(\d+[.,]?\d*)/i,
        ],
        type: 'number',
        scope: 'element',
    },
    {
        field: 'observation.cost.analytical',
        patterns: [/custo\s*(?:anal[ií]tico)?\s*:?\s*R?\$?\s*(\d+[.,]?\d*)/i],
        type: 'currency',
        scope: 'observation',
    },
    {
        field: 'observation.detection_limit',
        patterns: [/(?:LQ|LD|LOQ|LOD|limite\s*de\s*(?:quantifica|detec))\s*:?\s*(\d+[.,]?\d*)/i],
        type: 'number',
        scope: 'observation',
    },
    {
        field: 'observation.sample_code',
        patterns: [/(?:amostra|sample)\s*(?:id|code|codigo)?\s*:?\s*([A-Z0-9][\w-]+)/i],
        type: 'text',
        scope: 'observation',
    },
];
/**
 * Extract structured fields from free text using regex patterns.
 * Fields extracted from free text get confidence YELLOW (not GREEN).
 * @param {string} text - Document text
 * @returns {Array<{ field: string, value: string|number, type: string, scope: string, raw: string, confidence: string }>}
 */
export function extractFields(text: any) {
    if (!text)
        return [];
    /** @type {Array<{ field: string, value: string|number, type: string, scope: string, raw: string, confidence: string }>} */
    const results: any[] = [];
    for (const extractor of FIELD_EXTRACTORS) {
        for (const pattern of extractor.patterns) {
            const m = pattern.exec(text);
            if (m && m[1]) {
                let value: any = m[1].trim();
                // Parse number types
                if (extractor.type === 'number' || extractor.type === 'currency') {
                    value = parseFloat(value.replace(/,/g, '.')) || value;
                }
                results.push({
                    field: extractor.field,
                    value,
                    type: extractor.type,
                    scope: extractor.scope,
                    raw: m[0],
                    confidence: 'yellow', // text corrido = YELLOW per devil's advocate
                });
                break; // first match per extractor
            }
        }
    }
    return results;
}
/**
 * Extract deterministic document metadata: CRS, coordinate tables, fields.
 * (Complementa extractDocumentMetadata em docAIAnalyzer.js que usa LLM)
 * @param {string} fullText - Full document text
 * @param {Array<any>} tables - All extracted tables
 * @returns {{ crs: object|null, coordinateTables: Array<any>, fields: Array<any> }}
 */
export function extractDocMetadataDeterministic(fullText: any, tables: any) {
    const crs = detectCRS(fullText);
    const coordinateTables: any = [];
    for (let i = 0; i < (tables || []).length; i++) {
        const coordResult = detectCoordinateTable(tables[i].table || tables[i]);
        if (coordResult) {
            coordinateTables.push({ tableIndex: i, ...coordResult });
        }
    }
    const fields = extractFields(fullText);
    return { crs, coordinateTables, fields };
}
//# sourceMappingURL=staging.js.map
//# sourceMappingURL=staging.js.map
