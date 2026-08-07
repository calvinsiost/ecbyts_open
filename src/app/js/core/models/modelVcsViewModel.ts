// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// modelVcsViewModel — F3 pure view-model helpers (SPEC_MODEL_VCS_GIT)
//
// View-model puro consumido pela UI de F3 (commit/branch/checkout/merge
// no model tabs). CONSOME diretamente os outputs do F1 modelVcs.js
// (log, listBranches, isOfficial, diffCommits) — não recalcula DAG,
// chain ou diff. Apenas organiza/decora para renderização.
//
// Princípios herdados do F1:
// - Sem DOM, sem rede, determinístico.
// - Append-only: nunca propõe operação destrutiva (sem delete/rewrite).
// - main = oficial protegido (badge não-só-cor + travas explícitas).

/** Refs especiais reconhecidos pela UI. */
const MAIN_REF = 'main';

/**
 * Formata tempo relativo em PT-BR sem dependências externas.
 * Usado p/ "há 2 horas" no log. Determinístico (recebe `now`).
 *
 * @param {number} timestamp Epoch ms.
 * @param {number} now Epoch ms de referência.
 * @returns {{key:string, vars:{value:number}}} i18n payload.
 */
export function formatRelativeTime(timestamp: any, now: any) {
    if (timestamp == null) {
        return { key: 'vcs.time.unknown', vars: { value: 0 } };
    }
    const ts = Number(timestamp);
    const ref = Number(now);
    if (!Number.isFinite(ts) || !Number.isFinite(ref)) {
        return { key: 'vcs.time.unknown', vars: { value: 0 } };
    }
    const diffSec = Math.max(0, Math.floor((ref - ts) / 1000));
    if (diffSec < 60) return { key: 'vcs.time.secondsAgo', vars: { value: diffSec } };
    if (diffSec < 3600) return { key: 'vcs.time.minutesAgo', vars: { value: Math.floor(diffSec / 60) } };
    if (diffSec < 86400) return { key: 'vcs.time.hoursAgo', vars: { value: Math.floor(diffSec / 3600) } };
    return { key: 'vcs.time.daysAgo', vars: { value: Math.floor(diffSec / 86400) } };
}

/**
 * Resolve badge visual de um commit (oficial vs rascunho).
 * Não-só-cor: ícone + i18n key.
 *
 * @param {boolean} official
 * @returns {{icon:string, labelKey:string, tone:string}}
 */
export function resolveCommitBadge(official: any) {
    if (official) {
        return { icon: '✓', labelKey: 'vcs.badge.official', tone: 'official' };
    }
    return { icon: '·', labelKey: 'vcs.badge.draft', tone: 'draft' };
}

/** Resolve id canonico de um commit raw. */
function _resolveCommitId(c: any): string {
    return c && typeof c.id === 'string' ? c.id : '';
}

/** Resolve lista de pais de um commit raw. */
function _resolveCommitParents(c: any): string[] {
    const parents: string[] = [];
    if (c && c.parent) parents.push(c.parent);
    if (c && c.parent2) parents.push(c.parent2);
    return parents;
}

/** Resolve flag oficial a partir do commit ou do indice do repo. */
function _resolveCommitOfficial(c: any, id: string, repo: any): boolean {
    return (
        Boolean(c && c.official) ||
        (repo && repo.commits && repo.commits[id] ? Boolean(repo.commits[id].official) : false)
    );
}

/** Normaliza um commit raw em entrada do view-model. */
function _normalizeCommit(c: any, repo: any, now: number) {
    const id = _resolveCommitId(c);
    const parents = _resolveCommitParents(c);
    const official = _resolveCommitOfficial(c, id, repo);
    return {
        id,
        short: id.slice(0, 8),
        message: c && c.message != null ? String(c.message) : '',
        author: c && c.author != null ? String(c.author) : null,
        timestamp: c && Number.isFinite(c.timestamp) ? c.timestamp : null,
        relativeTime: formatRelativeTime(c && c.timestamp, now),
        badge: resolveCommitBadge(official),
        isMergeCommit: parents.length >= 2,
        parents,
    };
}

/**
 * Constrói o view-model da lista de commits de um branch.
 *
 * @param {Array<object>} commits Saída de `log(repo, branch)` — newest→oldest.
 * @param {{repo: object, branch: string, now?: number}} ctx
 *   Contexto p/ enriquecer (oficial + branch atual).
 * @returns {{
 *   branch: string,
 *   isMain: boolean,
 *   entries: Array<{
 *     id: string,
 *     short: string,
 *     message: string,
 *     author: string|null,
 *     timestamp: number|null,
 *     relativeTime: {key:string, vars:Object},
 *     badge: {icon:string, labelKey:string, tone:string},
 *     isMergeCommit: boolean,
 *     parents: Array<string>,
 *   }>,
 *   total: number
 * }}
 */
