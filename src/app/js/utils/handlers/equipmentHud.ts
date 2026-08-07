// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   EQUIPMENT HUD HANDLERS - window.* bridge for panel actions
   ================================================================ */
import { getMeshByElementId, getElementById } from '../../core/elements/manager.js';
import { updateElement } from '../../core/elements/manager.js';
import { rebuildElementMesh } from '../../core/elements/manager.js';
import { getAnalytics } from '../../core/analytics/index.js';
import { eventBus, Events } from '../../core/analytics/eventBus.js';
import { toggleEquipmentHudVisible, cycleFamily, cycleActiveElement, getActiveElementForCurrentFamily, toggleBatchSelection, getBatchSelection, syncFamilyFromSelectedElement, } from '../hud/equipmentManager.js';
import { renderEquipmentHud } from '../hud/equipmentRenderer.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { handleElementTransform } from './elements.js';
import { activateTabById } from '../ui/tabs.js';
import { zoomToElement } from '../scene/controls.js';
import { invalidateEquipmentThumb } from '../hud/equipmentThumbs.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
let _requestUIRefresh: any = null;
export function setEquipmentHudUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestEquipmentHudUIRefresh(reason = 'equipment-hud.changed') {
    if (typeof _requestUIRefresh !== 'function')
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        _requestUIRefresh(domain, reason);
    }
}
function _refresh() {
    renderEquipmentHud();
    requestEquipmentHudUIRefresh();
}
function handleToggleEquipmentHud() {
    const visible = toggleEquipmentHudVisible();
    const btn = document.getElementById('equipment-toggle-btn');
    if (btn)
        btn.classList.toggle('active', visible);
    renderEquipmentHud();
}
function handleEquipmentCycleFamily(step: any) {
    cycleFamily(Number(step || 1));
    _refresh();
}
function handleEquipmentCycleElement(step: any) {
    cycleActiveElement(Number(step || 1));
    _refresh();
}
function handleEquipmentSelectActive() {
    const active = getActiveElementForCurrentFamily();
    if (!active)
        return;
    if (typeof window.handleSelectElement === 'function')
        window.handleSelectElement(active.id);
    eventBus.emit(Events.ELEMENT_SELECTED, { elementId: active.id, selected: true, source: 'equipment-hud' });
    syncFamilyFromSelectedElement();
    _refresh();
}
function handleEquipmentOpenElementById(elementId: any) {
    const id = String(elementId || '');
    if (!id)
        return;
    activateTabById('elements');
    if (typeof window.handleSelectElement === 'function')
        window.handleSelectElement(id);
    zoomToElement(id);
    eventBus.emit(Events.ELEMENT_SELECTED, { elementId: id, selected: true, source: 'equipment-hud' });
    syncFamilyFromSelectedElement();
    _refresh();
}
function handleEquipmentOpenActiveElement() {
    const active = getActiveElementForCurrentFamily();
    if (!active)
        return;
    handleEquipmentOpenElementById(active.id);
}
function handleEquipmentToggleBatchActive() {
    const active = getActiveElementForCurrentFamily();
    if (!active)
        return;
    const ids = toggleBatchSelection(active.id);
    eventBus.emit(Events.ELEMENTS_FILTERED, { elementIds: ids, source: 'equipment-hud' });
    _refresh();
}
function handleEquipmentApplyFamilyFilter() {
    const active = getActiveElementForCurrentFamily();
    const familyId = active?.family || '';
    const sel = (document.getElementById('elements-filter-family'));
    if (!sel)
        return;
    sel.value = familyId;
    if (typeof window.handleElementFilterFamily === 'function')
        window.handleElementFilterFamily(familyId);
    showToast(t('filterApplied') || 'Filter applied', 'success');
}
function handleEquipmentSetColor(color: any) {
    const active = getActiveElementForCurrentFamily();
    if (!active)
        return;
    handleElementTransform(active.id, 'color', color);
    updateElement(active.id, { color });
    invalidateEquipmentThumb(active.id);
    _refresh();
}
function handleEquipmentSetScale(scale: any) {
    const active = getActiveElementForCurrentFamily();
    if (!active || !Number.isFinite(scale))
        return;
    const next = { x: scale, y: scale, z: scale };
    handleElementTransform(active.id, 'scale', next);
    invalidateEquipmentThumb(active.id);
    _refresh();
}
function _setWireframe(mesh: any, enabled: any) {
    if (!mesh)
        return;
    mesh.traverse((child: any) => {
        const mat = child.material;
        if (!mat)
            return;
        if (Array.isArray(mat)) {
            mat.forEach((m: any) => {
                if (m && 'wireframe' in m)
                    m.wireframe = !!enabled;
            });
            return;
        }
        if ('wireframe' in mat)
            mat.wireframe = !!enabled;
    });
}
function handleEquipmentSetWireframe(enabled: any) {
    const active = getActiveElementForCurrentFamily();
    if (!active)
        return;
    const el = getElementById(active.id);
    if (!el)
        return;
    if (!el.data)
        el.data = {};
    el.data._equipmentWireframe = !!enabled;
    _setWireframe(getMeshByElementId(active.id), enabled);
    invalidateEquipmentThumb(active.id);
    _refresh();
}
function handleEquipmentAttachAsset(inputEl: any) {
    const active = getActiveElementForCurrentFamily();
    const file = inputEl?.files?.[0];
    if (!active || !file)
        return;
    const el = getElementById(active.id);
    if (!el)
        return;
    if (!el.data)
        el.data = {};
    const fileName = String(file.name || '').toLowerCase();
    const isGLTF = fileName.endsWith('.glb') || fileName.endsWith('.gltf');
    const isOBJ = fileName.endsWith('.obj');
    const previousUrl = el.data?.custom3DAsset?.previewUrl;
    if (previousUrl && typeof previousUrl === 'string' && previousUrl.startsWith('blob:')) {
        try {
            URL.revokeObjectURL(previousUrl);
        }
        catch (e: any) {
            console.debug('[equipmentHud] revoke-previous-url:', e?.message || e);
        }
    }
    const previewUrl = isGLTF ? URL.createObjectURL(file) : null;
    el.data.custom3DAsset = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        previewUrl,
        format: isGLTF ? 'gltf' : isOBJ ? 'obj' : 'unknown',
        uploadedAt: new Date().toISOString(),
    };
    if (isGLTF) {
        rebuildElementMesh(active.id);
    }
    updateElement(active.id, { data: el.data });
    invalidateEquipmentThumb(active.id);
    if (isGLTF) {
        showToast('3D asset attached', 'success');
    }
    else if (isOBJ) {
        showToast('OBJ uploaded (preview pending OBJ loader)', 'warning');
    }
    else {
        showToast(t('saved') || 'Saved', 'success');
    }
    if (inputEl)
        inputEl.value = '';
    _refresh();
}
function handleEquipmentSelectBatchInAnalytics() {
    const ids = getBatchSelection();
    const analytics = getAnalytics();
    analytics.getSyncManager()?.selectElements(ids);
    eventBus.emit(Events.ELEMENTS_FILTERED, { elementIds: ids, source: 'equipment-hud' });
    _refresh();
}
/**
 * Aplica variant da biblioteca curada (model-library) a TODOS os elementos da
 * família ativa (ou multi-seleção se houver). Grava data.modelVariantId + rebuild
 * mesh. Segundo call com mesmo slug = clear.
 */
