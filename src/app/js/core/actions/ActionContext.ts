// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   ACTION CONTEXT — immutable dispatch envelope

   Cria um contexto congelado (frozen) que viaja por todo o ciclo
   de vida de uma action: hooks before/after/onError e o handler.
   Pure logic — sem DOM, sem THREE, sem rede.
   ================================================================ */
/**
 * Create a frozen action context.
 *
 * @param {{ actionId: string, payload?: any, user?: any }} input
 * @returns {Readonly<{ actionId: string, payload: any, user: any,
 *   result: any, error: any, withResult: (r:any)=>any, withError: (e:any)=>any }>}
 */
export function createActionContext({
    actionId,
    payload = null,
    user = null
}: any = {}) {
    if (typeof actionId !== 'string' || actionId.length === 0) {
        throw new TypeError('createActionContext: actionId must be a non-empty string');
    }
    return buildContext({ actionId, payload, user, result: null, error: null });
}
/**
 * Internal builder — produces a frozen context with derivation helpers.
 *
 * @param {{ actionId: string, payload: any, user: any, result: any, error: any }} state
 * @returns {Readonly<object>}
 */
function buildContext(state: any) {
    const ctx = {
        actionId: state.actionId,
        payload: state.payload,
        user: state.user,
        result: state.result,
        error: state.error,
        /** @param {any} result @returns {Readonly<object>} */
        withResult(result: any) {
            return buildContext({ ...state, result, error: null });
        },
        /** @param {any} error @returns {Readonly<object>} */
        withError(error: any) {
            return buildContext({ ...state, error });
        },
    };
    return Object.freeze(ctx);
}
//# sourceMappingURL=ActionContext.js.map
