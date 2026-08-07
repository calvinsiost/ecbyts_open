// @ts-check
// Generated from src/app/js/core/symbology/manager.ts by TS-MIGRATION-001. Do not edit manually.
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
   ECBT — Symbology Profiles Manager
   core/symbology/manager.js

   Gerencia perfis de simbologia: sobreposições visuais completas
   (elementos, labels, superfícies, cena) sem alterar dados do modelo.

   ADR: core/symbology/ADR.md
   Spec: docs/SPEC_SYMBOLOGY_PROFILES.md
   Licença: AGPL-3.0-only
   ================================================================ */
import { safeSetItem } from '../../utils/storage/storageMonitor.js';
import { deepClone } from '../../utils/helpers/deepClone.js';
import { showToast } from '../../utils/ui/toast.js';
import { getAllElements } from '../elements/manager.js';
import { getMeshByElementId } from '../elements/manager.js';
import {
    getLabelConfig,
    importLabels,
    resetLabelSettings,
    setLabelCategorySetting,
    setPerElementLabel,
} from '../../utils/labels/manager.js';
import { getAllLayers, getLayerMesh, updateLayer } from '../interpolation/manager.js';
import { applyValueBands } from '../interpolation/surfaceBuilder.js';
import { batchChangeSettings } from '../../utils/vizSettings/manager.js';
import { requestRender } from '../../utils/scene/setup.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
/**
 * @typedef {Record<string, any>} SymbologyProfile
 * @typedef {Record<string, any>} ElementStyle
 * @typedef {Record<string, any>} RuleEntry
 * @typedef {Record<string, any>} SnapshotBase
 * @typedef {{ elements: Map<string, SnapshotBase>, labels: any, surfaces: Map<string, SnapshotBase> }} SnapshotState
 */
// ----------------------------------------------------------------
// CONSTANTES
// ----------------------------------------------------------------
const STORAGE_PROFILES = 'ecbyts-symbology-profiles';
const STORAGE_ACTIVE = 'ecbyts-symbology-active';
const CURRENT_SCHEMA = 1;
const MAX_PROFILE_BYTES = 200 * 1024; // 200 KB
// Chaves de cena permitidas para override por perfil.
const VALID_SCENE_KEYS = new Set([
    'fog',
    'wireframe',
    'shadows',
    'ambientIntensity',
    'directionalIntensity',
    'overlayOpacity',
    'verticalExaggeration',
]);
// ----------------------------------------------------------------
// ESTADO INTERNO
// ----------------------------------------------------------------
/** @type {SymbologyProfile[]} */
let _profiles: any = []; // SymbologyProfile[]
let _activeIndex = -1; // -1 = nenhum perfil ativo
/** @type {SymbologyProfile|null} */
let _draft: any = null; // SymbologyProfile | null
/** @type {SnapshotState|null} */
let _snapshot: any = null; // SnapshotState | null
/** @type {Map<string, Map<string, any>>|null} */
let _obsCache: any = null; // Map<elementId, Map<parameterId, value>>
/** @type {WeakMap<any, any>} */
let _clonedMaterials = new WeakMap(); // Mesh → original Material (GC-safe)
let _clonedMeshes = new Set(); // Set<Mesh> — iterável para dispose
/** @type {null|(() => void)} */
let requestUIRefresh: any = null;
// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
/**
 * Inicializa o módulo: carrega perfis do localStorage e aplica o ativo.
 * Chamado em main.js após initLabels() e initVizSettings().
 */
