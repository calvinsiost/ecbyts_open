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
   SCENE HANDLERS — 3D view snapshot management
   Handlers para gerenciamento de cenas (snapshots de visualizacao)

   Uma "cena" salva uma configuracao de visualizacao:
   - Posicao da camera
   - Quais campanhas estao visiveis
   - Quais elementos estao filtrados
   Util para apresentacoes ou comparacoes temporais.
   ================================================================ */
import { addScene, updateScene, removeScene, captureViewStart, captureViewEnd, getSceneById, } from '../scenes/manager.js';
import { setCameraState } from '../scene/controls.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { updateScenesList } from '../ui/lists.js';
// ----------------------------------------------------------------
// SCENE CRUD
// Criar, editar e remover cenas de visualizacao.
// ----------------------------------------------------------------
/**
 * Add a new empty scene.
 * Cria uma nova cena de visualizacao vazia.
 */
export function handleAddScene() {
    addScene({});
    updateScenesList();
}
/**
 * Update a field in a scene.
 * Atualiza um campo da cena (nome, descricao, etc.)
 *
 * @param {string} sceneId - Scene ID
 * @param {string} field - Field to update
 * @param {*} value - New value
 */
export function handleSceneChange(sceneId: string, field: string, value: any) {
    updateScene(sceneId, { [field]: value });
    updateScenesList();
}
/**
 * Capture the current camera view as the scene's start position.
 * Salva a posicao atual da camera como ponto inicial da cena.
 *
 * @param {string} sceneId - Scene ID
 */
export function handleCaptureViewStart(sceneId: string) {
    captureViewStart(sceneId);
    showToast(t('viewCaptured'), 'success');
}
/**
 * Capture the current camera view as the scene's end position.
 * Salva a posicao atual da camera como ponto final da cena.
 *
 * @param {string} sceneId - Scene ID
 */
export function handleCaptureViewEnd(sceneId: string) {
    captureViewEnd(sceneId);
    showToast(t('viewCaptured'), 'success');
}
/**
 * Apply a scene's start view to the camera.
 * Move a camera para a posicao inicial salva na cena.
 *
 * @param {string} sceneId - Scene ID
 */
export function handleApplyViewStart(sceneId: string) {
    const scene = getSceneById(sceneId);
    if (scene?.viewStart)
        setCameraState(scene.viewStart);
}
/**
 * Apply a scene's end view to the camera.
 * Move a camera para a posicao final salva na cena.
 *
 * @param {string} sceneId - Scene ID
 */
export function handleApplyViewEnd(sceneId: string) {
    const scene = getSceneById(sceneId);
    if (scene?.viewEnd)
        setCameraState(scene.viewEnd);
}
/**
 * Update which campaigns are associated with a scene.
 * Define quais campanhas pertencem a uma cena (multi-select).
 *
 * @param {string} sceneId - Scene ID
 * @param {string} field - Field name (e.g. 'campaignIds')
 * @param {HTMLSelectElement} selectElement - The multi-select element
 */
export function handleSceneCampaigns(sceneId: string, field: string, selectElement: HTMLSelectElement) {
    const values = Array.from(selectElement.selectedOptions).map((opt: HTMLOptionElement) => opt.value);
    updateScene(sceneId, { [field]: values });
}
/**
 * Set visibility of a specific element within a scene.
 * Controla quais elementos aparecem em cada cena.
 *
 * @param {string} sceneId - Scene ID
 * @param {string} elementId - Element ID
 * @param {boolean} visible - Visibility state
 */
export function handleSceneElementFilter(sceneId: string, elementId: string, visible: boolean) {
    const scene = getSceneById(sceneId);
    const elementVisibility = { ...(scene?.elementVisibility || {}) };
    elementVisibility[elementId] = visible;
    updateScene(sceneId, { elementVisibility });
}
/**
 * Remove a scene.
 * Remove uma cena de visualizacao.
 *
 * @param {string} sceneId - Scene ID to remove
 */
export function handleRemoveScene(sceneId: string) {
    removeScene(sceneId);
    updateScenesList();
}
/**
 * All scene handler functions exposed to HTML via window.
 * Objeto com todas as funcoes de cena para o HTML.
 */
export const sceneHandlers = {
    handleAddScene,
    handleSceneChange,
    handleCaptureViewStart,
    handleCaptureViewEnd,
    handleApplyViewStart,
    handleApplyViewEnd,
    handleSceneCampaigns,
    handleSceneElementFilter,
    handleRemoveScene,
};
//# sourceMappingURL=scenes.js.map
