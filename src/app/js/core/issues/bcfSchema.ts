// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * BCF-like Issues Schema (P1-82)
 * Pure schema for BIM Collaboration Format issues + Bug Bounty tiers.
 * No I/O, no DOM - fully testable in Node.
 */

export const ISSUE_TYPES = Object.freeze({
    NON_CONFORMITY: 'non_conformity',
    QUESTION: 'question',
    SUGGESTION: 'suggestion',
    BUG: 'bug',
    INFO: 'info',
});

export const ISSUE_STATUS = Object.freeze({
    OPEN: 'open',
    IN_REVIEW: 'in_review',
    RESOLVED: 'resolved',
    CLOSED: 'closed',
    VERIFIED: 'verified',
});

export const ISSUE_PRIORITY = Object.freeze({
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
});

export const BOUNTY_TIERS = Object.freeze({
    NONE: 0,
    BRONZE: 50,
    SILVER: 200,
    GOLD: 500,
    PLATINUM: 1500,
});

const VALID_TYPE_VALUES: Set<string> = new Set(Object.values(ISSUE_TYPES));
const VALID_STATUS_VALUES: Set<string> = new Set(Object.values(ISSUE_STATUS));
const VALID_PRIORITY_VALUES: Set<number> = new Set(Object.values(ISSUE_PRIORITY));
const VALID_BOUNTY_VALUES: Set<number> = new Set(Object.values(BOUNTY_TIERS));

const STATUS_TRANSITIONS = Object.freeze({
    [ISSUE_STATUS.OPEN]: [ISSUE_STATUS.IN_REVIEW, ISSUE_STATUS.CLOSED],
    [ISSUE_STATUS.IN_REVIEW]: [ISSUE_STATUS.RESOLVED, ISSUE_STATUS.OPEN],
    [ISSUE_STATUS.RESOLVED]: [ISSUE_STATUS.VERIFIED, ISSUE_STATUS.IN_REVIEW],
    [ISSUE_STATUS.VERIFIED]: [ISSUE_STATUS.CLOSED],
    [ISSUE_STATUS.CLOSED]: [ISSUE_STATUS.OPEN],
});

export interface IssueComment {
    id?: string;
    text: string;
    author?: string | null;
    createdAt?: string;
}

export interface IssuePosition {
    x: number;
    y: number;
    z?: number;
}

export interface IssueOptions {
    id?: string;
    status?: string;
    priority?: number;
    position?: IssuePosition | null;
    viewpoint?: any;
    bounty?: number;
    reportedBy?: string | null;
    reportedAt?: string;
    comments?: ReadonlyArray<IssueComment>;
}

export interface Issue {
    id: string;
    type: string;
    title: string;
    description: string;
    status: string;
    priority: number;
    position: IssuePosition | null;
    viewpoint: any;
    bounty: number;
    reportedBy: string | null;
    reportedAt: string;
    comments: ReadonlyArray<IssueComment>;
}

export interface IssueFilterCriteria {
    type?: string;
    status?: string;
    priority?: number;
    minBounty?: number;
    dateFrom?: string | number | Date;
    dateTo?: string | number | Date;
}

let _idCounter = 0;
function _nextId(prefix: string): string {
    _idCounter += 1;
    return `${prefix}_${Date.now().toString(36)}_${_idCounter.toString(36)}`;
}

function _validateType(type: string): void {
    if (!VALID_TYPE_VALUES.has(type)) {
        throw new Error(`Invalid issue type: ${type}`);
    }
}

function _validateTitle(title: string): void {
    if (typeof title !== 'string' || title.trim() === '') {
        throw new Error('Issue title must be a non-empty string');
    }
}

function _validateIssueFields(issue: Issue): void {
    if (!VALID_STATUS_VALUES.has(issue.status)) {
        throw new Error(`Invalid status: ${issue.status}`);
    }
    if (!VALID_PRIORITY_VALUES.has(issue.priority)) {
        throw new Error(`Invalid priority: ${issue.priority}`);
    }
    if (!VALID_BOUNTY_VALUES.has(issue.bounty)) {
        throw new Error(`Invalid bounty value: ${issue.bounty}`);
    }
}

function _freezeComments(comments: ReadonlyArray<IssueComment> | undefined): ReadonlyArray<IssueComment> {
    return Object.freeze([...(comments || [])].map((c) => Object.freeze({ ...c })));
}

function _buildIssue(type: string, title: string, description: string, opts: IssueOptions): Issue {
    return {
        id: opts.id || _nextId('issue'),
        type,
        title,
        description: description || '',
        status: opts.status || ISSUE_STATUS.OPEN,
        priority: opts.priority || ISSUE_PRIORITY.MEDIUM,
        position: opts.position || null,
        viewpoint: opts.viewpoint || null,
        bounty: opts.bounty != null ? opts.bounty : BOUNTY_TIERS.NONE,
        reportedBy: opts.reportedBy || null,
        reportedAt: opts.reportedAt || new Date().toISOString(),
        comments: _freezeComments(opts.comments),
    };
}

function _incrementCounter(map: Record<string, number>, key: string): void {
    map[key] = (map[key] || 0) + 1;
}

