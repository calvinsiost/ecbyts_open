// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   GROUP MANAGER — Custom element & family grouping
   Gerenciador de grupos customizaveis para elementos e familias

   Dois conjuntos independentes de grupos:
   - elementGroups: organizam elementos no painel Elements
   - familyGroups: organizam familias no painel esquerdo

   Estado mantido em closure do modulo (mesmo padrao de ticker/manager).
   Persistencia via localStorage + export/import do modelo.
   ================================================================ */
import { generateId } from '../helpers/id.js';
import { deepClone } from '../helpers/deepClone.js';
import { isEphemeral, safeSetItem } from '../storage/storageMonitor.js';
import { getOrderedGroups } from '../../config/family-groups.js';
// Adopt own pure helpers (Module C extraction commit 44676a41) — DRY interno.
import {
    createGroupShape,
    resolveGroupViewMode as _resolveGroupViewMode,
    isValidGroupViewMode,
    removeGroupFromList,
    clearMapEntriesForGroup,
    nextGroupColor as _nextGroupColorPure,
} from './_groupsPure.js';
/** @typedef {Record<string, any>} AnyRecord */
/** @typedef {AnyRecord & {elementGroups: Array<AnyRecord>, familyGroups: Array<AnyRecord>, elementGroupMap: Record<string, string>, familyGroupMap: Record<string, string>, elementUngroupedCollapsed: boolean, familyUngroupedCollapsed: boolean}} GroupState */
// ----------------------------------------------------------------
// MODULE STATE
// Estado do modulo - closure privada
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-groups';
/**
 * Valid view modes for group display (SPEC_GROUP_VIEW_MODES §S1).
 * Default: 'visual' (backward compat for groups without viewMode).
 */
export const GROUP_VIEW_MODES = Object.freeze(['visual', 'form', 'dashboard', 'collection']);
export const DEFAULT_GROUP_VIEW_MODE = 'visual';
/** @type {GroupState} */
let groupState: any = {
    elementGroups: [], // Grupos para elementos
    familyGroups: [], // Grupos para familias
    elementGroupMap: {}, // { elementId: groupId }
    familyGroupMap: {}, // { familyId: groupId }
    elementUngroupedCollapsed: true,
    familyUngroupedCollapsed: true,
};
// ----------------------------------------------------------------
// INITIALIZATION
// Carrega configuracao salva no localStorage
// ----------------------------------------------------------------
/**
 * Initialize groups from localStorage.
 * Carrega configuracao salva ou cria estado padrao.
 */
export function initGroups() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY) || '';
        if (saved) {
            const parsed = JSON.parse(saved);
            // Compatibilidade: se tem `groups` antigo, migra para elementGroups
            groupState = {
                elementGroups: Array.isArray(parsed.elementGroups)
                    ? parsed.elementGroups
                    : Array.isArray(parsed.groups)
                      ? parsed.groups
                      : [],
                familyGroups: Array.isArray(parsed.familyGroups) ? parsed.familyGroups : [],
                elementGroupMap: parsed.elementGroupMap || {},
                familyGroupMap: parsed.familyGroupMap || {},
                elementUngroupedCollapsed: parsed.elementUngroupedCollapsed !== false,
                familyUngroupedCollapsed: parsed.familyUngroupedCollapsed !== false,
            };
        }
    } catch (e: any) {
        console.warn('[Groups] Erro ao carregar localStorage:', e instanceof Error ? e.message : e);
    }
    // Auto-seed canonical family groups em dois cenários:
    // 1. Primeira execução - familyGroups.length === 0
    // 2. User tem grupos mas faltam canônicos (regressão 2026-04-20: Calvin
    //    adicionou 5 famílias novas vehicle/equipment/infra_linear/
    //    treatment_system/atmosphere - grupos fleet/environmental canônicos
    //    não existem no localStorage antigo → "Sem Grupo (23)" na UI).
    //
    // Solução merge-safe: sempre rodar seedDefaultFamilyGroups com force=false
    // - só cria grupos canônicos faltantes + mapeia famílias ungrouped.
    // Nunca sobrescreve mapping user-custom (force=false protege).
    try {
        seedDefaultFamilyGroups({ force: false });
    } catch (e: any) {
        console.warn('[Groups] Falha ao seed FAMILY_GROUPS canônicos:', e instanceof Error ? e.message : e);
    }
}
// ----------------------------------------------------------------
// STATE ACCESS - ELEMENT GROUPS
// ----------------------------------------------------------------
/**
 * Get all element groups sorted by order.
 * @returns {Array<AnyRecord>}
 */
