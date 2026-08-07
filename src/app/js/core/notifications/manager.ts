// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   NOTIFICATIONS MANAGER — CRUD + state + batching
   SPEC_NOTIFICATIONS_SYSTEM_9_72 §4 (Arquitetura)

   Consome priority.js (pure routing) e persiste em IDB.

   Pattern segue autosaveLane/manager.js:
   - _lanes em memória + _persist() after each mutation
   - _ensureLoaded() no primeiro acesso
   - API sync (getters/filters) + async (writes/IDB)
   ================================================================ */
import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';
import { getTierForType, getTierConfig, findBatchTarget, mergeNotifications } from './priority.js';
import { resolveAllowedChannels } from './_channelPrefsPure.js';
const log = createLogger('Notifications');
const IDB_KEY = 'ecbyts-notifications';
const IDB_PREFS_KEY = 'ecbyts-notifications-prefs';
const IDB_MUTES_KEY = 'ecbyts-notifications-mutes';
/** @type {Array<any>} */
let _notifications: any[] = [];
let _loaded = false;
// ──────────────────────────────────────────────────────────────────────
// Persistence helpers
// ──────────────────────────────────────────────────────────────────────
async function _ensureLoaded() {
    if (_loaded)
        return;
    try {
        const stored = await idbGet(IDB_KEY);
        if (Array.isArray(stored))
            _notifications = stored;
    }
    catch (err: any) {
        log.warn('Failed to load notifications from IDB:', (err as any)?.message);
    }
    _loaded = true;
}
async function _persist() {
    try {
        await idbSet(IDB_KEY, _notifications);
    }
    catch (err: any) {
        log.error('Failed to persist notifications', err);
    }
}
function _genId() {
    return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
// ──────────────────────────────────────────────────────────────────────
// Pure validators
// ──────────────────────────────────────────────────────────────────────
/**
 * Valida shape mínimo de uma notificação.
 * @param {any} notif
 * @returns {boolean}
 */
export function isValidNotification(notif: any) {
    return !!(notif &&
        typeof notif === 'object' &&
        typeof notif.id === 'string' &&
        notif.id.length > 0 &&
        typeof notif.userId === 'string' &&
        notif.userId.length > 0 &&
        typeof notif.type === 'string' &&
        notif.type.length > 0 &&
        typeof notif.createdAt === 'string');
}
// ──────────────────────────────────────────────────────────────────────
// Async CRUD API
// ──────────────────────────────────────────────────────────────────────
/**
 * Cria uma notificação (ou agrega em existente se dentro de batching window).
 *
 * @param {object} params
 * @returns {Promise<any>}
 */
export async function createNotification(params: any) {
    if (!params || typeof params !== 'object') {
        throw new Error('createNotification: params required');
    }
    const { userId, type } = params;
    if (!userId || typeof userId !== 'string')
        throw new Error('createNotification: userId required');
    if (!type || typeof type !== 'string')
        throw new Error('createNotification: type required');
    await _ensureLoaded();
    const createdAt = params.createdAt || new Date().toISOString();
    const tier = params.priority || getTierForType(type);
    const payload = {
        ...(params.payload || {}),
        ...(params.title ? { title: params.title } : {}),
        ...(params.body ? { body: params.body } : {}),
        ...(params.data ? { data: params.data } : {}),
    };
    // Mute check
    if (params.projectId && (await isProjectMuted(userId, params.projectId))) {
        const suppressed = {
            id: _genId(),
            userId,
            type,
            tier,
            targetId: params.targetId || null,
            actorId: params.actorId || null,
            actorIds: params.actorId ? [params.actorId] : [],
            payload,
            createdAt,
            updatedAt: createdAt,
            read: true,
            archived: false,
            count: 1,
            status: 'suppressed',
            channels: [],
            projectId: params.projectId,
        };
        _notifications.push(suppressed);
        await _persist();
        return { notification: suppressed, merged: false };
    }
    const channels = resolveChannelsFor({ type, tier });
    const prefs = await getPreferences(userId);
    const prefsByKey = (prefs) as Record<string, any>;
    const filteredChannels = resolveAllowedChannels(channels, prefsByKey, type, tier);
    const incoming = {
        id: _genId(),
        userId,
        type,
        tier,
        targetId: params.targetId || null,
        actorId: params.actorId || null,
        actorIds: params.actorId ? [params.actorId] : [],
        payload,
        createdAt,
        updatedAt: createdAt,
        read: false,
        archived: false,
        count: 1,
        status: 'pending',
        channels: filteredChannels,
        projectId: params.projectId || null,
    };
    // Tenta agregar com existing (mesmo user, type, targetId, unread, dentro da janela)
    const userExisting = _notifications.filter((n: any) => n.userId === userId && !n.archived && !n.read);
    const batchTarget = findBatchTarget(incoming, userExisting);
    if (batchTarget) {
        const merged = mergeNotifications(batchTarget, incoming);
        const idx = _notifications.findIndex((n: any) => n.id === ( (batchTarget as any)).id);
        if (idx >= 0)
            _notifications[idx] = merged;
        await _persist();
        return { notification: merged, merged: true };
    }
    _notifications.push(incoming);
    await _persist();
    return { notification: incoming, merged: false };
}
/**
 * Retorna notifs de um usuário (não archived). Ordem: mais recentes primeiro.
 * @param {string} notificationId
 * @param {any} [opts]
 * @param {boolean} [opts.unreadOnly=false]
 * @param {string} [opts.tierFilter] - 'P0' | 'P1' | 'P2'
 * @param {number} [opts.limit]
 * @returns {Promise<Array<any>>}
 */
/**
 * Retorna uma notificação por ID.
 * @param {string} notificationId
 * @returns {Promise<any>}
 */
export async function getNotification(notificationId: any) {
    await _ensureLoaded();
    return _notifications.find((n: any) => n.id === notificationId) || null;
}
export async function getNotificationsForUser(userId: any, opts: any = {}) {
    await _ensureLoaded();
    let list = _notifications.filter((n: any) => n.userId === userId && !n.archived);
    if (opts.unreadOnly)
        list = list.filter((n: any) => !n.read);
    if (opts.tierFilter)
        list = list.filter((n: any) => n.tier === opts.tierFilter);
    list = list.slice().sort((a: any, b: any) => {
        const ta = new Date(a.updatedAt || a.createdAt).getTime();
        const tb = new Date(b.updatedAt || b.createdAt).getTime();
        return tb - ta;
    });
    if (Number.isFinite(opts.limit) && opts.limit > 0)
        list = list.slice(0, opts.limit);
    return list;
}
/**
 * Contador de não-lidas por tier para badge de UI.
 * @param {string} userId
 * @returns {Promise<any>}
 */
export async function getUnreadCount(userId: any) {
    await _ensureLoaded();
    /** @type {Record<string, number>} */
    const byTier = { P0: 0, P1: 0, P2: 0 };
    let total = 0;
    for (const n of _notifications) {
        if (n.userId !== userId || n.archived || n.read)
            continue;
        total++;
        if ((byTier as Record<string,any>)[n.tier] !== undefined)
            (byTier as Record<string,any>)[n.tier]++;
    }
    return { total, byTier };
}
/**
 * Marca uma notif como lida.
 * @param {string} notificationId
 * @returns {Promise<boolean>}
 */
export async function markRead(notificationId: any) {
    await _ensureLoaded();
    const idx = _notifications.findIndex((n: any) => n.id === notificationId);
    if (idx < 0)
        return false;
    if (_notifications[idx].read)
        return true;
    _notifications[idx] = {
        ..._notifications[idx],
        read: true,
        readAt: new Date().toISOString(),
        status: 'read',
    };
    await _persist();
    return true;
}
/**
 * Marca todas não-lidas de um usuário como lidas.
 * @param {string} userId
 * @returns {Promise<number>} quantidade atualizada
 */
export async function markAllRead(userId: any) {
    await _ensureLoaded();
    const readAt = new Date().toISOString();
    let count = 0;
    for (let i = 0; i < _notifications.length; i++) {
        const n = _notifications[i];
        if (n.userId === userId && !n.read && !n.archived) {
            _notifications[i] = { ...n, read: true, readAt, status: 'read' };
            count++;
        }
    }
    if (count > 0)
        await _persist();
    return count;
}
/**
 * Archive (soft-delete). Archived não aparece em getNotificationsForUser.
 * @param {string} notificationId
 * @returns {Promise<boolean>}
 */
export async function archive(notificationId: any) {
    await _ensureLoaded();
    const idx = _notifications.findIndex((n: any) => n.id === notificationId);
    if (idx < 0)
        return false;
    _notifications[idx] = { ..._notifications[idx], archived: true, archivedAt: new Date().toISOString() };
    await _persist();
    return true;
}
/**
 * Hard-delete permanente (sem archive). Use com cuidado.
 * @param {string} notificationId
 * @returns {Promise<boolean>}
 */
export async function deleteNotification(notificationId: any) {
    await _ensureLoaded();
    const idx = _notifications.findIndex((n: any) => n.id === notificationId);
    if (idx < 0)
        return false;
    _notifications.splice(idx, 1);
    await _persist();
    return true;
}
// ──────────────────────────────────────────────────────────────────────
// User preferences stubs (IDB-based)
// ──────────────────────────────────────────────────────────────────────
/**
 * Armazena preferências de notificação de um usuário.
 * @param {string} userId
 * @param {any} prefs
 * @returns {Promise<Object>}
 */
export async function setPreferences(userId: any, prefs: any) {
    if (!userId || typeof userId !== 'string')
        throw new Error('setPreferences: userId required');
    const stored = (await idbGet(IDB_PREFS_KEY)) || {};
    stored[userId] = { ...(stored[userId] || {}), ...prefs };
    await idbSet(IDB_PREFS_KEY, stored);
    return stored[userId];
}
/**
 * Retorna preferências de notificação de um usuário.
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function getPreferences(userId: any) {
    if (!userId || typeof userId !== 'string')
        return {};
    try {
        const stored = await idbGet(IDB_PREFS_KEY);
        return stored?.[userId] || {};
    }
    catch {
        return {};
    }
}
// ──────────────────────────────────────────────────────────────────────
// Project mute stubs (IDB-based)
// ──────────────────────────────────────────────────────────────────────
/**
 * Mute notificações de um projeto para um usuário.
 * @param {string} userId
 * @param {string} projectId
 * @returns {Promise<boolean>}
 */
export async function muteProject(userId: any, projectId: any) {
    if (!userId || typeof userId !== 'string')
        throw new Error('muteProject: userId required');
    if (!projectId || typeof projectId !== 'string')
        throw new Error('muteProject: projectId required');
    const stored = (await idbGet(IDB_MUTES_KEY)) || {};
    if (!stored[userId])
        stored[userId] = [];
    if (!stored[userId].includes(projectId))
        stored[userId].push(projectId);
    await idbSet(IDB_MUTES_KEY, stored);
    return true;
}
/**
 * Verifica se um projeto está muted para um usuário.
 * @param {string} userId
 * @param {string} projectId
 * @returns {Promise<boolean>}
 */
export async function isProjectMuted(userId: any, projectId: any) {
    if (!userId || !projectId)
        return false;
    try {
        const stored = await idbGet(IDB_MUTES_KEY);
        return stored?.[userId]?.includes(projectId) || false;
    }
    catch {
        return false;
    }
}
/**
 * Resolve canais de entrega para uma notif (baseado em tier).
 * Puro - não entrega, só retorna config.
 * @param {any} notification
 * @returns {Array<string>} ex: ['in_app', 'email']
 */
export function resolveChannelsFor(notification: any) {
    if (!notification || typeof notification !== 'object')
        return [];
    const tier = notification.tier || getTierForType(notification.type);
    const cfg = getTierConfig(tier);
    return Array.from(cfg.channels || []);
}
// ──────────────────────────────────────────────────────────────────────
// Supabase sync (offline-first: IDB cache + server sync)
// ──────────────────────────────────────────────────────────────────────
/**
 * Mapeia linha do Supabase para shape local (manager.js).
 * @param {any} row - resposta PostgREST
 * @returns {any}
 */
function _remoteToLocal(row: any) {
    if (!row || typeof row !== 'object')
        return null;
    const meta = row.metadata || {};
    return {
        id: row.id,
        userId: row.user_id,
        type: row.type,
        tier: row.priority || 'P2',
        targetId: meta.targetId || null,
        actorId: meta.actorId || null,
        actorIds: Array.isArray(meta.actorIds) ? meta.actorIds : meta.actorId ? [meta.actorId] : [],
        payload: {
            title: row.title,
            body: row.body,
            url: row.action_url,
            actionText: row.action_text,
            imageUrl: row.image_url,
            ...meta,
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        read: !!row.read_at,
        readAt: row.read_at || null,
        archived: !!row.archived_at,
        archivedAt: row.archived_at || null,
        count: row.batch_count || 1,
        batchKey: row.batch_key || null,
        status: row.status,
        channelsDelivered: row.channels_delivered || [],
    };
}
/**
 * Mapeia notificação local para shape do Supabase.
 * @param {any} notif - shape local
 * @returns {any}
 */
function _localToRemote(notif: any) {
    if (!notif || typeof notif !== 'object')
        return null;
    const payload = notif.payload || {};
    return {
        user_id: notif.userId,
        type: notif.type,
        priority: notif.tier || notif.priority || 'P2',
        title: payload.title || notif.title || 'Notification',
        body: payload.body || notif.body || null,
        action_url: payload.url || notif.action_url || null,
        action_text: payload.actionText || notif.action_text || null,
        image_url: payload.imageUrl || notif.image_url || null,
        metadata: {
            targetId: notif.targetId,
            actorId: notif.actorId,
            actorIds: notif.actorIds,
            ...(notif.payload || {}),
        },
        batch_key: notif.batchKey || null,
        batch_count: notif.count || 1,
    };
}
/**
 * Fetches user's notifications from Supabase and merges with local IDB cache.
 * Offline-first: local mutations mais recentes (updatedAt) prevalecem.
 *
 * @param {any} supabaseClient - cliente Supabase autenticado
 * @returns {Promise<{ merged: number, added: number }>}
 */
export async function syncWithSupabase(supabaseClient: any) {
    if (!supabaseClient)
        throw new Error('syncWithSupabase: supabaseClient required');
    await _ensureLoaded();
    const { data: { user }, } = await supabaseClient.auth.getUser();
    if (!user) {
        log.warn('syncWithSupabase: no authenticated user');
        return { merged: 0, added: 0 };
    }
    // OPT-1: explicit columns matching _remoteToLocal() consumer
    const { data: rows, error } = await supabaseClient
        .from('notifications')
        .select('id, user_id, type, priority, title, body, action_url, action_text, image_url, metadata, batch_key, batch_count, status, channels_delivered, read_at, archived_at, created_at, updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500);
    if (error) {
        log.error('syncWithSupabase: fetch failed', error.message);
        throw new Error(`syncWithSupabase: ${error.message}`);
    }
    let mergedCount = 0;
    let addedCount = 0;
    const remoteIds = new Set();
    for (const row of rows || []) {
        const mapped = _remoteToLocal(row);
        if (!mapped)
            continue;
        remoteIds.add(mapped.id);
        const localIdx = _notifications.findIndex((n: any) => n.id === mapped.id);
        if (localIdx >= 0) {
            const local = _notifications[localIdx];
            const localTime = new Date(local.updatedAt || local.createdAt).getTime();
            const remoteTime = new Date(mapped.updatedAt || mapped.createdAt).getTime();
            if (remoteTime > localTime) {
                _notifications[localIdx] = mapped;
                mergedCount++;
            }
        }
        else {
            _notifications.push(mapped);
            addedCount++;
        }
    }
    // Remover locais que foram arquivadas/deletadas no servidor?
    // Por segurança, mantemos; reconcile explícito pode ser adicionado depois.
    if (mergedCount > 0 || addedCount > 0)
        await _persist();
    log.debug('syncWithSupabase', { merged: mergedCount, added: addedCount });
    return { merged: mergedCount, added: addedCount };
}
/**
 * Push de notificação local para o Supabase via RPC create_notification().
 * Usa batching server-side (5 min window).
 *
 * @param {any} supabaseClient - cliente Supabase autenticado
 * @param {any} notification - shape local
 * @returns {Promise<{ id: string, status: string, merged: boolean }>}
 */
export async function pushToSupabase(supabaseClient: any, notification: any) {
    if (!supabaseClient)
        throw new Error('pushToSupabase: supabaseClient required');
    if (!notification || typeof notification !== 'object') {
        throw new Error('pushToSupabase: notification required');
    }
    const remote = _localToRemote(notification);
    if (!remote)
        throw new Error('pushToSupabase: invalid notification shape');
    const { data, error } = await supabaseClient.rpc('create_notification', {
        p_user_id: remote.user_id,
        p_type: remote.type,
        p_priority: remote.priority,
        p_title: remote.title,
        p_body: remote.body,
        p_metadata: remote.metadata,
        p_batch_key: remote.batch_key,
    });
    if (error) {
        log.error('pushToSupabase: RPC failed', error.message);
        throw new Error(`pushToSupabase: ${error.message}`);
    }
    const result = data || {};
    const id = result.id || '';
    const merged = !!result.merged;
    // Se foi merged no servidor, atualiza local com o ID retornado
    if (merged && id) {
        const idx = _notifications.findIndex((n: any) => n.id === notification.id);
        if (idx >= 0) {
            _notifications[idx] = { ..._notifications[idx], id, updatedAt: new Date().toISOString() };
            await _persist();
        }
    }
    return { id, status: 'pending', merged };
}
/**
 * Subscreve a mudanças Realtime na tabela notifications para o usuário.
 *
 * @param {any} supabaseClient - cliente Supabase autenticado
 * @param {string} userId - UUID do usuário
 * @param {Function} callback - realtime event callback
 * @returns {any} - channel do Supabase (chamar .unsubscribe() para parar)
 */
export function subscribeToRealtime(supabaseClient: any, userId: any, callback: any) {
    if (!supabaseClient?.channel) {
        log.warn('subscribeToRealtime: supabaseClient.channel unavailable');
        return null;
    }
    if (!userId || typeof callback !== 'function') {
        log.warn('subscribeToRealtime: userId e callback são obrigatórios');
        return null;
    }
    const channel = supabaseClient
        .channel('notifications-realtime')
        .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
    }, (payload: any) => {
        const mapped = payload.new ? _remoteToLocal(payload.new) : null;
        callback({
            type: payload.eventType,
            notification: mapped,
            old: payload.old || null,
        });
    })
        .subscribe((status: any) => {
        log.debug('subscribeToRealtime status', status);
    });
    return channel;
}
// ──────────────────────────────────────────────────────────────────────
// Test helper (não expor em prod)
// ──────────────────────────────────────────────────────────────────────
export async function _resetForTesting(clearIdb: any = false) {
    _notifications = [];
    _loaded = !clearIdb;
    if (clearIdb) {
        try {
            await idbSet(IDB_KEY, []);
        }
        catch (e: any) {
            console.debug('[notifications] clearIdb:', (e as any)?.message || e);
        }
    }
}
