// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Retroactive Compliance Preset Application — pure logic (D9 of
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET).
 *
 * Calvin D9 homologation: when applying a NEW compliance preset to an
 * EXISTING (legacy) model, recalculation is OPTIONAL — caller decides.
 * Either way, the original (pre-preset) results MUST be preserved in an
 * immutable snapshot for audit trail.
 *
 * Use case:
 *   - User imports legacy `.ecbt` model (created before COMPLIANCE-PRESET)
 *   - User selects preset `br-conama-420-ar4`
 *   - System asks: "Recalcular resultados retroativamente OU manter
 *     resultados originais e apenas marcar conformidade?"
 *
 * Either choice creates an audit row + the legacy snapshot is preserved.
 *
 * Pure: caller passes the current results + new preset id + user choice;
 * module returns a frozen application plan. Caller executes the plan
 * (runs recalc engine, persists snapshot).
 *
 * Tests live in `tests/compliance-retroactive-snapshot-pure.test.mjs`.
 */

export type RetroactiveMode = 'recalculate' | 'preserve_original';

export interface LegacySnapshot {
    readonly resultsHash: string;
    readonly capturedAt: string;
    readonly modelVersion?: string;
    readonly source: 'legacy-import' | 'preset-change' | 'manual';
}

export interface RetroactiveApplicationInput {
    readonly newPresetId: string;
    readonly currentResultsHash: string;
    readonly mode: RetroactiveMode;
    readonly userId: string;
    readonly nowIso: string;
    readonly reason?: string;
}

export interface ApplicationPlan {
    readonly snapshot: LegacySnapshot;
    readonly auditEntry: Readonly<{
        readonly action: 'apply_preset_retroactive';
        readonly presetId: string;
        readonly mode: RetroactiveMode;
        readonly userId: string;
        readonly ts: string;
        readonly reason: string;
        readonly retroactive: true;
    }>;
    readonly mustRecalculate: boolean;
}

export interface ApplicationResult {
    readonly plan: ApplicationPlan | null;
    readonly errors: ReadonlyArray<string>;
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

function isValidIso(v: unknown): v is string {
    return isNonEmptyString(v) && Number.isFinite(Date.parse(v));
}

/**
 * Build the application plan for retroactively applying a preset to a
 * legacy model. Pure: returns frozen plan + errors.
 */
export function planRetroactiveApplication(
    input: RetroactiveApplicationInput | null | undefined,
): ApplicationResult {
    const errors: string[] = [];
    if (!input || typeof input !== 'object') {
        return Object.freeze({ plan: null, errors: Object.freeze(['input_invalid']) });
    }
    if (!isNonEmptyString(input.newPresetId)) errors.push('newPresetId_missing');
    if (!isNonEmptyString(input.currentResultsHash)) errors.push('currentResultsHash_missing');
    if (input.mode !== 'recalculate' && input.mode !== 'preserve_original') {
        errors.push('mode_invalid');
    }
    if (!isNonEmptyString(input.userId)) errors.push('userId_missing');
    if (!isValidIso(input.nowIso)) errors.push('nowIso_invalid');

    if (errors.length > 0) {
        return Object.freeze({ plan: null, errors: Object.freeze(errors) });
    }

    const snapshot: LegacySnapshot = Object.freeze({
        resultsHash: input.currentResultsHash,
        capturedAt: input.nowIso,
        source: 'preset-change' as const,
    });

    const reason = isNonEmptyString(input.reason)
        ? input.reason
        : input.mode === 'recalculate'
            ? 'Preset application — recalc requested by user'
            : 'Preset application — original results preserved per user choice';

    const auditEntry = Object.freeze({
        action: 'apply_preset_retroactive' as const,
        presetId: input.newPresetId,
        mode: input.mode,
        userId: input.userId,
        ts: input.nowIso,
        reason,
        retroactive: true as const,
    });

    const plan: ApplicationPlan = Object.freeze({
        snapshot,
        auditEntry,
        mustRecalculate: input.mode === 'recalculate',
    });

    return Object.freeze({ plan, errors: Object.freeze(errors) });
}

/**
 * Inspect a stream of legacy snapshots and return the most recent one
 * matching `source='preset-change'`. Useful to recover what the user
 * had before the LAST preset change.
 */
export function findLastPresetChangeSnapshot(
    snapshots: ReadonlyArray<LegacySnapshot> | null | undefined,
): LegacySnapshot | null {
    if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
    const hits = snapshots.filter((s) => s && s.source === 'preset-change' && isValidIso(s.capturedAt));
    if (hits.length === 0) return null;
    hits.sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
    return hits[0] as LegacySnapshot;
}

/**
 * Determine whether a model can be considered "legacy" for the purposes
 * of D9: no preset binding AND has at least one computed result.
 */
export function isLegacyModel(
    bindingsCount: number | null | undefined,
    hasComputedResults: boolean | null | undefined,
): boolean {
    const count = typeof bindingsCount === 'number' && Number.isFinite(bindingsCount) ? bindingsCount : 0;
    return count === 0 && hasComputedResults === true;
}
