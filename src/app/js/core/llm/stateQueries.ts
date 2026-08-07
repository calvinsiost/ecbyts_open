// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   STATE QUERIES — Funcoes read-only de introspeccao do modelo
   Chamadas pelo agent loop SEM confirmacao do usuario.

   Cada funcao retorna dados estruturados que o LLM pode usar
   para raciocinar antes de sugerir acoes.
   ================================================================ */
import { getAllElements } from '../elements/manager.js';
import { getAllCampaigns } from '../campaigns/manager.js';
import { CONFIG } from '../../config.js';
// ================================================================
// QUERY_STATE - Resumo geral do modelo
// ================================================================
/**
 * Retorna resumo do estado do modelo.
 *
 * @param {string} queryType - 'summary' | 'elements' | 'campaigns' | 'compliance' | 'parameters'
 * @param {Object} filter - { familyId?, parameterId?, campaignId? }
 * @returns {Object}
 */
export function queryState(queryType: any, filter: any = {}) {
    switch (queryType) {
        case 'summary':
            return getModelSummary();
        case 'elements':
            return getElementsSummary(filter);
        case 'campaigns':
            return getCampaignsSummary();
        case 'compliance':
            return getComplianceSummary(filter);
        case 'parameters':
            return getParametersSummary();
        case 'exceedances':
            return getExceedancesSummary(filter);
        default:
            return getModelSummary();
    }
}
/**
 * Resumo compacto do modelo inteiro.
 */
function getModelSummary() {
    const elements = (getAllElements()) as any[];
    const campaigns = (getAllCampaigns()) as any[];
    // Contagem por familia
    /** @type {Record<string, number>} */
    const familyCounts: any = {};
    let totalObs = 0;
    for (const el of elements) {
        familyCounts[el.family] = (familyCounts[el.family] || 0) + 1;
        totalObs += el.data?.observations?.length || 0;
    }
    // Parametros unicos nas observacoes
    /** @type {Set<any>} */
    const paramSet = new Set();
    for (const el of elements) {
        for (const obs of el.data?.observations || []) {
            if (obs.parameterId)
                paramSet.add(obs.parameterId);
        }
    }
    return {
        elementCount: elements.length,
        campaignCount: campaigns.length,
        totalObservations: totalObs,
        familyCounts,
        uniqueParameters: [...paramSet],
        parameterCount: paramSet.size,
    };
}
/**
 * Lista de elementos com resumo de observacoes.
 */
function getElementsSummary(filter: any) {
    let elements = /** @type {any[]} */ (getAllElements());
    if (filter.familyId) {
        elements = elements.filter((/** @type {any} */ e) => e.family === filter.familyId);
    }
    return elements.map((/** @type {any} */ el) => {
        const obs = el.data?.observations || [];
        const paramSet = new Set(obs.map((o: any) => o.parameterId).filter(Boolean));
        return {
            id: el.id,
            name: el.name,
            family: el.family,
            observationCount: obs.length,
            parameters: [...paramSet],
            position: el.data?.position || null,
        };
    });
}
/**
 * Lista de campanhas com contagem de observacoes.
 */
function getCampaignsSummary() {
    const campaigns = (getAllCampaigns()) as any[];
    const elements = (getAllElements()) as any[];
    return campaigns.map((/** @type {any} */ c) => {
        // Conta observacoes vinculadas a esta campanha
        let obsCount = 0;
        for (const el of elements) {
            for (const obs of el.data?.observations || []) {
                if (obs.campaignId === c.id)
                    obsCount++;
            }
        }
        return {
            id: c.id,
            name: c.name,
            startDate: c.startDate,
            endDate: c.endDate,
            observationCount: obsCount,
            plannedReadings: c.plannedReadings?.length || 0,
        };
    });
}
/**
 * Resumo de parametros em uso no modelo.
 */
function getParametersSummary() {
    const elements = (getAllElements()) as any[];
    /** @type {Record<string, any>} */
    const paramStats: any = {};
    for (const el of elements) {
        for (const obs of el.data?.observations || []) {
            const pid = obs.parameterId;
            if (!pid)
                continue;
            if (!paramStats[pid]) {
                const param = CONFIG.PARAMETERS.find((p: any) => p.id === pid);
                paramStats[pid] = {
                    id: pid,
                    name: param?.name || pid,
                    count: 0,
                    min: Infinity,
                    max: -Infinity,
                };
            }
            paramStats[pid].count++;
            const val = Number(obs.value);
            if (!isNaN(val)) {
                if (val < paramStats[pid].min)
                    paramStats[pid].min = val;
                if (val > paramStats[pid].max)
                    paramStats[pid].max = val;
            }
        }
    }
    return Object.values(paramStats).map((s: any) => ({
        ...s,
        min: s.min === Infinity ? null : s.min,
        max: s.max === -Infinity ? null : s.max,
    }));
}
// ================================================================
// QUERY_ELEMENT - Detalhes de um elemento
// ================================================================
/**
 * Retorna informacoes detalhadas de um elemento.
 *
 * @param {string} elementId
 * @returns {Object|null}
 */
