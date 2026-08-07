// @ts-check
// SCORES-HEALTH-001 RF-11.3: Turn-budget formal com parada honesta.
// Teto configurável de iterações por objetivo. Ao atingir, PARAR e registrar
// evento pedindo decisão — em vez de insistir (anti-padrão de loop de auto-justificativa).

export const DEFAULT_TURN_BUDGET = 25;
export const WARNING_THRESHOLD = 0.8; // 80% do budget = warning

/** Opções de {@link evaluateTurnBudget}. */
interface TurnBudgetOptions {
    /** Teto de iterações do objetivo (default {@link DEFAULT_TURN_BUDGET}). */
    budget?: number;
    /** Fração do budget que dispara o aviso (default {@link WARNING_THRESHOLD}). */
    warningThreshold?: number;
}

export function evaluateTurnBudget(iterations: number, options: TurnBudgetOptions = {}) {
    const budget = options.budget ?? DEFAULT_TURN_BUDGET;
    const warningThreshold = options.warningThreshold ?? WARNING_THRESHOLD;

    if (typeof iterations !== 'number' || !Number.isFinite(iterations) || iterations < 0) {
        return { shouldStop: false, remaining: budget, reason: 'invalid_iterations', severity: 'none' };
    }

    if (iterations >= budget) {
        return {
            shouldStop: true,
            remaining: 0,
            reason: 'budget_exhausted',
            severity: 'critical',
            message: 'Turn budget esgotado (' + iterations + '/' + budget + '). Pare e peça decisão.',
        };
    }

    const warningAt = Math.ceil(budget * warningThreshold);
    if (iterations >= warningAt) {
        return {
            shouldStop: false,
            remaining: budget - iterations,
            reason: 'budget_warning',
            severity: 'warning',
            message: 'Turn budget em ' + Math.round((iterations / budget) * 100) + '% (' + iterations + '/' + budget + ').',
        };
    }

    return {
        shouldStop: false,
        remaining: budget - iterations,
        reason: 'ok',
        severity: 'none',
    };
}