// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.2
/**
 * coordinateExtractor.js - Extract GCPs, scale bar, and CRS from map images.
 *
 * Reads OCR word bboxes to find UTM coordinate labels in map margins,
 * scale bars, and CRS references. Output feeds mapGeoreferencer.js.
 *
 * @module core/ingestion/documents/coordinateExtractor
 */
import { MARGIN_ZONES } from './types.js';
import { parseCoordinate, detectCRS } from './staging.js';
type AnyRecord = Record<string, any>;
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** UTM easting: 6 digits (100,000–999,999) with optional BR formatting */
const _UTM_EASTING_RE = /^(\d{2,3})[.,]?(\d{3})(?:[.,](\d{1,3}))?$/;
/** UTM northing: 7 digits (1,000,000–9,999,999) with optional BR formatting */
const _UTM_NORTHING_RE = /^(\d{1,2})[.,]?(\d{3})[.,]?(\d{3})(?:[.,](\d{1,3}))?$/;
/** DMS coordinate (degrees, minutes, seconds) */
const _DMS_RE = /^-?\d{1,3}[°]\s*\d{1,2}['′]\s*\d{1,2}(?:[.,]\d+)?["″]?\s*[NSEW]?$/;
/** Scale bar text patterns */
const SCALE_BAR_RE = /^(\d+)\s*(m|km)$/i;
/** Numeric scale patterns */
const NUMERIC_SCALE_PATTERNS = [/1\s*:\s*([\d.,]+)/, /[Ee]scala\s*:?\s*1\s*[:/]\s*([\d.,]+)/];
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
/**
 * @typedef {Object} GroundControlPoint
 * @property {number[]} pixel    - [px_x, px_y]
 * @property {number[]} coord    - [easting, northing] in CRS units
 * @property {string}   source   - 'grid_margin' | 'label_explicit' | 'scale_bar' | 'manual'
 * @property {number}   confidence
 */
/**
 * @typedef {Object} ScaleBarDetection
 * @property {number}   pixelLength
 * @property {number}   realLength   - meters
 * @property {string}   unit
 * @property {number}   pxPerMeter
 * @property {number[]} pixelStart
 * @property {number[]} pixelEnd
 * @property {number}   confidence
 */
/**
 * @typedef {Object} CoordinateExtractionResult
 * @property {GroundControlPoint[]} gcps
 * @property {ScaleBarDetection|null} scaleBar
 * @property {{ epsg: string, raw: string }|null} crs
 * @property {string|null} scaleText
 * @property {number|null} scaleRatio
 * @property {Object} stats
 */
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Extract coordinates, scale, and CRS from a map image's OCR results.
 *
 * @param {Object} input
 * @param {import('./types.js').OCRWordBox[]} input.ocrWords
 * @param {string}  input.ocrText
 * @param {number}  input.imageWidth
 * @param {number}  input.imageHeight
 * @param {Object}  [input.documentCRS] - CRS from proseParser/staging
 * @returns {CoordinateExtractionResult}
 */
export function extractCoordinates(input: any) {
    const { ocrWords = [], ocrText = '', imageWidth = 1, imageHeight = 1, documentCRS } = input;
    // Detect CRS from OCR text (map legend), fallback to document-level CRS
    const crs = detectCRS(ocrText) || documentCRS || null;
    // Partition words into margin zones
    const marginWords = _partitionMarginWords(ocrWords, imageWidth, imageHeight);
    // Extract GCPs from margins
    const gcps = _extractGCPsFromMargins(marginWords, imageWidth, imageHeight, crs);
    // Detect scale bar
    const scaleBar = _detectScaleBar(ocrWords, imageWidth, imageHeight);
    // Detect numeric scale
    const numericScale = _detectNumericScale(ocrText);
    return {
        gcps,
        scaleBar,
        crs,
        scaleText: numericScale?.scaleText || null,
        scaleRatio: numericScale?.scaleRatio || null,
        stats: {
            totalWords: ocrWords.length,
            marginWords: Object.values(marginWords).reduce((s, arr) => s + arr.length, 0),
            gcpCount: gcps.length,
            hasScaleBar: scaleBar !== null,
            hasNumericScale: numericScale !== null,
            hasCRS: crs !== null,
        },
    };
}
/**
 * Detect scale bar from OCR words in the bottom margin.
 *
 * @param {import('./types.js').OCRWordBox[]} ocrWords
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @returns {ScaleBarDetection|null}
 */
export function detectScaleBar(ocrWords: any, imageWidth: any, imageHeight: any) {
    return _detectScaleBar(ocrWords, imageWidth, imageHeight);
}
/**
 * Detect numeric scale from OCR text ("1:5.000").
 *
 * @param {string} ocrText
 * @returns {{ scaleText: string, scaleRatio: number }|null}
 */
export function detectNumericScale(ocrText: any) {
    return _detectNumericScale(ocrText);
}
// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------
/**
 * Partition OCR words into margin zones (top, bottom, left, right, interior).
 */
/** @param {any} words @param {any} imgW @param {any} imgH */
function _partitionMarginWords(words: any, imgW: any, imgH: any) {
    /** @type {Record<string, any[]>} */
    const result: AnyRecord = { top: [], bottom: [], left: [], right: [], interior: [] };
    for (const word of words) {
        const cx = (word.bbox.x + word.bbox.width / 2) / imgW;
        const cy = (word.bbox.y + word.bbox.height / 2) / imgH;
        if (cy <= MARGIN_ZONES.top.yMax)
            result.top.push(word);
        else if (cy >= MARGIN_ZONES.bottom.yMin)
            result.bottom.push(word);
        else if (cx <= MARGIN_ZONES.left.xMax)
            result.left.push(word);
        else if (cx >= MARGIN_ZONES.right.xMin)
            result.right.push(word);
        else
            result.interior.push(word);
    }
    return result;
}
/**
 * Extract GCPs from margin coordinate labels.
 * CRS-aware: for BR UTM south, easting < 1M, northing > 1M.
 * Fallback: use margin position (top/bottom = easting, left/right = northing).
 */
/** @param {any} marginWords @param {any} imgW @param {any} imgH @param {any} crs */
function _extractGCPsFromMargins(marginWords: any, imgW: any, imgH: any, crs: any) {
    /** @type {any[]} */
    const gcps = [];
    const isBRUTM = crs && /EPSG:319[0-9]{2}/.test(crs.epsg);
    // Try to parse coordinate values from each margin
    const parseMargin = (words: any, zone: any) => {
        const parsed: any[] = [];
        for (const word of words) {
            const val = parseCoordinate(word.text);
            if (val === null || val < 100)
                continue; // skip tiny numbers
            const cx = word.bbox.x + word.bbox.width / 2;
            const cy = word.bbox.y + word.bbox.height / 2;
            // Classify as easting or northing
            let coordType = null;
            if (isBRUTM) {
                // Magnitude heuristic for BR UTM south hemisphere
                if (val >= 100000 && val < 1000000)
                    coordType = 'easting';
                else if (val >= 1000000 && val < 10000000)
                    coordType = 'northing';
            }
            // Fallback: margin position (standard cartographic convention)
            if (!coordType) {
                if (zone === 'top' || zone === 'bottom')
                    coordType = 'easting';
                else if (zone === 'left' || zone === 'right')
                    coordType = 'northing';
            }
            if (coordType) {
                parsed.push({ val, coordType, px: cx, py: cy, text: word.text, confidence: word.confidence / 100 });
            }
        }
        return parsed;
    };
    const topParsed = parseMargin(marginWords.top, 'top');
    const bottomParsed = parseMargin(marginWords.bottom, 'bottom');
    const leftParsed = parseMargin(marginWords.left, 'left');
    const rightParsed = parseMargin(marginWords.right, 'right');
    const allParsed = [...topParsed, ...bottomParsed, ...leftParsed, ...rightParsed];
    // Sanity check: easting/northing swap detection
    // If top/bottom has northing-like values and left/right has easting-like, swap
    const topBottomEastings = [...topParsed, ...bottomParsed].filter((p) => p.coordType === 'easting');
    const leftRightNorthings = [...leftParsed, ...rightParsed].filter((p) => p.coordType === 'northing');
    if (topBottomEastings.length === 0 && leftRightNorthings.length === 0) {
        // Check if swapped
        const topBottomNorthings = [...topParsed, ...bottomParsed].filter((p) => p.coordType === 'northing');
        const leftRightEastings = [...leftParsed, ...rightParsed].filter((p) => p.coordType === 'easting');
        if (topBottomNorthings.length > 0 || leftRightEastings.length > 0) {
            // Swap detected - reclassify based on position
            for (const p of allParsed) {
                if (topParsed.includes(p) || bottomParsed.includes(p)) {
                    p.coordType = 'easting';
                }
                else {
                    p.coordType = 'northing';
                }
            }
        }
    }
    // Build GCPs: pair each easting with a Y-pixel position,
    // each northing with an X-pixel position
    for (const p of allParsed) {
        const pixel = p.coordType === 'easting'
            ? [p.px, imgH / 2] // easting label → place at image vertical center
            : [imgW / 2, p.py]; // northing label → place at image horizontal center
        const coord = p.coordType === 'easting'
            ? [p.val, 0] // easting known, northing TBD
            : [0, p.val]; // northing known, easting TBD
        gcps.push({
            pixel,
            coord,
            source: 'grid_margin',
            confidence: Math.round(p.confidence * 100) / 100,
            _coordType: p.coordType,
            _rawText: p.text,
        });
    }
    // Cross-pair: find intersections of easting and northing GCPs
    const crossPaired = _crossPairGCPs(gcps, imgW, imgH);
    return crossPaired.length >= 2 ? crossPaired : gcps;
}
/**
 * Cross-pair single-axis GCPs into full (easting, northing) pairs.
 * Each easting GCP at px_x combined with each northing GCP at py_y
 * creates a grid point at (px_x, py_y) → (easting, northing).
 */
/** @param {any[]} gcps @param {any} _imgW @param {any} _imgH */
function _crossPairGCPs(gcps: any, _imgW: any, _imgH: any) {
    const eastings = gcps.filter((g: any) => g._coordType === 'easting');
    const northings = gcps.filter((g: any) => g._coordType === 'northing');
    if (eastings.length === 0 || northings.length === 0)
        return [];
    const paired: any[] = [];
    for (const e of eastings) {
        for (const n of northings) {
            paired.push({
                pixel: [e.pixel[0], n.pixel[1]],
                coord: [e.coord[0], n.coord[1]],
                source: 'grid_margin',
                confidence: Math.min(e.confidence, n.confidence),
            });
        }
    }
    return paired;
}
/** @param {any[]} ocrWords @param {any} imgW @param {any} imgH */
function _detectScaleBar(ocrWords: any, imgW: any, imgH: any) {
    // Look for scale bar labels in bottom 20% of image
    const bottomWords = ocrWords.filter((w: any) => {
        const cy = (w.bbox.y + w.bbox.height / 2) / imgH;
        return cy >= 0.8;
    });
    // Find number + "m" or "km" pattern
    for (let i = 0; i < bottomWords.length; i++) {
        const combined = bottomWords[i].text;
        const m = combined.match(SCALE_BAR_RE);
        if (!m)
            continue;
        const value = parseFloat(m[1]);
        const unit = m[2].toLowerCase();
        const realLength = unit === 'km' ? value * 1000 : value;
        if (realLength <= 0)
            continue;
        // Estimate pixel length: find leftmost "0" and rightmost number in vicinity
        let barStartX = bottomWords[i].bbox.x;
        const barEndX = barStartX + bottomWords[i].bbox.width;
        // Look for "0" label to the left
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
            if (bottomWords[j].text === '0' || bottomWords[j].text === 'O') {
                barStartX = bottomWords[j].bbox.x;
                break;
            }
        }
        const pixelLength = Math.abs(barEndX - barStartX);
        if (pixelLength < 20)
            continue;
        return {
            pixelLength,
            realLength,
            unit,
            pxPerMeter: pixelLength / realLength,
            pixelStart: [barStartX, bottomWords[i].bbox.y],
            pixelEnd: [barEndX, bottomWords[i].bbox.y],
            confidence: 0.7,
        };
    }
    return null;
}
/** @param {any} ocrText */
function _detectNumericScale(ocrText: any) {
    if (!ocrText)
        return null;
    for (const re of NUMERIC_SCALE_PATTERNS) {
        const m = ocrText.match(re);
        if (m) {
            const raw = m[1].replace(/\./g, '').replace(/,/g, '');
            const ratio = parseInt(raw);
            if (ratio > 0 && ratio < 1000000) {
                return { scaleText: m[0], scaleRatio: ratio };
            }
        }
    }
    return null;
}
//# sourceMappingURL=coordinateExtractor.js.map
