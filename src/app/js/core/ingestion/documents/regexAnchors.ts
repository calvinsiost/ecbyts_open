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
 * regexAnchors.js - Deterministic regex engines for document ingestion
 * ADR-022: Neuro-Symbolic Document Ingestion - Layer 2 (Deterministic Anchoring)
 *
 * Tres engines de regex para extracao de dados numericos de relatorios laboratoriais:
 * 1. CAS Number - identifica e valida numeros CAS no texto
 * 2. LQ/ND Values - extrai operadores (<, >, ND, LQ) e valores numericos
 * 3. Units - normaliza unidades de medida
 *
 * @module core/ingestion/documents/regexAnchors
 */

// ---------------------------------------------------------------------------
// CAS Number Engine
// ---------------------------------------------------------------------------

/**
 * Regex for CAS Registry Numbers: XXXXXXX-XX-X format
 * Captures 2-7 digit prefix, 2-digit middle, 1-digit check
 */
const CAS_REGEX: RegExp = /\b(\d{2,7})-(\d{2})-(\d)\b/g;

/**
 * Validates CAS check digit using weighted-sum modulo 10
 * @param casNumber - Full CAS number string (e.g. "71-43-2")
 */
function validateCASCheckDigit(casNumber: string): boolean {
    const digits = casNumber.replace(/-/g, '');
    const checkDigit = parseInt(digits[digits.length - 1] ?? '', 10);
    let sum = 0;
    const len = digits.length - 1;
    for (let i = 0; i < len; i++) {
        sum += parseInt(digits[i] ?? '', 10) * (len - i);
    }
    return sum % 10 === checkDigit;
}

/**
 * Extracts all valid CAS numbers from a text block.
 * Validates format AND check digit.
 *
 * @param text - Input text to scan
 * @returns Array of valid CAS numbers with positions
 */
export function extractCASNumbers(text: string): Array<{ cas: string; index: number }> {
    if (!text || typeof text !== 'string') return [];

    const results: Array<{ cas: string; index: number }> = [];
    let match: RegExpExecArray | null;

    // Reset regex state (global flag)
    CAS_REGEX.lastIndex = 0;

    while ((match = CAS_REGEX.exec(text)) !== null) {
        const cas = match[0];
        if (validateCASCheckDigit(cas)) {
            results.push({
                cas,
                index: match.index,
            });
        }
    }

    return results;
}

// ---------------------------------------------------------------------------
// Value + Operator Engine (LQ/ND)
// ---------------------------------------------------------------------------

/**
 * Regex for LQ/ND values in laboratory reports.
 * Handles Brazilian comma-decimal, ND, LQ, n.d., n.a., operators (<, >, <=, >=)
 *
 * Groups:
 * 1 - Operator or qualifier (optional): <, >, <=, >=, ND, LQ, n.d., n.a.
 * 2 - Numeric value (optional): integer or decimal with comma or dot
 */
const _VALUE_REGEX: RegExp =
    /(?:(<|>|≤|≥|<=|>=)\s*)?(\d+(?:[.,]\d+)?(?:\s*[×xX]\s*10\s*[-−]\s*\d+)?)|(?:(ND|LQ|n\.d\.|n\.a\.|N\.D\.|N\.A\.|nd|lq)(?:\s*(?:[=:]\s*)?(\d+(?:[.,]\d+)?))?)/gi;

/**
 * Normalizes a numeric string with locale-aware parsing.
 * Handles Brazilian (comma-decimal, dot-milhar), US (dot-decimal),
 * and scientific notation.
 *
 * Desambiguacao ponto vs milhar:
 * - Se contem `,` e `.` → ponto=milhar, virgula=decimal (BR/EU)
 * - Se contem `.` sem `,`: parte apos ultimo ponto tem 3 digitos E int > 0 → milhar BR
 * - Se contem `.` sem `,`: caso contrario → decimal EN
 * - Se contem `,` sem `.` → virgula=decimal BR
 *
 * @param raw - Raw numeric string (e.g. "0,05", "1.980", "1.980,5")
 * @param locale? - Optional locale hint ('pt-BR', 'en-US'). Auto-detect if omitted.
 */
