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
 * Atmospheric Mercury Model
 *
 * Modelo atmosférico de mercúrio conforme:
 * - AMAP/UNEP (2013) Technical Background Report for the Global Mercury Assessment
 * - Selin NE (2009). Global biogeochemical cycling of mercury: a review.
 *   Annu. Rev. Environ. Resour. 34:43–63. DOI:10.1146/annurev.environ.051308.084314
 * - USEPA (2011). Mercury Study Report to Congress - Appendix C (Fate and Transport)
 * - WHO (2021). Mercury and health. Fact sheet.
 *
 * Fatores de emissão por categoria de fonte (toneladas/ano → µg/m³):
 * - Garaventa et al. (2012): artisanal gold mining emission factors
 * - Streets et al. (2011) Hg inventory. Atmos. Chem. Phys. 11:1109–1135.
 *
 * Zero dependências DOM/IDB/Three.js/fetch
 * @module atmosphericMercuryModel
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

type SourceType =
    | 'artisanal_gold_mining'
    | 'coal_combustion'
    | 'chlor_alkali'
    | 'cement_production'
    | 'waste_incineration';

type SurfaceType = 'hg0_land' | 'hg0_ocean' | 'rgm_land' | 'rgm_ocean';

// ─── Emission factors (kg Hg per tonne of material processed or burnt) ───────
// Fatores de emissão por tipo de fonte, em kg Hg / t (Streets et al. 2011 Tabela 3)
const EMISSION_FACTORS: Record<SourceType, number> = {
    artisanal_gold_mining: 1.32, // kg Hg / t ore (AMAP/UNEP 2013, p.41)
    coal_combustion: 0.115, // kg Hg / t coal (Streets 2011)
    chlor_alkali: 0.05, // kg Hg / t product
    cement_production: 0.065, // kg Hg / t cement
    waste_incineration: 0.036, // kg Hg / t waste (municipal)
};

// ─── Dry deposition velocities (m/s) ─────────────────────────────────────────
// Velocidades de deposição seca típicas para Hg gasoso elementar (Hg0)
// e compostos reativos (RGM) - Selin (2009) Tabela 1
const DRY_DEPOSITION_VELOCITY: Record<SurfaceType, number> = {
    hg0_land: 3e-4, // m/s sobre terra
    hg0_ocean: 1.2e-4, // m/s sobre oceano
    rgm_land: 2e-2, // m/s (altamente reativo)
    rgm_ocean: 2e-2, // m/s
};

// ─── Methylation conversion factor ───────────────────────────────────────────
// Fração de Hg inorgânico convertida a metilmercúrio em sistemas aquáticos
// (Mason & Sheu 2002; Selin 2009)
const METHYLATION_FRACTION = 0.015; // 1.5 % do Hg depositado → MeHg aquático

/**
 * Calcula a emissão de mercúrio por tipo de fonte e produção anual.
 * Calculates mercury emission for a given source type and annual throughput.
 *
 * @param {'artisanal_gold_mining'|'coal_combustion'|'chlor_alkali'|'cement_production'|'waste_incineration'} sourceType
 * @param {number} annualThroughput - Produção/processamento anual (toneladas/ano)
 * @returns {{ emissionKgPerYear: number, emissionGPerDay: number, sourceType: string }}
 */
export function calculateSourceEmission(
    sourceType: SourceType,
    annualThroughput: number,
): { emissionKgPerYear: number; emissionGPerDay: number; sourceType: string } {
    if (!Object.hasOwn(EMISSION_FACTORS, sourceType)) {
        throw new TypeError(`Unknown sourceType "${sourceType}". Valid: ${Object.keys(EMISSION_FACTORS).join(', ')}`);
    }
    if (typeof annualThroughput !== 'number' || annualThroughput <= 0) {
        throw new RangeError('annualThroughput must be > 0 tonnes/year');
    }
    const ef = EMISSION_FACTORS[sourceType];
    const emissionKgPerYear = ef * annualThroughput;
    const emissionGPerDay = (emissionKgPerYear * 1000) / 365;
    return { emissionKgPerYear, emissionGPerDay, sourceType };
}

