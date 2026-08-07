// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-84 - Tag Manager State (pure-logic)
 *
 * Gerenciador taxonômico puro para atribuir tags hierárquicas a entidades
 * (elementos, observações, campanhas). Zero DOM, totalmente imutável.
 *
 * Modelo:
 *   Tag: { id, name, color, parentId?, description?, isHierarchical, createdAt, useCount }
 *   State: { tags: Map<id, Tag>, assignments: Map<entityId, Set<tagId>> }
 */

/** Cria estado vazio congelado. */
export function createTagManager(): any {
    return Object.freeze({
        tags: new Map(),
        assignments: new Map(),
    });
}

function cloneState(state: any): any {
    const tags = new Map();
    for (const [id, tag] of state.tags) tags.set(id, { ...tag });
    const assignments = new Map();
    for (const [eid, set] of state.assignments) assignments.set(eid, new Set(set));
    return { tags, assignments };
}

function freezeState(s: any): any {
    for (const tag of s.tags.values()) Object.freeze(tag);
    return Object.freeze(s);
}

/** Cria nova tag. Throws em id duplicado, parent inexistente ou ciclo. */
export function createTag(state: any, spec: any, now = Date.now()): any {
    if (!spec || typeof spec.id !== 'string' || !spec.id) throw new Error('tag id required');
    if (typeof spec.name !== 'string' || !spec.name) throw new Error('tag name required');
    if (state.tags.has(spec.id)) throw new Error(`tag id duplicate: ${spec.id}`);
    if (spec.parentId != null) {
        if (!state.tags.has(spec.parentId)) throw new Error(`parent not found: ${spec.parentId}`);
        if (spec.parentId === spec.id) throw new Error('cycle: self parent');
    }
    const next = cloneState(state);
    next.tags.set(spec.id, {
        id: spec.id,
        name: spec.name,
        color: spec.color || '#888888',
        parentId: spec.parentId ?? null,
        description: spec.description || '',
        isHierarchical: !!spec.isHierarchical,
        createdAt: now,
        useCount: 0,
    });
    return freezeState(next);
}

/** Renomeia tag. Throws se outra tag tiver mesma name (case-sensitive). */
export function renameTag(state: any, tagId: any, newName: any): any {
    const tag = state.tags.get(tagId);
    if (!tag) throw new Error(`tag not found: ${tagId}`);
    if (typeof newName !== 'string' || !newName) throw new Error('newName required');
    for (const [id, t] of state.tags) {
        if (id !== tagId && t.name === newName) throw new Error(`name collision: ${newName}`);
    }
    const next = cloneState(state);
    next.tags.get(tagId).name = newName;
    return freezeState(next);
}

/** Pega filhos diretos de uma tag. */
function getChildrenIds(state: any, tagId: any): any[] {
    const out: any[] = [];
    for (const [id, t] of state.tags) if (t.parentId === tagId) out.push(id);
    return out;
}

/** Deleta tag. Cascade: remove assignments. Filhos: throw se não cascade. */
export function deleteTag(state: any, tagId: any, { cascade = false }: { cascade?: boolean } = {}): any {
    if (!state.tags.has(tagId)) throw new Error(`tag not found: ${tagId}`);
    const children = getChildrenIds(state, tagId);
    if (children.length > 0 && !cascade) {
        throw new Error(`tag has children, pass cascade:true to delete: ${tagId}`);
    }
    const next = cloneState(state);
    // Recursive cascade
    const toDelete = new Set([tagId]);
    if (cascade) {
        const stack = [...children];
        while (stack.length) {
            const c = stack.pop();
            toDelete.add(c);
            stack.push(...getChildrenIds(state, c));
        }
    }
    for (const did of toDelete) {
        next.tags.delete(did);
        for (const [eid, set] of next.assignments) {
            set.delete(did);
            if (set.size === 0) next.assignments.delete(eid);
        }
    }
    return freezeState(next);
}

/** Atribui tag a entidade. Idempotente. */
export function assignTag(state: any, entityId: any, tagId: any): any {
    if (!state.tags.has(tagId)) throw new Error(`tag not found: ${tagId}`);
    if (typeof entityId !== 'string' || !entityId) throw new Error('entityId required');
    const existing = state.assignments.get(entityId);
    if (existing && existing.has(tagId)) return state; // idempotent
    const next = cloneState(state);
    if (!next.assignments.has(entityId)) next.assignments.set(entityId, new Set());
    next.assignments.get(entityId).add(tagId);
    next.tags.get(tagId).useCount += 1;
    return freezeState(next);
}

