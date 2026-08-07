// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FAMILY GROUPS — Agrupamento canônico de famílias por categoria
   ================================================================
   Solicitado por Calvin 2026-04-20: melhorar agrupamento de famílias
   e grupos de famílias.

   Por que separar em arquivo novo (e não adicionar `group` em
   `families.js`)?
   - Consumers existentes de DEFAULT_FAMILIES (1048+ window.handle*)
     não mudam shape — additive zero-risk.
   - Agrupamento é metadata UI/menu, não pertence ao schema PDPL-U
     canônico.
   - Múltiplos agrupamentos possíveis no futuro (ex: por matriz
     ambiental, por compliance regulation) sem poluir families.js.

   Convenções:
   - Cada family pertence a EXATAMENTE 1 grupo (não overlapping).
   - Ordem dos grupos define ordem de exibição em menus/toolbox.
   - i18nKey usa namespace `familyGroup.*` para tradução.

   Spec: ad-hoc (Calvin task 2026-04-20)
   ================================================================ */

export interface FamilyGroup {
    /** Identificador snake_case */
    id: string;
    /** Chave i18n (familyGroup.<id>) */
    labelKey: string;
    /** Ícone Lucide para menus */
    icon: string;
    /** Ordem de exibição (menor = primeiro) */
    order: number;
    /** IDs de famílias deste grupo */
    familyIds: string[];
}

export interface GroupMenuFamily {
    id: string;
    name?: string | null;
    nameKey?: string | null;
    code?: string | null;
    icon?: string | null;
    enabled?: boolean;
    isContainer?: boolean;
    variants: Array<Record<string, unknown>>;
}

export interface GroupMenuNode {
    /** groupId */
    id: string;
    /** i18n key */
    labelKey: string;
    icon: string;
    order: number;
    families: GroupMenuFamily[];
}

/**
 * Registry canônico de grupos. Frozen para evitar mutação acidental.
 * @type {Readonly<Record<string, FamilyGroup>>}
 */
export const FAMILY_GROUPS: Readonly<Record<string, FamilyGroup>> = Object.freeze({
    container: {
        id: 'container',
        labelKey: 'familyGroup.container',
        icon: 'folder',
        order: 1,
        familyIds: ['site_project', 'site_area', 'site_zone'],
    },
    hydrology: {
        id: 'hydrology',
        labelKey: 'familyGroup.hydrology',
        icon: 'droplet',
        order: 2,
        familyIds: ['plume', 'well', 'lake', 'river', 'spring', 'watershed'],
    },
    infrastructure: {
        id: 'infrastructure',
        labelKey: 'familyGroup.infrastructure',
        icon: 'building',
        order: 3,
        familyIds: ['building', 'tank', 'blueprint', 'boundary', 'infra_linear', 'route_flow'],
    },
    mining: {
        id: 'mining',
        labelKey: 'familyGroup.mining',
        icon: 'mountain',
        order: 4,
        familyIds: ['dam', 'pit'],
    },
    // PRODUCTION-AREA-001 — grupo novo "Produção" entre mining (4) e fleet (5.5).
    production: {
        id: 'production',
        labelKey: 'familyGroup.production',
        icon: 'package',
        order: 4.5,
        familyIds: ['production_area'],
    },
    fleet: {
        id: 'fleet',
        labelKey: 'familyGroup.fleet',
        icon: 'truck',
        order: 5.5,
        familyIds: ['vehicle', 'equipment', 'drone'],
    },
    environmental: {
        id: 'environmental',
        labelKey: 'familyGroup.environmental',
        icon: 'wind',
        order: 5,
        familyIds: ['waste_stream', 'emission_source', 'effluent_point', 'area', 'treatment_system', 'atmosphere'],
    },
    biotic: {
        id: 'biotic',
        labelKey: 'familyGroup.biotic',
        icon: 'tree',
        order: 6,
        familyIds: ['habitat', 'individual'],
    },
    monitoring: {
        id: 'monitoring',
        labelKey: 'familyGroup.monitoring',
        icon: 'radio',
        order: 7,
        familyIds: ['sensor', 'marker', 'sample'],
    },
    geological: {
        id: 'geological',
        labelKey: 'familyGroup.geological',
        icon: 'layers',
        order: 8,
        familyIds: ['stratum', 'fault'],
    },
    events: {
        id: 'events',
        labelKey: 'familyGroup.events',
        icon: 'alert-triangle',
        order: 9,
        familyIds: ['incident'],
    },
    intangible: {
        id: 'intangible',
        labelKey: 'familyGroup.intangible',
        icon: 'sparkles',
        order: 10,
        familyIds: ['intangible'],
    },
    annotation: {
        id: 'annotation',
        labelKey: 'familyGroup.annotation',
        icon: 'sticky-note',
        order: 10.5,
        familyIds: ['post'],
    },
    misc: {
        id: 'misc',
        labelKey: 'familyGroup.misc',
        icon: 'more-horizontal',
        order: 99,
        familyIds: ['generic'],
    },
});

