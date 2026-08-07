// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   PREDICTION ENGINE — Trend analysis and forecasting
   ================================================================

   Analisa series temporais de observacoes e projeta tendencias.
   Usa 3 metodos estatisticos (app-side) + interpretacao LLM.

   METODOS:
   - Regressao Linear (OLS) com R²
   - Mann-Kendall (tendencia nao-parametrica)
   - Sen's Slope (inclinacao robusta)

   ================================================================ */
import { linearRegression, mannKendall, sensSlope, descriptiveStats } from './statistics.js';
import { getAllElements } from '../elements/manager.js';
import { sendMessage } from '../llm/client.js';
import { hasApiKey } from '../llm/client.js';
import { CONFIG } from '../../config.js';
// ================================================================
// TIME SERIES ANALYSIS - Run all statistical methods
// ================================================================
/**
 * Analyze time series for one element-parameter combination.
 * Analisa a serie temporal de um par elemento-parametro.
 *
 * @param {string} elementId - Element identifier
 * @param {string} parameterId - Parameter identifier
 * @returns {Object|null} Analysis result or null if insufficient data
 */
export function analyzeTimeSeries(elementId: any, parameterId: any) {
    const elements = getAllElements();
    const element = elements.find((/** @type {any} */ el) => el.id === elementId);
    if (!element?.data?.observations)
        return null;
    // Filter observations for this parameter
    const obs = element.data.observations.filter((o: any) => o.parameterId === parameterId);
    if (obs.length < 3)
        return null;
    // Sort by date
    obs.sort((a: any, b: any) => 
    (new Date(a.date) as any) - (new Date(b.date) as any));
    // Extract time series
    const baseTime = new Date(obs[0].date).getTime();
    const times = obs.map((o: any) => (new Date(o.date).getTime() - baseTime) / (1000 * 60 * 60 * 24)); // days
    const values = obs.map((o: any) => parseFloat(o.value) || 0);
    // Run all three methods
    const ols = (linearRegression(times, values)) as any;
    const mk = (mannKendall(values)) as any;
    const sen = (sensSlope(times, values)) as any;
    const stats = descriptiveStats(values);
    // Check regulatory limit
    const param = CONFIG.PARAMETERS.find((/** @type {any} */ p) => p.id === parameterId);
    const unit = param ? CONFIG.UNITS.find((/** @type {any} */ u) => u.id === param.defaultUnitId) : null;
    return {
        elementId,
        elementName: element.name,
        parameterId,
        parameterName: param?.name || parameterId,
        unitSymbol: unit?.symbol || '',
        n: obs.length,
        dateRange: {
            start: obs[0].date,
            end: obs[obs.length - 1].date,
        },
        ols: {
            slope: ols.slope,
            intercept: ols.intercept,
            r2: ols.r2,
            // Slope per day → convert to per month for readability
            slopePerMonth: ols.slope * 30,
        },
        mannKendall: {
            S: mk.S,
            Z: mk.Z,
            pValue: mk.pValue,
            tau: mk.tau,
            trend: mk.trend,
            significant: mk.significant,
        },
        sensSlope: {
            slope: sen.slope,
            intercept: sen.intercept,
            slopePerMonth: sen.slope * 30,
            lowerCI: sen.lowerCI,
            upperCI: sen.upperCI,
        },
        stats,
        latestValue: values[values.length - 1],
        // Consensus trend: use Mann-Kendall as primary (non-parametric, more robust)
        trend: mk.trend,
        significant: mk.significant,
    };
}
// ================================================================
// FORECASTING - Project future values
// ================================================================
/**
 * Project future values using Sen's slope (robust).
 * Projeta valores futuros usando a inclinacao de Sen.
 *
 * @param {string} elementId
 * @param {string} parameterId
 * @param {number} daysAhead - Number of days to project
 * @returns {Array<{date: string, value: number, lower: number, upper: number}>}
 */
