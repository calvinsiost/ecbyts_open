// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FILTER RADAR CONFIG — grupos canônicos de parâmetros ambientais
   FEAT-FILTER-RADAR-001 §Q2 + Q7 (7 grupos, limite 8 eixos)

   Taxonomia EPA/ISO 17025 adaptada para laudos CETESB/IBAMA BR.

   Cada grupo tem:
   - parameters: lista de IDs canônicos da taxonomia (match por inclusão)
   - color: paleta CSS tokens (--ecbt-chart-*)
   - order: posição default no eixo do radar
   - labelKey: i18n

   Grupos custom (user-created) coexistem com canônicos via merge
   em `buildGroupIndex()` de elementGroupIndex.js.
   ================================================================ */

export interface RadarGroup {
    readonly id: string;
    readonly labelKey: string;
    readonly color: string;
    readonly order: number;
    readonly parameters: ReadonlyArray<string>;
}

/**
 * Grupos canônicos pré-carregados. 7 grupos ≤ limite 8 eixos do radar (§Q7).
 * Ordem segue frequência em laudos ambientais brasileiros.
 */
export const CANONICAL_RADAR_GROUPS = Object.freeze({
    voc: Object.freeze({
        id: 'voc',
        labelKey: 'filter.group.voc',
        color: '#4A90D9',
        order: 1,
        parameters: Object.freeze([
            'benzene',
            'toluene',
            'xylenes',
            'ethylbenzene',
            'mtbe',
            'trichloroethylene',
            'tetrachloroethylene',
            'vinyl_chloride',
        ]),
    }),
    svoc: Object.freeze({
        id: 'svoc',
        labelKey: 'filter.group.svoc',
        color: '#7B68EE',
        order: 2,
        parameters: Object.freeze([
            'naphthalene',
            'pyrene',
            'benzo_a_pyrene',
            'phenanthrene',
            'chrysene',
            'pah_total',
            'pcb_total',
            'dioxins',
        ]),
    }),
    metals: Object.freeze({
        id: 'metals',
        labelKey: 'filter.group.metals',
        color: '#E67E22',
        order: 3,
        parameters: Object.freeze([
            'lead',
            'mercury',
            'cadmium',
            'chromium',
            'arsenic',
            'nickel',
            'copper',
            'zinc',
            'lead_210',
        ]),
    }),
    physicochem: Object.freeze({
        id: 'physicochem',
        labelKey: 'filter.group.physicochem',
        color: '#27AE60',
        order: 4,
        parameters: Object.freeze([
            'pH',
            'conductivity',
            'turbidity',
            'tss',
            'cod',
            'bod',
            'do',
            'temperature',
            'redox',
            'water_level',
        ]),
    }),
    tph: Object.freeze({
        id: 'tph',
        labelKey: 'filter.group.tph',
        color: '#C0392B',
        order: 5,
        parameters: Object.freeze(['tph', 'btex', 'voc']),
    }),
    pesticides: Object.freeze({
        id: 'pesticides',
        labelKey: 'filter.group.pesticides',
        color: '#F39C12',
        order: 6,
        parameters: Object.freeze([
            'atrazine',
            'glyphosate',
            'ddt',
            'endosulfan',
            'chlorpyrifos',
            'pfos',
            'pfoa',
            'pfas_total',
        ]),
    }),
    nutrients: Object.freeze({
        id: 'nutrients',
        labelKey: 'filter.group.nutrients',
        color: '#16A085',
        order: 7,
        parameters: Object.freeze(['nitrate', 'nitrite', 'ammonia', 'phosphate', 'total_nitrogen', 'total_phosphorus']),
    }),
} as const);

export type CanonicalRadarGroupKey = keyof typeof CANONICAL_RADAR_GROUPS;

/**
 * Retorna lista de grupos canônicos ordenada por `order`.
 */
export function getCanonicalGroupsOrdered(): RadarGroup[] {
    return Object.values(CANONICAL_RADAR_GROUPS)
        .slice()
        .sort((a, b) => a.order - b.order) as RadarGroup[];
}

/**
 * Encontra o grupo canônico que contém um parâmetro específico.
 * Retorna o primeiro match (parâmetros podem pertencer a múltiplos grupos,
 * ex: 'voc' aparece em tph e voc - priorizar por ordem).
 */
export function findGroupForParameter(parameterId: string): RadarGroup | null {
    if (!parameterId || typeof parameterId !== 'string') return null;
    for (const group of getCanonicalGroupsOrdered()) {
        if (group.parameters.includes(parameterId)) return group;
    }
    return null;
}

/**
 * Valida se um grupo custom tem shape correto para merge com canônicos.
 */
export function isValidCustomGroup(group: unknown): group is RadarGroup {
    if (!group || typeof group !== 'object') return false;
    const g = group as Record<string, unknown>;
    return !!(
        typeof g.id === 'string' &&
        g.id.length > 0 &&
        typeof g.labelKey === 'string' &&
        Array.isArray(g.parameters) &&
        g.parameters.length > 0
    );
}

export const MAX_RADAR_AXES = 8;

/**
 * Merge grupos canônicos + custom. Custom precedem canônicos em caso de ID collision.
 * Resultado é limitado a MAX_RADAR_AXES (8).
 */
export function mergeGroups(customGroups: ReadonlyArray<unknown> = []): RadarGroup[] {
    const customs = Array.isArray(customGroups) ? customGroups.filter(isValidCustomGroup) : [];
    const customIds = new Set(customs.map((g) => g.id));
    const canonicals = getCanonicalGroupsOrdered().filter((g) => !customIds.has(g.id));
    const merged = [...customs, ...canonicals];
    return merged.slice(0, MAX_RADAR_AXES);
}