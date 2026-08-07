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
 * index.js - Public API for document ingestion module
 * ADR-022: Neuro-Symbolic Document Ingestion
 *
 * Re-exporta as funcoes publicas dos sub-modulos para consumo externo.
 * Ponto unico de entrada: `import { ingestDocument } from 'core/ingestion/documents'`
 *
 * @module core/ingestion/documents
 */
// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------
// Layer 1: Raw Extraction + Clustering
export { reconstructTables, parseDocxTables, filterByConfidence, MIN_CONFIDENCE, HIGH_CONFIDENCE, } from './spatialCluster.js';
// Layer 2: Deterministic Anchoring
export { resolveAlias, getAliasesForParam, getKnownParameterIds, getFullLookupMap, addUserAlias, removeUserAlias, resetUserAliases, getBuiltinAliases, } from './paramAliases.js';
export { extractCASNumbers, extractValue, extractUnit, resolveDocUnit, getDocUnitMap, detectDocumentLocale, } from './regexAnchors.js';
// Layer 3: Semantic Matcher
export { matchSemantic, matchSemanticBatch, setTransformerConsent, getTransformerStatus, initTransformer, getLevenshteinSimilarity, } from './semanticMatcher.js';
// Layer 4: Staging + Cost
export { buildStagingObject, processTable, classifyCrossRefLayout, processCrossRefTable, classifyByConfidence, getStagingSummary, detectFamilyFromContext, parseCoordinate, detectCRS, detectCoordinateTable, extractFields, extractDocMetadataDeterministic, } from './staging.js';
// Layer 5: AI Analysis (optional - requires LLM API key)
export { isLLMAvailable, analyzeDocumentImages, classifyTableFamily, extractDocumentMetadata, aggregateDetectedFamilies, analyzeTableContent, } from './docAIAnalyzer.js';
// Cost Catalog (already implemented - re-export for convenience)
export { getCostCatalog, getCurrency, getEscalationRate, getAnalyticalPrice, getElementCostDefaults, getCampaignCostDefaults, getCostCategories, buildObservationCost, buildElementCostEntry, buildCampaignCost, saveCostOverrides, resetCostCatalog, exportCostCatalog, importCostCatalog, } from './costCatalog.js';
// ---------------------------------------------------------------------------
// v0.2: Rich Document Ingestion - New Modules
// ---------------------------------------------------------------------------
// Shared types & constants
export { ALL_FAMILIES, ASSET_TYPES, WELL_PREFIXES, WELL_ID_RE, PROCESSING_STATUS, MARGIN_ZONES, buildAssetInput, emptyOCRResult, } from './types.js';
// Well ID canonicalization
export { canonicalizeWellId, matchExistingWell, extractWellIds } from './wellIdCanon.js';
// OCR post-processing
export { postProcessOCR } from './ocrPostProcess.js';
// PII detection (LGPD)
export { detectPII, redactPII } from './piiDetector.js';
// Image OCR (Tesseract.js WASM)
export { isOCRSupported, isOCRReady, initOCR, recognizeImage, recognizeBatch, terminateOCR, preFilterImages, estimateOCRBudget, blobToDataUrl, } from './imageOCR.js';
// Figure classification
export { classifyHeuristic, classifyWithLLM, classifyHybrid, classifyBatch, extractCaption, } from './figureClassifier.js';
// Prose parsing (NER + sections + regulatory)
export { parseProse, extractSections, extractEntities, extractRegulations } from './proseParser.js';
// Cross-reference linking
export { detectCrossRefs, resolveCrossRefs } from './crossRefLinker.js';
// Coordinate extraction
export { extractCoordinates, detectScaleBar, detectNumericScale } from './coordinateExtractor.js';
// Georeferencing
export { buildTransform, pixelToWorld, worldToPixel, validateProximity } from './mapGeoreferencer.js';
// Label detection
export { detectLabels, labelsToElements, suggestOrigin } from './labelDetector.js';
// ---------------------------------------------------------------------------
// RICH-DOC-FULL-001 — 70% não-tabular do relatório
// L1 IDENTIDADE + F1 STATUS + F2 LITOLOGIA + F3 CRONOLOGIA + F4 MAPPER
// ---------------------------------------------------------------------------
export { extractReportMetadata, REPORT_METADATA_EXTRACTOR_META } from './_reportMetadataExtractorPure.js';
export type {
    ReportMetadata,
    ClientInfo,
    LocationInfo,
    DocumentInfo,
    ResponsibleInfo,
    CoordinatesInfo,
} from './_reportMetadataExtractorPure.js';
export { extractRegulatoryStatus, REGULATORY_STATUS_EXTRACTOR_META } from './_regulatoryStatusExtractorPure.js';
export type { RegulatoryStatus, ExtractedGacStatus } from './_regulatoryStatusExtractorPure.js';
export { extractLithology, LITHOLOGY_TEXT_EXTRACTOR_META } from './_lithologyTextExtractorPure.js';
export type { LithologyLayer, LithologyExtraction } from './_lithologyTextExtractorPure.js';
export { extractChronology, CHRONOLOGY_EXTRACTOR_META } from './_chronologyExtractorPure.js';
export type { CampaignEvent, CampaignKind, ChronologyExtraction } from './_chronologyExtractorPure.js';
export { buildIngestionPatch, EXTRACTION_TO_WIZARD_META } from './_extractionToWizardPure.js';
export type {
    IngestionAutoPatch,
    ProvenanceRecord,
    ClientPatch,
    AreaPatch,
    DocumentPatch,
    StatusPatch,
    WellLithologyGroup,
} from './_extractionToWizardPure.js';

