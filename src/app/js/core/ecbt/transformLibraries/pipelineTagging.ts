// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Tagging - Phase 41 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S41
 *
 * Phase 41 (2026-05-01) - pure-logic tagging layer for pipeline steps.
 * Allows arbitrary string labels (e.g. "experimental", "compliance",
 * "owner:claude") to be attached to steps without mutating the pipeline
 * shape. Supports CRUD on tag definitions, attaching/detaching tags to
 * steps, querying steps by tag, and summarising tag usage.
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const TAGGING_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 41,
    deliveredAt: '2026-05-01',
});

/** Constraints canônicos. */
export const TAG_CONSTRAINTS = Object.freeze({
    nameMinLen: 1,
    nameMaxLen: 64,
    namePattern: /^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/,
    maxTagsPerStep: 32,
});

/**
 * Cria registry inicial de tags.
 */
export function createTagRegistry(): object {
    return Object.freeze({
        tags: Object.freeze({}), // { name: { name, color, description, createdAt } }
        bindings: Object.freeze({}), // { stepId: [tagName, ...] }
    });
}

/**
 * Valida nome de tag.
 */
export function isValidTagName(name: string): boolean {
    if (typeof name !== 'string') return false;
    if (name.length < TAG_CONSTRAINTS.nameMinLen) return false;
    if (name.length > TAG_CONSTRAINTS.nameMaxLen) return false;
    return TAG_CONSTRAINTS.namePattern.test(name);
}

/**
 * Cria nova tag definition. No-op (returns same registry) se nome inválido
 * ou já existe.
 */
export function createTag(registry: Record<string, any>, name: string, opts: Record<string, any> = {}): object {
    if (!registry || !isValidTagName(name)) return registry;
    if (registry.tags[name]) return registry; // idempotent
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const tag = Object.freeze({
        name,
        color: typeof opts.color === 'string' ? opts.color : null,
        description: typeof opts.description === 'string' ? opts.description : '',
        createdAt: now,
    });
    return Object.freeze({
        ...registry,
        tags: Object.freeze({ ...registry.tags, [name]: tag }),
    });
}

/**
 * Remove tag definition E todos os bindings que a referenciam.
 */
export function deleteTag(registry: Record<string, any>, name: string): object {
    if (!registry || typeof name !== 'string') return registry;
    if (!registry.tags[name]) return registry;
    const newTags: Record<string, any> = { ...registry.tags };
    delete newTags[name];
    const newBindings: Record<string, any> = {};
    for (const [stepId, list] of Object.entries(registry.bindings)) {
        const filtered = ((list as any[]) || []).filter((t: any) => t !== name);
        if (filtered.length > 0) {
            newBindings[stepId] = Object.freeze(filtered);
        }
    }
    return Object.freeze({
        tags: Object.freeze(newTags),
        bindings: Object.freeze(newBindings),
    });
}

/**
 * Attach tag a step. Cria a tag-definition implicitamente se ainda não
 * existe (autoCreate por padrão). Retorna registry inalterado se inputs
 * inválidos ou se já anexada (idempotent).
 */
export function addTagToStep(
    registry: Record<string, any>,
    stepId: string,
    tagName: string,
    opts: Record<string, any> = {},
): object {
    if (!registry || typeof stepId !== 'string' || !stepId) return registry;
    if (!isValidTagName(tagName)) return registry;
    let next = registry;
    const autoCreate = opts.autoCreate !== false;
    if (!next.tags[tagName]) {
        if (!autoCreate) return registry;
        next = createTag(next, tagName, { now: opts.now }) as Record<string, any>;
    }
    const existing = next.bindings[stepId] || [];
    if (existing.includes(tagName)) return next; // idempotent
    if (existing.length >= TAG_CONSTRAINTS.maxTagsPerStep) return next; // cap
    const updated = Object.freeze([...existing, tagName]);
    return Object.freeze({
        ...next,
        bindings: Object.freeze({ ...next.bindings, [stepId]: updated }),
    });
}

/**
 * Detach tag de step. No-op se não anexada.
 */
export function removeTag(registry: Record<string, any>, stepId: string, tagName: string): object {
    if (!registry || typeof stepId !== 'string' || typeof tagName !== 'string') {
        return registry;
    }
    const list = registry.bindings[stepId];
    if (!list || !list.includes(tagName)) return registry;
    const filtered = list.filter((t: any) => t !== tagName);
    const newBindings = { ...registry.bindings };
    if (filtered.length === 0) {
        delete newBindings[stepId];
    } else {
        newBindings[stepId] = Object.freeze(filtered);
    }
    return Object.freeze({
        ...registry,
        bindings: Object.freeze(newBindings),
    });
}

/**
 * Lista tags anexadas a um step.
 */
export function getTagsForStep(registry: Record<string, any>, stepId: string): string[] {
    if (!registry || typeof stepId !== 'string') return [];
    const list = registry.bindings[stepId] || [];
    return [...list].sort();
}

/**
 * Query: stepIds que têm a tag.
 */
export function queryByTag(registry: Record<string, any>, tagName: string): string[] {
    if (!registry || typeof tagName !== 'string') return [];
    const out = [];
    for (const [stepId, list] of Object.entries(registry.bindings)) {
        if (((list as any[]) || []).includes(tagName)) out.push(stepId);
    }
    return out.sort();
}

/**
 * Query: stepIds que possuem TODAS as tags fornecidas (AND).
 */
export function queryByAllTags(registry: Record<string, any>, tagNames: string[]): string[] {
    if (!registry || !Array.isArray(tagNames) || tagNames.length === 0) return [];
    const out = [];
    for (const [stepId, list] of Object.entries(registry.bindings)) {
        const set = new Set((list as any[]) || []);
        if (tagNames.every((t) => set.has(t))) out.push(stepId);
    }
    return out.sort();
}

/**
 * Summary: contagem de uso por tag, total de bindings, tags órfãs (defined
 * mas sem nenhum binding).
 */
export function summarizeTags(registry: Record<string, any>): object {
    const empty = Object.freeze({
        totalTags: 0,
        totalBindings: 0,
        taggedSteps: 0,
        usage: Object.freeze({}),
        orphanTags: Object.freeze([]),
    });
    if (!registry) return empty;
    const usage: Record<string, number> = {};
    for (const name of Object.keys(registry.tags)) {
        usage[name] = 0;
    }
    let totalBindings = 0;
    let taggedSteps = 0;
    for (const list of Object.values(registry.bindings) as any[][]) {
        if (!list || list.length === 0) continue;
        taggedSteps++;
        for (const t of list) {
            totalBindings++;
            if (Object.prototype.hasOwnProperty.call(usage, t)) {
                (usage[t] as number)++;
            } else {
                usage[t] = 1; // orphan binding (tag deleted but binding exists - defensive)
            }
        }
    }
    const orphanTags = Object.keys(registry.tags)
        .filter((n) => (usage[n] || 0) === 0)
        .sort();
    return Object.freeze({
        totalTags: Object.keys(registry.tags).length,
        totalBindings,
        taggedSteps,
        usage: Object.freeze(usage),
        orphanTags: Object.freeze(orphanTags),
    });
}

/**
 * Module identity export.
 */
export const pipelineTaggingMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 41,
    deliveredAt: '2026-05-01',
    exports: [
        'TAGGING_META',
        'TAG_CONSTRAINTS',
        'createTagRegistry',
        'isValidTagName',
        'createTag',
        'deleteTag',
        'addTagToStep',
        'removeTag',
        'getTagsForStep',
        'queryByTag',
        'queryByAllTags',
        'summarizeTags',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