async function handleEquipmentSetModelVariant(slug: any) {
    if (!slug)
        return;
    const batchIds = getBatchSelection();
    // Default: aplica a TODA a família ativa (todos wells, todos tanques, etc).
    // Com multi-select (Mark): respeita a seleção específica.
    let targetIds;
    let appliedTo;
    if (batchIds.length) {
        targetIds = batchIds;
        appliedTo = `${batchIds.length} selecionados`;
    }
    else {
        const { getElementsForCurrentFamily } = await import('../hud/equipmentManager.js' as string);
        const family = getElementsForCurrentFamily?.() || [];
        targetIds = family.map((e: any) => e.id);
        appliedTo = `família toda (${family.length})`;
    }
    if (!targetIds.length) {
        showToast('Nenhum elemento na família ativa', 'warning');
        return;
    }
    // Detach gizmo antes de rebuild para evitar "attached 3D object must be a part of the scene graph"
    // (TransformControls fica apontando para mesh que acabou de ser removido do scene graph).
    let gizmoElementId: any = null;
    try {
        const { getGizmoElementId, detachGizmo, attachGizmo } = await import('../../utils/editing/gizmoController.js' as string);
        gizmoElementId = getGizmoElementId?.();
        if (gizmoElementId && targetIds.includes(gizmoElementId)) {
            detachGizmo?.();
        }
        // Reattach no fim via closure (depois do for loop abaixo)
        (handleEquipmentSetModelVariant as any)._reattachGizmo = () => {
            if (!gizmoElementId)
                return;
            const newMesh = getMeshByElementId?.(gizmoElementId);
            if (newMesh)
                attachGizmo?.(gizmoElementId, newMesh);
        };
    }
    catch (err: any) {
        console.warn('[equipmentHud] gizmo detach failed (non-fatal):', err?.message);
    }
    let applied = 0;
    let cleared = 0;
    let lastState = null;
    for (const id of targetIds) {
        const el = getElementById(id);
        if (!el)
            continue;
        if (!el.data)
            el.data = {};
        const isCurrent = el.data.modelVariantId === slug;
        el.data.modelVariantId = isCurrent ? null : slug;
        lastState = el.data.modelVariantId;
        updateElement(id, { data: el.data });
        rebuildElementMesh(id);
        invalidateEquipmentThumb(id);
        if (isCurrent)
            cleared++;
        else
            applied++;
    }
    // Reattach gizmo no novo mesh (após rebuild)
    try {
        (handleEquipmentSetModelVariant as any)._reattachGizmo?.();
    }
    catch (err: any) {
        console.warn('[equipmentHud] gizmo reattach failed:', err?.message);
    }
    const msg = applied
        ? `Modelo aplicado a ${applied} elemento${applied > 1 ? 's' : ''} (${appliedTo}): ${lastState}`
        : `Modelo removido de ${cleared} elemento${cleared > 1 ? 's' : ''}`;
    showToast(msg, 'success');
    _refresh();
}
/**
 * Toggle HQ (high-quality textured variants). Estado GLOBAL em localStorage:
 * quando ativo, picker exibe variants isHq (puxadas do Supabase lazy).
 * Intuitivo: liga/desliga uma vez, vale para todas as famílias.
 */
function handleEquipmentToggleHQ(enabled: any) {
    try {
        localStorage.setItem('ecbyts-equipment-hq-enabled', enabled ? '1' : '0');
    }
    catch (e: any) {
        console.debug('[equipmentHud] toggleHQ-persist:', e?.message || e);
    }
    _refresh();
}
export const equipmentHudHandlers = {
    handleToggleEquipmentHud,
    handleEquipmentCycleFamily,
    handleEquipmentCycleElement,
    handleEquipmentSelectActive,
    handleEquipmentOpenElementById,
    handleEquipmentOpenActiveElement,
    handleEquipmentToggleBatchActive,
    handleEquipmentApplyFamilyFilter,
    handleEquipmentSetColor,
    handleEquipmentSetScale,
    handleEquipmentSetWireframe,
    handleEquipmentAttachAsset,
    handleEquipmentSelectBatchInAnalytics,
    handleEquipmentSetModelVariant,
    handleEquipmentToggleHQ,
};
