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
   NEURAL NETWORK HANDLERS — UI actions for NN management panel
   Handlers de interface para gerenciamento de redes neurais

   Cada funcao e registrada no window.* pelo handlers/index.js
   para uso nos onclick do HTML. O painel lista redes registradas
   e permite criar, resetar, remover e ver detalhes.
   ================================================================ */
import { ensureNN, listNetworks, getNetwork, getNetworkMetadata, removeNetwork, registerNetwork, persistNetwork, } from '../../core/nn/manager.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('NN');
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { openModal } from '../ui/modals.js';
import { escapeHtml } from '../helpers/html.js';
import { getIcon } from '../ui/icons.js';
import { asyncConfirm } from '../ui/asyncDialogs.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
// Side-effect: registra o kind portável `nn_network` no boot (P1-10).
import './nnPortable.js';
// ----------------------------------------------------------------
// UPDATE UI INJECTION
// Callback para atualizar a interface apos mudancas
// ----------------------------------------------------------------
/** @type {any} */
let _requestUIRefresh: any = null;
export function setNNUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestNnUIRefresh(reason = 'nn.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.NN,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LIBRARIES,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains)
        _requestUIRefresh(domain, reason);
}
// ----------------------------------------------------------------
// HELPERS - Topology display and parameter counting
// ----------------------------------------------------------------
/**
 * Build topology display string from metadata.
 * Ex: "6 → 32 → 16 → 2"
 * @param {Object} meta - Network metadata
 * @returns {string}
 */
function _topologyString(meta: any) {
    const sizes = meta.hiddenLayerSizes || [meta.hiddenSize];
    return [meta.inputSize, ...sizes, meta.outputSize].join(' → ');
}
/**
 * Calculate total parameters from layer sizes array.
 * @param {number[]} layerSizes - [input, h1, h2, ..., output]
 * @returns {number}
 */
function _countParams(layerSizes: number[]) {
    let total = 0;
    for (let i = 0; i < layerSizes.length - 1; i++) {
        const current = layerSizes[i] || 0;
        const next = layerSizes[i + 1] || 0;
        total += current * next + next;
    }
    return total;
}
/**
 * Update the parameter count display in the create form.
 * Atualiza contador de parametros em tempo real no formulario.
 */
function _updateParamCount() {
    const inputs = document.querySelectorAll('#nn-hidden-layers-container .nn-hidden-size-input');
    const inputSize = parseInt(((document.getElementById('nn-create-input') as HTMLInputElement | null)?.value) || '') || 6;
    const outputSize = parseInt(((document.getElementById('nn-create-output') as HTMLInputElement | null)?.value) || '') || 2;
    const hiddenSizes = Array.from(inputs).map((el: any) => parseInt(el.value) || 16);
    const layerSizes = [inputSize, ...hiddenSizes, outputSize];
    const total = _countParams(layerSizes);
    const el = document.getElementById('nn-param-count');
    if (el) {
        const warn = total > 500000;
        el.textContent = `${total.toLocaleString()} ${t('nnTotalParams') || 'params'}`;
        el.style.color = warn ? 'var(--accent-red)' : 'var(--neutral-400)';
    }
}
// ----------------------------------------------------------------
// MODAL RENDERING
// Renderiza conteudo do modal de redes neurais
// ----------------------------------------------------------------
/**
 * Open the ML Studio side panel.
 * Abre o painel lateral do ML Studio (wizard).
 */
async function handleOpenNNManager() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('nn')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    // LOADING-PERF GAP-2: NN é lazy. Garante o registry carregado do IDB antes de
    // renderizar a lista de redes salvas. Idempotente + dedupe de concorrência.
    await ensureNN().catch((err: any) => log.error('NN ensure failed', err?.message || err));
    import('../../core/nn/panelRenderer.js' as string)
        .then((mod) => {
        mod.togglePanel();
    })
        .catch((err) => {
        log.error('Failed to open ML Studio panel', err);
        // Fallback to modal
        _renderNNModal();
        openModal('nn-modal');
    });
}
/**
 * Render the NN management modal content.
 * Renderiza lista de redes registradas com acoes.
 */
