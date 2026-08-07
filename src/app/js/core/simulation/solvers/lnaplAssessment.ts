'use strict';
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// LNAPL Assessment - Lenhard-Parker thickness correction, Charbeneau transmissivity,
// smear zone, volumetrics, mass discharge, dissolution flux, Raoult's Law,
// tier-1 risk screening, recoverability, van Genuchten saturation profile.
//
// Referencias academicas:
//   Lenhard & Parker (1990) Water Resour. Res. 26(3):399-411 DOI:10.1029/WR026i003p00399
//   Charbeneau (2007) API LNAPL Transmissivity Workbook, API Publ. 4762
//   Huntley (2000) Ground Water Monit. Remediat. 20(4):136 DOI:10.1111/j.1745-6592.2000.tb00286.x
//   Einarson & Mackay (2001) Environ. Sci. Technol. 35(1):66A DOI:10.1021/es012371t
//   Mayer & Hassanizadeh (2005) Vadose Zone J. 4(4):848 DOI:10.2113/4.4.848
//   van Genuchten (1980) Soil Sci. Soc. Am. J. 44(5):892 DOI:10.2136/sssaj1980.03615995004400050002x
//   USEPA (2004) EPA/600/R-04/020 LNAPL Tier-1 Risk Screening
//   API (2003) API LNAPL Distribution and Recovery (LDRM), API Publ. 4760

interface ApparentThicknessResult {
    observedM: number;
    actualM: number;
    correctionFactor: number;
}

/**
 * Lenhard & Parker (1990) apparent vs actual LNAPL thickness correction.
 * actualThicknessM = observedThicknessM × (ρw - ρo) / ρw
 *
 * @param observedThicknessM - Observed (apparent) LNAPL thickness in monitoring well [m]
 * @param fluidDensityKgm3   - LNAPL (oil) density [kg/m³]
 * @param waterDensityKgm3   - Water density [kg/m³], typically 1000
 * @returns
 * @throws RangeError if LNAPL density ≥ water density (LNAPL must be lighter)
 */
export function lnaplApparentThickness(
    observedThicknessM: number,
    fluidDensityKgm3: number,
    waterDensityKgm3: number,
): ApparentThicknessResult {
    if (fluidDensityKgm3 >= waterDensityKgm3) {
        throw new RangeError(
            `LNAPL density (${fluidDensityKgm3} kg/m³) must be less than water density (${waterDensityKgm3} kg/m³)`,
        );
    }
    if (observedThicknessM < 0) {
        throw new RangeError(`observedThicknessM must be >= 0, got ${observedThicknessM}`);
    }
    const correctionFactor = (waterDensityKgm3 - fluidDensityKgm3) / waterDensityKgm3;
    const actualM = observedThicknessM * correctionFactor;
    return Object.freeze({ observedM: observedThicknessM, actualM, correctionFactor });
}

type RelPermFunction = 'linear' | 'vanGenuchten' | 'brooks-corey';

interface TransmissivityResult {
    transmissivityM2s: number;
    gradientAttenuation: number;
    recoveryPotential: string;
}

/**
 * Charbeneau (2007) API LNAPL transmissivity framework.
 * T_n = krMax × Kw × b_n (linear); with correction for van Genuchten and Brooks-Corey models.
 *
 * @param actualThicknessM       - Actual LNAPL thickness [m] (from lnaplApparentThickness)
 * @param krMax                  - Maximum relative permeability of LNAPL (0–1)
 * @param hydraulicConductivityMs - Water-saturated hydraulic conductivity [m/s]
 * @param relPermFunction
 * @returns
 */