export function initSymbology() {
    let migratedLegacyBackground = false;
    try {
        const raw = localStorage.getItem(STORAGE_PROFILES) || '';
        if (raw) {
            const parsed = JSON.parse(raw);
            _profiles = Array.isArray(parsed)
                ? parsed
                      .map(_migrate)
                      .map((profile: any) => {
                          const migrated = profile;
                          // Migration guard: scene background must be managed only by vizSettings.
                          if (migrated?.scene && Object.prototype.hasOwnProperty.call(migrated.scene, 'background')) {
                              delete migrated.scene.background;
                              migratedLegacyBackground = true;
                          }
                          return migrated;
                      })
                      .filter(_validateProfile)
                : [];
        }
    } catch (e: any) {
        console.warn('[symbology] Erro ao carregar perfis:', e);
        _profiles = [];
    }
    const storedActive = localStorage.getItem(STORAGE_ACTIVE) || '';
    _activeIndex = storedActive !== null ? parseInt(storedActive, 10) : -1;
    if (isNaN(_activeIndex)) _activeIndex = -1;
    if (_activeIndex >= _profiles.length) _activeIndex = -1;
    if (migratedLegacyBackground) {
        _persist();
        console.debug('[symbology] migrated legacy profile.scene.background fields');
    }
    // Registra listener para mesh substituído (guard contra WeakMap stale)
    window.addEventListener('meshReplaced', _onMeshReplaced);
    if (_activeIndex >= 0 && _profiles[_activeIndex]) {
        // Adia para garantir que cena esteja pronta
        setTimeout(() => {
            if (_activeIndex >= 0 && _profiles[_activeIndex]) {
                _applyToScene(_profiles[_activeIndex]);
                _emitSymbologyChanged(_profiles[_activeIndex]);
            }
        }, 0);
    } else {
        _emitSymbologyChanged(null);
    }
}
// ----------------------------------------------------------------
// CONFIGURAÇÃO
// ----------------------------------------------------------------
/** Injeta callback para atualizar UI após mudança de perfil. */
/** @param {() => void} fn */
export function setSymbologyRequestUIRefresh(fn: any) {
    requestUIRefresh = fn;
}
function requestSymbologyUIRefresh(reason = 'symbology.changed') {
    if (typeof requestUIRefresh !== 'function') return;
    const domains = [
        UI_INVALIDATION_DOMAINS.SYMBOLOGY,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        requestUIRefresh(domain, reason);
    }
}
// ----------------------------------------------------------------
// LEITURA
// ----------------------------------------------------------------
/** @returns {SymbologyProfile[]} cópia do array de perfis */
export function getProfiles() {
    return [..._profiles];
}
/** @returns {SymbologyProfile|null} perfil ativo ou null */
export function getActiveProfile() {
    return _profiles[_activeIndex] ?? null;
}
/** @returns {number} índice ativo (-1 = nenhum) */
export function getActiveIndex() {
    return _activeIndex;
}
// ----------------------------------------------------------------
// CICLO DE PERFIS
// ----------------------------------------------------------------
/**
 * Cicla para o próximo perfil: -1 → 0 → 1 → … → N-1 → -1 → …
 * @returns {SymbologyProfile|null} perfil agora ativo, ou null se "nenhum"
 */
export function cycleProfile() {
    if (_profiles.length === 0) {
        showToast('Nenhum perfil. Use o editor (&#9881;) para criar.', 'info');
        return null;
    }
    const next = ((_activeIndex + 2) % (_profiles.length + 1)) - 1;
    if (next === -1) {
        clearActiveProfile();
        return null;
    }
    applyProfile(next);
    return _profiles[next];
}
// ----------------------------------------------------------------
// CRUD DE PERFIS
// ----------------------------------------------------------------
/**
 * Cria um novo perfil com campos padrão.
 * @param {string} name
 * @returns {SymbologyProfile}
 */
export function createProfile(name: any) {
    const profile = {
        schemaVersion: CURRENT_SCHEMA,
        id: _generateId('sym'),
        name,
        created: Date.now(),
        elements: { byFamily: {}, byElement: {} },
        labels: { categories: {}, perElement: {} },
        surfaces: { byLayer: {} },
        rules: [],
        scene: {},
    };
    _profiles.push(profile);
    _persist();
    return profile;
}
/**
 * Remove um perfil pelo id.
 * Se era o ativo, limpa a cena antes de remover.
 * @param {string} id
 */
export function deleteProfile(id: any) {
    const idx = _profiles.findIndex((p: any) => p.id === id);
    if (idx === -1) return;
    if (idx === _activeIndex) {
        clearActiveProfile();
    } else if (idx < _activeIndex) {
        _activeIndex--;
    }
    _profiles.splice(idx, 1);
    _persist();
}
/**
 * Duplica um perfil.
 * @param {string} id
 * @returns {SymbologyProfile|null}
 */
