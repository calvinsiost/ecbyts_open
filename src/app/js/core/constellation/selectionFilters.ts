// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Selection & Filters - Phase 1.9 pure logic helpers
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md (extension)
 *
 * Phase 1.9 (2026-05-01) - pure-logic helpers para gerenciar estado de
 * seleção de nós e compor filtros declarativos. Complementa:
 *   - Phase 1 metricSizing (radius por métrica)
 *   - Phase 1.5 metricBinning (color ramp por bin)
 *   - Phase 1.6 graphLayout (posicionamento)
 *   - Phase 1.7 edgeMetrics (topologia)
 *   - Phase 1.8 clusterDetection (comunidades)
 *
 * Provê:
 *   - SelectionState (Set frozen-like + add/remove/toggle/clear/etc.)
 *   - Filter combinators (AND/OR/NOT) com short-circuit
 *   - Predicados pré-construídos: byAttribute, byClusterId, byDegreeRange, byLevel, custom
 *   - applyFilters: aplica filtro composto a lista de nós
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const SELECTION_FILTERS_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.9',
    deliveredAt: '2026-05-01',
});

/**
 * Estado de seleção mutável com API segura.
 * Internamente usa Set; expose snapshots imutáveis via toArray().
 */
export class SelectionState {
    /** Internal id store. */
    declare _set: Set<string>;
    constructor(initialIds: any = []) {
        this._set = new Set();
        if (Array.isArray(initialIds)) {
            for (const id of initialIds) {
                if (id != null) this._set.add(String(id));
            }
        }
    }

    /** Adiciona um ID. Retorna true se adicionado, false se já existia. */
    add(id: any) {
        if (id == null) return false;
        const s = String(id);
        if (this._set.has(s)) return false;
        this._set.add(s);
        return true;
    }

    /** Remove ID. Retorna true se removido, false se não existia. */
    remove(id: any) {
        if (id == null) return false;
        return this._set.delete(String(id));
    }

    /** Toggle ID; retorna estado pós-toggle (true=selected, false=deselected). */
    toggle(id: any) {
        if (id == null) return false;
        const s = String(id);
        if (this._set.has(s)) {
            this._set.delete(s);
            return false;
        }
        this._set.add(s);
        return true;
    }

    /** Verifica se ID está selecionado. */
    has(id: any) {
        if (id == null) return false;
        return this._set.has(String(id));
    }

    /** Limpa toda seleção. Retorna count removido. */
    clear() {
        const count = this._set.size;
        this._set.clear();
        return count;
    }

    /** Tamanho atual. */
    size() {
        return this._set.size;
    }

    /** Snapshot imutável dos IDs (sorted asc). */
    toArray() {
        return [...this._set].sort();
    }

    /** Copia outro SelectionState. */
    static fromArray(ids: any) {
        return new SelectionState(ids);
    }

    /** União com outro estado. Retorna novo SelectionState. */
    union(other: any) {
        const out = new SelectionState(this.toArray());
        if (other instanceof SelectionState) {
            for (const id of other._set) out.add(id);
        } else if (Array.isArray(other)) {
            for (const id of other) out.add(id);
        }
        return out;
    }

    /** Interseção. Retorna novo SelectionState. */
    intersect(other: any) {
        const otherSet =
            other instanceof SelectionState
                ? other._set
                : new Set((other || []).map((id: any) => String((id as any))));
        const out = new SelectionState();
        for (const id of this._set) {
            if (otherSet.has(id)) out._set.add(id);
        }
        return out;
    }

    /** Diferença A - B. Retorna novo SelectionState. */
    difference(other: any) {
        const otherSet =
            other instanceof SelectionState
                ? other._set
                : new Set((other || []).map((id: any) => String((id as any))));
        const out = new SelectionState();
        for (const id of this._set) {
            if (!otherSet.has(id)) out._set.add(id);
        }
        return out;
    }
}

/**
 * Cria SelectionState factory.
 *
 * @param {any[]} [initialIds]
 * @returns {SelectionState}
 */
export function createSelectionState(initialIds: any[] = []): SelectionState {
    return new SelectionState(initialIds);
}

/**
 * Predicado: nó tem valor X em atributo Y.
 *
 * @param {string} attribute
 * @param {*} expected
 * @returns {(node: Object) => boolean}
 */
export function byAttribute(attribute: string, expected: any): (node: Object) => boolean {
    return (node: any) => Boolean(node) && node[attribute] === expected;
}

