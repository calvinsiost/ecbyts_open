// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   CLOUD HANDLERS — Cloud save, share, professional, subscription
   Handlers para salvar/carregar modelos na nuvem, compartilhar,
   registro profissional e assinatura.

   MODALS:
   - Cloud Panel: lista modelos salvos, salvar, carregar, deletar
   - Share Modal: compartilhar modelo por email ou codigo
   - Professional Modal: registro profissional + upload print
   - Subscription Modal: planos e pagamento
   ================================================================ */
import { saveModelToCloud, updateModelInCloud, loadModelsFromCloud, loadModelFromCloud, listAutosaveSnapshots, loadAutosaveSnapshot, deleteModelFromCloud, shareModel, getSharedModels, loadModelByShareCode, getModelShares, revokeShare, loadAutosaveLanes, createAutosaveLane, renameAutosaveLane, deleteAutosaveLane, setActiveLane, getActiveLane, getCachedLanes, } from '../cloud/manager.js';
import * as professionalModule from '../cloud/professional.js';
import * as subscriptionModule from '../cloud/subscription.js';
import * as validationModule from '../cloud/validation.js';
import * as authSessionModule from '../auth/session.js';
import { getAllElements } from '../../core/elements/manager.js';
import { applyModel } from '../../core/io/import.js';
import { showToast } from '../ui/toast.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { clearModelData, setEphemeral } from '../storage/storageMonitor.js';
import { asyncConfirm, asyncPrompt } from '../ui/asyncDialogs.js';
import { createLogger } from '../helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('Cloud');
/** @typedef {Record<string, any>} AnyRecord */
const window = (globalThis.window) as any;
const document = (globalThis.document) as any;
const localStorage = (globalThis.localStorage) as any;
const { submitProfessionalRequest, getProfessionalStatus, getProfessionalProfile } = /** @type {any} */ (professionalModule);
const { getSubscriptionInfo, cancelSubscription, checkPaymentReturn } = /** @type {any} */ (subscriptionModule);
const { validateElements, setValidationCouncilId } = /** @type {any} */ (validationModule);
const { getAccessToken, getCurrentUser, isLoggedIn } = /** @type {any} */ (authSessionModule);
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
/** @type {any} */
let requestCloudUIRefreshRef: ((domain?: string, reason?: string) => void) | null = null;
/** @type {string|null} */
let currentCloudModelId: string | null = null; // tracks if current model was loaded from cloud
/**
 * Set the current cloud model ID (for init-time loads).
 * Sincroniza o ID do modelo carregado no init para que "Salvar" faca UPDATE.
 *
 * @param {string|null} id - UUID do modelo ou null para limpar
 */
export function setCurrentCloudModelId(id: string | null) {
    currentCloudModelId = id;
}
/**
 * Get current cloud model id tracked by the UI session.
 * Retorna o id do modelo cloud ativo nesta sessão de UI.
 *
 * @returns {string|null}
 */
export function getCurrentCloudModelId() {
    return currentCloudModelId;
}
/**
 * Inject domain refresh callback reference.
 * @param {Function} fn
 */
export function setCloudRequestUIRefresh(fn: ((domain?: string, reason?: string) => void) | null) {
    requestCloudUIRefreshRef = fn;
}

function requestCloudUIRefresh(domain: string = UI_INVALIDATION_DOMAINS.MODEL, reason = 'cloud') {
    requestCloudUIRefreshRef?.(domain, reason);
}
// ----------------------------------------------------------------
// CLOUD PANEL (Save / Load / Delete)
// ----------------------------------------------------------------
/**
 * Open cloud panel modal.
 * Abre o painel de modelos na nuvem.
 */
async function handleOpenCloudPanel() {
    if (!isLoggedIn()) {
        showToast(t('cloud.loginFirst'), 'warning');
        if (window.handleOpenAuthModal)
            window.handleOpenAuthModal();
        return;
    }
    const overlay = getOrCreateOverlay('cloud-panel-overlay');
    overlay.innerHTML = renderCloudPanelLoading();
    overlay.classList.add('active');
    try {
        const [myModels, sharedModels] = await Promise.all([loadModelsFromCloud(), getSharedModels()]);
        overlay.innerHTML = renderCloudPanel(myModels, sharedModels);
        requestAnimationFrame(() => {
            if (window.hydrateIcons)
                window.hydrateIcons();
        });
    }
    catch (err: any) {
        log.error('Failed to load cloud panel', err.message);
        overlay.innerHTML = renderCloudPanelError(err.message);
    }
}
/**
 * Close cloud panel.
 */
function handleCloseCloudPanel() {
    const overlay = document.getElementById('cloud-panel-overlay');
    if (overlay)
        overlay.classList.remove('active');
}
/**
 * Save current model to cloud.
 * Salva modelo atual na nuvem.
 */
async function handleSaveToCloud() {
    if (!isLoggedIn()) {
        showToast(t('cloud.loginToSave'), 'warning');
        return;
    }
    const nameInput = document.getElementById('cloud-save-name');
    const descInput = document.getElementById('cloud-save-desc');
    const name = nameInput?.value?.trim();
    if (!name) {
        showToast(t('cloud.enterModelName'), 'warning');
        return;
    }
    const btn = document.getElementById('cloud-save-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = t('cloud.saving');
    }
    try {
        // Desativa modo efemero - usuario salvou explicitamente
        setEphemeral(false);
        if (currentCloudModelId) {
            await updateModelInCloud(currentCloudModelId);
            showToast(t('cloud.modelUpdated'), 'success');
        }
        else {
            const result = await saveModelToCloud(name, descInput?.value?.trim() || '');
            currentCloudModelId = result.id;
            showToast(t('cloud.modelSaved'), 'success');
        }
        handleOpenCloudPanel(); // refresh list
    }
    catch (err: any) {
        log.error('Save to cloud failed', err.message);
        showToast(t('errorWithMessage', { message: err.message }), 'error');
    }
    finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = t('save');
        }
    }
}
/**
 * Load model from cloud.
 * Carrega modelo da nuvem.
 *
 * @param {string} modelId - UUID do modelo
 */
