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
 * Industrial Combustion Efficiency Analytics
 *
 * Implements combustion analysis methods per:
 * - Borman, G.L. & Ragland, K.W. (1998). Combustion Engineering. McGraw-Hill. ISBN 978-0070066076
 * - ABNT NBR 13787:1997 - Medição de emissões de fontes estacionárias
 * - CONAMA Resolution 382/2006 - Limites de emissão para fontes estacionárias
 *
 * Zero dependencies: no DOM, IDB, Three.js, or fetch.
 * Pure math - all inputs in SI units unless noted.
 *
 * @module industrialCombustionEfficiency
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

// --- Combustion constants (Borman & Ragland 1998, Table 2.1) ---
// Constantes de combustão baseadas em composição do ar seco
const O2_DRY_AIR_FRACTION = 0.2095; // fração molar de O2 no ar seco
// eslint-disable-next-line
const N2_TO_O2_RATIO = (1 - O2_DRY_AIR_FRACTION) / O2_DRY_AIR_FRACTION; // ~3.76 mol N2/mol O2

/**
 * Calculate excess air ratio (lambda, λ) from flue gas O2 or CO2 content.
 * Calcula o excesso de ar (λ) a partir do teor de O2 ou CO2 nos gases de exaustão.
 *
 * Método: análise de gases secos (Orsat ou equivalente eletroquímico)
 * Reference: Borman & Ragland (1998) eq. 3.14; ABNT NBR 13787 §5.3
 *
 * @param {object} params
 * @param {number} [params.o2Percent]  - O2 measured in dry flue gas (% vol)
 * @param {number} [params.co2Percent] - CO2 measured in dry flue gas (% vol)
 * @param {number} [params.co2Max]     - Stoichiometric CO2 max for fuel (% vol); required when using co2Percent
 * @returns {{ lambda: number, excessAirPercent: number }}
 * @throws {TypeError} if params is not an object
 * @throws {RangeError} if values are out of physically meaningful range
 */
export function calcExcessAirRatio(
    { o2Percent, co2Percent, co2Max }: { o2Percent?: number; co2Percent?: number; co2Max?: number } = {},
): { lambda: number; excessAirPercent: number } {
    if (typeof o2Percent !== 'number' && typeof co2Percent !== 'number') {
        throw new TypeError('calcExcessAirRatio: provide o2Percent or co2Percent');
    }

    let lambda: number;

    if (typeof o2Percent === 'number') {
        // Método O2 - mais preciso para combustíveis sólidos e líquidos
        // λ = 1 / (1 - O2% / 20.95)  [Borman & Ragland eq. 3.14]
        if (o2Percent < 0 || o2Percent >= 20.95) {
            throw new RangeError(`calcExcessAirRatio: o2Percent must be in [0, 20.95), got ${o2Percent}`);
        }
        lambda = 1 / (1 - o2Percent / (O2_DRY_AIR_FRACTION * 100));
    } else {
        // Método CO2 - usa razão com CO2max estequiométrico
        if (typeof co2Max !== 'number' || co2Max <= 0 || co2Max > 21) {
            throw new RangeError(`calcExcessAirRatio: co2Max must be in (0, 21], got ${co2Max}`);
        }
        const co2P = co2Percent as number;
        if (co2P <= 0 || co2P > co2Max) {
            throw new RangeError(`calcExcessAirRatio: co2Percent must be in (0, co2Max], got ${co2P}`);
        }
        lambda = co2Max / co2P;
    }

    return {
        lambda: Math.round(lambda * 10000) / 10000,
        excessAirPercent: Math.round((lambda - 1) * 100 * 100) / 100,
    };
}

/**
 * Calculate acid (sulfur) dewpoint temperature of flue gas.
 * Calcula a temperatura de orvalho ácido (sulfúrico) dos gases de exaustão.
 *
 * Correlação empírica de Verhoff & Banchero (1974), amplamente usada em engenharia:
 *   T_dp [K] = 1000 / (2.276 - 0.0294·ln(p_H2O) - 0.0858·ln(p_SO3) + 0.0062·ln(p_H2O)·ln(p_SO3))
 * onde pressões parciais em atm.
 *
 * Reference: Verhoff, F.H. & Banchero, J.T. (1974). Chem. Eng. Prog. 70(8):71-72
 *
 * @param {object} params
 * @param {number} params.pH2O_atm   - Partial pressure of H2O in flue gas (atm)
 * @param {number} params.pSO3_atm   - Partial pressure of SO3 in flue gas (atm)
 * @returns {{ dewpointK: number, dewpointC: number }}
 * @throws {RangeError} if partial pressures are non-positive or implausible
 */