export function projectTrend(elementId: any, parameterId: any, daysAhead: any = 90) {
    /** @type {any} */
    const analysis = analyzeTimeSeries(elementId, parameterId);
    if (!analysis)
        return [];
    const endDate = new Date(analysis.dateRange.end);
    const forecast = [];
    for (let d = 30; d <= daysAhead; d += 30) {
        const futureDate = new Date(endDate.getTime() + d * 24 * 60 * 60 * 1000);
        const projectedValue = analysis.latestValue + analysis.sensSlope.slope * d;
        const lowerValue = analysis.latestValue + analysis.sensSlope.lowerCI * d;
        const upperValue = analysis.latestValue + analysis.sensSlope.upperCI * d;
        forecast.push({
            date: futureDate.toISOString().split('T')[0],
            value: projectedValue,
            lower: lowerValue,
            upper: upperValue,
        });
    }
    return forecast;
}
// ================================================================
// BATCH ANALYSIS - Analyze all element-parameter combinations
// ================================================================
/**
 * Analyze all time series across all elements.
 * Analisa todas as series temporais de todos os elementos.
 * Retorna resultados ordenados por significancia (p-value).
 *
 * @returns {any[]} Array of analysis results, sorted by significance
 */
export function getAllTrends() {
    const elements = getAllElements();
    /** @type {any[]} */
    const results = [];
    for (const element of elements) {
        if (!element.data?.observations)
            continue;
        // Find unique parameters for this element
        /** @type {Set<any>} */
        const paramIds = new Set();
        element.data.observations.forEach((obs: any) => {
            if (obs.parameterId)
                paramIds.add(obs.parameterId);
        });
        for (const paramId of paramIds) {
            const analysis = analyzeTimeSeries(element.id, paramId);
            if (analysis) {
                results.push(analysis);
            }
        }
    }
    // Sort by significance (lowest p-value first = most significant)
    results.sort((a: any, b: any) => a.mannKendall.pValue - b.mannKendall.pValue);
    return results;
}
// ================================================================
// LLM INTERPRETATION - Narrative trend analysis
// ================================================================
/**
 * Request LLM interpretation of trend results.
 * Pede ao LLM para interpretar os resultados estatisticos.
 *
 * @param {any} analysis - Result from analyzeTimeSeries
 * @returns {Promise<any>} { interpretation, recommendation, urgency }
 */
export async function interpretTrend(analysis: any) {
    if (!hasApiKey()) {
        return {
            interpretation: 'Configure API key to get AI interpretation.',
            recommendation: '',
            urgency: 'unknown',
        };
    }
    const systemPrompt = `You are an environmental monitoring analyst.
Interpret the following trend analysis results. Be concise and actionable.

Return JSON:
{
    "interpretation": "1-2 sentence summary of what the trend means",
    "recommendation": "specific action recommendation",
    "urgency": "low|medium|high|critical"
}`;
    const userMessage = `ELEMENT: ${analysis.elementName}
PARAMETER: ${analysis.parameterName} (${analysis.unitSymbol})
DATA POINTS: ${analysis.n} (${analysis.dateRange.start} to ${analysis.dateRange.end})
LATEST VALUE: ${analysis.latestValue} ${analysis.unitSymbol}

STATISTICAL RESULTS:
- Linear Regression: slope=${analysis.ols.slopePerMonth.toFixed(4)}/month, R²=${analysis.ols.r2.toFixed(3)}
- Mann-Kendall: tau=${analysis.mannKendall.tau.toFixed(3)}, p-value=${analysis.mannKendall.pValue.toFixed(4)}, trend=${analysis.mannKendall.trend}
- Sen's Slope: ${analysis.sensSlope.slopePerMonth.toFixed(4)}/month (CI: ${analysis.sensSlope.lowerCI.toFixed(4)} to ${analysis.sensSlope.upperCI.toFixed(4)})

Interpret this data and provide recommendation.`;
    try {
        const response = await sendMessage(systemPrompt, userMessage, { maxTokens: 500 });
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return { interpretation: response.content, recommendation: '', urgency: 'unknown' };
    }
    catch (e: any) {
        return { interpretation: /** @type {any} */ (e).message, recommendation: '', urgency: 'unknown' };
    }
}
