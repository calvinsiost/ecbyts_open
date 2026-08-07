// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Model VCS handlers (caller integration) for SPEC_MODEL_VCS_GIT.
// Hand-authored R1-safe — registra window.* handlers que conectam os 3
// UI surface modules (Panel + Merge + Diff) ao caller.
//
// Spec NOT:
// - NÃO reimplementar VCS logic (delega modelVcs.js F1)
// - NÃO duplicar UI panels (delega aos modules existentes)
// - NÃO emoji em strings
// - NÃO criar novo registry handlers

import { openModelVcsPanel } from '../ui/modelVcsPanel.js';
import { openModelVcsMergePanel } from '../ui/modelVcsMergePanel.js';
import { openModelVcsDiffViewer } from '../ui/modelVcsDiffViewer.js';
import { commitModel, createBranch, mergeBranch, listBranches } from '../../core/models/modelVcs.js';

/**
 * Abre painel principal Model VCS (Commits + Branches tabs).
 * Registrável como window.handleOpenModelVcsPanel.
 * @param {{repo:*, currentHead?:string}} input
 * @returns {{close:Function}|null}
 */
export function handleOpenModelVcsPanel(input: any) {
    if (!input?.repo) {
        console.debug('[modelVcsHandlers:openPanel] missing repo');
        return null;
    }
    try {
        return openModelVcsPanel({
            repo: input.repo,
            currentHead: input.currentHead || 'main',
        });
    } catch (e: any) {
        console.debug('[modelVcsHandlers:openPanel]', e?.message || e);
        return null;
    }
}

/**
 * Abre painel Merge Plan.
 * @param {{repo:*, defaultSource?:string, defaultTarget?:string}} input
 * @returns {{close:Function}|null}
 */
export function handleOpenModelVcsMerge(input: any) {
    if (!input?.repo) {
        console.debug('[modelVcsHandlers:openMerge] missing repo');
        return null;
    }
    let branches: any[] = [];
    try {
        branches = listBranches(input.repo) || [];
    } catch (e: any) {
        console.debug('[modelVcsHandlers:listBranches]', e?.message || e);
    }
    if (!branches.length) {
        console.debug('[modelVcsHandlers:openMerge] no branches');
        return null;
    }
    return openModelVcsMergePanel({
        branches,
        defaultSource: input.defaultSource,
        defaultTarget: input.defaultTarget || 'main',
    });
}

/**
 * Abre diff viewer entre 2 commits.
 * @param {{repo:*, commitIdA:string, commitIdB:string}} input
 * @returns {{close:Function}|null}
 */
export function handleOpenModelVcsDiff(input: any) {
    if (!input?.repo || !input?.commitIdA || !input?.commitIdB) {
        console.debug('[modelVcsHandlers:openDiff] missing input');
        return null;
    }
    return openModelVcsDiffViewer({
        repo: input.repo,
        commitIdA: input.commitIdA,
        commitIdB: input.commitIdB,
    });
}

/**
 * Commit shortcut — captura snapshot atual do model + commit.
 * Caller passa repo + snapshot + message.
 * @param {{repo:*, snapshot:object, message:string}} input
 * @returns {object|null} commit object ou null
 */
export function handleCommitModel(input: any) {
    if (!input?.repo || !input?.snapshot) {
        console.debug('[modelVcsHandlers:commit] missing repo/snapshot');
        return null;
    }
    try {
        return commitModel(input.repo, input.snapshot, { message: input.message || '' });
    } catch (e: any) {
        console.debug('[modelVcsHandlers:commit]', e?.message || e);
        return null;
    }
}

/**
 * Create branch shortcut.
 * @param {{repo:*, name:string, fromCommitId?:string}} input
 * @returns {object|null}
 */
export function handleCreateBranch(input: any) {
    if (!input?.repo || !input?.name) {
        console.debug('[modelVcsHandlers:createBranch] missing input');
        return null;
    }
    try {
        return createBranch(input.repo, input.name, input.fromCommitId);
    } catch (e: any) {
        console.debug('[modelVcsHandlers:createBranch]', e?.message || e);
        return null;
    }
}

/**
 * Merge shortcut.
 * @param {{repo:*, fromBranch:string, intoBranch:string, decisions?:object}} input
 * @returns {object|null}
 */
export function handleMergeBranches(input: any) {
    if (!input?.repo || !input?.fromBranch || !input?.intoBranch) {
        console.debug('[modelVcsHandlers:merge] missing input');
        return null;
    }
    try {
        return mergeBranch(input.repo, input.fromBranch, input.intoBranch, input.decisions || {});
    } catch (e: any) {
        console.debug('[modelVcsHandlers:merge]', e?.message || e);
        return null;
    }
}

/**
 * Registration helper — caller chama uma vez em main.js boot.
 */
export function registerModelVcsHandlers() {
    if (typeof window === 'undefined') return;
    const w = (window) as any;
    if (w.__ecbtModelVcsHandlersRegistered) return;
    w.handleOpenModelVcsPanel = handleOpenModelVcsPanel;
    w.handleOpenModelVcsMerge = handleOpenModelVcsMerge;
    w.handleOpenModelVcsDiff = handleOpenModelVcsDiff;
    w.handleCommitModel = handleCommitModel;
    w.handleCreateBranch = handleCreateBranch;
    w.handleMergeBranches = handleMergeBranches;
    w.__ecbtModelVcsHandlersRegistered = true;
}
