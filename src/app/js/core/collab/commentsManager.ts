// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Comments Manager - pure-logic CRUD for collaboration comments.
 *
 * SPEC: SPEC_COLLABORATION_JOURNEY M3/M4 (Must Have).
 * Pure ES module: no DOM, no IndexedDB, no Supabase. Persistence
 * adapters and UI are wired separately. Engine-agnostic so the same
 * logic can be tested in Node (cheap tests) and reused inside
 * `utils/ui/commentsPanel.js` and the offline `syncQueue` adapter.
 *
 * Modelo Comment:
 *   { id, modelId, elementId, authorId, body, parentId,
 *     mentions: string[], createdAt, deletedAt }
 *
 * Estado interno: Map<id, Comment>. Mutações retornam o objeto
 * imutável resultante para facilitar diffing.
 */

const MENTION_RE = /(^|\s)@([A-Za-z0-9_.-]{2,40})\b/g;
const DEFAULT_PREVIEW_LIMIT = 140;
export const COMMENT_REACTIONS = Object.freeze({
    THUMBS_UP: 'thumbs_up',
    THUMBS_DOWN: 'thumbs_down',
    RESOLVED: 'resolved',
    REJECTED: 'rejected',
    HOT: 'hot',
    QUESTION: 'question',
});

const ALLOWED_REACTIONS = new Set(Object.values(COMMENT_REACTIONS));

/**
 * Extracts unique `@username` mentions from a body string.
 * @param {string} body
 * @returns {string[]} array de usernames sem o `@`, ordem de aparição.
 */
export function parseMentions(body: string): string[] {
    if (typeof body !== 'string' || body.length === 0) return [];
    const out = [];
    const seen = new Set();
    let m;
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(body)) !== null) {
        const u = m[2];
        if (u === undefined) continue;
        if (!seen.has(u)) {
            seen.add(u);
            out.push(u);
        }
    }
    return out;
}

