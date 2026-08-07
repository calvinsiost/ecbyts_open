// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Mercury Biogeochemical Cycling Model
// Modelo do ciclo biogeoquímico do mercúrio: metilação, bioacumulação e risco dietético.
//
// References:
//   Gilmour et al. (1992) Environ Sci Technol DOI:10.1021/es00027a009
//   Selin (2009) Annu Rev Environ Resour DOI:10.1146/annurev.environ.050708.144418
//   WHO (2021) Mercury and health - fact sheet
//   CONAMA 357/2005 - Classificação das águas e padrões de lançamento

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

// ECHA Tolerable Weekly Intake para metilmercúrio (µg/kg/semana → convertido p/ dia)
const ECHA_TWI_UG_KG_WEEK = 1.3; // µg/kg/semana (ECHA 2012)
const ECHA_TWI_UG_KG_DAY = ECHA_TWI_UG_KG_WEEK / 7; // ≈ 0.186 µg/kg/dia

// Limites WHO e CONAMA
const WHO_FISH_GUIDELINE_UG_KG = 500; // µg/kg (peixe predador)
const CONAMA_357_HG_AGUA_UG_L = 0.2; // µg/L (águas classe II)

/**
 * Computes the methylation rate of inorganic mercury in sediment.
 * Calcula a taxa de metilação do mercúrio inorgânico em sedimento.
 *
 * @param total_hg_ug_kg       - Total inorganic Hg in sediment (µg/kg dry wt)
 * @param sulfate_reducing_activity - Sulfate-reducing bacteria activity index [0–10]
 * @param organic_matter_pct   - Sediment organic matter content (%)
 * @param temperature_c        - Sediment temperature (°C), must be in [-2, 40]
 */
