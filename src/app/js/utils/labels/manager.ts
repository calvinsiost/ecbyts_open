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
   LABEL MANAGER — Gerenciador de Labels 3D
   ================================================================

   Cria, atualiza e remove labels CSS2D no modelo 3D.
   Quatro categorias de labels:

   1. elementNames  — nome do elemento (poço MW-01, pluma, etc.)
   2. observations  — valor da última observação (0.052 mg/L)
   3. geology       — nome das camadas geológicas (areia, argila)
   4. modelTitle    — título do modelo (flutuante no topo)

   Cada label e um CSS2DObject (Three.js) — div HTML projetada em
   coordenadas 3D, sempre virada para a camera (billboard).

   Persistencia: localStorage ('ecbyts-label-settings')

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
let _CSS2DObject: any = null;
import('three/addons/renderers/CSS2DRenderer.js' as string).then((m: any) => { _CSS2DObject = m.CSS2DObject; });
import { getScene, getCamera, requestRender } from '../scene/setup.js';
import { getAllElements, getElementById, getMeshByElementId, isEffectivelyVisible, } from '../../core/elements/manager.js';
import { getFamily, getFamilyName } from '../../core/elements/families.js';
import { deepClone as _deepCloneCanonical } from '../helpers/deepClone.js';
import { getCurrentLanguage } from '../i18n/translations.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { computeScopedEIS } from '../../core/purpose/snapshotEngine.js';
import { getModelIdSync } from '../../core/io/modelLink.js';
import { computeBoundaryCentroid, formatLabelText, shouldShowBoundaryLabel, buildBoundaryLabelPosition, DEFAULT_BOUNDARY_LABEL_THRESHOLD_M, DEFAULT_BOUNDARY_LABEL_MAX_LEN, DEFAULT_BOUNDARY_LABEL_Y_OFFSET_M, DEFAULT_BOUNDARY_LABEL_FADE_MS, } from '../../core/labels/boundaryLabel.js';
/** @typedef {Record<string, any>} AnyRecord */
/** @typedef {AnyRecord & {element: HTMLElement, center: {set(x: number, y: number): void}, position: {set(x: number, y: number, z: number): void}, parent?: {remove(obj: unknown): void}}} LabelObject */
type AnyRecord = Record<string, any>;
const Three: any = THREE;
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-label-settings';
const SETTINGS_VERSION = 2; // Incrementar ao mudar defaults p/ forcar reset
/**
 * Familias que NAO recebem labels por default.
 * Intangibles ja tem HUD cards; boundary/blueprint/area sao geometria de referencia.
 */
const SKIP_FAMILIES = new Set(['intangible', 'generic', 'boundary', 'blueprint', 'area']);
/**
 * @param {unknown} e
 * @returns {string|unknown}
 */
function _errorMessage(e: any) {
    return e instanceof Error ? e.message : e;
}
/** Shortcut para idioma atual, com fallback seguro. */
function _getCurrentLang() {
    try {
        return getCurrentLanguage();
    }
    catch (e) {
        console.debug('[labels/manager] getCurrentLang:', _errorMessage(e));
        return 'en';
    }
}
/**
 * Offset Y por familia - posiciona label bem acima do topo do mesh.
 * Offsets maiores criam espaco para leader lines conectando label → elemento.
 */
/** @type {AnyRecord} */
const FAMILY_OFFSETS = {
    well: { x: 0, y: 2.0, z: 0 },
    plume: { x: 0, y: 2.5, z: 0 },
    lake: { x: 0, y: 2.0, z: 0 },
    river: { x: 0, y: 2.0, z: 0 },
    building: { x: 0, y: 2.5, z: 0 },
    tank: { x: 0, y: 2.0, z: 0 },
    waste: { x: 0, y: 2.0, z: 0 },
    spring: { x: 0, y: 1.8, z: 0 },
    boundary: { x: 0, y: 1.5, z: 0 },
    blueprint: { x: 0, y: 1.5, z: 0 },
    sensor: { x: 0, y: 1.8, z: 0 },
    marker: { x: 0, y: 1.8, z: 0 },
    stratum: { x: 0, y: 1.5, z: 0 },
    area: { x: 0, y: 1.5, z: 0 },
    _default: { x: 0, y: 3.0, z: 0 },
};
/** Default config — clonado para state inicial */
const DEFAULTS = {
    enabled: true,
    categories: {
        elementNames: {
            enabled: true,
            fontSize: 11,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#ffffff',
            background: 'rgba(0,0,0,0.65)',
            maxDistance: 0,
            showFamily: false,
        },
        observations: {
            enabled: false,
            fontSize: 10,
            fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
            color: '#00ff88',
            background: 'rgba(0,0,0,0.55)',
            maxDistance: 0,
            showUnit: true,
            showDate: false,
        },
        geology: {
            enabled: false,
            fontSize: 9,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#ffffff',
            background: 'rgba(0,0,0,0.45)',
            offset: { x: 2.5, y: 0, z: 0 },
            maxDistance: 0,
        },
        eisScore: {
            enabled: false,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
            color: '#ffffff',
            background: 'rgba(0,0,0,0.70)',
            maxDistance: 0,
        },
        modelTitle: {
            enabled: false,
            text: '',
            fontSize: 16,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#ffffff',
            background: 'rgba(0,0,0,0.35)',
            // anchor: onde o título aparece em screen-space sobre o canvas.
            // Valores: 'top-left' | 'top-center' | 'top-right'
            //        | 'bottom-left' | 'bottom-center' | 'bottom-right'
            //        | 'world' (legado - usa position XYZ como CSS2DObject em 3D)
            anchor: 'top-center',
            position: { x: 0, y: 30, z: 0 },
        },
        modelSubtitle: {
            enabled: false,
            // Quando true, subtitle mostra resumo dos filtros ativos (famílias,
            // campanhas, parâmetros). Quando false, mostra `text` literal.
            showActiveFilters: true,
            text: '',
            fontSize: 12,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#cccccc',
            background: 'rgba(0,0,0,0.25)',
        },
        // SPEC_BOUNDARY_3D_LABELS_AUTO — labels automaticas no centróide do polígono
        // para boundaries com meta.label ou name. Default enabled (discoverable).
        // Categoria separada de elementNames para preservar SKIP_FAMILIES intacto.
        boundaryAuto: {
            enabled: true,
            maxDistance: DEFAULT_BOUNDARY_LABEL_THRESHOLD_M,
            maxLen: DEFAULT_BOUNDARY_LABEL_MAX_LEN,
            yOffset: DEFAULT_BOUNDARY_LABEL_Y_OFFSET_M,
            fadeMs: DEFAULT_BOUNDARY_LABEL_FADE_MS,
        },
    },
    perElement: {},
};
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
/** @type {AnyRecord} */
let state = _cloneDeep(DEFAULTS);
/**
 * Map de labels por elemento:
 * elementId -> { name: CSS2DObject|null, obs: CSS2DObject|null, geo: CSS2DObject[] }
 */
