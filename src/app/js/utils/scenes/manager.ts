// @ts-check
// Generated from src/app/js/utils/scenes/manager.ts by TS-MIGRATION-001. Do not edit manually.
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
   GERENCIADOR DE CENAS
   ================================================================

   Este modulo gerencia cenas criadas pelo usuario.

   CENA = CONJUNTO DE CONFIGURACOES
   - viewStart/viewEnd: estados de camera
   - campaignsStart/campaignsEnd: campanhas usadas
   - filters: filtros de elementos visiveis

   ================================================================ */
import { getCameraState } from '../scene/controls.js';
import { idbSet, idbGetWithLegacy } from '../storage/idbStore.js';
import { isEphemeral } from '../storage/storageMonitor.js';
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-scenes';
const SCENES_PERSIST_DEBOUNCE_MS = 750;
// ----------------------------------------------------------------
// ESTADO DO MODULO
// ----------------------------------------------------------------
/** @type {Array<any>} */
let scenes: any[] = [];
let sceneCounter = 0;
let _persistTimer: any = null;
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function createId() {
    sceneCounter += 1;
    return `scene-${sceneCounter}`;
}
function normalizeScene(scene: any) {
    return {
        id: scene.id || createId(),
        name: scene.name || `Cena ${sceneCounter}`,
        viewStart: scene.viewStart || null,
        viewEnd: scene.viewEnd || null,
        campaignsStart: Array.isArray(scene.campaignsStart) ? scene.campaignsStart : [],
        campaignsEnd: Array.isArray(scene.campaignsEnd) ? scene.campaignsEnd : [],
        elementVisibility: scene.elementVisibility || {},
    };
}
// ----------------------------------------------------------------
// FUNCOES DE ACESSO
// ----------------------------------------------------------------
export function getAllScenes() {
    return scenes;
}
export function getSceneById(id: any) {
    return scenes.find((scene) => scene.id === id);
}
// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------
export function addScene(data = {}) {
    const scene = normalizeScene(data);
    scenes.push(scene);
    _persist();
    return scene;
}
export function updateScene(id: any, updates: any) {
    const scene = getSceneById(id);
    if (!scene) return null;
    Object.assign(scene, updates);
    scene.campaignsStart = Array.isArray(scene.campaignsStart) ? scene.campaignsStart : [];
    scene.campaignsEnd = Array.isArray(scene.campaignsEnd) ? scene.campaignsEnd : [];
    scene.elementVisibility = scene.elementVisibility || {};
    _persist();
    return scene;
}
export function removeScene(id: any) {
    const index = scenes.findIndex((scene) => scene.id === id);
    if (index === -1) return false;
    scenes.splice(index, 1);
    _persist();
    return true;
}
// ----------------------------------------------------------------
// CAPTURA DE VISTAS
// ----------------------------------------------------------------
export function captureViewStart(sceneId: any) {
    const scene = getSceneById(sceneId);
    if (!scene) return null;
    scene.viewStart = getCameraState();
    return scene.viewStart;
}
export function captureViewEnd(sceneId: any) {
    const scene = getSceneById(sceneId);
    if (!scene) return null;
    scene.viewEnd = getCameraState();
    return scene.viewEnd;
}
// ----------------------------------------------------------------
// SERIALIZACAO
// ----------------------------------------------------------------
export function exportScenes() {
    return scenes.map((scene) => ({ ...scene }));
}
export function importScenes(imported: any) {
    if (!Array.isArray(imported)) {
        scenes = [];
        sceneCounter = 0;
        _persist();
        return;
    }
    scenes = imported.map((scene) => normalizeScene(scene));
    sceneCounter = scenes.length;
    _persist();
}
export function clearScenes() {
    scenes = [];
    sceneCounter = 0;
    _persist();
}
// ----------------------------------------------------------------
// PERSISTENCIA IDB
// ----------------------------------------------------------------
/**
 * Restaura cenas do IDB. Chamado no boot antes do sequencer refreshItems().
 * Garante que scenes estao disponiveis quando o sequencer filtra keyframes orfaos.
 */
export async function initScenes() {
    try {
        const data = await idbGetWithLegacy(STORAGE_KEY);
        if (!data || !Array.isArray(data.scenes)) return;
        // Nao sobrescreve se ja ha cenas carregadas via ECO1 import
        if (scenes.length > 0) return;
        scenes = data.scenes.map((s: any) => normalizeScene(s));
        sceneCounter = Math.max(sceneCounter, scenes.length);
    } catch (e: any) {
        console.debug('[scenes/manager] loadStored:', /** @type {any} */ (e)?.message || e);
        /* corrupted — ignore */
    }
}
async function _persist() {
    if (isEphemeral()) return;
    if (_persistTimer) {
        clearTimeout(_persistTimer);
    }
    _persistTimer = setTimeout(_flushPersist, SCENES_PERSIST_DEBOUNCE_MS);
}

async function _flushPersist() {
    _persistTimer = null;
    await idbSet(STORAGE_KEY, { scenes: scenes.map((s) => ({ ...s })) });
}
//# sourceMappingURL=manager.js.map
