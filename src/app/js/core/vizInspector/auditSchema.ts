// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * auditSchema.js - Esquema de auditoria para rastreamento de mudancas visuais
 *
 * Define os tipos canônicos de autoria (user/ai/system/import) e o ciclo de vida
 * de status de cada commit de mudanca (unseen → accepted | reverted).
 */

/** Tags de autoria da mudanca — identifica a origem da alteracao */
export const CHANGE_AUTHOR_TAGS = {
    USER: 'user',
    AI: 'ai',
    SYSTEM: 'system',
    IMPORT: 'import',
};

/** Ciclo de vida de status de um commit de mudanca */
export const CHANGE_STATUS = {
    UNSEEN: 'unseen',
    ACCEPTED: 'accepted',
    REVERTED: 'reverted',
};

interface ChangeCommitInput {
    id?: string;
    hash?: string;
    commit_hash?: string;
    message?: string;
    author?: string;
    authorId?: string;
    author_type?: string;
    files?: unknown[];
    timestamp?: number | string;
    created_at?: string;
    status?: string;
    changes?: unknown[];
    modelId?: string | null;
    model_id?: string | null;
    isCheckpoint?: boolean;
    checkpointLabel?: string | null;
    checkpoint_description?: string | null;
    snapshotElements?: unknown[];
}

/**
 * Cria um commit de mudanca normalizado com defaults seguros.
 */
export function createChangeCommit(
    {
        id,
        hash,
        commit_hash,
        message,
        author,
        authorId,
        author_type,
        files,
        timestamp,
        created_at,
        status,
        changes,
        modelId,
        model_id,
        isCheckpoint,
        checkpointLabel,
        checkpoint_description,
        snapshotElements,
    }: ChangeCommitInput = {},
): Record<string, unknown> {
    const resolvedAuthor = author ?? authorId ?? author_type ?? CHANGE_AUTHOR_TAGS.USER;
    const resolvedTimestamp =
        typeof timestamp === 'number'
            ? timestamp
            : Number.isFinite(new Date(timestamp ?? created_at ?? '').getTime())
              ? new Date(timestamp ?? created_at ?? '').getTime()
              : Date.now();
    const resolvedHash = hash ?? commit_hash ?? id ?? '';

    return {
        id: id ?? crypto.randomUUID(),
        hash: resolvedHash,
        commit_hash: resolvedHash,
        message: message ?? '',
        author: resolvedAuthor,
        authorId: resolvedAuthor,
        author_type: resolvedAuthor,
        files: files ?? [],
        timestamp: resolvedTimestamp,
        created_at: created_at ?? new Date(resolvedTimestamp).toISOString(),
        status: status ?? CHANGE_STATUS.UNSEEN,
        changes: Array.isArray(changes) ? changes : [],
        modelId: modelId ?? model_id ?? null,
        model_id: model_id ?? modelId ?? null,
        isCheckpoint: Boolean(isCheckpoint),
        checkpointLabel: checkpointLabel ?? checkpoint_description ?? null,
        checkpoint_description: checkpoint_description ?? checkpointLabel ?? null,
        snapshotElements: Array.isArray(snapshotElements) ? snapshotElements : undefined,
    };
}