function _renderNNModal() {
    const body = document.getElementById('nn-modal-body');
    if (!body)
        return;
    const ids = listNetworks();
    if (ids.length === 0) {
        body.innerHTML = `
            <div class="nn-empty">
                <p>${getIcon('brain', { size: '32px' })}</p>
                <p>${t('nnNoNetworks')}</p>
                <p class="nn-empty-hint">${t('nnCreateHint')}</p>
                <button class="btn btn-primary" data-cc-action="cc-ca405b80">
                    ${getIcon('plus', { size: '14px' })} ${t('nnCreateNetwork')}
                </button>
            </div>`;
        return;
    }
    let html = `
        <div class="nn-toolbar">
            <button class="btn btn-primary btn-sm" data-cc-action="cc-ca405b80">
                ${getIcon('plus', { size: '14px' })} ${t('nnCreateNetwork')}
            </button>
            <button class="btn btn-sm" data-cc-action="cc-2af43bf0"
                    title="${t('nnImportEcbtTitle') || 'Importar rede treinada de .ecbt (Library ecbyts ou local)'}">
                ${getIcon('upload', { size: '14px' })} ${t('nnImportEcbt') || 'Importar .ecbt'}
            </button>
        </div>
        <div class="nn-list">`;
    for (const id of ids) {
        const meta = (getNetworkMetadata(id)) as any;
        if (!meta)
            continue;
        const trained = meta.trained;
        const hasMapping = !!(meta.mapping && meta.mapping.inputs && meta.mapping.inputs.length > 0);
        const statusClass = trained ? 'nn-status-trained' : 'nn-status-untrained';
        const statusLabel = trained ? t('nnTrained') : t('nnUntrained');
        const classNames = meta.classNames ? meta.classNames.join(', ') : '—';
        const arch = _topologyString(meta);
        const safeId = escapeHtml(id);
        // -- Action buttons based on state --
        let actionsHtml = '';
        // Builder button - always available
        actionsHtml += `
            <button class="btn btn-sm" data-cc-call-click="handleNNOpenBuilder|s:${encodeURIComponent(`${safeId}`)}" title="${t('nnBuilder')}">
                ${getIcon('sliders', { size: '14px' })}
            </button>`;
        // Train button - show when has mapping but untrained
        if (hasMapping && !trained) {
            actionsHtml += `
                <button class="btn btn-sm btn-primary" data-cc-call-click="handleNNTrain|s:${encodeURIComponent(`${safeId}`)}" title="${t('nnTrainNetwork')}">
                    ${getIcon('play', { size: '14px' })}
                </button>`;
        }
        // What-If button - show when trained and has mapping
        if (hasMapping && trained) {
            actionsHtml += `
                <button class="btn btn-sm" data-cc-call-click="handleNNOpenWhatIf|s:${encodeURIComponent(`${safeId}`)}" title="${t('nnWhatIf')}">
                    ${getIcon('activity', { size: '14px' })}
                </button>`;
        }
        // Reset button - show when trained
        if (trained) {
            actionsHtml += `
                <button class="btn btn-sm" data-cc-call-click="handleNNReset|s:${encodeURIComponent(`${safeId}`)}" title="${t('nnReset')}">
                    ${getIcon('refresh-cw', { size: '14px' })}
                </button>`;
        }
        // Export .ecbt - show when trained (rede portável)
        if (trained) {
            actionsHtml += `
                <button class="btn btn-sm" data-cc-call-click="exportNnNetworkEcbt|s:${encodeURIComponent(`${safeId}`)}"
                        title="${t('nnExportEcbtTitle') || 'Salvar rede treinada como .ecbt (Library ecbyts ou local)'}">
                    ${getIcon('download', { size: '14px' })}
                </button>`;
        }
        // Delete button - always available
        actionsHtml += `
            <button class="btn btn-sm btn-danger" data-cc-call-click="handleNNRemove|s:${encodeURIComponent(`${safeId}`)}" title="${t('remove')}">
                ${getIcon('trash-2', { size: '14px' })}
            </button>`;
        // -- Mapping info row --
        let mappingHtml = '';
        if (hasMapping) {
            const inCount = meta.mapping.inputs.length;
            const outCount = meta.mapping.outputs ? meta.mapping.outputs.length : 0;
            mappingHtml = `
                <div class="nn-card-row">
                    <span class="nn-card-label">${t('nnMapping')}</span>
                    <span class="nn-card-value">${inCount} ${t('nnInputZone')} → ${outCount} ${t('nnOutputZone')}</span>
                </div>`;
        }
        html += `
            <div class="nn-card">
                <div class="nn-card-header">
                    <div class="nn-card-title">
                        ${getIcon('brain', { size: '16px' })}
                        <span class="nn-card-id">${safeId}</span>
                        <span class="nn-badge ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="nn-card-actions">
                        ${actionsHtml}
                    </div>
                </div>
                <div class="nn-card-body">
                    <div class="nn-card-row">
                        <span class="nn-card-label">${t('nnArchitecture')}</span>
                        <span class="nn-card-value">${arch}</span>
                    </div>
                    <div class="nn-card-row">
                        <span class="nn-card-label">${t('nnClasses')}</span>
                        <span class="nn-card-value nn-card-classes">${escapeHtml(classNames)}</span>
                    </div>
                    ${mappingHtml}
                    ${meta.description
            ? `
                    <div class="nn-card-row">
                        <span class="nn-card-label">${t('description')}</span>
                        <span class="nn-card-value">${escapeHtml(meta.description)}</span>
                    </div>`
            : ''}
                </div>
            </div>`;
    }
    html += '</div>';
    body.innerHTML = html;
}
// ----------------------------------------------------------------
// CRUD HANDLERS
// Acoes de criacao, reset e remocao de redes neurais
// ----------------------------------------------------------------
/**
 * Show the create network form with dynamic hidden layers.
 * Mostra formulario modernizado para criar nova rede neural.
 * Permite adicionar/remover hidden layers dinamicamente.
 */
