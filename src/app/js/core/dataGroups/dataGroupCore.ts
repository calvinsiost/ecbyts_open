// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   DATA GROUPS CORE — SPEC_DATA_GROUPS

   Coleções reutilizáveis de entidades ECBT (elements, observations,
   campaigns, edges) com 6 tipos canônicos. Pure helpers — resolve
   membership dinâmico, gera snapshots imutáveis, valida auditoria.

   IDB/Supabase persistence fica em manager (não aqui).
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Enums (§Colecao Types + required metadata)
// ──────────────────────────────────────────────────────────────────────

export const GROUP_TYPES = Object.freeze(['manual', 'observation', 'family', 'model', 'relation', 'derived']);

export const GROUP_STATUSES = Object.freeze(['draft', 'active', 'audited', 'archived']);

export const AUDIT_RESULTS = Object.freeze(['pass', 'pass_with_issues', 'fail']);

export const GROUP_SCOPES = Object.freeze(['org', 'project', 'model']);

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida shape de data group (§Required Metadata).
 * @param {Record<string, any>} group
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
export function validateDataGroup(group: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!group || typeof group !== 'object') return { valid: false, errors: ['group not object'] };

    if (!group.id || typeof group.id !== 'string') errors.push('id required (string)');
    if (!group.title || typeof group.title !== 'string') errors.push('title required (string)');
    else if (group.title.trim() === '') errors.push('title cannot be empty');
    if (!group.owner_id || typeof group.owner_id !== 'string') errors.push('owner_id required');
    if (!(GROUP_TYPES as readonly string[]).includes(group.type))
        errors.push(`type must be one of: ${GROUP_TYPES.join(', ')}`);
    if (!(GROUP_STATUSES as readonly string[]).includes(group.status))
        errors.push(`status must be one of: ${GROUP_STATUSES.join(', ')}`);
    if (group.scope && !(GROUP_SCOPES as readonly string[]).includes(group.scope))
        errors.push(`scope must be one of: ${GROUP_SCOPES.join(', ')}`);

    return { valid: errors.length === 0, errors };
}

/**
 * Valida audit metadata (§Audit Metadata).
 */
export function validateAuditMetadata(audit: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!audit || typeof audit !== 'object') return { valid: false, errors: ['audit not object'] };
    if (!audit.audited_by || typeof audit.audited_by !== 'string') errors.push('audited_by required');
    if (!audit.audited_at) errors.push('audited_at required');
    if (!(AUDIT_RESULTS as readonly string[]).includes(audit.audit_result))
        errors.push('audit_result must be one of pass/pass_with_issues/fail');
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Membership resolution (por tipo §Colecao Types)
// ──────────────────────────────────────────────────────────────────────

function _resolveManual(group: any, entities: any): any[] {
    const ids = new Set(Array.isArray(group?.definition?.ids) ? group.definition.ids : []);
    return (Array.isArray(entities) ? entities : []).filter((e) => e?.id && ids.has(e.id));
}

function _resolveByFamily(group: any, entities: any): any[] {
    const families = new Set(Array.isArray(group?.definition?.families) ? group.definition.families : []);
    return (Array.isArray(entities) ? entities : []).filter((e) => {
        const f = e?.family || e?.familyId;
        return f && families.has(f);
    });
}

function _resolveByModel(group: any, entities: any): any[] {
    const modelIds = new Set(Array.isArray(group?.definition?.modelIds) ? group.definition.modelIds : []);
    return (Array.isArray(entities) ? entities : []).filter((e) => e?.modelId && modelIds.has(e.modelId));
}

function _resolveByObservation(group: any, entities: any): any[] {
    const filters = group?.definition?.filters || {};
    return (Array.isArray(entities) ? entities : []).filter((e) => {
        if (e?.type !== 'observation') return false;
        for (const [k, v] of Object.entries(filters)) {
            if (e[k] !== v) return false;
        }
        return true;
    });
}

