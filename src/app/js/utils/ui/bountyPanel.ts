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
   BOUNTY PANEL — Bug Bounty Board tab
   ================================================================

   Painel de bounty board como aba dockavel.
   Cards com tier badge, filtros, leaderboard, workflow claim/verify.

   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { asyncPrompt } from './asyncDialogs.js';
import { getIssue, getOpenBountyCount, getBountyIssues, getServiceRequestIssues, getLeaderboard, claimIssue, resolveIssue, verifyResolution, SERVICE_TYPES, } from '../../core/issues/manager.js';
import { highlightMarker, getMarkerPosition } from '../../core/issues/issueMarker.js';
import { eventBus, Events } from '../../core/analytics/eventBus.js';
import { getCurrentUser } from '../auth/session.js';
// --- State -----------------------------------------------------------
let _container: any = null;
let _filterSeverity = 'all';
let _filterStatus = 'all';
let _filterFlagType = 'all';
let _filterCategory = 'all'; // 'all' | 'bounty' | 'service'
let _selectedIssueId: any = null;
let _leaderboardCollapsed = false;
// PERF-MASTER S3.3 - listener cleanup via AbortController.
// _render() recria DOM completo; abortamos listeners velhos antes de
// criar novos para evitar acumulação em re-renders.
let _abortController: any = null;
/**
 * Helper interno - retorna { signal } options se controller ativo,
 * undefined caso contrário. Cada addEventListener pode usar:
 *   elem.addEventListener('click', fn, _signalOpts());
 */
function _signalOpts() {
    return _abortController?.signal ? { signal: _abortController.signal } : undefined;
}
// --- Constants -------------------------------------------------------
const SEVERITY_COLORS = {
    low: '#3498db',
    medium: '#f39c12',
    high: '#e74c3c',
    critical: '#8e44ad',
};
const TIER_LABELS = {
    bronze: { label: 'Bronze', points: 5 },
    silver: { label: 'Silver', points: 15 },
    gold: { label: 'Gold', points: 40 },
    platinum: { label: 'Platinum', points: 100 },
};
const FLAG_LABELS = {
    data_quality: 'Data Quality',
    compliance: 'Compliance',
    suspicious_reading: 'Suspicious',
    equipment: 'Equipment',
    general: 'General',
};
const STATUS_LABELS = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    wontfix: "Won't Fix",
    planned: t('bounty.planned') || 'Planned',
};
// --- Public API ------------------------------------------------------
/**
 * Initialize the bounty panel inside a container element.
 * @param {HTMLElement} container
 */
export function initBountyPanel(container: any) {
    _container = container;
    _render();
    eventBus.on(Events.ISSUE_CREATED, () => _render());
    eventBus.on(Events.ISSUE_UPDATED, () => _render());
    eventBus.on(Events.ISSUE_DELETED, () => _render());
}
/**
 * Update the badge on the bounty tab.
 */
export function updateBountyBadge() {
    const badge = document.querySelector('.tab[data-tab="bounty"] .tab-badge') as any;
    if (!badge)
        return;
    const count = getOpenBountyCount();
    badge.textContent = count > 0 ? String(count) : '';
    badge.dataset.count = String(count);
}
/**
 * Get badge count for external use.
 * @returns {number}
 */
export function getBountyBadgeCount() {
    return getOpenBountyCount();
}
/**
 * Focus camera on an issue's 3D position.
 * Re-exported from issuesPanel pattern.
 * @param {string} issueId
 */
