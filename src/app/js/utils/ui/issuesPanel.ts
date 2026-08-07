// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   ISSUES PANEL — Dockable list in right panel
   ================================================================

   Painel de issues 3D como tab no right panel.
   Lista com filtros por severidade/status, foco de camera, resolve inline.

   ================================================================ */

import { t } from '../i18n/translations.js';

import { asyncPrompt } from './asyncDialogs.js';
import { getIssues, getOpenIssueCount, resolveIssue } from '../../core/issues/manager.js';
import { highlightMarker, getMarkerPosition } from '../../core/issues/issueMarker.js';
import { eventBus, Events } from '../../core/analytics/eventBus.js';

// --- State -----------------------------------------------------------

/** @type {any} */ let _container: any = null;
let _filterSeverity = 'all';
let _filterStatus = 'all';
/** @type {any} */ let _selectedIssueId: any = null;
// PERF-MASTER S3.3 - listener cleanup via AbortController.
// _render() recria DOM completo (innerHTML=''), então listeners velhos
// ficariam órfãos. Abort controller atrelado ao ciclo de render atual.
/** @type {any} */ let _abortController: any = null;

// --- Severity display ------------------------------------------------

const SEVERITY_LABELS = {
    low: { label: 'Low', color: '#3498db' },
    medium: { label: 'Medium', color: '#f39c12' },
    high: { label: 'High', color: '#e74c3c' },
    critical: { label: 'Critical', color: '#8e44ad' },
};

const STATUS_LABELS = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    wontfix: "Won't Fix",
};

// --- Public API ------------------------------------------------------

/**
 * Initialize the issues panel inside a container element.
 * @param {HTMLElement} container
 */
export function initIssuesPanel(container: any) {
    _container = container;
    _render();

    // Auto-refresh on issue events
    eventBus.on(Events.ISSUE_CREATED, () => _render());
    eventBus.on(Events.ISSUE_UPDATED, () => _render());
    eventBus.on(Events.ISSUE_DELETED, () => _render());
}

/**
 * Get the badge count for the tab.
 * @returns {number}
 */
export function getIssuesBadgeCount(): number {
    return getOpenIssueCount();
}

/**
 * Focus camera on an issue's 3D position.
 * @param {string} issueId
 */
export function focusOnIssue(issueId: any) {
    const pos = getMarkerPosition(issueId);
    if (!pos) return;

    // Use animateCameraState if available
    if ((window as any).animateCameraState) {
        (window as any).animateCameraState({
            target: { x: pos.x, y: pos.y, z: pos.z },
            distance: 15,
        });
    }

    eventBus.emit(Events.ISSUE_FOCUSED, { issueId, position: pos });
    highlightMarker(issueId, true);
    setTimeout(() => highlightMarker(issueId, false), 2000);
}

// --- Rendering -------------------------------------------------------

function _render() {
    if (!_container) return;

    // PERF-MASTER S3.3 - abort listeners do render anterior (DOM
    // anterior está prestes a ser substituído por innerHTML='').
    if (_abortController) {
        try {
            _abortController.abort();
        } catch (e: any) {
            console.debug('[issuesPanel] abortPrev:', (e as any)?.message || e);
        }
    }
    _abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

    const issues = getIssues();
    const filtered = _applyFilters(issues);

    _container.innerHTML = '';

    // Toolbar (filters)
    const toolbar = document.createElement('div');
    toolbar.className = 'issues-toolbar';

    // Severity filter
    const sevSelect = _createSelect(
        'severity',
        [
            { value: 'all', label: t('issues.all_severities') || 'All' },
            ...Object.entries(SEVERITY_LABELS).map(([k, v]) => ({ value: k, label: v.label })),
        ],
        _filterSeverity,
        (/** @type {any} */ val: any) => {
            _filterSeverity = val;
            _render();
        },
    );
    toolbar.appendChild(sevSelect);

    // Status filter
    const statSelect = _createSelect(
        'status',
        [
            { value: 'all', label: t('issues.all_statuses') || 'All' },
            ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })),
        ],
        _filterStatus,
        (/** @type {any} */ val: any) => {
            _filterStatus = val;
            _render();
        },
    );
    toolbar.appendChild(statSelect);

    // Count badge
    const badge = document.createElement('span');
    badge.className = 'issues-count';
    badge.textContent = `${filtered.length}/${issues.length}`;
    toolbar.appendChild(badge);

    _container.appendChild(toolbar);

    // List
    const list = document.createElement('div');
    list.className = 'issues-list';

    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'issues-list__empty';
        empty.textContent = t('issues.no_issues') || 'No issues found';
        list.appendChild(empty);
    } else {
        for (const issue of filtered) {
            list.appendChild(_renderIssueRow(issue));
        }
    }

    _container.appendChild(list);
}

