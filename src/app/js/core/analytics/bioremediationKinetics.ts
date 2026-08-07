// @ts-check
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
 * @module bioremediationKinetics
 * Cinética de biorremediação usando modelos de Monod para crescimento microbiano
 * e consumo de substrato em solos e águas subterrâneas contaminadas.
 *
 * Referências acadêmicas:
 * - Monod, J. 1949 - The Growth of Bacterial Cultures
 *   DOI: 10.1146/annurev.mi.03.100149.002103
 * - Rittmann & McCarty 2001 - Environmental Biotechnology: Principles and Applications
 *   ISBN: 978-0-07-234553-0
 * - Alexander, M. 1999 - Biodegradation and Bioremediation (2nd ed.)
 *   ISBN: 978-0-12-049861-6
 */
/**
 * Calcula a taxa de crescimento específico microbiano usando a equação de Monod.
 * mu = mu_max × S / (Ks + S)
 *
 * @param {number} substrate_mg_L - Concentração de substrato (contaminante) em mg/L
 * @param {number} mu_max_per_h - Taxa máxima de crescimento específico (h⁻¹)
 * @param {number} Ks_mg_L - Constante de meia-saturação (mg/L) - concentração com 50% de mu_max
 * @returns {{ mu_per_h: number }} Taxa de crescimento específico em h⁻¹
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se substrate < 0, mu_max <= 0, ou Ks <= 0
 */
export function computeMonodGrowthRate(substrate_mg_L: any, mu_max_per_h: any, Ks_mg_L: any) {
    if (typeof substrate_mg_L !== 'number' || typeof mu_max_per_h !== 'number' || typeof Ks_mg_L !== 'number') {
        throw new TypeError('computeMonodGrowthRate: parâmetros devem ser números');
    }
    if (substrate_mg_L < 0) {
        throw new RangeError('computeMonodGrowthRate: substrate_mg_L não pode ser negativo');
    }
    if (mu_max_per_h <= 0) {
        throw new RangeError('computeMonodGrowthRate: mu_max_per_h deve ser positivo');
    }
    if (Ks_mg_L <= 0) {
        throw new RangeError('computeMonodGrowthRate: Ks_mg_L deve ser positivo');
    }
    // Equação de Monod (1949): crescimento hiperbólico limitado por substrato
    const mu_per_h = (mu_max_per_h * substrate_mg_L) / (Ks_mg_L + substrate_mg_L);
    return { mu_per_h };
}
/**
 * Calcula a taxa de consumo de substrato pela biomassa microbiana.
 * dS/dt = -(mu × X) / Y
 * Valor negativo indica degradação (consumo) do contaminante.
 *
 * @param {number} mu_per_h - Taxa de crescimento específico (h⁻¹)
 * @param {number} biomass_mg_L - Concentração de biomassa microbiana (mg/L)
 * @param {number} yield_coef - Coeficiente de rendimento celular Y (mg biomassa / mg substrato)
 * @returns {{ dS_dt_mg_L_h: number }} Taxa de consumo de substrato em mg/(L·h) - valor negativo
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se mu < 0, biomass < 0, ou yield <= 0
 */
export function computeSubstrateConsumption(mu_per_h: any, biomass_mg_L: any, yield_coef: any) {
    if (typeof mu_per_h !== 'number' || typeof biomass_mg_L !== 'number' || typeof yield_coef !== 'number') {
        throw new TypeError('computeSubstrateConsumption: parâmetros devem ser números');
    }
    if (mu_per_h < 0) {
        throw new RangeError('computeSubstrateConsumption: mu_per_h não pode ser negativo');
    }
    if (biomass_mg_L < 0) {
        throw new RangeError('computeSubstrateConsumption: biomass_mg_L não pode ser negativo');
    }
    if (yield_coef <= 0) {
        throw new RangeError('computeSubstrateConsumption: yield_coef deve ser positivo');
    }
    // Taxa de consumo de substrato: negativa porque representa degradação
    const dS_dt_mg_L_h = -(mu_per_h * biomass_mg_L) / yield_coef;
    return { dS_dt_mg_L_h };
}
/**
 * Calcula a meia-vida de biorremediação de um contaminante.
 * Assumindo cinética de primeira ordem aproximada para baixas concentrações:
 * t_half = ln(2) × S0 / |dS/dt| = ln(2) × S0 × Y / (mu × X)
 *
 * @param {number} mu_per_h - Taxa de crescimento específico (h⁻¹)
 * @param {number} biomass_mg_L - Concentração de biomassa (mg/L)
 * @param {number} yield_coef - Coeficiente de rendimento Y (mg/mg)
 * @param {number} initial_concentration_mg_L - Concentração inicial do contaminante (mg/L)
 * @returns {{ t_half_h: number }} Meia-vida de biorremediação em horas
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se valores inválidos (mu=0 resulta em meia-vida infinita rejeitada)
 */