export function focusOnIssue(issueId: any) {
    const pos = getMarkerPosition(issueId);
    if (!pos)
        return;
    if (window.animateCameraState) {
        window.animateCameraState({
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
    if (!_container)
        return;
    // PERF-MASTER S3.3 - abort listeners do render anterior (DOM
    // anterior está prestes a ser substituído).
    if (_abortController) {
        try {
            _abortController.abort();
        }
        catch (e: any) {
            console.debug('[bountyPanel] abortPrev:', e?.message || e);
        }
    }
    _abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const allBounties = getBountyIssues();
    const allServices = getServiceRequestIssues();
    const allIssues = _filterCategory === 'bounty'
        ? allBounties
        : _filterCategory === 'service'
            ? allServices
            : [...allBounties, ...allServices];
    const filtered = _applyFilters(allIssues);
    const leaderboard = getLeaderboard();
    _container.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'bounty-panel';
    // Stats row
    panel.appendChild(_renderStats(allBounties));
    // Toolbar (filters + create button)
    panel.appendChild(_renderToolbar());
    // Card list
    panel.appendChild(_renderList(filtered));
    // Leaderboard
    panel.appendChild(_renderLeaderboard(leaderboard));
    _container.appendChild(panel);
    // Update tab badge
    updateBountyBadge();
}
/**
 * @param {any} bounties
 */
function _renderStats(bounties: any) {
    const open = bounties.filter((b: any) => b.status === 'open').length;
    const claimed = bounties.filter((b: any) => b.status === 'in_progress').length;
    const resolved = bounties.filter((b: any) => b.status === 'resolved').length;
    const totalPoints = bounties
        .filter((b: any) => b.status === 'resolved' && b.bounty?.verifiedBy)
        .reduce((sum: any, b: any) => sum + (b.bounty?.rewardPoints || 0), 0);
    const row = document.createElement('div');
    row.className = 'bounty-stats-row';
    const stats = [
        { value: open, label: t('bounty.stats_open') || 'Open', color: '#e74c3c' },
        { value: claimed, label: t('bounty.stats_claimed') || 'Claimed', color: '#f39c12' },
        { value: resolved, label: t('bounty.stats_resolved') || 'Resolved', color: '#2ecc71' },
        { value: totalPoints, label: t('bounty.points') || 'Points', color: '#28c7fa' },
    ];
    for (const s of stats) {
        const stat = document.createElement('div');
        stat.className = 'bounty-stat';
        stat.innerHTML = `
            <div class="bounty-stat-value" style="color:${s.color}">${s.value}</div>
            <div class="bounty-stat-label">${escapeHtml(s.label)}</div>
        `;
        row.appendChild(stat);
    }
    return row;
}
function _renderToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'bounty-toolbar';
    // Category filter chips (Todos / Bounties / Serviços)
    const categoryRow = document.createElement('div');
    categoryRow.className = 'bounty-category-row';
    for (const [val, label] of [
        ['all', t('bounty.filter_all') || 'All'],
        ['bounty', t('bounty.filter_bounties') || 'Bounties'],
        ['service', t('bounty.filter_services') || 'Services'],
    ]) {
        const chip = document.createElement('button');
        chip.className = 'bounty-category-chip' + (_filterCategory === val ? ' active' : '');
        chip.textContent = label;
        // PERF-MASTER S3.3 - signal atrelado ao render atual
        chip.addEventListener('click', () => {
            _filterCategory = val;
            _render();
        }, _signalOpts());
        categoryRow.appendChild(chip);
    }
    toolbar.appendChild(categoryRow);
    // Severity filter
    toolbar.appendChild(_createSelect('severity', [
        { value: 'all', label: t('issues.all_severities') || 'All' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'critical', label: 'Critical' },
    ], _filterSeverity, (v: any) => {
        _filterSeverity = v;
        _render();
    }));
    // Status filter
    toolbar.appendChild(_createSelect('status', [
        { value: 'all', label: t('issues.all_statuses') || 'All' },
        ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })),
    ], _filterStatus, (v: any) => {
        _filterStatus = v;
        _render();
    }));
    // Flag type filter
    toolbar.appendChild(_createSelect('flagType', [
        { value: 'all', label: t('bounty.all_flags') || 'All Flags' },
        ...Object.entries(FLAG_LABELS).map(([k, v]) => ({ value: k, label: v })),
    ], _filterFlagType, (v: any) => {
        _filterFlagType = v;
        _render();
    }));
    // Create bounty button
    const btn = document.createElement('button');
    btn.className = 'bounty-create-btn';
    btn.textContent = `+ ${t('bounty.create') || 'Bounty'}`;
    btn.addEventListener('click', () => {
        if (window.handleCreateBounty)
            window.handleCreateBounty();
    });
    toolbar.appendChild(btn);
    // Create service request button
    const srBtn = document.createElement('button');
    srBtn.className = 'bounty-create-btn bounty-create-btn-service';
    srBtn.textContent = `+ ${t('bounty.service_request') || 'Service'}`;
    srBtn.title = t('bounty.service_request_tip') || 'Plan an environmental service purchase';
    srBtn.addEventListener('click', () => {
        if (window.handleCreateServiceRequest)
            window.handleCreateServiceRequest();
    });
    toolbar.appendChild(srBtn);
    return toolbar;
}
/**
 * @param {any} bounties
 */
