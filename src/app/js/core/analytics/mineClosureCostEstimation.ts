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
 * Mine Closure Cost Estimation
 *
 * Estimativa de custo de fechamento de mina conforme:
 * - MAC (2008). Towards Sustainable Mining - A Guide to Responsible Mine Closure.
 *   Mining Association of Canada.
 * - ANCOLD (2019). Guidelines on Tailings Dams - Planning, Design, Construction,
 *   Operation and Closure. Australian National Committee on Large Dams.
 * - DNPM/ANM (2017). Portaria 237 e Instrução Normativa 01/2017 - Plano de
 *   Fechamento de Mina. Agência Nacional de Mineração, Brasil.
 * - ICMM (2019). Good Practice Guidance for Mining and Biodiversity.
 *
 * Custos expressos em USD (parametrizados; converter com fator de escala regional).
 *
 * Zero dependências DOM/IDB/Three.js/fetch
 * @module mineClosureCostEstimation
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

// ─── Default unit cost references (USD per unit) ────────────────────────────
// Custos unitários de referência (MAC 2008, ANCOLD 2019, DNPM 2017)
// Usuário pode substituir por valores regionais via parâmetro `unitCosts`
const DEFAULT_UNIT_COSTS = {
    revegetation_per_ha: 8000, // USD/ha — plantio + estabelecimento 3 anos
    remediation_per_m3: 45, // USD/m³ solo contaminado
    demolition_per_m2: 35, // USD/m² de área construída demolida
    monitoring_annual: 120000, // USD/ano — rede de monitoramento pós-fechamento
    monitoring_years: 10, // anos de monitoramento obrigatório (ANM IN 01/2017)
    administration_rate: 0.15, // 15 % sobre custos diretos (MAC 2008, Seção 4.3)
    tailings_cover_per_m2: 22, // USD/m² — cobertura de barragem de rejeitos
    water_treatment_annual: 80000, // USD/ano — tratamento de drenagem ácida de mina
};

/**
 * Estima o custo de revegetação / reabilitação de área degradada.
 * Estimates revegetation and land rehabilitation cost.
 *
 * @param areaHa         - Área a ser revegetada (hectares)
 * @param costPerHa      - Custo por hectare (USD/ha), padrão interno se omitido
 */
export function revegetationCost(
    areaHa: number,
    costPerHa = DEFAULT_UNIT_COSTS.revegetation_per_ha,
): { cost: number; areaHa: number; component: string } {
    if (typeof areaHa !== 'number' || areaHa <= 0) {
        throw new RangeError('areaHa must be > 0');
    }
    if (typeof costPerHa !== 'number' || costPerHa <= 0) {
        throw new RangeError('costPerHa must be > 0');
    }
    return { cost: areaHa * costPerHa, areaHa, component: 'revegetation' };
}

/**
 * Estima o custo de remediação de solo/sedimento contaminado.
 * Estimates soil/sediment remediation cost.
 *
 * @param volumeM3       - Volume de solo contaminado (m³)
 * @param costPerM3      - Custo unitário de remediação (USD/m³)
 */
export function remediationCost(
    volumeM3: number,
    costPerM3 = DEFAULT_UNIT_COSTS.remediation_per_m3,
): { cost: number; volumeM3: number; component: string } {
    if (typeof volumeM3 !== 'number' || volumeM3 <= 0) {
        throw new RangeError('volumeM3 must be > 0');
    }
    if (typeof costPerM3 !== 'number' || costPerM3 <= 0) {
        throw new RangeError('costPerM3 must be > 0');
    }
    return { cost: volumeM3 * costPerM3, volumeM3, component: 'remediation' };
}

/**
 * Estima o custo de demolição e remoção de estruturas.
 * Estimates demolition and structure removal cost.
 *
 * @param areaM2         - Área construída a demolir (m²)
 * @param costPerM2      - Custo unitário de demolição (USD/m²)
 */
export function demolitionCost(
    areaM2: number,
    costPerM2 = DEFAULT_UNIT_COSTS.demolition_per_m2,
): { cost: number; areaM2: number; component: string } {
    if (typeof areaM2 !== 'number' || areaM2 <= 0) {
        throw new RangeError('areaM2 must be > 0');
    }
    if (typeof costPerM2 !== 'number' || costPerM2 <= 0) {
        throw new RangeError('costPerM2 must be > 0');
    }
    return { cost: areaM2 * costPerM2, areaM2, component: 'demolition' };
}

