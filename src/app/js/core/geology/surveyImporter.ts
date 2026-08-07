// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SURVEY IMPORTER — Parse LAS/CSV directional drilling surveys
   ================================================================
   P1-8 Family Fault Wells Directional Phase 4 (Claude-owner per §0.4)

   Importa arquivos de survey de poços direcionais nos formatos:
   - CSV: MD, Inc, Azi como colunas (com header flexível)
   - LAS: Log ASCII Standard 2.0/3.0 — formato canônico O&G/mineração

   Output: { stations: SurveyStation[], header?: object, errors: string[] }
   compatível diretamente com `wellTrajectory.computeMinimumCurvatureTrajectory`.

   Referências:
   - LAS 2.0 spec: https://www.cwls.org/wp-content/uploads/2017/02/Las2_Update_Feb2017.pdf
   - LAS 3.0 spec: https://www.cwls.org/wp-content/uploads/2014/09/LAS_3_File_Structure.pdf
   - SPE 84246 wellbore position calculation (formato survey de campo)

   Spec: docs/specs/features/SPEC_FAMILY_FAULT_WELLS_DIRECTIONAL.md §"Poços Direcionais"
   ================================================================ */

interface Station {
    md: number;
    inc: number;
    azi: number;
}

interface LasCurve {
    mnemonic: string;
    unit: string;
    description: string;
}

interface LasHeader {
    wellName: string;
    curves: Array<LasCurve>;
    version: string;
}

/**
 * Variações canônicas de nomes de coluna por campo. Lowercase + sem espaço.
 */
const COLUMN_ALIASES: Readonly<Record<string, string[]>> = Object.freeze({
    md: ['md', 'measureddepth', 'depth', 'depthm', 'mdepth', 'measure', 'dept'],
    inc: ['inc', 'inclination', 'incl', 'inclinacao', 'incdeg', 'incdegrees', 'i'],
    azi: ['azi', 'azimuth', 'az', 'azimute', 'azideg', 'azdeg', 'a', 'direction'],
});

/**
 * Mapeia headers brutos para campos canônicos {md, inc, azi}.
 *
 * @param headers - Lista de headers brutos
 * @returns índices das colunas + lista de headers não mapeados
 */
export function normalizeColumnHeaders(headers: string[]): {
    md: number;
    inc: number;
    azi: number;
    unmapped: string[];
} {
    const result: { md: number; inc: number; azi: number; unmapped: string[] } = {
        md: -1,
        inc: -1,
        azi: -1,
        unmapped: [],
    };
    if (!Array.isArray(headers)) return result;
    headers.forEach((raw, idx) => {
        const normalized = String(raw)
            .toLowerCase()
            .replace(/[\s_-]/g, '')
            .trim();
        let matched = false;
        for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
            if (aliases.includes(normalized)) {
                const f = field as 'md' | 'inc' | 'azi';
                if (result[f] === -1) result[f] = idx;
                matched = true;
                break;
            }
        }
        if (!matched) result.unmapped.push(raw);
    });
    return result;
}

/**
 * Detecta formato do arquivo a partir do conteúdo.
 */
export function detectSurveyFormat(text: string): 'csv' | 'las' | 'unknown' {
    if (typeof text !== 'string' || text.length === 0) return 'unknown';
    const head = text.slice(0, 2000);
    // LAS tem seções obrigatórias começando com '~'
    if (/^\s*~V(?:ersion)?[\s\S]*?~A(?:SCII)?/im.test(head) || head.includes('~Version') || head.includes('~VERSION')) {
        return 'las';
    }
    // CSV-ish: tem quebras de linha + delimitador (,;\t)
    if (head.includes('\n') && /[,;\t]/.test(head)) return 'csv';
    return 'unknown';
}

/**
 * Detecta delimitador mais provável de um CSV.
 */
function _detectDelimiter(text: string): string {
    const sample = text.slice(0, 1000);
    const counts = {
        ',': (sample.match(/,/g) || []).length,
        ';': (sample.match(/;/g) || []).length,
        '\t': (sample.match(/\t/g) || []).length,
    };
    return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0] as [string, number])[0];
}

/**
 * Parser CSV minimalista - não suporta campos com vírgula dentro de quotes
 * (survey files raramente têm). Para CSV completo, usar utils/io/csv parser
 * existente.
 */
function _splitLine(line: string, delimiter: string): string[] {
    return line.split(delimiter).map((s) => s.trim());
}

/**
 * Parse CSV de survey directional. Detecta header automaticamente.
 */
