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
   GERENCIADOR DE ELEMENTOS
   ================================================================

   Este modulo gerencia os elementos do modelo hidrogeologico.

   ELEMENTO = OBJETO NO MODELO
   Cada elemento tem:
   - family: tipo (pluma, poco, marcador, etc)
   - id: identificador unico
   - name: nome de exibicao
   - visible: se esta visivel na cena
   - data: dados especificos do tipo

   FUNCIONALIDADES:
   - Adicionar/remover elementos
   - Mostrar/esconder elementos
   - Sincronizar com a cena 3D
   - Listar e filtrar elementos

   ================================================================ */
import { createMesh, disposeMesh } from './meshFactory.js';
import { getFamily, getFamilyName } from './families.js';
import {
    defaultHierarchy as _defaultHierarchyPure,
    normalizeHierarchy as _normalizeHierarchyPure,
    isContainerFamily as _isContainerFamilyPure,
    generateDefaultMeta as _generateDefaultMetaPure,
    createObservationBase as _createObservationBasePure,
} from './_elementsHierarchyPure.js';
import {
    getAncestorsPure,
    getDescendantsPure,
    buildElementTreePure,
} from './_elementsTreePure.js';
import { nextElementCounter, bumpElementCounter, resetElementCounter, getElementCounter } from './state.js';
import { getElementsGroup, requestRender } from '../../utils/scene/setup.js';
import { getCurrentLanguage } from '../../utils/i18n/translations.js';
import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';
/** @typedef {Record<string, any>} AnyRecord */
type AnyRecord = Record<string, any>;
// ----------------------------------------------------------------
// ESTADO DO MODULO
// ----------------------------------------------------------------
/**
 * Lista de todos os elementos do modelo.
 * Array de objetos com dados de cada elemento.
 */
let elements: AnyRecord[] = [];
/**
 * Mapa de lookup rapido (id -> elemento).
 * Mantido em sincronia com o array elements para O(1) getElementById.
 */
/** @type {Map<string, AnyRecord>} */
const elementMap = new Map();
/**
 * Contador para gerar IDs unicos — extraido para ./state.js (leaf) para
 * quebrar o ciclo manager↔randomModel. Re-exportado abaixo p/ API publica.
 */
/**
 * ID do elemento selecionado na UI.
 */
let selectedElementId: string | null = null;
/**
 * Mapa de meshes (ID -> mesh 3D).
 * Relaciona elementos aos seus objetos 3D na cena.
 */
const meshMap = new Map<string, any>();
/**
 * Cache de visibilidade efetiva (id -> boolean).
 * Invalida quando visible/hierarchy muda.
 */
const _effectiveVisibilityCache = new Map<string, boolean>();
let _effectiveVisibilityDirty = true;
// ----------------------------------------------------------------
// FUNCOES DE ACESSO
// ----------------------------------------------------------------
/**
 * Retorna todos os elementos.
 *
 * @returns {AnyRecord[]} - Array de elementos
 */
export function getAllElements() {
    return elements;
}
/**
 * Retorna elemento selecionado.
 *
 * @returns {AnyRecord|null}
 */
export function getSelectedElement() {
    return selectedElementId ? elementMap.get(selectedElementId) || null : null;
}
/**
 * Define elemento selecionado.
 *
 * @param {string|null} id - ID do elemento
 */
export function setSelectedElement(id: string | null) {
    selectedElementId = id;
}
/**
 * Retorna elemento pelo ID.
 *
 * @param {string} id - ID do elemento
 * @returns {AnyRecord|undefined} - Elemento ou undefined
 */
export function getElementById(id: string) {
    return elementMap.get(id);
}
/**
 * Retorna e incrementa o contador de elementos.
 * Usado internamente pelo randomModel para gerar IDs unicos.
 * @returns {number} Proximo valor do contador
 */
export { nextElementCounter };
/**
 * Retorna elementos de uma familia especifica.
 *
 * @param {string} familyId - ID da familia
 * @returns {AnyRecord[]} - Elementos da familia
 */
export function getElementsByFamily(familyId: string) {
    return elements.filter((e) => e.family === familyId);
}
/**
 * Conta elementos por familia.
 *
 * @returns {Record<string, number>} - Contagem {familyId: count}
 */
export function countByFamily() {
    const counts: Record<string, number> = {};
    elements.forEach((e: AnyRecord) => {
        counts[e.family] = (counts[e.family] || 0) + 1;
    });
    return counts;
}
/**
 * Retorna total de elementos.
 *
 * @returns {number} - Quantidade de elementos
 */
export function getElementCount() {
    return elements.length;
}
/**
 * Retorna mesh 3D de um elemento pelo ID.
 *
 * @param {string} id - ID do elemento
 * @returns {any|null} - Mesh 3D ou null
 */
