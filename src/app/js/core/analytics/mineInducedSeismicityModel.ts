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
 * @module mineInducedSeismicityModel
 * @description Modelo de sismicidade induzida por mineração.
 * Implementa a lei de Gutenberg-Richter, estimativa de b-value por
 * máxima verossimilhança (Aki 1965), momento sísmico escalar (Hanks & Kanamori 1979)
 * e classificação de sismicidade por ISRM (2007).
 *
 * Referências acadêmicas:
 * - Gutenberg, B. & Richter, C.F. (1944). Frequency of earthquakes in California.
 *   Bulletin of the Seismological Society of America, 34(4), 185–188.
 *   https://doi.org/10.1785/BSSA0340040185
 * - Aki, K. (1965). Maximum likelihood estimate of b in the formula log N = a - bM
 *   and its confidence limits. Bulletin of the Earthquake Research Institute,
 *   University of Tokyo, 43, 237–239.
 * - Hanks, T.C. & Kanamori, H. (1979). A moment magnitude scale.
 *   Journal of Geophysical Research: Solid Earth, 84(B5), 2348–2350.
 *   https://doi.org/10.1029/JB084iB05p02348
 * - ISRM (2007). The Complete ISRM Suggested Methods for Rock Characterization,
 *   Testing and Monitoring: 1974–2006. Ulusay & Hudson (eds.). ISRM, Ankara.
 * - Mendecki, A.J. (1997). Seismic Monitoring in Mines. Chapman & Hall.
 *   ISBN 978-0412757105
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
 * Constante de Euler-Mascheroni implícita na derivação de Aki (1965):
 * b = log10(e) / (M_mean - M_min)
 */
const LOG10_E = Math.log10(Math.E);

/**
 * Estima b-value da relação de Gutenberg-Richter por máxima verossimilhança.
 *
 * Fórmula de Aki (1965):
 *   b = log10(e) / (M_mean - M_min)
 *
 * onde M_mean é a magnitude média e M_min é a magnitude mínima de completeza (cut-off).
 *
 * @param {number[]} magnitudes - Array de magnitudes observadas (ao menos 2 valores)
 * @returns {{ bValue: number, Mmean: number, Mmin: number, n: number, stderr: number }}
 *   bValue: estimativa de b por MLE
 *   Mmean: magnitude média
 *   Mmin: magnitude mínima (completeza)
 *   n: número de eventos
 *   stderr: erro padrão da estimativa (Aki 1965 Eq. 6): se = b/sqrt(n)
 */
export function calcGutenbergRichterBValue(
    magnitudes: number[],
): { bValue: number; Mmean: number; Mmin: number; n: number; stderr: number } {
    if (!Array.isArray(magnitudes) || magnitudes.length < 2) {
        throw new TypeError('magnitudes deve ser um array com ao menos 2 valores');
    }
    if (magnitudes.some((m) => typeof m !== 'number' || !isFinite(m))) {
        throw new TypeError('Todos os valores de magnitudes devem ser números finitos');
    }

    const n = magnitudes.length;
    const Mmin = Math.min(...magnitudes);
    const Mmean = magnitudes.reduce((s, m) => s + m, 0) / n;
    const deltaM = Mmean - Mmin;

    if (deltaM <= 0) {
        throw new RangeError('M_mean deve ser maior que M_min — todas as magnitudes são idênticas?');
    }

    const bValue = LOG10_E / deltaM;
    // Erro padrão: se = b / sqrt(n) - Aki (1965) Eq. 6
    const stderr = bValue / Math.sqrt(n);

    return { bValue, Mmean, Mmin, n, stderr };
}

/**
 * Calcula a taxa de eventos esperada (N) acima de magnitude limite M_threshold
 * pela relação de Gutenberg-Richter:
 *   log10(N) = a - b * M
 *   => N = 10^(a - b * M_threshold)
 *
 * @param {number} aValue      - Parâmetro 'a' de Gutenberg-Richter (atividade sísmica)
 * @param {number} bValue      - Parâmetro 'b' estimado, > 0
 * @param {number} M_threshold - Magnitude de limiar para contagem
 * @returns {{ expectedRate: number, log10N: number, M_threshold: number }}
 *   expectedRate: eventos esperados por período (mesmo período do ajuste original)
 */
