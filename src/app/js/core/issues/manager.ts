// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   ISSUES 3D / BCF-LIKE — Manager
   ================================================================

   Anotacoes de nao-conformidade vinculadas a coordenadas 3D.
   Marcadores geometricos por severidade, painel lateral, auditoria.

   - Closure-based state (padrao ecbyts)
   - Map indices para O(1) lookup por elemento, severidade, status
   - IDB + syncQueue dual persistence
   - ECO1 three-way merge import (nunca sobrescreve issues locais mais recentes)

   ================================================================ */

import { generateId } from '../../utils/helpers/id.js';
import { idbGetWithLegacy, idbSet } from '../../utils/storage/idbStore.js';
import {
    createDeferredIdlePersistence,
    type DeferredIdlePersistenceController,
} from '../../utils/performance/deferredIdlePersistence.js';
import { ANALYTICS_EVENTS, emitAnalyticsEvent } from '../events/analyticsEventBus.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';

const STORAGE_KEY = 'ecbyts-issues';
const MAX_TITLE_LENGTH = 120;
const MAX_VISIBLE_MARKERS = 500;
const ISSUES_PERSIST_DEBOUNCE_MS = 750;
const ISSUES_PERSIST_AFTER_BOOT_DELAY_MS = 30000;
const ISSUES_PERSIST_IDLE_TIMEOUT_MS = 3000;

// --- Bounty tier mapping (severity -> tier/points) -----------------------

const BOUNTY_TIERS = {
    low: { tier: 'bronze', points: 5 },
    medium: { tier: 'silver', points: 15 },
    high: { tier: 'gold', points: 40 },
    critical: { tier: 'platinum', points: 100 },
};

// --- Service request types (marketplace de serviços ambientais) -----------

export const SERVICE_TYPES = {
    well_installation: 'Instalação de Poço de Monitoramento',
    remediation_system: 'Sistema de Remediação',
    topography: 'Levantamento Topográfico',
    vegetation_suppression: 'Supressão Vegetal',
    soil_sampling: 'Amostragem de Solo',
    monitoring_station: 'Estação de Monitoramento',
};

// --- State -----------------------------------------------------------

/** @type {any[]} */
let _issues: any[] = [];

/** @type {Map<string, Set<string>>} elementId -> Set<issueId> */
const _byElement = new Map();

/** @type {Map<string, Set<string>>} severity -> Set<issueId> */
const _bySeverity = new Map();

/** @type {Map<string, Set<string>>} status -> Set<issueId> */
const _byStatus = new Map();

/** Callback to refresh UI domains after mutations @type {any} */
let requestUIRefresh: any = null;

/** Callback to refresh 3D markers @type {any} */
let _refreshMarkers: any = null;
let _persistScheduler: DeferredIdlePersistenceController | null = null;
let _pendingPersistPromise: Promise<boolean> | null = null;
let _resolvePendingPersist: ((ok: boolean) => void) | null = null;
let _lastPersistSignature = '';

// --- Helpers ---------------------------------------------------------

/**
 * @param {string} issueId
 * @param {string} indexKey - value for the index (e.g. elementId, severity)
 * @param {Map<string, Set<string>>} indexMap
 */
function _addToIndex(/** @type {any} */ indexMap: any, /** @type {any} */ indexKey: any, /** @type {any} */ issueId: any) {
    if (!indexKey) return;
    if (!indexMap.has(indexKey)) indexMap.set(indexKey, new Set());
    indexMap.get(indexKey).add(issueId);
}

function _removeFromIndex(/** @type {any} */ indexMap: any, /** @type {any} */ indexKey: any, /** @type {any} */ issueId: any) {
    if (!indexKey) return;
    const set = indexMap.get(indexKey);
    if (set) {
        set.delete(issueId);
        if (set.size === 0) indexMap.delete(indexKey);
    }
}

function _indexIssue(/** @type {any} */ issue: any) {
    _addToIndex(_byElement, issue.elementId, issue.id);
    _addToIndex(_bySeverity, issue.severity, issue.id);
    _addToIndex(_byStatus, issue.status, issue.id);
}

function _unindexIssue(/** @type {any} */ issue: any) {
    _removeFromIndex(_byElement, issue.elementId, issue.id);
    _removeFromIndex(_bySeverity, issue.severity, issue.id);
    _removeFromIndex(_byStatus, issue.status, issue.id);
}

function _now() {
    return new Date().toISOString();
}

