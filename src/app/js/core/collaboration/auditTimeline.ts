// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Audit timeline view-model for the collaboration journey.
 *
 * Pure helpers only: no DOM, no storage, no network. UI code can render the
 * returned rows directly and wire the provenance export request to ECBT Type B.
 */

function cloneValue( value: any) {
    if (value == null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
}

function freezeDiff( diff: any) {
    const freezeItem = ( item: any) => {
        const cloned = cloneValue(item);
        return cloned && typeof cloned === 'object' ? Object.freeze(cloned) : cloned;
    };
    return Object.freeze({
        added: Object.freeze(diff.added.map(freezeItem)),
        removed: Object.freeze(diff.removed.map(freezeItem)),
        changed: Object.freeze(diff.changed.map(freezeItem)),
    });
}

function summarizeBeforeAfter( before: any, after: any) {
    const added = [];
    const removed = [];
    const changed = [];
    const beforeObj = before && typeof before === 'object' ? before : {};
    const afterObj = after && typeof after === 'object' ? after : {};
    const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

    for (const key of keys) {
        const hasBefore = Object.prototype.hasOwnProperty.call(beforeObj, key);
        const hasAfter = Object.prototype.hasOwnProperty.call(afterObj, key);
        if (!hasBefore && hasAfter) {
            added.push({ field: key, value: cloneValue(afterObj[key]) });
        } else if (hasBefore && !hasAfter) {
            removed.push({ field: key, value: cloneValue(beforeObj[key]) });
        } else if (JSON.stringify(beforeObj[key]) !== JSON.stringify(afterObj[key])) {
            changed.push({ field: key, from: cloneValue(beforeObj[key]), to: cloneValue(afterObj[key]) });
        }
    }

    return { added, removed, changed };
}

/**
 * Summarize common audit payload shapes into UI-ready diff buckets.
 *
 * Supported payloads:
 * - { before, after }
 * - { field, from, to }
 * - { added:[], removed:[], changed:[] }
 *
 * @param {object|null} payload
 * @returns {{added:ReadonlyArray<object>,removed:ReadonlyArray<object>,changed:ReadonlyArray<object>}}
 */
export function summarizeAuditPayload(payload: object|null): {added:ReadonlyArray<object>,removed:ReadonlyArray<object>,changed:ReadonlyArray<object>} {
    if (!payload || typeof payload !== 'object') {
        return freezeDiff({ added: [], removed: [], changed: [] });
    }
    const p = (payload) as any;
    if (Array.isArray(p.added) || Array.isArray(p.removed) || Array.isArray(p.changed)) {
        return freezeDiff({
            added: p.added || [],
            removed: p.removed || [],
            changed: p.changed || [],
        });
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'before') || Object.prototype.hasOwnProperty.call(payload, 'after')) {
        return freezeDiff(summarizeBeforeAfter(p.before, p.after));
    }
    if (p.field && Object.prototype.hasOwnProperty.call(payload, 'from')) {
        return freezeDiff({
            added: [],
            removed: [],
            changed: [{ field: p.field, from: cloneValue(p.from), to: cloneValue(p.to) }],
        });
    }
    return freezeDiff({ added: [], removed: [], changed: [] });
}

function buildTitle( entry: any) {
    const actor = entry.actorName || entry.actorId || 'Unknown actor';
    const action = entry.action || 'event';
    const type = entry.resourceType || 'resource';
    const id = entry.resourceId || 'unknown';
    return `${actor} ${action} ${type} ${id}`;
}

function buildSummary( diff: any) {
    const parts = [];
    if (diff.added.length) parts.push(`${diff.added.length} added`);
    if (diff.removed.length) parts.push(`${diff.removed.length} removed`);
    if (diff.changed.length) parts.push(`${diff.changed.length} changed`);
    return parts.length ? parts.join(', ') : 'No field diff';
}

/**
 * Convert audit log entries into sorted, frozen timeline rows.
 *
 * @param {ReadonlyArray<object>} entries
 * @param {{sort?:'asc'|'desc'}} [opts]
 * @returns {ReadonlyArray<object>}
 */
