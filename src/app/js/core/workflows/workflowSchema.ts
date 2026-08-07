// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   WORKFLOW SCHEMA — DAG-validated declarative workflow schema
   Esquema declarativo com validação de grafo acíclico dirigido.

   Referência: Kahn, A.B. (1962). "Topological sorting of large networks".
   Communications of the ACM. 5 (11): 558-562. doi:10.1145/368996.369025

   Módulo puro — sem DOM, sem IDB, sem rede.
   ================================================================ */

// ----------------------------------------------------------------
// ENUMERAÇÕES - Tipos e estados de steps
// ----------------------------------------------------------------

/**
 * Tipos canônicos de step em um workflow.
 * @type {Readonly<{TASK:string, DECISION:string, PARALLEL:string, WAIT:string, END:string}>}
 */
export const STEP_TYPES: Readonly<{
    TASK: string;
    DECISION: string;
    PARALLEL: string;
    WAIT: string;
    END: string;
}> = Object.freeze({
    TASK: 'task',
    DECISION: 'decision',
    PARALLEL: 'parallel',
    WAIT: 'wait',
    END: 'end',
});

/**
 * Estados possíveis de um step durante execução.
 * @type {Readonly<{PENDING:string, RUNNING:string, COMPLETED:string, FAILED:string, SKIPPED:string}>}
 */
export const STEP_STATUS: Readonly<{
    PENDING: string;
    RUNNING: string;
    COMPLETED: string;
    FAILED: string;
    SKIPPED: string;
}> = Object.freeze({
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
});

// ----------------------------------------------------------------
// TYPE DEFINITIONS
// ----------------------------------------------------------------

interface WorkflowStep {
    id: string;
    type: string;
    label?: string;
    description?: string;
    dependsOn?: string[];
    condition?: string | null;
    eisThreshold?: number | null;
}

interface Workflow {
    id: string;
    steps: WorkflowStep[];
    version?: number;
    createdAt?: string;
    name?: string;
    description?: string;
}

interface WorkflowDagValidation {
    valid: boolean;
    errors: string[];
    cycles: string[][];
}

interface StepInstanceState {
    status: string;
    startedAt: string | null;
    completedAt: string | null;
}

interface WorkflowInstance {
    workflowId: string;
    startedAt: string;
    stepStates: { [stepId: string]: StepInstanceState };
}

// ----------------------------------------------------------------
// FÁBRICA DE STEPS
// ----------------------------------------------------------------

/**
 * Cria um step de workflow imutável.
 *
 * @param {string} id Identificador único do step
 * @param {string} type Tipo do step (deve pertencer a STEP_TYPES)
 * @param {Object} [options={}] Opções: label, description, dependsOn, condition, eisThreshold
 * @returns {Readonly<WorkflowStep>}
 * @throws {Error}
 */
export function createWorkflowStep(
    id: string,
    type: string,
    options: Record<string, any> = {},
): Readonly<WorkflowStep> {
    if (!id || typeof id !== 'string' || id.trim() === '') {
        throw new Error('createWorkflowStep: id must be a non-empty string');
    }
    const validTypes = Object.values(STEP_TYPES);
    if (!validTypes.includes(type)) {
        throw new Error(`createWorkflowStep: invalid type "${type}". Valid types: ${validTypes.join(', ')}`);
    }

    return Object.freeze({
        id: id.trim(),
        type,
        label: '',
        description: '',
        dependsOn: [],
        condition: null,
        eisThreshold: null,
        ...options,
    });
}

// ----------------------------------------------------------------
// FÁBRICA DE WORKFLOW
// ----------------------------------------------------------------

/**
 * Cria um workflow imutável com conjunto de steps.
 *
 * @param {string} id Identificador único do workflow
 * @param {Array<WorkflowStep>} steps Array de steps
 * @param {Object} [options={}] Opções: name, description, version override
 * @returns {Readonly<Workflow>}
 * @throws {Error}
 */
export function createWorkflow(
    id: string,
    steps: Array<WorkflowStep>,
    options: Record<string, any> = {},
): Readonly<Workflow> {
    if (!id || typeof id !== 'string' || id.trim() === '') {
        throw new Error('createWorkflow: id must be a non-empty string');
    }
    if (!Array.isArray(steps)) {
        throw new Error('createWorkflow: steps must be an array');
    }

    return Object.freeze({
        id: id.trim(),
        steps,
        version: 1,
        createdAt: new Date().toISOString(),
        ...options,
    });
}

// ----------------------------------------------------------------
// VALIDAÇÃO DO DAG - Algoritmo de Kahn (1962)
// ----------------------------------------------------------------

/**
 * Valida se o workflow constitui um DAG válido.
 *
 * @param {Workflow} workflow
 * @returns {WorkflowDagValidation}
 */