async function handleLoadFromCloud(modelId: any) {
    try {
        showToast(t('cloud.loadingModel'), 'info');
        const modelData = await loadModelFromCloud(modelId);
        if (!modelData)
            throw new Error(t('cloud.emptyModel'));
        // Desativa modo efemero e limpa dados stale antes de carregar
        setEphemeral(false);
        clearModelData();
        await applyModel(modelData);
        currentCloudModelId = modelId;
        showToast(t('cloud.modelLoaded'), 'success');
        handleCloseCloudPanel();
        requestCloudUIRefresh(UI_INVALIDATION_DOMAINS.MODEL, 'cloud:load-model');
    }
    catch (err: any) {
        log.error('Load from cloud failed', err.message);
        showToast(t('errorWithMessage', { message: err.message }), 'error');
    }
}
/**
 * Open autosave history (lanes + snapshots) modal.
 * Abre modal de histórico de autosave com gerenciamento de raias.
 */
async function handleOpenAutosaveHistory() {
    if (!isLoggedIn()) {
        showToast(t('cloud.loginToRecoverStates'), 'warning');
        return;
    }
    try {
        // OPT-3: replace `auth.getSession()` with cached `getCurrentUser()` +
        // `getAccessToken()` - both populated by buildSession() at bootstrap
        // and kept in sync by onAuthStateChange. Avoids redundant Supabase
        // round-trip on every save click.
        const user = getCurrentUser();
        const hasPersistedToken = _hasPersistedSupabaseToken();
        const accessToken = getAccessToken();
        if (!hasPersistedToken || !user?.id || !accessToken) {
            showToast(t('cloud.sessionExpiredRecover'), 'warning');
            return;
        }
    }
    catch {
        showToast(t('cloud.sessionUnavailable'), 'warning');
        return;
    }
    const overlay = getOrCreateOverlay('autosave-history-overlay');
    overlay.innerHTML = renderAutosaveHistoryLoading();
    overlay.classList.add('active');
    await _renderAutosaveLanesModal(overlay);
}
/**
 * Re-render the autosave lanes modal with current data.
 * @param {HTMLElement} [overlay?]
 */
async function _renderAutosaveLanesModal(overlay?: any) {
    const el = overlay || document.getElementById('autosave-history-overlay');
    if (!el)
        return;
    try {
        // Carregar raias
        let lanes = getCachedLanes();
        if (!lanes || lanes.length === 0) {
            lanes = await loadAutosaveLanes();
        }
        const activeLane = getActiveLane();
        const displayLaneId = activeLane?.id || lanes[0]?.id || null;
        // Carregar snapshots da raia ativa
        let snapshots = [];
        if (displayLaneId) {
            const lane = lanes.find((l: any) => l.id === displayLaneId);
            snapshots = lane
                ? await listAutosaveSnapshots({ scopeKey: lane.scope_key, limit: 5, includeThumbnail: true })
                : [];
        }
        // Fallback: sessão local IDB se sem snapshots
        if (snapshots.length === 0) {
            const { idbGet } = await import('../storage/idbStore.js' as string);
            const localSession = await idbGet('ecbyts-session');
            const localElements = Array.isArray(localSession?.elements) ? localSession.elements.length : 0;
            const localCampaigns = Array.isArray(localSession?.campaigns) ? localSession.campaigns.length : 0;
            if (localSession && (localElements > 0 || localCampaigns > 0)) {
                snapshots = [
                    {
                        id: '__local_session_latest__',
                        created_at: new Date().toISOString(),
                        element_count: localElements,
                        campaign_count: localCampaigns,
                        thumbnail_data: null,
                    },
                ];
            }
        }
        const user = getCurrentUser();
        const tier = user?.tier || 'free';
        el.innerHTML = renderAutosaveLanesModal(lanes, displayLaneId, snapshots, tier);
        requestAnimationFrame(() => {
            if (window.hydrateIcons)
                window.hydrateIcons();
        });
    }
    catch (err: any) {
        log.error('Load autosave lanes modal failed', err.message);
        el.innerHTML = renderAutosaveHistoryError(err.message);
    }
}
function handleCloseAutosaveHistory() {
    const overlay = document.getElementById('autosave-history-overlay');
    if (overlay)
        overlay.classList.remove('active');
}
// ----------------------------------------------------------------
// LANE MANAGEMENT HANDLERS
// ----------------------------------------------------------------
/**
 * Set active lane and re-render modal.
 * @param {string} laneId
 */
async function handleSetActiveLane(laneId: any) {
    if (!laneId)
        return;
    setActiveLane(laneId);
    await _renderAutosaveLanesModal();
}
/**
 * Create a new autosave lane.
 */
async function handleCreateAutosaveLane() {
    const name = await asyncPrompt(t('cloud.laneNamePrompt'), '');
    if (!name)
        return;
    const result = await createAutosaveLane(name.trim());
    if (!result.ok) {
        showToast(result.reason || t('cloud.errorCreatingLane'), 'warning');
        return;
    }
    setActiveLane(result.lane.id);
    showToast(t('cloud.laneCreated', { name: result.lane.name }), 'success');
    await _renderAutosaveLanesModal();
}
/**
 * Rename the active autosave lane.
 */
async function handleRenameAutosaveLane() {
    const lane = getActiveLane();
    if (!lane)
        return;
    const newName = await asyncPrompt(t('cloud.newLaneNamePrompt'), lane.name);
    if (!newName || newName.trim() === lane.name)
        return;
    const ok = await renameAutosaveLane(lane.id, newName.trim());
    if (ok) {
        showToast(t('cloud.laneRenamed'), 'success');
        await _renderAutosaveLanesModal();
    }
    else {
        showToast(t('cloud.errorRenamingLane'), 'error');
    }
}
/**
 * Delete the active autosave lane (with confirmation).
 */
async function handleDeleteAutosaveLane() {
    const lane = getActiveLane();
    if (!lane)
        return;
    const lanes = getCachedLanes();
    if (lanes.length <= 1) {
        showToast(t('cloud.cannotDeleteOnlyLaneToast'), 'warning');
        return;
    }
    const confirmed = await asyncConfirm(t('cloud.confirmDeleteLane', { name: lane.name }));
    if (!confirmed)
        return;
    const ok = await deleteAutosaveLane(lane.id);
    if (ok) {
        showToast(t('cloud.laneDeleted'), 'success');
        await _renderAutosaveLanesModal();
    }
    else {
        showToast(t('cloud.errorDeletingLane'), 'error');
    }
}
/**
 * Restore a model snapshot from autosave history.
 * Restaura um snapshot do histórico automático.
 *
 * @param {string} snapshotId
 */