export function getElementGroups() {
    return [...groupState.elementGroups].sort((a: any, b: any) => a.order - b.order);
}
/**
 * Get the group ID assigned to an element.
 * @param {string} elementId
 * @returns {string|null}
 */
export function getElementGroup(elementId: any) {
    return groupState.elementGroupMap[elementId] || null;
}
/**
 * Check if element ungrouped section is collapsed.
 * @returns {boolean}
 */
export function isElementUngroupedCollapsed() {
    return groupState.elementUngroupedCollapsed;
}
// ----------------------------------------------------------------
// STATE ACCESS - FAMILY GROUPS
// ----------------------------------------------------------------
/**
 * Get all family groups sorted by order.
 * @returns {Array<AnyRecord>}
 */
export function getFamilyGroups() {
    return [...groupState.familyGroups].sort((a: any, b: any) => a.order - b.order);
}
/**
 * Get the group ID assigned to a family.
 * @param {string} familyId
 * @returns {string|null}
 */
export function getFamilyGroup(familyId: any) {
    return groupState.familyGroupMap[familyId] || null;
}
/**
 * Check if family ungrouped section is collapsed.
 * @returns {boolean}
 */
export function isFamilyUngroupedCollapsed() {
    return groupState.familyUngroupedCollapsed;
}
// ----------------------------------------------------------------
// GENERIC GROUP LOOKUP
// ----------------------------------------------------------------
/**
 * Get a single group by ID (searches both lists).
 * @param {string} id
 * @returns {AnyRecord|undefined}
 */
export function getGroupById(id: any) {
    return groupState.elementGroups.find((g: any) => g.id === id) || groupState.familyGroups.find((g: any) => g.id === id);
}
// ----------------------------------------------------------------
// VIEW MODE (SPEC_GROUP_VIEW_MODES §S1)
// ----------------------------------------------------------------
/**
 * Get the view mode of a group. Returns DEFAULT_GROUP_VIEW_MODE if group
 * has no viewMode field (backward compat with pre-viewMode models).
 * @param {string} id
 * @returns {string} one of GROUP_VIEW_MODES
 */
export function getGroupViewMode(id: any) {
    return _resolveGroupViewMode(getGroupById(id));
}
/**
 * Set the view mode of a group. Rejects invalid modes silently
 * (keeps previous mode intact). Emits `groupsChanged` + `groupViewModeChanged`.
 * @param {string} id
 * @param {string} mode - must be one of GROUP_VIEW_MODES
 * @returns {boolean} true if applied, false if rejected
 */
export function setGroupViewMode(id: any, mode: any) {
    if (!isValidGroupViewMode(mode)) return false;
    const group = getGroupById(id);
    if (!group) return false;
    if (group.viewMode === mode) return true;
    group.viewMode = mode;
    persist();
    dispatchChange();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('groupViewModeChanged', { detail: { id, mode } }));
    }
    return true;
}
// ----------------------------------------------------------------
// VISIBILITY / OPACITY (SPEC_GROUP_VIEW_MODES §S2)
// Group-level state; UI layer (lists/mesh) listens to events and
// applies to actual elements/meshes.
// ----------------------------------------------------------------
/**
 * Get all element IDs assigned to a group.
 * @param {string} groupId
 * @returns {string[]}
 */
export function getGroupElementIds(groupId: any) {
    const result = [];
    for (const [elementId, gId] of Object.entries(groupState.elementGroupMap)) {
        if (gId === groupId) result.push(elementId);
    }
    return result;
}
/**
 * Set group-level visibility flag. Stored as `group.visibility` (boolean).
 * Dispatches `groupVisibilityChanged` so UI layer can propagate to meshes.
 * @param {string} groupId
 * @param {boolean} visible
 * @param {boolean} [recursive=true] - reserved for nested groups (future)
 * @returns {boolean} true if applied
 */