function _renderList(bounties: any) {
    const list = document.createElement('div');
    list.className = 'bounty-list';
    if (bounties.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'bounty-empty';
        empty.textContent = t('bounty.no_bounties') || 'No bounties found';
        list.appendChild(empty);
        return list;
    }
    // Sort: open first, then by severity weight desc
    const sevWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    const statusWeight = { open: 4, in_progress: 3, resolved: 2, wontfix: 1 };
    bounties.sort((a: any, b: any) => ((statusWeight as Record<string, any>)[b.status] || 0) - ((statusWeight as Record<string, any>)[a.status] || 0) ||
        ((sevWeight as Record<string, any>)[b.severity] || 0) - ((sevWeight as Record<string, any>)[a.severity] || 0));
    for (const bounty of bounties) {
        list.appendChild(_renderCard(bounty));
    }
    return list;
}
/**
 * @param {any} issue
 */
function _renderCard(issue: any) {
    const card = document.createElement('div');
    card.className = 'bounty-card' + (issue.id === _selectedIssueId ? ' selected' : '');
    card.dataset.issueId = issue.id;
    // ---- Service Request card ----
    if (issue.type === 'service_request') {
        const sr = issue.serviceRequest || {};
        const strip = document.createElement('div');
        strip.className = 'bounty-card-strip';
        strip.style.background = '#3498db';
        card.appendChild(strip);
        const body = document.createElement('div');
        body.className = 'bounty-card-body';
        const header = document.createElement('div');
        header.className = 'bounty-card-header';
        const badge = document.createElement('span');
        badge.className = 'bounty-tier-badge tier-service';
        badge.textContent = t('bounty.service_request') || 'Service';
        header.appendChild(badge);
        const title = document.createElement('span');
        title.className = 'bounty-card-title';
        title.textContent = issue.title;
        title.title = issue.title;
        header.appendChild(title);
        body.appendChild(header);
        const meta = document.createElement('div');
        meta.className = 'bounty-card-meta';
        const typeChip = document.createElement('span');
        typeChip.className = 'bounty-chip bounty-chip-flag';
        typeChip.textContent = (SERVICE_TYPES as Record<string, any>)[sr.serviceType] || sr.serviceType || '—';
        meta.appendChild(typeChip);
        const statusChip = document.createElement('span');
        statusChip.className = `bounty-chip bounty-chip-status status-${issue.status}`;
        statusChip.textContent = (STATUS_LABELS as Record<string, any>)[issue.status] || issue.status;
        meta.appendChild(statusChip);
        if (sr.estimatedCost) {
            const costChip = document.createElement('span');
            costChip.className = 'bounty-chip bounty-chip-flag';
            costChip.textContent = `${sr.currency || 'BRL'} ${Number(sr.estimatedCost).toLocaleString()}`;
            meta.appendChild(costChip);
        }
        body.appendChild(meta);
        const actions = _renderCardActions(issue);
        if (actions)
            body.appendChild(actions);
        card.appendChild(body);
        card.addEventListener('click', (/** @type {any} */ e) => {
            if ((e.target as any)?.closest('.bounty-card-actions'))
                return;
            _selectedIssueId = issue.id;
            focusOnIssue(issue.id);
            _render();
        });
        return card;
    }
    // ---- Bounty card ----
    const bty = issue.bounty || {};
    const sevColor = (SEVERITY_COLORS as Record<string, any>)[issue.severity] || '#f39c12';
    const tierInfo = (TIER_LABELS as Record<string, any>)[bty.tier] || TIER_LABELS.silver;
    const flagLabel = (FLAG_LABELS as Record<string, any>)[bty.flagType] || 'General';
    // Severity strip
    const strip = document.createElement('div');
    strip.className = 'bounty-card-strip';
    strip.style.background = issue.status === 'resolved' || issue.status === 'wontfix' ? '#95a5a6' : sevColor;
    card.appendChild(strip);
    // Body
    const body = document.createElement('div');
    body.className = 'bounty-card-body';
    // Header: tier badge + title
    const header = document.createElement('div');
    header.className = 'bounty-card-header';
    const tierBadge = document.createElement('span');
    tierBadge.className = `bounty-tier-badge tier-${bty.tier || 'silver'}`;
    tierBadge.textContent = `${tierInfo.label} ${bty.rewardPoints || 0}pt`;
    header.appendChild(tierBadge);
    const title = document.createElement('span');
    title.className = 'bounty-card-title';
    title.textContent = issue.title;
    title.title = issue.title;
    header.appendChild(title);
    body.appendChild(header);
    // Meta: flag chip + status chip + claimed info
    const meta = document.createElement('div');
    meta.className = 'bounty-card-meta';
    const flagChip = document.createElement('span');
    flagChip.className = 'bounty-chip bounty-chip-flag';
    flagChip.textContent = flagLabel;
    meta.appendChild(flagChip);
    const statusChip = document.createElement('span');
    statusChip.className = `bounty-chip bounty-chip-status status-${issue.status}`;
    statusChip.textContent = (STATUS_LABELS as Record<string, any>)[issue.status] || issue.status;
    meta.appendChild(statusChip);
    if (bty.claimedBy) {
        const claimed = document.createElement('span');
        claimed.className = 'bounty-chip bounty-chip-flag';
        claimed.textContent = `\u25CF ${bty.claimedBy.split('@')[0]}`;
        meta.appendChild(claimed);
    }
    if (bty.verifiedBy) {
        const verified = document.createElement('span');
        verified.className = 'bounty-chip bounty-chip-flag';
        verified.style.color = 'var(--success)';
        verified.textContent = '\u2713 ' + t('bounty.verified');
        meta.appendChild(verified);
    }
    body.appendChild(meta);
    // Evidence thumbnails (attachments)
    if (issue.attachments?.length > 0) {
        const evidence = document.createElement('div');
        evidence.className = 'bounty-evidence-row';
        const screenshots = issue.attachments.filter((a: any) => a.type === 'screenshot');
        for (const att of screenshots.slice(-3)) {
            const thumb = document.createElement('img');
            thumb.className = 'bounty-evidence-thumb';
            thumb.src = att.dataUrl;
            thumb.title = att.label || att.timestamp;
            thumb.addEventListener('click', (/** @type {any} */ e) => {
                e.stopPropagation();
                _showEvidenceModal(att);
            });
            evidence.appendChild(thumb);
        }
        if (screenshots.length > 3) {
            const more = document.createElement('span');
            more.className = 'bounty-chip bounty-chip-flag';
            more.textContent = `+${screenshots.length - 3}`;
            evidence.appendChild(more);
        }
        body.appendChild(evidence);
    }
    // Actions
    const actions = _renderCardActions(issue);
    if (actions)
        body.appendChild(actions);
    card.appendChild(body);
    // Click: abrir última evidência se houver, senão focar no marcador 3D
    card.addEventListener('click', (/** @type {any} */ e) => {
        if ((e.target as any)?.closest('.bounty-card-actions'))
            return;
        if ((e.target as any)?.closest('.bounty-evidence-row'))
            return; // thumbnails têm handler próprio
        _selectedIssueId = issue.id;
        const screenshots = (issue.attachments || []).filter((a: any) => a.type === 'screenshot');
        if (screenshots.length > 0) {
            _showEvidenceModal(screenshots[screenshots.length - 1]);
        }
        else {
            focusOnIssue(issue.id);
        }
        _render();
    });
    return card;
}
/**
 * @param {any} issue
 */
