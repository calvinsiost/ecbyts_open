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
   LLM CHAT HANDLERS — AI assistant chat interface
   Handlers para o chat do assistente de inteligencia artificial

   O assistente IA entende comandos em linguagem natural:
   "adicionar benzeno 10 mg/L no ponto 1 campanha 2"
   Ele interpreta o comando, pede confirmacao e executa a acao.
   ================================================================ */
import * as llmIndexModule from '../../core/llm/index.js';
import * as llmProvidersModule from '../../core/llm/providers.js';
import * as chatToolsModule from '../../core/llm/chatTools.js';
import * as llmRouterModule from '../../core/llm/router.js';
import * as browserEngineModule from '../../core/llm/browserEngine.js';
import * as webLlmEngineModule from '../../core/llm/webllmEngine.js';
import * as localEngineModule from '../../core/llm/localEngine.js';
import * as speechEngineModule from '../../core/llm/speechEngine.js';
import { runBenchmark } from '../../core/llm/benchmark.js';
import { buildSystemPrompt, formatUserMessage, getKnowledgeContext } from '../../core/llm/promptBuilder.js';
import { ensureSAO } from '../../core/sao/index.js';
import { parseResponse, validateActionParams } from '../../core/llm/parser.js';
import { openModal, closeModal } from '../ui/modals.js';
import { showToast } from '../ui/toast.js';
import { Z_INDEX } from '../ui/zIndex.js';
import { t } from '../i18n/translations.js';
import { getElementById } from '../../core/elements/manager.js';
import { hydrateIcons } from '../ui/icons.js';
import { addFloatingResizeHandles } from '../ui/resizeHandles.js';
import { escapeHtml } from '../helpers/html.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { createLogger } from '../helpers/logger.js';
import { safeJsonParse } from '../helpers/safeJsonParse.js';
import { buildLlmRecoveryVM, createSingleFlightGuard } from '../../core/llm/_llmRecoveryPure.js';
import { getContextGuardAudit, getContextGuardMode, isContextGuardEnabled } from '../../core/llm/contextGuardRuntime.js';
import { handleOpenPrivacyContextGuard } from './privacyContextGuardHandlers.js';
// Wave PPP1 Q5 PoC: pure-logic extracted (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM)
import {
    computeTokenPercent as _pureComputeTokenPercent,
    classifyTokenSeverity as _pureClassifyTokenSeverity,
    formatTokenLabel as _pureFormatTokenLabel,
    formatTokenTooltip as _pureFormatTokenTooltip,
    computeCreditsRemainingPercent as _pureComputeCreditsRemainingPercent,
    formatCreditsLabel as _pureFormatCreditsLabel,
    formatCreditsTooltip as _pureFormatCreditsTooltip,
} from './_llmTokenMeterPure.js';
// ARCH-MONOLITH-ATOMIZATION-001 (llm sub-activity): wire pre-extracted pure
// voice/STT logic. Behavior-identical: catalogs + normalizers + locale maps
// were previously inline duplicates here; now the single source of truth is
// _llmChatVoicePure.ts. NOTE: _errorMessage is intentionally NOT replaced
// (it has a null→"null" semantic that differs from the pure errorToMessage).
import {
    VOICE_STORAGE_KEYS_LIST as _pureVoiceStorageKeys,
    EXTERNAL_STT_DEFAULT_MODELS_MAP as _pureExternalSttDefaultModels,
    normalizeSttSource as _pureNormalizeSttSource,
    resolveSttLanguage as _pureResolveSttLanguage,
    resolveTtsLanguage as _pureResolveTtsLanguage,
    resolveExternalModelHint as _pureResolveExternalModelHint,
} from './_llmChatVoicePure.js';
// ARCH-MONOLITH-ATOMIZATION-001 (llm sub-activity): wire pre-extracted pure
// token-usage attribution. Behavior-identical: the input/output split + the
// total→output fallback + the streaming ~4-chars-per-token estimate were
// inline here; single source of truth is now _llmChatTokenUsagePure.ts.
import {
    resolveUsageCharges as _pureResolveUsageCharges,
    estimateStreamingTokens as _pureEstimateStreamingTokens,
} from './_llmChatTokenUsagePure.js';
const window = globalThis.window;
const document = globalThis.document;
const localStorage = globalThis.localStorage;
const navigator = globalThis.navigator;
// eslint-disable-next-line
const CustomEvent = globalThis.CustomEvent;
// eslint-disable-next-line
const MouseEvent = globalThis.MouseEvent;
const {
    processCommand,
    confirmAction,
    cancelAction,
    setPendingAction,
    setApiKey,
    getApiKey,
    setProvider,
    getProvider,
    setModel,
    getModel,
    testConnection,
} = llmIndexModule;
const { LLMProvider, getProviderConfig, getProviderModels, getApiKeyUrl, fetchProviderModels, setProviderModels } =
    llmProvidersModule;
const { toggleTool, isToolActive, getToolById, getAllTools, addUserTool, updateUserTool, removeUserTool } =
    chatToolsModule;
const {
    EngineType,
    getEngine,
    setEngine,
    getEngineDisplayName,
    validateEngineConfig,
    buildEngineSetupGuidance,
    getBrowserModel,
    setBrowserModel,
    getWebLlmModel,
    setWebLlmModel,
    getLocalUrl,
    setLocalUrl,
    getLocalModel,
    setLocalModel,
    routeMessageStream,
} = llmRouterModule;
const { loadBrowserModel, getBrowserModels } = browserEngineModule;
const { loadWebLlmModel, getWebLlmModels, isWebLlmAvailable } = webLlmEngineModule;
const { testLocalConnection, fetchLocalModels } = localEngineModule;
const {
    startRecording,
    stopRecording,
    transcribeAudio,
    transcribeExternalAudio,
    synthesizeSpeech,
    speakNative,
    playAudio,
    stopPlayback,
    getSpeechStatus,
    getSTTModels,
    isSTTEnabled,
    setSTTEnabled,
    isTTSEnabled,
    setTTSEnabled,
    getSTTModel,
    setSTTModel,
    canUseNativeSTT,
    transcribeNativeOnce,
    stopNativeRecognition,
} = speechEngineModule;
/**
 * @param {unknown} error
 * @returns {string}
 */
function _errorMessage(error: any) {
    return error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
}
const log = createLogger('LLMChat');
// Refresh callback injected by main.ts; prefer domain/batched refresh semantics.
let _requestUIRefresh: any = null;
// Cleanup de resize do chat panel
let _chatResizeCleanup: any = null;
// Toggle para chat contextual - quando ativo, ao selecionar um
// elemento o LLM recebe o contexto dele e fica pronto para conversar.
let _contextualChatEnabled = false;
// Toggle para IA proativa - quando ativo, gera dicas automaticas
// ao selecionar elementos e roda analises em background quando idle.
// Default ON - so desliga se localStorage explicitamente '0'.
let _proactiveEnabled = localStorage.getItem('ecbyts-proactive-ai') !== '0';
// Pending tips buffer - armazena tips quando chat esta fechado
let _pendingTips: any = [];
// Token meter - contagem de tokens na sessao atual
let _sessionTokens = 0;
const TOKEN_LIMIT = 1_000_000;
let _creditsRefreshTimer: any = null;
let _voiceSessionActive = false;
const _messageFlight = createSingleFlightGuard();
const _confirmationFlight = createSingleFlightGuard();
// Single source of truth: _llmChatVoicePure.ts (frozen catalogs).
const VOICE_STORAGE_KEYS = _pureVoiceStorageKeys;
let _aiFabMenuEl: any = null;
const EXTERNAL_STT_DEFAULT_MODELS: Record<string, string> = _pureExternalSttDefaultModels;
/**
 * Set the UI refresh callback.
 * Define a funcao de refresh de UI injetada pelo main.
 *
 * @param {Function} fn - The UI refresh function
 */
export function setRequestUIRefresh(fn: any) {
    _requestUIRefresh = fn;
}
// ----------------------------------------------------------------
// CHAT PANEL CONTROLS
// Abrir, fechar e configurar o painel de chat.
// ----------------------------------------------------------------
/**
 * Toggle AI widget between FAB (collapsed) and expanded chat panel.
 * Alterna entre o estado minimizado (bolha FAB) e expandido (janela de chat).
 */
export function toggleAIWidget() {
    const panel = document.getElementById('llm-chat-panel');
    const fab = document.getElementById('ai-widget-fab');
    if (!panel) return;
    const isOpen = panel.classList.contains('open');
    if (isOpen) {
        // Collapse to FAB
        panel.classList.remove('open');
        if (fab) fab.classList.remove('hidden');
        // Reset posicao para padrao (bottom-right CSS)
        panel.style.left = '';
        panel.style.right = '';
        panel.style.bottom = '';
    } else {
        // Expand from FAB
        panel.classList.add('open');
        if (fab) fab.classList.add('hidden');
        _clearPendingNotification();
        // Flush pending proactive tips (acumulados enquanto chat estava fechado)
        if (_pendingTips.length > 0) {
            _renderProactiveTips(_pendingTips);
            _pendingTips = [];
        }
        document.getElementById('llm-input')?.focus();
        updateEngineBadge();
        _ensurePrivacyGuardStatus();
        initAIWidgetDrag();
        initAIWidgetResize();
        _updateMicButtonVisibility();
        // Restaurar dimensoes salvas do chat
        restoreChatDimensions(panel);
        // Verifica configuracao - browser engine nao precisa de API key
        const validation = validateEngineConfig();
        if (!validation.valid) openLLMConfig();
    }
    // Sincronizar estado do toggle no ribbon
    if (window._updateRibbonToggleState) window._updateRibbonToggleState();
}

function _ensurePrivacyGuardStatus() {
    const header = document.querySelector('.llm-chat-header-left');
    if (!header) return;
    let button = document.getElementById('llm-privacy-guard-status') as HTMLButtonElement | null;
    if (!button) {
        button = document.createElement('button');
        button.id = 'llm-privacy-guard-status';
        button.type = 'button';
        button.className = 'engine-badge panel-header-btn';
        button.style.border = '1px solid currentColor';
        button.style.cursor = 'pointer';
        button.addEventListener('click', () => {
            handleOpenPrivacyContextGuard({
                mode: getContextGuardMode(),
                redactions: getContextGuardAudit(),
                onToggleConfirmed: () => _ensurePrivacyGuardStatus(),
            });
        });
        header.appendChild(button);
    }
    const enabled = isContextGuardEnabled();
    button.dataset.state = enabled ? 'protected' : 'open';
    button.setAttribute(
        'aria-label',
        enabled ? 'Proteção de dados ativa. Abrir detalhes.' : 'Proteção de dados desativada. Abrir detalhes.',
    );
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    button.title = enabled
        ? 'Dados sensíveis são protegidos antes do envio para a IA'
        : 'Atenção: proteção de dados desativada';
    button.textContent = enabled ? 'Proteção ativa' : 'Proteção desativada';
}
/**
 * Open right-click context menu for AI FAB (droplet).
 * Abre menu de contexto no bot IA (gota).
 * @param {MouseEvent} e
 */
export function handleAIBotContextMenu(e: any) {
    e.preventDefault();
    e.stopPropagation();
    _ensureAIFabContextMenu();
    _renderAIFabContextMenu();
    _showAIFabContextMenu(e.clientX, e.clientY);
}
/**
 * Ensure context menu DOM exists and listeners are attached.
 */
function _ensureAIFabContextMenu() {
    if (_aiFabMenuEl) return;
    _aiFabMenuEl = document.createElement('div');
    _aiFabMenuEl.id = 'ai-fab-context-menu';
    _aiFabMenuEl.className = 'panel-context-menu';
    _aiFabMenuEl.style.minWidth = '300px';
    _aiFabMenuEl.style.zIndex = String(Z_INDEX.EXCEPTION_LLM_CHAT_FAB_MENU);
    _aiFabMenuEl.style.display = 'none';
    document.body.appendChild(_aiFabMenuEl);
    _aiFabMenuEl.addEventListener('contextmenu', (ev: any) => ev.preventDefault());
    _aiFabMenuEl.addEventListener('click', (ev: any) => {
        const item = ev.target.closest('.panel-context-menu-item');
        if (!item) return;
        const action = item.dataset.action || '';
        if (action === 'toggle-converse-minimized') {
            toggleConverseWhenMinimized();
            _renderAIFabContextMenu();
            return;
        }
        if (action === 'open-chat') {
            openLLMChat();
            _hideAIFabContextMenu();
            return;
        }
        if (action === 'open-config') {
            openLLMConfig();
            _hideAIFabContextMenu();
            return;
        }
        // RECOVERY-ON-DEMAND (Calvin pedido 2026-06-02):
        // Modal "Trabalho não salvo" só abre via este item do menu ecby.
        if (action === 'check-crash-recovery') {
            try {
                const fn = (window as any).handleCheckCrashRecovery;
                if (typeof fn === 'function') fn();
            } catch (e: any) {
                console.debug('[llmChat:fab-menu] crash-recovery:', _errorMessage(e));
            }
            _hideAIFabContextMenu();
            return;
        }
    });
    document.addEventListener('click', (ev: any) => {
        if (_aiFabMenuEl && !_aiFabMenuEl.contains(ev.target)) _hideAIFabContextMenu();
    });
    document.addEventListener('keydown', (ev: any) => {
        if (ev.key === 'Escape') _hideAIFabContextMenu();
    });
}
/**
 * Render context menu items.
 */
