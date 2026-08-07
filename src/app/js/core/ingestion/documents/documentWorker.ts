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
 * documentWorker.js - Web Worker for PDF/DOCX extraction
 * ADR-022: Neuro-Symbolic Document Ingestion - Layer 1 (Raw Extraction)
 *
 * Roda dentro de um Web Worker para nao bloquear o Event Loop da UI.
 * Orquestra: lazy-load de libs → extracao → clustering → anchoring → staging.
 *
 * Comunicacao via postMessage:
 * - Main → Worker: { type: 'extract', file: ArrayBuffer, fileName: string, options: {} }
 * - Worker → Main: { type: 'progress', percent: number, message: string }
 * - Worker → Main: { type: 'result', data: { tables: [], readings: [], quarantined: [] } }
 * - Worker → Main: { type: 'error', message: string }
 *
 * NOTA: Este arquivo eh importado como Worker URL, nao como ES module.
 * Dependencias internas sao importadas via importScripts() nao disponivel com ES modules no Worker.
 * Em vez disso, as funcoes de spatialCluster, paramAliases e regexAnchors sao passadas
 * como mensagem de inicializacao ou re-implementadas inline conforme necessario.
 *
 * @module core/ingestion/documents/documentWorker
 */

interface WorkerTextItem {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    page: number;
    transform?: number[];
    str?: string;
}
interface WorkerColumn {
    xMin: number;
    xMax: number;
}
type WorkerRow = WorkerTextItem[];
interface WorkerTableCandidate {
    table: string[][];
    confidence: number;
    page?: number;
    rows?: number;
    cols?: number;
}
interface WorkerImage {
    imageData: ArrayBuffer;
    page: number;
    width: number;
    height: number;
    index?: number;
    contentType?: string;
}
interface PdfJsModule {
    getDocument: (source: any) => { promise: Promise<any> };
    GlobalWorkerOptions?: { workerSrc?: string };
    OPS?: Record<string, any>;
}
interface MammothModule {
    convertToHtml: (
        input: any,
        options?: any,
    ) => Promise<{ value: string; messages?: Array<{ type: string; message: string }> }>;
    images: { imgElement: (handler: (image: any) => Promise<{ src: string }>) => any };
}
// Worker global aliased as `any` to bypass DOM-vs-Worker lib typing divergence
// (runtime identical: `self` is the WorkerGlobalScope at execution time).
/** @type {any} */
const _self = self as any;

// ---------------------------------------------------------------------------
// CDN URLs for lazy-loaded libraries
// ---------------------------------------------------------------------------
const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const MAMMOTH_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';

/**
 * @typedef {object} WorkerTextItem
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {string} text
 * @property {number} page
 * @property {number[]} [transform]
 * @property {string} [str]
 *
 * @typedef {object} WorkerColumn
 * @property {number} xMin
 * @property {number} xMax
 *
 * @typedef {WorkerTextItem[]} WorkerRow
 *
 * @typedef {object} WorkerTableCandidate
 * @property {string[][]} table
 * @property {number} confidence
 * @property {number} [page]
 * @property {number} [rows]
 * @property {number} [cols]
 *
 * @typedef {object} WorkerImage
 * @property {ArrayBuffer} imageData
 * @property {number} page
 * @property {number} width
 * @property {number} height
 * @property {number} [index]
 * @property {string} [contentType]
 *
 * @typedef {object} PdfJsModule
 * @property {(source: any) => { promise: Promise<any> }} getDocument
 * @property {{ workerSrc?: string }} [GlobalWorkerOptions]
 * @property {Record<string, any>} [OPS]
 *
 * @typedef {object} MammothModule
 * @property {(input: any, options?: any) => Promise<{ value: string, messages?: Array<{ type: string, message: string }> }>} convertToHtml
 * @property {{ imgElement: (handler: (image: any) => Promise<{ src: string }>) => any }} images
 *
 * @typedef {object} WorkerResultPayload
 * @property {WorkerImage[]} [images]
 * @property {WorkerImage[] | null} [pageImages]
 * @property {string} [fileName]
 * @property {string} [fileType]
 * @property {WorkerTableCandidate[]} [tables]
 * @property {WorkerTableCandidate[]} [quarantined]
 * @property {boolean} [isScanned]
 * @property {string} [rawText]
 * @property {WorkerTextItem[] | null} [textItems]
 * @property {number} [pageCount]
 * @property {string | null} [htmlContent]
 * @property {number} [totalTables]
 * @property {Record<string, any>} [stats]
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
/** @type {PdfJsModule | null} */
let documentWorkerPdfjsLib: PdfJsModule | null = null;
/** @type {MammothModule | null} */
let documentWorkerMammoth: MammothModule | null = null;

// ---------------------------------------------------------------------------
// Progress Helper
// ---------------------------------------------------------------------------

/**
 * Sends a progress update to the main thread
 * @param {number} percent - 0-100
 * @param {string} message - Human-readable status
 * @returns {void}
 */
function sendProgress(percent: number, message: string) {
    _self.postMessage({ type: 'progress', percent, message });
}

