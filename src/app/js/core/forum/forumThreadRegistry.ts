// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// SPEC: docs/specs/features/SPEC_FORUM_KNOWLEDGE_GROUPS.md
// Phase 1 — pure logic thread registry (in-memory + optional Supabase IO).

/* ================================================================
   FORUM THREAD REGISTRY — Threads + replies (flat 1-level nesting)
   Threading flat: parent_reply_id apenas 1 nivel (citacao contextual)
   Anti-pattern Discourse evitado: deep threading confunde leitura.
   ================================================================ */

interface ForumThread {
    id: string;
    groupId: string;
    authorId: string;
    title: string;
    /** Markdown source (NOT sanitized HTML) */
    body: string;
    pinned: boolean;
    locked: boolean;
    votesCount: number;
    replyCount: number;
    /** ISO 8601 */
    lastActivity: string;
    attachments: string[];
    linkedLibraries: string[];
    linkedElements: string[];
    linkedSpecs: string[];
    createdAt: string;
}

interface ForumReply {
    id: string;
    threadId: string;
    parentReplyId: string | null;
    authorId: string;
    body: string;
    votesCount: number;
    createdAt: string;
}

interface ForumVote {
    voterId: string;
    targetType: 'thread' | 'reply';
    targetId: string;
    createdAt: string;
}

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

const threads = new Map<string, ForumThread>();

const replies = new Map<string, ForumReply>();

/** key = `${voterId}::${type}::${targetId}` */
const votes = new Map<string, ForumVote>();

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

/**
 * @param voterId
 * @param targetType
 * @param targetId
 */
function voteKey(voterId: string, targetType: 'thread' | 'reply', targetId: string): string {
    return `${voterId}::${targetType}::${targetId}`;
}

/**
 * Sanitize body Markdown source. Length cap; no HTML stripping here
 * (rendering layer applies DOMPurify-equivalent before innerHTML).
 * @param body
 * @returns
 */
function sanitizeBody(body: string): string {
    if (typeof body !== 'string') return '';
    return body.trim().slice(0, 20000);
}

// ----------------------------------------------------------------
// THREAD API
// ----------------------------------------------------------------

/**
 * @param input
 * @returns
 */
export function createThread(input: {
    id?: string;
    groupId: string;
    authorId: string;
    title: string;
    body: string;
    attachments?: string[];
    linkedLibraries?: string[];
    linkedElements?: string[];
    linkedSpecs?: string[];
}): ForumThread {
    if (!input || typeof input !== 'object') throw new Error('forum.thread.invalid_input');
    if (!input.groupId) throw new Error('forum.thread.group_required');
    if (!input.authorId) throw new Error('forum.thread.author_required');
    if (typeof input.title !== 'string' || !input.title.trim()) {
        throw new Error('forum.thread.title_required');
    }
    const now = new Date().toISOString();
    const id = input.id || `thr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const t: ForumThread = {
        id,
        groupId: input.groupId,
        authorId: input.authorId,
        title: input.title.trim().slice(0, 240),
        body: sanitizeBody(input.body || ''),
        pinned: false,
        locked: false,
        votesCount: 0,
        replyCount: 0,
        lastActivity: now,
        attachments: Array.isArray(input.attachments) ? input.attachments.slice(0, 20) : [],
        linkedLibraries: Array.isArray(input.linkedLibraries) ? input.linkedLibraries.slice(0, 20) : [],
        linkedElements: Array.isArray(input.linkedElements) ? input.linkedElements.slice(0, 50) : [],
        linkedSpecs: Array.isArray(input.linkedSpecs) ? input.linkedSpecs.slice(0, 20) : [],
        createdAt: now,
    };
    threads.set(id, t);
    return t;
}

/**
 * @param opts
 * @returns
 */
export function listThreads(opts: { groupId?: string; pinnedFirst?: boolean; since?: string } = {}): ForumThread[] {
    let out = Array.from(threads.values());
    if (opts.groupId) out = out.filter((t) => t.groupId === opts.groupId);
    if (opts.since) out = out.filter((t) => t.lastActivity >= (opts.since as string));
    out.sort((a, b) => {
        if (opts.pinnedFirst) {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        }
        return a.lastActivity < b.lastActivity ? 1 : -1;
    });
    return out;
}

/**
 * @param threadId
 * @returns
 */
export function getThread(threadId: string): ForumThread | null {
    return threads.get(threadId) || null;
}

// ----------------------------------------------------------------
// REPLY API
// ----------------------------------------------------------------

/**
 * Add reply to a thread. parentReplyId enables 1-level nested citation.
 * If parent reply itself has a parent, we flatten (anti-deep-threading).
 * @param input
 * @returns
 */
export function addReply(input: {
    id?: string;
    threadId: string;
    authorId: string;
    body: string;
    parentReplyId?: string | null;
}): ForumReply {
    if (!input || typeof input !== 'object') throw new Error('forum.reply.invalid_input');
    const thread = threads.get(input.threadId);
    if (!thread) throw new Error('forum.thread.not_found');
    if (thread.locked) throw new Error('forum.thread.locked');
    if (!input.authorId) throw new Error('forum.reply.author_required');
    if (typeof input.body !== 'string' || !input.body.trim()) {
        throw new Error('forum.reply.body_required');
    }
    let parentReplyId: string | null = null;
    if (input.parentReplyId) {
        const parent = replies.get(input.parentReplyId);
        if (!parent) throw new Error('forum.reply.parent_not_found');
        if (parent.threadId !== input.threadId) {
            throw new Error('forum.reply.parent_thread_mismatch');
        }
        // Flatten: if parent is itself a reply-to-reply, anchor to its parent's top.
        parentReplyId = parent.parentReplyId ? parent.parentReplyId : parent.id;
    }
    const now = new Date().toISOString();
    const id = input.id || `rep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const r: ForumReply = {
        id,
        threadId: input.threadId,
        parentReplyId,
        authorId: input.authorId,
        body: sanitizeBody(input.body),
        votesCount: 0,
        createdAt: now,
    };
    replies.set(id, r);
    thread.replyCount += 1;
    thread.lastActivity = now;
    return r;
}