export function calcExpectedRate(
    aValue: number,
    bValue: number,
    M_threshold: number,
): { expectedRate: number; log10N: number; M_threshold: number } {
    if (!isFinite(aValue)) throw new TypeError('aValue deve ser número finito');
    if (bValue <= 0) throw new RangeError('bValue deve ser positivo');
    if (!isFinite(M_threshold)) throw new TypeError('M_threshold deve ser número finito');

    const log10N = aValue - bValue * M_threshold;
    const expectedRate = Math.pow(10, log10N);

    return { expectedRate, log10N, M_threshold };
}

/**
 * Calcula o momento sísmico escalar M0 a partir da magnitude de momento Mw.
 *
 * Relação de Hanks & Kanamori (1979):
 *   M0 = 10^(1.5 * Mw + 9.1)  [N·m]
 *
 * @param {number} M - Magnitude de momento Mw
 * @returns {{ M0_Nm: number, M0_dyne_cm: number, M: number }}
 *   M0_Nm: momento sísmico em N·m (SI)
 *   M0_dyne_cm: momento sísmico em dyne·cm (cgs)
 */
export function calcSeismicMoment(M: number): { M0_Nm: number; M0_dyne_cm: number; M: number } {
    if (!isFinite(M)) throw new TypeError('M deve ser número finito');
    if (M < -4 || M > 10) {
        throw new RangeError('M deve estar no intervalo razoável [-4, 10]');
    }

    const M0_Nm = Math.pow(10, 1.5 * M + 9.1);
    const M0_dyne_cm = M0_Nm * 1e7; // 1 N·m = 10^7 dyne·cm

    return { M0_Nm, M0_dyne_cm, M };
}

/**
 * Classifica sismicidade de minas por faixas de magnitude segundo ISRM (2007)
 * e Mendecki (1997).
 *
 * Classes:
 *   micro    : M < 0.0  - microsismicidade; tipicamente detectável apenas por geofones locais
 *   minor    : 0 <= M < 2.0 - eventos menores; poucas vezes sentidos
 *   moderate : 2 <= M < 4.0 - eventos moderados; podem causar danos a suporte de rocha
 *   strong   : M >= 4.0 - eventos fortes; risco de colapso e danos estruturais
 *
 * @param {number} magnitude - Magnitude Mw ou local ML
 * @returns {{ seismicClass: string, description: string, riskLevel: string }}
 */
export function classifyMineSeismicity(
    magnitude: number,
): { seismicClass: string; description: string; riskLevel: string } {
    if (!isFinite(magnitude)) throw new TypeError('magnitude deve ser número finito');

    if (magnitude < 0) {
        return {
            seismicClass: 'micro',
            description: 'Microsismicidade — detectável apenas por instrumentação local',
            riskLevel: 'negligible',
        };
    }
    if (magnitude < 2.0) {
        return {
            seismicClass: 'minor',
            description: 'Evento menor — raramente sentido; monitoramento de tendência necessário',
            riskLevel: 'low',
        };
    }
    if (magnitude < 4.0) {
        return {
            seismicClass: 'moderate',
            description: 'Evento moderado — pode danificar suporte de rocha; reavaliação de projeto necessária',
            riskLevel: 'moderate',
        };
    }
    return {
        seismicClass: 'strong',
        description: 'Evento forte — risco de colapso e danos estruturais; evacuação e inspeção imediatas',
        riskLevel: 'high',
    };
}

/**
 * Estima parâmetro 'a' da relação de Gutenberg-Richter a partir de catálogo de eventos.
 *
 * log10(N_total) = a - b * M_min
 * => a = log10(N_total) + b * M_min
 *
 * @param {number[]} magnitudes - Array de magnitudes observadas
 * @param {number}   bValue     - b-value estimado (e.g. via calcGutenbergRichterBValue)
 * @returns {{ aValue: number, N_total: number, Mmin: number }}
 */
export function calcGutenbergRichterAValue(
    magnitudes: number[],
    bValue: number,
): { aValue: number; N_total: number; Mmin: number } {
    if (!Array.isArray(magnitudes) || magnitudes.length < 1) {
        throw new TypeError('magnitudes deve ser um array não vazio');
    }
    if (bValue <= 0) throw new RangeError('bValue deve ser positivo');

    const Mmin = Math.min(...magnitudes);
    const N_total = magnitudes.length;
    const aValue = Math.log10(N_total) + bValue * Mmin;

    return { aValue, N_total, Mmin };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineInducedSeismicityModelMeta: AnalyticsModuleMeta = {
    name: 'mineInducedSeismicityModel',
    description: 'mineInducedSeismicityModel',
    category: 'analytics',
    familyTags: ['mining', 'seismic'],
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
