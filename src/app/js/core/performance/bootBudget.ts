// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   BOOT BUDGET — Performance instrumentation + budget evaluation
   ================================================================
   PERF-MASTER-001 S0/S1 + MONOLITH_REFACTOR §2.5 (single owner)

   Single source of truth para o KPI "boot time". Substitui:
   - PERF-MASTER S1 "TTI <1.5s" (não tinha baseline)
   - MONOLITH §2.5 "init() complete <3.0s" (mediu drift via log)

   Os dois programas concorriam pelo mesmo KPI com critérios diferentes.
   Esta camada uniformiza:
   1. Marcação determinística via performance.mark/measure
   2. Budgets nomeados por fase (boot-handlers, boot-handlers-ready, app-ready)
   3. Avaliação pure (sem DOM) testável em Node
   4. Snapshot serializável para CI/dashboard

   Histórico de instrumentação (preservar):
   - main.js:564 — window.__ecbyts_initStart (preexistente)
   - main.js:790 — window.__ecbyts_appReadyMs (preexistente, log only)

   Esta camada formaliza, não substitui.

   Roadmap: PERF-MASTER-001 S0+S1 unifica MONOLITH §2.5.
   ================================================================ */

console.debug('[mod:load]', 'app/js/core/performance/bootBudget.js');

interface BudgetPhases {
    handlers: number;
    handlersReady: number;
    appReady: number;
    tti: number;
}

interface BudgetEvaluation {
    phase: string;
    viewport: string;
    measuredMs: number;
    budgetMs: number;
    severity: string;
    ratio: number;
    error?: string;
}

interface BootSnapshot {
    initStartMs: number | null;
    appReadyMs: number | null;
    snapshotAt: number;
}

/**
 * Budgets canônicos por fase do boot. Valores em ms.
 * Sourced de MONOLITH §2.5 ("Tempo de boot pra init() complete <3.0s")
 * e PERF-MASTER S1 ("TTI <1.5s desktop").
 *
 * - handlers: até all window.* handlers registrados (mais cedo)
 * - handlersReady: até init() completar pipeline principal
 * - appReady: até primeira interação possível (TTI)
 *
 * Targets diferentes por viewport - desktop tem budget mais estrito que mobile.
 */
export const BOOT_BUDGETS: Readonly<{ desktop: Readonly<BudgetPhases>; mobile: Readonly<BudgetPhases> }> =
    Object.freeze({
        desktop: Object.freeze({
            handlers: 800, // 800ms — handlers registry pronto
            handlersReady: 2200, // 2.2s — pipeline init completou
            appReady: 3000, // 3.0s — alvo MONOLITH §2.5
            tti: 1500, // 1.5s — alvo PERF-MASTER S1 (mais ambicioso)
        }),
        mobile: Object.freeze({
            handlers: 1500,
            handlersReady: 4000,
            appReady: 5000, // mobile é mais permissivo
            tti: 3000,
        }),
    });

/**
 * Severidade da violação de budget.
 */
export const BUDGET_SEVERITY: Readonly<{ OK: string; WARN: string; FAIL: string }> = Object.freeze({
    OK: 'ok',
    WARN: 'warn', // dentro do hard target mas acima de 80%
    FAIL: 'fail', // acima do hard target
});

/**
 * Avalia uma medição contra budget canônico.
 * Pure function - sem DOM, sem performance API.
 *
 * @param phase - "handlers" | "handlersReady" | "appReady" | "tti"
 * @param measuredMs - tempo medido em ms
 * @param opts
 * @returns
 */
export function evaluateBudget(
    phase: string,
    measuredMs: number,
    opts: { viewport?: 'desktop' | 'mobile'; budgets?: Record<string, Record<string, number>> } = {},
): BudgetEvaluation {
    const viewport = opts.viewport === 'mobile' ? 'mobile' : 'desktop';
    const budgets: Record<string, Record<string, number>> =
        opts.budgets || (BOOT_BUDGETS as unknown as Record<string, Record<string, number>>);
    const viewportBudgets = budgets[viewport] || budgets.desktop;
    const budgetMs = viewportBudgets ? viewportBudgets[phase] : undefined;

    if (typeof budgetMs !== 'number' || !Number.isFinite(budgetMs)) {
        return {
            phase,
            viewport,
            measuredMs: Number(measuredMs) || 0,
            budgetMs: 0,
            severity: BUDGET_SEVERITY.OK,
            ratio: 0,
            error: 'unknown_phase',
        };
    }

    const m = Number(measuredMs) || 0;
    const ratio = budgetMs > 0 ? m / budgetMs : 0;

    let severity: string;
    if (m <= budgetMs * 0.8) severity = BUDGET_SEVERITY.OK;
    else if (m <= budgetMs) severity = BUDGET_SEVERITY.WARN;
    else severity = BUDGET_SEVERITY.FAIL;

    return {
        phase,
        viewport,
        measuredMs: m,
        budgetMs,
        severity,
        ratio: Math.round(ratio * 1000) / 1000,
    };
}

