// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/calculator/customHandlers.js
// V3 Phase 1: registry de calculations "custom-*" para o Calculator.
// Cada handler é um thin wrapper que consulta o módulo core/ owner
// real e retorna { value, label, severity } compatível com
// executeCalculation do engine.js.
//
// NÃO adicionar lógica científica aqui - só delegação. O valor vem do
// módulo dono; aqui só traduzimos para o shape que o engine espera.

type Severity = 'ok' | 'warn' | 'critical';

interface CustomHandlerResult {
    value: number | null;
    label?: string;
    severity?: Severity | string;
    meta?: any;
}

type CustomHandler = (item: object) => CustomHandlerResult | Promise<CustomHandlerResult>;

/**
 * Registry de handlers custom.
 * Cada função recebe o CalculatorItem atual (para acesso a filters,
 * etc se necessário) e retorna { value, label?, severity? }.
 *
 * Lazy imports: módulos owners podem depender de estado já carregado
 * (elements, campaigns, scene) - chamar apenas quando o handler roda,
 * não no carregamento do módulo.
 */
const CUSTOM_HANDLERS: Record<string, CustomHandler> = {};

/**
 * Register a custom handler. Idempotent - sobrescreve se id repetir.
 */
export function registerCustomHandler(id: string, handler: Function): void {
    if (typeof id !== 'string' || !id) return;
    if (typeof handler !== 'function') return;
    CUSTOM_HANDLERS[id] = handler as CustomHandler;
}

/**
 * Resolve a custom handler by calculation id (ex: 'custom-eis').
 */
export function resolveCustomHandler(calculationId: string): Function | null {
    return CUSTOM_HANDLERS[calculationId] || null;
}

/**
 * List all registered custom handler ids (for introspection/tests).
 */
export function listCustomHandlers(): string[] {
    return Object.keys(CUSTOM_HANDLERS);
}

/**
 * Reset registry (for tests only). Não usar em produção.
 */
export function _resetCustomHandlersForTests(): void {
    for (const k of Object.keys(CUSTOM_HANDLERS)) delete CUSTOM_HANDLERS[k];
}

// ----------------------------------------------------------------
// Default handlers (auto-registered on module load).
// Imports lazy dentro de cada handler para evitar ciclo em boot.
// ----------------------------------------------------------------

async function _lazyImport(path: string): Promise<any | null> {
    try {
        return await import(path);
    } catch (e) {
        const err = e as Error;
        console.warn('[customHandlers] lazy import failed:', path, err?.message || e);
        return null;
    }
}

// EIS - delega para core/eis/index.js
registerCustomHandler('custom-eis', async (_item: object): Promise<CustomHandlerResult> => {
    const eis = await _lazyImport('../eis/index.js');
    const elements = await _lazyImport('../elements/manager.js');
    const campaigns = await _lazyImport('../campaigns/manager.js');
    if (!eis?.computeSimplifiedEIS) return { value: null };
    const els = elements?.getAllElements?.() || [];
    const camps = campaigns?.getAllCampaigns?.() || [];
    if (els.length === 0) return { value: null, severity: 'warn' };
    try {
        const r = eis.computeSimplifiedEIS(els, camps);
        const v = typeof r === 'number' ? r : r?.eis;
        let severity: Severity = 'ok';
        if (v == null) severity = 'warn';
        else if (v < 3.5) severity = 'critical';
        else if (v < 4.5) severity = 'warn';
        return { value: v, severity };
    } catch (e) {
        void e;
        return { value: null, severity: 'critical' };
    }
});

// VPL - delega para core/financial/projectValuation.js
registerCustomHandler('custom-vpl', async (_item: object): Promise<CustomHandlerResult> => {
    const fin = await _lazyImport('../financial/projectValuation.js');
    const elements = await _lazyImport('../elements/manager.js');
    if (!fin?.aggregateProjectValuations) return { value: null };
    const els = elements?.getAllElements?.() || [];
    const projects = els
        .filter((e: any) => e?.data?.projectValuation)
        .map((e: any) => e.data.projectValuation);
    if (projects.length === 0) return { value: 0, severity: 'ok' };
    try {
        const agg = fin.aggregateProjectValuations(projects);
        const v = typeof agg === 'number' ? agg : (agg?.totalNpv ?? agg?.total ?? null);
        let severity: Severity = 'ok';
        if (v != null && v < -1_000_000) severity = 'critical';
        else if (v != null && v < 0) severity = 'warn';
        return { value: v, severity };
    } catch (e) {
        void e;
        return { value: null, severity: 'warn' };
    }
});

// PDPLU - count de leituras totais (points × dates × parameters)
// Usa elements + observations diretamente (já é count simples)
registerCustomHandler('custom-pdplu', async (_item: object): Promise<CustomHandlerResult> => {
    const elements = await _lazyImport('../elements/manager.js');
    const els = elements?.getAllElements?.() || [];
    let total = 0;
    let validated = 0;
    for (const el of els) {
        const obs = el?.data?.observations || [];
        total += obs.length;
        validated += obs.filter((o: any) => o?.validated || o?.qaStatus === 'passed').length;
    }
    const severity: Severity = total === 0 ? 'warn' : 'ok';
    return { value: total, severity, meta: { validated, total } };
});

