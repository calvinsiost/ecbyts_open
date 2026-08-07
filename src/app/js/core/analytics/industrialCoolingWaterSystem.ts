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
// Application: EHS & Mining - Industrial Cooling Water Systems
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Cooling Water System - Water Balance Module
 *
 * Módulo puro implementando o balanço hídrico de torres de resfriamento
 * industriais: ciclos de concentração (COC), fluxo de reposição (makeup),
 * taxa de purga (blowdown) e classificação de desempenho do sistema.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - ASHRAE (2020). "HVAC Systems and Equipment Handbook." Chapter 40:
 *     Cooling Towers. ASHRAE, Atlanta, GA. ISBN 978-1-939200-87-8.
 *     (balanço de massa, ciclos de concentração, makeup water)
 *   - Puckorius, P. R. & Brooke, G. D. (1991). "Controlling Deposits in
 *     Cooling Water Systems." Cooling Tower Institute Paper TP-91-11.
 *     (COC por condutividade, critérios de desempenho, classificação)
 *
 * @module industrialCoolingWaterSystem
 */

'use strict';

/**
 * Calcula os ciclos de concentração (COC) de uma torre de resfriamento
 * com base na condutividade elétrica da água de recirculação e da makeup.
 *
 * O COC expressa quantas vezes os sais estão concentrados no sistema
 * em relação à água de reposição. Pode ser calculado por qualquer íon
 * conservativo (Cl-, SO4²-, condutividade).
 * Equação: COC = EC_circ / EC_makeup  (Puckorius & Brooke, 1991)
 *
 * @param {number} conductivityCirculating_uS_cm  Condutividade da água de
 *   recirculação [µS/cm]
 * @param {number} conductivityMakeup_uS_cm  Condutividade da água de
 *   reposição [µS/cm]
 * @returns {{ cyclesOfConcentration: number, conductivityRatio: number }}
 * @throws {RangeError} Se condutividade circulante for menor que makeup
 */
export function calcCyclesOfConcentration(
    conductivityCirculating_uS_cm: number,
    conductivityMakeup_uS_cm: number,
): { cyclesOfConcentration: number; conductivityRatio: number } {
    if (typeof conductivityCirculating_uS_cm !== 'number' || typeof conductivityMakeup_uS_cm !== 'number') {
        throw new TypeError('Conductivity values must be numbers');
    }
    if (conductivityMakeup_uS_cm <= 0) {
        throw new RangeError('conductivityMakeup_uS_cm must be > 0');
    }
    if (conductivityCirculating_uS_cm < conductivityMakeup_uS_cm) {
        throw new RangeError(
            'conductivityCirculating_uS_cm must be >= conductivityMakeup_uS_cm (concentration cannot be negative)',
        );
    }

    // COC por razão de condutividade (método mais simples e universal)
    const cyclesOfConcentration = conductivityCirculating_uS_cm / conductivityMakeup_uS_cm;

    return {
        cyclesOfConcentration,
        conductivityRatio: cyclesOfConcentration,
    };
}

/**
 * Calcula o fluxo de reposição (makeup water) necessário para compensar
 * as perdas da torre de resfriamento: evaporação + drift + purga.
 *
 * Balanço de massa: M = E + D + B
 * onde E = evaporação, D = arraste (drift), B = purga (blowdown)
 * Estimativa de evaporação: E ≈ 0.008 * deltaT * Q  (ASHRAE, 2020, Ch. 40)
 *
 * @param {number} circulatingFlow_m3_h  Vazão de recirculação [m³/h]
 * @param {number} temperatureDelta_C  Diferença de temperatura (quente - fria) [°C]
 * @param {number} blowdownRate_m3_h  Taxa de purga [m³/h]
 * @param {number} [driftFraction=0.0002]  Fração de arraste (padrão: 0.02%)
 * @returns {{ makeupFlow_m3_h: number, evaporationLoss_m3_h: number, driftLoss_m3_h: number, blowdownRate_m3_h: number }}
 * @throws {RangeError} Se inputs forem negativos ou inválidos
 */
export function calcMakeupWaterFlow(
    circulatingFlow_m3_h: number,
    temperatureDelta_C: number,
    blowdownRate_m3_h: number,
    driftFraction: number = 0.0002,
): { makeupFlow_m3_h: number; evaporationLoss_m3_h: number; driftLoss_m3_h: number; blowdownRate_m3_h: number } {
    if (
        typeof circulatingFlow_m3_h !== 'number' ||
        typeof temperatureDelta_C !== 'number' ||
        typeof blowdownRate_m3_h !== 'number'
    ) {
        throw new TypeError('circulatingFlow_m3_h, temperatureDelta_C, blowdownRate_m3_h must be numbers');
    }
    if (circulatingFlow_m3_h <= 0) {
        throw new RangeError('circulatingFlow_m3_h must be > 0');
    }
    if (temperatureDelta_C <= 0) {
        throw new RangeError('temperatureDelta_C must be > 0');
    }
    if (blowdownRate_m3_h < 0) {
        throw new RangeError('blowdownRate_m3_h must be >= 0');
    }
    if (driftFraction < 0 || driftFraction > 0.01) {
        throw new RangeError('driftFraction must be in [0, 0.01]');
    }

    // Perda por evaporação: aproximação ASHRAE (0.008 por °C de range)
    const evaporationLoss_m3_h = 0.008 * temperatureDelta_C * circulatingFlow_m3_h;
    // Perda por arraste (drift eliminators modernos: 0.01-0.02%)
    const driftLoss_m3_h = driftFraction * circulatingFlow_m3_h;
    // Balanço de massa: reposição total necessária
    const makeupFlow_m3_h = evaporationLoss_m3_h + driftLoss_m3_h + blowdownRate_m3_h;

    return {
        makeupFlow_m3_h,
        evaporationLoss_m3_h,
        driftLoss_m3_h,
        blowdownRate_m3_h,
    };
}