function _renderAIFabContextMenu() {
    if (!_aiFabMenuEl) return;
    const enabled = isConverseWhenMinimizedEnabled();
    const check = enabled ? '&#10003;' : '&#9675;';
    _aiFabMenuEl.innerHTML = `
        <button class="panel-context-menu-item" data-action="toggle-converse-minimized">
            <span class="icon" style="width:14px;text-align:center">${check}</span>
            <span>${t('voiceConverseMinimized') || 'Converse while chat is minimized'}</span>
        </button>
        <div class="panel-context-menu-separator"></div>
        <button class="panel-context-menu-item" data-action="open-chat">
            <span class="icon" data-icon="message-circle"></span>
            <span>${t('openChat') || 'Open chat'}</span>
        </button>
        <button class="panel-context-menu-item" data-action="open-config">
            <span class="icon" data-icon="settings"></span>
            <span>${t('openSettings') || 'Open settings'}</span>
        </button>
        <div class="panel-context-menu-separator"></div>
        <button class="panel-context-menu-item" data-action="check-crash-recovery">
            <span class="icon" data-icon="rotate-ccw"></span>
            <span>${t('mascot.checkRecovery') || 'Verificar trabalho não salvo'}</span>
        </button>
    `;
    try {
        hydrateIcons(_aiFabMenuEl);
    } catch (e: any) {
        console.debug('[llmChat] fab-menu-icons:', _errorMessage(e));
        /* noop */
    }
}
/**
 * Show FAB context menu at viewport position.
 * @param {number} x
 * @param {number} y
 */
function _showAIFabContextMenu(x: any, y: any) {
    if (!_aiFabMenuEl) return;
    _aiFabMenuEl.style.display = 'block';
    _aiFabMenuEl.classList.add('visible');
    const rect = _aiFabMenuEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(x, vw - rect.width - 8));
    const top = Math.max(8, Math.min(y, vh - rect.height - 8));
    _aiFabMenuEl.style.left = `${left}px`;
    _aiFabMenuEl.style.top = `${top}px`;
    _aiFabMenuEl.style.position = 'fixed';
}
/**
 * Hide FAB context menu.
 */
function _hideAIFabContextMenu() {
    if (!_aiFabMenuEl) return;
    _aiFabMenuEl.style.display = 'none';
    _aiFabMenuEl.classList.remove('visible');
}
/**
 * Open the AI chat panel.
 * Abre o painel de chat do assistente IA (wrapper para backward-compat).
 */
export function openLLMChat() {
    const panel = document.getElementById('llm-chat-panel');
    if (panel && !panel.classList.contains('open')) toggleAIWidget();
}
/**
 * Open the AI assistant from cards/shortcuts that use a semantic handler name.
 * Abre o assistente IA por aliases usados na home e em atalhos.
 */
export function handleOpenAiAssistant() {
    openLLMChat();
}
/**
 * Close the AI chat panel.
 * Fecha o painel de chat do assistente IA (wrapper para backward-compat).
 */
export function closeLLMChat() {
    const panel = document.getElementById('llm-chat-panel');
    if (panel && panel.classList.contains('open')) toggleAIWidget();
}
/**
 * Open the AI configuration modal.
 * Abre o modal para configurar provedor, modelo e chave de API.
 * Preenche os campos com as configuracoes atuais.
 */
/**
 * Populate cloud provider fields in the LLM config modal.
 * @param {HTMLElement} providerSelect
 * @param {HTMLElement} modelSelect
 * @param {HTMLElement} keyInput
 * @param {HTMLElement} testStatus
 */
function _populateCloudConfig(providerSelect: any, modelSelect: any, keyInput: any, testStatus: any) {
    const currentProvider = getProvider();
    if (providerSelect) providerSelect.value = currentProvider;
    updateModelDropdown(currentProvider);
    if (modelSelect) modelSelect.value = getModel();
    if (keyInput) keyInput.value = getApiKey() || '';
    updateApiKeyLink(currentProvider);
    if (testStatus) testStatus.textContent = '';
}

/**
 * Populate browser engine model field.
 * @param {HTMLElement} browserModelSelect
 */
function _populateBrowserConfig(browserModelSelect: any) {
    populateBrowserModels();
    if (browserModelSelect) browserModelSelect.value = getBrowserModel();
}

/**
 * Populate Web-LLM engine model field.
 * @param {HTMLElement} webllmModelSelect
 */
function _populateWebLlmConfig(webllmModelSelect: any) {
    populateWebLlmModels();
    if (webllmModelSelect) webllmModelSelect.value = getWebLlmModel();
}

/**
 * Populate local server fields in the LLM config modal.
 * @param {HTMLElement} localUrlInput
 * @param {HTMLElement} localModelInput
 * @param {HTMLElement} localTestStatus
 */
function _populateLocalConfig(localUrlInput: any, localModelInput: any, localTestStatus: any) {
    if (localUrlInput) localUrlInput.value = getLocalUrl();
    if (localModelInput) localModelInput.value = getLocalModel();
    if (localTestStatus) localTestStatus.textContent = '';
}

/**
 * Populate voice settings fields in the LLM config modal.
 * @param {HTMLElement} sttCheck
 * @param {HTMLElement} ttsCheck
 * @param {HTMLElement} sourceSelect
 * @param {HTMLElement} externalProviderSelect
 * @param {HTMLElement} externalModelInput
 */
function _populateVoiceConfig(
    sttCheck: any,
    ttsCheck: any,
    sourceSelect: any,
    externalProviderSelect: any,
    externalModelInput: any,
) {
    if (sttCheck) sttCheck.checked = isSTTEnabled();
    if (ttsCheck) ttsCheck.checked = isTTSEnabled();
    _populateSTTModels();
    _populateExternalVoiceProviders();
    const savedSttSource = localStorage.getItem(VOICE_STORAGE_KEYS.STT_SOURCE) || 'auto';
    const savedExternalProvider = localStorage.getItem(VOICE_STORAGE_KEYS.EXTERNAL_PROVIDER) || getProvider();
    const savedExternalModel =
        localStorage.getItem(VOICE_STORAGE_KEYS.EXTERNAL_MODEL) ||
        EXTERNAL_STT_DEFAULT_MODELS[savedExternalProvider] ||
        '';
    if (sourceSelect) sourceSelect.value = savedSttSource;
    if (externalProviderSelect) externalProviderSelect.value = savedExternalProvider;
    if (externalModelInput) externalModelInput.value = savedExternalModel;
    _toggleExternalVoiceFields(savedSttSource);
    _updateExternalVoiceModelHint(savedExternalProvider, savedExternalModel);
}

/**
 * Populate personality and toast-category fields in the LLM config modal.
 * @param {{ tone: string, technical: number, verbosity: string, language: string, focus: string, tipDensity: string, toastCategories: Record<string, boolean> }} p
 */
function _populatePersonalityConfig(p: any) {
    const pFields = {
        tone: p.tone,
        technical: p.technical,
        verbosity: p.verbosity,
        language: p.language,
        focus: p.focus,
        tips: p.tipDensity,
    };
    for (const [k, v] of Object.entries(pFields)) {
        const el = document.getElementById('llm-personality-' + (k as string));
        if (el) (el as any).value = String(v);
    }
    const techSlider = document.getElementById('llm-personality-technical');
    const techOutput = techSlider?.nextElementSibling?.querySelector('output');
    if (techSlider && techOutput) (techOutput as any).value = (techSlider as any).value;
    const tc: any = p.toastCategories || {};
    for (const cat of ['error', 'warning', 'success', 'info']) {
        const cb = document.getElementById('llm-toast-' + cat) as any;
        if (cb) cb.checked = !!tc[cat];
    }
}

export function openLLMConfig() {
    const currentEngine = getEngine();
    selectEngine(currentEngine);
    _populateCloudConfig(
        document.getElementById('llm-provider'),
        document.getElementById('llm-model'),
        document.getElementById('llm-api-key'),
        document.getElementById('llm-test-status'),
    );
    _populateBrowserConfig(document.getElementById('browser-model'));
    _populateWebLlmConfig(document.getElementById('webllm-model'));
    _populateLocalConfig(
        document.getElementById('local-server-url'),
        document.getElementById('local-model-name'),
        document.getElementById('local-test-status'),
    );
    _populateVoiceConfig(
        document.getElementById('stt-enabled'),
        document.getElementById('tts-enabled'),
        document.getElementById('voice-stt-source'),
        document.getElementById('voice-external-provider'),
        document.getElementById('voice-external-model'),
    );
    _populatePersonalityConfig(getPersonalitySettings());
    openModal('llm-config-modal');
    if (currentEngine === EngineType.BROWSER) {
        runAndDisplayBenchmark();
    }
    if (currentEngine === EngineType.WEB_LLM) {
        displayWebLlmGpuStatus();
    }
}
/**
 * Handle provider selection change.
 * Quando o usuario muda o provedor, atualiza modelos e link da API key.
 */
export function handleProviderChange() {
    const providerSelect = document.getElementById('llm-provider');
    if (!providerSelect) return;
    const providerId = providerSelect.value;
    updateModelDropdown(providerId);
    updateApiKeyLink(providerId);
    // Update placeholder hint for API key
    const config: any = getProviderConfig(providerId);
    const keyInput = document.getElementById('llm-api-key') as any;
    if (keyInput && config) {
        keyInput.placeholder = config.keyHint || 'Enter your API key';
    }
}
/**
 * Test connection to the selected LLM provider.
 * Testa a conexao com o provedor selecionado.
 */
/**
 * Read cloud config fields used by the connection test.
 * @returns {{ key: string, provider: string, model: string }}
 */
function _readTestConfigFields() {
    return {
        key: (document.getElementById('llm-api-key') as any)?.value?.trim() || '',
        provider: (document.getElementById('llm-provider') as any)?.value || '',
        model: (document.getElementById('llm-model') as any)?.value || '',
    };
}

/**
 * Update the connection-test status element with a result.
 * @param {HTMLElement|null} testStatus
 * @param {boolean} success
 * @param {string} message
 */
function _setTestStatus(testStatus: any, success: boolean, message: string) {
    if (!testStatus) return;
    testStatus.textContent = success ? t('connectionSuccess') || 'Connected!' : (t('connectionFailed') || 'Failed: ') + message;
    testStatus.className = success ? 'test-success' : 'test-error';
}

export async function testLLMConnection() {
    const testStatus = document.getElementById('llm-test-status');
    const testBtn = document.getElementById('llm-test-btn');
    const { key, provider, model } = _readTestConfigFields();
    if (!key) {
        if (testStatus) testStatus.textContent = t('apiKeyRequired') || 'API key required';
        return;
    }
    setProvider(provider);
    setApiKey(key);
    if (model) setModel(model);
    if (testStatus) testStatus.textContent = '...';
    if (testBtn) testBtn.disabled = true;
    try {
        const result: any = await testConnection();
        _setTestStatus(testStatus, result.success, result.message);
    } catch (err: any) {
        log.error('Connection test failed', _errorMessage(err));
        _setTestStatus(testStatus, false, _errorMessage(err));
    } finally {
        if (testBtn) testBtn.disabled = false;
    }
}
/**
 * Fetch available models from the provider's API.
 * Busca modelos disponiveis direto da API do provedor.
 */
/**
 * Read refresh-models inputs.
 * @returns {{ key: string, providerId: string }}
 */
function _readRefreshInputs() {
    return {
        key: (document.getElementById('llm-api-key') as any)?.value?.trim() || '',
        providerId: (document.getElementById('llm-provider') as any)?.value || '',
    };
}

/**
 * Render the model-refresh hint after a successful fetch.
 * @param {HTMLElement|null} hint
 * @param {any[]} models
 */
function _setRefreshHint(hint: any, models: any[]) {
    if (!hint) return;
    if (models.length === 0) {
        hint.textContent = 'No models found';
        return;
    }
    hint.textContent = `${models.length} ${t('modelsFound') || 'models found'}`;
}

export async function refreshLLMModels() {
    const { key, providerId } = _readRefreshInputs();
    const hint = document.getElementById('llm-model-hint');
    const refreshBtn = document.getElementById('llm-refresh-models-btn');
    if (!key) {
        if (hint) hint.textContent = t('apiKeyRequired') || 'Enter API key first';
        return;
    }
    if (hint) hint.textContent = '...';
    if (refreshBtn) refreshBtn.disabled = true;
    try {
        const models = await fetchProviderModels(providerId, key);
        setProviderModels(providerId, models);
        updateModelDropdown(providerId);
        _setRefreshHint(hint, models);
    } catch (err: any) {
        log.error('Failed to refresh LLM models', _errorMessage(err));
        if (hint) hint.textContent = `Error: ${_errorMessage(err)}`;
    } finally {
        if (refreshBtn) refreshBtn.disabled = false;
    }
}
/**
 * Save AI configuration (provider, model, and API key).
 * Salva as configuracoes do assistente IA.
 * A chave e armazenada apenas na sessao do navegador.
 */
/**
 * Save cloud engine configuration from the modal fields.
 * @returns {boolean} false if validation failed and caller should abort
 */
function _saveCloudEngineConfig(): boolean {
    const key = document.getElementById('llm-api-key')?.value?.trim();
    if (!key) {
        showToast(t('apiKeyRequired') || 'API key required', 'error');
        return false;
    }
    const provider = document.getElementById('llm-provider')?.value;
    setProvider(provider);
    setApiKey(key);
    const model = document.getElementById('llm-model')?.value;
    if (model) setModel(model);
    const hint = document.getElementById('llm-key-hint');
    if (hint) hint.textContent = t('apiKeyHintSessionOnly') || 'Key active for this session';
    return true;
}

/**
 * Save browser engine configuration from the modal fields.
 */
function _saveBrowserEngineConfig() {
    const model = document.getElementById('browser-model')?.value;
    if (model) setBrowserModel(model);
}

/**
 * Save Web-LLM engine configuration from the modal fields.
 */
function _saveWebLlmEngineConfig() {
    const model = document.getElementById('webllm-model')?.value;
    if (model) setWebLlmModel(model);
}

/**
 * Save local server engine configuration from the modal fields.
 * @returns {boolean} false if validation failed and caller should abort
 */
