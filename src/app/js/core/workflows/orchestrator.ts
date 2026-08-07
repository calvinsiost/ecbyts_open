// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   WORKFLOW ORCHESTRATOR — Executores async para steps de execucao
   Orquestra modulos existentes via import() dinamico.

   Cada funcao aqui chama APIs publicas de modulos core/ existentes.
   Zero duplicacao de logica — so orquestracao.
   ================================================================ */
// ================================================================
// VALIDATION - Executa conformidade regulatoria
// ================================================================
/**
 * Valida observacoes contra limites regulatorios.
 * Usa core/validation/rules.js internamente.
 *
 * @param {Object} opts
 * @param {string} opts.parameterId - Parametro a validar (ex: 'benzene')
 * @param {string} opts.campaignId - Campanha a filtrar (null = todas)
 * @param {string[]} opts.regulations - Regulacoes a checar (ex: ['CONAMA_420'])
 * @param {Function} opts.onProgress - Callback de progresso (0-1)
 * @returns {Promise<Object>} - { exceedances[], compliant[], stats }
 */
export async function runValidation(opts: any) {
    const { validateByCAS, getThresholds, calculateStats } = await import('../validation/rules.js' as string);
    const { getAllElements } = await import('../elements/manager.js' as string);
    const elements = getAllElements();
    const wells = elements.filter((e: any) => e.family === 'well' && Array.isArray((e as any).data?.observations));
    const exceedances = [];
    const compliant = [];
    let processed = 0;
    const resolveCoord = (obsCoord: any, wellCoord: any) => {
        const obsVal = Number(obsCoord);
        if (Number.isFinite(obsVal))
            return obsVal;
        const wellVal = Number(wellCoord);
        if (Number.isFinite(wellVal))
            return wellVal;
        return null;
    };
    for (const well of wells) {
        const observations = well.data.observations.filter((o: any) => {
            if (opts.parameterId && o.parameterId !== opts.parameterId)
                return false;
            if (opts.campaignId && o.campaignId !== opts.campaignId)
                return false;
            return o.value != null;
        });
        for (const obs of observations) {
            const result = validateByCAS(obs, obs.parameterId, 'groundwater');
            if (result && (result.severity === 'intervention' || result.severity === 'prevention')) {
                exceedances.push({
                    elementId: well.id,
                    elementName: well.name,
                    parameterId: obs.parameterId,
                    value: obs.value,
                    unitId: obs.unitId,
                    limit: result.limit,
                    exceedance: result.exceedance,
                    severity: result.severity,
                    complianceStatus: 'exceedance',
                    date: obs.date,
                    x: resolveCoord(obs.x, well.data?.position?.x),
                    y: resolveCoord(obs.y, well.data?.position?.y),
                    z: resolveCoord(obs.z, well.data?.position?.z),
                });
            }
            else {
                compliant.push({
                    elementId: well.id,
                    elementName: well.name,
                    parameterId: obs.parameterId,
                    value: obs.value,
                    unitId: obs.unitId,
                    complianceStatus: 'compliant',
                    date: obs.date,
                    x: resolveCoord(obs.x, well.data?.position?.x),
                    y: resolveCoord(obs.y, well.data?.position?.y),
                    z: resolveCoord(obs.z, well.data?.position?.z),
                });
            }
        }
        processed++;
        if (opts.onProgress) {
            opts.onProgress(processed / wells.length);
        }
    }
    // Estatisticas dos valores excedentes
    const values = exceedances.map((e: any) => e.value);
    const stats = values.length > 0 ? calculateStats(values) : null;
    const thresholds = getThresholds(opts.parameterId, 'groundwater');
    const vi = thresholds.find((t: any) => t.type === 'vi' || t.type === 'cma');
    const limit = vi ? { max: vi.value, unit: vi.unit, source: vi.source } : null;
    return {
        exceedances,
        compliant,
        stats,
        limit,
        totalWells: wells.length,
        totalObservations: exceedances.length + compliant.length,
    };
}
// ================================================================
// INTERPOLATION - Gera superficie de contaminacao
// ================================================================
/**
 * Gera camada de interpolacao para um parametro.
 * Usa core/interpolation/manager.js internamente.
 *
 * @param {Object} opts
 * @param {string} opts.parameterId
 * @param {string} opts.method - 'kriging' | 'idw' | 'rbf'
 * @param {number} opts.gridSize - Resolucao da grade (32, 64, 128)
 * @param {Object[]} opts.dataPoints - [{x, y, z, value}] pontos de dados
 * @param {Function} opts.onProgress
 * @returns {Promise<Object>} - { layerId, grid, bounds }
 */
export async function runInterpolation(opts: any) {
    const { createContaminationLayer } = await import('../interpolation/manager.js' as string);
    const result = await createContaminationLayer(opts.parameterId, {
        method: opts.method || 'kriging',
        gridSize: opts.gridSize || 64,
        dataPoints: opts.dataPoints,
        onProgress: opts.onProgress,
    });
    return /** @type {Object} */ (result);
}
// ================================================================
// DELINEATION - Delimita pluma de contaminacao
// ================================================================
/**
 * Delimita a pluma (zona de excedencia) a partir de uma grade interpolada.
 * Cria um elemento plume com a geometria da isosuperficie.
 *
 * @param {object} opts
 * @param {Record<string, any>} opts.grid - Grade de interpolacao
 * @param {number} opts.threshold - Limite regulatorio
 * @param {string} opts.parameterId
 * @param {Function} opts.onProgress
 * @returns {Promise<Object>} - { plumeId, area, volume, maxConcentration }
 */
