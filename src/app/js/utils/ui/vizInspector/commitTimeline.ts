// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   COMMIT TIMELINE — Viz Inspector Git Tracking MVP
   Lista vertical de commits agrupados por data com filtros e ações.
   ================================================================ */
import { t } from '../../i18n/translations.js';
import { escapeHtml } from '../../helpers/html.js';
// ── Constants ─────────────────────────────────────────────────────────────────
const AUTHOR_AVATARS = Object.freeze({
    user: '👤',
    ai: '🤖',
    system: '⚙️',
    import: '🌍',
});
const STATUS_INDICATORS = Object.freeze({
    unseen: '🔵',
    accepted: '🟢',
    partiallyReverted: '⚠️',
    reverted: '↩',
});
const DATE_BUCKETS = Object.freeze([
    { key: 'today', labelKey: 'commitTimeline.today', test: (d: any) => _isSameDay(d, new Date()) },
    {
        key: 'yesterday',
        labelKey: 'commitTimeline.yesterday',
        test: (d: any) => _isSameDay(d, _addDays(new Date(), -1)),
    },
    { key: 'thisWeek', labelKey: 'commitTimeline.thisWeek', test: (d: any) => _isThisWeek(d) },
    { key: 'older', labelKey: 'commitTimeline.older', test: () => true },
]);
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Render a commit timeline into a container.
 * @param {HTMLElement} container
 * @param {Array<Object>} commits
 * @param {Object} [options]
 * @param {Function} [options.onSelect]
 * @param {Function} [options.onRevert]
 * @param {string} [options.filter]
 * @returns {HTMLElement} The timeline root element
 */
export function renderCommitTimeline(container: any, commits: any, options: any = {}) {
    if (!container) {
        throw new TypeError('renderCommitTimeline requires a container element');
    }
    const { onSelect, onRevert, filter } = options;
    const normalizedCommits = normalizeTimelineCommits(commits);
    const filtered = filter ? filterCommits(normalizedCommits, filter) : normalizedCommits;
    const root = document.createElement('div');
    root.className = 'vi-commit-timeline';
    root.setAttribute('role', 'list');
    root.setAttribute('aria-label', t('vizInspector.historyTab') || 'History');
    const groups = (_groupByDateBucket(filtered)) as Record<string, any[]>;
    for (const bucket of DATE_BUCKETS) {
        const group = groups[bucket.key];
        if (!group || group.length === 0)
            continue;
        const section = document.createElement('div');
        section.className = 'vi-timeline-section';
        section.dataset.bucket = bucket.key;
        const header = document.createElement('h4');
        header.className = 'vi-timeline-header';
        header.textContent = t(bucket.labelKey) || bucket.key;
        section.appendChild(header);
        const list = document.createElement('ul');
        list.className = 'vi-timeline-list';
        for (const commit of group) {
            const item = _renderCommitItem(commit, onSelect, onRevert);
            list.appendChild(item);
        }
        section.appendChild(list);
        root.appendChild(section);
    }
    if (root.children.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'vi-timeline-empty';
        empty.textContent = t('commitTimeline.empty') || 'No commits found';
        root.appendChild(empty);
    }
    container.appendChild(root);
    return root;
}
/**
 * Filter commits by author type or change type.
 * @param {Array<Object>} commits
 * @param {string} filter - 'user' | 'ai' | 'system' | 'import' | string keyword
 * @returns {Array<Object>}
 */