function parseNumericValue(raw: string, locale?: string): number | null {
    if (!raw) return null;

    let cleaned = raw.trim();
    if (!cleaned) return null;

    // Handle scientific notation: "2,3 x 10-5" or "2.3 × 10−5"
    const sciMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*[×xX]\s*10\s*[-−]\s*(\d+)$/);
    if (sciMatch) {
        const base = parseFloat((sciMatch[1] ?? '').replace(',', '.'));
        const exp = parseInt(sciMatch[2] ?? '', 10);
        return base * Math.pow(10, -exp);
    }

    const hasDot = cleaned.includes('.');
    const hasComma = cleaned.includes(',');

    // Both dot and comma: dot=milhar, comma=decimal (BR/EU: "1.980,5")
    if (hasDot && hasComma) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        const value = parseFloat(cleaned);
        return isNaN(value) ? null : value;
    }

    // Comma only: comma=decimal (BR: "0,05", "38,7")
    if (hasComma && !hasDot) {
        cleaned = cleaned.replace(',', '.');
        const value = parseFloat(cleaned);
        return isNaN(value) ? null : value;
    }

    // Dot only: disambiguate milhar BR vs decimal EN
    if (hasDot && !hasComma) {
        // Locale override
        if (locale === 'en-US') {
            return parseFloat(cleaned) || null;
        }

        const parts = cleaned.split('.');
        const lastPart = parts[parts.length - 1] ?? '';
        const intPart = parts[0] ?? '';

        // Rule: 3 digits after last dot AND integer part > 0 → milhar BR
        // Exception: "0.500" → decimal (int part is 0)
        if (lastPart.length === 3 && parseInt(intPart, 10) > 0) {
            // Milhar BR: "1.980" → 1980, "1.000.000" → 1000000
            cleaned = cleaned.replace(/\./g, '');
            const value = parseFloat(cleaned);
            return isNaN(value) ? null : value;
        }

        // Decimal EN: "2.3", "0.001", "0.500"
        const value = parseFloat(cleaned);
        return isNaN(value) ? null : value;
    }

    // No dot, no comma: plain integer
    const value = parseFloat(cleaned);
    return isNaN(value) ? null : value;
}

/**
 * Normalizes an operator string
 */
function normalizeOperator(op: string): string {
    if (!op) return '=';
    const map = {
        '<': '<',
        '<=': '<=',
        '≤': '<=',
        '>': '>',
        '>=': '>=',
        '≥': '>=',
        nd: 'ND',
        'n.d.': 'ND',
        'n.a.': 'NA',
        lq: 'LQ',
        ld: 'LQ',
        l: 'LQ',
    };
    return (map as Record<string, string>)[op.toLowerCase()] || op;
}

/**
 * Extracts a numeric value with its qualifier/operator from text.
 * Handles laboratory report patterns including well ID in parentheses:
 * - "0,05" → { value: 0.05, operator: '=' }
 * - "<0.05" → { value: 0.05, operator: '<' }
 * - "ND" → { value: null, operator: 'ND' }
 * - "LQ 0,01" → { value: 0.01, operator: 'LQ' }
 * - "38,7 (MW-16)" → { value: 38.7, operator: '=', wellId: 'MW-16' }
 * - "1.980 (MW-17)" → { value: 1980, operator: '=', wellId: 'MW-17' }
 * - "ND (MW-21)" → { value: null, operator: 'ND', wellId: 'MW-21' }
 *
 * @param text - Cell text from a table
 * @param locale? - Optional locale hint for number parsing
 */