export async function runDelineation(opts: any) {
    const { addNewElement, updateElement } = await import('../elements/manager.js' as string);
    // Identifica celulas acima do threshold
    // Fix 2026-04-11: `grid.values` pode ser Array, TypedArray (Float32Array etc)
    // ou objeto não-iterável dependendo da fonte (IDW retorna Float32Array,
    // Kriging retorna Array, mocks podem retornar plain object). Normaliza
    // para Array via Symbol.iterator check - se não for iterável, retorna empty.
    const grid = opts.grid;
    if (!grid || grid.values == null) {
        return { plumeId: null, area: 0, volume: 0, maxConcentration: 0 };
    }
    // Validação de iterabilidade - evita "grid.values is not iterable"
    const isIterable = typeof grid.values[Symbol.iterator] === 'function';
    if (!isIterable) {
        console.warn('[ecbyts:workflows] runDelineation: grid.values is not iterable', {
            type: typeof grid.values,
            constructor: grid.values?.constructor?.name,
        });
        return { plumeId: null, area: 0, volume: 0, maxConcentration: 0 };
    }
    let maxConc = 0;
    let exceedCount = 0;
    const cellSize = grid.cellSize || 1;
    let totalCells = 0;
    for (const val of grid.values) {
        totalCells++;
        if (val > opts.threshold) {
            exceedCount++;
            if (val > maxConc)
                maxConc = val;
        }
    }
    const area = exceedCount * cellSize * cellSize;
    // Cria elemento plume se ha excedencias
    let plumeId = null;
    if (exceedCount > 0) {
        const plume = addNewElement('plume');
        if (plume) {
            const { CONFIG } = await import('../../config.js' as string);
            const param = CONFIG.PARAMETERS.find((p: any) => p.id === opts.parameterId);
            const paramName = param?.name || opts.parameterId;
            updateElement(plume.id, {
                name: `Pluma ${paramName} (>${opts.threshold})`,
                data: {
                    ...plume.data,
                    parameterId: opts.parameterId,
                    threshold: opts.threshold,
                    area,
                    maxConcentration: maxConc,
                    delineatedAt: new Date().toISOString(),
                },
            });
            plumeId = plume.id;
        }
    }
    if (opts.onProgress)
        opts.onProgress(1);
    return {
        plumeId,
        area,
        volume: area * (grid.depth || 1),
        maxConcentration: maxConc,
        exceedCells: exceedCount,
        // Usa `totalCells` contado no loop - grid.values.length não funciona
        // em objetos iteráveis que não sejam Array/TypedArray (ex: Set, Map).
        totalCells,
        threshold: opts.threshold,
    };
}
// ================================================================
// SAO / EMERGENCY - Calcula matrizes de risco ESH
// ================================================================
/**
 * Executa avaliacao de risco SAO para um cenario de emergencia.
 *
 * @param {Object} opts
 * @param {string} opts.scenarioId
 * @param {Function} opts.onProgress
 * @returns {Promise<Object>}
 */
export async function runSAOAssessment(opts: any) {
    const sao = await import('../sao/index.js' as string);
    const result = sao.evaluateScenario ? sao.evaluateScenario(opts.scenarioId) : { score: 0, level: 'unknown' };
    if (opts.onProgress)
        opts.onProgress(1);
    return result;
}
// ================================================================
// EIS - Calcula Environmental Integrity Score
// ================================================================
/**
 * Calcula o EIS do modelo atual.
 *
 * @param {Object} opts
 * @param {Function} opts.onProgress
 * @returns {Promise<Object>}
 */
export async function runEIS(opts: any) {
    const { computeSimplifiedEIS } = await import('../purpose/snapshotEngine.js' as string);
    const { getAllElements } = await import('../elements/manager.js' as string);
    const { getAllCampaigns } = await import('../campaigns/manager.js' as string);
    const result = computeSimplifiedEIS(getAllElements(), getAllCampaigns());
    result.runMeta = {
        canonical: true,
        formulaModel: result.formulaModel || 'calculator-canonical-v1',
        aggregateFormulaRef: result.aggregateFormulaRef || 'eis.aggregate.geometric_weighted.v1',
    };
    if (opts.onProgress)
        opts.onProgress(1);
    return result;
}
// ================================================================
// VOXEL - Gera volume geologico 3D
// ================================================================
/**
 * Gera volume geologico 3D (vadose + saturada).
 *
 * @param {Object} opts
 * @param {number} opts.resolution
 * @param {Function} opts.onProgress
 * @returns {Promise<Object>}
 */
export async function runVoxelGeneration(opts: any) {
    const { createGeologyVolume } = await import('../voxel/manager.js' as string);
    const result = await createGeologyVolume({
        resolution: opts.resolution || 32,
        onProgress: opts.onProgress,
    });
    return result;
}
