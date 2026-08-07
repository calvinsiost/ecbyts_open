// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   TRANSLATION ENGINE — C5a from SPEC_REPORT_SCRIPTS_LIBRARY
   Motor de traducao de relatorios preservando HTML + glossario tecnico

   Traduz relatorios ambientais (PT↔EN↔ES extensivel) preservando:
   - Tags HTML (anchors, tabelas, headings, spans)
   - Termos tecnicos do glossario (nao re-traduz "CONAMA", "3CTA+", etc)
   - Links e IDs de cenas

   Estrategia de preservacao:
   1. Extrair nodes de TEXTO do HTML mantendo referencias
   2. Aplicar glossario: substituir termos protegidos por placeholders {{TERM_N}}
   3. Split em chunks (~3000 chars) por paragrafo/heading para docs grandes
   4. Traduzir cada chunk via LLM (reusa core/llm/client.js)
   5. Substituir placeholders de volta
   6. Reinjetar texto traduzido nos nodes originais (HTML intacto)
   7. Cache via idbStore.js com TTL 24h (key = hash(content+lang))

   Referencia: docs/specs/features/SPEC_REPORT_SCRIPTS_LIBRARY.md (C5a)
   ================================================================ */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';

const log = createLogger('TranslationEngine');

// ── Configuration ────────────────────────────────────────────────────────────

/** Maximum characters per chunk sent to LLM (approx ~750 tokens) */
const MAX_CHUNK_CHARS = 3000;

/** Cache TTL in milliseconds (24h) */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** IDB key prefix for translation cache entries */
const CACHE_KEY_PREFIX = 'ecbyts-translation-cache:';

/** Rough chars-per-token ratio for cost estimation (GPT-4 avg) */
const CHARS_PER_TOKEN = 4;

/** Supported language pairs */
export const SUPPORTED_LANGUAGES = Object.freeze({
    'pt-BR': { label: 'Português (BR)', flag: '🇧🇷' },
    'en-US': { label: 'English (US)', flag: '🇺🇸' },
    'es-LA': { label: 'Español (LA)', flag: '🇲🇽' },
});

/** Default glossary terms — preserved without translation */
const DEFAULT_GLOSSARY = Object.freeze([
    // Brazilian environmental agencies/norms
    'CONAMA',
    'CETESB',
    'IBAMA',
    'ICMBio',
    'ABNT',
    'ANVISA',
    'INMETRO',
    'SGA',
    'NBR',
    // EIS and scientific framework
    'EIS',
    '3CTA+',
    '3CTA',
    'ECBT',
    'ecbyts',
    'PDPL-U',
    'PDPLU',
    'ALCOA++',
    // Environmental concepts (context-specific, don't retranslate)
    'CETESB DD-256',
    'CONAMA 420',
    'CONAMA 357',
    'CONAMA 396',
    'GAC',
    'VR',
    'VP',
    'VI',
    'CMA',
    // Chemical compounds
    'BTEX',
    'PAH',
    'TPH',
    'PCB',
    'VOC',
    'SVOC',
]);

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TranslationRequest
 * @property {string} sourceLang - e.g. 'pt-BR'
 * @property {string} targetLang - e.g. 'en-US'
 * @property {string} html - HTML content to translate
 * @property {string[]} [glossary] - Additional terms to protect
 */

/**
 * @typedef {Object} TranslationEstimate
 * @property {number} chars - Total characters to translate (after glossary protection)
 * @property {number} tokens - Estimated tokens
 * @property {number} chunks - Number of chunks that will be sent
 * @property {number} glossaryHits - Number of glossary terms found
 * @property {string|null} cacheHit - Cache key if already translated, null otherwise
 */

/**
 * @typedef {Object} TranslationResult
 * @property {string} html - Translated HTML (tags preserved)
 * @property {number} tokensUsed - Actual tokens consumed
 * @property {number} chunks - Chunks processed
 * @property {boolean} fromCache - True if served from cache
 * @property {number} durationMs - Total time taken
 */

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Estimate tokens from character count using a conservative ratio.
 * @param {number} chars
 * @returns {number}
 */
