// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   VIZ INSPECTOR GIT TRACKING — SPEC_VIZ_INSPECTOR_GIT_TRACKING_9_70

   Pure helpers para tracking git-like de alterações no modelo:
   - Commit (grupo de alterações)
   - Author tags (IA/user/system/import) §Q2
   - Diff computation
   - Revert por commit ou element §Q4
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Author types §Q2
// ──────────────────────────────────────────────────────────────────────

interface AuthorMetadata {
    id: string;
    label: string;
    icon: string;
    color: string;
}
type ElementSnapshot = Record<string, any>;
interface GitChange {
    elementId: string;
    changeType: string;
    before?: ElementSnapshot | null | undefined;
    after?: ElementSnapshot | null | undefined;
}
interface GitCommit {
    id: string;
    message: string;
    authorId: string;
    timestamp: string | number | Date;
    changes: GitChange[];
    isCheckpoint?: boolean;
    checkpointLabel?: string | null;
    snapshotElements?: ElementSnapshot[];
}
interface CommitFilters {
    authorId?: string;
    changeType?: string;
    elementId?: string;
}
interface ProvenanceChange {
    commit: Pick<GitCommit, 'id' | 'message' | 'authorId' | 'timestamp'> & {
        isCheckpoint: boolean;
        checkpointLabel: string | null;
    };
    author: AuthorMetadata | null;
    change: GitChange;
}

export const AUTHOR_TYPES = Object.freeze({
    AI: { id: 'ai', label: 'IA', icon: '🤖', color: '#a855f7' },
    USER: { id: 'user', label: 'Usuário', icon: '👤', color: '#3b82f6' },
    SYSTEM: { id: 'system', label: 'Sistema', icon: '⚙️', color: '#6b7280' },
    IMPORT: { id: 'import', label: 'Importação', icon: '🌍', color: '#10b981' },
});

export const AUTHOR_IDS = Object.freeze(Object.values(AUTHOR_TYPES).map((a) => a.id));

export const CHANGE_TYPES = Object.freeze(['added', 'modified', 'deleted', 'moved']);

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} authorId
 * @returns {boolean}
 */
export function isValidAuthor(authorId: string): boolean {
    return typeof authorId === 'string' && AUTHOR_IDS.includes(authorId);
}

/**
 * @param {string} changeType
 * @returns {boolean}
 */
export function isValidChangeType(changeType: string): boolean {
    return typeof changeType === 'string' && CHANGE_TYPES.includes(changeType);
}

/**
 * Valida shape de commit.
 * @param {GitCommit} commit - { id, message, authorId, timestamp, changes }
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCommit(commit: GitCommit): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!commit || typeof commit !== 'object') return { valid: false, errors: ['commit not object'] };
    if (!commit.id) errors.push('id required');
    if (!commit.message || typeof commit.message !== 'string') errors.push('message required');
    if (!isValidAuthor(commit.authorId)) errors.push(`authorId must be one of: ${AUTHOR_IDS.join(', ')}`);
    if (!Number.isFinite(new Date(commit.timestamp).getTime())) errors.push('timestamp invalid');
    if (!Array.isArray(commit.changes)) errors.push('changes must be array');
    return { valid: errors.length === 0, errors };
}

/**
 * @param {GitChange} change - { elementId, changeType, before?, after? }
 * @returns {boolean}
 */
export function isValidChange(change: GitChange): boolean {
    if (!change || typeof change !== 'object') return false;
    if (!change.elementId) return false;
    if (!isValidChangeType(change.changeType)) return false;
    return true;
}

// ──────────────────────────────────────────────────────────────────────
// Author metadata lookup
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} authorId
 * @returns {AuthorMetadata|null}
 */
export function getAuthorMetadata(authorId: string): AuthorMetadata | null {
    for (const author of Object.values(AUTHOR_TYPES)) {
        if (author.id === authorId) return author;
    }
    return null;
}

