// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Issues BCF Panel UI (P1-92)
 * Renderiza painel BCF-like de issues + bug bounty no constelation HUD.
 * Pure DOM rendering - never innerHTML for user data (XSS guard).
 */

import {
    createIssue,
    computeIssueScore,
    summarizeIssueBacklog,
    ISSUE_TYPES,
    ISSUE_STATUS,
    ISSUE_PRIORITY,
    BOUNTY_TIERS,
} from '../../core/issues/bcfSchema.js';

const PANEL_ID = 'issues-bcf-panel';
const STATUS_LABELS = {
    [ISSUE_STATUS.OPEN]: 'Open',
    [ISSUE_STATUS.IN_REVIEW]: 'In Review',
    [ISSUE_STATUS.RESOLVED]: 'Resolved',
    [ISSUE_STATUS.CLOSED]: 'Closed',
    [ISSUE_STATUS.VERIFIED]: 'Verified',
};
const PRIORITY_LABELS = {
    [ISSUE_PRIORITY.LOW]: 'Low',
    [ISSUE_PRIORITY.MEDIUM]: 'Medium',
    [ISSUE_PRIORITY.HIGH]: 'High',
    [ISSUE_PRIORITY.CRITICAL]: 'Critical',
};

/**
 * Pure helper - derives a CSS class modifier from an issue status.
 * Exported for testing.
 * @param {string} status - value from ISSUE_STATUS
 * @returns {string} modifier class (e.g. "issues-bcf-status--open")
 */
export function statusBadgeClass(status: string): string {
    const valid = Object.values(ISSUE_STATUS) as string[];
    const safe = valid.includes(status) ? status : ISSUE_STATUS.OPEN;
    return `issues-bcf-status issues-bcf-status--${safe}`;
}

/**
 * Pure helper - formats bounty value as $ECBT label.
 * Exported for testing.
 * @param {number} bounty - value in $ECBT (must be in BOUNTY_TIERS)
 * @returns {string}
 */
export function formatBountyLabel(bounty: number): string {
    const safe = typeof bounty === 'number' && bounty >= 0 ? bounty : 0;
    if (safe === 0) return 'No bounty';
    return `$ECBT ${safe}`;
}

/**
 * Pure helper - produces 3 demo issues for empty state seeding.
 * Exported for tests.
 * @returns {Array<object>} 3 frozen issues
 */
export function getDemoIssues(): Array<object> {
    return [
        createIssue(
            ISSUE_TYPES.BUG,
            'Sample bug — UI overflow on mobile',
            'Status bar truncates on <320px viewports.',
            {
                status: ISSUE_STATUS.OPEN,
                priority: ISSUE_PRIORITY.HIGH,
                bounty: BOUNTY_TIERS.SILVER,
            },
        ),
        createIssue(
            ISSUE_TYPES.NON_CONFORMITY,
            'Missing CONAMA threshold reference',
            'Validation profile lacks NBR provenance for Cu in soil.',
            {
                status: ISSUE_STATUS.IN_REVIEW,
                priority: ISSUE_PRIORITY.CRITICAL,
                bounty: BOUNTY_TIERS.GOLD,
            },
        ),
        createIssue(
            ISSUE_TYPES.SUGGESTION,
            'Add keyboard shortcut for camera reset',
            'Keyboard shortcut R to reset would speed up review.',
            {
                status: ISSUE_STATUS.OPEN,
                priority: ISSUE_PRIORITY.LOW,
                bounty: BOUNTY_TIERS.BRONZE,
            },
        ),
    ];
}

/**
 * @param {string} tag
 * @param {string} [className?]
 * @param {any} [text?]
 */
function _el(tag: string, className?: string, text?: any): any {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
}

/**
 */
