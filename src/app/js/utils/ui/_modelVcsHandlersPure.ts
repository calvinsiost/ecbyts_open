// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_MODEL_VCS_GIT — pure-logic handlers/decision helpers (Wave MMM2 claude-adm).
//
// onCommit/onBranch decision logic — predicates + VM builders.
// Pure functions: no DOM, no IO, deterministic. Consumed by modelVcsPanel.ts
// when user clicks commit/branch in the panel.
//
// Spec NOT:
// - NÃO mutar repo (use checkout/createBranch from core/models/modelVcs.js)
// - NÃO acessar DOM
// - NÃO emoji
/**
 * Decide if a commit can be selected for checkout/inspection.
 *
 * @param {any} commit
 * @param {any} repo - { branches: {[name]: {head: string}}, ... }
 * @param {string} currentHead - current commit id at HEAD
 * @returns {{ canSelect: boolean, reason: string | null }}
 */
export function canSelectCommit(commit: any, repo: any, currentHead: any) {
    if (!commit || typeof commit.id !== 'string') {
        return { canSelect: false, reason: 'invalid_commit' };
    }
    if (!repo || typeof repo !== 'object') {
        return { canSelect: false, reason: 'invalid_repo' };
    }
    if (commit.id === currentHead) {
        return { canSelect: false, reason: 'already_at_head' };
    }
    return { canSelect: true, reason: null };
}
/**
 * Decide if a branch can be switched to.
 *
 * @param {string} branchName
 * @param {any} repo - { branches, currentBranch }
 * @returns {{ canSwitch: boolean, reason: string | null }}
 */
export function canSwitchBranch(branchName: any, repo: any) {
    if (typeof branchName !== 'string' || !branchName) {
        return { canSwitch: false, reason: 'invalid_branch_name' };
    }
    if (!repo || !repo.branches || typeof repo.branches !== 'object') {
        return { canSwitch: false, reason: 'invalid_repo' };
    }
    if (!repo.branches[branchName]) {
        return { canSwitch: false, reason: 'branch_not_found' };
    }
    if (repo.currentBranch === branchName) {
        return { canSwitch: false, reason: 'already_on_branch' };
    }
    return { canSwitch: true, reason: null };
}
/**
 * Decide if a commit can be marked official (only on main + not yet official).
 *
 * @param {any} commit
 * @param {any} repo
 * @returns {{ canMark: boolean, reason: string | null }}
 */
export function canMarkOfficial(commit: any, repo: any) {
    if (!commit || typeof commit.id !== 'string') {
        return { canMark: false, reason: 'invalid_commit' };
    }
    if (!repo || repo.currentBranch !== 'main') {
        return { canMark: false, reason: 'not_on_main' };
    }
    if (commit.official === true) {
        return { canMark: false, reason: 'already_official' };
    }
    return { canMark: true, reason: null };
}
/**
 * Build action VM for a commit click — what actions the panel should show.
 *
 * @param {any} commit
 * @param {any} repo
 * @param {string} currentHead
 * @returns {{ checkout: boolean, markOfficial: boolean, viewDiff: boolean, createBranch: boolean }}
 */
export function buildCommitActionVM(commit: any, repo: any, currentHead: any) {
    const select = canSelectCommit(commit, repo, currentHead);
    const mark = canMarkOfficial(commit, repo);
    return {
        checkout: select.canSelect,
        markOfficial: mark.canMark,
        viewDiff: !!commit?.parent, // diff vs parent requires parent
        createBranch: !!commit?.id, // branch from this commit
    };
}
/**
 * Build a sortable, filterable commit list VM for the Commits tab.
 * Stable sort: most recent first by timestamp (descending), tiebreak by id.
 *
 * @param {Array<any>} commits
 * @param {{ filter?: string, branch?: string }} opts
 * @returns {Array<{id: string, label: string, isHead: boolean, isOfficial: boolean}>}
 */
export function buildCommitListVM(commits: any, opts: any = {}) {
    if (!Array.isArray(commits))
        return [];
    const filter = (opts.filter || '').toLowerCase();
    const branch = opts.branch || null;
    let list = commits.filter((c) => c && typeof c.id === 'string');
    if (branch)
        list = list.filter((c) => c.branch === branch);
    if (filter) {
        list = list.filter((c) => {
            const msg = (c.message || '').toLowerCase();
            const author = (c.author || '').toLowerCase();
            return c.id.toLowerCase().includes(filter) || msg.includes(filter) || author.includes(filter);
        });
    }
    return list
        .slice()
        .sort((a, b) => {
        const ta = a.timestamp || 0;
        const tb = b.timestamp || 0;
        if (tb !== ta)
            return tb - ta;
        return String(b.id).localeCompare(String(a.id));
    })
        .map((c) => ({
        id: c.id,
        label: c.message || c.id.slice(0, 7),
        isHead: c.id === opts.currentHead,
        isOfficial: c.official === true,
        author: c.author || 'unknown',
        timestamp: c.timestamp || 0,
    }));
}
/**
 * Build branch picker VM.
 *
 * @param {any} repo
 * @returns {Array<{name: string, head: string, isCurrent: boolean}>}
 */
export function buildBranchPickerVM(repo: any) {
    if (!repo || !repo.branches || typeof repo.branches !== 'object')
        return [];
    const current = repo.currentBranch || 'main';
    return (Object.entries(repo.branches) as [string, any][])
        .filter(([name]) => typeof name === 'string' && name)
        .map(([name, b]) => ({
        name,
        head: b?.head || '',
        isCurrent: name === current,
    }))
        .sort((a, b) => {
        // Always main first, then current, then alphabetical
        if (a.name === 'main')
            return -1;
        if (b.name === 'main')
            return 1;
        if (a.isCurrent)
            return -1;
        if (b.isCurrent)
            return 1;
        return a.name.localeCompare(b.name);
    });
}
//# sourceMappingURL=_modelVcsHandlersPure.js.map