/**
 * @param threadId
 * @returns
 */
export function listReplies(threadId: string): ForumReply[] {
    const out: ForumReply[] = [];
    for (const r of replies.values()) {
        if (r.threadId === threadId) out.push(r);
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

// ----------------------------------------------------------------
// VOTE API (idempotent — 1 vote per user per entity)
// ----------------------------------------------------------------

/**
 * @param input
 * @returns
 */
export function voteEntity(input: {
    voterId: string;
    targetType: 'thread' | 'reply';
    targetId: string;
}): { applied: boolean; votesCount: number } {
    if (!input || !input.voterId || !input.targetId) throw new Error('forum.vote.invalid_input');
    if (input.targetType !== 'thread' && input.targetType !== 'reply') {
        throw new Error('forum.vote.invalid_target_type');
    }
    const key = voteKey(input.voterId, input.targetType, input.targetId);
    if (votes.has(key)) {
        const target = input.targetType === 'thread' ? threads.get(input.targetId) : replies.get(input.targetId);
        return { applied: false, votesCount: target ? target.votesCount : 0 };
    }
    let target: ForumThread | ForumReply | undefined;
    if (input.targetType === 'thread') target = threads.get(input.targetId);
    else target = replies.get(input.targetId);
    if (!target) throw new Error('forum.vote.target_not_found');
    target.votesCount += 1;
    votes.set(key, {
        voterId: input.voterId,
        targetType: input.targetType,
        targetId: input.targetId,
        createdAt: new Date().toISOString(),
    });
    return { applied: true, votesCount: target.votesCount };
}

/**
 * Reset registry (test-only).
 */
export function _resetForumThreadRegistry(): void {
    threads.clear();
    replies.clear();
    votes.clear();
}

// ----------------------------------------------------------------
// SUPABASE IO (async fallback)
// ----------------------------------------------------------------

/**
 * @param thread
 * @returns
 */
export async function persistThreadSupabase(
    thread: ForumThread
): Promise<{ persisted: boolean; error?: string }> {
    try {
        const w = typeof window !== 'undefined' ? (window as any) : null;
        const sb = w?.supabase || null;
        if (!sb || typeof sb.from !== 'function') {
            return { persisted: false, error: 'supabase_unavailable' };
        }
        const { error } = await sb.from('forum_threads').upsert({
            id: thread.id,
            group_id: thread.groupId,
            author_id: thread.authorId,
            title: thread.title,
            body: thread.body,
            pinned: thread.pinned,
            locked: thread.locked,
            votes_count: thread.votesCount,
            reply_count: thread.replyCount,
            last_activity: thread.lastActivity,
            attachments: thread.attachments,
            linked_libraries: thread.linkedLibraries,
            linked_elements: thread.linkedElements,
            linked_specs: thread.linkedSpecs,
            created_at: thread.createdAt,
        });
        if (error) {
            console.debug('[forum:persist_thread_failed]', error.message || error);
            return { persisted: false, error: String(error.message || error) };
        }
        return { persisted: true };
    } catch (e) {
        console.debug('[forum:persist_thread_exception]', (e as any)?.message || e);
        return { persisted: false, error: 'exception' };
    }
}