export function getMeshByElementId(id: string) {
    return meshMap.get(id) || null;
}
/**
 * Rebind all known element meshes to the active scene group.
 * Re-vincula meshes criados antes do initScene() ao elementsGroup atual.
 * Idempotente: meshes já vinculados ao grupo são ignorados.
 *
 * @returns {{ totalMeshes: number, attached: number, alreadyAttached: number, skipped: number, hasGroup: boolean }}
 */
export function rebindMeshesToScene() {
    const elementsGroup = getElementsGroup();
    if (!elementsGroup) {
        return {
            totalMeshes: meshMap.size,
            attached: 0,
            alreadyAttached: 0,
            skipped: meshMap.size,
            hasGroup: false,
        };
    }
    let attached = 0;
    let alreadyAttached = 0;
    let skipped = 0;
    for (const mesh of meshMap.values()) {
        if (!mesh || typeof mesh !== 'object') {
            skipped++;
            continue;
        }
        if (mesh.parent === elementsGroup) {
            alreadyAttached++;
            continue;
        }
        try {
            if (mesh.parent && typeof mesh.parent.remove === 'function') {
                mesh.parent.remove(mesh);
            }
            elementsGroup.add(mesh);
            attached++;
        } catch {
            skipped++;
        }
    }
    if (attached > 0) requestRender();
    return {
        totalMeshes: meshMap.size,
        attached,
        alreadyAttached,
        skipped,
        hasGroup: true,
    };
}
/**
 * Retorna filhos diretos de um parent.
 *
 * @param {string|null} parentId
 * @returns {AnyRecord[]}
 */
export function getElementsByParent(parentId: string | null) {
    return elements
        .filter((e) => (e.hierarchy?.parentId ?? null) === (parentId ?? null))
        .sort((a, b) => (a.hierarchy?.order ?? 0) - (b.hierarchy?.order ?? 0));
}
/**
 * Retorna ancestrais de um elemento (pai imediato -> raiz).
 *
 * @param {string} elementId
 * @returns {AnyRecord[]}
 */
export function getAncestors(elementId: string) {
    return getAncestorsPure(elementId, getElementById);
}
/**
 * Retorna descendentes de um elemento.
 *
 * @param {string} elementId
 * @returns {AnyRecord[]}
 */
export function getDescendants(elementId: string) {
    return getDescendantsPure(elementId, getElementsByParent);
}
/**
 * Retorna arvore completa de elementos (roots + children recursivo).
 *
 * @returns {Array<{ element: AnyRecord, children: any[] }>}
 */
export function getElementTree() {
    return buildElementTreePure(getElementsByParent);
}
/**
 * Define parent de um elemento, validando ciclo e parent container.
 *
 * @param {string} elementId
 * @param {string|null} parentId
 * @returns {boolean}
 */
export function setParent(elementId: string, parentId: string | null) {
    const element = getElementById(elementId);
    if (!element) return false;
    if (parentId === elementId) return false;
    if (parentId != null) {
        const parent = getElementById(parentId);
        if (!parent) return false;
        if (!_isContainerFamily(parent.family)) return false;
        // Valida ciclo: parent nao pode ser descendente do proprio elemento
        const descendants = getDescendants(elementId);
        if (descendants.some((d) => d.id === parentId)) return false;
    }
    element.hierarchy = element.hierarchy || _defaultHierarchy(0);
    element.hierarchy.parentId = parentId ?? null;
    _normalizeSiblingOrder(parentId ?? null);
    _invalidateEffectiveVisibility();
    _syncEffectiveVisibilityForSubtree(elementId);
    window.dispatchEvent(new CustomEvent('ecbt:elementUpdated', { detail: { id: elementId } }));
    return true;
}
/**
 * Move elemento para novo parent/ordem.
 *
 * @param {string} elementId
 * @param {string|null} parentId
 * @param {number} order
 * @returns {boolean}
 */
export function moveElement(elementId: string, parentId: string | null, order: number) {
    const ok = setParent(elementId, parentId ?? null);
    if (!ok) return false;
    const element = getElementById(elementId);
    if (!element) return false;
    element.hierarchy.order = Number.isFinite(order) ? Math.max(0, order) : 0;
    _normalizeSiblingOrder(parentId ?? null);
    _invalidateEffectiveVisibility();
    _syncEffectiveVisibilityForSubtree(elementId);
    return true;
}
/**
 * Visibilidade efetiva: visible local && todos ancestrais visiveis.
 *
 * @param {string} elementId
 * @returns {boolean}
 */
