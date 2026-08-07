// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Narration Sanitizer - TTS-safe text pipeline for Launch Video profile.
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE_LAUNCH_VIDEO.md §10

const MOJIBAKE_MAP: Record<string, string> = {
    'Ã¡': 'á',
    'Ã ': 'à',
    'Ã¢': 'â',
    'Ã£': 'ã',
    'Ã¤': 'ä',
    'Ã©': 'é',
    'Ã¨': 'è',
    Ãª: 'ê',
    'Ã«': 'ë',
    'Ã­': 'í',
    'Ã¬': 'ì',
    'Ã®': 'î',
    'Ã¯': 'ï',
    'Ã³': 'ó',
    'Ã²': 'ò',
    'Ã´': 'ô',
    Ãµ: 'õ',
    'Ã¶': 'ö',
    Ãº: 'ú',
    'Ã¹': 'ù',
    'Ã»': 'û',
    'Ã¼': 'ü',
    'Ã§': 'ç',
    'Ã±': 'ñ',
    'Ã\u0081': 'Á',
    'Ã\u0080': 'À',
    'Ã\u0082': 'Â',
    'Ã\u0083': 'Ã',
    'Ã\u0089': 'É',
    'Ã\u0088': 'È',
    'Ã\u008A': 'Ê',
    'Ã\u008D': 'Í',
    'Ã\u008C': 'Ì',
    'Ã\u008E': 'Î',
    'Ã\u0093': 'Ó',
    'Ã\u0092': 'Ò',
    'Ã\u0094': 'Ô',
    'Ã\u0095': 'Õ',
    'Ã\u009A': 'Ú',
    'Ã\u0099': 'Ù',
    'Ã\u009B': 'Û',
    'Ã\u0087': 'Ç',
    'Ã\u0091': 'Ñ',
    'â€™': '\u2019',
    'â€˜': '\u2018',
    'â€œ': '\u201C',
    'â€\u009D': '\u201D',
    'â€”': '\u2014',
    'â€"': '\u2014',
    'â€¦': '\u2026',
    'Â·': '·',
    'Â°': '°',
    'Â®': '®',
};