export function parseSurveyCSV(
    text: string,
    opts: { delimiter?: string; skipEmpty?: boolean } = {},
): {
    ok: boolean;
    stations: Array<Station>;
    errors: string[];
    delimiter?: string;
    headers?: string[];
} {
    if (typeof text !== 'string' || text.trim().length === 0) {
        return { ok: false, stations: [], errors: ['empty_input'] };
    }
    const delimiter = opts.delimiter || _detectDelimiter(text);
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) {
        return { ok: false, stations: [], errors: ['too_few_lines'] };
    }

    // Encontra primeira linha não-vazia, não-comentário como header
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = (lines[i] as string).trim();
        if (trimmed.length === 0) continue;
        if (trimmed.startsWith('#')) continue;
        headerIdx = i;
        break;
    }
    if (headerIdx === -1) {
        return { ok: false, stations: [], errors: ['no_header_found'] };
    }

    const headers = _splitLine(lines[headerIdx] as string, delimiter);
    const colMap = normalizeColumnHeaders(headers);
    if (colMap.md === -1 || colMap.inc === -1 || colMap.azi === -1) {
        return {
            ok: false,
            stations: [],
            errors: [`missing_columns: md=${colMap.md} inc=${colMap.inc} azi=${colMap.azi}`],
            delimiter,
            headers,
        };
    }

    const stations: Array<Station> = [];
    const errors: Array<string> = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = (lines[i] as string).trim();
        if (line.length === 0) continue;
        if (line.startsWith('#')) continue;
        const fields = _splitLine(line, delimiter);
        const md = Number(fields[colMap.md]);
        const inc = Number(fields[colMap.inc]);
        const azi = Number(fields[colMap.azi]);
        if (!Number.isFinite(md) || !Number.isFinite(inc) || !Number.isFinite(azi)) {
            errors.push(`line_${i + 1}_invalid_numbers`);
            continue;
        }
        stations.push({ md, inc, azi });
    }

    return {
        ok: stations.length > 0,
        stations,
        errors,
        delimiter,
        headers,
    };
}

/**
 * Parse arquivo LAS (Log ASCII Standard) 2.0/3.0.
 *
 * Estrutura LAS:
 *   ~V (Version): VERS, WRAP, etc.
 *   ~W (Well): WELL, FLD, COMP, etc.
 *   ~C (Curve): mnemonic.unit description
 *   ~P (Parameter): opcional
 *   ~A (ASCII): data rows space-separated
 */
export function parseSurveyLAS(text: string): {
    ok: boolean;
    stations: Array<Station>;
    errors: string[];
    header?: LasHeader;
} {
    if (typeof text !== 'string' || text.trim().length === 0) {
        return { ok: false, stations: [], errors: ['empty_input'] };
    }
    const lines = text.split(/\r?\n/);
    const header: LasHeader = { wellName: '', curves: [], version: '' };
    const errors: Array<string> = [];

    let section: string | null = null;
    const dataLines: Array<string> = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.length === 0 || line.startsWith('#')) continue;
        // Section marker
        if (line.startsWith('~')) {
            const sec = line.charAt(1).toUpperCase();
            section = sec;
            continue;
        }
        if (section === 'V') {
            // LAS format: MNEMONIC.UNIT  DATA : DESCRIPTION
            // VERS. 2.0 : CWLS LOG ASCII STANDARD → DATA = "2.0"
            const m = /^vers\s*\.\s*\S*\s+([\d.]+)\s*:/i.exec(line);
            if (m) header.version = m[1] as string;
        } else if (section === 'W') {
            // WELL.       MW-001 : Well Name → DATA = "MW-001"
            const m = /^well\s*\.\s*\S*\s+(\S.*?)\s*:/i.exec(line);
            if (m) header.wellName = (m[1] as string).trim();
        } else if (section === 'C') {
            // mnemonic.unit description
            const m = /^([A-Za-z_][\w]*)\s*\.\s*(\S*)\s*:\s*(.+)?$/i.exec(line);
            if (m) {
                header.curves.push({
                    mnemonic: (m[1] as string).toLowerCase(),
                    unit: m[2] || '',
                    description: (m[3] || '').trim(),
                });
            }
        } else if (section === 'A') {
            dataLines.push(line);
        }
    }

    if (header.curves.length === 0) {
        return { ok: false, stations: [], errors: ['no_curve_section'], header };
    }
    if (dataLines.length === 0) {
        return { ok: false, stations: [], errors: ['no_data_section'], header };
    }

    // Mapeia curves → md/inc/azi via aliases
    const headers = header.curves.map((c) => c.mnemonic);
    const colMap = normalizeColumnHeaders(headers);
    if (colMap.md === -1 || colMap.inc === -1 || colMap.azi === -1) {
        return {
            ok: false,
            stations: [],
            errors: [`missing_curves: md=${colMap.md} inc=${colMap.inc} azi=${colMap.azi}`],
            header,
        };
    }

    const stations: Array<Station> = [];
    for (let i = 0; i < dataLines.length; i++) {
        // LAS data é space-separated (whitespace flexível)
        const fields = (dataLines[i] as string).split(/\s+/);
        const md = Number(fields[colMap.md]);
        const inc = Number(fields[colMap.inc]);
        const azi = Number(fields[colMap.azi]);
        if (!Number.isFinite(md) || !Number.isFinite(inc) || !Number.isFinite(azi)) {
            errors.push(`data_line_${i + 1}_invalid`);
            continue;
        }
        stations.push({ md, inc, azi });
    }

    return {
        ok: stations.length > 0,
        stations,
        errors,
        header,
    };
}

/**
 * Importer unificado: detecta formato e delega para parser apropriado.
 * Output normalizado independente do formato de entrada.
 */
export function importSurvey(
    text: string,
    opts: { delimiter?: string; skipEmpty?: boolean } = {},
): { ok: boolean; format: string; stations: Array<Station>; errors: string[]; header?: any } {
    const format = detectSurveyFormat(text);
    if (format === 'csv') {
        const r = parseSurveyCSV(text, opts);
        return { ...r, format };
    }
    if (format === 'las') {
        const r = parseSurveyLAS(text);
        return { ...r, format };
    }
    return { ok: false, format, stations: [], errors: ['unknown_format'] };
}
