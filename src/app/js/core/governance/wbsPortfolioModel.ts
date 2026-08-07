// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WBS PORTFOLIO MODEL — SPEC_PROJECT_PORTFOLIO_WBS_DECOMPOSITION (GOV-WBS-001)

   Pure-logic module: zero DOM, zero IDB, zero localStorage, zero fetch.
   Accepts arrays of spec/WBS objects and returns computed data structures.

   Exports:
     buildWbsHierarchy(specs)
     computeEvaProgress(wbs)
     groupByProject(wbs)
     findCriticalPath(wbs, dependencies)
     filterByStatus(wbs, status)
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Canonical project assignment rules
// Maps spec categories / keywords to one of 3 macro projects
// ──────────────────────────────────────────────────────────────────────

const PROJECT_ASSIGNMENT_RULES: Record<string, string> = {
    // PRJ-UNC: Uncertainty & Scientific
    UNC: 'PRJ-UNC',
    DECISION: 'PRJ-UNC',
    MONITORING_OPTIMIZATION: 'PRJ-UNC',
    QUALITATIVE_TO: 'PRJ-UNC',
    UNCERTAINTY: 'PRJ-UNC',

    // PRJ-ARCH: Architecture & Infrastructure
    PROJECT_TABS: 'PRJ-ARCH',
    ADMIN: 'PRJ-ARCH',
    ARCH: 'PRJ-ARCH',
    DATA: 'PRJ-ARCH',
    RECONCILIATION: 'PRJ-ARCH',
    SUPABASE: 'PRJ-ARCH',

    // PRJ-OPS: Operations & Governance
    PROJECT_PORTFOLIO: 'PRJ-OPS',
    TICKETS: 'PRJ-OPS',
    GOVERNANCE: 'PRJ-OPS',
    ESG: 'PRJ-OPS',
    GEOREF: 'PRJ-OPS',
};

const PROJECT_DEFS = Object.freeze({
    'PRJ-UNC': { id: 'PRJ-UNC', name: 'Uncertainty & Scientific', description: 'UNC_* + DECISION_* specs' },
    'PRJ-ARCH': {
        id: 'PRJ-ARCH',
        name: 'Architecture & Infrastructure',
        description: 'PROJECT_TABS + ADMIN + ARCH + DATA specs',
    },
    'PRJ-OPS': {
        id: 'PRJ-OPS',
        name: 'Operations & Governance',
        description: 'TICKETS + PORTFOLIO + governance specs',
    },
});

/**
 * Resolve projectId para um specId usando regras determinísticas + fallback.
 *
 * @returns projectId canônico
 */
function resolveProjectId(specId: string): string {
    const id = String(specId || '').toUpperCase();
    for (const [prefix, projectId] of Object.entries(PROJECT_ASSIGNMENT_RULES)) {
        if (id.startsWith(prefix)) return projectId;
    }
    return 'PRJ-ARCH'; // fallback conservador
}

// ──────────────────────────────────────────────────────────────────────
// buildWbsHierarchy
// ──────────────────────────────────────────────────────────────────────

/**
 * Constrói hierarquia WBS a partir de array de specs.
 * Regra canônica: Projeto = iniciativa, Spec = WBS work package.
 */
export function buildWbsHierarchy(
    specs: Array<{
        specId: string;
        status: string;
        priority: string;
        estimatedDays?: number;
        owner?: string;
        title?: string;
        group?: string;
    }>,
): {
    projects: Record<string, { id: string; name: string; wbs: any[] }>;
    wbsById: Record<string, object>;
} {
    if (!Array.isArray(specs)) {
        return { projects: {}, wbsById: {} };
    }

    const projects: Record<
        string,
        { id: string; name: string; description: string; wbs: any[] }
    > = {};
    const wbsById: Record<string, object> = {};

    // Initialize all projects
    for (const def of Object.values(PROJECT_DEFS)) {
        projects[def.id] = { ...def, wbs: [] };
    }

    let counter = 1;
    for (const spec of specs) {
        if (!spec || !spec.specId) continue;
        const projectId = resolveProjectId(spec.specId);
        const proj = projects[projectId];
        if (!proj) continue;
        const wbsId = `${counter}.${String(proj.wbs.length + 1)}`;

        const entry = {
            id: wbsId,
            specId: spec.specId,
            title: spec.title || spec.specId,
            status: spec.status || 'pending',
            priority: spec.priority || 'P3',
            owner: spec.owner || '',
            estimatedDays: Number(spec.estimatedDays) || 0,
            group: spec.group || 'General',
            projectId,
        };

        proj.wbs.push(entry);
        wbsById[wbsId] = entry;
        counter++;
    }

    return { projects, wbsById };
}

