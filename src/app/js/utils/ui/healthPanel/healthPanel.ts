// @ts-check
// Generated from src/app/js/utils/ui/healthPanel/healthPanel.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   HEALTH PANEL — Phase 3: Alert engine wired, Dashboard KPIs reais
   Painel lateral para HEALTH-MON-001 (Saúde Ocupacional)

   Fases:
     Phase 1 (entregue): shell + i18n
     Phase 2 (entregue): tabs Workers + Readings funcionais
     Phase 3 (este arquivo): batchEvaluateReadings + workerHealthSummary
     Phase 4 (futuro): IDB sync + Supabase + CSV export

   Segue pattern de utils/ui/datastudio/ (panel slide-in).
   ================================================================ */
import { t } from '../../i18n/translations.js';
import { escapeHtml, escapeAttr } from '../../helpers/html.js';
import { createLogger } from '../../helpers/logger.js';
import { registerWorker, listWorkers, generateConsentHash } from '../../../core/health/workerRegistry.js';
import { createBiomarkerReading } from '../../../core/health/biomarkerReading.js';
import { evaluateReadingStatus, findApplicableRule } from '../../../core/health/thresholdEngine.js';
import { ACGIH_BEI_2024, listDefaultBeiTypes, getBiomarkerDisplayName } from '../../../core/health/acgihBei2024.js';
import { batchEvaluateReadings, generateWorkerHealthSummary } from '../../../core/health/healthAlertEngine.js';
import { saveWorker, loadWorkers, saveReading, loadReadings } from '../../../core/health/healthStore.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../../sharing/deepLinkUrlSync.js';
const log = createLogger('HealthPanel');
// ── State ────────────────────────────────────────────────────────────────────
/** @type {any} */
let _panelEl: any = null;
let _activeTab = 'workers';
let _projectId = 'default';
const _readings: any[] = []; // local-state (Phase 3: IDB)
let _rules: any = []; // local-state (Phase 3: IDB)
let _workerSearch = '';
let _readingsFilterBiomarker = '';
// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_COLORS = Object.freeze({
    green: { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
    yellow: { bg: '#fef9c3', text: '#854d0e', border: '#fef08a' },
    red: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
    critical: { bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8' },
});
const TABS = Object.freeze([
    { id: 'workers', key: 'healthPanel.workersSection' },
    { id: 'readings', key: 'healthPanel.readingsSection' },
    { id: 'dashboard', key: 'healthPanel.dashboardSection' },
    { id: 'rules', key: 'healthPanel.rulesSection' },
]);
// ── Init default rules from ACGIH BEI 2024 ──────────────────────────────────
function _ensureDefaultRules() {
    if (_rules.length > 0) return;
    _rules = listDefaultBeiTypes().map(
        /** @param {string} projectId */ (type: any) => {
            const bei = (ACGIH_BEI_2024 as any)[type];
            return {
                id: type,
                biomarkerType: type,
                warningValue: bei.warningValue,
                criticalValue: bei.criticalValue,
                actionValue: bei.actionValue ?? null,
                unit: bei.unit,
                referenceStandard: bei.referenceStandard,
                active: true,
            };
        },) as Record<string, any>;
}
// ── Panel lifecycle ───────────────────────────────────────────────────────────
/**
 * Open the Health Environmental Monitoring panel.
 * @param {string} [projectId='default']
 * @returns {HTMLElement}
 */