/**
 * Sends an error to the main thread
 * @param {string} message
 * @returns {void}
 */
function sendError(message: string) {
    _self.postMessage({ type: 'error', message });
}

/**
 * Sends the final result to the main thread
 * @param {object} ms
 * @returns {void}
 */
// eslint-disable-next-line
function _sendResult(data: object) {
    _self.postMessage({ type: 'result', data });
}

// ---------------------------------------------------------------------------
// Library Loading
// ---------------------------------------------------------------------------

/**
 * Dynamic import with timeout (inline - Worker nao pode importar cdnLoader.js).
 * @param {string} ms
 * @param {number} [ms]
 * @returns {Promise<any>}
 */
function importWithTimeout(url: string, ms = 15000): Promise<any> {
    return Promise.race([
        import(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`CDN timeout (${ms}ms): ${url}`)), ms)),
    ]);
}

/**
 * Lazy-loads pdfjs-dist from CDN
 * @returns {Promise<PdfJsModule>}
 */
async function loadPdfJs(): Promise<PdfJsModule> {
    if (documentWorkerPdfjsLib) return documentWorkerPdfjsLib;

    sendProgress(5, 'Loading PDF parser...');
    try {
        /** @type {PdfJsModule} */
        const module = (await importWithTimeout(PDFJS_CDN)) as PdfJsModule;
        documentWorkerPdfjsLib = module;
        if (module.GlobalWorkerOptions) {
            module.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
        }
        return module;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to load PDF.js: ${message}`, { cause: e });
    }
}

/**
 * Lazy-loads mammoth.js from CDN.
 * mammoth.browser.min.js exposes a global `mammoth` in non-module contexts.
 * In a Worker, we use importScripts.
 * @returns {Promise<MammothModule>}
 */
async function loadMammoth(): Promise<MammothModule> {
    if (documentWorkerMammoth) return documentWorkerMammoth;

    sendProgress(5, 'Loading DOCX parser...');
    try {
        _self.importScripts(MAMMOTH_CDN);
        documentWorkerMammoth = _self.mammoth as MammothModule | null;
        if (!documentWorkerMammoth) throw new Error('mammoth global not found after importScripts');
        return documentWorkerMammoth;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to load Mammoth.js: ${message}`, { cause: e });
    }
}

// ---------------------------------------------------------------------------
// PDF Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts text items with bounding boxes from a PDF ArrayBuffer.
 *
 * @param {ArrayBuffer} buffer - PDF file contents
 * @returns {Promise<{ items: WorkerTextItem[], pageCount: number }>}
 */
async function extractPdfItems(buffer: ArrayBuffer): Promise<{ items: WorkerTextItem[]; pageCount: number }> {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: buffer }).promise;
    const totalPages = pdf.numPages;
    const allItems: WorkerTextItem[] = [];

    for (let p = 1; p <= totalPages; p++) {
        sendProgress(10 + Math.round((p / totalPages) * 40), `Extracting page ${p}/${totalPages}...`);

        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });

        for (const item of textContent.items as Array<any>) {
            if (!item.str || !item.str.trim()) continue;

            // Transform coordinates to top-down (PDF native is bottom-up)
            const tx = item.transform;
            const x = tx[4];
            const y = viewport.height - tx[5]; // Flip Y axis
            const width = item.width || 0;
            const height = item.height || Math.abs(tx[3]) || 12;

            allItems.push({
                x: Math.round(x * 100) / 100,
                y: Math.round(y * 100) / 100,
                width: Math.round(width * 100) / 100,
                height: Math.round(height * 100) / 100,
                text: item.str.trim(),
                page: p,
            });
        }

        page.cleanup();
    }

    return { items: allItems, pageCount: totalPages };
}

// ---------------------------------------------------------------------------
// PDF Image Extraction
// ---------------------------------------------------------------------------

/** Max images to extract from a single PDF */
const MAX_PDF_IMAGES = 20;

/** Min image dimension (px) — ignora icones e decoracoes */
const MIN_IMAGE_DIM = 50;

/**
 * Extracts embedded images from a PDF page using getOperatorList().
 * v0.2: Output as ArrayBuffer (not base64) for zero-copy Transferable.
 *       Canvas explicitly released after extraction (SP-38).
 *
 * @param {any} page - pdfjs page object
 * @param {number} pageNum - page number (1-based)
 * @param {PdfJsModule} lib - pdfjs-dist module (for OPS constants)
 * @returns {Promise<WorkerImage[]>}
 */
