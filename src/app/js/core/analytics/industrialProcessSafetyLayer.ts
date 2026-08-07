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
// Application: EHS & Mining - Industrial Process Safety (SIL/IEC 61511)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Process Safety Layer - SIL Assessment per IEC 61511
 *
 * Módulo puro implementando avaliação de nível de integridade de segurança (SIL)
 * conforme IEC 61511-1:2016, incluindo cálculo de PFDavg por loop de segurança
 * instrumentado (SIL), fator de redução de risco (RRF) e classificação SIL 1-4.
 * Aplicável a sistemas de segurança em processo industrial (SIS/ESD/F&G).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - IEC 61511-1:2016. "Functional Safety - Safety Instrumented Systems for
 *     the Process Industry Sector - Part 1: Framework, Definitions, System,
 *     Hardware and Application Programming Requirements." Geneva: IEC.
 *   - Lees, F. P. (2012). "Loss Prevention in the Process Industries: Hazard
 *     Identification, Assessment and Control." 4th ed. Butterworth-Heinemann.
 *     ISBN: 978-0-12-397189-0
 *   - Smith, D. J., & Simpson, K. G. L. (2010). "The Safety Critical Systems
 *     Handbook." 3rd ed. Butterworth-Heinemann. ISBN: 978-0-08-096781-3
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
 * Tabela de limites de PFDavg por nível SIL conforme IEC 61511-1 Tabela 3.
 * Chave = SIL (1-4), valor = { pfdMin, pfdMax } (limites superior e inferior).
 * Nota: SIL 4 raramente aplicável em processos; exige validação especial.
 * @type {Readonly<Record<number, { pfdMin: number, pfdMax: number }>>}
 */
const SIL_PFD_LIMITS: Readonly<Record<number, { pfdMin: number; pfdMax: number }>> = Object.freeze({
    1: { pfdMin: 1e-2, pfdMax: 1e-1 },
    2: { pfdMin: 1e-3, pfdMax: 1e-2 },
    3: { pfdMin: 1e-4, pfdMax: 1e-3 },
    4: { pfdMin: 1e-5, pfdMax: 1e-4 },
});

/**
 * Calcula o PFDavg (Probability of Failure on Demand, average) de um loop SIS
 * utilizando a aproximação analítica para sistema 1oo1 (um de um).
 * Incorpora falhas de teste periódico (proof-test), falhas perigosas não detectadas
 * e intervalo de teste conforme IEC 61511-1 §11.
 *
 * PFDavg ≈ λDU * TI / 2 + λDD * MTTR / 2 (aproximação IEC 61511 para 1oo1)
 *
 * @param {number} lambdaDU  - Taxa de falha perigosa não detectada (h⁻¹)
 * @param {number} lambdaDD  - Taxa de falha perigosa detectada (h⁻¹)
 * @param {number} ti        - Intervalo de teste (proof-test interval) em horas
 * @param {number} mttr      - Mean Time To Repair após falha detectada (h)
 * @returns {number} PFDavg do loop (adimensional)
 * @throws {RangeError} Se qualquer parâmetro for negativo
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function calcPFDavg(lambdaDU: number, lambdaDD: number, ti: number, mttr: number): number {
    for (const [name, val] of [
        ['lambdaDU', lambdaDU],
        ['lambdaDD', lambdaDD],
        ['ti', ti],
        ['mttr', mttr],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
        if (val < 0) throw new RangeError(`${name} deve ser >= 0; recebido: ${val}`);
    }

    // Componente de falha não detectada: acumula entre testes periódicos
    const pfdDU = (lambdaDU * ti) / 2;

    // Componente de falha detectada: acumula durante o tempo de reparo
    const pfdDD = (lambdaDD * mttr) / 2;

    return pfdDU + pfdDD;
}

/**
 * Calcula o fator de redução de risco (RRF) de um sistema SIS a partir do PFDavg.
 * RRF = 1 / PFDavg - relação inversa fundamental da IEC 61511.
 * Um SIL 2 com PFDavg = 5e-3 equivale a RRF = 200 (reduz o risco 200×).
 *
 * @param {number} pfdAvg - PFDavg do sistema (adimensional, > 0)
 * @returns {number} Fator de redução de risco (RRF)
 * @throws {RangeError} Se pfdAvg <= 0 ou > 1
 * @throws {TypeError} Se pfdAvg não for número finito
 */