export function computeMethylationRate(
    total_hg_ug_kg: number,
    sulfate_reducing_activity: number,
    organic_matter_pct: number,
    temperature_c: number,
): { methyl_hg_ug_kg: number; methylation_fraction: number } {
    if (
        typeof total_hg_ug_kg !== 'number' ||
        typeof sulfate_reducing_activity !== 'number' ||
        typeof organic_matter_pct !== 'number' ||
        typeof temperature_c !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (total_hg_ug_kg < 0) throw new RangeError('total_hg_ug_kg must be >= 0');
    if (sulfate_reducing_activity < 0 || sulfate_reducing_activity > 10) {
        throw new RangeError('sulfate_reducing_activity must be in [0, 10]');
    }
    if (organic_matter_pct < 0) throw new RangeError('organic_matter_pct must be >= 0');
    if (temperature_c < -2 || temperature_c > 40) {
        throw new RangeError('temperature_c must be in [-2, 40]');
    }

    // Taxa base de metilação (1% do Hg total - Gilmour et al. 1992)
    const base = 0.01;
    // Fator de atividade de bactérias sulfato-redutoras (escalonado de 0 a 1)
    const sra_factor = Math.min(1, sulfate_reducing_activity / 10);
    // Fator de matéria orgânica (saturação em 5% MO)
    const om_factor = Math.min(1, organic_matter_pct / 5);
    // Fator de temperatura: Q10 simplificado - aumento de 5% por °C acima de 20 °C
    const t_factor = 1 + 0.05 * (temperature_c - 20);

    const methylation_fraction = base * sra_factor * om_factor * t_factor;
    const methyl_hg_ug_kg = total_hg_ug_kg * methylation_fraction;

    return { methyl_hg_ug_kg, methylation_fraction };
}

/**
 * Computes mercury bioaccumulation in fish tissue.
 * Calcula bioacumulação de mercúrio no tecido de peixes (processo trófico).
 *
 * @param water_conc_ng_L   - MeHg concentration in water (ng/L)
 * @param baf_L_kg          - Bioaccumulation Factor (L/kg)
 * @param trophic_level     - Fish trophic level [1–5]
 */
export function computeFishBioaccumulation(
    water_conc_ng_L: number,
    baf_L_kg: number,
    trophic_level: number,
): { fish_conc_ug_kg: number; bmf: number } {
    if (typeof water_conc_ng_L !== 'number' || typeof baf_L_kg !== 'number' || typeof trophic_level !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (water_conc_ng_L < 0) throw new RangeError('water_conc_ng_L must be >= 0');
    if (baf_L_kg < 0) throw new RangeError('baf_L_kg must be >= 0');
    if (trophic_level < 1 || trophic_level > 5) {
        throw new RangeError('trophic_level must be in [1, 5]');
    }

    // Concentração no peixe: BAF × Cagua (ng/L → µg/kg: dividir por 1000)
    const fish_conc_ug_kg = (water_conc_ng_L * baf_L_kg) / 1000;

    // Fator de biomagnificação trófico - Selin (2009): BMF = 10^(0.18×TL)
    const bmf = Math.pow(10, 0.18 * trophic_level);

    return { fish_conc_ug_kg, bmf };
}

/**
 * Computes dietary mercury exposure from fish consumption.
 * Calcula exposição dietética ao mercúrio via consumo de peixe.
 *
 * @param fish_conc_ug_kg    - Mercury in fish (µg/kg wet weight)
 * @param consumption_g_day  - Fish consumption rate (g/day)
 * @param body_weight_kg     - Consumer body weight (kg), must be > 0
 */
export function computeDietaryHgExposure(
    fish_conc_ug_kg: number,
    consumption_g_day: number,
    body_weight_kg: number,
): { dose_ug_kg_day: number; exceeds_echa_twi: boolean } {
    if (
        typeof fish_conc_ug_kg !== 'number' ||
        typeof consumption_g_day !== 'number' ||
        typeof body_weight_kg !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (fish_conc_ug_kg < 0) throw new RangeError('fish_conc_ug_kg must be >= 0');
    if (consumption_g_day < 0) throw new RangeError('consumption_g_day must be >= 0');
    if (body_weight_kg <= 0) throw new RangeError('body_weight_kg must be > 0');

    // Dose = concentração × ingestão / peso corporal
    const dose_ug_kg_day = (fish_conc_ug_kg * consumption_g_day) / 1000 / body_weight_kg;
    const exceeds_echa_twi = dose_ug_kg_day > ECHA_TWI_UG_KG_DAY;

    return { dose_ug_kg_day, exceeds_echa_twi };
}

/**
 * Classifies mercury contamination risk based on fish and water concentrations.
 * Classifica o risco de contaminação por mercúrio com base nas concentrações.
 *
 * @param fish_conc_ug_kg  - Mercury in fish (µg/kg)
 * @param water_conc_ng_L  - Mercury in water (ng/L)
 * @param source_type
 */
export function classifyHgContaminationRisk(
    fish_conc_ug_kg: number,
    water_conc_ng_L: number,
    source_type: 'artisanal_gold_mining' | 'industrial' | 'natural' | 'legacy',
): { risk: string; consumption_advice: string } {
    if (typeof fish_conc_ug_kg !== 'number' || typeof water_conc_ng_L !== 'number') {
        throw new TypeError('fish_conc_ug_kg and water_conc_ng_L must be numbers');
    }
    const validSources = ['artisanal_gold_mining', 'industrial', 'natural', 'legacy'];
    if (!validSources.includes(source_type)) {
        throw new TypeError(`source_type must be one of: ${validSources.join(', ')}`);
    }
    if (fish_conc_ug_kg < 0 || water_conc_ng_L < 0) {
        throw new RangeError('Concentrations must be >= 0');
    }

    // Classificação baseada em WHO guideline e CONAMA 357/2005
    let risk;
    let consumption_advice;

    if (fish_conc_ug_kg > 1000 || water_conc_ng_L > CONAMA_357_HG_AGUA_UG_L * 1000 * 5) {
        risk = 'critical';
        consumption_advice = 'Avoid all fish consumption. Immediate regulatory intervention required.';
    } else if (fish_conc_ug_kg > WHO_FISH_GUIDELINE_UG_KG) {
        risk = 'high';
        consumption_advice = 'Restrict fish consumption to < 1 meal/month for vulnerable groups.';
    } else if (fish_conc_ug_kg > 200 || water_conc_ng_L > CONAMA_357_HG_AGUA_UG_L * 1000) {
        risk = 'elevated';
        consumption_advice = 'Limit fish consumption to < 2 meals/week. Monitor regularly.';
    } else {
        risk = 'background';
        consumption_advice = 'No restriction required. Routine monitoring recommended.';
    }

    return { risk, consumption_advice };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mercuryCyclingModelMeta: AnalyticsModuleMeta = {
    name: 'mercuryCyclingModel',
    description: 'mercuryCyclingModel',
    category: 'analytics',
    familyTags: ['heavy_metal'],
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
