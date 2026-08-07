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
 * Ecotoxicology Model - CL50, SSD, BAF e classificação de risco ecotoxicológico.
 * Implementações baseadas em métodos estabelecidos de ecotoxicologia aquática.
 *
 * Referências:
 *   Finney, D.J. (1971). Probit Analysis, 3rd ed. Cambridge University Press.
 *     ISBN: 9780521080231
 *   Posthuma, L. et al. (2001). Species Sensitivity Distributions in Ecotoxicology.
 *     DOI: 10.1201/9781420032314
 *   Kelly, B.C. et al. (2007). Food Web–Specific Biomagnification of POPs.
 *     DOI: 10.1021/es0703589
 */

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
 * Calcula a estimativa de CL50 por regressão log-probit simplificada.
 * Método dos mínimos quadrados sobre dados de dose-resposta (Finney 1971).
 *
 * @param doses       - Concentrações em mg/L (valores positivos)
 * @param mortalities - Proporções de mortalidade [0, 1] para cada dose
 * @returns
 * @throws {TypeError}  se os argumentos não forem arrays de números
 * @throws {RangeError} se arrays tiverem comprimentos diferentes ou < 2 pontos
 */
export function computeLC50Estimate(
    doses: number[],
    mortalities: number[],
): { LC50_mg_L: number; slope: number } {
    if (!Array.isArray(doses) || !Array.isArray(mortalities)) {
        throw new TypeError('doses e mortalities devem ser arrays');
    }
    if (doses.length !== mortalities.length) {
        throw new RangeError('doses e mortalities devem ter o mesmo comprimento');
    }
    if (doses.length < 2) {
        throw new RangeError('São necessários pelo menos 2 pares dose-mortalidade');
    }
    for (let i = 0; i < doses.length; i++) {
        if (typeof doses[i] !== 'number' || typeof mortalities[i] !== 'number') {
            throw new TypeError('Todos os elementos devem ser números');
        }
        if (doses[i]! <= 0) {
            throw new RangeError(`Dose inválida em índice ${i}: deve ser positiva`);
        }
        if (mortalities[i]! < 0 || mortalities[i]! > 1) {
            throw new RangeError(`Mortalidade inválida em índice ${i}: deve estar em [0, 1]`);
        }
    }

    // Clampear mortalidades para evitar probit infinito (Finney 1971, cap. 3)
    const EPS = 0.001;
    const logDoses = doses.map((d) => Math.log10(d));
    const probits = mortalities.map((m) => {
        const mc = Math.max(EPS, Math.min(1 - EPS, m));
        return probitTransform(mc);
    });

    const n = logDoses.length;
    const meanLogD = logDoses.reduce((s, v) => s + v, 0) / n;
    const meanProbit = probits.reduce((s, v) => s + v, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
        const dx = logDoses[i]! - meanLogD;
        numerator += dx * (probits[i]! - meanProbit);
        denominator += dx * dx;
    }

    if (Math.abs(denominator) < 1e-15) {
        throw new RangeError('Denominador zero — todas as doses são idênticas');
    }

    const slope = numerator / denominator;
    const intercept = meanProbit - slope * meanLogD;
    // LC50: probit = 5 → log10(LC50) = (5 - intercept) / slope
    const logLC50 = (5 - intercept) / slope;
    const LC50_mg_L = Math.pow(10, logLC50);

    return { LC50_mg_L, slope };
}

/**
 * Transforma proporção em unidades probit (inverso da normal padrão + 5).
 * Aproximação numérica de Abramowitz & Stegun 26.2.17.
 * @param p - Proporção em (0, 1)
 * @returns valor probit
 */
function probitTransform(p: number): number {
    // Aproximação da inversa da normal padrão (Abramowitz & Stegun)
    const sign = p < 0.5 ? -1 : 1;
    const pp = p < 0.5 ? p : 1 - p;
    const t = Math.sqrt(-2 * Math.log(pp));
    const c0 = 2.515517,
        c1 = 0.802853,
        c2 = 0.010328;
    const d1 = 1.432788,
        d2 = 0.189269,
        d3 = 0.001308;
    const z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
    return 5 + sign * z; // probit = z + 5 (convenção Finney)
}

/**
 * Calcula a Distribuição de Sensibilidade de Espécies (SSD) e o HC5.
 * HC5 = 5º percentil da distribuição lognormal dos valores de CL50.
 * (Posthuma et al. 2001, DOI: 10.1201/9781420032314)
 *
 * @param LC50_values - Array de valores CL50 em mg/L (positivos)
 * @returns
 * @throws {TypeError}  se o argumento não for array de números
 * @throws {RangeError} se array tiver menos de 5 valores ou valores inválidos
 */
