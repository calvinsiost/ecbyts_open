// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   BASE HANDLER — thin adapter over ActionManager

   Expoe um ponto de entrada uniforme `invoke(id, payload)` que
   envolve `ActionManager.dispatch` e padroniza o retorno em
   { ok, result?, error? } para consumo pela camada de UI/handlers.
   ================================================================ */

import { createActionContext } from '../../core/actions/ActionContext.js';

/**
 * Create a base handler bound to an ActionManager instance.
 *
 * @param {{ manager: { dispatch: (id: string, ctx?: object) => Promise<object> } }} deps
 * @returns {{ invoke: (id: string, payload?: any, user?: any) =>
 *   Promise<{ ok: boolean, result?: any, error?: string }> }}
 */
export function createBaseHandler({
    manager
}: any = {}) {
    if (!manager || typeof manager.dispatch !== 'function') {
        throw new TypeError('createBaseHandler: manager.dispatch is required');
    }

    /**
     * Invoke an action and normalize the result envelope.
     * @param {string} id @param {any} [payload] @param {any} [user]
     * @returns {Promise<{ ok: boolean, result?: any, error?: string }>}
     */
    async function invoke(id: any, payload = null, user = null) {
        const ctx = createActionContext({ actionId: id, payload, user });
        const out = await manager.dispatch(id, ctx);
        if (out && out.error) {
            const message = out.error instanceof Error ? out.error.message : String(out.error);
            return { ok: false, error: message };
        }
        return { ok: true, result: out ? out.result : null };
    }

    return { invoke };
}