export function openHealthPanel( projectId: any = 'default') {
    // null vindo de callers payload-less (ex: deep-link dispatcher) não ativa o default
    if (projectId == null) projectId = 'default';
    _projectId = projectId;
    syncDeepLinkUrl('health-monitor');
    _ensureDefaultRules();
    if (_panelEl && document.body.contains(_panelEl)) {
        _refresh();
        return _panelEl;
    }
    _panelEl = document.createElement('div');
    _panelEl.id = 'health-panel';
    _panelEl.className = 'health-panel';
    _panelEl.setAttribute('role', 'complementary');
    _panelEl.setAttribute('aria-label', t('healthPanel.title') || 'Health Environmental Monitoring');
    _panelEl.setAttribute('data-project-id', projectId);
    _panelEl.innerHTML = _renderShell();
    document.body.appendChild(_panelEl);
    _attachListeners();
    _refresh();
    // Phase 4: load persisted data from IDB asynchronously after initial render
    _loadFromIDB();
    log.info('Health panel opened — project:', projectId);
    return _panelEl;
}
/** Close and remove the panel. */
export function closeHealthPanel() {
    if (_panelEl) {
        _panelEl.remove();
        _panelEl = null;
        clearDeepLinkUrl();
    }
}
/** @returns {boolean} */
export function isHealthPanelOpen() {
    return _panelEl !== null && document.body.contains(_panelEl);
}
/**
 * Load persisted workers and readings from IDB into in-memory state.
 * Hydrates workerRegistry and _readings array, then refreshes the panel.
 * Called once after the panel DOM is created.
 */