/**
 * Estima a concentração de Hg no ar ambiente usando modelo box simples.
 * Estimates ambient air Hg concentration via a simple box model.
 *
 * C_ar = E / (Q × V_mix)
 * onde E = emissão (µg/s), Q = taxa de ventilação (m³/s), V_mix = volume da caixa
 *
 * Para aplicações de longa distância usa modelo de receptor Gaussian simplificado:
 * C = E / (π × σy × σz × u)   (contribuição de fonte pontual em pluma Gaussiana)
 *
 * @param {number} emissionGPerDay  - Emissão diária (g Hg/dia)
 * @param {number} windSpeed        - Velocidade do vento (m/s)
 * @param {number} sigmay           - Dispersão horizontal σy (m)
 * @param {number} sigmaz           - Dispersão vertical σz (m)
 * @returns {{ concentrationUgPerM3: number, concentrationNgPerM3: number }}
 */
export function estimateAirConcentration(
    emissionGPerDay: number,
    windSpeed: number,
    sigmay: number,
    sigmaz: number,
): { concentrationUgPerM3: number; concentrationNgPerM3: number } {
    if (typeof emissionGPerDay !== 'number' || emissionGPerDay <= 0) {
        throw new RangeError('emissionGPerDay must be > 0');
    }
    if (typeof windSpeed !== 'number' || windSpeed <= 0) {
        throw new RangeError('windSpeed must be > 0 m/s');
    }
    if (typeof sigmay !== 'number' || sigmay <= 0) throw new RangeError('sigmay must be > 0 m');
    if (typeof sigmaz !== 'number' || sigmaz <= 0) throw new RangeError('sigmaz must be > 0 m');

    // Converter g/dia → µg/s
    const emissionUgPerS = (emissionGPerDay * 1e6) / 86400;
    // Modelo Gaussiano eixo central (y=0, z=0): C = E / (π σy σz u)
    const concentrationUgPerM3 = emissionUgPerS / (Math.PI * sigmay * sigmaz * windSpeed);
    return {
        concentrationUgPerM3,
        concentrationNgPerM3: concentrationUgPerM3 * 1000,
    };
}

/**
 * Calcula a deposição seca de Hg atmosférico.
 * Calculates dry deposition flux of atmospheric mercury.
 *
 * F_dry = C_ar × v_d
 *
 * @param {number} concentrationUgPerM3 - Concentração de Hg no ar (µg/m³)
 * @param {'hg0_land'|'hg0_ocean'|'rgm_land'|'rgm_ocean'} surfaceType
 * @returns {{ dryDepFlux_ugPerM2PerDay: number, surfaceType: string }}
 */
export function calculateDryDeposition(
    concentrationUgPerM3: number,
    surfaceType: SurfaceType,
): { dryDepFlux_ugPerM2PerDay: number; surfaceType: string } {
    if (typeof concentrationUgPerM3 !== 'number' || concentrationUgPerM3 <= 0) {
        throw new RangeError('concentrationUgPerM3 must be > 0');
    }
    if (!Object.hasOwn(DRY_DEPOSITION_VELOCITY, surfaceType)) {
        throw new TypeError(`Unknown surfaceType. Valid: ${Object.keys(DRY_DEPOSITION_VELOCITY).join(', ')}`);
    }
    const vd = DRY_DEPOSITION_VELOCITY[surfaceType]; // m/s
    // Fluxo = C × vd × 86400 s/dia → µg/m²/dia
    const dryDepFlux_ugPerM2PerDay = concentrationUgPerM3 * vd * 86400;
    return { dryDepFlux_ugPerM2PerDay, surfaceType };
}

/**
 * Calcula a deposição úmida de Hg atmosférico.
 * Calculates wet deposition of atmospheric mercury via precipitation scavenging.
 *
 * F_wet = C_ar × W × P
 * onde W = coeficiente de remoção por chuva (adimensional, ~200 para Hg),
 * P = taxa de precipitação (m/s)
 *
 * @param {number} concentrationUgPerM3 - Concentração de Hg no ar (µg/m³)
 * @param {number} precipitationMmPerYear - Precipitação anual (mm/ano)
 * @param {number} [washoutRatio=200]    - Coeficiente de washout (Selin 2009)
 * @returns {{ wetDepFlux_ugPerM2PerYear: number }}
 */