export function isEffectivelyVisible(elementId: string) {
    if (_effectiveVisibilityDirty) {
        _effectiveVisibilityCache.clear();
        _effectiveVisibilityDirty = false;
    }
    if (_effectiveVisibilityCache.has(elementId)) {
        return _effectiveVisibilityCache.get(elementId) === true;
    }
    const element = getElementById(elementId);
    if (!element) return false;
    if (element.visible === false) {
        _effectiveVisibilityCache.set(elementId, false);
        return false;
    }
    const seen = new Set([elementId]);
    let pid = element.hierarchy?.parentId ?? null;
    while (pid) {
        if (seen.has(pid)) {
            _effectiveVisibilityCache.set(elementId, false);
            return false;
        }
        seen.add(pid);
        const parent = getElementById(pid);
        if (!parent) break;
        if (parent.visible === false) {
            _effectiveVisibilityCache.set(elementId, false);
            return false;
        }
        pid = parent.hierarchy?.parentId ?? null;
    }
    _effectiveVisibilityCache.set(elementId, true);
    return true;
}
// ----------------------------------------------------------------
// FUNCOES DE ADICAO
// ----------------------------------------------------------------
/**
 * Adiciona um elemento ao modelo.
 *
 * @param {string} obj - ID da familia
 * @param {string} id - ID unico do elemento
 * @param {string} name - Nome de exibicao
 * @param {Object} data - Dados especificos do elemento
 * @returns {Object} - Elemento criado
 *
 * PROCESSO:
 * 1. Cria registro do elemento
 * 2. Cria mesh 3D correspondente
 * 3. Adiciona mesh a cena
 * 4. Registra no mapa de meshes
 */
/**
 * ECBT01: Congela matrixAutoUpdate recursivamente (Groups + children).
 * Calcula a matriz final e desabilita re-calculo automatico por frame.
 */
function _freezeMatrix(obj: any) {
    obj.updateMatrix();
    obj.matrixAutoUpdate = false;
    if (obj.children) {
        for (const child of obj.children) _freezeMatrix(child);
    }
}
/**
 * Adiciona elementos em batch com chunking via requestAnimationFrame.
 *
 * Resolve crash/freeze em imports massivos (5573 polygons IBGE travavam
 * main thread por ~30s sincronamente). Cada chunk roda em uma rAF
 * separada — UI fica responsiva, sem crash.
 *
 * @param {Array<{family: string, id?: string, name?: string, data: any, meta?: any}>} items
 * @param {{ chunkSize?: number, onProgress?: (progress: { done: number, total: number, percent: number }) => void, silentEvents?: boolean }} [options]
 * @returns {Promise<{ added: number, errors: number, errorDetails: Array<{ id: string, message: string }> }>}
 */
function setBatchSilentFlag(silent: boolean): boolean {
    const w = window as any;
    const prevSilent = w.__ecbtBatchSilent;
    if (silent) w.__ecbtBatchSilent = true;
    return prevSilent;
}

function restoreBatchSilentFlag(prevSilent: boolean) {
    const w = window as any;
    w.__ecbtBatchSilent = prevSilent;
}

function reportBatchProgress(
    onProgress: ((progress: { done: number; total: number; percent: number }) => void) | undefined,
    done: number,
    total: number,
) {
    if (onProgress) {
        onProgress({
            done,
            total,
            percent: Math.min(100, Math.round((done / total) * 100)),
        });
    }
}

function yieldToBrowser() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function dispatchBatchAdded(added: number, errors: number) {
    window.dispatchEvent(new CustomEvent('ecbt:elementsBatchAdded', { detail: { count: added, errors } }));
    window.dispatchEvent(new CustomEvent('elementsBatchAdded', { detail: { count: added, errors } }));
}

function processBatchChunk(
    chunk: Array<{ family: string; id?: string; name?: string; data: any; meta?: any }>,
    startIndex: number,
): { added: number; errors: number; errorDetails: Array<{ id: string; message: string }> } {
    let added = 0;
    let errors = 0;
    const errorDetails: Array<{ id: string; message: string }> = [];
    for (let k = 0; k < chunk.length; k++) {
        const item = chunk[k];
        if (item === undefined) continue;
        try {
            addElement(item.family, item.id, item.name, item.data, item.meta || {});
            added++;
        } catch (err: any) {
            errors++;
            errorDetails.push({
                id: item.id || `idx-${startIndex + k}`,
                message: err?.message || String(err),
            });
        }
    }
    return { added, errors, errorDetails };
}

