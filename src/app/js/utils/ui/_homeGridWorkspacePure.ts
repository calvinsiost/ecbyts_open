// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_HOME_REDESIGN_3COL_V3 P1-8 — Tier A drenagem per MONOLITH_IMPACT_ANALYSIS_2026_05_27.
// Pure-logic extraction from utils/ui/homeGrid.js workspace/navigator subdomain
// (Tier A monolito #2: 4258L, 174KB, fanin=4, impacto+perf=1820 score).
//
// Hand-authored R1-safe.
//
// Spec NOT:
// - NÃO ler DOM (caller faz `document.getElementById(...)`)
// - NÃO ler CONFIG.PARAMETERS (caller resolve parameter label via callback)
// - NÃO ler module state (_treeFilter / _activeModelLabel — caller passa por param)
// - NÃO emoji
//
// Extracted helpers:
//   - formatWorkspaceDate          (date-like → pt-BR locale short string)
//   - toNavigatorIdSegment         (slugify with safe fallback)
//   - getElementObservations       (data.observations | observations | [])
//   - formatNavigatorResultLabel   (observation + i → human label)
//   - filterNavigatorNodes         (tree-filter preservando ancestrais)

export interface NavigatorNode {
    id: string;
    parentId?: string | null;
    label?: string;
    searchText?: string;
}

export interface ObservationLike {
    date?: string | number | Date;
    timestamp?: string | number | Date;
    created_at?: string | number | Date;
    createdAt?: string | number | Date;
    value?: unknown;
    qualifier?: string;
    unitId?: string;
    unit?: string;
    unit_id?: string;
}

export interface ElementLike {
    observations?: ReadonlyArray<ObservationLike>;
    data?: { observations?: ReadonlyArray<ObservationLike> };
}

/**
 * Format a date-like value to pt-BR locale short datetime.
 * Falsy / invalid → 'Sem data'. Defensive against TypeError on hostile inputs.
 */
export function formatWorkspaceDate(dateLike: unknown, fallback: string = 'Sem data'): string {
    if (dateLike == null || dateLike === '') return fallback;
    try {
        const parsed = new Date(dateLike as string | number | Date);
        if (Number.isNaN(parsed.getTime())) return fallback;
        return parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) {
        console.debug('[homeGridWorkspacePure:formatDate]', (e as Error)?.message || e);
        return fallback;
    }
}

/**
 * Slugify a value for use as a navigator id segment.
 * - lowercase + alphanumerics, _, - only; collapsed -
 * - leading/trailing - stripped
 * - falsy → 'unknown'
 */
export function toNavigatorIdSegment(value: unknown): string {
    const normalized = String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || 'unknown';
}

/**
 * Resolve observations from an element-like object.
 * Prefers `element.data.observations` (canonical), falls back to legacy `element.observations`.
 */
export function getElementObservations(element: ElementLike | null | undefined): ObservationLike[] {
    if (!element || typeof element !== 'object') return [];
    if (Array.isArray(element.data?.observations)) return [...element.data!.observations!];
    if (Array.isArray(element.observations)) return [...element.observations];
    return [];
}

/**
 * Format an observation as a result label for the navigator.
 *   "<formattedDate> - <value><unit>"  OR  "<formattedDate> - <qualifier>"  OR  "Resultado <i+1>"
 *
 * `formatDate` is injected so the caller may use the locale-aware variant
 * (formatWorkspaceDate) or a test stub. If omitted, the timestamp is rendered raw.
 */
export function formatNavigatorResultLabel(
    observation: ObservationLike | null | undefined,
    index: number,
    formatDate?: (d: unknown) => string,
): string {
    const parts: string[] = [];
    if (!observation || typeof observation !== 'object') {
        return `Resultado ${(Number.isFinite(index) ? Math.floor(index) : 0) + 1}`;
    }
    const timestamp =
        observation.date ?? observation.timestamp ?? observation.created_at ?? observation.createdAt ?? null;
    if (timestamp != null) {
        parts.push(typeof formatDate === 'function' ? formatDate(timestamp) : String(timestamp));
    }
    if (observation.value != null && observation.value !== '') {
        const unit = observation.unitId || observation.unit || observation.unit_id || '';
        parts.push(`${observation.value}${unit ? ` ${unit}` : ''}`);
    } else if (observation.qualifier) {
        parts.push(String(observation.qualifier));
    }
    const safeIndex = Number.isFinite(index) ? Math.floor(index) : 0;
    return parts.join(' - ') || `Resultado ${safeIndex + 1}`;
}

/**
 * Filter navigator tree nodes by a lowercase search term, preserving ancestor chain.
 *   - Matches against `${node.label} ${node.searchText || ''}`.toLowerCase()
 *   - Empty/falsy filter returns nodes unchanged (passthrough copy)
 *   - Ancestor preservation: when a leaf matches, all parents up to root are included
 */
export function filterNavigatorNodes(
    nodes: ReadonlyArray<NavigatorNode> | null | undefined,
    filterLower: string | null | undefined,
): NavigatorNode[] {
    if (!Array.isArray(nodes)) return [];
    if (!filterLower || typeof filterLower !== 'string') return [...nodes];
    const needle = filterLower.toLowerCase();
    if (!needle) return [...nodes];
    const byId = new Map<string, NavigatorNode>(nodes.map((n) => [n.id, n]));
    const include = new Set<string>();
    for (const node of nodes) {
        const haystack = `${node.label ?? ''} ${node.searchText ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) continue;
        let cursor: NavigatorNode | null = node;
        const guard = new Set<string>();
        while (cursor && !guard.has(cursor.id)) {
            include.add(cursor.id);
            guard.add(cursor.id);
            cursor = cursor.parentId ? byId.get(cursor.parentId) ?? null : null;
        }
    }
    return nodes.filter((n) => include.has(n.id));
}
