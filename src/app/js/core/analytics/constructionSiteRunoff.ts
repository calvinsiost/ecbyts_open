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
 * Construction Site Runoff
 * Escoamento superficial em canteiro de obras
 *
 * References / Referências:
 *   US EPA (2012). Construction General Permit (CGP) - NPDES Permit No. CAS000002.
 *     USEPA Office of Water. Washington, DC.
 *   ABNT NBR 10844 (1989). Instalações prediais de águas pluviais. Rio de Janeiro: ABNT.
 *   USDA SCS (1986). Urban Hydrology for Small Watersheds. Technical Release No. 55 (TR-55).
 *     Washington, DC: USDA Soil Conservation Service.
 *   Wischmeier, W.H. & Smith, D.D. (1978). Predicting Rainfall Erosion Losses -
 *     A Guide to Conservation Planning. USDA Agriculture Handbook No. 537.
 *   Renard, K.G. et al. (1997). Predicting Soil Erosion by Water: A Guide to Conservation
 *     Planning with the Revised Universal Soil Loss Equation (RUSLE). USDA-ARS-57.
 *   Barfield, B.J. et al. (1981). Applied Hydrology and Climatology for Engineers.
 *     McGraw-Hill, New York.
 *
 * @module constructionSiteRunoff
 */

// ─── SCS-CN Runoff Model ─────────────────────────────────────────────────────

/**
 * Compute direct runoff depth using the SCS Curve Number method adapted for
 * disturbed construction sites (USDA TR-55).
 * Calcula a profundidade de escoamento direto pelo método SCS-CN adaptado para
 * canteiros de obras com solo perturbado (USDA TR-55).
 *
 * Standard SCS-CN equations (TR-55 §2.1):
 *   S  = (25400 / CN) − 254          (mm)  - potential maximum retention
 *   Ia = 0.2 × S                      (mm)  - initial abstraction
 *   If P > Ia: Q = (P − Ia)² / (P − Ia + S)
 *   If P ≤ Ia: Q = 0
 *
 * Construction sites typically use CN = 90–98 (graded, no vegetation, HSG B/C).
 * Canteiros de obras tipicamente usam CN = 90–98 (terreno gradeado, sem vegetação).
 *
 * @param rainfall_mm    Rainfall depth for the design storm (mm)
 *                       Precipitação total da chuva de projeto (mm)
 * @param curveNumber    SCS Curve Number [1, 100]
 *                       Número de Curva SCS [1, 100]
 * @throws {RangeError} On out-of-range or non-finite inputs
 */
export function scsCurveNumberRunoff(
    rainfall_mm: number,
    curveNumber: number,
): { S_mm: number; Ia_mm: number; Q_mm: number } {
    if (!Number.isFinite(rainfall_mm) || rainfall_mm < 0) {
        throw new RangeError('rainfall_mm must be a non-negative finite number');
    }
    if (!Number.isFinite(curveNumber) || curveNumber <= 0 || curveNumber > 100) {
        throw new RangeError('curveNumber must be in (0, 100]');
    }

    // Retenção potencial máxima S (mm)
    const S_mm = 25400 / curveNumber - 254;

    // Abstração inicial Ia = 0.2 × S
    const Ia_mm = 0.2 * S_mm;

    let Q_mm = 0;
    if (rainfall_mm > Ia_mm) {
        const diff = rainfall_mm - Ia_mm;
        Q_mm = (diff * diff) / (diff + S_mm);
    }

    return { S_mm, Ia_mm, Q_mm };
}

