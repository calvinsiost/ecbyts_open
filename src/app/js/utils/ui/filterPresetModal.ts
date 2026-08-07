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
   FILTER PRESET MODAL — UI para criar e editar filter presets
   Modal popup para gerenciar filtros reutilizaveis em relatorios

   Usa o padrao dimension/operator/value do Calculator Engine.
   Dimensoes: family, element, parameter, campaign
   Operadores: is, is_not, in, not_in
   ================================================================ */
import { t } from '../i18n/translations.js';
import { showToast } from './toast.js';
import { getAllPresets, getPresetById, addPreset, updatePreset, removePreset } from '../report/filterPresets.js';
import { CONFIG } from '../../config.js';
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const DIMENSIONS = [
    { id: 'family', label: () => t('family') || 'Family' },
    { id: 'element', label: () => t('element') || 'Element' },
    { id: 'parameter', label: () => t('parameter') || 'Parameter' },
    { id: 'campaign', label: () => t('campaign') || 'Campaign' },
];
const OPERATORS = [
    { id: 'is', label: '=' },
    { id: 'is_not', label: '!=' },
    { id: 'in', label: 'IN' },
    { id: 'not_in', label: 'NOT IN' },
];
const PRESET_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4', '#795548', '#607D8B'];
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let overlayEl: any = null;
let editingId: any = null;
let _filterIdCounter = 0;
// ----------------------------------------------------------------
// OPEN / CLOSE
// ----------------------------------------------------------------
/**
 * Open filter preset management modal.
 * Mostra lista de presets existentes com opcao de criar/editar.
 */
export function openFilterPresetModal() {
    _close();
    _buildModal();
}
/**
 * Open modal in edit mode for a specific preset.
 * @param {string} presetId
 */
