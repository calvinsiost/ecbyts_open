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
 * @fileoverview Environmental Liability Valuation - Remediation Cost, Damage Value,
 * Accounting Provision (IAS 37 / CPC 25) and Materiality Classification
 *
 * Pure analytical module: no DOM, no IDB, no fetch, no Three.js dependencies.
 *
 * Academic references:
 *   - IAS 37 (2001) Provisions, Contingent Liabilities and Contingent Assets. IASB.
 *   - CPC 25 (2009) Provisões, Passivos Contingentes e Ativos Contingentes. CPC/BR.
 *   - GRI 307 Environmental Compliance. Global Reporting Initiative.
 *   - CPRM (2011) Passivos Ambientais na Mineração. Brasília.
 *   - SEC Staff Accounting Bulletin No. 92 (1993) - Environmental liabilities.
 */

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

type ContaminationLevel = 'low' | 'moderate' | 'high';
type Technology = 'excavation' | 'soil_washing' | 'bioremediation' | 'pump_treat' | 'monitored_natural';
type SoilType = 'clay' | 'sand' | 'gravel';

// Custos base de remediação por tecnologia [USD/m³]
// Base remediation unit costs per technology [USD/m³]
const TECH_BASE_COSTS: Record<Technology, number> = {
    excavation: 150,
    soil_washing: 200,
    bioremediation: 80,
    pump_treat: 120,
    monitored_natural: 20,
};

// Multiplicadores por nível de contaminação
// Contamination level cost multipliers
const CONTAMINATION_MULTIPLIERS: Record<ContaminationLevel, number> = {
    low: 1.0,
    moderate: 1.5,
    high: 2.5,
};

// Multiplicadores por tipo de solo
// Soil type cost multipliers
const SOIL_MULTIPLIERS: Record<SoilType, number> = {
    clay: 1.3,
    sand: 1.0,
    gravel: 0.9,
};

// ─── Remediation Cost (custo de remediação) ───────────────────────────────────

/**
 * Compute remediation cost based on volume, technology, contamination level and soil type.
 * Cálculo do custo de remediação por tecnologia, nível de contaminação e tipo de solo.
 *
 * Custo unitário = base_tech × mult_contam × mult_solo [USD/m³]
 * Custo total = custo_unit × volume [USD]
 *
 * @param volume_m3           - Volume to remediate [m³]
 * @param contamination_level - Contamination intensity
 * @param technology          - Remediation technology
 * @param soil_type           - Soil type affecting excavatability
 * @throws {RangeError} if volume <= 0
 * @throws {TypeError} if technology, contamination_level or soil_type is invalid
 */
export function computeRemediationCost(
    volume_m3: number,
    contamination_level: ContaminationLevel,
    technology: Technology,
    soil_type: SoilType,
): Readonly<{ unit_cost_USD_m3: number; total_cost_USD: number }> {
    if (volume_m3 <= 0) throw new RangeError('volume_m3 must be > 0');
    if (!TECH_BASE_COSTS[technology])
        throw new TypeError(`technology must be one of ${Object.keys(TECH_BASE_COSTS).join(', ')}`);
    if (!CONTAMINATION_MULTIPLIERS[contamination_level])
        throw new TypeError(`contamination_level must be one of ${Object.keys(CONTAMINATION_MULTIPLIERS).join(', ')}`);
    if (!SOIL_MULTIPLIERS[soil_type])
        throw new TypeError(`soil_type must be one of ${Object.keys(SOIL_MULTIPLIERS).join(', ')}`);

    const unit_cost_USD_m3 =
        TECH_BASE_COSTS[technology] * CONTAMINATION_MULTIPLIERS[contamination_level] * SOIL_MULTIPLIERS[soil_type];

    const total_cost_USD = unit_cost_USD_m3 * volume_m3;

    return Object.freeze({ unit_cost_USD_m3, total_cost_USD });
}

// ─── Environmental Damage Value (valor do dano ambiental) ────────────────────

/**
 * Compute environmental damage value and interim lost ecosystem services.
 * Cálculo do valor do dano ambiental e dos serviços ecossistêmicos perdidos.
 *
 * Dano direto = área × intensidade × custo_restauração_ha [USD]
 * Perda interina = dano × anos_recuperação × 0.10  (10%/ano de serviços perdidos)
 *
 * @param ecosystem_area_ha      - Affected area [ha]
 * @param damage_intensity       - Damage intensity [0–1]
 * @param restoration_cost_ha    - Restoration cost per ha [USD/ha]
 * @param years_to_recovery      - Expected recovery time [yr]
 * @throws {RangeError} if area or restoration cost are non-positive, intensity not in [0,1]
 */