async function extractPdfPageImages(page: any, pageNum: number, lib: PdfJsModule): Promise<WorkerImage[]> {
    const images: WorkerImage[] = [];
    try {
        const ops = await page.getOperatorList();
        const OPS = lib.OPS || {};
        let imgIndex = 0;

        for (let i = 0; i < ops.fnArray.length; i++) {
            if (images.length >= MAX_PDF_IMAGES) break;

            if (ops.fnArray[i] === OPS.paintImageXObject) {
                const imgName = ops.argsArray[i][0];
                try {
                    const imgData: any = await new Promise((resolve, reject) => {
                        /** @type {(data: any) => void} */
                        const handleImageData = (data: any) => {
                            if (data) resolve(data);
                            else reject(new Error('No image data'));
                        };
                        page.objs.get(imgName, handleImageData);
                    });

                    const w = imgData.width || 0;
                    const h = imgData.height || 0;
                    if (w < MIN_IMAGE_DIM || h < MIN_IMAGE_DIM) continue;

                    const canvas = new OffscreenCanvas(w, h);
                    const ctx: any = canvas.getContext('2d');
                    if (!ctx) continue;

                    if (imgData instanceof ImageBitmap) {
                        ctx.drawImage(imgData, 0, 0);
                    } else if (imgData.data) {
                        const idata = new ImageData(new Uint8ClampedArray(imgData.data), w, h);
                        ctx.putImageData(idata, 0, 0);
                    } else {
                        continue;
                    }

                    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
                    const arrayBuffer = await blob.arrayBuffer();

                    // SP-38: Release OffscreenCanvas backing store (~w*h*4 bytes)
                    canvas.width = 1;
                    canvas.height = 1;

                    images.push({
                        imageData: arrayBuffer,
                        page: pageNum,
                        width: w,
                        height: h,
                        index: imgIndex++,
                    });
                } catch (e) {
                    console.debug('[docWorker] pdf-image-extract:', e instanceof Error ? e.message : e);
                    // Imagem individual falhou - continua com as proximas
                }
            }
        }
    } catch (e) {
        console.debug('[docWorker] pdf-operator-list:', e instanceof Error ? e.message : e);
        // getOperatorList nao suportado ou falhou - retorna vazio
    }
    return images;
}

/**
 * Extracts all images from a PDF document.
 *
 * @param {ArrayBuffer} buffer - PDF file contents
 * @returns {Promise<WorkerImage[]>}
 */
async function extractPdfImages(buffer: ArrayBuffer): Promise<WorkerImage[]> {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: buffer }).promise;
    const totalPages = pdf.numPages;
    const allImages: WorkerImage[] = [];

    // Bug HIGH fix: PDFs grandes (114+ pgs) levavam ~26 min de extração.
    // Heurística "head + tail" — capa+sumário+intro têm metadados, apêndice
    // tem tabelas/figuras importantes; pula o miolo narrativo.
    const { selectPagesToProcess, summarizeSelection } = await import('./_pdfPageSelectionPure.js');
    const selection = selectPagesToProcess(totalPages);
    if (selection.strategy !== 'all') {
        console.info('[documentWorker] PDF grande:', summarizeSelection(selection, totalPages));
    }
    const pagesToVisit = selection.pageNumbers;
    const total = pagesToVisit.length;

    for (let i = 0; i < pagesToVisit.length; i++) {
        if (allImages.length >= MAX_PDF_IMAGES) break;
        const p = pagesToVisit[i]!;
        sendProgress(52 + Math.round(((i + 1) / total) * 8), `Extracting images page ${p}/${totalPages}...`);

        const page = await pdf.getPage(p);
        const pageImages = await extractPdfPageImages(page, p, lib);
        allImages.push(...pageImages);
        page.cleanup();
    }

    return allImages.slice(0, MAX_PDF_IMAGES);
}

// ---------------------------------------------------------------------------
// DOCX Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts HTML and embedded images from a DOCX ArrayBuffer using mammoth.js.
 * Images are captured via mammoth's convertImage handler and returned as base64 data URLs.
 *
 * @param {ArrayBuffer} buffer - DOCX file contents
 * @returns {Promise<{ html: string, images: Array<{ dataUrl: string, contentType: string, index: number }> }>}
 */
async function extractDocxWithImages(
    buffer: ArrayBuffer,
): Promise<{ html: string; images: Array<{ dataUrl: string; contentType: string; index: number }> }> {
    const lib = await loadMammoth();
    /** @type {Array<{ dataUrl: string, contentType: string, index: number }>} */
    const images: Array<{ dataUrl: string; contentType: string; index: number }> = [];
    let imgIndex = 0;

    sendProgress(20, 'Converting DOCX to HTML + extracting images...');

    // NOTE: convertImage must be in the 2nd argument (options), NOT in the 1st (input).
    // mammoth.convertToHtml(input, options) - mixing them silently ignores convertImage.
    const imageHandler = lib.images.imgElement(function (image: any) {
        /**
         * @param {string} base64
         * @returns {{ src: string }}
         */
        const toImageElement = function (base64: string) {
            const ct = image.contentType || 'image/png';
            const dataUrl = 'data:' + ct + ';base64,' + base64;

            // Filtrar imagens muito pequenas (icones WMF, etc.)
            // Heuristica: base64 < 2KB provavelmente e icone/decoracao
            if (base64.length > 2048) {
                images.push({
                    dataUrl,
                    contentType: ct,
                    index: imgIndex++,
                });
            }

            return { src: dataUrl };
        };
        return image.read('base64').then(toImageElement);
    });

    const result = await lib.convertToHtml({ arrayBuffer: buffer }, { convertImage: imageHandler });

    if (result.messages && result.messages.length > 0) {
        const warnings = result.messages.filter((m) => m.type === 'warning').map((m) => m.message);
        if (warnings.length > 0) {
            console.warn('[documentWorker] DOCX warnings:', warnings);
        }
    }

    return {
        html: result.value,
        images: images.slice(0, MAX_PDF_IMAGES),
    };
}

