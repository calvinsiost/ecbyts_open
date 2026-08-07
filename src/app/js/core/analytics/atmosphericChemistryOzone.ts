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
 * Atmospheric Chemistry - Tropospheric Ozone
 *
 * References:
 * - Finlayson-Pitts, B.J. & Pitts, J.N. (2000). Chemistry of the Upper and Lower Atmosphere.
 *   Academic Press. ISBN 978-0122570605
 * - Carter, W.P.L. (1994). Development of ozone reactivity scales for volatile organic
 *   compounds. Air & Waste 44:881-899. DOI: 10.1080/1073161X.1994.10467290
 * - IPCC AR6 (2021). Chapter 6: Short-lived climate forcers.
 *   https://www.ipcc.ch/report/ar6/wg1/
 * - CETESB/CONAMA Resolução 491/2018 - padrões nacionais de qualidade do ar (Brasil).
 * - WHO Air Quality Guidelines (2021) - O₃ 8h average: 60 µg/m³.
 *
 * Zero dependências DOM/IDB/Three.js/fetch - módulo de cálculo puro.
 *
 * @module atmosphericChemistryOzone
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

interface OzoneAlertThreshold {
    max: number;
    label: string;
    description: string;
}

/**
 * MIR (Maximum Incremental Reactivity) values for common VOCs.
 * Valores MIR de Carter (1994) para compostos orgânicos voláteis típicos (g O₃ / g VOC).
 */
export const MIR_VALUES: Record<string, number> = {
    ethylene: 9.08,
    propylene: 11.66,
    isobutylene: 6.29,
    toluene: 4.0,
    xylene_m: 8.2,
    xylene_o: 7.64,
    xylene_p: 5.84,
    benzene: 0.72,
    formaldehyde: 7.18,
    acetaldehyde: 6.54,
    acetone: 0.36,
    methanol: 0.67,
    ethanol: 1.53,
    hexane: 1.24,
    isoprene: 10.61,
    terpene_alpha: 3.97,
};

/**
 * CETESB/CONAMA 491/2018 alert thresholds for surface ozone.
 * Limiares de alerta para ozônio superficial - CETESB/CONAMA 491/2018.
 * Units: µg/m³ (8-hour moving average)
 */
export const OZONE_ALERT_THRESHOLDS: Record<string, OzoneAlertThreshold> = {
    GOOD: { max: 100, label: 'Good', description: 'Air quality considered satisfactory' },
    MODERATE: { max: 160, label: 'Moderate', description: 'Acceptable; sensitive groups may be affected' },
    UNHEALTHY: { max: 200, label: 'Unhealthy', description: 'General public may experience health effects' },
    VERY_UNHEALTHY: {
        max: 400,
        label: 'Very Unhealthy',
        description: 'Health alert; everyone may experience serious effects',
    },
    HAZARDOUS: { max: Infinity, label: 'Hazardous', description: 'Health emergency conditions' },
};

/**
 * Compute Ozone Formation Potential (OFP) for a VOC mixture.
 * Calcula o Potencial de Formação de Ozônio de uma mistura de VOCs pelo método MIR.
 *
 * OFP_i = E_i × MIR_i
 * OFP_total = Σ OFP_i
 *
 * @param {Array<{compound: string, emission_g_h: number}>} vocList - List of VOCs with emissions in g/h
 * @returns {{ compounds: Array<{compound: string, OFP: number}>, totalOFP: number, unit: string }}
 */
export function ozonFormationPotential(vocList: Array<{ compound: string; emission_g_h: number }>): {
    compounds: Array<{ compound: string; emission_g_h: number; MIR: number; OFP: number }>;
    totalOFP: number;
    unit: string;
} {
    if (!Array.isArray(vocList) || vocList.length === 0) {
        throw new TypeError('vocList must be a non-empty array');
    }

    const compounds = vocList.map(({ compound, emission_g_h }) => {
        if (typeof compound !== 'string') throw new TypeError('compound must be a string');
        if (typeof emission_g_h !== 'number' || emission_g_h < 0) {
            throw new RangeError(`emission_g_h for ${compound} must be >= 0`);
        }
        const mir = MIR_VALUES[compound];
        if (mir === undefined) throw new RangeError(`Unknown VOC compound: "${compound}". Check MIR_VALUES.`);
        return { compound, emission_g_h, MIR: mir, OFP: emission_g_h * mir };
    });

    const totalOFP = compounds.reduce((sum, c) => sum + c.OFP, 0);

    return { compounds, totalOFP, unit: 'g O3/h' };
}

/**
 * Compute photochemical reactivity index for a VOC mixture.
 * Índice de reatividade fotoquímica ponderado pela fração mássica de cada VOC.
 *
 * PRI = Σ(MIR_i × f_i) where f_i = mass fraction of compound i
 *
 * @param {Array<{compound: string, mass_g: number}>} vocList - VOCs with masses in g
 * @returns {{ PRI: number, dominant: string, unit: string }}
 */
export function photochemicalReactivityIndex(vocList: Array<{ compound: string; mass_g: number }>): {
    PRI: number;
    dominant: string;
    unit: string;
} {
    if (!Array.isArray(vocList) || vocList.length === 0) {
        throw new TypeError('vocList must be a non-empty array');
    }

    const totalMass = vocList.reduce((s, v) => {
        if (typeof v.mass_g !== 'number' || v.mass_g < 0) throw new RangeError('mass_g must be >= 0');
        return s + v.mass_g;
    }, 0);

    if (totalMass <= 0) throw new RangeError('Total VOC mass must be > 0');

    let PRI = 0;
    let dominant = vocList[0]!.compound;
    let maxContrib = -Infinity;

    for (const { compound, mass_g } of vocList) {
        const mir = MIR_VALUES[compound];
        if (mir === undefined) throw new RangeError(`Unknown compound: "${compound}"`);
        const f = mass_g / totalMass;
        const contrib = mir * f;
        PRI += contrib;
        if (contrib > maxContrib) {
            maxContrib = contrib;
            dominant = compound;
        }
    }

    return { PRI, dominant, unit: 'g O3/g VOC (mass-weighted MIR)' };
}