/**
 * Predicado: ID do nó está em conjunto de IDs permitidos.
 *
 * @param {Array<string> | Set<string>} ids
 * @returns {(node: Object) => boolean}
 */
export function byIds(ids: Array<string> | Set<string>): (node: Object) => boolean {
    const set = ids instanceof Set ? ids : new Set((ids || []).map((i) => String(i)));
    return (node: any) => node && node.id != null && set.has(String(node.id));
}

/**
 * Predicado: cluster ID do nó (via clusterByNode map) está em conjunto.
 *
 * @param {Map<string, string>} clusterByNode
 * @param {Array<string> | Set<string>} string>
 * @returns {(node: Object) => boolean}
 */
export function byClusterId(clusterByNode: Map<string, string>, clusterIds: Array<string> | Set<string>): (node: Object) => boolean {
    if (!(clusterByNode instanceof Map)) return () => false;
    const set = clusterIds instanceof Set ? clusterIds : new Set(clusterIds || []);
    return (node: any) => {
        if (!node || node.id == null) return false;
        const cluster = clusterByNode.get(String(node.id));
        return cluster != null && set.has(cluster);
    };
}

/**
 * Predicado: degree do nó está dentro do range [min, max].
 *
 * @param {Map<string, number>} degrees
 * @param {{min?: number, max?: number}} range
 * @returns {(node: Object) => boolean}
 */
export function byDegreeRange(degrees: Map<string, number>, range: {min?: number, max?: number} = {}): (node: Object) => boolean {
    if (!(degrees instanceof Map)) return () => false;
    const min = Number.isFinite(range.min) ? (range.min) as number : -Infinity;
    const max = Number.isFinite(range.max) ? (range.max) as number : Infinity;
    return (node: any) => {
        if (!node || node.id == null) return false;
        const d = degrees.get(String(node.id));
        if (typeof d !== 'number') return false;
        return d >= min && d <= max;
    };
}

/**
 * Predicado: level (hierarchy depth) do nó está em conjunto.
 *
 * @param {Array<number> | Set<number>} levels
 * @returns {(node: Object) => boolean}
 */
export function byLevel(levels: Array<number> | Set<number>): (node: Object) => boolean {
    const set = levels instanceof Set ? levels : new Set(levels || []);
    return (node: any) => node && set.has(node.level);
}

/**
 * Combinator: AND. Todos predicados devem retornar true.
 *
 * @param {...Function} predicates
 * @returns {(node: Object) => boolean}
 */
export function andFilter(...predicates: Function[]): (node: any) => boolean {
    return (node: any) => {
        for (const p of predicates) {
            if (typeof p !== 'function') return false;
            if (!p(node)) return false;
        }
        return true;
    };
}

/**
 * Combinator: OR. Pelo menos um predicado deve retornar true.
 *
 * @param {...Function} predicates
 * @returns {(node: Object) => boolean}
 */
export function orFilter(...predicates: Function[]): (node: any) => boolean {
    if (predicates.length === 0) return () => false;
    return (node: any) => {
        for (const p of predicates) {
            if (typeof p !== 'function') continue;
            if (p(node)) return true;
        }
        return false;
    };
}

/**
 * Combinator: NOT. Inverte o predicado.
 *
 * @param {Function} predicate
 * @returns {(node: Object) => boolean}
 */
export function notFilter(predicate: Function): (node: Object) => boolean {
    if (typeof predicate !== 'function') return () => true;
    return (node: any) => !predicate(node);
}

/**
 * Aplica filtro a uma lista de nós; retorna apenas matches.
 *
 * @param {Array<Object>} nodes
 * @param {Function} predicate
 * @returns {Array<Object>}
 */
export function applyFilter(nodes: Array<Object>, predicate: Function): Array<Object> {
    if (!Array.isArray(nodes)) return [];
    if (typeof predicate !== 'function') return [...nodes];
    return nodes.filter((node) => {
        try {
            return predicate(node);
        } catch {
            return false;
        }
    });
}

/**
 * Module identity export.
 */
export const selectionFiltersMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.9',
    deliveredAt: '2026-05-01',
    exports: [
        'SELECTION_FILTERS_META',
        'SelectionState',
        'createSelectionState',
        'byAttribute',
        'byIds',
        'byClusterId',
        'byDegreeRange',
        'byLevel',
        'andFilter',
        'orFilter',
        'notFilter',
        'applyFilter',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
