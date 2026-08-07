// @ts-check
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
 * Mining Dust Emission - Emissão de poeira em mineração
 *
 * Implementa os fatores de emissão e inventário de poeira fugitiva para
 * operações de mineração a céu aberto conforme AP-42 (US EPA) e diretrizes
 * de emissões fugitivas da USEPA.
 *
 * References / Referências:
 *   US EPA (2006). AP-42: Compilation of Air Emission Factors, Vol. I, Ch. 11.
 *     Section 11.9 (Western Surface Coal Mining), Section 11.19 (Sand & Gravel).
 *     https://www.epa.gov/air-emissions-factors-and-quantification/ap-42-compilation-air-emissions-factors
 *   US EPA (2016). Fugitive Dust Background Document and Technical Information
 *     Document for Best Available Control Measures.
 *     EPA-454/B-16-002.
 *   Hartman, H.L. & Mutmansky, J.M. (2002). Introductory Mining Engineering (2nd ed.).
 *     Wiley. ISBN 978-0-471-34851-6
 *
 * @module miningDustEmission
 */

// ─── Emission factor constants (AP-42, Table 11.9-1 and 11.19-1) ─────────────

/**
 * AP-42 base emission factors by mining activity.
 * Fatores de emissão base AP-42 por atividade de mineração (kg/Mg de material movimentado).
 *
 * PM10 and PM2.5 factors derived from AP-42 5th edition.
 * All values in kg per Mg (metric ton) of material processed.
 *
 * @type {Record<string, { pm10: number, pm25: number, description: string }>}
 */
const AP42_EMISSION_FACTORS = {
    // Perfuração / Drilling - AP-42 §11.9, Table 11.9-1
    drilling: {
        pm10: 0.59, // kg/Mg (com supressão de água), sem supressão: ~0.97
        pm25: 0.18,
        description: 'Rotary drilling with water suppression / Perfuração rotativa com supressão de água',
    },
    // Detonação / Blasting - AP-42 §11.9, Table 11.9-2
    blasting: {
        pm10: 0.0097, // kg/Mg de explosivo (emissão concentrada)
        pm25: 0.0039,
        description: 'Open-cast blasting / Detonação a céu aberto',
    },
    // Carregamento de material / Loading (shovel/loader) - AP-42 §11.9, Table 11.9-3
    loading: {
        pm10: 0.0016, // kg/Mg de material carregado
        pm25: 0.00064,
        description: 'Shovel/loader material loading / Carregamento por pá/carregadeira',
    },
    // Transporte em vias não pavimentadas / Unpaved road travel - AP-42 §13.2.2
    transport_unpaved: {
        pm10: 0.36, // kg/VKT (vehicle-km travelled), depende silt content e velocidade
        pm25: 0.054,
        description: 'Vehicle travel on unpaved haul roads / Tráfego em vias de acesso não pavimentadas',
    },
    // Descarga em britador / Crusher feed - AP-42 §11.19.2
    crushing: {
        pm10: 0.0023, // kg/Mg de alimentação do britador
        pm25: 0.00046,
        description: 'Primary crusher feed / Alimentação do britador primário',
    },
    // Stockpile wind erosion / Erosão eólica em pilhas - AP-42 §13.2.5
    stockpile_wind: {
        pm10: 0.0016, // kg/Mg/ano (erosão eólica, s depende de P/PE ratio)
        pm25: 0.00032,
        description: 'Stockpile wind erosion / Erosão eólica em pilhas de estoque',
    },
};

// ─── Control efficiency by measure ───────────────────────────────────────────

/**
 * Dust control measure efficiencies (PM10) - EPA Fugitive Dust Background Doc (2016).
 * Eficiências das medidas de controle de poeira (PM10).
 *
 * @type {Record<string, { efficiency: number, description: string }>}
 */
