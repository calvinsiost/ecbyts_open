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

/**
 * docAIAnalyzer.js - AI-assisted document analysis for PDF/DOCX ingestion
 * ADR-022: Neuro-Symbolic Document Ingestion - AI Layer (optional)
 *
 * Usa LLM (Gemini, OpenAI, Claude) para analise assistida de documentos:
 * - Analise de imagens extraidas (mapas, plumas, perfis)
 * - Classificacao de family para cada tabela
 * - Extracao de metadados do relatorio
 *
 * PRINCIPIO: LLM NAO extrai dados numericos. Apenas classifica, sugere
 * e analisa contexto visual. Dados numericos vem do pipeline deterministico.
 *
 * @module core/ingestion/documents/docAIAnalyzer
 */

import { sendMessage, hasApiKey } from '../../llm/client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageInput {
    dataUrl: string;
    page?: number;
    width?: number;
    height?: number;
}

interface ImageAnalysisResult {
    imageIndex: number;
    type: string;
    elements: string[];
    families: string[];
    description: string;
    error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max images to analyze per document (controla custo de tokens) */
const MAX_IMAGES_TO_ANALYZE = 10;

/** Max tokens for image analysis response */
const IMAGE_ANALYSIS_TOKENS = 1500;

/** Max tokens for table classification response */
const TABLE_CLASSIFICATION_TOKENS = 500;

/** Max tokens for metadata extraction response */
const METADATA_TOKENS = 500;

/** All PDPL-U / PDPLU families available for classification */
const ALL_FAMILIES = [
    'well',
    'plume',
    'lake',
    'river',
    'spring',
    'building',
    'tank',
    'marker',
    'boundary',
    'stratum',
    'sample',
    'area',
    'individual',
    'incident',
    'emission_source',
    'waste_stream',
    'effluent_point',
    'habitat',
    'sensor',
    'intangible',
    'blueprint',
    'generic',
];

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const IMAGE_ANALYSIS_PROMPT = `You are an expert environmental engineer analyzing images from environmental investigation reports.
For each image, identify:
1. Type: location map, well layout, lithologic profile, plume contour, photo, chart, cross-section, other
2. Visible elements: wells (PM, MW, PZ), contamination plumes, buildings, tanks, rivers, springs, waste areas
3. PDPL-U / PDPLU families detected: ${ALL_FAMILIES.join(', ')}
4. Brief description (1-2 sentences)

Respond ONLY in valid JSON format:
{"type":"...","elements":["PM-01","PM-02"],"families":["well","plume"],"description":"..."}`;

const TABLE_CLASSIFICATION_PROMPT = `You are an expert environmental engineer. Analyze this table header and sample rows from an environmental report.
Classify which PDPL-U / PDPLU element family this table describes.

Available families: ${ALL_FAMILIES.join(', ')}

Common patterns:
- Tables with well IDs (PM-, MW-, PZ-) and chemical concentrations → "well"
- Tables with plume extents, NAPL thickness → "plume"
- Tables with emission rates, stack parameters → "emission_source"
- Tables with waste manifests, PGRS data → "waste_stream"
- Tables with effluent BOD/COD data → "effluent_point"
- Tables with incident records, safety data → "incident"
- Tables with species counts, habitat areas → "habitat"
- Tables with geological layers, lithology → "stratum"
- Tables not matching any specific pattern → "generic"

Respond ONLY in valid JSON format:
{"family":"well","confidence":0.9,"reasoning":"Table contains well IDs (PM-01..PM-27) with VOC concentrations"}`;

const METADATA_PROMPT = `You are an expert environmental engineer. Extract metadata from this text excerpt of an environmental report.
Identify:
1. Report title
2. Date (if mentioned)
3. Location/site name
4. Company/consultant name
5. Report type (investigation, monitoring, remediation, audit, etc.)

Respond ONLY in valid JSON format:
{"title":"...","date":"...","location":"...","company":"...","reportType":"..."}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks if LLM is available for AI-assisted analysis.
 * @returns {boolean}
 */
export function isLLMAvailable() {
    return hasApiKey();
}

async function analyzeSingleImage(
    img: ImageInput,
    index: number,
    signal: AbortSignal | undefined,
): Promise<ImageAnalysisResult> {
    try {
        const requestOptions: Record<string, unknown> = {
            image: img.dataUrl,
            maxTokens: IMAGE_ANALYSIS_TOKENS,
            temperature: 0.2,
        };
        if (signal) requestOptions.signal = signal;
        const response = await sendMessage(
            IMAGE_ANALYSIS_PROMPT,
            `Analyze this image (page ${img.page || '?'}, ${img.width || '?'}x${img.height || '?'}px) from an environmental report.`,
            requestOptions,
        );

        const parsed = _parseJSON(response.content);
        return {
            imageIndex: index,
            type: parsed.type || 'unknown',
            elements: Array.isArray(parsed.elements) ? parsed.elements : [],
            families: Array.isArray(parsed.families)
                ? parsed.families.filter((f: any) => ALL_FAMILIES.includes(f))
                : [],
            description: parsed.description || '',
        };
    } catch (err) {
        return {
            imageIndex: index,
            type: 'error',
            elements: [],
            families: [],
            description: '',
            error: (err as any).message,
        };
    }
}

/**
 * Analyzes document images using LLM vision.
 * Sends each image to the LLM with a specialized environmental engineering prompt.
 *
 * @param {Array<{dataUrl: string, page?: number, width?: number, height?: number}>} images
 * @param {Object} [options]
 * @param {function} [options.onProgress] - Progress callback (index, total, result)
 * @param {AbortSignal} [options.signal] - AbortSignal for cancellation
 * @returns {Promise<Array<{imageIndex: number, type: string, elements: string[], families: string[], description: string, error?: string}>>}
 */
export async function analyzeDocumentImages(images: any, options: any = {}) {
    if (!images || images.length === 0) return [];
    if (!hasApiKey()) return [];

    const toAnalyze = images.slice(0, MAX_IMAGES_TO_ANALYZE);
    const results: ImageAnalysisResult[] = [];

    for (let i = 0; i < toAnalyze.length; i++) {
        const img = toAnalyze[i];
        if (options.onProgress) options.onProgress(i, toAnalyze.length, null);

        const result = await analyzeSingleImage(img, i, options.signal || undefined);
        results.push(result);

        if (options.onProgress) options.onProgress(i, toAnalyze.length, result);
    }

    return results;
}

/**
 * Classifies which element family a table describes using LLM.
 *
 * @param {string[]} headers - Table header row
 * @param {string[][]} sampleRows - 2-3 sample data rows
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{family: string, confidence: number, reasoning: string}>}
 */
export async function classifyTableFamily(headers: any, sampleRows: any, options: any = {}) {
    if (!hasApiKey()) {
        return { family: 'generic', confidence: 0, reasoning: 'LLM not available' };
    }

    const headerStr = headers.join(' | ');
    const sampleStr = (sampleRows || [])
        .slice(0, 3)
        .map((r: any) => r.join(' | '))
        .join('\n');

    try {
        const response = await sendMessage(
            TABLE_CLASSIFICATION_PROMPT,
            `Headers: ${headerStr}\nSample rows:\n${sampleStr}`,
            {
                maxTokens: TABLE_CLASSIFICATION_TOKENS,
                temperature: 0.1,
                signal: options.signal || null,
            },
        );

        const parsed = _parseJSON(response.content);
        return {
            family: ALL_FAMILIES.includes(parsed.family) ? parsed.family : 'generic',
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
            reasoning: parsed.reasoning || '',
        };
    } catch (err) {
        return { family: 'generic', confidence: 0, reasoning: `LLM error: ${(err as any).message}` };
    }
}

/**
 * Extracts document metadata from a text excerpt using LLM.
 *
 * @param {string} textSample - First ~500 characters of extracted text
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{title: string, date: string, location: string, company: string, reportType: string}>}
 */
export async function extractDocumentMetadata(textSample: any, options: any = {}) {
    if (!hasApiKey() || !textSample) {
        return { title: '', date: '', location: '', company: '', reportType: '' };
    }

    try {
        const response = await sendMessage(METADATA_PROMPT, textSample.slice(0, 1000), {
            maxTokens: METADATA_TOKENS,
            temperature: 0.1,
            signal: options.signal || null,
        });

        const parsed = _parseJSON(response.content);
        return {
            title: parsed.title || '',
            date: parsed.date || '',
            location: parsed.location || '',
            company: parsed.company || '',
            reportType: parsed.reportType || '',
        };
    } catch {
        return { title: '', date: '', location: '', company: '', reportType: '' };
    }
}

/**
 * Aggregates families detected across all image analyses.
 * Returns sorted list of unique families with occurrence counts.
 *
 * @param {Array<{families: string[]}>} imageResults
 * @returns {Array<{family: string, count: number}>}
 */
export function aggregateDetectedFamilies(imageResults: any) {
    const counts = new Map();
    for (const r of imageResults) {
        for (const f of r.families || []) {
            counts.set(f, (counts.get(f) || 0) + 1);
        }
    }
    return [...counts.entries()].map(([family, count]) => ({ family, count })).sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// F7: AI-assisted Table Classification
// ---------------------------------------------------------------------------

const TABLE_ANALYSIS_PROMPT = `You are an environmental data analyst. Classify the following table extracted from an environmental report.

Respond with JSON only:
{
  "isAnalytical": true/false,
  "tableType": "analytical" | "constructive" | "administrative" | "temporal" | "other",
  "columnMap": {
    "parameter": <column index or -1>,
    "value": <column index or -1>,
    "unit": <column index or -1>,
    "wellId": <column index or -1>,
    "date": <column index or -1>
  },
  "suggestedFamily": "well" | "plume" | "generic",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Table types:
- analytical: contains chemical/physical parameter measurements (concentrations, pH, etc.)
- constructive: well construction data (depth, screen, diameter)
- administrative: metadata, contacts, report info
- temporal: time series of measurements across campaigns/years
- other: none of the above`;

/**
 * F7: Classifies a table using LLM to determine if it contains analytical data
 * and how columns should be mapped.
 *
 * @param {string[]} header - Table header row
 * @param {string[][]} sampleRows - First 5 data rows
 * @param {string} [context] - Surrounding text for context
 * @returns {Promise<{ isAnalytical: boolean, tableType?: string, columnMap?: object, suggestedFamily?: string, confidence?: number }>}
 */
export async function analyzeTableContent(header: any, sampleRows: any, context: any) {
    if (!hasApiKey() || !header || header.length < 2) {
        return { isAnalytical: false };
    }

    const csv = [header.join(' | '), ...sampleRows.slice(0, 5).map((r: any) => r.join(' | '))].join('\n');

    const userMsg = context ? `Context: ${context.substring(0, 500)}\n\nTable:\n${csv}` : `Table:\n${csv}`;

    try {
        const response = await sendMessage(TABLE_ANALYSIS_PROMPT, userMsg, {
            maxTokens: 500,
            temperature: 0.2,
        });

        const parsed = _parseJSON(response?.content || '');
        return {
            isAnalytical: parsed.isAnalytical === true,
            tableType: parsed.tableType || 'other',
            columnMap: parsed.columnMap || null,
            suggestedFamily: parsed.suggestedFamily || 'generic',
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        };
    } catch (err) {
        console.warn('[docAIAnalyzer] analyzeTableContent failed:', (err as any).message);
        return { isAnalytical: false };
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely parses JSON from LLM response, handling markdown code blocks.
 * @param {string} text
 * @returns {any}
 */
function _parseJSON(text: any) {
    if (!text) return {};

    // Strip markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
        return JSON.parse(cleaned);
    } catch {
        // Try to extract JSON from mixed text
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch {
                return {};
            }
        }
        return {};
    }
}
