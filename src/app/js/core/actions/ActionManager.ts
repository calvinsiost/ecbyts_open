// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ACTION MANAGER — generic async dispatch engine

   Registro e despacho assincrono de actions com fronteira try/catch
   e hooks de ciclo de vida (before / after / onError). Pure logic —
   sem DOM, sem THREE. Cada manager carrega seu proprio estado.
   ================================================================ */

import { createActionContext } from './ActionContext.js';

/**
 * Create an isolated ActionManager instance.
 *
 * @returns {{
 *   registerAction: (id: string, fn: Function, meta?: object) => void,
 *   dispatch: (id: string, ctx?: object) => Promise<object>,
 *   on: (phase: 'before'|'after'|'onError', cb: Function) => () => void,
 *   listActions: () => Array<{ id: string, meta: object }>
 * }}
 */
export function createActionManager() {
    /** @type {Map<string, { fn: Function, meta: object }>} */
    const actions = new Map();
    const hooks: Record<'before' | 'after' | 'onError', Function[]> = { before: [], after: [], onError: [] };

    /**
     * Register an action handler.
     * @param {string} id @param {Function} fn @param {object} [meta]
     */
    function registerAction(id: any, fn: any, meta = {}) {
        if (typeof id !== 'string' || id.length === 0) {
            throw new TypeError('registerAction: id must be a non-empty string');
        }
        if (typeof fn !== 'function') {
            throw new TypeError('registerAction: fn must be a function');
        }
        actions.set(id, { fn, meta: meta || {} });
    }

    /**
     * Subscribe a lifecycle hook. Returns an unsubscribe function.
     * @param {'before'|'after'|'onError'} phase @param {Function} cb
     * @returns {() => void}
     */
    function on(phase: 'before' | 'after' | 'onError', cb: any) {
        if (!hooks[phase]) {
            throw new TypeError(`on: unknown phase "${phase}"`);
        }
        if (typeof cb !== 'function') {
            throw new TypeError('on: cb must be a function');
        }
        hooks[phase].push(cb);
        return () => {
            const i = hooks[phase].indexOf(cb);
            if (i >= 0) hooks[phase].splice(i, 1);
        };
    }

    /**
     * Run all subscribers of a phase in registration order (sequential).
     * @param {'before'|'after'|'onError'} phase @param {object} ctx
     */
    async function runHooks(phase: 'before' | 'after' | 'onError', ctx: any) {
        for (const cb of hooks[phase]) {
            await cb(ctx);
        }
    }

    /**
     * Dispatch an action by id. Async, with a try/catch boundary.
     * Resolves to the final context (never rejects).
     * @param {string} id @param {object} [ctx]
     * @returns {Promise<object>}
     */
    async function dispatch(id: any, ctx: any) {
        const entry = actions.get(id);
        if (!entry) {
            const errCtx = createActionContext({ actionId: id }).withError(
                new Error(`dispatch: unknown action "${id}"`),
            );
            await runHooks('onError', errCtx);
            return errCtx;
        }
        const baseCtx =
            ctx && typeof ctx.actionId === 'string'
                ? ctx
                : createActionContext({ actionId: id, payload: ctx && ctx.payload });
        try {
            await runHooks('before', baseCtx);
            const result = await entry.fn(baseCtx);
            const doneCtx = baseCtx.withResult(result);
            await runHooks('after', doneCtx);
            return doneCtx;
        } catch (err) {
            const errCtx = baseCtx.withError(err);
            await runHooks('onError', errCtx);
            return errCtx;
        }
    }

    /**
     * List registered actions with metadata.
     * @returns {Array<{ id: string, meta: object }>}
     */
    function listActions() {
        return Array.from(actions.entries()).map(([id, e]) => ({ id, meta: e.meta }));
    }

    return { registerAction, dispatch, on, listActions };
}

// ----------------------------------------------------------------
// LIBRARY EXTENSIBILITY — CONSIST-OBS-001 S4 (modelo B1: declarativo)
// ----------------------------------------------------------------

/**
 * Aliases de action registrados por libraries. Modelo B1 (declarativo >
 * executável): uma action de library NÃO traz código — é um ALIAS declarativo
 * para uma action BUILT-IN whitelisted (targetAction) com params fixos,
 * mesmo princípio do dispatch cc-call (zero code-exec).
 * Map<key, alias> com key namespaced `lib:<libraryId>:<actionId>`.
 */
const _libraryActionAliases = new Map<string, any>();

/**
 * Register a library action alias (data-only, B1).
 * Registra um alias declarativo de action vindo de manifesto de library.
 *
 * @param {{ id: string, label: string, targetAction: string, params?: object }} alias
 * @param {string} alias
 * @returns {string|null} chave registrada ou null se inválido
 */
export function registerAction(alias: any, libraryId: any) {
    if (!alias || typeof alias.id !== 'string' || !alias.id.trim()) return null;
    if (typeof alias.label !== 'string' || !alias.label.trim()) return null;
    // targetAction DEVE ser nome de action built-in (resolvida pelo executor
    // contra o ACTION_REGISTRY na hora do dispatch — nunca código da library).
    if (typeof alias.targetAction !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(alias.targetAction)) return null;
    if (alias.params !== undefined && (typeof alias.params !== 'object' || Array.isArray(alias.params))) return null;
    const key = `lib:${String(libraryId)}:${alias.id.trim()}`;
    _libraryActionAliases.set(key, Object.freeze({
        id: alias.id.trim(),
        label: alias.label.trim(),
        targetAction: alias.targetAction,
        params: Object.freeze({ ...(alias.params || {}) }),
        libraryId: String(libraryId),
    }));
    return key;
}

/** Remove um alias registrado por library. */
export function unregisterAction(key: any) {
    return _libraryActionAliases.delete(String(key));
}

/** Resolve um alias por chave (consumido pelo executor do bot IA). */
export function resolveLibraryAction(key: any) {
    return _libraryActionAliases.get(String(key)) || null;
}

/** Lista aliases ativos (para descoberta no catálogo de actions do bot). */
export function listLibraryActions() {
    return [..._libraryActionAliases.values()];
}
