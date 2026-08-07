// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// modelVcs — In-App Git-Like Model Versioning (F1, pure-logic orchestrator)
// PT: Camada de versionamento estilo Git para modelos PDPL-U. NÃO reimplementa
//     diff/merge/hash — orquestra os motores existentes (core/diff + core/crypto).
//     100% determinístico: o chamador fornece timestamps/autor; este módulo
//     nunca usa Date.now() nem Math.random(). Sem DOM/rede/THREE.
//
// Anti-duplication (CLAUDE.md AI-8x-dup): toda diferenciação é delegada a
// diffModels(), toda fusão a mergeModels(), todo resumo a buildDelta(). O único
// hash local é um FNV-1a síncrono usado EXCLUSIVAMENTE para derivar commit ids
// determinísticos (NÃO para diff/merge/integridade) — permitido pelo contrato.
import { diffModels, mergeModels, buildDelta } from '../diff/engine.js';
import { deepClone, deepEqual } from '../diff/helpers.js';
import { hashToBase64URL } from '../crypto/hashChain.js';
/**
 * Pure synchronous FNV-1a 32-bit digest → 8-hex string.
 * PT: Hash determinístico minúsculo apenas para IDs de commit. Não é usado em
 *     diff/merge/integridade — é só um identificador estável e reproduzível.
 * @param {string} str - String canônica a ser digerida.
 * @returns {string} Digest hexadecimal de 8 caracteres.
 */
function fnv1aHex(str: any) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}
/**
 * Deriva um commit id determinístico a partir do conteúdo do commit.
 * PT: Mesmos inputs → mesmo id. Passa pelo hashToBase64URL existente (reuso).
 * @param {object} content - { parent, message, author, timestamp, snapshot }.
 * @returns {string} Id curto Base64URL (12 chars).
 */
function deriveCommitId(content: any) {
    const snapshot = content.snapshot && typeof content.snapshot === 'object' ? content.snapshot : {};
    const canonical = JSON.stringify({
        parent: content.parent ?? null,
        message: String(content.message ?? ''),
        author: String(content.author ?? ''),
        timestamp: content.timestamp ?? null,
        snapshotKeys: Object.keys(snapshot).sort(),
        snapshotDigest: fnv1aHex(JSON.stringify(snapshot)),
    });
    return hashToBase64URL(fnv1aHex(canonical).repeat(8), 12);
}
/**
 * Cria um repositório com um commit gênesis (snapshot completo como base).
 * @param {string} modelId - Identificador do modelo versionado.
 * @param {object} genesisSnapshot - Snapshot inicial completo.
 * @param {object} [meta] - { message, author, timestamp } opcional.
 * @returns {object} Repo { modelId, commits, refs:{main}, head:'main' }.
 */
export function createRepo(modelId: any, genesisSnapshot: any, meta: any = {}) {
    const snapshot = deepClone(genesisSnapshot ?? {});
    const id = deriveCommitId({
        parent: null,
        message: meta.message ?? 'genesis',
        author: meta.author ?? 'system',
        timestamp: meta.timestamp ?? null,
        snapshot,
    });
    const genesisCommit = {
        id,
        parent: null,
        parents: [],
        message: meta.message ?? 'genesis',
        author: meta.author ?? 'system',
        timestamp: meta.timestamp ?? null,
        base: snapshot, // genesis stores FULL snapshot (replay anchor)
        official: false,
    };
    return {
        modelId: String(modelId ?? ''),
        commits: { [id]: genesisCommit },
        refs: { main: id },
        head: 'main',
    };
}
/**
 * Resolve o snapshot de um commit pelo seu id (delega a checkout via parent).
 * @param {object} repo - Repositório.
 * @param {string} commitId - Id alvo.
 * @returns {object} Snapshot reconstruído (clone).
 */
function snapshotOfCommit(repo: any, commitId: any) {
    return checkout(repo, commitId);
}
/**
 * Gera um mapa de decisões "aceitar tudo de B" a partir de um diff.
 * PT: Faz mergeModels reconstruir exatamente o snapshot filho a partir do pai,
 *     sem reimplementar fusão — apenas direciona o motor existente. As chaves
 *     seguem exatamente o esquema que mergeModels espera (nome da seção vem da
 *     própria chave de diff.sections; modificações usam path.join('.')).
 * @param {object} diff - Saída de diffModels.
 * @returns {object} Mapa de decisões para mergeModels.
 */
