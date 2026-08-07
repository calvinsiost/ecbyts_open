// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.2

/**
 * figureClassifier.js - Deterministic + LLM hybrid figure classifier.
 *
 * Classifies document images (maps, plumes, profiles, photos, charts)
 * using heuristics first, LLM vision only for low-confidence results.
 *
 * DESIGN: Color analysis intentionally excluded from MVP.
 * Weights redistributed to OCR keywords (strongest signal) and captions.
 * Color analysis adds OffscreenCanvas dependency and triple-decode risk.
 * Reinstate in Phase 2 if heuristic accuracy < 80% on real documents.
 *
 * @module core/ingestion/documents/figureClassifier
 */

import { ASSET_TYPES, ALL_FAMILIES } from './types.js';
import { getLevenshteinSimilarity } from './semanticMatcher.js';
import { isLLMAvailable, analyzeDocumentImages } from './docAIAnalyzer.js';

// ---------------------------------------------------------------------------
// Weights (NO color - 3 signals only)
// ---------------------------------------------------------------------------

const WEIGHTS = {
    ocrKeywords: 0.5, // strongest discriminator
    captionMatch: 0.25, // author-provided labels
    dimensions: 0.15, // size heuristics
    aspectRatio: 0.1, // landscape/portrait/square
};

// ---------------------------------------------------------------------------
// Keyword Rules
// ---------------------------------------------------------------------------

/** OCR keyword → asset_type/family mapping. Priority order. */
const KEYWORD_RULES = [
    { pattern: /pluma|contam|isoline|isolinha|isoconcentra/i, type: 'plume_contour', family: 'plume', boost: 0.4 },
    {
        pattern: /potenciom[eé]tric|fluxo\s*subterr|water\s*table/i,
        type: 'plume_contour',
        family: 'plume',
        boost: 0.35,
    },
    { pattern: /planta\s*baixa|floor\s*plan|layout/i, type: 'floor_plan', family: 'building', boost: 0.4 },
    {
        pattern: /perfil\s*(litol[oó]gico|construtivo|geol[oó]gico)/i,
        type: 'lithologic_profile',
        family: 'stratum',
        boost: 0.4,
    },
    {
        pattern: /se[cç][aã]o\s*(transversal|geol[oó]gica)|cross[- ]section/i,
        type: 'cross_section',
        family: 'stratum',
        boost: 0.35,
    },
    { pattern: /localiza[cç][aã]o|location\s*map|situa[cç][aã]o/i, type: 'map', family: null, boost: 0.3 },
    { pattern: /piper|stiff|durov|schoeller/i, type: 'chart', family: 'well', boost: 0.4 },
    { pattern: /gr[aá]fico|graph|chart|histogram/i, type: 'chart', family: null, boost: 0.25 },
    { pattern: /fluxograma|flow\s*diagram|processo/i, type: 'flow_diagram', family: null, boost: 0.3 },
    { pattern: /foto(grafia)?|photo/i, type: 'photo', family: null, boost: 0.2 },
    { pattern: /\b(utm|epsg|sirgas|sad\s*69|wgs\s*84)\b/i, type: 'map', family: null, boost: 0.25 },
    { pattern: /escala\s*[:\d]|scale\s*[:\d]/i, type: 'map', family: null, boost: 0.15 },
    { pattern: /\b(PM|MW|PZ|PE)-?\d{1,4}\b/i, type: null, family: 'well', boost: 0.3 },
];

/** Domain terms for fuzzy (Levenshtein) matching when regex fails */
const FUZZY_KEYWORDS = [
    'potenciométrico',
    'litológico',
    'contaminação',
    'localização',
    'monitoramento',
    'hidrogeológico',
    'geotécnico',
    'estratigráfico',
];