export function duplicateProfile(id: any) {
    const source = _profiles.find((p: any) => p.id === id);
    if (!source) return null;
    const clone = deepClone(source);
    clone.id = _generateId('sym');
    clone.name = source.name + ' (cópia)';
    clone.created = Date.now();
    _profiles.push(clone);
    _persist();
    return clone;
}
/**
 * Persiste o estado atual de todos os perfis.
 * Usar após modificar objetos retornados por createProfile().
 */
export function saveProfiles() {
    _persist();
}
/**
 * Remove todos os perfis e limpa o estado (usado ao gerar novo modelo).
 * Não dispara evento - chamador é responsável por atualizar UI.
 */
export function resetProfiles() {
    _disposeClonedMaterials();
    _activeIndex = -1;
    _snapshot = null;
    _draft = null;
    _obsCache = null;
    _profiles = [];
    _persist();
    _emitSymbologyChanged(null);
}
/**
 * Renomeia um perfil.
 * @param {string} id
 * @param {string} newName
 */
export function renameProfile(id: any, newName: any) {
    const profile = _profiles.find((p: any) => p.id === id);
    if (!profile) return;
    profile.name = newName;
    _persist();
}
// ----------------------------------------------------------------
// APLICAR / LIMPAR
// ----------------------------------------------------------------
/**
 * Aplica um perfil à cena.
 * @param {number|string} indexOrId - índice ou id do perfil
 */
export function applyProfile(indexOrId: any) {
    const resolved = typeof indexOrId === 'number' ? indexOrId : _profiles.findIndex((p: any) => p.id === indexOrId);
    if (resolved < 0 || !_profiles[resolved]) return;
    _activeIndex = resolved;
    _persist();
    _invalidateObsCache();
    _applyToScene(_profiles[_activeIndex]);
    _emitSymbologyChanged(_profiles[_activeIndex]);
}
/**
 * Remove o perfil ativo e restaura a cena ao estado original.
 */
export function clearActiveProfile() {
    _disposeClonedMaterials();
    if (_snapshot) _restoreSnapshot();
    _activeIndex = -1;
    _snapshot = null;
    _draft = null;
    _obsCache = null;
    _persist();
    requestSymbologyUIRefresh('symbology.cleared');
    _emitSymbologyChanged(null);
}
// ----------------------------------------------------------------
// DRAFT API
// ----------------------------------------------------------------
/**
 * Abre uma cópia de trabalho do perfil para edição no modal.
 * @param {string} profileId
 */
export function openDraft(profileId: any) {
    const profile = _profiles.find((p: any) => p.id === profileId);
    if (!profile) return;
    _draft = deepClone(profile);
}
/** @returns {SymbologyProfile|null} draft atual */
export function getDraft() {
    return _draft;
}
/**
 * Mescla `changes` no draft atual. Não persiste.
 * @param {Partial<SymbologyProfile>} changes
 */
export function updateDraft(changes: any) {
    if (!_draft) return;
    Object.assign(_draft, changes);
}
/**
 * Aplica o draft à cena sem persistir (preview ao vivo).
 */
export function previewDraft() {
    if (!_draft) return;
    _applyToScene(_draft);
}
/**
 * Salva o draft como perfil oficial e persiste.
 */
export function commitDraft() {
    if (!_draft) return;
    const draft = _draft;
    const idx = _profiles.findIndex((p: any) => p.id === draft.id);
    if (idx === -1) return;
    _profiles[idx] = draft;
    _draft = null;
    _persist();
    if (idx === _activeIndex) _applyToScene(_profiles[idx]);
}
/**
 * Descarta o draft sem salvar. Restaura a cena ao estado do perfil persistido.
 */
export function discardDraft() {
    _draft = null;
    if (_activeIndex >= 0) {
        _applyToScene(_profiles[_activeIndex]);
    } else {
        clearActiveProfile();
    }
}
// ----------------------------------------------------------------
// EXPORTAÇÃO / IMPORTAÇÃO ECO1
// ----------------------------------------------------------------
/** @returns {{ profiles: SymbologyProfile[], activeIndex: number }} */
export function getSymbologyForExport() {
    return { profiles: _profiles, activeIndex: _activeIndex };
}
/**
 * Carrega perfis de um ECO1 importado.
 * @param {{ profiles: SymbologyProfile[], activeIndex: number }} data
 */