// Re-export page selection helper (utilizado por documentWorker + UI preview)
export {
    selectPagesToProcess,
    summarizeSelection,
    DEFAULT_PAGE_SELECTION_CONFIG,
    PDF_PAGE_SELECTION_META,
} from './_pdfPageSelectionPure.js';
export type {
    PageSelectionConfig,
    PageSelectionResult,
} from './_pdfPageSelectionPure.js';

// FIGURE-GEOM-001 — metadata geoespacial de figuras + régua de profundidade
export { extractFigureGeometry, FIGURE_GEOMETRY_EXTRACTOR_META } from './_figureGeometryExtractorPure.js';
export type {
    FigureGeometry,
    GeometryKind,
    CrsCode,
    GeoPosition,
    GeoExtent,
    GeoRotation,
} from './_figureGeometryExtractorPure.js';
export { extractDepthRuler, pixelYToValue, DEPTH_RULER_EXTRACTOR_META } from './_depthRulerExtractorPure.js';
export type { DepthRuler, DepthQuantity, DepthUnit, DepthDirection } from './_depthRulerExtractorPure.js';
export {
    extractCoordinateGrid,
    pixelXYToGeo,
    COORDINATE_GRID_EXTRACTOR_META,
} from './_coordinateGridExtractorPure.js';
export type {
    CoordinateGrid,
    GridSystem,
    GridAxisUnit,
    GridCorner,
} from './_coordinateGridExtractorPure.js';
export {
    figureBundleToFamilySpecs,
    FIGURE_GEO_BUNDLE_TO_FAMILY_META,
} from './_figureGeoBundleToFamilyPure.js';
export type {
    FamilyTargetId,
    FamilyElementSpec,
    FigureToFamilyResult,
} from './_figureGeoBundleToFamilyPure.js';

// CONSENSUS-MATRIX-001 — multi-tier validation matrix + modal renderer
export {
    getTierWeight,
    listKnownTiers,
    listKnownFieldTypes,
    TIER_WEIGHTS_META,
} from './_tierWeightsPure.js';
export type { ConsensusTier, FieldType } from './_tierWeightsPure.js';
export {
    disagreementEntropy,
    maxEntropy,
    normalizedDisagreement,
    DISAGREEMENT_ENTROPY_META,
} from './_disagreementEntropyPure.js';
export {
    buildConsensusMatrix,
    CONSENSUS_MATRIX_BUILDER_META,
} from './_consensusMatrixBuilderPure.js';
export type {
    TierOutput,
    ConsensusCategory,
    ConsensusVerdict,
    ConsensusSummary,
    ConsensusMatrixResult,
} from './_consensusMatrixBuilderPure.js';
export {
    renderConsensusModal,
    shouldRenderModal,
    sortByUrgency,
    CONSENSUS_MODAL_RENDERER_META,
} from './_consensusModalRendererPure.js';
export {
    richDocToTierOutputs,
    buildConsensusFromRichDoc,
    RICH_DOC_TO_CONSENSUS_META,
} from './_richDocToConsensusMatrixPure.js';
export type {
    RichDocAutoMetadata,
    FieldTierOutput,
    AdapterOptions as ConsensusAdapterOptions,
} from './_richDocToConsensusMatrixPure.js';

