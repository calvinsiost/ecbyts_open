// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// modelVcsPersistence — F2 do SPEC_MODEL_VCS_GIT.
//
// PT: camada de persistência do repo VCS (modelVcs F1) via IndexedDB.
// PURE-logic + adapter assíncrono — serialize/hydrate determinísticos,
// idbStore como injetável (default: o real do app). REUSE: scopedKey
// de core/models/registry.js + idbSet/idbGet/idbDelete de utils/storage/
// idbStore.js (NÃO duplica). Coerente com MH5 da spec ("idbStore (chave
// scopedKey(modelId,'vcs')) — NÃO localStorage raw, NÃO novo wrapper").
//
// Sem DOM/THREE; serialização/hidratação puras testáveis em Node.
import { scopedKey } from './registry.js';

/** Sufixo canônico p/ a chave IDB do repo VCS. */
export const VCS_IDB_SUFFIX = 'vcs';

/**
 * Calcula a chave IDB scopeada para o repo VCS de um modelo.
 * @param {string} modelId
 * @returns {string}
 */
export function vcsRepoKey(modelId: any) {
    if (!modelId || typeof modelId !== 'string') {
        throw new TypeError('vcsRepoKey: modelId must be non-empty string');
    }
    return scopedKey(modelId, VCS_IDB_SUFFIX);
}

/**
 * Serializa repo p/ JSON-safe (estrutura plain). Mantém todas as
 * propriedades estruturais sem mutação no input. Determinístico:
 * mesmo repo → mesma string.
 * @param {object} repo
 * @returns {string}
 */
export function serializeRepo(repo: any) {
    if (!repo || typeof repo !== 'object') {
        throw new TypeError('serializeRepo: repo must be object');
    }
    return JSON.stringify(repo, sortedKeysReplacer);
}

/**
 * Hidrata repo a partir de JSON string. Robusto: detecta versão (v),
 * valida estrutura mínima (modelId/commits/refs/head).
 * @param {string} json
 * @returns {object}
 */
export function hydrateRepo(json: any) {
    if (typeof json !== 'string') {
        throw new TypeError('hydrateRepo: json must be string');
    }
    let parsed;
    try {
        parsed = JSON.parse(json);
    } catch (err: any) {
        throw new Error(`hydrateRepo: invalid JSON (${err && err.message})`, { cause: err });
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('hydrateRepo: parsed value is not object');
    }
    if (typeof parsed.modelId !== 'string' || !parsed.commits || !parsed.refs) {
        throw new Error('hydrateRepo: missing required fields (modelId/commits/refs)');
    }
    return parsed;
}

/**
 * Replacer de JSON.stringify que ordena chaves p/ determinismo. Útil
 * p/ checksum/diff de repos serializados.
 * @param {string} key
 * @param {*} value
 */
function sortedKeysReplacer(key: any, value: any) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const sorted = {};
        const keys = Object.keys(value).sort();
        for (const k of keys) (sorted as any)[k] = value[k];
        return sorted;
    }
    return value;
}

/**
 * Mantém só os últimos N commits no repo (compactação opcional p/
 * controlar custo IDB). NÃO mutação — retorna repo novo. Refs/branches
 * preservados; commits descartados são os mais antigos não-alcançáveis
 * por nenhum ref (preserve-reachable). Se vc passar `maxCommits=0` →
 * no-op (retorna repo idêntico).
 * @param {object} repo
 * @param {number} maxCommits
 * @returns {object}
 */
export function compactRepo(repo: any, maxCommits: any) {
    if (!repo || typeof repo !== 'object' || !repo.commits || !repo.refs) {
        throw new TypeError('compactRepo: invalid repo');
    }
    if (!maxCommits || maxCommits < 1) return repo;
    const reachable = collectReachable(repo);
    const all = Object.keys(repo.commits);
    if (all.length <= maxCommits) return repo;
    // Ordena por timestamp asc; mantém os reachable + os mais recentes.
    const byTs = all.map((id: any) => ({ id, ts: repo.commits[id]?.timestamp || 0 })).sort((a: any, b: any) => a.ts - b.ts);
    const keep = new Set(reachable);
    // Adiciona mais recentes até atingir maxCommits.
    for (let i = byTs.length - 1; i >= 0 && keep.size < maxCommits; i -= 1) {
        keep.add(byTs[i]!.id);
    }
    const nextCommits: any = {};
    for (const id of Object.keys(repo.commits)) {
        if (keep.has(id)) nextCommits[id] = repo.commits[id];
    }
    return { ...repo, commits: nextCommits };
}

/** Coleta commits alcançáveis de qualquer ref (BFS por parent). */
function collectReachable(repo: any) {
    const seen = new Set();
    const queue = [];
    for (const refName of Object.keys(repo.refs || {})) {
        const head = repo.refs[refName];
        if (head) queue.push(head);
    }
    while (queue.length > 0) {
        const id: any = queue.shift();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const c: any = repo.commits[id];
        if (!c) continue;
        if (c.parent) queue.push(c.parent);
        if (c.parent2) queue.push(c.parent2);
    }
    return seen;
}

/**
 * Adapter de persistência (factory). Inject `idb` p/ testar sem
 * tocar IndexedDB real (default: real idbStore).
 * Uso: `const p = createVcsPersistence({ idb }); await p.save(repo);`
 * @param {{idb?:{idbSet:Function,idbGet:Function,idbDelete:Function}}} [opts]
 */
export function createVcsPersistence(opts: any = {}) {
    const idb = opts.idb;
    if (!idb || typeof idb.idbSet !== 'function' || typeof idb.idbGet !== 'function') {
        throw new TypeError('createVcsPersistence: opts.idb must expose idbSet+idbGet+idbDelete');
    }
    return {
        /** Persiste repo (chave scopedKey(modelId,'vcs')). */
        async save(repo: any) {
            if (!repo || !repo.modelId) throw new TypeError('save: repo.modelId required');
            return idb.idbSet(vcsRepoKey(repo.modelId), serializeRepo(repo));
        },
        /** Carrega repo (null se ausente). */
        async load(modelId: any) {
            const raw = await idb.idbGet(vcsRepoKey(modelId));
            if (raw == null) return null;
            return hydrateRepo(typeof raw === 'string' ? raw : JSON.stringify(raw));
        },
        /** Remove repo do IDB. */
        async remove(modelId: any) {
            if (typeof idb.idbDelete !== 'function') return undefined;
            return idb.idbDelete(vcsRepoKey(modelId));
        },
        /** Save com compaction opcional (maxCommits). */
        async saveCompacted(repo: any, maxCommits: any) {
            const compact = compactRepo(repo, maxCommits);
            return idb.idbSet(vcsRepoKey(compact.modelId), serializeRepo(compact));
        },
    };
}
