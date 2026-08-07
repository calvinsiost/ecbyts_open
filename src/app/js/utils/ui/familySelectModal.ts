// @ts-check
// Generated from src/app/js/utils/ui/familySelectModal.ts by TS-MIGRATION-001. Do not edit manually.
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
   FAMILY SELECTION MODAL v2
   ================================================================

   Modal reutilizavel para selecionar familias antes de gerar
   modelo aleatorio ou limpar modelo existente.

   v2: Adiciona abas Quantidades e Cenario no modo random.
   Modo clear permanece inalterado (flat checkbox list).

   ================================================================ */
import { getAllFamilies, getFamilyName } from '../../core/elements/families.js';
// RANDOM-COV-001 (fonte única de defaults) — o modal usa os MESMOS defaults do
// motor (core/random/constants.ts) que o boot, para que "primeira impressão" e
// "clique gerar com defaults" produzam o mesmo modelo (menor surpresa / DRY).
import { RANDOM_MODEL_DEFAULTS } from '../../core/random/constants.js';
import { normalizeRandomOptions } from '../../core/random/_randomOptionsNormalizePure.js';
import { estimateRandomObservations } from '../../core/random/_randomEstimatePure.js';
import { buildPresetsViewModel } from '../../core/random/_presetsViewModelPure.js';
import { buildPresetApplyPlan } from '../../core/random/_presetApplyPlanPure.js';
import {
    randomFamilyIds,
    clearableFamilyIds,
    familyRowStates,
    formatSliderOutput,
    collectRandomOptions,
} from '../../core/random/_familySelectModalPure.js';
import { safeJsonParse } from '../helpers/safeJsonParse.js';
import { countByFamily } from '../../core/elements/manager.js';
import { getIcon } from './icons.js';
import { openModal, closeModal } from './modals.js';
import { t } from '../i18n/translations.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { showToast } from './toast.js';
// ----------------------------------------------------------------
// CONSTANTES
// ----------------------------------------------------------------
const LS_RANDOM_KEY = 'ecbyts-random-families';
const LS_CLEAR_KEY = 'ecbyts-clear-families';
const LS_OPTIONS_KEY = 'ecbyts-random-options';
/** Familias geradas pelo randomModel */
const RANDOM_FAMILIES = [
    'site_project',
    'site_area',
    'site_zone',
    'boundary',
    'stratum',
    'building',
    'plume',
    'well',
    'tank',
    'lake',
    'river',
    'spring',
    'marker',
    'sample',
    'emission_source',
    'waste_stream',
    'effluent_point',
    'area',
    'incident',
    'habitat',
    'individual',
    'sensor',
    'intangible',
    'generic',
    'blueprint',
    // Novas famílias 2026-04-20 - integradas ao random generator
    'vehicle',
    'equipment',
    'infra_linear',
    'treatment_system',
    'atmosphere',
];
/** Defaults para opcoes de geracao (match hardcoded values do randomModel) */
type RandomOptions = Record<string, any> & {
    campaigns: number;
    wells: number;
    plumes: number;
    buildings: number;
    density: number;
    siteSize: string;
    contaminationLevel: string;
    includeCosts: boolean;
    transparentVisuals: boolean;
    seedDemoData: boolean;
    includeAerialOverlay: boolean;
    applyHighLodDefaults: boolean;
};
type SliderLimit = { min: number; max: number; step: number };
/** Modo de operação do modal. */
type FamilyMode = 'random' | 'clear';
/** Callback de confirmação; recebe o Set de famílias e, em random, as options. */
type ConfirmCallback = (selected: Set<string>, options?: RandomOptions | null) => void;
/** Subset de preset consumido pelo modal (id/nameKey + campos do plano). */
type PresetInput = {
    id: string;
    nameKey?: string;
    families?: ReadonlyArray<string>;
    generationOptions?: Record<string, unknown>;
};