// Traceability - fraction of elements signed with ECBT Type B keys
// (blockchain-anchored). ADR-INTEGRITY-001 component T.
registerCustomHandler('custom-traceability', async (_item: object): Promise<CustomHandlerResult> => {
    const elements = await _lazyImport('../elements/manager.js');
    const els = elements?.getAllElements?.() || [];
    if (els.length === 0) return { value: null, severity: 'warn' };
    const signed = els.filter((e: any) => {
        const sig = e?.data?.signature || e?.data?.ecbtSignature || e?.meta?.signed;
        return !!sig;
    }).length;
    const pct = Math.round((signed / els.length) * 100);
    let severity: Severity = 'ok';
    if (pct < 30) severity = 'critical';
    else if (pct < 70) severity = 'warn';
    return { value: pct, severity, meta: { signed, total: els.length } };
});

// Uncertainty coverage - fraction of quantitative observations with
// propagated combined standard uncertainty. ADR-INTEGRITY-001 component U.
registerCustomHandler(
    'custom-uncertainty-coverage',
    async (_item: object): Promise<CustomHandlerResult> => {
        const elements = await _lazyImport('../elements/manager.js');
        const els = elements?.getAllElements?.() || [];
        let total = 0;
        let withU = 0;
        for (const el of els) {
            const obs = el?.data?.observations || [];
            for (const o of obs) {
                if (o?.value == null || isNaN(Number(o.value))) continue;
                total++;
                if (o?.uc != null || o?.u_c != null || o?.uncertainty != null) withU++;
            }
        }
        if (total === 0) return { value: null, severity: 'warn' };
        const pct = Math.round((withU / total) * 100);
        let severity: Severity = 'ok';
        if (pct < 10) severity = 'critical';
        else if (pct < 50) severity = 'warn';
        return { value: pct, severity, meta: { withU, total } };
    },
);

// Integrity aggregate - ADR-INTEGRITY-001 weighted geometric mean.
// Only visible when LAUNCHPAD_V3_INTEGRITY_AGGREGATE flag is on (gated
// per ADR §Publish Gate). When off, launchpadSeeds filter hides this
// and shows the 3 components separately.
registerCustomHandler(
    'custom-integrity-aggregate',
    async (_item: object): Promise<CustomHandlerResult> => {
        const integrity = await _lazyImport('../integrity/integrityScore.js');
        const elements = await _lazyImport('../elements/manager.js');
        const validation = await _lazyImport('../validation/engine/index.js');
        if (!integrity?.computeFromCounts) return { value: null, severity: 'warn' };
        const els = elements?.getAllElements?.() || [];
        if (els.length === 0) return { value: null, severity: 'warn' };
        // Compliance counts
        let compliancePassed = 0;
        let complianceTotal = 0;
        if (validation?.runValidationSummary) {
            try {
                const summary = validation.runValidationSummary(els);
                compliancePassed = summary?.passed || 0;
                complianceTotal = summary?.total || 0;
            } catch (e) {
                const err = e as Error;
                console.debug('[customHandlers] validationSummary:', err?.message || e);
                /* fallback stays zero */
            }
        }
        // Traceability counts
        const signed = els.filter(
            (e: any) => !!(e?.data?.signature || e?.data?.ecbtSignature),
        ).length;
        // Uncertainty counts
        let obsWithU = 0;
        let totalQuantObs = 0;
        for (const el of els) {
            const obs = el?.data?.observations || [];
            for (const o of obs) {
                if (o?.value == null || isNaN(Number(o.value))) continue;
                totalQuantObs++;
                if (o?.uc != null || o?.u_c != null || o?.uncertainty != null) obsWithU++;
            }
        }
        const r = integrity.computeFromCounts({
            compliancePassed,
            complianceTotal: complianceTotal || els.length,
            signed,
            totalElements: els.length,
            obsWithUncertainty: obsWithU,
            totalQuantObs: totalQuantObs || 1,
        });
        let severity: Severity = 'ok';
        if (r.score == null) severity = 'warn';
        else if (r.score < 40) severity = 'critical';
        else if (r.score < 70) severity = 'warn';
        return { value: r.score, severity, meta: { ...r, publishable: r.publishable } };
    },
);

// Compliance - delega para core/validation/engine/
registerCustomHandler('custom-compliance', async (_item: object): Promise<CustomHandlerResult> => {
    const validation = await _lazyImport('../validation/engine/index.js');
    const elements = await _lazyImport('../elements/manager.js');
    const els = elements?.getAllElements?.() || [];
    if (els.length === 0) return { value: null, severity: 'warn' };
    if (!validation?.runValidationSummary) {
        // Fallback: conta elementos com observações (proxy provisório)
        return { value: els.length, severity: 'ok' };
    }
    try {
        const summary = validation.runValidationSummary(els);
        const passed = summary?.passed || 0;
        const total = summary?.total || 0;
        const pct = total > 0 ? Math.round((passed / total) * 100) : null;
        let severity: Severity = 'ok';
        if (pct == null) severity = 'warn';
        else if (pct < 50) severity = 'critical';
        else if (pct < 80) severity = 'warn';
        return { value: pct, severity, meta: { passed, total } };
    } catch (e) {
        void e;
        return { value: null, severity: 'warn' };
    }
});
