// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/**
 * documentTracks.js - Rich Document Ingestion Track orchestration
 *
 * Extraido de ingestion.js (B2) para manter o handler principal < 3000 linhas.
 * Contem a logica de processamento dos Tracks B, C e D,
 * mais funcoes auxiliares de OCR para PDFs escaneados.
 *
 * Track B: OCR + classificacao de imagens (heuristic + LLM hybrid)
 * Track C: Prose parsing (NER + sections + regulatory refs) + cross-references
 * Track D: Georeferenciamento de mapas (GCPs + affine + well labels)
 *
 * @module utils/handlers/documentTracks
 */
import { buildAssetInput, emptyOCRResult, isOCRSupported, initOCR, recognizeImage, recognizeBatch, preFilterImages, estimateOCRBudget, blobToDataUrl, postProcessOCR, classifyHeuristic, classifyBatch, extractCaption, parseProse, detectCrossRefs, resolveCrossRefs, extractCoordinates, buildTransform, detectLabels, suggestOrigin, } from '../../core/ingestion/documents/index.js';
import { getAllElements } from '../../core/elements/manager.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('DocumentTracks');
// ---------------------------------------------------------------------------
// Track B: OCR + Classification
// ---------------------------------------------------------------------------
/**
 * Track B: OCR + Classification pipeline.
 * Pre-filters images, runs OCR with budget, classifies via heuristic + LLM.
 *
 * @param {Array<any>} blobImages - images with blob/blobUrl
 * @param {Array<any>|null} textItems - text items from Worker (for caption extraction)
 * @param {number} pageCount
 * @param {function} onProgress - (pct: any, msg: any) => void
 * @returns {Promise<{ assets: Array<any>, classifications: Array<any> }>}
 */
export async function processTrackB(blobImages: any, textItems: any, pageCount: any, onProgress: any) {
    onProgress(65, 'Preparando OCR...');
    const { queue } = (preFilterImages(blobImages, pageCount || 1));
    if (queue.length === 0) {
        return { assets: [], classifications: [] };
    }
    // Init OCR (may already be ready from pre-init)
    try {
        await initOCR();
    }
    catch (err: any) {
        log.warn('OCR init failed', (err).message);
        // Classify without OCR (heuristics only)
        const assets = blobImages.map((img: any, _i: any) => buildAssetInput(img, null, null));
        const classifications = assets.map((a: any) => classifyHeuristic(a));
        return { assets, classifications };
    }
    // OCR with budget
    const budget = estimateOCRBudget();
    onProgress(68, `OCR em ${queue.length} imagens...`);
    const ocrDataUrls = [];
    for (const img of queue) {
        if (img.blob) {
            ocrDataUrls.push({ dataUrl: await blobToDataUrl(img.blob), index: img.index || 0 });
        }
    }
    let ocrResults;
    try {
        ocrResults = await recognizeBatch(ocrDataUrls, {
            budgetMs: budget,
            onProgress: (idx: any, total: any) => onProgress(68 + (idx / Math.max(total, 1)) * 15, `OCR ${idx + 1}/${total}`),
        });
    }
    catch (err: any) {
        if ((err).name === 'AbortError') {
            // Previous batch superseded - return empty, caller will retry
            return { assets: [], classifications: [] };
        }
        throw err;
    }
    // Build asset inputs with OCR results
    const assets = blobImages.map((img: any, _i: any) => {
        const queueIdx = queue.indexOf(img);
        const ocrResult = queueIdx >= 0 ? (ocrResults[queueIdx] ?? emptyOCRResult('missing')) : emptyOCRResult('skipped');
        // Extract caption from nearby text items
        const caption = textItems && img.page
            ? extractCaption({
                imageBbox: img.bbox || { x: 0, y: 0, width: img.width || 1, height: img.height || 1 },
                textItems: textItems.filter((t: any) => t.page === img.page),
            })
            : null;
        return buildAssetInput(img, ocrResult, caption);
    });
    // Classify all (heuristic + LLM for low-confidence)
    onProgress(85, 'Classificando figuras...');
    const classifications = await classifyBatch(assets, {
        onProgress: (idx: any, total: any) => onProgress(85 + (idx / Math.max(total, 1)) * 5, `Classificando ${idx + 1}/${total}`),
    });
    return { assets, classifications };
}
// ---------------------------------------------------------------------------
// Track C: Prose + Cross-references
// ---------------------------------------------------------------------------
/**
 * Track C: Prose parsing + cross-reference resolution.
 *
 * @param {string} rawText - full document text with \f page separators
 * @param {Array<any>} documentAssets - from Track B
 * @param {Array<any>} assetClassifications - from Track B
 * @param {Array<any>} tables - from Worker
 * @returns {Promise<{ proseResult: any, crossRefs: any }>}
 */
