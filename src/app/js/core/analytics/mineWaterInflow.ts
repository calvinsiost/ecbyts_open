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
 * Mine Water Inflow - Hydrogeological Assessment
 *
 * References:
 * - Goodman, R.E. (1993). Engineering Geology: Rock in the Engineering Process.
 *   Wiley. ISBN 978-0471544241
 * - Freeze, R.A. & Cherry, J.A. (1979). Groundwater. Prentice-Hall.
 *   ISBN 978-0133653120
 * - Theis, C.V. (1935). The relation between the lowering of piezometric surface and
 *   the rate and duration of discharge of a well. Trans. AGU 16:519-524.
 *   DOI: 10.1029/TR016i002p00519
 * - Marinelli, F. & Niccoli, W.L. (2000). Simple analytical equations for estimating
 *   ground water inflow to a mine pit. Ground Water 38(2):311-314.
 *   DOI: 10.1111/j.1745-6584.2000.tb00340.x
 *
 * Zero dependências DOM/IDB/Three.js/fetch - cálculos puramente matemáticos.
 *
 * @module mineWaterInflow
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

interface ConfinedAquiferParams {
    T: number;
    drawdown_m: number;
    pitRadius_m: number;
    influenceRadius_m: number;
}

interface UnconfinedAquiferParams {
    K: number;
    H_m: number;
    hw_m?: number;
    pitRadius_m: number;
    influenceRadius_m: number;
}

interface PumpingOptions {
    pumpEfficiency?: number;
    safetyFactor?: number;
    totalHeadLoss_m?: number;
}

/**
 * Hydrogeological classification thresholds for mine dewatering.
 * Classificação hidrogeológica para rebaixamento de minas (adaptado de Goodman 1993).
 */
export const HYDROGEOLOGICAL_CLASSES: Array<{
    max: number;
    class: string;
    label: string;
    description: string;
}> = [
    {
        max: 10,
        class: 'low',
        label: 'Low Inflow',
        description: 'Minimal dewatering required; sump pumping typically sufficient',
    },
    {
        max: 100,
        class: 'moderate',
        label: 'Moderate Inflow',
        description: 'Systematic dewatering wells required; standard mine design',
    },
    {
        max: 1000,
        class: 'high',
        label: 'High Inflow',
        description: 'Major dewatering system required; significant cost impact',
    },
    {
        max: Infinity,
        class: 'extreme',
        label: 'Extreme Inflow',
        description: 'Exceptional measures required; feasibility review recommended',
    },
];

/**
 * Compute steady-state mine water inflow using the Theis/Theim analytical approach
 * for a confined aquifer (Freeze & Cherry 1979, eq. 5.71).
 * Calcula a afluência de água em mina para aquífero confinado - método analítico de Theis/Thiem.
 *
 * Q = 2π × T × s / ln(R/r)
 * where T = transmissivity (m²/day), s = drawdown (m), R = radius of influence (m), r = pit radius (m)
 *
 * @param params
 * @param params.T - Aquifer transmissivity (m²/day)
 * @param params.drawdown_m - Required drawdown (m)
 * @param params.pitRadius_m - Equivalent circular pit radius (m)
 * @param params.influenceRadius_m - Radius of influence (m, must be > pitRadius_m)
 * @returns Inflow rate
 */
export function confinedAquiferInflow(params: ConfinedAquiferParams): { Q_m3_day: number; Q_L_s: number } {
    if (!params || typeof params !== 'object') throw new TypeError('params must be an object');
    const { T, drawdown_m, pitRadius_m, influenceRadius_m } = params;
    if (typeof T !== 'number' || T <= 0) throw new RangeError('T (transmissivity) must be > 0');
    if (typeof drawdown_m !== 'number' || drawdown_m <= 0) throw new RangeError('drawdown_m must be > 0');
    if (typeof pitRadius_m !== 'number' || pitRadius_m <= 0) throw new RangeError('pitRadius_m must be > 0');
    if (typeof influenceRadius_m !== 'number' || influenceRadius_m <= pitRadius_m) {
        throw new RangeError('influenceRadius_m must be > pitRadius_m');
    }

    // Q = 2π·T·s / ln(R/r)
    const Q_m3_day = (2 * Math.PI * T * drawdown_m) / Math.log(influenceRadius_m / pitRadius_m);
    const Q_L_s = (Q_m3_day * 1000) / 86400;

    return { Q_m3_day, Q_L_s };
}

/**
 * Compute mine water inflow for an unconfined (water table) aquifer
 * using the Dupuit-Forchheimer approximation (Freeze & Cherry 1979, eq. 5.76).
 * Calcula a afluência para aquífero livre - aproximação de Dupuit-Forchheimer.
 *
 * Q = π × K × (H² - hw²) / ln(R/r)
 * where K = hydraulic conductivity, H = undisturbed water table elevation above pit bottom,
 * hw = residual water level in pit (often = 0 for dry pit)
 *
 * @param params
 * @param params.K - Hydraulic conductivity (m/day)
 * @param params.H_m - Undisturbed water table height above pit bottom (m)
 * @param params.hw_m - Residual head in pit (m, >= 0, typically 0)
 * @param params.pitRadius_m - Equivalent circular pit radius (m)
 * @param params.influenceRadius_m - Radius of influence (m)
 */
