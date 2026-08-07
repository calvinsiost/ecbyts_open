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
   DECISION LOG — G6: Technical/regulatory decisions with rationale
   Registro de decisoes tecnicas/regulatorias com justificativa

   Append-only log de decisoes importantes tomadas no projeto:
   - Tecnica: "usar kriging em vez de IDW" com justificativa
   - Regulatoria: "aplicar VI CONAMA 420 para benzeno" com base legal
   - Financeira: "contratar laboratorio X por acreditacao ISO 17025"

   Diferenca vs auditTrail (G1):
   - AuditTrail: QUEM fez O QUE em QUAL recurso (automatico, granular)
   - DecisionLog: POR QUE uma decisao foi tomada (manual, com rationale)

   Cada entrada exige:
   - rationale (>=20 chars) — justificativa tecnica/legal
   - alternativesConsidered (opcional) — o que foi descartado e porque
   - refContext (opcional) — link a elemento/contrato/pipeline

   Append-only: nenhuma operacao de update ou delete apos criacao.
   Persistencia via IndexedDB (idbStore.js).

   Referencia: DAMA-DMBOK "Decision Records", ADR pattern
   Spec: docs/specs/features/SPEC_ESG_GOVERNANCE.md (G6)
   ================================================================ */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';
import {
    validateDecision as _validateDecisionPure,
    applyDecisionFilters as _applyDecisionFilters,
    computeDecisionStats as _computeDecisionStats,
} from './_decisionLogPure.js';

const log = createLogger('DecisionLog');

/** @type {string} IDB key for the decision log array */
const IDB_KEY = 'ecbyts-decision-log';

/** @type {number} Maximum entries to prevent unbounded growth */
const MAX_ENTRIES = 5000;

/** @type {number} Minimum rationale length (chars) to prevent low-quality entries */
const MIN_RATIONALE_LENGTH = 20;

/** @type {number} Maximum title length (chars) to keep UI readable */
const MAX_TITLE_LENGTH = 120;

/** @type {ReadonlyArray<string>} Allowed decision categories */
export const DECISION_CATEGORIES = Object.freeze(['technical', 'regulatory', 'financial', 'operational']);

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DecisionRefContext
 * @property {string} type - Reference type: 'element'|'contract'|'pipeline'|'campaign'|'report'|'model'
 * @property {string} id - Referenced entity ID
 * @property {string} [label] - Human-readable label for UI display
 */

/**
 * @typedef {Object} DecisionEntry
 * @property {string} id - Unique entry ID (dl-{timestamp}-{random})
 * @property {string} actor - Who made the decision (email/user ID/'anonymous')
 * @property {string} category - One of DECISION_CATEGORIES
 * @property {string} title - Short description (<= MAX_TITLE_LENGTH chars)
 * @property {string} rationale - Justification (>= MIN_RATIONALE_LENGTH chars)
 * @property {string} [alternativesConsidered] - What was discarded and why
 * @property {DecisionRefContext} [refContext] - Link to affected entity
 * @property {string[]} [tags] - Free-form tags for filtering
 * @property {string} timestamp - ISO 8601 timestamp (immutable)
 */

// ── State ────────────────────────────────────────────────────────────────────

/** @type {DecisionEntry[]} */
let _entries: any = [];
let _loaded = false;

// ── Persistence ──────────────────────────────────────────────────────────────

/**
 * Generate a unique decision ID.
 * Format: "dl-{epochMs}-{random4hex}" for natural sort order.
 * @returns {string}
 */
function _generateId() {
    const ts = Date.now();
    const rnd = Math.random().toString(16).slice(2, 6);
    return `dl-${ts}-${rnd}`;
}

/**
 * Load entries from IDB into memory (once).
 * @returns {Promise<void>}
 */
async function _ensureLoaded() {
    if (_loaded) return;
    try {
        const stored = await idbGet(IDB_KEY);
        if (Array.isArray(stored)) {
            _entries = stored;
            log.debug('Loaded %d decision entries from IDB', stored.length);
        }
    } catch (err) {
        log.warn('Failed to load decision log from IDB:', (err as any)?.message);
    }
    _loaded = true;
}

/**
 * Persist current entries to IDB. Fire-and-forget, never throws.
 * @returns {Promise<void>}
 */