export async function addElementsBatch(
    items: Array<{ family: string; id?: string; name?: string; data: any; meta?: any }>,
    options: { chunkSize?: number; onProgress?: (progress: { done: number; total: number; percent: number }) => void; silentEvents?: boolean } = {},
) {
    const { chunkSize = 100, onProgress, silentEvents = true } = options;
    if (!Array.isArray(items) || items.length === 0) {
        return { added: 0, errors: 0, errorDetails: [] };
    }
    let added = 0;
    let errors = 0;
    const errorDetails: Array<{ id: string; message: string }> = [];
    const total = items.length;
    const prevSilent = setBatchSilentFlag(silentEvents);
    try {
        for (let i = 0; i < total; i += chunkSize) {
            const chunk = items.slice(i, i + chunkSize);
            const result = processBatchChunk(chunk, i);
            added += result.added;
            errors += result.errors;
            errorDetails.push(...result.errorDetails);
            reportBatchProgress(onProgress, Math.min(i + chunkSize, total), total);
            await yieldToBrowser();
        }
    } finally {
        restoreBatchSilentFlag(prevSilent);
    }
    if (silentEvents && added > 0) {
        dispatchBatchAdded(added, errors);
    }
    return { added, errors, errorDetails };
}
function buildElementRecord(
    family: string,
    elementId: string,
    name: string | undefined,
    data: any,
    meta: AnyRecord,
) {
    return {
        family,
        id: elementId,
        name,
        visible: true,
        iconClass: meta.iconClass || '',
        color: meta.color || '',
        description: meta.description || '',
        label: meta.label || name,
        labels: meta.labels && typeof meta.labels === 'object' ? { ...meta.labels } : {},
        autoLabel: meta.autoLabel === true,
        data,
        stamps: Array.isArray(meta.stamps) ? meta.stamps : Array.isArray(data?.stamps) ? data.stamps : [],
        messages: Array.isArray(meta.messages) ? meta.messages : [],
        hierarchy: _normalizeHierarchy(meta.hierarchy, family, null),
    };
}

function createAndAttachMesh(element: AnyRecord, family: string, elementId: string) {
    const NON_SPATIAL = new Set(['intangible', 'generic', 'post']);
    const familyDef = (getFamily(family) || {}) as AnyRecord;
    if (familyDef.isContainer || NON_SPATIAL.has(family)) return;
    const mesh = createMesh(element);
    if (!mesh) return;
    mesh.userData.elementId = elementId;
    // ECBT01: Congela matriz de transformacao (CPU optimization)
    // Meshes sao estaticos apos criacao; updateMatrix() chamado manualmente quando movidos
    _freezeMatrix(mesh);
    const elementsGroup = getElementsGroup();
    if (elementsGroup) {
        elementsGroup.add(mesh);
    }
    meshMap.set(elementId, mesh);
}

function dispatchElementAdded(elementId: string) {
    if (!(window as any).__ecbtBatchSilent) {
        window.dispatchEvent(new CustomEvent('ecbt:elementAdded', { detail: { id: elementId } }));
        window.dispatchEvent(new CustomEvent('elementAdded', { detail: { id: elementId } }));
    }
}

export function addElement(family: string, id: string | undefined, name: string | undefined, data: any, meta: AnyRecord = {}) {
    const elementId = id || `${family}-${nextElementCounter()}`;
    const element = buildElementRecord(family, elementId, name, data, meta);
    elements.push(element);
    elementMap.set(elementId, element);
    createAndAttachMesh(element, family, elementId);
    _normalizeSiblingOrder(element.hierarchy.parentId);
    _invalidateEffectiveVisibility();
    _syncEffectiveVisibilityForSubtree(elementId);
    requestRender();
    dispatchElementAdded(elementId);
    return element;
}
/**
 * Adiciona um novo elemento de uma familia especifica.
 * Gera ID e nome automaticamente.
 *
 * @param {string} familyId - ID da familia
 * @returns {Object|null} - Elemento criado ou null se falhou
 *
 * EXEMPLO:
 *   const element = addNewElement('plume');
 *   // Cria elemento com ID 'plume-1' e nome 'Contamination Plume 1'
 */
export function addNewElement(familyId: string) {
    const family = getFamily(familyId);
    if (!family) {
        console.warn(`Familia nao encontrada: ${familyId}`);
        return null;
    }
    // Incrementa contador para ID unico (bump = ++elementCounter, byte-idêntico)
    const _ec = bumpElementCounter();
    // Gera ID e nome
    const id = `${familyId}-${_ec}`;
    const name = `${getFamilyName(family)} ${_ec}`;
    // Gera dados default baseado no tipo
    const data = generateDefaultData(familyId);
    const meta = generateDefaultMeta(familyId, name);
    meta.autoLabel = true;
    return addElement(familyId, id, name, data, meta);
}
/**
 * Gera dados padrao para novo elemento.
 * Cada tipo tem valores iniciais diferentes.
 *
 * @param {string} familyId - ID da familia
 * @returns {AnyRecord} - Dados padrao
 */
