// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Temporal Analysis Orchestrator - D2 Statistical Engine
/* ================================================================
   TEMPORAL ANALYSIS — Intelligent Test Selector
   ================================================================

   Orquestrador que seleciona automaticamente o teste estatístico
   correto com base nos dados, seguindo o fluxo EPA-compatible:

   n < 3       → erro "dados insuficientes"
   n ≤ 50      → Shapiro-Wilk; n > 50 → KS
   Normal      → Levene → ANOVA + Tukey (se OK) | KW + Dunn (se não)
   Não-normal  → Kruskal-Wallis + Dunn
   Sempre      → Mann-Kendall, Pettitt, CUSUM, Grubbs

   ================================================================ */
import { shapiroWilk, kolmogorovSmirnov, leveneTest, anovaOneWay, kruskalWallis, tukeyHSD, dunnTest, mannKendall, seasonalMannKendall, sensSlope, pettittTest, cusum, correlationMatrix, grubbsTest, dixonQTest, acf, } from './statistics.js';
import { loadScriptCDN } from '../../utils/helpers/cdnLoader.js';
/**
 * @typedef {Record<string, any> & {
 *   normality?: any,
 *   mannKendall?: any,
 *   senSlope?: any,
 *   seasonalMannKendall?: any,
 *   pettitt?: any,
 *   cusum?: any,
 *   grubbs?: any,
 *   dixonQ?: any,
 *   acf?: any,
 *   levene?: any,
 *   anova?: any,
 *   tukey?: any,
 *   kruskalWallis?: any,
 *   dunn?: any
 * }} TemporalAllResults
 *
 * @typedef {{
 *   recommendedTest: string|null,
 *   reason: string|null,
 *   allResults: TemporalAllResults
 * }} TemporalAutoResult
 *
 * @typedef {{ alpha?: number, period?: number|null, correlationMethod?: 'spearman'|'pearson' }} TemporalOptions
 */
// ================================================================
// JSTAT LOADER - carregado uma vez, cacheado
// ================================================================
let _jStatLoaded = false;
/**
 * Ensures jStat is loaded before running D2 functions
 * Garante que jStat está carregado antes de executar funções D2
 */
async function ensureJStat() {
    if (_jStatLoaded || (typeof window !== 'undefined' && window.jStat)) {
        _jStatLoaded = true;
        return;
    }
    await loadScriptCDN('https://cdn.jsdelivr.net/npm/jstat@1.9.6/dist/jstat.min.js', {
        globalVar: 'jStat',
        timeout: 15000,
    });
    _jStatLoaded = true;
}
// ================================================================
// AUTO-SELECT - Fluxo de decisão EPA-compatible
// ================================================================
/**
 * Automatically selects and runs the appropriate statistical tests
 * Seleção automática de teste estatístico - fluxo de decisão EPA-compatible
 *
 * @param {number[]} values - série temporal
 * @param {number[][]} [groups=null] - grupos para comparação (ex: campanhas)
 * @param {Object} [options={}]
 * @param {number} [options.alpha=0.05] - nível de significância
 * @param {number} [options.period=null] - período sazonal (12=mensal, 4=trimestral)
 * @param {'spearman'|'pearson'} [options.correlationMethod='spearman']
 * @returns {Promise<{
 *   recommendedTest: string,
 *   reason: string,
 *   allResults: Object,
 *   normality: Object,
 *   trend: Object,
 *   changePoint: Object,
 *   outliers: Object
 * }>}
 */
/**
 * @param {number[]} values
 * @param {number[][]|null} [groups]
 * @param {TemporalOptions} [options]
 * @returns {Promise<any>}
 */
