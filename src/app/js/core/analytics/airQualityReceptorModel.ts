// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// airQualityReceptorModel.js - Air Quality Receptor Modeling
// Modelagem de receptor de qualidade do ar: CMB, fator de enriquecimento e trajetória retrógrada.
// Refs: Watson et al. (1984) Atmos Environ CMB7; Hopke (1991) Receptor Modeling for AQM;
//       WHO (2021) Global Air Quality Guidelines; CETESB (2022) Qualidade do Ar Estado de SP

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
 * Compute Chemical Mass Balance (CMB) source contributions.
 * Calcula contribuições de fontes pelo balanço de massa química (CMB simplificado - mínimos quadrados).
 *
 * @param receptor_concentrations - Observed concentrations at receptor [n_species].
 * @param source_profiles - Matrix [n_sources × n_species] of source profiles.
 * @throws {TypeError} If inputs are not arrays.
 * @throws {RangeError} If dimensions are incompatible or arrays are empty.
 */
export function computeChemicalMassBalance(
    receptor_concentrations: number[],
    source_profiles: number[][],
): { source_contributions: number[]; explained_variance: number } {
    if (!Array.isArray(receptor_concentrations)) throw new TypeError('receptor_concentrations must be an array');
    if (!Array.isArray(source_profiles)) throw new TypeError('source_profiles must be an array');
    const n_species = receptor_concentrations.length;
    if (n_species === 0) throw new RangeError('receptor_concentrations must not be empty');
    if (source_profiles.length === 0) throw new RangeError('source_profiles must not be empty');
    const n_sources = source_profiles.length;
    for (const row of source_profiles) {
        if (!Array.isArray(row) || row.length !== n_species) {
            throw new RangeError(`Each source profile must have ${n_species} species values`);
        }
    }

    // Pseudo-inverse via normal equations: contributions = (S'S)^-1 S' r
    // Para n_sources pequeno, resolvemos analyticamente (≤4×4) ou aproximamos
    // Solução: ordinary least squares by Gram matrix
    // Gram matrix G[i,j] = sum_k S[i,k]*S[j,k]
    const G = Array.from({ length: n_sources }, (_, i) =>
        Array.from({ length: n_sources }, (__, j) =>
            source_profiles[i]!.reduce((s, _, k) => s + source_profiles[i]![k]! * source_profiles[j]![k]!, 0),
        ),
    );
    // Right-hand side b[i] = sum_k S[i,k]*r[k]
    const b = source_profiles.map((sp) => sp.reduce((s, val, k) => s + val * receptor_concentrations[k]!, 0));

    // Solve G * x = b via Gaussian elimination
    const contributions = _solveLinear(G, b);

    // Explained variance: 1 - RSS/TSS
    const predicted = receptor_concentrations.map((_, k) =>
        contributions.reduce((s, c, i) => s + c * source_profiles[i]![k]!, 0),
    );
    const rss = receptor_concentrations.reduce((s, r, k) => s + (r - predicted[k]!) ** 2, 0);
    const mean_r = receptor_concentrations.reduce((s, v) => s + v, 0) / n_species;
    const tss = receptor_concentrations.reduce((s, r) => s + (r - mean_r) ** 2, 0);
    const explained_variance = tss === 0 ? 1 : Math.max(0, 1 - rss / tss);

    return { source_contributions: contributions, explained_variance };
}

/**
 * Gaussian elimination solver for Ax = b.
 * Eliminação gaussiana para sistema Ax = b.
 */
function _solveLinear(A: number[][], b: number[]): number[] {
    const n = b.length;
    // Augmented matrix
    const M = A.map((row, i) => [...row, b[i]!]);
    for (let col = 0; col < n; col++) {
        // Pivot selection
        let maxRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(M[row]![col]!) > Math.abs(M[maxRow]![col]!)) maxRow = row;
        }
        [M[col], M[maxRow]] = [M[maxRow]!, M[col]!];
        const pivot = M[col]![col]!;
        if (Math.abs(pivot) < 1e-12) continue; // singular — skip
        for (let row = col + 1; row < n; row++) {
            const f = M[row]![col]! / pivot;
            for (let k = col; k <= n; k++) M[row]![k]! -= f * M[col]![k]!;
        }
    }
    // Back-substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        x[i] = M[i]![n]!;
        for (let j = i + 1; j < n; j++) x[i] -= M[i]![j]! * x[j];
        if (Math.abs(M[i]![i]!) > 1e-12) x[i] /= M[i]![i]!;
    }
    return x;
}

/**
 * Compute the Enrichment Factor (EF) to identify pollution sources.
 * Calcula o fator de enriquecimento (EF) para identificação de origem de poluentes.
 *
 * @param element_concentration - Concentration of the element of interest.
 * @param reference_element - Concentration of the reference element.
 * @param crustal_ratio - Crustal ratio (element/reference) in the earth's crust.
 * @throws {RangeError} If reference_element or crustal_ratio <= 0.
 */
export function computeEnrichmentFactor(
    element_concentration: number,
    reference_element: number,
    crustal_ratio: number,
): { ef: number; source: 'crustal' | 'anthropogenic' | 'mixed' } {
    if (typeof reference_element !== 'number' || reference_element <= 0) {
        throw new RangeError(`reference_element must be positive; got ${reference_element}`);
    }
    if (typeof crustal_ratio !== 'number' || crustal_ratio <= 0) {
        throw new RangeError(`crustal_ratio must be positive; got ${crustal_ratio}`);
    }
    if (typeof element_concentration !== 'number' || element_concentration < 0) {
        throw new RangeError(`element_concentration must be non-negative; got ${element_concentration}`);
    }
    const sample_ratio = element_concentration / reference_element;
    const ef = sample_ratio / crustal_ratio;

    let source: 'crustal' | 'anthropogenic' | 'mixed';
    if (ef < 10) source = 'crustal';
    else if (ef > 100) source = 'anthropogenic';
    else source = 'mixed';

    return { ef, source };
}