/**
 * Estima o custo de monitoramento pós-fechamento (valor presente).
 * Estimates post-closure monitoring cost in present value.
 *
 * Valor presente usando série uniforme: PV = A × [(1+r)^n − 1] / [r(1+r)^n]
 * Se r = 0, PV = A × n (caso degenerado)
 *
 * @param annualCost     - Custo anual de monitoramento (USD/ano)
 * @param years          - Número de anos (padrão: 10 conforme ANM IN 01/2017)
 * @param discountRate   - Taxa de desconto anual (0.0–0.15), padrão 0.05
 */
export function monitoringCost(
    annualCost: number,
    years = DEFAULT_UNIT_COSTS.monitoring_years,
    discountRate = 0.05,
): { cost: number; annualCost: number; years: number; component: string } {
    if (typeof annualCost !== 'number' || annualCost <= 0) {
        throw new RangeError('annualCost must be > 0');
    }
    if (typeof years !== 'number' || years <= 0 || !Number.isInteger(years)) {
        throw new RangeError('years must be a positive integer');
    }
    if (typeof discountRate !== 'number' || discountRate < 0 || discountRate > 0.15) {
        throw new RangeError('discountRate must be in [0, 0.15]');
    }
    let pv;
    if (discountRate === 0) {
        pv = annualCost * years;
    } else {
        const r = discountRate;
        pv = annualCost * ((Math.pow(1 + r, years) - 1) / (r * Math.pow(1 + r, years)));
    }
    return { cost: pv, annualCost, years, component: 'monitoring' };
}

/**
 * Calcula provisão financeira total e Índice de Suficiência de Provisão (ISP).
 * Calculates total financial provision and Provision Sufficiency Index.
 *
 * ISP = Provisão existente / Custo total estimado
 * ISP ≥ 1.0 → provisão suficiente; ISP < 1.0 → déficit
 *
 * @param params
 */
export function totalClosureCost(
    params: {
        revegetationHa?: number;
        remediationM3?: number;
        demolitionM2?: number;
        monitoringAnnual?: number;
        monitoringYears?: number;
        tondTonnesExtracted?: number;
        existingProvision?: number;
        discountRate?: number;
        unitCosts?: Partial<typeof DEFAULT_UNIT_COSTS>;
    } = {},
): {
    componentCosts: Record<string, number>;
    directCosts: number;
    administrationCost: number;
    totalProvision: number;
    costPerTonne: number | null;
    isp: number | null;
    deficit: number | null;
} {
    const uc = { ...DEFAULT_UNIT_COSTS, ...(params.unitCosts || {}) };

    const componentCosts: Record<string, number> = {};

    if (params.revegetationHa != null) {
        const { cost } = revegetationCost(params.revegetationHa, uc.revegetation_per_ha);
        componentCosts.revegetation = cost;
    }
    if (params.remediationM3 != null) {
        const { cost } = remediationCost(params.remediationM3, uc.remediation_per_m3);
        componentCosts.remediation = cost;
    }
    if (params.demolitionM2 != null) {
        const { cost } = demolitionCost(params.demolitionM2, uc.demolition_per_m2);
        componentCosts.demolition = cost;
    }
    const monYears = params.monitoringYears ?? uc.monitoring_years;
    const monAnnual = params.monitoringAnnual ?? uc.monitoring_annual;
    const { cost: monCost } = monitoringCost(monAnnual, monYears, params.discountRate ?? 0.05);
    componentCosts.monitoring = monCost;

    const directCosts = Object.values(componentCosts).reduce((a, b) => a + b, 0);
    const administrationCost = directCosts * uc.administration_rate;
    const totalProvision = directCosts + administrationCost;

    const costPerTonne =
        params.tondTonnesExtracted != null && params.tondTonnesExtracted > 0
            ? totalProvision / params.tondTonnesExtracted
            : null;

    const isp =
        params.existingProvision != null && totalProvision > 0 ? params.existingProvision / totalProvision : null;

    const deficit =
        isp != null && params.existingProvision != null ? Math.max(0, totalProvision - params.existingProvision) : null;

    return {
        componentCosts,
        directCosts,
        administrationCost,
        totalProvision,
        costPerTonne,
        isp,
        deficit,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineClosureCostEstimationMeta: AnalyticsModuleMeta = {
    name: 'mineClosureCostEstimation',
    description: 'mineClosureCostEstimation',
    category: 'analytics',
    familyTags: ['mining'],
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