// Fonte ÚNICA: espelha core/random/constants.ts (RANDOM_MODEL_DEFAULTS.options),
// o mesmo que o boot consome. Antes esta tabela divergia (20/25/2/3) do motor
// (18/22/3/4), fazendo o modelo do boot ≠ do clique-default (RANDOM-COV-001 eval).
const RANDOM_DEFAULTS: RandomOptions = { ...RANDOM_MODEL_DEFAULTS.options };
const RANDOM_BOOLEAN_OPTIONS: readonly string[] = Object.freeze([
    'includeCosts',
    'transparentVisuals',
    'seedDemoData',
    'includeAerialOverlay',
    'applyHighLodDefaults',
]);
const RANDOM_SCENARIO_TOGGLES = Object.freeze([
    {
        key: 'includeCosts',
        labelKey: 'randomIncludeCosts',
        fallback: 'Include Costs (CAPEX/OPEX)',
    },
    {
        key: 'transparentVisuals',
        labelKey: 'randomTransparentVisuals',
        fallback: 'Transparent visuals',
    },
    {
        key: 'seedDemoData',
        labelKey: 'randomSeedDemoData',
        fallback: 'Fake / demo data',
    },
    {
        key: 'includeAerialOverlay',
        labelKey: 'randomIncludeAerialOverlay',
        fallback: 'Default aerial image',
    },
    {
        key: 'applyHighLodDefaults',
        labelKey: 'randomApplyHighLodDefaults',
        fallback: 'Use curated 3D high-LOD defaults where available',
    },
]);
/** Limites de cada slider */
const SLIDER_LIMITS: Record<string, SliderLimit> = {
    campaigns: { min: 5, max: 40, step: 1 },
    wells: { min: 5, max: 60, step: 1 },
    plumes: { min: 1, max: 5, step: 1 },
    buildings: { min: 1, max: 10, step: 1 },
    density: { min: 0.5, max: 2.0, step: 0.1 },
};
/** Mapeamento slider → familia (para cross-tab sync) */
const SLIDER_FAMILY_MAP: Record<string, string> = {
    wells: 'well',
    plumes: 'plume',
    buildings: 'building',
};
// ----------------------------------------------------------------
// ESTADO DO MODULO
// ----------------------------------------------------------------
let _currentMode: FamilyMode | null = null; // 'random' | 'clear'
let _onConfirm: ConfirmCallback | null = null; // callback(Set<string>, options?)
// ----------------------------------------------------------------
// LOCALSTORAGE - Familias
// ----------------------------------------------------------------
/**
 * Load saved family selection from localStorage.
 * Carrega selecao salva; retorna null se nao existir.
 * @param {'random'|'clear'} mode
 * @returns {Set<string>|null}
 */
export function loadFamilySelection(mode: FamilyMode): Set<string> | null {
    const key = mode === 'random' ? LS_RANDOM_KEY : LS_CLEAR_KEY;
    const parsed = safeJsonParse<string[]>(localStorage.getItem(key), null, 'FamilySelect-load');
    return Array.isArray(parsed) ? new Set(parsed) : null;
}
/**
 * Save family selection to localStorage.
 * Persiste array de IDs selecionados.
 * @param {'random'|'clear'} mode
 * @param {Set<string>} selected
 */
export function saveFamilySelection(mode: FamilyMode, selected: Set<string>) {
    const key = mode === 'random' ? LS_RANDOM_KEY : LS_CLEAR_KEY;
    try {
        safeSetItem(key, JSON.stringify([...selected]));
    } catch (e: unknown) {
        console.warn('[FamilySelect] Error saving to localStorage:', (e as Error)?.message);
    }
}
// ----------------------------------------------------------------
// LOCALSTORAGE - Options (quantidades + cenario)
// ----------------------------------------------------------------
/**
 * Load saved random options from localStorage.
 * Valida e clampa valores contra limites.
 * @returns {any} Options merged com defaults
 */
function _loadRandomOptions(): RandomOptions {
    const saved = safeJsonParse<Record<string, any>>(localStorage.getItem(LS_OPTIONS_KEY), null, 'FamilySelect-options');
    if (!saved || typeof saved !== 'object') return { ...RANDOM_DEFAULTS };
    // Clamp/validate raw saved values against defaults + limits (pure logic).
    try {
        return normalizeRandomOptions(saved, RANDOM_DEFAULTS, SLIDER_LIMITS, RANDOM_BOOLEAN_OPTIONS) as RandomOptions;
    } catch (e: unknown) {
        console.warn('[FamilySelect] Error loading options from localStorage:', (e as Error)?.message);
        return { ...RANDOM_DEFAULTS };
    }
}
export function loadRandomOptions() {
    return _loadRandomOptions();
}
/**
 * Save random options to localStorage.
 * @param {any} opts
 */
function _saveRandomOptions(opts: RandomOptions) {
    try {
        safeSetItem(LS_OPTIONS_KEY, JSON.stringify(opts));
    } catch (e: unknown) {
        console.warn('[FamilySelect] Error saving options to localStorage:', (e as Error)?.message);
    }
}
export function saveRandomOptions(opts: RandomOptions) {
    _saveRandomOptions(opts);
}
// ----------------------------------------------------------------
// MODAL API
// ----------------------------------------------------------------
/**
 * Open the family selection modal.
 * Abre o modal com checkboxes para escolher familias.
 * No modo random, adiciona abas Quantidades e Cenario.
 * @param {'random'|'clear'} mode
 * @param {Function} onConfirm - callback(Set<string> selectedFamilyIds, options?)
 */
