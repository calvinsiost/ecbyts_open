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
   SENSOR HANDLERS — User actions for IoT sensor elements
   Ações do usuário para elementos de sensor IoT

   Permite buscar dados externos, editar configuração do sensor,
   e converter leituras em observações do modelo.
   ================================================================ */
import { getElementById, getAllElements, updateElement, setSelectedElement } from '../../core/elements/manager.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { CONFIG } from '../../config.js';
import { purposeMicroFeedback } from '../../core/purpose/actionImpact.js';
import { activateTabById } from '../ui/tabs.js';
import { zoomToElement } from '../scene/controls.js';
import { renderSensorCenterTab, setSensorCenterSearch, setSensorCenterStatusFilter, setSensorCenterSort, setSensorCenterPage, toggleSensorCenterExpanded, setSensorCenterBulkInterval, focusSensorInCenter, resetSensorCenterFilters, getSensorCenterBulkInterval, } from '../ui/sensorCenterPanel.js';
import { createLogger } from '../helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
import { lazyImport } from '../helpers/lazyImport.js';
const log = createLogger('Sensor');
let _requestUIRefresh: any = null;
const SENSOR_CAMPAIGN_FALLBACK = 'UNASSIGNED_SENSOR_IMPORT';
/**
 * Inject UI refresh dependency.
 * @param {Function} fn
 */
export function setUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestSensorUIRefresh(reason = 'sensor.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.SENSOR,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
    ];
    for (const domain of domains)
        _requestUIRefresh(domain, reason);
}
const SENSOR_CENTER_INTERVALS = new Set(['5min', '15min', '30min']);
function _normalizeInterval(intervalKey: any) {
    return SENSOR_CENTER_INTERVALS.has(intervalKey) ? intervalKey : '15min';
}
function _getAllSensors() {
    return getAllElements().filter((el: any) => el.family === 'sensor');
}
function _toDateTs(dateLike: any) {
    if (!dateLike)
        return NaN;
    const ts = Date.parse(dateLike);
    return Number.isFinite(ts) ? ts : NaN;
}
function _campaignTouchesArea(campaign: any, areaId: any, elementById: any) {
    if (!areaId)
        return true;
    if (campaign?.areaId && campaign.areaId === areaId)
        return true;
    if (!Array.isArray(campaign?.plannedReadings))
        return false;
    return campaign.plannedReadings.some((reading: any) => {
        const el = elementById.get(reading?.elementId);
        return !!el && el.data?.areaId === areaId;
    });
}
function _resolveCampaignForSensor(element: any, data: any) {
    const campaigns = getAllCampaigns();
    const campaignMap = new Map(campaigns.map((c: any) => [c.id, c]));
    const areaId = data?.areaId || element?.data?.areaId || null;
    const allElements = getAllElements();
    const elementById = new Map(allElements.map((el: any) => [el.id, el]));
    // 1) payload valido
    const payloadCampaignId = data?.campaignId || data?.latestReadings?.find((r: any) => r?.campaignId)?.campaignId || null;
    if (payloadCampaignId && campaignMap.has(payloadCampaignId)) {
        return { campaignId: payloadCampaignId, source: 'payload' };
    }
    const now = Date.now();
    const scoped = campaigns.filter((c: any) => _campaignTouchesArea(c, areaId, elementById));
    // 2) campanha ativa da area (start <= now <= end|open)
    const active = scoped
        .filter((c: any) => {
        const startTs = _toDateTs(c.startDate);
        const endTs = _toDateTs(c.endDate);
        if (!Number.isFinite(startTs))
            return false;
        if (startTs > now)
            return false;
        return !Number.isFinite(endTs) || endTs >= now;
    })
        .sort((/** @type {any} */ a, b: any) => (_toDateTs(b.startDate) || 0) - (_toDateTs(a.startDate) || 0));
    if (active.length > 0) {
        return { campaignId: active[0].id, source: 'active' };
    }
    // 3) ultima campanha da area (30 dias)
    const recent = scoped
        .map((c: any) => {
        const endTs = _toDateTs(c.endDate);
        const startTs = _toDateTs(c.startDate);
        const refTs = Number.isFinite(endTs) ? endTs : startTs;
        return { campaign: c, refTs };
    })
        .filter((item: any) => Number.isFinite(item.refTs) && item.refTs <= now && now - item.refTs <= 30 * 24 * 60 * 60 * 1000)
        .sort((a: any, b: any) => b.refTs - a.refTs);
    if (recent.length > 0) {
        return { campaignId: (recent[0] as any).campaign.id, source: 'recent' };
    }
    // 4) fallback explicito
    return { campaignId: SENSOR_CAMPAIGN_FALLBACK, source: 'fallback' };
}
// ----------------------------------------------------------------
// FETCH SENSOR DATA
// Busca dados do sensor de APIs externas
// ----------------------------------------------------------------
/**
 * Fetch and update sensor data from external APIs.
 * Executa o pipeline de hidratação e atualiza o elemento.
 *
 * @param {string} elementId - ID of the sensor element
 */
