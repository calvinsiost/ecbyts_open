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
   VIZ SETTINGS HANDLERS — Window.* functions for HTML onclick
   ================================================================

   Handlers para controles da barra de visualizacao 3D e
   modal de clip planes (multiplos planos de corte).

   ================================================================ */
import { getVizSettingsConfig, getActiveSettings, getUserPresets, setVizSettingsVisible, setVizSettingsCollapsed, applyPreset, changeSetting, saveUserPreset, deleteUserPreset, resetToDefault, addClipPlane, updateClipPlane, removeClipPlane, duplicateClipPlane, } from '../vizSettings/manager.js';
import { renderVizSettings, setVizSettingsBarVisible } from '../vizSettings/renderer.js';
import { getAllElements } from '../../core/elements/manager.js';
import { showToast as _showToastImpl } from '../ui/toast.js';
const showToast: any = _showToastImpl;
import { getIcon } from '../ui/icons.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { asyncConfirm } from '../ui/asyncDialogs.js';
// ----------------------------------------------------------------
// HANDLERS - Viz Settings Bar
// ----------------------------------------------------------------
/**
 * Toggle viz settings bar visibility.
 */
function handleToggleVizSettings() {
    const config = getVizSettingsConfig();
    const newVisible = !config.visible;
    setVizSettingsVisible(newVisible);
    setVizSettingsBarVisible(newVisible);
    if (newVisible)
        renderVizSettings();
}
/**
 * Toggle collapsed state (header only vs full controls).
 */
function handleToggleVizSettingsCollapsed() {
    const config = getVizSettingsConfig();
    setVizSettingsCollapsed(!config.collapsed);
    renderVizSettings();
}
/**
 * Apply a preset (builtin or user).
 * @param {string} presetId
 */
function handleApplyVizPreset(presetId: any) {
    const success = applyPreset(presetId);
    if (success) {
        renderVizSettings();
    }
}
/**
 * Change a single viz setting value.
 * @param {string} key
 * @param {*} value
 */
function handleVizSettingChange(key: any, value: any) {
    changeSetting(key, value);
    renderVizSettings();
}
/**
 * Save current settings as a user preset.
 * Nome gerado automaticamente - sem prompt() bloqueante.
 */
function handleSaveVizPreset() {
    const n = (getUserPresets?.() || []).length + 1;
    const name = `Preset ${n}`;
    saveUserPreset(name);
    renderVizSettings();
    showToast(t('presetSaved') || 'Preset saved', 'success');
}
/**
 * Delete a user preset.
 * @param {string} presetId
 */
function handleDeleteVizPreset(presetId: any) {
    deleteUserPreset(presetId);
    renderVizSettings();
    showToast(t('presetDeleted') || 'Preset deleted', 'info');
}
/**
 * Reset all settings to the default preset.
 */
