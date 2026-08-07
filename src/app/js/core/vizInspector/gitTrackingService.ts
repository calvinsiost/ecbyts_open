// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// @ts-check
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Runtime service facade for SPEC_VIZ_INSPECTOR_GIT_TRACKING_9_70.
 *
 * Keeps the browser-facing API stable while delegating persistence to the
 * existing IndexedDB tracker and diff/replay math to core/viz/gitTracking.js.
 */

import { CHANGE_STATUS } from './auditSchema.js';
import { getCommitHistory, recordCommit, updateCommitStatus } from './changeTracker.js';
import { computeCommitDiff, computeRevertOps, filterCommits, getCommitBlame, getElementProvenance, restoreToCheckpoint } from '../viz/gitTracking.js';

/**
 * @typedef {{elementId?: string, element_id?: string, id?: string, targetId?: string, changeType?: string, action?: string, type?: string, before?: any, previous_state?: any, previousState?: any, from?: any, after?: any, new_state?: any, newState?: any, to?: any, [key: string]: any}} GitChangeInput
 * @typedef {{id?: string, hash?: string, commit_hash?: string, message?: string, checkpointLabel?: string, checkpoint_description?: string, timestamp?: string|number, created_at?: string, author?: string, authorId?: string, author_type?: string, status?: string, changes?: GitChangeInput[], isCheckpoint?: boolean, snapshotElements?: any[], [key: string]: any}} GitCommitInput
 * @typedef {{author?: string, authorId?: string, status?: string, limit?: number, elementId?: string, changeType?: string, newestFirst?: boolean}} GitHistoryOptions
 */

const CHANGE_TYPE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
    add: 'added',
    added: 'added',
    create: 'added',
    created: 'added',
    remove: 'deleted',
    removed: 'deleted',
    delete: 'deleted',
    deleted: 'deleted',
    modify: 'modified',
    modified: 'modified',
    update: 'modified',
    updated: 'modified',
    move: 'moved',
    moved: 'moved',
});

/** @param {string|number|undefined|null} value */
function _timestamp(value: any) {
    if (typeof value === 'number') return value;
    const time = value == null ? NaN : new Date(value).getTime();
    return Number.isFinite(time) ? time : Date.now();
}

/** @param {any} value */
function _normalizeChangeType(value: any) {
    if (!value) return 'modified';
    return CHANGE_TYPE_ALIASES[String(value).toLowerCase()] ?? String(value).toLowerCase();
}

function _pickElementId(change: any): string {
    return change.elementId ?? change.element_id ?? change.id ?? change.targetId ?? '';
}

function _pickChangeType(change: any): string {
    return _normalizeChangeType(change.changeType ?? change.action ?? change.type);
}

function _pickBeforeState(change: any): any {
    return change.before ?? change.previous_state ?? change.previousState ?? change.from ?? null;
}

function _pickAfterState(change: any): any {
    return change.after ?? change.new_state ?? change.newState ?? change.to ?? null;
}

/** @param {GitChangeInput} [change] */
function _normalizeChange(change: any = {}) {
    const elementId = _pickElementId(change);
    const changeType = _pickChangeType(change);
    return {
        ...change,
        elementId,
        element_id: change.element_id ?? elementId,
        changeType,
        action: change.action ?? changeType,
        before: _pickBeforeState(change),
        after: _pickAfterState(change),
    };
}

function _resolveCommitId(commit: any): string {
    return commit.id ?? commit.hash ?? commit.commit_hash ?? crypto.randomUUID();
}

function _resolveCommitHash(commit: any, id: string): string {
    return commit.hash ?? commit.commit_hash ?? id;
}

function _resolveAuthorId(commit: any): string {
    return commit.authorId ?? commit.author ?? commit.author_type ?? 'user';
}

function _resolveCommitMessage(commit: any): string {
    return commit.message ?? commit.checkpointLabel ?? commit.checkpoint_description ?? '';
}

function _normalizeCommitChanges(changes: any): any[] {
    return Array.isArray(changes) ? changes.map(_normalizeChange) : [];
}

function _resolveCheckpointLabel(commit: any): string | null {
    return commit.checkpointLabel ?? commit.checkpoint_description ?? null;
}

function _buildNormalizedCommit(
    commit: any,
    {
        id,
        hash,
        timestamp,
        authorId,
        message,
    }: {
        id: string;
        hash: string;
        timestamp: number;
        authorId: string;
        message: string;
    },
) {
    return {
        ...commit,
        id,
        hash,
        commit_hash: hash,
        message,
        author: authorId,
        authorId,
        author_type: authorId,
        timestamp,
        created_at: commit.created_at ?? new Date(timestamp).toISOString(),
        status: commit.status ?? CHANGE_STATUS.UNSEEN,
        changes: _normalizeCommitChanges(commit.changes),
        isCheckpoint: Boolean(commit.isCheckpoint),
        checkpointLabel: _resolveCheckpointLabel(commit),
        snapshotElements: Array.isArray(commit.snapshotElements) ? commit.snapshotElements : undefined,
    };
}

