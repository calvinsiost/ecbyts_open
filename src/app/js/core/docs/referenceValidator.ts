// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// --- scout: typedef -> TS declarations (runtime-noop) ---
interface ParsedReference {
    type: string;
    author: string|null;
    title: string|null;
    source: string|null;
    year: number|null;
    url: string|null;
    doi: string|null;
    raw: string;
}
interface CategorySpec {
    minRefs: number;
    expected: readonly string[];
}
// --- end scout declarations ---
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * @typedef {Object} ParsedReference
 * @property {string} type
 * @property {string|null} author
 * @property {string|null} title
 * @property {string|null} source
 * @property {number|null} year
 * @property {string|null} url
 * @property {string|null} doi
 * @property {string} raw
 */

/**
 * @typedef {Object} CategorySpec
 * @property {number} minRefs
 * @property {readonly string[]} expected
 */

/* ================================================================
   REFERENCE VALIDATOR — SPEC_TECHNICAL_REFERENCES_SECTION_9_78

   Pure helpers para validar seção "!" (Referências Técnicas/Teóricas)
   das specs do ecbyts:
   - parseReferenceLine: extract { type, author, title, source, year, url, doi }
   - DOI validator (regex RFC-compliant)
   - Archive.org detection §Q5
   - Category suggestions por tipo de spec §2.2
   - Audit: conta refs por seção, flagga specs de algoritmo sem refs

   Não executa fetch — URL breakage detection fica em CI script separado.
   ================================================================ */


// ──────────────────────────────────────────────────────────────────────
// Constants §Q2/Q3
// ──────────────────────────────────────────────────────────────────────

export const REF_TYPES = Object.freeze([
    'RFC', // RFC / protocolo
    'DOI', // paper acadêmico com DOI
    'BOOK', // livro (ISBN)
    'SPEC', // spec técnica (w3.org, ecma, ietf)
    'NORM', // norma (ABNT, ISO, CONAMA, NR)
    'PAPER', // paper sem DOI (preprint, arxiv, preprint)
    'ARCHIVE', // link archive.org
    'DOC', // documentação técnica (MDN, docs oficiais)
    'OTHER',
]);

// Categorias expected por tipo de spec §2.2
export const SPEC_CATEGORIES = Object.freeze({
    algorithm: Object.freeze({
        minRefs: 2,
        expected: Object.freeze(['PAPER', 'DOI', 'DOC']),
    }),
    feature_complex: Object.freeze({
        minRefs: 2,
        expected: Object.freeze(['RFC', 'SPEC', 'DOC', 'PAPER']),
    }),
    eis_compliance: Object.freeze({
        minRefs: 2,
        expected: Object.freeze(['NORM', 'PAPER', 'DOI']),
    }),
    ui_ux: Object.freeze({
        minRefs: 1,
        expected: Object.freeze(['SPEC', 'PAPER', 'DOC']),
    }),
    bugfix: Object.freeze({
        minRefs: 0,
        expected: Object.freeze([]),
    }),
    arch_infra: Object.freeze({
        minRefs: 1,
        expected: Object.freeze(['RFC', 'SPEC']),
    }),
});

// ──────────────────────────────────────────────────────────────────────
// DOI validator
// ──────────────────────────────────────────────────────────────────────

// DOI canônico: 10.NNNN[.N]/suffix (Crossref spec)
const DOI_REGEX = /^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/;

/**
 * @param {string} doi
 * @returns {boolean}
 */
export function isValidDOI(doi: string): boolean {
    if (typeof doi !== 'string') return false;
    const clean = doi.trim().replace(/^(doi:|https?:\/\/(?:dx\.)?doi\.org\/)/i, '');
    return DOI_REGEX.test(clean);
}

/**
 * Extrai DOI canônico de um texto (se presente).
 * @param {string} text
 * @returns {string|null}
 */
export function extractDOI(text: string): string|null {
    if (typeof text !== 'string') return null;
    const m = text.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
    return m ? m[0] : null;
}

// ──────────────────────────────────────────────────────────────────────
// URL classification §Q5
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isArchiveOrgUrl(url: string): boolean {
    if (typeof url !== 'string') return false;
    return /web\.archive\.org\/web\//.test(url);
}

/**
 * @param {string} url
 * @returns {string} REF_TYPES enum
 */
