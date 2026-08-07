// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Fine Scenario Console Helper — expõe `window.handleGenerateRandomFineScenario`
 * para Calvin testar via console do navegador.
 *
 * Calvin 2026-06-09: "para testar crie random, sem nomes de empresas reais
 * com dados hipotéticos, para o fluxo completo + abstrair (BRL por exemplo)".
 *
 * Standalone deliberadamente (não toca handlers/index.ts alta contenção).
 * Auto-init via <script> em app/index.html.
 *
 * Uso:
 *   handleGenerateRandomFineScenario({ tier: 'gigante' })  → seta globals + log
 *   handleGenerateRandomFineScenario({ tier: 'pme', currency: 'USD', seed: 42 })
 *   handleClearFineScenario()                              → limpa globals
 *
 * Globals setados:
 *   window.__ecbtFines       — FineRecord[]
 *   window.__ecbtEbitdaBrl   — capacidade (qualquer moeda, nome legado)
 *   window.__ecbtRevenueBrl  — receita
 *   window.__ecbtFineScenario — output completo (tier, currency, expected band)
 */

import { generateFineScenario, listScenarioTiers, type ScenarioTier } from '../../core/random/_fineScenarioGeneratorPure.js';

let _initialized = false;

function _logScenario(out: ReturnType<typeof generateFineScenario>): void {
    try {
        const w = (globalThis as any).window;
        if (!w?.console) return;
        const cur = out.currency;
        const fmt = (n: number) => `${cur} ${n.toLocaleString('pt-BR')}`;
        w.console.groupCollapsed?.(
            `%c[FIS] Cenário hipotético gerado: tier=${out.tier} seed=${out.seed} multas=${out.fineCount}`,
            'color:#dc2626;font-weight:700',
        );
        w.console.log?.('Empresa hipotética:', out.companyLabel);
        w.console.log?.('Descrição:', out.description);
        w.console.log?.('EBITDA:', fmt(out.ebitda));
        w.console.log?.('Receita:', fmt(out.revenue));
        w.console.log?.('Banda FIS esperada: [', out.expectedFisBand.low, ',', out.expectedFisBand.high, ']');
        w.console.table?.(out.fines.map((f) => ({
            id: f.id,
            severity: f.severity,
            amount: fmt(f.amount ?? 0),
            dateIso: f.dateIso,
            preset: f.presetId,
            description: f.description,
        })));
        w.console.log?.(
            '%cGlobais setados: window.__ecbtFines, __ecbtEbitdaBrl, __ecbtRevenueBrl',
            'color:#1e40af',
        );
        w.console.log?.(
            '%cAbrir painel ECBT Score → window.__ecbtScoreSnapshot.fineImpactScore populado.',
            'color:#1e40af',
        );
        w.console.groupEnd?.();
    } catch (e: any) {
        console.debug('[fis-scenario:log]', e?.message || e);
    }
}

export interface GenerateFineScenarioOptions {
    readonly tier?: ScenarioTier;
    readonly currency?: string;
    readonly seed?: number;
    readonly fineCount?: number;
    readonly historyYears?: number;
    readonly silent?: boolean;
}

export function generateRandomFineScenario(options?: GenerateFineScenarioOptions): ReturnType<typeof generateFineScenario> {
    const tier = options?.tier ?? 'gigante';
    const currency = options?.currency ?? 'BRL';
    const seed = options?.seed ?? Date.now() & 0x7fffffff;
    const fineCount = options?.fineCount;
    const historyYears = options?.historyYears;
    const out = generateFineScenario({
        tier, currency, seed,
        ...(typeof fineCount === 'number' ? { fineCount } : {}),
        ...(typeof historyYears === 'number' ? { historyYears } : {}),
        nowIso: new Date().toISOString(),
    });

    const w = (globalThis as any).window;
    if (w) {
        w.__ecbtFines = out.fines;
        // Nome legado mantido para compat — valores são genéricos em qualquer moeda
        w.__ecbtEbitdaBrl = out.ebitda;
        w.__ecbtRevenueBrl = out.revenue;
        w.__ecbtFineScenario = out;
    }

    if (!options?.silent) _logScenario(out);

    // Triggera reabertura do painel ECBT Score se estiver aberto
    try {
        const doc = (globalThis as any).document as Document | undefined;
        if (doc?.getElementById('ecbt-score-panel-overlay') && w?.handleOpenEcbtScorePanel) {
            w.handleOpenEcbtScorePanel();
        }
    } catch (e: any) {
        console.debug('[fis-scenario:trigger-refresh]', e?.message || e);
    }
    return out;
}

export function clearFineScenario(): void {
    const w = (globalThis as any).window;
    if (!w) return;
    w.__ecbtFines = undefined;
    w.__ecbtEbitdaBrl = undefined;
    w.__ecbtRevenueBrl = undefined;
    w.__ecbtFineScenario = undefined;
    try {
        w.console?.log?.('%c[FIS] Cenário limpo. window.__ecbtFines = undefined.', 'color:#1e40af');
        const doc = (globalThis as any).document as Document | undefined;
        if (doc?.getElementById('ecbt-score-panel-overlay') && w.handleOpenEcbtScorePanel) {
            w.handleOpenEcbtScorePanel();
        }
    } catch (e: any) {
        console.debug('[fis-scenario:clear]', e?.message || e);
    }
}

