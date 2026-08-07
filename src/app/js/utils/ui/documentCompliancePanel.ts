// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * documentCompliancePanel.js - UI highlighter for DOC-COMP-001.
 *
 * Reuses the report-editor panel pattern from abntPanel.js, but works with
 * ComplianceIssue objects returned by core/documents/complianceValidator.js.
 */
import { t } from '../i18n/translations.js';
import { escapeAttr, escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('DocumentCompliancePanel');
const SEVERITY_ORDER = Object.freeze({ error: 0, warning: 1, info: 2 });
const SEVERITY_COLORS = Object.freeze({
    error: '#f93e3e',
    warning: '#f59e0b',
    info: '#49cc90',
});
let _issues: any[] = [];
let _activeFilter = 'all';
let _panelEl: any = null;
/**
 * @param {any} issue
 * @param {any} index
 */
export function normalizeComplianceIssue(issue: any, index: any = 0) {
    const severity = ['error', 'warning', 'info'].includes(issue?.severity) ? issue.severity : 'info';
    const location = issue?.location && typeof issue.location === 'object' ? issue.location : {};
    return Object.freeze({
        id: String(issue?.id || `${issue?.ruleId || 'DOC'}-${index}`),
        severity,
        ruleId: String(issue?.ruleId || 'DOC'),
        ruleName: String(issue?.ruleName || issue?.ruleId || 'Document compliance'),
        message: String(issue?.message || ''),
        location: Object.freeze({ ...location }),
        suggestion: issue?.suggestion ? String(issue.suggestion) : null,
        highlightText: findComplianceIssueHighlightText(issue),
    });
}
/**
 * @param {any} issue
 */
export function findComplianceIssueHighlightText(issue: any) {
    const location = issue?.location || {};
    const candidates = [
        location.text,
        location.section,
        location.requiredSection,
        location.field,
        location.original,
        issue?.original,
    ];
    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value) return value;
    }
    return null;
}
/**
 * @param {any} issues
 */
export function computeComplianceSeveritySummary(issues: any) {
    const summary = {
        total: issues.length,
        error: 0,
        warning: 0,
        info: 0,
        highlighted: 0,
    };
    for (const issue of issues) {
        const normalized = normalizeComplianceIssue(issue);
        (summary as any)[normalized.severity]++;
        if (normalized.highlightText) summary.highlighted++;
    }
    return summary;
}
/**
 * @param {any} issues
 */
export function sortComplianceIssues(issues: any) {
    return [...issues].map(normalizeComplianceIssue).sort((a: any, b: any) => {
        const sev = (SEVERITY_ORDER as Record<string,number>)[a.severity]! - (SEVERITY_ORDER as Record<string,number>)[b.severity]!;
        if (sev !== 0) return sev;
        return a.ruleId.localeCompare(b.ruleId);
    });
}
/**
 * @param {any} resultOrIssues
 * @param {any} options
 */
export function openDocumentCompliancePanel(resultOrIssues: any, options: any = {}) {
    const rawIssues = Array.isArray(resultOrIssues) ? resultOrIssues : resultOrIssues?.violations || [];
    _issues = sortComplianceIssues(rawIssues);
    _activeFilter = 'all';
    closeDocumentCompliancePanel({ keepHighlights: true });
    const editor = options.editor || _findEditor();
    if (editor) {
        applyDocumentComplianceHighlights(editor, _issues);
    }
    _panelEl = document.createElement('div');
    _panelEl.id = 'document-compliance-panel';
    _panelEl.className = 'abnt-panel doc-compliance-panel';
    _panelEl.setAttribute('role', 'complementary');
    _panelEl.setAttribute('aria-label', t('documentCompliance.title') || 'Document Compliance');
    _panelEl.innerHTML = _renderPanelShell();
    document.body.appendChild(_panelEl);
    _attachEventListeners();
    _renderIssues();
    log.info('Document compliance panel opened with %d issues', _issues.length);
    return _panelEl;
}
/**
 * @param {any} options
 */
export function closeDocumentCompliancePanel(options: any = {}) {
    if (_panelEl) {
        _panelEl.remove();
        _panelEl = null;
    }
    if (!options.keepHighlights) {
        clearDocumentComplianceHighlights(options.editor || _findEditor());
    }
}
export function isDocumentCompliancePanelOpen() {
    return _panelEl !== null && document.body.contains(_panelEl);
}
/**
 * @param {any} editor
 * @param {any} issues
 */