export function categorizeUrl(url: string): string {
    if (typeof url !== 'string') return 'OTHER';
    const u = url.toLowerCase();
    if (/tools\.ietf\.org\/html\/rfc|www\.rfc-editor\.org/.test(u)) return 'RFC';
    if (/doi\.org\//.test(u)) return 'DOI';
    if (isArchiveOrgUrl(u)) return 'ARCHIVE';
    if (/arxiv\.org/.test(u)) return 'PAPER';
    if (/www\.w3\.org|ecma-international|tc39\.es|whatwg\.org/.test(u)) return 'SPEC';
    if (/abnt\.org|iso\.org|mma\.gov\.br\/conama|gov\.br\/trabalho/.test(u)) return 'NORM';
    if (/developer\.mozilla\.org|docs\.python\.org|threejs\.org\/docs/.test(u)) return 'DOC';
    if (/google\.com\/books|archive\.org\/details/.test(u)) return 'BOOK';
    return 'OTHER';
}

// ──────────────────────────────────────────────────────────────────────
// Reference line parser
// ──────────────────────────────────────────────────────────────────────

/**
 * Parse linha no formato:
 *   [TYPE] Author/Org. Title. Source, Year. URL/DOI.
 *
 * Ex: "[RFC] IETF. HTTP/1.1. RFC 2616, 1999. https://tools.ietf.org/html/rfc2616"
 *
 * @param {string} line
 * @returns {ParsedReference|null} { type, author, title, source, year, url, doi, raw }
 */
export function parseReferenceLine(line: string): ParsedReference|null {
    if (typeof line !== 'string' || !line.trim()) return null;
    const raw = line.trim();
    const typeMatch = raw.match(/^\[([A-Z]+)\]\s*(.+)$/);
    if (!typeMatch) return null;
    const type = typeMatch[1];
    if (type === undefined || !REF_TYPES.includes(type)) return null;

    const rest = typeMatch[2];
    if (rest === undefined) return null;
    // Dividir em tokens por ponto, ignorando pontos em URLs (simplificado)
    // Extrair URL primeiro
    const urlMatch = rest.match(/(https?:\/\/\S+)/);
    const url = urlMatch && urlMatch[1] !== undefined ? urlMatch[1].replace(/[.,]+$/, '') : null;
    const doi = extractDOI(rest);

    // Year (ano 4 dígitos)
    const yearMatch = rest.match(/\b(19|20|21)\d{2}\b/);
    const year = yearMatch ? Number(yearMatch[0]) : null;

    // Remove url para facilitar parse do resto
    const textOnly = rest.replace(/https?:\/\/\S+/g, '').replace(/\s+\.\s*$/, '');
    const parts = textOnly
        .split(/\.\s+/)
        .map((p) => p.trim())
        .filter(Boolean);
    const author = parts[0] || null;
    const title = parts[1] || null;
    const source = parts[2] || null;

    return {
        type,
        author,
        title,
        source,
        year,
        url,
        doi,
        raw,
    };
}

/**
 * Parse múltiplas linhas de uma seção de referências.
 * Ignora linhas vazias e headers markdown.
 *
 * @param {string} sectionText
 * @returns {ParsedReference[]}
 */
export function parseReferenceSection(sectionText: string): ParsedReference[] {
    if (typeof sectionText !== 'string') return [];
        const out: ParsedReference[]= [];
    for (const line of sectionText.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('>') || trimmed.startsWith('---')) {
            continue;
        }
        // Remove list bullet
        const clean = trimmed.replace(/^[-*]\s*/, '');
        const parsed = parseReferenceLine(clean);
        if (parsed) out.push(parsed);
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// Audit §2.3
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {ParsedReference[]} refs
 * @param {string} specCategory
 * @returns {{ ok: boolean, violations: string[], typesPresent: string[], typesMissing: string[] }}
 */
export function auditReferences(refs: ParsedReference[], specCategory: string): { ok: boolean, violations: string[], typesPresent: string[], typesMissing: string[] } {
        const categories: Record<string, CategorySpec>= SPEC_CATEGORIES;
    const category = categories[specCategory];
    const list = Array.isArray(refs) ? refs : [];
        const violations: string[]= [];
    const typesPresent = [
        ...new Set(
            list
                .map(/** @param {ParsedReference} specCategory */ (r) => r.type)
                .filter(/** @returns {value is string} */ (value) => typeof value === 'string' && value.length > 0),
        ),
    ];

    if (!category) {
        return { ok: true, violations: [], typesPresent, typesMissing: [] };
    }

    if (list.length < category.minRefs) {
        violations.push(`mínimo ${category.minRefs} refs; encontrado ${list.length}`);
    }

    const typesMissing = category.expected.filter(/** @param {string} t */ (t) => !typesPresent.includes(t));
    if (typesMissing.length === category.expected.length && category.expected.length > 0) {
        violations.push(`nenhum dos tipos esperados (${category.expected.join('/')}) presente`);
    }

    // URL breakage preventivo: archive.org recomendado
    const urlsNonArchive = list.filter(/** @param {ParsedReference} specCategory */ (r) => r.url && !isArchiveOrgUrl(r.url)).length;
    if (urlsNonArchive >= 3) {
        violations.push(`${urlsNonArchive} URLs sem archive.org — considere wayback`);
    }

    return {
        ok: violations.length === 0,
        violations,
        typesPresent,
        typesMissing,
    };
}

/**
 * @param {string} specCategory
 * @returns {Array<string>} tipos REF_TYPES sugeridos
 */
export function suggestRefTypesForCategory(specCategory: string): Array<string> {
        const categories: Record<string, CategorySpec>= SPEC_CATEGORIES;
    const c = categories[specCategory];
    return c ? [...c.expected] : [];
}

