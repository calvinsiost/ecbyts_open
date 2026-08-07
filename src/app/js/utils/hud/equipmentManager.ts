// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   EQUIPMENT HUD MANAGER - state, selection, carousel
   ================================================================ */
import { getAllElements, getElementById, getSelectedElement } from '../../core/elements/manager.js';
import { getAllFamilies } from '../../core/elements/families.js';
import { safeSetItem } from '../storage/storageMonitor.js';
const STORAGE_KEY = 'ecbyts-equipment-hud';
/**
 * @typedef {{visible: boolean, familyId: string, indexByFamily: Record<string, number>, selectedIds: string[]}} EquipmentHudState
 */
const state: any = {
    visible: false,
    familyId: '',
    indexByFamily: {},
    selectedIds: [],
};
function persist() {
    try {
        safeSetItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch (e: any) {
        console.debug('[equipmentManager] persist:', e?.message || e);
        // noop
    }
}
/**
 * @param {string} familyId
 * @param {Record<string, any>} families
 * @returns {string}
 */
function _normalizeFamily(familyId: any, families: any) {
    const ids = Object.keys(families).filter((fid: any) => !families[fid]?.isContainer);
    if (!ids.length)
        return '';
    if (familyId && ids.includes(familyId))
        return familyId;
    return ids[0];
}
export function initEquipmentHud() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                state.visible = !!parsed.visible;
                state.familyId = typeof parsed.familyId === 'string' ? parsed.familyId : '';
                state.indexByFamily =
                    parsed.indexByFamily && typeof parsed.indexByFamily === 'object' ? parsed.indexByFamily : {};
                state.selectedIds = Array.isArray(parsed.selectedIds) ? parsed.selectedIds : [];
            }
        }
    }
    catch (e: any) {
        console.debug('[equipmentManager] init:', e?.message || e);
        // noop
    }
}
export function getEquipmentHudState() {
    return {
        visible: state.visible,
        familyId: state.familyId,
        indexByFamily: { ...state.indexByFamily },
        selectedIds: [...state.selectedIds],
    };
}
/** @param {boolean} visible */
export function setEquipmentHudVisible(visible: any) {
    state.visible = !!visible;
    persist();
}
export function toggleEquipmentHudVisible() {
    state.visible = !state.visible;
    persist();
    return state.visible;
}
export function getEquipmentFamilies() {
    /** @type {Record<string, any>} */
    const families = getAllFamilies();
    /** @type {Record<string, number>} */
    const counts: Record<string, any> = {};
    for (const el of /** @type {any[]} */ (getAllElements())) {
        if (!families[el.family]?.isContainer)
            counts[el.family] = (counts[el.family] || 0) + 1;
    }
    return Object.keys(counts)
        .sort()
        .map((fid: any) => ({
        id: fid,
        count: counts[fid],
        label: families[fid]?.label || families[fid]?.name || fid,
    }));
}
export function getCurrentFamilyId() {
    const families = getAllFamilies();
    state.familyId = _normalizeFamily(state.familyId, families);
    return state.familyId;
}
/** @param {string} familyId */
export function setCurrentFamilyId(familyId: any) {
    state.familyId = familyId || '';
    const families = getAllFamilies();
    state.familyId = _normalizeFamily(state.familyId, families);
    persist();
    return state.familyId;
}
export function cycleFamily(step = 1) {
    const families = getEquipmentFamilies();
    if (!families.length)
        return '';
    const current = getCurrentFamilyId();
    const idx = Math.max(0, families.findIndex((f: any) => f.id === current));
    const nextIdx = (idx + step + families.length) % families.length;
    state.familyId = families[nextIdx]!.id;
    persist();
    return state.familyId;
}
export function getElementsForCurrentFamily() {
    const familyId = getCurrentFamilyId();
    if (!familyId)
        return [];
    return /** @type {any[]} */ (getAllElements())
        .filter((/** @type {any} */ e) => e.family === familyId)
        .sort((/** @type {any} */ a, b: any) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
}
export function getActiveElementForCurrentFamily() {
    const elements = getElementsForCurrentFamily();
    if (!elements.length)
        return null;
    const familyId = getCurrentFamilyId();
    const max = elements.length - 1;
    const idx = Math.max(0, Math.min(max, Number(state.indexByFamily[familyId as any] || 0)));
    state.indexByFamily[familyId as any] = idx;
    return elements[idx];
}
export function cycleActiveElement(step = 1) {
    const elements = getElementsForCurrentFamily();
    if (!elements.length)
        return null;
    const familyId = getCurrentFamilyId();
    const len = elements.length;
    const idx = Number(state.indexByFamily[familyId as any] || 0);
    const next = (idx + step + len) % len;
    state.indexByFamily[familyId as any] = next;
    persist();
    return elements[next];
}
export function syncFamilyFromSelectedElement() {
    const selected = (getSelectedElement()) as any;
    if (!selected)
        return;
    state.familyId = selected.family;
    const familyEls = getElementsForCurrentFamily();
    const idx = familyEls.findIndex((/** @type {any} */ e) => e.id === selected.id);
    if (idx >= 0)
        state.indexByFamily[selected.family] = idx;
    persist();
}
/** @param {string} elementId */
export function toggleBatchSelection(elementId: any) {
    const id = String(elementId || '');
    if (!id)
        return [];
    const set = new Set(state.selectedIds);
    if (set.has(id))
        set.delete(id);
    else
        set.add(id);
    state.selectedIds = [...set];
    persist();
    return state.selectedIds;
}
export function getBatchSelection() {
    return [...state.selectedIds].filter((id: any) => !!getElementById(id));
}
export function clearBatchSelection() {
    state.selectedIds = [];
    persist();
}
