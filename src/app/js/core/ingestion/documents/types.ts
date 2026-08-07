// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Document Ingestion - Shared Types & Constants
// @since v0.2

/**
 * types.js - Shared contract types for document ingestion pipeline.
 *
 * Both imageOCR and figureClassifier depend on these types,
 * not on each other. Eliminates coupling between pipeline stages.
 *
 * @module core/ingestion/documents/types
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** PDPL-U / PDPLU element families */
export const ALL_FAMILIES = [
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
] as const;
export type FamilyType = (typeof ALL_FAMILIES)[number];

/** Valid asset types for document_assets table */
export const ASSET_TYPES = [
    'table',
    'figure',
    'map',
    'plume_contour',
    'floor_plan',
    'lithologic_profile',
    'cross_section',
    'photo',
    'chart',
    'flow_diagram',
    'unknown',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/** Well ID prefixes (Brazilian environmental monitoring standard) */
export const WELL_PREFIXES = 'PM|MW|PZ|PP|PB|PT|PA|RB|SB|PMA|PMR|PMC|PMG|PI|PC|PE|SS|PF';

/** Well ID regex (non-global, for single .test()/.match()) */
export const WELL_ID_RE = new RegExp(`^(${WELL_PREFIXES})\\s*[-.]?\\s*\\d{1,4}[A-Z]?`, 'i');

/** Processing status values */
export const PROCESSING_STATUS = {
    PENDING: 'pending',
    OCR_DONE: 'ocr_done',
    CLASSIFIED: 'classified',
    DIGITIZED: 'digitized',
    REVIEWED: 'reviewed',
    INGESTED: 'ingested',
    REJECTED: 'rejected',
} as const;
export type ProcessingStatus = (typeof PROCESSING_STATUS)[keyof typeof PROCESSING_STATUS];

/** Image margin zones as fraction of image dimensions */
export const MARGIN_ZONES = {
    top: { yMin: 0.0, yMax: 0.12 },
    bottom: { yMin: 0.88, yMax: 1.0 },
    left: { xMin: 0.0, xMax: 0.12 },
    right: { xMin: 0.88, xMax: 1.0 },
} as const;

// ---------------------------------------------------------------------------
// Type Definitions (JSDoc - no runtime cost)
// ---------------------------------------------------------------------------

export interface OCRWordBox {
    text: string;
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
}

export interface OCRResult {
    text: string;
    confidence: number;
    words: OCRWordBox[];
    lines: string[];
    error: string | null;
    durationMs: number;
}

export interface DocumentAssetInput {
    blob: Blob | null;
    blobUrl: string;
    width: number;
    height: number;
    page: number;
    index: number;
    ocrText: string;
    ocrWords: OCRWordBox[];
    ocrConfidence: number;
    caption: string | null;
    bbox: { x: number; y: number; width: number; height: number } | null;
}

export interface ClassificationResult {
    assetType: AssetType;
    familyHint: FamilyType | null;
    confidence: number;
    method: 'heuristic' | 'llm_vision' | 'hybrid';
    reasoning: string;
    heuristics: {
        aspectRatio: number;
        ocrKeywordScore: number;
        captionScore: number;
        dimensionScore: number;
    };
    llmResult: unknown | null;
}

/**
 * @typedef {object} OCRWordBox
 * @property {string} text
 * @property {number} confidence
 * @property {{x:number, y:number, width:number, height:number}} bbox
 */

/**
 * @typedef {object} OCRResult
 * @property {string} text
 * @property {number} confidence
 * @property {OCRWordBox[]} words
 * @property {string[]} lines
 * @property {string|null} error
 * @property {number} durationMs
 */

/**
 * @typedef {object} DocumentAssetInput
 * @property {Blob|null} blob
 * @property {string} blobUrl
 * @property {number} width
 * @property {number} height
 * @property {number} page
 * @property {number} index
 * @property {string} ocrText
 * @property {OCRWordBox[]} ocrWords
 * @property {number} ocrConfidence
 * @property {string|null} caption
 * @property {{x:number, y:number, width:number, height:number}|null} bbox
 */

/**
 * @typedef {object} ClassificationResult
 * @property {string} assetType
 * @property {string|null} familyHint
 * @property {number} confidence
 * @property {'heuristic'|'llm_vision'|'hybrid'} method
 * @property {string} reasoning
 * @property {{aspectRatio:number, ocrKeywordScore:number, captionScore:number, dimensionScore:number}} heuristics
 * @property {unknown|null} llmResult
 */

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a DocumentAssetInput from Worker image data + OCR result + caption.
 * Central factory - all pipeline stages consume this type.
 *
 * @param {{blob?: Blob|null, blobUrl?: string, width?: number, height?: number, page?: number, index?: number}} workerImage
 * @param {OCRResult|null} ocrResult
 * @param {string|null} caption
 * @returns {DocumentAssetInput}
 */
export function buildAssetInput(
    workerImage: {
        blob?: Blob | null;
        blobUrl?: string;
        width?: number;
        height?: number;
        page?: number;
        index?: number;
    },
    ocrResult: OCRResult | null,
    caption: string | null,
): DocumentAssetInput {
    return {
        blob: workerImage.blob || null,
        blobUrl: workerImage.blobUrl || '',
        width: workerImage.width || 0,
        height: workerImage.height || 0,
        page: workerImage.page || 1,
        index: workerImage.index || 0,
        ocrText: ocrResult?.text || '',
        ocrWords: ocrResult?.words || [],
        ocrConfidence: ocrResult?.confidence || 0,
        caption: caption || null,
        bbox: null,
    };
}

/**
 * Create an empty OCR result (for skipped/failed images).
 *
 * @param {string|null} error - error message or null
 * @returns {OCRResult}
 */
export function emptyOCRResult(error: string | null = null): OCRResult {
    return {
        text: '',
        confidence: 0,
        words: [],
        lines: [],
        error,
        durationMs: 0,
    };
}