export function extractValue(
    text: string,
    locale?: string,
): { value: number | null; operator: string; raw: string; wellId?: string } | null {
    if (!text || typeof text !== 'string') return null;

    const trimmed = text.trim();
    if (!trimmed) return null;

    // ── F2: Value with well ID in parentheses: "38,7 (MW-16)", "1.980 (MW-17)" ──
    // Also handles operator: "< 0,05 (MW-16)" and trailing punctuation: "38,7 (MW-16) *"
    const wellValMatch = trimmed.match(
        /^([<>≤≥]?\s*[\d.,]+(?:\s*[×xX]\s*10\s*[-−]\s*\d+)?)\s*\(([^)]+)\)\s*[*†‡]?\s*$/,
    );
    if (wellValMatch) {
        const numPart = (wellValMatch[1] ?? '').trim();
        const wellId = (wellValMatch[2] ?? '').trim();
        const opMatch = numPart.match(/^(<|>|≤|≥|<=|>=)\s*(.*)/);
        if (opMatch) {
            return {
                value: parseNumericValue((opMatch[2] ?? '').trim(), locale),
                operator: normalizeOperator(opMatch[1] ?? ''),
                wellId,
                raw: trimmed,
            };
        }
        return {
            value: parseNumericValue(numPart, locale),
            operator: '=',
            wellId,
            raw: trimmed,
        };
    }

    // Qualifier with well ID: "ND (MW-21)", "LQ (MW-01)"
    const qualWellMatch = trimmed.match(/^(ND|LQ|n\.d\.|n\.a\.)\s*\(([^)]+)\)\s*[*†‡]?\s*$/i);
    if (qualWellMatch) {
        return {
            value: null,
            operator: normalizeOperator(qualWellMatch[1] ?? ''),
            wellId: (qualWellMatch[2] ?? '').trim(),
            raw: trimmed,
        };
    }

    // Quick check for pure ND/LQ/n.d./n.a. (with optional value)
    const qualMatch = trimmed.match(
        /^(ND|LQ|n\.d\.|n\.a\.|N\.D\.|N\.A\.|nd|lq)(?:\s*(?:[=:]\s*)?(\d+(?:[.,]\d+)?))?$/i,
    );
    if (qualMatch) {
        return {
            value: parseNumericValue(qualMatch[2] ?? '', locale),
            operator: normalizeOperator(qualMatch[1] ?? ''),
            raw: trimmed,
        };
    }

    // "< LQ" pattern (operator + qualifier, no numeric value)
    // Also accepts truncated "< L" as "< LQ" (F1-B: pdfplumber may split cells)
    const opQualMatch = trimmed.match(/^(<|>|≤|≥|<=|>=)\s*(LQ|LD|L|ND|n\.d\.|n\.a\.)\s*$/i);
    if (opQualMatch) {
        return {
            value: null,
            operator: normalizeOperator(opQualMatch[2] ?? ''),
            raw: trimmed,
        };
    }

    // Operator + value: "<0,05", ">10.5", "≤0.001"
    const opMatch = trimmed.match(/^(<|>|≤|≥|<=|>=)\s*(\d+(?:[.,]\d+)?(?:\s*[×xX]\s*10\s*[-−]\s*\d+)?)$/);
    if (opMatch) {
        return {
            value: parseNumericValue(opMatch[2] ?? '', locale),
            operator: normalizeOperator(opMatch[1] ?? ''),
            raw: trimmed,
        };
    }

    // Plain numeric (with possible scientific notation)
    const numMatch = trimmed.match(/^(\d+(?:[.,]\d+)?(?:\s*[×xX]\s*10\s*[-−]\s*\d+)?)$/);
    if (numMatch) {
        return {
            value: parseNumericValue(numMatch[1] ?? '', locale),
            operator: '=',
            raw: trimmed,
        };
    }

    // Dash or empty indicators
    if (/^[-–—]+$/.test(trimmed) || trimmed === '---' || trimmed === '--') {
        return { value: null, operator: 'NA', raw: trimmed };
    }

    return null;
}

// ---------------------------------------------------------------------------
// Unit Extraction Engine
// ---------------------------------------------------------------------------

/**
 * Extended UNIT_MAP for document ingestion.
 * Supplements mapper.js UNIT_MAP with additional patterns found in lab reports.
 * Normalized keys are lowercase.
 */
