// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * vizInspector/index.js - Ponto de entrada publico do modulo
 *
 * Re-exporta a API publica de auditSchema e changeTracker.
 * Importar sempre por este index para garantir interface estavel.
 */

export { CHANGE_AUTHOR_TAGS, CHANGE_STATUS, createChangeCommit } from './auditSchema.js';

export {
    recordCommit,
    loadCommits,
    updateCommitStatus,
    getCommitHistory,
    clearCommitHistory,
} from './changeTracker.js';

export { createSnapshot, diffSnapshots, snapshotsAreEqual } from './vizSettingsSnapshot.js';

export { pushSnapshot, loadHistory, getSnapshot, clearHistory } from './vizSettingsHistory.js';

export {
    normalizeGitCommit,
    createCommit,
    createCheckpoint,
    getHistory,
    getDiff,
    revertCommit,
    restoreCheckpointState,
    getElementProvenanceFromHistory,
    getCommitBlameFromHistory,
} from './gitTrackingService.js';
