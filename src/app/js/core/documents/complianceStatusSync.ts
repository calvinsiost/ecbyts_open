// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Status — KEY-FIRST store (F1)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md +
 * docs/specs/arch/SPEC_KEY_FIRST_DATA_LOCALITY.md §4-F1
 *
 * KEY-FIRST (F1): o status de conformidade é dado do modelo do usuário — a
 * fonte primária é a CHAVE ECBT (model.documentsCompliance), NÃO o Supabase.
 * O espelho na tabela document_compliance_status (queue + upsert direto) foi
 * REMOVIDO neste item: zero leitores reais confirmados (frontend, edge
 * functions — a tabela já vive no schema legacy desde a phase5k e fica morta,
 * não-destrutivo). A trilha append-only continua no complianceAuditLog
 * (IndexedDB); o snapshot por documento vive no store abaixo + cache sync
 * localStorage (buildModel é síncrono) e viaja na chave. Importar uma chave
 * SUBSTITUI o store (key-wins, I4).
 */
import { deepClone as _deepCloneCanonical } from '../../utils/helpers/deepClone.js';
export const DOCUMENT_COMPLIANCE_STATUS_TABLE = 'document_compliance_status';
export const DOCUMENT_COMPLIANCE_STATUS_META = Object.freeze({
    spec: 'DOC-COMP-001',
    phase: 26,
    deliveredAt: '2026-05-01',
    table: DOCUMENT_COMPLIANCE_STATUS_TABLE,
    schema: 'api',
    operation: 'upsert',
});
const VALID_STATUSES = Object.freeze(['pass', 'warn', 'fail']);
const MAX_VIOLATIONS_IN_STATUS_ROW = 100;
/**
 * Build the Supabase row for document.complianceStatus.
 *
 * @param {any} input
 * @returns {Object}
 */
export function buildDocumentComplianceStatus(input: any) {
    if (!input || typeof input !== 'object') {
        throw new TypeError('input must be object');
    }
    const documentId = _requiredString(input.documentId, 'documentId');
    const result = _normalizeComplianceResult(input.result);
    const actor = _normalizeActor(input.actor);
    const timestamp = _normalizeTimestamp(input.timestamp);
    const source = String(input.source || 'report_editor').trim() || 'report_editor';
    const report = input.report && typeof input.report === 'object' ? input.report : {};
    const storeStats = _readStoreStats(input.store, documentId);
    const auditStats = _readAuditStats(input.auditLog, documentId);
    const counts = _countResultIssues(result);
    const ownerId = _isUuid(actor.id) ? actor.id : null;
    const row = {
        id: _buildStableRowId(documentId, actor.id),
        document_id: documentId,
        owner_id: ownerId,
        project_id: _optionalString(input.projectId),
        org_id: _isUuid(input.orgId) ? String(input.orgId) : null,
        report_title: _optionalString(report.title),
        status: result.status,
        issue_count: counts.issueCount,
        error_count: counts.errorCount,
        warning_count: counts.warningCount,
        info_count: counts.infoCount,
        pass_count: counts.passCount,
        revision_state: storeStats.revisionState,
        provenance_count: storeStats.provenanceCount,
        revision_count: storeStats.revisionCount,
        audit_event_count: auditStats.auditEventCount,
        latest_audit_event_type: auditStats.latestAuditEventType,
        summary: _cloneJson(result.summary),
        violations: result.violations.slice(0, MAX_VIOLATIONS_IN_STATUS_ROW).map(_normalizeViolation),
        metadata: {
            spec: DOCUMENT_COMPLIANCE_STATUS_META.spec,
            phase: DOCUMENT_COMPLIANCE_STATUS_META.phase,
            source,
            truncatedViolations: Math.max(0, result.violations.length - MAX_VIOLATIONS_IN_STATUS_ROW),
        },
        source,
        actor_id: _optionalString(actor.id),
        actor_name: _optionalString(actor.name || actor.email),
        checked_at: timestamp,
    };
    return Object.freeze(_dropNullishOwner(row));
}
/**
 * Store local + ponte com a chave (KEY-FIRST F1): grava o snapshot no store
 * do modelo (um por documento, o mais recente vence) e no cache sync.
 *
 * @param {Object} input
 * @param {{resolveActorFn?:Function}} [options]
 * @returns {Promise<Object>}
 */
export async function syncDocumentComplianceStatus(input: any, options: any = {}) {
    const actor = input?.actor || (await _resolveRuntimeActor(options));
    const row = buildDocumentComplianceStatus({ ...input, actor });
    return storeDocumentComplianceStatus(row);
}
/**
 * Grava um status row no store local (mesma validação fail-closed de antes).
 * @param {Object} statusRow
 * @returns {Object}
 */