// ---------------------------------------------------------------------------
// Inline Clustering (reimplemented for Worker context)
// ---------------------------------------------------------------------------
// Worker nao pode importar ES modules do projeto diretamente.
// Funcoes de spatialCluster sao reimplementadas aqui de forma simplificada.
// A versao completa vive em spatialCluster.js para uso no main thread.

/**
 * @see spatialCluster.js for full documentation
 * @param {WorkerTextItem[]} items
 * @returns {number}
 */
function clusterMeanLineSpacing(items: WorkerTextItem[]): number {
    if (items.length < 2) return 12;
    const sorted = [...items].sort((a, b) => a.y - b.y);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
        const gap = Math.abs(sorted[i]!.y - sorted[i - 1]!.y);
        if (gap > 0.5) gaps.push(gap);
    }
    if (gaps.length === 0) return 12;
    gaps.sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    return gaps.length % 2 === 0 ? (gaps[mid - 1]! + gaps[mid]!) / 2 : gaps[mid]!;
}

/**
 * @param {WorkerTextItem[]} items
 * @param {number} threshold
 * @returns {WorkerRow[]}
 */
function clusterGroupRows(items: WorkerTextItem[], threshold: number): WorkerRow[] {
    if (!items.length) return [];
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: WorkerRow[] = [];
    let row = [sorted[0]!],
        curY = sorted[0]!.y;
    for (let i = 1; i < sorted.length; i++) {
        if (Math.abs(sorted[i]!.y - curY) <= threshold) {
            row.push(sorted[i]!);
        } else {
            row.sort((a, b) => a.x - b.x);
            rows.push(row);
            row = [sorted[i]!];
            curY = sorted[i]!.y;
        }
    }
    if (row.length) {
        row.sort((a, b) => a.x - b.x);
        rows.push(row);
    }
    return rows;
}

/**
 * @param {WorkerRow[]} rows
 * @returns {WorkerColumn[]}
 */
function clusterDetectColumns(rows: WorkerRow[]): WorkerColumn[] {
    const xs: number[] = [];
    let avgW = 0,
        wc = 0;
    for (const r of rows)
        for (const it of r) {
            xs.push(it.x);
            if (it.width > 0 && it.text) {
                avgW += it.width / Math.max(it.text.length, 1);
                wc++;
            }
        }
    if (!xs.length) return [];
    avgW = wc > 0 ? avgW / wc : 5;
    xs.sort((a, b) => a - b);
    const th = avgW * 2,
        cols: WorkerColumn[] = [];
    let s = xs[0]!,
        e = xs[0]!;
    for (let i = 1; i < xs.length; i++) {
        if (xs[i]! - e > th) {
            cols.push({ xMin: s, xMax: e });
            s = xs[i]!;
        }
        e = xs[i]!;
    }
    cols.push({ xMin: s, xMax: e });
    return cols;
}

/**
 * @param {WorkerTextItem[]} rowItems
 * @param {WorkerColumn[]} columns
 * @returns {string[]}
 */
function clusterAlignToColumns(rowItems: WorkerTextItem[], columns: WorkerColumn[]): string[] {
    const cells = new Array(columns.length).fill('');
    for (const it of rowItems) {
        let best = 0,
            bestD = Infinity;
        for (let c = 0; c < columns.length; c++) {
            const d = Math.abs(it.x - (columns[c]!.xMin + columns[c]!.xMax) / 2);
            if (d < bestD) {
                bestD = d;
                best = c;
            }
        }
        cells[best] = cells[best] ? cells[best] + ' ' + it.text : it.text;
    }
    return cells;
}

/**
 * @param {string[][]} table
 * @param {WorkerRow[]} rows
 * @param {WorkerColumn[]} columns
 * @returns {number}
 */
function clusterConfidence(table: string[][], rows: WorkerRow[], columns: WorkerColumn[]): number {
    if (!table || table.length < 2 || columns.length < 2) return 0;
    const nC = columns.length,
        nR = table.length;
    let consistent = 0;
    for (const r of table) {
        if (r.filter((c) => c.trim()).length >= nC * 0.5) consistent++;
    }
    let filled = 0;
    for (const r of table)
        for (const c of r) {
            if (c.trim()) filled++;
        }
    const cs = consistent / nR;
    const fs = filled / (nR * nC);
    const rs = Math.min(nR / 5, 1); // F4: tabelas de 5+ rows ja pontuam maximo (era /10)

    // F4: bonus se header row detectado (preenchida, sem numeros)
    const firstRow = table[0]!;
    const headerFill = firstRow.filter((c) => c.trim()).length / nC;
    const hasNumbers = firstRow.some((c) => /\d/.test(c));
    const hb = headerFill >= 0.8 && !hasNumbers ? 0.05 : 0;

    return Math.round((cs * 0.35 + fs * 0.25 + rs * 0.15 + 0.25 + hb) * 100) / 100;
}

