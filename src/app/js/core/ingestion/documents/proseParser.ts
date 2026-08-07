// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.2

/**
 * proseParser.js - NER + section segmentation + regulatory reference extraction.
 *
 * Parses raw document text into structured sections, named entities,
 * and regulatory references. Async with per-page yield to avoid blocking UI.
 *
 * CRITICAL: All /g regexes have lastIndex reset before iteration.
 * Without this, second call returns 0 results (classic JS stateful regex bug).
 *
 * @module core/ingestion/documents/proseParser
 */

import { canonicalizeWellId, matchExistingWell } from './wellIdCanon.js';
import { WELL_PREFIXES } from './types.js';
import { yieldToMain } from '../../../utils/performance/yielding.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ProseSection
 * @property {number}      index
 * @property {string}      heading
 * @property {number}      level    - 1-3 or 0 for body
 * @property {number|null} page
 * @property {string}      body
 * @property {number}      charStart
 * @property {number}      charEnd
 */

/**
 * @typedef {Object} NamedEntity
 * @property {string} type       - 'well_id' | 'parameter' | 'date' | 'company' | 'person' | 'location'
 * @property {string} value
 * @property {string} canonical
 * @property {number} page
 * @property {number} charOffset - first occurrence
 * @property {number} count
 */

/**
 * @typedef {Object} RegulatoryReference
 * @property {string}      type     - 'CONAMA' | 'CETESB' | 'NBR' | 'IBAMA' | 'portaria'
 * @property {string}      number
 * @property {string}      fullMatch
 * @property {number}      page
 * @property {string|null} article
 */

/**
 * @typedef {Object} ProseParseResult
 * @property {ProseSection[]}       sections
 * @property {NamedEntity[]}        entities
 * @property {RegulatoryReference[]} regulations
 * @property {Object}               stats
 */

// ---------------------------------------------------------------------------
// NER Rules
// ---------------------------------------------------------------------------

const NER_RULES = [
    {
        type: 'well_id',
        re: new RegExp(`\\b(${WELL_PREFIXES})\\s*[-.]?\\s*\\d{1,4}[A-Z]?\\b`, 'gi'),
        canonFn: (/** @type {any} */ val: any) => canonicalizeWellId(val),
    },
    {
        type: 'parameter',
        re: /\b(benzeno|tolueno|etilbenzeno|xileno[s]?|BTEX|naftaleno|1,2[- ]dicloroetano|tricloroeteno|tetracloroeteno|cloreto\s*de\s*vinila|PCE|TCE|DCE|VC|MTBE|benzo\[a\]pireno|chumbo|cádmio|cromo|mercúrio|arsênio|níquel|zinco|cobre|bário|manganês|ferro|alumínio|fluoreto|nitrato|sulfato|cloreto|DBO|DQO|OD|pH|condutividade|turbidez|sólidos\s*(totais|dissolvidos|suspensos))\b/gi,
        canonFn: (/** @type {any} */ val: any) => val.toLowerCase().trim(),
    },
    {
        type: 'date',
        re: /\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})\b/g,
        canonFn: (/** @type {any} */ val: any) => val.replace(/\s/g, ''),
    },
    {
        type: 'date',
        re: /\b(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:de\s*)?(\d{4})\b/gi,
        canonFn: (/** @type {any} */ val: any) => val.toLowerCase(),
    },
    {
        type: 'company',
        re: /\b([A-ZÁÀÂÃÉÈÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÈÊÍÓÔÕÚÇa-záàâãéèêíóôõúç\s&.]{9,60})\s*(?:ltda|s\.?a\.?|eireli|me|epp|s\/s)\b/gi,
        canonFn: (/** @type {any} */ val: any) => val.trim(),
    },
];

// ---------------------------------------------------------------------------
// Regulatory Rules
// ---------------------------------------------------------------------------