function generateDefaultData(familyId: string) {
    // Posicao aleatoria para variar novos elementos
    const randRange = (min: number, max: number) => Math.random() * (max - min) + min;
    switch (familyId) {
        case 'plume':
            return {
                depth: { level: 'shallow', top: 0, bottom: -15 },
                shape: { radiusX: 10, radiusY: 8, radiusZ: 4 },
                center: {
                    x: randRange(-10, 10),
                    y: -7.5,
                    z: randRange(-10, 10),
                },
            };
        case 'well':
            return {
                coordinates: {
                    easting: randRange(-15, 15),
                    northing: randRange(-15, 15),
                    elevation: 0,
                },
                construction: {
                    totalDepth: 50,
                    diameter: 4,
                },
            };
        case 'marker':
            return {
                position: {
                    x: randRange(-10, 10),
                    y: 0,
                    z: randRange(-10, 10),
                },
                observations: [
                    createObservation({
                        x: randRange(-10, 10),
                        y: 0,
                        z: randRange(-10, 10),
                    }),
                ],
            };
        case 'sensor':
            return {
                position: {
                    x: randRange(-15, 15),
                    y: 0,
                    z: randRange(-15, 15),
                },
                userId: Math.ceil(Math.random() * 10),
                connectorKey: '',
                sensorType: 'multiparameter',
                monitoredParameters: ['temperature', 'pH', 'conductivity', 'water_level'],
                endpoints: {
                    identity: 'https://jsonplaceholder.typicode.com/users/{userId}',
                    metadata:
                        'https://fakerapi.it/api/v1/custom?_quantity=1&uuid=uuid&serial=buildingNumber&coord_lat=latitude&coord_lon=longitude',
                    readings: 'https://fakerapi.it/api/v1/custom?_quantity=1&{fields}',
                },
                profile: null,
                evaluation: null,
                weather: null,
                latestReadings: [],
                lastFetch: null,
                errors: [],
                observations: [],
            };
        case 'intangible':
            return {
                position: {
                    x: randRange(-10, 10),
                    y: 3,
                    z: randRange(-10, 10),
                },
                assetType: 'contract',
                observations: [createObservation({})],
            };
        case 'generic':
            return {
                position: {
                    x: randRange(-10, 10),
                    y: 2,
                    z: randRange(-10, 10),
                },
                observations: [createObservation({})],
            };
        case 'blueprint':
            return {
                category: 'industrial',
                crs_source: 'EPSG:4326',
                geometry: null,
                area_m2: 0,
                vertices: [
                    { x: -30, z: -20 },
                    { x: 30, z: -20 },
                    { x: 30, z: 20 },
                    { x: -30, z: 20 },
                ],
                layers: [],
                compliance: [],
                sensors: [],
                metadata: {},
                observations: [createObservation({})],
            };
        case 'site_project':
        case 'site_area':
        case 'site_zone':
            return {};
        default:
            return {
                observations: [createObservation({})],
            };
    }
}
/**
 * Gera metadados padrao para elemento.
 *
 * @param {string} familyId
 * @param {string} name
 * @returns {AnyRecord}
 */
function generateDefaultMeta(familyId: string, name: string): AnyRecord {
    return _generateDefaultMetaPure(familyId, name);
}
/**
 * Cria uma observacao padrao.
 *
 * @param {AnyRecord} base
 * @returns {AnyRecord}
 */
function createObservation(base: AnyRecord) {
    return _createObservationBasePure(base);
}
/**
 * UNC-STRUCTURAL-001 Fase 2 - in-place migration of every observation
 * across all loaded elements. Idempotent. Returns count of observations
 * that were updated (those without a conforming `uncertainty` attribute).
 *
 * Does NOT persist automatically - caller is responsible for persist step.
 *
 * @returns {Promise<{scanned: number, migrated: number}>}
 */
export async function migrateAllObservationsUncertainty() {
    const { migrateLegacyObservation } = await import('../uncertainty/observationSchema.js');
    let scanned = 0;
    let migrated = 0;
    for (const el of elements) {
        if (!Array.isArray(el?.observations)) continue;
        for (let i = 0; i < el.observations.length; i++) {
            scanned++;
            const before = el.observations[i];
            const after = migrateLegacyObservation(before);
            if (after !== before) {
                el.observations[i] = after;
                migrated++;
            }
        }
    }
    return { scanned, migrated };
}
// ----------------------------------------------------------------
// FUNCOES DE REMOCAO
// ----------------------------------------------------------------
/**
 * Remove um elemento do modelo.
 *
 * @param {string} id - ID do elemento
 * @returns {boolean} - true se removido, false se nao encontrado
 *
 * PROCESSO:
 * 1. Remove mesh da cena
 * 2. Libera memoria do mesh
 * 3. Remove do mapa
 * 4. Remove da lista
 */
export function removeElement(id: string) {
    const index = elements.findIndex((e) => e.id === id);
    if (index === -1) {
        console.warn(`Elemento nao encontrado: ${id}`);
        return false;
    }
    // Remove mesh 3D
    const mesh = meshMap.get(id);
    if (mesh) {
        const elementsGroup = getElementsGroup();
        if (elementsGroup) {
            elementsGroup.remove(mesh);
        }
        disposeMesh(mesh);
        meshMap.delete(id);
    }
    // Filhos diretos passam a raiz quando parent e removido
    const children = getElementsByParent(id);
    for (const child of children) {
        child.hierarchy = child.hierarchy || _defaultHierarchy(0);
        child.hierarchy.parentId = null;
    }
    // Remove da lista e do mapa
    elements.splice(index, 1);
    elementMap.delete(id);
    _normalizeSiblingOrder(null);
    _invalidateEffectiveVisibility();
    for (const child of children) {
        _syncEffectiveVisibilityForSubtree(child.id);
    }
    requestRender();
    window.dispatchEvent(new CustomEvent('ecbt:elementRemoved', { detail: { id } }));
    return true;
}
/**
 * Remove todos os elementos de uma familia.
 *
 * @param {string} familyId - ID da familia
 * @returns {number} - Quantidade de elementos removidos
 */
