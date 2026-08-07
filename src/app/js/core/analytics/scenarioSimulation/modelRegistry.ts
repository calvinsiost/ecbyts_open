// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Generic Monte Carlo model registry + engine
// Item: micro_activity:ECBYTS-ENERGY-SCENARIOS-001#9

/* ================================================================
   GENERIC MONTE CARLO — motor × modelos plugáveis
   ================================================================

   Separa o MOTOR (LHS, amostragem de distribuições, percentis,
   convergência, seed) dos MODELOS (o que é amostrado e a função
   de avaliação). Um modelo novo entra por registro declarativo,
   sem tocar no motor.

   Dois tipos de modelo:
   - generic: { params: [{key, dist, ...}], evaluate(sample) -> métricas }
     Motor: LHS (engine.lhsMatrix) + inverse-transform (uncertainty/
     distributions.sampleFromUniform) + percentis + curva de convergência.
   - legacy-scenario: adapter sobre os cenários ambientais existentes
     (scenarioDefs + engine.runAll). Delegação 1:1 ao caminho de código
     atual — ZERO mudança de comportamento (regressão protegida por
     teste com seed fixa).

   Reuso (REUSE-CHECK):
   - LHS/percentil:      ./engine.ts (lhsMatrix)
   - Distribuições:      ../../uncertainty/distributions.ts (JCGM 101:2008)
   - Cenários legados:   ./scenarioDefs.ts + ./engine.ts
   ================================================================ */

import { lhsMatrix, runAll, calculateStats, calculateScore } from './engine.js';
import { sampleFromUniform, type DistributionName, type DistributionParams } from '../../uncertainty/distributions.js';
import { getScenarioParams, getAllScenarios } from './scenarioDefs.js';

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export type SimModelCategory = 'ambiental' | 'energetico' | 'financeiro';

/** Parâmetro amostrável de um modelo genérico. */
export interface SimParamDef {
    /** chave usada no sample passado a evaluate() */
    readonly key: string;
    /** nome exibível */
    readonly name: string;
    readonly unit?: string;
    /** distribuição (normal | lognormal | triangular | uniform | empirical) */
    readonly dist: DistributionName;
    /** parâmetros da distribuição ({min,mode,max} | {mu,sigma} | {min,max} | {samples}) */
    readonly distParams: DistributionParams;
}

/** Metadado de uma métrica de saída. */
export interface SimMetricDef {
    readonly key: string;
    readonly name: string;
    readonly unit?: string;
    /** 'lower' = menor é melhor (ex. custo, payback); 'higher' = maior é melhor */
    readonly better?: 'lower' | 'higher';
}

export interface SimMetricStats {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    mean: number;
}

export interface SimModel {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly icon?: string;
    readonly color?: string;
    readonly category: SimModelCategory;
    readonly tags?: readonly string[];
    /** modelo genérico: parâmetros amostráveis */
    readonly params?: readonly SimParamDef[];
    /** modelo genérico: avalia um sample -> métricas nomeadas */
    readonly evaluate?: (sample: Record<string, number>) => Record<string, number>;
    /** metadados das métricas produzidas por evaluate() */
    readonly metrics?: readonly SimMetricDef[];
    /** score composto 0-100 opcional a partir das stats por métrica */
    readonly scoreOf?: (stats: Record<string, SimMetricStats>) => { score: number; label: string; breakdown?: Record<string, unknown> };
    /** adapter: id de cenário legado (scenarioDefs) — delega ao engine atual */
    readonly legacyScenarioId?: string;
}

export interface RunSimModelConfig {
    numRuns?: number;
    seed?: number;
    /** overrides pontuais de parâmetros legados (só p/ legacy-scenario) */
    paramOverrides?: Record<string, unknown>;
    weights?: Record<string, number>;
    budget?: number | null;
}

export interface GenericModelResult {
    kind: 'generic-model';
    modelId: string;
    nRuns: number;
    seed: number;
    /** stats por métrica */
    metrics: Record<string, SimMetricStats>;
    /** curva de convergência: P50 acumulada por bloco, por métrica */
    convergence: Record<string, { n: number; p50: number }[]>;
    /** amostras cruas por métrica (p/ histogramas) */
    samples: Record<string, number[]>;
    score: { score: number; label: string; breakdown?: Record<string, unknown> } | null;
    model: SimModel;
}

// ----------------------------------------------------------------
// REGISTRY
// ----------------------------------------------------------------

const _registry = new Map<string, SimModel>();

/**
 * Registra (ou substitui) um modelo. Registro declarativo — não toca o motor.
 * @throws se id inválido ou modelo sem evaluate/legacyScenarioId
 */
export function registerSimModel(model: SimModel): void {
    if (!model?.id || !/^[a-z0-9_]+$/.test(model.id)) {
        throw new Error(`SimModel id inválido: "${model?.id}"`);
    }
    if (!model.legacyScenarioId && (typeof model.evaluate !== 'function' || !model.params?.length)) {
        throw new Error(`SimModel "${model.id}": precisa de evaluate()+params (generic) ou legacyScenarioId (adapter)`);
    }
    _registry.set(model.id, model);
}

export function getSimModel(id: string): SimModel | undefined {
    _ensureBuiltins();
    return _registry.get(id);
}

export function getAllSimModels(): SimModel[] {
    _ensureBuiltins();
    return [..._registry.values()];
}

export function getSimModelsByCategory(category: SimModelCategory): SimModel[] {
    return getAllSimModels().filter((m) => m.category === category);
}