// ──────────────────────────────────────────────────────────────────────
// computeEvaProgress
// ──────────────────────────────────────────────────────────────────────

/**
 * Calcula progresso EVA simplificado para um array de WBS entries.
 * Considera estimatedDays como peso do PV.
 */
export function computeEvaProgress(
    wbs: Array<{ specId: string; status: string; estimatedDays?: number }>,
): {
    planned: number;
    done: number;
    pending: number;
    percentComplete: number;
} {
    if (!Array.isArray(wbs) || wbs.length === 0) {
        return { planned: 0, done: 0, pending: 0, percentComplete: 0 };
    }

    let planned = 0;
    let done = 0;

    for (const item of wbs) {
        const days = Math.max(0, Number(item.estimatedDays) || 1); // default 1 day per item
        planned += days;
        if (item.status === 'done' || item.status === 'completed') {
            done += days;
        }
    }

    const pending = planned - done;
    const percentComplete = planned > 0 ? Math.round((done / planned) * 100) : 0;

    return { planned, done, pending, percentComplete };
}

// ──────────────────────────────────────────────────────────────────────
// groupByProject
// ──────────────────────────────────────────────────────────────────────

/**
 * Agrupa WBS entries por projectId.
 * Entradas sem projectId explícito são resolvidas via specId.
 */
export function groupByProject(
    wbs: Array<{ specId?: string; projectId?: string; status: string; estimatedDays?: number }>,
): Record<string, any[]> {
    if (!Array.isArray(wbs)) return {};

    const groups: Record<string, any[]> = {};

    for (const item of wbs) {
        const pid = item.projectId || resolveProjectId(item.specId || '');
        if (!groups[pid]) groups[pid] = [];
        (groups[pid] as any[]).push(item);
    }

    return groups;
}

// ──────────────────────────────────────────────────────────────────────
// findCriticalPath
// ──────────────────────────────────────────────────────────────────────

/**
 * Encontra o caminho crítico - itens desbloqueados (sem dependências não concluídas)
 * ordenados por prioridade e estimativa.
 *
 * @param dependencies - { specId: [dependsOnSpecId, ...] }
 * @returns specIds no caminho crítico (sem predecessores pendentes, primeiro)
 */
export function findCriticalPath(
    wbs: Array<{ specId: string; status: string; priority?: string; estimatedDays?: number }>,
    dependencies: Record<string, Array<string>>,
): Array<string> {
    if (!Array.isArray(wbs)) return [];

    const deps = dependencies && typeof dependencies === 'object' ? dependencies : {};
    const doneSet = new Set(wbs.filter((i) => i.status === 'done' || i.status === 'completed').map((i) => i.specId));

    // Item is "unblocked" if all its dependencies are done (or it has none)
    const unblocked = wbs.filter((item) => {
        if (item.status === 'done' || item.status === 'completed') return false;
        const itemDeps = deps[item.specId] || [];
        return itemDeps.every((dep) => doneSet.has(dep));
    });

    // Sort: P0 first, then P1, P2, P3; within same priority, higher estimatedDays first
    const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    unblocked.sort((a, b) => {
        const pa = priorityOrder[a.priority ?? ''] ?? 9;
        const pb = priorityOrder[b.priority ?? ''] ?? 9;
        if (pa !== pb) return pa - pb;
        return (Number(b.estimatedDays) || 0) - (Number(a.estimatedDays) || 0);
    });

    return unblocked.map((i) => i.specId);
}

// ──────────────────────────────────────────────────────────────────────
// filterByStatus
// ──────────────────────────────────────────────────────────────────────

/**
 * Filtra WBS entries por status (ou lista de status).
 *
 * @param status - status ou array de status a incluir
 */
export function filterByStatus(
    wbs: Array<{ specId: string; status: string }>,
    status: string | Array<string>,
): any[] {
    if (!Array.isArray(wbs)) return [];
    const allowedSet = new Set(Array.isArray(status) ? status : [status]);
    return wbs.filter((item) => allowedSet.has(item.status));
}