const CONTROL_EFFICIENCIES = {
    // Umectação por água / Water spraying
    water_spray: {
        efficiency: 0.75, // 75% PM10 removal
        description: 'Water spray suppression / Umectação por aspersão de água',
    },
    // Supressão química / Chemical suppression
    chemical_suppression: {
        efficiency: 0.85,
        description: 'Chemical dust suppressant / Supressor químico de poeira',
    },
    // Cobertura de pilhas / Stockpile cover
    stockpile_cover: {
        efficiency: 0.9,
        description: 'Stockpile enclosure or tarpaulin cover / Cobertura ou enclausuramento de pilha',
    },
    // Barreira vegetal / Windbreak/vegetative barrier
    windbreak: {
        efficiency: 0.5,
        description: 'Windbreak or vegetative barrier / Barreira corta-vento ou vegetativa',
    },
    // Pavimentação de vias internas / Road paving
    road_paving: {
        efficiency: 0.95,
        description: 'Haul road paving / Pavimentação de vias de acesso',
    },
    // Lavagem de rodas / Wheel wash
    wheel_wash: {
        efficiency: 0.55,
        description: 'Vehicle wheel wash at exit / Lavagem de rodas na saída',
    },
    // Velocidade reduzida / Speed reduction
    speed_reduction: {
        efficiency: 0.35,
        description: 'Speed reduction to ≤30 km/h / Redução de velocidade para ≤30 km/h',
    },
};

// ─── Core emission calculation ────────────────────────────────────────────────

/**
 * Calculates uncontrolled dust emissions for a single mining activity.
 * Calcula as emissões de poeira não controladas para uma atividade de mineração.
 *
 * E = EF * Activity  (kg)
 *
 * @param {string} activity - Activity code / código de atividade (key of AP42_EMISSION_FACTORS)
 * @param {number} activityAmount - Material throughput or VKT / quantidade de atividade (Mg ou km veículo)
 * @returns {{ pm10_kg: number, pm25_kg: number, activity: string, description: string }}
 */
function uncontrolledEmission(activity: any, activityAmount: any) {
const ef = AP42_EMISSION_FACTORS[activity as keyof typeof AP42_EMISSION_FACTORS];
    if (!ef) {
        throw new TypeError(`Unknown activity "${activity}". Valid: ${Object.keys(AP42_EMISSION_FACTORS).join(', ')}`);
    }
    if (typeof activityAmount !== 'number' || activityAmount < 0) {
        throw new RangeError(`activityAmount must be a non-negative number, got ${activityAmount}`);
    }
    return {
        pm10_kg: ef.pm10 * activityAmount,
        pm25_kg: ef.pm25 * activityAmount,
        activity,
        description: ef.description,
    };
}

/**
 * Applies control measures and computes controlled (net) emissions.
 * Aplica medidas de controle e calcula as emissões líquidas controladas.
 *
 * When multiple controls are applied, uses the EPA stacking formula:
 * Combined efficiency = 1 - prod(1 - ei)  for independent controls.
 * Eficiência combinada para controles independentes.
 *
 * @param {{ pm10_kg: number, pm25_kg: number }} uncontrolled - Uncontrolled emission result
 * @param {string[]} uncontrolled - Applied control measure codes / códigos das medidas de controle
 * @returns {{ pm10_kg: number, pm25_kg: number, combined_efficiency: number, controls: string[] }}
 */
function applyControls(uncontrolled: any, controls: any) {
    if (!Array.isArray(controls)) throw new TypeError('controls must be an array');
    let combinedEff = 0;
    const validControls = [];
    for (const ctrl of controls) {
const c = CONTROL_EFFICIENCIES[ctrl as keyof typeof CONTROL_EFFICIENCIES];
        if (!c) {
            throw new TypeError(`Unknown control "${ctrl}". Valid: ${Object.keys(CONTROL_EFFICIENCIES).join(', ')}`);
        }
        // Fórmula de empilhamento EPA: η_combinada = 1 - Π(1 - ηi)
        combinedEff = 1 - (1 - combinedEff) * (1 - c.efficiency);
        validControls.push(ctrl);
    }
    return {
        pm10_kg: uncontrolled.pm10_kg * (1 - combinedEff),
        pm25_kg: uncontrolled.pm25_kg * (1 - combinedEff),
        combined_efficiency: combinedEff,
        controls: validControls,
    };
}

/**
 * Builds a fugitive dust emission inventory for a mining operation.
 * Constrói o inventário de emissões fugitivas de poeira para uma operação de mineração.
 *
 * @param {{ activity: string, amount: number, controls?: string[] }[]} activities
 *   List of activities with throughput amounts and optional control measures.
 *   Lista de atividades com quantidades e medidas de controle opcionais.
 * @returns {{
 *   items: Array<{ activity: string, uncontrolled_pm10_kg: number, controlled_pm10_kg: number,
 *                  uncontrolled_pm25_kg: number, controlled_pm25_kg: number }>,
 *   total_uncontrolled_pm10_kg: number,
 *   total_controlled_pm10_kg: number,
 *   total_uncontrolled_pm25_kg: number,
 *   total_controlled_pm25_kg: number,
 * }}
 */