function _renderCardActions(issue: any) {
    const user = getCurrentUser();
    const userId = user?.email || 'local';
    const actions = document.createElement('div');
    actions.className = 'bounty-card-actions';
    let hasButtons = false;
    // Service Request: only "Publicar" button (planned → open)
    if (issue.type === 'service_request') {
        if (issue.status === 'planned' && issue.createdBy === userId) {
            const publishBtn = document.createElement('button');
            publishBtn.className = 'btn-verify';
            publishBtn.textContent = t('bounty.publish') || 'Publish';
            publishBtn.title = t('bounty.publish_tip') || 'Make this service request public';
            publishBtn.addEventListener('click', () => {
                if (window.handlePublishServiceRequest)
                    window.handlePublishServiceRequest(issue.id);
            });
            actions.appendChild(publishBtn);
        }
        return hasButtons ? actions : null;
    }
    const bty = issue.bounty || {};
    // Claim button: only if open AND user is not the creator
    if (issue.status === 'open' && issue.createdBy !== userId) {
        const claimBtn = document.createElement('button');
        claimBtn.className = 'btn-claim';
        claimBtn.textContent = t('bounty.claim') || 'Claim';
        if (!user) {
            claimBtn.disabled = true;
            claimBtn.title = t('bounty.sign_in') || 'Sign in to claim';
        }
        claimBtn.addEventListener('click', () => {
            if (!user)
                return;
            claimIssue(issue.id, userId);
        });
        actions.appendChild(claimBtn);
    }
    // Resolve button: only if claimer is current user AND status is in_progress
    if (issue.status === 'in_progress' && bty.claimedBy === userId) {
        const resolveBtn = document.createElement('button');
        resolveBtn.className = 'btn-resolve';
        resolveBtn.textContent = t('bounty.resolve') || 'Resolve';
        resolveBtn.addEventListener('click', async () => {
            const resolution = await asyncPrompt(t('issues.resolution_prompt') || 'Descreva a resolução', '', {
                placeholder: t('bounty.resolutionPlaceholder'),
                confirmLabel: t('submit') || 'Registrar',
                cancelLabel: t('cancel') || 'Cancelar',
            });
            if (resolution !== null) {
                resolveIssue(issue.id, resolution);
            }
        });
        actions.appendChild(resolveBtn);
    }
    // Verify button: only if resolved, not yet verified, and verifier != claimer
    if (issue.status === 'resolved' && !bty.verifiedBy && bty.claimedBy !== userId) {
        const verifyBtn = document.createElement('button');
        verifyBtn.className = 'btn-verify';
        verifyBtn.textContent = t('bounty.verify') || 'Verify';
        if (!user) {
            verifyBtn.disabled = true;
            verifyBtn.title = t('bounty.sign_in') || 'Sign in to verify';
        }
        verifyBtn.addEventListener('click', () => {
            if (!user)
                return;
            verifyResolution(issue.id, userId);
        });
        actions.appendChild(verifyBtn);
    }
    // Screenshot button: always available (evidence capture)
    const screenshotBtn = document.createElement('button');
    screenshotBtn.className = 'btn-screenshot';
    screenshotBtn.textContent = t('bounty.screenshot') || 'Evidence';
    screenshotBtn.title = t('bounty.screenshot_tip') || 'Capture 3D viewport as evidence';
    screenshotBtn.addEventListener('click', () => {
        if (window.handleCaptureBountyScreenshot) {
            window.handleCaptureBountyScreenshot(issue.id);
        }
    });
    actions.appendChild(screenshotBtn);
    hasButtons = true;
    return hasButtons ? actions : null;
}
/**
 * Show the last captured screenshot for an issue in the evidence modal.
 * Chamado pelo handler de screenshot após salvar - abre o modal imediatamente.
 * @param {string} issueId
 */