async function handleRestoreAutosaveSnapshot(snapshotId: any) {
    if (!snapshotId)
        return;
    try {
        showToast(t('cloud.restoringState'), 'info');
        let snapshot = null;
        let modelData = null;
        if (snapshotId === '__local_session_latest__') {
            const { idbGet } = await import('../storage/idbStore.js' as string);
            modelData = await idbGet('ecbyts-session');
        }
        else {
            snapshot = await loadAutosaveSnapshot(snapshotId);
            modelData = snapshot?.snapshot_data;
        }
        if (!modelData)
            throw new Error(t('cloud.emptySnapshot'));
        setEphemeral(false);
        await clearModelData();
        await applyModel(modelData);
        currentCloudModelId = snapshot?.model_id || null;
        requestCloudUIRefresh(UI_INVALIDATION_DOMAINS.MODEL, 'cloud:restore-autosave');
        showToast(t('cloud.stateRestored'), 'success');
        handleCloseAutosaveHistory();
    }
    catch (err: any) {
        log.error('Restore autosave snapshot failed', err.message);
        showToast(t('errorWithMessage', { message: err.message }), 'error');
    }
}
/**
 * Restore latest snapshot from current active lane.
 * Restaura o snapshot mais recente da raia ativa.
 */
async function handleRestoreActiveLaneLatestSnapshot() {
    try {
        const lane = getActiveLane();
        if (!lane?.scope_key) {
            showToast(t('cloud.noActiveLane'), 'warning');
            return;
        }
        const snaps = await listAutosaveSnapshots({ scopeKey: lane.scope_key, limit: 1 });
        const latest = Array.isArray(snaps) && snaps.length ? snaps[0] : null;
        if (!latest?.id) {
            showToast(t('cloud.noSnapshotsInLane', { name: lane.name || t('active') }), 'warning');
            return;
        }
        await handleRestoreAutosaveSnapshot(latest.id);
    }
    catch (err: any) {
        log.error('Restore active lane latest snapshot failed', err.message);
        showToast(t('errorWithMessage', { message: err.message }), 'error');
    }
}
function _hasPersistedSupabaseToken() {
    try {
        const keys = Object.keys(localStorage || {});
        for (const key of keys) {
            if (!key.startsWith('sb-') || !key.endsWith('-auth-token'))
                continue;
            const raw = localStorage.getItem(key) || '';
            if (!raw)
                continue;
            const parsed = JSON.parse(raw);
            if (parsed?.access_token)
                return true;
        }
    }
    catch {
        return false;
    }
    return false;
}
/**
 * Delete model from cloud with confirmation.
 * Deleta modelo da nuvem com confirmacao.
 *
 * @param {string} modelId - UUID do modelo
 * @param {string} modelName - Nome do modelo (para confirmacao)
 */
async function handleDeleteFromCloud(modelId: any, modelName: any) {
    if (!(await asyncConfirm(t('cloud.confirmDeleteModel', { name: modelName }))))
        return;
    try {
        await deleteModelFromCloud(modelId);
        if (currentCloudModelId === modelId)
            currentCloudModelId = null;
        showToast(t('cloud.modelDeleted'), 'success');
        handleOpenCloudPanel(); // refresh list
    }
    catch (err: any) {
        log.error('Delete from cloud failed', err.message);
        showToast(t('errorWithMessage', { message: err.message }), 'error');
    }
}
// ----------------------------------------------------------------
// SHARING
// ----------------------------------------------------------------
/**
 * Open share modal for a specific model.
 * Abre modal de compartilhamento para um modelo.
 *
 * @param {string} modelId - UUID do modelo
 */
async function handleShareModel(modelId: any) {
    const overlay = getOrCreateOverlay('share-modal-overlay');
    try {
        const shares = await getModelShares(modelId);
        overlay.innerHTML = renderShareModal(modelId, shares);
        overlay.classList.add('active');
        requestAnimationFrame(() => {
            if (window.hydrateIcons)
                window.hydrateIcons();
        });
    }
    catch (err: any) {
        log.error('Load share modal failed', err.message);
        showToast(t('errorWithMessage', { message: err.message }), 'error');
    }
}
/**
 * Execute share action.
 * Executa compartilhamento.
 */
async function handleShareSubmit() {
    const modelId = document.getElementById('share-model-id')?.value;
    const email = document.getElementById('share-email')?.value?.trim();
    const permission = document.getElementById('share-permission')?.value || 'viewer';
    if (!email) {
        showToast(t('cloud.enterEmail'), 'warning');
        return;
    }
    if (!modelId) {
        showToast(t('cloud.modelNotSelected'), 'error');
        return;
    }
    try {
        const result = await shareModel(modelId, email, permission);
        showToast(t('cloud.sharedWithCode', { code: result.share_code }), 'success');
        handleShareModel(modelId); // refresh
    }
    catch (err: any) {
        log.error('Share submit failed', err.message);
        showToast(t('errorWithMessage', { message: err.message }), 'error');
    }
}
/**
 * Load a shared model by code.
 * Carrega modelo compartilhado pelo codigo.
 */
async function handleLoadSharedModel() {
    const codeInput = document.getElementById('share-code-input');
    const code = codeInput?.value?.trim();
    if (!code) {
        showToast(t('cloud.enterCode'), 'warning');
        return;
    }
    try {
        showToast(t('cloud.loadingSharedModel'), 'info');
        const modelData = await loadModelByShareCode(code);
        if (!modelData)
            throw new Error(t('cloud.modelNotFound'));
        await applyModel(modelData);
        showToast(t('cloud.sharedModelLoaded'), 'success');
        handleCloseCloudPanel();
        requestCloudUIRefresh(UI_INVALIDATION_DOMAINS.MODEL, 'cloud:load-shared-model');
    }
    catch (err: any) {
        log.error('Load shared model failed', err.message);
        showToast(t('errorWithMessage', { message: err.message }), 'error');
    }
}
/**
 * Revoke a share.
 * @param {string} shareId
 * @param {string} modelId - to refresh the modal
 */
async function handleRevokeShare(shareId: any, modelId: any) {
    try {
        await revokeShare(shareId);
        showToast(t('cloud.shareRevoked'), 'success');
        handleShareModel(modelId); // refresh
    }
    catch (err: any) {
        log.error('Revoke share failed', err.message);
        showToast(t('errorWithMessage', { message: err.message }), 'error');
    }
}
function handleCloseShareModal() {
    const overlay = document.getElementById('share-modal-overlay');
    if (overlay)
        overlay.classList.remove('active');
}
// ----------------------------------------------------------------
// PROFESSIONAL REGISTRATION
// ----------------------------------------------------------------
/**
 * Open professional registration modal.
 * Abre modal de registro profissional.
 */