export function computeEnvironmentalDamageValue(
    ecosystem_area_ha: number,
    damage_intensity: number,
    restoration_cost_ha: number,
    years_to_recovery: number,
): Readonly<{ damage_USD: number; interim_loss_USD: number }> {
    if (ecosystem_area_ha <= 0) throw new RangeError('ecosystem_area_ha must be > 0');
    if (damage_intensity < 0 || damage_intensity > 1) throw new RangeError('damage_intensity must be in [0, 1]');
    if (restoration_cost_ha < 0) throw new RangeError('restoration_cost_ha must be >= 0');
    if (years_to_recovery < 0) throw new RangeError('years_to_recovery must be >= 0');

    const damage_USD = ecosystem_area_ha * damage_intensity * restoration_cost_ha;
    const interim_loss_USD = damage_USD * years_to_recovery * 0.1;

    return Object.freeze({ damage_USD, interim_loss_USD });
}

// ─── Accounting Provision (provisão contábil IAS 37 / CPC 25) ────────────────

/**
 * Compute accounting provision and net present value per IAS 37 / CPC 25.
 * Cálculo da provisão contábil e VPL do passivo ambiental (IAS 37 / CPC 25).
 *
 * Valor esperado = (remediation_cost + damage_cost) × probability
 * NPV = valor_esperado / (1 + r)^n
 *
 * @param remediation_cost  - Remediation cost estimate [USD]
 * @param damage_cost       - Environmental damage cost [USD]
 * @param probability       - Probability of liability materializing [0–1]
 * @param discount_rate     - Annual discount rate [fraction, e.g. 0.06 = 6%]
 * @param years_horizon     - Horizon for discounting [yr]
 * @throws {RangeError} if probability not in [0,1] or discount_rate negative
 */
export function computeAccountingProvision(
    remediation_cost: number,
    damage_cost: number,
    probability: number,
    discount_rate: number,
    years_horizon: number,
): Readonly<{ provision_USD: number; npv_USD: number }> {
    if (remediation_cost < 0) throw new RangeError('remediation_cost must be >= 0');
    if (damage_cost < 0) throw new RangeError('damage_cost must be >= 0');
    if (probability < 0 || probability > 1) throw new RangeError('probability must be in [0, 1]');
    if (discount_rate < 0) throw new RangeError('discount_rate must be >= 0');
    if (years_horizon < 0) throw new RangeError('years_horizon must be >= 0');

    const expected_value = (remediation_cost + damage_cost) * probability;

    // VPL usando fórmula de valor presente: PV = FV / (1+r)^n
    const npv_USD = expected_value / Math.pow(1 + discount_rate, years_horizon);
    const provision_USD = expected_value;

    return Object.freeze({ provision_USD, npv_USD });
}

// ─── Liability Materiality Classification (materialidade do passivo) ──────────

/**
 * Classify environmental liability materiality per IAS 37 and GRI 307.
 * Classificação da materialidade do passivo ambiental (IAS 37 + GRI 307).
 *
 * Material se: provision > 5% da receita OU provision > 1 MUSD.
 * ESG full_disclosure exigido se material E esg_disclosure_required.
 *
 * @param provision_USD          - Provision amount [USD]
 * @param company_revenue_USD    - Company annual revenue [USD]
 * @param esg_disclosure_required - ESG reporting required?
 * @throws {RangeError} if provision or revenue are negative
 */
export function classifyLiabilityMateriality(
    provision_USD: number,
    company_revenue_USD: number,
    esg_disclosure_required: boolean = false,
): Readonly<{
    materiality: 'immaterial' | 'possible' | 'probable' | 'material';
    disclosure_level: string;
    accounting_treatment: string;
}> {
    if (provision_USD < 0) throw new RangeError('provision_USD must be >= 0');
    if (company_revenue_USD <= 0) throw new RangeError('company_revenue_USD must be > 0');

    const pct_of_revenue = provision_USD / company_revenue_USD;
    const MATERIAL_THRESHOLD_USD = 1_000_000;
    const MATERIAL_THRESHOLD_PCT = 0.05;

    const isMaterial = provision_USD > MATERIAL_THRESHOLD_USD || pct_of_revenue > MATERIAL_THRESHOLD_PCT;

    let materiality: 'immaterial' | 'possible' | 'probable' | 'material';
    let disclosure_level, accounting_treatment;

    if (provision_USD === 0) {
        materiality = 'immaterial';
        disclosure_level = 'none';
        accounting_treatment = 'No provision required — IAS 37 §14';
    } else if (isMaterial) {
        materiality = 'material';
        disclosure_level = esg_disclosure_required ? 'full_disclosure' : 'provision';
        accounting_treatment = 'Recognize provision in balance sheet; disclose in notes — IAS 37 §85-86; GRI 307';
    } else if (pct_of_revenue > 0.01) {
        materiality = 'probable';
        disclosure_level = 'provision';
        accounting_treatment = 'Recognize provision; disclose nature and uncertainty — IAS 37 §85';
    } else {
        materiality = 'possible';
        disclosure_level = 'note';
        accounting_treatment = 'Contingent liability — disclose in notes, no balance sheet provision — IAS 37 §86';
    }

    return Object.freeze({ materiality, disclosure_level, accounting_treatment });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalLiabilityValuationMeta: AnalyticsModuleMeta = {
    name: 'environmentalLiabilityValuation',
    description: 'environmentalLiabilityValuation',
    category: 'analytics',
    familyTags: ['environmental'],
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