/**
 * Calcula a taxa de purga (blowdown) necessária para manter um determinado
 * ciclo de concentração alvo, dado o fluxo de evaporação.
 *
 * Da equação de balanço de solutos:
 * B = E / (COC - 1) - D  (ASHRAE, 2020, Ch. 40, eq. 40.3)
 *
 * @param {number} evaporationRate_m3_h  Taxa de evaporação [m³/h]
 * @param {number} targetCOC  Ciclos de concentração alvo [-] (> 1)
 * @param {number} [driftLoss_m3_h=0]  Perda por arraste [m³/h]
 * @returns {{ blowdownRate_m3_h: number, targetCOC: number, evaporationRate_m3_h: number }}
 * @throws {RangeError} Se COC <= 1 ou evaporação <= 0
 */
export function calcBlowdownRate(
    evaporationRate_m3_h: number,
    targetCOC: number,
    driftLoss_m3_h: number = 0,
): { blowdownRate_m3_h: number; targetCOC: number; evaporationRate_m3_h: number } {
    if (typeof evaporationRate_m3_h !== 'number' || typeof targetCOC !== 'number') {
        throw new TypeError('evaporationRate_m3_h and targetCOC must be numbers');
    }
    if (evaporationRate_m3_h <= 0) {
        throw new RangeError('evaporationRate_m3_h must be > 0');
    }
    if (targetCOC <= 1) {
        throw new RangeError('targetCOC must be > 1');
    }
    if (driftLoss_m3_h < 0) {
        throw new RangeError('driftLoss_m3_h must be >= 0');
    }

    // Purga calculada para manter COC alvo (Puckorius & Brooke, 1991)
    const blowdownRate_m3_h = evaporationRate_m3_h / (targetCOC - 1) - driftLoss_m3_h;

    // Purga negativa indica drift > evaporação/(COC-1) - fisicamente impossível
    if (blowdownRate_m3_h < 0) {
        throw new RangeError('Calculated blowdown is negative — drift loss exceeds required blowdown for target COC');
    }

    return {
        blowdownRate_m3_h,
        targetCOC,
        evaporationRate_m3_h,
    };
}

/**
 * Classifica o desempenho de um sistema de resfriamento baseado nos ciclos
 * de concentração atingidos.
 *
 * Classificação de desempenho (Puckorius & Brooke, 1991; ASHRAE 2020):
 *   COC < 2  : Ineficiente - consumo de água excessivo, alta descarga
 *   COC 2-3  : Básico - operação mínima aceitável
 *   COC 3-5  : Bom - eficiência hídrica adequada para maioria das aplicações
 *   COC 5-8  : Excelente - operação otimizada, controle químico rigoroso
 *   COC > 8  : Limite - risco elevado de incrustação/corrosão, controle intensivo
 *
 * @param {number} achievedCOC  COC medido ou calculado [-]
 * @returns {{ performanceClass: string, performanceDescription: string, waterSavingPercent: number, achievedCOC: number }}
 * @throws {RangeError} Se COC < 1
 */
export function classifyCoolingSystemPerformance(
    achievedCOC: number,
): { performanceClass: string; performanceDescription: string; waterSavingPercent: number; achievedCOC: number } {
    if (typeof achievedCOC !== 'number') {
        throw new TypeError('achievedCOC must be a number');
    }
    if (achievedCOC < 1) {
        throw new RangeError('achievedCOC must be >= 1');
    }

    // Economia de água em relação a sistema de passagem única (COC=1)
    // waterSaving = (1 - 1/COC) * 100%
    const waterSavingPercent = (1 - 1 / achievedCOC) * 100;

    let performanceClass: string;
    let performanceDescription: string;

    if (achievedCOC < 2) {
        performanceClass = 'INEFFICIENT';
        performanceDescription = 'Inefficient — excessive water consumption and discharge volume';
    } else if (achievedCOC < 3) {
        performanceClass = 'BASIC';
        performanceDescription = 'Basic — minimum acceptable operation, significant improvement possible';
    } else if (achievedCOC < 5) {
        performanceClass = 'GOOD';
        performanceDescription = 'Good — adequate water efficiency for most industrial applications';
    } else if (achievedCOC <= 8) {
        performanceClass = 'EXCELLENT';
        performanceDescription = 'Excellent — optimized operation with rigorous chemical control';
    } else {
        performanceClass = 'LIMIT';
        performanceDescription = 'Limit — high scaling/corrosion risk, intensive monitoring required';
    }

    return {
        performanceClass,
        performanceDescription,
        waterSavingPercent,
        achievedCOC,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialCoolingWaterSystemMeta = {
    name: 'industrialCoolingWaterSystem',
    description: 'Industrial Cooling Water Systems',
    category: 'analytics',
    familyTags: ['water', 'industrial'],
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
