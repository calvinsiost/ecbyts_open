// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Compliance Cross-References - Phase 23 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S26
 *
 * Phase 23 (2026-05-01) - pure-logic linker entre documentos com
 * grafo de citações e detecção de broken links. Suporta law refs
 * (CONAMA-420), tech-norm refs (ABNT-NBR-13895), e internal docs.
 *
 * Estratégia:
 *   - 4 ref types: law / norm / internal / external
 *   - createRef + parseRefString
 *   - buildCrossRefIndex: doc.id → refs
 *   - findBackrefs: doc.id → quem cita
 *   - detectBrokenLinks: refs sem destino
 *   - buildCitationGraph + topoOrder
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Reference types canônicos. */
export const REF_TYPES = Object.freeze(['law', 'norm', 'internal', 'external']);

/** Identidade do módulo. */
export const CROSS_REF_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 23,
    deliveredAt: '2026-05-01',
    types: REF_TYPES,
});

/**
 * Verifica se ref type é canônico.
 */
export function isValidRefType(type: any): boolean {
    return typeof type === 'string' && REF_TYPES.includes(type);
}

/**
 * Cria reference frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createRef(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createRef: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createRef: id required');
    }
    if (!isValidRefType(spec.type)) {
        throw new TypeError(`createRef: type must be one of ${REF_TYPES.join(',')}`);
    }
    return Object.freeze({
        id: spec.id,
        type: spec.type,
        target: spec.target || null,
        label: spec.label || spec.id,
        section: spec.section || null,
        sourceDoc: spec.sourceDoc || null,
        url: spec.url || null,
    });
}

/**
 * Parse reference string canônica.
 *
 * Suportado:
 *   - "CONAMA-420"           → law
 *   - "CONAMA-420#anexo-ii"  → law com section
 *   - "ABNT-NBR-13895"       → norm
 *   - "doc:report-001"       → internal
 *   - "https://..."          → external
 *
 * @param {string} s
 * @returns {Object|null}
 */
export function parseRefString(s: string): object | null {
    if (typeof s !== 'string' || !s.trim()) return null;
    const trimmed = s.trim();
    if (/^https?:\/\//i.test(trimmed)) {
        return Object.freeze({ id: trimmed, type: 'external', target: trimmed, label: trimmed });
    }
    if (trimmed.startsWith('doc:')) {
        const docId = trimmed.slice(4);
        return Object.freeze({ id: trimmed, type: 'internal', target: docId, label: docId });
    }
    // Section split
    let id = trimmed;
    let section = null;
    const hashIdx = trimmed.indexOf('#');
    if (hashIdx > 0) {
        id = trimmed.slice(0, hashIdx);
        section = trimmed.slice(hashIdx + 1);
    }
    // Detect type by prefix
    if (/^CONAMA-/i.test(id) || /^Lei-/i.test(id) || /^Decreto-/i.test(id)) {
        return Object.freeze({ id: trimmed, type: 'law', target: id, label: id, section });
    }
    if (/^ABNT-/i.test(id) || /^ISO-/i.test(id) || /^IEC-/i.test(id) || /^IFRS-/i.test(id)) {
        return Object.freeze({ id: trimmed, type: 'norm', target: id, label: id, section });
    }
    return Object.freeze({ id: trimmed, type: 'external', target: id, label: id, section });
}

/**
 * Constrói cross-reference index a partir de docs com refs.
 *
 * @param {Array<{id:string, refs?:any[]}>} docs
 * @returns {Object<string, Array<Object>>}
 */
export function buildCrossRefIndex(docs: Array<{ id: string; refs?: any[] }>): Record<string, Array<object>> {
    if (!Array.isArray(docs)) return {};
    const out: Record<string, any> = {};
    for (const d of docs) {
        if (!d || typeof d.id !== 'string') continue;
        out[d.id] = Array.isArray(d.refs) ? Object.freeze([...d.refs]) : Object.freeze([]);
    }
    return Object.freeze(out);
}

/**
 * Encontra docs que citam target.
 *
 * @param {string} targetId
 * @param {Array<{id:string, refs?:any[]}>} docs
 * @returns {Array<string>}
 */
export function findBackrefs(targetId: string, docs: Array<{ id: string; refs?: any[] }>): Array<string> {
    if (typeof targetId !== 'string' || !Array.isArray(docs)) return [];
    const out: string[] = [];
    for (const d of docs) {
        if (!d || typeof d.id !== 'string' || !Array.isArray(d.refs)) continue;
        if (d.refs.some((r: any) => r && r.target === targetId)) {
            out.push(d.id);
        }
    }
    return Object.freeze(out) as string[];
}

/**
 * Detecta refs sem doc destino (broken links em internal refs).
 *
 * @param {Array<{id:string, refs?:any[]}>} docs
 * @returns {Array<{sourceDoc:string, ref:any}>}
 */
