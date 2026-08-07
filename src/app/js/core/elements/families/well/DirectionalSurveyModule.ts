// @ts-check
// Generated from src/app/js/core/elements/families/well/DirectionalSurveyModule.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   DIRECTIONAL SURVEY MODULE — LAS/CSV import + trajectory display
   ================================================================
   P1-8 P6 — UI panel para importação de survey direcional (LAS 2.0/3.0 ou CSV).

   Fluxo:
   1. Usuário seleciona arquivo .las ou .csv (drag-drop ou picker).
   2. surveyImporter detecta formato e parseia estações {md, inc, azi}.
   3. Preview mostra até 10 linhas e contagem total.
   4. Confirmação: armazena directionalSurvey + calcula trajectory Cartesiana
      (para uso em faultIntersectionReport).
   5. meshFactory.js detecta directionalSurvey e constrói TubeGeometry colorida.

   Spec: docs/specs/features/SPEC_FAMILY_FAULT_WELLS_DIRECTIONAL.md §"Poços Direcionais"
   Ref: surveyImporter.js (P4), directional.js MCM (P2), meshFactory.js TubeGeometry (P5p2)
   ================================================================ */
import { FamilyModule } from '../_base/FamilyModule.js';
import { detectSurveyFormat, parseSurveyCSV, parseSurveyLAS } from '../../../../core/geology/surveyImporter.js';
import { minimumCurvature } from '../../../../core/wells/directional.js';
import { getElementById, updateElement } from '../../manager.js';
import { t } from '../../../../utils/i18n/translations.js';
import { showToast } from '../../../../utils/ui/toast.js';
import { escapeHtml } from '../../../../utils/helpers/html.js';
/**
 * @typedef {{ md: number, inc: number, azi?: number, az?: number }} SurveyStation
 * @typedef {{ id: string, data?: any }} WellElement
 */
