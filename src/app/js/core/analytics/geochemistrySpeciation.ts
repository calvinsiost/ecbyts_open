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
// Application: EHS & Mining - Geochemistry Speciation
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Geochemistry Speciation - Simplified Ionic Equilibrium
 *
 * Modulo puro para especiacao geoquimica simplificada: forca ionica,
 * coeficiente de atividade (equacao de Davies), indice de saturacao
 * e classificacao de facies geoquimicas (diagrama de Piper simplificado).
 * Zero dependencias de DOM, IDB, Three.js ou fetch.
 *
 * Referencias academicas:
 *   - Davies, C. W. (1938). The extent of dissociation of salts in water.
 *     Part VIII. Journal of the Chemical Society, 2093-2098.
 *     DOI: 10.1039/jr9380002093
 *     (equacao de Davies para coeficiente de atividade)
 *   - Piper, A. M. (1944). A graphic procedure in the geochemical
 *     interpretation of water analyses. Transactions, American Geophysical
 *     Union, 25(6), 914-928. DOI: 10.1029/TR025i006p00914
 *     (diagrama trilinear de Piper, classificacao de facies)
 *   - Stumm, W. & Morgan, J. J. (1996). Aquatic Chemistry: Chemical
 *     Equilibria and Rates in Natural Waters (3rd ed.). Wiley-Interscience.
 *     ISBN: 978-0-471-51185-4
 *     (forca ionica, produto de atividade ionica, indice de saturacao)
 *
 * @module geochemistrySpeciation
 */

'use strict';

// Constante de Debye-Huckel A = 0.509 para agua a 25 graus C
const DEBYE_HUCKEL_A = 0.509;

/**
 * Compute ionic strength of a solution.
 * Calcula a forca ionica I de uma solucao (mol/L).
 *
 * I = 0.5 * Sum(ci * zi^2)
 *
 * @param ions
 *   Array de ions com concentracao (mol/L) e carga ionica (inteiro).
 * @returns Forca ionica I (mol/L).
 * @throws {TypeError} Se ions nao for array valido.
 * @throws {RangeError} Se concentracao < 0.
 */
export function computeIonicStrength(ions: { concentration_mol_L: number; charge: number }[]): number {
    if (!Array.isArray(ions) || ions.length === 0) {
        throw new TypeError('ions must be a non-empty array');
    }
    let sum = 0;
    for (const ion of ions) {
        if (typeof ion.concentration_mol_L !== 'number' || !Number.isFinite(ion.concentration_mol_L)) {
            throw new TypeError('ion.concentration_mol_L must be a finite number');
        }
        if (typeof ion.charge !== 'number' || !Number.isFinite(ion.charge)) {
            throw new TypeError('ion.charge must be a finite number');
        }
        if (ion.concentration_mol_L < 0) throw new RangeError('ion.concentration_mol_L must be >= 0');
        sum += ion.concentration_mol_L * Math.pow(ion.charge, 2);
    }
    return 0.5 * sum;
}

/**
 * Compute activity coefficient via Davies equation.
 * Calcula o coeficiente de atividade gamma pela equacao de Davies.
 *
 * log10(gamma) = -A * z^2 * (sqrt(I)/(1+sqrt(I)) - 0.3*I)
 *
 * @param charge        - Carga ionica z (inteiro, positivo ou negativo).
 * @param ionicStrength - Forca ionica I (mol/L, >= 0).
 * @returns Coeficiente de atividade gamma (adimensional, 0–1).
 * @throws {RangeError} Se ionicStrength < 0.
 */
export function computeActivityCoefficient(charge: number, ionicStrength: number): number {
    if (typeof charge !== 'number' || !Number.isFinite(charge)) {
        throw new TypeError('charge must be a finite number');
    }
    if (typeof ionicStrength !== 'number' || !Number.isFinite(ionicStrength)) {
        throw new TypeError('ionicStrength must be a finite number');
    }
    if (ionicStrength < 0) throw new RangeError('ionicStrength must be >= 0');
    const sqrtI = Math.sqrt(ionicStrength);
    const logGamma = -DEBYE_HUCKEL_A * Math.pow(charge, 2) * (sqrtI / (1 + sqrtI) - 0.3 * ionicStrength);
    return Math.pow(10, logGamma);
}