/** @type {Map<string, AnyRecord>} */
const labelMap = new Map();
/** Label do titulo do modelo (nao pertence a nenhum elemento) */
/** @type {LabelObject|null} */
let titleLabel: any = null;
/** Debounce timer para syncLabels */
/** @type {ReturnType<typeof setTimeout>|null} */
let _syncTimer: any = null;
// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
/**
 * Inicializa o label manager: restaura config do localStorage
 * e registra listeners de eventos do element manager.
 */
export function initLabels() {
    // Restaura config - com versionamento para forcar reset ao mudar defaults
    let useDefaults = true;
    const saved = localStorage.getItem(STORAGE_KEY) || '';
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Se versao antiga ou ausente, descarta e usa defaults
            if (parsed._version === SETTINGS_VERSION) {
                state = _mergeDefaults(parsed, DEFAULTS);
                useDefaults = false;
            }
        }
        catch (e) {
            console.debug('[labels/manager] parseSettings:', _errorMessage(e));
            /* noop */
        }
    }
    if (useDefaults) {
        state = _cloneDeep(DEFAULTS);
        _persist(); // Salva com versao atual
    }
    // Escuta eventos do element manager (loose-coupled)
    window.addEventListener('ecbt:elementAdded', (e) => onElementAdded((e as CustomEvent).detail.id));
    window.addEventListener('ecbt:elementRemoved', (e) => onElementRemoved((e as CustomEvent).detail.id));
    window.addEventListener('ecbt:elementUpdated', (e) => onElementUpdated((e as CustomEvent).detail.id));
    window.addEventListener('ecbt:elementsCleared', () => clearAllLabels());
    // Reconstroi labels quando idioma muda (traduz nomes de familias)
    window.addEventListener('languageChanged', () => _debouncedSync());
    // Cria labels para elementos ja existentes (import, random model)
    syncLabels();
}
// ----------------------------------------------------------------
// CONFIG API
// ----------------------------------------------------------------
/**
 * Retorna deep clone do estado de configuracao.
 * @returns {AnyRecord}
 */
export function getLabelConfig() {
    return _cloneDeep(state);
}
/**
 * Verifica se labels estao habilitadas globalmente.
 * @returns {boolean}
 */
export function isLabelsEnabled() {
    return state?.enabled ?? true;
}
/**
 * Toggle global de labels.
 * @param {boolean} [enabled] - Se omitido, inverte o estado atual
 */
export function setLabelsEnabled(enabled: any) {
    if (enabled === undefined)
        enabled = !state.enabled;
    state.enabled = enabled;
    _persist();
    _debouncedSync();
}
/**
 * Toggle de uma categoria de labels.
 * @param {string} category - 'elementNames'|'observations'|'geology'|'modelTitle'
 * @param {boolean} [enabled]
 */
export function setLabelCategoryEnabled(category: any, enabled: any) {
    const cat = state.categories[category];
    if (!cat)
        return;
    if (enabled === undefined)
        enabled = !cat.enabled;
    cat.enabled = enabled;
    _persist();
    _debouncedSync();
}
/**
 * Altera um setting de uma categoria.
 * @param {string} category
 * @param {string} key
 * @param {*} value
 */
export function setLabelCategorySetting(category: any, key: any, value: any) {
    const cat = state.categories[category];
    if (!cat)
        return;
    cat[key] = value;
    _persist();
    _debouncedSync();
}
/**
 * Define override de label para um elemento especifico.
 * @param {string} elementId
 * @param {AnyRecord} overrides - { nameLabel: bool, obsLabel: bool }
 */