export async function handleFetchSensorData(elementId: any) {
    const element = getElementById(elementId);
    if (!element || element.family !== 'sensor') {
        showToast(t('sensorNotFound'), 'error');
        return;
    }
    showToast(t('sensorFetching'), 'info');
    try {
        // Dynamic import - sensor module loaded only when needed
        const { getAppData } = await import('../../core/sensor/index.js' as string);
        const newData = await getAppData(element);
        updateElement(elementId, { data: newData });
        requestSensorUIRefresh('sensor.data-fetched');
        purposeMicroFeedback('handleFetchSensorData');
        if (newData.errors && newData.errors.length > 0) {
            showToast(`${t('sensorPartialSuccess')}: ${newData.errors.length} error(s)`, 'warning');
        }
        else {
            showToast(t('sensorFetchSuccess'), 'success');
        }
    }
    catch (err: any) {
        log.error('Sensor data fetch failed', (err as any).message);
        showToast(`${t('sensorFetchFailed')}: ${(err as any).message}`, 'error');
    }
}
// ----------------------------------------------------------------
// SENSOR FIELD EDITING
// Edição de campos do sensor (tipo, userId, conector)
// ----------------------------------------------------------------
/**
 * Update a sensor-specific field.
 * Atualiza campos do sensor: sensorType, userId, connectorKey.
 *
 * @param {string} elementId - Sensor element ID
 * @param {string} field - Field name (sensorType, userId, connectorKey)
 * @param {*} value - New value
 */
export function handleSensorFieldChange(elementId: any, field: any, value: any) {
    const element = getElementById(elementId);
    if (!element)
        return;
    const data = { ...element.data };
    // Campos numéricos
    if (field === 'userId') {
        data[field] = Math.min(Math.max(parseInt(value) || 1, 1), 10);
    }
    else {
        data[field] = value;
    }
    updateElement(elementId, { data });
}
/**
 * Toggle a monitored parameter on/off for a sensor.
 * Alterna um parâmetro na lista de parâmetros monitorados.
 *
 * @param {string} elementId - Sensor element ID
 * @param {string} parameterId - Parameter to toggle
 * @param {boolean} enabled - Whether to enable or disable
 */
export function handleSensorParameterToggle(elementId: any, parameterId: any, enabled: any) {
    const element = getElementById(elementId);
    if (!element)
        return;
    const data = { ...element.data };
    const current = Array.isArray(data.monitoredParameters) ? [...data.monitoredParameters] : [];
    if (enabled && !current.includes(parameterId)) {
        current.push(parameterId);
    }
    else if (!enabled) {
        const idx = current.indexOf(parameterId);
        if (idx >= 0)
            current.splice(idx, 1);
    }
    data.monitoredParameters = current;
    updateElement(elementId, { data });
    requestSensorUIRefresh('sensor.parameter-toggled');
}
// ----------------------------------------------------------------
// CONNECTOR KEY (generic, replaces OWM-specific handler)
// Chave do conector externo (genérica)
// ----------------------------------------------------------------
/**
 * Set the external connector API key for a sensor.
 * Define a chave do conector externo para um sensor.
 *
 * @param {string} elementId - Sensor element ID
 * @param {string} apiKey - Connector API key
 */
export function handleSetSensorApiKey(elementId: any, apiKey: any) {
    const element = getElementById(elementId);
    if (!element)
        return;
    updateElement(elementId, {
        data: { ...element.data, connectorKey: apiKey },
    });
    purposeMicroFeedback('handleSetSensorApiKey');
}
// ----------------------------------------------------------------
// SENSOR READING → OBSERVATION
// Converte leituras do sensor em observações do modelo
// ----------------------------------------------------------------
/**
 * Create observations from sensor data readings.
 * Cria observações a partir dos dados atuais do sensor,
 * usando os parâmetros monitorados configurados.
 *
 * @param {string} elementId - Sensor element ID
 */
