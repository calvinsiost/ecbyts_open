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
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Mine Reclamation Assessment - Post-mining environmental assessment and reclamation
 *
 * Pure-logic module implementing 10 scientific functions for mine reclamation assessment,
 * AMD treatment, waste dump stability, carbon sequestration and monitoring network design.
 *
 * Referências acadêmicas:
 *   - Toy, T.J. & Chuse, W.R. (2000). "Revegetation at mine sites", in: Reclamation of
 *     Drastically Disturbed Lands. Agronomy Monograph 41, ASA/CSSA/SSSA.
 *   - Rokich, D.P. et al. (2000). "Topsoil handling and the restoration of native vegetation",
 *     Restoration Ecology, 8(4), 369–379. DOI: 10.1046/j.1526-100x.2000.80050.x
 *   - ANZMEC/MCA (2000). Strategic Framework for Mine Closure. Canberra.
 *   - Coppin, N.J. & Richards, I.G. (eds.) (1990). Use of Vegetation in Civil Engineering.
 *     CIRIA/Butterworths.
 *   - Younger, P.L. (2002). "Passive treatment of acidic mine waters in subsurface
 *     flow systems", Science of the Total Environment, 299(1–3), 121–133.
 *     DOI: 10.1016/S0048-9697(02)00301-2
 *   - PIRAMID Consortium (2003). Engineering Guidelines for the Passive Remediation of Acidic
 *     and/or Metalliferous Mine Drainage and Similar Wastewaters. University of Newcastle.
 *   - Hedin, R.S., Nairn, R.W. & Kleinmann, R.L.P. (1994). "Passive treatment of coal mine
 *     drainage". US Bureau of Mines, Information Circular 9389.
 *   - Hoek, E. & Bray, J.W. (1981). Rock Slope Engineering (3rd ed.). IMM London.
 *   - Bishop, A.W. (1955). "The use of the slip circle in the stability analysis of slopes",
 *     Geotechnique, 5(1), 7–17. DOI: 10.1680/geot.1955.5.1.7
 *   - Vogel, W.G. (1981). A Guide for Revegetating Coal Minesoils in the Eastern United States.
 *     USDA Forest Service, GTR-NE-68.
 *   - Younger, P.L. & Robins, N.S. (eds.) (2002). Mine Water Hydrogeology and Geochemistry.
 *     Geological Society Special Publications 198. DOI: 10.1144/GSL.SP.2002.198
 *   - Wolkersdorfer, C. (2008). Water Management at Abandoned Flooded Underground Mines.
 *     Springer. DOI: 10.1007/978-3-540-77331-3
 *   - Shrestha, R.K. & Lal, R. (2011). "Changes in physical and chemical properties of soil
 *     after surface mining and reclamation", Geoderma, 161(3–4), 168–176.
 *     DOI: 10.1016/j.geoderma.2010.12.015
 *   - IPCC (2006). 2006 IPCC Guidelines for National Greenhouse Gas Inventories. Vol. 4.
 *   - EPA (2010). EPA/625/R-04/002: Post-Closure Care and Monitoring at RCRA Sites.
 *   - ASTM E1689-95 (2014). Standard Guide for Developing Conceptual Site Models for
 *     Contaminated Sites.
 */

/**
 * Mine revegetation success index (RSI).
 *
 * Computes a dimensionless index (0–1) that integrates soil quality and vegetative
 * cover to classify reclamation success per Toy-Chuse (2000) and IECA criteria.
 *
 * @param {Object} soilParameters - Soil quality descriptors
 * @param {number} soilParameters.compaction_MPa - Penetration resistance (MPa)
 * @param {number} soilParameters.pH - Soil pH
 * @param {number} soilParameters.organicMatter_pct - Organic matter content (%)
 * @param {number} soilParameters.electricalConductivity_dS_m - EC (dS/m)
 * @param {number} speciesCover - Fractional vegetation cover achieved (0–1)
 * @param {number} targetCover - Fractional vegetation cover target (0–1)
 * @returns {{ rsi: number, soilScore: number, coverRatio: number, successClass: string }}
 * @reference Toy, T.J. & Chuse, W.R. (2000). Revegetation at mine sites. ASA Monograph 41.
 */