export function setPerElementLabel(elementId: string, overrides: AnyRecord) {
    if (!state.perElement[elementId])
        state.perElement[elementId] = {};
    Object.assign(state.perElement[elementId], overrides);
    _persist();
    _rebuildElementLabels(elementId);
}
/**
 * Retorna per-element overrides.
 * @param {string} elementId
 * @returns {AnyRecord|null}
 */
export function getPerElementLabel(elementId: string) {
    return state.perElement[elementId] || null;
}
/**
 * Reseta config para defaults.
 */
export function resetLabelSettings() {
    state = _cloneDeep(DEFAULTS);
    _persist();
    syncLabels();
}
// ----------------------------------------------------------------
// LABEL CREATION
// ----------------------------------------------------------------
/**
 * Resolve o texto do label de nome para um elemento.
 * Cadeia de prioridade:
 *   1. labels[idioma atual] - override customizado por idioma
 *   2. autoLabel - traduz dinamicamente via getFamilyName()
 *   3. labels fallback (en, depois primeiro disponivel)
 *   4. element.label || element.name || element.id
 *
 * @param {AnyRecord} element
 * @returns {string}
 */
function _resolveNameLabelText(element: AnyRecord) {
    // 1. Override customizado para o idioma atual
    if (element.labels) {
        const lang = _getCurrentLang();
        if (element.labels[lang])
            return element.labels[lang];
    }
    // 2. Auto-traducao pela familia
    if (element.autoLabel) {
        const family = getFamily(element.family);
        if (family) {
            const match = element.id.match(/-(\d+)$/);
            const counter = match ? match[1] : null;
            const familyName = getFamilyName(family);
            return counter ? `${familyName} ${counter}` : familyName;
        }
    }
    // 3. Fallback para outro idioma no mapa
    if (element.labels) {
        const fallback = element.labels.en || Object.values(element.labels)[0];
        if (fallback)
            return fallback;
    }
    // 4. Valor salvo
    return element.label || element.name || element.id;
}
/**
 * Cria label de nome para um elemento.
 * Posiciona acima do bounding box do mesh, com offset por familia.
 * @param {AnyRecord} element
 * @param {AnyRecord} mesh
 * @returns {LabelObject|null}
 */
function _createNameLabel(element: AnyRecord, mesh: AnyRecord) {
    const config = state.categories.elementNames;
    if (!config.enabled)
        return null;
    // Pula familias que nao devem ter label (intangibles tem HUD)
    if (SKIP_FAMILIES.has(element.family))
        return null;
    // Per-element override
    const perEl = state.perElement[element.id];
    if (perEl?.nameLabel === false)
        return null;
    const text = _resolveNameLabelText(element);
    const div = _createLabelDiv(text, 'label-3d-name', config, element);
    const labelObj = _createCss2dObject(div);
    // Ancora: centro horizontal, base inferior (label "pendura" acima do ponto)
    labelObj.center.set(0.5, 1);
    // Offset por familia - posiciona acima do topo do mesh
    const familyOffset = (FAMILY_OFFSETS as AnyRecord)[element.family] || FAMILY_OFFSETS._default;
    const topY = _getMeshTopY(mesh);
    const localPos = _toMeshLocalOffset(mesh, familyOffset.x, topY + familyOffset.y, familyOffset.z);
    labelObj.position.set(localPos.x, localPos.y, localPos.z);
    mesh.add(labelObj);
    return labelObj;
}
/**
 * Cria label de observacao (ultimo valor medido).
 * @param {AnyRecord} element
 * @param {AnyRecord} mesh
 * @returns {LabelObject|null}
 */
function _createObsLabel(element: AnyRecord, mesh: AnyRecord) {
    const config = state.categories.observations;
    if (!config.enabled)
        return null;
    // Pula familias sem label
    if (SKIP_FAMILIES.has(element.family))
        return null;
    // Per-element override
    const perEl = state.perElement[element.id];
    if (perEl?.obsLabel === false)
        return null;
    const obs = (element.data?.observations);
    if (!obs || obs.length === 0)
        return null;
    // Ultima observacao (mais recente por data)
    const latest = obs.reduce((a: any, b: any) => ((a.date || '') > (b.date || '') ? a : b));
    const text = _formatObservation(latest, config);
    if (!text)
        return null;
    const div = _createLabelDiv(text, 'label-3d-obs', config, element);
    const labelObj = _createCss2dObject(div);
    // Ancora: centro horizontal, topo superior (label fica logo abaixo do ponto)
    labelObj.center.set(0.5, 0);
    // Posiciona no mesmo ponto Y do nome - a ancora faz cair abaixo
    const familyOffset = (FAMILY_OFFSETS as AnyRecord)[element.family] || FAMILY_OFFSETS._default;
    const topY = _getMeshTopY(mesh);
    const localPos = _toMeshLocalOffset(mesh, familyOffset.x, topY + familyOffset.y, familyOffset.z);
    labelObj.position.set(localPos.x, localPos.y, localPos.z);
    mesh.add(labelObj);
    return labelObj;
}
/**
 * Cria labels de camadas geologicas para pocos (wells).
 * Retorna array de CSS2DObjects.
 * @param {AnyRecord} element
 * @param {AnyRecord} mesh
 * @returns {Array<LabelObject>}
 */
