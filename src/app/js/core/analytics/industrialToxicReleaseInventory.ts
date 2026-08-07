// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * industrialToxicReleaseInventory.js - Inventário de Emissões Tóxicas Industriais (TRI)
 *
 * Implementa métricas de inventário de emissões tóxicas seguindo a metodologia
 * US EPA TRI (Toxic Release Inventory) e OECD Pollutant Release and Transfer Register (PRTR),
 * com suporte a fatores de toxicidade RSEI (Risk-Screening Environmental Indicators).
 *
 * Aplicações: monitoramento de emissões de processo, conformidade PRTR/TRI,
 * indicadores EIS de eixo Cs (contaminação sistêmica), relatórios ESG.
 *
 * Referências / References:
 *   - US EPA (2023). TRI Program - Toxic Release Inventory. EPA-260-B-23-001.
 *     https://www.epa.gov/toxics-release-inventory-tri-program
 *   - OECD (2022). Guidance on Reporting to the PRTR. ENV/JM/MONO(2022)1.
 *   - Rosenbaum, R.K. et al. (2008). USEtox - The UNEP-SETAC toxicity model.
 *     Int J Life Cycle Assess 13: 532–546. DOI:10.1007/s11367-008-0038-4
 *   - CONAMA 430/2011. Condições e padrões de lançamento de efluentes.
 *   - US EPA RSEI (2020). Risk-Screening Environmental Indicators Technical Appendices.
 */

'use strict';

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

/**
 * Fatores de toxicidade humana relativa (USEtox-like, valores normativos adimensionais).
 * Referência: 1.0 = benzeno (referência normativa TRI).
 * Fonte: Rosenbaum et al. (2008) DOI:10.1007/s11367-008-0038-4, Tabela 3 (simplificado).
 *
 * @private
 */
const TOXICITY_FACTORS: Record<string, number> = {
    benzene: 1.0,
    toluene: 0.1,
    xylene: 0.05,
    ethylbenzene: 0.08,
    naphthalene: 0.3,
    phenol: 0.2,
    formaldehyde: 0.8,
    methanol: 0.02,
    acetone: 0.01,
    chloroform: 1.5,
    trichloroethylene: 2.0,
    tetrachloroethylene: 1.8,
    vinyl_chloride: 3.0,
    lead: 5.0,
    cadmium: 8.0,
    mercury: 10.0,
    arsenic: 6.0,
    chromium_vi: 7.0,
    nickel: 1.2,
    copper: 0.5,
};

/**
 * Calcula a emissão total anual de um poluente somando todas as vias de liberação.
 *
 * Vias padrão TRI: ar_fugitivo, ar_stack, agua_superficial, terra, injecao_subterranea,
 * transferencia_offsite_tratamento, transferencia_offsite_disposicao.
 *
 * @param releases - Objeto {via: quantidade_kg}. Valores devem ser >= 0.
 * @returns totalRelease_kg + byMedium
 * @throws {RangeError} Se qualquer valor de emissão for negativo.
 * @throws {TypeError} Se releases não for objeto.
 *
 * Ref: US EPA TRI (2023) Section 5 - Reporting instructions.
 */
export function calcTotalAnnualRelease(releases: Record<string, number>): {
    totalRelease_kg: number;
    byMedium: { air: number; water: number; land: number; transfer: number };
} {
    if (typeof releases !== 'object' || releases === null || Array.isArray(releases)) {
        throw new TypeError('releases deve ser um objeto {via: quantidade_kg}');
    }

    const AIR_KEYS = ['air_fugitive', 'air_stack', 'ar_fugitivo', 'ar_stack'];
    const WATER_KEYS = ['surface_water', 'agua_superficial'];
    const LAND_KEYS = ['land', 'terra', 'underground_injection', 'injecao_subterranea'];
    const TRANSFER_KEYS = [
        'offsite_treatment',
        'offsite_disposal',
        'transferencia_offsite_tratamento',
        'transferencia_offsite_disposicao',
    ];

    let air = 0,
        water = 0,
        land = 0,
        transfer = 0;

    for (const [key, val] of Object.entries(releases)) {
        if (!Number.isFinite(val) || val < 0) {
            throw new RangeError(`Valor de emissão para '${key}' deve ser >= 0; recebido: ${val}`);
        }
        if (AIR_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) air += val;
        else if (WATER_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) water += val;
        else if (LAND_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) land += val;
        else if (TRANSFER_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) transfer += val;
        else air += val; // padrão: aéreo para vias desconhecidas
    }

    return {
        totalRelease_kg: air + water + land + transfer,
        byMedium: { air, water, land, transfer },
    };
}