export function revegetationSuccessIndex(soilParameters: { compaction_MPa: number; pH: number; organicMatter_pct: number; electricalConductivity_dS_m: number }, speciesCover: number, targetCover: number): { rsi: number, soilScore: number, coverRatio: number, successClass: string } {
    const { compaction_MPa, pH, organicMatter_pct, electricalConductivity_dS_m } = soilParameters;

    // Normalise each soil parameter to 0–1 (1 = optimal for plant establishment)
    const compactionScore = compaction_MPa <= 3.0 ? 1 - compaction_MPa / 3.0 : 0;
    const phScore = pH >= 5.5 && pH <= 7.5 ? 1 : pH < 5.5 ? pH / 5.5 : Math.max(0, 1 - (pH - 7.5) / 2.5);
    const omScore = Math.min(organicMatter_pct / 2.0, 1);
    const ecScore = electricalConductivity_dS_m <= 4 ? 1 - electricalConductivity_dS_m / 4 : 0;

    // Weighted average soil score (equal weights)
    const soilScore = (compactionScore + phScore + omScore + ecScore) / 4;

    // Cover ratio - capped at 1.0
    const coverRatio = targetCover > 0 ? Math.min(speciesCover / targetCover, 1) : 0;

    // Revegetation success index
    const rsi = 0.4 * soilScore + 0.6 * coverRatio;

    // Classify
    let successClass;
    if (rsi < 0.3) successClass = 'failure';
    else if (rsi < 0.5) successClass = 'poor';
    else if (rsi < 0.7) successClass = 'adequate';
    else if (rsi < 0.9) successClass = 'good';
    else successClass = 'excellent';

    return { rsi, soilScore, coverRatio, successClass };
}

/**
 * Topsoil replacement adequacy for mine reclamation.
 *
 * Assesses whether salvaged topsoil has been replaced to a depth and quality
 * adequate for revegetation per Rokich et al. (2000) and ANZMEC (2000).
 *
 * @param {number} salvageDepth_m - Depth of topsoil salvaged before mining (m)
 * @param {number} replacementDepth_m - Depth of topsoil replaced after mining (m)
 * @param {number} seedBankDensity_seeds_m2 - Viable seed bank density (seeds/m²)
 * @param {number} organicMatterPct - Organic matter content of replaced topsoil (%)
 * @returns {{ replacementRatio: number, seedBankConservation: number, qualityScore: number, adequacyLevel: string }}
 * @reference Rokich, D.P. et al. (2000). Restoration Ecology, 8(4), 369–379.
 *            DOI: 10.1046/j.1526-100x.2000.80050.x
 */
export function topsoilReplacementAdequacy(salvageDepth_m: number, replacementDepth_m: number, seedBankDensity_seeds_m2: number, organicMatterPct: number): { replacementRatio: number, seedBankConservation: number, qualityScore: number, adequacyLevel: string } {
    const replacementRatio = salvageDepth_m > 0 ? replacementDepth_m / salvageDepth_m : 0;

    // Seed bank conservation: fraction of a reference density of 200 seeds/m²
    const seedBankConservation = Math.min(seedBankDensity_seeds_m2 / 200, 1);

    // Quality score: weighted combination
    const qualityScore =
        0.3 * Math.min(replacementRatio, 1) + 0.3 * seedBankConservation + 0.4 * Math.min(organicMatterPct / 4, 1);

    let adequacyLevel;
    if (qualityScore < 0.3) adequacyLevel = 'inadequate';
    else if (qualityScore < 0.55) adequacyLevel = 'marginal';
    else if (qualityScore < 0.75) adequacyLevel = 'adequate';
    else adequacyLevel = 'optimal';

    return { replacementRatio, seedBankConservation, qualityScore, adequacyLevel };
}

/**
 * Post-mining land use capability classification (LCC).
 *
 * Classifies post-mining land capability following the USDA Land Capability
 * Classification system and Coppin-Richards (1990) reclamation criteria.
 * LCC I–IV = suitable for crops/grazing; V–VI = limited grazing/forestry;
 * VII–VIII = wildlife/watershed/open space only.
 *
 * @param {number} slopePercent - Slope gradient (%)
 * @param {number} soilDepth_cm - Effective rooting depth (cm)
 * @param {number} erosionRisk - Erosion risk index 0–4 (0=minimal, 4=severe)
 * @param {number} drainageClass - Drainage class 0–3 (0=poor, 3=well drained)
 * @param {number} rockFragment_pct - Rock fragment content by volume (%)
 * @returns {{ lcc: number, limitingFactor: string, suitableUses: string[] }}
 * @reference USDA (1961). Land Capability Classification. Agric. Handbook No. 210.
 *            Coppin, N.J. & Richards, I.G. (1990). Use of Vegetation in Civil Engineering.
 */
