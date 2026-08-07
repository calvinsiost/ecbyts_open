// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Bot Manager - Centralized automation bot registration and event dispatch.
 *
 * Bots react to events (file_uploaded, photo_added, data_imported) with
 * configurable confidence thresholds and opt-in activation. Cascade depth
 * protection prevents event loops between bots.
 *
 * @module core/automation/botManager
 */

import { safeSetItem } from '../../utils/storage/storageMonitor.js';
import { createLogger } from '../../utils/helpers/logger.js';

const log = createLogger('botManager');

/**
 * Safe localStorage getter (no throw on SSR/Node)
 * @param {string} key
 * @returns {string|null}
 */
function _safeGet(key: any) {
    try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
        return null;
    }
}

/** @type {Map<string, any>} */
const _bots = new Map();

/** Max cascade depth to prevent bot A -> bot B -> bot A loops */
const MAX_CASCADE_DEPTH = 3;

/** Current cascade depth during dispatch */
let _cascadeDepth = 0;

/** @type {any[]} Activity log (last 200 entries) */
let _activityLog: any = [];

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Register a bot with the manager.
 * @param {string} botId - Unique identifier (e.g. 'edd_reader')
 * @param {object} config - Bot definition
 * @param {string} config.name - Display name
 * @param {string} config.description - Short description
 * @param {object} [config.defaultConfig] - Default configuration
 * @param {object} config.handler - Handler with onEvent(type, payload, config)
 */
export function registerBot(botId: any, config: any) {
    const saved = _loadBotConfig(botId);
    _bots.set(botId, {
        id: botId,
        name: config.name,
        description: config.description,
        isActive: saved?.isActive ?? false,
        config: { ...(config.defaultConfig || {}), ...(saved?.config || {}) },
        handler: config.handler,
    });
    log.info(`Bot registered: ${botId}`);
}

/**
 * Enable or disable a bot.
 * @param {string} botId
 * @param {boolean} active
 */
export function setBotActive(botId: any, active: any) {
    const bot = _bots.get(botId);
    if (!bot) {
        log.warn(`Bot not found: ${botId}`);
        return;
    }
    bot.isActive = active;
    _saveBotConfig(botId);
    if (active) {
        bot.handler.onActivate?.();
    } else {
        bot.handler.onDeactivate?.();
    }
    _logActivity(botId, active ? 'activated' : 'deactivated');
}

/**
 * Update bot configuration.
 * @param {string} botId
 * @param {object} configPatch - Partial config to merge
 */
export function setBotConfig(botId: any, configPatch: any) {
    const bot = _bots.get(botId);
    if (!bot) return;
    bot.config = { ...bot.config, ...configPatch };
    _saveBotConfig(botId);
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Get bot status.
 * @param {string} botId
 * @returns {object|null}
 */
export function getBotStatus(botId: any) {
    const bot = _bots.get(botId);
    if (!bot) return null;
    return {
        id: bot.id,
        name: bot.name,
        description: bot.description,
        isActive: bot.isActive,
        config: { ...bot.config },
    };
}

/**
 * List all registered bots.
 * @returns {Array<{id: string, name: string, description: string, isActive: boolean}>}
 */
export function listBots() {
    return Array.from(_bots.values()).map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        isActive: b.isActive,
    }));
}

/**
 * Get activity log (most recent first).
 * @param {number} [limit=50]
 * @returns {Array<{botId: string, action: string, detail: any, timestamp: string}>}
 */
export function getActivityLog(limit = 50) {
    return _activityLog.slice(-limit).reverse();
}

// ── Event Dispatch ────────────────────────────────────────────────────────────

/**
 * Dispatch an event to all active bots. Cascade-protected.
 * @param {string} eventType - e.g. 'file_uploaded', 'photo_added', 'data_imported'
 * @param {object} payload - Event data
 * @param {object} [options]
 * @param {boolean} [options._botTriggered=false] - Set by bots to mark cascaded events
 */
export function dispatchBotEvent(eventType: any, payload: any, options: any = {}) {
    if (options._botTriggered) {
        _cascadeDepth++;
        if (_cascadeDepth > MAX_CASCADE_DEPTH) {
            log.warn(`Cascade depth exceeded (${_cascadeDepth}/${MAX_CASCADE_DEPTH}). Event "${eventType}" dropped.`);
            _logActivity('system', 'cascade_blocked', { eventType, depth: _cascadeDepth });
            _cascadeDepth--;
            return;
        }
    } else {
        _cascadeDepth = 0;
    }

    for (const [botId, bot] of _bots) {
        if (!bot.isActive || !bot.handler.onEvent) continue;
        try {
            const result = bot.handler.onEvent(eventType, payload, bot.config);
            // Handle async handlers
            if (result && typeof result.catch === 'function') {
                result.catch((/** @type {any} */ err: any) => {
                    log.error(`[${botId}] async error:`, err);
                    _logActivity(botId, 'error', { event: eventType, error: err?.message });
                });
            }
        } catch (err) {
            log.error(`[${botId}] sync error:`, err);
            _logActivity(botId, 'error', { event: eventType, error: (err as any)?.message });
        }
    }

    if (options._botTriggered) {
        _cascadeDepth--;
    }
}

// ── Persistence ───────────────────────────────────────────────────────────────

/** @param {string} botId */
function _saveBotConfig(botId: any) {
    const bot = _bots.get(botId);
    if (!bot) return;
    const data = { isActive: bot.isActive, config: bot.config };
    safeSetItem(`ecbyts-bot-${botId}`, JSON.stringify(data));
}

/** @param {string} botId */
function _loadBotConfig(botId: any) {
    try {
        const raw = _safeGet(`ecbyts-bot-${botId}`);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * @param {string} botId
 * @param {string} action
 * @param {any} [detail]
 */
function _logActivity(botId: any, action: any, detail: any = null) {
    const entry = {
        botId,
        action,
        detail,
        timestamp: new Date().toISOString(),
    };
    _activityLog.push(entry);
    if (_activityLog.length > 200) {
        _activityLog = _activityLog.slice(-200);
    }
}

/**
 * Initialize - load saved activity log.
 */
export function initBotManager() {
    try {
        const raw = _safeGet('ecbyts-bot-activity');
        if (raw) _activityLog = JSON.parse(raw);
    } catch (e) {
        console.debug('[botManager] initLoad:', (e as any)?.message || e);
        /* ignore */
    }
    log.info('Bot manager initialized');
}

/**
 * Persist activity log (call on beforeunload or periodically).
 */
export function flushActivityLog() {
    safeSetItem('ecbyts-bot-activity', JSON.stringify(_activityLog.slice(-200)));
}
