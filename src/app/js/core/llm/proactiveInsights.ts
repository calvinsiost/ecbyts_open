// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// @ts-check
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   PROACTIVE INSIGHTS ENGINE
   ================================================================

   Motor de insights proativos que gera dicas contextuais ao
   selecionar elementos. Funciona sem API key (analise local pura)
   e opcionalmente enriquece com LLM quando disponivel.

   Cada gerador produz um Array<Tip> com:
   { category, severity ('info'|'warning'|'critical'), message, action }

   Comunicacao via CustomEvent 'ecbt:proactiveTip'.
   Debounce de 600ms para evitar spam ao clicar rapidamente.

   ================================================================ */
import { getElementById } from '../elements/manager.js';
import { t } from '../../utils/i18n/translations.js';
import { createLogger } from '../../utils/helpers/logger.js';
/**
 * @typedef {{ category: string, severity: string, message: string, action: string | null }} Tip
 */
const log = createLogger('ProactiveInsights');
// Debounce state
/** @type {any} */
let _timer: any = null;
/** @type {any} */
let _lastId: any = null;
const DEBOUNCE_MS = 600;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Generate proactive insight tips for a selected element.
 * Roda geradores em paralelo via Promise.allSettled.
 * Funciona sem API key - todas as analises sao locais.
 *
 * @param {string} elementId
 * @returns {Promise<Array<{category: string, severity: string, message: string, action: string|null}>>}
 */
export async function generateElementInsights(elementId: any) {
    const element = getElementById(elementId);
    if (!element)
        return [];
    const obs = (element.data?.observations || []) as any[];
    // Se nao tem observacoes, gerar apenas tips informativos
    if (obs.length === 0) {
        return [
            {
                category: 'INFO',
                severity: 'info',
                message: t('tipNoObservations') || 'No observations for this element. Add data for analysis.',
                action: null,
            },
        ];
    }
    // Rodar geradores em paralelo - cada um retorna Array<Tip>
    const results = await Promise.allSettled([
        _complianceTips(element, obs),
        _trendTips(element, obs),
        _campaignTips(element),
        _outlierTips(element, obs),
        _statsTips(element, obs),
        _libraryTips(element),
        _cacheTips(element),
        _knowledgeTips(element),
    ]);
    // Flatten resultados, ignorando falhas
    /** @type {Tip[]} */
    const tips: any[] = [];
    for (const r of results) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
            tips.push(...r.value);
        }
    }
    // Ordenar: critical > warning > info
    /** @type {Record<string, number>} */
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    tips.sort((a: any, b: any) => ((severityOrder as Record<string, any>)[a.severity] || 2) - ((severityOrder as Record<string, any>)[b.severity] || 2));
    // Aplicar tip density setting do usuario
    let maxTips = 5;
    try {
        const { getPersonalitySettings } = await import('../../utils/handlers/llmChat.js' as string);
        const { tipDensity } = getPersonalitySettings();
        if (tipDensity === 'minimal') {
            maxTips = 2;
            // Minimal: so critical + warning
            const filtered = tips.filter((tip: any) => tip.severity === 'critical' || tip.severity === 'warning');
            if (filtered.length > 0)
                return filtered.slice(0, maxTips);
            // Se nao ha critical/warning, mostrar 1 info
            return tips.slice(0, 1);
        }
        else if (tipDensity === 'maximum') {
            maxTips = 8;
        }
    }
    catch (e: any) {
        console.debug('[proactiveInsights] tipDensity:', e?.message || e);
        // Fallback: usar maxTips default
    }
    return tips.slice(0, maxTips);
}
/**
 * Request element insights with debounce (600ms).
 * Dispatches 'ecbt:proactiveTip' event when done.
 *
 * @param {string} elementId
 */
export function requestElementInsights(elementId: any) {
    if (_timer)
        clearTimeout(_timer);
    _lastId = elementId;
    _timer = setTimeout(async () => {
        if (elementId !== _lastId)
            return; // stale
        try {
            const tips = await generateElementInsights(elementId);
            window.dispatchEvent(new CustomEvent('ecbt:proactiveTip', {
                detail: { elementId, tips },
            }));
        }
        catch (err: any) {
            log.warn('Insight generation failed:', err);
        }
    }, DEBOUNCE_MS);
}
/**
 * Cancel any pending debounced insight request.
 */
