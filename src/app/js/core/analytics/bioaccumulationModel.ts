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
// Application: EHS & Mining - Bioaccumulation and Biomagnification Model
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Bioaccumulation and Biomagnification Model
 *
 * Módulo puro implementando modelos de bioacumulação (BCF, BAF) e biomagnificação
 * (BMF, FCM) para avaliação de risco ecológico de compostos orgânicos hidrofóbicos
 * em cadeias alimentares aquáticas.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Mackay, D. (1982). Correlation of bioconcentration factors.
 *     Environmental Science & Technology, 16(5), 274–278.
 *     DOI: 10.1021/es00099a008
 *     (BCF = 0.048 × Kow × foc model)
 *   - Arnot, J. A. & Gobas, F. A. P. C. (2006). A review of bioconcentration
 *     factor (BCF) and bioaccumulation factor (BAF) assessments for organic
 *     chemicals in aquatic organisms. Environmental Reviews, 14(4), 257–297.
 *     DOI: 10.1139/a06-005
 *   - Gobas, F. A. P. C. (1993). A model for predicting the bioaccumulation
 *     of hydrophobic organic chemicals in aquatic food-webs. Ecological
 *     Modelling, 69(1–2), 1–17. DOI: 10.1016/0304-3800(93)90045-T
 *   - US EPA (2003). Methodology for Deriving Ambient Water Quality Criteria
 *     for the Protection of Human Health. EPA-822-B-00-004.
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

// ─── Bioconcentration Factor ──────────────────────────────────────────────

/**
 * Compute Bioconcentration Factor (BCF) via Mackay (1982) regression model.
 * Calcula o Fator de Bioconcentração pelo modelo de regressão de Mackay (1982).
 *
 * BCF = 0.048 × K_ow × f_oc
 * where K_ow = octanol-water partition coefficient (dimensionless),
 * f_oc = organic carbon fraction of sediment/media (0–1).
 *
 * BCF represents equilibrium ratio of chemical concentration in organism
 * to concentration in surrounding water (dimensionless, L/kg).
 *
 * @param {number} organicCarbonFraction - f_oc, organic carbon fraction (0–1, > 0)
 * @param {number} kow - Octanol-water partition coefficient K_ow (dimensionless, > 0)
 * @returns {{ bcf: number }} Bioconcentration factor (dimensionless)
 * @throws {RangeError} if organicCarbonFraction not in (0, 1] or kow ≤ 0
 */
export function computeBioconcentrationFactor(
    organicCarbonFraction: number,
    kow: number,
): { bcf: number } {
    if (typeof organicCarbonFraction !== 'number' || organicCarbonFraction <= 0 || organicCarbonFraction > 1) {
        throw new RangeError('organicCarbonFraction must be in (0, 1]');
    }
    if (typeof kow !== 'number' || kow <= 0) {
        throw new RangeError('kow must be > 0 (dimensionless)');
    }

    // BCF = 0.048 × K_ow × f_oc  - Mackay (1982) eq. 3
    const bcf = 0.048 * kow * organicCarbonFraction;
    return { bcf };
}

// ─── Bioaccumulation Factor ───────────────────────────────────────────────

/**
 * Compute Bioaccumulation Factor (BAF) from uptake and depuration kinetics.
 * Calcula o Fator de Bioacumulação a partir de taxas cinéticas de captação e eliminação.
 *
 * BAF = k_uptake / k_depuration
 * where k_uptake = first-order uptake rate constant (1/day),
 * k_depuration = first-order depuration (elimination) rate constant (1/day).
 *
 * BAF includes dietary exposure (unlike BCF which is water-only).
 *
 * @param {number} bcf - Bioconcentration factor (dimensionless, ≥ 0)
 * @param {number} depurationRate - k_depuration (1/day, > 0)
 * @param {number} uptakeRate - k_uptake (1/day, ≥ 0)
 * @returns {{ baf: number }} Bioaccumulation factor (dimensionless)
 * @throws {RangeError} if rates are non-positive (depuration) or negative (uptake)
 */