// ──────────────────────────────────────────────────────────────────────
// Diff computation
// ──────────────────────────────────────────────────────────────────────

/**
 * Compara dois elementos e retorna diff de propriedades.
 * Retorna só campos alterados.
 *
 * @param {ElementSnapshot} before
 * @param {ElementSnapshot} after
 * @returns {Record<string, { before: any, after: any }>}
 */
export function computePropertyDiff(
    before: ElementSnapshot,
    after: ElementSnapshot,
): Record<string, { before: any; after: any }> {
    const diff: Record<string, { before: any; after: any }> = {};
    if (!before || !after) return diff;
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
        const b = before[key];
        const a = after[key];
        if (!_deepEqual(b, a)) {
            diff[key] = { before: b, after: a };
        }
    }
    return diff;
}

/**
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function _deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        return a.every((v, i) => _deepEqual(v, b[i]));
    }
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => _deepEqual(a[k], b[k]));
}

// ──────────────────────────────────────────────────────────────────────
// Commit summary
// ──────────────────────────────────────────────────────────────────────

/**
 * Sumariza commit: counts por change type + author + message short.
 *
 * @param {GitCommit} commit
 * @returns {{ totalChanges: number, byType: Record<string, number>, author: AuthorMetadata|null, shortMessage: string }}
 */
