// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   WORKFLOW ENGINE — State machine generica para workflows guiados
   Maquina de estados imutavel para pipelines ambientais.

   Padrão seguido: core/ingestion/wizard.js (imutável, funcoes puras)

   Tipos de step:
   - info      → Informacao, sem input do usuario
   - decision  → Coleta decisoes (radio, dropdown, picker)
   - execution → Operacao async (interpolacao, validacao) com progresso
   - review    → Resultados finais, aceitar ou voltar

   ================================================================ */

// ================================================================
// TYPEDEFS - Tipos locais (sem dependencia externa)
// ================================================================

interface StepDefinition {
    id: string;
    /** 'info' | 'decision' | 'execution' | 'review' */
    type: string;
    titleKey?: string;
    descKey?: string;
    options?: Record<string, unknown>;
    canSkip?: (context: WorkflowContext) => boolean;
    validate?: (state: WorkflowState) => { valid: boolean; errors: string[] };
    execute?: (state: WorkflowState, onProgress?: (pct: number) => void) => Promise<unknown> | unknown;
}

interface WorkflowDefinition {
    id: string;
    steps: Array<StepDefinition>;
    nameKey?: string;
    descKey?: string;
    icon?: string;
    regulation?: string;
    prerequisites?: (appState: any) => { met: boolean; missing: string[] };
}

interface WorkflowContext {
    prefill?: Record<string, unknown>;
    appState?: Record<string, unknown>;
}

interface WorkflowState {
    definitionId: string;
    definition: WorkflowDefinition;
    steps: Array<StepDefinition>;
    stepIndex: number;
    decisions: Record<string, unknown>;
    results: Record<string, unknown>;
    history: number[];
    /** 'active' | 'completed' | 'failed' */
    status: string;
    error: string | null;
    context: WorkflowContext;
}

interface StepRenderInfo {
    stepId: string;
    type: string;
    titleKey: string | undefined;
    descKey: string | undefined;
    stepNumber: number;
    totalSteps: number;
    canGoBack: boolean;
    canGoForward: boolean;
    isLastStep: boolean;
    options: Record<string, unknown> | null;
    decisions: Record<string, unknown>;
    results: Record<string, unknown>;
    status: string;
}

// ================================================================
// LIFECYCLE - Criar, avancar, voltar
// ================================================================

/**
 * Cria estado inicial de um workflow.
 *
 * @param definition - Definicao do workflow
 * @param context - Contexto inicial (appState, prefill decisions)
 */
export function createWorkflow(definition: WorkflowDefinition, context: WorkflowContext = {}): WorkflowState {
    const steps = definition.steps.filter((step: StepDefinition) => {
        if (typeof step.canSkip === 'function') {
            return !step.canSkip(context);
        }
        return true;
    });

    return {
        definitionId: definition.id,
        definition,
        steps,
        stepIndex: 0,
        decisions: { ...(context.prefill || {}) },
        results: {},
        history: [0],
        status: 'active', // 'active' | 'completed' | 'failed'
        error: null,
        context,
    };
}

/**
 * Avanca o workflow para o proximo step.
 * Aplica a decisao do usuario antes de avancar.
 *
 * @param state - Estado atual
 * @param userDecision - Decisao do step atual (chave-valor)
 * @returns Novo estado (imutavel)
 */
export function advanceWorkflow(state: WorkflowState, userDecision: Record<string, unknown> = {}): WorkflowState {
    if (state.status !== 'active') return state;

    const newDecisions = { ...state.decisions, ...userDecision };
    const nextIndex = state.stepIndex + 1;

    if (nextIndex >= state.steps.length) {
        // Workflow completo
        return {
            ...state,
            decisions: newDecisions,
            status: 'completed',
            history: [...state.history, nextIndex],
        };
    }

    return {
        ...state,
        stepIndex: nextIndex,
        decisions: newDecisions,
        history: [...state.history, nextIndex],
    };
}

/**
 * Volta o workflow para o step anterior.
 */
export function goBackWorkflow(state: WorkflowState): WorkflowState {
    if (state.stepIndex <= 0) return state;

    return {
        ...state,
        stepIndex: state.stepIndex - 1,
        history: [...state.history, state.stepIndex - 1],
    };
}

/**
 * Salva resultado de um step de execucao no estado.
 *
 * @param state
 * @param stepId - ID do step que gerou o resultado
 * @param result - Dados de resultado
 */
export function setStepResult(state: WorkflowState, stepId: string, result: unknown): WorkflowState {
    return {
        ...state,
        results: {
            ...state.results,
            [stepId]: result,
        },
    };
}

/**
 * Marca o workflow como falho.
 */
export function failWorkflow(state: WorkflowState, errorMessage: string): WorkflowState {
    return {
        ...state,
        status: 'failed',
        error: errorMessage,
    };
}

// ================================================================
// QUERIES - Ler informacoes do estado
// ================================================================

/**
 * Retorna info do step atual para renderizacao na UI.
 */
export function getWorkflowStep(state: WorkflowState): StepRenderInfo | null {
    const step = state.steps[state.stepIndex];
    if (!step) return null;

    return {
        stepId: step.id,
        type: step.type,
        titleKey: step.titleKey,
        descKey: step.descKey,
        stepNumber: state.stepIndex + 1,
        totalSteps: state.steps.length,
        canGoBack: state.stepIndex > 0,
        canGoForward: state.stepIndex < state.steps.length - 1,
        isLastStep: state.stepIndex === state.steps.length - 1,
        options: step.options || null,
        decisions: state.decisions,
        results: state.results,
        status: state.status,
    };
}

/**
 * Retorna progresso do workflow como fracao (0 a 1).
 */
export function getWorkflowProgress(state: WorkflowState): number {
    if (state.steps.length === 0) return 1;
    if (state.status === 'completed') return 1;
    return state.stepIndex / state.steps.length;
}

/**
 * Verifica se o workflow esta completo.
 */
export function isWorkflowComplete(state: WorkflowState): boolean {
    return state.status === 'completed';
}

/**
 * Retorna o step atual (definicao completa).
 */
export function getCurrentStep(state: WorkflowState): StepDefinition | null {
    return state.steps[state.stepIndex] || null;
}

/**
 * Verifica se o step atual requer execucao async.
 */
export function isExecutionStep(state: WorkflowState): boolean {
    const step = getCurrentStep(state);
    return step?.type === 'execution';
}

/**
 * Valida o step atual antes de avancar.
 * Chama a funcao validate() do step se definida.
 */
export function validateCurrentStep(state: WorkflowState): { valid: boolean; errors: string[] } {
    const step = getCurrentStep(state);
    if (!step || typeof step.validate !== 'function') {
        return { valid: true, errors: [] };
    }
    return step.validate(state);
}