export function queryElement(elementId: any) {
    const elements = (getAllElements()) as any[];
    const el = elements.find((/** @type {any} */ e) => e.id === elementId);
    if (!el)
        return null;
    const obs = el.data?.observations || [];
    // Agrupa observacoes por parametro
    /** @type {Record<string, any[]>} */
    const byParam: any = {};
    for (const o of obs) {
        const pid = o.parameterId || 'unknown';
        if (!byParam[pid])
            byParam[pid] = [];
        byParam[pid].push({
            value: o.value,
            unitId: o.unitId,
            date: o.date,
            campaignId: o.campaignId,
        });
    }
    return {
        id: el.id,
        name: el.name,
        family: el.family,
        position: el.data?.position || null,
        observationCount: obs.length,
        observationsByParameter: byParam,
    };
}
// ================================================================
// QUERY_COMPLIANCE - Conformidade regulatoria
// ================================================================
/**
 * Verifica conformidade de um parametro contra limites regulatorios.
 * Retorna excedencias por elemento.
 *
 * @param {string} parameterId
 * @param {string} regulation - 'CONAMA_420' | 'CETESB' | 'EPA_MCL'
 * @returns {Promise<any>}
 */
export async function queryCompliance(parameterId: any, regulation: any = "CONAMA_420") {
    // Import dinamico para nao criar dependencia estatica
    const { validateByCAS, getThresholds } = await import('../validation/rules.js' as string);
    const elements = (getAllElements()) as any[];
    const thresholds = (getThresholds(parameterId, 'groundwater')) as any[];
    const vi = thresholds.find((/** @type {any} */ t) => t.type === 'vi' || t.type === 'cma');
    const limit = vi ? { max: vi.value, unit: vi.unit, source: vi.source } : null;
    const results = [];
    for (const el of elements) {
        for (const obs of el.data?.observations || []) {
            if (obs.parameterId !== parameterId)
                continue;
            if (obs.value == null)
                continue;
            const validation = validateByCAS(obs, parameterId, 'groundwater');
            results.push({
                elementId: el.id,
                elementName: el.name,
                value: obs.value,
                unitId: obs.unitId,
                date: obs.date,
                status: validation?.severity === 'intervention' ? 'exceeded' : 'compliant',
                exceedance: validation?.exceedance || null,
            });
        }
    }
    const exceeded = results.filter((/** @type {any} */ r) => r.status === 'exceeded');
    return {
        parameterId,
        regulation,
        limit: limit ? { max: limit.max, unit: limit.unit, source: limit.source } : null,
        totalMeasurements: results.length,
        exceedanceCount: exceeded.length,
        complianceRate: results.length > 0 ? (((results.length - exceeded.length) / results.length) * 100).toFixed(1) + '%' : 'N/A',
        details: results,
    };
}
// ================================================================
// COMPLIANCE SUMMARY - Resumo geral de conformidade
// ================================================================
function getComplianceSummary(filter: any) {
    const elements = (getAllElements()) as any[];
    /** @type {{total: number, exceeded: number, parameters: Record<string, any>, complianceRate?: string}} */
    const summary: any = { total: 0, exceeded: 0, parameters: {} };
    for (const el of elements) {
        for (const obs of el.data?.observations || []) {
            if (filter.parameterId && obs.parameterId !== filter.parameterId)
                continue;
            if (obs.value == null)
                continue;
            summary.total++;
            // Verificacao simplificada sem import async
            const param = (CONFIG.PARAMETERS.find((p: any) => p.id === obs.parameterId)) as any;
            if (param?.regulatoryLimit && Number(obs.value) > param.regulatoryLimit) {
                summary.exceeded++;
            }
        }
    }
    summary.complianceRate =
        summary.total > 0 ? (((summary.total - summary.exceeded) / summary.total) * 100).toFixed(1) + '%' : 'N/A';
    return summary;
}
function getExceedancesSummary(filter: any) {
    const elements = (getAllElements()) as any[];
    /** @type {any[]} */
    const exceedances = [];
    for (const el of elements) {
        for (const obs of el.data?.observations || []) {
            if (filter.parameterId && obs.parameterId !== filter.parameterId)
                continue;
            const param = (CONFIG.PARAMETERS.find((p: any) => p.id === obs.parameterId)) as any;
            if (param?.regulatoryLimit && Number(obs.value) > param.regulatoryLimit) {
                exceedances.push({
                    elementId: el.id,
                    elementName: el.name,
                    parameterId: obs.parameterId,
                    parameterName: param.name,
                    value: obs.value,
                    limit: param.regulatoryLimit,
                    date: obs.date,
                });
            }
        }
    }
    return exceedances;
}
