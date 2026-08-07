// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// SPEC: docs/specs/features/SPEC_FORUM_KNOWLEDGE_GROUPS.md
// Phase 2 — Forum UI panel (3-pane: groups / feed / detail).

/* ================================================================
   FORUM MODAL — Knowledge Groups panel.

   Layout 3-pane espelhando o Libraries Marketplace (diretiva
   Calvin: Forum conceitualmente adjacente a Libraries):
     - Sidebar esquerda: lista de grupos + "Novo Grupo"
     - Centro: feed de threads do grupo selecionado + "Nova Thread"
     - Direita: detalhe da thread (body md + replies + composer)

   Pure helpers (buildGroupListHtml, buildThreadFeedHtml,
   buildThreadDetailHtml, formatRelativeTime) são exportados e
   testáveis em Node sem browser.
   ================================================================ */

import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { attachModalA11y } from './modalA11y.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { lazyImport } from '../helpers/lazyImport.js';

const MODAL_ID = 'forum-modal';

/** @type {(() => void) | null} */
let _a11yCleanup: any = null;

/** @type {string | null} */
let _selectedGroupId: any = null;
/** @type {string | null} */
let _openThreadId: any = null;

// ----------------------------------------------------------------
// PURE HELPERS (exported for tests)
// ----------------------------------------------------------------

/**
 * Relative time label em PT ("agora", "2h atrás", "3d atrás", "1sem atrás").
 * @param {string} iso ISO 8601 timestamp
 * @param {number} [nowMs?] injetável para testes determinísticos
 * @returns {string}
 */
export function formatRelativeTime(iso: any, nowMs?: any): string {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) return '';
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    const diff = Math.max(0, now - then);
    const sec = Math.floor(diff / 1000);
    if (sec < 45) return 'agora';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}min atrás`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h atrás`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d atrás`;
    const wk = Math.floor(day / 7);
    if (wk < 5) return `${wk}sem atrás`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}m atrás`;
    return `${Math.floor(day / 365)}a atrás`;
}

/**
 * Minimal markdown → safe HTML. Sanitiza primeiro (escapeHtml), depois
 * aplica um subconjunto seguro: **bold**, *italic*, `code`, links, \n→<br>.
 * Não usa innerHTML cru de input do usuário (XSS-safe).
 * @param {string} src
 * @returns {string}
 */
export function renderMarkdownSafe(src: any): string {
    let h = escapeHtml(typeof src === 'string' ? src : '');
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Links: só http(s), texto entre []() — já escapado, validamos protocolo.
    h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m: any, txt: any, url: any) => {
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${txt}</a>`;
    });
    h = h.replace(/\r?\n/g, '<br>');
    return h;
}

/**
 * @param {Array<{ id: string, name: string, membersCount?: number, topicTags?: string[] }>} groups
 * @param {string | null} [groups]
 * @returns {string}
 */
export function buildGroupListHtml(groups: any, selectedId: any): string {
    if (!Array.isArray(groups) || groups.length === 0) {
        return `<div class="forum-empty">${escapeHtml(t('library.empty') || 'Nenhum grupo ainda')}</div>`;
    }
    return groups
        .map((g) => {
            const sel = g.id === selectedId ? ' forum-group--active' : '';
            const tags = Array.isArray(g.topicTags) ? g.topicTags.slice(0, 4) : [];
            const chips = tags.map((tg: any) => `<span class="forum-chip">${escapeHtml(tg)}</span>`).join('');
            const count = Number(g.membersCount || 0);
            return (
                `<button class="forum-group${sel}" data-group-id="${escapeHtml(g.id)}" type="button">` +
                `<span class="forum-group-name">${escapeHtml(g.name)}</span>` +
                `<span class="forum-group-meta"><span class="forum-badge">${count}</span> ${escapeHtml(t('forumMembers') || 'Membros')}</span>` +
                `<span class="forum-chips">${chips}</span>` +
                '</button>'
            );
        })
        .join('');
}

/**
 * @param {Array<{ id: string, title: string, authorId: string, replyCount?: number, votesCount?: number, lastActivity?: string, pinned?: boolean }>} threads
 * @returns {string}
 */
export function buildThreadFeedHtml(threads: any): string {
    if (!Array.isArray(threads) || threads.length === 0) {
        return `<div class="forum-empty">${escapeHtml(t('library.empty') || 'Nenhum tópico ainda')}</div>`;
    }
    const sorted = threads.slice().sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return String(b.lastActivity || '').localeCompare(String(a.lastActivity || ''));
    });
    return sorted
        .map((th) => {
            const pin = th.pinned ? `<span class="forum-pin" title="Fixado">&#9733;</span>` : '';
            return (
                `<button class="forum-thread-card" data-thread-id="${escapeHtml(th.id)}" type="button">` +
                `<span class="forum-thread-title">${pin}${escapeHtml(th.title)}</span>` +
                `<span class="forum-thread-meta">` +
                `<span>${escapeHtml(th.authorId)}</span>` +
                `<span>&#9650; ${Number(th.votesCount || 0)}</span>` +
                `<span>&#128172; ${Number(th.replyCount || 0)}</span>` +
                `<span>${escapeHtml(formatRelativeTime(String(th.lastActivity || '')))}</span>` +
                '</span></button>'
            );
        })
        .join('');
}

