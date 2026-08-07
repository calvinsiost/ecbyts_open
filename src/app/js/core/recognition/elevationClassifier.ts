// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.2 (P1-7 G3 Raster Upload Georef - OCR elevation classification)

/**
 * elevationClassifier.js - classifica rótulos OCR como prováveis elevações (cotas).
 *
 * Usado em pipelines de ingestão de mapas topográficos históricos (G3) para
 * marcar automaticamente labels numéricos próximos a isolinhas como cotas
 * candidatas. Sem dependências externas; sem OCR - apenas analisa strings
 * já extraídas por OCR upstream (tesseract, imageOCR.js).
 *
 * DOMÍNIO:
 * - Cotas BR típicas: 0m a 3000m (raras > 3000m fora de Andes/Serra).
 * - Formatos aceitos: "125", "125.5", "125,5", "1.250" (BR milhares), "1250",
 *   "cota 125", "elev. 500", "450m", "720 msnm", "1.2 km"
 * - Ambiguidade BR: "1.250" pode ser mil duzentos e cinquenta OU um vírgula
 *   duzentos e cinquenta; resolvida por heurística de range.
 *
 * REJEITA:
 * - Coordenadas UTM: easting 6-dígitos (100000-999999), northing 7-dígitos.
 * - Anos: 1900-2100.
 * - Números fora do range plausível.
 * - Texto puro sem número.
 *
 * @module core/recognition/elevationClassifier
 */

// ---------------------------------------------------------------------------
// Constantes de domínio
// ---------------------------------------------------------------------------

/** Range plausível de elevação BR em metros (inclusivo). */
export const ELEVATION_RANGE = Object.freeze({ min: -500, max: 3000 });

/** Range de ano para filtrar "1987", "2024" etc. */
const YEAR_RANGE = { min: 1900, max: 2100 };

/** Prefixos indicando explicitamente elevação (case-insensitive). */
const ELEVATION_PREFIXES = ['cota', 'elev', 'elevation', 'alt', 'altitude', 'h', 'z'];

/** Sufixos de unidade indicando metros/altitude. */
const ELEVATION_UNIT_SUFFIXES = [
    'm',
    'mt',
    'mts',
    'metros',
    'msnm', // metros sobre nível do mar
    'mca', // metros de coluna d'água
];

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Extrai número de string com suporte a formato BR e US.
 *
 * Estratégia:
 * - "1.250" BR → 1250 (se só 1 ponto e 3 dígitos após)
 * - "1,5" BR → 1.5 (decimal com vírgula)
 * - "1,250.5" US → 1250.5 (vírgula milhares + ponto decimal)
 * - "1250" → 1250
 */
export function extractNumeric(
    raw: string,
): { value: number | null; hadThousandsSep: boolean; hadDecimalSep: boolean } {
    if (typeof raw !== 'string' || raw.trim() === '') {
        return { value: null, hadThousandsSep: false, hadDecimalSep: false };
    }

    // Match número com separadores opcionais. Prioriza formato com milhares (3-dígitos groups),
    // depois formato decimal puro, depois inteiro simples (captura completa).
    // Ordem: BR milhares com decimal | US milhares com decimal | número com decimal | inteiro
    const match = raw.match(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:[.,]\d+)?/);
    if (!match) return { value: null, hadThousandsSep: false, hadDecimalSep: false };

    const numStr = match[0];
    const hasComma = numStr.includes(',');
    const hasDot = numStr.includes('.');

    let value: number;
    let hadThousandsSep = false;
    let hadDecimalSep = false;

    if (hasComma && hasDot) {
        // Ambos presentes: último é decimal, outro é milhares
        const lastComma = numStr.lastIndexOf(',');
        const lastDot = numStr.lastIndexOf('.');
        if (lastComma > lastDot) {
            // BR: ponto = milhares, vírgula = decimal
            value = parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
        } else {
            // US: vírgula = milhares, ponto = decimal
            value = parseFloat(numStr.replace(/,/g, ''));
        }
        hadThousandsSep = true;
        hadDecimalSep = true;
    } else if (hasComma) {
        // Só vírgula: BR decimal (raro: milhares BR sem ponto)
        value = parseFloat(numStr.replace(',', '.'));
        hadDecimalSep = true;
    } else if (hasDot) {
        // Só ponto: pode ser BR milhares ("1.250") OU US decimal ("1.5")
        const parts = numStr.split('.');
        if (parts.length === 2 && (parts[1] ?? '').length === 3) {
            // "1.250" → heurística: BR milhares
            value = parseFloat(numStr.replace('.', ''));
            hadThousandsSep = true;
        } else {
            // "1.5", "1.25", "1.2345"
            value = parseFloat(numStr);
            hadDecimalSep = true;
        }
    } else {
        value = parseFloat(numStr);
    }

    return { value: Number.isFinite(value) ? value : null, hadThousandsSep, hadDecimalSep };
}

