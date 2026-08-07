// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   HANDLER — Send a Health Alert row into the 3D scene as a `post`
   element (placa / sticky-note billboard).

   Glue layer:
     UI (healthAlertsWidget) → this handler → buildPostFromHealthAlertItem
       → addElement('post', ...) → postRenderer (CSS2DRenderer label)

   Pure business logic lives in core/post/postCreator.js so this stays
   thin and easy to test through the existing handler registry.
   ================================================================ */
import { buildPostFromHealthAlertItem } from '../../core/post/postCreator.js';
/**
 * Lazy import of addElement so this file remains importable in tests
 * without booting the full elements manager.
 */
async function _resolveAddElement() {
    try {
        const mod = await import('../../core/elements/manager.js' as string);
        if (typeof mod.addElement === 'function') return mod.addElement;
    } catch (err: any) {
        console.debug('[post:resolveAddElement]', err?.message || err);
    }
    return null;
}
function _toast(message: any) {
    try {
        const w = globalThis.window;
        if (w && typeof w.showToast === 'function') {
            w.showToast(message);
            return;
        }
        if (w && typeof w.handleShowToast === 'function') {
            w.handleShowToast(message);
            return;
        }
    } catch (err: any) {
        console.debug('[post:toast]', err?.message || err);
    }
}
/**
 * Resolve world-position from the linked element. Calvin 2026-05-15:
 * post deve ficar EXATAMENTE no mesmo x/y/z do elemento (sem offset).
 *
 * Cascata de fontes (mais autoritativa primeiro):
 * 1. getElementById(linkedId).data.position — fonte canônica em manager.js
 * 2. window.__ecbtGetMeshPosition / window.getMeshPosition — mesh runtime
 */
async function _positionFromLinkedElement(linkedElementId: any) {
    if (!linkedElementId || typeof linkedElementId !== 'string') return null;
    // Fonte canônica: elements manager
    try {
        const mgrMod = await import('../../core/elements/manager.js' as string);
        const el = mgrMod.getElementById ? mgrMod.getElementById(linkedElementId) : null;
        const p = el?.data?.position;
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
            return { x: p.x, y: p.y, z: p.z };
        }
    } catch (err: any) {
        console.debug('[post:resolvePos:manager]', err?.message || err);
    }
    // Fallback: mesh world position
    try {
        const w = globalThis.window;
        const getter = w && (w.__ecbtGetMeshPosition || w.getMeshPosition);
        if (typeof getter === 'function') {
            const p = getter(linkedElementId);
            if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
                return { x: p.x, y: p.y, z: p.z };
            }
        }
    } catch (err: any) {
        console.debug('[post:resolvePos:mesh]', err?.message || err);
    }
    return null;
}
/**
 * Convert a Health Alert row into a `post` element and inject it into
 * the active scene. Shows a toast on success/failure.
 */
export async function handleCreatePostFromHealthAlert(args: any) {
    if (!args || typeof args !== 'object') {
        _toast('Health alert inválido');
        return { ok: false, error: 'invalid-args' };
    }
    const { alertItem, linkedElementId, position } = args;
    if (!alertItem || typeof alertItem !== 'object') {
        _toast('Sem dados do alerta');
        return { ok: false, error: 'no-alert-item' };
    }
    const linked = linkedElementId || alertItem.elementId || null;
    const resolvedPos = position || (await _positionFromLinkedElement(linked));
    const spec = buildPostFromHealthAlertItem(alertItem, {
        linkedElementId: linked,
        position: resolvedPos,
    });
    const addElement = await _resolveAddElement();
    if (!addElement) {
        _toast('Não foi possível adicionar a placa ao modelo (manager indisponível)');
        return { ok: false, error: 'no-manager' };
    }
    try {
        addElement(spec.family, spec.id, spec.name, spec.data, { label: spec.label });
    } catch (err: any) {
        const msg = err?.message || String(err);
        _toast(`Falha ao criar placa: ${msg}`);
        return { ok: false, error: msg };
    }
    // Notify renderer (lazy import — never fails this handler)
    try {
        const renderer = await import('../ui/postRenderer.js' as string);
        if (renderer && typeof renderer.attachPostLabel === 'function') {
            renderer.attachPostLabel(spec);
        }
    } catch (err: any) {
        console.debug('[post:attachLabel]', err?.message || err);
    }
    _toast('Placa adicionada ao modelo');
    return { ok: true, elementId: spec.id };
}
/**
 * Registry-style export — used by utils/handlers/index.js (if needed)
 * to expose the function on window.
 */
export const postHandlers = { handleCreatePostFromHealthAlert };