// Orquestrador one-shot — reusa os 4 extractors em sequência sobre rawText
import { extractReportMetadata as _l1 } from './_reportMetadataExtractorPure.js';
import { extractRegulatoryStatus as _f1 } from './_regulatoryStatusExtractorPure.js';
import { extractLithology as _f2 } from './_lithologyTextExtractorPure.js';
import { extractChronology as _f3 } from './_chronologyExtractorPure.js';
import { buildIngestionPatch as _f4 } from './_extractionToWizardPure.js';
import type { IngestionAutoPatch } from './_extractionToWizardPure.js';
import { guardBackendFetch } from '../../../main/guestGate.js';

/**
 * RICH-DOC-FULL-001 — orquestra L1+F1+F2+F3+F4 sobre rawText.
 *
 * Reusa o `rawText` que `ingestDocument` já produz (state.rawText em
 * handlers/ingestion.ts). Não duplica pipeline; é additive ao motor
 * neuro-simbólica de tabelas existente.
 *
 * @param rawText texto bruto extraído pelo Web Worker / pdfplumber
 * @returns IngestionAutoPatch pronto para wizard pré-preencher D1-D13
 */
export function extractFullMetadata(rawText: unknown): IngestionAutoPatch {
    const metadata = _l1(rawText);
    const status = _f1(rawText);
    const lithology = _f2(rawText);
    const chronology = _f3(rawText);
    return _f4(metadata, status, lithology, chronology);
}

// ---------------------------------------------------------------------------
// FIGURE-GEOM-001 — orquestrador combinado (geometria + régua + grid 2D)
// ---------------------------------------------------------------------------
import { extractFigureGeometry as _fg } from './_figureGeometryExtractorPure.js';
import { extractDepthRuler as _fr } from './_depthRulerExtractorPure.js';
import { extractCoordinateGrid as _fgrid } from './_coordinateGridExtractorPure.js';
import type { FigureGeometry } from './_figureGeometryExtractorPure.js';
import type { DepthRuler } from './_depthRulerExtractorPure.js';
import type { CoordinateGrid } from './_coordinateGridExtractorPure.js';
import { degradeWith } from '../../diagnostics/degradationLedger.js';

export interface FigureGeoBundle {
    readonly geometry: FigureGeometry;
    readonly depthRuler: DepthRuler;
    readonly coordinateGrid: CoordinateGrid; // grid 2D — relevante para mapas
    readonly combinedConfidence: number; // 0..1 — média ponderada
}

/**
 * Combina geometria geoespacial + régua de profundidade + grid 2D para
 * uma figura de relatório (perfil, seção, pluma, potenciométrico, etc.).
 *
 * Pesos por kind:
 * - line / point: geometry + depthRuler (sem grid 2D)
 * - polygon / pointSet / isolineSet / raster: geometry + grid 2D
 * - blueprint: apenas geometry (croqui sem georef)
 *
 * Pure-logic. Caller (UI/handler) decide se persiste/aplica.
 */
export function extractFigureWithGeometry(
    caption: unknown,
    adjacentText: unknown = '',
): FigureGeoBundle {
    const geometry = _fg(caption, adjacentText);
    const depthRuler = _fr(caption, adjacentText);
    const coordinateGrid = _fgrid(caption, adjacentText);

    const kindNeedsRuler = ['line', 'point', 'isolineSet'].includes(geometry.kind);
    const kindNeedsGrid = ['polygon', 'pointSet', 'isolineSet', 'raster'].includes(geometry.kind);

    let combined: number;
    if (kindNeedsRuler && kindNeedsGrid) {
        // isolineSet: depende de régua (cota) E grid 2D (posição) — média 3 dimensões
        combined = (geometry.confidence + depthRuler.confidence + coordinateGrid.confidence) / 3;
    } else if (kindNeedsRuler) {
        combined = geometry.confidence * 0.5 + depthRuler.confidence * 0.5;
    } else if (kindNeedsGrid) {
        combined = geometry.confidence * 0.5 + coordinateGrid.confidence * 0.5;
    } else {
        // blueprint / unknown — só geometry
        combined = geometry.confidence;
    }

    return Object.freeze({
        geometry,
        depthRuler,
        coordinateGrid,
        combinedConfidence: Number.isFinite(combined) ? Math.min(1, Math.max(0, combined)) : 0,
    });
}

