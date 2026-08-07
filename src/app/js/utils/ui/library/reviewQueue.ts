// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   REVIEW QUEUE — LIBRARY_COMMUNITY_ENRICHMENT_9_68

   Table/list of pending community contributions for curator review.
   ================================================================ */

import { t } from '../../i18n/translations.js';

const TYPE_ICONS: Record<string, string> = {
    new_record: 'plus-circle',
    edit: 'pencil',
    delete: 'trash-2',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
    pending: 'status-badge--pending',
    under_review: 'status-badge--review',
    approved: 'status-badge--approved',
    rejected: 'status-badge--rejected',
};

interface Contribution {
    id: string;
    status: string;
    contribution_type: string;
    category?: string;
    project_name?: string;
    contributor_avatar?: string;
    contributor_name?: string;
    created_at: string | Date;
}

interface ReviewQueueOptions {
    contributions?: Contribution[];
    onReview?: (contributionId: string, action: string) => void;
}

/**
 * Format relative time since submission.
 * @param {string|Date} date
 * @returns {string}
 */
function timeSince(date: string | Date): string {
    const then = new Date(date).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return t('libraryCommunity.time.justNow') || 'just now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
}

function typeLabel(type: string): string {
    const key = type === 'new_record' ? 'newRecord' : type;
    return t(`libraryCommunity.type.${key}`) || type;
}

function statusLabel(status: string): string {
    const key = status === 'under_review' ? 'underReview' : status;
    return t(`libraryCommunity.status.${key}`) || status;
}

function createSelect(options: { value: string; label: string }[], ariaLabel: string): HTMLSelectElement {
    const select = document.createElement('select');
    select.className = 'library-review-select';
    select.setAttribute('aria-label', ariaLabel);
    for (const opt of options) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
    }
    return select;
}

function matchesFilters(c: Contribution, filterStatus: string, filterType: string): boolean {
    const sMatch = filterStatus === 'all' || c.status === filterStatus;
    const tMatch = filterType === 'all' || c.contribution_type === filterType;
    return sMatch && tMatch;
}

function createEmptyRow(): HTMLTableRowElement {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 6;
    emptyCell.className = 'library-review-empty';
    emptyCell.textContent = t('libraryCommunity.empty.noPending') || 'No pending contributions.';
    emptyRow.appendChild(emptyCell);
    return emptyRow;
}

function createTypeCell(c: Contribution): HTMLTableCellElement {
    const td = document.createElement('td');
    const iconName = TYPE_ICONS[c.contribution_type] || 'help-circle';
    td.innerHTML = `<span class="icon" data-icon="${iconName}" data-icon-size="14px"></span> ${typeLabel(c.contribution_type)}`;
    return td;
}

function createRegionCell(c: Contribution): HTMLTableCellElement {
    const td = document.createElement('td');
    td.textContent = c.category || c.project_name || '—';
    return td;
}

function createAuthorCell(c: Contribution): HTMLTableCellElement {
    const td = document.createElement('td');
    const avatar = c.contributor_avatar
        ? `<img src="${c.contributor_avatar}" alt="">`
        : '<span class="icon" data-icon="user" data-icon-size="14px"></span>';
    td.innerHTML = `<span class="library-review-avatar">${avatar}</span> <span class="library-review-author">${c.contributor_name || 'Anonymous'}</span>`;
    return td;
}

function createAgeCell(c: Contribution): HTMLTableCellElement {
    const td = document.createElement('td');
    td.textContent = timeSince(c.created_at);
    return td;
}

function createStatusCell(c: Contribution): HTMLTableCellElement {
    const td = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `library-status-badge ${STATUS_BADGE_CLASS[c.status] || ''}`;
    badge.textContent = statusLabel(c.status);
    td.appendChild(badge);
    return td;
}