/**
 * @param {{ id: string, title: string, authorId: string, body: string, votesCount?: number, createdAt?: string } | null} thread
 * @param {Array<{ id: string, authorId: string, body: string, votesCount?: number, createdAt?: string, parentReplyId?: string | null }>} replies
 * @returns {string}
 */
export function buildThreadDetailHtml(thread: any, replies: any): string {
    if (!thread) {
        return `<div class="forum-empty">${escapeHtml(t('forumTitle') || 'Selecione um tópico')}</div>`;
    }
    const head =
        `<div class="forum-detail-head">` +
        `<h3 class="forum-detail-title">${escapeHtml(thread.title)}</h3>` +
        `<div class="forum-detail-sub">${escapeHtml(thread.authorId)} · ${escapeHtml(formatRelativeTime(String(thread.createdAt || '')))}</div>` +
        `</div>`;
    const voteBox =
        `<div class="forum-votebox">` +
        `<button class="forum-vote" data-vote-type="thread" data-vote-id="${escapeHtml(thread.id)}" type="button" aria-label="Votar">&#9650;</button>` +
        `<span class="forum-vote-count">${Number(thread.votesCount || 0)}</span>` +
        `</div>`;
    const body = `<div class="forum-detail-body">${renderMarkdownSafe(thread.body)}</div>`;
    const list = Array.isArray(replies) ? replies : [];
    const repliesHtml = list.length
        ? list
              .map((r) => {
                  const nested = r.parentReplyId ? ' forum-reply--nested' : '';
                  return (
                      `<div class="forum-reply${nested}">` +
                      `<div class="forum-reply-meta">${escapeHtml(r.authorId)} · ${escapeHtml(formatRelativeTime(String(r.createdAt || '')))}</div>` +
                      `<div class="forum-reply-body">${renderMarkdownSafe(r.body)}</div>` +
                      `<button class="forum-vote forum-vote--sm" data-vote-type="reply" data-vote-id="${escapeHtml(r.id)}" type="button" aria-label="Votar">&#9650; ${Number(r.votesCount || 0)}</button>` +
                      `</div>`
                  );
              })
              .join('')
        : `<div class="forum-empty">${escapeHtml(t('forumReply') || 'Seja o primeiro a responder')}</div>`;
    const composer =
        `<div class="forum-composer">` +
        `<textarea class="forum-reply-input" rows="3" placeholder="${escapeHtml(t('forumReply') || 'Responder')}..."></textarea>` +
        `<button class="forum-reply-submit ecbt-btn" type="button">${escapeHtml(t('forumReply') || 'Responder')}</button>` +
        `</div>`;
    return (
        head +
        `<div class="forum-detail-main">${voteBox}${body}</div>` +
        `<div class="forum-replies">${repliesHtml}</div>` +
        composer
    );
}

