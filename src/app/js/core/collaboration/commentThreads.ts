// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Comment Threads - pure-logic (UX-38, Phase 2 SPEC_COLLABORATION_JOURNEY)
 *
 * Modelo de threads de comentários ancorados a elementos do modelo 3D.
 * Zero DOM, zero rede. Estado imutável com Map<threadId, Thread>.
 *
 * Comment: { id, threadId, authorId, authorName, text, createdAt, updatedAt?, resolved? }
 * Thread:  { id, anchorElementId, anchorPoint?, createdAt, resolved, comments[] }
 */

interface ThreadState {
    threads: Map<string, any>;
}

interface CreateThreadArgs {
    threadId: string;
    anchorElementId: string;
    anchorPoint?: { x: number; y: number; z: number };
    authorId: string;
    authorName: string;
    text: string;
    createdAt: number;
    commentId?: string;
}

function freezeComment(c: any) {
    return Object.freeze({ ...c });
}

function freezeThread(t: any) {
    const comments = Object.freeze(t.comments.map(freezeComment));
    const anchorPoint = t.anchorPoint ? Object.freeze({ ...t.anchorPoint }) : null;
    return Object.freeze({
        id: t.id,
        anchorElementId: t.anchorElementId,
        anchorPoint,
        createdAt: t.createdAt,
        resolved: !!t.resolved,
        comments,
    });
}

function freezeState(state: any): Readonly<ThreadState> {
    const threads = new Map<string, any>();
    for (const [k, v] of state.threads) threads.set(k, freezeThread(v));
    return Object.freeze({ threads });
}

/**
 * Cria store vazio.
 */
export function createThreadStore(): Readonly<ThreadState> {
    return freezeState({ threads: new Map() });
}

/**
 * Cria thread nova com primeiro comment.
 * @param {any} state
 * @param {{threadId:string, anchorElementId:string, anchorPoint?:{x:number,y:number,z:number}, authorId:string, authorName:string, text:string, createdAt:number, commentId?:string}} args
 */
export function createThread(state: any, args: CreateThreadArgs): Readonly<ThreadState> {
    if (!args || !args.threadId) throw new Error('createThread: threadId required');
    if (!args.anchorElementId) throw new Error('createThread: anchorElementId required');
    if (!args.authorId) throw new Error('createThread: authorId required');
    if (!args.text || !args.text.trim()) throw new Error('createThread: text required');
    if (typeof args.createdAt !== 'number') throw new Error('createThread: createdAt required');
    if (state.threads.has(args.threadId)) {
        throw new Error(`createThread: thread ${args.threadId} already exists`);
    }
    const firstComment = {
        id: args.commentId || `${args.threadId}-c1`,
        threadId: args.threadId,
        authorId: args.authorId,
        authorName: args.authorName || args.authorId,
        text: args.text,
        createdAt: args.createdAt,
    };
    const thread = {
        id: args.threadId,
        anchorElementId: args.anchorElementId,
        anchorPoint: args.anchorPoint || null,
        createdAt: args.createdAt,
        resolved: false,
        comments: [firstComment],
    };
    const threads = new Map(state.threads);
    threads.set(args.threadId, thread);
    return freezeState({ threads });
}

/**
 * Adiciona comment a thread existente.
 */
export function addComment(state: any, threadId: any, args: any): Readonly<ThreadState> {
    const t = state.threads.get(threadId);
    if (!t) throw new Error(`addComment: thread ${threadId} not found`);
    if (!args || !args.commentId) throw new Error('addComment: commentId required');
    if (!args.authorId) throw new Error('addComment: authorId required');
    if (!args.text || !args.text.trim()) throw new Error('addComment: text required');
    if (typeof args.createdAt !== 'number') throw new Error('addComment: createdAt required');
    if (t.comments.some((c: any) => c.id === args.commentId)) {
        throw new Error(`addComment: commentId ${args.commentId} already exists in thread`);
    }
    const newComment = {
        id: args.commentId,
        threadId,
        authorId: args.authorId,
        authorName: args.authorName || args.authorId,
        text: args.text,
        createdAt: args.createdAt,
    };
    const updated = { ...t, comments: [...t.comments, newComment] };
    const threads = new Map(state.threads);
    threads.set(threadId, updated);
    return freezeState({ threads });
}

