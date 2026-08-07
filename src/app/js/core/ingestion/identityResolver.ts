// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.1.5

/**
 * identityResolver.js - Resolucao unificada de identidade de elementos.
 *
 * Diferentes caminhos de import usam campos diferentes para identidade:
 * - ECO1 import: element.id
 * - Wizard: sys_loc_code || name
 * - Document ingestion: canonical well ID
 *
 * Este modulo unifica a resolucao para evitar duplicatas silenciosas
 * durante merge incremental (BS2).
 *
 * @module core/ingestion/identityResolver
 */

import { canonicalizeWellId } from './documents/wellIdCanon.js';

interface ResolveResult {
    match: Record<string, any> | null;
    method: string;
}

/**
 * Encontra elemento existente que corresponde ao elemento importado.
 * Checagem em ordem de prioridade:
 *   1. ID exato
 *   2. Canonical well ID match (PM 01 = PM-01)
 *   3. sys_loc_code match
 *   4. Nome exato
 *
 * @param {Record<string, any>} newElement - elemento do modelo importado
 * @param {Array<Record<string, any>>} any> - elementos no workspace atual
 * @returns {{ match: Record<string, any>|null, method: string }} - match e metodo usado
 */
export function resolveElementIdentity(newElement: Record<string, any>, existingElements: Array<Record<string, any>>): ResolveResult {
    if (!newElement || !existingElements?.length) {
        return { match: null, method: 'none' };
    }

    // 1. ID exato
    if (newElement.id) {
        const byId = existingElements.find((e) => e.id === newElement.id);
        if (byId) return { match: byId, method: 'id' };
    }

    // 2. Canonical well ID
    const newCanon = canonicalizeWellId(newElement.name);
    if (newCanon) {
        for (const e of existingElements) {
            const existCanon = canonicalizeWellId(e.name);
            if (existCanon === newCanon) return { match: e, method: 'canonical' };
        }
    }

    // 3. sys_loc_code
    const newSysLoc = newElement.data?.sys_loc_code;
    if (newSysLoc) {
        const bySysLoc = existingElements.find((e) => e.data?.sys_loc_code === newSysLoc);
        if (bySysLoc) return { match: bySysLoc, method: 'sys_loc_code' };
    }

    // 4. Nome exato
    if (newElement.name) {
        const byName = existingElements.find((e) => e.name === newElement.name);
        if (byName) return { match: byName, method: 'name' };
    }

    return { match: null, method: 'none' };
}
