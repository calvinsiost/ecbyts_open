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
   EDIT NAVIGATION — Quick-switch between elements during edit mode
   ================================================================

   Permite navegar entre elementos editaveis sem sair do modo de edicao.
   Suporta atalhos de teclado ([ e ]) e presets de opacidade para
   foco visual no elemento em edicao.

   ================================================================ */
import { getAllElements, getMeshByElementId } from '../../core/elements/manager.js';
import { isEditing, getEditingElementId, enterEditMode, exitEditMode, hasStrategy, nudgeSelection } from './editManager.js';
// Passo de nudge por tecla, em unidades de mundo. Alt = passo grosso (×10).
const NUDGE_STEP = 1.0;
const NUDGE_STEP_COARSE = 10.0;
// ----------------------------------------------------------------
// OPACITY PRESETS
// ----------------------------------------------------------------
/** @type {Record<string, {selected: number, others: number}>} */
const OPACITY_PRESETS = {
    focus: { selected: 1.0, others: 0.2 },
    dim: { selected: 1.0, others: 0.5 },
    full: { selected: 1.0, others: 1.0 },
};
/** Current active preset name */
let _currentPreset = 'full';
// ----------------------------------------------------------------
// EDITABLE ELEMENT LIST
// ----------------------------------------------------------------
/**
 * Returns sorted list of elements that have an edit strategy.
 * Filtra elementos que possuem estrategia de edicao registrada.
 *
 * @returns {Object[]} Array of editable elements sorted by name
 */
export function getEditableElements() {
    return getAllElements()
        .filter((/** @type {any} */ el) => hasStrategy(el.family))
        .sort((/** @type {any} */ a, /** @type {any} */ b) => (a.name || a.id).localeCompare(b.name || b.id));
}
/**
 * Finds the index of the currently editing element in the editable list.
 *
 * @param {any[]} editables - Sorted editable elements
 * @returns {number} Index or -1 if not found
 */
function _findCurrentIndex(editables: any[]) {
    const currentId = getEditingElementId();
    if (!currentId)
        return -1;
    return editables.findIndex((el: any) => el.id === currentId);
}
// ----------------------------------------------------------------
// NAVIGATION
// ----------------------------------------------------------------
/**
 * Switch to the next editable element, wrapping around.
 * Preserva o modo de edicao ao trocar de elemento.
 *
 * @returns {boolean} true if switch succeeded
 */
export function switchToNext() {
    const editables = getEditableElements();
    if (editables.length === 0)
        return false;
    const idx = _findCurrentIndex(editables);
    const nextIdx = (idx + 1) % editables.length;
    return _switchToIndex(editables, nextIdx);
}
/**
 * Switch to the previous editable element, wrapping around.
 * Preserva o modo de edicao ao trocar de elemento.
 *
 * @returns {boolean} true if switch succeeded
 */
export function switchToPrev() {
    const editables = getEditableElements();
    if (editables.length === 0)
        return false;
    const idx = _findCurrentIndex(editables);
    const prevIdx = idx <= 0 ? editables.length - 1 : idx - 1;
    return _switchToIndex(editables, prevIdx);
}
/**
 * Performs the actual switch to element at given index.
 * @private
 * @param {any[]} editables
 * @param {number} targetIdx
 * @returns {boolean}
 */
function _switchToIndex(editables: any[], targetIdx: number) {
    if (targetIdx < 0 || targetIdx >= editables.length)
        return false;
    const target = editables[targetIdx];
    exitEditMode();
    const ok = enterEditMode(target.id);
    if (ok && _currentPreset !== 'full') {
        _applyOpacityToScene(_currentPreset);
    }
    return ok;
}
// ----------------------------------------------------------------
// OPACITY CONTROL
// ----------------------------------------------------------------
/**
 * Sets opacity preset for scene elements.
 * Controla a visibilidade relativa do elemento editado vs demais.
 *
 * @param {'focus'|'dim'|'full'} preset - Preset name
 * @returns {boolean} true if preset was applied
 */
export function setOpacityPreset(preset: 'focus' | 'dim' | 'full') {
    if (!(OPACITY_PRESETS as Record<string, any>)[preset])
        return false;
    _currentPreset = preset;
    _applyOpacityToScene(preset);
    return true;
}
/**
 * Returns current opacity preset name.
 * @returns {string}
 */