/** Remove atribuição. Idempotente se ausente. */
export function unassignTag(state: any, entityId: any, tagId: any): any {
    const set = state.assignments.get(entityId);
    if (!set || !set.has(tagId)) return state;
    const next = cloneState(state);
    const ns = next.assignments.get(entityId);
    ns.delete(tagId);
    if (ns.size === 0) next.assignments.delete(entityId);
    const t = next.tags.get(tagId);
    if (t && t.useCount > 0) t.useCount -= 1;
    return freezeState(next);
}

/** Tags atribuídas a uma entidade. */
export function getTagsForEntity(state: any, entityId: any): any[] {
    const set = state.assignments.get(entityId);
    if (!set) return [];
    const out: any[] = [];
    for (const tid of set) {
        const t = state.tags.get(tid);
        if (t) out.push(t);
    }
    return out;
}

/** Entidades com determinada tag. */
export function getEntitiesForTag(state: any, tagId: any): any[] {
    const out: any[] = [];
    for (const [eid, set] of state.assignments) if (set.has(tagId)) out.push(eid);
    return out;
}

/** Descendentes recursivos via parentId. */
export function getDescendantTags(state: any, tagId: any): any[] {
    const out: any[] = [];
    const stack = getChildrenIds(state, tagId);
    while (stack.length) {
        const id = stack.pop();
        const t = state.tags.get(id);
        if (t) {
            out.push(t);
            stack.push(...getChildrenIds(state, id));
        }
    }
    return out;
}

/** Tags raiz (sem parentId). */
export function getRootTags(state: any): any[] {
    const out: any[] = [];
    for (const t of state.tags.values()) if (t.parentId == null) out.push(t);
    return out;
}

/** Busca por substring case-insensitive em name. */
export function searchTags(state: any, queryStr: any): any[] {
    const q = String(queryStr || '').toLowerCase();
    if (!q) return [];
    const out: any[] = [];
    for (const t of state.tags.values()) {
        if (t.name.toLowerCase().includes(q)) out.push(t);
    }
    return out;
}

/** Mescla tag source em target: reassign entidades, deleta source. */
export function mergeTags(state: any, sourceId: any, targetId: any): any {
    if (sourceId === targetId) throw new Error('cannot merge tag into itself');
    if (!state.tags.has(sourceId)) throw new Error(`source not found: ${sourceId}`);
    if (!state.tags.has(targetId)) throw new Error(`target not found: ${targetId}`);
    const next = cloneState(state);
    const target = next.tags.get(targetId);
    // eslint-disable-next-line
    for (const [eid, set] of next.assignments) {
        if (set.has(sourceId)) {
            set.delete(sourceId);
            if (!set.has(targetId)) {
                set.add(targetId);
                target.useCount += 1;
            }
        }
    }
    // Reparent children of source to target
    // eslint-disable-next-line
    for (const [id, t] of next.tags) {
        if (t.parentId === sourceId) t.parentId = targetId;
    }
    next.tags.delete(sourceId);
    // Clean empty assignment sets
    for (const [eid, set] of next.assignments) {
        if (set.size === 0) next.assignments.delete(eid);
    }
    return freezeState(next);
}

/** Top N tags por useCount desc. */
export function getMostUsedTags(state: any, limit = 10): any[] {
    const arr = Array.from(state.tags.values()) as any[];
    arr.sort((a, b) => b.useCount - a.useCount);
    return arr.slice(0, limit);
}

/** Resumo agregado. */
export function summarizeTags(state: any): {
    tagCount: number;
    hierarchicalCount: number;
    assignmentCount: number;
    mostUsed: any[];
} {
    let hierarchicalCount = 0;
    for (const t of state.tags.values()) if (t.isHierarchical) hierarchicalCount += 1;
    let assignmentCount = 0;
    for (const set of state.assignments.values()) assignmentCount += set.size;
    return {
        tagCount: state.tags.size,
        hierarchicalCount,
        assignmentCount,
        mostUsed: getMostUsedTags(state, 5),
    };
}
