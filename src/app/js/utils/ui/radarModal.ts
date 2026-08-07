// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   RADAR MODAL — Broadcasting de modelos para stakeholders
   2 abas: "Meus Broadcasts" (lista + editor inline) e "Descoberta"
   Segue padrao simulationPanel.js (build-once, toggle display)
   ================================================================ */
import { showToast } from './toast.js';
import { safeJsonParse } from '../helpers/safeJsonParse.js';
import { t } from '../i18n/translations.js';
import { createDeepLinkShareButton } from '../sharing/_deepLinkShareButton.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
// Fix 2026-04-11: replaced require() with static ES import. require is Node
// CommonJS and throws ReferenceError in browser modules; silent catch hid it.
import { getRadarSlotCount as _getRadarSlotCount } from '../../core/radar/manager.js';
import { resolveBroadcastStatus } from '../../core/radar/_broadcastStatusPure.js';
import { formatDiscoveryTimeAgo } from '../../core/radar/_discoveryTimeAgoPure.js';
import {
    buildBroadcastUrl,
    formatDiscoveryDistance,
    buildSlotCounterHtml,
    buildCtaPanelHtml,
    buildDiscoveryFilterBarHtml,
    buildEditorFormHtml,
} from './radar/_broadcastViewPure.js';
import {
    createDefaultBroadcastProfile,
    resolveSectionLabel,
    cleanEmailChipText,
    isAllowedRadarCta,
} from '../../core/radar/_broadcastFormPure.js';
const MODAL_ID = 'radar-modal';
/** @type {*} */
const _state = {
    activeTab: 'broadcasts',
    myModels: [],
    myRadarEntries: [],
    discoveryResults: [],
    editingProfileId: null,
    editingModelId: null,
    stopDiscovery: null,
    /** RND-RADAR-COMM-001 — local offline broadcast previews (random-seeded). */
    localPreviews: [] as any[],
};

/** RND-RADAR-COMM-001 — load random-seeded local broadcast previews (offline). */
function _loadLocalPreviews() {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('ecbyts-radar-previews') : null;
    const parsed = safeJsonParse<any[]>(raw, [], 'Radar-localPreviews');
    _state.localPreviews = Array.isArray(parsed) ? parsed : [];
}

/** RND-RADAR-COMM-001 — render local preview broadcasts into a panel element. */
function _renderLocalPreviews(panel: any) {
    if (!panel) return;
    const cards = (_state.localPreviews as any[])
        .map((p: any) => {
            const fams = (p?.profile?.visible_families || []) as string[];
            return `
            <div class="radar-broadcast">
                <div class="radar-broadcast-info">
                    <span class="radar-broadcast-profile-name">${_esc(p?.profile?.name || 'Broadcast')}</span>
                    <span class="radar-status-preview">${_esc(t('radarPreviewLocal') || 'Preview local')}</span>
                    <div class="radar-broadcast-details">${fams.length ? _esc(fams.join(', ')) : _esc(t('radarPresetComplete') || 'Completo')}</div>
                    <div class="radar-broadcast-details" style="margin-top:4px">
                        <code style="font-size:11px;opacity:.7;cursor:not-allowed"
                              title="${_esc(t('radarPreviewNoLink') || 'Preview local — não transmite. Salve na nuvem para um link real.')}">${_esc(p?.share_code || 'preview')}</code>
                    </div>
                </div>
            </div>`;
        })
        .join('');
    panel.innerHTML = `
        <div class="radar-preview-banner" style="padding:10px 12px;margin-bottom:12px;border:1px solid var(--border-color,#444);border-radius:8px;background:rgba(255,255,255,0.03);font-size:12px;color:var(--text-tertiary,#aaa)">
            ${_esc(t('radarPreviewHint') || 'Preview local gerado pelo modelo aleatório. Salve o modelo na nuvem para transmitir de verdade.')}
        </div>
        ${cards}
    `;
}
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Abre o modal do radar.
 * Carrega modelos do usuario e broadcasts ativos.
 */
export async function openRadarModal() {
    let modal = (document.getElementById(MODAL_ID as any));
    if (!modal) {
        modal = _buildModal();
        document.body.appendChild(modal);
        // DEEP-LINK-TOOLS-001 Sprint 2 — botão Compartilhar no .radar-header
        // (DRY: mesmo pattern de simulationPanel + photoLogModal). Payload null
        // porque Radar mostra dados do usuário logado; state seeding deferido.
        try {
            const header = modal.querySelector('.radar-header');
            const close = modal.querySelector('.radar-close');
            if (header && close) {
                const shareButton = createDeepLinkShareButton({
                    toolId: 'radar',
                    getPayload: () => null,
                    toast: showToast,
                });
                header.insertBefore(shareButton, close);
            }
        } catch (e: any) {
            console.debug('[radarModal:share-button] wire failed', e?.message || e);
        }
    }
    _state.activeTab = 'broadcasts';
    _state.editingProfileId = null;
    _state.editingModelId = null;
    modal.style.display = 'flex';
    _switchTab('broadcasts');
    // Sprint 3 (Calvin 2026-06-03): URL = estado em tempo real
    syncDeepLinkUrl('radar');
    // RND-RADAR-COMM-001 — previews locais (random-seeded) carregam sempre, offline.
    _loadLocalPreviews();
    // Carregar dados
    try {
        await _loadMyData();
        _renderBroadcastsTab();
    } catch (e: any) {
        // auth_required is expected when not logged in - debug, not error
        console.debug('[Radar] Dados nao carregados (auth?):', (e as any)?.message || e);
        // Offline/sem auth: ainda mostra previews locais se houver; senão auth-required.
        const panel = (document.getElementById('radar-tab-broadcasts')) as any;
        if (_state.localPreviews.length && panel) _renderLocalPreviews(panel);
        else _renderAuthRequired();
    }
}
/**
 * Fecha o modal do radar.
 * Para polling de discovery se ativo.
 */
