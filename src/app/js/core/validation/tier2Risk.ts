// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// @ts-check
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta

/**
 * CONAMA-420 Tier-2 Risk Assessment
 * ---------------------------------
 * EN: Site-specific Risk-Based Screening Level (RBSL) derivation. When a
 * measured concentration exceeds the Tier-1 VI threshold (CONAMA 420/2009,
 * Art. 23-25), the regulation requires a human-health risk assessment to
 * decide whether remediation is actually needed. This module inverts the
 * USEPA RAGS Part B risk equation to compute the concentration that equals
 * the acceptable risk criteria adopted by CETESB DD 038/2017/C
 * (ILCR = 1e-5 for carcinogens, HQ = 1 for non-carcinogens).
 *
 * PT (leigos): O "Tier 1" só compara o valor medido com o limite legal (VI).
 * Quando passa do VI, a lei exige uma avaliação de risco que calcula qual
 * concentração seria aceitável naquele local específico (considerando como
 * as pessoas são expostas). Este módulo faz essa conta de trás pra frente.
 *
 * Provenance:
 *  - CONAMA Resolução nº 420/2009, Art. 23-25 (DOU 30/12/2009)
 *  - CETESB Decisão de Diretoria DD 038/2017/C
 *  - USEPA RAGS Part B, EPA/540/R-92/003 (1991) — RBSL inversion
 *  - ASTM E2081 (RBCA) — tiered approach
 *
 * Reuses (does NOT reimplement):
 *  - getThresholds / getExceededThreshold from ./rules.js (Tier-1 VI lookup)
 *  - computeLADD / computeADD from ../health/populationRiskModel.js (dose)
 */

import { getThresholds, getExceededThreshold } from './rules.js';
import { computeLADD, computeADD } from '../health/populationRiskModel.js';

/**
 * EN: Acceptable risk criteria + canonical residential adult receptor.
 * PT: Critérios de risco aceitável e receptor residencial padrão.
 * Source: CETESB DD 038/2017/C + USEPA exposure factors (RAGS Part A).
 * @type {Readonly<{ targetRisk: number, targetHazardQuotient: number, exposure: Readonly<Record<string, number>> }>}
 */
export const CONAMA420_TIER2_DEFAULTS = Object.freeze({
    targetRisk: 1e-5, // ILCR aceitável (CETESB DD 038/2017/C)
    targetHazardQuotient: 1.0, // HQ aceitável (não-carcinogênicos)
    exposure: Object.freeze({
        IR: 2, // L/dia (ingestão de água) — USEPA RAGS
        EF: 350, // dias/ano
        ED: 30, // anos
        BW: 70, // kg
        AT_carc: 70, // anos (lifetime — usado por computeLADD internamente)
        AT_nonc: 30, // anos (período exposto = ED, para não-carc)
    }),
});

/**
 * EN: Dose per unit concentration (C=1) for carcinogenic pathway (LADD).
 * PT: Dose por unidade de concentração para via carcinogênica.
 * @param {Record<string, number>} ex - exposure factors
 * @returns {number} LADD at C=1 (mg/kg-day per unit C)
 */
function laddPerUnitC(ex: any) {
    return computeLADD({ C: 1, IR: ex.IR, EF: ex.EF, ED: ex.ED, BW: ex.BW }).ladd;
}

/**
 * EN: Dose per unit concentration (C=1) for non-carcinogenic pathway (ADD).
 * PT: Dose por unidade de concentração para via não-carcinogênica.
 * @param {Record<string, number>} ex - exposure factors
 * @returns {number} ADD at C=1 (mg/kg-day per unit C)
 */
function addPerUnitC(ex: any) {
    return computeADD({ C: 1, IR: ex.IR, EF: ex.EF, ED: ex.ED, BW: ex.BW, AT: ex.AT_nonc }).add;
}