export function buildAuditTimeline(entries: ReadonlyArray<object>, opts: {sort?:'asc'|'desc'} = {}): ReadonlyArray<object> {
    if (!Array.isArray(entries)) throw new Error('buildAuditTimeline: entries array required');
    const rows = entries.map((entry, index) => {
        const diff = summarizeAuditPayload(entry.payload);
        const row = {
            id: `audit-${entry.seq ?? index}`,
            seq: entry.seq ?? index,
            timestamp: entry.timestamp ?? 0,
            actorId: entry.actorId ?? null,
            actorName: entry.actorName || entry.actorId || 'Unknown actor',
            action: entry.action || 'event',
            resourceType: entry.resourceType ?? null,
            resourceId: entry.resourceId ?? null,
            title: buildTitle(entry),
            summary: buildSummary(diff),
            diff,
            hash: entry.hash ?? null,
            prevHash: entry.prevHash ?? null,
            hasDiff: diff.added.length + diff.removed.length + diff.changed.length > 0,
        };
        return Object.freeze(row);
    });

    rows.sort((a, b) => {
        const byTime = a.timestamp - b.timestamp;
        const bySeq = a.seq - b.seq;
        return opts.sort === 'desc' ? -(byTime || bySeq) : byTime || bySeq;
    });
    return Object.freeze(rows);
}

/**
 * Filter timeline rows for the audit viewer.
 *
 * @param {ReadonlyArray<object>} timeline
 * @param {{actorId?:string,action?:string,resourceType?:string,resourceId?:string}} [filter]
 * @returns {ReadonlyArray<object>}
 */
export function filterAuditTimeline(timeline: ReadonlyArray<object>, filter: {actorId?:string,action?:string,resourceType?:string,resourceId?:string} = {}): ReadonlyArray<object> {
    if (!Array.isArray(timeline)) throw new Error('filterAuditTimeline: timeline array required');
    const rows = timeline.filter((row) => {
        if (filter.actorId && row.actorId !== filter.actorId) return false;
        if (filter.action && row.action !== filter.action) return false;
        if (filter.resourceType && row.resourceType !== filter.resourceType) return false;
        if (filter.resourceId && row.resourceId !== filter.resourceId) return false;
        return true;
    });
    return Object.freeze(rows);
}

/**
 * Compact counts for audit viewer headers.
 *
 * @param {ReadonlyArray<object>} timeline
 * @returns {{entryCount:number,actorCount:number,changedFields:number,lastHash:string|null}}
 */
export function summarizeAuditTimeline(timeline: ReadonlyArray<object>): {entryCount:number,actorCount:number,changedFields:number,lastHash:string|null} {
    if (!Array.isArray(timeline)) throw new Error('summarizeAuditTimeline: timeline array required');
    const actors = new Set();
    let changedFields = 0;
    for (const row of timeline) {
        if (row.actorId != null) actors.add(row.actorId);
        changedFields += row.diff.added.length + row.diff.removed.length + row.diff.changed.length;
    }
    const last = timeline[timeline.length - 1] || null;
    return Object.freeze({
        entryCount: timeline.length,
        actorCount: actors.size,
        changedFields,
        lastHash: last ? last.hash : null,
    });
}

/**
 * Build a pure request object for the ECBT Type B provenance export adapter.
 *
 * @param {ReadonlyArray<object>} timeline
 * @param {{modelId:string,requestedBy:string,includeHashes?:boolean}} args
 * @returns {object}
 */
export function buildProvenanceExportRequest(timeline: ReadonlyArray<object>, args: {modelId:string,requestedBy:string,includeHashes?:boolean}): object {
    if (!Array.isArray(timeline)) throw new Error('buildProvenanceExportRequest: timeline array required');
    if (!args || !args.modelId || !args.requestedBy) {
        throw new Error('buildProvenanceExportRequest: modelId and requestedBy required');
    }
    return Object.freeze({
        type: 'ecbt-type-b-provenance',
        modelId: args.modelId,
        requestedBy: args.requestedBy,
        includeHashes: args.includeHashes !== false,
        entryCount: timeline.length,
        firstSeq: timeline.length ? timeline[0].seq : null,
        lastSeq: timeline.length ? timeline[timeline.length - 1].seq : null,
        lastHash: timeline.length ? timeline[timeline.length - 1].hash : null,
        entries: Object.freeze(
            timeline.map((row) =>
                Object.freeze({
                    seq: row.seq,
                    action: row.action,
                    resourceType: row.resourceType,
                    resourceId: row.resourceId,
                    hash: args.includeHashes === false ? null : row.hash,
                }),
            ),
        ),
    });
}
