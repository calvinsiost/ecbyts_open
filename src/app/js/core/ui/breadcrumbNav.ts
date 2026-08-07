// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-55 - Breadcrumb Navigation State (pure-logic, zero DOM).
 *
 * Modelo de navegacao hierarquica para project > area > zone > element/panel.
 * Estado e nodes sao frozen - toda mutacao retorna novo state.
 */

type BreadcrumbNodeType = 'project' | 'area' | 'zone' | 'element' | 'panel';

interface BreadcrumbNode {
    id: string;
    label: string;
    type: BreadcrumbNodeType;
    parentId: string | null;
    icon: string | null;
    metadata: Readonly<Record<string, unknown>> | null;
}

interface BreadcrumbNodeInput {
    id: string;
    label: string;
    type: BreadcrumbNodeType;
    parentId?: string | null;
    icon?: string | null;
    metadata?: Record<string, unknown>;
}

interface BreadcrumbState {
    nodes: Map<string, BreadcrumbNode>;
    currentPath: ReadonlyArray<string>;
    history: ReadonlyArray<ReadonlyArray<string>>;
    maxHistory: number;
}

interface BreadcrumbStateOverrides {
    nodes?: Map<string, BreadcrumbNode>;
    currentPath?: ReadonlyArray<string>;
    history?: ReadonlyArray<ReadonlyArray<string>>;
}

const VALID_TYPES = new Set(['project', 'area', 'zone', 'element', 'panel']);

/**
 * Cria estado vazio de breadcrumb navigation.
 * @param opts
 * @returns frozen state
 */
export function createBreadcrumbNav(opts: { maxHistory?: number } = {}): BreadcrumbState {
    const maxRaw = opts.maxHistory;
    const maxHistory =
        Number.isFinite(maxRaw) && (maxRaw as number) > 0 ? (maxRaw as number) : 20;
    return Object.freeze({
        nodes: new Map(),
        currentPath: Object.freeze([]),
        history: Object.freeze([]),
        maxHistory,
    }) as BreadcrumbState;
}

function freezeNode(n: BreadcrumbNode): BreadcrumbNode {
    return Object.freeze({ ...n });
}

function cloneState(state: BreadcrumbState, overrides: BreadcrumbStateOverrides): BreadcrumbState {
    return Object.freeze({
        nodes: overrides.nodes || state.nodes,
        currentPath:
            overrides.currentPath !== undefined ? Object.freeze([...overrides.currentPath]) : state.currentPath,
        history:
            overrides.history !== undefined
                ? Object.freeze(
                      overrides.history.map((p: ReadonlyArray<string>) => Object.freeze([...p])),
                  )
                : state.history,
        maxHistory: state.maxHistory,
    }) as BreadcrumbState;
}

/**
 * Registra novo node. Throw em id duplicado, type invalido, parentId inexistente, ou ciclo.
 * @param state
 * @param node
 * @returns new state
 */
export function registerNode(state: BreadcrumbState, node: BreadcrumbNodeInput): BreadcrumbState {
    if (!node || typeof node.id !== 'string' || !node.id) {
        throw new Error('breadcrumbNav: node.id required (string)');
    }
    if (typeof node.label !== 'string') {
        throw new Error('breadcrumbNav: node.label required (string)');
    }
    if (!VALID_TYPES.has(node.type)) {
        throw new Error(`breadcrumbNav: invalid type "${node.type}"`);
    }
    if (state.nodes.has(node.id)) {
        throw new Error(`breadcrumbNav: duplicate node id "${node.id}"`);
    }
    if (node.parentId !== undefined && node.parentId !== null) {
        if (!state.nodes.has(node.parentId)) {
            throw new Error(`breadcrumbNav: parentId "${node.parentId}" does not exist`);
        }
        if (node.parentId === node.id) {
            throw new Error('breadcrumbNav: node cannot be its own parent');
        }
    }
    const nodes = new Map(state.nodes);
    nodes.set(
        node.id,
        freezeNode({
            id: node.id,
            label: node.label,
            type: node.type,
            parentId: node.parentId ?? null,
            icon: node.icon ?? null,
            metadata: node.metadata ? Object.freeze({ ...node.metadata }) : null,
        }),
    );
    return cloneState(state, { nodes });
}

/**
 * Remove node. Throw se id nao existe ou esta no currentPath. Cleanup descendants.
 * @param state
 * @param id
 */
export function unregisterNode(state: BreadcrumbState, id: string): BreadcrumbState {
    if (!state.nodes.has(id)) {
        throw new Error(`breadcrumbNav: node "${id}" not found`);
    }
    if (state.currentPath.includes(id)) {
        throw new Error(`breadcrumbNav: cannot unregister node "${id}" present in currentPath`);
    }
    const toRemove = new Set([id, ...getDescendants(state, id)]);
    for (const removeId of toRemove) {
        if (state.currentPath.includes(removeId)) {
            throw new Error(`breadcrumbNav: descendant "${removeId}" present in currentPath`);
        }
    }
    const nodes = new Map(state.nodes);
    for (const r of toRemove) nodes.delete(r);
    return cloneState(state, { nodes });
}