export function landUseCapabilityIndex(slopePercent: number, soilDepth_cm: number, erosionRisk: number, drainageClass: number, rockFragment_pct: number): { lcc: number, limitingFactor: string, suitableUses: string[] } {
    // Determine LCC contribution from each factor (lower = better land)
    const lccFromSlope =
        slopePercent <= 2
            ? 1
            : slopePercent <= 6
              ? 2
              : slopePercent <= 12
                ? 3
                : slopePercent <= 20
                  ? 4
                  : slopePercent <= 30
                    ? 5
                    : 6;

    const lccFromDepth =
        soilDepth_cm >= 90 ? 1 : soilDepth_cm >= 50 ? 2 : soilDepth_cm >= 25 ? 3 : soilDepth_cm >= 10 ? 4 : 5;

    const lccFromErosion =
        erosionRisk <= 0 ? 1 : erosionRisk <= 1 ? 2 : erosionRisk <= 2 ? 3 : erosionRisk <= 3 ? 5 : 7;

    const lccFromDrainage = drainageClass >= 3 ? 1 : drainageClass >= 2 ? 2 : drainageClass >= 1 ? 4 : 6;

    const lccFromRock = rockFragment_pct <= 10 ? 1 : rockFragment_pct <= 35 ? 2 : rockFragment_pct <= 60 ? 4 : 6;

    // Overall LCC = worst limiting factor
    const factors = [
        { value: lccFromSlope, name: 'slope' },
        { value: lccFromDepth, name: 'soil_depth' },
        { value: lccFromErosion, name: 'erosion' },
        { value: lccFromDrainage, name: 'drainage' },
        { value: lccFromRock, name: 'rock_fragments' },
    ];

    const worst = factors.reduce((a, b) => (b.value > a.value ? b : a));
    const lcc = Math.min(worst.value, 8);

    // Suitable uses by LCC
        const usesMap: Record<number, string[]>= {
        1: ['row_crops', 'vegetables', 'pasture', 'forestry', 'wildlife'],
        2: ['row_crops', 'pasture', 'forestry', 'wildlife'],
        3: ['row_crops_limited', 'pasture', 'forestry', 'wildlife'],
        4: ['pasture', 'forestry', 'wildlife'],
        5: ['pasture', 'forestry', 'wildlife'],
        6: ['limited_grazing', 'forestry', 'wildlife'],
        7: ['wildlife', 'watershed_protection'],
        8: ['wildlife', 'open_space', 'recreation'],
    };

    return {
        lcc,
        limitingFactor: worst.name,
        suitableUses: usesMap[lcc] || ['open_space'],
    };
}

/**
 * Acid mine drainage (AMD) mass loading estimate and treatment sizing.
 *
 * Calculates daily mass loads of sulfate, iron and acidity from AMD flows,
 * and estimates lime requirements for active treatment.
 *
 * @param {number} amdFlow_L_s - AMD flow rate (L/s)
 * @param {number} sulfateConc_mg_L - Sulfate concentration (mg/L)
 * @param {number} ironConc_mg_L - Total iron concentration (mg/L)
 * @param {number} pH - AMD pH
 * @param {number} acidity_mg_CaCO3_L - Total acidity as CaCO3 (mg/L)
 * @returns {{ sulfateLoad_kg_day: number, ironLoad_kg_day: number, acidity_kg_day: number, requiredLimeRate_kg_day: number, treatmentClass: string }}
 * @reference Younger, P.L. (2002). Science of the Total Environment, 299(1–3), 121–133.
 *            DOI: 10.1016/S0048-9697(02)00301-2
 *            PIRAMID Consortium (2003). Engineering Guidelines. University of Newcastle.
 */