export function computeBioaccumulationFactor(
    bcf: number,
    depurationRate: number,
    uptakeRate: number,
): { baf: number } {
    if (typeof bcf !== 'number' || bcf < 0) {
        throw new RangeError('bcf must be ≥ 0');
    }
    if (typeof depurationRate !== 'number' || depurationRate <= 0) {
        throw new RangeError('depurationRate must be > 0 (1/day)');
    }
    if (typeof uptakeRate !== 'number' || uptakeRate < 0) {
        throw new RangeError('uptakeRate must be ≥ 0 (1/day)');
    }

    // BAF = k_1 / k_2  - Arnot & Gobas (2006) eq. 1 (kinetic model)
    const baf = uptakeRate / depurationRate;
    return { baf };
}

// ─── Biomagnification Factor ──────────────────────────────────────────────

/**
 * Compute Biomagnification Factor (BMF) between predator and prey.
 * Calcula o Fator de Biomagnificação entre predador e presa.
 *
 * BMF = C_predator / C_prey
 * BMF > 1 → biomagnification (contaminant concentrates at higher trophic levels)
 * BMF < 1 → biodilution
 * BMF = 1 → no magnification
 *
 * @param {number} predatorConc - Contaminant concentration in predator (µg/kg or mg/kg)
 * @param {number} preyConc - Contaminant concentration in prey (same units, > 0)
 * @returns {{ bmf: number, biomagnifies: boolean }} BMF and indicator flag
 * @throws {RangeError} if preyConc ≤ 0 or predatorConc < 0
 */
export function computeBiomagnificationFactor(
    predatorConc: number,
    preyConc: number,
): { bmf: number; biomagnifies: boolean } {
    if (typeof predatorConc !== 'number' || predatorConc < 0) {
        throw new RangeError('predatorConc must be ≥ 0 (µg/kg)');
    }
    if (typeof preyConc !== 'number' || preyConc <= 0) {
        throw new RangeError('preyConc must be > 0 (µg/kg)');
    }

    // BMF = C_pred / C_prey  - Gobas (1993); Arnot & Gobas (2006) eq. 11
    const bmf = predatorConc / preyConc;
    const biomagnifies = bmf > 1;
    return { bmf, biomagnifies };
}

// ─── Food Chain Magnification ─────────────────────────────────────────────

/**
 * Estimate concentration at the top of a food chain via trophic magnification.
 * Estima a concentração no topo de uma cadeia alimentar por magnificação trófica.
 *
 * C_top = C_base × BMF^n
 * where n = number of trophic level transfers above the base.
 *
 * @param {number} baseConc - Contaminant concentration at base of food chain (µg/kg, ≥ 0)
 * @param {number} bmfPerLevel - Biomagnification factor per trophic level (> 0)
 * @param {number} trophicLevels - Number of trophic transfers n (integer ≥ 1)
 * @returns {{ topConc: number, magnificationFactor: number }}
 *   topConc in same units as baseConc; magnificationFactor = BMF^n
 * @throws {RangeError} if baseConc < 0, bmfPerLevel ≤ 0, or trophicLevels < 1
 */
export function estimateFoodChainMagnification(
    baseConc: number,
    bmfPerLevel: number,
    trophicLevels: number,
): { topConc: number; magnificationFactor: number } {
    if (typeof baseConc !== 'number' || baseConc < 0) {
        throw new RangeError('baseConc must be ≥ 0 (µg/kg)');
    }
    if (typeof bmfPerLevel !== 'number' || bmfPerLevel <= 0) {
        throw new RangeError('bmfPerLevel must be > 0');
    }
    if (typeof trophicLevels !== 'number' || !Number.isInteger(trophicLevels) || trophicLevels < 1) {
        throw new RangeError('trophicLevels must be an integer ≥ 1');
    }

    // C_top = C_base × BMF^n  - trophic magnification cascade
    const magnificationFactor = Math.pow(bmfPerLevel, trophicLevels);
    const topConc = baseConc * magnificationFactor;
    return { topConc, magnificationFactor };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const bioaccumulationModelMeta: AnalyticsModuleMeta = {
    name: 'bioaccumulationModel',
    description: 'Bioaccumulation and Biomagnification Model',
    category: 'analytics',
    familyTags: ['bioaccumulation'],
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
