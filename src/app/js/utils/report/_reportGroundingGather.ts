// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Coleta de dados de grounding do modelo (observações + excedências determinísticas).
// Fonte única usada por: handler report.ts (_snapshotModelContext) e o seletor de
// figuras (gráficos Chart.js). Evita duplicar a plumbing de CONFIG.PARAMETERS +
// motor de excedências. Reusa o pure core/report/_aiReportDataGroundingPure.
import type { ObsSummary, Exceedance, NormalizedObs } from '../../core/report/_aiReportDataGroundingPure.js';

export type GroundingData = {
    summary: ObsSummary;
    exceedances: Exceedance[];
    /** Valores numéricos do parâmetro mais medido (para histograma). */
    topParamValues: number[];
    topParamName: string;
};

/**
 * Coleta observações reais + excedências regulatórias de uma lista de elementos.
 * Defensivo: se CONFIG ou o motor de compliance falharem, retorna o que conseguiu
 * (observações sempre; excedências podem ficar vazias).
 */
export async function gatherGroundingData(elements: any[]): Promise<GroundingData> {
    const els = Array.isArray(elements) ? elements : [];
    const grounding: any = await import('../../core/report/_aiReportDataGroundingPure.js' as string);

    let paramById = new Map<string, any>();
    let paramByCas = new Map<string, any>();
    try {
        const cfg: any = await import('../../config.js' as string);
        const CONFIG = cfg.CONFIG || cfg.default || cfg;
        const params: any[] = CONFIG?.PARAMETERS || [];
        paramById = new Map(params.map((p) => [p.id, p]));
        paramByCas = new Map(params.filter((p) => p.casNumber).map((p) => [p.casNumber, p]));
    } catch (e: any) {
        console.debug('[reportGroundingGather:config]', e?.message || e);
    }
    const lookup = (id: string) => {
        const p: any = paramById.get(id);
        return p ? { name: p.name, unit: p.defaultUnitId } : null;
    };

    const normObs: NormalizedObs[] = grounding.collectObservations(els, lookup);
    const summary: ObsSummary = grounding.summarizeObservations(normObs);

    // Matriz dominante (motor de compliance é por-matriz).
    const matrixCount: Record<string, number> = {};
    for (const o of normObs) matrixCount[o.matrix] = (matrixCount[o.matrix] || 0) + 1;
    const matrix = Object.entries(matrixCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'groundwater';

    // Observações na forma ingerida para o motor de excedências.
    const rawObs: any[] = [];
    for (const el of els) {
        for (const o of (el?.observations || [])) {
            const v = o?.value ?? o?.reading;
            if (o?.parameterId != null && v != null && v !== '') {
                rawObs.push({ parameterId: o.parameterId, value: v, unitId: o.unitId || o.unit, matrix: o.matrix || matrix });
            }
        }
    }
    const exceedances: Exceedance[] = [];
    try {
        const compMod: any = await import('../../core/validation/globalCompliance.js' as string);
        const comp = typeof compMod.computeGlobalCompliance === 'function' ? compMod.computeGlobalCompliance(rawObs, matrix) : null;
        if (comp?.substanceResults) {
            for (const [cas, jurMap] of Object.entries(comp.substanceResults)) {
                const ms: any = comp.mostStringent?.[cas];
                if (!ms) continue;
                const res: any = (jurMap as any)[ms.jurisdiction];
                if (!res) continue;
                exceedances.push({
                    substance: (paramByCas.get(cas) as any)?.name || cas,
                    value: res.value,
                    threshold: res.threshold,
                    unit: res.unit,
                    jurisdiction: res.source || ms.jurisdiction,
                    status: res.pass ? 'ok' : 'exceeds',
                });
            }
        }
    } catch (e: any) {
        console.debug('[reportGroundingGather:compliance]', e?.message || e);
    }

    const topParamName = summary.byParameter[0]?.parameter || '';
    const topParamValues = topParamName ? normObs.filter((o) => o.parameter === topParamName).map((o) => o.value) : [];

    return { summary, exceedances, topParamValues, topParamName };
}