function _getIssuesSignature(data = exportIssues()) {
    try {
        return JSON.stringify(data);
    } catch {
        return `issues:${_issues.length}`;
    }
}

function _resolvePersist(ok: boolean) {
    if (_resolvePendingPersist) _resolvePendingPersist(ok);
    _pendingPersistPromise = null;
    _resolvePendingPersist = null;
}

function _getPersistScheduler() {
    if (!_persistScheduler) {
        _persistScheduler = createDeferredIdlePersistence({
            debounceMs: ISSUES_PERSIST_DEBOUNCE_MS,
            bootDelayMs: ISSUES_PERSIST_AFTER_BOOT_DELAY_MS,
            idleTimeoutMs: ISSUES_PERSIST_IDLE_TIMEOUT_MS,
            flush: _flushPersist,
            onError: (error) => {
                console.debug('[core/issues/manager:persist-idle]', (error as any)?.message || error);
                _resolvePersist(false);
            },
        });
    }
    return _persistScheduler;
}

async function _flushPersist() {
    _persistScheduler?.clear();
    const data = exportIssues();
    const signature = _getIssuesSignature(data);
    if (signature === _lastPersistSignature) {
        _resolvePersist(true);
        return true;
    }
    const ok = await idbSet(STORAGE_KEY, data);
    if (ok) _lastPersistSignature = signature;
    _resolvePersist(ok);
    return ok;
}

function _persist() {
    if (!_pendingPersistPromise) {
        _pendingPersistPromise = new Promise((resolve) => {
            _resolvePendingPersist = resolve;
        });
    }
    _getPersistScheduler().schedule();
    return _pendingPersistPromise;
}

function _notify(/** @type {any} */ event: any, /** @type {any} */ payload: any) {
    void emitAnalyticsEvent(event, payload);
    if (_refreshMarkers) _refreshMarkers();
    requestIssuesUIRefresh('issues.changed');
}

function requestIssuesUIRefresh(reason = 'issues.changed') {
    if (typeof requestUIRefresh !== 'function') return;
    const domains = [
        UI_INVALIDATION_DOMAINS.ISSUES,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        requestUIRefresh(domain, reason);
    }
}

function _isFeatureEnabled() {
    try {
        const { CONFIG } = /** @type {any} */ ((window as any).__ecbyts_config) || {};
        return CONFIG?.FEATURES?.ISSUES_3D !== false;
    } catch {
        return true;
    }
}

// --- Public API ------------------------------------------------------

/**
 * Create a new issue.
 * @param {any} data - Partial issue data (title and position required)
 * @returns {Object|null} Created issue or null if validation fails / feature disabled
 */
export function createIssue(data: any) {
    if (!_isFeatureEnabled()) return null;

    const title = (data.title || '').trim();
    if (!title) {
        console.warn('[ecbyts] createIssue: title is required');
        return null;
    }

    const severity = /** @type {'low'|'medium'|'high'|'critical'} */ (data.severity || 'medium');
    const isBounty = data.type === 'bounty';
    const tierInfo = BOUNTY_TIERS[severity as keyof typeof BOUNTY_TIERS] || BOUNTY_TIERS.medium;

    const issue = {
        id: generateId('issue'),
        type: data.type || 'nonconformity',
        title: title.slice(0, MAX_TITLE_LENGTH),
        description: data.description || '',
        position: data.position || { x: 0, y: 0, z: 0 },
        elementId: data.elementId || null,
        observationId: data.observationId || null,
        campaignId: data.campaignId || null,
        parameterId: data.parameterId || null,
        ruleId: data.ruleId || null,
        measuredValue: data.measuredValue ?? null,
        thresholdValue: data.thresholdValue ?? null,
        unit: data.unit || null,
        severity,
        status: data.status || 'open',
        assignedTo: data.assignedTo || null,
        createdBy: data.createdBy || 'local',
        createdAt: _now(),
        updatedAt: _now(),
        resolvedAt: null,
        resolution: null,
        attachments: [],
        comments: [],
        visible: true,
        bounty: isBounty
            ? {
                  tier: tierInfo.tier,
                  rewardPoints: tierInfo.points,
                  flagType: data.flagType || 'general',
                  claimedBy: null,
                  claimedAt: null,
                  verifiedBy: null,
                  verifiedAt: null,
              }
            : null,
        serviceRequest:
            data.type === 'service_request'
                ? {
                      serviceType: data.serviceType || 'well_installation',
                      plannedDate: data.plannedDate || null,
                      estimatedCost: data.estimatedCost || null,
                      currency: data.currency || 'BRL',
                  }
                : null,
    };

    _issues.push(issue);
    _indexIssue(issue);
    _persist();
    _notify(ANALYTICS_EVENTS.ISSUE_CREATED, issue);

    return issue;
}