function _saveLocalEngineConfig(): boolean {
    const url = document.getElementById('local-server-url')?.value?.trim();
    const model = document.getElementById('local-model-name')?.value?.trim();
    if (!model) {
        showToast(t('modelLoadError') || 'Enter a model name', 'error');
        return false;
    }
    if (url) setLocalUrl(url);
    setLocalModel(model);
    return true;
}

/**
 * Persist voice/external STT settings from the modal fields.
 */
function _saveVoiceConfig() {
    const sttSource = document.getElementById('voice-stt-source')?.value || 'auto';
    localStorage.setItem(VOICE_STORAGE_KEYS.STT_SOURCE, sttSource);
    const externalProvider = document.getElementById('voice-external-provider')?.value || getProvider();
    localStorage.setItem(VOICE_STORAGE_KEYS.EXTERNAL_PROVIDER, externalProvider);
    const externalModelInput = document.getElementById('voice-external-model');
    const externalModelRaw = (externalModelInput as any)?.value?.trim();
    const externalModel = externalModelRaw || EXTERNAL_STT_DEFAULT_MODELS[externalProvider as string] || '';
    localStorage.setItem(VOICE_STORAGE_KEYS.EXTERNAL_MODEL, externalModel);
    if (externalModelInput && !(externalModelInput as any).value?.trim()) {
        (externalModelInput as any).value = externalModel;
    }
    _updateExternalVoiceModelHint(externalProvider, externalModel);
}

/**
 * Persist personality and toast-category settings from the modal fields.
 */
function _savePersonalityConfig() {
    const _pKeys = [
        ['tone', 'ecbyts-llm-tone'],
        ['technical', 'ecbyts-llm-technical'],
        ['verbosity', 'ecbyts-llm-verbosity'],
        ['language', 'ecbyts-llm-language'],
        ['focus', 'ecbyts-llm-focus'],
        ['tips', 'ecbyts-llm-tip-density'],
    ];
    for (const [field, storageKey] of _pKeys) {
        const el = document.getElementById('llm-personality-' + (field as string)) as any;
        if (el) localStorage.setItem(storageKey as string, el.value);
    }
    const toastCats: any = {};
    for (const cat of ['error', 'warning', 'success', 'info']) {
        const cb = document.getElementById('llm-toast-' + cat) as any;
        toastCats[cat] = cb ? cb.checked : false;
    }
    localStorage.setItem('ecbyts-llm-toast-categories', JSON.stringify(toastCats));
}

/**
 * Save engine-specific configuration.
 * @param {string} engine
 * @returns {boolean} false if validation failed
 */
function _saveEngineConfig(engine: any): boolean {
    switch (engine) {
        case EngineType.CLOUD:
            return _saveCloudEngineConfig();
        case EngineType.BROWSER:
            _saveBrowserEngineConfig();
            return true;
        case EngineType.WEB_LLM:
            _saveWebLlmEngineConfig();
            return true;
        case EngineType.LOCAL:
            return _saveLocalEngineConfig();
        default:
            return true;
    }
}

export function saveLLMConfig() {
    const engine = getEngine();
    if (!_saveEngineConfig(engine)) return;
    _saveVoiceConfig();
    _savePersonalityConfig();
    updateEngineBadge();
    showToast(t('saved') || 'Saved!', 'success');
    closeModal('llm-config-modal');
}
// ----------------------------------------------------------------
// CONFIG UI HELPERS
// Funcoes auxiliares para o modal de configuracao.
// ----------------------------------------------------------------
/**
 * Update model dropdown options for a given provider.
 * Atualiza as opcoes do dropdown de modelo para um provedor.
 *
 * @param {string} providerId - Provider identifier
 */
function updateModelDropdown(providerId: any) {
    const modelSelect = document.getElementById('llm-model') as any;
    if (!modelSelect) return;
    const models = getProviderModels(providerId);
    modelSelect.innerHTML = models.map((m: any) => `<option value="${m.id}">${m.name}</option>`).join('');
    // Select default model
    const config: any = getProviderConfig(providerId);
    if (config) modelSelect.value = config.defaultModel;
}
/**
 * Update the "Get API key" link for a given provider.
 * Atualiza o link "Obter chave" para um provedor.
 *
 * @param {string} providerId - Provider identifier
 */
function updateApiKeyLink(providerId: any) {
    const link = document.getElementById('llm-api-key-link') as any;
    if (!link) return;
    const url = getApiKeyUrl(providerId);
    const config: any = getProviderConfig(providerId);
    link.href = url;
    link.textContent = `${t('getApiKey') || 'Get API key'} → ${config?.name || providerId}`;
}
// ----------------------------------------------------------------
// MESSAGE HANDLING
// Enviar mensagens e processar respostas do assistente.
// ----------------------------------------------------------------
/**
 * Send a message to the AI assistant.
 * Envia uma mensagem de texto para o assistente IA.
 * O assistente interpreta o comando e sugere uma acao.
 *
 * @param {string} [result] - Texto opcional (via API). Se omitido, le do input DOM.
 */
/**
 * Record token usage from a cloud-engine response.
 * @param {any} result
 */
function _recordCloudUsage(result: any) {
    if (!result?.usage) return;
    const modelHint = result.model || result.engine;
    for (const charge of _pureResolveUsageCharges(result.usage, modelHint)) {
        addTokenUsage(charge.count, { model: charge.model, type: charge.type });
    }
}

/**
 * Handle a successful cloud-engine command result.
 * @param {any} result
 */
function _handleCloudResult(result: any) {
    _recordCloudUsage(result);
    if (result.autoExecuted) {
        addMessage(result.message, result.success ? 'assistant' : 'error', {
            aiProvenance: result.success ? (globalThis as any).__ecbtLastAiProvenance : null,
        });
        updateMascotState(result.success ? 'success' : 'error');
        setTimeout(() => updateMascotState('idle'), 3000);
        _requestUIRefresh?.();
    } else if (result.needsConfirmation) {
        addConfirmationMessage(result.confirmation);
        updateMascotState('success');
        setTimeout(() => updateMascotState('idle'), 3000);
    }
}

/**
 * Process a cloud-engine message and render the result.
 * @param {string} msg
 */
async function _sendCloudMessage(msg: any) {
    const typingId = showTypingIndicator();
    try {
        const result = await processCommand(msg);
        removeTypingIndicator(typingId);
        if (result.needsConfig) {
            addMessage(result.message, 'error');
            openLLMConfig();
            return;
        }
        if (!result.success) {
            addMessage(result.message, 'error');
            return;
        }
        if (!result.understood) {
            addMessage(result.message, 'assistant');
            return;
        }
        _handleCloudResult(result);
    } catch (err: any) {
        const recovery = buildLlmRecoveryVM(err, navigator.onLine !== false);
        log.error('LLM command processing failed', recovery.kind);
        removeTypingIndicator(typingId);
        _showLlmRecovery(err, msg);
        updateMascotState('error');
        setTimeout(() => updateMascotState('idle'), 3000);
    }
}

export async function sendLLMMessage(messageText: any) {
    const input = document.getElementById('llm-input');
    const container = document.getElementById('llm-messages');
    if (!container) return;
    const msg = messageText || (input ? (input as any).value.trim() : '');
    if (!msg) return;
    if (!_messageFlight.start()) return;
    const validation = validateEngineConfig();
    if (!validation.valid) {
        if (input) {
            (input as any).value = msg;
            input.focus();
        }
        _showEngineSetupGuidance();
        openLLMConfig();
        _messageFlight.finish();
        return;
    }
    if (input) (input as any).value = '';
    _setLlmComposerBusy(true);
    try {
        addMessage(msg, 'user');
        updateMascotState('thinking');
        const engine = getEngine();
        if (engine === EngineType.BROWSER || engine === EngineType.LOCAL) {
            await sendLLMMessageStreaming(msg, container);
        } else {
            await _sendCloudMessage(msg);
        }
    } finally {
        _setLlmComposerBusy(false);
        _messageFlight.finish();
    }
}