export function openFamilySelectModal(mode: FamilyMode, onConfirm: ConfirmCallback) {
    _currentMode = mode;
    _onConfirm = onConfirm;
    // Titulo e botao confirm
    const titleEl = document.getElementById('family-select-title');
    const confirmBtn = document.getElementById('family-select-confirm');
    if (titleEl) titleEl.textContent = t('selectFamilies') || 'Select Families';
    if (confirmBtn) {
        confirmBtn.textContent =
            mode === 'random' ? t('generate') || 'Generate' : t('clearSelected') || 'Clear Selected';
        confirmBtn.className = mode === 'random' ? 'btn btn-success' : 'btn btn-danger';
    }
    _renderModalContent(mode);
    openModal('family-select-modal');
}
// ----------------------------------------------------------------
// RENDER
// ----------------------------------------------------------------
/**
 * Render full modal content based on mode.
 * Random: tab bar + 3 panels. Clear: flat checkbox list.
 */
/**
 * @param {string} mode
 */
function _renderModalContent(mode: FamilyMode) {
    const container = document.getElementById('family-select-list');
    if (!container) return;
    if (mode === 'random') {
        _renderTabbed(container);
    } else {
        _renderFlat(container, mode);
    }
}
/**
 * Render tabbed layout for random mode.
 * 3 abas: Familias, Quantidades, Cenario.
 * @param {any} container
 */