export function showLastEvidenceForIssue(issueId: any) {
    const issue = getIssue(issueId);
    if (!issue)
        return;
    const screenshots = (issue.attachments || []).filter((a: any) => a.type === 'screenshot');
    if (screenshots.length > 0) {
        _showEvidenceModal(screenshots[screenshots.length - 1]);
    }
}
/** Show full-size evidence modal */
function _showEvidenceModal(attachment: any) {
    let modal = document.getElementById('bounty-evidence-modal');
    if (modal)
        modal.remove();
    modal = document.createElement('div');
    modal.id = 'bounty-evidence-modal';
    // B2 migração 2026-05-29: .modal/.modal-content → .ecbt-overlay/.ecbt-dialog--xl.
    modal.className = 'ecbt-overlay bounty-evidence-overlay';
    const content = document.createElement('div');
    content.className = 'ecbt-dialog ecbt-dialog--xl bounty-evidence-dialog';
    content.style.cssText = 'padding:12px;text-align:center;';
    const img = document.createElement('img');
    img.src = attachment.dataUrl;
    img.style.cssText = 'max-width:100%;max-height:80vh;border-radius:4px;';
    content.appendChild(img);
    const info = document.createElement('div');
    info.style.cssText = 'font-size:11px;color:var(--text-muted,#888);margin-top:8px;';
    info.textContent = attachment.label || attachment.timestamp || '';
    content.appendChild(info);
    modal.appendChild(content);
    document.body.appendChild(modal);
    modal.addEventListener('click', () => modal.remove());
    modal.addEventListener('keydown', (/** @type {any} */ e) => {
        if (e.key === 'Escape')
            modal.remove();
    });
}
/**
 * @param {any} entries
 */