function _resolveByRelation(group: any, entities: any): any[] {
    const sourceIds = new Set(Array.isArray(group?.definition?.sourceIds) ? group.definition.sourceIds : []);
    return (Array.isArray(entities) ? entities : []).filter((e) => {
        // Considera entidades com `source` ou `target` em sourceIds
        return sourceIds.has(e?.source) || sourceIds.has(e?.target);
    });
}

function _resolveDerived(group: any, entities: any): any[] {
    // Query simples: { field, op, value }
    const query = group?.definition?.query;
    if (!query || typeof query !== 'object') return [];
    const { field, op, value } = query;
    return (Array.isArray(entities) ? entities : []).filter((e) => {
        if (e == null) return false;
        const ev = e[field];
        if (op === '==') return ev === value;
        if (op === '!=') return ev !== value;
        if (op === '>=') return Number(ev) >= Number(value);
        if (op === '<=') return Number(ev) <= Number(value);
        if (op === 'includes') return Array.isArray(ev) && ev.includes(value);
        return false;
    });
}

const RESOLVERS = {
    manual: _resolveManual,
    family: _resolveByFamily,
    model: _resolveByModel,
    observation: _resolveByObservation,
    relation: _resolveByRelation,
    derived: _resolveDerived,
};

/**
 * Resolve membership atual do grupo a partir de entities disponíveis.
 *
 * @param {Record<string, any>} group
 * @param {Array<Object>} entities
 * @returns {Array<Object>}
 */
export function computeGroupMembership(group: Record<string, any>, entities: object[]): object[] {
    if (!group || !group.type) return [];
    const resolver = (RESOLVERS as Record<string, any>)[group.type];
    if (!resolver) return [];
    return resolver(group, entities);
}

// ──────────────────────────────────────────────────────────────────────
// Snapshot (§Versioning)
// ──────────────────────────────────────────────────────────────────────

function _genId(): string {
    return `dg-snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Cria snapshot imutável de um grupo (freezing atual membership).
 *
 * @param {Record<string, any>} group
 * @param {Array<Object>} currentMembers
 * @param {string} createdBy
 * @returns {Object}
 */
export function createSnapshot(group: Record<string, any>, currentMembers: object[], createdBy: string): object {
    if (!group) throw new Error('createSnapshot: group required');
    const now = new Date().toISOString();
    const snapshot = {
        version_id: _genId(),
        group_id: group.id,
        parent_group_id: group.parent_group_id || null,
        snapshot_at: now,
        is_snapshot: true,
        definition: group.definition ? { ...group.definition } : null,
        members: Array.isArray(currentMembers)
            ? currentMembers.map((m: any) => ({ entity_type: m.type || 'unknown', entity_id: m.id }))
            : [],
        created_by: createdBy || null,
    };
    return Object.freeze(snapshot);
}

// ──────────────────────────────────────────────────────────────────────
// Quality signals (§"gaps"/quality)
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa quality signals de um grupo - gaps, audit status, size.
 *
 * @param {Record<string, any>} group
 * @param {Array<Object>} members
 * @returns {{
 *   status: string,
 *   memberCount: number,
 *   hasAudit: boolean,
 *   gapsWarning: boolean,
 *   emptyGroup: boolean,
 *   auditResult: string|null
 * }}
 */
export function computeQualitySignals(
    group: Record<string, any>,
    members: object[],
): {
    status: string;
    memberCount: number;
    hasAudit: boolean;
    gapsWarning: boolean;
    emptyGroup: boolean;
    auditResult: string | null;
} {
    if (!group)
        return {
            status: null as unknown as string,
            memberCount: 0,
            hasAudit: false,
            gapsWarning: true,
            emptyGroup: true,
            auditResult: null,
        };
    const count = Array.isArray(members) ? members.length : 0;
    const hasAudit = group.status === 'audited' && group.audit_result;
    return {
        status: group.status,
        memberCount: count,
        hasAudit: !!hasAudit,
        gapsWarning: !hasAudit || count === 0,
        emptyGroup: count === 0,
        auditResult: group.audit_result || null,
    };
}
