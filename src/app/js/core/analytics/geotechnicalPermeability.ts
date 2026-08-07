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
 * Geotechnical Permeability - Empirical estimates, field/lab tests, and
 * equivalent permeability for stratified soils.
 *
 * Permeabilidade Geotécnica - estimativas empíricas, ensaios e permeabilidade
 * equivalente em solos estratificados.
 *
 * References / Referências:
 * - Hazen, A. (1892) Some Physical Properties of Sands and Gravels.
 *   Annual Report, Massachusetts State Board of Health, pp. 539-556
 * - Kozeny, J. (1927) Über kapillare Leitung des Wassers im Boden. Sitzber.
 *   Akad. Wiss. Wien 136(2a):271-306
 * - Carman, P.C. (1937) Fluid flow through granular beds.
 *   Trans. Inst. Chem. Eng. 15:150-166
 * - Terzaghi, K. (1943) Theoretical Soil Mechanics. Wiley, New York.
 * - ABNT NBR 13292:1995 - Ensaio de permeabilidade a carga constante em campo
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

const SECONDS_PER_DAY = 86400;
const HAZEN_C = 100; // coeficiente empírico para areia limpa / empirical coefficient for clean sand

/**
 * Estimate hydraulic conductivity using Hazen's empirical formula (1892).
 * Estima a condutividade hidráulica pela fórmula empírica de Hazen (1892).
 *
 * K = C × d10²  (d10 em mm, K em cm/s)
 *
 * @param d10_mm - Effective grain size (10% passing, mm) / Diâmetro efetivo D10
 */
export function computeHazenPermeability(d10_mm: number): { k_cm_s: number; k_m_day: number } {
    if (typeof d10_mm !== 'number') {
        throw new TypeError('d10_mm must be a number');
    }
    // Intervalo de validade do método de Hazen / Hazen validity range
    if (d10_mm < 0.1 || d10_mm > 3.0) {
        throw new RangeError('d10_mm must be in [0.1, 3.0] mm for Hazen formula validity');
    }

    const k_cm_s = HAZEN_C * d10_mm * d10_mm;
    // cm/s → m/dia: × (1/100) × 86400
    const k_m_day = (k_cm_s * SECONDS_PER_DAY) / 100;

    return { k_cm_s, k_m_day };
}

/**
 * Estimate permeability using the Kozeny-Carman equation.
 * Estima a permeabilidade pela equação de Kozeny-Carman.
 *
 * K = n³ / [(1-n)² × k0 × S² × μ]   onde k0 = 5 (fator de tortuosidade)
 *
 * @param porosity             - Void ratio porosity n (dimensionless, 0-1) / Porosidade
 * @param specific_surface_m2_m3 - Specific surface area (m²/m³) / Superfície específica
 * @param fluid_viscosity_Pa_s - Dynamic fluid viscosity (Pa·s) / Viscosidade dinâmica
 */