export function cancelPendingInsights() {
    if (_timer) {
        clearTimeout(_timer);
        _timer = null;
    }
}
// ----------------------------------------------------------------
// TIP GENERATORS - cada um retorna Array<Tip>
// ----------------------------------------------------------------
/**
 * Compliance tips - checa observacoes contra limites regulatorios.
 * Usa computeGlobalCompliance (dynamic import).
 */
async function _complianceTips(element: any, obs: any) {
    /** @type {any[]} */
    const tips: any[] = [];
    try {
        const { computeGlobalCompliance } = await import('../validation/globalCompliance.js' as string);
        const result = (computeGlobalCompliance(obs, 'groundwater')) as any;
        if (!result || result.score >= 4)
            return tips; // Compliant
        // Para cada substancia que falhou, gerar tip
        const substResults = result.substanceResults || {};
        let count = 0;
        for (const [cas, jurisdictions] of Object.entries(substResults) as [string, any][]) {
            for (const [jId, jr] of Object.entries(jurisdictions) as [string, any][]) {
                if (!jr.pass && jr.value != null && jr.threshold != null && count < 2) {
                    tips.push({
                        category: 'COMPLIANCE',
                        severity: 'critical',
                        message: `${jr.parameterName || cas}: ${jr.value} ${jr.unit || ''} > ${jr.threshold} ${jr.unit || ''} (${jId})`,
                        action: t('tipActionIntervention') || 'Intervention recommended',
                    });
                    count++;
                }
            }
        }
        // Score geral
        if (tips.length === 0 && result.score < 3) {
            tips.push({
                category: 'COMPLIANCE',
                severity: 'warning',
                message: `Compliance score: ${result.score}/5 (${result.verdict})`,
                action: t('tipActionInvestigate') || 'Investigate',
            });
        }
    }
    catch (err: any) {
        log.debug('Compliance tips skipped:', err?.message);
    }
    return tips;
}
/**
 * Trend tips - analise de tendencia para cada parametro com >=3 obs.
 * Usa analyzeTimeSeries (dynamic import).
 */
async function _trendTips(element: any, obs: any) {
    /** @type {any[]} */
    const tips: any[] = [];
    try {
        const { analyzeTimeSeries } = await import('../analytics/prediction.js' as string);
        // Agrupar obs por parametro
        /** @type {Record<string, any[]>} */
        const byParam: Record<string, any[]> = {};
        for (const o of obs) {
            if (!o.parameterId || o.value == null)
                continue;
            (byParam[o.parameterId] = byParam[o.parameterId] || []).push(o);
        }
        for (const [paramId, paramObs] of Object.entries(byParam) as [string, any[]][]) {
            if (paramObs.length < 3)
                continue;
            const analysis = (analyzeTimeSeries(element.id, paramId)) as any;
            if (!analysis || !analysis.mannKendall?.significant)
                continue;
            const direction = analysis.mannKendall.trend === 'increasing'
                ? t('tipTrendIncreasing') || 'increasing'
                : t('tipTrendDecreasing') || 'decreasing';
            const slope = analysis.sensSlope?.slopePerMonth?.toFixed(2) || analysis.ols?.slopePerMonth?.toFixed(2) || '?';
            const pVal = analysis.mannKendall.pValue?.toFixed(3) || '?';
            tips.push({
                category: 'TREND',
                severity: analysis.mannKendall.trend === 'increasing' ? 'warning' : 'info',
                message: `${analysis.parameterName || paramId}: ${direction} ${slope}/month (Mann-Kendall p=${pVal})`,
                action: null,
            });
            if (tips.length >= 2)
                break; // Limitar a 2 trends
        }
    }
    catch (err: any) {
        log.debug('Trend tips skipped:', err?.message);
    }
    return tips;
}
/**
 * Campaign tips - checa completude das campanhas ativas.
 */