export function filterCommits(commits: any, filter: any) {
    if (!filter || !commits)
        return commits || [];
    const f = filter.toLowerCase().trim();
    return normalizeTimelineCommits(commits).filter((c: any) => {
        if (c.author_type && c.author_type.toLowerCase() === f)
            return true;
        if (c.message && c.message.toLowerCase().includes(f))
            return true;
        if (Array.isArray(c.changes)) {
            return c.changes.some((ch: any) => {
                const action = ch.action ?? ch.changeType ?? ch.type;
                return action && action.toLowerCase().includes(f);
            });
        }
        return false;
    });
}
export function normalizeTimelineCommits(commits: any) {
    if (!Array.isArray(commits))
        return [];
    return commits.map(normalizeTimelineCommit);
}
export function normalizeTimelineCommit(commit: any = {}) {
    const timestamp = commit.created_at ?? commit.timestamp ?? Date.now();
    const createdAt = Number.isFinite(new Date(timestamp).getTime()) ? new Date(timestamp).toISOString() : '';
    const author = commit.author_type ?? commit.authorId ?? commit.author ?? 'system';
    const hash = commit.commit_hash ?? commit.hash ?? commit.id ?? '';
    return {
        ...commit,
        commit_hash: hash,
        author_type: author,
        created_at: createdAt,
        status: commit.status ?? 'unseen',
        message: commit.message ?? '',
        changes: Array.isArray(commit.changes)
            ? commit.changes.map((change: any) => ({
                ...change,
                action: change.action ?? change.changeType ?? change.type ?? ''
            }))
            : [],
    };
}
// ── Internal renderers ────────────────────────────────────────────────────────
function _renderCommitItem(commit: any, onSelect: any, onRevert: any) {
    commit = normalizeTimelineCommit(commit);
    const li = document.createElement('li');
    li.className = 'vi-timeline-item';
    li.dataset.commitHash = commit.commit_hash || '';
    const status = commit.status || 'unseen';
    const author = commit.author_type || 'system';
    const avatar = (AUTHOR_AVATARS as Record<string,any>)[author] || AUTHOR_AVATARS.system;
    const count = Array.isArray(commit.changes) ? commit.changes.length : 0;
    li.innerHTML = `
        <div class="vi-timeline-status" aria-label="${escapeHtml(t(`commitTimeline.status.${status}`) || status)}">
            ${ (STATUS_INDICATORS as Record<string,string>)[status] || STATUS_INDICATORS.unseen}
        </div>
        <div class="vi-timeline-avatar" aria-hidden="true">${avatar}</div>
        <div class="vi-timeline-body">
            <div class="vi-timeline-message">${escapeHtml(commit.message || '')}</div>
            <div class="vi-timeline-meta">
                <time class="vi-timeline-time" datetime="${escapeHtml(commit.created_at || '')}">
                    ${_formatTime(commit.created_at)}
                </time>
                ${count > 0 ? `<span class="vi-timeline-badge">${count}</span>` : ''}
            </div>
        </div>
        <div class="vi-timeline-actions">
            <button type="button" class="vi-btn-diff" data-action="diff">${escapeHtml(t('commitTimeline.action.viewDiff') || 'View diff')}</button>
            <button type="button" class="vi-btn-revert" data-action="revert">${escapeHtml(t('commitTimeline.action.revert') || 'Revert')}</button>
        </div>
    `;
    const diffBtn: any = li.querySelector("[data-action=\"diff\"]");
    const revertBtn = li.querySelector('[data-action="revert"]');
    if (diffBtn && typeof onSelect === 'function') {
        diffBtn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            onSelect(commit);
        });
    }
    if (revertBtn && typeof onRevert === 'function') {
        revertBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onRevert(commit);
        });
    }
    return li;
}
// ── Date helpers ──────────────────────────────────────────────────────────────
function _isSameDay(a: any, b: any) {
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function _addDays(date: any, days: any) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}
function _isThisWeek(date: any) {
    const d = new Date(date);
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return d >= startOfWeek && !_isSameDay(d, now) && !_isSameDay(d, _addDays(now, -1));
}
function _formatTime(iso: any) {
    if (!iso)
        return '';
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function _groupByDateBucket(commits: any) {
    const groups: Record<string, any[]> = { today: [], yesterday: [], thisWeek: [], older: [] };
    for (const c of commits) {
        const d = new Date(c.created_at || Date.now());
        for (const bucket of DATE_BUCKETS) {
            if (bucket.test(d)) {
                groups[bucket.key]!.push(c);
                break;
            }
        }
    }
    return groups;
}
