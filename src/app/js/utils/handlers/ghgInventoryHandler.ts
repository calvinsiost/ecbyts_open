// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/ghgInventoryHandler.js
// Wire-up of SPEC_GHG_PROTOCOL_INVENTARIO_RESUMO into UI.
//
// Por que este arquivo existe?
// O painel utils/ui/ghgInventoryPanel.js + core/reports/ghgInventory.js já
// existem (TS-migrados, feature-flagged) mas estavam SEM gatilho de UI nem
// handler window.*. Este handler hand-authored apenas CHAMA a API exportada
// existente — não duplica lógica nem edita arquivos TS-gerados.
//
// window.handleOpenGhgInventory() — abre o modal de Inventário GHG Protocol.
// A checagem da feature flag CONFIG.FEATURES.GHG_INVENTORY_REPORT é feita
// internamente por openGhgInventoryPanel(); aqui só damos feedback ao usuário.

import { CONFIG } from '../../config.js';
import { showToast } from '../ui/toast.js';

/**
 * Abre o painel de Inventário GHG Protocol (8 tabelas oficiais).
 * Respeita a feature flag; se desativada, avisa o usuário em vez de falhar
 * silenciosamente.
 * @returns {Promise<void>}
 */
export async function handleOpenGhgInventory() {
    if (CONFIG?.FEATURES?.GHG_INVENTORY_REPORT !== true) {
        showToast('Inventário GHG Protocol está desativado (feature flag GHG_INVENTORY_REPORT).', 'info', 5000);
        return;
    }
    try {
        const mod = await import('../ui/ghgInventoryPanel.js');
        await mod.openGhgInventoryPanel();
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[ghgInventory:open]', msg);
        showToast('Falha ao abrir Inventário GHG Protocol: ' + msg, 'error', 6000);
    }
}

export const ghgInventoryHandlers = { handleOpenGhgInventory };
