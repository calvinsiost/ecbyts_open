// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * tabRegistry.js - Project Tabs in-memory pure-logic store
 *
 * Pure, synchronous, no DOM, no IDB, no network. Factory retorna registry
 * isolado (multiplos registries coexistem sem side-effects globais).
 *
 * Relação com core/models/registry.js:
 *   - core/models persiste índice de modelos em IDB (layer de armazenamento).
 *   - core/projectTabs gerencia *abas abertas na UI* sobre esses modelos (layer
 *     de sessão/visualização). Uma aba referencia um modelo via `modelId`.
 *   - Múltiplas abas podem apontar para o mesmo `modelId` (duplicatas); o
 *     FSM por aba é independente do state do modelo no IDB.
 *
 * Estado por aba: { id, modelId, title, state, createdAt, updatedAt,
 *                   pinnedAt, archivedAt, closedAt, orderIndex, metadata }
 *
 * Retornos são `Object.freeze`d - callers recebem snapshots imutáveis.
 */

import { TAB_STATE, transition, ProjectTabFsmError } from './tabFsm.js';


const MAX_OPEN_DEFAULT = 10;
const MAX_ARCHIVED_DEFAULT = 50;
const TITLE_MAX = 120;

export class ProjectTabRegistryError extends Error {
    code: any;
    details: any;
    constructor(code: any, details: any = {}) {
        super(`[ProjectTabRegistry] ${code} ${JSON.stringify(details)}`);
        this.name = 'ProjectTabRegistryError';
        this.code = code;
        this.details = details;
    }
}