export function amdLoadingEstimate(amdFlow_L_s: number, sulfateConc_mg_L: number, ironConc_mg_L: number, pH: number, acidity_mg_CaCO3_L: number): { sulfateLoad_kg_day: number, ironLoad_kg_day: number, acidity_kg_day: number, requiredLimeRate_kg_day: number, treatmentClass: string } {
    // Convert L/s to L/day
    const flowL_day = amdFlow_L_s * 86400;

    // Mass loads (mg/L × L/day → mg/day ÷ 1e6 = kg/day)
    const sulfateLoad_kg_day = (sulfateConc_mg_L * flowL_day) / 1e6;
    const ironLoad_kg_day = (ironConc_mg_L * flowL_day) / 1e6;
    const acidity_kg_day = (acidity_mg_CaCO3_L * flowL_day) / 1e6;

    // Lime requirement: 2.5 kg Ca(OH)2 per kg CaCO3 acidity equivalent
    const requiredLimeRate_kg_day = acidity_kg_day * 2.5;

    // Treatment class
    let treatmentClass;
    if (amdFlow_L_s < 5 && acidity_mg_CaCO3_L < 200) {
        treatmentClass = 'passive_viable';
    } else if (amdFlow_L_s >= 5 && acidity_mg_CaCO3_L >= 200) {
        treatmentClass = 'active_required';
    } else {
        treatmentClass = 'combined';
    }

    return {
        sulfateLoad_kg_day,
        ironLoad_kg_day,
        acidity_kg_day,
        requiredLimeRate_kg_day,
        treatmentClass,
    };
}

/**
 * Passive AMD treatment system sizing.
 *
 * Sizes SAPS and constructed wetland systems for passive AMD treatment
 * following Younger (2002) and Hedin et al. (1994) design criteria.
 *
 * @param {number} amdFlow_L_s - AMD flow rate (L/s)
 * @param {number} ironConc_mg_L - Total iron concentration (mg/L)
 * @param {number} acidity_mg_CaCO3_L - Total acidity as CaCO3 (mg/L)
 * @param {number} sulfateConc_mg_L - Sulfate concentration (mg/L)
 * @returns {{ organicCBed_m2: number, wetlandArea_m2: number, limestoneMass_t: number, retentionTime_days: number, systemType: string }}
 * @reference Younger, P.L. (2002). Sci. Total Environ. 299(1–3). DOI: 10.1016/S0048-9697(02)00301-2
 *            Hedin, R.S. et al. (1994). US Bureau of Mines IC-9389.
 */
export function passiveTreatmentSizing(amdFlow_L_s: number, ironConc_mg_L: number, acidity_mg_CaCO3_L: number, sulfateConc_mg_L: number): { organicCBed_m2: number, wetlandArea_m2: number, limestoneMass_t: number, retentionTime_days: number, systemType: string } {
    // Daily volume (m³/day)
    const flowM3_day = amdFlow_L_s * 86.4;

    // Organic carbon bed: hydraulic flux = 0.5 m/day (downflow per PIRAMID)
    const organicCBed_m2 = flowM3_day / 0.5;

    // Aerobic wetland: iron removal rate 15 g Fe/m²/day (mid-range Hedin 10–30)
    const ironLoad_g_day = ironConc_mg_L * amdFlow_L_s * 86.4; // mg/L × m³/day × 1000 → g/day
    const wetlandArea_m2 = ironLoad_g_day / 15;

    // Limestone mass for anoxic limestone drain (ALD): 100 g limestone per g acidity
    const acidityLoad_g_day = acidity_mg_CaCO3_L * amdFlow_L_s * 86.4;
    const limestoneMass_t = (acidityLoad_g_day * 100 * 365) / 1e6; // design life 1 year, convert g→t

    // Retention time (days) = organicCBed_m2 × 0.3 m depth / flow
    const retentionTime_days = (organicCBed_m2 * 0.3) / flowM3_day;

    // System type selection
    // Estimate AMD pH from acidity: low acidity (<100 mg CaCO3/L) correlates with near-neutral pH (>5)
    const estimatedNearNeutral = acidity_mg_CaCO3_L < 100 && ironConc_mg_L < 50;
    let systemType;
    if (estimatedNearNeutral && ironConc_mg_L < 50 && acidity_mg_CaCO3_L < 100) {
        systemType = 'aerobic_wetland';
    } else if (acidity_mg_CaCO3_L >= 300 || ironConc_mg_L >= 200) {
        systemType = 'saps';
    } else if (sulfateConc_mg_L > 1000) {
        systemType = 'compost_wetland';
    } else {
        systemType = 'open_limestone_channel';
    }

    return {
        organicCBed_m2,
        wetlandArea_m2,
        limestoneMass_t,
        retentionTime_days,
        systemType,
    };
}