export function calcSulfurDewpoint(
    { pH2O_atm, pSO3_atm }: { pH2O_atm: number; pSO3_atm: number } = {} as { pH2O_atm: number; pSO3_atm: number },
): { dewpointK: number; dewpointC: number } {
    if (typeof pH2O_atm !== 'number' || pH2O_atm <= 0 || pH2O_atm > 1) {
        throw new RangeError(`calcSulfurDewpoint: pH2O_atm must be in (0, 1], got ${pH2O_atm}`);
    }
    if (typeof pSO3_atm !== 'number' || pSO3_atm <= 0 || pSO3_atm > 0.1) {
        throw new RangeError(`calcSulfurDewpoint: pSO3_atm must be in (0, 0.1], got ${pSO3_atm}`);
    }

    // Verhoff & Banchero (1974) correlation
    const lnH2O = Math.log(pH2O_atm);
    const lnSO3 = Math.log(pSO3_atm);
    const dewpointK = 1000 / (2.276 - 0.0294 * lnH2O - 0.0858 * lnSO3 + 0.0062 * lnH2O * lnSO3);

    return {
        dewpointK: Math.round(dewpointK * 100) / 100,
        dewpointC: Math.round((dewpointK - 273.15) * 100) / 100,
    };
}

/**
 * Calculate combustion efficiency by indirect method (loss method).
 * Calcula a eficiência de combustão pelo método indireto (perdas pelo método de Siegert).
 *
 * η_comb = 100% - Σ losses (%)
 * Perdas consideradas: gases de exaustão (sensível + latente), CO incompleto, radiação/condução
 *
 * Siegert formula (VDI 2035 Blatt 1):
 *   QL% = (T_flue - T_amb) × [A / CO2_measured + B]
 * where CO2_measured = CO2max / lambda (% by volume).
 *
 * Reference: Borman & Ragland (1998) §4.5; VDI 2035 Blatt 1 (German standard adaptation)
 *
 * @param {object} params
 * @param {number} params.flueTempC       - Flue gas temperature (°C)
 * @param {number} params.ambientTempC    - Ambient temperature (°C)
 * @param {number} params.lambda          - Excess air ratio (dimensionless, ≥1)
 * @param {number} [params.coPercent]     - CO in flue gas (% vol, default 0)
 * @param {number} [params.radiationLoss] - Radiation/conduction loss fraction (default 0.015 = 1.5%)
 * @param {string} [params.fuelType]      - 'naturalGas'|'fuelOil'|'coal' (affects Siegert coeff)
 * @returns {{ efficiencyPercent: number, flueGasLossPercent: number, coLossPercent: number }}
 * @throws {RangeError} on invalid temperature or lambda values
 */
