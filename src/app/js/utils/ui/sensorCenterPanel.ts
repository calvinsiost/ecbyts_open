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
   SENSORS CENTER PANEL
   ================================================================

   Unified right-panel view for all sensor elements.
   - Search / filter / sort / pagination
   - Global actions (refresh all, start/stop auto-refresh)
   - Per-sensor actions (refresh, focus in 3D, expand inline editor)
   - Inline full editor reusing renderSensorControls()
   ================================================================ */
import { getAllElements } from '../../core/elements/manager.js';
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { getIcon, hydrateIcons } from './icons.js';
import { renderSensorControls } from './elementControls.js';
const PAGE_SIZE = 25;
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 min
const state = {
    query: '',
    status: 'all', // all | live | stale | error
    sortBy: 'lastFetch',
    sortDir: 'desc', // asc | desc
    page: 1,
    pageSize: PAGE_SIZE,
    bulkInterval: '15min',
    expanded: new Set(),
    focusedSensorId: null,
    highlightedSensorId: null,
};
function getSensors() {
    return getAllElements().filter((/** @type {any} */ el) => el.family === 'sensor');
}
/**
 * @param {any} value
 */
function parseTimestamp(value: any) {
    if (!value) return NaN;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : NaN;
}
/**
 * @param {any} value
 */
function formatLastFetch(value: any) {
    const ts = parseTimestamp(value);
    return Number.isFinite(ts) ? new Date(ts).toLocaleString() : '—';
}
/**
 * @param {any} geoCoordinates
 */
function formatCoords(geoCoordinates: any) {
    if (
        !geoCoordinates ||
        typeof geoCoordinates.latitude !== 'number' ||
        typeof geoCoordinates.longitude !== 'number'
    ) {
        return '—';
    }
    return `${geoCoordinates.latitude.toFixed(5)}, ${geoCoordinates.longitude.toFixed(5)}`;
}
/**
 * @param {any} data
 */
function resolveTemperature(data: any) {
    const readings = Array.isArray(data?.latestReadings) ? data.latestReadings : [];
    const tempReading = readings.find((r: any) => r?.parameterId === 'temperature');
    if (typeof tempReading?.value === 'number') return tempReading.value;
    if (typeof data?.weather?.temperatureRaw === 'number') return data.weather.temperatureRaw;
    return null;
}
/**
 * @param {any} data
 */
function resolveSource(data: any) {
    const readings = Array.isArray(data?.latestReadings) ? data.latestReadings : [];
    const tempReading = readings.find((r: any) => r?.parameterId === 'temperature');
    return tempReading?.source || data?.weather?.source || '—';
}
/**
 * @param {any} sensor
 */
function getSensorStatus(sensor: any) {
    const data = sensor?.data || {};
    const hasError = (Array.isArray(data.errors) && data.errors.length > 0) || data.weather?._status === 'error';
    if (hasError) return 'error';
    if (data._autoRefreshActive) return 'live';
    const lastFetchTs = parseTimestamp(data.lastFetch);
    if (!Number.isFinite(lastFetchTs)) return 'stale';
    return Date.now() - lastFetchTs > STALE_THRESHOLD_MS ? 'stale' : 'idle';
}
/**
 * @param {any} status
 */
function getStatusLabel(status: any) {
    if (status === 'live') return t('sensorCenterStatusLive') || 'Live';
    if (status === 'stale') return t('sensorCenterStatusStale') || 'Stale';
    if (status === 'error') return t('sensorCenterStatusError') || 'Error';
    return t('sensorCenterStatusIdle') || 'Idle';
}
/**
 * @param {any} sensors
 */
function filterSensors(sensors: any) {
    const q = state.query.trim().toLowerCase();
    return sensors.filter((sensor: any) => {
        const data = sensor.data || {};
        const status = getSensorStatus(sensor);
        if (state.status !== 'all' && status !== state.status) return false;
        if (!q) return true;
        const haystack = [sensor.id, sensor.name, sensor.label, data?.sensorType, formatCoords(data?.geoCoordinates)]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return haystack.includes(q);
    });
}
/**
 * @param {any} sensors
 */
