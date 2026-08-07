// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   BOUNDARY SAVE DECISION — SPEC-BOUNDARY-SAVE-001 (Item 9.25)

   Pure decision model para salvamento de boundary:
   - Sem boundary existente: salva silenciosamente
   - Com boundary existente: prompt com default 'create_new'
     (preserva modelo anterior)
   - Quota de raias atingida: bloqueia 'create_new', exige gestão

   Reusa quota do autosaveLane/manager.js (getQuotaForTier) —
   mas sem acoplar a módulo específico (recebe opts.quota).

   Pure, node-testable, sem side effects.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

export const BOUNDARY_SAVE_ACTIONS = Object.freeze({
    CREATE_NEW: 'create_new', // default recomendado
    OVERWRITE: 'overwrite', // ação destrutiva, precisa warning
    CANCEL: 'cancel',
});

export const DECISION_STATES = Object.freeze({
    SILENT_SAVE: 'silent_save', // sem existing, não mostra dialog
    PROMPT_REQUIRED: 'prompt_required', // existing boundary, user deve escolher
    QUOTA_EXCEEDED: 'quota_exceeded', // max lanes atingido
    NO_SOURCE_MODEL: 'no_source_model', // sem modelo ativo — erro
});

const DEFAULT_MAX_LANES = 10; // §Q3

// ──────────────────────────────────────────────────────────────────────
// Name validation (§4.1 dialog input)
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida nome sugerido para novo modelo.
 * @param {string} name
 * @param {Array<string>} [existingNames]
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateNewModelName(name: string, existingNames: Array<string> = []): { valid: boolean, reason?: string } {
    if (typeof name !== 'string') return { valid: false, reason: 'not_string' };
    const trimmed = name.trim();
    if (trimmed.length === 0) return { valid: false, reason: 'empty' };
    if (trimmed.length > 100) return { valid: false, reason: 'too_long' };
    if (Array.isArray(existingNames) && existingNames.includes(trimmed)) {
        return { valid: false, reason: 'duplicate' };
    }
    return { valid: true };
}

/**
 * Sugere nome para nova raia de boundary.
 *
 * Ex: "Modelo Principal" + existing=0 → "Modelo Principal (boundary v2)"
 * Ex: existing=3 → "Modelo Principal (boundary v5)"
 *
 * @param {string} currentName
 * @param {number} [existingVariantCount=0]
 * @returns {string}
 */
export function buildBoundaryLaneSuggestion(currentName: string, existingVariantCount: number = 0): string {
    const base = (currentName || 'Modelo').trim();
    // Remove sufixo " (boundary vN)" se presente, para renumerar corretamente
    const cleanBase = base.replace(/\s*\(boundary v\d+\)\s*$/, '');
    const versionNum = Math.max(2, (Number(existingVariantCount) || 0) + 2);
    return `${cleanBase} (boundary v${versionNum})`;
}

// ──────────────────────────────────────────────────────────────────────
// Main decision model
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide qual estado apresentar ao usuário ao completar boundary draw.
 *
 * Lógica:
 * 1. Sem modelo ativo → NO_SOURCE_MODEL (erro de estado)
 * 2. Sem boundary existente → SILENT_SAVE (fluxo rápido)
 * 3. Boundary existe + quota atingida → QUOTA_EXCEEDED (não pode criar nova)
 * 4. Boundary existe + quota OK → PROMPT_REQUIRED (default CREATE_NEW)
 *
 * @param {{currentModel?: Record<string, any>|null, userLanes?: any[], tier?: string}} state
 * @param {{maxLanes?: number, quotaByTier?: number}} [opts]
 * @returns {{
 *   state: string,
 *   defaultAction: string|null,
 *   canCreateNew: boolean,
 *   canOverwrite: boolean,
 *   existingVariantCount: number,
 *   suggestedName: string|null,
 *   warnings: Array<string>
 * }}
 */
