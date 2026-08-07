// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   DISCOVERY TIME-AGO — formatação pura "tempo desde" de um broadcast
   descoberto, a partir de um timestamp.

   Extraído inline de utils/ui/radarModal.ts (_formatTimeAgo) para ser
   importável em Node cheap tests sem DOM. A regra (idade em ms →
   rótulo curto pt-BR) é pura; o radarModal apenas injeta o valor no
   HTML do card de discovery.

   Regras (preservadas byte-a-byte do original):
   - dateStr ausente/falsy → ''
   - mins < 1   → 'agora'
   - mins < 60  → '<mins>min'
   - hours < 24 → '<hours>h'
   - senão      → '<dias>d'
   onde mins = floor((now - ts) / 60000), hours = floor(mins / 60),
   dias = floor(hours / 24).
   ================================================================ */

/**
 * Formata a idade de um timestamp como rótulo curto ("agora", "5min",
 * "3h", "2d").
 *
 * @param dateStr  timestamp parseável por `new Date(...)` ou nullish
 * @param nowMs    instante de referência em ms (default Date.now()) —
 *                 injetável para tornar o teste determinístico
 */
export function formatDiscoveryTimeAgo(
    dateStr: unknown,
    nowMs: number = Date.now(),
): string {
    if (!dateStr) return '';
    const diff = nowMs - new Date(dateStr as any).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}
