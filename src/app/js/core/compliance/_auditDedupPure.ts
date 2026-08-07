// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Preset Audit Dedup Window — pure logic (RF19 / B14 of
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET).
 *
 * Marks "A→B→A in <60s" round-trip audit entries as `transient:true`
 * so the default report view filters them out, while preserving full
 * history for auditors who toggle "show all".
 *
 * Use case: technician toggles between two presets while comparing
 * outputs, then reverts. The intermediate flip-back is noise — but
 * the audit log MUST retain it (append-only invariance) to prove that
 * no values were ever computed under the intermediate preset.
 *
 * Pure: caller passes the (chronologically-ordered) audit log; module
 * returns a NEW frozen array with `transient` flags set on the offending
 * entries. Never mutates the input log.
 *
 * Anti-requirements:
 *   - Append-only: function returns NEW array, original untouched (B14).
 *   - Lock window respected: when `dedupWindowMs` > 60_000, entries
 *     outside the window are NEVER marked.
 *   - Same preset on both sides: an `A → A` entry is ALWAYS flagged
 *     `transient:true` (no-op change, defensive — should not happen
 *     normally, but log may contain manual inserts).
 *
 * Tests live in `tests/compliance-audit-dedup-pure.test.mjs`.
 */

export interface PresetAuditEntry {
    /** ISO-8601 timestamp of the change. */
    readonly ts: string;
    /** Previous preset id (null when no preset was active). */
    readonly oldPresetId: string | null;
    /** New preset id (null when user removed the preset). */
    readonly newPresetId: string | null;
    /** Who changed it (user id / email). */
    readonly changedBy: string;
    /** Free-form motive (RF14 / D8 lock flow). */
    readonly reason?: string;
}

export interface AuditEntryWithFlags {
    readonly entry: PresetAuditEntry;
    /** True when entry is a round-trip noise (A→B→A <60s) OR no-op (A→A). */
    readonly transient: boolean;
    /** Reason for the transient flag — useful for auditor display. */
    readonly transientReason: 'roundtrip' | 'noop' | null;
}

export interface DedupResult {
    readonly entries: ReadonlyArray<AuditEntryWithFlags>;
    /** Count of entries flagged transient. */
    readonly transientCount: number;
    /** Count of non-transient entries (canonical report). */
    readonly canonicalCount: number;
}

const DEFAULT_WINDOW_MS = 60_000;

function freezeEntry(entry: PresetAuditEntry, transient: boolean, reason: 'roundtrip' | 'noop' | null): AuditEntryWithFlags {
    return Object.freeze({
        entry: Object.freeze({ ...entry }),
        transient,
        transientReason: reason,
    });
}

/**
 * Process a chronologically-ordered audit log and return a frozen result
 * with `transient` flags set on round-trip / no-op entries.
 *
 * Algorithm:
 *   For each entry E at index i:
 *     - if E.oldPresetId === E.newPresetId → noop (transient:true)
 *     - else look back at entries within [E.ts - windowMs, E.ts) for any
 *       entry F where F.newPresetId === E.oldPresetId AND
 *       F.oldPresetId === E.newPresetId
 *       — i.e., E reverts what F did. Mark both transient:true.
 *
 * Pure + idempotent: calling twice gives the same result.
 *
 * @param log    chronologically-ordered audit entries (oldest first)
 * @param windowMs? round-trip detection window (default 60_000)
 */
export function decideAuditDedup(
    log: ReadonlyArray<PresetAuditEntry> | null | undefined,
    windowMs?: number,
): DedupResult {
    if (!Array.isArray(log) || log.length === 0) {
        return Object.freeze({
            entries: Object.freeze([] as AuditEntryWithFlags[]),
            transientCount: 0,
            canonicalCount: 0,
        });
    }
    const win = typeof windowMs === 'number' && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS;

    // Pre-parse timestamps to numeric epoch ms. Entries with invalid ts are
    // kept but never participate in round-trip detection (treated as
    // canonical because we can't reason about their time).
    const epochs: number[] = log.map((e) => {
        if (!e || typeof e.ts !== 'string') return NaN;
        const t = Date.parse(e.ts);
        return Number.isFinite(t) ? t : NaN;
    });

    // First pass: identify transient indexes.
    const transientFlags: Array<{ transient: boolean; reason: 'roundtrip' | 'noop' | null }> = log.map(() => ({
        transient: false,
        reason: null,
    }));

    for (let i = 0; i < log.length; i++) {
        const e = log[i];
        if (!e) continue;
        // Noop: same preset on both sides
        if (e.oldPresetId === e.newPresetId) {
            transientFlags[i] = { transient: true, reason: 'noop' };
            continue;
        }
        const ti = epochs[i]!; // epochs = log.map → mesmo length, i < log.length
        if (!Number.isFinite(ti)) continue;
        // Look back for the reverting partner
        for (let j = i - 1; j >= 0; j--) {
            const tj = epochs[j]!; // j em [0, i-1]
            if (!Number.isFinite(tj)) continue;
            if (ti - tj > win) break; // out of window — entries before are further back
            const f = log[j];
            if (!f) continue;
            // Round-trip pattern: f went A→B, e goes B→A in <60s
            if (f.newPresetId === e.oldPresetId && f.oldPresetId === e.newPresetId) {
                transientFlags[i] = { transient: true, reason: 'roundtrip' };
                transientFlags[j] = { transient: true, reason: 'roundtrip' };
                break;
            }
        }
    }

    const entries: AuditEntryWithFlags[] = log.map((e, i) => freezeEntry(e, transientFlags[i]!.transient, transientFlags[i]!.reason));
    const transientCount = entries.reduce((acc, e) => acc + (e.transient ? 1 : 0), 0);
    const canonicalCount = entries.length - transientCount;
    return Object.freeze({
        entries: Object.freeze(entries),
        transientCount,
        canonicalCount,
    });
}

/**
 * Convenience filter — returns only canonical (non-transient) entries.
 * Useful for the default report view.
 */
export function filterCanonical(result: DedupResult | null | undefined): ReadonlyArray<AuditEntryWithFlags> {
    if (!result || typeof result !== 'object') return Object.freeze([] as AuditEntryWithFlags[]);
    return Object.freeze(result.entries.filter((e) => !e.transient));
}