export function handleSensorToObservation(elementId: any) {
    const element = getElementById(elementId);
    if (!element || element.family !== 'sensor') {
        showToast(t('sensorNotFound'), 'error');
        return;
    }
    const data = { ...element.data };
    const pos = data.position || { x: 0, y: 0, z: 0 };
    const observations = Array.isArray(data.observations) ? [...data.observations] : [];
    const monitoredParams = Array.isArray(data.monitoredParameters)
        ? data.monitoredParameters
        : ['temperature', 'pH', 'conductivity', 'water_level'];
    if (monitoredParams.length === 0) {
        showToast(t('sensorNoParameters'), 'warning');
        return;
    }
    // Leituras do último fetch (se existirem)
    const latestReadings = Array.isArray(data.latestReadings) ? data.latestReadings : [];
    const readingMap: Record<string, any> = {};
    latestReadings.forEach((r: any) => {
        readingMap[r.parameterId] = r.value;
    });
    // Primary parameter = first monitored
    const primaryParamId = monitoredParams[0];
    const primaryParam = CONFIG.PARAMETERS?.find((p: any) => p.id === primaryParamId);
    // Additional readings = remaining monitored parameters (auto-filled from fetch)
    const additionalReadings = monitoredParams.slice(1).map((paramId: any) => {
        const param = CONFIG.PARAMETERS?.find((p: any) => p.id === paramId);
        return {
            parameterId: paramId,
            value: readingMap[paramId] ?? null,
            unitId: param?.defaultUnitId || null,
            autoConvert: false,
        };
    });
    // Create observation (auto-filled with latest sensor readings)
    const campaignResolution = _resolveCampaignForSensor(element, data);
    const newObs = {
        x: pos.x || 0,
        y: pos.y || 0,
        z: pos.z || 0,
        date: new Date().toISOString().slice(0, 10),
        campaignId: campaignResolution.campaignId,
        campaignResolutionSource: campaignResolution.source,
        parameterId: primaryParamId,
        value: readingMap[primaryParamId] ?? null,
        unitId: primaryParam?.defaultUnitId || null,
        autoConvert: false,
        additionalReadings,
        source: 'sensor',
    };
    observations.push(newObs);
    data.observations = observations;
    updateElement(elementId, { data });
    requestSensorUIRefresh('sensor.observation-created');
    showToast(t('sensorObservationCreated'), 'success');
}
// ----------------------------------------------------------------
// TEMPORAL TREND ALERTS
// Detecta tendências significativas nas leituras do sensor
// ----------------------------------------------------------------
/**
 * Analyze temporal trends in a sensor's readings and surface alerts.
 * Reaproveita Mann-Kendall + Theil-Sen via core/analytics/temporalTrendAlerts.
 *
 * @param {string} elementId - Sensor element ID
 */
export async function handleAnalyzeSensorTrends(elementId: any) {
    const element = getElementById(elementId);
    if (!element || element.family !== 'sensor') {
        showToast(t('sensorNotFound'), 'error');
        return;
    }
    const readings = Array.isArray(element.data?.latestReadings) ? element.data.latestReadings : [];
    if (readings.length === 0) {
        showToast(t('trendAlertsNoReadings') || 'No sensor readings to analyze. Fetch data first.', 'warning');
        return;
    }
    try {
        const { analyzeSensorTrends } = await import('../../core/analytics/temporalTrendAlerts.js' as string);
        const alerts = analyzeSensorTrends(element, { emitAlerts: true });
        const critical = alerts.filter((a: any) => a.severity === 'critical').length;
        const warning = alerts.filter((a: any) => a.severity === 'warning').length;
        purposeMicroFeedback('handleAnalyzeSensorTrends');
        if (critical > 0) {
            showToast(`${t('trendAlertsCritical') || 'Critical trend detected'}: ${critical}`, 'warning');
        }
        else {
            showToast(t('trendAlertsDone', { count: alerts.length }) ||
                `Trend analysis done: ${alerts.length} parameter(s), ${warning} warning(s)`, 'success');
        }
    }
    catch (err: any) {
        log.error('Trend analysis failed', err?.message);
        showToast(`${t('sensorFetchFailed')}: ${err?.message}`, 'error');
    }
}
// ----------------------------------------------------------------
// AUTO-REFRESH HANDLERS
// Controle de polling automático por sensor
// ----------------------------------------------------------------
/**
 * Silent fetch - updates data without full UI rebuild.
 * Usado pelo auto-refresh para evitar DOM thrash a cada tick.
 *
 * @param {string} elementId - ID of the sensor element
 */