/**
 * Marca uma fase do boot via performance.mark() se disponível.
 * Idempotente - re-mark não duplica (browser handles).
 *
 * @param phaseName - prefixo da mark
 * @returns timestamp em ms ou null se Performance API ausente
 */
export function markBootPhase(phaseName: string): number | null {
    if (typeof phaseName !== 'string' || !phaseName) return null;
    if (typeof performance === 'undefined' || typeof performance.mark !== 'function') {
        return null;
    }
    const markName = `ecbyts:boot:${phaseName}`;
    try {
        performance.mark(markName);
        return performance.now();
    } catch {
        return null;
    }
}

/**
 * Mede um span entre duas marks de boot. Cria entry de measure
 * inspecionável via performance.getEntriesByType('measure').
 *
 * @param fromPhase
 * @param toPhase
 * @returns
 */
export function measureBootSpan(fromPhase: string, toPhase: string): { durationMs: number } | null {
    if (typeof performance === 'undefined' || typeof performance.measure !== 'function') {
        return null;
    }
    const fromMark = `ecbyts:boot:${fromPhase}`;
    const toMark = `ecbyts:boot:${toPhase}`;
    const measureName = `ecbyts:boot:${fromPhase}-to-${toPhase}`;
    try {
        performance.measure(measureName, fromMark, toMark);
        const entries = performance.getEntriesByName(measureName, 'measure');
        if (entries.length === 0) return null;
        const last = entries[entries.length - 1];
        if (!last) return null;
        return { durationMs: Math.round(last.duration) };
    } catch {
        return null;
    }
}

/**
 * Captura snapshot atual de boot timings expostos pela main.js.
 * Lê variáveis globais (`window.__ecbyts_initStart`, `__ecbyts_appReadyMs`).
 * Pure-ish: dependente de window mas sem efeito colateral.
 *
 * @param windowRef?
 * @returns
 */
export function captureBootSnapshot(windowRef?: Record<string, any>): BootSnapshot {
    const w: Record<string, any> | null =
        windowRef || (typeof window !== 'undefined' ? (window as any) : null);
    if (!w) {
        return { initStartMs: null, appReadyMs: null, snapshotAt: 0 };
    }
    return {
        initStartMs: Number.isFinite(w.__ecbyts_initStart) ? w.__ecbyts_initStart : null,
        appReadyMs: Number.isFinite(w.__ecbyts_appReadyMs) ? w.__ecbyts_appReadyMs : null,
        snapshotAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };
}

/**
 * Decide viewport (desktop/mobile) por user agent + screen width.
 * Pure se ua/width são passados; lê navigator/screen como fallback.
 *
 * @param opts
 * @param opts.userAgent
 * @param opts.screenWidth
 * @returns
 */
export function detectViewport(opts: { userAgent?: string; screenWidth?: number } = {}): 'desktop' | 'mobile' {
    const ua =
        typeof opts.userAgent === 'string'
            ? opts.userAgent
            : typeof navigator !== 'undefined' && navigator.userAgent
              ? navigator.userAgent
              : '';
    const width =
        typeof opts.screenWidth === 'number'
            ? opts.screenWidth
            : typeof screen !== 'undefined' && Number.isFinite(screen.width)
              ? screen.width
              : 1280;

    const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
    if (isMobileUA) return 'mobile';
    if (width < 768) return 'mobile';
    return 'desktop';
}

/**
 * Avalia snapshot completo contra todos os budgets relevantes.
 * Útil para gerar report único em CI.
 *
 * @param snapshot - output de captureBootSnapshot
 * @param opts
 * @returns
 */
export function evaluateSnapshot(
    snapshot: { initStartMs?: number | null; appReadyMs?: number | null; snapshotAt?: number },
    opts: { viewport?: 'desktop' | 'mobile' } = {},
): { viewport: string; results: Array<ReturnType<typeof evaluateBudget>>; worstSeverity: string } {
    const viewport = opts.viewport || 'desktop';
    const results: Array<ReturnType<typeof evaluateBudget>> = [];

    if (snapshot && Number.isFinite(snapshot.appReadyMs)) {
        results.push(evaluateBudget('appReady', snapshot.appReadyMs as number, { viewport }));
    }

    let worst: string = BUDGET_SEVERITY.OK;
    for (const r of results) {
        if (r.severity === BUDGET_SEVERITY.FAIL) {
            worst = BUDGET_SEVERITY.FAIL;
            break;
        }
        if (r.severity === BUDGET_SEVERITY.WARN) worst = BUDGET_SEVERITY.WARN;
    }

    return { viewport, results, worstSeverity: worst };
}

console.debug('[mod:end]', 'app/js/core/performance/bootBudget.js');