export function lnaplTransmissivity(
    actualThicknessM: number,
    krMax: number,
    hydraulicConductivityMs: number,
    relPermFunction: RelPermFunction = 'linear',
): TransmissivityResult {
    if (actualThicknessM < 0) throw new RangeError(`actualThicknessM must be >= 0, got ${actualThicknessM}`);
    if (krMax <= 0 || krMax > 1) throw new RangeError(`krMax must be in (0, 1], got ${krMax}`);
    if (hydraulicConductivityMs <= 0) {
        throw new RangeError(`hydraulicConductivityMs must be > 0, got ${hydraulicConductivityMs}`);
    }

    let correctionFactor: number;
    switch (relPermFunction) {
        case 'vanGenuchten':
            // Charbeneau (2007) Table 4-1 simplified correction factor
            correctionFactor = 0.75;
            break;
        case 'brooks-corey':
            // Brooks-Corey simplified correction factor (Charbeneau 2007)
            correctionFactor = 0.85;
            break;
        case 'linear':
        default:
            correctionFactor = 1.0;
            break;
    }

    const transmissivityM2s = krMax * hydraulicConductivityMs * actualThicknessM * correctionFactor;

    // Gradient attenuation: ratio of LNAPL to water transmissivity potential
    const gradientAttenuation = krMax * correctionFactor;

    let recoveryPotential: string;
    if (transmissivityM2s > 1e-6) {
        recoveryPotential = 'high';
    } else if (transmissivityM2s > 1e-8) {
        recoveryPotential = 'moderate';
    } else {
        recoveryPotential = 'low';
    }

    return Object.freeze({ transmissivityM2s, gradientAttenuation, recoveryPotential });
}

interface SmearZoneResult {
    smearZoneM: number;
    residualLnaplZoneM: number;
    sourceZonePersistence: string;
}

/**
 * Huntley (2000) smear zone vertical extent from water table fluctuation.
 * smearZoneM = waterTableFluctuationM × (specificYield / (specificYield - residualSaturation))
 *
 * @param waterTableFluctuationM - Seasonal water table fluctuation [m]
 * @param specificYield          - Specific yield (drainable porosity) [dimensionless]
 * @param residualSaturation     - Residual LNAPL saturation [dimensionless]
 * @returns
 */
export function smearZoneThickness(
    waterTableFluctuationM: number,
    specificYield: number,
    residualSaturation: number,
): SmearZoneResult {
    if (waterTableFluctuationM < 0) {
        throw new RangeError(`waterTableFluctuationM must be >= 0, got ${waterTableFluctuationM}`);
    }
    if (specificYield <= 0 || specificYield >= 1) {
        throw new RangeError(`specificYield must be in (0, 1), got ${specificYield}`);
    }
    if (residualSaturation < 0 || residualSaturation >= specificYield) {
        throw new RangeError(`residualSaturation must be in [0, specificYield), got ${residualSaturation}`);
    }

    const smearZoneM = waterTableFluctuationM * (specificYield / (specificYield - residualSaturation));
    const residualLnaplZoneM = smearZoneM * 0.6;
    const sourceZonePersistence = smearZoneM > 0.5 ? 'decades' : 'years';

    return Object.freeze({ smearZoneM, residualLnaplZoneM, sourceZonePersistence });
}

interface LnaplVolumeResult {
    volumeM3: number;
    volumeLiters: number;
    massKg: number;
    residualFractionM3: number;
}

/**
 * Volumetric LNAPL estimation in pore space.
 * volumeM3 = areaM2 × lnaplThicknessM × porosity × (1 - residualSaturation / porosity)
 *
 * @param lnaplThicknessM    - LNAPL thickness [m]
 * @param porosity           - Total porosity [dimensionless]
 * @param residualSaturation - Residual LNAPL saturation [dimensionless]
 * @param areaM2             - Source zone area [m²]
 * @param densityKgm3  - LNAPL density [kg/m³] (default: gasoline ~750)
 * @returns
 */
