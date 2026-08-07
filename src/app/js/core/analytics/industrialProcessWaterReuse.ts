// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Industrial Process Water Reuse Analytics
 *
 * Simplified pinch analysis and water circularity metrics for industrial reuse.
 *
 * References:
 * - US EPA (2012). Guidelines for Water Reuse. EPA/600/R-12/618.
 * - ABNT NBR 16783:2019 - Usos de agua nao potavel em edificacoes.
 * - WRI Aqueduct Water Risk Framework (2023). https://www.wri.org/aqueduct
 * - Wang, Y.P. & Smith, R. (1994). Wastewater minimisation. Chem. Eng. Sci. 49(7).
 *   DOI: 10.1016/0009-2509(94)87006-3
 *
 * @module industrialProcessWaterReuse
 */

// Local interface (substitui import('../../../../types/app/analytics-library.js'))
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
        citation?: string;
    };
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    library?: { published: boolean; priceECBT?: number; licenseRef?: string };
}

interface ProcessNode {
    freshDemand: number;
    contaminantLimit: number;
    inletConc: number;
    outletConc: number;
}

/**
 * Cascade water reuse: computes fresh water savings when reusing effluent
 * from one process as feed for another (simplified pinch analysis).
 *
 * Calcula a reducao de consumo de agua fresca pelo reaproveitamento em serie
 * de efluentes entre processos industriais.
 *
 * @param processes Ordered array of process nodes. freshDemand in m3/h, concentrations in mg/L.
 * @throws {TypeError} If processes is not a non-empty array
 * @throws {RangeError} If any process has negative demands or invalid concentrations
 */
export function cascadeWaterReuse(processes: ProcessNode[]): {
    freshWaterUsed: number;
    reuseVolume: number;
    savings: number;
    cascade: Array<{ freshUsed: number; reuseVol: number; outletVol: number; outletConc: number }>;
} {
    if (!Array.isArray(processes) || processes.length === 0) {
        throw new TypeError('processes deve ser um array nao vazio');
    }
    for (const [i, p] of processes.entries()) {
        if (typeof p.freshDemand !== 'number' || p.freshDemand < 0) {
            throw new RangeError(`processes[${i}].freshDemand deve ser >= 0`);
        }
        if (typeof p.contaminantLimit !== 'number' || p.contaminantLimit < 0) {
            throw new RangeError(`processes[${i}].contaminantLimit deve ser >= 0`);
        }
        if (typeof p.inletConc !== 'number' || p.inletConc < 0) {
            throw new RangeError(`processes[${i}].inletConc deve ser >= 0`);
        }
        if (typeof p.outletConc !== 'number' || p.outletConc < p.inletConc) {
            throw new RangeError(`processes[${i}].outletConc deve ser >= inletConc`);
        }
    }

    // Pinch simplificado: tenta reaproveitar saida do processo anterior
    // como entrada do proximo, respeitando o limite de contaminante
    const cascade = [];
    let totalFreshUsed = 0;
    let totalReuse = 0;
    let prevEffluent = 0; // volume disponivel do processo anterior (m3/h)
    let prevConc = 0; // concentracao do efluente anterior (mg/L)

    for (const p of processes) {
        // Volume que pode ser reaproveitado sem violar o limite de contaminante
        let reuseVol = 0;
        if (prevEffluent > 0 && prevConc <= p.contaminantLimit) {
            reuseVol = Math.min(prevEffluent, p.freshDemand);
        }
        const freshNeeded = p.freshDemand - reuseVol;
        totalFreshUsed += freshNeeded;
        totalReuse += reuseVol;

        // Concentracao de saida do processo atual
        prevEffluent = p.freshDemand; // assume volume conservado
        prevConc = p.outletConc;

        cascade.push({
            freshUsed: freshNeeded,
            reuseVol,
            outletVol: p.freshDemand,
            outletConc: p.outletConc,
        });
    }

    const totalDemand = processes.reduce((s, p) => s + p.freshDemand, 0);
    const savings = totalDemand > 0 ? totalReuse / totalDemand : 0;

    return { freshWaterUsed: totalFreshUsed, reuseVolume: totalReuse, savings, cascade };
}

/**
 * Substitution factor: fraction of total water demand met by reuse sources.
 *
 * Fator de substituicao de fonte: fracao da demanda total atendida por fontes de reuso.
 *
 * @param freshVolume - Volume de agua fresca consumida (m3)
 * @param reuseVolume - Volume de agua reutilizada (m3)
 * @returns Fator de substituicao [0, 1]
 * @throws {RangeError} Se qualquer volume for negativo
 */