/**
 * Update an existing issue.
 * @param {string} id
 * @param {any} changes - Partial issue fields to update
 * @returns {Object|null} Updated issue or null if not found
 */
export function updateIssue(id: any, changes: any) {
    const issue = _issues.find((i) => i.id === id);
    if (!issue) return null;

    _unindexIssue(issue);

    if (changes.title !== undefined) {
        issue.title = String(changes.title).trim().slice(0, MAX_TITLE_LENGTH);
    }
    if (changes.description !== undefined) issue.description = changes.description;
    if (changes.severity !== undefined) issue.severity = changes.severity;
    if (changes.status !== undefined) issue.status = changes.status;
    if (changes.assignedTo !== undefined) issue.assignedTo = changes.assignedTo;
    if (changes.elementId !== undefined) issue.elementId = changes.elementId;
    if (changes.visible !== undefined) issue.visible = changes.visible;
    if (changes.position !== undefined) issue.position = changes.position;
    if (changes.resolution !== undefined) issue.resolution = changes.resolution;
    if (changes.resolvedAt !== undefined) issue.resolvedAt = changes.resolvedAt;
    if (changes.bounty !== undefined && issue.bounty) {
        Object.assign(issue.bounty, changes.bounty);
    }

    // Sync bounty tier when severity changes
    if (changes.severity !== undefined && issue.bounty) {
        const severity = /** @type {'low'|'medium'|'high'|'critical'} */ (issue.severity);
        const t = BOUNTY_TIERS[severity as keyof typeof BOUNTY_TIERS] || BOUNTY_TIERS.medium;
        issue.bounty.tier = t.tier;
        issue.bounty.rewardPoints = t.points;
    }

    issue.updatedAt = _now();
    _indexIssue(issue);
    _persist();
    _notify(ANALYTICS_EVENTS.ISSUE_UPDATED, issue);

    return issue;
}

/**
 * Resolve an issue.
 * @param {string} id
 * @param {string} resolution - Resolution text
 * @returns {Object|null}
 */
export function resolveIssue(id: any, resolution: any) {
    return updateIssue(id, {
        status: 'resolved',
        resolution: resolution || '',
        resolvedAt: _now(),
    });
}

/**
 * Add an attachment (screenshot evidence) to an issue.
 * @param {string} issueId
 * @param {{ type: string, dataUrl: string, timestamp: string, label?: string }} attachment
 * @returns {Object|null} The attachment or null
 */
export function addAttachment(issueId: any, attachment: any) {
    const issue = _issues.find((i) => i.id === issueId);
    if (!issue || !attachment?.dataUrl) return null;

    const entry = {
        id: generateId('attach'),
        type: attachment.type || 'screenshot',
        dataUrl: attachment.dataUrl,
        label: attachment.label || '',
        timestamp: attachment.timestamp || _now(),
    };

    issue.attachments.push(entry);
    issue.updatedAt = _now();
    _persist();
    _notify(ANALYTICS_EVENTS.ISSUE_UPDATED, issue);

    return entry;
}

/**
 * Delete an issue permanently.
 * @param {string} id
 * @returns {boolean}
 */
export function deleteIssue(id: any) {
    const idx = _issues.findIndex((i) => i.id === id);
    if (idx === -1) return false;

    const issue = _issues[idx];
    _unindexIssue(issue);
    _issues.splice(idx, 1);
    _persist();
    _notify(ANALYTICS_EVENTS.ISSUE_DELETED, { id });

    return true;
}

/**
 * Add a comment to an issue.
 * @param {string} issueId
 * @param {string} text
 * @param {string} [author]
 * @returns {Object|null} The new comment or null
 */
export function addComment(issueId: any, text: any, author = 'local') {
    const issue = _issues.find((i) => i.id === issueId);
    if (!issue || !text?.trim()) return null;

    const comment = {
        id: generateId('comment'),
        text: text.trim(),
        author,
        createdAt: _now(),
    };

    issue.comments.push(comment);
    issue.updatedAt = _now();
    _persist();

    return comment;
}

// --- Bounty Operations -----------------------------------------------

/**
 * Claim a bounty issue. Sets claimedBy and moves to in_progress.
 * @param {string} id - Issue ID
 * @param {string} userId - Email/ID of user claiming
 * @returns {Object|null} Updated issue or null
 */