export function buildCommitListVM(commits: any, ctx: any) {
    if (!Array.isArray(commits)) {
        throw new TypeError('buildCommitListVM: commits must be array');
    }
    if (!ctx || typeof ctx !== 'object') {
        throw new TypeError('buildCommitListVM: ctx must be object');
    }
    const branch = ctx.branch || MAIN_REF;
    const now = Number.isFinite(ctx.now) ? ctx.now : Date.now();
    const repo = ctx.repo;
    const entries = commits.map((c: any) => _normalizeCommit(c, repo, now));
    return {
        branch,
        isMain: branch === MAIN_REF,
        entries,
        total: entries.length,
    };
}

/**
 * Constrói o view-model do seletor de branches. main destacado como
 * oficial protegido.
 *
 * @param {{refs: Object}} repo Repositório (F1).
 * @param {string} repo Branch atual (repo.head).
 * @returns {{
 *   branches: Array<{
 *     name: string,
 *     headCommitId: string,
 *     isMain: boolean,
 *     isCurrent: boolean,
 *     official: boolean,
 *     badge: {icon:string, labelKey:string, tone:string},
 *   }>,
 *   currentHead: string,
 *   mainProtected: boolean
 * }}
 */
export function buildBranchPickerVM(repo: any, currentHead: any) {
    if (!repo || typeof repo !== 'object' || !repo.refs) {
        throw new TypeError('buildBranchPickerVM: invalid repo');
    }
    if (typeof currentHead !== 'string' || currentHead === '') {
        throw new TypeError('buildBranchPickerVM: currentHead required');
    }
    const names = Object.keys(repo.refs).sort((a: any, b: any) => {
        // main sempre primeiro, demais alfabético.
        if (a === MAIN_REF) return -1;
        if (b === MAIN_REF) return 1;
        return a.localeCompare(b);
    });
    const branches = names.map((name: any) => {
        const headCommitId = repo.refs[name];
        const isMain = name === MAIN_REF;
        return {
            name,
            headCommitId,
            isMain,
            isCurrent: name === currentHead,
            official: isMain, // só main é oficial protegido
            badge: resolveCommitBadge(isMain),
        };
    });
    return { branches, currentHead, mainProtected: true };
}

/**
 * View-model de uma operação de merge (UI de confirmação).
 * NÃO executa o merge — apenas descreve o que vai acontecer.
 *
 * @param {{from:string, into:string, fromHead:string, intoHead:string}} input
 * @returns {{
 *   from:string, into:string,
 *   fromHead:string, intoHead:string,
 *   targetsMain:boolean,
 *   requiresReview:boolean,
 *   warningKey:string|null,
 *   confirmActionKey:string
 * }}
 */
export function buildMergePlanVM(input: any) {
    if (!input || typeof input !== 'object') {
        throw new TypeError('buildMergePlanVM: input must be object');
    }
    const from = String(input.from || '');
    const into = String(input.into || '');
    if (!from || !into) {
        throw new TypeError('buildMergePlanVM: from/into required');
    }
    if (from === into) {
        throw new TypeError('buildMergePlanVM: from === into not allowed');
    }
    const targetsMain = into === MAIN_REF;
    return {
        from,
        into,
        fromHead: String(input.fromHead || ''),
        intoHead: String(input.intoHead || ''),
        targetsMain,
        requiresReview: targetsMain, // BP3 — main só via merge revisado
        warningKey: targetsMain ? 'vcs.merge.warnMain' : null,
        confirmActionKey: targetsMain ? 'vcs.merge.confirmMain' : 'vcs.merge.confirm',
    };
}

/**
 * Decide se `markOfficial` é permitido (UI gate antes de chamar o motor).
 * Espelha a regra do F1: só commits alcançáveis a partir de main HEAD.
 *
 * @param {{refs: Object, commits: Object}} repo
 * @param {string} repo
 * @returns {{allowed:boolean, reasonKey:string|null}}
 */
export function canMarkOfficial(repo: any, commitId: any) {
    if (!repo || !repo.refs || !repo.commits) {
        return { allowed: false, reasonKey: 'vcs.markOfficial.invalidRepo' };
    }
    const mainHead = repo.refs[MAIN_REF];
    if (!mainHead) {
        return { allowed: false, reasonKey: 'vcs.markOfficial.noMain' };
    }
    if (!commitId || !repo.commits[commitId]) {
        return { allowed: false, reasonKey: 'vcs.markOfficial.unknownCommit' };
    }
    // BFS a partir de mainHead pelos parents.
    const seen = new Set();
    const queue = [mainHead];
    while (queue.length > 0) {
        const cur = queue.shift();
        if (!cur || seen.has(cur)) continue;
        seen.add(cur);
        if (cur === commitId) {
            return { allowed: true, reasonKey: null };
        }
        const c = repo.commits[cur];
        if (!c) continue;
        if (c.parent) queue.push(c.parent);
        if (c.parent2) queue.push(c.parent2);
    }
    return { allowed: false, reasonKey: 'vcs.markOfficial.notReachableFromMain' };
}

/** Públicos: constantes/refs especiais. */
export const VCS_MAIN_REF = MAIN_REF;
