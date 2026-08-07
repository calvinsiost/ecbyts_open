// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Automation Handlers - Window-exposed handlers for bot management UI.
 *
 * @module utils/handlers/automation
 */
import { registerBot, setBotActive, setBotConfig, listBots, getActivityLog, getBotStatus, initBotManager, dispatchBotEvent, } from '../../core/automation/botManager.js';
import { eddReaderBot } from '../../core/automation/bots/eddReaderBot.js';
import { photoTaggerBot } from '../../core/automation/bots/photoTaggerBot.js';
import { mapAutoGenBot } from '../../core/automation/bots/mapAutoGenBot.js';
import { reportFiguresBot } from '../../core/automation/bots/reportFiguresBot.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { switchGroup, switchView } from '../scene/viewRouter.js';
import { fitAllElements, getCameraState, setTopView } from '../scene/controls.js';
import { handleGeoPreset } from './geology.js';
import { handleGenerateRandomModelDirect } from './elements.js';
import { saveFamilySelection, saveRandomOptions } from '../ui/familySelectModal.js';
import { createOrReplaceTechnicalStoryExample, getTechnicalStoryRandomRecipe } from '../../core/presentation/index.js';
import { TECHNICAL_STORY_PIPELINE_ID, ensureTechnicalStoryAutomationPipeline, getTechnicalStoryAutomationStatus, removeTechnicalStoryAutomationPipeline, } from '../../core/automation/technicalStoryPipeline.js';
function _notify(message: any, tone = 'info', options: any = {}) {
    if (options?.silent)
        return;
    showToast(message, tone);
}
function _delay(ms: any) {
    const waitMs = Math.max(0, Number(ms) || 0);
    if (!waitMs)
        return Promise.resolve();
    return new Promise((resolve: any) => setTimeout(resolve, waitMs));
}
function _normalizeFamilyList(value: any) {
    if (value instanceof Set)
        return [...value].map(String).filter(Boolean);
    if (Array.isArray(value))
        return value.map(String).filter(Boolean);
    return [];
}
function _buildTechnicalStoryRecipe(options: any = {}) {
    const base = getTechnicalStoryRandomRecipe();
    const explicitFamilies = _normalizeFamilyList(options.selectedFamilies);
    return {
        selectedFamilies: explicitFamilies.length ? explicitFamilies : base.selectedFamilies,
        options: {
            ...base.options,
            transparentVisuals: true,
            includeAerialOverlay: true,
            seedDemoData: true,
            applyHighLodDefaults: true,
            ...(options.randomOptions && typeof options.randomOptions === 'object' ? options.randomOptions : {}),
        },
    };
}
async function _captureTechnicalStoryCameraStates() {
    await switchGroup('model', { skipAuthGate: true });
    await switchView('3d', { skipAuthGate: true });
    fitAllElements();
    await _delay(220);
    const hero = getCameraState();
    await switchView('2d-depth', { skipAuthGate: true });
    fitAllElements();
    await _delay(220);
    const section = getCameraState();
    setTopView();
    fitAllElements();
    await _delay(220);
    const top = getCameraState();
    await switchView('3d', { skipAuthGate: true });
    fitAllElements();
    return { hero, section, top };
}
export function setUpdateAllUI(_fn: any) {
    // Compatibility hook: automation handlers refresh their own panel/module views.
}
export function handleInitAutomation() {
    initBotManager();
    registerBot('edd_reader', { ...eddReaderBot, handler: eddReaderBot });
    registerBot('photo_tagger', { ...photoTaggerBot, handler: photoTaggerBot });
    registerBot('map_auto_gen', { ...mapAutoGenBot, handler: mapAutoGenBot });
    registerBot('report_figures', { ...reportFiguresBot, handler: reportFiguresBot });
    removeTechnicalStoryAutomationPipeline();
}

/**
 * Dispara a automação que insere as figuras do ecbyts (plumas + raio de 500 m do GAC)
 * no relatório ativo. Ativa o bot `report_figures` sob demanda (ele só reage a este
 * evento manual, sem efeitos colaterais automáticos) e despacha o evento.
 *
 * @param opts.providers — filtro opcional: se passado, só insere figuras cujo
 *   providerId está nessa lista. Usado pelos templates CETESB DD-38 para limitar
 *   às figuras que o template declara em `figureProviders`.
 */