const DOC_UNIT_MAP: Record<string, string> = {
    // Concentration - liquid
    'ug/l': 'ug_L',
    'µg/l': 'ug_L',
    'ug/L': 'ug_L',
    'μg/l': 'ug_L',
    'mg/l': 'mg_L',
    'mg/L': 'mg_L',
    'ng/l': 'ng_L',
    'ng/L': 'ng_L',
    'g/l': 'g_L',
    'g/L': 'g_L',
    // Concentration - soil/solid
    'mg/kg': 'mg_kg',
    'ug/kg': 'ug_kg',
    'µg/kg': 'ug_kg',
    'μg/kg': 'ug_kg',
    'ng/kg': 'ng_kg',
    'ng/g': 'ng_g',
    // Generic concentration
    ppm: 'ppm',
    ppb: 'ppb',
    ppt: 'ppt',
    // pH
    ph: 'pH',
    '-': 'pH',
    'unid. ph': 'pH',
    'unidades de ph': 'pH',
    // Conductivity
    'us/cm': 'uS_cm',
    'µs/cm': 'uS_cm',
    'μs/cm': 'uS_cm',
    'ms/cm': 'mS_cm',
    // Temperature
    '°c': 'celsius',
    oc: 'celsius',
    celsius: 'celsius',
    'graus celsius': 'celsius',
    // Electrical potential
    mv: 'mV',
    // Length/depth
    m: 'm',
    cm: 'cm',
    mm: 'mm',
    ft: 'ft',
    'm bgs': 'm',
    metros: 'm',
    // Flow
    'l/s': 'L_s',
    'l/min': 'L_min',
    'm3/h': 'm3_h',
    'm³/h': 'm3_h',
    'm3/dia': 'm3_d',
    'm³/dia': 'm3_d',
    // Mass
    kg: 'kg',
    g: 'g',
    mg: 'mg',
    ug: 'ug',
    µg: 'ug',
    t: 't',
    ton: 't',
    // Area
    ha: 'ha',
    m2: 'm2',
    'm²': 'm2',
    km2: 'km2',
    'km²': 'km2',
    // Volume
    l: 'L',
    ml: 'mL',
    m3: 'm3',
    'm³': 'm3',
    // Turbidity
    ntu: 'NTU',
    unt: 'NTU',
    ftu: 'NTU',
    // Percentages
    '%': 'percent',
    percent: 'percent',
    porcentagem: 'percent',
    // Counting
    'ufc/ml': 'cfu_mL',
    'cfu/ml': 'cfu_mL',
    'ufc/100ml': 'cfu_100mL',
    'cfu/100ml': 'cfu_100mL',
    'nmp/100ml': 'mpn_100mL',
    'mpn/100ml': 'mpn_100mL',
    // Emissions
    tco2e: 'tCO2e',
    tco2eq: 'tCO2e',
    'mg/nm3': 'mg_Nm3',
    'mg/nm³': 'mg_Nm3',
    'ug/m3': 'ug_m3',
    'µg/m3': 'ug_m3',
    'µg/m³': 'ug_m3',
    'μg/m3': 'ug_m3',
    // OHS
    'db(a)': 'dBA',
    dba: 'dBA',
    db: 'dBA',
    msv: 'mSv',
    usv: 'uSv',
    µsv: 'uSv',
    'bq/m3': 'Bq_m3',
    'bq/m³': 'Bq_m3',
    lux: 'lux',
    'fibras/cm3': 'fibras_cm3',
    'f/cm3': 'fibras_cm3',
    'f/cm³': 'fibras_cm3',
    // Score/dimensionless
    score: 'score',
    indice: 'score',
    index: 'score',
    // Count
    count: 'count',
    unid: 'count',
    unidades: 'count',
    // Time-based rates
    'por 1m hh': 'per_1M_hh',
    'per 1m hh': 'per_1M_hh',
    'dias por 1m': 'days_per_1M',
    'days per 1m': 'days_per_1M',
    'por 200k hh': 'per_200k_hh',
    'per 200k hh': 'per_200k_hh',
    // Brazilian lab-specific
    'mg caco3/l': 'mg_CaCO3_L',
    'mg/l caco3': 'mg_CaCO3_L',
    uh: 'uH',
    'pt-co': 'uH',
    'pt/co': 'uH',
};

/**
 * Regex to extract units from a table cell or header.
 * Captures text inside parentheses, after a colon, or standalone unit patterns.
 */
const UNIT_EXTRACT_REGEX: RegExp =
    /\(([^)]+)\)|:\s*(\S+)\s*$|^((?:µ?[mun]?g\/[lLkKm]g?|ppm|ppb|ph|°[cCfF]|[mun]?[sS]\/cm|m[vV]|NTU|%|dB[aA]?|m|cm|mm|ft|t|ha|m[²³23])\b)/i;

/**
 * Resolves a unit string to a normalized unit ID.
 * Falls back to DOC_UNIT_MAP, then returns null.
 *
 * @param unitStr - Raw unit string from document
 * @returns Normalized unit ID or null
 */