export function detectBrokenLinks(
    docs: Array<{ id: string; refs?: any[] }>,
): Array<{ sourceDoc: string; ref: any }> {
    if (!Array.isArray(docs)) return [];
    const docIds = new Set(docs.map((d: any) => d?.id).filter(Boolean));
    const broken: Array<{ sourceDoc: string; ref: any }> = [];
    for (const d of docs) {
        if (!d || !Array.isArray(d.refs)) continue;
        for (const ref of d.refs) {
            if (!ref || ref.type !== 'internal') continue;
            if (!docIds.has(ref.target)) {
                broken.push(Object.freeze({ sourceDoc: d.id, ref }) as { sourceDoc: string; ref: any });
            }
        }
    }
    return Object.freeze(broken) as Array<{ sourceDoc: string; ref: any }>;
}

/**
 * Constrói citation graph (adjacency: doc.id → list de targets internos).
 *
 * @param {Array<{id:string, refs?:any[]}>} docs
 * @returns {Object<string, Array<string>>}
 */
export function buildCitationGraph(
    docs: Array<{ id: string; refs?: any[] }>,
): Record<string, Array<string>> {
    if (!Array.isArray(docs)) return {};
    const graph: Record<string, any> = {};
    for (const d of docs) {
        if (!d || typeof d.id !== 'string') continue;
        graph[d.id] = [];
        if (!Array.isArray(d.refs)) continue;
        for (const ref of d.refs) {
            if (!ref || ref.type !== 'internal') continue;
            if (typeof ref.target === 'string') graph[d.id].push(ref.target);
        }
        graph[d.id] = Object.freeze(graph[d.id]);
    }
    return Object.freeze(graph);
}

/**
 * Topological order (Kahn) de docs por citation graph.
 *
 * @param {Object<string, Array<string>>} graph
 * @returns {{order:any, hasCycle:boolean}}
 */
export function topoOrder(graph: Record<string, Array<string>>): { order: any; hasCycle: boolean } {
    if (!graph || typeof graph !== 'object') {
        return Object.freeze({ order: [], hasCycle: false });
    }
    const inDegree: Record<string, number> = {};
    const nodes = Object.keys(graph);
    for (const n of nodes) inDegree[n] = 0;
    for (const n of nodes) {
        const neighbors = graph[n] || [];
        for (const t of neighbors) {
            if (inDegree[t] !== undefined) inDegree[t]++;
        }
    }
    const queue = nodes.filter((n) => inDegree[n] === 0);
    const order: string[] = [];
    while (queue.length > 0) {
        const n: string = queue.shift() as string;
        order.push(n);
        const neighbors = graph[n] || [];
        for (const t of neighbors) {
            if (inDegree[t] !== undefined) {
                inDegree[t]--;
                if (inDegree[t] === 0) queue.push(t);
            }
        }
    }
    return Object.freeze({
        order: Object.freeze(order),
        hasCycle: order.length < nodes.length,
    });
}

/**
 * Filtra refs por type.
 */
export function filterRefsByType(refs: any, type: any) {
    if (!Array.isArray(refs)) return [];
    if (!isValidRefType(type)) return [];
    return Object.freeze(refs.filter((r) => r && r.type === type));
}

/**
 * Sumariza cross-references.
 */
export function summarizeCrossRefs(docs: any) {
    const empty = {
        totalDocs: 0,
        totalRefs: 0,
        byType: {},
        brokenLinks: 0,
        avgRefsPerDoc: 0,
    };
    if (!Array.isArray(docs) || docs.length === 0) return empty;
    let totalRefs = 0;
    const byType: Record<string, number> = {};
    for (const d of docs) {
        if (!d || !Array.isArray(d.refs)) continue;
        totalRefs += d.refs.length;
        for (const r of d.refs) {
            if (!r) continue;
            if (r.type) byType[r.type] = (byType[r.type] || 0) + 1;
        }
    }
    const broken = detectBrokenLinks(docs);
    return Object.freeze({
        totalDocs: docs.length,
        totalRefs,
        byType,
        brokenLinks: broken.length,
        avgRefsPerDoc: docs.length > 0 ? totalRefs / docs.length : 0,
    });
}

/**
 * Module identity export.
 */
export const complianceCrossRefMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 23,
    deliveredAt: '2026-05-01',
    types: REF_TYPES,
    exports: [
        'REF_TYPES',
        'CROSS_REF_META',
        'isValidRefType',
        'createRef',
        'parseRefString',
        'buildCrossRefIndex',
        'findBackrefs',
        'detectBrokenLinks',
        'buildCitationGraph',
        'topoOrder',
        'filterRefsByType',
        'summarizeCrossRefs',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