function _renderTabbed(container: HTMLElement) {
    const opts = _loadRandomOptions();
    // Tab bar — WCAG 4.1.2: tablist semantics (role=tablist/tab + aria-selected)
    // para que leitores de tela anunciem "aba 1 de 4, selecionada".
    const tabBar = `<div class="fsel-tabs" id="fsel-tab-bar" role="tablist" aria-label="${t('randomTabsLabel') || 'Generation options'}">
        <button type="button" class="fsel-tab active" data-fsel-tab="families" role="tab" aria-selected="true" aria-controls="fsel-panel-families">${t('randomTabFamilies') || 'Families'}</button>
        <button type="button" class="fsel-tab" data-fsel-tab="quantities" role="tab" aria-selected="false" aria-controls="fsel-panel-quantities">${t('randomTabQuantities') || 'Quantities'}</button>
        <button type="button" class="fsel-tab" data-fsel-tab="scenario" role="tab" aria-selected="false" aria-controls="fsel-panel-scenario">${t('randomTabScenario') || 'Scenario'}</button>
        <button type="button" class="fsel-tab" data-fsel-tab="presets" role="tab" aria-selected="false" aria-controls="fsel-panel-presets">${t('randomTabPresets') || 'Presets'}</button>
    </div>`;
    // Panel: Families — role=tabpanel/group p/ associar conteúdo à aba (WCAG 4.1.2)
    const familiesPanel = `<div id="fsel-panel-families" class="fsel-panel" role="tabpanel" aria-label="${t('randomTabFamilies') || 'Families'}">
        ${_buildSubtitleRow()}
        ${_buildFamilyCheckboxes('random')}
    </div>`;
    // Panel: Quantities
    const quantitiesPanel = `<div id="fsel-panel-quantities" class="fsel-panel" role="tabpanel" aria-label="${t('randomTabQuantities') || 'Quantities'}" aria-hidden="true" style="display:none">
        ${_buildSlider('campaigns', t('randomCampaigns') || 'Campaigns', opts.campaigns)}
        ${_buildSlider('wells', t('randomWells') || 'Wells', opts.wells)}
        ${_buildSlider('plumes', t('randomPlumes') || 'Plumes', opts.plumes)}
        ${_buildSlider('buildings', t('randomBuildings') || 'Buildings', opts.buildings)}
        ${_buildSlider('density', t('randomMonitoringIntensity') || 'Monitoring Intensity', opts.density)}
        <div id="fsel-estimate" class="fsel-estimate"></div>
    </div>`;
    // Panel: Scenario — segmented controls expostos como radiogroup (WCAG 4.1.2):
    // semântica de "escolha única" (site size / contamination) p/ leitor de tela.
    const scenarioPanel = `<div id="fsel-panel-scenario" class="fsel-panel" role="tabpanel" aria-label="${t('randomTabScenario') || 'Scenario'}" aria-hidden="true" style="display:none">
        <div class="fsel-field">
            <label class="fsel-field-label" id="fsel-label-siteSize">${t('randomSiteSize') || 'Site Size'}</label>
            <div class="fsel-segmented" data-fsel-group="siteSize" role="radiogroup" aria-labelledby="fsel-label-siteSize">
                <button type="button" data-value="small" role="radio" aria-checked="${opts.siteSize === 'small'}" ${opts.siteSize === 'small' ? 'class="active"' : ''}>${t('randomSiteSmall') || 'Small (~150m)'}</button>
                <button type="button" data-value="medium" role="radio" aria-checked="${opts.siteSize === 'medium'}" ${opts.siteSize === 'medium' ? 'class="active"' : ''}>${t('randomSiteMedium') || 'Medium (~300m)'}</button>
                <button type="button" data-value="large" role="radio" aria-checked="${opts.siteSize === 'large'}" ${opts.siteSize === 'large' ? 'class="active"' : ''}>${t('randomSiteLarge') || 'Large (~600m)'}</button>
            </div>
        </div>
        <div class="fsel-field">
            <label class="fsel-field-label" id="fsel-label-contam">${t('randomContamination') || 'Contamination Level'}</label>
            <div class="fsel-segmented" data-fsel-group="contaminationLevel" role="radiogroup" aria-labelledby="fsel-label-contam">
                <button type="button" data-value="low" role="radio" aria-checked="${opts.contaminationLevel === 'low'}" ${opts.contaminationLevel === 'low' ? 'class="active"' : ''}>${t('randomContamLow') || 'Low'}</button>
                <button type="button" data-value="medium" role="radio" aria-checked="${opts.contaminationLevel === 'medium'}" ${opts.contaminationLevel === 'medium' ? 'class="active"' : ''}>${t('randomContamMedium') || 'Medium'}</button>
                <button type="button" data-value="high" role="radio" aria-checked="${opts.contaminationLevel === 'high'}" ${opts.contaminationLevel === 'high' ? 'class="active"' : ''}>${t('randomContamHigh') || 'High'}</button>
            </div>
        </div>
        ${RANDOM_SCENARIO_TOGGLES.map((toggle) => _buildScenarioToggle(toggle, opts)).join('')}
    </div>`;
    // Panel: Presets (environmental document templates)
    const presetsPanel = `<div id="fsel-panel-presets" class="fsel-panel" role="tabpanel" aria-label="${t('randomTabPresets') || 'Presets'}" aria-hidden="true" style="display:none">
        <div class="fsel-presets-list" id="fsel-presets-list" role="list" aria-label="${t('randomTabPresets') || 'Presets'}"></div>
    </div>`;
    container.innerHTML = tabBar + familiesPanel + quantitiesPanel + scenarioPanel + presetsPanel;
    // Populate presets panel (lazy load to avoid circular imports)
    _populatePresetsPanel();
    // Bind tab clicks
    container.querySelectorAll<HTMLElement>('.fsel-tab').forEach((tab) => {
        tab.addEventListener('click', () => _switchTab(tab.dataset.fselTab || ''));
    });
    // Bind segmented button clicks (mantém aria-checked do radiogroup em sincronia
    // com o estado visual .active — ARIA verdadeiro, não decorativo).
    container.querySelectorAll<HTMLElement>('.fsel-segmented button').forEach((btn) => {
        btn.addEventListener('click', () => {
            const group = btn.closest('.fsel-segmented');
            group?.querySelectorAll('button').forEach((b) => {
                b.classList.remove('active');
                b.setAttribute('aria-checked', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-checked', 'true');
        });
    });
    // Bind slider input events
    for (const key of Object.keys(SLIDER_LIMITS)) {
        const slider = document.getElementById(`fsel-${key}`);
        const output = document.getElementById(`fsel-${key}-output`);
        if (slider && output) {
            slider.addEventListener('input', () => {
                output.textContent = _formatSliderOutput(key, (slider as HTMLInputElement).value);
                _updateEstimate();
            });
        }
    }
    // Bind checkbox change events for confirm button state
    container.querySelectorAll<HTMLInputElement>('#fsel-panel-families input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', _updateConfirmButton);
    });
    // Confirm button listener
    const confirmBtn = document.getElementById('family-select-confirm');
    if (confirmBtn) {
        confirmBtn.removeEventListener('click', _handleConfirmClick);
        confirmBtn.addEventListener('click', _handleConfirmClick);
    }
    _updateConfirmButton();
    _updateEstimate();
}
/**
 * Render flat checkbox list for clear mode (unchanged from v1).
 * @param {any} container
 * @param {string} mode
 */
function _renderFlat(container: HTMLElement, mode: FamilyMode) {
    const allFamilies = getAllFamilies();
    const counts = countByFamily() as Record<string, number>;
    const familyMap = allFamilies as Record<string, { icon?: string } & Record<string, unknown>>;
    const familyIds = clearableFamilyIds(familyMap, counts);
    if (familyIds.length === 0) {
        container.innerHTML = `<p style="padding:16px;text-align:center;color:var(--primary-text-soft);">
            ${t('noElements') || 'No elements to clear.'}
        </p>`;
        const confirmBtn = document.getElementById('family-select-confirm') as HTMLButtonElement | null;
        if (confirmBtn) confirmBtn.disabled = true;
        return;
    }
    const saved = loadFamilySelection(mode);
    // Estado puro por linha (checked/count) derivado em core/random/_familyListPure.ts
    // (gate-proven). Aqui só resolvemos nome/ícone (i18n/DOM) e montamos o HTML.
    const rows = familyRowStates(familyIds, saved, counts);
    container.innerHTML =
        `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;color:var(--primary-text-soft);">${t('selectFamiliesToClear') || 'Choose families to remove:'}</span>
        <button type="button" class="btn btn-secondary" style="padding:2px 8px;font-size:11px;"
                data-cc-action="cc-d1412255">${t('toggleAll') || 'Toggle All'}</button>
    </div>` +
        rows
            .map((row) => {
                const f = familyMap[row.id];
                const name = getFamilyName(f);
                const icon = getIcon(String(f?.icon ?? ''), { size: '18px' });
                return `<label class="family-select-item">
            <input data-field-meta="true" data-field-meta-key="auto-tpl:familySelectModal:input:L381" type="checkbox" id="fsel-${row.id}" data-family="${row.id}" ${row.checked ? 'checked' : ''}>
            <span class="family-select-icon">${icon}</span>
            <span>${name} <span class="family-select-count">(${row.count})</span></span>
        </label>`;
            })
            .join('');
    container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', _updateConfirmButton);
    });
    const confirmBtn = document.getElementById('family-select-confirm');
    if (confirmBtn) {
        confirmBtn.removeEventListener('click', _handleConfirmClick);
        confirmBtn.addEventListener('click', _handleConfirmClick);
    }
    _updateConfirmButton();
}
// ----------------------------------------------------------------
// HTML BUILDERS
// ----------------------------------------------------------------
function _buildSubtitleRow() {
    return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;color:var(--primary-text-soft);">${t('selectFamiliesToGenerate') || 'Choose families to generate:'}</span>
        <button type="button" class="btn btn-secondary" style="padding:2px 8px;font-size:11px;"
                data-cc-action="cc-d1412255">${t('toggleAll') || 'Toggle All'}</button>
    </div>`;
}
function _buildFamilyCheckboxes(mode: FamilyMode) {
    const allFamilies = getAllFamilies();
    const saved = loadFamilySelection(mode);
    const familyIds = randomFamilyIds(RANDOM_FAMILIES, allFamilies as Record<string, unknown>);
    // Estado puro "checked" por linha (gate-proven em _familyListPure.ts); aqui
    // só fica a resolução de nome/ícone (i18n/DOM) e a montagem do HTML.
    return familyRowStates(familyIds, saved)
        .map((row) => {
            const f = allFamilies[row.id];
            const name = getFamilyName(f);
            const icon = getIcon(f.icon, { size: '18px' });
            return `<label class="family-select-item">
            <input data-field-meta="true" data-field-meta-key="auto-tpl:familySelectModal:input:L425" type="checkbox" id="fsel-${row.id}" data-family="${row.id}" ${row.checked ? 'checked' : ''}>
            <span class="family-select-icon">${icon}</span>
            <span>${name}</span>
        </label>`;
        })
        .join('');
}
/**
 * @param {any} key
 * @param {any} label
 * @param {any} value
 */
function _buildSlider(key: string, label: string, value: number) {
    const { min, max, step } = SLIDER_LIMITS[key] || { min: 0, max: 1, step: 1 };
    return `<div class="fsel-field">
        <label class="fsel-field-label">${label}</label>
        <div class="fsel-slider-row">
            <input data-field-meta="true" data-field-meta-key="auto-tpl:familySelectModal:input:L438" type="range" id="fsel-${key}" min="${min}" max="${max}" step="${step}" value="${value}">
            <output id="fsel-${key}-output">${_formatSliderOutput(key, value)}</output>
        </div>
    </div>`;
}
function _buildScenarioToggle(
    toggle: { key: string; labelKey: string; fallback: string },
    opts: RandomOptions,
) {
    const checked = opts[toggle.key] !== false;
    const translated = t(toggle.labelKey);
    const label = translated && translated !== toggle.labelKey ? translated : toggle.fallback;
    return `<label class="fsel-check-row">
        <input data-field-meta="true" data-field-meta-key="auto:fsel-${toggle.key}" type="checkbox" id="fsel-${toggle.key}" ${checked ? 'checked' : ''}>
        <span>${label}</span>
    </label>`;
}
/**
 * Formata o texto do <output> do slider. A aritmética/threshold é pura
 * (core/random/_sliderFormatPure.ts); aqui só resolvemos os rótulos i18n.
 */
function _formatSliderOutput(key: string, value: string | number) {
    return formatSliderOutput(key, value, {
        sparse: t('randomSparse') || 'Sparse',
        dense: t('randomDense') || 'Dense',
    });
}
// ----------------------------------------------------------------
// TAB SWITCHING
// ----------------------------------------------------------------
function _switchTab(tabId: string) {
    const container = document.getElementById('family-select-list');
    if (!container) return;
    // Update tab active state + aria-selected (mantém o estado ARIA fiel ao visual)
    container.querySelectorAll<HTMLElement>('.fsel-tab').forEach((tab) => {
        const isActive = tab.dataset.fselTab === tabId;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    // Show/hide panels + aria-hidden (painéis ocultos não são anunciados)
    container.querySelectorAll<HTMLElement>('.fsel-panel').forEach((panel) => {
        panel.style.display = 'none';
        panel.setAttribute('aria-hidden', 'true');
    });
    const targetPanel = document.getElementById(`fsel-panel-${tabId}`);
    if (targetPanel) {
        targetPanel.style.display = '';
        targetPanel.setAttribute('aria-hidden', 'false');
    }
    // Cross-tab sync: disable sliders for unchecked families
    if (tabId === 'quantities') {
        _syncQuantitySliders();
        _updateEstimate();
    }
}
/**
 * Popula aba Presets com templates ambientais.
 * Lazy import para evitar dependencia circular.
 */
async function _populatePresetsPanel() {
    const list = document.getElementById('fsel-presets-list');
    if (!list) return;
    try {
        const { PRESETS, PRESET_CATEGORIES } = await import('../../core/elements/presets/registry.js' as string);
        // Agrupamento/filtragem por categoria (lógica pura, gate-proven) em
        // core/random/_presetsViewModelPure.ts. Aqui só fica tradução + HTML.
        const viewModel = buildPresetsViewModel(PRESET_CATEGORIES, PRESETS);
        let html = '';
        for (const cat of viewModel) {
            html += `<div class="fsel-preset-category">
                <div class="fsel-preset-cat-label">${_esc(t(cat.nameKey) || cat.id)}</div>`;
            for (const card of cat.cards) {
                const name = t(card.nameKey as string) || card.id;
                const desc = t(card.descriptionKey as string) || '';
                html += `<button type="button" class="fsel-preset-btn" data-preset-id="${_esc(card.id)}">
                    <span class="fsel-preset-icon">${card.icon}</span>
                    <span class="fsel-preset-info">
                        <span class="fsel-preset-name">${_esc(name)}</span>
                        <span class="fsel-preset-desc">${_esc(desc)}</span>
                        <span class="fsel-preset-families">${_esc(card.families)}</span>
                    </span>
                </button>`;
            }
            html += `</div>`;
        }
        list.innerHTML = html;
        // Bind preset clicks: aplica familias + opcoes e fecha modal
        list.querySelectorAll<HTMLElement>('.fsel-preset-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const presetId = btn.dataset.presetId || '';
                _applyPresetToModal(presetId, PRESETS as PresetInput[]);
            });
        });
    } catch (err: unknown) {
        list.innerHTML = `<p style="color:var(--text-secondary);padding:12px">${t('preset.loadError') || 'Could not load presets.'}</p>`;
        console.warn('[familySelect] preset load error:', err);
    }
}
/**
 * Aplica um preset: marca familias, ajusta sliders, muda para aba Familias.
 */
function _applyPresetToModal(presetId: string, allPresets: PresetInput[]) {
    const preset = allPresets.find((p) => p.id === presetId);
    if (!preset) return;
    // Derivação pura (gate-proven) do "plano" do que aplicar: famílias a
    // marcar, sliders, segmented (siteSize/contaminationLevel) e booleanos.
    // Mantém a semântica legada (Set de famílias, ordem de generationOptions,
    // guardas-truthy de segmented, filtro typeof boolean). A mutação do DOM
    // permanece aqui. Ver core/random/_presetApplyPlanPure.ts.
    const plan = buildPresetApplyPlan(preset, RANDOM_BOOLEAN_OPTIONS);
    // 1. Desmarcar todas as familias
    const container = document.getElementById('fsel-panel-families');
    if (container) {
        container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
            cb.checked = false;
        });
    }
    // 2. Marcar familias do preset
    const presetFamilies = plan.families;
    if (container) {
        container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
            const familyId = cb.dataset.family || cb.value;
            if (presetFamilies.has(familyId)) cb.checked = true;
        });
    }
    // 3. Ajustar sliders com opcoes do preset
    for (const [key, val] of plan.sliderEntries) {
        const slider = document.getElementById(`fsel-${key}`);
        const output = document.getElementById(`fsel-${key}-output`);
        if (slider) {
            (slider as HTMLInputElement).value = String(val);
            if (output) output.textContent = _formatSliderOutput(key, val as string | number);
        }
    }
    // 4. Ajustar segmented buttons (siteSize, contaminationLevel)
    if (plan.siteSize) {
        const group = document.querySelector('[data-fsel-group="siteSize"]');
        if (group) {
            group.querySelectorAll<HTMLElement>('button').forEach((b) => {
                const on = b.dataset.value === plan.siteSize;
                b.classList.toggle('active', on);
                b.setAttribute('aria-checked', on ? 'true' : 'false');
            });
        }
    }
    if (plan.contaminationLevel) {
        const group = document.querySelector('[data-fsel-group="contaminationLevel"]');
        if (group) {
            group.querySelectorAll<HTMLElement>('button').forEach((b) => {
                const on = b.dataset.value === plan.contaminationLevel;
                b.classList.toggle('active', on);
                b.setAttribute('aria-checked', on ? 'true' : 'false');
            });
        }
    }
    for (const [key, val] of plan.booleans) {
        const checkbox = document.getElementById(`fsel-${key}`);
        if (checkbox) (checkbox as HTMLInputElement).checked = val;
    }
    // 5. Salvar preset ativo
    try {
        localStorage.setItem(
            'ecbyts-active-preset',
            JSON.stringify({
                id: preset.id,
                appliedAt: new Date().toISOString(),
            }),
        );
    } catch (e: unknown) {
        console.debug('[familySelectModal] persistPreset:', (e as Error)?.message || e);
        /* noop */
    }
    // 6. Mudar para aba Familias (mostra resultado da selecao)
    _switchTab('families');
    // 7. Toast confirmacao
    showToast(
        `${t(preset.nameKey) || preset.id}: ${t('preset.applied') || 'Preset applied — adjust and click Generate'}`,
        'info',
    );
}
function _esc(str: string) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}
/**
 * Disable quantity sliders for unchecked families (cross-tab sync).
 */
function _syncQuantitySliders() {
    for (const [sliderKey, familyId] of Object.entries(SLIDER_FAMILY_MAP)) {
        const checkbox = document.getElementById(`fsel-${familyId}`);
        const slider = document.getElementById(`fsel-${sliderKey}`);
        const output = document.getElementById(`fsel-${sliderKey}-output`);
        if (slider) {
            const enabled = checkbox ? (checkbox as HTMLInputElement).checked : true;
            (slider as HTMLInputElement).disabled = !enabled;
            if (output) output.style.opacity = enabled ? '1' : '0.4';
        }
    }
}
// ----------------------------------------------------------------
// OBSERVATION ESTIMATE
// ----------------------------------------------------------------
function _updateEstimate() {
    const el = document.getElementById('fsel-estimate');
    if (!el) return;
    const campaigns = _getSliderValue('campaigns');
    const wells = _getSliderValue('wells');
    const density = _getSliderValue('density');
    // Estimativa: campanhas x pocos x densidade x 3 (avg params por poco).
    // Aritmética pura em core/random/_randomEstimatePure.ts (gate-proven).
    const { count: estimate, isWarning } = estimateRandomObservations(campaigns, wells, density);
    el.className = isWarning ? 'fsel-estimate warning' : 'fsel-estimate';
    el.innerHTML = isWarning
        ? `&#9888; ~${estimate.toLocaleString()} ${t('randomEstimateWarning') || 'observations (may take longer)'}`
        : `~${estimate.toLocaleString()} ${t('randomEstimate') || 'observations will be generated'}`;
}
function _getSliderValue(key: string): number {
    const slider = document.getElementById(`fsel-${key}`);
    return slider ? parseFloat((slider as HTMLInputElement).value) : (RANDOM_DEFAULTS[key] as number);
}
// ----------------------------------------------------------------
// HANDLERS (expostos no window via index.js)
// ----------------------------------------------------------------
/**
 * Toggle all checkboxes on/off.
 * Alterna todos: se algum esta desmarcado, marca todos; senao desmarca todos.
 */