export function resolveDocUnit(unitStr: string): string | null {
    if (!unitStr || typeof unitStr !== 'string') return null;

    const cleaned = unitStr.trim().toLowerCase().replace(/\s+/g, '').replace(/μ/g, 'µ'); // Normalize Greek mu to micro sign

    if (DOC_UNIT_MAP[cleaned]) return DOC_UNIT_MAP[cleaned];

    // Try with spaces preserved (for multi-word units)
    const spaced = unitStr.trim().toLowerCase();
    if (DOC_UNIT_MAP[spaced]) return DOC_UNIT_MAP[spaced];

    return null;
}

/**
 * Attempts to extract a unit from a header cell or value cell.
 * Looks for patterns like "(mg/L)", "Resultado (ug/L)", "pH", etc.
 *
 * @param text - Cell text that may contain a unit
 */
export function extractUnit(text: string): { unit: string; unitId: string } | null {
    if (!text || typeof text !== 'string') return null;

    const match = text.match(UNIT_EXTRACT_REGEX);
    if (match) {
        const raw = (match[1] || match[2] || match[3] || '').trim();
        const unitId = resolveDocUnit(raw);
        if (unitId) return { unit: raw, unitId };
    }

    // Fallback: try the entire string as a unit
    const unitId = resolveDocUnit(text);
    if (unitId) return { unit: text.trim(), unitId };

    return null;
}

/**
 * Returns the full DOC_UNIT_MAP (for testing/export)
 */
export function getDocUnitMap(): Object {
    return { ...DOC_UNIT_MAP };
}

// ---------------------------------------------------------------------------
// F1c: Document Locale Detection
// ---------------------------------------------------------------------------

const LOCALE_SIGNALS: Record<string, { strong: string[]; medium: string[] }> = {
    'pt-BR': {
        strong: ['conama', 'cetesb', 'ibama', 'abnt', 'dd 038', 'dd nº 038', 'nbr 15', 'lei estadual'],
        medium: [
            'porcentagem',
            'concentracao',
            'concentração',
            'valor de intervencao',
            'valor de intervenção',
            'agua subterranea',
            'água subterrânea',
            'solo contaminado',
            'monitoramento',
            'poço',
            'poco',
            'sondagem',
            'amostragem',
        ],
    },
    'en-US': {
        strong: ['epa', 'rcra', 'cercla', 'osha', 'mcl', 'astm', 'us epa', 'federal register'],
        medium: [
            'concentration',
            'groundwater',
            'monitoring well',
            'contamination',
            'remediation',
            'sampling',
            'baseline',
        ],
    },
    'generic-EU': {
        strong: ['eu directive', 'eea', 'reach regulation', 'water framework directive'],
        medium: ['grundwasser', 'concentration', 'échantillonnage', 'contaminación'],
    },
};

/**
 * Detects the document locale from its text content by scanning for
 * regulatory keywords and terminology patterns.
 *
 * @param rawText - Full text extracted from document
 */
export function detectDocumentLocale(
    rawText: string,
): { locale: string; confidence: number; signals: string[] } {
    if (!rawText) return { locale: _browserLocale(), confidence: 0, signals: [] };

    const lower = rawText.toLowerCase();
    const scores: Record<string, number> = {};
    const signalsFound: Record<string, string[]> = {};

    for (const [loc, rules] of Object.entries(LOCALE_SIGNALS)) {
        scores[loc] = 0;
        signalsFound[loc] = [];

        for (const kw of (rules as any).strong) {
            if (lower.includes(kw)) {
                scores[loc] += 0.9;
                signalsFound[loc]!.push(kw);
            }
        }
        for (const kw of (rules as any).medium) {
            if (lower.includes(kw)) {
                scores[loc] += 0.3;
                signalsFound[loc]!.push(kw);
            }
        }
    }

    // Find locale with highest score
    let bestLocale = _browserLocale();
    let bestScore = 0;
    let bestSignals: string[] = [];

    for (const [loc, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score;
            bestLocale = loc;
            bestSignals = signalsFound[loc] ?? [];
        }
    }

    const confidence = Math.min(bestScore / 3, 1); // Normalize: 3+ strong signals = 1.0
    return { locale: bestLocale, confidence, signals: bestSignals };
}

function _browserLocale(): string {
    try {
        return navigator.language || 'en-US';
    } catch {
        return 'en-US';
    }
}
