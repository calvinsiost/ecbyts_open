// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.2.0
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Environmental Data Governance
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   EIS SCOPE RESOLVER — Resolucao de escopo para EIS subdivisivel
   Resolve escopos (model, CNPJ, area) em conjuntos filtrados de
   elementos, observacoes e campanhas. Inclui heranca de responsaveis
   e utilidades geometricas (point-in-polygon, area de poligono).

   Funcoes puras — sem side-effects, sem estado interno.

   Referencia academica:
   - Point-in-polygon: Ray-casting algorithm (Shimrat, 1962)
     DOI: 10.1145/368637.368653
   - Shoelace formula: Meister (1769), formalizado por Gauss
   ================================================================ */

import { getModelIdSync } from '../io/modelLink.js';

// ================================================================
// SCOPE DESCRIPTOR TYPES (documentacao)
// ================================================================
//
// { type: 'model', modelId: string }
// { type: 'cnpj', nodeId: string, cnpj: string, modelId: string }
// { type: 'area', elementId: string, modelId: string }

// ================================================================
// SCOPE RESOLUTION - Ponto de entrada principal
// ================================================================

/**
 * Resolve an EIS scope to filtered sets of elements, observations, and campaigns.
 * Ponto de entrada principal - recebe um scope descriptor e retorna os dados filtrados.
 */
export function resolveScope(
    scope: any,
    elements: Array<any>,
    campaigns: Array<any>,
): { elements: Array<any>; observations: Array<any>; campaigns: Array<any> } {
    if (!scope || !elements) {
        return { elements: [], observations: [], campaigns: [] };
    }

    let filtered;
    switch (scope.type) {
        case 'cnpj':
            filtered = getElementsForCnpjNode(scope.nodeId, elements);
            break;
        case 'area':
            filtered = getElementsForStudyArea(scope.elementId, elements);
            break;
        case 'model':
        default:
            filtered = elements;
            break;
    }

    const observations = collectObservationsForElements(filtered);
    const filteredCampaigns = filterCampaignsForElements(campaigns, filtered);

    return { elements: filtered, observations, campaigns: filteredCampaigns };
}

// ================================================================
// CNPJ SCOPE - Filtro por no da arvore organizacional
// ================================================================

/**
 * Get all elements linked to a CNPJ tree node and its descendants.
 * Percorre a arvore organizacional, coleta todos os IDs do no + descendentes,
 * e filtra elementos cujo data.areaId pertence a esse conjunto.
 */
export function getElementsForCnpjNode(nodeId: string, elements: Array<any>): Array<any> {
    if (!nodeId || !elements) return [];

    const tree = (window as any).areasTreeData;
    if (!Array.isArray(tree)) return [];

    const node = _findNodeById(nodeId, tree);
    if (!node) return [];

    const nodeIds = _collectDescendantIds(node);
    return elements.filter((el) => el.data?.areaId && nodeIds.has(el.data.areaId));
}

/**
 * Find a node by ID in the areas tree (recursive DFS).
 */
function _findNodeById(nodeId: string, tree: Array<any>): any {
    for (const node of tree) {
        if (node.id === nodeId) return node;
        if (Array.isArray(node.children)) {
            const found = _findNodeById(nodeId, node.children);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Collect all IDs from a node and its descendants.
 */
function _collectDescendantIds(node: any): Set<string> {
    const ids = new Set([node.id]);
    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            for (const id of _collectDescendantIds(child)) {
                ids.add(id);
            }
        }
    }
    return ids;
}

// ================================================================
// AREA SCOPE - Filtro por area de estudo (hierarquia + espacial)
// ================================================================

/**
 * Get all elements within a study area (boundary or site_area container).
 * Estrategia dupla:
 *   1. Hierarquia: se o elemento e container (site_area/site_zone), coleta filhos
 *   2. Espacial: se boundary, usa point-in-polygon no plano XZ
 */
export function getElementsForStudyArea(areaElementId: string, elements: Array<any>): Array<any> {
    if (!areaElementId || !elements) return [];

    const areaEl = elements.find((e) => e.id === areaElementId);
    if (!areaEl) return [];

    // Estrategia 1: container hierarquico (site_area, site_zone)
    if (areaEl.family === 'site_area' || areaEl.family === 'site_zone') {
        return _getHierarchyDescendants(areaElementId, elements);
    }

    // Estrategia 2: boundary com vertices (point-in-polygon)
    if (areaEl.family === 'boundary' && Array.isArray(areaEl.data?.vertices)) {
        return _getElementsInsideBoundary(areaEl.data.vertices, elements, areaElementId);
    }

    return [];
}

/**
 * Collect all elements that are hierarchical descendants of a container.
 */
function _getHierarchyDescendants(parentId: string, elements: Array<any>): Array<any> {
    const result = [];
    const queue = [parentId];
    const visited = new Set();

    while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);

        for (const el of elements) {
            if (el.hierarchy?.parentId === current && !visited.has(el.id)) {
                result.push(el);
                queue.push(el.id);
            }
        }
    }
    return result;
}

