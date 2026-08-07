// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   REGULATORY CALENDAR — G4: Obligations with deadlines and alerts
   Calendario regulatorio — prazos e obrigacoes ambientais

   Mantem lista de obrigacoes legais (licencas, relatorios, renovacoes)
   com calculo automatico de urgencia baseado em dias ate o vencimento:
   - >90 dias: ok (verde)
   - 30-90 dias: atencao (amarelo)
   - 7-30 dias: urgente (laranja)
   - 1-7 dias: critico (vermelho)
   - vencido: overdue (vermelho + alerta)

   Persistencia via IDB (ecbyts-regulatory-calendar).

   Spec: docs/specs/features/SPEC_ESG_GOVERNANCE.md (G4)
   ================================================================ */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';
import { generateId } from '../../utils/helpers/id.js';

const log = createLogger('RegulatoryCalendar');
const IDB_KEY = 'ecbyts-regulatory-calendar';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RegulatoryObligation
 * @property {string} id - Unique identifier
 * @property {string} title - Human-readable title (e.g., "Renovacao LO")
 * @property {string} description - Detailed description
 * @property {string} type - Category: 'license'|'report'|'renewal'|'inspection'|'other'
 * @property {string} regulator - Issuing body (e.g., "CETESB", "IBAMA")
 * @property {string} dueDate - ISO date string (YYYY-MM-DD)
 * @property {string} [issueDate] - When the obligation was issued (ISO date)
 * @property {string} [referenceDoc] - Document reference (e.g., "LO-1234/2026")
 * @property {string} [notes] - Additional notes
 * @property {string} status - 'active'|'completed'|'cancelled'
 * @property {string} createdAt - ISO timestamp
 * @property {string} [completedAt] - ISO timestamp when marked as completed
 */

/**
 * @typedef {Object} UrgencyLevel
 * @property {string} level - 'ok'|'attention'|'urgent'|'critical'|'overdue'
 * @property {number} daysRemaining - Days until due (negative if overdue)
 * @property {string} color - CSS color for UI badge
 * @property {string} label - Human-readable label
 */

// ── Urgency thresholds (days) ────────────────────────────────────────────────

const THRESHOLDS = Object.freeze({
    attention: 90,
    urgent: 30,
    critical: 7,
});

const COLORS = Object.freeze({
    ok: '#49cc90',
    attention: '#f59e0b',
    urgent: '#ff6b35',
    critical: '#f93e3e',
    overdue: '#dc2626',
});

// ── State ────────────────────────────────────────────────────────────────────

/** @type {RegulatoryObligation[]} */
let _obligations: any = [];
let _loaded = false;

// ── Persistence ──────────────────────────────────────────────────────────────

async function _load() {
    if (_loaded) return _obligations;
    try {
        const saved = await idbGet(IDB_KEY);
        if (Array.isArray(saved)) {
            _obligations = saved;
            log.debug('Loaded %d obligations from IDB', saved.length);
        }
    } catch (err) {
        log.warn('Failed to load from IDB:', (err as any).message);
    }
    _loaded = true;
    return _obligations;
}

async function _persist() {
    try {
        await idbSet(IDB_KEY, _obligations);
    } catch (err) {
        log.warn('Failed to persist to IDB:', (err as any).message);
    }
}

// ── Urgency calculation ──────────────────────────────────────────────────────

/**
 * Compute urgency level from a due date.
 * @param {string|Date} dueDate - ISO date string or Date object
 * @param {Date} [now=new Date()] - Reference "now" (for testing)
 * @returns {UrgencyLevel}
 */