async function _campaignTips(element: any) {
    /** @type {any[]} */
    const tips: any[] = [];
    try {
        const { getAllCampaigns, getCampaignCompleteness } = await import('../campaigns/manager.js' as string);
        const { getAllElements } = await import('../elements/manager.js' as string);
        const campaigns = (getAllCampaigns()) as any[];
        const allElements = (getAllElements()) as any[];
        for (const c of campaigns) {
            // Verificar se esta campanha referencia este elemento
            const planned = c.plannedReadings || [];
            const hasElement = planned.some((r: any) => r.elementId === element.id);
            if (!hasElement)
                continue;
            const completeness = (getCampaignCompleteness(c.id, allElements)) as any;
            if (!completeness || completeness.completeness >= 0.8)
                continue;
            const pct = Math.round(completeness.completeness * 100);
            tips.push({
                category: 'CAMPAIGN',
                severity: 'warning',
                message: `${c.name}: ${pct}% ${t('tipCampaignIncomplete') ? 'complete' : 'complete'}`,
                action: t('tipActionCompleteCampaign') || 'Complete campaign',
            });
            if (tips.length >= 1)
                break;
        }
    }
    catch (err: any) {
        log.debug('Campaign tips skipped:', err?.message);
    }
    return tips;
}
/**
 * Outlier tips - detecta valores atipicos via Grubbs test.
 */
async function _outlierTips(element: any, obs: any) {
    /** @type {any[]} */
    const tips: any[] = [];
    try {
        const { grubbsTest } = await import('../analytics/statistics.js' as string);
        /** @type {Record<string, any[]>} */
        const byParam: Record<string, any[]> = {};
        for (const o of obs) {
            if (!o.parameterId || o.value == null)
                continue;
            (byParam[o.parameterId] = byParam[o.parameterId] || []).push(o.value);
        }
        for (const [paramId, values] of Object.entries(byParam) as [string, any[]][]) {
            if (values.length < 3)
                continue;
            const result = (grubbsTest(values)) as any;
            if (!result || !result.reject)
                continue;
            tips.push({
                category: 'OUTLIER',
                severity: 'warning',
                message: `${paramId}: ${t('tipOutlier') || 'Outlier detected'} (${result.outlierValue})`,
                action: t('tipActionInvestigate') || 'Investigate cause',
            });
            if (tips.length >= 1)
                break;
        }
    }
    catch (err: any) {
        log.debug('Outlier tips skipped:', err?.message);
    }
    return tips;
}
/**
 * Stats tips - dados insuficientes ou alta variabilidade.
 */
async function _statsTips(element: any, obs: any) {
    /** @type {any[]} */
    const tips: any[] = [];
    try {
        /** @type {Record<string, any[]>} */
        const byParam: Record<string, any[]> = {};
        for (const o of obs) {
            if (!o.parameterId || o.value == null)
                continue;
            (byParam[o.parameterId] = byParam[o.parameterId] || []).push(o);
        }
        for (const [paramId, paramObs] of Object.entries(byParam) as [string, any[]][]) {
            if (paramObs.length < 3) {
                tips.push({
                    category: 'INFO',
                    severity: 'info',
                    message: `${paramId}: ${paramObs.length} ${t('tipInsufficientData') || 'readings -- insufficient for trend analysis'}`,
                    action: null,
                });
                if (tips.length >= 1)
                    break;
            }
        }
    }
    catch (err: any) {
        log.debug('Stats tips skipped:', err?.message);
    }
    return tips;
}
/**
 * Library tips - sugere bibliotecas nao instaladas com priorizacao geografica.
 * Reutiliza logica de _computeAvailable e _prioritize do antigo quickActions.
 */