export function applyDocumentComplianceHighlights(editor: any, issues: any) {
    if (!editor) return { applied: 0, skipped: Array.isArray(issues) ? issues.length : 0 };
    clearDocumentComplianceHighlights(editor);
    const normalized = sortComplianceIssues(Array.isArray(issues) ? issues : []);
    let applied = 0;
    let skipped = 0;
    normalized.forEach((issue: any, index: any) => {
        if (_highlightFirstMatch(editor, issue, index)) {
            applied++;
        } else {
            skipped++;
        }
    });
    editor.setAttribute('data-doc-compliance-highlight-count', String(applied));
    return { applied, skipped };
}
/**
 * @param {any} editor
 */
export function clearDocumentComplianceHighlights(editor: any) {
    if (!editor) return 0;
    const marks: any[] = Array.from(editor.querySelectorAll('[data-doc-compliance-highlight="true"]'));
    for (const mark of marks) {
        const parent = mark.parentNode;
        if (!parent) continue;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize?.();
    }
    editor.removeAttribute('data-doc-compliance-highlight-count');
    return marks.length;
}
function _renderPanelShell() {
    const summary = computeComplianceSeveritySummary(_issues);
    return `
        <div class="abnt-panel-header">
            <span class="abnt-panel-title">${escapeHtml(t('documentCompliance.title') || 'Document Compliance')}</span>
            <button class="abnt-panel-close" type="button" title="${escapeAttr(t('close') || 'Close')}" aria-label="${escapeAttr(t('close') || 'Close')}">&times;</button>
        </div>
        <div class="abnt-panel-summary">
            <button class="abnt-filter-btn active" data-filter="all" title="${escapeAttr(t('documentCompliance.filterAll') || 'Show all')}">
                <span class="abnt-filter-value">${summary.total}</span>
                <span class="abnt-filter-label">${escapeHtml(t('documentCompliance.filterAll') || 'All')}</span>
            </button>
            <button class="abnt-filter-btn error" data-filter="error" title="${escapeAttr(t('documentCompliance.filterError') || 'Errors')}">
                <span class="abnt-filter-value">${summary.error}</span>
                <span class="abnt-filter-label">${escapeHtml(t('documentCompliance.filterError') || 'Error')}</span>
            </button>
            <button class="abnt-filter-btn warning" data-filter="warning" title="${escapeAttr(t('documentCompliance.filterWarning') || 'Warnings')}">
                <span class="abnt-filter-value">${summary.warning}</span>
                <span class="abnt-filter-label">${escapeHtml(t('documentCompliance.filterWarning') || 'Warning')}</span>
            </button>
            <button class="abnt-filter-btn info" data-filter="info" title="${escapeAttr(t('documentCompliance.filterInfo') || 'Info')}">
                <span class="abnt-filter-value">${summary.info}</span>
                <span class="abnt-filter-label">${escapeHtml(t('documentCompliance.filterInfo') || 'Info')}</span>
            </button>
        </div>
        <div class="abnt-panel-body" id="document-compliance-panel-body"></div>
    `;
}
function _renderIssues() {
    const body = _panelEl?.querySelector('#document-compliance-panel-body');
    if (!body) return;
    const filtered = _activeFilter === 'all' ? _issues : _issues.filter((issue: any) => issue.severity === _activeFilter);
    if (filtered.length === 0) {
        body.innerHTML = `<div class="abnt-empty">${escapeHtml(t('documentCompliance.empty') || 'No document compliance issues in this filter.')}</div>`;
        return;
    }
    body.innerHTML = filtered.map((issue: any) => _renderIssue(issue, _issues.indexOf(issue))).join('');
}
/**
 * @param {any} issue
 * @param {any} index
 */
