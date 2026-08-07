// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// EIS Quality Extensions v2
// Separation rules:
// - Uniqueness: operational duplicates only (never planned QA/QC replicas)
// - Validity: analytical QA/QC failures + structural record validity
// - Exception Context: incident/catastrophic context and regulatory exceptions

interface QualityOptions {
    rpdThreshold?: number;
    rsdThreshold?: number;
}

type ObservationLike = Record<string, unknown>;

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

/**
 * @typedef {Object} QualityOptions
 * @property {number} [rpdThreshold]
 * @property {number} [rsdThreshold]
 */
/**
 * @typedef {{[key: string]: any}} ObservationLike
 */
/**
 * @typedef {Object} ClassificationResult
 * @property {string} sampleType
 * @property {string} eventType
 * @property {number} eventSeverity
 * @property {unknown} qaPairId
 * @property {boolean} plannedQa
 * @property {boolean} structuralValid
 * @property {boolean} validityIssue
 * @property {boolean} exceptionContext
 * @property {boolean} catastrophicPendingReview
 */
/**
 * @typedef {Object} QualityExtensionsResult
 * @property {{ score: number, ratio: number, valid: number, total: number, qaFailures: number }} validity
 * @property {{ score: number, ratio: number, unique: number, total: number, duplicates: number, evaluated: number }} uniqueness
 * @property {{ score: number, confidence: number, lowUncertainty: number, withUncertainty: number, unknown: number }} uncertainty
 * @property {{ count: number, ratio: number, catastrophicPendingReview: number }} exceptionContext
 */
/**
 * @param {unknown} v
 * @returns {number | null}
 */
function toNum(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} v
 * @returns {number}
 */
function clamp01(v: unknown): number {
    return Math.max(0, Math.min(1, Number(v || 0)));
}

/**
 * @param {number} ratio
 * @returns {number}
 */
function scoreFromRatio(ratio: number): number {
    return Number((clamp01(ratio) * 5).toFixed(2));
}

/**
 * @param {ObservationLike} obs
 * @returns {string[]}
 */