export async function autoSelectTest(values: any, groups: any = null, options: any = {}) {
    await ensureJStat();
    const { alpha = 0.05, period = null } = options;
    const n = values.length;
    /** @type {TemporalAutoResult} */
    const result: any = {
        recommendedTest: null,
        reason: null,
        allResults: {},
    };
    if (n < 3) {
        result.reason = `Dados insuficientes (n=${n}, mínimo=3)`;
        return result;
    }
    // --- 1. Normalidade ---
    const normalityTest = n <= 50 ? shapiroWilk(values, alpha) : kolmogorovSmirnov(values, alpha);
    const normalityLabel = n <= 50 ? 'Shapiro-Wilk' : 'Kolmogorov-Smirnov';
    result.allResults.normality = { ...normalityTest, method: normalityLabel };
    // --- 2. Tendência (sempre executa) ---
    result.allResults.mannKendall = mannKendall(values);
    result.allResults.senSlope = sensSlope(Array.from({ length: n }, (_, i) => i), values);
    if (period && period > 1) {
        result.allResults.seasonalMannKendall = seasonalMannKendall(values, period, alpha);
    }
    // --- 3. Mudança estrutural ---
    result.allResults.pettitt = pettittTest(values, alpha);
    result.allResults.cusum = cusum(values);
    // --- 4. Outliers ---
    result.allResults.grubbs = grubbsTest(values, alpha);
    if (n <= 30)
        result.allResults.dixonQ = dixonQTest(values, alpha);
    // --- 5. Autocorrelação ---
    result.allResults.acf = acf(values, Math.min(20, Math.floor(n / 2)));
    // --- 6. Comparação de grupos (se fornecidos) ---
    if (groups && groups.length >= 2) {
        const isNormal = normalityTest.normal;
        if (isNormal) {
            const levene = leveneTest(groups, alpha);
            result.allResults.levene = levene;
            if (levene.homogeneous) {
                result.allResults.anova = anovaOneWay(groups, alpha);
                result.allResults.tukey = tukeyHSD(groups, alpha);
                result.recommendedTest = 'ANOVA + Tukey HSD';
                const normalityStatistic = 'W' in normalityTest ? normalityTest.W?.toFixed(3) : normalityTest.D?.toFixed(3);
                result.reason = `Dados normais (${normalityLabel} W=${normalityStatistic}, p=${normalityTest.pValue?.toFixed(3)}) com variâncias homogêneas (Levene p=${levene.pValue.toFixed(3)}) — ANOVA paramétrica aplicável.`;
            }
            else {
                result.allResults.kruskalWallis = kruskalWallis(groups, alpha);
                result.allResults.dunn = dunnTest(groups, alpha);
                result.recommendedTest = 'Kruskal-Wallis + Dunn';
                result.reason = `Dados normais mas variâncias heterogêneas (Levene p=${levene.pValue.toFixed(3)}) — ANOVA não-aplicável, usando KW não-paramétrico.`;
            }
        }
        else {
            result.allResults.kruskalWallis = kruskalWallis(groups, alpha);
            result.allResults.dunn = dunnTest(groups, alpha);
            result.recommendedTest = 'Kruskal-Wallis + Dunn';
            result.reason = `Dados não-normais (${normalityLabel} p=${normalityTest.pValue?.toFixed(3)}) — Kruskal-Wallis não-paramétrico selecionado.`;
        }
    }
    else {
        // Sem grupos: teste de tendência é o principal
        const mk = result.allResults.mannKendall;
        result.recommendedTest = 'Mann-Kendall';
        const trendLabel = mk.trend === 'increasing'
            ? 'tendência crescente'
            : mk.trend === 'decreasing'
                ? 'tendência decrescente'
                : 'sem tendência significativa';
        result.reason = `Análise univariada: Mann-Kendall detectou ${trendLabel} (Z=${mk.Z?.toFixed(3)}, p=${mk.pValue?.toFixed(3)}).`;
    }
    return result;
}
// ================================================================
// PARAMETER ANALYSIS - Integração com elementos do modelo
// ================================================================
/**
 * Analyzes all observations of one parameter in one element
 * Análise completa de um parâmetro em um elemento do modelo
 * @param {string} elementId
 * @param {string} parameterId
 * @param {TemporalOptions} [options={}]
 * @returns {Promise<Record<string, any>>}
 */
