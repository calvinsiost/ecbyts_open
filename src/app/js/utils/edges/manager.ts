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
   GERENCIADOR DE RELACOES (EDGE MANAGER)
   ================================================================

   CRUD e operacoes sobre relacoes entre ativos.
   Implementa grafo Any-to-Any com travessia e busca.

   OPERACOES:
   - addEdge: Cria relacao entre elementos
   - removeEdge: Remove relacao
   - updateEdge: Atualiza propriedades
   - getEdges: Lista relacoes de um elemento
   - traverse: Navega pelo grafo

   ================================================================ */

import { getEdgeType, isValidEdge } from './types.js';
import { generateId } from '../helpers/id.js';
// Adopt own pure helpers (Module C extraction commit a01ed427) — DRY interno.
import {
    bfsTraversal,
    findShortestPath,
    findTransitiveClosureFromLookup,
    countByField,
    computeDegreeFromIndex,
    findIsolatedFromDegree,
    findHubsFromDegree,
    createEdgeShape,
} from './_edgeGraphPure.js';

// ----------------------------------------------------------------
// ARMAZENAMENTO DE EDGES
// ----------------------------------------------------------------

/**
 * Armazena todas as edges do modelo.
 * Mantido separado dos elementos para facilitar travessia.
 * @type {any[]}
 */
let edges: any = [];

/**
 * Indice de edges por sourceId para busca rapida.
 */
let edgesBySource = new Map();

/**
 * Indice de edges por targetId para busca rapida.
 */
let edgesByTarget = new Map();

// ----------------------------------------------------------------
// FUNCOES DE GERACAO DE ID
// ----------------------------------------------------------------

/**
 * Gera ID unico para edge.
 * @returns {string}
 */
function generateEdgeId() {
    return generateId('edge');
}

// ----------------------------------------------------------------
// INICIALIZACAO E RESET
// ----------------------------------------------------------------

/**
 * Inicializa o gerenciador com edges existentes.
 * @param {any[]} existingEdges - Edges a carregar
 */
export function initEdges(existingEdges: any[] = []) {
    edges = [];
    edgesBySource = new Map();
    edgesByTarget = new Map();

    existingEdges.forEach((edge) => {
        addEdgeToIndex(edge);
    });
}

/**
 * Adiciona edge aos indices internos.
 * @param {any} edge - Edge a indexar
 */
function addEdgeToIndex(edge: any) {
    edges.push(edge);

    // Indexar por source
    if (!edgesBySource.has(edge.sourceId)) {
        edgesBySource.set(edge.sourceId, []);
    }
    edgesBySource.get(edge.sourceId).push(edge);

    // Indexar por target
    if (!edgesByTarget.has(edge.targetId)) {
        edgesByTarget.set(edge.targetId, []);
    }
    edgesByTarget.get(edge.targetId).push(edge);
}

/**
 * Remove edge dos indices internos.
 * @param {any} edge - Edge a remover
 */
function removeEdgeFromIndex(edge: any) {
    // Remover do array principal
    const mainIndex = edges.findIndex((e: any) => e.id === edge.id);
    if (mainIndex !== -1) {
        edges.splice(mainIndex, 1);
    }

    // Remover do indice por source
    const sourceEdges = edgesBySource.get(edge.sourceId);
    if (sourceEdges) {
        const idx = sourceEdges.findIndex((/** @type {any} */ e: any) => e.id === edge.id);
        if (idx !== -1) sourceEdges.splice(idx, 1);
    }

    // Remover do indice por target
    const targetEdges = edgesByTarget.get(edge.targetId);
    if (targetEdges) {
        const idx = targetEdges.findIndex((/** @type {any} */ e: any) => e.id === edge.id);
        if (idx !== -1) targetEdges.splice(idx, 1);
    }
}

// ----------------------------------------------------------------
// CRUD DE EDGES
// ----------------------------------------------------------------

/**
 * Cria relacao entre dois elementos.
 * @param {string} sourceId - ID do elemento origem
 * @param {string} targetId - ID do elemento destino
 * @param {string} typeId - ID do tipo de relacao
 * @param {object} options - Opcoes adicionais
 * @param {any} options.properties - Propriedades da relacao
 * @param {string} options.createdBy - Usuario que criou
 * @param {Function} options.getElement - Funcao para obter elemento por ID
 * @returns {{ success: boolean, edge?: any, errors?: string[] }}
 */