export function lnaplVolumePoreSpace(
    lnaplThicknessM: number,
    porosity: number,
    residualSaturation: number,
    areaM2: number,
    densityKgm3: number = 750,
): LnaplVolumeResult {
    if (lnaplThicknessM < 0) throw new RangeError(`lnaplThicknessM must be >= 0, got ${lnaplThicknessM}`);
    if (porosity <= 0 || porosity >= 1) throw new RangeError(`porosity must be in (0, 1), got ${porosity}`);
    if (residualSaturation < 0 || residualSaturation > porosity) {
        throw new RangeError(`residualSaturation must be in [0, porosity], got ${residualSaturation}`);
    }
    if (areaM2 <= 0) throw new RangeError(`areaM2 must be > 0, got ${areaM2}`);
    if (densityKgm3 <= 0) throw new RangeError(`densityKgm3 must be > 0, got ${densityKgm3}`);

    const volumeM3 = areaM2 * lnaplThicknessM * porosity * (1 - residualSaturation / porosity);
    const volumeLiters = volumeM3 * 1000;
    const massKg = volumeM3 * densityKgm3;
    const residualFractionM3 = areaM2 * lnaplThicknessM * residualSaturation;

    return Object.freeze({ volumeM3, volumeLiters, massKg, residualFractionM3 });
}

interface MassDischargeResult {
    massFluxGm2d: number;
    massDischargeGd: number;
    massDischargeKgYr: number;
}

/**
 * Einarson & Mackay (2001) mass flux/discharge transect method.
 * C [mg/L] = C [g/m³]; q [m/s] → m/d via ×86400
 * massFluxGm2d = concentrationMgL × flowRateMs × 86400
 * massDischargeGd = massFluxGm2d × screenLengthM × screenWidthM
 *
 * @param concentrationMgL  - Groundwater concentration at transect [mg/L]
 * @param flowRateMs        - Linear groundwater velocity (Darcy flux / n_e) [m/s]
 * @param screenLengthM     - Screen length of transect [m]
 * @param screenWidthM      - Screen width (perpendicular to flow) [m]
 * @returns
 */
export function lnaplMassDischargeMigration(
    concentrationMgL: number,
    flowRateMs: number,
    screenLengthM: number,
    screenWidthM: number,
): MassDischargeResult {
    if (concentrationMgL < 0) throw new RangeError(`concentrationMgL must be >= 0, got ${concentrationMgL}`);
    if (flowRateMs <= 0) throw new RangeError(`flowRateMs must be > 0, got ${flowRateMs}`);
    if (screenLengthM <= 0) throw new RangeError(`screenLengthM must be > 0, got ${screenLengthM}`);
    if (screenWidthM <= 0) throw new RangeError(`screenWidthM must be > 0, got ${screenWidthM}`);

    // C [mg/L] = g/m³; q [m/s] × 86400 s/d = q [m/d]
    // massFlux [g/m²/d] = C [g/m³] × q [m/d]
    const massFluxGm2d = concentrationMgL * flowRateMs * 86400;
    const massDischargeGd = massFluxGm2d * screenLengthM * screenWidthM;
    const massDischargeKgYr = (massDischargeGd * 365) / 1000;

    return Object.freeze({ massFluxGm2d, massDischargeGd, massDischargeKgYr });
}

interface DissolutionFluxResult {
    fluxMgM2d: number;
    totalDissolutionMgD: number;
    halfLifeYrs: number;
}

/**
 * First-order mass transfer from LNAPL pool (Mayer & Hassanizadeh 2005).
 * fluxMgM2d = massTransferCoeff [1/d] × saturationFraction × effectiveSolubilityMgL × 86400
 * Note: massTransferCoeff in [1/d], flux result in [mg/m²/d]
 *
 * @param saturationFraction       - LNAPL saturation as fraction (0–1)
 * @param effectiveSolubilityMgL   - Effective solubility of contaminant [mg/L]
 * @param massTransferCoeff        - First-order mass transfer coefficient [1/d]
 * @param contactAreaM2            - LNAPL-water contact area [m²]
 * @returns
 */
