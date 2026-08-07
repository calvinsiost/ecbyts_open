// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Master registration helper for all claude-otimizacao window.* handlers.
// Hand-authored R1-safe. Single-call em main.js boot registra TODOS os
// 14 window.* handlers shipped esta session.
//
// Spec NOT:
// - NÃO criar novo registry pattern (delega aos modules)
// - NÃO emoji em strings

import { registerConstellationHandlers } from './constellationHandlers.js';
import { registerModuleProvenanceHandlers } from './moduleProvenanceHandlers.js';
import { registerModelVcsHandlers } from './modelVcsHandlers.js';

/**
 * Master register — chama todos os registerXHandlers idempotentes em sequência.
 * Caller chama uma única linha em main.js boot.
 */
export function registerAllOtimizacaoHandlers(): { registered: string[]; errors: string[] } {
    const registered: string[] = [];
    const errors: string[] = [];
    const attempt = (name: string, fn: () => void): void => {
        try {
            fn();
            registered.push(name);
        } catch (e: any) {
            console.debug(`[registerAllOtimizacaoHandlers:${name}]`, e?.message || e);
            errors.push(name);
        }
    };
    attempt('constellationHandlers', registerConstellationHandlers);
    attempt('moduleProvenanceHandlers', registerModuleProvenanceHandlers);
    attempt('modelVcsHandlers', registerModelVcsHandlers);
    return { registered, errors };
}

/**
 * Returns list of expected window.* handler names (for verification/discovery).
 */
export function listExpectedHandlers(): string[] {
    return [
        // Constellation (6)
        'handleOpenConstellationOnboarding',
        'handleMountConstellationLayerBar',
        'handleResetConstellationOnboarding',
        'handleEvaluateConstellationTiering',
        'handleApplyConstellationTiering',
        'handleOpenConstellationSuggestions',
        // Module Provenance (2)
        'handleShowModuleProvenance',
        'handleOpenLibrariesForModule',
        // Model VCS (6)
        'handleOpenModelVcsPanel',
        'handleOpenModelVcsMerge',
        'handleOpenModelVcsDiff',
        'handleCommitModel',
        'handleCreateBranch',
        'handleMergeBranches',
    ];
}

/**
 * Verifica que todos os handlers expected estão registrados em window.
 */
export function verifyHandlersRegistered(): { ok: boolean; missing: string[]; registered: string[] } {
    if (typeof window === 'undefined') {
        return { ok: false, missing: listExpectedHandlers(), registered: [] };
    }
    const w = window as any;
    const expected = listExpectedHandlers();
    const registered = expected.filter((name) => typeof w[name] === 'function');
    const missing = expected.filter((name) => typeof w[name] !== 'function');
    return { ok: missing.length === 0, missing, registered };
}
