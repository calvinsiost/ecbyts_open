// @ts-check
// Generated from src/app/js/utils/vizSettings/manager.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// @ts-check
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
   VIZ SETTINGS MANAGER — Presets, state, scene application
   ================================================================

   Gerencia configuracoes de visualizacao 3D: fog, background, luzes,
   wireframe, sombras, strata, overlay, exagero vertical e clip planes.

   8 presets built-in + presets customizados do usuario.
   Sincroniza estado com a cena Three.js via applySettingsToScene().

   Clip planes podem ser globais (cortam tudo) ou per-element
   (clonando materiais dos elementos selecionados).

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import * as sceneSetup from '../scene/setup.js';
import { generateId } from '../helpers/id.js';
import { getMeshByElementId } from '../../core/elements/manager.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { toFiniteNumber } from '../helpers/toFiniteNumber.js';
const { getScene, getRenderer, getElementsGroup, requestRender, setBloomEnabled, setBloomIntensity, setBacklightEnabled, setBacklightIntensity, } = /** @type {any} */ (sceneSetup);
/** @type {any} */
const THREE_RUNTIME = (THREE) as any;
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-viz-settings';
/**
 * @typedef {{ enabled: boolean, near: number, far: number }} FogSettings
 * @typedef {{ id: string, name: string, enabled: boolean, height: number, angle: number, flip: boolean, scope?: string, elementIds: string[] }} ClipPlaneConfig
 * @typedef {{ name: string, icon: string, fog: FogSettings, background: string, grid: boolean, wireframe: boolean, shadows: boolean, strata: boolean, ambientIntensity: number, directionalIntensity: number, overlayOpacity: number, verticalExaggeration: number, bloomEnabled: boolean, bloomIntensity: number, backlightEnabled: boolean, backlightIntensity: number, clipPlanes: ClipPlaneConfig[], interpolation?: boolean, [key: string]: any }} VizSettings
 * @typedef {{ id: string, name: string, settings: VizSettings }} UserPreset
 * @typedef {{ visible: boolean, collapsed: boolean, activePreset: string, custom: VizSettings, userPresets: UserPreset[] }} VizSettingsState
 * @typedef {{ name?: string, isMesh?: boolean, isSprite?: boolean, isLight?: boolean, isAmbientLight?: boolean, isDirectionalLight?: boolean, isGridHelper?: boolean, material?: any, userData?: Record<string, any>, parent?: any, visible?: boolean, intensity?: number, castShadow?: boolean }} SceneObjectLike
 */
/**
 * Built-in presets - 8 visuais interessantes para modelos ambientais.
 * Cada preset define todos os parametros de renderizacao da cena.
 * @type {Record<string, VizSettings>}
 */