export function lnaplDissolutionFlux(
    saturationFraction: number,
    effectiveSolubilityMgL: number,
    massTransferCoeff: number,
    contactAreaM2: number,
): DissolutionFluxResult {
    if (saturationFraction < 0 || saturationFraction > 1) {
        throw new RangeError(`saturationFraction must be in [0, 1], got ${saturationFraction}`);
    }
    if (effectiveSolubilityMgL < 0) {
        throw new RangeError(`effectiveSolubilityMgL must be >= 0, got ${effectiveSolubilityMgL}`);
    }
    if (massTransferCoeff <= 0) {
        throw new RangeError(`massTransferCoeff must be > 0, got ${massTransferCoeff}`);
    }
    if (contactAreaM2 <= 0) {
        throw new RangeError(`contactAreaM2 must be > 0, got ${contactAreaM2}`);
    }

    // massTransferCoeff [1/d], effective concentration [mg/L = mg/dm³ = g/m³]
    // flux [mg/m²/d] = k [1/d] × S × Ceff [mg/L]
    // Note: units are consistent when treating mg/L as mg per litre of pore water
    // per unit area per day. The coefficient absorbs unit geometry.
    const fluxMgM2d = massTransferCoeff * saturationFraction * effectiveSolubilityMgL;
    const totalDissolutionMgD = fluxMgM2d * contactAreaM2;
    const halfLifeYrs = 0.693 / massTransferCoeff / 365;

    return Object.freeze({ fluxMgM2d, totalDissolutionMgD, halfLifeYrs });
}

interface SolubilityComponent {
    compound: string;
    mole_fraction: number;
    solubility: number;
}

interface SolubilitySingleResult {
    effectiveSolubilityMgL: number;
    reductionFactor: number;
    saturationEquivalentMgL: number;
}

interface SolubilityArrayResult {
    compound: string;
    effectiveSolubilityMgL: number;
    reductionFactor: number;
    saturationEquivalentMgL: number;
}

/**
 * Raoult's Law effective solubility for LNAPL mixture component.
 * C_eff = moleFraction × pureComponentSolubilityMgL
 *
 * Array overload: if first argument is an array of {compound, mole_fraction, solubility},
 * returns an array of results.
 *
 * @param moleFraction
 * @param pureComponentSolubilityMgL
 * @returns
 */
export function effectiveSolubility(
    moleFraction: number | SolubilityComponent[],
    pureComponentSolubilityMgL?: number,
): SolubilitySingleResult | SolubilityArrayResult[] {
    // Array overload
    if (Array.isArray(moleFraction)) {
        return moleFraction.map((item) => {
            const xf = item.mole_fraction;
            const cs = item.solubility;
            const ceff = xf * cs;
            return Object.freeze({
                compound: item.compound,
                effectiveSolubilityMgL: ceff,
                reductionFactor: xf,
                saturationEquivalentMgL: ceff,
            });
        });
    }

    if (moleFraction < 0 || moleFraction > 1) {
        throw new RangeError(`moleFraction must be in [0, 1], got ${moleFraction}`);
    }
    const _solubility = pureComponentSolubilityMgL as number;
    if (_solubility < 0) {
        throw new RangeError(`pureComponentSolubilityMgL must be >= 0, got ${_solubility}`);
    }

    const ceff = moleFraction * _solubility;
    return Object.freeze({
        effectiveSolubilityMgL: ceff,
        reductionFactor: moleFraction,
        saturationEquivalentMgL: ceff,
    });
}

interface TierOneRiskResult {
    attenuatedConcentrationMgL: number;
    hazardQuotient: number;
    riskLevel: string;
    requiresRemediation: boolean;
}