async function handleResetVizSettings() {
    // Ação destrutiva: confirmar antes de descartar os ajustes atuais.
    // asyncConfirm (não confirm nativo — regra "sem dialogs nativos").
    const confirmed = await asyncConfirm('Restaurar as configurações de visualização para o padrão?', {
        confirmLabel: 'Restaurar',
        danger: true,
    });
    if (!confirmed)
        return;
    resetToDefault();
    renderVizSettings();
}
// ----------------------------------------------------------------
// HANDLERS - Clip Planes Modal
// ----------------------------------------------------------------
function handleOpenClipPlanes() {
    const modal = document.getElementById('clipplanes-modal');
    if (!modal)
        return;
    modal.classList.add('visible');
    _renderClipPlanesModal();
}
function handleCloseClipPlanes() {
    const modal = document.getElementById('clipplanes-modal');
    if (modal)
        modal.classList.remove('visible');
}
function handleAddClipPlane() {
    addClipPlane();
    _renderClipPlanesModal();
    renderVizSettings();
}
/** @param {any} id */
function handleRemoveClipPlane(id: any) {
    removeClipPlane(id);
    _renderClipPlanesModal();
    renderVizSettings();
    showToast(t('clipPlaneRemoved') || 'Clip plane removed', 'info');
}
/** @param {any} id */
function handleDuplicateClipPlane(id: any) {
    duplicateClipPlane(id);
    _renderClipPlanesModal();
    renderVizSettings();
}
/** @param {any} id */
function handleToggleClipPlane(id: any) {
    const s = getActiveSettings();
    const plane = s.clipPlanes.find(
    /** @param {any} field */
    (p: any) => p.id === id);
    if (plane) {
        updateClipPlane(id, { enabled: !plane.enabled });
        _renderClipPlanesModal();
        renderVizSettings();
    }
}
/** @param {any} field @param {any} field @param {any} field */
function handleUpdateClipPlaneField(id: any, field: any, value: any) {
    const parsed = ['height', 'angle'].includes(field)
        ? Number(value)
        : ['flip', 'enabled'].includes(field)
            ? !!value
            : value;
    updateClipPlane(id, { [field]: parsed });
    // Re-render apenas se nao for um slider (evita flicker durante drag)
    if (!['height', 'angle'].includes(field)) {
        _renderClipPlanesModal();
    }
}
/** @param {any} id @param {any} scope */
function handleSetClipPlaneScope(id: any, scope: any) {
    /** @type {any} */
    const changes: any = { scope };
    if (scope === 'all')
        changes.elementIds = [];
    updateClipPlane(id, changes);
    _renderClipPlanesModal();
}
/** @param {any} planeId @param {any} elementId */
function handleToggleClipPlaneElement(planeId: any, elementId: any) {
    const s = getActiveSettings();
    const plane = s.clipPlanes.find(
    /** @param {any} p */
    (p: any) => p.id === planeId);
    if (!plane)
        return;
    const ids = [...plane.elementIds];
    const idx = ids.indexOf(elementId);
    if (idx === -1)
        ids.push(elementId);
    else
        ids.splice(idx, 1);
    updateClipPlane(planeId, { elementIds: ids });
    _renderClipPlanesModal();
}
// ----------------------------------------------------------------
// MODAL RENDERING
// ----------------------------------------------------------------
/**
 * Renderiza o conteudo do modal de clip planes.
 * Lista de cards, cada um com controles de posicao, angulo, escopo.
 */
function _renderClipPlanesModal() {
    const body = document.getElementById('clipplanes-modal-body');
    if (!body)
        return;
    const settings = getActiveSettings();
    const planes = settings.clipPlanes || [];
    const allElements = getAllElements();
    if (planes.length === 0) {
        body.innerHTML = `<div class="clipplanes-empty">
            <p>${t('clipPlanesEmpty') || 'No clip planes yet. Add one to slice the 3D scene.'}</p>
        </div>`;
        return;
    }
    body.innerHTML = planes
        .map(
        /** @param {any} field */
        (plane: any) => {
        const scopeAll = plane.scope === 'all' || !plane.scope;
        const disabledClass = plane.enabled ? '' : 'clipplane-disabled';
        return `<div class="clipplane-item ${disabledClass}" data-id="${plane.id}">
            <div class="clipplane-header">
                <input data-field-meta="true" data-field-meta-key="auto-pos:vizSettings:input:L228" type="text" class="clipplane-name" value="${escapeHtml(plane.name || '')}"
                    data-cc-call-change="handleUpdateClipPlaneField|s:${encodeURIComponent(`${plane.id}`)}|s:name|v"
                    placeholder="${t('clipPlaneName') || 'Plane name'}">
                <div class="clipplane-actions">
                    <button type="button" data-cc-call-click="handleToggleClipPlane|s:${encodeURIComponent(`${plane.id}`)}" title="${plane.enabled ? 'Disable' : 'Enable'}">
                        ${getIcon(plane.enabled ? 'eye' : 'eye-off', { size: '14px' })}
                    </button>
                    <button type="button" data-cc-call-click="handleDuplicateClipPlane|s:${encodeURIComponent(`${plane.id}`)}" title="Duplicate">
                        ${getIcon('copy', { size: '14px' })}
                    </button>
                    <button type="button" class="btn-danger" data-cc-call-click="handleRemoveClipPlane|s:${encodeURIComponent(`${plane.id}`)}" title="Remove">
                        ${getIcon('trash-2', { size: '14px' })}
                    </button>
                </div>
            </div>
            <div class="clipplane-body">
                <div class="clipplane-controls">
                    ${_renderClipSlider(plane.id, 'height', t('clipHeight') || 'Depth', plane.height, -100, 100, 1)}
                    ${_renderClipSlider(plane.id, 'angle', t('clipAngle') || 'Angle', plane.angle, 0, 360, 5)}
                    <div class="clipplane-toggle">
                        <label class="viz-toggle-label">${t('clipFlip') || 'Flip'}</label>
                        <label class="viz-toggle-switch">
                            <input data-field-meta="true" data-field-meta-key="auto-pos:vizSettings:input:L250" type="checkbox" ${plane.flip ? 'checked' : ''}
                                data-cc-call-change="handleUpdateClipPlaneField|s:${encodeURIComponent(`${plane.id}`)}|s:flip|c">
                            <span class="viz-toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="clipplane-scope">
                    <label class="clipplane-scope-label">${t('clipScope') || 'Scope'}:</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:vizSettings:select:L258" class="clipplane-scope-select" data-cc-call-change="handleSetClipPlaneScope|s:${encodeURIComponent(`${plane.id}`)}|v">
                        <option value="all" ${scopeAll ? 'selected' : ''}>${t('clipScopeAll') || 'All elements'}</option>
                        <option value="elements" ${!scopeAll ? 'selected' : ''}>${t('clipScopeElements') || 'Specific elements...'}</option>
                    </select>
                </div>
                ${!scopeAll ? _renderElementPicker(plane, allElements) : ''}
            </div>
        </div>`;
    })
        .join('');
}
/**
 * Renderiza um slider inline para o clip plane modal.
 * @param {any} field
 * @param {any} field
 * @param {any} field
 * @param {any} field
 * @param {any} field
 * @param {any} field
 * @param {any} field
 */