// ----------------------------------------------------------------
// DYNAMIC REGISTRY ACCESS
// ----------------------------------------------------------------

async function registries() {
    const [g, th] = await Promise.all([
        import('../../core/forum/forumGroupRegistry.js'),
        import('../../core/forum/forumThreadRegistry.js'),
    ]);
    return { g, th };
}

function currentUserId() {
    try {
        const w = (window as any);
        return w?.currentSession?.user?.id || w?.currentSession?.userId || 'anon';
    } catch {
        return 'anon';
    }
}

// ----------------------------------------------------------------
// RENDER
// ----------------------------------------------------------------

async function refresh() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const { g, th } = await registries();
    const groups = g.listGroups();
    const groupPane = modal.querySelector('.forum-groups');
    if (groupPane) groupPane.innerHTML = buildGroupListHtml(groups, _selectedGroupId);

    const feedPane = modal.querySelector('.forum-feed-list');
    const detailPane = modal.querySelector('.forum-detail');
    if (_selectedGroupId) {
        const threads = th.listThreads({ groupId: _selectedGroupId, pinnedFirst: true });
        if (feedPane) feedPane.innerHTML = buildThreadFeedHtml(threads);
        if (_openThreadId) {
            const thread = th.getThread(_openThreadId);
            const reps = th.listReplies(_openThreadId);
            if (detailPane) detailPane.innerHTML = buildThreadDetailHtml(thread, reps);
        } else if (detailPane) {
            detailPane.innerHTML = buildThreadDetailHtml(null, []);
        }
    } else {
        if (feedPane)
            feedPane.innerHTML = `<div class="forum-empty">${escapeHtml(t('forumTitle') || 'Selecione um grupo')}</div>`;
        if (detailPane) detailPane.innerHTML = buildThreadDetailHtml(null, []);
    }
}

/** @param {string} groupId */
export async function _selectGroup(groupId: any) {
    _selectedGroupId = groupId;
    _openThreadId = null;
    const uid = currentUserId();
    try {
        const { g } = await registries();
        g.joinGroup({ groupId, userId: uid });
    } catch (e) {
        /* já membro ou grupo inválido — ignora */
        console.debug('[forumModal:joinGroup]', (e as any)?.message || e);
    }
    await refresh();
}

/** @param {string} threadId */
export async function _openThread(threadId: any) {
    _openThreadId = threadId;
    await refresh();
}

async function promptCreateGroup() {
    // REF-SWEEPS RF-2: chamada fire-and-forget no handler de click do forum.
    const mod = await lazyImport('./asyncDialogs.js', { importer: () => import('./asyncDialogs.js') });
    if (!mod) return;
    const name = await mod.asyncPrompt(t('forumNewGroup') || 'Nome do grupo', '');
    if (!name || !name.trim()) return;
    const { g } = await registries();
    try {
        const grp = g.createGroup({ name: name.trim(), ownerId: currentUserId() });
        _selectedGroupId = grp.id;
        showToast(t('forumNewGroup') || 'Grupo criado', 'success');
        await refresh();
    } catch (e: any) {
        showToast(String((e as any)?.message || e), 'error');
    }
}

async function promptCreateThread() {
    if (!_selectedGroupId) {
        showToast(t('forumTitle') || 'Selecione um grupo primeiro', 'warning');
        return;
    }
    const mod = await lazyImport('./asyncDialogs.js', { importer: () => import('./asyncDialogs.js') });
    if (!mod) return;
    const title = await mod.asyncPrompt(t('forumNewThread') || 'Título do tópico', '');
    if (!title || !title.trim()) return;
    const body = (await mod.asyncPrompt(t('forumNewThread') || 'Conteúdo', '')) || '';
    const { th } = await registries();
    try {
        const thread = th.createThread({
            groupId: _selectedGroupId,
            authorId: currentUserId(),
            title: title.trim(),
            body,
        });
        _openThreadId = thread.id;
        showToast(t('forumNewThread') || 'Tópico criado', 'success');
        await refresh();
    } catch (e: any) {
        showToast(String((e as any)?.message || e), 'error');
    }
}