function _bountyIsAvailable(status: string): boolean {
    return status !== ISSUE_STATUS.CLOSED && status !== ISSUE_STATUS.VERIFIED;
}

function _computeOpenAgeDays(reportedAt: string, now: number): number {
    const t = new Date(reportedAt).getTime();
    if (isNaN(t)) return 0;
    return (now - t) / (1000 * 60 * 60 * 24);
}

function _matchesIssueCriteria(i: Issue, c: IssueFilterCriteria): boolean {
    if (c.type != null && i.type !== c.type) return false;
    if (c.status != null && i.status !== c.status) return false;
    if (c.priority != null && i.priority !== c.priority) return false;
    if (c.minBounty != null && i.bounty < c.minBounty) return false;
    return true;
}

function _timestampIsInRange(reportedAt: string, from: number | null, to: number | null): boolean {
    const t = new Date(reportedAt).getTime();
    if (isNaN(t)) return false;
    if (from != null && t < from) return false;
    if (to != null && t > to) return false;
    return true;
}

/**
 * Create a frozen issue.
 */
export function createIssue(
    type: string,
    title: string,
    description: string,
    options: IssueOptions = {},
): Readonly<Issue> {
    _validateType(type);
    _validateTitle(title);
    const opts = options || {};
    const issue = _buildIssue(type, title, description, opts);
    _validateIssueFields(issue);
    return Object.freeze(issue);
}

/**
 * Append a comment, returning a new immutable issue.
 */
export function addComment(issue: Issue, comment: IssueComment): Readonly<Issue> {
    if (!issue || typeof issue !== 'object') {
        throw new Error('Invalid issue');
    }
    if (!comment || typeof comment !== 'object') {
        throw new Error('Invalid comment');
    }
    if (typeof comment.text !== 'string' || comment.text.trim() === '') {
        throw new Error('Comment text must be a non-empty string');
    }
    const newComment = Object.freeze({
        id: comment.id || _nextId('cmt'),
        text: comment.text,
        author: comment.author || null,
        createdAt: comment.createdAt || new Date().toISOString(),
    });
    const next = {
        ...issue,
        comments: Object.freeze([...issue.comments, newComment]),
    };
    return Object.freeze(next);
}

/**
 * Validate + apply status transition. Throws on invalid.
 */
export function transitionStatus(issue: Issue, newStatus: string): Readonly<Issue> {
    if (!VALID_STATUS_VALUES.has(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}`);
    }
    const transitions = STATUS_TRANSITIONS as Record<string, string[]>;
    const allowed = transitions[issue.status] || [];
    if (!allowed.includes(newStatus)) {
        throw new Error(`Invalid transition: ${issue.status} -> ${newStatus}`);
    }
    return Object.freeze({ ...issue, status: newStatus, comments: issue.comments });
}

/**
 * Assign a bounty tier. Throws if tier value not in BOUNTY_TIERS.
 */
export function assignBountyTier(issue: Issue, tier: number): Readonly<Issue> {
    if (!VALID_BOUNTY_VALUES.has(tier)) {
        throw new Error(`Invalid bounty tier: ${tier}`);
    }
    return Object.freeze({ ...issue, bounty: tier, comments: issue.comments });
}

/**
 * Numeric score for ranking.
 */
export function computeIssueScore(issue: Issue): number {
    return issue.priority * 10 + issue.bounty / 100;
}

/**
 * Filter issues. criteria={type?, status?, priority?, minBounty?, dateFrom?, dateTo?}
 */
export function filterIssues(issues: ReadonlyArray<Issue>, criteria: IssueFilterCriteria = {}): Issue[] {
    if (!Array.isArray(issues)) return [];
    const c = criteria || {};
    const from = c.dateFrom ? new Date(c.dateFrom).getTime() : null;
    const to = c.dateTo ? new Date(c.dateTo).getTime() : null;
    return issues.filter((i: Issue) => {
        if (!_matchesIssueCriteria(i, c)) return false;
        if (from == null && to == null) return true;
        return _timestampIsInRange(i.reportedAt, from, to);
    });
}

/**
 * Summarize backlog: counts by type/status/priority + total bounty + oldest open age in days.
 */
export function summarizeIssueBacklog(issues: ReadonlyArray<Issue>): {
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    totalBountyAvailable: number;
    oldestOpenAge: number;
} {
    const safe = Array.isArray(issues) ? issues : [];
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let totalBountyAvailable = 0;
    let oldestOpenAge = 0;
    const now = Date.now();

    for (const i of safe) {
        _incrementCounter(byType, i.type);
        _incrementCounter(byStatus, i.status);
        _incrementCounter(byPriority, String(i.priority));
        if (_bountyIsAvailable(i.status)) {
            totalBountyAvailable += i.bounty || 0;
        }
        if (i.status === ISSUE_STATUS.OPEN) {
            const ageDays = _computeOpenAgeDays(i.reportedAt, now);
            if (ageDays > oldestOpenAge) oldestOpenAge = ageDays;
        }
    }

    return {
        total: safe.length,
        byType,
        byStatus,
        byPriority,
        totalBountyAvailable,
        oldestOpenAge,
    };
}