export async function handleFetchSensorDataSilent(elementId: any) {
    const element = getElementById(elementId);
    if (!element || element.family !== 'sensor')
        return;
    const { getAppData } = await import('../../core/sensor/index.js' as string);
    const newData = await getAppData(element);
    updateElement(elementId, { data: newData });
    // Update DOM cirúrgico - só timestamp e indicador se sensor está selecionado
    const lastFetchEl = document.querySelector(`[data-sensor-lastfetch="${elementId}"]`);
    if (lastFetchEl) {
        const liveBadge = newData._autoRefreshActive
            ? `<span class="sensor-pulse"></span><span style="color:#22c55e; font-weight:500;">${t('sensorLiveData') || 'Live'}</span>`
            : '';
        lastFetchEl.innerHTML = `${liveBadge}${liveBadge ? ' ' : ''}Last: ${new Date(newData.lastFetch).toLocaleString()}`;
    }
}
/**
 * Toggle auto-refresh on/off for a sensor.
 *
 * @param {string} elementId
 * @param {boolean} checked
 * @param {string} intervalInputId - '5min', '15min', '30min'
 */
/**
 * CC-S1 B3 artesanal (CCC-001 Fase 11) — wrapper do checkbox auto-refresh:
 * lê o select de intervalo por id (default '15min') e delega — era multi-arg
 * inline com getElementById em elementControls + sensorCenterPanel.
 */
export function handleToggleAutoRefreshFromInput(elementId: any, checked: any, intervalInputId: any) {
    const sel = document.getElementById(String(intervalInputId)) as any;
    void handleToggleAutoRefresh(elementId, !!checked, sel?.value || '15min');
}

export async function handleToggleAutoRefresh(elementId: any, enabled: any, intervalKey: any, options: any = {}) {
    const element = getElementById(elementId);
    if (!element || element.family !== 'sensor')
        return;
    const silent = !!options?.silent;
    const skipUIUpdate = !!options?.skipUIUpdate;
    const safeInterval = _normalizeInterval(intervalKey);
    // REF-SWEEPS RF-2: handleToggleAutoRefreshFromInput chama esta funcao com `void`
    // (fire-and-forget) a partir do checkbox inline — o import() cru virava
    // 'Uncaught (in promise)'. Sem o chunk nao ha como ligar/desligar o timer:
    // avisamos e abortamos, em vez de deixar o checkbox mentindo em silencio.
    const _ar = await lazyImport('../../core/sensor/autoRefresh.js', { importer: () => import('../../core/sensor/autoRefresh.js' as string) });
    if (!_ar) {
        if (!silent) showToast(t('sensorAutoRefreshUnavailable') || 'Auto-refresh indisponivel (dependencia offline)', 'warning');
        return;
    }
    const { startAutoRefresh, stopAutoRefresh } = _ar;
    if (enabled) {
        startAutoRefresh(elementId, safeInterval, handleFetchSensorDataSilent);
        if (!silent)
            showToast(t('sensorAutoRefreshStarted') || 'Auto-refresh started', 'info');
    }
    else {
        stopAutoRefresh(elementId);
        if (!silent)
            showToast(t('sensorAutoRefreshStopped') || 'Auto-refresh stopped', 'info');
    }
    if (!skipUIUpdate)
        requestSensorUIRefresh('sensor.auto-refresh-toggled');
}
/**
 * Change the auto-refresh interval (restart if active).
 *
 * @param {string} elementId
 * @param {string} intervalKey
 */