async function _persist() {
    try {
        await idbSet(IDB_KEY, _entries);
    } catch (err) {
        log.error('Failed to persist decision log', err);
    }
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a decision object before insertion. Throws on invalid input.
 * @param {Partial<DecisionEntry>} decision
 * @throws {Error} With human-readable reason
 */
function _validateDecision(decision: any) {
    _validateDecisionPure(decision, {
        maxTitleLength: MAX_TITLE_LENGTH,
        minRationaleLength: MIN_RATIONALE_LENGTH,
        validCategories: DECISION_CATEGORIES,
    });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Log a technical/regulatory/financial decision with justification.
 * Append-only: no way to modify or remove after creation.
 *
 * @param {Object} decision
 * @param {string} decision.actor - Who made the decision
 * @param {string} decision.category - 'technical'|'regulatory'|'financial'|'operational'
 * @param {string} decision.title - Short description
 * @param {string} decision.rationale - Justification (>= 20 chars)
 * @param {string} [decision.alternativesConsidered] - What was discarded
 * @param {DecisionRefContext} [decision.refContext] - Link to entity
 * @param {string[]} [decision.tags] - Free-form tags
 * @returns {Promise<DecisionEntry>} The created entry
 */
export async function logDecision(decision: any) {
    _validateDecision(decision);
    await _ensureLoaded();

    /** @type {DecisionEntry} */
    const entry = {
        id: _generateId(),
        actor: decision.actor || 'anonymous',
        category: decision.category,
        title: decision.title.trim(),
        rationale: decision.rationale.trim(),
        alternativesConsidered: decision.alternativesConsidered ? String(decision.alternativesConsidered).trim() : '',
        refContext: decision.refContext ? { ...decision.refContext } : undefined,
        tags: Array.isArray(decision.tags) ? decision.tags.filter((t: any) => typeof t === 'string' && t.trim()) : [],
        timestamp: new Date().toISOString(),
    };

    _entries.push(entry);

    // Trim oldest entries if exceeding cap
    if (_entries.length > MAX_ENTRIES) {
        _entries = _entries.slice(_entries.length - MAX_ENTRIES);
    }

    await _persist();
    log.info('Logged decision: [%s] %s', entry.category, entry.title);
    return entry;
}

/**
 * Query decisions with optional filters. Returns chronological order.
 *
 * @param {Object} [filters={}]
 * @param {string} [filters.actor] - Filter by actor
 * @param {string} [filters.category] - Filter by category
 * @param {string} [filters.fromDate] - ISO date (inclusive)
 * @param {string} [filters.toDate] - ISO date (inclusive)
 * @param {string} [filters.tag] - Entry must contain this tag
 * @param {number} [filters.limit] - Max entries to return (from end, most recent)
 * @returns {Promise<DecisionEntry[]>}
 */
export async function getDecisions(
    filters: {
        actor?: string;
        category?: string;
        fromDate?: string;
        toDate?: string;
        tag?: string;
        limit?: number;
    } = {}
) {
    await _ensureLoaded();
    return _applyDecisionFilters(_entries, filters);
}

/**
 * Get a single decision by ID.
 * @param {string} id
 * @returns {Promise<DecisionEntry|null>}
 */
export async function getDecisionById(id: any) {
    await _ensureLoaded();
    return _entries.find((e: any) => e.id === id) || null;
}

/**
 * Get all decisions linked to a specific entity (element/contract/pipeline/etc).
 * @param {string} refType - Reference type
 * @param {string} refId - Referenced entity ID
 * @returns {Promise<DecisionEntry[]>}
 */
export async function getDecisionsByContext(refType: any, refId: any) {
    await _ensureLoaded();
    return _entries.filter((e: any) => e.refContext && e.refContext.type === refType && e.refContext.id === refId);
}

/**
 * Get aggregate statistics for the dashboard.
 * @returns {Promise<{total: number, byCategory: Object<string, number>, firstEntry: string|null, lastEntry: string|null}>}
 */
export async function getDecisionStats() {
    await _ensureLoaded();
    return _computeDecisionStats(_entries, DECISION_CATEGORIES);
}

/**
 * Get the full raw entries array (read-only copy). Used for export.
 * @returns {Promise<DecisionEntry[]>}
 */
export async function getAllDecisions() {
    await _ensureLoaded();
    return [..._entries];
}

/**
 * Reset in-memory state. For testing only.
 * @param {boolean} [clearIdb=false] - Also clear IDB
 * @returns {Promise<void>}
 */
export async function _resetForTesting(clearIdb = false) {
    _entries = [];
    _loaded = false;
    if (clearIdb) {
        await idbSet(IDB_KEY, []);
    }
}
