// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

// utils/handlers/trlMrvHandlers.ts
// Wire-up dos painéis TRL/maturidade (#6) e MRV (#7) da família
// ECBYTS-ENERGY-SCENARIOS-001 na UI (mesmo padrão do ghgInventoryHandler:
// handler fino que só chama a API exportada do painel, com dynamic import).
//
// window.handleOpenTrlMaturityPanel() — timeline TRL atual→alvo por rota.
// window.handleOpenMrvPanel()        — cadeia MRV sobre os cenários GHG.

import { CONFIG } from '../../config.js';
import { showToast } from '../ui/toast.js';

type FeatureFlags = { TRL_MATURITY?: boolean; MRV_VIEW?: boolean };

function _flags(): FeatureFlags {
    return ((CONFIG as unknown as { FEATURES?: FeatureFlags }).FEATURES ?? {}) as FeatureFlags;
}

/** Abre o painel de Maturidade Tecnológica (TRL) por cenário/rota. */
export async function handleOpenTrlMaturityPanel(): Promise<void> {
    if (_flags().TRL_MATURITY !== true) {
        showToast('Maturidade TRL está desativada (feature flag TRL_MATURITY).', 'info', 5000);
        return;
    }
    try {
        const mod = await import('../ui/trlMaturityPanel.js');
        mod.openTrlMaturityPanel();
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[trlMaturity:open]', msg);
        showToast('Falha ao abrir painel TRL: ' + msg, 'error', 6000);
    }
}

/** Abre a view MRV (Monitoramento-Reporte-Verificação) sobre os cenários GHG. */
export async function handleOpenMrvPanel(): Promise<void> {
    if (_flags().MRV_VIEW !== true) {
        showToast('View MRV está desativada (feature flag MRV_VIEW).', 'info', 5000);
        return;
    }
    try {
        const mod = await import('../ui/mrvPanel.js');
        mod.openMrvPanel();
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[mrv:open]', msg);
        showToast('Falha ao abrir view MRV: ' + msg, 'error', 6000);
    }
}

export const trlMrvHandlers = { handleOpenTrlMaturityPanel, handleOpenMrvPanel };