/**
 * Normaliza string: lowercase, remove acentos, colapsa espaços.
 */
function _normalize(raw: string): string {
    return String(raw || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Detecta se texto tem prefixo de elevação.
 *
 * @returns prefix detectado ou null
 */
function _detectPrefix(normalized: string): string | null {
    for (const p of ELEVATION_PREFIXES) {
        const re = new RegExp(`^${p}\\b|\\b${p}\\s*[.:=]?\\s*\\d`, 'i');
        if (re.test(normalized)) return p;
    }
    return null;
}

/**
 * Detecta se texto tem sufixo de unidade altimétrica.
 *
 * @returns unit detectada ou null
 */
function _detectUnit(normalized: string): string | null {
    // Remove número do fim para isolar sufixo
    const m = normalized.match(/(\d[\d.,]*)\s*([a-z]+)\s*$/);
    if (m) {
        const suf = m[2] ?? '';
        if (ELEVATION_UNIT_SUFFIXES.includes(suf)) return suf;
        // "km" especial: altitude em km → converte em classifyElevationLabel
        if (suf === 'km' || suf === 'kms') return 'km';
    }
    return null;
}

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

interface ClassifyOptions {
    minElevation?: number; // override ELEVATION_RANGE.min
    maxElevation?: number; // override ELEVATION_RANGE.max
    strictUnit?: boolean; // exige unidade/prefixo explícito para high confidence (default false)
}

interface ClassificationResult {
    isElevation: boolean; // se o label é elevação candidata
    value: number | null; // valor numérico em metros (null se não for elevação)
    confidence: 'high' | 'medium' | 'low' | 'none';
    reason: string; // explicação sucinta
    prefix: string | null; // prefixo detectado
    unit: string | null; // unidade detectada
}

/**
 * Classifica um rótulo OCR como provável elevação.
 *
 * @param text - string OCR (ex: "125", "cota 450", "720 m", "1.250")
 */
export function classifyElevationLabel(text: string, opts: ClassifyOptions = {}): ClassificationResult {
    const minEl = opts.minElevation ?? ELEVATION_RANGE.min;
    const maxEl = opts.maxElevation ?? ELEVATION_RANGE.max;
    const strict = opts.strictUnit === true;

    const normalized = _normalize(text);
    if (!normalized) {
        return { isElevation: false, value: null, confidence: 'none', reason: 'empty', prefix: null, unit: null };
    }

    const { value, hadThousandsSep } = extractNumeric(normalized);
    if (value === null) {
        return {
            isElevation: false,
            value: null,
            confidence: 'none',
            reason: 'no number',
            prefix: null,
            unit: null,
        };
    }

    const prefix = _detectPrefix(normalized);
    const unit = _detectUnit(normalized);

    // Converte km → m
    let valueM = value;
    if (unit === 'km') valueM = value * 1000;

    // Rejeita se fora do range
    if (valueM < minEl || valueM > maxEl) {
        return {
            isElevation: false,
            value: null,
            confidence: 'none',
            reason: `out of range (${Math.round(valueM)}m)`,
            prefix,
            unit,
        };
    }

    // Rejeita anos (4 dígitos inteiros 1900-2100 sem prefixo/unit)
    if (
        !prefix &&
        !unit &&
        Number.isInteger(valueM) &&
        valueM >= YEAR_RANGE.min &&
        valueM <= YEAR_RANGE.max &&
        !hadThousandsSep
    ) {
        return {
            isElevation: false,
            value: null,
            confidence: 'none',
            reason: 'likely year',
            prefix,
            unit,
        };
    }

    // Rejeita UTM easting (6 dígitos, 100k-999k)
    if (!prefix && !unit && Number.isInteger(valueM) && valueM >= 100000 && valueM <= 999999) {
        return {
            isElevation: false,
            value: null,
            confidence: 'none',
            reason: 'likely UTM easting',
            prefix,
            unit,
        };
    }

    // Rejeita padrões de ID com letra-hífen-número ("PM-01", "W-42", "MW-123B")
    // - número é parte de identificador, não elevação.
    if (!prefix && !unit && /[a-z]+-\s*\d/i.test(normalized)) {
        return {
            isElevation: false,
            value: null,
            confidence: 'none',
            reason: 'likely ID pattern (letter-hyphen-digit)',
            prefix,
            unit,
        };
    }

    // Classifica confidence:
    // - HIGH: prefixo + unit, OU prefixo + valor plausível, OU unit + valor plausível
    // - MEDIUM: só prefixo OU só unit OU valor plausível + formato milhares BR
    // - LOW: número puro em range (sem prefixo/unit)
    let confidence: 'high' | 'medium' | 'low' | 'none' = 'low';
    let reason = 'plain number in range';

    if (prefix && unit) {
        confidence = 'high';
        reason = `prefix "${prefix}" + unit "${unit}"`;
    } else if (prefix) {
        confidence = 'high';
        reason = `prefix "${prefix}"`;
    } else if (unit) {
        confidence = 'high';
        reason = `unit "${unit}"`;
    } else if (hadThousandsSep) {
        confidence = 'medium';
        reason = 'thousands separator (BR format)';
    }

    // Se strict, rebaixa LOW para not-elevation
    if (strict && confidence === 'low') {
        return {
            isElevation: false,
            value: null,
            confidence: 'none',
            reason: 'strict mode: no prefix/unit',
            prefix,
            unit,
        };
    }

    return {
        isElevation: true,
        value: Math.round(valueM * 100) / 100, // 2 casas decimais
        confidence,
        reason,
        prefix,
        unit,
    };
}

/**
 * Classifica array de labels OCR em batch. Aplica dedup e ordena por valor.
 */
export function classifyElevationBatch(
    labels: string[],
    opts: ClassifyOptions = {},
): {
    classifications: Array<ClassificationResult & { original: string }>;
    elevations: number[];
    stats: { total: number; elevationCount: number; highConfidence: number; rejected: number };
} {
    if (!Array.isArray(labels)) {
        return {
            classifications: [],
            elevations: [],
            stats: { total: 0, elevationCount: 0, highConfidence: 0, rejected: 0 },
        };
    }

    const classifications = labels.map((label) => ({
        original: String(label),
        ...classifyElevationLabel(label, opts),
    }));

    const elevationsSet = new Set<number | null>();
    let highConfidence = 0;
    let rejected = 0;

    for (const c of classifications) {
        if (c.isElevation) {
            elevationsSet.add(c.value);
            if (c.confidence === 'high') highConfidence++;
        } else {
            rejected++;
        }
    }

    const elevations = (Array.from(elevationsSet).filter((v): v is number => v !== null)).sort((a, b) => a - b);

    return {
        classifications,
        elevations,
        stats: {
            total: labels.length,
            elevationCount: classifications.filter((c) => c.isElevation).length,
            highConfidence,
            rejected,
        },
    };
}

/**
 * Infere intervalo de isolinhas (contour interval) a partir de lista de elevações
 * detectadas. Usa GCD aproximado dos deltas para achar espaçamento regular.
 *
 * @param elevations - array ordenado de elevações distintas
 */
export function inferContourInterval(
    elevations: number[],
): { interval: number | null; confidence: 'high' | 'medium' | 'low' | 'none' } {
    if (!Array.isArray(elevations) || elevations.length < 2) {
        return { interval: null, confidence: 'none' };
    }

    const sorted = [...elevations].sort((a, b) => a - b);
    const deltas: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
        const d = (sorted[i] as number) - (sorted[i - 1] as number);
        if (d > 0) deltas.push(d);
    }

    if (deltas.length === 0) return { interval: null, confidence: 'none' };

    // Ordena deltas e pega mediana + menor
    deltas.sort((a, b) => a - b);
    const smallest = deltas[0] as number;

    // Conta quantos deltas são múltiplos inteiros de smallest (±10% tolerância)
    let multiples = 0;
    for (const d of deltas) {
        const ratio = d / smallest;
        if (Math.abs(ratio - Math.round(ratio)) < 0.1) multiples++;
    }

    const regularityRatio = multiples / deltas.length;

    let confidence: 'high' | 'medium' | 'low' | 'none' = 'low';
    if (regularityRatio >= 0.95) confidence = 'high';
    else if (regularityRatio >= 0.7) confidence = 'medium';
    else if (regularityRatio < 0.5) confidence = 'low';

    return { interval: smallest, confidence };
}