export function validateWorkflowDag(workflow: Workflow): WorkflowDagValidation {
    const errors: string[] = [];
    const cycles: string[][] = [];

    if (!workflow || !Array.isArray(workflow.steps)) {
        return { valid: false, errors: ['workflow.steps must be an array'], cycles };
    }

    const steps = workflow.steps as WorkflowStep[];

    const idSet = new Set<string>();
    for (const step of steps) {
        if (idSet.has(step.id)) {
            errors.push(`Duplicate step id: "${step.id}"`);
        }
        idSet.add(step.id);
    }

    for (const step of steps) {
        const deps = Array.isArray(step.dependsOn) ? step.dependsOn : [];
        for (const dep of deps) {
            if (!idSet.has(dep)) {
                errors.push(`Step "${step.id}" depends on unknown step id: "${dep}"`);
            }
        }
    }

    const hasEnd = steps.some((s) => s.type === STEP_TYPES.END);
    if (!hasEnd) {
        errors.push('Workflow must have at least one END step');
    }

    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const step of steps) {
        if (!inDegree.has(step.id)) inDegree.set(step.id, 0);
        if (!adjacency.has(step.id)) adjacency.set(step.id, []);
    }

    for (const step of steps) {
        const deps = Array.isArray(step.dependsOn) ? step.dependsOn : [];
        for (const dep of deps) {
            if (!idSet.has(dep)) continue;
            if (!adjacency.has(dep)) adjacency.set(dep, []);
            const adjList = adjacency.get(dep);
            if (adjList) adjList.push(step.id);
            inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
        }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
        if (degree === 0) queue.push(id);
    }

    let visited = 0;
    while (queue.length > 0) {
        const current = queue.shift() as string;
        visited++;
        const neighbors = adjacency.get(current) || [];
        for (const neighbor of neighbors) {
            const newDegree = (inDegree.get(neighbor) || 0) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) queue.push(neighbor);
        }
    }

    if (visited < steps.length) {
        const cycleNodes: string[] = [];
        for (const [id, degree] of inDegree) {
            if (degree > 0) cycleNodes.push(id);
        }
        if (cycleNodes.length > 0) {
            cycles.push(cycleNodes);
            errors.push(`Cycle detected in workflow involving steps: ${cycleNodes.join(', ')}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        cycles,
    };
}

// ----------------------------------------------------------------
// ORDENAÇÃO TOPOLÓGICA
// ----------------------------------------------------------------

/**
 * Resolve a ordem de execução dos steps via ordenação topológica (Kahn).
 *
 * @param {Workflow} workflow
 * @returns {string[]}
 * @throws {Error}
 */
export function resolveExecutionOrder(workflow: Workflow): string[] {
    const validation = validateWorkflowDag(workflow);
    if (validation.cycles.length > 0) {
        throw new Error(
            `Cannot resolve execution order: cycle detected involving steps: ${validation.cycles.flat().join(', ')}`,
        );
    }

    const steps = workflow.steps as WorkflowStep[];
    const idSet = new Set(steps.map((s) => s.id));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const step of steps) {
        inDegree.set(step.id, 0);
        adjacency.set(step.id, []);
    }

    for (const step of steps) {
        const deps = Array.isArray(step.dependsOn) ? step.dependsOn : [];
        for (const dep of deps) {
            if (!idSet.has(dep)) continue;
            const adjList = adjacency.get(dep);
            if (adjList) adjList.push(step.id);
            inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
        }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
        if (degree === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
        const current = queue.shift() as string;
        order.push(current);
        const neighbors = adjacency.get(current) || [];
        for (const neighbor of neighbors) {
            const newDegree = (inDegree.get(neighbor) || 0) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) queue.push(neighbor);
        }
    }

    return order;
}

// ----------------------------------------------------------------
// FILTRO POR STATUS
// ----------------------------------------------------------------

/**
 * Filtra IDs de steps pelo status em um instanceState.
 *
 * @param {Workflow} workflow
 * @param {Map<string, StepInstanceState>|{[stepId: string]: StepInstanceState}} instanceState
 * @param {string} status
 * @returns {string[]}
 */
export function filterStepsByStatus(
    workflow: Workflow,
    instanceState: Map<string, StepInstanceState> | { [stepId: string]: StepInstanceState },
    status: string,
): string[] {
    if (!workflow || !Array.isArray(workflow.steps)) return [];

    /**
     * @param {string} workflow
     * @returns {string|undefined}
     */
    const getStatus = (id: string): string | undefined => {
        if (instanceState instanceof Map) {
            return instanceState.get(id)?.status;
        }
        return instanceState?.[id]?.status;
    };

    return workflow.steps
        .filter((step: WorkflowStep) => getStatus(step.id) === status)
        .map((step: WorkflowStep) => step.id);
}

// ----------------------------------------------------------------
// INSTÂNCIA DE WORKFLOW
// ----------------------------------------------------------------

/**
 * Constrói uma instância de execução de workflow com todos os steps em PENDING.
 *
 * @param {Workflow} workflow
 * @returns {WorkflowInstance}
 */
export function buildWorkflowInstance(workflow: Workflow): WorkflowInstance {
    if (!workflow || !workflow.id) {
        throw new Error('buildWorkflowInstance: workflow must have an id');
    }

    const stepStates: { [stepId: string]: StepInstanceState } = {};
    if (Array.isArray(workflow.steps)) {
        for (const step of workflow.steps) {
            stepStates[step.id] = {
                status: STEP_STATUS.PENDING,
                startedAt: null,
                completedAt: null,
            };
        }
    }

    return {
        workflowId: workflow.id,
        startedAt: new Date().toISOString(),
        stepStates,
    };
}