/** @param {GitCommitInput} [commit] */
export function normalizeGitCommit(commit: any = {}) {
    const timestamp = _timestamp(commit.timestamp ?? commit.created_at);
    const authorId = _resolveAuthorId(commit);
    const id = _resolveCommitId(commit);
    const hash = _resolveCommitHash(commit, id);
    const message = _resolveCommitMessage(commit);

    return _buildNormalizedCommit(commit, { id, hash, timestamp, authorId, message });
}

/** @param {GitCommitInput} commitData */
export async function createCommit(commitData: any) {
    return recordCommit(normalizeGitCommit(commitData));
}

/** @param {GitCommitInput} [checkpoint] */
export async function createCheckpoint({
    message,
    checkpointLabel,
    snapshotElements,
    ...rest
}: any = {}) {
    const label = checkpointLabel ?? message ?? 'Manual checkpoint';
    return createCommit({
        ...rest,
        message: label,
        checkpointLabel: label,
        isCheckpoint: true,
        snapshotElements,
        changes: rest.changes ?? [],
    });
}

export async function getHistory({
    author,
    authorId,
    status,
    limit = 50,
    elementId,
    changeType,
    newestFirst = true
}: any = /** @type {GitHistoryOptions} */ ({})) {
    const persisted = await getCommitHistory({
        author: author ?? authorId,
        status,
        limit: Number.isFinite(limit) ? limit : Infinity,
    });
    const normalized = /** @type {GitCommitInput[]} */ (persisted).map(normalizeGitCommit);
    const filterPayload: Record<string, unknown> = {
        authorId: authorId ?? author,
        elementId,
    };
    if (changeType) {
        filterPayload.changeType = _normalizeChangeType(changeType);
    }
    const filtered = filterCommits(normalized, filterPayload);
    return newestFirst ? filtered : [...filtered].reverse();
}

/** @param {GitCommitInput|string} commitOrId */
async function _resolveCommit(commitOrId: any) {
    if (commitOrId && typeof commitOrId === 'object') return normalizeGitCommit(commitOrId);
    const commits = await getHistory({ limit: Infinity });
    return commits.find((/** @type {GitCommitInput} */ commit: any) => commit.id === commitOrId || commit.hash === commitOrId) ?? null;
}

/** @param {GitCommitInput|string} commitOrId */
export async function getDiff(commitOrId: any) {
    const commit = await _resolveCommit(commitOrId);
    return commit ? computeCommitDiff(commit) : computeCommitDiff(null as any);
}

/**
 * @param {GitCommitInput|string} commitOrId
 * @param {{markReverted?: boolean}} [options]
 */
export async function revertCommit(commitOrId: any, { markReverted = false } = {}) {
    const commit = await _resolveCommit(commitOrId);
    if (!commit) {
        return { targetCommit: null, revertOps: [], preview: { added: 0, modified: 0, deleted: 0, moved: 0 } };
    }

    const revertOps = computeRevertOps(commit);
    if (markReverted) await updateCommitStatus(commit.id, CHANGE_STATUS.REVERTED);

    return {
        targetCommit: commit,
        revertOps,
        preview: revertOps.reduce(
            (/** @type {Record<string, number>} */ acc: any, /** @type {{changeType: string}} */ op: any) => {
                acc[op.changeType] = (acc[op.changeType] ?? 0) + 1;
                return acc;
            },
            { added: 0, modified: 0, deleted: 0, moved: 0 },
        ),
    };
}

/**
 * @param {any[]} [initialElements]
 * @param {string} [checkpointId]
 */
export async function restoreCheckpointState(initialElements = [], checkpointId: any) {
    const commits = await getHistory({ limit: Infinity, newestFirst: false });
    return restoreToCheckpoint(initialElements, commits, checkpointId);
}

/** @param {string} elementId */
export async function getElementProvenanceFromHistory(elementId: any) {
    const commits = await getHistory({ limit: Infinity, newestFirst: false });
    return getElementProvenance(commits, elementId);
}

/** @param {string} elementId */
export async function getCommitBlameFromHistory(elementId: any) {
    const commits = await getHistory({ limit: Infinity, newestFirst: false });
    return getCommitBlame(commits, elementId);
}
