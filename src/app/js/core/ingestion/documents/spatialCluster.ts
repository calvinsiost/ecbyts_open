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
 * spatialCluster.js - Adaptive spatial clustering for table reconstruction
 * ADR-022: Neuro-Symbolic Document Ingestion - Layer 1 (Raw Extraction)
 *
 * Recebe text items com bounding boxes (x, y, width, height, page) extraidos
 * de PDFs via pdfjs-dist e reconstroi tabelas usando clustering espacial adaptativo.
 *
 * Algoritmo:
 * 1. Calcula meanLineSpacing a partir dos gaps Y entre items consecutivos
 * 2. Agrupa items em linhas usando threshold = meanLineSpacing * 0.3
 * 3. Dentro de cada linha, ordena por X e detecta colunas por gaps
 * 4. Calcula Table Confidence Score (0.0-1.0) baseado em regularidade da grade
 *
 * @module core/ingestion/documents/spatialCluster
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fallback line spacing when too few items to calculate (in PDF user-space units) */
const DEFAULT_LINE_SPACING = 12;

/** Multiplier of meanLineSpacing for row grouping threshold */
const ROW_THRESHOLD_FACTOR = 0.3;

/** Minimum items to attempt table reconstruction */
const MIN_ITEMS_FOR_TABLE = 4;

/** Minimum table confidence to consider auto-parseable (quarantine below this) */
export const MIN_CONFIDENCE = 0.6;

/** High confidence threshold for fully automated extraction */
export const HIGH_CONFIDENCE = 0.8;

interface TextItem {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    page?: number;
}
interface ColumnBound {
    xMin: number;
    xMax: number;
}

// ---------------------------------------------------------------------------
// Core Clustering
// ---------------------------------------------------------------------------

/**
 * Calculates the mean vertical spacing between consecutive text items.
 * Items are sorted by Y position first.
 *
 * @param items - Text items with Y positions
 * @returns Mean line spacing in user-space units
 */
function calculateMeanLineSpacing(items: Array<{ y: number }>): number {
    if (items.length < 2) return DEFAULT_LINE_SPACING;

    // Sort by Y (top to bottom - in PDF, Y can be bottom-up or top-down)
    const sorted = [...items].sort((a, b) => a.y - b.y);

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
        const gap = Math.abs((sorted[i] as { y: number }).y - (sorted[i - 1] as { y: number }).y);
        if (gap > 0.5) {
            // Ignore near-zero gaps (same-line items)
            gaps.push(gap);
        }
    }

    if (gaps.length === 0) return DEFAULT_LINE_SPACING;

    // Use median instead of mean for robustness against outliers
    gaps.sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    return gaps.length % 2 === 0
        ? ((gaps[mid - 1] as number) + (gaps[mid] as number)) / 2
        : (gaps[mid] as number);
}

/**
 * Groups text items into rows based on Y proximity.
 * Items within rowThreshold of each other are considered same row.
 *
 * @param items - Max Y distance to group into same row
 */
function groupIntoRows(items: Array<TextItem>, rowThreshold: number): Array<Array<TextItem>> {
    if (items.length === 0) return [];

    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: Array<Array<TextItem>> = [];
    let currentRow = [sorted[0] as TextItem];
    let currentY = (sorted[0] as TextItem).y;

    for (let i = 1; i < sorted.length; i++) {
        const item = sorted[i] as TextItem;
        if (Math.abs(item.y - currentY) <= rowThreshold) {
            currentRow.push(item);
        } else {
            // Sort current row by X before pushing
            currentRow.sort((a, b) => a.x - b.x);
            rows.push(currentRow);
            currentRow = [item];
            currentY = item.y;
        }
    }

    // Last row
    if (currentRow.length > 0) {
        currentRow.sort((a, b) => a.x - b.x);
        rows.push(currentRow);
    }

    return rows;
}

/**
 * Detects column boundaries from a set of rows.
 * Uses X-position clustering across all items to find consistent columns.
 *
 * @returns Column boundaries sorted by xMin
 */
