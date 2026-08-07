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
// Application: EHS & Mining - Chemical Mixture Toxicity
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Chemical Mixture Toxicity - CA, IA, Synergy Index & GHS Classification
 *
 * Módulo puro para avaliação de toxicidade de misturas químicas:
 * Concentration Addition (Berenbaum 1985), Independent Action (Bliss 1939),
 * índice de sinergia e classificação GHS Rev.9 (2021).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References:
 *   - Berenbaum, M.C. (1985). The expected effect of a combination of agents:
 *     the general solution. J. Theor. Biol., 114(3), 413–431.
 *     DOI: 10.1016/S0022-5193(85)80176-4
 *   - Bliss, C.I. (1939). The toxicity of poisons applied jointly.
 *     Ann. Appl. Biol., 26(3), 585–615.
 *     DOI: 10.1111/j.1744-7348.1939.tb06990.x
 *   - GHS Rev.9 (2021). Globally Harmonized System of Classification and
 *     Labelling of Chemicals. UN, New York/Geneva. ISBN 978-92-1-117205-5.
 *   - ECHA (2017). Guidance on the Application of the CLP Criteria.
 *     Section 3.1 (Mixtures, Aquatic Toxicity).
 *
 * @module chemicalMixtureToxicity
 */

'use strict';

/** Synergism threshold: SI > 1.5 indicates synergism */
const SYNERGISM_THRESHOLD = 1.5;

/** Antagonism threshold: SI < 0.67 indicates antagonism */
const ANTAGONISM_THRESHOLD = 0.67;

/** GHS acute aquatic toxicity LC50 boundaries (mg/L) — GHS Rev.9 Table 4.1.1 */
const GHS_BOUNDARIES: { category: 1 | 2 | 3 | 4; maxLC50: number }[] = [
    { category: 1, maxLC50: 1 },
    { category: 2, maxLC50: 10 },
    { category: 3, maxLC50: 100 },
    { category: 4, maxLC50: 1000 },
];

/** MTI level thresholds for mtiLevel classification */
const MTI_LEVELS: { level: string; minMti: number }[] = [
    { level: 'high', minMti: 1.0 },
    { level: 'moderate', minMti: 0.5 },
    { level: 'low', minMti: 0.1 },
];

/**
 * Computes the Mixture Toxicity Index (MTI) using the Concentration Addition
 * (CA) model (Berenbaum 1985).
 *
 * MTI = Σ (c_i / EC50_i)
 * MTI < 1 → below expected effect; MTI ≥ 1 → effect expected.
 *
 * Calcula o MTI pelo modelo de adição de concentrações (Berenbaum 1985).
 *
 * @param components
 *   Array of mixture components with observed concentration and EC50.
 * @throws {TypeError|RangeError} on invalid inputs
 */
export function computeConcentrationAddition(
    components: { concentration: number; ec50: number }[],
): { mti: number; effectExpected: boolean } {
    if (!Array.isArray(components) || components.length === 0) {
        throw new TypeError('components must be a non-empty array');
    }

    // MTI = Σ(ci / ECi) - soma das frações de efeito de cada componente
    let mti = 0;
    for (const [i, comp] of components.entries()) {
        if (typeof comp.concentration !== 'number' || comp.concentration < 0) {
            throw new RangeError(`components[${i}].concentration must be a non-negative number`);
        }
        if (typeof comp.ec50 !== 'number' || comp.ec50 <= 0) {
            throw new RangeError(`components[${i}].ec50 must be a positive number`);
        }
        mti += comp.concentration / comp.ec50;
    }

    return {
        mti,
        effectExpected: mti >= 1,
    };
}

/**
 * Computes the combined effect of a mixture using the Independent Action
 * (IA) model (Bliss 1939), assuming statistical independence of mechanisms.
 *
 * E_mix = 1 − Π(1 − E_i)
 *
 * Calcula efeito combinado pelo modelo de ação independente (Bliss 1939).
 *
 * @param components
 *   Array of components with individual effect fractions (0–1).
 * @throws {TypeError|RangeError} on invalid inputs
 */
export function computeIndependentAction(components: { effectFraction: number }[]): { combinedEffect: number } {
    if (!Array.isArray(components) || components.length === 0) {
        throw new TypeError('components must be a non-empty array');
    }

    // E_mix = 1 − Π(1 − Ei) - produto das probabilidades de não-efeito
    let product = 1;
    for (const [i, comp] of components.entries()) {
        if (typeof comp.effectFraction !== 'number' || comp.effectFraction < 0 || comp.effectFraction > 1) {
            throw new RangeError(`components[${i}].effectFraction must be in range [0, 1]`);
        }
        product *= 1 - comp.effectFraction;
    }

    const combinedEffect = 1 - product;
    return { combinedEffect };
}