export function setGroupVisibility(groupId: any, visible: any, recursive: any = true) {
    const group = getGroupById(groupId);
    if (!group) return false;
    group.visibility = !!visible;
    persist();
    dispatchChange();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
            new CustomEvent('groupVisibilityChanged', {
                detail: { id: groupId, visible: !!visible, recursive: !!recursive },
            }),
        );
    }
    return true;
}
/**
 * Get group-level visibility. Returns `undefined` if never set (UI should
 * query element-level state to compute "mixed" indicator).
 * @param {string} groupId
 * @returns {boolean|undefined}
 */
export function getGroupVisibility(groupId: any) {
    const group = getGroupById(groupId);
    return group ? group.visibility : undefined;
}
/**
 * Set group-level opacity (0.0 → 1.0). Clamped. Emits `groupOpacityChanged`.
 * @param {string} groupId
 * @param {number} opacity - 0..1
 * @param {boolean} [recursive=true]
 * @returns {boolean}
 */
export function setGroupOpacity(groupId: any, opacity: any, recursive: any = true) {
    const group = getGroupById(groupId);
    if (!group) return false;
    if (typeof opacity !== 'number' || !Number.isFinite(opacity)) return false;
    const clamped = Math.max(0, Math.min(1, opacity));
    group.opacity = clamped;
    persist();
    dispatchChange();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
            new CustomEvent('groupOpacityChanged', {
                detail: { id: groupId, opacity: clamped, recursive: !!recursive },
            }),
        );
    }
    return true;
}
/**
 * Get group-level opacity. Returns `undefined` if never set.
 * @param {string} groupId
 * @returns {number|undefined}
 */
export function getGroupOpacity(groupId: any) {
    const group = getGroupById(groupId);
    return group ? group.opacity : undefined;
}
// ----------------------------------------------------------------
// CRUD - ELEMENT GROUPS
// ----------------------------------------------------------------
/**
 * Add a new element group.
 * @param {{ name?: string, color?: string }} partial
 * @returns {AnyRecord}
 */
export function addElementGroup(partial: any = {}) {
    const group = createGroupShape(generateId('egrp'), partial, groupState.elementGroups);
    groupState.elementGroups.push(group);
    persist();
    dispatchChange();
    return group;
}
/**
 * Update an element group's properties.
 * @param {string} id
 * @param {AnyRecord} changes
 */
export function updateElementGroupProps(id: any, changes: any) {
    const group = groupState.elementGroups.find((g: any) => g.id === id);
    if (!group) return;
    Object.assign(group, changes);
    persist();
    dispatchChange();
}
/**
 * Remove an element group. Elements become ungrouped.
 * @param {string} id
 */
export function removeElementGroup(id: any) {
    groupState.elementGroups = removeGroupFromList(groupState.elementGroups, id);
    groupState.elementGroupMap = clearMapEntriesForGroup(groupState.elementGroupMap, id);
    persist();
    dispatchChange();
}
/**
 * Toggle collapse state of an element group.
 * @param {string} id
 */
export function toggleElementGroupCollapsed(id: any) {
    const group = groupState.elementGroups.find((g: any) => g.id === id);
    if (group) {
        group.collapsed = !group.collapsed;
        persist();
        dispatchChange();
    }
}
/**
 * Toggle collapse of element ungrouped section.
 */
export function toggleElementUngroupedCollapsed() {
    groupState.elementUngroupedCollapsed = !groupState.elementUngroupedCollapsed;
    persist();
    dispatchChange();
}
// ----------------------------------------------------------------
// CRUD - FAMILY GROUPS
// ----------------------------------------------------------------
/**
 * Add a new family group.
 * @param {{ name?: string, color?: string }} partial
 * @returns {AnyRecord}
 */
export function addFamilyGroup(partial: any = {}) {
    const group = createGroupShape(generateId('fgrp'), partial, groupState.familyGroups);
    groupState.familyGroups.push(group);
    persist();
    dispatchChange();
    return group;
}
/**
 * Update a family group's properties.
 * @param {string} id
 * @param {AnyRecord} changes
 */
export function updateFamilyGroupProps(id: any, changes: any) {
    const group = groupState.familyGroups.find((g: any) => g.id === id);
    if (!group) return;
    Object.assign(group, changes);
    persist();
    dispatchChange();
}
/**
 * Remove a family group. Families become ungrouped.
 * @param {string} id
 */
export function removeFamilyGroup(id: any) {
    groupState.familyGroups = removeGroupFromList(groupState.familyGroups, id);
    groupState.familyGroupMap = clearMapEntriesForGroup(groupState.familyGroupMap, id);
    persist();
    dispatchChange();
}
/**
 * Toggle collapse state of a family group.
 * @param {string} id
 */