/**
 * Calcula o índice de risco relativo ponderado por toxicidade (RSEI-like score).
 *
 * Score = Σ (emissão_i × TF_i) / emissão_total
 * Onde TF_i é o fator de toxicidade relativo ao benzeno.
 *
 * @param chemicalReleases Lista de {chemical: nome_no_registro, release_kg: emissão anual}.
 * @returns riskScore + breakdown
 * @throws {RangeError} Se release_kg < 0.
 * @throws {TypeError} Se chemicalReleases não for array.
 *
 * Ref: US EPA RSEI (2020) Technical Appendices, Chap. 3. DOI:10.23719/1521521
 */
export function calcToxicityWeightedRisk(
    chemicalReleases: Array<{ chemical: string; release_kg: number }>,
): { riskScore: number; breakdown: Array<{ chemical: string; contribution_pct: number }> } {
    if (!Array.isArray(chemicalReleases)) {
        throw new TypeError('chemicalReleases deve ser um Array');
    }

    let totalScore = 0;
    const scores: Array<{ chemical: string; score: number; tf: number }> = [];

    for (const item of chemicalReleases) {
        if (!Number.isFinite(item.release_kg) || item.release_kg < 0) {
            throw new RangeError(`release_kg para '${item.chemical}' deve ser >= 0; recebido: ${item.release_kg}`);
        }
        const tf = (TOXICITY_FACTORS as Record<string, number>)[item.chemical.toLowerCase()] ?? 1.0; // padrão = benzeno se desconhecido
        const score = item.release_kg * tf;
        scores.push({ chemical: item.chemical, score, tf });
        totalScore += score;
    }

    const breakdown = scores.map((s) => ({
        chemical: s.chemical,
        contribution_pct: totalScore > 0 ? (s.score / totalScore) * 100 : 0,
    }));

    return { riskScore: totalScore, breakdown };
}

/**
 * Classifica a instalação pelo nível de emissão total conforme limites PRTR/TRI.
 *
 * Limites (kg/yr):
 *   minimal     < 100
 *   low         < 1 000
 *   moderate    < 10 000
 *   significant < 50 000
 *   major       ≥ 50 000
 *
 * @param totalRelease_kg - Emissão total anual (kg/yr). Deve ser >= 0.
 * @returns Classificação.
 * @throws {RangeError} Se totalRelease_kg < 0 ou não finito.
 *
 * Ref: OECD (2022) ENV/JM/MONO(2022)1, Annex I - Reporting thresholds.
 */
export function classifyFacilityEmissionLevel(
    totalRelease_kg: number,
): 'minimal' | 'low' | 'moderate' | 'significant' | 'major' {
    if (!Number.isFinite(totalRelease_kg) || totalRelease_kg < 0) {
        throw new RangeError(`totalRelease_kg deve ser >= 0; recebido: ${totalRelease_kg}`);
    }
    if (totalRelease_kg < 100) return 'minimal';
    if (totalRelease_kg < 1000) return 'low';
    if (totalRelease_kg < 10000) return 'moderate';
    if (totalRelease_kg < 50000) return 'significant';
    return 'major';
}

/**
 * Calcula a eficiência de redução de emissões entre dois períodos de reporte.
 *
 * @param baselineRelease_kg - Emissão no período de referência (kg/yr). Deve ser > 0.
 * @param currentRelease_kg  - Emissão no período atual (kg/yr). Deve ser >= 0.
 * @returns reduction_pct + deltaRelease_kg + improved
 * @throws {RangeError} Para inputs inválidos.
 *
 * Ref: US EPA TRI (2023) Section 8 - Year-to-year comparisons.
 */
export function calcEmissionReductionEfficiency(
    baselineRelease_kg: number,
    currentRelease_kg: number,
): { reduction_pct: number; deltaRelease_kg: number; improved: boolean } {
    if (!Number.isFinite(baselineRelease_kg) || baselineRelease_kg <= 0) {
        throw new RangeError(`baselineRelease_kg deve ser > 0; recebido: ${baselineRelease_kg}`);
    }
    if (!Number.isFinite(currentRelease_kg) || currentRelease_kg < 0) {
        throw new RangeError(`currentRelease_kg deve ser >= 0; recebido: ${currentRelease_kg}`);
    }
    const delta = currentRelease_kg - baselineRelease_kg;
    const reduction_pct = (-delta / baselineRelease_kg) * 100;
    return {
        reduction_pct,
        deltaRelease_kg: delta,
        improved: delta < 0,
    };
}

/**
 * Exporta a lista de substâncias químicas com fatores de toxicidade registrados.
 */
export function getRegisteredChemicals(): Array<{ chemical: string; toxicityFactor: number }> {
    return Object.entries(TOXICITY_FACTORS).map(([chemical, toxicityFactor]) => ({ chemical, toxicityFactor }));
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialToxicReleaseInventoryMeta: AnalyticsModuleMeta = {
    name: 'industrialToxicReleaseInventory',
    description: 'industrialToxicReleaseInventory',
    category: 'analytics',
    familyTags: ['industrial', 'chemical'],
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