/**
 * Navega ate o nodeId. currentPath = [ancestors..., nodeId]. Push old path em history.
 * @param state
 * @param nodeId
 */
export function navigateTo(state: BreadcrumbState, nodeId: string): BreadcrumbState {
    if (!state.nodes.has(nodeId)) {
        throw new Error(`breadcrumbNav: node "${nodeId}" not found`);
    }
    const ancestors = getAncestors(state, nodeId);
    const newPath = [...ancestors, nodeId];
    const newHistory =
        state.currentPath.length > 0
            ? [...state.history, [...state.currentPath]].slice(-state.maxHistory)
            : [...state.history];
    return cloneState(state, { currentPath: newPath, history: newHistory });
}

/**
 * Sobe N niveis no currentPath. Throw se levels > pathLength.
 * @param state
 * @param levels
 */
export function navigateUp(state: BreadcrumbState, levels: number = 1): BreadcrumbState {
    if (!Number.isInteger(levels) || levels < 1) {
        throw new Error('breadcrumbNav: levels must be positive integer');
    }
    if (levels > state.currentPath.length) {
        throw new Error(`breadcrumbNav: cannot go up ${levels} levels (path length=${state.currentPath.length})`);
    }
    const newPath = state.currentPath.slice(0, state.currentPath.length - levels);
    const newHistory =
        state.currentPath.length > 0
            ? [...state.history, [...state.currentPath]].slice(-state.maxHistory)
            : [...state.history];
    return cloneState(state, { currentPath: newPath, history: newHistory });
}

/**
 * Restaura ultimo path do history.
 * @param state
 */
export function navigateBack(state: BreadcrumbState): { state: BreadcrumbState; restored: boolean } {
    if (state.history.length === 0) {
        return { state, restored: false };
    }
    const newHistory = state.history.slice(0, -1);
    const restoredPath = state.history[state.history.length - 1] as ReadonlyArray<string>;
    const newState = cloneState(state, {
        currentPath: [...restoredPath],
        history: newHistory,
    });
    return { state: newState, restored: true };
}

/**
 * Retorna IDs dos ancestrais (root..parent) de nodeId.
 * @param state
 * @param nodeId
 */
export function getAncestors(state: BreadcrumbState, nodeId: string): string[] {
    const node = state.nodes.get(nodeId);
    if (!node) return [];
    const ancestors: string[] = [];
    let current: string | null = node.parentId;
    const visited: Set<string> = new Set([nodeId]);
    while (current) {
        if (visited.has(current)) {
            throw new Error(`breadcrumbNav: cycle detected at "${current}"`);
        }
        visited.add(current);
        ancestors.unshift(current);
        const parent = state.nodes.get(current);
        if (!parent) break;
        current = parent.parentId;
    }
    return ancestors;
}

/**
 * Retorna IDs descendant recursivos.
 * @param state
 * @param nodeId
 */
export function getDescendants(state: BreadcrumbState, nodeId: string): string[] {
    const result: string[] = [];
    for (const [id /*, node */] of state.nodes) {
        if (id === nodeId) continue;
        const ancestors = getAncestors(state, id);
        if (ancestors.includes(nodeId)) result.push(id);
    }
    return result;
}

/**
 * Ultimo node do currentPath ou null.
 * @param state
 */
export function getCurrentNode(state: BreadcrumbState): BreadcrumbNode | null {
    if (state.currentPath.length === 0) return null;
    const id = state.currentPath[state.currentPath.length - 1] as string;
    return state.nodes.get(id) || null;
}

/**
 * Array de BreadcrumbNodes do currentPath.
 * @param state
 */
export function getCurrentBreadcrumbs(state: BreadcrumbState): BreadcrumbNode[] {
    return state.currentPath
        .map((id: string) => state.nodes.get(id))
        .filter((v: BreadcrumbNode | undefined): v is BreadcrumbNode => Boolean(v));
}

/**
 * ID do ancestral comum mais proximo, ou null.
 * @param state
 * @param nodeIdA
 * @param nodeIdB
 */
export function findCommonAncestor(
    state: BreadcrumbState,
    nodeIdA: string,
    nodeIdB: string,
): string | null {
    if (!state.nodes.has(nodeIdA) || !state.nodes.has(nodeIdB)) return null;
    const aChain = [...getAncestors(state, nodeIdA), nodeIdA];
    const bChain = new Set([...getAncestors(state, nodeIdB), nodeIdB]);
    for (let i = aChain.length - 1; i >= 0; i--) {
        const candidate = aChain[i] as string;
        if (bChain.has(candidate)) return candidate;
    }
    return null;
}

/**
 * Resumo do estado.
 * @param state
 */
export function summarizeBreadcrumbs(state: BreadcrumbState): {
    nodeCount: number;
    depth: number;
    currentDepth: number;
    historyCount: number;
} {
    let maxDepth = 0;
    for (const id of state.nodes.keys()) {
        const depth = getAncestors(state, id).length;
        if (depth > maxDepth) maxDepth = depth;
    }
    return {
        nodeCount: state.nodes.size,
        depth: maxDepth,
        currentDepth: state.currentPath.length,
        historyCount: state.history.length,
    };
}
