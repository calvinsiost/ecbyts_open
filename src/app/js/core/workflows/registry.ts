// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * registry.ts — Phase 2 TS source for workflow registry.
 * Note: keeps StepDefinition as `unknown` since engine.js is not yet TS source.
 * When engine.ts is created, replace `unknown` with import('./engine.js').StepDefinition.
 */

export interface PrerequisiteResult {
    met: boolean;
    missing: string[];
}

export interface WorkflowDefinition {
    id: string;
    steps: unknown[];
    nameKey?: string;
    descKey?: string;
    icon?: string;
    regulation?: string;
    prerequisites?: (appState: unknown) => PrerequisiteResult;
}

const _workflows = new Map<string, WorkflowDefinition>();

export function registerWorkflow(definition: WorkflowDefinition): void {
    if (!definition?.id) {
        throw new Error('Workflow definition must have an id');
    }
    _workflows.set(definition.id, definition);
}

export function getWorkflow(id: string): WorkflowDefinition | undefined {
    return _workflows.get(id);
}

export function getAllWorkflows(): WorkflowDefinition[] {
    return [..._workflows.values()];
}

export function getWorkflowsByRegulation(regulation: string): WorkflowDefinition[] {
    return getAllWorkflows().filter((w) => w.regulation && w.regulation.includes(regulation));
}

export function checkPrerequisites(workflowId: string, appState: unknown): PrerequisiteResult {
    const def = _workflows.get(workflowId);
    if (!def) return { met: false, missing: ['workflow.prereq.notFound'] };
    if (typeof def.prerequisites !== 'function') return { met: true, missing: [] };
    return def.prerequisites(appState);
}
