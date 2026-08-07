// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   METRICS COLLECTOR — Unified data aggregation for report export
   Coletor unificado de métricas para exportação de relatórios

   Coleta dados dos módulos analíticos dispersos (custos, EIS,
   compliance, EVA, elementos, campanhas) e retorna um objeto
   único consumido por pdfExport e docxExport.

   DESIGN:
   - Importações dinâmicas para evitar dependências circulares
   - Cada seção é coletada independentemente — falha parcial não bloqueia
   - Dados retornados como objetos simples (sem classes)
   ================================================================ */
import { getAllElements, countByFamily } from '../../core/elements/manager.js';
import { getAllCampaigns, getCampaignCompleteness } from '../../core/campaigns/manager.js';
import { getFamilyName } from '../../core/elements/families.js';
import { EisCalculator, EIS_AXES } from '../../core/eis/eisCalculator.js';
import { buildCostRollup } from '../../core/analytics/economics/costRollup.js';
import { validateObservationFull, getThresholds } from '../../core/validation/rules.js';
import { calculateProjectEVA, calculateEVA, getWbsItems } from '../governance/wbsManager.js';
import { getCalculatorItems, computeAllCalculator } from '../../core/calculator/manager.js';
import { computeCalculatorItemForElement } from '../../core/calculator/engine.js';
import { resolveRegulatoryContext } from '../../core/calculator/contextResolver.js';
import { getPresetById, applyPresetToElements } from './filterPresets.js';
// ----------------------------------------------------------------
// MAIN COLLECTOR
// ----------------------------------------------------------------
/**
 * Collect all metrics for report export.
 * Coleta todas as métricas disponíveis do modelo atual.
 *
 * @param {any} [filterPresetId]
 * @returns {any} Objeto unificado com todas as métricas
 */
export function collectReportMetrics(filterPresetId: any) {
    let elements = getAllElements() || [];
    const campaigns = getAllCampaigns() || [];
    // Aplica filter preset se fornecido
    if (filterPresetId) {
        const preset = getPresetById(filterPresetId);
        if (preset) {
            elements = applyPresetToElements(filterPresetId, elements);
        }
    }
    return {
        projectSummary: _collectProjectSummary(elements, campaigns),
        eis: _collectEIS(elements, campaigns),
        costSummary: _collectCostSummary(),
        compliance: _collectCompliance(elements),
        eva: _collectEVA(),
        elementInventory: _collectElementInventory(elements, campaigns),
        campaignSummary: _collectCampaignSummary(campaigns, elements),
        calculator: _collectCalculator(elements),
        complianceMatrix: _collectComplianceMatrix(elements),
    };
}
/**
 * Collect lightweight project summary only.
 * Coleta apenas resumo do projeto (leve, sem cálculos pesados).
 *
 * @returns {Object} projectSummary
 */
export function collectProjectSummary() {
    const elements = getAllElements() || [];
    const campaigns = getAllCampaigns() || [];
    return _collectProjectSummary(elements, campaigns);
}
// ----------------------------------------------------------------
// PROJECT SUMMARY
// Contagem de elementos, observações, campanhas e famílias
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} elements
 * @param {any} campaigns
 */
function _collectProjectSummary(elements: any, campaigns: any) {
    let totalObservations = 0;
    for (const el of elements) {
        totalObservations += el?.data?.observations?.length || 0;
    }
    const familyCounts = countByFamily();
    return {
        elementCount: elements.length,
        observationCount: totalObservations,
        campaignCount: campaigns.length,
        familyCounts,
    };
}
// ----------------------------------------------------------------
// EIS - Environmental Integrity Score
// Score, verdict e breakdown por eixo
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} elements
 * @param {any} campaigns
 */
