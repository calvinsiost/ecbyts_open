// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PROTOCOL DECISION GATE — PIPELINE-UNIFIED-PROTOCOL RF3

   DMN-inspired decision gate as a first-class protocol object.
   A gate poses a question, evaluates branch predicates against a
   context, and selects exactly one branch (or the explicit fallback).

   Spec: docs/specs/features/SPEC_PIPELINE_UNIFIED_PROTOCOL.md
   Blind spot: "Gate condicional visual demais" → objeto próprio com
   question, criteria, branches, fallback e approvalRule.

   Pure, node-testable, sem side effects.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface ProtocolDecisionBranch {
    id: string;
    label: string;
    predicate: (context: Record<string, unknown>) => boolean;
}

export interface ProtocolDecisionGate {
    question: string;
    criteria: string[];
    branches: ProtocolDecisionBranch[];
    fallback: string;
}

export interface GateEvaluationResult {
    branchId: string;
    branchLabel: string;
    viaFallback: boolean;
}

export interface GateValidationResult {
    valid: boolean;
    errors: string[];
}

// ──────────────────────────────────────────────────────────────────────
// evaluateGate
// ──────────────────────────────────────────────────────────────────────

/**
 * Avalia um gate contra um contexto e retorna o branch selecionado.
 * Percorre os branches em ordem; o primeiro cujo predicate retorna
 * true é selecionado. Se nenhum predicate aceitar, usa o fallback.
 *
 * @param gate   Gate de decisão do protocolo.
 * @param context Mapa de valores de entrada (criterios preenchidos).
 * @returns Resultado com branchId, branchLabel e viaFallback.
 */
export function evaluateGate(
    gate: ProtocolDecisionGate,
    context: Record<string, unknown>,
): GateEvaluationResult {
    for (const branch of gate.branches) {
        if (branch.predicate(context)) {
            return { branchId: branch.id, branchLabel: branch.label, viaFallback: false };
        }
    }
    const fallbackBranch = gate.branches.find((b) => b.id === gate.fallback);
    return {
        branchId: gate.fallback,
        branchLabel: fallbackBranch ? fallbackBranch.label : gate.fallback,
        viaFallback: true,
    };
}

// ──────────────────────────────────────────────────────────────────────
// validateGate
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida a integridade estrutural de um gate.
 * Regra da spec: gate com mais de uma saída deve ter critério por rota
 * e fallback explícito.
 *
 * @param gate Gate a validar.
 * @returnsResultado com valid e lista de erros.
 */
export function validateGate(gate: ProtocolDecisionGate): GateValidationResult {
    const errors: string[] = [];

    if (!gate.question || gate.question.trim() === '') {
        errors.push('missing_question');
    }
    if (!Array.isArray(gate.branches) || gate.branches.length === 0) {
        errors.push('no_branches');
    }
    if (gate.branches.length > 1 && !gate.fallback) {
        errors.push('missing_fallback');
    }
    if (gate.fallback && !gate.branches.some((b) => b.id === gate.fallback)) {
        errors.push('fallback_not_in_branches');
    }
    if (gate.branches.length > 1 && (!Array.isArray(gate.criteria) || gate.criteria.length === 0)) {
        errors.push('missing_criteria');
    }
    const ids = gate.branches.map((b) => b.id);
    if (new Set(ids).size !== ids.length) {
        errors.push('duplicate_branch_ids');
    }

    return { valid: errors.length === 0, errors };
}
