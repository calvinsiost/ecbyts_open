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

/* ================================================================
   ABNT CHECKER — Regex-based normative reference validator
   Validador de referencias normativas ABNT, CONAMA, CETESB, NR

   Phase 1: Offline regex + embedded JSON database.
   Architecture decision: ADR-001 (Regex + JSON, not parser).

   Detecta e valida referencias a normas brasileiras em texto de
   relatorios ambientais. Retorna achados com status de vigencia.
   ================================================================ */

// Logger with graceful fallback for Node.js test environments
// where CONFIG (window-dependent) is unavailable.
import { t } from '../../utils/i18n/translations.js';
/** @type {any} */
let log: any;
try {
    const { createLogger } = await import('../../utils/helpers/logger.js');
    log = createLogger('abntChecker');
} catch {
    log = {
        debug: () => {},
        info: () => {},
        warn: console.warn.bind(console, '[abntChecker]'),
        error: console.error.bind(console, '[abntChecker]'),
    };
}

// ----------------------------------------------------------------
// KNOWN NORMS DATABASE (Phase 1 - small embedded set)
// Banco de normas conhecidas para validacao de vigencia
// ----------------------------------------------------------------

const KNOWN_NORMS = {
    // ABNT NBR - normas tecnicas brasileiras
    'NBR 10004:2004': { status: 'valid', title: 'Residuos solidos - Classificacao' },
    'NBR 15495-1:2007': {
        status: 'valid',
        title: t('abnt.nbr15495_1_1'),
    },
    'NBR 15515-1:2007': {
        status: 'valid',
        title: t('abnt.nbr15495_1_2'),
    },
    'NBR 15847:2010': {
        status: 'valid',
        title: 'Amostragem de agua subterranea em pocos de monitoramento - Metodos de purga',
    },

    // CONAMA - resolucoes do Conselho Nacional do Meio Ambiente
    'CONAMA 420/2009': {
        status: 'valid',
        title: 'Criterios e valores orientadores de qualidade do solo e aguas subterraneas',
    },
    'CONAMA 396/2008': {
        status: 'valid',
        title: 'Classificacao e diretrizes ambientais para enquadramento de aguas subterraneas',
    },
    'CONAMA 430/2011': {
        status: 'valid',
        title: 'Condicoes, parametros, padroes e diretrizes para lancamento de efluentes',
    },

    // CETESB - decisoes de diretoria
    'CETESB DD-256/2016': {
        status: 'valid',
        title: 'Valores orientadores para solo e aguas subterraneas no Estado de Sao Paulo',
    },

    // NR - Normas Regulamentadoras (MTE, nao ABNT)
    'NR-15': { status: 'valid', title: 'Atividades e operacoes insalubres', issuer: 'MTE' },
};

// ----------------------------------------------------------------
// REGEX PATTERNS
// Padroes para deteccao de referencias normativas em texto
// ----------------------------------------------------------------

// NBR NNNNN / NBR NNNNN:YYYY / NBR NNNNN-N:YYYY
// Accepts optional "ABNT" prefix
const RE_NBR = /\b(?:ABNT\s+)?NBR\s+(\d{4,5})(?:-(\d+))?(?::(\d{4}))?\b/g;

// CONAMA NNN/YYYY - Resolucao CONAMA
const RE_CONAMA = /\bCONAMA\s+(?:n[.o]?\s*)?(\d{1,4})\s*\/\s*(\d{4})\b/gi;

// CETESB DD-NNN/YYYY - Decisao de Diretoria
const RE_CETESB = /\bCETESB\s+DD[-\s](\d{1,4})\s*\/\s*(\d{4})\b/gi;

// NR-NN - Norma Regulamentadora (MTE)
const RE_NR = /\bNR[-\s](\d{1,2})\b/g;

// ----------------------------------------------------------------
// UTILITY - ReDoS prevention for user-supplied patterns
// ----------------------------------------------------------------

/**
 * Escape special regex characters in a string.
 * Prevents ReDoS when building regex from user-supplied glossary terms.
 * @param {string} str - Raw string to escape
 * @returns {string} Escaped string safe for new RegExp()
 */
export function escapeRegExp(str: any) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ----------------------------------------------------------------
// NORMALIZERS - Build canonical keys from regex captures
// ----------------------------------------------------------------