function createActionButton(
    label: string,
    className: string,
    onClick: () => void
): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn-sm ${className}`.trim();
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
}

function createActionsCell(
    c: Contribution,
    onReview: ReviewQueueOptions['onReview']
): HTMLTableCellElement {
    const td = document.createElement('td');
    td.className = 'library-review-actions';

    const invoke = (action: string) => {
        if (typeof onReview === 'function') onReview(c.id, action);
    };

    td.appendChild(createActionButton(
        t('libraryCommunity.action.review') || 'Review',
        '',
        () => invoke('review')
    ));
    td.appendChild(createActionButton(
        t('libraryCommunity.action.approve') || 'Approve',
        'btn-success',
        () => invoke('approve')
    ));
    td.appendChild(createActionButton(
        t('libraryCommunity.action.reject') || 'Reject',
        'btn-danger',
        () => invoke('reject')
    ));
    return td;
}

function createRow(c: Contribution, onReview: ReviewQueueOptions['onReview']): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.dataset.id = c.id;
    tr.appendChild(createTypeCell(c));
    tr.appendChild(createRegionCell(c));
    tr.appendChild(createAuthorCell(c));
    tr.appendChild(createAgeCell(c));
    tr.appendChild(createStatusCell(c));
    tr.appendChild(createActionsCell(c, onReview));
    return tr;
}

function renderRowsInto(
    tbody: HTMLTableSectionElement,
    contributions: Contribution[],
    onReview: ReviewQueueOptions['onReview'],
    filterStatus: string,
    filterType: string
): void {
    tbody.innerHTML = '';
    const filtered = contributions.filter((c) => matchesFilters(c, filterStatus, filterType));

    if (filtered.length === 0) {
        tbody.appendChild(createEmptyRow());
        return;
    }

    for (const c of filtered) {
        tbody.appendChild(createRow(c, onReview));
    }
}

/**
 * Build the ReviewQueue DOM element.
 *
 * @param {object} opts
 * @param {Array<any>} [opts.contributions] - contribution rows
 * @param {Function} [opts.onReview] - called with (contributionId, action)
 * @returns {HTMLElement}
 */
export function ReviewQueue({
    contributions = [],
    onReview
}: ReviewQueueOptions): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'library-review-queue';

    // Filters
    const filterBar = document.createElement('div');
    filterBar.className = 'library-review-filters';

    const statusFilter = createSelect([
        { value: 'all', label: t('libraryCommunity.filter.all') || 'All' },
        { value: 'pending', label: t('libraryCommunity.status.pending') },
        { value: 'under_review', label: t('libraryCommunity.status.underReview') },
        { value: 'approved', label: t('libraryCommunity.status.approved') },
        { value: 'rejected', label: t('libraryCommunity.status.rejected') },
    ], t('libraryCommunity.filter.status') || 'Status');

    const typeFilter = createSelect([
        { value: 'all', label: t('libraryCommunity.filter.all') || 'All' },
        { value: 'new_record', label: t('libraryCommunity.type.newRecord') },
        { value: 'edit', label: t('libraryCommunity.type.edit') },
        { value: 'delete', label: t('libraryCommunity.type.delete') },
    ], t('libraryCommunity.filter.type') || 'Type');

    filterBar.appendChild(statusFilter);
    filterBar.appendChild(typeFilter);
    wrap.appendChild(filterBar);

    // Table
    const tableWrap = document.createElement('div');
    tableWrap.className = 'library-review-table-wrap';

    const table = document.createElement('table');
    table.className = 'library-review-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>${t('libraryCommunity.column.type') || 'Type'}</th>
            <th>${t('libraryCommunity.column.region') || 'Region/Category'}</th>
            <th>${t('libraryCommunity.column.author') || 'Author'}</th>
            <th>${t('libraryCommunity.column.age') || 'Age'}</th>
            <th>${t('libraryCommunity.column.status') || 'Status'}</th>
            <th>${t('libraryCommunity.column.actions') || 'Actions'}</th>
        </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    function renderRows(filterStatus = 'all', filterType = 'all') {
        renderRowsInto(tbody, contributions, onReview, filterStatus, filterType);
    }

    renderRows();
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);

    statusFilter.addEventListener('change', () => renderRows(statusFilter.value, typeFilter.value));
    typeFilter.addEventListener('change', () => renderRows(statusFilter.value, typeFilter.value));

    return wrap;
}

/**
 * Render the review queue into a container.
 *
 * @param {HTMLElement} container
 * @param {Array<object>} contributions
 * @param {Function} onReview
 */
export function renderReviewQueue(
    container: HTMLElement | null,
    contributions: Contribution[],
    onReview: ReviewQueueOptions['onReview']
) {
    if (!container) {
        console.debug('[reviewQueue]', 'No container provided');
        return;
    }
    container.innerHTML = '';
    const options: ReviewQueueOptions = { contributions };
    if (onReview !== undefined) options.onReview = onReview;
    container.appendChild(ReviewQueue(options));
}