export function toggleFamilyGroupCollapsed(id: any) {
    const group = groupState.familyGroups.find((g: any) => g.id === id);
    if (group) {
        group.collapsed = !group.collapsed;
        persist();
        dispatchChange();
    }
}
/**
 * Toggle collapse of family ungrouped section.
 */
export function toggleFamilyUngroupedCollapsed() {
    groupState.familyUngroupedCollapsed = !groupState.familyUngroupedCollapsed;
    persist();
    dispatchChange();
}
// ----------------------------------------------------------------
// ELEMENT ASSIGNMENT
// ----------------------------------------------------------------
/**
 * Assign an element to a group.
 * @param {string} elementId
 * @param {string} groupId
 */
export function setElementGroup(elementId: any, groupId: any) {
    if (!groupState.elementGroups.find((g: any) => g.id === groupId)) return;
    groupState.elementGroupMap[elementId] = groupId;
    persist();
    dispatchChange();
}
/**
 * Remove an element from its group.
 * @param {string} elementId
 */
export function clearElementGroup(elementId: any) {
    delete groupState.elementGroupMap[elementId];
    persist();
    dispatchChange();
}
// ----------------------------------------------------------------
// FAMILY ASSIGNMENT
// ----------------------------------------------------------------
/**
 * Assign a family to a group.
 * @param {string} familyId
 * @param {string} groupId
 */
export function setFamilyGroup(familyId: any, groupId: any) {
    if (!groupState.familyGroups.find((g: any) => g.id === groupId)) return;
    groupState.familyGroupMap[familyId] = groupId;
    persist();
    dispatchChange();
}
/**
 * Remove a family from its group.
 * @param {string} familyId
 */
export function clearFamilyGroup(familyId: any) {
    delete groupState.familyGroupMap[familyId];
    persist();
    dispatchChange();
}
/**
 * Seed default family groups a partir de FAMILY_GROUPS canonical (config).
 * Cria os 11 grupos canônicos (Monitoring/Hydrology/Infrastructure/etc) e
 * mapeia cada family para seu grupo.
 *
 * Idempotente: IDs determinísticos `fgrp-<canonicalGroupId>` evitam duplicação
 * em execuções sucessivas. Merge-friendly: grupos e mapeamentos já criados
 * pelo usuário são preservados (não sobrescreve).
 *
 * Motivação: UI atual mostra "Sem Grupo (18)" - 18 famílias ungrouped por
 * falta de seed default. FAMILY_GROUPS já define canonical mapping em
 * `app/js/config/family-groups.js` (11 grupos × 28 famílias 100% coverage).
 *
 * @param {{force?: boolean}} [opts]
 * @returns {{groupsCreated:number, familiesMapped:number}}
 */
export function seedDefaultFamilyGroups(opts: any = {}) {
    const force = opts.force === true;
    let groupsCreated = 0;
    let familiesMapped = 0;
    const canonical = getOrderedGroups();
    for (const canonGroup of canonical) {
        const deterministicId = `fgrp-${canonGroup.id}`;
        let group = groupState.familyGroups.find((g: any) => g.id === deterministicId);
        if (!group) {
            group = {
                id: deterministicId,
                name: _groupDefaultLabel(canonGroup),
                labelKey: canonGroup.labelKey, // para i18n via translate
                color: _nextGroupColorPure(groupState.familyGroups),
                collapsed: true,
                order: canonGroup.order,
                viewMode: DEFAULT_GROUP_VIEW_MODE,
                canonical: canonGroup.id, // marca origem
            };
            groupState.familyGroups.push(group);
            groupsCreated++;
        }
        // Mapeia cada family do grupo canônico
        for (const fid of canonGroup.familyIds) {
            if (!force && groupState.familyGroupMap[fid]) continue;
            groupState.familyGroupMap[fid] = deterministicId;
            familiesMapped++;
        }
    }
    persist();
    dispatchChange();
    return { groupsCreated, familiesMapped };
}
/**
 * Retorna label default para um canonical group quando i18n translate ainda
 * não está disponível (ex: runtime antes de initI18n).
 * @param {{id:string, labelKey:string}} canonGroup
 * @returns {string}
 */
