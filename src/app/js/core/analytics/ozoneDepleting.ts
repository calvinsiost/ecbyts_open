// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Ozone Depleting Substances - ODP calculation, refrigerant substitution, leakage, and compliance
// Substâncias Destruidoras de Ozônio - cálculo ODP, substituição de refrigerantes, vazamento e conformidade

'use strict';

// Ozone Depletion Potentials relative to CFC-11 (WMO/UNEP 2022 Scientific Assessment)
// Potenciais de Depleção do Ozônio relativos ao CFC-11
const ODP_TABLE: Record<string, number>= {
    'CFC-11': 1.0,
    'CFC-12': 1.0,
    'CFC-113': 0.8,
    'HCFC-22': 0.055,
    'HCFC-141b': 0.11,
    'halon-1301': 10.0,
    CH3Br: 0.66,
};

// GWP values (100-year) from IPCC AR6 (2021)
// Potenciais de Aquecimento Global (100 anos) do IPCC AR6
const GWP_TABLE: Record<string, number>= {
    'CFC-12': 10200,
    'HCFC-22': 1760,
    'HFC-134a': 1300,
    'R-410A': 2088,
    'R-32': 675,
    CO2: 1,
    NH3: 0,
};

/**
 * Computes Ozone Depletion Potential equivalent for a given substance and quantity.
 * Calcula o equivalente de Potencial de Depleção do Ozônio para uma substância e quantidade.
 *
 * ODP_eq = ODP_substance × quantity_kg
 * Severity: high > 100 kg CFC-11-eq; moderate 10–100; low 0.1–10; negligible < 0.1
 *
 * @param {'CFC-11'|'CFC-12'|'CFC-113'|'HCFC-22'|'HCFC-141b'|'halon-1301'|'CH3Br'} odp_substance
 * @param {number} quantity_kg - Mass of substance in kg (≥ 0)
 * @param {string} _application - Application context (informational)
 * @returns {{ odp_kg_CFC11_eq: number, severity: 'negligible'|'low'|'moderate'|'high' }}
 * @throws {TypeError} If odp_substance is not in registry
 * @throws {RangeError} If quantity_kg < 0
 * @see Montreal Protocol (1987) + Kigali Amendment (2016)
 * @see WMO/UNEP (2022) Scientific Assessment of Ozone Depletion, Appendix A
 */
export function computeODP(odp_substance: 'CFC-11'|'CFC-12'|'CFC-113'|'HCFC-22'|'HCFC-141b'|'halon-1301'|'CH3Br', quantity_kg: number, _application: string): { odp_kg_CFC11_eq: number, severity: 'negligible'|'low'|'moderate'|'high' } {
    if (!Object.prototype.hasOwnProperty.call(ODP_TABLE, odp_substance)) {
        throw new TypeError(`odp_substance '${odp_substance}' not found. Valid: ${Object.keys(ODP_TABLE).join(', ')}`);
    }
    if (typeof quantity_kg !== 'number' || !Number.isFinite(quantity_kg)) {
        throw new TypeError('quantity_kg must be a finite number');
    }
    if (quantity_kg < 0) throw new RangeError('quantity_kg must be >= 0');

    const odp_kg_CFC11_eq = (ODP_TABLE[odp_substance] ?? 0) * quantity_kg;

        let severity: 'negligible'|'low'|'moderate'|'high';
    if (odp_kg_CFC11_eq >= 100) severity = 'high';
    else if (odp_kg_CFC11_eq >= 10) severity = 'moderate';
    else if (odp_kg_CFC11_eq >= 0.1) severity = 'low';
    else severity = 'negligible';

    return { odp_kg_CFC11_eq, severity };
}