function sortSensors(sensors: any) {
    const direction = state.sortDir === 'asc' ? 1 : -1;
    const sorted = [...sensors];
    sorted.sort((/** @type {any} */ a, b: any) => {
        const da = a.data || {};
        const db = b.data || {};
        if (state.sortBy === 'sensor') {
            return direction * String(a.name || a.id).localeCompare(String(b.name || b.id));
        }
        if (state.sortBy === 'temperature') {
            const ta = resolveTemperature(da);
            const tb = resolveTemperature(db);
            const va = Number.isFinite(ta) ? ta : -Infinity;
            const vb = Number.isFinite(tb) ? tb : -Infinity;
            return direction * (va - vb);
        }
        if (state.sortBy === 'source') {
            return direction * String(resolveSource(da)).localeCompare(String(resolveSource(db)));
        }
        if (state.sortBy === 'autoRefresh') {
            const va = da._autoRefreshActive ? 1 : 0;
            const vb = db._autoRefreshActive ? 1 : 0;
            return direction * (va - vb);
        }
        if (state.sortBy === 'errors') {
            const va = Array.isArray(da.errors) ? da.errors.length : 0;
            const vb = Array.isArray(db.errors) ? db.errors.length : 0;
            return direction * (va - vb);
        }
        // default: lastFetch
        const ta = parseTimestamp(da.lastFetch);
        const tb = parseTimestamp(db.lastFetch);
        const va = Number.isFinite(ta) ? ta : -Infinity;
        const vb = Number.isFinite(tb) ? tb : -Infinity;
        return direction * (va - vb);
    });
    return sorted;
}
/**
 * @param {any} sensors
 */
function paginateSensors(sensors: any) {
    const total = sensors.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    const page = Math.min(Math.max(1, state.page), totalPages);
    state.page = page;
    const start = (page - 1) * state.pageSize;
    const end = start + state.pageSize;
    return {
        page,
        total,
        totalPages,
        items: sensors.slice(start, end),
    };
}
/**
 * @param {any} column
 */
function renderSortIndicator(column: any) {
    if (state.sortBy !== column) return '';
    return state.sortDir === 'asc' ? ' ▲' : ' ▼';
}
/**
 * @param {any} totalSensors
 * @param {any} filteredSensors
 */
function renderToolbar(totalSensors: any, filteredSensors: any) {
    return `
        <div class="sensor-center-toolbar">
            <div class="sensor-center-toolbar-main">
                <h3>${t('sensorCenterTitle') || 'Sensors Center'}</h3>
                <div class="sensor-center-toolbar-meta">
                    ${t('sensorCenterTotal') || 'Total'}: ${totalSensors}
                    · ${t('sensorCenterFiltered') || 'Filtered'}: ${filteredSensors}
                </div>
            </div>
            <div class="sensor-center-toolbar-actions">
                <button type="button" class="btn btn-sm btn-secondary"
                        data-cc-action="cc-b89462d9">
                    ${getIcon('refresh-cw', { size: '12px' })}
                    <span>${t('sensorCenterRefreshAll') || 'Refresh All'}</span>
                </button>
                <label class="sensor-center-inline-label" for="sensor-center-bulk-interval">
                    ${t('sensorCenterBulkInterval') || 'Interval'}
                </label>
                <select data-field-meta="true" data-field-meta-key="auto:sensor-center-bulk-interval" id="sensor-center-bulk-interval" class="form-input sensor-center-inline-select"
                        data-cc-change="cc-cf1f4c43">
                    <option value="5min" ${state.bulkInterval === '5min' ? 'selected' : ''}>5 min</option>
                    <option value="15min" ${state.bulkInterval === '15min' ? 'selected' : ''}>15 min</option>
                    <option value="30min" ${state.bulkInterval === '30min' ? 'selected' : ''}>30 min</option>
                </select>
                <button type="button" class="btn btn-sm btn-secondary"
                        data-cc-action="cc-e933ac15">
                    ${getIcon('play', { size: '12px' })}
                    <span>${t('sensorCenterStartAll') || 'Start All Auto-refresh'}</span>
                </button>
                <button type="button" class="btn btn-sm btn-secondary"
                        data-cc-action="cc-20689b48">
                    ${getIcon('square', { size: '12px' })}
                    <span>${t('sensorCenterStopAll') || 'Stop All'}</span>
                </button>
            </div>
        </div>
    `;
}
function renderFilters() {
    return `
        <div class="sensor-center-filters">
            <input data-field-meta="true" data-field-meta-key="auto-pos:sensorCenterPanel:input:L231" type="search"
                   class="form-input"
                   value="${escapeHtml(state.query)}"
                   placeholder="${escapeHtml(t('sensorCenterSearchPlaceholder') || 'Search by sensor name or id')}"
                   data-cc-input="cc-78dcd4be">
            <select class="form-input sensor-center-filter-select"
                    data-cc-change="cc-392d3c58">
                <option value="all" ${state.status === 'all' ? 'selected' : ''}>${t('sensorCenterFilterAll') || 'All'}</option>
                <option value="live" ${state.status === 'live' ? 'selected' : ''}>${t('sensorCenterFilterLive') || 'Live'}</option>
                <option value="stale" ${state.status === 'stale' ? 'selected' : ''}>${t('sensorCenterFilterStale') || 'Stale'}</option>
                <option value="error" ${state.status === 'error' ? 'selected' : ''}>${t('sensorCenterFilterError') || 'Error'}</option>
            </select>
        </div>
    `;
}
/**
 * @param {any} page
 * @param {any} totalPages
 * @param {any} totalRows
 */