export function handleFamilySelectToggleAll() {
    // Em modo tabbed, so atua nos checkboxes da aba Familias
    const panel = document.getElementById('fsel-panel-families') || document.getElementById('family-select-list');
    if (!panel) return;
    const checkboxes = panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    if (checkboxes.length === 0) return;
    const allChecked = [...checkboxes].every((cb) => cb.checked);
    checkboxes.forEach((cb) => {
        cb.checked = !allChecked;
    });
    _updateConfirmButton();
}
/**
 * Internal click handler for confirm button.
 * Wrapper com try/catch para capturar erros visivelmente.
 */
function _handleConfirmClick() {
    try {
        handleFamilySelectConfirm();
    } catch (e: unknown) {
        console.error('[FamilySelect] Error in confirm:', e);
    }
}
/**
 * Update confirm button enabled state.
 * Desabilita se nenhuma familia selecionada.
 */
function _updateConfirmButton() {
    const confirmBtn = document.getElementById('family-select-confirm');
    if (!confirmBtn) return;
    // Em modo tabbed, checkboxes estao dentro de fsel-panel-families
    const panel = document.getElementById('fsel-panel-families') || document.getElementById('family-select-list');
    if (!panel) return;
    const checked = panel.querySelectorAll('input[type="checkbox"]:checked');
    (confirmBtn as HTMLButtonElement).disabled = checked.length === 0;
}
/**
 * Collect current options from Quantities + Scenario tabs.
 * Lê os valores crus do DOM; a montagem/coerção (round ≠ density,
 * fallback de segmented, merge de booleanos) é pura em
 * core/random/_collectOptionsPure.ts (gate-proven).
 */