/**
 * USEPA LNAPL tier-1 risk screening (EPA/600/R-04/020).
 * Simplified exponential dilution-attenuation factor (DAF):
 *   attenuatedConc = maxGroundwaterConcentrationMgL × exp(-attenuation × distanceM)
 *   hazardQuotient = attenuatedConc / mcl_mgL
 *
 * @param maxGroundwaterConcentrationMgL - Source zone peak groundwater concentration [mg/L]
 * @param mcl_mgL                         - Maximum contaminant level / threshold [mg/L]
 * @param distanceM                        - Distance from source to receptor [m]
 * @param attenuation                      - Natural attenuation rate coefficient [1/m]
 * @returns
 */
export function lnaplTierOneRisk(
    maxGroundwaterConcentrationMgL: number,
    mcl_mgL: number,
    distanceM: number,
    attenuation: number,
): TierOneRiskResult {
    if (maxGroundwaterConcentrationMgL < 0) {
        throw new RangeError(`maxGroundwaterConcentrationMgL must be >= 0`);
    }
    if (mcl_mgL <= 0) throw new RangeError(`mcl_mgL must be > 0, got ${mcl_mgL}`);
    if (distanceM < 0) throw new RangeError(`distanceM must be >= 0, got ${distanceM}`);
    if (attenuation < 0) throw new RangeError(`attenuation must be >= 0, got ${attenuation}`);

    const attenuatedConcentrationMgL = maxGroundwaterConcentrationMgL * Math.exp(-attenuation * distanceM);
    const hazardQuotient = attenuatedConcentrationMgL / mcl_mgL;

    let riskLevel: string;
    if (hazardQuotient > 10) {
        riskLevel = 'high';
    } else if (hazardQuotient > 1) {
        riskLevel = 'moderate';
    } else {
        riskLevel = 'low';
    }

    return Object.freeze({
        attenuatedConcentrationMgL,
        hazardQuotient,
        riskLevel,
        requiresRemediation: hazardQuotient > 1,
    });
}

interface RecoverabilityResult {
    maxNaturalFlowM3s: number;
    recoveryEfficiency: number;
    strategy: string;
    feasible: boolean;
}

/**
 * LNAPL recoverability screening (API 2003 LDRM).
 * Simplified radial flow: Q_max = 2π × T_n × gradient × wellRadiusM
 * recoveryEfficiency = min(pumpingRateM3s / Q_max, 1.0)
 *
 * @param transmissivityM2s  - LNAPL transmissivity [m²/s]
 * @param gradientMs         - Hydraulic gradient [m/m = dimensionless, but written as m/s context]
 * @param wellRadiusM        - Well radius [m]
 * @param pumpingRateM3s     - Designed pumping rate [m³/s]
 * @returns
 */
export function lnaplRecoverability(
    transmissivityM2s: number,
    gradientMs: number,
    wellRadiusM: number,
    pumpingRateM3s: number,
): RecoverabilityResult {
    if (transmissivityM2s < 0) throw new RangeError(`transmissivityM2s must be >= 0, got ${transmissivityM2s}`);
    if (gradientMs < 0) throw new RangeError(`gradientMs must be >= 0, got ${gradientMs}`);
    if (wellRadiusM <= 0) throw new RangeError(`wellRadiusM must be > 0, got ${wellRadiusM}`);
    if (pumpingRateM3s < 0) throw new RangeError(`pumpingRateM3s must be >= 0, got ${pumpingRateM3s}`);

    const maxNaturalFlowM3s = 2 * Math.PI * transmissivityM2s * gradientMs * wellRadiusM;

    let recoveryEfficiency: number;
    if (maxNaturalFlowM3s === 0) {
        recoveryEfficiency = 0;
    } else {
        recoveryEfficiency = Math.min(pumpingRateM3s / maxNaturalFlowM3s, 1.0);
    }

    let strategy: string;
    if (recoveryEfficiency > 0.7) {
        strategy = 'skimmer';
    } else if (recoveryEfficiency > 0.3) {
        strategy = 'enhanced';
    } else {
        strategy = 'passive';
    }

    return Object.freeze({
        maxNaturalFlowM3s,
        recoveryEfficiency,
        strategy,
        feasible: recoveryEfficiency > 0.05,
    });
}

