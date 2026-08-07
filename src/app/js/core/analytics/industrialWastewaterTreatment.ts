// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Industrial Wastewater Treatment Module
// Módulo de tratamento de efluentes industriais - remoção de carga, eficiência e conformidade com lançamento.
//
// References / Referências:
// - Metcalf & Eddy (2014) Wastewater Engineering: Treatment and Resource Recovery, 5th ed., McGraw-Hill
// - CONAMA 430/2011: Condições e padrões de lançamento de efluentes
// - von Sperling (2007) Biological Wastewater Treatment, IWA Publishing
// - ABNT NBR 9800:1987: Critérios para lançamento de efluentes líquidos industriais

'use strict';

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

interface TreatmentStep {
    process: string;
    efficiency_pct: number;
}

interface EffluentParams {
    ph: number;
    bod_mg_L: number;
    cod_mg_L: number;
    tss_mg_L: number;
    tn_mg_L: number;
    tp_mg_L: number;
}

interface DischargeLimits {
    ph_min: number;
    ph_max: number;
    bod_mg_L: number;
    cod_mg_L: number;
    tss_mg_L: number;
    tn_mg_L: number;
    tp_mg_L: number;
}

type PenaltyRisk = 'none' | 'warning' | 'fine' | 'shutdown';

/**
 * Compute effluent quality after a chain of treatment processes.
 * Calcula a qualidade do efluente após uma cadeia de processos de tratamento.
 *
 * @param influent_mg_L - Influent concentration in mg/L / Concentração afluente em mg/L
 * @param treatment_steps - Treatment steps with efficiency / Etapas com eficiência
 * @returns
 */
export function computeRemovalEfficiencyChain(
    influent_mg_L: number,
    treatment_steps: TreatmentStep[],
): { effluent_mg_L: number; overall_efficiency_pct: number } {
    if (typeof influent_mg_L !== 'number' || influent_mg_L < 0) throw new RangeError('influent_mg_L must be >= 0');
    if (!Array.isArray(treatment_steps) || treatment_steps.length === 0)
        throw new TypeError('treatment_steps must be a non-empty array');

    for (const step of treatment_steps) {
        if (typeof step.efficiency_pct !== 'number' || step.efficiency_pct < 0 || step.efficiency_pct > 100)
            throw new RangeError(`treatment step efficiency_pct must be in [0, 100]: got ${step.efficiency_pct}`);
    }

    // Concentração efluente = C0 × ∏(1 - η_i/100) - Metcalf & Eddy (2014) cap. 7
    let effluent_mg_L = influent_mg_L;
    for (const step of treatment_steps) {
        effluent_mg_L *= 1 - step.efficiency_pct / 100;
    }

    // Eficiência global: (1 - C_ef/C_0) × 100
    const overall_efficiency_pct = influent_mg_L > 0 ? (1 - effluent_mg_L / influent_mg_L) * 100 : 0;

    return { effluent_mg_L, overall_efficiency_pct };
}

/**
 * Compute sludge production from primary/secondary treatment.
 * Calcula a produção de lodo do tratamento primário/secundário.
 *
 * @param flow_m3_day - Wastewater flow rate in m³/day / Vazão de efluente em m³/dia
 * @param tss_removal_mg_L - TSS removed in mg/L / SST removidos em mg/L
 * @param volatile_fraction - Volatile solids fraction 0–100 (%) / Fração de sólidos voláteis 0–100 (%)
 * @param sludge_density_kg_m3 - Sludge density in kg/m³ / Densidade do lodo em kg/m³
 * @returns
 */