function extractStampCodes(obs: ObservationLike): string[] {
    const raw = (obs?.stamps as unknown) || ((obs?.meta as Record<string, unknown>)?.stamps as unknown) || [];
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const s of raw) {
        if (typeof s === 'string') out.push(s.toUpperCase());
        else if (s && typeof s === 'object') {
            const code = (s as Record<string, unknown>).code || (s as Record<string, unknown>).type || (s as Record<string, unknown>).id || (s as Record<string, unknown>).stamp;
            if (typeof code === 'string') out.push(code.toUpperCase());
        }
    }
    return out;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function normalizeSampleType(v: unknown): string {
    return String(v || 'primary')
        .trim()
        .toLowerCase();
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function normalizeEventType(v: unknown): string {
    const e = String(v || 'routine')
        .trim()
        .toLowerCase();
    if (e === 'incident' || e === 'catastrophic') return e;
    return 'routine';
}

/**
 * @param {string} sampleType
 * @returns {boolean}
 */
function isQaPlannedSample(sampleType: string): boolean {
    return (
        sampleType === 'duplicate' ||
        sampleType === 'triplicate' ||
        sampleType === 'split' ||
        sampleType === 'blank_field' ||
        sampleType === 'blank_trip' ||
        sampleType === 'blank_equipment' ||
        sampleType === 'blank_lab' ||
        sampleType === 'spike' ||
        sampleType === 'control'
    );
}

/**
 * @param {string} sampleType
 * @returns {boolean}
 */
function isBlankSample(sampleType: string): boolean {
    return (
        sampleType === 'blank_field' ||
        sampleType === 'blank_trip' ||
        sampleType === 'blank_equipment' ||
        sampleType === 'blank_lab'
    );
}

/**
 * @param {ObservationLike} obs
 * @returns {string}
 */
function buildDuplicateKey(obs: ObservationLike): string {
    return `${obs?._elementId || 'x'}|${obs?.parameterId || obs?.parameter || obs?.name || 'p'}|${obs?.date || 'd'}|${obs?.unitId || 'u'}`;
}

interface ClassificationResult {
    sampleType: string;
    eventType: string;
    eventSeverity: number;
    qaPairId: unknown;
    plannedQa: boolean;
    structuralValid: boolean;
    validityIssue: boolean;
    exceptionContext: boolean;
    catastrophicPendingReview: boolean;
}

/**
 * @param {ObservationLike} obs
 * @param {QualityOptions} [options]
 * @returns {ClassificationResult}
 */
export function classifyObservationForEis(obs: ObservationLike, options: QualityOptions = {}): ClassificationResult {
    const sampleType = normalizeSampleType(obs?.sample_type || obs?.sampleType);
    const eventType = normalizeEventType(obs?.event_type || obs?.eventType);
    const eventSeverity = Math.max(0, Math.min(5, toNum(obs?.event_severity || obs?.eventSeverity) || 0));
    const qaPairId = obs?.qa_pair_id || obs?.qaPairId || null;
    const reviewedAt = obs?.reviewed_at || obs?.reviewedAt || null;
    const stamps = extractStampCodes(obs);

    const value = toNum(obs?.value ?? obs?.reading);
    const hasNumeric = value !== null;
    const hasParam = !!(obs?.parameterId || obs?.parameter || obs?.name || obs?.metric);
    const hasValidDate = !obs?.date || !Number.isNaN(new Date(obs.date as string | number | Date).getTime());
    const structuralValid = hasNumeric && hasParam && hasValidDate;

    // Validity QA/QC rules
    const blankLimit = toNum(obs?.blank_limit ?? obs?.detection_limit ?? obs?.detectionLimit) || 0;
    const blankContaminated = isBlankSample(sampleType) && value !== null && Math.abs(value) > blankLimit;
    const rpd = toNum(obs?.rpd);
    const rsd = toNum(obs?.rsd);
    const rpdThreshold = toFiniteNumber(options.rpdThreshold, 30);
    const rsdThreshold = toFiniteNumber(options.rsdThreshold, 20);
    const precisionFail =
        ((sampleType === 'duplicate' || sampleType === 'triplicate' || sampleType === 'split') &&
            ((rpd !== null && Math.abs(rpd) > rpdThreshold) || (rsd !== null && Math.abs(rsd) > rsdThreshold))) ||
        stamps.includes('PRECISION_FAIL');
    const qaFailedStamp = stamps.includes('QA_FAILED') || stamps.includes('BLANK_CONTAMINATED');
    const validityIssue = !structuralValid || blankContaminated || precisionFail || qaFailedStamp;

    // Exception context rules
    const exceptionContext =
        eventType === 'incident' ||
        eventType === 'catastrophic' ||
        eventSeverity >= 3 ||
        stamps.includes('REGULATORY_EXCEPTION');
    const catastrophicPendingReview = eventType === 'catastrophic' && !reviewedAt;

    return {
        sampleType,
        eventType,
        eventSeverity,
        qaPairId,
        plannedQa: isQaPlannedSample(sampleType) || !!qaPairId,
        structuralValid,
        validityIssue,
        exceptionContext,
        catastrophicPendingReview,
    };
}

interface QualityExtensionsResult {
    validity: {
        score: number;
        ratio: number;
        valid: number;
        total: number;
        qaFailures: number;
    };
    uniqueness: {
        score: number;
        ratio: number;
        unique: number;
        total: number;
        duplicates: number;
        evaluated: number;
    };
    uncertainty: {
        score: number;
        confidence: number;
        lowUncertainty: number;
        withUncertainty: number;
        unknown: number;
    };
    exceptionContext: {
        count: number;
        ratio: number;
        catastrophicPendingReview: number;
    };
}

/**
 * @param {ObservationLike[]} [observations]
 * @param {QualityOptions} [options]
 * @returns {QualityExtensionsResult}
 */
export function computeQualityExtensionsFromObservations(
    observations: ObservationLike[] = [],
    options: QualityOptions = {},
): QualityExtensionsResult {
    const obs = Array.isArray(observations) ? observations : [];
    const total = obs.length;
    if (total === 0) {
        return {
            validity: { score: 0, ratio: 0, valid: 0, total: 0, qaFailures: 0 },
            uniqueness: { score: 0, ratio: 0, unique: 0, total: 0, duplicates: 0, evaluated: 0 },
            uncertainty: { score: 0, confidence: 0, lowUncertainty: 0, withUncertainty: 0, unknown: 0 },
            exceptionContext: { count: 0, ratio: 0, catastrophicPendingReview: 0 },
        };
    }

    let valid = 0;
    let qaFailures = 0;
    let duplicates = 0;
    let evaluatedForUniqueness = 0;
    let withUncertainty = 0;
    let lowUncertainty = 0;
    let exceptionCount = 0;
    let catastrophicPendingReview = 0;
    const seenOperationalKeys = new Set<string>();

    for (const o of obs) {
        const c = classifyObservationForEis(o, options);
        if (!c.validityIssue) valid++;
        else qaFailures++;

        // Anti-double-penalty:
        // Uniqueness evaluates only operational entries, not planned QA/QC samples.
        if (!c.plannedQa) {
            evaluatedForUniqueness++;
            const key = buildDuplicateKey(o);
            if (seenOperationalKeys.has(key)) duplicates++;
            else seenOperationalKeys.add(key);
        }

        const val = toNum(o?.value ?? o?.reading);
        const unc = toNum(o?.uncertainty);
        if (unc !== null) {
            withUncertainty++;
            const rel = Math.abs(unc) <= 1 ? Math.abs(unc) : Math.abs(unc) / Math.max(Math.abs(val || 1), 1e-6);
            if (rel <= 0.5) lowUncertainty++;
        }

        if (c.exceptionContext) exceptionCount++;
        if (c.catastrophicPendingReview) catastrophicPendingReview++;
    }

    const validityRatio = valid / total;
    const uniqueOperational = Math.max(0, evaluatedForUniqueness - duplicates);
    const uniquenessRatio = evaluatedForUniqueness > 0 ? uniqueOperational / evaluatedForUniqueness : 1;
    const uncertaintyRatio = withUncertainty > 0 ? lowUncertainty / withUncertainty : 0;
    const uncertaintyConfidence = withUncertainty / total;

    return {
        validity: {
            score: scoreFromRatio(validityRatio),
            ratio: Number(validityRatio.toFixed(3)),
            valid,
            total,
            qaFailures,
        },
        uniqueness: {
            score: scoreFromRatio(uniquenessRatio),
            ratio: Number(uniquenessRatio.toFixed(3)),
            unique: uniqueOperational,
            total,
            duplicates,
            evaluated: evaluatedForUniqueness,
        },
        uncertainty: {
            score: scoreFromRatio(uncertaintyRatio),
            confidence: Number(uncertaintyConfidence.toFixed(3)),
            lowUncertainty,
            withUncertainty,
            unknown: total - withUncertainty,
        },
        exceptionContext: {
            count: exceptionCount,
            ratio: Number((exceptionCount / total).toFixed(3)),
            catastrophicPendingReview,
        },
    };
}