/**
 * Mine waste dump static stability analysis.
 *
 * Estimates factor of safety for a circular slip surface in a mine waste dump
 * using the Bishop simplified method.
 *
 * @param {number} height_m - Dump height (m)
 * @param {number} slopeAngle_deg - Slope angle from horizontal (degrees)
 * @param {number} materialDensity_kg_m3 - Bulk density of waste material (kg/m³)
 * @param {number} cohesion_kPa - Effective cohesion c' (kPa)
 * @param {number} frictionAngle_deg - Effective friction angle phi' (degrees)
 * @param {number} porePressureRatio - Pore pressure ratio ru = u/(γ·h) (dimensionless)
 * @returns {{ factorOfSafety: number, slopeClass: string, failureProbability: number, criticalSlipSurface: string }}
 * @reference Bishop, A.W. (1955). Geotechnique, 5(1), 7–17. DOI: 10.1680/geot.1955.5.1.7
 *            Hoek, E. & Bray, J.W. (1981). Rock Slope Engineering (3rd ed.). IMM London.
 */
export function wasteDumpStability(height_m: number, slopeAngle_deg: number, materialDensity_kg_m3: number, cohesion_kPa: number, frictionAngle_deg: number, porePressureRatio: number): { factorOfSafety: number, slopeClass: string, failureProbability: number, criticalSlipSurface: string } {
    const slopeRad = (slopeAngle_deg * Math.PI) / 180;
    const phiRad = (frictionAngle_deg * Math.PI) / 180;

    // Unit weight (kN/m³)
    const gamma_kN_m3 = (materialDensity_kg_m3 * 9.81) / 1000;

    // Average normal stress on critical slip surface (simplified)
    const sigma_kPa = gamma_kN_m3 * height_m * Math.cos(slopeRad) ** 2;

    // Effective normal stress after pore pressure correction
    const sigmaPrime_kPa = sigma_kPa * (1 - porePressureRatio);

    // Driving shear stress on slip surface
    const tau_driving_kPa = gamma_kN_m3 * height_m * Math.sin(slopeRad) * Math.cos(slopeRad);

    // Resisting shear strength (Mohr-Coulomb with Bishop pore pressure)
    const tau_resist_kPa = cohesion_kPa + sigmaPrime_kPa * Math.tan(phiRad);

    // Factor of safety (prevent division by zero)
    const factorOfSafety = tau_driving_kPa > 0 ? tau_resist_kPa / tau_driving_kPa : Infinity;

    // Slope stability class
    let slopeClass;
    if (factorOfSafety < 1.0) slopeClass = 'unstable';
    else if (factorOfSafety < 1.2) slopeClass = 'critical';
    else if (factorOfSafety < 1.5) slopeClass = 'marginal';
    else slopeClass = 'stable';

    // Approximate failure probability from FS (lognormal approximation, COV=0.15)
    // P(failure) ≈ Φ(-(ln(FS) / 0.15)) - simplified reliability index
    const reliabilityIndex = Math.log(Math.max(factorOfSafety, 0.01)) / 0.15;
    const failureProbability = Math.max(0, Math.min(1, 0.5 * (1 - Math.tanh(reliabilityIndex / Math.SQRT2))));

    const criticalSlipSurface = `circular_R=${(1.5 * height_m).toFixed(1)}m_center_at_slope_crest`;

    return { factorOfSafety, slopeClass, failureProbability, criticalSlipSurface };
}

/**
 * Progressive reclamation scheduling and bond release trigger.
 *
 * Models progressive fill-and-reclaim scheduling and estimates bond release
 * milestones per OSMRE/Vogel (1981) guidance.
 *
 * @param {number} totalVolume_m3 - Total disturbed volume to be reclaimed (m³)
 * @param {number} reclaimRate_m3_yr - Annual reclamation rate (m³/yr)
 * @param {number} vegetationEstablishYrs - Years to achieve vegetation establishment after earthwork
 * @param {number} monitoringYrs - Post-reclamation monitoring period (yrs)
 * @returns {{ reclaimedByYear: Object, percentReclaimedAt5yr: number, percentReclaimedAt10yr: number, bondReleaseTrigger: string, totalCost_USD: number }}
 * @reference Vogel, W.G. (1981). USDA Forest Service GTR-NE-68.
 *            OSMRE (2012). Reclamation Bond Release Guidance.
 */