export function addEdge(sourceId: any, targetId: any, typeId: any, options = (({}) as any)) {
    const errors = [];

    // Validar tipo
    const edgeType = getEdgeType(typeId);
    if (!edgeType) {
        return { success: false, errors: [`Tipo de relacao desconhecido: ${typeId}`] };
    }

    // Validar se nao e auto-referencia (exceto para alguns tipos)
    if (sourceId === targetId && !edgeType.allowSelfReference) {
        return { success: false, errors: ['Relacao nao pode ser auto-referenciada'] };
    }

    // Validar familias se funcao getElement fornecida
    if (options.getElement) {
        const source = options.getElement(sourceId);
        const target = options.getElement(targetId);

        if (!source) {
            errors.push(`Elemento origem nao encontrado: ${sourceId}`);
        }
        if (!target) {
            errors.push(`Elemento destino nao encontrado: ${targetId}`);
        }

        if (source && target) {
            if (!isValidEdge(typeId, source.family, target.family)) {
                errors.push(`Relacao ${typeId} invalida entre ${source.family} e ${target.family}`);
            }
        }
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    // Verificar duplicata
    const existing = findEdge(sourceId, targetId, typeId);
    if (existing) {
        return { success: false, errors: ['Relacao ja existe'] };
    }

    // Criar edge (usa _edgeGraphPure.createEdgeShape — DRY interno).
    const edge = createEdgeShape(generateEdgeId(), sourceId, targetId, typeId, {
        bidirectional: edgeType.bidirectional,
        properties: options.properties,
        createdBy: options.createdBy,
    });

    addEdgeToIndex(edge);
    window.dispatchEvent(new CustomEvent('edgesChanged'));

    return { success: true, edge };
}

/**
 * Remove relacao.
 * @param {string} edgeId - ID da edge
 * @returns {{ success: boolean, error?: string }}
 */
export function removeEdge(edgeId: any) {
    const edge = edges.find((e: any) => e.id === edgeId);
    if (!edge) {
        return { success: false, error: `Relacao nao encontrada: ${edgeId}` };
    }

    removeEdgeFromIndex(edge);
    window.dispatchEvent(new CustomEvent('edgesChanged'));
    return { success: true };
}

/**
 * Atualiza propriedades de uma relacao.
 * @param {string} edgeId - ID da edge
 * @param {any} properties - Novas propriedades
 * @returns {{ success: boolean, edge?: any, error?: string }}
 */
export function updateEdge(edgeId: any, properties: any) {
    const edge = edges.find((e: any) => e.id === edgeId);
    if (!edge) {
        return { success: false, error: `Relacao nao encontrada: ${edgeId}` };
    }

    edge.properties = { ...edge.properties, ...properties };
    edge.modifiedAt = new Date().toISOString();

    return { success: true, edge };
}

/**
 * Busca edge especifica.
 * @param {string} sourceId - ID origem
 * @param {string} targetId - ID destino
 * @param {string|null} [typeId] - Tipo (opcional)
 * @returns {any}
 */
export function findEdge(sourceId: any, targetId: any, typeId = null) {
    return (
        edges.find(
            (e: any) =>
                e.sourceId === sourceId && e.targetId === targetId && (typeId === null || e.type === typeId),
        ) || null
    );
}

/**
 * Obtem edge por ID.
 * @param {string} edgeId - ID da edge
 * @returns {any}
 */
export function getEdgeById(edgeId: any) {
    return edges.find((e: any) => e.id === edgeId) || null;
}

// ----------------------------------------------------------------
// CONSULTAS DE EDGES
// ----------------------------------------------------------------

/**
 * Obtem todas as edges de saida de um elemento.
 * @param {string} elementId - ID do elemento
 * @param {object} filter - Filtros opcionais
 * @param {string} filter.type - Filtrar por tipo
 * @returns {any[]}
 */
export function getOutgoingEdges(elementId: any, filter = (({}) as any)) {
    let result = edgesBySource.get(elementId) || [];

    if (filter.type) {
        result = result.filter((/** @type {any} */ e: any) => e.type === filter.type);
    }

    return [...result];
}

/**
 * Obtem todas as edges de entrada para um elemento.
 * @param {string} elementId - ID do elemento
 * @param {object} filter - Filtros opcionais
 * @param {string} filter.type - Filtrar por tipo
 * @returns {any[]}
 */
export function getIncomingEdges(elementId: any, filter = (({}) as any)) {
    let result = edgesByTarget.get(elementId) || [];

    if (filter.type) {
        result = result.filter((/** @type {any} */ e: any) => e.type === filter.type);
    }

    return [...result];
}

/**
 * Obtem todas as edges conectadas a um elemento.
 * @param {string} elementId - ID do elemento
 * @param {object} filter - Filtros opcionais
 * @returns {any[]}
 */
export function getConnectedEdges(elementId: any, filter = (({}) as any)) {
    const f = ((filter) as any);
    const outgoing = getOutgoingEdges(elementId, f);
    const incoming = getIncomingEdges(elementId, f);
    return [...outgoing, ...incoming];
}

/**
 * Obtem IDs de elementos vizinhos.
 * @param {string} elementId - ID do elemento
 * @param {object} options - Opcoes
 * @param {boolean} options.outgoing - Incluir vizinhos de saida
 * @param {boolean} options.incoming - Incluir vizinhos de entrada
 * @param {string} options.type - Filtrar por tipo de relacao
 * @returns {string[]}
 */
export function getNeighbors(elementId: any, options = (({ outgoing: true, incoming: true }) as any)) {
    const neighbors = new Set();

    if (options.outgoing !== false) {
        getOutgoingEdges(elementId, { type: options.type }).forEach((e) => {
            neighbors.add(e.targetId);
        });
    }

    if (options.incoming !== false) {
        getIncomingEdges(elementId, { type: options.type }).forEach((e) => {
            neighbors.add(e.sourceId);
        });
    }

    return Array.from(neighbors);
}

// ----------------------------------------------------------------
// TRAVESSIA DO GRAFO
// ----------------------------------------------------------------

/**
 * Busca em largura (BFS) a partir de um elemento.
 * @param {string} startId - ID do elemento inicial
 * @param {object} options - Opcoes
 * @param {number} options.maxDepth - Profundidade maxima
 * @param {string} options.type - Tipo de relacao a seguir
 * @param {string} options.direction - 'outgoing'|'incoming'|'both'
 * @returns {{ visited: string[], paths: Map<string, string[]> }}
 */
export function bfs(startId: any, options = (({}) as any)) {
    // Delegate to _edgeGraphPure.bfsTraversal — caller-injectable neighbor lookup.
    const neighborLookup = (id: string, opts: any) =>
        getNeighbors(id, { outgoing: opts.outgoing, incoming: opts.incoming, type: opts.type }) as string[];
    return bfsTraversal(startId, neighborLookup, options);
}

/**
 * Encontra caminho mais curto entre dois elementos.
 * @param {string} startId - ID origem
 * @param {string} endId - ID destino
 * @param {object} options - Opcoes de travessia
 * @returns {string[]|null} - Caminho ou null se nao existe
 */
export function findPath(startId: any, endId: any, options = (({}) as any)) {
    const neighborLookup = (id: string, opts: any) =>
        getNeighbors(id, { outgoing: opts.outgoing, incoming: opts.incoming, type: opts.type }) as string[];
    return findShortestPath(startId, endId, neighborLookup, options);
}

/**
 * Encontra todos os elementos conectados transitivamente.
 * @param {string} elementId - ID do elemento
 * @param {string} edgeType - Tipo de relacao
 * @param {string} direction - 'outgoing'|'incoming'|'both'
 * @returns {string[]}
 */
export function findTransitiveClosure(elementId: any, edgeType: any, direction = 'outgoing') {
    const neighborLookup = (id: string, opts: any) =>
        getNeighbors(id, { outgoing: opts.outgoing, incoming: opts.incoming, type: opts.type }) as string[];
    return findTransitiveClosureFromLookup(elementId, neighborLookup, { type: edgeType, direction: direction as any });
}

/**
 * Encontra elementos contidos (hierarquia).
 * @param {string} containerId - ID do container
 * @returns {string[]}
 */
export function findContainedElements(containerId: any) {
    return findTransitiveClosure(containerId, 'contains', 'outgoing');
}

/**
 * Encontra cadeia de monitoramento.
 * @param {string} monitorId - ID do ponto de monitoramento
 * @returns {string[]}
 */
export function findMonitoredTargets(monitorId: any) {
    return getNeighbors(monitorId, { outgoing: true, incoming: false, type: 'monitors' });
}

// ----------------------------------------------------------------
// ESTATISTICAS E ANALISE
// ----------------------------------------------------------------

/**
 * Conta edges por tipo.
 * @returns {any}
 */
export function countEdgesByType() {
    return countByField(edges as any, 'type');
}

/**
 * Obtem grau de um elemento (numero de conexoes).
 * @param {string} elementId - ID do elemento
 * @returns {{ in: number, out: number, total: number }}
 */
export function getDegree(elementId: any) {
    return computeDegreeFromIndex(elementId, edgesBySource as any, edgesByTarget as any);
}

/**
 * Encontra elementos isolados (sem conexoes).
 * @param {string[]} elementIds - Lista de IDs de elementos
 * @returns {string[]}
 */
export function findIsolatedElements(elementIds: any) {
    return findIsolatedFromDegree(elementIds, (id: string) => getDegree(id));
}

/**
 * Encontra hubs (elementos com muitas conexoes).
 * @param {number} minConnections - Minimo de conexoes
 * @returns {Array<{ id: string, degree: any }>}
 */
export function findHubs(minConnections = 5) {
    const allIds = Array.from(new Set([...edgesBySource.keys(), ...edgesByTarget.keys()]));
    return findHubsFromDegree(allIds, (id: string) => getDegree(id), minConnections);
}

// ----------------------------------------------------------------
// EXPORTACAO E IMPORTACAO
// ----------------------------------------------------------------

/**
 * Exporta todas as edges.
 * @returns {any[]}
 */
export function exportEdges() {
    return edges.map((edge: any) => ({
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        type: edge.type,
        bidirectional: edge.bidirectional,
        properties: edge.properties,
        createdAt: edge.createdAt,
        createdBy: edge.createdBy,
        ...(edge.modifiedAt && { modifiedAt: edge.modifiedAt }),
    }));
}

/**
 * Importa edges.
 * @param {any[]} edgesToImport - Edges a importar
 * @param {object} options - Opcoes
 * @param {boolean} options.replace - Substituir edges existentes
 * @returns {{ success: boolean, imported: number, errors: string[] }}
 */
export function importEdges(edgesToImport: any, options = (({}) as any)) {
    if (options.replace) {
        initEdges([]);
    }

    /** @type {string[]} */
    const errors: any = [];
    let imported = 0;

    edgesToImport.forEach((edge: any, index: any) => {
        if (!edge.sourceId || !edge.targetId || !edge.type) {
            errors.push(`Edge ${index}: campos obrigatorios faltando`);
            return;
        }

        const edgeType = getEdgeType(edge.type);
        if (!edgeType) {
            errors.push(`Edge ${index}: tipo desconhecido ${edge.type}`);
            return;
        }

        addEdgeToIndex({
            id: edge.id || generateEdgeId(),
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            type: edge.type,
            bidirectional: edge.bidirectional || edgeType.bidirectional,
            properties: edge.properties || {},
            createdAt: edge.createdAt || new Date().toISOString(),
            createdBy: edge.createdBy || 'import',
        });
        imported++;
    });

    if (imported > 0) {
        window.dispatchEvent(new CustomEvent('edgesChanged'));
    }

    return {
        success: errors.length === 0,
        imported,
        errors,
    };
}

/**
 * Obtem todas as edges.
 * @returns {any[]}
 */
export function getAllEdges() {
    return [...edges];
}

/**
 * Limpa todas as edges.
 */
export function clearEdges() {
    initEdges([]);
}
// ----------------------------------------------------------------
// TAB-MODEL-SWITCH-001 — Manager Signature (snapshot/restore per tab)
// ----------------------------------------------------------------
/**
 * Exporta estado completo para snapshot de tab.
 * Deep clone via JSON round-trip evita mutação externa.
 */
export function exportState(): { edges: any[] } {
    return {
        edges: edges.map((e: any) => JSON.parse(JSON.stringify(e))),
    };
}
/**
 * Restaura estado a partir de snapshot.
 * Tolerante a state null/malformed (degrada para resetState).
 * Reusa initEdges que reconstrói índices edgesBySource/edgesByTarget.
 */
export function importState(state: { edges?: any[] } | null | undefined): void {
    if (!state || typeof state !== 'object') {
        initEdges([]);
        return;
    }
    initEdges(Array.isArray(state.edges) ? state.edges : []);
}
/** Alias canônico para Manager Registry (consistente com campaigns/elements). */
export function resetState(): void {
    initEdges([]);
}