const BUILTIN_PRESETS = {
    default: {
        name: 'Default',
        icon: 'monitor',
        fog: { enabled: false, near: 150, far: 400 },
        background: '#2d2d2d',
        grid: true,
        wireframe: false,
        shadows: true,
        strata: true,
        ambientIntensity: 0.5,
        directionalIntensity: 0.8,
        overlayOpacity: 0.85,
        verticalExaggeration: 1.0,
        bloomEnabled: false,
        bloomIntensity: 0.5,
        backlightEnabled: false,
        backlightIntensity: 0.6,
        clipPlanes: [],
    },
    day: {
        name: 'Day',
        icon: 'sun',
        fog: { enabled: false, near: 300, far: 800 },
        background: '#87CEEB',
        grid: true,
        wireframe: false,
        shadows: true,
        strata: true,
        ambientIntensity: 0.8,
        directionalIntensity: 1.0,
        overlayOpacity: 0.9,
        verticalExaggeration: 1.0,
        bloomEnabled: false,
        bloomIntensity: 0.5,
        backlightEnabled: false,
        backlightIntensity: 0.6,
        clipPlanes: [],
    },
    night: {
        name: 'Night',
        icon: 'moon',
        fog: { enabled: false, near: 80, far: 250 },
        background: '#0a0e14',
        grid: true,
        wireframe: false,
        shadows: true,
        strata: true,
        ambientIntensity: 0.2,
        directionalIntensity: 0.4,
        overlayOpacity: 0.7,
        verticalExaggeration: 1.0,
        bloomEnabled: true,
        bloomIntensity: 0.8,
        backlightEnabled: true,
        backlightIntensity: 0.4,
        clipPlanes: [],
    },
    technical: {
        name: 'Technical',
        icon: 'compass',
        fog: { enabled: false, near: 150, far: 400 },
        background: '#ffffff',
        grid: true,
        wireframe: true,
        shadows: false,
        strata: false,
        ambientIntensity: 1.0,
        directionalIntensity: 0.3,
        overlayOpacity: 0.5,
        verticalExaggeration: 3.0,
        bloomEnabled: false,
        bloomIntensity: 0.5,
        backlightEnabled: false,
        backlightIntensity: 0.6,
        clipPlanes: [],
    },
    presentation: {
        name: 'Presentation',
        icon: 'tv',
        fog: { enabled: false, near: 200, far: 600 },
        background: '#1a2332',
        grid: false,
        wireframe: false,
        shadows: true,
        strata: true,
        ambientIntensity: 0.6,
        directionalIntensity: 0.9,
        overlayOpacity: 0.42,
        verticalExaggeration: 1.5,
        bloomEnabled: true,
        bloomIntensity: 0.6,
        backlightEnabled: true,
        backlightIntensity: 0.3,
        clipPlanes: [],
    },
    xray: {
        name: 'X-Ray',
        icon: 'eye',
        fog: { enabled: false, near: 150, far: 400 },
        background: '#0a0a1a',
        grid: false,
        wireframe: true,
        shadows: false,
        strata: false,
        ambientIntensity: 0.3,
        directionalIntensity: 0.1,
        overlayOpacity: 0.16,
        verticalExaggeration: 1.0,
        bloomEnabled: false,
        bloomIntensity: 0.5,
        backlightEnabled: true,
        backlightIntensity: 1.0,
        clipPlanes: [],
    },
    subsurface: {
        name: 'Subsurface',
        icon: 'layers',
        fog: { enabled: false, near: 100, far: 350 },
        background: '#0d1520',
        grid: true,
        wireframe: false,
        shadows: true,
        strata: true,
        ambientIntensity: 0.4,
        directionalIntensity: 0.6,
        overlayOpacity: 0.24,
        verticalExaggeration: 5.0,
        bloomEnabled: true,
        bloomIntensity: 0.4,
        backlightEnabled: true,
        backlightIntensity: 0.5,
        clipPlanes: [
            {
                id: 'builtin-sub',
                name: 'Subsurface Cut',
                enabled: true,
                height: 0,
                angle: 0,
                flip: false,
                scope: 'all',
                elementIds: [],
            },
        ],
    },
    blueprint: {
        name: 'Blueprint',
        icon: 'file-text',
        fog: { enabled: false, near: 150, far: 400 },
        background: '#1a3a5c',
        grid: true,
        wireframe: true,
        shadows: false,
        strata: false,
        ambientIntensity: 0.9,
        directionalIntensity: 0.2,
        overlayOpacity: 0.4,
        verticalExaggeration: 2.0,
        bloomEnabled: false,
        bloomIntensity: 0.5,
        backlightEnabled: true,
        backlightIntensity: 0.7,
        clipPlanes: [],
    },
};
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
/** @type {any} */
const state: any = {
    visible: false,
    collapsed: false,
    activePreset: 'default',
    custom: _deepCloneSettings(BUILTIN_PRESETS.default),
    userPresets: [],
};
/**
 * Rastreia materiais clonados para clipping per-element.
 * Map<elementId, Map<childMesh, originalMaterial>>
 */
/** @type {Map<string, Map<any, any>>} */
const _clonedMaterialMap = new Map();
/**
 * @param {any} value
 * @returns {string}
 */
function _sanitizeBackground(value: any) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(normalized)) {
        return '#2d2d2d';
    }
    const hex = normalized.length === 4
        ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
        : normalized;
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    const avg = (r + g + b) / 3;
    // Guardrail against near-black backgrounds that reduce viewport readability.
    if (avg <= 28) {
        return '#2d2d2d';
    }
    return hex;
}
/**
 * @param {string} hex
 * @returns {number}
 */
