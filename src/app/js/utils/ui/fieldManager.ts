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
   GERENCIADOR DE CAMPOS E UNIDADES
   ================================================================

   Modal para gerenciar parâmetros e unidades customizados.
   Permite criar, editar e excluir campos.

   ================================================================ */
import { t } from '../i18n/translations.js';
import { CONFIG } from '../../config.js';
import { showToast } from './toast.js';
import { getParamDisplayName } from '../../core/sao/paramNames.js';
import { ensureSAO } from '../../core/sao/index.js';
import { hydrateIcons } from './icons.js';
import { escapeHtml } from '../helpers/html.js';
import { asyncConfirm } from './asyncDialogs.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import {
    parametersToCsv,
    unitsToCsv,
    buildCsvFilename,
    csvWithBom,
} from './_fieldManagerCsvPure.js';
// Armazena campos customizados do usuário (persistidos via localStorage)
let userParameters: any = [];
let userUnits: any = [];
const STORAGE_KEY_PARAMS = 'ecbyts_custom_parameters';
const STORAGE_KEY_UNITS = 'ecbyts_custom_units';
// ----------------------------------------------------------------
// INICIALIZAÇÃO
// ----------------------------------------------------------------
/**
 * Carrega dados customizados do localStorage.
 */
export function initFieldManager() {
    try {
        const savedParams = localStorage.getItem(STORAGE_KEY_PARAMS) || '';
        if (savedParams) {
            userParameters = JSON.parse(savedParams);
            // Adiciona ao CONFIG
            userParameters.forEach((p: any) => {
                if (!CONFIG.PARAMETERS.find((cp: any) => cp.id === p.id)) {
                    CONFIG.PARAMETERS.push(p);
                }
            });
        }
        const savedUnits = localStorage.getItem(STORAGE_KEY_UNITS) || '';
        if (savedUnits) {
            userUnits = JSON.parse(savedUnits);
            // Adiciona ao CONFIG
            userUnits.forEach((u: any) => {
                if (!CONFIG.UNITS.find((cu: any) => cu.id === u.id)) {
                    CONFIG.UNITS.push(u);
                }
            });
        }
    } catch (e: any) {
        console.warn('Erro ao carregar campos customizados:', e);
    }
}
/**
 * Salva dados customizados no localStorage.
 */
function saveCustomData() {
    safeSetItem(STORAGE_KEY_PARAMS, JSON.stringify(userParameters));
    safeSetItem(STORAGE_KEY_UNITS, JSON.stringify(userUnits));
}
// ----------------------------------------------------------------
// MODAL DE GERENCIAMENTO
// ----------------------------------------------------------------
/**
 * Abre o modal de gerenciamento de campos.
 */