function _renderLeaderboard(entries: any) {
    const section = document.createElement('div');
    section.className = 'bounty-leaderboard';
    // Header (toggleable)
    const header = document.createElement('div');
    header.className = 'bounty-leaderboard-header';
    header.innerHTML = `
        <span>&#9733; ${escapeHtml(t('bounty.leaderboard') || 'Leaderboard')}</span>
        <span>${_leaderboardCollapsed ? '&#9654;' : '&#9660;'}</span>
    `;
    header.addEventListener('click', () => {
        _leaderboardCollapsed = !_leaderboardCollapsed;
        _render();
    });
    section.appendChild(header);
    // Body
    const body = document.createElement('div');
    body.className = 'bounty-leaderboard-body' + (_leaderboardCollapsed ? ' collapsed' : '');
    if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'bounty-empty';
        empty.textContent = t('bounty.no_contributors') || 'No contributors yet';
        body.appendChild(empty);
    }
    else {
        const top10 = entries.slice(0, 10);
        for (let i = 0; i < top10.length; i++) {
            const entry = top10[i];
            const row = document.createElement('div');
            row.className = 'bounty-lb-row';
            const rank = document.createElement('span');
            rank.className = `bounty-lb-rank${i < 3 ? ` rank-${i + 1}` : ''}`;
            rank.textContent = `#${i + 1}`;
            row.appendChild(rank);
            const user = document.createElement('span');
            user.className = 'bounty-lb-user';
            user.textContent = entry.userId.split('@')[0];
            user.title = entry.userId;
            row.appendChild(user);
            const points = document.createElement('span');
            points.className = 'bounty-lb-points';
            points.textContent = `${entry.totalPoints}pt`;
            row.appendChild(points);
            const resolved = document.createElement('span');
            resolved.className = 'bounty-lb-resolved';
            resolved.textContent = `${entry.resolved} \u2713`;
            row.appendChild(resolved);
            body.appendChild(row);
        }
    }
    section.appendChild(body);
    return section;
}
// --- Helpers ---------------------------------------------------------
/**
 * @param {any} issues
 */
function _applyFilters(issues: any) {
    return issues.filter((b: any) => {
        if (_filterSeverity !== 'all' && b.severity !== _filterSeverity)
            return false;
        if (_filterStatus !== 'all' && b.status !== _filterStatus)
            return false;
        // flagType filter only applies to bounties
        if (_filterFlagType !== 'all' && b.type !== 'service_request' && b.bounty?.flagType !== _filterFlagType)
            return false;
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
        if (opt.value === value)
            o.selected = true;
        sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
}
