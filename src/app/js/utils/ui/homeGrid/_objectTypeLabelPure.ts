// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — rótulo PURO do tipo de objeto da home (navigator /
 * inspector / tree / context). claude (refactor) 2026-06-20.
 *
 * EN: Pure label resolver for a home object "type" (launchpad / organization /
 *     site / campaign / point / parameter / result). No DOM, no globals, no
 *     module state, no i18n — it's a fixed lookup table. Mirrors the legacy
 *     inline `_getObjectTypeLabel(objectType)` in homeGrid.ts EXACTLY:
 *       - a known key returns its Portuguese label;
 *       - an unknown but truthy value returns the value itself (passthrough);
 *       - a falsy value (null / undefined / '') returns the fallback 'Objeto'.
 *     The same map was duplicated as an injected dep across homeContextRender,
 *     homeInspector and homeTreeRender — this is now the single source of truth
 *     the barrel passes down, so behaviour is byte-identical everywhere.
 *
 * PT (leigo): traduz o "tipo" técnico de um objeto da tela inicial (ponto,
 *     campanha, parâmetro, etc.) para um rótulo legível em português. Se o tipo
 *     não está na tabela, devolve o próprio texto; se vier vazio, devolve
 *     "Objeto". É exatamente a mesma decisão que estava embutida no homeGrid —
 *     agora isolada, tipada e testável num lugar só.
 *
 * Pure: entrada → saída determinística, sem efeitos colaterais. Cheap tests:
 * tests/ui/homeGrid/object-type-label.test.mjs.
 */

/** Canonical home object types with a known human label. */
export type KnownObjectType =
    | 'launchpad'
    | 'organization'
    | 'site'
    | 'campaign'
    | 'point'
    | 'parameter'
    | 'result';

/**
 * Fixed type → label table. Frozen so callers can't mutate the shared map.
 * Order/keys mirror the legacy inline object literal in homeGrid.ts.
 */
export const OBJECT_TYPE_LABELS: Readonly<Record<KnownObjectType, string>> = Object.freeze({
    launchpad: 'Launchpad',
    organization: 'Organizacao',
    site: 'Site',
    campaign: 'Campanha',
    point: 'Ponto',
    parameter: 'Parametro',
    result: 'Resultado',
});

/**
 * Resolve a human-readable label for a home object type.
 *
 * Behaviour is byte-identical to the legacy inline `_getObjectTypeLabel`:
 * known key → mapped label; unknown truthy value → the value itself; falsy → 'Objeto'.
 *
 * @param objectType the object type key (or any value, defensively)
 * @returns the resolved label string
 */
export function getObjectTypeLabel(objectType: unknown): string {
    const map = OBJECT_TYPE_LABELS as Record<string, string>;
    return map[objectType as string] || (objectType as string) || 'Objeto';
}