export async function handleAutoInsertReportFigures(opts: { providers?: string[] } = {}) {
    if (!isCapabilityEnabled('automation')) {
        showToast(
            t('library.capabilityDisabled') || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    setBotActive('report_figures', true);
    const payload: Record<string, any> = {};
    if (Array.isArray(opts.providers) && opts.providers.length > 0) {
        payload.providers = opts.providers;
    }
    dispatchBotEvent('report_figures_requested', payload);
}
export function handleOpenAutomationPanel() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('automation')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    import('../ui/automationPanel.js' as string)
        .then((m: any) => m.openAutomationPanel())
        .catch((err: any) => console.warn('[handlers/automation] import automationPanel failed:', err));
}
export function handleToggleBot(botId: any) {
    const status = getBotStatus(botId);
    if (!status)
        return;
    setBotActive(botId, !status.isActive);
    import('../ui/automationPanel.js' as string)
        .then((m: any) => {
        if (typeof m.refreshAutomationPanel === 'function')
            m.refreshAutomationPanel();
    })
        .catch((err: any) => console.warn('[handlers/automation] import automationPanel failed:', err));
}
export function handleSetBotConfig(botId: any, config: any) {
    setBotConfig(botId, config);
}
export function handleListBots() {
    return listBots();
}
export function handleGetBotActivityLog(limit: any) {
    return getActivityLog(limit);
}
export function handleDispatchBotEvent(eventType: any, payload: any) {
    dispatchBotEvent(eventType, payload);
}
export async function handlePrepareTechnicalStoryWorkspace(options: any = {}) {
    const recipe = _buildTechnicalStoryRecipe(options);
    saveFamilySelection('random', new Set(recipe.selectedFamilies));
    saveRandomOptions(recipe.options);
    await handleGenerateRandomModelDirect({
        ...recipe.options,
        selectedFamilies: recipe.selectedFamilies,
    });
    await switchGroup('model', { skipAuthGate: true });
    await switchView('3d', { skipAuthGate: true });
    await handleGeoPreset('presentation');
    fitAllElements();
    await _delay(250);
    const cameraStates = await _captureTechnicalStoryCameraStates();
    _notify('Workspace tecnico preparado com random transparente e LOD alto curado.', 'success', options);
    return { recipe, cameraStates };
}
export async function handleCreateTechnicalStoryPresentationExample(options: any = {}) {
    const prepared = options.prepareWorkspace === false ? null : await handlePrepareTechnicalStoryWorkspace(options);
    const recipe = prepared?.recipe || _buildTechnicalStoryRecipe(options);
    const presentation = createOrReplaceTechnicalStoryExample({
        selectedFamilies: recipe.selectedFamilies,
        randomOptions: recipe.options,
        cameraStates: prepared?.cameraStates || options.cameraStates || null,
    });
    _notify('Exemplo tecnico Ecbyts sincronizado em Presentation Mode.', 'success', options);
    return presentation;
}
export async function handlePrepareAndPlayTechnicalStoryExample(options: any = {}) {
    const presentation = await handleCreateTechnicalStoryPresentationExample(options);
    const { openPlayer } = await import('../ui/presentationPlayer.js' as string);
    await openPlayer(presentation.id);
    return presentation;
}
export function handleInstallTechnicalStoryAutomationPipeline(options: any = {}) {
    const pipeline = ensureTechnicalStoryAutomationPipeline();
    const message = pipeline.created
        ? 'Pipeline tecnico Ecbyts instalado no modulo Automation.'
        : pipeline.changed
            ? 'Pipeline tecnico Ecbyts atualizado no modulo Automation.'
            : 'Pipeline tecnico Ecbyts ja estava sincronizado.';
    _notify(message, 'success', options);
    return pipeline;
}
export async function handleRunTechnicalStoryAutomationPipeline(options: any = {}) {
    const pipeline = handleInstallTechnicalStoryAutomationPipeline({ ...options, silent: true });
    const pipelinesUi = await import('./pipelines.js' as string);
    pipelinesUi.handleOpenPipelineManager?.();
    await pipelinesUi.handleRunPipeline?.(pipeline.id || TECHNICAL_STORY_PIPELINE_ID);
    _notify('Pipeline tecnico Ecbyts em execucao no modulo Automation.', 'success', options);
    return pipeline;
}
export async function handleFinalizeTechnicalStoryAutomationBundle(options: any = {}) {
    const pipeline = handleInstallTechnicalStoryAutomationPipeline({ ...options, silent: true });
    const presentation = await handleCreateTechnicalStoryPresentationExample({ ...options, silent: true });
    _notify('Pipeline tecnico e exemplo em Presentation foram sincronizados no Ecbyts.', 'success', options);
    return { pipeline, presentation };
}
export function handleGetTechnicalStoryAutomationStatus() {
    return getTechnicalStoryAutomationStatus();
}
export const automationHandlers = {
    handleInitAutomation,
    handleOpenAutomationPanel,
    handleToggleBot,
    handleSetBotConfig,
    handleListBots,
    handleGetBotActivityLog,
    handleDispatchBotEvent,
    handleAutoInsertReportFigures,
};