function _collectOptions(): RandomOptions {
    const sliderKeys = Object.keys(SLIDER_LIMITS);
    const sliderValues: Record<string, number> = {};
    for (const key of sliderKeys) sliderValues[key] = _getSliderValue(key);
    const sizeGroup = document.querySelector('.fsel-segmented[data-fsel-group="siteSize"] button.active');
    const contamGroup = document.querySelector('.fsel-segmented[data-fsel-group="contaminationLevel"] button.active');
    const booleanValues: Record<string, boolean> = {};
    for (const key of RANDOM_BOOLEAN_OPTIONS) {
        const checkbox = document.getElementById(`fsel-${key}`);
        if (checkbox) booleanValues[key] = (checkbox as HTMLInputElement).checked;
    }
    return collectRandomOptions(
        RANDOM_DEFAULTS,
        sliderKeys,
        sliderValues,
        {
            siteSize: (sizeGroup as HTMLElement | null)?.dataset.value || null,
            contaminationLevel: (contamGroup as HTMLElement | null)?.dataset.value || null,
        },
        RANDOM_BOOLEAN_OPTIONS,
        booleanValues,
    );
}
/**
 * Confirm selection and execute callback.
 * Salva selecao no cache e chama o callback com o Set de IDs.
 * No modo random, tambem passa options como segundo argumento.
 */