function _createGeoLabels(element: AnyRecord, mesh: AnyRecord) {
    if (element.family !== 'well')
        return [];
    const config = state.categories.geology;
    if (!config.enabled)
        return [];
    // Suporta formato novo (profile.lithologic) e legado (lithology)
    const lithologic = (element.data?.profile?.lithologic || element.data?.lithology);
    if (!lithologic || lithologic.length === 0)
        return [];
    return lithologic.map((layer: any) => {
        const midY = -(layer.from + layer.to) / 2; // Profundidade -> Y negativo
        const text = layer.description || layer.soilType || '?';
        const div = _createLabelDiv(text, 'label-3d-geo', config, element);
        // Cor da borda esquerda = cor da camada
        if (layer.color) {
            div.style.borderLeftColor = layer.color;
        }
        const labelObj = _createCss2dObject(div);
        // Ancora: esquerda, centro vertical (label ao lado do shaft)
        labelObj.center.set(0, 0.5);
        const localPos = _toMeshLocalOffset(mesh, config.offset.x, midY + (config.offset.y || 0), config.offset.z || 0);
        labelObj.position.set(localPos.x, localPos.y, localPos.z);
        mesh.add(labelObj);
        return labelObj;
    });
}
/**
 * Cria ou atualiza a label de titulo do modelo.
 *
 * Dois modos:
 *   - anchor !== 'world' (default): overlay screen-space sobre o canvas.
 *     Estável em relação ao viewport (não flutua com câmera). Recomendado.
 *   - anchor === 'world': CSS2DObject em 3D world coords (legado).
 */
function _createModelTitle() {
    const config = state.categories.modelTitle;
    if (!config.enabled) {
        _removeScreenTitleOverlay();
        return null;
    }
    const projectName = (document.getElementById('project-name') as HTMLInputElement | null)?.value || '';
    const text = config.text || projectName || '';
    if (!text) {
        _removeScreenTitleOverlay();
        return null;
    }
    if (config.anchor && config.anchor !== 'world') {
        _renderScreenTitleOverlay(text, config);
        return null;
    }
    // Fallback: render legado CSS2DObject em 3D world coords
    _removeScreenTitleOverlay();
    const div = _createLabelDiv(text, 'label-3d-title', config);
    const labelObj = _createCss2dObject(div);
    const pos = config.position || { x: 0, y: 30, z: 0 };
    labelObj.position.set(pos.x, pos.y, pos.z);
    const scene = getScene();
    if (scene)
        scene.add(labelObj);
    return labelObj;
}
// ID do overlay screen-space. Único (apenas 1 título por modelo).
const SCREEN_TITLE_ID = 'model-title-overlay';
function _removeScreenTitleOverlay() {
    const existing = document.getElementById(SCREEN_TITLE_ID);
    if (existing)
        existing.remove();
}
/**
 * @param {string} text
 * @param {AnyRecord} config
 */
function _renderScreenTitleOverlay(text: string, config: AnyRecord) {
    _removeScreenTitleOverlay();
    const container = document.getElementById('canvas-container') || document.body;
    const overlay = document.createElement('div');
    overlay.id = SCREEN_TITLE_ID;
    overlay.className = `model-title-overlay model-title-anchor-${config.anchor}`;
    container.appendChild(overlay);
    // Title (linha principal)
    const titleEl = document.createElement('div');
    titleEl.className = 'model-title-text';
    titleEl.textContent = text;
    titleEl.style.fontSize = (config.fontSize || 16) + 'px';
    titleEl.style.fontFamily = config.fontFamily || 'system-ui, -apple-system, sans-serif';
    titleEl.style.color = config.color || '#ffffff';
    titleEl.style.background = config.background || 'rgba(0,0,0,0.35)';
    overlay.appendChild(titleEl);
    // Subtitle opcional (linha secundária)
    const subConfig = state.categories.modelSubtitle;
    if (subConfig?.enabled) {
        const subText = _buildSubtitleText(subConfig);
        if (subText) {
            const subEl = document.createElement('div');
            subEl.className = 'model-subtitle-text';
            subEl.textContent = subText;
            subEl.style.fontSize = (subConfig.fontSize || 12) + 'px';
            subEl.style.fontFamily = subConfig.fontFamily || 'system-ui, -apple-system, sans-serif';
            subEl.style.color = subConfig.color || '#cccccc';
            subEl.style.background = subConfig.background || 'rgba(0,0,0,0.25)';
            overlay.appendChild(subEl);
        }
    }
}
// Cache do estado de filtros (atualizado via evento `globalFilterChanged`).
// Evita dependency cycle com filterPanel (que já lazy-importa labels/manager).
/** @type {AnyRecord|null} */
let _cachedFilterState: any = null;
if (typeof document !== 'undefined') {
    document.addEventListener('globalFilterChanged', (e: Event) => {
        _cachedFilterState = (e as CustomEvent).detail || null;
        // Re-render overlay se subtitle dinâmico estiver ativo
        if (state?.categories?.modelSubtitle?.enabled && state.categories.modelTitle?.enabled) {
            _debouncedSync();
        }
    });
}
/**
 * Constrói texto do subtitle a partir da config + filtros ativos.
 * @private
 * @param {AnyRecord} subConfig
 * @returns {string}
 */