export async function analyzeParameter(elementId: any, parameterId: any, options: any = {}) {
    await ensureJStat();
    const elementsMod = (await import('../elements/manager.js' as string)) as any;
    const elements = ((elementsMod.getElements || elementsMod.getAllElements)()) as any[];
    const element = elements.find((/** @type {any} */ e) => e.id === elementId);
    if (!element)
        throw new Error(`Elemento não encontrado: ${elementId}`);
    // Extrair observações do parâmetro por campanha
    const allObs = [];
    if (element.observations) {
        for (const obs of element.observations) {
            if (obs.parameterId === parameterId && obs.value !== null && obs.value !== undefined) {
                allObs.push({ value: Number(obs.value), date: obs.timestamp || obs.date });
            }
        }
    }
    if (allObs.length < 3) {
        return {
            error: `Dados insuficientes para ${parameterId} em ${elementId} (n=${allObs.length})`,
            elementId,
            parameterId,
        };
    }
    allObs.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const values = allObs.map((o: any) => o.value);
    const timestamps = allObs.map((o: any) => new Date(o.date).getTime());
    const analysis = await autoSelectTest(values, null, options);
    return {
        elementId,
        parameterId,
        n: values.length,
        values,
        timestamps,
        dateRange: { from: allObs[0]!.date, to: allObs[allObs.length - 1]!.date },
        ...analysis,
    };
}
/**
 * Batch analysis for all elements and parameters in current model
 * Análise em lote de todos os parâmetros e elementos com dados suficientes
 * @param {TemporalOptions} [options={}]
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function analyzeAllParameters(options = {}) {
    await ensureJStat();
    const elementsMod = (await import('../elements/manager.js' as string)) as any;
    const elements = ((elementsMod.getElements || elementsMod.getAllElements)()) as any[];
    const results = [];
    for (const el of elements) {
        if (!el.observations || el.observations.length < 3)
            continue;
        // Agrupar observações por parâmetro
        /** @type {Record<string, number[]>} */
        const paramMap: any = {};
        for (const obs of el.observations) {
            if (obs.value === null || obs.value === undefined)
                continue;
            const key = obs.parameterId || obs.parameter;
            if (!key)
                continue;
            if (!paramMap[key])
                paramMap[key] = [];
            paramMap[key].push(Number(obs.value));
        }
        for (const [paramId, values] of Object.entries<any>(paramMap)) {
            if (values.length < 3)
                continue;
            try {
                const res = await autoSelectTest(values, null, options);
                results.push({
                    elementId: el.id,
                    elementLabel: el.label || el.id,
                    parameterId: paramId,
                    n: values.length,
                    ...res,
                });
            }
            catch (err: any) {
                results.push({ elementId: el.id, parameterId: paramId, error: /** @type {any} */ (err).message });
            }
        }
    }
    return results;
}
/**
 * Computes correlation matrix between parameters across selected elements
 * Matriz de correlação entre parâmetros nos elementos selecionados
 * @param {string[]} elementIds
 * @param {string[]} parameterIds
 * @param {'spearman'|'pearson'} [method='spearman']
 * @returns {Promise<Record<string, any>>}
 */
export async function computeCorrelationMatrix(elementIds: any, parameterIds: any, method: any = "spearman") {
    await ensureJStat();
    const elementsMod = (await import('../elements/manager.js' as string)) as any;
    const elements = ((elementsMod.getElements || elementsMod.getAllElements)()).filter((e: any) => elementIds.includes(e.id)) as any[];
    // Agregar valores por parâmetro (média por elemento)
    const paramSeries = parameterIds
        .map((pid: any) => {
        const values = [];
        for (const el of elements) {
            const obs = (el.observations || []).filter((o: any) => (o.parameterId || o.parameter) === pid && o.value !== null);
            if (obs.length > 0) {
                values.push(obs.reduce((s: any, o: any) => s + Number(o.value), 0) / obs.length);
            }
        }
        return { name: pid, values };
    })
        .filter((p: any) => p.values.length >= 3);
    if (paramSeries.length < 2) {
        return { error: 'Mínimo 2 parâmetros com dados suficientes necessários para matriz de correlação' };
    }
    return correlationMatrix(paramSeries, method);
}