export function estimateTokens(chars: any) {
    return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Split plain text into chunks of approximately MAX_CHUNK_CHARS,
 * respecting paragraph boundaries (double newline or </p>).
 * @param {string} text - Plain text (after HTML extraction)
 * @param {number} [maxChars=MAX_CHUNK_CHARS]
 * @returns {string[]}
 */
export function chunkText(text: any, maxChars = MAX_CHUNK_CHARS) {
    if (!text || text.length <= maxChars) return text ? [text] : [];

    const chunks = [];
    const paragraphs = text.split(/\n\s*\n/);
    let current = '';

    for (const para of paragraphs) {
        if (current.length + para.length + 2 <= maxChars) {
            current = current ? `${current}\n\n${para}` : para;
        } else {
            if (current) chunks.push(current);
            // If a single paragraph exceeds the limit, split on sentence boundaries
            if (para.length > maxChars) {
                const sentences = para.split(/(?<=[.!?])\s+/);
                let sentBuf = '';
                for (const s of sentences) {
                    if (sentBuf.length + s.length + 1 > maxChars) {
                        if (sentBuf) chunks.push(sentBuf);
                        // Single sentence longer than max → hard split
                        if (s.length > maxChars) {
                            for (let i = 0; i < s.length; i += maxChars) {
                                chunks.push(s.slice(i, i + maxChars));
                            }
                            sentBuf = '';
                        } else {
                            sentBuf = s;
                        }
                    } else {
                        sentBuf = sentBuf ? `${sentBuf} ${s}` : s;
                    }
                }
                if (sentBuf) chunks.push(sentBuf);
                current = '';
            } else {
                current = para;
            }
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

/**
 * Replace glossary terms with placeholders to protect them during translation.
 * Returns the protected text and a map of placeholders to original terms.
 *
 * @param {string} text - Source text
 * @param {string[]} glossary - Terms to protect
 * @returns {{ protected: string, map: Map<string, string>, hits: number }}
 */
export function protectGlossary(text: any, glossary: any) {
    if (!text || !Array.isArray(glossary) || glossary.length === 0) {
        return { protected: text || '', map: new Map(), hits: 0 };
    }

    const map = new Map();
    let hits = 0;
    let result = text;

    // Sort by length desc so "CONAMA 420" matches before "CONAMA"
    const sorted = [...new Set(glossary)].sort((a, b) => b.length - a.length);

    for (let i = 0; i < sorted.length; i++) {
        const term = sorted[i];
        if (!term) continue;
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Word boundary match - \b doesn't work well with special chars, use lookaround
        const pattern = new RegExp(`(^|[^\\w-])(${escaped})(?=[^\\w-]|$)`, 'g');
        let localHits = 0;
        result = result.replace(pattern, (match: any, prefix: any) => {
            const placeholder = `{{TERM_${i}}}`;
            if (!map.has(placeholder)) {
                map.set(placeholder, term);
            }
            localHits++;
            return `${prefix}${placeholder}`;
        });
        hits += localHits;
    }
    return { protected: result, map, hits };
}

/**
 * Restore glossary terms from placeholders back to the translated text.
 * @param {string} text - Translated text with placeholders
 * @param {Map<string, string>} map - Placeholder → original term map
 * @returns {string}
 */
export function restoreGlossary(text: any, map: any) {
    if (!text || !(map instanceof Map) || map.size === 0) return text || '';
    let result = text;
    for (const [placeholder, original] of map.entries()) {
        const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'g'), original);
    }
    return result;
}

/**
 * Deterministic hash (non-cryptographic, 32-bit) for cache keys.
 * @param {string} str
 * @returns {string}
 */
export function hashContent(str: any) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h << 5) - h + str.charCodeAt(i);
        h |= 0; // force 32-bit
    }
    return (h >>> 0).toString(16); // unsigned hex
}

/**
 * Extract plain text from HTML while keeping a reference map for reconstruction.
 * Uses a simple regex parser - DOMParser would be more robust but not available
 * in Node test environment without polyfills.
 *
 * Returns: { text, segments } where segments is an array of
 *   { type: 'text'|'tag', content: string } so we can walk and reinject.
 *
 * @param {string} html
 * @returns {{ text: string, segments: Array<{type: string, content: string}> }}
 */
export function extractTextSegments(html: any) {
    if (!html) return { text: '', segments: [] };

    const segments = [];
    const textParts = [];
    const re = /<[^>]+>|[^<]+/g;
    let match;
    while ((match = re.exec(html)) !== null) {
        const chunk = match[0];
        if (chunk.startsWith('<')) {
            segments.push({ type: 'tag', content: chunk });
        } else {
            segments.push({ type: 'text', content: chunk });
            textParts.push(chunk);
        }
    }
    return { text: textParts.join('\n\n'), segments };
}