function _buildSubtitleText(subConfig: AnyRecord) {
    if (!subConfig.showActiveFilters)
        return subConfig.text || '';
    if (!_cachedFilterState)
        return 'Sem filtros ativos';
    const parts = [];
    const f = _cachedFilterState;
    if (f.families?.length)
        parts.push(`Famílias: ${f.families.join(', ')}`);
    if (f.campaigns?.length)
        parts.push(`Campanhas: ${f.campaigns.length}`);
    if (f.parameters?.length)
        parts.push(`Parâmetros: ${f.parameters.join(', ')}`);
    return parts.length ? parts.join(' · ') : 'Sem filtros ativos';
}
/**
 * Cria label EIS para boundaries e site_areas.
 * Mostra score EIS composto no centroide da area.
 * @param {AnyRecord} element
 * @param {AnyRecord} mesh
 * @returns {LabelObject|null}
 */
function _createEisLabel(element: AnyRecord, mesh: AnyRecord) {
    const config = state?.categories?.eisScore;
    if (!config?.enabled)
        return null;
    // Somente boundaries e site_areas
    if (element.family !== 'boundary' && element.family !== 'site_area')
        return null;
    try {
        const scope = { type: 'area', elementId: element.id, modelId: getModelIdSync() };
        const result = computeScopedEIS(scope);
        if (result.elementCount === 0)
            return null;
        const score = result.areaEIS != null ? result.areaEIS : result.eis;
        const color = score >= 4.5 ? '#22c55e' : score >= 3.5 ? '#f59e0b' : '#ef4444';
        const text = `EIS ${score.toFixed(1)}`;
        const div = document.createElement('div');
        div.className = 'label-3d label-3d-eis';
        div.textContent = text;
        div.dataset.elementId = element.id;
        div.style.fontSize = (config.fontSize || 12) + 'px';
        div.style.fontFamily = config.fontFamily || "'JetBrains Mono', monospace";
        div.style.background = config.background || 'rgba(0,0,0,0.70)';
        div.style.color = color;
        div.style.fontWeight = '700';
        div.style.padding = '2px 6px';
        div.style.borderRadius = '4px';
        div.style.borderLeft = `3px solid ${color}`;
        const labelObj = _createCss2dObject(div);
        labelObj.center.set(0.5, 1);
        // Posiciona no centroide do boundary, acima
        const familyOffset = FAMILY_OFFSETS.boundary || FAMILY_OFFSETS._default;
        const topY = _getMeshTopY(mesh);
        const localPos = _toMeshLocalOffset(mesh, familyOffset.x, topY + familyOffset.y + 1.5, familyOffset.z);
        labelObj.position.set(localPos.x, localPos.y, localPos.z);
        mesh.add(labelObj);
        return labelObj;
    }
    catch (e) {
        console.debug('[labels/manager] addLabelToMesh:', _errorMessage(e));
        return null;
    }
}
// ----------------------------------------------------------------
// BOUNDARY AUTO LABEL — SPEC_BOUNDARY_3D_LABELS_AUTO
// ----------------------------------------------------------------
/**
 * Map de labels de boundary por elementId. Separado de labelMap porque
 * é criada via meshFactory (não via _buildElementLabels) e tem ciclo
 * de LOD próprio (distância câmera→centróide).
 * elementId -> { obj: LabelObject, centroidWorld: {x,y,z}, threshold: number }
 * @type {Map<string, AnyRecord>}
 */
const boundaryLabelMap = new Map();
/**
 * Cria label automática para uma boundary, posicionada no centróide do
 * polígono via shoelace. Chamada por `meshFactory.createBoundaryMesh`
 * após `group.add(plane)`.
 *
 * Comportamento:
 *   - Se categoria `boundaryAuto` desabilitada → no-op
 *   - Se `data.vertices` < 3 ou degenerado → no-op (sem warn — caller já valida)
 *   - Fade-in 200ms via CSS transition
 *   - LOD aplicado periodicamente via `_tickBoundaryLOD()`
 *
 * @param {string} elementId
 * @param {AnyRecord} group - Three.Group do boundary (line + plane + label)
 * @param {AnyRecord} data - dados do boundary com `vertices`
 * @param {AnyRecord} element - elemento completo (precisa de meta.label ou name)
 * @returns {LabelObject|null}
 */
