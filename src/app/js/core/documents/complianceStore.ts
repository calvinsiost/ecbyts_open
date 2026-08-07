// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Store - Phase 2 partial (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S5
 *
 * Phase 2 (2026-05-01) - pure-logic store de provenance + revision FSM.
 * Substitui `Map`-based mocks dos cheap tests por shape persistível
 * compatível com IDB downstream (sem dependência direta de IndexedDB).
 *
 * Estratégia:
 *   - InMemoryStore implementa contrato `compliance.store` para tests
 *   - SerializableStore expõe `toSnapshot()` + `fromSnapshot()` para
 *     integração futura com `utils/storage/idbStore.js`
 *   - Validation gates fail-closed: invalid transition → throw
 *   - Append-only revisions (delete = soft, com tombstone status)
 *
 * Owner: Claude (orquestrador apropriador)
 */

import {
    PROVENANCE_SOURCES,
    REVISION_STATES,
    // eslint-disable-next-line
    REVISION_TRANSITIONS,
    canTransition,
    RevisionStateError,
} from './complianceValidator.js';
import { idbDelete, idbGet, idbSet } from '../../utils/storage/idbStore.js';

const STORE_VERSION = 1;
const DEFAULT_IDB_KEY = 'document-compliance-store:v1';

/** Identidade do store. */
export const COMPLIANCE_STORE_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 2,
    deliveredAt: '2026-05-01',
    storeVersion: STORE_VERSION,
    idbKey: DEFAULT_IDB_KEY,
});

export const COMPLIANCE_STORE_IDB_KEY = DEFAULT_IDB_KEY;

/**
 * Cria provenance entry validado.
 *
 * @param {Object} input
 * @param {string} input.documentId
 * @param {string} input.source - uma de PROVENANCE_SOURCES
 * @param {string} [input.actor]
 * @param {string} [input.timestamp] - ISO8601
 * @returns {Object} provenance entry frozen
 * @throws {Error} se source inválida ou documentId vazio
 */
export function createProvenanceEntry(input: any) {
    if (!input || typeof input !== 'object') {
        throw new TypeError('input must be object');
    }
    const documentId = String(input.documentId || '').trim();
    if (!documentId) throw new Error('documentId required');

    const source = String(input.source || '').trim();
    if (!PROVENANCE_SOURCES.includes(source)) {
        throw new Error(`Invalid provenance source "${source}"`);
    }

    const actor = input.actor ? String(input.actor) : null;
    const timestamp = input.timestamp || new Date().toISOString();

    return Object.freeze({
        id: `prov-${documentId}-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        documentId,
        source,
        actor,
        timestamp,
    });
}

/**
 * Cria revision entry validado.
 *
 * @param {Object} input
 * @param {string} input.documentId
 * @param {string} input.state - uma de REVISION_STATES
 * @param {string} [input.actor]
 * @param {string} [input.note]
 * @param {string} [input.timestamp]
 * @returns {Object} revision entry frozen
 * @throws {Error} se state inválido
 */
export function createRevisionEntry(input: any) {
    if (!input || typeof input !== 'object') {
        throw new TypeError('input must be object');
    }
    const documentId = String(input.documentId || '').trim();
    if (!documentId) throw new Error('documentId required');

    const state = String(input.state || '').trim();
    if (!REVISION_STATES.includes(state)) {
        throw new Error(`Invalid revision state "${state}"`);
    }

    return Object.freeze({
        id: `rev-${documentId}-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        documentId,
        state,
        actor: input.actor ? String(input.actor) : null,
        note: input.note ? String(input.note) : null,
        timestamp: input.timestamp || new Date().toISOString(),
    });
}

/**
 * In-memory store para provenance + revisions (testável, sem IDB).
 *
 * Append-only: addProvenance/addRevision sempre push. Para "deletar"
 * use revision com state=archived (soft delete tombstone).
 */
export class InMemoryComplianceStore {
    _provenance: any;
    _revisions: any;
    constructor() {
        this._provenance = new Map(); // documentId → Array<provenanceEntry>
        this._revisions = new Map(); // documentId → Array<revisionEntry>
    }

    /**
     * Adiciona provenance entry. Aceita instância de createProvenanceEntry
     * ou input bruto (será validado).
     */
    addProvenance(/** @type {any} */ input: any) {
        const entry = input?.id?.startsWith('prov-') ? input : createProvenanceEntry(input);
        const list = this._provenance.get(entry.documentId) || [];
        list.push(entry);
        this._provenance.set(entry.documentId, list);
        return entry;
    }