function _renderClipSlider(planeId: any, field: any, label: any, value: any, min: any, max: any, step: any) {
    const displayValue = value % 1 === 0 ? value : value.toFixed(1);
    return `<div class="clipplane-slider">
        <label class="viz-slider-label">${label}</label>
        <input data-field-meta="true" data-field-meta-key="auto-pos:vizSettings:input:L277" type="range" min="${min}" max="${max}" step="${step}" value="${value}"
            data-cc-call-input="handleUpdateClipPlaneField|s:${encodeURIComponent(`${planeId}`)}|s:${encodeURIComponent(`${field}`)}|pf" data-cc-echo-next="1">
        <span class="viz-slider-value">${displayValue}</span>
    </div>`;
}
/**
 * Renderiza o picker de elementos para escopo per-element.
 */
/** @param {any} plane @param {any[]} allElements */
function _renderElementPicker(plane: any, allElements: any[]) {
    if (allElements.length === 0) {
        return '<div class="clipplane-picker-empty">No elements in model</div>';
    }
    const checks = allElements
        .map(
        /** @param {any} el */
        (el: any) => {
        const checked = (plane.elementIds || []).includes(el.id);
        return `<label class="clipplane-el-check ${checked ? 'clipplane-el-active' : ''}">
            <input data-field-meta="true" data-field-meta-key="auto-pos:vizSettings:input:L294" type="checkbox" ${checked ? 'checked' : ''}
                data-cc-call-change="handleToggleClipPlaneElement|s:${encodeURIComponent(`${plane.id}`)}|s:${encodeURIComponent(`${el.id}`)}">
            <span>${escapeHtml(el.name || el.id)}</span>
            <small>(${el.family})</small>
        </label>`;
    })
        .join('');
    return `<div class="clipplane-element-picker">${checks}</div>`;
}
// ----------------------------------------------------------------
// VIZ QUICK POPUP - atalho no Scene HUD
// ----------------------------------------------------------------
/** @type {any} */
let _vqpCloseHandler: any = null;
/**
 * @param {any} el
 * @returns {HTMLInputElement}
 */
function _asHtmlInput(el: any): HTMLInputElement {
    return el as HTMLInputElement;
}
/**
 * Abre/fecha o popup rapido de viz settings.
 * @param {Event} e
 */
function handleOpenVizQuickPopup(e: any) {
    e?.stopPropagation();
    const popup = document.getElementById('viz-quick-popup');
    if (!popup)
        return;
    if (!popup.classList.contains('hidden')) {
        _closeVizQuickPopup();
        return;
    }
    _syncVizQuickPopupState();
    popup.classList.remove('hidden');
    setTimeout(() => {
        _vqpCloseHandler = (
        /** @param {any} value */
        (ev: any) => {
            if (!popup.contains(ev.target) && !ev.target.closest('#viz-quick-toggle-btn')) {
                _closeVizQuickPopup();
            }
        });
        document.addEventListener('pointerdown', _vqpCloseHandler);
    }, 0);
}
function _closeVizQuickPopup() {
    const popup = document.getElementById('viz-quick-popup');
    if (popup)
        popup.classList.add('hidden');
    if (_vqpCloseHandler) {
        document.removeEventListener('pointerdown', _vqpCloseHandler);
        _vqpCloseHandler = null;
    }
}
/**
 * Aplica exagero vertical via popup rapido.
 * @param {number} value
 */
