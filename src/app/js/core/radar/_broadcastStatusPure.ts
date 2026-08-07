// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   BROADCAST STATUS — resolução pura do estado AO VIVO/RECONECTANDO/
   DESLIGADO de um broadcast a partir do heartbeat.

   Extraído inline de utils/ui/radarModal.ts (_getStatus) para ser
   importável em Node cheap tests sem DOM/Supabase. A regra de negócio
   (janela de heartbeat → estado) é pura; o radarModal resolve apenas o
   rótulo i18n a partir de labelKey via t().

   Regras (preservadas byte-a-byte do original):
   - entry ausente            → off
   - is_persistent OU age<90s → live   (90000 ms)
   - age<120s                 → stale  (120000 ms)
   - senão                    → off
   ================================================================ */

export type BroadcastStatusCode = 'live' | 'stale' | 'off';

/** Janela (ms) abaixo da qual um heartbeat conta como AO VIVO. */
export const BROADCAST_LIVE_WINDOW_MS = 90000;
/** Janela (ms) abaixo da qual um heartbeat conta como RECONECTANDO. */
export const BROADCAST_STALE_WINDOW_MS = 120000;

export interface BroadcastStatusVM {
    /** Código canônico do estado. */
    readonly status: BroadcastStatusCode;
    /** Classe CSS sufixo (radar-status-<cls>) — igual ao status. */
    readonly cls: BroadcastStatusCode;
    /** Chave i18n do rótulo (radarLive / radarStale / radarOff). */
    readonly labelKey: string;
}

interface BroadcastHeartbeatLike {
    is_persistent?: boolean;
    last_heartbeat?: string | number | Date;
}

const _LABEL_KEY: Readonly<Record<BroadcastStatusCode, string>> = Object.freeze({
    live: 'radarLive',
    stale: 'radarStale',
    off: 'radarOff',
});

/**
 * Resolve o estado de um broadcast a partir do heartbeat.
 *
 * @param entry   linha de radar (is_persistent + last_heartbeat) ou nullish
 * @param nowMs   instante de referência em ms (default Date.now()) — injetável
 *                para tornar o teste determinístico
 */
export function resolveBroadcastStatus(
    entry: BroadcastHeartbeatLike | null | undefined,
    nowMs: number = Date.now(),
): BroadcastStatusVM {
    if (!entry) return _vm('off');
    const hb = new Date(entry.last_heartbeat as any).getTime();
    const age = nowMs - hb;
    if (entry.is_persistent || age < BROADCAST_LIVE_WINDOW_MS) return _vm('live');
    if (age < BROADCAST_STALE_WINDOW_MS) return _vm('stale');
    return _vm('off');
}

function _vm(status: BroadcastStatusCode): BroadcastStatusVM {
    return Object.freeze({ status, cls: status, labelKey: _LABEL_KEY[status] });
}