// ---------------------------------------------------------------------------
// Local imports for orchestration (re-exports don't create local bindings)
// ---------------------------------------------------------------------------
import { processTable as _processTable, getStagingSummary as _getStagingSummary } from './staging.js';
// ---------------------------------------------------------------------------
// High-Level Orchestration
// ---------------------------------------------------------------------------
/**
 * Ingests a document file (PDF or DOCX) through the full pipeline.
 * This is the main entry point for document ingestion.
 *
 * Flow:
 * 1. Sends file to Web Worker for extraction (Layer 1) - text + tables + images
 * 2. Receives tables with confidence scores and embedded images
 * 3. Processes each table through staging pipeline (Layers 2-4) with family detection
 * 4. Returns classified results + images for human review
 *
 * AI analysis (Layer 5) is triggered separately by the user via handleDocAnalyzeAI().
 *
 * @param {File} file - PDF or DOCX file object
 * @param {any} [options]
 * @returns {Promise<any>}
 */
export async function ingestDocument(file: any, options: any = {}) {
    const { minConfidence = 0.6, onProgress } = /** @type {any} */ (options);
    if (!file)
        throw new Error('No file provided');
    const fileName = file.name || 'unknown';
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext !== 'pdf' && ext !== 'docx') {
        throw new Error(`Unsupported file type: .${ext}. Expected .pdf or .docx`);
    }
    // Step 1: Read file as ArrayBuffer
    if (onProgress)
        onProgress(0, 'Reading file...');
    const buffer = await file.arrayBuffer();
    // BUG-6: Save buffer copy BEFORE Worker (Worker detaches the original via transferable)
    const bufferCopy = buffer.slice(0);
    if (ext === 'pdf' && !_isPlausiblePdfBuffer(buffer)) {
        throw new Error('Invalid PDF structure.');
    }
    // Step 1b: Try pdfplumber BEFORE Worker (buffer will be detached by Worker transfer)
    let pdfplumberResult: any;
    let pdfplumberTables = null;
    let pdfplumberMeta = null;
    if (ext === 'pdf') {
        try {
            pdfplumberResult = await _tryPdfplumber(buffer, fileName, onProgress);
            pdfplumberTables = pdfplumberResult?.tables || null;
            pdfplumberMeta = pdfplumberResult?.meta || null;
        }
        catch (e: any) {
            console.debug('[ingestion/documents] pdfplumberFallback:', e?.message || e);
            /* fallback to clustering */
        }
    }
    // Step 2: Extract tables + images via Web Worker (also gets rawText, images, pageCount)
    if (onProgress)
        onProgress(15, 'Starting extraction...');
    const workerResult: any = await runWorker(buffer, fileName, { minConfidence, onProgress });
    if (ext === 'pdf' && !_hasPdfContentSignals(workerResult, pdfplumberTables)) {
        throw new Error('Invalid PDF structure.');
    }
    // Step 3: Process tables through staging pipeline
    // Priority: pdfplumber tables > Worker accepted tables > fallback quarantined
    if (onProgress)
        onProgress(75, 'Resolving parameters...');
    const ingestStartTs = Date.now();
    let budgetMode = 'normal';
    let budgetReason = '';
    const budgetWarnings: any[] = [];
    let processedTablesCount = 0;
    let fallbackUsed = false;
    let fallbackProcessedTables = 0;
    /** @type {any[]} */
    const allReadings = [];
    const tables = pdfplumberTables || /** @type {any} */ workerResult.tables || [];
    const totalTables = tables.length;
    let tableCap = totalTables;
    if (totalTables > TABLE_HARD_LIMIT) {
        tableCap = TABLE_HARD_LIMIT;
        budgetMode = 'degraded';
        budgetReason = `table-cap-hard:${TABLE_HARD_LIMIT}`;
        budgetWarnings.push(`Table volume capped at ${TABLE_HARD_LIMIT}/${totalTables}`);
        if (onProgress)
            onProgress(76, `Large document detected: limiting to ${TABLE_HARD_LIMIT} tables for stability...`);
    }
    else if (totalTables > TABLE_SOFT_LIMIT) {
        tableCap = TABLE_SOFT_LIMIT;
        budgetMode = 'degraded';
        budgetReason = `table-cap-soft:${TABLE_SOFT_LIMIT}`;
        budgetWarnings.push(`Table volume capped at ${TABLE_SOFT_LIMIT}/${totalTables}`);
        if (onProgress)
            onProgress(76, `High table volume: processing first ${TABLE_SOFT_LIMIT} tables...`);
    }
    for (let i = 0; i < tableCap; i++) {
        const elapsed = Date.now() - ingestStartTs;
        if (elapsed > INGEST_HARD_BUDGET_MS) {
            budgetMode = 'hard-stop';
            budgetReason = `timeout-hard:${INGEST_HARD_BUDGET_MS}`;
            budgetWarnings.push(`Hard timeout reached after ${elapsed}ms`);
            if (onProgress)
                onProgress(93, 'Hard timeout reached: stopping table processing early.');
            break;
        }
        if (elapsed > INGEST_SOFT_BUDGET_MS && i >= Math.max(50, Math.floor(tableCap * 0.6))) {
            if (budgetMode === 'normal')
                budgetMode = 'degraded';
            if (!budgetReason)
                budgetReason = `timeout-soft:${INGEST_SOFT_BUDGET_MS}`;
            budgetWarnings.push(`Soft timeout reached after ${elapsed}ms`);
            if (onProgress)
                onProgress(90, 'Soft timeout reached: entering summarized processing mode.');
            break;
        }
        const t = tables[i];
        if (onProgress)
            onProgress(75 + Math.round((i / Math.max(tableCap, 1)) * 20), `Processing table ${i + 1}/${tableCap}...`);
        const readings = await _processTable({
            table: t.table,
            confidence: t.confidence,
            page: t.page,
            tableIndex: i,
        });
        processedTablesCount += 1;
        // F5b: Also filter accepted tables with 100% RED (no analytical match)
        if (readings.length > 0 && !readings.every((r: any) => r.confidence === 'red')) {
            allReadings.push(...readings);
        }
    }
    // F5: Fallback - if no accepted table, reprocess best quarantined as YELLOW
    const quarantinedTables = /** @type {any} */ workerResult.quarantined || [];
    const allowFallback = budgetMode !== 'hard-stop' && Date.now() - ingestStartTs < INGEST_SOFT_BUDGET_MS;
    if (allReadings.length === 0 && quarantinedTables.length > 0 && allowFallback) {
        fallbackUsed = true;
        const sorted = [...quarantinedTables].sort((a: any, b: any) => b.confidence - a.confidence);
        const fallback = sorted.filter((t: any) => t.confidence >= 0.2).slice(0, 10);
        for (let i = 0; i < fallback.length; i++) {
            const elapsed = Date.now() - ingestStartTs;
            if (elapsed > INGEST_HARD_BUDGET_MS) {
                budgetMode = 'hard-stop';
                budgetReason = `timeout-hard:${INGEST_HARD_BUDGET_MS}`;
                budgetWarnings.push(`Hard timeout reached during fallback after ${elapsed}ms`);
                if (onProgress)
                    onProgress(94, 'Hard timeout reached during fallback: stopping.');
                break;
            }
            const t = fallback[i];
            if (onProgress)
                onProgress(80 + Math.round((i / fallback.length) * 15), `Fallback: table ${i + 1}/${fallback.length} (conf ${t.confidence})...`);
            const readings = await _processTable({
                table: t.table,
                confidence: t.confidence,
                page: t.page,
                tableIndex: tableCap + i,
                _fallback: true,
            });
            fallbackProcessedTables += 1;
            // F5: discard fallback table if 100% RED (no value added)
            if (readings.length > 0 && !readings.every((r: any) => r.confidence === 'red')) {
                allReadings.push(...readings);
            }
        }
    }
    else if (allReadings.length === 0 && quarantinedTables.length > 0 && !allowFallback) {
        budgetWarnings.push('Fallback skipped due to ingestion budget mode');
        if (onProgress)
            onProgress(92, 'Skipping fallback due to budget mode.');
    }
    // Step 4: Classify and summarize
    if (onProgress)
        onProgress(95, 'Classifying results...');
    const summary = _getStagingSummary(allReadings);
    const _wr = /** @type {any} */ (workerResult);
    const images = _wr.images || [];
    if (onProgress)
        onProgress(100, 'Complete');
    return {
        fileName,
        fileType: ext,
        readings: allReadings,
        images,
        summary,
        quarantinedTables: _wr.quarantined || [],
        rawText: _wr.rawText || '',
        textItems: _wr.textItems || null,
        htmlContent: _wr.htmlContent || null,
        pageCount: _wr.pageCount || _wr.stats?.pageCount || 0,
        isScanned: _wr.isScanned || false,
        stats: {
            ...(_wr.stats || {}),
            imageCount: images.length,
            budgetMode,
            budgetReason,
            budgetWarnings,
            tableCap,
            totalTables,
            processedTables: processedTablesCount,
            fallbackUsed,
            fallbackProcessedTables,
            extractorPrimary: pdfplumberTables ? 'pdfplumber' : 'worker',
            pdfplumber: {
                attempted: ext === 'pdf',
                used: !!pdfplumberTables,
                cache: /** @type {any} */ (pdfplumberMeta)?.cache || null,
                durationMs: Number.isFinite(/** @type {any} */ (pdfplumberMeta)?.duration_ms) ? /** @type {any} */ (pdfplumberMeta).duration_ms : null,
                tablesFound: Array.isArray(pdfplumberTables) ? pdfplumberTables.length : 0,
            },
        },
        _bufferCopy: bufferCopy,
    };
}
// ---------------------------------------------------------------------------
// P1: pdfplumber Bridge (Python subprocess - dev/api-server only)
// ---------------------------------------------------------------------------
const PDFPLUMBER_TIMEOUT_MS = 30000;
const INGEST_SOFT_BUDGET_MS = 60000;
const INGEST_HARD_BUDGET_MS = 180000;
const TABLE_SOFT_LIMIT = 220;
const TABLE_HARD_LIMIT = 420;
/** @param {any} workerResult @param {any} pdfplumberTables */
function _hasPdfContentSignals(workerResult: any, pdfplumberTables: any) {
    if (Array.isArray(pdfplumberTables) && pdfplumberTables.length > 0)
        return true;
    const result = /** @type {any} */ (workerResult || {});
    const pageCount = result.pageCount || result.stats?.pageCount || 0;
    const signalCounts = [
        Array.isArray(result.tables) ? result.tables.length : 0,
        Array.isArray(result.quarantined) ? result.quarantined.length : 0,
        Array.isArray(result.images) ? result.images.length : 0,
        Array.isArray(result.textItems) ? result.textItems.length : 0,
    ];
    if (signalCounts.some((c: any) => c > 0))
        return true;
    if (pageCount > 0)
        return true;
    if (String(result.rawText || '').trim().length > 0)
        return true;
    return false;
}
/** @param {any} buffer */
function _isPlausiblePdfBuffer(buffer: any) {
    if (!(buffer instanceof ArrayBuffer))
        return false;
    if (buffer.byteLength < 80)
        return false;
    const head = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
    const signature = String.fromCharCode(...head);
    return signature.startsWith('%PDF-');
}
/**
 * Attempts PDF table extraction via pdfplumber Python script.
 * Sends file to api-server /api/pdfplumber endpoint which runs Python subprocess.
 * Falls back to null if api-server not available or Python not installed.
 *
 * @param {ArrayBuffer} buffer - PDF file contents
 * @param {string} fileName - File name
 * @param {function} [onProgress] - Progress callback
 * @returns {Promise<{tables:any[],meta:any}|null>} Parsed tables + metadata or null
 */