async function _loadFromIDB() {
    try {
        const [storedWorkers, storedReadings] = await Promise.all([loadWorkers(), loadReadings()]);
        // Hydrate worker registry - re-register workers that aren't already in memory
        for (const w of storedWorkers) {
            try {
                registerWorker(/** @type {any} */ (w));
            } catch (e: any) {
                console.debug('[healthPanel] registerWorker:', e?.message || e);
                // Already registered (duplicate pseudonym) - skip silently
            }
        }
        // Hydrate readings - append only new ids (avoid duplicates on re-open)
        const existingIds = new Set(_readings.map(/** @param {any} worker */ (r: any) => r.id));
        for (const _r of storedReadings) {
            const r = (_r) as any;
            if (r && r.id && !existingIds.has(r.id)) {
                _readings.push(r);
                existingIds.add(r.id);
            }
        }
        if (storedWorkers.length > 0 || storedReadings.length > 0) {
            _refresh();
            log.info('IDB hydration complete — workers:', storedWorkers.length, 'readings:', storedReadings.length);
        }
    } catch (err: any) {
        console.warn('[ecbyts:health]', 'IDB load failed (panel continues without persisted data):', err);
    }
}
// ── Shell ─────────────────────────────────────────────────────────────────────
function _renderShell() {
    const title = escapeHtml(t('healthPanel.title') || 'Saúde Ocupacional');
    const closeLabel = escapeAttr(t('close') || 'Fechar');
    const tabsHtml = TABS.map(({ id, key }: any) => {
        const label = escapeHtml(t(key) || id);
        const activeClass = _activeTab === id ? 'active' : '';
        return `<button class="health-tab-btn ${activeClass}" data-tab="${escapeAttr(id)}" type="button">${label}</button>`;
    }).join('');
    return `
        <div class="health-panel-header">
            <span class="health-panel-title">${title}</span>
            <button class="health-panel-close" type="button" title="${closeLabel}" aria-label="${closeLabel}">&times;</button>
        </div>
        <nav class="health-panel-tabs" role="tablist">${tabsHtml}</nav>
        <div class="health-panel-body" id="health-panel-body" role="tabpanel"></div>
    `;
}
function _refresh() {
    const body = _panelEl?.querySelector('#health-panel-body');
    if (!body) return;
    switch (_activeTab) {
        case 'workers':
            body.innerHTML = _renderWorkers();
            break;
        case 'readings':
            body.innerHTML = _renderReadings();
            break;
        case 'dashboard':
            body.innerHTML = _renderDashboard();
            break;
        case 'rules':
            body.innerHTML = _renderRules();
            break;
        default:
            body.innerHTML = '';
    }
    _attachBodyListeners(body);
}
// ── Workers tab ───────────────────────────────────────────────────────────────
function _renderWorkers() {
    const workers = listWorkers(_projectId);
    const addLabel = escapeHtml(t('healthPanel.addWorker') || 'Adicionar Trabalhador');
    const searchPlaceholder = escapeAttr(t('healthPanel.searchWorkers') || 'Buscar trabalhador...');
    const searchVal = escapeAttr(_workerSearch);
    const filteredWorkers = _workerSearch
        ? workers.filter(
              /** @param {any} w */ (w: any) =>
                  w.pseudonym.toLowerCase().includes(_workerSearch.toLowerCase()) ||
                  (w.role || '').toLowerCase().includes(_workerSearch.toLowerCase()),
          )
        : workers;
    const listHtml =
        filteredWorkers.length === 0
            ? `<div class="health-empty-state">
                <div class="health-empty-icon">&#9670;</div>
                <div class="health-empty-title">${escapeHtml(t('healthPanel.noWorkers') || 'Nenhum trabalhador registrado')}</div>
               </div>`
            : filteredWorkers.map(/** @param {any} w */ (w: any) => _renderWorkerCard(w)).join('');
    return `
        <div class="health-workers-tab">
            <div class="health-tab-toolbar">
                <input class="health-search-input" id="health-worker-search" type="search"
                    placeholder="${searchPlaceholder}" value="${searchVal}" />
                <button class="health-btn-primary" id="health-add-worker-btn" type="button">${addLabel}</button>
                <button class="health-btn-secondary" id="health-export-workers-btn" type="button"
                    data-cc-action="cc-738a5d9b">${escapeHtml(t('healthPanel.exportCSV') || 'Exportar CSV')}</button>
            </div>
            <div class="health-workers-list" id="health-workers-list">${listHtml}</div>
            <div id="health-add-worker-form" class="health-add-form" hidden></div>
        </div>
    `;
}
/** @param {any} worker */
function _renderWorkerCard( worker: any) {
    const workerReadings = _readings.filter(/** @param {any} reading */ (r: any) => r.workerPseudonym === worker.pseudonym);
    const lastReading = workerReadings.sort(
        /** @param {any} a @param {any} b */ (a, b) =>
            new Date(b.sampleDate).getTime() - new Date(a.sampleDate).getTime(),
    )[0];
    const statusInfo = lastReading ? _getReadingStatus(lastReading) : null;
    const status = (statusInfo?.status) as string | undefined;
    const statusColor = status
        ? (STATUS_COLORS as any)[status] || STATUS_COLORS.green
        : null;
    // Phase 3: worker health summary via alert engine
    const healthSummary = generateWorkerHealthSummary(worker.id, _readings, _rules);
    const compliancePct = Math.round(healthSummary.complianceRate * 100);
    const statusBadge = statusColor
        ? `<span class="health-status-badge"
            style="background:${statusColor.bg};color:${statusColor.text};border:1px solid ${statusColor.border}">
            ${escapeHtml(status || '')}
           </span>`
        : `<span class="health-status-badge health-status-unknown">—</span>`;
    const role = escapeHtml(worker.role || '—');
    const pseudonym = escapeHtml(worker.pseudonym);
    const deep3dLabel = escapeAttr(t('healthPanel.viewIn3D') || 'Ver no 3D');
    const readingsCount = workerReadings.length;
    const complianceClass = compliancePct >= 80 ? 'health-compliance-ok' : 'health-compliance-warn';
    const complianceHtml =
        healthSummary.totalReadings > 0
            ? `<div class="health-compliance ${complianceClass}">${compliancePct}% conf.</div>`
            : '';
    return `
        <div class="health-worker-card" data-worker-id="${escapeAttr(worker.id)}">
            <div class="health-worker-card-left">
                <div class="health-worker-pseudonym">${pseudonym}</div>
                <div class="health-worker-role">${role}</div>
                <div class="health-worker-readings-count">${readingsCount} ${escapeHtml(t('healthPanel.readings') || 'leituras')}</div>
                ${complianceHtml}
            </div>
            <div class="health-worker-card-right">
                ${statusBadge}
                <button class="health-btn-icon health-deep3d-btn" data-worker-id="${escapeAttr(worker.id)}"
                    title="${deep3dLabel}" type="button">&#9654;</button>
            </div>
        </div>
    `;
}
function _renderAddWorkerForm() {
    const cancelLabel = escapeHtml(t('cancel') || 'Cancelar');
    const saveLabel = escapeHtml(t('save') || 'Salvar');
    const roles = ['Operador', 'Técnico', 'Engenheiro', 'Supervisor', 'Médico', 'Outro'];
    const roleOptions = roles.map((r: any) => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('');
    return `
        <form class="health-add-worker-form-inner" id="health-worker-form-inner" novalidate>
            <div class="health-form-row">
                <label for="health-worker-pseudonym">${escapeHtml(t('healthPanel.workerCode') || 'Código/Pseudônimo')}</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:healthPanel:input:L305" type="text" id="health-worker-pseudonym" required maxlength="64"
                    placeholder="${escapeAttr(t('healthPanel.workerCodePlaceholder') || 'ex: TRB-001')}" />
            </div>
            <div class="health-form-row">
                <label for="health-worker-role">${escapeHtml(t('healthPanel.jobFunction') || 'Função')}</label>
                <select data-field-meta="true" data-field-meta-key="auto-pos:healthPanel:select:L310" id="health-worker-role">
                    ${roleOptions}
                </select>
            </div>
            <div class="health-form-row">
                <label for="health-worker-birth-year">${escapeHtml(t('healthPanel.birthYear') || 'Ano de Nascimento')}</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:healthPanel:input:L316" type="number" id="health-worker-birth-year" min="1940" max="2010" placeholder="1985" />
            </div>
            <div class="health-form-row">
                <label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:healthPanel:input:L320" type="checkbox" id="health-worker-consent" required />
                    ${escapeHtml(t('healthPanel.consentLabel') || 'Trabalhador consentiu com coleta de dados de saúde (LGPD)')}
                </label>
            </div>
            <div class="health-form-actions">
                <button type="button" class="health-btn-secondary" id="health-cancel-worker">
                    ${cancelLabel}
                </button>
                <button type="submit" class="health-btn-primary">
                    ${saveLabel}
                </button>
            </div>
        </form>
    `;
}
// ── Readings tab ──────────────────────────────────────────────────────────────
function _renderReadings() {
    const workers = listWorkers(_projectId);
    const addLabel = escapeHtml(t('healthPanel.addReading') || 'Adicionar Leitura');
    const filterAll = escapeHtml(t('healthPanel.allBiomarkers') || 'Todos');
    const biomarkerTypes = listDefaultBeiTypes();
    const filterOptions = [
        `<option value="">${filterAll}</option>`,
        ...biomarkerTypes.map((type: any) => {
            const selected = _readingsFilterBiomarker === type ? ' selected' : '';
            return `<option value="${escapeAttr(type)}"${selected}>${escapeHtml(getBiomarkerDisplayName(type))}</option>`;
        }),
    ].join('');
    const filtered = _readingsFilterBiomarker
        ? _readings.filter(/** @param {any} reading */ (r: any) => r.biomarkerType === _readingsFilterBiomarker)
        : _readings;
    const sorted = [...filtered].sort(
        /** @param {any} a @param {any} b */ (a, b) =>
            new Date(b.sampleDate).getTime() - new Date(a.sampleDate).getTime(),
    );
    const tableRows =
        sorted.length === 0
            ? `<tr><td colspan="5" class="health-empty-row">
                ${escapeHtml(t('healthPanel.noReadings') || 'Nenhuma leitura registrada')}
               </td></tr>`
            : sorted.map(/** @param {any} reading */ (r: any) => _renderReadingRow(r)).join('');
    const workerOptions = workers
        .map(
            /** @param {any} w */ (w: any) =>
                `<option value="${escapeAttr(w.pseudonym)}">${escapeHtml(w.pseudonym)}</option>`,
        )
        .join('');
    return `
        <div class="health-readings-tab">
            <div class="health-tab-toolbar">
                <select class="health-filter-select" id="health-biomarker-filter">
                    ${filterOptions}
                </select>
                <button class="health-btn-primary" id="health-add-reading-btn" type="button">${addLabel}</button>
                <button class="health-btn-secondary" id="health-export-readings-btn" type="button"
                    data-cc-action="cc-a49154a7">${escapeHtml(t('healthPanel.exportCSV') || 'Exportar CSV')}</button>
            </div>
            <div class="health-readings-table-wrap">
                <table class="health-readings-table">
                    <thead>
                        <tr>
                            <th>${escapeHtml(t('healthPanel.worker') || 'Trabalhador')}</th>
                            <th>${escapeHtml(t('healthPanel.biomarkerType') || 'Biomarcador')}</th>
                            <th>${escapeHtml(t('healthPanel.value') || 'Valor')}</th>
                            <th>${escapeHtml(t('healthPanel.unit') || 'Unidade')}</th>
                            <th>${escapeHtml(t('date') || 'Data')}</th>
                        </tr>
                    </thead>
                    <tbody id="health-readings-body">${tableRows}</tbody>
                </table>
            </div>
            <div id="health-add-reading-form" class="health-add-form" hidden>
                ${_renderAddReadingForm(workerOptions, biomarkerTypes)}
            </div>
        </div>
    `;
}
/** @param {any} reading */
function _renderReadingRow( reading: any) {
    const statusInfo = _getReadingStatus(reading);
    const status = (statusInfo?.status) as string | undefined;
    const col = status
        ? (STATUS_COLORS as any)[status] || STATUS_COLORS.green
        : STATUS_COLORS.green;
    const valueDisplay = `${reading.value} ${escapeHtml(reading.unit || '')}`;
    const dateStr = escapeHtml(reading.sampleDate ? reading.sampleDate.slice(0, 10) : '—');
    return `<tr style="background:${col.bg};border-left:3px solid ${col.border}">
        <td>${escapeHtml(reading.workerPseudonym)}</td>
        <td>${escapeHtml(getBiomarkerDisplayName(reading.biomarkerType) || reading.biomarkerType)}</td>
        <td style="color:${col.text};font-weight:600">${escapeHtml(valueDisplay)}</td>
        <td>${escapeHtml(reading.unit || '—')}</td>
        <td>${dateStr}</td>
    </tr>`;
}
/** @param {string} workerOptions @param {Array<string>} biomarkerTypes */
function _renderAddReadingForm( workerOptions: any, biomarkerTypes: any) {
    const biomarkerOptions = biomarkerTypes
        .map(
            /** @param {string} batch */ (type: any) =>
                `<option value="${escapeAttr(type)}">${escapeHtml(getBiomarkerDisplayName(type))}</option>`,
        )
        .join('');
    const cancelLabel = escapeHtml(t('cancel') || 'Cancelar');
    const saveLabel = escapeHtml(t('save') || 'Salvar');
    const noWorker = escapeHtml(t('healthPanel.noWorkers') || '— Nenhum trabalhador —');
    return `
        <form class="health-add-form-inner" id="health-reading-form-inner" novalidate>
            <div class="health-form-row">
                <label for="health-reading-worker">${escapeHtml(t('healthPanel.worker') || 'Trabalhador')}</label>
                <select data-field-meta="true" data-field-meta-key="auto-pos:healthPanel:select:L429" id="health-reading-worker" required>
                    <option value="">${noWorker}</option>
                    ${workerOptions}
                </select>
            </div>
            <div class="health-form-row">
                <label for="health-reading-biomarker">${escapeHtml(t('healthPanel.biomarkerType') || 'Biomarcador')}</label>
                <select data-field-meta="true" data-field-meta-key="auto-pos:healthPanel:select:L436" id="health-reading-biomarker" required>${biomarkerOptions}</select>
            </div>
            <div class="health-form-row">
                <label for="health-reading-value">${escapeHtml(t('healthPanel.value') || 'Valor')}</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:healthPanel:input:L440" type="number" id="health-reading-value" step="any" required min="0" />
            </div>
            <div class="health-form-row">
                <label for="health-reading-date">${escapeHtml(t('date') || 'Data')}</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:healthPanel:input:L444" type="date" id="health-reading-date" required value="${new Date().toISOString().slice(0, 10)}" />
            </div>
            <div class="health-form-actions">
                <button type="button" class="health-btn-secondary" id="health-cancel-reading">
                    ${cancelLabel}
                </button>
                <button type="submit" class="health-btn-primary">${saveLabel}</button>
            </div>
        </form>
    `;
}
// ── Dashboard tab ─────────────────────────────────────────────────────────────
function _renderDashboard() {
    const workers = listWorkers(_projectId);
    const workerCount = workers.length;
    // Phase 3: use alert engine for accurate KPIs
    const batch = batchEvaluateReadings(_readings, _rules);
    const alertsActive = batch.flagged;
    const criticalCount = (batch.byLevel.critical || 0) + (batch.byLevel.action || 0);
    const kpiLabel = (key: any, fallback: any) =>
        escapeHtml(t(key) || fallback);
    return `
        <div class="health-dashboard-tab">
            <div class="health-kpi-grid">
                <div class="health-kpi-card">
                    <div class="health-kpi-value">${workerCount}</div>
                    <div class="health-kpi-label">${kpiLabel('healthPanel.totalWorkers', 'Trabalhadores')}</div>
                </div>
                <div class="health-kpi-card">
                    <div class="health-kpi-value">${batch.total}</div>
                    <div class="health-kpi-label">${kpiLabel('healthPanel.totalReadings', 'Leituras')}</div>
                </div>
                <div class="health-kpi-card health-kpi-green">
                    <div class="health-kpi-value">${batch.passed}</div>
                    <div class="health-kpi-label">${kpiLabel('healthPanel.alertGreen', 'Normal')}</div>
                </div>
                <div class="health-kpi-card health-kpi-yellow">
                    <div class="health-kpi-value">${alertsActive}</div>
                    <div class="health-kpi-label">${kpiLabel('healthPanel.alertsActive', 'Alertas ativos')}</div>
                </div>
            </div>
            ${criticalCount > 0 ? _renderCriticalAlert(batch) : ''}
            <div class="health-dashboard-actions">
                <button class="health-btn-secondary" type="button"
                    data-cc-action="cc-76d9791a">${escapeHtml(t('healthPanel.exportCSV') || 'Exportar CSV')}</button>
            </div>
        </div>
    `;
}
/** @param {any} batch */
function _renderCriticalAlert( batch: any) {
    const critCount = (batch.byLevel?.critical || 0) + (batch.byLevel?.action || 0);
    return `
        <div class="health-critical-banner">
            <span style="color:#991b1b;font-weight:700">&#9888;</span>
            ${escapeHtml(t('healthPanel.criticalAlert') || `${critCount} leitura(s) com valor crítico — revisar imediatamente`)}
        </div>
    `;
}
// ── Rules tab ─────────────────────────────────────────────────────────────────
function _renderRules() {
    const rowsHtml = _rules
        .filter((r: any) => r.active)
        .map((rule: any) => `
            <tr>
                <td>${escapeHtml(getBiomarkerDisplayName(rule.biomarkerType) || rule.biomarkerType)}</td>
                <td>${escapeHtml(String(rule.warningValue))} ${escapeHtml(rule.unit)}</td>
                <td>${escapeHtml(String(rule.criticalValue))} ${escapeHtml(rule.unit)}</td>
                <td>${rule.actionValue !== null ? escapeHtml(String(rule.actionValue)) + ' ' + escapeHtml(rule.unit) : '—'}</td>
                <td>${escapeHtml(rule.referenceStandard || '—')}</td>
            </tr>`,
        )
        .join('');
    return `
        <div class="health-rules-tab">
            <p class="health-rules-note">
                ${escapeHtml(t('healthPanel.rulesNote') || 'Regras baseadas em ACGIH BEI 2024. Configuráveis por projeto.')}
            </p>
            <table class="health-rules-table">
                <thead>
                    <tr>
                        <th>${escapeHtml(t('healthPanel.biomarkerType') || 'Biomarcador')}</th>
                        <th>${escapeHtml(t('healthPanel.warningValue') || 'Aviso')}</th>
                        <th>${escapeHtml(t('healthPanel.criticalValue') || 'Crítico')}</th>
                        <th>${escapeHtml(t('healthPanel.actionValue') || 'Ação')}</th>
                        <th>${escapeHtml(t('healthPanel.referenceStandard') || 'Referência')}</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
}
// ── Helpers ───────────────────────────────────────────────────────────────────
/** @param {any} reading */
function _getReadingStatus( reading: any) {
    const rule = findApplicableRule(reading, _rules);
    if (!rule) return null;
    try {
        return evaluateReadingStatus(reading, rule);
    } catch {
        return null;
    }
}
// ── Event listeners ───────────────────────────────────────────────────────────
function _attachListeners() {
    if (!_panelEl) return;
    _panelEl.querySelector('.health-panel-close')?.addEventListener('click', closeHealthPanel);
    _panelEl.querySelectorAll('.health-tab-btn').forEach(
        /** @param {any} body */ (btn: any) => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab');
                if (!tab) return;
                _activeTab = tab;
                _panelEl
                    ?.querySelectorAll('.health-tab-btn')
                    .forEach(/** @param {any} b */ (b: any) => b.classList.remove('active'));
                btn.classList.add('active');
                _refresh();
            });
        },
    );
}
/** @param {any} body */
function _attachBodyListeners( body: any) {
    // Workers tab
    const searchInput = body.querySelector('#health-worker-search');
    searchInput?.addEventListener('input', () => {
        _workerSearch = searchInput.value;
        const list = body.querySelector('#health-workers-list');
        if (list) {
            const workers = listWorkers(_projectId);
            const filtered = _workerSearch
                ? workers.filter(
                      /** @param {any} formEl */ (w: any) =>
                          w.pseudonym.toLowerCase().includes(_workerSearch.toLowerCase()) ||
                          (w.role || '').toLowerCase().includes(_workerSearch.toLowerCase()),
                  )
                : workers;
            const emptyLabel = escapeHtml(t('healthPanel.noWorkers') || 'Nenhum trabalhador registrado');
            list.innerHTML =
                filtered.length === 0
                    ? `<div class="health-empty-state"><div class="health-empty-icon">&#9670;</div><div class="health-empty-title">${emptyLabel}</div></div>`
                    : filtered.map(_renderWorkerCard).join('');
        }
    });
    body.querySelector('#health-add-worker-btn')?.addEventListener('click', () => {
        const formEl = body.querySelector('#health-add-worker-form');
        if (formEl) {
            formEl.hidden = !formEl.hidden;
            if (!formEl.hidden) formEl.innerHTML = _renderAddWorkerForm();
            _attachWorkerFormListeners(formEl, body);
        }
    });
    // Readings tab
    body.querySelector('#health-biomarker-filter')?.addEventListener(
        'change',
        /** @param {any} _body */ (e: any) => {
            _readingsFilterBiomarker = e.target.value;
            _refresh();
        },
    );
    body.querySelector('#health-add-reading-btn')?.addEventListener('click', () => {
        const formEl = body.querySelector('#health-add-reading-form');
        if (formEl) {
            formEl.hidden = !formEl.hidden;
            _attachReadingFormListeners(formEl);
        }
    });
    // Deep-link 3D buttons
    body.querySelectorAll('.health-deep3d-btn').forEach(
        /** @param {any} btn */ (btn: any) => {
            btn.addEventListener('click', () => {
                const workerId = btn.getAttribute('data-worker-id');
                if (!workerId) return;
                log.info('Deep-link 3D for worker:', workerId);
                // Phase 3: wire to element picker (selectElementById)
                // For now: emit custom event for handlers to intercept
                document.dispatchEvent(new CustomEvent('health:deep3d', { detail: { workerId } }));
            });
        },
    );
}
/** @param {any} formEl @param {any} body */
function _attachWorkerFormListeners( formEl: any, _body: any) {
    formEl.querySelector('#health-cancel-worker')?.addEventListener('click', () => {
        formEl.hidden = true;
        formEl.innerHTML = '';
    });
    formEl.querySelector('#health-worker-form-inner')?.addEventListener(
        'submit',
        /** @param {any} formEl */ (e: any) => {
            e.preventDefault();
            const pseudonymEl = formEl.querySelector('#health-worker-pseudonym');
            const roleEl = formEl.querySelector('#health-worker-role');
            const birthYearEl = formEl.querySelector('#health-worker-birth-year');
            const consentEl = formEl.querySelector('#health-worker-consent');
            if (!pseudonymEl?.value.trim()) {
                pseudonymEl?.focus();
                return;
            }
            if (!consentEl?.checked) {
                consentEl?.focus();
                return;
            }
            try {
                const pseudonym = pseudonymEl.value.trim();
                const consentHash = generateConsentHash(pseudonym, new Date().toISOString());
                const worker = registerWorker({
                    pseudonym,
                    role: roleEl?.value || '',
                    birthYear: birthYearEl?.value ? Number(birthYearEl.value) : undefined,
                    projectId: _projectId,
                    consentHash,
                });
                // Phase 4: persist to IDB (fire-and-forget, failure doesn't block UI)
                saveWorker(worker as any).catch(
                    (e: any) => console.warn('[ecbyts:health]', 'saveWorker IDB failed:', e),
                );
                formEl.hidden = true;
                formEl.innerHTML = '';
                _refresh();
                log.info('Worker registered:', pseudonym);
            } catch (err: any) {
                log.warn('Worker registration failed:', err?.message);
            }
        },
    );
}
/** @param {any} formEl */
function _attachReadingFormListeners( formEl: any) {
    formEl.querySelector('#health-cancel-reading')?.addEventListener('click', () => {
        formEl.hidden = true;
    });
    formEl.querySelector('#health-reading-form-inner')?.addEventListener(
        'submit',
        /** @param {any} e */ (e: any) => {
            e.preventDefault();
            const workerEl = formEl.querySelector('#health-reading-worker');
            const biomarkerEl = formEl.querySelector('#health-reading-biomarker');
            const valueEl = formEl.querySelector('#health-reading-value');
            const dateEl = formEl.querySelector('#health-reading-date');
            if (!workerEl?.value || !biomarkerEl?.value || !valueEl?.value) {
                valueEl?.focus();
                return;
            }
            const rule = _rules.find(/** @param {any} r */ (r: any) => r.biomarkerType === biomarkerEl.value && r.active);
            try {
                const reading = (createBiomarkerReading({
                        workerPseudonym: workerEl.value,
                        biomarkerType: biomarkerEl.value,
                        value: Number(valueEl.value),
                        unit: rule?.unit || '',
                        sampleDate: dateEl?.value || new Date().toISOString().slice(0, 10),
                        sampleMatrix: 'urine',
                    })) as any;
                _readings.push(reading);
                // Phase 4: persist to IDB (fire-and-forget, failure doesn't block UI)
                saveReading(reading).catch(
                    /** @param {any} e */ (e: any) => console.warn('[ecbyts:health]', 'saveReading IDB failed:', e),
                );
                formEl.hidden = true;
                _refresh();
                log.info('Reading added:', reading.biomarkerType, reading.value);
            } catch (err: any) {
                log.warn('Reading creation failed:', err?.message);
            }
        },
    );
}