const REGULATORY_RULES = [
    {
        type: 'CONAMA',
        re: /\bCONAMA\s*(?:n[°º.]?\s*)?(\d{2,4})\s*[/,]\s*(\d{4})/gi,
        format: (/** @type {any} */ m: any) => ({
            number: `${m[1]}/${m[2]}`
        }),
    },
    {
        type: 'CETESB',
        re: /\bCETESB\s*(?:DD\s*)?(\d{2,4})\s*[/,]\s*(\d{4})/gi,
        format: (/** @type {any} */ m: any) => ({
            number: `${m[1]}/${m[2]}`
        }),
    },
    {
        type: 'CETESB',
        re: /\b(?:valores?\s*(?:orientadores?|de\s*intervenção|de\s*prevenção))\s*(?:da\s*)?CETESB\s*(?:\(?(\d{4})\)?)?/gi,
        format: (/** @type {any} */ m: any) => ({
            number: m[1] || 'latest'
        }),
    },
    {
        type: 'CETESB',
        re: /\bCETESB\s*\(?(\d{4})\)?/gi,
        format: (/** @type {any} */ m: any) => ({
            number: m[1]
        }),
    },
    {
        type: 'NBR',
        re: /\bNBR\s*(\d{2,5}(?:[-:]\d{1,4})?)\s*[/,:]?\s*(\d{4})?/gi,
        format: (/** @type {any} */ m: any) => ({
            number: m[2] ? `${m[1]}/${m[2]}` : m[1]
        }),
    },
    {
        type: 'IBAMA',
        re: /\bIBAMA\s*(?:IN\s*)?(?:n[°º.]?\s*)?(\d{1,4})\s*[/,]\s*(\d{4})/gi,
        format: (/** @type {any} */ m: any) => ({
            number: `${m[1]}/${m[2]}`
        }),
    },
    {
        type: 'portaria',
        re: /\bPortaria\s*(?:n[°º.]?\s*)?(\d{1,5})\s*[/,]\s*(\d{4})\s*(?:do\s*)?(\w+)?/gi,
        format: (/** @type {any} */ m: any) => ({
            number: `${m[1]}/${m[2]}${m[3] ? ' ' + m[3] : ''}`
        }),
    },
];

/** Article pattern — linked to nearest regulation */
const ARTICLE_RE = /\b[Aa]rt(?:igo)?\.?\s*(\d{1,4})(?:\s*[,§]\s*(\d+)[°º]?)?/g;

// ---------------------------------------------------------------------------
// Section Detection
// ---------------------------------------------------------------------------

const HEADING_PATTERNS = [
    // Numbered: "1.", "1.1", "1.1.1"
    {
        re: /^(\d{1,2}(?:\.\d{1,2}){0,2})\s*[.)\-–]\s+(.+)$/,
        levelFn: (/** @type {any} */ m: any) => Math.min(m[1].split('.').length, 3),
    },
    // UPPERCASE lines (≤80 chars, no period at end)
    {
        re: /^([A-ZÁÀÂÃÉÈÊÍÓÔÕÚÇ\s]{5,80})$/,
        levelFn: () => 1,
        filter: (/** @type {any} */ m: any) => !/\.\s*$/.test(m[1]) && m[1].trim().length >= 5,
    },
    // Roman numerals
    {
        re: /^(I{1,3}|IV|V|VI{0,3}|IX|X)\s*[.)\-–]\s+(.+)$/,
        levelFn: () => 1,
    },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse raw document text into sections, entities, and regulatory references.
 * Async with per-page yield to avoid blocking UI on large documents.
 *
 * @param {string} rawText - full text with \f page separators
 * @param {Object} [options]
 * @param {string[]} [options.knownWells] - existing well IDs for canonical matching
 * @returns {Promise<ProseParseResult>}
 */
export async function parseProse(rawText: any, options: any = {}) {
    if (!rawText) {
        return {
            sections: [],
            entities: [],
            regulations: [],
            stats: { sectionCount: 0, entityCount: 0, regulationCount: 0, pageCount: 0 },
        };
    }

    const pages = rawText.split('\f');

    // Process per page with yield (async for UI responsiveness)
    const allEntities = new Map(); // canonical → entity
    /** @type {any[]} */
    const allRegulations: any = [];
    let charOffset = 0;

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const pageText = pages[pageIdx];
        const pageNum = pageIdx + 1;

        // Extract entities from this page
        _extractEntitiesFromPage(pageText, pageNum, charOffset, allEntities, options.knownWells);

        // Extract regulations from this page
        _extractRegulationsFromPage(pageText, pageNum, charOffset, allRegulations);

        charOffset += pageText.length + 1; // +1 for \f

        // Yield every 5 pages to let UI breathe
        if (pageIdx % 5 === 4) {
            await yieldToMain({ timeoutMs: 0 });
        }
    }

    // Sections from full text
    const sections = extractSections(rawText);

    // Convert entities map to sorted array
    const entities = [...allEntities.values()].sort((a, b) => b.count - a.count);

    return {
        sections,
        entities,
        regulations: allRegulations,
        stats: {
            sectionCount: sections.length,
            entityCount: entities.length,
            regulationCount: allRegulations.length,
            pageCount: pages.length,
        },
    };
}

/**
 * Extract sections from rawText (heading detection).
 * @param {string} rawText
 * @returns {ProseSection[]}
 */