async function _tryPdfplumber(buffer: any, fileName: any, onProgress: any) {
    // ECBYTS-OPEN-LOCAL-001 F1: em Modo Convidado o proxy /api/pdfplumber não
    // existe — skip SILENCIOSO (sem toast) porque o caller degrada para o
    // parser JS local; a feature continua funcionando, só sem o extrator rico.
    if (!guardBackendFetch('ingestion:pdfplumber', 'boot')) return null;
    try {
        if (onProgress)
            onProgress(10, 'Extracting tables (pdfplumber)...');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), PDFPLUMBER_TIMEOUT_MS);
        // Use bufferCopy for pdfplumber to avoid detaching the original buffer
        // (Worker needs the original buffer for postMessage transfer)
        const pdfCopy = buffer.slice(0);
        const response = await fetch('/api/pdfplumber', {
            method: 'POST',
            headers: { 'Content-Type': 'application/pdf' },
            body: new Uint8Array(pdfCopy),
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
            const errText = await response.text().catch(degradeWith('ingestion:pdfplumber:errBody', 'network', ''));
            console.info('[ingestion] pdfplumber HTTP', response.status, errText.substring(0, 100));
            return null;
        }
        const parsed = await response.json();
        if (!parsed.success || !parsed.data?.tables?.length) {
            console.info('[ingestion] pdfplumber: no tables or error:', parsed.error || 'empty');
            return null;
        }
        const cacheStatus = parsed.data?.meta?.cache || 'miss';
        if (onProgress) {
            onProgress(12, cacheStatus === 'hit'
                ? 'Extracting tables (pdfplumber cache hit)...'
                : 'Extracting tables (pdfplumber cache miss)...');
        }
        console.info(`[ingestion] pdfplumber (${cacheStatus}): ${parsed.data.tables.length} tables in ${parsed.data.meta?.duration_ms}ms`);
        return {
            tables: parsed.data.tables.map((t: any) => ({
                table: t.data,
                confidence: 0.85,
                page: t.page
            })),
            meta: parsed.data.meta || {},
        };
    }
    catch (e: any) {
        const _e: any = e;
        console.info('[ingestion] pdfplumber not available:', _e.name, _e.message?.substring(0, 80));
        return null;
    }
}
// ---------------------------------------------------------------------------
// Worker Communication
// ---------------------------------------------------------------------------
/**
 * Runs the document extraction Web Worker.
 *
 * @param {ArrayBuffer} buffer - File contents
 * @param {string} fileName - File name
 * @param {Object} options
 * @returns {Promise<Object>} Worker result
 */
