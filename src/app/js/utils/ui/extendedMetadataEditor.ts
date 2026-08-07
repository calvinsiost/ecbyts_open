// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   EXTENDED METADATA EDITOR — tabbed modal for 3 metadata sections

   - Calibração (instrument, dates, accuracy, status)
   - Grupo de Dados (radar profile/slice, access tier, scope)
   - Dados Adicionais (user-defined key/value list)

   Pure helpers (extractExtendedMetadata, validateFormState) are
   exported for unit testing. Modal is built dynamically (no static
   HTML required) using design-tokens.css (.ecbt-overlay/.ecbt-dialog--xl).

   Core module loaded via dynamic import so editor stays usable even
   if the module path drifts.
   ================================================================ */

import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { attachModalA11y } from './modalA11y.js';

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const MODAL_ID = 'extended-metadata-editor-modal';

/** @type {(() => void)|null} */
let _a11yCleanup: any = null;

const ACCESS_TIERS = Object.freeze(['public', 'summary', 'protected', 'private']);
const SHARING_SCOPES = Object.freeze(['owner', 'team', 'org', 'external']);
const ADDITIONAL_TYPES = Object.freeze(['string', 'number', 'boolean', 'date']);
const STANDARDS = Object.freeze(['ISO/IEC 17025', 'ABNT NBR', 'OIML', 'Other']);

const TABS = Object.freeze(['calibration', 'dataGroup', 'additionalData']);

// ----------------------------------------------------------------
// MODULE STATE (singleton modal — one editor at a time)
// ----------------------------------------------------------------

/** @type {string|null} */
let _elementId: any = null;
/** @type {string|null} */
let _projectId = null;
/** @type {((payload: any) => void)|null} */
let _onSave: any = null;
/** @type {'calibration'|'dataGroup'|'additionalData'} */
let _activeTab = 'calibration';
/** @type {any} */
let _state: any = null;
/** @type {Array<any>} */
let _profiles: any = [];
/** @type {Array<any>} */
let _slices: any = [];

/**
 * @param {unknown} err
 * @returns {string}
 */
function errorMessage(err: any): string {
    return err instanceof Error ? err.message : String(err);
}

// ----------------------------------------------------------------
// PURE HELPERS (exported for tests)
// ----------------------------------------------------------------

/**
 * Compute ISO date string for last + interval days.
 * @param {string|null|undefined} lastDate
 * @param {number} intervalDays
 * @returns {string|null}
 */
export function computeNextDue(lastDate: any, intervalDays: any): string|null {
    if (!lastDate) return null;
    const parsed = Date.parse(lastDate);
    if (!Number.isFinite(parsed)) return null;
    const interval = Number.isFinite(intervalDays) && intervalDays > 0 ? intervalDays : 365;
    const next = new Date(parsed + interval * 24 * 3600 * 1000);
    return next.toISOString().slice(0, 10);
}

/**
 * Compute status badge from last + interval (mirror of core helper).
 * @param {{lastCalibrationDate?: string|null, intervalDays?: number, now?: number}} input
 * @returns {'calibrated'|'expired'|'uncertain'|'unknown'}
 */
export function computeStatus({
    lastCalibrationDate,
    intervalDays = 365,
    now = Date.now()
}: any = {}) {
    if (!lastCalibrationDate) return 'unknown';
    const parsed = Date.parse(lastCalibrationDate);
    if (!Number.isFinite(parsed)) return 'unknown';
    const dueMs = parsed + intervalDays * 24 * 3600 * 1000;
    const remaining = dueMs - now;
    if (remaining < 0) return 'expired';
    const uncertainWindow = Math.min(intervalDays * 24 * 3600 * 1000 * 0.1, 30 * 24 * 3600 * 1000);
    if (remaining < uncertainWindow) return 'uncertain';
    return 'calibrated';
}

/**
 * Validate a Dados Adicionais entry. Pure.
 * @param {any} entry
 * @returns {{ok: boolean, error: string|null}}
 */