export default class DirectionalSurveyModule extends FamilyModule {
    declare _container: any;
    declare _listen: any;
    declare _pendingStations: any;
    constructor() {
        super();
        /** @type {Array<SurveyStation>|null} */
        this._pendingStations = null;
    }
    override _getFamilyId() {
        return 'well-directional';
    }
    override getStyles() {
        return `
.dsm-root { padding: 10px; font-size: 13px; }
.dsm-survey-info { background: var(--surface-2,#1e293b); border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; }
.dsm-badge-active { display: inline-block; background: var(--accent-green,#22c55e); color: #fff; border-radius: 3px; padding: 1px 6px; font-size: 10px; font-weight: 600; margin-bottom: 4px; }
.dsm-empty { color: var(--text-muted,#94a3b8); padding: 6px 0 10px; }
.dsm-import-section h4 { margin: 8px 0 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--text-muted,#94a3b8); letter-spacing: 0.04em; }
.dsm-dropzone { border: 2px dashed var(--border-color,#334155); border-radius: 6px; padding: 14px 10px; text-align: center; cursor: pointer; transition: border-color 0.15s; }
.dsm-dropzone p { margin: 6px 0 0; color: var(--text-muted,#94a3b8); font-size: 11px; }
.dsm-dropzone.dsm-drag-over { border-color: var(--accent,#3b82f6); background: rgba(59,130,246,0.06); }
.dsm-format-badge { display: inline-block; margin: 6px 0; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; }
.dsm-format-csv { background: #064e3b; color: #6ee7b7; }
.dsm-format-las { background: #1e3a5f; color: #93c5fd; }
.dsm-format-unknown { background: #7f1d1d; color: #fca5a5; }
.dsm-preview-table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 6px 0; }
.dsm-preview-table th { background: var(--surface-2,#1e293b); padding: 3px 6px; text-align: right; font-weight: 600; }
.dsm-preview-table th:first-child { text-align: left; }
.dsm-preview-table td { padding: 2px 6px; border-bottom: 1px solid var(--border-color,#334155); text-align: right; }
.dsm-preview-table td:first-child { text-align: left; color: var(--text-muted,#94a3b8); }
.dsm-station-count { margin: 4px 0 8px; color: var(--text-muted,#94a3b8); font-size: 11px; }
.dsm-errors { background: rgba(239,68,68,0.1); border-left: 3px solid #ef4444; padding: 6px 10px; border-radius: 4px; margin: 6px 0; font-size: 11px; }
.dsm-actions { display: flex; gap: 6px; margin-top: 8px; }
.dsm-remove-btn { font-size: 11px; margin-top: 4px; }
`;
    }
    /**
     * @param {any} container
     * @param {WellElement} element
     * @param {any} [options]
     */
    override async mount( container: any, element: any, options: any = {}) {
        await super.mount(container, element, options);
        this._render(container, element);
    }
    /**
     * @param {WellElement} element
     */
    override update( element: any) {
        super.update(element);
        if (this._container) {
            this._pendingStations = null;
            this._render(this._container, element);
        }
    }
    override unmount() {
        this._pendingStations = null;
        super.unmount();
    }
    // ── Rendering ─────────────────────────────────────────────────────────────
    /**
     * @param {any} container
     * @param {WellElement} element
     */
    _render( container: any, element: any) {
        const hasSurvey =
            Array.isArray(element?.data?.directionalSurvey?.stations) &&
            element.data.directionalSurvey.stations.length > 0;
        container.innerHTML = `<div class="dsm-root ecbt-fm-well-directional">
            ${hasSurvey ? this._buildSurveyInfo(element) : this._buildEmptyState()}
            <div class="dsm-import-section">
                <h4>${escapeHtml(t('surveyImport.sectionTitle') || 'Importar Survey (LAS / CSV)')}</h4>
                <div class="dsm-dropzone" id="dsm-dropzone-${element.id}">
                    <input type="file" id="dsm-file-input-${element.id}" accept=".las,.csv,.txt" style="display:none">
                    <button class="btn btn-secondary btn-sm" id="dsm-pick-btn-${element.id}">
                        ${escapeHtml(t('surveyImport.pickFile') || 'Selecionar arquivo...')}
                    </button>
                    <p>${escapeHtml(t('surveyImport.dragDrop') || 'ou arraste um arquivo .las / .csv aqui')}</p>
                </div>
                <div class="dsm-format-badge" id="dsm-format-badge-${element.id}" style="display:none"></div>
                <div id="dsm-preview-${element.id}" style="display:none">
                    <table class="dsm-preview-table">
                        <thead><tr>
                            <th>#</th>
                            <th>MD (m)</th>
                            <th>Inc (°)</th>
                            <th>Azi (°)</th>
                        </tr></thead>
                        <tbody id="dsm-tbody-${element.id}"></tbody>
                    </table>
                    <p class="dsm-station-count" id="dsm-count-${element.id}"></p>
                </div>
                <div class="dsm-errors" id="dsm-errors-${element.id}" style="display:none"></div>
                <div class="dsm-actions" id="dsm-actions-${element.id}" style="display:none">
                    <button class="btn btn-primary btn-sm" id="dsm-confirm-btn-${element.id}">
                        ${escapeHtml(t('surveyImport.confirm') || 'Importar Survey')}
                    </button>
                    <button class="btn btn-secondary btn-sm" id="dsm-clear-btn-${element.id}">
                        ${escapeHtml(t('surveyImport.cancel') || 'Cancelar')}
                    </button>
                </div>
            </div>
        </div>`;
        this._bindEvents(container, element);
    }
    /**
     * @param {WellElement} element
     */
    _buildSurveyInfo( element: any) {
        const s = element.data.directionalSurvey;
        const n = s.stations.length;
        const last = s.stations[n - 1];
        const maxMd = Number.isFinite(last?.md) ? last.md.toFixed(1) : '?';
        const importedAt = s.importedAt ? new Date(s.importedAt).toLocaleDateString() : '—';
        return `<div class="dsm-survey-info">
            <span class="dsm-badge-active">${escapeHtml(t('surveyImport.imported') || 'Survey importado')}</span>
            <p>${n} ${escapeHtml(t('surveyImport.stations') || 'estações')} &bull; MD máx: ${escapeHtml(maxMd)} m &bull; ${escapeHtml(importedAt)}</p>
            <button class="btn btn-danger btn-sm dsm-remove-btn" id="dsm-remove-${element.id}">
                ${escapeHtml(t('surveyImport.remove') || 'Remover survey')}
            </button>
        </div>`;
    }
    _buildEmptyState() {
        return `<p class="dsm-empty">${escapeHtml(t('surveyImport.empty') || 'Nenhum survey importado. Importe abaixo.')}</p>`;
    }
    // ── Event Binding ─────────────────────────────────────────────────────────
    /**
     * @param {any} container
     * @param {WellElement} element
     */
    _bindEvents( container: any, element: any) {
        const id = element.id;
        // File picker button
        const pickBtn = container.querySelector(`#dsm-pick-btn-${id}`);
        const fileInput = container.querySelector(`#dsm-file-input-${id}`);
        this._listen(pickBtn, 'click', () => fileInput?.click());
        // File selected
        this._listen(fileInput, 'change', (e: any) => {
            const target = (e.target) as HTMLInputElement|null;
            const file = target?.files?.[0];
            if (file) this._handleFile(file, container, element);
        });
        // Drag-and-drop
        const dropzone = container.querySelector(`#dsm-dropzone-${id}`);
        this._listen(dropzone, 'dragover', (e: any) => {
            e.preventDefault();
            dropzone.classList.add('dsm-drag-over');
        });
        this._listen(dropzone, 'dragleave', () => dropzone.classList.remove('dsm-drag-over'));
        this._listen(dropzone, 'drop', (e: any) => {
            e.preventDefault();
            dropzone.classList.remove('dsm-drag-over');
            const dragEvent = (e) as DragEvent;
            const file = dragEvent.dataTransfer?.files?.[0];
            if (file) this._handleFile(file, container, element);
        });
        // Remove survey
        const removeBtn = container.querySelector(`#dsm-remove-${id}`);
        if (removeBtn) {
            this._listen(removeBtn, 'click', () => this._removeSurvey(element));
        }
        // Confirm / cancel (wired after file load - see _handleFile)
        const confirmBtn = container.querySelector(`#dsm-confirm-btn-${id}`);
        const clearBtn = container.querySelector(`#dsm-clear-btn-${id}`);
        this._listen(confirmBtn, 'click', () => {
            if (this._pendingStations) this._importSurvey(element, this._pendingStations);
        });
        this._listen(clearBtn, 'click', () => {
            this._pendingStations = null;
            const preview = container.querySelector(`#dsm-preview-${id}`);
            const actions = container.querySelector(`#dsm-actions-${id}`);
            if (preview) preview.style.display = 'none';
            if (actions) actions.style.display = 'none';
        });
    }
    // ── File Processing ────────────────────────────────────────────────────────
    /**
     * @param {File} file
     * @param {any} container
     * @param {WellElement} element
     */
    async _handleFile( file: any, container: any, element: any) {
        const id = element.id;
        const text = await file.text();
        const format = detectSurveyFormat(text);
        const badge = container.querySelector(`#dsm-format-badge-${id}`);
        badge.style.display = '';
        badge.className = `dsm-format-badge dsm-format-${format}`;
        badge.textContent =
            format === 'unknown'
                ? t('surveyImport.formatUnknown') || 'Formato não reconhecido'
                : `${t('surveyImport.formatDetected') || 'Formato detectado'}: ${format.toUpperCase()}`;
        const errEl = container.querySelector(`#dsm-errors-${id}`);
        errEl.style.display = 'none';
        errEl.textContent = '';
        if (format === 'unknown') {
            errEl.textContent =
                t('surveyImport.errorUnknownFormat') ||
                'Arquivo não reconhecido. Use LAS 2.0/3.0 ou CSV com colunas MD, Inc, Azi.';
            errEl.style.display = '';
            this._pendingStations = null;
            return;
        }
        const result = format === 'las' ? parseSurveyLAS(text) : parseSurveyCSV(text);
        if (!result.ok || result.stations.length === 0) {
            const msgs = result.errors.length ? result.errors : ['no_stations_found'];
            errEl.textContent = `${t('surveyImport.errorParse') || 'Erro'}: ${msgs.join('; ')}`;
            errEl.style.display = '';
            this._pendingStations = null;
            return;
        }
        this._pendingStations = result.stations;
        this._renderPreview(container, element, result.stations);
    }
    /**
     * @param {any} container
     * @param {WellElement} element
     * @param {Array<SurveyStation>} stations
     */
    _renderPreview( container: any, element: any, stations: any) {
        const id = element.id;
        const tbody = container.querySelector(`#dsm-tbody-${id}`);
        const countEl = container.querySelector(`#dsm-count-${id}`);
        const preview = container.querySelector(`#dsm-preview-${id}`);
        const actions = container.querySelector(`#dsm-actions-${id}`);
        const visibleStations = stations.slice(0, 10);
        tbody.innerHTML = visibleStations
            .map((s: any, i: any) =>
                    `<tr><td>${i + 1}</td><td>${Number(s.md).toFixed(1)}</td><td>${Number(s.inc).toFixed(2)}</td><td>${Number(s.azi).toFixed(2)}</td></tr>`,
            )
            .join('');
        if (stations.length > 10) {
            tbody.innerHTML += `<tr><td colspan="4" style="text-align:center;font-style:italic;color:var(--text-muted,#94a3b8)">... ${stations.length - 10} ${t('surveyImport.moreStations') || 'estações adicionais'}</td></tr>`;
        }
        const labelStations = t('surveyImport.stationCount') || 'estações detectadas';
        countEl.textContent = `${stations.length} ${labelStations}`;
        preview.style.display = '';
        actions.style.display = '';
    }
    // ── Import ─────────────────────────────────────────────────────────────────
    /**
     * @param {WellElement} element
     * @param {Array<SurveyStation>} stations
     */
    _importSurvey( element: any, stations: any) {
        try {
            // Normalize azi → az for minimumCurvature
            const survey = stations.map((s: any) => ({
                md: s.md,
                inc: s.inc,
                az: s.azi ?? s.az ?? 0,
            }));
            const traj = /** @type {{md: number[], tvd: number[], north: number[], east: number[]}} */ (
                minimumCurvature(survey)
            );
            // Build Cartesian trajectory for faultIntersectionReport
            const trajectory = traj.md.map((md: any, i: any) => ({
                md,
                tvd: traj.tvd[i],
                northing: traj.north[i],
                easting: traj.east[i],
            }));
            const el = getElementById(element.id);
            updateElement(element.id, {
                data: {
                    ...(el?.data || element.data),
                    directionalSurvey: { stations, importedAt: Date.now() },
                    trajectory,
                },
            });
            const msg = `${t('surveyImport.success') || 'Survey importado'} — ${stations.length} ${t('surveyImport.stations') || 'estações'}`;
            showToast(msg, 'success');
            // Trigger mesh rebuild via custom event
            window.dispatchEvent(new CustomEvent('wellSurveyImported', { detail: { elementId: element.id } }));
            // Refresh module view
            const updated = getElementById(element.id);
            if (updated) this.update(updated);
        } catch (err: any) {
            console.warn('[DirectionalSurveyModule] Falha ao importar survey:', err);
            const message = err instanceof Error ? err.message : String(err);
            showToast(`${t('surveyImport.errorImport') || 'Erro ao importar'}: ${message}`, 'error');
        }
    }
    /**
     * @param {WellElement} element
     */
    _removeSurvey( element: any) {
        const el = getElementById(element.id);
        const newData = { ...(el?.data || element.data) };
        delete newData.directionalSurvey;
        delete newData.trajectory;
        updateElement(element.id, { data: newData });
        showToast(t('surveyImport.removed') || 'Survey removido', 'info');
        const updated = getElementById(element.id);
        if (updated) this.update(updated);
    }
}