export function claimIssue(id: any, userId: any) {
    const issue = _issues.find((i) => i.id === id);
    if (!issue || !issue.bounty) return null;
    if (issue.status !== 'open') return null;
    if (issue.createdBy === userId) return null; // cannot claim own bounty

    issue.bounty.claimedBy = userId;
    issue.bounty.claimedAt = _now();

    _unindexIssue(issue);
    issue.status = 'in_progress';
    issue.assignedTo = userId;
    issue.updatedAt = _now();
    _indexIssue(issue);

    _persist();
    _notify(ANALYTICS_EVENTS.ISSUE_UPDATED, issue);

    return issue;
}

/**
 * Verify a bounty resolution. Awards points to the claimer.
 * @param {string} id - Issue ID
 * @param {string} verifierId - Email/ID of verifier
 * @returns {Object|null}
 */
export function verifyResolution(id: any, verifierId: any) {
    const issue = _issues.find((i) => i.id === id);
    if (!issue || !issue.bounty) return null;
    if (issue.status !== 'resolved') return null;
    if (issue.bounty.claimedBy === verifierId) return null; // verifier != claimer

    issue.bounty.verifiedBy = verifierId;
    issue.bounty.verifiedAt = _now();
    issue.updatedAt = _now();

    _persist();
    _notify(ANALYTICS_EVENTS.ISSUE_UPDATED, issue);

    return issue;
}

/**
 * Compute leaderboard from all bounty issues.
 * Points awarded only for resolved+verified bounties.
 * @returns {Array<{userId: string, totalPoints: number, resolved: number, claimed: number}>}
 */
export function getLeaderboard() {
    const board = new Map();

    for (const issue of _issues) {
        if (!issue.bounty) continue;

        const claimer = issue.bounty.claimedBy;
        if (!claimer) continue;

        if (!board.has(claimer)) {
            board.set(claimer, { userId: claimer, totalPoints: 0, resolved: 0, claimed: 0 });
        }
        const entry = board.get(claimer);
        entry.claimed++;

        // Points only when verified
        if (issue.status === 'resolved' && issue.bounty.verifiedBy) {
            entry.totalPoints += issue.bounty.rewardPoints || 0;
            entry.resolved++;
        }
    }

    return [...board.values()].sort((a, b) => b.totalPoints - a.totalPoints);
}

/**
 * Get bounty-type issues filtered by tier.
 * @param {string} [tier?] - Optional tier filter
 * @returns {Object[]}
 */
export function getBountyIssues(tier?: any) {
    const bounties = _issues.filter((i) => i.type === 'bounty' && i.bounty);
    if (!tier) return bounties;
    return bounties.filter((i) => i.bounty.tier === tier);
}

/**
 * Get service-request-type issues.
 * @returns {Object[]}
 */
export function getServiceRequestIssues() {
    return _issues.filter((i) => i.type === 'service_request');
}

/**
 * Get count of open bounties.
 * @returns {number}
 */
export function getOpenBountyCount() {
    return _issues.filter((i) => i.type === 'bounty' && i.bounty && i.status === 'open').length;
}

// --- Queries ---------------------------------------------------------

/**
 * @param {string} id
 * @returns {Object|null}
 */
export function getIssue(id: any) {
    return _issues.find((i) => i.id === id) || null;
}

/** @returns {Object[]} */
export function getIssues() {
    return [..._issues];
}

/**
 * O(1) lookup by element ID.
 * @param {string} elementId
 * @returns {Object[]}
 */
export function getIssuesByElement(elementId: any) {
    const ids = _byElement.get(elementId);
    if (!ids || ids.size === 0) return [];
    return _issues.filter((i) => ids.has(i.id));
}

/**
 * O(1) lookup by severity.
 * @param {string} severity
 * @returns {Object[]}
 */
export function getIssuesBySeverity(severity: any) {
    const ids = _bySeverity.get(severity);
    if (!ids || ids.size === 0) return [];
    return _issues.filter((i) => ids.has(i.id));
}

/**
 * @param {string} status
 * @returns {Object[]}
 */
export function getIssuesByStatus(status: any) {
    const ids = _byStatus.get(status);
    if (!ids || ids.size === 0) return [];
    return _issues.filter((i) => ids.has(i.id));
}

/** @returns {number} */
export function getOpenIssueCount() {
    return (_byStatus.get('open')?.size || 0) + (_byStatus.get('in_progress')?.size || 0);
}