function renderPagination(page: any, totalPages: any, totalRows: any) {
    return `
        <div class="sensor-center-pagination">
            <div class="sensor-center-pagination-info">
                ${t('sensorCenterRows') || 'Rows'}: ${totalRows}
                · ${t('sensorCenterPage') || 'Page'}: ${page}/${totalPages}
            </div>
            <div class="sensor-center-pagination-actions">
                <button type="button" class="btn btn-sm btn-secondary"
                        ${page <= 1 ? 'disabled' : ''}
                        data-cc-call-click="handleSensorCenterPage|j:${encodeURIComponent(String(page - 1))}">
                    ${t('sensorCenterPrevPage') || 'Prev'}
                </button>
                <button type="button" class="btn btn-sm btn-secondary"
                        ${page >= totalPages ? 'disabled' : ''}
                        data-cc-call-click="handleSensorCenterPage|j:${encodeURIComponent(String(page + 1))}">
                    ${t('sensorCenterNextPage') || 'Next'}
                </button>
            </div>
        </div>
    `;
}
/**
 * @param {any} hasAnySensors
 */
function renderEmptyState(hasAnySensors: any) {
    return `
        <div class="sensor-center-empty">
            ${
                hasAnySensors
                    ? t('sensorCenterNoMatch') || 'No sensors match the current filters.'
                    : t('sensorCenterNoSensors') || 'No sensors found in the current model.'
            }
        </div>
    `;
}
/**
 * @param {any} sensor
 */