export function attachBoundaryLabel(elementId: string, group: AnyRecord, data: AnyRecord, element: AnyRecord) {
    if (!state?.enabled)
        return null;
    const config = state?.categories?.boundaryAuto;
    if (!config?.enabled)
        return null;
    if (!group || !data?.vertices)
        return null;
    if (!element)
        return null;
    try {
        const rawLabel = element.meta?.label || element.label || element.name || '';
        const text = formatLabelText(rawLabel, config.maxLen || DEFAULT_BOUNDARY_LABEL_MAX_LEN);
        if (!text)
            return null;
        const centroid = computeBoundaryCentroid(data.vertices);
        if (!centroid)
            return null;
        const yOffset = typeof config.yOffset === 'number' ? config.yOffset : DEFAULT_BOUNDARY_LABEL_Y_OFFSET_M;
        const pos = buildBoundaryLabelPosition(centroid, yOffset);
        // Chip flat semi-transparente
        const div = document.createElement('div');
        div.className = 'label-3d boundary-label-chip';
        div.textContent = text;
        div.dataset.elementId = elementId;
        // Fade-in: opacity 0 → 1 com CSS transition
        const fadeMs = typeof config.fadeMs === 'number' ? config.fadeMs : DEFAULT_BOUNDARY_LABEL_FADE_MS;
        div.style.opacity = '0';
        div.style.transition = `opacity ${fadeMs}ms ease-out`;
        const labelObj = _createCss2dObject(div);
        labelObj.center.set(0.5, 0.5);
        // Posição local do group (já no mundo, pois boundary é root-level)
        // Compensa escala do parent como demais labels
        const localPos = _toMeshLocalOffset(group, pos.x, pos.y, pos.z);
        labelObj.position.set(localPos.x, localPos.y, localPos.z);
        group.add(labelObj);
        // Trigger fade-in no próximo frame
        requestAnimationFrame(() => {
            div.style.opacity = '1';
        });
        boundaryLabelMap.set(elementId, {
            obj: labelObj,
            centroidWorld: pos,
            threshold: config.maxDistance || DEFAULT_BOUNDARY_LABEL_THRESHOLD_M,
        });
        // Garante que LOD tick está rodando
        _ensureBoundaryLODTicker();
        return labelObj;
    }
    catch (e) {
        console.debug('[labels/manager] attachBoundaryLabel:', _errorMessage(e));
        return null;
    }
}
/**
 * Remove boundary label de um elemento (idempotente).
 * @param {string} elementId
 */
export function detachBoundaryLabel(elementId: string) {
    const entry = boundaryLabelMap.get(elementId);
    if (!entry)
        return;
    _disposeCss2dObject(entry.obj);
    boundaryLabelMap.delete(elementId);
}
/** @type {ReturnType<typeof setInterval>|null} */
let _boundaryLODInterval: any = null;
function _ensureBoundaryLODTicker() {
    if (_boundaryLODInterval !== null)
        return;
    // Tick a 4Hz — boundaries grandes, câmera não muda drasticamente entre frames
    _boundaryLODInterval = setInterval(_tickBoundaryLOD, 250);
}
/**
 * Aplica LOD a todas as boundary labels: opacity 0 (mantém DOM) quando
 * distância câmera→centróide > threshold. Não usa display:none para evitar
 * reflow + manter CSS transitions funcionando.
 */
function _tickBoundaryLOD() {
    if (boundaryLabelMap.size === 0)
        return;
    const cam = (() => {
        try {
            return getCamera();
        }
        catch {
            return null;
        }
    })();
    if (!cam?.position)
        return;
    for (const [, entry] of boundaryLabelMap) {
        const c = entry.centroidWorld;
        const dx = cam.position.x - c.x;
        const dy = cam.position.y - c.y;
        const dz = cam.position.z - c.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const visible = shouldShowBoundaryLabel(dist, entry.threshold);
        const div = entry.obj?.element;
        if (!div)
            continue;
        const target = visible ? '1' : '0';
        if (div.style.opacity !== target)
            div.style.opacity = target;
    }
}
/**
 * Limpa todas as boundary labels e para o LOD ticker. Chamado em
 * clearAllElements + clearAllLabels.
 */
function _disposeAllBoundaryLabels() {
    for (const [, entry] of boundaryLabelMap) {
        _disposeCss2dObject(entry.obj);
    }
    boundaryLabelMap.clear();
    if (_boundaryLODInterval !== null) {
        clearInterval(_boundaryLODInterval);
        _boundaryLODInterval = null;
    }
}
// ----------------------------------------------------------------
// SYNC - (re)constroi todas as labels
// ----------------------------------------------------------------
/**
 * Reconstroi todas as labels a partir do estado atual.
 * Chamado no init e quando config muda.
 */
export function syncLabels() {
    // Remove todas as labels existentes
    _disposeAllLabels();
    if (!state?.enabled)
        return;
    // Labels por elemento
    const elements = getAllElements();
    for (const element of elements) {
        _buildElementLabels(element);
    }
    // Titulo do modelo
    titleLabel = _createModelTitle();
    requestRender();
}
/**
 * Cria labels para um unico elemento.
 * @param {AnyRecord} element
 */
function _buildElementLabels(element: AnyRecord) {
    // Nao criar labels para elementos ocultos (filtro global ou visibilidade manual).
    // CSS2DRenderer nao herda visibilidade do mesh pai - labels precisam ser omitidas aqui.
    if (!isEffectivelyVisible(element.id))
        return;
    const mesh = getMeshByElementId(element.id);
    if (!mesh)
        return;
    const entry = {
        name: _createNameLabel(element, mesh),
        obs: _createObsLabel(element, mesh),
        geo: _createGeoLabels(element, mesh),
        eis: _createEisLabel(element, mesh),
    };
    labelMap.set(element.id, entry);
}
/**
 * Reconstroi labels de um elemento especifico.
 * @param {string} elementId
 */