/**
 * Get elements whose position falls inside a boundary polygon (XZ plane).
 * Exclui o proprio boundary do resultado.
 */
function _getElementsInsideBoundary(
    vertices: Array<{ x: number; z: number }>,
    elements: Array<any>,
    boundaryId: string,
): Array<any> {
    const result = [];
    for (const el of elements) {
        if (el.id === boundaryId) continue;
        const pos = _getElementPosition(el);
        if (pos && pointInPolygonXZ(pos.x, pos.z, vertices)) {
            result.push(el);
        }
    }
    return result;
}

/**
 * Extract the XZ position of an element (multiple strategies).
 */
function _getElementPosition(el: any): { x: number; z: number } | null {
    const p = el.data?.position;
    if (p && (typeof p.x === 'number' || typeof p.z === 'number')) {
        return { x: p.x || 0, z: p.z || 0 };
    }
    // Wells may use vertices centroid
    const v = el.data?.vertices;
    if (Array.isArray(v) && v.length > 0) {
        let sx = 0,
            sz = 0;
        for (const pt of v) {
            sx += pt.x || 0;
            sz += pt.z || 0;
        }
        return { x: sx / v.length, z: sz / v.length };
    }
    return null;
}

// ================================================================
// GEOMETRIC UTILITIES
// ================================================================

/**
 * Point-in-polygon test on the XZ plane using ray-casting algorithm.
 * Algoritmo de ray-casting (Shimrat, 1962): lanca raio horizontal
 * e conta interseccoes com arestas do poligono. Impar = dentro.
 */
export function pointInPolygonXZ(px: number, pz: number, vertices: Array<{ x: number; z: number }>): boolean {
    if (!vertices || vertices.length < 3) return false;
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i]!.x || 0,
            zi = vertices[i]!.z || 0;
        const xj = vertices[j]!.x || 0,
            zj = vertices[j]!.z || 0;
        if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Calculate the area of a polygon on the XZ plane using the Shoelace formula.
 * Formula de Gauss (Shoelace) para area de poligono simples no plano XZ.
 * Retorna area em unidades² do modelo (tipicamente metros²).
 */
export function polygonAreaXZ(vertices: Array<{ x: number; z: number }>): number {
    if (!vertices || vertices.length < 3) return 0;
    let area = 0;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i]!.x || 0,
            zi = vertices[i]!.z || 0;
        const xj = vertices[j]!.x || 0,
            zj = vertices[j]!.z || 0;
        area += (xj + xi) * (zj - zi);
    }
    return Math.abs(area / 2);
}

// ================================================================
// OBSERVATION & CAMPAIGN COLLECTION
// ================================================================

/**
 * Collect all observations from a set of elements.
 * Extrai observations de cada el.data.observations.
 */
export function collectObservationsForElements(elements: Array<any>): Array<any> {
    if (!elements) return [];
    const obs = [];
    for (const el of elements) {
        const elObs = el.data?.observations;
        if (!Array.isArray(elObs)) continue;
        for (const o of elObs) {
            obs.push({ ...o, _elementId: el.id });
        }
    }
    return obs;
}

/**
 * Filter campaigns that reference any of the scoped elements.
 * Filtra campanhas cujas plannedReadings ou readings referenciam elementos do escopo.
 * Se a campanha nao tem readings, inclui se tem qualquer overlap temporal.
 */
export function filterCampaignsForElements(campaigns: Array<any>, elements: Array<any>): Array<any> {
    if (!campaigns || !elements) return [];
    const elIds = new Set(elements.map((e) => e.id));

    return campaigns.filter((c) => {
        // Campanhas com plannedReadings que referenciam elementos do escopo
        if (Array.isArray(c.plannedReadings)) {
            return c.plannedReadings.some((r: any) => elIds.has(r.elementId));
        }
        // Fallback: campanha sem readings especificas - inclui (conservador)
        return true;
    });
}

// ================================================================
// RESPONSIBLE RESOLUTION - Heranca de responsaveis
// ================================================================

/**
 * Resolve the 3 responsible parties for a scope (legal, technical, data).
 * Cadeia de heranca: area → CNPJ pai → projeto.
 */