/**
 * Quantifies environmental benefit of refrigerant substitution.
 * Quantifica o benefício ambiental da substituição de refrigerantes.
 *
 * ODP reduction = (ODP_old − ODP_new) × quantity_kg
 * GWP reduction = (GWP_old − GWP_new) × quantity_kg / 1000 (t CO2-eq)
 *
 * @param {string} old_refrigerant - Current refrigerant identifier
 * @param {string} new_refrigerant - Replacement refrigerant identifier
 * @param {number} quantity_kg - Amount of refrigerant replaced in kg (> 0)
 * @returns {{ odp_reduction: number, gwp_reduction_tCO2eq: number, lifecycle_benefit: string }}
 * @throws {TypeError} If refrigerant not in GWP registry
 * @throws {RangeError} If quantity_kg ≤ 0
 * @see EU F-Gas Regulation 517/2014; IPCC AR6 (2021) Table 7.SM.7
 */
export function computeRefrigerantSubstitutionBenefit(old_refrigerant: string, new_refrigerant: string, quantity_kg: number): { odp_reduction: number, gwp_reduction_tCO2eq: number, lifecycle_benefit: string } {
    if (!Object.prototype.hasOwnProperty.call(GWP_TABLE, old_refrigerant)) {
        throw new TypeError(
            `old_refrigerant '${old_refrigerant}' not found. Valid: ${Object.keys(GWP_TABLE).join(', ')}`,
        );
    }
    if (!Object.prototype.hasOwnProperty.call(GWP_TABLE, new_refrigerant)) {
        throw new TypeError(
            `new_refrigerant '${new_refrigerant}' not found. Valid: ${Object.keys(GWP_TABLE).join(', ')}`,
        );
    }
    if (typeof quantity_kg !== 'number' || !Number.isFinite(quantity_kg)) {
        throw new TypeError('quantity_kg must be a finite number');
    }
    if (quantity_kg <= 0) throw new RangeError('quantity_kg must be > 0');

    // ODP reduction: diferença de ODP (0 para refrigerantes sem ODP registrado)
    const odp_old = ODP_TABLE[old_refrigerant] || 0;
    const odp_new = ODP_TABLE[new_refrigerant] || 0;
    const odp_reduction = (odp_old - odp_new) * quantity_kg;

    // GWP reduction em t CO2-eq: divisão por 1000 para converter kg→t
    const gwp_reduction_tCO2eq =
        (((GWP_TABLE[old_refrigerant] ?? 0) - (GWP_TABLE[new_refrigerant] ?? 0)) * quantity_kg) / 1000;

    let lifecycle_benefit;
    if (gwp_reduction_tCO2eq > 10 || odp_reduction > 1) lifecycle_benefit = 'significant';
    else if (gwp_reduction_tCO2eq > 1 || odp_reduction > 0.1) lifecycle_benefit = 'moderate';
    else lifecycle_benefit = 'minimal';

    return { odp_reduction, gwp_reduction_tCO2eq, lifecycle_benefit };
}

/**
 * Computes annual refrigerant leakage rate and F-Gas compliance status.
 * Calcula a taxa anual de vazamento de refrigerante e conformidade com F-Gas.
 *
 * leakage_pct_yr = annual_refill_kg / system_capacity_kg × 100
 * compliance = leakage < 10%/yr (EU F-Gas Regulation 517/2014, Art. 3)
 *
 * @param {number} system_capacity_kg - Total refrigerant charge in kg (> 0)
 * @param {number} annual_refill_kg - Refrigerant added per year in kg (≥ 0)
 * @param {number} years - Number of years of monitoring (> 0)
 * @returns {{ leakage_pct_yr: number, cumulative_emissions_kg: number, compliance: boolean }}
 * @throws {RangeError} If years ≤ 0 or system_capacity_kg ≤ 0
 * @see EU F-Gas Regulation 517/2014, Annex III
 * @see CONAMA 267/2000 - controle de SDOs no Brasil
 */