/**
 * F1: Separa text items de uma pagina em regioes verticais.
 * Usa 2 heuristicas:
 * 1. Gap vertical grande (> 2.5x meanSpacing)
 * 2. Transicao de padrao X: texto corrido (1 coluna, X~margem) vs tabela (multiplas colunas)
 * @param {WorkerTextItem[]} pageItems
 * @returns {WorkerTextItem[][]}
 */
function splitIntoRegions(pageItems: WorkerTextItem[]): WorkerTextItem[][] {
    if (pageItems.length < 4) return [pageItems];
    const sorted = [...pageItems].sort((a, b) => a.y - b.y);
    const ms = clusterMeanLineSpacing(sorted);
    const gapThreshold = ms * 2.5;

    // Group items into lines by Y proximity
    const lines: Array<{ items: WorkerTextItem[]; y: number; xCount: number }> = [];
    let line = [sorted[0]!];
    let lineY = sorted[0]!.y;
    for (let i = 1; i < sorted.length; i++) {
        if (Math.abs(sorted[i]!.y - lineY) <= ms * 0.3) {
            line.push(sorted[i]!);
        } else {
            lines.push({ items: line, y: lineY, xCount: new Set(line.map((it) => Math.round(it.x / 20))).size });
            line = [sorted[i]!];
            lineY = sorted[i]!.y;
        }
    }
    if (line.length)
        lines.push({ items: line, y: lineY, xCount: new Set(line.map((it) => Math.round(it.x / 20))).size });

    // Split by gap OR by X-pattern transition (prose→table or table→prose)
    const regions: WorkerTextItem[][] = [];
    let region = [...lines[0]!.items];
    let prevXCount = lines[0]!.xCount;

    for (let i = 1; i < lines.length; i++) {
        const gap = Math.abs(lines[i]!.y - lines[i - 1]!.y);
        const xCount = lines[i]!.xCount;

        // Transition: single-column (1-2 X positions) → multi-column (3+), or vice-versa
        const xTransition = (prevXCount <= 2 && xCount >= 3) || (prevXCount >= 3 && xCount <= 1);

        if (gap > gapThreshold || xTransition) {
            if (region.length >= 2) regions.push(region);
            region = [];
        }
        region.push(...lines[i]!.items);
        prevXCount = xCount;
    }
    if (region.length >= 2) regions.push(region);

    return regions.length > 0 ? regions : [pageItems];
}

/**
 * F2: Detecta se uma grade reconstruida eh texto corrido (prosa), nao tabela.
 * Prosa tipicamente ocupa 1 coluna; tabelas preenchem multiplas colunas.
 * @param {string[][]} table
 * @param {number} numCols
 * @returns {boolean}
 */
function isProseRegion(table: string[][], numCols: number): boolean {
    if (numCols < 2 || table.length < 2) return true;
    let singleColRows = 0;
    for (const row of table) {
        const filled = row.filter((c) => c.trim()).length;
        if (filled <= 1) singleColRows++;
    }
    return singleColRows / table.length > 0.7;
}

/**
 * @param {WorkerTextItem[]} items
 * @returns {WorkerTableCandidate[]}
 */