export function handleFamilySelectConfirm() {
    try {
        // Idempotent guard: modal confirm can be bound both inline and via addEventListener.
        // After the first successful confirm we reset mode/callback; duplicate events should no-op.
        if (!_currentMode) return;
        // Coleta familias selecionadas
        const panel = document.getElementById('fsel-panel-families') || document.getElementById('family-select-list');
        if (!panel) return;
        const checkboxes = panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
        const selected = new Set([...checkboxes].map((cb) => cb.dataset.family ?? ''));
        console.debug('[FamilySelect] Confirm:', selected.size, 'families, mode:', _currentMode);
        if (selected.size === 0) return;
        saveFamilySelection(_currentMode, selected);
        // Coleta options no modo random
        let options: RandomOptions | null = null;
        if (_currentMode === 'random') {
            options = _collectOptions();
            _saveRandomOptions(options);
        }
        closeModal('family-select-modal');
        // Capture callback then reset state BEFORE invoking callback
        // so duplicate click handlers in the same event cycle do not re-enter.
        const onConfirm = _onConfirm;
        const mode = _currentMode;
        _currentMode = null;
        _onConfirm = null;
        if (onConfirm) {
            if (mode === 'random') {
                onConfirm(selected, options);
            } else {
                onConfirm(selected);
            }
        } else {
            console.warn('[FamilySelect] No callback registered (_onConfirm is null)');
        }
    } catch (e: unknown) {
        console.error('[FamilySelect] Error in confirm handler:', e);
    }
}
