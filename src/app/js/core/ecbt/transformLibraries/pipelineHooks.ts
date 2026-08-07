// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Hooks - Phase 35 (P1-5)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md S35
 *
 * Phase 35 (2026-05-02) - pure-logic lifecycle hooks para pipelines.
 * Permite registrar callbacks em 6 eventos canônicos do ciclo de vida
 * de uma execução: beforeStart, afterStart, beforeStep, afterStep,
 * beforeFinish, afterFinish.
 *
 * Estratégia:
 *   - registerHook / unregisterHook: gerência de identidade
 *   - triggerHook: invoca callbacks ordenados por priority
 *   - filterHooksByEvent / filterHooksByPriority
 *   - summarizeHooks: contagem por evento
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Eventos canônicos do ciclo de vida. */
export const HOOK_EVENTS = Object.freeze([
    'beforeStart',
    'afterStart',
    'beforeStep',
    'afterStep',
    'beforeFinish',
    'afterFinish',
]);

/** Identidade do módulo. */
export const PIPELINE_HOOKS_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 35,
    deliveredAt: '2026-05-02',
    events: HOOK_EVENTS,
});

let _hookCounter = 0;

/**
 * Reseta contador interno (testing only).
 */
export function _resetHookCounter() {
    _hookCounter = 0;
}

/**
 * Verifica se evento é canônico.
 */
export function isValidHookEvent( event: any) {
    return typeof event === 'string' && HOOK_EVENTS.includes(event);
}

/**
 * Registra um hook.
 *
 * @param {string} eventName
 * @param {Function} callback
 * @param {Record<string, any>} [options] {priority, label}
 * @returns {Object|null} hook record, ou null se inválido
 */
export function registerHook(eventName: string, callback: Function, options: Record<string, any> = {}): object|null {
    if (!isValidHookEvent(eventName)) return null;
    if (typeof callback !== 'function') return null;
    const priority = Number.isFinite(options.priority) ? options.priority : 0;
    const label = typeof options.label === 'string' ? options.label : '';
    const id = `hook_${++_hookCounter}`;
    return Object.freeze({
        id,
        event: eventName,
        callback,
        priority,
        label,
        registeredAt: new Date().toISOString(),
    });
}

/**
 * Remove hook por id de uma lista.
 *
 * @param {string} hookId
 * @param {Array<any>} hooks
 * @returns {any} nova lista sem o hook
 */
export function unregisterHook(hookId: string, hooks: Array<any>): any {
    if (typeof hookId !== 'string' || !Array.isArray(hooks)) {
        return Array.isArray(hooks) ? Object.freeze([...hooks]) : Object.freeze([]);
    }
    return Object.freeze(hooks.filter(( h: any) => h && h.id !== hookId));
}

/**
 * Filtra hooks por evento.
 */
export function filterHooksByEvent( hooks: any,  eventName: any) {
    if (!Array.isArray(hooks)) return Object.freeze([]);
    if (!isValidHookEvent(eventName)) return Object.freeze([]);
    return Object.freeze(hooks.filter((h) => h && h.event === eventName));
}

/**
 * Filtra hooks por priority threshold (>=).
 */
export function filterHooksByPriority( hooks: any,  minPriority: any) {
    if (!Array.isArray(hooks)) return Object.freeze([]);
    if (!Number.isFinite(minPriority)) return Object.freeze([...hooks]);
    return Object.freeze(hooks.filter((h) => h && Number.isFinite(h.priority) && h.priority >= minPriority));
}

/**
 * Ordena hooks por priority desc (maior prioridade primeiro).
 */
export function sortHooksByPriority( hooks: any) {
    if (!Array.isArray(hooks)) return Object.freeze([]);
    const arr = [...hooks].filter(Boolean);
    arr.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return Object.freeze(arr);
}

/**
 * Dispara hooks de um evento. Invoca todos os callbacks com context.
 * Erros em callbacks sao capturados e retornados como rejected results,
 * sem interromper os demais.
 *
 * @param {string} eventName
 * @param {Record<string, any>} context
 * @param {Array<any>} any>
 * @returns {Promise<any>}
 */
export async function triggerHook(eventName: string, context: Record<string, any>, hooks: Array<any>): Promise<any> {
    if (!isValidHookEvent(eventName)) return Object.freeze([]);
    const matched = (sortHooksByPriority(filterHooksByEvent(hooks, eventName)) as any[]);
    if (matched.length === 0) return Object.freeze([]);
    const promises = matched.map(async ( h: any) => {
        try {
            const value = await h.callback(context);
            return Object.freeze({ id: h.id, status: 'fulfilled', value });
        } catch ( error: any) {
            return Object.freeze({
                id: h.id,
                status: 'rejected',
                error: error && error.message ? error.message : String(error),
            });
        }
    });
    const results = await Promise.all(promises);
    return Object.freeze(results);
}

/**
 * Sumariza hooks por evento.
 *
 * @param {Array<any>} hooks
 * @returns {any} { total, byEvent: {beforeStart: n, ...} }
 */
export function summarizeHooks(hooks: Array<any>): any {
    const empty = {
        total: 0,
        byEvent: Object.freeze(
            HOOK_EVENTS.reduce(( acc: Record<string, any>,  ev: any) => {
                acc[ev] = 0;
                return acc;
            }, ({} as Record<string, any>)),
        ),
    };
    if (!Array.isArray(hooks) || hooks.length === 0) return Object.freeze(empty);
    const byEvent = (
        HOOK_EVENTS.reduce(( acc: Record<string, any>,  ev: any) => {
            acc[ev] = 0;
            return acc;
        }, ({} as Record<string, any>))
    ) as Record<string, any>;
    let total = 0;
    for (const rawH of hooks) {
        const h = (rawH as any);
        if (!h || !isValidHookEvent(h.event)) continue;
        byEvent[h.event] += 1;
        total += 1;
    }
    return Object.freeze({ total, byEvent: Object.freeze(byEvent) });
}

/**
 * Module identity export.
 */
export const pipelineHooksMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 35,
    deliveredAt: '2026-05-02',
    events: HOOK_EVENTS,
    exports: [
        'HOOK_EVENTS',
        'PIPELINE_HOOKS_META',
        'isValidHookEvent',
        'registerHook',
        'unregisterHook',
        'filterHooksByEvent',
        'filterHooksByPriority',
        'sortHooksByPriority',
        'triggerHook',
        'summarizeHooks',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