export function computeSludgeProduction(
    flow_m3_day: number,
    tss_removal_mg_L: number,
    volatile_fraction: number,
    sludge_density_kg_m3: number,
): { sludge_dry_t_day: number; sludge_wet_m3_day: number } {
    if (typeof flow_m3_day !== 'number' || flow_m3_day <= 0)
        throw new RangeError('flow_m3_day must be a positive number');
    if (typeof tss_removal_mg_L !== 'number' || tss_removal_mg_L < 0)
        throw new RangeError('tss_removal_mg_L must be >= 0');
    if (typeof volatile_fraction !== 'number' || volatile_fraction < 0 || volatile_fraction > 100)
        throw new RangeError('volatile_fraction must be in [0, 100]');
    if (typeof sludge_density_kg_m3 !== 'number' || sludge_density_kg_m3 <= 0)
        throw new RangeError('sludge_density_kg_m3 must be a positive number');

    // Lodo seco (t/dia) = Q(m³/dia) × remoção(mg/L) / 1e6 × 1000(kg/t) = Q × rem / 1e3
    // Conversão: mg/L = g/m³; então Q(m³) × conc(g/m³) / 1e6 → t
    const sludge_dry_t_day = ((flow_m3_day * tss_removal_mg_L) / 1e6) * 1000; // toneladas/dia

    // Lodo úmido: assume 70% de sólidos na fração volátil → umidade típica de lodo espessado
    // Volume úmido (m³/dia) = massa seca / (densidade × VS% / 100 × 0.7)
    const vs_fraction = volatile_fraction / 100;
    const sludge_wet_m3_day =
        vs_fraction > 0 ? (sludge_dry_t_day * 1000) / (sludge_density_kg_m3 * vs_fraction * 0.7) : 0;

    return { sludge_dry_t_day, sludge_wet_m3_day };
}

/**
 * Compute aeration requirements for biological treatment.
 * Calcula a necessidade de aeração para tratamento biológico.
 *
 * @param bod_load_kg_day - BOD load in kg/day / Carga de DBO em kg/dia
 * @param oxygen_transfer_efficiency_pct - Oxygen transfer efficiency OTE (%) / Eficiência de transferência de O₂ (%)
 * @param alpha_factor - Alpha correction factor for process water (0–1) / Fator alfa de correção para água do processo
 * @param beta_factor - Beta correction factor for salinity/surface tension (0–1) / Fator beta de correção para salinidade
 * @returns
 */
export function computeAerationRequirement(
    bod_load_kg_day: number,
    oxygen_transfer_efficiency_pct: number,
    alpha_factor: number,
    beta_factor: number,
): { oxygen_required_kg_day: number; air_flow_m3_min: number } {
    if (typeof bod_load_kg_day !== 'number' || bod_load_kg_day < 0)
        throw new RangeError('bod_load_kg_day must be >= 0');
    if (typeof oxygen_transfer_efficiency_pct !== 'number' || oxygen_transfer_efficiency_pct <= 0)
        throw new RangeError('oxygen_transfer_efficiency_pct must be > 0');
    if (typeof alpha_factor !== 'number' || alpha_factor <= 0 || alpha_factor > 1)
        throw new RangeError('alpha_factor must be in (0, 1]');
    if (typeof beta_factor !== 'number' || beta_factor <= 0 || beta_factor > 1)
        throw new RangeError('beta_factor must be in (0, 1]');

    // O₂ necessário ≈ 1.1 kg O₂/kg DBO₅ removida (fator empírico - Metcalf & Eddy 2014, eq. 10-19)
    const oxygen_required_kg_day = bod_load_kg_day * 1.1;

    // SOTR (Standard Oxygen Transfer Rate): O₂ corrigido por α e β
    // SOTR = O₂ / (α × β × OTE/100) - von Sperling (2007)
    const SOTR = oxygen_required_kg_day / (alpha_factor * beta_factor * (oxygen_transfer_efficiency_pct / 100));

    // Vazão de ar: ar contém ~23% O₂ em massa, densidade ar = 1.2 kg/m³
    // SOTR(kg/dia) → kg/min; ar(m³/min) = SOTR/min / (0.23 × 1.2)
    const air_flow_m3_min = SOTR / 1440 / (0.23 * 1.2);

    return { oxygen_required_kg_day, air_flow_m3_min };
}