export function validateAdditionalEntry(entry: any): any {
    if (!entry || typeof entry !== 'object') return { ok: false, error: 'entry_required' };
    if (!entry.key || typeof entry.key !== 'string' || !entry.key.trim()) {
        return { ok: false, error: 'key_required' };
    }
    if (!ADDITIONAL_TYPES.includes(entry.type)) return { ok: false, error: 'type_invalid' };
    if (entry.value === undefined || entry.value === null) return { ok: false, error: 'value_required' };
    if (entry.type === 'string' && typeof entry.value !== 'string') return { ok: false, error: 'value_type_mismatch' };
    if (entry.type === 'number' && (typeof entry.value !== 'number' || !Number.isFinite(entry.value))) {
        return { ok: false, error: 'value_type_mismatch' };
    }
    if (entry.type === 'boolean' && typeof entry.value !== 'boolean')
        return { ok: false, error: 'value_type_mismatch' };
    if (entry.type === 'date') {
        if (typeof entry.value !== 'string' || !Number.isFinite(Date.parse(entry.value))) {
            return { ok: false, error: 'value_type_mismatch' };
        }
    }
    return { ok: true, error: null };
}

/**
 * Coerce a raw form value to the declared type. Returns the coerced value
 * or undefined if it cannot be coerced.
 * @param {unknown} raw
 * @param {string} type
 * @returns {any}
 */
export function coerceAdditionalValue(raw: any, type: any): any {
    if (type === 'string') return String(raw ?? '');
    if (type === 'number') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : undefined;
    }
    if (type === 'boolean') {
        if (raw === 'true' || raw === true) return true;
        if (raw === 'false' || raw === false) return false;
        return undefined;
    }
    if (type === 'date') {
        if (typeof raw !== 'string' || !Number.isFinite(Date.parse(raw))) return undefined;
        return raw;
    }
    return undefined;
}

/**
 * Sort additionalData with pinned first, then by addedAt desc.
 * @param {Array<any>} list
 * @returns {Array<any>}
 */
export function sortAdditionalEntries(list: any): Array<any> {
    const safe = Array.isArray(list) ? list.slice() : [];
    safe.sort((a, b) => {
        const pa = a && a.pinned ? 1 : 0;
        const pb = b && b.pinned ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const da = a && a.addedAt ? Date.parse(a.addedAt) : 0;
        const db = b && b.addedAt ? Date.parse(b.addedAt) : 0;
        return db - da;
    });
    return safe;
}

/**
 * Pure extractor: convert in-memory form state to the 3-section payload.
 * Throws on validation error so callers can show a toast.
 * @param {any} formState
 * @returns {{calibration: any, dataGroup: any, additionalData: Array<any>}}
 */
export function extractExtendedMetadata(formState: any): {calibration: any, dataGroup: any, additionalData: Array<any>} {
    if (!formState || typeof formState !== 'object') {
        throw new Error('extractExtendedMetadata: formState required');
    }
    const cal = formState.calibration || {};
    if (!cal.instrumentId || typeof cal.instrumentId !== 'string' || !cal.instrumentId.trim()) {
        throw new Error('calibration_instrumentId_required');
    }
    const intervalDays =
        Number.isFinite(Number(cal.intervalDays)) && Number(cal.intervalDays) > 0 ? Number(cal.intervalDays) : 365;
    const lastCalibrationDate = cal.lastCalibrationDate || null;
    const calibration = {
        instrumentId: cal.instrumentId.trim(),
        instrumentModel: cal.instrumentModel || null,
        serialNumber: cal.serialNumber || null,
        lastCalibrationDate,
        nextCalibrationDue: computeNextDue(lastCalibrationDate, intervalDays),
        intervalDays,
        accuracy: Number.isFinite(Number(cal.accuracy)) ? Number(cal.accuracy) : null,
        uncertainty: Number.isFinite(Number(cal.uncertainty)) ? Number(cal.uncertainty) : null,
        certificateNumber: cal.certificateNumber || null,
        standard: cal.standard || null,
        status: computeStatus({ lastCalibrationDate, intervalDays }),
        laboratory: cal.laboratory || null,
        notes: cal.notes || null,
    };

    const dg = formState.dataGroup || {};
    const accessTier = ACCESS_TIERS.includes(dg.accessTier) ? dg.accessTier : 'private';
    const sharingScope = SHARING_SCOPES.includes(dg.sharingScope) ? dg.sharingScope : 'owner';
    const dataGroup = {
        radarProfileId: dg.radarProfileId || null,
        radarSliceId: dg.radarSliceId || null,
        accessTier,
        sharingScope,
        groupLabel: dg.groupLabel || null,
        publishedToRadar: Boolean(dg.publishedToRadar),
    };

    const rawAdd = Array.isArray(formState.additionalData) ? formState.additionalData : [];
    const additionalData = rawAdd.map(
        /**
         * @param {any} sourceObject
         * @param {number} idx
         */
        (e: any, idx: any) => {
            const check = validateAdditionalEntry(e);
            if (!check.ok) throw new Error(`additional_data_invalid[${idx}]:${check.error}`);
            return {
                id: e.id || makeLocalId(),
                key: String(e.key).trim(),
                value: e.value,
                type: e.type,
                addedAt: e.addedAt || new Date().toISOString(),
                addedBy: e.addedBy ?? null,
                pinned: Boolean(e.pinned),
            };
        },
    );

    return { calibration, dataGroup, additionalData };
}