function reconstructTablesInWorker(items: WorkerTextItem[]): WorkerTableCandidate[] {
    if (!items || items.length < 4) return [];
    const pageMap = new Map<number, WorkerTextItem[]>();
    for (const it of items) {
        const p = it.page || 1;
        if (!pageMap.has(p)) pageMap.set(p, []);
        pageMap.get(p)!.push(it);
    }
    const results: WorkerTableCandidate[] = [];
    for (const [page, pageItems] of pageMap) {
        // F3: segmentar pagina em regioes antes de clustering
        const regions = splitIntoRegions(pageItems);

        for (const region of regions) {
            if (region.length < 4) continue;
            const ms = clusterMeanLineSpacing(region);
            const rows = clusterGroupRows(region, ms * 0.3);
            if (rows.length < 2) continue;
            const cols = clusterDetectColumns(rows);
            if (cols.length < 2) continue;
            const table = rows.map((r) => clusterAlignToColumns(r, cols));

            // F2: descartar regioes de texto corrido
            if (isProseRegion(table, cols.length)) continue;

            const conf = clusterConfidence(table, rows, cols);
            results.push({ table, confidence: conf, page, rows: rows.length, cols: cols.length });
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// Inline DOCX HTML table parser
// ---------------------------------------------------------------------------

/**
 * @param {string} _match
 * @param {string | undefined} hex?
 * @param {string | undefined} dec?
 * @returns {string}
 */
function decodeNumericEntity(_match: string, hex?: string, dec?: string): string {
    return String.fromCharCode(hex ? parseInt(hex, 16) : parseInt(dec || '0', 10));
}

/**
 * @param {string} html
 * @returns {WorkerTableCandidate[]}
 */
function parseDocxTablesInWorker(html: string): WorkerTableCandidate[] {
    if (!html) return [];
    const tables: WorkerTableCandidate[] = [];
    const tblRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tm;
    while ((tm = tblRe.exec(html)) !== null) {
        const rows: string[][] = [];
        const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let tr;
        while ((tr = trRe.exec(tm[1]!)) !== null) {
            const cells: string[] = [];
            const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
            let td;
            while ((td = tdRe.exec(tr[1]!)) !== null) {
                cells.push(
                    td[1]!
                        .replace(/<[^>]+>/g, '')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&#(?:x([0-9a-fA-F]+)|(\d+));/g, decodeNumericEntity)
                        .trim(),
                );
            }
            if (cells.length) rows.push(cells);
        }
        if (rows.length >= 2) {
            const mc = Math.max(...rows.map((r) => r.length));
            const norm = rows.map((r) => {
                while (r.length < mc) r.push('');
                return r;
            });
            const filled = norm.flat().filter((c) => c !== '').length;
            const conf = Math.min(0.7 + (filled / (norm.length * mc)) * 0.3, 1.0);
            tables.push({ table: norm, confidence: Math.round(conf * 100) / 100 });
        }
    }
    return tables;
}

// ---------------------------------------------------------------------------
// v0.2: Raw Text Assembly (SP-35: adaptive threshold)
// ---------------------------------------------------------------------------

/**
 * Assemble raw text from PDF text items.
 * Uses adaptive line spacing threshold per page (not hardcoded).
 * Pages separated by \f (form feed, U+000C).
 *
 * @param {WorkerTextItem[]} items - Text items with {x, y, text, page}
 * @param {number} totalPages
 * @returns {string}
 */
function assembleRawText(items: WorkerTextItem[], totalPages: number): string {
    /** @type {Map<number, WorkerTextItem[]>} */
    const pageTexts = new Map<number, WorkerTextItem[]>();
    for (const item of items) {
        const p = item.page || 1;
        const bucket = pageTexts.get(p) || [];
        bucket.push(item);
        pageTexts.set(p, bucket);
    }

    const pages: string[] = [];
    for (let p = 1; p <= totalPages; p++) {
        const pageItems = pageTexts.get(p) || [];
        if (pageItems.length === 0) {
            pages.push('');
            continue;
        }

        pageItems.sort((a, b) => a.y - b.y || a.x - b.x);

        // SP-35: Adaptive threshold using existing clusterMeanLineSpacing
        const meanSpacing = clusterMeanLineSpacing(pageItems);
        const lineThreshold = meanSpacing * 0.4;

        const lines: string[] = [];
        /** @type {WorkerTextItem[]} */
        let currentLine: WorkerTextItem[] = [];
        let lastY = -Infinity;

        for (const item of pageItems) {
            if (Math.abs(item.y - lastY) > lineThreshold && currentLine.length > 0) {
                lines.push(
                    currentLine
                        .sort((a, b) => a.x - b.x)
                        .map((i) => i.text)
                        .join(' '),
                );
                currentLine = [];
            }
            currentLine.push(item);
            lastY = item.y;
        }
        if (currentLine.length > 0) {
            lines.push(
                currentLine
                    .sort((a, b) => a.x - b.x)
                    .map((i) => i.text)
                    .join(' '),
            );
        }
        pages.push(lines.join('\n'));
    }
    return pages.join('\f');
}

/**
 * Filter text items to only pages that have images (for caption extraction).
 * Capped at 10K items to limit postMessage transfer size.
 *
 * @param {WorkerTextItem[]} items - All text items
 * @param {WorkerImage[]} images - Extracted images with page numbers
 * @returns {WorkerTextItem[] | null}
 */
function filterItemsForImagePages(items: WorkerTextItem[], images: WorkerImage[]): WorkerTextItem[] | null {
    if (!items || items.length === 0 || !images || images.length === 0) return null;
    const imagePages = new Set(images.map((img) => img.page));
    if (imagePages.size === 0) return null;
    const filtered = items.filter((it) => imagePages.has(it.page));
    return filtered.length > 10000 ? filtered.slice(0, 10000) : filtered;
}

// ---------------------------------------------------------------------------
// v0.2: Scanned PDF Detection + Rendering (SP-28)
// ---------------------------------------------------------------------------

/** DPI for scanned page rendering */
const SCAN_RENDER_DPI = 150;
const SCAN_RENDER_SCALE = SCAN_RENDER_DPI / 72;
const MAX_SCAN_PAGES = 30;

const SCANNED_ITEMS_THRESHOLD = 2;
const SCANNED_CHARS_THRESHOLD = 20;

/**
 * Detect if PDF is scanned (no text layer).
 * Dual check: avg items/page AND avg chars/page must both be below thresholds.
 * Prevents false positives on sparse-but-valid text PDFs (e.g. single table per page).
 *
 * @param {WorkerTextItem[]} items - Text items from extractPdfItems
 * @param {number} pageCount
 * @returns {boolean}
 */
function isScannedPDF(items: WorkerTextItem[], pageCount: number): boolean {
    if (pageCount === 0) return false;
    const avgItems = items.length / pageCount;
    const avgChars = items.reduce((s, i) => s + (i.text?.length || 0), 0) / pageCount;
    return avgItems < SCANNED_ITEMS_THRESHOLD && avgChars < SCANNED_CHARS_THRESHOLD;
}

/**
 * Render PDF pages to JPEG ArrayBuffers for OCR processing.
 * Used when PDF has no text layer (scanned document).
 *
 * @param {ArrayBuffer} buffer - PDF file
 * @returns {Promise<WorkerImage[]>}
 */
async function renderPagesAsImages(buffer: ArrayBuffer): Promise<WorkerImage[]> {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: buffer }).promise;
    const totalPages = pdf.numPages;

    // Aplica mesma seleção head+tail do extractPdfImages — para PDFs grandes
    // em modo "page-as-image" o gargalo é canvas.render() por página.
    const { selectPagesToProcess, summarizeSelection } = await import('./_pdfPageSelectionPure.js');
    const selection = selectPagesToProcess(totalPages, {
        // page-image é mais leve que extract: aceita mais páginas
        fullProcessThreshold: Math.min(MAX_SCAN_PAGES, 30),
        headCount: 15,
        tailCount: 15,
        absoluteCap: MAX_SCAN_PAGES,
    });
    if (selection.strategy !== 'all') {
        console.info('[documentWorker] PDF grande (page-image):', summarizeSelection(selection, totalPages));
    }
    const pagesToVisit = selection.pageNumbers;
    const total = pagesToVisit.length;
    const results: WorkerImage[] = [];

    for (let i = 0; i < pagesToVisit.length; i++) {
        const p = pagesToVisit[i]!;
        sendProgress(10 + Math.round(((i + 1) / total) * 40), `Rendering page ${p}/${totalPages} for OCR...`);

        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: SCAN_RENDER_SCALE });
        const w = Math.round(viewport.width);
        const h = Math.round(viewport.height);

        const canvas = new OffscreenCanvas(w, h);
        const ctx: any = canvas.getContext('2d');
        if (!ctx) continue;

        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
        const arrayBuffer = await blob.arrayBuffer();

        // SP-38: Release canvas backing store
        canvas.width = 1;
        canvas.height = 1;

        results.push({ imageData: arrayBuffer, page: p, width: w, height: h });
        page.cleanup();
    }

    return results;
}