function renderRow(sensor: any) {
    const data = sensor.data || {};
    const status = getSensorStatus(sensor);
    const statusLabel = getStatusLabel(status);
    const statusClass = `sensor-center-status sensor-center-status-${status}`;
    const coords = formatCoords(data.geoCoordinates);
    const temperature = resolveTemperature(data);
    const temperatureText = Number.isFinite(temperature) ? `${temperature.toFixed(1)} °C` : '—';
    const sourceText = String(resolveSource(data));
    const lastFetchText = formatLastFetch(data.lastFetch);
    const errors = Array.isArray(data.errors) ? data.errors : [];
    const errorsCount = errors.length;
    const errorsTitle = errorsCount > 0 ? escapeHtml(errors[0]) : '';
    const isExpanded = state.expanded.has(sensor.id);
    const isHighlighted = state.highlightedSensorId === sensor.id;
    const interval = data._autoRefreshInterval || state.bulkInterval || '15min';
    return `
        <tr data-sensor-row-id="${escapeHtml(sensor.id)}" class="${isHighlighted ? 'sensor-center-row-focused' : ''}">
            <td>
                <div class="sensor-center-sensor">
                    <div class="sensor-center-sensor-name">${escapeHtml(sensor.name || sensor.id)}</div>
                    <div class="sensor-center-sensor-id">${escapeHtml(sensor.id)}</div>
                    <span class="${statusClass}">${escapeHtml(statusLabel)}</span>
                </div>
            </td>
            <td>${escapeHtml(coords)}</td>
            <td>${escapeHtml(temperatureText)}</td>
            <td>${escapeHtml(sourceText)}</td>
            <td>${escapeHtml(lastFetchText)}</td>
            <td>
                <div class="sensor-center-auto">
                    <label>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:sensorCenterPanel:input:L315" type="checkbox"
                               ${data._autoRefreshActive ? 'checked' : ''}
                               data-cc-call-change="handleToggleAutoRefreshFromInput|s:${encodeURIComponent(`${escapeHtml(sensor.id)}`)}|c|s:${encodeURIComponent(`sensor-center-int-${escapeHtml(sensor.id)}`)}">
                        <span>${data._autoRefreshActive ? t('sensorCenterStatusLive') || 'Live' : t('sensorCenterStatusIdle') || 'Idle'}</span>
                    </label>
                    <select data-field-meta="true" data-field-meta-key="auto-tpl:sensorCenterPanel:select:L320" id="sensor-center-int-${escapeHtml(sensor.id)}"
                            class="form-input sensor-center-inline-select"
                            data-cc-call-change="handleAutoRefreshIntervalChange|s:${encodeURIComponent(`${escapeHtml(sensor.id)}`)}|v">
                        <option value="5min" ${interval === '5min' ? 'selected' : ''}>5m</option>
                        <option value="15min" ${interval === '15min' ? 'selected' : ''}>15m</option>
                        <option value="30min" ${interval === '30min' ? 'selected' : ''}>30m</option>
                    </select>
                </div>
            </td>
            <td title="${errorsTitle}">
                ${errorsCount > 0 ? `${errorsCount}` : '—'}
            </td>
            <td>
                <div class="sensor-center-actions">
                    <button type="button" class="btn btn-sm btn-secondary"
                            data-cc-call-click="handleFetchSensorData|s:${encodeURIComponent(`${escapeHtml(sensor.id)}`)}">
                        ${t('sensorCenterActionRefresh') || 'Refresh'}
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary"
                            data-cc-call-click="handleSensorCenterFocusElement|s:${encodeURIComponent(`${escapeHtml(sensor.id)}`)}">
                        ${t('sensorCenterActionFocus') || 'Focus'}
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary"
                            data-cc-call-click="handleAnalyzeSensorTrends|s:${encodeURIComponent(`${escapeHtml(sensor.id)}`)}">
                        ${t('trendAlertsAnalyze') || 'Analyze Trends'}
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary"
                            data-cc-call-click="handleSensorCenterToggleExpand|s:${encodeURIComponent(`${escapeHtml(sensor.id)}`)}">
                        ${
                            isExpanded
                                ? t('sensorCenterActionCollapse') || 'Hide'
                                : t('sensorCenterActionExpand') || 'Details'
                        }
                    </button>
                </div>
            </td>
        </tr>
        ${
            isExpanded
                ? `
        <tr class="sensor-center-expanded-row">
            <td colspan="8">
                <div class="sensor-center-expanded-content">
                    ${renderSensorControls(sensor)}
                </div>
            </td>
        </tr>
        `
                : ''
        }
    `;
}
export function renderSensorCenterTab() {
    const container = (document.getElementById('tab-sensors-content')) as any;
    if (!container) return;
    const allSensors = getSensors();
    const filtered = filterSensors(allSensors);
    const sorted = sortSensors(filtered);
    let pagination = paginateSensors(sorted);
    if (state.focusedSensorId) {
        const focusedIndex = sorted.findIndex((sensor: any) => sensor.id === state.focusedSensorId);
        if (focusedIndex >= 0) {
            const targetPage = Math.floor(focusedIndex / state.pageSize) + 1;
            if (pagination.page !== targetPage) {
                state.page = targetPage;
                pagination = paginateSensors(sorted);
            }
            state.highlightedSensorId = state.focusedSensorId;
        }
    }
    // Cleanup expanded ids that no longer exist
    for (const sensorId of [...state.expanded]) {
        if (!allSensors.some((s: any) => s.id === sensorId)) {
            state.expanded.delete(sensorId);
        }
    }
    if (allSensors.length === 0 || pagination.items.length === 0) {
        container.innerHTML = `
            ${renderToolbar(allSensors.length, filtered.length)}
            ${renderFilters()}
            ${renderEmptyState(allSensors.length > 0)}
        `;
        hydrateIcons(container);
        return;
    }
    container.innerHTML = `
        ${renderToolbar(allSensors.length, filtered.length)}
        ${renderFilters()}
        <div class="sensor-center-table-wrap">
            <table class="sensor-center-table">
                <thead>
                    <tr>
                        <th><button type="button" class="sensor-center-sort-btn" data-cc-action="cc-01ea420b">${t('sensorCenterColSensor') || 'Sensor'}${renderSortIndicator('sensor')}</button></th>
                        <th>${t('sensorCenterColCoordinates') || 'Coordinates'}</th>
                        <th><button type="button" class="sensor-center-sort-btn" data-cc-action="cc-afd770d9">${t('sensorCenterColTemperature') || 'Temperature'}${renderSortIndicator('temperature')}</button></th>
                        <th><button type="button" class="sensor-center-sort-btn" data-cc-action="cc-b785d780">${t('sensorCenterColSource') || 'Source'}${renderSortIndicator('source')}</button></th>
                        <th><button type="button" class="sensor-center-sort-btn" data-cc-action="cc-01611817">${t('sensorCenterColLastFetch') || 'Last Fetch'}${renderSortIndicator('lastFetch')}</button></th>
                        <th><button type="button" class="sensor-center-sort-btn" data-cc-action="cc-b9c42349">${t('sensorCenterColAutoRefresh') || 'Auto-refresh'}${renderSortIndicator('autoRefresh')}</button></th>
                        <th><button type="button" class="sensor-center-sort-btn" data-cc-action="cc-899e9c2a">${t('sensorCenterColErrors') || 'Errors'}${renderSortIndicator('errors')}</button></th>
                        <th>${t('sensorCenterColActions') || 'Actions'}</th>
                    </tr>
                </thead>
                <tbody>
                    ${pagination.items.map(renderRow).join('')}
                </tbody>
            </table>
        </div>
        ${renderPagination(pagination.page, pagination.totalPages, pagination.total)}
    `;
    hydrateIcons(container);
    if (state.focusedSensorId) {
        const row = [...container.querySelectorAll('[data-sensor-row-id]')].find(
            (/** @type {any} */ el) => el.getAttribute('data-sensor-row-id') === state.focusedSensorId,
        );
        if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        state.focusedSensorId = null;
    }
}
/**
 * @param {any} query
 */