function acceptAllBDecisions(diff: any) {
    const decisions: Record<string, any> = {};
    const sections = diff?.sections ?? {};
    for (const [name, sectionRaw] of Object.entries(sections)) {
        const section: any = sectionRaw;
        for (const change of section.changes ?? []) {
            decisions[change.path.join('.')] = 'B';
        }
        for (const add of section.added ?? []) {
            decisions[`${name}.${add.id}._add`] = 'B';
        }
        for (const rem of section.removed ?? []) {
            decisions[`${name}.${rem.id}._remove`] = 'B';
        }
        for (const mod of section.modified ?? []) {
            for (const change of mod.changes ?? [])
                decisions[change.path.join('.')] = 'B';
        }
    }
    return decisions;
}
/**
 * Reconstrói o snapshot filho a partir do pai + diff, delegando 100% a
 * mergeModels (que ignora modelB e usa apenas modelA + decisions + diff).
 * @param {object} parentState - Estado do pai.
 * @param {object} diff - Diff pai→filho (carrega todos os valueB/itens).
 * @returns {object} Estado do filho reconstruído.
 */
function reconstructFromDiff(parentState: any, diff: any) {
    const result = mergeModels(parentState, null, acceptAllBDecisions(diff), diff);
    return result.merged;
}
/**
 * Cria um novo commit no branch corrente (append-only).
 * @param {object} repo - Repositório.
 * @param {object} snapshot - Novo snapshot completo.
 * @param {object} opts - { message, author, timestamp }.
 * @returns {object} Mesmo repo (mutate-return) com o commit anexado.
 */
export function commitModel(repo: any, snapshot: any, opts: any = {}) {
    const branch = repo.head;
    const parentId = repo.refs[branch];
    if (!parentId)
        throw new Error(`unknown branch: ${branch}`);
    const parentSnap = snapshotOfCommit(repo, parentId);
    const childSnap = deepClone(snapshot ?? {});
    const diff = diffModels(parentSnap, childSnap); // DELEGATE diff
    const mergeResult = mergeModels(parentSnap, childSnap, acceptAllBDecisions(diff), diff); // DELEGATE merge
    const delta = buildDelta(mergeResult.delta); // DELEGATE summary
    const id = deriveCommitId({
        parent: parentId,
        message: opts.message ?? '',
        author: opts.author ?? '',
        timestamp: opts.timestamp ?? null,
        snapshot: childSnap,
    });
    repo.commits[id] = {
        id,
        parent: parentId,
        parents: [parentId],
        message: opts.message ?? '',
        author: opts.author ?? '',
        timestamp: opts.timestamp ?? null,
        diff, // stored for deterministic replay (delegated reconstruction)
        delta, // human-readable summary from buildDelta
        official: false,
    };
    repo.refs[branch] = id;
    return repo;
}
/**
 * Resolve um ref (branch name ou commit id) para um commit id.
 * @param {object} repo - Repositório.
 * @param {string} ref - Branch name ou commit id.
 * @returns {string} Commit id.
 */
function resolveRef(repo: any, ref: any) {
    if (Object.prototype.hasOwnProperty.call(repo.refs, ref))
        return repo.refs[ref];
    if (Object.prototype.hasOwnProperty.call(repo.commits, ref))
        return ref;
    throw new Error(`unknown ref: ${ref}`);
}
/**
 * Reconstrói o snapshot de um ref: ancora na base mais próxima e reaplica
 * deltas via mergeModels (delegado) ao longo da cadeia de pais.
 * @param {object} repo - Repositório.
 * @param {string} ref - Branch name ou commit id.
 * @returns {object} Snapshot reconstruído (deepClone).
 */
export function checkout(repo: any, ref: any) {
    const targetId = resolveRef(repo, ref);
    const chain = [];
    let cursor = targetId;
    while (cursor) {
        const commit = repo.commits[cursor];
        if (!commit)
            throw new Error(`corrupt chain at: ${cursor}`);
        chain.push(commit);
        if (commit.base !== undefined)
            break; // reached full-snapshot anchor
        cursor = commit.parent;
    }
    chain.reverse();
    let state = deepClone(chain[0].base ?? {});
    for (let i = 1; i < chain.length; i++) {
        const diff = chain[i].diff;
        state = reconstructFromDiff(state, diff); // DELEGATE merge
        // PT: mergeModels carimba merged.timestamp = new Date() (não-determinístico).
        //     Restauramos o timestamp real do filho preservado no diff metadata,
        //     garantindo round-trip byte-equal e determinismo total.
        normalizeReplayTimestamp(state, diff);
    }
    return deepClone(state);
}
/**
 * Restaura o campo timestamp ao valor que o snapshot filho realmente tinha,
 * neutralizando o carimbo não-determinístico de mergeModels.
 * @param {object} state - Estado reconstruído (mutado in-place).
 * @param {object} diff - Diff pai→filho com metadata.timestampB.
 * @returns {void}
 */
function normalizeReplayTimestamp(state: any, diff: any) {
    const tsB = diff?.metadata?.timestampB ?? null;
    if (tsB === null || tsB === undefined) {
        delete state.timestamp;
    }
    else {
        state.timestamp = tsB;
    }
}
/**
 * Marca um commit como oficial — somente se alcançável a partir de main.
 * @param {object} repo - Repositório.
 * @param {string} commitId - Commit alvo.
 * @returns {object} Mesmo repo.
 */
