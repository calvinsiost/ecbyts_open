// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * Lab Result Reconciliation — Day-2 Journey (LAB-DATA-INGESTION-JOURNEY-001 F10)
 *
 * Pure logic that closes the named gap of SPEC_LAB_DATA_INGESTION_JOURNEY:
 * a dedicated "Day-2" reconciliation view over the existing wizard +
 * `labApiMatcher.js`. The professional has already imported a model with
 * campaigns + monitoring elements; new lab results arrive (paste/CSV).
 * This module decides, per incoming row, whether it matches an existing
 * campaign + element, is ambiguous, a duplicate, or unmatched — reusing
 * `labApiMatcher` (no re-implementation of fuzzy/date/unit math).
 *
 * Reuso: `core/etl/labApiMatcher.js` (similarityRatio, fuzzyMatchName,
 * matchCampaignByDate, normalizeUnit, detectDuplicate).
 *
 * Pure: no DOM, no storage, no network — testable via node:test.
 */

import { fuzzyMatchName, matchCampaignByDate, normalizeUnit, detectDuplicate } from './labApiMatcher.js';

// ============================================================================
// CSV-ish parsing (minimal, dependency-free)
// ============================================================================

/**
 * Split a single delimited line honoring double quotes.
 * Suporta vírgula, ponto-e-vírgula ou tab como separador (auto-detect).
 * @param {string} line
 * @param {string} delim
 * @returns {string[]}
 */
function splitLine(line: any, delim: any) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQ && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else inQ = !inQ;
        } else if (ch === delim && !inQ) {
            out.push(cur.trim());
            cur = '';
        } else cur += ch;
    }
    out.push(cur.trim());
    return out;
}

/** Auto-detect the most likely delimiter from a header line. */
function detectDelimiter(headerLine: any) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    for (const ch of headerLine) if (ch in counts) counts[ch as keyof typeof counts]++;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0] || ',';
}

const HEADER_ALIASES = Object.freeze({
    parameter: ['parameter', 'parametro', 'parâmetro', 'analyte', 'analito', 'composto'],
    value: ['value', 'valor', 'result', 'resultado', 'concentration', 'concentracao'],
    unit: ['unit', 'unidade', 'unid', 'uom'],
    date: ['date', 'data', 'sampledate', 'data coleta', 'collection date', 'data_coleta'],
    location: ['location', 'ponto', 'sample location', 'point', 'local', 'well', 'poco', 'poço'],
});

/** Map raw header tokens to canonical reconciliation fields. */
function mapHeaders(headers: any) {
    const idx: Record<string, any> = {};
    headers.forEach((h: any, i: any) => {
        const norm = String(h || '')
            .trim()
            .toLowerCase();
        for (const [canon, aliases] of Object.entries(HEADER_ALIASES)) {
            if (idx[canon] == null && aliases.includes(norm)) idx[canon] = i;
        }
    });
    return idx;
}

/**
 * Parse pasted lab text into normalized rows. Never throws — returns
 * `{ rows, errors }` so the UI can surface partial failures (offline-first).
 * @param {string} text
 * @returns {{ rows: Array<{parameter:string,value:string,unit:string,date:string,location:string,_line:number}>, errors: string[] }}
 */
export function parseLabText(text: any) {
    const errors = [];
    if (typeof text !== 'string' || !text.trim()) {
        return { rows: [], errors: ['empty_input'] };
    }
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
        return { rows: [], errors: ['need_header_plus_one_row'] };
    }
    const delim = detectDelimiter(lines[0]);
    const headers = splitLine(lines[0], delim);
    const idx = mapHeaders(headers);
    if (idx.parameter == null || idx.value == null) {
        errors.push('missing_parameter_or_value_column');
    }
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = splitLine(lines[i], delim);
        rows.push({
            parameter: idx.parameter != null ? cells[idx.parameter] || '' : '',
            value: idx.value != null ? cells[idx.value] || '' : '',
            unit: idx.unit != null ? cells[idx.unit] || '' : '',
            date: idx.date != null ? cells[idx.date] || '' : '',
            location: idx.location != null ? cells[idx.location] || '' : '',
            _line: i + 1,
        });
    }
    return { rows, errors };
}