export function computeUrgency(dueDate: any, now = new Date()) {
    const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
    if (!due || isNaN(due.getTime())) {
        return { level: 'ok', daysRemaining: Infinity, color: COLORS.ok, label: 'Sem prazo' };
    }

    const msPerDay = 86400000;
    const daysRemaining = Math.ceil((due.getTime() - now.getTime()) / msPerDay);

    if (daysRemaining < 0) {
        return {
            level: 'overdue',
            daysRemaining,
            color: COLORS.overdue,
            label: `Vencido ha ${Math.abs(daysRemaining)} dia(s)`,
        };
    }
    if (daysRemaining <= THRESHOLDS.critical) {
        return {
            level: 'critical',
            daysRemaining,
            color: COLORS.critical,
            label: `${daysRemaining} dia(s) restante(s)`,
        };
    }
    if (daysRemaining <= THRESHOLDS.urgent) {
        return {
            level: 'urgent',
            daysRemaining,
            color: COLORS.urgent,
            label: `${daysRemaining} dia(s) restante(s)`,
        };
    }
    if (daysRemaining <= THRESHOLDS.attention) {
        return {
            level: 'attention',
            daysRemaining,
            color: COLORS.attention,
            label: `${daysRemaining} dia(s) restante(s)`,
        };
    }
    return {
        level: 'ok',
        daysRemaining,
        color: COLORS.ok,
        label: `${daysRemaining} dia(s) restante(s)`,
    };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Add a new regulatory obligation.
 * @param {Partial<RegulatoryObligation> & {title: string, dueDate: string}} obligation
 * @returns {Promise<RegulatoryObligation>}
 */
export async function addObligation(obligation: any) {
    if (!obligation || typeof obligation !== 'object') {
        throw new Error('addObligation: obligation object required');
    }
    if (!obligation.title || typeof obligation.title !== 'string') {
        throw new Error('addObligation: title is required');
    }
    if (!obligation.dueDate) {
        throw new Error('addObligation: dueDate is required');
    }
    const due = new Date(obligation.dueDate);
    if (isNaN(due.getTime())) {
        throw new Error(`addObligation: invalid dueDate "${obligation.dueDate}"`);
    }

    await _load();

    /** @type {RegulatoryObligation} */
    const entry = {
        id: obligation.id || generateId('reg', 6),
        title: obligation.title,
        description: obligation.description || '',
        type: obligation.type || 'other',
        regulator: obligation.regulator || '',
        dueDate: obligation.dueDate,
        issueDate: obligation.issueDate || undefined,
        referenceDoc: obligation.referenceDoc || '',
        notes: obligation.notes || '',
        status: 'active',
        createdAt: new Date().toISOString(),
    };

    _obligations.push(entry);
    await _persist();
    log.info('Added obligation: %s (due %s)', entry.title, entry.dueDate);
    return entry;
}

/**
 * Mark an obligation as completed.
 * @param {string} id
 * @returns {Promise<RegulatoryObligation|null>}
 */
export async function completeObligation(id: any) {
    await _load();
    const entry = _obligations.find((o: any) => o.id === id);
    if (!entry) {
        log.warn('completeObligation: not found: %s', id);
        return null;
    }
    entry.status = 'completed';
    entry.completedAt = new Date().toISOString();
    await _persist();
    log.info('Completed obligation: %s', entry.title);
    return entry;
}

/**
 * Cancel an obligation (e.g., no longer applicable).
 * @param {string} id
 * @returns {Promise<RegulatoryObligation|null>}
 */
export async function cancelObligation(id: any) {
    await _load();
    const entry = _obligations.find((o: any) => o.id === id);
    if (!entry) return null;
    entry.status = 'cancelled';
    await _persist();
    log.info('Cancelled obligation: %s', entry.title);
    return entry;
}

/**
 * Remove an obligation entirely (hard delete).
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function removeObligation(id: any) {
    await _load();
    const idx = _obligations.findIndex((o: any) => o.id === id);
    if (idx === -1) return false;
    _obligations.splice(idx, 1);
    await _persist();
    return true;
}

/**
 * Update an existing obligation (partial).
 * @param {string} id
 * @param {Partial<RegulatoryObligation>} updates
 * @returns {Promise<RegulatoryObligation|null>}
 */
export async function updateObligation(id: any, updates: any) {
    await _load();
    const entry = _obligations.find((o: any) => o.id === id);
    if (!entry) return null;
    // Protect immutable fields
    const { id: _ignoreId, createdAt: _ignoreCreated, ...safeUpdates } = updates || {};
    Object.assign(entry, safeUpdates);
    await _persist();
    return entry;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get all obligations (optionally filtered).
 * @param {Object} [filter]
 * @param {string} [filter.status] - Filter by status
 * @param {string} [filter.regulator] - Filter by regulator
 * @param {string} [filter.type] - Filter by type
 * @returns {Promise<RegulatoryObligation[]>}
 */
export async function getObligations(
    filter: { status?: string; regulator?: string; type?: string } = {}
) {
    await _load();
    let list = [..._obligations];
    if (filter.status) list = list.filter((o: any) => o.status === filter.status);
    if (filter.regulator) list = list.filter((o: any) => o.regulator === filter.regulator);
    if (filter.type) list = list.filter((o: any) => o.type === filter.type);
    return list;
}

/**
 * Get active obligations enriched with urgency info, sorted by urgency.
 * Most critical first (overdue > critical > urgent > attention > ok).
 * @param {Date} [now=new Date()] - Reference time
 * @returns {Promise<Array<RegulatoryObligation & {urgency: UrgencyLevel}>>}
 */
export async function getActiveWithUrgency(now = new Date()) {
    const active = await getObligations({ status: 'active' });
    const enriched = active.map((o) => ({
        ...o,
        urgency: computeUrgency(o.dueDate, now),
    }));
    // Sort: overdue/critical first (lowest daysRemaining)
    enriched.sort((a, b) => a.urgency.daysRemaining - b.urgency.daysRemaining);
    return enriched;
}

/**
 * Compute summary stats for dashboard display.
 * @param {Date} [now=new Date()]
 * @returns {Promise<{total:number, overdue:number, critical:number, urgent:number, attention:number, ok:number}>}
 */
export async function getCalendarSummary(now = new Date()) {
    const list = await getActiveWithUrgency(now);
    /** @type {Record<string, number>} */
    const stats = { total: list.length, overdue: 0, critical: 0, urgent: 0, attention: 0, ok: 0 };
    for (const o of list) {
        (stats as any)[o.urgency.level]++;
    }
    return /** @type {{total:number, overdue:number, critical:number, urgent:number, attention:number, ok:number}} */ (
        stats
    );
}

/**
 * Clear all obligations (for testing / reset).
 * @returns {Promise<void>}
 */
export async function clearAllObligations() {
    _obligations = [];
    await _persist();
    log.info('Cleared all obligations');
}