function _rebuildElementLabels(elementId: string) {
    _disposeElementLabels(elementId);
    if (!state?.enabled)
        return;
    const element = getElementById(elementId);
    if (!element)
        return;
    _buildElementLabels(element);
    requestRender();
}
// ----------------------------------------------------------------
// EVENT HANDLERS - chamados por eventos do element manager
// ----------------------------------------------------------------
/** @param {string} id */
function onElementAdded(id: string) {
    if (!state?.enabled)
        return;
    const element = getElementById(id);
    if (!element)
        return;
    _buildElementLabels(element);
    requestRender();
}
/** @param {string} id */
function onElementRemoved(id: string) {
    _disposeElementLabels(id);
    requestRender();
}
/** @param {string} id */
function onElementUpdated(id: string) {
    _rebuildElementLabels(id);
}
/**
 * Remove todas as labels (chamado em clearAllElements).
 */
export function clearAllLabels() {
    _disposeAllLabels();
    requestRender();
}
// ----------------------------------------------------------------
// LEADER LINE DATA - dados para o renderer desenhar curvas
// ----------------------------------------------------------------
/**
 * Retorna dados de cada label visivel para decluttering e leader lines.
 * Inclui name, obs, e geo labels. Leader lines conectam apenas ao name.
 *
 * @returns {Array<{elementId: string, worldPos: AnyRecord, labelDiv: HTMLElement, extraDivs: HTMLElement[]}>}
 */
export function getVisibleLabelData() {
    const result: any[] = [];
    const _vec = new Three.Vector3();
    for (const [elementId, entry] of labelMap) {
        if (!entry.name)
            continue;
        // Obtem posicao world do mesh do elemento (ponto de ancora da leader line)
        const mesh = getMeshByElementId(elementId);
        if (!mesh)
            continue;
        mesh.getWorldPosition(_vec);
        // Ajusta Y para o topo do mesh
        const topY = _getMeshTopY(mesh);
        const worldPos = new Three.Vector3(_vec.x, _vec.y + topY, _vec.z);
        // Divs extras (obs, geo) que devem herdar a opacidade do name
        /** @type {Array<HTMLElement>} */
        const extraDivs = [];
        if (entry.obs)
            extraDivs.push(entry.obs.element);
        if (entry.geo) {
            for (const g of /** @type {Array<LabelObject>} */ (entry.geo))
                extraDivs.push(g.element);
        }
        const el = getElementById(elementId);
        result.push({
            elementId,
            familyId: el?.family || 'unknown',
            worldPos,
            labelDiv: entry.name.element,
            extraDivs,
        });
    }
    return result;
}
/**
 * Hit-test: verifica se coordenadas de tela estao dentro de algum label visivel.
 * Usado pelo picker para selecionar elementos ao clicar em labels.
 *
 * @param {number} clientX - Coordenada X do evento (event.clientX)
 * @param {number} clientY - Coordenada Y do evento (event.clientY)
 * @returns {string|null} elementId do label atingido, ou null
 */
export function hitTestLabel(clientX: number, clientY: number) {
    const labels = document.querySelectorAll('.label-3d[data-element-id]');
    for (const node of labels) {
        const div = node as HTMLElement;
        const opacity = parseFloat(div.style.opacity);
        if (opacity < 0.1)
            continue;
        const rect = div.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            return div.dataset.elementId || null;
        }
    }
    return null;
}
// ----------------------------------------------------------------
// DISPOSAL
// ----------------------------------------------------------------
/** @param {string} elementId */
function _disposeElementLabels(elementId: string) {
    const entry = labelMap.get(elementId);
    if (entry) {
        if (entry.name)
            _disposeCss2dObject(entry.name);
        if (entry.obs)
            _disposeCss2dObject(entry.obs);
        if (entry.geo) {
            for (const g of /** @type {Array<LabelObject>} */ (entry.geo))
                _disposeCss2dObject(g);
        }
        if (entry.eis)
            _disposeCss2dObject(entry.eis);
        labelMap.delete(elementId);
    }
    // SPEC_BOUNDARY_3D_LABELS_AUTO — também remove auto-label de boundary
    detachBoundaryLabel(elementId);
}
function _disposeAllLabels() {
    for (const [id] of labelMap) {
        _disposeElementLabels(id);
    }
    labelMap.clear();
    if (titleLabel) {
        _disposeCss2dObject(titleLabel);
        titleLabel = null;
    }
    _removeScreenTitleOverlay();
    // SPEC_BOUNDARY_3D_LABELS_AUTO — limpa boundary auto-labels + ticker
    _disposeAllBoundaryLabels();
}
/** @param {LabelObject} obj */
function _disposeCss2dObject(obj: any) {
    if (!obj)
        return;
    if (obj.element && obj.element.parentNode) {
        obj.element.remove();
    }
    if (obj.parent) {
        obj.parent.remove(obj);
    }
}
// ----------------------------------------------------------------
// EXPORT / IMPORT - para serializacao ECO1
// ----------------------------------------------------------------
/**
 * Exporta config de labels para inclusao no modelo.
 * @returns {AnyRecord}
 */
export function exportLabels() {
    return _cloneDeep(state);
}
/**
 * Importa config de labels de um modelo.
 * @param {AnyRecord} data
 */