export function calcCombustionEfficiency(
    {
        flueTempC,
        ambientTempC,
        lambda,
        coPercent = 0,
        radiationLoss = 0.015,
        fuelType = 'naturalGas',
    }: {
        flueTempC: number;
        ambientTempC: number;
        lambda: number;
        coPercent?: number;
        radiationLoss?: number;
        fuelType?: string;
    } = {} as { flueTempC: number; ambientTempC: number; lambda: number },
): { efficiencyPercent: number; flueGasLossPercent: number; coLossPercent: number } {
    if (typeof flueTempC !== 'number' || flueTempC <= ambientTempC) {
        throw new RangeError(
            `calcCombustionEfficiency: flueTempC (${flueTempC}) must exceed ambientTempC (${ambientTempC})`,
        );
    }
    if (typeof ambientTempC !== 'number' || ambientTempC < -20 || ambientTempC > 50) {
        throw new RangeError(`calcCombustionEfficiency: ambientTempC must be in [-20, 50], got ${ambientTempC}`);
    }
    if (typeof lambda !== 'number' || lambda < 1.0 || lambda > 5.0) {
        throw new RangeError(`calcCombustionEfficiency: lambda must be in [1.0, 5.0], got ${lambda}`);
    }

    // Siegert coefficients and stoichiometric CO2 max per fuel type
    // Coeficientes de Siegert e CO2 máximo estequiométrico por tipo de combustível
    // A: proportionality factor; CO2max: max CO2 at stoichiometric combustion (% vol)
    // Source: VDI 2035 Blatt 1 Table 1; Borman & Ragland (1998) Table 4.3
    const fuelData: Record<string, { A: number; B: number; co2Max: number }> = {
        naturalGas: { A: 0.66, B: 0.009, co2Max: 11.7 },
        fuelOil: { A: 0.68, B: 0.008, co2Max: 15.5 },
        coal: { A: 0.72, B: 0.007, co2Max: 18.5 },
    };
    const { A: siegertA, B: siegertB, co2Max } = (fuelData[fuelType] ?? fuelData.naturalGas)!;

    // CO2 measured = CO2max / lambda (% vol)
    const co2Measured = co2Max / lambda;

    const deltaT = flueTempC - ambientTempC;
    // Flue gas sensible + latent heat loss (%) - Siegert formula
    // Perda por calor sensível e latente nos gases de exaustão (fórmula de Siegert)
    const flueGasLossPercent = deltaT * (siegertA / co2Measured + siegertB);

    // CO loss approximation: each 1% CO ≈ 3.5% heat loss (for natural gas)
    // Perda por combustão incompleta (CO)
    const coLossPercent = coPercent * 3.5;

    const totalLoss = flueGasLossPercent + coLossPercent + radiationLoss * 100;
    const efficiencyPercent = Math.max(0, 100 - totalLoss);

    return {
        efficiencyPercent: Math.round(efficiencyPercent * 100) / 100,
        flueGasLossPercent: Math.round(flueGasLossPercent * 100) / 100,
        coLossPercent: Math.round(coLossPercent * 100) / 100,
    };
}

/**
 * Estimate specific emissions (NOx, SOx, PM) from combustion.
 * Estima emissões específicas (NOx, SOx, MP) da combustão.
 *
 * Factored emission approach per CONAMA 382/2006 Anexo I and EPA AP-42 (1998).
 * Emissões calculadas por unidade de energia gerada (g/GJ).
 *
 * @param {object} params
 * @param {number} params.fuelConsumptionKgH  - Fuel consumption rate (kg/h)
 * @param {number} params.lhvMJKg             - Lower heating value of fuel (MJ/kg)
 * @param {number} [params.sulfurContentPct]  - Sulfur content in fuel (% mass, default 0)
 * @param {string} [params.fuelType]          - 'naturalGas'|'fuelOil'|'coal'
 * @returns {{ noxGGJ: number, soxGGJ: number, pmGGJ: number, thermalPowerMW: number }}
 * @throws {RangeError} if fuel consumption or LHV are non-positive
 */
