// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: OCR Local — empacotado com por+eng (IMPORT-UX-001 RF-3)
// @since v0.2

/**
 * ocrLocal.ts - Local OCR facade with por+eng language support.
 *
 * Wraps the Tesseract.js WASM engine (already in the app) behind a
 * simplified interface. Stub implementations throw until the engine
 * binding is wired in a future RF.
 *
 * @module core/ocr/ocrLocal
 */

export interface OcrBBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface OcrResult {
    text: string;
    confidence: number;
    language: 'por' | 'eng' | 'mixed';
    bbox: OcrBBox;
}

export type OcrLanguage = 'por' | 'eng' | 'mixed';

const POR_INDICATORS = [
    'não', 'nao', 'ção', 'cao', 'ões', 'oes', 'á', 'é', 'í', 'ó', 'ú',
    'â', 'ê', 'ô', 'ã', 'õ', 'ç', 'água', 'solo', 'ar', 'resíduo',
    'residuo', 'relatório', 'relatorio', 'análise', 'analise', 'poço',
    'poco', 'monitoramento', 'amostra', 'concentração', 'concentracao',
    'mg/l', 'µg/l', 'ug/l',
];

const ENG_INDICATORS = [
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'water',
    'soil', 'air', 'waste', 'report', 'analysis', 'sample', 'well',
    'monitoring', 'concentration', 'groundwater', 'contamination',
    'remediation', 'environmental',
];

/**
 * Detect the dominant language of OCR-extracted text.
 *
 * Heuristic: counts Portuguese and English indicator hits.
 * Returns 'mixed' when both languages have significant presence.
 *
 * @param text - Raw OCR text
 * @returns Detected language code
 */
export function detectLanguage(text: string): OcrLanguage {
    if (!text || typeof text !== 'string') return 'eng';

    const lower = text.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'eng';

    let porHits = 0;
    let engHits = 0;

    for (const indicator of POR_INDICATORS) {
        if (lower.includes(indicator)) porHits++;
    }
    for (const indicator of ENG_INDICATORS) {
        const re = new RegExp(`\\b${indicator}\\b`, 'i');
        if (re.test(lower)) engHits++;
    }

    if (porHits === 0 && engHits === 0) return 'eng';

    const total = porHits + engHits;
    const porRatio = porHits / total;

    if (porRatio > 0.65) return 'por';
    if (porRatio < 0.35) return 'eng';
    return 'mixed';
}

/**
 * Run local OCR on image data using the bundled Tesseract.js WASM engine.
 *
 * STUB: throws 'not implemented' until the engine binding is wired.
 * The existing imageOCR.ts module handles the actual Tesseract.js
 * integration; this facade will delegate to it once connected.
 *
 * @param _imageData - Image as data URL, Blob, or ImageBitmap
 * @param _lang - Target language(s) for recognition
 * @returns Array of OCR results with bounding boxes
 * @throws {Error} Always throws in stub state
 */
export async function runOcrLocal(
    _imageData: string | Blob | ImageBitmap,
    _lang: OcrLanguage = 'mixed',
): Promise<OcrResult[]> {
    throw new Error(
        'not implemented: runOcrLocal requires Tesseract.js engine binding (IMPORT-UX-001 RF-3 stub)',
    );
}

/**
 * Check whether the local OCR engine is available.
 *
 * STUB: always returns false until engine binding is wired.
 *
 * @returns Whether the WASM OCR engine is loaded and ready
 */
export function isOcrLocalAvailable(): boolean {
    return false;
}