function _setLlmComposerBusy(busy: boolean) {
    const input = document.getElementById('llm-input') as HTMLInputElement | null;
    const send = document.querySelector('#llm-chat-panel [data-handler="sendLLMMessage"]') as HTMLButtonElement | null;
    if (input) {
        input.disabled = busy;
        input.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    if (send) send.disabled = busy;
}

function _showLlmRecovery(error: unknown, originalMessage: string) {
    const container = document.getElementById('llm-messages');
    if (!container) return;
    const vm = buildLlmRecoveryVM(error, navigator.onLine !== false);
    container.querySelector('[data-llm-recovery="1"]')?.remove();
    const div = document.createElement('div');
    div.className = 'llm-message error';
    div.setAttribute('data-llm-recovery', '1');
    div.setAttribute('data-recovery-kind', vm.kind);
    div.innerHTML = `
        <strong>${escapeHtml(vm.title)}</strong>
        <div>${escapeHtml(vm.message)}</div>
        <div class="llm-message-actions">
            <button type="button" class="btn btn-primary" data-recovery-action="retry">${escapeHtml(vm.retryLabel)}</button>
            <button type="button" class="btn btn-secondary" data-recovery-action="settings">${escapeHtml(vm.settingsLabel)}</button>
        </div>`;
    div.querySelector('[data-recovery-action="retry"]')?.addEventListener('click', () => sendLLMMessage(originalMessage), {
        once: true,
    });
    div.querySelector('[data-recovery-action="settings"]')?.addEventListener('click', openLLMConfig, { once: true });
    container.appendChild(div);
    const input = document.getElementById('llm-input') as HTMLInputElement | null;
    if (input && !input.value) input.value = originalMessage;
    container.scrollTop = container.scrollHeight;
}

/** Render one actionable first-use card; repeated sends update instead of stacking it. */
function _showEngineSetupGuidance() {
    const container = document.getElementById('llm-messages');
    if (!container) return;
    const guidance = buildEngineSetupGuidance();
    let div = container.querySelector('[data-llm-setup-guidance="1"]') as HTMLElement | null;
    if (!div) {
        div = document.createElement('div');
        div.className = 'llm-message assistant';
        div.setAttribute('data-llm-setup-guidance', '1');
        container.appendChild(div);
    }
    div.innerHTML = `
        <strong>${escapeHtml(guidance.title)}</strong>
        <div>${escapeHtml(guidance.message)}</div>
        <div class="llm-message-actions">
            <button type="button" class="btn btn-primary" data-llm-setup-action="config">
                ${escapeHtml(guidance.actionLabel)}
            </button>
        </div>`;
    div.querySelector('[data-llm-setup-action="config"]')?.addEventListener('click', openLLMConfig, { once: true });
    container.scrollTop = container.scrollHeight;
}
/**
 * Send message with streaming support.
 * Cria div de mensagem e faz append token-by-token para browser/local engines.
 * Apos stream completo, faz parse da resposta acumulada pelo pipeline existente.
 *
 * @param {string} msg - User message
 * @param {HTMLElement} container - Messages container
 */
async function sendLLMMessageStreaming(msg: any, container: any) {
    updateMascotState('thinking');
    // Mostra progress bar indeterminate
    showProgressBar(true);
    // Cria div de streaming
    const streamDiv = document.createElement('div');
    streamDiv.className = 'llm-message assistant streaming';
    container.appendChild(streamDiv);
    let fullContent = '';
    try {
        // Prefetch knowledge assets para injecao no prompt (async, popula cache)
        await getKnowledgeContext().catch((_e: any) =>
            console.debug('[utils/handlers/llmChat:silent-catch]', _errorMessage(_e)),
        );
        // LOADING-PERF GAP-2: SAO é lazy. Garante init para que buildSystemPrompt
        // (sync) injete os parâmetros SAO-filtrados, não só CONFIG.PARAMETERS base.
        await ensureSAO().catch((_e: any) =>
            console.debug('[utils/handlers/llmChat:ensureSAO]', _errorMessage(_e)),
        );
        const systemPrompt = buildSystemPrompt();
        const userMessage = formatUserMessage(msg);
        for await (const token of routeMessageStream(systemPrompt, userMessage)) {
            fullContent += token;
            streamDiv.textContent = fullContent;
            container.scrollTop = container.scrollHeight;
            // Esconde progress bar apos primeiro token
            hideProgressBar();
        }
        streamDiv.classList.remove('streaming');
        // Token estimation para browser/local engines (~4 chars per token)
        const estimatedTokens = _pureEstimateStreamingTokens(msg, fullContent);
        if (estimatedTokens > 0) addTokenUsage(estimatedTokens);
        // Parse da resposta acumulada usando pipeline existente
        const parsed = parseResponse(fullContent);
        if (!parsed.success) {
            if (parsed.data?.confirmation) {
                streamDiv.textContent = parsed.data.confirmation;
            }
            return;
        }
        const data = parsed.data;
        if (!data.understood) {
            // Mensagem ja esta no streamDiv - apenas garante que esta correto
            if (data.confirmation && data.confirmation !== fullContent) {
                streamDiv.textContent = data.confirmation;
            }
            if (isTTSEnabled() && localStorage.getItem(VOICE_STORAGE_KEYS.AUTO_READ) === '1') {
                readMessageAloud(streamDiv).catch((err: any) => log.warn('Auto-read stream failed', _errorMessage(err)));
            }
            return;
        }
        // Acao entendida - valida e mostra confirmacao
        const validationResult = validateActionParams(data.action, data.params);
        if (!validationResult.valid) {
            streamDiv.textContent = data.confirmation || validationResult.errors.join('; ');
            return;
        }
        // Armazena acao pendente para confirmacao
        setPendingAction({
            action: data.action,
            params: validationResult.resolvedParams,
            confirmation: data.confirmation,
        });
        // Remove streaming div e mostra confirmacao com botoes
        streamDiv.remove();
        addConfirmationMessage(data.confirmation);
        updateMascotState('success');
        setTimeout(() => updateMascotState('idle'), 3000);
    } catch (err: any) {
        const recovery = buildLlmRecoveryVM(err, navigator.onLine !== false);
        log.error('Streaming message failed', recovery.kind);
        streamDiv.remove();
        hideProgressBar();
        _showLlmRecovery(err, msg);
        updateMascotState('error');
        setTimeout(() => updateMascotState('idle'), 3000);
    }
}
/**
 * Confirm a pending AI action.
 * Confirma a acao sugerida pelo assistente IA.
 * Ex: "Sim, adicionar benzeno 10 mg/L ao poco PM-01".
 */
export async function confirmLLMAction() {
    if (!_confirmationFlight.start()) return;
    const actions = document.getElementById('llm-confirm-msg')?.querySelector('.llm-message-actions');
    actions?.querySelectorAll('button').forEach((button: any) => {
        button.disabled = true;
    });
    const typingId = showTypingIndicator();
    try {
        const result = await confirmAction();
        removeTypingIndicator(typingId);
        // B3: ação confirmada também é mutação executada por IA → badge.
        addMessage(result.message, result.success ? 'success' : 'error', {
            aiProvenance: result.success ? (globalThis as any).__ecbtLastAiProvenance : null,
        });
        if (result.success) _requestUIRefresh?.();
    } catch (err: any) {
        const recovery = buildLlmRecoveryVM(err, navigator.onLine !== false);
        log.error('LLM action confirmation failed', recovery.kind);
        removeTypingIndicator(typingId);
        addMessage('Não foi possível concluir a ação. Revise o pedido antes de tentar novamente.', 'error');
    } finally {
        _confirmationFlight.finish();
        actions?.remove();
    }
}
/**
 * Cancel a pending AI action.
 * Cancela a acao sugerida pelo assistente IA.
 */
export function cancelLLMAction() {
    cancelAction();
    addMessage(t('actionCanceled') || 'Canceled', 'assistant');
    document.getElementById('llm-confirm-msg')?.querySelector('.llm-message-actions')?.remove();
}
// ----------------------------------------------------------------
// UI HELPERS
// Funcoes auxiliares para o chat (mensagens, indicador de digitacao).
// ----------------------------------------------------------------
/**
 * Add a message to the chat.
 * Adiciona uma mensagem ao historico do chat.
 *
 * Exportada (B3): consumida pelo wire de proveniência IA e testável via E2E.
 *
 * @param {string} content - Message text
 * @param {string} type - Message type ('user', 'assistant', 'error', 'success')
 * @param {{ aiProvenance?: any }} [opts] - aiProvenance: tag B3 (CONSIST-OBS)
 *   → renderiza badge "executado por IA" (EU AI Act Art. 50 disclosure visível)
 */
export function addMessage(content: any, type: any, opts: { aiProvenance?: any } = {}) {
    const container = document.getElementById('llm-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `llm-message ${type}`;
    div.textContent = content;
    // B3 (CONSIST-OBS-001): disclosure visível de mutação executada por IA.
    // A tag machine-readable já está no log de sessão (commandExecutor);
    // este badge é a camada humana exigida pelo EU AI Act Art. 50.
    if (opts.aiProvenance) {
        _appendAiProvenanceBadge(div, opts.aiProvenance);
    }
    // Botao speaker para mensagens do assistente (se TTS habilitado)
    if (type === 'assistant' && isTTSEnabled()) {
        _appendSpeakButton(div);
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    if (type === 'assistant' && isTTSEnabled() && localStorage.getItem(VOICE_STORAGE_KEYS.AUTO_READ) === '1') {
        readMessageAloud(div).catch((err: any) => log.warn('Auto-read failed', err?.message));
    }
}

/**
 * Append the AI-provenance badge to a chat message (B3 — EU AI Act Art. 50).
 * Chip discreto com tooltip: modelo + action + timestamp da tag canônica.
 * @param {HTMLElement} div
 * @param {any} tag - AiProvenanceTag (ou truthy genérico — degrada sem tooltip)
 */
function _appendAiProvenanceBadge(div: any, tag: any) {
    try {
        const badge = document.createElement('span');
        badge.className = 'llm-ai-badge';
        badge.textContent = t('llm.aiBadge') || 'Executado por IA';
        const model = typeof tag?.model === 'string' ? tag.model : null;
        const action = typeof tag?.actionId === 'string' ? tag.actionId : null;
        const tooltipBase = t('llm.aiBadgeTooltip') || 'Esta ação foi executada por um assistente de IA (EU AI Act Art. 50)';
        badge.title = [tooltipBase, model ? `model: ${model}` : null, action ? `action: ${action}` : null]
            .filter(Boolean)
            .join(' · ');
        badge.setAttribute('data-ai-provenance', '1');
        div.appendChild(badge);
    } catch (e: any) {
        console.debug('[llmChat:ai-badge]', e?.message || e);
    }
}
/**
 * Add a confirmation message with action buttons.
 * Adiciona uma mensagem de confirmacao com botoes Sim/Nao.
 *
 * @param {string} content - Confirmation text
 */
function addConfirmationMessage(content: any) {
    const container = document.getElementById('llm-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'llm-message confirmation';
    div.id = 'llm-confirm-msg';
    div.innerHTML = `<div>${escapeHtml(content)}</div><div class="llm-message-actions"><button class="btn btn-primary" data-cc-action="cc-b7df4666">${t('confirmYes') || 'Yes'}</button><button class="btn btn-secondary" data-cc-action="cc-9e9efb30">${t('confirmNo') || 'No'}</button></div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}
/**
 * Show typing animation.
 * Mostra animacao de "digitando..." no chat.
 *
 * @returns {string|null} Typing indicator element ID
 */
function showTypingIndicator() {
    const container = document.getElementById('llm-messages');
    if (!container) return null;
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.className = 'llm-typing';
    div.id = id;
    div.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}
/**
 * Remove typing animation.
 * Remove a animacao de "digitando..." do chat.
 *
 * @param {string|null} id - Typing indicator element ID
 */
function removeTypingIndicator(id: any) {
    if (id) document.getElementById(id)?.remove();
}
// ----------------------------------------------------------------
// CHAT TOOLS - Ferramentas ativaveis no painel de chat
// Padrao inspirado no Gemini "Ferramentas"
// ----------------------------------------------------------------
/**
 * Toggle the tools dropdown menu.
 * Abre/fecha o menu de ferramentas do chat.
 */
export function toggleChatToolsMenu() {
    const dropdown = document.getElementById('llm-tools-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.style.display !== 'none';
    // Renderiza dinamicamente ao abrir (inclui ferramentas do usuario)
    if (!isOpen) renderToolsDropdown();
    dropdown.style.display = isOpen ? 'none' : 'flex';
    // Close on click outside
    if (!isOpen) {
        setTimeout(() => {
            const close = (e: any) => {
                if (!dropdown.contains(e.target) && !e.target.closest('.llm-tools-btn')) {
                    dropdown.style.display = 'none';
                    document.removeEventListener('click', close);
                }
            };
            document.addEventListener('click', close);
        }, 0);
    }
}
/**
 * Toggle a chat tool on/off and update UI.
 * Liga/desliga uma ferramenta e atualiza chips e checkmarks.
 *
 * @param {string} toolId - Tool identifier (trends, sampling, audit)
 */
export function handleToggleChatTool(toolId: any) {
    const nowActive = toggleTool(toolId);
    updateToolCheckmark(toolId, nowActive);
    renderToolChips();
}
/**
 * Update checkmark icon for a tool option.
 * @param {string} toolId
 * @param {boolean} active
 */
function updateToolCheckmark(toolId: any, active: any) {
    const check = document.getElementById(`llm-tool-check-${toolId}`);
    if (check) {
        check.textContent = active ? '\u2713' : '';
        check.classList.toggle('active', active);
    }
}
/**
 * Render active tool chips in the tools bar.
 * Mostra os chips das ferramentas ativas abaixo do input.
 * Inclui ferramentas built-in E customizadas do usuario.
 */
function renderToolChips() {
    const container = document.getElementById('llm-tools-chips');
    if (!container) return;
    container.innerHTML = '';
    for (const tool of getAllTools()) {
        if (!isToolActive(tool.id)) continue;
        const label = tool.isUserTool ? tool.name : t(tool.nameKey) || tool.nameKey;
        const chip = document.createElement('span');
        chip.className = 'llm-tool-chip';
        // Ferramentas com upload (Smart Import) mostram botao de envio de arquivo
        const safeLabel = escapeHtml(label);
        if (tool.hasUpload) {
            chip.innerHTML = `<span class="icon" data-icon="${tool.icon}"></span> ${safeLabel} <button class="llm-tool-chip-upload" data-cc-call-click="openSmartImportModal" data-cc-stop="1" title="${t('uploadFile') || 'Upload file'}"><span class="icon" data-icon="upload"></span></button> <button class="llm-tool-chip-remove" data-cc-call-click="handleToggleChatTool|s:${encodeURIComponent(`${tool.id}`)}">\u00d7</button>`;
        } else {
            chip.innerHTML = `<span class="icon" data-icon="${tool.icon}"></span> ${safeLabel} <button class="llm-tool-chip-remove" data-cc-call-click="handleToggleChatTool|s:${encodeURIComponent(`${tool.id}`)}">\u00d7</button>`;
        }
        container.appendChild(chip);
    }
    hydrateIcons(container);
}
/**
 * Dynamically render the full tools dropdown (built-in + user).
 * Renderiza o dropdown completo de ferramentas dinamicamente.
 * Chamada ao abrir o menu ou apos CRUD de ferramenta customizada.
 */
/**
 * Build a single tool option element for the dropdown.
 * @param {any} tool
 * @returns {HTMLElement}
 */
function _buildToolOption(tool: any) {
    const label = tool.isUserTool ? tool.name : t(tool.nameKey) || tool.nameKey;
    const desc = tool.isUserTool ? tool.description || '' : t(tool.descKey) || tool.descKey;
    const isActive = isToolActive(tool.id);
    const div = document.createElement('div');
    div.className = 'llm-tool-option';
    div.onclick = () => handleToggleChatTool(tool.id);
    div.innerHTML = `
        <span class="icon" data-icon="${tool.icon}"></span>
        <div class="llm-tool-info">
            <span class="llm-tool-name">${label}</span>
            <small class="llm-tool-desc">${desc}</small>
        </div>
        <span class="llm-tool-check ${isActive ? 'active' : ''}" id="llm-tool-check-${tool.id}">${isActive ? '\u2713' : ''}</span>
        ${tool.isUserTool ? `<button class="llm-tool-edit-btn" data-cc-call-click="handleEditCustomTool|s:${encodeURIComponent(`${tool.id}`)}" data-cc-stop="1" title="Edit">✎</button>` : ''}
    `;
    return div;
}

/**
 * Build the user-tools separator element.
 * @returns {HTMLElement}
 */
function _buildUserToolsSeparator() {
    const sep = document.createElement('div');
    sep.className = 'llm-tool-separator';
    sep.innerHTML = `<span>${t('custom') || 'Custom'}</span>`;
    return sep;
}

/**
 * Build the "+ Create Tool" option element.
 * @returns {HTMLElement}
 */
function _buildCreateToolOption() {
    const createBtn = document.createElement('div');
    createBtn.className = 'llm-tool-option llm-tool-create';
    createBtn.onclick = () => handleCreateCustomTool();
    createBtn.innerHTML = `
        <span class="icon" data-icon="plus"></span>
        <div class="llm-tool-info">
            <span class="llm-tool-name">${t('createTool') || 'Create Tool'}</span>
            <small class="llm-tool-desc">${t('createToolDesc') || 'Create a custom prompt-based tool'}</small>
        </div>
    `;
    return createBtn;
}

export function renderToolsDropdown() {
    const dropdown = document.getElementById('llm-tools-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    const tools = getAllTools();
    let addedUserSeparator = false;
    for (const tool of tools) {
        if (tool.isUserTool && !addedUserSeparator) {
            dropdown.appendChild(_buildUserToolsSeparator());
            addedUserSeparator = true;
        }
        dropdown.appendChild(_buildToolOption(tool));
    }
    dropdown.appendChild(_buildCreateToolOption());
    hydrateIcons(dropdown);
}
// ----------------------------------------------------------------
// USER CUSTOM TOOLS CRUD - Criar, editar, remover ferramentas
// ----------------------------------------------------------------
/**
 * Open the custom tool creation form.
 * Abre formulario inline para criar nova ferramenta customizada.
 */
export function handleCreateCustomTool() {
    openModal('custom-tool-modal');
    // Limpa campos
    const nameInput = document.getElementById('custom-tool-name');
    const descInput = document.getElementById('custom-tool-desc');
    const promptInput = document.getElementById('custom-tool-prompt');
    const idInput = document.getElementById('custom-tool-edit-id');
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    if (promptInput) promptInput.value = '';
    if (idInput) idInput.value = '';
}
/**
 * Open the custom tool editor for an existing tool.
 * @param {string} toolId
 */
export function handleEditCustomTool(toolId: any) {
    const tool = getToolById(toolId);
    if (!tool || !tool.isUserTool) return;
    openModal('custom-tool-modal');
    const nameInput = document.getElementById('custom-tool-name');
    const descInput = document.getElementById('custom-tool-desc');
    const promptInput = document.getElementById('custom-tool-prompt');
    const idInput = document.getElementById('custom-tool-edit-id');
    if (nameInput) nameInput.value = tool.name;
    if (descInput) descInput.value = tool.description;
    if (promptInput) promptInput.value = tool.promptAddition;
    if (idInput) idInput.value = tool.id;
}
/**
 * Save a custom tool (create or update).
 * Salva ferramenta customizada (cria ou atualiza).
 */
/**
 * Read and validate custom tool form fields.
 * @returns {{ name: string, description: string, prompt: string, editId: string }|null}
 */
function _readCustomToolFields(): any {
    const name = (document.getElementById('custom-tool-name') as any)?.value?.trim();
    const description = (document.getElementById('custom-tool-desc') as any)?.value?.trim();
    const prompt = (document.getElementById('custom-tool-prompt') as any)?.value?.trim();
    const editId = (document.getElementById('custom-tool-edit-id') as any)?.value?.trim();
    if (!name) {
        showToast(t('enterToolName') || 'Enter a tool name', 'error');
        return null;
    }
    if (!prompt) {
        showToast(t('enterToolPrompt') || 'Enter tool prompt instructions', 'error');
        return null;
    }
    return { name, description, prompt, editId };
}

/**
 * Persist a custom tool (create or update) and notify UI.
 * @param {string} editId
 * @param {{ name: string, description: string, prompt: string }} fields
 */
function _persistCustomTool(editId: string, fields: any) {
    if (editId) {
        updateUserTool(editId, fields);
        showToast(t('toolUpdated') || 'Tool updated', 'success');
    } else {
        addUserTool(fields);
        showToast(t('toolCreated') || 'Tool created', 'success');
    }
}

export function handleSaveCustomTool() {
    const fields = _readCustomToolFields();
    if (!fields) return;
    _persistCustomTool(fields.editId, {
        name: fields.name,
        description: fields.description,
        prompt: fields.prompt,
    });
    closeModal('custom-tool-modal');
    renderToolsDropdown();
    renderToolChips();
}
/**
 * Remove a custom tool.
 * @param {string} toolId
 */
export function handleRemoveCustomTool(toolId: any) {
    removeUserTool(toolId);
    showToast(t('toolRemoved') || 'Tool removed', 'info');
    renderToolsDropdown();
    renderToolChips();
}
// ----------------------------------------------------------------
// CONTEXTUAL CHAT - Auto-carrega contexto ao selecionar elemento
// ----------------------------------------------------------------
/**
 * Toggle contextual chat mode on/off.
 * Quando ativo, selecionar um elemento injeta seu contexto no chat.
 */
export function toggleContextualChat() {
    _contextualChatEnabled = !_contextualChatEnabled;
    const btn = document.getElementById('llm-contextual-toggle');
    if (btn) {
        btn.classList.toggle('active', _contextualChatEnabled);
        btn.title = _contextualChatEnabled
            ? (t('contextualChat') || 'Contextual Chat') + ' ON'
            : (t('contextualChat') || 'Contextual Chat') + ' OFF';
    }
    return _contextualChatEnabled;
}
/**
 * Check if contextual chat is enabled.
 * @returns {boolean}
 */
export function isContextualChatEnabled() {
    return _contextualChatEnabled;
}
/**
 * Load element context into the chat when an element is selected.
 * Carrega o contexto do elemento selecionado no chat.
 * O LLM lê esse contexto e se prepara para conversar sobre o elemento.
 *
 * Chamada por handleSelectElement quando contextual chat está ON
 * e há pelo menos uma custom tool ativa.
 *
 * @param {string} elementId - ID do elemento selecionado
 */
export function loadElementContext(elementId: any) {
    // Respeita ambos os toggles: contextual chat OU proactive
    if (!_contextualChatEnabled && !_proactiveEnabled) return;
    const element = getElementById(elementId);
    if (!element) return;
    const panel = document.getElementById('llm-chat-panel');
    const chatIsOpen = panel?.classList.contains('open');
    // Se o chat esta aberto, injeta contexto normalmente
    if (chatIsOpen) {
        const obsCount = element.data?.observations?.length || 0;
        const msgCount = element.messages?.length || 0;
        const contextHint =
            `${t('contextLoaded') || 'Context loaded'}: ${element.name} (${element.family}). ` +
            `${obsCount} obs, ${msgCount} msgs.`;
        addMessage(contextHint, 'assistant');
    }
    // Proactive insights (se toggle ON)
    // Se chat fechado: tips ficam pendentes e FAB pulsa 1x
    // Se chat aberto: tips aparecem direto no chat
    if (_proactiveEnabled) {
        import('../../core/llm/proactiveInsights.js')
            .then(({requestElementInsights }: any) => requestElementInsights(elementId))
            .catch((err: any) => log.warn('Proactive insights failed:', err));
    }
}
// ----------------------------------------------------------------
// PROACTIVE AI - Toggle, token meter, credits, tips, notifications
// ----------------------------------------------------------------
/**
 * Toggle proactive AI mode on/off.
 * Quando ativo, gera dicas ao selecionar elementos e analisa em background.
 */
export function toggleProactiveAI() {
    _proactiveEnabled = !_proactiveEnabled;
    localStorage.setItem('ecbyts-proactive-ai', _proactiveEnabled ? '1' : '0');
    const btn = document.getElementById('llm-proactive-toggle');
    if (btn) {
        btn.classList.toggle('active', _proactiveEnabled);
        btn.title = `Proactive AI ${_proactiveEnabled ? 'ON' : 'OFF'}`;
        btn.setAttribute('aria-pressed', String(_proactiveEnabled));
    }
    if (_proactiveEnabled) {
        import('../../core/llm/idleAnalysisProcessor.js')
            .then(({initIdleProcessor }: any) => initIdleProcessor())
            .catch((e: any) => log.warn('Idle processor init failed:', e));
    } else {
        import('../../core/llm/idleAnalysisProcessor.js')
            .then(({stopIdleProcessor }: any) => stopIdleProcessor())
            .catch((_e: any) => console.debug('[utils/handlers/llmChat:silent-catch]', _e?.message || _e));
    }
    return _proactiveEnabled;
}
/**
 * Check if proactive AI is enabled.
 * @returns {boolean}
 */
export function isProactiveEnabled() {
    return _proactiveEnabled;
}
/**
 * Get communication style / personality settings.
 * Persistidas em localStorage (preferencia do usuario, nao credencial).
 *
 * @returns {{ tone: string, technical: number, verbosity: string, language: string, focus: string, tipDensity: string, toastCategories: Record<string, boolean> }}
 */
export function getPersonalitySettings() {
    // Toast categories: default errors+warnings ON, success+info OFF
    const defaultToast = { error: true, warning: true, success: false, info: false };
    const stored = localStorage.getItem('ecbyts-llm-toast-categories');
    const toastCategories = safeJsonParse(stored, defaultToast, 'llmChat-toast-categories');
    return {
        tone: localStorage.getItem('ecbyts-llm-tone') || 'friendly',
        technical: parseInt(localStorage.getItem('ecbyts-llm-technical') || '3') || 3,
        verbosity: localStorage.getItem('ecbyts-llm-verbosity') || 'balanced',
        language: localStorage.getItem('ecbyts-llm-language') || 'auto',
        focus: localStorage.getItem('ecbyts-llm-focus') || 'general',
        tipDensity: localStorage.getItem('ecbyts-llm-tip-density') || 'normal',
        toastCategories,
    };
}
/**
 * Add token usage to the session counter and update the meter UI.
 * Registra uso no metering system (fire-and-forget).
 *
 * F2 CREDITS_TOKEN_METERING: aceita opts {model, type, cache, batch} para
 * o motor aplicar multipliers Claude-pattern. Backward-compat: sem opts
 * usa default Opus input miss.
 *
 * @param {number} count - Number of tokens consumed
 * @param {Object} [opts] - { model, type, cache, batch } para token pricing
 */
export function addTokenUsage(count: any, opts: any = {}) {
    if (!count || count <= 0) return;
    _sessionTokens += count;
    _updateTokenMeter();
    // Registrar no metering (fire-and-forget)
    import('../../core/metering/quota.js')
        .then(({ recordUsage }: any) => recordUsage('llm_tokens', count, opts))
        .catch((_e: any) => console.debug('[utils/handlers/llmChat:silent-catch]', _errorMessage(_e)));
    // Refresh credits (debounced)
    clearTimeout(_creditsRefreshTimer);
    _creditsRefreshTimer = setTimeout(_refreshCredits, 5000);
}
/** Update the token meter bar and label in the chat header. */
function _updateTokenMeter() {
    const fill = document.getElementById('llm-token-fill');
    const label = document.getElementById('llm-token-label');
    const meter = document.getElementById('llm-token-meter');
    if (!fill || !label) return;
    const pct = _pureComputeTokenPercent(_sessionTokens, TOKEN_LIMIT);
    fill.style.width = pct.toFixed(1) + '%';
    label.textContent = _pureFormatTokenLabel(pct);
    fill.classList.remove('warning', 'critical');
    const severity = _pureClassifyTokenSeverity(pct);
    if (severity !== 'normal') fill.classList.add(severity);
    if (meter) {
        meter.title = _pureFormatTokenTooltip(_sessionTokens, TOKEN_LIMIT);
    }
}
/** Refresh credits remaining from the metering system. */
async function _refreshCredits() {
    try {
        const { getUsagePercentages } = await import('../../core/metering/quota.js');
        const usage = await getUsagePercentages();
        const tokenUsage = usage?.llm_tokens;
        const label = document.getElementById('llm-credits-label');
        const meter = document.getElementById('llm-credits-meter');
        if (!tokenUsage || !label) return;
        const remaining = _pureComputeCreditsRemainingPercent(tokenUsage.pct || 0);
        label.textContent = _pureFormatCreditsLabel(remaining);
        if (meter) {
            meter.title = _pureFormatCreditsTooltip(tokenUsage.used || 0, tokenUsage.limit || 0);
        }
    } catch (e: any) {
        console.debug('[llmChat] credits-refresh:', _errorMessage(e));
        // Offline ou sem subscription - manter "--"
    }
}
/**
 * Render proactive insight tips in the chat panel.
 * Cada tip e um DOM element com categoria, mensagem e acao.
 *
 * @param {Array<{category: string, severity: string, message: string, action?: string}>} tips
 */
function _renderProactiveTips(tips: any) {
    const container = document.getElementById('llm-messages');
    if (!container) return;
    tips.forEach((tip: any) => {
        const div = document.createElement('div');
        div.className = `llm-message llm-tip tip-${tip.severity}`;
        const cat = document.createElement('span');
        cat.className = 'llm-tip-category';
        cat.textContent = `[${tip.category}]`;
        const text = document.createElement('span');
        text.className = 'llm-tip-text';
        text.textContent = ` ${tip.message}`;
        div.appendChild(cat);
        div.appendChild(text);
        if (tip.action) {
            const action = document.createElement('span');
            action.className = 'llm-tip-action';
            action.textContent = ` -- ${tip.action}`;
            div.appendChild(action);
        }
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}
/**
 * Notify pending insights via FAB pulse animation and badge.
 * Chamada quando idle processor gera insights e chat esta fechado.
 *
 * @param {number} count - Numero de insights pendentes
 */
function _notifyPendingInsights(count: any) {
    const fab = document.getElementById('ai-widget-fab');
    const badge = document.getElementById('ai-widget-badge');
    const panel = document.getElementById('llm-chat-panel');
    // Se chat esta aberto, nao pulsar - mostrar direto
    if (panel?.classList.contains('open')) return;
    if (count > 0) {
        fab?.classList.add('has-insights');
        if (badge) {
            badge.textContent = String(count);
            badge.style.display = '';
        }
    } else {
        fab?.classList.remove('has-insights');
        if (badge) badge.style.display = 'none';
    }
}
/** Clear pending notification (FAB pulse + badge). */
function _clearPendingNotification() {
    const fab = document.getElementById('ai-widget-fab');
    const badge = document.getElementById('ai-widget-badge');
    fab?.classList.remove('has-insights');
    if (badge) badge.style.display = 'none';
}
/**
 * Ensure default engine is browser (Ecbyts model) for first-time users.
 * So executa se nenhum engine foi salvo na session.
 */
function _ensureDefaultEngine() {
    const savedEngine = sessionStorage.getItem('ecbyts_llm_engine') || '';
    if (savedEngine) return;
    // Primeira visita: default para browser engine (Ecbyts model)
    setEngine(EngineType.BROWSER);
}
/** Sync proactive toggle button state from localStorage on boot. */
function _syncProactiveToggle() {
    const btn = document.getElementById('llm-proactive-toggle');
    if (!btn) return;
    btn.classList.toggle('active', _proactiveEnabled);
    btn.title = `Proactive AI ${_proactiveEnabled ? 'ON' : 'OFF'}`;
    btn.setAttribute('aria-pressed', String(_proactiveEnabled));
}
// Event listeners para proactive tips e idle insights
window.addEventListener('ecbt:proactiveTip', (e: any) => {
    const { tips } = e.detail || {};
    if (!tips || tips.length === 0) return;
    const panel = document.getElementById('llm-chat-panel');
    if (panel?.classList.contains('open')) {
        _renderProactiveTips(tips);
    } else {
        // Chat fechado: acumular tips e pulsar FAB 1x
        _pendingTips = tips; // Substitui (ultimos tips relevantes)
        _notifyPendingInsights(tips.length);
    }
});
window.addEventListener('ecbt:idleInsightsReady', (e: any) => {
    const { count } = e.detail || {};
    if (count > 0) _notifyPendingInsights(count);
});
// Sync toggle e default engine no boot (protegido para nao quebrar module load)
try {
    _syncProactiveToggle();
} catch (e: any) {
    log.debug('syncProactiveToggle failed:', e);
}
try {
    _ensureDefaultEngine();
} catch (e: any) {
    log.debug('ensureDefaultEngine failed:', e);
}
try {
    _refreshCredits();
} catch (e: any) {
    log.debug('refreshCredits failed:', e);
}
// ----------------------------------------------------------------
// ENGINE SELECTOR - Selecao de engine no modal de configuracao
// ----------------------------------------------------------------
/**
 * Select an engine type and update UI.
 * Atualiza cards ativos e mostra/esconde paineis de configuracao.
 *
 * @param {string} engineType - 'cloud' | 'browser' | 'local'
 */
export function selectEngine(engineType: any) {
    setEngine(engineType);
    // Atualiza cards visuais
    document.querySelectorAll('.engine-card').forEach((card: any) => {
        card.classList.toggle('active', card.dataset.engine === engineType);
    });
    // Mostra/esconde paineis de configuracao
    const panels = {
        'engine-config-cloud': EngineType.CLOUD,
        'engine-config-browser': EngineType.BROWSER,
        'engine-config-webllm': EngineType.WEB_LLM,
        'engine-config-local': EngineType.LOCAL,
    };
    for (const [id, type] of Object.entries(panels)) {
        const el = document.getElementById(id);
        if (el) el.style.display = engineType === type ? '' : 'none';
    }
    // Roda benchmark ao selecionar browser engine
    if (engineType === EngineType.BROWSER) {
        runAndDisplayBenchmark();
    }
    // Popula modelos e status WebGPU ao selecionar web-llm
    if (engineType === EngineType.WEB_LLM) {
        populateWebLlmModels();
        displayWebLlmGpuStatus();
    }
}
// ----------------------------------------------------------------
// BROWSER ENGINE HELPERS - Benchmark, download, model selection
// ----------------------------------------------------------------
/**
 * Populate browser model dropdown.
 * Preenche o select de modelos do browser com opcoes disponiveis.
 */
function populateBrowserModels() {
    const select = document.getElementById('browser-model');
    if (!select) return;
    const models = getBrowserModels();
    select.innerHTML = models
        .map((m: any) => `<option value="${m.id}">${t(m.nameKey) || m.name} (${m.size})</option>`)
        .join('');
}
/**
 * Handle browser model selection change.
 * Salva modelo selecionado no router state.
 */
export function handleBrowserModelChange() {
    const select = document.getElementById('browser-model');
    if (select) setBrowserModel(select.value);
}
/**
 * Download selected browser model.
 * Inicia download do modelo com callback de progresso na UI.
 */
export async function downloadBrowserModel() {
    const modelId = document.getElementById('browser-model')?.value || getBrowserModel();
    const btn = document.getElementById('browser-download-btn');
    const progressBar = document.getElementById('browser-download-progress');
    const progressFill = document.getElementById('browser-download-fill');
    const progressLabel = document.getElementById('browser-download-label');
    if (btn) btn.disabled = true;
    if (progressBar) progressBar.style.display = '';
    try {
        await loadBrowserModel(modelId, (info: any) => {
            if (progressFill) progressFill.style.width = `${info.progress}%`;
            if (progressLabel) progressLabel.textContent = info.message;
            // Mostra fallback warning
            if (info.status === 'fallback') {
                showToast(t('noWebGPU') || info.message, 'warning');
            }
        });
        showToast(t('modelReady') || 'Model ready!', 'success');
        if (progressLabel) progressLabel.textContent = t('modelReady') || 'Model ready!';
    } catch (err: any) {
        log.error('Browser model load failed', _errorMessage(err));
        showToast((t('modelLoadError') || 'Failed to load model') + ': ' + _errorMessage(err), 'error');
        if (progressLabel) progressLabel.textContent = _errorMessage(err);
    } finally {
        if (btn) btn.disabled = false;
    }
}
/**
 * Run benchmark and display results.
 * Executa deteccao de hardware e renderiza no painel de config.
 */
/**
 * Build HTML rows for benchmark results.
 * @param {any} result
 * @param {string} recName
 * @returns {string}
 */
function _buildBenchmarkRows(result: any, recName: string): string {
    const gpuRow = result.gpu
        ? `<div class="benchmark-row"><span class="benchmark-label">${t('gpuDetected') || 'GPU'}</span><span class="benchmark-value">${result.gpu}</span></div>`
        : '';
    const vramRow = result.vramGB
        ? `<div class="benchmark-row"><span class="benchmark-label">VRAM</span><span class="benchmark-value">${result.vramGB} GB</span></div>`
        : '';
    const ramRow = result.ramGB
        ? `<div class="benchmark-row"><span class="benchmark-label">${t('ramDetected') || 'RAM'}</span><span class="benchmark-value">${result.ramGB} GB</span></div>`
        : '';
    return `
        <div class="benchmark-row">
            <span class="benchmark-label">WebGPU</span>
            <span class="benchmark-value ${result.webgpu ? 'available' : 'unavailable'}">
                ${result.webgpu ? t('webgpuAvailable') || 'Available' : t('webgpuUnavailable') || 'Not available (CPU)'}
            </span>
        </div>
        ${gpuRow}
        ${vramRow}
        ${ramRow}
        <div class="benchmark-row">
            <span class="benchmark-label">Device</span>
            <span class="benchmark-value">${result.deviceType === 'mobile' ? '[M] Mobile' : '[D] Desktop'}</span>
        </div>
        <div class="benchmark-recommendation">
            <strong>${t('recommendedModel') || 'Recommended'}:</strong> ${recName}
        </div>
    `;
}

/**
 * Update the browser model dropdown with the recommended model.
 * @param {string} recommended
 */
function _applyRecommendedModel(recommended: string) {
    const select = document.getElementById('browser-model');
    if (select && recommended) {
        (select as any).value = recommended;
        setBrowserModel(recommended);
    }
}

export async function runAndDisplayBenchmark() {
    const container = document.getElementById('benchmark-results');
    if (!container) return;
    container.innerHTML = `<div class="benchmark-loading">${t('benchmarkRunning') || 'Evaluating device capabilities...'}</div>`;
    try {
        const result = await runBenchmark();
        const models = getBrowserModels();
        const recommended = models.find((m: any) => m.id === result.recommended);
        const recName = recommended ? t(recommended.nameKey) || recommended.name : result.recommended;
        container.innerHTML = _buildBenchmarkRows(result, recName);
        _applyRecommendedModel(result.recommended);
    } catch (err: any) {
        log.error('Benchmark execution failed', _errorMessage(err));
        container.innerHTML = `<div class="benchmark-loading">Error: ${escapeHtml(_errorMessage(err))}</div>`;
    }
}
// ----------------------------------------------------------------
// WEB-LLM HELPERS - Model selection, download, GPU status
// ----------------------------------------------------------------
/**
 * Populate web-llm model dropdown.
 * Preenche o select de modelos MLC com opcoes disponiveis.
 */
function populateWebLlmModels() {
    const select = document.getElementById('webllm-model');
    if (!select) return;
    const models = getWebLlmModels();
    select.innerHTML = models
        .map((m: any) => `<option value="${m.id}">${t(m.nameKey) || m.name} (${m.size})</option>`)
        .join('');
    select.value = getWebLlmModel();
}
/**
 * Handle web-llm model selection change.
 * Salva modelo selecionado no router state.
 */
export function handleWebLlmModelChange() {
    const select = document.getElementById('webllm-model');
    if (select) setWebLlmModel(select.value);
}
/**
 * Download selected web-llm model.
 * Inicia download do modelo MLC com callback de progresso na UI.
 */
export async function downloadWebLlmModel() {
    const modelId = document.getElementById('webllm-model')?.value || getWebLlmModel();
    const btn = document.getElementById('webllm-download-btn');
    const progressBar = document.getElementById('webllm-download-progress');
    const progressFill = document.getElementById('webllm-download-fill');
    const progressLabel = document.getElementById('webllm-download-label');
    if (btn) btn.disabled = true;
    if (progressBar) progressBar.style.display = '';
    try {
        await loadWebLlmModel(modelId, (info: any) => {
            if (progressFill) progressFill.style.width = `${info.progress}%`;
            if (progressLabel) progressLabel.textContent = info.message;
        });
        showToast(t('modelReady') || 'Model ready!', 'success');
        if (progressLabel) progressLabel.textContent = t('modelReady') || 'Model ready!';
    } catch (err: any) {
        log.error('WebLLM model load failed', _errorMessage(err));
        showToast((t('modelLoadError') || 'Failed to load model') + ': ' + _errorMessage(err), 'error');
        if (progressLabel) progressLabel.textContent = _errorMessage(err);
    } finally {
        if (btn) btn.disabled = false;
    }
}
/**
 * Display WebGPU availability status for web-llm panel.
 * Mostra se WebGPU esta disponivel e info do GPU.
 */
async function displayWebLlmGpuStatus() {
    const container = document.getElementById('webllm-gpu-status');
    if (!container) return;
    const avail = isWebLlmAvailable();
    if (!avail.webgpu) {
        container.innerHTML = `
            <div class="benchmark-row">
                <span class="benchmark-label">WebGPU</span>
                <span class="benchmark-value unavailable">
                    ${t('webgpuUnavailable') || 'Not available'}
                </span>
            </div>
            <div class="benchmark-recommendation" style="color:var(--error-color);">
                ${t('webllmRequiresWebGPU') || 'WebGPU is required for this engine. Use Chrome 113+ or Edge 113+.'}
            </div>
        `;
        return;
    }
    let gpuName = '';
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
            const info = await (adapter as any).requestAdapterInfo?.();
            gpuName = info?.device || info?.description || '';
        }
    } catch (err: any) {
        log.debug('WebGPU adapter info ignored', _errorMessage(err));
    }
    container.innerHTML = `
        <div class="benchmark-row">
            <span class="benchmark-label">WebGPU</span>
            <span class="benchmark-value available">
                ${t('webgpuAvailable') || 'Available'}
            </span>
        </div>
        ${
            gpuName
                ? `<div class="benchmark-row">
            <span class="benchmark-label">${t('gpuDetected') || 'GPU'}</span>
            <span class="benchmark-value">${gpuName}</span>
        </div>`
                : ''
        }
    `;
}
// ----------------------------------------------------------------
// LOCAL SERVER HELPERS - Test, refresh models
// ----------------------------------------------------------------
/**
 * Test connection to local server.
 * Testa conectividade com o servidor local configurado.
 */
export async function testLocalServer() {
    const url = document.getElementById('local-server-url')?.value?.trim();
    const model = document.getElementById('local-model-name')?.value?.trim();
    const status = document.getElementById('local-test-status');
    if (!url || !model) {
        if (status) status.textContent = 'Enter URL and model name';
        return;
    }
    if (status) status.textContent = '...';
    const result = await testLocalConnection(url, model);
    if (status) {
        status.textContent = result.message;
        status.className = result.success ? 'test-success' : 'test-error';
    }
}
/**
 * Refresh models from local server.
 * Busca lista de modelos disponiveis no servidor local.
 */
export async function refreshLocalModels() {
    const url = document.getElementById('local-server-url')?.value?.trim();
    const modelInput = document.getElementById('local-model-name');
    const status = document.getElementById('local-test-status');
    if (!url) {
        if (status) status.textContent = 'Enter server URL first';
        return;
    }
    if (status) status.textContent = '...';
    try {
        const models = await fetchLocalModels(url);
        if (models.length > 0) {
            // Mostra primeiro modelo encontrado no input
            if (modelInput && !modelInput.value) modelInput.value = models[0];
            if (status) status.textContent = `${models.length} models: ${models.join(', ')}`;
            if (status) (status as any).className = 'test-success';
        } else {
            if (status) status.textContent = 'No models found';
        }
    } catch (err: any) {
        log.error('Failed to fetch local server models', _errorMessage(err));
        if (status) {
            status.textContent = _errorMessage(err);
            status.className = 'test-error';
        }
    }
}
/**
 * Apply recommended model to local model input.
 * Preenche o campo de modelo local com o modelo recomendado.
 * @param {string} modelId - Model ID (ex: gemma4:e2b)
 */
export function applyRecommendedModel(modelId: any) {
    const modelInput = document.getElementById('local-model-name');
    if (modelInput) {
        modelInput.value = modelId;
    }
    setLocalModel(modelId);
    const status = document.getElementById('local-test-status');
    if (status) {
        status.textContent = `Model set to ${modelId}`;
        status.className = 'test-success';
    }
    showToast(`Model: ${modelId}`, 'success');
}
// ----------------------------------------------------------------
// ENGINE BADGE & PROGRESS BAR - UI updates
// ----------------------------------------------------------------
/**
 * Update engine badge in chat header.
 * Atualiza o badge de engine no header do chat panel.
 */
function updateEngineBadge() {
    const badge = document.getElementById('llm-engine-badge');
    if (!badge) return;
    const engine = getEngine();
    const displayName = getEngineDisplayName();
    badge.className = `engine-badge engine-${engine}`;
    badge.textContent = displayName;
    badge.title = `${t('engineActive') || 'Active engine'}: ${displayName}`;
}
/**
 * Show progress bar in chat panel.
 * Mostra barra de progresso abaixo do header.
 * @param {boolean} [indeterminate=false] - Se true, mostra shimmer animation
 */
function showProgressBar(indeterminate = false) {
    const bar = document.getElementById('llm-progress-bar');
    if (!bar) return;
    bar.style.display = '';
    if (indeterminate) {
        bar.classList.add('indeterminate');
    }
}
/**
 * Hide progress bar.
 * Esconde barra de progresso.
 */
function hideProgressBar() {
    const bar = document.getElementById('llm-progress-bar');
    if (!bar) return;
    bar.style.display = 'none';
    bar.classList.remove('indeterminate');
}
/**
 * Update progress bar fill percentage.
 * Atualiza preenchimento da barra de progresso.
 * @param {number} percent - 0-100
 */
function updateProgressBar(percent: any) {
    const fill = document.getElementById('llm-progress-fill');
    if (fill) fill.style.width = `${percent}%`;
}
/* ----------------------------------------------------------------
   AI WIDGET DRAG — permite arrastar o widget pelo header
   ---------------------------------------------------------------- */
let _dragInitialized = false;
/**
 * Setup drag-to-move on the AI chat widget header.
 * Arrasta o widget flutuante do AI Assistant pelo header.
 */
function initAIWidgetDrag() {
    if (_dragInitialized) return;
    const header = document.querySelector('.llm-chat-header');
    const panel = document.getElementById('llm-chat-panel');
    if (!header || !panel) return;
    header.addEventListener('mousedown', (e: any) => {
        // Nao arrastar se clicou num botao
        if (e.target.closest('button')) return;
        panel.classList.add('dragged');
        const rect = panel.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = rect.left;
        const startBottom = window.innerHeight - rect.bottom;
        const onMove = (me: any) => {
            const dx = me.clientX - startX;
            const dy = me.clientY - startY;
            let newLeft = startLeft + dx;
            let newBottom = startBottom - dy;
            const pw = panel.offsetWidth;
            const ph = panel.offsetHeight;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            newLeft = Math.max(0, Math.min(newLeft, vw - pw));
            newBottom = Math.max(0, Math.min(newBottom, vh - ph));
            panel.style.right = 'auto';
            panel.style.left = newLeft + 'px';
            panel.style.bottom = newBottom + 'px';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            panel.classList.remove('dragged');
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        e.preventDefault();
    });
    _dragInitialized = true;
}
/**
 * Setup resize handles on the AI chat widget.
 * Adiciona handles de redimensionamento nas bordas e cantos do chat.
 */
function initAIWidgetResize() {
    const panel = document.getElementById('llm-chat-panel');
    if (!panel || _chatResizeCleanup) return;
    _chatResizeCleanup = addFloatingResizeHandles(panel, {
        minWidth: 300,
        maxWidth: 700,
        minHeight: 300,
        maxHeight: window.innerHeight - 40,
        onEnd: () => {
            try {
                safeSetItem(
                    'ecbyts-chat-dims',
                    JSON.stringify({
                        width: panel.offsetWidth,
                        height: panel.offsetHeight,
                    }),
                );
            } catch (err: any) {
                log.debug('Chat dimensions save ignored', _errorMessage(err));
            }
        },
    });
}
/**
 * Restore saved chat panel dimensions from localStorage.
 * Restaura dimensoes salvas do painel de chat.
 * @param {HTMLElement} panel
 */
function restoreChatDimensions(panel: any) {
    const saved = safeJsonParse<{ width?: number; height?: number }>(
        localStorage.getItem('ecbyts-chat-dims'),
        null,
        'llmChat-restoreChatDimensions'
    );
    if (saved && saved.width && saved.height) {
        panel.style.setProperty('--chat-w', saved.width + 'px');
        panel.style.setProperty('--chat-h', saved.height + 'px');
    }
}
// ----------------------------------------------------------------
// SPEECH - Voice input (STT) and voice output (TTS)
// Entrada por voz (microfone → texto) e saida por voz (texto → audio)
// ----------------------------------------------------------------
/**
 * Toggle microphone recording on/off.
 * Alterna estado de gravacao do microfone para entrada por voz.
 */
export async function toggleMicRecording() {
    const micBtn = document.getElementById('llm-mic-btn');
    const indicator = document.getElementById('llm-recording-indicator');
    const status = getSpeechStatus();
    if (status.recording) {
        // Para gravacao e transcreve
        if (micBtn) micBtn.classList.remove('recording');
        if (indicator) indicator.style.display = 'none';
        const blob = await stopRecording();
        if (!blob) {
            log.warn('STT: stopRecording returned no blob');
            return;
        }
        log.debug('STT: transcribing audio blob', (blob as any).size, 'bytes');
        const typingId = showTypingIndicator();
        try {
            const { text } = await transcribeAudio(blob, {
                language: _getSTTLanguage(),
                onProgress: _handleSpeechProgress,
            });
            removeTypingIndicator(typingId);
            if (text) {
                log.debug('STT: transcribed', text);
                const input = document.getElementById('llm-input');
                if (input) {
                    input.value = text;
                    input.focus();
                }
            } else {
                addMessage(t('transcribing') || 'Could not transcribe audio.', 'error');
            }
        } catch (err: any) {
            removeTypingIndicator(typingId);
            log.error('STT transcription failed', _errorMessage(err));
            addMessage(_errorMessage(err), 'error');
        }
    } else {
        // Inicia gravacao - startRecording cuida do mic access internamente
        log.debug('STT: starting recording');
        try {
            const started = await startRecording(null);
            if (started) {
                if (micBtn) micBtn.classList.add('recording');
                if (indicator) indicator.style.display = '';
                log.debug('STT: recording started');
            } else {
                // startRecording falhou (mic denied ou nao suportado)
                addMessage(t('micPermissionDenied') || 'Could not access microphone.', 'error');
                log.warn('STT: startRecording returned false');
            }
        } catch (err: any) {
            log.error('STT start recording failed', _errorMessage(err));
            addMessage(_errorMessage(err), 'error');
        }
    }
}
/**
 * Configure voice behavior without UI.
 * Configura I/O de voz por API (sem modal).
 * @param {any} [value?]
 * @returns {any}
 */
/**
 * Persist a boolean voice setting to localStorage.
 * @param {string} value?
 * @param {boolean|undefined} value
 */
function _setVoiceBool(key: string, value?: boolean) {
    if (typeof value === 'boolean') {
        localStorage.setItem(key, value ? '1' : '0');
    }
}

/**
 * Persist a string voice setting to localStorage when non-empty.
 * @param {string} key
 * @param {string|undefined} value?
 */
function _setVoiceString(key: string, value?: string) {
    if (typeof value === 'string' && value.trim()) {
        localStorage.setItem(key, value.trim());
    }
}

/**
 * Persist a constrained STT source value.
 * @param {string|undefined} source?
 */
function _setVoiceSttSource(source?: string) {
    const allowed = ['auto', 'local', 'native', 'external'];
    if (typeof source === 'string' && allowed.includes(source)) {
        localStorage.setItem(VOICE_STORAGE_KEYS.STT_SOURCE, source);
    }
}

/**
 * Persist max recording duration when positive and finite.
 * @param {number|undefined} maxRecordMs?
 */
function _setVoiceMaxRecord(maxRecordMs?: number) {
    if (Number.isFinite(maxRecordMs) && (maxRecordMs as number) > 0) {
        localStorage.setItem(VOICE_STORAGE_KEYS.MAX_RECORD_MS, String(Math.round(maxRecordMs as number)));
    }
}

export function configureVoiceIO(opts: any = {}) {
    if (typeof opts.stt === 'boolean') setSTTEnabled(opts.stt);
    if (typeof opts.tts === 'boolean') setTTSEnabled(opts.tts);
    _setVoiceBool(VOICE_STORAGE_KEYS.AUTO_READ, opts.autoRead);
    _setVoiceBool(VOICE_STORAGE_KEYS.AUTO_SEND, opts.autoSend);
    _setVoiceBool(VOICE_STORAGE_KEYS.PREFER_NATIVE_STT, opts.preferNativeSTT);
    _setVoiceMaxRecord(opts.maxRecordMs);
    _setVoiceSttSource(opts.sttSource);
    _setVoiceString(VOICE_STORAGE_KEYS.EXTERNAL_PROVIDER, opts.externalProvider);
    _setVoiceString(VOICE_STORAGE_KEYS.EXTERNAL_MODEL, opts.externalModel);
    _updateMicButtonVisibility();
    return getVoiceIOStatus();
}
/**
 * Get current no-UI voice status.
 * Retorna estado da voz para automação/API.
 * @returns {Object}
 */
export function getVoiceIOStatus() {
    return {
        sttEnabled: isSTTEnabled(),
        ttsEnabled: isTTSEnabled(),
        autoRead: localStorage.getItem(VOICE_STORAGE_KEYS.AUTO_READ) === '1',
        autoSend: localStorage.getItem(VOICE_STORAGE_KEYS.AUTO_SEND) !== '0',
        preferNativeSTT: localStorage.getItem(VOICE_STORAGE_KEYS.PREFER_NATIVE_STT) === '1',
        sttSource: localStorage.getItem(VOICE_STORAGE_KEYS.STT_SOURCE) || 'auto',
        externalProvider: localStorage.getItem(VOICE_STORAGE_KEYS.EXTERNAL_PROVIDER) || getProvider(),
        externalModel:
            localStorage.getItem(VOICE_STORAGE_KEYS.EXTERNAL_MODEL) ||
            EXTERNAL_STT_DEFAULT_MODELS[localStorage.getItem(VOICE_STORAGE_KEYS.EXTERNAL_PROVIDER) || getProvider()] ||
            '',
        maxRecordMs: Number(localStorage.getItem(VOICE_STORAGE_KEYS.MAX_RECORD_MS) || 7000),
        converseWhenMinimized: localStorage.getItem(VOICE_STORAGE_KEYS.CONVERSE_WHEN_MINIMIZED) === '1',
        nativeSTTAvailable: canUseNativeSTT(),
    };
}
/**
 * Check if conversation mode is enabled while chat is minimized.
 * Verifica se modo conversa com chat minimizado esta ativo.
 * @returns {boolean}
 */
export function isConverseWhenMinimizedEnabled() {
    return localStorage.getItem(VOICE_STORAGE_KEYS.CONVERSE_WHEN_MINIMIZED) === '1';
}
/**
 * Set conversation mode for minimized chat.
 * Define modo conversa com chat minimizado.
 * @param {boolean} enabled
 */
export function setConverseWhenMinimizedEnabled(enabled: any) {
    localStorage.setItem(VOICE_STORAGE_KEYS.CONVERSE_WHEN_MINIMIZED, enabled ? '1' : '0');
}
/**
 * Toggle conversation mode while minimized.
 * Alterna modo conversa com chat minimizado.
 * @returns {boolean}
 */
export function toggleConverseWhenMinimized() {
    const next = !isConverseWhenMinimizedEnabled();
    setConverseWhenMinimizedEnabled(next);
    showToast(
        next
            ? t('voiceConverseMinOn') || 'Voice conversation enabled while chat is minimized.'
            : t('voiceConverseMinOff') || 'Voice conversation while minimized disabled.',
        'info',
    );
    return next;
}
/**
 * Capture one utterance and optionally send to AI chat.
 * Captura fala unica e envia ao bot sem UI.
 * @param {any} [options]
 * @returns {Promise<{text:string,sent:boolean,source:string}>}
 */
/**
 * Resolved options for a one-shot voice capture.
 * @typedef {{ send: boolean, preferNative: boolean, maxRecordMs: number, autoSend: boolean, sttSource: string, externalProvider: string, externalModel: string|undefined }} VoiceCaptureOptions
 */

/**
 * Resolve and normalize voice capture options.
 * @param {any} options
 * @returns {VoiceCaptureOptions}
 */
function _resolveVoiceCaptureOptions(options: any) {
    const externalProvider =
        options.externalProvider || localStorage.getItem(VOICE_STORAGE_KEYS.EXTERNAL_PROVIDER) || getProvider();
    return {
        send: options.send !== false,
        preferNative: options.preferNative === true,
        maxRecordMs: Number(options.maxRecordMs || localStorage.getItem(VOICE_STORAGE_KEYS.MAX_RECORD_MS) || 7000),
        autoSend: (localStorage.getItem(VOICE_STORAGE_KEYS.AUTO_SEND) || '') !== '0',
        sttSource: options.sttSource || localStorage.getItem(VOICE_STORAGE_KEYS.STT_SOURCE) || 'auto',
        externalProvider,
        externalModel:
            options.externalModel ||
            localStorage.getItem(VOICE_STORAGE_KEYS.EXTERNAL_MODEL) ||
            EXTERNAL_STT_DEFAULT_MODELS[externalProvider] ||
            undefined,
    };
}

/**
 * Validate prerequisites for a voice capture session.
 * @param {boolean} chatIsOpen
 */
function _assertVoicePrerequisites(chatIsOpen: boolean) {
    if (!isSTTEnabled()) {
        throw new Error('STT is disabled. Enable with configureVoiceIO({ stt: true }).');
    }
    if (!chatIsOpen && !isConverseWhenMinimizedEnabled()) {
        throw new Error('Chat is minimized. Enable minimized conversation mode first.');
    }
    if (_voiceSessionActive) {
        throw new Error('Voice capture already in progress.');
    }
}

/**
 * Record audio for a fixed duration and return the captured blob.
 * @param {number} maxRecordMs
 * @returns {Promise<Blob>}
 */
async function _captureVoiceAudio(maxRecordMs: number): Promise<Blob> {
    const started = await startRecording(null);
    if (!started) throw new Error('Could not start microphone recording.');
    await new Promise((r: any) => setTimeout(r, Math.max(2500, Math.min(maxRecordMs, 30000))));
    const blob = await stopRecording();
    if (!blob) throw new Error('No audio captured.');
    return blob;
}

/**
 * Transcribe audio using the local Whisper engine.
 * @param {Blob} blob
 * @param {string|undefined} langStt
 * @returns {Promise<string>}
 */
async function _transcribeLocal(blob: Blob, langStt: any): Promise<string> {
    const result = await transcribeAudio(blob, {
        language: langStt,
        onProgress: _handleSpeechProgress,
    });
    return result?.text || '';
}

/**
 * Transcribe audio using an external STT provider.
 * @param {Blob} blob
 * @param {string|undefined} langStt
 * @param {string} externalProvider
 * @param {string|undefined} externalModel
 * @returns {Promise<string>}
 */
async function _transcribeExternal(
    blob: Blob,
    langStt: any,
    externalProvider: string,
    externalModel: any,
): Promise<string> {
    const result = await transcribeExternalAudio(blob, {
        language: langStt,
        provider: externalProvider,
        model: externalModel,
    });
    return result?.text || '';
}

/**
 * Transcribe audio using native browser STT.
 * @param {string} langNative
 * @param {number} maxRecordMs
 * @returns {Promise<string>}
 */
async function _transcribeNative(langNative: string, maxRecordMs: number): Promise<string> {
    const native: any = await transcribeNativeOnce({
        lang: langNative,
        timeoutMs: Math.max(3000, Math.min(maxRecordMs + 5000, 20000)),
    });
    return native?.text || '';
}

/**
 * Auto fallback chain: local → external → native.
 * @param {Blob} blob
 * @param {string|undefined} langStt
 * @param {string} langNative
 * @param {string} externalProvider
 * @param {string|undefined} externalModel
 * @param {number} maxRecordMs
 * @returns {Promise<{ text: string, source: string }>}
 */
async function _transcribeAuto(
    blob: Blob,
    langStt: any,
    langNative: string,
    externalProvider: string,
    externalModel: any,
    maxRecordMs: number,
): Promise<{ text: string; source: string }> {
    try {
        const text = await _transcribeLocal(blob, langStt);
        return { text, source: 'local_whisper' };
    } catch (localErr: any) {
        log.warn('Auto STT local failed', _errorMessage(localErr));
        try {
            const text = await _transcribeExternal(blob, langStt, externalProvider, externalModel);
            return { text, source: 'external' };
        } catch (extErr: any) {
            log.warn('Auto STT external failed', _errorMessage(extErr));
            const text = await _transcribeNative(langNative, maxRecordMs);
            return { text, source: 'native' };
        }
    }
}

/**
 * Dispatch transcription to the requested STT source.
 * @param {Blob} blob
 * @param {VoiceCaptureOptions} opts
 * @param {string|undefined} langStt
 * @param {string} langNative
 * @returns {Promise<{ text: string, source: string }>}
 */
async function _transcribeVoiceBlob(
    blob: Blob,
    opts: any,
    langStt: any,
    langNative: string,
): Promise<{ text: string; source: string }> {
    if (opts.sttSource === 'external') {
        const text = await _transcribeExternal(blob, langStt, opts.externalProvider, opts.externalModel);
        return { text, source: 'external' };
    }
    if (opts.sttSource === 'native' || (opts.preferNative && opts.sttSource !== 'local')) {
        const text = await _transcribeNative(langNative, opts.maxRecordMs);
        return { text, source: 'native' };
    }
    if (opts.sttSource === 'local') {
        const text = await _transcribeLocal(blob, langStt);
        return { text, source: 'local_whisper' };
    }
    return _transcribeAuto(blob, langStt, langNative, opts.externalProvider, opts.externalModel, opts.maxRecordMs);
}

export async function sendVoiceMessageOnce(options: any = {}) {
    const opts = _resolveVoiceCaptureOptions(options);
    const panel = document.getElementById('llm-chat-panel');
    const chatIsOpen = !!panel?.classList.contains('open');
    _assertVoicePrerequisites(chatIsOpen);
    _voiceSessionActive = true;
    try {
        const blob = await _captureVoiceAudio(opts.maxRecordMs);
        const langStt = _getSTTLanguage();
        const langNative = _getTTSLanguage();
        const { text, source } = await _transcribeVoiceBlob(blob, opts, langStt, langNative);
        const cleaned = text.trim();
        if (!cleaned) return { text: '', sent: false, source };
        const shouldSend = opts.send && opts.autoSend;
        if (shouldSend) await sendLLMMessage(cleaned);
        return { text: cleaned, sent: shouldSend, source };
    } finally {
        _voiceSessionActive = false;
    }
}
/**
 * Stop current voice capture/playback.
 * Para captura e reprodução de voz.
 */
export async function stopVoiceIO() {
    try {
        if (getSpeechStatus().recording) await stopRecording();
    } catch (e: any) {
        console.debug('[llmChat] stop-recording:', _errorMessage(e));
        /* noop */
    }
    stopNativeRecognition();
    stopPlayback();
    _voiceSessionActive = false;
}
/**
 * Read an assistant message aloud via TTS.
 * Le em voz alta uma mensagem do assistente usando sintese de voz.
 * @param {HTMLElement} messageEl - The .llm-message element
 */
export async function readMessageAloud(messageEl: any) {
    if (!messageEl) return;
    const speakBtn = messageEl.querySelector('.speak-btn');
    const text = messageEl.textContent?.trim();
    if (!text) return;
    // Se ja tocando neste elemento - para
    if (speakBtn?.classList.contains('playing')) {
        stopPlayback();
        speakBtn.classList.remove('playing');
        return;
    }
    if (speakBtn) speakBtn.classList.add('playing');
    log.debug('TTS: speaking text', text.substring(0, 60) + '...');
    try {
        // Prioridade: Web Speech API nativa (instantanea, sem download)
        // SpeechT5 via Transformers.js requer ~100MB de download e pode falhar
        if (window.speechSynthesis) {
            await speakNative(text, _getTTSLanguage());
        } else {
            // Fallback: SpeechT5 via Transformers.js (requer download do modelo)
            const { audio, samplingRate } = await synthesizeSpeech(text, {
                onProgress: _handleSpeechProgress,
            });
            await playAudio(audio, samplingRate);
        }
    } catch (err: any) {
        const speechError = _errorMessage(err);
        log.error('TTS speech failed', speechError);
        // Tentativa final: SpeechT5 se Web Speech API falhou, ou vice-versa
        try {
            if (window.speechSynthesis && speechError !== 'Web Speech API not supported') {
                // Ja falhou no speechSynthesis, tenta SpeechT5
                const { audio, samplingRate } = await synthesizeSpeech(text, {
                    onProgress: _handleSpeechProgress,
                });
                await playAudio(audio, samplingRate);
            } else {
                await speakNative(text, _getTTSLanguage());
            }
        } catch (err2: any) {
            log.warn('TTS all engines failed', _errorMessage(err2));
            log.error('TTS fallback exhausted', _errorMessage(err2));
            addMessage(t('ttsError') || 'Text-to-speech failed.', 'error');
        }
    } finally {
        if (speakBtn) speakBtn.classList.remove('playing');
    }
}
/**
 * Toggle STT (Speech-to-Text) on/off.
 * Habilita ou desabilita entrada por voz.
 * @param {boolean} enabled
 */
export function toggleSTT(enabled: any) {
    setSTTEnabled(enabled);
    _updateMicButtonVisibility();
}
/**
 * Toggle TTS (Text-to-Speech) on/off.
 * Habilita ou desabilita saida por voz.
 * @param {boolean} enabled
 */
export function toggleTTS(enabled: any) {
    setTTSEnabled(enabled);
}
/**
 * Handle STT model change.
 * Altera o modelo STT selecionado.
 * @param {string} modelId
 */
export function handleSTTModelChange(modelId: any) {
    setSTTModel(modelId);
}
/**
 * Update mic button visibility based on STT state.
 * Mostra/esconde botao mic conforme STT habilitado e browser compativel.
 */
function _updateMicButtonVisibility() {
    const micBtn = document.getElementById('llm-mic-btn');
    if (!micBtn) return;
    const canUseMic = !!navigator.mediaDevices?.getUserMedia;
    micBtn.style.display = isSTTEnabled() && canUseMic ? '' : 'none';
}
/**
 * Populate STT models dropdown.
 * Preenche dropdown de modelos STT no modal config.
 */
function _populateSTTModels() {
    const select = document.getElementById('stt-model');
    if (!select) return;
    const models = getSTTModels();
    const current = getSTTModel();
    select.innerHTML = '';
    for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = t(m.nameKey) || `${m.name} (${m.sizeLabel})`;
        if (m.id === current) opt.selected = true;
        select.appendChild(opt);
    }
}
function _populateExternalVoiceProviders() {
    const select = document.getElementById('voice-external-provider');
    if (!select) return;
    const providers = [LLMProvider.OPENAI, LLMProvider.GROQ, LLMProvider.GOOGLE];
    const current = localStorage.getItem(VOICE_STORAGE_KEYS.EXTERNAL_PROVIDER) || getProvider();
    select.innerHTML = providers
        .map((providerId: any) => {
            const cfg: any = getProviderConfig(providerId);
            const label = cfg?.name || providerId;
            return `<option value="${providerId}">${label}</option>`;
        })
        .join('');
    select.value = providers.includes(current) ? current : LLMProvider.OPENAI;
}
function _toggleExternalVoiceFields(sttSource: any) {
    const container = document.getElementById('voice-external-settings');
    if (!container) return;
    container.style.display = sttSource === 'external' ? '' : 'none';
}
function _updateExternalVoiceModelHint(providerId: any, model: any) {
    const hint = document.getElementById('voice-external-model-hint');
    if (!hint) return;
    const { fallbackModel, selectedSuffix } = _pureResolveExternalModelHint(
        providerId,
        model,
        t('selected') || 'Selected',
    );
    hint.textContent = `${t('defaultModel') || 'Default'}: ${fallbackModel}${selectedSuffix}`;
}
export function handleVoiceSttSourceChange(source: any) {
    const next = _pureNormalizeSttSource(source);
    localStorage.setItem(VOICE_STORAGE_KEYS.STT_SOURCE, next);
    _toggleExternalVoiceFields(next);
}
export function handleVoiceExternalProviderChange(providerId: any) {
    const allowed = [LLMProvider.OPENAI, LLMProvider.GROQ, LLMProvider.GOOGLE];
    const next = allowed.includes(providerId) ? providerId : LLMProvider.OPENAI;
    localStorage.setItem(VOICE_STORAGE_KEYS.EXTERNAL_PROVIDER, next);
    const input = document.getElementById('voice-external-model');
    if (input && !input.value.trim()) {
        input.value = EXTERNAL_STT_DEFAULT_MODELS[next] || '';
    }
    const model = input?.value?.trim() || EXTERNAL_STT_DEFAULT_MODELS[next] || '';
    _updateExternalVoiceModelHint(next, model);
}
export function handleVoiceExternalModelChange(modelId: any) {
    const model = String(modelId || '').trim();
    if (!model) return;
    localStorage.setItem(VOICE_STORAGE_KEYS.EXTERNAL_MODEL, model);
    const providerId = localStorage.getItem(VOICE_STORAGE_KEYS.EXTERNAL_PROVIDER) || getProvider();
    _updateExternalVoiceModelHint(providerId, model);
}
/**
 * Append speak button to an assistant message div.
 * Adiciona botao speaker para leitura em voz alta.
 * @param {HTMLElement} div - The .llm-message element
 */
function _appendSpeakButton(div: any) {
    const speakBtn = document.createElement('button');
    speakBtn.className = 'btn btn-icon speak-btn';
    speakBtn.title = t('readAloud') || 'Read aloud';
    speakBtn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
    speakBtn.onclick = (e: any) => {
        e.stopPropagation();
        window.readMessageAloud(div);
    };
    div.appendChild(speakBtn);
}
/**
 * Get STT language from current locale.
 * Retorna codigo de idioma para o Whisper baseado no locale ativo.
 * @returns {string|undefined}
 */
function _getSTTLanguage() {
    const locale = localStorage.getItem('ecbyts-language') || 'en-US';
    return _pureResolveSttLanguage(locale);
}
/**
 * Get TTS language from current locale.
 * Retorna codigo de idioma para Web Speech API.
 * @returns {string}
 */
function _getTTSLanguage() {
    return _pureResolveTtsLanguage(localStorage.getItem('ecbyts-language'));
}
/**
 * Handle speech model download progress.
 * Mostra progresso de download do modelo de voz na barra de progresso do chat.
 * @param {any} data - { status, message, progress }
 */
function _handleSpeechProgress(data: any) {
    if (data.status === 'downloading' || data.status === 'loading') {
        showProgressBar();
        if (typeof data.progress === 'number') {
            updateProgressBar(data.progress);
        }
    } else if (data.status === 'ready' || data.status === 'fallback') {
        hideProgressBar();
    }
}
/**
 * All LLM chat handler functions exposed to HTML via window.
 * Objeto com todas as funcoes do chat IA para o HTML.
 */
export const llmChatHandlers = {
    toggleAIWidget,
    handleAIBotContextMenu,
    openLLMChat,
    handleOpenAiAssistant,
    closeLLMChat,
    openLLMConfig,
    saveLLMConfig,
    sendLLMMessage,
    confirmLLMAction,
    cancelLLMAction,
    handleProviderChange,
    testLLMConnection,
    refreshLLMModels,
    toggleChatToolsMenu,
    handleToggleChatTool,
    toggleContextualChat,
    toggleProactiveAI,
    isProactiveEnabled,
    getPersonalitySettings,
    addTokenUsage,
    handleCreateCustomTool,
    handleEditCustomTool,
    handleSaveCustomTool,
    handleRemoveCustomTool,
    // Novas funcoes de engine routing
    selectEngine,
    handleBrowserModelChange,
    downloadBrowserModel,
    runAndDisplayBenchmark,
    // Web-LLM engine
    handleWebLlmModelChange,
    downloadWebLlmModel,
    // Local server
    testLocalServer,
    refreshLocalModels,
    applyRecommendedModel,
    // Speech - voice input/output
    toggleMicRecording,
    readMessageAloud,
    toggleSTT,
    toggleTTS,
    handleSTTModelChange,
    handleVoiceSttSourceChange,
    handleVoiceExternalProviderChange,
    handleVoiceExternalModelChange,
    configureVoiceIO,
    getVoiceIOStatus,
    sendVoiceMessageOnce,
    stopVoiceIO,
    isConverseWhenMinimizedEnabled,
    setConverseWhenMinimizedEnabled,
    toggleConverseWhenMinimized,
};
/* ================================================================
   EC Mascot State Controller
   ================================================================ */
function updateMascotState(state: any) {
    const mascot = document.getElementById('ec-mascot-fab');
    if (!mascot) return;
    mascot.setAttribute('data-state', state);
    const use = mascot.querySelector('use');
    if (use) use.setAttribute('href', '#' + (state === 'idle' ? 'ec-idle' : 'ec-' + state));
    const labelMap: any = {
        idle: t('a11y.mascotIdle'),
        thinking: t('a11y.mascotThinking'),
        success: t('a11y.mascotSuccess'),
        error: t('a11y.mascotError'),
        sleeping: t('a11y.mascotIdle'),
    };
    mascot.setAttribute('aria-label', labelMap[state] || labelMap.idle);
}
//# sourceMappingURL=llmChat.js.map
//# sourceMappingURL=llmChat.js.map
//# sourceMappingURL=llmChat.js.map