export function removeElementsByFamily(familyId: string) {
    const toRemove = elements.filter((e) => e.family === familyId).map((e) => e.id);
    toRemove.forEach((id) => removeElement(id));
    return toRemove.length;
}
/**
 * Remove todos os elementos do modelo.
 */
export function clearAllElements() {
    // Remove todos os meshes
    elements.forEach((e) => {
        const mesh = meshMap.get(e.id);
        if (mesh) {
            const elementsGroup = getElementsGroup();
            if (elementsGroup) {
                elementsGroup.remove(mesh);
            }
            disposeMesh(mesh);
        }
    });
    // Limpa estruturas
    elements = [];
    elementMap.clear();
    meshMap.clear();
    resetElementCounter();
    selectedElementId = null;
    _invalidateEffectiveVisibility();
    window.dispatchEvent(new CustomEvent('ecbt:elementsCleared'));
}
// ----------------------------------------------------------------
// FUNCOES DE VISIBILIDADE
// ----------------------------------------------------------------
/**
 * Alterna visibilidade de um elemento.
 *
 * @param {string} id - ID do elemento
 * @returns {boolean} - Novo estado de visibilidade
 */
export function toggleElementVisibility(id: string) {
    const element = elementMap.get(id);
    if (element) {
        element.visible = !element.visible;
        _invalidateEffectiveVisibility();
        _syncEffectiveVisibilityForSubtree(id);
        requestRender();
        return element.visible;
    }
    return false;
}
/**
 * Define visibilidade de um elemento.
 *
 * @param {string} id - ID do elemento
 * @param {boolean} visible - Novo estado
 */
export function setElementVisibility(id: string, visible: boolean) {
    const element = elementMap.get(id);
    if (element) {
        element.visible = visible;
    }
    if (element) {
        _invalidateEffectiveVisibility();
        _syncEffectiveVisibilityForSubtree(id);
    }
}
// ----------------------------------------------------------------
// FUNCOES DE SERIALIZACAO
// ----------------------------------------------------------------
/**
 * Exporta elementos para formato salvavel.
 *
 * @returns {Object[]} - Copia dos elementos
 */
export function exportElements() {
    return elements.map((e) => ({
        family: e.family,
        id: e.id,
        name: e.name,
        visible: e.visible,
        iconClass: e.iconClass || '',
        color: e.color || '',
        description: e.description || '',
        label: e.label || e.name,
        labels: e.labels || {},
        autoLabel: e.autoLabel === true,
        data: e.data,
        hierarchy: e.hierarchy || _defaultHierarchy(0),
        stamps: Array.isArray(e.stamps) ? e.stamps : [],
        messages: Array.isArray(e.messages) ? e.messages : [],
    }));
}
/**
 * Importa elementos de dados salvos.
 * Substitui todos os elementos atuais.
 *
 * @param {AnyRecord[]} importedElements - Elementos a importar
 */
export function importElements(importedElements: AnyRecord[]) {
    // Limpa elementos atuais
    clearAllElements();
    // Adiciona elementos importados
    if (Array.isArray(importedElements)) {
        const pendingHierarchy: Array<{ id: string; parentId: string | null; order: number }> = [];
        importedElements.forEach((e) => {
            addElement(e.family, e.id, e.name, e.data, {
                iconClass: e.iconClass,
                color: e.color,
                description: e.description,
                label: e.label,
                labels: e.labels,
                autoLabel: e.autoLabel,
                hierarchy: e.hierarchy || _defaultHierarchy(0),
                stamps: e.stamps,
                messages: e.messages,
            });
            pendingHierarchy.push({
                id: e.id,
                parentId: e.hierarchy?.parentId ?? null,
                order: toFiniteNumber(e.hierarchy?.order, 0),
            });
            if (e.visible === false) {
                setElementVisibility(e.id, false);
            }
        });
        // Segunda passada para parent/order (com todos IDs já registrados)
        for (const item of pendingHierarchy) {
            const element = getElementById(item.id);
            if (!element) continue;
            if (item.parentId && !setParent(item.id, item.parentId)) {
                element.hierarchy.parentId = null;
            }
            element.hierarchy.order = item.order;
        }
        // Reindexa por parent para manter ordem consistente
        const parentIds = new Set(elements.map((e) => e.hierarchy?.parentId ?? null));
        parentIds.forEach((pid) => _normalizeSiblingOrder(pid));
        _invalidateEffectiveVisibility();
        elements.forEach((e) => _syncEffectiveVisibilityForSubtree(e.id));
    }
}
// ----------------------------------------------------------------
// FUNCOES DE ATUALIZACAO
// ----------------------------------------------------------------
/**
 * Atualiza label de todos os elementos para o idioma atual.
 * Prioridade: labels[lang] > autoLabel > labels fallback > label existente.
 * Chamado quando o idioma muda (evento languageChanged).
 */
