// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.1.5

/**
 * dateNormalizer.js - Normalizacao robusta de datas para o pipeline de ingestao.
 *
 * Converte Date objects, strings DD/MM/YYYY, MM/DD/YYYY, ISO, e serial Excel
 * para formato ISO YYYY-MM-DD. Timezone-safe: usa getters locais para Date objects
 * evitando bug de off-by-one do SheetJS cellDates (BS1).
 *
 * @module core/ingestion/dateNormalizer
 */

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

const ISO_RE = /^\d{4}-\d{2}-\d{2}/;
const SLASH_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

// Excel epoch: Jan 1, 1900 = serial 1 (JS Date epoch offset)
const EXCEL_EPOCH_OFFSET = 25569;
const MS_PER_DAY = 86400000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normaliza um valor de data para ISO YYYY-MM-DD.
 *
 * Ordem de deteccao:
 * 1. Date object → getFullYear/getMonth/getDate (local, nao UTC)
 * 2. Number → serial Excel
 * 3. String ISO → extrair direto
 * 4. String DD/MM/YYYY ou MM/DD/YYYY → swap conforme locale
 * 5. Fallback: new Date(value) → null se Invalid Date
 *
 * @param value — valor bruto (Date, string, number)
 * @param locale - formato esperado para strings ambiguas
 * @returns ISO "YYYY-MM-DD" ou null se impossivel parsear
 */
export function normalizeDate(
    value: unknown,
    locale: 'dd/mm' | 'mm/dd' | 'auto' = 'dd/mm',
): string | null {
    if (value == null || value === '') return null;

    const fromDate = _normalizeDateObject(value);
    if (fromDate !== null) return fromDate;

    const fromSerial = _normalizeExcelSerial(value);
    if (fromSerial !== null) return fromSerial;

    const str = String(value).trim();
    if (!str) return null;

    const fromIso = _normalizeIsoString(str);
    if (fromIso !== null) return fromIso;

    const fromSlash = _normalizeSlashDate(str, locale);
    if (fromSlash !== null) return fromSlash;

    return _normalizeFallbackDate(str);
}

/**
 * Auto-detecta o locale de data a partir de uma amostra de valores.
 * Escaneia ate 20 valores nao-nulos. Se qualquer um tiver campo > 12
 * na primeira posicao, e DD/MM. Se na segunda, e MM/DD.
 * Se todos forem ambiguos, retorna o locale padrao da app.
 *
 * @param sampleValues — primeiros N valores de sampleDate
 * @param appLocale - locale da app ('pt-BR', 'en-US', etc.)
 * @returns locale detectado
 */
export function detectDateLocale(
    sampleValues: unknown[],
    appLocale: string = 'pt-BR',
): 'dd/mm' | 'mm/dd' {
    const MAX_SCAN = 20;
    let scanned = 0;

    for (const val of sampleValues) {
        if (val == null || val === '' || val instanceof Date) continue;
        const str = String(val).trim();
        const m = str.match(SLASH_RE);
        if (!m) continue;

        const a = parseInt(m[1] as string, 10);
        const b = parseInt(m[2] as string, 10);

        if (a > 12) return 'dd/mm'; // Conclusivo: primeiro campo e dia
        if (b > 12) return 'mm/dd'; // Conclusivo: segundo campo e dia

        scanned++;
        if (scanned >= MAX_SCAN) break;
    }

    // Todos ambiguos - usar locale da app
    return appLocale.startsWith('en') ? 'mm/dd' : 'dd/mm';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _normalizeDateObject(value: unknown): string | null {
    if (!(value instanceof Date)) return null;
    if (isNaN(value.getTime())) return null;
    return _formatLocal(value);
}

function _normalizeExcelSerial(value: unknown): string | null {
    if (typeof value !== 'number' || value <= 1 || value >= 200000) return null;
    const d = new Date((value - EXCEL_EPOCH_OFFSET) * MS_PER_DAY);
    if (isNaN(d.getTime())) return null;
    return _formatLocal(d);
}

function _normalizeIsoString(str: string): string | null {
    if (!ISO_RE.test(str)) return null;
    return str.split('T')[0] ?? null;
}

function _normalizeSlashDate(
    str: string,
    locale: 'dd/mm' | 'mm/dd' | 'auto',
): string | null {
    const m = str.match(SLASH_RE);
    if (!m) return null;

    const a = parseInt(m[1] as string, 10);
    const b = parseInt(m[2] as string, 10);
    const year = m[3] as string;

    // Disambiguacao: se primeiro campo > 12, DEVE ser dia (DD/MM)
    if (a > 12) {
        return `${year}-${_pad(b)}-${_pad(a)}`; // DD/MM/YYYY
    }
    // Se segundo campo > 12, DEVE ser dia (MM/DD)
    if (b > 12) {
        return `${year}-${_pad(a)}-${_pad(b)}`; // MM/DD/YYYY
    }
    // Ambiguo: usar locale hint
    if (locale === 'mm/dd') {
        return `${year}-${_pad(a)}-${_pad(b)}`; // MM/DD/YYYY
    }
    // Default: DD/MM (padrao brasileiro)
    return `${year}-${_pad(b)}-${_pad(a)}`; // DD/MM/YYYY
}

function _normalizeFallbackDate(str: string): string | null {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return _formatLocal(d);
    }
    return null;
}

function _formatLocal(d: Date): string {
    return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
}

function _pad(n: number): string {
    return String(n).padStart(2, '0');
}