/**
 * Retorna lista de grupos ordenados por `order`.
 * @returns {FamilyGroup[]}
 */
export function getOrderedGroups(): FamilyGroup[] {
    return Object.values(FAMILY_GROUPS)
        .slice()
        .sort((a, b) => a.order - b.order);
}

/**
 * Retorna grupo que contém um family ID, ou null se não encontrado.
 * @param {string} familyId
 * @returns {FamilyGroup|null}
 */
export function getGroupForFamily(familyId: string): FamilyGroup | null {
    if (!familyId || typeof familyId !== 'string') return null;
    for (const group of Object.values(FAMILY_GROUPS)) {
        if (group.familyIds.includes(familyId)) return group;
    }
    return null;
}

/**
 * Retorna lista de family IDs de um grupo, ou [] se grupo não existir.
 * @param {string} groupId
 * @returns {string[]}
 */
export function getFamiliesByGroup(groupId: string): string[] {
    const group = FAMILY_GROUPS[groupId];
    return group ? [...group.familyIds] : [];
}

/**
 * Verifica se uma family pertence a algum grupo.
 * @param {string} familyId
 * @returns {boolean}
 */
export function isFamilyGrouped(familyId: string): boolean {
    return getGroupForFamily(familyId) !== null;
}

/**
 * Retorna lista de family IDs que NÃO estão em nenhum grupo.
 * Útil para detectar famílias novas sem agrupamento ou validar coverage.
 *
 * @param {string[]} allFamilyIds - Lista completa (geralmente Object.keys(DEFAULT_FAMILIES))
 * @returns {string[]}
 */
export function getUngroupedFamilies(allFamilyIds: string[]): string[] {
    if (!Array.isArray(allFamilyIds)) return [];
    return allFamilyIds.filter((id) => !isFamilyGrouped(id));
}

/**
 * Cria mapa reverso family → group para lookups O(1).
 * Cacheado em module scope.
 * @returns {Map<string, FamilyGroup>}
 */
let _familyToGroupCache: Map<string, FamilyGroup> | null = null;
export function buildFamilyToGroupMap(): Map<string, FamilyGroup> {
    if (_familyToGroupCache) return _familyToGroupCache;
    const map = new Map<string, FamilyGroup>();
    for (const group of Object.values(FAMILY_GROUPS)) {
        for (const familyId of group.familyIds) {
            map.set(familyId, group);
        }
    }
    _familyToGroupCache = map;
    return map;
}

/**
 * Detecta family IDs duplicados entre grupos (deve ser sempre [] -
 * convenção: cada family em exatamente 1 grupo).
 * @returns {string[]} familyIds duplicados
 */
export function findDuplicatedFamilies(): string[] {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const group of Object.values(FAMILY_GROUPS)) {
        for (const familyId of group.familyIds) {
            if (seen.has(familyId)) dups.add(familyId);
            else seen.add(familyId);
        }
    }
    return [...dups];
}

// ──────────────────────────────────────────────────────────────────────────
// Menu builders - para UI de toolbox/family picker/model library panel
// ──────────────────────────────────────────────────────────────────────────

interface BuildGroupMenuOpts {
    includeDisabled?: boolean;
    modelLibrary?: Record<string, unknown>;
    includeEmptyGroups?: boolean;
}

