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
   RETENTION POLICY — G10: Data retention policies per data type

   Gerenciamento de políticas de retenção configuráveis por tipo de
   dado, alinhado com LGPD Art. 16 (eliminação após fim do tratamento)
   e ISO 14001 (cláusula 7.5.3 controle de informação documentada).

   Tipos suportados:
   - audit_trail       — padrão: manter por 1825 dias (5 anos)
   - decision_log      — padrão: manter indefinidamente (decisão é IP)
   - stakeholder_shares — padrão: eliminar 30 dias após expiração
   - error_reports     — padrão: manter 90 dias
   - model_snapshots   — padrão: manter indefinidamente
   - obligation_archive — padrão: manter 1825 dias após completed

   Entrada pura para evaluateRetention (array de itens + policy) →
   saída pura (array de itens a deletar + resumo). Execução real
   via runRetentionCleanup() que recebe callbacks CRUD do caller.

   IMPORTANTE: o módulo NUNCA deleta nada automaticamente. O caller
   aplica as decisões (dry-run por padrão). Isto é intencional:
   eliminar dados é irreversível, exige aprovação humana ou confirmação.

   Spec: docs/specs/features/SPEC_ESG_GOVERNANCE.md (G10)
   Ref: LGPD Lei 13.709/2018 Art. 16 — eliminação de dados pessoais
   ================================================================ */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';
import {
    validatePolicyParams as _validatePolicyParams,
    buildPolicyEntry as _buildPolicyEntry,
} from './_retentionPolicyPure.js';

const log = createLogger('RetentionPolicy');

/** @type {string} IDB key for persisted policies */
const IDB_KEY = 'ecbyts-retention-policies';

/** @type {ReadonlyArray<string>} Supported data types */
export const DATA_TYPES = Object.freeze([
    'audit_trail',
    'decision_log',
    'stakeholder_shares',
    'error_reports',
    'model_snapshots',
    'obligation_archive',
]);

/**
 * Default policies (days; -1 = indefinite).
 * @type {Readonly<Object<string, {retentionDays: number, rationale: string}>>}
 */
export const DEFAULT_POLICIES = Object.freeze({
    audit_trail: Object.freeze({
        retentionDays: 1825,
        rationale: 'CETESB GAC + ISO 14001: 5 anos de rastreabilidade pós-encerramento',
    }),
    decision_log: Object.freeze({
        retentionDays: -1,
        rationale: 'Decisões técnicas são propriedade intelectual — retenção indefinida',
    }),
    stakeholder_shares: Object.freeze({
        retentionDays: 30,
        rationale: 'Shares expirados são redundantes após 30 dias — LGPD Art. 16',
    }),
    error_reports: Object.freeze({
        retentionDays: 90,
        rationale: 'Debug window pós-release — após 90 dias redundante',
    }),
    model_snapshots: Object.freeze({
        retentionDays: -1,
        rationale: 'Snapshots são o estado auditável do digital twin — retenção indefinida',
    }),
    obligation_archive: Object.freeze({
        retentionDays: 1825,
        rationale: 'Prazo legal de guarda de documentos de compliance ambiental (5 anos)',
    }),
});

/**
 * @typedef {Object} RetentionPolicyEntry
 * @property {string} dataType - One of DATA_TYPES
 * @property {number} retentionDays - Days to keep (-1 = indefinite)
 * @property {string} rationale - Why this policy exists
 * @property {string} updatedAt - ISO 8601
 * @property {string} [updatedBy] - Who changed it
 */

// ── State ────────────────────────────────────────────────────────────────────

/** @type {Object<string, RetentionPolicyEntry>} */
let _policies: Record<string, any> = {};
let _loaded = false;

// ── Persistence ──────────────────────────────────────────────────────────────

async function _ensureLoaded() {
    if (_loaded) return;
    try {
        const stored = await idbGet(IDB_KEY);
        if (stored && typeof stored === 'object') {
            _policies = stored;
            log.debug('Loaded %d retention policies from IDB', Object.keys(stored).length);
        }
    } catch (err) {
        log.warn('Failed to load retention policies from IDB:', (err as any).message);
    }
    _loaded = true;
}