export function loadSymbologyFromImport(data: any) {
    if (!Array.isArray(data?.profiles)) return;
    _disposeClonedMaterials();
    _snapshot = null;
    _draft = null;
    _obsCache = null;
    _profiles = data.profiles.map(_migrate).filter(_validateProfile);
    _activeIndex = typeof data.activeIndex === 'number' ? data.activeIndex : -1;
    if (_activeIndex >= _profiles.length) _activeIndex = -1;
    _persist();
    if (_activeIndex >= 0 && _profiles[_activeIndex]) {
        _applyToScene(_profiles[_activeIndex]);
        _emitSymbologyChanged(_profiles[_activeIndex]);
    } else {
        _emitSymbologyChanged(null);
    }
}
// ----------------------------------------------------------------
// FUNÇÕES INTERNAS - SNAPSHOT
// ----------------------------------------------------------------
/**
 * Captura snapshot global (labels + superfícies) se ainda não capturado.
 * Elements são capturados lazily por _captureSnapshotForElement().
 */
function _captureSnapshotIfNeeded() {
    if (_snapshot !== null) return;
    _snapshot = {
        elements: new Map(),
        labels: getLabelConfig ? getLabelConfig() : {},
        surfaces: new Map(),
    };
    const snapshot = _snapshot;
    // Superfícies: captura estado atual de todas as layers
    try {
        getAllLayers().forEach((layer: any) => {
            snapshot.surfaces.set(layer.id, {
                colorRamp: layer.colorRamp,
                opacity: layer.opacity,
                wireframe: layer.wireframe,
                visible: layer.visible,
                showContours: layer.showContours,
                showContourLabels: layer.showContourLabels,
                contourDensity: layer.contourDensity,
            });
        });
    } catch (e: any) {
        console.warn('[symbology] Não foi possível capturar snapshot de superfícies:', e);
    }
}
/**
 * Captura estado base de um mesh antes de mutá-lo (lazy, por elemento).
 * Nunca sobrescreve entrada já capturada.
 * @param {any} mesh
 * @param {string} elementId
 */
function _captureSnapshotForElement(mesh: any, elementId: any) {
    if (!_snapshot) return;
    if (_snapshot.elements.has(elementId)) return;
    const child = _firstMeshChild(mesh);
    if (!child) return;
    const mat = child.material;
    _snapshot.elements.set(elementId, {
        baseColor: mat.color ? mat.color.getHex() : 0xffffff,
        baseOpacity: mat.opacity ?? 1,
        baseTransparent: mat.transparent ?? false,
        baseWireframe: mat.wireframe ?? false,
        baseVisible: mesh.visible,
        baseScaleX: mesh.scale.x,
        baseScaleY: mesh.scale.y,
        baseScaleZ: mesh.scale.z,
    });
}
/**
 * Restaura a cena ao estado capturado no snapshot.
 */
function _restoreSnapshot() {
    if (!_snapshot) return;
    // Elementos
    _snapshot.elements.forEach((base: any, elementId: any) => {
        const mesh = getMeshByElementId(elementId);
        if (!mesh) return;
        _applyElementStyleRaw(mesh, base);
    });
    // Labels
    try {
        if (resetLabelSettings) resetLabelSettings();
        if (importLabels && _snapshot.labels) importLabels(_snapshot.labels);
    } catch (e: any) {
        console.warn('[symbology] Erro ao restaurar labels:', e);
    }
    // Superfícies
    _snapshot.surfaces.forEach((base: any, layerId: any) => {
        try {
            updateLayer(layerId, base);
        } catch (e: any) {
            console.warn('[symbology] Erro ao restaurar layer:', layerId, e);
        }
    });
}
// ----------------------------------------------------------------
// FUNÇÕES INTERNAS - APLICAR À CENA
// ----------------------------------------------------------------
/**
 * Aplica um perfil completo à cena 3D.
 * @param {SymbologyProfile} profile
 */