export function calcSpecificEmissions(
    {
        fuelConsumptionKgH,
        lhvMJKg,
        sulfurContentPct = 0,
        fuelType = 'naturalGas',
    }: {
        fuelConsumptionKgH: number;
        lhvMJKg: number;
        sulfurContentPct?: number;
        fuelType?: string;
    } = {} as { fuelConsumptionKgH: number; lhvMJKg: number },
): { noxGGJ: number; soxGGJ: number; pmGGJ: number; thermalPowerMW: number } {
    if (typeof fuelConsumptionKgH !== 'number' || fuelConsumptionKgH <= 0) {
        throw new RangeError(`calcSpecificEmissions: fuelConsumptionKgH must be positive, got ${fuelConsumptionKgH}`);
    }
    if (typeof lhvMJKg !== 'number' || lhvMJKg <= 0 || lhvMJKg > 60) {
        throw new RangeError(`calcSpecificEmissions: lhvMJKg must be in (0, 60], got ${lhvMJKg}`);
    }
    if (typeof sulfurContentPct !== 'number' || sulfurContentPct < 0 || sulfurContentPct > 10) {
        throw new RangeError(`calcSpecificEmissions: sulfurContentPct must be in [0, 10], got ${sulfurContentPct}`);
    }

    // Emission factors (g/GJ) - AP-42 Table 1.4-1 and CONAMA 382/2006 (adapted)
    // Fatores de emissão por tipo de combustível (g/GJ de energia liberada)
    const efNOx = ({ naturalGas: 55, fuelOil: 100, coal: 200 } as Record<string, number>)[fuelType] ?? 55;
    const efPM = ({ naturalGas: 2, fuelOil: 30, coal: 300 } as Record<string, number>)[fuelType] ?? 2;

    // SOx calculated from stoichiometry: S + O2 → SO2; 2 mol S → 1 mol SO2
    // SOx calculado estequiometricamente a partir do enxofre no combustível
    const thermalPowerMW = (fuelConsumptionKgH * lhvMJKg) / 3600; // MW
    const energyGJH = (fuelConsumptionKgH * lhvMJKg) / 1000; // GJ/h
    const soxMassGH = (sulfurContentPct / 100) * fuelConsumptionKgH * 1000 * 2; // g/h (×2 for SO2 MW ratio)
    const soxGGJ = energyGJH > 0 ? soxMassGH / energyGJH : 0;

    return {
        noxGGJ: efNOx,
        soxGGJ: Math.round(soxGGJ * 100) / 100,
        pmGGJ: efPM,
        thermalPowerMW: Math.round(thermalPowerMW * 1000) / 1000,
    };
}

/**
 * Compute a composite Combustion Quality Index (CQI, 0–100).
 * Computa um Índice de Qualidade de Combustão composto (IQC, 0–100).
 *
 * Inspired by ABNT NBR 13787 criteria and EN 267 burner performance standards.
 * Combines efficiency, excess air deviation from optimum, and CO penalty.
 *
 * @param {object} params
 * @param {number} params.efficiencyPercent  - Combustion efficiency (%)
 * @param {number} params.lambda             - Excess air ratio
 * @param {number} [params.coPercent]        - CO in flue gas (% vol, default 0)
 * @param {number} [params.optimalLambda]    - Target excess air ratio (default 1.15)
 * @returns {{ cqi: number, rating: string }}
 */
export function calcCombustionQualityIndex(
    {
        efficiencyPercent,
        lambda,
        coPercent = 0,
        optimalLambda = 1.15,
    }: {
        efficiencyPercent: number;
        lambda: number;
        coPercent?: number;
        optimalLambda?: number;
    } = {} as { efficiencyPercent: number; lambda: number },
): { cqi: number; rating: string } {
    if (typeof efficiencyPercent !== 'number' || efficiencyPercent < 0 || efficiencyPercent > 100) {
        throw new RangeError(
            `calcCombustionQualityIndex: efficiencyPercent must be in [0, 100], got ${efficiencyPercent}`,
        );
    }
    if (typeof lambda !== 'number' || lambda < 1.0) {
        throw new RangeError(`calcCombustionQualityIndex: lambda must be >= 1.0, got ${lambda}`);
    }

    // Score components (each 0–100 contribution weighted)
    // Componentes do índice (contribuição 0–100 cada, ponderada)
    const effScore = Math.min(100, efficiencyPercent); // 40%
    const lambdaDev = Math.abs(lambda - optimalLambda);
    const lambdaScore = Math.max(0, 100 - lambdaDev * 200); // 40% — penaliza desvio
    const coScore = Math.max(0, 100 - coPercent * 500); // 20% — penaliza CO

    const cqi = Math.round((0.4 * effScore + 0.4 * lambdaScore + 0.2 * coScore) * 10) / 10;

    let rating: string;
    if (cqi >= 85) rating = 'excellent';
    else if (cqi >= 70) rating = 'good';
    else if (cqi >= 55) rating = 'acceptable';
    else rating = 'poor';

    return { cqi, rating };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialCombustionEfficiencyMeta: AnalyticsModuleMeta = {
    name: 'industrialCombustionEfficiency',
    description: 'industrialCombustionEfficiency',
    category: 'analytics',
    familyTags: ['industrial', 'fire'],
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