async function _persist() {
    try {
        await idbSet(IDB_KEY, _policies);
    } catch (err) {
        log.error('Failed to persist retention policies', err);
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the effective policy for a data type. Returns configured policy
 * merged with defaults; caller never sees undefined for a known type.
 *
 * @param {string} dataType
 * @returns {Promise<RetentionPolicyEntry>}
 */
export async function getPolicy(dataType: any) {
    if (!DATA_TYPES.includes(dataType)) {
        throw new Error(`getPolicy: unknown dataType "${dataType}". Valid: ${DATA_TYPES.join(', ')}`);
    }
    await _ensureLoaded();

    const configured = _policies[dataType];
    const defaults = (DEFAULT_POLICIES as any)[dataType];
    return {
        dataType,
        retentionDays: configured ? configured.retentionDays : defaults.retentionDays,
        rationale: configured ? configured.rationale : defaults.rationale,
        updatedAt: configured ? configured.updatedAt : new Date(0).toISOString(),
        updatedBy: configured ? configured.updatedBy : 'system',
    };
}

/**
 * Get all policies (configured + defaults for missing entries).
 * @returns {Promise<RetentionPolicyEntry[]>}
 */
export async function getAllPolicies() {
    await _ensureLoaded();
    return Promise.all(DATA_TYPES.map((t) => getPolicy(t)));
}

/**
 * Set or update a policy for a data type.
 *
 * @param {Object} params
 * @param {string} params.dataType
 * @param {number} params.retentionDays - -1 or >= 1
 * @param {string} [params.rationale]
 * @param {string} [params.updatedBy]
 * @returns {Promise<RetentionPolicyEntry>}
 */
export async function setPolicy(params: any) {
    _validatePolicyParams(params, DATA_TYPES);
    await _ensureLoaded();
    const defaultRationale = (DEFAULT_POLICIES as any)[params.dataType].rationale;
    const entry = _buildPolicyEntry(params, defaultRationale);
    _policies[params.dataType] = entry;
    await _persist();
    log.info('Set policy %s=%d days', params.dataType, params.retentionDays);
    return entry;
}

/**
 * Reset a policy to its default.
 * @param {string} dataType
 * @returns {Promise<RetentionPolicyEntry>}
 */
export async function resetPolicy(dataType: any) {
    if (!DATA_TYPES.includes(dataType)) {
        throw new Error(`resetPolicy: unknown dataType "${dataType}"`);
    }
    await _ensureLoaded();
    delete _policies[dataType];
    await _persist();
    return getPolicy(dataType);
}

// ── Evaluation (pure) ───────────────────────────────────────────────────────

interface _RetentionDecision {
    action: 'delete' | 'keep';
    entry?: { id: string; reason: string; ageDays: number };
}

function _msToDays(ms: number): number {
    return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function _evaluateStakeholderShare(item: any, nowMs: number, maxAgeMs: number): _RetentionDecision {
    if (item.expiresAt) {
        const expiryMs = Date.parse(item.expiresAt);
        if (!Number.isNaN(expiryMs)) {
            const sinceExpiry = nowMs - expiryMs;
            if (sinceExpiry > maxAgeMs) {
                const ageDays = _msToDays(sinceExpiry);
                return {
                    action: 'delete',
                    entry: { id: item.id, reason: `expired ${ageDays}d ago`, ageDays },
                };
            }
        }
    }
    return { action: 'keep' };
}

function _evaluateDefaultRetentionItem(
    item: any,
    nowMs: number,
    maxAgeMs: number,
    retentionDays: number,
): _RetentionDecision {
    const ts = item.timestamp || item.createdAt;
    if (!ts) return { action: 'keep' };
    const itemMs = Date.parse(ts);
    if (Number.isNaN(itemMs)) return { action: 'keep' };
    const ageMs = nowMs - itemMs;
    if (ageMs > maxAgeMs) {
        return {
            action: 'delete',
            entry: { id: item.id, reason: `older than ${retentionDays} days`, ageDays: _msToDays(ageMs) },
        };
    }
    return { action: 'keep' };
}

/**
 * Pure function: given items and a policy, return which items should be
 * deleted per the policy. Does NOT delete anything - caller decides.
 *
 * @param {Array<{id: string, timestamp?: string, createdAt?: string, expiresAt?: string}>} items
 * @param {{retentionDays: number, dataType: string}} policy
 * @param {Date} [now=new Date()] - Injectable for deterministic tests
 * @returns {{toDelete: Array<{id: string, reason: string, ageDays: number}>, toKeep: number}}
 */
export function evaluateRetention(items: any, policy: any, now = new Date()) {
    if (!Array.isArray(items)) return { toDelete: [], toKeep: 0 };
    if (!policy || typeof policy.retentionDays !== 'number') {
        return { toDelete: [], toKeep: items.length };
    }
    // Indefinite retention
    if (policy.retentionDays === -1) {
        return { toDelete: [], toKeep: items.length };
    }

    const nowMs = now.getTime();
    const maxAgeMs = policy.retentionDays * 24 * 60 * 60 * 1000;
    /** @type {Array<{id: string, reason: string, ageDays: number}>} */
    const toDelete = [];
    let toKeep = 0;

    for (const item of items) {
        if (!item || !item.id) continue;

        const decision: _RetentionDecision =
            policy.dataType === 'stakeholder_shares' && item.expiresAt
                ? _evaluateStakeholderShare(item, nowMs, maxAgeMs)
                : _evaluateDefaultRetentionItem(item, nowMs, maxAgeMs, policy.retentionDays);

        if (decision.action === 'delete' && decision.entry) {
            toDelete.push(decision.entry);
        } else {
            toKeep++;
        }
    }

    return { toDelete, toKeep };
}

/**
 * Run a retention cleanup in dry-run mode by default. The caller supplies
 * loaders and (optionally) a deleter callback per data type. If deleter
 * is omitted for a type, it is treated as dry-run and items are only
 * reported, not removed.
 *
 * @param {Object} handlers
 * @param {Object<string, () => Promise<Array<any>>>} handlers.loaders - Map dataType → loader
 * @param {Object<string, (ids: string[]) => Promise<void>>} [handlers.deleters] - Map dataType → deleter
 * @param {boolean} [handlers.dryRun=true] - If true, never calls deleters
 * @returns {Promise<Object<string, {toDelete: number, toKeep: number, dryRun: boolean}>>}
 */
export async function runRetentionCleanup(handlers: any) {
    if (!handlers || typeof handlers !== 'object') {
        throw new Error('runRetentionCleanup: handlers object required');
    }
    const {
        loaders = {} as Record<string, any>,
        deleters = {} as Record<string, any>,
        dryRun = true,
    } = handlers;

    /** @type {Record<string, any>} */
    const results: Record<string, any> = {};
    for (const dataType of DATA_TYPES) {
        const loader = loaders[dataType];
        if (typeof loader !== 'function') {
            results[dataType] = { toDelete: 0, toKeep: 0, dryRun: true, skipped: 'no loader' };
            continue;
        }

        try {
            const items = await loader();
            const policy = await getPolicy(dataType);
            const evaluation = evaluateRetention(items, policy);
            results[dataType] = {
                toDelete: evaluation.toDelete.length,
                toKeep: evaluation.toKeep,
                dryRun,
            };

            if (!dryRun && typeof deleters[dataType] === 'function' && evaluation.toDelete.length > 0) {
                const ids = evaluation.toDelete.map((d: any) => d.id);
                await deleters[dataType](ids);
                log.info('Deleted %d %s items per retention policy', ids.length, dataType);
            }
        } catch (err) {
            log.error(`Retention cleanup failed for ${dataType}`, err);
            results[dataType] = { toDelete: 0, toKeep: 0, dryRun, error: (err as any).message };
        }
    }

    return results;
}

/**
 * Reset in-memory state. For testing only.
 */
export async function _resetForTesting(clearIdb = false) {
    _policies = {};
    _loaded = false;
    if (clearIdb) {
        await idbSet(IDB_KEY, {});
    }
}