/**
 * Calvin 2026-06-09: "não é pra ter um botão de cenário de teste, é para no
 * modelo random isso vir automaticamente". Hook no evento `modelGenerated`
 * disparado pelo handleGenerateRandomModel.
 *
 * Tier randomizado para refletir variedade real:
 *   - Probabilidade ponderada: 35% media, 30% pme, 25% gigante, 10% catastrofe
 */
const AUTO_TIER_WEIGHTS: ReadonlyArray<{ tier: 'media' | 'pme' | 'gigante' | 'catastrofe'; weight: number }> = Object.freeze([
    { tier: 'media', weight: 0.35 },
    { tier: 'pme', weight: 0.30 },
    { tier: 'gigante', weight: 0.25 },
    { tier: 'catastrofe', weight: 0.10 },
]);

function _pickAutoTier(seed: number): 'media' | 'pme' | 'gigante' | 'catastrofe' {
    // PRNG simples baseado em seed para determinismo dentro de uma execução
    let a = (seed >>> 0) || 1;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    let acc = 0;
    for (const entry of AUTO_TIER_WEIGHTS) {
        acc += entry.weight;
        if (r <= acc) return entry.tier;
    }
    return 'media';
}

function _autoPopulateFromRandomModel(): void {
    const w = (globalThis as any).window;
    if (!w) return;
    // Skip se Calvin já cadastrou multas manualmente
    if (Array.isArray(w.__ecbtFines) && w.__ecbtFines.length > 0 && !w.__ecbtFinesAutoGenerated) {
        return;
    }
    try {
        const seed = Date.now() & 0x7fffffff;
        const tier = _pickAutoTier(seed);
        const result = generateRandomFineScenario({ tier, seed, silent: true });
        w.__ecbtFinesAutoGenerated = true; // marca como auto-gerado para futuro re-roll
        w.console?.log?.(
            `%c[FIS-001] Cenário auto-gerado (modelo random): tier=${tier} | ` +
            `${result.fineCount} multas | EBITDA ${result.currency} ${result.ebitda.toLocaleString('pt-BR')} | ` +
            `banda FIS esperada [${result.expectedFisBand.low}, ${result.expectedFisBand.high}]`,
            'color:#16a34a;font-family:monospace',
        );
    } catch (e: any) {
        console.debug('[fis-scenario:auto]', e?.message || e);
    }
}

export function initFineScenarioConsole(): void {
    if (_initialized) return;
    const w = (globalThis as any).window;
    if (!w) return;
    _initialized = true;

    if (typeof w.handleGenerateRandomFineScenario !== 'function') {
        w.handleGenerateRandomFineScenario = (opts?: GenerateFineScenarioOptions) =>
            generateRandomFineScenario(opts);
    }
    if (typeof w.handleClearFineScenario !== 'function') {
        w.handleClearFineScenario = () => clearFineScenario();
    }
    if (typeof w.listFineScenarioTiers !== 'function') {
        w.listFineScenarioTiers = () => listScenarioTiers();
    }

    // Calvin 2026-06-09: auto-popular ao gerar modelo random
    try {
        w.addEventListener?.('modelGenerated', () => _autoPopulateFromRandomModel());
        // Caso o modelo já tenha sido gerado antes desse init carregar
        const doc = (globalThis as any).document as Document | undefined;
        if (doc) {
            const hasElements = doc.querySelectorAll('[data-element-id]').length > 0;
            if (hasElements && (!Array.isArray(w.__ecbtFines) || w.__ecbtFines.length === 0)) {
                setTimeout(() => _autoPopulateFromRandomModel(), 500);
            }
        }
    } catch (e: any) {
        console.debug('[fis-scenario:wire-event]', e?.message || e);
    }

    // Hint amigável (uma única vez por sessão)
    try {
        if (!w.__ecbtFineScenarioHintShown) {
            w.__ecbtFineScenarioHintShown = true;
            w.console?.log?.(
                '%c[FIS-001] Cenário hipotético de multas é auto-gerado ao gerar modelo random.\n' +
                'Override manual via card "Multas e Infrações" no painel ECBT Score.',
                'color:#16a34a;font-family:monospace',
            );
        }
    } catch (e: any) {
        console.debug('[fis-scenario:hint]', e?.message || e);
    }
}

// AUTO-INIT side-effect
(function _autoInit() {
    if (typeof globalThis === 'undefined') return;
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    const startup = () => {
        setTimeout(() => {
            try { initFineScenarioConsole(); }
            catch (e: any) { console.debug('[fis-scenario:auto-init]', e?.message || e); }
        }, 4000);
    };
    if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
        startup();
    } else {
        doc.addEventListener('DOMContentLoaded', startup, { once: true });
    }
})();