function _applyToScene(profile: any) {
    _captureSnapshotIfNeeded();
    _buildObsCache();
    // 1. ELEMENTOS
    getAllElements().forEach((el: any) => {
        const style = _resolveElementStyle(profile, el);
        if (!style) return;
        const mesh = getMeshByElementId(el.id);
        if (!mesh) return;
        _captureSnapshotForElement(mesh, el.id);
        _applyElementStyleToMesh(mesh, style, el.id);
    });
    // 2. LABELS
    try {
        Object.entries(profile.labels?.categories || {}).forEach(([cat, style]: [string, any]) => {
            // Delegado ao label manager (função setLabelCategorySetting se disponível)
            Object.entries(style).forEach(([key, val]: [string, any]) => {
                setLabelCategorySetting(cat, key, val);
            });
        });
        Object.entries(profile.labels?.perElement || {}).forEach(([id, overrides]: [string, any]) => {
            setPerElementLabel(id, overrides);
        });
    } catch (e: any) {
        console.warn('[symbology] Erro ao aplicar labels:', e);
    }
    // 3. SUPERFÍCIES
    try {
        getAllLayers().forEach((layer: any) => {
            const style = profile.surfaces?.byLayer?.[layer.id];
            if (!style) return;
            const { valueBands, ...layerProps } = style;
            updateLayer(layer.id, layerProps);
            if (valueBands?.length > 0) {
                const mesh = getLayerMesh(layer.id);
                if (mesh) applyValueBands(mesh, valueBands, layer.stats);
            }
        });
    } catch (e: any) {
        console.warn('[symbology] Erro ao aplicar superfícies:', e);
    }
    // 4. CENA (batch - uma única traversal)
    try {
        if (profile.scene && Object.keys(profile.scene).length > 0) {
            batchChangeSettings(profile.scene, VALID_SCENE_KEYS);
        }
    } catch (e: any) {
        console.warn('[symbology] Erro ao aplicar configurações de cena:', e);
    }
    requestRender();
}
// ----------------------------------------------------------------
// FUNÇÕES INTERNAS - RESOLUÇÃO DE ESTILO
// ----------------------------------------------------------------
/**
 * Determina o estilo a aplicar a um elemento.
 * Prioridade: byElement > byFamily > primeira rule com match > null
 * @param {SymbologyProfile} profile
 * @param {any} element
 * @returns {ElementStyle|null}
 */
function _resolveElementStyle(profile: any, element: any) {
    if (!element) return null;
    if (profile.elements?.byElement?.[element.id]) return profile.elements.byElement[element.id];
    if (profile.elements?.byFamily?.[element.family]) return profile.elements.byFamily[element.family];
    const rule = (profile.rules || []).find(
        /** @param {any} rule */
        (r: any) => _matchesRule(element, r),
    );
    if (rule) return rule.style;
    return null;
}
/**
 * Verifica se um elemento satisfaz uma regra.
 * @param {any} rule
 * @param {RuleEntry} rule
 * @returns {boolean}
 */
function _matchesRule(element: any, rule: any) {
    if (!rule?.match) return false;
    if (rule.match.family && rule.match.family !== element.family) return false;
    if (rule.match.parameter) {
        const paramMap = _obsCache?.get(element.id);
        const val = paramMap?.get(rule.match.parameter) ?? null;
        if (val === null) return false;
        if (!_compareOp(val, rule.match.operator, rule.match.value)) return false;
    }
    return true;
}
/**
 * Compara dois valores com um operador.
 * @param {number} a
 * @param {string} op
 * @param {number} b
 * @returns {boolean}
 */
function _compareOp(a: any, op: any, b: any) {
    switch (op) {
        case '>':
            return a > b;
        case '>=':
            return a >= b;
        case '<':
            return a < b;
        case '<=':
            return a <= b;
        case '=':
            return a === b;
        default:
            return false;
    }
}
// ----------------------------------------------------------------
// FUNÇÕES INTERNAS - OBS CACHE
// ----------------------------------------------------------------
/**
 * Pré-computa Map<elementId, Map<parameterId, valor>> a partir das observações.
 * Mantém apenas a observação mais recente por parâmetro (por data ISO).
 */