function _brightnessFromHex(hex: any) {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return (r + g + b) / 3;
}
function _enforceReadableBackground() {
    if (!state.custom)
        return;
    const safe = _sanitizeBackground(state.custom.background);
    const isDefaultLike = state.activePreset === 'default' || state.activePreset === 'custom';
    if (isDefaultLike && _brightnessFromHex(safe) < 42) {
        state.custom.background = '#2d2d2d';
        return;
    }
    state.custom.background = safe;
}
// ----------------------------------------------------------------
// DEEP CLONE HELPERS
// ----------------------------------------------------------------
/**
 * Deep clone de um settings object (preserva fog e clipPlanes).
 * @param {VizSettings} s
 * @returns {VizSettings}
 */
function _deepCloneSettings(s: any) {
    return {
        ...s,
        fog: { ...s.fog },
        clipPlanes: (s.clipPlanes || []).map((cp: any) => ({
            ...cp,
            elementIds: [...(cp.elementIds || [])],
        })),
    };
}
/**
 * Migra formato antigo (clipping:{...}) para novo (clipPlanes:[]).
 * @param {VizSettings & { clipping?: any }} custom - O objeto custom que pode ter formato antigo
 */
function _migrateClipping(custom: any) {
    if (custom.clipping && !custom.clipPlanes) {
        const old = custom.clipping;
        custom.clipPlanes = old.enabled
            ? [
                {
                    id: generateId('clip'),
                    name: 'Clip Plane 1',
                    enabled: true,
                    height: old.height || 0,
                    angle: old.angle || 0,
                    flip: !!old.flip,
                    scope: 'all',
                    elementIds: [],
                },
            ]
            : [];
        delete custom.clipping;
    }
    if (!Array.isArray(custom.clipPlanes)) {
        custom.clipPlanes = [];
    }
}
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize viz settings from localStorage.
 * Restaura estado salvo e aplica a cena.
 */