/**
 * Constrói árvore agrupada para menu de UI. Cada grupo lista suas famílias
 * com metadata + (opcional) variantes do model-library.
 *
 * Filtra famílias desabilitadas (enabled === false) por default.
 *
 * @param {Object} familiesRegistry - DEFAULT_FAMILIES de families.js
 * @param {Object} [opts]
 * @param {boolean} [opts.includeDisabled=false]
 * @param {Object} [opts.modelLibrary] - MODEL_LIBRARY de model-library.js
 *   se passado, anexa variants[] em cada family (slug + labelKey + isHq)
 * @param {boolean} [opts.includeEmptyGroups=false] - true: inclui grupos sem
 *   nenhuma family habilitada após filtros
 * @returns {GroupMenuNode[]}
 */
export function buildGroupMenu(familiesRegistry: unknown, opts: BuildGroupMenuOpts = {}): GroupMenuNode[] {
    if (!familiesRegistry || typeof familiesRegistry !== 'object') return [];
    const { includeDisabled = false, modelLibrary, includeEmptyGroups = false } = opts;

    // Index variants by family se model-library presente
    const variantsByFamily = new Map<string, Array<Record<string, unknown>>>();
    if (modelLibrary && typeof modelLibrary === 'object') {
        for (const [slug, _entry] of Object.entries(modelLibrary)) {
            const entry = _entry as Record<string, unknown> | null;
            if (!entry || !entry.family) continue;
            const famKey = String(entry.family);
            let list = variantsByFamily.get(famKey);
            if (!list) {
                list = [];
                variantsByFamily.set(famKey, list);
            }
            list.push({
                slug,
                labelKey: entry.labelKey || slug,
                isHq: !!entry.isHq,
                quality: entry.quality || 'low',
            });
        }
    }

    const registry = familiesRegistry as Record<string, Record<string, unknown> | undefined>;
    const result: GroupMenuNode[] = [];
    for (const group of getOrderedGroups()) {
        const families: GroupMenuFamily[] = [];
        for (const fid of group.familyIds) {
            const fam = registry[fid];
            if (!fam) continue;
            if (!includeDisabled && fam.enabled === false) continue;
            families.push({
                id: String(fam.id),
                name: (fam.name as string | null | undefined) || null,
                nameKey: (fam.nameKey as string | null | undefined) || null,
                code: (fam.code as string | null | undefined) || null,
                icon: (fam.icon as string | null | undefined) || null,
                enabled: fam.enabled !== false,
                isContainer: !!fam.isContainer,
                variants: variantsByFamily.get(fid) || [],
            });
        }
        if (families.length === 0 && !includeEmptyGroups) continue;
        result.push({
            id: group.id,
            labelKey: group.labelKey,
            icon: group.icon,
            order: group.order,
            families,
        });
    }
    return result;
}

/**
 * Sumário do menu para HUD/diagnóstico: contagem de grupos visíveis,
 * famílias visíveis, variantes total.
 *
 * @param {GroupMenuNode[]} menu - output de buildGroupMenu
 * @returns {{groupCount:number, familyCount:number, variantCount:number, containerCount:number}}
 */
export function summarizeGroupMenu(menu: GroupMenuNode[]): {
    groupCount: number;
    familyCount: number;
    variantCount: number;
    containerCount: number;
} {
    if (!Array.isArray(menu)) {
        return { groupCount: 0, familyCount: 0, variantCount: 0, containerCount: 0 };
    }
    let familyCount = 0;
    let variantCount = 0;
    let containerCount = 0;
    for (const group of menu) {
        if (!Array.isArray(group.families)) continue;
        for (const fam of group.families) {
            familyCount++;
            if (fam.isContainer) containerCount++;
            if (Array.isArray(fam.variants)) variantCount += fam.variants.length;
        }
    }
    return { groupCount: menu.length, familyCount, variantCount, containerCount };
}

// ──────────────────────────────────────────────────────────────────────────
// Search / filter helpers (cross-group)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Busca cross-group por query case-insensitive.
 * Match por: family.id, family.name, family.nameKey (normalizado), family.code,
 * group.id, group.labelKey.
 *
 * @param {string} query - termo busca (≥2 chars)
 * @param {Object} familiesRegistry - DEFAULT_FAMILIES
 * @returns {Array<{groupId:string, family:Object, score:number}>}
 *   ordenado por score descendente (match exato em id/code = 100; partial = 50; group = 10)
 */