function _groupDefaultLabel(canonGroup: any) {
    /** @type {Record<string, string>} */
    const fallbackLabels = {
        container: 'Containers',
        hydrology: 'Hydrology',
        infrastructure: 'Infrastructure',
        mining: 'Mining',
        environmental: 'Environmental',
        biotic: 'Biotic',
        monitoring: 'Monitoring',
        geological: 'Geology',
        events: 'Events',
        intangible: 'Intangible',
        misc: 'Misc',
    };
    return (fallbackLabels as Record<string,any>)[canonGroup.id] || canonGroup.id;
}
/**
 * Action "Restaurar grupos padrão" - invocável via UI/command bar quando
 * usuário tem grupos custom mas familyGroupMap tem gaps ("Sem Grupo (N)"
 * maior que 0). Merge safe com user groups existentes.
 *
 * Comportamento:
 * 1. Cria canonical groups faltantes (idempotente via fgrp-<id>)
 * 2. Mapeia famílias ungrouped para o canonical group apropriado
 * 3. NÃO sobrescreve mapeamentos user-custom (opts.force=false)
 *
 * @returns {{groupsCreated:number, familiesMapped:number}}
 */
export function restoreCanonicalFamilyGroups() {
    return seedDefaultFamilyGroups({ force: false });
}
/**
 * Remove todos os family groups canônicos (origem `canonical` marker) e
 * seus mapeamentos. Não afeta grupos custom criados pelo usuário.
 *
 * @returns {{groupsRemoved:number, familiesUnmapped:number}}
 */
export function clearCanonicalFamilyGroups() {
    let familiesUnmapped = 0;
    const canonicalIds = new Set(groupState.familyGroups.filter((g: any) => g.canonical).map((g: any) => g.id));
    groupState.familyGroups = groupState.familyGroups.filter((g: any) => !g.canonical);
    const groupsRemoved = canonicalIds.size;
    for (const [fid, gid] of Object.entries(groupState.familyGroupMap)) {
        if (canonicalIds.has(gid)) {
            delete groupState.familyGroupMap[fid];
            familiesUnmapped++;
        }
    }
    persist();
    dispatchChange();
    return { groupsRemoved, familiesUnmapped };
}
// ----------------------------------------------------------------
// RANDOM GENERATION
// Gera grupos de exemplo para o modelo random
// ----------------------------------------------------------------
/**
 * Generate random element and family groups.
 * Cria grupos de exemplo e distribui elementos e familias entre eles.
 *
 * @param {Array<AnyRecord>} elements - All elements from getAllElements()
 * @param {Array<AnyRecord>} families - Enabled families from getEnabledFamilies()
 * @param {AnyRecord} [options]
 */
