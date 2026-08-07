// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { getAllSimulationModels, getSimulationModel, buildDefaultParams, addExternalModel, removeExternalModel, } from '../../core/simulation/registry.js';
import { hasSimulationConsent, recordSimulationConsent } from '../../core/simulation/consent.js';
import { executeSimulation } from '../../core/simulation/executor.js';
import { getAllVolumes, getVolume, addVolumeChannel, setVolumeMode, applyVolumeChannelColors, } from '../../core/voxel/manager.js';
import { getAllElements } from '../../core/elements/manager.js';
import { collectObservationPoints } from '../../core/interpolation/manager.js';
import { showToast } from './toast.js';
import { asyncConfirm } from './asyncDialogs.js';
import { t } from '../i18n/translations.js';
import { createDeepLinkShareButton } from '../sharing/_deepLinkShareButton.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
const MODAL_ID = 'simulation-lab-modal';
type AnyRecord = Record<string, any>;
/** @type {{ selectedModelId: string|null, result: any, addingExternal: boolean }} */
const _state: any = {
    selectedModelId: null,
    result: null,
    addingExternal: false,
};
export function openSimulationPanel() {
    let modal = /** @type {any} */ (document.getElementById(MODAL_ID));
    if (!modal) {
        modal = _buildModal();
        document.body.appendChild(modal);
        // DEEP-LINK-TOOLS-001 Sprint 2 — botão Compartilhar no header (DRY:
        // mesmo helper canônico de riskAssessmentPanel + mcaPanel). Payload
        // null porque seleção atual é persistente em IndexedDB do receptor.
        try {
            const header = modal.querySelector('.ecbt-header');
            const close = modal.querySelector('.ecbt-close');
            if (header && close) {
                const shareButton = createDeepLinkShareButton({
                    toolId: 'simulation',
                    getPayload: () => null,
                    toast: showToast,
                });
                header.insertBefore(shareButton, close);
            }
        } catch (e: any) {
            // Defensive — share button é progressive enhancement
            console.debug('[simulationPanel:share-button] wire failed', e?.message || e);
        }
    }
    const models: any[] = getAllSimulationModels() as any[];
    _state.selectedModelId = models[0]?.id || null;
    _state.result = null;
    _state.addingExternal = false;
    _renderModelList();
    _renderModelDetails();
    modal.style.display = 'flex';
    // Sprint 3 (Calvin 2026-06-03): URL = estado em tempo real
    syncDeepLinkUrl('simulation');
}
export function closeSimulationPanel() {
    const modal = /** @type {any} */ (document.getElementById(MODAL_ID));
    if (modal) {
        modal.style.display = 'none';
        clearDeepLinkUrl();
    }
}
function _buildModal() {
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'ecbt-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="sim-dialog">
            <div class="ecbt-header">
                <h3 class="ecbt-title">${t('simLabTitle')}</h3>
                <button class="ecbt-close" type="button" aria-label="Close">&#x2715;</button>
            </div>
            <div class="sim-body">
                <aside id="sim-lab-list" class="sim-sidebar"></aside>
                <section id="sim-lab-detail" class="sim-detail"></section>
            </div>
        </div>
    `;
    modal.querySelector('.ecbt-close')?.addEventListener('click', closeSimulationPanel);
    modal.addEventListener('click', (event: any) => {
        if (event.target === modal)
            closeSimulationPanel();
    });
    return modal;
}
function _renderModelList() {
    const root = /** @type {any} */ (document.getElementById('sim-lab-list'));
    if (!root)
        return;
    const models: any[] = getAllSimulationModels() as any[];
    const cards = models
        .map((model: any) => {
        const active = model.id === _state.selectedModelId && !_state.addingExternal;
        const mutVer = _isMutableVersion(model.source?.version);
        return `
                <button type="button"
                    class="sim-model-card ${active ? 'is-active' : ''}"
                    data-model-id="${model.id}">
                    <div class="sim-card-header">
                        <strong class="sim-card-title">${model.name}</strong>
                        <div class="sim-card-badges">
                            ${model._external ? `<span class="sim-badge-external">&#9741; External</span>` : ''}
                            <span class="sim-badge-license" style="background:${_licenseBadgeColor(model.license?.badge)};">${model.license?.spdx || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="sim-card-desc">${model.description}</div>
                    <div class="sim-card-meta">Domain: ${model.domain} | L${model.fidelityLevel}${mutVer ? ' | <span class="sim-mutable-inline">&#9888; mutable version</span>' : ''}</div>
                </button>
            `;
    })
        .join('');
    root.innerHTML = `
        <div class="sim-sidebar-cards">
            ${cards}
        </div>
        <div class="sim-sidebar-footer">
            <button id="sim-add-external-btn" type="button" class="sim-add-external-btn">
                ${t('simAddExternal')}
            </button>
        </div>
    `;
    /** @type {any} */ (root.querySelectorAll('[data-model-id]')).forEach((el: any) => {
        el.addEventListener('click', () => {
            _state.selectedModelId = (el as HTMLElement).dataset.modelId;
            _state.addingExternal = false;
            _renderModelList();
            _renderModelDetails();
        });
    });
    root.querySelector('#sim-add-external-btn')?.addEventListener('click', () => {
        _state.addingExternal = true;
        _state.selectedModelId = null;
        _renderModelList();
        _renderAddExternalForm();
    });
}
function _renderModelDetails() {
    const root = /** @type {any} */ (document.getElementById('sim-lab-detail'));
    if (!root)
        return;
    /** @type {any} */
    const model: any = getSimulationModel(_state.selectedModelId || '');
    if (!model) {
        root.innerHTML = `<div class="sim-no-model">${t('simNoModel')}</div>`;
        return;
    }
    const defaults = buildDefaultParams(model);
    const volumes = getAllVolumes();
    const consented = hasSimulationConsent(model.id, model.version);
    const mutVer = _isMutableVersion(model.source?.version);
    root.innerHTML = `
        <div class="sim-detail-header">
            <div>
                <div class="sim-detail-title-row">
                    <h4>${model.name}</h4>
                    ${model._external ? `<span class="sim-badge-external">&#9741; External</span>` : ''}
                </div>
                <div class="sim-detail-desc">${model.description}</div>
            </div>
            <div class="sim-detail-meta">
                License: ${model.license?.spdx || 'N/A'}<br/>
                Version: ${model.version}
                ${model._external ? `<br/><span class="sim-detail-repo">Repo: ${model.source?.repository || ''}</span>` : ''}
            </div>
        </div>

        ${mutVer
        ? `<div class="sim-mutable-warn">
            ${t('simMutableWarn', { version: model.source?.version })}
        </div>`
        : ''}

        <div class="sim-section">
            <strong class="sim-section-title">${t('simTargetVolume')}</strong>
            ${volumes.length
        ? `<div class="sim-volume-select">
                        <select data-field-meta="true" data-field-meta-key="auto:sim-volume-id" id="sim-volume-id">
                            ${volumes.map((v: any) => `<option value="${v.id}">${v.name} (${v.resolution}m)</option>`).join('')}
                        </select>
                    </div>`
        : `<div class="sim-empty-volume">
                        <div class="sim-empty-volume-text">${t('simNoVolume')}</div>
                        <button id="sim-create-volume-btn" type="button" class="btn btn-primary">
                            &#9654; ${t('simGenerateVolume')}
                        </button>
                    </div>`}
        </div>

        <div class="sim-section">
            <strong class="sim-section-title">${t('simParameters')}</strong>
            <div class="sim-param-grid">
                ${(model.inputs || []).map((input: any) => _renderInput(input, defaults)).join('')}
                ${!(model.inputs || []).length ? `<div class="sim-no-params">${t('simNoParams')}</div>` : ''}
            </div>
        </div>

        <div class="sim-section">
            <strong class="sim-section-title">${t('simConsent')}</strong>
            <div class="sim-consent-list">
                <label><input data-field-meta="true" data-field-meta-key="auto:sim-consent-license" type="checkbox" id="sim-consent-license" ${consented ? 'checked' : ''} ${consented ? 'disabled' : ''}/> ${t('simConsentLicense')}</label>
                <label><input data-field-meta="true" data-field-meta-key="auto:sim-consent-local" type="checkbox" id="sim-consent-local" ${consented ? 'checked' : ''} ${consented ? 'disabled' : ''}/> ${t('simConsentLocal')}</label>
                ${model._external ? `<label><input data-field-meta="true" data-field-meta-key="auto:sim-consent-external" type="checkbox" id="sim-consent-external" ${consented ? 'checked' : ''} ${consented ? 'disabled' : ''}/> ${t('simConsentExternal')}</label>` : ''}
                ${consented ? `<div class="sim-consent-done">${t('simConsentDone')}</div>` : ''}
            </div>
        </div>

        <div class="sim-actions">
            <button id="sim-run-btn" type="button" class="btn btn-primary">${t('simRun')}</button>
            ${model._external ? `<button id="sim-remove-ext-btn" type="button" class="btn sim-remove-btn">${t('simRemove')}</button>` : ''}
            <button id="sim-save-ecbt-btn" type="button" class="btn" title="${t('simScenario.saveTitle') || 'Salvar cenário atual como .ecbt (Library ecbyts ou arquivo local)'}">${t('simScenario.saveLabel') || 'Salvar cenário .ecbt'}</button>
            <button id="sim-import-ecbt-btn" type="button" class="btn" title="${t('simScenario.importTitle') || 'Importar cenário .ecbt (Library ecbyts ou arquivo local)'}">${t('simScenario.importLabel') || 'Importar cenário .ecbt'}</button>
            <span id="sim-run-status" class="sim-status"></span>
        </div>

        <div id="sim-run-result" class="sim-result">
            ${_state.result ? _renderResultHtml(_state.result) : ''}
        </div>
    `;
    const runBtn = /** @type {any} */ (root.querySelector('#sim-run-btn'));
    runBtn?.addEventListener('click', _handleRun);
    const saveEcbtBtn = root.querySelector('#sim-save-ecbt-btn') as HTMLButtonElement | null;
    saveEcbtBtn?.addEventListener('click', () => _handleSaveScenarioEcbt(model));
    const importEcbtBtn = root.querySelector('#sim-import-ecbt-btn') as HTMLButtonElement | null;
    importEcbtBtn?.addEventListener('click', async () => {
        const win: any = (typeof window !== 'undefined') ? window : null;
        if (win?.importSimulationScenarioEcbt) await win.importSimulationScenarioEcbt();
    });
    const removeBtn = /** @type {any} */ (root.querySelector('#sim-remove-ext-btn'));
    if (removeBtn) {
        removeBtn.addEventListener('click', async () => {
            const ok = await asyncConfirm(`Remover solver externo "${model.name}"?`, {
                confirmLabel: 'Remover',
                cancelLabel: 'Cancelar',
                danger: true,
            });
            if (!ok)
                return;
            removeExternalModel(model.id);
            _state.selectedModelId = getAllSimulationModels()[0]?.id || null;
            _state.addingExternal = false;
            _renderModelList();
            _renderModelDetails();
            showToast(`External solver "${model.name}" removed.`, 'info');
        });
    }
    const createVolBtn = /** @type {any} */ (root.querySelector('#sim-create-volume-btn'));
    if (createVolBtn) {
        createVolBtn.addEventListener('click', () => {
            if (typeof window.handleGenerateGeology === 'function') {
                window.handleGenerateGeology();
                setTimeout(() => _renderModelDetails(), 500);
            }
            else {
                showToast(t('simulation.generateVolumeFirst'), 'warning');
            }
        });
    }
    // Update observation point counts and toggle behavior for observationField inputs
    _updateSpatialStatuses(model, root);
}
// ----------------------------------------------------------------
// ADD EXTERNAL SOLVER FORM
// ----------------------------------------------------------------
function _renderAddExternalForm() {
    const root = /** @type {any} */ (document.getElementById('sim-lab-detail'));
    if (!root)
        return;
    root.innerHTML = `
        <div class="sim-ext-form">
            <div class="sim-ext-form-header">
                <h4>${t('simExtTitle')}</h4>
                <button id="sim-ext-cancel" type="button" class="btn sim-ext-cancel-btn">${t('cancel')}</button>
            </div>

            <div class="sim-section">
                <strong class="sim-section-title">${t('simExtManifest')}</strong>
                <div class="sim-ext-manifest-hint">${t('simExtManifestHint')}</div>
                <div class="sim-ext-manifest-row">
                    <input id="sim-ext-manifest-url" type="text" placeholder="https://cdn.jsdelivr.net/gh/user/repo@v1.0.0/ecbyts-solver.json" />
                    <button id="sim-ext-fetch-btn" type="button" class="btn btn-primary">${t('simExtFetch')} &#9654;</button>
                </div>
                <div id="sim-ext-fetch-status" class="sim-ext-fetch-status"></div>
            </div>

            <div class="sim-ext-or-divider">&mdash; ${t('simExtOrManual')} &mdash;</div>

            <div class="sim-section">
                <div class="sim-ext-grid">
                    <label class="sim-field sim-field--full">
                        <span>${t('simExtRepo')} <span class="sim-required">*</span></span>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:simulationPanel:input:L289" id="sim-ext-repo" type="text" placeholder="${t('simulation.repoPlaceholder')}" />
                    </label>
                    <label class="sim-field">
                        <span>${t('simExtVersion')} <span class="sim-required">*</span></span>
                        <input data-field-meta="true" data-field-meta-key="auto:sim-ext-version" id="sim-ext-version" type="text" placeholder="1.0.0" />
                    </label>
                    <label class="sim-field">
                        <span>${t('simExtLicense')}</span>
                        <input data-field-meta="true" data-field-meta-key="auto:sim-ext-license" id="sim-ext-license" type="text" placeholder="MIT" />
                    </label>
                    <label class="sim-field sim-field--full">
                        <span>${t('simExtPath')} <span class="sim-required">*</span></span>
                        <input data-field-meta="true" data-field-meta-key="auto:sim-ext-path" id="sim-ext-path" type="text" placeholder="${t('simulation.pathPlaceholder')}" />
                    </label>
                    <label class="sim-field sim-field--full">
                        <span>${t('simExtFn')} <span class="sim-required">*</span></span>
                        <input data-field-meta="true" data-field-meta-key="auto:sim-ext-fn" id="sim-ext-fn" type="text" placeholder="runMySolver" />
                    </label>
                    <label class="sim-field">
                        <span>${t('simExtId')}</span>
                        <input data-field-meta="true" data-field-meta-key="auto:sim-ext-id" id="sim-ext-id" type="text" placeholder="my-solver-v1" />
                    </label>
                    <label class="sim-field">
                        <span>${t('simExtName')}</span>
                        <input data-field-meta="true" data-field-meta-key="auto:sim-ext-name" id="sim-ext-name" type="text" placeholder="My Solver" />
                    </label>
                    <label class="sim-field sim-field--full">
                        <span>${t('simExtDesc')}</span>
                        <input data-field-meta="true" data-field-meta-key="auto:sim-ext-desc" id="sim-ext-desc" type="text" placeholder="Short description" />
                    </label>
                </div>
            </div>

            <div class="sim-ext-actions">
                <button id="sim-ext-cancel2" type="button" class="btn sim-ext-cancel-btn">${t('cancel')}</button>
                <button id="sim-ext-register" type="button" class="btn btn-primary">${t('simExtRegister')}</button>
            </div>
        </div>
    `;
    const cancelFn = () => {
        _state.addingExternal = false;
        _state.selectedModelId = getAllSimulationModels()[0]?.id || null;
        _renderModelList();
        _renderModelDetails();
    };
    root.querySelector('#sim-ext-cancel')?.addEventListener('click', cancelFn);
    root.querySelector('#sim-ext-cancel2')?.addEventListener('click', cancelFn);
    root.querySelector('#sim-ext-fetch-btn')?.addEventListener('click', _handleFetchManifest);
    root.querySelector('#sim-ext-register')?.addEventListener('click', _handleRegisterExternal);
}
async function _handleFetchManifest() {
    const root = /** @type {any} */ (document.getElementById('sim-lab-detail'));
    const urlInput = root?.querySelector('#sim-ext-manifest-url') as HTMLInputElement | null;
    const status = root?.querySelector('#sim-ext-fetch-status') as HTMLElement | null;
    const url = urlInput?.value?.trim();
    if (!url)
        return;
    if (status) {
        status.textContent = 'Fetching...';
        status.style.color = 'var(--text-muted)';
    }
    // BS-4: AbortSignal.timeout() não existe em Safari < 17 - usar AbortController fallback
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        _fillFormFromManifest(json, root);
        if (status) {
            status.textContent = 'Manifest loaded.';
            status.style.color = 'var(--success)';
        }
    }
    catch (err: any) {
        const msg =
        /** @type {any} */ (err).name === 'AbortError'
            ? 'Timeout (10s)'
            : /** @type {any} */ (err).message || 'Fetch failed';
        if (status) {
            status.textContent = `Error: ${msg}`;
            status.style.color = 'var(--error)';
        }
    }
    finally {
        clearTimeout(t);
    }
}
/**
 * @param {any} json
 * @param {any} root
 */
function _fillFormFromManifest(json: any, root: any) {
    /**
     * @param {any} input
     * @param {any} defaults
     */
    const set = (id: any, val: any) => {
        const el = root?.querySelector(id);
        if (el && val !== undefined && val !== null)
            el.value = val;
    };
    set('#sim-ext-id', json.id);
    set('#sim-ext-name', json.name);
    set('#sim-ext-desc', json.description);
    set('#sim-ext-version', json.version || json.source?.version);
    set('#sim-ext-repo', json.source?.repository);
    set('#sim-ext-path', json.source?.path);
    set('#sim-ext-fn', json.source?.fn);
    set('#sim-ext-license', json.license?.spdx);
}
function _handleRegisterExternal() {
    const root = /** @type {any} */ (document.getElementById('sim-lab-detail'));
    /**
     * @param {any} input
     */
    const g = (id: any) => root?.querySelector(id)?.value?.trim();
    const repo = g('#sim-ext-repo');
    const version = g('#sim-ext-version') || 'latest';
    const path = g('#sim-ext-path');
    const fn = g('#sim-ext-fn');
    if (!repo || !path || !fn) {
        showToast('GitHub repo, solver path and function name are required.', 'warning');
        return;
    }
    const id = g('#sim-ext-id') || `ext-${repo.replace('/', '-')}-${Date.now()}`;
    const name = g('#sim-ext-name') || id;
    const spdx = g('#sim-ext-license') || 'Unknown';
    const descriptor: any = {
        id,
        name,
        version,
        domain: 'external',
        fidelityLevel: 1,
        description: g('#sim-ext-desc') || 'External community solver.',
        license: { spdx, badge: _licenseBadgeFromSpdx(spdx) },
        source: { type: 'cdn-esm', repository: repo, version, path, fn },
        inputs: [],
        outputs: [],
    };
    try {
        addExternalModel(descriptor);
    }
    catch (err: any) {
        showToast(/** @type {any} */ (err).message || 'Registration failed.', 'error');
        return;
    }
    _state.addingExternal = false;
    _state.selectedModelId = id;
    _renderModelList();
    _renderModelDetails();
    showToast(`External solver "${name}" registered.`, 'success');
}
// ----------------------------------------------------------------
// RUN HANDLER
// ----------------------------------------------------------------
async function _handleRun() {
    /** @type {any} */
    const model: any = getSimulationModel(_state.selectedModelId || '');
    if (!model)
        return;
    const detail = /** @type {any} */ (document.getElementById('sim-lab-detail'));
    const status = detail?.querySelector('#sim-run-status') as HTMLElement | null;
    const runBtn = detail?.querySelector('#sim-run-btn') as HTMLButtonElement | null;
    const volumeId = (detail?.querySelector('#sim-volume-id') as HTMLSelectElement | null)?.value;
    const volume = volumeId ? getVolume(volumeId) : null;
    if (!volume) {
        showToast('Create or select a voxel volume first.', 'warning');
        return;
    }
    const alreadyConsented = hasSimulationConsent(model.id, model.version);
    if (!alreadyConsented) {
        const c1 = (detail?.querySelector('#sim-consent-license') as HTMLInputElement | null)?.checked;
        const c2 = (detail?.querySelector('#sim-consent-local') as HTMLInputElement | null)?.checked;
        const c3 = model._external ? (detail?.querySelector('#sim-consent-external') as HTMLInputElement | null)?.checked : true;
        if (!c1 || !c2 || !c3) {
            const msg = model._external
                ? 'Accept all three consent checkboxes before running.'
                : 'Accept both consent checkboxes before running.';
            showToast(msg, 'warning');
            return;
        }
        recordSimulationConsent(model.id, model.version, { modelName: model.name });
    }
    const params: AnyRecord = {};
    detail?.querySelectorAll('[data-param-id]').forEach((el: any) => {
        const ptype = el.dataset.paramType || '';
        if (ptype === 'elementPosition') {
            params[el.dataset.paramId] = el.value || null;
        }
        else {
            params[el.dataset.paramId] = Number(el.value);
        }
    });
    // Spatial toggles - override scalar with '__spatial__' sentinel
    detail?.querySelectorAll('[data-spatial-toggle]').forEach((cb: any) => {
        if (cb.checked)
            params[cb.dataset.spatialToggle] = '__spatial__';
    });
    // Zone checkboxes
    const zoneIds: number[] = [];
    detail?.querySelectorAll('[data-zone-id]:checked').forEach((cb: any) => {
        zoneIds.push(Number(cb.dataset.zoneId));
    });
    if (zoneIds.length)
        params.activeZones = zoneIds;
    if (status)
        status.textContent = t('simRunning');
    if (runBtn)
        runBtn.disabled = true;
    try {
        const result = await executeSimulation(model.id, params, volume);
        addVolumeChannel(volume.id, result.channel);
        setVolumeMode(volume.id, 'voxels');
        applyVolumeChannelColors(volume.id, result.channel.name);
        _state.result = {
            modelName: result.model.name,
            channel: result.channel.name,
            min: result.channel.min,
            max: result.channel.max,
            unit: result.channel.unit,
            elapsedMs: result.elapsedMs,
            values: result.channel.data.length,
        };
        const resultRoot = /** @type {any} */ (document.getElementById('sim-run-result'));
        if (resultRoot)
            resultRoot.innerHTML = _renderResultHtml(_state.result);
        if (status)
            status.textContent = t('simCompleted');
        showToast(`Simulation completed: ${result.model.name}`, 'success');
    }
    catch (err: any) {
        if (status)
            status.textContent = t('simFailed');
        showToast(/** @type {any} */ (err).message || 'Simulation failed', 'error');
    }
    finally {
        if (runBtn)
            runBtn.disabled = false;
    }
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
const _ZONE_I18N: any = {
    0: 'simZoneEmpty',
    1: 'simZoneVadose',
    2: 'simZoneSaturated',
    3: 'simZoneConfining',
    4: 'simZoneBedrock',
};
/**
 * @param {any} input
 * @param {any} defaults
 */
function _renderInput(input: any, defaults: AnyRecord) {
    const type = input.type || 'number';
    if (type === 'elementPosition') {
        const elems = getAllElements().filter((e: any) => {
            if (!input.familyFilter?.length)
                return true;
            return input.familyFilter.includes(e.family);
        });
        const options = elems
            .map((e: any) => {
            const x = (e.data?.coordinates?.easting ?? e.data?.position?.x ?? 0).toFixed(1);
            const z = (e.data?.coordinates?.northing ?? e.data?.position?.z ?? 0).toFixed(1);
            return `<option value="${e.id}">${e.name || e.id} (${x}, ${z})</option>`;
        })
            .join('');
        return `
            <label class="sim-field sim-field--full">
                <span>${input.label}</span>
                <select data-field-meta="true" data-field-meta-key="auto-tpl:simulationPanel:select:L555" data-param-id="${input.id}" data-param-type="elementPosition">
                    <option value="">${t('simVolumeCenter')}</option>
                    ${options}
                </select>
            </label>
        `;
    }
    if (type === 'observationField') {
        return `
            <label class="sim-field">
                <span>${input.label}</span>
                <div class="sim-field-row">
                    <input data-field-meta="true" data-field-meta-key="auto-tpl:simulationPanel:input:L568" type="number" data-param-id="${input.id}" value="${input.scalarFallback ?? defaults[input.id] ?? ''}" min="${input.min ?? ''}" max="${input.max ?? ''}" step="any" />
                    <label class="sim-spatial-label">
                        <input data-field-meta="true" data-field-meta-key="auto-pos:simulationPanel:input:L570" type="checkbox" data-spatial-toggle="${input.id}" /> ${t('simSpatial')}
                    </label>
                </div>
                <div data-spatial-status="${input.id}" class="sim-spatial-status"></div>
            </label>
        `;
    }
    if (type === 'zoneAware') {
        const zones = input.zones || [1, 2];
        const defs = new Set(input.default || zones);
        const checks = zones
            .map((zid: any) => {
            const label = (_ZONE_I18N as AnyRecord)[zid] ? t((_ZONE_I18N as AnyRecord)[zid]) : `Zone ${zid}`;
            return `<label class="sim-zone-label"><input data-field-meta="true" data-field-meta-key="auto-tpl:simulationPanel:input:L584" type="checkbox" data-zone-id="${zid}" ${defs.has(zid) ? 'checked' : ''} /> ${label}</label>`;
        })
            .join('');
        return `
            <label class="sim-field sim-field--full">
                <span>${input.label}</span>
                <div class="sim-zone-row">${checks}</div>
            </label>
        `;
    }
    // Default: type === 'number'
    return `
        <label class="sim-field">
            <span>${input.label}</span>
            <input data-field-meta="true" data-field-meta-key="auto-tpl:simulationPanel:input:L599" type="number" data-param-id="${input.id}" value="${defaults[input.id] ?? ''}" min="${input.min ?? ''}" max="${input.max ?? ''}" step="any" />
        </label>
    `;
}
/**
 * @param {any} model
 * @param {any} root
 */
function _updateSpatialStatuses(model: any, root: any) {
    for (const input of model.inputs || []) {
        if (input.type !== 'observationField')
            continue;
        const statusEl = /** @type {any} */ (root.querySelector(`[data-spatial-status="${input.id}"]`));
        const toggleEl = /** @type {any} */ (root.querySelector(`[data-spatial-toggle="${input.id}"]`));
        const inputEl = /** @type {any} */ (root.querySelector(`[data-param-id="${input.id}"]`));
        if (!statusEl)
            continue;
        let count = 0;
        try {
            count = collectObservationPoints(input.parameterId).length;
        }
        catch (e: any) {
            console.debug('[simulationPanel] collectPoints:', e?.message || e);
            /* module not ready */
        }
        if (count >= 2) {
            statusEl.textContent = t('simObsFound', { count });
            statusEl.style.color = 'var(--success)';
        }
        else {
            statusEl.textContent =
                count === 0
                    ? t('simNoObs', { val: input.scalarFallback ?? '' })
                    : t('simFewObs', { val: input.scalarFallback ?? '' });
            statusEl.style.color = 'var(--text-muted)';
            if (toggleEl) {
                toggleEl.disabled = true;
                toggleEl.checked = false;
            }
        }
        // Toggle behavior: disable number input when spatial is active
        if (toggleEl && inputEl) {
            toggleEl.addEventListener('change', () => {
                inputEl.disabled = toggleEl.checked;
            });
        }
    }
}
/**
 * @param {any} result
 */
function _renderResultHtml(result: any) {
    return `
        <div class="sim-result-box">
            <strong>${t('simLastResult')}</strong>
            <div class="sim-result-grid">
                <div><span class="sim-result-label">${t('simResultModel')}:</span> ${result.modelName}</div>
                <div><span class="sim-result-label">${t('simResultChannel')}:</span> ${result.channel}</div>
                <div><span class="sim-result-label">${t('simResultMin')}:</span> ${Number(result.min).toFixed(3)} ${result.unit || ''}</div>
                <div><span class="sim-result-label">${t('simResultMax')}:</span> ${Number(result.max).toFixed(3)} ${result.unit || ''}</div>
                <div><span class="sim-result-label">${t('simResultValues')}:</span> ${result.values.toLocaleString()}</div>
                <div><span class="sim-result-label">${t('simResultElapsed')}:</span> ${result.elapsedMs.toFixed(1)} ms</div>
            </div>
        </div>
    `;
}
/**
 * @param {any} badge
 */
function _licenseBadgeColor(badge: any) {
    if (badge === 'green')
        return '#86efac';
    if (badge === 'yellow')
        return '#fde68a';
    if (badge === 'red')
        return '#fca5a5';
    return '#d1d5db';
}
/**
 * @param {any} spdx
 */
function _licenseBadgeFromSpdx(spdx: any) {
    const s = (spdx || '').toLowerCase();
    if (s === 'mit' ||
        s === 'apache-2.0' ||
        s === 'bsd-2-clause' ||
        s === 'bsd-3-clause' ||
        s === 'isc' ||
        s === 'public-domain' ||
        s === 'cc0-1.0')
        return 'green';
    if (s.includes('gpl') || s.includes('lgpl') || s.includes('agpl') || s.includes('eupl'))
        return 'yellow';
    return 'gray';
}
/**
 * Captura modelId + params atuais do DOM e exporta como cenário .ecbt
 * (chooser Library/local via window.exportSimulationScenarioEcbt já registrado).
 * @param {any} model
 */
async function _handleSaveScenarioEcbt(model: any) {
    try {
        if (!model?.id) return;
        const detail = /** @type {any} */ (document.getElementById('sim-lab-detail'));
        const params: AnyRecord = {};
        detail?.querySelectorAll('[data-param-id]').forEach((el: any) => {
            const ptype = el.dataset.paramType || '';
            params[el.dataset.paramId] = ptype === 'elementPosition' ? (el.value || null) : Number(el.value);
        });
        const win: any = (typeof window !== 'undefined') ? window : null;
        if (!win?.saveSimulationScenario || !win?.exportSimulationScenarioEcbt) {
            showToast('Funções de cenário .ecbt não disponíveis.', 'error');
            return;
        }
        const id = `sim-${model.id}-${Date.now().toString(36)}`;
        const scenario = {
            id,
            name: `${model.name || model.id} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
            modelId: model.id,
            modelVersion: model.version || '1.0.0',
            params,
            runConfig: {},
            savedAt: new Date().toISOString(),
            notes: '',
        };
        const saved = await win.saveSimulationScenario(scenario);
        if (!saved) {
            showToast('Falha ao persistir cenário antes de exportar.', 'error');
            return;
        }
        await win.exportSimulationScenarioEcbt(id);
    } catch (e: any) {
        console.debug('[sim-panel:saveEcbt]', e?.message || e);
        showToast('Falha ao salvar cenário .ecbt.', 'error');
    }
}

/**
 * @param {any} version
 */
function _isMutableVersion(version: any) {
    if (!version)
        return false;
    const v = version.toLowerCase();
    return v === 'main' || v === 'master' || v === 'latest' || v === 'head';
}
//# sourceMappingURL=simulationPanel.js.map
//# sourceMappingURL=simulationPanel.js.map