// CONAMA 430/2011 limites de lançamento por classe de corpo receptor
// CONAMA 430/2011 discharge limits by receiving body class
const DISCHARGE_LIMITS: Record<string, DischargeLimits> = {
    river_class_I: {
        ph_min: 5.0,
        ph_max: 9.0,
        bod_mg_L: 60,
        cod_mg_L: 200,
        tss_mg_L: 100,
        tn_mg_L: 20,
        tp_mg_L: 4,
    },
    river_class_II: {
        ph_min: 5.0,
        ph_max: 9.0,
        bod_mg_L: 80,
        cod_mg_L: 250,
        tss_mg_L: 120,
        tn_mg_L: 20,
        tp_mg_L: 4,
    },
    river_class_III: {
        ph_min: 5.0,
        ph_max: 9.0,
        bod_mg_L: 120,
        cod_mg_L: 300,
        tss_mg_L: 150,
        tn_mg_L: 20,
        tp_mg_L: 4,
    },
};

const NUMERIC_LIMIT_CHECKS: Array<{ key: keyof EffluentParams & keyof DischargeLimits; label: string }> = [
    { key: 'bod_mg_L', label: 'BOD' },
    { key: 'cod_mg_L', label: 'COD' },
    { key: 'tss_mg_L', label: 'TSS' },
    { key: 'tn_mg_L', label: 'TN' },
    { key: 'tp_mg_L', label: 'TP' },
];

/**
 * Assess discharge compliance against CONAMA 430/2011 standards.
 * Avalia a conformidade do lançamento com os padrões da CONAMA 430/2011.
 *
 * @param effluent_params
 * @param discharge_class - Receiving body class / Classe do corpo receptor
 * @returns
 */
export function assessDischargeCompliance(
    effluent_params: EffluentParams,
    discharge_class: 'river_class_I' | 'river_class_II' | 'river_class_III',
): { compliant: boolean; violations: string[]; penalty_risk: PenaltyRisk } {
    if (!effluent_params || typeof effluent_params !== 'object')
        throw new TypeError('effluent_params must be an object');
    const limits = DISCHARGE_LIMITS[discharge_class];
    if (!limits) throw new RangeError(`discharge_class must be one of: ${Object.keys(DISCHARGE_LIMITS).join(', ')}`);

    const violations = collectViolations(effluent_params, limits);
    const compliant = violations.length === 0;
    const penalty_risk = determinePenaltyRisk(violations.length);

    return { compliant, violations, penalty_risk };
}

function collectViolations(params: EffluentParams, limits: DischargeLimits): string[] {
    const violations: string[] = [];

    // Verificação de pH
    if (typeof params.ph !== 'number' || params.ph < limits.ph_min || params.ph > limits.ph_max) {
        violations.push(`pH ${params.ph} outside [${limits.ph_min}, ${limits.ph_max}]`);
    }

    for (const { key, label } of NUMERIC_LIMIT_CHECKS) {
        const value = params[key];
        const limit = limits[key];
        if (typeof value === 'number' && value > limit) {
            violations.push(`${label} ${value} mg/L exceeds ${limit} mg/L limit`);
        }
    }

    return violations;
}

function determinePenaltyRisk(violationCount: number): PenaltyRisk {
    // Risco de penalidade baseado no número de violações - CONAMA 430/2011 art. 14-24
    if (violationCount === 0) return 'none';
    if (violationCount === 1) return 'warning';
    if (violationCount <= 3) return 'fine';
    return 'shutdown';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialWastewaterTreatmentMeta: AnalyticsModuleMeta = {
    name: 'industrialWastewaterTreatment',
    description: 'industrialWastewaterTreatment',
    category: 'analytics',
    familyTags: ['water', 'industrial', 'waste'],
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