function _uuid(seq: any): string {
    // Para pureza + testabilidade determinística, IDs são derivados de seq interno.
    // Callers que precisam UUID real devem passar `idGenerator` em createTabRegistry.
    return `tab-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function _freezeTab(tab: any): any {
    return Object.freeze({ ...tab, metadata: Object.freeze({ ...(tab.metadata || {}) }) });
}

function _cloneTab(tab: any): any {
    return { ...tab, metadata: { ...(tab.metadata || {}) } };
}

/**
 * Cria registry isolado.
 *
 * @param opts
 * @param opts.maxOpen      default 10 (hard-limit de abas em OPEN/PINNED)
 * @param opts.maxArchived  default 50 (hard-limit em ARCHIVED)
 * @param opts.idGenerator
 * @param opts.clock  default Date.now - injetável para tests
 * @returns API congelada
 */
export function createTabRegistry(
    opts: {
        maxOpen?: number;
        maxArchived?: number;
        idGenerator?: () => string;
        clock?: () => number;
    } = {},
): object {
    const maxOpen: number = Number.isFinite(opts.maxOpen) ? (opts.maxOpen as number) : MAX_OPEN_DEFAULT;
    const maxArchived: number = Number.isFinite(opts.maxArchived)
        ? (opts.maxArchived as number)
        : MAX_ARCHIVED_DEFAULT;
    const clock = typeof opts.clock === 'function' ? opts.clock : () => Date.now();
    let seq = 0;
    const idGenerator =
        typeof opts.idGenerator === 'function'
            ? opts.idGenerator
            : () => {
                  seq += 1;
                  return _uuid(seq);
              };

    /** tabs by id (mutable internal store) */
    const tabs = new Map<string, any>();
    let orderCounter = 0;

    function _countByState(state: any): number {
        let n = 0;
        for (const t of tabs.values()) if (t.state === state) n += 1;
        return n;
    }

    function _assertNotClosed(tab: any) {
        if (tab.state === TAB_STATE.CLOSED) {
            throw new ProjectTabRegistryError('tab_already_closed', { id: tab.id });
        }
    }

    function openTab({ modelId = null, title = 'Sem título', metadata = {} }: any = {}) {
        if (modelId != null && typeof modelId !== 'string') {
            throw new ProjectTabRegistryError('invalid_modelId', { modelId });
        }
        if (typeof title !== 'string') {
            throw new ProjectTabRegistryError('invalid_title', { title });
        }
        const openCount = _countByState(TAB_STATE.OPEN) + _countByState(TAB_STATE.PINNED);
        if (openCount >= maxOpen) {
            throw new ProjectTabRegistryError('open_limit_reached', { maxOpen, openCount });
        }
        const now = clock();
        orderCounter += 1;
        const tab: any = {
            id: idGenerator(),
            modelId,
            title: String(title).slice(0, TITLE_MAX),
            state: TAB_STATE.UNINITIALIZED,
            createdAt: now,
            updatedAt: now,
            pinnedAt: null,
            archivedAt: null,
            closedAt: null,
            orderIndex: orderCounter,
            metadata: { ...metadata },
        };
        tab.state = transition(tab.state, TAB_STATE.OPEN);
        tab.updatedAt = clock();
        tabs.set(tab.id, tab);
        return _freezeTab(tab);
    }

    function _mutateState(id: any, toState: any, timestampField: any) {
        const tab = tabs.get(id);
        if (!tab) throw new ProjectTabRegistryError('tab_not_found', { id });
        _assertNotClosed(tab);
        try {
            tab.state = transition(tab.state, toState);
        } catch (err) {
            if (err instanceof ProjectTabFsmError) {
                const details = (err.details || {}) as { from?: unknown; to?: unknown };
                throw new ProjectTabRegistryError('invalid_transition', {
                    id,
                    from: details.from,
                    to: details.to,
                });
            }
            throw err;
        }
        const now = clock();
        tab.updatedAt = now;
        if (timestampField) tab[timestampField] = now;
        return _freezeTab(tab);
    }

    function pinTab(id: any) {
        return _mutateState(id, TAB_STATE.PINNED, 'pinnedAt');
    }

    function unpinTab(id: any) {
        // PINNED → OPEN
        const tab = tabs.get(id);
        if (!tab) throw new ProjectTabRegistryError('tab_not_found', { id });
        if (tab.state !== TAB_STATE.PINNED) {
            throw new ProjectTabRegistryError('not_pinned', { id, state: tab.state });
        }
        return _mutateState(id, TAB_STATE.OPEN, null);
    }

    function archiveTab(id: any) {
        const archivedCount = _countByState(TAB_STATE.ARCHIVED);
        if (archivedCount >= maxArchived) {
            throw new ProjectTabRegistryError('archived_limit_reached', {
                maxArchived,
                archivedCount,
            });
        }
        return _mutateState(id, TAB_STATE.ARCHIVED, 'archivedAt');
    }

    function restoreTab(id: any) {
        // ARCHIVED → OPEN
        const tab = tabs.get(id);
        if (!tab) throw new ProjectTabRegistryError('tab_not_found', { id });
        if (tab.state !== TAB_STATE.ARCHIVED) {
            throw new ProjectTabRegistryError('not_archived', { id, state: tab.state });
        }
        const openCount = _countByState(TAB_STATE.OPEN) + _countByState(TAB_STATE.PINNED);
        if (openCount >= maxOpen) {
            throw new ProjectTabRegistryError('open_limit_reached', { maxOpen, openCount });
        }
        return _mutateState(id, TAB_STATE.OPEN, null);
    }

    function closeTab(id: any) {
        return _mutateState(id, TAB_STATE.CLOSED, 'closedAt');
    }

    function getTab(id: any) {
        const tab = tabs.get(id);
        return tab ? _freezeTab(tab) : null;
    }

    function findByModelId(modelId: any) {
        const out = [];
        for (const t of tabs.values()) {
            if (t.modelId === modelId) out.push(_freezeTab(t));
        }
        return Object.freeze(out);
    }

    function _listByState(state: any) {
        const out = [];
        for (const t of tabs.values()) {
            if (t.state === state) out.push(_freezeTab(t));
        }
        out.sort((a, b) => a.orderIndex - b.orderIndex);
        return Object.freeze(out);
    }

    function listOpen() {
        // Inclui PINNED (PINNED é subset visualmente "aberto")
        const out = [];
        for (const t of tabs.values()) {
            if (t.state === TAB_STATE.OPEN || t.state === TAB_STATE.PINNED) {
                out.push(_freezeTab(t));
            }
        }
        out.sort((a, b) => a.orderIndex - b.orderIndex);
        return Object.freeze(out);
    }

    function listPinned() {
        return _listByState(TAB_STATE.PINNED);
    }

    function listArchived() {
        return _listByState(TAB_STATE.ARCHIVED);
    }

    function listClosed() {
        return _listByState(TAB_STATE.CLOSED);
    }

    function listAll() {
        const out = [];
        for (const t of tabs.values()) out.push(_freezeTab(t));
        out.sort((a, b) => a.orderIndex - b.orderIndex);
        return Object.freeze(out);
    }

    function renameTab(id: any, newTitle: any) {
        if (typeof newTitle !== 'string' || newTitle.length === 0) {
            throw new ProjectTabRegistryError('invalid_title', { newTitle });
        }
        const tab = tabs.get(id);
        if (!tab) throw new ProjectTabRegistryError('tab_not_found', { id });
        _assertNotClosed(tab);
        tab.title = newTitle.slice(0, TITLE_MAX);
        tab.updatedAt = clock();
        return _freezeTab(tab);
    }

    function updateMetadata(id: any, patch: any) {
        if (!patch || typeof patch !== 'object') {
            throw new ProjectTabRegistryError('invalid_metadata_patch', { patch });
        }
        const tab = tabs.get(id);
        if (!tab) throw new ProjectTabRegistryError('tab_not_found', { id });
        _assertNotClosed(tab);
        tab.metadata = { ...tab.metadata, ...patch };
        tab.updatedAt = clock();
        return _freezeTab(tab);
    }

    function size() {
        return tabs.size;
    }

    function snapshot() {
        // Snapshot completo serializável (útil para broadcast / migration)
        const list = [];
        for (const t of tabs.values()) list.push(_cloneTab(t));
        list.sort((a, b) => a.orderIndex - b.orderIndex);
        return Object.freeze({
            version: 1,
            capturedAt: clock(),
            tabs: Object.freeze(list.map((t) => Object.freeze(t))),
            config: Object.freeze({ maxOpen, maxArchived }),
        });
    }

    function clear() {
        tabs.clear();
        orderCounter = 0;
    }

    return Object.freeze({
        // lifecycle
        openTab,
        pinTab,
        unpinTab,
        archiveTab,
        restoreTab,
        closeTab,
        // accessors
        getTab,
        findByModelId,
        listOpen,
        listPinned,
        listArchived,
        listClosed,
        listAll,
        size,
        snapshot,
        // mutators leves
        renameTab,
        updateMetadata,
        // maintenance
        clear,
        // config read-only
        config: Object.freeze({ maxOpen, maxArchived }),
    });
}