export function storeDocumentComplianceStatus(statusRow: any) {
    const row = _normalizeStatusRow(statusRow);
    _hydrate();
    _statusByDocument[row.document_id] = row;
    _persistCache();
    return Object.freeze({
        ok: true,
        stored: 'model',
        documentId: row.document_id,
        row,
    });
}
/**
 * Lê o status mais recente de um documento (servido do store local — a
 * trilha append-only completa fica no complianceAuditLog, IndexedDB).
 * @param {string} documentId
 * @returns {Object|null}
 */
export function getDocumentComplianceStatus(documentId: any) {
    _hydrate();
    const id = String(documentId || '').trim();
    const row = id ? _statusByDocument[id] : null;
    return row ? _cloneJson(row) : null;
}

// ----------------------------------------------------------------
// KEY-FIRST F1: store + cache + ponte com a chave ECBT
// ----------------------------------------------------------------
const CACHE_KEY = 'ecbyts-doc-compliance-status-v1';
/** @type {Record<string, any>} */
let _statusByDocument: any = {};
let _hydrated = false;

function _storage(): any {
    try {
        return (globalThis as any).localStorage ?? null;
    } catch {
        return null; // node/test sem localStorage — cache simplesmente ausente
    }
}
function _persistCache() {
    const ls = _storage();
    if (!ls) return;
    try {
        ls.setItem(CACHE_KEY, JSON.stringify({ version: 1, statuses: Object.values(_statusByDocument) }));
    } catch (e: any) {
        console.debug('[complianceStatusSync:cache-save]', e?.message || e);
    }
}
function _hydrate() {
    if (_hydrated) return;
    _hydrated = true;
    const ls = _storage();
    if (!ls) return;
    try {
        const raw = ls.getItem(CACHE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        for (const row of Array.isArray(parsed?.statuses) ? parsed.statuses : []) {
            if (row && typeof row === 'object' && typeof row.document_id === 'string' && row.document_id) {
                _statusByDocument[row.document_id] = row;
            }
        }
    } catch (e: any) {
        console.debug('[complianceStatusSync:cache-load]', e?.message || e);
    }
}

/** Seção model.documentsCompliance da chave: {version, statuses[]}. SYNC —
 *  memória→cache→UNDEFINED (export.ts omite a seção: anti-clobber). */
export function exportDocumentsCompliance() {
    _hydrate();
    const statuses = Object.values(_statusByDocument);
    if (statuses.length) return { version: 1, statuses: _cloneJson(statuses) };
    return undefined;
}
/** Import da chave SUBSTITUI o store (a chave é a verdade — I1/I4 key-wins)
 *  e regrava o cache. Rows malformadas são puladas, nunca quebram o import. */
export function importDocumentsCompliance(data: any) {
    const next: any = {};
    for (const raw of Array.isArray(data?.statuses) ? data.statuses : []) {
        try {
            const row = _normalizeStatusRow(raw);
            next[row.document_id] = row;
        } catch (e: any) {
            console.debug('[complianceStatusSync:import-row]', e?.message || e);
        }
    }
    _statusByDocument = next;
    _hydrated = true;
    _persistCache();
}
/** Teste/higiene: esvazia o store e o cache (não usado em produção). */
export function _resetDocumentsComplianceForTests() {
    _statusByDocument = {};
    _hydrated = false;
    const ls = _storage();
    if (ls) {
        try {
            ls.removeItem(CACHE_KEY);
        } catch (e: any) {
            console.debug('[complianceStatusSync:reset-cache]', e?.message || e);
        }
    }
}
export const documentComplianceStatusMeta = DOCUMENT_COMPLIANCE_STATUS_META;
async function _resolveRuntimeActor(options: any) {
    if (typeof options.resolveActorFn === 'function') {
        return _normalizeActor(await options.resolveActorFn());
    }
    try {
        const session = await import('../../utils/auth/session.js' as string);
        const user = session.getCurrentUser?.();
        return _normalizeActor({
            id: user?.id,
            email: user?.email,
            name: /** @type {any} */ (user?.user_metadata)?.name || /** @type {any} */ (user?.user_metadata)?.full_name,
        });
    }
    catch {
        return _normalizeActor(null);
    }
}
function _normalizeComplianceResult(result: any) {
    if (!result || typeof result !== 'object') {
        throw new TypeError('compliance result required');
    }
    const status = String(result.status || '').trim();
    if (!VALID_STATUSES.includes(status)) {
        throw new Error(`Invalid compliance status "${status}"`);
    }
    const summary = result.summary && typeof result.summary === 'object' ? result.summary : {};
    const violations = Array.isArray(result.violations) ? result.violations : [];
    return Object.freeze({
        status,
        summary: _cloneJson(summary),
        violations: violations.map(_normalizeViolation),
    });
}
function _normalizeStatusRow(row: any) {
    if (!row || typeof row !== 'object') {
        throw new TypeError('status row required');
    }
    const documentId = _requiredString(row.document_id || row.documentId, 'document_id');
    const id = _requiredString(row.id, 'id');
    const status = String(row.status || '').trim();
    if (!VALID_STATUSES.includes(status)) {
        throw new Error(`Invalid compliance status "${status}"`);
    }
    return Object.freeze({
        ...row,
        id,
        document_id: documentId,
        status,
    });
}
function _countResultIssues(result: any) {
    const violations = result.violations;
    const fallback = {
        errorCount: violations.filter((v: any) => v.severity === 'error').length,
        warningCount: violations.filter((v: any) => v.severity === 'warning').length,
        infoCount: violations.filter((v: any) => v.severity === 'info').length,
        passCount: 0,
    };
    const summary = result.summary || {};
    const errorCount = _toNonNegativeInt(summary.errors, fallback.errorCount);
    const warningCount = _toNonNegativeInt(summary.warnings, fallback.warningCount);
    const infoCount = _toNonNegativeInt(summary.info, fallback.infoCount);
    const passCount = _toNonNegativeInt(summary.passes, fallback.passCount);
    return {
        errorCount,
        warningCount,
        infoCount,
        passCount,
        issueCount: errorCount + warningCount + infoCount,
    };
}
function _readStoreStats(store: any, documentId: any) {
    if (!store || typeof store !== 'object') {
        return { provenanceCount: 0, revisionCount: 0, revisionState: null };
    }
    const provenance = typeof store.getProvenance === 'function' ? store.getProvenance(documentId) : [];
    const revisions = typeof store.getRevisions === 'function' ? store.getRevisions(documentId) : [];
    const currentState = typeof store.getCurrentState === 'function' ? store.getCurrentState(documentId) : null;
    const latestRevision = Array.isArray(revisions) && revisions.length > 0 ? revisions[revisions.length - 1] : null;
    return {
        provenanceCount: Array.isArray(provenance) ? provenance.length : 0,
        revisionCount: Array.isArray(revisions) ? revisions.length : 0,
        revisionState: _optionalString(currentState || latestRevision?.state),
    };
}
function _readAuditStats(auditLog: any, documentId: any) {
    if (!auditLog || typeof auditLog !== 'object' || typeof auditLog.getByDocument !== 'function') {
        return { auditEventCount: 0, latestAuditEventType: null };
    }
    const entries = auditLog.getByDocument(documentId);
    const list = Array.isArray(entries) ? entries : [];
    const latest = list[list.length - 1] || null;
    return {
        auditEventCount: list.length,
        latestAuditEventType: _optionalString(latest?.eventType),
    };
}
function _normalizeViolation(value: any) {
    const issue = value && typeof value === 'object' ? value : {};
    return {
        severity: _optionalString(issue.severity) || 'info',
        ruleId: _optionalString(issue.ruleId),
        ruleName: _optionalString(issue.ruleName),
        message: _optionalString(issue.message),
        location: issue.location && typeof issue.location === 'object' ? _cloneJson(issue.location) : {},
        suggestion: _optionalString(issue.suggestion),
    };
}
function _buildStableRowId(documentId: any, actorId: any) {
    const owner = String(actorId || 'local').trim() || 'local';
    const raw = `document_compliance_status:${owner}:${documentId}`;
    if (raw.length <= 240)
        return raw;
    return `document_compliance_status:${_fnv1a(raw)}`;
}
function _requiredString(value: any, name: any) {
    const normalized = String(value || '').trim();
    if (!normalized)
        throw new Error(`${name} required`);
    return normalized;
}
function _optionalString(value: any) {
    if (value === null || value === undefined)
        return null;
    const normalized = String(value).trim();
    return normalized || null;
}
function _normalizeActor(actor: any) {
    const value = actor && typeof actor === 'object' ? actor : {};
    return Object.freeze({
        id: _optionalString(value.id || value.userId || value.actorId),
        name: _optionalString(value.name || value.fullName || value.displayName),
        email: _optionalString(value.email),
    });
}
function _normalizeTimestamp(value: any) {
    const input = value || new Date().toISOString();
    const parsed = Date.parse(input);
    if (Number.isNaN(parsed)) {
        throw new Error('timestamp must be ISO 8601 parseable');
    }
    return new Date(parsed).toISOString();
}
function _toNonNegativeInt(value: any, fallback: any) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.max(0, Math.trunc(n));
}
function _cloneJson(value: any) {
    return _deepCloneCanonical(value ?? null);
}
function _dropNullishOwner(row: any) {
    const out = { ...row };
    if (!out.owner_id)
        delete out.owner_id;
    if (!out.org_id)
        delete out.org_id;
    if (!out.project_id)
        delete out.project_id;
    return out;
}
function _isUuid(value: any) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}
import { fnv1aHashHex as _fnv1aHashHex } from '../../utils/helpers/hashFnv1a.js';
function _fnv1a(value: any) {
    return _fnv1aHashHex(value);
}