function emissionInventory(activities: any) {
    if (!Array.isArray(activities) || activities.length === 0) {
        throw new TypeError('activities must be a non-empty array');
    }
    const items = [];
    let totalUncontrolledPM10 = 0;
    let totalControlledPM10 = 0;
    let totalUncontrolledPM25 = 0;
    let totalControlledPM25 = 0;

    for (const act of activities) {
        const unc = uncontrolledEmission(act.activity, act.amount);
        const ctrl = applyControls(unc, act.controls || []);
        items.push({
            activity: act.activity,
            amount: act.amount,
            uncontrolled_pm10_kg: unc.pm10_kg,
            controlled_pm10_kg: ctrl.pm10_kg,
            uncontrolled_pm25_kg: unc.pm25_kg,
            controlled_pm25_kg: ctrl.pm25_kg,
            combined_efficiency: ctrl.combined_efficiency,
            applied_controls: ctrl.controls,
        });
        totalUncontrolledPM10 += unc.pm10_kg;
        totalControlledPM10 += ctrl.pm10_kg;
        totalUncontrolledPM25 += unc.pm25_kg;
        totalControlledPM25 += ctrl.pm25_kg;
    }

    return {
        items,
        total_uncontrolled_pm10_kg: totalUncontrolledPM10,
        total_controlled_pm10_kg: totalControlledPM10,
        total_uncontrolled_pm25_kg: totalUncontrolledPM25,
        total_controlled_pm25_kg: totalControlledPM25,
    };
}

/**
 * Estimates PM10 emission from unpaved haul roads using AP-42 §13.2.2 formula.
 * Estima emissão de PM10 em vias não pavimentadas pelo modelo AP-42 §13.2.2.
 *
 * E = k * s^a * (S/30)^b * (W/2.7)^c * (365-p)/365  [kg/VKT]
 *
 * Simplified version using tabulated k, a, b, c for general (non-coal) unpaved roads:
 * k=0.423, a=0.9, b=0.7, c=0.45, p=days with ≥0.254mm precipitation.
 *
 * @param {{ silt: number, speed_kmh: number, axleLoad_Mg: number, precipDays?: number }} params
 *   silt: silt content (%) of road surface / teor de material fino da via (%)
 *   speed_kmh: mean vehicle speed (km/h) / velocidade média dos veículos
 *   axleLoad_Mg: mean vehicle weight per axle (Mg) / carga média por eixo
 *   precipDays: annual days with precipitation ≥0.254 mm (default 50)
 * @returns {number} PM10 emission factor (kg/VKT)
 */
function unpavedRoadPM10Factor({
    silt,
    speed_kmh,
    axleLoad_Mg,
    precipDays = 50
}: any) {
    if (silt <= 0 || silt > 100) throw new RangeError(`silt must be in (0, 100], got ${silt}`);
    if (speed_kmh <= 0) throw new RangeError(`speed_kmh must be > 0, got ${speed_kmh}`);
    if (axleLoad_Mg <= 0) throw new RangeError(`axleLoad_Mg must be > 0, got ${axleLoad_Mg}`);
    if (precipDays < 0 || precipDays > 365) throw new RangeError(`precipDays must be in [0, 365], got ${precipDays}`);
    // AP-42 §13.2.2, Eq. 1 (general unpaved road parameters)
    const k = 0.423,
        a = 0.9,
        b = 0.7,
        c = 0.45;
    const emFactor = k * Math.pow(silt, a) * Math.pow(speed_kmh / 30, b) * Math.pow(axleLoad_Mg / 2.7, c);
    // Correção para dias secos (sem precipitação): (365 - p) / 365
    return (emFactor * (365 - precipDays)) / 365;
}

export {
    AP42_EMISSION_FACTORS,
    CONTROL_EFFICIENCIES,
    uncontrolledEmission,
    applyControls,
    emissionInventory,
    unpavedRoadPM10Factor,
};

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const miningDustEmissionMeta = {
    name: 'miningDustEmission',
    description: 'miningDustEmission',
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
