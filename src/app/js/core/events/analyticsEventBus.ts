// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Lazy bridge for analytics event emission.
 *
 * Evita que modulos de core importem `core/analytics/eventBus.js`
 * estaticamente apenas para emitir telemetria/eventos opcionais.
 */

export const ANALYTICS_EVENTS = Object.freeze({
    AGENT_QUERY: 'llm:agent:query',
    AGENT_THINKING: 'llm:agent:thinking',
    EIS_SNAPSHOT_TRIGGER: 'purpose:eis:snapshot',
    ISSUE_CREATED: 'issue:created',
    ISSUE_DELETED: 'issue:deleted',
    ISSUE_UPDATED: 'issue:updated',
    PIPELINE_COMPLETED: 'pipeline:completed',
    PIPELINE_FAILED: 'pipeline:failed',
    PIPELINE_NODE_COMPLETED: 'pipeline:node:completed',
    PIPELINE_NODE_STARTED: 'pipeline:node:started',
    PIPELINE_STARTED: 'pipeline:started',
});

let eventBusModulePromise: Promise<any> | null = null;
let emitQueue = Promise.resolve();

function loadEventBus() {
    eventBusModulePromise ??= import('../analytics/eventBus.js' as string);
    return eventBusModulePromise;
}

export function emitAnalyticsEvent(event: string, payload: unknown) {
    emitQueue = emitQueue
        .then(async () => {
            const { eventBus } = await loadEventBus();
            eventBus.emit(event, payload);
        })
        .catch((error: any) => {
            console.debug('[analyticsEventBus] emit skipped:', error?.message || error);
    });
    return emitQueue;
}

export async function onAnalyticsEvent(
    event: string,
    handler: (payload: unknown) => void,
    options: Record<string, unknown> = {},
) {
    const { eventBus } = await loadEventBus();
    return eventBus.on(event, handler, options);
}