function handleVizQuickExaggeration(value: any) {
    changeSetting('verticalExaggeration', value);
    const slider = document.getElementById('vqp-vert-slider');
    const display = document.getElementById('vqp-vert-value');
    if (slider) {
        const sliderInput = _asHtmlInput(slider);
        sliderInput.value = String(value);
    }
    if (display)
        display.textContent = value.toFixed(1) + 'x';
    // Highlight botao de preset que bate com o valor
    document.querySelectorAll('#viz-quick-popup [data-exag]').forEach(
    /** @param {any} presetId */
    (btn: any) => {
        btn.classList.toggle('active', parseFloat(btn.dataset.exag) === value);
    });
    renderVizSettings();
}
/**
 * Aplica um preset via popup rapido.
 * @param {string} presetId
 */
function handleVizQuickPreset(presetId: any) {
    applyPreset(presetId);
    renderVizSettings();
    _syncVizQuickPopupState();
}
/**
 * Toggle wireframe/grid/shadows via popup rapido.
 * @param {string} key
 */
function handleVizQuickToggle(key: any) {
    const s = getActiveSettings();
    changeSetting(key, !s[key]);
    renderVizSettings();
    _syncVizQuickPopupState();
}
/**
 * Abre barra completa de viz settings e fecha popup.
 */
function handleVizQuickOpenFull() {
    _closeVizQuickPopup();
    const config = getVizSettingsConfig();
    if (!config.visible) {
        handleToggleVizSettings();
    }
}
/**
 * Sincroniza controles do popup com o estado atual do vizSettings.
 */
function _syncVizQuickPopupState() {
    const s = getActiveSettings();
    const config = getVizSettingsConfig();
    // Slider VE
    const slider = document.getElementById('vqp-vert-slider');
    const display = document.getElementById('vqp-vert-value');
    if (slider) {
        const sliderInput = _asHtmlInput(slider);
        sliderInput.value = String(s.verticalExaggeration);
    }
    if (display)
        display.textContent = s.verticalExaggeration.toFixed(1) + 'x';
    // Botoes de exagero rapido
    document.querySelectorAll('#viz-quick-popup [data-exag]').forEach(
    /** @param {any} tierName */
    (btn: any) => {
        btn.classList.toggle('active', parseFloat(btn.dataset.exag) === s.verticalExaggeration);
    });
    // Presets
    document.querySelectorAll('#viz-quick-popup [data-preset]').forEach(
    /** @param {any} tierName */
    (btn: any) => {
        btn.classList.toggle('active', btn.dataset.preset === config.activePreset);
    });
    // Toggles
    const toggleMap = { 'vqp-wireframe': 'wireframe', 'vqp-grid': 'grid', 'vqp-shadows': 'shadows' };
    for (const [id, key] of Object.entries(toggleMap)) {
        const btn = document.getElementById(id);
        if (btn)
            btn.classList.toggle('active', !!s[key]);
    }
}
// ----------------------------------------------------------------
// QUALITY TIERS
// ----------------------------------------------------------------
/**
 * Aplica um tier de qualidade ao renderer (Low/Medium/High).
 * @param {string} tierName - 'LOW' | 'MEDIUM' | 'HIGH'
 */
function handleSetQualityTier(tierName: any) {
    import('../../utils/scene/setup.js').then(({ applyQualityTier }) => {
        applyQualityTier(tierName);
    }).catch((e: any) => console.debug('[vizSettings:lazy-scene-setup:silent-catch]', e?.message || e));
}
// ----------------------------------------------------------------
// EXPORT
// ----------------------------------------------------------------
export const vizSettingsHandlers = {
    handleToggleVizSettings,
    handleToggleVizSettingsCollapsed,
    handleApplyVizPreset,
    handleVizSettingChange,
    handleSaveVizPreset,
    handleDeleteVizPreset,
    handleResetVizSettings,
    handleOpenClipPlanes,
    handleCloseClipPlanes,
    handleAddClipPlane,
    handleRemoveClipPlane,
    handleDuplicateClipPlane,
    handleToggleClipPlane,
    handleUpdateClipPlaneField,
    handleSetClipPlaneScope,
    handleToggleClipPlaneElement,
    handleSetQualityTier,
    handleOpenVizQuickPopup,
    handleVizQuickExaggeration,
    handleVizQuickPreset,
    handleVizQuickToggle,
    handleVizQuickOpenFull,
};
//# sourceMappingURL=vizSettings.js.map