// ---------------------------------------------------------------------------
// v0.2: DOCX text stripping
// ---------------------------------------------------------------------------

/**
 * Strip HTML to raw text (for DOCX rawText extraction).
 * @param {string} html
 * @returns {string}
 */
function stripHtmlToText(html: string): string {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(?:x([0-9a-fA-F]+)|(\d+));/g, decodeNumericEntity)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ---------------------------------------------------------------------------
// v0.2: Transferable-aware sendResult
// ---------------------------------------------------------------------------

/**
 * Send result with Transferable ArrayBuffers (zero-copy).
 * @param {WorkerResultPayload} data
 * @returns {void}
 */
function sendResultWithTransfer(data: {
    images?: WorkerImage[];
    pageImages?: WorkerImage[] | null;
    [key: string]: any;
}) {
    const transferables: ArrayBuffer[] = [];

    if (data.images) {
        for (const img of data.images) {
            if (img.imageData instanceof ArrayBuffer) {
                transferables.push(img.imageData);
            }
        }
    }
    if (data.pageImages) {
        for (const pi of data.pageImages) {
            if (pi.imageData instanceof ArrayBuffer) {
                transferables.push(pi.imageData);
            }
        }
    }

    _self.postMessage({ type: 'result', data }, transferables);
}

// ---------------------------------------------------------------------------
// Main Message Handler (v0.2: rawText, scanned path, ArrayBuffer output)
// ---------------------------------------------------------------------------

/**
 * @param {MessageEvent<{ type: string, file: ArrayBuffer, fileName: string, options?: { minConfidence?: number } }>} e
 * @returns {Promise<void>}
 */