export function computeKozenyCarman(
    porosity: number,
    specific_surface_m2_m3: number,
    fluid_viscosity_Pa_s: number,
): { k_m_s: number } {
    if ([porosity, specific_surface_m2_m3, fluid_viscosity_Pa_s].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (porosity <= 0 || porosity >= 1) {
        throw new RangeError('porosity must be in the open interval (0, 1)');
    }
    if (specific_surface_m2_m3 <= 0) {
        throw new RangeError('specific_surface_m2_m3 must be > 0');
    }
    if (fluid_viscosity_Pa_s <= 0) {
        throw new RangeError('fluid_viscosity_Pa_s must be > 0');
    }

    const k0 = 5; // constante de tortuosidade de Kozeny-Carman / Kozeny-Carman tortuosity constant
    const n = porosity;
    const S = specific_surface_m2_m3;
    const mu = fluid_viscosity_Pa_s;

    // K (m²) / μ (Pa·s) → K_hydraulic (m/s) com ρg = 9810 N/m³ assumido implícito em k0
    // Usando a forma dimensional direta onde K em m/s
    const k_m_s = Math.pow(n, 3) / (Math.pow(1 - n, 2) * k0 * S * S * mu);

    return { k_m_s };
}

/**
 * Compute equivalent horizontal and vertical permeability for layered soils.
 * Calcula a permeabilidade equivalente horizontal e vertical em solos estratificados.
 *
 * kh = Σ(ki×hi) / Σhi        (flow parallel to layers / fluxo paralelo)
 * kv = Σhi / Σ(hi/ki)        (flow perpendicular / fluxo perpendicular)
 *
 * @param layers - Soil layers / Camadas de solo
 */
export function computeEquivalentPermeability(
    layers: Array<{ k_m_s: number; thickness_m: number }>,
): { kh_m_s: number; kv_m_s: number; anisotropy_ratio: number } {
    if (!Array.isArray(layers) || layers.length === 0) {
        throw new RangeError('layers must be a non-empty array');
    }

    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i]!;
        if (typeof layer.k_m_s !== 'number' || typeof layer.thickness_m !== 'number') {
            throw new TypeError(`Layer ${i}: k_m_s and thickness_m must be numbers`);
        }
        if (layer.k_m_s <= 0) throw new RangeError(`Layer ${i}: k_m_s must be > 0`);
        if (layer.thickness_m <= 0) throw new RangeError(`Layer ${i}: thickness_m must be > 0`);
    }

    const totalThickness = layers.reduce((sum, l) => sum + l.thickness_m, 0);

    // Permeabilidade horizontal (fluxo paralelo às camadas) / Horizontal (parallel flow)
    const kh_m_s = layers.reduce((sum, l) => sum + l.k_m_s * l.thickness_m, 0) / totalThickness;

    // Permeabilidade vertical (fluxo perpendicular, em série) / Vertical (series flow)
    const kv_m_s = totalThickness / layers.reduce((sum, l) => sum + l.thickness_m / l.k_m_s, 0);

    // Razão de anisotropia - típica: 2 a 10× para solos aluvionares
    // Anisotropy ratio - typical: 2 to 10× for alluvial soils
    const anisotropy_ratio = kh_m_s / kv_m_s;

    return { kh_m_s, kv_m_s, anisotropy_ratio };
}

/**
 * Classify soil permeability using Terzaghi's scale (1943).
 * Classifica a permeabilidade do solo pela escala de Terzaghi (1943).
 *
 * @param k_m_s - Hydraulic conductivity (m/s) / Condutividade hidráulica
 */
export function classifySoilPermeability(
    k_m_s: number,
): { class: string; description: string; typical_material: string } {
    if (typeof k_m_s !== 'number') {
        throw new TypeError('k_m_s must be a number');
    }
    if (k_m_s < 0) {
        throw new RangeError('k_m_s must be >= 0');
    }

    let soilClass, description, typical_material;

    if (k_m_s > 1e-3) {
        soilClass = 'high';
        description = 'Alta permeabilidade — drenagem livre';
        typical_material = 'Cascalho limpo, areia grossa limpa';
    } else if (k_m_s > 1e-5) {
        soilClass = 'medium';
        description = 'Permeabilidade média — drenagem moderada';
        typical_material = 'Areia fina, areia com finos, turfa';
    } else if (k_m_s > 1e-7) {
        soilClass = 'low';
        description = 'Baixa permeabilidade — drenagem lenta';
        typical_material = 'Silte arenoso, areia muito fina, argila siltosa';
    } else if (k_m_s > 1e-9) {
        soilClass = 'very_low';
        description = 'Permeabilidade muito baixa — drenagem imperceptível';
        typical_material = 'Argila compactada, rocha fraturada';
    } else {
        soilClass = 'impermeable';
        description = 'Praticamente impermeável — uso como barreira';
        typical_material = 'Argila pura não fraturada, rocha ígnea sã';
    }

    return { class: soilClass, description, typical_material };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const geotechnicalPermeabilityMeta: AnalyticsModuleMeta = {
    name: 'geotechnicalPermeability',
    description: 'geotechnicalPermeability',
    category: 'analytics',
    familyTags: ['geotechnical'],
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
