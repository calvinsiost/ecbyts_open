// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Water Treatment Processes
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Water Treatment Process - Drinking Water Quality Engineering
 *
 * Módulo puro implementando modelos de processos de tratamento de água:
 * demanda de cloro, dosagem de coagulante (Jarvis et al. 2004), rejeição de
 * membrana e verificação de conformidade com Portaria MS 888/2021 (Brasil).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * @module waterTreatmentProcess
 * @references
 *   WHO (2017) Guidelines for Drinking-Water Quality, 4th ed. - WHO/TRS/978
 *   Portaria MS 888/2021 - Padrão de potabilidade, Ministério da Saúde, Brasil
 *   Jarvis et al. (2004) Water Res. 38:2718-2728 - Coagulant dose prediction
 *   AWWA (2011) Water Quality & Treatment, 6th ed. - Chlorine demand models
 */

'use strict';

// Portaria MS 888/2021 - limites de potabilidade
// Parâmetros máximos e mínimos para água de consumo humano
const PORTARIA_888 = {
    turbidity_max_NTU: 1, // Turbidez máxima pós-filtração
    ecoli_max_cfu_100mL: 0, // E. coli: ausência obrigatória
    chlorine_residual_min: 0.2, // Residual de cloro mínimo (mg/L)
    chlorine_residual_max: 5.0, // Residual de cloro máximo (mg/L)
    ph_min: 6.0, // pH mínimo
    ph_max: 9.5, // pH máximo
};

// Relação de dose coagulante: sulfato de alumínio vs cloreto férrico
// Fator de conversão de alum para cloreto férrico (Jarvis et al. 2004)
const FERRIC_TO_ALUM_RATIO = 0.7;

/**
 * Compute chlorine demand for disinfection treatment.
 * Calcula a demanda de cloro para o tratamento de desinfecção.
 *
 * CD = 0.5 × TOC + 5 × NH3 + 0.01 × t
 *
 * onde TOC = carbono orgânico total (mg/L), NH3 = amônia (mg/L), t = tempo de contato (min).
 * A função retorna também a função de cálculo de residual dado uma dose aplicada.
 *
 * @param {number} toc_mg_L         - Total organic carbon (mg/L) / Carbono orgânico total
 * @param {number} ammonia_mg_L     - Ammonia concentration (mg/L) / Concentração de amônia
 * @param {number} contact_time_min - Contact time (minutes) / Tempo de contato em minutos
 * @returns {{ chlorineDemand_mg_L: number, residual: (dose: number) => number }}
 * @throws {RangeError} If any parameter is negative
 */
export function computeChlorineDemand(toc_mg_L: any, ammonia_mg_L: any, contact_time_min: any) {
    if (toc_mg_L < 0) throw new RangeError('toc_mg_L must be non-negative');
    if (ammonia_mg_L < 0) throw new RangeError('ammonia_mg_L must be non-negative');
    if (contact_time_min < 0) throw new RangeError('contact_time_min must be non-negative');

    // Demanda de cloro: contribuições de matéria orgânica, amônia e tempo de contato
    // Fórmula empírica baseada em AWWA (2011) e modelos de reatividade de cloro
    const chlorineDemand_mg_L = 0.5 * toc_mg_L + 5 * ammonia_mg_L + 0.01 * contact_time_min;

    return {
        chlorineDemand_mg_L,
        /**
         * Calculates residual chlorine given applied dose.
         * Calcula o residual de cloro para uma dose aplicada.
         * @param {number} toc_mg_L - Applied chlorine dose (mg/L) / Dose de cloro aplicada
         * @returns {number} Residual chlorine (mg/L) / Cloro residual (mg/L)
         */
        residual: (dose: any) => dose - chlorineDemand_mg_L,
    };
}

/**
 * Compute coagulant dose based on raw water quality parameters.
 * Calcula a dose de coagulante baseada na qualidade da água bruta.
 *
 * D_alum = 2.5 × turbidity^0.5 + 1.8 × TOC + |pH - 7| × 5
 * D_ferric = D_alum × 0.7  (relação molar aproximada Jarvis et al. 2004)
 *
 * @param {number} toc_mg_L - Raw water turbidity (NTU) / Turbidez da água bruta
 * @param {number} toc_mg_L      - Total organic carbon (mg/L) / Carbono orgânico total
 * @param {number} toc_mg_L            - pH of raw water / pH da água bruta
 * @returns {{ alumDose_mg_L: number, ferricDose_mg_L: number }}
 * @throws {RangeError} If turbidity is negative or pH is out of range
 */
export function computeCoagulationDose(turbidity_NTU: any, toc_mg_L: any, ph: any) {
    if (turbidity_NTU < 0) throw new RangeError('turbidity_NTU must be non-negative');
    if (toc_mg_L < 0) throw new RangeError('toc_mg_L must be non-negative');
    if (ph < 0 || ph > 14) throw new RangeError('ph must be in [0, 14]');

    // Dose de sulfato de alumínio (mg/L como Al2(SO4)3)
    // Contribuições: turbidez (raiz quadrada), matéria orgânica, desvio de pH ideal (7.0)
    const alumDose_mg_L = 2.5 * Math.sqrt(turbidity_NTU) + 1.8 * toc_mg_L + Math.abs(ph - 7) * 5;

    // Dose equivalente de cloreto férrico (FeCl3)
    const ferricDose_mg_L = alumDose_mg_L * FERRIC_TO_ALUM_RATIO;

    return { alumDose_mg_L, ferricDose_mg_L };
}