/**
 * Compute a simplified backward air mass trajectory.
 * Calcula trajetória retrógrada simplificada de massa de ar.
 *
 * @param origin_lat - Receptor latitude in decimal degrees.
 * @param origin_lon - Receptor longitude in decimal degrees.
 * @param wind_speed_m_s - Mean wind speed in m/s.
 * @param wind_direction_deg - Wind direction in degrees (from which wind blows, meteorological convention).
 * @param hours_back - Number of hours to trace back (positive integer).
 * @throws {RangeError} If lat/lon out of bounds, wind speed negative, or hours_back < 1.
 */
export function computeBackTrajectory(
    origin_lat: number,
    origin_lon: number,
    wind_speed_m_s: number,
    wind_direction_deg: number,
    hours_back: number,
): { trajectory: Array<{ lat: number; lon: number; hour: number }> } {
    if (typeof origin_lat !== 'number' || origin_lat < -90 || origin_lat > 90) {
        throw new RangeError(`origin_lat must be in [-90, 90]; got ${origin_lat}`);
    }
    if (typeof origin_lon !== 'number' || origin_lon < -180 || origin_lon > 180) {
        throw new RangeError(`origin_lon must be in [-180, 180]; got ${origin_lon}`);
    }
    if (typeof wind_speed_m_s !== 'number' || wind_speed_m_s < 0) {
        throw new RangeError(`wind_speed_m_s must be non-negative; got ${wind_speed_m_s}`);
    }
    if (typeof hours_back !== 'number' || hours_back < 1 || !Number.isInteger(hours_back)) {
        throw new RangeError(`hours_back must be a positive integer; got ${hours_back}`);
    }

    // Converter direção meteorológica de vento para direção de deslocamento retrógrado
    // Em convenção met, 0° = vento do Norte; mover contra o vento para trás no tempo
    const theta_rad = (wind_direction_deg * Math.PI) / 180;
    // Deslocamento por hora contra o vento (metros)
    const dist_per_hour = wind_speed_m_s * 3600;
    // Conversão: 1° lat ≈ 110540m; 1° lon ≈ 111320m (equatorial)
    const dLat_per_hour = (-dist_per_hour * Math.cos(theta_rad)) / 110540;
    const dLon_per_hour = (-dist_per_hour * Math.sin(theta_rad)) / 111320;

    const trajectory = [{ lat: origin_lat, lon: origin_lon, hour: 0 }];
    let lat = origin_lat,
        lon = origin_lon;
    for (let h = 1; h <= hours_back; h++) {
        lat += dLat_per_hour;
        lon += dLon_per_hour;
        // Clamp lat/lon to valid range
        lat = Math.max(-90, Math.min(90, lat));
        lon = Math.max(-180, Math.min(180, lon));
        trajectory.push({ lat, lon, hour: -h });
    }
    return { trajectory };
}

/**
 * Classify the health impact of a pollution source contribution.
 * Classifica o impacto à saúde da contribuição de uma fonte poluente.
 *
 * @param pm25_contribution_ug_m3 - PM2.5 source contribution in µg/m³.
 * @param source_type - Descriptive label for the source.
 * @param population_exposed - Number of people exposed.
 * @throws {RangeError} If pm25_contribution_ug_m3 < 0 or population_exposed < 0.
 */
export function classifyAirQualitySourceImpact(
    pm25_contribution_ug_m3: number,
    source_type: string,
    population_exposed: number,
): { impact_score: number; priority: string; health_impact_DALYs_est: number } {
    if (typeof pm25_contribution_ug_m3 !== 'number' || pm25_contribution_ug_m3 < 0) {
        throw new RangeError(`pm25_contribution_ug_m3 must be non-negative; got ${pm25_contribution_ug_m3}`);
    }
    if (typeof population_exposed !== 'number' || population_exposed < 0) {
        throw new RangeError(`population_exposed must be non-negative; got ${population_exposed}`);
    }
    if (typeof source_type !== 'string') throw new TypeError('source_type must be a string');

    // WHO (2021) PM2.5 annual guideline: 5 µg/m³
    const who_guideline = 5;
    const impact_score = pm25_contribution_ug_m3 * Math.log10(population_exposed + 1);
    // DALYs estimate: WHO Global Burden of Disease simplified coefficient
    const health_impact_DALYs_est = pm25_contribution_ug_m3 * population_exposed * 0.001;

    let priority;
    if (pm25_contribution_ug_m3 < who_guideline * 0.5) priority = 'low';
    else if (pm25_contribution_ug_m3 < who_guideline) priority = 'medium';
    else if (pm25_contribution_ug_m3 < who_guideline * 5) priority = 'high';
    else priority = 'critical';

    return { impact_score, priority, health_impact_DALYs_est };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const airQualityReceptorModelMeta: AnalyticsModuleMeta = {
    name: 'airQualityReceptorModel',
    description: 'airQualityReceptorModel',
    category: 'analytics',
    familyTags: ['air'],
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
