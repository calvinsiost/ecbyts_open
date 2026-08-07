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
 * Chemical Mixture Risk Assessment - Hazard Quotient, Hazard Index, Toxic Unit.
 *
 * Módulo puro que implementa metodologias de avaliação de risco para misturas
 * químicas: quociente de perigo (HQ), índice de perigo (HI) e unidade tóxica (TU).
 * Baseado nas diretrizes USEPA e Könemann (1981) para aditividade de concentração.
 * Sem dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - USEPA (1989). Risk Assessment Guidance for Superfund, Vol. I:
 *     Human Health Evaluation Manual (Part A). EPA/540/1-89/002.
 *     (Definições de HQ e HI para avaliação de risco não-carcinogênico)
 *   - Könemann, H. (1981). Fish toxicity tests with mixtures of more than
 *     two chemicals: a proposal for a quantitative approach and experimental
 *     results. Toxicology, 19(3), 229-238.
 *     DOI: 10.1016/0300-483X(81)90130-9
 *     (Modelo de aditividade de concentração e unidade tóxica)
 *   - USEPA (2000). Supplementary Guidance for Conducting Health Risk Assessment
 *     of Chemical Mixtures. EPA/630/R-00/002.
 *     (Framework de avaliação de misturas com múltiplos compostos)
 *
 * @module chemicalMixtureRisk
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

/**
 * Compute Hazard Quotient for a single chemical.
 * Calcula o quociente de perigo para um único composto químico.
 *
 * HQ = exposure / NOEC
 * Onde NOEC (No Observed Effect Concentration) é a referência toxicológica.
 * HQ ≥ 1 indica potencial preocupação toxicológica para o receptor.
 *
 * @param exposure - Estimated exposure concentration (mg/kg·day or mg/L); must be ≥ 0
 * @param NOEC     - No Observed Effect Concentration (same units); must be > 0
 * @returns Hazard Quotient (dimensionless)
 * @throws {TypeError}  If inputs are not finite numbers
 * @throws {RangeError} If exposure < 0 or NOEC ≤ 0
 */
export function computeHazardQuotient(exposure: number, NOEC: number): { HQ: number } {
    if (typeof exposure !== 'number' || !isFinite(exposure)) {
        throw new TypeError('exposure must be a finite number');
    }
    if (typeof NOEC !== 'number' || !isFinite(NOEC)) {
        throw new TypeError('NOEC must be a finite number');
    }
    if (exposure < 0) {
        throw new RangeError('exposure must be ≥ 0');
    }
    if (NOEC <= 0) {
        throw new RangeError('NOEC must be > 0');
    }

    // HQ = exposição / referência toxicológica (adimensional)
    const HQ = exposure / NOEC;
    return { HQ };
}

/**
 * Compute Hazard Index for a chemical mixture assuming concentration additivity.
 * Calcula o índice de perigo para uma mistura química pela aditividade de concentração.
 *
 * HI = Σ HQ_i  (para compostos com mesmo mecanismo de ação)
 * Presunção conservadora: todos os compostos atuam aditivamente.
 * HI < 1 → sem preocupação; 1 ≤ HI < 10 → preocupação; HI ≥ 10 → inaceitável.
 *
 * @param HQs - Array of individual Hazard Quotients; length ≥ 1
 * @returns Hazard Index (dimensionless)
 * @throws {TypeError}  If HQs is not an array
 * @throws {RangeError} If array is empty or any HQ is negative
 */
export function computeHazardIndex(HQs: number[]): { HI: number } {
    if (!Array.isArray(HQs)) {
        throw new TypeError('HQs must be an array of numbers');
    }
    if (HQs.length === 0) {
        throw new RangeError('HQs must contain at least one value');
    }
    for (const hq of HQs) {
        if (typeof hq !== 'number' || !isFinite(hq)) {
            throw new TypeError('Each HQ must be a finite number');
        }
        if (hq < 0) {
            throw new RangeError('HQ values must be ≥ 0');
        }
    }

    // HI = soma de todos os quocientes de perigo individuais
    const HI = HQs.reduce((sum, hq) => sum + hq, 0);
    return { HI };
}

/**
 * Compute Toxic Unit for a single chemical in a mixture.
 * Calcula a unidade tóxica de um composto químico em uma mistura.
 *
 * TU = concentration / EC50
 * EC50: concentração que produz efeito em 50% dos organismos-teste.
 * Conceito de Könemann (1981): Σ TU = 1 na CEm de uma mistura aditiva.
 *
 * @param concentration - Measured or predicted concentration (mg/L); must be ≥ 0
 * @param EC50          - 50% Effect Concentration for the species (mg/L); must be > 0
 * @returns Toxic Unit (dimensionless)
 * @throws {TypeError}  If inputs are not finite numbers
 * @throws {RangeError} If concentration < 0 or EC50 ≤ 0
 */
export function computeToxicUnit(concentration: number, EC50: number): { TU: number } {
    if (typeof concentration !== 'number' || !isFinite(concentration)) {
        throw new TypeError('concentration must be a finite number');
    }
    if (typeof EC50 !== 'number' || !isFinite(EC50)) {
        throw new TypeError('EC50 must be a finite number');
    }
    if (concentration < 0) {
        throw new RangeError('concentration must be ≥ 0');
    }
    if (EC50 <= 0) {
        throw new RangeError('EC50 must be > 0');
    }

    // TU = concentração / CE50 (concentração de efeito em 50% dos organismos)
    const TU = concentration / EC50;
    return { TU };
}

/**
 * Classify mixture risk based on Hazard Index thresholds.
 * Classifica o risco da mistura química com base no índice de perigo.
 *
 * Critérios USEPA (1989) para risco não-carcinogênico:
 *   HI < 1   → acceptable  (sem preocupação significativa)
 *   1 ≤ HI < 10 → concern  (monitoramento e avaliação detalhada recomendados)
 *   HI ≥ 10  → unacceptable (intervenção obrigatória)
 *
 * @param HI - Hazard Index (dimensionless); must be ≥ 0
 * @returns Risk classification
 * @throws {TypeError}  If HI is not a finite number
 * @throws {RangeError} If HI < 0
 */
export function classifyMixtureRisk(HI: number): { risk: 'acceptable' | 'concern' | 'unacceptable' } {
    if (typeof HI !== 'number' || !isFinite(HI)) {
        throw new TypeError('HI must be a finite number');
    }
    if (HI < 0) {
        throw new RangeError('HI must be ≥ 0');
    }

    if (HI < 1) return { risk: 'acceptable' };
    if (HI < 10) return { risk: 'concern' };
    return { risk: 'unacceptable' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const chemicalMixtureRiskMeta: AnalyticsModuleMeta = {
    name: 'chemicalMixtureRisk',
    description: 'chemicalMixtureRisk',
    category: 'analytics',
    familyTags: ['chemical', 'risk'],
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