export function setSensorCenterSearch(query: any) {
    state.query = String(query || '');
    state.page = 1;
    renderSensorCenterTab();
}
/**
 * @param {any} status
 */
export function setSensorCenterStatusFilter(status: any) {
    state.status = ['all', 'live', 'stale', 'error'].includes(status) ? status : 'all';
    state.page = 1;
    renderSensorCenterTab();
}
/**
 * @param {any} page
 */
export function setSensorCenterPage(page: any) {
    const nextPage = Number.isFinite(Number(page)) ? Number(page) : 1;
    state.page = Math.max(1, nextPage);
    renderSensorCenterTab();
}
/**
 * @param {any} column
 */
export function setSensorCenterSort(column: any) {
    const allowed = ['sensor', 'temperature', 'source', 'lastFetch', 'autoRefresh', 'errors'];
    if (!allowed.includes(column)) return;
    if (state.sortBy === column) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortBy = column;
        state.sortDir = column === 'lastFetch' ? 'desc' : 'asc';
    }
    state.page = 1;
    renderSensorCenterTab();
}
/**
 * @param {any} sensorId
 */
export function toggleSensorCenterExpanded(sensorId: any) {
    if (!sensorId) return;
    if (state.expanded.has(sensorId)) state.expanded.delete(sensorId);
    else state.expanded.add(sensorId);
    renderSensorCenterTab();
}
/**
 * @param {any} intervalKey
 */
export function setSensorCenterBulkInterval(intervalKey: any) {
    if (!['5min', '15min', '30min'].includes(intervalKey)) return;
    state.bulkInterval = intervalKey;
    renderSensorCenterTab();
}
/**
 * @param {any} sensorId
 */
export function focusSensorInCenter(sensorId: any) {
    if (!sensorId) return;
    state.focusedSensorId = sensorId;
    state.expanded.add(sensorId);
}
export function resetSensorCenterFilters() {
    state.query = '';
    state.status = 'all';
    state.page = 1;
}
export function getSensorCenterBulkInterval() {
    return state.bulkInterval;
}