function _renderIssue(issue: any, index: any) {
    const color = (SEVERITY_COLORS as Record<string,any>)[issue.severity] || SEVERITY_COLORS.info;
    const target =
        issue.highlightText || issue.location?.requiredSection || issue.location?.referenceIndex || 'document';
    const suggestion = issue.suggestion
        ? `<div class="abnt-finding-meta"><span>${escapeHtml(issue.suggestion)}</span></div>`
        : '';
    return `
        <div class="abnt-finding doc-compliance-issue" data-issue-index="${index}" data-severity="${escapeAttr(issue.severity)}" style="border-left-color:${color}">
            <div class="abnt-finding-main">
                <span class="abnt-finding-original">${escapeHtml(issue.ruleId)} · ${escapeHtml(issue.ruleName)}</span>
                <span class="abnt-finding-status abnt-finding-status-${escapeAttr(issue.severity)}">${escapeHtml(issue.severity)}</span>
            </div>
            <div class="abnt-finding-meta">
                <span class="abnt-finding-location">${escapeHtml(String(target))}</span>
            </div>
            <div class="doc-compliance-message">${escapeHtml(issue.message)}</div>
            ${suggestion}
        </div>
    `;
}
function _attachEventListeners() {
    if (!_panelEl) return;
    _panelEl.querySelector('.abnt-panel-close')?.addEventListener('click', () => closeDocumentCompliancePanel());
    _panelEl.querySelectorAll('.abnt-filter-btn').forEach((btn: any) => {
        btn.addEventListener('click', () => {
            _activeFilter = btn.getAttribute('data-filter') || 'all';
            _panelEl?.querySelectorAll('.abnt-filter-btn').forEach((b: any) => b.classList.remove('active'));
            btn.classList.add('active');
            _renderIssues();
        });
    });
    _panelEl.querySelector('#document-compliance-panel-body')?.addEventListener("click", (event: any) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const row = target.closest('.doc-compliance-issue');
        if (!row) return;
        const index = Number(row.getAttribute('data-issue-index'));
        _jumpToHighlight(index);
    });
}
/**
 * @param {any} index
 */
function _jumpToHighlight(index: any) {
    const editor = _findEditor();
    const mark = editor?.querySelector(`[data-doc-compliance-index="${index}"]`);
    if (!mark) {
        showToast(t('documentCompliance.highlightNotFound') || 'Issue location was not highlightable.', 'info');
        return;
    }
    editor?.querySelectorAll('.doc-compliance-highlight--active').forEach((el: any) => {
        el.classList.remove('doc-compliance-highlight--active');
    });
    mark.classList.add('doc-compliance-highlight--active');
    mark.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}
/**
 * @param {any} editor
 * @param {any} issue
 * @param {any} index
 */
function _highlightFirstMatch(editor: any, issue: any, index: any) {
    const needle = String(issue.highlightText || '').trim();
    if (!needle) return false;
    const doc = editor.ownerDocument || document;
    const nodeFilter = doc.defaultView?.NodeFilter;
    if (!nodeFilter) return false;
    const walker = doc.createTreeWalker(editor, nodeFilter.SHOW_TEXT, {
        acceptNode(node: any) {
            if (!node.nodeValue || !node.nodeValue.trim()) return nodeFilter.FILTER_REJECT;
            if (node.parentElement?.closest('[data-doc-compliance-highlight="true"]')) return nodeFilter.FILTER_REJECT;
            return node.nodeValue.toLowerCase().includes(needle.toLowerCase())
                ? nodeFilter.FILTER_ACCEPT
                : nodeFilter.FILTER_REJECT;
        },
    });
    const node = walker.nextNode();
    if (!node || !node.parentNode) return false;
    const text = node.nodeValue || '';
    const indexInNode = text.toLowerCase().indexOf(needle.toLowerCase());
    if (indexInNode < 0) return false;
    const before = text.slice(0, indexInNode);
    const match = text.slice(indexInNode, indexInNode + needle.length);
    const after = text.slice(indexInNode + needle.length);
    const mark = doc.createElement('span');
    mark.className = `doc-compliance-highlight doc-compliance-highlight--${issue.severity}`;
    mark.setAttribute('data-doc-compliance-highlight', 'true');
    mark.setAttribute('data-doc-compliance-index', String(index));
    mark.setAttribute('data-rule-id', issue.ruleId);
    mark.title = issue.message;
    mark.textContent = match;
    const parent = node.parentNode;
    if (before) parent.insertBefore(doc.createTextNode(before), node);
    parent.insertBefore(mark, node);
    if (after) parent.insertBefore(doc.createTextNode(after), node);
    parent.removeChild(node);
    return true;
}
function _findEditor() {
    return document.querySelector('.report-editor-content, #report-editor-content, [contenteditable="true"]');
}