function _collectEIS(elements: any, campaigns: any) {
    try {
        // EisCalculator e EIS_AXES importados no topo
        // Coleta todas as observações para credencial agregada
        const allObs = [];
        for (const el of elements) {
            if (el?.data?.observations) {
                allObs.push(...el.data.observations);
            }
        }
        const credResult = EisCalculator.computeAggregateCredential(allObs);
        // Computa Cp a partir das campanhas
        const campaignStats = campaigns.map((c: any) => {
            const comp = getCampaignCompleteness(c.id, elements);
            return { planned: comp.planned, executed: comp.executed };
        });
        const cpResult = EisCalculator.computeCpFromCampaigns(campaignStats);
        // Scores default (3 para cada eixo, com Cp do cálculo se disponível)
        /** @type {Record<string, any>} */
        const scores: any = {};
        for (const axis of EIS_AXES) {
            scores[axis] = 3;
        }
        if (cpResult) {
            scores.Cp = cpResult.score;
        }
        const calc = new EisCalculator();
        const result = calc.calculate(scores as any, 'geometric', 'common', credResult.multiplier);
        return {
            score: result.eis,
            verdict: result.verdict,
            verdictEmoji: result.verdict,
            mode: 'geometric',
            axisScores: result.adjustedScores,
            rawScores: scores,
            credentialMultiplier: result.credentialMultiplier,
            credentialBreakdown: credResult.breakdown,
            axes: EIS_AXES,
        };
    } catch (e: any) {
        console.warn('[MetricsCollector] EIS collection failed:', e);
        return null;
    }
}
// ----------------------------------------------------------------
// COST SUMMARY
// CAPEX/OPEX totais, por família, por ano, benchmarks
// ----------------------------------------------------------------
/** @private */
function _collectCostSummary() {
    try {
        const rollup = buildCostRollup();
        if (!rollup || rollup.grandTotal === 0) return null;
        return {
            grandTotal: rollup.grandTotal,
            totalCapex: rollup.totalCapex,
            totalOpex: rollup.totalOpex,
            currency: rollup.currency,
            byFamily: rollup.byFamily,
            byFiscalYear: rollup.byFiscalYear,
            byCampaign: rollup.byCampaign,
            timeline: rollup.timeline,
            benchmarks: rollup.benchmarks,
            kpis: rollup.kpis,
        };
    } catch (e: any) {
        console.warn('[MetricsCollector] Cost collection failed:', e);
        return null;
    }
}
// ----------------------------------------------------------------
// COMPLIANCE
// Violações por severidade (Intervenção, Prevenção, Referência)
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} elements
 */
function _collectCompliance(elements: any) {
    try {
        let intervention = 0,
            prevention = 0,
            reference = 0;
        /** @type {Map<any, any>} */
        const violationsByMonth = new Map();
        /** @type {Record<string, any>} */
        const violationsByElement: Record<string, any> = {};
        for (const el of elements) {
            const obs = el?.data?.observations || [];
            let elViolations = 0;
            for (const o of obs) {
                if (o.value == null || o.parameterId == null) continue;
                const results = validateObservationFull(
                    { value: o.value, unitId: o.unitId },
                    o.parameterId,
                    'groundwater',
                );
                if (results.length > 0) {
                    const sev = results[0].severity;
                    if (sev === 'intervention') intervention++;
                    else if (sev === 'prevention') prevention++;
                    else if (sev === 'reference') reference++;
                    else intervention++;
                    elViolations++;
                    // Agrupa por mês para gráfico timeline
                    if (o.timestamp) {
                        const d = new Date(o.timestamp);
                        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                        if (!violationsByMonth.has(key)) {
                            violationsByMonth.set(key, { label: key, intervention: 0, prevention: 0, reference: 0 });
                        }
                        const m = violationsByMonth.get(key);
                        if (sev === 'intervention') m.intervention++;
                        else if (sev === 'prevention') m.prevention++;
                        else if (sev === 'reference') m.reference++;
                        else m.intervention++;
                    }
                }
            }
            if (elViolations > 0) {
                violationsByElement[el.id] = {
                    name: el.name,
                    family: el.family,
                    count: elViolations,
                };
            }
        }
        const totalViolations = intervention + prevention + reference;
        // Timeline ordenada por mês
        const timeline = Array.from(violationsByMonth.values()).sort((/** @type {any} */ a, b: any) =>
            a.label.localeCompare(b.label),
        );
        return {
            totalViolations,
            intervention,
            prevention,
            reference,
            violationsByElement,
            timeline,
        };
    } catch (e: any) {
        console.warn('[MetricsCollector] Compliance collection failed:', e);
        return null;
    }
}
// ----------------------------------------------------------------
// EVA - Earned Value Analysis
// BAC, EAC, VAC, SPI, CPI, item EVAs
// ----------------------------------------------------------------
/** @private */
function _collectEVA() {
    try {
        const projectEva = calculateProjectEVA();
        if (!projectEva || projectEva.BAC === 0) return null;
        // Coleta EVA por item para gráfico
        const items = getWbsItems() || [];
        const itemEvas = items
            .map((item: any) => {
                const eva = calculateEVA(item.id);
                if (!eva || eva.BAC === 0) return null;
                return {
                    ...eva,
                    itemId: item.id,
                    itemName: item.name || item.code || item.id,
                };
            })
            .filter(Boolean);
        return {
            ...projectEva,
            itemEvas,
        };
    } catch (e: any) {
        console.warn('[MetricsCollector] EVA collection failed:', e);
        return null;
    }
}
// ----------------------------------------------------------------
// ELEMENT INVENTORY TABLE
// Nome, família, nº observações, última campanha
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} elements
 * @param {any} campaigns
 */
