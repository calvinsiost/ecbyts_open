// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   EQUIPMENT THUMBS - auto thumbnail generation from 3D mesh

   2026-04-11 refactor (SPEC_SCENE_LIFECYCLE §S2, audit §D1 multi-renderer):
   Previously created a NEW WebGLRenderer + scene per thumbnail, then called
   renderer.dispose(). Three.js issue #18759 documents that multi-renderer
   dispose doesn't fully release GL resources — event listeners persist via
   WeakMap, WebGL context instances accumulate, and Chrome's 16-context
   limit starts destroying older contexts silently (which is the root cause
   of the "black canvas" symptom reported in the 2026-04-11 session).

   Fix: ONE shared WebGLRenderer lives for the module's lifetime. Each
   thumbnail reuses it — creates a temporary scene, renders, reads buffer,
   and moves on. No renderer churn, no leak.

   This module is still marked as "secondary renderer" and SCENE-OWNER-01
   gate allows it in an explicit allowlist. The long-term plan is to
   move this into SceneLifecycleOwner as an offscreen thumbnail method,
   but that's P3+.
   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { getMeshByElementId } from '../../core/elements/manager.js';
import { runIdleTask } from '../performance/yielding.js';
const THUMB_W = 192;
const THUMB_H = 144;
const _cache = new Map(); // id -> dataURL
const _pending = new Set(); // ids in generation
/**
 * Shared thumbnail renderer - single instance across all thumbnail calls.
 * Lazy-initialized on first request and kept alive until page unload.
 * @type {any}
 */
let _thumbRenderer: any = null;
/**
 * Retorna (ou cria) o renderer compartilhado de thumbnails.
 * Usa um canvas HTML fora do DOM - contexto GL não participa do fluxo
 * principal da cena 3D nem consome slot de canvas no #canvas-container.
 */
function _getThumbRenderer() {
    if (_thumbRenderer)
        return _thumbRenderer;
    // Canvas oculto fora do DOM (não incluído no #canvas-container, não conta
    // para o invariante SCENE-OWNER do lifecycleOwner).
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    canvas.setAttribute('data-scene', 'ecbyts-thumb-offscreen');
    _thumbRenderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        antialias: true,
        // preserveDrawingBuffer: true é necessário AQUI (diferente do renderer
        // principal) porque este renderer não tem loop próprio - renderiza
        // uma vez por thumbnail, e toDataURL precisa do buffer preservado.
        preserveDrawingBuffer: true,
    });
    _thumbRenderer.setPixelRatio(1);
    _thumbRenderer.setSize(THUMB_W, THUMB_H, false);
    return _thumbRenderer;
}
/** @param {any} fn */
function _schedule(fn: any) {
    void runIdleTask(fn, { timeoutMs: 220 });
}
/** @param {any} mesh */
function _cloneForThumb(mesh: any) {
    const cloned = mesh.clone(true);
    cloned.traverse((child: any) => {
        if (!child.material)
            return;
        if (Array.isArray(child.material)) {
            child.material = child.material.map((m: any) => (m?.clone ? m.clone() : m));
            return;
        }
        child.material = child.material.clone ? child.material.clone() : child.material;
    });
    return cloned;
}
/** @param {any} root */
function _disposeThumbClone(root: any) {
    root?.traverse?.((child: any) => {
        if (!child.material)
            return;
        if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m?.dispose?.());
            return;
        }
        child.material.dispose?.();
    });
}
/** @param {any} mesh */
function _renderThumbFromMesh(mesh: any) {
    // Scene temporária - criada e descartada a cada thumbnail, mas SEM novo renderer.
    // O renderer permanece o mesmo (_thumbRenderer) e só recebe uma scene diferente.
    const scene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(3, 4, 5);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0x7f8ea3, 0.7));
    const root = _cloneForThumb(mesh);
    scene.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    const maxSize = Math.max(size.x || 1, size.y || 1, size.z || 1);
    const camera = new THREE.PerspectiveCamera(34, THUMB_W / THUMB_H, 0.1, 1000);
    camera.position.set(maxSize * 1.35, maxSize * 0.9, maxSize * 1.35);
    camera.lookAt(0, 0, 0);
    const renderer = _getThumbRenderer();
    const previousClearColor = renderer.getClearColor(new THREE.Color()).getHex();
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x10141a, 1);
    renderer.render(scene, camera);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    const dataUrl = renderer.domElement.toDataURL('image/jpeg', 0.84);
    // NOTA: antes havia renderer.dispose() aqui. REMOVIDO intencionalmente -
    // o renderer é persistente. Apenas descarta-se a scene temporária (geometry
    // e material do clone) para liberar memória da mesh clonada.
    _disposeThumbClone(root);
    // Scene em si: geometries clonadas NÃO são disposed aqui porque o clone()
    // do three.js compartilha geometry buffers. Material é clonado mas disposed
    // acima. Não há vazamento porque a scene é garbage-collectable após este
    // escopo (nenhum ref externo).
    return dataUrl;
}
/** @param {any} elementId */
export function getEquipmentThumbUrl(elementId: any) {
    return _cache.get(String(elementId || '')) || '';
}
/** @param {any} elementId */
export function invalidateEquipmentThumb(elementId: any) {
    _cache.delete(String(elementId || ''));
}
/**
 * @param {any} element
 * @param {Function} [onReady]
 */
export function requestEquipmentThumb(element: any, onReady: any) {
    const id = String(element?.id || '');
    if (!id)
        return;
    if (_cache.has(id) || _pending.has(id))
        return;
    const mesh = getMeshByElementId(id);
    if (!mesh)
        return;
    _pending.add(id);
    _schedule(() => {
        try {
            const url = _renderThumbFromMesh(mesh);
            if (url) {
                _cache.set(id, url);
                if (typeof onReady === 'function')
                    onReady(id, url);
            }
        }
        catch (err: any) {
            // Fallback: UI continua mostrando badge 3D sem thumbnail
            console.debug('[equipmentThumbs] render failed for', id, /** @type {any} */ (err)?.message || err);
        }
        finally {
            _pending.delete(id);
        }
    });
}