async function submitReply() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal || !_openThreadId) return;
    const ta = (modal.querySelector('.forum-reply-input') as HTMLTextAreaElement | null);
    const body = ta?.value?.trim();
    if (!body) return;
    const { th } = await registries();
    try {
        th.addReply({ threadId: _openThreadId, authorId: currentUserId(), body });
        if (ta) ta.value = '';
        await refresh();
    } catch (e: any) {
        showToast(String((e as any)?.message || e), 'error');
    }
}

/**
 * @param {'thread' | 'reply'} type
 * @param {string} id
 */
async function castVote(type: any, id: any) {
    const { th } = await registries();
    try {
        th.voteEntity({ voterId: currentUserId(), targetType: type, targetId: id });
        await refresh();
    } catch (e: any) {
        showToast(String((e as any)?.message || e), 'error');
    }
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

export function openForumModal() {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'ecbt-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        const title = escapeHtml(t('forumTitle') || 'Grupos de Conhecimento');
        modal.innerHTML =
            '<div class="ecbt-dialog ecbt-dialog--xl forum-dialog">' +
            '<div class="forum-header">' +
            `<h2 class="forum-title">${title}</h2>` +
            '<button class="forum-close ecbt-btn" aria-label="Fechar" type="button">&times;</button>' +
            '</div>' +
            '<div class="forum-body">' +
            '<aside class="forum-sidebar">' +
            `<button class="forum-new-group ecbt-btn" type="button">+ ${escapeHtml(t('forumNewGroup') || 'Novo Grupo')}</button>` +
            '<div class="forum-groups" aria-live="polite"></div>' +
            '</aside>' +
            '<section class="forum-feed">' +
            `<button class="forum-new-thread ecbt-btn" type="button">+ ${escapeHtml(t('forumNewThread') || 'Nova Thread')}</button>` +
            '<div class="forum-feed-list" aria-live="polite"></div>' +
            '</section>' +
            '<section class="forum-detail" aria-live="polite"></section>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);
        // Delegated click handling (modal recreated rarely; single listener).
        modal.addEventListener('click', (ev) => {
            const tgt = (ev.target as HTMLElement);
            if (ev.target === modal || tgt.closest('.forum-close')) {
                closeForumModal();
                return;
            }
            if (tgt.closest('.forum-new-group')) {
                promptCreateGroup();
                return;
            }
            if (tgt.closest('.forum-new-thread')) {
                promptCreateThread();
                return;
            }
            if (tgt.closest('.forum-reply-submit')) {
                submitReply();
                return;
            }
            const grpBtn = tgt.closest('.forum-group');
            if (grpBtn) {
                _selectGroup((grpBtn as HTMLElement).dataset.groupId || '');
                return;
            }
            const thCard = tgt.closest('.forum-thread-card');
            if (thCard) {
                _openThread((thCard as HTMLElement).dataset.threadId || '');
                return;
            }
            const voteBtn = tgt.closest('.forum-vote');
            if (voteBtn) {
                const el = (voteBtn as HTMLElement);
                castVote(el.dataset.voteType === 'reply' ? 'reply' : 'thread', el.dataset.voteId || '');
            }
        });
    }
    (modal as HTMLElement).style.display = 'flex';
    _a11yCleanup = attachModalA11y((modal as HTMLElement), closeForumModal);
    refresh();
    // Sprint 3 Tier-B (Calvin 2026-06-03): URL = estado em tempo real
    syncDeepLinkUrl('forum');
}

export function closeForumModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
        (modal as HTMLElement).style.display = 'none';
        clearDeepLinkUrl();
    }
    if (typeof _a11yCleanup === 'function') {
        _a11yCleanup();
        _a11yCleanup = null;
    }
}
