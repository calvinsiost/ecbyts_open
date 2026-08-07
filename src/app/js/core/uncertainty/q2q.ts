// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

// UNC-Q2Q-001 - Qualitative-to-Quantitative Uncertainty Conversion
// Maps human-readable quality labels to GUM-compatible numeric intervals.
// Versioning: MAPPING_VERSION locks determinism across audit trails.
const MAPPING_VERSION = '1.0.0';

export const Q2Q_MAP_V1 = Object.freeze({
    very_low: { pMin: 0.0, pMax: 0.1, distribution: 'uniform', relDefault: 5 },
    low: { pMin: 0.1, pMax: 0.25, distribution: 'uniform', relDefault: 10 },
    medium: { pMin: 0.25, pMax: 0.5, distribution: 'triangular', relDefault: 20 },
    high: { pMin: 0.5, pMax: 0.75, distribution: 'triangular', relDefault: 35 },
    very_high: { pMin: 0.75, pMax: 1.0, distribution: 'triangular', relDefault: 50 },
});

/**
 * Matrix-specific overrides for relDefault.
 * Keys: matrix name → label → partial mapping entry.
 * These override fields in Q2Q_MAP_V1 for specialised use (e.g. groundwater).
 */
const MATRIX_OVERRIDES = Object.freeze({
    groundwater: {
        medium: { relDefault: 25 },
    },
    soil: {
        high: { relDefault: 40 },
    },
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a raw label string.
 * @param {string|undefined|null} raw
 * @returns {string}
 */
function normaliseLabel(raw: string | undefined | null): string {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
}

/**
 * Build the type/distribution/params sub-object for a mapping entry.
 * @param {{relDefault: number, distribution: string, [k: string]: any}} entry  Resolved mapping entry from Q2Q_MAP_V1 (or override).
 * @returns {object}
 */
function buildDistributionShape(entry: { relDefault: number; distribution: string; [k: string]: any }): object {
    const sigma = entry.relDefault / 100;
    return {
        type: 'relative',
        distribution: entry.distribution,
        params: entry.distribution === 'normal' ? { mean: 0, sigma } : { sigma },
    };
}

/**
 * Build provenance metadata block.
 * @param {string} source  e.g. 'q2q_global' | 'q2q_matrix_override' | 'q2q_fallback'
 * @param {{timestamp?: string, [k: string]: any}} [opts]    Caller opts - may contain opts.timestamp for deterministic tests.
 * @returns {object}
 */
function buildProvenance(source: string, opts?: { timestamp?: string; [k: string]: any }): object {
    return {
        mapping_version: MAPPING_VERSION,
        source,
        timestamp: opts && opts.timestamp ? opts.timestamp : new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a qualitative uncertainty label to a quantitative mapping.
 *
 * @param {{label?: string, context?: string}} [input]
 * @param {{runType?: string, timestamp?: string}} [opts]
 * @returns {object}
 */
export function convertQualitativeUncertainty(
    input: { label?: string; context?: string } = {},
    opts: { runType?: string; timestamp?: string } = {},
): object {
    const label = normaliseLabel(input?.label);
    const runType = String(opts?.runType || 'exploratory').toLowerCase();
    const context = input?.context ? String(input.context) : undefined;
    const entry = (Q2Q_MAP_V1 as Record<string, any>)[label];

    if (entry) {
        return {
            ok: true,
            blocked: false,
            label,
            context,
            mapped: entry,
            ...buildDistributionShape(entry),
            confidence_class: 'high',
            provenance: buildProvenance('q2q_global', opts),
            telemetryEvent: 'q2q_mapped',
        };
    }

    if (runType === 'compliance') {
        return {
            ok: false,
            blocked: true,
            reason: 'unknown_label',
            provenance: buildProvenance('q2q_blocked', opts),
            telemetryEvent: 'q2q_blocked_unknown_label',
        };
    }

    // Exploratory fallback → medium
    const fallbackEntry = Q2Q_MAP_V1.medium;
    return {
        ok: true,
        blocked: false,
        label: 'medium',
        context,
        mapped: fallbackEntry,
        ...buildDistributionShape(fallbackEntry),
        confidence_class: 'low',
        fallback: true,
        provenance: buildProvenance('q2q_fallback', opts),
        telemetryEvent: 'q2q_fallback_used',
    };
}

/**
 * Convert with a matrix-specific context, applying overrides when available.
 *
 * @param {{label?: string, context?: string}} [input]   Same as convertQualitativeUncertainty.
 * @param {string} [matrix]  Matrix name e.g. 'groundwater', 'soil'.
 * @param {{runType?: string, timestamp?: string}} [opts]  Same as convertQualitativeUncertainty.
 * @returns {object}
 */
export function convertWithMatrixContext(
    input: { label?: string; context?: string } = {},
    matrix = '',
    opts: { runType?: string; timestamp?: string } = {},
): object {
    const label = normaliseLabel(input?.label);
    const matrixKey = String(matrix || '').toLowerCase();
    const globalEntry = (Q2Q_MAP_V1 as Record<string, any>)[label];

    if (!globalEntry) {
        // Delegate to convertQualitativeUncertainty for blocked/fallback handling
        return convertQualitativeUncertainty(input, opts);
    }

    const matrixMap = (MATRIX_OVERRIDES as Record<string, any>)[matrixKey];
    const labelOverride = matrixMap && matrixMap[label];
    const hasOverride = Boolean(labelOverride);

    const resolvedEntry = hasOverride ? Object.assign({}, globalEntry, labelOverride) : globalEntry;

    return {
        ok: true,
        blocked: false,
        label,
        matrix: matrixKey || undefined,
        mapped: resolvedEntry,
        ...buildDistributionShape(resolvedEntry),
        confidence_class: hasOverride ? 'medium' : 'high',
        provenance: buildProvenance(hasOverride ? 'q2q_matrix_override' : 'q2q_global', opts),
        telemetryEvent: hasOverride ? 'q2q_matrix_override' : 'q2q_mapped',
    };
}

/**
 * Batch-convert an array of qualitative uncertainty inputs.
 *
 * @param {Array<{label: string, context?: string, matrix?: string}>} inputs
 * @param {object} [opts]  Passed to each individual conversion.
 * @returns {{ results: object[], blocked_count: number, fallback_count: number, mapped_count: number }}
 */
export function batchConvert(
    inputs: Array<{ label: string; context?: string; matrix?: string }> = [],
    opts: object = {},
): { results: object[]; blocked_count: number; fallback_count: number; mapped_count: number } {
    const results: object[] = [];
    let blocked_count = 0;
    let fallback_count = 0;
    let mapped_count = 0;

    for (const item of inputs) {
        let result;
        if (item.matrix) {
            result = convertWithMatrixContext(item, item.matrix, opts);
        } else {
            result = convertQualitativeUncertainty(item, opts);
        }

        results.push(result);

        const r = result as { blocked?: boolean; fallback?: boolean };
        if (r.blocked) blocked_count++;
        else if (r.fallback) fallback_count++;
        else mapped_count++;
    }

    return { results, blocked_count, fallback_count, mapped_count };
}

/**
 * List all known qualitative labels in canonical order.
 * @returns {string[]}
 */
export function listLabels(): string[] {
    return ['very_low', 'low', 'medium', 'high', 'very_high'];
}

/**
 * Return the current mapping version string.
 * @returns {string}
 */
export function getMappingVersion(): string {
    return MAPPING_VERSION;
}

/**
 * Produce an overridden mapping entry with provenance - does NOT mutate Q2Q_MAP_V1.
 * Returns a patched mapping object the caller can use in place of the global map.
 *
 * @param {string} [label]         Known label to override e.g. 'medium'.
 * @param {{relDefault?: number, distribution?: string, rationale?: string}} [overrideEntry] Fields to patch.
 * @param {{userId?: string, timestamp?: string, rationale?: string}} [auditContext]
 * @returns {object} Patched mapping entry with provenance and _override flag.
 */
export function applyOverride(
    label = '',
    overrideEntry: { relDefault?: number; distribution?: string; rationale?: string } = {},
    auditContext: { userId?: string; timestamp?: string; rationale?: string } = {},
): object {
    const normLabel = normaliseLabel(label);
    const baseEntry = (Q2Q_MAP_V1 as Record<string, any>)[normLabel];

    if (!baseEntry) {
        throw new RangeError(`applyOverride: unknown label "${normLabel}"`);
    }

    const patched = Object.assign({}, baseEntry, {
        relDefault: overrideEntry.relDefault !== undefined ? overrideEntry.relDefault : baseEntry.relDefault,
        distribution: overrideEntry.distribution !== undefined ? overrideEntry.distribution : baseEntry.distribution,
        _override: true,
        _provenance: {
            mapping_version: MAPPING_VERSION,
            source: 'q2q_manual_override',
            rationale: overrideEntry.rationale || auditContext.rationale || '',
            userId: auditContext.userId || null,
            timestamp: auditContext.timestamp || new Date().toISOString(),
        },
    });

    return patched;
}