export function unconfinedAquiferInflow(params: UnconfinedAquiferParams): { Q_m3_day: number; Q_L_s: number } {
    if (!params || typeof params !== 'object') throw new TypeError('params must be an object');
    const { K, H_m, hw_m = 0, pitRadius_m, influenceRadius_m } = params;
    if (typeof K !== 'number' || K <= 0) throw new RangeError('K must be > 0');
    if (typeof H_m !== 'number' || H_m <= 0) throw new RangeError('H_m must be > 0');
    if (typeof hw_m !== 'number' || hw_m < 0) throw new RangeError('hw_m must be >= 0');
    if (hw_m >= H_m) throw new RangeError('hw_m must be < H_m');
    if (typeof pitRadius_m !== 'number' || pitRadius_m <= 0) throw new RangeError('pitRadius_m must be > 0');
    if (typeof influenceRadius_m !== 'number' || influenceRadius_m <= pitRadius_m) {
        throw new RangeError('influenceRadius_m must be > pitRadius_m');
    }

    // Q = π·K·(H² - hw²) / ln(R/r)
    const Q_m3_day = (Math.PI * K * (H_m * H_m - hw_m * hw_m)) / Math.log(influenceRadius_m / pitRadius_m);
    const Q_L_s = (Q_m3_day * 1000) / 86400;

    return { Q_m3_day, Q_L_s };
}

/**
 * Estimate pumping efficiency and effective inflow rate.
 * Estima a eficiência de bombeamento e vazão efetiva de deságue.
 *
 * @param Q_m3_day - Required inflow pumping rate (m³/day)
 * @param options
 * @param options.pumpEfficiency - Overall pump efficiency (0-1)
 * @param options.safetyFactor - Safety factor for design (typically 1.2-1.5)
 * @param options.totalHeadLoss_m - Total head loss in metres
 */
export function pumpingDesign(
    Q_m3_day: number,
    options: PumpingOptions = {},
): { designQ_m3_day: number; designQ_L_s: number; powerKW: number; energyKWh_day: number } {
    if (typeof Q_m3_day !== 'number' || Q_m3_day <= 0) throw new RangeError('Q_m3_day must be > 0');
    const { pumpEfficiency = 0.75, safetyFactor = 1.25, totalHeadLoss_m = 50 } = options;
    if (pumpEfficiency <= 0 || pumpEfficiency > 1) throw new RangeError('pumpEfficiency must be in (0, 1]');
    if (safetyFactor < 1) throw new RangeError('safetyFactor must be >= 1');

    const designQ_m3_day = Q_m3_day * safetyFactor;
    const designQ_L_s = (designQ_m3_day * 1000) / 86400;
    // Potência hidráulica: P = ρ·g·Q·H / η (W) - água: ρ=1000 kg/m³, g=9.81 m/s²
    const Q_m3_s = designQ_m3_day / 86400;
    const powerKW = (1000 * 9.81 * Q_m3_s * totalHeadLoss_m) / (pumpEfficiency * 1000);
    const energyKWh_day = powerKW * 24;

    return { designQ_m3_day, designQ_L_s, powerKW, energyKWh_day };
}

/**
 * Classify mine hydrogeology and estimate dewatering cost.
 * Classifica a hidrogeologia da mina e estima o custo de rebaixamento.
 *
 * @param Q_m3_day - Inflow rate (m³/day)
 * @param energyCostBRL_kWh - Electricity cost (BRL/kWh)
 */
export function classifyMineHydrogeology(
    Q_m3_day: number,
    energyCostBRL_kWh = 0.6,
): { class: string; label: string; description: string; costBRL_m3: number | null } {
    if (typeof Q_m3_day !== 'number' || Q_m3_day < 0) throw new RangeError('Q_m3_day must be >= 0');
    if (typeof energyCostBRL_kWh !== 'number' || energyCostBRL_kWh < 0) {
        throw new RangeError('energyCostBRL_kWh must be >= 0');
    }

    const cls =
        HYDROGEOLOGICAL_CLASSES.find((c) => Q_m3_day <= c.max) ??
        HYDROGEOLOGICAL_CLASSES[HYDROGEOLOGICAL_CLASSES.length - 1]!;

    // Custo simplificado: energia + operação (x2 fator fixo)
    // Simplified cost: energy + O&M (fixed factor x2)
    let costBRL_m3: number | null = null;
    if (Q_m3_day > 0) {
        const { powerKW } = pumpingDesign(Q_m3_day, { totalHeadLoss_m: 50 });
        const energyCostBRL_day = powerKW * 24 * energyCostBRL_kWh;
        costBRL_m3 = (energyCostBRL_day * 2) / Q_m3_day;
    }

    return {
        class: cls.class,
        label: cls.label,
        description: cls.description,
        costBRL_m3,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineWaterInflowMeta: AnalyticsModuleMeta = {
    name: 'mineWaterInflow',
    description: 'mineWaterInflow',
    category: 'analytics',
    familyTags: ['water', 'mining'],
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