export function computeLeakageRate(system_capacity_kg: number, annual_refill_kg: number, years: number): { leakage_pct_yr: number, cumulative_emissions_kg: number, compliance: boolean } {
    for (const [name, val] of [
        ['system_capacity_kg', system_capacity_kg],
        ['annual_refill_kg', annual_refill_kg],
        ['years', years],
    ]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    }
    if (system_capacity_kg <= 0) throw new RangeError('system_capacity_kg must be > 0');
    if (annual_refill_kg < 0) throw new RangeError('annual_refill_kg must be >= 0');
    if (years <= 0) throw new RangeError('years must be > 0');

    // Taxa de vazamento anual em porcentagem
    const leakage_pct_yr = (annual_refill_kg / system_capacity_kg) * 100;
    // Emissões acumuladas no período
    const cumulative_emissions_kg = annual_refill_kg * years;
    // Conformidade: < 10%/ano conforme F-Gas Regulation
    const compliance = leakage_pct_yr < 10;

    return { leakage_pct_yr, cumulative_emissions_kg, compliance };
}

/**
 * Classifies ODS compliance status under Montreal Protocol and national regulations.
 * Classifica o status de conformidade com SDO sob o Protocolo de Montreal e regulações nacionais.
 *
 * Applies Montreal Protocol phase-out schedules:
 * - Non-Article 5: HCFCs banned 2030; CFCs/Halons banned 1996
 * - Article 5 (developing): HCFCs banned 2040; CFCs/Halons banned 2010
 * CONAMA 267/2000: HCFCs phase-down in Brazil (Article 5 Party)
 *
 * @param {number} odp_eq_total - Total ODP equivalent in kg CFC-11-eq (≥ 0)
 * @param {number} phase_out_deadline_year - Scheduled phase-out year
 * @param {number} current_year - Current year for compliance assessment
 * @param {'article5'|'non_article5'} party_type - Montreal Protocol party classification
 * @returns {{ status: string, montreal_protocol_schedule: string }}
 * @throws {TypeError} If party_type is invalid
 * @throws {RangeError} If odp_eq_total < 0
 * @see Montreal Protocol (1987) Article 5; Kigali Amendment (2016)
 * @see CONAMA 267/2000; MMA Portaria 44/2021 (atualização cronograma BR)
 */
export function classifyODSCompliance(odp_eq_total: number, phase_out_deadline_year: number, current_year: number, party_type: 'article5'|'non_article5'): { status: string, montreal_protocol_schedule: string } {
    for (const [name, val] of [
        ['odp_eq_total', odp_eq_total],
        ['phase_out_deadline_year', phase_out_deadline_year],
        ['current_year', current_year],
    ]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    }
    if (odp_eq_total < 0) throw new RangeError('odp_eq_total must be >= 0');
    const VALID_PARTIES = ['article5', 'non_article5'];
    if (!VALID_PARTIES.includes(party_type)) {
        throw new TypeError(`party_type must be 'article5' or 'non_article5'`);
    }

    // Determine se está no prazo ou vencido
    const past_deadline = current_year > phase_out_deadline_year;

    let status;
    if (odp_eq_total === 0 && !past_deadline) {
        status = 'compliant';
    } else if (past_deadline && odp_eq_total > 0) {
        status = 'banned';
    } else if (current_year >= phase_out_deadline_year - 2 && odp_eq_total > 0) {
        status = 'phase_out_required';
    } else if (odp_eq_total > 0) {
        status = 'phase_out_required';
    } else {
        status = 'compliant';
    }

    // Verificação adicional de não conformidade por volume excessivo
    if (odp_eq_total > 1000) status = 'non_compliant';

    // Cronograma do Protocolo de Montreal por tipo de parte
    const schedules = {
        article5:
            'Art.5 Party (developing): CFCs/Halons banned 2010; HCFCs phase-down 2013-2030, ban 2040; HFCs Kigali freeze 2024 (Annex F Gr.1)',
        non_article5:
            'Non-Art.5 Party (developed): CFCs/Halons banned 1996; HCFCs banned 2020-2030; HFCs Kigali phase-down 2019-2036',
    };

    return {
        status,
        montreal_protocol_schedule: schedules[party_type],
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const ozoneDepletingMeta = {
    name: 'ozoneDepleting',
    description: 'ozoneDepleting',
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