export function importLabels(data: AnyRecord) {
    if (!data)
        return;
    state = _mergeDefaults(data, DEFAULTS);
    _persist();
    syncLabels();
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * Cria div estilizada para label.
 * @param {string} text
 * @param {string} cssClass
 * @param {AnyRecord} config
 * @param {AnyRecord} [element?]
 * @returns {HTMLDivElement}
 */
function _createLabelDiv(text: string, cssClass: string, config: AnyRecord, element?: AnyRecord) {
    const div = document.createElement('div');
    div.className = `label-3d ${cssClass}`;
    div.textContent = text;
    if (element?.id)
        div.dataset.elementId = element.id;
    // Aplica estilos de config
    if (config.fontSize)
        div.style.fontSize = config.fontSize + 'px';
    if (config.fontFamily)
        div.style.fontFamily = config.fontFamily;
    if (config.background)
        div.style.background = config.background;
    // Cor: 'auto' = derivar da cor do elemento
    if (config.color === 'auto' && element?.color) {
        const hex = typeof element.color === 'number'
            ? '#' + (element.color & 0xffffff).toString(16).padStart(6, '0')
            : element.color;
        div.style.color = hex;
    }
    else if (config.color && config.color !== 'auto') {
        div.style.color = config.color;
    }
    return div;
}
/**
 * @param {HTMLElement} div
 * @returns {LabelObject}
 */
function _createCss2dObject(div: HTMLElement) {
    return /** @type {LabelObject} */ ( /** @type {unknown} */(new _CSS2DObject(div)));
}
/**
 * Calcula o Y do topo do mesh (bounding box).
 * Para meshes sem geometria (sprites), retorna 0.
 * @param {AnyRecord} mesh
 * @returns {number}
 */
function _getMeshTopY(mesh: AnyRecord) {
    try {
        const box = new Three.Box3().setFromObject(mesh);
        if (box.isEmpty())
            return 0;
        // Retorna em coordenadas locais do mesh
        return box.max.y - mesh.position.y;
    }
    catch (e) {
        console.debug('[labels/manager] meshTopY:', _errorMessage(e));
        return 0;
    }
}
/**
 * Retorna escala segura por eixo (fallback 1 para zero/NaN).
 * @param {AnyRecord} mesh
 * @param {string} axis
 * @returns {number}
 */
function _safeScaleAxis(mesh: AnyRecord, axis: string) {
    const raw = Number(mesh?.scale?.[axis]);
    if (!Number.isFinite(raw) || Math.abs(raw) < 1e-6)
        return 1;
    return raw;
}
/**
 * Converte offsets em unidades visuais para coordenadas locais do mesh,
 * compensando a escala do parent para evitar dupla escala em labels CSS2D.
 * @param {AnyRecord} mesh
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{x: number, y: number, z: number}}
 */
function _toMeshLocalOffset(mesh: AnyRecord, x: number, y: number, z: number) {
    const sx = _safeScaleAxis(mesh, 'x');
    const sy = _safeScaleAxis(mesh, 'y');
    const sz = _safeScaleAxis(mesh, 'z');
    return {
        x: x / sx,
        y: y / sy,
        z: z / sz,
    };
}
/**
 * Formata observacao para texto da label.
 * @param {AnyRecord} obs
 * @param {AnyRecord} config
 * @returns {string}
 */
function _formatObservation(obs: AnyRecord, config: AnyRecord) {
    let text = '';
    const val = obs.reading ?? obs.value;
    if (val !== undefined && val !== null) {
        text += typeof val === 'number' ? val.toFixed(3) : String(val);
    }
    else {
        return '';
    }
    if (config.showUnit) {
        const unit = obs.unit || obs.unitId;
        if (unit)
            text += ' ' + unit;
    }
    if (config.showDate && obs.date) {
        text += ' (' + obs.date + ')';
    }
    return text;
}
/**
 * Deep clone simples (JSON-safe)
 * @param {AnyRecord} obj
 * @returns {AnyRecord}
 */
function _cloneDeep(obj: AnyRecord) {
    return _deepCloneCanonical(obj);
}
/**
 * Merge valores salvos sobre defaults (preserva keys novos do default).
 * @param {AnyRecord} saved
 * @param {AnyRecord} defaults
 * @returns {AnyRecord}
 */
function _mergeDefaults(saved: AnyRecord, defaults: AnyRecord) {
    const result = _cloneDeep(defaults);
    if (!saved || typeof saved !== 'object')
        return result;
    for (const key of Object.keys(result)) {
        if (!(key in saved))
            continue;
        if (typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
            result[key] = _mergeDefaults(saved[key], result[key]);
        }
        else {
            result[key] = saved[key];
        }
    }
    return result;
}
/** Persiste config no localStorage */
function _persist() {
    try {
        const data = { ...state, _version: SETTINGS_VERSION };
        safeSetItem(STORAGE_KEY, JSON.stringify(data));
    }
    catch (e) {
        console.warn('[Labels] Failed to persist settings:', _errorMessage(e));
    }
}
/** Debounced sync — evita thrashing em sliders */
function _debouncedSync() {
    if (_syncTimer)
        clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => syncLabels(), 100);
}
//# sourceMappingURL=manager.js.map