function handleNNCreate() {
    const body = document.getElementById('nn-modal-body');
    if (!body)
        return;
    body.innerHTML = `
        <div class="nn-form">
            <h4>${getIcon('plus', { size: '16px' })} ${t('nnCreateNetwork')}</h4>

            <div class="form-group">
                <label>${t('nnNetworkId')}</label>
                <input data-field-meta="true" data-field-meta-key="auto:nn-create-id" type="text" id="nn-create-id" class="form-control" placeholder="my-classifier" />
            </div>

            <div class="form-group">
                <label>${t('description')}</label>
                <input data-field-meta="true" data-field-meta-key="auto:nn-create-desc" type="text" id="nn-create-desc" class="form-control" placeholder="${t('optional')}" />
            </div>

            <div class="nn-topology-group">
                <div class="nn-topology-label">${t('nnTopology')}</div>
                <div class="nn-topology-row">
                    <div class="form-group nn-topology-fixed">
                        <label>${t('nnInputSize')}</label>
                        <input data-field-meta="true" data-field-meta-key="auto:nn-create-input" type="number" id="nn-create-input" class="form-control" value="6" min="1" max="256"
                               data-cc-change="cc-9a97643d" />
                    </div>
                    <div class="nn-topology-arrow">→</div>
                    <div id="nn-hidden-layers-container">
                        <div class="nn-hidden-layer-row" data-layer-index="0">
                            <div class="form-group">
                                <label>${t('nnHiddenLayer')} 1</label>
                                <input data-field-meta="true" data-field-meta-key="auto-pos:nn:input:L300" type="number" class="form-control nn-hidden-size-input" value="16" min="1" max="512"
                                       data-cc-change="cc-9a97643d" />
                            </div>
                        </div>
                    </div>
                    <div class="nn-topology-arrow">→</div>
                    <div class="form-group nn-topology-fixed">
                        <label>${t('nnOutputSize')}</label>
                        <input data-field-meta="true" data-field-meta-key="auto:nn-create-output" type="number" id="nn-create-output" class="form-control" value="2" min="2" max="128"
                               data-cc-change="cc-9a97643d" />
                    </div>
                </div>
                <div class="nn-topology-actions">
                    <button class="btn btn-sm" data-cc-action="cc-f8c78320">
                        ${getIcon('plus', { size: '12px' })} ${t('nnAddHiddenLayer')}
                    </button>
                    <span class="nn-param-count" id="nn-param-count"></span>
                </div>
            </div>

            <div class="form-group">
                <label>${t('nnClassNames')}</label>
                <input data-field-meta="true" data-field-meta-key="auto:nn-create-classes" type="text" id="nn-create-classes" class="form-control"
                       placeholder="${t('nnClassNamesHint')}" />
            </div>

            <div class="nn-form-actions">
                <button class="btn btn-sm" data-cc-action="cc-5bec1d1a">
                    ${t('cancel')}
                </button>
                <button class="btn btn-primary btn-sm" data-cc-action="cc-93cd1a8a">
                    ${getIcon('check', { size: '14px' })} ${t('nnCreateNetwork')}
                </button>
            </div>
        </div>`;
    // Initial param count
    _updateParamCount();
}
/**
 * Add a hidden layer to the create form.
 * Adiciona mais uma camada oculta ao formulario (max 5).
 */