export function initVizSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY) || '';
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                // visible NAO persistido - sempre inicia oculto para evitar confusao UX
                state.visible = false;
                state.collapsed = !!parsed.collapsed;
                state.activePreset = parsed.activePreset || 'default';
                state.userPresets = Array.isArray(parsed.userPresets) ? parsed.userPresets : [];
                if (parsed.custom && typeof parsed.custom === 'object') {
                    state.custom = { ...BUILTIN_PRESETS.default, ...parsed.custom };
                    state.custom.fog = { ...BUILTIN_PRESETS.default.fog, ...(parsed.custom.fog || {}) };
                    // Migrate old blue-tinted backgrounds to neutral gray
                    const _OLD_BG = new Set([
                        '#000',
                        '#000000',
                        '#010101',
                        '#1a1d23',
                        '#0d1117',
                        '#0a1628',
                        '#00020a',
                        '#0d1b2a',
                        '#1a1a2e',
                        '#0a0e14',
                        '#0d1520',
                        '#121a1e',
                        '#18222a',
                        '#1c2830',
                        '#152028',
                    ]);
                    const currentBg = _sanitizeBackground(state.custom.background);
                    if (_OLD_BG.has(currentBg)) {
                        state.custom.background = '#2d2d2d';
                        console.debug('[VizSettings] migrated legacy dark background to #2d2d2d');
                    }
                    else {
                        state.custom.background = currentBg;
                    }
                    _migrateClipping(state.custom);
                    // Deep clone clipPlanes array
                    state.custom.clipPlanes = (state.custom.clipPlanes || []).map(
                    /** @param {ClipPlaneConfig} cp */
                    (cp: any) => ({
                        ...cp,
                        elementIds: [...(cp.elementIds || [])],
                    }));
                }
                _enforceReadableBackground();
            }
        }
    }
    catch (e: any) {
        console.warn('[VizSettings] Failed to restore state:', /** @type {any} */ (e).message);
    }
    // Aplica settings a cena no proximo frame (Three.js precisa estar pronto)
    requestAnimationFrame(() => applySettingsToScene());
}
// ----------------------------------------------------------------
// PERSISTENCE
// ----------------------------------------------------------------
function persist() {
    try {
        safeSetItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch (e: any) {
        console.debug('[vizSettings] persist:', /** @type {any} */ (e)?.message || e);
        // Ignore quota errors
    }
}
// ----------------------------------------------------------------
// GETTERS
// ----------------------------------------------------------------
/**
 * Get current viz settings state.
 * @returns {VizSettingsState}
 */
export function getVizSettingsConfig() {
    return { ...state, custom: _deepCloneSettings(state.custom) };
}
/**
 * Get current active settings (resolved from preset or custom).
 * @returns {VizSettings}
 */
export function getActiveSettings() {
    return _deepCloneSettings(state.custom);
}
/**
 * Get all builtin presets.
 * @returns {Record<string, VizSettings>}
 */
export function getBuiltinPresets() {
    return BUILTIN_PRESETS;
}
/**
 * Get user presets.
 * @returns {UserPreset[]}
 */
export function getUserPresets() {
    return [...state.userPresets];
}
// ----------------------------------------------------------------
// MUTATIONS - Viz Settings
// ----------------------------------------------------------------
/**
 * Show or hide the viz settings bar.
 * @param {boolean} visible
 */
export function setVizSettingsVisible(visible: any) {
    state.visible = !!visible;
    persist();
}
/**
 * Toggle collapsed state of the bar body.
 * @param {boolean} collapsed
 */
export function setVizSettingsCollapsed(collapsed: any) {
    state.collapsed = !!collapsed;
    persist();
}
/**
 * Apply a preset (builtin or user).
 * Copia todos os parametros do preset para o estado custom.
 * @param {string} presetId
 * @returns {boolean}
 */
export function applyPreset(presetId: any) {
    // Tenta builtin primeiro
    const builtin = (BUILTIN_PRESETS as Record<string, any>)[presetId];
    if (builtin) {
        state.custom = _deepCloneSettings(builtin);
        state.activePreset = presetId;
        _enforceReadableBackground();
        persist();
        applySettingsToScene();
        return true;
    }
    // Tenta user preset
    const userPreset = state.userPresets.find(
    /** @param {UserPreset} key */
    (p: any) => p.id === presetId);
    if (userPreset) {
        /** @type {VizSettings} */
        const merged = { ...BUILTIN_PRESETS.default, ...(userPreset as any).settings };
        merged.fog = { ...BUILTIN_PRESETS.default.fog, ...((userPreset as any).settings.fog || {}) };
        _migrateClipping(merged);
        merged.clipPlanes = (merged.clipPlanes || []).map(
        /** @param {ClipPlaneConfig} value */
        (cp: any) => ({
            ...cp,
            elementIds: [...(cp.elementIds || [])],
        }));
        state.custom = merged;
        state.activePreset = presetId;
        _enforceReadableBackground();
        persist();
        applySettingsToScene();
        return true;
    }
    return false;
}
/**
 * Change a single viz setting.
 * Marca activePreset como 'custom' (nao corresponde a nenhum preset).
 * @param {string} key
 * @param {*} value
 * @returns {void}
 */
export function changeSetting(key: any, value: any) {
    if (key === 'fog.enabled') {
        state.custom.fog = { ...state.custom.fog, enabled: !!value };
    }
    else if (key === 'fog.near') {
        state.custom.fog = { ...state.custom.fog, near: Number(value) };
    }
    else if (key === 'fog.far') {
        state.custom.fog = { ...state.custom.fog, far: Number(value) };
    }
    else if (key in state.custom) {
        if (typeof state.custom[key] === 'number') {
            state.custom[key] = Number(value);
        }
        else if (typeof state.custom[key] === 'boolean') {
            state.custom[key] = !!value;
        }
        else {
            state.custom[key] = value;
        }
    }
    state.activePreset = 'custom';
    _enforceReadableBackground();
    persist();
    applySettingsToScene();
}
/**
 * Save current settings as a user preset.
 * @param {string} name
 * @returns {UserPreset} Created preset
 */
export function saveUserPreset(name: any) {
    const id = 'user-' + Date.now();
    const preset = {
        id,
        name,
        settings: _deepCloneSettings(state.custom),
    };
    state.userPresets.push(preset as any);
    state.activePreset = id;
    persist();
    return preset;
}
/**
 * Delete a user preset.
 * @param {string} presetId
 * @returns {void}
 */
export function deleteUserPreset(presetId: any) {
    state.userPresets = state.userPresets.filter(
    /** @param {UserPreset} p */
    (p: any) => p.id !== presetId);
    if (state.activePreset === presetId) {
        state.activePreset = 'custom';
    }
    persist();
}
/**
 * Reset to default preset.
 * @returns {void}
 */
export function resetToDefault() {
    state.custom = _deepCloneSettings(BUILTIN_PRESETS.default);
    state.activePreset = 'default';
    _enforceReadableBackground();
    persist();
    applySettingsToScene();
}
// ----------------------------------------------------------------
// MUTATIONS - Clip Planes CRUD
// ----------------------------------------------------------------
/**
 * Add a new clip plane.
 * @param {Partial<ClipPlaneConfig>} partial - Campos opcionais para override
 * @returns {ClipPlaneConfig} O clip plane criado
 */
export function addClipPlane(partial = {}) {
    const plane = {
        id: generateId('clip'),
        name: `Clip ${state.custom.clipPlanes.length + 1}`,
        enabled: true,
        height: 0,
        angle: 0,
        flip: false,
        scope: 'all',
        elementIds: [],
        ...partial,
    };
    state.custom.clipPlanes.push(plane);
    state.activePreset = 'custom';
    persist();
    applySettingsToScene();
    return plane;
}
/**
 * Update fields on an existing clip plane.
 * @param {string} id
 * @param {Partial<ClipPlaneConfig>} changes
 * @returns {void}
 */
export function updateClipPlane(id: any, changes: any) {
    const plane = state.custom.clipPlanes.find(
    /** @param {ClipPlaneConfig} id */
    (p: any) => p.id === id);
    if (!plane)
        return;
    Object.assign(plane, changes);
    state.activePreset = 'custom';
    persist();
    applySettingsToScene();
}
/**
 * Remove a clip plane by id.
 * @param {string} id
 * @returns {void}
 */
export function removeClipPlane(id: any) {
    state.custom.clipPlanes = state.custom.clipPlanes.filter(
    /** @param {ClipPlaneConfig} id */
    (p: any) => p.id !== id);
    state.activePreset = 'custom';
    persist();
    applySettingsToScene();
}
/**
 * Duplicate a clip plane.
 * @param {string} id
 * @returns {ClipPlaneConfig|null} O clone ou null se nao encontrou
 */
export function duplicateClipPlane(id: any) {
    const src = state.custom.clipPlanes.find(
    /** @param {ClipPlaneConfig} elementId */
    (p: any) => p.id === id);
    if (!src)
        return null;
    const clone = {
        ...src,
        id: generateId('clip'),
        name: src.name + ' (copy)',
        elementIds: [...src.elementIds],
    };
    state.custom.clipPlanes.push(clone);
    state.activePreset = 'custom';
    persist();
    applySettingsToScene();
    return clone;
}
/**
 * Remove um element ID de todos os clip planes.
 * Chamado quando um elemento e removido do modelo.
 * @param {string} elementId
 * @returns {void}
 */
export function onElementRemoved(elementId: any) {
    let changed = false;
    for (const plane of state.custom.clipPlanes) {
        const idx = plane.elementIds.indexOf(elementId);
        if (idx !== -1) {
            plane.elementIds.splice(idx, 1);
            changed = true;
        }
    }
    if (changed) {
        persist();
        applySettingsToScene();
    }
}
// ----------------------------------------------------------------
// SCENE APPLICATION
// ----------------------------------------------------------------
/**
 * Converte um clip plane config em THREE.Plane.
 * @param {ClipPlaneConfig} cp - { height, angle, flip }
 * @returns {any}
 */
function _buildThreePlane(cp: any) {
    const rad = ((cp.angle || 0) * Math.PI) / 180;
    const nx = Math.sin(rad);
    const nz = -Math.cos(rad);
    const sign = cp.flip ? -1 : 1;
    return new THREE_RUNTIME.Plane(new THREE_RUNTIME.Vector3(nx * sign, 0, nz * sign), cp.height);
}
/**
 * Restaura materiais originais de todos os elementos com clipping per-element.
 * Dispoe os clones para evitar memory leak.
 */
function _restoreAllClonedMaterials() {
    for (const [, originals] of _clonedMaterialMap) {
        for (const [child, original] of originals) {
            if (Array.isArray(child.material)) {
                child.material.forEach(
                /** @param {any} perElementMap */
                (m: any) => m.dispose());
            }
            else if (child.material) {
                child.material.dispose();
            }
            child.material = original;
        }
    }
    _clonedMaterialMap.clear();
}
/**
 * Aplica clipping planes per-element via clone de material.
 * @param {Map<string, any[]>} perElementMap - elementId → [THREE.Plane]
 */
function _applyPerElementClipping(perElementMap: any) {
    // Restaura todos os clones anteriores
    _restoreAllClonedMaterials();
    for (const [elementId, planes] of perElementMap) {
        const mesh = getMeshByElementId(elementId);
        if (!mesh)
            continue;
        /** @type {Map<any, any>} */
        const originals = new Map();
        mesh.traverse(
        /** @param {any} child */
        (child: any) => {
            const meshChild = (child) as any;
            if (!meshChild.isMesh || !meshChild.material)
                return;
            if (Array.isArray(meshChild.material)) {
                originals.set(meshChild, [...meshChild.material]);
                meshChild.material = meshChild.material.map(
                /** @param {any} m */
                (m: any) => {
                    const c = m.clone();
                    c.clippingPlanes = planes;
                    return c;
                });
            }
            else {
                originals.set(meshChild, meshChild.material);
                const c = meshChild.material.clone();
                c.clippingPlanes = planes;
                meshChild.material = c;
            }
        });
        _clonedMaterialMap.set(elementId, originals);
    }
}
function _applyBackground(scene: any, s: any): any {
    const safeBackground = _sanitizeBackground(s.background);
    if (safeBackground !== s.background) {
        state.custom.background = safeBackground;
    }
    const bgColor = new THREE_RUNTIME.Color(safeBackground);
    scene.background = bgColor;
    return bgColor;
}

function _applyFog(scene: any, s: any, bgColor: any): void {
    if (s.fog.enabled) {
        scene.fog = new THREE_RUNTIME.Fog(bgColor, s.fog.near, s.fog.far);
    }
    else {
        scene.fog = null;
    }
}

function _applyLights(scene: any, s: any): void {
    scene.traverse(
    /** @param {any} obj */
    (obj: any) => {
        if (obj.isLight) {
            if (obj.name === 'ambientLight' || obj.isAmbientLight) {
                obj.intensity = s.ambientIntensity;
            }
            else if (obj.name === 'mainLight' || (obj.isDirectionalLight && obj.castShadow)) {
                obj.intensity = s.directionalIntensity;
            }
        }
    });
}

function _applyShadows(renderer: any, s: any): void {
    if (renderer) {
        renderer.shadowMap.enabled = s.shadows;
        if (renderer.shadowMap.needsUpdate !== undefined) {
            renderer.shadowMap.needsUpdate = true;
        }
    }
}

function _applyVisibilityGroups(scene: any, s: any): void {
    scene.traverse(
    /** @param {any} obj */
    (obj: any) => {
        if (obj.isGridHelper || obj.name === 'grid') {
            obj.visible = s.grid;
        }
        else if (obj.name === 'strata' || obj.name === 'strataGroup' || obj.name === 'stratum') {
            obj.visible = s.strata;
        }
        else if (obj.name === 'interpolationSurfaces') {
            obj.visible = s.interpolation !== false; // default visible
        }
    });
}

function _buildClipPlaneLists(s: any): { globalPlanes: any[]; perElementMap: Map<string, any[]> } {
    const clipPlanes = s.clipPlanes || [];
    /** @type {any[]} */
    const globalPlanes: any[] = [];
    /** @type {Map<string, any[]>} */
    const perElementMap = new Map<string, any[]>();
    for (const cp of clipPlanes) {
        if (!cp.enabled)
            continue;
        const threePlane = _buildThreePlane(cp);
        if (cp.scope === 'all' || !cp.scope) {
            globalPlanes.push(threePlane);
        }
        else if (cp.scope === 'elements' && cp.elementIds && cp.elementIds.length > 0) {
            for (const elId of cp.elementIds) {
                if (!perElementMap.has(elId))
                    perElementMap.set(elId, []);
                perElementMap.get(elId)?.push(threePlane);
            }
        }
    }
    return { globalPlanes, perElementMap };
}

function _applyWireframeAndOpacity(elementsGroup: any, s: any): void {
    if (!elementsGroup)
        return;
    elementsGroup.traverse(
    /** @param {any} obj */
    (obj: any) => {
        if (obj.isMesh && !obj.isSprite) {
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(
                    /** @param {any} mat */
                    (mat: any) => {
                        mat.wireframe = s.wireframe;
                    });
                }
                else {
                    obj.material.wireframe = s.wireframe;
                }
            }
            const elId = obj.userData?.elementId || obj.parent?.userData?.elementId;
            if (elId && obj.material && obj.material.map && obj.userData?.isOverlay) {
                obj.material.opacity = s.overlayOpacity;
            }
        }
    });
}