function truncatePreview(body: any, limit: any) {
    const normalized = String(body || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (normalized.length <= limit) return normalized;
    if (limit <= 3) return normalized.slice(0, limit);
    return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function normalizeRecipient(username: any, resolved: any) {
    if (!resolved) return null;
    if (typeof resolved === 'string') {
        return { id: resolved, username };
    }
    if (typeof resolved !== 'object') return null;
    const id = resolved.id || resolved.userId || resolved.uid;
    if (!id) return null;
    return {
        id,
        username: resolved.username || resolved.handle || username,
        displayName: resolved.displayName || resolved.name || resolved.username || username,
    };
}

function cloneReactions(reactions = {}) {
        const out: Record<string, any>= {};
    for (const [reaction, userIds] of Object.entries(reactions)) {
        out[reaction] = Object.freeze(Array.from((userIds as any)));
    }
    return Object.freeze(out);
}

function reactionSummary(reactions = {}) {
    return Object.freeze(
        Object.entries(reactions)
            .map(([reaction, userIds]) =>
                Object.freeze({
                    reaction,
                    count: Array.isArray(userIds) ? userIds.length : 0,
                    userIds: Object.freeze(Array.isArray(userIds) ? userIds.slice() : []),
                }),
            )
            .filter((item: any) => item.count > 0)
            .sort((a: any, b: any) => a.reaction.localeCompare(b.reaction)),
    );
}

function assertReaction(reaction: any) {
    if (!ALLOWED_REACTIONS.has(reaction)) {
        throw new Error(`comments.reaction: unsupported reaction ${reaction}`);
    }
}

function assertUserId(userId: any) {
    if (typeof userId !== 'string' || userId.trim().length === 0) {
        throw new Error('comments.reaction: userId required');
    }
}

// ──────────────────────────────────────────────────────────────────────
// Mention notifications helpers
// ──────────────────────────────────────────────────────────────────────

interface MentionNotificationOptions {
    resolveUser?: (username: string, comment: any) => unknown;
    openUserIds?: Iterable<string> | string[];
    idFactory?: (args: any) => string;
    clock?: () => number;
    previewLimit?: number;
    includeSelfMentions?: boolean;
}

function buildMentionNotificationOptions(opts: MentionNotificationOptions): Required<MentionNotificationOptions> {
    return {
        resolveUser:
            typeof opts.resolveUser === 'function'
                ? opts.resolveUser
                : (username: any) => username,
        openUserIds: opts.openUserIds || [],
        idFactory:
            opts.idFactory ||
            ((args: any) =>
                `mention:${args.comment?.id || 'comment'}:${args.recipient.id}:${args.index + 1}`),
        clock: opts.clock || (() => Date.now()),
        previewLimit:
            Number.isInteger(opts.previewLimit) && (opts.previewLimit as number) > 0
                ? (opts.previewLimit as number)
                : DEFAULT_PREVIEW_LIMIT,
        includeSelfMentions: !!opts.includeSelfMentions,
    };
}

function buildMentionPayload(
    username: string,
    recipient: NonNullable<ReturnType<typeof normalizeRecipient>>,
    comment: any,
    preview: string,
    createdAt: number,
    opts: ReturnType<typeof buildMentionNotificationOptions>,
    openUserIds: Set<string>,
    index: number,
): Readonly<any> {
    const payload: any = {
        id: opts.idFactory({ comment, recipient, username, index }),
        type: 'mention',
        status: 'queued',
        commentId: comment.id,
        modelId: comment.modelId,
        elementId: comment.elementId,
        actorId: comment.authorId,
        recipientId: recipient.id,
        recipientUsername: recipient.username,
        recipientDisplayName: recipient.displayName || recipient.username,
        bodyPreview: preview,
        createdAt,
        persist: true,
        toast: openUserIds.has(recipient.id),
    };
    return Object.freeze(payload);
}

/**
 * Builds local notification payloads for mentions found in a comment.
 *
 * This is intentionally pure: no Supabase write, no toast side effect. The
 * caller persists each returned payload and shows a toast when `toast` is true.
 *
 * @param {any} comment comment returned by createCommentsManager().add/update
 * @param {any} [opts]
 * @returns {ReadonlyArray<any>}
 */
export function buildMentionNotifications(comment: any, opts: any = {}): ReadonlyArray<any> {
    if (!comment || typeof comment !== 'object') {
        throw new Error('mentionNotifications: comment required');
    }
    const mentions = Array.isArray(comment.mentions) ? comment.mentions : parseMentions(comment.body);
    if (mentions.length === 0) return Object.freeze([]);

    const options = buildMentionNotificationOptions(opts);
    const createdAt = options.clock();
    const preview = truncatePreview(comment.body, options.previewLimit);
    const openUserIds = new Set(options.openUserIds);
    const out = [];

    for (const username of mentions) {
        const recipient = normalizeRecipient(username, options.resolveUser(username, comment));
        if (!recipient) continue;
        if (!options.includeSelfMentions && recipient.id === comment.authorId) continue;
        out.push(buildMentionPayload(username, recipient, comment, preview, createdAt, options, openUserIds, out.length));
    }
    return Object.freeze(out);
}

/**
 * Creates a new comments store. State lives in module closure per call,
 * keeping multiple instances trivially isolatable in tests.
 *
 * @param {object} [opts]
 * @param {() => string} [opts.idFactory] - gera IDs únicos
 * @param {() => number} [opts.clock] - retorna epoch ms (testável)
 * @returns {any}
 */
export function createCommentsManager(opts: { idFactory?: () => string; clock?: () => number } = {}): any {
    const store = new Map();
    let counter = 0;
    const idFactory = opts.idFactory || (() => `c_${Date.now()}_${++counter}`);
    const clock = opts.clock || (() => Date.now());

    function add(input: any) {
        if (!input || typeof input !== 'object') {
            throw new Error('comments.add: input required');
        }
        const { modelId, elementId, authorId, body, parentId = null } = input;
        if (!modelId || !elementId || !authorId) {
            throw new Error('comments.add: modelId, elementId, authorId required');
        }
        if (typeof body !== 'string' || body.trim().length === 0) {
            throw new Error('comments.add: body must be non-empty string');
        }
        if (parentId !== null && !store.has(parentId)) {
            throw new Error(`comments.add: parentId ${parentId} not found`);
        }
        const comment = {
            id: idFactory(),
            modelId,
            elementId,
            authorId,
            body,
            parentId,
            mentions: parseMentions(body),
            reactions: Object.freeze({}),
            createdAt: clock(),
            deletedAt: null,
        };
        store.set(comment.id, comment);
        return comment;
    }

    function get(id: any) {
        return store.get(id) || null;
    }

    function list(filter: any = {}) {
        const out = [];
        for (const c of store.values()) {
            if (filter.elementId && c.elementId !== filter.elementId) continue;
            if (filter.modelId && c.modelId !== filter.modelId) continue;
            if (filter.authorId && c.authorId !== filter.authorId) continue;
            if (!filter.includeDeleted && c.deletedAt !== null) continue;
            out.push(c);
        }
        return out.sort((a: any, b: any) => a.createdAt - b.createdAt);
    }

    function update(id: any, patch: any) {
        const cur = store.get(id);
        if (!cur) throw new Error(`comments.update: ${id} not found`);
        if (cur.deletedAt !== null) throw new Error('comments.update: cannot edit deleted');
        const next = { ...cur };
        if (typeof patch.body === 'string' && patch.body.trim().length > 0) {
            next.body = patch.body;
            next.mentions = parseMentions(patch.body);
        }
        store.set(id, next);
        return next;
    }

    function remove(id: any) {
        const cur = store.get(id);
        if (!cur) return false;
        if (cur.deletedAt !== null) return false;
        store.set(id, { ...cur, deletedAt: clock() });
        return true;
    }

    function addReaction(id: any, reaction: any, userId: any) {
        assertReaction(reaction);
        assertUserId(userId);
        const cur = store.get(id);
        if (!cur) throw new Error(`comments.reaction: ${id} not found`);
        if (cur.deletedAt !== null) throw new Error('comments.reaction: cannot react to deleted');
        const current = new Set(cur.reactions?.[reaction] || []);
        current.add(userId);
        const next = {
            ...cur,
            reactions: cloneReactions({
                ...(cur.reactions || {}),
                [reaction]: current,
            }),
        };
        store.set(id, next);
        return next;
    }

    function removeReaction(id: any, reaction: any, userId: any) {
        assertReaction(reaction);
        assertUserId(userId);
        const cur = store.get(id);
        if (!cur) throw new Error(`comments.reaction: ${id} not found`);
        const current = new Set(cur.reactions?.[reaction] || []);
        current.delete(userId);
        const nextReactions = { ...(cur.reactions || {}) };
        if (current.size === 0) {
            delete nextReactions[reaction];
        } else {
            nextReactions[reaction] = current;
        }
        const next = { ...cur, reactions: cloneReactions(nextReactions) };
        store.set(id, next);
        return next;
    }

    function reactionsOf(id: any) {
        const cur = store.get(id);
        if (!cur) return Object.freeze([]);
        return reactionSummary(cur.reactions);
    }

    function threadOf(rootId: any) {
        const root = store.get(rootId);
        if (!root || root.parentId !== null) return [];
        const out = [root];
        for (const c of store.values()) {
            if (c.parentId === rootId && c.deletedAt === null) out.push(c);
        }
        return out.sort((a, b) => a.createdAt - b.createdAt);
    }

    function clear() {
        store.clear();
    }

    function size() {
        return store.size;
    }

    return { add, get, list, update, remove, addReaction, removeReaction, reactionsOf, threadOf, clear, size };
}
