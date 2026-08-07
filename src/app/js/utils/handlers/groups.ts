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
   GROUP HANDLERS — UI handlers for element & family grouping
   Controla a criacao, edicao e remocao de grupos customizados

   Dois conjuntos de grupos independentes:
   - Element groups: organizam elementos na aba Elements
   - Family groups: organizam familias no painel esquerdo
   ================================================================ */
import {
    getGroupById,
    addElementGroup,
    updateElementGroupProps,
    removeElementGroup,
    toggleElementGroupCollapsed,
    toggleElementUngroupedCollapsed,
    addFamilyGroup,
    updateFamilyGroupProps,
    removeFamilyGroup,
    toggleFamilyGroupCollapsed,
    toggleFamilyUngroupedCollapsed,
    setElementGroup,
    clearElementGroup,
    setFamilyGroup,
    clearFamilyGroup,
    restoreCanonicalFamilyGroups,
} from '../groups/manager.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { asyncPrompt, asyncConfirm } from '../ui/asyncDialogs.js';
/** @param {any} _fn */
export function setGroupsUpdateAllUI(_fn: any) {
    // Compatibility hook: groups manager emits its own targeted updates.
}
// ================================================================
// ELEMENT GROUP CRUD
// ================================================================
export async function handleAddElementGroup() {
    const name = await asyncPrompt(t('groupName') || 'Group name:');
    if (!name || !name.trim()) return;
    addElementGroup({ name: name.trim() });
    showToast(t('groupCreated') || 'Group created', 'success');
}
/** @param {any} groupId */
export async function handleRenameElementGroup(groupId: any) {
    const group = getGroupById(groupId);
    if (!group) return;
    const name = await asyncPrompt(t('groupName') || 'Group name:', group.name);
    if (!name || !name.trim()) return;
    updateElementGroupProps(groupId, { name: name.trim() });
}
/** @param {any} groupId */
export async function handleRemoveElementGroup(groupId: any) {
    if (!(await asyncConfirm(t('confirmRemoveGroup') || 'Remove this group? Elements will become ungrouped.'))) return;
    removeElementGroup(groupId);
    showToast(t('groupRemoved') || 'Group removed', 'info');
}
/** @param {any} groupId */
export function handleToggleElementGroupCollapse(groupId: any) {
    toggleElementGroupCollapsed(groupId);
}
export function handleToggleElementUngroupedCollapse() {
    toggleElementUngroupedCollapsed();
}
/** @param {any} groupId @param {any} color */
export function handleElementGroupColorChange(groupId: any, color: any) {
    updateElementGroupProps(groupId, { color });
}
// ================================================================
// FAMILY GROUP CRUD
// ================================================================
export async function handleAddFamilyGroup() {
    const name = await asyncPrompt(t('groupName') || 'Group name:');
    if (!name || !name.trim()) return;
    addFamilyGroup({ name: name.trim() });
    showToast(t('groupCreated') || 'Group created', 'success');
}
/** @param {any} groupId */
export async function handleRenameFamilyGroup(groupId: any) {
    const group = getGroupById(groupId);
    if (!group) return;
    const name = await asyncPrompt(t('groupName') || 'Group name:', group.name);
    if (!name || !name.trim()) return;
    updateFamilyGroupProps(groupId, { name: name.trim() });
}
/** @param {any} groupId */
export async function handleRemoveFamilyGroup(groupId: any) {
    if (!(await asyncConfirm(t('confirmRemoveGroup') || 'Remove this group? Families will become ungrouped.'))) return;
    removeFamilyGroup(groupId);
    showToast(t('groupRemoved') || 'Group removed', 'info');
}
/** @param {any} groupId */
export function handleToggleFamilyGroupCollapse(groupId: any) {
    toggleFamilyGroupCollapsed(groupId);
}
export function handleToggleFamilyUngroupedCollapse() {
    toggleFamilyUngroupedCollapsed();
}
/** @param {any} groupId @param {any} color */
export function handleFamilyGroupColorChange(groupId: any, color: any) {
    updateFamilyGroupProps(groupId, { color });
}
// ================================================================
// ELEMENT / FAMILY ASSIGNMENT
// ================================================================
/** @param {any} elementId @param {any} groupId */
export function handleMoveElementToGroup(elementId: any, groupId: any) {
    if (groupId) {
        setElementGroup(elementId, groupId);
    } else {
        clearElementGroup(elementId);
    }
}
/** @param {any} familyId @param {any} groupId */
export function handleMoveFamilyToGroup(familyId: any, groupId: any) {
    if (groupId) {
        setFamilyGroup(familyId, groupId);
    } else {
        clearFamilyGroup(familyId);
    }
}
/**
 * Action "Restaurar grupos padrão" - cria os 11 canonical groups (se faltam)
 * e mapeia famílias ungrouped. Preserva user-created + mappings custom.
 * Útil quando painel mostra "Sem Grupo (N)" com N > 0.
 */
export function handleRestoreCanonicalFamilyGroups() {
    const r = restoreCanonicalFamilyGroups();
    const msg =
        r.groupsCreated > 0 || r.familiesMapped > 0
            ? t('familyGroups.restored', { groups: r.groupsCreated, families: r.familiesMapped })
            : t('familyGroups.restoredNone');
    showToast(msg, 'success');
    return r;
}
// ================================================================
// EXPORT HANDLER OBJECT
// ================================================================
export const groupHandlers = {
    handleAddElementGroup,
    handleRenameElementGroup,
    handleRemoveElementGroup,
    handleToggleElementGroupCollapse,
    handleToggleElementUngroupedCollapse,
    handleElementGroupColorChange,
    handleAddFamilyGroup,
    handleRenameFamilyGroup,
    handleRemoveFamilyGroup,
    handleToggleFamilyGroupCollapse,
    handleToggleFamilyUngroupedCollapse,
    handleFamilyGroupColorChange,
    handleMoveElementToGroup,
    handleMoveFamilyToGroup,
    handleRestoreCanonicalFamilyGroups,
};