/**
 * Normalize an NBR reference to its canonical form.
 * @param {string} number - Main norm number (e.g. "15847")
 * @param {string|undefined} part - Part number (e.g. "1")
 * @param {string|undefined} year - Year (e.g. "2010")
 * @returns {string} Canonical key like "NBR 15847:2010"
 */
function normalizeNBR(number: any, part: any, year: any) {
    let key = `NBR ${number}`;
    if (part) key += `-${part}`;
    if (year) key += `:${year}`;
    return key;
}

/**
 * Normalize a CONAMA reference.
 * @param {string} number - Resolution number
 * @param {string} year - Year
 * @returns {string} Canonical key like "CONAMA 420/2009"
 */
function normalizeCONAMA(number: any, year: any) {
    return `CONAMA ${number}/${year}`;
}

/**
 * Normalize a CETESB DD reference.
 * @param {string} number - Decision number
 * @param {string} year - Year
 * @returns {string} Canonical key like "CETESB DD-256/2016"
 */
function normalizeCETESB(number: any, year: any) {
    return `CETESB DD-${number}/${year}`;
}

/**
 * Normalize an NR reference.
 * @param {string} number - NR number
 * @returns {string} Canonical key like "NR-15"
 */
function normalizeNR(number: any) {
    return `NR-${number}`;
}

// ----------------------------------------------------------------
// LINE / COLUMN LOOKUP
// Calcula linha e coluna a partir do offset no texto
// ----------------------------------------------------------------

/**
 * Compute 1-based line and column from a character offset.
 * @param {string} text - Full text
 * @param {number} offset - Character offset (0-based)
 * @returns {{ line: number, col: number }}
 */
function offsetToLineCol(text: any, offset: any) {
    let line = 1;
    let lastNewline = -1;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') {
            line++;
            lastNewline = i;
        }
    }
    return { line, col: offset - lastNewline };
}

// ----------------------------------------------------------------
// STATUS LOOKUP
// Consulta o banco de normas conhecidas
// ----------------------------------------------------------------

/**
 * Look up a normalized reference in the known norms database.
 * @param {string} normalized - Canonical key (e.g. "NBR 15847:2010")
 * @param {string} type - Reference type: 'nbr'|'conama'|'cetesb'|'nr'
 * @returns {{ status: string, suggestion: string|null }}
 */
function lookupNorm(normalized: any, type: any) {
    const entry = (KNOWN_NORMS as any)[normalized];
    if (entry) {
        /** @type {{status: string, suggestion: string|null}} */
        const result: any = { status: entry.status, suggestion: null };
        if (type === 'nr') {
            result.suggestion = 'NR is issued by MTE (Ministerio do Trabalho), not ABNT.';
        }
        return result;
    }

    // Try partial match for NBR without year
    if (type === 'nbr' && !normalized.includes(':')) {
        const withYear = Object.keys(KNOWN_NORMS).find(
            (k) => k.startsWith(normalized + ':') || k.startsWith(normalized + '-'),
        );
        if (withYear) {
            return {
                status: 'malformed',
                suggestion: `Missing year. Did you mean "${withYear}"?`,
            };
        }
    }

    return { status: 'unknown', suggestion: null };
}

// ----------------------------------------------------------------
// MAIN API
// ----------------------------------------------------------------

/**
 * Scan text for ABNT/CONAMA/CETESB/NR normative references.
 * Returns an array of findings with validation status.
 *
 * @param {string} text - Plain text or HTML content to scan
 * @param {Object} [options] - Optional configuration
 * @param {string[]} [options.glossaryTerms] - User-defined terms to also detect
 * @returns {Array<{
 *   original: string,
 *   normalized: string,
 *   status: 'valid'|'revoked'|'unknown'|'malformed',
 *   suggestion: string|null,
 *   line: number,
 *   col: number,
 *   type: string
 * }>}
 */
export function checkABNTReferences(text: any, options: any = {}) {
    if (!text || typeof text !== 'string') {
        log.debug('Empty or invalid input');
        return [];
    }

    // Strip HTML tags for plain text scanning
    const plain = text.replace(/<[^>]+>/g, ' ');
    /** @type {any[]} */
    const findings: any = [];

    _scanNBR(plain, findings);
    _scanCONAMA(plain, findings);
    _scanCETESB(plain, findings);
    _scanNR(plain, findings);

    if (options.glossaryTerms && Array.isArray(options.glossaryTerms)) {
        _scanGlossary(plain, options.glossaryTerms, findings);
    }

    // Sort by line, then column
    findings.sort((a: any, b: any) => a.line - b.line || a.col - b.col);

    log.info(`Scanned text: ${findings.length} reference(s) found`);
    return findings;
}