export function summarizeCommit(commit: GitCommit): {
    totalChanges: number;
    byType: Record<string, number>;
    author: AuthorMetadata | null;
    shortMessage: string;
} {
    if (!validateCommit(commit).valid) {
        return { totalChanges: 0, byType: {}, author: null, shortMessage: '' };
    }
    const byType: Record<string, number> = {};
    for (const ct of CHANGE_TYPES) byType[ct] = 0;
    for (const change of commit.changes) {
        if (isValidChange(change)) byType[change.changeType]!++;
    }
    return {
        totalChanges: commit.changes.length,
        byType,
        author: getAuthorMetadata(commit.authorId),
        shortMessage: commit.message.length > 80 ? commit.message.slice(0, 77) + '...' : commit.message,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Revert (§Q4)
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa reverso de um commit (inverte changes).
 * added → deleted, deleted → added, modified → modified (swap before/after).
 *
 * @param {GitCommit} commit
 * @returns {GitChange[]} changes revertidas (array de change ops para aplicar)
 */
export function computeRevertOps(commit: GitCommit): GitChange[] {
    if (!validateCommit(commit).valid) return [];
    const reverts: GitChange[] = [];
    for (const c of commit.changes) {
        if (!isValidChange(c)) continue;
        if (c.changeType === 'added') {
            reverts.push({ elementId: c.elementId, changeType: 'deleted', before: c.after, after: null });
        } else if (c.changeType === 'deleted') {
            reverts.push({ elementId: c.elementId, changeType: 'added', before: null, after: c.before });
        } else if (c.changeType === 'modified') {
            reverts.push({ elementId: c.elementId, changeType: 'modified', before: c.after, after: c.before });
        } else if (c.changeType === 'moved') {
            reverts.push({
                elementId: c.elementId,
                changeType: 'moved',
                before: c.after,
                after: c.before,
            });
        }
    }
    return reverts;
}

/**
 * Reverte apenas 1 change específico de um commit (granular §Q4).
 *
 * @param {GitCommit} commit
 * @param {string} elementId
 * @returns {GitChange|null}
 */
export function revertSingleChange(commit: GitCommit, elementId: string): GitChange | null {
    if (!validateCommit(commit).valid) return null;
    const change = commit.changes.find((c) => c?.elementId === elementId && isValidChange(c));
    if (!change) return null;
    const all = computeRevertOps({ ...commit, changes: [change] });
    return all[0] || null;
}

// ──────────────────────────────────────────────────────────────────────
// Commit log filter
// ──────────────────────────────────────────────────────────────────────

/**
 * Filtra commits por author/changeType/elementId.
 *
 * @param {GitCommit[]} commits
 * @param {CommitFilters} filters - { authorId?, changeType?, elementId? }
 * @returns {GitCommit[]}
 */
export function filterCommits(commits: GitCommit[], filters: CommitFilters = {}): GitCommit[] {
    if (!Array.isArray(commits)) return [];
    return commits.filter((commit) => {
        if (!validateCommit(commit).valid) return false;
        if (filters.authorId && commit.authorId !== filters.authorId) return false;
        if (filters.changeType || filters.elementId) {
            const hasMatch = commit.changes.some((c) => {
                if (!isValidChange(c)) return false;
                if (filters.changeType && c.changeType !== filters.changeType) return false;
                if (filters.elementId && c.elementId !== filters.elementId) return false;
                return true;
            });
            if (!hasMatch) return false;
        }
        return true;
    });
}

// -----------------------------------------------------------------------------
// Pure state replay + provenance helpers
// -----------------------------------------------------------------------------

/**
 * @template T
 * @param {T} element
 * @returns {T}
 */
function _clone<T>(value: T): T {
    if (value === undefined) return undefined as T;
    return JSON.parse(JSON.stringify(value));
}

/**
 * @param {ElementSnapshot|null|undefined} element
 * @returns {string|null}
 */
function _elementId(element: ElementSnapshot | null | undefined): string | null {
    return element?.id ?? element?.elementId ?? element?.element_id ?? null;
}

/**
 * @param {ElementSnapshot[]} elements
 * @returns {ElementSnapshot[]}
 */
function _cloneElements(elements: ElementSnapshot[]): ElementSnapshot[] {
    if (!Array.isArray(elements)) return [];
    return elements.map((element) => _clone(element));
}

/**
 * @param {GitCommit} commit
 * @param {GitChange} change
 * @returns {ProvenanceChange}
 */
function _changeRecord(commit: GitCommit, change: GitChange): ProvenanceChange {
    return {
        commit: {
            id: commit.id,
            message: commit.message,
            authorId: commit.authorId,
            timestamp: commit.timestamp,
            isCheckpoint: Boolean(commit.isCheckpoint),
            checkpointLabel: commit.checkpointLabel ?? null,
        },
        author: getAuthorMetadata(commit.authorId),
        change: _clone(change),
    };
}

/**
 * Applies one git-like change operation to an immutable element-state snapshot.
 *
 * @param {ElementSnapshot[]} elements
 * @param {GitChange} change
 * @returns {ElementSnapshot[]}
 */
export function applyChangeToState(elements: ElementSnapshot[], change: GitChange): ElementSnapshot[] {
    const next = _cloneElements(elements);
    if (!isValidChange(change)) return next;

    const elementId = change.elementId;
    const existingIndex = next.findIndex((element) => _elementId(element) === elementId);

    if (change.changeType === 'deleted') {
        if (existingIndex !== -1) next.splice(existingIndex, 1);
        return next;
    }

    if (change.after == null) return next;

    const after = _clone(change.after);
    if (_elementId(after) == null) after.id = elementId;

    if (existingIndex === -1) {
        next.push(after);
    } else {
        next[existingIndex] = after;
    }

    return next;
}

/**
 * Replays valid commits over an initial element snapshot.
 *
 * @param {ElementSnapshot[]} initialElements
 * @param {GitCommit[]} commits
 * @returns {ElementSnapshot[]}
 */
export function replayCommits(
    initialElements: ElementSnapshot[] = [],
    commits: GitCommit[] = [],
): ElementSnapshot[] {
    let state = _cloneElements(initialElements);
    if (!Array.isArray(commits)) return state;

    for (const commit of commits) {
        if (!validateCommit(commit).valid) continue;
        for (const change of commit.changes) {
            state = applyChangeToState(state, change);
        }
    }

    return state;
}

/**
 * Restores state to a checkpoint commit by replaying through that commit.
 * If the checkpoint carries snapshotElements, that snapshot is returned directly.
 *
 * @param {ElementSnapshot[]} initialElements
 * @param {GitCommit[]} commits
 * @param {string} checkpointId
 * @returns {ElementSnapshot[]}
 */
export function restoreToCheckpoint(
    initialElements: ElementSnapshot[] = [],
    commits: GitCommit[] = [],
    checkpointId: string,
): ElementSnapshot[] {
    if (!Array.isArray(commits)) return _cloneElements(initialElements);
    const checkpointIndex = commits.findIndex((commit) => commit?.id === checkpointId && validateCommit(commit).valid);
    if (checkpointIndex === -1) return replayCommits(initialElements, commits);

    const checkpoint = commits[checkpointIndex] as GitCommit;
    if (Array.isArray(checkpoint.snapshotElements)) {
        return _cloneElements(checkpoint.snapshotElements);
    }

    return replayCommits(initialElements, commits.slice(0, checkpointIndex + 1));
}

/**
 * Groups one commit's changes into diff buckets suitable for a unified viewer.
 *
 * @param {GitCommit} commit
 * @returns {{ added: GitChange[], modified: GitChange[], deleted: GitChange[], moved: GitChange[], affectedElementIds: string[] }}
 */
export function computeCommitDiff(commit: GitCommit): {
    added: GitChange[];
    modified: GitChange[];
    deleted: GitChange[];
    moved: GitChange[];
    affectedElementIds: string[];
} {
    const diff: {
        added: GitChange[];
        modified: GitChange[];
        deleted: GitChange[];
        moved: GitChange[];
        affectedElementIds: string[];
    } = {
        added: [],
        modified: [],
        deleted: [],
        moved: [],
        affectedElementIds: [],
    };
    if (!validateCommit(commit).valid) return diff;

    const affected: Set<string> = new Set();
    for (const change of commit.changes) {
        if (!isValidChange(change)) continue;
        if (!CHANGE_TYPES.includes(change.changeType)) continue;
        const bucket = diff[change.changeType as 'added' | 'modified' | 'deleted' | 'moved'];
        if (Array.isArray(bucket)) bucket.push(_clone(change));
        affected.add(change.elementId);
    }

    diff.affectedElementIds = [...affected];
    return diff;
}

/**
 * Returns chronological provenance for one element across a commit list.
 *
 * @param {GitCommit[]} commits
 * @param {string} elementId
 * @returns {{ elementId: string, createdInCommit: ProvenanceChange['commit']|null, lastChangedInCommit: ProvenanceChange['commit']|null, changes: ProvenanceChange[] }}
 */
export function getElementProvenance(
    commits: GitCommit[] = [],
    elementId: string,
): {
    elementId: string;
    createdInCommit: ProvenanceChange['commit'] | null;
    lastChangedInCommit: ProvenanceChange['commit'] | null;
    changes: ProvenanceChange[];
} {
    const changes: ProvenanceChange[] = [];
    if (!Array.isArray(commits) || !elementId) {
        return { elementId, createdInCommit: null, lastChangedInCommit: null, changes };
    }

    for (const commit of commits) {
        if (!validateCommit(commit).valid) continue;
        for (const change of commit.changes) {
            if (!isValidChange(change) || change.elementId !== elementId) continue;
            changes.push(_changeRecord(commit, change));
        }
    }

    const created = changes.find((entry) => entry.change.changeType === 'added') ?? null;
    const last = changes.length > 0 ? changes[changes.length - 1] : null;

    return {
        elementId,
        createdInCommit: created?.commit ?? null,
        lastChangedInCommit: last?.commit ?? null,
        changes,
    };
}

/**
 * Returns the latest valid change for an element, equivalent to lightweight blame.
 *
 * @param {GitCommit[]} commits
 * @param {string} elementId
 * @returns {ProvenanceChange|null}
 */
export function getCommitBlame(commits: GitCommit[] = [], elementId: string): ProvenanceChange | null {
    const provenance = getElementProvenance(commits, elementId);
    return provenance.changes.at(-1) ?? null;
}