function detectColumns(rows: any): Array<ColumnBound> {
    // Collect all X start positions
    const allXPositions: number[] = [];
    for (const row of rows) {
        for (const item of row) {
            allXPositions.push(item.x);
        }
    }

    if (allXPositions.length === 0) return [];

    // Sort and cluster X positions
    allXPositions.sort((a, b) => a - b);

    // Calculate typical character width from items
    let avgWidth = 0;
    let widthCount = 0;
    for (const row of rows) {
        for (const item of row) {
            if (item.width > 0 && item.text) {
                avgWidth += item.width / Math.max(item.text.length, 1);
                widthCount++;
            }
        }
    }
    avgWidth = widthCount > 0 ? avgWidth / widthCount : 5;

    // Column gap threshold: 2x average character width
    const colThreshold = avgWidth * 2;

    const columns: Array<ColumnBound> = [];
    let colStart = allXPositions[0] as number;
    let colEnd = allXPositions[0] as number;

    for (let i = 1; i < allXPositions.length; i++) {
        if ((allXPositions[i] as number) - colEnd > colThreshold) {
            columns.push({ xMin: colStart, xMax: colEnd });
            colStart = allXPositions[i] as number;
        }
        colEnd = allXPositions[i] as number;
    }
    columns.push({ xMin: colStart, xMax: colEnd });

    return columns;
}

/**
 * Assigns each cell in a row to its nearest column
 *
 * @returns Array of cell texts aligned to columns (empty string if no match)
 */
function alignToColumns(
    rowItems: Array<{ x: number; text: string }>,
    columns: Array<ColumnBound>,
): string[] {
    const cells: string[] = new Array(columns.length).fill('');

    for (const item of rowItems) {
        let bestCol = 0;
        let bestDist = Infinity;

        for (let c = 0; c < columns.length; c++) {
            const col = columns[c] as ColumnBound;
            const colCenter = (col.xMin + col.xMax) / 2;
            const dist = Math.abs(item.x - colCenter);
            if (dist < bestDist) {
                bestDist = dist;
                bestCol = c;
            }
        }

        // Append with space if column already has text (merged cells)
        cells[bestCol] = cells[bestCol] ? cells[bestCol] + ' ' + item.text : item.text;
    }

    return cells;
}

// ---------------------------------------------------------------------------
// Table Confidence Score
// ---------------------------------------------------------------------------

/**
 * Calculates a confidence score (0.0-1.0) for a reconstructed table.
 * Based on:
 * - Column count consistency across rows
 * - Cell fill ratio (non-empty cells)
 * - Row count (more rows = more confidence in pattern)
 * - Column alignment regularity
 *
 * @param table - 2D array of cell texts
 * @param rows - Original row items (for alignment check)
 * @param columns - Detected columns
 * @returns Confidence score 0.0-1.0
 */
function calculateTableConfidence(
    table: Array<string[]>,
    rows: Array<Array<{ x: number }>>,
    columns: Array<ColumnBound>,
): number {
    if (!table || table.length < 2 || columns.length < 2) return 0.0;

    const numCols = columns.length;
    const numRows = table.length;

    // Factor 1: Column consistency - how many rows have expected column count
    let consistentRows = 0;
    for (const row of table) {
        // Count non-empty cells
        const filledCols = row.filter((c) => c.trim() !== '').length;
        if (filledCols >= numCols * 0.5) consistentRows++;
    }
    const consistencyScore = consistentRows / numRows;

    // Factor 2: Cell fill ratio
    const totalCells = numRows * numCols;
    let filledCells = 0;
    for (const row of table) {
        for (const cell of row) {
            if (cell.trim() !== '') filledCells++;
        }
    }
    const fillScore = filledCells / totalCells;

    // Factor 3: Row count bonus (more data = more pattern confidence)
    const rowScore = Math.min(numRows / 10, 1.0);

    // Factor 4: Column alignment regularity
    let alignmentScore = 1.0;
    if (rows.length > 1) {
        // Check how well items align to column centers across rows
        let totalDeviation = 0;
        let deviationCount = 0;
        for (const row of rows) {
            for (const item of row) {
                let minDist = Infinity;
                for (const col of columns) {
                    const center = (col.xMin + col.xMax) / 2;
                    const colWidth = col.xMax - col.xMin;
                    const dist = Math.abs(item.x - center) / Math.max(colWidth, 1);
                    if (dist < minDist) minDist = dist;
                }
                totalDeviation += minDist;
                deviationCount++;
            }
        }
        const avgDeviation = deviationCount > 0 ? totalDeviation / deviationCount : 0;
        alignmentScore = Math.max(0, 1.0 - avgDeviation);
    }

    // Weighted combination
    const score = consistencyScore * 0.35 + fillScore * 0.25 + rowScore * 0.15 + alignmentScore * 0.25;

    return Math.round(score * 100) / 100; // Round to 2 decimal places
}