function handleNNAddHiddenLayer() {
    const container = document.getElementById('nn-hidden-layers-container');
    if (!container)
        return;
    const count = container.querySelectorAll('.nn-hidden-layer-row').length;
    if (count >= 5) {
        showToast(t('nnMaxHiddenLayers'), 'error');
        return;
    }
    const index = count;
    const row = document.createElement('div');
    row.className = 'nn-hidden-layer-row';
    row.dataset.layerIndex = String(index);
    row.innerHTML = `
        <div class="nn-topology-arrow">→</div>
        <div class="form-group">
            <label>${t('nnHiddenLayer')} ${index + 1}</label>
            <input data-field-meta="true" data-field-meta-key="auto-pos:nn:input:L360" type="number" class="form-control nn-hidden-size-input" value="16" min="1" max="512"
                   data-cc-change="cc-9a97643d" />
        </div>
        <button class="btn btn-sm nn-remove-layer-btn" data-cc-action="cc-f0808837">
            ${getIcon('x', { size: '12px' })}
        </button>`;
    container.appendChild(row);
    _updateParamCount();
}
/**
 * Remove a hidden layer from the create form.
 * Remove uma camada oculta (minimo 1 deve permanecer).
 * @param {HTMLElement} btn - The remove button that was clicked
 */
function handleNNRemoveHiddenLayer(btn: HTMLElement) {
    const container = document.getElementById('nn-hidden-layers-container');
    if (!container)
        return;
    const rows = container.querySelectorAll('.nn-hidden-layer-row');
    if (rows.length <= 1)
        return; // Must keep at least 1 hidden layer
    const row = btn.closest('.nn-hidden-layer-row');
    if (row)
        row.remove();
    // Re-index remaining layer labels
    container.querySelectorAll('.nn-hidden-layer-row').forEach((r: any, i: number) => {
        r.dataset.layerIndex = String(i);
        const label = r.querySelector('label');
        if (label)
            label.textContent = `${t('nnHiddenLayer')} ${i + 1}`;
    });
    _updateParamCount();
}
/**
 * Update param count display (called from onchange).
 */
function handleNNUpdateParamCount() {
    _updateParamCount();
}
/**
 * Confirm creation of a new network.
 * Confirma criacao da rede neural com os parametros do formulario.
 */
