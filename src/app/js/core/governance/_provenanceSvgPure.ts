// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   PROVENANCE SVG PURE (Module C extraction — refactor-opportunities pick)
   ================================================================

   Sub-helpers de renderGraphSvg em core/governance/provenanceGraph.ts.
   Determinísticos, sem state. Habilitam teste isolado da matemática de
   layout + segurança de escape XSS.

   Pattern Module C campaign (commits 22287c10..5eab20f3).
   ================================================================ */

/** Cor por tipo de nó da provenance graph; fallback cinza neutro. */
export const PROVENANCE_NODE_COLORS: Readonly<Record<string, string>> = Object.freeze({
    element: '#4caf50',
    observation: '#2196f3',
    campaign: '#9c27b0',
    decision: '#ff9800',
    export: '#f44336',
    audit: '#607d8b',
});

const DEFAULT_NODE_COLOR = '#666';

/** Lookup de cor de nó por type. Default: cinza neutro #666 se type não conhecido. */
export function getNodeColorByType(type: any): string {
    if (typeof type !== 'string') return DEFAULT_NODE_COLOR;
    return PROVENANCE_NODE_COLORS[type] || DEFAULT_NODE_COLOR;
}

/**
 * Escape XSS-safe de texto para SVG/HTML. Cobre &/</> (não inclui aspas pois
 * só usado dentro de elementos <text>/<title>, não em atributos).
 */
export function escapeSvgText(s: unknown): string {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Layout circular: distribui n pontos uniformemente em círculo centrado em
 * (cx,cy) com raio dado. Começa em 12h (−π/2) e gira sentido horário.
 *
 * Retorna array de {x, y} com length === n. Para n=0 retorna []. Determinístico.
 *
 * @param n - número de pontos
 * @param cx - centro X
 * @param cy - centro Y
 * @param radius - raio do círculo
 */
export function computeCircularLayout(
    n: number,
    cx: number,
    cy: number,
    radius: number,
): Array<{ x: number; y: number }> {
    if (!Number.isFinite(n) || n <= 0) return [];
    const out: Array<{ x: number; y: number }> = [];
    const denom = Math.max(1, n);
    for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i) / denom - Math.PI / 2;
        out.push({
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
        });
    }
    return out;
}

/**
 * Trunca string para no máximo `maxChars` caracteres, adicionando '…' se
 * houve corte. Strings curtas passam intactas. null/undefined → ''.
 */
export function truncateLabel(label: any, maxChars: number = 12): string {
    if (label == null) return '';
    const s = String(label);
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars) + '…';
}