// ---------------------------------------------------------------------------
// DOCX HTML Table Parser (pure regex - no DOMParser in Web Workers)
// ---------------------------------------------------------------------------

/**
 * Extracts tables from Mammoth.js HTML output using regex.
 * Mammoth produces clean, predictable HTML - regex is sufficient.
 *
 * @param html - HTML string from mammoth.js
 */
export function parseDocxTables(html: string): Array<{ table: string[][]; confidence: number }> {
    if (!html || typeof html !== 'string') return [];

    const tables: Array<{ table: string[][]; confidence: number }> = [];
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;

    while ((tableMatch = tableRegex.exec(html)) !== null) {
        const tableHtml = tableMatch[1] as string;
        const rows: string[][] = [];

        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let trMatch;

        while ((trMatch = trRegex.exec(tableHtml)) !== null) {
            const rowHtml = trMatch[1] as string;
            const cells: string[] = [];

            const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
            let tdMatch;

            while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
                // Strip HTML tags from cell content
                const cellText = (tdMatch[1] as string)
                    .replace(/<[^>]+>/g, '')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
                    .trim();
                cells.push(cellText);
            }

            if (cells.length > 0) {
                rows.push(cells);
            }
        }

        if (rows.length >= 2) {
            // Normalize column count (pad shorter rows)
            const maxCols = Math.max(...rows.map((r) => r.length));
            const normalizedRows = rows.map((r) => {
                while (r.length < maxCols) r.push('');
                return r;
            });

            // DOCX tables from Mammoth are well-structured - higher base confidence
            const filledCells = normalizedRows.flat().filter((c) => c !== '').length;
            const totalCells = normalizedRows.length * maxCols;
            const fillRatio = filledCells / totalCells;
            const confidence = Math.min(0.7 + fillRatio * 0.3, 1.0);

            tables.push({
                table: normalizedRows,
                confidence: Math.round(confidence * 100) / 100,
            });
        }
    }

    return tables;
}

// ---------------------------------------------------------------------------
// Public API - PDF Table Reconstruction
// ---------------------------------------------------------------------------

/**
 * Reconstructs tables from PDF text items with bounding boxes.
 *
 * @param items
 *   Text items extracted by pdfjs-dist getTextContent()
 * @returns
 *   Reconstructed tables with confidence scores
 */
export function reconstructTables(items: Array<TextItem>): Array<any> {
    if (!items || items.length < MIN_ITEMS_FOR_TABLE) return [];

    // Group items by page
    const pageMap = new Map<number, Array<TextItem>>();
    for (const item of items) {
        const page = item.page || 1;
        if (!pageMap.has(page)) pageMap.set(page, []);
        (pageMap.get(page) as Array<TextItem>).push(item);
    }

    const results: Array<any> = [];

    for (const [page, pageItems] of pageMap) {
        // Calculate adaptive threshold
        const meanSpacing = calculateMeanLineSpacing(pageItems);
        const rowThreshold = meanSpacing * ROW_THRESHOLD_FACTOR;

        // Group into rows
        const rows = groupIntoRows(pageItems, rowThreshold);
        if (rows.length < 2) continue;

        // Detect columns
        const columns = detectColumns(rows);
        if (columns.length < 2) continue;

        // Build table grid
        const table = rows.map((row) => alignToColumns(row, columns));

        // Calculate confidence
        const confidence = calculateTableConfidence(table, rows, columns);

        results.push({
            table,
            confidence,
            page,
            rows: rows.length,
            cols: columns.length,
            meanLineSpacing: meanSpacing,
        });
    }

    return results;
}

/**
 * Filters tables by confidence threshold.
 * Returns { accepted, quarantined } - quarantined tables need human review.
 *
 * @param threshold - Minimum confidence for auto-parsing
 */
export function filterByConfidence(
    tables: Array<{ table: string[][]; confidence: number }>,
    threshold: number = MIN_CONFIDENCE,
): { accepted: Array<any>; quarantined: Array<any> } {
    const accepted: Array<any> = [];
    const quarantined: Array<any> = [];

    for (const t of tables) {
        if (t.confidence >= threshold) {
            accepted.push(t);
        } else {
            quarantined.push(t);
        }
    }

    return { accepted, quarantined };
}