async function _libraryTips(_element: any) {
    /** @type {any[]} */
    const tips: any[] = [];
    try {
        const { getInstalledLibraries } = await import('../../utils/libraries/manager.js' as string);
        const { getMarketplaceCatalogOffline } = await import('../../utils/libraries/marketplace.js' as string);
        const installedIds = new Set((getInstalledLibraries() as any[]).map((l: any) => l.manifest.id));
        const catalog = getMarketplaceCatalogOffline();
        const available = (catalog as any[]).filter((lib: any) => {
            const id = lib.id || lib.library_id;
            return !installedIds.has(id);
        });
        if (available.length === 0)
            return tips;
        // Priorizar top 2 bibliotecas disponiveis
        const top = available.slice(0, 2);
        for (const rawLib of top) {
            const lib = (rawLib) as any;
            const name = lib.name || lib.id || 'Library';
            const desc = lib.description ? ` -- ${lib.description.substring(0, 60)}` : '';
            tips.push({
                category: 'LIBRARY',
                severity: 'info',
                message: `${t('tipLibrarySuggestion') || 'Install'} '${name}'${desc}`,
                action: available.length > 2
                    ? `+${available.length - 2} ${t('tipMoreLibraries') || 'more in Marketplace'}`
                    : null,
            });
        }
    }
    catch (err: any) {
        log.debug('Library tips skipped:', err?.message);
    }
    return tips;
}
/**
 * Cache tips - usa resultados do idle processor (EIS, Monte Carlo, NN, simulacao).
 */
async function _cacheTips(_element: any) {
    /** @type {any[]} */
    const tips: any[] = [];
    try {
        const { getIdleCache } = await import('./idleAnalysisProcessor.js' as string);
        const cache = (getIdleCache()) as any;
        // EIS Score
        if (cache.eis?.data) {
            const eis = cache.eis.data;
            if (eis.eis != null && eis.eis < 3.5) {
                // Encontrar eixo mais fraco
                const scores = eis.scores || {};
                let weakAxis = '';
                let weakVal = 6;
                for (const [axis, val] of Object.entries(scores)) {
                    const numericVal = Number(val);
                    if (numericVal < weakVal) {
                        weakVal = numericVal;
                        weakAxis = axis;
                    }
                }
                tips.push({
                    category: 'EIS',
                    severity: eis.eis < 2.5 ? 'critical' : 'warning',
                    message: `EIS Score: ${eis.eis.toFixed(1)} (${eis.verdict || '?'})${weakAxis ? ` -- ${weakAxis} = ${weakVal}` : ''}`,
                    action: null,
                });
            }
        }
        // Monte Carlo
        if (cache.monteCarlo?.data) {
            const mc = cache.monteCarlo.data;
            if (mc.stats?.totalCost?.p50 != null) {
                const cost = mc.stats.totalCost.p50;
                const formatted = cost >= 1e6 ? `R$${(cost / 1e6).toFixed(1)}M` : `R$${(cost / 1e3).toFixed(0)}k`;
                tips.push({
                    category: 'SIMULATION',
                    severity: 'info',
                    message: `Monte Carlo P50: ${formatted} (${mc.config?.params?.months || 120} months)`,
                    action: null,
                });
            }
        }
        // Neural Network predictions
        if (cache.nn?.data) {
            const nn = cache.nn.data;
            if (nn.outputs && nn.confidence != null) {
                const firstOutput = Object.entries(nn.outputs)[0];
                if (firstOutput) {
                    tips.push({
                        category: 'NN',
                        severity: 'info',
                        message: `${firstOutput[0]}: ${Number(firstOutput[1]).toFixed(2)} (confidence ${Math.round(nn.confidence * 100)}%)`,
                        action: null,
                    });
                }
            }
        }
    }
    catch (err: any) {
        log.debug('Cache tips skipped:', err?.message);
    }
    return tips;
}
/**
 * Knowledge tips - sugere datasets disponiveis na area do projeto.
 * Usa cache do idle processor (knowledge assets pre-fetched).
 */
async function _knowledgeTips(_element: any) {
    /** @type {any[]} */
    const tips: any[] = [];
    try {
        const { getIdleCache } = await import('./idleAnalysisProcessor.js' as string);
        const cache = (getIdleCache()) as any;
        if (!cache.knowledge?.data?.length)
            return tips;
        // Top 2 assets mais relevantes
        const top = cache.knowledge.data.slice(0, 2);
        for (const asset of top) {
            const count = asset.feature_count
                ? ` (${asset.feature_count > 1000 ? Math.round(asset.feature_count / 1000) + 'K' : asset.feature_count} features)`
                : '';
            tips.push({
                category: 'DATA',
                severity: 'info',
                message: `${asset.name}${count} -- ${asset.asset_category}`,
                action: null,
            });
        }
    }
    catch (err: any) {
        log.debug('Knowledge tips skipped:', err?.message);
    }
    return tips;
}