function extractCounterFromId(id: string): string {
    const match = id.match(/-(\d+)$/);
    return match && match[1] ? match[1] : '';
}

function buildAutoName(family: AnyRecord, counter: string): string {
    const familyName = getFamilyName(family);
    return counter ? `${familyName} ${counter}` : familyName;
}

function applyCustomLanguageLabel(element: AnyRecord, lang: string): boolean {
    const customLabel = element.labels?.[lang];
    if (!customLabel) return false;
    element.label = customLabel;
    if (element.autoLabel) {
        const family = getFamily(element.family);
        if (family) {
            element.name = buildAutoName(family, extractCounterFromId(element.id));
        }
    }
    return true;
}

function applyAutoLanguageLabel(element: AnyRecord): boolean {
    if (!element.autoLabel) return false;
    const family = getFamily(element.family);
    if (!family) return true; // handled (skip fallback)
    const newName = buildAutoName(family, extractCounterFromId(element.id));
    element.name = newName;
    element.label = newName;
    return true;
}

function applyFallbackLabel(element: AnyRecord): void {
    if (!element.labels) return;
    const fallback = element.labels.en || Object.values(element.labels)[0];
    if (fallback) element.label = fallback;
}

export function refreshAutoLabelNames() {
    const lang = getCurrentLanguage();
    for (const element of elements) {
        if (applyCustomLanguageLabel(element, lang)) continue;
        if (applyAutoLanguageLabel(element)) continue;
        applyFallbackLabel(element);
    }
}
/**
 * Atualiza propriedades editaveis de um elemento.
 *
 * @param {string} element
 * @param {AnyRecord} id
 */
function applyHierarchyUpdate(element: AnyRecord, id: string, hierarchyUpdate: AnyRecord) {
    const parentId = hierarchyUpdate?.parentId ?? null;
    if (!setParent(id, parentId)) {
        // Se parent invalido, ainda normaliza outros campos do hierarchy.
        element.hierarchy = _normalizeHierarchy(hierarchyUpdate, element.family, id);
    } else if (Number.isFinite(hierarchyUpdate?.order)) {
        element.hierarchy.order = hierarchyUpdate.order;
        _normalizeSiblingOrder(parentId);
    }
}

function applyElementUpdate(element: AnyRecord, id: string, updates: AnyRecord) {
    if (updates.name !== undefined) {
        element.name = updates.name;
    }
    if (updates.label !== undefined) {
        element.label = updates.label;
        // Salva no mapa por idioma (labels multilingual)
        if (!element.labels) element.labels = {};
        element.labels[getCurrentLanguage()] = updates.label;
    }
    if (updates.iconClass !== undefined) {
        element.iconClass = updates.iconClass;
    }
    if (updates.description !== undefined) {
        element.description = updates.description;
    }
    if (updates.color !== undefined) {
        element.color = updates.color;
    }
    if (updates.data !== undefined) {
        element.data = updates.data;
    }
    if (updates.hierarchy !== undefined) {
        applyHierarchyUpdate(element, id, updates.hierarchy);
    }
    if (updates.visible !== undefined) {
        setElementVisibility(id, !!updates.visible);
    }
}

export function updateElement(id: string, updates: AnyRecord) {
    const element = getElementById(id);
    if (!element) return null;
    applyElementUpdate(element, id, updates);
    _invalidateEffectiveVisibility();
    _syncEffectiveVisibilityForSubtree(id);
    window.dispatchEvent(new CustomEvent('ecbt:elementUpdated', { detail: { id } }));
    return element;
}
/**
 * Reconstroi a mesh 3D de um elemento.
 * Usado quando element.data muda de forma que afeta a geometria 3D
 * (ex: import DXF com novos vertices para blueprint).
 *
 * @param {string} id - ID do elemento
 * @returns {boolean} - true se reconstruiu com sucesso
 */