function _buildObsCache() {
    if (_obsCache !== null) return;
    _obsCache = new Map();
    try {
        getAllElements().forEach((el: any) => {
            const cache = _obsCache;
            if (!cache) return;
            (el.data?.observations || []).forEach(
                /** @param {any} style */
                (obs: any) => {
                    const entry = obs;
                    if (!entry.parameterId) return;
                    const val = entry.value ?? entry.reading ?? null;
                    if (val === null) return;
                    if (!cache.has(el.id)) cache.set(el.id, new Map());
                    const paramMap = cache.get(el.id);
                    if (!paramMap) return;
                    const existing = paramMap.get(entry.parameterId);
                    if (!existing || (entry.date || '') > (existing.date || '')) {
                        paramMap.set(entry.parameterId, { value: val, date: entry.date || '' });
                    }
                },
            );
        });
        // Simplificar: Map<elId, Map<paramId, value>>
        _obsCache.forEach((paramMap: any) => {
            paramMap.forEach((entry: any, paramId: any) => {
                paramMap.set(paramId, entry.value);
            });
        });
    } catch (e: any) {
        console.warn('[symbology] Erro ao construir obs cache:', e);
        _obsCache = new Map();
    }
}
function _invalidateObsCache() {
    _obsCache = null;
}
// ----------------------------------------------------------------
// FUNÇÕES INTERNAS - APLICAR ESTILO A MESH
// ----------------------------------------------------------------
/**
 * Aplica um ElementStyle a um mesh THREE.js.
 * Sempre multiplica a escala a partir dos valores base do snapshot.
 * @param {any} style
 * @param {ElementStyle} style
 * @param {string} style
 */
function _applyElementStyleToMesh(mesh: any, style: any, elementId: any) {
    // Escala: sempre relativa ao baseScale capturado (nunca cumulativa)
    if (style.scaleMultiplier !== undefined) {
        const base = _snapshot?.elements.get(elementId);
        if (base) {
            const s = Math.max(0.1, Math.min(5, style.scaleMultiplier));
            mesh.scale.set(base.baseScaleX * s, base.baseScaleY * s, base.baseScaleZ * s);
            mesh.updateMatrix();
        }
    }
    // Material: clonar antes de mutar se compartilhado
    const needsMutation = style.opacity !== undefined || style.wireframe !== undefined;
    mesh.traverse(
        /** @param {any} base */
        (child: any) => {
            const meshChild = child;
            if (!meshChild.isMesh || !meshChild.material) return;
            if (needsMutation && !_clonedMaterials.has(meshChild)) {
                const original = meshChild.material;
                meshChild.material = original.clone();
                _clonedMaterials.set(meshChild, original);
                _clonedMeshes.add(meshChild);
            }
            if (style.color !== undefined && meshChild.material.color) {
                meshChild.material.color.set(style.color);
            }
            if (style.opacity !== undefined) {
                meshChild.material.transparent = style.opacity < 1;
                meshChild.material.opacity = style.opacity;
                meshChild.material.needsUpdate = true;
            }
            if (style.wireframe !== undefined) {
                meshChild.material.wireframe = !!style.wireframe;
            }
        },
    );
    if (style.visible !== undefined) {
        mesh.visible = !!style.visible;
    }
}
/**
 * Aplica estado bruto do snapshot (restauração).
 * @param {any} base
 * @param {SnapshotBase} base - entrada do snapshot
 */
function _applyElementStyleRaw(mesh: any, base: any) {
    const hexStr = '#' + base.baseColor.toString(16).padStart(6, '0');
    mesh.traverse(
        /** @param {any} child */
        (child: any) => {
            const meshChild = child;
            if (!meshChild.isMesh || !meshChild.material) return;
            if (meshChild.material.color) meshChild.material.color.set(hexStr);
            meshChild.material.transparent = base.baseTransparent;
            meshChild.material.opacity = base.baseOpacity;
            meshChild.material.wireframe = base.baseWireframe;
            meshChild.material.needsUpdate = true;
        },
    );
    mesh.visible = base.baseVisible;
    mesh.scale.set(base.baseScaleX, base.baseScaleY, base.baseScaleZ);
    mesh.updateMatrix();
}
/**
 * Restaura materiais originais e descarta clones.
 */
