// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// DEEP-LINK-TOOLS-001 Sprint 2 — thin wrapper para deepLinkRegistry.
//
// Registry referencia `../ui/costCenter.js` + `openCostCenter`.
// Decisão semântica (claude - ui 2026-06-03): toolId `cost-center` no
// deep-link MAPEIA para Cost Analysis Panel (`window.handleOpenCostAnalysis`),
// não para o sub-componente "cost center" do Governance Panel.
//
// Racional:
//   1. Cost Analysis é o painel user-facing principal (HUD inferior, geoHud);
//   2. Cost Center é configuração interna (CRUD de orçamentos em
//      Governance Panel) — não é discovery natural para sharing cross-user;
//   3. Quem clica num link `?tools=cost-center` espera ver análise de
//      custo do modelo compartilhado, não wizard de cost center config.
//
// Pure-logic: zero DOM próprio, delega ao handler global registrado.
// Sprint 3 (Calvin 2026-06-03): sincroniza URL em tempo real ao abrir.

import { syncDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';

interface WindowWithHandlers {
    handleOpenCostAnalysis?: () => void;
}

/**
 * Abre o Cost Analysis Panel. Chamado pelo deepLinkDispatcher quando
 * rota `?tools=cost-center` é resolvida.
 *
 * @param payload? - payload opcional do deep-link (ignorado neste tier;
 *                  reserva-se para wire futuro de cost-center filter)
 */
export function openCostCenter(payload?: unknown): void {
    const w = window as unknown as WindowWithHandlers;
    if (typeof w.handleOpenCostAnalysis === 'function') {
        w.handleOpenCostAnalysis();
        syncDeepLinkUrl('cost-center', payload);
    }
}