export function rebuildElementMesh(id: string) {
    const element = getElementById(id);
    if (!element) return false;
    const group = getElementsGroup();
    // Remove mesh anterior
    const oldMesh = meshMap.get(id);
    if (oldMesh) {
        if (group) group.remove(oldMesh);
        disposeMesh(oldMesh);
        meshMap.delete(id);
    }
    // Cria nova mesh com dados atualizados
    const newMesh = createMesh(element);
    if (newMesh) {
        newMesh.userData.elementId = id;
        _freezeMatrix(newMesh);
        if (group) group.add(newMesh);
        meshMap.set(id, newMesh);
        // Notifica observadores (ex: symbology manager) que a mesh foi trocada.
        window.dispatchEvent(
            new CustomEvent('meshReplaced', {
                detail: { elementId: id, oldMesh, newMesh },
            }),
        );
    }
    requestRender();
    return true;
}
function _defaultHierarchy(order = 0) {
    return _defaultHierarchyPure(order);
}
function _normalizeHierarchy(input: any, _familyId: string, elementId: string | null | undefined) {
    return _normalizeHierarchyPure(input, _familyId, elementId);
}
function _isContainerFamily(familyId: string) {
    return _isContainerFamilyPure(familyId, getFamily);
}
function _normalizeSiblingOrder(parentId: string | null) {
    const siblings = getElementsByParent(parentId ?? null);
    siblings.forEach((el: AnyRecord, idx: number) => {
        el.hierarchy = el.hierarchy || _defaultHierarchy(idx);
        el.hierarchy.order = idx;
    });
}
function _invalidateEffectiveVisibility() {
    _effectiveVisibilityDirty = true;
}
function _syncEffectiveVisibilityForSubtree(rootId: string) {
    const ids = [rootId, ...getDescendants(rootId).map((d) => d.id)];
    for (const id of ids) {
        const mesh = meshMap.get(id);
        if (mesh) {
            mesh.visible = isEffectivelyVisible(id);
        }
    }
}
// ----------------------------------------------------------------
// BATCH VISIBILITY - utilitarios para o filtro global
// ----------------------------------------------------------------
/**
 * Set visibility for all elements of a given family.
 * Utilitario de batch para o filtro global (filterPanel.js).
 * @param {string} familyId - ID da familia (ex: 'well', 'plume')
 * @param {boolean} visible - Novo estado de visibilidade
 */
export function setFamilyVisibility(familyId: string, visible: boolean) {
    for (const el of elementMap.values()) {
        const fid = el.familyId || el.family;
        if (fid === familyId) {
            setElementVisibility(el.id, visible);
        }
    }
}
/**
 * Restore all elements to visible.
 * Chamado pelo Clear do filtro global para restaurar o modelo completo.
 */
export function setAllElementsVisible() {
    for (const el of elementMap.values()) {
        setElementVisibility(el.id, true);
    }
}
// ----------------------------------------------------------------
// GERAÇÃO ALEATÓRIA - importada de randomModel.js
// Re-exporta para manter compatibilidade com call sites existentes
// ----------------------------------------------------------------
export { generateRandomModel, createDefaultElements } from './randomModel.js';
// ----------------------------------------------------------------
// TAB-MODEL-SWITCH-001 — Manager Signature (snapshot/restore per tab)
// ----------------------------------------------------------------
/**
 * Exporta estado completo do manager para snapshot de tab.
 * NÃO inclui meshMap (objetos Three.js — re-criados pelo init da cena ao restaurar).
 * Inclui: array elements (deep clone), seleção, contador IDs.
 */
export function exportState(): { elements: AnyRecord[]; selectedElementId: string | null; nextElementCounter: number } {
    const cloned = elements.map((el) => JSON.parse(JSON.stringify(el)));
    return {
        elements: cloned,
        selectedElementId,
        // BUG FIX 2026-06-02 (IS-5/6 root cause): peek counter value via
        // getElementCounter() — NÃO incluir a função `nextElementCounter`
        // diretamente porque ela é function ref não-serializável (quebra
        // structured-clone do IndexedDB silenciosamente, falhando todo
        // snapshot persist). Type signature já dizia `number`.
        nextElementCounter: getElementCounter(),
    };
}
/**
 * Restaura estado completo do manager a partir de snapshot.
 * Tolerante a state vazio/malformado (degrada para clearAllElements).
 * Re-cria meshMap via addElement individual (rebind à cena ativa).
 * Caller é responsável por chamar sceneOwner.init() ANTES (cena precisa existir).
 */
export function importState(state: { elements?: AnyRecord[]; selectedElementId?: string | null; nextElementCounter?: number } | null | undefined): void {
    clearAllElements();
    if (!state || typeof state !== 'object') return;
    if (Array.isArray(state.elements)) {
        for (const el of state.elements) {
            try {
                addElement(el.family || el.familyId, el.id, el.name, el, el.meta || {});
            }
            catch (e) {
                console.debug('[elements:importState] addElement skipped', (e as any)?.message || e);
            }
        }
    }
    selectedElementId = state.selectedElementId || null;
    if (typeof state.nextElementCounter === 'number') {
        // Bump contador até alcançar valor restaurado (preserva continuidade IDs).
        // FIX: usar getElementCounter() (leitura sem efeito) — `nextElementCounter`
        // é a FUNÇÃO geradora (incrementaria, duplicando com bumpElementCounter).
        while (getElementCounter() < state.nextElementCounter) {
            bumpElementCounter();
        }
    }
    _effectiveVisibilityDirty = true;
}
/** Alias canônico para Manager Registry (compat com campaigns/edges/etc.) */
export function resetState(): void {
    clearAllElements();
}
//# sourceMappingURL=manager.js.map