function handleNNConfirmCreate() {
    const id = ((document.getElementById('nn-create-id') as HTMLInputElement | null)?.value || '').trim();
    const desc = ((document.getElementById('nn-create-desc') as HTMLInputElement | null)?.value || '').trim();
    const inputSize = parseInt(((document.getElementById('nn-create-input') as HTMLInputElement | null)?.value) || '') || 6;
    const outputSize = parseInt(((document.getElementById('nn-create-output') as HTMLInputElement | null)?.value) || '') || 2;
    const classesRaw = ((document.getElementById('nn-create-classes') as HTMLInputElement | null)?.value || '').trim();
    // Collect hidden layer sizes
    const hiddenInputs = document.querySelectorAll('#nn-hidden-layers-container .nn-hidden-size-input');
    const hiddenLayerSizes = Array.from(hiddenInputs).map((el: any) => parseInt(el.value) || 16);
    if (!id) {
        showToast(t('nnEnterNetworkId'), 'error');
        return;
    }
    // Check if already exists
    if (getNetwork(id)) {
        showToast(t('nnNetworkExists'), 'error');
        return;
    }
    if (hiddenLayerSizes.length === 0 || hiddenLayerSizes.length > 5) {
        showToast(t('nnMaxHiddenLayers'), 'error');
        return;
    }
    // Parse class names
    let classNames = null;
    if (classesRaw) {
        classNames = classesRaw
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean);
        if (classNames.length !== outputSize) {
            showToast(t('nnClassCountMismatch'), 'error');
            return;
        }
    }
    const config = { inputSize, hiddenLayerSizes, outputSize, classNames };
    registerNetwork(id, config, { description: desc || undefined });
    persistNetwork(id);
    showToast(`${t('nnRegistered')}: ${id}`, 'success');
    _renderNNModal();
    requestNnUIRefresh('nn.registered');
}
/**
 * Cancel creation, go back to list.
 * Cancela criacao e volta para lista de redes.
 */
function handleNNCancelCreate() {
    _renderNNModal();
}
/**
 * Reset a network's weights.
 * Reinicializa pesos da rede neural (He init).
 */
async function handleNNReset(id: any) {
    const nn = getNetwork(id);
    if (!nn)
        return;
    if (!(await asyncConfirm(`${t('nnReset')}: ${id}?`)))
        return;
    nn.reset();
    persistNetwork(id);
    showToast(`${t('nnReset')}: ${id}`, 'info');
    _renderNNModal();
    requestNnUIRefresh('nn.reset');
}
/**
 * Remove a network instance.
 * Remove rede neural permanentemente.
 */
async function handleNNRemove(id: any) {
    if (!(await asyncConfirm(`${t('remove')}: ${id}?`)))
        return;
    removeNetwork(id);
    showToast(`${t('elementRemoved')}: ${id}`, 'info');
    _renderNNModal();
    requestNnUIRefresh('nn.removed');
}
// ----------------------------------------------------------------
// BUILDER / WHAT-IF PLACEHOLDER HANDLERS
// Stubs para as Fases 2-4 - serao implementados nos proximos sprints
// ----------------------------------------------------------------
/**
 * Open the variable mapping builder for a network.
 * Abre o construtor de mapeamento de variaveis.
 */
function handleNNOpenBuilder(id: any) {
    const nn = getNetwork(id);
    if (!nn)
        return;
    import('../../core/nn/builderRenderer.js' as string)
        .then((mod) => {
        mod.renderBuilder(id);
    })
        .catch((err) => {
        log.error('Failed to load builder', err);
        showToast(t('nnBuilderHint'), 'info');
    });
}
/**
 * Remove a variable from the mapping in the builder.
 */
function handleNNUnmapVariable(networkId: any, side: any, variableId: any) {
    import('../../core/nn/builderRenderer.js' as string)
        .then((mod) => {
        mod.unmapVariable(networkId, side, variableId);
    })
        .catch((err) => console.warn('[handlers/nn] import builderRenderer failed:', err));
}
/**
 * Update normalization bounds for a mapped variable.
 */
function handleNNUpdateNorm(networkId: any, variableId: any, field: any, value: any) {
    import('../../core/nn/builderRenderer.js' as string)
        .then((mod) => {
        mod.updateNorm(networkId, variableId, field, value);
    })
        .catch((err) => console.warn('[handlers/nn] import builderRenderer failed:', err));
}
/**
 * Save the builder mapping and auto-resize network topology.
 */
