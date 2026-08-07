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
 * @module bioremediationKineticsModel
 * @description Bioremediation kinetics - first-order decay and Monod growth kinetics
 * for contaminant biodegradation modeling.
 *
 * Referências:
 * - Rittmann, B.E. & McCarty, P.L. (2001). Environmental Biotechnology: Principles
 *   and Applications. McGraw-Hill. ISBN 978-0-07-234553-2
 * - Monod, J. (1949). The Growth of Bacterial Cultures. Annual Review of Microbiology,
 *   3(1), 371–394. DOI:10.1146/annurev.mi.03.100149.002103
 * - OECD Test No. 301: Ready Biodegradability (2023). OECD Guidelines for the Testing
 *   of Chemicals. DOI:10.1787/9789264070349-en
 *
 * Cinética de Monod: μ = μmax × S / (Ks + S)
 * Decaimento de primeira ordem: C(t) = C0 × exp(−k × t)
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
 * Calcula a concentração residual de contaminante por decaimento de primeira ordem.
 * C(t) = C0 × exp(−k × t)
 *
 * @param C0 - Concentração inicial [mg/L ou μg/kg]
 * @param k  - Constante de decaimento de primeira ordem [1/dia]
 * @param t  - Tempo [dias]
 * @returns C_t em mesmas unidades de C0
 *
 * @example
 * calcFirstOrderDecay(100, 0.05, 30) // { C_t: 22.31, fractionRemaining: 0.2231, percentRemoved: 77.69 }
 */
export function calcFirstOrderDecay(
    C0: number,
    k: number,
    t: number,
): { C_t: number; fractionRemaining: number; percentRemoved: number } {
    if (typeof C0 !== 'number' || typeof k !== 'number' || typeof t !== 'number') {
        throw new TypeError('C0, k, t devem ser números.');
    }
    if (C0 < 0) throw new RangeError('C0 deve ser >= 0.');
    if (k < 0) throw new RangeError('k deve ser >= 0 (constante de decaimento).');
    if (t < 0) throw new RangeError('t deve ser >= 0.');

    const C_t = C0 * Math.exp(-k * t);
    const fractionRemaining = C_t / (C0 === 0 ? 1 : C0);
    const percentRemoved = (1 - fractionRemaining) * 100;

    return {
        C_t: parseFloat(C_t.toFixed(6)),
        fractionRemaining: parseFloat(fractionRemaining.toFixed(6)),
        percentRemoved: parseFloat(percentRemoved.toFixed(4)),
    };
}

/**
 * Calcula a taxa específica de crescimento microbiano pela cinética de Monod.
 * μ = μmax × S / (Ks + S)
 *
 * @param mu_max  - Taxa máxima de crescimento específico [1/dia]
 * @param S       - Concentração de substrato limitante [mg/L]
 * @param Ks      - Constante de meia-saturação [mg/L]
 * @returns mu em [1/dia]; saturationFraction = S/(Ks+S) ∈ [0,1]
 *
 * @example
 * calcMonodGrowth(2.0, 10, 5) // { mu: 1.3333, saturationFraction: 0.6667 }
 */
export function calcMonodGrowth(
    mu_max: number,
    S: number,
    Ks: number,
): { mu: number; saturationFraction: number } {
    if (typeof mu_max !== 'number' || typeof S !== 'number' || typeof Ks !== 'number') {
        throw new TypeError('mu_max, S, Ks devem ser números.');
    }
    if (mu_max <= 0) throw new RangeError('mu_max deve ser > 0.');
    if (S < 0) throw new RangeError('S (concentração de substrato) deve ser >= 0.');
    if (Ks <= 0) throw new RangeError('Ks deve ser > 0.');

    const saturationFraction = S / (Ks + S);
    const mu = mu_max * saturationFraction;

    return {
        mu: parseFloat(mu.toFixed(6)),
        saturationFraction: parseFloat(saturationFraction.toFixed(6)),
    };
}

/**
 * Calcula o tempo de meia-vida de um contaminante sob decaimento de primeira ordem.
 * t½ = ln(2) / k
 *
 * @param k - Constante de decaimento de primeira ordem [1/dia]
 * @returns halfLife em dias e horas
 *
 * @example
 * calcHalfLife(0.05) // { halfLife_days: 13.863, halfLife_hours: 332.71 }
 */
export function calcHalfLife(k: number): { halfLife_days: number; halfLife_hours: number } {
    if (typeof k !== 'number') throw new TypeError('k deve ser um número.');
    if (k <= 0) throw new RangeError('k deve ser > 0 para calcular meia-vida.');

    const halfLife_days = Math.LN2 / k;
    return {
        halfLife_days: parseFloat(halfLife_days.toFixed(4)),
        halfLife_hours: parseFloat((halfLife_days * 24).toFixed(3)),
    };
}

/**
 * Classifica biodegradabilidade pelo índice DBO5/DQO (OECD 301 / razão Zahn-Wellens).
 * Valores de referência: Metcalf & Eddy (2014) + OECD Test No. 301.
 *
 * @param ratio - Razão DBO5/DQO [adimensional, 0–1]
 * @returns classe de biodegradabilidade
 *
 * Limites:
 *   >= 0.4  → readily biodegradable
 *   >= 0.2  → moderately biodegradable
 *   >= 0.05 → slowly biodegradable
 *   <  0.05 → non-biodegradable
 *
 * @example
 * classifyBiodegradabilityBOD5_COD(0.45) // 'readily'
 * classifyBiodegradabilityBOD5_COD(0.08) // 'slowly'
 */
export function classifyBiodegradabilityBOD5_COD(
    ratio: number,
): 'readily' | 'moderately' | 'slowly' | 'non_biodegradable' {
    if (typeof ratio !== 'number') throw new TypeError('ratio deve ser um número.');
    if (ratio < 0 || ratio > 1) throw new RangeError('ratio DBO5/DQO deve estar entre 0 e 1.');

    if (ratio >= 0.4) return 'readily';
    if (ratio >= 0.2) return 'moderately';
    if (ratio >= 0.05) return 'slowly';
    return 'non_biodegradable';
}

/**
 * Calcula o tempo necessário para atingir uma concentração alvo via decaimento de 1ª ordem.
 * t = −ln(Ct/C0) / k
 *
 * @param C0     - Concentração inicial [mg/L]
 * @param Ct     - Concentração alvo [mg/L], deve ser < C0
 * @param k      - Constante de decaimento [1/dia]
 * @returns time em dias e percentual de redução
 */
export function calcTimeToTarget(
    C0: number,
    Ct: number,
    k: number,
): { time_days: number; reductionPercent: number } {
    if (typeof C0 !== 'number' || typeof Ct !== 'number' || typeof k !== 'number') {
        throw new TypeError('C0, Ct, k devem ser números.');
    }
    if (C0 <= 0) throw new RangeError('C0 deve ser > 0.');
    if (Ct <= 0 || Ct >= C0) throw new RangeError('Ct deve ser > 0 e < C0.');
    if (k <= 0) throw new RangeError('k deve ser > 0.');

    const time_days = -Math.log(Ct / C0) / k;
    const reductionPercent = ((C0 - Ct) / C0) * 100;

    return {
        time_days: parseFloat(time_days.toFixed(4)),
        reductionPercent: parseFloat(reductionPercent.toFixed(4)),
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const bioremediationKineticsModelMeta: AnalyticsModuleMeta = {
    name: 'bioremediationKineticsModel',
    description: 'bioremediationKineticsModel',
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