export async function processTrackC(rawText: any, documentAssets: any, assetClassifications: any, tables: any) {
    // Get known wells from workspace for canonical matching
    let knownWells = [];
    try {
        const elements = getAllElements();
        knownWells = elements.filter((el: any) => el.family === 'well' && el.name).map((el: any) => el.name);
    }
    catch (e: any) {
        console.debug('[documentTracks] track-c-known-wells:', (e)?.message || e); /* original: no workspace loaded */
    }
    // Parse prose (async, yields per page)
    const proseResult = await parseProse(rawText, { knownWells });
    // Detect cross-references
    const refs = detectCrossRefs(rawText);
    const crossRefs = resolveCrossRefs(refs, {
        assets: documentAssets.map((a: any, i: any) => ({
            page: a.page,
            caption: a.caption,
            index: i,
            id: `temp-${i}`, // Real DB ID populated after INSERT
        })),
        tables: (tables || []).map((t: any, i: any) => ({ page: t.page || 0, index: i })),
    });
    return { proseResult, crossRefs };
}
// ---------------------------------------------------------------------------
// Track D: Georeferencing
// ---------------------------------------------------------------------------
/**
 * Track D: Georeferencing for map assets.
 *
 * @param {Array<any>} mapAssets - assets classified as 'map' or 'plume_contour'
 * @param {Array<any>} allClassifications - all classifications from Track B
 * @param {Array<any>} allAssets - all assets from Track B
 * @returns {{ mapResults: Array<any>, suggestedOrigin: any }}
 */
export function processTrackD(mapAssets: any, allClassifications: any, allAssets: any) {
    const mapResults = [];
    const allWellLabels = [];
    // Hoist workspace well lookup outside loop (R17)
    let knownWells = [];
    try {
        knownWells = getAllElements()
            .filter((el: any) => el.family === 'well' && el.name)
            .map((el: any) => el.name);
    }
    catch (e: any) {
        console.debug('[documentTracks] map-assets-known-wells:', (e)?.message || e); /* original: no workspace loaded */
    }
    for (const asset of mapAssets) {
        const assetIdx = allAssets.indexOf(asset);
        // Extract coordinates from map margins
        const coords = extractCoordinates({
            ocrWords: asset.ocrWords || [],
            ocrText: asset.ocrText || '',
            imageWidth: asset.width || 1,
            imageHeight: asset.height || 1,
        });
        // Build transform if enough GCPs
        let transform = null;
        if (coords.gcps.length >= 2) {
            const georef = buildTransform(coords.gcps, {
                crs: coords.crs?.epsg || 'EPSG:31983',
                imageWidth: asset.width || 1,
                imageHeight: asset.height || 1,
                pxPerMeter: coords.scaleBar?.pxPerMeter,
            });
            transform = georef?.transform || null;
        }
        const labels = detectLabels({
            ocrWords: asset.ocrWords || [],
            imageWidth: asset.width || 1,
            imageHeight: asset.height || 1,
            transform,
            knownWells,
        });
        mapResults.push({
            assetIndex: assetIdx,
            coordinates: coords,
            transform: transform ? { ...transform } : null,
            labels,
        });
        allWellLabels.push(...labels.wellLabels);
    }
    // Suggest model origin from well label centroid
    const suggestedModelOrigin = suggestOrigin(allWellLabels);
    return { mapResults, suggestedOrigin: suggestedModelOrigin };
}
// ---------------------------------------------------------------------------
// Scanned PDF Processing
// ---------------------------------------------------------------------------
/**
 * Process scanned PDF pages: full-page OCR -> rawText + textItems + tables.
 * SP-28: Scanned path.
 *
 * @param {Array<any>} pageImages - ArrayBuffer images from Worker
 * @param {function} onProgress - (pct: any, msg: any) => void
 * @returns {Promise<{ rawText: string, textItems: Array<any>|null, tables: Array<any> }>}
 */
