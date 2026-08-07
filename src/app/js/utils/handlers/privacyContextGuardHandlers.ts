// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Privacy Context Guard handlers (caller integration) for
// SPEC_ECBY_PRIVACY_CONTEXT_GUARD. Hand-authored R1-safe.
//
// Spec NOT:
// - NÃO reimplementar guard logic (delega contextGuardViewModel)
// - NÃO ler localStorage (caller persiste mode)
// - NÃO emoji em strings

import { openPrivacyContextGuardPanel } from '../ui/privacyContextGuardPanel.js';
import {
    getContextGuardAudit,
    getContextGuardMode,
    setContextGuardEnabled,
} from '../../core/llm/contextGuardRuntime.js';

/**
 * Abre painel Privacy Context Guard.
 * Registrável como window.handleOpenPrivacyContextGuard.
 * @param {{mode?:string, flagBlocked?:boolean, redactions?:Array, onToggleConfirmed?:Function, onClose?:Function}} input
 * @returns {{close:Function}|null}
 */
export function handleOpenPrivacyContextGuard(input: any) {
    try {
        return openPrivacyContextGuardPanel({
            mode: input?.mode || getContextGuardMode(),
            flagBlocked: !!input?.flagBlocked,
            redactions: input?.redactions || getContextGuardAudit(),
            onToggleConfirmed: (mode: string) => {
                setContextGuardEnabled(mode !== 'open');
                input?.onToggleConfirmed?.(mode);
            },
            confirmDisable: input?.confirmDisable,
            onClose: input?.onClose,
        });
    } catch (e: any) {
        console.debug('[privacyContextGuardHandlers:open]', e?.message || e);
        return null;
    }
}

/**
 * Registration helper — caller chama uma vez em main.js boot.
 */
export function registerPrivacyContextGuardHandlers() {
    if (typeof window === 'undefined') return;
    const w = (window) as any;
    if (w.__ecbtPrivacyContextGuardHandlersRegistered) return;
    w.handleOpenPrivacyContextGuard = handleOpenPrivacyContextGuard;
    w.__ecbtPrivacyContextGuardHandlersRegistered = true;
}
