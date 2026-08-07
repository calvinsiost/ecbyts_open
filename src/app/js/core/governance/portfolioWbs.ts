// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PORTFOLIO WBS — SPEC_PROJECT_PORTFOLIO_WBS_DECOMPOSITION (GOV-WBS-001)

   Pure helpers para decomposição de portfolio:
   - Projeto = iniciativa macro (§Q1)
   - Spec = WBS work package
   - EVA (Earned Value Analysis): EV/PV/AC per project
   - Regulatory milestones vinculados a WBS
   - ESG governance links

   Supabase persistence + UI em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Schema constants §S1
// ──────────────────────────────────────────────────────────────────────

export const PROJECT_STATUSES: ReadonlyArray<string> = Object.freeze([
    'planning',
    'active',
    'on_hold',
    'completed',
    'cancelled',
]);

export const WBS_LEVELS: ReadonlyArray<string> = Object.freeze(['phase', 'group', 'subgroup', 'task']);

export const WBS_TASK_STATUSES: ReadonlyArray<string> = Object.freeze([
    'not_started',
    'in_progress',
    'completed',
    'blocked',
    'cancelled',
]);

export interface ProjectInput {
    id?: string;
    name?: string;
    ownerId?: string;
    status?: string;
    budget?: number;
    baselineStartAt?: string | number | Date;
    baselineEndAt?: string | number | Date;
}

export interface WbsItem {
    id: string;
    projectId: string;
    parentId?: string;
    level: string;
    name: string;
    status: string;
    progressPct?: number;
    plannedCost?: number;
    actualCost?: number;
    specId?: string;
}

export type WbsTreeNode = WbsItem & { children: Array<WbsTreeNode> };

export interface SpecInput {
    id?: string;
    title?: string;
    status?: string;
    estimateHours?: number;
    costPerHour?: number;
}

export interface ValidationResult {
    valid: boolean;
    errors: Array<string>;
}

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida shape de projeto.
 */
export function validateProject(project: unknown): ValidationResult {
    const errors: Array<string> = [];
    if (!project || typeof project !== 'object') return { valid: false, errors: ['project not object'] };
    const p = project as ProjectInput;
    if (!p.id) errors.push('id required');
    if (!p.name || typeof p.name !== 'string') errors.push('name required');
    if (!p.ownerId) errors.push('ownerId required');
    if (!PROJECT_STATUSES.includes(p.status as string)) {
        errors.push(`status must be one of: ${PROJECT_STATUSES.join(', ')}`);
    }
    if (p.budget != null && (!Number.isFinite(p.budget) || p.budget < 0)) {
        errors.push('budget must be non-negative');
    }
    if (p.baselineStartAt && !Number.isFinite(new Date(p.baselineStartAt).getTime())) {
        errors.push('baselineStartAt invalid date');
    }
    if (p.baselineEndAt && !Number.isFinite(new Date(p.baselineEndAt).getTime())) {
        errors.push('baselineEndAt invalid date');
    }
    return { valid: errors.length === 0, errors };
}

function validateWbsRequiredFields(it: Partial<WbsItem>, errors: Array<string>): void {
    if (!it.id) errors.push('id required');
    if (!it.projectId) errors.push('projectId required');
    if (!WBS_LEVELS.includes(it.level as string)) {
        errors.push(`level must be one of: ${WBS_LEVELS.join(', ')}`);
    }
    if (!it.name) errors.push('name required');
    if (it.level !== 'phase' && !it.parentId) {
        errors.push('parentId required for non-phase levels');
    }
    if (!WBS_TASK_STATUSES.includes(it.status as string)) {
        errors.push(`status must be one of: ${WBS_TASK_STATUSES.join(', ')}`);
    }
}

function validateWbsNumericFields(it: Partial<WbsItem>, errors: Array<string>): void {
    if (it.progressPct != null && (!Number.isFinite(it.progressPct) || it.progressPct < 0 || it.progressPct > 100)) {
        errors.push('progressPct must be in [0, 100]');
    }
    if (it.plannedCost != null && it.plannedCost < 0) errors.push('plannedCost non-negative');
    if (it.actualCost != null && it.actualCost < 0) errors.push('actualCost non-negative');
}

/**
 * Valida shape de WBS item.
 */