/**
 * EN: Compute the Risk-Based Screening Level (RBSL) by inverting the risk
 * equation. Carcinogenic: RBSL = TR / (CSF · LADD_perC). Non-carcinogenic:
 * RBSL = THQ · RfD / ADD_perC. Returns the limiting (smallest) value when
 * both CSF and RfD are provided.
 * PT: Calcula a concentração-alvo que iguala o risco aceitável.
 *
 * @param {{ targetRisk?: number, targetHazardQuotient?: number,
 *           toxicity: { csf?: number|null, rfd?: number|null },
 *           exposure?: Record<string, number> }} params
 * @returns {Readonly<{ rbslCarc: number|null, rbslNonc: number|null, rbsl: number, driver: string, unit: string }>}
 * @throws {TypeError} se nem csf nem rfd forem fornecidos
 */
export function computeRbsl({
    targetRisk,
    targetHazardQuotient,
    toxicity,
    exposure
}: any = ({} as any)) {
    if (!toxicity || (toxicity.csf == null && toxicity.rfd == null)) {
        throw new TypeError('computeRbsl: at least one of toxicity.csf or toxicity.rfd is required');
    }
    const ex = { ...CONAMA420_TIER2_DEFAULTS.exposure, ...(exposure || {}) };
    const TR = targetRisk ?? CONAMA420_TIER2_DEFAULTS.targetRisk;
    const THQ = targetHazardQuotient ?? CONAMA420_TIER2_DEFAULTS.targetHazardQuotient;

    let rbslCarc = null;
    let rbslNonc = null;
    if (toxicity.csf != null && toxicity.csf > 0) {
        rbslCarc = TR / (toxicity.csf * laddPerUnitC(ex));
    }
    if (toxicity.rfd != null && toxicity.rfd > 0) {
        rbslNonc = (THQ * toxicity.rfd) / addPerUnitC(ex);
    }

    const candidates = [rbslCarc, rbslNonc].filter((v) => v != null);
    const rbsl = Math.min(...(candidates as number[]));
    const driver = rbsl === rbslCarc ? 'carcinogenic' : 'non-carcinogenic';
    return Object.freeze({ rbslCarc, rbslNonc, rbsl, driver, unit: 'concentration (same as toxicity basis)' });
}

/**
 * EN: Full Tier-2 assessment. Looks up the Tier-1 VI threshold via the
 * existing validation engine. Only runs the risk-based step if the measured
 * concentration exceeds the VI. Then compares the concentration against the
 * computed RBSL to reach the Tier-2 decision.
 * PT: Avaliação Tier-2 completa — só roda risco se a medição passou do VI.
 *
 * @param {{ parameterId: string, matrix?: string, concentration: number,
 *           toxicity: { csf?: number|null, rfd?: number|null },
 *           exposure?: Record<string, number>,
 *           targetRisk?: number, targetHazardQuotient?: number }} params
 * @returns {Readonly<{ tier1Exceeded: boolean, viValue: number|null,
 *           rbsl: number|null, tier2Decision: string, driver: string|null,
 *           basis: string }>}
 * @throws {TypeError} para concentração inválida
 */
export function assessTier2({
    parameterId,
    matrix = 'groundwater',
    concentration,
    toxicity,
    exposure,
    targetRisk,
    targetHazardQuotient
}: any) {
    if (typeof concentration !== 'number' || !Number.isFinite(concentration) || concentration < 0) {
        throw new TypeError('assessTier2: concentration must be a finite non-negative number');
    }
    const thresholds = getThresholds(parameterId, matrix);
    const viList = thresholds.filter((t: any) => t.type === 'vi');
    const exceeded = getExceededThreshold(concentration, viList);
    const viValue = viList.length ? Math.min(...viList.map((t: any) => t.value)) : null;

    if (!exceeded) {
        return Object.freeze({
            tier1Exceeded: false,
            viValue,
            rbsl: null,
            tier2Decision: 'tier1_compliant',
            driver: null,
            basis: 'CONAMA 420/2009 Art. 23 — concentration ≤ VI; Tier-2 not required',
        });
    }

    const { rbsl, driver } = computeRbsl({ targetRisk, targetHazardQuotient, toxicity, exposure });
    const tier2Decision = concentration > rbsl ? 'remediation_required' : 'risk_acceptable';
    return Object.freeze({
        tier1Exceeded: true,
        viValue,
        rbsl,
        tier2Decision,
        driver,
        basis: 'CETESB DD 038/2017/C — RBSL vs measured concentration (Tier-2)',
    });
}