/**
 * Estimate sediment yield from a construction site using a modified USLE/RUSLE.
 * Estima a produção de sedimentos de um canteiro de obras usando a EUPS/RUSLE modificada.
 *
 * A = R × K × LS × C × P  (t/ha/year)
 * where:
 *   R  = rainfall-runoff erosivity factor (MJ·mm/(ha·h·year))
 *   K  = soil erodibility factor (t·ha·h / (ha·MJ·mm))
 *   LS = slope length-steepness factor (dimensionless)
 *   C  = cover-management factor (dimensionless, 0–1)
 *   P  = support practice factor (dimensionless, 0–1)
 *
 * For construction sites:
 *   C ≈ 1.0 (bare soil) to 0.01 (seeded/mulched) - Renard et al. (1997)
 *   P ≈ 1.0 (no practices) or per BMP effectiveness
 *
 * @param R_factor    Rainfall erosivity (MJ·mm/(ha·h·year))
 * @param K_factor    Soil erodibility (t·ha·h / (ha·MJ·mm))
 * @param LS_factor   Topographic factor (dimensionless, > 0)
 * @param C_factor    Cover-management factor [0, 1]
 * @param P_factor    Support practice factor [0, 1]
 * @param area_ha     Site area (ha)
 * @throws {RangeError} On invalid inputs
 */
export function rusleSedimentYield(
    R_factor: number,
    K_factor: number,
    LS_factor: number,
    C_factor: number,
    P_factor: number,
    area_ha: number,
): { A_t_ha_yr: number; totalSediment_t_yr: number } {
    if (!Number.isFinite(R_factor) || R_factor <= 0) {
        throw new RangeError('R_factor must be a positive finite number');
    }
    if (!Number.isFinite(K_factor) || K_factor <= 0) {
        throw new RangeError('K_factor must be a positive finite number');
    }
    if (!Number.isFinite(LS_factor) || LS_factor <= 0) {
        throw new RangeError('LS_factor must be a positive finite number');
    }
    if (!Number.isFinite(C_factor) || C_factor < 0 || C_factor > 1) {
        throw new RangeError('C_factor must be in [0, 1]');
    }
    if (!Number.isFinite(P_factor) || P_factor < 0 || P_factor > 1) {
        throw new RangeError('P_factor must be in [0, 1]');
    }
    if (!Number.isFinite(area_ha) || area_ha <= 0) {
        throw new RangeError('area_ha must be a positive finite number');
    }

    const A_t_ha_yr = R_factor * K_factor * LS_factor * C_factor * P_factor;
    const totalSediment_t_yr = A_t_ha_yr * area_ha;

    return { A_t_ha_yr, totalSediment_t_yr };
}

/**
 * Calculate required sediment basin volume for a construction site.
 * Calcula o volume necessário de bacia de sedimentação para canteiro de obras.
 *
 * Based on US EPA NPDES CGP requirements and Barfield et al. (1981):
 *   V_basin = Q_runoff × t_detention × Ar
 * where:
 *   Q_runoff     = peak runoff rate (m³/s)
 *   t_detention  = required detention time (s) - typically 1800–7200 s (0.5–2 h)
 *   Ar           = area-volume ratio coefficient (typically 1.0–1.5 for safety factor)
 *
 * EPA CGP specifies 3600 s (1 hour) minimum detention for Qs ≤ 0.028 m³/s.
 * EPA CGP especifica 3600 s (1 hora) de detenção mínima para Qs ≤ 0.028 m³/s.
 *
 * @param peakRunoff_m3s        Peak runoff flow rate (m³/s)
 * @param detentionTime_s       Required detention time (s)
 * @param safetyFactor          Safety factor for basin sizing
 * @throws {RangeError} On invalid inputs
 */
export function sedimentBasinVolume(
    peakRunoff_m3s: number,
    detentionTime_s: number,
    safetyFactor: number = 1.25,
): number {
    if (!Number.isFinite(peakRunoff_m3s) || peakRunoff_m3s <= 0) {
        throw new RangeError('peakRunoff_m3s must be a positive finite number');
    }
    if (!Number.isFinite(detentionTime_s) || detentionTime_s <= 0) {
        throw new RangeError('detentionTime_s must be a positive finite number');
    }
    if (!Number.isFinite(safetyFactor) || safetyFactor < 1) {
        throw new RangeError('safetyFactor must be >= 1');
    }

    return peakRunoff_m3s * detentionTime_s * safetyFactor;
}