function makeLocalId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `ad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build initial form state from a source object's metadata.
 * @param {any} sourceObject
 * @returns {any}
 */
export function buildInitialState(sourceObject: any): any {
    const meta = (sourceObject && sourceObject.metadata) || {};
    const cal = meta.calibration || {};
    const dg = meta.dataGroup || {};
    const ad = Array.isArray(meta.additionalData) ? meta.additionalData : [];
    return {
        calibration: {
            instrumentId: cal.instrumentId || '',
            instrumentModel: cal.instrumentModel || '',
            serialNumber: cal.serialNumber || '',
            lastCalibrationDate: cal.lastCalibrationDate ? String(cal.lastCalibrationDate).slice(0, 10) : '',
            intervalDays: Number.isFinite(cal.intervalDays) ? cal.intervalDays : 365,
            accuracy: cal.accuracy ?? '',
            uncertainty: cal.uncertainty ?? '',
            certificateNumber: cal.certificateNumber || '',
            standard: cal.standard || '',
            laboratory: cal.laboratory || '',
            notes: cal.notes || '',
        },
        dataGroup: {
            radarProfileId: dg.radarProfileId || '',
            radarSliceId: dg.radarSliceId || '',
            accessTier: dg.accessTier || 'private',
            sharingScope: dg.sharingScope || 'owner',
            groupLabel: dg.groupLabel || '',
            publishedToRadar: Boolean(dg.publishedToRadar),
        },
        additionalData: ad.slice(),
    };
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Open the editor for an element.
 * @param {{elementId: string, sourceObject: any, projectId?: string|null, onSave?: (payload:any)=>void}} opts
 */
export function openExtendedMetadataEditor(opts: any) {
    if (!opts || typeof opts !== 'object' || !opts.elementId) {
        showToast(t('metaEditorMissingElement') || 'elementId required', 'error');
        return;
    }
    _elementId = opts.elementId;
    _projectId = opts.projectId || null;
    _onSave = typeof opts.onSave === 'function' ? opts.onSave : null;
    _state = buildInitialState(opts.sourceObject);
    _activeTab = 'calibration';
    _profiles = [];
    _slices = [];

    const existing = document.getElementById(MODAL_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const overlay = _buildModalShell();
    document.body.appendChild(overlay);
    _wireEvents(overlay);
    _renderActiveTab();
    _a11yCleanup = attachModalA11y(overlay, closeExtendedMetadataEditor);

    // lazy load radar profiles (dynamic import so editor works if path drifts)
    if (_projectId) {
        _loadProfiles(_projectId).catch((e) => {
            console.debug('[extendedMetadataEditor] profiles load failed:', errorMessage(e));
        });
    }
}

/** Close the editor. */
export function closeExtendedMetadataEditor() {
    if (typeof _a11yCleanup === 'function') {
        _a11yCleanup();
        _a11yCleanup = null;
    }
    const el = document.getElementById(MODAL_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    _elementId = null;
    _projectId = null;
    _onSave = null;
    _state = null;
    _profiles = [];
    _slices = [];
}

// ----------------------------------------------------------------
// MODAL SHELL
// ----------------------------------------------------------------

function _buildModalShell() {
    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'ecbt-overlay active';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', `${MODAL_ID}-title`);

    const title = escapeHtml(t('metaEditorTitle') || 'Metadados Estendidos');
    const closeLbl = escapeHtml(t('common.close') || 'Fechar');
    const saveLbl = escapeHtml(t('common.save') || 'Salvar');
    const cancelLbl = escapeHtml(t('common.cancel') || 'Cancelar');
    const tabCalLbl = escapeHtml(t('metaSectionCalibration') || 'Calibração');
    const tabDgLbl = escapeHtml(t('metaSectionDataGroup') || 'Grupo de Dados');
    const tabAdLbl = escapeHtml(t('metaSectionAdditionalData') || 'Dados Adicionais');

    overlay.innerHTML =
        '<div class="ecbt-dialog ecbt-dialog--xl emd-dialog" role="document">' +
        '<div class="emd-head">' +
        `<h2 id="${MODAL_ID}-title" style="margin:0">${title}</h2>` +
        `<button type="button" class="emd-close ecbt-btn" aria-label="${closeLbl}">&times;</button>` +
        '</div>' +
        '<div class="emd-tabs" role="tablist">' +
        `<button type="button" role="tab" class="emd-tab" data-tab="calibration">${tabCalLbl}</button>` +
        `<button type="button" role="tab" class="emd-tab" data-tab="dataGroup">${tabDgLbl}</button>` +
        `<button type="button" role="tab" class="emd-tab" data-tab="additionalData">${tabAdLbl}</button>` +
        '</div>' +
        '<div class="emd-body" role="tabpanel"></div>' +
        '<div class="emd-foot">' +
        `<button type="button" class="emd-cancel ecbt-btn">${cancelLbl}</button>` +
        `<button type="button" class="emd-save ecbt-btn ecbt-btn--primary">${saveLbl}</button>` +
        '</div>' +
        '<style>' +
        '.emd-dialog { padding:18px; display:flex; flex-direction:column; gap:12px; max-height:90vh; }' +
        '.emd-head { display:flex; justify-content:space-between; align-items:center; }' +
        '.emd-tabs { display:flex; gap:4px; border-bottom:1px solid var(--border-color,#333); }' +
        '.emd-tab { padding:6px 12px; background:transparent; color:var(--text-tertiary,#aaa); border:none; border-bottom:2px solid transparent; cursor:pointer; font-size:13px; }' +
        '.emd-tab[aria-selected="true"] { color:var(--text-primary,#fff); border-bottom-color:var(--accent,#60a5fa); }' +
        '.emd-body { flex:1; overflow-y:auto; padding:8px 4px; min-height:200px; }' +
        '.emd-field { display:flex; flex-direction:column; gap:3px; font-size:12px; margin-bottom:8px; }' +
        '.emd-field span { color:var(--text-tertiary,#aaa); font-size:11px; }' +
        '.emd-field input, .emd-field select, .emd-field textarea { padding:6px 8px; border-radius:4px; border:1px solid var(--border-color,#444); background:var(--bg-primary,#121220); color:var(--text-primary,#fff); font-size:12px; }' +
        '.emd-row { display:flex; gap:10px; }' +
        '.emd-row .emd-field { flex:1; }' +
        '.emd-foot { display:flex; justify-content:flex-end; gap:8px; padding-top:8px; border-top:1px solid var(--border-color,#333); }' +
        '.emd-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; }' +
        '.emd-badge--calibrated { background:rgba(34,197,94,0.18); color:#22c55e; }' +
        '.emd-badge--uncertain { background:rgba(234,179,8,0.18); color:#eab308; }' +
        '.emd-badge--expired { background:rgba(239,68,68,0.18); color:#ef4444; }' +
        '.emd-badge--unknown { background:rgba(148,163,184,0.18); color:#94a3b8; }' +
        '.emd-info { padding:8px 10px; background:rgba(96,165,250,0.08); border-left:3px solid var(--accent,#60a5fa); font-size:11px; color:var(--text-tertiary,#aaa); margin-bottom:10px; border-radius:3px; }' +
        '.emd-radio-group { display:flex; gap:10px; flex-wrap:wrap; }' +
        '.emd-radio { display:inline-flex; align-items:center; gap:4px; font-size:12px; cursor:pointer; }' +
        '.emd-table { width:100%; border-collapse:collapse; font-size:12px; }' +
        '.emd-table th, .emd-table td { padding:5px 6px; border-bottom:1px solid rgba(255,255,255,0.06); text-align:left; vertical-align:top; }' +
        '.emd-table input, .emd-table select { width:100%; box-sizing:border-box; font-size:11px; padding:3px 5px; }' +
        '.emd-table .emd-tbtn { padding:2px 6px; font-size:10px; background:transparent; border:1px solid var(--border-color,#444); color:inherit; border-radius:3px; cursor:pointer; }' +
        '.emd-table .emd-tbtn--del { color:#ef4444; }' +
        '.emd-empty { padding:20px; text-align:center; color:var(--text-tertiary,#888); }' +
        '.emd-add-row { padding:6px 12px; background:var(--accent,#60a5fa); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px; margin-bottom:10px; }' +
        '</style>' +
        '</div>';

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeExtendedMetadataEditor();
    });
    return overlay;
}

/**
 * @param {HTMLElement} overlay
 */
function _wireEvents(overlay: any) {
    const closeBtn = overlay.querySelector('.emd-close');
    if (closeBtn) closeBtn.addEventListener('click', () => closeExtendedMetadataEditor());
    const cancelBtn = overlay.querySelector('.emd-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeExtendedMetadataEditor());
    const saveBtn = overlay.querySelector('.emd-save');
    if (saveBtn) saveBtn.addEventListener('click', () => _attemptSave());
    overlay.querySelectorAll('.emd-tab').forEach((tab: any) => {
        tab.addEventListener('click', () => {
            const which = tab.getAttribute('data-tab');
            if (TABS.includes((which as any))) {
                _activeTab = (which as any);
                _renderActiveTab();
            }
        });
    });
}

function _renderActiveTab() {
    const overlay = document.getElementById(MODAL_ID);
    if (!overlay) return;
    overlay.querySelectorAll('.emd-tab').forEach((tab) => {
        const which = tab.getAttribute('data-tab');
        tab.setAttribute('aria-selected', which === _activeTab ? 'true' : 'false');
    });
    const body = overlay.querySelector('.emd-body');
    if (!body) return;
    if (_activeTab === 'calibration') body.innerHTML = _renderCalibrationTab();
    else if (_activeTab === 'dataGroup') body.innerHTML = _renderDataGroupTab();
    else body.innerHTML = _renderAdditionalDataTab();
    _attachFieldListeners(body);
}

// ----------------------------------------------------------------
// TAB 1: CALIBRAÇÃO
// ----------------------------------------------------------------

function _renderCalibrationTab() {
    const cal = _state.calibration;
    const status = computeStatus({
        lastCalibrationDate: cal.lastCalibrationDate || null,
        intervalDays: Number(cal.intervalDays) || 365,
    });
    const statusLabel = escapeHtml(t(`metaCalibrationStatus${status[0]!.toUpperCase()}${status.slice(1)}`) || status);
    const nextDue = computeNextDue(cal.lastCalibrationDate || null, Number(cal.intervalDays) || 365) || '—';
    const stdOpts = STANDARDS.map(
        (s) => `<option value="${escapeHtml(s)}"${s === cal.standard ? ' selected' : ''}>${escapeHtml(s)}</option>`,
    ).join('');
    return (
        _field(
            'metaCalibrationInstrumentId',
            'ID do Instrumento',
            'text',
            'calibration.instrumentId',
            cal.instrumentId,
            { required: true },
        ) +
        '<div class="emd-row">' +
        _field('metaCalibrationInstrumentModel', 'Modelo', 'text', 'calibration.instrumentModel', cal.instrumentModel) +
        _field('metaCalibrationSerialNumber', 'Número de Série', 'text', 'calibration.serialNumber', cal.serialNumber) +
        '</div>' +
        '<div class="emd-row">' +
        _field(
            'metaCalibrationLastDate',
            'Última Calibração',
            'date',
            'calibration.lastCalibrationDate',
            cal.lastCalibrationDate,
        ) +
        _field(
            'metaCalibrationIntervalDays',
            'Intervalo (dias)',
            'number',
            'calibration.intervalDays',
            cal.intervalDays,
            { min: 1 },
        ) +
        '</div>' +
        `<div class="emd-field"><span>${escapeHtml(t('metaCalibrationNextDue') || 'Próxima Calibração')}</span><input type="text" value="${escapeHtml(nextDue)}" readonly></div>` +
        '<div class="emd-row">' +
        _field('metaCalibrationAccuracy', 'Acurácia', 'number', 'calibration.accuracy', cal.accuracy, { step: 'any' }) +
        _field('metaCalibrationUncertainty', 'Incerteza', 'number', 'calibration.uncertainty', cal.uncertainty, {
            step: 'any',
        }) +
        '</div>' +
        _field(
            'metaCalibrationCertificate',
            'Nº do Certificado',
            'text',
            'calibration.certificateNumber',
            cal.certificateNumber,
        ) +
        `<label class="emd-field"><span>${escapeHtml(t('metaCalibrationStandard') || 'Padrão')}</span><select data-form="calibration.standard"><option value="">—</option>${stdOpts}</select></label>` +
        `<div class="emd-field"><span>Status</span><span class="emd-badge emd-badge--${status}">${statusLabel}</span></div>` +
        _field('metaCalibrationLaboratory', 'Laboratório', 'text', 'calibration.laboratory', cal.laboratory) +
        `<label class="emd-field"><span>${escapeHtml(t('metaCalibrationNotes') || 'Observações')}</span><textarea data-form="calibration.notes" rows="3">${escapeHtml(cal.notes || '')}</textarea></label>`
    );
}

// ----------------------------------------------------------------
// TAB 2: GRUPO DE DADOS
// ----------------------------------------------------------------

function _renderDataGroupTab() {
    const dg = _state.dataGroup;
    const profileOpts = ['<option value="">—</option>']
        .concat(
            _profiles.map(
                (p: any) =>
                    `<option value="${escapeHtml(p.id)}"${p.id === dg.radarProfileId ? ' selected' : ''}>${escapeHtml(p.name || p.slug || p.id)}</option>`,
            ),
        )
        .join('');
    const sliceOpts = ['<option value="">—</option>']
        .concat(
            _slices.map(
                (s: any) =>
                    `<option value="${escapeHtml(s.id)}"${s.id === dg.radarSliceId ? ' selected' : ''}>${escapeHtml(s.name || s.slug || s.id)}</option>`,
            ),
        )
        .join('');
    const accessRadios = ACCESS_TIERS.map(
        (tier) =>
            `<label class="emd-radio"><input type="radio" name="dataGroup.accessTier" data-form="dataGroup.accessTier" value="${tier}"${tier === dg.accessTier ? ' checked' : ''}> ${escapeHtml(tier)}</label>`,
    ).join('');
    const scopeRadios = SHARING_SCOPES.map(
        (sc) =>
            `<label class="emd-radio"><input type="radio" name="dataGroup.sharingScope" data-form="dataGroup.sharingScope" value="${sc}"${sc === dg.sharingScope ? ' checked' : ''}> ${escapeHtml(sc)}</label>`,
    ).join('');
    const hint = escapeHtml(t('metaDataGroupTransparencyHint') || 'Mudanças refletem no eixo Transparência (T) do EIS');
    return (
        `<div class="emd-info">${hint}</div>` +
        `<label class="emd-field"><span>${escapeHtml(t('metaDataGroupRadarProfile') || 'Profile do Radar')}</span><select data-form="dataGroup.radarProfileId">${profileOpts}</select></label>` +
        `<label class="emd-field"><span>${escapeHtml(t('metaDataGroupRadarSlice') || 'Slice do Radar')}</span><select data-form="dataGroup.radarSliceId">${sliceOpts}</select></label>` +
        `<div class="emd-field"><span>${escapeHtml(t('metaDataGroupAccessTier') || 'Nível de Acesso')}</span><div class="emd-radio-group">${accessRadios}</div></div>` +
        `<div class="emd-field"><span>${escapeHtml(t('metaDataGroupSharingScope') || 'Escopo de Compartilhamento')}</span><div class="emd-radio-group">${scopeRadios}</div></div>` +
        _field('metaDataGroupLabel', 'Rótulo do Grupo', 'text', 'dataGroup.groupLabel', dg.groupLabel) +
        `<label class="emd-radio"><input type="checkbox" data-form="dataGroup.publishedToRadar"${dg.publishedToRadar ? ' checked' : ''}> ${escapeHtml(t('metaDataGroupPublished') || 'Publicado no Radar')}</label>`
    );
}

// ----------------------------------------------------------------
// TAB 3: DADOS ADICIONAIS
// ----------------------------------------------------------------

function _renderAdditionalDataTab() {
    const list = sortAdditionalEntries(_state.additionalData);
    const addLbl = escapeHtml(t('metaAdditionalAddEntry') || '+ Adicionar entrada');
    const empty = escapeHtml(t('metaAdditionalEmpty') || 'Sem dados adicionais.');
    const hKey = escapeHtml(t('metaAdditionalKey') || 'Chave');
    const hValue = escapeHtml(t('metaAdditionalValue') || 'Valor');
    const hType = escapeHtml(t('metaAdditionalType') || 'Tipo');
    const hPin = escapeHtml(t('metaAdditionalPin') || 'Fixar');
    const hAdded = escapeHtml(t('metaAdditionalAddedAt') || 'Adicionado em');

    let rows;
    if (list.length === 0) {
        rows = `<tr><td colspan="6" class="emd-empty">${empty}</td></tr>`;
    } else {
        const safeList = list.slice(0, 50); // lazy render cap
        rows = safeList
            .map((entry) => {
                const id = escapeHtml(entry.id);
                const typeOpts = ADDITIONAL_TYPES.map(
                    (typ) => `<option value="${typ}"${typ === entry.type ? ' selected' : ''}>${typ}</option>`,
                ).join('');
                const valueDisplay =
                    entry.type === 'boolean'
                        ? `<select data-row-value="${id}"><option value="true"${entry.value === true ? ' selected' : ''}>true</option><option value="false"${entry.value === false ? ' selected' : ''}>false</option></select>`
                        : `<input type="${entry.type === 'number' ? 'number' : entry.type === 'date' ? 'date' : 'text'}" data-row-value="${id}" value="${escapeHtml(String(entry.value ?? ''))}">`;
                return (
                    `<tr data-entry-id="${id}">` +
                    `<td><input type="checkbox" data-row-pin="${id}"${entry.pinned ? ' checked' : ''}></td>` +
                    `<td><input type="text" data-row-key="${id}" value="${escapeHtml(entry.key)}"></td>` +
                    `<td>${valueDisplay}</td>` +
                    `<td><select data-row-type="${id}">${typeOpts}</select></td>` +
                    `<td style="font-size:10px;color:var(--text-tertiary,#888)">${escapeHtml((entry.addedAt || '').slice(0, 10))}</td>` +
                    `<td><button type="button" class="emd-tbtn emd-tbtn--del" data-row-del="${id}">×</button></td>` +
                    '</tr>'
                );
            })
            .join('');
    }
    const extraNote =
        list.length > 50
            ? `<div class="emd-empty">… +${list.length - 50} ${escapeHtml(t('metaAdditionalEmpty') ? '' : 'mais')}</div>`
            : '';
    return (
        `<button type="button" class="emd-add-row" data-action="add-entry">${addLbl}</button>` +
        '<table class="emd-table">' +
        `<thead><tr><th>${hPin}</th><th>${hKey}</th><th>${hValue}</th><th>${hType}</th><th>${hAdded}</th><th></th></tr></thead>` +
        `<tbody>${rows}</tbody>` +
        '</table>' +
        extraNote
    );
}

// ----------------------------------------------------------------
// FIELD HELPER + INPUT LISTENERS
// ----------------------------------------------------------------

/**
 * @param {string} i18nKey
 * @param {string} fallbackLabel
 * @param {string} type
 * @param {string} path
 * @param {unknown} value
 * @param {{ required?: boolean, min?: number, step?: string }=} opts
 * @returns {string}
 */
function _field(i18nKey: any, fallbackLabel: any, type: any, path: any, value: any, opts?: any): string {
    const label = escapeHtml(t(i18nKey) || fallbackLabel);
    const raw = value === null || value === undefined ? '' : String(value);
    const extra = opts && opts.required ? ' required' : '';
    const min = opts && opts.min !== undefined ? ` min="${opts.min}"` : '';
    const step = opts && opts.step ? ` step="${opts.step}"` : '';
    return `<label class="emd-field"><span>${label}</span><input type="${type}" data-form="${path}" value="${escapeHtml(raw)}"${extra}${min}${step}></label>`;
}

/**
 * @param {Record<string, any>} target
 * @param {string} path
 * @param {any} value
 */
function _setNested(target: any, path: any, value: any) {
    const parts = path.split('.');
    let cursor = target;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
        cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = value;
}

/**
 * @param {Element} body
 */
function _attachFieldListeners(body: any) {
    body.querySelectorAll('[data-form]').forEach((el: any) => {
        el.addEventListener('change', () => {
            const input = (el as HTMLInputElement);
            const path = input.getAttribute('data-form');
            if (!path) return;
            let val;
            if (input.type === 'checkbox') val = !!input.checked;
            else if (input.type === 'number') {
                const n = Number(input.value);
                val = Number.isFinite(n) ? n : null;
            } else val = input.value;
            _setNested(_state, path, val);
            if (
                path.startsWith('calibration.') &&
                (path.endsWith('lastCalibrationDate') || path.endsWith('intervalDays'))
            ) {
                _renderActiveTab();
            }
        });
    });
    const addBtn = body.querySelector('[data-action="add-entry"]');
    if (addBtn) addBtn.addEventListener('click', () => _addEntryRow());
    body.querySelectorAll('[data-row-del]').forEach((btn: any) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-row-del');
            _state.additionalData = _state.additionalData.filter(
                /**
                 * @param {any} inp
                 */
                (e: any) => e.id !== id,
            );
            _renderActiveTab();
        });
    });
    body.querySelectorAll('[data-row-key], [data-row-value], [data-row-type], [data-row-pin]').forEach((inp: any) => {
        inp.addEventListener('change', () => _commitRowChange((inp as HTMLInputElement)));
    });
}

/**
 * @param {HTMLInputElement} inp
 */
function _commitRowChange(inp: any) {
    const id =
        inp.getAttribute('data-row-key') ||
        inp.getAttribute('data-row-value') ||
        inp.getAttribute('data-row-type') ||
        inp.getAttribute('data-row-pin');
    if (!id) return;
    const entry = _state.additionalData.find(
        /**
         * @param {any} projectId
         */
        (e: any) => e.id === id,
    );
    if (!entry) return;
    if (inp.hasAttribute('data-row-key')) entry.key = inp.value;
    else if (inp.hasAttribute('data-row-pin')) entry.pinned = !!inp.checked;
    else if (inp.hasAttribute('data-row-type')) {
        entry.type = inp.value;
        // re-render to refresh value control
        _renderActiveTab();
    } else if (inp.hasAttribute('data-row-value')) {
        const coerced = coerceAdditionalValue(inp.value, entry.type);
        if (coerced !== undefined) entry.value = coerced;
    }
}

function _addEntryRow() {
    const entry = {
        id: makeLocalId(),
        key: '',
        value: '',
        type: 'string',
        addedAt: new Date().toISOString(),
        addedBy: null,
        pinned: false,
    };
    _state.additionalData.push(entry);
    _renderActiveTab();
}

// ----------------------------------------------------------------
// SAVE
// ----------------------------------------------------------------

function _attemptSave() {
    let payload;
    try {
        payload = extractExtendedMetadata(_state);
    } catch (e: any) {
        showToast(`${t('metaEditorValidationFailed') || 'Validação falhou'}: ${errorMessage(e)}`, 'error');
        return;
    }
    try {
        if (typeof _onSave === 'function') {
            _onSave({ elementId: _elementId, payload });
        }
        showToast(t('metaEditorSaved') || 'Metadados salvos', 'success');
        closeExtendedMetadataEditor();
    } catch (e: any) {
        console.debug('[extendedMetadataEditor] save failed:', errorMessage(e));
        showToast(t('metaEditorSaveFailed') || 'Falha ao salvar', 'error');
    }
}

// ----------------------------------------------------------------
// LAZY LOADERS (dynamic imports)
// ----------------------------------------------------------------

/**
 * @param {string|null} projectId
 */
async function _loadProfiles(projectId: any) {
    try {
        const moduleUrl = new URL('../../core/radar/profileRegistry.js', import.meta.url).href;
        const mod = await import(moduleUrl);
        if (typeof mod.listProfiles !== 'function') return;
        const result = await mod.listProfiles(projectId);
        _profiles = Array.isArray(result) ? result.slice() : [];
        if (_activeTab === 'dataGroup') _renderActiveTab();
    } catch (e: any) {
        console.debug('[extendedMetadataEditor] profileRegistry unavailable:', errorMessage(e));
    }
}