export function closeRadarModal() {
    const modal = (document.getElementById(MODAL_ID)) as any;
    if (modal) {
        modal.style.display = 'none';
        // Sprint 3 (Calvin 2026-06-03): limpa ?tools=radar do address bar
        clearDeepLinkUrl();
    }
    if (_state.stopDiscovery) {
        (_state.stopDiscovery as any)();
        _state.stopDiscovery = null;
    }
}
// ----------------------------------------------------------------
// BUILD MODAL
// ----------------------------------------------------------------
function _buildModal() {
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'radar-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="radar-dialog">
            <div class="radar-header">
                <h2>${t('radarTitle')}</h2>
                <button class="radar-close" type="button" aria-label="Close">&#x2715;</button>
            </div>
            <div class="radar-tabs">
                <button class="radar-tab radar-tab-active" data-tab="broadcasts">${t('radarBroadcast')}</button>
                <button class="radar-tab" data-tab="discovery">${t('radarDiscovery')}</button>
                <button class="radar-tab" data-tab="profiles">${t('radar.profileManager.title')}</button>
                <button class="radar-tab" data-tab="slices">${t('radar.sliceWizard.title')}</button>
                <button class="radar-tab" data-tab="wallet">${t('radar.tokenWallet.title')}</button>
                <button class="radar-tab" data-tab="audit">${t('radar.auditLog.title')}</button>
            </div>
            <div class="radar-content">
                <div id="radar-tab-broadcasts" class="radar-tab-panel radar-tab-panel-active"></div>
                <div id="radar-tab-discovery" class="radar-tab-panel"></div>
                <div id="radar-tab-profiles" class="radar-tab-panel"></div>
                <div id="radar-tab-slices" class="radar-tab-panel"></div>
                <div id="radar-tab-wallet" class="radar-tab-panel"></div>
                <div id="radar-tab-audit" class="radar-tab-panel"></div>
            </div>
        </div>
    `;
    // Close handlers
    modal.querySelector('.radar-close')?.addEventListener('click', closeRadarModal);
    modal.addEventListener('click', (e: any) => {
        if (e.target === modal) closeRadarModal();
    });
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
            e.preventDefault();
            closeRadarModal();
        }
    });
    // Tab switching
    (modal.querySelectorAll('.radar-tab' as any)).forEach((tab: any) => {
        tab.addEventListener('click', () => _switchTab(tab.dataset.tab));
    });
    return modal;
}
// ----------------------------------------------------------------
// TAB SWITCHING
// ----------------------------------------------------------------
/**
 * @param {any} tabId
 */
function _switchTab(tabId: any) {
    _state.activeTab = tabId;
    const modal = (document.getElementById(MODAL_ID)) as any;
    if (!modal) return;
    // Update tab buttons
    (modal.querySelectorAll('.radar-tab' as any)).forEach((t: any) => {
        t.classList.toggle('radar-tab-active', t.dataset.tab === tabId);
    });
    // Update panels
    (modal.querySelectorAll('.radar-tab-panel' as any)).forEach((p: any) => {
        p.classList.remove('radar-tab-panel-active');
    });
    const panel = (document.getElementById(`radar-tab-${tabId}`)) as any;
    if (panel) panel.classList.add('radar-tab-panel-active');
    // Load discovery on first switch
    if (tabId === 'discovery' && !_state.stopDiscovery) {
        _startDiscovery();
    }
    // Render new DataStudio Radar Profiles tabs (lazy CTA panels)
    if (tabId === 'profiles') _renderProfilesPanel();
    else if (tabId === 'slices') _renderSlicesPanel();
    else if (tabId === 'wallet') _renderWalletPanel();
    else if (tabId === 'audit') _renderAuditPanel();
}
/**
 * @param {string} panelId
 * @param {string} iconKey
 * @param {string} titleKey
 * @param {string} bodyKey
 * @param {string} ctaKey
 * @param {string} handlerName
 */
function _renderCtaPanel(panelId: any,iconKey: any,titleKey: any,bodyKey: any,ctaKey: any,handlerName: any) {
    const panel = (document.getElementById(panelId)) as any;
    if (!panel || panel.dataset.rendered === '1') return;
    panel.dataset.rendered = '1';
    // HTML puro (montagem do painel CTA) extraída para _broadcastViewPure;
    // aqui só resolvemos os rótulos i18n via t() e injetamos.
    panel.innerHTML = buildCtaPanelHtml({
        iconKey,
        title: t(titleKey),
        body: t(bodyKey),
        ctaLabel: t(ctaKey),
        handlerName,
    });
}
function _renderProfilesPanel() {
    _renderCtaPanel(
        'radar-tab-profiles',
        'users',
        'radar.profileManager.title',
        'radar.profileManager.description',
        'radar.profileManager.title',
        'handleOpenRadarProfileManager',
    );
}
function _renderSlicesPanel() {
    _renderCtaPanel(
        'radar-tab-slices',
        'layers',
        'radar.sliceWizard.title',
        'radar.profileManager.description',
        'radar.sliceWizard.create',
        'handleOpenRadarSliceWizard',
    );
}
function _renderWalletPanel() {
    _renderCtaPanel(
        'radar-tab-wallet',
        'wallet',
        'radar.tokenWallet.title',
        'radar.tokenWallet.balance',
        'radar.tokenWallet.topup',
        'handleOpenRadarTokenWallet',
    );
}
function _renderAuditPanel() {
    _renderCtaPanel(
        'radar-tab-audit',
        'list',
        'radar.auditLog.title',
        'radar.auditLog.col.event',
        'radar.auditLog.exportCsv',
        'handleOpenRadarAuditLog',
    );
}
// ----------------------------------------------------------------
// DATA LOADING
// ----------------------------------------------------------------
async function _loadMyData() {
    const { getSupabaseClient, getCurrentUser } = await import('../auth/session.js' as string);
    const client = (getSupabaseClient()) as any;
    const user = getCurrentUser();
    if (!client || !user) throw new Error('auth_required');
    // Load user's cloud models
    const { data: models } = await client
        .from('models')
        .select('id, name, description, element_count, campaign_count')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false });
    _state.myModels = models || [];
    // Load active radar entries
    try {
        const { getMyRadarEntries } = await import('../../core/radar/manager.js' as string);
        _state.myRadarEntries = await getMyRadarEntries();
    } catch (e: any) {
        console.debug('[radarModal] loadEntries:', (e as any)?.message || e);
        _state.myRadarEntries = [];
    }
}
// ----------------------------------------------------------------
// BROADCASTS TAB
// ----------------------------------------------------------------
function _renderBroadcastsTab() {
    const panel = (document.getElementById('radar-tab-broadcasts')) as any;
    if (!panel) return;
    if (_state.myModels.length === 0) {
        // RND-RADAR-COMM-001 — sem modelos na nuvem: mostra previews locais
        // (random-seeded) em vez do empty state. Empty só se não houver nem nuvem nem preview.
        if (_state.localPreviews.length) {
            _renderLocalPreviews(panel);
            return;
        }
        panel.innerHTML = `
            <div class="radar-discovery-empty">
                <p>${t('radarNoModels')}</p>
                <p style="font-size:12px;margin-top:8px">${t('radarSaveCloudFirst')}</p>
            </div>
        `;
        return;
    }
    let html = '';
    for (const _model of _state.myModels) {
        const model = (_model) as any;
        /** @type {any[]} */
        const entries = _state.myRadarEntries.filter((e: any) => e.model_id === model.id);
        const isExpanded = entries.length > 0 || _state.editingModelId === model.id;
        html += `
            <div class="radar-model-card" data-model-id="${model.id}">
                <div class="radar-model-header" data-cc-call-click="_radarToggleEditorBody|s:${encodeURIComponent(`${model.id}`)}">
                    <div>
                        <div class="radar-model-name">${_esc(model.name)}</div>
                        <div class="radar-model-meta">${model.element_count || 0} elementos, ${model.campaign_count || 0} campanhas</div>
                    </div>
                    <span class="radar-model-toggle">&#x25BC;</span>
                </div>
                <div class="radar-model-body ${isExpanded ? 'radar-editor-open' : ''}" style="display:${isExpanded ? 'block' : 'none'}">
        `;
        // Existing broadcasts
        for (const entry of (entries as any[])) {
            const profileName = entry.radar_broadcast_profiles?.name || 'Broadcast';
            const families = entry.radar_broadcast_profiles?.visible_families || [];
            const status = _getStatus(entry);
            html += `
                <div class="radar-broadcast">
                    <div class="radar-broadcast-info">
                        <span class="radar-broadcast-profile-name">${_esc(profileName)}</span>
                        <span class="radar-status-${status.cls}">${status.label}</span>
                        <div class="radar-broadcast-details">
                            ${families.length > 0 ? families.join(', ') : t('radarPresetComplete')}
                        </div>
                        ${
                            entry.share_code
                                ? `
                            <div class="radar-broadcast-details" style="margin-top:4px">
                                <code style="font-size:11px;color:var(--accent);cursor:pointer"
                                      data-cc-call-click="_radarCopyBroadcastLink|s:${encodeURIComponent(`${entry.share_code}`)}|t"
                                      title="Clique para copiar">
                                    ${buildBroadcastUrl(window.location.origin, entry.share_code)}
                                </code>
                            </div>
                        `
                                : ''
                        }
                    </div>
                    <div class="radar-broadcast-actions">
                        <button class="radar-btn-secondary" data-cc-call-click="_radarEditProfile|s:${encodeURIComponent(`${entry.profile_id}`)}|s:${encodeURIComponent(`${model.id}`)}">${t('radarActivate').replace('Transmitir', 'Editar')}</button>
                        <button class="radar-btn-danger" data-cc-call-click="_radarDeactivate|s:${encodeURIComponent(`${model.id}`)}|s:${encodeURIComponent(`${entry.profile_id}`)}">${t('radarDeactivate')}</button>
                    </div>
                </div>
            `;
        }
        // Add broadcast button
        html += `
                    <button class="radar-add-btn" data-cc-call-click="_radarNewBroadcast|s:${encodeURIComponent(`${model.id}`)}">
                        + ${t('radarAddBroadcast')}
                    </button>
                </div>
            </div>
        `;
    }
    // Slot counter
    html += _renderSlotCounter();
    panel.innerHTML = html;
}
function _renderSlotCounter() {
    let active = _state.myRadarEntries.length;
    let limit = 1;
    try {
        const s = _getRadarSlotCount();
        active = s.active;
        limit = s.limit;
    } catch (e: any) {
        console.debug('[radarModal] slotCount:', (e as any)?.message || e);
    }
    return buildSlotCounterHtml(active, limit, t('radarSlots'));
}
/**
 * @param {any} entry
 */
function _getStatus(entry: any) {
    // Lógica pura (janela de heartbeat → estado) em core/radar/_broadcastStatusPure;
    // aqui só resolvemos o rótulo i18n a partir de labelKey.
    const vm = resolveBroadcastStatus(entry);
    return { cls: vm.cls, label: t(vm.labelKey) };
}
function _renderAuthRequired() {
    const panel = (document.getElementById('radar-tab-broadcasts')) as any;
    if (!panel) return;
    panel.innerHTML = `
        <div class="radar-discovery-empty">
            <p>Login necessario para usar o Radar.</p>
        </div>
    `;
}
// ----------------------------------------------------------------
// INLINE EDITOR - New/Edit broadcast profile
// ----------------------------------------------------------------
/** @type {Function} registrada via window para onclick inline */
window._radarNewBroadcast = async function (modelId: any) {
    _state.editingModelId = modelId;
    _state.editingProfileId = null;
    const panel = (document.getElementById('radar-tab-broadcasts')) as any;
    if (!panel) return;
    // Append editor below the model card
    const card = (panel.querySelector(`[data-model-id="${modelId}"]`)) as any;
    if (!card) return;
    let editor = (card.querySelector('.radar-editor' as any));
    if (!editor) {
        editor = document.createElement('div');
        editor.className = 'radar-editor radar-editor-open';
        card.appendChild(editor);
    } else {
        editor.classList.add('radar-editor-open');
    }
    await _renderEditor(editor, modelId, null);
};
window._radarEditProfile = async function (profileId: any, modelId: any) {
    _state.editingProfileId = profileId;
    _state.editingModelId = modelId;
    const panel = (document.getElementById('radar-tab-broadcasts')) as any;
    if (!panel) return;
    const card = (panel.querySelector(`[data-model-id="${modelId}"]`)) as any;
    if (!card) return;
    let editor = (card.querySelector('.radar-editor' as any));
    if (!editor) {
        editor = document.createElement('div');
        editor.className = 'radar-editor radar-editor-open';
        card.appendChild(editor);
    } else {
        editor.classList.add('radar-editor-open');
    }
    // Load profile
    try {
        const { getProfilesForModel } = await import('../../core/radar/broadcastProfile.js' as string);
        const profiles = await getProfilesForModel(modelId);
        const profile = profiles.find((p: any) => p.id === profileId);
        await _renderEditor(editor, modelId, profile);
    } catch (e: any) {
        console.error('[Radar] Erro ao carregar perfil:', e);
    }
};
window._radarDeactivate = async function (modelId: any, profileId: any) {
    try {
        const { deactivateRadar } = await import('../../core/radar/manager.js' as string);
        await deactivateRadar(modelId, profileId);
        showToast(t('radarOff'), 'info');
        await _loadMyData();
        _renderBroadcastsTab();
    } catch (e: any) {
        showToast(`Erro: ${(e as any).message}`, 'error');
    }
};
/**
 * @param {any} container
 * @param {any} modelId
 * @param {any} existingProfile
 */
async function _renderEditor(container: any,modelId: any,existingProfile: any) {
    const mod = (await import('../../core/radar/broadcastProfile.js' as string)) as any;
    const { getAvailableFamilies, getAvailableSections, _PRESETS } = mod;
    const families = getAvailableFamilies();
    const sections = getAvailableSections();
    // Default-profile factory puro extraído para core/radar/_broadcastFormPure.
    const profile = existingProfile || createDefaultBroadcastProfile();
    const selectedFamilies = new Set(profile.visible_families || []);
    const selectedSections = new Set(profile.visible_sections || []);
    // Build family checkboxes
    let familyHTML = '';
    for (const fam of families) {
        const checked = selectedFamilies.has(fam.id) ? 'checked' : '';
        familyHTML += `
            <label class="radar-matrix-item">
                <input data-field-meta="true" data-field-meta-key="auto-pos:radarModal:input:L407" type="checkbox" data-family="${fam.id}" ${checked}>
                ${_esc(fam.name)}
            </label>
        `;
    }
    // Build section checkboxes — rótulos PT-BR (mapa + fallback) extraídos
    // para core/radar/_broadcastFormPure (resolveSectionLabel).
    let sectionHTML = '';
    for (const sec of sections) {
        const checked = selectedSections.has(sec) ? 'checked' : '';
        sectionHTML += `
            <label class="radar-matrix-item">
                <input data-field-meta="true" data-field-meta-key="auto-pos:radarModal:input:L430" type="checkbox" data-section="${sec}" ${checked}>
                ${resolveSectionLabel(sec)}
            </label>
        `;
    }
    // Email chips
    const emails = profile.allowed_emails || [];
    const emailChipsHTML = emails
        .map(
            (e: any) =>
                `<span class="radar-email-chip">${_esc(e)} <span class="radar-email-chip-remove" data-email="${_esc(e)}">&#x2715;</span></span>`,
        )
        .join('');
    // HTML puro (montagem do form) extraída para _broadcastViewPure; aqui só
    // resolvemos i18n (t()), escaping (_esc) e os fragmentos pré-montados.
    container.innerHTML = buildEditorFormHtml({
        nameLabel: t('radarProfileName'),
        escName: _esc(profile.name),
        namePlaceholder: t('radar.namePlaceholder'),
        visLabel: t('radarVisPublic').replace('Publico', 'Visibilidade'),
        visPublicLabel: t('radarVisPublic'),
        visPrivateLabel: t('radarVisPrivate'),
        visibility: profile.visibility,
        emailPlaceholder: t('radarEmailPlaceholder'),
        emailChipsHtml: emailChipsHTML,
        presetComplianceLabel: t('radarPresetCompliance'),
        presetExecutiveLabel: t('radarPresetExecutive'),
        presetCompleteLabel: t('radarPresetComplete'),
        familiesLabel: t('radarFamilies'),
        familyHtml: familyHTML,
        selectAllLabel: t('radarSelectAll'),
        deselectAllLabel: t('radarDeselectAll'),
        sectionsLabel: t('radarSections'),
        sectionHtml: sectionHTML,
        isEdit: !!existingProfile,
        saveLabel: t('radarSaveAndBroadcast'),
    });
    // Event: visibility toggle shows/hides email row
    container.querySelector('#radar-ed-vis')?.addEventListener('change', (e: any) => {
        const row = (container.querySelector('#radar-ed-emails-row')) as any;
        if (row) row.style.display = e.target.value === 'private' ? 'flex' : 'none';
    });
    // Event: presets
    (container.querySelectorAll('.radar-preset-btn' as any)).forEach((btn: any) => {
        btn.addEventListener('click', async () => {
            const { applyPreset } = await import('../../core/radar/broadcastProfile.js' as string);
            const result = applyPreset(btn.dataset.preset);
            (container.querySelectorAll('[data-family]' as any)).forEach((cb: any) => {
                cb.checked = result.families.includes(cb.dataset.family);
            });
            (container.querySelectorAll('[data-section]' as any)).forEach((cb: any) => {
                cb.checked = result.sections.includes(cb.dataset.section);
            });
        });
    });
    // Event: select all / deselect all
    container.querySelector('#radar-ed-all')?.addEventListener('click', () => {
        (container.querySelectorAll('[data-family]' as any)).forEach((cb: any) => {
            cb.checked = true;
        });
    });
    container.querySelector('#radar-ed-none')?.addEventListener('click', () => {
        (container.querySelectorAll('[data-family]' as any)).forEach((cb: any) => {
            cb.checked = false;
        });
    });
    // Event: email input (Enter to add chip)
    container.querySelector('#radar-ed-email-input')?.addEventListener('keydown', (e: any) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const input = e.target;
            const email = input.value.trim().toLowerCase();
            if (email && email.includes('@')) {
                const chips = (container.querySelector('#radar-ed-chips')) as any;
                const chip = document.createElement('span');
                chip.className = 'radar-email-chip';
                chip.innerHTML = `${_esc(email)} <span class="radar-email-chip-remove" data-email="${_esc(email)}">&#x2715;</span>`;
                chip.querySelector('.radar-email-chip-remove')?.addEventListener('click', () => chip.remove());
                chips?.appendChild(chip);
                input.value = '';
            }
        }
    });
    // Event: remove email chip
    (container.querySelectorAll('.radar-email-chip-remove' as any)).forEach((btn: any) => {
        btn.addEventListener('click', () => btn.closest('.radar-email-chip')?.remove());
    });
    // Event: cancel
    container.querySelector('#radar-ed-cancel')?.addEventListener('click', () => {
        container.classList.remove('radar-editor-open');
        container.innerHTML = '';
    });
    // Event: delete profile
    container.querySelector('#radar-ed-delete')?.addEventListener('click', async () => {
        if (!existingProfile) return;
        try {
            const { deleteProfile } = await import('../../core/radar/broadcastProfile.js' as string);
            await deleteProfile(existingProfile.id);
            showToast('Perfil excluido', 'info');
            await _loadMyData();
            _renderBroadcastsTab();
        } catch (e: any) {
            showToast(`Erro: ${(e as any).message}`, 'error');
        }
    });
    // Event: save and broadcast
    container.querySelector('#radar-ed-save')?.addEventListener('click', async () => {
        const name = container.querySelector('#radar-ed-name')?.value?.trim();
        if (!name) {
            showToast(t('radarProfileEmpty'), 'warning');
            return;
        }
        const visibility = container.querySelector('#radar-ed-vis')?.value || 'public';
        const visibleFamilies = [...container.querySelectorAll('[data-family]:checked')].map(
            (cb: any) => cb.dataset.family,
        );
        const visibleSections = [...container.querySelectorAll('[data-section]:checked')].map(
            (cb: any) => cb.dataset.section,
        );
        const allowedEmails = [...container.querySelectorAll('.radar-email-chip')].map((chip: any) =>
            cleanEmailChipText(chip.textContent),
        );
        try {
            const bp = await import('../../core/radar/broadcastProfile.js' as string);
            const mgr = await import('../../core/radar/manager.js' as string);
            let profileId: any;
            if (existingProfile) {
                await bp.updateProfile(existingProfile.id, {
                    name,
                    visibility,
                    allowedEmails,
                    visibleFamilies,
                    visibleSections,
                });
                profileId = existingProfile.id;
            } else {
                const created = (await bp.createProfile(modelId, {
                        name,
                        visibility,
                        allowedEmails,
                        visibleFamilies,
                        visibleSections,
                    })) as any;
                profileId = created.id;
            }
            // Activate on radar
            await mgr.activateRadar(modelId, profileId);
            showToast(`${t('radarLive')} — ${name}`, 'success');
            await _loadMyData();
            _renderBroadcastsTab();
        } catch (e: any) {
            const err = (e) as any;
            if (err.message === 'quota_exceeded:radar_slots') {
                showToast(t('radarSlotLimit'), 'warning');
            } else {
                showToast(`Erro: ${err.message}`, 'error');
            }
        }
    });
}
// ----------------------------------------------------------------
// DISCOVERY TAB
// ----------------------------------------------------------------
async function _startDiscovery() {
    const panel = (document.getElementById('radar-tab-discovery')) as any;
    if (!panel) return;
    // HTML puro (barra de filtros) extraída para _broadcastViewPure; aqui só
    // resolvemos os rótulos i18n (com fallback) e injetamos.
    panel.innerHTML = buildDiscoveryFilterBarHtml({
        searchPlaceholder: t('radarSearchPlaceholder') || 'Buscar modelos...',
        applyLabel: t('radarFilterApply') || 'Filtrar próximos',
        clearLabel: t('clear') || 'Limpar',
    });
    const searchInput = (panel.querySelector('#radar-discovery-search')) as any;
    const latInput = (panel.querySelector('#radar-discovery-lat')) as any;
    const lonInput = (panel.querySelector('#radar-discovery-lon')) as any;
    const radiusInput = (panel.querySelector('#radar-discovery-radius')) as any;
    const geolocBtn = (panel.querySelector('#radar-discovery-geoloc')) as any;
    const applyBtn = (panel.querySelector('#radar-discovery-apply')) as any;
    const clearBtn = (panel.querySelector('#radar-discovery-clear')) as any;
    /** @type {*} */
    let searchTimeout: any = null;
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => _pollDiscovery(searchInput.value), 300);
    });
    geolocBtn?.addEventListener('click', () => {
        if (!navigator.geolocation) {
            showToast(t('geolocationUnavailable') || 'Geolocalização indisponível neste navegador', 'warning');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos: any) => {
                latInput.value = pos.coords.latitude.toFixed(4);
                lonInput.value = pos.coords.longitude.toFixed(4);
                showToast(t('geolocationCaptured') || 'Localização capturada', 'success');
            },
            (err: any) => {
                console.debug('[Radar] geoloc denied:', err?.message || err);
                showToast(t('geolocationDenied') || 'Permissão de localização negada', 'warning');
            },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
        );
    });
    applyBtn?.addEventListener('click', async () => {
        const lat = parseFloat(latInput.value);
        const lon = parseFloat(lonInput.value);
        const radius = parseFloat(radiusInput.value);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            showToast(t('radarSpatialMissingPoint') || 'Informe lat/lon ou clique no botão de localização', 'warning');
            return;
        }
        if (!Number.isFinite(radius) || radius <= 0) {
            showToast(t('radarSpatialMissingRadius') || 'Informe raio em km', 'warning');
            return;
        }
        await _pollDiscoveryNearby({ lat, lon }, radius, searchInput.value || '');
    });
    clearBtn?.addEventListener('click', () => {
        latInput.value = '';
        lonInput.value = '';
        radiusInput.value = '50';
        _pollDiscovery(searchInput.value || '');
    });
    // Start polling
    try {
        const { startDiscoveryPolling } = await import('../../core/radar/manager.js' as string);
        _state.stopDiscovery = startDiscoveryPolling((results: any) => {
            _state.discoveryResults = results;
            _renderDiscoveryResults();
        });
    } catch (e: any) {
        console.error('[Radar] Erro ao iniciar discovery:', e);
    }
}
/**
 * @param {{lat:number,lon:number}} center
 * @param {number} center
 * @param {string} radiusKm
 */