export function computeSpeciesSensitivityDistribution(
    LC50_values: number[],
): { SSD_HC5_mg_L: number; mean_log: number; std_log: number } {
    if (!Array.isArray(LC50_values)) {
        throw new TypeError('LC50_values deve ser um array');
    }
    if (LC50_values.length < 5) {
        throw new RangeError('SSD requer pelo menos 5 espécies para ser estatisticamente válida');
    }
    for (let i = 0; i < LC50_values.length; i++) {
        if (typeof LC50_values[i] !== 'number' || LC50_values[i]! <= 0) {
            throw new RangeError(`LC50_values[${i}] deve ser um número positivo`);
        }
    }

    const logVals = LC50_values.map((v) => Math.log10(v));
    const n = logVals.length;
    const mean_log = logVals.reduce((s, v) => s + v, 0) / n;
    const variance = logVals.reduce((s, v) => s + Math.pow(v - mean_log, 2), 0) / (n - 1);
    const std_log = Math.sqrt(variance);

    // HC5 = 10^(mean_log - 1.645 × std_log) - 5º percentil lognormal
    const SSD_HC5_mg_L = Math.pow(10, mean_log - 1.645 * std_log);

    return { SSD_HC5_mg_L, mean_log, std_log };
}

/**
 * Calcula o Fator de Bioconcentração/Bioacumulação (BAF).
 * BAF = Ctecido / Cágua (densidade tecidual = 1 kg/L assumida).
 * (Kelly et al. 2007, DOI: 10.1021/es0703589)
 *
 * @param tissue_concentration_mg_kg - Concentração no tecido em mg/kg
 * @param water_concentration_mg_L   - Concentração na água em mg/L
 * @returns
 * @throws {TypeError}  se argumentos não forem números
 * @throws {RangeError} se concentrações não forem positivas
 */
export function computeBioaccumulationFactor(
    tissue_concentration_mg_kg: number,
    water_concentration_mg_L: number,
): { BAF: number } {
    if (typeof tissue_concentration_mg_kg !== 'number' || typeof water_concentration_mg_L !== 'number') {
        throw new TypeError('tissue_concentration_mg_kg e water_concentration_mg_L devem ser números');
    }
    if (tissue_concentration_mg_kg <= 0) {
        throw new RangeError('tissue_concentration_mg_kg deve ser positivo');
    }
    if (water_concentration_mg_L <= 0) {
        throw new RangeError('water_concentration_mg_L deve ser positivo');
    }

    // BAF adimensional: mg/kg ÷ mg/L = L/kg (densidade=1 kg/L → adimensional)
    const BAF = tissue_concentration_mg_kg / water_concentration_mg_L;
    return { BAF };
}

/**
 * Classifica o risco ecotoxicológico com base na razão concentração/HC5.
 * Critérios baseados em avaliação de risco ecológico probabilística.
 *
 * @param concentration_mg_L - Concentração ambiental em mg/L
 * @param HC5_mg_L           - HC5 calculado pela SSD em mg/L
 * @returns
 * @throws {TypeError}  se argumentos não forem números
 * @throws {RangeError} se valores não forem positivos
 */
export function classifyEcotoxicologicalRisk(
    concentration_mg_L: number,
    HC5_mg_L: number,
): { risk: 'negligible' | 'low' | 'moderate' | 'high' } {
    if (typeof concentration_mg_L !== 'number' || typeof HC5_mg_L !== 'number') {
        throw new TypeError('concentration_mg_L e HC5_mg_L devem ser números');
    }
    if (concentration_mg_L < 0) {
        throw new RangeError('concentration_mg_L deve ser não-negativo');
    }
    if (HC5_mg_L <= 0) {
        throw new RangeError('HC5_mg_L deve ser positivo');
    }

    const ratio = concentration_mg_L / HC5_mg_L;
    let risk: 'negligible' | 'low' | 'moderate' | 'high';
    if (ratio < 0.01) {
        risk = 'negligible';
    } else if (ratio < 0.1) {
        risk = 'low';
    } else if (ratio < 1) {
        risk = 'moderate';
    } else {
        risk = 'high';
    }

    return { risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const ecoToxicologyModelMeta: AnalyticsModuleMeta = {
    name: 'ecoToxicologyModel',
    description: 'ecoToxicologyModel',
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