    /**
     * Adiciona revision entry com validação de transição.
     * Se já existe revisão anterior, valida `canTransition(prev.state, new.state)`.
     */
    addRevision(/** @type {any} */ input: any) {
        const entry = input?.id?.startsWith('rev-') ? input : createRevisionEntry(input);
        const list = this._revisions.get(entry.documentId) || [];
        const prev = list[list.length - 1];
        if (prev && !canTransition(prev.state, entry.state)) {
            throw new RevisionStateError(
                `Invalid transition from "${prev.state}" to "${entry.state}" for document ${entry.documentId}`,
            );
        }
        list.push(entry);
        this._revisions.set(entry.documentId, list);
        return entry;
    }

    /**
     * Retorna provenance entries para um documento (ordem cronológica).
     */
    getProvenance(/** @type {any} */ documentId: any) {
        return [...(this._provenance.get(String(documentId)) || [])];
    }

    /**
     * Retorna revision history para um documento.
     */
    getRevisions(/** @type {any} */ documentId: any) {
        return [...(this._revisions.get(String(documentId)) || [])];
    }

    /**
     * Retorna estado atual (última revisão) ou null.
     */
    getCurrentState(/** @type {any} */ documentId: any) {
        const list = this._revisions.get(String(documentId)) || [];
        return list.length > 0 ? list[list.length - 1].state : null;
    }

    /**
     * Lista todos os document IDs registrados (provenance ∪ revisions).
     */
    listDocumentIds() {
        const ids = new Set();
        for (const k of this._provenance.keys()) ids.add(k);
        for (const k of this._revisions.keys()) ids.add(k);
        return [...ids].sort();
    }

    /**
     * Conta entries: { provenance: N, revisions: N, documents: N }
     */
    summary() {
        let provCount = 0;
        let revCount = 0;
        for (const arr of this._provenance.values()) provCount += arr.length;
        for (const arr of this._revisions.values()) revCount += arr.length;
        return {
            provenance: provCount,
            revisions: revCount,
            documents: this.listDocumentIds().length,
        };
    }

    /**
     * Serializa para snapshot persistível.
     */
    toSnapshot() {
        return {
            version: STORE_VERSION,
            provenance: Object.fromEntries(this._provenance),
            revisions: Object.fromEntries(this._revisions),
        };
    }

    /**
     * Restaura store a partir de snapshot. Mutates this store.
     * Não valida transições (assume snapshot já validado).
     *
     * @returns {InMemoryComplianceStore} this para chaining
     */
    static fromSnapshot(/** @type {any} */ snapshot: any) {
        if (!snapshot || typeof snapshot !== 'object') {
            throw new TypeError('snapshot must be object');
        }
        if (snapshot.version !== STORE_VERSION) {
            throw new Error(`Unsupported snapshot version ${snapshot.version} (expected ${STORE_VERSION})`);
        }
        const store = new InMemoryComplianceStore();
        const prov = snapshot.provenance || {};
        const revs = snapshot.revisions || {};
        for (const [docId, entries] of Object.entries(prov)) {
            if (Array.isArray(entries)) store._provenance.set(docId, [...entries]);
        }
        for (const [docId, entries] of Object.entries(revs)) {
            if (Array.isArray(entries)) store._revisions.set(docId, [...entries]);
        }
        return store;
    }

    /**
     * Limpa store completamente (test helper).
     */
    clear() {
        this._provenance.clear();
        this._revisions.clear();
    }
}

/**
 * Cria store factory.
 *
 * @returns {InMemoryComplianceStore}
 */
export function createComplianceStore() {
    return new InMemoryComplianceStore();
}

function _resolvePersistenceKey(/** @type {any} */ key: any) {
    const k = String(key || DEFAULT_IDB_KEY).trim();
    if (!k) throw new Error('compliance store persistence key required');
    return k;
}

/**
 * Persiste snapshot do store no IndexedDB via wrapper canônico.
 *
 * @param {InMemoryComplianceStore} store
 * @param {{key?: string}} [options]
 * @returns {Promise<boolean>}
 */
export async function persistComplianceStore(store: any, options: { key?: string } = {}) {
    if (!store || typeof store.toSnapshot !== 'function') {
        throw new TypeError('store with toSnapshot() required');
    }
    return idbSet(_resolvePersistenceKey(options.key), store.toSnapshot());
}

/**
 * Carrega store do IndexedDB. Ausência de dado retorna store vazio.
 *
 * @param {{key?: string}} [options]
 * @returns {Promise<InMemoryComplianceStore>}
 */
export async function loadComplianceStore(options: { key?: string } = {}) {
    const snapshot = await idbGet(_resolvePersistenceKey(options.key));
    if (!snapshot) return createComplianceStore();
    return InMemoryComplianceStore.fromSnapshot(snapshot);
}

/**
 * Remove snapshot persistido do IndexedDB.
 *
 * @param {{key?: string}} [options]
 * @returns {Promise<boolean>}
 */
export async function deletePersistedComplianceStore(options: { key?: string } = {}) {
    return idbDelete(_resolvePersistenceKey(options.key));
}

/**
 * Module identity export.
 */
export const complianceStoreMeta = COMPLIANCE_STORE_META;