function _applyVerticalExaggeration(elementsGroup: any, s: any): void {
    if (elementsGroup) {
        elementsGroup.scale.y = s.verticalExaggeration;
    }
}

function _applyBloomBacklight(s: any): void {
    setBloomEnabled(!!s.bloomEnabled);
    setBloomIntensity(toFiniteNumber(s.bloomIntensity, 0.5));
    setBacklightEnabled(!!s.backlightEnabled);
    setBacklightIntensity(toFiniteNumber(s.backlightIntensity, 0.6));
}

/**
 * Apply current settings to the Three.js scene.
 * Sincroniza todas as propriedades visuais com o estado atual.
 */
export function applySettingsToScene() {
    const scene = getScene();
    const renderer = getRenderer();
    const elementsGroup = getElementsGroup();
    if (!scene)
        return;
    const s = state.custom;
    const bgColor = _applyBackground(scene, s);
    _applyFog(scene, s, bgColor);
    _applyLights(scene, s);
    _applyShadows(renderer, s);
    _applyVisibilityGroups(scene, s);
    const { globalPlanes, perElementMap } = _buildClipPlaneLists(s);
    if (renderer) {
        renderer.clippingPlanes = globalPlanes;
    }
    _applyPerElementClipping(perElementMap);
    _applyWireframeAndOpacity(elementsGroup, s);
    _applyVerticalExaggeration(elementsGroup, s);
    _applyBloomBacklight(s);
    // Dispatch event para outros modulos reagirem
    window.dispatchEvent(new CustomEvent('vizSettingsChanged'));
    requestRender();
}
// ----------------------------------------------------------------
// EXPORT/IMPORT (model persistence)
// ----------------------------------------------------------------
/**
 * Export viz settings state for model save.
 * @returns {{ activePreset: string, custom: VizSettings, userPresets: UserPreset[] }}
 */