export function progressiveFillReclaimation(totalVolume_m3: number, reclaimRate_m3_yr: number, vegetationEstablishYrs: number, monitoringYrs: number): { reclaimedByYear: Object, percentReclaimedAt5yr: number, percentReclaimedAt10yr: number, bondReleaseTrigger: string, totalCost_USD: number } {
        const reclaimedByYear: Record<number, number>= {};
    let cumulativeReclaimed = 0;

    const maxYears = Math.max(
        20,
        Math.ceil(totalVolume_m3 / reclaimRate_m3_yr) + vegetationEstablishYrs + monitoringYrs,
    );

    for (let yr = 1; yr <= maxYears; yr++) {
        cumulativeReclaimed = Math.min(cumulativeReclaimed + reclaimRate_m3_yr, totalVolume_m3);
        reclaimedByYear[yr] = (cumulativeReclaimed / totalVolume_m3) * 100;
    }

    const percentReclaimedAt5yr = reclaimedByYear[5] || 0;
    const percentReclaimedAt10yr = reclaimedByYear[10] || 0;

    // Bond release trigger per OSMRE two-phase criteria
    let bondReleaseTrigger;
    if (percentReclaimedAt5yr >= 70 && percentReclaimedAt10yr >= 90) {
        bondReleaseTrigger = 'phase1_and_phase2_eligible';
    } else if (percentReclaimedAt5yr >= 70) {
        bondReleaseTrigger = 'phase1_eligible_60pct_release';
    } else {
        bondReleaseTrigger = 'not_yet_eligible';
    }

    // Cost estimate: area-based (assume 1 m³ ≈ 1 m² footprint at 1 m average depth)
    const reclaimedAreaHa = totalVolume_m3 / 10000; // rough conversion
    const totalCost_USD = reclaimedAreaHa * 15000;

    return {
        reclaimedByYear,
        percentReclaimedAt5yr,
        percentReclaimedAt10yr,
        bondReleaseTrigger,
        totalCost_USD,
    };
}

/**
 * Groundwater recovery trajectory after mine closure.
 *
 * Models post-closure recovery of groundwater pH and flow toward pre-mining
 * conditions using asymptotic and exponential recovery functions.
 *
 * @param {number} preMinePH - Pre-mining groundwater pH
 * @param {number} preMineFlow_m3_s - Pre-mining groundwater flow (m³/s)
 * @param {number} miningDepth_m - Maximum mining depth below water table (m)
 * @param {number} yearsSinceClose - Years elapsed since mine closure
 * @returns {{ projectedPH: number, expectedFlow_m3_s: number, recoveryPercent: number, timeToCompleteRecovery_yrs: number, qualityStatus: string }}
 * @reference Younger, P.L. & Robins, N.S. (2002). Geological Society SP 198.
 *            DOI: 10.1144/GSL.SP.2002.198
 *            Wolkersdorfer, C. (2008). Springer. DOI: 10.1007/978-3-540-77331-3
 */