/**
 * Reinject translated text back into HTML segments (keeps tags intact).
 * The translated text is expected to have the same number of text segments
 * as the original, separated by double newlines.
 *
 * @param {Array<{type: string, content: string}>} segments - Original segments
 * @param {string} segments - Translated plain text
 * @returns {string} Reconstructed HTML
 */
export function reinjectTranslatedText(segments: any, translatedText: any) {
    if (!segments || segments.length === 0) return '';
    const translatedParts = (translatedText || '').split(/\n\s*\n/);
    let textIdx = 0;
    return segments
        .map((seg: any) => {
            if (seg.type === 'tag') return seg.content;
            const replacement = translatedParts[textIdx] !== undefined ? translatedParts[textIdx] : seg.content;
            textIdx++;
            return replacement;
        })
        .join('');
}

// ── Cache ────────────────────────────────────────────────────────────────────

/**
 * Build cache key from content + language pair.
 * @param {string} sourceLang
 * @param {string} targetLang
 * @param {string} content
 * @returns {string}
 */
export function buildCacheKey(sourceLang: any, targetLang: any, content: any) {
    return `${CACHE_KEY_PREFIX}${sourceLang}->${targetLang}:${hashContent(content)}`;
}

/**
 * Read a translation from cache if available and not expired.
 * @param {string} cacheKey
 * @returns {Promise<{html: string, timestamp: number}|null>}
 */
export async function readCache(cacheKey: any) {
    try {
        const entry = await idbGet(cacheKey);
        if (!entry || typeof entry !== 'object') return null;
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            log.debug('Cache expired for %s', cacheKey);
            return null;
        }
        return entry;
    } catch (err) {
        log.warn('Cache read failed: %s', (err as Error).message);
        return null;
    }
}

/**
 * Write a translation to cache.
 * @param {string} cacheKey
 * @param {string} html
 * @returns {Promise<void>}
 */