function _collectElementInventory(elements: any, campaigns: any) {
    // Mapa campaignId → nome da campanha
    /** @type {Map<any, any>} */
    const campaignMap = new Map();
    for (const c of campaigns) {
        campaignMap.set(c.id, c.name || c.id);
    }
    return elements.map((el: any) => {
        const obs = el?.data?.observations || [];
        // Encontra campanha mais recente
        let latestCampaign = '—';
        /** @type {any} */
        let latestDate = null;
        for (const o of obs) {
            if (o.campaignId && o.timestamp) {
                const d = new Date(o.timestamp);
                if (!latestDate || d > latestDate) {
                    latestDate = d;
                    latestCampaign = campaignMap.get(o.campaignId) || o.campaignId;
                }
            }
        }
        return {
            name: el.name || el.id,
            family: getFamilyName(el.family) || el.family,
            familyId: el.family,
            observationCount: obs.length,
            latestCampaign,
        };
    });
}
// ----------------------------------------------------------------
// CAMPAIGN SUMMARY TABLE
// Nome, data, elementos cobertos, completude
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} campaigns
 * @param {any} elements
 */
function _collectCampaignSummary(campaigns: any, elements: any) {
    return campaigns.map((c: any) => {
        const comp = getCampaignCompleteness(c.id, elements);
        // Conta elementos únicos com observações para esta campanha
        /** @type {Set<any>} */
        const coveredElements = new Set();
        for (const el of elements) {
            const obs = el?.data?.observations || [];
            if (obs.some((o: any) => o.campaignId === c.id)) {
                coveredElements.add(el.id);
            }
        }
        return {
            name: c.name || c.id,
            date: c.startDate || '—',
            elementsCovered: coveredElements.size,
            planned: comp.planned,
            executed: comp.executed,
            completeness: comp.ratio,
        };
    });
}
// ----------------------------------------------------------------
// CALCULATOR - Tabela transposta (elementos x items)
// Usa computeCalculatorItemForElement para cada celula
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} elements
 */
function _collectCalculator(elements: any) {
    try {
        const items = getCalculatorItems();
        const enabled = items.filter((i: any) => i.enabled);
        if (enabled.length === 0) return null;
        // Elementos com observacoes
        const withObs = elements.filter((el: any) => el?.data?.observations?.length > 0);
        if (withObs.length === 0) return null;
        // Headers: Element + cada item do calculator
        const headers = ['Element', ...enabled.map((i: any) => i.label || i.id)];
        // Rows: um por elemento, celulas = valor computado
        const rows = withObs.map((el: any) => ({
            element: el.name || el.id,
            family: el.family,
            cells: enabled.map((item: any) => {
                const val = computeCalculatorItemForElement(item, el);
                return {
                    value: val,
                    unit: item.unitId || '',
                    color: item.color || '',
                };
            }),
        }));
        // Aggregates: totais/medias globais via computeAllCalculator
        const aggregates = computeAllCalculator().map((r: any) => ({
            label: r.text,
            value: r.value,
            color: r.color,
            error: r.error,
        }));
        return { headers, rows, aggregates };
    } catch (e: any) {
        console.warn('[MetricsCollector] Calculator collection failed:', e);
        return null;
    }
}
// ----------------------------------------------------------------
// COMPLIANCE MATRIX - Tabela transposta (elementos x parametros)
// Celulas: ultimo valor + severity da validacao regulatoria
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} elements
 */