/**
 * Compute membrane rejection efficiency (UF/NF/RO membranes).
 * Calcula a eficiência de rejeição de membrana (UF/NF/OI).
 *
 * R (%) = (1 - C_permeado / C_alimentação) × 100
 * Log Removal = -log10(1 - R/100) = log10(Cf/Cp)
 *
 * @param {number} feedConc     - Feed concentration (any consistent unit) / Concentração alimentação
 * @param {number} permeateConc - Permeate concentration (same unit) / Concentração permeado
 * @returns {{ rejection_pct: number, logRemoval: number }}
 * @throws {RangeError} If feedConc <= 0 or permeateConc > feedConc
 */
export function computeMembraneRejection(feedConc: any, permeateConc: any) {
    if (feedConc <= 0) throw new RangeError('feedConc must be positive');
    if (permeateConc < 0) throw new RangeError('permeateConc must be non-negative');
    if (permeateConc > feedConc) {
        throw new RangeError('permeateConc cannot exceed feedConc (rejection must be >= 0%)');
    }

    // Rejeição percentual da membrana
    const rejection_pct = (1 - permeateConc / feedConc) * 100;

    // Log de remoção (padrão WHO/EPA para patógenos)
    // Evitar log10(0) quando rejeição = 100%
    const passThrough = 1 - rejection_pct / 100;
    const logRemoval = passThrough > 0 ? -Math.log10(passThrough) : Infinity;

    return { rejection_pct, logRemoval };
}

/**
 * Classify treatment adequacy against Portaria MS 888/2021 (Brazil).
 * Classifica a adequabilidade do tratamento conforme Portaria MS 888/2021.
 *
 * Parâmetros verificados:
 *   - Turbidez: ≤ 1 NTU (pós-filtração convencional)
 *   - E. coli: ausência em 100 mL (zero tolerância)
 *   - Cloro residual: 0,2 a 5,0 mg/L (desinfecção eficaz)
 *   - pH: 6,0 a 9,5 (faixas de potabilidade)
 *
 * @param {number} turbidity_NTU         - Turbidity (NTU) / Turbidez
 * @param {number} ecoli_cfu_100mL       - E. coli count (CFU/100mL) / Contagem de E. coli
 * @param {number} chlorineResidual_mg_L - Free chlorine residual (mg/L) / Cloro residual livre
 * @param {number} ph                    - pH value / Valor de pH
 * @returns {{ compliant: boolean, violations: string[] }}
 */
export function classifyTreatmentAdequacy(turbidity_NTU: any, ecoli_cfu_100mL: any, chlorineResidual_mg_L: any, ph: any) {
    if (turbidity_NTU < 0) throw new RangeError('turbidity_NTU must be non-negative');
    if (ecoli_cfu_100mL < 0) throw new RangeError('ecoli_cfu_100mL must be non-negative');
    if (chlorineResidual_mg_L < 0) throw new RangeError('chlorineResidual_mg_L must be non-negative');
    if (ph < 0 || ph > 14) throw new RangeError('ph must be in [0, 14]');

    const violations = [];

    // Verificação de cada parâmetro da Portaria 888/2021
    if (turbidity_NTU > PORTARIA_888.turbidity_max_NTU) {
        violations.push(
            `turbidity ${turbidity_NTU} NTU > ${PORTARIA_888.turbidity_max_NTU} NTU (Portaria 888/2021 Art. 39)`,
        );
    }
    if (ecoli_cfu_100mL > PORTARIA_888.ecoli_max_cfu_100mL) {
        violations.push(`E. coli ${ecoli_cfu_100mL} CFU/100mL > 0 (Portaria 888/2021 Art. 40 — ausência obrigatória)`);
    }
    if (chlorineResidual_mg_L < PORTARIA_888.chlorine_residual_min) {
        violations.push(
            `chlorine residual ${chlorineResidual_mg_L} mg/L < ${PORTARIA_888.chlorine_residual_min} mg/L (Portaria 888/2021 Art. 34)`,
        );
    }
    if (chlorineResidual_mg_L > PORTARIA_888.chlorine_residual_max) {
        violations.push(
            `chlorine residual ${chlorineResidual_mg_L} mg/L > ${PORTARIA_888.chlorine_residual_max} mg/L (Portaria 888/2021 Art. 34)`,
        );
    }
    if (ph < PORTARIA_888.ph_min || ph > PORTARIA_888.ph_max) {
        violations.push(
            `pH ${ph} out of range [${PORTARIA_888.ph_min}, ${PORTARIA_888.ph_max}] (Portaria 888/2021 Art. 39)`,
        );
    }

    return {
        compliant: violations.length === 0,
        violations,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterTreatmentProcessMeta = {
    name: 'waterTreatmentProcess',
    description: 'Water Treatment Processes',
    category: 'analytics',
    familyTags: ['water'],
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