export function substitutionFactor(freshVolume: number, reuseVolume: number): number {
    if (typeof freshVolume !== 'number' || freshVolume < 0) {
        throw new RangeError('freshVolume deve ser >= 0');
    }
    if (typeof reuseVolume !== 'number' || reuseVolume < 0) {
        throw new RangeError('reuseVolume deve ser >= 0');
    }
    const total = freshVolume + reuseVolume;
    if (total === 0) return 0;
    return reuseVolume / total;
}

/**
 * Water circularity index (WCI): proportion of water kept in productive use
 * versus total water entering the system. Based on WRI Aqueduct framework.
 *
 * Indice de circularidade hidrica: proporcao de agua mantida em uso produtivo.
 *
 * @param reuseVolume - Volume reutilizado internamente (m3)
 * @param recycleVolume - Volume reciclado/tratado e reinserido (m3)
 * @param totalWithdrawn - Volume total captado da fonte primaria (m3)
 * @returns WCI [0, 1]
 * @throws {RangeError} Se valores forem negativos ou totalWithdrawn == 0
 */
export function waterCircularityIndex(
    reuseVolume: number,
    recycleVolume: number,
    totalWithdrawn: number,
): number {
    if (typeof reuseVolume !== 'number' || reuseVolume < 0) {
        throw new RangeError('reuseVolume deve ser >= 0');
    }
    if (typeof recycleVolume !== 'number' || recycleVolume < 0) {
        throw new RangeError('recycleVolume deve ser >= 0');
    }
    if (typeof totalWithdrawn !== 'number' || totalWithdrawn <= 0) {
        throw new RangeError('totalWithdrawn deve ser > 0');
    }
    return Math.min(1, (reuseVolume + recycleVolume) / totalWithdrawn);
}

/**
 * Reuse maturity classification (1–5) based on substitution factor.
 *
 * Classificacao de maturidade de reuso (1–5) conforme fator de substituicao.
 * Escala adaptada de EPA 2012 Guidelines for Water Reuse, Table 3-1.
 *
 * | Nivel | Fator       | Descricao                        |
 * |-------|-------------|----------------------------------|
 * | 1     | < 5%        | Incipiente - nenhuma pratica      |
 * | 2     | 5–20%       | Basico - reuso pontual            |
 * | 3     | 20–40%      | Intermediario - reuso sistematico  |
 * | 4     | 40–60%      | Avancado - cascata estruturada     |
 * | 5     | > 60%       | Excelencia - economia circular     |
 *
 * @param sf - Substitution factor [0, 1]
 * @throws {RangeError} Se sf estiver fora de [0, 1]
 */
export function reuseMaturityClassification(
    sf: number,
): { level: number; label: string; description: string } {
    if (typeof sf !== 'number' || sf < 0 || sf > 1) {
        throw new RangeError('sf deve estar em [0, 1]');
    }
    if (sf < 0.05) return { level: 1, label: 'Incipiente', description: 'No reuse practice' };
    if (sf < 0.2) return { level: 2, label: 'Basico', description: 'Punctual reuse' };
    if (sf < 0.4) return { level: 3, label: 'Intermediario', description: 'Systematic reuse' };
    if (sf < 0.6) return { level: 4, label: 'Avancado', description: 'Structured cascade' };
    return { level: 5, label: 'Excelencia', description: 'Circular economy' };
}

/**
 * Estimates annual fresh water savings volume from reuse fraction.
 *
 * Estima volume anual economizado de agua fresca a partir da fracao de reuso.
 *
 * @param annualDemand - Demanda anual total de agua (m3/ano)
 * @param savingsFraction - Fracao de reducao de agua fresca [0, 1]
 * @returns Volume economizado (m3/ano)
 * @throws {RangeError} Se annualDemand <= 0 ou savingsFraction fora de [0,1]
 */
export function annualSavingsVolume(annualDemand: number, savingsFraction: number): number {
    if (typeof annualDemand !== 'number' || annualDemand <= 0) {
        throw new RangeError('annualDemand deve ser > 0');
    }
    if (typeof savingsFraction !== 'number' || savingsFraction < 0 || savingsFraction > 1) {
        throw new RangeError('savingsFraction deve estar em [0, 1]');
    }
    return annualDemand * savingsFraction;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialProcessWaterReuseMeta: AnalyticsModuleMeta = {
    name: 'industrialProcessWaterReuse',
    description: 'industrialProcessWaterReuse',
    category: 'analytics',
    familyTags: ['water', 'industrial'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