export function decideBoundarySaveAction(state: {currentModel?: Record<string, any>|null, userLanes?: any[], tier?: string}, opts: {maxLanes?: number, quotaByTier?: number} = {}): { state: string, defaultAction: string|null, canCreateNew: boolean, canOverwrite: boolean, existingVariantCount: number, suggestedName: string|null, warnings: Array<string> } {
    const maxLanes = Number.isFinite(opts.maxLanes) ? (opts.maxLanes as number) : DEFAULT_MAX_LANES;
        const warnings: any[]= [];

    if (!state || typeof state !== 'object') {
        return {
            state: DECISION_STATES.NO_SOURCE_MODEL,
            defaultAction: null,
            canCreateNew: false,
            canOverwrite: false,
            existingVariantCount: 0,
            suggestedName: null,
            warnings: ['state not provided'],
        };
    }

    const model = state.currentModel;
    if (!model || !model.id) {
        return {
            state: DECISION_STATES.NO_SOURCE_MODEL,
            defaultAction: null,
            canCreateNew: false,
            canOverwrite: false,
            existingVariantCount: 0,
            suggestedName: null,
            warnings: ['no active model'],
        };
    }

    const hasExistingBoundary = !!model.boundary;
    const userLanes = Array.isArray(state.userLanes) ? state.userLanes : [];
    const existingVariants = userLanes.filter((l) => l?.type === 'boundary_variant');

    if (!hasExistingBoundary) {
        return {
            state: DECISION_STATES.SILENT_SAVE,
            defaultAction: BOUNDARY_SAVE_ACTIONS.CREATE_NEW,
            canCreateNew: true,
            canOverwrite: false,
            existingVariantCount: existingVariants.length,
            suggestedName: null,
            warnings,
        };
    }

    const quotaReached = userLanes.length >= maxLanes;
    const suggestedName = buildBoundaryLaneSuggestion(model.name, existingVariants.length);

    if (quotaReached) {
        warnings.push(`max_lanes_reached: ${userLanes.length}/${maxLanes}`);
        return {
            state: DECISION_STATES.QUOTA_EXCEEDED,
            defaultAction: BOUNDARY_SAVE_ACTIONS.CANCEL,
            canCreateNew: false,
            canOverwrite: true, // ainda pode sobrescrever (não cria lane)
            existingVariantCount: existingVariants.length,
            suggestedName: null,
            warnings,
        };
    }

    return {
        state: DECISION_STATES.PROMPT_REQUIRED,
        defaultAction: BOUNDARY_SAVE_ACTIONS.CREATE_NEW, // §Q1 default seguro
        canCreateNew: true,
        canOverwrite: true,
        existingVariantCount: existingVariants.length,
        suggestedName,
        warnings,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Choice resolution helpers
// ──────────────────────────────────────────────────────────────────────

function resolveCancelChoice(action: string | undefined): {
    allowed: boolean;
    action: string | null;
    modelName: null;
    errors: Array<string>;
} {
    return { allowed: true, action: action || null, modelName: null, errors: [] };
}

function resolveCreateNewChoice(
    state: Record<string, any>,
    action: string,
    decision: ReturnType<typeof decideBoundarySaveAction>,
    userChoice: { action?: string; modelName?: string },
): { allowed: boolean; action: string | null; modelName: string | null; errors: Array<string> } {
    const errors: string[] = [];
    if (!decision.canCreateNew) errors.push('create_new_blocked_by_quota');
    const existing = Array.isArray(state?.userLanes) ? state.userLanes.map((l: any) => l.name) : [];
    const name = userChoice.modelName?.trim() || decision.suggestedName || '';
    const nameValidation = validateNewModelName(name, existing);
    if (!nameValidation.valid) errors.push(`name_invalid: ${nameValidation.reason}`);
    return {
        allowed: errors.length === 0,
        action: action || null,
        modelName: name,
        errors,
    };
}

function resolveOverwriteChoice(
    action: string,
    decision: ReturnType<typeof decideBoundarySaveAction>,
): { allowed: boolean; action: string | null; modelName: null; errors: Array<string> } {
    const errors: string[] = [];
    if (!decision.canOverwrite) errors.push('overwrite_not_allowed');
    return { allowed: errors.length === 0, action: action || null, modelName: null, errors };
}

/**
 * Valida e resolve escolha do usuário no diálogo.
 *
 * @param {Record<string, any>} state - mesmo shape de decideBoundarySaveAction
 * @param {{action?: string, modelName?: string}} userChoice
 * @returns {{
 *   allowed: boolean,
 *   action: string|null,
 *   modelName: string|null,
 *   errors: Array<string>
 * }}
 */
export function resolveBoundarySaveChoice(
    state: Record<string, any>,
    userChoice: { action?: string; modelName?: string },
): { allowed: boolean; action: string | null; modelName: string | null; errors: Array<string> } {
    if (!userChoice || typeof userChoice !== 'object') {
        return { allowed: false, action: null, modelName: null, errors: ['choice_required'] };
    }
    const { action } = userChoice;

    if (action === BOUNDARY_SAVE_ACTIONS.CANCEL) {
        return resolveCancelChoice(action);
    }

    const decision = decideBoundarySaveAction(state as any);

    if (action === BOUNDARY_SAVE_ACTIONS.CREATE_NEW) {
        return resolveCreateNewChoice(state, action, decision, userChoice);
    }

    if (action === BOUNDARY_SAVE_ACTIONS.OVERWRITE) {
        return resolveOverwriteChoice(action, decision);
    }

    return { allowed: false, action: null, modelName: null, errors: [`unknown_action: ${action}`] };
}