function handleNNSaveBuilder(networkId: any) {
    import('../../core/nn/builderRenderer.js' as string)
        .then((mod) => {
        mod.saveBuilder(networkId);
    })
        .catch((err) => console.warn('[handlers/nn] import builderRenderer failed:', err));
}
/**
 * Go back from builder to the network list view.
 */
function handleNNBuilderBack() {
    import('../../core/nn/builderRenderer.js' as string)
        .then((mod) => {
        mod.backToList();
    })
        .catch((err) => console.warn('[handlers/nn] import builderRenderer failed:', err));
}
/**
 * Train a mapped network with model data.
 * Treina a rede mapeada com dados do modelo (Fase 3).
 */
function handleNNTrain(id: any) {
    log.debug('Train requested for:', id);
    import('../../core/nn/whatIfEngine.js')
        .then((mod) => {
        mod.trainNetworkFromModel(id);
    })
        .catch((err) => {
        log.error('Train failed', err);
        showToast(`Train error: ${err.message}`, 'error');
    });
}
/**
 * Open the What-If simulator for a trained+mapped network.
 * Abre o simulador What-If (Fase 3).
 */
function handleNNOpenWhatIf(id: any) {
    const meta = (getNetworkMetadata(id)) as any;
    if (!meta || !meta.trained)
        return;
    import('../../core/nn/whatIfRenderer.js' as string)
        .then((mod) => {
        mod.renderWhatIf(id);
    })
        .catch(() => {
        showToast(t('nnWhatIfHint'), 'info');
    });
}
/**
 * Handle slider value change in the What-If simulator.
 */
function handleWhatIfSliderChange(networkId: any, variableId: any, value: any) {
    import('../../core/nn/whatIfRenderer.js' as string)
        .then((mod) => {
        mod.onSliderChange(networkId, variableId, value);
    })
        .catch((err) => console.warn('[handlers/nn] import whatIfRenderer failed:', err));
}
/**
 * Reset all What-If sliders to default midpoint values.
 */
function handleWhatIfReset(networkId: any) {
    import('../../core/nn/whatIfRenderer.js' as string)
        .then((mod) => {
        mod.resetSliders(networkId);
    })
        .catch((err) => console.warn('[handlers/nn] import whatIfRenderer failed:', err));
}
/**
 * Connect What-If simulator to a plume element for 3D visualization.
 */
function handleWhatIfConnectPlume(networkId: any, elementId: any) {
    import('../../core/nn/whatIfRenderer.js' as string)
        .then((mod) => {
        mod.connectPlume(networkId, elementId);
    })
        .catch((err) => console.warn('[handlers/nn] import whatIfRenderer failed:', err));
}
/**
 * Go back from What-If simulator to network list.
 */
function handleNNWhatIfBack() {
    import('../../core/nn/whatIfRenderer.js' as string)
        .then((mod) => {
        mod.backToList();
    })
        .catch((err) => console.warn('[handlers/nn] import whatIfRenderer failed:', err));
}
// ----------------------------------------------------------------
// EXPORT - Handler object for registration
// Objeto exportado para registro no window.*
// ----------------------------------------------------------------
export const nnHandlers = {
    handleOpenNNManager,
    handleNNCreate,
    handleNNConfirmCreate,
    handleNNCancelCreate,
    handleNNReset,
    handleNNRemove,
    handleNNOpenBuilder,
    handleNNUnmapVariable,
    handleNNUpdateNorm,
    handleNNSaveBuilder,
    handleNNBuilderBack,
    handleNNTrain,
    handleNNOpenWhatIf,
    handleWhatIfSliderChange,
    handleWhatIfReset,
    handleWhatIfConnectPlume,
    handleNNWhatIfBack,
    handleNNAddHiddenLayer,
    handleNNRemoveHiddenLayer,
    handleNNUpdateParamCount,
};