export function calcRiskReductionFactor(pfdAvg: number): number {
    if (typeof pfdAvg !== 'number' || !Number.isFinite(pfdAvg)) {
        throw new TypeError(`pfdAvg deve ser número finito; recebido: ${pfdAvg}`);
    }
    if (pfdAvg <= 0 || pfdAvg > 1) {
        throw new RangeError(`pfdAvg deve estar em (0, 1]; recebido: ${pfdAvg}`);
    }
    return 1 / pfdAvg;
}

/**
 * Determina o SIL requerido a partir da frequência de demanda tolerável e
 * da frequência de evento perigoso sem SIS.
 * SIL = ceil(-log10(RRF_required)) onde RRF_required = fUnmitigated / fTolerable.
 *
 * @param {number} fUnmitigated - Frequência do evento perigoso sem SIS (eventos/ano)
 * @param {number} fTolerable   - Frequência de risco tolerável (eventos/ano)
 * @returns {{ sil: number | null, rrfRequired: number, pfdRequired: number }} SIL e parâmetros derivados
 * @throws {RangeError} Se fUnmitigated <= fTolerable ou qualquer valor <= 0
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function calcRequiredSIL(
    fUnmitigated: number,
    fTolerable: number,
): { sil: number | null; rrfRequired: number; pfdRequired: number } {
    for (const [name, val] of [
        ['fUnmitigated', fUnmitigated],
        ['fTolerable', fTolerable],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
        if (val <= 0) throw new RangeError(`${name} deve ser > 0; recebido: ${val}`);
    }
    if (fUnmitigated <= fTolerable) {
        throw new RangeError(
            `fUnmitigated (${fUnmitigated}) deve ser maior que fTolerable (${fTolerable}) para requerer SIS`,
        );
    }

    // RRF requerido e PFD equivalente necessário
    const rrfRequired = fUnmitigated / fTolerable;
    const pfdRequired = 1 / rrfRequired;

    // SIL mínimo que cobre o PFD requerido
    let sil: number | null = null;
    for (const level of [1, 2, 3, 4]) {
        if (pfdRequired >= SIL_PFD_LIMITS[level]!.pfdMin && pfdRequired < SIL_PFD_LIMITS[level]!.pfdMax) {
            sil = level;
            break;
        }
    }
    // PFD abaixo de SIL 4 mínimo: além do escopo normal de processo
    if (pfdRequired < SIL_PFD_LIMITS[4]!.pfdMin) sil = null;

    return { sil, rrfRequired, pfdRequired };
}

/**
 * Classifica o nível de integridade de segurança (SIL) a partir do PFDavg calculado.
 * Retorna o SIL correspondente e avaliação qualitativa conforme IEC 61511-1 Tabela 3.
 *
 * @param {number} pfdAvg - PFDavg do sistema (adimensional)
 * @returns {{ sil: number | string, pfdAvg: number, rrf: number, label: string }} Classificação SIL
 * @throws {RangeError} Se pfdAvg <= 0 ou > 1
 * @throws {TypeError} Se pfdAvg não for número finito
 */
export function classifySafetyIntegrityLevel(
    pfdAvg: number,
): { sil: number | string; pfdAvg: number; rrf: number; label: string } {
    if (typeof pfdAvg !== 'number' || !Number.isFinite(pfdAvg)) {
        throw new TypeError(`pfdAvg deve ser número finito; recebido: ${pfdAvg}`);
    }
    if (pfdAvg <= 0 || pfdAvg > 1) {
        throw new RangeError(`pfdAvg deve estar em (0, 1]; recebido: ${pfdAvg}`);
    }

    const rrf = 1 / pfdAvg;

    for (const level of [4, 3, 2, 1]) {
        const { pfdMin, pfdMax } = SIL_PFD_LIMITS[level]!;
        if (pfdAvg >= pfdMin && pfdAvg < pfdMax) {
            return { sil: level, pfdAvg, rrf, label: `SIL ${level} — RRF ${pfdMin}⁻¹ a ${pfdMax}⁻¹` };
        }
    }

    // Abaixo de SIL 1 mínimo (PFD >= 0.1): sem integridade de segurança formal
    if (pfdAvg >= 0.1) {
        return { sil: 'NO_SIL', pfdAvg, rrf, label: 'Sem SIL — PFD >= 0.1, RRF < 10' };
    }

    // Acima de SIL 4 (PFD < 1e-5): demanda análise especial
    return { sil: 'SIL4+', pfdAvg, rrf, label: 'Além de SIL 4 — requer validação especial IEC 61511-1 §11.9' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialProcessSafetyLayerMeta: AnalyticsModuleMeta = {
    name: 'industrialProcessSafetyLayer',
    description: 'Industrial Process Safety (SIL/IEC 61511)',
    category: 'analytics',
    familyTags: ['industrial', 'risk'],
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