/**
 * Edita texto de um comment. Apenas o autor original.
 */
export function editComment(state: any, threadId: any, commentId: any, args: any): Readonly<ThreadState> {
    const t = state.threads.get(threadId);
    if (!t) throw new Error(`editComment: thread ${threadId} not found`);
    if (!args || !args.text || !args.text.trim()) throw new Error('editComment: text required');
    if (typeof args.updatedAt !== 'number') throw new Error('editComment: updatedAt required');
    if (!args.authorId) throw new Error('editComment: authorId required');
    const idx = t.comments.findIndex((c: any) => c.id === commentId);
    if (idx === -1) throw new Error(`editComment: comment ${commentId} not found`);
    const original = t.comments[idx];
    if (original.authorId !== args.authorId) {
        throw new Error('editComment: only original author may edit');
    }
    const edited = { ...original, text: args.text, updatedAt: args.updatedAt };
    const newComments = [...t.comments];
    newComments[idx] = edited;
    const threads = new Map(state.threads);
    threads.set(threadId, { ...t, comments: newComments });
    return freezeState({ threads });
}

/**
 * Deleta comment. Apenas autor. Não permite deletar último comment (manteria thread vazio inválido).
 */
export function deleteComment(state: any, threadId: any, commentId: any, authorId: any): Readonly<ThreadState> {
    const t = state.threads.get(threadId);
    if (!t) throw new Error(`deleteComment: thread ${threadId} not found`);
    if (!authorId) throw new Error('deleteComment: authorId required');
    const idx = t.comments.findIndex((c: any) => c.id === commentId);
    if (idx === -1) throw new Error(`deleteComment: comment ${commentId} not found`);
    if (t.comments[idx].authorId !== authorId) {
        throw new Error('deleteComment: only original author may delete');
    }
    if (t.comments.length === 1) {
        throw new Error('deleteComment: cannot delete last comment of thread (would leave thread empty)');
    }
    const newComments = t.comments.filter((_: any, i: any) => i !== idx);
    const threads = new Map(state.threads);
    threads.set(threadId, { ...t, comments: newComments });
    return freezeState({ threads });
}

/**
 * Marca thread como resolvido. Idempotente.
 */
export function resolveThread(state: any, threadId: any): Readonly<ThreadState> {
    const t = state.threads.get(threadId);
    if (!t) throw new Error(`resolveThread: thread ${threadId} not found`);
    if (t.resolved) return state;
    const threads = new Map(state.threads);
    threads.set(threadId, { ...t, resolved: true });
    return freezeState({ threads });
}

/**
 * Reabre thread. Idempotente quando já aberto.
 */
export function reopenThread(state: any, threadId: any): Readonly<ThreadState> {
    const t = state.threads.get(threadId);
    if (!t) throw new Error(`reopenThread: thread ${threadId} not found`);
    if (!t.resolved) return state;
    const threads = new Map(state.threads);
    threads.set(threadId, { ...t, resolved: false });
    return freezeState({ threads });
}

/**
 * Retorna threads ancorados a um elemento.
 */
export function getThreadsForElement(state: any, elementId: any): any[] {
    const out = [];
    for (const t of state.threads.values()) {
        if (t.anchorElementId === elementId) out.push(t);
    }
    return out;
}

/**
 * Conta threads não resolvidos.
 */
export function getOpenThreadsCount(state: any): number {
    let n = 0;
    for (const t of state.threads.values()) if (!t.resolved) n += 1;
    return n;
}

/**
 * Sumário do store.
 */
export function summarizeThreads(state: any): { threadCount: number; openCount: number; totalComments: number } {
    let openCount = 0;
    let totalComments = 0;
    for (const t of state.threads.values()) {
        if (!t.resolved) openCount += 1;
        totalComments += t.comments.length;
    }
    return { threadCount: state.threads.size, openCount, totalComments };
}