// ============================================================================
// Reconciliation
// ============================================================================

/**
 * Reconcile one parsed lab row against existing campaigns + elements.
 * Status precedence: duplicate > unmatched > ambiguous > matched.
 * @param {{parameter:string,value:string,unit:string,date:string,location:string,_line:number}} row
 * @param {{campaigns:any[], elements:any[], existingSamples?:any[], fuzzyThreshold?:number, dateWindowDays?:number}} ctx
 * @returns {{line:number,parameter:string,status:'matched'|'ambiguous'|'unmatched'|'duplicate',campaign:any,element:any,confidence:number,notes:string[]}}
 */
export function reconcileRow(row: any, ctx: any) {
    const notes = [];
    const fuzzyThreshold = ctx.fuzzyThreshold ?? 0.7;
    const dateWindowDays = ctx.dateWindowDays ?? 7;

    // 1. Duplicate guard (idempotency) — reuse labApiMatcher.detectDuplicate
    const dup = detectDuplicate(
        { lab_id: row.location, sample_id: row.parameter, timestamp: row.date },
        (ctx.existingSamples || []).map((s: any) => ({
            lab_id: s.location,
            sample_id: s.parameter,
            timestamp: s.date,
            id: s.id
        })),
    );
    if (dup.isDuplicate) {
        return {
            line: row._line,
            parameter: row.parameter,
            status: 'duplicate',
            campaign: null,
            element: { id: dup.matchingId },
            confidence: 1,
            notes: ['already_imported'],
        };
    }

    // 2. Element match by location name (fuzzy) — reuse fuzzyMatchName
    const elemMatch = fuzzyMatchName(
        row.location,
        (ctx.elements || []).map((e: any) => ({
            id: e.id,
            name: e.name
        })),
        fuzzyThreshold,
    );

    // 3. Campaign match by date — reuse matchCampaignByDate
    const campMatch = row.date
        ? matchCampaignByDate(
              row.date,
              (ctx.campaigns || []).map((c: any) => ({
                  id: c.id,
                  startDate: c.startDate,
                  endDate: c.endDate
              })),
              dateWindowDays,
          )
        : null;

    // 4. Unit sanity (informational only, never blocks) — reuse normalizeUnit
    if (row.unit) {
        const conv = normalizeUnit(Number(row.value) || 0, row.unit, 'mg/L');
        if (!conv.ok) notes.push('unit_unrecognized');
    }

    let status = /** @type {'matched'|'ambiguous'|'unmatched'} */ ('unmatched');
    let confidence = 0;
    if (elemMatch && campMatch) {
        status = 'matched';
        confidence = Math.min(elemMatch.score, campMatch.score);
    } else if (elemMatch || campMatch) {
        status = 'ambiguous';
        confidence = (elemMatch?.score ?? 0 + (campMatch?.score ?? 0)) / 2;
        if (!elemMatch) notes.push('no_element_match');
        if (!campMatch) notes.push('no_campaign_match');
    } else {
        notes.push('no_element_or_campaign');
    }

    return {
        line: row._line,
        parameter: row.parameter,
        status,
        campaign: campMatch ? { id: campMatch.id, score: campMatch.score } : null,
        element: elemMatch ? { id: elemMatch.id, name: elemMatch.name, score: elemMatch.score } : null,
        confidence: Math.round(confidence * 100) / 100,
        notes,
    };
}

/**
 * Reconcile a full batch and produce a summary (powers the Day-2 view).
 * @param {Array<any>} rows  output of parseLabText().rows
 * @param {{campaigns:any[], elements:any[], existingSamples?:any[], fuzzyThreshold?:number, dateWindowDays?:number}} ctx
 * @returns {{results:any[], summary:{total:number,matched:number,ambiguous:number,unmatched:number,duplicate:number}}}
 */
export function reconcileBatch(rows: any, ctx: any) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const safeCtx = ctx && typeof ctx === 'object' ? ctx : { campaigns: [], elements: [] };
    const results = safeRows.map((r) => reconcileRow(r, safeCtx));
    const summary = { total: results.length, matched: 0, ambiguous: 0, unmatched: 0, duplicate: 0 };
    for (const r of results) (summary as any)[(r as any).status]++;
    return { results, summary };
}