/**
 * Estimate surface ozone concentration using simplified empirical box model.
 * Estima a concentração de O₃ na superfície com modelo de caixa empírico simplificado.
 *
 * Based on: Sillman (1999) Atmos. Environ. DOI: 10.1016/S1352-2310(98)00345-8
 * C_O3 (µg/m³) ≈ k_photo × OFP_total / (V_mix × k_dep + Q_dilution)
 *
 * @param {number} OFP_total_g_h - Total OFP (g O₃/h)
 * @param {Object} meteo - Meteorological parameters
 * @param {number} meteo.mixingHeight_m - Planetary boundary layer mixing height (m)
 * @param {number} meteo.areaKm2 - Source area (km²)
 * @param {number} [meteo.windSpeed_ms=3] - Wind speed (m/s)
 * @param {number} [meteo.depositionRate=0.005] - O₃ dry deposition rate (s⁻¹)
 * @returns {{ O3_ug_m3: number, O3_ppb: number }}
 */
export function estimateO3Concentration(
    OFP_total_g_h: number,
    meteo: { mixingHeight_m: number; areaKm2: number; windSpeed_ms?: number; depositionRate?: number },
): { O3_ug_m3: number; O3_ppb: number } {
    if (typeof OFP_total_g_h !== 'number' || OFP_total_g_h < 0) {
        throw new RangeError('OFP_total_g_h must be >= 0');
    }
    if (!meteo || typeof meteo !== 'object') throw new TypeError('meteo must be an object');
    const { mixingHeight_m, areaKm2, windSpeed_ms = 3, depositionRate = 0.005 } = meteo;
    if (typeof mixingHeight_m !== 'number' || mixingHeight_m <= 0) throw new RangeError('mixingHeight_m must be > 0');
    if (typeof areaKm2 !== 'number' || areaKm2 <= 0) throw new RangeError('areaKm2 must be > 0');

    // Volume da caixa atmosférica (m³)
    const V_m3 = mixingHeight_m * areaKm2 * 1e6;
    // Taxa de diluição por vento (s⁻¹): u / sqrt(Area)
    const L_m = Math.sqrt(areaKm2 * 1e6);
    const k_dilution = windSpeed_ms / L_m;
    // Emissão em g/s
    const emission_g_s = OFP_total_g_h / 3600;
    // Concentração em regime permanente (g/m³)
    const C_g_m3 = emission_g_s / (V_m3 * (depositionRate + k_dilution));
    const O3_ug_m3 = C_g_m3 * 1e6;
    // Conversão µg/m³ → ppb (O₃ MW = 48 g/mol; 1 ppb ≈ 2.0 µg/m³ a 25°C, 1 atm)
    const O3_ppb = O3_ug_m3 / 2.0;

    return { O3_ug_m3, O3_ppb };
}

/**
 * Classify ozone level according to CETESB/CONAMA 491/2018 alert framework.
 * Classifica o nível de ozônio conforme os padrões CETESB/CONAMA 491/2018.
 *
 * @param {number} O3_ug_m3 - Ozone concentration (µg/m³, 8-hour average)
 * @returns {{ level: string, label: string, description: string, health_risk: string }}
 */
export function classifyOzoneAlert(O3_ug_m3: number): {
    level: string;
    label: string;
    description: string;
    health_risk: string;
} {
    if (typeof O3_ug_m3 !== 'number' || O3_ug_m3 < 0) {
        throw new RangeError('O3_ug_m3 must be >= 0');
    }

    // Risco à saúde por nível - baseado em WHO 2021 e CONAMA 491/2018
    const health =
        O3_ug_m3 <= 100
            ? 'Minimal risk. No restrictions.'
            : O3_ug_m3 <= 160
              ? 'Sensitive groups (elderly, children, asthmatics) may experience symptoms.'
              : O3_ug_m3 <= 200
                ? 'Respiratory irritation for general population; reduce outdoor activity.'
                : O3_ug_m3 <= 400
                  ? 'Serious respiratory effects; avoid prolonged outdoor exertion.'
                  : 'Emergency: remain indoors; medical assistance may be required.';

    const level =
        O3_ug_m3 <= OZONE_ALERT_THRESHOLDS.GOOD!.max
            ? 'GOOD'
            : O3_ug_m3 <= OZONE_ALERT_THRESHOLDS.MODERATE!.max
              ? 'MODERATE'
              : O3_ug_m3 <= OZONE_ALERT_THRESHOLDS.UNHEALTHY!.max
                ? 'UNHEALTHY'
                : O3_ug_m3 <= OZONE_ALERT_THRESHOLDS.VERY_UNHEALTHY!.max
                  ? 'VERY_UNHEALTHY'
                  : 'HAZARDOUS';

    const { label, description } = OZONE_ALERT_THRESHOLDS[level]!;

    return { level, label, description, health_risk: health };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const atmosphericChemistryOzoneMeta: AnalyticsModuleMeta = {
    name: 'atmosphericChemistryOzone',
    description: 'atmosphericChemistryOzone',
    category: 'analytics',
    familyTags: ['atmosphere'],
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