export function computeBioremediationHalfLife(mu_per_h: any, biomass_mg_L: any, yield_coef: any, initial_concentration_mg_L: any) {
    if (typeof mu_per_h !== 'number' ||
        typeof biomass_mg_L !== 'number' ||
        typeof yield_coef !== 'number' ||
        typeof initial_concentration_mg_L !== 'number') {
        throw new TypeError('computeBioremediationHalfLife: parâmetros devem ser números');
    }
    if (mu_per_h <= 0) {
        throw new RangeError('computeBioremediationHalfLife: mu_per_h deve ser positivo (taxa de crescimento zero implica sem biorremediação)');
    }
    if (biomass_mg_L <= 0) {
        throw new RangeError('computeBioremediationHalfLife: biomass_mg_L deve ser positivo');
    }
    if (yield_coef <= 0) {
        throw new RangeError('computeBioremediationHalfLife: yield_coef deve ser positivo');
    }
    if (initial_concentration_mg_L <= 0) {
        throw new RangeError('computeBioremediationHalfLife: initial_concentration_mg_L deve ser positivo');
    }
    // Derivação: t_half = ln(2) / k_obs, onde k_obs = (mu × X) / (Y × S0)
    // Simplificado para cinética de primeira ordem aparente
    const k_obs = (mu_per_h * biomass_mg_L) / (yield_coef * initial_concentration_mg_L);
    const t_half_h = Math.LN2 / k_obs;
    return { t_half_h };
}
/**
 * Classifica a taxa de biorremediação com base na razão de saturação de Monod.
 * saturation_ratio = S / (Ks + S) - representa a fração de mu_max atingida
 * < 0.1 = negligível; < 0.3 = lenta; < 0.7 = moderada; >= 0.7 = rápida
 *
 * @param {number} mu_per_h - Taxa de crescimento específico (h⁻¹) - não utilizada diretamente, mas valida o contexto
 * @param {number} substrate_mg_L - Concentração de substrato (mg/L)
 * @param {number} Ks_mg_L - Constante de meia-saturação (mg/L)
 * @returns {{ rate: string }} Classificação: 'negligible' | 'slow' | 'moderate' | 'fast'
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se substrate < 0 ou Ks <= 0
 */
export function classifyBioremediationRate(mu_per_h: any, substrate_mg_L: any, Ks_mg_L: any) {
    if (typeof mu_per_h !== 'number' || typeof substrate_mg_L !== 'number' || typeof Ks_mg_L !== 'number') {
        throw new TypeError('classifyBioremediationRate: parâmetros devem ser números');
    }
    if (substrate_mg_L < 0) {
        throw new RangeError('classifyBioremediationRate: substrate_mg_L não pode ser negativo');
    }
    if (Ks_mg_L <= 0) {
        throw new RangeError('classifyBioremediationRate: Ks_mg_L deve ser positivo');
    }
    if (mu_per_h < 0) {
        throw new RangeError('classifyBioremediationRate: mu_per_h não pode ser negativo');
    }
    // Razão de saturação: quão próximo da taxa máxima o sistema opera
    const saturation_ratio = substrate_mg_L / (Ks_mg_L + substrate_mg_L);
    let rate;
    if (saturation_ratio < 0.1) {
        rate = 'negligible';
    }
    else if (saturation_ratio < 0.3) {
        rate = 'slow';
    }
    else if (saturation_ratio < 0.7) {
        rate = 'moderate';
    }
    else {
        rate = 'fast';
    }
    return { rate };
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const bioremediationKineticsMeta = {
    name: 'bioremediationKinetics',
    description: 'bioremediationKinetics',
    category: 'analytics',
    familyTags: ['remediation'],
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
//# sourceMappingURL=bioremediationKinetics.js.map