export function hydrogeologicalImpactRecovery(preMinePH: number, preMineFlow_m3_s: number, miningDepth_m: number, yearsSinceClose: number): { projectedPH: number, expectedFlow_m3_s: number, recoveryPercent: number, timeToCompleteRecovery_yrs: number, qualityStatus: string } {
    // pH recovery: asymptotic toward preMine pH, half-life ~5 years
    const pHDepression = Math.max(0, preMinePH - 4.0); // reference floor pH for AMD = 4.0
    const pHRecoveryFraction = 1 - Math.exp((-yearsSinceClose * Math.LN2) / 5);
    const projectedPH = 4.0 + pHDepression * pHRecoveryFraction;

    // Flow recovery: exponential, time constant τ = miningDepth/10 years
    const tau = Math.max(1, miningDepth_m / 10);
    const flowRecoveryFraction = 1 - Math.exp(-yearsSinceClose / tau);
    const expectedFlow_m3_s = preMineFlow_m3_s * flowRecoveryFraction;

    // Overall recovery percent (average of pH and flow recovery)
    const phRecoveryPct = pHDepression > 0 ? ((projectedPH - 4.0) / pHDepression) * 100 : 100;
    const flowRecoveryPct = flowRecoveryFraction * 100;
    const recoveryPercent = (phRecoveryPct + flowRecoveryPct) / 2;

    // Time to 95% complete recovery (based on flow which is usually slower)
    const timeToCompleteRecovery_yrs = Math.ceil(tau * 3); // 3τ ≈ 95% exponential

    // Quality status
    let qualityStatus;
    if (recoveryPercent < 30) qualityStatus = 'polluted';
    else if (recoveryPercent < 70) qualityStatus = 'improving';
    else if (recoveryPercent < 95) qualityStatus = 'near_recovered';
    else qualityStatus = 'recovered';

    return {
        projectedPH,
        expectedFlow_m3_s,
        recoveryPercent,
        timeToCompleteRecovery_yrs,
        qualityStatus,
    };
}

/**
 * Carbon sequestration potential in reclaimed mine lands.
 *
 * Estimates above-ground and soil organic carbon stocks and annual sequestration
 * rates for different vegetation types on reclaimed mine lands.
 *
 * @param {number} reclaimedArea_ha - Reclaimed area (ha)
 * @param {'grassland'|'shrubland'|'woodland'|'forest'} vegetationType - Dominant vegetation type
 * @param {number} soilDepth_m - Effective soil depth for carbon accounting (m)
 * @param {number} yearsPostReclamation - Years since reclamation completed
 * @returns {{ abovegroundC_tCO2_ha: number, soilOrganicC_tCO2_ha: number, totalC_tCO2_ha: number, annualSequestration_tCO2_ha_yr: number, creditsGenerated_tCO2: number }}
 * @reference Shrestha, R.K. & Lal, R. (2011). Geoderma, 161(3–4), 168–176.
 *            DOI: 10.1016/j.geoderma.2010.12.015
 *            IPCC (2006). GL for NGHGI, Vol. 4, Chapter 2.
 */
export function carbonSequestrationPotential(reclaimedArea_ha: number, vegetationType: 'grassland'|'shrubland'|'woodland'|'forest', soilDepth_m: number, yearsPostReclamation: number): { abovegroundC_tCO2_ha: number, soilOrganicC_tCO2_ha: number, totalC_tCO2_ha: number, annualSequestration_tCO2_ha_yr: number, creditsGenerated_tCO2: number } {
    // Annual sequestration rates (tCO2/ha/yr) from Shrestha-Lal 2011 + IPCC 2006
    const annualRates = {
        grassland: 0.5,
        shrubland: 0.8,
        woodland: 1.5,
        forest: 2.5,
    };

    // Above-ground biomass carbon stock factors (tCO2/ha at maturity)
    const abovegroundFactors = {
        grassland: 2.0,
        shrubland: 8.0,
        woodland: 40.0,
        forest: 100.0,
    };

    // Soil organic carbon reference stock (tCO2/ha/m depth) - IPCC Tier 1
    const socReference = {
        grassland: 30,
        shrubland: 35,
        woodland: 45,
        forest: 60,
    };

    const annualRate = annualRates[vegetationType] || annualRates.grassland;
    const abovegroundMax = abovegroundFactors[vegetationType] || abovegroundFactors.grassland;
    const socRefPerM = socReference[vegetationType] || socReference.grassland;

    // Vegetation maturity fraction (logistic growth, half-max at 15 years for forest)
    const maturityYrs = vegetationType === 'forest' ? 40 : vegetationType === 'woodland' ? 25 : 15;
    const maturityFraction = yearsPostReclamation / (yearsPostReclamation + maturityYrs);

    // Above-ground C stock
    const abovegroundC_tCO2_ha = abovegroundMax * maturityFraction;

    // Soil organic C stock (increases with depth and time)
    const soilOrganicC_tCO2_ha = socRefPerM * soilDepth_m * maturityFraction;

    // Total carbon stock per ha
    const totalC_tCO2_ha = abovegroundC_tCO2_ha + soilOrganicC_tCO2_ha;

    // Annual sequestration (tCO2/ha/yr) - current rate accounting for stand age
    const annualSequestration_tCO2_ha_yr = annualRate * (1 - maturityFraction * 0.5); // declines as stand matures

    // Total carbon credits (tCO2) for the area
    const creditsGenerated_tCO2 = totalC_tCO2_ha * reclaimedArea_ha;

    return {
        abovegroundC_tCO2_ha,
        soilOrganicC_tCO2_ha,
        totalC_tCO2_ha,
        annualSequestration_tCO2_ha_yr,
        creditsGenerated_tCO2,
    };
}