export async function handleAutoRefreshIntervalChange(elementId: any, intervalKey: any) {
    const element = getElementById(elementId);
    if (!element || element.family !== 'sensor')
        return;
    const safeInterval = _normalizeInterval(intervalKey);
    // Persist intervalo mesmo com auto-refresh desligado
    updateElement(elementId, {
        data: { ...element.data, _autoRefreshInterval: safeInterval },
    });
    const { startAutoRefresh } = await import('../../core/sensor/autoRefresh.js' as string);
    if (element.data?._autoRefreshActive) {
        startAutoRefresh(elementId, safeInterval, handleFetchSensorDataSilent);
    }
    requestSensorUIRefresh('sensor.auto-refresh-interval-changed');
}
/**
 * Stop all active auto-refresh polls globally.
 */
export async function handleStopAllAutoRefresh(options: any = {}) {
    const silent = !!options?.silent;
    const { stopAllAutoRefresh } = await import('../../core/sensor/autoRefresh.js' as string);
    stopAllAutoRefresh();
    if (!silent)
        showToast(t('sensorAutoRefreshStopped') || 'Auto-refresh stopped', 'info');
    requestSensorUIRefresh('sensor.auto-refresh-stopped');
}
// ----------------------------------------------------------------
// SENSOR CENTER (UNIFIED TAB)
// Operacoes globais e navegacao da central de sensores
// ----------------------------------------------------------------
/**
 * Open sensors center tab and optionally focus a sensor row.
 *
 * @param {string|null} sensorId
 */
export function handleOpenSensorsCenter(sensorId = null) {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('sensor')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    activateTabById('sensors');
    if (sensorId) {
        resetSensorCenterFilters();
        focusSensorInCenter(sensorId);
    }
    requestSensorUIRefresh('sensor.center-opened');
    renderSensorCenterTab();
}
/**
 * Refresh all sensors once (silent fetch).
 */
export async function handleSensorCenterRefreshAll() {
    const sensors = _getAllSensors();
    if (sensors.length === 0) {
        showToast(t('sensorCenterNoSensors') || 'No sensors found in current model', 'warning');
        return;
    }
    let okCount = 0;
    for (const sensor of sensors) {
        try {
            await handleFetchSensorDataSilent(sensor.id);
            okCount++;
        }
        catch (err: any) {
            log.warn(`Sensor refresh failed for ${sensor.id}`, err?.message);
        }
    }
    showToast(t('sensorCenterRefreshAllDone', { count: okCount }) || `Sensors refreshed: ${okCount}/${sensors.length}`, okCount === sensors.length ? 'success' : 'warning');
    requestSensorUIRefresh('sensor.center-refresh-all');
}
/**
 * Start auto-refresh for all sensors with one interval.
 *
 * @param {string} intervalKey
 */
export async function handleSensorCenterStartAll(intervalKey: any) {
    const sensors = _getAllSensors();
    if (sensors.length === 0) {
        showToast(t('sensorCenterNoSensors') || 'No sensors found in current model', 'warning');
        return;
    }
    const safeInterval = _normalizeInterval(intervalKey || getSensorCenterBulkInterval());
    setSensorCenterBulkInterval(safeInterval);
    for (const sensor of sensors) {
        await handleToggleAutoRefresh(sensor.id, true, safeInterval, { silent: true, skipUIUpdate: true });
    }
    showToast(t('sensorCenterStartAllDone', { count: sensors.length, interval: safeInterval }) ||
        `Auto-refresh started for ${sensors.length} sensors (${safeInterval})`, 'success');
    requestSensorUIRefresh('sensor.center-start-all');
}
/**
 * Stop auto-refresh globally for all sensors.
 */
export async function handleSensorCenterStopAll() {
    const sensors = _getAllSensors();
    if (sensors.length === 0) {
        showToast(t('sensorCenterNoSensors') || 'No sensors found in current model', 'warning');
        return;
    }
    await handleStopAllAutoRefresh({ silent: true });
    showToast(t('sensorCenterStopAllDone', { count: sensors.length }) || `Auto-refresh stopped for ${sensors.length} sensors`, 'info');
    requestSensorUIRefresh('sensor.center-stop-all');
}
/**
 * Select sensor in 3D and animate camera focus.
 *
 * @param {string} sensorId
 */
