// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CONTEXTUAL TOUR CORE — SPEC_CONTEXTUAL_TOUR_SYSTEM

   Pure helpers para Contextual Tour System:
   - detectModule (cascade §Q2)
   - validateTourDefinition (schema)
   - computeTourProgress (step progression)
   - resolvePlaceholders ({count} interpolation §Q3)
   - canProceedFromStep (step requirements)
   - recordTourEvent (analytics §Q5)

   UI (modal overlay) + i18n loading ficam em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

export const TOUR_EVENT_TYPES = Object.freeze([
    'tour.started',
    'tour.step.shown',
    'tour.step.completed',
    'tour.skipped',
    'tour.completed',
    'tour.abandoned',
]);

export const SUPPORTED_LANGUAGES = Object.freeze(['pt', 'en', 'es']);
export const DEFAULT_MODULE = '__fallback__';

interface DetectModuleContext {
    dataModule?: string;
    route?: string;
    containerClass?: string;
}

interface TourProgress {
    percent: number;
    stepsTotal: number;
    stepsRemaining: number;
    isFirst: boolean;
    isLast: boolean;
    currentStep: Record<string, unknown> | null;
}

// ──────────────────────────────────────────────────────────────────────
// Module detection (§Q2 cascade)
// ──────────────────────────────────────────────────────────────────────

/**
 * Detecta módulo ativo via cascade: data-attribute → route → class → fallback.
 *
 * @param context
 * @param context.dataModule - data-module attribute do container principal
 * @param context.route - pathname ex: "/report/edit"
 * @param context.containerClass - class do body/root
 * @param routeMap - route prefix → moduleId
 */
export function detectModule(context: DetectModuleContext | null | undefined, routeMap: Record<string, string> = {}): string {
    if (!context || typeof context !== 'object') return DEFAULT_MODULE;

    // 1. data-attribute (explicit) wins
    if (typeof context.dataModule === 'string' && context.dataModule.trim().length > 0) {
        return context.dataModule.trim();
    }

    // 2. route mapping
    if (typeof context.route === 'string') {
        const route = context.route;
        for (const prefix of Object.keys(routeMap)) {
            if (route.startsWith(prefix)) return routeMap[prefix] as string;
        }
    }

    // 3. container class (ex: "page-report" → "report")
    if (typeof context.containerClass === 'string') {
        const match = context.containerClass.match(/page-([a-z0-9_-]+)/i);
        if (match) return match[1] as string;
    }

    return DEFAULT_MODULE;
}

// ──────────────────────────────────────────────────────────────────────
// Tour definition validation
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida shape de definição de tour.
 */
