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
 * Industrial Heat Recovery - Organic Rankine Cycle (ORC) Power Generation
 *
 * Calculates recoverable power from industrial waste heat streams using
 * Carnot efficiency bounds and ORC empirical correction factors.
 *
 * Academic references:
 *   - Tchanche, B.F., Lambrinos, G., Frangoudakis, A., & Papadakis, G. (2011).
 *     Low-grade heat conversion into power using organic Rankine cycles - A review
 *     of various applications. Renewable and Sustainable Energy Reviews, 15(8),
 *     3963–3979. DOI:10.1016/j.rser.2010.12.013
 *   - Hung, T.C., Shai, T.Y., & Wang, S.K. (1997). A review of organic Rankine
 *     cycles (ORCs) for the recovery of low-grade waste heat. Energy, 22(7),
 *     661–667. DOI:10.1016/S0360-5442(96)00165-X
 *   - Quoilin, S., Van Den Broek, M., Declaye, S., Dewallef, P., & Lemort, V.
 *     (2013). Techno-economic survey of Organic Rankine Cycle (ORC) systems.
 *     Renewable and Sustainable Energy Reviews, 22, 168–186.
 *     DOI:10.1016/j.rser.2013.01.028
 *
 * @module industrialHeatRecovery
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
 * Empirical ORC-to-Carnot efficiency ratio (dimensionless).
 * Literature consensus from Tchanche et al. (2011) §3: real ORC systems
 * achieve ~50–70% of Carnot limit; 0.65 is the central estimate.
 * @constant {number}
 */
const ORC_CARNOT_RATIO = 0.65;

/**
 * Calculates the theoretical Carnot thermal efficiency.
 *
 * η_Carnot = 1 − T_cold / T_hot
 *
 * Represents the upper bound of any heat engine operating between two thermal
 * reservoirs. Kelvin temperatures required.
 *
 * @param {number} T_hot_K - Hot source temperature (K), must be > T_cold_K > 0
 * @param {number} T_cold_K - Cold sink temperature (K), must be > 0
 * @returns {number} Carnot efficiency (dimensionless, 0–1)
 * @throws {TypeError} If parameters are not finite numbers
 * @throws {RangeError} If T_hot_K <= T_cold_K or T_cold_K <= 0
 */
export function calcCarnotEfficiency(T_hot_K: number, T_cold_K: number): number {
    if (typeof T_hot_K !== 'number' || !isFinite(T_hot_K))
        throw new TypeError('calcCarnotEfficiency: T_hot_K must be a finite number');
    if (typeof T_cold_K !== 'number' || !isFinite(T_cold_K))
        throw new TypeError('calcCarnotEfficiency: T_cold_K must be a finite number');
    if (T_cold_K <= 0) throw new RangeError('calcCarnotEfficiency: T_cold_K must be > 0 K');
    if (T_hot_K <= T_cold_K) throw new RangeError('calcCarnotEfficiency: T_hot_K must be > T_cold_K');
    return 1 - T_cold_K / T_hot_K;
}

/**
 * Calculates the practical ORC thermal efficiency.
 *
 * η_ORC ≈ ORC_CARNOT_RATIO × η_Carnot × η_isentropic
 *
 * The isentropic efficiency (η_s) accounts for irreversibilities in the
 * expander (turbine/scroll), typically 0.65–0.85 for commercial ORC units.
 * The composite factor ORC_CARNOT_RATIO × η_s represents total cycle degradation
 * from the Carnot ideal (Tchanche et al. 2011, eq. 7).
 *
 * @param {number} T_hot_K - Hot source temperature (K)
 * @param {number} T_cold_K - Cold sink temperature (K)
 * @param {number} isentropicEff - Isentropic efficiency of the expander (0–1), typically 0.65–0.85
 * @returns {number} Practical ORC efficiency (dimensionless, 0–1)
 * @throws {TypeError} If parameters are not finite numbers
 * @throws {RangeError} If isentropicEff is outside (0, 1] or temperatures invalid
 */
export function calcORCEfficiency(T_hot_K: number, T_cold_K: number, isentropicEff: number): number {
    if (typeof isentropicEff !== 'number' || !isFinite(isentropicEff))
        throw new TypeError('calcORCEfficiency: isentropicEff must be a finite number');
    if (isentropicEff <= 0 || isentropicEff > 1)
        throw new RangeError('calcORCEfficiency: isentropicEff must be in (0, 1]');
    const eta_c = calcCarnotEfficiency(T_hot_K, T_cold_K);
    return ORC_CARNOT_RATIO * eta_c * isentropicEff;
}

/**
 * Calculates recoverable electrical power from a waste heat stream.
 *
 * W_net = Q_available × η_ORC (kW)
 *
 * @param {number} heatFlow_kW - Available thermal power in the waste heat stream (kW), > 0
 * @param {number} orcEfficiency - ORC thermal efficiency (dimensionless, 0–1)
 * @returns {number} Net recoverable power (kW)
 * @throws {TypeError} If parameters are not finite numbers
 * @throws {RangeError} If heatFlow_kW <= 0 or orcEfficiency out of (0, 1]
 */
export function calcRecoverablePower(heatFlow_kW: number, orcEfficiency: number): number {
    if (typeof heatFlow_kW !== 'number' || !isFinite(heatFlow_kW))
        throw new TypeError('calcRecoverablePower: heatFlow_kW must be a finite number');
    if (typeof orcEfficiency !== 'number' || !isFinite(orcEfficiency))
        throw new TypeError('calcRecoverablePower: orcEfficiency must be a finite number');
    if (heatFlow_kW <= 0) throw new RangeError('calcRecoverablePower: heatFlow_kW must be > 0');
    if (orcEfficiency <= 0 || orcEfficiency > 1)
        throw new RangeError('calcRecoverablePower: orcEfficiency must be in (0, 1]');
    return heatFlow_kW * orcEfficiency;
}

/**
 * Calculates the simple payback period for an ORC installation.
 *
 * Payback (yr) = CAPEX / (annual_kWh × electricity_price)
 *
 * Assumes constant annual production and electricity price. For a more complete
 * NPV analysis, see core/financial module.
 *
 * @param {number} capex - Capital expenditure (currency units, e.g. USD or BRL), > 0
 * @param {number} annualRevenue_kWh_yr - Annual electricity generation (kWh/yr), > 0
 * @param {number} electricityPrice_per_kWh - Electricity tariff (same currency/kWh), > 0
 * @returns {number} Simple payback period (years)
 * @throws {TypeError} If parameters are not finite numbers
 * @throws {RangeError} If any parameter is <= 0
 */
export function calcPayback(
    capex: number,
    annualRevenue_kWh_yr: number,
    electricityPrice_per_kWh: number,
): number {
    for (const [name, val] of [
        ['capex', capex],
        ['annualRevenue_kWh_yr', annualRevenue_kWh_yr],
        ['electricityPrice_per_kWh', electricityPrice_per_kWh],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !isFinite(val))
            throw new TypeError(`calcPayback: '${name}' must be a finite number`);
        if (val <= 0) throw new RangeError(`calcPayback: '${name}' must be > 0`);
    }
    return capex / (annualRevenue_kWh_yr * electricityPrice_per_kWh);
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialHeatRecoveryMeta: AnalyticsModuleMeta = {
    name: 'industrialHeatRecovery',
    description: 'industrialHeatRecovery',
    category: 'analytics',
    familyTags: ['industrial'],
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
