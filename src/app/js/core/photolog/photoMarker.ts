// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   PHOTO MARKER — 3D Camera Sprites for PhotoLog
   Marcadores 3D de foto no viewport Three.js.

   Segue padrao de core/issues/issueMarker.js:
   - Group injetado via setter em onSceneReady()
   - Map de photoId -> sprite para picker
   - Refresh/remove lifecycle
   ================================================================ */
import { createTHREEProxy } from '../three-lazy.js';
const THREE: any = createTHREEProxy();
import { getElementById } from '../elements/manager.js';
import { getAllPhotos } from './manager.js';
const MARKER_COLOR = 0x64b5f6; // light blue
const MARKER_SIZE = 1.2;
const Y_OFFSET = 2; // metros acima do elemento
/** @type {any} */
let _photoMarkersGroup: any = null;
/** @type {Map<string, any>} photoId -> sprite */
const _markers = new Map();
let _visible = true;
/** @type {any} */
let _texture: any = null;
/**
 * Inject Three.js group - call from onSceneReady() in main.js.
 * @param {any} group
 */
export function setPhotoMarkersGroup(group: any) {
    _photoMarkersGroup = group;
    // Auto-limpa os marcadores 3D ao trocar de modelo. ecbt:elementsCleared é
    // disparado por clearAllElements no início de cada applyModel; refreshPhotoMarkers
    // só renderiza fotos cujo elemento existe → marcadores órfãos do modelo anterior
    // somem. Registrado AQUI (setPhotoMarkersGroup roda no scene-bootstrap, APÓS o
    // applyModel inicial) → não afeta o boot. Sem isto, marcadores de foto ficavam
    // fantasma (auditoria Calvin 2026-06-02). Espelha labels/voxel/issues.
    if (!_photoAutoClearWired && typeof window !== 'undefined') {
        _photoAutoClearWired = true;
        window.addEventListener('ecbt:elementsCleared', () => refreshPhotoMarkers());
    }
}
let _photoAutoClearWired = false;
/**
 * Returns current visibility state.
 * @returns {boolean}
 */
export function getPhotoMarkersVisible() {
    return _visible;
}
/**
 * Toggle photo markers visibility.
 * @param {boolean} visible
 */
export function setPhotoMarkersVisible(visible: any) {
    _visible = visible;
    if (_photoMarkersGroup) {
        _photoMarkersGroup.visible = visible;
    }
}
/**
 * Creates a photo marker sprite at element position.
 * @param {any} photo - PhotoEntry
 * @param {any} position - world position
 */
export function createPhotoMarker(photo: any, position: any) {
    if (!_photoMarkersGroup)
        return;
    if (_markers.has(photo.id))
        return;
    if (!_texture)
        _texture = _createCameraTexture();
    const material = new THREE.SpriteMaterial({
        map: _texture,
        color: MARKER_COLOR,
        transparent: true,
        depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(MARKER_SIZE, MARKER_SIZE, 1);
    sprite.position.copy(position);
    sprite.position.y += Y_OFFSET;
    sprite.userData.photoId = photo.id;
    sprite.userData.elementId = photo.elementId;
    sprite.userData.type = 'photoMarker';
    _photoMarkersGroup.add(sprite);
    _markers.set(photo.id, sprite);
}
/**
 * Rebuild all markers from current element photos.
 * Remove existentes e recria a partir dos dados atuais.
 */
export function refreshPhotoMarkers() {
    if (!_photoMarkersGroup)
        return;
    // Remove all existing
    for (const [, sprite] of _markers) {
        _photoMarkersGroup.remove(sprite);
        sprite.material.dispose();
    }
    _markers.clear();
    // Rebuild
    const photos = getAllPhotos();
    for (const photo of photos) {
        const el = getElementById(photo.elementId);
        if (!el)
            continue;
        // Posicao do elemento - usa data.x/y/z ou mesh position
        const pos = _getElementPosition(el);
        if (pos)
            createPhotoMarker(photo, pos);
    }
}
/**
 * Remove single photo marker.
 * @param {string} photoId
 */
export function removePhotoMarker(photoId: any) {
    const sprite = _markers.get(photoId);
    if (!sprite || !_photoMarkersGroup)
        return;
    _photoMarkersGroup.remove(sprite);
    sprite.material.dispose();
    _markers.delete(photoId);
}
/**
 * Extrai posicao 3D de um elemento a partir dos dados ou mesh.
 * @param {any} el - Element
 * @returns {any}
 */
function _getElementPosition(el: any) {
    // Tenta posicao do data (se disponivel)
    if (el.data?.x != null && el.data?.y != null) {
        return new THREE.Vector3(el.data.x, el.data.y || 0, el.data.z || 0);
    }
    // Fallback: pega posicao do mesh via meshMap (window bridge)
    try {
        const getMesh = window._ecbtGetMesh;
        if (getMesh) {
            const mesh = getMesh(el.id);
            if (mesh)
                return mesh.position.clone();
        }
    }
    catch (e: any) {
        console.debug('[photoMarker] getMesh:', /** @type {any} */ (e)?.message || e);
        /* sem mesh */
    }
    return null;
}
/**
 * Cria textura de camera icon via canvas.
 * @returns {any}
 */
function _createCameraTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = (canvas.getContext('2d')) as CanvasRenderingContext2D;
    // Fundo circular semi-transparente
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(100, 181, 246, 0.6)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Camera icon simples (retangulo + lente)
    ctx.fillStyle = '#fff';
    ctx.fillRect(16, 22, 32, 22); // corpo
    ctx.beginPath();
    ctx.arc(32, 33, 8, 0, Math.PI * 2); // lente
    ctx.fillStyle = '#333';
    ctx.fill();
    ctx.fillStyle = '#64b5f6';
    ctx.beginPath();
    ctx.arc(32, 33, 5, 0, Math.PI * 2);
    ctx.fill();
    // Flash
    ctx.fillStyle = '#fff';
    ctx.fillRect(22, 18, 8, 6);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
}