export function generateRandomGroups(elements: any, families: any, options: any = {}) {
    // Limpa estado anterior
    groupState.elementGroups = [];
    groupState.familyGroups = [];
    groupState.elementGroupMap = {};
    groupState.familyGroupMap = {};
    groupState.elementUngroupedCollapsed = true;
    groupState.familyUngroupedCollapsed = true;
    // --- Element groups ---
    // Agrupa elementos por campanha primeiro (grupo superior), depois por temas/familias.
    const campaignList = Array.isArray(options?.campaigns) ? options.campaigns : [];
    if (campaignList.length > 0) {
        const campaignNameById = new Map(campaignList.map((c: any) => [c.id, c.name || c.id]));
        const byCampaign = new Map();
        for (const el of elements) {
            const obs = Array.isArray(el?.data?.observations) ? el.data.observations : [];
            if (obs.length === 0) continue;
            const latest = [...obs]
                .filter((o: any) => o?.campaignId)
                .sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')))[0];
            if (!latest?.campaignId) continue;
            if (!byCampaign.has(latest.campaignId)) byCampaign.set(latest.campaignId, []);
            byCampaign.get(latest.campaignId).push(el);
        }
        for (const [campaignId, members] of byCampaign.entries()) {
            if (members.length === 0) continue;
            const group = {
                id: generateId('egrp'),
                name: `Campanha • ${campaignNameById.get(campaignId) || campaignId}`,
                color: '#6366f1',
                collapsed: true,
                order: groupState.elementGroups.length,
                meta: { grouping: 'campaign', campaignId },
            };
            groupState.elementGroups.push(group);
            for (const el of members) {
                if (!groupState.elementGroupMap[el.id]) groupState.elementGroupMap[el.id] = group.id;
            }
        }
    }
    // Agrupa elementos por familia para criar grupos tematicos
    const ELEMENT_GROUP_DEFS = [
        { name: 'Monitoring Network', families: ['well', 'sensor'], color: '#3b82f6' },
        { name: 'Contamination', families: ['plume', 'waste'], color: '#ef4444' },
        { name: 'Water Bodies', families: ['lake', 'river', 'spring'], color: '#06b6d4' },
        { name: 'Infrastructure', families: ['building', 'tank'], color: '#f59e0b' },
        { name: 'Site Boundaries', families: ['boundary', 'area'], color: '#10b981' },
    ];
    for (const def of ELEMENT_GROUP_DEFS) {
        const matching = elements.filter((el: any) => def.families.includes(el.family));
        if (matching.length === 0) continue;
        const group = {
            id: generateId('egrp'),
            name: def.name,
            color: def.color,
            collapsed: true,
            order: groupState.elementGroups.length,
        };
        groupState.elementGroups.push(group);
        for (const el of matching) {
            groupState.elementGroupMap[el.id] = group.id;
        }
    }
    // --- Family groups ---
    const FAMILY_GROUP_DEFS = [
        { name: 'Monitoring', families: ['well', 'sensor', 'marker'], color: '#3b82f6' },
        { name: 'Hydrology', families: ['lake', 'river', 'spring', 'plume'], color: '#06b6d4' },
        { name: 'Infrastructure', families: ['building', 'tank', 'waste', 'area'], color: '#f59e0b' },
        { name: 'Spatial', families: ['boundary', 'strata'], color: '#10b981' },
    ];
    const familyIds = families.map((f: any) => f.id);
    for (const def of FAMILY_GROUP_DEFS) {
        const matching = def.families.filter((fid: any) => familyIds.includes(fid));
        if (matching.length === 0) continue;
        const group = {
            id: generateId('fgrp'),
            name: def.name,
            color: def.color,
            collapsed: true,
            order: groupState.familyGroups.length,
        };
        groupState.familyGroups.push(group);
        for (const fid of matching) {
            groupState.familyGroupMap[fid] = group.id;
        }
    }
    persist();
    // Sem dispatchChange - chamado antes do refresh global no init
}
// ----------------------------------------------------------------
// EXPORT / IMPORT
// ----------------------------------------------------------------
/**
 * Clear all groups and reset to empty state.
 * Limpa todos os grupos e reseta estado.
 */
export function clearGroups() {
    groupState = {
        elementGroups: [],
        familyGroups: [],
        elementGroupMap: {},
        familyGroupMap: {},
        elementUngroupedCollapsed: false,
        familyUngroupedCollapsed: false,
    };
    persist();
    dispatchChange();
}
/**
 * Export groups state for model serialization.
 * @returns {AnyRecord}
 */
export function exportGroups() {
    return deepClone(groupState);
}
/**
 * Import groups state from model.
 * @param {AnyRecord} config
 */
export function importGroups(config: any) {
    if (!config) return;
    const elementGroups = Array.isArray(config.elementGroups)
        ? config.elementGroups
        : Array.isArray(config.groups)
          ? config.groups
          : [];
    const familyGroups = Array.isArray(config.familyGroups) ? config.familyGroups : [];
    for (const g of elementGroups) {
        if (!GROUP_VIEW_MODES.includes(g.viewMode)) g.viewMode = DEFAULT_GROUP_VIEW_MODE;
    }
    for (const g of familyGroups) {
        if (!GROUP_VIEW_MODES.includes(g.viewMode)) g.viewMode = DEFAULT_GROUP_VIEW_MODE;
    }
    groupState = {
        elementGroups,
        familyGroups,
        elementGroupMap: config.elementGroupMap || {},
        familyGroupMap: config.familyGroupMap || {},
        elementUngroupedCollapsed: !!config.elementUngroupedCollapsed,
        familyUngroupedCollapsed: !!config.familyUngroupedCollapsed,
    };
    persist();
    dispatchChange();
}
// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------
function persist() {
    if (isEphemeral()) return;
    safeSetItem(STORAGE_KEY, JSON.stringify(groupState));
}
function dispatchChange() {
    window.dispatchEvent(new CustomEvent('groupsChanged'));
}
// _nextColor + GROUP_COLORS removed — substituídos por _nextGroupColorPure de _groupsPure.