const MOJIBAKE_DETECT_REGEX = /Ã[\u0080-\u009F\u00A0-\u00BF¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿]|â€[™˜œ\u009D"–—¦]/;

const SENTENCE_SPLIT_LIMIT = 200;
const ABSOLUTE_MAX_LENGTH = 1200;

const BLOCKING_CODES = {
    MOJIBAKE_PRESENT: 'MOJIBAKE_PRESENT',
    MARKDOWN_RESIDUAL: 'MARKDOWN_RESIDUAL',
    SYMBOL_OVERLOAD: 'SYMBOL_OVERLOAD',
    OVERLENGTH_SEGMENT: 'OVERLENGTH_SEGMENT',
    NON_TEXT_CHARS: 'NON_TEXT_CHARS',
    EMPTY: 'EMPTY',
};

/**
 * Normalize Unicode to NFC (canonical composition) and trim whitespace.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalize(text: string): string {
    if (!text) return '';
    return String(text).normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * Detect common mojibake patterns (UTF-8 bytes interpreted as Latin-1).
 *
 * @param {string} text
 * @returns {boolean}
 */
export function detectMojibake(text: string): boolean {
    if (!text) return false;
    return MOJIBAKE_DETECT_REGEX.test(text);
}

/**
 * Returns true when text has no detectable mojibake.
 * Convenience inverse used by callers/tests.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isMojibakeFree(text: string): boolean {
    return !detectMojibake(text);
}

/**
 * Auto-repair mojibake sequences using a conservative substitution map.
 * Does not fix every possible double-encoded case - only known PT-BR/EN pairs.
 *
 * @param {string} text
 * @returns {string}
 */
export function repairMojibake(text: string): string {
    if (!text) return '';
    let out = String(text);
    const keys = Object.keys(MOJIBAKE_MAP).sort((a, b) => b.length - a.length);
    for (const k of keys) {
        if (out.includes(k)) out = out.split(k).join(MOJIBAKE_MAP[k]);
    }
    return out;
}

/**
 * Strip markdown that leaks into spoken narration (bold/italic/links/code/headings).
 *
 * @param {string} text
 * @returns {string}
 */
export function stripMarkdown(text: string): string {
    if (!text) return '';
    let out = String(text);
    out = out.replace(/```[\s\S]*?```/g, ' ');
    out = out.replace(/`([^`]+)`/g, '$1');
    out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
    out = out.replace(/__([^_]+)__/g, '$1');
    out = out.replace(/(^|[\s(])\*([^*\s][^*]*?)\*/g, '$1$2');
    out = out.replace(/(^|[\s(])_([^_\s][^_]*?)_/g, '$1$2');
    out = out.replace(/~~([^~]+)~~/g, '$1');
    out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
    out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    out = out.replace(/^#{1,6}\s+/gm, '');
    out = out.replace(/^>\s+/gm, '');
    out = out.replace(/^[-*+]\s+/gm, '');
    out = out.replace(/^\d+\.\s+/gm, '');
    return out;
}

/**
 * Reduce symbolic punctuation that TTS engines mispronounce or over-pause on.
 *
 * @param {string} text
 * @returns {string}
 */
export function tameSymbols(text: string): string {
    if (!text) return '';
    let out = String(text);
    out = out.replace(/[→⇒➜▶►▸▹]/g, ', ');
    out = out.replace(/[•·∙●○◦▪▫■□]/g, ', ');
    out = out.replace(/[★☆✓✔✗✘]/g, ' ');
    out = out.replace(/\.{4,}/g, '...');
    out = out.replace(/!{2,}/g, '!');
    out = out.replace(/\?{2,}/g, '?');
    out = out.replace(/\s+—\s+/g, ' — ');
    out = out.replace(/\s{2,}/g, ' ');
    return out.trim();
}

/**
 * Split long input into TTS-safe sentence-sized segments.
 * Prefers sentence-final punctuation; falls back to comma, then whitespace.
 *
 * @param {string} text
 * @param {number} [limit]
 * @returns {string[]}
 */
export function splitIntoSegments(text: string, limit = SENTENCE_SPLIT_LIMIT): string[] {
    if (!text) return [];
    const t = String(text).trim();
    if (!t) return [];
    if (t.length <= limit) return [t];

    const sentences = t.split(/(?<=[.!?])\s+/);
    const out = [];
    for (const s of sentences) {
        if (s.length <= limit) {
            out.push(s);
            continue;
        }
        const commas = s.split(/(?<=,)\s+/);
        let buf = '';
        for (const c of commas) {
            if ((buf + ' ' + c).trim().length > limit && buf) {
                out.push(buf.trim());
                buf = c;
            } else {
                buf = buf ? buf + ' ' + c : c;
            }
        }
        if (buf.trim()) out.push(buf.trim());
    }
    return out.filter((x) => x && x.trim().length > 0);
}

/**
 * Full sanitization pipeline, idempotent and pure.
 * Steps: normalize → repair mojibake → strip markdown → tame symbols → re-normalize.
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeNarration(text: string): string {
    if (!text) return '';
    let out = normalize(text);
    out = repairMojibake(out);
    out = stripMarkdown(out);
    out = tameSymbols(out);
    out = normalize(out);
    return out;
}

/**
 * Convert text to TTS-safe form with warning/error reporting.
 * Blocks export when mojibake remains after auto-repair or text becomes empty.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {number} [options.segmentLimit] - max segment length (default 200)
 * @param {number} [options.absoluteMax] - absolute max length (default 1200)
 * @returns {{ok: boolean, text: string, segments: string[], warnings: string[], errors: string[]}}
 */
export function toTtsSafeText(text: string, options: { segmentLimit?: number; absoluteMax?: number } = {}): { ok: boolean; text: string; segments: string[]; warnings: string[]; errors: string[] } {
    const segmentLimit = options.segmentLimit ?? SENTENCE_SPLIT_LIMIT;
    const absoluteMax = options.absoluteMax ?? ABSOLUTE_MAX_LENGTH;
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!text || !String(text).trim()) {
        errors.push(BLOCKING_CODES.EMPTY);
        return { ok: false, text: '', segments: [], warnings, errors };
    }

    const original = String(text);
    if (detectMojibake(original)) warnings.push(BLOCKING_CODES.MOJIBAKE_PRESENT);
    if (/[*_`~#>]|\[[^\]]+\]\([^)]+\)/.test(original)) warnings.push(BLOCKING_CODES.MARKDOWN_RESIDUAL);

    const sanitized = sanitizeNarration(original);

    if (detectMojibake(sanitized)) {
        errors.push(BLOCKING_CODES.MOJIBAKE_PRESENT);
    }

    const symbolsLeft = (sanitized.match(/[•·→⇒★☆]/g) || []).length;
    if (symbolsLeft > 2) warnings.push(BLOCKING_CODES.SYMBOL_OVERLOAD);

    // eslint-disable-next-line no-control-regex -- detect stray control chars that TTS engines mispronounce
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(sanitized)) {
        errors.push(BLOCKING_CODES.NON_TEXT_CHARS);
    }

    if (sanitized.length > absoluteMax) {
        warnings.push(BLOCKING_CODES.OVERLENGTH_SEGMENT);
    }

    const segments = splitIntoSegments(sanitized, segmentLimit);
    const hasOverlong = segments.some((s) => s.length > segmentLimit * 1.25);
    if (hasOverlong) warnings.push(BLOCKING_CODES.OVERLENGTH_SEGMENT);

    return {
        ok: errors.length === 0,
        text: sanitized,
        segments,
        warnings: Array.from(new Set(warnings)),
        errors: Array.from(new Set(errors)),
    };
}

/**
 * Expose blocking codes for UI/tests without stringly-typed coupling.
 */
export const SANITIZER_CODES = Object.freeze({ ...BLOCKING_CODES });
