// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Master registration helper V2 — extends V1 with EIS + Privacy handlers.
// Hand-authored R1-safe. V1 (registerAllOtimizacaoHandlers.js) é
// codemod-governed e não acomoda EIS/Privacy sem revert. V2 wraps V1
// + chama os 2 handler groups adicionais.
//
// Spec NOT:
// - NÃO duplicar logic (delega V1 + 2 handlers extras)
// - NÃO emoji em strings

import {
    registerAllOtimizacaoHandlers as registerV1,
    listExpectedHandlers as listV1Handlers,
} from './registerAllOtimizacaoHandlers.js';
import { registerEisCompletenessHandlers } from './eisCompletenessHandlers.js';
import { registerPrivacyContextGuardHandlers } from './privacyContextGuardHandlers.js';

/**
 * Master register V2 — V1 + EIS + Privacy.
 * @returns {{registered:string[], errors:string[]}}
 */
export function registerAllOtimizacaoHandlersV2() {
    const v1Result = registerV1();
    const registered = [...v1Result.registered];
    const errors = [...v1Result.errors];
    const attempt = (name: any, fn: any) => {
        try {
            fn();
            registered.push(name);
        } catch (e: any) {
            console.debug(`[registerAllOtimizacaoHandlersV2:${name}]`, e?.message || e);
            errors.push(name);
        }
    };
    attempt('eisCompletenessHandlers', registerEisCompletenessHandlers);
    attempt('privacyContextGuardHandlers', registerPrivacyContextGuardHandlers);
    return { registered, errors };
}

/**
 * Returns full list of handlers V2 (V1 + 3 extras).
 * @returns {string[]}
 */
export function listAllExpectedHandlersV2() {
    return [
        ...listV1Handlers(),
        // EIS Completeness (2)
        'handleOpenCompletenessPanel',
        'handleOpenCompletenessApplicability',
        // Privacy Context Guard (1)
        'handleOpenPrivacyContextGuard',
    ];
}

/**
 * Verify V2 — checa que todos os V1+V2 handlers estão registrados.
 * @returns {{ok:boolean, missing:string[], registered:string[]}}
 */
export function verifyHandlersRegisteredV2() {
    if (typeof window === 'undefined') {
        return { ok: false, missing: listAllExpectedHandlersV2(), registered: [] };
    }
    const w = (window) as any;
    const expected = listAllExpectedHandlersV2();
    const registered = expected.filter((name: any) => typeof w[name] === 'function');
    const missing = expected.filter((name: any) => typeof w[name] !== 'function');
    return { ok: missing.length === 0, missing, registered };
}