function _collectComplianceMatrix(elements: any) {
    try {
        // Monta matriz: elemento -> parametro -> ultima obs com validacao
        /** @type {Map<any, any>} */
        const matrixData = new Map();
        /** @type {Set<any>} */
        const paramSet = new Set();
        for (const el of elements) {
            const obs = el?.data?.observations || [];
            if (obs.length === 0) continue;
            /** @type {Map<any, any>} */
            const elemMap = new Map();
            for (const o of obs) {
                if (o.value == null || o.parameterId == null) continue;
                paramSet.add(o.parameterId);
                // Mantem apenas a observacao mais recente por parametro
                const existing = elemMap.get(o.parameterId);
                if (!existing || (o.timestamp && (!existing.timestamp || o.timestamp > existing.timestamp))) {
                    const matrix = resolveRegulatoryContext(o.variables, el.family);
                    const results = validateObservationFull(
                        { value: o.value, unitId: o.unitId },
                        o.parameterId,
                        matrix,
                    );
                    elemMap.set(o.parameterId, {
                        value: o.value,
                        unit: o.unitId || '',
                        severity: results.length > 0 ? results[0].severity : null,
                        uncertainty: o.uncertainty ?? null,
                        uncertaintyType: o.uncertaintyType ?? null,
                    });
                }
            }
            if (elemMap.size > 0) {
                matrixData.set(el.id, {
                    name: el.name || el.id,
                    family: el.family,
                    cells: elemMap,
                });
            }
        }
        if (matrixData.size === 0) return null;
        // Filtra apenas parametros regulados (com thresholds)
        const regulatedParams = Array.from(paramSet)
            .filter((/** @type {any} */ pid) => {
                const th = getThresholds(pid);
                return th && th.length > 0;
            })
            .sort();
        if (regulatedParams.length === 0) return null;
        const headers = ['Element', ...regulatedParams];
        const rows = Array.from(matrixData.values()).map((/** @type {any} */ data) => ({
            element: data.name,
            family: data.family,
            cells: regulatedParams.map((/** @type {any} */ pid) => {
                const cell = data.cells.get(pid);
                return cell
                    ? {
                          param: pid,
                          value: cell.value,
                          severity: cell.severity,
                          unit: cell.unit,
                          uncertainty: cell.uncertainty,
                          uncertaintyType: cell.uncertaintyType,
                      }
                    : { param: pid, value: null, severity: null, unit: '', uncertainty: null, uncertaintyType: null };
            }),
        }));
        return { headers, paramIds: regulatedParams, rows };
    } catch (e: any) {
        console.warn('[MetricsCollector] Compliance matrix collection failed:', e);
        return null;
    }
}
// ----------------------------------------------------------------
// SINGLE METRIC COLLECTOR
// Para metric anchors inline - computa apenas a secao solicitada
// ----------------------------------------------------------------
/**
 * Collect a single metric section by type.
 * Coleta apenas uma secao especifica (evita computar tudo).
 *
 * @param {string} metricType - e.g. 'eis', 'costSummary', 'calculator'
 * @param {any} [filterPresetId]
 * @returns {Object} Objeto com apenas a secao solicitada
 */
export function collectSingleMetric(metricType: any, filterPresetId: any) {
    let elements = getAllElements() || [];
    const campaigns = getAllCampaigns() || [];
    // Aplica filter preset se fornecido
    if (filterPresetId) {
        const preset = getPresetById(filterPresetId);
        if (preset) {
            elements = applyPresetToElements(filterPresetId, elements);
        }
    }
    switch (metricType) {
        case 'projectSummary':
            return { projectSummary: _collectProjectSummary(elements, campaigns) };
        case 'eis':
            return { eis: _collectEIS(elements, campaigns) };
        case 'costSummary':
            return { costSummary: _collectCostSummary() };
        case 'compliance':
            return { compliance: _collectCompliance(elements) };
        case 'eva':
            return { eva: _collectEVA() };
        case 'elementInventory':
            return { elementInventory: _collectElementInventory(elements, campaigns) };
        case 'campaignSummary':
            return { campaignSummary: _collectCampaignSummary(campaigns, elements) };
        case 'calculator':
            return { calculator: _collectCalculator(elements) };
        case 'complianceMatrix':
            return { complianceMatrix: _collectComplianceMatrix(elements) };
        default:
            return {};
    }
}
