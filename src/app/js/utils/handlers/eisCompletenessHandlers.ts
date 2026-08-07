// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// EIS Completeness handlers (caller integration) for SPEC_EIS_COMPLETENESS_BASELINE.
// Hand-authored R1-safe — registra window.* handlers que conectam os 2
// UI surface modules (Panel + ApplicabilityToggle) ao caller.
//
// Spec NOT:
// - NÃO reimplementar baseline logic (delega completenessBaseline F1)
// - NÃO duplicar panels (delega aos modules)
// - NÃO emoji em strings

import { openCompletenessPanel } from '../ui/completenessPanel.js';
import { openCompletenessApplicabilityToggle } from '../ui/completenessApplicabilityToggle.js';

/**
 * Abre painel principal Completeness Baseline.
 * Registrável como window.handleOpenCompletenessPanel.
 * @param {{baseline:*}} input
 * @returns {{close:Function}|null}
 */
export function handleOpenCompletenessPanel(input: any) {
    if (!input?.baseline) {
        console.debug('[eisCompletenessHandlers:openPanel] missing baseline');
        return null;
    }
    try {
        return openCompletenessPanel({ baseline: input.baseline });
    } catch (e: any) {
        console.debug('[eisCompletenessHandlers:openPanel]', e?.message || e);
        return null;
    }
}

/**
 * Abre painel ApplicabilityToggle.
 * Registrável como window.handleOpenCompletenessApplicability.
 * @param {{requirements:Array<*>, applicabilityConfig?:object, onChange?:Function}} input
 * @returns {{close:Function}|null}
 */
export function handleOpenCompletenessApplicability(input: any) {
    if (!input?.requirements?.length) {
        console.debug('[eisCompletenessHandlers:openApplicability] no requirements');
        return null;
    }
    try {
        return openCompletenessApplicabilityToggle({
            requirements: input.requirements,
            applicabilityConfig: input.applicabilityConfig || {},
            onChange: input.onChange,
        });
    } catch (e: any) {
        console.debug('[eisCompletenessHandlers:openApplicability]', e?.message || e);
        return null;
    }
}

/**
 * Registration helper — caller chama uma vez em main.js boot.
 */
export function registerEisCompletenessHandlers() {
    if (typeof window === 'undefined') return;
    const w = (window) as any;
    if (w.__ecbtEisCompletenessHandlersRegistered) return;
    w.handleOpenCompletenessPanel = handleOpenCompletenessPanel;
    w.handleOpenCompletenessApplicability = handleOpenCompletenessApplicability;
    w.__ecbtEisCompletenessHandlersRegistered = true;
}