async function _pollDiscoveryNearby(center: any,radiusKm: any,search: any) {
    try {
        const { discoverRadarModelsNearby } = await import('../../core/radar/manager.js' as string);
        _state.discoveryResults = await discoverRadarModelsNearby(center, radiusKm, search);
        _renderDiscoveryResults();
        if (_state.discoveryResults.length === 0) {
            showToast(t('radarNoNearbyModels') || `Nenhum digital twin em ${radiusKm}km`, 'info');
        } else {
            showToast(`${_state.discoveryResults.length} twin(s) em ${radiusKm}km`, 'success');
        }
    } catch (e: any) {
        console.error('[Radar] Erro discovery nearby:', e);
        showToast(t('radarDiscoveryError') || 'Erro na descoberta espacial', 'error');
    }
}
/**
 * @param {any} search
 */
async function _pollDiscovery(search: any) {
    try {
        const { discoverRadarModels } = await import('../../core/radar/manager.js' as string);
        _state.discoveryResults = await discoverRadarModels(search);
        _renderDiscoveryResults();
    } catch (e: any) {
        console.debug('[radarModal] pollDiscovery:', (e as any)?.message || e);
    }
}
function _renderDiscoveryResults() {
    const container = (document.getElementById('radar-discovery-results')) as any;
    if (!container) return;
    if (_state.discoveryResults.length === 0) {
        container.innerHTML = `<div class="radar-discovery-empty">${t('radarDiscoveryEmpty')}</div>`;
        return;
    }
    let html = '';
    for (const _item of _state.discoveryResults) {
        const item = (_item) as any;
        const timeAgo = _formatTimeAgo(item.activated_at);
        const distChip = Number.isFinite(item.distanceKm)
            ? `<span class="radar-discovery-distance" style="display:inline-block;padding:2px 8px;border-radius:12px;background:var(--accent,#4fc3f7);color:#000;font-size:11px;font-weight:600;margin-right:6px;">${formatDiscoveryDistance(item.distanceKm)}</span>`
            : '';
        // CC-S1 B3 artesanal: expressão com aspas aninhadas extraída (sweepable)
        const safeProfileId = item.profile_id || '';
        html += `
            <div class="radar-discovery-card">
                <div class="radar-discovery-owner">${distChip}${_esc(item.owner_name || 'Unknown')}</div>
                <div class="radar-discovery-model">${_esc(item.model_name)}</div>
                ${item.profile_name ? `<div class="radar-discovery-profile">${_esc(item.profile_name)}</div>` : ''}
                <div class="radar-discovery-meta">
                    <span class="radar-discovery-stats">
                        ${item.element_count || 0} elementos | ${t('radarLive')} ${timeAgo}
                    </span>
                    <span class="radar-discovery-actions" style="display:inline-flex;gap:6px;">
                        <button class="btn-sm" data-cc-call-click="_radarCaptureData|s:${encodeURIComponent(`${item.model_id}`)}|s:${encodeURIComponent(`${safeProfileId}`)}" title="${t('radarCaptureDataTitle') || 'Capturar dados pré-existentes do local'}">${t('radarCaptureData') || 'Capturar Dados'}</button>
                        <button class="radar-btn-primary" data-cc-call-click="_radarViewDiscovery|s:${encodeURIComponent(`${item.model_id}`)}|s:${encodeURIComponent(`${safeProfileId}`)}">${t('radarViewButton')}</button>
                    </span>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}
/**
 * Captura dados pré-existentes do digital twin descoberto.
 * Importa metadata + elementos visíveis ao current model via mergeModel.
 * Calvin diretiva 2026-05-14.
 *
 * @param {string} str
 * @param {string} profileId
 */
/**
 * CC-S1 B3 artesanal (CCC-001 Fase 11) — copia o link público do broadcast e
 * dá feedback no próprio elemento (era inline clipboard + then).
 */
/**
 * CC-S1 B3 artesanal — CTA dos painéis radar: invoca o handler (whitelist
 * INTERNA hardcoded, defense-in-depth) e fecha o modal (era `${handlerName}();
 * close` inline com nome dinâmico).
 */
const RADAR_CTA_ALLOW = new Set([
    'handleOpenRadarProfileManager',
    'handleOpenRadarSliceWizard',
    'handleOpenRadarTokenWallet',
    'handleOpenRadarAuditLog',
]);
(window as any)._radarCtaOpen = function (name: any) {
    // Guard puro (whitelist) extraído para core/radar/_broadcastFormPure.
    if (!isAllowedRadarCta(name, RADAR_CTA_ALLOW)) return;
    (window as any)[name]?.();
    (window as any).handleCloseRadarModal?.();
};

/**
 * CC-S1 B3 artesanal — toggle do corpo do editor de modelo (era querySelector
 * inline com seletor interpolado e aspas escapadas).
 */
(window as any)._radarToggleEditorBody = function (modelId: any) {
    document
        .querySelector(`[data-model-id='${modelId}'] .radar-model-body`)
        ?.classList.toggle('radar-editor-open');
};

(window as any)._radarCopyBroadcastLink = function (shareCode: any, el: any) {
    const link = buildBroadcastUrl(window.location.origin, shareCode);
    navigator.clipboard.writeText(link).then(() => {
        if (el) el.textContent = t('radar.linkCopied');
    });
};

window._radarCaptureData = async function (modelId: any, profileId: any) {
    if (!modelId) return;
    showToast(t('radarCaptureLoading') || 'Capturando dados pré-existentes...', 'info');
    try {
        const { loadModelFromCloud } = await import('../cloud/manager.js' as string);
        const sourceModel = await loadModelFromCloud(modelId);
        if (!sourceModel) {
            showToast(t('radarCaptureFailed') || 'Falha ao carregar twin', 'error');
            return;
        }
        const captured = {
            elementCount: Array.isArray(sourceModel.elements) ? sourceModel.elements.length : 0,
            campaignCount: Array.isArray(sourceModel.campaigns) ? sourceModel.campaigns.length : 0,
            modelName: sourceModel.name || sourceModel.modelName || modelId,
        };
        try {
            const mergeMod = await import('../../core/diff/engine.js' as string);
            const mergeFn = (mergeMod).mergeModels || (mergeMod as any).default?.mergeModels;
            const currentMod = await import('../../core/elements/manager.js' as string) as any;
            const getCurrent = (currentMod).getAllElements;
            if (typeof mergeFn === 'function' && typeof getCurrent === 'function') {
                const currentElements = getCurrent() || [];
                const baseModel = { elements: currentElements, campaigns: [] };
                const merged = mergeFn(baseModel, sourceModel, { strategy: 'union', tagSource: modelId }) as any;
                if (merged && Array.isArray(merged.elements)) {
                    const addFn = (currentMod).addElement;
                    if (typeof addFn === 'function') {
                        let imported = 0;
                        for (const el of merged.elements) {
                            if (!currentElements.find((c: any) => c.id === el.id)) {
                                try {
                                    addFn(el) as any;
                                    imported++;
                                } catch (_e: any) {
                                    console.debug(
                                        '[radar:capture] skip',
                                        el?.id,
                                        (_e as any)?.message || _e,
                                    );
                                }
                            }
                        }
                        showToast(`${imported} elementos importados de "${captured.modelName}"`, 'success');
                        window.dispatchEvent(new CustomEvent('modelChanged', {
                            detail: { source: 'radar-capture' },
                        }));
                        return;
                    }
                }
            }
        } catch (mergeErr: any) {
            console.debug('[radar:capture] merge unavailable:', (mergeErr as any)?.message || mergeErr);
        }
        // Fallback: just notify, user must use full View Discovery for now
        showToast(`Twin "${captured.modelName}" tem ${captured.elementCount} elementos. Use "Ver" para abrir.`, 'info');
        void profileId;
    } catch (e: any) {
        console.error('[radar:capture] error:', e);
        showToast(t('radarCaptureFailed') || 'Falha ao capturar dados', 'error');
    }
};
window._radarViewDiscovery = async function (modelId: any, profileId: any) {
    showToast('Carregando modelo...', 'info');
    try {
        const { loadModelFromCloud } = await import('../cloud/manager.js' as string);
        const modelData = await loadModelFromCloud(modelId);
        if (profileId) {
            const { getSupabaseClient } = await import('../auth/session.js' as string);
            const client = (getSupabaseClient()) as any;
            if (client) {
                // OPT-1: filterModelData() needs visible_families/sections + hidden_fields
                const { data: profile } = await client
                    .from('radar_broadcast_profiles')
                    .select(
                        'id, name, visibility, allowed_emails, visible_families, visible_sections, hidden_fields, created_at, updated_at',
                    )
                    .eq('id', profileId)
                    .maybeSingle(); // 406-safe: perfil pode ter sido deletado (if (profile) abaixo)
                if (profile) {
                    const { filterModelData } = await import('../../core/radar/broadcastProfile.js' as string);
                    const _filtered = filterModelData(modelData, profile);
                    // TODO: Apply filtered model (requires import pipeline integration)
                    showToast('Modelo filtrado carregado', 'success');
                    closeRadarModal();
                    return;
                }
            }
        }
        showToast('Modelo carregado', 'success');
        closeRadarModal();
    } catch (e: any) {
        showToast(`Erro: ${(e as any).message}`, 'error');
    }
};
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * @param {any} str
 */
function _esc(str: any) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}
/**
 * Lógica pura (idade em ms → rótulo curto) extraída para
 * core/radar/_discoveryTimeAgoPure; aqui só delegamos.
 *
 * @param {any} dateStr
 */
function _formatTimeAgo(dateStr: any) {
    return formatDiscoveryTimeAgo(dateStr);
}