_self.onmessage = async function (
    e: MessageEvent<{
        type: string;
        file: ArrayBuffer;
        fileName: string;
        options?: { minConfidence?: number };
    }>,
) {
    const { type, file, fileName, options = {} } = e.data;

    if (type !== 'extract') {
        sendError(`Unknown message type: ${type}`);
        return;
    }

    if (!file || !fileName) {
        sendError('Missing file or fileName');
        return;
    }

    try {
        const ext = fileName.toLowerCase().split('.').pop();
        let tables: WorkerTableCandidate[] = [];
        /** @type {WorkerImage[]} */
        let images: WorkerImage[] = [];
        let rawText = '';
        let textItems: WorkerTextItem[] | null = null;
        let pageCount = 0;
        let htmlContent: string | null = null;
        let isScanned = false;

        if (ext === 'pdf') {
            // Clone source buffer per extraction phase because PDF.js may detach/transcode
            // incoming buffers internally. Reusing one detached buffer causes sporadic
            // "Cannot perform Construct on a detached ArrayBuffer" in image extraction.
            const sourceBuffer = file instanceof ArrayBuffer ? file : null;
            const textBuffer = sourceBuffer ? sourceBuffer.slice(0) : file;
            const mediaBuffer = sourceBuffer ? sourceBuffer.slice(0) : file;

            sendProgress(1, 'Starting PDF extraction...');
            const extracted = await extractPdfItems(textBuffer);
            const items = extracted.items;
            pageCount = extracted.pageCount;

            isScanned = isScannedPDF(items, pageCount);

            if (isScanned) {
                // ── SCANNED PATH (SP-28) ──
                sendProgress(5, `Scanned PDF detected (${pageCount} pages). Rendering for OCR...`);
                const pageImages = await renderPagesAsImages(mediaBuffer);

                sendProgress(60, 'Preparing scanned pages...');

                sendResultWithTransfer({
                    fileName,
                    fileType: ext,
                    tables: [],
                    quarantined: [],
                    images: [],
                    pageImages,
                    isScanned: true,
                    rawText: '',
                    textItems: null,
                    pageCount,
                    htmlContent: null,
                    totalTables: 0,
                    stats: {
                        acceptedCount: 0,
                        quarantinedCount: 0,
                        imageCount: 0,
                        pageImageCount: pageImages.length,
                        avgConfidence: 0,
                        isScanned: true,
                    },
                });
                sendProgress(100, 'Done');
                return;
            }

            // ── TEXT-LAYER PATH ──
            sendProgress(50, `Extracted ${items.length} text items. Reconstructing tables...`);
            tables = reconstructTablesInWorker(items);

            // Assemble raw text (SP-35: adaptive threshold)
            rawText = assembleRawText(items, pageCount);

            sendProgress(60, `Found ${tables.length} table(s). Extracting images...`);
            try {
                images = await extractPdfImages(mediaBuffer);
                sendProgress(70, `Found ${images.length} image(s). Classifying...`);
            } catch (imgErr) {
                console.warn(
                    '[documentWorker] Image extraction failed:',
                    imgErr instanceof Error ? imgErr.message : imgErr,
                );
                sendProgress(70, `Image extraction skipped. Classifying tables...`);
            }

            // Filter text items to image pages only (SP-17: cap at 10K)
            textItems = filterItemsForImagePages(items, images);
        } else if (ext === 'docx') {
            sendProgress(1, 'Starting DOCX extraction...');
            const docxResult = await extractDocxWithImages(file);

            htmlContent = docxResult.html;
            rawText = stripHtmlToText(docxResult.html);

            sendProgress(50, 'Parsing HTML tables...');
            tables = parseDocxTablesInWorker(docxResult.html);

            // DOCX images: convert base64 dataUrl to ArrayBuffer
            images = [];
            for (const img of docxResult.images || []) {
                if (img.dataUrl) {
                    try {
                        const resp = await fetch(img.dataUrl);
                        const ab = await resp.arrayBuffer();
                        images.push({
                            imageData: ab,
                            page: 1, // DOCX doesn't have page numbers for images
                            width: 0,
                            height: 0, // dimensions unknown from mammoth
                            index: img.index,
                            contentType: img.contentType,
                        });
                    } catch (e) {
                        console.debug('[docWorker] docx-image-fetch:', e instanceof Error ? e.message : e);
                        // Skip failed conversions
                    }
                }
            }

            // Estimate page count from text length (~3000 chars per page)
            pageCount = Math.max(1, Math.ceil(rawText.length / 3000));

            sendProgress(70, `Found ${tables.length} table(s), ${images.length} image(s). Classifying...`);
        } else {
            sendError(`Unsupported file type: .${ext}. Expected .pdf or .docx`);
            return;
        }

        // Classify tables by confidence
        const accepted: WorkerTableCandidate[] = [];
        const quarantined: WorkerTableCandidate[] = [];
        const minConfidence = options.minConfidence || 0.6;

        for (const t of tables) {
            if (t.confidence >= minConfidence) {
                accepted.push(t);
            } else {
                quarantined.push(t);
            }
        }

        sendProgress(90, 'Extraction complete. Preparing results...');

        sendResultWithTransfer({
            fileName,
            fileType: ext,
            tables: accepted,
            quarantined,
            images,
            pageImages: null,
            isScanned: false,
            rawText,
            textItems,
            pageCount,
            htmlContent,
            totalTables: tables.length,
            stats: {
                acceptedCount: accepted.length,
                quarantinedCount: quarantined.length,
                imageCount: images.length,
                avgConfidence:
                    tables.length > 0
                        ? Math.round((tables.reduce((s, t) => s + t.confidence, 0) / tables.length) * 100) / 100
                        : 0,
            },
        });

        sendProgress(100, 'Done');
    } catch (err) {
        sendError(err instanceof Error ? err.message : 'Unknown extraction error');
    }
};