async function handleOpenProfessionalModal() {
    if (!isLoggedIn()) {
        showToast(t('cloud.loginFirst'), 'warning');
        return;
    }
    const overlay = getOrCreateOverlay('professional-modal-overlay');
    const profile = await getProfessionalProfile();
    overlay.innerHTML = renderProfessionalModal(profile);
    overlay.classList.add('active');
    requestAnimationFrame(() => {
        if (window.hydrateIcons)
            window.hydrateIcons();
    });
}
/**
 * Submit professional verification request.
 * Submete pedido de verificacao profissional.
 */
async function handleSubmitProfessional() {
    const councilId = document.getElementById('prof-council-id')?.value?.trim();
    const fileInput = document.getElementById('prof-proof-file');
    const file = fileInput?.files?.[0];
    if (!councilId) {
        showToast(t('cloud.enterCouncilNumber'), 'warning');
        return;
    }
    if (!file) {
        showToast(t('cloud.selectProofFile'), 'warning');
        return;
    }
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        showToast(t('cloud.fileTooLarge'), 'warning');
        return;
    }
    const btn = document.getElementById('prof-submit-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = t('cloud.verifying');
    }
    try {
        const result = await submitProfessionalRequest(councilId, file);
        if (result.approved) {
            showToast(t('cloud.verificationApproved'), 'success');
        }
        else {
            showToast(t('cloud.verificationRejected', { reason: result.reason }), 'warning');
        }
        handleOpenProfessionalModal(); // refresh
    }
    catch (err: any) {
        log.error('Professional verification failed', err.message);
        showToast(t('errorWithMessage', { message: err.message }), 'error');
    }
    finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = t('cloud.sendForVerification');
        }
    }
}
function handleCloseProfessionalModal() {
    const overlay = document.getElementById('professional-modal-overlay');
    if (overlay)
        overlay.classList.remove('active');
}
// ----------------------------------------------------------------
// SUBSCRIPTION
// ----------------------------------------------------------------
/**
 * Open subscription modal.
 * Abre modal de assinatura.
 */
function handleOpenSubscription() {
    if (!isLoggedIn()) {
        showToast(t('cloud.loginFirst'), 'warning');
        return;
    }
    const overlay = getOrCreateOverlay('subscription-modal-overlay');
    const info = getSubscriptionInfo();
    const profStatus = getProfessionalStatus();
    overlay.innerHTML = renderSubscriptionModal(info, profStatus);
    overlay.classList.add('active');
    requestAnimationFrame(() => {
        if (window.hydrateIcons)
            window.hydrateIcons();
    });
}
/**
 * Start checkout with selected provider.
 * Inicia checkout com o provider selecionado.
 *
 * @param {'stripe'|'paypal'} _provider
 */
async function handleStartCheckout(_provider: any) {
    try {
        // Route through unified $ECBT checkout modal
        const { openCheckoutModal } = await import('../ui/checkoutModal.js' as string);
        openCheckoutModal('subscription_pro', null, {
            itemName: 'Plano Pro',
            itemSubtitle: t('cloud.monthlySubscription'),
        });
    }
    catch (err: any) {
        log.error('Checkout failed', err.message);
        showToast(t('errorWithMessage', { message: err.message }), 'error');
    }
}
/**
 * Cancel subscription with confirmation.
 */
async function handleCancelSubscription() {
    if (!(await asyncConfirm(t('cloud.cancelSubscriptionConfirm'))))
        return;
    try {
        await cancelSubscription();
        showToast(t('cloud.subscriptionCanceled'), 'info');
        handleOpenSubscription(); // refresh
    }
    catch (err: any) {
        log.error('Cancel subscription failed', err.message);
        showToast(t('errorWithMessage', { message: err.message }), 'error');
    }
}
function handleCloseSubscriptionModal() {
    const overlay = document.getElementById('subscription-modal-overlay');
    if (overlay)
        overlay.classList.remove('active');
}
async function handleGoToProfessionalVerification() {
    handleCloseSubscriptionModal();
    await handleOpenProfessionalModal();
}
// ----------------------------------------------------------------
// PROFESSIONAL VALIDATION (on elements)
// ----------------------------------------------------------------
/**
 * Validate all elements in current model.
 * Valida todos os elementos do modelo atual.
 */
async function handleValidateAllElements() {
    const user = getCurrentUser();
    if (!user || user.professionalStatus !== 'approved' || user.subscriptionStatus !== 'active') {
        showToast(t('cloud.professionalRequired'), 'warning');
        return;
    }
    const elements = getAllElements();
    const ids = elements.map((el: any) => el.id);
    // Fetch council_id from profile for the validation tag
    const profile = await getProfessionalProfile();
    if (profile?.council_id) {
        setValidationCouncilId(profile.council_id);
    }
    const success = validateElements(ids);
    if (success) {
        showToast(t('cloud.elementsValidated', { count: ids.length }), 'success');
        requestCloudUIRefresh(UI_INVALIDATION_DOMAINS.VALIDATION, 'cloud:validate-elements');
    }
    else {
        showToast(t('cloud.validateElementsError'), 'error');
    }
}
// ----------------------------------------------------------------
// INIT - Check payment return on page load
// ----------------------------------------------------------------
/**
 * Check if returning from payment redirect.
 * Deve ser chamado no init da aplicacao.
 */
async function handleCheckPaymentReturn() {
    const result: any = await checkPaymentReturn();
    if (result && result.reason === 'processing_pending') {
        // Mercado Pago: webhook ainda nao chegou
        showToast(t('cloud.paymentProcessing'), 'info');
    }
    else if (result === true || result?.confirmed) {
        showToast(t('cloud.paymentConfirmed'), 'success');
        handleOpenSubscription(); // atualizar modal se aberto
    }
}
// ----------------------------------------------------------------
// RENDER FUNCTIONS
// ----------------------------------------------------------------
function renderCloudPanelLoading() {
    return `
    <div class="cloud-modal-content" style="padding:40px;text-align:center;">
        <p>${t('cloud.loadingModels')}</p>
    </div>`;
}
function renderCloudPanelError(msg: any) {
    return `
    <div class="cloud-modal-content" style="padding:40px;text-align:center;">
        <p style="color:var(--danger);">${t('errorWithMessage', { message: escapeHtml(msg) })}</p>
        <button class="btn btn-sm" data-cc-action="cc-d1c7ce47">${t('close')}</button>
    </div>`;
}
function renderAutosaveHistoryLoading() {
    return `
    <div class="cloud-modal-content autosave-modal-content" style="padding:32px;text-align:center;">
        <p>${t('cloud.loadingAutosaveHistory')}</p>
    </div>`;
}
function renderAutosaveHistoryError(msg: any) {
    return `
    <div class="cloud-modal-content autosave-modal-content" style="padding:32px;text-align:center;">
        <p style="color:var(--danger);">${t('errorWithMessage', { message: escapeHtml(msg) })}</p>
        <button class="btn btn-sm" data-cc-action="cc-b0308e3a">${t('close')}</button>
    </div>`;
}
/**
 * Render autosave lanes modal with lane selector and snapshot grid.
 * @param {any[]} lanes - Lista de raias
 * @param {string|null} activeLaneId - ID da raia ativa
 * @param {any[]} snapshots - Snapshots da raia ativa
 * @param {string} tier - Tier do usuário ('free'|'professional'|...)
 */
