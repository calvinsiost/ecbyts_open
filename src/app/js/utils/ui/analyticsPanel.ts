// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// DEEP-LINK-TOOLS-001 Sprint 2 — thin wrapper para deepLinkRegistry.
//
// Registry referencia `../ui/analyticsPanel.js` + `openAnalyticsPanel`.
// Real opener primário é window.handleOpenAnalytics; fallback é
// window.activateTab('analytics') (utils/handlers/index.ts:1293).
//
// Pure-logic: zero DOM próprio, apenas delega ao handler global registrado.
// Sprint 3 (Calvin 2026-06-03): sincroniza URL em tempo real ao abrir.

import { syncDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';

interface WindowWithHandlers {
    handleOpenAnalytics?: () => void;
    activateTab?: (tab: string) => void;
}

/**
 * Abre o Analytics Panel. Chamado pelo deepLinkDispatcher quando rota
 * `?tools=analytics` é resolvida.
 *
 * @param payload? - payload opcional do deep-link (ignorado neste tier;
 *                  reserva-se para wire futuro de filtro/dataset seeding)
 */
export function openAnalyticsPanel(payload?: unknown): void {
    const w = window as unknown as WindowWithHandlers;
    let opened = false;
    if (typeof w.handleOpenAnalytics === 'function') {
        w.handleOpenAnalytics();
        opened = true;
    } else if (typeof w.activateTab === 'function') {
        w.activateTab('analytics');
        opened = true;
    }
    if (opened) syncDeepLinkUrl('analytics', payload);
}
