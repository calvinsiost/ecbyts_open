// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   DATA STUDIO MODEL BROWSER — Multi-model loader sidebar
   Navegador de modelos — lista e carrega modelos do Supabase

   Reutiliza loadModelsFromCloud() / loadModelFromCloud() de cloud/manager.js.
   Max 5 modelos simultaneos no SQLite.
   ================================================================ */
import { getLoadedModels, loadCloudModel, unloadModel } from './sqlEngine.js';
import { refreshSchema } from './schemaPanel.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
const MAX_MODELS = 5;
/** @type {HTMLElement|null} */
let _container: any = null;
/**
 * Initialize model browser in the given container.
 * @param {HTMLElement} container
 */
export function initModelBrowser(container: any) {
    _container = container || document.querySelector('.ds-models');
    _render();
}
/**
 * Refresh the model browser display.
 */
export function refreshModelBrowser() {
    _render();
}
// --- Internal ---
function _render() {
    if (!_container)
        return;
    const loaded = getLoadedModels();
    const items = loaded
        .map((m: any) => `
        <div class="ds-model-item" data-model-id="${_esc(m.id)}">
            <span class="ds-model-dot ${m.id === 'current' || m.id?.length === 16 ? 'ds-model-dot--current' : 'ds-model-dot--cloud'}"></span>
            <span class="ds-model-name" title="${_esc(m.name)}">${_esc(m.name)}</span>
            ${m.id !== 'current' ? `<button class="ds-model-unload" title="${t('dsUnload') || 'Unload'}">&times;</button>` : ''}
        </div>
    `)
        .join('');
    const canAdd = loaded.length < MAX_MODELS;
    const addBtn = canAdd
        ? `<button class="ds-model-add">${t('dsAddModel') || '+ Add Model'}</button>`
        : `<div class="ds-model-limit">${t('dsMaxModels') || `Max ${MAX_MODELS} models`}</div>`;
    _container.innerHTML = `
        <div class="ds-models-header">${t('dsModels') || 'Models'}</div>
        ${items}
        ${addBtn}
    `;
    // Wire unload buttons
    _container.querySelectorAll('.ds-model-unload').forEach((btn: any) => {
        btn.addEventListener('click', (e: any) => {
            e.stopPropagation();
            const modelId = btn.closest('.ds-model-item')?.dataset.modelId;
            if (modelId) {
                unloadModel(modelId);
                refreshSchema();
                _render();
                showToast(t('dsModelUnloaded') || 'Model unloaded', 'info');
            }
        });
    });
    // Wire add button
    const addEl = _container.querySelector('.ds-model-add');
    if (addEl) {
        addEl.addEventListener('click', () => _showModelPicker());
    }
}
async function _showModelPicker() {
    try {
        const { loadModelsFromCloud } = await import('../cloud/manager.js' as string);
        const models = await loadModelsFromCloud();
        if (!models || !models.length) {
            showToast(t('dsNoCloudModels') || 'No cloud models found. Save a model first.', 'warning');
            return;
        }
        // Filter already loaded
        const loaded = new Set(getLoadedModels().map((m: any) => m.id));
        const available = models.filter((m: any) => !loaded.has(m.id));
        if (!available.length) {
            showToast(t('dsAllModelsLoaded') || 'All available models are already loaded', 'info');
            return;
        }
        // Simple selection via async dialog
        const asyncDialogsMod = await import('../ui/asyncDialogs.js' as string);
        const asyncSelect = asyncDialogsMod.asyncSelect;
        const options = available.map((m: any) => ({
            value: m.id,
            label: `${m.name} (${m.element_count || 0} elements, ${m.campaign_count || 0} campaigns)`
        }));
        const selected = await asyncSelect(t('dsSelectModel') || 'Select a model to load', options);
        if (!selected)
            return;
        showToast(t('dsLoadingModel') || 'Loading model...', 'info');
        const success = await loadCloudModel(selected);
        if (success) {
            refreshSchema();
            _render();
            showToast(t('dsModelLoaded') || 'Model loaded', 'success');
        }
        else {
            showToast(t('dsLoadFailed') || 'Failed to load model', 'error');
        }
    }
    catch (e: any) {
        console.error('[ecbyts:datastudio] Model picker error:', e?.message);
        showToast(t('dsCloudRequired') || 'Cloud models require authentication', 'warning');
    }
}
function _esc(str: any) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