export const SIM_MODEL_CATEGORY_LABELS: Record<SimModelCategory, string> = {
    ambiental: 'Ambiental',
    energetico: 'Energético',
    financeiro: 'Financeiro',
};

/** Grupos categoria→modelos para o picker da UI (ordem fixa). */
export function getSimModelPickerGroups(): { category: SimModelCategory; label: string; models: SimModel[] }[] {
    const order: SimModelCategory[] = ['ambiental', 'energetico', 'financeiro'];
    return order
        .map((category) => ({
            category,
            label: SIM_MODEL_CATEGORY_LABELS[category],
            models: getSimModelsByCategory(category),
        }))
        .filter((g) => g.models.length > 0);
}

// ----------------------------------------------------------------
// BUILTIN REGISTRATION (legacy scenarios como modelos 'ambiental')
// ----------------------------------------------------------------

let _builtinsLoaded = false;

function _ensureBuiltins(): void {
    if (_builtinsLoaded) return;
    _builtinsLoaded = true;
    for (const sc of getAllScenarios() as any[]) {
        if (_registry.has(sc.id)) continue;
        registerSimModel({
            id: sc.id,
            name: sc.name,
            description: sc.description,
            icon: sc.icon,
            color: sc.color,
            category: 'ambiental',
            tags: sc.tags,
            legacyScenarioId: sc.id,
        });
    }
}

// ----------------------------------------------------------------
// ENGINE — generic path
// ----------------------------------------------------------------

function _pct(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
    return sorted[idx] as number;
}

function _statsOf(values: number[]): SimMetricStats {
    const s = [...values].sort((a, b) => a - b);
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return {
        p10: _pct(s, 0.1),
        p25: _pct(s, 0.25),
        p50: _pct(s, 0.5),
        p75: _pct(s, 0.75),
        p90: _pct(s, 0.9),
        mean,
    };
}

/** Curva de convergência: P50 acumulada avaliada em ~20 pontos. */
function _convergenceSeries(values: number[]): { n: number; p50: number }[] {
    const out: { n: number; p50: number }[] = [];
    const step = Math.max(5, Math.floor(values.length / 20));
    for (let n = step; n <= values.length; n += step) {
        const s = values.slice(0, n).sort((a, b) => a - b);
        out.push({ n, p50: _pct(s, 0.5) });
    }
    if (out.length === 0 || out[out.length - 1]!.n !== values.length) {
        const s = [...values].sort((a, b) => a - b);
        out.push({ n: values.length, p50: _pct(s, 0.5) });
    }
    return out;
}

/**
 * Executa um modelo genérico: LHS -> inverse transform por parâmetro ->
 * evaluate() -> stats + convergência por métrica. Determinístico com seed.
 */
export function runGenericModel(model: SimModel, config: RunSimModelConfig = {}): GenericModelResult {
    const params = model.params ?? [];
    const evaluate = model.evaluate;
    if (!evaluate || params.length === 0) {
        throw new Error(`Modelo "${model.id}" não é genérico (sem params/evaluate)`);
    }
    const n = Math.max(10, Math.min(config.numRuns ?? 300, 10000));
    const seed = config.seed ?? Math.floor(Math.random() * 0xffffffff);

    const lhs = lhsMatrix(n, params.length, seed);
    const perMetric: Record<string, number[]> = {};

    for (let i = 0; i < n; i++) {
        const row = lhs[i] as number[];
        const sample: Record<string, number> = {};
        for (let d = 0; d < params.length; d++) {
            const p = params[d] as SimParamDef;
            sample[p.key] = sampleFromUniform(p.dist, p.distParams, row[d] as number);
        }
        const out = evaluate(sample);
        for (const [k, v] of Object.entries(out)) {
            if (!Number.isFinite(v)) continue;
            (perMetric[k] ??= []).push(v);
        }
    }

    const metrics: Record<string, SimMetricStats> = {};
    const convergence: Record<string, { n: number; p50: number }[]> = {};
    for (const [k, values] of Object.entries(perMetric)) {
        metrics[k] = _statsOf(values);
        convergence[k] = _convergenceSeries(values);
    }

    return {
        kind: 'generic-model',
        modelId: model.id,
        nRuns: n,
        seed,
        metrics,
        convergence,
        samples: perMetric,
        score: model.scoreOf ? model.scoreOf(metrics) : null,
        model,
    };
}

/**
 * Ponto de entrada único: roda modelo genérico OU adapter legado.
 * Adapter legado delega 1:1 ao caminho atual (runAll+calculateStats+
 * calculateScore) — mesmo código, mesmos resultados (reprodutível c/ seed).
 */
export function runSimModel(idOrModel: string | SimModel, config: RunSimModelConfig = {}): any {
    const model = typeof idOrModel === 'string' ? getSimModel(idOrModel) : idOrModel;
    if (!model) throw new Error(`SimModel não encontrado: "${String(idOrModel)}"`);

    if (model.legacyScenarioId) {
        const base = getScenarioParams(model.legacyScenarioId);
        if (!base) throw new Error(`Cenário legado não encontrado: "${model.legacyScenarioId}"`);
        const effective = config.paramOverrides ? { ...base, ...config.paramOverrides } : base;
        const runs = runAll(effective as any, config.numRuns ?? 300, config.seed) as any;
        const stats = calculateStats(runs, config.budget ?? null) as any;
        const score = calculateScore(stats, config.weights ?? {});
        return {
            kind: 'legacy-scenario',
            modelId: model.id,
            runs,
            stats,
            score,
            config: { numRuns: config.numRuns ?? 300, params: effective, seed: runs._seed, budget: config.budget ?? null },
        };
    }
    return runGenericModel(model, config);
}