export function extractSections(rawText: any) {
    if (!rawText) return [];

    const pages = rawText.split('\f');
    const sections = [];
    let currentSection = { index: 0, heading: 'Untitled', level: 0, page: 1, body: '', charStart: 0, charEnd: 0 };
    let globalOffset = 0;

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const pageText = pages[pageIdx];
        const pageNum = pageIdx + 1;
        const lines = pageText.split('\n');

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            // Skip trailing empty string from split('\n') on text ending with \n
            if (lineIdx === lines.length - 1 && line === '') {
                break;
            }
            const trimmed = line.trim();
            if (!trimmed) {
                currentSection.body += '\n';
                globalOffset += line.length + 1;
                continue;
            }

            let isHeading = false;
            for (const hp of HEADING_PATTERNS) {
                const m = trimmed.match(hp.re);
                if (m && (!hp.filter || hp.filter(m))) {
                    // Flush current section
                    currentSection.charEnd = globalOffset;
                    currentSection.body = currentSection.body.trim();
                    if (currentSection.body || currentSection.heading !== 'Untitled') {
                        sections.push({ ...currentSection });
                    }

                    // Start new section
                    const headingText = m[2] ? m[2].trim() : trimmed;
                    currentSection = {
                        index: sections.length,
                        heading: headingText,
                        level: hp.levelFn(m),
                        page: pageNum,
                        body: '',
                        charStart: globalOffset,
                        charEnd: 0,
                    };
                    isHeading = true;
                    break;
                }
            }

            if (!isHeading) {
                currentSection.body += trimmed + '\n';
            }
            globalOffset += line.length + 1;
        }
        globalOffset += 1; // \f
    }

    // Flush last section
    currentSection.charEnd = globalOffset;
    currentSection.body = currentSection.body.trim();
    sections.push(currentSection);

    return sections;
}

/**
 * Extract named entities from rawText.
 * @param {string} rawText
 * @param {Object} [options]
 * @param {string[]} [options.knownWells]
 * @returns {NamedEntity[]}
 */
export function extractEntities(rawText: any, options: any = {}) {
    if (!rawText) return [];
    const entities = new Map();
    _extractEntitiesFromPage(rawText, 1, 0, entities, options.knownWells);
    return [...entities.values()].sort((a, b) => b.count - a.count);
}

/**
 * Extract regulatory references from rawText.
 * @param {string} rawText
 * @returns {RegulatoryReference[]}
 */
export function extractRegulations(rawText: any) {
    if (!rawText) return [];
    /** @type {any[]} */
    const regs: any = [];
    _extractRegulationsFromPage(rawText, 1, 0, regs);
    return regs;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function _extractEntitiesFromPage(/** @type {any} */ text: any, /** @type {any} */ page: any, /** @type {any} */ baseOffset: any, /** @type {any} */ entityMap: any, /** @type {any} */ knownWells: any) {
    for (const rule of NER_RULES) {
        rule.re.lastIndex = 0; // MANDATORY: prevent stale state
        let match;
        while ((match = rule.re.exec(text)) !== null) {
            const raw = match[0];
            const canonical = rule.canonFn ? rule.canonFn(raw) : raw;
            if (!canonical) continue;

            const key = `${rule.type}:${canonical}`;
            if (entityMap.has(key)) {
                entityMap.get(key).count++;
            } else {
                /** @type {any} */
                const entity: any = {
                    type: rule.type,
                    value: raw.trim(),
                    canonical,
                    page,
                    charOffset: baseOffset + match.index,
                    count: 1,
                };

                // Match against workspace wells
                if (rule.type === 'well_id' && knownWells) {
                    const existing = matchExistingWell(canonical, knownWells);
                    if (existing) entity.matchedExisting = existing;
                }

                entityMap.set(key, entity);
            }
        }
    }
}

function _extractRegulationsFromPage(/** @type {any} */ text: any, /** @type {any} */ page: any, /** @type {any} */ baseOffset: any, /** @type {any} */ regulations: any) {
    // Collect article references first (for linking)
    ARTICLE_RE.lastIndex = 0;
    const articles = [];
    let am;
    while ((am = ARTICLE_RE.exec(text)) !== null) {
        articles.push({
            article: `Art. ${am[1]}${am[2] ? ', §' + am[2] : ''}`,
            charOffset: baseOffset + am.index,
        });
    }

    for (const rule of REGULATORY_RULES) {
        rule.re.lastIndex = 0; // MANDATORY
        let match;
        while ((match = rule.re.exec(text)) !== null) {
            const formatted = rule.format(match);
            const regOffset = baseOffset + match.index;

            // Find nearest article reference (within 200 chars)
            let linkedArticle = null;
            for (const art of articles) {
                if (Math.abs(art.charOffset - regOffset) <= 200) {
                    linkedArticle = art.article;
                    break;
                }
            }

            regulations.push({
                type: rule.type,
                number: formatted.number,
                fullMatch: match[0],
                page,
                article: linkedArticle,
            });
        }
    }
}