export function calculateWetDeposition(
    concentrationUgPerM3: number,
    precipitationMmPerYear: number,
    washoutRatio: number = 200,
): { wetDepFlux_ugPerM2PerYear: number } {
    if (typeof concentrationUgPerM3 !== 'number' || concentrationUgPerM3 <= 0) {
        throw new RangeError('concentrationUgPerM3 must be > 0');
    }
    if (typeof precipitationMmPerYear !== 'number' || precipitationMmPerYear <= 0) {
        throw new RangeError('precipitationMmPerYear must be > 0');
    }
    if (typeof washoutRatio !== 'number' || washoutRatio <= 0) {
        throw new RangeError('washoutRatio must be > 0');
    }
    // Precipitação: mm/ano → m/s (1 mm/ano = 1e-3 m / 31557600 s)
    const precipMs = (precipitationMmPerYear * 1e-3) / 31557600;
    const wetDepFlux_ugPerM2PerYear = concentrationUgPerM3 * washoutRatio * precipMs * 31557600;
    return { wetDepFlux_ugPerM2PerYear };
}

/**
 * Estima a conversão de Hg inorgânico depositado para metilmercúrio (MeHg) aquático
 * e o risco associado ao consumo de peixe.
 * Estimates methylmercury conversion and fish consumption risk.
 *
 * @param {number} totalDepositionUgPerM2PerYear - Deposição total (seca + úmida) µg/m²/ano
 * @param {number} waterBodyAreaM2              - Área do corpo d'água (m²)
 * @param {number} fishConsumptionGPerDay       - Consumo de peixe (g/dia)
 * @param {number} bioaccumulationFactor        - BAF Hg→MeHg em peixe (L/kg, tipicamente 1e6)
 * @returns {{ mehgLoadKgPerYear: number, fishMehgUgPerKg: number, dailyIntakeUgPerDay: number, exceedsWHO: boolean }}
 *   WHO limit: 1.6 µg/kg bw/dia (para 70 kg = 112 µg/dia)
 */
export function estimateFishConsumptionRisk(
    totalDepositionUgPerM2PerYear: number,
    waterBodyAreaM2: number,
    fishConsumptionGPerDay: number,
    bioaccumulationFactor: number,
): {
    mehgLoadKgPerYear: number;
    fishMehgUgPerKg: number;
    dailyIntakeUgPerDay: number;
    exceedsWHO: boolean;
} {
    if (typeof totalDepositionUgPerM2PerYear !== 'number' || totalDepositionUgPerM2PerYear <= 0) {
        throw new RangeError('totalDepositionUgPerM2PerYear must be > 0');
    }
    if (typeof waterBodyAreaM2 !== 'number' || waterBodyAreaM2 <= 0) {
        throw new RangeError('waterBodyAreaM2 must be > 0');
    }
    if (typeof fishConsumptionGPerDay !== 'number' || fishConsumptionGPerDay <= 0) {
        throw new RangeError('fishConsumptionGPerDay must be > 0');
    }
    if (typeof bioaccumulationFactor !== 'number' || bioaccumulationFactor <= 0) {
        throw new RangeError('bioaccumulationFactor must be > 0');
    }
    // Carga de Hg depositada no corpo d'água (µg/ano → kg/ano)
    const hgLoadUgPerYear = totalDepositionUgPerM2PerYear * waterBodyAreaM2;
    // Fração convertida a MeHg (1.5 %)
    const mehgLoadUgPerYear = hgLoadUgPerYear * METHYLATION_FRACTION;
    const mehgLoadKgPerYear = mehgLoadUgPerYear * 1e-9;

    // Concentração em água = carga / volume (assumimos coluna 1 m → m³ = área × 1)
    const waterConcentrationUgPerL = mehgLoadUgPerYear / (waterBodyAreaM2 * 1000); // L = m³×1000

    // Concentração em peixe via BAF (L/kg): Cfish = Cwater × BAF (µg/kg)
    const fishMehgUgPerKg = waterConcentrationUgPerL * bioaccumulationFactor;

    // Ingestão diária: Cfish × consumo
    const dailyIntakeUgPerDay = fishMehgUgPerKg * (fishConsumptionGPerDay / 1000);

    // WHO TWI para MeHg: 1.6 µg/kg bw/semana → ~16 µg/dia para 70 kg (0.3 µg/kg bw/dia)
    const WHO_LIMIT_UG_PER_DAY = 0.3 * 70; // 21 µg/dia para adulto 70 kg
    return {
        mehgLoadKgPerYear,
        fishMehgUgPerKg,
        dailyIntakeUgPerDay,
        exceedsWHO: dailyIntakeUgPerDay > WHO_LIMIT_UG_PER_DAY,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const atmosphericMercuryModelMeta: AnalyticsModuleMeta = {
    name: 'atmosphericMercuryModel',
    description: 'atmosphericMercuryModel',
    category: 'analytics',
    familyTags: ['atmosphere', 'heavy_metal'],
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
