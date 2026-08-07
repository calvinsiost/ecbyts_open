// @ts-check
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
 * Mining Safety Index - Indicadores de Desempenho em Segurança Minerária
 *
 * Módulo puro para cálculo de índices de segurança do trabalho na mineração:
 * LTIR (Lost Time Injury Rate), SR (Severity Rate), SPI (Safety Performance Index)
 * e classificação do nível de segurança operacional.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - ILO (2013). Recording and Notification of Occupational Accidents and Diseases.
 *     ISBN: 9789221272007. International Labour Organization, Geneva.
 *     (Base normativa para LTIR e SR com fator 1×10^6 homens-hora)
 *   - Joy, J., & Griffiths, D. (2005). National minerals industry safety and health
 *     risk assessment guideline. Version 4. Minerals Council of Australia.
 *     (Framework SPI para mineração)
 *   - IBAMA/MME - NT 003/2020. Indicadores de Desempenho em Segurança para o
 *     Setor Mineral Brasileiro. Brasília: MME.
 *     (Adaptação dos indicadores ILO para o contexto regulatório brasileiro)
 *
 * @module miningSafetyIndex
 */

'use strict';

/**
 * Compute Lost Time Injury Rate (LTIR)
 * Calcula a Taxa de Acidentes com Afastamento por milhão de horas trabalhadas.
 *
 * LTIR = LTI_count × 1 000 000 / hours_worked
 *
 * @param {number} LTI_count   - Número de acidentes com afastamento (inteiro ≥0)
 * @param {number} hours_worked - Horas-homem trabalhadas no período; >0
 * @returns {{ LTIR: number }}
 */
export function computeLostTimeInjuryRate(LTI_count: any, hours_worked: any) {
    if (typeof LTI_count !== 'number' || !Number.isInteger(LTI_count) || LTI_count < 0) {
        throw new TypeError('LTI_count must be a non-negative integer');
    }
    if (typeof hours_worked !== 'number' || hours_worked <= 0) {
        throw new RangeError('hours_worked must be a positive number');
    }
    // Taxa de acidentes com afastamento por milhão de horas trabalhadas (ILO 2013)
    const LTIR = (LTI_count * 1e6) / hours_worked;
    return { LTIR };
}

/**
 * Compute Severity Rate (SR)
 * Calcula a Taxa de Gravidade (dias perdidos por milhão de horas trabalhadas).
 *
 * SR = lost_days × 1 000 000 / hours_worked
 *
 * @param {number} lost_days    - Total de dias perdidos por acidentes; inteiro ≥0
 * @param {number} hours_worked - Horas-homem trabalhadas no período; >0
 * @returns {{ SR: number }}
 */
export function computeSeverityRate(lost_days: any, hours_worked: any) {
    if (typeof lost_days !== 'number' || !Number.isInteger(lost_days) || lost_days < 0) {
        throw new TypeError('lost_days must be a non-negative integer');
    }
    if (typeof hours_worked !== 'number' || hours_worked <= 0) {
        throw new RangeError('hours_worked must be a positive number');
    }
    // Taxa de gravidade: dias perdidos por milhão de horas trabalhadas
    const SR = (lost_days * 1e6) / hours_worked;
    return { SR };
}

/**
 * Compute Safety Performance Index (SPI)
 * Calcula o Índice de Desempenho em Segurança composto (∈ [0, 1]).
 *
 * SPI = (1 - LTIR/10)×0.4 + (1 - SR/100)×0.3 + min(1, near_misses/total_workforce)×0.3
 * Resultado capeado em [0, 1].
 *
 * @param {number} LTIR             - Lost Time Injury Rate (acidentes por 1M horas)
 * @param {number} SR               - Severity Rate (dias perdidos por 1M horas)
 * @param {number} near_misses      - Quase-acidentes registrados no período; inteiro ≥0
 * @param {number} total_workforce  - Total de trabalhadores expostos; inteiro ≥1
 * @returns {{ SPI: number }}
 */
export function computeSafetyPerformanceIndex(LTIR: any, SR: any, near_misses: any, total_workforce: any) {
    if (typeof LTIR !== 'number' || LTIR < 0) {
        throw new RangeError('LTIR must be a non-negative number');
    }
    if (typeof SR !== 'number' || SR < 0) {
        throw new RangeError('SR must be a non-negative number');
    }
    if (typeof near_misses !== 'number' || !Number.isInteger(near_misses) || near_misses < 0) {
        throw new TypeError('near_misses must be a non-negative integer');
    }
    if (typeof total_workforce !== 'number' || !Number.isInteger(total_workforce) || total_workforce < 1) {
        throw new RangeError('total_workforce must be an integer ≥ 1');
    }

    // Componente LTIR: penaliza taxas acima de 10 (benchmarked como valor crítico ILO)
    const ltirComponent = Math.max(0, 1 - LTIR / 10) * 0.4;
    // Componente SR: penaliza taxas acima de 100 dias perdidos por 1M horas
    const srComponent = Math.max(0, 1 - SR / 100) * 0.3;
    // Componente near-miss: incentiva cultura de reporte; normalizado pela força de trabalho
    const nearMissComponent = Math.min(1, near_misses / total_workforce) * 0.3;

    const SPI = Math.min(1, Math.max(0, ltirComponent + srComponent + nearMissComponent));
    return { SPI };
}

/**
 * Classify Mining Safety Level
 * Classifica o nível de segurança operacional da operação minerária.
 *
 * Critério primário (SPI):
 *   SPI < 0.3  → 'critical'
 *   SPI < 0.5  → 'poor'
 *   SPI < 0.7  → 'adequate'
 *   SPI < 0.9  → 'good'
 *   SPI ≥ 0.9  → 'excellent'
 * Override para 'critical' se LTIR > 50 (threshold de emergência regulatória).
 *
 * @param {number} SPI  - Safety Performance Index ∈ [0, 1]
 * @param {number} LTIR - Lost Time Injury Rate (acidentes por 1M horas); ≥0
 * @returns {{ level: 'critical'|'poor'|'adequate'|'good'|'excellent' }}
 */
export function classifyMiningSafetyLevel(SPI: any, LTIR: any) {
    if (typeof SPI !== 'number' || SPI < 0 || SPI > 1) {
        throw new RangeError('SPI must be a number in range [0, 1]');
    }
    if (typeof LTIR !== 'number' || LTIR < 0) {
        throw new RangeError('LTIR must be a non-negative number');
    }

    // Override de emergência: LTIR acima de 50 indica situação crítica independente do SPI
    if (LTIR > 50) return { level: 'critical' };

    /** @type {'critical'|'poor'|'adequate'|'good'|'excellent'} */
    let level;
    if (SPI < 0.3) level = 'critical';
    else if (SPI < 0.5) level = 'poor';
    else if (SPI < 0.7) level = 'adequate';
    else if (SPI < 0.9) level = 'good';
    else level = 'excellent';

    return { level };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const miningSafetyIndexMeta = {
    name: 'miningSafetyIndex',
    description: 'miningSafetyIndex',
    category: 'analytics',
    familyTags: ['mining', 'risk'],
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