export function markOfficial(repo: any, commitId: any) {
    if (!isReachableFromMain(repo, commitId)) {
        throw new Error('official only on main');
    }
    repo.commits[commitId].official = true;
    return repo;
}
/**
 * Indica se um commit está marcado como oficial.
 * @param {object} repo - Repositório.
 * @param {string} commitId - Commit alvo.
 * @returns {boolean} true se oficial.
 */
export function isOfficial(repo: any, commitId: any) {
    return Boolean(repo.commits[commitId] && repo.commits[commitId].official);
}
/**
 * Verifica se um commit é alcançável seguindo a cadeia de pais de main.
 * @param {object} repo - Repositório.
 * @param {string} commitId - Commit alvo.
 * @returns {boolean} true se alcançável.
 */
function isReachableFromMain(repo: any, commitId: any) {
    if (!repo.commits[commitId])
        return false;
    let cursor = repo.refs.main;
    const seen = new Set();
    while (cursor && !seen.has(cursor)) {
        if (cursor === commitId)
            return true;
        seen.add(cursor);
        const commit = repo.commits[cursor];
        if (!commit)
            return false;
        cursor = commit.parent;
    }
    return false;
}
/**
 * Cria um novo branch apontando para um commit (default: head atual).
 * @param {object} repo - Repositório.
 * @param {string} name - Nome do branch.
 * @param {string} [fromCommitId] - Commit base (opcional).
 * @returns {object} Mesmo repo.
 */
export function createBranch(repo: any, name: any, fromCommitId: any) {
    if (name === 'main' || Object.prototype.hasOwnProperty.call(repo.refs, name)) {
        throw new Error(`branch already exists: ${name}`);
    }
    const startId = fromCommitId ? resolveRef(repo, fromCommitId) : repo.refs[repo.head];
    if (!repo.commits[startId])
        throw new Error(`unknown commit: ${startId}`);
    repo.refs[name] = startId;
    return repo;
}
/**
 * Lista os nomes de branches do repositório.
 * @param {object} repo - Repositório.
 * @returns {string[]} Nomes dos branches.
 */
export function listBranches(repo: any) {
    return Object.keys(repo.refs);
}
/**
 * Retorna os commits de um branch, do mais novo para o mais antigo.
 * @param {object} repo - Repositório.
 * @param {string} [branch] - Branch (default: head).
 * @returns {object[]} Commits newest→oldest.
 */
export function log(repo: any, branch: any) {
    const ref = branch ?? repo.head;
    let cursor = resolveRef(repo, ref);
    const out = [];
    const seen = new Set();
    while (cursor && !seen.has(cursor)) {
        const commit = repo.commits[cursor];
        if (!commit)
            break;
        out.push(commit);
        seen.add(cursor);
        cursor = commit.parent;
    }
    return out;
}
/**
 * Funde fromBranch em intoBranch criando um commit de merge com 2 pais.
 * @param {object} repo - Repositório.
 * @param {string} fromBranch - Branch de origem.
 * @param {string} intoBranch - Branch de destino.
 * @param {object} decisions - Decisões de conflito para mergeModels.
 * @param {object} [opts] - { message, author, timestamp }.
 * @returns {object} Mesmo repo.
 */
export function mergeBranch(repo: any, fromBranch: any, intoBranch: any, decisions: any = {}, opts: any = {}) {
    const fromId = resolveRef(repo, fromBranch);
    const intoId = resolveRef(repo, intoBranch);
    const intoSnap = checkout(repo, intoId);
    const fromSnap = checkout(repo, fromId);
    const diff = diffModels(intoSnap, fromSnap); // DELEGATE diff
    const mergeResult = mergeModels(intoSnap, fromSnap, decisions, diff); // DELEGATE merge
    const mergedSnap = mergeResult.merged;
    const forwardDiff = diffModels(intoSnap, mergedSnap); // DELEGATE diff (replay base = into)
    const id = deriveCommitId({
        parent: intoId,
        message: opts.message ?? `merge ${fromBranch} into ${intoBranch}`,
        author: opts.author ?? '',
        timestamp: opts.timestamp ?? null,
        snapshot: mergedSnap,
    });
    repo.commits[id] = {
        id,
        parent: intoId,
        parents: [intoId, fromId],
        message: opts.message ?? `merge ${fromBranch} into ${intoBranch}`,
        author: opts.author ?? '',
        timestamp: opts.timestamp ?? null,
        diff: forwardDiff,
        delta: buildDelta(mergeResult.delta), // DELEGATE summary
        official: false,
    };
    repo.refs[intoBranch] = id;
    return repo;
}
/**
 * Diferença entre dois commits — delega 100% a diffModels.
 * @param {object} repo - Repositório.
 * @param {string} idA - Commit A.
 * @param {string} idB - Commit B.
 * @returns {object} Saída de diffModels(checkout A, checkout B).
 */
export function diffCommits(repo: any, idA: any, idB: any) {
    return diffModels(checkout(repo, idA), checkout(repo, idB)); // DELEGATE
}
export { deepEqual };
