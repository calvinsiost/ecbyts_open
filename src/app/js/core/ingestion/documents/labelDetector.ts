// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.2

/**
 * labelDetector.js - Detect well labels in map images and assign coordinates.
 *
 * Reads OCR words from map interiors (excluding margins), matches well IDs,
 * applies affine transform for world coordinates, and computes action policy
 * (create/update/skip) against existing workspace elements.
 *
 * @module core/ingestion/documents/labelDetector
 */

import { WELL_ID_RE, MARGIN_ZONES } from './types.js';
import { canonicalizeWellId, matchExistingWell } from './wellIdCanon.js';
import { pixelToWorld } from './mapGeoreferencer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} DetectedLabel
 * @property {string}   text
 * @property {string}   canonical
 * @property {string}   type          - 'well_id' | 'parameter_label' | 'scale_label' | 'unknown'
 * @property {number[]} pixelCenter
 * @property {{ x: number, y: number, width: number, height: number }} bbox
 * @property {number}   ocrConfidence - 0-100
 * @property {{ easting: number, northing: number }|null} worldCoord
 * @property {string|null} matchedElement
 * @property {number}   geoConfidence - 0.0 to 1.0
 */

/**
 * @typedef {Object} LabelDetectionResult
 * @property {DetectedLabel[]}  labels
 * @property {DetectedLabel[]}  wellLabels
 * @property {Object}           stats
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Parameter labels to classify but not position */
const PARAM_LABEL_RE = /\b(benzeno|tolueno|BTEX|naftaleno|μg\/L|mg\/L|pH)\b/i;

/** Scale/legend labels */
const SCALE_LABEL_RE = /\b(\d+\s*m\b|escala|scale|legenda|legend)\b/i;

/** Proximity threshold for deduplication (pixels) */
const DEDUP_DISTANCE_PX = 20;

/** Distance thresholds for action policy (meters) */
const ACTION_SKIP_M = 20;
const ACTION_UPDATE_M = 200;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect and classify labels in a map image's OCR output.
 *
 * @param {Object} input
 * @param {import('./types.js').OCRWordBox[]}  input.ocrWords
 * @param {number}  input.imageWidth
 * @param {number}  input.imageHeight
 * @param {import('./mapGeoreferencer.js').AffineTransform|null} [input.transform]
 * @param {string[]} [input.knownWells]
 * @returns {LabelDetectionResult}
 */
export function detectLabels(input: any) {
    const { ocrWords = [], imageWidth = 1, imageHeight = 1, transform, knownWells } = input;

    // Filter: interior words only (exclude margins used by coordinateExtractor)
    const interiorWords = ocrWords.filter((w: any) => isInteriorWord(w, imageWidth, imageHeight));

    const labels = [];
    for (const word of interiorWords) {
        const label = buildWellLabel(word, transform, knownWells);
        if (label) labels.push(label);
    }

    // Dedup: same canonical within DEDUP_DISTANCE_PX → keep higher confidence
    const deduped = _deduplicateLabels(labels);

    const wellLabels = deduped.filter((l) => l.type === 'well_id');

    return {
        labels: deduped,
        wellLabels,
        stats: buildStats(wellLabels),
    };
}

/**
 * Convert georeferenced well labels to ECBYTSMODEL element positions.
 *
 * Position3D convention:
 *   X = easting offset from model origin
 *   Y = elevation (0 for 2D map extraction)
 *   Z = -(northing offset from model origin) [Three.js: Z negated]
 *
 * Action policy:
 *   <20m from existing → skip (position within tolerance)
 *   20-200m → update_position (suggest correction)
 *   >200m → skip with warning (likely different well or transform error)
 *
 * @param {DetectedLabel[]} wellLabels - georeferenced labels
 * @param {Object} modelCoordSystem - { zone, hemisphere, origin: { easting, northing, elevation } }
 * @param {Object} [existingPositions] - Map<name, {x,y,z}> of existing element positions
 * @returns {Array<{
 *   name: string, family: string, position: {x: number, y: number, z: number},
 *   source: string, confidence: number, action: string, reason: string,
 *   existingName: string|null, distanceM: number|null
 * }>}
 */
export function labelsToElements(wellLabels: any, modelCoordSystem: any, existingPositions = {}) {
    const mcs = /** @type {any} */ (modelCoordSystem);
    if (!mcs?.origin) return [];

    const origin = mcs.origin;
    const results = [];
    const existingMap = /** @type {Record<string, any>} */ (existingPositions) as Record<string, any>;

    for (const label of wellLabels) {
        const result = buildElementForLabel(label, origin, existingMap);
        if (result) results.push(result);
    }

    return results;
}

/**
 * Suggest model origin from well label centroid.
 *
 * @param {DetectedLabel[]} wellLabels
 * @returns {{ easting: number, northing: number }|null}
 */