export function validateWbsItem(item: unknown): ValidationResult {
    const errors: Array<string> = [];
    if (!item || typeof item !== 'object') return { valid: false, errors: ['item not object'] };
    const it = item as Partial<WbsItem>;
    validateWbsRequiredFields(it, errors);
    validateWbsNumericFields(it, errors);
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// WBS hierarchy builder
// ──────────────────────────────────────────────────────────────────────

/**
 * Constrói árvore WBS a partir de lista flat.
 *
 * @returns phases com children aninhados
 */
export function buildWbsTree(wbsItems: Array<WbsItem>): Array<WbsTreeNode> {
    if (!Array.isArray(wbsItems)) return [];
    const valid = wbsItems.filter((item: WbsItem) => validateWbsItem(item).valid);
    const byId = new Map<string, WbsTreeNode>(
        valid.map((item: WbsItem) => [item.id, { ...item, children: [] } as WbsTreeNode]),
    );
    const roots: Array<WbsTreeNode> = [];

    for (const item of byId.values()) {
        if (item.level === 'phase' || !item.parentId) {
            roots.push(item);
        } else {
            const parent = byId.get(item.parentId);
            if (parent) parent.children.push(item);
            else roots.push(item); // orphan — promover
        }
    }
    return roots;
}

// ──────────────────────────────────────────────────────────────────────
// EVA (Earned Value Analysis) §S2
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa métricas EVA de um projeto.
 *
 * EV (Earned Value) = Σ(plannedCost × progressPct/100)
 * PV (Planned Value) = Σ(plannedCost)
 * AC (Actual Cost) = Σ(actualCost)
 * SV (Schedule Variance) = EV - PV
 * CV (Cost Variance) = EV - AC
 * SPI (Schedule Performance Index) = EV / PV
 * CPI (Cost Performance Index) = EV / AC
 */
export function computeEVA(wbsItems: Array<WbsItem>): {
    EV: number;
    PV: number;
    AC: number;
    SV: number;
    CV: number;
    SPI: number | null;
    CPI: number | null;
    schedulePerformance: 'ahead' | 'on_track' | 'behind';
    costPerformance: 'under' | 'on_track' | 'over';
} {
    const result: {
        EV: number;
        PV: number;
        AC: number;
        SV: number;
        CV: number;
        SPI: number | null;
        CPI: number | null;
    } = { EV: 0, PV: 0, AC: 0, SV: 0, CV: 0, SPI: null, CPI: null };
    if (!Array.isArray(wbsItems)) {
        return { ...result, schedulePerformance: 'on_track', costPerformance: 'on_track' };
    }

    for (const item of wbsItems) {
        if (!validateWbsItem(item).valid) continue;
        // Só contabiliza tasks (folhas); phases/groups/subgroups são rollup
        if (item.level !== 'task') continue;
        const planned = Number(item.plannedCost) || 0;
        const actual = Number(item.actualCost) || 0;
        const progress = (Number(item.progressPct) || 0) / 100;
        result.PV += planned;
        result.AC += actual;
        result.EV += planned * progress;
    }

    result.SV = result.EV - result.PV;
    result.CV = result.EV - result.AC;
    result.SPI = result.PV > 0 ? result.EV / result.PV : null;
    result.CPI = result.AC > 0 ? result.EV / result.AC : null;

    const schedulePerformance: 'ahead' | 'on_track' | 'behind' =
        result.SV > 0.05 * result.PV ? 'ahead' : result.SV < -0.05 * result.PV ? 'behind' : 'on_track';
    const costPerformance: 'under' | 'on_track' | 'over' =
        result.CV > 0.05 * result.AC ? 'under' : result.CV < -0.05 * result.AC ? 'over' : 'on_track';

    return { ...result, schedulePerformance, costPerformance };
}

// ──────────────────────────────────────────────────────────────────────
// Rollup progress (phase → group → subgroup → task)
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa progress de phase baseado em children tasks.
 *
 * @param phase - com children aninhados via buildWbsTree
 * @returns 0..100
 */
export function computePhaseProgress(phase: WbsTreeNode): number {
    if (!phase || !Array.isArray(phase.children)) return 0;
    // Recursive: soma plannedCost × progress / soma plannedCost
    let totalPlanned = 0;
    let totalProgress = 0;
    const walk = (node: WbsTreeNode): void => {
        if (node.level === 'task') {
            const planned = Number(node.plannedCost) || 0;
            totalPlanned += planned;
            totalProgress += planned * ((Number(node.progressPct) || 0) / 100);
        }
        if (Array.isArray(node.children)) {
            for (const c of node.children) walk(c);
        }
    };
    walk(phase);
    return totalPlanned > 0 ? (totalProgress / totalPlanned) * 100 : 0;
}

// ──────────────────────────────────────────────────────────────────────
// Spec → WBS mapping (§S1)
// ──────────────────────────────────────────────────────────────────────

/**
 * Mapeia spec metadata para WBS work package.
 *
 * @param spec - { id, title, phase, group, subgroup?, estimate, status }
 * @param projectId - WBS parent (phase/group)
 * @returns WBS task
 */
export function mapSpecToWbsTask(spec: SpecInput, projectId: string, parentId: string): WbsItem | null {
    if (!spec || !projectId) return null;
    const task: WbsItem = {
        id: `wbs-${spec.id || Date.now()}`,
        projectId,
        parentId,
        level: 'task',
        name: spec.title || spec.id || 'Untitled spec',
        status: spec.status === 'done' ? 'completed' : spec.status === 'draft' ? 'not_started' : 'in_progress',
        plannedCost: Number(spec.estimateHours) * (Number(spec.costPerHour) || 0) || 0,
        actualCost: 0,
        progressPct: spec.status === 'done' ? 100 : 0,
    };
    if (spec.id !== undefined) task.specId = spec.id;
    return task;
}