export function exportVizSettings() {
    const userPresets = state.userPresets.map(
    /** @param {UserPreset} data */
    (p: any) => ({
        ...p,
        settings: _deepCloneSettings(p.settings),
    }));
    return {
        activePreset: state.activePreset,
        custom: _deepCloneSettings(state.custom),
        userPresets,
    };
}
/**
 * Import viz settings from model load.
 * @param {{ activePreset?: string, custom?: Partial<VizSettings>, userPresets?: UserPreset[] }} data
 * @returns {void}
 */
export function importVizSettings(data: any) {
    if (data && typeof data === 'object') {
        state.activePreset = data.activePreset || 'default';
        if (data.custom) {
            state.custom = { ...BUILTIN_PRESETS.default, ...data.custom };
            state.custom.fog = { ...BUILTIN_PRESETS.default.fog, ...(data.custom.fog || {}) };
            _migrateClipping(state.custom);
            state.custom.clipPlanes = (state.custom.clipPlanes || []).map(
            /** @param {ClipPlaneConfig} validKeys */
            (cp: any) => ({
                ...cp,
                elementIds: [...(cp.elementIds || [])],
            }));
        }
        state.userPresets = Array.isArray(data.userPresets) ? data.userPresets : [];
        _enforceReadableBackground();
        persist();
        applySettingsToScene();
    }
}
/**
 * Aplica múltiplas configurações em uma única traversal da cena.
 * Usado pelo módulo de simbologia para substituir configurações de cena.
 *
 * @param {Record<string, any>} validKeys - propriedades a aplicar
 * @param {Set<string>} [validKeys] - se fornecido, chaves ausentes são ignoradas
 * @returns {void}
 */
export function batchChangeSettings(changes: any, validKeys: any) {
    const filtered = validKeys
        ? Object.fromEntries(Object.entries(changes).filter(([k]) => validKeys.has(k)))
        : changes;
    Object.assign(state.custom, filtered);
    state.activePreset = 'custom';
    _enforceReadableBackground();
    // NÃO persistir: profile overrides (background, fog, wireframe, shadows, luz, exaggeration)
    // são session-only. F5 limpa → default #2d2d2d prevalece.
    // Mudanças manuais via changeSetting() continuam persistindo separadamente.
    // Ver docs: CLAUDE.md "Fase 8: Fix Background Override no Boot (F5)".
    applySettingsToScene();
}