interface SaturationProfilePoint {
    depthM: number;
    pressureHeadM: number;
    waterSaturation: number;
    lnaplSaturation: number;
    airSaturation: number;
}

/**
 * van Genuchten (1980) saturation profile above water table with LNAPL.
 * Se = (1 + (alpha × |h|)^n)^(-m), m = 1 - 1/n
 * LNAPL zone (waterTableM to waterTableM + lnaplThicknessM): water saturation reduced by 0.3
 * Air saturation = 1 - waterSaturation - lnaplSaturation
 *
 * @param depthsM          - Array of observation depths [m] (positive downward from surface)
 * @param waterTableM      - Depth to water table [m]
 * @param lnaplThicknessM  - LNAPL thickness above water table [m]
 * @param vanGenuchtenAlpha - van Genuchten alpha parameter [1/m]
 * @param vanGenuchtenN     - van Genuchten n parameter (>1)
 * @returns
 */
export function lnaplSaturationProfile(
    depthsM: number[],
    waterTableM: number,
    lnaplThicknessM: number,
    vanGenuchtenAlpha: number,
    vanGenuchtenN: number,
): ReadonlyArray<SaturationProfilePoint> {
    if (!Array.isArray(depthsM) || depthsM.length === 0) {
        throw new RangeError('depthsM must be a non-empty array');
    }
    if (waterTableM < 0) throw new RangeError(`waterTableM must be >= 0, got ${waterTableM}`);
    if (lnaplThicknessM < 0) throw new RangeError(`lnaplThicknessM must be >= 0, got ${lnaplThicknessM}`);
    if (vanGenuchtenAlpha <= 0) {
        throw new RangeError(`vanGenuchtenAlpha must be > 0, got ${vanGenuchtenAlpha}`);
    }
    if (vanGenuchtenN <= 1) {
        throw new RangeError(`vanGenuchtenN must be > 1, got ${vanGenuchtenN}`);
    }

    const m = 1 - 1 / vanGenuchtenN;
    const lnaplTopM = waterTableM - lnaplThicknessM; // shallower than water table

    return Object.freeze(
        depthsM.map((depthM) => {
            // Pressure head: positive above water table (tension/suction), negative below
            const pressureHeadM = waterTableM - depthM;

            let waterSaturation: number;
            if (pressureHeadM <= 0) {
                // Below water table: fully saturated
                waterSaturation = 1.0;
            } else {
                // Above water table: van Genuchten retention curve
                const h = pressureHeadM; // |h| since h > 0 here
                const Se = Math.pow(1 + Math.pow(vanGenuchtenAlpha * h, vanGenuchtenN), -m);
                // Effective saturation Se maps to actual saturation (assuming Sr_w ≈ 0 for simplicity)
                waterSaturation = Se;
            }

            // Determine if this depth is in the LNAPL zone
            // LNAPL zone: depthM is between lnaplTopM and waterTableM
            const inLnaplZone = depthM >= lnaplTopM && depthM <= waterTableM;
            let lnaplSaturation = 0;
            if (inLnaplZone && lnaplThicknessM > 0) {
                // Reduce water saturation in LNAPL zone by 0.3 to account for LNAPL presence
                const reduction = Math.min(0.3, waterSaturation);
                waterSaturation = waterSaturation - reduction;
                lnaplSaturation = reduction;
            }

            // Ensure non-negative
            waterSaturation = Math.max(0, waterSaturation);
            lnaplSaturation = Math.max(0, lnaplSaturation);

            // Air fills the rest
            const airSaturation = Math.max(0, 1 - waterSaturation - lnaplSaturation);

            return Object.freeze({
                depthM,
                pressureHeadM,
                waterSaturation,
                lnaplSaturation,
                airSaturation,
            });
        }),
    ) as ReadonlyArray<SaturationProfilePoint>;
}
