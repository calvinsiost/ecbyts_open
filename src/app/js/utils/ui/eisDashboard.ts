// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// DEEP-LINK-TOOLS-001 Sprint 2 — thin wrapper para deepLinkRegistry.
//
// Registry referencia `../ui/eisDashboard.js` + `openEisDashboard`.
// Real opener é window.handleOpenEisDashboard (registrado em
// utils/handlers/index.ts:1348). Este wrapper expõe a função no path
// esperado pelo dispatcher (lazy import).
//
// Pure-logic: zero DOM próprio, apenas delega ao handler global registrado.
// Sprint 3 (Calvin 2026-06-03): sincroniza URL em tempo real ao abrir.

import { syncDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';

interface WindowWithHandlers {
    handleOpenEisDashboard?: () => void;
}

/**
 * Abre o EIS Dashboard. Chamado pelo deepLinkDispatcher quando rota
 * `?tools=eis` é resolvida.
 *
 * @param payload? - payload opcional do deep-link (ignorado neste tier;
 *                  reserva-se para wire futuro de scenario/sqi seeding)
 */
export function openEisDashboard(payload?: unknown): void {
    const w = window as unknown as WindowWithHandlers;
    if (typeof w.handleOpenEisDashboard === 'function') {
        w.handleOpenEisDashboard();
        // Sincroniza URL em tempo real (Calvin 2026-06-03 — address bar = estado)
        syncDeepLinkUrl('eis', payload);
    }
}