export async function processScannedPages(pageImages: any, onProgress: any) {
    if (!isOCRSupported()) {
        return { rawText: '', textItems: null, tables: [] };
    }
    try {
        await initOCR();
    }
    catch (err: any) {
        log.warn('OCR init failed for scanned path', (err).message);
        return { rawText: '', textItems: null, tables: [] };
    }
    const budget = estimateOCRBudget();
    const startTime = Date.now();
    const pageOCRResults = [];
    for (let i = 0; i < pageImages.length; i++) {
        if (Date.now() - startTime > budget) {
            log.warn(`Scanned OCR budget exceeded at page ${i + 1}/${pageImages.length}`);
            break;
        }
        onProgress(62 + Math.round((i / pageImages.length) * 20), `OCR pagina ${i + 1}/${pageImages.length}...`);
        try {
            const blob = new Blob([pageImages[i].imageData], { type: 'image/jpeg' });
            const dataUrl = await blobToDataUrl(blob);
            const ocrResult = await recognizeImage(dataUrl, { minWordConfidence: 25 });
            pageOCRResults.push({ page: pageImages[i].page, ...ocrResult });
        }
        catch (err: any) {
            pageOCRResults.push({ page: pageImages[i].page, text: '', words: [], error: (err).message });
        }
    }
    // Assemble rawText from pages
    const rawText = pageOCRResults.map((r: any) => postProcessOCR(r.text || '')).join('\f');
    // Build textItems from OCR words
    const textItems = [];
    for (const r of pageOCRResults) {
        for (const w of r.words || []) {
            textItems.push({
                x: w.bbox.x,
                y: w.bbox.y,
                width: w.bbox.width,
                height: w.bbox.height,
                text: w.text,
                page: r.page,
            });
        }
    }
    // Simple table reconstruction from OCR grid patterns (SP-28)
    const tables = _reconstructTablesFromOCR(pageOCRResults);
    return { rawText, textItems, tables };
}
// ---------------------------------------------------------------------------
// Blob URL Helpers
// ---------------------------------------------------------------------------
/**
 * Convert Worker ArrayBuffer images to Blob URLs for efficient rendering.
 * SP-31: Blob URLs cost ~0 JS heap bytes vs ~200KB per base64 string.
 *
 * @param {Array<any>} images - images with imageData ArrayBuffer
 * @returns {Array<any>}
 */
export function convertImagesToBlobUrls(images: any) {
    return images.map((img: any) => {
        if (img.imageData instanceof ArrayBuffer) {
            const blob = new Blob([img.imageData], { type: 'image/jpeg' });
            const blobUrl = URL.createObjectURL(blob);
            return { ...img, blob, blobUrl, imageData: null };
        }
        // Legacy: if already has dataUrl (shouldn't happen in v0.2)
        if (img.dataUrl) {
            return { ...img, blobUrl: img.dataUrl, blob: null };
        }
        return img;
    });
}
/**
 * Cleanup: revoke all Blob URLs.
 *
 * @param {Array<any>|null} images
 */
export function cleanupBlobUrls(images: any) {
    if (!images)
        return;
    for (const img of images) {
        if (img.blobUrl && img.blob) {
            try {
                URL.revokeObjectURL(img.blobUrl);
            }
            catch (e: any) {
                console.debug('[documentTracks] revoke-blob-url:', (e)?.message || e); /* original ignore */
            }
        }
    }
}
// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------
/**
 * Reconstruct tables from OCR word grids (scanned PDFs).
 * SP-28 + SP-36: numeric sort for column counts.
 */
function _reconstructTablesFromOCR(pageResults: any) {
    const tables = [];
    for (const { page, words } of pageResults) {
        if (!words || words.length < 8)
            continue;
        const sorted = [...words].sort((a: any, b: any) => a.bbox.y - b.bbox.y);
        const rows = [];
        let currentRow = [sorted[0]];
        let lastY = sorted[0].bbox.y;
        for (let i = 1; i < sorted.length; i++) {
            if (Math.abs(sorted[i].bbox.y - lastY) > 12) {
                if (currentRow.length >= 2)
                    rows.push(currentRow);
                currentRow = [];
                lastY = sorted[i].bbox.y;
            }
            currentRow.push(sorted[i]);
        }
        if (currentRow.length >= 2)
            rows.push(currentRow);
        if (rows.length < 3)
            continue;
        const colCounts = rows.map((r: any) => r.length);
        colCounts.sort((a: any, b: any) => a - b); // SP-36: numeric sort
        const modeCount = colCounts[Math.floor(colCounts.length / 2)];
        const consistentRows = rows.filter((r: any) => Math.abs(r.length - modeCount) <= 1);
        if (consistentRows.length >= 3 && modeCount >= 2) {
            const table = consistentRows.map((row: any) => row.sort((a: any, b: any) => a.bbox.x - b.bbox.x).map((w: any) => w.text));
            const filled = table.flat().filter((c: any) => c.trim()).length;
            const conf = Math.min(0.5 + (filled / (table.length * modeCount)) * 0.3, 0.8);
            tables.push({ table, confidence: Math.round(conf * 100) / 100, page });
        }
    }
    return tables;
}