/**
 * Get issue IDs that should have visible markers.
 * Caps at MAX_VISIBLE_MARKERS for performance.
 * @returns {string[]}
 */
export function getVisibleIssueIds() {
    const visible = _issues
        .filter((i) => i.visible && (i.status === 'open' || i.status === 'in_progress'))
        .slice(0, MAX_VISIBLE_MARKERS);
    return visible.map((i) => i.id);
}

// --- Persistence -----------------------------------------------------

/**
 * Export issues for ECO1 encoding.
 * @returns {Object[]}
 */
export function exportIssues() {
    return _issues.map((i) => ({ ...i }));
}

/**
 * Import issues from ECO1 with three-way merge.
 * Gap #1 resolution: never silently overwrite newer local issues.
 *
 * @param {Object[]} imported - Sanitized issues from ECO1 decoder
 * @param {Object} [opts]
 * @param {'merge'|'replace'} [opts.mode='merge']
 * @returns {{ inserted: number, updated: number, kept: number }}
 */
export function importIssues(imported: any, opts: any = {}) {
    const mode = opts.mode || 'merge';

    if (mode === 'replace') {
        _issues = [];
        _byElement.clear();
        _bySeverity.clear();
        _byStatus.clear();
        for (const issue of imported) {
            _issues.push({ ...issue });
            _indexIssue(issue);
        }
        _persist();
        _notify(ANALYTICS_EVENTS.ISSUE_UPDATED, { bulk: true });
        return { inserted: imported.length, updated: 0, kept: 0 };
    }

    // Three-way merge
    const localMap = new Map(_issues.map((/** @type {any} */ i) => [i.id, i]));
    let inserted = 0,
        updated = 0,
        kept = 0;

    for (const imp of /** @type {any[]} */ (imported)) {
        const local = /** @type {any} */ (localMap.get(imp.id));
        if (!local) {
            // New from import
            _issues.push({ ...imp });
            _indexIssue(imp);
            inserted++;
        } else if (new Date(imp.updatedAt) >= new Date(local.updatedAt)) {
            // Import is newer or equal - import wins
            _unindexIssue(local);
            Object.assign(local, imp);
            _indexIssue(local);
            updated++;
        } else {
            // Local is newer - keep local
            kept++;
        }
        localMap.delete(imp.id);
    }

    // Remaining in localMap are local-only issues - preserved
    kept += localMap.size;

    _persist();
    _notify(ANALYTICS_EVENTS.ISSUE_UPDATED, { bulk: true, inserted, updated, kept });

    return { inserted, updated, kept };
}

/**
 * Load issues from IDB on app startup.
 * @returns {Promise<void>}
 */
export async function loadIssues() {
    try {
        const stored = await idbGetWithLegacy(STORAGE_KEY);
        if (Array.isArray(stored)) {
            _issues = stored;
            _byElement.clear();
            _bySeverity.clear();
            _byStatus.clear();
            for (const issue of _issues) {
                _indexIssue(issue);
            }
            _lastPersistSignature = _getIssuesSignature();
        }
    } catch (err) {
        console.error('[ecbyts] Failed to load issues from IDB:', err);
    }
}

/**
 * Clear all issues (called by clearModelData).
 */
export function clearIssues() {
    _issues = [];
    _byElement.clear();
    _bySeverity.clear();
    _byStatus.clear();
}

// --- Configuration ---------------------------------------------------

/**
 * Set the callback for UI refresh after mutations.
 * @param {Function} fn
 */
export function setUpdateCallback(fn: any) {
    requestUIRefresh = fn;
}

/**
 * Set the callback for 3D marker refresh.
 * @param {Function} fn
 */
export function setMarkerRefreshCallback(fn: any) {
    _refreshMarkers = fn;
    // Auto-limpa os marcadores 3D ao trocar de modelo. Os marcadores são
    // ancorados a elementos; ecbt:elementsCleared dispara no início de cada
    // applyModel (clearAllElements). Registrado AQUI (setMarkerRefreshCallback
    // roda no boot APÓS o applyModel inicial) → não afeta o boot, só limpa em
    // trocas subsequentes. Sem isto, marcadores de issues do modelo anterior
    // ficavam fantasma (auditoria Calvin 2026-06-02). Espelha labels/manager.
    if (!_issuesAutoClearWired && typeof window !== 'undefined') {
        _issuesAutoClearWired = true;
        window.addEventListener('ecbt:elementsCleared', () => {
            clearIssues();
            _refreshMarkers?.();
        });
    }
}
let _issuesAutoClearWired = false;
