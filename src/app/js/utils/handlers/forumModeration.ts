// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// SPEC: docs/specs/features/SPEC_FORUM_KNOWLEDGE_GROUPS.md
// Phase 5 — window.* handlers wiring forum moderation into the UI.

import { showToast } from '../ui/toast.js';
import { classifyContent, buildModerationLog } from '../../core/forum/forumModeration.js';

/**
 * Run the pure heuristic moderation pre-filter on a forum post/reply.
 * Shows a toast and returns a status so callers can gate publishing.
 * @param {string} threadOrReplyId
 * @param {string} text
 * @returns {{ status: 'allow'|'flag'|'block', score: number, log: object }}
 */
export function handleModerateForumPost(threadOrReplyId: any, text: any) {
    const h = classifyContent(text);
    /** @type {'allow'|'flag'|'block'} */
    let status = 'allow';
    if (h.score > 0.85) status = 'block';
    else if (h.score >= 0.4) status = 'flag';

    const log = buildModerationLog({
        threadId: String(threadOrReplyId || ''),
        action: status,
        source: 'heuristic',
        score: h.score,
    });

    if (status === 'block') {
        showToast('Conteúdo bloqueado pela moderação automática.', 'error', 5000);
    } else if (status === 'flag') {
        showToast('Conteúdo sinalizado para revisão da moderação.', 'warning', 4000);
    }

    return { status, score: h.score, log };
}

export const forumModerationHandlers = {
    handleModerateForumPost,
};