export function validateTourDefinition(tour: Record<string, any>): { valid: boolean; errors: Array<string> } {
    const errors: string[] = [];
    if (!tour || typeof tour !== 'object') return { valid: false, errors: ['tour not object'] };

    if (!tour.id || typeof tour.id !== 'string') errors.push('id required (string)');
    if (!tour.module || typeof tour.module !== 'string') errors.push('module required');
    if (!tour.title || typeof tour.title !== 'string') errors.push('title required');
    if (!Array.isArray(tour.steps)) {
        errors.push('steps must be array');
    } else if (tour.steps.length === 0) {
        errors.push('steps must have at least 1 step');
    } else {
        tour.steps.forEach((step: any, i: any) => {
            if (!step || typeof step !== 'object') errors.push(`steps[${i}]: not object`);
            else {
                if (!step.id || typeof step.id !== 'string') errors.push(`steps[${i}]: id required`);
                if (!step.content || typeof step.content !== 'string') errors.push(`steps[${i}]: content required`);
            }
        });
    }
    if (tour.language && !SUPPORTED_LANGUAGES.includes(tour.language)) {
        errors.push(`language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Progress tracking
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa progresso do tour atual.
 */
export function computeTourProgress(tour: Record<string, any>, currentStepIndex: number): TourProgress {
    const steps = tour?.steps;
    if (!Array.isArray(steps) || steps.length === 0) {
        return {
            percent: 0,
            stepsTotal: 0,
            stepsRemaining: 0,
            isFirst: true,
            isLast: true,
            currentStep: null,
        };
    }
    const idx = Math.max(0, Math.min(steps.length - 1, Number(currentStepIndex) || 0));
    const stepsTotal = steps.length;
    const stepsRemaining = stepsTotal - idx - 1;
    const percent = stepsTotal === 0 ? 0 : ((idx + 1) / stepsTotal) * 100;
    return {
        percent,
        stepsTotal,
        stepsRemaining,
        isFirst: idx === 0,
        isLast: idx === stepsTotal - 1,
        currentStep: steps[idx] || null,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Placeholder resolution (§Q3 "Você tem {count} elementos")
// ──────────────────────────────────────────────────────────────────────

/**
 * Substitui {placeholders} por valores do state.
 * Placeholders ausentes ficam literais.
 */
export function resolvePlaceholders(text: string, state: Record<string, any> = {}): string {
    if (typeof text !== 'string') return '';
    return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
        const value = state[key];
        if (value === undefined || value === null) return match;
        return String(value);
    });
}

// ──────────────────────────────────────────────────────────────────────
// Step requirements
// ──────────────────────────────────────────────────────────────────────

/**
 * Determina se user pode avançar do step atual.
 * Step pode ter requireAction: 'click:selector' ou requireState: { key, value }.
 */
export function canProceedFromStep(step: Record<string, any>, userState: Record<string, any> = {}): { canProceed: boolean; reason: string } {
    if (!step || typeof step !== 'object') return { canProceed: false, reason: 'invalid_step' };

    // Se step não tem requisito, pode avançar livremente
    if (!step.requireState && !step.requireAction) {
        return { canProceed: true, reason: 'no_requirement' };
    }

    // requireState: { key, value } → userState[key] === value
    if (step.requireState) {
        const { key, value } = step.requireState;
        if (userState[key] !== value) {
            return { canProceed: false, reason: `state_mismatch:${key}` };
        }
    }

    // requireAction: presente em userState.completedActions[]
    if (step.requireAction) {
        const completed = Array.isArray(userState.completedActions) ? userState.completedActions : [];
        if (!completed.includes(step.requireAction)) {
            return { canProceed: false, reason: `action_pending:${step.requireAction}` };
        }
    }

    return { canProceed: true, reason: 'requirements_met' };
}

// ──────────────────────────────────────────────────────────────────────
// Analytics event (§Q5)
// ──────────────────────────────────────────────────────────────────────

/**
 * Cria event record para analytics. Frozen.
 *
 * @param eventType
 * @param params - { tourId, stepId?, stepIndex?, durationMs?, userId? }
 */
export function recordTourEvent(eventType: string, params: Record<string, any> = {}): Readonly<Record<string, unknown>> {
    if (!TOUR_EVENT_TYPES.includes(eventType)) {
        throw new Error(`Invalid tour event type: ${eventType}`);
    }
    return Object.freeze({
        eventType,
        timestamp: new Date().toISOString(),
        tourId: params.tourId || null,
        stepId: params.stepId || null,
        stepIndex: Number.isFinite(params.stepIndex) ? params.stepIndex : null,
        durationMs: Number.isFinite(params.durationMs) ? params.durationMs : null,
        userId: params.userId || null,
    });
}

/**
 * Computa completion rate de uma sessão (§Q5 metric).
 *
 * @param events - lista de tour events
 * @param any>>
 */
export function computeCompletionRate(events: Array<Record<string, any>>, tourId: string): { started: number; completed: number; completionRate: number; avgDurationMs: number | null } {
    if (!Array.isArray(events) || !tourId) {
        return { started: 0, completed: 0, completionRate: 0, avgDurationMs: null };
    }
    const tourEvents = events.filter((e) => e?.tourId === tourId);
    const started = tourEvents.filter((e) => e.eventType === 'tour.started').length;
    const completed = tourEvents.filter((e) => e.eventType === 'tour.completed').length;
    const durations = tourEvents
        .filter((e) => e.eventType === 'tour.completed' && Number.isFinite(e.durationMs))
        .map((e) => e.durationMs);
    const avgDurationMs = durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : null;
    return {
        started,
        completed,
        completionRate: started > 0 ? completed / started : 0,
        avgDurationMs,
    };
}