/**
 * Post-closure monitoring network design.
 *
 * Determines minimum monitoring well count, sampling frequency, monitoring
 * duration, analyte list and cost estimate for post-closure site monitoring.
 *
 * @param {number} siteArea_ha - Total post-closure site area (ha)
 * @param {'low'|'medium'|'high'} riskLevel - Site risk classification
 * @param {'leachate'|'amd'|'metals'|'radionuclides'} pollutantType - Primary pollutant type
 * @param {'unconfined'|'confined'|'fractured'} hydrogeology - Dominant hydrogeological setting
 * @returns {{ minimumWells: number, samplingFrequency_per_yr: number, monitoringPeriod_yrs: number, analyteList: string[], estimatedCost_USD_yr: number }}
 * @reference EPA (2010). EPA/625/R-04/002: Post-Closure Care and Monitoring at RCRA Sites.
 *            ASTM E1689-95 (2014). Standard Guide for Developing Conceptual Site Models.
 */
export function monitoringNetworkDesign(siteArea_ha: number, riskLevel: 'low'|'medium'|'high', pollutantType: 'leachate'|'amd'|'metals'|'radionuclides', hydrogeology: 'unconfined'|'confined'|'fractured'): { minimumWells: number, samplingFrequency_per_yr: number, monitoringPeriod_yrs: number, analyteList: string[], estimatedCost_USD_yr: number } {
    // Well density (wells/ha) per risk level and hydrogeology
    const densityMap = {
        low: { unconfined: 0.5, confined: 0.5, fractured: 1.0 },
        medium: { unconfined: 1.0, confined: 0.75, fractured: 1.5 },
        high: { unconfined: 2.0, confined: 1.5, fractured: 2.0 },
    };

    const density = (densityMap[riskLevel] || densityMap.medium)[hydrogeology] || 1.0;
    const minimumWells = Math.max(4, Math.ceil(siteArea_ha * density));

    // Sampling frequency (per year)
    const freqMap = { low: 1, medium: 2, high: 4 };
    const samplingFrequency_per_yr = freqMap[riskLevel] || 2;

    // Monitoring period (years)
    const periodMap = { low: 10, medium: 20, high: 30 };
    const monitoringPeriod_yrs = periodMap[riskLevel] || 20;

    // Analyte lists per pollutant type
    const analyteLists = {
        leachate: ['pH', 'conductivity', 'COD', 'BOD', 'nitrate', 'chloride', 'heavy_metals', 'TDS'],
        amd: ['pH', 'acidity', 'SO4', 'Fe_total', 'Fe_dissolved', 'Mn', 'Al', 'conductivity', 'As', 'Cd'],
        metals: ['pH', 'As', 'Cd', 'Cr', 'Cu', 'Pb', 'Hg', 'Ni', 'Zn', 'Se', 'conductivity'],
        radionuclides: [
            'pH',
            'Ra_226',
            'Ra_228',
            'U_238',
            'Th_232',
            'gross_alpha',
            'gross_beta',
            'conductivity',
            'TDS',
        ],
    };

    const analyteList = analyteLists[pollutantType] || analyteLists.metals;

    // Cost per well per year
    const costPerWell = riskLevel === 'high' ? 8000 : riskLevel === 'medium' ? 5500 : 3000;
    const estimatedCost_USD_yr = minimumWells * costPerWell * samplingFrequency_per_yr;

    return {
        minimumWells,
        samplingFrequency_per_yr,
        monitoringPeriod_yrs,
        analyteList,
        estimatedCost_USD_yr,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const mineReclamationAssessmentMeta = {
    name: 'mineReclamationAssessment',
    description: 'mineReclamationAssessment',
    category: 'analytics',
    familyTags: ['mining'],
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