export function handleSensorCenterFocusElement(sensorId: any) {
    const element = getElementById(sensorId);
    if (!element || element.family !== 'sensor') {
        showToast(t('sensorNotFound') || 'Sensor not found', 'error');
        return;
    }
    let selectedViaUI = false;
    if (typeof window.handleSelectElement === 'function') {
        try {
            window.handleSelectElement(sensorId);
            selectedViaUI = true;
        }
        catch (err: any) {
            log.warn('handleSelectElement fallback triggered', err?.message);
        }
    }
    if (!selectedViaUI) {
        setSelectedElement(sensorId);
    }
    try {
        zoomToElement(sensorId);
    }
    catch (err: any) {
        log.debug('Zoom to sensor element ignored', err?.message);
    }
    activateTabById('sensors');
    focusSensorInCenter(sensorId);
    requestSensorUIRefresh('sensor.center-focus-element');
}
// -- Sensor center local UI state handlers --
export function handleSensorCenterSearch(query: any) {
    setSensorCenterSearch(query);
}
export function handleSensorCenterFilter(status: any) {
    setSensorCenterStatusFilter(status);
}
export function handleSensorCenterSort(column: any) {
    setSensorCenterSort(column);
}
export function handleSensorCenterPage(page: any) {
    setSensorCenterPage(page);
}
export function handleSensorCenterToggleExpand(sensorId: any) {
    toggleSensorCenterExpanded(sensorId);
}
export function handleSensorCenterSetBulkInterval(intervalKey: any) {
    setSensorCenterBulkInterval(_normalizeInterval(intervalKey));
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
/**
 * Update a sensor endpoint URL.
 * Atualiza a URL de um endpoint específico do sensor.
 *
 * @param {string} elementId - Sensor element ID
 * @param {string} endpointKey - Endpoint key (identity, metadata, readings)
 * @param {string} url - New URL template
 */
export function handleSensorEndpointChange(elementId: any, endpointKey: any, url: any) {
    const element = getElementById(elementId);
    if (!element)
        return;
    const data = { ...element.data };
    const endpoints = { ...(data.endpoints || {}) };
    endpoints[endpointKey] = url;
    data.endpoints = endpoints;
    updateElement(elementId, { data });
}
// ----------------------------------------------------------------
// NESTED OBJECT EDITING (profile, evaluation)
// Edição de sub-objetos aninhados no data do sensor
// ----------------------------------------------------------------
/**
 * Update a field inside element.data.profile.
 * Atualiza um campo dentro do objeto profile do sensor.
 *
 * @param {string} elementId - Sensor element ID
 * @param {string} field - Field name (ownerName, city, serial, uuid)
 * @param {string} value - New value
 */
export function handleSensorProfileChange(elementId: any, field: any, value: any) {
    const element = getElementById(elementId);
    if (!element)
        return;
    const data = { ...element.data };
    const profile = { ...(data.profile || {}) };
    profile[field] = value;
    data.profile = profile;
    updateElement(elementId, { data });
}
/**
 * Update a field inside element.data.evaluation.
 * Atualiza um campo dentro do objeto evaluation do sensor.
 *
 * @param {string} elementId - Sensor element ID
 * @param {string} field - Field name (modelId, quantitative, key)
 * @param {*} value - New value
 */
export function handleSensorEvalChange(elementId: any, field: any, value: any) {
    const element = getElementById(elementId);
    if (!element)
        return;
    const data = { ...element.data };
    const evaluation = { ...(data.evaluation || {}) };
    // quantitative é numérico
    if (field === 'quantitative') {
        evaluation[field] = parseFloat(value) || 0;
    }
    else {
        evaluation[field] = value;
    }
    data.evaluation = evaluation;
    updateElement(elementId, { data });
}
export const sensorHandlers = {
    handleFetchSensorData,
    handleFetchSensorDataSilent,
    handleSetSensorApiKey,
    handleSensorFieldChange,
    handleSensorParameterToggle,
    handleSensorToObservation,
    handleAnalyzeSensorTrends,
    handleSensorEndpointChange,
    handleSensorProfileChange,
    handleSensorEvalChange,
    handleToggleAutoRefresh,
    handleToggleAutoRefreshFromInput,
    handleAutoRefreshIntervalChange,
    handleStopAllAutoRefresh,
    handleOpenSensorsCenter,
    handleSensorCenterRefreshAll,
    handleSensorCenterStartAll,
    handleSensorCenterStopAll,
    handleSensorCenterFocusElement,
    handleSensorCenterSearch,
    handleSensorCenterFilter,
    handleSensorCenterSort,
    handleSensorCenterPage,
    handleSensorCenterToggleExpand,
    handleSensorCenterSetBulkInterval,
};
