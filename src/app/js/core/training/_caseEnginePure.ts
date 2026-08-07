// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CASE ENGINE (pure) — LMS-INTERACTIVE-ASSESS-001 F2 / RF-1
   ================================================================
   Calvin 2026-06-14: motor de "Caso Ambiental Interativo" — análogo ao Full
   Code Medical, sobre o sítio/digital twin. Estado inicial + catálogo de ações
   categorizadas + regras ação→efeito (declarativas) + ordenação por
   pré-requisitos. A pontuação fica em _caseRubricPure.

   Casos são DADOS (CaseDefinition), não código → curáveis e vendáveis sem
   deploy. PURE: sem IO/DOM/THREE. Estado imutável (applyAction retorna novo).
   ================================================================ */

export type ActionCategory =
    | 'investigation'
    | 'classification'
    | 'risk'
    | 'remediation'
    | 'regulatory'
    | 'finalize';

export interface CaseActionDef {
    readonly id: string;
    readonly category: ActionCategory;
    readonly label: string;
    readonly costCents?: number;
    readonly durationDays?: number;
    /** flags exigidas antes (ordenação: ex. caracterizar antes de remediar). */
    readonly requiresFlags?: readonly string[];
    /** flags que esta ação define ao ser executada. */
    readonly setsFlags?: readonly string[];
    /** texto exibido após executar. */
    readonly result: string;
    /** dica quando a ação é executada fora de ordem / inadequada. */
    readonly hint?: string;
    /** false = ação inadequada para o caso (ex.: técnica errada). default true. */
    readonly appropriate?: boolean;
    /** pode ser repetida? default false. */
    readonly repeatable?: boolean;
}

export interface CaseRubricDimension {
    readonly id: string;
    readonly label: string;
    readonly weight: number;
    /** flag que indica sucesso da dimensão; '__cost__' = derivada do orçamento. */
    readonly successFlag: string;
}

export interface CaseVeto {
    readonly id: string;
    readonly whenFlag: string;
    readonly message: string;
}

export interface CaseDefinition {
    readonly id: string;
    readonly title: string;
    readonly scenario: string;
    readonly budgetCents: number;
    readonly actions: readonly CaseActionDef[];
    readonly rubric: {
        readonly dimensions: readonly CaseRubricDimension[];
        readonly vetoes: readonly CaseVeto[];
    };
}

export interface PerformedEntry {
    readonly actionId: string;
    readonly category: ActionCategory;
    readonly label: string;
    readonly result: string;
    readonly correct: boolean;
    readonly at: number;
}

export interface CaseState {
    readonly caseId: string;
    readonly step: number;
    readonly performed: readonly PerformedEntry[];
    readonly flags: Readonly<Record<string, boolean>>;
    /** se a flag foi definida por uma ação CORRETA (em ordem + adequada). */
    readonly flagCorrect: Readonly<Record<string, boolean>>;
    readonly budgetSpentCents: number;
    readonly daysElapsed: number;
    readonly done: boolean;
}

export interface ActionOutcome {
    readonly state: CaseState;
    readonly result: string;
    readonly correct: boolean;
    readonly hint?: string;
}

/** Estado inicial imutável do caso. */
export function createCaseState(def: CaseDefinition): CaseState {
    return Object.freeze({
        caseId: def.id,
        step: 0,
        performed: Object.freeze([]),
        flags: Object.freeze({}),
        flagCorrect: Object.freeze({}),
        budgetSpentCents: 0,
        daysElapsed: 0,
        done: false,
    });
}

/** Ações ainda disponíveis (não concluído; não já-realizadas salvo repeatable). */
export function listAvailableActions(
    state: CaseState,
    def: CaseDefinition,
): readonly CaseActionDef[] {
    if (state.done) return Object.freeze([]);
    const performedIds = new Set(state.performed.map((p) => p.actionId));
    return Object.freeze(def.actions.filter((a) => a.repeatable || !performedIds.has(a.id)));
}

function _allFlags(flags: Readonly<Record<string, boolean>>, required?: readonly string[]): boolean {
    if (!required || required.length === 0) return true;
    return required.every((f) => flags[f] === true);
}

/** Aplica uma ação: retorna novo estado + resultado/acerto/dica. Imutável. */
export function applyAction(state: CaseState, def: CaseDefinition, actionId: string): ActionOutcome {
    if (state.done) return Object.freeze({ state, result: 'O caso já foi finalizado.', correct: false });
    const action = def.actions.find((a) => a.id === actionId);
    if (!action) return Object.freeze({ state, result: 'Ação não encontrada.', correct: false });

    const already = state.performed.some((p) => p.actionId === actionId);
    if (already && !action.repeatable) {
        return Object.freeze({ state, result: 'Esta ação já foi realizada.', correct: false, hint: 'já realizada' });
    }

    const inOrder = _allFlags(state.flags, action.requiresFlags);
    const appropriate = action.appropriate !== false;
    const correct = inOrder && appropriate;
    const hint = !inOrder
        ? action.hint || 'Faltou um pré-requisito (ex.: caracterizar antes de remediar).'
        : !appropriate
          ? action.hint || 'Ação inadequada para este caso.'
          : undefined;

    const flags: Record<string, boolean> = { ...state.flags };
    const flagCorrect: Record<string, boolean> = { ...state.flagCorrect };
    for (const f of action.setsFlags || []) {
        flags[f] = true;
        // mantém "correto" se QUALQUER ação correta definiu a flag; só piora se ainda não correto.
        flagCorrect[f] = flagCorrect[f] === true ? true : correct;
    }

    const entry: PerformedEntry = Object.freeze({
        actionId: action.id,
        category: action.category,
        label: action.label,
        result: action.result,
        correct,
        at: state.step + 1,
    });

    return Object.freeze({
        state: Object.freeze({
            caseId: state.caseId,
            step: state.step + 1,
            performed: Object.freeze([...state.performed, entry]),
            flags: Object.freeze(flags),
            flagCorrect: Object.freeze(flagCorrect),
            budgetSpentCents: state.budgetSpentCents + Math.max(0, Math.round(action.costCents || 0)),
            daysElapsed: state.daysElapsed + Math.max(0, Math.round(action.durationDays || 0)),
            done: action.category === 'finalize',
        }),
        result: action.result,
        correct,
        ...(hint ? { hint } : {}),
    });
}

/** True quando o caso foi finalizado. */
export function isComplete(state: CaseState): boolean {
    return state.done === true;
}