export function suggestOrigin(wellLabels: any) {
    const georef = wellLabels.filter((l: any) => l.worldCoord);
    if (georef.length === 0) return null;

    const sumE = georef.reduce((s: any, l: any) => s + /** @type {any} */ (l.worldCoord).easting, 0);
    const sumN = georef.reduce((s: any, l: any) => s + /** @type {any} */ (l.worldCoord).northing, 0);

    return {
        easting: Math.round(sumE / georef.length),
        northing: Math.round(sumN / georef.length),
    };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isInteriorWord(word: any, imageWidth: number, imageHeight: number): boolean {
    if (!word?.bbox) return false;
    const cx = (word.bbox.x + word.bbox.width / 2) / imageWidth;
    const cy = (word.bbox.y + word.bbox.height / 2) / imageHeight;
    return (
        cx > MARGIN_ZONES.left.xMax &&
        cx < MARGIN_ZONES.right.xMin &&
        cy > MARGIN_ZONES.top.yMax &&
        cy < MARGIN_ZONES.bottom.yMin
    );
}

function classifyLabel(text: string): { type: string; canonical: string | null } {
    if (WELL_ID_RE.test(text)) {
        return { type: 'well_id', canonical: canonicalizeWellId(text) };
    }
    if (PARAM_LABEL_RE.test(text)) {
        return { type: 'parameter_label', canonical: null };
    }
    if (SCALE_LABEL_RE.test(text)) {
        return { type: 'scale_label', canonical: null };
    }
    return { type: 'unknown', canonical: null };
}

function computeWorldCoord(transform: any, center: number[]): { easting: number; northing: number } | null {
    if (!transform) return null;
    return pixelToWorld(transform, center[0], center[1]);
}

function computeGeoConfidence(word: any, transform: any): number {
    if (!transform) return 0;
    const ocrFactor = (word.confidence || 50) / 100;
    const transformFactor = Math.max(0, 1 - (transform.residual || 0) / 50);
    return Math.round(ocrFactor * transformFactor * 100) / 100;
}

function buildWellLabel(word: any, transform: any, knownWells: string[] | undefined): any {
    const text = word.text.trim();
    if (!text || text.length < 2) return null;

    const { type, canonical } = classifyLabel(text);
    if (type !== 'well_id') return null;
    if (!canonical) return null;

    const center = [word.bbox.x + word.bbox.width / 2, word.bbox.y + word.bbox.height / 2];
    const worldCoord = computeWorldCoord(transform, center);
    const matchedElement = knownWells ? matchExistingWell(canonical, knownWells) : null;

    return {
        text,
        canonical,
        type,
        pixelCenter: center,
        bbox: word.bbox,
        ocrConfidence: word.confidence || 0,
        worldCoord,
        matchedElement,
        geoConfidence: computeGeoConfidence(word, transform),
    };
}

function buildStats(wellLabels: any[]): Record<string, number> {
    return {
        total: wellLabels.length,
        wells: wellLabels.length,
        matched: wellLabels.filter((l) => l.matchedElement).length,
        unmatched: wellLabels.filter((l) => !l.matchedElement).length,
        georeferenced: wellLabels.filter((l) => l.worldCoord).length,
    };
}

function computePosition(wc: any, origin: any): { x: number; y: number; z: number } {
    return {
        x: wc.easting - (origin.easting || 0),
        y: 0,
        z: -(wc.northing - (origin.northing || 0)),
    };
}

function resolveAction(distanceM: number): { action: string; reason: string } {
    if (distanceM < ACTION_SKIP_M) {
        return { action: 'skip', reason: `Position within tolerance (${distanceM}m)` };
    }
    if (distanceM <= ACTION_UPDATE_M) {
        return { action: 'update_position', reason: `Position delta ${distanceM}m — suggest correction` };
    }
    return { action: 'skip', reason: `Large position delta (${distanceM}m) — possible transform error` };
}

function buildElementForLabel(label: any, origin: any, existingMap: Record<string, any>): any {
    if (!label.worldCoord) return null;
    const wc = /** @type {any} */ (label.worldCoord);
    const position = computePosition(wc, origin);

    let action = 'create';
    let reason = 'New well detected';
    let distanceM: number | null = null;
    const existingName = label.matchedElement || null;

    if (existingName && existingMap[existingName]) {
        const existing = existingMap[existingName];
        const dx = position.x - existing.x;
        const dz = position.z - existing.z;
        distanceM = Math.round(Math.sqrt(dx * dx + dz * dz) * 10) / 10;
        const resolved = resolveAction(distanceM);
        action = resolved.action;
        reason = resolved.reason;
    }

    return {
        name: existingName || label.canonical,
        family: 'well',
        position,
        source: 'document_extraction',
        confidence: label.geoConfidence,
        action,
        reason,
        existingName,
        distanceM,
    };
}

function _deduplicateLabels(/** @type {any[]} */ labels: any) {
    const result = [];
    const used = new Set();

    // Sort by confidence descending
    const sorted = [...labels].sort((a, b) => b.ocrConfidence - a.ocrConfidence);

    for (const label of sorted) {
        if (used.has(label)) continue;

        // Check for nearby duplicate with same canonical
        let isDup = false;
        for (const existing of result) {
            if (existing.canonical !== label.canonical) continue;
            const dx = existing.pixelCenter[0] - label.pixelCenter[0];
            const dy = existing.pixelCenter[1] - label.pixelCenter[1];
            if (Math.sqrt(dx * dx + dy * dy) <= DEDUP_DISTANCE_PX) {
                isDup = true;
                break;
            }
        }

        if (!isDup) {
            result.push(label);
        }
        used.add(label);
    }

    return result;
}