export function getOpacityPreset() {
    return _currentPreset;
}
/**
 * Returns the preset configuration object.
 * @param {string} preset
 * @returns {{selected: number, others: number}|null}
 */
export function getPresetConfig(preset: string) {
    return (OPACITY_PRESETS as Record<string, any>)[preset] || null;
}
/**
 * Applies opacity levels to all meshes based on preset.
 * @private
 * @param {string} preset
 */
function _applyOpacityToScene(preset: string) {
    const config = (OPACITY_PRESETS as Record<string, any>)[preset];
    if (!config)
        return;
    const editingId = getEditingElementId();
    const allElements = getAllElements();
    for (const el of allElements) {
        const mesh = getMeshByElementId(el.id);
        if (!mesh)
            continue;
        const isSelected = el.id === editingId;
        const targetOpacity = isSelected ? config.selected : config.others;
        _setMeshOpacity(mesh, targetOpacity);
    }
}
/**
 * Sets opacity on a mesh and its children.
 * Configura transparencia recursivamente nos materiais do mesh.
 *
 * @private
 * @param {any} mesh - Three.js mesh or group
 * @param {number} opacity - 0.0 to 1.0
 */
function _setMeshOpacity(mesh: any, opacity: number) {
    if (mesh.material) {
        mesh.material.transparent = opacity < 1.0;
        mesh.material.opacity = opacity;
        mesh.material.needsUpdate = true;
    }
    if (mesh.children) {
        for (const child of mesh.children) {
            _setMeshOpacity(child, opacity);
        }
    }
}
/**
 * Resets all element opacities to 1.0 (full).
 * Chamado ao sair do modo de edicao.
 */
export function resetOpacity() {
    _currentPreset = 'full';
    _applyOpacityToScene('full');
}
// ----------------------------------------------------------------
// KEYBOARD SHORTCUTS
// ----------------------------------------------------------------
/** @type {boolean} Whether keyboard shortcuts are active */
let _keyboardActive = false;
/**
 * Activates keyboard shortcuts for edit navigation.
 * [ = previous, ] = next, 1/2/3 = opacity presets
 */
export function enableKeyboardNav() {
    if (_keyboardActive)
        return;
    _keyboardActive = true;
    document.addEventListener('keydown', _handleKeydown);
}
/**
 * Deactivates keyboard shortcuts.
 */
export function disableKeyboardNav() {
    if (!_keyboardActive)
        return;
    _keyboardActive = false;
    document.removeEventListener('keydown', _handleKeydown);
}
/**
 * Keyboard event handler for edit navigation.
 * @private
 * @param {KeyboardEvent} e
 */
function _handleKeydown(e: KeyboardEvent) {
    // Ignora quando estiver em input/textarea/contenteditable
    if (_isInputFocused(e.target))
        return;
    if (!isEditing())
        return;
    // Nudge de vértice/posição por seta (acessibilidade/WCAG). Eixos de mundo:
    // ←/→ = X (leste/oeste), ↑/↓ = Z (norte/sul), Shift+↑/↓ = Y (subir/descer).
    // Alt = passo grosso (×10). Reverte com Ctrl+Z (mesmo snapshot do drag).
    const step = e.altKey ? NUDGE_STEP_COARSE : NUDGE_STEP;
    switch (e.key) {
        case '[':
            e.preventDefault();
            switchToPrev();
            break;
        case ']':
            e.preventDefault();
            switchToNext();
            break;
        case '1':
            e.preventDefault();
            setOpacityPreset('focus');
            break;
        case '2':
            e.preventDefault();
            setOpacityPreset('dim');
            break;
        case '3':
            e.preventDefault();
            setOpacityPreset('full');
            break;
        case 'ArrowLeft':
            e.preventDefault();
            nudgeSelection('x', -step);
            break;
        case 'ArrowRight':
            e.preventDefault();
            nudgeSelection('x', step);
            break;
        case 'ArrowUp':
            e.preventDefault();
            if (e.shiftKey)
                nudgeSelection('y', step);
            else
                nudgeSelection('z', -step);
            break;
        case 'ArrowDown':
            e.preventDefault();
            if (e.shiftKey)
                nudgeSelection('y', -step);
            else
                nudgeSelection('z', step);
            break;
    }
}
/**
 * Checks if an input element has focus.
 * @private
 * @param {any} target
 * @returns {boolean}
 */
function _isInputFocused(target: any) {
    if (!target || !target.tagName)
        return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}
//# sourceMappingURL=editNavigation.js.map