function _disposeClonedMaterials() {
    _clonedMeshes.forEach((child: any) => {
        const original = _clonedMaterials.get(child);
        if (original && child.material !== original) {
            child.material.dispose();
            child.material = original;
        }
    });
    _clonedMaterials = new WeakMap();
    _clonedMeshes = new Set();
}
// ----------------------------------------------------------------
// FUNÇÕES INTERNAS - PERSISTÊNCIA
// ----------------------------------------------------------------
/**
 * Persiste perfis e índice ativo no localStorage.
 * @returns {boolean} true se persistido com sucesso
 */
function _persist() {
    const json = JSON.stringify(_profiles);
    if (json.length > MAX_PROFILE_BYTES) {
        showToast('Perfis de simbologia excedem o limite de armazenamento (200 KB).', 'warning');
        return false;
    }
    safeSetItem(STORAGE_PROFILES, json);
    safeSetItem(STORAGE_ACTIVE, String(_activeIndex));
    return true;
}
// ----------------------------------------------------------------
// FUNÇÕES INTERNAS - MIGRAÇÃO E VALIDAÇÃO
// ----------------------------------------------------------------
/**
 * Migra um perfil de schema antigo para o atual.
 * @param {SymbologyProfile} profile
 * @returns {SymbologyProfile}
 */
function _migrate(profile: any) {
    if (!profile.schemaVersion || profile.schemaVersion < 1) {
        profile.schemaVersion = 1;
        profile.rules = profile.rules || [];
        profile.scene = profile.scene || {};
        Object.values(profile.surfaces?.byLayer || {}).forEach((s: any) => {
            const surface = s;
            if (!('valueBands' in surface)) surface.valueBands = undefined;
        });
    }
    return profile;
}
/**
 * Valida e sanitiza um perfil. Descarta se inválido.
 * @param {SymbologyProfile} p
 * @returns {boolean}
 */
function _validateProfile(p: any) {
    if (typeof p?.id !== 'string' || !p.id) {
        console.warn('[symbology] Perfil inválido descartado: id ausente', p);
        return false;
    }
    if (typeof p?.name !== 'string') {
        console.warn('[symbology] Perfil inválido descartado: name ausente', p);
        return false;
    }
    p.elements = p.elements || { byFamily: {}, byElement: {} };
    p.labels = p.labels || { categories: {}, perElement: {} };
    p.surfaces = p.surfaces || { byLayer: {} };
    p.rules = Array.isArray(p.rules) ? p.rules : [];
    p.scene = p.scene || {};
    return true;
}
// ----------------------------------------------------------------
// FUNÇÕES INTERNAS - AUXILIARES
// ----------------------------------------------------------------
/**
 * Retorna o primeiro filho THREE.Mesh de um Object3D.
 * @param {any} obj
 * @returns {any|null}
 */
function _firstMeshChild(obj: any) {
    if (!obj) return null;
    if (obj.isMesh) return obj;
    let found: any = null;
    obj.traverse(
        /** @param {any} prefix */
        (child: any) => {
            const meshChild = child;
            if (!found && meshChild.isMesh) found = meshChild;
        },
    );
    return found;
}
/**
 * Gera um ID único.
 * @param {string} prefix
 * @returns {string}
 */
function _generateId(prefix: any) {
    return prefix + '-' + Math.random().toString(36).slice(2, 10);
}
/**
 * Emite evento global de mudança de perfil ativo.
 * @param {SymbologyProfile|null} profile
 */
function _emitSymbologyChanged(profile: any) {
    window.dispatchEvent(
        new CustomEvent('symbologyChanged', {
            detail: { profile, activeIndex: _activeIndex },
        }),
    );
}
/**
 * Handler para evento meshReplaced (guard contra WeakMap stale).
 * @param {Event} event
 */
function _onMeshReplaced(event: any) {
    const { elementId, newMesh } = event.detail;
    if (_activeIndex < 0 || !newMesh) return;
    const el = getAllElements().find((e: any) => e.id === elementId);
    if (!el) return;
    const style = _resolveElementStyle(_profiles[_activeIndex], el);
    if (!style) return;
    // Re-captura snapshot para o novo mesh
    if (_snapshot) {
        _snapshot.elements.delete(elementId);
        _captureSnapshotForElement(newMesh, elementId);
    }
    _applyElementStyleToMesh(newMesh, style, elementId);
}
//# sourceMappingURL=manager.js.map
//# sourceMappingURL=manager.js.map