export async function openFieldManagerModal() {
    // LOADING-PERF GAP-2: SAO é lazy. Antes, os parâmetros das matrizes SAO eram
    // empurrados em CONFIG.PARAMETERS no boot (eager). Agora garantimos o merge
    // ANTES de listar, senão o Field Manager apareceria sem eles. Idempotente.
    await ensureSAO().catch((e) => console.debug('[fieldManager] ensureSAO best-effort:', e?.message || e));
    let modal = document.getElementById('field-manager-modal');
    if (!modal) {
        modal = createFieldManagerModal();
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    renderFieldManagerContent('parameters');
}
/**
 * Fecha o modal de gerenciamento.
 */
export function closeFieldManagerModal() {
    const modal = document.getElementById('field-manager-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}
/**
 * Cria a estrutura do modal.
 */
function createFieldManagerModal() {
    // B2 migração 2026-05-29: .modal-overlay → .ecbt-overlay + .ecbt-dialog--lg canônicos.
    // 3 XSS inline removidos: closeFieldManagerModal + 2× switchFieldTab → event delegation.
    const modal = document.createElement('div');
    modal.id = 'field-manager-modal';
    modal.className = 'ecbt-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--lg field-manager-modal">
            <div class="ecbt-dialog-header">
                <h2 class="ecbt-dialog-title">${t('manageFields')}</h2>
                <button class="ecbt-dialog-close" data-fm-close aria-label="Close"><span data-icon="x" data-icon-size="14px"></span></button>
            </div>
            <div class="field-manager-tabs">
                <button class="field-tab active" data-tab="parameters" data-fm-tab="parameters">
                    ${t('parameters')}
                </button>
                <button class="field-tab" data-tab="units" data-fm-tab="units">
                    ${t('units')}
                </button>
            </div>
            <div class="ecbt-dialog-body field-manager-body" id="field-manager-content">
                <!-- Conteúdo dinâmico -->
            </div>
        </div>
    `;
    hydrateIcons(modal);
    // Event delegation cobre close X + tabs.
    modal.addEventListener('click', (ev: any) => {
        const target = ev.target?.closest?.('[data-fm-close],[data-fm-tab]');
        if (!target) return;
        const w = window as any;
        if (target.hasAttribute('data-fm-close')) w.closeFieldManagerModal?.();
        else if (target.hasAttribute('data-fm-tab')) w.switchFieldTab?.(target.getAttribute('data-fm-tab'));
    });
    // Fecha ao clicar fora
    modal.addEventListener('click', (e: any) => {
        if (e.target === modal) {
            closeFieldManagerModal();
        }
    });
    return modal;
}
/**
 * Alterna entre abas do modal.
 */
/** @param {string} tabName */
export function switchFieldTab( tabName: any) {
    const tabs = document.querySelectorAll('.field-tab');
    tabs.forEach((tab: any) => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    renderFieldManagerContent(tabName);
}
/**
 * Renderiza o conteúdo do modal baseado na aba.
 * @param {string} tabName
 */
function renderFieldManagerContent( tabName: any) {
    const container = document.getElementById('field-manager-content');
    if (!container) return;
    if (tabName === 'parameters') {
        renderParametersTab(container);
    } else {
        renderUnitsTab(container);
    }
}
// ----------------------------------------------------------------
// ABA DE PARÂMETROS
// ----------------------------------------------------------------
/** @param {any} container */
function renderParametersTab( container: any) {
    const categories: Record<string, string> = {
        chemical: t('categoryChemical'),
        physical: t('categoryPhysical'),
        contaminant: t('categoryContaminant'),
        hydrogeology: t('categoryHydrogeology'),
        emission: t('categoryEmission'),
        air_quality: t('categoryAirQuality'),
        waste: t('categoryWaste'),
        effluent: t('categoryEffluent'),
        safety: t('categorySafety'),
        biodiversity: t('categoryBiodiversity'),
        custom: t('categoryCustom'),
    };
    // Agrupa por categoria
    const grouped: Record<string, any[]> = {};
    CONFIG.PARAMETERS.forEach((p: any) => {
        const cat = p.category || 'custom';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });
    container.innerHTML = `
        <div class="field-manager-actions">
            <button class="btn btn-primary" data-cc-action="cc-c4c2b6be">
                + ${t('addParameter')}
            </button>
            <button class="btn btn-secondary" data-cc-action="cc-77756636" title="${t('exportCsvTooltip') || 'Export to CSV'}">
                <span data-icon="download"></span> ${t('exportCsv') || 'Export CSV'}
            </button>
        </div>
        <div class="field-list" id="parameters-list">
            ${Object.entries(grouped)
                .map(
                    ([cat, params]) => `
                <div class="field-category">
                    <div class="field-category-header">${categories[cat] || cat}</div>
                    ${params.map((p: any) => renderParameterItem(p)).join('')}
                </div>
            `,
                )
                .join('')}
        </div>
        <div id="parameter-form-container"></div>
    `;
}
/** @param {any} param */
function renderParameterItem( param: any) {
    const unit = CONFIG.UNITS.find((u: any) => u.id === param.defaultUnitId);
    const isCustom = param.type === 'custom';
    const isUserCustom = userParameters.find((p: any) => p.id === param.id);
    return `
        <div class="field-item ${isCustom ? 'field-item-custom' : ''}">
            <div class="field-item-info">
                <span class="field-item-name">${escapeHtml(getParamDisplayName(param))}</span>
                <span class="field-item-meta">
                    ${unit ? unit.symbol : '-'}
                    ${isCustom ? `<span class="badge badge-custom">${t('custom')}</span>` : `<span class="badge badge-si">SI</span>`}
                </span>
            </div>
            <div class="field-item-actions">
                ${
                    isUserCustom
                        ? `
                    <button class="btn-icon" data-cc-call-click="editParameter|s:${encodeURIComponent(`${param.id}`)}" title="${t('edit')}"><span data-icon="edit"></span></button>
                    <button class="btn-icon btn-danger" data-cc-call-click="deleteParameter|s:${encodeURIComponent(`${param.id}`)}" title="${t('delete')}"><span data-icon="trash"></span></button>
                `
                        : ''
                }
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// ABA DE UNIDADES
// ----------------------------------------------------------------
/** @param {any} container */
function renderUnitsTab( container: any) {
    const dimensions: Record<string, any[]> = {};
    CONFIG.UNITS.forEach((u: any) => {
        const dim = u.dimension || 'other';
        if (!dimensions[dim]) dimensions[dim] = [];
        dimensions[dim].push(u);
    });
    const dimensionNames: Record<string, string> = {
        concentration: t('dimConcentration'),
        mass_concentration: t('dimMassConcentration'),
        ratio_ppm: t('dimRatioPpm'),
        length: t('dimLength'),
        temperature: t('dimTemperature'),
        ratio: t('dimRatio'),
        pH: 'pH',
        conductivity: t('dimConductivity'),
        potential: t('dimPotential'),
        flow: t('dimFlow'),
        none: t('dimNone'),
        other: t('dimOther'),
        mass: t('dimMass'),
        volume: t('dimVolume'),
        air_concentration: t('dimAirConcentration'),
        air_concentration_norm: t('dimAirConcentrationNorm'),
        emission: t('dimEmission'),
        intensity_emission: t('dimIntensityEmission'),
        intensity_water: t('dimIntensityWater'),
        area: t('dimArea'),
        rate_hs: t('dimRateHS'),
        severity: t('dimSeverity'),
        energy: t('dimEnergy'),
        noise: t('dimNoise'),
        count: t('dimCount'),
        score: t('dimScore'),
    };
    container.innerHTML = `
        <div class="field-manager-actions">
            <button class="btn btn-primary" data-cc-action="cc-054a334f">
                + ${t('addUnit')}
            </button>
            <button class="btn btn-secondary" data-cc-action="cc-2cae310d" title="${t('exportCsvTooltip') || 'Export to CSV'}">
                <span data-icon="download"></span> ${t('exportCsv') || 'Export CSV'}
            </button>
        </div>
        <div class="field-list" id="units-list">
            ${Object.entries(dimensions)
                .map(
                    ([dim, units]) => `
                <div class="field-category">
                    <div class="field-category-header">${dimensionNames[dim] || dim}</div>
                    ${units.map((u: any) => renderUnitItem(u)).join('')}
                </div>
            `,
                )
                .join('')}
        </div>
        <div id="unit-form-container"></div>
    `;
}
/** @param {any} unit */
function renderUnitItem( unit: any) {
    const isCustom = unit.type === 'custom';
    const isUserCustom = userUnits.find((u: any) => u.id === unit.id);
    const isBase = unit.isBase;
    return `
        <div class="field-item ${isCustom ? 'field-item-custom' : ''}">
            <div class="field-item-info">
                <span class="field-item-symbol">${escapeHtml(unit.symbol)}</span>
                <span class="field-item-name">${escapeHtml(unit.name)}</span>
                <span class="field-item-meta">
                    ${isBase ? `<span class="badge badge-base">${t('baseUnit')}</span>` : ''}
                    ${isCustom ? `<span class="badge badge-custom">${t('custom')}</span>` : `<span class="badge badge-si">SI</span>`}
                </span>
            </div>
            <div class="field-item-actions">
                ${
                    isUserCustom
                        ? `
                    <button class="btn-icon" data-cc-call-click="editUnit|s:${encodeURIComponent(`${unit.id}`)}" title="${t('edit')}"><span data-icon="edit"></span></button>
                    <button class="btn-icon btn-danger" data-cc-call-click="deleteUnit|s:${encodeURIComponent(`${unit.id}`)}" title="${t('delete')}"><span data-icon="trash"></span></button>
                `
                        : ''
                }
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// FORMULÁRIOS
// ----------------------------------------------------------------
/** @param {string|null} [editId] */
export function openAddParameterForm( editId: any = null) {
    const container = document.getElementById('parameter-form-container');
    if (!container) return;
    const existing = editId ? CONFIG.PARAMETERS.find((p: any) => p.id === editId) : null;
    container.innerHTML = `
        <div class="field-form">
            <h3>${editId ? t('editParameter') : t('addParameter')}</h3>
            <div class="form-group">
                <label class="form-label">${t('parameterName')}</label>
                <input data-field-meta="true" data-field-meta-key="auto:new-param-name" class="form-input" type="text" id="new-param-name"
                       value="${existing ? escapeHtml(existing.name) : ''}"
                       placeholder="${t('parameterNamePlaceholder')}">
            </div>
            <div class="form-group">
                <label class="form-label">${t('defaultUnit')}</label>
                <select data-field-meta="true" data-field-meta-key="auto:new-param-unit" class="form-input" id="new-param-unit">
                    ${CONFIG.UNITS.map((u: any) => `
                        <option value="${u.id}" ${existing?.defaultUnitId === u.id ? 'selected' : ''}>
                            ${escapeHtml(u.symbol)} - ${escapeHtml(u.name)}
                        </option>
                    `,
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">${t('category')}</label>
                <select data-field-meta="true" data-field-meta-key="auto:new-param-category" class="form-input" id="new-param-category">
                    <option value="chemical" ${existing?.category === 'chemical' ? 'selected' : ''}>${t('categoryChemical')}</option>
                    <option value="physical" ${existing?.category === 'physical' ? 'selected' : ''}>${t('categoryPhysical')}</option>
                    <option value="contaminant" ${existing?.category === 'contaminant' ? 'selected' : ''}>${t('categoryContaminant')}</option>
                    <option value="hydrogeology" ${existing?.category === 'hydrogeology' ? 'selected' : ''}>${t('categoryHydrogeology')}</option>
                    <option value="emission" ${existing?.category === 'emission' ? 'selected' : ''}>${t('categoryEmission')}</option>
                    <option value="air_quality" ${existing?.category === 'air_quality' ? 'selected' : ''}>${t('categoryAirQuality')}</option>
                    <option value="waste" ${existing?.category === 'waste' ? 'selected' : ''}>${t('categoryWaste')}</option>
                    <option value="effluent" ${existing?.category === 'effluent' ? 'selected' : ''}>${t('categoryEffluent')}</option>
                    <option value="safety" ${existing?.category === 'safety' ? 'selected' : ''}>${t('categorySafety')}</option>
                    <option value="biodiversity" ${existing?.category === 'biodiversity' ? 'selected' : ''}>${t('categoryBiodiversity')}</option>
                    <option value="custom" ${existing?.category === 'custom' || !existing ? 'selected' : ''}>${t('categoryCustom')}</option>
                </select>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" data-cc-action="cc-fc440093">${t('cancel')}</button>
                <button class="btn btn-primary" data-cc-call-click="saveParameter|s:${encodeURIComponent(`${editId || ''}`)}">${t('save')}</button>
            </div>
        </div>
    `;
}
export function closeParameterForm() {
    const container = document.getElementById('parameter-form-container');
    if (container) container.innerHTML = '';
}
/** @param {string} [editId] */
export function saveParameter( editId: any) {
    const name = document.getElementById('new-param-name')?.value?.trim();
    const unitId = document.getElementById('new-param-unit')?.value;
    const category = document.getElementById('new-param-category')?.value;
    if (!name) {
        showToast(t('enterParameterName'), 'error');
        return;
    }
    const id = editId || name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now();
    // Verifica duplicata (apenas para novos)
    if (!editId && CONFIG.PARAMETERS.find((p: any) => p.id === id || p.name.toLowerCase() === name.toLowerCase())) {
        showToast(t('parameterExists'), 'error');
        return;
    }
    const param: any = {
        id,
        name,
        defaultUnitId: unitId || 'none',
        type: 'custom',
        category: category || 'custom',
        allowedCustomFields: [],
    };
    if (editId) {
        // Atualiza existente
        const idx = CONFIG.PARAMETERS.findIndex((p: any) => p.id === editId);
        if (idx >= 0) CONFIG.PARAMETERS[idx] = { ...CONFIG.PARAMETERS[idx], ...param, id: editId };
        const userIdx = userParameters.findIndex((p: any) => p.id === editId);
        if (userIdx >= 0) userParameters[userIdx] = { ...userParameters[userIdx], ...param, id: editId };
    } else {
        // Adiciona novo
        CONFIG.PARAMETERS.push(param);
        userParameters.push(param);
    }
    saveCustomData();
    closeParameterForm();
    renderFieldManagerContent('parameters');
    showToast(editId ? t('parameterUpdated') : t('parameterAdded'), 'success');
    // Dispara evento para atualizar UI
    window.dispatchEvent(new CustomEvent('fieldsChanged'));
}
/** @param {string} id */
export function editParameter( id: any) {
    openAddParameterForm(id);
}
/** @param {string} id */
export async function deleteParameter( id: any) {
    if (!(await asyncConfirm(t('confirmDeleteParameter')))) return;
    const idx = CONFIG.PARAMETERS.findIndex((p: any) => p.id === id);
    if (idx >= 0) CONFIG.PARAMETERS.splice(idx, 1);
    const userIdx = userParameters.findIndex((p: any) => p.id === id);
    if (userIdx >= 0) userParameters.splice(userIdx, 1);
    saveCustomData();
    renderFieldManagerContent('parameters');
    showToast(t('parameterDeleted'), 'success');
    window.dispatchEvent(new CustomEvent('fieldsChanged'));
}
// ----------------------------------------------------------------
// FORMULÁRIO DE UNIDADES
// ----------------------------------------------------------------
/** @param {string|null} [editId] */
export function openAddUnitForm( editId: any = null) {
    const container = document.getElementById('unit-form-container');
    if (!container) return;
    const existing = editId ? CONFIG.UNITS.find((u: any) => u.id === editId) : null;
    const dimensions = [
        { id: 'concentration', name: t('dimConcentration') },
        { id: 'mass_concentration', name: t('dimMassConcentration') },
        { id: 'ratio_ppm', name: t('dimRatioPpm') },
        { id: 'length', name: t('dimLength') },
        { id: 'temperature', name: t('dimTemperature') },
        { id: 'ratio', name: t('dimRatio') },
        { id: 'pH', name: 'pH' },
        { id: 'conductivity', name: t('dimConductivity') },
        { id: 'potential', name: t('dimPotential') },
        { id: 'flow', name: t('dimFlow') },
        { id: 'mass', name: t('dimMass') },
        { id: 'volume', name: t('dimVolume') },
        { id: 'air_concentration', name: t('dimAirConcentration') },
        { id: 'air_concentration_norm', name: t('dimAirConcentrationNorm') },
        { id: 'emission', name: t('dimEmission') },
        { id: 'intensity_emission', name: t('dimIntensityEmission') },
        { id: 'intensity_water', name: t('dimIntensityWater') },
        { id: 'area', name: t('dimArea') },
        { id: 'rate_hs', name: t('dimRateHS') },
        { id: 'severity', name: t('dimSeverity') },
        { id: 'energy', name: t('dimEnergy') },
        { id: 'noise', name: t('dimNoise') },
        { id: 'count', name: t('dimCount') },
        { id: 'score', name: t('dimScore') },
        { id: 'none', name: t('dimNone') },
    ];
    container.innerHTML = `
        <div class="field-form">
            <h3>${editId ? t('editUnit') : t('addUnit')}</h3>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">${t('unitSymbol')}</label>
                    <input data-field-meta="true" data-field-meta-key="auto:new-unit-symbol" class="form-input" type="text" id="new-unit-symbol"
                           value="${existing ? escapeHtml(existing.symbol) : ''}"
                           placeholder="mg/L">
                </div>
                <div class="form-group">
                    <label class="form-label">${t('unitName')}</label>
                    <input data-field-meta="true" data-field-meta-key="auto:new-unit-name" class="form-input" type="text" id="new-unit-name"
                           value="${existing ? escapeHtml(existing.name) : ''}"
                           placeholder="${t('unitNamePlaceholder')}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">${t('dimension')}</label>
                <select data-field-meta="true" data-field-meta-key="auto:new-unit-dimension" class="form-input" id="new-unit-dimension">
                    ${dimensions
                        .map((d: any) => `
                        <option value="${d.id}" ${existing?.dimension === d.id ? 'selected' : ''}>
                            ${escapeHtml(d.name)}
                        </option>
                    `,
                        )
                        .join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">${t('conversionFactor')}</label>
                <input data-field-meta="true" data-field-meta-key="auto:new-unit-tobase" class="form-input" type="number" step="any" id="new-unit-tobase"
                       value="${existing?.toBase ?? 1}"
                       placeholder="1">
                <small class="form-hint">${t('conversionFactorHint')}</small>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" data-cc-action="cc-1c466c1c">${t('cancel')}</button>
                <button class="btn btn-primary" data-cc-call-click="saveUnit|s:${encodeURIComponent(`${editId || ''}`)}">${t('save')}</button>
            </div>
        </div>
    `;
}
export function closeUnitForm() {
    const container = document.getElementById('unit-form-container');
    if (container) container.innerHTML = '';
}
/** @param {string} [editId] */
export function saveUnit( editId: any) {
    const symbol = document.getElementById('new-unit-symbol')?.value?.trim();
    const name = document.getElementById('new-unit-name')?.value?.trim();
    const dimension = document.getElementById('new-unit-dimension')?.value;
    const toBase = parseFloat(document.getElementById('new-unit-tobase')?.value || '1') || 1;
    if (!symbol || !name) {
        showToast(t('enterUnitDetails'), 'error');
        return;
    }
    const id = editId || symbol.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now();
    // Verifica duplicata
    if (!editId && CONFIG.UNITS.find((u: any) => u.id === id || u.symbol === symbol)) {
        showToast(t('unitExists'), 'error');
        return;
    }
    const unit = {
        id,
        symbol,
        name,
        type: 'custom',
        dimension: dimension || 'none',
        toBase,
    };
    if (editId) {
        const idx = CONFIG.UNITS.findIndex((u: any) => u.id === editId);
        if (idx >= 0) CONFIG.UNITS[idx] = { ...CONFIG.UNITS[idx], ...unit, id: editId };
        const userIdx = userUnits.findIndex((u: any) => u.id === editId);
        if (userIdx >= 0) userUnits[userIdx] = { ...userUnits[userIdx], ...unit, id: editId };
    } else {
        CONFIG.UNITS.push(unit);
        userUnits.push(unit);
    }
    saveCustomData();
    closeUnitForm();
    renderFieldManagerContent('units');
    showToast(editId ? t('unitUpdated') : t('unitAdded'), 'success');
    window.dispatchEvent(new CustomEvent('fieldsChanged'));
}
/** @param {string} id */
export function editUnit( id: any) {
    openAddUnitForm(id);
}
/** @param {string} id */
export async function deleteUnit( id: any) {
    if (!(await asyncConfirm(t('confirmDeleteUnit')))) return;
    const idx = CONFIG.UNITS.findIndex((u: any) => u.id === id);
    if (idx >= 0) CONFIG.UNITS.splice(idx, 1);
    const userIdx = userUnits.findIndex((u: any) => u.id === id);
    if (userIdx >= 0) userUnits.splice(userIdx, 1);
    saveCustomData();
    renderFieldManagerContent('units');
    showToast(t('unitDeleted'), 'success');
    window.dispatchEvent(new CustomEvent('fieldsChanged'));
}
// ----------------------------------------------------------------
// EXPORT CSV — Parameters + Units
// ----------------------------------------------------------------
function _downloadCsvBlob(csv: string, filename: string): void {
    const blob = new Blob([csvWithBom(csv)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportParametersCsv(): void {
    try {
        const userIds = new Set<string>(userParameters.map((p: any) => String(p?.id ?? '')));
        const csv = parametersToCsv(CONFIG.PARAMETERS, CONFIG.UNITS, userIds, getParamDisplayName);
        const filename = buildCsvFilename('parameters');
        _downloadCsvBlob(csv, filename);
        showToast(t('exportCsvSuccess') || 'CSV exported', 'success');
    } catch (e: any) {
        console.debug('[fieldManager:exportParametersCsv]', e?.message || e);
        showToast(t('exportCsvFailed') || 'Export failed', 'error');
    }
}

export function exportUnitsCsv(): void {
    try {
        const userIds = new Set<string>(userUnits.map((u: any) => String(u?.id ?? '')));
        const csv = unitsToCsv(CONFIG.UNITS, userIds);
        const filename = buildCsvFilename('units');
        _downloadCsvBlob(csv, filename);
        showToast(t('exportCsvSuccess') || 'CSV exported', 'success');
    } catch (e: any) {
        console.debug('[fieldManager:exportUnitsCsv]', e?.message || e);
        showToast(t('exportCsvFailed') || 'Export failed', 'error');
    }
}

// ----------------------------------------------------------------
// EXPOSIÇÃO GLOBAL
// ----------------------------------------------------------------
window.openFieldManagerModal = openFieldManagerModal;
window.closeFieldManagerModal = closeFieldManagerModal;
window.switchFieldTab = switchFieldTab;
window.openAddParameterForm = openAddParameterForm;
window.closeParameterForm = closeParameterForm;
window.saveParameter = saveParameter;
window.editParameter = editParameter;
window.deleteParameter = deleteParameter;
window.openAddUnitForm = openAddUnitForm;
window.closeUnitForm = closeUnitForm;
window.saveUnit = saveUnit;
window.editUnit = editUnit;
window.exportParametersCsv = exportParametersCsv;
window.exportUnitsCsv = exportUnitsCsv;
window.deleteUnit = deleteUnit;