function renderAutosaveLanesModal(
lanes: any[], 
activeLaneId: any, 
snapshots: any[], 
tier: any) {
    const LANE_LIMIT = 3; // AUTOSAVE_MAX_LANES_FREE — mantido em sync com manager.js
    const isFree = !tier || tier === 'free';
    const atLimit = isFree && lanes.length >= LANE_LIMIT;
    // Select de raias
    const laneOptions = (lanes || [])
        .map((l: any) => {
        const sel = l.id === activeLaneId ? ' selected' : '';
        return `<option value="${escapeAttr(l.id)}"${sel}>${escapeHtml(l.name)}</option>`;
    })
        .join('');
    const quotaBadge = isFree
        ? `<span class="autosave-quota-badge">${t('cloud.quotaBadgeFree', { current: lanes.length, limit: LANE_LIMIT })}</span>`
        : `<span class="autosave-quota-badge autosave-quota-pro">${t('cloud.unlimitedLanesPro')}</span>`;
    const newBtn = atLimit
        ? `<button class="btn btn-secondary btn-sm" disabled title="${t('cloud.laneLimitTooltip', { count: LANE_LIMIT })}">+ ${t('cloud.newLane')}</button>`
        : `<button class="btn btn-secondary btn-sm" data-cc-action="cc-087afa10">+ ${t('cloud.newLane')}</button>`;
    // Grid de snapshots
    const snapshotRows = (snapshots || [])
        .map((s: any, idx: number) => {
        const date = new Date(s.created_at).toLocaleString();
        const thumb = s.thumbnail_data
            ? `<img class="autosave-thumb" src="${escapeAttr(s.thumbnail_data)}" alt="${t('cloud.snapshotAlt', { number: idx + 1 })}" />`
            : `<div class="autosave-thumb autosave-thumb-empty"><span>${t('cloud.noPreview')}</span></div>`;
        return `
            <article class="autosave-card">
                ${thumb}
                <div class="autosave-card-meta">
                    <div class="autosave-card-title">${t('cloud.stateNumber', { number: idx + 1 })}</div>
                    <div class="autosave-card-info">${s.element_count || 0} ${t('cloud.elementCountShort')} &bull; ${s.campaign_count || 0} ${t('cloud.campaignCountShort')}</div>
                    <div class="autosave-card-date">${date}</div>
                </div>
                <div class="autosave-card-actions">
                    <button class="btn btn-sm btn-primary" data-cc-call-click="handleRestoreAutosaveSnapshot|s:${encodeURIComponent(`${escapeAttr(s.id)}`)}">${t('cloud.restore')}</button>
                </div>
            </article>`;
    })
        .join('');
    const canDelete = lanes.length > 1;
    return `
    <div class="cloud-modal-content autosave-modal-content">
        <div class="cloud-modal-header">
            <h3>${t('cloud.autoSaveTitle')}</h3>
            <button class="btn-close" data-cc-action="cc-b0308e3a">&times;</button>
        </div>
        <div class="autosave-lanes-section">
            <div class="autosave-lanes-row">
                <label class="autosave-lane-label" for="autosave-lane-select">${t('cloud.activeLane')}</label>
                <select data-field-meta="true" data-field-meta-key="auto:autosave-lane-select" id="autosave-lane-select" class="autosave-lane-select"
                        data-cc-change="cc-b43d339b">
                    ${laneOptions || `<option value="">${t('cloud.noLanes')}</option>`}
                </select>
                ${newBtn}
            </div>
            <div class="autosave-lanes-meta">
                ${quotaBadge}
            </div>
        </div>
        <div class="autosave-snapshots-label">${t('cloud.snapshotsLabel', { name: escapeHtml(lanes.find((l: any) => l.id === activeLaneId)?.name || t('cloud.defaultLaneName')) })}</div>
        <div class="autosave-grid">
            ${snapshotRows || `<p class="cloud-empty">${t('cloud.noSnapshotsForLane')}</p>`}
        </div>
        <div class="autosave-lane-actions">
            <button class="btn btn-sm btn-secondary" data-cc-action="cc-bd8c99ae">${t('cloud.renameLane')}</button>
            <button class="btn btn-sm btn-danger" data-cc-action="cc-b4f3658f"
                    ${!canDelete ? 'disabled title="' + t('cloud.cannotDeleteOnlyLane') + '"' : ''}>${t('cloud.deleteLane')}</button>
        </div>
    </div>`;
}
/** @deprecated Mantido para compatibilidade interna — use renderAutosaveLanesModal */
function _renderAutosaveHistory(snapshots: any) {
    return renderAutosaveLanesModal([], null, snapshots, 'free');
}
function renderCloudPanel(myModels: any, sharedModels: any) {
    const user = getCurrentUser();
    const modelRows = myModels
        .map((m: any) => {
        const date = new Date(m.updated_at).toLocaleDateString('pt-BR');
        const profBadge = m.professional_validation
            ? ` <span class="prof-badge" title="${t('cloud.professionallyValidated')}">&#9989;</span>`
            : '';
        return `
        <div class="cloud-model-row">
            <div class="cloud-model-info">
                <strong>${escapeHtml(m.name)}</strong>${profBadge}
                <small>${m.element_count} ${t('cloud.elements')} · ${m.campaign_count} ${t('cloud.campaigns')} · ${date}</small>
            </div>
            <div class="cloud-model-actions">
                <button class="btn btn-xs" data-cc-call-click="handleLoadFromCloud|s:${encodeURIComponent(`${m.id}`)}">${t('cloud.load')}</button>
                <button class="btn btn-xs" data-cc-call-click="handleShareModel|s:${encodeURIComponent(`${m.id}`)}">${t('cloud.share')}</button>
                <button class="btn btn-xs btn-danger" data-cc-call-click="handleDeleteFromCloud|s:${encodeURIComponent(`${m.id}`)}|s:${encodeURIComponent(`${escapeAttr(m.name)}`)}">${t('cloud.delete')}</button>
            </div>
        </div>`;
    })
        .join('');
    const sharedRows = sharedModels
        .map((s: any) => {
        const m = s.models;
        if (!m)
            return '';
        const date = new Date(m.updated_at).toLocaleDateString('pt-BR');
        return `
        <div class="cloud-model-row">
            <div class="cloud-model-info">
                <strong>${escapeHtml(m.name)}</strong>
                <small>${m.element_count} elem · ${s.permission} · ${date}</small>
            </div>
            <div class="cloud-model-actions">
                <button class="btn btn-xs" data-cc-call-click="handleLoadFromCloud|s:${encodeURIComponent(`${m.id}`)}">${t('cloud.load')}</button>
            </div>
        </div>`;
    })
        .join('');
    return `
    <div class="cloud-modal-content">
        <div class="cloud-modal-header">
            <h3>${t('cloud.cloudModels')}</h3>
            <button class="btn-close" data-cc-action="cc-d1c7ce47">&times;</button>
        </div>

        <div class="cloud-save-section">
            <h4>${t('cloud.saveCurrentModel')}</h4>
            <input data-field-meta="true" data-field-meta-key="auto:cloud-save-name" type="text" id="cloud-save-name" placeholder="${t('cloud.modelNamePlaceholder')}" class="input-field"
                   value="${escapeAttr(currentCloudModelId ? t('cloud.updateExistingModel') : '')}" />
            <input data-field-meta="true" data-field-meta-key="auto:cloud-save-desc" type="text" id="cloud-save-desc" placeholder="${t('cloud.descriptionPlaceholder')}" class="input-field" />
            <button id="cloud-save-btn" class="btn btn-primary" data-cc-action="cc-2f5fc487">
                ${currentCloudModelId ? t('cloud.update') : t('cloud.save')}
            </button>
        </div>

        <div class="cloud-share-code-section">
            <h4>${t('cloud.openByCode')}</h4>
            <div style="display:flex;gap:8px;">
                <input data-field-meta="true" data-field-meta-key="auto:share-code-input" type="text" id="share-code-input" placeholder="${t('cloud.sixCharCodePlaceholder')}" class="input-field" maxlength="6"
                       style="text-transform:uppercase;letter-spacing:2px;font-family:monospace;" />
                <button class="btn btn-sm" data-cc-action="cc-788f8e08">${t('cloud.open')}</button>
            </div>
        </div>

        <div class="cloud-models-section">
            <h4>${t('cloud.myModels')} (${myModels.length})</h4>
            ${modelRows || `<p class="cloud-empty">${t('cloud.noModelsSaved')}</p>`}
        </div>

        ${sharedModels.length > 0
        ? `
        <div class="cloud-models-section">
            <h4>${t('cloud.sharedWithMe')} (${sharedModels.length})</h4>
            ${sharedRows}
        </div>`
        : ''}

        <div class="cloud-footer">
            <button class="btn btn-sm" data-cc-action="cc-3143b74c">${t('cloud.autoSaveButton')}</button>
            <button class="btn btn-sm" data-cc-action="cc-31b3d55a">${t('cloud.professionalProfile')}</button>
            <button class="btn btn-sm" data-cc-action="cc-38499b21">${t('cloud.subscription')}</button>
            ${user ? `<button class="btn btn-sm" data-cc-action="cc-2aa87d1e">${t('cloud.apiKeys')}</button>` : ''}
        </div>
    </div>`;
}
function renderShareModal(modelId: any, shares: any) {
    const shareRows = shares
        .map((s: any) => `
        <div class="share-row">
            <span>${escapeHtml(s.shared_with_email)} (${s.permission})</span>
            <span class="share-code">${s.share_code || ''}</span>
            <button class="btn btn-xs btn-danger" data-cc-call-click="handleRevokeShare|s:${encodeURIComponent(`${s.id}`)}|s:${encodeURIComponent(`${modelId}`)}">${t('cloud.revoke')}</button>
        </div>
    `)
        .join('');
    return `
    <div class="cloud-modal-content">
        <div class="cloud-modal-header">
            <h3>${t('cloud.shareModel')}</h3>
            <button class="btn-close" data-cc-action="cc-8a01d4de">&times;</button>
        </div>

        <input type="hidden" id="share-model-id" value="${modelId}" />

        <div style="display:flex;gap:8px;margin-bottom:16px;">
            <input data-field-meta="true" data-field-meta-key="auto-pos:cloud:input:L1012" type="email" id="share-email" placeholder="${t('cloud.recipientEmailPlaceholder')}" class="input-field" style="flex:1;" />
            <select data-field-meta="true" data-field-meta-key="auto:share-permission" id="share-permission" class="input-field" style="width:auto;">
                <option value="viewer">${t('cloud.viewer')}</option>
                <option value="editor">${t('cloud.editor')}</option>
            </select>
            <button class="btn btn-primary btn-sm" data-cc-action="cc-3e212e81">${t('cloud.share')}</button>
        </div>

        ${shares.length > 0
        ? `
        <h4>${t('cloud.activeShares')}</h4>
        ${shareRows}`
        : `<p class="cloud-empty">${t('cloud.noActiveShares')}</p>`}
    </div>`;
}
function renderProfessionalModal(profile: any) {
    const status = String(profile?.professional_status || 'none');
    const councilId = profile?.council_id || '';
    const rejectionReason = profile?.rejection_reason || '';
    const statusLabel = ({
        none: t('cloud.statusNotRequested'),
        pending: t('cloud.statusPending'),
        approved: t('cloud.statusApproved'),
        rejected: t('cloud.statusRejected'),
    } as Record<string, string>)[status] || status;
    const statusColor = 
    ({
        none: 'var(--text-secondary)',
        pending: '#f59e0b',
        approved: '#22c55e',
        rejected: '#ef4444',
    } as Record<string, string>)[status] || 'inherit';
    const isApproved = status === 'approved';
    const subInfo = getSubscriptionInfo() as unknown as Record<string, any>;
    return `
    <div class="cloud-modal-content">
        <div class="cloud-modal-header">
            <h3>${t('cloud.professionalProfile')}</h3>
            <button class="btn-close" data-cc-action="cc-b9c5ef48">&times;</button>
        </div>

        <div class="prof-status" style="margin-bottom:20px;">
            <p>${t('cloud.status')} <strong style="color:${statusColor};">${statusLabel}</strong></p>
            ${councilId ? `<p>${t('cloud.council')} <strong>${escapeHtml(councilId)}</strong></p>` : ''}
            ${rejectionReason ? `<p style="color:#ef4444;font-size:0.9em;">${t('cloud.reason')} ${escapeHtml(rejectionReason)}</p>` : ''}
            ${isApproved && subInfo.isActive ? `<p style="color:#22c55e;">&#9989; ${t('cloud.verifiedProfessionalActiveSubscription')}</p>` : ''}
            ${isApproved && !subInfo.isActive ? `<p style="color:#f59e0b;">${t('cloud.approvedButInactive')} <a href="#" data-cc-action="cc-965d6470">${t('cloud.subscribe')}</a></p>` : ''}
        </div>

        ${!isApproved
        ? `
        <div class="prof-form">
            <h4>${status === 'rejected' ? t('cloud.tryAgain') : t('cloud.requestVerification')}</h4>
            <label>${t('cloud.councilNumberLabel')}</label>
            <input data-field-meta="true" data-field-meta-key="auto:prof-council-id" type="text" id="prof-council-id" placeholder="${t('cloud.credentialPlaceholder')}"
                   class="input-field" value="${escapeAttr(councilId)}" />
            <label>${t('cloud.proofPrintLabel')}</label>
            <input type="file" id="prof-proof-file" accept="image/*,.pdf" class="input-field" />
            <small>${t('cloud.acceptedFormats')}</small>
            <button id="prof-submit-btn" class="btn btn-primary" data-cc-action="cc-7372b00b" style="margin-top:12px;">
                ${t('cloud.sendForVerification')}
            </button>
        </div>`
        : ''}

        ${isApproved && subInfo.isActive
        ? `
        <div class="prof-actions" style="margin-top:20px;">
            <h4>${t('cloud.validateElementsTitle')}</h4>
            <p>${t('cloud.validateElementsDescription')}</p>
            <button class="btn btn-primary" data-cc-action="cc-3266c016">
                ${t('cloud.validateAllElements')}
            </button>
        </div>`
        : ''}
    </div>`;
}
function renderSubscriptionModal(subInfo: any, profStatus: any) {
    const isActive = subInfo.isActive;
    return `
    <div class="cloud-modal-content">
        <div class="cloud-modal-header">
            <h3>${t('cloud.professionalPlan')}</h3>
            <button class="btn-close" data-cc-action="cc-856e0992">&times;</button>
        </div>

        ${isActive
        ? `
        <div class="sub-active" style="text-align:center;padding:20px;">
            <p style="color:#22c55e;font-size:1.2em;">&#9989; ${t('cloud.activeSubscription')}</p>
            <p>${t('cloud.accessProfessionalSeal')}</p>
            <button class="btn btn-sm btn-danger" data-cc-action="cc-eac71b53" style="margin-top:16px;">
                ${t('cloud.cancelSubscription')}
            </button>
        </div>`
        : `
        <div class="sub-plan" style="text-align:center;padding:20px;">
            <div class="sub-price" style="font-size:2em;font-weight:bold;margin:20px 0;">${t('cloud.pricePerMonth', { price: 5 })}</div>
            <ul style="text-align:left;max-width:300px;margin:0 auto 24px;list-style:none;padding:0;">
                <li>&#10003; ${t('cloud.professionalSealFeature')}</li>
                <li>&#10003; ${t('cloud.aiRecognizesData')}</li>
                <li>&#10003; ${t('cloud.visibleTag')}</li>
                <li>&#10003; ${t('cloud.sharingPriority')}</li>
            </ul>

            ${!profStatus.isProfessional
            ? `
            <div style="background:rgba(245,158,11,0.12);border:1px solid #f59e0b;border-radius:8px;padding:16px;max-width:320px;margin:0 auto 20px;text-align:left;">
                <p style="margin:0 0 4px;font-weight:600;color:#f59e0b;">${t('cloud.professionalVerificationRequired')}</p>
                <p style="margin:0 0 12px;font-size:0.85em;color:var(--neutral-300);">${t('cloud.verifyRegistrationFirst')}</p>
                <button type="button" style="background:#f59e0b;color:#000;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font-weight:600;width:100%;"
                        data-cc-action="cc-ca63ccc7">
                    ${t('cloud.verifyProfessionalRegistration')}
                </button>
            </div>`
            : ''}

            <div style="display:flex;flex-direction:column;gap:12px;max-width:280px;margin:0 auto;">
                <button class="btn btn-primary" data-cc-action="cc-8119a925"
                        ${!profStatus.isProfessional ? 'disabled' : ''}>
                    ${t('cloud.payWithCreditCard')}
                </button>
                <button class="btn btn-mp" data-cc-action="cc-adb49c78"
                        ${!profStatus.isProfessional ? 'disabled' : ''}>
                    ${t('cloud.payWithMercadoPago')}
                </button>
            </div>
        </div>`}
    </div>`;
}
// ----------------------------------------------------------------
// OVERLAY HELPER
// ----------------------------------------------------------------
function getOrCreateOverlay(id: any) {
    let overlay = document.getElementById(id);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'cloud-overlay';
        overlay.addEventListener('click', (e: any) => {
            if (e.target === overlay)
                overlay.classList.remove('active');
        });
        overlay.addEventListener('contextmenu', (e: any) => e.preventDefault());
        document.body.appendChild(overlay);
    }
    return overlay;
}
// ----------------------------------------------------------------
// CSS INJECTION
// ----------------------------------------------------------------
function injectCloudStyles() {
    if (document.getElementById('cloud-styles'))
        return;
    const style = document.createElement('style');
    style.id = 'cloud-styles';
    style.textContent = `
        .cloud-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            z-index: 8999;
            justify-content: center;
            align-items: center;
        }
        .cloud-overlay.active { display: flex; }
        .cloud-modal-content {
            background: var(--bg-primary, #1a1a2e);
            border: 1px solid var(--border-color, #333);
            border-radius: 12px;
            padding: 24px;
            max-width: 560px;
            width: 90vw;
            max-height: 80vh;
            overflow-y: auto;
            color: var(--text-primary, #e0e0e0);
        }
        .cloud-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .cloud-modal-header h3 { margin: 0; font-size: 1.2em; }
        .cloud-modal-header .btn-close {
            background: none; border: none; color: var(--text-secondary, #888);
            font-size: 1.5em; cursor: pointer; padding: 0 4px; line-height: 1;
        }
        .cloud-save-section, .cloud-share-code-section, .cloud-models-section, .cloud-footer {
            margin-bottom: 20px;
        }
        .cloud-save-section h4, .cloud-share-code-section h4, .cloud-models-section h4 { margin: 0 0 8px; font-size: 0.95em; }
        .cloud-model-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            background: var(--bg-secondary, #16213e);
            border-radius: 8px;
            margin-bottom: 8px;
        }
        .cloud-model-info { display: flex; flex-direction: column; gap: 2px; }
        .cloud-model-info strong { font-size: 0.95em; }
        .cloud-model-info small { color: var(--text-secondary, #888); font-size: 0.8em; }
        .cloud-model-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .cloud-empty { color: var(--text-secondary, #888); font-style: italic; font-size: 0.9em; }
        .cloud-footer { display: flex; gap: 8px; justify-content: center; border-top: 1px solid var(--border-color, #333); padding-top: 16px; }
        .share-row { display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-secondary, #16213e); border-radius: 6px; margin-bottom: 6px; }
        .share-code { font-family: monospace; letter-spacing: 2px; color: var(--accent, #00d4ff); }
        .prof-badge { font-size: 0.8em; }
        .prof-form label { display: block; margin: 12px 0 4px; font-size: 0.9em; color: var(--text-secondary, #888); }
        .prof-form small { display: block; color: var(--text-secondary, #888); font-size: 0.8em; margin-top: 4px; }
        .input-field {
            width: 100%; padding: 8px 12px; border: 1px solid var(--border-color, #333);
            border-radius: 6px; background: var(--bg-tertiary, #0f3460); color: var(--text-primary, #e0e0e0);
            font-size: 0.9em; box-sizing: border-box;
        }
        .input-field:focus { outline: none; border-color: var(--accent, #00d4ff); }
        .btn-xs { padding: 4px 8px; font-size: 0.75em; }
        .btn-danger { background: #ef4444; color: #fff; }
        .btn-danger:hover { background: #dc2626; }
        .btn-secondary { background: var(--bg-tertiary, #0f3460); color: var(--text-primary, #e0e0e0); border: 1px solid var(--border-color, #333); }
        .btn-mp { background: #009EE3; color: #fff; border: none; border-radius: 6px; padding: 10px 20px; cursor: pointer; font-size: 0.9em; transition: background 0.2s; }
        .btn-mp:hover { background: #007BBF; }
        .btn-mp:disabled { background: #4a9ab8; cursor: not-allowed; }
        .autosave-modal-content { max-width: 920px; }
        .autosave-subtitle { margin: 0 0 14px; color: var(--text-secondary, #9ba3af); font-size: 0.9em; }
        .autosave-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
        }
        .autosave-card {
            background: linear-gradient(180deg, rgba(17, 24, 39, 0.94), rgba(11, 18, 30, 0.98));
            border: 1px solid rgba(73, 85, 104, 0.8);
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .autosave-thumb {
            display: block;
            width: 100%;
            aspect-ratio: 16 / 9;
            object-fit: cover;
            background: #0b1019;
            border-bottom: 1px solid rgba(73, 85, 104, 0.8);
        }
        .autosave-thumb-empty {
            display: flex;
            align-items: center;
            justify-content: center;
            color: #9ba3af;
            font-size: 11px;
            letter-spacing: 0.02em;
        }
        .autosave-card-meta {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 10px 12px 8px;
        }
        .autosave-card-title { font-weight: 700; color: #e5e7eb; }
        .autosave-card-info, .autosave-card-date {
            color: #9ca3af;
            font-size: 11px;
            font-family: 'JetBrains Mono', 'Consolas', monospace;
        }
        .autosave-card-actions {
            padding: 0 12px 12px;
            display: flex;
            justify-content: flex-end;
        }
        .autosave-lanes-section {
            margin-bottom: 16px;
            padding-bottom: 14px;
            border-bottom: 1px solid var(--border-color, #333);
        }
        .autosave-lanes-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .autosave-lane-label {
            font-size: 0.9em;
            color: var(--text-secondary, #9ba3af);
            white-space: nowrap;
        }
        .autosave-lane-select {
            flex: 1;
            min-width: 160px;
            padding: 6px 10px;
            border: 1px solid var(--border-color, #333);
            border-radius: 6px;
            background: var(--bg-tertiary, #0f3460);
            color: var(--text-primary, #e0e0e0);
            font-size: 0.9em;
            cursor: pointer;
        }
        .autosave-lanes-meta {
            margin-top: 6px;
            font-size: 0.8em;
        }
        .autosave-quota-badge {
            color: var(--text-secondary, #9ba3af);
        }
        .autosave-quota-pro {
            color: var(--accent, #00d4ff);
        }
        .autosave-snapshots-label {
            font-size: 0.85em;
            color: var(--text-secondary, #9ba3af);
            margin-bottom: 10px;
            font-weight: 600;
            letter-spacing: 0.02em;
            text-transform: uppercase;
        }
        .autosave-lane-actions {
            display: flex;
            gap: 8px;
            margin-top: 16px;
            padding-top: 14px;
            border-top: 1px solid var(--border-color, #333);
        }
        .btn-sm { padding: 5px 10px; font-size: 0.82em; }
    `;
    document.head.appendChild(style);
}
// Inject styles on module load
injectCloudStyles();
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const cloudHandlers = {
    handleOpenCloudPanel,
    handleCloseCloudPanel,
    handleSaveToCloud,
    handleLoadFromCloud,
    handleOpenAutosaveHistory,
    handleCloseAutosaveHistory,
    handleRestoreAutosaveSnapshot,
    handleRestoreActiveLaneLatestSnapshot,
    handleSetActiveLane,
    handleCreateAutosaveLane,
    handleRenameAutosaveLane,
    handleDeleteAutosaveLane,
    handleDeleteFromCloud,
    handleShareModel,
    handleShareSubmit,
    handleLoadSharedModel,
    handleRevokeShare,
    handleCloseShareModal,
    handleOpenProfessionalModal,
    handleSubmitProfessional,
    handleCloseProfessionalModal,
    handleOpenSubscription,
    handleStartCheckout,
    handleCancelSubscription,
    handleCloseSubscriptionModal,
    handleGoToProfessionalVerification,
    handleValidateAllElements,
    handleCheckPaymentReturn,
    setCurrentCloudModelId,
    getCurrentCloudModelId,
};