/** Caption keyword → asset_type (higher priority than OCR) */
const CAPTION_RULES = [
    { pattern: /mapa\s*(potenciom|contam|localiz|monitoram)/i, type: 'map' },
    { pattern: /pluma/i, type: 'plume_contour' },
    { pattern: /planta/i, type: 'floor_plan' },
    { pattern: /perfil\s*(litol|construtiv|geol)/i, type: 'lithologic_profile' },
    { pattern: /se[cç][aã]o/i, type: 'cross_section' },
    { pattern: /figura|figure|fig\./i, type: 'figure' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a single image using deterministic heuristics.
 * Does NOT call LLM. Fast, free, always available.
 *
 * @param {import('./types.js').DocumentAssetInput} input
 * @returns {import('./types.js').ClassificationResult}
 */
export function classifyHeuristic(input: any) {
    const { ocrText, _ocrWords, caption, width, height } = /** @type {any} */ (input);
    const w = width || 1;
    const h = height || 1;

    // --- Sub-scores ---
    const aspectRatio = _scoreAspectRatio(w, h);
    const ocrKeywordResult = _matchKeywords(ocrText || '');
    const ocrKeywordScore = ocrKeywordResult.score;
    const captionResult = _matchCaption(caption || '');
    const captionScore = captionResult.score;
    const dimensionScore = _scoreDimensions(w, h);

    // --- Weighted aggregate ---
    const totalScore =
        aspectRatio * WEIGHTS.aspectRatio +
        ocrKeywordScore * WEIGHTS.ocrKeywords +
        captionScore * WEIGHTS.captionMatch +
        dimensionScore * WEIGHTS.dimensions;

    const { assetType, familyHint } = _resolveAssetTypeAndFamily(
        captionResult,
        ocrKeywordResult,
        dimensionScore,
        w,
        h,
    );

    // Confidence = total score, clamped to [0, 1]
    const confidence = Math.min(Math.max(totalScore, 0), 1);
    const reasons = _buildClassificationReasons(captionResult, ocrKeywordResult, familyHint);

    return {
        assetType,
        familyHint,
        confidence: _round2(confidence),
        method: 'heuristic',
        reasoning: reasons.join('. ') + '.',
        heuristics: {
            aspectRatio: _round2(aspectRatio),
            ocrKeywordScore: _round2(ocrKeywordScore),
            captionScore: _round2(captionScore),
            dimensionScore: _round2(dimensionScore),
        },
        llmResult: null,
    };
}

/**
 * Classify using LLM vision (async, costs tokens).
 *
 * @param {import('./types.js').DocumentAssetInput} input
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<import('./types.js').ClassificationResult>}
 */
export async function classifyWithLLM(input: any, options: any = {}) {
    if (!isLLMAvailable()) {
        return classifyHeuristic(input);
    }

    try {
        // LLMs require data: URIs, not blob: URLs - convert if blob available
        let dataUrl = '';
        if (input.blob) {
            const { blobToDataUrl } = await import('./imageOCR.js');
            dataUrl = (await blobToDataUrl(input.blob)) as string;
        } else {
            dataUrl = input.blobUrl || '';
        }
        const imageResults = await analyzeDocumentImages(
            [{ dataUrl, page: input.page, width: input.width, height: input.height }],
            { signal: options.signal },
        );

        if (!imageResults || imageResults.length === 0 || imageResults[0]!.type === 'error') {
            return classifyHeuristic(input);
        }

        const llm = imageResults[0]!;
        const assetType = _mapLLMType(llm.type);
        const familyHint = (llm.families || []).find((/** @type {any} */ f: any) => ALL_FAMILIES.includes(f)) || null;

        return {
            assetType,
            familyHint,
            confidence: Math.min(0.9, 0.6 + (llm.families?.length || 0) * 0.1),
            method: 'llm_vision',
            reasoning: llm.description || 'LLM classification',
            heuristics: classifyHeuristic(input).heuristics,
            llmResult: llm,
        };
    } catch (/** @type {any} */ err) {
        console.warn('[figureClassifier] LLM classification failed:', (err as any)?.message);
        return classifyHeuristic(input);
    }
}

/**
 * Hybrid: heuristic first, LLM only if below threshold.
 *
 * @param {import('./types.js').DocumentAssetInput} input
 * @param {Object} [options]
 * @param {number} [options.llmThreshold=0.6]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<import('./types.js').ClassificationResult>}
 */
export async function classifyHybrid(input: any, options: any = {}) {
    const { llmThreshold = 0.6, signal } = options;
    const heuristic = classifyHeuristic(input);

    if (heuristic.confidence >= llmThreshold) return heuristic;
    if (!isLLMAvailable()) return heuristic;

    const llmResult = await classifyWithLLM(input, { signal });

    // LLM wins if higher confidence
    if (llmResult.confidence > heuristic.confidence) {
        return { ...llmResult, method: 'hybrid', heuristics: heuristic.heuristics };
    }
    return heuristic;
}

/**
 * Batch classify: heuristic for all, LLM only for low-confidence (up to cap).
 *
 * @param {import('./types.js').DocumentAssetInput[]} inputs
 * @param {Object} [options]
 * @param {number} [options.llmThreshold=0.6]
 * @param {number} [options.maxLLMCalls=10]
 * @param {function} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<import('./types.js').ClassificationResult[]>}
 */
export async function classifyBatch(inputs: any, options: any = {}) {
    const { llmThreshold = 0.6, maxLLMCalls = 10, onProgress, signal } = options;

    // Phase 1: heuristic for all (sync, fast)
    const results = inputs.map((input: any) => classifyHeuristic(input));

    // Phase 2: LLM for low-confidence (async, capped)
    let llmCallCount = 0;
    for (let i = 0; i < results.length; i++) {
        if (signal?.aborted) break;
        if (results[i].confidence >= llmThreshold) continue;
        if (llmCallCount >= maxLLMCalls) continue;
        if (!isLLMAvailable()) continue;

        try {
            const llm = await classifyWithLLM(inputs[i], { signal });
            if (llm.confidence > results[i].confidence) {
                results[i] = { ...llm, method: 'hybrid', heuristics: results[i].heuristics };
            }
            llmCallCount++;
        } catch (/** @type {any} */ err) {
            if ((err as any)?.name === 'AbortError') break;
            // Keep heuristic result on LLM failure
        }

        if (onProgress) onProgress(i, inputs.length, results[i]);
    }

    return results;
}

/**
 * Extract caption from surrounding text items.
 * Searches BOTH above and below the image (ABNT NBR 15287 compatibility).
 * Prefers below-image caption if both found.
 *
 * @param {Object} params
 * @param {{ x: number, y: number, width: number, height: number }} params.imageBbox
 * @param {Array<{ x: number, y: number, text: string }>} params.textItems
 * @param {number} [params.searchAbove=30]
 * @param {number} [params.searchBelow=50]
 * @returns {string|null}
 */
export function extractCaption({
    imageBbox,
    textItems,
    searchAbove = 30,
    searchBelow = 50
}: any) {
    if (!imageBbox || !textItems || textItems.length === 0) return null;

    const captionRe = /fig(?:ura|ure|\.)\s*(\d+)/i;
    let above = null;
    let below = null;

    const imgTop = imageBbox.y;
    const imgBottom = imageBbox.y + imageBbox.height;

    for (const item of textItems) {
        if (!captionRe.test(item.text)) continue;

        if (item.y >= imgBottom && item.y <= imgBottom + searchBelow) {
            below = item.text;
        } else if (item.y <= imgTop && item.y >= imgTop - searchAbove) {
            above = item.text;
        }
    }

    return below || above || null;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

type KeywordMatch = {
    score: number;
    type: string | null;
    family: string | null;
    rawMatch: string;
    fuzzy: boolean;
    fuzzyWord?: string;
    fuzzyKeyword?: string;
};

type CaptionMatch = {
    score: number;
    type: string | null;
    rawMatch: string;
};

function _round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function _resolveAssetTypeAndFamily(
    captionResult: CaptionMatch,
    ocrKeywordResult: KeywordMatch,
    dimensionScore: number,
    w: number,
    h: number,
) {
    // Priority: caption > OCR keyword > dimension heuristic > unknown
    let assetType = 'unknown';
    let familyHint: string | null = null;

    if (captionResult.type && captionResult.score > 0.3) {
        assetType = captionResult.type;
    } else if (ocrKeywordResult.type) {
        assetType = ocrKeywordResult.type;
    } else if (dimensionScore > 0.6 && w > 2000 && h > 1500) {
        assetType = 'photo';
    }

    if (ocrKeywordResult.family) {
        familyHint = ocrKeywordResult.family;
    }

    return { assetType, familyHint };
}

function _buildClassificationReasons(
    captionResult: CaptionMatch,
    ocrKeywordResult: KeywordMatch,
    familyHint: string | null,
): string[] {
    const reasons: string[] = [];
    if (captionResult.type) reasons.push(`Caption matches "${captionResult.rawMatch}"`);
    if (ocrKeywordResult.type) reasons.push(`OCR keyword: ${ocrKeywordResult.rawMatch}`);
    if (ocrKeywordResult.fuzzy)
        reasons.push(`Fuzzy match: "${ocrKeywordResult.fuzzyWord}" → "${ocrKeywordResult.fuzzyKeyword}"`);
    if (familyHint) reasons.push(`Family hint: ${familyHint}`);
    if (reasons.length === 0) reasons.push('No strong signals detected');
    return reasons;
}

function _scoreAspectRatio(/** @type {number} */ w: any, /** @type {number} */ h: any) {
    const ar = w / h;
    // Maps and floor plans are typically landscape (1.2-1.8)
    if (ar >= 1.2 && ar <= 1.8) return 0.8;
    // Profiles are portrait (0.3-0.6)
    if (ar >= 0.3 && ar <= 0.6) return 0.6;
    // Square-ish (0.8-1.2) - could be anything
    if (ar >= 0.8 && ar < 1.2) return 0.4;
    // Extreme ratios - unusual
    return 0.2;
}

function _scoreDimensions(/** @type {number} */ w: any, /** @type {number} */ h: any) {
    const area = w * h;
    if (area > 2000000) return 0.8; // large: likely map or photo
    if (area > 500000) return 0.6; // medium: likely figure
    if (area > 100000) return 0.4; // small: likely chart or detail
    return 0.2; // tiny: likely decoration
}

/**
 * Match OCR text against keyword rules + fuzzy fallback.
 */
function _matchKeywords(/** @type {any} */ ocrText: any) {
    if (!ocrText) return { score: 0, type: null, family: null, rawMatch: '', fuzzy: false };

    // Pass 1: exact regex
    /** @type {{score: number, type: string|null, family: string|null, rawMatch: string, fuzzy: boolean, fuzzyWord?: string, fuzzyKeyword?: string}} */
    let bestMatch: {score: number; type: string|null; family: string|null; rawMatch: string; fuzzy: boolean; fuzzyWord?: string; fuzzyKeyword?: string} = { score: 0, type: null, family: null, rawMatch: '', fuzzy: false };
    for (const rule of KEYWORD_RULES) {
        rule.pattern.lastIndex = 0; // defensive: prevent stale state
        if (rule.pattern.test(ocrText)) {
            const score = rule.boost;
            if (score > bestMatch.score) {
                bestMatch = {
                    score,
                    type: rule.type,
                    family: rule.family,
                    rawMatch: rule.pattern.source.slice(0, 30),
                    fuzzy: false,
                };
            }
        }
    }

    if (bestMatch.score > 0) return bestMatch;

    // Pass 2: Levenshtein for domain terms (OCR errors)
    const words = ocrText.split(/\s+/);
    for (const word of words) {
        if (word.length < 6) continue;
        // Early termination: skip words that can't match any keyword
        for (const keyword of FUZZY_KEYWORDS) {
            if (Math.abs(word.length - keyword.length) > 3) continue;
            const sim = getLevenshteinSimilarity(word.toLowerCase(), keyword);
            if (sim >= 0.75) {
                // Find matching keyword rule
                const rule = KEYWORD_RULES.find((r) => {
                    r.pattern.lastIndex = 0;
                    return r.pattern.test(keyword);
                });
                if (rule) {
                    return {
                        score: rule.boost * 0.7,
                        type: rule.type,
                        family: rule.family,
                        rawMatch: keyword,
                        fuzzy: true,
                        fuzzyWord: word,
                        fuzzyKeyword: keyword,
                    };
                }
            }
        }
    }

    return { score: 0, type: null, family: null, rawMatch: '', fuzzy: false };
}

function _matchCaption(/** @type {any} */ caption: any) {
    if (!caption) return { score: 0, type: null, rawMatch: '' };

    for (const rule of CAPTION_RULES) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(caption)) {
            return {
                score: 0.8,
                type: rule.type,
                rawMatch: caption.slice(0, 50),
            };
        }
    }
    return { score: 0, type: null, rawMatch: '' };
}

function _mapLLMType(/** @type {any} */ llmType: any) {
    /** @type {Record<string, string>} */
    const MAP = {
        'location map': 'map',
        'well layout': 'map',
        'plume contour': 'plume_contour',
        'lithologic profile': 'lithologic_profile',
        photo: 'photo',
        chart: 'chart',
        'cross-section': 'cross_section',
        cross_section: 'cross_section',
    };
    const normalized = (llmType || '').toLowerCase();
    return (MAP as any)[normalized] || (ASSET_TYPES.includes(normalized) ? normalized : 'figure');
}