/**
 * Computes the Synergy Index (SI) comparing observed effect to the minimum
 * predicted by CA and IA models.
 *
 * SI = observedEffect / min(caEffect, iaEffect)
 * SI > 1.5 → synergism; SI < 0.67 → antagonism; otherwise additive.
 *
 * Calcula o índice de sinergia comparando efeito observado ao previsto pelos modelos.
 *
 * @param observedEffect - Observed combined effect fraction (0–1)
 * @param caEffect       - CA model predicted effect (0–1)
 * @param iaEffect       - IA model predicted effect (0–1)
 * @throws {RangeError} on invalid inputs
 */
export function computeSynergyIndex(
    observedEffect: number,
    caEffect: number,
    iaEffect: number,
): { si: number; interaction: 'synergism' | 'antagonism' | 'additive' } {
    if (typeof observedEffect !== 'number' || observedEffect < 0 || observedEffect > 1) {
        throw new RangeError('observedEffect must be in range [0, 1]');
    }
    if (typeof caEffect !== 'number' || caEffect < 0 || caEffect > 1) {
        throw new RangeError('caEffect must be in range [0, 1]');
    }
    if (typeof iaEffect !== 'number' || iaEffect < 0 || iaEffect > 1) {
        throw new RangeError('iaEffect must be in range [0, 1]');
    }

    // Referência = menor previsão dos dois modelos (conservador)
    const referenceEffect = Math.min(caEffect, iaEffect);

    // Evitar divisão por zero quando ambos os modelos preveem efeito nulo
    if (referenceEffect === 0) {
        const si = observedEffect === 0 ? 1 : Infinity;
        return { si, interaction: si > SYNERGISM_THRESHOLD ? 'synergism' : 'additive' };
    }

    const si = observedEffect / referenceEffect;

    let interaction: 'synergism' | 'antagonism' | 'additive';
    if (si > SYNERGISM_THRESHOLD) {
        interaction = 'synergism';
    } else if (si < ANTAGONISM_THRESHOLD) {
        interaction = 'antagonism';
    } else {
        interaction = 'additive';
    }

    return { si, interaction };
}

/**
 * Classifies mixture toxicity using GHS Rev.9 (2021) acute aquatic toxicity
 * categories based on LC50 and the MTI level.
 *
 * GHS categories by LC50 (mg/L): Cat.1 <1; Cat.2 <10; Cat.3 <100; Cat.4 <1000.
 * MTI levels: high ≥1.0; moderate ≥0.5; low ≥0.1; no_effect <0.1.
 *
 * Classifica toxicidade da mistura por GHS Rev.9 e nível de MTI.
 *
 * @param mti             - Mixture Toxicity Index (>= 0)
 * @param acuteToxicity   - Acute toxicity LC50 (mg/L); > 0
 * @throws {RangeError} on invalid inputs
 */
export function classifyMixtureToxicity(
    mti: number,
    acuteToxicity: number,
): { ghsCategory: 1 | 2 | 3 | 4 | 'none'; mtiLevel: string } {
    if (typeof mti !== 'number' || mti < 0) {
        throw new RangeError('mti must be a non-negative number');
    }
    if (typeof acuteToxicity !== 'number' || acuteToxicity <= 0) {
        throw new RangeError('acuteToxicity must be a positive number');
    }

    // Classificação GHS por categoria de toxicidade aguda aquática (LC50, mg/L)
    let ghsCategory: 1 | 2 | 3 | 4 | 'none' = 'none';
    for (const { category, maxLC50 } of GHS_BOUNDARIES) {
        if (acuteToxicity < maxLC50) {
            ghsCategory = category as 1 | 2 | 3 | 4;
            break;
        }
    }

    // Nível de MTI para comunicação de risco
    let mtiLevel: string = 'no_effect';
    for (const { level, minMti } of MTI_LEVELS) {
        if (mti >= minMti) {
            mtiLevel = level;
            break;
        }
    }

    return { ghsCategory, mtiLevel };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const chemicalMixtureToxicityMeta = {
    name: 'chemicalMixtureToxicity',
    description: 'Chemical Mixture Toxicity',
    category: 'analytics',
    familyTags: ['chemical'],
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