export function editFilterPreset(presetId: any) {
    _close();
    editingId = presetId;
    _buildEditModal(getPresetById(presetId));
}
/** @private */
function _close() {
    if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
    }
    editingId = null;
}
// ----------------------------------------------------------------
// LIST MODAL - Mostra todos os presets
// ----------------------------------------------------------------
/** @private */
function _buildModal() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'report-export-overlay';
    overlayEl.onclick = (e: any) => {
        if (e.target === overlayEl) _close();
    };
    const dialog = document.createElement('div');
    dialog.className = 'report-export-dialog';
    dialog.style.width = '480px';
    // Header
    const header = document.createElement('div');
    header.className = 'report-export-header';
    header.textContent = t('filterPresetNewBtn') || 'Filter Presets';
    dialog.appendChild(header);
    // List
    const list = document.createElement('div');
    list.style.cssText =
        'display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto;margin-bottom:12px;';
    const presets = getAllPresets();
    if (presets.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;color:var(--text-secondary,#888);padding:20px;font-size:13px;';
        empty.textContent = t('filterNone') || 'No filter presets yet';
        list.appendChild(empty);
    } else {
        presets.forEach((preset: any) => {
            list.appendChild(_buildPresetRow(preset));
        });
    }
    dialog.appendChild(list);
    // Actions
    const actions = document.createElement('div');
    actions.className = 'report-export-actions';
    actions.style.justifyContent = 'space-between';
    const addBtn = document.createElement('button');
    addBtn.className = 'report-export-btn report-export-btn-export';
    addBtn.textContent = '+ ' + (t('filterPresetNewBtn') || 'New Filter');
    addBtn.onclick = () => {
        _close();
        _buildEditModal(null);
    };
    const closeBtn = document.createElement('button');
    closeBtn.className = 'report-export-btn report-export-btn-cancel';
    closeBtn.textContent = t('close') || 'Close';
    closeBtn.onclick = _close;
    actions.appendChild(addBtn);
    actions.appendChild(closeBtn);
    dialog.appendChild(actions);
    overlayEl.appendChild(dialog);
    document.body.appendChild(overlayEl);
}
/** @private Build a preset row in the list */
function _buildPresetRow(preset: any) {
    const row = document.createElement('div');
    row.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;border:1px solid var(--border-color,#333);cursor:pointer;transition:background 0.1s;';
    row.onmouseenter = () => {
        row.style.background = 'var(--bg-secondary,#f5f5f5)';
    };
    row.onmouseleave = () => {
        row.style.background = '';
    };
    // Color dot
    const dot = document.createElement('div');
    dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${preset.color};flex-shrink:0;`;
    row.appendChild(dot);
    // Name + filter count
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';
    const name = document.createElement('div');
    name.style.cssText =
        'font-size:13px;font-weight:600;color:var(--text-primary,#e0e0e0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    name.textContent = preset.name;
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:11px;color:var(--text-secondary,#888);';
    meta.textContent = `${preset.filters.length} ${preset.filters.length === 1 ? 'filter' : 'filters'}`;
    if (preset.description) meta.textContent += ` — ${preset.description}`;
    info.appendChild(name);
    info.appendChild(meta);
    row.appendChild(info);
    // Edit btn
    const editBtn = document.createElement('button');
    editBtn.style.cssText =
        'background:transparent;border:none;color:var(--text-secondary,#888);cursor:pointer;font-size:12px;padding:4px 8px;border-radius:4px;';
    editBtn.textContent = 'Edit';
    editBtn.onclick = (e) => {
        e.stopPropagation();
        _close();
        editingId = preset.id;
        _buildEditModal(preset);
    };
    row.appendChild(editBtn);
    // Delete btn
    const delBtn = document.createElement('button');
    delBtn.style.cssText =
        'background:transparent;border:none;color:#ef5350;cursor:pointer;font-size:12px;padding:4px 8px;border-radius:4px;';
    delBtn.textContent = '&#10005;';
    delBtn.innerHTML = '&#10005;';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        removePreset(preset.id);
        showToast(t('filterPresetRemove') || 'Filter preset deleted', 'success');
        _close();
        _buildModal();
    };
    row.appendChild(delBtn);
    return row;
}
// ----------------------------------------------------------------
// EDIT MODAL - Criar ou editar um preset
// ----------------------------------------------------------------
/** @private */
function _buildEditModal(preset: any) {
    overlayEl = document.createElement('div');
    overlayEl.className = 'report-export-overlay';
    overlayEl.onclick = (e: any) => {
        if (e.target === overlayEl) _close();
    };
    const dialog = document.createElement('div');
    dialog.className = 'report-export-dialog';
    dialog.style.width = '520px';
    // Header
    const header = document.createElement('div');
    header.className = 'report-export-header';
    header.textContent = preset
        ? t('filterPresetEdit') || 'Edit Filter Preset'
        : t('filterPresetAdd') || 'New Filter Preset';
    dialog.appendChild(header);
    // Name input
    const nameGroup = document.createElement('div');
    nameGroup.style.cssText = 'margin-bottom:12px;';
    const nameLabel = document.createElement('label');
    nameLabel.style.cssText =
        'display:block;font-size:11px;font-weight:600;color:var(--text-secondary,#888);margin-bottom:4px;';
    nameLabel.textContent = t('filterPresetName') || 'Preset name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'filter-preset-name';
    nameInput.value = preset?.name || '';
    nameInput.placeholder = 'Ex: Aquifero Norte, Campanha 2025...';
    nameInput.style.cssText =
        'width:100%;padding:6px 10px;font-size:13px;border:1px solid var(--border-color,#333);border-radius:6px;background:var(--bg-primary,#1a1a2e);color:var(--text-primary,#e0e0e0);box-sizing:border-box;outline:none;';
    nameLabel.htmlFor = 'filter-preset-name';
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    dialog.appendChild(nameGroup);
    // Description
    const descGroup = document.createElement('div');
    descGroup.style.cssText = 'margin-bottom:12px;';
    const descLabel = document.createElement('label');
    descLabel.style.cssText =
        'display:block;font-size:11px;font-weight:600;color:var(--text-secondary,#888);margin-bottom:4px;';
    descLabel.textContent = t('description') || 'Description';
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.id = 'filter-preset-description';
    descInput.value = preset?.description || '';
    descInput.placeholder = 'Optional';
    descInput.style.cssText =
        'width:100%;padding:6px 10px;font-size:13px;border:1px solid var(--border-color,#333);border-radius:6px;background:var(--bg-primary,#1a1a2e);color:var(--text-primary,#e0e0e0);box-sizing:border-box;outline:none;';
    descLabel.htmlFor = 'filter-preset-description';
    descGroup.appendChild(descLabel);
    descGroup.appendChild(descInput);
    dialog.appendChild(descGroup);
    // Color picker
    const colorGroup = document.createElement('div');
    colorGroup.style.cssText = 'margin-bottom:16px;display:flex;gap:6px;align-items:center;';
    PRESET_COLORS.forEach((c: any) => {
        const swatch = document.createElement('button');
        swatch.style.cssText = `width:20px;height:20px;border-radius:50%;border:2px solid ${c === (preset?.color || '#4CAF50') ? '#fff' : 'transparent'};background:${c};cursor:pointer;padding:0;transition:border-color 0.15s;`;
        swatch.dataset.color = c;
        swatch.onclick = () => {
            colorGroup.querySelectorAll('button').forEach((b: any) => (b.style.borderColor = 'transparent'));
            swatch.style.borderColor = '#fff';
        };
        colorGroup.appendChild(swatch);
    });
    dialog.appendChild(colorGroup);
    // Filters section
    const filterLabel = document.createElement('div');
    filterLabel.className = 'report-export-group-label';
    filterLabel.textContent = 'Filters';
    filterLabel.style.marginBottom = '8px';
    dialog.appendChild(filterLabel);
    // Filter list container
    const filterList = document.createElement('div');
    filterList.id = 'fp-filter-list';
    filterList.style.cssText =
        'display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;margin-bottom:12px;';
    // Populate existing filters
    const filters = preset ? [...preset.filters] : [];
    filters.forEach((f: any, i: any) => filterList.appendChild(_buildFilterRow(f, i, filterList, filters)));
    dialog.appendChild(filterList);
    // Add filter button
    const addFilterBtn = document.createElement('button');
    addFilterBtn.style.cssText =
        'background:transparent;border:1px dashed var(--border-color,#555);border-radius:6px;color:var(--text-secondary,#888);font-size:12px;padding:6px;cursor:pointer;width:100%;margin-bottom:16px;';
    addFilterBtn.textContent = '+ Add filter';
    addFilterBtn.onclick = () => {
        const newFilter = { dimension: 'family', operator: 'is', value: '' };
        filters.push(newFilter);
        filterList.appendChild(_buildFilterRow(newFilter, filters.length - 1, filterList, filters));
    };
    dialog.appendChild(addFilterBtn);
    // Actions
    const actions = document.createElement('div');
    actions.className = 'report-export-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'report-export-btn report-export-btn-cancel';
    cancelBtn.textContent = t('cancel') || 'Cancel';
    cancelBtn.onclick = () => {
        _close();
        _buildModal();
    };
    const saveBtn = document.createElement('button');
    saveBtn.className = 'report-export-btn report-export-btn-export';
    saveBtn.textContent = t('save') || 'Save';
    saveBtn.onclick = () => {
        const name = nameInput.value.trim();
        if (!name) {
            showToast('Name is required', 'warning');
            nameInput.focus();
            return;
        }
        const selectedColor =
            colorGroup.querySelector('button[style*="border-color: rgb(255, 255, 255)"]') ||
            colorGroup.querySelector('button[style*="border-color: white"]') ||
            colorGroup.querySelector(`button[style*="border-color: #fff"]`);
        const color = ((selectedColor as any)?.dataset)?.color || '#4CAF50';
        // Collect filters from the DOM
        const validFilters = filters.filter((f: any) => f.value && f.value.length > 0);
        const data = {
            name,
            description: descInput.value.trim(),
            color,
            filters: validFilters,
        };
        if (editingId) {
            updatePreset(editingId, data);
            showToast(t('filterPresetEdit') || 'Filter preset updated', 'success');
        } else {
            const result = addPreset(data);
            if (!result) {
                showToast('Max presets reached (30)', 'warning');
                return;
            }
            showToast(t('filterPresetAdd') || 'Filter preset created', 'success');
        }
        _close();
        _buildModal();
    };
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    dialog.appendChild(actions);
    overlayEl.appendChild(dialog);
    document.body.appendChild(overlayEl);
    nameInput.focus();
}
// ----------------------------------------------------------------
// FILTER ROW - Uma linha dimension + operator + value
// ----------------------------------------------------------------
/** @private */
function _buildFilterRow(filter: any, index: any, listEl: any, filtersArray: any) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;';
    // Dimension select
    const dimSel = document.createElement('select');
    dimSel.id = `filter-dim-${_filterIdCounter++}`;
    dimSel.setAttribute('aria-label', 'Filter dimension');
    dimSel.style.cssText =
        'padding:4px 8px;font-size:12px;border:1px solid var(--border-color,#333);border-radius:4px;background:var(--bg-primary,#1a1a2e);color:var(--text-primary,#e0e0e0);flex:1;';
    DIMENSIONS.forEach((d: any) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.label();
        if (d.id === filter.dimension) opt.selected = true;
        dimSel.appendChild(opt);
    });
    // Operator select
    const opSel = document.createElement('select');
    opSel.id = `filter-op-${_filterIdCounter++}`;
    opSel.setAttribute('aria-label', 'Filter operator');
    opSel.style.cssText =
        'padding:4px 6px;font-size:12px;border:1px solid var(--border-color,#333);border-radius:4px;background:var(--bg-primary,#1a1a2e);color:var(--text-primary,#e0e0e0);width:70px;';
    OPERATORS.forEach((o: any) => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.label;
        if (o.id === filter.operator) opt.selected = true;
        opSel.appendChild(opt);
    });
    // Value select (populated based on dimension)
    const valSel = document.createElement('select');
    valSel.id = `filter-val-${_filterIdCounter++}`;
    valSel.setAttribute('aria-label', 'Filter value');
    valSel.style.cssText =
        'padding:4px 8px;font-size:12px;border:1px solid var(--border-color,#333);border-radius:4px;background:var(--bg-primary,#1a1a2e);color:var(--text-primary,#e0e0e0);flex:2;';
    valSel.multiple = false;
    /**
     * @param {any} dimension
     */
    const populateValues = (dimension: any) => {
        valSel.innerHTML = '';
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = `-- ${t('filterValue') || 'Select'} --`;
        valSel.appendChild(emptyOpt);
        const options = _getValuesForDimension(dimension);
        options.forEach((o: any) => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = o.label;
            if (o.id === filter.value || (Array.isArray(filter.value) && filter.value.includes(o.id))) {
                opt.selected = true;
            }
            valSel.appendChild(opt);
        });
    };
    populateValues(filter.dimension);
    // Update filter on change
    dimSel.onchange = () => {
        filter.dimension = dimSel.value;
        filter.value = '';
        populateValues(dimSel.value);
    };
    opSel.onchange = () => {
        filter.operator = opSel.value;
    };
    valSel.onchange = () => {
        filter.value = valSel.value;
    };
    // Delete row
    const delBtn = document.createElement('button');
    delBtn.style.cssText =
        'background:transparent;border:none;color:#ef5350;cursor:pointer;font-size:14px;padding:2px 4px;flex-shrink:0;';
    delBtn.innerHTML = '&#10005;';
    delBtn.onclick = () => {
        filtersArray.splice(index, 1);
        row.remove();
    };
    row.appendChild(dimSel);
    row.appendChild(opSel);
    row.appendChild(valSel);
    row.appendChild(delBtn);
    return row;
}
// ----------------------------------------------------------------
// VALUE OPTIONS - Retorna opcoes para cada dimensao
// ----------------------------------------------------------------
/** @private */
function _getValuesForDimension(dimension: any) {
    switch (dimension) {
        case 'family': {
            const families = (CONFIG as any).DEFAULT_FAMILIES || [];
            return families.map((f: any) => ({
                id: f.id,
                label: f.label || f.id,
            }));
        }
        case 'element': {
            const els = window.getAllElements?.() || [];
            return els.map((el: any) => ({
                id: el.id,
                label: el.name || el.id,
            }));
        }
        case 'parameter': {
            const params = CONFIG.PARAMETERS || [];
            return params.map((p: any) => ({
                id: p.id,
                label: p.label || p.id,
            }));
        }
        case 'campaign': {
            const campaigns = window.getAllCampaigns?.() || [];
            return campaigns.map((c: any) => ({
                id: c.id,
                label: c.name || c.id,
            }));
        }
        default:
            return [];
    }
}
