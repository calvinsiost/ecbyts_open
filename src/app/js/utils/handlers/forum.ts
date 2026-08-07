// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// SPEC: docs/specs/features/SPEC_FORUM_KNOWLEDGE_GROUPS.md
// Phase 2 — window.* handlers for the Forum module.
/* ================================================================
   FORUM HANDLERS — thin wrappers around forumModal.js / registries.
   Registered centrally in handlers/index.js per project pattern.
   ================================================================ */
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
function _uid() {
    try {
        const w = (window);
        return w?.currentSession?.user?.id || w?.currentSession?.userId || 'anon';
    }
    catch {
        return 'anon';
    }
}
export async function handleOpenForumModal() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('forum')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    const { openForumModal } = await import('../ui/forumModal.js');
    openForumModal();
}
export async function handleCloseForumModal() {
    const { closeForumModal } = await import('../ui/forumModal.js');
    closeForumModal();
}
/** @param {{ name: string, description?: string, topicTags?: string[] }} input */
export async function handleCreateForumGroup(input: any) {
    const { createGroup } = await import('../../core/forum/forumGroupRegistry.js');
    return createGroup({ ...(input || {}), name: (input && input.name) || '', ownerId: _uid() });
}
/** @param {{ groupId: string, title: string, body?: string }} input */
export async function handleCreateForumThread(input: any) {
    const { createThread } = await import('../../core/forum/forumThreadRegistry.js');
    return createThread({
        groupId: (input && input.groupId) || '',
        authorId: _uid(),
        title: (input && input.title) || '',
        body: (input && input.body) || '',
    });
}
/** @param {{ threadId: string, body: string, parentReplyId?: string | null }} input */
export async function handleForumReply(input: any) {
    const { addReply } = await import('../../core/forum/forumThreadRegistry.js');
    return addReply({
        threadId: (input && input.threadId) || '',
        authorId: _uid(),
        body: (input && input.body) || '',
        parentReplyId: (input && input.parentReplyId) || null,
    });
}
/** @param {{ targetType: 'thread' | 'reply', targetId: string }} input */
export async function handleForumVote(input: any) {
    const { voteEntity } = await import('../../core/forum/forumThreadRegistry.js');
    return voteEntity({
        voterId: _uid(),
        targetType: (input && input.targetType) || 'thread',
        targetId: (input && input.targetId) || '',
    });
}
/**
 * Reputation & Royalty Cascade — opens the reputation dashboard
 * (karma tier + estimated royalty cascade for a sample transaction).
 * SPEC: docs/specs/features/SPEC_REPUTATION_ROYALTY_CASCADE_BUILD.md
 */
export async function handleOpenReputationModal() {
    const { openReputationModal } = await import('../ui/reputationModal.js');
    return openReputationModal();
}
export const forumHandlers = {
    handleOpenForumModal,
    handleCloseForumModal,
    handleCreateForumGroup,
    handleCreateForumThread,
    handleForumReply,
    handleForumVote,
    handleOpenReputationModal,
};