/**
 * Compute Saturation Index for a mineral.
 * Calcula o Indice de Saturacao (SI) para um mineral.
 *
 * SI = log10(IAP / Ksp)
 *   SI > 0: supersaturado (precipitacao termodinamicamente favoravel)
 *   SI = 0: equilibrio
 *   SI < 0: insaturado (dissolucao termodinamicamente favoravel)
 *
 * @param ion_activity_product - Produto de atividade ionica IAP.
 * @param ksp                  - Produto de solubilidade Ksp.
 * @returns Indice de saturacao SI (adimensional).
 * @throws {RangeError} Se IAP ou Ksp <= 0.
 */
export function computeSaturationIndex(ion_activity_product: number, ksp: number): number {
    if (typeof ion_activity_product !== 'number' || !Number.isFinite(ion_activity_product)) {
        throw new TypeError('ion_activity_product must be a finite number');
    }
    if (typeof ksp !== 'number' || !Number.isFinite(ksp)) {
        throw new TypeError('ksp must be a finite number');
    }
    if (ion_activity_product <= 0) throw new RangeError('ion_activity_product must be > 0');
    if (ksp <= 0) throw new RangeError('ksp must be > 0');
    return Math.log10(ion_activity_product / ksp);
}

/**
 * Classify geochemical facies using a simplified Piper diagram approach.
 * Classifica as facies geoquimicas pelo diagrama de Piper simplificado.
 *
 * @param cations  - Cations em meq/L.
 * @param anions   - Anions em meq/L.
 * @returns Tipo de facies geoquimica.
 * @throws {TypeError} Se cations ou anions nao tiverem as propriedades corretas.
 * @throws {RangeError} Se qualquer valor < 0.
 */
export function classifyGeochemicalFacies(
    cations: { ca: number; mg: number; na_k: number },
    anions: { hco3: number; so4: number; cl: number },
): { facies: string } {
    const groups: Array<{ name: string; obj: Record<string, number>; keys: string[] }> = [
        { name: 'cations', obj: cations as Record<string, number>, keys: ['ca', 'mg', 'na_k'] },
        { name: 'anions', obj: anions as Record<string, number>, keys: ['hco3', 'so4', 'cl'] },
    ];
    for (const { name, obj, keys } of groups) {
        if (!obj || typeof obj !== 'object') throw new TypeError(name + ' must be an object');
        for (const k of keys) {
            if (typeof obj[k] !== 'number' || !Number.isFinite(obj[k])) {
                throw new TypeError(name + '.' + k + ' must be a finite number');
            }
            if (obj[k]! < 0) throw new RangeError(name + '.' + k + ' must be >= 0');
        }
    }

    const totalCations = cations.ca + cations.mg + cations.na_k;
    const totalAnions = anions.hco3 + anions.so4 + anions.cl;

    if (totalCations === 0 || totalAnions === 0) {
        return { facies: 'mixed' };
    }

    // Frações percentuais dos cations e anions dominantes
    const pctCa = cations.ca / totalCations;
    const pctNaK = cations.na_k / totalCations;
    const pctHco3 = anions.hco3 / totalAnions;
    const pctSo4 = anions.so4 / totalAnions;
    const pctCl = anions.cl / totalAnions;

    // Regras simplificadas de Piper:
    // Ca-HCO3: Ca dominante + HCO3 dominante
    // Na-Cl: Na+K dominante + Cl dominante
    // SO4-dominado: SO4 > 50% dos anions
    // Mixed: caso nenhum cation ou anion supere 50%

    const caDominant = pctCa >= 0.5;
    const naKDominant = pctNaK >= 0.5;
    const hco3Dominant = pctHco3 >= 0.5;
    const clDominant = pctCl >= 0.5;
    const so4Dominant = pctSo4 >= 0.5;

    if (caDominant && hco3Dominant) return { facies: 'calcium_bicarbonate' };
    if (naKDominant && clDominant) return { facies: 'sodium_chloride' };
    if (so4Dominant) return { facies: 'sulfate_dominated' };
    return { facies: 'mixed' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const geochemistrySpeciationMeta = {
    name: 'geochemistrySpeciation',
    description: 'Geochemistry Speciation',
    category: 'analytics',
    familyTags: ['geochemistry'],
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