export function searchFamilies(
    query: string,
    familiesRegistry: unknown,
): Array<{ groupId: string; family: Record<string, unknown>; score: number }> {
    if (!query || typeof query !== 'string' || query.trim().length < 2) return [];
    if (!familiesRegistry || typeof familiesRegistry !== 'object') return [];
    const q = query.toLowerCase().trim();
    const registry = familiesRegistry as Record<string, Record<string, unknown> | undefined>;
    const results: Array<{ groupId: string; family: Record<string, unknown>; score: number }> = [];

    for (const group of Object.values(FAMILY_GROUPS)) {
        // Group-level partial match (low weight)
        const groupHit = group.id.toLowerCase().includes(q) || group.labelKey.toLowerCase().includes(q);

        for (const fid of group.familyIds) {
            const fam = registry[fid];
            if (!fam) continue;

            let score = 0;
            const id = (typeof fam.id === 'string' ? fam.id : '').toLowerCase();
            const code = (typeof fam.code === 'string' ? fam.code : '').toLowerCase();
            const name = (typeof fam.name === 'string' ? fam.name : '').toLowerCase();
            const nameKey = (typeof fam.nameKey === 'string' ? fam.nameKey : '').toLowerCase();

            if (id === q || code === q) score = 100;
            else if (id.includes(q) || nameKey.includes(q)) score = 80;
            else if (name.includes(q)) score = 60;
            else if (groupHit) score = 10;

            if (score > 0) {
                results.push({ groupId: group.id, family: fam, score });
            }
        }
    }
    return results.sort((a, b) => b.score - a.score);
}

/**
 * Filtra grupos por tag/predicado. Útil para apresentar subset (ex: só
 * grupos relacionados a água) sem alterar registry canônico.
 *
 * @param {Function} predicate - (group) => bool
 * @returns {FamilyGroup[]}
 */
export function filterGroups(predicate: (group: FamilyGroup) => boolean): FamilyGroup[] {
    if (typeof predicate !== 'function') return [];
    return getOrderedGroups().filter(predicate);
}

/**
 * Agrupa entries do MODEL_LIBRARY por group (via family → group lookup).
 * Útil para UI de biblioteca 3D: mostrar "Recursos hídricos" com todas as
 * variants de plume/well/lake/river/spring.
 *
 * @param {Object} modelLibrary - MODEL_LIBRARY de model-library.js
 * @returns {Record<string, Array<{slug:string, family:string, labelKey:string, isHq:boolean, quality:string}>>}
 *   groupId → list of variants
 */
export function groupModelLibraryByCategory(
    modelLibrary: unknown,
): Record<string, Array<{ slug: string; family: string; labelKey: string; isHq: boolean; quality: string }>> {
    if (!modelLibrary || typeof modelLibrary !== 'object') return {};
    const familyToGroup = buildFamilyToGroupMap();
    const result: Record<
        string,
        Array<{ slug: string; family: string; labelKey: string; isHq: boolean; quality: string }>
    > = {};
    for (const [slug, _entry] of Object.entries(modelLibrary)) {
        const entry = _entry as Record<string, unknown> | null;
        if (!entry || !entry.family) continue;
        const group = familyToGroup.get(String(entry.family));
        if (!group) continue;
        let bucket = result[group.id];
        if (!bucket) {
            bucket = [];
            result[group.id] = bucket;
        }
        bucket.push({
            slug,
            family: String(entry.family),
            labelKey: String(entry.labelKey || slug),
            isHq: !!entry.isHq,
            quality: String(entry.quality || 'low'),
        });
    }
    return result;
}

/**
 * Contagem de variants por grupo (resumo executivo para HUD/biblioteca panel).
 *
 * @param {Object} modelLibrary
 * @returns {Array<{groupId:string, labelKey:string, order:number, variantCount:number, familyCount:number}>}
 *   ordenado por group.order
 */
export function modelLibraryGroupStats(
    modelLibrary: unknown,
): Array<{ groupId: string; labelKey: string; order: number; variantCount: number; familyCount: number }> {
    const grouped = groupModelLibraryByCategory(modelLibrary);
    const stats: Array<{
        groupId: string;
        labelKey: string;
        order: number;
        variantCount: number;
        familyCount: number;
    }> = [];
    for (const group of getOrderedGroups()) {
        const variants = grouped[group.id] || [];
        const families = new Set(variants.map((v) => v.family));
        stats.push({
            groupId: group.id,
            labelKey: group.labelKey,
            order: group.order,
            variantCount: variants.length,
            familyCount: families.size,
        });
    }
    return stats;
}