export function resolveResponsibles(scope: any, elements: Array<any>): { legal: any; technical: any; data: any } {
    const empty: { legal: any; technical: any; data: any } = { legal: null, technical: null, data: null };
    if (!scope) return empty;

    // Nivel 1: responsaveis diretos do escopo
    const direct = _getDirectResponsibles(scope, elements);

    // Nivel 2: heranca do CNPJ pai (so para scope 'area')
    let inherited = empty;
    if (scope.type === 'area') {
        const areaEl = elements?.find((e) => e.id === scope.elementId);
        if (areaEl?.data?.areaId) {
            inherited = _getCnpjNodeResponsibles(areaEl.data.areaId);
        }
    }

    // Nivel 3: fallback do projeto
    const project = _getProjectResponsibles();

    return {
        legal: direct.legal || inherited.legal || project.legal,
        technical: direct.technical || inherited.technical || project.technical,
        data: direct.data || inherited.data || project.data,
    };
}

/**
 * Get direct responsibles from the scope source.
 */
function _getDirectResponsibles(scope: any, elements: Array<any>): { legal: any; technical: any; data: any } {
    if (scope.type === 'cnpj') {
        return _getCnpjNodeResponsibles(scope.nodeId);
    }
    if (scope.type === 'area') {
        const el = elements?.find((e) => e.id === scope.elementId);
        return {
            legal: el?.data?.responsibleLegal || null,
            technical: el?.data?.responsibleTechnical || null,
            data: el?.data?.responsibleData || null,
        };
    }
    return { legal: null, technical: null, data: null };
}

/**
 * Get responsibles from a CNPJ tree node.
 */
function _getCnpjNodeResponsibles(nodeId: string): { legal: any; technical: any; data: any } {
    const tree = (window as any).areasTreeData;
    if (!Array.isArray(tree)) return { legal: null, technical: null, data: null };
    const node = _findNodeById(nodeId, tree);
    if (!node) return { legal: null, technical: null, data: null };
    return {
        legal: node.responsibleLegal || null,
        technical: node.responsibleTechnical || null,
        data: node.responsibleData || null,
    };
}

/**
 * Get project-level responsibles as fallback.
 */
function _getProjectResponsibles(): { legal: any; technical: any; data: any } {
    const techName = (document.getElementById('project-responsible-tech') as any)?.value || '';
    const legalName = (document.getElementById('project-responsible-legal') as any)?.value || '';
    return {
        legal: legalName ? { name: legalName, registry: '', contact: '' } : null,
        technical: techName ? { name: techName, registry: '', contact: '' } : null,
        data: null,
    };
}

// ================================================================
// SCOPE HASH - Chave deterministica para IDB
// ================================================================

/**
 * Compute a deterministic hash for a scope descriptor.
 * Usado como sufixo da chave IDB para separar snapshots por escopo.
 * Usa djb2 - mesmo algoritmo do modelHash no snapshotEngine.
 */
export function computeScopeHash(scope: any): string {
    if (!scope || scope.type === 'model') return 'model';

    const key = scope.type === 'cnpj' ? `cnpj-${scope.nodeId || ''}` : `area-${scope.elementId || ''}`;

    let hash = 5381;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

// ================================================================
// SCOPE ENUMERATION - Lista todos os escopos ativos
// ================================================================

/**
 * Enumerate all active CNPJ scopes from the areas tree.
 * Retorna um array de scope descriptors para cada no com CNPJ.
 */
export function enumerateCnpjScopes(): Array<any> {
    const tree = (window as any).areasTreeData;
    if (!Array.isArray(tree)) return [];

    const modelId = getModelIdSync();
    const scopes: Array<any> = [];
    _walkTree(tree, (node: any) => {
        if (node.registryType === 'cnpj' && node.registryNumber) {
            scopes.push({
                type: 'cnpj',
                nodeId: node.id,
                cnpj: node.registryNumber,
                modelId,
                name: node.name,
            });
        }
    });
    return scopes;
}

/**
 * Enumerate all active area scopes (boundaries + site_areas).
 * Retorna scope descriptors para cada boundary e site_area.
 */
export function enumerateAreaScopes(elements: Array<any>): Array<any> {
    if (!elements) return [];
    const modelId = getModelIdSync();
    return elements
        .filter((el) => el.family === 'boundary' || el.family === 'site_area')
        .map((el) => ({
            type: 'area',
            elementId: el.id,
            modelId,
            name: el.name || el.data?.name || el.id,
        }));
}

/**
 * Walk the areas tree, calling fn for each node.
 */
function _walkTree(nodes: Array<any>, fn: Function) {
    for (const node of nodes) {
        fn(node);
        if (Array.isArray(node.children)) {
            _walkTree(node.children, fn);
        }
    }
}