/**
 * @param {any} issue
 */
function _renderIssueRow(issue: any) {
    const row = document.createElement('div');
    row.dataset.issueId = issue.id;

    // Build class list: base + severity + optional selected
    const sevKey = (SEVERITY_LABELS as Record<string, any>)[issue.severity] ? issue.severity : 'medium';
    const sevClass =
        issue.status === 'resolved' || issue.status === 'wontfix'
            ? `issue-sev--${issue.status}`
            : `issue-sev--${sevKey}`;
    const selectedClass = issue.id === _selectedIssueId ? ' issue-row--selected' : '';
    row.className = `issue-row ${sevClass}${selectedClass}`;

    // Severity dot
    const dot = document.createElement('span');
    dot.className = 'issue-row__dot';
    row.appendChild(dot);

    // Title + element info
    const info = document.createElement('div');
    info.className = 'issue-row__info';
    const title = document.createElement('div');
    title.className = 'issue-row__title';
    title.textContent = issue.title;
    info.appendChild(title);

    if (issue.elementId) {
        const elInfo = document.createElement('div');
        elInfo.className = 'issue-row__element';
        const el = (window as any).getElementById?.(issue.elementId);
        elInfo.textContent = el ? el.name : `(${t('issues.element_removed') || 'elemento removido'})`;
        info.appendChild(elInfo);
    }
    row.appendChild(info);

    // Status chip
    const statusKey = issue.status || 'open';
    const chip = document.createElement('span');
    chip.className = `issue-status issue-status--${statusKey}`;
    chip.textContent = (STATUS_LABELS as Record<string, string>)[statusKey] || statusKey;
    row.appendChild(chip);

    // PERF-MASTER S3.3 - listeners atrelados ao ciclo de render atual via signal.
    const signal = _abortController?.signal;

    // Click → focus camera
    row.addEventListener(
        'click',
        () => {
            _selectedIssueId = issue.id;
            focusOnIssue(issue.id);
            _render();
        },
        signal ? { signal } : undefined,
    );

    // Context actions on double-click → resolve
    row.addEventListener(
        'dblclick',
        async () => {
            if (issue.status === 'open' || issue.status === 'in_progress') {
                const resolution = await asyncPrompt(t('issues.resolution_prompt') || 'Descreva a resolução', '', {
                    placeholder: 'Causa identificada, ação aplicada…',
                    confirmLabel: t('submit') || 'Registrar',
                    cancelLabel: t('cancel') || 'Cancelar',
                });
                if (resolution !== null) {
                    resolveIssue(issue.id, resolution);
                }
            }
        },
        signal ? { signal } : undefined,
    );

    return row;
}

// --- Helpers ---------------------------------------------------------

/**
 * @param {any} issues
 */
function _applyFilters(issues: any) {
    return issues.filter((/** @type {any} */ i: any) => {
        if (_filterSeverity !== 'all' && i.severity !== _filterSeverity) return false;
        if (_filterStatus !== 'all' && i.status !== _filterStatus) return false;
        return true;
    });
}

/**
 * @param {any} name
 * @param {any} options
 * @param {any} value
 * @param {any} onChange
 */
function _createSelect(name: any, options: any, value: any, onChange: any) {
    const sel = document.createElement('select');
    sel.name = name;
    for (const opt of options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === value) o.selected = true;
        sel.appendChild(o);
    }
    // PERF-MASTER S3.3 - listener atrelado ao render atual via signal.
    const signal = _abortController?.signal;
    sel.addEventListener('change', () => onChange(sel.value), signal ? { signal } : undefined);
    return sel;
}