function _renderHeader(panel: any, summary: any): void {
    const header = _el('div', 'issues-bcf-header');
    const title = _el('h3', 'issues-bcf-title', 'Issues & Bug Bounty');
    title.setAttribute('data-i18n', 'issuesBcf.panelTitle');
    const stats = _el('div', 'issues-bcf-stats');

    const openCount = (summary.byStatus && summary.byStatus[ISSUE_STATUS.OPEN]) || 0;
    const openLabel = _el('span', 'issues-bcf-stat');
    openLabel.appendChild(_el('span', 'issues-bcf-stat-label', 'Open'));
    openLabel.appendChild(_el('span', 'issues-bcf-stat-value', String(openCount)));

    const bountyLabel = _el('span', 'issues-bcf-stat');
    bountyLabel.appendChild(_el('span', 'issues-bcf-stat-label', 'Total Bounty'));
    bountyLabel.appendChild(_el('span', 'issues-bcf-stat-value', `$ECBT ${summary.totalBountyAvailable || 0}`));

    stats.appendChild(openLabel);
    stats.appendChild(bountyLabel);
    header.appendChild(title);
    header.appendChild(stats);
    panel.appendChild(header);
}

/**
 */
function _renderEmpty(panel: any): void {
    const empty = _el('div', 'issues-bcf-empty', 'No issues reported yet');
    empty.setAttribute('data-i18n', 'issuesBcf.empty');
    panel.appendChild(empty);
}

/**
 */
function _renderCard(issue: any): any {
    const card = _el('article', 'issues-bcf-card');
    card.setAttribute('data-issue-id', issue.id);
    card.setAttribute('data-issue-score', String(computeIssueScore(issue)));

    const top = _el('div', 'issues-bcf-card-top');
    const title = _el('h4', 'issues-bcf-card-title', issue.title);
    const status = _el(
        'span',
        statusBadgeClass(issue.status),
        (STATUS_LABELS as Record<string, string>)[issue.status] || issue.status,
    );
    top.appendChild(title);
    top.appendChild(status);

    const meta = _el('div', 'issues-bcf-card-meta');
    const type = _el('span', 'issues-bcf-type', issue.type);
    const priority = _el(
        'span',
        `issues-bcf-priority issues-bcf-priority--p${issue.priority}`,
        (PRIORITY_LABELS as Record<string, string>)[issue.priority] || `P${issue.priority}`,
    );
    const bounty = _el('span', 'issues-bcf-bounty', formatBountyLabel(issue.bounty));
    meta.appendChild(type);
    meta.appendChild(priority);
    meta.appendChild(bounty);

    const desc = _el('p', 'issues-bcf-card-desc', issue.description || '');

    card.appendChild(top);
    card.appendChild(meta);
    card.appendChild(desc);
    return card;
}

/**
 * Renders issue list cards into a container (idempotent - clears first).
 * @param {HTMLElement} container
 * @param {Array<object>} issues
 */
export function renderIssuesBcfPanel(container: HTMLElement, issues: Array<object>): void {
    if (!container || typeof container.appendChild !== 'function') {
        return;
    }
    const safeIssues = Array.isArray(issues) && issues.length > 0 ? issues : getDemoIssues();
    const summary = summarizeIssueBacklog(safeIssues as any);

    // Clear via DOM API (not innerHTML)
    while (container.firstChild) container.removeChild(container.firstChild);

    container.classList.add('issues-bcf-panel');
    _renderHeader(container, summary);

    if (safeIssues.length === 0) {
        _renderEmpty(container);
        return;
    }

    const list = _el('div', 'issues-bcf-list');
    const sorted = [...safeIssues].sort((a: any, b: any) => computeIssueScore(b) - computeIssueScore(a));
    for (const issue of sorted) {
        list.appendChild(_renderCard(issue));
    }
    container.appendChild(list);
}

/**
 * Creates the panel container if absent and returns it.
 * Mounted into #constellation-hud when available, else document.body.
 * @returns {HTMLElement|null}
 */
export function mountIssuesBcfPanel(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    let panel = document.getElementById(PANEL_ID) as any;
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'issues-bcf-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Issues and bug bounty');

    const host =
        document.getElementById('constellation-hud') || document.getElementById('right-panel') || document.body;
    if (host) host.appendChild(panel);
    return panel;
}