/** @param {any} buffer @param {any} fileName @param {any} [options] */
function runWorker(buffer: any, fileName: any, options: any = {}) {
    return new Promise((resolve, reject) => {
        /** @type {any} */
        let worker;
        const _opts = /** @type {any} */ (options);
        try {
            // Create worker from the documentWorker.js file
            const workerUrl = new URL('./documentWorker.js', import.meta.url);
            worker = new Worker(workerUrl);
        }
        catch (e: any) {
            // Fallback: inline worker with blob URL
            reject(new Error(`Failed to create Web Worker: ${e.message}. Document extraction requires Web Worker support.`));
            return;
        }
        const timeout = setTimeout(() => {
            worker.terminate();
            reject(new Error('Document extraction timed out (60s)'));
        }, 60000);
        worker.onmessage = (e: any) => {
            const msg = e.data;
            if (msg.type === 'progress' && _opts.onProgress) {
                // Scale worker progress (0-100) to our range (5-75)
                const scaled = 5 + Math.round(msg.percent * 0.7);
                _opts.onProgress(scaled, msg.message);
            }
            else if (msg.type === 'result') {
                clearTimeout(timeout);
                worker.terminate();
                resolve(msg.data);
            }
            else if (msg.type === 'error') {
                clearTimeout(timeout);
                worker.terminate();
                reject(new Error(msg.message));
            }
        };
        worker.onerror = (e: any) => {
            clearTimeout(timeout);
            worker.terminate();
            reject(new Error(`Worker error: ${e.message}`));
        };
        // Send file to worker (transfer ArrayBuffer for zero-copy)
        worker.postMessage({ type: 'extract', file: buffer, fileName, options: { minConfidence: _opts.minConfidence } }, [buffer]);
    });
}
//# sourceMappingURL=index.js.map