/**
 * Estimate sediment trap efficiency of a Best Management Practice (BMP)
 * using the simplified trap efficiency model for construction sites.
 * Estima a eficiência de retenção de sedimentos de uma BMP usando o modelo
 * simplificado de eficiência de armadilha para canteiros de obras.
 *
 * Based on Brune (1953) curve modified for construction BMPs:
 *   E = 1 − exp(−k × t_s)
 * where:
 *   k   = first-order settling coefficient (1/s), related to particle size and Vs
 *   t_s = hydraulic residence time (s) = V_basin / Q_in
 *
 * Settling velocity Vs (m/s) for silt particles (D = 10–50 μm) via Stokes:
 *   Vs = g × (ρs − ρw) × D² / (18 × μ)
 *   At 20°C: μ = 1.002×10⁻³ Pa·s, ρw = 998 kg/m³
 *
 * @param particleDiameter_m   Median particle diameter (m), e.g. 20e-6 for silt
 * @param particleDensity_kg_m3 Particle density (kg/m³), typically 2650 (quartz)
 * @param basinVolume_m3       Sediment basin volume (m³)
 * @param inflowRate_m3s       Mean inflow rate (m³/s)
 * @throws {RangeError} On invalid inputs
 */
export function bmpTrapEfficiency(
    particleDiameter_m: number,
    particleDensity_kg_m3: number,
    basinVolume_m3: number,
    inflowRate_m3s: number,
): { settlingVelocity_ms: number; residenceTime_s: number; trapEfficiency: number } {
    if (!Number.isFinite(particleDiameter_m) || particleDiameter_m <= 0) {
        throw new RangeError('particleDiameter_m must be a positive finite number');
    }
    if (!Number.isFinite(particleDensity_kg_m3) || particleDensity_kg_m3 <= 0) {
        throw new RangeError('particleDensity_kg_m3 must be a positive finite number');
    }
    if (!Number.isFinite(basinVolume_m3) || basinVolume_m3 <= 0) {
        throw new RangeError('basinVolume_m3 must be a positive finite number');
    }
    if (!Number.isFinite(inflowRate_m3s) || inflowRate_m3s <= 0) {
        throw new RangeError('inflowRate_m3s must be a positive finite number');
    }

    // Velocidade de sedimentação de Stokes (20°C)
    // Stokes settling velocity at 20°C
    const g = 9.81; // m/s²
    const rho_w = 998; // kg/m³ (água a 20°C)
    const mu = 1.002e-3; // Pa·s (viscosidade dinâmica a 20°C)
    const rho_s = particleDensity_kg_m3;
    const D = particleDiameter_m;

    const settlingVelocity_ms = (g * (rho_s - rho_w) * D * D) / (18 * mu);

    // Tempo de residência hidráulico tr = V / Q
    const residenceTime_s = basinVolume_m3 / inflowRate_m3s;

    // Eficiência de retenção: E = 1 − exp(−Vs × tr / H_eff)
    // H_eff = effective depth ≈ (V/A)^0.5 approximation; simplify using k = Vs directly
    // Simplificação: E = Vs × tr / (Vs × tr + overflow_rate), equivalente para tanques ideais
    // Using first-order model: E = 1 - exp(-Vs * tr / depth)
    // depth approximated as (V)^(1/3) for square basin
    const depth_m = Math.pow(basinVolume_m3, 1 / 3);
    const trapEfficiency = Math.min(1, 1 - Math.exp((-settlingVelocity_ms * residenceTime_s) / depth_m));

    return { settlingVelocity_ms, residenceTime_s, trapEfficiency };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const constructionSiteRunoffMeta: AnalyticsModuleMeta = {
    name: 'constructionSiteRunoff',
    description: 'constructionSiteRunoff',
    category: 'analytics',
    familyTags: ['construction', 'stormwater'],
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