/**
 * Get the embedded known norms database (read-only copy).
 * @returns {Object} Map of normalized key to { status, title }
 */
export function getKnownNorms() {
    return { ...KNOWN_NORMS };
}

// ----------------------------------------------------------------
// INTERNAL SCANNERS
// ----------------------------------------------------------------

/**
 * Scan for NBR references.
 * @param {string} text - Plain text
 * @param {Array<any>} findings - Accumulator array
 */
function _scanNBR(text: any, findings: any) {
    const re = new RegExp(RE_NBR.source, RE_NBR.flags);
    let match;
    while ((match = re.exec(text)) !== null) {
        const normalized = normalizeNBR(match[1], match[2], match[3]);
        const { status, suggestion } = lookupNorm(normalized, 'nbr');
        const { line, col } = offsetToLineCol(text, match.index);
        findings.push({
            original: match[0],
            normalized,
            status,
            suggestion,
            line,
            col,
            type: 'nbr',
        });
    }
}

/**
 * Scan for CONAMA references.
 * @param {string} text - Plain text
 * @param {Array<any>} findings - Accumulator array
 */
function _scanCONAMA(text: any, findings: any) {
    const re = new RegExp(RE_CONAMA.source, RE_CONAMA.flags);
    let match;
    while ((match = re.exec(text)) !== null) {
        const normalized = normalizeCONAMA(match[1], match[2]);
        const { status, suggestion } = lookupNorm(normalized, 'conama');
        const { line, col } = offsetToLineCol(text, match.index);
        findings.push({
            original: match[0],
            normalized,
            status,
            suggestion,
            line,
            col,
            type: 'conama',
        });
    }
}

/**
 * Scan for CETESB DD references.
 * @param {string} text - Plain text
 * @param {Array<any>} findings - Accumulator array
 */
function _scanCETESB(text: any, findings: any) {
    const re = new RegExp(RE_CETESB.source, RE_CETESB.flags);
    let match;
    while ((match = re.exec(text)) !== null) {
        const normalized = normalizeCETESB(match[1], match[2]);
        const { status, suggestion } = lookupNorm(normalized, 'cetesb');
        const { line, col } = offsetToLineCol(text, match.index);
        findings.push({
            original: match[0],
            normalized,
            status,
            suggestion,
            line,
            col,
            type: 'cetesb',
        });
    }
}

/**
 * Scan for NR (Norma Regulamentadora) references.
 * @param {string} text - Plain text
 * @param {Array<any>} findings - Accumulator array
 */
function _scanNR(text: any, findings: any) {
    const re = new RegExp(RE_NR.source, RE_NR.flags);
    let match;
    while ((match = re.exec(text)) !== null) {
        const normalized = normalizeNR(match[1]);
        const { status, suggestion } = lookupNorm(normalized, 'nr');
        const { line, col } = offsetToLineCol(text, match.index);
        findings.push({
            original: match[0],
            normalized,
            status,
            suggestion,
            line,
            col,
            type: 'nr',
        });
    }
}

/**
 * Scan for user-defined glossary terms (Phase 2 prep).
 * Uses escapeRegExp to prevent ReDoS on user-supplied patterns.
 * @param {string} text - Plain text
 * @param {string[]} terms - Array of glossary terms
 * @param {Array<any>} findings - Accumulator array
 */
function _scanGlossary(text: any, terms: any, findings: any) {
    for (const term of terms) {
        if (!term || typeof term !== 'string') continue;
        const escaped = escapeRegExp(term);
        const re = new RegExp(`\\b${escaped}\\b`, 'gi');
        let match;
        while ((match = re.exec(text)) !== null) {
            const { line, col } = offsetToLineCol(text, match.index);
            findings.push({
                original: match[0],
                normalized: term,
                status: 'unknown',
                suggestion: 'User glossary term — not in known norms database.',
                line,
                col,
                type: 'glossary',
            });
        }
    }
}