export async function writeCache(cacheKey: any, html: any) {
    try {
        await idbSet(cacheKey, { html, timestamp: Date.now() });
    } catch (err) {
        log.warn('Cache write failed: %s', (err as Error).message);
    }
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Estimate cost/tokens/chunks for a translation request without calling LLM.
 * Also checks cache to report if it would be a hit.
 *
 * @param {TranslationRequest} request
 * @returns {Promise<TranslationEstimate>}
 */
export async function estimateTranslation(request: any) {
    const { sourceLang, targetLang, html } = request || {};
    if (!html) {
        return { chars: 0, tokens: 0, chunks: 0, glossaryHits: 0, cacheHit: null };
    }

    const { text } = extractTextSegments(html);
    const glossary = [...DEFAULT_GLOSSARY, ...(request?.glossary || [])];
    const { protected: protectedText, hits } = protectGlossary(text, glossary);
    const chunks = chunkText(protectedText);
    const cacheKey = buildCacheKey(sourceLang, targetLang, html);
    const cacheEntry = await readCache(cacheKey);

    return {
        chars: protectedText.length,
        tokens: estimateTokens(protectedText.length),
        chunks: chunks.length,
        glossaryHits: hits,
        cacheHit: cacheEntry ? cacheKey : null,
    };
}

/**
 * Translate a report HTML from sourceLang to targetLang.
 * Preserves HTML tags, protects glossary terms, caches results.
 *
 * Requires a caller-provided `translateChunk` function (injected for testability
 * and to avoid direct LLM dependency in this module - production calls pass
 * the real LLM client, tests pass a mock).
 *
 * @param {TranslationRequest} request
 * @param {(chunk: string, sourceLang: string, targetLang: string) => Promise<string>} translateChunk
 *   - Function that takes a plain-text chunk and returns the translated version.
 *     Production: wraps core/llm/client.js sendMessage().
 *     Tests: mock that reverses or stubs the string.
 * @param {Object} [options]
 * @param {(event: {current: number, total: number, phase: string, detail?: string}) => void} [options.onProgress]
 *   - Optional callback fired at each progress update. current/total count is
 *     per substantive text segment. phase is one of: 'preparing', 'translatingChunk',
 *     'finalizing'. Use with utils/ui/aiProgressOverlay.js for user feedback.
 * @returns {Promise<TranslationResult>}
 */
export async function translateReport(request: any, translateChunk: any, options: any = {}) {
    const started = Date.now();
    const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : () => {};
    const { sourceLang, targetLang, html } = request || {};
    if (!html || typeof html !== 'string') {
        throw new Error('translateReport: html content required');
    }
    if (!sourceLang || !targetLang) {
        throw new Error('translateReport: sourceLang and targetLang required');
    }
    if (sourceLang === targetLang) {
        // No-op: return original
        return { html, tokensUsed: 0, chunks: 0, fromCache: false, durationMs: 0 };
    }
    if (typeof translateChunk !== 'function') {
        throw new Error('translateReport: translateChunk callback required');
    }

    onProgress({ current: 0, total: 0, phase: 'preparing' });

    // 1. Check cache first
    const cacheKey = buildCacheKey(sourceLang, targetLang, html);
    const cached = await readCache(cacheKey);
    if (cached) {
        log.info('Cache hit for %s', cacheKey);
        onProgress({ current: 1, total: 1, phase: 'finalizing' });
        return {
            html: cached.html,
            tokensUsed: 0,
            chunks: 0,
            fromCache: true,
            durationMs: Date.now() - started,
        };
    }

    // 2. Extract segments (tags + text interleaved, preserving order)
    const { segments } = extractTextSegments(html);
    const glossary = [...DEFAULT_GLOSSARY, ...(request?.glossary || [])];

    // 2.5. Count substantive text segments for progress total
    const substantiveIndices = [];
    for (let i = 0; i < segments.length; i++) {
        if (segments[i]!.type === 'text' && (segments[i]!.content || '').trim()) {
            substantiveIndices.push(i);
        }
    }
    const totalSegments = substantiveIndices.length;
    onProgress({ current: 0, total: totalSegments, phase: 'translatingChunk' });

    // 3. Segment-by-segment translation preserves 1:1 mapping with HTML structure.
    //    Previous approach (join all text with \n\n + split after) rotated content
    //    when the HTML had whitespace between tags (captured as text segments) or
    //    nested inline tags. Per-segment is simpler and structurally safe.
    //    Whitespace-only segments (newlines between block tags) are skipped.
    let totalChars = 0;
    let chunkCount = 0;
    let segIdx = 0;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]!;
        if (seg.type! !== 'text') continue;

        const raw = seg.content! || '';
        // Skip whitespace-only segments (gaps between block tags like "<h1>A</h1>\n<p>")
        if (!raw.trim()) continue;

        // Protect glossary per segment (map is local to each segment - simpler)
        const { protected: protectedSeg, map } = protectGlossary(raw, glossary);
        totalChars += protectedSeg.length;

        // Chunk this segment if it's larger than MAX_CHUNK_CHARS (rare for HTML nodes)
        const segChunks = chunkText(protectedSeg);
        const translatedParts = [];
        for (const chunk of segChunks) {
            try {
                const result = await translateChunk(chunk, sourceLang, targetLang);
                translatedParts.push(result || chunk);
                chunkCount++;
            } catch (err) {
                const msg = (err as Error).message || String(err);
                // "LLM not configured" é condição ESPERADA (usuário sem chave LLM /
                // engine local) — degrada em silêncio (debug), não polui o console
                // como erro a cada interação. Achado via varredura de modais
                // (UncertaintyHub spam, Calvin 2026-06-03). Demais falhas: error real.
                if (/LLM not configured/i.test(msg)) {
                    log.debug('Segment chunk skipped (LLM not configured) — mantém original');
                } else {
                    log.error('Segment chunk failed: %s', msg);
                }
                translatedParts.push(chunk); // graceful degradation
            }
        }

        segIdx++;
        onProgress({
            current: segIdx,
            total: totalSegments,
            phase: 'translatingChunk',
            detail: raw.length > 60 ? raw.slice(0, 60) + '…' : raw,
        });

        // Rejoin chunks for this segment + restore glossary placeholders
        const translatedSeg = translatedParts.join(' ');
        segments[i] = {
            type: 'text',
            content: restoreGlossary(translatedSeg, map),
        };
    }

    onProgress({ current: totalSegments, total: totalSegments, phase: 'finalizing' });

    // 4. Rebuild HTML from segments (tags untouched, text replaced in-place)
    const finalHtml = segments.map((s) => s.content).join('');

    // 5. Cache the result
    await writeCache(cacheKey, finalHtml);

    return {
        html: finalHtml,
        tokensUsed: estimateTokens(totalChars),
        chunks: chunkCount,
        fromCache: false,
        durationMs: Date.now() - started,
    };
}

/**
 * Reset in-memory state. For testing only.
 * @param {boolean} [clearIdb=false]
 * @returns {Promise<void>}
 */
export async function _resetForTesting(clearIdb = false) {
    if (clearIdb) {
        // No global list - caller is responsible for cleaning specific keys
        log.debug('Cache reset (caller must clear specific keys)');
    }
}
